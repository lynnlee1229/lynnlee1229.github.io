// Independent, case-specific predicates. No core import, schema interpreter,
// generated expected status, random sampling, or calls to validate()/compare().
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=v=>typeof v==='string';
const wide=(v,limit,width)=>obj(v)&&Object.entries(v).every(([k,x])=>k==='target'?Number.isSafeInteger(x)&&x>=0&&x<=limit:/^p(0|[1-9]\d*)$/.test(k)&&Number(k.slice(1))<width&&str(x));
export function accepts(oracle,v,side){
 const [kind,parameter]=oracle.split('/'),width=Number(parameter);
 if(!obj(v)||Object.keys(v).length!==1||!own(v,'payload'))return false;
 const x=v.payload,producer=side==='producer';
 switch(kind){
 case 'wide-range':return wide(x,producer?9:8,width);
 case 'array-wide-range':return Array.isArray(x)&&x.length>=1&&x.length<=2&&x.every(y=>wide(y,producer?9:8,width));
 case 'missing':return obj(x)&&Object.keys(x).every(k=>k==='target')&&(!own(x,'target')?producer:str(x.target));
 case 'parent-null':return producer&&x===null||obj(x)&&Object.keys(x).length===1&&own(x,'target')&&str(x.target);
 case 'leaf-null':return obj(x)&&Object.keys(x).length===1&&own(x,'target')&&(str(x.target)||producer&&x.target===null);
 case 'escaped':return obj(x)&&Object.keys(x).length===1&&own(x,'a/b~')&&Number.isSafeInteger(x['a/b~'])&&x['a/b~']>=0&&x['a/b~']<=(producer?9:8);
 case 'extra':return obj(x)&&own(x,'target')&&str(x.target)&&Object.entries(x).every(([k,y])=>str(y)&&(k==='target'||producer&&k==='extra'));
 case 'identical':return obj(x)&&Object.keys(x).every(k=>k==='target'&&str(x[k]));
 case 'finite-enum':return x===0||x===1;
 case 'large-array':return Array.isArray(x)&&x.every(Number.isSafeInteger)&&(producer?x.length===1001:x.length<=1);
 default:throw Error('No independent oracle for '+kind);
 }
}
export function verifyWitness(c,v){return accepts(c.oracle,v,'producer')&&!accepts(c.oracle,v,'consumer');}
