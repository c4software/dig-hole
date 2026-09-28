// kart.js, the A Hole Grand Prix: a figure of eight round the back of our village, wide
// enough to race three abreast. Along the back lane under our garden hedge, left round the
// church, right behind the bakery, a long sweeper through the grass behind the pharmacie,
// back past the back houses, across the lane in front of our back gate, round the corner of
// our garden wall, a hairpin by the mairie's little park, and back across the crossing. The
// town stays as it is: the track is the grass, the lane and the fields between its walls
// (read from the world's colliders), laid with track matting and closed off with race
// dressing that only shows while racing (barriers, catch fences, tyres, straw, a gantry,
// banners, stands). Drift for mini-turbos, boost pads, slipstream, item boxes, checkpoints, 3 laps.
// Online: each client drives its own kart, the host drives the bots; ~15 Hz states.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';
import { netTrack, netNow, netStamp } from './netlerp.js';

export const KART_ORIGIN = new THREE.Vector3(0, 0, 0);
const N = 1300, CP = 13, SEG = N / CP, LAPS = 4, KR = .78;
const TOP = 27, ACC = 21, GRID = 4, COUNT = 4;
// the route: the corners, each a circle [x, z, radius, +1 left / -1 right], joined by
// straight lines tangent to them, starting from the line on the back lane, eastbound
export const TURNS = [
  [38, 35.3, 18, 1], [63, 62, 18, -1],      // off the hedge line, down past the church
  [84, 26, 12, 1],          // left behind the house by the bakery
  [107.4, 12, 11.4, -1],    // the hairpin behind the pharmacie
  [106.5, 36, 12, -1],      // right, back towards the village
  [96, 83, 35, 1], [56, 24.6, 35, -1],     // the long bend past the back houses
  [53.5, 71.1, 11.5, 1], [25, 55.5, 19, -1],   // down between them
  [14, 52.5, 22, -1], [-26, 76, 22, 1],     // up across the crossing to our hedge
  [-39.6, 42, 12, -1],      // round the corner of our garden wall
  [-63, 30, 11.4, 1],       // the hairpin by the mairie's park
  [-63, 61, 11.4, 1],       // down to the fields
  [-48, 48.4, 24, 1], [-9, 78, 24, -1],     // back up across the crossing onto the back lane
];
const START = [30, 54];
function route(TURNS) {
  const n = TURNS.length, tan = [], pts = [], TAU = Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const [ax, az, ra, sa] = TURNS[k], [bx, bz, rb, sb] = TURNS[(k + 1) % n];
    const th = Math.atan2(bz - az, bx - ax) + Math.asin((sb * rb - sa * ra) / Math.hypot(bx - ax, bz - az)), lx = Math.sin(th), lz = -Math.cos(th);
    tan.push([[ax - sa * ra * lx, az - sa * ra * lz], [bx - sb * rb * lx, bz - sb * rb * lz]]);
  }
  const add = (x, z) => { const q = pts[pts.length - 1]; if (!q || Math.hypot(q[0] - x, q[1] - z) > 1) pts.push([x, z]); };
  for (let k = 0; k < n; k++) {
    const [cx, cz, r, s] = TURNS[k], p0 = tan[(k + n - 1) % n][1], [p1, q] = tan[k];
    const a0 = Math.atan2(p0[1] - cz, p0[0] - cx), a1 = Math.atan2(p1[1] - cz, p1[0] - cx);
    const sw = s > 0 ? -(((a0 - a1) % TAU + TAU) % TAU) : ((a1 - a0) % TAU + TAU) % TAU, m = Math.max(1, Math.ceil(Math.abs(sw) * r / 3));
    for (let j = 0; j <= m; j++) add(cx + r * Math.cos(a0 + sw * j / m), cz + r * Math.sin(a0 + sw * j / m));
    const m2 = Math.floor(Math.hypot(q[0] - p1[0], q[1] - p1[1]) / 4);
    for (let j = 1; j < m2; j++) add(p1[0] + (q[0] - p1[0]) * j / m2, p1[1] + (q[1] - p1[1]) * j / m2);
  }
  let s0 = 0; pts.forEach((q, i) => { if (Math.hypot(q[0] - START[0], q[1] - START[1]) < Math.hypot(pts[s0][0] - START[0], pts[s0][1] - START[1])) s0 = i; });
  return [...pts.slice(s0), ...pts.slice(0, s0)];
}
export const CTRL = route(TURNS);
const BOT_NAMES = ['gaston', 'pépette', 'bernard', 'lulu', 'mireille', 'jojo', 'titi'];
const BOT_COLORS = [0xb02a24, 0x2a5cc0, 0x33904f, 0x8a3ab8, 0xe0a020, 0x20a0a8, 0xe05a8a, 0x606870];
const ITEM_NAMES = { champi: 'champignon', triple: 'triple champi', banane: 'banane', verte: 'carapace verte', rouge: 'carapace rouge', faux: 'fausse boîte' };
const ODDS = [{ banane: 35, verte: 30, faux: 20, champi: 15 }, { champi: 25, verte: 20, rouge: 25, banane: 15, triple: 10, faux: 5 }, { champi: 25, triple: 30, rouge: 35, verte: 10 }];
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mulberry = (s) => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const r2 = (v) => Math.round(v * 100) / 100;
// what the dressing is made of: 0 the straight under the garden hedge (concrete and catch
// fences), 1 by the houses (plastic blocks), 3 out in the fields (straw)
const zoneOf = (x, z) => z < 58.5 && x > -44 && x < 60 ? 0 : x > -46 && x < 96 && z < 62 ? 1 : 3;
// the widest the track gets where nothing closes it, each side of the centre line
export const CAP = 6.6;
// the corridors of two stretches running side by side stop this far apart
const GAP = .6;
// what the world doesn't make solid but we won't drive through: the hedges outside our garden
// walls and along the fields, our garden gate, and the foot of the hills round the village
export const EXTRA = [
  { x0: -41.9, z0: 46.2, x1: 41.9, z1: 47.7 }, { x0: -42.8, z0: -9.9, x1: -40.7, z1: 47.7 }, { x0: 40.7, z0: -9.9, x1: 42.8, z1: 47.7 },
  { x0: -202, z0: 77.3, x1: -39.2, z1: 78.8 }, { x0: 39.2, z0: 77.3, x1: 202, z1: 78.8 },
  { x0: -2.6, z0: -11.95, x1: 2.45, z1: -11.35, gate: true },
  { x0: 122.5, z0: -5, x1: 160, z1: 60, hill: true }, { x0: -160, z0: 36, x1: -104, z1: 70, hill: true },
];

// ---------- the centre line: control points, a few smoothing passes, resampled evenly ----------
export function buildTrack(turns = null) {
  const c1 = new THREE.CatmullRomCurve3((turns ? route(turns) : CTRL).map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  let p = c1.getSpacedPoints(N); p.pop();
  for (let it = 0; it < 10; it++) p = p.map((q, i) => q.clone().multiplyScalar(.5).addScaledVector(p[(i + 1) % N], .25).addScaledVector(p[(i + N - 1) % N], .25));
  const c2 = new THREE.CatmullRomCurve3(p, true, 'centripetal'), P = c2.getSpacedPoints(N); P.pop();
  const len = c2.getLength(), ds = len / N, T = [], L = [], H = new Float32Array(N), K = new Float32Array(N), Y = new Float32Array(N).fill(.03), G = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = P[(i + N - 1) % N], b = P[(i + 1) % N], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    T.push({ x: dx / l, z: dz / l }); L.push({ x: dz / l, z: -dx / l }); H[i] = Math.atan2(dx, dz);
  }
  // signed curvature, > 0 turning left (towards L)
  for (let i = 0; i < N; i++) K[i] = wrapA(H[(i + 1) % N] - H[(i + N - 1) % N]) / (2 * ds);
  const Ks = avgRing(K, 4), Kw = avgRing(K, 22);
  let minR = Infinity, minRAt = 0; for (let i = 0; i < N; i++) { const r = 1 / Math.max(1e-6, Math.abs(Ks[i])); if (r < minR) { minR = r; minRAt = i; } }
  const Z = new Uint8Array(N); for (let i = 0; i < N; i++) { Z[i] = zoneOf(P[i].x, P[i].z); P[i].y = Y[i]; }
  // the crossing: where the line runs over itself. Round it, the two passes share the road
  // (XZ 1 the first pass, 2 the second), nothing splits them and no barrier stands between
  const far = Math.round(60 / ds), X = [], XZ = new Uint8Array(N);
  for (let i = 0; i < N; i++) for (let j = i + far; j < Math.min(N, i + N - far); j++) {
    if (Math.abs(P[i].x - P[j].x) > 1.5 || Math.abs(P[i].z - P[j].z) > 1.5) continue;
    const q = { x: (P[i].x + P[j].x) / 2, z: (P[i].z + P[j].z) / 2, i, j };
    if (!X.some(o => Math.hypot(o.x - q.x, o.z - q.z) < 8)) X.push(q);
  }
  for (const x of X) for (let i = 0; i < N; i++) if (Math.hypot(P[i].x - x.x, P[i].z - x.z) < 15) XZ[i] = Math.abs(i - x.i) < Math.abs(i - x.j) ? 1 : 2;
  const TR = { P, T, L, H, K: Ks, Kw, Y, G, Z, XZ, X, ds, len, minR, minRAt };
  TR.near = sampleGrid(TR);
  return TR;
}
function avgRing(A, w) { const n = A.length, o = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let d = -w; d <= w; d++) s += A[(i + d + n) % n]; o[i] = s / (2 * w + 1); } return o; }
// the samples in 8 m cells: which of them, far along the track from i, is nearest (x, z)
function sampleGrid({ P, ds }) {
  const g = new Map(), key = (x, z) => Math.floor(x / 8) * 4096 + Math.floor(z / 8);
  P.forEach((p, i) => { const k = key(p.x, p.z); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
  const far = Math.round(30 / ds);
  return (x, z, i) => {
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of g.get(key(x + a * 8, z + b * 8)) || []) {
      const di = Math.abs(i - j); if (Math.min(di, N - di) < far) continue;
      const e = (P[j].x - x) ** 2 + (P[j].z - z) ** 2; if (e < bd) { bd = e; best = j; }
    }
    return best < 0 ? null : { j: best, d: Math.sqrt(bd) };
  };
}
// the neighbours' houses have a front garden: a low wall and a hedge 3 m out from the door,
// drawn, not solid. Found from their colliders: the door (a 1.2 m gap under a 2.2 m lintel),
// the wall it's in, and the side of it with no house behind
export function yards(boxes) {
  const out = [];
  for (const d of boxes) {
    if (Math.abs((d.y1 ?? 0) - 2.2) > .02 || (d.y0 ?? 0) > .02) continue;
    const w = d.x1 - d.x0, h = d.z1 - d.z0, ax = Math.abs(w - 1.2) < .03 && Math.abs(h - .2) < .03, az = Math.abs(h - 1.2) < .03 && Math.abs(w - .2) < .03;
    if (!ax && !az) continue;
    const u0 = ax ? 'x0' : 'z0', u1 = ax ? 'x1' : 'z1', v0 = ax ? 'z0' : 'x0', v1 = ax ? 'z1' : 'x1', cu = (d[u0] + d[u1]) / 2, cv = (d[v0] + d[v1]) / 2;
    const wall = boxes.filter(b => Math.abs(b[v0] - d[v0]) < .03 && Math.abs(b[v1] - d[v1]) < .03 && b[u1] > d[u0] - 8 && b[u0] < d[u1] + 8);
    const back = (s) => boxes.some(b => !wall.includes(b) && b[u0] < cu && b[u1] > cu && (b[v0] - cv) * s > 0 && Math.abs(b[v0] - cv) < 12);
    const s = back(1) ? -1 : 1, f = s > 0 ? d[v1] : d[v0];
    out.push({ [u0]: Math.min(...wall.map(b => b[u0])), [u1]: Math.max(...wall.map(b => b[u1])), [v0]: Math.min(f, f + s * 3.6), [v1]: Math.max(f, f + s * 3.6), yard: true });
  }
  return out;
}
export function hashBoxes(list) {
  const g = new Map(), key = (i, j) => i * 4096 + j;
  for (const b of list) for (let i = Math.floor(b.x0 / 2); i <= Math.floor(b.x1 / 2); i++) for (let j = Math.floor(b.z0 / 2); j <= Math.floor(b.z1 / 2); j++) { const k = key(i, j); if (!g.has(k)) g.set(k, []); g.get(k).push(b); }
  return { inside(x, z, y = 1) { const c = g.get(key(Math.floor(x / 2), Math.floor(z / 2))); if (c) for (const b of c) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < (b.y1 ?? 9) && y > (b.y0 ?? -1)) return b; return null; } };
}
// how far the edges are on each side of every sample: a wall (k 1), or open ground (k 0)
// closed at CAP, or halfway to another stretch of the track running alongside
export function corridor(TR, boxes) {
  const { P, L, XZ } = TR, g = hashBoxes(boxes), lo = new Float32Array(N), hi = new Float32Array(N), kl = new Uint8Array(N), kh = new Uint8Array(N), ml = new Int32Array(N), mh = new Int32Array(N);
  for (let i = 0; i < N; i++) for (const s of [1, -1]) {
    let d = 0, k = 0, m = 0;
    for (; d <= CAP; d += .08) {
      const x = P[i].x + L[i].x * s * d, z = P[i].z + L[i].z * s * d;
      const b = g.inside(x, z); if (b) { k = b.hill ? 0 : 1; break; }
      if (!XZ[i] && d > 2) { const o = TR.near(x, z, i); if (o && !XZ[o.j] && o.d < d + GAP) { m = o.j + 1; break; } }
    }
    d = k ? Math.max(0, d - .04) : Math.min(d, CAP);
    if (s > 0) { hi[i] = d; kh[i] = k; mh[i] = m; } else { lo[i] = -d; kl[i] = k; ml[i] = m; }
  }
  return { lo, hi, kl, kh, ml, mh };
}
// the edges pulled in to the narrowest of their neighbours, so they run smooth
export function erode(c, LO = new Float32Array(N), HI = new Float32Array(N)) {
  const w = 4;
  for (let i = 0; i < N; i++) {
    let a = -Infinity, b = Infinity;
    for (let d = -w; d <= w; d++) { const j = (i + d + N) % N; a = Math.max(a, c.lo[j]); b = Math.min(b, c.hi[j]); }
    LO[i] = a; HI[i] = b;
  }
  return { LO, HI };
}

// a kart: a low tub, side pods, a big rear wing with its number, fat rear tyres, a driver
// in a helmet. `shell` leans (roll into the turns, pitch on the throttle); `anim` drives it.
const NUMS = {};
function kartModel(color, n = 0) {
  const g = new THREE.Group(), shell = new THREE.Group(); g.add(shell);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .15 });
  const deep = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.55), roughness: .5 });
  const trim = V.TRIM(), chrome = V.CHROME(), white = V.mat(0xf2eee4, { roughness: .45 });
  const put = (geo, m, x, y, z, p = shell) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  put(V.roundBox(1.12, .07, 2.15, .03), trim, 0, .19, -.02);
  put(V.roundBox(.86, .3, 1.9, .12, 3), paint, 0, .38, -.05);
  for (const s of [-1, 1]) {
    put(V.roundBox(.28, .26, 1.0, .11, 3), deep, s * .52, .34, -.1);
    put(V.roundBox(.06, .08, .9, .03), white, s * .67, .4, -.1);
  }
  // nose, front bumper, the number disc
  const nose = put(V.roundBox(.78, .2, .62, .09, 3), paint, 0, .33, 1.08); nose.rotation.x = .16;
  put(V.roundBox(1.28, .1, .14, .05), trim, 0, .24, 1.36);
  if (!NUMS[n]) NUMS[n] = V.paintTex(128, 128, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, h / 2, 60, 0, 7); c.fill(); c.lineWidth = 8; c.strokeStyle = '#15121c'; c.stroke(); c.fillStyle = '#15121c'; c.font = '900 80px Rubik, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n + 1), w / 2, h / 2 + 5); });
  const disc = put(new THREE.CircleGeometry(.17, 24), new THREE.MeshBasicMaterial({ map: NUMS[n] }), 0, .445, 1.08); disc.rotation.x = -Math.PI / 2 + .16;
  // seat, engine, twin exhausts with their boost flames
  const seat = put(V.roundBox(.56, .56, .14, .07), trim, 0, .7, -.5); seat.rotation.x = -.2;
  put(V.roundBox(.52, .3, .42, .08), V.mat(0x3a3c44, { metalness: .6, roughness: .35 }), 0, .56, -.92);
  for (const z of [-1.02, -.82]) put(V.roundBox(.54, .04, .04, .02), chrome, 0, .72, z);
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a30).multiplyScalar(2.4), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of [-.16, .16]) {
    const pipe = put(new THREE.CylinderGeometry(.05, .06, .36, 10), chrome, x, .58, -1.18); pipe.rotation.x = -Math.PI / 2 + .25;
    const f = put(new THREE.ConeGeometry(.08, .5, 10, 1, true), flameMat, x, .69, -1.6); f.rotation.x = -Math.PI / 2 + .25; f.visible = false; flames.push(f);
  }
  // the wing: plane, end plates, struts
  put(V.roundBox(1.36, .07, .38, .03), paint, 0, 1.0, -1.08);
  for (const s of [-1, 1]) { put(V.roundBox(.05, .32, .46, .03), trim, s * .68, .96, -1.08); put(V.roundBox(.05, .36, .08, .02), trim, s * .3, .8, -1.02); }
  // steering column and wheel, turning with the front wheels
  const column = new THREE.Group(); column.position.set(0, .74, .3); column.rotation.x = -.95; shell.add(column);
  put(new THREE.CylinderGeometry(.025, .025, .4, 6), trim, 0, -.2, 0, column);
  const sw = new THREE.Group(); column.add(sw);
  put(new THREE.TorusGeometry(.15, .03, 8, 20), trim, 0, 0, 0, sw).rotation.x = Math.PI / 2;
  put(V.roundBox(.26, .03, .05, .015), paint, 0, 0, 0, sw);
  // the driver: a suit, arms to the wheel, a helmet with a stripe and a dark visor
  const driver = new THREE.Group(); driver.position.set(0, .82, -.28); shell.add(driver);
  const suit = V.mat(0xf2eee4, { roughness: .7 });
  put(new THREE.CapsuleGeometry(.2, .26, 4, 10), suit, 0, 0, 0, driver).rotation.x = -.2;
  for (const s of [-1, 1]) { const a = put(new THREE.CapsuleGeometry(.055, .36, 3, 8), suit, s * .17, .02, .28, driver); a.rotation.set(1.25, 0, -s * .25); }
  const head = new THREE.Group(); head.position.set(0, .44, .04); driver.add(head);
  put(new THREE.SphereGeometry(.22, 18, 12), paint, 0, 0, 0, head);
  put(new THREE.TorusGeometry(.2, .03, 6, 22, Math.PI), white, 0, 0, 0, head).rotation.set(0, Math.PI / 2, 0);
  put(new THREE.SphereGeometry(.2, 16, 10, Math.PI / 2 - 1, 2, 1.15, .75), V.glass(false), 0, .02, .035, head);
  // wheels: fat at the back, the front pair on steering pivots
  const wheels = [], steerers = [];
  for (const [x, z, r, w] of [[-.7, .72, .26, .24], [.7, .72, .26, .24], [-.72, -.78, .31, .36], [.72, -.78, .31, .36]]) {
    const piv = new THREE.Group(); piv.position.set(x, r, z); g.add(piv);
    const wh = V.wheel({ r, w, spokes: 6 }); wh.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; piv.add(wh);
    wheels.push(wh); if (z > 0) steerers.push(piv);
  }
  g.add(V.contactShadow(2.1, 3.0, .55));
  g.traverse(o => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = true; });
  const roll = V.spring(80, 9), pitch = V.spring(70, 8), bob = V.spring(140, 10);
  let last = 0, st = 0, clock = Math.random() * 10;
  function anim(dt, speed, steer, boost) {
    clock += dt;
    const acc = clamp((speed - last) / Math.max(dt, 1e-3), -40, 40); last = speed;
    st += (steer - st) * Math.min(1, dt * 10);
    // right wheels face +x, left ones -x: the same roll forward, opposite signs
    for (const w of wheels) w.spin.rotation.z += (w.rotation.y > 0 ? 1 : -1) * speed * dt / w.radius;
    for (const p of steerers) p.rotation.y = st * .45;
    sw.rotation.y = -st * 1.6;
    head.rotation.z = st * .12 * Math.min(1, Math.abs(speed) / 10);
    const fast = Math.min(1, Math.abs(speed) / 18);
    shell.rotation.z = roll.step(st * fast * .09, dt);
    shell.rotation.x = pitch.step(clamp(-acc * .004, -.05, .06), dt);
    shell.position.y = bob.step((Math.sin(clock * 23) * .008 + Math.sin(clock * 13.7) * .006) * (.3 + fast), dt);
    for (const f of flames) { f.visible = boost > 0; if (boost > 0) f.scale.set(1, .8 + Math.random() * .6, 1); }
  }
  return { g, wheels, anim };
}

// ---------- painted canvases ----------
const DISPLAY = '"Titan One", Rubik, system-ui, sans-serif';
function sign(text, { bg = '#1a130d', fg = '#ffb020', w = 512, h = 128, size = 78, stroke = null, font = DISPLAY } = {}) {
  return V.paintTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = size * .16; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 4); }
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4);
  });
}
const rep = (t, n = 8) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = n; return t; };
function noiseTex(size, draw) { return rep(V.paintTex(size, size, draw)); }

// ---------- a few shared hazard shapes ----------
function hazardMesh(ty, mats) {
  const g = new THREE.Group();
  if (ty === 'banane') {
    const b = new THREE.Mesh(mats.bananaGeo, mats.banana); b.rotation.set(Math.PI / 2, 0, .4); b.position.y = .12; g.add(b);
    for (const a of [0, Math.PI * 1.2]) { const t = new THREE.Mesh(mats.tipGeo, mats.tip); t.position.set(Math.cos(a) * .3, .12, Math.sin(a) * .3); g.add(t); }
  } else if (ty === 'faux') {
    const b = new THREE.Mesh(mats.boxGeo, mats.fake); b.position.y = .75; g.add(b);
  } else {
    const d = new THREE.Mesh(mats.domeGeo, ty === 'rouge' ? mats.red : mats.green); d.position.y = .08; g.add(d);
    const rim = new THREE.Mesh(mats.rimGeo, mats.rim); rim.rotation.x = Math.PI / 2; rim.position.y = .1; g.add(rim);
  }
  return g;
}

export function createKart({ scene, camera, audio, ui }) {
  const root = new THREE.Group();
  root.name = 'grand-prix';
  root.visible = false;
  scene.add(root);
  const TR = buildTrack();
  const { P, T, L, H, K, Kw, Y, G, Z, XZ, ds } = TR;
  // the corridor between the walls: LO < 0 < HI laterally (towards L is positive, the left)
  const LO = new Float32Array(N), HI = new Float32Array(N), LINE = new Float32Array(N), VMAX = new Float32Array(N), KL = new Float32Array(N);
  let PADS = [], ROWS = [], stats = {};
  const deco = { lights: [], boxes: [], pads: null, blimp: null, flags: [] };
  let built = false, grid = null;

  // ---------- track queries ----------
  function nearest(x, z, from) {
    let best = from, bd = Infinity;
    for (let d = -60; d <= 60; d++) { const i = (from + d + N) % N, q = P[i], e = (q.x - x) ** 2 + (q.z - z) ** 2; if (e < bd) { bd = e; best = i; } }
    if (bd > 100) for (let i = 0; i < N; i++) { const q = P[i], e = (q.x - x) ** 2 + (q.z - z) ** 2; if (e < bd) { bd = e; best = i; } }
    return best;
  }
  function locate(o) {
    o.idx = nearest(o.x, o.z, o.idx);
    const q = P[o.idx], dx = o.x - q.x, dz = o.z - q.z;
    o.along = clamp(dx * T[o.idx].x + dz * T[o.idx].z, -ds, ds);
    o.lat = dx * L[o.idx].x + dz * L[o.idx].z;
  }
  const trackY = (o) => Y[o.idx] + G[o.idx] * o.along;
  const at = (i, lat) => { i = ((i % N) + N) % N; return { x: P[i].x + L[i].x * lat, z: P[i].z + L[i].z * lat, y: Y[i] }; };
  const mid = (i) => (LO[i] + HI[i]) / 2;

  // ---------- the town: its colliders, and what we add to them ----------
  const town = () => window.__dig?.world || null;
  function townBoxes() {
    const w = town(), out = [];
    const xs = P.map(p => p.x), zs = P.map(p => p.z), x0 = Math.min(...xs) - 25, x1 = Math.max(...xs) + 25, z0 = Math.min(...zs) - 25, z1 = Math.max(...zs) + 25;
    for (const c of w?.colliders || []) {
      if (c.min.y > 1.3 || c.max.y < .08 || c.max.x < x0 || c.min.x > x1 || c.max.z < z0 || c.min.z > z1 || c.max.x - c.min.x > 250 || c.max.z - c.min.z > 250) continue;
      const sx = c.max.x - c.min.x, sz = c.max.z - c.min.z;
      // posts: lamp posts and tree trunks, that get padded when the track runs by
      out.push({ x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z, y0: c.min.y, y1: c.max.y, post: sx < .8 && sz < .8 && c.max.y > 2.5 });
    }
    return out;
  }
  // the cypresses of the lane are drawn, not solid: find their feet in the merged decor
  function cypressBoxes() {
    const out = [], v = new THREE.Vector3();
    scene.traverse(o => {
      if (!o.isMesh || !o.material?.emissive || o.material.emissive.getHex() !== 0x0a1608 || !o.material.vertexColors) return;
      o.updateWorldMatrix(true, false);
      const p = o.geometry.attributes.position;
      for (let n = 0; n < p.count; n++) {
        if (Math.abs(p.getY(n) - .3) > .01) continue;
        v.fromBufferAttribute(p, n).applyMatrix4(o.matrixWorld);
        if (!out.some(b => Math.abs(b.cx - v.x) < .6 && Math.abs(b.cz - v.z) < .6)) out.push({ cx: v.x, cz: v.z, x0: v.x - .8, x1: v.x + .8, z0: v.z - .8, z1: v.z + .8 });
      }
    });
    return out;
  }
  // the racing line: an elastic band pulled tight between the walls
  function racingLine() {
    const m = 1.3, lo = new Float32Array(N), hi = new Float32Array(N);
    for (let i = 0; i < N; i++) { const c = mid(i); lo[i] = Math.min(LO[i] + m, c); hi[i] = Math.max(HI[i] - m, c); LINE[i] = c; }
    for (let it = 0; it < 500; it++) for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      const ax = P[a].x + L[a].x * LINE[a], az = P[a].z + L[a].z * LINE[a], bx = P[b].x + L[b].x * LINE[b], bz = P[b].z + L[b].z * LINE[b];
      const l = ((ax + bx) / 2 - P[i].x) * L[i].x + ((az + bz) / 2 - P[i].z) * L[i].z;
      LINE[i] = clamp(l, lo[i], hi[i]);
    }
    // then as round as the walls let it be: every fourth sample, the least bending through its
    // neighbours (a cubic through them), relaxed a few thousand times, then filled back in
    const S = 4, n = N / S, sl = new Float32Array(n);
    for (let j = 0; j < n; j++) sl[j] = LINE[j * S];
    const qx = (j) => { j = (j + n) % n; return P[j * S].x + L[j * S].x * sl[j]; }, qz = (j) => { j = (j + n) % n; return P[j * S].z + L[j * S].z * sl[j]; };
    for (let it = 0; it < 3000; it++) for (let j = 0; j < n; j++) {
      const i = j * S, tx = (-qx(j - 2) + 4 * qx(j - 1) + 4 * qx(j + 1) - qx(j + 2)) / 6, tz = (-qz(j - 2) + 4 * qz(j - 1) + 4 * qz(j + 1) - qz(j + 2)) / 6;
      sl[j] = clamp(sl[j] + 1.4 * ((tx - P[i].x) * L[i].x + (tz - P[i].z) * L[i].z - sl[j]), lo[i], hi[i]);
    }
    for (let i = 0; i < N; i++) { const j = Math.floor(i / S), f = (i % S) / S; LINE[i] = clamp(sl[j] * (1 - f) + sl[(j + 1) % n] * f, lo[i], hi[i]); }
    const h = new Float32Array(N), k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      h[i] = Math.atan2(P[b].x + L[b].x * LINE[b] - P[a].x - L[a].x * LINE[a], P[b].z + L[b].z * LINE[b] - P[a].z - L[a].z * LINE[a]);
    }
    for (let i = 0; i < N; i++) k[i] = wrapA(h[(i + 1) % N] - h[(i + N - 1) % N]) / (2 * ds);
    KL.set(avgRing(k, 5));
    for (let i = 0; i < N; i++) VMAX[i] = Math.min(TOP, .95 * 2.2 / (Math.abs(KL[i]) + 1.15 / TOP));
    for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) VMAX[i] = Math.min(VMAX[i], Math.sqrt(VMAX[(i + 1) % N] ** 2 + 2 * 18 * ds));
  }
  const width = (i) => HI[i] - LO[i];
  function pickSpot(u, test) { for (let d = 0; d < N; d++) { const i = (Math.round(u * N) + d) % N; if (test(i)) return i; } return Math.round(u * N) % N; }
  const straight = (i, w) => { for (let d = -w; d <= w; d++) if (Math.abs(KL[(i + d + N) % N]) > 1 / 45) return false; return true; };

  // is (x, z) on the road, of any stretch of it (the crossing has two)
  function onRoad(x, z, pad = .4, not = -1) {
    for (let i = 0; i < N; i++) {
      if (not >= 0 && Math.min(Math.abs(i - not), N - Math.abs(i - not)) < 40 / ds) continue;
      const dx = x - P[i].x, dz = z - P[i].z;
      if (dx * dx + dz * dz > 64 || Math.abs(dx * T[i].x + dz * T[i].z) > ds * .6) continue;
      const lat = dx * L[i].x + dz * L[i].z;
      if (lat > LO[i] - pad && lat < HI[i] + pad) return true;
    }
    return false;
  }
  // the whole plan, before any mesh: walls, the dressing that is solid, the corridor again
  let plan = null;
  function layout() {
    const base = townBoxes(), cyp = cypressBoxes();
    const extra = [...EXTRA, ...cyp, ...yards(base)];
    const c1 = corridor(TR, [...base, ...extra]);
    // what the dressing adds that you can hit: the gantry's leg, foam round the posts by the track
    const solid = [];
    const gq = at(0, c1.hi[0] - .28);
    solid.push({ x0: gq.x - .3, z0: gq.z - .3, x1: gq.x + .3, z1: gq.z + .3, kind: 'gantry' });
    const lamps = base.filter(b => b.post).map(b => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: Math.max(.32, (b.x1 - b.x0) / 2 + .08) })).filter(l => { const i = nearest(l.x, l.z, 0), q = P[i]; return Math.hypot(l.x - q.x, l.z - q.z) < CAP + l.r; });
    for (const l of lamps) solid.push({ x0: l.x - l.r, z0: l.z - l.r, x1: l.x + l.r, z1: l.z + l.r, kind: 'foam', x: l.x, z: l.z });
    const c2 = corridor(TR, [...base, ...extra, ...solid]);
    erode(c2, LO, HI);
    racingLine();
    grid = hashBoxes(base.filter(b => b.y1 > 1.5));
    // boost pads on the straights, item boxes across the road where it's wide; not at the crossing
    const clear = (j, w) => { for (let d = -w; d <= w; d++) if (XZ[(j + d + N) % N]) return false; return true; };
    PADS = [];
    const padOk = (j) => j < N - 100 && width(j) > 8 && straight(j, 14) && clear(j, 30) && PADS.every(p => Math.abs(p.i - j) > 120);
    for (const u of [.24, .32, .73]) { const i = pickSpot(u, padOk); if (padOk(i)) PADS.push({ i, c: clamp(LINE[(i + 4) % N], LO[i] + 1.7, HI[i] - 1.7) }); }
    ROWS = [];
    for (const u of [.13, .4, .8]) ROWS.push(pickSpot(u, j => j < N - 60 && width(j) > 8 && Math.abs(K[j]) < 1 / 30 && clear(j, 12) && PADS.every(p => Math.abs(p.i - j) > 40) && ROWS.every(r => Math.abs(r - j) > 150)));
    let minW = Infinity, minAt = 0; for (let i = 0; i < N; i++) if (width(i) < minW) { minW = width(i); minAt = i; }
    stats = { minW: r2(minW), minAt, minX: r2(P[minAt].x), minZ: r2(P[minAt].z), minR: r2(TR.minR), minRAt: TR.minRAt, len: Math.round(TR.len), cyp: cyp.length, lamps: lamps.length, town: base.length };
    // the promise to the players: wide, and no hairpin tighter than 11 m
    if (minW < 9 || TR.minR < 11) console.warn('[kart] track too tight', stats);
    const all = hashBoxes([...base, ...extra]);
    plan = { c1, c2, base, extra, solid, lamps, cyp, wallAt: (x, z) => all.inside(x, z) };
  }
  function gridSlot(s) {
    const i = (N - 8 - Math.floor(s / 2) * 10 - (s % 2) * 5) % N;
    return { i, lat: clamp(mid(i) + (s % 2 ? -2.4 : 2.4), LO[i] + 1.2, HI[i] - 1.2) };
  }

  // ---------- the dressing: built once, the same for everyone ----------
  const fv = (v, k) => typeof v === 'function' ? v(k) : v;
  function strip(i0, i1, a, b, ya, yb, { uS = 1, vS = 1, col = null } = {}) {
    const pos = [], uv = [], idx = [], cols = [];
    for (let j = i0; j <= i1; j++) {
      const k = ((j % N) + N) % N, p = P[k], l = L[k], A = fv(a, k), B = fv(b, k);
      pos.push(p.x + l.x * A, p.y + fv(ya, k), p.z + l.z * A, p.x + l.x * B, p.y + fv(yb, k), p.z + l.z * B);
      const v = j * ds / vS; uv.push(0, v, uS, v);
      if (col) { const [c1, c2] = col(k); cols.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b); }
      if (j < i1) { const q = (j - i0) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // contiguous runs [i0, i1] (i1 may pass N) where pred holds
  function runs(pred, min = 1) {
    const out = []; let s0 = 0;
    while (s0 < N && pred(s0)) s0++;
    if (s0 === N) return [[0, N]];
    let cur = null;
    for (let j = s0; j <= s0 + N; j++) {
      const on = j < s0 + N && pred(j % N);
      if (on && cur === null) cur = j;
      if (!on && cur !== null) { if (j - cur >= min) out.push([cur, j]); cur = null; }
    }
    return out;
  }
  const addMerged = (geos, mat, { cast = false, recv = true } = {}) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
    m.castShadow = cast; m.receiveShadow = recv; root.add(m); return m;
  };
  const inst = (geo, mat, list, { cast = true, colors = null } = {}) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((t, n) => { o.position.set(t.x, t.y, t.z); o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0); o.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1); o.updateMatrix(); m.setMatrixAt(n, o.matrix); if (colors) m.setColorAt(n, colors[n]); });
    m.castShadow = cast; m.receiveShadow = true; root.add(m); return m;
  };
  // an object put down in the world and baked into one geometry per material
  const bake = new Map();
  function put(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.updateMatrix();
    const g = geo.clone().applyMatrix4(o.matrix);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!bake.has(mat)) bake.set(mat, []);
    bake.get(mat).push(g.index ? g.toNonIndexed() : g);
  }
  const flushBake = (cast = true) => { for (const [mat, geos] of bake) addMerged(geos, mat, { cast: cast && !mat.transparent }); bake.clear(); };
  const inWall = (x, z) => grid?.inside(x, z, 1);

  function build() {
    built = true;
    const t0 = performance.now();
    layout();
    const t1 = performance.now();
    const R = mulberry(20260926);
    const C = (h) => new THREE.Color(h);
    // textures
    const kerbT = rep(V.paintTex(32, 64, (g, w, h) => { g.fillStyle = '#d8322a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f4f2ea'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 4, h); }), 4);
    kerbT.magFilter = THREE.NearestFilter;
    const stripes = rep(V.paintTex(32, 128, (g, w, h) => { g.fillStyle = '#d8322a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f4f2ea'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 3, h); }), 4);
    const fenceT = rep(V.paintTex(64, 64, (g) => { g.strokeStyle = '#c8ccd2'; g.lineWidth = 2.5; g.beginPath(); for (let k = -64; k < 128; k += 16) { g.moveTo(k, 0); g.lineTo(k + 64, 64); g.moveTo(k + 64, 0); g.lineTo(k, 64); } g.stroke(); g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, 64, 3); }), 4);
    const matT = rep(V.paintTex(128, 128, (g, w, h) => {
      g.fillStyle = '#5c5e62'; g.fillRect(0, 0, w, h);
      for (let n = 0; n < 2500; n++) { const v = Math.random(); g.fillStyle = `rgba(${v < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 1, h);
    }));
    const strawT = rep(V.paintTex(64, 64, (g, w, h) => { g.fillStyle = '#d9b862'; g.fillRect(0, 0, w, h); for (let n = 0; n < 500; n++) { g.fillStyle = ['#f0d080', '#b8923a', '#e6c46a', '#a88030'][n % 4]; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 1); } g.fillStyle = 'rgba(80,50,20,.5)'; g.fillRect(0, h * .3, w, 2); g.fillRect(0, h * .7, w, 2); }));
    const checker = V.paintTex(128, 16, (g) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#15131a' : '#f6f4ee'; g.fillRect(i * 4, j * 4, 4, 4); } });
    checker.magFilter = THREE.NearestFilter;
    const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const M = deco.M = {
      kerb: new THREE.MeshStandardMaterial({ map: kerbT, roughness: .6, ...decal }),
      mat: new THREE.MeshStandardMaterial({ map: matT, roughness: .9, ...decal }),
      concrete: new THREE.MeshStandardMaterial({ map: stripes, roughness: .7, side: THREE.DoubleSide }),
      cap: V.mat(0xd8d4ca, { roughness: .8 }),
      fence: new THREE.MeshStandardMaterial({ map: fenceT, alphaTest: .4, side: THREE.DoubleSide, metalness: .4, roughness: .5 }),
      tyre: new THREE.MeshStandardMaterial({ roughness: .9 }),
      plastic: new THREE.MeshStandardMaterial({ roughness: .45 }),
      straw: new THREE.MeshStandardMaterial({ map: strawT, roughness: 1 }),
      paint: new THREE.MeshBasicMaterial({ color: 0xf2f0e8, ...decal }),
      white: V.mat(0xf2eee4, { roughness: .6 }), grey: V.mat(0x9a9ca4, { roughness: .8 }), dark: V.TRIM(), steel: V.mat(0x6a7480, { metalness: .6, roughness: .4 }),
      red: V.mat(0xd8322a, { roughness: .45 }), wood: V.mat(0x9a7048, { roughness: .9 }), orange: V.mat(0xff7a1a, { roughness: .6 }), gold: V.mat(0xffb020, { metalness: .3, roughness: .45 }),
    };
    const { c2, lamps } = plan;
    const behind = (s, i) => { const q = at(i, (s > 0 ? c2.hi[i] : c2.lo[i]) + s * .9); return !!plan.wallAt(q.x, q.z); };
    const raw = (s, i) => s > 0 ? c2.hi[i] : c2.lo[i];
    const edge = (s, i) => s > 0 ? HI[i] : LO[i];
    // at the crossing an edge can run over the other road: no line, no barrier there
    const over = [new Uint8Array(N), new Uint8Array(N)];
    for (let i = 0; i < N; i++) if (XZ[i]) for (const s of [1, -1]) { const q = at(i, edge(s, i)); over[s > 0 ? 1 : 0][i] = onRoad(q.x, q.z, .3, i) ? 1 : 0; }
    const isOver = (s, i) => over[s > 0 ? 1 : 0][i] === 1;
    // where two stretches run side by side they share one wall, put up from the first of them
    const med = (s, i) => s > 0 ? c2.mh[i] : c2.ml[i];
    const kind = (s, i) => isOver(s, i) ? 2 : med(s, i) ? 3 : (s > 0 ? c2.kh[i] : c2.kl[i]) || (behind(s, i) ? 1 : 0);
    const country = (i) => Z[i] === 3;
    // the second pass over the crossing is laid a little higher, so the mats don't fight
    const lift = (i) => XZ[i] === 2 ? .012 : 0;

    // ---------- on the ground: track mats over the grass, painted lines, kerbs, the grid ----------
    const mats = [];
    for (const up of [0, 1]) for (const [i0, i1] of runs(i => (XZ[i] === 2) === !!up, 2)) mats.push(strip(i0, i1, (k) => LO[k] - .25, (k) => HI[k] + .25, .035 + up * .012, .035 + up * .012, { uS: 3, vS: 3 }));
    addMerged(mats, M.mat);
    const lines = [];
    for (const s of [1, -1]) for (const up of [0, 1]) for (const [i0, i1] of runs(i => !isOver(s, i) && (XZ[i] === 2) === !!up, 2)) lines.push(strip(i0, i1, (k) => edge(s, k) - s * .12, (k) => edge(s, k) - s * .3, .045 + up * .012, .045 + up * .012));
    addMerged(lines, M.paint);
    const kerbs = [];
    for (const s of [1, -1]) for (const [i0, i1] of runs(i => Math.sign(K[i]) === s && Math.abs(K[i]) > 1 / 28 && !XZ[i], 3)) {
      const a = Math.max(0, i0 - 6), b = i1 + 6;
      kerbs.push(strip(a, b, (k) => edge(s, k) - s * 1.2, (k) => edge(s, k), (k) => .05 + lift(k), (k) => .05 + lift(k), { vS: 2 }));
    }
    addMerged(kerbs, M.kerb);
    addMerged([strip(0, 3, LO[0], HI[0], .055, .055, { uS: 1, vS: 1.22 })], new THREE.MeshBasicMaterial({ map: checker, ...decal }));
    const slots = [];
    for (let s = 0; s < 8; s++) { const { i, lat } = gridSlot(s); slots.push(strip(i + 2, i + 3, lat - 1, lat + 1, .055, .055)); }
    addMerged(slots, M.paint);
    {
      const t = V.paintTex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = `96px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('a hole', w / 2, h / 2 + 6); });
      const m = new THREE.Mesh(strip(12, 26, -3.5, 3.5, .055, .055), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, ...decal }));
      const uv = m.geometry.attributes.uv; for (let n = 0; n < uv.count; n++) { const j = Math.floor(n / 2); uv.setXY(n, n % 2 ? 0 : 1, j / 14); }
      root.add(m);
    }
    {
      const t = rep(V.paintTex(64, 128, (g, w, h) => { g.fillStyle = '#ff7a10'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffe070'; g.lineWidth = 12; g.lineJoin = 'round'; for (const y of [30, 94]) { g.beginPath(); g.moveTo(6, y + 22); g.lineTo(w / 2, y - 14); g.lineTo(w - 6, y + 22); g.stroke(); } }), 2);
      deco.padTex = t;
      const mat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.5, 1.3, 1.1), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      addMerged(PADS.map(p => strip(p.i, p.i + 8, p.c - 1.4, p.c + 1.4, .06, .06, { vS: 2.5 })), mat, { recv: false });
    }

    // ---------- barriers where the town leaves it open: concrete and catch fences along the
    // straight, plastic blocks by the houses, straw in the fields, tyres on the outside of
    // the corners ----------
    const walls = [], caps = [], fences = [], posts = [], blocks = [], blockCols = [], bales = [], tyres = [], tyreCols = [], crowd = [], crowdCols = [];
    const free = (x, z) => !inWall(x, z) && !plan.wallAt(x, z) && !onRoad(x, z, .5);
    // spectators sat on straw on the grass, by the corners and the crossing
    for (const [u, s0] of [[.075, 0], [.33, 0], [.47, 0], [.62, 0], [.8, 0], [.97, 0]]) {
      const i = pickSpot(u, j => !XZ[j] && Z[j] !== 0);
      const s = s0 || (Math.sign(Kw[i]) === 1 ? -1 : 1);
      for (let k = -9; k <= 9; k++) {
        const j = (i + Math.round(k * .66 / ds) + N) % N;
        if (kind(s, j) !== 0) continue;
        const p = at(j, raw(s, j) + s * 2.6), p2 = at(j, raw(s, j) + s * 3.3);
        if (!free(p.x, p.z) || !free(p2.x, p2.z)) continue;
        bales.push({ x: p.x, y: .26, z: p.z, ry: H[j] });
        if (R() < .85) { crowd.push({ x: p.x, y: .95, z: p.z, s: .9 + R() * .2 }); crowdCols.push(new THREE.Color().setHSL(R(), .5 + R() * .3, .45 + R() * .2)); }
      }
    }
    const tyreAt = (x, y, z, n, row, h = 3) => { for (let k = 0; k < h; k++) { tyres.push({ x, y: y + .16 + k * .32, z }); tyreCols.push(C(row ? 0x222226 : (n & 1 ? 0xf2f0ea : 0xd8322a))); } };
    for (const s of [1, -1]) {
      const open = (i) => kind(s, i) === 0;
      const corner = (i) => Math.abs(Kw[i]) > 1 / 40 && Math.sign(Kw[i]) === -s;
      for (const [i0, i1] of runs(i => open(i) && Z[i] === 0, 4)) {
        walls.push(strip(i0, i1, (k) => raw(s, k), (k) => raw(s, k), 0, .95, { vS: 4 }));
        caps.push(strip(i0, i1, (k) => raw(s, k), (k) => raw(s, k) + s * .4, .95, .95));
        walls.push(strip(i0, i1, (k) => raw(s, k) + s * .4, (k) => raw(s, k) + s * .4, 0, .95, { vS: 4 }));
        fences.push(strip(i0, i1, (k) => raw(s, k) + s * .3, (k) => raw(s, k) + s * .3, .95, 3.6, { uS: 2.65 / 1.5, vS: 1.5 }));
        for (let j = i0; j <= i1; j += 7) { const p = at(j, raw(s, j % N) + s * .3); posts.push({ x: p.x, y: 1.8, z: p.z, sy: 3.7 }); }
      }
      for (const [i0, i1] of runs(i => kind(s, i) === 3 && med(s, i) - 1 > i, 2)) {
        const a = (k) => raw(s, k) + s * (GAP / 2 - .2), b = (k) => raw(s, k) + s * (GAP / 2 + .2);
        walls.push(strip(i0, i1, a, a, 0, .95, { vS: 4 }), strip(i0, i1, b, b, 0, .95, { vS: 4 }));
        caps.push(strip(i0, i1, a, b, .95, .95));
      }
      let n = 0;
      for (const [i0, i1] of runs(i => open(i) && Z[i] !== 0, 3)) {
        for (let j = i0; j < i1; j += 1.3 / ds) {
          const k = Math.floor(j) % N, lat = raw(s, k), h = H[k];
          if (corner(k)) { for (const [row, d] of [[0, .45], [1, 1.3]]) { const p = at(k, lat + s * d); if (!inWall(p.x, p.z) && !onRoad(p.x, p.z, .2, k)) tyreAt(p.x, 0, p.z, n, row); } }
          else if (country(k)) { const p = at(k, lat + s * .3); if (!inWall(p.x, p.z)) bales.push({ x: p.x, y: .26, z: p.z, ry: h }); }
          else { const p = at(k, lat + s * .28); if (!inWall(p.x, p.z)) { blocks.push({ x: p.x, y: .42, z: p.z, ry: h }); blockCols.push(C(n & 1 ? 0xf2f0ea : 0xd8322a)); } }
          n++;
        }
      }
    }
    // tyre walls at the noses of the islands either side of the crossing, facing the traffic
    for (let i = 0; i < N; i++) for (const s of [1, -1]) {
      if (!XZ[i] || isOver(s, i) || !isOver(s, (i + 1) % N) && !isOver(s, (i + N - 1) % N)) continue;
      const q = at(i, edge(s, i) + s * .5);
      if (!onRoad(q.x, q.z, 0, i)) for (let k = 0; k < 3; k++) { const p = at(i, edge(s, i) + s * (.5 + k * .85)); if (!onRoad(p.x, p.z, 0, i) && !inWall(p.x, p.z)) tyreAt(p.x, 0, p.z, k, 0, 3); }
    }
    addMerged(walls, M.concrete, { cast: true });
    addMerged(caps, M.cap);
    addMerged(fences, M.fence);
    inst(new THREE.BoxGeometry(.1, 1, .1), M.steel, posts, { cast: false });
    inst(V.roundBox(.5, .84, 1.24, .08), M.plastic, blocks, { colors: blockCols });
    inst(new THREE.BoxGeometry(.5, .52, 1.25), M.straw, bales);
    // our garden gate stays shut: plastic blocks across it
    { const g = plan.extra.find(b => b.gate); let n = 0; for (let x = g.x0 + .65; x < g.x1; x += 1.28) put(V.roundBox(1.24, .84, .5, .08), n++ & 1 ? M.white : M.red, x, .42, (g.z0 + g.z1) / 2); }
    // foam round the posts by the track
    for (const l of lamps) { put(new THREE.CylinderGeometry(l.r, l.r, 2.2, 12), M.concrete, l.x, 1.1, l.z); }
    inst(new THREE.CylinderGeometry(.42, .42, .3, 12), M.tyre, tyres, { colors: tyreCols });
    const tyreN = tyres.length;

    // ---------- the gantry over the start line, with five lights ----------
    {
      const i = 0, g = new THREE.Group(), p = P[i], hi = plan.c1.hi[0] - .28, lo = raw(-1, 0) - .75;
      g.position.set(p.x, 0, p.z); g.rotation.y = H[i];
      // in its frame: x along L (north), z along the track
      for (const x of [hi, lo]) { const col = new THREE.Mesh(V.roundBox(.5, 7.2, .5, .08), M.steel); col.position.set(x, 3.6, 0); col.castShadow = true; g.add(col); }
      const span = hi - lo, cx = (hi + lo) / 2;
      const beam = new THREE.Mesh(V.roundBox(span + .8, 1.3, .9, .12), M.dark); beam.position.set(cx, 6.6, 0); beam.castShadow = true; g.add(beam);
      const bt = sign('a hole grand prix', { w: 1024, h: 96, size: 70, fg: '#ffb020', stroke: '#000' });
      for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(span + .4, 1.1), new THREE.MeshBasicMaterial({ map: bt })); b.position.set(cx, 6.6, s * .46); b.rotation.y = s < 0 ? Math.PI : 0; g.add(b); }
      const off = new THREE.MeshStandardMaterial({ color: 0x2a0c0c, roughness: .3 }), red = V.lamp(0xff2a1a, 3), green = V.lamp(0x2aff5a, 3);
      for (let n = 0; n < 5; n++) {
        const x = cx + (n - 2) * .95;
        const pod = new THREE.Mesh(V.roundBox(.7, 1.1, .4, .08), M.dark); pod.position.set(x, 5.4, -.3); g.add(pod);
        const lamps = [];
        for (const y of [.24, -.24]) { const l = new THREE.Mesh(new THREE.CircleGeometry(.19, 18), off); l.position.set(x, 5.4 + y, -.51); l.rotation.y = Math.PI; g.add(l); lamps.push(l); }
        deco.lights.push({ lamps, off, red, green });
      }
      root.add(g);
      deco.gantry = g;
    }
    // ---------- banners strung across the track, sponsors ----------
    const sponsors = ['a hole', 'pelles martin', 'taupe-cola', 'dynamite & fils', 'radio taupe', 'creusez plus'].map((t, n) => sign(t, { bg: ['#1a130d', '#2f6bff', '#d8322a', '#ffb020', '#33904f', '#f4efe6'][n], fg: ['#ffb020', '#fff', '#fff', '#1a130d', '#fff', '#2f6bff'][n] }));
    const ropes = [];
    const banned = [];
    [.02, .2, .45, .7, .93].forEach((u, n) => {
      const i = pickSpot(u, j => straight(j, 10) && !XZ[j] && banned.every(k => Math.abs(k - j) > 60) && [HI[j] + .35, LO[j] - .35].every(l => { const q = at(j, l); return !onRoad(q.x, q.z, .1, j); }));
      banned.push(i);
      const a = at(i, HI[i] + .35), b = at(i, LO[i] - .35), w = Math.hypot(a.x - b.x, a.z - b.z);
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - .6, 7), 1.3), new THREE.MeshBasicMaterial({ map: sponsors[(n + 1) % sponsors.length], side: THREE.DoubleSide }));
      ban.position.set((a.x + b.x) / 2, 5.6, (a.z + b.z) / 2); ban.rotation.y = H[i] + Math.PI; root.add(ban);
      for (const q of [a, b]) put(new THREE.CylinderGeometry(.06, .06, 6.6, 6), M.steel, q.x, 3.3, q.z);
      for (const y of [6.3, 4.9]) ropes.push(new THREE.Vector3(a.x, y + .1, a.z), new THREE.Vector3((a.x + b.x) / 2, y, (a.z + b.z) / 2), new THREE.Vector3((a.x + b.x) / 2, y, (a.z + b.z) / 2), new THREE.Vector3(b.x, y + .1, b.z));
    });
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropes), new THREE.LineBasicMaterial({ color: 0x2a2e34 })));
    // ---------- grandstands: scaffolding, planks, a crowd, a sponsor board ----------
    function stand(x0, z0, x1, z1, face, rows, ad) {
      // face: the direction the crowd looks, 'n' (−z) or 's' (+z); rows rise away from it
      const wx = x1 - x0, dz = (z1 - z0) / rows, sgn = face === 'n' ? 1 : -1, zf = face === 'n' ? z0 : z1;
      for (let r = 0; r < rows; r++) {
        const y = .5 + r * .45, z = zf + sgn * (r + .5) * dz;
        put(new THREE.BoxGeometry(wx, .06, dz * .55), M.wood, (x0 + x1) / 2, y, z - sgn * dz * .2);
        put(new THREE.BoxGeometry(wx, .05, dz * .3), M.wood, (x0 + x1) / 2, y + .02 - .3, z + sgn * dz * .22);
        for (let x = x0 + .5; x < x1 - .3; x += .62) { if (R() < .16) continue; crowd.push({ x: x + (R() - .5) * .15, y: y + .45, z: z - sgn * dz * .1, ry: face === 'n' ? Math.PI : 0, s: .9 + R() * .2 }); crowdCols.push(new THREE.Color().setHSL(R(), .55 + R() * .3, .45 + R() * .2)); }
      }
      // the scaffolding: standards, ledgers, braces
      const top = .5 + rows * .45 + 1.2;
      for (let x = x0; x <= x1 + .01; x += wx / Math.max(1, Math.round(wx / 2))) for (let r = 0; r <= rows; r++) {
        const z = zf + sgn * r * dz, h = r === rows ? top : .5 + r * .45 + (r ? -.45 : 0) + .05;
        put(new THREE.CylinderGeometry(.04, .04, h, 6), M.steel, x, h / 2, z);
      }
      for (let r = 0; r <= rows; r++) put(new THREE.CylinderGeometry(.03, .03, wx, 6), M.steel, (x0 + x1) / 2, .25, zf + sgn * r * dz, 0, 0, Math.PI / 2);
      put(new THREE.CylinderGeometry(.03, .03, wx, 6), M.steel, (x0 + x1) / 2, top - .1, zf + sgn * rows * dz, 0, 0, Math.PI / 2);
      put(new THREE.CylinderGeometry(.03, .03, wx, 6), M.steel, (x0 + x1) / 2, 1.1, zf, 0, 0, Math.PI / 2);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(wx - .2, 7), .9), new THREE.MeshBasicMaterial({ map: sponsors[ad], side: THREE.DoubleSide }));
      b.position.set((x0 + x1) / 2, top + .25, zf + sgn * rows * dz); root.add(b);
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(wx - .2, .7), new THREE.MeshBasicMaterial({ map: sponsors[(ad + 2) % 6], side: THREE.DoubleSide }));
      fr.position.set((x0 + x1) / 2, .55, zf - sgn * .02); root.add(fr);
    }
    // between our garden and the church, inside the turn by the bakery, and two by the back houses
    stand(47, 34.5, 55, 37.5, 's', 3, 0);
    stand(69, 28, 77, 31, 's', 3, 5);
    stand(88, 58.5, 100, 62, 'n', 3, 1);
    stand(62, 68, 74, 71.5, 'n', 3, 3);
    inst(new THREE.CapsuleGeometry(.2, .36, 2, 6), new THREE.MeshStandardMaterial({ roughness: .8 }), crowd, { cast: false, colors: crowdCols });
    // ---------- marshal posts: a little hut, a marshal in orange, a yellow flag ----------
    {
      const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd21f, side: THREE.DoubleSide, roughness: .6 });
      for (const u of [.08, .18, .3, .42, .52, .62, .78, .9]) {
        const i = Math.round(u * N) % N;
        for (const s of [-1, 1]) {
          if (kind(s, i) !== 0 || XZ[i]) continue;
          const q = at(i, raw(s, i) + s * 1.7);
          if ([1.2, 1.7, 2.6, 3.3].some(d => { const p = at(i, raw(s, i) + s * d); return !free(p.x, p.z) || inWall(p.x + .8, p.z + .8) || inWall(p.x - .8, p.z - .8); })) continue;
          const ry = Math.atan2(-L[i].x * s, -L[i].z * s);
          put(V.roundBox(1.2, 2.1, 1.2, .06), M.white, q.x + L[i].x * s * .9, 1.05, q.z + L[i].z * s * .9, ry);
          put(V.roundBox(1.5, .12, 1.5, .04), M.orange, q.x + L[i].x * s * .9, 2.16, q.z + L[i].z * s * .9, ry);
          put(new THREE.CapsuleGeometry(.2, .6, 3, 8), M.orange, q.x, .72, q.z, ry);
          put(new THREE.SphereGeometry(.14, 10, 8), M.white, q.x, 1.33, q.z, ry);
          const f = new THREE.Group(); f.position.set(q.x, 1.3, q.z); f.rotation.y = ry;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1, 5), M.dark); pole.position.set(.28, .4, 0); f.add(pole);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(.55, .38), flagMat); cloth.position.set(.56, .72, 0); f.add(cloth);
          root.add(f); deco.flags.push({ f, ph: R() * 6 });
          break;
        }
      }
    }
    flushBake();
    // a blimp overhead
    {
      const b = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), V.mat(0xf2eee4, { roughness: .5 })); env.scale.set(4.5, 4.5, 14);
      const gon = new THREE.Mesh(V.roundBox(2, 1.2, 4, .3), M.dark); gon.position.y = -4.8;
      for (const s of [-1, 1]) { const f = new THREE.Mesh(V.roundBox(.2, 3.4, 3, .1), M.gold); f.position.set(s * 2.2, 0, -12); f.rotation.z = s * .5; b.add(f); }
      const t = sign('a hole', { w: 512, h: 128, size: 90, bg: '#f2eee4', fg: '#1a130d' });
      for (const s of [-1, 1]) { const ad = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: t })); ad.position.x = s * 4.52; ad.rotation.y = s * Math.PI / 2; b.add(ad); }
      b.add(env, gon); deco.blimp = b; root.add(b);
    }
    // item boxes: rows across the road
    {
      const t = V.paintTex(128, 128, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, h); ['#ff5a6e', '#ffb020', '#ffe45a', '#5ae07a', '#4aa8ff', '#b05ae0'].forEach((c, n) => grd.addColorStop(n / 5, c));
        g.fillStyle = grd; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(8, 8, w - 16, h - 16);
        g.font = `92px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#1a130d'; g.strokeText('?', w / 2, h / 2 + 6); g.fillStyle = '#fff'; g.fillText('?', w / 2, h / 2 + 6);
      });
      const ft = V.paintTex(128, 128, (g, w, h) => {
        g.fillStyle = '#e04a3a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(8, 8, w - 16, h - 16);
        g.font = `92px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#1a130d'; g.strokeText('¿', w / 2, h / 2 + 6); g.fillStyle = '#fff'; g.fillText('¿', w / 2, h / 2 + 6);
      });
      M.box = new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: .88, roughness: .2, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .35 });
      M.fake = new THREE.MeshStandardMaterial({ map: ft, transparent: true, opacity: .88, roughness: .2, emissive: 0xffffff, emissiveMap: ft, emissiveIntensity: .3 });
      M.boxGeo = V.roundBox(1.1, 1.1, 1.1, .14);
      for (const i of ROWS) {
        const lo = LO[i] + 1, hi = HI[i] - 1, n = Math.max(2, Math.min(4, Math.floor((hi - lo) / 1.5) + 1));
        for (let k = 0; k < n; k++) {
          const q = at(i, lo + (hi - lo) * k / (n - 1)), m = new THREE.Mesh(M.boxGeo, M.box); m.castShadow = true;
          m.position.set(q.x, q.y + 1, q.z); root.add(m);
          deco.boxes.push({ g: m, x: q.x, y: q.y, z: q.z, off: 0, ph: R() * 6 });
        }
      }
      M.bananaGeo = new THREE.TorusGeometry(.3, .1, 8, 16, Math.PI * 1.2); M.banana = V.mat(0xffd21f, { roughness: .5 });
      M.tipGeo = new THREE.SphereGeometry(.06, 6, 4); M.tip = V.mat(0x4a3018);
      M.domeGeo = new THREE.SphereGeometry(.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); M.green = V.mat(0x39c07a, { roughness: .25 }); M.red = V.mat(0xe0303a, { roughness: .25 });
      M.rimGeo = new THREE.TorusGeometry(.38, .07, 6, 18); M.rim = V.mat(0xf6f2e6);
    }
    // sparks: a pool of additive dots
    {
      const dot = V.paintTex(32, 32, (g, w, h) => { const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); });
      deco.sparkMat = {};
      for (const [k, c] of Object.entries({ blue: 0x4aa8ff, orange: 0xff8a20, purple: 0xd060ff, yellow: 0xffd060, white: 0xeaf4ff })) deco.sparkMat[k] = new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(c).multiplyScalar(2.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      deco.sparks = [];
      for (let n = 0; n < 220; n++) { const s = new THREE.Sprite(deco.sparkMat.yellow); s.visible = false; root.add(s); deco.sparks.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: .2 }); }
      deco.sparkN = 0;
      deco.smoke = V.createPuffs(root, 48, 0xe8e4dc);
      deco.dust = V.createPuffs(root, 32, 0x9b7b52);
    }
    stats.ms = [Math.round(t1 - t0), Math.round(performance.now() - t1)]; stats.tyres = tyreN; stats.bales = bales.length; stats.blocks = blocks.length;
  }

  // ---------- the town while we race: the passers-by and the delivery van step aside ----------
  let hidden = [];
  function clearStreets() {
    scene.traverse(o => {
      if (!o.isGroup || !o.userData.keep || o.children.length < 7 || !o.visible || o.position.y > .08) return;
      const b = o.children[0];
      if (b.isMesh && b.geometry?.type === 'CapsuleGeometry' && Math.abs((b.geometry.parameters?.radius ?? 0) - .2) < 1e-6) { o.visible = false; hidden.push(o); }
    });
  }
  let vanHidden = false;
  function keepVanAway() { const v = window.__dig?.delivery?.van; if (v && v.visible) { v.visible = false; vanHidden = true; } }
  function restoreStreets() {
    for (const o of hidden) o.visible = true;
    hidden = [];
    const d = window.__dig?.delivery;
    if (vanHidden && d?.van) d.van.visible = !!d.busy;
    vanHidden = false;
  }
  // ---------- particles ----------
  const tmpV = new THREE.Vector3();
  function spark(x, y, z, vx, vy, vz, color, size = .22, life = .35) {
    const q = deco.sparks[deco.sparkN]; deco.sparkN = (deco.sparkN + 1) % deco.sparks.length;
    q.s.material = deco.sparkMat[color]; q.s.position.set(x, y, z); q.v.set(vx, vy, vz); q.life = q.max = life; q.size = size; q.s.visible = true;
  }
  function stepSparks(dt) {
    for (const q of deco.sparks) {
      if (q.life <= 0) continue;
      q.life -= dt; q.v.y -= 9 * dt; q.s.position.addScaledVector(q.v, dt);
      q.s.scale.setScalar(q.size * Math.max(0, q.life / q.max));
      if (q.life <= 0) q.s.visible = false;
    }
  }
  const world = (x, y, z) => tmpV.set(x + KART_ORIGIN.x, y + KART_ORIGIN.y, z + KART_ORIGIN.z);

  // ---------- race state ----------
  let state = 'off', count = 0, raceT = 0, clock = 0, onEnd = () => {}, ended = false, endT = 0, goT = 0;
  let karts = [], me = null, hazards = [], humans = [], hostId = null, meId = 'me', send = () => {}, online = false;
  let left = new Set(), botOwner = null, sendT = 0, hzN = 0, lastKeys = new Set(), auto = false, myPlace = 1;
  let camYaw = 0, fov = 72, fovSet = 72, baseFov = 72, shake = 0, thrFrom = null, mmT = 0, engT = 0, vol = .7;
  const kartCache = new Map();
  const IDLE = { thr: 0, steer: 0, drift: false };

  function nameTag(text, color) {
    const t = V.paintTex(256, 64, (g, w, h) => { g.fillStyle = 'rgba(26,19,13,.7)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 24); g.fill(); g.font = `30px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillText(text, w / 2, h / 2 + 2); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(2, .5, 1); s.position.y = 2.1; s.renderOrder = 998; return s;
  }
  function makeKart(n, o) {
    const key = o.color + '|' + n;
    const m = kartCache.get(key) || kartModel(o.color, n); kartCache.set(key, m);
    m.g.rotation.order = 'YXZ'; m.g.visible = true; root.add(m.g);
    if (m.tag) { m.g.remove(m.tag); m.tag = null; }
    if (o.human && !o.me) { m.tag = nameTag(o.name, o.color); m.g.add(m.tag); }
    return { n, ...o, g: m.g, anim: m.anim, x: 0, z: 0, y: 0, yaw: 0, vh: 0, speed: 0, idx: 0, lat: 0, along: 0, passed: -1, prog: 0, done: false, finT: 0,
      spin: 0, spinA: 0, inv: 0, ghost: 0, boost: 0, boostPow: 1.35, drift: 0, driftT: 0, dlvl: 0, hopY: 0, hopV: 0, body: 0, pitch: 0, steerIn: 0, steerV: 0,
      item: null, itemN: 0, itemT: 0, roll: 0, slip: 0, slipOn: false, lane: 0, dodge: 0, skill: 1, band: 1, stuck: 0, wrongT: 0, padCd: 0, bumpCd: 0, driftHeld: false,
      net: null, trk: null, smp: [], heard: false, gone: false, parked: false, local: false };
  }
  const present = () => karts.filter(k => !k.gone);
  const standings = () => present().sort((a, b) => (b.done - a.done) || (a.done ? a.finT - b.finT : b.prog - a.prog));
  const sectorOf = (k) => ((k.passed % CP) + CP) % CP;

  function place(k, i) {
    const s = gridSlot(i), q = at(s.i, s.lat);
    k.x = q.x; k.z = q.z; k.idx = s.i; k.yaw = k.vh = H[s.i]; k.passed = -1; locate(k); k.y = trackY(k); updateProg(k);
  }
  function updateProg(k) {
    const cur = sectorOf(k);
    let off = k.idx + k.along / ds - cur * SEG;
    if (off < -N / 2) off += N; else if (off > N / 2) off -= N;
    k.prog = k.passed * SEG + clamp(off, -SEG, 2 * SEG);
  }
  // checkpoints: sectors must be passed in order, so no cutting and backing up undoes them
  function checkpoints(k) {
    const sec = Math.floor(k.idx / SEG), cur = sectorOf(k);
    if (sec === (cur + 1) % CP) { k.passed++; if (k.passed > 0 && k.passed % CP === 0) crossed(k); }
    else if (sec === (cur + CP - 1) % CP) k.passed--;
    updateProg(k);
  }
  function crossed(k) {
    const lap = k.passed / CP;
    if (lap >= LAPS && !k.done) { k.done = true; k.finT = raceT; send({ t: 'fin', i: k.n, time: r2(raceT) }); if (k === me) finish(); return; }
    if (k === me && !k.done) { ui.toast(lap === LAPS - 1 ? 'dernier tour !' : `tour ${lap + 1} / ${LAPS}`, false, 1600); if (lap === LAPS - 1) audio.horn(); else audio.tick(); }
  }

  function start({ seed = 1, humans: hs = null, hostId: host = null, meId: mine = 'me', send: snd = null } = {}) {
    if (!built) build();
    stopRace(true);
    const R = mulberry(seed | 0);
    humans = hs && hs.length ? hs : [{ id: mine, name: 'toi', color: 0xc8581a, me: true }];
    meId = mine; hostId = host ?? mine; send = snd || (() => {}); online = humans.length > 1;
    left = new Set(); botOwner = hostId; hazards = []; hzN = 0; ended = false; auto = false;
    root.visible = true; state = 'count'; count = COUNT; raceT = 0; clock = 0; goT = 0; thrFrom = null; lastKeys = new Set();
    // the grid: the bots at the front, the humans behind them, the colours kept apart
    const used = humans.map(h => new THREE.Color(h.color));
    const botCols = BOT_COLORS.filter(c => used.every(u => { const d = new THREE.Color(c); return Math.abs(d.r - u.r) + Math.abs(d.g - u.g) + Math.abs(d.b - u.b) > .35; }));
    const nb = Math.max(0, GRID - humans.length);
    const names = [...BOT_NAMES].sort(() => R() - .5);
    const list = [];
    for (let b = 0; b < nb; b++) list.push({ name: names[b], color: botCols[b % botCols.length] ?? BOT_COLORS[b], bot: true, human: false, id: 'bot' + b });
    for (const h of humans) list.push({ name: h.name, color: h.color, human: true, bot: false, id: h.id, me: h.id === meId });
    karts = list.map((o, n) => makeKart(n, o));
    karts.forEach((k, n) => {
      place(k, n);
      k.skill = .93 + R() * .06; k.lane = (R() - .5) * 3;
      k.local = k.me || (k.bot && botOwner === meId);
      k.heard = !k.human || k.me;
      // the others' karts: replayed ~100 ms late from their states, a jump of 10 m is a respawn
      if (!k.local) k.trk = netTrack({ angles: [2], cut: (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 > 100 });
      // on the grid already, for whoever looks before the first frame (the game menu's preview)
      k.g.position.set(k.x, k.y, k.z); k.g.rotation.set(0, k.yaw, 0); k.g.visible = true;
    });
    me = karts.find(k => k.me);
    camYaw = me.yaw; baseFov = fovSet = fov = camera.fov; eyeSet = false;
    try { vol = JSON.parse(localStorage.getItem('a-hole-settings') || '{}').volume ?? .7; } catch { vol = .7; }
    for (const b of deco.boxes) { b.off = 0; b.g.visible = true; }
    for (const l of deco.lights) l.lamps.forEach(m => { m.material = l.off; });
    clearStreets(); keepVanAway();
    minimap(true);
    audio.tick();
  }

  // ---------- driving: the same for you and the bots ----------
  function sim(k, inp, dt) {
    let { thr, steer } = inp;
    if (k.spin > 0) { k.spin -= dt; k.spinA += dt * 14; thr = 0; steer = 0; k.drift = 0; k.speed *= 1 - dt * 1.5; } else k.spinA = 0;
    k.inv = Math.max(0, k.inv - dt); k.ghost = Math.max(0, k.ghost - dt);
    const aSp = Math.abs(k.speed), off = false;
    let top = TOP * (k.bot ? k.skill * k.band : 1) * (k.slipOn ? 1.07 : 1);
    if (off && k.boost <= 0) top *= .5;
    if (k.boost > 0) { k.boost -= dt; top = Math.max(top, TOP * k.boostPow); if (thr >= 0 && k.speed < top) k.speed += 36 * dt; }
    if (thr > 0) { if (k.speed < top) k.speed += ACC * (1 - .8 * (Math.max(0, k.speed) / top) ** 2) * dt + (k.speed < 0 ? 20 * dt : 0); }
    else if (thr < 0) k.speed = Math.max(-9, k.speed - (k.speed > .5 ? 32 : 12) * dt);
    else k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), (3 + Math.abs(k.speed) * .22) * dt);
    if (k.speed > top) k.speed = Math.max(top, k.speed - (off ? 22 : 8) * dt);
    k.speed -= G[k.idx] * 5 * dt * Math.sign(Math.cos(k.yaw - H[k.idx]));
    // steering loosens with speed; a drift locks in a direction and charges a mini-turbo
    const vr = Math.min(1.2, aSp / TOP), f = clamp(aSp / 6, 0, 1);
    let rate = steer * (2.2 - 1.15 * vr) * f * (k.speed < -.1 ? -1 : 1);
    if (inp.drift && !k.driftHeld && k.speed > 8) { k.hopV = 3.4; }
    if (inp.drift && !k.drift && k.speed > 11 && Math.abs(steer) > .3 && k.spin <= 0 && !off) { k.drift = Math.sign(steer); k.driftT = 0; }
    k.driftHeld = !!inp.drift;
    if (k.drift) {
      if (!inp.drift || k.speed < 8 || k.spin > 0) {
        const lvl = driftLvl(k.driftT);
        if (lvl) { k.mt = (k.mt || 0) + 1; k.boost = Math.max(k.boost, [0, .55, 1.0, 1.5][lvl]); k.boostPow = 1.3; if (k === me) { audio.pop(); audio.charge(); } }
        k.drift = 0; k.driftT = 0;
      } else {
        rate = k.drift * (1.45 + .75 * steer * k.drift) * (.75 + .25 * vr);
        k.driftT += dt * (1 + .9 * Math.max(0, steer * k.drift));
        k.speed -= k.speed * .04 * dt;
      }
    }
    k.dlvl = k.drift ? driftLvl(k.driftT) : 0;
    k.yaw += rate * dt;
    const grip = k.spin > 0 ? 1.5 : k.drift ? 3.4 : off ? 5 : 8;
    k.vh += wrapA(k.yaw - k.vh) * Math.min(1, grip * dt);
    k.x += Math.sin(k.vh) * k.speed * dt; k.z += Math.cos(k.vh) * k.speed * dt;
    locate(k);
    // barriers: slide along, lose what went into them
    const lim = k.lat > 0 ? HI[k.idx] - KR : -LO[k.idx] - KR;
    if (Math.abs(k.lat) > lim) {
      const s = Math.sign(k.lat), n = L[k.idx], push = (Math.abs(k.lat) - lim) * s;
      k.x -= n.x * push; k.z -= n.z * push; k.lat = s * lim;
      const vx = Math.sin(k.vh) * k.speed, vz = Math.cos(k.vh) * k.speed, vn = (vx * n.x + vz * n.z) * s;
      if (vn > 0) {
        const tx = vx - n.x * s * vn * 1.3, tz = vz - n.z * s * vn * 1.3, sp = Math.hypot(tx, tz), imp = vn / Math.max(1, aSp);
        k.speed = (k.speed < 0 ? -1 : 1) * sp * (1 - .3 * imp);
        if (sp > .2) k.vh = Math.atan2(tx, tz) + (k.speed < 0 ? Math.PI : 0);
        k.yaw += wrapA(k.vh - k.yaw) * .5 * imp;
        if (imp > .45) k.drift = 0;
        if (vn > 4 && k.bumpCd <= 0) wallHit(k, vn, s);
      }
    }
    k.bumpCd = Math.max(0, k.bumpCd - dt);
    // karts push each other (you only move your own; the other client moves theirs)
    for (const o of karts) {
      if (o === k || o.gone || o.parked || k.ghost > 0 || o.ghost > 0) continue;
      const dx = k.x - o.x, dz = k.z - o.z, d2 = dx * dx + dz * dz;
      if (d2 > 3.6 || d2 < 1e-6 || Math.abs(k.y - o.y) > 1.5) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = 1.9 - d;
      // a kart someone else drives is a replay a little late: eased apart, never a jolt backwards
      const push = o.local ? ov * .6 : Math.min(ov * .6, 4 * dt);
      k.x += nx * push; k.z += nz * push;
      const into = -(Math.sin(k.vh) * nx + Math.cos(k.vh) * nz) * k.speed;
      if (into > 0) { k.speed -= into * .35; if (k === me && into > 3 && k.bumpCd <= 0) { audio.bonk(); shake = .25; k.bumpCd = .4; } }
    }
    k.y = trackY(k);
    k.hopY += k.hopV * dt; k.hopV -= 24 * dt; if (k.hopY <= 0) { k.hopY = 0; k.hopV = 0; }
    checkpoints(k);
    const fwd = Math.sin(k.yaw) * T[k.idx].x + Math.cos(k.yaw) * T[k.idx].z;
    k.wrongT = fwd < -.3 && k.speed > 3 ? k.wrongT + dt : 0;
  }
  const driftLvl = (t) => t > 3 ? 3 : t > 1.8 ? 2 : t > .8 ? 1 : 0;
  function wallHit(k, vn, s) {
    k.bumpCd = .35; k.walls = (k.walls || 0) + 1;
    const n = L[k.idx];
    for (let j = 0; j < 10; j++) spark(k.x + n.x * s * .9, k.y + .4, k.z + n.z * s * .9, (Math.random() - .5) * 6 - n.x * s * 3, 2 + Math.random() * 3, (Math.random() - .5) * 6 - n.z * s * 3, 'yellow', .25, .4);
    if (k === me) { audio.bonk(); shake = Math.min(.6, vn * .04); }
  }

  function respawnKart(k) {
    const i = (sectorOf(k) * SEG + 3) % N, q = at(i, mid(i));
    k.x = q.x; k.z = q.z; k.idx = i; k.yaw = k.vh = H[i]; k.speed = 0; k.drift = 0; k.spin = 0; k.boost = 0; k.ghost = 1.6; k.inv = 1.6; k.hopV = 5; k.stuck = 0;
    locate(k); k.y = trackY(k); updateProg(k);
  }

  // ---------- bots: a racing line, a speed plan, drifts, items, dodging ----------
  function ai(k, dt) {
    const look = Math.round((5 + Math.max(0, k.speed) * .42) / ds), j = (k.idx + look) % N;
    k.dodge *= 1 - Math.min(1, dt * .8);
    for (const h of hazards) {
      if (h.ty !== 'banane' && h.ty !== 'faux') continue;
      const ahead = ((h.idx - k.idx + N) % N) * ds;
      if (ahead < 3 || ahead > 32) continue;
      const want = LINE[j] + k.lane + k.dodge;
      if (Math.abs(h.lat - want) < 2) k.dodge += (h.lat > want ? -1 : 1) * dt * 10;
    }
    k.dodge = clamp(k.dodge, -5, 5);
    const lat = clamp(LINE[j] + k.lane * Math.min(1, (width(j) - 2) / 4) + k.dodge, Math.min(LO[j] + 1, mid(j)), Math.max(HI[j] - 1, mid(j))), q = at(j, lat);
    const d = wrapA(Math.atan2(q.x - k.x, q.z - k.z) - k.yaw);
    const steer = clamp(d * 2.8, -1, 1);
    const vt = VMAX[(k.idx + 4) % N] * k.skill * k.band * (k.boost > 0 ? 1.3 : 1);
    const thr = Math.abs(d) > 1.6 ? 1 : k.speed < vt ? 1 : k.speed > vt + 2.5 ? -1 : 0;
    const kk = KL[(k.idx + 10) % N], drift = k.drift ? Math.abs(kk) > 1 / 48 && k.speed > 9 : Math.abs(kk) > 1 / 32 && k.speed > 15 && Math.sign(kk) === Math.sign(steer);
    return { thr, steer, drift };
  }
  function aiItems(k, dt) {
    if (!k.item || k.roll > 0) return;
    k.itemT += dt;
    if (k.itemT < 1.2) return;
    const st = standings(), p = st.indexOf(k), ahead = st[p - 1], behind = st[p + 1];
    const gapA = ahead ? (ahead.prog - k.prog) * ds : 1e9, gapB = behind ? (k.prog - behind.prog) * ds : 1e9;
    let go = false;
    if (k.item === 'champi' || k.item === 'triple') go = VMAX[(k.idx + 40) % N] > TOP * .95 && k.speed > 14;
    else if (k.item === 'banane' || k.item === 'faux') go = gapB < 18 || k.itemT > 9;
    else if (k.item === 'verte') go = (gapA < 30 && Math.abs(wrapA(Math.atan2(ahead.x - k.x, ahead.z - k.z) - k.yaw)) < .12) || k.itemT > 12;
    else if (k.item === 'rouge') go = (ahead && !ahead.done) || k.itemT > 10;
    if (go && Math.random() < dt * 3) useItem(k, false);
  }

  // ---------- items ----------
  function rollItem(k) {
    const st = standings(), pf = st.length > 1 ? st.indexOf(k) / (st.length - 1) : 0;
    const table = ODDS[pf < .34 ? 0 : pf < .67 ? 1 : 2];
    let r = Math.random() * Object.values(table).reduce((a, b) => a + b, 0);
    for (const [it, w] of Object.entries(table)) { r -= w; if (r <= 0) return it; }
    return 'champi';
  }
  function useItem(k, back) {
    const it = k.item; if (!it || k.roll > 0) return;
    if (it === 'triple') { if (--k.itemN <= 0) k.item = null; } else k.item = null;
    k.itemT = 0;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    if (it === 'champi' || it === 'triple') { k.boost = Math.max(k.boost, 1.2); k.boostPow = 1.42; k.speed = Math.max(k.speed, 12); if (k === me) audio.charge(); return; }
    let h;
    if (it === 'banane' || it === 'faux') h = { ty: it, x: k.x - fx * 2.3, z: k.z - fz * 2.3, vx: 0, vz: 0 };
    else if (it === 'verte') { const s = back ? -1 : 1, v = (back ? 0 : Math.max(0, k.speed)) + 30; h = { ty: it, x: k.x + fx * 2.4 * s, z: k.z + fz * 2.4 * s, vx: fx * v * s, vz: fz * v * s }; }
    else { const st = standings(), p = st.indexOf(k), tg = st.slice(0, p).reverse().find(o => !o.done); h = { ty: it, x: k.x + fx * 2.4, z: k.z + fz * 2.4, vx: fx * 40, vz: fz * 40, tg: tg ? tg.n : -1 }; }
    h.id = meId + '.' + (hzN++); h.o = k.n; h.src = meId;
    addHazard(h);
    send({ t: 'hz', id: h.id, ty: h.ty, x: r2(h.x), z: r2(h.z), vx: r2(h.vx), vz: r2(h.vz), tg: h.tg ?? -1, o: h.o });
    if (k === me) audio.pop();
  }
  function addHazard(h) {
    if (hazards.some(o => o.id === h.id)) return;
    const o = { idx: nearest(h.x, h.z, karts[h.o]?.idx ?? 0), along: 0, lat: 0, age: 0, bounces: 0, tg: -1, ...h };
    locate(o); o.y = trackY(o);
    o.g = hazardMesh(o.ty, deco.M); o.g.position.set(o.x, o.y, o.z); root.add(o.g);
    hazards.push(o);
    const statics = hazards.filter(q => q.ty === 'banane' || q.ty === 'faux');
    if (statics.length > 24) removeHazard(statics[0].id);
  }
  function removeHazard(id, tell = false) {
    const n = hazards.findIndex(h => h.id === id);
    if (n < 0) return;
    const h = hazards[n]; root.remove(h.g); hazards.splice(n, 1);
    if (tell) send({ t: 'hit', h: id });
    for (let j = 0; j < 8; j++) spark(h.x, h.y + .4, h.z, (Math.random() - .5) * 7, 2 + Math.random() * 4, (Math.random() - .5) * 7, h.ty === 'rouge' ? 'orange' : 'white', .3, .45);
  }
  function stepHazards(dt) {
    for (let n = hazards.length - 1; n >= 0; n--) {
      // a shell can take another hazard with it: the list may have got shorter
      const h = hazards[n]; if (!h) continue;
      h.age += dt;
      if (h.ty === 'verte' || h.ty === 'rouge') {
        if (h.ty === 'rouge') {
          const tk = karts[h.tg], sp = 42;
          let ax, az;
          if (tk && !tk.gone && !tk.parked && Math.hypot(tk.x - h.x, tk.z - h.z) < 22) { ax = tk.x; az = tk.z; }
          else { const q = at(h.idx + 18, LINE[(h.idx + 18) % N] * .5); ax = q.x; az = q.z; }
          const cur = Math.atan2(h.vx, h.vz), want = Math.atan2(ax - h.x, az - h.z), a = cur + clamp(wrapA(want - cur), -5 * dt, 5 * dt);
          h.vx = Math.sin(a) * sp; h.vz = Math.cos(a) * sp;
        }
        h.x += h.vx * dt; h.z += h.vz * dt;
        locate(h);
        const lim = h.lat > 0 ? HI[h.idx] - .45 : -LO[h.idx] - .45;
        if (Math.abs(h.lat) > lim) {
          const s = Math.sign(h.lat), nn = L[h.idx], vn = (h.vx * nn.x + h.vz * nn.z) * s;
          h.x -= nn.x * (Math.abs(h.lat) - lim) * s; h.z -= nn.z * (Math.abs(h.lat) - lim) * s;
          if (vn > 0) { h.vx -= 2 * vn * nn.x * s; h.vz -= 2 * vn * nn.z * s; h.bounces++; }
        }
        h.y = trackY(h);
        h.g.position.set(h.x, h.y, h.z); h.g.rotation.y += dt * 12;
        if (h.age > (h.ty === 'verte' ? 9 : 12) || h.bounces > 7) { removeHazard(h.id); continue; }
        // a shell's own client settles what it runs into on the road
        if (h.src === meId) for (const o of hazards) if (o !== h && (o.x - h.x) ** 2 + (o.z - h.z) ** 2 < 1.4) { removeHazard(o.id, true); removeHazard(h.id, true); break; }
      } else h.g.rotation.y += dt * .6;
    }
  }
  function hitKart(k, ty) {
    if (k.inv > 0) return;
    k.spin = ty === 'banane' ? .9 : 1.15; k.speed *= .25; k.drift = 0; k.hopV = 5.5; k.inv = 2;
    if (k === me) { audio.bonk(); audio.splat(); shake = .5; ui.toast(ty === 'faux' ? 'boîte piégée !' : ty === 'banane' ? 'banane !' : 'touché !', true, 1000); }
  }
  // what your karts (and the host's bots) run into: boxes, pads, hazards, the kart ahead's wake
  function interact(k, dt) {
    for (const [n, b] of deco.boxes.entries()) {
      if (b.off > 0 || (b.x - k.x) ** 2 + (b.z - k.z) ** 2 > 3 || Math.abs(b.y - k.y) > 2) continue;
      b.off = 2.5; b.g.visible = false; send({ t: 'box', b: n });
      for (let j = 0; j < 10; j++) spark(b.x, b.y + 1, b.z, (Math.random() - .5) * 8, Math.random() * 5, (Math.random() - .5) * 8, ['blue', 'orange', 'purple', 'yellow'][j % 4], .3, .5);
      if (!k.item && k.roll <= 0) { k.roll = 1; if (k === me) audio.pickup(2); }
    }
    if (k.roll > 0) { k.roll -= dt; if (k.roll <= 0) { k.item = rollItem(k); k.itemN = k.item === 'triple' ? 3 : 1; k.itemT = 0; if (k === me) { audio.tick(); ui.toast(ITEM_NAMES[k.item], false, 1100); } } }
    k.padCd = Math.max(0, k.padCd - dt);
    for (const p of PADS) {
      const d = (k.idx - p.i + N) % N;
      if (d <= 8 && Math.abs(k.lat - p.c) < 1.8 && k.padCd <= 0) { k.boost = Math.max(k.boost, 1); k.boostPow = 1.4; k.padCd = .6; if (k === me) { audio.charge(); shake = .15; } }
    }
    for (const h of hazards) {
      if (h.o === k.n && h.age < .6) continue;
      const r = h.ty === 'faux' ? 1.3 : h.ty === 'banane' ? 1.1 : 1.25;
      if ((h.x - k.x) ** 2 + (h.z - k.z) ** 2 < r * r && Math.abs(h.y - k.y) < 1.6) { if (k.inv <= 0) hitKart(k, h.ty); removeHazard(h.id, true); break; }
    }
    // slipstream: tucked in behind someone for a while gives a kick
    let tuck = false;
    if (k.speed > 16) for (const o of karts) {
      if (o === k || o.gone || o.parked) continue;
      const gap = (o.prog - k.prog) * ds;
      if (gap > 3 && gap < 14 && Math.abs(o.lat - k.lat) < 1.6) { tuck = true; break; }
    }
    k.slip = tuck ? k.slip + dt : Math.max(0, k.slip - dt * 1.5);
    k.slipOn = k.slip > .4;
    if (k.slip > 2) { k.slip = 0; k.boost = Math.max(k.boost, .8); k.boostPow = 1.3; if (k === me) audio.pop(); }
    if (k.bot && state !== 'count') {
      k.stuck = k.speed < 2 ? k.stuck + dt : 0;
      if (k.stuck > 2.5 || k.wrongT > 2) respawnKart(k);
    }
  }

  // ---------- network ----------
  function flags(k) { return (k.spin > 0 ? 1 : 0) | (k.boost > 0 ? 2 : 0) | (k.drift > 0 ? 4 : 0) | (k.drift < 0 ? 8 : 0) | (k.done ? 16 : 0) | (k.dlvl << 5) | (k.ghost > 0 ? 128 : 0); }
  function sendState() {
    const a = karts.filter(k => k.local && !k.gone).map(k => [k.n, r2(k.x), r2(k.z), Math.round(k.yaw * 1000) / 1000, Math.round(k.speed * 10) / 10, Math.round(k.prog * 10) / 10, flags(k), r2(k.steerV)]);
    if (a.length) send({ t: 's', ts: netStamp(), a });
  }
  function onFx(peerId, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') for (const e of fx.a || []) {
      const k = karts[e[0]];
      if (!k || k.local || k.gone) continue;
      const fl = e[6];
      if (!k.heard) { k.x = e[1]; k.z = e[2]; k.yaw = e[3]; }
      if (!k.trk.push(fx.ts ?? netNow(), [e[1], e[2], e[3], e[4]], peerId)) continue;   // older than what we have
      k.net = { x: e[1], z: e[2], yaw: e[3], speed: e[4], t: clock }; k.prog = e[5]; k.heard = true;
      const d = fl & 4 ? 1 : fl & 8 ? -1 : 0;
      if (d && !k.drift) k.hopV = 3.4;
      k.drift = d; k.dlvl = (fl >> 5) & 3; k.spin = fl & 1 ? .2 : 0; k.boost = fl & 2 ? .2 : 0; k.ghost = fl & 128 ? .2 : 0; k.steerV = e[7];
    }
    else if (fx.t === 'hz') addHazard({ id: fx.id, ty: fx.ty, x: fx.x, z: fx.z, vx: fx.vx, vz: fx.vz, tg: fx.tg, o: fx.o, src: peerId });
    else if (fx.t === 'hit') removeHazard(fx.h);
    else if (fx.t === 'box') { const b = deco.boxes[fx.b]; if (b) { b.off = 2.5; b.g.visible = false; } }
    else if (fx.t === 'fin') { const k = karts[fx.i]; if (k && !k.local) { k.done = true; k.finT = fx.time; } }
    else if (fx.t === 'bye') leave(peerId);
  }
  function leave(id) {
    if (left.has(id)) return;
    left.add(id);
    const k = karts.find(o => o.human && o.id === id);
    if (k) { if (k.done) k.parked = true; else k.gone = true; k.g.visible = false; }
    // whoever is next in line takes the bots over, from where they are on screen
    const owner = [hostId, ...humans.map(h => h.id)].find(h => !left.has(h));
    if (owner !== botOwner) {
      botOwner = owner;
      if (owner === meId) for (const b of karts) if (b.bot && !b.local) { b.local = true; b.vh = b.yaw; b.speed = b.net?.speed ?? b.speed; locate(b); b.passed = Math.floor(b.prog / SEG); updateProg(b); }
    }
  }
  function follow(k, dt) {
    const s = k.trk?.sample(k.smp);
    if (!s) return;
    k.x = s[0]; k.z = s[1]; k.yaw = k.vh = s[2]; k.speed = s[3];
    locate(k); k.y = trackY(k);
    k.hopY += k.hopV * dt; k.hopV -= 24 * dt; if (k.hopY <= 0) { k.hopY = 0; k.hopV = 0; }
    k.spinA = k.spin > 0 ? k.spinA + dt * 14 : 0;
    k.spin = Math.max(0, k.spin - dt * .2); k.boost = Math.max(0, k.boost - dt * .2);
  }

  // ---------- the frame ----------
  function input(keys, dt) {
    const has = (...c) => c.some(x => keys.has(x));
    const thr = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    const want = (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0);
    me.steerIn += clamp(want - me.steerIn, -dt * 7, dt * 7);
    if (!want && Math.abs(me.steerIn) < .05) me.steerIn = 0;
    return { thr, steer: me.steerIn, drift: has('ShiftLeft', 'ShiftRight', 'KeyJ') };
  }
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .1); clock += dt;
    const pressed = (c) => keys.has(c) && !lastKeys.has(c);
    if (state === 'count') {
      const prev = Math.ceil(count); count -= dt;
      if (Math.ceil(count) !== prev && count > 0) audio.tick();
      const lit = Math.min(5, Math.floor((COUNT + .2 - count) / .8));
      deco.lights.forEach((l, n) => l.lamps.forEach(m => { m.material = n < lit ? l.red : l.off; }));
      const thrOn = keys.has('KeyW') || keys.has('ArrowUp');
      if (thrOn && thrFrom === null) thrFrom = count; if (!thrOn) thrFrom = null;
      if (count <= 0) {
        state = 'race'; goT = 0; audio.buy();
        deco.lights.forEach(l => l.lamps.forEach(m => { m.material = l.green; }));
        if (thrFrom !== null && thrFrom < .7) { me.boost = .8; me.boostPow = 1.35; ui.toast('départ canon !', false, 900); }
      }
    } else { goT += dt; if (!me.done) raceT += dt; }
    if (state === 'finished' && !ended) { endT -= dt; if (endT <= 0) { ended = true; onEnd({ place: myPlace, of: present().length, time: me.finT }); return; } }
    const racing = state !== 'count';
    // who's in front of the humans, for the bots' rubber band
    const humanBest = Math.max(...karts.filter(k => k.human && !k.gone && !k.done).map(k => k.prog), -1e9);
    for (const k of karts) if (k.bot) k.band = humanBest > -1e8 ? clamp(1 + (humanBest - k.prog) * ds / 350, .9, 1.12) : 1;
    const mine = racing ? (me.done || auto ? ai(me, dt) : input(keys, dt)) : IDLE;
    if (!racing) input(keys, dt);
    const steps = Math.ceil(dt / (1 / 60)), h = dt / steps;
    for (let s = 0; s < steps; s++) for (const k of karts) {
      if (!k.local || k.gone) continue;
      const inp = !racing ? IDLE : k === me ? (me.done || auto ? ai(me, h) : mine) : ai(k, h);
      k.steerV = inp.steer;
      sim(k, inp, h);
    }
    for (const k of karts) {
      if (k.gone) continue;
      if (k.local) { if (racing) interact(k, dt); if (k.bot || (k === me && auto)) aiItems(k, dt); }
      else follow(k, dt);
    }
    if (racing && !me.done && !auto && (pressed('Space') || pressed('KeyE'))) useItem(me, keys.has('KeyS') || keys.has('ArrowDown'));
    lastKeys = new Set(keys);
    // humans who never showed up drop out
    if (goT > 6) for (const k of karts) if (k.human && !k.me && !k.heard && !k.gone) leave(k.id);
    stepHazards(dt);
    visuals(dt);
    view(dt);
    sendT -= dt; if (sendT <= 0) { sendT = 1 / 15; if (online) sendState(); }
    mmT -= dt; if (mmT <= 0) { mmT = .08; minimap(); }
    engT -= dt; if (engT <= 0) { engT = .05; engine(true, me.speed, me.boost > 0); keepVanAway(); }
  }
  function visuals(dt) {
    for (const b of deco.boxes) {
      b.g.rotation.y += dt * 1.4; b.g.rotation.x = Math.sin(clock * 1.3 + b.ph) * .3;
      b.g.position.y = b.y + 1.1 + Math.sin(clock * 3 + b.ph) * .15;
      if (b.off > 0) { b.off -= dt; if (b.off <= 0) b.g.visible = true; }
    }
    if (deco.padTex) deco.padTex.offset.y = -clock * 1.6;
    if (deco.blimp) { const a = clock * .03 + 1; deco.blimp.position.set(Math.sin(a) * 120, 52, 35 + Math.cos(a) * 70);
      for (const f of deco.flags) f.f.rotation.z = Math.sin(clock * 5 + f.ph) * .5; deco.blimp.rotation.y = a + Math.PI / 2; }
    stepSparks(dt); deco.smoke.update(dt); deco.dust.update(dt);
    for (const k of karts) {
      if (k.gone || k.parked) { k.g.visible = false; continue; }
      k.g.visible = k.ghost > 0 ? Math.floor(clock * 14) % 2 === 0 : true;
      k.body += ((k.drift ? k.drift * .42 : 0) - k.body) * Math.min(1, dt * 7);
      const slope = Math.atan(G[k.idx]) * Math.cos(k.yaw - H[k.idx]);
      k.pitch += (slope - k.pitch) * Math.min(1, dt * 8);
      k.g.position.set(k.x, k.y + k.hopY, k.z);
      k.g.rotation.set(-k.pitch, k.yaw + k.body + k.spinA, 0);
      const sv = k.drift ? -k.drift * .45 + k.steerV * .3 : k.steerV;
      k.anim(dt, k.speed, sv, k.boost > 0 ? 1 : 0);
      // effects only near the camera
      const near = (k.x + KART_ORIGIN.x - camera.position.x) ** 2 + (k.z + KART_ORIGIN.z - camera.position.z) ** 2 < 3600;
      if (!near) continue;
      const cy = Math.cos(k.yaw + k.body), sy = Math.sin(k.yaw + k.body), vx = Math.sin(k.vh) * k.speed, vz = Math.cos(k.vh) * k.speed;
      const rear = (s) => [k.x + cy * .72 * s - sy * .95, k.y + .12, k.z - sy * .72 * s - cy * .95];
      if (k.drift && k.hopY <= 0) {
        const col = ['white', 'blue', 'orange', 'purple'][k.dlvl];
        for (const s of [-1, 1]) if (Math.random() < (k.dlvl ? .9 : .35)) { const [x, y, z] = rear(s); spark(x, y, z, vx * .85 - cy * s * 2 + (Math.random() - .5) * 2, 1 + Math.random() * 2.5, vz * .85 + sy * s * 2 + (Math.random() - .5) * 2, col, k.dlvl ? .24 : .12, .22); }
        if (Math.random() < .18) { const [x, y, z] = rear(-k.drift); deco.smoke.emit(world(x, y, z), new THREE.Vector3(vx * .6, .5, vz * .6), .22, .5); }
      }
      if (Z[k.idx] !== 0 && Math.abs(k.speed) > 8 && Math.random() < .12) { const [x, y, z] = rear(Math.random() < .5 ? -1 : 1); deco.dust.emit(world(x, y, z), new THREE.Vector3(vx * .5, 1, vz * .5), .35, .6); }
      if (k.boost > 0 && Math.random() < .6) { const [x, y, z] = rear(0); spark(x, y + .45, z, vx * .8 - sy * 3, .5, vz * .8 - cy * 3, 'orange', .28, .2); }
      if (k === me && k.slipOn && Math.random() < .7) { const a = Math.random() * Math.PI * 2; spark(k.x + Math.cos(a) * 1.4 + sy * 3, k.y + .8 + Math.sin(a) * .9, k.z - Math.sin(a) * 1.4 + cy * 3, -sy * 25, 0, -cy * 25, 'white', .1, .2); }
    }
  }
  // our own eye: main puts the camera back on the (frozen) walker every frame, so smoothing from
  // camera.position lerped from the walker's head whenever the kart came within 30 m of it
  const eye = new THREE.Vector3();
  let eyeSet = false;
  function view(dt) {
    // settings changed while racing: follow them
    if (Math.abs(camera.fov - fovSet) > .01) baseFov += camera.fov - fovSet;
    const k = me, cw = eye, wx = k.x + KART_ORIGIN.x, wy = k.y + KART_ORIGIN.y, wz = k.z + KART_ORIGIN.z;
    let want, look;
    if (state === 'finished') {
      const a = clock * .35;
      want = new THREE.Vector3(wx + Math.sin(a) * 7.5, wy + 3, wz + Math.cos(a) * 7.5); look = new THREE.Vector3(wx, wy + .8, wz);
    } else {
      camYaw += wrapA((k.spin > 0 ? k.vh : k.yaw + k.body * .45) - camYaw) * Math.min(1, dt * 4.5);
      const dist = 5.6 + clamp(k.speed, 0, 40) * .05, s = Math.sin(camYaw), c = Math.cos(camYaw);
      want = new THREE.Vector3(wx - s * dist, wy + 2.55 + k.hopY * .3, wz - c * dist); look = new THREE.Vector3(wx + s * 4, wy + 1.25, wz + c * 4);
      if (state === 'count') {
        // the grid from the gantry, swinging round behind your kart
        const u = smooth(COUNT - count, .3, 3), q = at(4, mid(4));
        const from = new THREE.Vector3(q.x + T[4].x * 3, 6.2, q.z + T[4].z * 3);
        want.lerpVectors(from, want, u); look.lerpVectors(new THREE.Vector3(wx, wy, wz), look, u);
        cw.copy(want);
      }
    }
    // rigid behind the kart while racing (the heading is smoothed); eased round it at the end
    if (!eyeSet || state !== 'finished' || cw.distanceTo(want) > 30) cw.copy(want);
    else cw.lerp(want, Math.min(1, dt * 2));
    eyeSet = true;
    camClip(wx, wy + 1.3, wz, cw);
    camera.position.copy(cw);
    if (shake > 0) { shake = Math.max(0, shake - dt * 1.5); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake * .6; }
    camera.up.set(0, 1, 0); camera.lookAt(look);
    const target = baseFov + clamp(Math.abs(k.speed) / TOP, 0, 1.3) * 6 + (k.boost > 0 ? 12 : 0);
    fov += (target - fov) * Math.min(1, dt * 4);
    camera.fov = fovSet = fov; camera.updateProjectionMatrix();
  }

  // the camera never goes through a house: pulled in towards the kart if it would
  function camClip(x, y, z, p) {
    if (!grid) return;
    const dx = p.x - x, dy = p.y - y, dz = p.z - z;
    for (let t = .1; t <= 1.001; t += .075) if (grid.inside(x + dx * t, z + dz * t, y + dy * t)) { const u = Math.max(.08, t - .1); p.set(x + dx * u, y + dy * u, z + dz * u); return; }
  }

  // ---------- the end ----------
  function finish() {
    const st = standings();
    myPlace = st.indexOf(me) + 1;
    state = 'finished'; endT = 4.5;
    audio.win();
    ui.toast(myPlace === 1 ? 'victoire !' : `${myPlace}e place !`, false, 3000);
  }
  function stopRace(quiet) {
    if (state !== 'off' && online && !quiet) send({ t: 'bye', d: me?.done ? 1 : 0 });
    state = 'off';
    for (const k of karts) root.remove(k.g);
    for (const h of hazards) root.remove(h.g);
    karts = []; hazards = []; me = null;
    if (deco.sparks) for (const q of deco.sparks) { q.life = 0; q.s.visible = false; }
  }

  // ---------- a small map of the circuit, bottom right ----------
  let mmEl = null, mmBg = null;
  function minimap(make = false) {
    const W = 250, Hh = 118, pad = 10;
    if (make) {
      if (!mmEl) {
        mmEl = document.createElement('canvas'); mmEl.width = W * 2; mmEl.height = Hh * 2;
        mmEl.style.cssText = `position:fixed;right:22px;bottom:22px;width:${W}px;height:${Hh}px;border-radius:16px;background:rgba(26,19,13,.55);box-shadow:0 0 0 3px #fff,0 0 0 7px #1a130d,0 6px 0 7px rgba(0,0,0,.35);pointer-events:none;z-index:5`;
      }
      document.body.appendChild(mmEl);
    }
    if (!mmEl) return;
    const xs = P.map(p => p.x), zs = P.map(p => p.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const sc = Math.min((W - 2 * pad) / (x1 - x0), (Hh - 2 * pad) / (z1 - z0)), ox = (W - (x1 - x0) * sc) / 2, oz = (Hh - (z1 - z0) * sc) / 2;
    const map = (x, z) => [(ox + (x - x0) * sc) * 2, (oz + (z - z0) * sc) * 2];
    if (!mmBg) {
      mmBg = document.createElement('canvas'); mmBg.width = W * 2; mmBg.height = Hh * 2;
      const g = mmBg.getContext('2d'); g.lineJoin = 'round';
      // the village underneath: every house of it
      g.fillStyle = 'rgba(244,239,228,.2)';
      for (const b of plan?.base || []) { if ((b.y1 ?? 0) < 2 || b.x1 - b.x0 < 1.5 || b.z1 - b.z0 < 1.5) continue; const [ax, ay] = map(b.x0, b.z0), [bx, by] = map(b.x1, b.z1); g.fillRect(ax, ay, bx - ax, by - ay); }
      const path = () => { g.beginPath(); P.forEach((p, i) => { const [x, y] = map(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
      path(); g.strokeStyle = '#1a130d'; g.lineWidth = 14; g.stroke();
      path(); g.strokeStyle = '#f4efe4'; g.lineWidth = 8; g.stroke();
      const [sx, sy] = map(P[0].x, P[0].z); g.fillStyle = '#ffb020'; g.fillRect(sx - 3, sy - 9, 6, 18);
    }
    const g = mmEl.getContext('2d');
    g.clearRect(0, 0, W * 2, Hh * 2); g.drawImage(mmBg, 0, 0);
    for (const h of hazards) { const [x, y] = map(h.x, h.z); g.fillStyle = h.ty === 'rouge' ? '#ff3d5e' : h.ty === 'verte' ? '#39c07a' : '#ffd21f'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    for (const k of [...karts].sort((a, b) => a.me - b.me)) {
      if (k.gone || k.parked) continue;
      const [x, y] = map(k.x, k.z);
      g.beginPath(); g.arc(x, y, k.me ? 9 : 7, 0, 7); g.fillStyle = '#' + k.color.toString(16).padStart(6, '0'); g.fill();
      g.lineWidth = k.me ? 4 : 3; g.strokeStyle = k.me ? '#fff' : '#1a130d'; g.stroke();
    }
  }

  // ---------- the engine note: our own little synth ----------
  let eng = null, engSeen = 0, engDog = null;
  function engine(on, speed = 0, boost = false) {
    try {
      if (!eng && on) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const ctx = new AC(), g = ctx.createGain(), f = ctx.createBiquadFilter(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = 700; o1.type = 'sawtooth'; o2.type = 'square';
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(ctx.destination); o1.start(); o2.start();
        eng = { ctx, g, f, o1, o2 };
      }
      if (!eng) return;
      const t = eng.ctx.currentTime;
      if (on) { engSeen = performance.now(); if (!engDog) engDog = setInterval(() => { if (eng && performance.now() - engSeen > 250) eng.g.gain.setTargetAtTime(0, eng.ctx.currentTime, .05); }, 200); }
      else if (engDog) { clearInterval(engDog); engDog = null; }
      if (on && eng.ctx.state === 'suspended') eng.ctx.resume();
      eng.g.gain.setTargetAtTime(on ? .028 * vol : 0, t, .08);
      const hz = 46 + Math.abs(speed) * 3.1 + (boost ? 22 : 0);
      eng.o1.frequency.setTargetAtTime(hz, t, .05); eng.o2.frequency.setTargetAtTime(hz * .503, t, .05);
      eng.f.frequency.setTargetAtTime(380 + Math.abs(speed) * 38, t, .1);
      if (!on) setTimeout(() => { if (state === 'off' && eng) eng.ctx.suspend(); }, 400);
    } catch { /* no sound, no matter */ }
  }

  return {
    start, update, onFx,
    stop() {
      restoreStreets();
      if (state === 'off' && !karts.length) return;
      stopRace(false);
      root.visible = false;
      mmEl?.remove();
      engine(false);
      camera.fov = baseFov; camera.updateProjectionMatrix();
    },
    respawn() { if (me && state !== 'off' && !me.done) respawnKart(me); },
    peerLeft(id) { if (state !== 'off') leave(id); },
    get running() { return state !== 'off'; },
    hud() {
      if (!me) return { count: 0 };
      if (state === 'count') return { count: Math.max(1, Math.ceil(count)) };
      if (goT < .8) return { count: 0 };
      const st = standings();
      const item = me.roll > 0 ? Object.values(ITEM_NAMES)[Math.floor(clock * 14) % 6] + '…' : me.item ? (me.item === 'triple' ? `champi ×${me.itemN}` : ITEM_NAMES[me.item]) : null;
      return { lap: clamp(Math.floor(me.passed / CP) + 1, 1, LAPS), laps: LAPS, place: me.done ? myPlace : st.indexOf(me) + 1, of: st.length, time: me.done ? me.finT : raceT, item, wrong: me.wrongT > 1, board: st.map(k => ({ name: k.name, color: k.color, me: !!k.me })) };
    },
    set onEnd(f) { onEnd = f; },
    // tests: put your kart just before the line on its last lap, or at sample i
    _tp(i, lat = 0) { const q = at(+i, lat); me.x = q.x; me.z = q.z; },
    _warp(i, back = false) {
      if (!me) return;
      const j = i == null ? N - 30 : ((+i % N) + N) % N;
      const lap = i == null ? LAPS - 1 : Math.max(0, Math.floor(me.passed / CP));
      me.passed = lap * CP + Math.floor(j / SEG);
      const q = at(j, 0); me.x = q.x; me.z = q.z; me.idx = j; me.yaw = me.vh = H[j] + (back ? Math.PI : 0); me.speed = back ? 5 : 20; locate(me); me.y = trackY(me); updateProg(me);
    },
    set _auto(v) { auto = !!v; },
    _give(it) { if (me) { me.item = it; me.itemN = it === 'triple' ? 3 : 1; me.roll = 0; } },
    _center() { const xs = P.map(p => p.x), zs = P.map(p => p.z); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }; },
    _stats() { if (!built) build(); return stats; },
    get _track() { return { P, LO, HI, LINE, VMAX, KL, Z, PADS, ROWS }; },
    _dbg() { return me && { state, x: me.x, z: me.z, yaw: me.yaw, walls: me.walls || 0, dl: me.dlvl, boost: r2(me.boost), idx: me.idx, lat: r2(me.lat), passed: me.passed, prog: r2(me.prog), speed: r2(me.speed), place: standings().indexOf(me) + 1, t: r2(raceT), karts: karts.map(k => `${k.name}:${k.passed}/${Math.round(k.prog)}${k.local ? 'L' : 'R'}${k.gone ? 'X' : ''} mt${k.mt || 0} w${k.walls || 0}`).join(' '), haz: hazards.map(h => h.ty + '@' + h.idx + '/' + h.age.toFixed(1)).join(' ') || 0, ...stats }; },
  };
}
