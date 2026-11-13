'use strict';
const field = document.getElementById('learning-filter');
const cards = [...document.querySelectorAll('[data-filter-card]')];
const count = document.getElementById('learning-count');
function filter() {
  const query = field.value.trim().toLocaleLowerCase();
  let shown = 0;
  for (const card of cards) {
    card.hidden = !card.textContent.toLocaleLowerCase().includes(query);
    if (!card.hidden) shown++;
  }
  count.textContent = document.documentElement.lang === 'zh-CN'
    ? `显示 ${shown} / ${cards.length} 项` : `${shown} / ${cards.length} entries`;
}
field.addEventListener('input', filter);
filter();
