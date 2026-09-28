// china.js, the other side of the Earth: a Japanese suburb in cherry-blossom season.
// A crossroads with its markings, utility poles strung with wire, two-storey houses
// behind block walls, a konbini with its car park and vending machines, a shrine with
// a torii, a little station whose train comes and goes, a level crossing that rings
// for it, and the town stretching off to the hills. The plot sits in a fenced lot.
// (The file keeps its old name; everything in the game calls this world 'china'.)
import * as THREE from 'three';
import { NX, S } from './terrain.js';
import { mergeStatic } from './merge.js';
import * as V from './vehicles.js';
import { createBlossoms, createPoles, createCars, createContact, createWalkers, puffGeometry, roofColliders, seeded } from './street.js';
import { jpInteriors } from './interiors-jp.js';
import { createRig } from './rig.js';
import { japanBoutique } from './boutiques.js';
import { DEFAULT } from './outfits.js';
import { canvasTex } from './lib/tex.js';

export const CHINA = new THREE.Vector3(400, 0, 0);
const HALF = NX * S / 2;
const JP_FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';

// a sign painted on a canvas: text, colours, an optional stripe
function sign(text, { w = 512, h = 128, bg = '#ffffff', color = '#1a1a1a', size = 72, weight = 700, stripe = null, sub = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (stripe) for (const [y, hh, col] of stripe) { g.fillStyle = col; g.fillRect(0, y * h, w, hh * h); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${size}px ${JP_FONT}`;
  g.fillText(text, w / 2, sub ? h * .42 : h / 2);
  if (sub) { g.font = `500 ${size * .36}px ${JP_FONT}`; g.fillText(sub, w / 2, h * .8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createChina({ scene, colliders, interactables, label }) {
  const g = new THREE.Group();
  g.position.copy(CHINA);
  scene.add(g);
  const cx = CHINA.x, cz = CHINA.z;
  const rnd = seeded(97);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const addBox = (x0, y0, z0, x1, y1, z1) => colliders.push({ min: new THREE.Vector3(cx + Math.min(x0, x1), y0, cz + Math.min(z0, z1)), max: new THREE.Vector3(cx + Math.max(x0, x1), y1, cz + Math.max(z0, z1)) });
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return mats.get(k); };
  const box = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const flat = (w, d, m, x, y, z, rot = 0, parent = g) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-Math.PI / 2, 0, rot); p.position.set(x, y, z); p.receiveShadow = true; parent.add(p); return p; };
  const animated = [];
  const contact = createContact({ parent: g });
  const J = jpInteriors({ box, mat, colliders, sign });

  // ---------- textures ----------
  const noiseTex = (base, spots, rep) => canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 5000; n++) { const v = spots(); c.fillStyle = v; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); }
  }, rep);
  const asphaltTex = noiseTex('#ffffff', () => { const v = 150 + Math.random() * 105; return `rgba(${v},${v},${v + 10},.35)`; }, [60, 3]);
  const concreteTex = noiseTex('#ffffff', () => { const v = 170 + Math.random() * 85; return `rgba(${v},${v - 4},${v - 10},.25)`; }, [40, 40]);
  const asphalt = mat(0x6a6f7e, { map: asphaltTex });
  const concrete = new THREE.MeshLambertMaterial({ color: 0xcdc6b8, map: concreteTex });
  const tileTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { c.fillStyle = `rgba(0,0,0,${.02 + Math.random() * .05})`; c.fillRect(x + 1, y + 1, 30, 30); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x, y, 32, 1); c.fillRect(x, y, 1, 32); }
  }, [1, 1]);
  const paving = (w, d) => { const t = tileTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, d / 1.2); return new THREE.MeshLambertMaterial({ color: 0xd8d2c8, map: t }); };
  const tactile = mat(0xf2c21e);
  const white = mat(0xf4f4f0), orange = mat(0xf0a030);
  const siding = (col) => {
    const k = 'siding' + col;
    if (!mats.has(k)) {
      const t = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { c.fillStyle = 'rgba(0,0,0,.09)'; c.fillRect(0, y + 6, 128, 2); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(0, y, 128, 1); } }, [2, 2]);
      mats.set(k, new THREE.MeshLambertMaterial({ color: col, map: t }));
    }
    return mats.get(k);
  };
  const roofTile = (col) => {
    const k = 'roof' + col;
    if (!mats.has(k)) {
      const t = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); for (let y = 0; y < 64; y += 8) { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(0, y + 6, 64, 2); } for (let x = 0; x < 64; x += 8) { c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, 0, 2, 64); } }, [4, 4]);
      mats.set(k, new THREE.MeshLambertMaterial({ color: col, map: t }));
    }
    return mats.get(k);
  };
  // windows: a pale sky reflected in the glass, lit from inside at night
  const winTex = canvasTex(64, 64, (c) => { const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#dfeefa'); gr.addColorStop(.55, '#8fb2cc'); gr.addColorStop(1, '#5a7890'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(8, 64); c.lineTo(30, 0); c.lineTo(40, 0); c.lineTo(18, 64); c.fill(); });
  const glass = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffc47a, emissiveIntensity: 0 });
  const alu = mat(0xc4c9d0);
  const blockWall = new THREE.MeshLambertMaterial({ color: 0xc2bdb2, map: canvasTex(128, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 64); c.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < 64; y += 16) { c.fillRect(0, y, 128, 1.5); for (let x = (y / 16) % 2 * 16; x < 128; x += 32) c.fillRect(x, y, 1.5, 16); } }, [1, 1]) });
  const hedgeGeo = puffGeometry(2, .85);
  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x4f8c3c, emissive: 0x0f2008 });

  // ---------- the ground: concrete everywhere, the plot cut out ----------
  const shape = new THREE.Shape();
  shape.moveTo(-400, -400); shape.lineTo(400, -400); shape.lineTo(400, 400); shape.lineTo(-400, 400);
  const hole = new THREE.Path();
  hole.moveTo(-HALF, -HALF); hole.lineTo(-HALF, HALF); hole.lineTo(HALF, HALF); hole.lineTo(HALF, -HALF);
  shape.holes.push(hole);
  const groundGeo = new THREE.ShapeGeometry(shape); groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, concrete);
  ground.receiveShadow = true;
  g.add(ground);
  // the lot around the plot is packed earth with weeds at the edges
  const lotMat = new THREE.MeshLambertMaterial({ color: 0xb8a888, map: noiseTex('#ffffff', () => { const v = 140 + Math.random() * 100; return `rgba(${v},${v - 10},${v - 30},.3)`; }, [6, 6]) });
  for (const [w, d, x, z] of [[18, 1, 0, -8.5], [18, 1, 0, 8.5], [1, 16, -8.5, 0], [1, 16, 8.5, 0]]) flat(w, d, lotMat, x, .012, z);

  // ---------- roads ----------
  // street A runs east-west south of the plot, street B north-south to the west; they cross
  const A = { z0: 11, z1: 18 }, B = { x0: -18.5, x1: -11.5 };
  const RAIL = { z0: -32.6, z1: -25.4 };
  flat(320, A.z1 - A.z0, asphalt, 0, .02, (A.z0 + A.z1) / 2);
  const bLen = 160 - RAIL.z1;
  flat(B.x1 - B.x0, bLen, asphalt, (B.x0 + B.x1) / 2, .021, RAIL.z1 + bLen / 2);
  flat(B.x1 - B.x0, 120, asphalt, (B.x0 + B.x1) / 2, .021, RAIL.z0 - 60);
  // markings: white edges, an orange centre line, crossings and stop lines
  const marks = new THREE.Group(); g.add(marks);
  const line = (w, d, m, x, z) => flat(w, d, m, x, .03, z, 0, marks);
  for (const [a, b] of [[-160, B.x0 - 4.5], [B.x1 + 4.5, 160]]) {
    const mid = (a + b) / 2, len = b - a;
    line(len, .15, white, mid, A.z0 + .35); line(len, .15, white, mid, A.z1 - .35);
    for (let x = a; x < b - 3; x += 6) line(3, .15, orange, x + 1.5, (A.z0 + A.z1) / 2);
  }
  for (const [a, b] of [[A.z1 + 4.5, 160], [RAIL.z1 + 3, A.z0 - 4.5]]) {
    const mid = (a + b) / 2, len = b - a;
    line(.15, len, white, B.x0 + .35, mid); line(.15, len, white, B.x1 - .35, mid);
    for (let z = a; z < b - 3; z += 6) line(.15, 3, white, (B.x0 + B.x1) / 2, z + 1.5);
  }
  // zebra crossings on all four sides of the junction
  const bx = (B.x0 + B.x1) / 2, az = (A.z0 + A.z1) / 2;
  for (let k = 0; k < 7; k++) {
    const o = -3 + k;
    line(.5, 3, white, bx + o * .9, A.z0 - 2.2); line(.5, 3, white, bx + o * .9, A.z1 + 2.2);
    line(3, .5, white, B.x0 - 2.2, az + o * .9); line(3, .5, white, B.x1 + 2.2, az + o * .9);
  }
  line(3.2, .3, white, bx + 1.7, A.z0 - 4.1); line(3.2, .3, white, bx - 1.7, A.z1 + 4.1);
  const tomare = new THREE.MeshLambertMaterial({ map: sign('止まれ', { w: 256, h: 512, bg: 'rgba(0,0,0,0)', color: '#f4f4f0', size: 150 }), transparent: true, depthWrite: false });
  // painted on the road, read from the driver's seat
  { const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#f4f4f0'; x.textAlign = 'center'; x.font = `700 150px ${JP_FONT}`; ['止', 'ま', 'れ'].forEach((ch, k) => x.fillText(ch, 128, 150 + k * 160)); tomare.map = new THREE.CanvasTexture(c); tomare.map.colorSpace = THREE.SRGBColorSpace; }
  flat(2.4, 4.8, tomare, bx + 1.7, .031, A.z0 - 8, 0, marks);
  flat(2.4, 4.8, tomare, bx - 1.7, .031, A.z1 + 8, Math.PI, marks);
  // a bicycle lane, blue, with its white bike
  const bikeTex = new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, (c) => { c.fillStyle = '#2f64b8'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#f4f4f0'; c.lineWidth = 8; c.beginPath(); c.arc(80, 78, 26, 0, 7); c.arc(176, 78, 26, 0, 7); c.stroke(); c.beginPath(); c.moveTo(80, 78); c.lineTo(120, 40); c.lineTo(176, 78); c.moveTo(108, 78); c.lineTo(120, 40); c.lineTo(160, 40); c.stroke(); }) });
  for (const x of [-60, 20, 70]) flat(2.4, 1.2, bikeTex, x, .031, A.z0 + 1.2, 0, marks);

  // ---------- pavements: raised, with kerbs and yellow tactile strips at the crossings ----------
  const pave = (x0, z0, x1, z1) => {
    const w = x1 - x0, d = z1 - z0;
    box(w, .12, d, paving(w, d), x0 + w / 2, .06, z0 + d / 2);
    const kerbM = mat(0xb0aaa0);
    if (d < w) { box(w, .16, .12, kerbM, x0 + w / 2, .08, z0); box(w, .16, .12, kerbM, x0 + w / 2, .08, z1); }
    else { box(.12, .16, d, kerbM, x0, .08, z0 + d / 2); box(.12, .16, d, kerbM, x1, .08, z0 + d / 2); }
  };
  pave(-160, A.z1, B.x0 - .01, A.z1 + 2.4); pave(B.x1 + .01, A.z1, 160, A.z1 + 2.4);
  pave(-160, A.z0 - 2, B.x0 - .01, A.z0); pave(B.x1 + .01, A.z0 - 1.6, 160, A.z0);
  pave(B.x0 - 1.8, RAIL.z1 + 1, B.x0, A.z0 - 2); pave(B.x1, RAIL.z1 + 1, B.x1 + 1.6, A.z0 - 1.6);
  pave(B.x0 - 1.8, A.z1 + 2.4, B.x0, 160); pave(B.x1, A.z1 + 2.4, B.x1 + 1.6, 160);
  for (const [x, z, w, d] of [[bx - 4.6, A.z0 - .6, 1.6, .4], [bx + 4.4, A.z0 - .6, 1.6, .4], [bx - 4.6, A.z1 + .6, 1.6, .4], [bx + 4.4, A.z1 + .6, 1.6, .4]]) box(w, .13, d, tactile, x, .07, z);

  // ---------- the fenced lot around the plot: green chain-link on steel posts ----------
  const meshTex = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = '#3f7a4a'; c.lineWidth = 2.2; for (let k = -64; k < 128; k += 12) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 64, 64); c.stroke(); c.beginPath(); c.moveTo(k + 64, 0); c.lineTo(k, 64); c.stroke(); } }, [1, 1]);
  const chain = (x0, z0, x1, z1, h = 1.5) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t = meshTex.clone(); t.needsUpdate = true; t.repeat.set(len / .5, h / .5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshLambertMaterial({ map: t, alphaTest: .5, side: THREE.DoubleSide }));
    m.position.set((x0 + x1) / 2, h / 2 + .05, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(m);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k <= n; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, h + .1, 6), mat(0x3f6a48)); p.position.set(x0 + (x1 - x0) * k / n, (h + .1) / 2, z0 + (z1 - z0) * k / n); g.add(p); }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, len, 6), mat(0x3f6a48)); rail.rotation.z = Math.PI / 2; rail.rotation.y = m.rotation.y; rail.position.set(m.position.x, h + .05, m.position.z); g.add(rail);
    addBox(Math.min(x0, x1) - .05, 0, Math.min(z0, z1) - .05, Math.max(x0, x1) + .05, h, Math.max(z0, z1) + .05);
  };
  const F = HALF + 1;
  chain(-F, F, F, F); chain(-F, -F, -F, F); chain(F, -F, F, F); chain(-F, -F, -1.6, -F); chain(1.6, -F, F, -F);

  // ---------- the konbini, its car park and its vending machines ----------
  const kb = new THREE.Group(); g.add(kb);
  const KW = 11, KD = 6.5, KH = 3.6, kz = -13;       // front face at z = -13
  // the glass front, the store lit up behind it
  const shop = new THREE.MeshLambertMaterial({ map: canvasTex(512, 160, (c, w, h) => {
    c.fillStyle = '#f7f6f0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fffbe8'; c.fillRect(0, 0, w, 18);
    for (let k = 0; k < 7; k++) { const x = 30 + k * 68; c.fillStyle = '#dcdcd8'; c.fillRect(x, 50, 46, 110); for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) { c.fillStyle = `hsl(${Math.random() * 360},${50 + Math.random() * 40}%,${45 + Math.random() * 30}%)`; c.fillRect(x + 3 + q * 7, 56 + r * 26, 6, 18); } }
    c.fillStyle = 'rgba(255,255,255,.28)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(k * 90 + 20, h); c.lineTo(k * 90 + 70, 0); c.lineTo(k * 90 + 90, 0); c.lineTo(k * 90 + 40, h); c.fill(); }
    c.fillStyle = '#9aa0a8'; for (let k = 0; k <= 8; k++) c.fillRect(k * 64 - 2, 0, 4, h);
  }), emissive: 0xffffff, emissiveIntensity: .35 });
  // a real shop you walk into: walls, a glass front with an automatic door, and inside
  // the gondolas, the drinks fridges, the counter with its clerk, and the teleporter
  const WT = .2, DX0 = 2.4, DX1 = 4.2;                 // the door gap in the glass front
  const kWall = mat(0xf2f2ee);
  const lit = (c, k = .45) => mat(c, { emissive: new THREE.Color(c).multiplyScalar(k).getHex() });
  const kSolid = (x0, y0, z0, x1, y1, z1, m = kWall) => { box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, kb); addBox(x0, y0, z0, x1, y1, z1); };
  kSolid(-KW / 2, 0, kz - KD, KW / 2, KH, kz - KD + WT);
  kSolid(-KW / 2, 0, kz - KD, -KW / 2 + WT, KH, kz);
  kSolid(KW / 2 - WT, 0, kz - KD, KW / 2, KH, kz);
  // the front: a low sill, glass either side of the door, a transom above
  const kGlass = new THREE.MeshLambertMaterial({ color: 0xdcecf4, transparent: true, opacity: .22, depthWrite: false });
  const frameM = mat(0xb8bec6);
  for (const [x0, x1] of [[-KW / 2 + WT, DX0], [DX1, KW / 2 - WT]]) {
    box(x1 - x0, .35, .12, kWall, (x0 + x1) / 2, .175, kz - .06, kb);
    box(x1 - x0, 2.35, .04, kGlass, (x0 + x1) / 2, 1.53, kz - .06, kb);
    addBox(x0, 0, kz - .12, x1, 2.7, kz);
    const n = Math.max(1, Math.round((x1 - x0) / 1.8));
    for (let k = 0; k <= n; k++) box(.07, 2.35, .08, frameM, x0 + (x1 - x0) * k / n, 1.53, kz - .06, kb);
  }
  box(KW, .06, .1, frameM, 0, .35, kz - .06, kb); box(KW, .08, .1, frameM, 0, 2.7, kz - .06, kb);
  kSolid(-KW / 2, 2.7, kz - .12, KW / 2, KH, kz);
  addBox(-KW / 2, KH - .25, kz - KD, KW / 2, KH + .15, kz);          // the ceiling (and a flat roof on top)
  // the automatic door, two panes that slide apart
  const doorPanes = [0, 1].map(k => { const p = box((DX1 - DX0) / 2, 2.3, .03, kGlass, 0, 1.5, kz - .09, kb); p.userData.keep = true; const f = box((DX1 - DX0) / 2 + .04, .06, .05, frameM, 0, 2.66, kz - .09, kb); f.userData.keep = true; return [p, f, k]; });
  box(DX1 - DX0 + .4, .03, 1.2, mat(0x5a6068), (DX0 + DX1) / 2, .035, kz - .7, kb);
  // inside: a pale tiled floor, a ceiling of light panels
  const floorT = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, 64, 1); c.fillRect(0, 0, 1, 64); }, [KW / .6, KD / .6]);
  box(KW - 2 * WT, .03, KD - WT, new THREE.MeshLambertMaterial({ color: 0xeceae4, map: floorT, emissive: 0x3a3a38 }), 0, .015, kz - KD / 2 + WT / 2, kb);
  box(KW - 2 * WT, .05, KD - WT, lit(0xf4f4f0, .35), 0, KH - .25, kz - KD / 2 + WT / 2, kb);
  const panel = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: .9 });
  for (let x = -4; x <= 4; x += 2) for (const z of [kz - 1.6, kz - 3.6, kz - 5.4]) box(1.2, .03, .3, panel, x, KH - .28, z, kb);
  // the walls inside, a little lit
  for (const [w, d, x, z] of [[KW - 2 * WT, .02, 0, kz - KD + WT + .011], [.02, KD - WT, -KW / 2 + WT + .011, kz - KD / 2], [.02, KD - WT, KW / 2 - WT - .011, kz - KD / 2]]) box(w, KH - .3, d, lit(0xf6f4ee, .5), x, (KH - .3) / 2, z, kb);
  // drinks fridges along the back wall: glass doors, bottles lit from inside
  const fridgeTex = canvasTex(256, 256, (c) => { c.fillStyle = '#e8f0f4'; c.fillRect(0, 0, 256, 256); for (let r = 0; r < 5; r++) { c.fillStyle = '#b8c0c8'; c.fillRect(0, 44 + r * 48, 256, 4); for (let q = 0; q < 14; q++) { c.fillStyle = `hsl(${[0, 30, 120, 200, 45, 330][(q + r) % 6]},${55 + Math.random() * 30}%,${45 + Math.random() * 20}%)`; c.fillRect(6 + q * 18, 14 + r * 48, 12, 30); } } for (let k = 1; k < 4; k++) { c.fillStyle = '#9aa0a8'; c.fillRect(k * 64 - 2, 0, 4, 256); } });
  const fridge = new THREE.MeshLambertMaterial({ map: fridgeTex, emissive: 0xffffff, emissiveMap: fridgeTex, emissiveIntensity: .45 });
  box(6.4, 2.3, .7, mat(0xd8dce0), -1.6, 1.15, kz - KD + WT + .35, kb);
  box(6.2, 2.1, .02, fridge, -1.6, 1.15, kz - KD + WT + .71, kb);
  addBox(-4.8, 0, kz - KD + WT, 1.6, 2.3, kz - KD + WT + .7);
  // gondolas: two shelves down the middle, packed with coloured goods
  const goods = canvasTex(256, 128, (c) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, 256, 128); for (let r = 0; r < 4; r++) { c.fillStyle = '#c8ccd2'; c.fillRect(0, 28 + r * 32, 256, 4); for (let q = 0; q < 16; q++) { c.fillStyle = `hsl(${Math.random() * 360},${50 + Math.random() * 40}%,${48 + Math.random() * 25}%)`; const hh = 12 + Math.random() * 12; c.fillRect(3 + q * 16, 28 + r * 32 - hh, 13, hh); } } });
  const goodsM = new THREE.MeshLambertMaterial({ map: goods, emissive: 0xffffff, emissiveMap: goods, emissiveIntensity: .25 });
  // each gondola: a central panel, four shelves a side, and rows of real little products
  const prodGeo = new THREE.BoxGeometry(1, 1, 1);
  const prods = new THREE.InstancedMesh(prodGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x303030 }), 2 * 2 * 4 * 14);
  const pc = new THREE.Color(), pd = new THREE.Object3D();
  let pi = 0;
  const PAL = [0xe8384f, 0xf2a43a, 0xf6d23a, 0x3aa85a, 0x2f6cc0, 0xb04ad8, 0xf4f4f0, 0xe87aa0, 0x8a5a3a, 0x2ac0c0];
  for (const x of [-2.4, .4]) {
    box(.12, 1.6, 2.6, mat(0xdcdfe2), x, .8, kz - 3.6, kb);
    box(1, .12, 2.6, mat(0xcfd3d8), x, .06, kz - 3.6, kb);
    for (const sx of [-1, 1]) for (const y of [.12, .48, .84, 1.2]) {
      box(.42, .03, 2.6, mat(0xe8eaec), x + sx * .27, y, kz - 3.6, kb);
      let z = kz - 4.85;
      while (z < kz - 2.4 && pi < prods.count) {
        const w = .1 + Math.random() * .1, hgt = .12 + Math.random() * .18, d = .1 + Math.random() * .15;
        pd.position.set(x + sx * (.18 + d / 2), y + .015 + hgt / 2, z + w / 2); pd.scale.set(d, hgt, w); pd.updateMatrix();
        prods.setMatrixAt(pi, pd.matrix); prods.setColorAt(pi, pc.setHex(PAL[Math.floor(Math.random() * PAL.length)]));
        pi++; z += w + .02;
      }
    }
    box(.06, .3, 2.6, mat(0x20a45a), x, 1.72, kz - 3.6, kb);
    addBox(x - .5, 0, kz - 4.9, x + .5, 1.6, kz - 2.3);
  }
  prods.count = pi; prods.userData.keep = true; prods.castShadow = true;
  kb.add(prods);
  void goodsM;
  // the counter by the window, a till, a coffee machine, and the clerk behind it
  box(3.4, 1, .8, mat(0xe8e8e4), -3.4, .5, kz - 1.2, kb);
  box(3.5, .06, .9, mat(0x2a2e34), -3.4, 1.03, kz - 1.2, kb);
  box(.4, .3, .35, mat(0x2a2e34), -2.6, 1.2, kz - 1.2, kb); box(.35, .22, .04, lit(0x9ad0f0, .8), -2.6, 1.42, kz - 1.05, kb);
  box(.45, .6, .4, mat(0xc8282e), -4.6, 1.36, kz - 1.3, kb);
  addBox(-5.3, 0, kz - 1.65, -1.7, 1.05, kz - .8);
  const clerk = new THREE.Group(); clerk.position.set(-3.4, 0, kz - .45); clerk.rotation.y = Math.PI; clerk.userData.keep = true; kb.add(clerk);
  const clerkRig = createRig({ ...DEFAULT, top: 'tee', tee: 6, bottom: 'chino', skin: 0, hair: 'court', hairC: 1 });
  clerk.add(clerkRig.root);
  box(.3, .42, .03, mat(0x20a45a), 0, 1.08, .145, clerk); box(.3, .08, .03, mat(0x1d5aa8), 0, 1.33, .14, clerk);
  // the teleporter's corner, back right, under its own sign
  const tpSign = sign('テレポート · maison', { w: 512, h: 96, bg: '#1d5aa8', color: '#ffffff', size: 44 });
  box(2, .4, .04, new THREE.MeshLambertMaterial({ map: tpSign, emissive: 0xffffff, emissiveMap: tpSign, emissiveIntensity: .3 }), 3.6, 2.8, kz - KD + WT + .04, kb);
  // the stripes and the name
  const stripeTex = sign('ひだまりマート', { w: 1024, h: 128, bg: '#ffffff', color: '#1d5aa8', size: 70, stripe: [[0, .16, '#20a45a'], [.84, .16, '#1d5aa8']] });
  box(KW + .1, .9, .1, new THREE.MeshLambertMaterial({ map: stripeTex, emissive: 0xffffff, emissiveMap: stripeTex, emissiveIntensity: .15 }), 0, KH - .5, kz + .06, kb);
  box(KW + .2, .12, KD + .2, mat(0xd8d8d4), 0, KH + .06, kz - KD / 2, kb);
  box(1.8, .08, .9, mat(0xd8d8d4), 0, 2.75, kz + .45, kb);
  // a pole sign by the road
  const psTex = sign('ひだまり', { w: 256, h: 256, bg: '#ffffff', color: '#1d5aa8', size: 56, stripe: [[0, .2, '#20a45a'], [.8, .2, '#1d5aa8']], sub: '24時間営業' });
  box(.18, 5.2, .18, mat(0x9aa0a8), -6.2, 2.6, -10.3, kb);
  box(1.6, 1.6, .25, new THREE.MeshLambertMaterial({ map: psTex, emissive: 0xffffff, emissiveMap: psTex, emissiveIntensity: .2 }), -6.2, 5.6, -10.3, kb);
  addBox(-6.35, 0, -10.45, -6.05, 6, -10.15);
  contact.rect(0, kz - KD / 2, KW, KD, 0, .06);
  // the clerk sells from behind the counter; the fridges and the shelves open the same till
  for (const [x, z, r] of [[-3.4, kz - 1.2, 2.4], [-1.6, kz - KD + WT + .8, 2], [-2.4, kz - 3.6, 1.8], [.4, kz - 3.6, 1.8]]) interactables.push({ id: 'cshop', pos: new THREE.Vector3(cx + x, 1.2, cz + z), reach: r });
  // the car park: asphalt, white bays, concrete wheel stops
  flat(19, 4, asphalt, 0, .022, kz + 2);
  for (let k = -3; k <= 3; k++) { flat(.12, 3.2, white, k * 2.7, .032, kz + 2.2); if (k < 3) box(1.2, .12, .18, mat(0xcfcac0), k * 2.7 + 1.35, .06, kz + .95); }
  // vending machines, glowing
  const vend = (x, z, body, rot = 0) => {
    const tex = canvasTex(128, 256, (c) => {
      c.fillStyle = body; c.fillRect(0, 0, 128, 256);
      c.fillStyle = '#eef4fa'; c.fillRect(10, 18, 108, 118);
      for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) { c.fillStyle = `hsl(${Math.random() * 360},${55 + Math.random() * 35}%,${45 + Math.random() * 25}%)`; c.fillRect(15 + q * 17, 24 + r * 28, 11, 20); c.fillStyle = '#e03030'; c.fillRect(15 + q * 17, 46 + r * 28, 11, 3); }
      c.fillStyle = '#1a1c20'; c.fillRect(20, 196, 88, 30); c.fillStyle = '#c8ccd2'; c.fillRect(96, 150, 18, 30);
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `700 16px ${JP_FONT}`; c.textAlign = 'center'; c.fillText('つめた〜い', 64, 160);
    });
    const vm = box(1.05, 1.85, .8, mat(0xf0f0ec), x, .93, z);
    vm.rotation.y = rot;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .3 }));
    front.position.set(x + Math.sin(rot) * .41, .93, z + Math.cos(rot) * .41); front.rotation.y = rot;
    g.add(front); animated.push({ vend: front.material });
    addBox(x - .55, 0, z - .45, x + .55, 1.9, z + .45);
  };
  vend(-6.9, -12.6, '#d8262e'); vend(-8, -12.6, '#1d5aa8'); vend(-9.1, -12.6, '#f2f2ee');
  // recycling bins, one per kind
  for (const [k, col] of [[0, 0x2f6cc0], [1, 0x2f9a58], [2, 0xd8262e]]) { box(.5, .85, .5, mat(col), 6.2 + k * .6, .43, -12.7); box(.5, .05, .5, mat(0xeeeeee), 6.2 + k * .6, .87, -12.7); }
  addBox(5.9, 0, -13, 7.9, .9, -12.4);

  // the sell counter: a little buy-back stand, same job as the crate back home
  const stand = new THREE.Group(); g.add(stand);
  box(1.8, 1, .8, mat(0x8a5a36), 0, .5, 0, stand); box(2, .08, 1, mat(0xe8e2d6), 0, 1.04, 0, stand);
  box(.08, 1.4, .08, mat(0x4a4e56), -.9, 1.7, 0, stand); box(.08, 1.4, .08, mat(0x4a4e56), .9, 1.7, 0, stand);
  const sellTex = sign('買取 · vendre', { w: 512, h: 128, bg: '#d8262e', color: '#ffffff', size: 64 });
  box(2, .45, .06, new THREE.MeshLambertMaterial({ map: sellTex, emissive: 0xffffff, emissiveMap: sellTex, emissiveIntensity: .15 }), 0, 2.3, 0, stand);
  stand.position.set(-12.9 + 2.4, 0, -9.6);
  addBox(-11.4, 0, -10.1, -9.6, 1.1, -9.1);
  interactables.push({ id: 'sell', pos: new THREE.Vector3(cx - 10.5, .8, cz - 9.6) });

  // the well: the way home, an old stone one under a little tiled roof
  const well = new THREE.Group(); g.add(well);
  well.add(new THREE.Mesh(new THREE.CylinderGeometry(.8, .85, .8, 18, 1, true), mat(0x9a948a, { side: THREE.DoubleSide })));
  const water = new THREE.Mesh(new THREE.CircleGeometry(.78, 18), new THREE.MeshBasicMaterial({ color: 0x10202a })); water.rotation.x = -Math.PI / 2; water.position.y = .1; well.add(water);
  for (const x of [-.75, .75]) box(.12, 1.9, .12, mat(0x5a3a28), x, .95, 0, well);
  const wroof = new THREE.Mesh(new THREE.ConeGeometry(1.3, .55, 4), roofTile(0x3f4552)); wroof.rotation.y = Math.PI / 4; wroof.position.y = 2.1; wroof.scale.z = .7; well.add(wroof);
  well.children.forEach(c => { c.position.y += .4; });
  well.position.set(10.8, 0, -11.8);
  const wsTex = sign('井戸 · vers la maison', { w: 512, h: 112, bg: '#2a2a2e', color: '#ffe08a', size: 46 });
  box(1.5, .36, .04, new THREE.MeshLambertMaterial({ map: wsTex }), 10.8, 1.05, -10.9);
  addBox(9.9, 0, -12.7, 11.7, 1.2, -10.9);
  interactables.push({ id: 'well', pos: new THREE.Vector3(cx + 10.8, .8, cz - 11.8) });

  // ---------- parked cars: boxy kei cars and small saloons ----------
  const carB = createCars({ parent: g, addBox });
  const cars = (x, z, rot, color, kind) => { const c = carB(x, z, rot, color, kind); contact.blob(x, z, 2.4, .06); return c; };
  const car = (x, z, rot, color, kei = rnd() < .55) => cars(x, z, rot, color, kei ? 'kei' : 'saloon');
  const CARC = [0xf4f4f2, 0xe8eaec, 0xc4cad2, 0x9ec4e0, 0xf2c8d4, 0x3a3e46, 0xe8e0c8];
  // kei cars only: the car park is barely four metres deep in front of the shop
  car(-4.05, -11.1, Math.PI / 2, pick(CARC), true); car(-1.35, -11.1, Math.PI / 2, 0xf2c8d4, true);

  // ---------- houses: two storeys, siding, tiled hip roofs, balconies, block walls ----------
  const WALLC = [0xe9e4da, 0xd8dee4, 0xc9d4de, 0xe6d9c4, 0xd9d2c6, 0xbfcad6, 0xe2e6e0, 0xcfc3b0];
  const ROOFC = [0x3a4150, 0x464c58, 0x4f4a48, 0x35506a, 0x5a5f68];
  function house(x, z, rot, { big = rnd() < .5 } = {}) {
    const h = new THREE.Group();
    h.position.set(x, 0, z); h.rotation.y = rot;
    g.add(h);
    const W = big ? 9 : 7.4 + rnd(), D = 7 + rnd(), H1 = 2.9, H2 = H1 * 2;
    const wall = siding(pick(WALLC)), roofM = roofTile(pick(ROOFC));
    // hollow now: walls round a doorway, the siding's courses laid as on the old solid box
    const dx = -W * .28, DW = 1, DH = 2.15, WT = .2, dr = { x: dx, w: DW, h: DH };
    J.shell(h, { W, D, H: H2, T: WT, m: wall, door: dr, collide: true });
    // some houses wear a darker ground floor
    if (rnd() < .45) J.shell(h, { W: W + .04, D: D + .04, H: H1, T: .02, m: siding(new THREE.Color(pick(WALLC)).multiplyScalar(.82).getHex()), door: dr });
    J.shell(h, { W: W + .08, D: D + .08, H: .35, T: .04, m: mat(0x9a948c), door: dr });
    J.shell(h, { W: W + .1, D: D + .1, H: .12, y: H1 - .06, T: .05, m: mat(0xe8e8e4) });
    // hip roof: a flattened four-sided pyramid over wide eaves
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofM);
    roof.rotation.y = Math.PI / 4; roof.scale.set((W + 1.3) * .71, 2.3 + rnd() * .6, (D + 1.3) * .71); roof.position.y = H2 + .2 + roof.scale.y / 2;
    h.add(roof);
    // thick pale eaves all round, the underside in shadow
    box(W + 1.25, .28, D + 1.25, mat(0xe4e6ea), 0, H2 + .1, 0, h);
    // the front (+z): a door with a little canopy, windows in aluminium frames
    const f = D / 2 + .02;
    J.door(h, { x: dx, z: D / 2 - WT / 2, w: DW, h: DH, m: J.pal(pick([0x6a4a30, 0x4a3a30, 0x8a8f96])) });
    box(1.5, .08, .8, mat(0xd8d8d4), -W * .28, 2.35, f + .4, h);
    const win = (wx, wy, ww, wh, face = 1) => {
      box(ww + .12, wh + .12, .06, alu, wx, wy, f * face, h);
      box(ww, wh, .07, glass, wx, wy, (f + .01) * face, h);
      box(.04, wh, .09, alu, wx, wy, (f + .02) * face, h);
    };
    win(W * .14, 1.3, 2.4, 1.7); win(W * .4, 1.6, .9, 1);
    box(.18, .24, .12, mat(0xfff4d8, { emissive: 0xffd890, emissiveIntensity: .3 }), -W * .28 + .75, 2.2, f + .06, h);
    box(.12, .18, .05, mat(0x3a3e46), -W * .28 + .72, 1.4, f + .03, h);
    // upstairs: a balcony, with laundry now and then, and a sliding window behind it
    win(-W * .2, H1 + 1.25, 2.6, 1.8); win(W * .3, H1 + 1.5, 1.2, 1);
    box(3.2, .1, 1.1, mat(0xe8e8e4), -W * .2, H1 + .2, f + .55, h);
    box(3.2, 1, .06, mat(0xdcdfe2), -W * .2, H1 + .7, f + 1.08, h);
    for (let k = 0; k < 16; k++) box(.03, .9, .03, alu, -W * .2 - 1.55 + k * .207, H1 + .7, f + 1.12, h);
    if (rnd() < .5) { box(2.6, .02, .02, alu, -W * .2, H1 + 2.1, f + .8, h); for (let k = 0; k < 4; k++) box(.4, .55, .02, mat(pick([0xf4f4f0, 0x8ab0d8, 0xf0c0c8, 0xe8e0a0])), -W * .2 - .9 + k * .6, H1 + 1.8, f + .8, h); }
    // the air conditioner's outdoor unit, the gas meter, the back and side windows
    box(.8, .55, .3, mat(0xe4e4e0), W / 2 + .2, .6, D * .2, h);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(.2, 16), mat(0x5a5e66)); fan.rotation.y = Math.PI / 2; fan.position.set(W / 2 + .32, .6, D * .1); h.add(fan);
    box(.3, .4, .15, mat(0xb8bcc2), -W / 2 - .08, 1.2, -D * .2, h);
    for (const sx of [-1, 1]) { box(.07, 1.1, 1.3, glass, sx * (W / 2 + .01), H1 + 1.4, -D * .1, h); box(.07, 1, 1, glass, sx * (W / 2 + .01), 1.5, -D * .2, h); }
    // the front garden: block wall, a gate, a hedge, a mailbox, a nameplate
    const yz = f + 2.4;
    box(W / 2 - 1.1, 1.2, .15, blockWall, -W / 4 - .95 + .4, .6, yz, h);
    box(W / 2 + .2, 1.2, .15, blockWall, W / 4 + .3, .6, yz, h);
    box(.35, 1.4, .35, mat(0xd8d2c6), -W * .28 - .75, .7, yz, h); box(.35, 1.4, .35, mat(0xd8d2c6), -W * .28 + .75, .7, yz, h);
    box(1.15, 1, .05, alu, -W * .28, .6, yz + .05, h);
    box(.28, .18, .02, mat(0xf4f0e6), -W * .28 + .75, 1.2, yz + .19, h);
    for (let k = 0; k < Math.floor(W / 2 / .8); k++) { const m = new THREE.Mesh(hedgeGeo, hedgeMat); m.scale.set(.55, .6, .5); m.position.set(W / 2 - .5 - k * .8, 1.3, yz - .35); h.add(m); }
    for (let k = 0; k < 3; k++) box(.8, .04, .6, mat(0xb8b2a8), -W * .28, .03, f + .5 + k * .7, h);
    // a car in the drive, now and then
    // (parked clear of the facade: its tail would show in the living room)
    if (rnd() < .45) { const col = pick(CARC), kei = rnd() < .55; h.updateMatrix(); const p = new THREE.Vector3(W * .22, 0, f + (kei ? 3.4 : 4.3) / 2 + .1).applyMatrix4(h.matrix); car(p.x, p.z, rot + Math.PI / 2, col, kei); }
    h.updateMatrixWorld();
    const bb = new THREE.Box3(new THREE.Vector3(-W / 2 - .2, 0, -D / 2), new THREE.Vector3(W / 2 + .2, H2, D / 2)).applyMatrix4(h.matrix);
    J.S(h, W / 2, 0, D * .2 - .15, W / 2 + .6, .9, D * .2 + .15); J.S(h, -W / 2 - .23, 1, -D * .2 - .08, -W / 2, 1.4, -D * .2 + .08);
    // inside: genkan, stairs, kitchen, a tatami room, the living room
    const di = D / 2 - WT, wi = W / 2 - WT;
    J.house(h, { W, D, H1, T: WT, dx, DW, DH, wins: [['z', di, W * .14, 1.3, 2.4, 1.7, 1], ['z', di, W * .4, 1.6, .9, 1, 1], ['x', wi, -D * .2, 1.5, 1, 1, 1], ['x', -wi, -D * .2, 1.5, 1, 1, -1]] });
    roofColliders(addBox, { x0: -W / 2 - .6, x1: W / 2 + .6, z0: -D / 2 - .6, z1: D / 2 + .6, y: H2 + .2, h: roof.scale.y, kind: 'hip', matrix: h.matrix });
    contact.rect((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2, bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0, .06);
    // the block wall, open where it is open: the gap is the way in
    J.S(h, -W / 2, 0, yz - .1, -1.1, 1.2, yz + .1); J.S(h, .2, 0, yz - .1, W / 2, 1.2, yz + .1);
    return h;
  };
  // north of street A, facing it
  for (const x of [-66, -54, -41, -28, -3, 9, 21, 33, 45, 58, 70]) house(x, A.z1 + 2.4 + 2.6 + 3.7, Math.PI);
  // west of street B, facing it
  for (const z of [-15, -3, 7]) house(B.x0 - 1.8 - 2.6 - 4, z, Math.PI / 2);
  // east, beyond the shrine, facing street A
  for (const x of [63, 75, 87]) house(x, A.z0 - 2 - 2.6 - 4, 0);

  // ---------- the shrine: a torii, a gravel path, stone lanterns, the hall ----------
  const shrine = new THREE.Group(); g.add(shrine);
  const SX = 50, SZ0 = A.z0 - 2;
  flat(9, 16, new THREE.MeshLambertMaterial({ color: 0xd8d0c0, map: noiseTex('#ffffff', () => { const v = 150 + Math.random() * 100; return `rgba(${v},${v},${v - 8},.45)`; }, [4, 6]) }), SX, .025, SZ0 - 8);
  for (let k = 0; k < 10; k++) box(1.2, .06, .7, mat(0xb8b2a4), SX, .04, SZ0 - 1 - k * 1.3);
  const vermilion = mat(0xd8452a), black = mat(0x1e1e22);
  const torii = new THREE.Group();
  for (const sx of [-1.6, 1.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, 4.2, 12), vermilion); p.position.set(sx, 2.1, 0); torii.add(p); const b = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .35, 12), black); b.position.set(sx, .17, 0); torii.add(b); }
  box(4.4, .28, .3, vermilion, 0, 3.4, 0, torii);
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(5.4, .3, .45), black); kasagi.position.y = 4.25; torii.add(kasagi);
  for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, .45), black); tip.position.set(sx * 2.85, 4.33, 0); tip.rotation.z = sx * .12; torii.add(tip); }
  box(.35, .9, .12, black, 0, 3.8, .05, torii);
  torii.position.set(SX, 0, SZ0 - .8);
  shrine.add(torii);
  addBox(SX - 1.85, 0, SZ0 - 1.05, SX - 1.35, 4, SZ0 - .55); addBox(SX + 1.35, 0, SZ0 - 1.05, SX + 1.85, 4, SZ0 - .55);
  const lantern = (x, z) => {
    const l = new THREE.Group();
    const st = mat(0xa8a296);
    box(.6, .2, .6, st, 0, .1, 0, l); box(.22, 1, .22, st, 0, .7, 0, l); box(.55, .15, .55, st, 0, 1.25, 0, l);
    const fire = box(.36, .36, .36, new THREE.MeshLambertMaterial({ color: 0xf8e0b0, emissive: 0xffb050, emissiveIntensity: .15 }), 0, 1.5, 0, l);
    animated.push({ lamp: fire.material });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.5, .35, 4), st); cap.rotation.y = Math.PI / 4; cap.position.y = 1.85; l.add(cap);
    l.position.set(x, 0, z); shrine.add(l);
    addBox(x - .3, 0, z - .3, x + .3, 2, z + .3);
  };
  for (const k of [0, 1]) { lantern(SX - 1.8, SZ0 - 4 - k * 5); lantern(SX + 1.8, SZ0 - 4 - k * 5); }
  // the hall: raised on posts, a sweeping dark roof, a rope and bell
  const hall = new THREE.Group();
  hall.position.set(SX, 0, SZ0 - 14);
  shrine.add(hall);
  J.S(hall, -3, 0, -2.5, 3, .7, 2.5, mat(0x8a6a4a));
  // the walls round a doorway, and inside the altar (interiors-jp.js)
  J.hall(hall, { wood: mat(0xa87a52) });
  // the lattice front either side of the doors, which open inwards
  const lattice = mat(0xe8dcc0), latBar = mat(0x8a6a4a);
  for (const sx of [-1, 1]) { J.B(hall, sx * .65, .8, 2.09, sx * 1.6, 3, 2.15, lattice); for (let k = 1; k < 4; k++) J.B(hall, sx * (.65 + k * .2375) - .02, .8, 2.15, sx * (.65 + k * .2375) + .02, 3, 2.17, latBar); }
  J.B(hall, -.65, 2.85, 2.09, .65, 3, 2.15, lattice);
  J.door(hall, { x: 0, y: .7, z: 2.1 - .075, w: 1.3, h: 2.12, t: .15, m: J.pal(0xe8dcc0), leaves: 2, handle: J.pal(0x3a2a1e) });
  for (const [px, pz] of [[-2.7, 2.3], [2.7, 2.3], [-2.7, -2.3], [2.7, -2.3]]) J.S(hall, px - .125, 0, pz - .125, px + .125, 3.3, pz + .125, mat(0x6a4a30));
  const hr = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofTile(0x2f343c)); hr.rotation.y = Math.PI / 4; hr.scale.set(5.6, 2.4, 4.8); hr.position.y = 4.4; hall.add(hr);
  box(4.4, .5, 3.6, mat(0x2f343c), 0, 5.6, 0, hall);
  // a veranda before the doors with the offering box on it, broad wooden steps up to it
  J.S(hall, -2.2, 0, 2.5, 2.2, .7, 3.6, mat(0x8a6a4a));
  J.S(hall, -1.4, 0, 3.6, 1.4, .47, 3.9, mat(0x8a6a4a)); J.S(hall, -1.4, 0, 3.9, 1.4, .23, 4.2, mat(0x8a6a4a));
  J.S(hall, -.55, .7, 2.75, .55, 1.3, 3.35, mat(0xa8844a));
  box(.08, 1.6, .08, mat(0xd8c8a0), 0, 2.6, 2.4, hall);
  J.B(hall, -.04, 3.34, 2.36, .04, 3.45, 2.44, J.pal(0x3a2a1e)); J.cyl(hall, .1, .26, J.lit(0xc8a040, .2), 0, 3.2, 2.4, 10, .17);
  J.S(hall, -3, 3.3, -2.6, 3, 4, 2.6);
  contact.rect(SX, SZ0 - 14, 6, 5, 0, .04);
  // a low wall round the precinct
  for (const [x0, z0, x1, z1] of [[SX - 4.6, SZ0 - 17.5, SX - 4.6, SZ0 - .6], [SX + 4.6, SZ0 - 17.5, SX + 4.6, SZ0 - .6], [SX - 4.6, SZ0 - 17.5, SX + 4.6, SZ0 - 17.5]]) {
    const len = Math.hypot(x1 - x0, z1 - z0) + .3;
    const w = box(Math.abs(x1 - x0) + .3, .8, Math.abs(z1 - z0) + .3, blockWall, (x0 + x1) / 2, .4, (z0 + z1) / 2, shrine);
    addBox(Math.min(x0, x1) - .15, 0, Math.min(z0, z1) - .15, Math.max(x0, x1) + .15, .8, Math.max(z0, z1) + .15);
    void len; void w;
  }

  // ---------- the railway: two tracks on ballast, masts and wires, fences ----------
  const TR = [-27.2, -30.8];
  flat(320, RAIL.z1 - RAIL.z0, new THREE.MeshLambertMaterial({ color: 0x8a8278, map: noiseTex('#ffffff', () => { const v = 90 + Math.random() * 140; return `rgba(${v},${v - 8},${v - 16},.5)`; }, [160, 4]) }), 0, .03, (RAIL.z0 + RAIL.z1) / 2);
  const railM = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: .8, roughness: .35 });
  const sleeperGeo = new THREE.BoxGeometry(.24, .12, 2.4);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, mat(0x8c8680), 2 * 400);
  const dm = new THREE.Object3D();
  let si = 0;
  for (const tz of TR) {
    for (const o of [-.53, .53]) box(320, .14, .08, railM, 0, .2, tz + o);
    for (let x = -159; x < 160 && si < 800; x += .8) { dm.position.set(x, .1, tz); dm.updateMatrix(); sleepers.setMatrixAt(si++, dm.matrix); }
  }
  sleepers.count = si; sleepers.receiveShadow = true;
  g.add(sleepers);
  // overhead line masts on the far side, with arms over both tracks
  const wires = [];
  const masts = [];
  for (let x = -150; x <= 150; x += 24) {
    if (Math.abs(x - bx) < 6) continue;
    box(.3, 6.6, .3, mat(0x8a9098), x, 3.3, RAIL.z0 - .5);
    box(.14, .14, 6.4, mat(0x6a7078), x, 6.2, RAIL.z0 + 2.7);
    box(.08, .8, .08, mat(0x6a7078), x, 5.8, TR[0]); box(.08, .8, .08, mat(0x6a7078), x, 5.8, TR[1]);
    addBox(x - .2, 0, RAIL.z0 - .7, x + .2, 6.6, RAIL.z0 - .3);
    masts.push(x);
  }
  for (let k = 0; k + 1 < masts.length; k++) for (const tz of TR) {
    const a = masts[k], b = masts[k + 1];
    wires.push(new THREE.Vector3(a, 5.4, tz), new THREE.Vector3(b, 5.4, tz));
    for (let s = 0; s < 8; s++) { const t0 = s / 8, t1 = (s + 1) / 8; wires.push(new THREE.Vector3(a + (b - a) * t0, 6.1 - Math.sin(t0 * Math.PI) * .45, tz), new THREE.Vector3(a + (b - a) * t1, 6.1 - Math.sin(t1 * Math.PI) * .45, tz)); }
  }
  const catenary = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: 0x2a2e36 }));
  catenary.frustumCulled = false;
  g.add(catenary);
  // fences keep you off the line, except at the platform and the level crossing
  const PL = { x0: 4, x1: 60, z0: RAIL.z1, z1: RAIL.z1 + 3 };
  chain(-160, RAIL.z1 + .1, B.x0 - 3, RAIL.z1 + .1, 1.4); chain(B.x1 + 3, RAIL.z1 + .1, PL.x0, RAIL.z1 + .1, 1.4); chain(PL.x1, RAIL.z1 + .1, 160, RAIL.z1 + .1, 1.4);
  chain(-160, RAIL.z0 - .1, B.x0 - 3, RAIL.z0 - .1, 1.4); chain(B.x1 + 3, RAIL.z0 - .1, 160, RAIL.z0 - .1, 1.4);

  // ---------- the level crossing: bells, flashing lights, striped booms ----------
  const boomTex = canvasTex(256, 16, (c) => { for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? '#1c1c1e' : '#f2c230'; c.fillRect(k * 16, 0, 16, 16); } });
  const booms = [], flashers = [];
  const crossing = (x, z, dir) => {
    const post = new THREE.Group(); post.position.set(x, 0, z); g.add(post);
    box(.14, 3.6, .14, mat(0xf4f4f0), 0, 1.8, 0, post);
    for (let k = 0; k < 6; k++) box(.15, .25, .15, mat(0x1c1c1e), 0, .4 + k * .5, 0, post);
    const cross = new THREE.Group(); cross.position.y = 3.3; post.add(cross);
    for (const r of [.7, -.7]) { const b = box(1.1, .16, .04, mat(0xf2c230), 0, 0, .1, cross); b.rotation.z = r; }
    for (const sx of [-.35, .35]) {
      box(.34, .34, .12, mat(0x1c1c1e), sx, 2.55, .12, post);
      const l = new THREE.Mesh(new THREE.CircleGeometry(.13, 16), new THREE.MeshBasicMaterial({ color: 0x401010 }));
      l.position.set(sx, 2.55, .19); post.add(l); flashers.push({ m: l.material, side: sx });
    }
    box(.5, .5, .5, mat(0x1c1c1e), 0, 1, -.25, post);
    const pivot = new THREE.Group(); pivot.position.set(0, 1, .1); post.add(pivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(6.2, .1, .1), new THREE.MeshLambertMaterial({ map: boomTex }));
    arm.position.x = 3.1 * dir; pivot.add(arm);
    pivot.userData.keep = true;
    booms.push({ pivot, dir });
    post.rotation.y = z > (RAIL.z0 + RAIL.z1) / 2 ? 0 : Math.PI;
    addBox(x - .25, 0, z - .25, x + .25, 3.6, z + .25);
  };
  crossing(B.x0 - .6, RAIL.z1 + .8, 1); crossing(B.x1 + .6, RAIL.z0 - .8, 1);

  // ---------- the station: platform, canopy, building, plaza ----------
  const PH = .95;
  box(PL.x1 - PL.x0, PH, PL.z1 - PL.z0, paving(PL.x1 - PL.x0, PL.z1 - PL.z0), (PL.x0 + PL.x1) / 2, PH / 2, (PL.z0 + PL.z1) / 2);
  box(PL.x1 - PL.x0, .02, .35, tactile, (PL.x0 + PL.x1) / 2, PH + .01, PL.z0 + .75);
  box(PL.x1 - PL.x0, .02, .12, white, (PL.x0 + PL.x1) / 2, PH + .01, PL.z0 + .12);
  addBox(PL.x0, 0, PL.z0, PL.x1, PH, PL.z1);
  // steps up from the plaza, three at a time
  for (let k = 0; k < 3; k++) box(4, (k + 1) * PH / 3, .45, paving(4, .45), 22, (k + 1) * PH / 6, PL.z1 + 1.1 - k * .45);
  for (let k = 0; k < 3; k++) addBox(20, 0, PL.z1 + .9 - k * .45, 24, (k + 1) * PH / 3, PL.z1 + 1.35 - k * .45);
  // the canopy, on steel posts
  for (let x = 14; x <= 50; x += 6) { box(.18, 3.2, .18, mat(0xc8ccd2), x, PH + 1.6, PL.z1 - .6); addBox(x - .12, PH, PL.z1 - .72, x + .12, PH + 3.2, PL.z1 - .48); }
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee, emissive: 0xd8dce4, emissiveIntensity: .25 });
  const canopy = box(38, .15, 3.4, canopyMat, 32, PH + 3.25, PL.z1 - 1.3); canopy.rotation.x = .06;
  box(38, .3, .08, mat(0x5a8ab8), 32, PH + 3.15, PL.z0 + .3);
  for (let x = 15; x < 50; x += 5) box(1.8, .06, .12, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .6 }), x, PH + 3.12, PL.z1 - 1.3);
  const nameTex = sign('桜ヶ丘', { w: 512, h: 192, bg: '#ffffff', color: '#1a1a1a', size: 84, sub: 'さくらがおか · Sakuragaoka', stripe: [[.88, .12, '#e87aa0']] });
  box(2.6, .9, .06, new THREE.MeshLambertMaterial({ map: nameTex }), 28, PH + 2.3, PL.z0 + 1.2);
  // benches, bins, a timetable
  for (const x of [18, 38]) { box(1.8, .08, .45, mat(0x8a5a36), x, PH + .45, PL.z1 - .5); box(1.8, .5, .06, mat(0x8a5a36), x, PH + .7, PL.z1 - .3); box(.1, .45, .4, mat(0x4a4e56), x - .8, PH + .22, PL.z1 - .5); box(.1, .45, .4, mat(0x4a4e56), x + .8, PH + .22, PL.z1 - .5); }
  for (const [k, col] of [[0, 0x2f6cc0], [1, 0x2f9a58], [2, 0xd8262e]]) box(.45, .8, .45, mat(col), 44 + k * .55, PH + .4, PL.z1 - .45);
  // the building on the plaza: a pitched roof, a clock, the name in big letters
  const st = new THREE.Group(); g.add(st);
  st.position.set(34, 0, PL.z1 + 4.2);
  // hollow: in from the plaza, through the ticket gates, out the back onto the platform
  J.station(st, { wall: siding(0xe8e0d0), goodsM, fridgeM: fridge, glassM: kGlass });
  const sr = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofTile(0x3a4150)); sr.rotation.y = Math.PI / 4; sr.scale.set(11, 2, 5.4); sr.position.y = 5; st.add(sr);
  box(15.2, .15, 7.2, mat(0x2f343c), 0, 4.02, 0, st);
  const bigName = sign('桜ヶ丘駅', { w: 1024, h: 192, bg: '#fbf6ee', color: '#2a2a2e', size: 120, stripe: [[.9, .1, '#e87aa0']] });
  box(6, 1.1, .08, new THREE.MeshLambertMaterial({ map: bigName, emissive: 0xffffff, emissiveMap: bigName, emissiveIntensity: .1 }), 0, 3.3, 3.05, st);
  const clockTex = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 4; c.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.fillStyle = '#222'; c.fillRect(64 + Math.cos(a) * 50 - 2, 64 + Math.sin(a) * 50 - 2, 4, 4); } c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 26); c.moveTo(64, 64); c.lineTo(92, 70); c.stroke(); });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(.45, 24), new THREE.MeshLambertMaterial({ map: clockTex })); clock.position.set(3.8, 3.3, 3.06); st.add(clock);
  box(4, 2.4, .06, shop, -2.5, 1.3, 3.02, st);
  box(3, .1, 1.2, mat(0xd8d8d4), -2.5, 2.6, 3.6, st);
  contact.rect(34, PL.z1 + 4.2, 14, 6, 0, .08);
  // the plaza: paving, a flower bed, bollards, a bus stop, a clock on a pole, a mailbox
  const PZ = { x0: 10, x1: 44, z0: PL.z1 + 7.2, z1: A.z0 - 2 - 12.6 };
  const pzD = Math.max(2, PZ.z1 - PZ.z0);
  box(PZ.x1 - PZ.x0 - 10, .06, pzD + 6, paving(PZ.x1 - PZ.x0 - 10, pzD + 6), (PZ.x0 + PZ.x1) / 2 - 5, .03, PZ.z0 + (pzD + 6) / 2 - 3);
  const bed = new THREE.Group(); bed.position.set(18, 0, PZ.z0 + 2.5); g.add(bed);
  box(4, .5, 1.4, mat(0xc8c2b6), 0, .25, 0, bed);
  for (let k = 0; k < 18; k++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 5), mat(pick([0xe8384f, 0xf6d23a, 0xf4f0f4, 0xf08ab0]))); fl.position.set(-1.7 + (k % 9) * .42, .65, -.3 + Math.floor(k / 9) * .6); bed.add(fl); const stem = box(.03, .2, .03, mat(0x4a8a3a), fl.position.x, .55, fl.position.z, bed); void stem; }
  addBox(16, 0, PZ.z0 + 1.8, 20, .5, PZ.z0 + 3.2);
  const ck = new THREE.Group(); ck.position.set(24, 0, PZ.z0 + 3); g.add(ck);
  box(.12, 3.4, .12, mat(0x2f343c), 0, 1.7, 0, ck);
  for (const r of [0, Math.PI]) { const c2 = new THREE.Mesh(new THREE.CircleGeometry(.36, 24), new THREE.MeshLambertMaterial({ map: clockTex })); c2.position.set(0, 3.4, r ? -.07 : .07); c2.rotation.y = r; ck.add(c2); }
  box(.8, .8, .12, mat(0x2f343c), 0, 3.4, 0, ck);
  addBox(23.9, 0, PZ.z0 + 2.9, 24.1, 3.4, PZ.z0 + 3.1);
  const busTex = sign('桜ヶ丘駅前', { w: 512, h: 128, bg: '#ffffff', color: '#1a1a1a', size: 60, stripe: [[0, .18, '#d8262e']] });
  const bus = new THREE.Group(); bus.position.set(40, 0, A.z0 - 2 - .8); g.add(bus);
  box(.1, 2.6, .1, mat(0x9aa0a8), 0, 1.3, 0, bus); const bs = new THREE.Mesh(new THREE.CircleGeometry(.4, 24), new THREE.MeshLambertMaterial({ map: busTex })); bs.position.set(0, 2.7, .06); bus.add(bs);
  box(3.6, .08, 1.4, new THREE.MeshLambertMaterial({ color: 0xcfe0ea, transparent: true, opacity: .5 }), -3, 2.5, -.3, bus);
  for (const px of [-4.6, -1.4]) box(.08, 2.5, .08, mat(0x2f6a5a), px, 1.25, -.8, bus);
  box(2.2, .08, .4, mat(0x8a5a36), -3, .45, -.6, bus);
  const mailbox = new THREE.Group(); mailbox.position.set(13, 0, PZ.z0 + 4.5); g.add(mailbox);
  box(.5, 1, .45, mat(0xd8262e), 0, .7, 0, mailbox); const mt = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .45, 12, 1, false, 0, Math.PI), mat(0xd8262e)); mt.rotation.z = Math.PI / 2; mt.rotation.y = Math.PI / 2; mt.position.y = 1.2; mailbox.add(mt);
  box(.2, .2, .2, mat(0x2f343c), 0, .1, 0, mailbox);
  addBox(12.7, 0, PZ.z0 + 4.2, 13.3, 1.4, PZ.z0 + 4.8);
  for (let k = 0; k < 6; k++) { box(.14, .8, .14, mat(0x6a7078), 12 + k * 1.4, .4, A.z0 - 2 - .25); }
  // a traffic mirror and a stop sign at the corner
  const corner = new THREE.Group(); corner.position.set(B.x1 + 1.1, 0, A.z0 - 1.2); g.add(corner);
  box(.1, 3.2, .1, mat(0xe8742a), 0, 1.6, 0, corner);
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(.45, 24), new THREE.MeshStandardMaterial({ color: 0xdde8f0, metalness: .9, roughness: .1 })); mirror.position.set(0, 3.3, .08); mirror.rotation.y = -.6; corner.add(mirror);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .05, 6, 24), mat(0xe8742a)); ring.position.copy(mirror.position); ring.rotation.y = -.6; corner.add(ring);
  const stopTex = canvasTex(128, 128, (c) => { c.fillStyle = '#d8262e'; c.beginPath(); c.moveTo(4, 8); c.lineTo(124, 8); c.lineTo(64, 120); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 6; c.stroke(); c.fillStyle = '#fff'; c.font = `700 30px ${JP_FONT}`; c.textAlign = 'center'; c.fillText('止まれ', 64, 52); });
  const stopS = new THREE.Mesh(new THREE.PlaneGeometry(.8, .8), new THREE.MeshLambertMaterial({ map: stopTex, transparent: true, alphaTest: .5 }));
  const stopPost = new THREE.Group(); stopPost.position.set(B.x1 + 1, 0, A.z1 + 1.6); g.add(stopPost);
  box(.07, 2.4, .07, mat(0x9aa0a8), 0, 1.2, 0, stopPost); stopS.position.set(0, 2.3, -.05); stopS.rotation.y = Math.PI; stopPost.add(stopS);
  addBox(B.x1 + 1, 0, A.z0 - 1.3, B.x1 + 1.2, 3.2, A.z0 - 1.1);

  // ---------- utility poles along both streets, wires dropping to the houses ----------
  const polesA = createPoles({ parent: g, addBox, points: Array.from({ length: 21 }, (_, k) => -150 + k * 15).filter(x => Math.abs(x - bx) > 6 && Math.abs(x - SX) > 3).map(x => [x, A.z0 - 1.05]), seed: 3 });
  createPoles({ parent: g, addBox, points: Array.from({ length: 10 }, (_, k) => A.z1 + 6 + k * 15).map(z => [B.x1 + .8, z, Math.PI / 2]), seed: 8 });
  createPoles({ parent: g, addBox, points: [RAIL.z1 + 3, RAIL.z1 + 18, A.z0 - 3.2].map(z => [B.x0 - .9, z, Math.PI / 2]), seed: 9 });
  polesA.heads.forEach((p, k) => { if (k % 2 === 0) polesA.drop(k, new THREE.Vector3(p.position.x + 3, 5.2, A.z1 + 2.4 + 2.6 + 3.7 - 3.6)); });
  // a street light on some poles
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: .1 });
  const poolTex = canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(.45, 'rgba(255,225,180,.4)'); gr.addColorStop(1, 'rgba(255,210,160,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const pools = [];
  const pool = (x, z, r, y = .2) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(r, r), poolMat); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.userData.keep = true; p.renderOrder = 2; g.add(p); pools.push(p); };
  polesA.heads.forEach((p, k) => { if (k % 2) { box(.08, .08, 1.4, mat(0x6a7078), p.position.x, 5.4, p.position.z + .7); box(.35, .12, .5, lampMat, p.position.x, 5.3, p.position.z + 1.35); pool(p.position.x, p.position.z + 2.2, 9); } });
  pool(0, kz + 1.6, 9); pool(-8, -11.6, 4); pool(30, PL.z1 - 1.3, 12, PH + .03); pool(20, PL.z1 - 1.3, 10, PH + .03); pool(40, PL.z1 - 1.3, 10, PH + .03); pool(34, PL.z1 + 8.5, 9);

  // ---------- cherry trees: the shrine, the plaza, the station, the gardens ----------
  const blossoms = createBlossoms({ parent: g, addBox, seed: 5 });
  // (kept clear of the houses and the hall: their branches would poke into the rooms)
  for (const [x, z, s] of [[SX - 3.4, SZ0 - 3, 1.1], [SX + 3.4, SZ0 - 8, 1.2], [SX - 3.6, SZ0 - 19.6, 1], [SX + 3.8, SZ0 - 19.9, 1.05],
    [30, PZ.z0 + 5, 1.35], [14, -8, 1], [17, -2, .9], [B.x0 - 1, -10, 1], [B.x0 - 1, 2, .95],
    [9.5, -21.5, .85], [48, PL.z1 + 5.6, 1.1], [56, PL.z1 + 4.5, 1], [-26, RAIL.z1 + 5, 1.1], [-40, RAIL.z1 + 5, 1], [-55, RAIL.z1 + 4.5, 1.05],
    [-60, A.z1 + 10.5, .9], [3.5, A.z1 + 2, .85], [39, A.z1 + 2, .9], [64, A.z1 + 2, .95], [-34, A.z1 + 10.5, .8],
    [-34.5, 4, .9], [-34.5, -12, .95]]) blossoms.tree(x, z, s);
  const scatter = [];
  for (let k = 0; k < 40; k++) scatter.push([-80 + rnd() * 160, az + (rnd() - .5) * 6, .6 + rnd() * 1.2]);
  for (let k = 0; k < 16; k++) scatter.push([bx + (rnd() - .5) * 6, -20 + rnd() * 80, .6 + rnd() * 1]);
  for (let k = 0; k < 12; k++) scatter.push([12 + rnd() * 40, PL.z1 + 1 + rnd() * 8, .6 + rnd() * 1.4]);
  blossoms.finish({ scatter });
  for (const t of blossoms.trees) contact.blob(t.x, t.z, t.r * .8, .06);

  // ---------- the kimono shop, north of the main street, past the last house ----------
  japanBoutique({ parent: g, addBox, interactables, origin: CHINA, sign });

  // ---------- people: on the pavements, round the plaza, waiting on the platform ----------
  const walkers = createWalkers({ parent: g, seed: 17, style: 'japon', clothes: [0x1d2a48, 0xf4f4f2, 0xd8c8a8, 0x2a2a2e, 0x8a9ab0, 0xe8a0b8, 0x4a6a8a, 0xc8b890], paths: [
    [[-100, A.z1 + 1.2], [B.x0 - 1, A.z1 + 1.2]], [[B.x1 + 1, A.z1 + 1.2], [100, A.z1 + 1.2]],
    [[-100, A.z0 - .9], [B.x0 - 1, A.z0 - .9]], [[B.x1 + 1, A.z0 - .7], [100, A.z0 - .7]],
    [[B.x1 + .8, RAIL.z1 + 2], [B.x1 + .8, A.z0 - 2]], [[B.x1 + .8, A.z1 + 3], [B.x1 + .8, 100]],
    [[12, PZ.z0 + 1], [40, PZ.z0 + 1], [40, PZ.z1 - 1], [12, PZ.z1 - 1]],
  ] });
  for (const [x, rot] of [[17.6, 0], [18.4, 0], [38.2, 0]]) walkers.sit(x, PH + .45, PL.z1 - .45, Math.PI + rot);
  contact.finish();

  // ---------- the town beyond: houses and apartment blocks, then the hills ----------
  const far = new THREE.Group(); g.add(far);
  // far houses: one box with a painted facade, two floors of windows on every side
  const farTex = WALLC.map(col => {
    const t = canvasTex(256, 128, (c) => {
      c.fillStyle = '#' + col.toString(16).padStart(6, '0'); c.fillRect(0, 0, 256, 128);
      for (let y = 0; y < 128; y += 6) { c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(0, y + 4, 256, 1.5); }
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 58, 256, 4);
      for (const [x, y, w, h] of [[24, 14, 60, 32], [150, 18, 34, 26], [40, 76, 70, 36], [160, 80, 40, 30], [214, 80, 24, 30]]) { c.fillStyle = '#c4c9d0'; c.fillRect(x - 3, y - 3, w + 6, h + 6); c.fillStyle = '#7f9ab0'; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y, w, h * .3); }
      c.fillStyle = '#e4e4e0'; c.fillRect(18, 44, 76, 6);
    });
    return new THREE.MeshLambertMaterial({ map: t });
  });
  const farHouse = (x, z, r) => {
    const w = 7 + rnd() * 3, d = 7 + rnd() * 2, h = 5.2 + rnd() * .8;
    const b = box(w, h, d, pick(farTex), x, h / 2, z, far); b.rotation.y = r;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofTile(pick(ROOFC))); rf.rotation.y = r + Math.PI / 4; rf.scale.set((w + 1) * .71, 1.8, (d + 1) * .71); rf.position.set(x, h + .85, z); far.add(rf);
  };
  const mansion = (x, z, r, floors) => {
    const w = 18 + rnd() * 10, d = 9, h = floors * 2.9;
    const b = box(w, h, d, mat(pick([0xeeebe4, 0xe2ddd2, 0xd6dde2])), x, h / 2, z, far); b.rotation.y = r;
    const t = canvasTex(256, 256, (c) => { c.fillStyle = '#f0ede6'; c.fillRect(0, 0, 256, 256); for (let f = 0; f < 8; f++) { c.fillStyle = '#c8ccd2'; c.fillRect(0, f * 32 + 20, 256, 12); for (let k = 0; k < 8; k++) { c.fillStyle = '#7f9ab0'; c.fillRect(k * 32 + 6, f * 32 + 4, 20, 16); } } });
    t.repeat.set(w / 12, floors / 8); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
    face.position.set(x + Math.sin(r) * (d / 2 + .02), h / 2, z + Math.cos(r) * (d / 2 + .02)); face.rotation.y = r; far.add(face);
  };
  for (let x = -150; x <= 150; x += 11) {
    for (const [z0, r] of [[42, Math.PI], [56, Math.PI], [72, Math.PI], [-44, 0], [-58, 0], [-74, 0]]) if (rnd() < .82) farHouse(x + (rnd() - .5) * 3, z0 + (rnd() - .5) * 3, r);
  }
  for (const [x, z, r, f] of [[-70, 95, Math.PI, 6], [-20, 110, Math.PI, 8], [35, 100, Math.PI, 5], [90, 92, Math.PI, 7], [-95, -100, 0, 6], [10, -112, 0, 9], [70, -96, 0, 5], [130, 20, -Math.PI / 2, 6], [-130, -10, Math.PI / 2, 7]]) mansion(x, z, r, f);
  const hillMat = mat(0x8aa6a0);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + rnd() * .3, r = 230 + rnd() * 50;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    m.scale.set(80 + rnd() * 60, 22 + rnd() * 26, 60 + rnd() * 30);
    m.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    far.add(m);
  }

  // ---------- the train: three cars, cream with a pink band; it comes, stops, and goes ----------
  const train = new THREE.Group(); train.userData.keep = true; g.add(train);
  const carTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#f4f0e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e87aa0'; c.fillRect(0, 88, w, 12); c.fillStyle = '#c85a86'; c.fillRect(0, 100, w, 4);
    for (let k = 0; k < 4; k++) { const x = 20 + k * 124; c.fillStyle = '#c8ccd2'; c.fillRect(x, 18, 40, 94); c.fillStyle = '#3a4a5a'; c.fillRect(x + 4, 24, 14, 40); c.fillRect(x + 22, 24, 14, 40); }
    for (let k = 0; k < 4; k++) { const x = 72 + k * 124; c.fillStyle = '#3a4a5a'; c.fillRect(x, 26, 60, 36); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(x + 4, 28, 20, 4); }
    c.fillStyle = '#9aa0a8'; c.fillRect(0, 112, w, 16);
  });
  const carMat = new THREE.MeshLambertMaterial({ map: carTex }), carEnd = mat(0xf4f0e6), under = mat(0x3a3e46);
  const CAR = 18, trainWheels = [];
  for (let k = 0; k < 3; k++) {
    const car = new THREE.Group(); car.position.x = k * (CAR + .6);
    const body = new THREE.Mesh(V.roundBox(CAR, 3, 2.8, .32, 2), [carEnd, carEnd, mat(0xe8e4dc), under, carMat, carMat]);
    body.position.y = 2.25; car.add(body);
    box(CAR - 2, .7, 2.2, under, 0, .55, 0, car);
    for (const bxo of [-CAR / 2 + 2.5, CAR / 2 - 2.5]) {
      box(2.6, .5, 2.4, mat(0x2a2c30), bxo, .5, 0, car);
      for (const wx of [-.75, .75]) for (const wz of [-1.18, 1.18]) { const w = V.wheel({ r: .42, w: .14, rim: mat(0x8a8e96), tyre: mat(0x2a2c30), spokes: 0 }); w.position.set(bxo + wx, .42, wz); if (wz < 0) w.rotation.y = Math.PI; car.add(w); trainWheels.push(w); }
    }
    if (k === 1) { box(1.6, .08, 1, mat(0x2a2c30), 0, 4.1, 0, car); const pa = box(1.6, .06, .06, mat(0x2a2c30), 0, 4.8, 0, car); pa.rotation.z = .5; box(1.2, .05, 1.2, mat(0x5a5e66), .6, 5.3, 0, car); }
    train.add(car);
  }
  // the cab ends: a dark windscreen and two headlights
  for (const [xo, s] of [[-CAR / 2 - .02, -1], [2 * (CAR + .6) + CAR / 2 + .02, 1]]) {
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), mat(0x2a3a4a)); ws.position.set(xo + s * .01, 3, 0); ws.rotation.y = s * Math.PI / 2; train.add(ws);
    for (const zz of [-.8, .8]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(.16, 14), V.lamp(0xfff6d8, 2.6)); hl.position.set(xo + s * .02, 1.6, zz); hl.rotation.y = s * Math.PI / 2; train.add(hl); }
  }
  train.position.set(-300, 0, TR[0]);
  train.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const TLEN = 3 * CAR + 1.2;
  const STOP_X = (PL.x0 + PL.x1) / 2 - TLEN / 2 + CAR / 2;
  let tState = 'wait', tT = 8, tX = -300, tV = 0;
  const trainCollider = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  colliders.push(trainCollider);

  // everything that doesn't move: a few merged meshes
  mergeStatic(g, (o) => o === train || o.userData.keep || booms.some(b => b.pivot === o) || flashers.some(f => f.m === o.material) || o === sleepers);
  // the rooms sit in shut boxes: they need not cast shadows
  for (const o of g.children) if (o.material === J.palM) o.castShadow = false;

  let t = 0, night = 0, doorOpen = 0, playerPos = null;
  const doorBox = { min: new THREE.Vector3(cx + DX0, 0, cz + kz - .12), max: new THREE.Vector3(cx + DX1, 2.7, cz + kz) };
  colliders.push(doorBox);
  return {
    group: g, interiors: J, walkers,
    spawn: new THREE.Vector3(cx, 0.05, cz - 10.4),
    // for pictures and tests: the train waiting at the platform
    set playerPos(f) { playerPos = f; },
    parkTrain() { tState = 'stop'; tT = 1e9; tX = STOP_X; },
    setNight(n) {
      night = n;
      glass.emissiveIntensity = n * 1.2;
      shop.emissiveIntensity = .35 + n * .35;
      lampMat.emissiveIntensity = .1 + n * 2.5;
      for (const a of animated) { if (a.vend) a.vend.emissiveIntensity = .3 + n * 1.1; if (a.lamp) a.lamp.emissiveIntensity = .15 + n * 1.6; }
      blossoms.setNight(n);
      J.setNight(n);
      poolMat.opacity = n * .32; pools.forEach(p => { p.visible = n > .02; });
    },
    update(dt) {
      t += dt;
      // the train: arrives from the west, stops at the platform, leaves east, comes back round
      if (tState === 'wait') { tT -= dt; if (tT <= 0) { tState = 'in'; tX = -260; tV = 16; } }
      else if (tState === 'in') {
        const left = STOP_X - tX;
        tV = Math.max(1.2, Math.min(16, Math.sqrt(Math.max(0, left) * 2 * 1.4)));
        tX += tV * dt;
        if (left <= .05) { tX = STOP_X; tV = 0; tState = 'stop'; tT = 14; }
      } else if (tState === 'stop') { tT -= dt; if (tT <= 0) tState = 'out'; }
      else if (tState === 'out') { tV = Math.min(18, tV + 1.1 * dt); tX += tV * dt; if (tX > 260) { tState = 'wait'; tT = 25 + Math.random() * 20; tX = -300; } }
      for (const w of trainWheels) w.spin.rotation.z -= (w.rotation.y ? -1 : 1) * (tX - train.position.x) / .42;
      train.position.x = tX;
      trainCollider.min.set(cx + tX - CAR / 2, 0, cz + TR[0] - 1.5); trainCollider.max.set(cx + tX + TLEN - CAR / 2, 4, cz + TR[0] + 1.5);
      // the crossing rings while the train is anywhere near it
      const near = tX + TLEN > bx - 70 && tX < bx + 20;
      for (const b of booms) b.pivot.rotation.z += ((near ? 0 : 1.45) * b.dir - b.pivot.rotation.z) * Math.min(1, dt * 1.5);
      const on = Math.sin(t * 7) > 0;
      for (const f of flashers) f.m.color.setHex(near && (on === f.side > 0) ? 0xff3020 : 0x401010);
      void night;
      walkers.update(dt);
      clerkRig.update(dt);
      // the automatic door: open while someone stands near it
      const p = playerPos?.();
      const want = p && Math.abs(p.x - cx - (DX0 + DX1) / 2) < 2.2 && Math.abs(p.z - cz - kz) < 2.2 ? 1 : 0;
      doorOpen += (want - doorOpen) * Math.min(1, dt * 6);
      const half = (DX1 - DX0) / 4;
      for (const [pane, fr, k] of doorPanes) { const x = (DX0 + DX1) / 2 + (k ? 1 : -1) * (half + doorOpen * half * 1.9); pane.position.x = x; fr.position.x = x; }
      doorBox.off = doorOpen > .5;
      J.update(dt);
    },
  };
}
