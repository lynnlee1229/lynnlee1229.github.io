import {runExercise} from './exercises.mjs';
const zh=document.documentElement.lang.startsWith('zh');
const t=(en,cn)=>zh?cn:en;
for(const button of document.querySelectorAll('[data-exercise]')) button.addEventListener('click',()=>{
  const output=document.getElementById(`result-${button.dataset.exercise}`);
  try {
    const result=runExercise(button.dataset.exercise);
    output.textContent=t('Computed now in this tab. The assertions below use authored expectations; independent GEOS evidence is recorded separately.\n','刚在当前标签页计算。这里的断言使用作者编写的预期，独立 GEOS 证据单独记录。\n')+JSON.stringify(result,null,2);
  } catch(error) { output.textContent=t('FAILED: ','失败：')+error.message; }
  output.hidden=false;
});
document.getElementById('resource-search')?.addEventListener('input',event=>{
  const q=event.target.value.toLocaleLowerCase().trim(); let visible=0;
  for(const item of document.querySelectorAll('[data-resource]')) {
    item.hidden=!item.textContent.toLocaleLowerCase().includes(q); if(!item.hidden) visible++;
  }
  document.getElementById('resource-count').textContent=t(`${visible} courses shown`, `显示 ${visible} 门课程`);
});
