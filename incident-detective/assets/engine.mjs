import {cases,b} from './cases.mjs';
export const VERSION='1.0.0';
export const getCase=id=>cases.find(c=>c.id===id);
export const initial=()=>({opened:[],notes:{},citations:[],runs:[],prediction:null,diagnosis:'',action:'',closed:false});
export const spent=(c,s)=>s.opened.reduce((n,id)=>n+(c.evidence.find(e=>e.id===id)?.cost||0),0)+(s.runs.length?c.probe.cost:0);
export function acquire(c,s,id){
 const e=c.evidence.find(x=>x.id===id); if(!e)throw Error('unknown-evidence');
 if(s.opened.includes(id))return s; if(s.closed)throw Error('case-closed');
 if(spent(c,s)+e.cost>c.budget)throw Error('budget');
 return {...s,opened:[...s.opened,id]};
}
function queueModel(cap){
 const active=[],waiting=[];let rejected=0,accepted=0,maxWait=0,maxQueue=0;
 // Event-time simulation, exact 2 ms arrivals and 60 ms service, two slots.
 for(let i=0;i<18;i++){
  const t=i*2;
  while(active.length&&Math.min(...active)<=t){
   const end=Math.min(...active);active.splice(active.indexOf(end),1);
   if(waiting.length){const arrival=waiting.shift();maxWait=Math.max(maxWait,end-arrival);active.push(end+60);}
  }
  if(active.length<2){active.push(t+60);accepted++;}
  else if(waiting.length<cap){waiting.push(t);accepted++;maxQueue=Math.max(maxQueue,waiting.length);}
  else rejected++;
 }
 while(waiting.length){const end=Math.min(...active);active.splice(active.indexOf(end),1);const arrival=waiting.shift();maxWait=Math.max(maxWait,end-arrival);active.push(end+60);}
 return {accepted,rejected,maxWait,maxQueue,lastExit:Math.max(...active)};
}
export function simulate(c,values){
 const p={};for(const f of c.probe.fields){const v=String(values[f.id]??f.options[0][0]);if(!f.options.some(o=>o[0]===v))throw Error('invalid-control');p[f.id]=v;}
 let baseline,trial,discriminating=false,summary,chart=null;
 switch(c.probe.type){
 case 'join':{
  const dist={shuffle:[5524,6969,6105,6914,5428,197242,5333,6485],broadcast:Array(8).fill(30000),salted:[30098,78149,53803,5770,6048,30027,6026,30079]};
  const vals=x=>({rows:240000,weighted_sum:384001,max_partition:Math.max(...dist[x]),shuffle_bytes:{shuffle:1435410,broadcast:0,salted:2227229}[x]});
  baseline=vals('shuffle');trial=vals(p.strategy);chart=dist[p.strategy];discriminating=p.strategy!=='shuffle';
  summary=b('Replay of saved output counts. Equal checksums constrain correctness; these values do not predict multi-host speed.','保存输出计数的重放。相等校验值约束正确性，这些值不预测多机速度。');break;}
 case 'pool':baseline=queueModel(3);trial=queueModel(+p.queue);discriminating=p.queue==='18';summary=b('Ideal scheduler only. Service capacity stays at two workers; maximum queue wait changes from 112 to 448 ms.','仅理想调度器。服务容量仍为双线程，最大排队时间从 112 变成 448 ms。');break;
 case 'deadline':{
  const exit=p.propagate==='yes'&&p.cooperate==='yes'?40:240;
  baseline={response_ms:40,work_exit_ms:240,orphan_ms:200};trial={response_ms:40,work_exit_ms:exit,orphan_ms:exit-40};discriminating=p.propagate==='yes';summary=b('Ideal lifecycle model. A flag is not an exit event. No real remote operation is cancelled.','理想生命周期模型。标记不是退出事件，不会取消真实远端操作。');break;}
 case 'window':{
  const counters={'old-all':[12,1000],'now-all':[10,1000],'now-canary':[0,20]};const aligned=p.numerator===p.denominator;
  baseline={fraction:'12 / 20',rate:'invalid / 不可解释',threshold:'5%'};trial={fraction:`${counters[p.numerator][0]} / ${counters[p.denominator][1]}`,rate:aligned?`${100*counters[p.numerator][0]/counters[p.denominator][1]}%`:'invalid / 不可解释',threshold:'5%',scope:p.denominator};discriminating=p.numerator==='now-all'&&p.denominator==='now-all';summary=aligned?b('Counter time and scope match. This rate applies only to the selected population and window.','计数时间与口径一致。比率只适用于所选群体和窗口。'):b('Different windows or scopes: do not interpret the quotient as an error rate.','时间或口径不同：不可将商解释为错误率。');break;}
 case 'locks':{
  const short=p.scope==='outside',cycle=p.order==='opposite';baseline={edges:'B → A',cycle:'no',holder_ms:8020,outcome:'A + B commit'};trial={edges:cycle?'A → B → A':'B → A',cycle:cycle?'yes':'no',holder_ms:short?20:8020,outcome:cycle?'one victim rolls back':'A + B commit'};discriminating=!cycle&&short;summary=b('Deterministic schedule. Opposite order creates a counterfactual cycle; it does not reclassify the original one-way wait. Holder time excludes the remote call when it is moved before BEGIN.','确定性调度。相反顺序产生反事实环，不重新分类原来的单向等待。远程调用移至 BEGIN 前后，不再计入持锁时间。');break;}
 case 'retry':{
  const wanted=12*(+p.outer)*(+p.inner),attempts=p.cap==='0'?wanted:Math.min(wanted,+p.cap);baseline={requests:12,attempts:108,amplification:'9×',successes:0};trial={requests:12,attempts,amplification:`${attempts/12}×`,successes:0,jitter:p.jitter};discriminating=(p.outer==='1'||p.inner==='1')&&p.cap==='24';summary=b('All attempts fail in this fixture. The global cap is an upper bound, not a fair per-request allocation. Jitter does not change this count.','本例所有尝试均失败。总上限仅是上界，不代表公平的每请求分配。抖动不改变这个计数。');break;}
 default:throw Error('unknown-probe');
 }
 return {values:p,baseline,trial,discriminating,summary,chart};
}
export function runProbe(c,s,values,prediction){
 if(s.closed)throw Error('case-closed');if(!Number.isInteger(prediction)||prediction<0||prediction>=c.probe.predictions.length)throw Error('prediction');
 if(!s.runs.length&&spent(c,s)+c.probe.cost>c.budget)throw Error('budget');
 const result=simulate(c,values);const first=s.runs.length===0;
 return {...s,prediction:first?prediction:s.prediction,runs:[...s.runs.slice(-19),result]};
}
export function evaluate(c,s){
 const available=s.citations.filter(id=>s.opened.includes(id));const hit=c.essential.map(group=>group.some(id=>available.includes(id)));
 const relevant=new Set(c.essential.flat());const weak=available.filter(id=>!relevant.has(id));
 const coverage=Math.max(0,hit.filter(Boolean).length*10-weak.length*5);
 const diagnosis=s.diagnosis===c.correct?40:s.diagnosis==='unknown'&&!c.essential.every(group=>group.some(id=>s.opened.includes(id)))?20:0;
 const action=s.action===c.correctAction?20:s.action==='gather'&&s.diagnosis==='unknown'?10:0;
 const verification=s.runs.some(r=>r.discriminating)?10:0;const prediction=s.runs.length&&s.prediction===c.probe.answer?5:0;
 const economy=diagnosis===40&&coverage===20?(spent(c,s)<=c.efficient?5:2):0;
 const score=diagnosis+action+coverage+verification+prediction+economy;
 return {score,diagnosis,action,coverage,verification,prediction,economy,hit,weak,solved:diagnosis===40&&action===20&&coverage===20&&verification===10,spent:spent(c,s)};
}
export function closeCase(c,s){if(![...c.hypotheses.map(h=>h.id),'unknown'].includes(s.diagnosis)||![...c.actions.map(a=>a.id),'gather'].includes(s.action))throw Error('incomplete');return {...s,closed:true};}
// Only allowlisted, internally re-derived state crosses the optional localStorage boundary.
export function sanitize(c,input){
 let s=initial();if(!input||typeof input!=='object')return s;
 try{
  for(const id of Array.isArray(input.opened)?input.opened:[]){if(c.evidence.some(e=>e.id===id)&&!s.opened.includes(id))s=acquire(c,s,id);}
  if(Array.isArray(input.runs)&&input.runs.length){for(const r of input.runs.slice(0,20))s=runProbe(c,s,r.values,input.prediction);}
 }catch{ /* impossible or unaffordable imported state is truncated */ }
 s.notes=Object.fromEntries(c.hypotheses.filter(h=>['open','keep','out'].includes(input.notes?.[h.id])).map(h=>[h.id,input.notes[h.id]]));
 s.citations=[...new Set((Array.isArray(input.citations)?input.citations:[]).filter(id=>s.opened.includes(id)))].slice(0,3);
 s.diagnosis=[...c.hypotheses.map(h=>h.id),'unknown'].includes(input.diagnosis)?input.diagnosis:'';
 s.action=[...c.actions.map(a=>a.id),'gather'].includes(input.action)?input.action:'';
 s.closed=!!input.closed&&!!s.diagnosis&&!!s.action;return s;
}
export const queue=queueModel;
