export const zh = document.documentElement.lang.startsWith('zh');
export const t = (en, cn) => zh ? cn : en;
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export const $ = id => document.getElementById(id);
export function download(name, data, type = 'application/json') {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'], {type});
  const url = URL.createObjectURL(blob), link = h('a', {href: url, download: name});
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function table(headers, rows) {
  return h('div', {class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': headers.join(' / ')},
    h('table', {}, h('thead', {}, h('tr', {}, headers.map(v => h('th', {scope: 'col'}, v)))),
      h('tbody', {}, rows.map(row => h('tr', {}, row.map(v => h('td', {}, v)))))));
}
export function metric(label, value, detail = '') {
  return h('div', {class: 'metric'}, h('span', {class: 'kicker'}, label), h('strong', {}, value), h('small', {}, detail));
}
export const badge = (label, good) => h('span', {class: `badge ${good ? 'good' : 'bad'}`}, label);
export function showError(error) { $('status').textContent = error?.message || String(error); $('status').className = 'status error'; }
export function showStatus(message) { $('status').textContent = message; $('status').className = 'status'; }
export async function readJsonFile(file, limit = 2 * 1024 * 1024) {
  if (!file || file.size > limit) throw new Error(t('Choose a JSON file up to 2 MB.', '请选择不超过 2 MB 的 JSON 文件。'));
  return await file.text();
}
