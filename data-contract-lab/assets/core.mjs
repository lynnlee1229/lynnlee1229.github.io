// DCL/1: intentionally restricted contract language. Not a JSON Schema implementation.
export const VERSION='1.0.0';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const esc=s=>String(s).replace(/~/g,'~0').replace(/\//g,'~1');
const ptr=(p,k)=>p+'/'+esc(k);
const equal=(a,b)=>a===b;
const types=['object','array','string','number','integer','boolean','null'];
const ts=s=>Array.isArray(s.type)?s.type:[s.type];
const issue=(path,code,message)=>({path,code,message});
export function parseJSON(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>2_000_000)throw Error('Input must be text, at most 2 MB.');
 let i=0;const ws=()=>{while(/\s/.test(text[i]||'x')){if(!' \t\r\n'.includes(text[i]))throw Error('Invalid JSON whitespace');i++;}};
 function value(depth=0){if(depth>24)throw Error('JSON nesting exceeds 24.');ws();const c=text[i];
  if(c==='"'){let start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')return JSON.parse(text.slice(start,i));}throw Error('Unterminated string.');}
  if(c==='{'||c==='['){i++;const isO=c==='{',out=isO?Object.create(null):[],end=isO?'}':']';ws();if(text[i]===end){i++;return out;}while(true){ws();let k;if(isO){if(text[i]!=='"')throw Error('Expected quoted object key.');k=value(depth+1);if(own(out,k))throw Error('Duplicate object key: '+k);ws();if(text[i++]!==':')throw Error('Expected colon.');}const v=value(depth+1);if(isO)out[k]=v;else out.push(v);ws();if(text[i]===end){i++;return out;}if(text[i++]!==',')throw Error('Expected comma.');}}
  for(const [literal,v] of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(m){i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('Unsafe numeric magnitude; encode long IDs as strings.');return n;}
  throw Error('Invalid JSON near character '+(i+1)+'.');
 }
 const v=value();ws();if(i!==text.length)throw Error('Trailing JSON content near character '+(i+1)+'.');return v;
}
function typeOK(t,v){return t==='null'?v===null:t==='object'?obj(v):t==='array'?Array.isArray(v):t==='integer'?typeof v==='number'&&Number.isSafeInteger(v):t==='number'?typeof v==='number'&&Number.isFinite(v):typeof v===t;}
export function validate(s,v,path=''){
 const out=[];if(!ts(s).some(t=>typeOK(t,v)))return [issue(path,'type','Expected '+ts(s).join(' | ')+'.')];
 if(s.enum&&!s.enum.some(e=>equal(e,v)))out.push(issue(path,'enum','Value is outside the declared enum.'));
 if(v===null)return out;
 if(obj(v)){for(const k of s.required||[])if(!own(v,k))out.push(issue(ptr(path,k),'required','Required property is missing.'));
  for(const k of Object.keys(v)){if(own(s.properties||{},k))out.push(...validate(s.properties[k],v[k],ptr(path,k)));else if(s.additionalProperties===false)out.push(issue(ptr(path,k),'additionalProperties','Undeclared property is forbidden.'));}}
 if(Array.isArray(v)){if(v.length<(s.minItems??0)||v.length>(s.maxItems??Infinity))out.push(issue(path,'items-range','Array length is outside bounds.'));v.forEach((x,i)=>out.push(...validate(s.items,x,ptr(path,i))));}
 if(typeof v==='string'){const n=[...v].length;if(n<(s.minLength??0)||n>(s.maxLength??Infinity))out.push(issue(path,'length','Unicode code-point length is outside bounds.'));}
 if(typeof v==='number'&&(v<(s.minimum??-Infinity)||v>(s.maximum??Infinity)))out.push(issue(path,'range','Number is outside inclusive bounds.'));
 return out;
}
function keys(o,allowed,label){if(!obj(o))throw Error(label+': expected object.');for(const k of Object.keys(o))if(!allowed.includes(k))throw Error(label+': unsupported keyword '+k+'.');}
export function checkContract(c){
 keys(c,['dialect','schema','semantics'],'Contract');if(c.dialect!=='dcl/1')throw Error('Expected dialect "dcl/1". This is not full JSON Schema.');let nodes=0;
 function schema(s,p='',depth=0){if(++nodes>160||depth>8)throw Error('Schema exceeds 160 nodes or depth 8.');
  keys(s,['type','enum','properties','required','additionalProperties','items','minimum','maximum','minLength','maxLength','minItems','maxItems'],p||'/schema');
  if(!types.includes(s.type)&&!(Array.isArray(s.type)&&s.type.length===2&&s.type[1]==='null'&&types.includes(s.type[0])&&s.type[0]!=='null'))throw Error(p+': type must be one supported type or [type,"null"].');
  const t=ts(s)[0];const allowed=['type',...(t==='object'?['properties','required','additionalProperties']:t==='array'?['items','minItems','maxItems']:t==='string'?['enum','minLength','maxLength']:['number','integer'].includes(t)?['enum','minimum','maximum']:['enum'])];
  for(const k of Object.keys(s))if(!allowed.includes(k))throw Error(p+': '+k+' is not valid for '+t+'.');
  if(t==='object'){if(s.properties!==undefined&&!obj(s.properties))throw Error(p+': properties must be object.');if(s.required!==undefined&&(!Array.isArray(s.required)||s.required.some(k=>typeof k!=='string'||!own(s.properties||{},k))||new Set(s.required).size!==s.required.length))throw Error(p+': required must contain unique declared property names.');if(s.additionalProperties!==undefined&&typeof s.additionalProperties!=='boolean')throw Error(p+': additionalProperties must be boolean.');for(const [k,v] of Object.entries(s.properties||{}))schema(v,ptr(p,k),depth+1);}
  if(t==='array'){if(!s.items)throw Error(p+': array requires items schema.');schema(s.items,p+'/*',depth+1);}
  for(const [lo,hi] of [['minimum','maximum'],['minLength','maxLength'],['minItems','maxItems']]){for(const k of [lo,hi])if(s[k]!==undefined&&(!Number.isFinite(s[k])||(k!=='minimum'&&k!=='maximum'&&(!Number.isInteger(s[k])||s[k]<0||s[k]>10000))))throw Error(p+': invalid '+k);if((s[lo]??-Infinity)>(s[hi]??Infinity))throw Error(p+': contradictory bounds.');}
  if(t==='integer'&&Math.ceil(s.minimum??-Number.MAX_SAFE_INTEGER)>Math.floor(s.maximum??Number.MAX_SAFE_INTEGER))throw Error(p+': empty integer range.');
  if(s.enum!==undefined){if(!Array.isArray(s.enum)||!s.enum.length||s.enum.length>100||s.enum.some(v=>obj(v)||Array.isArray(v)||validate({...s,enum:undefined},v).length)||new Set(s.enum.map(v=>JSON.stringify(v))).size!==s.enum.length)throw Error(p+': enum must contain 1–100 distinct valid scalar values.');}
 }
 schema(c.schema);if(ts(c.schema)[0]!=='object'||ts(c.schema).length!==1)throw Error('Root schema must be non-nullable object.');
 keys(c.semantics||{},Object.keys(c.semantics||{}),'semantics');
 for(const [p,r] of Object.entries(c.semantics||{})){
  if(!p.startsWith('/')||/​/.test(p)||p.split('/').slice(1).some(x=>/~(?![01])/.test(x)))throw Error('Invalid semantic JSON Pointer: '+p);
  let s=c.schema;for(const token of p.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))){if(ts(s)[0]!=='object'||!own(s.properties||{},token))throw Error('Semantic path must name a declared object property: '+p);s=s.properties[token];}
  const allowed=r?.kind==='timestamp'?['kind','unit','timezone','after','before']:r?.kind==='money'?['kind','unit']:r?.kind==='identifier'?['kind','format']:[];keys(r,allowed,p);
  if(r.kind==='timestamp'){if(!['s','ms','rfc3339'].includes(r.unit)||!['UTC','explicit-offset'].includes(r.timezone)||((r.unit==='s'||r.unit==='ms')&&r.timezone!=='UTC'))throw Error(p+': invalid timestamp unit/timezone.');if(ts(s)[0]!== (r.unit==='rfc3339'?'string':'integer'))throw Error(p+': timestamp schema type must be string (rfc3339) or integer (s/ms).');for(const k of ['after','before'])if(r[k]!==undefined&&dateValue(r[k],'UTC')===null)throw Error(p+': invalid UTC '+k);if(r.after&&r.before&&Date.parse(r.after)>Date.parse(r.before))throw Error(p+': contradictory time window.');}
  else if(r.kind==='money'){if(!['USD-cent','USD-dollar','EUR-cent','EUR-euro'].includes(r.unit)||!['integer','number'].includes(ts(s)[0]))throw Error(p+': money requires numeric schema and supported currency unit.');}
  else if(r.kind==='identifier'){if(r.format!=='decimal-string'||ts(s)[0]!=='string')throw Error(p+': identifier requires string schema and decimal-string format.');}
  else throw Error(p+': unsupported semantic kind.');
 }
 return c;
}
function dateValue(v,zone){if(typeof v!=='string')return null;const m=v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);if(!m||Number(m[2])<1||Number(m[2])>12||Number(m[3])<1||Number(m[3])>new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).getUTCDate()||Number(m[4])>23||Number(m[5])>59||Number(m[6])>59||zone==='UTC'&&m[7]!=='Z'||m[7]!=='Z'&&(Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59))return null;const n=Date.parse(v);return Number.isFinite(n)?n:null;}
function at(v,p){for(const k of p.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))){if(!obj(v)||!own(v,k))return {present:false};v=v[k];}return {present:true,value:v};}
export function semanticErrors(c,v){const out=[];for(const [p,r] of Object.entries(c.semantics||{})){const a=at(v,p);if(!a.present||a.value===null)continue;const x=a.value;
 if(r.kind==='timestamp'){const n=r.unit==='rfc3339'?dateValue(x,r.timezone):Number.isSafeInteger(x)?x*(r.unit==='s'?1000:1):null;if(n===null||!Number.isFinite(n)||Math.abs(n)>8.64e15)out.push(issue(p,'timestamp','Timestamp violates its declared unit/timezone/format.'));else if(r.after&&n<Date.parse(r.after)||r.before&&n>Date.parse(r.before))out.push(issue(p,'time-window','Timestamp outside declared window; verify declared unit.'));}
 if(r.kind==='identifier'&&(typeof x!=='string'||!/^\d+$/.test(x)))out.push(issue(p,'identifier','Expected decimal-string identifier; no numeric coercion.'));
 if(r.kind==='money'&&(typeof x!=='number'||!Number.isFinite(x)||r.unit.endsWith('cent')&&!Number.isSafeInteger(x)))out.push(issue(p,'money','Amount violates declared currency unit (cent requires integer).'));
 }return out;}
// Sound sufficient inclusion proof over the restricted language; unproved is not incompatible.
function inclusion(a,b,p=''){
 const out=[];const fail=(code,msg)=>out.push(issue(p,code,msg));
 if(a.enum){if(a.enum.some(v=>validate(b,v).length))fail('enum-inclusion','A producer enum value is rejected by this consumer.');return out;}
 if(ts(a).some(t=>!ts(b).includes(t)&&!(t==='integer'&&ts(b).includes('number'))))fail('type-inclusion','Producer type is not contained in consumer types.');
 if(b.enum){fail('enum-inclusion','Consumer enum containment is not proven for a non-enum producer.');return out;}
 const t=ts(a)[0];if(t==='object'&&ts(b).includes('object')){
  for(const k of b.required||[])if(!(a.required||[]).includes(k))out.push(issue(ptr(p,k),'required-inclusion','Producer does not guarantee the consumer required property.'));
  for(const [k,bs] of Object.entries(b.properties||{})){if(own(a.properties||{},k))out.push(...inclusion(a.properties[k],bs,ptr(p,k)));else if(a.additionalProperties!==false)out.push(issue(ptr(p,k),'unconstrained-property','Producer permits an unconstrained property used by the consumer.'));}
  if(b.additionalProperties===false){if(a.additionalProperties!==false)fail('additional-inclusion','Producer permits extra properties rejected by consumer.');for(const k of Object.keys(a.properties||{}))if(!own(b.properties||{},k))out.push(issue(ptr(p,k),'additional-inclusion','Producer declares a property rejected by consumer.'));}
 }
 if(t==='array'&&ts(b).includes('array')){if((a.minItems??0)<(b.minItems??0)||(a.maxItems??Infinity)>(b.maxItems??Infinity))fail('array-inclusion','Producer array lengths exceed consumer range.');if(a.maxItems!==0)out.push(...inclusion(a.items,b.items,p+'/*'));}
 if(t==='string'&&ts(b).includes('string')&&((a.minLength??0)<(b.minLength??0)||(a.maxLength??Infinity)>(b.maxLength??Infinity)))fail('length-inclusion','Producer string lengths exceed consumer range.');
 if(['integer','number'].includes(t)&&ts(b).some(x=>['integer','number'].includes(x))){const lo=t==='integer'?Math.ceil(a.minimum??-Infinity):a.minimum??-Infinity,hi=t==='integer'?Math.floor(a.maximum??Infinity):a.maximum??Infinity;if(lo<(b.minimum??-Infinity)||hi>(b.maximum??Infinity))fail('range-inclusion','Producer numeric range exceeds consumer bounds.');}
 return out;
}
function examples(s,b,depth=0){const out=[];if(ts(s).includes('null'))out.push(null);if(s.enum)return s.enum;const t=ts(s)[0];
 if(t==='object'){const base=Object.create(null);for(const k of s.required||[])base[k]=examples(s.properties[k],b?.properties?.[k],depth+1)[0];out.push(base);for(const [k,v] of Object.entries(s.properties||{})){for(const x of examples(v,b?.properties?.[k],depth+1).slice(0,18))out.push({...base,[k]:x});if(!(s.required||[]).includes(k)){const copy={...base};delete copy[k];out.push(copy);}}if(s.additionalProperties!==false)out.push({...base,__extra:'probe'},...Object.keys(b?.properties||{}).filter(k=>!own(s.properties||{},k)).map(k=>({...base,[k]:[null,0,'probe',true].find(x=>validate(b.properties[k],x).length)})));}
 if(t==='array'){const values=examples(s.items,b?.items,depth+1);for(const n of new Set([s.minItems??0,s.maxItems??1,(b?.minItems??0)-1,(b?.maxItems??0)+1,1]))if(n>=0&&n<=10000)for(const x of values.slice(0,5))out.push(Array(n).fill(x));}
 if(t==='string')for(const n of new Set([s.minLength??0,s.maxLength??1,(b?.minLength??0)-1,(b?.maxLength??0)+1,1]))if(n>=0&&n<=10000)out.push('x'.repeat(n));
 if(t==='number'||t==='integer')out.push(0,1,-1,1.5,s.minimum,s.maximum,b?.minimum===undefined?undefined:b.minimum-1,b?.maximum===undefined?undefined:b.maximum+1,Math.ceil(s.minimum??0),Math.floor(s.maximum??0));
 if(t==='boolean')out.push(false,true);if(t==='null')out.push(null);
 return out.filter(v=>v!==undefined&&!validate(s,v).length).slice(0,200);
}
export function compare(producer,consumer){const concerns=inclusion(producer.schema,consumer.schema);const witness=concerns.length?examples(producer.schema,consumer.schema).find(v=>validate(consumer.schema,v).length):undefined;
 const semantic=[];for(const [p,r] of Object.entries(consumer.semantics||{})){const a=producer.semantics?.[p];if(!a)semantic.push(issue(p,'undeclared','Producer semantic declaration is missing.'));else{for(const k of ['kind','unit','timezone','format'])if(r[k]!==a[k])semantic.push(issue(p,'semantic-drift','Declared '+k+' differs: '+String(a[k])+' → '+String(r[k])));if(r.kind==='timestamp'&&((r.after&&(!a.after||Date.parse(a.after)<Date.parse(r.after)))||(r.before&&(!a.before||Date.parse(a.before)>Date.parse(r.before)))))semantic.push(issue(p,'semantic-window','Producer does not guarantee the consumer time window.'));}}
 return {structural:concerns.length?(witness!==undefined?'counterexample':'not-proven'):'proven',concerns,...(witness!==undefined?{witness,witnessChecks:{producer:validate(producer.schema,witness),consumer:validate(consumer.schema,witness)}}:{}),semantic:semantic.length?'review-required':Object.keys(consumer.semantics||{}).length?'declared-match':'not-declared',semanticConcerns:semantic,semanticScope:Object.keys(consumer.semantics||{}).length?'Consumer-declared paths only; declarations are promises, not behavior proof.':'No consumer semantic expectations declared; business compatibility is unknown.'};}
export function run(oldC,newC,consumers,text){checkContract(oldC);checkContract(newC);if(!Array.isArray(consumers)||!consumers.length||consumers.length>12)throw Error('Provide 1–12 consumers.');const names=new Set();for(const c of consumers){keys(c,['name','contract'],'Consumer');if(typeof c.name!=='string'||!c.name.trim()||c.name.length>100||names.has(c.name))throw Error('Consumers need unique names, at most 100 characters.');names.add(c.name);checkContract(c.contract);}
 if(new TextEncoder().encode(text).length>2_000_000)throw Error('JSONL exceeds 2 MB.');const lines=text.split(/\r?\n/);if(lines.at(-1)==='')lines.pop();if(lines.length>500)throw Error('At most 500 JSONL lines.');if(!text.trim())throw Error('Empty JSONL input is not a successful replay.');
 const errors=[],rows=[];for(let i=0;i<lines.length;i++){let v;try{if(!lines[i].trim())throw Error('Blank JSONL line.');v=parseJSON(lines[i]);}catch(e){errors.push({stage:'parse',line:i+1,path:'',code:'jsonl',message:e.message});rows.push({line:i+1,status:'parse-error'});continue;}
  const oldS=validate(oldC.schema,v),newS=validate(newC.schema,v),oldB=semanticErrors(oldC,v),newB=semanticErrors(newC,v);const oldE=[...oldS,...oldB],newE=[...newS,...newB];const key=e=>e.path+'|'+e.code;const oldK=new Set(oldE.map(key)),newK=new Set(newE.map(key));
  const cs=consumers.map(c=>({name:c.name,structural:validate(c.contract.schema,v),semantic:semanticErrors(c.contract,v)}));const status=!oldE.length&&!newE.length?'pass':!oldE.length?'new-failure':!newE.length?'fixed':'still-failing';
  rows.push({line:i+1,status,old:{structural:oldS,semantic:oldB},new:{structural:newS,semantic:newB},introduced:newE.filter(e=>!oldK.has(key(e))),resolved:oldE.filter(e=>!newK.has(key(e))),unchanged:newE.filter(e=>oldK.has(key(e))),consumers:cs});
  for(const [stage,es] of [['old-structure',oldS],['new-structure',newS],['old-semantic',oldB],['new-semantic',newB],...cs.flatMap(c=>[['consumer:'+c.name+':structure',c.structural],['consumer:'+c.name+':semantic',c.semantic]])])for(const e of es)errors.push({stage,line:i+1,...e});
 }
 const n=s=>rows.filter(x=>x.status===s).length;return {format:'data-contract-report/1',engine:VERSION,dialect:'dcl/1',generatedAt:new Date().toISOString(),direction:'New producer → existing consumer; structural value-set inclusion within DCL/1, separately declared semantics.',scope:'No producer implementation or consumer integration was executed. Replay covers only supplied sample rows. Imported event values are omitted from report; generated structural witnesses may contain schema enum values.',inputs:{old:oldC,new:newC,consumers},compatibility:consumers.map(c=>({name:c.name,old:compare(oldC,c.contract),new:compare(newC,c.contract)})),producerDirections:{newToOld:compare(newC,oldC),oldToNew:compare(oldC,newC)},summary:{total:rows.length,parsed:rows.length-n('parse-error'),parseErrors:n('parse-error'),pass:n('pass'),newFailures:n('new-failure'),fixed:n('fixed'),stillFailing:n('still-failing'),introducedErrors:rows.reduce((n,r)=>n+(r.introduced?.length||0),0),resolvedErrors:rows.reduce((n,r)=>n+(r.resolved?.length||0),0)},rows,errors};
}
export function csv(report){const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\ufeff'+[['stage','line','path','code','message'],...report.errors.map(e=>[e.stage,e.line,e.path,e.code,e.message])].map(r=>r.map(safe).join(',')).join('\r\n')+'\r\n';}
