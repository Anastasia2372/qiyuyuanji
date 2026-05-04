(function(){
  'use strict';

  const fab = document.getElementById('qiyu-fab');
  const menu = document.getElementById('qiyu-menu');

  if (!fab || !menu) {
    console.warn('[七域源纪] FAB or menu element not found');
    return;
  }

  let isDragging = false;
  let didMove = false;
  let startX, startY, startLeft, startTop;

  function toggleMenu() {
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    menu.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
  }

  function closeMenu() {
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }

  fab.addEventListener('mousedown', (e) => {
    isDragging = true;
    didMove = false;
    const rect = fab.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didMove = true;
    if (didMove) {
      const newLeft = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, startTop + dy));
      fab.style.left = newLeft + 'px';
      fab.style.top = newTop + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (!didMove) {
      toggleMenu();
    } else {
      const rect = fab.getBoundingClientRect();
      try {
        localStorage.setItem('qiyu_fab_pos', JSON.stringify({left: rect.left, top: rect.top}));
      } catch(_) {}
    }
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      closeMenu();
    }
  });

  menu.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = li.dataset.panel;
      console.log('[七域源纪] 菜单点击:', panel, '/', li.textContent.trim());
      closeMenu();
    });
  });

  try {
    const saved = JSON.parse(localStorage.getItem('qiyu_fab_pos') || 'null');
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      const left = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, saved.left));
      const top = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, saved.top));
      fab.style.left = left + 'px';
      fab.style.top = top + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  } catch(_) {}

  console.log('[七域源纪] UI 骨架已加载 · 阶段一');
})();
