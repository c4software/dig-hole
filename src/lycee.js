// lycée.js, the village's lycée, across the back lane behind our garden (between two of the back
// row's houses): three floors of red brick and pale stone in the old republic's style, its name
// over the gate and on the front, a paved forecourt on the lane, a railing with a double gate, a
// yard with bike racks and a flagpole. And, for the blockade (blocus.js), its props: a barricade
// of bins, pallets and crowd barriers against the gate, bins that burn, crates of mortar tubes.
// Everything is static and merged but the gate's leaves and the blockade's props.
//   frame: the one of blocus-sim.js, turned the world's way (x along the lane, +z to the school)
import * as THREE from 'three';
import { canvasTex } from './lib/tex.js';
import { mergeStatic } from './merge.js';
import { FIRES, TUBES, BARRICADE, BAG } from './blocus-sim.js';

export const LYCEE = { x: 38, z: 52 };            // the frame's origin in the world (the lane's edge)
export const NAME = 'LYCÉE JEAN-CREUSE';
const SERIF = 'Georgia, "Times New Roman", serif';
const GATE_Z = 5, GATE_W = 2.2, YARD_Z = 10, BW = 11, BD = 14, FLOOR = 3.4;

export function createLycee({ parent, colliders }) {
  const root = new THREE.Group(); root.position.set(LYCEE.x, 0, LYCEE.z); parent.add(root);
  const W = (x, z) => [LYCEE.x + x, LYCEE.z + z];
  const solid = (x0, y0, z0, x1, y1, z1) => { const [a, b] = W(Math.min(x0, x1), Math.min(z0, z1)), [c, d] = W(Math.max(x0, x1), Math.max(z0, z1)); const box = { min: new THREE.Vector3(a, y0, b), max: new THREE.Vector3(c, y1, d) }; colliders.push(box); return box; };
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return mats.get(k); };
  const box = (w, h, d, m, x, y, z, p = root) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  const cyl = (r, h, m, x, y, z, p = root, seg = 10, r2 = r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m); c.position.set(x, y, z); p.add(c); return c; };
  const flat = (w, d, m, x, y, z, p = root) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); f.rotation.x = -Math.PI / 2; f.position.set(x, y, z); f.receiveShadow = true; p.add(f); return f; };
  const lettering = (text, { w = 1024, h = 128, color = '#2a2a2a', size = 80, bg = null, font = SERIF, weight = 700, spacing = 10 } = {}) => canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
    // as big as asked, but never wider than the board
    c.font = `${weight} ${size}px ${font}`;
    const fit = Math.min(1, w * .92 / c.measureText(text).width);
    if (fit < 1) c.font = `${weight} ${Math.floor(size * fit)}px ${font}`;
    c.fillText(text, w / 2, h / 2 + 2);
  });

  // ---------- materials ----------
  const brickTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#c9c1b4'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 * 16; x < 272; x += 32) {
      const v = Math.random() * 30;
      c.fillStyle = `rgb(${178 + v},${82 + v * .6},${58 + v * .4})`; c.fillRect(x + 1, y + 1, 30, 14);
    }
  }, [1, 1]);
  const brick = (rx, ry) => { const k = 'br' + rx + ',' + ry; if (!mats.has(k)) { const t = brickTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); mats.set(k, new THREE.MeshLambertMaterial({ map: t })); } return mats.get(k); };
  const stone = mat(0xe8dfcc), stoneD = mat(0xcfc4ae), slate = mat(0x4d5563), iron = mat(0x23282e), white = mat(0xf4f0e6);
  const winTex = canvasTex(64, 64, (c) => { const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#e4f0fa'); gr.addColorStop(.55, '#94b4cc'); gr.addColorStop(1, '#5d7a92'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(8, 64); c.lineTo(30, 0); c.lineTo(40, 0); c.lineTo(18, 64); c.fill(); });
  const glass = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffd8a0, emissiveIntensity: 0 });

  // ---------- the forecourt, the yard ----------
  const pave = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * 8; x < 136; x += 16) { const v = 200 + Math.random() * 55; c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(x + 1, y + 1, 14, 14); } }, [12, 3]);
  flat(24.4, 6, new THREE.MeshLambertMaterial({ color: 0xd4ccbe, map: pave }), 0, .035, 2);
  const tarmac = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let n = 0; n < 1500; n++) { const v = 150 + Math.random() * 100; c.fillStyle = `rgba(${v},${v},${v + 6},.4)`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } }, [6, 2]);
  const yard = flat(24, BD + 5, new THREE.MeshLambertMaterial({ color: 0x8e929a, map: tarmac }), 0, .03, GATE_Z + (BD + 5) / 2);
  void yard;
  // a hopscotch on the yard, a basket hoop on the side fence
  for (let k = 0; k < 6; k++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), white); q.rotation.x = -Math.PI / 2; q.position.set(-9 + (k === 3 || k === 4 ? (k === 3 ? -.3 : .3) : 0), .04, 6 + k * .6); root.add(q); }

  // ---------- the railing along the forecourt, with its gate; the yard's side railings ----------
  const railing = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), along = z0 === z1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(along ? len : .35, .55, along ? .35 : len, stone, cx, .27, cz);
    box(along ? len : .06, .06, along ? .06 : len, iron, cx, 1.85, cz);
    box(along ? len : .06, .06, along ? .06 : len, iron, cx, .9, cz);
    for (let t = .12; t < len; t += .16) { const b = box(.035, 1.4, .035, iron, along ? x0 + t : cx, 1.25, along ? cz : z0 + t); b.userData.bar = true; }
    solid(Math.min(x0, x1) - .18, 0, Math.min(z0, z1) - .18, Math.max(x0, x1) + .18, 1.95, Math.max(z0, z1) + .18);
  };
  railing(-12, GATE_Z, -GATE_W - .35, GATE_Z); railing(GATE_W + .35, GATE_Z, 12, GATE_Z);
  railing(-12, GATE_Z, -12, YARD_Z); railing(12, GATE_Z, 12, YARD_Z);
  // the gate's two stone pillars, the name over it on an iron arch
  for (const s of [-1, 1]) { box(.6, 3.1, .6, stone, s * (GATE_W + .3), 1.55, GATE_Z); box(.75, .15, .75, stoneD, s * (GATE_W + .3), 3.15, GATE_Z); cyl(.2, .25, stoneD, s * (GATE_W + .3), 3.35, GATE_Z, root, 10); solid(s * (GATE_W + .3) - .3, 0, GATE_Z - .3, s * (GATE_W + .3) + .3, 3.4, GATE_Z + .3); }
  box(GATE_W * 2 + .3, .08, .08, iron, 0, 3.05, GATE_Z); box(GATE_W * 2 + .3, .08, .08, iron, 0, 4.05, GATE_Z);
  const arch = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W * 2 + .6, .85), new THREE.MeshLambertMaterial({ map: lettering(NAME, { w: 1024, h: 160, size: 92, color: '#1d2430', bg: '#efe6cf', spacing: 6 }), emissive: 0xffffff, emissiveIntensity: .12 }));
  arch.material.emissiveMap = arch.material.map;
  arch.position.set(0, 3.55, GATE_Z - .05); arch.rotation.y = Math.PI; root.add(arch);
  const archBack = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W * 2 + .6, .85), mat(0x23282e)); archBack.position.set(0, 3.55, GATE_Z + .05); root.add(archBack);
  // the leaves: hinged on the pillars, swing into the yard
  const leafGeo = [];
  const leaf = (s) => {
    const p = new THREE.Group(); p.position.set(s * GATE_W, 0, GATE_Z); p.userData.keep = true; root.add(p);
    const q = (w, h, d, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), iron); m.position.set(x, y, 0); p.add(m); };
    q(GATE_W, .08, .06, -s * GATE_W / 2, .2); q(GATE_W, .08, .06, -s * GATE_W / 2, 1.1); q(GATE_W, .08, .06, -s * GATE_W / 2, 2.1);
    for (let t = .1; t < GATE_W; t += .15) q(.04, 2.1, .04, -s * t, 1.15);
    for (let t = .1; t < GATE_W; t += .15) { const tip = new THREE.Mesh(new THREE.ConeGeometry(.04, .14, 4), iron); tip.position.set(-s * t, 2.25, 0); p.add(tip); }
    leafGeo.push(p);
    return p;
  };
  const leaves = [leaf(-1), leaf(1)];
  const gateCol = solid(-GATE_W, 0, GATE_Z - .12, GATE_W, 2.3, GATE_Z + .12);

  // ---------- the school: brick between stone chains, three floors, a slate hip roof ----------
  const Z0 = YARD_Z, Z1 = YARD_Z + BD, H = FLOOR * 3 + .5;
  box(BW * 2, H, BD, brick(10, 5), 0, H / 2, (Z0 + Z1) / 2);
  solid(-BW, 0, Z0, BW, H + 3.6, Z1);
  // stone: the plinth, the bands between floors, the corners, the cornice
  box(BW * 2 + .12, .7, BD + .12, stoneD, 0, .35, (Z0 + Z1) / 2);
  for (let f = 1; f <= 3; f++) box(BW * 2 + .1, .22, BD + .1, stone, 0, f * FLOOR + .1, (Z0 + Z1) / 2);
  box(BW * 2 + .5, .4, BD + .5, stone, 0, H + .1, (Z0 + Z1) / 2);
  for (const sx of [-1, 1]) for (const sz of [Z0, Z1]) for (let k = 0; k < 9; k++) box(.7, .5, .7, k % 2 ? stone : stoneD, sx * (BW - .3), .5 + k * 1.15, sz + (sz === Z0 ? .3 : -.3));
  // the central bay stands forward, crowned with a pediment and a clock
  box(6, H + 1.3, .5, stone, 0, (H + 1.3) / 2, Z0 - .2);
  const ped = new THREE.Shape(); ped.moveTo(-3.3, 0); ped.lineTo(3.3, 0); ped.lineTo(0, 1.9); ped.closePath();
  const pedM = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: .6, bevelEnabled: false }), stone); pedM.position.set(0, H + 1.3, Z0 - .5); root.add(pedM);
  const clockTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#f6f2e6'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.strokeStyle = '#1d2430'; c.lineWidth = 6; c.stroke();
    c.fillStyle = '#1d2430'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); }
    c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 28); c.moveTo(64, 64); c.lineTo(92, 64); c.stroke();
  });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(.62, 24), new THREE.MeshLambertMaterial({ map: clockTex })); clock.position.set(0, H + 1.95, Z0 - .52); clock.rotation.y = Math.PI; root.add(clock);
  // the name, in big letters, on the attic over the entrance
  const nameM = new THREE.Mesh(new THREE.PlaneGeometry(9, .7), new THREE.MeshLambertMaterial({ map: lettering(NAME, { w: 2048, h: 160, size: 118, color: '#1d2430', bg: '#efe6cf', spacing: 14 }) }));
  nameM.position.set(0, H + .8, Z0 - .56); nameM.rotation.y = Math.PI; root.add(nameM);
  box(9.4, 1, .35, stone, 0, H + .8, Z0 - .35);
  // windows: tall, white frames, a stone sill; the central bay has the door below
  for (let f = 0; f < 3; f++) {
    const y = f * FLOOR + 2;
    for (let k = 0; k < 9; k++) {
      const x = -BW + 1.6 + k * ((BW * 2 - 3.2) / 8);
      if (Math.abs(x) < 3.2 && f === 0) continue;
      const z = Math.abs(x) < 3.2 ? Z0 - .46 : Z0 - .02;
      box(1.25, 2, .08, white, x, y, z); box(1.05, 1.8, .08, glass, x, y, z - .02);
      box(.06, 1.8, .1, white, x, y, z - .04); box(1.05, .06, .1, white, x, y + .3, z - .04);
      box(1.45, .12, .3, stone, x, y - 1.05, z - .1);
    }
    // the side walls too
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) { const zz = Z0 + 1.6 + k * 2.7; box(.08, 2, 1.25, white, sx * (BW + .02), y, zz); box(.08, 1.8, 1.05, glass, sx * (BW + .04), y, zz); }
  }
  // the entrance: a double door under a glass canopy, three steps
  box(2.6, 2.9, .12, stone, 0, 1.45 + .45, Z0 - .5);
  box(2.2, 2.5, .1, mat(0x2a4a6a), 0, 1.25 + .45, Z0 - .55);
  box(.05, 2.5, .12, iron, 0, 1.25 + .45, Z0 - .57);
  for (let k = 0; k < 3; k++) { box(3.6 - k * .3, .15, .5, stoneD, 0, .075 + k * .15, Z0 - .7 - (2 - k) * .45); }
  solid(-1.8, 0, Z0 - 2.1, 1.8, .45, Z0);
  const canopy = box(3.4, .08, 1.3, new THREE.MeshLambertMaterial({ color: 0xbcd4e0, transparent: true, opacity: .6 }), 0, 3.4, Z0 - 1.1); void canopy;
  for (const s of [-1, 1]) box(.05, .05, 1.3, iron, s * 1.6, 3.35, Z0 - 1.1);
  // the roof: slate hip, dormers
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), slate); roof.rotation.y = Math.PI / 4; roof.scale.set(BW * 1.5, 3.4, BD * .74); roof.position.set(0, H + .3 + 1.7, (Z0 + Z1) / 2); root.add(roof);
  for (const x of [-7, -3.5, 3.5, 7]) { box(1.1, 1.1, 1.2, slate, x, H + 1.1, Z0 + 1.6); box(.8, .8, .05, glass, x, H + 1.05, Z0 + .98); }
  // chimneys
  for (const x of [-8, 8]) box(.8, 2.2, .8, brick(1, 1), x, H + 2.6, (Z0 + Z1) / 2 + 2);

  // ---------- the yard: bike racks and bikes, the flagpole, a bench, the tree ----------
  const rackM = mat(0x8a9098);
  for (let k = 0; k < 6; k++) {
    const x = -10.5 + k * .8;
    const r = new THREE.Mesh(new THREE.TorusGeometry(.4, .03, 5, 12, Math.PI), rackM); r.position.set(x, 0, 7.6); r.rotation.y = Math.PI / 2; root.add(r);
    if (k % 2 === 0) {
      const col = [0xd8403a, 0x3f7fd8, 0x3aa060, 0xe8b830][k / 2 % 4];
      for (const dz of [-.5, .5]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.32, .03, 5, 16), mat(0x1c1c20)); w.position.set(x + .1, .34, 7.6 + dz); w.rotation.y = Math.PI / 2; root.add(w); }
      const fr = box(.04, .04, 1, mat(col), x + .1, .6, 7.6); fr.rotation.x = .1;
      box(.04, .5, .04, mat(col), x + .1, .5, 7.25); box(.2, .04, .1, mat(0x1c1c20), x + .1, .82, 7.25); box(.4, .03, .03, mat(0x1c1c20), x + .1, .92, 8);
    }
  }
  solid(-11, 0, 7.1, -6.4, 1, 8.1);
  cyl(.06, 8, mat(0xdcdcdc), 9.5, 4, 7.2, root, 8); solid(9.35, 0, 7.05, 9.65, 8, 7.35);
  const flagTex = canvasTex(96, 64, (c) => { c.fillStyle = '#1d3a8a'; c.fillRect(0, 0, 32, 64); c.fillStyle = '#f4f4f2'; c.fillRect(32, 0, 32, 64); c.fillStyle = '#d8262e'; c.fillRect(64, 0, 32, 64); });
  const flagGeo = new THREE.PlaneGeometry(1.5, 1, 8, 1);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide })); flag.position.set(9.5 + .77, 7.3, 7.2); flag.userData.keep = true; root.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();
  const benchM = mat(0x6a8a5a);
  for (const x of [4, 7]) { box(1.8, .06, .42, benchM, x, .45, 9.3); box(1.8, .42, .05, benchM, x, .72, 9.5); for (const sx of [-.8, .8]) box(.06, .45, .45, iron, x + sx, .22, 9.3); solid(x - .9, 0, 9.05, x + .9, .8, 9.6); }
  // a « lycée bloqué » sheet on the railing, only while it is
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1), new THREE.MeshLambertMaterial({ map: canvasTex(512, 128, (c) => {
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#c8222a'; c.font = '700 70px "Comic Sans MS", "Marker Felt", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(256, 66); c.rotate(-.03); c.fillText('lycée bloqué !', 0, 0); c.restore();
  }), side: THREE.DoubleSide }));
  sheet.position.set(-7.5, 1.35, GATE_Z - .12); sheet.rotation.y = Math.PI; sheet.userData.keep = true; root.add(sheet);

  // ---------- the blockade's props (shown while it's on) ----------
  const props = new THREE.Group(); props.userData.keep = true; root.add(props);
  const binG = new THREE.Group();
  const binBody = mat(0x3a7a3a), binLid = mat(0x2e5e2e), wheelM = mat(0x1a1a1c), char = mat(0x2a2624), charred = mat(0x3a3430);
  // a wheelie bin, in props' frame; burnt: black, lid gone
  const bin = (x, z, rot = 0, tip = 0, burnt = false, y = 0, p = props) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tip, rot, 0); p.add(g);
    const m = burnt ? charred : binBody;
    const b = new THREE.Mesh(new THREE.BoxGeometry(.62, .95, .7), m); b.position.y = .5; g.add(b);
    if (!burnt) { const l = new THREE.Mesh(new THREE.BoxGeometry(.66, .06, .76), binLid); l.position.set(0, 1, -.02); g.add(l); }
    else { const in_ = new THREE.Mesh(new THREE.BoxGeometry(.5, .05, .58), char); in_.position.y = .9; g.add(in_); }
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .06, 10), wheelM); w.rotation.z = Math.PI / 2; w.position.set(s * .28, .1, -.3); g.add(w); }
    return g;
  };
  // pallets: slats on three bearers
  const palletM = mat(0xb8905e);
  const pallet = (x, y, z, rot = 0, tilt = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tilt, rot, 0); props.add(g);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, .025, .14), palletM); s.position.set(0, .13, -.4 + k * .2); g.add(s); }
    for (const x2 of [-.5, 0, .5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .95), palletM); b.position.set(x2, .06, 0); g.add(b); }
  };
  // the crowd barriers (grey tubes, bars)
  const barrierM = mat(0xa8adb4);
  const barrier = (x, z, rot, tilt = 0) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.set(tilt, rot, 0); props.add(g);
    const tube = (w, h, d, px2, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), barrierM); m.position.set(px2, py, 0); g.add(m); };
    tube(2, .05, .05, 0, 1.05); tube(2, .05, .05, 0, .25);
    for (const s of [-1, 1]) { tube(.05, 1.1, .05, s * 1, .55); const f = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .5), barrierM); f.position.set(s * .85, .02, 0); g.add(f); }
    for (let k = 1; k < 12; k++) tube(.025, .8, .025, -1 + k * .166, .65);
  };
  const B = BARRICADE;
  // against the gate: bins in a row, pallets stacked and leaning, barriers across, a tyre or two
  for (let k = 0; k < 5; k++) bin(B.x0 + .55 + k * 1.45, 4.55, (k % 2 - .5) * .3, 0, k === 2);
  pallet(-2.1, 0, 3.55, .2, -.9); pallet(1.8, 0, 3.6, -.3, -1); pallet(-.3, 1, 4.6, .1, 0); pallet(-.1, 1.12, 4.5, -.2, 0); pallet(1.1, 0, 3.5, 1.4, 0);
  barrier(-1.8, 3.3, .08); barrier(1.9, 3.35, -.12); barrier(0, 3.2, 0, -.25);
  for (const [x, z] of [[-3.1, 3.6], [3.2, 3.7]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.32, .13, 8, 14), wheelM); t.rotation.x = Math.PI / 2; t.position.set(x, .13, z); props.add(t); }
  const barricadeCol = solid(B.x0, 0, B.z0, B.x1, 1.7, GATE_Z - .12);
  // the burning bins: loose in the crowd, and the one on the barricade (burns too)
  const fires = [];
  for (const [x, z] of FIRES) { bin(x, z, x * .7, 0, true); fires.push({ x, y: 1, z }); solid(x - .4, 0, z - .4, x + .4, 1, z + .4).blocus = true; }
  fires.push({ x: 0, y: 1.25, z: 4.55 });
  // an overturned one, charred, beside the first
  bin(FIRES[0][0] + .9, FIRES[0][1] - .5, 1.2, Math.PI / 2 - .1, true);
  // the mortar batteries: a crate, cardboard tubes in bright wraps
  const tubeMats = [0xd8403a, 0x3f7fd8, 0xe8b830, 0x8a52c8].map(c => mat(c));
  const tubes = [];
  for (const [x, z] of TUBES) {
    box(.6, .45, .5, palletM, x, .225, z, props);
    for (let k = 0; k < 4; k++) { const c = cyl(.07, .5, tubeMats[k], x - .18 + (k % 2) * .36 - (k > 1 ? .05 : 0), .7, z - .1 + (k > 1 ? .2 : 0), props, 8); c.rotation.x = -.15; }
    tubes.push({ x, y: .95, z });
    solid(x - .3, 0, z - .25, x + .3, .95, z + .25).blocus = true;
  }
  // the holdall full of mortars, unzipped, by the railing
  const bagG = new THREE.Group(); bagG.position.set(BAG[0], 0, BAG[1]); bagG.rotation.y = .4; props.add(bagG);
  const holdall = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .5, 4, 10), mat(0x2a4aa8)); holdall.rotation.z = Math.PI / 2; holdall.scale.set(1, 1, .85); holdall.position.y = .24; bagG.add(holdall);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(.245, .245, .08, 12), mat(0xf4f0e6)); stripe.rotation.z = Math.PI / 2; stripe.scale.set(1, 1, .86); stripe.position.set(-.2, .24, 0); bagG.add(stripe);
  for (const s of [-1, 1]) { const hdl = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 5, 10, Math.PI), mat(0x1a1a1e)); hdl.position.set(s * .12, .44, 0); bagG.add(hdl); }
  for (let k = 0; k < 6; k++) { const c = cyl(.045, .38, tubeMats[k % tubeMats.length], -.22 + k * .09, .5, (k % 2 - .5) * .1, bagG, 8); c.rotation.set((k % 2 - .5) * .5, 0, (k - 2.5) * .12); }
  solid(BAG[0] - .45, 0, BAG[1] - .35, BAG[0] + .45, .5, BAG[1] + .35).blocus = true;
  const propCols = colliders.filter(c => c.blocus);
  propCols.push(barricadeCol);

  // everything that never moves: merged
  root.updateMatrixWorld(true);
  mergeStatic(root, (o) => o.userData.keep || o === arch);
  mergeStatic(props);

  let t = 0, open = 0, want = 0;
  return {
    root, props, fires, tubes, sheet,
    gate: { x: LYCEE.x, z: LYCEE.z + GATE_Z },
    bag: { x: LYCEE.x + BAG[0], z: LYCEE.z + BAG[1] },
    // the blockade on (props out, gate shut and blocked) or off (gate open, the yard's free)
    setBlocked(on) {
      props.visible = on; sheet.visible = on;
      for (const c of propCols) c.off = !on;
      want = on ? 0 : 1;
    },
    setNight(n) { glass.emissiveIntensity = n * .9; arch.material.emissiveIntensity = .12 + n * .6; },
    update(dt, near) {
      t += dt;
      // the gate swings (it only opens when the blockade's lifted)
      if (open !== want) {
        open += Math.sign(want - open) * Math.min(Math.abs(want - open), dt * .8);
        leaves[0].rotation.y = -open * 1.6; leaves[1].rotation.y = open * 1.6;
        gateCol.off = open > .4;
      }
      if (!near) return;
      const p = flagGeo.attributes.position;
      for (let k = 0; k < p.count; k++) { const x0 = flagBase[k * 3]; p.setZ(k, Math.sin(t * 4.5 + x0 * 4) * .1 * (x0 + .75)); }
      p.needsUpdate = true;
    },
  };
}
