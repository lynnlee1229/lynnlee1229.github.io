import {UNIT_IDS,runUnit} from './practice.mjs?rev=cbbbee476535fc61';
const zh=document.documentElement.lang==='zh-CN';
const search=document.querySelector('#resource-search');
search.addEventListener('input',()=>{
 const q=search.value.trim().toLocaleLowerCase();let visible=0;
 for(const card of document.querySelectorAll('[data-resource]')){
  card.hidden=!card.textContent.toLocaleLowerCase().includes(q);if(!card.hidden)visible++;
 }
 document.querySelector('#resource-count').textContent=zh?`匹配 ${visible} 项`:`${visible} matching resources`;
});
let results=[];
function display(ids){
 const output=document.querySelector('#practice-output');
 try{results=ids.map(runUnit);output.textContent=JSON.stringify({kind:'Actual execution in this browser; authored synthetic inputs',executedAt:new Date().toISOString(),units:results},null,2);}
 catch(e){results=[];output.textContent=(zh?'练习失败：':'Practice failed: ')+e.message;}
 output.hidden=false;document.querySelector('#save-practice').disabled=results.length===0;
 output.scrollIntoView({block:'nearest'});
}
for(const button of document.querySelectorAll('[data-unit]'))button.addEventListener('click',()=>display([button.dataset.unit]));
document.querySelector('#run-practice').addEventListener('click',()=>display(UNIT_IDS));
document.querySelector('#save-practice').addEventListener('click',()=>{
 if(!results.length)return;
 const blob=new Blob([JSON.stringify({format:'dcl-practice/1',executedAt:new Date().toISOString(),units:results},null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dcl-practice-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
