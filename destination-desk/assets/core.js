export const categories = ['jobs','housing','stay','flights','transport','mobile','money','health','daily','official'];
export const order = {
 travel: ['flights','stay','transport','mobile','official','health','daily','money','housing','jobs'],
 move: ['official','jobs','housing','stay','money','mobile','health','transport','daily','flights'],
 live: ['housing','transport','daily','money','health','mobile','official','jobs','stay','flights']
};
export const quick = {travel:['flights','stay','transport','official'],move:['official','jobs','housing','money'],live:['housing','transport','daily','health']};
export function readState(url, validCountries) {
 const p = new URL(url).searchParams;
 return {country:validCountries.includes(p.get('country'))?p.get('country'):'us',purpose:Object.hasOwn(order,p.get('purpose'))?p.get('purpose'):'move',category:categories.includes(p.get('category'))?p.get('category'):'all',q:(p.get('q')||'').slice(0,160),scope:p.get('scope')==='all'?'all':'country',saved:p.get('saved')==='1'};
}
export function stateURL(href, state) {
 const u=new URL(href);u.search='';
 for (const k of ['country','purpose','category','q','scope']) if(state[k] && !(k==='category'&&state[k]==='all')&&!(k==='scope'&&state[k]==='country'))u.searchParams.set(k,state[k]);
 if(state.saved)u.searchParams.set('saved','1');
 return u;
}
export function filterRecords(records,countries,state,favorites=new Set()) {
 const q=state.q.trim().toLocaleLowerCase();
 return records.filter(r=>{
  if(state.scope!=='all'&&r.country!==state.country)return false;
  if(state.saved&&!favorites.has(r.id))return false;
  if(state.category!=='all'&&r.category!==state.category)return false;
  const c=countries.find(c=>c.id===r.country);
  return !q || [r.name,r.url,c.zh,c.en,r.description.zh,r.description.en,r.coverage.zh,r.coverage.en].join(' ').toLocaleLowerCase().includes(q);
 }).sort((a,b)=>order[state.purpose].indexOf(a.category)-order[state.purpose].indexOf(b.category)||a.name.localeCompare(b.name));
}

