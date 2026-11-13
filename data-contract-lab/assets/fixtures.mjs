const clone=x=>JSON.parse(JSON.stringify(x));
const old={dialect:'dcl/1',schema:{type:'object',properties:{event_id:{type:'string',minLength:1},event_time:{type:'integer'},kind:{type:'string',enum:['click','view']},amount:{type:'integer',minimum:0},context:{type:'object',properties:{campaign:{type:['string','null']}},required:['campaign'],additionalProperties:false}},required:['event_id','event_time','kind','amount','context'],additionalProperties:false},semantics:{'/event_id':{kind:'identifier',format:'decimal-string'},'/event_time':{kind:'timestamp',unit:'s',timezone:'UTC',after:'2020-01-01T00:00:00Z',before:'2030-01-01T00:00:00Z'},'/amount':{kind:'money',unit:'USD-cent'}}};
const consumer={name:'campaign-rollup',contract:clone(old)};consumer.contract.schema.additionalProperties=true;consumer.contract.schema.required=['event_id','event_time','kind','context'];delete consumer.contract.schema.properties.amount;delete consumer.contract.semantics['/amount'];
const event={event_id:'90071992547409931234',event_time:1767225600,kind:'click',amount:125,context:{campaign:'synthetic-42'}};
const structural=clone(old);delete structural.schema.properties.context;structural.schema.required=structural.schema.required.filter(x=>x!=='context');structural.schema.properties.kind.enum=['click','purchase'];structural.schema.properties.amount={type:'string'};delete structural.semantics['/amount'];
const semantic=clone(old);semantic.semantics['/event_time'].unit='ms';semantic.semantics['/amount'].unit='USD-dollar';
const replay=clone(old);replay.schema.properties.kind.enum=['click','purchase'];replay.schema.properties.context.properties.campaign={type:'string'};
const line=x=>JSON.stringify(x);
export const scenarios={
 structure:{old:clone(old),new:structural,consumers:[clone(consumer)],events:[event,{...event,kind:'view'},{event_id:'42',event_time:1767225600,kind:'purchase',amount:'1.25'}].map(line).join('\n')},
 semantics:{old:clone(old),new:semantic,consumers:[{name:'billing-reader',contract:clone(old)}],events:[event,{...event,event_time:1767225600000},{...event,amount:1.25}].map(line).join('\n')},
 replay:{old:clone(old),new:replay,consumers:[clone(consumer)],events:[event,{...event,kind:'view'},{...event,kind:'purchase'},{...event,context:{campaign:null}},{...event,context:{}},{...event,context:{campaign:42}},{...event,event_id:9007199254740991}].map(line).concat('{"kind":').join('\n')}
};
export const demoEvent=event;
