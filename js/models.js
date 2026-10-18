/* Low-poly 3D models built from primitives: each racer's vehicle (as on the racer art) with an animal head,
   plus track props. 1 unit = one tile; vehicles face +X and sit on y = 0. */
(function () {
  if (!window.THREE) return;
  const T = THREE;
  const matCache = new Map();
  function mat(color, opt = {}) {
    const key = color + JSON.stringify(opt);
    if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.05, flatShading: true }, opt)));
    return matCache.get(key);
  }
  const geoCache = new Map();
  const geo = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

  function mesh(g, m, x = 0, y = 0, z = 0, parent) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  const box = (w, h, d, color, x, y, z, parent, opt) => mesh(geo(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)), mat(color, opt), x, y, z, parent);
  const sphere = (r, color, x, y, z, parent, opt) => mesh(geo(`s${r}`, () => new T.SphereGeometry(r, 12, 9)), mat(color, opt), x, y, z, parent);
  function cyl(rt, rb, h, color, x, y, z, parent, seg = 12, opt) {
    return mesh(geo(`c${rt},${rb},${h},${seg}`, () => new T.CylinderGeometry(rt, rb, h, seg)), mat(color, opt), x, y, z, parent);
  }
  function cone(r, h, color, x, y, z, parent, seg = 10) { return cyl(0, r, h, color, x, y, z, parent, seg); }
  function wheel(r, w, x, z, parent, color = '#1c1d21') {
    const g = new T.Group();
    const tire = mesh(geo(`w${r},${w}`, () => new T.CylinderGeometry(r, r, w, 14).rotateX(Math.PI / 2)), mat(color), 0, 0, 0, g);
    tire.castShadow = true;
    mesh(geo(`h${r},${w}`, () => new T.CylinderGeometry(r * 0.48, r * 0.48, w + 0.006, 10).rotateX(Math.PI / 2)), mat('#c9ccd2', { metalness: 0.5, roughness: 0.35 }), 0, 0, 0, g);
    g.position.set(x, r, z);
    parent.add(g);
    return g;
  }

  /* ---------- animal heads (about 0.13 across) ---------- */
  function head(kind) {
    const g = new T.Group();
    const eye = (x, z, parent = g) => sphere(0.014, '#111', x, 0.015, z, parent);
    switch (kind) {
      case 'hare': {
        sphere(0.066, '#e9e6e1', 0, 0, 0, g);
        sphere(0.028, '#f6f3ee', 0.05, -0.018, 0, g);
        box(0.02, 0.022, 0.1, '#111', 0.058, 0.014, 0, g); // sunglasses
        for (const z of [-0.026, 0.026]) {
          const ear = new T.Group();
          box(0.03, 0.15, 0.022, '#e9e6e1', 0, 0.075, 0, ear);
          box(0.008, 0.11, 0.014, '#f2a7b9', 0.013, 0.07, 0, ear);
          ear.position.set(-0.02, 0.045, z);
          ear.rotation.set(z * 4, 0, 0.25);
          g.add(ear);
        }
        break;
      }
      case 'cheetah': {
        sphere(0.064, '#f1b23a', 0, 0, 0, g);
        sphere(0.03, '#fbe3a8', 0.048, -0.02, 0, g);
        for (const [x, y, z] of [[0.01, 0.05, 0.03], [-0.03, 0.045, -0.02], [0.02, 0.03, -0.05], [-0.04, 0.0, 0.05]]) sphere(0.011, '#4a2b12', x, y, z, g);
        const helmet = mesh(geo('helmet', () => new T.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#d6322b'), 0, 0.005, 0, g);
        helmet.rotation.z = 0.35;
        eye(0.058, -0.022); eye(0.058, 0.022);
        break;
      }
      case 'turtle': {
        sphere(0.06, '#82b85b', 0, 0, 0, g);
        sphere(0.03, '#9fd07a', 0.045, -0.015, 0, g);
        const helmet = mesh(geo('helmet', () => new T.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#4f6332'), 0, 0.01, 0, g);
        helmet.rotation.z = 0.2;
        eye(0.055, -0.022); eye(0.055, 0.022);
        break;
      }
      case 'rhino': {
        const s = sphere(0.068, '#8a8f95', 0, 0, 0, g);
        s.scale.set(1.25, 0.95, 0.95);
        cone(0.022, 0.07, '#e9e1d2', 0.085, 0.03, 0, g).rotation.z = -1.1;
        cone(0.014, 0.04, '#e9e1d2', 0.055, 0.055, 0, g).rotation.z = -0.9;
        for (const z of [-0.045, 0.045]) cone(0.018, 0.04, '#7a7f85', -0.025, 0.065, z, g);
        eye(0.05, -0.04); eye(0.05, 0.04);
        break;
      }
      case 'vulture': {
        sphere(0.05, '#e7b39e', 0, 0, 0, g);
        cone(0.02, 0.07, '#e2c47a', 0.06, -0.01, 0, g).rotation.z = -1.7;
        const ruff = mesh(geo('ruff', () => new T.TorusGeometry(0.05, 0.022, 6, 12).rotateX(Math.PI / 2)), mat('#6b4a2e'), 0, -0.055, 0, g);
        ruff.castShadow = true;
        eye(0.035, -0.03); eye(0.035, 0.03);
        break;
      }
      case 'raccoon': {
        sphere(0.064, '#9a9da3', 0, 0, 0, g);
        sphere(0.028, '#e8e6e2', 0.05, -0.018, 0, g);
        box(0.03, 0.03, 0.13, '#25262b', 0.04, 0.012, 0, g); // mask
        for (const z of [-0.04, 0.04]) cone(0.022, 0.04, '#7c7f86', -0.01, 0.066, z, g);
        const cap = mesh(geo('cap', () => new T.SphereGeometry(0.068, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4)), mat('#4f6b3a'), -0.005, 0.016, 0, g);
        cap.rotation.z = 0.15;
        break;
      }
      case 'fox': {
        sphere(0.062, '#e5732c', 0, 0, 0, g);
        cone(0.03, 0.07, '#f4ece2', 0.06, -0.012, 0, g).rotation.z = -1.57;
        for (const z of [-0.035, 0.035]) cone(0.024, 0.06, '#e5732c', -0.01, 0.075, z, g);
        eye(0.045, -0.026); eye(0.045, 0.026);
        sphere(0.009, '#111', 0.095, -0.012, 0, g);
        break;
      }
      case 'eagle': {
        sphere(0.062, '#7a5132', 0, 0, 0, g);
        sphere(0.045, '#f0ece4', 0.01, 0.025, 0, g).scale.set(1, 0.8, 1.2);
        cone(0.022, 0.06, '#f1c232', 0.065, -0.005, 0, g).rotation.z = -1.75;
        for (const z of [-0.024, 0.024]) cyl(0.017, 0.017, 0.02, '#d9b45a', 0.05, 0.025, z, g, 10).rotation.z = Math.PI / 2;
        box(0.02, 0.012, 0.12, '#3a2a1c', 0.035, 0.026, 0, g);
        break;
      }
      default:
        sphere(0.06, '#bbb', 0, 0, 0, g);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /* ---------- vehicles ---------- */
  function vehicle(racer) {
    const g = new T.Group();
    const add = h => { g.add(h); return h; };
    switch (racer) {
      case 'hare': { // blue convertible #77
        box(0.6, 0.1, 0.3, '#2f62b5', 0, 0.11, 0, g);
        box(0.2, 0.05, 0.28, '#2f62b5', 0.19, 0.18, 0, g);
        box(0.14, 0.05, 0.28, '#2f62b5', -0.22, 0.18, 0, g);
        box(0.6, 0.012, 0.06, '#f1f3f5', 0, 0.165, 0, g);
        const ws = box(0.012, 0.07, 0.26, '#bfe3ff', 0.08, 0.215, 0, g, { transparent: true, opacity: 0.7 });
        ws.rotation.z = 0.5;
        box(0.12, 0.05, 0.1, '#2b2b30', -0.06, 0.18, -0.06, g);
        box(0.12, 0.05, 0.1, '#2b2b30', -0.06, 0.18, 0.06, g);
        for (const [x, z] of [[0.19, -0.15], [0.19, 0.15], [-0.19, -0.15], [-0.19, 0.15]]) wheel(0.075, 0.06, x, z, g);
        const h = add(head('hare')); h.position.set(-0.05, 0.3, -0.06);
        break;
      }
      case 'cheetah': { // red-yellow formula kart
        box(0.62, 0.06, 0.1, '#d8322a', 0.02, 0.1, 0, g);
        box(0.22, 0.07, 0.22, '#f1c02f', -0.05, 0.11, 0, g);
        box(0.08, 0.02, 0.36, '#f1c02f', 0.3, 0.07, 0, g); // front wing
        box(0.03, 0.12, 0.03, '#222', -0.27, 0.16, 0, g);
        box(0.08, 0.02, 0.32, '#d8322a', -0.28, 0.23, 0, g); // rear wing
        for (const [x, z, r] of [[0.21, -0.17, 0.065], [0.21, 0.17, 0.065], [-0.2, -0.17, 0.085], [-0.2, 0.17, 0.085]]) wheel(r, 0.07, x, z, g);
        const h = add(head('cheetah')); h.position.set(-0.04, 0.24, 0);
        break;
      }
      case 'turtle': { // camo tank
        box(0.56, 0.12, 0.3, '#5f7a3c', 0, 0.13, 0, g);
        box(0.18, 0.02, 0.12, '#46602b', 0.12, 0.2, 0.06, g);
        box(0.12, 0.02, 0.1, '#7d8f4a', -0.1, 0.2, -0.07, g);
        for (const z of [-0.17, 0.17]) {
          box(0.62, 0.11, 0.07, '#2e3127', 0, 0.065, z, g);
          for (const x of [-0.21, -0.07, 0.07, 0.21]) cyl(0.045, 0.045, 0.075, '#4b4f42', x, 0.06, z, g, 10).rotation.x = Math.PI / 2;
        }
        cyl(0.11, 0.12, 0.08, '#56703a', -0.02, 0.23, 0, g, 12);
        cyl(0.022, 0.022, 0.3, '#3f5228', 0.18, 0.24, 0, g, 8).rotation.z = Math.PI / 2;
        const h = add(head('turtle')); h.position.set(-0.06, 0.33, 0);
        break;
      }
      case 'rhino': { // black off-road jeep
        box(0.58, 0.14, 0.32, '#202226', 0, 0.17, 0, g);
        box(0.2, 0.06, 0.3, '#202226', 0.19, 0.27, 0, g);
        box(0.04, 0.05, 0.36, '#55595f', 0.31, 0.13, 0, g, { metalness: 0.4 });
        for (const z of [-0.14, 0.14]) {
          cyl(0.01, 0.01, 0.18, '#8a8f95', -0.12, 0.33, z, g, 6);
          cyl(0.01, 0.01, 0.18, '#8a8f95', 0.04, 0.33, z, g, 6);
        }
        box(0.18, 0.012, 0.3, '#8a8f95', -0.04, 0.42, 0, g);
        cyl(0.07, 0.07, 0.05, '#18191c', -0.31, 0.2, 0, g, 12).rotation.z = Math.PI / 2;
        for (const [x, z] of [[0.19, -0.17], [0.19, 0.17], [-0.19, -0.17], [-0.19, 0.17]]) wheel(0.095, 0.07, x, z, g);
        const h = add(head('rhino')); h.position.set(-0.05, 0.34, -0.06);
        break;
      }
      case 'vulture': { // rusty buggy with an open cage
        box(0.56, 0.05, 0.22, '#8a5a2c', 0, 0.12, 0, g);
        box(0.16, 0.1, 0.18, '#3b3631', -0.2, 0.19, 0, g);
        for (const z of [-0.06, 0.06]) cyl(0.015, 0.015, 0.14, '#9aa0a6', -0.27, 0.27, z, g, 6);
        for (const [x, z] of [[0.1, -0.11], [0.1, 0.11], [-0.1, -0.11], [-0.1, 0.11]]) cyl(0.012, 0.012, 0.24, '#7a4b25', x, 0.26, z, g, 6);
        box(0.24, 0.012, 0.24, '#7a4b25', 0, 0.38, 0, g);
        box(0.12, 0.05, 0.2, '#c8a46a', 0.22, 0.16, 0, g);
        for (const [x, z, r] of [[0.21, -0.14, 0.065], [0.21, 0.14, 0.065], [-0.18, -0.15, 0.1], [-0.18, 0.15, 0.1]]) wheel(r, 0.07, x, z, g);
        const h = add(head('vulture')); h.position.set(-0.02, 0.3, 0);
        break;
      }
      case 'raccoon': { // scooter
        const body = mesh(geo('scoot', () => new T.CapsuleGeometry(0.07, 0.24, 4, 10).rotateZ(Math.PI / 2)), mat('#d9652c'), -0.03, 0.14, 0, g);
        body.scale.set(1, 0.9, 0.85);
        box(0.06, 0.18, 0.1, '#2f6fa8', 0.16, 0.18, 0, g);
        cyl(0.01, 0.01, 0.2, '#c9ccd2', 0.18, 0.31, 0, g, 6).rotation.x = Math.PI / 2;
        box(0.16, 0.03, 0.11, '#3b2a22', -0.07, 0.22, 0, g);
        for (const x of [0.2, -0.2]) wheel(0.06, 0.05, x, 0, g);
        const torso = mesh(geo('torso', () => new T.CapsuleGeometry(0.05, 0.08, 4, 8)), mat('#8e9197'), -0.06, 0.3, 0, g);
        torso.rotation.z = -0.2;
        const h = add(head('raccoon')); h.position.set(-0.03, 0.43, 0);
        break;
      }
      case 'fox': { // motorcycle with a sidecar
        box(0.42, 0.08, 0.08, '#2e4a33', 0, 0.15, -0.06, g);
        box(0.14, 0.06, 0.1, '#3d6043', 0.05, 0.21, -0.06, g);
        box(0.12, 0.03, 0.08, '#2b201a', -0.08, 0.21, -0.06, g);
        cyl(0.01, 0.01, 0.18, '#c9ccd2', 0.15, 0.27, -0.06, g, 6).rotation.x = Math.PI / 2;
        for (const x of [0.19, -0.18]) wheel(0.07, 0.05, x, -0.06, g);
        const tub = mesh(geo('tub', () => new T.CapsuleGeometry(0.065, 0.16, 4, 10).rotateZ(Math.PI / 2)), mat('#3d6043'), 0.02, 0.14, 0.13, g);
        tub.scale.set(1, 0.75, 0.85);
        wheel(0.055, 0.045, 0.0, 0.2, g);
        box(0.08, 0.06, 0.08, '#a5652e', 0.02, 0.2, 0.13, g); // luggage
        const torso = mesh(geo('torso', () => new T.CapsuleGeometry(0.05, 0.08, 4, 8)), mat('#e5732c'), -0.07, 0.3, -0.06, g);
        torso.rotation.z = -0.25;
        const h = add(head('fox')); h.position.set(-0.03, 0.42, -0.06);
        break;
      }
      case 'eagle': { // classic motorcycle
        box(0.44, 0.08, 0.08, '#3c4a2f', 0, 0.15, 0, g);
        box(0.15, 0.07, 0.11, '#4b5a39', 0.05, 0.21, 0, g);
        box(0.12, 0.08, 0.1, '#9aa0a6', -0.02, 0.1, 0, g, { metalness: 0.5, roughness: 0.3 });
        box(0.12, 0.03, 0.08, '#2b201a', -0.09, 0.22, 0, g);
        cyl(0.01, 0.01, 0.2, '#c9ccd2', 0.16, 0.28, 0, g, 6).rotation.x = Math.PI / 2;
        for (const x of [0.2, -0.19]) wheel(0.075, 0.05, x, 0, g);
        const torso = mesh(geo('torso', () => new T.CapsuleGeometry(0.05, 0.08, 4, 8)), mat('#5d4129'), -0.08, 0.31, 0, g);
        torso.rotation.z = -0.25;
        for (const z of [-0.07, 0.07]) {
          const w = box(0.2, 0.012, 0.09, '#6b4a2e', -0.14, 0.32, z, g);
          w.rotation.set(z * 4, 0, 0.3);
        }
        const h = add(head('eagle')); h.position.set(-0.04, 0.43, 0);
        break;
      }
      default:
        box(0.5, 0.15, 0.28, '#888', 0, 0.15, 0, g);
    }
    return g;
  }

  /* ---------- props ---------- */
  function parkedCar() {
    const g = new T.Group();
    box(0.46, 0.09, 0.24, '#f08a3c', 0, 0.09, 0, g);
    box(0.24, 0.08, 0.22, '#f6b27c', -0.02, 0.17, 0, g);
    box(0.25, 0.06, 0.225, '#9fd3f2', -0.02, 0.165, 0, g, { transparent: true, opacity: 0.55 });
    for (const [x, z] of [[0.15, -0.12], [0.15, 0.12], [-0.15, -0.12], [-0.15, 0.12]]) wheel(0.05, 0.04, x, z, g);
    return g;
  }
  function crate() {
    const g = new T.Group();
    box(0.3, 0.3, 0.3, '#b77a3c', 0, 0.15, 0, g);
    for (const y of [0.04, 0.26]) for (const z of [-0.152, 0.152]) box(0.31, 0.03, 0.01, '#7c4f24', 0, y, z, g);
    for (const y of [0.04, 0.26]) for (const x of [-0.152, 0.152]) box(0.01, 0.03, 0.31, '#7c4f24', x, y, 0, g);
    box(0.31, 0.01, 0.31, '#c98d4c', 0, 0.302, 0, g);
    return g;
  }
  function portal(color) {
    const g = new T.Group();
    const ring = mesh(geo('portal', () => new T.TorusGeometry(0.24, 0.035, 8, 28)), mat(color, { emissive: color, emissiveIntensity: 1.6, roughness: 0.3 }), 0, 0.3, 0, g);
    const disc = mesh(geo('portaldisc', () => new T.CircleGeometry(0.22, 24)), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: T.DoubleSide, depthWrite: false }), 0, 0.3, 0, g);
    disc.castShadow = false;
    box(0.06, 0.06, 0.06, '#202228', 0, 0.03, 0, g);
    g.userData.spin = [ring, disc];
    return g;
  }
  function chevrons(color) {
    const g = new T.Group();
    const shape = new T.Shape();
    shape.moveTo(-0.08, -0.12); shape.lineTo(0.06, 0); shape.lineTo(-0.08, 0.12); shape.lineTo(-0.03, 0.12); shape.lineTo(0.11, 0); shape.lineTo(-0.03, -0.12);
    const gg = geo('chev', () => new T.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }).rotateX(-Math.PI / 2));
    for (const x of [-0.1, 0.06]) mesh(gg, mat(color, { emissive: color, emissiveIntensity: 0.9 }), x, 0.14, 0, g);
    g.userData.bob = true;
    return g;
  }
  function siren() {
    const g = new T.Group();
    cyl(0.012, 0.016, 0.22, '#9aa0a6', 0, 0.11, 0, g, 6);
    box(0.16, 0.05, 0.06, '#202228', 0, 0.24, 0, g);
    const r = box(0.06, 0.05, 0.065, '#ff3b3b', -0.045, 0.26, 0, g, { emissive: '#ff2020', emissiveIntensity: 1.6 });
    const b = box(0.06, 0.05, 0.065, '#3b6bff', 0.045, 0.26, 0, g, { emissive: '#2050ff', emissiveIntensity: 1.6 });
    g.userData.blink = [r, b];
    return g;
  }
  function tree(rand) {
    const g = new T.Group();
    const h = 0.25 + rand() * 0.25;
    cyl(0.035, 0.045, h, '#7a5130', 0, h / 2, 0, g, 6);
    const greens = ['#4f9d4a', '#5bad52', '#3f8a43', '#6dbb5c'];
    const n = rand() < 0.5 ? 2 : 3;
    for (let k = 0; k < n; k++) cone(0.24 - k * 0.05, 0.32, greens[(k + Math.floor(rand() * 4)) % 4], 0, h + 0.1 + k * 0.17, 0, g, 7);
    return g;
  }
  function bush(rand) {
    const g = new T.Group();
    const c = ['#5aa64f', '#6bb85d', '#4c9645'][Math.floor(rand() * 3)];
    for (let k = 0; k < 3; k++) sphere(0.09 + rand() * 0.06, c, (rand() - 0.5) * 0.18, 0.08, (rand() - 0.5) * 0.18, g);
    return g;
  }
  function rock(rand) {
    const g = new T.Group();
    const m = mesh(geo('rock', () => new T.DodecahedronGeometry(0.12, 0)), mat(['#a9a39a', '#938d84', '#b8b2a8'][Math.floor(rand() * 3)]), 0, 0.07, 0, g);
    m.scale.set(1 + rand() * 0.6, 0.6 + rand() * 0.4, 1 + rand() * 0.5);
    m.rotation.y = rand() * 6;
    return g;
  }
  function cone3d() {
    const g = new T.Group();
    box(0.12, 0.015, 0.12, '#ff6a1f', 0, 0.008, 0, g);
    cone(0.05, 0.16, '#ff6a1f', 0, 0.09, 0, g, 10);
    cyl(0.032, 0.04, 0.025, '#ffffff', 0, 0.09, 0, g, 10);
    return g;
  }
  function garage() {
    const g = new T.Group();
    box(0.95, 0.42, 0.62, '#eef1f4', 0, 0.21, 0, g);
    const roofShape = new T.Shape();
    roofShape.moveTo(-0.52, 0); roofShape.lineTo(0, 0.24); roofShape.lineTo(0.52, 0); roofShape.lineTo(-0.52, 0);
    const roof = mesh(geo('roof', () => new T.ExtrudeGeometry(roofShape, { depth: 0.7, bevelEnabled: false }).translate(0, 0, -0.35)), mat('#4f8a52'), 0, 0.42, 0, g);
    roof.castShadow = true;
    box(0.5, 0.32, 0.02, '#2a2e36', 0, 0.17, 0.315, g); // door opening, faces +Z (towards the road)
    for (let k = 0; k < 4; k++) box(0.5, 0.012, 0.025, '#596171', 0, 0.06 + k * 0.08, 0.318, g);
    return g;
  }
  function arch(kind) {
    const g = new T.Group();
    const c = kind === 'start' ? '#ffffff' : '#1b1e25';
    for (const z of [-0.55, 0.55]) cyl(0.035, 0.035, 0.75, '#c9ccd2', 0, 0.375, z, g, 8, { metalness: 0.4 });
    box(0.06, 0.2, 1.16, c, 0, 0.78, 0, g);
    return g;
  }
  function signPost(h = 0.5) {
    const g = new T.Group();
    cyl(0.014, 0.018, h, '#8f959c', 0, h / 2, 0, g, 6, { metalness: 0.3 });
    return g;
  }

  AR.Models = { vehicle, head, parkedCar, crate, portal, chevrons, siren, tree, bush, rock, cone: cone3d, garage, arch, signPost, mat, box, cyl };
})();
