import {categories,order,quick,readState,stateURL,filterRecords} from './core.js';
const $=id=>document.getElementById(id);
const lang=document.documentElement.lang.startsWith('zh')?'zh':'en';
const zh=lang==='zh';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=x=>typeof x==='string'?x:x?.[lang]||'';
const t=(z,e)=>zh?z:e;
const cat={
 jobs:t('找工作','Work'),housing:t('长租与合租','Rent & share'),stay:t('短住落脚','Short stays'),flights:t('机票比价','Flights'),transport:t('交通与地图','Transit & maps'),mobile:t('手机网络','Mobile'),money:t('银行与支付','Banking'),health:t('医疗与紧急','Health & urgent'),daily:t('日常生活','Everyday life'),official:t('官方办事','Official steps')
};
const kinds={official:t('官方 / 公共机构','Official / public'),local:t('本地平台','Local platform'),international:t('国际平台','International')};
const purposes={travel:[t('短住旅行','Visit & explore'),'↗',t('先安排机票与住处，再查交通、通信和入境信息。','Start with flights and a place to stay, then transit, connectivity and entry guidance.')],move:[t('求职搬迁','Work & relocate'),'↳',t('先确认官方工作路径，再找岗位与住房，准备落地生活。','Check official work routes, then explore jobs, housing and settling in.')],live:[t('长期生活','Settle & live'),'⌂',t('把住房、通勤和日常服务放在前面，再核对长期生活事项。','Start with housing, commuting and everyday services, then longer-term essentials.')]};
let data,state,favorites=new Set(),storageOK=true,toastTimer;
try{const stored=JSON.parse(localStorage.getItem('destination-desk:favorites:v1')||'[]');if(Array.isArray(stored))favorites=new Set(stored.filter(s=>typeof s==='string'));}catch{storageOK=false;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
function external(url,label,cls=''){return '<a href="'+E(url)+'" target="_blank" rel="noopener noreferrer"'+(cls?' class="'+cls+'"':'')+'>'+label+'</a>';}
function country(id){return data.countries.find(c=>c.id===id);}
function countryName(id){const c=country(id);return zh?c.zh:c.en;}
function updateURL(){history.replaceState(null,'',stateURL(location.href,state));const u=new URL(location.href);u.pathname=u.pathname.replace(/\/(zh|en)\/$/,'/'+(zh?'en':'zh')+'/');$('lang-link').href=u.href;}
function configure(){
 const texts={'brand-sub':t('目的地生活入口','Local essentials, in one place'),'home-link':t('Lynn 的工具','Lynn’s tools'),'method-link':t('来源与维护','Sources & upkeep'),'lang-link':t('EN','中文'),'intro-copy':t('找工作、找住处，或只是先好好落脚。把一个地方真正用得上的入口，放在一起。','Find work, find a home, or simply find your feet. Useful local starting points, gathered in one place.'),'desk-note':t('少一点到处搜索，\n多一点心里有数。','Less searching around.\nA clearer place to start.'),'edition':t('12 个目的地 · 首版精选','12 destinations · First edition'),'destination-label':t('选一个目的地','Choose a destination'),'country-search-label':t('查找国家','Find a country'),'country-empty':t('暂未找到已收录的国家。','No matching destination in this edition.'),'coverage-note':t('首发 12 个目的地。按区域排列，非排名。','12 destinations. Grouped by region, not ranked.'),'purpose-label':t('这次，你想做什么？','What brings you here?'),'quick-heading':t('先收好这几个入口','A few good starting points'),'quick-sub':t('按你的目的精选','Picked for your purpose'),'directory-heading':t('目的地入口簿','Your destination directory'),'share':t('分享当前视图 ↗','Share this view ↗'),'platform-search-label':t('搜索平台或用途','Search platforms or needs'),'scope-label':t('搜索范围','Search scope'),'saved-note':t('收藏只保存在本机浏览器，不会同步或上传。分享链接不包含收藏内容。','Bookmarks stay in this browser. They are not synced or uploaded, and are not included in shared links.'),'empty-title':t('这里还没有匹配入口','No matching links yet'),'empty-copy':t('换个关键词、分类或搜索范围试试；收藏需先点卡片上的星标。','Try another keyword, category or search scope. Star a card to add a bookmark.'),'clear-filters':t('清除筛选','Clear filters'),'method-heading':t('入口有出处，使用有边界。','Every link has a source. Every service has limits.'),'method-intro':t('这是一份精简的目的地导航，帮你找到下一步该打开的官方网页与平台。它不替代全部出行或移居准备，也不对岗位、房源、账户或个人资格作保证。','A compact directory to help you find the next useful official page or platform. It does not replace travel or relocation preparation, or guarantee jobs, homes, accounts or eligibility.'),'date-note':t('内容核验：2026-11-14（中国标准时间）· 人工整理，非实时服务状态','Content checked: 14 Nov 2026 (China Standard Time) · Curated, not live service status'),'footer-copy':t('独立整理 · 无推广参数 · 无追踪脚本。外链将在新标签页打开。','Independently curated · No affiliate parameters or tracking scripts. External links open in a new tab.'),'back-top':t('回到顶部 ↑','Back to top ↑'),'share-dialog-title':t('分享当前视图','Share this view'),'share-help':t('复制下面链接；包含目的地、出行目的和筛选，不包含你的收藏。','Copy the link below. It includes destination, purpose and filters, without your bookmarks.'),'share-url-label':t('链接','Link'),'close-dialog':t('关闭','Close')};
 for(const [id,value]of Object.entries(texts))$(id).textContent=value;
 $('desk-note').style.whiteSpace='pre-line';
 document.querySelector('.brand').href='../'+lang+'/';document.querySelector('.footer-brand').href='../'+lang+'/';
 $('home-link').href=zh?'/zh/websites/#tools':'/websites/#tools';
 $('lang-link').lang=zh?'en':'zh-CN';
 $('country-search').placeholder=t('国家 / Country','Country / 国家');
 $('platform-search').placeholder=t('搜平台、用途、城市…','Platform, need or city…');
 $('search-scope').innerHTML='<option value="country">'+t('当前目的地','This destination')+'</option><option value="all">'+t('全部目的地','All destinations')+'</option>';
 $('filters').setAttribute('aria-label',t('入口分类','Link categories'));
 $('method-details').innerHTML=[
 [t('有来源的精选','Sourced selections'),t('每条卡片都附官方出处、范围与核验日期。“本地平台”表示面向该市场，不代表用户量排名；未证实普及程度时只作为可用入口。','Each card includes sources, area and check date. “Local” describes market focus, not popularity. Links are usable starting points, not a ranking.')],
 [t('知道哪里还未知','Uncertainty stays visible'),t('自动访问受限会单独标注，不直接判为失效。未实测注册、外国证件受理或交易；App、语言、身份与号码要求未核实的内容不推断。','Automated access limits are labelled, not treated as dead links. Sign-up, foreign-document acceptance and transactions were not tested. Unchecked app, language, identity or phone requirements are not assumed.')],
 [t('以当前官方规则为准','Use current official rules'),t('政策、医疗和开户只提供权威信息入口。价格、资格和城市覆盖可能变化；下单、申请或签约前重新确认。','Policy, healthcare and banking links point to authoritative information. Prices, eligibility and coverage can change; reconfirm before paying, applying or signing.')],
 [t('轻量与隐私','Lightweight & private'),t('首发只覆盖列出的 12 个目的地。没有账户、后台或私人资料上传；收藏只留本机。不会自动监控或复核外站。','This edition covers the 12 listed destinations. No accounts, backend or private uploads; bookmarks remain local. External sites are not monitored or rechecked automatically.')]
 ].map(([h,p])=>'<div><h3>'+E(h)+'</h3><p>'+E(p)+'</p></div>').join('');
}
function renderCountries(){
 const q=$('country-search').value.trim().toLocaleLowerCase();let prev='',n=0;
 $('country-list').innerHTML=data.countries.filter(c=>[c.zh,c.en,c.id].join(' ').toLocaleLowerCase().includes(q)).map(c=>{
  n++;let h='';if(c.region!==prev){prev=c.region;h='<p class="region-label">'+E(zh?c.regionZh:c.region)+'</p>';}
  return h+'<button type="button" class="country-button" data-country="'+E(c.id)+'" aria-current="'+(state.country===c.id)+'"><span aria-hidden="true">'+E(c.flag)+'</span><span>'+E(zh?c.zh:c.en)+'<small>'+E(zh?c.en:c.zh)+'</small></span><span class="arrow" aria-hidden="true">↗</span></button>';
 }).join('');
 $('country-empty').hidden=n>0;
}
function renderQuick(){
 const visible=!state.saved&&!state.q&&state.category==='all'&&state.scope==='country';
 $('quick-section').hidden=!visible;if(!visible)return;
 $('quick-grid').innerHTML=quick[state.purpose].map((key,i)=>{
  const pool=data.records.filter(r=>r.country===state.country&&r.category===key);
  const preferred=key==='official'?country(state.country).preferredOfficial?.[state.purpose]:null;
  const r=pool.find(r=>r.id===preferred)||pool.find(r=>r.kind==='local')||pool.find(r=>r.kind==='international')||pool[0];if(!r)return '';
  return '<article class="quick-card"><div class="quick-label">'+String(i+1).padStart(2,'0')+' / '+E(cat[key])+'<span aria-hidden="true">↗</span></div><h3>'+external(r.url,E(r.name))+'</h3><p>'+E(L(r.coverage))+'</p>'+(r.notice?'<p class="quick-notice">'+E(L(r.notice))+'</p>':'')+'<a class="quick-detail" data-entry="'+E(r.id)+'" href="#entry-'+E(r.id)+'">'+t('来源与使用范围','Source & service area')+' ↓</a></article>';
 }).join('');
}
function card(r){
 const saved=favorites.has(r.id),date=r.verified;
 const verification={page:t('已读取官方来源页面；未实测注册、下单或申请。','Official source page read; registration, transactions and applications not tested.'),'official-search':t('由官方资料或官方搜索结果佐证；部分目标页需交互浏览器。','Supported by official information or official search results; destination may need an interactive browser.'),restricted:t('自动访问受限；已由所列官方来源佐证。不是已确认死链，仍需在浏览器中核对当日状态。','Automated access restricted; supported by listed official sources. Not a confirmed dead link; check current status in your browser.')}[r.verification];
 return '<article id="entry-'+E(r.id)+'" class="entry"><div class="entry-head"><div><div class="entry-labels"><span class="badge '+E(r.kind)+'">'+E(kinds[r.kind])+'</span>'+(state.scope==='all'?'<span class="badge">'+E(countryName(r.country))+'</span>':'')+'</div><h3>'+external(r.url,E(r.name)+' <span aria-hidden="true">↗</span>')+'</h3><span class="domain">'+E(new URL(r.url).hostname.replace(/^www\./,''))+'</span></div><button class="bookmark" type="button" data-save="'+E(r.id)+'" aria-pressed="'+saved+'" aria-label="'+E((saved?t('取消收藏 ','Remove bookmark: '):t('收藏 ','Bookmark: '))+r.name)+'">'+(saved?'★':'☆')+'</button></div><p class="description">'+E(L(r.description))+'</p>'+(r.notice?'<p class="key-limit">'+E(L(r.notice))+'</p>':'')+'<p class="scope"><span class="scope-icon" aria-hidden="true">◎</span><span>'+E(L(r.coverage))+'</span></p><details><summary>'+t('来源与使用说明','Sources & details')+' · '+E(date)+'</summary><div class="source-detail"><dl><dt>'+t('适用边界 / 注意事项','Limits & things to check')+'</dt><dd>'+E(L(r.limitation))+'</dd><dt>'+t('网页与 App','Website & app')+'</dt><dd>'+E(L(r.access))+'</dd><dt>'+t('身份、号码、语言与费用门槛','Identity, phone, language & fees')+'</dt><dd>'+E(r.requirements?L(r.requirements):t('未逐项核验；不默认外国用户可注册或开户。请查看官方当前要求。','Not individually checked. Foreign-user registration or account acceptance is not assumed; consult current official requirements.'))+'</dd></dl><strong>'+t('官方出处','Official sources')+'</strong><ul>'+r.sources.map(s=>'<li>'+external(s.url,E(s.title))+'</li>').join('')+'</ul><p class="verification">'+E(verification)+'</p></div></details></article>';
}
function render(){
 const focused=document.activeElement;const focusKey=['country','purpose','category'].find(k=>focused?.dataset?.[k]);const focusValue=focusKey?focused.dataset[focusKey]:null;
 const c=country(state.country);
 $('region').textContent=(zh?c.regionZh:c.region)+' / DESTINATION';
 $('country-title').innerHTML=E(zh?c.zh:c.en)+' <span>'+E(zh?c.en:c.zh)+'</span>';
 $('country-note').textContent=L(c.note);
 $('country-code').innerHTML=E(c.id==='gb'?'UK':c.id.toUpperCase())+'<span>DESTINATION / '+String(data.countries.indexOf(c)+1).padStart(2,'0')+'</span>';
 $('purposes').innerHTML=Object.entries(purposes).map(([id,[label,icon]])=>'<button type="button" data-purpose="'+id+'" aria-pressed="'+(state.purpose===id)+'"><span aria-hidden="true">'+icon+'</span>'+E(label)+'</button>').join('');
 $('purpose-note').textContent=purposes[state.purpose][2];
 $('platform-search').value=state.q;$('search-scope').value=state.scope;
 renderCountries();renderQuick();
 const base=filterRecords(data.records,data.countries,{...state,category:'all'},favorites);
 $('filters').innerHTML=['all',...order[state.purpose]].map(k=>'<button type="button" data-category="'+k+'" aria-pressed="'+(state.category===k)+'">'+E(k==='all'?t('全部','All'):cat[k])+'<span>'+(k==='all'?base.length:base.filter(r=>r.category===k).length)+'</span></button>').join('');
 const rows=filterRecords(data.records,data.countries,state,favorites);
 const resultLabel=state.scope==='all'?t('全部目的地', 'All destinations'):countryName(state.country);
 $('result-count').textContent=resultLabel+' · '+rows.length+t(' 个入口',' links')+(state.saved?t(' · 本机收藏',' · local bookmarks'):'');
 $('saved-filter').setAttribute('aria-pressed',String(state.saved));
 $('saved-filter').innerHTML=(state.saved?'★ ':'☆ ')+t('只看收藏','Bookmarks')+' <span>'+[...favorites].filter(id=>data.records.some(r=>r.id===id)).length+'</span>';
 if(!storageOK)$('saved-note').textContent=t('浏览器存储不可用；本次收藏只会临时保留，刷新后可能丢失。','Browser storage is unavailable. Bookmarks are temporary and may be lost on reload.');
 $('results').innerHTML=order[state.purpose].map((key,i)=>{
  const group=rows.filter(r=>r.category===key);if(!group.length)return '';
  return '<section class="category-section" aria-labelledby="category-'+key+'"><h3 class="category-title" id="category-'+key+'">'+E(cat[key])+' <span>'+String(group.length).padStart(2,'0')+'</span></h3><div class="cards">'+group.map(card).join('')+'</div></section>';
 }).join('');
 $('results').setAttribute('aria-busy','false');$('empty').hidden=rows.length>0;
 updateURL();
 if(focusKey)document.querySelector('[data-'+focusKey+'="'+CSS.escape(focusValue)+'"]')?.focus({preventScroll:true});
}
function update(patch){state={...state,...patch};render();}
document.addEventListener('click',async e=>{
 const c=e.target.closest('[data-country]');if(c){update({country:c.dataset.country,scope:'country',q:'',category:'all',saved:false});return;}
 const p=e.target.closest('[data-purpose]');if(p){update({purpose:p.dataset.purpose});return;}
 const f=e.target.closest('[data-category]');if(f){update({category:f.dataset.category});return;}
 const s=e.target.closest('[data-save]');if(s){
  const id=s.dataset.save;if(favorites.has(id))favorites.delete(id);else favorites.add(id);
  try{localStorage.setItem('destination-desk:favorites:v1',JSON.stringify([...favorites]));}catch{storageOK=false;}
  const activeId=id,wasSaved=favorites.has(id);render();
  document.querySelector('[data-save="'+CSS.escape(activeId)+'"]')?.focus({preventScroll:true});
  toast(wasSaved?t('已收藏 · 仅保存在本机','Bookmarked · saved in this browser'):t('已取消收藏','Bookmark removed'));return;
 }
 const entry=e.target.closest('[data-entry]');if(entry){const target=$('entry-'+entry.dataset.entry);if(target){target.querySelector('details').open=true;target.querySelector('summary').focus({preventScroll:true});}return;}
});
$('country-search').addEventListener('input',()=>renderCountries());
$('platform-search').addEventListener('input',e=>update({q:e.target.value}));
$('search-scope').addEventListener('change',e=>update({scope:e.target.value}));
$('saved-filter').addEventListener('click',()=>update({saved:!state.saved}));
$('clear-filters').addEventListener('click',()=>update({category:'all',q:'',saved:false,scope:'country'}));
$('share').addEventListener('click',()=>{
 const url=stateURL(location.href,{...state,saved:false}).href;
 $('share-url').value=url;$('share-dialog').showModal();$('share-url').select();
});
$('copy-link').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('share-url').value);toast(t('链接已复制 · 不含收藏','Link copied · bookmarks excluded'));}
 catch{$('share-url').select();toast(t('请手动复制已选中的链接','Copy the selected link manually'));}
});
window.addEventListener('popstate',()=>{state=readState(location.href,data.countries.map(c=>c.id));render();});
window.addEventListener('storage',e=>{if(e.key==='destination-desk:favorites:v1'){try{const a=JSON.parse(e.newValue||'[]');favorites=new Set(Array.isArray(a)?a:[]);render();}catch{}}});
async function start(){
 configure();
 try{
  const response=await fetch(new URL('./directory.json',import.meta.url));if(!response.ok)throw new Error('Directory unavailable');
  data=await response.json();
  const ids=new Set(data.records.map(r=>r.id));favorites=new Set([...favorites].filter(id=>ids.has(id)));
  state=readState(location.href,data.countries.map(c=>c.id));render();
 }catch{
  $('results').setAttribute('aria-busy','false');$('result-count').textContent=t('入口资料暂时无法载入。请刷新页面重试。','The directory could not load. Please refresh to try again.');
  $('quick-section').hidden=true;
 }
}
start();

