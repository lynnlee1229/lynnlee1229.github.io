'use strict';
const zh=document.documentElement.lang==='zh-CN';
const say=(en,cn)=>zh?cn:en;
const base='/distributed-compute-lab/';
const fmt=n=>Number(n).toLocaleString(zh?'zh-CN':'en-US',{maximumFractionDigits:2});
const bytes=n=>n>=1048576?`${fmt(n/1048576)} MiB`:`${fmt(n)} B`;
function el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;}
const calc=document.querySelector('#cost-model');
if(calc){
 const update=()=>{const p=Number(document.querySelector('#slots').value),n=Number(document.querySelector('#parts').value);
 const work=800,serial=200,overhead=5,waves=Math.ceil(n/p),time=serial+waves*(work/n+overhead);
 document.querySelector('#slots-value').textContent=p;document.querySelector('#parts-value').textContent=n;
 document.querySelector('#model-output').textContent=say('Illustrative estimate: ','示意估算：')+fmt(time)+' ms';
 document.querySelector('#model-detail').textContent=`200 + ceil(${n}/${p}) × (800/${n} + 5) = ${fmt(time)} ms. `+say('Equal tasks, serialized preparation, per-task overhead; no real execution.','等长任务、串行准备与每任务开销；未执行真实计算。');};
 calc.addEventListener('input',update);update();
}
const read=document.querySelector('#mark-read');
if(read){const key='dcl-read-'+read.dataset.chapter;let done=false;try{done=localStorage.getItem(key)==='true';}catch{}
 const paint=()=>{read.textContent=done?say('✓ Marked as read','✓ 已读'):say('Mark chapter as read','标记本章已读');read.setAttribute('aria-pressed',String(done));};
 read.addEventListener('click',()=>{done=!done;try{localStorage.setItem(key,String(done));}catch{}paint();});paint();}
const viewer=document.querySelector('#evidence-viewer');
if(viewer){let report=null;const select=document.querySelector('#experiment'),warm=document.querySelector('#warmup'),runSelect=document.querySelector('#run-select');
 const status=document.querySelector('#status');
 function table(headers,rows){const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(v=>r.append(el('td',v)));body.append(r);});t.append(body);return t;}
 function drawRun(){if(!report)return;const run=report.runs[Number(runSelect.value)];if(!run)return;
  document.querySelector('#run-result').textContent=JSON.stringify(run.result,null,2);
  const own=report.tasks.filter(t=>t.groups.includes(run.group));
  document.querySelector('#task-table').replaceChildren(table(
   [say('Stage','阶段'),say('Partition','分区'),say('Attempt','尝试'),say('Reason','结果'),'ms',say('Shuffle write','Shuffle 写出'),say('Disk Spill','磁盘 Spill')],
   own.map(t=>[t.stage,t.partition,t.attempt,t.reason,fmt(t.duration_ms),bytes(t.shuffle_write_bytes),bytes(t.disk_spill_bytes)])));
  const bins=run.result?.partition_rows,hist=document.querySelector('#histogram');hist.replaceChildren();
  const adaptive=document.querySelector('#adaptive-evidence');adaptive.hidden=!run.adaptive;
  if(run.adaptive){document.querySelector('#adaptive-metrics').textContent=JSON.stringify({adaptive:run.adaptive,stage_metrics:run.stage_metrics,output_sha256:run.output_sha256},null,2);
   document.querySelector('#plans').textContent=['before','after'].map(phase=>`— ${run.group}: ${phase} —\n${report.plans[run.group+':'+phase]}`).join('\n\n');}
  if(bins){hist.append(el('h3',say('Join output rows per partition','各分区 Join 输出行数')));const bars=el('div');bars.className='bars';bars.setAttribute('aria-label',bins.join(', '));
   const max=Math.max(...bins,1);bins.forEach((n,i)=>{const b=el('div');b.className='bar';b.style.setProperty('--height',(100*n/max)+'%');b.title=`p${i}: ${n}`;bars.append(b);});hist.append(bars,el('p',bins.map((n,i)=>`p${i}: ${fmt(n)}`).join(' · ')));}
 }
 function draw(){const visible=report.runs.filter(r=>warm.checked||!r.warmup);
  document.querySelector('#runs-table').replaceChildren(table(
   [say('Variant / repeat','方案 / 次数'),say('Wall ms','墙钟 ms'),say('Tasks','任务'),say('Shuffle write','Shuffle 写出'),say('Disk Spill','磁盘 Spill'),say('Failed','失败尝试'),say('Final partitions','最终分区')],
   visible.map(r=>[`${r.variant} / ${r.warmup?say('warm-up','预热'):r.repeat+1}`,fmt(r.wall_ms),r.metrics.tasks,bytes(r.metrics.shuffle_write_bytes),bytes(r.metrics.disk_spill_bytes),r.metrics.failed_attempts,r.adaptive?.output_partitions??'—'])));
  const metrics=document.querySelector('#summary');metrics.replaceChildren();Object.entries(report.summary).forEach(([name,s])=>{const box=el('div');box.className='metric';box.append(el('span',name),el('strong',fmt(s.median_wall_ms)+' ms'),el('span',`${s.repeats} × · ${fmt(s.min_wall_ms)}–${fmt(s.max_wall_ms)} ms`));metrics.append(box);});
  document.querySelector('#environment').textContent=JSON.stringify({created_utc:report.created_utc,input:report.input,environment:report.environment,observations:report.observations},null,2);
  document.querySelector('#plans').textContent=Object.entries(report.plans).map(([k,v])=>`— ${k} —\n${v}`).join('\n\n')||say('No physical plan saved for this RDD arithmetic probe.','该 RDD 算术探针没有保存物理计划。');
  runSelect.replaceChildren();visible.forEach(r=>{const option=el('option',r.group+(r.warmup?say(' (warm-up)','（预热）'):''));option.value=report.runs.indexOf(r);runSelect.append(option);});drawRun();
 }
 let request=0;async function load(){const current=++request;status.textContent=say('Loading recorded evidence…','正在读取保存的证据…');try{
   const res=await fetch(base+'results/'+select.value+'.json');if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(current!==request)return;report=data;
   document.querySelector('#download-result').href=base+'results/'+select.value+'.json';
   draw();status.textContent=say('Saved real execution. Nothing runs on your device when selecting a report.','真实执行的保存记录。选择报告不会在你的设备运行实验。');
  }catch(e){if(current===request)status.textContent=say('Unable to load evidence: ','无法加载证据：')+e.message;}}
 const requested=new URLSearchParams(location.search).get('experiment');if([...select.options].some(x=>x.value===requested))select.value=requested;
 select.addEventListener('change',load);warm.addEventListener('change',()=>report&&draw());runSelect.addEventListener('change',drawRun);load();
}
const resourceSearch=document.querySelector('#resource-search');
if(resourceSearch){const items=[...document.querySelectorAll('[data-resource]')],count=document.querySelector('#resource-count');
 const update=()=>{const tokens=resourceSearch.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);let shown=0;
  for(const item of items){const text=item.textContent.toLocaleLowerCase();item.hidden=!tokens.every(word=>text.includes(word));if(!item.hidden)shown++;}
  count.textContent=say('Matching catalogue entries: ','匹配目录项：')+shown+' / '+items.length;};
 resourceSearch.addEventListener('input',update);update();}
