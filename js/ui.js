/* Menu, game screen, dialogs, online lobby and the bridge between the rules engine and the page. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = AR.esc;
  const t = (...a) => AR.t(...a);
  const SPEEDS = { slow: 1.5, normal: 1, fast: 0.45 };
  const STORE = 'animal-rally-setup-v2';
  const DEFAULT_NAME = /^(Гравець|Бот|Player|Bot) \d+$/;

  const GEAR = '<svg class="ico-gear" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#111"/><g fill="#a3a3a3"><circle cx="20" cy="20" r="9.5"/><rect x="17.4" y="6" width="5.2" height="28" rx="1.2"/><rect x="17.4" y="6" width="5.2" height="28" rx="1.2" transform="rotate(45 20 20)"/><rect x="17.4" y="6" width="5.2" height="28" rx="1.2" transform="rotate(90 20 20)"/><rect x="17.4" y="6" width="5.2" height="28" rx="1.2" transform="rotate(135 20 20)"/></g><circle cx="20" cy="20" r="4.2" fill="#111"/></svg>';
  const STAR = '<svg class="ico-star" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#111"/><polygon fill="#f6b94b" points="20,5.5 23.9,13.3 32.6,12.7 27.8,20 32.6,27.3 23.9,26.7 20,34.5 16.1,26.7 7.4,27.3 12.2,20 7.4,12.7 16.1,13.3"/><circle cx="20" cy="20" r="3.4" fill="#111"/></svg>';

  const S = {
    setup: null, track: null, preview: null,
    game: null, board: null, revealed: null,
    pending: [], turnResolve: null, turnMoved: undefined, lastHuman: null, onBoardPick: null,
    logEntries: [], net: null, nextResolve: null,
  };
  const fmt = m => AR.fmt(m, S.game);
  const HAS3D = !!AR.Board3D;
  const BOARDS = { '2d': AR.Board2D || AR.Board, '3d': AR.Board3D };
  const view = () => (S.setup && S.setup.view === '3d' && HAS3D ? '3d' : '2d');
  const nm = obj => AR.tx(obj, 'name');

  /* ---------- small helpers ---------- */
  function store(save) {
    try {
      if (save) localStorage.setItem(STORE, JSON.stringify(save));
      else return JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch (e) { return null; }
  }
  const randSeed = () => 1000 + Math.floor(Math.random() * 9000);
  function pips(n, max, icon, cls) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<span class="pip ${i < n ? 'on' : 'off'} ${cls || ''}">${icon}</span>`;
    return s;
  }
  function cardHTML(card, opts = {}) {
    const id = card.id || card;
    const d = AR.CARDS[id];
    const tag = opts.button ? 'button' : 'div';
    const why = opts.why ? AR.plain(opts.why) : '';
    return `<${tag} class="card ${d.event ? 'is-event' : ''} ${d.reaction ? 'is-reaction' : ''} ${opts.cls || ''}" ${card.uid ? `data-uid="${card.uid}"` : ''} ${why ? `title="${esc(why)}"` : ''} ${opts.button ? 'type="button"' : ''}>
      <span class="card-name">${esc(nm(d))}</span>
      <span class="card-art"><img src="${AR.asset.card(id)}" alt="" draggable="false"></span>
      <span class="card-text"><span>${AR.tx(d, 'text')}</span></span>
      ${why ? `<span class="card-why">${esc(why)}</span>` : ''}
    </${tag}>`;
  }
  function racerCard(r, opts = {}) {
    return `<button type="button" class="rcard ${opts.cls || ''}" data-racer="${r.id}" style="--rbg:${r.bg}">
      <span class="rcard-art"><img src="${AR.asset.racer(r.id)}" alt="" draggable="false"></span>
      <span class="rcard-side">
        <span class="rcard-name">${esc(nm(r))}</span>
        <span class="rcard-ability">${esc(AR.tx(r, 'ability'))}</span>
        <span class="rcard-hp">${GEAR}<b>${r.hp}</b></span>
      </span>
      ${opts.badge || ''}
    </button>`;
  }
  const avatar = (p, size = '') => `<span class="avatar ${size}" style="--pc:${p.color}"><img src="${AR.asset.racer(p.racer)}" alt=""></span>`;
  const defaultName = (kind, n) => t(kind === 'bot' ? 'defaultBot' : 'defaultHuman', n);

  function applyI18n() {
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$('.lang-seg button').forEach(b => { const on = b.dataset.lang === AR.lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function setLanguage(l) {
    if (l === AR.lang) return;
    AR.setLang(l);
    if (S.setup) S.setup.players.forEach((p, i) => { if (p.kind !== 'remote' && DEFAULT_NAME.test(p.name)) p.name = defaultName(p.kind, i + 1); });
    applyI18n();
    renderSlots();
    if (S.track) trackStats(S.track);
    if (S.build && builderOpen()) renderBuildPanel();
    renderNet();
    updateSpeedBtn();
    followBtn();
    if (S.game) { refresh(); renderLog(); }
  }

  /* ================= MENU ================= */
  function defaultSetup() {
    const ids = AR.util.shuffle(AR.RACERS.map(r => r.id));
    return {
      players: ['human', 'bot', 'bot', 'bot'].map((kind, i) => ({ name: defaultName(kind, i + 1), kind, racer: ids[i] })),
      active: 0, size: 'medium', seed: randSeed(), speed: 'normal', handoff: true, confirmBots: false, view: HAS3D ? '3d' : '2d',
    };
  }
  function saveSetup() {
    const s = S.setup;
    store({
      players: s.players.filter(p => p.kind !== 'remote').map(p => ({ name: p.name, kind: p.kind, racer: p.racer })),
      size: s.size, speed: s.speed, handoff: s.handoff, confirmBots: s.confirmBots, view: s.view, design: s.design || null,
    });
    broadcastLobby();
  }
  const isClient = () => S.net && S.net.role === 'client';
  const isHost = () => S.net && S.net.role === 'host' && S.net.host;

  function lobbyList() { return isClient() ? (S.net.lobby ? S.net.lobby.players : []) : S.setup.players; }
  function renderSlots() {
    const s = S.setup;
    const client = isClient();
    const list = lobbyList();
    const you = client && S.net.lobby ? S.net.lobby.you : -1;
    $('#player-slots').innerHTML = list.map((p, i) => {
      const r = AR.racer(p.racer);
      const locked = client || p.kind === 'remote';
      const kindCtl = p.kind === 'remote'
        ? `<span class="tag-remote">${t('remote')}</span>`
        : `<span class="seg mini" role="radiogroup" aria-label="${esc(t('whoControls'))}">
            <button type="button" data-act="human" class="${p.kind === 'human' ? 'on' : ''}" aria-pressed="${p.kind === 'human'}" ${client ? 'disabled' : ''}>${t('human')}</button>
            <button type="button" data-act="bot" class="${p.kind === 'bot' ? 'on' : ''}" aria-pressed="${p.kind === 'bot'}" ${client ? 'disabled' : ''}>${t('bot')}</button>
          </span>`;
      const active = client ? i === you : i === s.active;
      return `<li class="slot ${active ? 'active' : ''}" data-i="${i}" style="--pc:${AR.PLAYER_COLORS[i]}">
        <button type="button" class="slot-racer" data-act="pick" aria-label="${esc(t('pickRacerFor', p.name))}" ${client && i !== you ? 'disabled' : ''}>
          <img src="${AR.asset.racer(p.racer)}" alt=""><span>${esc(nm(r))}</span>
        </button>
        <input class="slot-name" id="pname-${i}" value="${esc(p.name)}" maxlength="16" aria-label="${esc(t('playerName', i + 1))}" ${locked ? 'disabled' : ''}>
        ${kindCtl}
        <button type="button" class="slot-del" data-act="del" ${client || list.length <= 2 ? 'disabled' : ''} aria-label="${esc(t('removePlayer'))}">×</button>
      </li>`;
    }).join('');
    $('#players-count').textContent = t('ofSix', list.length);
    $('#btn-add-player').disabled = client || list.length >= 6;
    const humans = list.filter(p => p.kind === 'human').length;
    $('#opt-handoff').disabled = client || humans < 2;
    $('#opt-handoff-wrap').classList.toggle('muted', humans < 2);
    $$('#size-seg button, #btn-reroll, #btn-build, #opt-speed, #opt-confirm').forEach(b => { b.disabled = client; });
    $('#btn-start').hidden = client;
    $('#client-wait').hidden = !client;
    renderGallery();
  }
  function renderGallery() {
    const list = lobbyList();
    const active = isClient() ? (S.net.lobby ? S.net.lobby.you : -1) : S.setup.active;
    $('#racer-gallery').innerHTML = AR.RACERS.map(r => {
      const owner = list.findIndex(p => p.racer === r.id);
      const badge = owner >= 0 ? `<span class="rcard-badge" style="--pc:${AR.PLAYER_COLORS[owner]}">${esc(list[owner].name)}</span>` : '';
      return racerCard(r, { cls: owner === active ? 'mine' : owner >= 0 ? 'taken' : '', badge });
    }).join('');
  }
  function trackStats(tr) {
    const turns = Object.values(tr.checks).filter(c => c.type.startsWith('turn')).length;
    const signs = Object.values(tr.checks).length - turns;
    $('#seed-label').textContent = tr.design ? t('customTrack') : `№ ${tr.seed}`;
    $('#track-stats').textContent = t('trackStats', tr.blocks.length, tr.cells.length, turns, signs, tr.pits.length);
  }
  /* the menu diorama sits behind the panels: tell the camera which part of the screen is free */
  function previewInsets() {
    if (!S.preview || !S.preview.setInsets) return;
    const narrow = innerWidth <= 960;
    if (narrow) { S.preview.setInsets({ top: 150, bottom: innerHeight * 0.42, left: 8, right: 8 }); return; }
    const col = $('.menu-col').getBoundingClientRect(), bar = $('.trackbar').getBoundingClientRect();
    S.preview.setInsets({ top: 70, left: col.right + 10, right: 18, bottom: innerHeight - bar.top + 10 });
  }
  function renderPreview(tr) {
    S.previews = S.previews || {};
    const v = view();
    if (!S.previews[v]) S.previews[v] = new BOARDS[v]($('#track-preview'), { interactive: true, preview: true });
    S.preview = S.previews[v];
    previewInsets();
    S.preview.render(tr);
    trackStats(tr);
    $$('#size-seg button').forEach(x => { const on = x.dataset.size === tr.sizeKey; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
  }
  function newTrack(keepSeed) {
    const s = S.setup;
    if (!keepSeed) { s.seed = randSeed(); s.design = null; }
    S.track = s.design ? AR.Track.build(s.design) : AR.Track.generate(s.seed, s.size);
    renderPreview(S.track);
    broadcastLobby();
  }

  function bindMenu() {
    $('#player-slots').addEventListener('click', e => {
      const li = e.target.closest('.slot');
      if (!li) return;
      const i = +li.dataset.i;
      const btn = e.target.closest('[data-act]');
      const act = btn && !btn.disabled ? btn.dataset.act : null;
      if (isClient()) {
        if (act === 'pick') $('#racer-gallery').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const s = S.setup;
      s.active = i;
      if (!act) { // a click into the name field only selects the slot: re-rendering would steal the focus
        $$('.slot').forEach(x => x.classList.toggle('active', x === li));
        renderGallery();
        return;
      }
      const p = s.players[i];
      if ((act === 'human' || act === 'bot') && p.kind !== act) {
        if (DEFAULT_NAME.test(p.name)) p.name = defaultName(act, i + 1);
        p.kind = act;
      } else if (act === 'del' && s.players.length > 2) {
        if (p.kind === 'remote' && isHost()) S.net.host.kick(p.peer, { t: 'reject', reason: 'removed' });
        s.players.splice(i, 1);
        s.active = Math.min(s.active, s.players.length - 1);
      }
      renderSlots();
      saveSetup();
      if (act === 'pick') $('#racer-gallery').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#player-slots').addEventListener('input', e => {
      if (!e.target.classList.contains('slot-name') || isClient()) return;
      const i = +e.target.closest('.slot').dataset.i;
      const p = S.setup.players[i];
      p.name = e.target.value.trim() || defaultName(p.kind, i + 1);
      renderGallery();
      saveSetup();
    });
    $('#player-slots').addEventListener('focusin', e => {
      const li = e.target.closest('.slot');
      if (!li || isClient() || +li.dataset.i === S.setup.active) return;
      S.setup.active = +li.dataset.i;
      $$('.slot').forEach(x => x.classList.toggle('active', x === li));
      renderGallery();
    });
    $('#btn-add-player').addEventListener('click', () => {
      const s = S.setup;
      if (isClient() || s.players.length >= 6) return;
      const free = AR.RACERS.map(r => r.id).filter(id => !s.players.some(p => p.racer === id));
      s.players.push({ name: defaultName('bot', s.players.length + 1), kind: 'bot', racer: free[Math.floor(Math.random() * free.length)] });
      s.active = s.players.length - 1;
      renderSlots();
      saveSetup();
    });
    $('#racer-gallery').addEventListener('click', e => {
      const b = e.target.closest('.rcard');
      if (!b) return;
      const id = b.dataset.racer;
      if (isClient()) { S.net.client.send({ t: 'pick', racer: id }); return; }
      const s = S.setup;
      const owner = s.players.findIndex(p => p.racer === id);
      if (owner >= 0 && owner !== s.active) s.players[owner].racer = s.players[s.active].racer;
      s.players[s.active].racer = id;
      renderSlots();
      saveSetup();
    });
    $('#size-seg').addEventListener('click', e => {
      const b = e.target.closest('button[data-size]');
      if (!b || isClient()) return;
      S.setup.size = b.dataset.size;
      newTrack();
      saveSetup();
    });
    $('#btn-reroll').addEventListener('click', () => { if (!isClient()) newTrack(); });
    $('#opt-speed').addEventListener('change', e => { S.setup.speed = e.target.value; saveSetup(); });
    $('#opt-handoff').addEventListener('change', e => { S.setup.handoff = e.target.checked; saveSetup(); });
    $('#opt-confirm').addEventListener('change', e => { S.setup.confirmBots = e.target.checked; saveSetup(); });
    $('#btn-start').addEventListener('click', startGame);
    $('#btn-rules-menu').addEventListener('click', openRules);
    $('#btn-net-host').addEventListener('click', hostRoom);
    $('#btn-net-join').addEventListener('click', joinRoom);
    $('#net-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    $('#net-status').addEventListener('click', e => {
      const b = e.target.closest('button[data-net]');
      if (!b) return;
      if (b.dataset.net === 'copy') {
        const code = S.net && S.net.code;
        const done = () => { b.textContent = t('netCopied'); };
        if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => selectCode());
        else selectCode();
      } else if (b.dataset.net === 'close') closeRoom();
      else if (b.dataset.net === 'leave' || b.dataset.net === 'dismiss') leaveRoom();
    });
    document.addEventListener('click', e => {
      const b = e.target.closest('.lang-seg button[data-lang]');
      if (b) setLanguage(b.dataset.lang);
      const v = e.target.closest('.view-seg button[data-view]');
      if (v && !v.disabled) setView(v.dataset.view);
    });
  }
  function selectCode() {
    const c = $('#net-status .net-code');
    if (!c) return;
    const r = document.createRange();
    r.selectNodeContents(c);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function initMenu() {
    const saved = store();
    S.setup = defaultSetup();
    if (saved && Array.isArray(saved.players) && saved.players.length >= 2 && saved.players.every(p => AR.racer(p.racer))) {
      const uniq = new Set(saved.players.map(p => p.racer));
      if (uniq.size === saved.players.length) {
        S.setup.players = saved.players.slice(0, 6).map((p, i) => {
          const kind = p.kind === 'bot' || p.kind === 'human' ? p.kind : 'human';
          return { name: p.name || defaultName(kind, i + 1), kind, racer: p.racer };
        });
      }
      if (AR.TRACK_SIZES[saved.size]) S.setup.size = saved.size;
      if (SPEEDS[saved.speed]) S.setup.speed = saved.speed;
      S.setup.handoff = saved.handoff !== false;
      S.setup.confirmBots = !!saved.confirmBots;
      if (saved.view === '2d' || (saved.view === '3d' && HAS3D)) S.setup.view = saved.view;
      if (saved.design && typeof saved.design.code === 'string' && AR.Track.build(saved.design).complete) S.setup.design = saved.design;
    }
    $('#opt-speed').value = S.setup.speed;
    $('#opt-handoff').checked = S.setup.handoff;
    $('#opt-confirm').checked = S.setup.confirmBots;
    renderSlots();
    updateViewSeg();
    newTrack(true);
    renderNet();
    bindMenu();
    bindBuilder();
  }

  /* ---------- 2D / 3D board ---------- */
  function updateViewSeg() {
    $$('.view-seg button[data-view]').forEach(b => {
      const on = b.dataset.view === view();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.disabled = b.dataset.view === '3d' && !HAS3D;
    });
  }
  function setView(v) {
    if (v === view() || (v === '3d' && !HAS3D)) return;
    S.setup.view = v;
    saveSetup();
    updateViewSeg();
    if (S.track && !$('#menu').hidden) renderPreview(S.track);
    if (S.build && builderOpen()) renderBuilder();
    if (S.game && S.track) {
      setupBoard(S.track);
      S.board.setPlayers(S.game.players);
      S.board.setCurrent(S.game.players[S.game.current].id);
      if (S.board.centerOn) S.board.centerOn(S.game.players[S.game.current]);
      if (S.hl) S.board.highlight(S.hl);
      refresh();
    }
  }

  /* ================= TRACK BUILDER ================= */
  /* The player lays the road block by block (as with the printed kit), then may place the special tiles by hand. */
  const BLK_ICON = {
    S: '<path d="M12 20V5M6.5 10.5 12 5l5.5 5.5"/>',
    L: '<path d="M16 20v-5a6 6 0 0 0-6-6H5M8.5 5.5 5 9l3.5 3.5"/>',
    R: '<path d="M8 20v-5a6 6 0 0 1 6-6h5M15.5 5.5 19 9l-3.5 3.5"/>',
    U: '<path d="M16 20V10a4 4 0 0 0-8 0v6M4.5 12.5 8 16l3.5-3.5"/>',
    V: '<path d="M8 20V10a4 4 0 0 1 8 0v6M12.5 12.5 16 16l3.5-3.5"/>',
    N: '<circle cx="12" cy="12" r="8"/><path d="M6.4 6.4l11.2 11.2"/>',
    X: '<path d="M7 20V4M17 20V4M7 12h10M13.5 8.5 17 12l-3.5 3.5"/>',
    F: '<path d="M6 21V4h11l-2.5 4L17 12H6"/>',
  };
  const BLK_KEY = { S: '↑', L: '←', R: '→', U: 'Q', V: 'E', N: 'N', X: 'X', F: 'F' };
  const KEY_BLK = { ArrowUp: 'S', KeyW: 'S', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', KeyQ: 'U', KeyE: 'V', KeyN: 'N', KeyX: 'X', KeyF: 'F' };
  const copyDesign = d => ({ code: d.code, seed: d.seed, tiles: d.tiles ? Object.assign({}, d.tiles) : null });
  const builderOpen = () => !$('#builder').hidden;
  const editableCells = tr => tr.cells.filter(c => tr.blocks[c.block].kind === 'B2').map(c => c.i);
  /* the other tile of a two-tile straight block: a block carries one special tile */
  const blockMate = (tr, i) => { const b = tr.blocks[tr.cells[i].block]; return i === b.first ? b.first + 1 : b.first; };

  function openBuilder() {
    if (isClient()) return;
    const B = S.build = S.build || { boards: {} };
    B.design = B.draft || (S.setup.design ? copyDesign(S.setup.design) : { code: '', seed: randSeed(), tiles: null });
    B.sel = null;
    B.msg = null;
    B.shown = null;
    $('#menu').hidden = true;
    $('#builder').hidden = false;
    renderBuilder();
  }
  function closeBuilder(apply) {
    const B = S.build;
    if (apply) {
      if (!B.track.complete) return;
      S.setup.design = copyDesign(B.design);
      B.draft = null;
      S.track = AR.Track.build(S.setup.design);
      saveSetup();
    } else B.draft = copyDesign(B.design); // a cancelled build waits for the next visit
    $('#builder').hidden = true;
    $('#tooltip').hidden = true;
    $('#menu').hidden = false;
    renderPreview(S.track);
  }
  function renderBuilder() {
    const B = S.build;
    B.track = AR.Track.build(B.design);
    B.state = AR.Track.nextBlocks(B.design.code);
    const v = view();
    if (!B.boards[v]) B.boards[v] = new BOARDS[v]($('#builder-board'), { interactive: true });
    B.board = B.boards[v];
    B.board.onPick = pick => { if (pick.cell !== undefined) pickTile(pick.cell); };
    renderBuildPanel();
    builderInsets();
    B.board.render(B.track, { smooth: B.shown === v });
    B.shown = v;
    highlightBuild();
  }
  function builderInsets() {
    const B = S.build;
    if (!B || !B.board || !B.board.setInsets || !builderOpen()) return;
    const top = $('#builder .hud-top').getBoundingClientRect(), panel = $('#build-panel').getBoundingClientRect();
    B.board.setInsets({ top: top.bottom + 8, bottom: innerHeight - panel.top + 8, left: 10, right: 10 });
  }
  function highlightBuild() {
    const B = S.build, tr = B.track;
    if (!tr.complete) { B.board.highlight({ cells: [tr.cells.length - 1] }); return; } // where the next block goes
    B.board.highlight({ cells: editableCells(tr) });
    if (B.sel !== null) B.board.highlight({ cells: [B.sel], hover: true });
  }
  function tileOptions(tr, tiles, i) {
    const mate = blockMate(tr, i);
    const used = v => Object.keys(tiles).filter(k => tiles[k] === v && +k !== i && +k !== mate).length;
    const out = [{ v: 'plain', img: 'plain', label: nm(AR.TILES.plain), left: null }];
    for (const type in AR.KIT.straight) out.push({ v: type, img: AR.TILES[type].img, label: nm(AR.TILES[type]), left: AR.KIT.straight[type] - used(type) });
    for (const col of AR.Track.TP_COLORS) out.push({ v: 'tp:' + col, img: 'tp_' + col, label: t('tileTp', t('tpColor')[col]), left: 2 - used('tp:' + col) });
    return out;
  }
  function renderBuildPanel() {
    const B = S.build, st = B.state, tr = B.track;
    $('#build-info').textContent = `${t('buildTitle')} · ${t('buildInfo', st.blocks, st.cells)}`;
    const done = $('#build-done');
    done.disabled = !tr.complete;
    done.title = tr.complete ? '' : t('buildDoneWhy');
    let html;
    if (!tr.complete) {
      const size = t('size' + S.setup.size[0].toUpperCase() + S.setup.size.slice(1));
      html = `<p class="hint">${esc(t('buildHintRoad'))}</p>
        <div class="palette">${Object.keys(BLK_ICON).map(c => {
          const n = st.next[c];
          return `<button type="button" class="blk ${c === 'F' ? 'fin' : ''}" data-blk="${c}" ${n.ok ? '' : 'aria-disabled="true"'} title="${esc(n.ok ? t('blk' + c) : whyBlock(n.why))}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${BLK_ICON[c]}</svg><span>${esc(t('blk' + c))}</span>
            ${n.left !== null ? `<span class="blk-left">${esc(t('blkLeft', n.left))}</span>` : ''}<kbd>${BLK_KEY[c]}</kbd>
          </button>`;
        }).join('')}</div>
        <div class="bp-actions">
          <button type="button" class="btn small" data-bact="undo" ${st.blocks > 1 ? '' : 'disabled'}>${esc(t('buildUndo'))}</button>
          <button type="button" class="btn small" data-bact="auto" title="${esc(t('buildAutoTip', size))}">${esc(t('buildAuto'))}</button>
          <button type="button" class="btn small ghost" data-bact="clear" ${st.blocks > 1 ? '' : 'disabled'}>${esc(t('buildClear'))}</button>
          <button type="button" class="btn small ghost" data-bact="menu">${esc(t('buildFromMenu'))}</button>
        </div>`;
    } else {
      const tiles = B.design.tiles || AR.Track.tilesOf(tr);
      let row = `<p class="hint">${esc(t('tilePick'))}</p>`;
      if (B.sel !== null) {
        const cur = tiles[B.sel] || 'plain';
        row = `<div class="tile-row"><b>${esc(t('tileSel', B.sel))}</b>${tileOptions(tr, tiles, B.sel).map(o =>
          `<button type="button" class="topt ${o.v === cur ? 'on' : ''}" data-tile="${o.v}" ${o.v === cur || o.left === null || o.left > 0 ? '' : 'disabled'}>
            <img src="${AR.asset.tile(o.img)}" alt="">${esc(o.label)}${o.left !== null ? ` <small>${esc(t('tileLeft', o.left))}</small>` : ''}
          </button>`).join('')}</div>`;
      }
      const lone = AR.Track.TP_COLORS.filter(c => Object.values(tiles).filter(v => v === 'tp:' + c).length === 1);
      html = `<p class="hint">${esc(t('buildHintTiles'))} ${esc(t('tileOnePerBlock'))}</p>${row}
        ${lone.length ? `<p class="bp-msg">${esc(t('tileLone', lone.map(c => t('tpColor')[c]).join(', ')))}</p>` : ''}
        <div class="bp-actions">
          <button type="button" class="btn small" data-bact="undo">${esc(t('buildUnfinish'))}</button>
          <button type="button" class="btn small" data-bact="shuffle">${esc(t('tileShuffle'))}</button>
          <button type="button" class="btn small ghost" data-bact="clearTiles">${esc(t('tileClearAll'))}</button>
          <button type="button" class="btn small ghost" data-bact="reseed">${esc(t('tileReseed'))}</button>
          <button type="button" class="btn small ghost" data-bact="clear">${esc(t('buildClear'))}</button>
        </div>`;
    }
    if (B.msg) html += `<p class="bp-msg">${esc(B.msg)}</p>`;
    $('#build-panel').innerHTML = html;
  }
  function whyBlock(why) {
    return { kit: t('whyKit'), blocked: t('whyBlocked'), noExit: t('whyNoExit'), short: t('whyShort', S.build.state.min), done: t('whyDone') }[why] || '';
  }
  function addBlock(c) {
    const B = S.build;
    if (B.track.complete) return;
    const n = B.state.next[c];
    if (!n || !n.ok) { B.msg = n ? whyBlock(n.why) : null; renderBuildPanel(); return; }
    B.design.code = B.state.code + c;
    B.msg = null;
    renderBuilder();
  }
  function undoBlock() {
    const B = S.build, d = B.design;
    if (!d.code) return;
    d.code = B.state.code.slice(0, -1);
    if (d.tiles) { // forget special tiles on the blocks that are gone
      const cells = AR.Track.nextBlocks(d.code).cells;
      for (const k of Object.keys(d.tiles)) if (+k >= cells) delete d.tiles[k];
    }
    B.sel = null;
    B.msg = null;
    renderBuilder();
  }
  function pickTile(i) {
    const B = S.build;
    if (!B.track.complete || !editableCells(B.track).includes(i)) return;
    B.sel = i;
    renderBuildPanel();
    highlightBuild();
  }
  function setTile(v) {
    const B = S.build, tr = B.track, i = B.sel;
    const tiles = B.design.tiles = B.design.tiles || AR.Track.tilesOf(tr);
    if (v === 'plain') delete tiles[i];
    else { tiles[i] = v; delete tiles[blockMate(tr, i)]; }
    renderBuilder();
  }
  function builderAction(a) {
    const B = S.build, d = B.design;
    B.msg = null;
    if (a === 'undo') { undoBlock(); return; }
    if (a === 'auto') {
      const code = AR.Track.complete(B.state.code, randSeed(), S.setup.size);
      if (code) d.code = code; else B.msg = t('buildAutoFail');
    } else if (a === 'clear') { d.code = ''; d.tiles = null; }
    else if (a === 'menu') B.design = copyDesign(AR.Track.designOf(S.track));
    else if (a === 'shuffle') { d.tiles = null; d.seed = randSeed(); }
    else if (a === 'clearTiles') d.tiles = {};
    else if (a === 'reseed') { d.tiles = d.tiles || AR.Track.tilesOf(B.track); d.seed = randSeed(); }
    B.sel = null;
    renderBuilder();
  }
  function bindBuilder() {
    $('#btn-build').addEventListener('click', openBuilder);
    $('#build-cancel').addEventListener('click', () => closeBuilder(false));
    $('#build-done').addEventListener('click', () => closeBuilder(true));
    $('#build-panel').addEventListener('click', e => {
      const blk = e.target.closest('[data-blk]');
      if (blk) { addBlock(blk.dataset.blk); return; }
      const act = e.target.closest('[data-bact]');
      if (act && !act.disabled) { builderAction(act.dataset.bact); return; }
      const tile = e.target.closest('[data-tile]');
      if (tile && !tile.disabled) setTile(tile.dataset.tile);
    });
    document.addEventListener('keydown', e => {
      if (!builderOpen() || e.altKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === 'Backspace' || (e.ctrlKey && e.code === 'KeyZ')) { e.preventDefault(); undoBlock(); return; }
      if (e.key === 'Escape' && S.build.sel !== null) { S.build.sel = null; renderBuildPanel(); highlightBuild(); return; }
      const c = !e.ctrlKey && KEY_BLK[e.code];
      if (c) { e.preventDefault(); addBlock(c); }
    });
    window.addEventListener('resize', builderInsets);
  }

  /* ================= ONLINE LOBBY ================= */
  function renderNet() {
    const n = S.net;
    const idle = !n || n.role === 'error';
    $('#net-idle').hidden = !idle;
    const box = $('#net-status');
    if (!n) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (n.state === 'connecting') { box.innerHTML = `<p class="net-line">${t('netConnecting')}</p>`; return; }
    if (n.role === 'error') {
      box.innerHTML = `<p class="net-line net-err">${esc(t('netErr', n.error))}</p><button type="button" class="btn ghost small" data-net="dismiss">${t('close')}</button>`;
      return;
    }
    if (n.role === 'host') {
      box.innerHTML = `<p class="net-line">${t('netRoom', `<span class="net-code">${esc(n.code)}</span>`)}</p>
        <p class="hint">${t('netShare')}</p>
        <div class="net-row"><button type="button" class="btn ghost small" data-net="copy">${t('netCopy')}</button>
        <button type="button" class="btn ghost small" data-net="close">${t('netClose')}</button></div>`;
      return;
    }
    const me = n.lobby && n.lobby.players[n.lobby.you];
    box.innerHTML = `<p class="net-line">${t('netJoined', `<span class="net-code">${esc(n.code)}</span>`)}</p>
      ${me ? `<p class="hint">${esc(t('netYouAre', me.name))}. ${t('netPickRacer')}</p>` : ''}
      <p class="hint">${t('netHostLocked')}</p>
      <div class="net-row"><button type="button" class="btn ghost small" data-net="leave">${t('netLeave')}</button></div>`;
  }

  async function hostRoom() {
    if (S.net && S.net.role !== 'error') return;
    S.net = { role: 'host', state: 'connecting' };
    renderNet();
    const host = new AR.Net.Host({ onJoin, onMessage: onHostMessage, onLeave });
    try {
      const code = await host.open();
      S.net = { role: 'host', host, code, pending: new Map(), reqId: 0 };
    } catch (e) {
      host.close();
      S.net = { role: 'error', error: AR.Net.errorText(e) };
    }
    renderNet();
    renderSlots();
  }
  function lobbyFor(peer) {
    const s = S.setup;
    return { players: s.players.map(p => ({ name: p.name, kind: p.kind, racer: p.racer })), size: s.size, seed: s.seed, design: s.design || null, you: s.players.findIndex(p => p.peer === peer) };
  }
  function broadcastLobby() {
    if (!isHost() || (S.game && !S.game.over && !S.game.dead)) return;
    for (const p of S.setup.players) if (p.kind === 'remote') S.net.host.sendTo(p.peer, { t: 'lobby', lobby: lobbyFor(p.peer) });
  }
  function onJoin(conn, hello) {
    const s = S.setup;
    if (hello.version !== AR.VERSION) { S.net.host.kick(conn.peer, { t: 'reject', reason: 'version' }); return; }
    if (S.game && !S.game.over && !S.game.dead) { S.net.host.kick(conn.peer, { t: 'reject', reason: 'started' }); return; }
    if (s.players.length >= 6) { S.net.host.kick(conn.peer, { t: 'reject', reason: 'full' }); return; }
    const free = AR.RACERS.map(r => r.id).filter(id => !s.players.some(p => p.racer === id));
    s.players.push({ name: String(hello.name || 'Guest').slice(0, 16), kind: 'remote', racer: free[0], peer: conn.peer });
    renderSlots();
    broadcastLobby();
  }
  function onHostMessage(conn, msg) {
    const s = S.setup;
    if (msg.t === 'pick') {
      if (S.game && !S.game.over && !S.game.dead) return;
      const slot = s.players.find(p => p.peer === conn.peer);
      if (!slot || !AR.racer(msg.racer) || slot.racer === msg.racer) return;
      const owner = s.players.find(p => p.racer === msg.racer);
      if (owner && owner.kind !== 'bot') return; // a bot hands its racer over, people keep theirs
      if (owner) owner.racer = slot.racer;
      slot.racer = msg.racer;
      renderSlots();
      broadcastLobby();
    } else if (msg.t === 'answer' || msg.t === 'action') {
      const pend = S.net.pending.get(msg.id);
      if (pend && pend.peer === conn.peer) { S.net.pending.delete(msg.id); pend.resolve(msg.t === 'answer' ? msg.value : msg.act); }
    }
  }
  function onLeave(conn) {
    const s = S.setup;
    const g = S.game;
    if (g && !g.over && !g.dead) {
      const p = g.players.find(q => q.remote === conn.peer);
      if (p) {
        p.remote = null;
        p.bot = true;
        hooks.log({ k: 'netLeft', a: [{ p: p.id }] }, p);
        for (const [id, pend] of S.net.pending) if (pend.peer === conn.peer) { S.net.pending.delete(id); pend.resolve(pend.fallback()); }
        refresh();
      }
    }
    const i = s.players.findIndex(p => p.peer === conn.peer);
    if (i < 0) return;
    if (g && !g.over && !g.dead) { s.players[i].kind = 'bot'; delete s.players[i].peer; return; }
    s.players.splice(i, 1);
    s.active = Math.min(s.active, s.players.length - 1);
    renderSlots();
    broadcastLobby();
  }
  function closeRoom() {
    if (isHost()) {
      for (const p of S.setup.players) if (p.kind === 'remote') S.net.host.kick(p.peer, { t: 'closed' });
      const host = S.net.host;
      setTimeout(() => host.close(), 400);
    }
    S.net = null;
    S.setup.players = S.setup.players.filter(p => p.kind !== 'remote');
    while (S.setup.players.length < 2) {
      const free = AR.RACERS.map(r => r.id).filter(id => !S.setup.players.some(p => p.racer === id));
      S.setup.players.push({ name: defaultName('bot', S.setup.players.length + 1), kind: 'bot', racer: free[0] });
    }
    S.setup.active = Math.min(S.setup.active, S.setup.players.length - 1);
    renderSlots();
    renderNet();
  }
  function remoteRequest(p, kind, payload, fallback) {
    const id = ++S.net.reqId;
    sendSnapshots();
    return new Promise((resolve, reject) => {
      S.pending.push(reject);
      S.net.pending.set(id, { peer: p.remote, fallback, resolve: v => { S.pending = S.pending.filter(r => r !== reject); resolve(v); } });
      S.net.host.sendTo(p.remote, Object.assign({ t: kind, id, pid: p.id }, payload));
    });
  }

  async function joinRoom() {
    if (S.net && S.net.role !== 'error') return;
    const code = $('#net-code').value.trim().toUpperCase();
    const name = $('#net-name').value.trim() || defaultName('human', 1);
    if (code.length < 5) { $('#net-code').focus(); return; }
    S.net = { role: 'client', state: 'connecting', code };
    renderNet();
    const client = new AR.Net.Client({ onMessage: onClientMessage, onClose: onClientClose });
    try {
      await client.connect(code, { t: 'hello', name, version: AR.VERSION });
      S.net = { role: 'client', client, code, lobby: null };
    } catch (e) {
      client.close();
      S.net = { role: 'error', error: AR.Net.errorText(e) };
    }
    renderNet();
    renderSlots();
  }
  function leaveRoom() {
    if (isClient() && S.net.client) S.net.client.close();
    if (isHost()) { closeRoom(); return; }
    S.net = null;
    if (S.game) { teardownGame(); showMenu(); }
    renderSlots();
    renderNet();
    renderPreview(S.track);
  }
  const trackFor = l => (l.design ? AR.Track.build(l.design) : AR.Track.generate(l.seed, l.size));
  function onClientMessage(msg) {
    const n = S.net;
    if (!n || n.role !== 'client' || !msg) return;
    switch (msg.t) {
      case 'reject':
      case 'closed': {
        n.client.close();
        const reason = msg.t === 'closed' ? t('netLost') : t({ full: 'netFull', started: 'netStarted', version: 'netVersion' }[msg.reason] || 'netLost');
        S.net = { role: 'error', error: reason };
        if (S.game) { teardownGame(); showMenu(); }
        renderSlots();
        renderNet();
        renderPreview(S.track);
        return;
      }
      case 'lobby': {
        const trackKey = l => JSON.stringify([l.seed, l.size, l.design || null]);
        const changed = !n.lobby || trackKey(n.lobby) !== trackKey(msg.lobby);
        n.lobby = msg.lobby;
        if (changed) { S.track = trackFor(msg.lobby); if (!S.game) renderPreview(S.track); }
        if (!S.game) { renderSlots(); renderNet(); }
        return;
      }
      case 'start': startClient(msg); return;
      case 'state': applySnapshot(msg.s); return;
      case 'log': if (S.game) addLog(msg.m, msg.pid === null ? null : S.game.players[msg.pid]); return;
      case 'fx': clientFx(msg); return;
      case 'ask': {
        if (!S.game) return;
        ask(S.game.players[msg.pid], msg.req).then(v => n.client.send({ t: 'answer', id: msg.id, value: v }), () => {});
        return;
      }
      case 'turn': {
        if (!S.game) return;
        turnAction(S.game.players[msg.pid], msg.moved).then(act => n.client.send({ t: 'action', id: msg.id, act }), () => {});
        return;
      }
      case 'end':
        if (S.game) { teardownGame(); showMenu(); renderSlots(); renderNet(); renderPreview(S.track); }
        return;
    }
  }
  function onClientClose() {
    if (!isClient()) return;
    S.net = { role: 'error', error: t('netLost') };
    if (S.game) { teardownGame(); showMenu(); }
    renderSlots();
    renderNet();
    renderPreview(S.track);
  }

  /* ================= GAME ================= */
  function showMenu() { $('#game').hidden = true; $('#menu').hidden = false; }
  function showGame() { $('#menu').hidden = true; $('#game').hidden = false; window.scrollTo(0, 0); }
  function teardownGame() {
    if (S.game) S.game.abort();
    S.pending.forEach(rej => rej(new AR.Abort()));
    S.pending = [];
    S.turnResolve = null;
    S.nextResolve = null;
    closeModal();
    closeModal('#modal2');
    $('#dice-tray').hidden = true;
    $('#next-bar').hidden = true;
    S.logEntries = [];
    $('#log').innerHTML = '';
    S.revealed = null;
    S.lastHuman = null;
    S.game = null;
  }
  function setupBoard(track) {
    S.boards = S.boards || {};
    const v = view();
    if (!S.boards[v]) {
      S.boards[v] = new BOARDS[v]($('#board'), { interactive: true, follow: true });
      S.boards[v].onFollowChange = followBtn;
    }
    S.board = S.boards[v];
    S.board.render(track);
    S.board.onPick = pick => { if (S.onBoardPick) S.onBoardPick(pick); };
    requestAnimationFrame(gameInsets);
    followBtn();
  }
  /* keep the camera framing clear of the HUD stickers */
  function gameInsets() {
    if (!S.board || !S.board.setInsets || $('#game').hidden) return;
    const narrow = innerWidth <= 960;
    const bottom = $('#hud-bottom').getBoundingClientRect();
    document.documentElement.style.setProperty('--sheet', Math.round(innerHeight - bottom.top) + 'px');
    if (narrow) {
      const strip = $('#hud-right').getBoundingClientRect();
      S.board.setInsets({ top: strip.bottom + 6, bottom: innerHeight - bottom.top + 6, left: 6, right: 6 });
    } else {
      const right = $('#hud-right').getBoundingClientRect();
      S.board.setInsets({ top: 108, right: innerWidth - right.left + 10, bottom: innerHeight - bottom.top + 6, left: 14 });
    }
  }
  function followBtn() {
    const b = $('#cam-follow');
    if (!b) return;
    const on = !!(S.board && S.board.follow);
    b.textContent = t('camFollow');
    b.setAttribute('aria-pressed', on);
    $('.cam-tools').hidden = !(S.board && S.board.rotate);
  }

  function startGame() {
    if (isClient()) return;
    const s = S.setup;
    $$('.slot-name').forEach((inp, i) => {
      const p = s.players[i];
      if (p && p.kind !== 'remote') p.name = inp.value.trim() || defaultName(p.kind, i + 1);
    });
    saveSetup();
    teardownGame();
    showGame();
    setupBoard(S.track);
    const cfg = {
      speed: SPEEDS[s.speed],
      players: s.players.map(p => ({ name: p.name, racer: p.racer, bot: p.kind === 'bot', remote: p.kind === 'remote' ? p.peer : null })),
    };
    S.game = new AR.Game(cfg, S.track, hooks);
    S.board.setPlayers(S.game.players);
    updateSpeedBtn();
    if (isHost()) {
      const base = {
        t: 'start', cells: S.track.cells.length,
        cfg: { seed: S.track.seed, size: S.track.sizeKey, design: S.track.design || null, speed: cfg.speed, players: cfg.players.map(p => ({ name: p.name, racer: p.racer, bot: p.bot, remote: p.remote ? 'net' : null })) },
      };
      s.players.forEach((p, i) => { if (p.kind === 'remote') S.net.host.sendTo(p.peer, Object.assign({}, base, { you: i })); });
    }
    S.game.run();
  }

  function startClient(msg) {
    teardownGame();
    const cfg = msg.cfg;
    S.track = trackFor(cfg);
    if (S.track.cells.length !== msg.cells) {
      S.net.client.close();
      S.net = { role: 'error', error: t('netVersion') };
      renderNet();
      return;
    }
    showGame();
    setupBoard(S.track);
    const game = new AR.Game({ speed: cfg.speed, players: cfg.players }, S.track, hooks);
    game.mirror = true; // never runs: the host sends state, this copy only answers rule queries for the UI
    S.game = game;
    S.net.myPid = msg.you;
    S.board.setPlayers(game.players);
    updateSpeedBtn();
    refresh();
  }
  function applySnapshot(s) {
    const g = S.game;
    if (!g || !g.mirror) return;
    g.current = s.current;
    g.turnNo = s.turnNo;
    g.over = s.over;
    g.winner = s.winner === null ? null : g.players[s.winner];
    g.deck = { length: s.deck };
    g.discard = s.discard;
    s.players.forEach((q, i) => {
      const p = g.players[i];
      Object.assign(p, { pos: q.pos, hp: q.hp, maxHp: q.maxHp, stars: q.stars, inPit: q.inPit, bot: q.bot, flags: q.flags, stats: q.stats, jumps: q.jumps });
      p.hand = Array.isArray(q.hand) ? q.hand : Array.from({ length: q.hand }, () => ({ uid: 0, id: 'lair' }));
    });
    refresh();
  }
  function clientFx(msg) {
    const g = S.game;
    if (!g) return;
    const p = msg.pid !== undefined && msg.pid !== null ? g.players[msg.pid] : null;
    switch (msg.fx) {
      case 'pos': p.pos = msg.pos; p.inPit = msg.inPit; S.board.sync(g.players); break;
      case 'slide': slide(p, msg.from, msg.to).catch(() => {}); break;
      case 'warp': S.board.warp(p.id, msg.on); break;
      case 'pop': S.board.pop(p, msg.text, msg.kind); break;
      case 'dice': dice(p, msg.dice, msg.mod, msg.label, msg.speed).catch(() => {}); break;
      case 'event': event(msg.id, g.players[msg.drawer]).catch(() => {}); break;
      case 'played': showPlayed(p, msg.card); break;
      case 'turn': g.current = p.id; showBanner(p); $('#dice-tray').hidden = true; refresh(); S.board.centerOn(p); break;
      case 'win': g.over = true; g.winner = p; win(p); break;
    }
  }

  function toMenu() {
    const wasHost = isHost() && S.game;
    teardownGame();
    showMenu();
    if (isClient()) { leaveRoom(); return; }
    if (wasHost) for (const p of S.setup.players) if (p.kind === 'remote') S.net.host.sendTo(p.peer, { t: 'end' });
    newTrack();
    renderSlots();
  }

  const localHumans = () => (S.game ? S.game.players.filter(p => !p.bot && !p.remote) : []);
  function viewer() {
    const g = S.game;
    if (!g) return null;
    if (g.mirror) return g.players[S.net.myPid];
    const hs = localHumans();
    if (hs.length === 1) return hs[0];
    const cur = g.players[g.current];
    if (!cur.bot && !cur.remote && S.revealed === cur.id) return cur;
    return null;
  }
  const myTurnPlayer = p => (S.game.mirror ? p.id === S.net.myPid : !p.bot && !p.remote);

  function renderStandings() {
    const g = S.game;
    const order = g.players.slice().sort((a, b) => b.pos - a.pos || a.id - b.id);
    $('#standings').innerHTML = `<h2 class="side-title">${t('standings')} <span class="hint">${t('finishAt', g.track.finish)}</span></h2>` + order.map((p, k) => {
      const pct = Math.round(p.pos / g.track.finish * 100);
      const tag = p.bot ? ` · ${t('botTag')}` : p.remote ? ` · ${t('netTag')}` : '';
      return `<div class="srow ${p.id === g.current ? 'cur' : ''}" style="--pc:${p.color}">
        <span class="srank">${k + 1}</span>
        ${avatar(p)}
        <span class="sinfo">
          <span class="sname">${esc(p.name)} <span class="sracer">${esc(nm(AR.racer(p.racer)))}${tag}</span></span>
          <span class="sbar"><span style="width:${pct}%"></span></span>
          <span class="sstats"><span class="hp" title="${esc(t('hpTitle', p.hp, p.maxHp))}">${pips(p.hp, p.maxHp, GEAR)}</span><span class="stars" title="${esc(t('starsTitle', p.stars))}">${pips(p.stars, 6, STAR, 'st')}</span><span class="ccount" title="${esc(t('cardsInHand'))}">${p.hand.length}<i></i></span></span>
          ${p.inPit || p.jumps ? `<span class="schips">${p.inPit ? `<span class="chip pit">${t('chipPit')}</span>` : ''}${p.jumps ? `<span class="chip">${t('chipJumps', p.jumps)}</span>` : ''}</span>` : ''}
        </span>
        <span class="spos" title="${esc(t('tileWord'))}">${p.pos}</span>
      </div>`;
    }).join('');
  }

  const FACE = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const dieHTML = v => `<span class="die" data-v="${v}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<i class="${FACE[v].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;

  function renderDash() {
    const g = S.game;
    const p = g.players[g.current];
    const r = AR.racer(p.racer);
    let actions;
    if (g.over && g.winner) {
      actions = `<p class="bot-note">${t('raceOver', esc(g.winner.name))}</p>`;
    } else if (S.nextResolve) {
      actions = `<p class="bot-note">${esc(t('botDone', p.name))}</p><div class="actions"><button type="button" class="btn primary" data-act="next">${t('next')}<kbd>Enter</kbd></button></div>`;
    } else if (S.turnResolve && myTurnPlayer(p)) {
      const moved = S.turnMoved;
      const max = p.racer === 'cheetah' ? 3 : 2;
      const btns = [];
      if (!moved) {
        for (let n = 1; n <= max; n++) btns.push(`<button type="button" class="btn roll ${n === 2 ? 'primary' : ''}" data-roll="${n}"><span class="mini-dice">${[5, 3, 6].slice(0, n).map(dieHTML).join('')}</span>${t('diceN', n)}<kbd>${n}</kbd></button>`);
      }
      if (g.canJump(p)) btns.push(`<button type="button" class="btn ghost" data-act="jump">${t('hareBtn', p.jumps)}<kbd>J</kbd></button>`);
      if (g.canRaccoon(p)) btns.push(`<button type="button" class="btn ghost" data-act="raccoon">${t('raccoonBtn')}</button>`);
      if (moved) btns.push(`<button type="button" class="btn primary" data-act="end">${t('endTurn')}<kbd>E</kbd></button>`);
      actions = `${moved ? '' : `<p class="act-title">${t('rollTitle')}</p>`}<div class="actions">${btns.join('')}</div><p class="hint act-hint">${t(moved ? 'hintMoved' : 'hintBefore')}</p>`;
    } else if (p.bot) {
      actions = `<p class="bot-note"><span class="dots"><i></i><i></i><i></i></span> ${esc(t('botThinks', p.name))}</p>`;
    } else {
      actions = `<p class="bot-note">${esc(t('waitTurn', p.name))}</p>`;
    }
    $('#dash').innerHTML = `<div class="dash-card" style="--pc:${p.color};--rbg:${r.bg}">
      <span class="dash-art"><img src="${AR.asset.racer(p.racer)}" alt=""></span>
      <span class="dash-info">
        <span class="dash-who">${t('driving', esc(p.name))}</span>
        <span class="dash-racer">${esc(nm(r))}</span>
        <span class="dash-ability">${esc(AR.tx(r, 'ability'))}</span>
      </span>
    </div>${actions}`;
  }

  function renderHand() {
    const g = S.game;
    const v = viewer();
    const box = $('#hand');
    if (!v) {
      const cur = g.players[g.current];
      box.innerHTML = `<h2 class="side-title">${t('hand')}</h2><p class="hint">${t(cur.bot ? 'botHandHidden' : 'handHidden')}</p>`;
      return;
    }
    const mine = v.id === g.current && S.turnResolve;
    const cards = v.hand.map(c => {
      const pl = g.playable(v, c.id);
      const can = mine && pl.ok;
      const why = mine && !pl.ok ? fmt(pl.why) : (!mine && !AR.CARDS[c.id].reaction ? t('whyOwnTurn') : (AR.CARDS[c.id].reaction ? fmt(pl.why) : ''));
      return cardHTML(c, { button: true, cls: can ? 'playable' : 'dim', why });
    }).join('');
    const own = g.mirror || v.id === g.current || localHumans().length === 1;
    box.innerHTML = `<h2 class="side-title">${own ? t('yourHand') : esc(t('handOf', v.name))} <span class="hint">${t('handOfSix', v.hand.length)}</span></h2>
      <div class="hand-cards">${cards || `<p class="hint">${t('noCards')}</p>`}</div>`;
    const fan = $$('.hand-cards .card', box), mid = (fan.length - 1) / 2;
    fan.forEach((el, i) => { el.style.setProperty('--i', i); el.style.setProperty('--mid', mid); el.style.setProperty('--d', Math.abs(i - mid)); });
  }

  function refresh() {
    const g = S.game;
    if (!g) return;
    renderStandings();
    renderDash();
    renderHand();
    const cur = g.players[g.current];
    $('#turn-info').innerHTML = t('turnInfo', Math.max(1, g.turnNo), `${avatar(cur, 'xs')} <b>${esc(cur.name)}</b>`, g.deck.length, g.discard.length);
    S.board.sync(g.players);
    S.board.setCurrent(cur.id);
  }

  function bindGame() {
    $('#dash').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'next') { nextBot(); return; }
      if (!S.turnResolve) return;
      if (b.dataset.roll) resolveTurn({ type: 'roll', n: +b.dataset.roll });
      else if (b.dataset.act) resolveTurn({ type: b.dataset.act });
    });
    $('#next-bar').addEventListener('click', e => { if (e.target.closest('button')) nextBot(); });
    $('#hand').addEventListener('click', e => {
      const c = e.target.closest('.card.playable');
      if (!c || !S.turnResolve) return;
      resolveTurn({ type: 'card', uid: +c.dataset.uid });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!$('#modal2').hidden) { closeModal('#modal2'); return; }
        if ($('#modal').classList.contains('collapsed')) { expandModal(); return; }
      }
      if (!$('#modal').hidden || !$('#modal2').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (S.nextResolve && (k === 'enter' || k === ' ')) { e.preventDefault(); nextBot(); return; }
      if (!S.turnResolve || !S.game) return;
      const p = S.game.players[S.game.current];
      const max = p.racer === 'cheetah' ? 3 : 2;
      if (!S.turnMoved && ['1', '2', '3'].includes(k) && +k <= max) resolveTurn({ type: 'roll', n: +k });
      else if (k === 'j' && S.game.canJump(p)) resolveTurn({ type: 'jump' });
      else if (S.turnMoved && (k === 'e' || k === 'enter')) resolveTurn({ type: 'end' });
    });
    $('#btn-menu').addEventListener('click', async () => {
      const ok = await confirmBox(t('exitTitle'), t('exitText'), t('exitYes'), t('exitNo'));
      if (ok) toMenu();
    });
    $('#btn-rules-game').addEventListener('click', openRules);
    $('#cam-left').addEventListener('click', () => S.board && S.board.rotate && S.board.rotate(-1));
    $('#cam-right').addEventListener('click', () => S.board && S.board.rotate && S.board.rotate(1));
    $('#cam-in').addEventListener('click', () => S.board && S.board.zoom && S.board.zoom(1.3));
    $('#cam-out').addEventListener('click', () => S.board && S.board.zoom && S.board.zoom(1 / 1.3));
    $('#cam-follow').addEventListener('click', () => { if (S.board && S.board.toggleFollow) { S.board.toggleFollow(); followBtn(); } });
    window.addEventListener('resize', () => { gameInsets(); previewInsets(); });
    $('#btn-speed').addEventListener('click', () => {
      const order = ['slow', 'normal', 'fast'];
      S.setup.speed = order[(order.indexOf(S.setup.speed) + 1) % 3];
      if (S.game && !S.game.mirror) S.game.speed = SPEEDS[S.setup.speed];
      updateSpeedBtn();
      saveSetup();
    });
    document.addEventListener('click', e => {
      if (e.target.closest('[data-collapse]')) collapseModal();
      else if (e.target.closest('[data-expand]')) expandModal();
    });
  }
  function updateSpeedBtn() {
    $('#btn-speed').textContent = t('animBtn')[S.setup.speed];
    $('#btn-speed').hidden = !!(S.game && S.game.mirror);
  }
  function resolveTurn(act) {
    const r = S.turnResolve;
    if (!r) return;
    S.turnResolve = null;
    r(act);
    refresh();
  }

  /* ---------- log ---------- */
  function logItem(e) {
    const li = document.createElement('li');
    const p = e.pid !== null && S.game ? S.game.players[e.pid] : null;
    li.innerHTML = (p ? avatar(p, 'xs') : '<span class="avatar xs blank"></span>') + `<span>${fmt(e.m)}</span>`;
    return li;
  }
  function addLog(m, p) {
    const e = { m, pid: p ? p.id : null };
    S.logEntries.unshift(e);
    if (S.logEntries.length > 150) S.logEntries.pop();
    const ol = $('#log');
    ol.prepend(logItem(e));
    while (ol.children.length > 150) ol.lastChild.remove();
    const last = $('#log-last');
    if (last) last.textContent = AR.plain(fmt(m));
  }
  function renderLog() {
    const ol = $('#log');
    ol.innerHTML = '';
    S.logEntries.forEach(e => ol.appendChild(logItem(e)));
  }

  /* ---------- dice, movement ---------- */
  async function dice(p, values, mod, label, speed) {
    const tray = $('#dice-tray');
    tray.hidden = false;
    tray.style.setProperty('--pc', p.color);
    const extra = [];
    if (label === 'speed' && p.racer === 'turtle') extra.push(t('turtleMod'));
    if (mod) extra.push(t('handbrakeMod', mod));
    tray.innerHTML = `<span class="tray-who">${avatar(p, 'xs')} ${esc(p.name)} · ${t('diceLabel')[label] || ''}</span>
      <span class="tray-dice rolling">${values.map(dieHTML).join('')}</span>
      ${speed !== undefined && speed !== null ? `<span class="tray-speed"><span>${t('speedWord')}</span><b>${speed}</b>${extra.length ? `<em>${extra.join(', ')}</em>` : ''}</span>` : ''}`;
    await S.game.sleep(420);
    const dz = $('.tray-dice', tray);
    if (dz) dz.classList.remove('rolling');
    await S.game.sleep(label === 'speed' ? 520 : 700);
  }
  async function step() {
    S.board.sync(S.game.players);
    await S.game.sleep(190);
  }
  async function slide(p, from, to) {
    const g = S.game;
    const dir = to > from ? 1 : -1;
    const n = Math.abs(to - from);
    try {
      if (n > 14) {
        S.board.warp(p.id, true);
        await g.sleep(220);
        p._disp = to;
        S.board.sync(g.players);
        await g.sleep(40);
        S.board.warp(p.id, false);
        await g.sleep(200);
      } else {
        for (let k = from + dir; dir > 0 ? k <= to : k >= to; k += dir) {
          p._disp = k;
          S.board.sync(g.players);
          await g.sleep(95);
        }
      }
    } finally {
      delete p._disp;
      if (g.mirror) p.pos = to;
    }
  }

  /* ---------- modal plumbing ---------- */
  function openModal(html, cls = '', root = '#modal', pillTitle = '') {
    const m = $(root);
    m.className = `modal ${cls}`;
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${html}</div>${pillTitle ? `<button type="button" class="m-pill" data-expand><b>${pillTitle}</b><span>${t('collapsedHint')}</span><em>${t('expand')}</em></button>` : ''}`;
    m.hidden = false;
    const f = m.querySelector('[data-autofocus]') || m.querySelector('.modal-box button:not([disabled]):not([data-collapse])');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return m;
  }
  function closeModal(root = '#modal') {
    const m = $(root);
    m.hidden = true;
    m.innerHTML = '';
    m.className = 'modal';
    if (root !== '#modal') return;
    S.onBoardPick = null;
    S.hl = null;
    if (S.board) S.board.clearHighlight();
  }
  function collapseModal() { $('#modal').classList.add('collapsed'); }
  function expandModal() { $('#modal').classList.remove('collapsed'); }
  const collapseBtn = () => `<button type="button" class="m-collapse" data-collapse>${t('collapse')}</button>`;
  function confirmBox(title, text, yes, no) {
    return new Promise(res => {
      const m = openModal(`<h3 class="m-title">${title}</h3><p class="m-text">${text}</p>
        <div class="m-actions"><button type="button" class="btn ghost" data-v="0">${no}</button><button type="button" class="btn primary" data-v="1">${yes}</button></div>`, 'small', '#modal2');
      m.onclick = e => { const b = e.target.closest('button[data-v]'); if (b) { m.onclick = null; closeModal('#modal2'); res(b.dataset.v === '1'); } };
    });
  }

  function whoChip(p) {
    const g = S.game;
    const cur = g.players[g.current];
    if (g.mirror) return p === cur ? '' : `<span class="m-who" style="--pc:${p.color}">${avatar(p, 'xs')} ${esc(p.name)} · ${t('reactionOf')}</span>`;
    if (p === cur && localHumans().length < 2) return '';
    return `<span class="m-who" style="--pc:${p.color}">${avatar(p, 'xs')} ${esc(p.name)}${p !== cur ? ' · ' + t('reactionOf') : ''}</span>`;
  }

  function ask(p, req) {
    return new Promise((resolve, reject) => {
      S.pending.push(reject);
      const done = v => {
        S.pending = S.pending.filter(r => r !== reject);
        closeModal();
        resolve(v);
      };
      if (req.kind === 'discard' || req.kind === 'pick') pickCards(p, req, done);
      else askOptions(p, req, done);
    });
  }

  function askOptions(p, req, done) {
    const g = S.game;
    const opts = req.options || [];
    const cardPrev = req.card ? `<div class="m-card">${cardHTML(req.card)}</div>` : '';
    let extra = '';
    if (req.kind === 'handbrake') extra = `<div class="m-dice">${req.dice.map(dieHTML).join('')}<span>${t('speedWord')} <b>${req.speed}</b></span></div>`;
    const list = opts.map((o, i) => {
      const q = o.player !== undefined ? g.players[o.player] : null;
      return `<button type="button" class="opt ${q ? 'opt-player' : ''}" data-i="${i}" ${o.disabled ? 'disabled' : ''}>
        ${q ? avatar(q) : ''}
        <span class="opt-txt"><span class="opt-label">${fmt(o.label)}</span>${o.sub ? `<span class="opt-sub">${fmt(o.sub)}</span>` : ''}</span>
      </button>`;
    }).join('');
    const title = fmt(req.title);
    const m = openModal(`<div class="m-head">${whoChip(p)}${collapseBtn()}</div>
      <div class="m-body">${cardPrev}<div class="m-main">
        <h3 class="m-title">${title}</h3>
        ${req.text ? `<p class="m-text">${fmt(req.text)}</p>` : ''}${extra}
        <div class="m-opts">${list}</div>
        ${req.cancel ? `<div class="m-actions"><button type="button" class="btn ghost" data-cancel>${fmt(req.cancel)}</button></div>` : ''}
      </div></div>`, 'ask', '#modal', title);
    const cells = opts.filter(o => o.cell !== undefined && !o.disabled).map(o => o.cell);
    const players = opts.filter(o => o.player !== undefined && !o.disabled).map(o => o.player);
    S.board.highlight({ cells, players });
    S.hl = { cells, players };
    S.onBoardPick = pick => {
      const o = opts.find(o => !o.disabled && ((pick.cell !== undefined && o.cell === pick.cell) || (pick.player !== undefined && o.player === pick.player)));
      if (o) done(o.value);
    };
    m.onclick = e => {
      const b = e.target.closest('.opt');
      if (b && !b.disabled) { m.onclick = null; done(opts[+b.dataset.i].value); return; }
      if (e.target.closest('[data-cancel]')) { m.onclick = null; done(null); }
    };
    m.onmouseover = e => {
      const b = e.target.closest('.opt');
      if (!b) { S.board.clearHighlight(true); return; }
      const o = opts[+b.dataset.i];
      S.board.highlight({ cells: o.cell !== undefined ? [o.cell] : [], players: o.player !== undefined ? [o.player] : [], hover: true });
    };
  }

  function pickCards(p, req, done) {
    const pool = req.kind === 'pick' ? req.cards : p.hand;
    const need = req.count;
    const chosen = new Set();
    const title = fmt(req.title);
    const render = () => {
      const collapsed = $('#modal').classList.contains('collapsed');
      const m = openModal(`<div class="m-head">${whoChip(p)}${collapseBtn()}</div><h3 class="m-title">${title}</h3><p class="m-text">${fmt(req.text)}</p>
        <div class="pick-grid">${pool.map(c => cardHTML(c, { button: true, cls: chosen.has(c.uid) ? 'picked' : '' })).join('')}</div>
        <div class="m-actions">
          <span class="hint">${t('picked', chosen.size, need)}</span>
          ${req.cancel ? `<button type="button" class="btn ghost" data-cancel>${fmt(req.cancel)}</button>` : ''}
          <button type="button" class="btn primary" data-ok ${chosen.size === need ? '' : 'disabled'}>${t(req.kind === 'pick' ? 'take' : 'discardBtn')}</button>
        </div>`, 'wide', '#modal', title);
      if (collapsed) m.classList.add('collapsed');
      m.onclick = e => {
        const c = e.target.closest('.card');
        if (c) {
          const uid = +c.dataset.uid;
          if (chosen.has(uid)) chosen.delete(uid);
          else { if (need === 1) chosen.clear(); if (chosen.size < need) chosen.add(uid); }
          render();
          return;
        }
        if (e.target.closest('[data-ok]') && chosen.size === need) { m.onclick = null; done([...chosen]); }
        else if (e.target.closest('[data-cancel]')) { m.onclick = null; done(null); }
      };
    };
    render();
  }

  /* ---------- events, turns, win ---------- */
  function event(id, drawer) {
    return new Promise((resolve, reject) => {
      const g = S.game;
      const blocking = !g.mirror && localHumans().length > 0;
      S.pending.push(reject);
      const m = openModal(`<p class="ev-kicker">${t('eventKicker')}</p>
        <div class="ev-card">${cardHTML(id, { cls: 'big' })}</div>
        <p class="m-text">${esc(t('eventDrawnBy', drawer.name))}</p>
        <div class="m-actions"><button type="button" class="btn primary" data-ok data-autofocus>${t('next')}</button></div>`, 'event');
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        S.pending = S.pending.filter(r => r !== reject);
        if ($('#modal').classList.contains('event')) closeModal();
        resolve();
      };
      m.onclick = e => { if (e.target.closest('[data-ok]')) finish(); };
      if (!blocking) g.sleep(g.mirror ? 2600 : 1800).then(finish, () => {});
    });
  }

  function showBanner(p) {
    const banner = $('#banner');
    banner.innerHTML = `${avatar(p, 'sm')}<span>${t('banner', esc(p.name), esc(nm(AR.racer(p.racer))))}</span>`;
    banner.style.setProperty('--pc', p.color);
    banner.hidden = false;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  async function turnStart(p) {
    const g = S.game;
    S.revealed = null;
    $('#dice-tray').hidden = true;
    refresh();
    S.board.centerOn(p);
    showBanner(p);
    const local = !p.bot && !p.remote;
    const needHandoff = local && localHumans().length > 1 && S.setup.handoff && S.lastHuman !== p.id;
    if (needHandoff) {
      await new Promise((resolve, reject) => {
        S.pending.push(reject);
        const m = openModal(`<div class="handoff" style="--pc:${p.color}">
          ${avatar(p, 'xl')}
          <p class="ev-kicker">${t('passDevice')}</p>
          <h3 class="m-title">${esc(t('turnOf', p.name))}</h3>
          <p class="m-text">${esc(t('noPeek', nm(AR.racer(p.racer))))}</p>
          <div class="m-actions"><button type="button" class="btn primary" data-ok data-autofocus>${t('startTurn')}</button></div></div>`, 'handoff-wrap');
        m.onclick = e => {
          if (!e.target.closest('[data-ok]')) return;
          S.pending = S.pending.filter(r => r !== reject);
          closeModal();
          resolve();
        };
      });
    } else {
      await g.sleep(p.bot || p.remote ? 500 : 250);
    }
    if (local) { S.revealed = p.id; S.lastHuman = p.id; }
    refresh();
    gameInsets();
  }

  function turnAction(p, moved) {
    return new Promise((resolve, reject) => {
      S.pending.push(reject);
      S.turnMoved = moved;
      S.turnResolve = act => {
        S.pending = S.pending.filter(r => r !== reject);
        resolve(act);
      };
      refresh();
    });
  }

  /* Optional pause after each bot turn so players can study what happened. */
  function botTurnDone(p) {
    const g = S.game;
    if (!S.setup.confirmBots || g.mirror || g.over || localHumans().length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      S.pending.push(reject);
      S.nextResolve = () => {
        S.pending = S.pending.filter(r => r !== reject);
        S.nextResolve = null;
        $('#next-bar').hidden = true;
        refresh();
        resolve();
      };
      const bar = $('#next-bar');
      bar.innerHTML = `${avatar(p, 'sm')}<span>${esc(t('botDone', p.name))}</span><button type="button" class="btn primary small">${t('next')}</button>`;
      bar.hidden = false;
      refresh();
    });
  }
  function nextBot() { if (S.nextResolve) S.nextResolve(); }

  function win(p) {
    const g = S.game;
    S.turnResolve = null;
    setTimeout(() => {
      if (S.game !== g) return;
      const order = g.players.slice().sort((a, b) => b.pos - a.pos);
      const r = AR.racer(p.racer);
      const buttons = g.mirror
        ? `<button type="button" class="btn primary" data-v="lobby" data-autofocus>${t('toMenu')}</button>`
        : `<button type="button" class="btn ghost" data-v="menu">${t('toMenu')}</button><button type="button" class="btn primary" data-v="again" data-autofocus>${t('newRace')}</button>`;
      const m = openModal(`<div class="win" style="--pc:${p.color};--rbg:${r.bg}">
        <span class="win-art"><img src="${AR.asset.racer(p.racer)}" alt=""></span>
        <p class="ev-kicker">${t('finishKicker', g.turnNo)}</p>
        <h3 class="win-title">${esc(t('wins', p.name))}</h3>
        <p class="m-text">${esc(t('winSub', nm(r)))}</p>
        <ol class="win-list">${order.map(q => `<li style="--pc:${q.color}">${avatar(q, 'xs')}<b>${esc(q.name)}</b><span>${t('tileN', q.pos)}</span><span>${t('crashes', q.stats.deaths)} · ${t('arrests', q.stats.arrests)}</span></li>`).join('')}</ol>
        <div class="m-actions">${buttons}</div>
      </div>`, 'win-wrap');
      m.onclick = e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        m.onclick = null;
        if (b.dataset.v === 'menu') toMenu();
        else if (b.dataset.v === 'lobby') { teardownGame(); showMenu(); renderSlots(); renderNet(); renderPreview(S.track); }
        else { closeModal(); newTrack(); startGame(); }
      };
    }, 900 * (g.speed || 1));
  }

  function showPlayed(p, card) {
    if (viewer() === p) return;
    const box = $('#played');
    box.innerHTML = `${avatar(p, 'xs')}<span>${esc(t('plays2', p.name))}</span>${cardHTML(card, { cls: 'mini' })}`;
    box.hidden = false;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
  }

  /* ---------- engine hooks (local play and online host) ---------- */
  function bcast(msg) {
    if (!isHost() || !S.game) return;
    for (const p of S.game.players) if (p.remote) S.net.host.sendTo(p.remote, msg);
  }
  let snapTimer = null;
  function scheduleSnapshot() {
    if (!isHost() || snapTimer) return;
    snapTimer = setTimeout(() => { snapTimer = null; sendSnapshots(); }, 30);
  }
  function snapshotFor(g, pid) {
    return {
      current: g.current, turnNo: g.turnNo, over: g.over, winner: g.winner ? g.winner.id : null,
      deck: g.deck.length, discard: g.discard.map(c => ({ uid: c.uid, id: c.id })),
      players: g.players.map(p => ({
        pos: p.pos, hp: p.hp, maxHp: p.maxHp, stars: p.stars, inPit: p.inPit, bot: p.bot,
        flags: { raccoonUsed: !!p.flags.raccoonUsed, jumped: !!p.flags.jumped }, stats: p.stats, jumps: p.jumps,
        hand: p.id === pid ? p.hand.map(c => ({ uid: c.uid, id: c.id })) : p.hand.length,
      })),
    };
  }
  function sendSnapshots() {
    const g = S.game;
    if (!isHost() || !g) return;
    for (const p of g.players) if (p.remote) S.net.host.sendTo(p.remote, { t: 'state', s: snapshotFor(g, p.id) });
  }

  const hooks = {
    log(m, p) { addLog(m, p); bcast({ t: 'log', m, pid: p ? p.id : null }); },
    refresh() { refresh(); scheduleSnapshot(); },
    async dice(p, d, mod, label, speed) { bcast({ t: 'fx', fx: 'dice', pid: p.id, dice: d, mod, label, speed }); await dice(p, d, mod, label, speed); },
    async step(p) { bcast({ t: 'fx', fx: 'pos', pid: p.id, pos: p.pos, inPit: p.inPit }); await step(p); },
    async slide(p, from, to) { bcast({ t: 'fx', fx: 'slide', pid: p.id, from, to }); await slide(p, from, to); },
    place(p) {
      if (S.board && S.game) S.board.sync(S.game.players);
      if (p) bcast({ t: 'fx', fx: 'pos', pid: p.id, pos: p.pos, inPit: p.inPit });
    },
    warp(p, on) { if (S.board) S.board.warp(p.id, on); bcast({ t: 'fx', fx: 'warp', pid: p.id, on }); },
    pop(p, text, kind) { if (S.board) S.board.pop(p, text, kind); bcast({ t: 'fx', fx: 'pop', pid: p.id, text, kind }); },
    event(id, drawer) { bcast({ t: 'fx', fx: 'event', id, drawer: drawer.id }); return event(id, drawer); },
    turnStart(p) { sendSnapshots(); bcast({ t: 'fx', fx: 'turn', pid: p.id }); return turnStart(p); },
    turnAction(p, moved) {
      if (p.remote && isHost()) return remoteRequest(p, 'turn', { moved }, () => AR.AI.turnAction(S.game, p, moved));
      return turnAction(p, moved);
    },
    ask(p, req) {
      if (p.remote && isHost()) return remoteRequest(p, 'ask', { req }, () => AR.AI.decide(S.game, p, req));
      return ask(p, req);
    },
    win(p) { sendSnapshots(); bcast({ t: 'fx', fx: 'win', pid: p.id }); win(p); },
    cardPlayed(p, card) { bcast({ t: 'fx', fx: 'played', pid: p.id, card: { uid: card.uid, id: card.id } }); showPlayed(p, card); },
    botTurnDone,
    started() {},
    error(e) {
      openModal(`<h3 class="m-title">${t('errorTitle')}</h3><p class="m-text">${esc(e.message || e)}</p><div class="m-actions"><button type="button" class="btn primary" data-ok>${t('toMenu')}</button></div>`, 'small')
        .onclick = ev => { if (ev.target.closest('[data-ok]')) toMenu(); };
    },
  };

  /* ================= RULES ================= */
  function openRules() {
    const tile = (src, title, kind, text) => `<li class="gl"><img src="${src}" alt=""><span><b>${esc(title)}</b>${kind ? `<em>${kind}</em>` : ''}<span>${esc(text)}</span></span></li>`;
    const T = AR.TILES, C = AR.CHECKS;
    const html = `<div class="rules">
      <div class="rules-head"><h3 class="m-title">${t('rulesTitle')}</h3><button type="button" class="btn ghost small" data-close>${t('close')}</button></div>
      <div class="rules-body">
        <section><h4>${t('rGoalH')}</h4><p>${t('rGoal')}</p></section>
        <section><h4>${t('rTurnH')}</h4><ol>${t('rTurn').map(x => `<li>${x}</li>`).join('')}</ol></section>
        <section><h4>${t('rMoveH')}</h4><p>${t('rMove')}</p></section>
        <section><h4>${t('rStarsH')}</h4><p>${t('rStars')}</p></section>
        <section><h4>${t('rDeathH')}</h4><p>${t('rDeath')}</p></section>
        <section><h4>${t('rCardsH')}</h4><p>${t('rCards')}</p></section>
        <section class="wide"><h4>${t('rTilesH')}</h4><ul class="gloss">
          ${['crossing', 'car', 'box', 'nitro', 'chase', 'exit', 'noparking'].map(k => tile(AR.asset.tile(T[k].img), nm(T[k]), t(T[k].kind === 'zone' ? 'kindZone' : 'kindStop'), AR.tx(T[k], 'text'))).join('')}
          ${tile(AR.asset.tile('tp_pink'), nm(T.tp), t('kindStop'), AR.tx(T.tp, 'text'))}
        </ul></section>
        <section class="wide"><h4>${t('rChecksH')}</h4><ul class="gloss">
          <li class="gl"><span class="turn-swatch y">7</span><span><b>${esc(nm(C.turn90))}</b><em>${t('kindCheck')}</em><span>${esc(AR.tx(C.turn90, 'text'))}</span></span></li>
          <li class="gl"><span class="turn-swatch r">5</span><span><b>${esc(nm(C.turn180))}</b><em>${t('kindCheck')}</em><span>${esc(AR.tx(C.turn180, 'text'))}</span></span></li>
          ${['cam_max', 'cam_min', 'police', 'customs', 'no_overtake', 'no_overtake_end'].map(k => tile(AR.asset.sign(C[k].img), nm(C[k]), t('kindCheck'), AR.tx(C[k], 'text'))).join('')}
          ${tile(AR.asset.tile('pit'), nm(AR.PIT), t('kindPit'), AR.tx(AR.PIT, 'text'))}
        </ul></section>
        <section class="wide"><h4>${t('rRacersH')}</h4><div class="rules-racers">${AR.RACERS.map(r => racerCard(r, { cls: 'static' })).join('')}</div></section>
      </div></div>`;
    const m = openModal(html, 'rules-wrap', '#modal2');
    m.onclick = e => {
      if (e.target.closest('[data-close]') || e.target === m) { m.onclick = null; closeModal('#modal2'); }
    };
  }

  AR.ui = { state: S, refresh }; // handle for debugging in the console

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    initMenu();
    bindGame();
    updateSpeedBtn();
  });
})();
