// events-art.js, the look of the feasts: eggs, presents, pumpkins, snowmen, a fir tree,
// strings of bulbs, bunting, lanterns, ghosts, bells, a sleigh, fireworks… Plain meshes,
// shared materials, a few canvas textures made once. events-decor.js puts them about.
import * as THREE from 'three';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
export const lam = (c, extra) => once('l' + c + JSON.stringify(extra || {}), () => new THREE.MeshLambertMaterial({ color: c, ...extra }));
export const std = (c, extra) => once('s' + c + JSON.stringify(extra || {}), () => new THREE.MeshStandardMaterial({ color: c, roughness: .35, metalness: .6, ...extra }));
export const glow = (c, i = 1.4) => once('g' + c + i, () => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: i }));
const geo = (k, f) => once('geo' + k, f);
export const mesh = (g, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent?.add(o); return o; };

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// frees what a decor built (the cached materials stay: they're few and shared)
export function dispose(root) {
  root.traverse(o => { if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); });
  root.removeFromParent();
}
const keepGeo = (g) => { g.userData.cached = true; return g; };

// ---------- easter eggs: painted, one golden ----------
const EGG_PAINT = [['#e84a6a', '#ffd86a'], ['#4a9ae8', '#f4f0e6'], ['#6ac86a', '#f6c8e0'], ['#f2a43a', '#7a4ad8'], ['#b04ad8', '#8ae0e8'], ['#f6e04a', '#e8384f']];
const eggTex = (n) => once('eggtex' + n, () => canvasTex(128, 64, (c, w, h) => {
  const [a, b] = EGG_PAINT[n % EGG_PAINT.length];
  c.fillStyle = a; c.fillRect(0, 0, w, h);
  c.fillStyle = b;
  if (n % 3 === 0) for (let y = 8; y < h; y += 18) c.fillRect(0, y, w, 6);
  else if (n % 3 === 1) for (let k = 0; k < 40; k++) { c.beginPath(); c.arc((k * 37) % w, (k * 23) % h, 4, 0, 7); c.fill(); }
  else { c.lineWidth = 5; c.strokeStyle = b; c.beginPath(); for (let x = 0; x <= w; x += 16) c.lineTo(x, h / 2 + (x / 16 % 2 ? 10 : -10)); c.stroke(); }
}));
export function egg(n = 0, gold = false) {
  const g = geo('egg', () => keepGeo(new THREE.SphereGeometry(.1, 14, 10).scale(1, 1.32, 1)));
  const m = gold ? std(0xffc83a, { metalness: .9, roughness: .2, emissive: 0x5a3a00 }) : once('eggm' + n, () => new THREE.MeshLambertMaterial({ map: eggTex(n) }));
  const o = new THREE.Mesh(g, m);
  o.position.y = .13;
  const w = new THREE.Group(); w.add(o);
  return w;
}

// ---------- a wrapped present, a ribbon, a bow ----------
export function present(color = 0xc8282e, ribbon = 0xffd75e, s = 1) {
  const g = new THREE.Group();
  const b = geo('box1', () => keepGeo(new THREE.BoxGeometry(1, 1, 1)));
  const body = mesh(b, lam(color), 0, .15 * s, 0, g); body.scale.set(.34 * s, .3 * s, .3 * s);
  const r1 = mesh(b, lam(ribbon), 0, .15 * s, 0, g); r1.scale.set(.36 * s, .31 * s, .06 * s);
  const r2 = mesh(b, lam(ribbon), 0, .15 * s, 0, g); r2.scale.set(.06 * s, .31 * s, .32 * s);
  const bow = geo('bow', () => keepGeo(new THREE.TorusGeometry(.05, .018, 5, 10)));
  for (const a of [-.6, .6]) { const t = mesh(bow, lam(ribbon), a * .07 * s, .32 * s, 0, g); t.rotation.set(0, Math.PI / 2, a); t.scale.setScalar(s); }
  return g;
}

// ---------- pumpkins: ribbed, a stalk, and when carved, a face that glows ----------
const pumpGeo = () => geo('pump', () => {
  const g = new THREE.SphereGeometry(.3, 20, 12), p = g.attributes.position, v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) { v.fromBufferAttribute(p, n); const a = Math.atan2(v.z, v.x); const k = 1 - Math.pow(Math.abs(Math.sin(a * 5)), 3) * .1; p.setXYZ(n, v.x * k * 1.15, v.y * .8, v.z * k * 1.15); }
  g.computeVertexNormals();
  return keepGeo(g);
});
const faceTex = () => once('face', () => canvasTex(128, 128, (c) => {
  c.fillStyle = '#000'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#ffd23a';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(64 + s * 16, 50); c.lineTo(64 + s * 40, 50); c.lineTo(64 + s * 28, 28); c.fill(); }
  c.beginPath(); c.moveTo(56, 66); c.lineTo(72, 66); c.lineTo(64, 56); c.fill();
  c.beginPath(); c.moveTo(24, 76);
  for (let k = 0; k <= 8; k++) c.lineTo(24 + k * 10, 76 + (k % 2 ? 10 : 0) + Math.sin(k / 8 * Math.PI) * 18);
  for (let k = 8; k >= 0; k--) c.lineTo(24 + k * 10, 96 + Math.sin(k / 8 * Math.PI) * 14 - (k % 2 ? 6 : 0));
  c.fill();
}));
export function pumpkin(s = 1, lit = true) {
  const g = new THREE.Group();
  const body = mesh(pumpGeo(), lam(0xe8741e, { emissive: 0x3a1400, emissiveIntensity: .3 }), 0, .25 * s, 0, g); body.scale.setScalar(s);
  mesh(geo('stalk', () => keepGeo(new THREE.CylinderGeometry(.03, .045, .14, 6))), lam(0x4a6a2a), 0, .5 * s, 0, g).scale.setScalar(s);
  if (lit) {
    const f = mesh(geo('facep', () => keepGeo(new THREE.PlaneGeometry(.46, .46))), once('facem', () => new THREE.MeshBasicMaterial({ map: faceTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: new THREE.Color(2.2, 1.3, .4), toneMapped: false })), 0, .27 * s, .345 * s, g);
    f.scale.setScalar(s);
  }
  return g;
}

// ---------- a snowman: three balls, coal, a carrot, a scarf and a hat ----------
export function snowman(s = 1) {
  const g = new THREE.Group();
  const ball = geo('ball', () => keepGeo(new THREE.SphereGeometry(1, 16, 12)));
  const snow = lam(0xf6f8fc, { emissive: 0x3a4250, emissiveIntensity: .25 });
  for (const [r, y] of [[.5, .45], [.36, 1.15], [.26, 1.68]]) mesh(ball, snow, 0, y, 0, g).scale.setScalar(r);
  const coal = lam(0x1a1a1e);
  for (const x of [-.09, .09]) mesh(ball, coal, x, 1.74, .22, g).scale.setScalar(.03);
  for (const y of [1.05, 1.2, 1.35]) mesh(ball, coal, 0, y, .345, g).scale.setScalar(.035);
  const nose = mesh(geo('carrot', () => keepGeo(new THREE.ConeGeometry(.04, .24, 8))), lam(0xf07a1e), 0, 1.68, .33, g); nose.rotation.x = Math.PI / 2;
  const scarf = mesh(geo('scarf', () => keepGeo(new THREE.TorusGeometry(.27, .06, 6, 16))), lam(0xc8282e), 0, 1.45, 0, g); scarf.rotation.x = Math.PI / 2;
  const tail = mesh(geo('box1', () => keepGeo(new THREE.BoxGeometry(1, 1, 1))), lam(0xc8282e), .15, 1.3, .22, g); tail.scale.set(.1, .3, .04); tail.rotation.z = .2;
  mesh(geo('hatb', () => keepGeo(new THREE.CylinderGeometry(.26, .26, .03, 16))), lam(0x1a1a1e), 0, 1.9, 0, g);
  mesh(geo('hatt', () => keepGeo(new THREE.CylinderGeometry(.16, .17, .3, 16))), lam(0x1a1a1e), 0, 2.05, 0, g);
  for (const s2 of [-1, 1]) { const arm = mesh(geo('stick', () => keepGeo(new THREE.CylinderGeometry(.015, .02, .6, 5))), lam(0x5a3a22), s2 * .5, 1.25, 0, g); arm.rotation.z = s2 * -1; }
  g.scale.setScalar(s);
  return g;
}

// ---------- strings of bulbs: one instanced mesh a colour, a wire under them ----------
// add(a, b, n, sag): a sagging run of n bulbs between two points; finish(): into the parent
export function createBulbs(parent, colors = [0xff3a3a, 0x3aff6a, 0xffd23a, 0x4a8aff]) {
  const pts = colors.map(() => []);
  const wire = [];
  let k = 0;
  const mats = colors.map(c => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 1 }));
  const meshes = [];
  return {
    add(a, b, n, sag = .35) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag;
        pts[k++ % colors.length].push(p);
        if (prev) wire.push(prev, p);
        prev = p;
      }
    },
    // round a path (closed or not), bulbs every `step` metres
    path(list, step = .4, sag = .12) { for (let i = 1; i < list.length; i++) this.add(list[i - 1], list[i], Math.max(1, Math.round(list[i - 1].distanceTo(list[i]) / step)), sag); },
    point(p) { pts[k++ % colors.length].push(p.clone()); },
    finish(size = .06) {
      const g = new THREE.SphereGeometry(size, 6, 4), m4 = new THREE.Matrix4();
      pts.forEach((list, c) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(g, mats[c], list.length);
        list.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
        im.userData.keep = true; im.frustumCulled = false;
        parent.add(im); meshes.push(im);
      });
      if (wire.length) { const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), lam(0x1e2a1e)); l.userData.keep = true; parent.add(l); }
    },
    // twinkling: each colour on its own beat, brighter at night
    update(t, night) { mats.forEach((m, c) => { m.emissiveIntensity = (.35 + night * 1.6) * (.55 + .45 * Math.max(0, Math.sin(t * 2.2 + c * 1.7))); }); },
    get count() { return pts.reduce((a, l) => a + l.length, 0); },
  };
}

// ---------- bunting: little triangular flags along a sagging line, one mesh ----------
export function bunting(a, b, colors, { n = null, sag = .4, size = .32 } = {}) {
  n = n ?? Math.max(4, Math.round(a.distanceTo(b) / .5));
  const pos = [], col = [], c = new THREE.Color();
  const at = (t) => { const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; return p; };
  for (let i = 0; i < n; i++) {
    const p0 = at(i / n), p1 = at((i + .8) / n), mid = p0.clone().lerp(p1, .5); mid.y -= size;
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, mid.x, mid.y, mid.z);
    c.setHex(colors[i % colors.length]);
    for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, once('bunt', () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const grp = new THREE.Group(); grp.add(m);
  grp.userData.keep = true;   // (vertex colours: not for merging)
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array.from({ length: n * 2 }, (_, i) => at(Math.ceil(i / 2) / n))), lam(0x2a2a2a));
  grp.add(line);
  return grp;
}

// ---------- a big fir tree, decked out ----------
export function firTree(h = 7, bulbs = null) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.22, .3, 1, 8), lam(0x5a3a22), 0, .5, 0, g);
  const green = lam(0x1f5a32, { emissive: 0x06140a });
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const r = (1 - i / tiers) * h * .32 + .3, y = .8 + i * (h - 1.4) / tiers;
    mesh(new THREE.ConeGeometry(r, h * .34, 14), green, 0, y + h * .17, 0, g);
  }
  // baubles in the branches, and a star on top
  const colors = [0xd8262e, 0xffd23a, 0x3a7ae8, 0xe8e8f0];
  const bb = new THREE.SphereGeometry(.13, 10, 8);
  for (let i = 0; i < 38; i++) {
    const y = 1 + (i / 38) * (h - 2), r = (1 - (y - .8) / h) * h * .3 + .15, a = i * 2.4;
    mesh(bb, std(colors[i % 4], { metalness: .7, roughness: .25, emissive: colors[i % 4], emissiveIntensity: .12 }), Math.cos(a) * r, y, Math.sin(a) * r, g);
  }
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? .2 : .48, a = i / 10 * Math.PI * 2 + Math.PI / 2; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const st = mesh(new THREE.ExtrudeGeometry(star, { depth: .1, bevelEnabled: false }), glow(0xffd23a, 1.6), 0, h + .15, -.05, g);
  st.userData.keep = true; g.userData.star = st;
  // a spiral of bulbs round it
  if (bulbs) {
    const turns = 5, N = 90;
    for (let i = 0; i < N; i++) { const t = i / N, y = 1 + t * (h - 1.6), r = (1 - (y - .8) / h) * h * .31 + .22, a = t * turns * Math.PI * 2; bulbs.point(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).add(g.position)); }
  }
  return g;
}

// ---------- a heart, puffy and pink ----------
export function heart(s = 1, color = 0xff4a7a) {
  const g = geo('heart', () => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -.3); sh.bezierCurveTo(-.05, -.22, -.34, -.08, -.3, .1); sh.bezierCurveTo(-.26, .28, -.04, .3, 0, .14);
    sh.bezierCurveTo(.04, .3, .26, .28, .3, .1); sh.bezierCurveTo(.34, -.08, .05, -.22, 0, -.3);
    const e = new THREE.ExtrudeGeometry(sh, { depth: .08, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 3, curveSegments: 10 });
    e.center();
    return keepGeo(e);
  });
  const o = new THREE.Mesh(g, lam(color, { emissive: color, emissiveIntensity: .45 }));
  o.scale.setScalar(s);
  const w = new THREE.Group(); w.add(o);
  return w;
}

// ---------- a ghost: a sheet with a wavy hem, two eyes ----------
export function ghost(s = 1) {
  const g = new THREE.Group();
  const shape = geo('ghost', () => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(Math.sin(t * Math.PI * .5) * .32 + (t > .9 ? (1 - t) * .5 : 0), .9 - t * .9)); }
    pts.reverse();
    const lg = new THREE.LatheGeometry(pts, 18), p = lg.attributes.position;
    for (let n = 0; n < p.count; n++) { const y = p.getY(n); if (y < .12) { const a = Math.atan2(p.getZ(n), p.getX(n)); p.setY(n, y + Math.sin(a * 6) * .05); } }
    lg.computeVertexNormals();
    return keepGeo(lg);
  });
  mesh(shape, once('ghostm', () => new THREE.MeshLambertMaterial({ color: 0xeef4ff, emissive: 0x8aa0c8, emissiveIntensity: .8, transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false })), 0, 0, 0, g);
  const eye = geo('geye', () => keepGeo(new THREE.SphereGeometry(.045, 8, 6)));
  for (const x of [-.1, .1]) mesh(eye, lam(0x10101a), x, .62, .27, g).scale.set(1, 1.5, .5);
  mesh(eye, lam(0x10101a), 0, .48, .29, g).scale.set(1.2, 1.4, .5);
  g.scale.setScalar(s);
  return g;
}

// ---------- a bat, wings that flap (userData.wings) ----------
export function bat(s = 1) {
  const g = new THREE.Group();
  mesh(geo('batb', () => keepGeo(new THREE.SphereGeometry(.1, 8, 6))), lam(0x1a1418), 0, 0, 0, g).scale.set(1, .9, 1.3);
  const wg = geo('batw', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.42, .1); sh.lineTo(.34, -.02); sh.lineTo(.24, .02); sh.lineTo(.16, -.05); sh.lineTo(0, -.06); return keepGeo(new THREE.ShapeGeometry(sh)); });
  const wings = [-1, 1].map(sd => { const p = new THREE.Group(); const w = mesh(wg, lam(0x2a1a22, { side: THREE.DoubleSide }), 0, 0, 0, p); w.scale.x = sd; w.rotation.x = -Math.PI / 2; g.add(p); return p; });
  g.userData.wings = wings;
  g.scale.setScalar(s);
  return g;
}

// ---------- a bell back from rome: bronze, a red bow, two little wings ----------
export function bell(s = 1) {
  const g = new THREE.Group();
  const prof = [[0, .5], [.08, .5], [.14, .44], [.18, .3], [.22, .12], [.3, .02], [.32, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(geo('bell', () => keepGeo(new THREE.LatheGeometry(prof, 18))), std(0xd8a030, { metalness: .85, roughness: .25, emissive: 0x3a2400, side: THREE.DoubleSide }), 0, -.25, 0, g);
  mesh(geo('clap', () => keepGeo(new THREE.SphereGeometry(.06, 8, 6))), std(0xa87820), 0, -.26, 0, g);
  const bow = geo('bbow', () => keepGeo(new THREE.TorusGeometry(.09, .03, 5, 12)));
  for (const a of [-1, 1]) { const b = mesh(bow, lam(0xd8262e), a * .1, .3, 0, g); b.rotation.set(0, Math.PI / 2, a * .5); }
  const wg = geo('bwing', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(.3, .35, .55, .2); sh.quadraticCurveTo(.35, .1, .5, 0); sh.quadraticCurveTo(.25, -.05, 0, 0); return keepGeo(new THREE.ShapeGeometry(sh)); });
  g.userData.wings = [-1, 1].map(sd => { const p = new THREE.Group(); p.position.set(sd * .2, .1, 0); const w = mesh(wg, lam(0xf6f2ea, { side: THREE.DoubleSide, emissive: 0x6a6a6a }), 0, 0, 0, p); w.scale.x = sd; g.add(p); return p; });
  g.scale.setScalar(s);
  return g;
}

// ---------- a white rabbit ----------
export function bunny(s = 1) {
  const g = new THREE.Group();
  const fur = lam(0xf4f0ea, { emissive: 0x2a2a2a });
  const ball = geo('ball', () => keepGeo(new THREE.SphereGeometry(1, 16, 12)));
  mesh(ball, fur, 0, .22, 0, g).scale.set(.2, .2, .26);
  mesh(ball, fur, 0, .42, .2, g).scale.setScalar(.13);
  mesh(ball, fur, 0, .25, -.26, g).scale.setScalar(.07);
  for (const x of [-.05, .05]) { const e = mesh(ball, fur, x, .6, .16, g); e.scale.set(.035, .14, .02); e.rotation.x = -.3; mesh(ball, lam(0xf0a0b0), x, .6, .175, g).scale.set(.02, .1, .01); }
  for (const x of [-.05, .05]) mesh(ball, lam(0x1a1a1a), x, .45, .31, g).scale.setScalar(.018);
  mesh(ball, lam(0xf07a9a), 0, .41, .33, g).scale.setScalar(.018);
  g.scale.setScalar(s);
  return g;
}

// ---------- santa's sleigh and four reindeer (the first with a red nose) ----------
export function sleigh() {
  const g = new THREE.Group();
  const red = lam(0xc8202a), gold = std(0xe0b030), brown = lam(0x7a5030), white = lam(0xf4f0ea);
  const box = geo('box1', () => keepGeo(new THREE.BoxGeometry(1, 1, 1)));
  const ball = geo('ball', () => keepGeo(new THREE.SphereGeometry(1, 16, 12)));
  mesh(box, red, 0, .55, 0, g).scale.set(1.1, .6, 2);
  mesh(box, red, 0, .95, -.8, g).scale.set(1.1, .6, .4);
  for (const x of [-.5, .5]) { const r = mesh(new THREE.TorusGeometry(.9, .04, 5, 16, Math.PI * .7), gold, x, .3, .2, g); r.rotation.set(0, Math.PI / 2, Math.PI * 1.15); }
  // santa
  mesh(new THREE.CapsuleGeometry(.32, .4, 4, 10), red, 0, 1.2, -.2, g);
  mesh(ball, lam(0xf0c8a0), 0, 1.75, -.15, g).scale.setScalar(.2);
  mesh(ball, white, 0, 1.62, -.02, g).scale.set(.2, .2, .12);
  mesh(new THREE.ConeGeometry(.2, .4, 10), red, 0, 2, -.18, g).rotation.x = -.3;
  mesh(ball, white, 0, 2.18, -.26, g).scale.setScalar(.06);
  mesh(ball, lam(0x6a4a2a), 0, 1, -.95, g).scale.set(.45, .5, .35);   // the sack
  // the reindeer, two by two, in front
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Group(); r.position.set((i % 2 ? .45 : -.45), .9, 2.2 + Math.floor(i / 2) * 1.6); g.add(r);
    mesh(new THREE.CapsuleGeometry(.2, .6, 4, 8), brown, 0, 0, 0, r).rotation.x = Math.PI / 2;
    mesh(ball, brown, 0, .35, .45, r).scale.set(.13, .13, .18);
    for (const x of [-.1, .1]) { const an = mesh(new THREE.CylinderGeometry(.015, .02, .3, 4), lam(0x4a3020), x, .55, .4, r); an.rotation.z = x * 3; }
    for (const [x, z] of [[-.1, -.25], [.1, -.25], [-.1, .25], [.1, .25]]) mesh(new THREE.CylinderGeometry(.03, .03, .45, 4), brown, x, -.3, z, r);
    if (i === 2) mesh(ball, glow(0xff2020, 3), 0, .35, .64, r).scale.setScalar(.05);
    r.userData.legs = r.children.slice(-4);
  }
  // the harness
  const h = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.45, .9, 1), new THREE.Vector3(-.45, .9, 3.8), new THREE.Vector3(.45, .9, 1), new THREE.Vector3(.45, .9, 3.8)]), lam(0xe0b030));
  g.add(h);
  return g;
}

// ---------- a paper fish, for backs on the first of april ----------
export function paperFish(color = 0x6ab0e8) {
  const g = geo('fish', () => {
    const sh = new THREE.Shape(); sh.moveTo(-.16, 0); sh.quadraticCurveTo(0, .1, .12, 0); sh.lineTo(.2, .07); sh.lineTo(.2, -.07); sh.lineTo(.12, 0); sh.quadraticCurveTo(0, -.1, -.16, 0);
    return keepGeo(new THREE.ShapeGeometry(sh));
  });
  const w = new THREE.Group();
  mesh(g, lam(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: .2 }), 0, 0, 0, w);
  mesh(geo('feye', () => keepGeo(new THREE.CircleGeometry(.015, 8))), lam(0x111111, { side: THREE.DoubleSide }), -.1, .015, .002, w);
  return w;
}

// ---------- japanese paper lanterns ----------
export function lantern(color = 0xe8382e, s = 1) {
  const g = new THREE.Group();
  mesh(geo('lant', () => keepGeo(new THREE.SphereGeometry(.2, 12, 10).scale(1, 1.3, 1))), once('lantm' + color, () => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: .5 })), 0, 0, 0, g);
  for (const y of [-.25, .25]) mesh(geo('lcap', () => keepGeo(new THREE.CylinderGeometry(.1, .1, .05, 10))), lam(0x1a1a1a), 0, y, 0, g);
  g.scale.setScalar(s);
  return g;
}

// ---------- flags and cockades ----------
export const tricolore = () => once('tric', () => canvasTex(96, 64, (c) => { c.fillStyle = '#1d3a8a'; c.fillRect(0, 0, 32, 64); c.fillStyle = '#f4f4f2'; c.fillRect(32, 0, 32, 64); c.fillStyle = '#d8262e'; c.fillRect(64, 0, 32, 64); }));
export function flag(w = .9, h = .6) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.02, .02, h + 1.2, 5), lam(0xd8d8d8), 0, (h + 1.2) / 2, 0, g);
  const f = mesh(new THREE.PlaneGeometry(w, h, 6, 1), once('flagm', () => new THREE.MeshLambertMaterial({ map: tricolore(), side: THREE.DoubleSide })), w / 2, h + .9, 0, g);
  f.userData.keep = true; g.userData.cloth = f;
  return g;
}
export function cocarde(s = 1) {
  const g = new THREE.Group();
  const ring = (r, c, z) => mesh(new THREE.CircleGeometry(r, 20), lam(c, { side: THREE.DoubleSide, emissive: c, emissiveIntensity: .25 }), 0, 0, z, g);
  ring(.14, 0xd8262e, 0); ring(.1, 0xf4f4f2, .003); ring(.06, 0x1d3a8a, .006);
  for (const a of [-.35, .35]) { const t = mesh(new THREE.PlaneGeometry(.05, .16), lam(a < 0 ? 0x1d3a8a : 0xd8262e, { side: THREE.DoubleSide }), a * .12, -.14, -.002, g); t.rotation.z = a; }
  g.scale.setScalar(s);
  return g;
}

// ---------- sweets and food ----------
export function candy(color = 0xe8384f) {
  const g = new THREE.Group();
  mesh(geo('candy', () => keepGeo(new THREE.SphereGeometry(.07, 10, 8).scale(1.3, 1, 1))), lam(color, { emissive: color, emissiveIntensity: .3 }), 0, 0, 0, g);
  const tw = geo('twist', () => keepGeo(new THREE.ConeGeometry(.05, .08, 6)));
  for (const s of [-1, 1]) { const t = mesh(tw, lam(0xf4f0e6), s * .12, 0, 0, g); t.rotation.z = s * Math.PI / 2; }
  return g;
}
export function galette(crown = true) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.3, .32, .06, 24), lam(0xd8a04a, { emissive: 0x3a2000, emissiveIntensity: .3 }), 0, .03, 0, g);
  for (let i = 0; i < 6; i++) { const l = mesh(new THREE.BoxGeometry(.5, .004, .01), lam(0xa86a2a), 0, .062, 0, g); l.rotation.y = i * Math.PI / 6; }
  if (crown) {
    const tex = once('crown', () => canvasTex(128, 32, (c) => { c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(0, 32); for (let x = 0; x <= 128; x += 16) { c.lineTo(x, 6); c.lineTo(x + 8, 20); } c.lineTo(128, 32); c.fill(); c.fillStyle = '#d8262e'; for (let x = 8; x < 128; x += 32) { c.beginPath(); c.arc(x, 24, 3, 0, 7); c.fill(); } }));
    const cr = mesh(new THREE.CylinderGeometry(.14, .14, .1, 16, 1, true), once('crownm', () => new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: .5, side: THREE.DoubleSide })), .12, .12, .06, g);
    cr.rotation.z = .3;
  }
  return g;
}
export function crepe() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.16, .16, .01, 20), lam(0xf0c878, { emissive: 0x3a2400, emissiveIntensity: .3 }), 0, 0, 0, g);
  return g;
}

// ---------- a market stall: a counter, a striped awning, a sign ----------
export function stall(label, { stripes = ['#c8282e', '#f4efe6'], w = 2.6, wood = 0x8a5a36 } = {}) {
  const g = new THREE.Group();
  const box = geo('box1', () => keepGeo(new THREE.BoxGeometry(1, 1, 1)));
  mesh(box, lam(wood), 0, .5, 0, g).scale.set(w, 1, .7);
  mesh(box, lam(0xf0e6d0), 0, 1.02, .02, g).scale.set(w + .1, .05, .8);
  for (const x of [-w / 2 + .05, w / 2 - .05]) mesh(box, lam(wood), x, 1.3, -.3, g).scale.set(.08, 2.6, .08);
  const aw = canvasTex(128, 32, (c) => { for (let x = 0; x < 128; x += 16) { c.fillStyle = stripes[(x / 16) % 2]; c.fillRect(x, 0, 16, 32); } });
  const awning = mesh(new THREE.PlaneGeometry(w + .3, 1.1), new THREE.MeshLambertMaterial({ map: aw, side: THREE.DoubleSide }), 0, 2.45, .15, g);
  awning.rotation.x = -1.05;
  if (label) {
    const s = mesh(new THREE.PlaneGeometry(w, .38), new THREE.MeshBasicMaterial({ map: label }), 0, 2.72, -.28, g);
    s.position.z = -.25;
  }
  return g;
}
// a wooden christmas-market chalet
export function chalet(label) {
  const g = stall(label, { stripes: ['#7a4a2a', '#8a5a36'], w: 2.8, wood: 0x7a4a2a });
  const roof = mesh(new THREE.ConeGeometry(2.3, 1, 4), lam(0xf4f6fa, { emissive: 0x2a3040, emissiveIntensity: .3 }), 0, 3.3, 0, g);
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, .6);
  return g;
}

// ---------- musicians' odds and ends ----------
export function noteSprite() {
  const t = once('note', () => canvasTex(64, 64, (c) => { c.fillStyle = '#ffe07a'; c.font = 'bold 52px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', 32, 34); }));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.setScalar(.35);
  return s;
}
// someone playing: a body, a head, a hat, an instrument
export function musician(coat = 0x2a4a78, what = 'accordeon') {
  const g = new THREE.Group();
  const skin = lam(0xe8c0a0), c = lam(coat);
  mesh(new THREE.CapsuleGeometry(.2, .5, 4, 10), c, 0, 1.12, 0, g);
  mesh(new THREE.SphereGeometry(.14, 12, 10), skin, 0, 1.62, 0, g);
  mesh(new THREE.CylinderGeometry(.16, .16, .12, 12), lam(0x1a1a1a), 0, 1.78, 0, g);
  for (const x of [-.09, .09]) mesh(new THREE.CapsuleGeometry(.075, .55, 3, 6), lam(0x2a3448), x, .4, 0, g);
  const inst = new THREE.Group(); inst.position.set(0, 1.15, .25); g.add(inst);
  if (what === 'accordeon') { mesh(new THREE.BoxGeometry(.5, .3, .2), lam(0xc8282e), 0, 0, 0, inst); for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(.04, .31, .21), lam(0x1a1a1a), -.2 + i * .1, 0, 0, inst); }
  else if (what === 'guitare') { mesh(new THREE.SphereGeometry(.18, 12, 8).scale(1, 1, .35), lam(0xc8843a), -.05, -.05, 0, inst); const n = mesh(new THREE.BoxGeometry(.5, .05, .03), lam(0x5a3a22), .3, .1, 0, inst); n.rotation.z = .35; }
  else { const t = mesh(new THREE.CylinderGeometry(.02, .08, .45, 10), std(0xe0b030, { metalness: .9 }), 0, .1, .1, inst); t.rotation.x = Math.PI / 2; inst.position.y = 1.55; }
  g.userData.inst = inst;
  return g;
}
// hats for the moles
export function witchHat() {
  const g = new THREE.Group();
  mesh(geo('whb', () => keepGeo(new THREE.CylinderGeometry(.24, .24, .02, 14))), lam(0x2a1a3a), 0, 0, 0, g);
  const c = mesh(geo('wht', () => keepGeo(new THREE.ConeGeometry(.13, .38, 12))), lam(0x2a1a3a), 0, .19, 0, g); c.rotation.z = .2;
  mesh(geo('whband', () => keepGeo(new THREE.CylinderGeometry(.135, .135, .04, 12))), lam(0xe8741e), 0, .03, 0, g);
  return g;
}
export function santaHat() {
  const g = new THREE.Group();
  mesh(geo('shb', () => keepGeo(new THREE.TorusGeometry(.16, .05, 6, 14))), lam(0xf4f0ea), 0, 0, 0, g).rotation.x = Math.PI / 2;
  const c = mesh(geo('sht', () => keepGeo(new THREE.ConeGeometry(.16, .34, 12))), lam(0xc8202a), 0, .17, 0, g); c.rotation.z = -.35;
  mesh(geo('shp', () => keepGeo(new THREE.SphereGeometry(.05, 8, 6))), lam(0xf4f0ea), .12, .32, 0, g);
  return g;
}
// a bamboo with wishes tied on it (tanabata)
export function bamboo(h = 4) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(.05, .07, h, 8), lam(0x6a9a3a), 0, h / 2, 0, g);
  const leaf = lam(0x5a8a2a, { side: THREE.DoubleSide });
  const paper = [0xe8384f, 0xf6d23a, 0x4a9ae8, 0x6ac86a, 0xf4f0f4, 0xb04ad8];
  for (let i = 0; i < 30; i++) {
    const y = h * .45 + (i / 30) * h * .55, a = i * 2.2, r = .3 + (i % 5) * .12;
    const l = mesh(new THREE.PlaneGeometry(.5, .08), leaf, Math.cos(a) * r, y, Math.sin(a) * r, g); l.rotation.set(.3, -a, -.4);
    if (i % 2) { const t = mesh(new THREE.PlaneGeometry(.07, .22), lam(paper[i % 6], { side: THREE.DoubleSide, emissive: paper[i % 6], emissiveIntensity: .2 }), Math.cos(a) * r, y - .18, Math.sin(a) * r, g); t.rotation.y = -a; }
  }
  return g;
}

// ---------- fireworks: one points cloud for every spark ----------
export function createFireworks(parent, { max = 2400 } = {}) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), base = new Float32Array(max * 3);
  const geoP = new THREE.BufferGeometry();
  geoP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geoP.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = once('fwdot', () => canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }));
  const mat = new THREE.PointsMaterial({ size: .9, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const pts = new THREE.Points(geoP, mat);
  pts.frustumCulled = false; pts.userData.keep = true;
  parent.add(pts);
  let next = 0;
  const shells = [];   // rising: { p, v, t, color, kind }
  const PAL = [[1, .3, .3], [.3, 1, .4], [.4, .6, 1], [1, .9, .3], [1, .4, 1], [1, 1, 1], [1, .6, .2]];
  function spark(p, v, c, l) {
    const i = next; next = (next + 1) % max;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); base.set(c, i * 3); life[i] = l;
  }
  const tmp = new THREE.Vector3();
  return {
    points: pts,
    get busy() { return shells.length > 0; },
    // a shell from `from`, bursting some 25-40 m up; colors: a list of [r,g,b] or null (random)
    launch(from, { colors = null, kind = Math.random() < .3 ? 'ring' : 'ball', h = 26 + Math.random() * 16 } = {}) {
      const c = colors ? colors[Math.floor(Math.random() * colors.length)] : PAL[Math.floor(Math.random() * PAL.length)];
      shells.push({ p: from.clone(), v: new THREE.Vector3((Math.random() - .5) * 4, Math.sqrt(2 * 9.8 * h), (Math.random() - .5) * 4), c, kind, colors });
    },
    update(dt, onBurst) {
      for (let s = shells.length - 1; s >= 0; s--) {
        const sh = shells[s];
        sh.v.y -= 9.8 * dt; sh.p.addScaledVector(sh.v, dt);
        spark(sh.p, tmp.set((Math.random() - .5), -1, (Math.random() - .5)), [1, .8, .5], .5);
        if (sh.v.y <= 2) {
          shells.splice(s, 1);
          const n = sh.kind === 'ring' ? 90 : 150, sp = 11 + Math.random() * 5;
          const axis = new THREE.Vector3(Math.random() - .5, 1, Math.random() - .5).normalize();
          for (let i = 0; i < n; i++) {
            let v;
            if (sh.kind === 'ring') { const a = i / n * Math.PI * 2; v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)).multiplyScalar(sp); }
            else v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(sp * (.6 + Math.random() * .4));
            const c = sh.colors && Math.random() < .5 ? sh.colors[Math.floor(Math.random() * sh.colors.length)] : sh.c;
            spark(sh.p, v, c, 1.6 + Math.random() * .8);
          }
          onBurst?.(sh.p);
        }
      }
      let any = false;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) { if (col[i * 3] !== 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; any = true; } continue; }
        any = true;
        life[i] -= dt;
        const k = i * 3;
        vel[k + 1] -= 4 * dt; vel[k] *= .985; vel[k + 1] *= .985; vel[k + 2] *= .985;
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        const f = Math.max(0, Math.min(1, life[i] / 1.2)) * (.7 + Math.random() * .3);
        col[k] = base[k] * f; col[k + 1] = base[k + 1] * f; col[k + 2] = base[k + 2] * f;
      }
      if (any) { geoP.attributes.position.needsUpdate = true; geoP.attributes.color.needsUpdate = true; }
    },
  };
}
