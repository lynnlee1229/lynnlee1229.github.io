(() => {
 const form = document.querySelector('#search-form'); if (!form) return;
 const input = document.querySelector('#search-input'), results = document.querySelector('#search-results'), status = document.querySelector('#search-status');
 let dataPromise;
 async function search() {
  const query = input.value.trim(); results.replaceChildren();
  if (!query) { status.textContent = form.dataset.prompt; return; }
  status.textContent = form.dataset.loading;
  try {
   dataPromise ||= fetch(form.dataset.index).then(r => { if(!r.ok) throw new Error(); return r.json(); });
   const data = await dataPromise; if (input.value.trim() !== query) return;
   const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
   const hits = data.filter(p => terms.every(t => (p.title+' '+p.description+' '+p.topic+' '+p.tags.join(' ')+' '+p.content).toLocaleLowerCase().includes(t)));
   status.textContent = hits.length ? `${hits.length} ${form.dataset.found}` : form.dataset.none;
   hits.forEach(p => { const row=document.createElement('article'); row.className='article-row'; const info=document.createElement('div');info.className='article-info'; const h=document.createElement('h3'),a=document.createElement('a');a.href=p.url;a.textContent=p.title;h.append(a);const d=document.createElement('p');d.textContent=p.description;info.append(h,d);row.append(info);results.append(row); });
  } catch { dataPromise=null; status.textContent=form.dataset.error; }
 }
 form.addEventListener('submit', e=>{e.preventDefault();search();}); let timer; input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,180);});
})();
