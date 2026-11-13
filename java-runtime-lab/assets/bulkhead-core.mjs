export const policies=['unbounded','queue','reject','cancel-cooperative','cancel-ignore'];
export function bulkheadState(search){const p=new URLSearchParams(search);return {run:['1','2','3'].includes(p.get('run'))?p.get('run'):'1',policy:policies.includes(p.get('policy'))?p.get('policy'):'unbounded',task:p.get('task')||'all'};}
export function validateBulkhead(d){
 const fail=m=>{throw Error(m)};
 if(d?.schemaVersion!==1||d.recordType!=='measured-virtual-thread-bulkhead'||!d.assertionsPassed||d.runtime!=='25.0.5+8-LTS')fail('Unsupported or failed bulkhead capture');
 const n=d.config?.requests,c=d.config?.capacity;
 if(!Number.isInteger(n)||!Number.isInteger(c)||c<1||c>6||n<=c||n>40)fail('Invalid workload contract');
 if(!Array.isArray(d.cases)||d.cases.length!==5||new Set(d.cases.map(x=>x.policy)).size!==5)fail('Missing controlled cases');
 const transitions={};let tasks=0,totalEvents=0;
 for(const x of d.cases){
  if(!policies.includes(x.policy))fail('Unknown case');
  const cancel=x.policy.startsWith('cancel-'),offered=cancel?c+1:n,reject=x.policy==='reject'?n-c:0,peak=x.policy==='unbounded'?n:c,queue=x.policy==='queue'?n-c:cancel?1:0;
  if(x.capacity!==c||x.submitted!==offered||x.virtualTasks!==offered||x.completed!==(cancel?c-1:n-reject)||x.rejected!==reject||x.cancelled!==(cancel?2:0)||!x.terminated||x.maxActive!==peak||x.maxQueued!==queue||x.finalActive!==0||x.finalQueued!==0||x.permitsRemaining!==(x.policy==='unbounded'?null:c))fail('Resource counts do not close');
  if(!Array.isArray(x.events)||!x.events.length)fail('Empty event evidence');
  let active=0,queued=0,last=-1,ma=0,mq=0;const counts={},terminal=new Set(),started=new Set(),inside=new Set(),waiting=new Set();
  for(const [i,e] of x.events.entries()){
   if(e.seq!==i||!Number.isFinite(e.ms)||e.ms<last||!Number.isInteger(e.task)||(e.task!==-1&&(e.task<0||e.task>=offered)))fail('Invalid event order');last=e.ms;
   const id=e.task,s=e.state;counts[s]=(counts[s]||0)+1;const key=x.policy+'/'+s;transitions[key]=(transitions[key]||0)+1;
   if(s==='started'){if(!e.virtualThread||started.has(id))fail('Missing virtual-thread observation');started.add(id)}
   if(s==='queued'){if(waiting.has(id)||inside.has(id))fail('Invalid waiting state');waiting.add(id);queued++}
   if(s==='dequeued'){if(!waiting.delete(id))fail('Missing waiter');queued--}
   if(s==='entered'){if(inside.has(id)||waiting.has(id)||!started.has(id))fail('Invalid downstream entry');inside.add(id);active++}
   if(s==='exited'){if(!inside.delete(id))fail('Unmatched downstream exit');active--}
   if(['completed','rejected','cancelled'].includes(s)){if(terminal.has(id)||inside.has(id)||waiting.has(id))fail('Invalid terminal state');terminal.add(id)}
   if(e.active!==active||e.queued!==queued||active<0||queued<0||active>peak||queued>queue)fail('Trace contradicts resource bounds');ma=Math.max(ma,active);mq=Math.max(mq,queued);
  }
  if(active||queued||ma!==peak||mq!==queue||started.size!==offered||terminal.size!==offered||counts.submitted!==offered||(counts.completed||0)!==x.completed||(counts.rejected||0)!==x.rejected||(counts.cancelled||0)!==x.cancelled)fail('Incomplete task evidence');
  if(cancel){const s=x.cancelSnapshot;if(!x.waiterTimedOut||!x.queuedCancelAccepted||!x.activeCancelAccepted||!s?.targetFutureCancelled||s.targetWorkExited!==(x.policy==='cancel-cooperative')||s.active!==(x.policy==='cancel-ignore'?c:c-1)||s.queued!==0)fail('Cancellation control contradicted')}
  else if(x.heldSnapshot?.active!==peak||x.heldSnapshot?.queued!==queue||x.heldSnapshot?.rejected!==reject)fail('Missing controlled overlap');
  tasks+=offered;totalEvents+=x.events.length;
 }
 const j=d.jfr,counts=j?.eventCounts;
 if(!j?.readable||!counts||counts['lab.BulkheadEvent']!==totalEvents||counts['jdk.VirtualThreadStart']<tasks||counts['jdk.VirtualThreadEnd']<tasks||!(counts['jdk.ThreadPark']>0)||!(counts['jdk.ThreadSleep']>0))fail('Missing actual JFR lifecycle evidence');
 if(Object.keys(transitions).length!==Object.keys(j.transitionCounts||{}).length||Object.entries(transitions).some(([k,v])=>j.transitionCounts[k]!==v))fail('JFR transitions differ from JSON');
 return d;
}
