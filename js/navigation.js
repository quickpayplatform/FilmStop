(() => {
  const menus = [...document.querySelectorAll('.site-menu')];
  for (const menu of menus) {
    const toggle = menu.querySelector('summary');
    const close = () => { menu.open = false; };
    menu.addEventListener('toggle', () => {
      toggle.setAttribute('aria-expanded', String(menu.open));
      toggle.setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
    });
    toggle.setAttribute('aria-expanded', String(menu.open));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
    document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) { close(); toggle.focus(); }
    });
    document.addEventListener('focusin', event => { if (!menu.contains(event.target)) close(); });
  }
})();
