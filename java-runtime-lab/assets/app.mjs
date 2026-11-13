import {validate,stateFromSearch,series,stepPath} from './core.mjs';
const zh=document.documentElement.lang==='zh-CN', tr=(en,cn)=>zh?cn:en, el=id=>document.getElementById(id);
let state=stateFromSearch(location.search),data=null,current=null,loadSequence=0;
const names={abort:tr('Abort','抛出拒绝异常'),'caller-runs':tr('Caller runs','调用方执行'),'wait-only':tr('Wait timeout only','仅等待方超时'),'ignore-interrupt':tr('Cancel · ignores interrupt','取消 · 忽略中断'),cooperative:tr('Cancel · cooperates','取消 · 响应中断'),'no-retry':tr('No retry','不重试'),'unbounded-policy':tr('Unbounded policy','无重试次数上限'),'bounded-backoff':tr('Bounded + backoff','有限重试 + 退避')};
function sync(){const p=new URLSearchParams({run:state.run,view:state.view,policy:state.policy,task:state.task});history.replaceState(null,'','?'+p);document.querySelectorAll('[data-language]').forEach(a=>{a.href=a.dataset.base+'?'+p});}
function metric(n,label){return `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`}
function table(headers,rows){return `<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function download(value,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function safeText(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function draw(){
 if(!data)return;
 const group=state.view==='pool'?data.pools:state.view==='timeout'?data.cancellation:data.retries;
 if(!group.some(x=>(x.policy||x.mode)===state.policy))state.policy=group[0].policy||group[0].mode;
 current=group.find(x=>(x.policy||x.mode)===state.policy);el('policy').innerHTML=group.map(x=>{const id=x.policy||x.mode;return `<option value="${id}">${names[id]}</option>`}).join('');el('policy').value=state.policy;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
 el('case-title').textContent=state.view==='pool'?tr('Bound the queue. Observe the caller.','限制队列，观察调用方。'):state.view==='timeout'?tr('The waiter returned. The task may still be alive.','等待方已返回，任务仍可能运行。'):tr('Count attempts, not just requests.','除了请求数，也要数下游尝试。');
 let chart='',summary='',rows='';
 if(state.view==='pool'){
  summary=metric(current.submitted,tr('Submitted','提交数'))+metric(current.completed,tr('Completed','完成数'))+metric(current.rejected,tr('Rejected','拒绝数'));
  const events=current.events,maxX=events.at(-1).ms;
  chart=`<div class="legend"><span><i class="dot"></i>${tr('Queue depth (capacity 3)','队列深度（容量 3）')}</span><span><i class="dot amber"></i>${tr('Executor active (≤ 2)','线程池活跃数（≤ 2）')}</span></div><svg class="chart" viewBox="0 0 820 190" role="img" aria-label="${tr('Event-sampled executor queue and active worker counts','事件采样的线程池队列与活跃数')}"><path d="${stepPath(series(events,'queue'),maxX,3)}" fill="none" stroke="#087f79" stroke-width="2.5"/><path d="${stepPath(series(events,'active'),maxX,3)}" fill="none" stroke="#a45414" stroke-width="2"/><text x="5" y="24">3</text><text x="5" y="160">0</text><text x="40" y="183">0 ms</text><text x="680" y="183">${maxX.toFixed(1)} ms</text></svg>`;
  rows=table([tr('Policy','策略'),tr('Started / done','开始 / 完成'),tr('Overflow / caller','饱和 / 调用方'),tr('p50 / p95 ms','p50 / p95 毫秒')],data.pools.map(p=>[names[p.policy],`${p.started} / ${p.completed}`,`${p.overflow} / ${p.callerRuns}`,`${p.p50ms} / ${p.p95ms}`]));
  el('explanation').textContent=tr('18 submissions, 2 workers, queue capacity 3, 2 ms delay after each execute(), 60 ms local sleep. CallerRuns blocks the submitting thread and changes actual arrival times. Active counts exclude the caller. Curves sample task events; they are not continuous monitoring. Latency is submitted → completed for completed tasks only.','18 次提交、2 个工作线程、队列容量 3，每次 execute() 后等待 2 毫秒，任务本地 sleep 60 毫秒。CallerRuns 阻塞提交线程，因此实际到达时间改变。活跃数不含调用方。曲线来自任务事件采样，并非连续监测。延迟仅统计完成任务的提交至完成时间。');
 }else if(state.view==='timeout'){
  summary=metric(current.waiterReturnedMs.toFixed(1),tr('Waiter returned · ms','等待方返回 · 毫秒'))+metric(current.workExitedMs.toFixed(1),tr('Work exited · ms','工作退出 · 毫秒'))+metric(current.workAfterWaiterMs.toFixed(1),tr('Work after timeout · ms','超时后继续 · 毫秒'));
  const max=Math.max(...data.cancellation.map(c=>c.workExitedMs))*1.05;
  chart='<div class="legend"><span><i class="dot"></i>'+tr('Work lifetime','工作生命周期')+'</span><span><i class="dot" style="background:var(--red)"></i>'+tr('Waiter timeout','等待方超时')+'</span><span><i class="dot amber"></i>'+tr('Cancel signal','取消信号')+'</span></div><div class="timeline">'+data.cancellation.map(c=>{const start=c.events.find(e=>e.state==='started').ms;return `<div class="timeline-row"><span>${names[c.mode]}</span><div class="track" aria-label="${safeText(names[c.mode])}: ${c.workExitedMs} ms"><div class="workbar" style="left:${start/max*100}%;width:${(c.workExitedMs-start)/max*100}%"></div><i class="marker" style="left:${c.waiterReturnedMs/max*100}%"></i>${c.cancelSignalMs>=0?`<i class="marker cancel" style="left:${c.cancelSignalMs/max*100}%"></i>`:''}</div></div>`}).join('')+'</div>';
  rows=table([tr('Path','路径'),tr('Waiter ms','等待方毫秒'),tr('Exit ms','退出毫秒'),tr('Future cancelled','Future 已取消'),tr('Interrupt seen','观察到中断')],data.cancellation.map(c=>[names[c.mode],c.waiterReturnedMs,c.workExitedMs,String(c.futureCancelled),String(c.interruptObserved)]));
  el('explanation').textContent=tr('The worker signals a start barrier before Future.get(40 ms). Its finite budget is 240 ms. cancel(true) attempts interruption; Future cancellation state does not prove the task exited. Ignoring interruption is a deliberate finite control. Each row has its own monotonic clock; scheduling adds small variation.','工作线程通过启动屏障后调用 Future.get(40 毫秒)，工作预算为 240 毫秒。cancel(true) 尝试中断；Future 取消状态不能证明任务已退出。忽略中断是有界对照。每行使用各自的单调时钟，调度会造成少量波动。');
 }else{
  summary=metric(current.requests,tr('Original requests','原始请求'))+metric(current.attempts,tr('Downstream attempts','下游尝试'))+metric(current.amplification+'×',tr('Attempt amplification','尝试放大倍数'));
  const max=Math.max(...data.retries.map(r=>r.attempts));chart='<div class="legend">'+tr('Actual attempt counts, same seeded failure schedule','相同种子失败序列的实际尝试数')+'</div>'+data.retries.map(r=>`<div class="bar-row"><span>${names[r.policy]}</span><div><div class="bar" style="width:${r.attempts/max*100}%"></div></div><span>${r.attempts}</span></div>`).join('');
  rows=table([tr('Policy','策略'),tr('Success / failed','成功 / 失败'),tr('Attempts / request','尝试 / 请求'),tr('Backoff actual ms','实际退避毫秒')],data.retries.map(r=>[names[r.policy],`${r.success} / ${r.failed}`,r.amplification,r.backoffActualMs]));
  el('explanation').textContent=tr('Sequential requests, 2 ms synthetic service per attempt. Even request IDs fail 0–2 times by seed; odd IDs fail the configured count, then recover. The unbounded policy retries until success and has an external 2 s/request watchdog; it is not tested against infinite failure. Bounded policy allows 3 attempts total with 5/10 ms + seeded 0–3 ms jitter. Fewer attempts trade off against failed requests.','串行请求，每次尝试合成服务耗时 2 毫秒。偶数请求按种子失败 0–2 次；奇数请求失败配置次数后恢复。无次数上限策略重试至成功，外部每请求 2 秒看门狗只防挂死，不代表已验证永久失败。有限策略最多尝试 3 次，退避 5/10 毫秒加种子生成的 0–3 毫秒抖动。减少尝试同时可能增加请求失败。');
 }
 el('metrics').innerHTML=summary;el('chart').innerHTML=chart;el('comparison').innerHTML=rows;
 const tasks=[...new Set(current.events.map(e=>e.task))];if(state.task!=='all'&&!tasks.includes(Number(state.task)))state.task='all';
 el('task').innerHTML=`<option value="all">${tr('All tasks','所有任务')}</option>`+tasks.map(t=>`<option value="${t}">${tr('Task','任务')} ${t}</option>`).join('');el('task').value=state.task;
 const events=current.events.filter(e=>state.task==='all'||e.task===Number(state.task));
 el('events').innerHTML=table(['#','ms',tr('Task','任务'),tr('Transition','状态转换'),tr('Details','详情')],events.slice(0,120).map(e=>[e.seq,e.ms,e.task,safeText(e.state),safeText(JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k])=>!['seq','ms','task','state'].includes(k)))))]));
 el('event-count').textContent=tr(`Showing ${Math.min(120,events.length)} of ${events.length} events; export includes all events.`,`显示 ${Math.min(120,events.length)} / ${events.length} 条事件；导出包含完整记录。`);
 el('environment').textContent=JSON.stringify({recordedAt:data.recordedAt,seed:data.seed,environment:data.environment,jfr:data.jfr},null,2);
 el('status').textContent=tr('Saved JVM measurement · all lifecycle assertions passed · raw JFR stays local','保存的 JVM 实测 · 生命周期断言全部通过 · 原始 JFR 保留本地');sync();
}
async function load(){
 const sequence=++loadSequence; data=null; el('workspace').hidden=true; el('status').classList.remove('error');
 try{
  el('status').textContent=tr('Loading recorded evidence…','加载实测记录…');
  const r=await fetch(`../assets/run-${state.run}.json`); if(!r.ok)throw Error('HTTP '+r.status);
  const candidate=validate(await r.json()); if(sequence!==loadSequence)return;
  data=candidate;el('workspace').hidden=false;draw();
 }catch(e){if(sequence!==loadSequence)return;data=null;el('status').textContent=tr('Evidence unavailable: ','实测记录不可用：')+e.message;el('status').classList.add('error');el('workspace').hidden=true;}
}
el('run').value=state.run;el('run').addEventListener('change',()=>{state.run=el('run').value;load()});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;state.policy='';state.task='all';draw()}));
el('policy').addEventListener('change',()=>{state.policy=el('policy').value;state.task='all';draw()});el('task').addEventListener('change',()=>{state.task=el('task').value;draw()});
el('download').addEventListener('click',()=>data&&download(data,`java-runtime-run-${state.run}.json`));el('export-case').addEventListener('click',()=>current&&download({recordType:data.recordType,recordedAt:data.recordedAt,environment:data.environment,config:data.config,scenario:current},`java-runtime-${state.view}-${state.policy}.json`));el('share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);el('share').textContent=tr('Link copied','已复制链接')}catch{el('share').textContent=tr('Copy this page URL','请复制当前地址栏链接')}});load();
