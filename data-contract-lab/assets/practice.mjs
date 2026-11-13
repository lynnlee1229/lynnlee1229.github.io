// Six original runnable probes, separate from the linked university assignments.
import {checkContract,validate,compare,run,csv,VERSION} from './core.mjs?rev=b0339a6da8dbd4cc';
import {nestedExercise,producerRepair} from './nested-exercise.mjs?rev=ee6ea13d6c4c9f37';
import {corpus} from './corpus.mjs?rev=28e8bcca840aa675';
import {accepts,verifyWitness} from './oracle.mjs?rev=7313bcbaa9876cb3';
const ensure=(ok,label)=>{if(!ok)throw Error('Expectation failed: '+label);};
const clone=x=>JSON.parse(JSON.stringify(x));
export const UNIT_IDS=['U01','U02','U03','U04','U05','U06'];
export function runUnit(id){
 const s=nestedExercise;let observations;
 if(id==='U01'){
  const c=clone(s.old);c.schema.properties.records.items.properties['quantity/unit~'].pattern='[0-9]';
  let rejected=false;try{checkContract(c);}catch(e){rejected=/unsupported|not valid/.test(e.message);}
  ensure(rejected,'DCL rejects a JSON Schema keyword instead of silently ignoring it');
  observations={unknownKeywordRejected:rejected,dialect:'dcl/1',jsonSchemaConformanceClaim:false};
 }else if(id==='U02'){
  const item={type:'object',properties:{value:{type:['integer','null']}},required:['value'],additionalProperties:false};
  const inputs=[{}, {value:null},{value:0},{value:'0'}];
  const actual=inputs.map(x=>validate(item,x).map(e=>e.code));
  const expected=[['required'],[],[],['type']];
  ensure(JSON.stringify(actual)===JSON.stringify(expected),'missing/null/integer/string partitions');
  observations={partitions:['absent','present-null','present-integer','present-string'],expected,actual};
 }else if(id==='U03'){
  const forward=compare(s.new,s.old),reverse=compare(s.old,s.new);
  ensure(forward.structural==='counterexample'&&reverse.structural==='proven','9 breaks only new → old');
  ensure(forward.witnessChecks.producer.length===0&&forward.witnessChecks.consumer.some(e=>e.path==='/records/0/quantity~1unit~0'&&e.code==='range'),'escaped concrete array path');
  observations={newToOld:forward.structural,oldToNew:reverse.structural,witness:forward.witness,consumerErrors:forward.witnessChecks.consumer};
 }else if(id==='U04'){
  const cases=corpus.map(c=>{
   const result=compare(c.producer,c.consumer);
   ensure(result.structural===c.expected,c.id+' expected status');
   if(result.witness!==undefined)ensure(verifyWitness(c,result.witness),c.id+' independent witness predicates');
   return {id:c.id,expected:c.expected,actual:result.structural,independentWitnessVerified:result.witness!==undefined};
  });
  // A deliberately invalid fabricated witness must fail the external predicate.
  ensure(!accepts('wide-range/0',{payload:{target:10}},'producer'),'oracle rejects a fabricated witness');
  observations={scope:'Finite authored corpus, not search completeness',cases};
 }else if(id==='U05'){
  const before=run(s.old,s.new,s.consumers,s.events),after=run(s.old,producerRepair(),s.consumers,s.events);
  ensure(before.compatibility[0].new.structural==='counterexample'&&after.compatibility[0].new.structural==='proven','producer contract repair');
  ensure(before.summary.fixed===1&&after.summary.stillFailing===5,'a fixed producer row can still fail its reader; repair does not rewrite archived data');
  ensure(before.rows[1].consumers[0].structural[0].code==='range','reader still rejects row 2');
  const adapted=run(s.old,s.new,[{name:'adapted-reader',contract:clone(s.new)}],s.events);
  ensure(adapted.compatibility[0].new.structural==='proven','explicit consumer contract agreement');
  observations={before:before.summary,producerRepair:after.summary,adaptedConsumer:adapted.compatibility[0].new.structural,readerRejectsNewlyAcceptedRow:true};
 }else if(id==='U06'){
  const report=run(s.old,producerRepair(),s.consumers,s.events),encoded=JSON.stringify(report);
  ensure(!encoded.includes('synthetic-1'),'export excludes raw batch id');
  ensure(JSON.parse(encoded).compatibility[0].new.structural==='proven','JSON round-trip preserves repaired result');
  const rows=csv(report);
  ensure(rows.startsWith('\ufeff"stage"')&&rows.endsWith('\r\n'),'CSV encoding and row terminators');
  // Offline structured extraction example: structurally legal 5 versus source 6.
  // This is authored data and a direct source check, not an LLM evaluation.
  const source={quantity:6},extracted={quantity:5};
  const schema={type:'object',properties:{quantity:{type:'integer',minimum:0,maximum:8}},required:['quantity'],additionalProperties:false};
  ensure(validate(schema,extracted).length===0&&extracted.quantity!==source.quantity,'structure cannot establish source fidelity');
  observations={jsonRoundTrip:true,rawEventValuesOmitted:true,csvDiagnostics:report.errors.length,sourceFidelity:{structuralErrors:0,sourceQuantity:6,extractedQuantity:5,faithful:false},scope:'Authored extraction counterexample; no model was called or scored.'};
 }else throw Error('Unknown unit: '+id);
 return {unit:id,engine:VERSION,passed:true,observations};
}
