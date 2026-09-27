// bomber.js, bombardiers: a bomb arena laid out like a board game, in the spirit of the battle
// mode of the old bomber games. A grid of 13 × 11 cells, stone pillars every other cell, wooden
// crates; four little bombers, one per corner. Drop a bomb, run: it blows a cross of flames that
// breaks the crates, sets off the other bombs and knocks out whoever stands in it. Crates hide
// power-ups (one more bomb, a longer flame, faster feet, kicking bombs). The last one standing
// takes the round; late in a round the stone blocks fall from the edges, spiralling inward.
// Best of three rounds. The host runs everything shared (bombs, flames, crates, bots, rounds)
// and broadcasts it; each player walks their own bomber and asks the host for their bombs.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { mergeStatic } from './merge.js';
import { rng, hostOf, createChip, hexOf, ord } from './retro.js';

const W = 13, H = 11, C = .4, NC = W * H;
const FUSE = 2.5, FLAME = .55, COUNT = 3, SD = 55, SD_STEP = .2, SD_LEFT = 5, ROUND_MAX = 95, SCORE_T = 4, FINAL_T = 3.2;
const ROUNDS = 3, WIN_ROUNDS = 2, STEP = 1 / 60, KICK_V = 7, BMAX = 40, FMAX = 240, PMAX = 500;
const EMPTY = 0, PILLAR = 1, CRATE = 2, BLOCK = 3, ITEM = 10;   // ITEM + k: a power-up lying there
const ITEM_NAMES = ['une bombe de plus', 'flamme plus longue', 'plus rapide', 'coup de pied'];
const ITEM_COL = [0x3a6bd8, 0xe8452a, 0x2aa84a, 0x8a45d0];
// dirs: none, north (-z, away from the camera), south, west, east
const DX = [0, 0, 0, -1, 1], DZ = [0, -1, 1, 0, 0];
const KEYS = [null, ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']];
const SLOTS = [[0, H - 1], [W - 1, 0], [W - 1, H - 1], [0, 0]];
const BOTS = [['mèche', 0xe8384f], ['pétard', 0xf2c230], ['fusée', 0x3a8ef0], ['poudre', 0x45c060], ['étincelle', 0xf07ac8], ['charbon', 0x3a3a44]];
const MODES = [{ id: 'bataille', name: 'bataille', sub: 'quatre bombardiers dans l\'arène · le meilleur de 3 manches', help: 'zqsd : bouger · espace : poser une bombe · le dernier debout gagne la manche', unit: 'score', lower: false }];
const PH = ['count', 'play', 'score', 'final'];
const PI = Math.PI, TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// the sudden death: blocks fall on every cell from the rim inward, clockwise
const SPIRAL = (() => {
  const out = [];
  let l = 0, t = 0, r = W - 1, b = H - 1;
  while (l <= r && t <= b) {
    for (let i = l; i <= r; i++) out.push(i + t * W);
    t++;
    for (let j = t; j <= b; j++) out.push(r + j * W);
    r--;
    if (t <= b) { for (let i = r; i >= l; i--) out.push(i + b * W); b--; }
    if (l <= r) { for (let j = b; j >= t; j--) out.push(l + j * W); l++; }
  }
  return out.filter(c => !((c % W) & 1 && ((c / W) | 0) & 1)).slice(0, -SD_LEFT);
})();

// ---------- the painted bits ----------
function tagTex(text, color) {
  return V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(30, h / 2, 10, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}
function iconTex(k) {
  return V.paintTex(64, 64, (g) => {
    g.fillStyle = hexOf(ITEM_COL[k]); g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.strokeRect(4, 4, 56, 56);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    if (k === 0) {   // a bomb
      g.fillStyle = '#16141c'; g.beginPath(); g.arc(30, 36, 15, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(25, 31, 4, 0, TAU); g.fill();
      g.lineWidth = 3; g.beginPath(); g.moveTo(39, 24); g.quadraticCurveTo(44, 14, 50, 16); g.stroke();
      g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(51, 15, 4, 0, TAU); g.fill();
    } else if (k === 1) {   // a flame
      g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(48, 26, 50, 40, 44, 50); g.bezierCurveTo(38, 58, 26, 58, 20, 50); g.bezierCurveTo(14, 40, 20, 30, 26, 24); g.bezierCurveTo(26, 32, 30, 34, 32, 30); g.bezierCurveTo(34, 24, 30, 16, 32, 8); g.fill();
      g.fillStyle = '#fff6d0'; g.beginPath(); g.ellipse(32, 46, 6, 8, 0, 0, TAU); g.fill();
    } else if (k === 2) {   // speed: two chevrons
      g.lineWidth = 7;
      for (const x of [18, 34]) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 14, 32); g.lineTo(x, 46); g.stroke(); }
    } else {   // kick: a boot
      g.beginPath(); g.moveTo(20, 10); g.lineTo(34, 10); g.lineTo(34, 34); g.lineTo(50, 38); g.quadraticCurveTo(56, 42, 54, 50); g.lineTo(18, 50); g.closePath(); g.fill();
      g.fillStyle = hexOf(ITEM_COL[3]); g.fillRect(18, 44, 36, 3);
    }
  });
}

// ---------- the bomber: a round head in its colour, a dark visor, a glowing antenna ball (≈ .28 m) ----------
const G = {
  foot: V.roundBox(.055, .034, .075, .016), torso: V.roundBox(.1, .08, .08, .032), belt: V.roundBox(.106, .018, .086, .008),
  hand: new THREE.SphereGeometry(.022, 10, 8), head: new THREE.SphereGeometry(.074, 18, 14), visor: new THREE.SphereGeometry(.06, 16, 12),
  eye: V.roundBox(.013, .032, .01, .005), stalk: new THREE.CylinderGeometry(.004, .004, .045, 6), ball: new THREE.SphereGeometry(.015, 10, 8),
  ghost: new THREE.SphereGeometry(.07, 14, 10, 0, TAU, 0, PI / 2), skirt: new THREE.CylinderGeometry(.07, .085, .07, 14, 1, true),
};
function bomberModel(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = V.mat(color, { roughness: .4 }), suit = V.mat(0xf3efe4, { roughness: .6 }), dark = V.mat(0x1c1a24, { roughness: .25, metalness: .2 });
  const put = (geo, m, x, y, z, p = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const feet = [-1, 1].map(s => put(G.foot, paint, s * .033, .017, .008, g));
  put(G.torso, suit, 0, .075, 0);
  put(G.belt, dark, 0, .062, 0);
  const hands = [-1, 1].map(s => put(G.hand, suit, s * .068, .078, .012));
  put(G.head, paint, 0, .172, 0);
  const visor = put(G.visor, dark, 0, .168, .03); visor.scale.set(1, .78, .8);
  for (const s of [-1, 1]) put(G.eye, V.lamp(0xfff4c8, 2.2), s * .02, .172, .0785);
  put(G.stalk, dark, 0, .262, 0);
  put(G.ball, V.lamp(color, 1.8), 0, .288, 0);
  g.scale.setScalar(1.15);
  return { g, body, feet, hands };
}
function ghostModel() {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, transparent: true, opacity: .7, depthWrite: false });
  const top = new THREE.Mesh(G.ghost, m); top.position.y = .07; g.add(top);
  const sk = new THREE.Mesh(G.skirt, m); sk.position.y = .035; g.add(sk);
  const em = new THREE.MeshBasicMaterial({ color: 0x1c1a24, transparent: true, opacity: .8, depthWrite: false });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.eye, em); e.position.set(s * .022, .09, .066); g.add(e); }
  g.visible = false;
  return { g, m, em };
}

export function createBomber({ scene, camera, audio, ui, at }) {
  const root = new THREE.Group(); scene.add(root);
  const FY = at.y + .1, X0 = at.x - (W - 1) / 2 * C, Z0 = at.z - (H - 1) / 2 * C;
  const wx = (x) => X0 + x * C, wz = (z) => Z0 + z * C;

  // ---------- the static diorama: a board on the plinth, walls, pillars, torches, banners ----------
  {
    const deco = new THREE.Group(); root.add(deco);
    const put = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); deco.add(o); return o; };
    const BW = (W + 2) * C, BD = (H + 2) * C;
    put(V.roundBox(BW + .14, .1, BD + .14, .03), V.mat(0x5a3a22, { roughness: .55 }), at.x, at.y + .05, at.z);
    put(V.roundBox(BW + .18, .025, BD + .18, .01), V.mat(0xc8a048, { roughness: .35, metalness: .5 }), at.x, at.y + .012, at.z);
    // the grass: a checker, the four start pads, a darker rim by the walls
    const floorTex = V.paintTex(W * 32, H * 32, (g) => {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        g.fillStyle = (i + j) & 1 ? '#5aa83e' : '#67b848'; g.fillRect(i * 32, j * 32, 32, 32);
        for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(${k & 1 ? '255,255,200' : '20,60,10'},.12)`; g.fillRect(i * 32 + ((i * 7 + j * 13 + k * 11) % 29), j * 32 + ((i * 5 + j * 3 + k * 17) % 29), 2, 3); }
      }
      g.strokeStyle = 'rgba(255,255,240,.55)'; g.lineWidth = 3;
      for (const [i, j] of SLOTS) { g.beginPath(); g.arc(i * 32 + 16, j * 32 + 16, 11, 0, TAU); g.stroke(); }
      const gr = g.createLinearGradient(0, 0, 0, 10); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W * 32, 10);
    });
    const floor = put(new THREE.PlaneGeometry(W * C, H * C), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .95 }), at.x, FY + .001, at.z);
    floor.rotation.x = -PI / 2;
    // the rim wall, one block per cell; the corners are towers carrying a brazier
    const stoneA = V.mat(0x8f8c96, { roughness: .85 }), stoneB = V.mat(0x7c7984, { roughness: .85 }), capM = V.mat(0xb3b0ba, { roughness: .7 });
    const wallG = V.roundBox(C * .98, .24, C * .98, .035), towerG = V.roundBox(C * 1.04, .4, C * 1.04, .04);
    for (let i = -1; i <= W; i++) for (let j = -1; j <= H; j++) {
      if (i >= 0 && i < W && j >= 0 && j < H) continue;
      const corner = (i < 0 || i === W) && (j < 0 || j === H);
      if (!corner) { put(wallG, (i + j) & 1 ? stoneA : stoneB, wx(i), FY + .12, wz(j)); continue; }
      put(towerG, stoneB, wx(i), FY + .2, wz(j));
      put(V.roundBox(C * 1.12, .05, C * 1.12, .02), capM, wx(i), FY + .42, wz(j));
      put(new THREE.CylinderGeometry(.09, .06, .08, 12), V.TRIM(), wx(i), FY + .48, wz(j));
      put(new THREE.ConeGeometry(.07, .18, 10), V.lamp(0xff7a1a, 2.6), wx(i), FY + .6, wz(j));
      put(new THREE.ConeGeometry(.04, .11, 8), V.lamp(0xffe070, 3), wx(i), FY + .57, wz(j));
    }
    // pillars: stone blocks with a paler cap
    const pilG = V.roundBox(C * .88, .32, C * .88, .045), pcG = V.roundBox(C * .92, .045, C * .92, .018);
    for (let j = 1; j < H; j += 2) for (let i = 1; i < W; i += 2) { put(pilG, stoneA, wx(i), FY + .16, wz(j)); put(pcG, capM, wx(i), FY + .33, wz(j)); }
    // a banner in each side wall's middle, in the four team colours
    const flagTex = (col) => V.paintTex(64, 96, (g) => {
      g.fillStyle = hexOf(col); g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.lineTo(64, 80); g.lineTo(32, 96); g.lineTo(0, 80); g.fill();
      g.fillStyle = '#16141c'; g.beginPath(); g.arc(32, 44, 16, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(26, 38, 4, 0, TAU); g.fill();
      g.strokeStyle = '#16141c'; g.lineWidth = 3; g.beginPath(); g.moveTo(42, 32); g.quadraticCurveTo(48, 20, 54, 22); g.stroke();
      g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(55, 21, 4, 0, TAU); g.fill();
    });
    const banners = [[(W - 1) / 2, -1, 0, 0xe8384f], [(W - 1) / 2, H, PI, 0x3a8ef0], [-1, (H - 1) / 2, PI / 2, 0x45c060], [W, (H - 1) / 2, -PI / 2, 0xf2c230]];
    for (const [i, j, ry, col] of banners) {
      put(new THREE.CylinderGeometry(.012, .012, .62, 8), V.mat(0x5a3a22), wx(i), FY + .55, wz(j));
      put(new THREE.SphereGeometry(.022, 10, 8), V.mat(0xd8b048, { metalness: .6, roughness: .3 }), wx(i), FY + .87, wz(j));
      const bar = put(new THREE.CylinderGeometry(.008, .008, .26, 6), V.mat(0x5a3a22), wx(i), FY + .8, wz(j)); bar.rotation.set(0, ry, PI / 2);
      const f = put(new THREE.PlaneGeometry(.24, .36), new THREE.MeshStandardMaterial({ map: flagTex(col), transparent: false, alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }), wx(i), FY + .61, wz(j));
      f.rotation.y = ry;
      f.material.map.colorSpace = THREE.SRGBColorSpace;
    }
    // the name plate on the front and back walls
    const plate = V.paintTex(512, 64, (g, w, h) => {
      g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b048'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#ffd86a'; g.font = '800 40px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BOMBARDIERS', w / 2, h / 2 + 2);
    });
    for (const s of [1, -1]) {
      const p = put(new THREE.PlaneGeometry(1.6, .2), new THREE.MeshStandardMaterial({ map: plate, roughness: .6 }), at.x, FY + .12, at.z + s * (BD / 2 + .002));
      if (s < 0) p.rotation.y = PI;
    }
    mergeStatic(deco);
  }

  // ---------- the dynamic board: crates, fallen blocks, power-ups, bombs, flames, specks ----------
  const crateTex = V.paintTex(64, 64, (g) => {
    g.fillStyle = '#b8803f'; g.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 4; k++) { g.fillStyle = k & 1 ? '#a8723a' : '#c28a48'; g.fillRect(6, 6 + k * 13, 52, 12); }
    g.strokeStyle = '#6e4420'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
    g.beginPath(); g.moveTo(6, 58); g.lineTo(58, 6); g.stroke();
    g.fillStyle = '#3a2a1a'; for (const [x, y] of [[8, 8], [56, 8], [8, 56], [56, 56]]) { g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill(); }
  });
  const inst = (geo, mat, n, shadow = false) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m; };
  const crates = inst(V.roundBox(C * .84, C * .78, C * .84, .03), new THREE.MeshStandardMaterial({ map: crateTex, roughness: .8 }), NC, true);
  const blocks = inst(V.roundBox(C * .96, .3, C * .96, .04), V.mat(0x5a5664, { roughness: .6, metalness: .3 }), NC, true);
  const items = ITEM_COL.map((c, k) => { const t = iconTex(k); return inst(V.roundBox(.2, .2, .2, .035), new THREE.MeshStandardMaterial({ map: t, roughness: .4, emissive: 0x333333, emissiveMap: t }), 48); });
  const bombBody = inst(new THREE.SphereGeometry(.11, 18, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .22, metalness: .35 }), BMAX, true);
  const bombCap = inst(new THREE.CylinderGeometry(.034, .04, .05, 10), V.mat(0x9aa0aa, { metalness: .8, roughness: .3 }), BMAX);
  const bombSpark = inst(new THREE.SphereGeometry(.022, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, .8) }), BMAX);
  const flameOut = inst(new THREE.SphereGeometry(.5, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .55, .05), toneMapped: false }), FMAX);
  const flameIn = inst(new THREE.SphereGeometry(.5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, .45), toneMapped: false }), FMAX);
  const specks = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
  const tc = new THREE.Color();
  for (let n = 0; n < BMAX; n++) bombBody.setColorAt(n, tc.setRGB(.08, .08, .1));
  for (let n = 0; n < PMAX; n++) specks.setColorAt(n, tc.setRGB(1, 1, 1));
  const dm = new THREE.Object3D();
  const setM = (mesh, n, x, y, z, sx, sy = sx, sz = sx, ry = 0) => { dm.position.set(x, y, z); dm.rotation.set(0, ry, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); mesh.setMatrixAt(n, dm.matrix); };

  // specks: wood chips, embers, smoke, confetti
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0 }));
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, s, life, r, g, b, grav = 3) {
    const n = pNext, p = parts[n]; pNext = (pNext + 1) % PMAX;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.life = p.max = life; p.g = grav;
    specks.setColorAt(n, tc.setRGB(r, g, b)); specks.instanceColor.needsUpdate = true;
  }
  function burst(x, z, n, sp, up, s, life, r, g, b, grav = 3, y = FY + .1) {
    for (let k = 0; k < n; k++) { const a = Math.random() * TAU, v = sp * (.4 + Math.random() * .6); emit(x, y, z, Math.cos(a) * v, up * (.5 + Math.random() * .7), Math.sin(a) * v, s * (.6 + Math.random() * .8), life * (.7 + Math.random() * .5), r, g, b, grav); }
  }
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) {
        p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < FY + .005) { p.y = FY + .005; p.vy *= -.3; p.vx *= .7; p.vz *= .7; }
      }
      const k = p.life > 0 ? p.life / p.max : 0;
      dm.position.set(p.x, p.y, p.z); dm.rotation.set(p.x * 40, p.z * 40, 0); dm.scale.setScalar(p.s * (k > 0 ? .3 + k * .7 : 0)); dm.updateMatrix();
      specks.setMatrixAt(n, dm.matrix);
    }
    specks.count = PMAX; specks.instanceMatrix.needsUpdate = true;
  }

  // ---------- the game state (identical on every client: the host's copy is the truth) ----------
  const grid = new Uint8Array(NC), hidden = new Int8Array(NC), flame = new Float32Array(NC);
  const S = { ph: 'count', round: 1, t: 0, sd: 0, endT: 0, lastWin: -1, rank: null };
  let bombs = [], fl = [], players = [], me = null, seed = 1, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', clock = 0, acc = 0, sendT = 0, bombId = 0, ended = false, result = null, endT = -1, phaseKey = '', ff = false, shake = 0;
  let dirty = true, pendingX = [], bombHeld = false, lastCount = 0, tick = 0, dangerTick = -1;
  const held = [];
  const chip = createChip(.1);
  const byKey = (k) => players.find(p => p.key === k);
  const cellOf = (p) => Math.round(p.x) + Math.round(p.z) * W;
  const speedOf = (p) => 2.6 + p.spd * .45;
  const bombAt = (i, j) => { for (const b of bombs) if (b.i === i && b.j === j) return b; return null; };
  const live = (p) => p.alive && !p.gone;
  const owned = (p) => p === me || (isHost && p.bot);
  function solidFor(p, i, j) {
    if (i < 0 || j < 0 || i >= W || j >= H) return true;
    const v = grid[i + j * W];
    if (v === PILLAR || v === CRATE || v === BLOCK) return true;
    // your own bomb does not block you until you have stepped off it
    return !!bombAt(i, j) && !(i === Math.round(p.x) && j === Math.round(p.z));
  }
  const freeAx = (p, alongX, u, v) => alongX ? !solidFor(p, u, v) : !solidFor(p, v, u);

  // one step along a grid line: line up with the lane first, walk to the centre when blocked,
  // and slip round a pillar's corner when mostly past it
  function walk(p, d, dist) {
    if (!d) return 0;
    const alongX = DX[d] !== 0, s = alongX ? DX[d] : DZ[d];
    let a = alongX ? p.x : p.z, b = alongX ? p.z : p.x, moved = 0;
    const ca = Math.round(a), cb = Math.round(b), off = b - cb;
    if (freeAx(p, alongX, ca + s, cb)) {
      const al = Math.min(Math.abs(off), dist); b -= Math.sign(off) * al; dist -= al; moved += al;
      a += s * dist; moved += dist;
    } else {
      const toC = (ca - a) * s;
      if (toC > 0) { const k = Math.min(toC, dist); a += s * k; dist -= k; moved += k; }
      const sb = Math.sign(off);
      if (dist > 0 && Math.abs(off) > .12 && freeAx(p, alongX, ca + s, cb + sb) && freeAx(p, alongX, ca, cb + sb)) { const k = Math.min(dist, 1 - Math.abs(off)); b += sb * k; moved += k; }
    }
    if (alongX) { p.x = a; p.z = b; } else { p.z = a; p.x = b; }
    return moved;
  }

  // ---------- the rounds ----------
  function genRound(r) {
    const R = rng(seed * 31 + r * 1013 + 7);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = i + j * W, a = R(), b = R();
      hidden[c] = -1;
      if (i & 1 && j & 1) grid[c] = PILLAR;
      else if ((i <= 1 || i >= W - 2) && (j <= 1 || j >= H - 2)) grid[c] = EMPTY;
      else grid[c] = a < .62 ? CRATE : EMPTY;
      if (grid[c] === CRATE && b < .4) { const k = b / .4; hidden[c] = k < .32 ? 0 : k < .64 ? 1 : k < .84 ? 2 : 3; }
    }
    dirty = true;
  }
  function resetRound() {
    genRound(S.round);
    bombs = []; fl = []; flame.fill(0); S.sd = 0; S.endT = 0; S.lastWin = -1;
    for (const p of players) {
      [p.x, p.z] = SLOTS[p.slot]; p.net = null;
      p.alive = !p.gone; p.bombs = 1; p.range = 2; p.spd = 0; p.kick = false; p.deadT = 0; p.gt = -1; p.dir = 0; p.mv = 0;
      p.face = p.z < H / 2 ? 0 : PI; p.lx = p.x; p.lz = p.z;
      p.ai.next = -1; p.ai.think = .3 + Math.random() * .5; p.ai.modeT = 0;
      p.m.g.visible = !p.gone; p.m.g.scale.setScalar(1); p.gh.g.visible = false;
    }
  }
  function enter(ph) { S.ph = ph; S.t = 0; S.endT = 0; onPhase(); }
  // what every client does on a new phase, the host's own or one heard in a snapshot
  function onPhase() {
    const key = S.ph + S.round;
    if (key === phaseKey) return;
    phaseKey = key;
    if (S.ph === 'count') { resetRound(); lastCount = 0; }
    else if (S.ph === 'play') chip.seq([72, 76, 79, 84, null, 79, 84, 88], .075, { type: .25, vol: .28 });
    else if (S.ph === 'score') {
      const w = players[S.lastWin];
      if (w === me) chip.seq([67, 71, 74, 79, null, 74, 79, 83, 86, 86], .08, { type: .5, vol: .26 });
      else chip.seq(w ? [72, 67, 64, 60] : [64, 63, 62, 61], .13, { type: 'tri', vol: .3 });
      ui.toast(w ? (w === me ? 'tu gagnes la manche !' : `${w.name} gagne la manche`) : 'égalité : personne ne gagne la manche', false, 2200);
    } else if (S.ph === 'final' && !ended) {
      const rank = S.rank || players.map(p => p.slot);
      const place = rank.indexOf(me.slot) + 1, w = me.wins;
      result = { place, of: players.length, value: w, time: clock, text: `${ord(place)} place · ${w} manche${w > 1 ? 's' : ''} gagnée${w > 1 ? 's' : ''}` };
      if (place === 1) { audio.win(); chip.seq([60, 64, 67, 72, 67, 72, 76, 79, null, 84, 84, 84], .09, { type: .25, vol: .28 }); }
      ended = true; endT = FINAL_T;
    }
  }
  function endRound() {
    const alive = players.filter(live), w = alive.length === 1 ? alive[0] : null;
    for (const p of players) p.surv += p.alive ? S.t : p.deadT;
    if (w) w.wins++;
    S.lastWin = w ? w.slot : -1;
    enter('score');
  }
  function nextRound() {
    if (S.round >= ROUNDS || players.some(p => p.wins >= WIN_ROUNDS)) {
      S.rank = [...players].sort((a, b) => (a.gone - b.gone) || (b.wins - a.wins) || (b.surv - a.surv)).map(p => p.slot);
      enter('final');
    } else { S.round++; enter('count'); }
  }

  // ---------- bombs and flames ----------
  function tryDrop(p, i, j) {
    if (!p || !live(p) || S.ph !== 'play' || i < 0 || j < 0 || i >= W || j >= H) return;
    if (Math.abs(i - p.x) > 1.2 || Math.abs(j - p.z) > 1.2) return;
    const v = grid[i + j * W];
    if ((v !== EMPTY && v < ITEM) || bombAt(i, j) || bombs.length >= BMAX) return;
    if (bombs.filter(b => b.owner === p.slot).length >= p.bombs) return;
    const b = { id: ++bombId, i, j, x: i, z: j, rx: i, rz: j, fuse: FUSE, range: p.range, owner: p.slot, dx: 0, dz: 0 };
    bombs.push(b); bombFx(b);
    for (const q of players) if (q.bot) q.ai.alarm = true;
  }
  function bombFx(b) {
    chip.tone(520, 300, .07, { type: .5, vol: .22 });
    burst(wx(b.x), wz(b.z), 5, .25, .5, .014, .4, .8, .75, .6);
  }
  // the host blows a bomb: the arms stop at pillars, break the first crate, burn a power-up, light the next bomb
  function explode(b) {
    bombs.splice(bombs.indexOf(b), 1);
    const arms = [0, 0, 0, 0];
    for (let d = 1; d <= 4; d++) {
      let n = 0, broke = 0;
      for (let k = 1; k <= b.range; k++) {
        const i = b.i + DX[d] * k, j = b.j + DZ[d] * k;
        if (i < 0 || j < 0 || i >= W || j >= H) break;
        const v = grid[i + j * W];
        if (v === PILLAR || v === BLOCK) break;
        if (v === CRATE) { broke = 1; break; }
        n = k;
        const o = bombAt(i, j);
        if (o) { o.fuse = Math.min(o.fuse, .07); break; }
        if (v >= ITEM) break;
      }
      arms[d - 1] = n * 2 + broke;
    }
    blast(b.i, b.j, arms);
    pendingX.push([b.i, b.j, ...arms]);
    for (const q of players) if (q.bot) q.ai.alarm = true;
  }
  // the flames themselves, the same on every client
  function blast(i0, j0, arms) {
    const o = bombAt(i0, j0); if (o) bombs.splice(bombs.indexOf(o), 1);
    addFlame(i0, j0, 0, 0);
    for (let d = 1; d <= 4; d++) {
      const n = arms[d - 1] >> 1;
      for (let k = 1; k <= n; k++) {
        const i = i0 + DX[d] * k, j = j0 + DZ[d] * k, c = i + j * W;
        if (grid[c] >= ITEM) setCell(c, EMPTY);
        addFlame(i, j, d <= 2 ? 2 : 1, k === n ? d : 0);
      }
      if (arms[d - 1] & 1) { const c = i0 + DX[d] * (n + 1) + (j0 + DZ[d] * (n + 1)) * W; if (grid[c] === CRATE) setCell(c, hidden[c] >= 0 ? ITEM + hidden[c] : EMPTY); }
    }
    const x = wx(i0), z = wz(j0), near = me ? Math.hypot(i0 - me.x, j0 - me.z) : 5;
    burst(x, z, 14, .9, 1.4, .02, .5, 3, 1.6, .4, 1);
    burst(x, z, 5, .3, .5, .06, .9, .35, .33, .36, -.4, FY + .15);
    chip.noise(.55, { vol: clamp(.55 - near * .035, .12, .55), f: 900 });
    chip.tone(140, 40, .35, { type: 'tri', vol: clamp(.5 - near * .03, .1, .5) });
    shake = Math.max(shake, clamp(.06 - near * .006, 0, .06));
  }
  function addFlame(i, j, ax, end) {
    const c = i + j * W; flame[c] = FLAME;
    if (fl.length < FMAX / 2) fl.push({ c, ax, end, life: FLAME });
    if (Math.random() < .7) emit(wx(i) + (Math.random() - .5) * .2, FY + .1, wz(j) + (Math.random() - .5) * .2, 0, .4 + Math.random() * .4, 0, .02, .5, 3, .9, .2, -.5);
  }
  // every change to a cell goes through here, so the host and the clients show the same thing
  function setCell(c, v) {
    const old = grid[c]; if (old === v) return;
    grid[c] = v; dirty = true;
    const x = wx(c % W), z = wz((c / W) | 0);
    if (old === CRATE) { burst(x, z, 12, .7, 1.2, .03, .8, .55, .33, .15); burst(x, z, 3, .2, .3, .07, .7, .6, .55, .5, -.3); }
    else if (old >= ITEM && v === EMPTY) {
      const k = old - ITEM;
      tc.setHex(ITEM_COL[k]);
      burst(x, z, 8, .4, 1, .02, .5, tc.r * 2, tc.g * 2, tc.b * 2, 2, FY + .12);
    } else if (v === BLOCK) {
      burst(x, z, 7, .6, .5, .04, .6, .5, .48, .45);
      chip.noise(.14, { vol: .25, f: 400 });
      if (me && Math.hypot(c % W - me.x, ((c / W) | 0) - me.z) < 3) shake = Math.max(shake, .02);
    }
  }
  function die(p) {
    if (!p.alive) return;
    p.alive = false; p.deadT = S.t; p.gt = 0; p.gx = p.x; p.gz = p.z;
    tc.setHex(p.color);
    burst(wx(p.x), wz(p.z), 16, .6, 1.4, .025, .8, tc.r * 1.5, tc.g * 1.5, tc.b * 1.5);
    chip.tone(900, 120, .6, { type: .25, vol: .26 });
    if (p === me) { ui.toast('soufflé ! tu es éliminé', true, 1800); audio.bonk(); shake = .06; }
  }
  function statFx(p) { if (p === me) audio.pickup(2); }

  // ---------- the host's world step ----------
  function simStep(h) {
    S.t += h;
    if (S.ph === 'count') { if (S.t >= COUNT) enter('play'); return; }
    if (S.ph === 'score') { if (S.t >= SCORE_T) nextRound(); return; }
    if (S.ph !== 'play') return;
    tick++;
    for (const p of players) if (p.bot && live(p)) botStep(p, h);
    // kicks: walking into a still bomb, lined up and close
    for (const p of players) {
      if (!live(p) || !p.kick || !p.dir || (p.bot && !p.mv)) continue;
      const ci = Math.round(p.x), cj = Math.round(p.z), b = bombAt(ci + DX[p.dir], cj + DZ[p.dir]);
      const along = DX[p.dir] ? (p.x - ci) * DX[p.dir] : (p.z - cj) * DZ[p.dir], side = DX[p.dir] ? p.z - cj : p.x - ci;
      if (b && !b.dx && !b.dz && along > -.08 && Math.abs(side) < .25) { b.dx = DX[p.dir]; b.dz = DZ[p.dir]; audio.bonk(); }
    }
    for (const b of bombs) {
      if (b.dx || b.dz) {
        const s = b.dx || b.dz, ni = b.i + b.dx, nj = b.j + b.dz, offA = (b.dx ? b.x - b.i : b.z - b.j) * s;
        let stop = ni < 0 || nj < 0 || ni >= W || nj >= H || grid[ni + nj * W] === PILLAR || grid[ni + nj * W] === CRATE || grid[ni + nj * W] === BLOCK || !!bombAt(ni, nj);
        if (!stop) for (const q of players) if (live(q) && Math.round(q.x) === ni && Math.round(q.z) === nj) stop = true;
        if (stop && offA >= 0) { b.x = b.i; b.z = b.j; b.dx = b.dz = 0; }
        else { b.x += b.dx * KICK_V * h; b.z += b.dz * KICK_V * h; b.i = Math.round(b.x); b.j = Math.round(b.z); }
      }
      b.fuse -= h;
      if (flame[b.i + b.j * W] > 0) b.fuse = Math.min(b.fuse, .07);
    }
    for (let n = bombs.length - 1; n >= 0; n--) if (bombs[n] && bombs[n].fuse <= 0) explode(bombs[n]);
    for (let c = 0; c < NC; c++) if (flame[c] > 0) flame[c] -= h;
    // flames knock out, power-ups are picked up
    for (const p of players) {
      if (!live(p)) continue;
      const c = cellOf(p);
      if (flame[c] > 0) { die(p); continue; }
      if (grid[c] >= ITEM) {
        const k = grid[c] - ITEM;
        if (k === 0) p.bombs = Math.min(8, p.bombs + 1); else if (k === 1) p.range = Math.min(8, p.range + 1); else if (k === 2) p.spd = Math.min(4, p.spd + 1); else p.kick = true;
        setCell(c, EMPTY); statFx(p);
        if (p === me) ui.toast(ITEM_NAMES[k], false, 900);
      }
    }
    // the sudden death
    if (S.t >= SD && S.sd === 0 && S.t - h < SD) sdFx();
    while (S.sd < SPIRAL.length && S.t >= SD + S.sd * SD_STEP) {
      const c = SPIRAL[S.sd++];
      setCell(c, BLOCK);
      const o = bombAt(c % W, (c / W) | 0); if (o) bombs.splice(bombs.indexOf(o), 1);
      for (const p of players) if (live(p) && cellOf(p) === c) die(p);
    }
    // the last one standing (a second's grace for a double knock-out)
    if (players.filter(live).length <= 1 || S.t >= ROUND_MAX) { S.endT += h; if (S.endT > 1.2 || S.t >= ROUND_MAX) endRound(); }
  }
  function sdFx() { ui.toast('mort subite ! les blocs tombent', true, 1800); chip.seq([84, null, 84, null, 84, 79], .09, { type: .125, vol: .25 }); }

  // ---------- the bots: flee the blasts, blow crates, hunt the others ----------
  const bq = new Int16Array(NC), bd = new Int16Array(NC), bp = new Int16Array(NC), danger = new Float32Array(NC), mask = new Uint8Array(NC);
  function eachBlast(i, j, range, f) {
    f(i + j * W);
    for (let d = 1; d <= 4; d++) for (let k = 1; k <= range; k++) {
      const ii = i + DX[d] * k, jj = j + DZ[d] * k;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) break;
      const v = grid[ii + jj * W];
      if (v === PILLAR || v === BLOCK || v === CRATE) break;
      f(ii + jj * W);
      if (v >= ITEM || bombAt(ii, jj)) break;
    }
  }
  function computeDanger() {
    if (dangerTick === tick) return;
    dangerTick = tick;
    danger.fill(99);
    for (let c = 0; c < NC; c++) if (flame[c] > 0) danger[c] = 0;
    // chains: a bomb in another's blast goes off with it
    const ft = bombs.map(b => b.fuse);
    for (let pass = 0; pass < 2; pass++) bombs.forEach((b, n) => eachBlast(b.i, b.j, b.range, (c) => { for (let m = 0; m < bombs.length; m++) if (bombs[m].i + bombs[m].j * W === c) ft[m] = Math.min(ft[m], ft[n]); }));
    bombs.forEach((b, n) => eachBlast(b.i, b.j, b.range, (c) => { danger[c] = Math.min(danger[c], ft[n]); }));
    // the next blocks of the sudden death
    if (S.t > SD - 2) for (let k = S.sd; k < Math.min(SPIRAL.length, S.sd + 8); k++) danger[SPIRAL[k]] = Math.min(danger[SPIRAL[k]], Math.max(0, SD + k * SD_STEP - S.t));
  }
  const walkable = (c, start) => c === start || ((grid[c] === EMPTY || grid[c] >= ITEM) && !bombAt(c % W, (c / W) | 0));
  // breadth first from start; flee: may cross cells that blow later than we pass, safe: only calm cells
  function bfs(start, sp, flee, withMask) {
    let head = 0, tail = 0;
    bd.fill(-1); bd[start] = 0; bp[start] = start; bq[tail++] = start;
    while (head < tail) {
      const c = bq[head++], i = c % W, j = (c / W) | 0, nd = bd[c] + 1, tArr = nd / sp;
      for (let d = 1; d <= 4; d++) {
        const ii = i + DX[d], jj = j + DZ[d];
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const n = ii + jj * W;
        if (bd[n] >= 0 || !walkable(n, start) || flame[n] > 0) continue;
        if (flee) { if (danger[n] < 99 && danger[n] < tArr + .45) continue; if (withMask && mask[n] && FUSE < tArr + .45) continue; }
        else if (danger[n] < 99) continue;
        bd[n] = nd; bp[n] = c; bq[tail++] = n;
      }
    }
    return tail;
  }
  function firstStep(goal, start) { let c = goal; while (bp[c] !== start && c !== start) c = bp[c]; return c === start ? -1 : c; }
  function canEscape(p, cur, sp) {
    mask.fill(0);
    eachBlast(cur % W, (cur / W) | 0, p.range, (c) => { mask[c] = 1; });
    const n = bfs(cur, sp, true, true);
    for (let k = 0; k < n; k++) { const c = bq[k]; if (!mask[c] && danger[c] >= 99 && bd[c] <= (FUSE - .6) * sp) return true; }
    return false;
  }
  function decide(p) {
    computeDanger();
    const ai = p.ai, sp = speedOf(p), cur = cellOf(p), ci = cur % W, cj = (cur / W) | 0;
    ai.alarm = false;
    if (danger[cur] < 99 || flame[cur] > 0) {
      const n = bfs(cur, sp, true, false);
      let best = -1, bt = -1;
      for (let k = 0; k < n; k++) { const c = bq[k]; if (danger[c] >= 99) { best = c; break; } if (danger[c] > bt) { bt = danger[c]; best = c; } }
      ai.next = best >= 0 ? firstStep(best, cur) : -1;
      return;
    }
    let n = bfs(cur, sp, false, false);
    // a bomb here? next to a crate, or an enemy in the line of fire
    if (bombs.filter(b => b.owner === p.slot).length < p.bombs && !bombAt(ci, cj)) {
      let want = 0;
      for (let d = 1; d <= 4; d++) { const ii = ci + DX[d], jj = cj + DZ[d]; if (ii >= 0 && jj >= 0 && ii < W && jj < H && grid[ii + jj * W] === CRATE) want = .8; }
      mask.fill(0);
      eachBlast(ci, cj, p.range, (c) => { mask[c] = 1; });
      for (const q of players) if (q !== p && live(q)) { if (mask[cellOf(q)]) want = Math.max(want, .9); else if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < 2.5) want = Math.max(want, .45); }
      if (want && Math.random() < want * ai.aggr && canEscape(p, cur, sp)) {
        tryDrop(p, ci, cj); dangerTick = -1; computeDanger();
        const m = bfs(cur, sp, true, false);
        for (let k = 0; k < m; k++) if (danger[bq[k]] >= 99) { ai.next = firstStep(bq[k], cur); return; }
        ai.next = -1; return;
      }
      n = bfs(cur, sp, false, false);
    }
    // where to: a power-up, else crates or the hunt, else a wander
    ai.modeT -= .2;
    if (ai.modeT <= 0) { ai.hunt = Math.random() < ai.aggr * .7; ai.modeT = 3 + Math.random() * 3; }
    let item = -1, crate = -1, foe = -1;
    for (let k = 1; k < n; k++) {
      const c = bq[k], i = c % W, j = (c / W) | 0;
      if (item < 0 && grid[c] >= ITEM && bd[c] <= 9) item = c;
      if (crate < 0) for (let d = 1; d <= 4; d++) { const ii = i + DX[d], jj = j + DZ[d]; if (ii >= 0 && jj >= 0 && ii < W && jj < H && grid[ii + jj * W] === CRATE) { crate = c; break; } }
      if (foe < 0) for (const q of players) if (q !== p && live(q) && Math.abs(q.x - i) + Math.abs(q.z - j) < 1.6) { foe = c; break; }
    }
    let goal = item >= 0 ? item : ai.hunt && foe >= 0 ? foe : crate >= 0 ? crate : foe;
    if (goal < 0 && n > 1) goal = bq[1 + Math.floor(Math.random() * Math.min(n - 1, 6))];
    ai.next = goal >= 0 ? firstStep(goal, cur) : -1;
  }
  function botStep(p, h) {
    const ai = p.ai, sp = speedOf(p);
    ai.think -= h;
    if (ai.alarm && ai.think > .25) ai.think = .08 + Math.random() * .18;
    if (ai.next >= 0) {
      const ni = ai.next % W, nj = (ai.next / W) | 0, dx = ni - p.x, dz = nj - p.z;
      if (Math.abs(dx) < .03 && Math.abs(dz) < .03) { p.x = ni; p.z = nj; ai.next = -1; p.mv = 0; }
      else {
        const d = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 4 : 3) : (dz > 0 ? 2 : 1);
        const moved = walk(p, d, Math.min(sp * h, Math.max(Math.abs(dx), Math.abs(dz))));
        p.dir = d; p.mv = moved > 1e-5 ? 1 : 0;
        if (!p.mv) { ai.stuck += h; if (ai.stuck > .35) { ai.next = -1; ai.stuck = 0; } } else ai.stuck = 0;
      }
    } else p.mv = 0;
    if ((ai.next < 0 || ai.alarm) && ai.think <= 0) { decide(p); ai.think = .05 + Math.random() * .2 * (1.6 - ai.aggr); }
  }

  // ---------- players ----------
  const shadowOf = () => { const s = V.contactShadow(.2, .2, .45); root.add(s); return s; };
  function makePlayer(u, slot) {
    const m = bomberModel(u.color); root.add(m.g);
    const gh = ghostModel(); root.add(gh.g);
    let tag = null;
    if (u.tag) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(u.name, u.color), transparent: true, depthWrite: false })); tag.scale.set(.24, .06, 1); root.add(tag); }
    return { slot, key: u.key, name: u.name, color: u.color, bot: u.bot, gone: false, m, gh, tag, sh: shadowOf(),
      x: SLOTS[slot][0], z: SLOTS[slot][1], lx: SLOTS[slot][0], lz: SLOTS[slot][1], alive: true, bombs: 1, range: 2, spd: 0, kick: false, wins: 0, surv: 0, deadT: 0,
      dir: 0, mv: 0, face: 0, walk: 0, gt: -1, gx: 0, gz: 0, net: null, seen: 0,
      ai: { next: -1, think: 0, stuck: 0, alarm: false, aggr: .7 + Math.random() * .25, hunt: false, modeT: 0 } };
  }
  function dropPlayer(p) {
    root.remove(p.m.g, p.gh.g, p.sh);
    p.gh.m.dispose(); p.gh.em.dispose();
    if (p.tag) { root.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); }
  }
  // the idle diorama: four bombers in their corners, a bomb ticking, a blast frozen mid-air
  function decor() {
    for (const p of players) dropPlayer(p);
    seed = 4242; genRound(0);
    players = BOTS.slice(0, 4).map(([name, color], slot) => makePlayer({ key: 'd' + slot, name, color, bot: true }, slot));
    players.forEach(p => { p.face = p.z < H / 2 ? .6 : PI - .6; });
    for (const c of [5 + 5 * W, 4 + 5 * W, 6 + 5 * W, 5 + 4 * W, 5 + 6 * W, 5 + 3 * W, 3 + 5 * W, 2 + 9 * W, 10 + 2 * W, 8 + 7 * W]) if (grid[c] !== PILLAR) grid[c] = EMPTY;
    grid[3 + 5 * W] = ITEM + 1; grid[8 + 7 * W] = ITEM; grid[2 + 9 * W] = ITEM + 2;
    bombs = [{ id: 0, i: 10, j: 2, x: 10, z: 2, rx: 10, rz: 2, fuse: 1.4, range: 2, owner: 1, dx: 0, dz: 0 }];
    grid[10 + 2 * W] = EMPTY;
    fl = [[5, 5, 0, 0], [4, 5, 1, 3], [6, 5, 1, 4], [5, 4, 2, 1], [5, 6, 2, 2]].map(([i, j, ax, end]) => ({ c: i + j * W, ax, end, life: FLAME * .7 }));
    dirty = true; draw(0);
  }

  // ---------- network ----------
  const i100 = (v) => Math.round(v * 100);
  function snapshot() {
    let g = '';
    for (let c = 0; c < NC; c++) g += String.fromCharCode(48 + grid[c]);
    return { t: 'w', ph: PH.indexOf(S.ph), r: S.round, tt: i100(S.t), sd: S.sd, ff: ff ? 1 : 0, lw: S.lastWin, rk: S.rank || 0, g,
      p: players.map(p => [i100(p.x), i100(p.z), p.dir, p.mv, p.alive ? 1 : 0, p.bombs, p.range, p.spd, p.kick ? 1 : 0, p.wins]),
      b: bombs.map(b => [b.id, i100(b.x), i100(b.z), i100(b.fuse), b.range, b.owner, b.dx, b.dz]) };
  }
  function applySnap(pid, fx) {
    S.round = fx.r; S.ph = PH[fx.ph] || 'play'; ff = !!fx.ff; S.lastWin = fx.lw; S.rank = fx.rk || null;
    const key = S.ph + S.round;
    if (key !== phaseKey) S.t = fx.tt / 100;
    onPhase();
    const t = fx.tt / 100; S.t = Math.abs(t - S.t) > .3 ? t : S.t + (t - S.t) * .3;
    if (fx.sd > S.sd && S.sd === 0) sdFx();
    S.sd = fx.sd;
    for (let c = 0; c < NC; c++) { const v = fx.g.charCodeAt(c) - 48; if (v !== grid[c]) setCell(c, v); }
    fx.p.forEach((a, n) => {
      const p = players[n]; if (!p || p.gone) return;
      const [x, z, dir, mv, alive, nb, rg, spd, kick, wins] = a;
      if (p === me && (nb > p.bombs || rg > p.range || spd > p.spd || (kick && !p.kick))) statFx(p);
      p.bombs = nb; p.range = rg; p.spd = spd; p.kick = !!kick; p.wins = wins;
      if (p.alive && !alive) die(p);
      if (p !== me && (p.bot || p.key === pid)) { p.net = { x: x / 100, z: z / 100, t: 0 }; p.dir = dir; p.mv = mv; }
    });
    const ids = new Set();
    for (const [id, x, z, fuse, range, owner, dx, dz] of fx.b) {
      ids.add(id);
      let b = bombs.find(o => o.id === id);
      if (!b) { b = { id, rx: x / 100, rz: z / 100 }; bombs.push(b); b.x = x / 100; b.z = z / 100; bombFx(b); }
      Object.assign(b, { x: x / 100, z: z / 100, i: Math.round(x / 100), j: Math.round(z / 100), fuse: fuse / 100, range, owner, dx, dz });
    }
    bombs = bombs.filter(b => ids.has(b.id));
  }
  function follow(p, dt) {
    const n = p.net; if (!n) return;
    n.t += dt;
    const k = Math.min(n.t, .15) * (p.mv ? speedOf(p) : 0), tx = n.x + DX[p.dir] * k, tz = n.z + DZ[p.dir] * k;
    if (Math.abs(tx - p.x) + Math.abs(tz - p.z) > 2) { p.x = tx; p.z = tz; }
    const a = Math.min(1, dt * 14);
    p.x += (tx - p.x) * a; p.z += (tz - p.z) * a;
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const p = byKey(pid);
    if (p) p.seen = clock;
    if (fx.t === 's' && p && p !== me && !p.gone) { p.net = { x: fx.p[0] / 100, z: fx.p[1] / 100, t: 0 }; p.dir = fx.p[2]; p.mv = fx.p[3]; }
    else if (fx.t === 'd' && isHost) tryDrop(p, fx.i, fx.j);
    else if (fx.t === 'w' && !isHost) applySnap(pid, fx);
    else if (fx.t === 'x' && !isHost) for (const [i, j, ...arms] of fx.l) blast(i, j, arms);
  }
  function peerLeft(id) {
    const p = byKey(id);
    if (!p || p.gone || p === me) return;
    p.gone = true; p.alive = false; p.m.g.visible = false; p.gh.g.visible = false; p.sh.visible = false; if (p.tag) p.tag.visible = false;
    if (id === hostId) {
      hostId = hostOf(players.filter(q => !q.bot && !q.gone).map(q => ({ id: q.key })), hostId);
      isHost = hostId === meId;
      if (isHost) { acc = 0; for (const b of players) if (b.bot && b.net) { b.x = b.net.x; b.z = b.net.z; b.ai.next = -1; } }
    }
  }

  // ---------- the frame ----------
  function readInput(keys) {
    for (let d = 1; d <= 4; d++) {
      const on = keys.has(KEYS[d][0]) || keys.has(KEYS[d][1]), n = held.indexOf(d);
      if (on && n < 0) held.push(d); else if (!on && n >= 0) held.splice(n, 1);
    }
    const bomb = keys.has('Space') || keys.has('KeyJ');
    if (bomb && !bombHeld && me && live(me) && S.ph === 'play') {
      const i = Math.round(me.x), j = Math.round(me.z);
      if (isHost) tryDrop(me, i, j); else send({ t: 'd', i, j });
    }
    bombHeld = bomb;
  }
  function moveMe(dt) {
    me.mv = 0; me.dir = held.length ? held[held.length - 1] : 0;
    if (!live(me) || S.ph !== 'play' || !me.dir) return;
    const dist = speedOf(me) * dt;
    let moved = walk(me, me.dir, dist);
    if (moved < 1e-5 && held.length > 1) { const d2 = held[held.length - 2]; moved = walk(me, d2, dist); if (moved > 1e-5) me.dir = d2; }
    me.mv = moved > 1e-5 ? 1 : 0;
  }
  function update(dt, keys) {
    if (state === 'off') return;
    dt = clamp(dt || 0, 0, .05);
    clock += dt;
    readInput(keys);
    moveMe(dt);
    ff = S.ph === 'play' && !players.some(p => !p.bot && live(p)) && (isHost ? true : ff);
    const k = ff ? 3 : 1;
    if (isHost) {
      acc += dt * k;
      let n = 0;
      while (acc >= STEP) { acc -= STEP; simStep(STEP); if (++n > 12) { acc = 0; break; } }
      if (pendingX.length) { send({ t: 'x', l: pendingX }); pendingX = []; }
    } else {
      S.t += dt * k;
      for (const b of bombs) { b.fuse = Math.max(.05, b.fuse - dt * k); if (b.dx || b.dz) { b.x += b.dx * KICK_V * dt; b.z += b.dz * KICK_V * dt; } }
      for (let c = 0; c < NC; c++) if (flame[c] > 0) flame[c] -= dt * k;
    }
    for (const p of players) if (!owned(p) && !p.gone) follow(p, dt);
    if (S.ph === 'count') { const n = Math.ceil(COUNT - S.t); if (n !== lastCount && n > 0) audio.tick(); lastCount = n; }
    // drop the humans that never came
    if (clock > 9) for (const p of players) if (!p.bot && !p.gone && p !== me && !p.seen) peerLeft(p.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = isHost ? .08 : .075;
      if (isHost) send(snapshot()); else if (me) send({ t: 's', p: [i100(me.x), i100(me.z), me.dir, me.mv] });
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; onEnd(result); } }
    draw(dt);
    cam(dt);
  }

  // ---------- drawing ----------
  function draw(dt) {
    const time = clock;
    if (dirty) {
      dirty = false;
      let n = 0;
      for (let c = 0; c < NC; c++) if (grid[c] === CRATE) setM(crates, n++, wx(c % W), FY + C * .39, wz((c / W) | 0), 1, 1, 1, ((c * 7) % 4) * PI / 2);
      crates.count = n; crates.instanceMatrix.needsUpdate = true;
    }
    // the fallen blocks, and those on their way down
    let nb = 0;
    for (let c = 0; c < NC; c++) if (grid[c] === BLOCK) setM(blocks, nb++, wx(c % W), FY + .15, wz((c / W) | 0), 1);
    if (S.ph === 'play' && state !== 'off') for (let k = S.sd; k < Math.min(SPIRAL.length, S.sd + 4); k++) {
      const c = SPIRAL[k], left = SD + k * SD_STEP - S.t;
      if (left < .5 && grid[c] !== BLOCK) setM(blocks, nb++, wx(c % W), FY + .15 + Math.max(0, left) / .5 * 2.2, wz((c / W) | 0), 1);
    }
    blocks.count = nb; blocks.instanceMatrix.needsUpdate = true;
    // power-ups: spinning, bobbing
    const cnt = [0, 0, 0, 0];
    for (let c = 0; c < NC; c++) if (grid[c] >= ITEM) {
      const k = grid[c] - ITEM, m = items[k];
      if (cnt[k] < 48) setM(m, cnt[k]++, wx(c % W), FY + .15 + Math.sin(time * 3 + c) * .02, wz((c / W) | 0), 1, 1, 1, time * 1.5 + c);
    }
    items.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; });
    // bombs: they swell faster as the fuse burns down, and flush red at the end
    bombs.forEach((b, n) => {
      b.rx += (b.x - b.rx) * Math.min(1, dt * 18 || 1); b.rz += (b.z - b.rz) * Math.min(1, dt * 18 || 1);
      const rate = 7 + (FUSE - b.fuse) * 9, pulse = 1 + Math.sin(time * rate + b.id) * (.06 + (FUSE - b.fuse) * .03);
      const x = wx(b.rx), z = wz(b.rz), y = FY + .11 * pulse;
      setM(bombBody, n, x, y, z, pulse);
      setM(bombCap, n, x, y + .11 * pulse, z, 1);
      setM(bombSpark, n, x + .02, y + .15 * pulse, z, .7 + Math.random() * .7);
      const hot = b.fuse < .7 ? (Math.sin(time * 30) * .5 + .5) * (1 - b.fuse / .7) : 0;
      bombBody.setColorAt(n, tc.setRGB(.08 + hot * .9, .08, .1));
    });
    for (const m of [bombBody, bombCap, bombSpark]) { m.count = bombs.length; m.instanceMatrix.needsUpdate = true; }
    if (bombBody.instanceColor) bombBody.instanceColor.needsUpdate = true;
    // flames: a ball in the middle, sausages along the arms, a tapered tip at each end
    let nf = 0;
    for (let k = fl.length - 1; k >= 0; k--) {
      const f = fl[k];
      if (state !== 'off') f.life -= dt;
      if (f.life <= 0) { fl.splice(k, 1); continue; }
      const i = f.c % W, j = (f.c / W) | 0, age = FLAME - f.life, fade = Math.min(1, f.life / .2), pop = age < .08 ? 1.3 - age / .08 * .3 : 1;
      const th = fade * pop * (1 + Math.sin(time * 40 + f.c) * .08), len = f.end ? C * .8 : C * 1.08;
      let x = wx(i), z = wz(j);
      if (f.end) { x -= DX[f.end] * .04; z -= DZ[f.end] * .04; }
      const sx = f.ax === 0 ? .36 * th : f.ax === 1 ? len : .24 * th, sz = f.ax === 0 ? .36 * th : f.ax === 2 ? len : .24 * th;
      setM(flameOut, nf, x, FY + .12, z, sx, .3 * th, sz);
      setM(flameIn, nf, x, FY + .16, z, sx * (f.ax === 1 ? .9 : .6), .3 * th, sz * (f.ax === 2 ? .9 : .6));
      nf++;
    }
    flameOut.count = flameIn.count = nf; flameOut.instanceMatrix.needsUpdate = flameIn.instanceMatrix.needsUpdate = true;
    // the bombers
    for (const p of players) {
      if (p.gone) continue;
      const g = p.m.g, dx = p.x - p.lx, dz = p.z - p.lz, d = Math.hypot(dx, dz);
      p.lx = p.x; p.lz = p.z;
      if (d > 1e-4 && d < 1) { p.face += wrap(Math.atan2(dx, dz) - p.face) * Math.min(1, dt * 16); p.walk += d * 9; }
      else if (p.dir && p.mv) p.face += wrap(Math.atan2(DX[p.dir], DZ[p.dir]) - p.face) * Math.min(1, dt * 16);
      const moving = d > 1e-4;
      g.position.set(wx(p.x), FY, wz(p.z)); g.rotation.y = p.face;
      const win = S.ph === 'score' && S.lastWin === p.slot;
      p.m.body.position.y = win ? Math.abs(Math.sin(time * 9)) * .06 : moving ? Math.abs(Math.sin(p.walk)) * .012 : Math.sin(time * 3 + p.slot) * .003;
      p.m.feet[0].position.z = .008 + (moving ? Math.sin(p.walk) * .022 : 0); p.m.feet[1].position.z = .008 - (moving ? Math.sin(p.walk) * .022 : 0);
      p.m.hands[0].position.y = p.m.hands[1].position.y = win ? .13 : .078;
      p.sh.position.set(wx(p.x), FY + .004, wz(p.z)); p.sh.visible = p.alive;
      // knocked out: a squash, then a little ghost floats up and fades
      if (!p.alive && p.gt >= 0) {
        p.gt += dt;
        g.visible = p.gt < .3; g.scale.set(1 + p.gt * 2, Math.max(.05, 1 - p.gt * 3), 1 + p.gt * 2);
        const gg = p.gh.g, k = p.gt / 2.6;
        gg.visible = k < 1;
        if (k < 1) {
          gg.position.set(wx(p.gx) + Math.sin(p.gt * 4) * .03, FY + .05 + p.gt * .22, wz(p.gz)); gg.rotation.y = Math.sin(p.gt * 2) * .5;
          p.gh.m.opacity = .7 * (1 - k); p.gh.em.opacity = .8 * (1 - k);
        }
      } else if (p.alive) { g.visible = true; g.scale.setScalar(1); }
      if (p.tag) { p.tag.position.set(wx(p.x), FY + .42, wz(p.z)); p.tag.visible = p.alive; }
    }
    stepParts(dt);
  }

  // ---------- the camera: high and tilted behind you, like a board seen from your chair ----------
  const camT = new THREE.Vector3(), camP = new THREE.Vector3(), look = new THREE.Vector3(), over = new THREE.Vector3(), eye = new THREE.Vector3();
  let camFov = 60, camInit = false;
  function cam(dt) {
    if (!me) return;
    const alive = live(me) && S.ph !== 'final';
    over.set(at.x, FY + 4.3, at.z + 3.1);
    const tx = at.x + (wx(me.x) - at.x) * .8, tz = wz(me.z);
    look.set(tx, FY, tz - .4);
    if (!camInit) { camT.copy(look); camInit = true; }
    camT.lerp(alive ? look : over.set(at.x, FY, at.z + .15), Math.min(1, dt * 5));
    if (alive) camP.set(camT.x, FY + 2.3, camT.z + 1.5);
    else camP.set(camT.x, FY + 4.6, camT.z + 3.1);
    if (S.ph === 'count' && S.round === 1) {
      // a swoop down from over the whole board
      const k = clamp(1 - Math.pow(Math.max(0, COUNT - .4 - S.t) / (COUNT - .4), 2), 0, 1);
      camP.lerpVectors(over.set(at.x, FY + 4.3, at.z + 3.1), camP, k);
    }
    // our own eye: the page puts the camera back on the (disabled) player every frame
    eye.lerp(camP, dt ? Math.min(1, dt * 8) : 1);
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .25); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
    camera.up.set(0, 1, 0);
    camera.lookAt(camT);
    if (Math.abs(camera.fov - 55) > .01) { camera.fov = 55; camera.updateProjectionMatrix(); }
  }

  // ---------- start, stop ----------
  function start({ seed: sd = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {} } = {}) {
    stopDyn();
    seed = (sd >>> 0) || 1; meId = mid; hostId = h; isHost = hostId === meId; send = s;
    const R = rng(seed);
    const pool = BOTS.slice().sort(() => R() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    const list = humans.slice(0, 4).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false, tag: u.id !== meId }));
    for (let n = 0; list.length < 4; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true, tag: true });
    players = list.map((u, slot) => makePlayer(u, slot));
    me = byKey(meId);
    Object.assign(S, { ph: 'count', round: 1, t: 0, sd: 0, endT: 0, lastWin: -1, rank: null });
    state = 'on'; clock = 0; acc = 0; sendT = 0; bombId = 0; ended = false; result = null; endT = -1; phaseKey = ''; ff = false; shake = 0;
    pendingX = []; held.length = 0; bombHeld = false; tick = 0; dangerTick = -1; camInit = false;
    camFov = camera.fov;
    chip.init();
    onPhase();
    if (me) { camT.set(wx(me.x), FY, wz(me.z)); camInit = true; eye.set(at.x, FY + 4.3, at.z + 3.1); }
    draw(0); cam(0);
  }
  function stopDyn() {
    for (const p of players) dropPlayer(p);
    players = []; me = null; bombs = []; fl = []; flame.fill(0);
    for (const p of parts) p.life = 0;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close();
    decor();
  }
  decor();

  // ---------- the HUD ----------
  const stars = (p) => '★'.repeat(p.wins) + '☆'.repeat(Math.max(0, WIN_ROUNDS - p.wins));
  const nameOf = (p) => p === me ? '<em>toi</em>' : esc(p.name);
  const board = (list) => `<div class="board">${list.map(p => `<span style="color:${hexOf(p.color)}">${p.alive || S.ph !== 'play' ? '' : '✗ '}${nameOf(p)} ${stars(p)}</span>`).join('')}</div>`;
  function hud() {
    if (state === 'off' || !me) return { hidden: true };
    if (S.ph === 'count') return S.round === 1 ? { count: Math.max(1, Math.ceil(COUNT - S.t)) } : { html: `<b>manche ${S.round} / ${ROUNDS}</b><span class="big">${Math.max(1, Math.ceil(COUNT - S.t))}</span>${board(players.filter(p => !p.gone))}` };
    if (S.ph === 'play' && S.t < .7) return S.round === 1 ? { count: 0 } : { html: `<b>manche ${S.round} / ${ROUNDS}</b><span class="big">partez !</span>` };
    const list = players.filter(p => !p.gone);
    if (S.ph === 'play') {
      const title = S.t >= SD ? 'mort subite !' : `manche ${S.round} / ${ROUNDS} · mort subite dans ${mmss(SD - S.t)}`;
      const line = live(me) ? `<span>bombes <em>${me.bombs}</em> · portée <em>${me.range}</em> · vitesse <em>${me.spd + 1}</em>${me.kick ? ' · <em>coup de pied</em>' : ''}</span>`
        : `<span>éliminé · tu regardes la fin de la manche${ff ? ' <em>(accélérée ×3)</em>' : ''}</span>`;
      return { html: `<b>${title}</b>${line}${board(list)}` };
    }
    if (S.ph === 'score') {
      const w = players[S.lastWin];
      return { html: `<b>fin de la manche ${S.round}</b><span class="big">${w ? (w === me ? 'tu gagnes !' : esc(w.name) + ' gagne') : 'égalité'}</span>${board(list)}` };
    }
    const rank = (S.rank || players.map(p => p.slot)).map(s => players[s]);
    return { html: `<b>fin de la partie</b><span class="big">${result ? ord(result.place) + ' place' : ''}</span><div class="board">${rank.map((p, n) => `<span style="color:${hexOf(p.color)}">${n + 1}. ${nameOf(p)} ${'★'.repeat(p.wins)}</span>`).join('')}</div>` };
  }

  return {
    modes: MODES,
    keys: [['z q s d', 'bouger'], ['espace', 'poser une bombe'], ['bonus', 'bombe · flamme · vitesse · coup de pied'], ['manches', 'le dernier debout gagne · meilleur des 3']],
    start, stop, update, onFx, peerLeft, hud,
    respawn() {},
    preview() { return { x: at.x, y: FY + .2, z: at.z, yaw: PI, rad: 3.4, h: 2.6 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get me() { return me; }, get players() { return players; }, get bombs() { return bombs; }, get S() { return S; }, get grid() { return grid; }, get isHost() { return isHost; }, get flames() { return fl; },
    _go() { if (isHost && S.ph === 'count') S.t = COUNT; },
    _skip(t) { if (isHost && S.ph === 'play') S.t = t; },
  };
}
