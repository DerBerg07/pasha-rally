/* SVG board: draws the road, tiles, checks, pit stations and racer tokens. */
(function () {
  const S = 100;            // svg units per cell
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  const KIND = { stop: 'kindStop', check: 'kindCheck', zone: 'kindZone' };
  /* Tooltip content is built on hover, so it follows the current language. */
  function tipContent(track, ref) {
    if (ref.pit !== undefined) return { title: AR.tx(AR.PIT, 'name'), kind: AR.t('kindPit'), text: AR.tx(AR.PIT, 'text') };
    if (ref.check !== undefined) {
      const def = AR.CHECKS[track.checks[ref.check].type];
      return { title: AR.tx(def, 'name'), kind: AR.t('kindCheck'), text: AR.tx(def, 'text') };
    }
    const c = track.cells[ref.cell];
    if (c.type === 'tp') return { title: AR.t('tpTip', AR.t('tpColor')[c.color], c.pair), kind: AR.t('kindStop'), text: AR.tx(AR.TILES.tp, 'text') + ' · ' + AR.t('tileTip', c.i) };
    const def = AR.TILES[c.type] || AR.TILES.plain;
    return { title: AR.tx(def, 'name') + ' · ' + AR.t('tileTip', c.i), kind: def.kind ? AR.t(KIND[def.kind]) : '', text: AR.tx(def, 'text') || '' };
  }

  class Board {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.tokens = new Map();
      this.onPick = null;
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    }

    /* the flat board only fills the part of the screen the HUD leaves free */
    setInsets(ins) {
      this.insets = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, ins);
      this.applyInsets();
    }
    applyInsets() {
      if (!this.svg) return;
      const i = this.insets, st = this.svg.style;
      st.position = 'absolute';
      st.left = i.left + 'px';
      st.top = i.top + 'px';
      st.width = `calc(100% - ${i.left + i.right}px)`;
      st.height = `calc(100% - ${i.top + i.bottom}px)`;
    }

    render(track) {
      this.track = track;
      this.host.innerHTML = '';
      const m = 0.7, b = track.bbox;
      const svg = el('svg', {
        viewBox: `${(b.x - m) * S} ${(b.y - m) * S} ${(b.w + 2 * m) * S} ${(b.h + 2 * m) * S}`,
        preserveAspectRatio: 'xMidYMid meet', class: 'board-svg', role: 'img',
        'aria-label': AR.t('trackAria', track.cells.length),
      }, this.host);
      this.svg = svg;
      const defs = el('defs', null, svg);
      const clip = el('clipPath', { id: 'tokclip', clipPathUnits: 'objectBoundingBox' }, defs);
      el('circle', { cx: 0.5, cy: 0.5, r: 0.5 }, clip);
      const sh = el('filter', { id: 'tokshadow', x: '-40%', y: '-40%', width: '180%', height: '180%' }, defs);
      el('feDropShadow', { dx: 0, dy: 4, stdDeviation: 4, 'flood-color': '#000', 'flood-opacity': 0.55 }, sh);
      // the board itself: a grass sticker with an ink outline and offset shadow
      const bx = (b.x - m) * S, by = (b.y - m) * S, bw = (b.w + 2 * m) * S, bh = (b.h + 2 * m) * S;
      el('rect', { x: bx + 20, y: by + 20, width: bw - 28, height: bh - 28, rx: 46, fill: '#181b23' }, svg);
      el('rect', { x: bx + 8, y: by + 8, width: bw - 28, height: bh - 28, rx: 46, fill: '#8dcc5f', stroke: '#181b23', 'stroke-width': 9 }, svg);

      const gUnder = el('g', { class: 'g-under' }, svg);
      const gRoad = el('g', { class: 'g-road' }, svg);
      const gZone = el('g', { class: 'g-zone' }, svg);
      const gCells = el('g', { class: 'g-cells' }, svg);
      const gChecks = el('g', { class: 'g-checks' }, svg);
      const gSigns = el('g', { class: 'g-signs' }, svg);
      this.gHl = el('g', { class: 'g-hl' }, svg);
      this.gTok = el('g', { class: 'g-tokens' }, svg);
      this.gFx = el('g', { class: 'g-fx' }, svg);

      const cells = track.cells;
      // exit bridges (under the road so lanes cover the ends)
      for (const c of cells) {
        if (c.type !== 'exit') continue;
        const t = cells[c.exitTo];
        el('line', { x1: c.x * S, y1: c.y * S, x2: t.x * S, y2: t.y * S, stroke: '#a7a9ad', 'stroke-width': 70 }, gUnder);
        el('line', { x1: c.x * S, y1: c.y * S, x2: t.x * S, y2: t.y * S, stroke: '#43474d', 'stroke-width': 50 }, gUnder);
        const mx = (c.x + t.x) / 2 * S, my = (c.y + t.y) / 2 * S;
        el('line', { x1: (c.x * S + mx) / 2, y1: (c.y * S + my) / 2, x2: (t.x * S + mx) / 2, y2: (t.y * S + my) / 2, stroke: '#d9d9d9', 'stroke-width': 7, 'stroke-dasharray': '14 12', 'stroke-linecap': 'round' }, gUnder);
      }
      // pit stations
      for (const pit of track.pits) {
        const w = 124, h = 105;
        const c = cells[pit.cell];
        const n = pit.n;
        const cx = (c.x + n[0] * 0.98) * S, cy = (c.y + n[1] * 0.98) * S;
        pit.sx = cx; pit.sy = cy;
        const img = el('image', {
          href: AR.asset.tile('pit'), x: cx - w / 2, y: cy - h / 2, width: w, height: h,
          transform: `rotate(${pit.rot} ${cx} ${cy})`, class: 'tip',
        }, gUnder);
        img.dataset.tip = JSON.stringify({ pit: pit.id });
      }
      // road
      const d = AR.Track.pathD(track, S);
      el('path', { d, fill: 'none', stroke: '#a9abaf', 'stroke-width': 88 }, gRoad);
      el('path', { d, fill: 'none', stroke: '#42464c', 'stroke-width': 64 }, gRoad);

      // no-overtaking zones tint
      for (const z of track.zones) {
        for (let i = z.b1 + 1; i <= z.b2; i++) {
          const c = cells[i];
          if (c.kind === 'S') {
            const horiz = c.h % 2 === 0;
            el('rect', { x: c.x * S - (horiz ? 50 : 44), y: c.y * S - (horiz ? 44 : 50), width: horiz ? 100 : 88, height: horiz ? 88 : 100, fill: 'rgba(229,38,46,.32)' }, gZone);
          } else {
            el('circle', { cx: c.x * S, cy: c.y * S, r: 46, fill: 'rgba(229,38,46,.32)' }, gZone);
          }
        }
      }

      // cells
      this.cellEls = [];
      for (const c of cells) {
        const cx = c.x * S, cy = c.y * S;
        let node;
        if (c.kind === 'T') {
          node = el('g', { class: 'cell tip' }, gCells);
          el('circle', { cx, cy, r: 37, fill: '#8f9297', stroke: '#33363b', 'stroke-width': 4 }, node);
          const tx = Math.cos(c.ang) * 15, ty = Math.sin(c.ang) * 15;
          el('line', { x1: cx - tx, y1: cy - ty, x2: cx + tx, y2: cy + ty, stroke: '#e1e1e1', 'stroke-width': 9, 'stroke-linecap': 'round' }, node);
        } else if (c.type === 'start' || c.type === 'finish') {
          const sz = 96;
          node = el('image', { href: AR.asset.tile(c.type), x: cx - sz / 2, y: cy - sz / 2, width: sz, height: sz, class: 'cell tip', transform: c.type === 'finish' ? '' : `rotate(${(c.h % 2) * 90} ${cx} ${cy})` }, gCells);
        } else {
          const img = c.type === 'tp' ? `tp_${c.color}` : (AR.TILES[c.type] || AR.TILES.plain).img;
          const rot = c.type === 'exit' ? ((c.h + 1) % 2) * 90 : (c.h % 2) * 90;
          node = el('image', { href: AR.asset.tile(img), x: cx - 44.5, y: cy - 44.5, width: 89, height: 89, class: 'cell tip', transform: `rotate(${rot} ${cx} ${cy})` }, gCells);
        }
        node.dataset.tip = JSON.stringify({ cell: c.i });
        this.cellEls.push(node);
      }

      // seams between the printed blocks
      for (const b of track.joints || []) {
        const c1 = cells[b], c2 = cells[b + 1];
        if (!c1 || !c2 || c1.kind !== 'S' || c2.kind !== 'S' || c1.h !== c2.h) continue;
        const mx = (c1.x + c2.x) / 2 * S, my = (c1.y + c2.y) / 2 * S, horiz = c1.h % 2 === 0;
        el('line', { x1: mx - (horiz ? 0 : 44), y1: my - (horiz ? 44 : 0), x2: mx + (horiz ? 0 : 44), y2: my + (horiz ? 44 : 0), stroke: '#2a2d31', 'stroke-width': 3 }, gZone);
      }

      // checks
      for (const k in track.checks) {
        const chk = track.checks[k];
        const def = AR.CHECKS[chk.type];
        if (chk.type === 'turn90' || chk.type === 'turn180') {
          const { C, am } = chk;
          const pt = (r, a) => `${(C.x + Math.cos(a) * r) * S},${(C.y + Math.sin(a) * r) * S}`;
          const poly = el('polygon', {
            points: [pt(0.56, am - 0.07), pt(1.44, am - 0.2), pt(1.44, am + 0.2), pt(0.56, am + 0.07)].join(' '),
            fill: chk.type === 'turn90' ? '#e2c84f' : '#df3d35', opacity: 0.92, class: 'tip',
          }, gChecks);
          poly.dataset.tip = JSON.stringify({ check: chk.b });
          const lx = (C.x + Math.cos(am) * 1.24) * S, ly = (C.y + Math.sin(am) * 1.24) * S;
          const tx = el('text', { x: lx, y: ly + 11, class: 'turn-num' }, gChecks);
          tx.textContent = chk.diff;
          continue;
        }
        const horiz = this.track.cells[chk.b].h % 2 === 0;
        const bx = chk.bx * S, by = chk.by * S;
        el('rect', { x: bx - (horiz ? 6 : 44), y: by - (horiz ? 44 : 6), width: horiz ? 12 : 88, height: horiz ? 88 : 12, fill: '#e5262e' }, gChecks);
        const sx = chk.sx * S, sy = chk.sy * S;
        el('line', { x1: bx + chk.n[0] * 44, y1: by + chk.n[1] * 44, x2: sx, y2: sy, stroke: '#e5262e', 'stroke-width': 12 }, gSigns);
        const w = 66, h = 59;
        const img = el('image', { href: AR.asset.sign(def.img), x: sx - w / 2, y: sy - h / 2, width: w, height: h, class: 'tip sign' }, gSigns);
        img.dataset.tip = JSON.stringify({ check: chk.b });
      }
      if (this.opts.interactive) this.bindTips();
      this.applyInsets();
      return svg;
    }

    bindTips() {
      const tip = document.getElementById('tooltip');
      if (!tip) return;
      this.svg.addEventListener('pointermove', e => {
        const t = e.target.closest('.tip');
        if (!t || !t.dataset.tip) { tip.hidden = true; return; }
        const d = tipContent(this.track, JSON.parse(t.dataset.tip));
        tip.innerHTML = `<div class="tt-kind">${d.kind || ''}</div><div class="tt-title">${d.title}</div>${d.text ? `<div class="tt-text">${d.text}</div>` : ''}`;
        tip.hidden = false;
        const pad = 14, r = tip.getBoundingClientRect();
        let x = e.clientX + pad, y = e.clientY + pad;
        if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
        if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      });
      this.svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    }

    /* ---------- tokens ---------- */
    setPlayers(players) {
      this.gTok.innerHTML = '';
      this.tokens.clear();
      for (const p of players) {
        const g = el('g', { class: 'token', 'data-pid': p.id }, this.gTok);
        const inner = el('g', { class: 'token-inner' }, g);
        el('circle', { r: 33, class: 'token-halo', fill: 'none', stroke: p.color, 'stroke-width': 5 }, inner);
        el('circle', { r: 27, fill: '#111', filter: 'url(#tokshadow)' }, inner);
        el('image', { href: AR.asset.racer(p.racer), x: -26, y: -26, width: 52, height: 52, 'clip-path': 'url(#tokclip)', preserveAspectRatio: 'xMidYMid slice' }, inner);
        el('circle', { r: 27, fill: 'none', stroke: p.color, 'stroke-width': 6 }, inner);
        const t = el('title', null, g);
        t.textContent = `${p.name} — ${AR.racer(p.racer).name}`;
        g.addEventListener('click', () => { if (this.onPick && g.classList.contains('pickable')) this.onPick({ player: p.id }); });
        this.tokens.set(p.id, g);
      }
      this.sync(players, true);
    }

    spotOf(p) {
      if (p.inPit) {
        const pit = this.track.pits.find(pt => pt.cell === p.pos);
        if (pit && pit.sx !== undefined) return { x: pit.sx, y: pit.sy, pit: true };
      }
      const i = p._disp !== undefined ? p._disp : p.pos;
      const c = this.track.cells[Math.max(0, Math.min(this.track.cells.length - 1, i))];
      return { x: c.x * S, y: c.y * S, pit: false };
    }

    sync(players, instant) {
      const groups = new Map();
      for (const p of players) {
        const s = this.spotOf(p);
        const key = `${Math.round(s.x)},${Math.round(s.y)}`;
        if (!groups.has(key)) groups.set(key, { s, list: [] });
        groups.get(key).list.push(p);
      }
      const LAY = {
        1: [[0, 0]], 2: [[-17, 0], [17, 0]], 3: [[-18, -12], [18, -12], [0, 16]],
        4: [[-17, -17], [17, -17], [-17, 17], [17, 17]],
        5: [[-22, -17], [0, -17], [22, -17], [-11, 17], [11, 17]],
        6: [[-22, -17], [0, -17], [22, -17], [-22, 17], [0, 17], [22, 17]],
      };
      for (const { s, list } of groups.values()) {
        const lay = LAY[Math.min(6, list.length)];
        const scale = list.length === 1 ? 1 : list.length === 2 ? 0.74 : 0.6;
        list.forEach((p, k) => {
          const g = this.tokens.get(p.id);
          if (!g) return;
          const [ox, oy] = lay[k] || [0, 0];
          if (instant) g.classList.add('no-anim');
          g.style.transform = `translate(${s.x + ox * (list.length > 1 ? 1.25 : 1)}px, ${s.y + oy * (list.length > 1 ? 1.25 : 1)}px) scale(${scale})`;
          if (instant) { g.getBoundingClientRect(); g.classList.remove('no-anim'); }
        });
      }
    }

    setCurrent(pid) {
      for (const [id, g] of this.tokens) {
        g.classList.toggle('current', id === pid);
        if (id === pid) this.gTok.appendChild(g);
      }
    }

    warp(pid, on) {
      const g = this.tokens.get(pid);
      if (g) g.classList.toggle('warp', on);
    }

    pop(p, text, kind) {
      const s = this.spotOf(p);
      const t = el('text', { x: s.x, y: s.y - 40, class: `pop pop-${kind}` }, this.gFx);
      t.textContent = kind === 'hp' || kind === 'heal' ? ` ${AR.lang === 'en' ? 'HP' : 'ХП'}` : text;
      setTimeout(() => t.remove(), 1500);
    }

    /* ---------- highlights ---------- */
    highlight({ cells = [], players = [], hover = false } = {}) {
      this.clearHighlight(hover);
      for (const i of cells) {
        const c = this.track.cells[i];
        if (!c) continue;
        const r = el('circle', { cx: c.x * S, cy: c.y * S, r: 50, class: hover ? 'hl hl-hover' : 'hl' }, this.gHl);
        r.addEventListener('click', () => { if (this.onPick) this.onPick({ cell: i }); });
      }
      for (const pid of players) {
        const g = this.tokens.get(pid);
        if (g) g.classList.add(hover ? 'hover' : 'pickable');
      }
    }
    clearHighlight(onlyHover) {
      this.gHl.querySelectorAll(onlyHover ? '.hl-hover' : '.hl').forEach(n => n.remove());
      for (const g of this.tokens.values()) {
        g.classList.remove('hover');
        if (!onlyHover) g.classList.remove('pickable');
      }
    }

    centerOn(p) {
      const wrap = this.host.closest('.board-scroll');
      if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 4) return;
      const g = this.tokens.get(p.id);
      if (!g) return;
      const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      wrap.scrollBy({ left: r.left + r.width / 2 - (w.left + w.width / 2), top: r.top + r.height / 2 - (w.top + w.height / 2), behavior: 'smooth' });
    }
  }

  AR.Board = Board;
})();
