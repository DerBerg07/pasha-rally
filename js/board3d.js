/* Isometric 3D board (three.js): a diorama island with the generated track, printed tiles as textures,
   props, low-poly racer vehicles and an orthographic camera you can pan, zoom and turn.
   Same interface as the SVG board, so the rest of the game does not care which one is used. */
(function () {
  if (!window.THREE || !AR.Models) return;
  const T = THREE;
  function webglOK() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }
  if (!webglOK()) return;
  const Mo = AR.Models;
  const DIRS = AR.Track.DIRS;
  const loader = new T.TextureLoader();
  const texCache = new Map();
  function tex(key) {
    if (!texCache.has(key)) {
      const src = AR.TEX && AR.TEX[key];
      let t = null;
      if (src) { t = loader.load(src); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; }
      texCache.set(key, t);
    }
    return texCache.get(key);
  }
  const imgCache = new Map();
  function img(key, cb) {
    let im = imgCache.get(key);
    if (!im) { im = new Image(); im.src = (AR.TEX && AR.TEX[key]) || ''; imgCache.set(key, im); }
    if (im.complete && im.naturalWidth) cb(im); else im.addEventListener('load', () => cb(im), { once: true });
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const KIND = { stop: 'kindStop', check: 'kindCheck', zone: 'kindZone' };
  function tipContent(track, ref) {
    if (ref.pit !== undefined) return { title: AR.tx(AR.PIT, 'name'), kind: AR.t('kindPit'), text: AR.tx(AR.PIT, 'text') };
    if (ref.check !== undefined) {
      const def = AR.CHECKS[track.checks[ref.check].type];
      return { title: AR.tx(def, 'name'), kind: AR.t('kindCheck'), text: AR.tx(def, 'text') };
    }
    if (ref.player !== undefined) return null;
    const c = track.cells[ref.cell];
    if (c.type === 'tp') return { title: AR.t('tpTip', AR.t('tpColor')[c.color], c.pair), kind: AR.t('kindStop'), text: AR.tx(AR.TILES.tp, 'text') + ' · ' + AR.t('tileTip', c.i) };
    const def = AR.TILES[c.type] || AR.TILES.plain;
    return { title: AR.tx(def, 'name') + ' · ' + AR.t('tileTip', c.i), kind: def.kind ? AR.t(KIND[def.kind]) : '', text: AR.tx(def, 'text') || '' };
  }

  /* centreline samples along the road: {x, y, tx, ty, l} in track units (y = screen down = world z) */
  function centerline(track, step = 0.05) {
    const pts = [];
    let L = 0;
    track.pieces.forEach(pc => {
      const { piece, g } = pc;
      if (piece.t === 'S') {
        const dx = g.end.x - g.P.x, dy = g.end.y - g.P.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / step));
        for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push({ x: g.P.x + dx * i / n, y: g.P.y + dy * i / n, tx: dx / len, ty: dy / len, l: L + len * i / n });
        L += len;
      } else {
        const sweep = piece.t === 'T90' ? Math.PI / 2 : Math.PI, n = Math.round(sweep / step);
        for (let i = pts.length ? 1 : 0; i <= n; i++) {
          const a = g.a0 + g.turn * sweep * i / n;
          pts.push({ x: g.C.x + Math.cos(a), y: g.C.y + Math.sin(a), tx: -Math.sin(a) * g.turn, ty: Math.cos(a) * g.turn, l: L + sweep * i / n });
        }
        L += sweep;
      }
    });
    return pts;
  }
  function ribbon(pts, half, y, offset = 0) {
    const pos = [], idx = [];
    pts.forEach((p, i) => {
      const nx = -p.ty, ny = p.tx;
      const cx = p.x + nx * offset, cy = p.y + ny * offset;
      pos.push(cx + nx * half, y, cy + ny * half, cx - nx * half, y, cy - ny * half);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const headingOf = c => (c.kind === 'S' ? Math.atan2(DIRS[c.h][1], DIRS[c.h][0]) : c.ang);

  function textSprite(text, { color = '#fff', stroke = '#151820', size = 64, font = '"Dela Gothic One", "Onest", sans-serif', scale = 0.32 } = {}) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = `${size}px ${font}`;
    const w = Math.ceil(ctx.measureText(text).width + size * 0.6);
    cv.width = w; cv.height = Math.ceil(size * 1.5);
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.22; ctx.strokeStyle = stroke;
    ctx.strokeText(text, w / 2, cv.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, cv.height / 2);
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    sp.scale.set(scale * w / cv.height, scale, 1);
    sp.renderOrder = 10;
    return sp;
  }

  const ROAD = '#474c55', SHOULDER = '#2b2f37', LINE = '#eef0f2';
  const TOP = 0.115; // height of a tile's top face: racers and markers stand here

  /* Chunky printed tiles: a rounded square (or disc) with bevelled edges; the texture maps onto the top face. */
  function tileGeometry(round) {
    const s = 0.84, h = s / 2, r = 0.1;
    const sh = new T.Shape();
    if (round) sh.absarc(0, 0, 0.33, 0, Math.PI * 2, false);
    else {
      sh.moveTo(-h + r, -h); sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r);
      sh.lineTo(h, h - r); sh.quadraticCurveTo(h, h, h - r, h); sh.lineTo(-h + r, h);
      sh.quadraticCurveTo(-h, h, -h, h - r); sh.lineTo(-h, -h + r); sh.quadraticCurveTo(-h, -h, -h + r, -h);
    }
    const UVGenerator = {
      generateTopUV: (g, v, a, b, c) => [a, b, c].map(i => new T.Vector2(v[i * 3] / s + 0.5, v[i * 3 + 1] / s + 0.5)),
      generateSideWallUV: () => [new T.Vector2(0, 0), new T.Vector2(1, 0), new T.Vector2(1, 1), new T.Vector2(0, 1)],
    };
    const g = new T.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: round ? 20 : 4, UVGenerator });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.03, 0); // bottom at y≈0.005, top face at TOP
    return g;
  }

  /* Bake every static mesh of a group into one geometry per material: hundreds of trees become a few draw calls. */
  function mergeStatic(group, parent, own) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    group.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(g);
    });
    for (const [mat, list] of buckets) {
      const merged = new T.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        if (!list.every(g => g.attributes[name])) continue;
        const size = list[0].attributes[name].itemSize;
        const arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].array.length, 0));
        let off = 0;
        for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
        merged.setAttribute(name, new T.BufferAttribute(arr, size));
      }
      list.forEach(g => g.dispose());
      const m = new T.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      own.push(merged);
    }
    group.parent && group.parent.remove(group);
  }

  class Board3D {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.tokens = new Map();
      this.onPick = null;
      this.hlCells = new Set();
      this.hlPlayers = new Set();
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
      this.follow = !!opts.follow;
      this.fx = [];
    }

    /* ---------- renderer, camera, input ---------- */
    ensure() {
      if (this.renderer) return;
      const r = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputColorSpace = T.SRGBColorSpace;
      r.toneMapping = T.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.domElement.className = 'board-canvas';
      this.host.innerHTML = '';
      this.host.appendChild(r.domElement);
      this.renderer = r;
      this.scene = new T.Scene();
      this.camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
      this.scene.add(new T.HemisphereLight('#e8f6ff', '#6f9a4f', 1.15));
      const sun = new T.DirectionalLight('#fff3dc', 2.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
      this.scene.add(sun, sun.target);
      this.sun = sun;
      this.raycaster = new T.Raycaster();
      this.cam = { base: new T.Vector3(), yaw: Math.PI / 4, half: 6 };
      this.want = { base: new T.Vector3(), yaw: Math.PI / 4, half: 6 };
      this.elev = 0.61; // ≈35° — the classic isometric tilt
      new ResizeObserver(() => this.resize()).observe(this.host);
      this.bindInput();
      this.clock = new T.Clock();
      const loop = () => { requestAnimationFrame(loop); this.frame(); };
      requestAnimationFrame(loop);
    }
    size() { const rc = this.host.getBoundingClientRect(); return { w: Math.max(1, rc.width), h: Math.max(1, rc.height) }; }
    resize() {
      if (!this.renderer) return;
      const { w, h } = this.size();
      this.renderer.setSize(w, h, false);
      if (this.track && !this.userMoved) this.fit(true);
    }
    setInsets(ins) {
      this.insets = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, ins);
      if (this.track && !this.userMoved && !this.follow) this.fit();
    }
    /* screen-space helpers: world units per pixel and the ground directions of screen right / screen up */
    axes(c = this.cam) {
      const { h } = this.size();
      const upp = (2 * c.half) / h;
      const right = new T.Vector3(Math.sin(c.yaw), 0, -Math.cos(c.yaw));
      const upGround = new T.Vector3(-Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      return { upp, right, upGround };
    }
    /* camera target that puts `base` in the middle of the screen area the HUD leaves free */
    targetOf(c) {
      const { upp, right, upGround } = this.axes(c);
      const ins = this.insets;
      return c.base.clone()
        .addScaledVector(right, -((ins.left - ins.right) / 2) * upp)
        .addScaledVector(upGround, (((ins.top - ins.bottom) / 2) * upp) / Math.sin(this.elev));
    }
    placeCamera(c) {
      const { w, h } = this.size();
      const aspect = w / h;
      const cam = this.camera;
      cam.left = -c.half * aspect; cam.right = c.half * aspect; cam.top = c.half; cam.bottom = -c.half;
      const t = this.targetOf(c);
      const d = 40;
      cam.position.set(t.x + Math.cos(this.elev) * Math.cos(c.yaw) * d, Math.sin(this.elev) * d, t.z + Math.cos(this.elev) * Math.sin(c.yaw) * d);
      cam.lookAt(t);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
    fit(instant) {
      if (!this.track) return;
      const b = this.bounds;
      const { w, h } = this.size();
      const ins = this.insets;
      const availW = Math.max(120, w - ins.left - ins.right), availH = Math.max(120, h - ins.top - ins.bottom);
      const base = new T.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      const yaws = this.opts.preview ? [0, 1, 2, 3].map(k => this.want.yaw + k * Math.PI / 4) : [this.want.yaw];
      const cam = this.camera, v = new T.Vector3();
      let half = 0;
      for (const yaw of yaws) {
        cam.position.set(base.x + Math.cos(this.elev) * Math.cos(yaw) * 40, Math.sin(this.elev) * 40, base.z + Math.cos(this.elev) * Math.sin(yaw) * 40);
        cam.lookAt(base);
        cam.updateMatrixWorld();
        let ex = 0, ey = 0;
        for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [-0.7, 1]) {
          v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
          ex = Math.max(ex, Math.abs(v.x)); ey = Math.max(ey, Math.abs(v.y));
        }
        half = Math.max(half, Math.max(ey * h / availH, ex * h / availW) * 1.04);
      }
      this.fitHalf = half;
      this.want.base.copy(base);
      this.want.half = this.follow ? half / 2.2 : half;
      if (instant) { this.cam.base.copy(base); this.cam.half = this.want.half; this.cam.yaw = this.want.yaw; }
    }
    rotate(dir) { this.want.yaw += dir * Math.PI / 2; }
    zoom(f) { this.want.half = Math.min(this.fitHalf * 1.6, Math.max(this.fitHalf / 6, this.want.half / f)); this.userMoved = true; }
    setFollow(on) {
      this.follow = on;
      this.userMoved = false;
      if (on) this.want.half = this.fitHalf / 2.2; else this.fit();
      return on;
    }
    toggleFollow() { return this.setFollow(!this.follow); }

    bindInput() {
      const el = this.renderer.domElement;
      const pts = new Map();
      let drag = null, pinch = null;
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), half: this.want.half };
          drag = null;
        } else drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      });
      el.addEventListener('pointermove', e => {
        if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.want.half = Math.min(this.fitHalf * 1.6, Math.max(this.fitHalf / 6, pinch.half * pinch.d / Math.max(20, d)));
          this.userMoved = true;
          return;
        }
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; this.hideTip(); }
          if (drag.moved && !this.opts.preview) {
            const { upp, right, upGround } = this.axes();
            this.want.base.addScaledVector(right, -dx * upp).addScaledVector(upGround, (dy * upp) / Math.sin(this.elev));
            this.cam.base.copy(this.want.base);
            this.userMoved = true;
            if (this.follow && this.onFollowChange) { this.follow = false; this.onFollowChange(false); }
          }
          drag.x = e.clientX; drag.y = e.clientY;
          return;
        }
        this.hover(e);
      });
      const end = e => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (drag && !drag.moved && e.type === 'pointerup') this.click(e);
        if (!pts.size) drag = null;
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', () => this.hideTip());
      el.addEventListener('wheel', e => {
        if (this.opts.preview) return;
        e.preventDefault();
        this.zoom(Math.pow(1.0015, -e.deltaY));
      }, { passive: false });
    }
    pickAt(e) {
      const rc = this.renderer.domElement.getBoundingClientRect();
      const m = new T.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      this.raycaster.setFromCamera(m, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      return hits.length ? hits[0].object.userData : null;
    }
    hover(e) {
      if (!this.track || !this.pickables) return;
      const d = this.pickAt(e);
      const el = this.renderer.domElement;
      const pickable = d && ((d.cell !== undefined && this.hlCells.has(d.cell)) || (d.player !== undefined && this.hlPlayers.has(d.player)));
      el.style.cursor = pickable ? 'pointer' : d ? 'help' : '';
      const tip = document.getElementById('tooltip');
      if (!tip || !this.opts.interactive) return;
      const c = d && d.tip ? tipContent(this.track, d.tip) : null;
      if (!c) { tip.hidden = true; return; }
      tip.innerHTML = `<div class="tt-kind">${c.kind || ''}</div><div class="tt-title">${c.title}</div>${c.text ? `<div class="tt-text">${c.text}</div>` : ''}`;
      tip.hidden = false;
      const pad = 14, r = tip.getBoundingClientRect();
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    hideTip() { const tip = document.getElementById('tooltip'); if (tip) tip.hidden = true; }
    click(e) {
      const d = this.pickAt(e);
      if (!d || !this.onPick) return;
      if (d.cell !== undefined && this.hlCells.has(d.cell)) this.onPick({ cell: d.cell });
      else if (d.player !== undefined && this.hlPlayers.has(d.player)) this.onPick({ player: d.player });
    }

    /* ---------- building the diorama ---------- */
    clearWorld() {
      if (this.world) {
        this.scene.remove(this.world);
        (this.own || []).forEach(o => o.dispose && o.dispose());
      }
      this.own = [];
      this.world = new T.Group();
      this.scene.add(this.world);
      this.pickables = [];
      this.anim = [];
      this.tokens.clear();
      this.hl = new T.Group();
      this.world.add(this.hl);
      this.statics = new T.Group(); // merged into a few meshes once the track is built
      this.world.add(this.statics);
    }
    keep(o) { this.own.push(o); return o; }
    meshOwn(g, m, parent = this.world) {
      this.keep(g);
      const o = new T.Mesh(g, m);
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    render(track) {
      this.ensure();
      // coming back from the flat board: put the canvas back into the stage
      if (this.renderer.domElement.parentNode !== this.host) { this.host.innerHTML = ''; this.host.appendChild(this.renderer.domElement); }
      this.clearWorld();
      this.track = track;
      this.userMoved = false;
      const rand = makeRng(track.seed * 7 + 3);
      const cells = track.cells;
      const pts = centerline(track);
      this.pts = pts;
      // spots beside the road already taken by garages, signs and exit bridges
      this.occupied = [];
      for (const pit of track.pits) { const pc = track.cells[pit.cell]; this.occupied.push({ x: pc.x + pit.n[0] * 1.18, y: pc.y + pit.n[1] * 1.18, r: 0.7 }); }
      for (const k in track.checks) { const ch = track.checks[k]; if (ch.sx !== undefined) this.occupied.push({ x: ch.sx, y: ch.sy, r: 0.3 }); }
      for (const ec of track.cells) if (ec.type === 'exit') { const t = track.cells[ec.exitTo]; this.occupied.push({ x: (ec.x + t.x) / 2, y: (ec.y + t.y) / 2, r: 0.6 }); }
      const b = track.bbox, m = 1.3;
      this.bounds = { x0: b.x - m, x1: b.x + b.w + m, z0: b.y - m, z1: b.y + b.h + m };
      const B = this.bounds, W = B.x1 - B.x0, D = B.z1 - B.z0;
      const W0 = this.world;

      // island: grass top, layered earth sides
      const grass = Mo.mat('#8dcc5f', { flatShading: false, roughness: 0.95 });
      const dirt = Mo.mat('#b67c48', { roughness: 0.95 });
      const isl = this.meshOwn(new T.BoxGeometry(W, 0.4, D), [dirt, dirt, grass, dirt, dirt, dirt]);
      isl.position.set(B.x0 + W / 2, -0.2, B.z0 + D / 2);
      const base = this.meshOwn(new T.BoxGeometry(W - 0.3, 0.35, D - 0.3), Mo.mat('#8a5a33', { roughness: 1 }));
      base.position.set(B.x0 + W / 2, -0.55, B.z0 + D / 2);

      // road: dark shoulder, asphalt, white edge lines
      this.meshOwn(ribbon(pts, 0.58, 0.012), Mo.mat(SHOULDER, { flatShading: false, roughness: 0.9 }));
      this.meshOwn(ribbon(pts, 0.5, 0.02), Mo.mat(ROAD, { flatShading: false, roughness: 0.85 }));
      for (const off of [-0.45, 0.45]) this.meshOwn(ribbon(pts, 0.016, 0.024, off), Mo.mat(LINE, { flatShading: false }));

      // З'їзд bridges between neighbouring lanes
      for (const c of cells) {
        if (c.type !== 'exit') continue;
        const t = cells[c.exitTo];
        const mx = (c.x + t.x) / 2, mz = (c.y + t.y) / 2;
        const horiz = Math.abs(c.exitN[0]) > 0;
        const br = this.meshOwn(new T.BoxGeometry(horiz ? 1.2 : 0.5, 0.06, horiz ? 0.5 : 1.2), Mo.mat(ROAD));
        br.position.set(mx, 0.03, mz);
        br.castShadow = true;
        for (const s of [-0.27, 0.27]) {
          const rail = this.meshOwn(new T.BoxGeometry(horiz ? 1.2 : 0.04, 0.08, horiz ? 0.04 : 1.2), Mo.mat('#f0c43c'));
          rail.position.set(mx + (horiz ? 0 : s), 0.08, mz + (horiz ? s : 0));
          rail.castShadow = true;
        }
      }

      // no-overtaking zones: red wash on the asphalt
      const zoneMat = new T.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.28, depthWrite: false });
      for (const z of track.zones) {
        const zp = pts.filter(p => p.l > cells[z.b1].l + 0.5 && p.l < cells[z.b2].l + 0.5);
        if (zp.length > 1) this.meshOwn(ribbon(zp, 0.5, 0.027), zoneMat);
      }
      // seams between printed blocks
      for (const bj of track.joints || []) {
        const c1 = cells[bj], c2 = cells[bj + 1];
        if (!c1 || !c2 || c1.kind !== 'S' || c2.kind !== 'S' || c1.h !== c2.h) continue;
        const s = this.meshOwn(new T.BoxGeometry(0.03, 0.006, 0.98), Mo.mat('#22252b'), this.statics);
        s.position.set((c1.x + c2.x) / 2, 0.026, (c1.y + c2.y) / 2);
        s.rotation.y = -headingOf(c1);
      }

      // tiles
      const tileGeo = this.keep(tileGeometry(false));
      const side = Mo.mat('#d9dce1', { flatShading: false, roughness: 0.7 });
      const tileMats = new Map();
      const tileMat = key => {
        if (!tileMats.has(key)) tileMats.set(key, [new T.MeshStandardMaterial({ map: tex('tile/' + key), roughness: 0.7 }), side]);
        return tileMats.get(key);
      };
      const roundGeo = this.keep(tileGeometry(true));
      const dashGeo = this.keep(new T.BoxGeometry(0.24, 0.012, 0.05));
      this.cellMeshes = [];
      for (const c of cells) {
        let node;
        if (c.kind === 'T') {
          node = new T.Mesh(roundGeo, [Mo.mat('#8e939a', { flatShading: false }), side]);
          const dash = new T.Mesh(dashGeo, Mo.mat('#f1f2f4'));
          dash.position.y = TOP + 0.004;
          dash.rotation.y = -c.ang;
          node.add(dash);
        } else {
          const key = c.type === 'tp' ? `tp_${c.color}` : c.type === 'start' || c.type === 'finish' ? c.type : (AR.TILES[c.type] || AR.TILES.plain).img;
          node = new T.Mesh(tileGeo, tileMat(key));
          node.rotation.y = c.type === 'exit' ? -((c.h + 1) % 2) * Math.PI / 2 : -(c.h % 2) * Math.PI / 2;
        }
        node.position.set(c.x, 0, c.y);
        node.receiveShadow = true;
        node.castShadow = true;
        node.userData = { cell: c.i, tip: { cell: c.i } };
        W0.add(node);
        this.pickables.push(node);
        this.cellMeshes[c.i] = node;
        this.addProp(c, rand);
      }

      // START / FINISH arches
      for (const c of [cells[0], cells[track.finish]]) {
        const a = Mo.arch(c.type);
        a.position.set(c.x, 0.05, c.y);
        a.rotation.y = -headingOf(c);
        const banner = a.children[2];
        const bt = tex(c.type === 'start' ? 'tile/start' : 'tile/finish');
        banner.material = [new T.MeshStandardMaterial({ map: bt }), new T.MeshStandardMaterial({ map: bt }), banner.material, banner.material, banner.material, banner.material];
        a.traverse(o => { if (o.isMesh) o.castShadow = true; });
        W0.add(a);
        const hh = headingOf(c), nx = -Math.sin(hh), ny = Math.cos(hh);
        for (const sgn of [-1, 1]) {
          const fl = Mo.flag(c.type === 'finish');
          fl.position.set(c.x + nx * sgn * 0.78 - Math.cos(hh) * 0.3, 0, c.y + ny * sgn * 0.78 - Math.sin(hh) * 0.3);
          fl.rotation.y = -hh + Math.PI / 2;
          this.statics.add(fl);
        }
      }

      // checks: red bars on joints, signs on posts, turn wedges with difficulty
      for (const k in track.checks) {
        const chk = track.checks[k];
        if (chk.type === 'turn90' || chk.type === 'turn180') {
          const { C, am } = chk;
          const pt = (r, a) => new T.Vector2(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r);
          const shape = new T.Shape([pt(0.52, am - 0.07), pt(1.48, am - 0.2), pt(1.48, am + 0.2), pt(0.52, am + 0.07)]);
          const wg = this.meshOwn(new T.ShapeGeometry(shape).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: chk.type === 'turn90' ? '#f2cf3c' : '#ef4b3f', side: T.DoubleSide }));
          wg.position.y = 0.026;
          wg.userData = { tip: { check: chk.b } };
          this.pickables.push(wg);
          const num = textSprite(String(chk.diff), { color: '#6ff0ff', scale: 0.34 });
          num.position.set(C.x + Math.cos(am) * 1.72, 0.52, C.y + Math.sin(am) * 1.72);
          W0.add(num);
          continue;
        }
        const def = AR.CHECKS[chk.type];
        const h = headingOf(cells[chk.b]);
        const bar = new T.Mesh(this.keep(new T.BoxGeometry(0.07, 0.03, 1.02)), Mo.mat('#e8262f'));
        bar.position.set(chk.bx, 0.03, chk.by);
        bar.rotation.y = -h;
        this.statics.add(bar);
        const face = Math.atan2(-chk.n[0], -chk.n[1]); // turn the object towards the road
        let obj, label = 0.66, size = 0.42;
        if (chk.type === 'cam_max' || chk.type === 'cam_min') { obj = Mo.speedCamera(chk.type === 'cam_max' ? '#2fe6ff' : '#ff3b3b'); label = 0.98; size = 0.3; }
        else if (chk.type === 'police') { obj = Mo.policeBooth(); obj.scale.setScalar(0.85); label = 0.82; size = 0.3; }
        else if (chk.type === 'customs') { obj = Mo.boomBarrier(); label = 0.66; size = 0.3; }
        else obj = Mo.signPost(0.48);
        obj.position.set(chk.sx, 0, chk.sy);
        obj.rotation.y = face;
        obj.traverse(o => { if (o.isMesh) { o.userData = { tip: { check: chk.b } }; } });
        this.statics.add(obj);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: tex('sign/' + def.img) }));
        sp.scale.set(size, size * 0.9, 1);
        sp.position.set(chk.sx, label, chk.sy);
        sp.userData = { tip: { check: chk.b } };
        W0.add(sp);
        this.pickables.push(sp);
      }

      // red-and-white kerbs along both edges of every turn
      track.pieces.forEach(pc => {
        if (pc.piece.t === 'S') return;
        const g = pc.g, sweep = pc.piece.t === 'T90' ? Math.PI / 2 : Math.PI;
        for (const rr of [0.47, 1.53]) {
          const n = Math.max(4, Math.round(sweep * rr / 0.11));
          for (let k = 0; k < n; k++) {
            const a = g.a0 + g.turn * sweep * (k + 0.5) / n;
            const kb = Mo.box(0.1, 0.035, 0.06, k % 2 ? '#ffffff' : '#e8262f', 0, 0, 0, this.statics);
            kb.position.set(g.C.x + Math.cos(a) * rr, 0.03, g.C.y + Math.sin(a) * rr);
            kb.rotation.y = -(a + g.turn * Math.PI / 2);
          }
        }
      });

      // СТО garages with a driveway
      for (const pit of track.pits) {
        const c = cells[pit.cell];
        const n = pit.n;
        const gar = Mo.garage();
        gar.scale.setScalar(0.8);
        gar.position.set(c.x + n[0] * 1.18, 0, c.y + n[1] * 1.18);
        gar.rotation.y = Math.atan2(-n[0], -n[1]);
        gar.traverse(o => { if (o.isMesh) { o.userData = { tip: { pit: pit.id } }; this.pickables.push(o); } });
        W0.add(gar);
        const drive = new T.Mesh(this.keep(new T.BoxGeometry(0.5, 0.02, 0.5)), Mo.mat('#5b606a'));
        drive.position.set(c.x + n[0] * 0.72, 0.012, c.y + n[1] * 0.72);
        this.statics.add(drive);
        const sign = new T.Sprite(new T.SpriteMaterial({ map: tex('tile/pit') }));
        sign.scale.set(0.42, 0.36, 1);
        sign.position.set(c.x + n[0] * 1.3, 0.92, c.y + n[1] * 1.3);
        W0.add(sign);
      }

      this.addScenery(rand);
      mergeStatic(this.statics, this.world, this.own);
      this.fitShadow();
      this.fit(true);
      return this.renderer.domElement;
    }

    /* a free spot right beside the road next to cell c (or null when lanes run too close) */
    roadside(c, avoid) {
      const h = headingOf(c), nx = -Math.sin(h), ny = Math.cos(h);
      for (const sgn of [1, -1]) {
        if (avoid && avoid[0] === nx * sgn && avoid[1] === ny * sgn) continue;
        const x = c.x + nx * sgn * 0.84, y = c.y + ny * sgn * 0.84;
        let ok = this.occupied.every(o => (o.x - x) ** 2 + (o.y - y) ** 2 > (o.r + 0.3) ** 2);
        for (let i = 0; ok && i < this.pts.length; i += 2) {
          const p = this.pts[i];
          if (Math.abs(p.l - c.l) > 1.2 && (p.x - x) ** 2 + (p.y - y) ** 2 < 0.78 * 0.78) ok = false;
        }
        if (ok) { this.occupied.push({ x, y, r: 0.3 }); return { x, y, face: Math.atan2(-nx * sgn, -ny * sgn), h }; }
      }
      return null;
    }
    addProp(c, rand) {
      const W0 = this.world;
      const h = headingOf(c);
      const side = (rand() < 0.5 ? -1 : 1) * 0.28;
      const sx = -Math.sin(h) * side, sy = Math.cos(h) * side;
      const put = (o, x, y, rot) => { o.position.set(x, 0, y); o.rotation.y = rot; o.traverse(m => { if (m.isMesh) m.castShadow = true; }); this.statics.add(o); };
      let p = null;
      switch (c.type) {
        case 'car': p = Mo.parkedCar(); p.scale.setScalar(0.72); p.position.set(c.x + sx, TOP, c.y + sy); p.rotation.y = -h + (rand() - 0.5) * 0.4; break;
        case 'box': p = Mo.crateStack(rand); p.scale.setScalar(0.62); p.position.set(c.x + sx, TOP, c.y + sy); p.rotation.y = rand() * 2; break;
        case 'nitro': {
          p = Mo.chevrons('#7bf07a'); p.position.set(c.x, TOP, c.y); p.rotation.y = -h;
          const s = this.roadside(c); if (s) put(Mo.nosTank(), s.x, s.y, s.face + Math.PI / 2);
          break;
        }
        case 'tp': p = Mo.portal({ pink: '#ff4fd8', orange: '#ff8a1f', cyan: '#2fe6ff' }[c.color]); p.position.set(c.x, TOP - 0.02, c.y); p.rotation.y = -h + Math.PI / 2; break;
        case 'chase': {
          const s = this.roadside(c);
          if (s) {
            const pc = Mo.policeCar();
            for (const part of [pc.body, pc.lights]) { part.scale.setScalar(0.85); part.position.set(s.x, 0, s.y); part.rotation.y = -s.h; }
            put(pc.body, s.x, s.y, -s.h);
            pc.lights.traverse(m => { if (m.isMesh) m.castShadow = true; });
            W0.add(pc.lights);
            this.anim.push(pc.lights);
          } else { p = Mo.siren(); p.position.set(c.x + sx * 1.25, TOP, c.y + sy * 1.25); }
          break;
        }
        case 'crossing': { const s = this.roadside(c); if (s) put(Mo.crossingSign(), s.x, s.y, s.face); break; }
        case 'exit': { const s = this.roadside(c, c.exitN); if (s) put(Mo.uturnSign(), s.x, s.y, s.face); break; }
        case 'noparking': {
          if (c.i !== c.npStart) break;
          const s = this.roadside(c); if (s) put(Mo.roundSign('#2f5cff', '#e8262f', '#e8262f'), s.x, s.y, s.face);
          break;
        }
      }
      if (!p) return;
      p.traverse(o => { if (o.isMesh) o.castShadow = true; });
      (p.userData.spin || p.userData.bob || p.userData.blink ? W0 : this.statics).add(p);
      if (p.userData.spin || p.userData.bob || p.userData.blink) this.anim.push(p);
    }

    addScenery(rand) {
      const B = this.bounds, pts = this.pts;
      const near = (x, z, r) => {
        for (let i = 0; i < pts.length; i += 2) { const p = pts[i]; if ((p.x - x) ** 2 + (p.y - z) ** 2 < r * r) return true; }
        return false;
      };
      const taken = this.occupied.map(o => ({ x: o.x, z: o.y, r: o.r }));
      const free = (x, z, r) => taken.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + r) ** 2);
      for (let x = B.x0 + 0.35; x < B.x1 - 0.3; x += 0.55) {
        for (let z = B.z0 + 0.35; z < B.z1 - 0.3; z += 0.55) {
          const jx = x + (rand() - 0.5) * 0.4, jz = z + (rand() - 0.5) * 0.4;
          if (rand() > 0.3 || near(jx, jz, 0.85) || !free(jx, jz, 0.25)) continue;
          const r = rand();
          const o = r < 0.48 ? Mo.tree(rand) : r < 0.8 ? Mo.bush(rand) : Mo.rock(rand);
          o.position.set(jx, 0, jz);
          o.rotation.y = rand() * 6.28;
          o.scale.setScalar(0.8 + rand() * 0.45);
          this.statics.add(o);
          taken.push({ x: jx, z: jz, r: 0.22 });
        }
      }
      // traffic cones on the outside of turns
      for (const k in this.track.checks) {
        const ch = this.track.checks[k];
        if (!ch.C) continue;
        for (const da of [-0.32, 0, 0.32]) {
          const a = ch.am + da, x = ch.C.x + Math.cos(a) * 1.68, z = ch.C.y + Math.sin(a) * 1.68;
          if (x < B.x0 + 0.2 || x > B.x1 - 0.2 || z < B.z0 + 0.2 || z > B.z1 - 0.2 || near(x, z, 0.62) || !free(x, z, 0.08)) continue;
          const cn = da === 0 ? Mo.tireStack(rand) : Mo.cone();
          cn.position.set(x, 0, z);
          this.statics.add(cn);
        }
      }
    }

    fitShadow() {
      const B = this.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
      const s = this.sun;
      s.position.set(cx - 9, 16, cz - 5);
      s.target.position.set(cx, 0, cz);
      const r = Math.hypot(B.x1 - B.x0, B.z1 - B.z0) / 2 + 1;
      Object.assign(s.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 50 });
      s.shadow.camera.updateProjectionMatrix();
    }

    /* ---------- racers ---------- */
    setPlayers(players) {
      for (const tk of this.tokens.values()) this.world.remove(tk.group);
      this.tokens.clear();
      this.pickables = this.pickables.filter(o => o.userData.player === undefined);
      for (const p of players) {
        const group = new T.Group();
        const veh = Mo.vehicle(p.racer);
        veh.traverse(o => { if (o.isMesh) o.castShadow = true; });
        group.add(veh);
        // player-colour pennant on an antenna
        const ant = Mo.cyl(0.006, 0.006, 0.36, '#d5d8dd', -0.24, 0.36, 0.1, veh, 4);
        ant.castShadow = false;
        const flag = Mo.box(0.1, 0.06, 0.008, p.color, -0.19, 0.5, 0.1, veh, { emissive: p.color, emissiveIntensity: 0.25 });
        flag.castShadow = false;
        const ring = new T.Mesh(this.keep(new T.RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2)), new T.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0, depthWrite: false }));
        ring.position.y = 0.012;
        group.add(ring);
        const badge = this.badge(p);
        badge.position.y = 0.82;
        group.add(badge);
        const hit = new T.Mesh(this.keep(new T.BoxGeometry(0.7, 0.6, 0.5)), new T.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.3;
        hit.userData = { player: p.id, tip: { player: p.id } };
        group.add(hit);
        this.pickables.push(hit);
        this.world.add(group);
        this.tokens.set(p.id, { group, veh, ring, badge, pos: new T.Vector3(), target: new T.Vector3(), rot: 0, targetRot: 0, scale: 1, targetScale: 1, s: 1, ts: 1, color: p.color });
      }
      this.sync(players, true);
    }
    badge(p) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const ctx = cv.getContext('2d');
      const draw = im => {
        ctx.clearRect(0, 0, 128, 128);
        ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fillStyle = '#191c24'; ctx.fill();
        ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(64, 64, 45, 0, Math.PI * 2); ctx.clip();
        if (im) ctx.drawImage(im, 19, 19, 90, 90); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 128); }
        ctx.restore();
        t.needsUpdate = true;
      };
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      draw(null);
      img('racer/' + p.racer, draw);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      sp.scale.set(0.34, 0.34, 1);
      sp.renderOrder = 5;
      return sp;
    }
    spotOf(p) {
      if (p.inPit) {
        const pit = this.track.pits.find(pt => pt.cell === p.pos);
        if (pit) {
          const c = this.track.cells[pit.cell];
          return { x: c.x + pit.n[0] * 0.74, y: c.y + pit.n[1] * 0.74, h: Math.atan2(pit.n[1], pit.n[0]), key: 'pit' + pit.id, pit: true };
        }
      }
      const i = Math.max(0, Math.min(this.track.cells.length - 1, p._disp !== undefined ? p._disp : p.pos));
      const c = this.track.cells[i];
      return { x: c.x, y: c.y, h: headingOf(c), key: 'c' + i };
    }
    sync(players, instant) {
      if (!this.track) return;
      const groups = new Map();
      for (const p of players) {
        const s = this.spotOf(p);
        if (!groups.has(s.key)) groups.set(s.key, { s, list: [] });
        groups.get(s.key).list.push(p);
      }
      const LAY = {
        1: [[0, 0]], 2: [[0, -0.17], [0, 0.17]], 3: [[0.2, 0], [-0.17, -0.17], [-0.17, 0.17]],
        4: [[0.17, -0.17], [0.17, 0.17], [-0.17, -0.17], [-0.17, 0.17]],
        5: [[0.26, -0.17], [0.26, 0.17], [0, 0], [-0.26, -0.17], [-0.26, 0.17]],
        6: [[0.26, -0.17], [0.26, 0.17], [0, -0.17], [0, 0.17], [-0.26, -0.17], [-0.26, 0.17]],
      };
      for (const { s, list } of groups.values()) {
        const lay = LAY[Math.min(6, list.length)];
        const sc = list.length === 1 ? 1 : list.length === 2 ? 0.82 : list.length <= 4 ? 0.7 : 0.6;
        const fx = Math.cos(s.h), fy = Math.sin(s.h);
        list.forEach((p, k) => {
          const tk = this.tokens.get(p.id);
          if (!tk) return;
          const [f, sd] = lay[k] || [0, 0];
          tk.target.set(s.x + fx * f - fy * sd, s.pit ? 0.03 : TOP, s.y + fy * f + fx * sd);
          tk.targetRot = -s.h;
          tk.ts = sc;
          if (instant) { tk.pos.copy(tk.target); tk.rot = tk.targetRot; tk.s = sc; }
        });
      }
    }
    setCurrent(pid) {
      this.current = pid;
      if (this.follow) this.followPid = pid;
    }
    warp(pid, on) { const tk = this.tokens.get(pid); if (tk) tk.targetScale = on ? 0.02 : 1; }
    pop(p, text, kind) {
      const tk = this.tokens.get(p.id);
      if (!tk) return;
      const label = kind === 'hp' || kind === 'heal' ? `${text} ${AR.lang === 'en' ? 'HP' : 'ХП'}` : text;
      const color = { star: '#ffc23b', unstar: '#6ff0ff', hp: '#ff5d5d', heal: '#7bf07a' }[kind] || '#fff';
      const sp = textSprite(label, { color, scale: 0.3 });
      sp.position.copy(tk.pos).add(new T.Vector3(0, 1.05, 0));
      this.world.add(sp);
      this.fx.push({ sp, t: 0, y0: sp.position.y });
    }
    highlight({ cells = [], players = [], hover = false } = {}) {
      this.clearHighlight(hover);
      const g = this.keep(new T.RingGeometry(0.38, 0.47, 32).rotateX(-Math.PI / 2));
      for (const i of cells) {
        const c = this.track.cells[i];
        if (!c) continue;
        const ring = new T.Mesh(g, new T.MeshBasicMaterial({ color: hover ? '#ffffff' : '#ffb82e', transparent: true, opacity: 0.95, depthWrite: false }));
        ring.position.set(c.x, TOP + 0.012, c.y);
        ring.userData.hover = hover;
        this.hl.add(ring);
        if (!hover) this.hlCells.add(i);
      }
      for (const pid of players) {
        if (!hover) this.hlPlayers.add(pid);
        const tk = this.tokens.get(pid);
        if (tk) tk.hl = hover ? 'hover' : 'pick';
      }
    }
    clearHighlight(onlyHover) {
      for (const r of [...this.hl.children]) if (!onlyHover || r.userData.hover) { this.hl.remove(r); r.material.dispose(); }
      for (const [pid, tk] of this.tokens) {
        if (!onlyHover) tk.hl = null;
        else if (tk.hl === 'hover') tk.hl = this.hlPlayers.has(pid) ? 'pick' : null;
      }
      if (!onlyHover) { this.hlCells.clear(); this.hlPlayers.clear(); }
    }
    centerOn(p) { this.followPid = p.id; }

    /* ---------- per-frame ---------- */
    frame() {
      const dt = Math.min(0.05, this.clock.getDelta());
      const el = this.renderer.domElement;
      if (!this.track || !el.isConnected || el.offsetParent === null || document.hidden) return;
      const tnow = performance.now() / 1000;
      const k = 1 - Math.exp(-dt * 13);
      for (const [pid, tk] of this.tokens) {
        const d = tk.pos.distanceTo(tk.target);
        tk.pos.lerp(tk.target, k);
        let dr = tk.targetRot - tk.rot;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        tk.rot += dr * k;
        tk.s += (tk.ts - tk.s) * k;
        tk.scale += (tk.targetScale - tk.scale) * (1 - Math.exp(-dt * 16));
        tk.group.position.set(tk.pos.x, tk.pos.y + Math.min(0.14, d * 0.35), tk.pos.z);
        tk.veh.rotation.y = tk.rot;
        tk.group.scale.setScalar(tk.s * tk.scale);
        const cur = pid === this.current;
        tk.badge.position.y = 0.82 + (cur ? Math.sin(tnow * 3) * 0.05 : 0);
        tk.badge.scale.setScalar(cur ? 0.42 : 0.32);
        const want = tk.hl === 'pick' ? 0.85 + Math.sin(tnow * 6) * 0.15 : tk.hl === 'hover' ? 1 : cur ? 0.55 + Math.sin(tnow * 4) * 0.25 : 0;
        tk.ring.material.opacity = want;
        tk.ring.material.color.set(tk.hl ? (tk.hl === 'hover' ? '#ffffff' : '#ffb82e') : tk.color);
      }
      for (const r of this.hl.children) r.material.opacity = r.userData.hover ? 1 : 0.6 + Math.sin(tnow * 6) * 0.35;
      for (const p of this.anim) {
        if (p.userData.spin) p.userData.spin[0].rotation.z += dt * 1.6;
        if (p.userData.bob) p.position.y = TOP + Math.sin(tnow * 3) * 0.03;
        if (p.userData.blink) { const on = Math.floor(tnow * 3) % 2; p.userData.blink[0].material.emissiveIntensity = on ? 2 : 0.2; p.userData.blink[1].material.emissiveIntensity = on ? 0.2 : 2; }
      }
      this.fx = this.fx.filter(f => {
        f.t += dt;
        f.sp.position.y = f.y0 + f.t * 0.5;
        f.sp.material.opacity = Math.max(0, 1 - Math.max(0, f.t - 0.8) / 0.6);
        if (f.t > 1.4) { this.world.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); return false; }
        return true;
      });
      // camera
      if (this.opts.preview) this.want.yaw += dt * 0.06;
      if (this.follow && !this.userMoved && this.followPid !== undefined && this.tokens.has(this.followPid)) {
        const tk = this.tokens.get(this.followPid);
        this.want.base.set(tk.pos.x, 0, tk.pos.z);
      }
      const kc = 1 - Math.exp(-dt * 6);
      this.cam.base.lerp(this.want.base, kc);
      this.cam.half += (this.want.half - this.cam.half) * kc;
      this.cam.yaw += (this.want.yaw - this.cam.yaw) * kc;
      this.placeCamera(this.cam);
      this.renderer.render(this.scene, this.camera);
    }
  }

  AR.Board2D = AR.Board;
  AR.Board = Board3D;
  AR.Board3D = Board3D;
})();
