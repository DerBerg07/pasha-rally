/* Track generator. Lays the road out of the printed kit's blocks (GDD: players add one block at a time):
   [дорога + спецтайл] pieces of 2 tiles, 3-tile «No parking» zones, teleport pairs, З'їзд, 90° and 180° turns,
   START and FINISH. Checks (signs) only sit on joints between blocks, СТО pockets are added afterwards.
   1 unit = one straight tile. */
(function () {
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N (screen coords, y down)
  const R = 1;            // turn radius: lanes after a U-turn sit 2 units apart
  const MIN_GAP2 = 1.95 * 1.95;

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const key = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

  function pieceGeom(P, h, piece) {
    const d = DIRS[h];
    if (piece.t === 'S') {
      const cells = [], samples = [];
      for (let i = 0; i < piece.n; i++) cells.push({ x: P.x + d[0] * (i + 0.5), y: P.y + d[1] * (i + 0.5), kind: 'S', h });
      for (let k = 1; k <= piece.n * 4; k++) samples.push({ x: P.x + d[0] * k / 4, y: P.y + d[1] * k / 4, l: k / 4 });
      return { P, cells, samples, end: { x: P.x + d[0] * piece.n, y: P.y + d[1] * piece.n }, h, len: piece.n };
    }
    const turn = piece.dir; // +1 right (clockwise on screen), -1 left
    const nh = (h + (turn > 0 ? 1 : 3)) % 4;
    const nrm = DIRS[nh];
    const C = { x: P.x + nrm[0] * R, y: P.y + nrm[1] * R };
    const a0 = Math.atan2(P.y - C.y, P.x - C.x);
    const sweep = piece.t === 'T90' ? Math.PI / 2 : Math.PI;
    const ncell = piece.t === 'T90' ? 2 : 4;
    const len = sweep * R;
    const cells = [], samples = [];
    for (let i = 0; i < ncell; i++) {
      const a = a0 + turn * sweep * (i + 0.5) / ncell;
      cells.push({ x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R, kind: 'T', ang: a + turn * Math.PI / 2 });
    }
    const steps = Math.ceil(len * 4);
    for (let k = 1; k <= steps; k++) {
      const a = a0 + turn * sweep * k / steps;
      samples.push({ x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R, l: len * k / steps });
    }
    const aEnd = a0 + turn * sweep;
    return {
      P, cells, samples, len, C, a0, turn, sweep,
      end: { x: r6(C.x + Math.cos(aEnd) * R), y: r6(C.y + Math.sin(aEnd) * R) },
      h: piece.t === 'T90' ? nh : (h + 2) % 4,
    };
  }

  function weightedOrder(rand, items) {
    const pool = items.slice(), out = [];
    while (pool.length) {
      let r = rand() * pool.reduce((s, it) => s + it.w, 0), k = 0;
      for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
      out.push(pool[k].v);
      pool.splice(k, 1);
    }
    return out;
  }
  function shuffle(rand, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const sum = o => Object.values(o).reduce((s, v) => s + v, 0);

  /* ---------- geometry: a chain of blocks ---------- */
  function tryGeometry(rand, size, W, H) {
    const kit = AR.KIT;
    const target = size.blocks;
    const tpPairs = Math.min(kit.teleports, size.tp);
    const maxB2 = sum(kit.straight) + tpPairs * 2;
    const maxNP = Math.min(kit.noparking, size.np);
    const maxEX = Math.min(kit.exits, size.exits);
    const maxU = Math.min(kit.turn180, size.u180);
    const samples = [], placed = [];
    const straightAt = new Map();
    const cnt = { B2: 0, NP: 0, EX: 0, T90: 0, T180: 0 };
    let cellCount = 0;
    let budget = 25000;

    function valid(g, L0) {
      for (const s of g.samples) {
        if (s.x < -1e-6 || s.x > W + 1e-6 || s.y < -1e-6 || s.y > H + 1e-6) return false;
        const lim = L0 + s.l - 3.3;
        for (let i = 0; i < samples.length; i++) {
          const t = samples[i];
          if (t.l > lim) break;
          const dx = t.x - s.x, dy = t.y - s.y;
          if (dx * dx + dy * dy < MIN_GAP2) return false;
        }
      }
      return true;
    }
    function push(block, g, L) {
      const rec = Object.assign({}, block, { g, L, firstCell: cellCount, mark: samples.length, keys: [] });
      for (const s of g.samples) samples.push({ x: s.x, y: s.y, l: L + s.l });
      g.cells.forEach((c, i) => {
        if (c.kind !== 'S') return;
        const k = key(c.x, c.y);
        straightAt.set(k, cellCount + i);
        rec.keys.push(k);
      });
      cellCount += g.cells.length;
      if (cnt[block.kind] !== undefined) cnt[block.kind]++;
      placed.push(rec);
    }
    function pop() {
      const rec = placed.pop();
      samples.length = rec.mark;
      rec.keys.forEach(k => straightAt.delete(k));
      cellCount = rec.firstCell;
      if (cnt[rec.kind] !== undefined) cnt[rec.kind]--;
    }
    // З'їзд fits where an earlier lane runs right beside the road (2 units to the side)
    function exitTarget(P, h) {
      const d = DIRS[h];
      const cx = P.x + d[0] * 0.5, cy = P.y + d[1] * 0.5;
      for (const n of [DIRS[(h + 1) % 4], DIRS[(h + 3) % 4]]) {
        const j = straightAt.get(key(cx + n[0] * 2, cy + n[1] * 2));
        if (j !== undefined && j > 2 && cellCount - j >= 8 && cellCount - j <= 18) return { j, n };
      }
      return null;
    }
    function rec(P, h, L, since, lastKind) {
      if (--budget < 0) return false;
      if (placed.length === target - 1) {
        const g = pieceGeom(P, h, { t: 'S', n: 2 });
        if (!valid(g, L)) return false;
        push({ kind: 'FIN', piece: { t: 'S', n: 2 } }, g, L);
        return true;
      }
      const n = placed.length;
      const opts = [];
      if (cnt.B2 < maxB2) opts.push({ w: 4, v: { kind: 'B2', piece: { t: 'S', n: 2 } } });
      if (cnt.NP < maxNP && lastKind !== 'NP' && n >= 3 && n < target - 3) opts.push({ w: 0.7, v: { kind: 'NP', piece: { t: 'S', n: 3 } } });
      if (cnt.EX < maxEX && n >= 5 && n < target - 2 && lastKind !== 'EX') {
        const ex = exitTarget(P, h);
        if (ex) opts.push({ w: 3, v: { kind: 'EX', piece: { t: 'S', n: 1 }, exit: ex } });
      }
      if (since >= 1 && cnt.T90 < AR.KIT.turn90) {
        opts.push({ w: 2.2, v: { kind: 'T90', piece: { t: 'T90', dir: 1 } } }, { w: 2.2, v: { kind: 'T90', piece: { t: 'T90', dir: -1 } } });
      }
      if (since >= 3 && n >= 4 && cnt.T180 < maxU) {
        opts.push({ w: 0.7, v: { kind: 'T180', piece: { t: 'T180', dir: 1 } } }, { w: 0.7, v: { kind: 'T180', piece: { t: 'T180', dir: -1 } } });
      }
      for (const v of weightedOrder(rand, opts)) {
        const g = pieceGeom(P, h, v.piece);
        if (!valid(g, L)) continue;
        push(v, g, L);
        const isS = v.piece.t === 'S';
        if (rec(g.end, g.h, L + g.len, isS ? since + v.piece.n : 0, v.kind)) return true;
        pop();
        if (budget < 0) return false;
      }
      return false;
    }

    const P0 = { x: 0, y: rand() < 0.5 ? H - 1 : 1 };
    const g0 = pieceGeom(P0, 0, { t: 'S', n: 2 });
    push({ kind: 'START', piece: { t: 'S', n: 2 } }, g0, 0);
    if (!rec(g0.end, 0, g0.len, 2, 'START')) return null;
    return { placed, samples, tpPairs };
  }

  function generate(seed, sizeKey) {
    const size = AR.TRACK_SIZES[sizeKey] || AR.TRACK_SIZES.medium;
    for (let attempt = 0; attempt < 20; attempt++) {
      const grow = Math.floor(attempt / 4);
      const rand = makeRng(seed * 31 + attempt * 7919);
      const geo = tryGeometry(rand, size, size.W + grow, size.H + grow);
      if (geo) return decorate(seed, sizeKey in AR.TRACK_SIZES ? sizeKey : 'medium', size, geo, rand);
    }
    throw new Error('track generation failed');
  }

  /* ---------- block contents, checks on joints, СТО ---------- */
  function decorate(seed, sizeKey, size, geo, rand) {
    const { placed, samples, tpPairs } = geo;
    const kit = AR.KIT;
    const cells = [];
    const blocks = placed.map((pc, k) => {
      const n = pc.g.cells.length;
      pc.g.cells.forEach((c, i) => {
        const l = pc.L + (pc.piece.t === 'S' ? i + 0.5 : pc.g.len * (i + 0.5) / n);
        cells.push({ i: cells.length, x: c.x, y: c.y, kind: c.kind, h: c.h, ang: c.ang, block: k, l, type: 'plain' });
      });
      return { kind: pc.kind, first: pc.firstCell, n, exit: pc.exit };
    });
    const N = cells.length, last = N - 1;
    cells[0].type = 'start';
    cells[last].type = 'finish';
    const decor = []; // occupied spots beside the road: {x, y, r}
    const sides = h => [DIRS[(h + 1) % 4], DIRS[(h + 3) % 4]];
    const roadClear = (x, y, lc, exclude, need) => samples.every(t => Math.abs(t.l - lc) <= exclude || Math.hypot(t.x - x, t.y - y) >= need);
    const decorClear = (x, y, r) => decor.every(d => Math.hypot(d.x - x, d.y - y) >= d.r + r + 0.04);

    // fixed blocks
    const exits = [];
    blocks.forEach(b => {
      if (b.kind === 'NP') for (let k = 0; k < b.n; k++) Object.assign(cells[b.first + k], { type: 'noparking', npStart: b.first });
      if (b.kind === 'EX') {
        const c = cells[b.first];
        Object.assign(c, { type: 'exit', exitTo: b.exit.j, exitN: b.exit.n });
        exits.push({ i: c.i, j: b.exit.j, n: b.exit.n });
        decor.push({ x: c.x + b.exit.n[0], y: c.y + b.exit.n[1], r: 0.45 });
      }
    });

    // two-tile straight blocks: teleport pairs 3–7 blocks apart, then the printed special tiles
    const b2 = blocks.map((b, k) => ({ b, k })).filter(o => o.b.kind === 'B2');
    const colors = ['pink', 'orange', 'cyan'].slice(0, tpPairs);
    const used = new Set();
    const flip = () => (rand() < 0.5 ? 0 : 1);
    for (const color of colors) {
      for (let tries = 0; tries < 120; tries++) {
        const a = b2[Math.floor(rand() * b2.length)];
        const partners = b2.filter(o => o.k - a.k >= 3 && o.k - a.k <= 7 && !used.has(o.k));
        if (used.has(a.k) || !partners.length) continue;
        const b = partners[Math.floor(rand() * partners.length)];
        const ca = a.b.first + flip(), cb = b.b.first + flip();
        Object.assign(cells[ca], { type: 'tp', color, pair: cb });
        Object.assign(cells[cb], { type: 'tp', color, pair: ca });
        used.add(a.k); used.add(b.k);
        break;
      }
    }
    const bag = [];
    for (const [type, n] of Object.entries(kit.straight)) for (let k = 0; k < n; k++) bag.push(type);
    shuffle(rand, bag);
    for (const o of b2) {
      if (used.has(o.k) || !bag.length) continue;
      cells[o.b.first + flip()].type = bag.pop();
    }

    const checks = {};
    // every turn block carries its own check wedge
    placed.forEach(pc => {
      if (pc.piece.t === 'S') return;
      const is90 = pc.piece.t === 'T90';
      const b = pc.firstCell + (is90 ? 0 : 1);
      const am = pc.g.a0 + pc.g.turn * pc.g.sweep / 2;
      checks[b] = { type: is90 ? 'turn90' : 'turn180', diff: is90 ? 7 : 5, b, C: pc.g.C, am, turn: pc.g.turn };
    });

    // СТО: side pockets roughly every 8 blocks, on the plain tile of a road block
    const pits = [];
    const nPits = Math.min(kit.pits, Math.max(1, Math.floor((blocks.length - 2) / 8)));
    for (let t = 1; t <= nPits; t++) {
      const want = Math.round(t * blocks.length / (nPits + 1));
      const order = b2.slice().sort((x, y) => Math.abs(x.k - want) - Math.abs(y.k - want));
      let done = false;
      for (const o of order) {
        if (done || Math.abs(o.k - want) > 4 || o.k < 2) continue;
        const ci = [o.b.first, o.b.first + 1].find(i => cells[i].type === 'plain');
        if (ci === undefined || pits.some(p => Math.abs(p.cell - ci) < 9)) continue;
        const c = cells[ci];
        for (const n of shuffle(rand, sides(c.h).slice())) {
          const px = c.x + n[0] * 1.02, py = c.y + n[1] * 1.02;
          if (!roadClear(px, py, c.l, 1.0, 1.22) || !decorClear(px, py, 0.72)) continue;
          const pit = { cell: ci, x: px, y: py, n, rot: Math.atan2(-n[0], n[1]) * 180 / Math.PI, id: pits.length };
          pits.push(pit);
          c.pit = pit.id;
          decor.push({ x: px, y: py, r: 0.72 });
          done = true;
          break;
        }
      }
    }

    // joints between blocks; signs may only stand on a joint of two straight blocks
    const joints = blocks.slice(1).map(b => b.first - 1);
    const jointAt = {};
    placed.forEach((pc, k) => {
      if (!k) return;
      const b = pc.firstCell - 1, c1 = cells[b], c2 = cells[b + 1];
      const s = c1.kind === 'S' ? c1 : c2.kind === 'S' ? c2 : null;
      if (s) jointAt[b] = { h: s.h, bx: pc.g.P.x, by: pc.g.P.y, lc: pc.L };
    });
    const signCands = joints.filter(b => b >= 1 && b + 1 <= last - 1 && jointAt[b]);
    const signSpot = b => {
      const { h, bx, by, lc } = jointAt[b];
      for (const n of shuffle(rand, sides(h).slice())) {
        const sx = bx + n[0] * 0.86, sy = by + n[1] * 0.86;
        if (roadClear(sx, sy, lc, 1.25, 1.35) && decorClear(sx, sy, 0.36)) return { n, sx, sy, bx, by };
      }
      return null;
    };
    const farFromChecks = (b, gap) => Object.keys(checks).every(o => Math.abs(o - b) >= gap);
    function placeSign(type, b) {
      const spot = signSpot(b);
      if (!spot) return false;
      checks[b] = Object.assign({ type, b }, spot);
      decor.push({ x: spot.sx, y: spot.sy, r: 0.36 });
      return true;
    }
    const want = Object.assign({}, size.signs);
    for (const k in want) want[k] = Math.min(want[k], kit.signs[k]);
    const zones = [];
    for (let z = 0; z < want.no_overtake; z++) {
      let ok = false;
      for (const b1 of shuffle(rand, signCands.slice())) {
        if (ok) break;
        if (b1 < 5 || !farFromChecks(b1, 3) || zones.some(zz => b1 > zz.b1 - 14 && b1 < zz.b2 + 4)) continue;
        for (const b2j of shuffle(rand, signCands.filter(x => x - b1 >= 5 && x - b1 <= 10))) {
          if (!farFromChecks(b2j, 3)) continue;
          if (!placeSign('no_overtake', b1)) break;
          if (!placeSign('no_overtake_end', b2j)) { delete checks[b1]; decor.pop(); continue; }
          zones.push({ b1, b2: b2j });
          ok = true;
          break;
        }
      }
    }
    const queue = [];
    for (const t of ['police', 'customs', 'cam_max', 'cam_min']) for (let k = 0; k < want[t]; k++) queue.push(t);
    shuffle(rand, queue);
    const seg = (N - 4) / Math.max(1, queue.length);
    queue.forEach((type, k) => {
      const lo = 2 + Math.floor(seg * k), hi = 2 + Math.floor(seg * (k + 1));
      const pool = shuffle(rand, signCands.filter(b => b >= lo && b < hi)).concat(shuffle(rand, signCands.slice()));
      for (const b of pool) {
        if (!farFromChecks(b, 3) || checks[b]) continue;
        if (placeSign(type, b)) break;
      }
    });

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    cells.forEach(c => grow(c.x, c.y, 0.75));
    decor.forEach(d => grow(d.x, d.y, d.r + 0.15));

    return {
      seed, sizeKey, cells, checks, zones, pits, exits, joints,
      blocks: blocks.map(b => ({ kind: b.kind, first: b.first, n: b.n })),
      pieces: placed.map(pc => ({ piece: pc.piece, g: { P: pc.g.P, end: pc.g.end, C: pc.g.C, a0: pc.g.a0, turn: pc.g.turn } })),
      finish: last,
      bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    };
  }

  /* SVG path of the road centreline (units × S) */
  function pathD(track, S) {
    let d = '';
    track.pieces.forEach((pc, k) => {
      const { piece, g } = pc;
      if (k === 0) d += `M${g.P.x * S} ${g.P.y * S}`;
      if (piece.t === 'S') { d += ` L${g.end.x * S} ${g.end.y * S}`; return; }
      const sf = piece.dir > 0 ? 1 : 0;
      if (piece.t === 'T90') { d += ` A${S} ${S} 0 0 ${sf} ${g.end.x * S} ${g.end.y * S}`; return; }
      const am = g.a0 + g.turn * Math.PI / 2;
      const mx = g.C.x + Math.cos(am) * R, my = g.C.y + Math.sin(am) * R;
      d += ` A${S} ${S} 0 0 ${sf} ${mx * S} ${my * S} A${S} ${S} 0 0 ${sf} ${g.end.x * S} ${g.end.y * S}`;
    });
    return d;
  }

  AR.Track = { generate, pathD, DIRS, R };
})();
