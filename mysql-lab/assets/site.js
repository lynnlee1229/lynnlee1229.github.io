'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const zh = document.documentElement.lang.startsWith('zh');
  const tr = (en,cn) => zh ? cn : en;
  const params = new URLSearchParams(location.search);
  let record = null;
  let activeRecord = ['clean','repeat'].includes(params.get('record')) ? params.get('record') : 'clean';
  let activeCase = ['deadlock','control','rc','rr'].includes(params.get('case')) ? params.get('case') : 'deadlock';
  let activeVariant = params.get('variant') || 'full_scan';
  let initialStep = Number(params.get('step'));
  const make = (tag,text,className) => {const el=document.createElement(tag); if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  function table(headers,rows) {
    const wrap=make('div',undefined,'table-scroll'), tab=make('table'), head=make('thead'), hr=make('tr'), body=make('tbody');
    for(const h of headers){const th=make('th',h);th.scope='col';hr.append(th);}head.append(hr);
    for(const row of rows){const r=make('tr');for(const c of row)r.append(make('td',String(c??'')));body.append(r);}
    tab.append(head,body);wrap.append(tab);return wrap;
  }
  function timelineCase(){return activeCase==='deadlock'?record.deadlock:activeCase==='control'?record.ordered_control:record.isolation[activeCase==='rc'?0:1];}
  function urlUpdate(){
    const p=new URLSearchParams({record:activeRecord,case:activeCase,step:$('step').value,variant:activeVariant});
    history.replaceState(null,'',location.pathname+'?'+p+location.hash);
    const language=document.querySelector('[data-language]');const u=new URL(language.href);u.search=p;u.hash=location.hash;language.href=u;
  }
  function renderStep(){
    if(!record)return;
    const events=timelineCase().timeline, n=Number($('step').value);
    $('step-label').textContent=n+' / '+events.length;
    $('timeline-list').replaceChildren(...events.slice(0,n).map((ev,i)=>{
      const li=make('li',undefined,i===n-1?'current':'');
      li.append(make('span',`${ev.step.toString().padStart(2,'0')}  ${ev.elapsed_ms.toFixed(3)} ms  ·  ${ev.actor}`,'meta'));
      li.append(make('div',ev.action));
      if(ev.sql)li.append(make('code',ev.sql));
      if(ev.rows?.length)li.append(make('code',JSON.stringify(ev.rows)));
      if(ev.errno)li.append(make('code','MySQL errno '+ev.errno));
      return li;
    }));
    $('previous').disabled=n<=1;$('next').disabled=n>=events.length;
    urlUpdate();
  }
  function renderTimeline(preserve=false){
    const c=timelineCase(), snap=c.snapshot_before_cycle||c.snapshot||c.writer_wait_snapshot;
    $('snapshot-note').textContent=(activeCase==='deadlock'?tr('Snapshot before cycle closure; the detector immediately resolves the complete cycle. Its evidence is in the deadlock excerpt. ','成环前快照；检测器会立即解除完整环，完整环的证据见死锁摘录。 '):activeCase==='control'?tr('B waits for A while both follow the same a → b order. A commits before B proceeds; both transactions commit. ','双方均按 a → b 顺序加锁，B 等待 A，A 提交后 B 继续，双方均提交。 '):tr('After A reads FOR UPDATE, B’s update to 300 waits on A’s row lock. A’s COMMIT releases it. ','A 执行 FOR UPDATE 后，B 更新为 300 的语句等待 A 的行锁；A 提交后释放。 '))+tr('Thread IDs are mapped to A/B; memory-address lock IDs are excluded.','线程 ID 映射为 A/B，不公开内存地址形式的锁 ID。');
    $('step').max=c.timeline.length;
    $('step').value=preserve?Math.min(Number($('step').value),c.timeline.length):Number.isInteger(initialStep)&&initialStep>0?Math.min(initialStep,c.timeline.length):c.timeline.length;
    initialStep=NaN;
    $('wait-edges').replaceChildren(...snap.waits.map(w=>make('div',`${w.waiting_actor} → ${w.blocking_actor} / ${w.table_name} / ${w.index_name} / ${w.requested_mode}`,'waiting')));
    $('lock-table').replaceChildren(table([tr('Actor','会话'),tr('Table','表'),'Index',tr('Type','类型'),tr('Mode','锁模式'),tr('Status','状态'),tr('Data','键值')],snap.locks.map(x=>[x.actor,x.OBJECT_NAME,x.INDEX_NAME,x.LOCK_TYPE,x.LOCK_MODE,x.LOCK_STATUS,x.LOCK_DATA])));
    renderStep();
  }
  function renderQuery(){
    if(!record)return;
    const variants=record.indexes.variants;
    if(!variants.some(v=>v.id===activeVariant))activeVariant=variants[0].id;
    const v=variants.find(v=>v.id===activeVariant);
    $('variant-select').value=v.id;
    $('query-sql').textContent=v.sql;
    $('analyze-plan').textContent=v.explain_analyze;
    $('json-plan').textContent=JSON.stringify(v.explain_json,null,2);
    $('query-rows').textContent=JSON.stringify({timings_ms:v.timings_ms,distribution_ms:v.distribution_ms,result_sha256:v.result_sha256,rows:v.rows},null,2);
    $('query-summary').textContent=tr('Rows','返回行数')+`: ${v.result_rows} · median ${v.distribution_ms.median} ms · p95 ${v.distribution_ms.p95_nearest_rank} ms`;
    const max=Math.max(...variants.map(x=>x.distribution_ms.median));
    $('timing-bars').replaceChildren(...variants.map(x=>{
      const row=make('div',undefined,'barrow'+(x.id===v.id?' selected':''));
      const label=make('span',x.id),track=make('div',undefined,'bartrack'),bar=make('div',undefined,'bar');
      bar.style.width=(100*x.distribution_ms.median/max)+'%';track.append(bar);
      row.append(label,track,make('span',x.distribution_ms.median.toFixed(3)));return row;
    }));
    urlUpdate();
  }
  async function load(){
    record=null;
    $('download-json').href=`/mysql-lab/records/run-${activeRecord}.json`;
    $('record-status').classList.remove('error');
    $('record-status').textContent=tr('Loading saved evidence…','正在读取保存证据…');
    for(const id of ['export-csv','share','case-select','variant-select','step','previous','next'])$(id).disabled=true;
    try{
      const response=await fetch(`/mysql-lab/records/run-${activeRecord}.json`);
      if(!response.ok)throw Error('HTTP '+response.status);
      const r=await response.json();
      if(r.format!=='mysql-lab-run/v1'||r.assertions_passed!==true||!r.deadlock?.snapshot_before_cycle?.waits?.length||r.indexes?.variants?.length!==4||!r.isolation?.length)throw Error('Invalid or empty record');
      for(const v of r.indexes.variants)if(v.timings_ms?.length!==7||!Number.isFinite(v.distribution_ms?.median)||v.result_rows<1)throw Error('Missing measurements');
      record=r;
      document.querySelector('.metrics').hidden=false;
      $('record-status').textContent=tr('Saved real run, not a live server. ','真实运行的保存记录，并非在线数据库。 ')+r.recorded_at+' · MySQL '+r.environment.version;
      $('download-json').href=`/mysql-lab/records/run-${activeRecord}.json`;
      $('outcomes').replaceChildren(table([tr('Case','场景'),'A','B'],[['Cycle',r.deadlock.outcomes.A.status,r.deadlock.outcomes.B.status],['Same order',r.ordered_control.outcomes.A,r.ordered_control.outcomes.B]]));
      $('deadlock-excerpt').textContent=r.deadlock.deadlock_excerpt.join('\n');
      $('isolation-table').replaceChildren(table([tr('Isolation','隔离级别'),tr('First plain read','首次普通读'),tr('After B commits','B 提交后普通读'),'FOR UPDATE',tr('Plain read again','再一次普通读')],r.isolation.map(x=>[x.level,x.ordinary_first,x.ordinary_after_B_commit,x.locking_read,x.ordinary_after_locking_read])));
      for(const id of ['export-csv','share','case-select','variant-select','step'])$(id).disabled=false;
      renderTimeline();renderQuery();
    }catch(err){
      document.querySelector('.metrics').hidden=true;
      $('record-status').classList.add('error');
      $('record-status').textContent=tr('Failed to load the selected record. No measurements are shown as current. Reload or download the original JSON. ','所选记录加载失败。不会把其他测量显示为当前结果。请重新加载或下载原始 JSON。 ')+err.message;
      for(const id of ['timeline-list','lock-table','wait-edges','timing-bars','outcomes','isolation-table'])$(id).replaceChildren();
      for(const id of ['analyze-plan','json-plan','query-rows','query-sql','deadlock-excerpt','query-summary'])$(id).textContent='—';
    }
  }
  $('record-select').value=activeRecord;$('case-select').value=activeCase;
  $('record-select').addEventListener('change',()=>{activeRecord=$('record-select').value;load();});
  $('case-select').addEventListener('change',()=>{activeCase=$('case-select').value;renderTimeline();});
  $('variant-select').addEventListener('change',()=>{activeVariant=$('variant-select').value;renderQuery();});
  $('step').addEventListener('input',renderStep);
  window.addEventListener('hashchange',()=>{if(record)urlUpdate();});
  $('previous').addEventListener('click',()=>{$('step').value=Number($('step').value)-1;renderStep();});
  $('next').addEventListener('click',()=>{$('step').value=Number($('step').value)+1;renderStep();});
  $('share').addEventListener('click',async()=>{urlUpdate();try{await navigator.clipboard.writeText(location.href);$('share').textContent=tr('Link copied','链接已复制');}catch{$('share').textContent=tr('Copy the address bar URL','请复制地址栏链接');}});
  $('export-csv').addEventListener('click',()=>{
    if(!record)return;
    const lines=['record,variant,sample,client_ms,result_rows,result_sha256'];
    for(const v of record.indexes.variants)v.timings_ms.forEach((n,i)=>lines.push([activeRecord,v.id,i+1,n,v.result_rows,v.result_sha256].join(',')));
    const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));
    const a=make('a');a.href=url;a.download=`mysql-lab-${activeRecord}-query-samples.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  load();
})();
