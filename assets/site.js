(() => {
 const form = document.querySelector('#search-form'); if (!form) return;
 const input = document.querySelector('#search-input'), results = document.querySelector('#search-results'), status = document.querySelector('#search-status');
 let dataPromise;
 async function search() {
  const query = input.value.trim(); results.replaceChildren();
  if (!query) { status.textContent = '输入关键词开始搜索。'; return; }
  status.textContent = '正在搜索…';
  try {
   dataPromise ||= fetch('/index.json').then(r => { if(!r.ok) throw new Error(); return r.json(); });
   const data = await dataPromise; if (input.value.trim() !== query) return;
   const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
   const hits = data.filter(p => terms.every(t => (p.title+' '+p.description+' '+p.topic+' '+p.tags.join(' ')+' '+p.content).toLocaleLowerCase().includes(t)));
   status.textContent = hits.length ? `找到 ${hits.length} 篇文章` : '暂时没有找到，试试“状态”“SQL”或“Agent”。';
   hits.forEach(p => { const row=document.createElement('article'); row.className='article-row'; const info=document.createElement('div');info.className='article-info'; const h=document.createElement('h3'),a=document.createElement('a');a.href=p.url;a.textContent=p.title;h.append(a);const d=document.createElement('p');d.textContent=p.description;info.append(h,d);row.append(info);results.append(row); });
  } catch { dataPromise=null; status.textContent='搜索索引暂时不可用，请稍后重试，或浏览文章索引。'; }
 }
 form.addEventListener('submit', e=>{e.preventDefault();search();}); let timer; input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,180);});
})();
