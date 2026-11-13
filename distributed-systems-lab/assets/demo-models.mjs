// Explicit teaching models; these do not implement or verify Raft.
export const causalEdges=[['A1','A2'],['A2','A3'],['B1','B2'],['B2','B3'],['C1','C2'],['C2','C3'],['A2','B2'],['B3','C2']];
export function causalPath(a,b){
  if(a===b)return [a];const q=[[a]],seen=new Set([a]);
  while(q.length){const p=q.shift();for(const [u,v] of causalEdges)if(u===p.at(-1)&&!seen.has(v)){if(v===b)return [...p,v];seen.add(v);q.push([...p,v]);}}return null;
}
export function causalRelation(a,b){if(a===b)return{relation:'same',path:[a]};let p=causalPath(a,b);if(p)return{relation:'before',path:p};p=causalPath(b,a);return p?{relation:'after',path:p}:{relation:'concurrent',path:[]};}
export function initialQuorum(){return{online:[true,true,true],leader:0,term:1,value:0,copies:[0,0,0],result:'ready'};}
export function quorumStep(previous,action,node){
  const s=structuredClone(previous);
  if(action==='toggle'){s.online[node]=!s.online[node];s.result=s.online[node]?'resumed':'paused';}
  if(action==='elect'){
    if(s.online.filter(Boolean).length<2)s.result='no-quorum';
    else{const live=[0,1,2].filter(i=>s.online[i]);s.leader=live.sort((a,b)=>s.copies[b]-s.copies[a])[0];s.term++;s.result='elected';}
  }
  if(action==='write'){
    if(!s.online[s.leader])s.result='leader-unavailable';
    else if(s.online.filter(Boolean).length<2)s.result='no-quorum';
    else{s.value++;s.copies=s.copies.map((v,i)=>s.online[i]?s.value:v);s.result='committed';}
  }
  if(action==='sync'){if(s.online.filter(Boolean).length<2)s.result='no-quorum';else{s.copies=s.copies.map((v,i)=>s.online[i]?s.value:v);s.result='synced';}}
  return s;
}
export function retryOutcome({delay=800,deadline=150,retries=0,sameId=true}={}){
  const commitAt=50,responseAt=commitAt+delay;
  return{commitAt,responseAt,deadline,client:responseAt<=deadline?'ok':'unknown',plain:1+retries,dedup:sameId?1:1+retries,requests:1+retries};
}
export function initialFence(){return{owner:'A',paused:false,expired:false,bToken:11,plain:'A-initial',fenced:'A-initial',high:10,stage:0,result:'ready'};}
export function fenceStep(previous,action){
  const s=structuredClone(previous);s.result='invalid-order';
  if(action==='pause'&&s.stage===0){s.paused=true;s.stage=1;s.result='paused';}
  if(action==='expire'&&s.stage===1){s.expired=true;s.owner=null;s.stage=2;s.result='expired';}
  if(action==='acquire'&&s.stage===2){s.owner='B';s.stage=3;s.result='acquired';}
  if(action==='writeB'&&s.stage>=3){s.plain=s.fenced='B-current';s.high=s.bToken;s.stage=Math.max(s.stage,4);s.result='fresh-written';}
  if(action==='writeA'&&s.stage>=3){s.paused=false;s.plain='A-late';const accepted=10>=s.high;if(accepted){s.high=10;s.fenced='A-late';}s.result=accepted?'old-accepted':'old-rejected';s.stage=5;}
  return s;
}
