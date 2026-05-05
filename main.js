(function() {
  'use strict';

  if (window.__qiyu_loaded) return;
  window.__qiyu_loaded = true;

  const log = (...a) => console.log('[七域]', ...a);

  // ===== utils =====
  function injectCSS() {
    if (document.getElementById('qiyu-style-link')) return;
    const link = document.createElement('link');
    link.id = 'qiyu-style-link';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/Anastasia2372/qiyuyuanji@main/style.css';
    document.head.appendChild(link);
  }

  function getCtx() {
    try { return window.SillyTavern?.getContext?.(); } catch(_) { return null; }
  }

  function getStatData() {
    try {
      if (typeof getAllVariables === 'function') {
        const vars = getAllVariables();
        return vars?.stat_data || {};
      }
    } catch(_) {}
    const ctx = getCtx();
    return ctx?.variables?.global?.stat_data || ctx?.chatMetadata?.variables?.stat_data || {};
  }

  function getChat() {
    return getCtx()?.chat || window.chat || [];
  }

  function extractGametxt(text) {
    if (!text) return '';
    const m = text.match(/<gametxt>([\s\S]*?)<\/gametxt>/);
    if (m) return m[1].trim();
    return text.replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, '').trim();
  }

  function isTutorReply(text) {
    return !text.includes('<gametxt>') && !text.includes('<UpdateVariable>');
  }

  function escHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtMd(text) {
    return escHTML(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ===== DOM 构建 =====
  const PANEL_LIST = [
    ['player', '玩家面板'], ['companions', '同伴面板'], ['island', '空岛面板'],
    ['subjob', '副职面板'], ['fishing', '钓鱼'], ['farming', '种地'],
    ['events', '世界事件'], ['reputation', '声望阵营'], ['dynamics', '动态面板'],
    ['encyclopedia', '图鉴'], ['difficulty', '难度切换'], ['tutor', '教学助手'],
    ['settings', '设置'],
  ];

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'qiyu-overlay';
    overlay.innerHTML = `
      <header id="qiyu-status-bar">
        <div>领主 <span id="qiyu-stat-name">未定</span></div>
        <div>阶级 <span id="qiyu-stat-level">凡人</span></div>
        <div>势力 <span id="qiyu-stat-faction">未定</span></div>
        <div>位置 <span id="qiyu-stat-loc">未定</span></div>
        <div>时辰 <span id="qiyu-stat-time">未定</span></div>
        <div>季节 <span id="qiyu-stat-season">未定</span></div>
        <div>在场 <span id="qiyu-stat-party">无</span></div>
        <div>难度 <span id="qiyu-stat-difficulty">星衡</span></div>
        <div>天元 <span id="qiyu-stat-tianyuan">石0/玉0/晶0/源0</span></div>
      </header>
      <main id="qiyu-messages"></main>
      <footer id="qiyu-input-area">
        <textarea id="qiyu-input" placeholder="输入消息（Enter 发送, Shift+Enter 换行）..." rows="2"></textarea>
        <button id="qiyu-tutor" title="问游戏机制">问机制</button>
        <button id="qiyu-send">发送</button>
      </footer>
      <button id="qiyu-fab" class="qiyu-fab" aria-label="七域菜单">
        <span class="qiyu-fab-inner"></span>
      </button>
      <nav id="qiyu-menu" class="qiyu-menu hidden">
        <ul>${PANEL_LIST.map(([id, t]) => `<li data-panel="${id}">${t}</li>`).join('')}</ul>
      </nav>
      ${PANEL_LIST.map(([id, t]) => `
        <div class="qiyu-panel hidden" data-panel-id="${id}">
          <button class="qiyu-panel-close">×</button>
          <h2>${t}</h2>
          <div class="qiyu-panel-body" data-panel-body="${id}"></div>
        </div>`).join('')}
      <div id="qiyu-esc-hint">按 ESC 切换 SillyTavern 默认界面</div>
    `;
    return overlay;
  }

  // ===== 悬浮球 =====
  function setupFab() {
    const fab = document.getElementById('qiyu-fab');
    const menu = document.getElementById('qiyu-menu');
    let isDragging = false, didMove = false, startX, startY, fabX, fabY;

    try {
      const saved = JSON.parse(localStorage.getItem('qiyu_fab_pos') || 'null');
      if (saved) {
        fab.style.left = saved.x + 'px'; fab.style.top = saved.y + 'px';
        fab.style.right = 'auto'; fab.style.bottom = 'auto';
      }
    } catch(_) {}

    fab.addEventListener('pointerdown', (e) => {
      isDragging = true; didMove = false;
      const rect = fab.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      fabX = rect.left; fabY = rect.top;
      fab.classList.add('dragging');
      try { fab.setPointerCapture(e.pointerId); } catch(_) {}
      e.preventDefault();
    });

    document.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didMove = true;
      if (didMove) {
        const newX = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, fabX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, fabY + dy));
        fab.style.transform = `translate3d(${newX - fabX}px, ${newY - fabY}px, 0)`;
      }
    });

    document.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      fab.classList.remove('dragging');
      if (!didMove) {
        if (menu.classList.contains('hidden')) {
          positionMenu(); menu.classList.remove('hidden');
        } else {
          menu.classList.add('hidden');
        }
      } else {
        const rect = fab.getBoundingClientRect();
        fab.style.left = rect.left + 'px'; fab.style.top = rect.top + 'px';
        fab.style.right = 'auto'; fab.style.bottom = 'auto';
        fab.style.transform = '';
        try { localStorage.setItem('qiyu_fab_pos', JSON.stringify({x: rect.left, y: rect.top})); } catch(_) {}
      }
    });

    function positionMenu() {
      const r = fab.getBoundingClientRect();
      const w = 240, hMax = window.innerHeight * 0.7;
      let left = r.right - w; if (left < 16) left = 16;
      let top = r.top - hMax - 12; if (top < 16) top = r.bottom + 12;
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      menu.style.right = 'auto'; menu.style.bottom = 'auto';
    }

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== fab && !fab.contains(e.target)
          && !e.target.closest('.qiyu-panel')) {
        menu.classList.add('hidden');
      }
    });

    menu.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        showPanel(li.dataset.panel);
        menu.classList.add('hidden');
      });
    });

    document.querySelectorAll('.qiyu-panel-close').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.qiyu-panel').classList.add('hidden'));
    });
  }

  // ===== 面板渲染 =====
  function showPanel(id) {
    document.querySelectorAll('.qiyu-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.querySelector(`.qiyu-panel[data-panel-id="${id}"]`);
    if (!panel) return;
    panel.classList.remove('hidden');
    const body = panel.querySelector('.qiyu-panel-body');
    const stat = getStatData();
    body.innerHTML = renderPanelContent(id, stat);
  }

  function dr(k, v) { return `<div class="qiyu-data-row"><span class="key">${escHTML(k)}</span><span class="val">${escHTML(v ?? '-')}</span></div>`; }
  function dh(t) { return `<div class="qiyu-data-row heading">${escHTML(t)}</div>`; }
  function empty(t) { return `<div class="qiyu-empty">${t}</div>`; }

  function renderPanelContent(id, s) {
    const renders = {
      player: () => {
        const m = s.主角 || {}, t = m.天元 || {}, e = m.装备 || {};
        return dr('姓名', m.姓名) + dr('当前阶级', m.当前阶级) + dr('当前势力', m.当前势力)
          + dr('源石阶印记', m.源石阶印记 || '未认证') + dr('契约物品', m.契约物品)
          + dh('天元')
          + dr('石质', t.石质天元 ?? 0) + dr('玉质', t.玉质天元 ?? 0) + dr('晶质', t.晶质天元 ?? 0)
          + dr('源质', t.源质天元 ?? 0) + dr('渊骨币', t.渊骨币 ?? 0)
          + dh('装备')
          + dr('头部', e.头部) + dr('胸部', e.胸部) + dr('腿部', e.腿部) + dr('脚部', e.脚部) + dr('武器', e.武器);
      },
      companions: () => {
        const c = s.同伴 || {}, ent = c.entries || {};
        const arr = Object.values(ent).filter(v => v && typeof v === 'object' && v.id);
        if (!arr.length) return empty('还没有契约同伴。<br>孵化第一颗蛋开启同伴之旅。');
        return arr.map(c => dh(`${c.名字 || '???'} (${c.种族 || '未知'})`)
          + dr('羁绊度', `${c.羁绊度 ?? 0} (${c.羁绊阶段 || '陌生'})`)
          + dr('心情', c.心情 || '平静') + dr('忠诚', c.忠诚 || '中立')
          + dr('契约状态', c.契约状态 || '正常')
          + (c.个人委托?.类型 ? dr(`委托·${c.个人委托.类型}`, c.个人委托.阶段 || '未触发') : '')
        ).join('');
      },
      island: () => {
        const i = s.空岛领地 || {};
        if (!i.规模 || i.规模 === '未购置') return empty('还没有空岛。<br>从皇室购入第一座空岛开启领主之旅。');
        const ind = i.产业链 || {}, sj = i.副职熟练度 || {}, lm = i.领民管理 || {}, dg = i.危机标记 || {};
        return dr('规模', i.规模) + dr('地脉品质', i.地脉品质)
          + dr('嵌入元素源石', (i.嵌入元素源石 || []).join(' / ') || '无')
          + dh('产业链') + Object.entries(ind).map(([k,v]) => dr(k,v)).join('')
          + dh('副职熟练度') + Object.entries(sj).map(([k,v]) => dr(k, `${v}/100`)).join('')
          + dh('领民') + dr('辅助型同伴总数', lm.辅助型同伴总数 ?? 0)
          + dr('综合心情', lm.综合心情指数 || '良好')
          + dh('危机') + Object.entries(dg).map(([k,v]) => dr(k,v)).join('');
      },
      subjob: () => {
        const sj = s.空岛领地?.副职熟练度 || {};
        const items = Object.entries(sj);
        if (!items.length) return empty('还没有副职熟练度数据。');
        return items.map(([k,v]) => {
          const stage = v <= 25 ? '入门' : v <= 50 ? '精进' : v <= 75 ? '大师' : '宗师';
          return dr(k, `${v}/100 (${stage})`);
        }).join('');
      },
      fishing: () => {
        const f = s.钓鱼 || {}, eq = f.装备 || {}, bait = eq.饵料 || {};
        return dr('地面熟练度', `${f.地面熟练度 ?? 0}/100`)
          + dr('空岛熟练度', `${f.空岛熟练度 ?? 0}/100`)
          + dh('装备') + dr('鱼竿', eq.鱼竿 || '入门级')
          + dh('饵料') + Object.entries(bait).map(([k,v]) => dr(k,v)).join('')
          + dh('稀有钓获史')
          + ((f.稀有钓获史 || []).length === 0 ? empty('还没钓到稀有鱼。')
              : f.稀有钓获史.map(r => dr(r.鱼种 || '?', `${r.地点 || ''} · ${r.日期 || ''}`)).join(''));
      },
      farming: () => {
        const f = s.种地 || {}, fields = f.田地 || [], stock = f.作物库存 || {};
        return dr('种地熟练度', `${f.种地熟练度 ?? 0}/100`)
          + dr('已解锁作物', (f.已解锁作物 || []).join(' / ') || '-')
          + dh('当前田地')
          + (fields.length ? fields.map(fd => dr(fd.作物种类 || '?', `${fd.当前阶段 || '播种'} · 健康${fd.健康度 ?? 100}`)).join('') : empty('还没种过作物。'))
          + dh('作物库存')
          + (Object.keys(stock).length ? Object.entries(stock).map(([k,v]) => dr(k,v)).join('') : empty('库存为空。'));
      },
      events: () => {
        const e = s.世界事件 || {};
        const items = Object.entries(e).filter(([k]) => !k.startsWith('$'));
        if (!items.length) return empty('世界事件状态未启动。');
        return items.map(([n,d]) => {
          const st = (d && typeof d === 'object') ? d.状态 || '未触发' : '未触发';
          const pr = (d && typeof d === 'object') ? d.进度 || 0 : 0;
          return dr(n, `${st} (${pr}%)`);
        }).join('');
      },
      reputation: () => {
        const r = s.声望阵营 || {};
        function grp(g, t) {
          const data = r[g] || {};
          const items = Object.entries(data).filter(([k]) => !k.startsWith('$'));
          if (!items.length) return '';
          return dh(t) + items.map(([k,v]) => {
            const tier = v <= -51 ? '死敌' : v <= -21 ? '敌对' : v <= 20 ? '中立' : v <= 50 ? '友好' : '盟友';
            return dr(k, `${v} (${tier})`);
          }).join('');
        }
        const out = grp('七国王室','七国王室') + grp('特权家族','特权家族') + grp('中枢机构','中枢机构') + grp('法外势力','法外势力');
        return out || empty('声望未启动。');
      },
      dynamics: () => {
        const d = s.当前世界动态 || {};
        return dh('活跃世界事件')
          + ((d.活跃事件 || []).length ? d.活跃事件.map(ev => `<div class="qiyu-data-row"><span class="val">${escHTML(ev)}</span></div>`).join('') : empty('无'))
          + dh('酒馆传闻')
          + ((d.酒馆传闻 || []).length ? d.酒馆传闻.map(r => `<div class="qiyu-data-row"><span class="val">· ${escHTML(r)}</span></div>`).join('') : empty('最近无传闻。'))
          + dh('邻国动态')
          + `<div class="qiyu-data-row"><span class="val">${escHTML(d.邻国动态 || '风平浪静')}</span></div>`;
      },
      encyclopedia: () => {
        const e = s.图鉴 || {};
        const groups = ['钓鱼图鉴','种地图鉴','同伴图鉴','NPC图鉴','副本图鉴','配方图鉴','装备遗物图鉴'];
        return groups.map(g => {
          const gd = e[g] || {};
          const total = gd.已发现总数 ?? 0;
          const comp = gd.完整度 || `${total} 项`;
          return dr(g, `${comp} · ${total} 项`);
        }).join('') || empty('图鉴未启动。');
      },
      difficulty: () => {
        const cur = s.难度模式 || '星衡';
        const diffs = [['星眷','世界温柔向 user 倾斜，主角光环'],['星衡','不偏不倚按世界逻辑走，公允'],
                      ['星弃','全世界对 user 充满恶意，最虐'],['星裁','严苛真实逻辑审查，硬核']];
        return `<div class="qiyu-difficulty-grid">${diffs.map(([n,d]) =>
          `<div class="qiyu-difficulty-card ${cur===n?'active':''}" data-diff="${n}">
            <h3>${n}</h3><p>${d}</p></div>`).join('')}</div>
          <div style="margin-top:16px;color:#9a8e78;font-size:0.85rem;line-height:1.6">
          点击切换难度需要在 SillyTavern 世界书页手动启用对应"难度·XX"条目，下个版本支持自动切换。</div>`;
      },
      tutor: () => `<div class="qiyu-empty" style="text-align:left;line-height:1.8">
          教学助手用法: 在底部输入框旁的 <strong>问机制</strong> 按钮里输入问题，AI 会跳出角色用第一人称答游戏机制。<br><br>
          例如:<ul style="text-align:left;margin:8px 0 0 20px"><li>怎么孵蛋?</li><li>羁绊度怎么涨?</li>
          <li>种地的作物什么时候熟?</li><li>为什么我突破不了?</li></ul></div>`,
      settings: () => `<div class="qiyu-empty" style="text-align:left;line-height:1.8">
          设置项 (待开发):<ul style="text-align:left;margin:8px 0 0 20px"><li>UI 风格切换</li>
          <li>字号调整</li><li>动画效果开关</li><li>悬浮球位置重置</li></ul><br>
          当前可用: 按 <strong>ESC</strong> 临时切换 SillyTavern 默认界面。</div>`,
    };
    return (renders[id] || (() => empty('面板待开发')))();
  }

  // ===== 状态栏数据绑定 =====
  function refreshState() {
    const stat = getStatData();
    const m = stat.主角 || {}, t = m.天元 || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v ?? '未定'; };
    set('qiyu-stat-name', m.姓名 || '未定');
    set('qiyu-stat-level', m.当前阶级 || '凡人');
    set('qiyu-stat-faction', m.当前势力 || '未定');
    set('qiyu-stat-loc', stat.大区域 || '未定');
    set('qiyu-stat-time', stat.时辰 || '未定');
    set('qiyu-stat-season', stat.季节 || '未定');
    set('qiyu-stat-party', stat.在场角色 || '无');
    set('qiyu-stat-difficulty', stat.难度模式 || '星衡');
    set('qiyu-stat-tianyuan', `石${t.石质天元 ?? 0}/玉${t.玉质天元 ?? 0}/晶${t.晶质天元 ?? 0}/源${t.源质天元 ?? 0}`);

    // 同步刷新打开的面板
    const openPanel = document.querySelector('.qiyu-panel:not(.hidden)');
    if (openPanel) {
      const id = openPanel.dataset.panelId;
      const body = openPanel.querySelector('.qiyu-panel-body');
      if (body) body.innerHTML = renderPanelContent(id, stat);
    }
  }

  // ===== 对话流渲染 =====
  let lastChatLen = -1;
  function refreshMessages() {
    const el = document.getElementById('qiyu-messages');
    if (!el) return;
    const chat = getChat();
    if (chat.length === lastChatLen && el.children.length === chat.length) return;
    lastChatLen = chat.length;
    el.innerHTML = chat.map(msg => {
      const text = extractGametxt(msg.mes);
      if (!text) return '';
      const cls = msg.is_user ? 'user' : (isTutorReply(msg.mes) ? 'tutor' : 'ai');
      return `<div class="qiyu-bubble ${cls}">${fmtMd(text)}</div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ===== 输入区 =====
  function setupInput() {
    const input = document.getElementById('qiyu-input');
    const sendBtn = document.getElementById('qiyu-send');
    const tutorBtn = document.getElementById('qiyu-tutor');
    function send(text) {
      text = text.trim();
      if (!text) return;
      const stInput = document.querySelector('#send_textarea');
      const stSend = document.querySelector('#send_but');
      if (stInput && stSend) {
        stInput.value = text;
        stInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => stSend.click(), 50);
      } else {
        alert('找不到 SillyTavern 输入框，按 ESC 退出后用默认界面发送');
        return;
      }
      input.value = '';
    }
    sendBtn.addEventListener('click', () => send(input.value));
    tutorBtn.addEventListener('click', () => {
      const t = input.value.trim();
      if (!t) { alert('请先输入要问的机制问题'); return; }
      send('[教学问询] ' + t);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
  }

  // ===== ESC 切换 =====
  function setupESC() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.classList.toggle('qiyu-overlay-hidden');
        const hint = document.getElementById('qiyu-esc-hint');
        if (hint) {
          hint.classList.add('show');
          clearTimeout(hint._timer);
          hint._timer = setTimeout(() => hint.classList.remove('show'), 2000);
        }
      }
    });
  }

  // ===== ST 事件监听 =====
  function setupSTEvents() {
    function tryListen(ev, h) {
      try {
        if (typeof eventOn === 'function') { eventOn(ev, h); return true; }
        const ctx = getCtx();
        if (ctx?.eventSource?.on) { ctx.eventSource.on(ev, h); return true; }
      } catch(_) {}
      return false;
    }
    if (window.Mvu?.events) tryListen(window.Mvu.events.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', refreshState);
    tryListen('MESSAGE_RECEIVED', () => { refreshMessages(); refreshState(); });
    tryListen('MESSAGE_SENT', () => { refreshMessages(); });
    tryListen('CHAT_CHANGED', () => { refreshMessages(); refreshState(); });
    tryListen('character_message_rendered', () => { refreshMessages(); refreshState(); });
    setInterval(() => { refreshState(); refreshMessages(); }, 2500);
  }

  // ===== 初始化 =====
  function init() {
    if (document.getElementById('qiyu-overlay')) return;
    injectCSS();
    document.body.appendChild(buildOverlay());
    document.body.classList.add('qiyu-active');
    setupFab();
    setupInput();
    setupESC();
    refreshState();
    refreshMessages();
    setupSTEvents();
    log('伪零层 UI 加载完成');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
