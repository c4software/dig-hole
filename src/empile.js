// empile.js, empilades: four tall glass wells on the plinth, like aquariums on a building site,
// in the spirit of the falling-block puzzles of the NES in versus. Shrunk to a tiny builder on
// a plank over your well, you drop the pieces the crane brings: seven shapes from a shared
// seeded bag, wall kicks, a ghost, the next one waiting on the shelf. Full lines flash and go;
// in the duel, two, three or four at once send one, two or four lines of rubble (with a hole)
// to a neighbour. Stack out of the top and you are out: last one standing wins, or the best
// score after three minutes. Each client runs its own well and sends it on every change;
// the host runs the bots' wells.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';
import { mergeStatic } from './merge.js';
import { rng, hostOf, ord, hexOf, createChip } from './retro.js';

const W = 10, H = 20, HH = 24, C = .09, SEATS = 4, ROUND = 180, STEP = 1 / 60, LOCK = .5, DAS = .16, ARR = .05;
const MODES = [
  { id: 'duel', name: 'duel', sub: 'quatre puits · envoie des lignes aux voisins · le dernier debout gagne', help: 'q d : déplacer · z : tourner · espace : lâcher · 2, 3 ou 4 lignes d\'un coup envoient des gravats', unit: 'score', lower: false },
  { id: 'libre', name: 'chantier libre', sub: 'sans attaques · 3 minutes · le meilleur score', help: 'q d : déplacer · z : tourner · espace : lâcher · 4 lignes d\'un coup rapportent gros', unit: 'score', lower: false },
];
const BOTS = [['gaston', 0xe8484a], ['lucienne', 0xf5c83a], ['bertin', 0x3ad6e8], ['odile', 0xa65be0], ['marcel', 0x5ad05a], ['yvette', 0xf08a2a]];
// the seven shapes (spawn state, top row first) and their colours; 8 is rubble
const SHAPES = [['....', '####', '....', '....'], ['#..', '###', '...'], ['..#', '###', '...'], ['##', '##'], ['.##', '##.', '...'], ['.#.', '###', '...'], ['##.', '.##', '...']];
const PAL = [0, 0x3ad6e8, 0x3a6ef0, 0xf08a2a, 0xf5c83a, 0x5ad05a, 0xa65be0, 0xe8484a, 0x8a8790].map(c => new THREE.Color(c));
// every rotation as cells [x, y] in its box, y up; a turn clockwise is (x, y) -> (y, n-1-x)
const ROT = SHAPES.map(rows => {
  const n = rows.length, out = [];
  let cells = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') cells.push([i, n - 1 - j]); }));
  for (let r = 0; r < 4; r++) { out.push(cells); cells = cells.map(([x, y]) => [y, n - 1 - x]); }
  return out;
});
const LOW = ROT.map(r => Math.min(...r[0].map(c => c[1])));
// wall kicks for a clockwise turn out of each state; the way back is the same, negated
const KICK = [[[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]];
const KICK_I = [[[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]];
// frames per row by level, a notch quicker than the old console's to fit a three-minute round
const FRAMES = [36, 32, 28, 24, 20, 16, 13, 10, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2];
const gravity = (lv) => FRAMES[Math.min(lv, FRAMES.length - 1)] / 60;
const PTS = [0, 40, 100, 300, 1200], ATTACK = [0, 0, 1, 2, 4];
const PI = Math.PI;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- the board: W x HH cells, row 0 at the bottom, rows 20+ above the glass ----------
function fits(b, t, r, x, y) {
  for (const [cx, cy] of ROT[t][r]) {
    const X = x + cx, Y = y + cy;
    if (X < 0 || X >= W || Y < 0) return false;
    if (Y < HH && b[Y * W + X]) return false;
  }
  return true;
}
function dropY(b, t, r, x, y) { while (fits(b, t, r, x, y - 1)) y--; return y; }
const rowFull = (b, r) => { for (let c = 0; c < W; c++) if (!b[r * W + c]) return false; return true; };
function collapse(b) {
  let n = 0;
  for (let r = 0; r < HH; r++) {
    if (rowFull(b, r)) { n++; continue; }
    if (n) for (let c = 0; c < W; c++) b[(r - n) * W + c] = b[r * W + c];
  }
  b.fill(0, (HH - n) * W);
  return n;
}
// the bots' eye: low, flat, without holes
const tmpB = new Uint8Array(W * HH);
function judge(b, lines, greedy) {
  let agg = 0, holes = 0, bump = 0, prev = -1, top = 0;
  for (let c = 0; c < W; c++) {
    let h = 0;
    for (let r = HH - 1; r >= 0; r--) if (b[r * W + c]) { h = r + 1; break; }
    for (let r = 0; r < h; r++) if (!b[r * W + c]) holes++;
    agg += h; if (prev >= 0) bump += Math.abs(h - prev); prev = h; top = Math.max(top, h);
  }
  // a greedy builder keeps a well open for the big clears while the pile is low
  const lv = greedy && top < 12 ? [0, -.6, .6, 2.2, 6][lines] : .76 * lines;
  return -.51 * agg + lv - .36 * holes - .18 * bump - (top > 14 ? (top - 14) * 2 : 0);
}
function plan(b, t, y0, sloppy, rnd, greedy = false) {
  const cand = [];
  for (let r = 0; r < 4; r++) for (let x = -3; x < W; x++) {
    if (!fits(b, t, r, x, y0)) continue;
    const y = dropY(b, t, r, x, y0);
    tmpB.set(b);
    for (const [cx, cy] of ROT[t][r]) if (y + cy < HH) tmpB[(y + cy) * W + x + cx] = 1;
    cand.push({ r, x, s: judge(tmpB, collapse(tmpB), greedy) });
  }
  if (!cand.length) return { r: 0, x: 3 };
  cand.sort((a, b2) => b2.s - a.s);
  return rnd() < sloppy ? cand[Math.min(cand.length - 1, 1 + Math.floor(rnd() * 3))] : cand[0];
}

function plaqueTex(text, color) {
  return V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = '#1c1a22'; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fill();
    g.strokeStyle = '#c9a45a'; g.lineWidth = 4; g.stroke();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(34, h / 2, 13, 0, PI * 2); g.fill();
    g.fillStyle = '#f4ecd8'; g.font = '600 32px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 11), 60, h / 2 + 2);
  });
}

export function createEmpile({ scene, camera, audio, ui, at }) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);
  const WX = [-2.1, -.7, .7, 2.1], WZ = -.35, Y0 = .16, TOP = Y0 + H * C;
  const put = (p, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  const tube = (p, m, a, b, r = .008) => {
    const d = new THREE.Vector3().subVectors(b, a), o = put(p, new THREE.CylinderGeometry(r, r, d.length(), 6), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return o;
  };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- the static site: pedestals, frames, scaffolds, the crane ----------
  const deco = new THREE.Group(); root.add(deco);
  const stone = V.mat(0x8c8174, { roughness: .9 }), steel = V.mat(0x3a3f4a, { roughness: .45, metalness: .45 }), brass = V.mat(0xc9a45a, { roughness: .35, metalness: .6 });
  const wood = V.mat(0xb07a45, { roughness: .8 }), pipe = V.mat(0xb8bcc4, { roughness: .35, metalness: .6 }), yellow = V.mat(0xf2b62a, { roughness: .5 }), conc = V.mat(0x9a968e, { roughness: .95 });
  const backTex = V.paintTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#1d2742'); grd.addColorStop(1, '#10152a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,150,220,.16)'; g.lineWidth = 1;
    for (let c = 1; c < W; c++) { g.beginPath(); g.moveTo(c * w / W, 0); g.lineTo(c * w / W, h); g.stroke(); }
    for (let r = 1; r < H; r++) { g.beginPath(); g.moveTo(0, r * h / H); g.lineTo(w, r * h / H); g.stroke(); }
  });
  const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: .8 });
  const glassGeos = [];
  const addGlass = (w, h, x, y, z, ry = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z); glassGeos.push(g); };
  for (const wx of WX) {
    put(deco, V.roundBox(1.14, .14, .46, .03), stone, wx, .07, WZ);
    put(deco, new THREE.BoxGeometry(.96, .02, .14), steel, wx, Y0 - .01, WZ);
    put(deco, new THREE.PlaneGeometry(W * C, H * C), back, wx, Y0 + H * C / 2, WZ - .052);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(deco, new THREE.BoxGeometry(.026, H * C + .05, .026), steel, wx + sx * .463, Y0 + H * C / 2, WZ + sz * .06);
    for (const y of [Y0 - .005, TOP + .005]) for (const sz of [-1, 1]) put(deco, new THREE.BoxGeometry(.95, .022, .022), steel, wx, y, WZ + sz * .06);
    put(deco, new THREE.BoxGeometry(.95, .012, .15), brass, wx, TOP + .018, WZ);
    addGlass(W * C, H * C, wx, Y0 + H * C / 2, WZ + .058);
    for (const sx of [-1, 1]) addGlass(.11, H * C, wx + sx * .452, Y0 + H * C / 2, WZ, PI / 2);
    // the scaffold behind: two ladders of tubes, braces, a plank on top for the builder
    const sz = WZ - .2;
    for (const sx of [-1, 1]) {
      for (const dz of [-.08, .08]) tube(deco, pipe, v3(wx + sx * .52, 0, sz + dz), v3(wx + sx * .52, TOP + .32, sz + dz));
      for (let y = .45; y < TOP + .3; y += .45) tube(deco, pipe, v3(wx + sx * .52, y, sz - .08), v3(wx + sx * .52, y, sz + .08));
    }
    for (let y = .45, k = 0; y < TOP; y += .45, k++) {
      tube(deco, pipe, v3(wx - .52, y, sz - .08), v3(wx + .52, y, sz - .08));
      tube(deco, pipe, v3(wx + (k % 2 ? .52 : -.52), y, sz - .08), v3(wx + (k % 2 ? -.52 : .52), y + .45, sz - .08));
    }
    put(deco, new THREE.BoxGeometry(1.14, .016, .24), wood, wx, TOP + .03, WZ - .17);
    tube(deco, pipe, v3(wx - .52, TOP + .22, sz - .08), v3(wx + .52, TOP + .22, sz - .08));
    // the shelf where the next piece waits
    put(deco, new THREE.BoxGeometry(.24, .014, .12), wood, wx + .64, TOP + .03, WZ - .04);
    tube(deco, pipe, v3(wx + .52, TOP - .14, WZ - .06), v3(wx + .68, TOP + .025, WZ - .06));
  }
  // the crane: a lattice mast on the right, the jib across the wells, a load on the hook
  const CX = 2.95, CZ = -.95, CH = 3.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tube(deco, yellow, v3(CX + sx * .06, 0, CZ + sz * .06), v3(CX + sx * .06, CH, CZ + sz * .06), .01);
  for (let y = 0, k = 0; y < CH - .1; y += .2, k++) {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = q[e], [bx, bz] = q[(e + 1) % 4];
      tube(deco, yellow, v3(CX + ax * .06, y, CZ + az * .06), v3(CX + bx * .06, y, CZ + bz * .06), .005);
      if (k % 2 === e % 2) tube(deco, yellow, v3(CX + ax * .06, y, CZ + az * .06), v3(CX + bx * .06, y + .2, CZ + bz * .06), .004);
      else tube(deco, yellow, v3(CX + bx * .06, y, CZ + bz * .06), v3(CX + ax * .06, y + .2, CZ + az * .06), .004);
    }
  }
  put(deco, V.roundBox(.4, .06, .4, .02), conc, CX, .03, CZ);
  put(deco, V.roundBox(.18, .14, .16, .03), yellow, CX, CH + .08, CZ + .12);
  put(deco, new THREE.BoxGeometry(.13, .08, .02), V.glass(), CX, CH + .1, CZ + .205);
  tube(deco, yellow, v3(CX - .05, CH, CZ), v3(CX, CH + .45, CZ), .008);
  tube(deco, yellow, v3(CX + .05, CH, CZ), v3(CX, CH + .45, CZ), .008);
  const JL = 3.3, JE = CX - JL;
  for (const sz of [-1, 1]) tube(deco, yellow, v3(CX, CH, CZ + sz * .05), v3(JE, CH, CZ + sz * .05), .009);
  tube(deco, yellow, v3(CX, CH + .1, CZ), v3(JE, CH + .1, CZ), .009);
  for (let x = CX, k = 0; x > JE + .01; x -= .15, k++) {
    tube(deco, yellow, v3(x, CH, CZ - .05), v3(x, CH, CZ + .05), .004);
    for (const sz of [-1, 1]) tube(deco, yellow, v3(x, CH, CZ + sz * .05), v3(x - .15, CH + .1, CZ), .004);
  }
  tube(deco, pipe, v3(CX, CH + .45, CZ), v3(JE + .6, CH + .1, CZ), .003);
  tube(deco, yellow, v3(CX, CH + .05, CZ), v3(CX + .22, CH + .05, CZ), .02);
  put(deco, V.roundBox(.12, .12, .14, .02), conc, CX + .17, CH - .04, CZ);
  const HX = -.95;   // the trolley and its hook, over the second well
  put(deco, new THREE.BoxGeometry(.08, .03, .12), steel, HX, CH - .02, CZ);
  tube(deco, pipe, v3(HX, CH - .02, CZ), v3(HX, 2.62, CZ), .003);
  put(deco, new THREE.BoxGeometry(.05, .04, .03), yellow, HX, 2.6, CZ);
  for (const s of [-1, 1]) tube(deco, pipe, v3(HX, 2.58, CZ), v3(HX + s * .12, 2.46, CZ), .002);
  // the sign on the jib
  const signTex = V.paintTex(512, 96, (g, w, h) => {
    g.fillStyle = '#f2b62a'; g.fillRect(0, 0, w, h);
    for (let k = -2; k < 30; k++) { g.fillStyle = '#1c1a22'; g.beginPath(); g.moveTo(k * 22, 0); g.lineTo(k * 22 + 11, 0); g.lineTo(k * 22 - 5, h); g.lineTo(k * 22 - 16, h); g.fill(); }
    g.fillStyle = '#1c1a22'; g.fillRect(34, 12, w - 68, h - 24);
    g.fillStyle = '#f4ecd8'; g.font = '800 54px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EMPILADES', w / 2, h / 2 + 3);
  });
  for (const s of [-1, 1]) { const sg = put(root, new THREE.PlaneGeometry(1.2, .225), new THREE.MeshStandardMaterial({ map: signTex, roughness: .6 }), .9, CH - .16, CZ + s * .056); if (s < 0) sg.rotation.y = PI; }
  // cones and a pallet or two at the front
  const cone = V.mat(0xf06a1a, { roughness: .6 });
  for (const [x, z] of [[-2.9, 1.9], [-2.6, 2.6], [2.7, 2.3], [.2, 2.9]]) { put(deco, new THREE.ConeGeometry(.05, .15, 12), cone, x, .075, z); put(deco, new THREE.BoxGeometry(.11, .012, .11), V.TRIM(), x, .006, z); }
  for (const [x, z] of [[-2.35, 1.2], [2.2, 1.35]]) for (let k = 0; k < 3; k++) put(deco, new THREE.BoxGeometry(.4, .02, .07), wood, x, .01 + (k % 2) * .025, z - .12 + k * .12);
  // striped barriers along the front, the site hut at the back
  const stripe = new THREE.MeshStandardMaterial({ map: V.paintTex(128, 16, (g, w, h) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f4ecd8' : '#d8302a'; g.fillRect(k * 16, 0, 16, h); } }), roughness: .6 });
  for (const x of [-1.4, 0, 1.4]) {
    for (const s of [-1, 1]) { put(deco, new THREE.BoxGeometry(.016, .13, .016), pipe, x + s * .2, .065, .5); put(deco, new THREE.BoxGeometry(.08, .012, .05), V.TRIM(), x + s * .2, .006, .5); }
    put(deco, new THREE.BoxGeometry(.44, .035, .012), stripe, x, .105, .51);
  }
  put(deco, V.roundBox(.9, .5, .5, .02), V.mat(0x5a7a8c, { roughness: .7 }), -2.2, .25, -1.9);
  put(deco, new THREE.BoxGeometry(1, .03, .6), steel, -2.2, .515, -1.9);
  put(deco, new THREE.BoxGeometry(.3, .16, .01), V.glass(), -2.35, .3, -1.645);
  put(deco, new THREE.BoxGeometry(.16, .34, .01), V.mat(0x3a4a58), -1.95, .17, -1.645);
  for (let k = 0; k < 5; k++) { const pp = put(deco, new THREE.CylinderGeometry(.02, .02, .7, 10), pipe, -.7 + (k % 3) * .042 + (k > 2 ? .021 : 0), .02 + (k > 2 ? .036 : 0), -1.4); pp.rotation.z = PI / 2; }
  mergeStatic(deco);
  const glass = new THREE.Mesh(mergeGeometries(glassGeos), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: .08, roughness: .05, metalness: .2, depthWrite: false, side: THREE.DoubleSide }));
  glass.renderOrder = 2; root.add(glass);

  // ---------- the blocks: one instanced mesh for every well, the shelf and the decor ----------
  const blockTex = V.paintTex(64, 64, (g) => {
    g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 7); g.fillRect(0, 0, 7, 64);
    g.fillStyle = '#8c8c8c'; g.fillRect(0, 57, 64, 7); g.fillRect(57, 0, 7, 64);
    g.fillStyle = '#e8e8e8'; g.fillRect(14, 14, 36, 36);
    g.fillStyle = '#ffffff'; g.fillRect(11, 11, 8, 8);
  });
  const SLOT = W * HH + 8, EXTRA = 40, NB = SEATS * SLOT + EXTRA;
  const blocks = new THREE.InstancedMesh(V.roundBox(C * .95, C * .95, C * .95, .01), new THREE.MeshStandardMaterial({ map: blockTex, roughness: .4 }), NB);
  blocks.frustumCulled = false; blocks.castShadow = false; blocks.receiveShadow = true; root.add(blocks);
  const dm = new THREE.Object3D(), tc = new THREE.Color();
  for (let i = 0; i < NB; i++) { dm.scale.setScalar(0); dm.updateMatrix(); blocks.setMatrixAt(i, dm.matrix); blocks.setColorAt(i, PAL[8]); }
  const setBlock = (i, x, y, z, s, col) => { dm.position.set(x, y, z); dm.scale.setScalar(s); dm.rotation.set(0, 0, 0); dm.updateMatrix(); blocks.setMatrixAt(i, dm.matrix); blocks.setColorAt(i, col); };
  // decor: the load on the crane hook and the pallets of spare blocks
  {
    let i = SEATS * SLOT;
    for (const [cx, cy] of ROT[5][2]) setBlock(i++, HX + (cx - 1) * C, 2.45 - (1 - cy) * C - .05, CZ, 1, PAL[6]);
    for (const [px, pz, n] of [[-2.35, 1.2, 13], [2.2, 1.35, 9]]) for (let k = 0; k < n; k++) setBlock(i++, px + (k % 3 - 1) * C, .085 + Math.floor(k / 9) * C, pz + (Math.floor(k / 3) % 3 - 1) * C, 1, PAL[1 + (k * 5 + n) % 7]);
    for (const [x, z, t] of [[-1.5, 1.7, 3], [1.35, 2.1, 7], [.1, 1.55, 1]]) setBlock(i++, x, .045, z, 1, PAL[t]);
  }

  // ---------- builders: one tiny worker on each plank ----------
  const skin = V.mat(0xf0c8a0, { roughness: .8 }), hat = V.mat(0xf5c83a, { roughness: .4 }), boot = V.mat(0x2a2e3a);
  function builder(color) {
    const g = new THREE.Group(), suit = V.mat(color, { roughness: .6 });
    for (const s of [-1, 1]) put(g, V.roundBox(.018, .05, .02, .006), boot, s * .012, .025, 0);
    const body = put(g, V.roundBox(.05, .05, .032, .012), suit, 0, .072, 0);
    put(g, new THREE.SphereGeometry(.018, 10, 8), skin, 0, .112, 0);
    put(g, new THREE.SphereGeometry(.021, 10, 6, 0, PI * 2, 0, PI / 2), hat, 0, .118, 0);
    const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .031, .09, 0); g.add(a); put(a, V.roundBox(.014, .045, .014, .005), suit, 0, -.02, 0); return a; });
    root.add(g);
    return { g, body, arms, suit };
  }

  // ---------- the wells ----------
  const plaqueMat = [], warn = [];
  const wells = WX.map((wx, seat) => {
    plaqueMat.push(new THREE.MeshBasicMaterial({ map: plaqueTex('puits ' + (seat + 1), 0xc9a45a) }));
    put(root, new THREE.PlaneGeometry(.44, .11), plaqueMat[seat], wx, .075, WZ + .232);
    const wm = put(root, new THREE.BoxGeometry(.022, 1, .03), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .35, .25) }), wx - .49, Y0, WZ + .03);
    wm.visible = false; warn.push(wm);
    const b = builder([0xe8484a, 0x3a6ef0, 0x5ad05a, 0xf08a2a][seat]);
    b.g.position.set(wx - .2, TOP + .038, WZ - .15);
    return { seat, board: new Uint8Array(W * HH), piece: null, n: 0, b, bx: -.2, vd: true, full: 0 };
  });
  // at rest the wells hold half-built piles, stacked by a sloppy bot
  const decoBoards = wells.map((w, seat) => {
    const b = new Uint8Array(W * HH), r = rng(31 + seat * 7), n = [30, 22, 44, 26][seat];
    for (let k = 0; k < n; k++) {
      const t = Math.floor(r() * 7), y0 = 20 - LOW[t], p = plan(b, t, y0, .5, r);
      if (!fits(b, t, p.r, p.x, y0)) break;
      const y = dropY(b, t, p.r, p.x, y0);
      for (const [cx, cy] of ROT[t][p.r]) b[(y + cy) * W + p.x + cx] = t + 1;
      collapse(b);
    }
    return b;
  });
  const decoNext = [5, 0, 2, 6];
  function rest() {
    wells.forEach((w, seat) => {
      w.board.set(decoBoards[seat]); w.piece = seat === 2 ? { t: 3, r: 0, x: 4, y: 14 } : null; w.nextT = decoNext[seat]; w.out = false; w.vd = true;
      w.b.g.position.x = WX[seat] + (seat % 2 ? .18 : -.2); w.b.g.rotation.set(0, 0, 0);
      w.b.arms.forEach(a => a.rotation.set(0, 0, 0));
      plaqueMat[seat].map.dispose(); plaqueMat[seat].map = plaqueTex('puits ' + (seat + 1), 0xc9a45a);
      warn[seat].visible = false;
    });
    drawAll();
  }

  // draw one well into the instanced mesh: the pile, the falling piece, the next one on the shelf
  const flashC = new THREE.Color(2.6, 2.6, 2.4), deadC = new THREE.Color(.34, .33, .36);
  let clock = 0;
  function drawWell(w) {
    const base = w.seat * SLOT, ox = WX[w.seat] - (W - 1) / 2 * C, oy = Y0 + C / 2, blink = Math.floor(clock * 14) % 2;
    let full = 0;
    for (let r = 0; r < HH; r++) {
      const isFull = r < H + 2 && rowFull(w.board, r);
      if (isFull) full++;
      for (let c = 0; c < W; c++) {
        const v = w.board[r * W + c], i = base + r * W + c;
        if (!v) { setBlock(i, 0, 0, 0, 0, PAL[8]); continue; }
        const col = isFull ? (blink ? flashC : PAL[v]) : w.out ? tc.copy(PAL[v]).lerp(deadC, .75) : PAL[v];
        setBlock(i, ox + c * C, oy + r * C, WZ, 1, col);
      }
    }
    const p = w.piece, cells = p ? ROT[p.t][p.r] : null;
    for (let k = 0; k < 4; k++) {
      if (cells && !w.out) setBlock(base + W * HH + k, ox + (p.x + cells[k][0]) * C, oy + (p.y + cells[k][1]) * C, WZ, 1, PAL[p.t + 1]);
      else setBlock(base + W * HH + k, 0, 0, 0, 0, PAL[8]);
    }
    const nt = w.nextT, nc = nt >= 0 && !w.out ? ROT[nt][0] : null, s = .5, nx = WX[w.seat] + .64 - (nt === 0 ? 1.5 : nt === 3 ? .5 : 1) * C * s, ny = TOP + .04 + C * s / 2 - (nc ? Math.min(...nc.map(q => q[1])) : 0) * C * s;
    for (let k = 0; k < 4; k++) {
      if (nc) setBlock(base + W * HH + 4 + k, nx + nc[k][0] * C * s, ny + nc[k][1] * C * s, WZ - .04, s, PAL[nt + 1]);
      else setBlock(base + W * HH + 4 + k, 0, 0, 0, 0, PAL[8]);
    }
    if (full > w.full) burstRows(w);
    w.full = full; w.vd = full > 0;
    blocks.instanceMatrix.needsUpdate = true; blocks.instanceColor.needsUpdate = true;
  }
  function drawAll() { for (const w of wells) drawWell(w); }

  // ---------- dynamic bits: the ghost, bursts of blocks, rubble flying across ----------
  const dyn = new THREE.Group(); dyn.visible = false; root.add(dyn);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .32, depthWrite: false });
  const ghost = new THREE.InstancedMesh(V.roundBox(C * .9, C * .9, C * .9, .01), ghostMat, 4); ghost.frustumCulled = false; dyn.add(ghost);
  const PMAX = 240;
  const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(C * .4, C * .4, C * .4), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
  bits.frustumCulled = false; dyn.add(bits);
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, spin: 0 }));
  for (let i = 0; i < PMAX; i++) bits.setColorAt(i, PAL[8]);
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, col, life = .9, s = 1) {
    const p = parts[pNext]; bits.setColorAt(pNext, col); pNext = (pNext + 1) % PMAX;
    Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, s, spin: Math.random() * 6 });
    bits.instanceColor.needsUpdate = true;
  }
  function burstRows(w) {
    if (state === 'off') return;
    const ox = WX[w.seat] - (W - 1) / 2 * C;
    for (let r = 0; r < HH; r++) if (rowFull(w.board, r)) for (let c = 0; c < W; c++) {
      const v = w.board[r * W + c];
      emit(root.position.x + ox + c * C, root.position.y + Y0 + (r + .5) * C, root.position.z + WZ + .07, (c - 4.5) * .12 + (Math.random() - .5) * .2, .4 + Math.random() * .6, .5 + Math.random() * .5, tc.copy(PAL[v]).multiplyScalar(1.6), .8 + Math.random() * .4);
    }
  }
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) { p.life -= dt; p.vy -= 2.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.spin += dt * 8; if (p.y < at.y + .02) { p.y = at.y + .02; p.vy *= -.3; p.vx *= .7; p.vz *= .7; } }
      const k = p.life > 0 ? Math.min(1, p.life / p.max * 2) : 0;
      dm.position.set(p.x - root.position.x, p.y - root.position.y, p.z - root.position.z); dm.rotation.set(p.spin, p.spin * .7, 0); dm.scale.setScalar(p.s * k); dm.updateMatrix();
      bits.setMatrixAt(n, dm.matrix);
    }
    bits.instanceMatrix.needsUpdate = true;
  }
  const shots = Array.from({ length: 6 }, () => { const m = put(dyn, V.roundBox(C * .7, C * .7, C * .7, .015), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, .7, .4) }), 0, 0, 0); m.visible = false; return { m, t: 1, a: 0, b: 0 }; });
  function shoot(from, to) {
    const s = shots.find(q => q.t >= 1); if (!s) return;
    s.t = 0; s.a = WX[from]; s.b = WX[to]; s.m.visible = true;
  }
  function stepShots(dt) {
    for (const s of shots) {
      if (s.t >= 1) { s.m.visible = false; continue; }
      s.t = Math.min(1, s.t + dt / .7);
      s.m.position.set(s.a + (s.b - s.a) * s.t, TOP + .15 + Math.sin(s.t * PI) * .7, WZ);
      s.m.rotation.set(s.t * 9, s.t * 6, 0);
    }
  }

  // ---------- the round ----------
  const chip = createChip(.1);
  let state = 'off', mode = 'duel', meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let me = null, count = 0, playT = 0, acc = 0, sendT = 0, endT = -1, result = null, bag = [], bagRnd = null, rnd = Math.random, camFov = 50, auto = false;
  const byKey = (k) => wells.find(w => w.key === k);
  const owned = (w) => w && (w.key === meId || (isHost && w.bot));
  // the shared sequence: bags of seven from the seed, drawn as far as anyone needs
  function pieceAt(i) {
    while (bag.length <= i) { const b = [0, 1, 2, 3, 4, 5, 6]; for (let k = 6; k > 0; k--) { const j = Math.floor(bagRnd() * (k + 1)); [b[k], b[j]] = [b[j], b[k]]; } bag.push(...b); }
    return bag[i];
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    if (state !== 'off') stop();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'duel';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    bagRnd = rng(seed); bag = []; rnd = rng(seed * 7 + 3);
    state = 'count'; count = 3.5; playT = 0; acc = 0; sendT = 0; endT = -1; result = null; clock = 0;
    camFov = camera.fov;
    const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    const skills = [.45, .65, .85].sort(() => rnd() - .5);
    const list = humans.slice(0, SEATS).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false }));
    for (let n = 0; list.length < SEATS; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true, skill: skills[n % 3] });
    list.forEach((u, seat) => {
      const w = wells[seat];
      Object.assign(w, u, { board: new Uint8Array(W * HH), piece: null, n: 0, nextT: pieceAt(0), score: 0, lines: 0, level: 0, out: false, gone: false, deathT: 0,
        pending: [], pend: 0, tgt: seat, fall: 0, lockT: 0, resets: 0, are: .2, clearT: 0, dirty: true, syncT: 0, seen: false, plan: null, botT: 0, fails: 0, jump: 0, drop: 0, hurt: 0, topped: false });
      w.b.suit.color.setHex(u.color);
      plaqueMat[seat].map.dispose(); plaqueMat[seat].map = plaqueTex(u.name, u.color);
    });
    me = byKey(meId);
    dyn.visible = true;
    for (const p of parts) p.life = 0;
    for (const q of shots) q.t = 1;
    chip.init();
    audio.tick();
    drawAll();
    cam(1);
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    dyn.visible = false;
    // back to the builders' own colours and the piles at rest
    wells.forEach((w, seat) => w.b.suit.color.setHex([0xe8484a, 0x3a6ef0, 0x5ad05a, 0xf08a2a][seat]));
    rest();
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close();
  }

  // ---------- one well's game, at 60 steps a second ----------
  const sfx = (w, f) => { if (w === me) f(); };
  function spawn(w) {
    const t = pieceAt(w.n++); w.nextT = pieceAt(w.n);
    const p = { t, r: 0, x: t === 3 ? 4 : 3, y: 20 - LOW[t] };
    w.fall = 0; w.lockT = 0; w.resets = 0; w.plan = null; w.vd = true;
    if (!fits(w.board, p.t, p.r, p.x, p.y)) { w.piece = null; die(w); return; }
    w.piece = p;
  }
  function rotate(w, dir) {
    const p = w.piece, to = (p.r + dir + 4) % 4, from = dir > 0 ? p.r : to;
    if (p.t === 3) return false;
    for (const [kx, ky] of (p.t === 0 ? KICK_I : KICK)[from]) {
      const x = p.x + kx * dir, y = p.y + ky * dir;
      if (fits(w.board, p.t, to, x, y)) { p.r = to; p.x = x; p.y = y; sfx(w, () => chip.tone(700, 980, .04, { type: .25, vol: .18 })); return true; }
    }
    return false;
  }
  function lock(w) {
    const p = w.piece; let above = true;
    for (const [cx, cy] of ROT[p.t][p.r]) { const Y = p.y + cy; if (Y < HH) w.board[Y * W + p.x + cx] = p.t + 1; if (Y < H) above = false; }
    w.piece = null; w.dirty = true; w.drop = .25;
    let n = 0; for (let r = 0; r < HH; r++) if (rowFull(w.board, r)) n++;
    sfx(w, () => chip.noise(.07, { vol: .35, f: 700 }));
    if (!n) {
      if (above) { die(w); return; }
      garbage(w); w.are = .1; return;
    }
    w.clearT = .38; w.score += PTS[Math.min(4, n)] * (w.level + 1); w.lines += n; w.jump = .5;
    sfx(w, () => n >= 4 ? chip.seq([72, 76, 79, 84, 88], .06, { type: .25, vol: .3 }) : chip.seq([76, 81].slice(0, n), .05, { type: .5, vol: .25 }));
    let att = ATTACK[Math.min(4, n)];
    while (att > 0 && w.pending.length) { const k = Math.min(att, w.pending[0].n); att -= k; w.pending[0].n -= k; if (!w.pending[0].n) w.pending.shift(); }
    if (att > 0 && mode === 'duel') attack(w, att);
  }
  function attack(w, n) {
    const foes = wells.filter(o => o !== w && !o.out);
    if (!foes.length) return;
    w.tgt = (w.tgt + 1) % foes.length;
    const fx = { t: 'g', f: w.key, to: foes[w.tgt].key, n, h: Math.floor(Math.random() * W) };
    send(fx); onGarbage(fx);
  }
  function onGarbage(fx) {
    const f = byKey(fx.f), to = byKey(fx.to);
    if (!f || !to) return;
    shoot(f.seat, to.seat);
    if (!owned(to) || to.out || state !== 'play') return;
    to.pending.push({ n: fx.n, h: fx.h }); to.hurt = .6;
    sfx(to, () => { chip.tone(220, 90, .3, { type: 'saw', vol: .2 }); ui.toast(`${f.name} t'envoie ${fx.n} ligne${fx.n > 1 ? 's' : ''} !`, true, 900); });
  }
  // the rubble that waited comes up from below, one hole per batch
  function garbage(w) {
    if (!w.pending.length) return;
    for (const g of w.pending) {
      const n = Math.min(g.n, HH);
      for (let k = (HH - n) * W; k < HH * W; k++) if (w.board[k]) w.topped = true;
      w.board.copyWithin(n * W, 0, (HH - n) * W);
      for (let r = 0; r < n; r++) for (let c = 0; c < W; c++) w.board[r * W + c] = c === g.h ? 0 : 8;
    }
    w.pending = []; w.dirty = true;
    sfx(w, () => chip.noise(.25, { vol: .4, f: 300 }));
    if (w.topped) die(w);
  }
  function die(w) {
    if (w.out) return;
    w.out = true; w.deathT = playT; w.piece = null; w.dirty = true; w.pending = [];
    sfx(w, () => { chip.seq([67, 63, 60, 55, 48], .09, { type: 'tri', vol: .35 }); ui.toast('le puits déborde : éliminé', true, 1600); });
  }
  function tick(w, inp, dt) {
    if (w.out) return;
    if (w.clearT > 0) { w.clearT -= dt; if (w.clearT > 0) return; collapse(w.board); w.dirty = true; w.are = 0; }
    if (!w.piece) { w.are -= dt; if (w.are > 0) return; spawn(w); if (w.out) return; }
    const p = w.piece; let moved = false;
    if (inp.rot) moved = rotate(w, inp.rot);
    if (inp.dx && fits(w.board, p.t, p.r, p.x + inp.dx, p.y)) { p.x += inp.dx; moved = true; sfx(w, () => chip.tone(420, 420, .025, { type: .125, vol: .12 })); }
    if (inp.hard) {
      const y = dropY(w.board, p.t, p.r, p.x, p.y);
      w.score += 2 * (p.y - y); p.y = y;
      sfx(w, () => chip.tone(260, 70, .09, { type: .5, vol: .22 }));
      lock(w); return;
    }
    const ground = !fits(w.board, p.t, p.r, p.x, p.y - 1);
    if (moved) { w.vd = true; if (ground && w.resets < 15) { w.lockT = 0; w.resets++; } }
    if (!ground) {
      const g = inp.soft ? Math.min(gravity(w.level), .03) : gravity(w.level);
      w.lockT = 0; w.fall = Math.min(w.fall + dt, g + dt);
      while (w.fall >= g) {
        w.fall -= g;
        if (!fits(w.board, p.t, p.r, p.x, p.y - 1)) { w.fall = 0; break; }
        p.y--; w.vd = true; if (inp.soft) w.score++;
      }
    } else { w.fall = 0; w.lockT += dt; if (w.lockT >= LOCK || (inp.soft && w.lockT >= .1)) lock(w); }
  }
  // the bots: pick a spot, turn, slide, then drop at their own pace
  const binp = { dx: 0, rot: 0, soft: false, hard: false };
  function botInput(w, dt) {
    const inp = binp, p = w.piece;
    inp.dx = inp.rot = 0; inp.soft = inp.hard = false;
    if (!p) return inp;
    if (!w.plan) { w.plan = plan(w.board, p.t, p.y, (1 - w.skill) * .35, Math.random, w.skill > .6 && mode === 'duel'); w.botT = .55 - w.skill * .4; w.fails = 0; }
    w.botT -= dt;
    if (w.botT > 0) return inp;
    const step = .27 - w.skill * .2;
    if (p.r !== w.plan.r && w.fails < 4) { inp.rot = w.plan.r === (p.r + 3) % 4 ? -1 : 1; w.botT = step; w.fails++; }
    else if (p.x !== w.plan.x && w.fails < 16) { inp.dx = Math.sign(w.plan.x - p.x); w.botT = step * .6; w.fails++; }
    else if (w.skill > .6) inp.hard = true;
    else inp.soft = true;
    return inp;
  }
  // your hands: moves with auto-repeat, turns and drops on the press
  const inp = { dx: 0, rot: 0, soft: false, hard: false };
  const now = { l: false, r: false, cw: false, ccw: false, hard: false, soft: false }, edge = { rot: 0, hard: false };
  let dasDir = 0, dasT = 0;
  function readKeys(keys) {
    const cw = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyK'), ccw = keys.has('KeyJ'), hard = keys.has('Space');
    if (cw && !now.cw) edge.rot = 1;
    if (ccw && !now.ccw) edge.rot = -1;
    if (hard && !now.hard) edge.hard = true;
    now.cw = cw; now.ccw = ccw; now.hard = hard;
    now.l = keys.has('KeyA') || keys.has('ArrowLeft'); now.r = keys.has('KeyD') || keys.has('ArrowRight'); now.soft = keys.has('KeyS') || keys.has('ArrowDown');
    return now;
  }
  function humanInput(now, dt) {
    inp.dx = 0; inp.rot = edge.rot; inp.hard = edge.hard; inp.soft = now.soft;
    edge.rot = 0; edge.hard = false;
    const dir = now.l && !now.r ? -1 : now.r && !now.l ? 1 : 0;
    if (dir !== dasDir) { dasDir = dir; dasT = DAS; inp.dx = dir; }
    else if (dir) { dasT -= dt; if (dasT <= 0) { dasT += ARR; inp.dx = dir; } }
    return inp;
  }

  // ---------- network: each owner sends its wells, the rows only when they changed ----------
  function enc(b) {
    let top = 0; for (let k = 0; k < W * HH; k++) if (b[k]) top = Math.floor(k / W) + 1;
    let s = ''; for (let k = 0; k < top * W; k++) s += b[k];
    return s;
  }
  function pack(w) {
    const p = w.piece, rows = w.dirty || w.syncT <= 0 ? enc(w.board) : null;
    if (rows != null) { w.dirty = false; w.syncT = 2; }
    return [w.key, p ? p.t : -1, p ? p.r : 0, p ? p.x : 0, p ? p.y : 0, w.n, w.score, w.lines, w.level, w.out ? 1 : 0, Math.round(w.deathT * 100) / 100, w.pending.reduce((a, g) => a + g.n, 0), rows];
  }
  function unpack(w, a) {
    const [, t, r, x, y, n, score, lines, level, out, deathT, pend, rows] = a;
    w.piece = t >= 0 ? { t, r, x, y } : null; w.n = n; w.nextT = pieceAt(n); w.score = score; w.lines = lines; w.level = level; w.pend = pend; w.seen = true;
    if (out && !w.out) { w.out = true; w.deathT = deathT; }
    if (rows != null) { w.board.fill(0); for (let k = 0; k < rows.length; k++) w.board[k] = +rows[k]; }
    w.vd = true;
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const who = byKey(pid); if (who) who.seen = true;
    if (fx.t === 's') { for (const a of fx.l) { const w = byKey(a[0]); if (w && !owned(w)) unpack(w, a); } }
    else if (fx.t === 'g') onGarbage(fx);
  }
  function peerLeft(id) {
    if (state === 'off') return;
    const w = byKey(id);
    if (w && !w.bot && !w.gone) {
      w.gone = true; w.piece = null; w.vd = true;
      if (!w.out) { w.out = true; w.deathT = playT; }
      plaqueMat[w.seat].map.dispose(); plaqueMat[w.seat].map = plaqueTex(w.name + ' ✗', 0x555555);
    }
    if (id === hostId) {
      hostId = hostOf(wells.filter(o => !o.bot && !o.gone).map(o => ({ id: o.key })), hostId) ?? meId; isHost = hostId === meId;
      // the new host picks up the bots where the last word left them
      if (isHost) for (const b of wells) if (b.bot) { b.pending = b.pend ? [{ n: b.pend, h: Math.floor(Math.random() * W) }] : []; b.plan = null; b.dirty = true; }
    }
  }

  // ---------- the frame ----------
  const rank = () => [...wells].sort((a, b) => mode === 'duel'
    ? (a.out - b.out) || (a.out ? b.deathT - a.deathT : 0) || b.score - a.score
    : b.score - a.score || a.seat - b.seat);
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    readKeys(keys);
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'play'; audio.buy(); edge.rot = 0; edge.hard = false; dasDir = 0; }
    }
    if (state === 'play') {
      playT += dt; acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        for (const w of wells) {
          if (!owned(w) || w.out) continue;
          const lv = Math.max(Math.floor(w.lines / 10), Math.floor(playT / 30));
          if (lv > w.level) { w.level = lv; sfx(w, () => { chip.seq([60, 64, 67, 72], .07, { type: .25, vol: .25 }); ui.toast(`niveau ${lv}`, false, 900); }); }
          tick(w, w === me && !auto ? humanInput(now, STEP) : botInput(w, STEP), STEP);
          if (w.dirty) w.vd = true;
        }
      }
      // humans that never came
      if (playT > 9) for (const w of wells) if (!w.bot && !w.gone && !owned(w) && !w.seen) peerLeft(w.key);
      sendT -= dt;
      if (sendT <= 0) {
        sendT = .1;
        for (const w of wells) w.syncT -= .1;
        const l = wells.filter(w => owned(w) && !w.gone).map(pack);
        if (l.length) send({ t: 's', l });
      }
      const alive = wells.filter(w => !w.out).length;
      if (playT >= ROUND || !wells.some(w => !w.bot && !w.gone && !w.out) || (mode === 'duel' && alive <= 1)) finish();
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; onEnd(result); } }
    for (const w of wells) if (w.vd) drawWell(w);
    animate(dt);
    stepParts(dt); stepShots(dt);
    cam(dt);
  }
  function finish() {
    state = 'end';
    if (!me) return;
    const o = rank(), place = o.indexOf(me) + 1;
    result = { place, of: wells.length, value: me.score, time: playT, text: `${ord(place)} place · ${me.score} points · ${me.lines} ligne${me.lines > 1 ? 's' : ''}` };
    if (place === 1) audio.win();
    ui.toast(place === 1 ? 'victoire !' : `${ord(place)} place`, false, 2000);
    endT = 3;
  }

  // the builders follow their piece, cheer a clear, wobble under rubble, sit down when out
  function animate(dt) {
    for (const w of wells) {
      const b = w.b, p = w.piece;
      w.jump = Math.max(0, (w.jump || 0) - dt); w.drop = Math.max(0, (w.drop || 0) - dt); w.hurt = Math.max(0, (w.hurt || 0) - dt);
      const tx = p ? (p.x + 1.5 - (W - 1) / 2) * C : w.bx;
      w.bx += (THREE.MathUtils.clamp(tx, -.4, .4) - w.bx) * Math.min(1, dt * 6);
      b.g.position.set(WX[w.seat] + w.bx, TOP + .038 + (w.jump > 0 ? Math.abs(Math.sin(w.jump * PI * 4)) * .03 : 0), WZ - .15);
      b.g.rotation.z = w.hurt > 0 ? Math.sin(w.hurt * 30) * .2 : 0;
      b.g.rotation.x = w.out ? -.5 : 0;
      const up = p && p.y >= H - 2 ? -2.6 : w.drop > 0 ? -1.4 : w.jump > 0 ? -2.8 : -.3;
      for (const a of b.arms) a.rotation.x += (up - a.rotation.x) * Math.min(1, dt * 12);
      warn[w.seat].visible = false;
      const pend = owned(w) ? w.pending.reduce((a, g) => a + g.n, 0) : w.pend;
      if (pend > 0 && !w.out && state !== 'off') {
        const m = warn[w.seat]; m.visible = true; m.scale.y = Math.min(H, pend) * C; m.position.y = Y0 + m.scale.y / 2;
        m.material.color.setRGB(2.4 * (.6 + .4 * Math.sin(clock * 12)), .35, .25);
      }
    }
    // the ghost, where your piece would land
    const p = me && !me.out ? me.piece : null;
    ghost.visible = !!p;
    if (p) {
      const y = dropY(me.board, p.t, p.r, p.x, p.y), ox = WX[me.seat] - (W - 1) / 2 * C;
      ROT[p.t][p.r].forEach(([cx, cy], k) => { dm.position.set(ox + (p.x + cx) * C, Y0 + C / 2 + (y + cy) * C, WZ); dm.scale.setScalar(1); dm.rotation.set(0, 0, 0); dm.updateMatrix(); ghost.setMatrixAt(k, dm.matrix); });
      ghost.instanceMatrix.needsUpdate = true; ghostMat.color.copy(PAL[p.t + 1]).multiplyScalar(1.5);
    }
  }

  // ---------- the camera: in front of your well, a little above, following the piece ----------
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), pos = new THREE.Vector3(), look = new THREE.Vector3(), ovP = new THREE.Vector3(), ovL = new THREE.Vector3();
  function cam(dt) {
    ovP.set(0, Y0 + 1.7, WZ + 4.2).add(at); ovL.set(0, Y0 + 1.05, WZ).add(at);
    const w = me;
    if (!w || w.out || state === 'end') { pos.copy(ovP); look.copy(ovL); }
    else {
      const wx = WX[w.seat], p = w.piece;
      const fy = p ? Y0 + (Math.min(p.y, H) + 1) * C : Y0 + .9, fx = p ? (p.x + 1.5 - (W - 1) / 2) * C : 0;
      pos.set(wx * .93 + fx * .08, Y0 + 1.4, WZ + 3.25).add(at);
      look.set(wx + fx * .1, Y0 + .96 + (fy - Y0 - .9) * .12, WZ).add(at);
      if (state === 'count') { const k = THREE.MathUtils.smoothstep(1 - Math.max(0, count - .5) / 3, 0, 1); pos.lerpVectors(ovP, pos, k); look.lerpVectors(ovL, look, k); }
    }
    const a = dt >= 1 ? 1 : Math.min(1, dt * 3.5);
    eye.lerp(pos, a); aim.lerp(look, a);
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(aim);
    const fov = w && !w.out && state !== 'end' ? 44 : 50;
    camera.fov += (fov - camera.fov) * (dt >= 1 ? 1 : Math.min(1, dt * 3)); camera.updateProjectionMatrix();
  }

  rest();
  const name = (w) => w.name + (w.gone ? ' (parti)' : '');
  return {
    modes: MODES,
    keys: [['q d', 'déplacer'], ['z · k', 'tourner'], ['j', 'tourner dans l\'autre sens'], ['s', 'descendre vite'], ['espace', 'lâcher d\'un coup']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { hidden: true };
      const o = rank();
      const board = `<div class="board">${o.map((w, i) => `<span style="color:${hexOf(w.color)}">${i + 1}. ${name(w)}${w.out ? ' ✗' : ''} ${w.score}</span>`).join('')}</div>`;
      if (state === 'end') return { html: `<b>résultats</b><span class="big">${ord(o.indexOf(me) + 1)} place</span><span>${me.score} points · ${me.lines} lignes</span>${board}` };
      const pend = me.pending.reduce((a, g) => a + g.n, 0);
      const line = me.out ? '<span><em>éliminé</em> · tu regardes la fin</span>' : pend ? `<span><em>${pend} ligne${pend > 1 ? 's' : ''} de gravats arrivent !</em></span>` : '';
      return { html: `<b>empilades · ${mode === 'duel' ? 'duel' : 'chantier libre'}</b><span class="big">${me.score}</span><span>niveau ${me.level} · ${me.lines} lignes · ${mmss(Math.max(0, ROUND - playT))}</span>${line}${board}` };
    },
    preview() { return { x: at.x, y: at.y + .9, z: at.z + .8, yaw: PI, rad: 2.6, h: .6 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get wells() { return wells; }, get me() { return me; }, get state() { return state; },
    _go() { if (state === 'count') count = 0; },
    _auto(on = true) { auto = on; if (me) me.skill = .85; },
    _t(t) { playT = t; },
  };
}
