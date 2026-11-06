(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('.sidebar');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  const zh = document.documentElement.lang.startsWith('zh');
  document.querySelectorAll('.code-block').forEach(block => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'copy-button';
    button.textContent = zh ? '复制' : 'Copy';
    button.setAttribute('aria-label', zh ? '复制代码' : 'Copy code');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(block.querySelector('code').textContent);
        button.textContent = zh ? '已复制' : 'Copied';
      } catch {
        button.textContent = zh ? '请选择文本复制' : 'Select text to copy';
      }
      setTimeout(() => { button.textContent = zh ? '复制' : 'Copy'; }, 2000);
    });
    block.appendChild(button);
  });
  document.querySelector('.language')?.addEventListener('click', event => {
    const link = event.currentTarget;
    if (location.hash) link.hash = location.hash;
  });
})();
