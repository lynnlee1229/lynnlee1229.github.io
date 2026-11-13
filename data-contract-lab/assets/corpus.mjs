// A bounded, authored regression corpus. Expected witnesses are supplied independently
// of the engine's search; no outcome is inferred from an engine-generated fixture.
const object=(properties,required=[],additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const wrap=s=>({dialect:'dcl/1',schema:object({payload:s},['payload'])});
const wide=(n,leaf,required=[])=>object({...Object.fromEntries(Array.from({length:n},(_,i)=>['p'+i,{type:'string'}])),target:leaf},required);
const clone=x=>JSON.parse(JSON.stringify(x));
const row=(id,a,b,witness,oracle,expected='counterexample')=>({id,producer:wrap(a),consumer:wrap(b),witness:{payload:witness},oracle,expected});
export const corpus=[];
for(const width of [0,4,18,24,48]){
 const a=wide(width,{type:'integer',minimum:0,maximum:9});
 const b=wide(width,{type:'integer',minimum:0,maximum:8});
 corpus.push(row('late-range-'+width,a,b,{target:9},'wide-range/'+width));
 const arr=s=>({type:'array',minItems:1,maxItems:2,items:s});
 corpus.push(row('array-late-range-'+width,arr(a),arr(b),[{target:9}],'array-wide-range/'+width));
}
corpus.push(row('missing-nested',object({target:{type:'string'}},[]),object({target:{type:'string'}},['target']),{},'missing'));
corpus.push(row('nullable-parent', {type:['object','null'],properties:{target:{type:'string'}},required:['target'],additionalProperties:false},object({target:{type:'string'}},['target']),null,'parent-null'));
corpus.push(row('nullable-leaf',object({target:{type:['string','null']}},['target']),object({target:{type:'string'}},['target']),{target:null},'leaf-null'));
corpus.push(row('escaped-pointer',object({'a/b~':{type:'integer',minimum:0,maximum:9}},['a/b~']),object({'a/b~':{type:'integer',minimum:0,maximum:8}},['a/b~']),{'a/b~':9},'escaped'));
corpus.push(row('closed-item',object({target:{type:'string'},extra:{type:'string'}},['target']),object({target:{type:'string'}},['target']),{target:'ok',extra:'x'},'extra'));
const optional=object({target:{type:'string'}},[]);
corpus.push(row('compatible-control',clone(optional),clone(optional),{},'identical','proven'));
// A conservative proof cannot see that a bounded integer is exactly {0,1}.
corpus.push(row('compatible-but-unproved',{type:'integer',minimum:0,maximum:1},{type:'integer',enum:[0,1]},0,'finite-enum','not-proven'));
// A useful honest limit: the smallest counterexample exceeds the witness budget.
corpus.push(row('over-budget',{type:'array',items:{type:'integer'},minItems:1001,maxItems:1001},{type:'array',items:{type:'integer'},maxItems:1},Array(1001).fill(0),'large-array','not-proven'));
