/**
 * 七域源纪 伪零层 UI · v2 升级版
 * 在 cdn 现版基础上为每个面板加交互（不只是展示）
 *
 * 新增：
 *  - 难度面板可点击切换（改 stat_data.难度模式 + 切 lorebook 条目 enabled）
 *  - 同伴面板：孵蛋按钮、互动按钮
 *  - 副职面板：修炼按钮
 *  - 钓鱼面板：开钓（地面/空岛）按钮、升级装备按钮
 *  - 种地面板：种植/收获按钮
 *  - 世界事件面板：介入按钮
 *  - 设置面板：重置 FAB 位置/字号 +/- 实际可用
 *
 * 交互机制：
 *  - 大部分操作 = 发系统消息（如 [操作:孵蛋]）给 AI，让 AI 响应剧情 + 更新 MVU 变量
 *  - 难度切换 = 直接改 stat_data.难度模式 + 调 ST API 切 lorebook 条目 enabled
 *
 * 给朔：保存到 D:\yuanwenjian\新main.js → 你 push 到 GitHub repo Anastasia2372/qiyuyuanji@main/main.js
 *      cdn 缓存通常几分钟同步，必要时用 purge.jsdelivr.net 主动刷新
 */
(function() {
  'use strict';

  // ============================================================
  // parent 引用（同源 srcdoc iframe 突破到 ST 主页面）
  // ============================================================
  let P, PDOC, PBODY, PHEAD;
  try {
    P = window.parent || window;
    PDOC = P.document;
    PBODY = PDOC.body;
    PHEAD = PDOC.head;
    if (!PBODY) throw new Error('parent body null');
  } catch (e) {
    console.error('[七域] parent 不可访问，退化到本地 document:', e);
    P = window; PDOC = document; PBODY = document.body; PHEAD = document.head;
  }

  if (P.__qiyu_loaded) {
    console.log('[七域] 已加载，跳过');
    return;
  }
  P.__qiyu_loaded = true;

  const log = (...a) => console.log('[七域]', ...a);
  log('启动 v2 parent.body children:', PBODY?.children?.length, 'window===parent:', window === P);

  // ============================================================
  // 工具函数
  // ============================================================
  function injectCSS() {
    if (PHEAD.querySelector('#qiyu-style-link')) return;
    const link = PDOC.createElement('link');
    link.id = 'qiyu-style-link';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/Anastasia2372/qiyuyuanji@main/style.css';
    PHEAD.appendChild(link);
  }

  function getCtx() {
    try { return P.SillyTavern?.getContext?.() || window.SillyTavern?.getContext?.(); } catch(_) { return null; }
  }
  function getStatData() {
    try {
      if (typeof P.getAllVariables === 'function') return P.getAllVariables()?.stat_data || {};
      if (typeof getAllVariables === 'function') return getAllVariables()?.stat_data || {};
    } catch(_) {}
    const ctx = getCtx();
    return ctx?.variables?.global?.stat_data || ctx?.chatMetadata?.variables?.stat_data || {};
  }
  function getChat() { return getCtx()?.chat || P.chat || window.chat || []; }
  function extractGametxt(text) {
    if (!text) return '';
    const m = text.match(/<gametxt>([\s\S]*?)<\/gametxt>/);
    if (m) return m[1].trim();
    return text.replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, '').trim();
  }
  function isTutorReply(text) {
    return !text.includes('<gametxt>') && !text.includes('<UpdateVariable>');
  }
  function escHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtMd(text) {
    return escHTML(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ============================================================
  // 13 面板配置
  // ============================================================
  const PANEL_LIST = [
    ['player', '玩家面板'], ['companions', '同伴面板'], ['island', '空岛面板'],
    ['subjob', '副职面板'], ['fishing', '钓鱼'], ['farming', '种地'],
    ['events', '世界事件'], ['reputation', '声望阵营'], ['dynamics', '动态面板'],
    ['encyclopedia', '图鉴'], ['difficulty', '难度切换'], ['tutor', '教学助手'],
    ['settings', '设置'],
  ];

  // ============================================================
  // overlay 构建
  // ============================================================
  function buildOverlay() {
    const overlay = PDOC.createElement('div');
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

  // ============================================================
  // 悬浮球（FAB）+ 拖动 + localStorage 记位置
  // ============================================================
  function setupFab() {
    const fab = PDOC.getElementById('qiyu-fab');
    const menu = PDOC.getElementById('qiyu-menu');
    if (!fab || !menu) return;
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

    PDOC.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didMove = true;
      if (didMove) {
        const newX = Math.max(0, Math.min(P.innerWidth - fab.offsetWidth, fabX + dx));
        const newY = Math.max(0, Math.min(P.innerHeight - fab.offsetHeight, fabY + dy));
        fab.style.transform = `translate3d(${newX - fabX}px, ${newY - fabY}px, 0)`;
      }
    });

    PDOC.addEventListener('pointerup', (e) => {
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
      const w = 240, hMax = P.innerHeight * 0.7;
      let left = r.right - w; if (left < 16) left = 16;
      let top = r.top - hMax - 12; if (top < 16) top = r.bottom + 12;
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      menu.style.right = 'auto'; menu.style.bottom = 'auto';
    }

    PDOC.addEventListener('click', (e) => {
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

    PDOC.querySelectorAll('.qiyu-panel-close').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.qiyu-panel').classList.add('hidden'));
    });
  }

  function showPanel(id) {
    PDOC.querySelectorAll('.qiyu-panel').forEach(p => p.classList.add('hidden'));
    const panel = PDOC.querySelector(`.qiyu-panel[data-panel-id="${id}"]`);
    if (!panel) return;
    panel.classList.remove('hidden');
    const body = panel.querySelector('.qiyu-panel-body');
    body.innerHTML = renderPanelContent(id, getStatData());
    // 绑定面板内交互
    bindPanelInteractions(id, panel);
  }

  // ============================================================
  // 渲染辅助
  // ============================================================
  function dr(k, v) { return `<div class="qiyu-data-row"><span class="key">${escHTML(k)}</span><span class="val">${escHTML(v ?? '-')}</span></div>`; }
  function dh(t) { return `<div class="qiyu-data-row heading">${escHTML(t)}</div>`; }
  function empty(t) { return `<div class="qiyu-empty">${t}</div>`; }
  function btnRow(html) { return `<div class="qiyu-action-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">${html}</div>`; }
  function actBtn(label, action, dataAttr) {
    const data = dataAttr ? Object.entries(dataAttr).map(([k,v]) => `data-${k}="${escHTML(v)}"`).join(' ') : '';
    return `<button class="qiyu-action-btn" data-action="${action}" ${data} style="padding:6px 14px;background:linear-gradient(135deg,rgba(212,175,55,0.15) 0%,rgba(168,216,255,0.1) 100%);border:1px solid rgba(212,175,55,0.4);color:#f0d878;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;">${escHTML(label)}</button>`;
  }

  // ============================================================
  // 面板内容渲染（13 个面板）
  // ============================================================
  function renderPanelContent(id, s) {
    const renders = {
      player: () => {
        const m = s.主角 || {}, t = m.天元 || {}, e = m.装备 || {};
        let html = dr('姓名', m.姓名) + dr('性别', m.性别) + dr('年龄', m.年龄) + dr('血脉', m.血脉)
          + dr('当前阶级', m.当前阶级) + dr('当前势力', m.当前势力)
          + dr('源石阶印记', m.源石阶印记 || '未认证') + dr('契约物品', m.契约物品)
          + dh('天元')
          + dr('石质', t.石质天元 ?? 0) + dr('玉质', t.玉质天元 ?? 0) + dr('晶质', t.晶质天元 ?? 0)
          + dr('源质', t.源质天元 ?? 0) + dr('渊骨币', t.渊骨币 ?? 0)
          + dh('装备')
          + dr('头部', e.头部) + dr('胸部', e.胸部) + dr('腿部', e.腿部) + dr('脚部', e.脚部) + dr('武器', e.武器);
        if (m.宿命) {
          html += dh('宿命');
          if (typeof m.宿命 === 'object') {
            html += dr('名号', m.宿命.name);
            if (m.宿命.desc) html += dr('描述', m.宿命.desc.length > 60 ? m.宿命.desc.substring(0, 60) + '...' : m.宿命.desc);
          } else html += dr('宿命', m.宿命);
        }
        return html;
      },
      companions: () => {
        const c = s.同伴 || {}, ent = c.entries || {};
        const arr = Object.values(ent).filter(v => v && typeof v === 'object' && v.id);
        let html = btnRow(actBtn('孵新蛋', 'hatch_egg'));
        if (!arr.length) {
          html += empty('还没有契约同伴。<br>点上方"孵新蛋"开启同伴之旅。');
          return html;
        }
        html += arr.map(c => dh(`${c.名字 || '???'} (${c.种族 || '未知'})`)
          + dr('羁绊度', `${c.羁绊度 ?? 0} (${c.羁绊阶段 || '陌生'})`)
          + dr('心情', c.心情 || '平静') + dr('忠诚', c.忠诚 || '中立')
          + dr('契约状态', c.契约状态 || '正常')
          + (c.关系 ? dr('关系', c.关系) : '')
          + (c.外貌 ? dr('外貌', c.外貌) : '')
          + (c.渊源 ? dr('渊源', c.渊源.length > 60 ? c.渊源.substring(0, 60) + '...' : c.渊源) : '')
          + btnRow(
              actBtn('互动', 'comp_interact', { name: c.名字 || c.id })
              + actBtn('详情', 'comp_detail', { name: c.名字 || c.id })
            )
        ).join('');
        return html;
      },
      island: () => {
        const i = s.空岛领地 || {};
        if (!i.规模 || i.规模 === '未购置') {
          return empty('还没有空岛。<br>从皇室购入第一座空岛开启领主之旅。')
            + btnRow(actBtn('购置空岛', 'island_buy'));
        }
        const ind = i.产业链 || {}, sj = i.副职熟练度 || {}, lm = i.领民管理 || {}, dg = i.危机标记 || {};
        let html = dr('规模', i.规模) + dr('地脉品质', i.地脉品质)
          + dr('嵌入元素源石', (i.嵌入元素源石 || []).join(' / ') || '无')
          + dh('产业链') + (Object.entries(ind).length ? Object.entries(ind).map(([k,v]) => dr(k,v)).join('') : empty('暂无产业'))
          + dh('副职熟练度') + (Object.entries(sj).length ? Object.entries(sj).map(([k,v]) => dr(k, `${v}/100`)).join('') : empty('暂无'))
          + dh('领民') + dr('辅助型同伴总数', lm.辅助型同伴总数 ?? 0)
          + dr('综合心情', lm.综合心情指数 || '良好')
          + dh('危机') + (Object.entries(dg).length ? Object.entries(dg).map(([k,v]) => dr(k,v)).join('') : empty('风平浪静'));
        html += btnRow(
          actBtn('升级规模', 'island_upgrade')
          + actBtn('管理产业', 'island_manage_industry')
          + actBtn('处理危机', 'island_handle_crisis')
        );
        return html;
      },
      subjob: () => {
        const sj = s.空岛领地?.副职熟练度 || {};
        const items = Object.entries(sj);
        if (!items.length) return empty('还没有副职熟练度数据。<br>需要先购置空岛。');
        return items.map(([k,v]) => {
          const stage = v <= 25 ? '入门' : v <= 50 ? '精进' : v <= 75 ? '大师' : '宗师';
          return dr(k, `${v}/100 (${stage})`)
            + btnRow(actBtn(`修炼 ${k}`, 'subjob_train', { name: k }));
        }).join('');
      },
      fishing: () => {
        const f = s.钓鱼 || {}, eq = f.装备 || {}, bait = eq.饵料 || {};
        const hasIsland = s.空岛领地?.规模 && s.空岛领地?.规模 !== '未购置';
        let html = dr('地面熟练度', `${f.地面熟练度 ?? 0}/100`)
          + dr('空岛熟练度', `${f.空岛熟练度 ?? 0}/100`)
          + dh('装备') + dr('鱼竿', eq.鱼竿 || '入门级')
          + dh('饵料') + (Object.entries(bait).length ? Object.entries(bait).map(([k,v]) => dr(k,v)).join('') : empty('暂无饵料'));
        html += btnRow(
          actBtn('地面开钓', 'fish_ground')
          + (hasIsland ? actBtn('空岛开钓', 'fish_island') : '')
          + actBtn('升级鱼竿', 'fish_upgrade_rod')
          + actBtn('购买饵料', 'fish_buy_bait')
        );
        return html;
      },
      farming: () => {
        const f = s.种地 || {}, fields = f.田地 || [], stock = f.作物库存 || {};
        let html = dr('种地熟练度', `${f.种地熟练度 ?? 0}/100`)
          + dr('已解锁作物', (f.已解锁作物 || []).join(' / ') || '-')
          + dh('当前田地')
          + (fields.length ? fields.map((fd, idx) =>
              dr(fd.作物种类 || '?', `${fd.当前阶段 || '播种'} · 健康${fd.健康度 ?? 100}`)
              + btnRow(actBtn('查看', 'farm_field_view', { idx }) + (fd.当前阶段 === '成熟' ? actBtn('收获', 'farm_harvest', { idx }) : ''))
            ).join('') : empty('还没种过作物。'))
          + dh('作物库存')
          + (Object.keys(stock).length ? Object.entries(stock).map(([k,v]) => dr(k,v)).join('') : empty('库存为空。'));
        html += btnRow(
          actBtn('开垦新田', 'farm_new_field')
          + actBtn('种植作物', 'farm_plant')
        );
        return html;
      },
      events: () => {
        const e = s.世界事件 || {};
        const items = Object.entries(e).filter(([k]) => !k.startsWith('$'));
        if (!items.length) return empty('世界事件状态未启动。');
        return items.map(([n,d]) => {
          const st = (d && typeof d === 'object') ? d.状态 || '未触发' : '未触发';
          const pr = (d && typeof d === 'object') ? d.进度 || 0 : 0;
          return dr(n, `${st} (${pr}%)`)
            + btnRow(actBtn('追踪', 'event_track', { name: n }) + actBtn('介入', 'event_intervene', { name: n }));
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
            return dr(k, `${v} (${tier})`)
              + btnRow(actBtn('详情', 'rep_detail', { faction: k, group: g }));
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
          + `<div class="qiyu-data-row"><span class="val">${escHTML(d.邻国动态 || '风平浪静')}</span></div>`
          + btnRow(actBtn('刷新动态', 'dyn_refresh'));
      },
      encyclopedia: () => {
        const e = s.图鉴 || {};
        const groups = ['钓鱼图鉴','种地图鉴','同伴图鉴','NPC图鉴','副本图鉴','配方图鉴','装备遗物图鉴'];
        return groups.map(g => {
          const gd = e[g] || {};
          const total = gd.已发现总数 ?? 0;
          const comp = gd.完整度 || `${total} 项`;
          return dr(g, `${comp} · ${total} 项`)
            + btnRow(actBtn('浏览', 'enc_browse', { group: g }));
        }).join('') || empty('图鉴未启动。');
      },
      difficulty: () => {
        const cur = s.难度模式 || '星衡';
        const diffs = [
          ['星眷','世界温柔向 user 倾斜，主角光环。'],
          ['星衡','不偏不倚按世界逻辑走，公允。'],
          ['星弃','全世界对 user 充满恶意，最虐。'],
          ['星裁','严苛真实逻辑审查，硬核。']
        ];
        return `<div class="qiyu-difficulty-grid">${diffs.map(([n,d]) =>
          `<div class="qiyu-difficulty-card ${cur===n?'active':''}" data-action="diff_switch" data-diff="${n}">
            <h3>${n}</h3><p>${d}</p></div>`).join('')}</div>
          <div style="text-align:center;margin-top:14px;font-size:12px;color:#9a8e78;">点击切换难度（实时生效，会同步切换世界书条目）</div>`;
      },
      tutor: () => {
        return `<div style="line-height:1.8;color:#e8e0c8;font-size:14px;">
          教学助手用法：在底部输入框旁的 <strong style="color:#f0d878;">问机制</strong> 按钮里输入问题，AI 会跳出角色用第一人称答游戏机制。<br><br>
          <strong style="color:#a8d8ff;">常见问题：</strong>
          <ul style="margin:8px 0 0 20px;padding:0;">
            <li>怎么孵蛋？</li><li>羁绊度怎么涨？</li>
            <li>种地的作物什么时候熟？</li><li>为什么我突破不了？</li>
            <li>七国之间能自由跨境吗？</li><li>裁定局发现我犯事会怎样？</li>
          </ul></div>
          <div style="margin-top:18px;padding-top:12px;border-top:1px solid rgba(212,175,55,0.3);">
            <textarea id="qiyu-tutor-input" placeholder="或在这里直接输入问题..." rows="3" style="width:100%;background:#0f0f1c;border:1px solid rgba(212,175,55,0.3);color:#e8e0c8;padding:8px 12px;border-radius:6px;font-family:inherit;font-size:14px;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
            ${btnRow(actBtn('问 AI', 'tutor_ask'))}
          </div>`;
      },
      settings: () => {
        return `<div style="line-height:1.9;color:#e8e0c8;font-size:14px;">
          <div class="qiyu-data-row heading">UI 设置</div>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="color:#9a8e78;">字号</span>
              <span>
                ${actBtn('A-', 'set_font_dec')}
                ${actBtn('A+', 'set_font_inc')}
                ${actBtn('重置', 'set_font_reset')}
              </span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="color:#9a8e78;">悬浮球</span>
              ${actBtn('重置位置', 'set_fab_reset')}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="color:#9a8e78;">背景动画</span>
              ${actBtn('开/关', 'set_anim_toggle')}
            </div>
          </div>
          <div class="qiyu-data-row heading" style="margin-top:18px;">退出</div>
          <div style="margin-top:8px;">${actBtn('按 ESC 切回 ST 默认界面', 'set_esc_hint')}</div>
        </div>`;
      },
    };
    return (renders[id] || (() => empty('面板待开发')))();
  }

  // ============================================================
  // 面板内交互绑定
  // ============================================================
  function bindPanelInteractions(panelId, panel) {
    panel.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = el.dataset.action;
        const data = { ...el.dataset };
        delete data.action;
        handleAction(action, data, panel);
      });
    });
    // 教学输入框 Enter 发送
    if (panelId === 'tutor') {
      const ta = panel.querySelector('#qiyu-tutor-input');
      if (ta) {
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAction('tutor_ask', {}, panel);
          }
        });
      }
    }
  }

  // ============================================================
  // 操作处理
  // ============================================================
  function handleAction(action, data, panel) {
    log('action:', action, data);
    switch (action) {
      // 难度切换 —— 直接改 stat_data + 切 lorebook
      case 'diff_switch': {
        const target = data.diff;
        if (!target) return;
        switchDifficulty(target).then(() => {
          // 重新渲染当前面板
          if (panel) {
            const body = panel.querySelector('.qiyu-panel-body');
            if (body) body.innerHTML = renderPanelContent('difficulty', getStatData());
            bindPanelInteractions('difficulty', panel);
          }
          refreshState();
        });
        break;
      }
      // 同伴
      case 'hatch_egg': sendSysMsg('[孵蛋] 我要从源鼎孵化新蛋。'); break;
      case 'comp_interact': sendSysMsg(`[同伴互动] ${data.name}`); break;
      case 'comp_detail': sendSysMsg(`[同伴详情] ${data.name}`); break;
      // 空岛
      case 'island_buy': sendSysMsg('[购置空岛] 我要从皇室购入空岛。'); break;
      case 'island_upgrade': sendSysMsg('[升级空岛规模]'); break;
      case 'island_manage_industry': sendSysMsg('[空岛产业管理]'); break;
      case 'island_handle_crisis': sendSysMsg('[处理空岛危机]'); break;
      // 副职
      case 'subjob_train': sendSysMsg(`[修炼副职] ${data.name}`); break;
      // 钓鱼
      case 'fish_ground': sendSysMsg('[钓鱼·地面] 我要去地面水域钓鱼。'); break;
      case 'fish_island': sendSysMsg('[钓鱼·空岛] 我要在空岛钓鱼。'); break;
      case 'fish_upgrade_rod': sendSysMsg('[升级鱼竿]'); break;
      case 'fish_buy_bait': sendSysMsg('[购买饵料]'); break;
      // 种地
      case 'farm_new_field': sendSysMsg('[开垦新田]'); break;
      case 'farm_plant': sendSysMsg('[种植作物]'); break;
      case 'farm_field_view': sendSysMsg(`[查看田地] 第${data.idx}块`); break;
      case 'farm_harvest': sendSysMsg(`[收获] 第${data.idx}块田地`); break;
      // 世界事件
      case 'event_track': sendSysMsg(`[追踪事件] ${data.name}`); break;
      case 'event_intervene': sendSysMsg(`[介入事件] ${data.name}`); break;
      // 声望
      case 'rep_detail': sendSysMsg(`[势力详情] ${data.faction}（${data.group}）`); break;
      // 动态
      case 'dyn_refresh': sendSysMsg('[刷新世界动态]'); break;
      // 图鉴
      case 'enc_browse': sendSysMsg(`[浏览图鉴] ${data.group}`); break;
      // 教学
      case 'tutor_ask': {
        const ta = PDOC.getElementById('qiyu-tutor-input');
        if (!ta) return;
        const t = ta.value.trim();
        if (!t) { alert('请输入要问的机制问题'); return; }
        sendMsg('[教学问询] ' + t);
        ta.value = '';
        break;
      }
      // 设置
      case 'set_font_dec': adjustFont(-1); break;
      case 'set_font_inc': adjustFont(1); break;
      case 'set_font_reset': adjustFont(0); break;
      case 'set_fab_reset': resetFab(); break;
      case 'set_anim_toggle': toggleBgAnim(); break;
      case 'set_esc_hint': {
        const hint = PDOC.getElementById('qiyu-esc-hint');
        if (hint) {
          hint.classList.add('show');
          clearTimeout(hint._timer);
          hint._timer = setTimeout(() => hint.classList.remove('show'), 3500);
        }
        break;
      }
      default:
        log('未知 action:', action);
    }
  }

  // ============================================================
  // 难度切换：改 stat_data + 切 lorebook
  // ============================================================
  async function switchDifficulty(target) {
    const NAMES = ['难度·星眷', '难度·星衡', '难度·星弃', '难度·星裁'];
    const targetName = '难度·' + target;

    // 1. 改 stat_data.难度模式
    try {
      const stat = getStatData();
      stat.难度模式 = target;
      // 写回 MVU
      if (P.Mvu && typeof P.Mvu.replaceMvuData === 'function') {
        const lid = (typeof P.getLastMessageId === 'function') ? P.getLastMessageId() : 0;
        const data = (P.Mvu.getMvuData ? P.Mvu.getMvuData({ type:'message', message_id: lid }) : {}) || {};
        if (!data.stat_data) data.stat_data = {};
        data.stat_data.难度模式 = target;
        await P.Mvu.replaceMvuData(data, { type:'message', message_id: lid });
      }
    } catch(e) { log('改 stat_data.难度模式 失败:', e); }

    // 2. 切 lorebook 条目（中点 ·）
    try {
      if (typeof P.getCharWorldbookNames !== 'function' || typeof P.getWorldbook !== 'function' || typeof P.replaceWorldbook !== 'function') {
        log('lorebook API 不可用');
      } else {
        const wbSet = new Set();
        const charWB = P.getCharWorldbookNames('current') || {};
        if (charWB.primary) wbSet.add(charWB.primary);
        if (Array.isArray(charWB.additional)) charWB.additional.forEach(n => n && wbSet.add(n));
        // 也尝试卡内嵌 character_book
        for (const wbName of wbSet) {
          let entries;
          try { entries = await P.getWorldbook(wbName); } catch(_) { continue; }
          let changed = false;
          const updated = entries.map(e => {
            const name = String(e && e.name || '');
            if (!NAMES.includes(name)) return e;
            const should = name === targetName;
            if (e.enabled !== should) { changed = true; return { ...e, enabled: should }; }
            return e;
          });
          if (changed) await P.replaceWorldbook(wbName, updated);
        }
      }
    } catch(e) { log('切 lorebook 失败:', e); }

    log('难度已切换:', target);
  }

  // ============================================================
  // 发送消息（复用 ST 原生输入+发送）
  // ============================================================
  function findSTInput() {
    const sels = ['#send_textarea', 'textarea#send_textarea', '#prompt-input',
                  '[id*="send_textarea"]', 'textarea[placeholder*="message" i]', 'textarea[placeholder*="消息"]'];
    for (const s of sels) {
      try { const el = PDOC.querySelector(s); if (el) return el; } catch(_) {}
    }
    return null;
  }
  function findSTSend() {
    const sels = ['#send_but', 'button#send_but', '[id*="send_but"]', '#send-button',
                  'div[id="send_but"]', 'button.send_but'];
    for (const s of sels) {
      try { const el = PDOC.querySelector(s); if (el) return el; } catch(_) {}
    }
    return null;
  }

  function sendMsg(text) {
    text = text.trim();
    if (!text) return;
    const stInput = findSTInput();
    const stSend = findSTSend();
    if (stInput && stSend) {
      stInput.value = text;
      stInput.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => stSend.click(), 50);
      return;
    }
    try {
      const ctx = getCtx();
      if (ctx?.executeSlashCommands) { ctx.executeSlashCommands(`/send ${text}`); return; }
    } catch(_) {}
    alert('找不到 SillyTavern 输入框。按 ESC 退出后用默认界面发送。');
  }

  function sendSysMsg(text) {
    // 系统操作消息：让 AI 知道这是玩家操作不是对话
    sendMsg(text);
  }

  // ============================================================
  // 设置面板：字号 / FAB / 背景动画
  // ============================================================
  function adjustFont(delta) {
    const overlay = PDOC.getElementById('qiyu-overlay');
    if (!overlay) return;
    const cur = parseFloat(overlay.style.fontSize) || 16;
    const next = delta === 0 ? 16 : Math.max(12, Math.min(24, cur + delta));
    overlay.style.fontSize = next + 'px';
    try { localStorage.setItem('qiyu_font_size', next); } catch(_) {}
  }
  function resetFab() {
    const fab = PDOC.getElementById('qiyu-fab');
    if (!fab) return;
    fab.style.left = ''; fab.style.top = '';
    fab.style.right = '24px'; fab.style.bottom = '96px';
    try { localStorage.removeItem('qiyu_fab_pos'); } catch(_) {}
    log('FAB 位置已重置');
  }
  function toggleBgAnim() {
    const overlay = PDOC.getElementById('qiyu-overlay');
    if (!overlay) return;
    const cur = overlay.style.animationPlayState || 'running';
    overlay.style.animationPlayState = cur === 'running' ? 'paused' : 'running';
    log('背景动画:', overlay.style.animationPlayState);
  }

  // ============================================================
  // 状态栏 + 消息流刷新
  // ============================================================
  function refreshState() {
    const stat = getStatData();
    const m = stat.主角 || {}, t = m.天元 || {};
    const set = (id, v) => { const e = PDOC.getElementById(id); if (e) e.textContent = v ?? '未定'; };
    set('qiyu-stat-name', m.姓名 || '未定');
    set('qiyu-stat-level', m.当前阶级 || '凡人');
    set('qiyu-stat-faction', m.当前势力 || '未定');
    set('qiyu-stat-loc', stat.大区域 || '未定');
    set('qiyu-stat-time', stat.时辰 || '未定');
    set('qiyu-stat-season', stat.季节 || '未定');
    set('qiyu-stat-party', stat.在场角色 || '无');
    set('qiyu-stat-difficulty', stat.难度模式 || '星衡');
    set('qiyu-stat-tianyuan', `石${t.石质天元 ?? 0}/玉${t.玉质天元 ?? 0}/晶${t.晶质天元 ?? 0}/源${t.源质天元 ?? 0}`);

    const openPanel = PDOC.querySelector('.qiyu-panel:not(.hidden)');
    if (openPanel) {
      const id = openPanel.dataset.panelId;
      const body = openPanel.querySelector('.qiyu-panel-body');
      if (body) {
        body.innerHTML = renderPanelContent(id, stat);
        bindPanelInteractions(id, openPanel);
      }
    }
  }

  let lastChatLen = -1;
  function refreshMessages() {
    const el = PDOC.getElementById('qiyu-messages');
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

  // ============================================================
  // 输入框
  // ============================================================
  function setupInput() {
    const input = PDOC.getElementById('qiyu-input');
    const sendBtn = PDOC.getElementById('qiyu-send');
    const tutorBtn = PDOC.getElementById('qiyu-tutor');
    if (!input || !sendBtn) return;
    sendBtn.addEventListener('click', () => { sendMsg(input.value); input.value = ''; });
    if (tutorBtn) tutorBtn.addEventListener('click', () => {
      const t = input.value.trim();
      if (!t) { alert('请先输入要问的机制问题'); return; }
      sendMsg('[教学问询] ' + t);
      input.value = '';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(input.value); input.value = ''; }
    });
  }

  function setupESC() {
    const handler = (e) => {
      if (e.key === 'Escape') {
        PBODY.classList.toggle('qiyu-overlay-hidden');
        const hint = PDOC.getElementById('qiyu-esc-hint');
        if (hint) {
          hint.classList.add('show');
          clearTimeout(hint._timer);
          hint._timer = setTimeout(() => hint.classList.remove('show'), 2000);
        }
      }
    };
    PDOC.addEventListener('keydown', handler);
    document.addEventListener('keydown', handler);
  }

  function setupSTEvents() {
    function tryListen(ev, h) {
      try {
        if (typeof P.eventOn === 'function') { P.eventOn(ev, h); return true; }
        if (typeof eventOn === 'function') { eventOn(ev, h); return true; }
        const ctx = getCtx();
        if (ctx?.eventSource?.on) { ctx.eventSource.on(ev, h); return true; }
      } catch(_) {}
      return false;
    }
    if (P.Mvu?.events) tryListen(P.Mvu.events.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', refreshState);
    tryListen('MESSAGE_RECEIVED', () => { refreshMessages(); refreshState(); });
    tryListen('MESSAGE_SENT', () => refreshMessages());
    tryListen('CHAT_CHANGED', () => { refreshMessages(); refreshState(); });
    tryListen('character_message_rendered', () => { refreshMessages(); refreshState(); });
    setInterval(() => { refreshState(); refreshMessages(); }, 2500);
  }

  // ============================================================
  // 入口
  // ============================================================
  function init() {
    if (PDOC.getElementById('qiyu-overlay')) {
      log('overlay 已存在 in parent');
      return;
    }
    injectCSS();
    PBODY.appendChild(buildOverlay());
    PBODY.classList.add('qiyu-active');
    // 恢复字号
    try {
      const fs = parseFloat(localStorage.getItem('qiyu_font_size'));
      if (fs) {
        const overlay = PDOC.getElementById('qiyu-overlay');
        if (overlay) overlay.style.fontSize = fs + 'px';
      }
    } catch(_) {}
    setupFab();
    setupInput();
    setupESC();
    refreshState();
    refreshMessages();
    setupSTEvents();
    log('伪零层 UI v2 加载完成（接管 parent.body）');
  }

  if (PDOC.readyState === 'loading') {
    PDOC.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
