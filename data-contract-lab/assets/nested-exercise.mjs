// Original synthetic DCL exercise. This is not a university assignment solution.
const clone=x=>JSON.parse(JSON.stringify(x));
const object=(properties,required=[],additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const fields=Object.fromEntries(Array.from({length:24},(_,i)=>['note'+i,{type:'string'}]));
fields['quantity/unit~']= {type:'integer',minimum:0,maximum:8};
const item=object(fields,['quantity/unit~']);
const schema=object({batch_id:{type:'string'},records:{type:'array',minItems:1,maxItems:3,items:item}},['batch_id','records']);
const old={dialect:'dcl/1',schema};
const changed=clone(old);
changed.schema.properties.records.items.properties['quantity/unit~'].maximum=9;
const events=[
 {batch_id:'synthetic-1',records:[{'quantity/unit~':5}]},
 {batch_id:'synthetic-2',records:[{'quantity/unit~':9}]},
 {batch_id:'synthetic-3',records:[{}]},
 {batch_id:'synthetic-4',records:[]},
 {batch_id:'synthetic-5',records:[{'quantity/unit~':null}]},
 {batch_id:'synthetic-6',records:[{'quantity/unit~':'9'}]}
];
export const nestedExercise={old:clone(old),new:changed,consumers:[{name:'inventory-reader',contract:clone(old)}],events:events.map(x=>JSON.stringify(x)).join('\n')};
// This is a producer repair, not a blanket recommendation to weaken a consumer.
export const producerRepair=()=>clone(old);
