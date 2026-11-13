// Bounded exhaustive check for one integer read/write register; no pending ops.
export function check(history,{model='linearizable',budget=50000,initial=0}={}) {
  const bad=reason=>({status:'invalid',reason,explored:0});
  if(!Array.isArray(history)||!history.length)return bad('history must be a nonempty array');
  if(!['linearizable','sequential'].includes(model))return bad('unknown model');
  if(!Number.isInteger(budget)||budget<1||budget>100000)return bad('budget must be 1..100000');
  if(!Number.isSafeInteger(initial))return bad('initial value must be a safe integer');
  const ids=new Set();
  for(const o of history){
    if(!o||Object.keys(o).some(k=>!['id','client','type','value','start','end'].includes(k))||typeof o.id!=='string'||!o.id||ids.has(o.id)||typeof o.client!=='string'||!o.client||!['read','write'].includes(o.type)||!Number.isSafeInteger(o.value)||!Number.isFinite(o.start)||!Number.isFinite(o.end)||o.end<=o.start)return bad('unique id, client, read/write, integer value and start < end required');
    ids.add(o.id);
  }
  for(let i=0;i<history.length;i++)for(let j=i+1;j<history.length;j++)if(history[i].client===history[j].client&&history[i].start<history[j].end&&history[j].start<history[i].end)return bad('operations from one client must not overlap');
  if(history.length>12)return {status:'inconclusive',reason:'operation limit: 12',explored:0};
  const n=history.length,all=(1<<n)-1,pre=history.map((o,i)=>history.reduce((bits,p,j)=>bits|((i!==j&&p.end<=o.start&&(model==='linearizable'||p.client===o.client))?(1<<j):0),0));
  let explored=0,cut=false;const seen=new Set();
  function dfs(mask,state,path){
    if(mask===all)return path;
    const k=mask+':'+state;if(seen.has(k))return null;
    if(explored>=budget){cut=true;return null;}explored++;seen.add(k);
    for(let i=0;i<n;i++){
      const o=history[i];if(mask&(1<<i)||(mask&pre[i])!==pre[i]||(o.type==='read'&&o.value!==state))continue;
      const found=dfs(mask|(1<<i),o.type==='write'?o.value:state,[...path,o.id]);if(found)return found;
    }
    return null;
  }
  const witness=dfs(0,initial,[]);
  return witness?{status:'pass',witness,explored,model,initial}:{status:cut?'inconclusive':'fail',reason:cut?'search budget reached':'all legal orders exhausted',explored,model,initial};
}
export const fixtures={
  concurrent:[{id:'w1',client:'A',type:'write',value:1,start:0,end:4},{id:'r1',client:'B',type:'read',value:0,start:1,end:3},{id:'r2',client:'B',type:'read',value:1,start:5,end:7}],
  stale:[{id:'w1',client:'A',type:'write',value:1,start:0,end:2},{id:'r1',client:'B',type:'read',value:0,start:3,end:5}],
  impossible:[{id:'w1',client:'A',type:'write',value:1,start:0,end:4},{id:'r1',client:'B',type:'read',value:9,start:1,end:3}]
};
