// moto.js, moto-cross: tiny dirt bikes round a stadium oval on the plinth, in the spirit of
// Excitebike. Two straights full of jumps, whoops, mud and cooling arrows, two banked turns,
// four lanes and wooden stands packed with a tiny crowd. Throttle, a turbo that heats the
// engine (too hot: it stalls until it cools), lane changes, and in the air the pitch of the
// bike: land parallel to the slope to keep your speed, badly and you tumble. Touch another
// rider's rear wheel and you go down too. 3 laps. Each client rides its own bike and sends
// its state; the host rides the bots.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from './merge.js';
import { netTrack, netNow, netStamp } from './netlerp.js';
import { rng, hostOf, createChip, fmt, ord, hexOf } from './retro.js';
import { tagTex } from './lib/tex.js';

const LAPS = 3, SEATS = 4, SC = .075, STEP = 1 / 60, MAX_T = 180, CRASH_T = 3;
const PI = Math.PI, TAU = PI * 2;
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
// the oval: two straights of LS along x, two half turns of radius R, W wide in four lanes;
// l is across the track, positive on the rider's right (the outside)
const LS = 2.8, R = 1.2, W = .6, LANE = W / 4, BANK = .2, Y0 = .05, G = 1.8;
const S1 = LS, S2 = LS + PI * R, S3 = 2 * LS + PI * R, LEN = 2 * LS + 2 * PI * R;
const START = .45, TOP = .7, TURBO = .96;
// ramps along the course [s0, s1, h0, h1], whoops [s0, s1, height, period], lane patches [s0, s1, first lane, last lane]
const RAMPS = [
  [.75, .95, 0, .12], [.95, 1.15, .12, .12], [1.15, 1.5, .12, 0],
  [S2 + .25, S2 + .4, 0, .065], [S2 + .4, S2 + .44, .065, 0],
  [S2 + 1.15, S2 + 1.33, 0, .1], [S2 + 1.33, S2 + 1.55, .1, 0],
  [S2 + 1.7, S2 + 1.82, 0, .065], [S2 + 1.82, S2 + 1.95, .065, .065], [S2 + 1.95, S2 + 2.2, .065, 0],
];
const WHOOPS = [[1.98, 2.54, .03, .14]];
const MUD = [[1.62, 1.84, 0, 1], [S2 + .78, S2 + 1, 2, 3], [S2 + 2.36, S2 + 2.56, 1, 1]];
const COOL = [[1.62, 1.8, 3, 3], [S2 + .56, S2 + .72, 0, 1]];
const MODES = [
  { id: 'course', name: 'course', sub: '3 tours contre trois pilotes · atterris à plat, surveille le moteur', help: 'z ou k : gaz · espace : turbo, ça chauffe · q d : couloir · en l\'air z s : pencher la moto, atterris parallèle à la pente', unit: 'time', lower: true },
  { id: 'chrono', name: 'contre-la-montre', sub: 'seul sur la piste, 3 tours · ton meilleur temps', help: '3 tours seul · les flèches refroidissent le moteur · la boue ralentit', unit: 'time', lower: true },
];
const BOTS = [['tonio', 0xe8384f], ['gaby', 0xf2c230], ['rémi', 0x3a8ef0], ['sacha', 0x45c060], ['nina', 0xb05ae0], ['jojo', 0xf08a2a]];

const wrapS = (s) => ((s % LEN) + LEN) % LEN;
const laneC = (n) => -W / 2 + (n + .5) * LANE;
const laneOf = (l) => clamp(Math.floor((l + W / 2) / LANE), 0, 3);
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const inZone = (list, s, lane) => list.some(([a, b, la, lb]) => s >= a && s < b && lane >= la && lane <= lb);
const inList = (list, s) => list.some(([a, b]) => s >= a && s < b);

// where the centre line is at s, which way it runs, and the outward side
const fr = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
function frame(s, o = fr) {
  s = wrapS(s);
  if (s < S1) { o.x = -LS / 2 + s; o.z = R; o.tx = 1; o.tz = 0; o.nx = 0; o.nz = 1; }
  else if (s < S2) { const f = PI / 2 - (s - S1) / R; o.x = LS / 2 + R * Math.cos(f); o.z = R * Math.sin(f); o.tx = Math.sin(f); o.tz = -Math.cos(f); o.nx = Math.cos(f); o.nz = Math.sin(f); }
  else if (s < S3) { o.x = LS / 2 - (s - S2); o.z = -R; o.tx = -1; o.tz = 0; o.nx = 0; o.nz = -1; }
  else { const f = -PI / 2 - (s - S3) / R; o.x = -LS / 2 + R * Math.cos(f); o.z = R * Math.sin(f); o.tx = Math.sin(f); o.tz = -Math.cos(f); o.nx = Math.cos(f); o.nz = Math.sin(f); }
  return o;
}
const inTurn = (s) => { s = wrapS(s); return (s >= S1 && s < S2) || s >= S3; };

// ---------- the dirt: a height table along the course, the banking across it ----------
const NS = Math.ceil(LEN / .005), hTab = new Float32Array(NS + 1);
for (let i = 0; i <= NS; i++) {
  const s = i / NS * LEN;
  let h = 0;
  for (const [a, b, h0, h1] of RAMPS) if (s >= a && s < b) h = h0 + (h1 - h0) * (s - a) / (b - a);
  for (const [a, b, amp, p] of WHOOPS) if (s >= a && s < b) h += amp * Math.sin(PI * (s - a) / p) ** 2;
  hTab[i] = h;
}
function hRaw(s) { const f = wrapS(s) / LEN * NS, i = Math.floor(f); return hTab[i] + (hTab[Math.min(NS, i + 1)] - hTab[i]) * (f - i); }
function bankAt(s) {
  s = wrapS(s);
  const d = s >= S1 && s < S2 ? s - S1 : s >= S3 ? s - S3 : -1;
  return d < 0 ? 0 : BANK * smooth(Math.min(d, PI * R - d), 0, .7);
}
const hAt = (s, l) => Y0 + hRaw(s) + bankAt(s) * (clamp(l, -W / 2, W / 2) + W / 2) / W;
// what the suspension feels: the whoops (half a period apart) cancel out
const hB = (s, l) => (hAt(s - .035, l) + hAt(s + .035, l)) * .5;
const slopeAt = (s) => (hRaw(s + .07) - hRaw(s - .07)) / .14;


// ---------- a dirt bike and its rider, built at full size (2 m, nose to +z), shrunk ----------
let wheelGeos = null;
function wheelParts() {
  if (wheelGeos) return wheelGeos;
  const tyre = new THREE.TorusGeometry(.27, .075, 6, 18); tyre.rotateY(PI / 2);
  const parts = [new THREE.TorusGeometry(.2, .018, 4, 18).rotateY(PI / 2), new THREE.CylinderGeometry(.06, .06, .14, 8).rotateZ(PI / 2)];
  for (let k = 0; k < 3; k++) parts.push(new THREE.BoxGeometry(.02, .4, .02).rotateX(k * PI / 3));
  wheelGeos = { tyre, hub: mergeGeometries(parts) };
  return wheelGeos;
}
function bikeModel(color, pants) {
  const bike = new THREE.Group(), body = new THREE.Group(); bike.add(body);
  const paint = V.mat(color, { roughness: .35 }), white = V.mat(0xf2f0ea, { roughness: .4 }), dark = V.TRIM(), chrome = V.CHROME();
  const put = (geo, m, x, y, z, rx = 0, p = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; p.add(o); return o; };
  const { tyre, hub } = wheelParts();
  const wheels = [];
  for (const z of [-.72, .72]) {
    const w = new THREE.Group(); w.position.set(0, .34, z); w.userData.keep = true; body.add(w);
    w.add(new THREE.Mesh(tyre, V.RUBBER()), new THREE.Mesh(hub, chrome));
    wheels.push(w);
  }
  put(new THREE.BoxGeometry(.28, .3, .38), dark, 0, .5, -.02);
  put(new THREE.BoxGeometry(.24, .14, .2), chrome, 0, .72, .12, .3);
  put(V.roundBox(.4, .22, .5, .08), paint, 0, .92, .2, .12);
  put(V.roundBox(.5, .26, .2, .06), paint, 0, .8, .38);
  put(V.roundBox(.24, .1, .8, .04), dark, 0, 1, -.34, -.05);
  put(V.roundBox(.22, .06, .62, .03), paint, 0, .98, -.84, .25);
  put(V.roundBox(.18, .04, .5, .02), white, 0, .74, .82, -.1);
  put(V.roundBox(.34, .28, .04, .02), white, 0, 1.1, .56, -.35);
  for (const s of [-1, 1]) {
    put(new THREE.CylinderGeometry(.035, .035, .75, 6), chrome, s * .1, .68, .62, -.29);
    put(new THREE.BoxGeometry(.05, .06, .62), dark, s * .12, .42, -.42, -.26);
  }
  const bar = put(new THREE.CylinderGeometry(.025, .025, .8, 6), dark, 0, 1.12, .48); bar.rotation.z = PI / 2;
  put(new THREE.CylinderGeometry(.045, .05, .6, 8), chrome, -.17, .78, -.6, PI / 2 - .2);
  mergeStatic(body, (o) => o.userData.keep);
  bike.scale.setScalar(SC);
  // the rider, standing on the pegs
  const rider = new THREE.Group(), jersey = V.mat(color, { roughness: .75 }), trou = V.mat(pants, { roughness: .8 });
  const put2 = (geo, m, x, y, z, rx = 0) => put(geo, m, x, y, z, rx, rider);
  for (const s of [-1, 1]) {
    put2(V.roundBox(.12, .22, .28, .05), dark, s * .2, .5, 0);
    put2(V.roundBox(.13, .42, .14, .05), trou, s * .2, .72, .1, .45);
    put2(V.roundBox(.15, .44, .16, .06), trou, s * .17, 1.02, -.03, -1.25);
    put2(V.roundBox(.12, .5, .12, .05), jersey, s * .27, 1.35, .28, -.72);
    put2(new THREE.BoxGeometry(.1, .1, .1), dark, s * .33, 1.12, .48);
  }
  put2(V.roundBox(.46, .62, .28, .1), jersey, 0, 1.35, -.08, .61);
  const helm = put2(new THREE.SphereGeometry(.19, 12, 10), paint, 0, 1.78, .22); helm.scale.z = 1.15;
  put2(V.roundBox(.3, .03, .2, .01), white, 0, 1.9, .38, .2);
  put2(new THREE.BoxGeometry(.26, .08, .05), V.glass(), 0, 1.8, .42);
  put2(V.roundBox(.2, .12, .14, .04), paint, 0, 1.64, .4);
  mergeStatic(rider);
  rider.scale.setScalar(SC);
  return { bike, body, wheels, rider };
}

export function createMoto({ scene, camera, audio, ui, at }) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);

  // ---------- the stadium (static, merged) ----------
  const deco = new THREE.Group(); root.add(deco);
  const add = (geo, m, x, y, z, ry = 0, p = deco) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; p.add(o); return o; };
  // the floor: packed earth, a grass infield
  add(new THREE.BoxGeometry(6.36, .03, 6.36), V.mat(0x8a7556, { roughness: .95 }), 0, .015, 0);
  {
    const sh = new THREE.Shape(), r = R - W / 2 - .04;
    sh.moveTo(-LS / 2, -r); sh.lineTo(LS / 2, -r); sh.absarc(LS / 2, 0, r, -PI / 2, PI / 2, false); sh.lineTo(-LS / 2, r); sh.absarc(-LS / 2, 0, r, PI / 2, PI * 1.5, false);
    add(new THREE.ShapeGeometry(sh, 24).rotateX(-PI / 2), V.mat(0x5a8a3a, { roughness: .95 }), 0, .034, 0);
  }
  // the track surface: a grid following the dirt, painted with ruts, skirts down to the floor
  {
    const rows = Math.round(LEN / .02), cols = 16, pos = [], col = [], idx = [];
    const base = new THREE.Color(0x96603a), c = new THREE.Color();
    for (let r = 0; r <= rows; r++) {
      const s = r / rows * LEN, sl = slopeAt(s);
      frame(s);
      for (let k = 0; k <= cols; k++) {
        const l = -W / 2 + k / cols * W;
        pos.push(fr.x + fr.nx * l, hAt(s, l), fr.z + fr.nz * l);
        const rut = k % 4 === 2 ? -.05 : 0, n = (hash(r * .7, k * 1.3) - .5) * .07;
        c.copy(base).offsetHSL(0, n * .3, n + rut + (sl > .1 ? .06 : sl < -.1 ? -.03 : 0) + bankAt(s) * .2);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const a = r * (cols + 1) + k, b = a + cols + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    // skirts on both edges
    c.copy(base).offsetHSL(0, 0, -.12);
    for (const k of [0, cols]) {
      const o = pos.length / 3, l = -W / 2 + k / cols * W;
      for (let r = 0; r <= rows; r++) {
        const s = r / rows * LEN; frame(s);
        const x = fr.x + fr.nx * l, z = fr.z + fr.nz * l;
        pos.push(x, hAt(s, l), z, x, .03, z); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      for (let r = 0; r < rows; r++) { const a = o + r * 2, b = a + 2; if (k) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
    m.receiveShadow = true; m.userData.keep = true; root.add(m);
  }
  // a strip lying on the dirt at l, w wide, from s0 to s1 (uv: u across, v along, vr repeats)
  function strip(l, w, s0, s1, lift = .002, vr = 1) {
    const n = Math.max(2, Math.ceil((s1 - s0) / .02)), pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * i / n; frame(s);
      for (const e of [-1, 1]) { const ll = l + e * w / 2; pos.push(fr.x + fr.nx * ll, hAt(s, ll) + lift, fr.z + fr.nz * ll); uv.push((e + 1) / 2, i / n * vr); }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const chalk = V.mat(0xf4f0e4, { roughness: .8 });
  for (const l of [-LANE, 0, LANE]) add(strip(l, .008, 0, LEN), chalk, 0, 0, 0);
  for (const l of [-W / 2 + .008, W / 2 - .008]) add(strip(l, .014, 0, LEN), chalk, 0, 0, 0);
  const mudMat = V.mat(0x3a2414, { roughness: .18, metalness: .1 });
  for (const [a, b, la, lb] of MUD) {
    add(strip((laneC(la) + laneC(lb)) / 2, (lb - la + 1) * LANE - .02, a, b, .004), mudMat, 0, 0, 0);
    for (let k = 0; k < 6; k++) {
      const s = a + hash(a, k) * (b - a), l = laneC(la) + (hash(k, a) - .5) * (lb - la + 1) * LANE; frame(s);
      const blob = add(new THREE.SphereGeometry(.022, 8, 5), mudMat, fr.x + fr.nx * l, hAt(s, l) + .002, fr.z + fr.nz * l); blob.scale.y = .3;
    }
  }
  const arrowTex = V.paintTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64); g.fillStyle = '#ffd21f';
    g.beginPath(); g.moveTo(8, 50); g.lineTo(32, 18); g.lineTo(56, 50); g.lineTo(44, 50); g.lineTo(32, 34); g.lineTo(20, 50); g.closePath(); g.fill();
  });
  arrowTex.wrapT = THREE.RepeatWrapping;
  const arrowMat = new THREE.MeshStandardMaterial({ map: arrowTex, alphaTest: .5, emissive: 0x806000, emissiveMap: arrowTex, roughness: .6 });
  for (const [a, b, la, lb] of COOL) for (let n = la; n <= lb; n++) add(strip(laneC(n), LANE * .8, a, b, .004, (b - a) / (LANE * .8)), arrowMat, 0, 0, 0);
  const checkTex = V.paintTex(64, 16, (g) => { for (let k = 0; k < 16; k++) for (let j = 0; j < 4; j++) { g.fillStyle = (k + j) % 2 ? '#1a1a1a' : '#f6f2ea'; g.fillRect(k * 4, j * 4, 4, 4); } });
  checkTex.magFilter = THREE.NearestFilter;
  {
    // the finish line runs across: a strip along s, textured sideways
    const g = strip(0, W, START - .02, START + .02, .003);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * 4);
    add(g, new THREE.MeshStandardMaterial({ map: checkTex, roughness: .7 }), 0, 0, 0);
  }
  // tyre walls round the turns, hay bales along the straights, a red and white rail inside
  const tyreGeo = new THREE.TorusGeometry(.03, .014, 5, 10); tyreGeo.rotateX(PI / 2);
  const rubber = V.mat(0x1d1c20, { roughness: .9 }), hay = V.mat(0xd9b562, { roughness: 1 });
  const flagCols = [0xe8384f, 0xf2c230, 0x3a8ef0, 0xf6f2ea, 0x45c060];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -.07, 0), new THREE.Vector3(.1, -.035, 0)]); flagGeo.computeVertexNormals();
  const pole = new THREE.CylinderGeometry(.005, .006, .42, 5);
  let nf = 0;
  for (const [s0, s1] of [[S1, S2], [S3, LEN]]) {
    for (let s = s0; s < s1; s += .075) {
      frame(s); const l = W / 2 + .05, y = hAt(s, W / 2);
      for (let k = 0; k < 3; k++) add(tyreGeo, rubber, fr.x + fr.nx * l, y - .005 + k * .026, fr.z + fr.nz * l);
    }
    for (let s = s0 + .3; s < s1; s += .62) {
      frame(s); const l = W / 2 + .13, x = fr.x + fr.nx * l, z = fr.z + fr.nz * l, y = hAt(s, W / 2);
      add(pole, V.mat(0xdedad0), x, y + .2, z);
      const f = add(flagGeo, V.mat(flagCols[nf++ % flagCols.length], { side: THREE.DoubleSide, roughness: .8 }), x, y + .41, z, Math.atan2(fr.tx, fr.tz) + PI / 2);
      f.rotation.z = .1;
    }
  }
  const baleGeo = V.roundBox(.14, .055, .08, .015);
  for (const [s0, s1] of [[0, S1], [S2, S3]]) {
    for (let s = s0 + .12; s < s1 - .05; s += .16) {
      if (Math.abs(s - START) < .14) continue;
      frame(s); const l = W / 2 + .06;
      add(baleGeo, hay, fr.x + fr.nx * l, hAt(s, W / 2) + .02, fr.z + fr.nz * l, Math.atan2(fr.tx, fr.tz) + PI / 2);
    }
  }
  const railGeo = new THREE.BoxGeometry(.012, .04, .2);
  for (let s = 0, n = 0; s < LEN; s += .2, n++) {
    frame(s + .1); const l = -W / 2 - .03;
    add(railGeo, V.mat(n % 2 ? 0xe8384f : 0xf6f2ea, { roughness: .6 }), fr.x + fr.nx * l, Y0 + .02, fr.z + fr.nz * l, Math.atan2(fr.tx, fr.tz));
  }
  // the grandstands, one along each straight, their tiers packed with a tiny crowd
  const people = [];
  const wood = [V.mat(0xa8784a, { roughness: .85 }), V.mat(0x93663c, { roughness: .85 })], steel = V.mat(0x4a4e58, { roughness: .6, metalness: .3 });
  const banTex = V.paintTex(2048, 64, (g, w, h) => {
    const ads = [['#e8384f', 'PNEUS TAUPE'], ['#1a3a78', 'HUILE DU TERRIER'], ['#f2c230', 'MOTO-CROSS'], ['#2a8a4a', 'CASQUES LOUPIOT'], ['#f08a2a', 'BOUGIES ÉCLAIR']];
    ads.forEach(([c, t], i) => {
      const x = i * w / ads.length; g.fillStyle = c; g.fillRect(x, 0, w / ads.length, h);
      g.fillStyle = c === '#f2c230' ? '#1a1a1a' : '#fff'; g.font = '900 30px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + w / ads.length / 2, h / 2 + 2);
    });
  });
  const banMat = new THREE.MeshStandardMaterial({ map: banTex, roughness: .7 });
  const roofMat = V.mat(0xc8402a, { roughness: .7, side: THREE.DoubleSide });
  const ROWS = 11, RISE = .045, DEP = .12, Z0 = 1.78, HALF = 2.1;
  for (const sg of [1, -1]) {
    for (let i = 0; i < ROWS; i++) {
      const h = (i + 1) * RISE;
      add(new THREE.BoxGeometry(HALF * 2, h, DEP), wood[i % 2], 0, .03 + h / 2, sg * (Z0 + i * DEP + DEP / 2));
      for (let x = -HALF + .05; x < HALF - .03; x += .064) if (hash(x * 9 + sg, i) < .8) people.push([x + (hash(i, x) - .5) * .02, .03 + h, sg * (Z0 + i * DEP + DEP * .45), hash(x, i * 3 + sg)]);
    }
    const back = sg * (Z0 + ROWS * DEP);
    for (const x of [-HALF, HALF]) {
      const side = new THREE.Shape(); side.moveTo(0, 0); side.lineTo(ROWS * DEP, 0); side.lineTo(ROWS * DEP, ROWS * RISE + .03); side.lineTo(0, RISE + .03); side.closePath();
      const g = new THREE.ExtrudeGeometry(side, { depth: .03, bevelEnabled: false }); g.rotateY(-PI / 2 * sg);
      add(g, steel, x + (sg > 0 ? .015 : -.015) * (x > 0 ? 1 : -1) * sg, .03, sg * Z0);
    }
    add(new THREE.BoxGeometry(HALF * 2 + .06, .1, .03), steel, 0, .08, sg * (Z0 - .03));
    add(new THREE.PlaneGeometry(HALF * 2, .08), banMat, 0, .085, sg * (Z0 - .047), sg > 0 ? PI : 0);
    // the roof over the back rows, on thin posts
    const rz0 = sg * (Z0 + 5 * DEP), rz1 = back;
    for (let x = -HALF + .05; x <= HALF; x += 1.03) {
      add(new THREE.CylinderGeometry(.012, .012, .98, 5), steel, x, .03 + .49, rz1);
      const fy = .03 + 6 * RISE; add(new THREE.CylinderGeometry(.01, .01, .9 - fy, 5), steel, x, fy + (.9 - fy) / 2, rz0);
    }
    const roof = add(new THREE.BoxGeometry(HALF * 2 + .1, .015, Math.abs(rz1 - rz0) + .12), roofMat, 0, .95, (rz0 + rz1) / 2);
    roof.rotation.x = sg * -.05;
    add(new THREE.BoxGeometry(HALF * 2 + .1, .1, .015), V.mat(0xf6f2ea, { roughness: .7 }), 0, .92, rz0 - sg * .06);
  }
  // light towers in the corners
  for (const [x, z] of [[2.85, 2.7], [-2.85, 2.7], [2.85, -2.7], [-2.85, -2.7]]) {
    add(new THREE.CylinderGeometry(.025, .04, 2.2, 6), steel, x, 1.13, z);
    const head = new THREE.Group(); head.position.set(x, 2.25, z); head.lookAt(0, 2.25, 0); deco.add(head);
    add(new THREE.BoxGeometry(.42, .26, .05), steel, 0, 0, 0, 0, head);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) add(new THREE.CircleGeometry(.05, 10), V.lamp(0xfff2d8, 3.2), -.13 + a * .13, -.06 + b * .12, .03, 0, head);
  }
  // in the infield: the judges' tower by the line, tents, tyre stacks
  {
    const tx = -LS / 2 + START, tz = .12;
    for (const [dx, dz] of [[-.1, -.1], [.1, -.1], [-.1, .1], [.1, .1]]) add(new THREE.CylinderGeometry(.01, .01, .3, 5), steel, tx + dx, .18, tz + dz);
    add(new THREE.BoxGeometry(.28, .2, .26), V.mat(0xf6f2ea, { roughness: .6 }), tx, .43, tz);
    add(new THREE.BoxGeometry(.3, .06, .02), V.glass(), tx, .46, tz + .13);
    add(new THREE.BoxGeometry(.34, .03, .32), V.mat(0x1a3a78, { roughness: .6 }), tx, .545, tz);
    for (const [x, c] of [[.1, 0xe8384f], [.5, 0x3a8ef0], [-.5, 0xf2c230]]) {
      add(new THREE.ConeGeometry(.16, .16, 4), V.mat(c, { roughness: .8 }), x, .12, -.2, PI / 4);
      add(new THREE.BoxGeometry(.22, .06, .22), V.mat(0xf6f2ea, { roughness: .8 }), x, .065, -.2, 0);
    }
    for (const [x, z] of [[-.2, .25], [1.4, .1], [-1.45, -.15]]) for (let k = 0; k < 4; k++) add(tyreGeo, rubber, x, .045 + k * .026, z);
  }
  // the scoreboard, a double face on two legs in the middle of the infield
  const boardCv = document.createElement('canvas'); boardCv.width = 512; boardCv.height = 200;
  const boardTex = new THREE.CanvasTexture(boardCv); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, color: new THREE.Color(1.15, 1.15, 1.15) });
  for (const x of [-.55, .55]) add(new THREE.BoxGeometry(.05, .8, .05), steel, x, .43, 0);
  add(new THREE.BoxGeometry(1.44, .6, .06), steel, 0, 1.05, 0);
  for (const sg of [1, -1]) { const f = add(new THREE.PlaneGeometry(1.36, .53), boardMat, 0, 1.05, sg * .032, sg > 0 ? 0 : PI); f.userData.keep = true; }
  function drawBoard(list, lap) {
    const g = boardCv.getContext('2d'), w = 512, h = 200;
    g.fillStyle = '#12141c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c230'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.textBaseline = 'middle'; g.textAlign = 'center';
    if (!list) {
      g.fillStyle = '#f2c230'; g.font = '900 64px Rubik, sans-serif'; g.fillText('MOTO-CROSS', w / 2, 78);
      g.fillStyle = '#f6f2ea'; g.font = '600 28px Rubik, sans-serif'; g.fillText('3 tours · 4 pilotes · gaz !', w / 2, 142);
    } else {
      g.fillStyle = '#f2c230'; g.font = '800 26px Rubik, sans-serif'; g.fillText(lap, w / 2, 30);
      g.textAlign = 'left'; g.font = '700 30px Rubik, sans-serif';
      list.slice(0, 4).forEach((c, i) => {
        const x = i % 2 ? 270 : 30, y = 90 + Math.floor(i / 2) * 60;
        g.fillStyle = hexOf(c.color); g.fillRect(x, y - 16, 10, 32);
        g.fillStyle = '#f6f2ea'; g.fillText(`${i + 1}. ${c.name.slice(0, 9)}`, x + 20, y);
      });
    }
    boardTex.needsUpdate = true;
  }
  drawBoard(null);
  // the start gate: posts, a beam with three lamps, a gate plate per lane that drops at the start
  const gate = new THREE.Group(), plates = [], lamps = [];
  {
    const s = START - .07; frame(s);
    const yaw = Math.atan2(fr.tx, fr.tz), px = (l) => fr.x + fr.nx * l, pz = (l) => fr.z + fr.nz * l, y = hAt(s, 0);
    for (const l of [-W / 2 - .03, W / 2 + .03]) add(new THREE.BoxGeometry(.025, .3, .025), steel, px(l), y + .15, pz(l));
    const beam = add(new THREE.BoxGeometry(.025, .05, W + .1), V.mat(0xf6f2ea, { roughness: .6 }), px(0), y + .3, pz(0), yaw + PI / 2);
    beam.rotation.order = 'YXZ';
    add(new THREE.BoxGeometry(.02, .015, W), steel, px(0), y + .004, pz(0), yaw + PI / 2);
    gate.position.set(px(0), y, pz(0)); gate.rotation.y = yaw; root.add(gate);
    for (let n = 0; n < 4; n++) {
      const p = new THREE.Group(); p.position.set(-laneC(n), 0, .008); gate.add(p);
      const m = new THREE.Mesh(new THREE.BoxGeometry(LANE * .86, .05, .006), V.mat(0xc8c8c8, { roughness: .4, metalness: .5 })); m.position.y = .025; p.add(m);
      plates.push(p);
    }
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0x301010 }));
      m.position.set((k - 1) * .05, .3, -.018); gate.add(m); lamps.push(m);
    }
  }
  mergeStatic(deco, (o) => o.userData.keep);
  // the crowd: bodies and heads, instanced
  const crowdN = people.length;
  const bodies = new THREE.InstancedMesh(V.roundBox(.05, .06, .04, .012), new THREE.MeshStandardMaterial({ roughness: .8 }), crowdN);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.017, 8, 6), new THREE.MeshStandardMaterial({ roughness: .7 }), crowdN);
  const shirts = [0xe8384f, 0xf2c230, 0x3a8ef0, 0xf6f2ea, 0x45c060, 0xb05ae0, 0xf08a2a, 0x2a2e3a, 0x88c8e8], skins = [0xf0c8a0, 0xd8a078, 0xa06a48, 0x6a4430, 0xf4d8b8];
  const dm = new THREE.Object3D(), tc = new THREE.Color();
  function crowd(t, cheer) {
    for (let n = 0; n < crowdN; n++) {
      const [x, y, z, r] = people[n], hop = cheer ? Math.max(0, Math.sin(t * (7 + r * 4) + r * 40)) * .014 * cheer : 0;
      dm.position.set(x, y + .03 + hop, z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); bodies.setMatrixAt(n, dm.matrix);
      dm.position.y = y + .078 + hop; dm.updateMatrix(); heads.setMatrixAt(n, dm.matrix);
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }
  for (let n = 0; n < crowdN; n++) {
    const r = people[n][3];
    bodies.setColorAt(n, tc.setHex(shirts[Math.floor(r * 97) % shirts.length]));
    heads.setColorAt(n, tc.setHex(skins[Math.floor(r * 53) % skins.length]));
  }
  crowd(0, 0);
  bodies.castShadow = false; root.add(bodies, heads);

  // ---------- dirt, mud and smoke: instanced clumps ----------
  const PMAX = 360;
  const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), PMAX);
  pMesh.frustumCulled = false; pMesh.visible = false; root.add(pMesh);
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0 }));
  for (let n = 0; n < PMAX; n++) pMesh.setColorAt(n, tc.setHex(0x8a5a36));
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, s, life, color, g = 2.5) {
    const p = parts[pNext]; pMesh.setColorAt(pNext, tc.setHex(color)); pMesh.instanceColor.needsUpdate = true;
    pNext = (pNext + 1) % PMAX;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.life = p.max = life; p.g = g;
  }
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) {
        p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < Y0) { p.y = Y0; p.vy = 0; p.vx *= .8; p.vz *= .8; }
      }
      const k = p.life > 0 ? p.life / p.max : 0;
      dm.position.set(p.x, p.y, p.z); dm.rotation.set(n, n * 2, 0); dm.scale.setScalar(p.s * (k > 0 ? (p.g < 0 ? 1.5 - k * .8 : .5 + k * .5) : 0)); dm.updateMatrix();
      pMesh.setMatrixAt(n, dm.matrix);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- sound: a chip for the effects, a buzzing engine for you ----------
  const chip = createChip(.1);
  let eng = null;
  function engineOn() {
    const ctx = chip.ctx; if (!ctx || eng) return;
    try {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0; g2.gain.value = .35;
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(ctx.destination); o1.start(); o2.start();
      eng = { o1, o2, g, ctx };
    } catch { eng = null; }
  }
  function engineTick(c) {
    if (!eng) return;
    const t = eng.ctx.currentTime, idle = c.crash || c.hot > 0 || state !== 'race';
    const f = idle ? 38 : 42 + c.v * 120 + (c.turbo ? 22 : 0) + (c.air ? 35 : 0) + Math.sin(clock * 50) * 2;
    eng.o1.frequency.setTargetAtTime(f, t, .04); eng.o2.frequency.setTargetAtTime(f * 1.01, t, .04);
    eng.g.gain.setTargetAtTime(idle ? .012 : .02 + (c.thr ? .018 : 0), t, .06);
  }

  // ---------- riders ----------
  const dyn = new THREE.Group(); root.add(dyn);
  let riders = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'course', count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, boardT = 0, crowdT = 0, result = null, ended = false, acc = 0, shake = 0, auto = false, lastCount = 0;
  const byKey = (k) => riders.find(c => c.key === k);
  const mine = (c) => c && (c.key === meId || (isHost && c.bot));
  function makeRider(key, name, color, bot) {
    const m = bikeModel(color, new THREE.Color(color).lerp(new THREE.Color(0xf6f2ea), .55).getHex());
    dyn.add(m.bike, m.rider);
    const shadow = V.contactShadow(.08, .17, .5); dyn.add(shadow);
    let tag = null;
    if (key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false })); tag.scale.set(.2, .05, 1); dyn.add(tag); }
    return { key, name, color, bot, m, tag, shadow, s: 0, l: 0, y: Y0, vy: 0, v: 0, pitch: 0, air: false, airT: 0, heat: 0, hot: 0, crash: null, wob: 0,
      thr: 0, turbo: false, lat: 0, roll: 0, done: false, time: 0, laps: 0, skill: 1, hotLim: .7, rest: false, err: 0, want: 0, thinkT: 0, dirtT: 0, net: null, seen: 0, inMud: false };
  }
  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    if (state === 'off') camFov = camera.fov;
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'course';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    const rnd = rng(seed);
    state = 'count'; count = 3.5; lastCount = 4; clock = 0; goAt = 0; endT = -1; sendT = 0; boardT = 0; crowdT = 0; result = null; ended = false; acc = 0; shake = 0;
    const list = humans.slice(0, SEATS).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false }));
    if (mode === 'course') {
      const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
      for (let n = 0; list.length < SEATS; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    }
    riders = list.map((u, n) => {
      const c = makeRider(u.key, u.name, u.color, u.bot);
      c.s = START - .15; c.l = laneC(n); c.want = n; c.y = hB(c.s, c.l); c.pitch = 0;
      c.skill = .93 + rnd() * .06; c.hotLim = .55 + rnd() * .5;
      return c;
    });
    me = byKey(meId);
    for (const p of plates) p.rotation.x = 0;
    for (const m of lamps) m.material.color.setHex(0x301010);
    pMesh.visible = true;
    chip.init(); engineOn();
    camInit = true;
    update(0, new Set());
  }
  function stopDyn() {
    for (const c of riders) { dyn.remove(c.m.bike, c.m.rider, c.shadow); if (c.tag) dyn.remove(c.tag); }
    riders = []; me = null;
    for (const p of parts) p.life = 0;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    pMesh.visible = false;
    for (const p of plates) p.rotation.x = 0;
    for (const m of lamps) m.material.color.setHex(0x301010);
    drawBoard(null); crowd(0, 0);
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close(); eng = null;
  }

  // ---------- the ride ----------
  function crash(c) {
    c.crash = { s: c.s, l: c.l, v: Math.max(c.v, .3), t: 0 };
    c.air = false; c.v = 0; c.vy = 0;
    frame(c.s);
    const x = fr.x + fr.nx * c.l, z = fr.z + fr.nz * c.l;
    for (let k = 0; k < 14; k++) emit(x, c.y + .01, z, (Math.random() - .5) * .5, .3 + Math.random() * .5, (Math.random() - .5) * .5, .006 + Math.random() * .006, .7, 0x9a7048);
    if (c === me) { chip.noise(.45, { vol: .45, f: 900 }); chip.tone(320, 70, .45, { type: 'tri', vol: .35 }); shake = .06; ui.toast('chute !', true, 900); }
  }
  function land(c) {
    const sl = Math.atan(slopeAt(c.s)), d = Math.abs(c.pitch - sl), hard = Math.min(1, -c.vy / .9);
    c.air = false;
    if (c.airT > .16 && d > .62) { crash(c); return; }
    if (c.airT > .16 && d > .3) { c.v *= .55; c.wob = .7; if (c === me) { chip.noise(.2, { vol: .35, f: 500 }); shake = .03; } }
    else { c.v *= d < .15 && sl < -.12 ? 1.04 : .97; if (c === me) { chip.noise(.1, { vol: .2 + hard * .2, f: 380 }); shake = Math.max(shake, hard * .02); } }
    c.pitch = sl; c.vy = c.v * slopeAt(c.s);
    frame(c.s);
    const x = fr.x + fr.nx * c.l, z = fr.z + fr.nz * c.l;
    for (let k = 0; k < 4 + hard * 8; k++) { const a = Math.random() * TAU; emit(x, c.y, z, Math.cos(a) * .3, .15 + Math.random() * .2, Math.sin(a) * .3, .005, .45, 0xb08a60); }
  }
  function stepRider(c, inp, dt) {
    if (c.crash) { stepCrash(c, dt); return; }
    const sw = wrapS(c.s), lane = laneOf(c.l);
    const mud = !c.air && inZone(MUD, sw, lane), cool = !c.air && inZone(COOL, sw, lane);
    c.inMud = mud;
    // the engine: the turbo heats it, the arrows cool it, too hot and it stalls
    c.turbo = !!inp.turbo && c.hot <= 0; c.thr = c.hot > 0 ? 0 : inp.turbo ? 1 : inp.thr;
    if (c.hot > 0) { c.hot -= dt; c.heat = Math.max(.35, c.heat - dt * .3); }
    else {
      c.heat = clamp(c.heat + (c.turbo && !c.air ? .24 : -.09) * dt, 0, 1);
      if (cool && c.heat > 0) { if (c === me && c.heat > .08) chip.tone(1200, 1900, .14, { type: 'sine', vol: .25 }); c.heat = 0; }
      if (c.heat >= 1) { c.hot = 2.4; c.hotLim = .55 + Math.random() * .5; if (c === me) { chip.tone(190, 110, .6, { type: .5, vol: .3 }); ui.toast('surchauffe ! le moteur refroidit', true, 1400); } }
    }
    if (!c.air) {
      const top = (c.turbo ? TURBO : TOP) * (mud ? .42 : 1) * (c.bot ? c.skill : 1);
      if (c.thr) c.v += (c.turbo ? 1.5 : 1.15) * Math.max(0, 1 - c.v / top) * dt;
      if (c.v > top) c.v -= (c.v - top) * (mud ? 5 : 1.3) * dt;
      if (!c.thr) c.v -= (.22 + c.v * .5) * dt;
      if (inp.brake) c.v -= 1.6 * dt;
      if (inList(WHOOPS, sw)) c.v -= c.v * .8 * dt;
      c.v -= slopeAt(c.s) * .6 * dt;
      c.v = clamp(c.v, 0, 1.2);
      c.l = clamp(c.l + inp.lat * .32 * Math.min(1, c.v / .2) * dt, -W / 2 + .04, W / 2 - .04);
      c.lat = inp.lat;
    }
    c.wob = Math.max(0, c.wob - dt);
    c.s += c.v * (inTurn(c.s) ? R / (R + c.l * .5) : 1) * dt;
    const surf = hB(c.s, c.l);
    if (!c.air) {
      // off a lip faster than the dirt falls away: take off
      const yb = c.y + c.vy * dt - .5 * G * dt * dt;
      if (surf < yb - .0015 && c.v > .28 && !inTurn(c.s)) {
        c.air = true; c.airT = 0; c.y = yb; c.vy -= G * dt;
        if (c.bot) c.err = Math.random() < .12 ? (Math.random() < .5 ? -1 : 1) * (.7 + Math.random() * .3) : (Math.random() - .5) * .2;
      } else { c.vy = (surf - c.y) / dt; c.y = surf; c.pitch += (Math.atan(slopeAt(c.s)) - c.pitch) * Math.min(1, dt * 20); }
    } else {
      c.airT += dt; c.vy -= G * dt; c.y += c.vy * dt;
      // the rider's lean turns the bike; left alone it drifts slowly toward the way it flies
      c.pitch += (inp.pitch * 2.3 + (Math.atan2(c.vy, c.v) - c.pitch) * .5) * dt;
      if (c.y <= surf) { c.y = surf; land(c); }
    }
  }
  // the fall: the bike slides and tumbles, the rider flies on, gets up and runs back
  const bikeD = (k) => k.v * .45 * (1 - Math.exp(-3 * k.t));
  const riderD = (k) => k.v * .8 * (1 - Math.exp(-2.2 * Math.min(k.t, 1.5)));
  function stepCrash(c, dt) {
    const k = c.crash;
    k.t += dt;
    c.s = k.s + bikeD(k); c.y = hB(c.s, c.l); c.vy = 0; c.v = 0;
    if (k.t >= CRASH_T) { c.crash = null; c.pitch = Math.atan(slopeAt(c.s)); c.heat = Math.min(c.heat, .5); c.hot = 0; }
  }
  function collide(c) {
    for (const o of riders) {
      if (o === c || o.crash || c.crash) continue;
      const ds = ((o.s - c.s) % LEN + LEN * 1.5) % LEN - LEN / 2, dl = o.l - c.l;
      if (Math.abs(c.y - o.y) > .05 || Math.abs(ds) > .16) continue;
      // your front wheel into their rear one
      if (ds > .02 && Math.abs(dl) < .05) { if (c.v > o.v + .12) crash(c); else c.v = Math.min(c.v, o.v); }
      else if (Math.abs(ds) < .12 && Math.abs(dl) < .07) { c.l = clamp(c.l - Math.sign(dl || 1) * (.07 - Math.abs(dl)) * .5, -W / 2 + .04, W / 2 - .04); if (c === me && Math.random() < .05) audio.bonk(); }
    }
  }
  function track(c) {
    const k = c.s - START, lap = Math.max(0, Math.floor(k / LEN));
    if (c.done || lap <= c.laps) return;
    c.laps = lap;
    if (lap >= LAPS) { c.done = true; c.time = clock - goAt; if (c === me) finish(); }
    else if (c === me) { ui.toast(lap === LAPS - 1 ? 'dernier tour !' : `tour ${lap + 1} / ${LAPS}`, false, 1000); chip.seq([72, 76, 79], .07, { type: .25, vol: .25 }); }
  }
  // where a flight comes down: the slope there
  function landingSlope(c) {
    let s = c.s, y = c.y, vy = c.vy;
    for (let n = 0; n < 60; n++) { s += c.v * .025; vy -= G * .025; y += vy * .025; if (y <= hB(s, c.l)) break; }
    return Math.atan(slopeAt(s));
  }
  const bin = { thr: 0, turbo: false, brake: false, lat: 0, pitch: 0 };
  function botDrive(c, dt, calm = false) {
    bin.thr = 1; bin.brake = false; bin.pitch = 0;
    if (c.air) { bin.pitch = clamp((landingSlope(c) + c.err - c.pitch) * 4, -1, 1); bin.turbo = false; bin.lat = 0; return bin; }
    // pick a lane now and then: away from mud, onto the arrows when hot, round a slower rider
    c.thinkT -= dt;
    if (c.thinkT <= 0) {
      c.thinkT = .25 + Math.random() * .2;
      const sw = wrapS(c.s), cur = laneOf(c.l);
      let best = c.want, bs = -1e9;
      for (let n = 0; n < 4; n++) {
        let sc = -Math.abs(n - cur) * .4 + (n === c.want ? .3 : 0);
        for (const [a, b, la, lb] of MUD) { const d = wrapS(a - sw); if (n >= la && n <= lb && (d < 1.3 || wrapS(sw - a) < b - a)) sc -= 2; }
        for (const [a, , la, lb] of COOL) { const d = wrapS(a - sw); if (n >= la && n <= lb && d < 1.6) sc += c.heat * 2.5; }
        for (const o of riders) {
          if (o === c) continue;
          const ds = ((o.s - c.s) % LEN + LEN * 1.5) % LEN - LEN / 2;
          if (ds > 0 && ds < .6 && laneOf(o.l) === n && (o.v < c.v + .05 || o.crash)) sc -= 1.6;
        }
        if (sc > bs) { bs = sc; best = n; }
      }
      c.want = best;
    }
    bin.lat = clamp((laneC(c.want) - c.l) * 14, -1, 1);
    if (c.heat >= c.hotLim) c.rest = true; else if (c.heat < c.hotLim - .3) c.rest = false;
    bin.turbo = !calm && c.hot <= 0 && !c.rest && !c.inMud;
    if (calm) bin.thr = c.v < .45 ? 1 : 0;
    return bin;
  }

  // ---------- network ----------
  const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
  const pack = (c) => [r3(c.s), r3(c.l), r3(c.y), r3(c.v), r3(c.vy), r2(c.pitch), r2(c.heat), (c.air ? 1 : 0) | (c.done ? 2 : 0) | (c.hot > 0 ? 4 : 0) | (c.turbo ? 8 : 0) | (c.thr ? 16 : 0),
    r2(c.time), c.crash ? [r3(c.crash.s), r3(c.crash.l), r2(c.crash.v), r2(c.crash.t)] : 0, c.laps];
  // the others' bikes: replayed ~100 ms late from their stamped states; a 3 m jump is a respawn
  function unpack(c, a, ts, src) {
    if (!a) return;
    const [s, l, y, v, vy, pitch, heat, f, time, cr, laps] = a;
    c.trk ??= netTrack({ cut: (p, q) => Math.abs(p[0] - q[0]) > 3 });
    if (!c.trk.push(ts ?? netNow(), [s, l, y, v], src)) return;   // older than what we have
    c.net = { s, l, y, v, vy, t: 0 }; c.pitch = pitch; c.heat = heat; c.air = !!(f & 1); c.hot = f & 4 ? 1 : 0; c.turbo = !!(f & 8); c.thr = f & 16 ? 1 : 0; c.laps = laps; c.seen = clock;
    if (!c.done) c.time = time;
    if (f & 2 && !c.done) { c.done = true; c.time = time; }
    if (cr) { if (!c.crash || Math.abs(c.crash.t - cr[3]) > .3) c.crash = { s: cr[0], l: cr[1], v: cr[2], t: cr[3] }; }
    else c.crash = null;
  }
  function follow(c, dt) {
    const n = c.net; if (!n) return;
    n.t += dt;
    if (c.crash) { c.crash.t = Math.min(CRASH_T, c.crash.t + dt); c.s = c.crash.s + bikeD(c.crash); c.l = c.crash.l; c.y = hB(c.s, c.l); c.v = 0; return; }
    const r = c.trk.sample(c.smp ??= []);
    c.s = r[0]; c.l = r[1]; c.v = r[3];
    c.y = Math.max(c.air ? r[2] : hB(c.s, c.l), hB(c.s, c.l));
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') { const c = byKey(pid); if (c && !mine(c)) unpack(c, fx.c, fx.ts, pid); }
    else if (fx.t === 'b' && !isHost) for (const [k, a] of fx.l) { const c = byKey(k); if (c && c.bot) unpack(c, a, fx.ts, pid); }
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c && !c.bot && c !== me) { dyn.remove(c.m.bike, c.m.rider, c.shadow); if (c.tag) dyn.remove(c.tag); riders.splice(riders.indexOf(c), 1); }
    const was = isHost;
    hostId = hostOf(riders.filter(q => !q.bot).map(q => ({ id: q.key })), hostId); isHost = hostId === meId;
    // the bots carry on from where we last saw them
    if (isHost && !was) for (const b of riders) if (b.bot && b.net) { b.s = b.net.s; b.l = b.net.l; b.y = b.net.y; b.v = b.net.v; b.vy = b.net.vy; b.want = laneOf(b.l); }
  }

  // ---------- the frame ----------
  const order = () => [...riders].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.time - b.time : b.s - a.s));
  const inp = { thr: 0, turbo: false, brake: false, lat: 0, pitch: 0 };
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    if (state === 'count') {
      count -= dt;
      const n = Math.ceil(count - .5);
      if (n !== lastCount && n > 0) { lastCount = n; chip.tone(440, 440, .16, { type: .25, vol: .3 }); for (let k = 0; k < 3; k++) lamps[k].material.color.setRGB(k < 4 - n ? 3 : .2, k < 4 - n ? .2 : .04, .04); }
      if (count <= 0) {
        state = 'race'; goAt = clock; chip.tone(880, 880, .4, { type: .25, vol: .35 });
        for (const m of lamps) m.material.color.setRGB(.2, 3, .4);
      }
    }
    const racing = state === 'race';
    for (const p of plates) p.rotation.x += ((racing ? PI / 2 : 0) - p.rotation.x) * Math.min(1, dt * 12);
    if (me) {
      const up = keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
      inp.thr = up || keys.has('KeyK') ? 1 : 0; inp.turbo = keys.has('Space') || keys.has('KeyJ');
      inp.brake = down && !me.air; inp.pitch = (down ? 1 : 0) - (up ? 1 : 0);
      inp.lat = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    }
    if (racing) {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        for (const c of riders) {
          if (!mine(c)) continue;
          const i = c === me && !auto && !c.done ? inp : botDrive(c, STEP, c.done);
          stepRider(c, i, STEP);
          collide(c);
          track(c);
        }
      }
      for (const c of riders) if (mine(c) && !c.done) c.time = clock - goAt;
    }
    for (const c of riders) if (!mine(c)) follow(c, dt);
    for (const c of riders) draw(c, dt);
    if (me) engineTick(me);
    stepParts(dt);
    // the crowd on its feet (a few times a second is enough), the board keeping count
    crowdT -= dt;
    if (crowdT <= 0 && racing) { crowdT = .07; crowd(clock, .6 + (me && me.air ? .6 : 0)); }
    boardT -= dt;
    if (boardT <= 0 && racing) { boardT = .5; const lead = order()[0]; drawBoard(order(), lead.done ? 'arrivée !' : `tour ${Math.min(LAPS, lead.laps + 1)} / ${LAPS}`); }
    // drop the humans that never came
    if (racing && clock > 9) for (const c of [...riders]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      const ts = netStamp();
      if (me) send({ t: 's', ts, c: pack(me) });
      if (isHost) { const l = riders.filter(c => c.bot).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', ts, l }); }
    }
    if (racing && !result && clock - goAt > MAX_T) finish();
    if (endT > 0) { endT -= dt; if (endT <= 0 && !ended) { ended = true; onEnd(result); } }
    cam(dt);
  }

  // ---------- drawing a rider ----------
  const fr2 = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
  function put(g, s, l, y, pitch, roll, yawAdd = 0) {
    frame(s, fr2);
    g.position.set(fr2.x + fr2.nx * l, y, fr2.z + fr2.nz * l);
    g.rotation.set(-pitch, Math.atan2(fr2.tx, fr2.tz) + yawAdd, roll, 'YXZ');
  }
  function draw(c, dt) {
    const { bike, rider, wheels } = c.m;
    const bankRoll = -Math.atan(bankAt(c.s) / W);
    c.roll += (bankRoll + (c.air ? 0 : c.lat * .25) + (c.wob > 0 ? Math.sin(clock * 40) * c.wob * .25 : 0) - c.roll) * Math.min(1, dt * 8);
    if (c.crash) {
      const k = c.crash, t = k.t, bs = k.s + bikeD(k), tip = Math.min(1, t * 2.5);
      const up = t > CRASH_T - .4 ? (CRASH_T - t) / .4 : 1;
      put(bike, bs, k.l, hB(bs, k.l) + (t < .5 ? Math.sin(t / .5 * PI) * .05 * k.v : 0) + .012 * tip * up, t < .5 ? t * 7 : 0, -1.45 * tip * up, (1 - Math.exp(-3 * t)) * .9 * up);
      // the rider: thrown, down, up, running back, on again
      const rs = k.s + riderD(k), side = .08;
      if (t < 1.5) {
        const fly = t < .6 ? Math.sin(t / .6 * PI) * .1 * k.v : 0;
        put(rider, rs, k.l + side * Math.min(1, t * 2), hB(rs, k.l) + fly, t < .7 ? t * 11 : -PI / 2 * Math.min(1, (1.5 - t) * 2 + .01) * (t < 1.3 ? 1 : 0), 0);
      } else if (t < CRASH_T - .4) {
        const u = (t - 1.5) / (CRASH_T - 1.9), s = rs + (bs - rs) * u, l = k.l + side * (1 - u);
        put(rider, s, l, hB(s, l) + Math.abs(Math.sin(t * 18)) * .01, 0, 0, PI);
      } else put(rider, bs, k.l, hB(bs, k.l), 0, 0, (CRASH_T - t) / .4 * PI);
    } else {
      // on the ground the wheels touch the real dirt; in the air the bike is where it flies
      let y = c.y, p = c.pitch;
      if (!c.air) { const a = hAt(c.s - .054, c.l), b = hAt(c.s + .054, c.l); y = (a + b) / 2; p = Math.atan2(b - a, .108); }
      put(bike, c.s, c.l, y, p + (c.thr && !c.air ? .03 : 0), c.roll);
      rider.position.copy(bike.position); rider.quaternion.copy(bike.quaternion);
      rider.translateY(c.air ? .006 : Math.sin(clock * 30 + c.s * 9) * .0015 * c.v);
    }
    for (const w of wheels) w.rotation.x += (c.crash ? 0 : c.v) * dt / (.34 * SC);
    c.shadow.position.set(bike.position.x, hB(c.s, c.l) + .003, bike.position.z);
    c.shadow.rotation.set(-PI / 2, 0, bike.rotation.y);
    const hgt = bike.position.y - hB(c.s, c.l);
    c.shadow.material.opacity = .5 * clamp(1 - hgt * 4, .2, 1);
    if (c.tag) { c.tag.position.set(bike.position.x, bike.position.y + .2, bike.position.z); const d = me ? Math.hypot(bike.position.x - me.m.bike.position.x, bike.position.z - me.m.bike.position.z) : 0; c.tag.visible = d > .3 && d < 4; }
    // the roost off the rear wheel, mud, smoke from a cooked engine
    c.dirtT -= dt;
    if (c.dirtT <= 0 && !c.crash) {
      c.dirtT = .035;
      frame(c.s, fr2);
      const rx = bike.position.x - fr2.tx * .055, rz = bike.position.z - fr2.tz * .055, gy = hB(c.s, c.l);
      if (!c.air && c.thr && c.v > .2) {
        const mud = c.inMud || inZone(MUD, wrapS(c.s), laneOf(c.l));
        emit(rx, gy + .01, rz, -fr2.tx * (.2 + c.v * .3) + (Math.random() - .5) * .15, .25 + Math.random() * .3 + (c.turbo ? .15 : 0), -fr2.tz * (.2 + c.v * .3) + (Math.random() - .5) * .15, mud ? .007 : .004 + Math.random() * .003, .45, mud ? 0x3a2414 : 0x9a6a40);
      }
      if (c.hot > 0 || c.heat > .85) emit(bike.position.x, bike.position.y + .06, bike.position.z, (Math.random() - .5) * .05, .12, (Math.random() - .5) * .05, .004 + Math.random() * .003, .7, c.hot > 0 ? 0xd8d4cc : 0x8a8a8a, -.1);
    }
  }

  // ---------- the camera: low, behind and on the infield side, a 3/4 view of the jumps ----------
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), wantL = new THREE.Vector3(), tmp = new THREE.Vector3();
  let camFov = 72, camInit = true, camH = Y0;
  function cam(dt) {
    if (!me) return;
    const b = me.m.bike.position;
    camH += (Math.max(Y0, b.y) - camH) * Math.min(1, dt * 4);
    frame(me.s - .4);
    const cl = Math.min(me.l, 0) - .42;
    want.set(fr.x + fr.nx * cl, camH * .6 + Y0 * .4 + .21, fr.z + fr.nz * cl).add(at);
    frame(me.s + .3);
    wantL.set(fr.x + fr.nx * me.l * .6, camH + .03, fr.z + fr.nz * me.l * .6).add(at);
    if (state === 'count') {
      // a swoop down from over the stands to the grid
      const k = clamp(1 - Math.pow(Math.max(0, count - .6) / 2.9, 2), 0, 1);
      tmp.set(at.x - .5, at.y + 2.6, at.z + 3.6);
      want.lerpVectors(tmp, want, k);
      eye.copy(want); look.copy(wantL);
    } else if (camInit) { eye.copy(want); look.copy(wantL); }
    else { eye.lerp(want, Math.min(1, dt * 6)); look.lerp(wantL, Math.min(1, dt * 9)); }
    camInit = false;
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .25); camera.position.x += (Math.random() - .5) * shake * .3; camera.position.y += (Math.random() - .5) * shake * .3; }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const fov = 62 + Math.min(10, me.v * 9) + (me.turbo ? 3 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  function finish() {
    if (result || !me) return;
    const pool = mode === 'course' ? riders : riders.filter(c => !c.bot), of = pool.length;
    if (me.done) {
      const place = pool.filter(c => c !== me && c.done && c.time < me.time).length + 1;
      result = { place, of, value: me.time, time: me.time, text: `${ord(place)} place · 3 tours en ${fmt(me.time)}` };
      ui.toast(place === 1 ? 'victoire !' : `arrivée : ${ord(place)}`, false, 2000);
      chip.seq([67, 72, 76, 79, null, 76, 79, 84], .09, { type: .25, vol: .3 });
    } else {
      const place = [...pool].sort((a, b) => (b.done - a.done) || (b.s - a.s)).indexOf(me) + 1;
      result = { place, of, value: null, time: me.time, text: `temps écoulé · ${ord(place)} place` };
      ui.toast('temps écoulé', true, 2000);
    }
    endT = 3;
  }

  return {
    modes: MODES,
    keys: [['z ou k', 'accélérer'], ['espace', 'turbo · chauffe le moteur'], ['q d', 'changer de couloir'], ['en l\'air z s', 'pencher la moto'], ['s', 'freiner']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { hidden: true };
      const o = order(), pl = o.indexOf(me) + 1, heat = Math.round(me.heat * 100);
      const col = me.hot > 0 ? '#ff3a10' : heat > 75 ? '#ff8a20' : heat > 45 ? '#f2c230' : '#4aa8e8';
      const tip = clock - goAt < 7 ? '<span>en l\'air : z s pour pencher, atterris parallèle à la pente</span>' : me.hot > 0 ? '<span><em>surchauffe</em> : le moteur refroidit</span>' : '';
      return {
        html: `<b>moto-cross</b><span class="big">${ord(pl)} <small>/ ${riders.length}</small></span>`
          + `<span>tour ${Math.min(LAPS, me.laps + 1)} / ${LAPS} · ${fmt(me.time)}</span>`
          + `<div class="therm" style="display:flex;width:200px;height:10px;border-radius:999px;background:rgba(0,0,0,.55);overflow:hidden;margin-top:5px"><i style="display:block;height:100%;width:${heat}%;background:${col}"></i></div>${tip}`
          + `<div class="board">${o.map((c, i) => `<span style="color:${hexOf(c.color)}">${i + 1}. ${c === me ? '<em>' + c.name + '</em>' : c.name}${c.done ? ' ✓' : ''}</span>`).join('')}</div>`,
      };
    },
    preview() {
      const c = me || riders[0];
      frame(c ? c.s : START);
      const l = c ? c.l : 0;
      return { x: at.x + fr.x + fr.nx * l, y: at.y + Y0 + .06, z: at.z + fr.z + fr.nz * l, yaw: Math.atan2(fr.tx, fr.tz), rad: .7, h: .28 };
    },
    set onEnd(f) { onEnd = f; },
    // tests
    get me() { return me; }, get riders() { return riders; }, get len() { return LEN; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _warp(lapsLeft = 0) { if (me) { me.s = START + (LAPS - 1 - lapsLeft) * LEN + LEN - .6; me.laps = LAPS - 1 - lapsLeft; me.v = 1; me.y = hB(me.s, me.l); } },
  };
}
