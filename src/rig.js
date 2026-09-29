// rig.js, the people of the game. A body is one skinned mesh (one draw call): the skin, the
// face, the hair, the clothes, the hat and the glasses are all baked into a single geometry
// with vertex colours, bent by 26 bones. Bodies wearing the same thing share their geometry;
// every body has its own bones. The poses are made by hand here: breathing, a walk and a run,
// jumps and falls, sitting, the tool swing, the hands of the empty-handed, and the emotes.
import * as THREE from 'three';
import { resolve } from './outfits.js';
import { talkieModel } from './talkie.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- the skeleton: joints in the bind pose (metres, feet on the ground, facing +z) ----------
// the character's left is +x (seen from the front it's on the right of the picture)
const J = [
  ['hips', -1, 0, .95, 0], ['spine', 0, 0, 1.04, -.005], ['chest', 1, 0, 1.23, -.01], ['neck', 2, 0, 1.455, -.01],
  ['head', 3, 0, 1.565, 0], ['jaw', 4, 0, 1.632, .118], ['eyes', 4, 0, 1.722, .12], ['brows', 4, 0, 1.764, .12],
];
for (const [s, n] of [[1, 'L'], [-1, 'R']]) J.push(
  ['sh' + n, 2, s * .185, 1.425, -.01], ['elb' + n, 'sh' + n, s * .2, 1.155, -.018], ['hand' + n, 'elb' + n, s * .208, .905, -.005],
  ['fing' + n, 'hand' + n, s * .206, .815, -.004], ['index' + n, 'hand' + n, s * .204, .818, .022], ['thumb' + n, 'hand' + n, s * .19, .875, .028],
);
for (const [s, n] of [[1, 'L'], [-1, 'R']]) J.push(['hip' + n, 0, s * .092, .925, 0], ['knee' + n, 'hip' + n, s * .098, .505, .01], ['foot' + n, 'knee' + n, s * .102, .085, -.012]);
export const BI = {};
J.forEach((j, i) => { BI[j[0]] = i; });
for (const j of J) if (typeof j[1] === 'string') j[1] = BI[j[1]];
const NB = J.length;
const HC = new THREE.Vector3(0, 1.705, .008);       // the middle of the head
const SIDES = [[1, 'L'], [-1, 'R']];
// where the eye is (set once a frame by the game): far bodies are drawn with fewer triangles
export const EYE = new THREE.Vector3(0, 1e6, 0);
// the arm raising a walkie-talkie to the mouth, and the radio in the fist (hand bone space)
export const TALKIE_POSE = { sh: [-1, -.6, 0], elb: [-2, 0, 0], at: [0, .02, .02], rot: [0, 0, Math.PI] };

// ---------- geometry helpers ----------
const _c = new THREE.Color(), _v = new THREE.Vector3();
const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
// a surface of revolution round a vertical axis: ctrl rows [y, rx, rz, cx, cz], ascending y
function lathe(ctrl, { step = .03, seg = 24, cuts = [], y0 = -Infinity, y1 = Infinity, arc = null, wob = null } = {}) {
  const ys = new Set();
  for (const c of ctrl) if (c[0] >= y0 && c[0] <= y1) ys.add(c[0]);
  const lo = Math.max(ctrl[0][0], y0), hi = Math.min(ctrl[ctrl.length - 1][0], y1);
  for (let y = lo; y < hi; y += step) ys.add(+y.toFixed(5));
  ys.add(lo); ys.add(hi);
  for (const c of cuts) if (c > lo + 2e-4 && c < hi - 2e-4) { ys.add(c - 1e-4); ys.add(c + 1e-4); }
  const Y = [...ys].sort((a, b) => a - b);
  const ring = new Float32Array(4);
  const at = (y) => {
    let k = 0;
    while (k < ctrl.length - 2 && ctrl[k + 1][0] < y) k++;
    const A = ctrl[k], B = ctrl[k + 1], P = ctrl[Math.max(0, k - 1)], Q = ctrl[Math.min(ctrl.length - 1, k + 2)];
    const h = B[0] - A[0] || 1, t = clamp01((y - A[0]) / h), t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    for (let i = 0; i < 4; i++) {
      const a = A[i + 1] ?? 0, b = B[i + 1] ?? 0, p = P[i + 1] ?? 0, q = Q[i + 1] ?? 0;
      const m0 = (b - p) / ((B[0] - P[0]) || 1) * h, m1 = (q - a) / ((Q[0] - A[0]) || 1) * h;
      ring[i] = h00 * a + h10 * m0 + h01 * b + h11 * m1;
    }
    ring[0] = Math.max(5e-4, ring[0]); ring[1] = Math.max(5e-4, ring[1]);
    return ring;
  };
  const wrap = !arc, n = wrap ? seg : seg + 1;
  const pos = new Float32Array(Y.length * n * 3);
  let p = 0;
  for (const y of Y) {
    const r = at(y);
    for (let i = 0; i < n; i++) {
      const a = arc ? arc[0] + (arc[1] - arc[0]) * i / seg : i / seg * TAU;
      const m = wob ? wob(a, y) : 1;
      pos[p++] = r[2] + Math.sin(a) * r[0] * m; pos[p++] = y; pos[p++] = r[3] + Math.cos(a) * r[1] * m;
    }
  }
  const idx = [];
  for (let k = 0; k < Y.length - 1; k++) for (let i = 0; i < (wrap ? n : n - 1); i++) {
    const a = k * n + i, b = k * n + (i + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const sphere = (r, ws, hs, x, y, z, sx = 1, sy = 1, sz = 1, extra = null) => {
  const g = extra ? new THREE.SphereGeometry(r, ws, hs, ...extra) : new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz); g.translate(x, y, z); return g;
};
const capsule = (r, len, x, y, z, rx = 0, rz = 0, caps = 4, rad = 8) => {
  const g = new THREE.CapsuleGeometry(r, len, caps, rad);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z); return g;
};
const boxG = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z); return g;
};
const cyl = (rt, rb, h, seg, x, y, z, open = false, rx = 0, rz = 0, ts = 0, tl = TAU) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z); return g;
};
// turn a surface inside out (the underside of a brim)
function flip(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return g;
}
// drop the triangles a test keeps out (a helmet's window)
function carve(g, out) {
  const P = g.attributes.position, ix = g.index.array, keep = [];
  for (let i = 0; i < ix.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += P.getX(ix[i + k]); y += P.getY(ix[i + k]); z += P.getZ(ix[i + k]); }
    if (!out(x / 3, y / 3, z / 3)) keep.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  g.setIndex(keep);
  return g;
}
const star = (ro, ri, depth) => {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + Math.PI / 2, r = k % 2 ? ri : ro; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
};

// a body in the making: parts with a colour (or a colour per vertex) and bones to follow
const W3 = [0, 0, 0];
class Parts {
  constructor(det) { this.list = []; this.det = det; }
  s(n) { return Math.max(4, Math.round(n * this.det)); }
  add(geo, color, skin) { this.list.push({ geo, color, skin }); return geo; }
  merge() {
    let nv = 0, ni = 0;
    for (const { geo } of this.list) {
      if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      nv += geo.attributes.position.count; ni += geo.index.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0, i0 = 0;
    for (const { geo, color, skin } of this.list) {
      const P = geo.attributes.position, N = geo.attributes.normal, n = P.count;
      for (let k = 0; k < n; k++) {
        const x = P.getX(k), y = P.getY(k), z = P.getZ(k), v = v0 + k;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        const ny = N.getY(k);
        nor[v * 3] = N.getX(k); nor[v * 3 + 1] = ny; nor[v * 3 + 2] = N.getZ(k);
        _c.setHex(typeof color === 'function' ? color(x, y, z) : color);
        // a touch of sky on what faces up, a touch of shade under: reads as soft light
        const sh = .84 + .16 * (ny * .5 + .5);
        col[v * 3] = _c.r * sh; col[v * 3 + 1] = _c.g * sh; col[v * 3 + 2] = _c.b * sh;
        if (typeof skin === 'number') { si[v * 4] = skin; sw[v * 4] = 1; }
        else { skin(x, y, z, W3); si[v * 4] = W3[0]; si[v * 4 + 1] = W3[1]; sw[v * 4] = 1 - W3[2]; sw[v * 4 + 1] = W3[2]; }
      }
      const I = geo.index.array;
      for (let k = 0; k < I.length; k++) idx[i0 + k] = I[k] + v0;
      v0 += n; i0 += I.length;
      geo.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.4);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -.2, -1), new THREE.Vector3(1, 2.3, 1));
    return g;
  }
}
// two bones blended along a band of heights: below lo all `a`, above hi all `b`
const band = (a, b, lo, hi, max = 1) => (x, y, z, o) => { o[0] = a; o[1] = b; o[2] = smooth(lo, hi, y) * max; };
// soft round spots (flowers, stars): a smooth field, thresholded softly between vertices
const blob = (x, y, z, f) => (Math.sin(x * f + 1.3) * Math.sin(y * f * .9 + .7) * Math.sin(z * f * 1.1 + 2.1) + 1) / 2;
const shade = (hex, k) => _c.setHex(hex).multiplyScalar(k).getHex();
const mix = (h1, h2, t) => { const a = new THREE.Color(h1); return a.lerp(new THREE.Color(h2), t).getHex(); };

// ---------- the body, dressed ----------
function buildBody(L, det) {
  const P = new Parts(det);
  const skin = L.skin, top = L.top, bot = L.bottom, suit = top.kind === 'suit';
  const hi = det > .75;
  const skinFace = mix(skin, 0xffc0b0, .06);
  const topC = top.c ?? 0x3f7fd8;
  // what colour the upper body is at a point: stripes, patterns, lapels
  const topAt = (x, y, z) => {
    const k = top.kind;
    if (k === 'mariniere') return (y > 1.47) ? top.c2 : (((y - 1.0) / .04) % 1 + 1) % 1 < .45 && y > .99 ? top.c2 : top.c;
    if (k === 'star') return mix(top.c, top.c2, smooth(.72, .95, blob(x, y, z, 70)));
    if (k === 'kimono') return mix(top.c, top.c3, smooth(.55, .85, blob(x, y, z, 38)));
    if (k === 'yukata') return mix(top.c, top.c2, smooth(-.3, .3, Math.sin(Math.atan2(x, z) * 9)));
    if (k === 'veste') {
      if (z > .02 && y > 1.14 && Math.abs(x) < (y - 1.14) * .32 + .012) return top.c2;
      return hash(x * 13, y * 13, z * 13) < .25 ? shade(top.c, .82) : top.c;
    }
    if (k === 'trench') return y > 1.015 && y < 1.065 ? top.c2 : top.c;
    if (k === 'happi') return z > .04 && Math.abs(Math.abs(x) - .045) < .022 ? top.c2 : top.c;
    if (k === 'suit') return (y > .995 && y < 1.035) ? top.c2 : top.c;
    if (k === 'tee' && y > 1.5) return shade(topC, .78);
    if (k === 'pull' && y < 1.0) return shade(topC, .82);
    return topC;
  };
  const cuts = { mariniere: [...Array(11).keys()].flatMap(k => [1.0 + k * .04, 1.018 + k * .04]).concat([1.47]), trench: [1.015, 1.065], suit: [.995, 1.035], tee: [1.5], pull: [1.0] }[top.kind] || [];

  // ---- the torso and the pelvis ----
  const torso = [[.965, .15, .102, 0, -.005], [1.04, .147, .1, 0, -.004], [1.12, .156, .106, 0, 0], [1.22, .17, .116, 0, .006], [1.31, .178, .118, 0, .006],
    [1.37, .174, .112, 0, 0], [1.415, .162, .104, 0, -.006], [1.45, .138, .096, 0, -.008], [1.482, .1, .082, 0, -.009], [1.505, .066, .062, 0, -.009], [1.518, .045, .045, 0, -.008], [1.523, .004, .004, 0, -.008]];
  const torsoSkin = (x, y, z, o) => {
    if (y < 1.1) { o[0] = BI.hips; o[1] = BI.spine; o[2] = smooth(.97, 1.1, y); }
    else { o[0] = BI.spine; o[1] = BI.chest; o[2] = smooth(1.13, 1.28, y); }
  };
  P.add(lathe(torso, { seg: P.s(34), step: .022 / det, cuts }), topAt, torsoSkin);
  const botC = suit ? top.c : bot.c ?? 0x3a5680;
  const pelvis = [[.79, .012, .012], [.805, .07, .06], [.84, .128, .094], [.91, .157, .107], [.98, .156, .104], [1.03, .15, .1]];
  P.add(lathe(pelvis, { seg: P.s(28), step: .03 / det, cuts: [1.0] }), (x, y) => (!suit && y > 1.0 && bot.kind !== 'jupe' && bot.kind !== 'hakama') ? 0x3a2418 : botC, band(BI.hips, BI.spine, .98, 1.04, .5));
  if (!suit && (bot.kind === 'jean' || bot.kind === 'chino' || bot.kind === 'cargo')) P.add(boxG(.03, .024, .012, 0, 1.012, .108), 0xd9b040, BI.hips);

  // ---- the neck ----
  P.add(lathe([[1.45, .056, .056, 0, -.012], [1.51, .052, .05, 0, -.008], [1.58, .05, .05, 0, 0], [1.625, .038, .038, 0, .006], [1.64, .01, .01, 0, .006]], { seg: P.s(18), step: .03 / det }), skin,
    (x, y, z, o) => { if (y < 1.5) { o[0] = BI.chest; o[1] = BI.neck; o[2] = smooth(1.44, 1.5, y); } else { o[0] = BI.neck; o[1] = BI.head; o[2] = smooth(1.54, 1.6, y); } });

  // ---- arms and hands ----
  const sleeve = { tee: 1.29, happi: 1.14, kimono: .93, yukata: 1.02 }[top.kind] ?? .935;
  const bell = top.kind === 'kimono' || top.kind === 'yukata' || top.kind === 'happi';
  for (const [s, n] of SIDES) {
    const arm = [[.892, .018, .018, s * .209, -.005], [.905, .027, .026, s * .209, -.005], [.95, .031, .029, s * .208, -.006], [1.02, .038, .036, s * .206, -.01], [1.1, .042, .041, s * .203, -.014],
      [1.16, .04, .04, s * .201, -.017], [1.22, .044, .043, s * .2, -.016], [1.3, .05, .049, s * .197, -.014], [1.39, .057, .055, s * .194, -.011], [1.44, .058, .056, s * .192, -.01], [1.462, .046, .046, s * .19, -.01], [1.475, .018, .018, s * .19, -.01]];
    // a sleeve ends in a hem: a ring a little proud of the arm
    if (sleeve > .95) for (const r of arm) if (Math.abs(r[0] - sleeve) < .06 && r[0] > sleeve) { r[1] += .006; r[2] += .006; }
    if (bell) for (const r of arm) if (r[0] < 1.25 && r[0] > sleeve - .01) { const k = smooth(1.25, sleeve, r[0]); r[1] += k * .035; r[2] += k * .04; }
    const cuff = suit ? top.c3 : skin;
    const armC = (x, y, z) => y > sleeve ? topAt(x, y, z) : y > .905 && suit ? top.c : cuff;
    const armSkin = (x, y, z, o) => {
      if (y > 1.4) { o[0] = BI['sh' + n]; o[1] = BI.chest; o[2] = smooth(1.4, 1.475, y) * .55; }
      else if (y > 1.11) { o[0] = BI['elb' + n]; o[1] = BI['sh' + n]; o[2] = smooth(1.11, 1.21, y); }
      else { o[0] = BI['elb' + n]; o[1] = BI['hand' + n]; o[2] = smooth(.935, .9, y) * .6; }
    };
    P.add(lathe(arm, { seg: P.s(18), step: .03 / det, cuts: [sleeve, .905] }), armC, armSkin);
    // the shoulder's round
    P.add(sphere(.058, P.s(18), P.s(12), s * .188, 1.418, -.01, .95, .92, .95), topAt(s * .19, 1.43, 0), (x, y, z, o) => { o[0] = BI['sh' + n]; o[1] = BI.chest; o[2] = .15; });
    // a big sleeve's hanging pouch
    if (top.kind === 'kimono' || top.kind === 'yukata') P.add(sphere(.07, P.s(14), P.s(10), s * .214, sleeve + .1, -.03, .45, 1.3, 1.1), (x, y, z) => topAt(x, y, z), BI['elb' + n]);
    // the hand: a palm, four fingers, a thumb (gloves for a suit)
    const hc = suit ? top.c3 : skin;
    P.add(sphere(.046, P.s(16), P.s(12), s * .206, .858, -.004, .5, 1.08, .95), hc, BI['hand' + n]);
    for (const [z, len, bone] of [[.022, .044, 'index'], [.007, .048, 'fing'], [-.008, .045, 'fing'], [-.022, .034, 'fing']]) P.add(capsule(.0098, len, s * .205, .815 - len / 2 - .01, z, 0, 0, P.s(3), P.s(8)), hc, BI[bone + n]);
    P.add(capsule(.0115, .03, s * .186, .852, .044, -.6, s * .15, P.s(3), P.s(8)), hc, BI['thumb' + n]);
    if (hi && !suit) for (const [z] of [[.022], [.007], [-.008], [-.022]]) P.add(sphere(.0062, 6, 4, s * .214, .785, z, .5, 1, 1), mix(skin, 0xffffff, .35), BI['fing' + n]);
  }

  // ---- legs and feet ----
  const shortsTo = bot.kind === 'short' ? .63 : bot.kind === 'jupe' ? 1.2 : -1;
  for (const [s, n] of SIDES) {
    const leg = [[.055, .02, .02, s * .102, -.01], [.07, .033, .033, s * .102, -.01], [.11, .036, .036, s * .102, -.01], [.18, .042, .042, s * .102, -.008], [.28, .05, .05, s * .101, -.006],
      [.38, .058, .057, s * .1, -.004], [.47, .054, .054, s * .099, .008], [.53, .055, .056, s * .098, .012], [.62, .064, .062, s * .097, .008], [.74, .074, .072, s * .096, .006],
      [.86, .084, .082, s * .094, .004], [.94, .088, .086, s * .092, 0], [1.0, .07, .07, s * .088, 0]];
    if (!suit && (bot.kind === 'jean' || bot.kind === 'chino' || bot.kind === 'cargo')) for (const r of leg) if (r[0] < .2) { r[1] += .01; r[2] += .01; }
    if (!suit && bot.kind === 'short') for (const r of leg) if (r[0] > .6 && r[0] < .7) { r[1] += .01; r[2] += .01; }
    const legC = (x, y, z) => suit ? ((y > .5 && y < .535) ? top.c2 : top.c) : y > shortsTo ? botC : skin;
    const legSkin = (x, y, z, o) => {
      if (y > .9) { o[0] = BI['hip' + n]; o[1] = BI.hips; o[2] = smooth(.9, 1.0, y) * .6; }
      else if (y > .46) { o[0] = BI['knee' + n]; o[1] = BI['hip' + n]; o[2] = smooth(.46, .56, y); }
      else { o[0] = BI['knee' + n]; o[1] = BI['foot' + n]; o[2] = smooth(.12, .07, y) * .6; }
    };
    P.add(lathe(leg, { seg: P.s(20), step: .03 / det, cuts: suit ? [.5, .535] : [shortsTo] }), legC, legSkin);
    if (!suit && bot.kind === 'cargo') P.add(boxG(.03, .13, .11, s * .165, .7, .005), shade(botC, .85), BI['hip' + n]);
    shoe(P, L.shoes, s, BI['foot' + n], suit);
  }

  // ---- robes, skirts, sashes, suits' kit ----
  const robeSkin = (x, y, z, o) => { o[0] = BI.hips; o[1] = x > 0 ? BI.hipL : BI.hipR; o[2] = clamp01((1.0 - y) / .5) * .55 * clamp01(Math.abs(x) / .06); };
  const pleats = (n, k) => (a) => 1 + k * Math.cos(a * n);
  if (top.kind === 'kimono' || top.kind === 'yukata' || top.kind === 'happi' || top.kind === 'trench') {
    const end = { kimono: .1, yukata: .13, happi: .74, trench: .45 }[top.kind];
    const robe = [[end, .17, .13, 0, .005], [(end + 1) / 2, .165, .125, 0, .005], [.9, .16, .116], [.98, .153, .106], [1.06, .15, .102]];
    P.add(lathe(robe, { seg: P.s(32), step: .035 / det, cuts: [end + .03] }), (x, y, z) => y < end + .03 ? shade(topAt(x, y, z), .8) : topAt(x, y, z), robeSkin);
    // the underside of the hem, so it isn't hollow from below
    P.add(flip(lathe([[end + .004, .158, .118, 0, .005], [end + .06, .153, .114, 0, .005]], { seg: P.s(32), step: .1 })), shade(topAt(0, end, 0), .5), robeSkin);
  }
  if (!suit && (bot.kind === 'jupe' || bot.kind === 'hakama') && !['kimono', 'yukata', 'trench'].includes(top.kind)) {
    const end = bot.kind === 'jupe' ? .56 : .1, wide = bot.kind === 'jupe' ? .2 : .19;
    const sk = [[end, wide, wide * .8, 0, .004], [(end + 1.02) / 2, wide * .9, wide * .7], [.95, .16, .11], [1.03, .152, .104]];
    P.add(lathe(sk, { seg: P.s(40), step: .035 / det, wob: pleats(bot.kind === 'jupe' ? 18 : 10, .045) }),
      (x, y, z) => bot.kind === 'hakama' ? mix(botC, bot.c2, smooth(-.2, .2, Math.sin(Math.atan2(x, z) * 10))) : botC, robeSkin);
    P.add(flip(lathe([[end + .004, wide * .93, wide * .74, 0, .004], [end + .05, wide * .88, wide * .7, 0, .004]], { seg: P.s(40), step: .1, wob: pleats(bot.kind === 'jupe' ? 18 : 10, .045) })), shade(botC, .45), robeSkin);
  }
  if (top.kind === 'kimono' || top.kind === 'yukata') {
    // the obi round the waist, its bow at the back, the collars crossed left over right
    const obi = top.kind === 'kimono' ? top.c2 : top.c3, w = top.kind === 'kimono' ? .1 : .06;
    P.add(lathe([[1.03, .162, .114], [1.03 + w / 2, .165, .116], [1.03 + w, .163, .114]], { seg: P.s(32), step: .02 }), obi, BI.spine);
    P.add(sphere(.05, P.s(12), P.s(8), -.05, 1.03 + w / 2, -.12, 1.3, .8, .5), shade(obi, .9), BI.spine);
    P.add(sphere(.05, P.s(12), P.s(8), .05, 1.03 + w / 2, -.12, 1.3, .8, .5), shade(obi, .9), BI.spine);
    P.add(sphere(.025, P.s(10), P.s(8), 0, 1.03 + w / 2, -.13), shade(obi, .75), BI.spine);
    const col = (pts, c) => P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), P.s(24), .012, P.s(6)), c, (x, y, z, o) => { o[0] = BI.spine; o[1] = BI.chest; o[2] = smooth(1.13, 1.28, y); });
    col([[.09, 1.46, -.06], [.1, 1.44, .06], [.035, 1.33, .125], [-.03, 1.22, .128], [-.07, 1.1, .12]], 0xf4f0e6);
    col([[-.09, 1.46, -.06], [-.1, 1.44, .06], [-.04, 1.34, .122], [0, 1.28, .126]], shade(top.c, .7));
  }
  if (top.kind === 'happi') {
    P.add(lathe([[1.0, .158, .11], [1.02, .161, .112], [1.04, .158, .11]], { seg: P.s(32), step: .02 }), top.c2, BI.spine);
  }
  if (top.kind === 'trench') {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.add(sphere(.009, 8, 6, s * .05, 1.3 - k * .09, .122 - k * .004 + (k === 0 ? .004 : 0)), top.c2, BI.chest);
    P.add(boxG(.04, .03, .015, 0, 1.04, .112), 0xc8a050, BI.spine);
  }
  if (top.kind === 'veste') for (let k = 0; k < 2; k++) P.add(sphere(.009, 8, 6, .02, 1.18 - k * .08, .114), top.c3, BI.spine);
  if (suit) {
    P.add(boxG(.26, .36, .13, 0, 1.25, -.17, .05), shade(top.c, .9), BI.chest);
    P.add(boxG(.22, .06, .1, 0, 1.46, -.165), top.c2, BI.chest);
    for (const x of [-.06, .06]) P.add(cyl(.035, .035, .3, P.s(12), x, 1.25, -.245), top.c3, BI.chest);
    P.add(boxG(.12, .08, .025, .04, 1.3, .12, -.1), top.c3, BI.chest);
    for (const [x, c] of [[.015, 0xe83a3a], [.04, 0x3ae86a], [.065, 0x3a8ae8]]) P.add(sphere(.008, 8, 6, x, 1.31, .134), c, BI.chest);
    P.add(new THREE.TorusGeometry(.085, .018, P.s(8), P.s(24)).rotateX(Math.PI / 2).translate(0, 1.475, -.01), top.c3, BI.chest);
  }

  // ---- the head ----
  const head = sphere(.128, P.s(34), P.s(26), HC.x, HC.y, HC.z, 1, 1.1, 1.05);
  {
    const p = head.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = clamp01((HC.y - y) / .14);
      p.setX(k, p.getX(k) * (1 - .17 * t)); p.setZ(k, HC.z + (p.getZ(k) - HC.z) * (1 - .07 * t) + (t > .6 ? (t - .6) * .02 : 0));
    }
    head.computeVertexNormals();
  }
  P.add(head, (x, y, z) => L.mannequin ? skin : z > .06 ? skinFace : skin, BI.head);
  for (const s of [-1, 1]) {
    P.add(sphere(.03, P.s(12), P.s(10), s * .126, 1.7, -.004, .42, 1, .75), shade(skin, .95), BI.head);
    if (L.mannequin) continue;
    // eyes: whites, irises, pupils and a spark of light; brows; cheeks
    P.add(sphere(.026, P.s(16), P.s(12), s * .046, 1.722, .121, 1, 1.18, .5), 0xf8f6f2, BI.eyes);
    P.add(sphere(.0165, P.s(12), P.s(10), s * .046, 1.721, .1275, 1, 1.12, .5), 0x4a2e1e, BI.eyes);
    P.add(sphere(.0085, P.s(8), P.s(6), s * .046, 1.721, .1315, 1, 1.1, .5), 0x0c0a0a, BI.eyes);
    if (hi) P.add(sphere(.0045, 6, 4, s * .046 + .006, 1.729, .1345, 1, 1, .5), 0xffffff, BI.eyes);
    P.add(capsule(.0058, .032, s * .048, 1.764, .124, 0, Math.PI / 2 + s * .12, P.s(3), P.s(6)), shade(L.hairC, .8), BI.brows);
    if (hi) P.add(sphere(.022, 10, 8, s * .076, 1.664, .101, 1, .7, .35), mix(skin, 0xf07a7a, .35), BI.head);
  }
  if (!L.mannequin) {
    P.add(sphere(.02, P.s(12), P.s(10), 0, 1.688, .14, .8, .85, 1), shade(skinFace, .97), BI.head);
    P.add(new THREE.TorusGeometry(.022, .0055, P.s(6), P.s(14), Math.PI).rotateZ(Math.PI).scale(1, 1, .5).translate(0, 1.64, .117), 0x8a3a3a, BI.jaw);
    P.add(sphere(.017, P.s(10), P.s(6), 0, 1.632, .112, 1.1, .45, .35), 0x3a1414, BI.jaw);
  }
  hair(P, L);
  hat(P, L.hat, L);
  glasses(P, L.glasses);
  return P.merge();
}

function shoe(P, S, s, bone, suit) {
  const x = s * .102, k = S.kind;
  const at = (fn) => fn;
  if (k === 'geta') {
    P.add(boxG(.1, .026, .24, x, .05, .03), S.c, bone);
    for (const z of [-.05, .1]) P.add(boxG(.095, .038, .03, x, .018, z), shade(S.c, .7), bone);
    P.add(sphere(.052, P.s(16), P.s(10), x, .088, .03, .82, .5, 1.7), 0xf6f4ee, bone);
    P.add(new THREE.TorusGeometry(.036, .008, 6, P.s(14), Math.PI).rotateY(Math.PI / 2).translate(x, .09, .065), S.c2, bone);
    return;
  }
  if (k === 'moon') {
    P.add(sphere(.075, P.s(20), P.s(14), x, .07, .03, .95, .62, 1.45), S.c, bone);
    P.add(sphere(.08, P.s(20), P.s(10), x, .026, .03, 1, .32, 1.5), shade(S.c, .45), bone);
    P.add(lathe([[.06, .064, .066, x, -.01], [.2, .066, .066, x, -.012], [.28, .062, .062, x, -.012], [.29, .05, .05, x, -.012]], { seg: P.s(18), step: .03, cuts: [.2, .23] }), (X, y) => y > .2 && y < .23 ? S.c2 : S.c, (X, y, z, o) => { o[0] = bone; o[1] = bone - 1; o[2] = smooth(.12, .3, y) * .7; });
    return;
  }
  const upper = k === 'mocassin' ? [.74, .5] : k === 'tabi' ? [.7, .55] : [.78, .6];
  P.add(sphere(.058, P.s(22), P.s(14), x, .058, .03, upper[0], upper[1], 1.6), at((X, y, z) => k === 'sneaker' && z > .1 ? 0xf2f0ea : k === 'sneaker' && Math.abs(y - .058) < .012 && Math.abs(X - x) > .03 ? S.c2 : k === 'tabi' && z > .105 && Math.abs(X - x) < .006 ? S.c2 : S.c), bone);
  if (k !== 'tabi') P.add(sphere(.06, P.s(22), P.s(10), x, .02, .028, .83, .22, 1.62), k === 'sneaker' ? 0xf6f4f0 : S.c2, bone);
  else P.add(sphere(.058, P.s(22), P.s(8), x, .018, .03, .74, .14, 1.6), S.c2, bone);
  if (k === 'sneaker') P.add(new THREE.TorusGeometry(.04, .011, P.s(6), P.s(16)).rotateX(Math.PI / 2).translate(x, .1, -.012), S.c, bone);
  if (k === 'boot') {
    P.add(lathe([[.07, .048, .05, x, -.008], [.17, .05, .05, x, -.012], [.2, .052, .052, x, -.012], [.205, .04, .04, x, -.012]], { seg: P.s(18), step: .03 }), S.c, (X, y, z, o) => { o[0] = bone; o[1] = bone - 1; o[2] = smooth(.1, .2, y) * .7; });
    P.add(boxG(.07, .035, .06, x, .018, -.04), S.c2, bone);
    for (let k2 = 0; k2 < 3; k2++) P.add(sphere(.006, 6, 4, x, .09 + k2 * .03, .045), 0xd8c8a0, bone);
  }
  if (k === 'mocassin') P.add(boxG(.07, .01, .025, x, .083, .07, .3), S.c2, bone);
}

function hair(P, L) {
  const st = L.hair, c = L.hairC, dark = shade(c, .82);
  if (st === 'rase') return;
  const hb = BI.head;
  const cap = (theta, tilt, r = .137) => { const g = sphere(r, P.s(34), P.s(18), 0, 0, 0, 1.02, 1.1, 1.07, [0, TAU, 0, theta]); g.rotateX(tilt); g.translate(HC.x, HC.y + .007, HC.z - .006); return g; };
  const tone = (x, y, z) => hash(x * 40, y * 40, z * 40) < .3 ? dark : c;
  if (st === 'afro') {
    const g = sphere(.19, P.s(28), P.s(20), HC.x, HC.y + .075, HC.z - .03, 1, .95, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), m = 1 + .05 * Math.sin(x * 60) * Math.sin(y * 55) * Math.sin(z * 50); p.setXYZ(k, HC.x + (x - HC.x) * m, HC.y + .075 + (y - HC.y - .075) * m, HC.z - .03 + (z - HC.z + .03) * m); }
    g.computeVertexNormals();
    P.add(carve(g, (x, y, z) => z > HC.z + .06 && y < HC.y + .07), tone, hb);
    return;
  }
  P.add(cap(st === 'pics' ? 1.35 : 1.62, st === 'carre' || st === 'long' ? -.42 : -.5), tone, hb);
  if (st !== 'pics') P.add(sphere(.07, P.s(16), P.s(10), .025, HC.y + .085, HC.z + .1, 1.55, .5, .75).rotateZ(0), tone, hb);
  if (st === 'pics') for (let k = 0; k < 11; k++) {
    const a = k / 11 * TAU, rr = k % 2 ? .07 : .045, g = new THREE.ConeGeometry(.035, .1, P.s(8));
    g.rotateX(-.3 + Math.cos(a) * .5); g.rotateZ(-Math.sin(a) * .6);
    g.translate(Math.sin(a) * rr, HC.y + .13, HC.z + Math.cos(a) * rr - .01);
    P.add(g, tone, hb);
  }
  if (st === 'long' || st === 'carre') {
    const bot = st === 'long' ? 1.46 : 1.6;
    P.add(lathe([[bot, .135, .12, 0, -.015], [(bot + 1.76) / 2, .148, .14, 0, -.01], [1.76, .14, .145, 0, -.005]], { seg: P.s(26), step: .025, arc: [Math.PI * .42, Math.PI * 1.58] }), tone, hb);
    P.add(flip(lathe([[bot, .13, .115, 0, -.015], [(bot + 1.76) / 2, .143, .135, 0, -.01], [1.76, .135, .14, 0, -.005]], { seg: P.s(26), step: .025, arc: [Math.PI * .42, Math.PI * 1.58] })), dark, hb);
  }
  if (st === 'queue') {
    P.add(sphere(.035, P.s(12), P.s(10), 0, HC.y + .03, HC.z - .145), dark, hb);
    P.add(capsule(.03, .16, 0, HC.y - .07, HC.z - .165, .25, 0, P.s(4), P.s(10)), tone, hb);
  }
  if (st === 'chignon') P.add(sphere(.06, P.s(16), P.s(12), 0, HC.y + .12, HC.z - .08), tone, hb);
}

function hat(P, H, L) {
  const hb = BI.head, k = H.kind, c = H.c;
  if (k === 'none') return;
  if (k === 'cap') {
    P.add(sphere(.143, P.s(28), P.s(12), 0, 0, 0, 1.03, .96, 1.07, [0, TAU, 0, 1.42]).rotateX(-.28).translate(0, HC.y + .02, HC.z - .006), c, hb);
    P.add(cyl(.095, .095, .012, P.s(24), 0, 0, 0).scale(1, 1, 1.3).rotateX(.18).translate(0, HC.y + .075, HC.z + .135), shade(c, .8), hb);
    P.add(sphere(.012, 8, 6, 0, HC.y + .153, HC.z - .03), shade(c, .8), hb);
  } else if (k === 'beret') {
    P.add(sphere(.152, P.s(26), P.s(12), 0, 0, 0, 1.08, .36, 1.08).rotateZ(.22).rotateX(-.08).translate(.015, HC.y + .128, HC.z - .01), (x, y) => y < HC.y + .1 ? shade(c, .8) : c, hb);
    P.add(cyl(.006, .008, .025, 6, .03, HC.y + .19, HC.z - .01), c, hb);
  } else if (k === 'kasa') {
    const ring = (x, y, z) => { const r = Math.hypot(x, z - HC.z); return (Math.floor(r / .035) % 2) ? H.c2 : c; };
    P.add(cyl(0, .34, .19, P.s(40), 0, HC.y + .19, HC.z, true), ring, hb);
    P.add(flip(cyl(0, .335, .18, P.s(40), 0, HC.y + .185, HC.z, true)), shade(H.c2, .8), hb);
    P.add(sphere(.018, 8, 6, 0, HC.y + .285, HC.z), shade(H.c2, .7), hb);
    P.add(new THREE.TorusGeometry(.11, .006, 5, P.s(16), Math.PI).rotateY(Math.PI / 2).scale(1.1, 1.2, 1).translate(0, HC.y + .02, HC.z + .005), H.c2, hb);
  } else if (k === 'helmet' || k === 'dome' || k === 'bubble') {
    if (k === 'helmet') {
      const g = sphere(.205, P.s(32), P.s(24), HC.x, HC.y + .015, HC.z + .005);
      carve(g, (x, y, z) => z > HC.z + .06 && Math.abs(x) < .15 && y > HC.y - .085 && y < HC.y + .1);
      P.add(g, (x, y, z) => y < HC.y - .15 ? shade(c, .8) : c, hb);
      P.add(flip(sphere(.198, P.s(24), P.s(16), HC.x, HC.y + .015, HC.z + .005)), shade(c, .45), hb);
      P.add(boxG(.04, .03, .05, .19, HC.y + .06, HC.z + .02), H.c2, hb);
    }
    if (k === 'dome') { P.add(cyl(.006, .006, .12, 6, 0, HC.y + .27, HC.z), shade(c, .6), hb); P.add(sphere(.02, 10, 8, 0, HC.y + .335, HC.z), H.c2, hb); }
    // the ring at the collar: on the chest, the head turns inside
    P.add(new THREE.TorusGeometry(.13, .032, P.s(10), P.s(28)).rotateX(Math.PI / 2).translate(0, 1.5, -.005), k === 'helmet' ? shade(c, .85) : c, (x, y, z, o) => { o[0] = BI.neck; o[1] = BI.chest; o[2] = .6; });
  } else if (k === 'antennae') {
    for (const s of [-1, 1]) {
      P.add(capsule(.008, .15, s * .05, HC.y + .21, HC.z + .02, .15, -s * .38, 2, 6), H.c2, hb);
      P.add(sphere(.028, P.s(12), P.s(10), s * .085, HC.y + .29, HC.z + .033), c, hb);
    }
    P.add(new THREE.TorusGeometry(.138, .008, 5, P.s(20), Math.PI).rotateY(Math.PI / 2).translate(0, HC.y + .01, HC.z), H.c2, hb);
  } else if (k === 'tophat') {
    P.add(cyl(.112, .105, .21, P.s(28), 0, HC.y + .235, HC.z - .01), (x, y) => y < HC.y + .175 ? H.c2 : c, hb);
    P.add(cyl(.17, .17, .012, P.s(28), 0, HC.y + .128, HC.z - .01).scale(1, 1, 1.05), c, hb);
  } else if (k === 'hachimaki') {
    P.add(cyl(.141, .137, .035, P.s(32), 0, 0, 0, true).scale(1.02, 1, 1.08).rotateX(-.14).translate(0, HC.y + .07, HC.z + .002), c, hb);
    P.add(sphere(.02, 10, 8, 0, HC.y + .082, HC.z + .153, 1, 1, .25), H.c2, hb);
    P.add(sphere(.02, 8, 6, 0, HC.y + .045, HC.z - .148), c, hb);
    for (const s of [-1, 1]) P.add(boxG(.025, .09, .006, s * .02, HC.y - .01, HC.z - .152, 0, 0, s * .25), c, hb);
  } else if (k === 'cat') {
    for (const s of [-1, 1]) {
      P.add(new THREE.ConeGeometry(.05, .09, P.s(10)).scale(1, 1, .5).rotateZ(-s * .35).translate(s * .08, HC.y + .145, HC.z - .01), c, hb);
      P.add(new THREE.ConeGeometry(.03, .06, P.s(8)).scale(1, 1, .4).rotateZ(-s * .35).translate(s * .078, HC.y + .14, HC.z + .006), H.c2, hb);
    }
  }
}

function glasses(P, G) {
  const hb = BI.head, k = G.kind, y = 1.722;
  if (k === 'none') return;
  const temples = (c) => { for (const s of [-1, 1]) P.add(boxG(.006, .006, .13, s * .128, y + .004, .075, 0, s * .12), c, hb); };
  if (k === 'round') {
    for (const s of [-1, 1]) P.add(new THREE.TorusGeometry(.03, .0034, P.s(6), P.s(24)).translate(s * .047, y, .148), G.c, hb);
    P.add(new THREE.TorusGeometry(.011, .0028, 5, 10, Math.PI).translate(0, y + .004, .15), G.c, hb);
    temples(G.c);
  } else if (k === 'sun') {
    for (const s of [-1, 1]) P.add(cyl(.031, .031, .006, P.s(20), 0, 0, 0, false, Math.PI / 2).scale(1.22, 1, 1).translate(s * .05, y - .004, .152), G.c2, hb);
    P.add(boxG(.15, .01, .01, 0, y + .024, .153), G.c, hb);
    temples(G.c);
  } else if (k === 'star') {
    for (const s of [-1, 1]) { P.add(star(.044, .022, .007).translate(s * .05, y, .15), G.c, hb); P.add(cyl(.016, .016, .004, 12, s * .05, y, .1545, false, Math.PI / 2), 0x2a2030, hb); }
    temples(G.c);
  } else if (k === 'visor') {
    P.add(cyl(.153, .153, .06, P.s(32), 0, y + .004, .008, true, 0, 0, -1.2, 2.4), (x, yy) => mix(G.c, 0xfff4c0, clamp01((yy - y + .03) / .06) * .6), hb);
    P.add(cyl(.143, .143, .018, P.s(24), 0, y + .004, .008, true, 0, 0, 1.2, TAU - 2.4), 0x2a2c32, hb);
  } else if (k === 'goggles') {
    for (const s of [-1, 1]) {
      P.add(cyl(.037, .04, .03, P.s(18), s * .05, y, .142, true, Math.PI / 2), G.c, hb);
      P.add(cyl(.032, .032, .004, P.s(18), s * .05, y, .156, false, Math.PI / 2), G.c2, hb);
    }
    P.add(cyl(.142, .142, .024, P.s(28), 0, y, .006, true), G.c, hb);
  } else if (k === 'monocle') {
    P.add(new THREE.TorusGeometry(.029, .0038, 6, P.s(22)).translate(-.047, y, .149), G.c, hb);
    P.add(capsule(.0022, .12, -.085, 1.64, .125, .2, .45, 2, 4), G.c, hb);
  } else if (k === 'kitsune') {
    const m = sphere(.146, P.s(28), P.s(20), 0, 0, 0, 1, 1.1, 1.14, [Math.PI / 2 - 1.15, 2.3, .9, 1.4]);
    m.translate(HC.x, HC.y, HC.z + .012);
    P.add(m, (x, yy, z) => (Math.abs(yy - y) < .009 && Math.abs(x) > .022 && Math.abs(x) < .075) ? 0x1a1414
      : (yy > y + .012 && yy < y + .05 && Math.abs(Math.abs(x) - .05) < .018) ? G.c2
        : G.c, hb);
    P.add(new THREE.ConeGeometry(.05, .07, P.s(14)).rotateX(Math.PI / 2).scale(1, .8, 1).translate(0, 1.668, .185), G.c, hb);
    P.add(sphere(.009, 8, 6, 0, 1.668, .221), 0x1a1414, hb);
    P.add(new THREE.TorusGeometry(.02, .003, 4, 10, Math.PI).rotateZ(Math.PI).translate(0, 1.64, .168), G.c2, hb);
    for (const s of [-1, 1]) {
      P.add(new THREE.ConeGeometry(.045, .1, P.s(10)).scale(1, 1, .45).rotateZ(-s * .3).translate(s * .08, HC.y + .15, HC.z + .03), G.c, hb);
      P.add(new THREE.ConeGeometry(.026, .06, 8).scale(1, 1, .4).rotateZ(-s * .3).translate(s * .078, HC.y + .145, HC.z + .046), G.c2, hb);
    }
  }
}

// ---------- shared pieces: the body material, the geometry cache, glass, tools ----------
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const cache = new Map();
function geometryFor(L, det) {
  const key = det + JSON.stringify(L);
  let g = cache.get(key);
  if (!g) { g = buildBody(L, det); cache.set(key, g); }
  return g;
}
let glassMats = null;
function glass(kind) {
  glassMats ??= {
    visor: new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .55, roughness: .18, emissive: 0x6a4a10, emissiveIntensity: .6, transparent: true, opacity: .9 }),
    clear: new THREE.MeshStandardMaterial({ color: 0xe4f2fc, metalness: .2, roughness: .05, emissive: 0x2a3a48, transparent: true, opacity: .3, depthWrite: false }),
  };
  if (kind === 'helmet') {
    const g = new THREE.SphereGeometry(.2, 28, 18, Math.PI / 2 - .95, 1.9, 1.05, 1.1);
    const m = new THREE.Mesh(g, glassMats.visor);
    m.position.set(HC.x, HC.y + .015 - J[BI.head][3], HC.z + .005);
    return m;
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(kind === 'dome' ? .215 : .205, 28, 20), glassMats.clear);
  m.position.set(HC.x, HC.y + .02 - J[BI.head][3], HC.z);
  m.renderOrder = 2;
  return m;
}
// the tools in the hand: shared by every body
let toolKit = null;
function tools() {
  if (toolKit) return toolKit;
  const wood = new THREE.MeshLambertMaterial({ color: 0x9a6a3e }), steel = new THREE.MeshLambertMaterial({ color: 0xb8c0c8 }), orange = new THREE.MeshLambertMaterial({ color: 0xf07a26 }), dark = new THREE.MeshLambertMaterial({ color: 0x2a2e36 }), glow = new THREE.MeshBasicMaterial({ color: 0x5ad8ff });
  const shaft = new THREE.CylinderGeometry(.016, .018, .95, 8); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, .3);
  const blade = new THREE.BoxGeometry(.2, .018, .26); blade.translate(0, 0, .88);
  const grip = new THREE.CylinderGeometry(.018, .018, .12, 8); grip.rotateZ(Math.PI / 2); grip.translate(0, 0, -.18);
  const body = new THREE.BoxGeometry(.07, .09, .22); body.translate(0, .02, .06);
  const handle = new THREE.BoxGeometry(.05, .12, .06); handle.translate(0, -.04, 0);
  const bit = new THREE.ConeGeometry(.018, .18, 8); bit.rotateX(Math.PI / 2); bit.translate(0, .02, .26);
  const gun = new THREE.BoxGeometry(.07, .1, .3); gun.translate(0, .03, .08);
  const tank = new THREE.CylinderGeometry(.03, .03, .16, 10); tank.rotateX(Math.PI / 2); tank.translate(0, .09, .08);
  // the flashball: a fat black barrel with a yellow muzzle, a stock
  const fbBarrel = new THREE.CylinderGeometry(.04, .04, .34, 10); fbBarrel.rotateX(Math.PI / 2); fbBarrel.translate(0, .04, .2);
  const fbTip = new THREE.CylinderGeometry(.046, .046, .04, 10); fbTip.rotateX(Math.PI / 2); fbTip.translate(0, .04, .38);
  const fbBody = new THREE.BoxGeometry(.07, .08, .3); fbBody.translate(0, .02, 0);
  const yellow = new THREE.MeshLambertMaterial({ color: 0xf2c21e });
  toolKit = { shovel: [[shaft, wood], [blade, steel], [grip, dark]], drill: [[body, orange], [handle, dark], [bit, steel]], gun: [[gun, dark], [tank, glow]], flashball: [[fbBarrel, dark], [fbTip, yellow], [fbBody, dark]] };
  return toolKit;
}

// ---------- the emotes ----------
// f(P, t, s) writes a pose (absolute angles) over the idle one; t in seconds since it began
export const EMOTES = {
  salut: { name: 'salut', dur: 2.6, f(P, t) {
    P.r('shR', -.35, 0, -2.2); P.r('elbR', -.2, 0, -(.55 + .38 * Math.sin(t * 11))); P.curl('R', .05);
    P.r('head', .02, -.12, .08); P.face(1.2, 1, .006);
  } },
  pouce: { name: 'pouce levé', dur: 2.1, f(P, t) {
    P.r('shR', -.55, .1, .08); P.r('elbR', -1.45, 0, 0); P.curl('R', 1.55, 1.5, 0);
    P.r('head', .08 + .1 * Math.max(0, Math.sin(t * 5)), 0, 0); P.face(1.1, 1, .005);
  } },
  bravo: { name: 'bravo', dur: 2.6, f(P, t) {
    const k = Math.max(0, Math.sin(t * 15)) ** 2;
    for (const [s, n] of SIDES) { P.r('sh' + n, -1.0, 0, -s * (.3 + .2 * k)); P.r('elb' + n, -1.25, 0, 0); P.curl(n, .1); }
    P.r('chest', .05, 0, 0); P.face(1.3, 1, .004);
  } },
  danse: { name: 'danse', dur: 5.2, f(P, t) {
    const b = t * Math.PI * 2 * 1.1, k = Math.abs(Math.sin(b)), sw = Math.sin(b / 2);
    P.hy = -.03 - .05 * k;
    for (const [s, n] of SIDES) { P.r('hip' + n, -.3 * k - .05, 0, s * .06); P.r('knee' + n, .65 * k + .1, 0, 0); P.r('foot' + n, -.3 * k, 0, 0); }
    P.r('hips', 0, sw * .25, sw * .12); P.hx = sw * .04;
    P.r('chest', 0, -sw * .3, -sw * .1);
    if (Math.floor(t / 1.3) % 2) { // the roof goes up
      for (const [s, n] of SIDES) { P.r('sh' + n, -2.7 + k * .5, 0, s * .35); P.r('elb' + n, -.9 + k * .6, 0, 0); P.curl(n, 1.4); }
    } else {
      for (const [s, n] of SIDES) { P.r('sh' + n, -.6 + s * sw * .6, 0, s * .4); P.r('elb' + n, -1.5, 0, 0); P.curl(n, 1.3); }
    }
    P.r('head', .12 * Math.sin(b * 2), sw * .2, 0); P.face(1.4, 1, .004);
  } },
  rire: { name: 'rire', dur: 2.8, f(P, t) {
    const sh = Math.sin(t * 20);
    P.r('spine', -.08, 0, 0); P.r('chest', -.14 + .05 * sh, 0, 0); P.r('head', -.3 + .06 * sh, 0, .06 * Math.sin(t * 3));
    for (const [s, n] of SIDES) { P.r('sh' + n, -.35, 0, -s * .12); P.r('elb' + n, -1.35, -s * .3, 0); P.curl(n, .3); }
    P.face(2.6 + .7 * sh, .35, .008);
  } },
  montrer: { name: 'montrer', dur: 2.4, f(P, t) {
    P.r('shR', -1.5, 0, .05); P.r('elbR', -.08, 0, 0); P.curl('R', 1.6, 0, .9);
    P.r('chest', 0, .15, 0); P.r('head', -.05, .1, 0); P.face(1.15, 1, .008);
    P.r('shL', .1, 0, .12);
  } },
  hourra: { name: 'hourra', dur: 2.4, f(P, t) {
    const hop = Math.max(0, Math.sin(t * Math.PI * 2.2));
    P.hy = hop * .13 - .04 * (1 - hop);
    for (const [s, n] of SIDES) { P.r('sh' + n, -2.45, 0, s * .55); P.r('elb' + n, -.3, 0, 0); P.curl(n, 1.5); P.r('hip' + n, -.25 * hop, 0, 0); P.r('knee' + n, .5 * hop + .1, 0, 0); }
    P.r('head', -.18, 0, 0); P.face(2.3, 1, .012);
  } },
  facepalm: { name: 'facepalm', dur: 2.8, f(P, t) {
    P.r('shR', -1.95, .75, 0); P.r('elbR', -1.55, 0, 0); P.curl('R', .12);
    P.r('head', .06, .12 * Math.sin(t * 3), .05); P.r('chest', .04, 0, 0); P.face(.9, .6, -.006);
  } },
  reverence: { name: 'révérence', dur: 2.6, f(P, t, s, dur) {
    const e = Math.sin(Math.min(1, t / dur) * Math.PI);
    P.r('spine', .38 * e, 0, 0); P.r('chest', .18 * e, 0, 0); P.r('neck', -.05 * e, 0, 0); P.r('head', .05 * e, 0, 0);
    P.r('shR', -.5 * e, 0, .35 * e); P.r('elbR', -1.7 * e, 0, 0);
    P.r('shL', .45 * e, 0, .1); P.r('elbL', -.3 * e, 0, 0);
    P.r('hipR', .25 * e, 0, 0); P.r('kneeR', .2 * e, 0, 0); P.face(1.1, .7, 0);
  } },
  assis: { name: 's\'asseoir', dur: Infinity, f(P, t) {
    P.hy = -.74 + .004 * Math.sin(t * 1.6);
    for (const [s, n] of SIDES) { P.r('hip' + n, -1.45, 0, s * .08); P.r('knee' + n, .3 + (s > 0 ? .5 : 0), 0, 0); P.r('foot' + n, -.3, 0, 0); P.r('sh' + n, .5, 0, s * .2); P.r('elb' + n, -.05, 0, 0); P.curl(n, .2); }
    P.r('spine', -.18, 0, 0); P.r('chest', .05, 0, 0); P.r('head', .05, .15 * Math.sin(t * .4), 0);
  } },
};
export const EMOTE_ORDER = ['salut', 'pouce', 'bravo', 'danse', 'rire', 'montrer', 'hourra', 'facepalm', 'reverence', 'assis'];

// a pose: bone angles and the few other things a face and a body do
function makePose() {
  const p = {
    a: new Float32Array(NB * 3), hy: 0, hx: 0, jaw: 1, eyes: 1, brow: 0,
    r(b, x, y, z) { const i = BI[b] * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; },
    add(b, x, y, z) { const i = BI[b] * 3; this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z; },
    // fingers closed (0 open .. 1.6 fist), the index and the thumb on their own if asked
    curl(n, f, idx = f, th = f * .6) { const s = n === 'L' ? 1 : -1; this.r('fing' + n, 0, 0, -s * f); this.r('index' + n, 0, 0, -s * idx); this.r('thumb' + n, 0, 0, -s * th); },
    face(jaw, eyes, brow) { this.jaw = jaw; this.eyes = eyes; this.brow = brow; },
    copy(o) { this.a.set(o.a); this.hy = o.hy; this.hx = o.hx; this.jaw = o.jaw; this.eyes = o.eyes; this.brow = o.brow; },
    clear() { this.a.fill(0); this.hy = 0; this.hx = 0; this.jaw = 1; this.eyes = 1; this.brow = 0; },
  };
  return p;
}

// ---------- a body ----------
// opts: detail ('hi' | 'lo'), lod (switch to 'lo' far away), shadow, planet, mannequin
export function createRig(outfit, { detail = 'hi', lod = false, shadow = true, planet = false, mannequin = false, material = bodyMat } = {}) {
  const root = new THREE.Group();
  const bones = J.map(([name, parent, x, y, z]) => {
    const b = new THREE.Bone(); b.name = name;
    const p = parent >= 0 ? J[parent] : null;
    b.position.set(x - (p ? p[2] : 0), y - (p ? p[3] : 0), z - (p ? p[4] : 0));
    return b;
  });
  J.forEach(([, parent], i) => { if (parent >= 0) bones[parent].add(bones[i]); });
  const bind = bones.map(b => b.position.clone());
  let look = null, det = detail === 'hi' ? 1 : .5, farNow = false;
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), material);
  mesh.add(bones[0]);
  mesh.castShadow = shadow;
  mesh.frustumCulled = true;
  root.add(mesh);
  const skeleton = new THREE.Skeleton(bones);
  let bound = false;
  const extras = [];     // glass bubbles and visors on the head bone
  const held = {};       // tool meshes in the right hand

  function dress(o, opts = {}) {
    look = resolve(o, { planet: opts.planet ?? planet, mannequin: opts.mannequin ?? mannequin });
    mesh.geometry = geometryFor(look, farNow ? .5 : det);
    if (!bound) {
      // bound once, in the bind pose, at the origin: the bones' inverses are the bind pose
      root.updateMatrixWorld(true);
      mesh.bind(skeleton);
      bound = true;
    }
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.45);
    for (const e of extras) e.removeFromParent();
    extras.length = 0;
    const hk = look.hat.kind;
    if (hk === 'helmet' || hk === 'dome' || hk === 'bubble') {
      const g = glass(hk); bones[BI.head].add(g); extras.push(g);
      if (hk === 'helmet') { const c = glass('bubble'); bones[BI.head].add(c); extras.push(c); }
    }
  }
  dress(outfit);

  function hold(kind) {
    const want = kind === 'shovel' || kind === 'drill' || kind === 'gun' || kind === 'flashball' ? kind : kind === 'portal' || kind === 'disc' ? 'gun' : null;
    for (const k in held) held[k].visible = k === want && !rig.emote;
    if (want && !held[want]) {
      const g = new THREE.Group();
      for (const [geo, m] of tools()[want]) { const me = new THREE.Mesh(geo, m); me.castShadow = shadow; g.add(me); }
      // in the fist, pointing forward from the thumb, a little down
      g.position.set(0, -.058, .005); g.rotation.x = .35;
      bones[BI.handR].add(g); held[want] = g;
    }
    rig.tool = want;
  }
  // the walkie-talkie in the left hand (talkie.js), made the first time it's used
  let radio = null;
  function talkie(on, color) {
    st.talkie = !!on;
    if (on && !radio) {
      radio = talkieModel(color);
      radio.g.position.set(...TALKIE_POSE.at); radio.g.rotation.set(...TALKIE_POSE.rot);
      bones[BI.handL].add(radio.g);
    }
    if (radio) { radio.led(!!on); radio.g.visible = !!on; }
  }
  // no tool in the hand while dancing, clapping, sitting…
  let hidden = false;
  const showTool = () => { const h = !!rig.emote; if (h === hidden) return; hidden = h; for (const k in held) held[k].visible = k === rig.tool && !h; };

  // ---- animation ----
  const T = makePose(), E = makePose(), cur = makePose();
  let t = Math.random() * 10, ph = 0, blinkT = 2 + Math.random() * 3, blink = 0, emT = 0, emW = 0, digP = 0, lastEm = null;
  const st = { speed: 0, vy: 0, ground: true, sit: false, hands: -1, dig: false, talkie: false };

  function base(P) {
    P.clear();
    const br = Math.sin(t * 1.7);
    for (const [s, n] of SIDES) { P.r('sh' + n, .02, 0, s * (.1 + .012 * br)); P.r('elb' + n, -.16, 0, 0); P.curl(n, .32, .26, .25); }
    P.r('chest', .015 * br, 0, 0);
    P.r('head', .02, .14 * Math.sin(t * .37) * Math.sin(t * .23), 0);
    if (st.sit) {
      P.hy = -.43;
      for (const [s, n] of SIDES) { P.r('hip' + n, -1.52, 0, s * .05); P.r('knee' + n, 1.5, 0, 0); P.r('foot' + n, .02, 0, 0); P.r('sh' + n, -.3, 0, s * .12); P.r('elb' + n, -.95, 0, 0); }
      return;
    }
    if (!st.ground) {
      const f = clamp01(-(st.vy + .5) / 5);
      for (const [s, n] of SIDES) {
        const lead = s > 0;
        P.r('hip' + n, lerp(lead ? -.75 : -.2, -.3, f), 0, s * lerp(.03, .12, f));
        P.r('knee' + n, lerp(lead ? 1.15 : .45, .45, f), 0, 0);
        P.r('foot' + n, lerp(.2, -.1, f), 0, 0);
        P.r('sh' + n, lerp(-.45, -.25 + .25 * Math.sin(t * 13 + s), f), 0, s * lerp(.5, 1.85 + .15 * Math.sin(t * 11), f));
        P.r('elb' + n, lerp(-.7, -.35, f), 0, 0);
        P.curl(n, lerp(.4, .05, f));
      }
      P.r('spine', lerp(.1, -.05, f), 0, 0);
      P.face(lerp(1, 1.8, f), 1, lerp(0, .01, f));
      return;
    }
    const sp = st.speed, w = smooth(.15, 1.1, sp), run = smooth(4.2, 5.8, sp);
    if (w > 0) {
      const s1 = Math.sin(ph), c1 = Math.cos(ph), A = lerp(.46, .78, run) * w;
      P.r('hipL', -s1 * A, 0, .02); P.r('hipR', s1 * A, 0, -.02);
      const K = lerp(.85, 1.45, run) * w;
      P.r('kneeL', (.06 + Math.max(0, c1) * K) * (1 - .3 * (1 - w)), 0, 0); P.r('kneeR', (.06 + Math.max(0, -c1) * K) * (1 - .3 * (1 - w)), 0, 0);
      P.r('footL', (s1 * A * .45 - Math.max(0, c1) * K * .25), 0, 0); P.r('footR', (-s1 * A * .45 - Math.max(0, -c1) * K * .25), 0, 0);
      const arm = A * lerp(.75, 1.05, run);
      P.add('shL', s1 * arm, 0, 0); P.add('shR', -s1 * arm, 0, 0);
      P.add('elbL', -lerp(.12, 1.25, run) * w - Math.max(0, -s1) * .3 * w, 0, 0); P.add('elbR', -lerp(.12, 1.25, run) * w - Math.max(0, s1) * .3 * w, 0, 0);
      if (run > 0) for (const n of ['L', 'R']) P.curl(n, lerp(.32, 1.2, run));
      P.hy = -w * (.012 + lerp(.028, .05, run) * s1 * s1) + run * .02;
      P.r('hips', 0, -s1 * .13 * w, c1 * .035 * w);
      P.r('spine', .04 * w + .12 * run, 0, 0);
      P.add('chest', 0, s1 * .17 * w, 0);
      P.add('head', -.04 * w - .06 * run, -s1 * .06 * w, 0);
    }
  }

  function overlays(P) {
    // the empty-handed, each arm on its own, from 0 (down) through 1 (forward) to 2 (up in the air);
    // a number is both arms (older clients)
    if (st.hands !== -1 && st.hands != null) for (const [s, n] of SIDES) {
      const l = Array.isArray(st.hands) ? +st.hands[n === 'L' ? 0 : 1] || 0 : +st.hands || 0;
      if (l <= 0) continue;
      if (l <= 1) { P.add('sh' + n, -1.25 * l, 0, s * .12 * l); P.add('elb' + n, -.35 * l, -s * 1.4 * l, 0); P.curl(n, .05 * l); continue; }
      const k = l - 1, m = (a, b) => a + (b - a) * k;
      P.r('sh' + n, m(-1.25, -2.85), m(0, -s * 1.5), m(s * .12, s * .28)); P.r('elb' + n, m(-.35, -.2), m(-s * 1.4, 0), 0); P.curl(n, m(.05, .02));
    }
    // on the walkie-talkie: the left hand holds it at the mouth (the right keeps its tool)
    if (st.talkie) { P.r('shL', TALKIE_POSE.sh[0], TALKIE_POSE.sh[1], TALKIE_POSE.sh[2]); P.r('elbL', TALKIE_POSE.elb[0], TALKIE_POSE.elb[1], TALKIE_POSE.elb[2]); P.curl('L', 1.2); P.add('head', .06, .1, 0); }
    if (rig.tool) {
      // carrying: the right arm swings less, the elbow a little bent
      P.a[BI.shR * 3] *= .45; P.add('elbR', -.35, 0, 0); P.curl('R', 1.3);
      if (st.dig || digP > 0) {
        const k = digP, strike = k < .45 ? -Math.sin(k / .45 * Math.PI / 2) : -Math.cos((k - .45) / .55 * Math.PI / 2) + Math.sin((k - .45) / .55 * Math.PI) * .5;
        P.r('shR', -.6 + strike * 1.8, 0, .1); P.r('elbR', -.7 - strike * .3, 0, 0);
        P.add('chest', -strike * .15 - .05, .15, 0); P.add('spine', .06, 0, 0);
      }
    }
  }

  function update(dt, eye = null) {
    t += dt;
    const cyc = st.speed > 4.6 ? 2.3 : 1.45;
    ph += st.speed * dt / cyc * TAU;
    if (st.dig || digP > 0) { digP += dt / .5; if (digP >= 1) digP = st.dig ? digP - 1 : 0; }
    base(T);
    if (rig.emote) {
      const em = EMOTES[rig.emote];
      emT += dt;
      E.copy(T);
      em.f(E, emT, 1, em.dur);
      if (emT >= em.dur) { rig.emote = null; }
    }
    emW = rig.emote ? Math.min(1, emW + dt / .22) : Math.max(0, emW - dt / .3);
    if (!rig.emote || emW < 1) overlays(T);
    if (emW > 0 && lastEm) {
      if (!rig.emote) { E.copy(T); EMOTES[lastEm].f(E, EMOTES[lastEm].dur === Infinity ? emT : Math.min(emT, EMOTES[lastEm].dur - .001), 1, EMOTES[lastEm].dur); }
      const k = emW * emW * (3 - 2 * emW);
      for (let i = 0; i < T.a.length; i++) T.a[i] = lerp(T.a[i], E.a[i], k);
      T.hy = lerp(T.hy, E.hy, k); T.hx = lerp(T.hx, E.hx, k); T.jaw = lerp(T.jaw, E.jaw, k); T.eyes = lerp(T.eyes, E.eyes, k); T.brow = lerp(T.brow, E.brow, k);
    }
    // a blink now and then
    blinkT -= dt;
    if (blinkT <= 0) { blink = .14; blinkT = 2 + Math.random() * 4; }
    if (blink > 0) { blink -= dt; T.eyes = Math.min(T.eyes, .08); }
    // ease towards the pose
    const k = 1 - Math.exp(-dt * 16), a = cur.a, b = T.a;
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k;
    cur.hy += (T.hy - cur.hy) * k; cur.hx += (T.hx - cur.hx) * k; cur.jaw += (T.jaw - cur.jaw) * k * 1.3; cur.brow += (T.brow - cur.brow) * k;
    cur.eyes = blink > 0 ? T.eyes : cur.eyes + (T.eyes - cur.eyes) * Math.min(1, k * 2);
    for (let i = 0; i < NB; i++) bones[i].rotation.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
    bones[0].position.set(bind[0].x + cur.hx, bind[0].y + cur.hy, bind[0].z);
    showTool();
    if (radio) radio.g.visible = st.talkie;
    bones[BI.jaw].scale.set(1 + (cur.jaw - 1) * .12, Math.max(.3, cur.jaw), 1);
    bones[BI.eyes].scale.y = Math.max(.06, cur.eyes);
    bones[BI.brows].position.y = bind[BI.brows].y + cur.brow;
    if (lod) {
      _v.setFromMatrixPosition(root.matrixWorld);
      const far = _v.distanceToSquared(eye || EYE) > 14 * 14;
      if (far !== farNow) { farNow = far; mesh.geometry = geometryFor(look, far ? .5 : det); }
    }
  }

  const rig = {
    root, mesh, bones, skeleton, st, tool: null, emote: null,
    get look() { return look; },
    dress, hold, update, talkie,
    play(id) { if (!EMOTES[id]) return; rig.emote = id; lastEm = id; emT = 0; },
    stop() { rig.emote = null; },
    get emoting() { return !!rig.emote; },
    bone: (name) => bones[BI[name]],
    // a still pose for a shop window: a few frames of settling, then left alone
    freeze(pose = null) {
      if (pose) { rig.play(pose); }
      for (let n = 0; n < 40; n++) update(1 / 30);
    },
  };
  return rig;
}
