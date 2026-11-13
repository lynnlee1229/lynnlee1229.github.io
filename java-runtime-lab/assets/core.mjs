export function validate(d){
 const fail=m=>{throw Error(m)};
 if(d?.schemaVersion!==1||d.recordType!=='measured-local-jvm'||!d.assertionsPassed)fail('Unsupported or failed measurement record');
 if(!Array.isArray(d.pools)||d.pools.length!==2||!Array.isArray(d.cancellation)||d.cancellation.length!==3||!Array.isArray(d.retries)||d.retries.length!==3)fail('Missing scenarios');
 if(!d.environment||!d.config||!d.jfr?.readable)fail('Missing metadata or JFR evidence');
 for(const p of d.pools){if(!p.terminated||p.submitted!==p.completed+p.rejected||p.started!==p.completed||p.submitted!==18)fail('Pool counts do not close')}
 for(const c of d.cancellation){if(!c.terminated||!Number.isFinite(c.workExitedMs)||c.workExitedMs<c.waiterReturnedMs)fail('Invalid work lifetime')}
 for(const r of d.retries){if(r.requests!==r.success+r.failed||r.attempts<r.requests)fail('Retry counts do not close')}
 for(const scenario of [...d.pools,...d.cancellation,...d.retries]){
  if(!Array.isArray(scenario.events)||scenario.events.length===0)fail('Empty events');
  let prev=-1;scenario.events.forEach((e,i)=>{if(e.seq!==i||!Number.isFinite(e.ms)||e.ms<prev||typeof e.state!=='string'||!Number.isInteger(e.task))fail('Invalid event ordering');prev=e.ms;});
 }
 return d;
}
export function stateFromSearch(search){const p=new URLSearchParams(search);return {run:['1','2','3'].includes(p.get('run'))?p.get('run'):'1',view:['pool','timeout','retry'].includes(p.get('view'))?p.get('view'):'pool',policy:p.get('policy')||'',task:p.get('task')||'all'};}
export function series(events,key){return events.filter(e=>Number.isFinite(e[key])).map(e=>[e.ms,e[key]]);}
export function stepPath(points,maxX,maxY,width=820,height=190){if(!points.length)return '';const x=t=>40+(t/Math.max(1,maxX))*(width-60),y=v=>height-30-(v/Math.max(1,maxY))*(height-50);return points.map(([t,v],i)=>(i?'H'+x(t)+'V'+y(v):'M'+x(t)+','+y(v))).join(' ');}
