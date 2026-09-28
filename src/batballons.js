// batballons.js, bataille 64: a toy fortress on the plinth where tiny karts fight with balloons,
// in the spirit of the balloon battle of Mario Kart 64. Four coloured forts hold the corners,
// ramps climb along the walls to their tops, bridges join them over the checkered courtyard.
// Each kart carries three balloons; the floating boxes give green shells (they bounce off the
// walls), red shells (they home in), bananas, fake boxes and a turbo mushroom. A hit spins you
// out and pops a balloon; without balloons you drive on as a little bomb that makes the others
// spin. The last one with balloons wins, or after three minutes the most balloons, then popped.
// Network: each client drives its own kart and sends its state; projectiles are spawned by their
// owner and run everywhere; a hit is decided by the victim's client; the host runs the bots and
// brings the boxes back.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';
import { mergeStatic } from './merge.js';
import { netTrack, netNow, netStamp } from './netlerp.js';
import { hostOf, createChip, fmt, ord, hexOf } from './retro.js';

const PI = Math.PI, TAU = PI * 2;
// the arena: walls at ±W, fort tops at H; karts: radius R, height KH, a step they climb, gravity
const W = 2.85, H = .34, FT = .04, R = .045, KH = .09, STEP = .035, GRAV = 4, SC = .1, T = .2;
const ROUND = 180, LIVES = 3, DT = 1 / 60, BOX_BACK = 4;
const FORTS = [0xe0483c, 0x3c72e0, 0x3cb04c, 0xf0c030];
const BOTS = [['pipo', 0xe8384f], ['roxane', 0xf2c230], ['gaston', 0x3a8ef0], ['mila', 0x45c060], ['zazie', 0xb05ae0], ['tonio', 0xf08a2a]];
const ITEMS = { g: 'carapace verte', r: 'carapace rouge', b: 'banane', m: 'champignon turbo', f: 'fausse boîte' };
const MODES = [{ id: 'ballons', name: 'bataille de ballons', sub: '3 ballons chacun · le dernier qui en a encore gagne', help: 'zqsd · shift : saut et dérapage · espace : objet (s + espace : vers l\'arrière) · r : retour au fort', unit: 'frags' }];
const BOFF = [[-.028, .16, -.055], [.028, .16, -.055], [0, .19, -.07]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const rot = (q, x, z) => { for (let k = 0; k < q; k++) [x, z] = [-z, x]; return [x, z]; };
const css = (hex, k = 0) => '#' + new THREE.Color(hex).lerp(new THREE.Color(k > 0 ? 0xffffff : 0), Math.abs(k)).getHexString();

function repTex(w, h, draw) { const t = V.paintTex(w, h, draw); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const checker = (a, b) => new THREE.MeshStandardMaterial({ roughness: .75, map: repTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }) });
function softTex() {
  return V.paintTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.6, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
}
function tagTex(text, color) {
  return V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(30, h / 2, 10, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}
// the "?" box face: a bright frame and the question mark, see-through in between
function boxFace(g, w, fake) {
  g.clearRect(0, 0, w, w);
  g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(0, 0, w, w);
  g.lineWidth = w * .1; g.strokeStyle = '#fff'; g.strokeRect(w * .05, w * .05, w * .9, w * .9);
  g.save(); g.translate(w / 2, w / 2); if (fake) g.rotate(PI);
  g.font = `900 ${w * .7}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = w * .06; g.strokeStyle = 'rgba(30,20,40,.8)'; g.strokeText('?', 0, w * .04); g.fillStyle = '#fff'; g.fillText('?', 0, w * .04);
  g.restore();
}
// the item window's pictures
function icon(draw) { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); return c.toDataURL(); }
const shellIcon = (col) => icon((g) => {
  g.fillStyle = col; g.beginPath(); g.arc(32, 38, 22, PI, 0); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; for (const x of [22, 32, 42]) { g.beginPath(); g.arc(x, 30, 5, 0, TAU); g.stroke(); }
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(32, 40, 27, 7, 0, 0, TAU); g.fill();
});
const ICONS = {
  g: shellIcon('#2fb84a'), r: shellIcon('#e0342c'),
  b: icon((g) => { g.strokeStyle = '#ffd21f'; g.lineWidth = 13; g.lineCap = 'round'; g.beginPath(); g.arc(32, 8, 34, .3 * PI, .72 * PI); g.stroke(); g.fillStyle = '#6a4a1a'; g.fillRect(49, 32, 7, 8); }),
  m: icon((g) => { g.fillStyle = '#f0e0c0'; g.fillRect(22, 32, 20, 22); g.fillStyle = '#8a3ad8'; g.beginPath(); g.arc(32, 34, 26, PI, 0); g.fill(); g.fillStyle = '#fff'; for (const [x, y, r] of [[20, 26, 5], [36, 18, 6], [46, 30, 4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } }),
  f: icon((g) => { g.fillStyle = '#c83a30'; g.fillRect(6, 6, 52, 52); boxFace(g, 64, true); }),
};

// geometry painted with vertex colours: flat faces, a handful of colours, one draw per kart
function vc(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function painter() {
  const parts = [];
  return {
    put(geo, col, x, y, z, rx = 0, rz = 0) { const g = vc(geo, col); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); parts.push(g); },
    done(s = SC) { const g = mergeGeometries(parts); g.scale(s, s, s); return g; },
  };
}
// a kart built at full size (1.3 m, nose to +z), shrunk to toy scale
function kartGeo(color) {
  const p = painter(), suit = new THREE.Color(color).lerp(new THREE.Color(0x1a1a22), .35).getHex(), dark = 0x2a2a32, grey = 0x9a9aa4;
  for (const s of [-1, 1]) {
    p.put(new THREE.CylinderGeometry(.17, .17, .15, 8), 0x1c1c22, s * .36, .17, .38, 0, PI / 2);
    p.put(new THREE.CylinderGeometry(.21, .21, .19, 8), 0x1c1c22, s * .38, .21, -.4, 0, PI / 2);
    p.put(new THREE.CylinderGeometry(.08, .08, .16, 6), grey, s * .38, .17, .38, 0, PI / 2);
    p.put(new THREE.CylinderGeometry(.1, .1, .2, 6), grey, s * .4, .21, -.4, 0, PI / 2);
    p.put(new THREE.BoxGeometry(.16, .16, .5), color, s * .3, .26, -.02);
    p.put(new THREE.BoxGeometry(.1, .1, .3), suit, s * .2, .54, .04, -.5);
    p.put(new THREE.CylinderGeometry(.04, .05, .16, 6), grey, s * .12, .36, -.64, PI / 2);
  }
  p.put(new THREE.BoxGeometry(.56, .07, 1.12), dark, 0, .15, 0);
  p.put(new THREE.BoxGeometry(.5, .17, .42), color, 0, .27, .37);
  p.put(new THREE.BoxGeometry(.66, .1, .14), dark, 0, .18, .64);
  p.put(new THREE.BoxGeometry(.3, .08, .2), 0xf4f0e4, 0, .37, .4);
  p.put(new THREE.BoxGeometry(.4, .36, .12), dark, 0, .38, -.28);
  p.put(new THREE.BoxGeometry(.42, .2, .24), grey, 0, .3, -.5);
  p.put(new THREE.BoxGeometry(.26, .04, .04), dark, 0, .52, .18);
  p.put(new THREE.BoxGeometry(.34, .34, .24), suit, 0, .52, -.12);
  p.put(new THREE.IcosahedronGeometry(.16, 1), 0xf0c8a0, 0, .82, -.08);
  p.put(new THREE.SphereGeometry(.19, 8, 5, 0, TAU, 0, PI * .55), color, 0, .83, -.11);
  p.put(new THREE.BoxGeometry(.24, .07, .05), 0x203040, 0, .8, .07);
  return p.done();
}
// out of balloons: a little round bomb on wheels, a band of the kart's colour
function bombGeo(color) {
  const p = painter();
  p.put(new THREE.IcosahedronGeometry(.4, 1), 0x24222c, 0, .5, 0);
  p.put(new THREE.TorusGeometry(.4, .06, 4, 12), color, 0, .5, 0, PI / 2);
  p.put(new THREE.CylinderGeometry(.08, .1, .12, 6), 0x8a8a92, 0, .94, 0);
  p.put(new THREE.CylinderGeometry(.02, .02, .18, 4), 0xc8a060, .05, 1.06, 0, 0, -.4);
  for (const s of [-1, 1]) {
    p.put(new THREE.BoxGeometry(.08, .16, .04), 0xffffff, s * .12, .6, .37);
    for (const z of [-.22, .22]) p.put(new THREE.CylinderGeometry(.12, .12, .1, 8), 0x1c1c22, s * .3, .12, z, 0, PI / 2);
  }
  return p.done();
}
function shellGeo(color) {
  const p = painter();
  p.put(new THREE.SphereGeometry(.028, 8, 3, 0, TAU, 0, PI / 2), color, 0, .006, 0);
  p.put(new THREE.CylinderGeometry(.031, .031, .012, 8), 0xf4f0e4, 0, .006, 0);
  return p.done(1);
}
function bananaGeo() {
  const p = painter();
  p.put(new THREE.TorusGeometry(.022, .008, 4, 7, PI * .9), 0xffd21f, 0, .03, 0, 0, PI * 1.05);
  p.put(new THREE.BoxGeometry(.006, .01, .006), 0x5a3a14, -.021, .036, 0);
  return p.done(1);
}
// a wedge rising along +z from 0 to h over len, w wide; UVs in tiles of T metres
function wedge(len, w, h, sides) {
  const x = w / 2, sl = Math.hypot(len, h), P = [], U = [];
  const tri = (a, b, c, ua, ub, uc) => { P.push(...a, ...b, ...c); U.push(...ua, ...ub, ...uc); };
  if (!sides) {
    tri([-x, 0, 0], [-x, h, len], [x, h, len], [0, 0], [0, sl / T], [w / T, sl / T]);
    tri([-x, 0, 0], [x, h, len], [x, 0, 0], [0, 0], [w / T, sl / T], [w / T, 0]);
  } else {
    tri([x, 0, 0], [x, h, len], [x, 0, len], [0, 0], [len / T, h / T], [len / T, 0]);
    tri([-x, 0, 0], [-x, 0, len], [-x, h, len], [0, 0], [len / T, 0], [len / T, h / T]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}

export function createBatballons({ scene, camera, audio, ui, at }) {
  const O = new THREE.Vector3(at.x, at.y + FT, at.z);
  const deco = new THREE.Group(); deco.position.copy(O); scene.add(deco);
  const dyn = new THREE.Group(); dyn.position.copy(O);

  // ---------- the fortress: solid pieces the karts drive on and bump into ----------
  const pieces = [];
  function piece(q, x0, x1, z0, z1, y0, y1, ramp) {
    const [ax, az] = rot(q, x0, z0), [bx, bz] = rot(q, x1, z1);
    const p = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), y0, y1, ramp: null };
    if (ramp) { const [lx, lz] = rot(q, ramp[0], ramp[1]), [dx, dz] = rot(q, ramp[2], ramp[3]); p.ramp = { lx, lz, dx, dz, len: ramp[4] }; }
    pieces.push(p);
    return p;
  }
  const topOf = (p, x, z) => p.ramp ? p.y1 * clamp(((x - p.ramp.lx) * p.ramp.dx + (z - p.ramp.lz) * p.ramp.dz) / p.ramp.len, 0, 1) : p.y1;
  // the highest surface under (x, z) that something at height y can stand on
  function support(x, z, y) {
    let best = 0;
    for (const p of pieces) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const t = topOf(p, x, z);
      if (t <= y + STEP && t > best) best = t;
    }
    return best;
  }
  // would a body of radius r at (x, y, z) be inside a wall (or out of the arena)?
  function blocked(x, z, y, r = R) {
    if (Math.abs(x) > W - r || Math.abs(z) > W - r) return true;
    for (const p of pieces) {
      if (x < p.x0 - r || x > p.x1 + r || z < p.z0 - r || z > p.z1 + r || p.y0 > y + KH) continue;
      const cx = clamp(x, p.x0, p.x1), cz = clamp(z, p.z0, p.z1);
      if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
      if (topOf(p, cx, cz) > y + STEP) return true;
    }
    return false;
  }
  // for the camera: is this point inside anything?
  function solidAt(x, z, y) {
    if (Math.abs(x) > W - .03 || Math.abs(z) > W - .03 || y < .03) return true;
    for (const p of pieces) if (x > p.x0 - .03 && x < p.x1 + .03 && z > p.z0 - .03 && z < p.z1 + .03 && y > p.y0 - .03 && y < topOf(p, clamp(x, p.x0, p.x1), clamp(z, p.z0, p.z1)) + .03) return true;
    return false;
  }

  // ---------- building it: checkered blocks, four forts, ramps and bridges ----------
  const fortMat = FORTS.map(c => checker(css(c), css(c, .38)));
  const stone = checker('#bdb6a8', '#9c9588'), slab = checker('#ece8dc', '#6c6a78'), rail = V.mat(0xf4f0e4, { roughness: .6 });
  const stripe = FORTS.map(c => new THREE.MeshStandardMaterial({ roughness: .7, map: repTex(64, 64, (g) => {
    g.fillStyle = css(c); g.fillRect(0, 0, 64, 64); g.fillStyle = '#f4f0e4';
    g.beginPath(); g.moveTo(4, 40); g.lineTo(32, 14); g.lineTo(60, 40); g.lineTo(60, 54); g.lineTo(32, 28); g.lineTo(4, 54); g.fill();
  }) }));
  function block(x0, x1, y0, y1, z0, z1, m) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let i = 0; i < 24; i++) { const [du, dv] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * du / T, uv.getY(i) * dv / T); }
    const o = new THREE.Mesh(g, m); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); deco.add(o);
    return o;
  }
  const solid = (q, x0, x1, z0, z1, y0, y1, m) => { const p = piece(q, x0, x1, z0, z1, y0, y1); if (m) block(p.x0, p.x1, y0, y1, p.z0, p.z1, m); return p; };
  const deck = (q, x0, x1, z0, z1, y0, y1, m) => { const [ax, az] = rot(q, x0, z0), [bx, bz] = rot(q, x1, z1); block(Math.min(ax, bx), Math.max(ax, bx), y0, y1, Math.min(az, bz), Math.max(az, bz), m); };
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -.12, 0), new THREE.Vector3(.2, -.06, 0)]); flagGeo.computeVertexNormals();
  for (let q = 0; q < 4; q++) {
    const fm = fortMat[q];
    solid(q, 1.25, W, 1.25, W, 0, H, fm);                         // the fort
    solid(q, 2.25, W, 2.25, W, 0, H + .3, fm);                    // its tower
    for (const [a, b] of [[2.25, 2.35], [2.75, W]]) for (const [c, d] of [[2.25, 2.35], [2.75, W]]) deck(q, a, b, c, d, H + .3, H + .38, fm);
    solid(q, W - .06, W, 1.25, 2.25, H, H + .05, stone);          // parapets on the outer sides
    solid(q, 1.25, 2.25, W - .06, W, H, H + .05, stone);
    for (let k = 0; k < 3; k++) { deck(q, W - .06, W, 1.3 + k * .33, 1.42 + k * .33, H + .05, H + .1, stone); deck(q, 1.3 + k * .33, 1.42 + k * .33, W - .06, W, H + .05, H + .1, stone); }
    // dark doorways on the two faces that look at the courtyard
    const door = V.mat(0x2a2432, { roughness: .9 });
    deck(q, 1.24, 1.25, 1.6, 1.8, 0, .16, door); deck(q, 1.6, 1.8, 1.24, 1.25, 0, .16, door);
    deck(q, 1.24, 1.25, 2.3, 2.4, .2, .26, door); deck(q, 2.0, 2.1, 1.24, 1.25, .2, .26, door);
    // the ramp, up along the wall to the fort's side
    piece(q, 2.35, W, .25, 1.25, 0, H, [2.6, .25, 0, 1, 1]);
    const [rx, rz] = rot(q, 2.6, .25);
    for (const sides of [false, true]) { const m = new THREE.Mesh(wedge(1, W - 2.35, H, sides), sides ? fm : stripe[q]); m.position.set(rx, 0, rz); m.rotation.y = -q * PI / 2; deco.add(m); }
    // the bridge to the next fort, railed, on two piers
    solid(q, -1.25, 1.25, 1.85, 2.25, H - .05, H, slab);
    for (const z of [1.83, 2.23]) { piece(q, -1.25, 1.25, z, z + .04, H - .05, H + .05); deck(q, -1.25, 1.25, z, z + .04, H + .035, H + .05, rail); for (let k = 0; k <= 10; k++) deck(q, -1.24 + k * .244, -1.22 + k * .244, z + .01, z + .03, H, H + .04, rail); }
    for (const x of [-.5, .5]) solid(q, x - .06, x + .06, 1.99, 2.11, 0, H - .05, stone);
    // a pillar near the middle, for cover
    solid(q, .52, .68, .52, .68, 0, .2, stone); deck(q, .5, .7, .5, .7, .2, .24, fm);
    // the outer wall, crenellated
    deck(q, -W - .12, W, W, W + .12, 0, .26, stone);
    for (let k = 0; k < 19; k++) deck(q, -W - .08 + k * .31, -W + .04 + k * .31, W + .01, W + .12, .26, .33, stone);
    // a pennant on the tower
    const [fx, fz] = rot(q, 2.55, 2.55);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .34, 5), rail); pole.position.set(fx, H + .47, fz); deco.add(pole);
    const flag = new THREE.Mesh(flagGeo, V.mat(FORTS[q], { side: THREE.DoubleSide })); flag.position.set(fx, H + .64, fz); flag.rotation.y = -q * PI / 2 + PI * .75; deco.add(flag);
  }
  // the courtyard floor: a checkerboard tinted by each corner's fort, a balloon emblem in the middle
  const floorTex = V.paintTex(1024, 1024, (g, w) => {
    const n = 24, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = i >= n / 2 ? (j >= n / 2 ? 0 : 3) : (j >= n / 2 ? 1 : 2);
      g.fillStyle = css(FORTS[q], (i + j) % 2 ? .72 : .42); g.fillRect(i * s, j * s, s, s);
    }
    g.fillStyle = '#f4f0e4'; g.beginPath(); g.arc(w / 2, w / 2, w * .11, 0, TAU); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#2a2a36'; g.stroke();
    [[-.035, .01, '#e0483c'], [.035, .01, '#3c72e0'], [0, -.035, '#f0c030']].forEach(([dx, dy, c]) => { g.fillStyle = c; g.beginPath(); g.ellipse(w * (.5 + dx), w * (.5 + dy), w * .03, w * .036, 0, 0, TAU); g.fill(); });
    g.fillStyle = '#2a2a36'; g.font = `900 ${w * .04}px Rubik, sans-serif`; g.textAlign = 'center'; g.fillText('64', w / 2, w * .59);
  });
  floorTex.anisotropy = 8;
  // the texture's x runs along +x, its rows along +z (row 0 at -z)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, W * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .8 }));
  floor.rotation.x = -PI / 2; floor.position.y = .001; deco.add(floor);
  block(-W - .12, W + .12, -FT, 0, -W - .12, W + .12, stone);
  // the name on two outer walls, for whoever walks by
  const signTex = V.paintTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#26243a'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#f0c030'; g.stroke();
    g.font = '900 84px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = 'BATAILLE 64', tw = g.measureText(txt).width; let x = w / 2 - tw / 2;
    for (let i = 0; i < txt.length; i++) { g.fillStyle = hexOf(FORTS[i % 4]); g.fillText(txt[i], x + g.measureText(txt[i]).width / 2, h / 2 + 4); x += g.measureText(txt[i]).width; }
  });
  for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .21), new THREE.MeshBasicMaterial({ map: signTex, transparent: true })); m.position.set(0, .13, s * (W + .125)); m.rotation.y = s > 0 ? 0 : PI; deco.add(m); }
  mergeStatic(deco);
  deco.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });

  // the item boxes: floating rainbow cubes (instanced, part of the decor)
  const boxes = [];
  for (let q = 0; q < 4; q++) for (const [x, z, y] of [[.3, 0, 0], [0, 2.05, H], [1.55, 1.55, H], [2.6, 0, 0]]) { const [bx, bz] = rot(q, x, z); boxes.push({ x: bx, z: bz, gy: y, on: true, offT: 0, grow: 1 }); }
  const boxTex = V.paintTex(128, 128, (g, w) => boxFace(g, w, false));
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.085, .085, .085), new THREE.MeshBasicMaterial({ map: boxTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }), boxes.length);
  boxMesh.frustumCulled = false; deco.add(boxMesh);
  const dm = new THREE.Object3D(), tc = new THREE.Color();
  function drawBoxes(t) {
    boxes.forEach((b, i) => {
      dm.position.set(b.x, b.gy + .075 + Math.sin(t * 2 + i) * .008, b.z); dm.rotation.set(.45, t * 1.4 + i, .3); dm.scale.setScalar(Math.max(1e-4, b.grow)); dm.updateMatrix();
      boxMesh.setMatrixAt(i, dm.matrix); boxMesh.setColorAt(i, tc.setHSL((t * .25 + i * .09) % 1, .85, .62).multiplyScalar(1.6));
    });
    boxMesh.instanceMatrix.needsUpdate = true; boxMesh.instanceColor.needsUpdate = true;
  }
  drawBoxes(0);

  // ---------- the nav graph for the bots: a grid on every level, linked where a kart can drive ----------
  // follow a straight line from a to b like a kart would: the height reached, or -1 if a wall is in the way
  function drive(ax, ay, az, bx, bz, r = R * 1.2) {
    let y = ay;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / .05));
    for (let k = 1; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (blocked(x, z, y, r)) return -1;
      y = support(x, z, y);
    }
    return y;
  }
  const nodes = [];
  {
    const cell = new Map();
    for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
      const x = i * .3, z = j * .3, lv = new Set([0]);
      for (const p of pieces) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) lv.add(+topOf(p, x, z).toFixed(4));
      for (const y of lv) if (Math.abs(support(x, z, y) - y) < .002 && !blocked(x, z, y, R * 1.5)) {
        const nd = { x, y, z, out: [] }; nodes.push(nd);
        const k = i + ',' + j; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(nodes.length - 1);
      }
    }
    for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) for (const a of cell.get(i + ',' + j) || []) {
      const A = nodes[a];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        for (const b of cell.get((i + di) + ',' + (j + dj)) || []) {
          const B = nodes[b], y = drive(A.x, A.y, A.z, B.x, B.z);
          if (y >= 0 && Math.abs(y - B.y) < .01) A.out.push(b, Math.hypot(B.x - A.x, B.z - A.z) + Math.max(0, A.y - B.y));
        }
      }
    }
  }
  const NN = nodes.length, nDist = new Float32Array(NN), nPrev = new Int32Array(NN), nDone = new Uint8Array(NN);
  function nearestNode(x, y, z) {
    let b = -1, bd = Infinity;
    for (let i = 0; i < NN; i++) { const n = nodes[i], d = (n.x - x) ** 2 + (n.z - z) ** 2 + (Math.abs(n.y - y) > .05 ? 9 : 0); if (d < bd) { bd = d; b = i; } }
    return b;
  }
  // the nodes from s to g, cheapest first (Dijkstra, small enough to run plainly)
  function route(s, g) {
    nDist.fill(Infinity); nDone.fill(0); nDist[s] = 0; nPrev[s] = -1;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < NN; i++) if (!nDone[i] && nDist[i] < ud) { ud = nDist[i]; u = i; }
      if (u < 0 || u === g) break;
      nDone[u] = 1;
      const o = nodes[u].out;
      for (let k = 0; k < o.length; k += 2) { const v = o[k], d = ud + o[k + 1]; if (d < nDist[v]) { nDist[v] = d; nPrev[v] = u; } }
    }
    if (nDist[g] === Infinity) return null;
    const p = []; for (let u = g; u >= 0; u = nPrev[u]) { p.push(u); if (u === s) break; }
    return p.reverse();
  }

  // ---------- dynamic things: particles, balloons, projectiles, shadows ----------
  const PMAX = 320;
  const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), PMAX);
  pMesh.frustumCulled = false; dyn.add(pMesh);
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0 }));
  for (let i = 0; i < PMAX; i++) pMesh.setColorAt(i, tc.set(1, 1, 1));
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, s, life, color, k = 1, g = 2) {
    const p = parts[pNext]; pMesh.setColorAt(pNext, tc.setHex(color).multiplyScalar(k)); pNext = (pNext + 1) % PMAX;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.life = p.max = life; p.g = g;
  }
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) { p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const d = 1 - dt * 2; p.vx *= d; p.vz *= d; }
      const k = p.life > 0 ? p.life / p.max : 0;
      dm.position.set(p.x, p.y, p.z); dm.rotation.set(p.x * 40, p.z * 40, 0); dm.scale.setScalar(k > 0 ? p.s * (.3 + k * .7) : 0); dm.updateMatrix();
      pMesh.setMatrixAt(n, dm.matrix);
    }
    pMesh.instanceMatrix.needsUpdate = true; pMesh.instanceColor.needsUpdate = true;
  }
  const burst = (x, y, z, n, color, sp = .6, s = .007, k = 1.4) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (.4 + Math.random() * .6); emit(x, y, z, Math.cos(a) * v, Math.random() * sp * 1.2, Math.sin(a) * v, s * (.6 + Math.random() * .8), .4 + Math.random() * .4, color, k); } };

  const balloonMat = new THREE.MeshStandardMaterial({ roughness: .3, flatShading: true, emissive: 0x222222 });
  const bGeo = new THREE.SphereGeometry(1, 8, 6); bGeo.scale(1, 1.18, 1);
  const bMesh = new THREE.InstancedMesh(bGeo, balloonMat, 16); bMesh.frustumCulled = false; bMesh.castShadow = true; dyn.add(bMesh);
  for (let i = 0; i < 16; i++) bMesh.setColorAt(i, tc.set(1, 1, 1));
  const sPos = new Float32Array(16 * 6), sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const strings = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ color: 0xe8e4dc })); strings.frustumCulled = false; dyn.add(strings);
  const shGeo = new THREE.PlaneGeometry(.16, .16); shGeo.rotateX(-PI / 2);
  const shMesh = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ map: softTex(), color: 0x14101e, transparent: true, opacity: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 8);
  shMesh.frustumCulled = false; dyn.add(shMesh);
  const kartMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .5 });
  const bombMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .4, transparent: true, opacity: .8 });
  const shotMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .35 });
  const SHOT = { g: shellGeo(0x2fb84a), r: shellGeo(0xe0342c), b: bananaGeo(), f: new THREE.BoxGeometry(.06, .06, .06) };
  const fakeMat = new THREE.MeshBasicMaterial({ map: V.paintTex(128, 128, (g, w) => boxFace(g, w, true)), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(1.7, .7, .6) });
  const shotMesh = {};
  for (const k of ['g', 'r', 'b', 'f']) { const m = new THREE.InstancedMesh(SHOT[k], k === 'f' ? fakeMat : shotMat, 24); m.frustumCulled = false; m.count = 0; m.castShadow = k !== 'f'; dyn.add(m); shotMesh[k] = m; }
  const geoCache = new Map();
  const cachedGeo = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };

  // ---------- sound ----------
  const chip = createChip(.1);
  let mot = null;
  function motorTick(sp, on) {
    const ctx = chip.ctx; if (!ctx) return;
    if (!mot) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(); mot = { o, g };
    }
    const t = ctx.currentTime;
    mot.o.frequency.setTargetAtTime(55 + Math.abs(sp) * 120, t, .05); mot.g.gain.setTargetAtTime(on ? .012 + Math.abs(sp) * .01 : 0, t, .08);
  }

  // ---------- karts ----------
  let karts = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, acc = 0, result = null, respawnCd = 0, seq = 0, auto = false;
  let camYaw = 0, camFov = 72, shake = 0, shots = [], itemEl = null, itemShown = '', finalBoard = '';
  const keysWas = { use: false };
  const byKey = (k) => karts.find(c => c.key === k);
  const mine = (c) => !!c && (c.key === meId || (isHost && c.bot));
  const START = [0, 1, 2, 3].map(q => { const [x, z] = rot(q, 1.85, 1.85); return { x, z, yaw: Math.atan2(-x, -z) }; });
  function makeKart(key, name, color, bot, slot) {
    const kart = new THREE.Mesh(cachedGeo('k' + color, () => kartGeo(color)), kartMat); kart.castShadow = true;
    const bomb = new THREE.Mesh(cachedGeo('b' + color, () => bombGeo(color)), bombMat); bomb.visible = false;
    dyn.add(kart, bomb);
    let tag = null;
    if (key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false })); tag.scale.set(.2, .05, 1); dyn.add(tag); }
    const c = { key, name, color, bot, slot, kart, bomb, tag, x: 0, y: H, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0, vy: 0, air: false, pitch: 0, roll: 0, steer: 0,
      balloons: LIVES, hits: 0, out: false, outAt: 0, spinT: 0, spinVis: 0, invT: 0, boostT: 0, drift: 0, driftCh: 0, hopWas: false, item: null, rollT: 0, fireCd: 0, bombCd: 0,
      bumpT: 0, net: null, seen: 0, bp: BOFF.map(() => new THREE.Vector3()), skill: 1, inp: { thr: 0, steer: 0, hop: false, use: false, back: false },
      ai: { think: 0, ax: 0, az: 0, tk: null, dist: 0, stuck: 0, backT: 0, backS: 1, hold: 0 } };
    placeAt(c, slot);
    return c;
  }
  function placeAt(c, slot) {
    const s = START[slot % 4];
    c.x = s.x; c.z = s.z; c.y = H; c.yaw = s.yaw; c.speed = c.vx = c.vz = c.vy = 0; c.air = false; c.drift = 0;
    for (let k = 0; k < 3; k++) balloonTarget(c, k, c.bp[k]);
  }
  const _v = new THREE.Vector3();
  function balloonTarget(c, k, out) {
    const [ox, oy, oz] = BOFF[k], a = c.yaw + c.spinVis, s = Math.sin(a), co = Math.cos(a);
    return out.set(c.x + ox * co + oz * s, c.y + oy, c.z - ox * s + oz * co);
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {} } = {}) {
    stopDyn();
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    let rs = (seed >>> 0) || 1; const rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    state = 'count'; count = 3; clock = 0; goAt = 0; endT = -1; sendT = 0; acc = 0; result = null; respawnCd = 0; shake = 0; seq = 0; finalBoard = '';
    camFov = camera.fov;
    const list = humans.slice(0, 4).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false }));
    const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    for (let n = 0; list.length < 4; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    karts = list.map((u, n) => { const c = makeKart(u.key, u.name, u.color, u.bot, n); c.skill = .92 + rnd() * .06; return c; });
    me = byKey(meId);
    for (const b of boxes) { b.on = true; b.offT = 0; b.grow = 1; }
    scene.add(dyn);
    if (me) camYaw = me.yaw;
    itemEl = document.createElement('div');
    itemEl.style.cssText = 'position:fixed;left:16px;top:16px;width:72px;height:72px;border-radius:14px;background:rgba(20,14,10,.72);border:3px solid rgba(255,255,255,.85);pointer-events:none;z-index:5;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(itemEl); itemShown = '';
    chip.init();
    audio.tick();
    update(0, new Set());
  }
  function stopDyn() {
    for (const c of karts) { dyn.remove(c.kart, c.bomb); if (c.tag) { dyn.remove(c.tag); c.tag.material.map.dispose(); c.tag.material.dispose(); } }
    karts = []; me = null; shots = [];
    for (const p of parts) p.life = 0;
    for (const k in shotMesh) shotMesh[k].count = 0;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    scene.remove(dyn);
    for (const b of boxes) { b.on = true; b.grow = 1; }
    drawBoxes(0);
    itemEl?.remove(); itemEl = null;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close(); mot = null;
  }

  // ---------- what hurts ----------
  function setBalloons(c, n) {
    n = Math.max(0, n);
    for (let k = n; k < c.balloons; k++) {
      const p = c.bp[k];
      burst(p.x, p.y, p.z, 14, c.color, .5, .006, 1.6); burst(p.x, p.y, p.z, 6, 0xffffff, .4, .005);
      if (me && Math.hypot(me.x - p.x, me.z - p.z) < 3) chip.noise(.09, { vol: .3, f: 5000 });
    }
    c.balloons = n;
  }
  function goOut(c, at) {
    if (c.out) return;
    c.out = true; c.outAt = at; c.item = null; c.rollT = 0; c.drift = 0; c.bombCd = 2;
    burst(c.x, c.y + .05, c.z, 24, 0x2a2a32, .7, .01, 1);
    if (c === me) ui.toast('plus de ballons : tu roules en bombe, fonce sur les autres !', true, 2200);
    else if (me && state === 'play') ui.toast(`${c.name} n'a plus de ballons`, false, 1200);
  }
  function credit(by, victim) {
    const s = by && by !== victim.key ? byKey(by) : null;
    if (!s) return;
    s.hits++;
    if (s === me) { ui.toast(`touché : ${victim.name} !`, false, 900); chip.seq([76, 79, 84], .05, { type: .25, vol: .25 }); }
  }
  // c (one of mine) was hit: spin out, lose a balloon, tell everyone
  function hurt(c, by, id) {
    c.spinT = 1.1; c.invT = 2.4; c.drift = 0; c.boostT = 0; c.speed *= .25; c.vx *= .3; c.vz *= .3;
    setBalloons(c, c.balloons - 1);
    credit(by, c);
    if (c.balloons <= 0) goOut(c, clock - goAt);
    send({ t: 'h', k: c.key, id, by, b: c.balloons, oa: Math.round(c.outAt * 100) / 100 });
    if (c === me) { shake = .25; audio.bonk(); chip.tone(900, 180, .45, { type: .25, vol: .3 }); if (c.balloons > 0) ui.toast(`aïe ! ${c.balloons} ballon${c.balloons > 1 ? 's' : ''}`, true, 900); }
  }
  // g drove into c (one of mine) on a drift or a turbo: a balloon changes hands
  function steal(g, c) {
    c.spinT = .8; c.invT = 2; c.drift = 0; c.boostT = 0; c.speed *= .4; c.vx *= .5; c.vz *= .5;
    setBalloons(c, c.balloons - 1);
    const gb = Math.min(LIVES, g.balloons + 1);
    if (mine(g)) g.balloons = gb;
    credit(g.key, c);
    if (c.balloons <= 0) goOut(c, clock - goAt);
    send({ t: 'st', g: g.key, k: c.key, b: c.balloons, gb, oa: Math.round(c.outAt * 100) / 100 });
    stolen(g, c);
  }
  function stolen(g, c) {
    burst(c.x, c.y + .12, c.z, 12, g.color, .5, .007, 1.4);
    if (c === me) { shake = .2; audio.bonk(); chip.tone(700, 200, .35, { type: .25, vol: .3 }); ui.toast(`${g.name} t'a volé un ballon !`, true, 1100); }
    if (g === me) { chip.seq([72, 79, 84, 88], .05, { type: .25, vol: .25 }); ui.toast(`ballon volé à ${c.name} !`, false, 1100); }
  }
  function spinOnly(c) { c.spinT = 1; c.invT = 2; c.drift = 0; c.speed *= .2; c.air = true; c.vy = .6; if (c === me) { shake = .3; audio.boom(); } }

  // ---------- items ----------
  function pickItem(c) {
    const w = c.balloons === 1 ? { g: 2, r: 4, b: 1, m: 2, f: 1 } : { g: 3, r: 2, b: 3, m: 1.5, f: 2 };
    let t = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) if ((t -= w[k]) <= 0) return k;
    return 'g';
  }
  function foeAhead(c, cone, range, behind = false) {
    let best = null, bd = Infinity;
    for (const o of karts) {
      if (o === c || o.out) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), da = Math.abs(wrap(Math.atan2(dx, dz) - c.yaw - (behind ? PI : 0)));
      if (d < range && da < cone && d + da < bd) { bd = d + da; best = o; }
    }
    return best;
  }
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function useItem(c, back) {
    const it = c.item;
    if (!it || c.rollT > 0 || c.fireCd > 0 || c.out) return;
    c.item = null; c.fireCd = .3;
    if (it === 'm') { c.boostT = 1.1; if (c === me) chip.tone(160, 900, .35, { type: 'saw', vol: .2 }); return; }
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), drop = it === 'b' || it === 'f', dir = drop || back ? -1 : 1;
    const f = { t: 'w', w: it, o: c.key, id: c.key + ':' + (++seq), p: [r3(c.x + fx * dir * .1), r3(c.y), r3(c.z + fz * dir * .1)], v: [0, 0] };
    if (!drop) { const sp = it === 'g' ? 2.1 : 1.8; f.v = [r3(fx * dir * sp), r3(fz * dir * sp)]; }
    if (it === 'r') { const tg = foeAhead(c, back ? PI : .9, 4) || foeAhead(c, PI, 9); if (tg) f.tg = tg.key; }
    spawn(f); send(f);
  }
  function spawn(f) {
    if (shots.some(s => s.id === f.id)) return;
    shots.push({ id: f.id, w: f.w, o: f.o, x: f.p[0], y: f.p[1], z: f.p[2], vx: f.v[0], vz: f.v[1], vy: 0, age: 0, life: f.w === 'g' ? 8 : f.w === 'r' ? 6 : 60, tg: f.tg || null, bounces: 0, spin: 0 });
    if (me && Math.hypot(me.x - f.p[0], me.z - f.p[2]) < 3) {
      if (f.w === 'g' || f.w === 'r') chip.tone(260, 900, .12, { type: .5, vol: .22 });
      else chip.tone(500, 220, .1, { type: 'tri', vol: .25 });
    }
  }
  function kill(id, fx = true) {
    const i = shots.findIndex(s => s.id === id); if (i < 0) return;
    const s = shots[i]; shots.splice(i, 1);
    if (fx) burst(s.x, s.y + .02, s.z, 10, s.w === 'g' ? 0x2fb84a : s.w === 'r' ? 0xe0342c : s.w === 'b' ? 0xffd21f : 0xff8a4a, .5);
  }
  function stepShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.age += dt;
      if (s.age > s.life || s.bounces > 6) { kill(s.id); continue; }
      if (s.w !== 'g' && s.w !== 'r') continue;
      if (s.w === 'r' && s.tg) {
        const t = byKey(s.tg);
        if (t && !t.out && s.age > .2) {
          const a = Math.atan2(s.vx, s.vz), d = clamp(wrap(Math.atan2(t.x - s.x, t.z - s.z) - a), -3.5 * dt, 3.5 * dt);
          s.vx = Math.sin(a + d) * 1.8; s.vz = Math.cos(a + d) * 1.8;
        }
      }
      const nx = s.x + s.vx * dt;
      if (blocked(nx, s.z, s.y, .025)) { if (s.w === 'r') { kill(s.id); continue; } s.vx = -s.vx; s.bounces++; } else s.x = nx;
      const nz = s.z + s.vz * dt;
      if (blocked(s.x, nz, s.y, .025)) { if (s.w === 'r') { kill(s.id); continue; } s.vz = -s.vz; s.bounces++; } else s.z = nz;
      const sup = support(s.x, s.z, s.y);
      if (s.y - sup > .014) { s.vy -= GRAV * dt; s.y = Math.max(sup, s.y + s.vy * dt); if (s.y === sup) s.vy = 0; } else { s.y = sup; s.vy = 0; }
    }
  }
  // decided by the victim's client: my karts against every projectile; my shells against the traps
  function checkHits() {
    for (const c of karts) {
      if (!mine(c) || c.out) continue;
      if (c.invT <= 0) for (const s of shots) {
        if (s.o === c.key && (s.w === 'r' || s.age < (s.w === 'g' ? .5 : .9))) continue;
        if ((s.x - c.x) ** 2 + (s.z - c.z) ** 2 < (R + .025) ** 2 && Math.abs(s.y - c.y) < .08) { kill(s.id); hurt(c, s.o, s.id); break; }
      }
      // a bomb kart touching me
      if (c.invT <= 0) for (const g of karts) {
        if (!g.out || g.bombCd > 0 || g === c) continue;
        if ((g.x - c.x) ** 2 + (g.z - c.z) ** 2 < .1 ** 2 && Math.abs(g.y - c.y) < .08) { bombHit(g, c); send({ t: 'bb', g: g.key, k: c.key }); break; }
      }
      // rammed by a kart on a drift or a turbo (and I'm not on one): it takes one of my balloons
      if (c.invT <= 0 && c.balloons > 0 && c.boostT <= 0 && !c.out) for (const g of karts) {
        if (g === c || g.out || g.balloons <= 0 || !(g.boostT > 0 || g.drift)) continue;
        if ((g.x - c.x) ** 2 + (g.z - c.z) ** 2 < .1 ** 2 && Math.abs(g.y - c.y) < .08) { steal(g, c); break; }
      }
    }
    for (const s of shots) {
      if ((s.w !== 'g' && s.w !== 'r') || !mine(byKey(s.o))) continue;
      for (const o of shots) {
        if (o === s || (o.o === s.o && o.age < .6 && s.age < .6)) continue;
        if ((o.x - s.x) ** 2 + (o.z - s.z) ** 2 < .05 ** 2 && Math.abs(o.y - s.y) < .06) { const l = [s.id, o.id]; kill(s.id); kill(o.id); send({ t: 'x', l }); return; }
      }
    }
  }
  function bombHit(g, c) {
    g.bombCd = 4;
    burst(g.x, g.y + .06, g.z, 26, 0xff8a2a, .9, .012, 2); burst(g.x, g.y + .06, g.z, 12, 0x3a3a3a, .5, .014, 1);
    if (me && Math.hypot(me.x - g.x, me.z - g.z) < 3) chip.noise(.5, { vol: .45, f: 900 });
    if (c) { if (mine(c)) spinOnly(c); else c.spinT = 1; if (g === me) ui.toast(`boum : ${c.name} !`, false, 900); }
  }

  // ---------- driving ----------
  const IDLE = { thr: 0, steer: 0, hop: false, use: false, back: false };
  function stepKart(c, inp, dt) {
    if (c.spinT > 0) { c.spinT -= dt; inp = IDLE; }
    c.invT -= dt; c.boostT -= dt; c.fireCd -= dt; c.bumpT -= dt;
    if (c.rollT > 0) { c.rollT -= dt; if (c === me) { if (Math.floor(c.rollT * 12) !== Math.floor((c.rollT + dt) * 12)) chip.tone(1100, 1100, .02, { type: .25, vol: .12 }); if (c.rollT <= 0) chip.tone(660, 1320, .08, { type: .5, vol: .2 }); } }
    const top = (c.out ? 1.12 : 1.05) * (c.bot ? c.skill : 1), sp = Math.abs(c.speed);
    if (!c.air) {
      if (c.boostT > 0) c.speed += (1.6 - c.speed) * Math.min(1, dt * 8);
      else if (inp.thr > 0) c.speed += (top - c.speed) * 1.8 * inp.thr * dt;
      else if (inp.thr < 0) c.speed = Math.max(-.45, c.speed - (c.speed > 0 ? 3 : 1.4) * dt);
      else c.speed -= c.speed * 1.5 * dt;
      if (c.speed > top && c.boostT <= 0) c.speed -= (c.speed - top) * 2 * dt;
    }
    // hop on shift; land still holding it while steering: a drift, which charges a mini turbo
    if (inp.hop && !c.hopWas && !c.air && sp > .15) { c.air = true; c.vy = .5; if (c === me) chip.tone(420, 760, .06, { type: .25, vol: .14 }); }
    c.hopWas = inp.hop;
    if (c.drift && (!inp.hop || c.speed < .3)) {
      if (c.driftCh > 1.3) { c.boostT = .8; if (c === me) chip.tone(300, 1300, .2, { type: .125, vol: .2 }); }
      else if (c.driftCh > .7) { c.boostT = .45; if (c === me) chip.tone(300, 900, .15, { type: .125, vol: .18 }); }
      c.drift = 0;
    }
    const grip = clamp(sp / .25, 0, 1) * Math.sign(c.speed || 1);
    const turn = c.drift ? c.drift * (1.9 + 1.1 * inp.steer * c.drift) : inp.steer * 2.5;
    c.yaw += turn * grip * dt * (c.air ? .5 : 1);
    if (c.drift) c.driftCh += dt * (1 + .6 * Math.abs(inp.steer));
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * 8);
    // the velocity follows the nose: slowly in a drift, hardly when spinning
    const tx = Math.sin(c.yaw) * c.speed, tz = Math.cos(c.yaw) * c.speed;
    const k = c.air ? 0 : Math.min(1, (c.spinT > 0 ? 1.2 : c.drift ? 4 : 10) * dt);
    c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
    const nx = c.x + c.vx * dt;
    if (blocked(nx, c.z, c.y)) { bump(c, Math.abs(c.vx)); c.vx *= -.35; } else c.x = nx;
    const nz = c.z + c.vz * dt;
    if (blocked(c.x, nz, c.y)) { bump(c, Math.abs(c.vz)); c.vz *= -.35; } else c.z = nz;
    // up and down: stick to slopes, fall off edges
    const s = support(c.x, c.z, c.y);
    if (c.air) {
      c.vy -= GRAV * dt; c.y += c.vy * dt;
      if (c.y <= s) {
        c.y = s; c.air = false;
        if (c.vy < -.8 && c === me) { shake = Math.max(shake, .08); audio.bonk(); }
        c.vy = 0;
        if (inp.hop && Math.abs(inp.steer) > .3 && c.speed > .4 && !c.out) { c.drift = Math.sign(inp.steer); c.driftCh = 0; }
      }
    } else if (c.y - s > .014) { c.air = true; c.vy = 0; }
    else c.y = s;
  }
  function bump(c, vn) {
    c.speed *= 1 - Math.min(.6, vn * .7);
    if (vn > .5 && c.bumpT <= 0) { c.bumpT = .3; burst(c.x, c.y + .03, c.z, 5, 0xe8e0d0, .3, .005, 1); if (c === me) { audio.bonk(); shake = Math.max(shake, Math.min(.12, vn * .08)); } }
  }
  function collide(dt) {
    for (let a = 0; a < karts.length; a++) for (let b = a + 1; b < karts.length; b++) {
      const p = karts[a], q = karts[b];
      if (p.out || q.out) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > R * 2 || d < 1e-4 || Math.abs(p.y - q.y) > .06) continue;
      // against a kart someone else drives (a replay a little late): eased apart, never a jolt backwards
      const nx = dx / d, nz = dz / d, push = mine(p) && mine(q) ? (R * 2 - d) / 2 : Math.min(R * 2 - d, dt * .5);
      if (mine(p) && !blocked(p.x - nx * push, p.z - nz * push, p.y)) { p.x -= nx * push; p.z -= nz * push; p.speed *= .9; }
      if (mine(q) && !blocked(q.x + nx * push, q.z + nz * push, q.y)) { q.x += nx * push; q.z += nz * push; q.speed *= .9; }
      if ((p === me || q === me) && Math.random() < .1) audio.bonk();
    }
  }
  function pickups(c) {
    if (c.out) return;
    boxes.forEach((b, i) => {
      if (!b.on || (b.x - c.x) ** 2 + (b.z - c.z) ** 2 > .075 ** 2 || Math.abs(b.gy - c.y) > .1) return;
      b.on = false; b.offT = BOX_BACK; b.grow = 0;
      burst(b.x, b.gy + .07, b.z, 12, 0xffffff, .5, .006, 1.8);
      send({ t: 'pk', i });
      if (!c.item && c.rollT <= 0) { c.item = pickItem(c); c.rollT = 1.1; c.ai.hold = 0; }
      if (c === me) chip.seq([72, 76, 79], .04, { type: .25, vol: .2 });
    });
  }

  // ---------- the bots (the host drives them) ----------
  function nearestFoe(c) {
    let best = null, bd = Infinity;
    for (const o of karts) {
      if (o === c || o.out || (c.out && o.invT > 0)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z) + Math.abs(o.y - c.y) * 5 + (o.bot ? .4 : 0);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function botThink(c) {
    const a = c.ai;
    let tx, ty, tz;
    a.tk = null;
    if (!c.out && !c.item && c.rollT <= 0) {
      let bd = Infinity;
      for (const b of boxes) { if (!b.on) continue; const d = Math.hypot(b.x - c.x, b.z - c.z) + Math.abs(b.gy - c.y) * 6; if (d < bd) { bd = d; tx = b.x; ty = b.gy; tz = b.z; } }
    }
    if (tx === undefined) { const f = nearestFoe(c); if (f) { a.tk = f; tx = f.x; ty = f.y; tz = f.z; } }
    if (tx === undefined) { tx = 0; ty = 0; tz = 0; }
    a.dist = Math.hypot(tx - c.x, tz - c.z);
    // straight there if nothing is in the way, else along the graph
    const y = drive(c.x, c.y, c.z, tx, tz);
    if (y >= 0 && Math.abs(y - ty) < .04) { a.ax = tx; a.az = tz; return; }
    const s = nearestNode(c.x, c.y, c.z), g = nearestNode(tx, ty, tz), p = s >= 0 && g >= 0 ? route(s, g) : null;
    if (!p || p.length < 2) { a.ax = tx; a.az = tz; return; }
    let pick = p[1];
    for (let k = Math.min(3, p.length - 1); k >= 1; k--) { const n = nodes[p[k]], yy = drive(c.x, c.y, c.z, n.x, n.z); if (yy >= 0 && Math.abs(yy - n.y) < .04) { pick = p[k]; break; } }
    a.ax = nodes[pick].x; a.az = nodes[pick].z;
  }
  function botInput(c, dt) {
    const a = c.ai, inp = c.inp;
    inp.thr = 0; inp.steer = 0; inp.hop = false; inp.use = false; inp.back = false;
    if (state !== 'play') return inp;
    a.think -= dt;
    if (a.think <= 0) { a.think = .2 + Math.random() * .1; botThink(c); }
    if (a.backT > 0) { a.backT -= dt; inp.thr = -1; inp.steer = a.backS; return inp; }
    const dyaw = wrap(Math.atan2(a.ax - c.x, a.az - c.z) - c.yaw);
    inp.steer = clamp(dyaw * 2.2, -1, 1); inp.thr = Math.abs(dyaw) > 1.4 ? .35 : 1;
    if (Math.abs(c.speed) < .08 && c.spinT <= 0) { a.stuck += dt; if (a.stuck > .7) { a.stuck = 0; a.backT = .6; a.backS = -Math.sign(dyaw || 1); } } else a.stuck = 0;
    if (c.item && c.rollT <= 0) {
      a.hold += dt;
      const it = c.item, t = a.tk;
      let go = false;
      if (it === 'm') go = a.dist > .8 && Math.abs(dyaw) < .25;
      else if (it === 'g') go = !!t && Math.abs(t.y - c.y) < .05 && a.dist < 2 && Math.abs(wrap(Math.atan2(t.x - c.x, t.z - c.z) - c.yaw)) < .12;
      else if (it === 'r') go = !!foeAhead(c, .7, 3) || a.hold > 7;
      else go = !!foeAhead(c, .9, .8, true) || a.hold > 5;
      if (go && Math.random() < .5) useItem(c, false);
    }
    return inp;
  }

  // ---------- network ----------
  const pack = (c) => [r3(c.x), r3(c.y), r3(c.z), r3(c.yaw), r3(c.vx), r3(c.vz), c.balloons,
    (c.air ? 1 : 0) | (c.drift ? 2 : 0) | (c.drift < 0 ? 4 : 0) | (c.boostT > 0 ? 8 : 0) | (c.out ? 16 : 0) | (c.spinT > 0 ? 32 : 0) | (c.invT > 0 ? 64 : 0), Math.round(c.outAt * 100) / 100, r3(c.steer)];
  // the others' karts: replayed ~100 ms late from their stamped states; a .6 m jump is a respawn
  function unpack(c, a, ts, src) {
    if (!a) return;
    const [x, y, z, yaw, vx, vz, b, fl, oa, steer] = a;
    c.trk ??= netTrack({ angles: [3], cut: (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]) > .6 });
    if (!c.trk.push(ts ?? netNow(), [x, y, z, yaw, vx, vz], src)) return;   // older than what we have
    c.net = { x, y, z, yaw, vx, vz, t: 0 }; c.seen = clock; c.steer = steer || 0;
    setBalloons(c, b);
    if (fl & 16) goOut(c, oa);
    c.air = !!(fl & 1); c.drift = fl & 2 ? (fl & 4 ? -1 : 1) : 0; c.boostT = fl & 8 ? .15 : 0;
    c.spinT = fl & 32 ? Math.max(c.spinT, .15) : 0; c.invT = fl & 64 ? .15 : 0;
  }
  function follow(c, dt) {
    const n = c.net; if (!n) return;
    n.t += dt;
    [c.x, c.y, c.z, c.yaw, c.vx, c.vz] = c.trk.sample(c.smp ??= []);
    c.speed = c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);
    c.spinT -= dt; c.invT -= dt; c.boostT -= dt;
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') { const c = byKey(pid); if (c && !mine(c)) unpack(c, fx.c, fx.ts, pid); }
    else if (fx.t === 'b') { if (!isHost) for (const [k, a] of fx.l) { const c = byKey(k); if (c) unpack(c, a, fx.ts, pid); } }
    else if (fx.t === 'w') spawn(fx);
    else if (fx.t === 'x') for (const id of fx.l) kill(id);
    else if (fx.t === 'h') {
      kill(fx.id);
      const c = byKey(fx.k); if (!c || mine(c)) return;
      credit(fx.by, c); setBalloons(c, fx.b); c.spinT = 1;
      if (fx.b <= 0) goOut(c, fx.oa);
    }
    else if (fx.t === 'st') {
      const g = byKey(fx.g), c = byKey(fx.k); if (!g || !c || mine(c)) return;
      setBalloons(c, fx.b); c.spinT = .8;
      if (fx.b <= 0) goOut(c, fx.oa);
      if (mine(g)) g.balloons = Math.min(LIVES, g.balloons + 1); else g.balloons = fx.gb;
      credit(fx.g, c); stolen(g, c);
    }
    else if (fx.t === 'bb') { const g = byKey(fx.g), c = byKey(fx.k); if (g) bombHit(g, c && !mine(c) ? c : null); }
    else if (fx.t === 'pk') { const b = boxes[fx.i]; if (b && b.on) { b.on = false; b.offT = BOX_BACK; b.grow = 0; burst(b.x, b.gy + .07, b.z, 10, 0xffffff, .5, .006, 1.8); } }
    else if (fx.t === 'bo') { const b = boxes[fx.i]; if (b) b.on = true; }
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c) { dyn.remove(c.kart, c.bomb); if (c.tag) dyn.remove(c.tag); karts.splice(karts.indexOf(c), 1); }
    if (id === hostId) {
      hostId = hostOf(karts.filter(q => !q.bot).map(q => ({ id: q.key })), hostId) ?? meId; isHost = hostId === meId;
      if (isHost) for (const b of karts) if (b.bot && b.net) { b.x = b.net.x; b.z = b.net.z; b.y = b.net.y; b.yaw = b.net.yaw; b.vx = b.net.vx; b.vz = b.net.vz; b.vy = 0; b.air = false; b.speed = Math.hypot(b.vx, b.vz); b.spinT = 0; b.invT = 0; }
    }
  }

  // ---------- the frame ----------
  const rank = () => [...karts].sort((a, b) => (a.out - b.out) || (a.out ? b.outAt - a.outAt : b.balloons - a.balloons) || (b.hits - a.hits));
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    chip.init();
    if (state === 'count') {
      const before = Math.ceil(count);
      count -= dt;
      if (Math.ceil(count) !== before && count > 0) audio.tick();
      if (count <= 0) { state = 'play'; goAt = clock; audio.buy(); chip.seq([67, 72, 76, 79, null, 76, 79], .07, { type: .25, vol: .18 }); }
    }
    const playing = state === 'play';
    // my input, edge-triggered for the item
    const mi = me ? me.inp : null;
    if (me) {
      mi.thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      mi.steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      mi.hop = keys.has('ShiftLeft') || keys.has('ShiftRight');
      mi.back = keys.has('KeyS') || keys.has('ArrowDown');
      const use = keys.has('Space');
      if (use && !keysWas.use) mi.use = playing; keysWas.use = use;
    }
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      for (const c of karts) {
        if (!mine(c)) continue;
        let inp = IDLE;
        if (playing) {
          if (c === me && !auto) { inp = mi; if (mi.use) { useItem(c, mi.back); mi.use = false; } }
          else inp = botInput(c, DT);
        }
        stepKart(c, inp, DT);
        if (playing) pickups(c);
      }
      collide(DT);
      stepShots(DT);
      if (playing) checkHits();
    }
    for (const c of karts) { if (!mine(c)) follow(c, dt); c.bombCd -= dt; }
    // the boxes come back, the host says when
    for (const [i, b] of boxes.entries()) {
      if (!b.on) { b.offT -= dt; if ((isHost && b.offT <= 0) || b.offT < -3) { b.on = true; if (isHost) send({ t: 'bo', i }); } }
      b.grow += ((b.on ? 1 : 0) - b.grow) * Math.min(1, dt * 6);
    }
    drawBoxes(clock);
    draw(dt);
    stepParts(dt);
    if (me) motorTick(me.speed, state !== 'off');
    // drop the humans that never came
    if (playing && clock - goAt > 9) for (const c of [...karts]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      const ts = netStamp();
      if (me) send({ t: 's', ts, c: pack(me) });
      if (isHost) { const l = karts.filter(c => c.bot).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', ts, l }); }
    }
    if (playing && me) {
      const alive = karts.filter(c => !c.out);
      if (alive.length <= 1 || !alive.some(c => !c.bot) || clock - goAt >= ROUND) finish();
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; onEnd(result); } }
    drawItem();
    cam(dt);
  }

  // ---------- drawing ----------
  function draw(dt) {
    let bi = 0, si = 0;
    for (const c of karts) {
      // the body: spinning when hit, angled into a drift, following the slope
      if (c.spinT > 0) c.spinVis += dt * 16;
      else { const t = Math.round(c.spinVis / TAU) * TAU; c.spinVis += (t - c.spinVis) * Math.min(1, dt * 10); if (Math.abs(t - c.spinVis) < .01) c.spinVis = 0; }
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const ah = support(c.x + fx * .05, c.z + fz * .05, c.y + .02), bh = support(c.x - fx * .05, c.z - fz * .05, c.y + .02);
      c.pitch += ((c.air ? -.15 : -Math.atan2(ah - bh, .1)) - c.pitch) * Math.min(1, dt * 10);
      c.roll += (-c.steer * .12 * clamp(Math.abs(c.speed), 0, 1) - c.drift * .1 - c.roll) * Math.min(1, dt * 8);
      const body = c.out ? c.bomb : c.kart;
      c.kart.visible = !c.out && !(c.invT > 0 && c.spinT <= 0 && Math.floor(clock * 14) % 2);
      c.bomb.visible = c.out; c.bomb.material.opacity = c.bombCd > 0 ? .35 : .8;
      body.position.set(c.x, c.y, c.z);
      body.rotation.set(c.pitch, c.yaw + c.spinVis + c.drift * .35, c.roll, 'YXZ');
      if (c.tag) { c.tag.position.set(c.x, c.y + .32, c.z); const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0; c.tag.visible = d > .35 && d < 4; }
      // the soft shadow on whatever is below
      const gy = support(c.x, c.z, c.y + .01);
      dm.position.set(c.x, gy + .003, c.z); dm.rotation.set(0, c.yaw, 0); dm.scale.setScalar(clamp(1 - (c.y - gy) * 3, .3, 1)); dm.updateMatrix(); shMesh.setMatrixAt(si++, dm.matrix);
      // balloons on their strings, lagging a little behind
      if (!c.out) for (let k = 0; k < c.balloons; k++) {
        const p = c.bp[k];
        balloonTarget(c, k, _v); _v.y += Math.sin(clock * 3 + k * 2 + c.slot) * .006;
        // a balloon that just appeared (a steal) starts on its string, not where the last one popped
        if (k >= (c.bShown || 0)) p.copy(_v);
        p.lerp(_v, Math.min(1, dt * 9));
        dm.position.copy(p); dm.rotation.set(0, 0, (p.x - _v.x) * 8); dm.scale.setScalar(.022); dm.updateMatrix();
        bMesh.setMatrixAt(bi, dm.matrix); bMesh.setColorAt(bi, tc.setHex(c.color));
        const a = c.yaw + c.spinVis, n = bi * 6;
        sPos[n] = c.x - Math.sin(a) * .05; sPos[n + 1] = c.y + .09; sPos[n + 2] = c.z - Math.cos(a) * .05;
        sPos[n + 3] = p.x; sPos[n + 4] = p.y - .025; sPos[n + 5] = p.z;
        bi++;
      }
      c.bShown = c.out ? 0 : c.balloons;
      // sparks from a drift, flames from a boost, a fizzing fuse
      if (c.drift && !c.air && Math.random() < .6) {
        const col = c.driftCh > 1.3 ? 0xff7a1a : c.driftCh > .7 ? 0x4ab8ff : 0xfff0c0;
        for (const s of [-1, 1]) emit(c.x - fx * .05 + fz * s * .035, c.y + .01, c.z - fz * .05 - fx * s * .035, (Math.random() - .5) * .3 - fx * .2, .3 + Math.random() * .3, (Math.random() - .5) * .3 - fz * .2, .004, .25, col, 2.2, 3);
      }
      if (c.boostT > 0) emit(c.x - fx * .07, c.y + .035, c.z - fz * .07, -fx * .3, .05, -fz * .3, .01, .25, Math.random() < .5 ? 0xff9a2a : 0xffe04a, 2.4, -.5);
      if (c.out && c.bombCd <= 0 && Math.random() < .3) emit(c.x, c.y + .115, c.z, (Math.random() - .5) * .1, .2, (Math.random() - .5) * .1, .004, .3, 0xffc040, 2.5, 1);
    }
    bMesh.count = bi; bMesh.instanceMatrix.needsUpdate = true; if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    sGeo.attributes.position.needsUpdate = true; sGeo.setDrawRange(0, bi * 2);
    shMesh.count = si; shMesh.instanceMatrix.needsUpdate = true;
    const n = { g: 0, r: 0, b: 0, f: 0 };
    for (const s of shots) {
      const m = shotMesh[s.w]; if (n[s.w] >= 24) continue;
      s.spin += dt * (s.w === 'g' || s.w === 'r' ? 14 : s.w === 'f' ? 1.4 : 0);
      dm.position.set(s.x, s.y + (s.w === 'f' ? .04 : 0), s.z); dm.rotation.set(s.w === 'f' ? .45 : 0, s.spin, 0); dm.scale.setScalar(1); dm.updateMatrix();
      m.setMatrixAt(n[s.w]++, dm.matrix);
    }
    for (const k in shotMesh) { shotMesh[k].count = n[k]; shotMesh[k].instanceMatrix.needsUpdate = true; }
  }
  function drawItem() {
    if (!itemEl || !me) return;
    const k = me.out ? 'out' : me.rollT > 0 ? 'q' + Math.floor(me.rollT * 12) % 5 : me.item || '';
    if (k === itemShown) return;
    itemShown = k;
    const src = k.startsWith('q') ? ICONS['gbmrf'[+k[1]]] : ICONS[k];
    itemEl.style.opacity = k.startsWith('q') ? '.75' : '1';
    itemEl.innerHTML = src ? `<img src="${src}" width="60" height="60">` : '';
  }

  // ---------- the camera: low behind the kart, never inside a wall ----------
  const eye = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3(), hi = new THREE.Vector3();
  function cam(dt) {
    if (!me) return;
    if (state === 'count' || me.spinT <= 0) camYaw += wrap(me.yaw + me.drift * .25 - camYaw) * Math.min(1, dt * (state === 'count' ? 20 : 4));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const hx = me.x, hy = me.y + .07, hz = me.z;
    const back = .48, up = .16;
    want.set(hx - fx * back, hy + up, hz - fz * back);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = hx + (want.x - hx) * t, y = hy + (want.y - hy) * t, z = hz + (want.z - hz) * t;
      if (solidAt(x, z, y)) { const k = (i - 1) / 12; want.set(hx + (want.x - hx) * k, hy + (want.y - hy) * k, hz + (want.z - hz) * k); break; }
    }
    const d = Math.hypot(want.x - hx, want.z - hz);
    if (d < .25) want.y += (.25 - d) * 1.2;
    if (state === 'count') {
      // a swoop down from above the arena
      const k = 1 - Math.pow(Math.max(0, count - .6) / 2.4, 2);
      hi.set(me.x * 1.4, 2.4, me.z * 1.4 - .01);
      eye.lerpVectors(hi, want, clamp(k, 0, 1));
    } else eye.lerp(want, Math.min(1, dt * 12));
    camera.position.copy(eye).add(O);
    if (shake > 0) { shake = Math.max(0, shake - dt * .8); camera.position.x += (Math.random() - .5) * shake * .05; camera.position.y += (Math.random() - .5) * shake * .05; }
    look.set(me.x + fx * .35, me.y + .05, me.z + fz * .35).add(O);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const fov = 68 + Math.min(10, Math.abs(me.speed) * 6);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  const dots = (c) => c.out ? 'bombe' : '●'.repeat(c.balloons) + '○'.repeat(LIVES - c.balloons);
  const boardHtml = () => rank().map((c, i) => `<span style="color:${hexOf(c.color)}">${i + 1}. ${c.name} ${dots(c)} · ${c.hits}</span>`).join('');
  function finish() {
    state = 'end';
    const o = rank(), place = o.indexOf(me) + 1, of = o.length, h = me.hits;
    const text = `${ord(place)} place · ${h} ballon${h > 1 ? 's' : ''} crevé${h > 1 ? 's' : ''}`;
    result = { place, of, value: h, time: clock - goAt, text };
    finalBoard = boardHtml();
    if (place === 1) { audio.win(); ui.toast('victoire !', false, 2000); } else { audio.full(); ui.toast(`${ord(place)} place`, false, 2000); }
    endT = 3;
  }

  return {
    modes: MODES,
    keys: [['z q s d', 'piloter'], ['shift', 'saut · tenir en virage : dérapage turbo'], ['dérapage / turbo', 'fonce sur un kart : vole-lui un ballon'], ['espace', 'utiliser l\'objet'], ['s + espace', 'lancer vers l\'arrière'], ['r', 'revenir à ton fort']],
    start, update, stop, onFx, peerLeft,
    respawn() { if (state === 'play' && me && respawnCd <= clock && me.spinT <= 0) { respawnCd = clock + 3; placeAt(me, me.slot); camYaw = me.yaw; } },
    hud() {
      if (state === 'count') return { count: Math.max(1, Math.ceil(count)) };
      if (!me || state === 'off') return { hidden: true };
      if (state === 'play' && clock - goAt < .8) return { count: 0 };
      if (state === 'end') return { html: `<b>résultats</b><span class="big">${result.text}</span><div class="board">${finalBoard}</div>` };
      const left = Math.max(0, ROUND - (clock - goAt));
      const big = me.out ? '<span class="big">bombe !</span>' : `<span class="big" style="color:${hexOf(me.color)}">${dots(me)}</span>`;
      const it = me.item && me.rollT <= 0 ? ` · <em>${ITEMS[me.item]}</em>` : '';
      return { html: `<b>bataille 64</b>${big}<span>${fmt(left).slice(0, -2)} · crevés ${me.hits}${it}</span><div class="board">${boardHtml()}</div>` };
    },
    preview() { const c = me || karts[0]; return c ? { x: O.x + c.x, y: O.y + c.y + .04, z: O.z + c.z, yaw: c.yaw, rad: .45, h: .16 } : { x: O.x, y: O.y, z: O.z, yaw: 0, rad: 3, h: 2 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get me() { return me; }, get karts() { return karts; }, get shots() { return shots; }, get boxes() { return boxes; }, get nodes() { return nodes; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _tp(x, z, yaw = null) { if (!me) return; me.x = x; me.z = z; me.y = support(x, z, 2); if (yaw != null) me.yaw = yaw; },
  };
}
