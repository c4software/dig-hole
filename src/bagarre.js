// bagarre.js, bagarre 64: a platform fighter in the spirit of the N64 brawler, on a floating
// island above a sea of clouds. Four chunky toy fighters (a mole miner, a robot, a frog knight,
// a fox pilot), each painted in its player's colour, fight in a vertical plane: every hit raises
// your percentage, and the higher it is the farther the next hit throws you. Thrown past the
// blast zones you lose a life and come back on a halo. The host runs the fight from everyone's
// inputs and broadcasts it; each client predicts its own fighter and replays its unacknowledged
// inputs over the host's word. Two modes: three lives, last one standing, or two minutes of
// ejections.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { paintTex } from './vehicles.js';
import { rng, hostOf, createChip, hexOf, ord } from './retro.js';

const STEP = 1 / 60, SC = .19, SEATS = 4, STOCKS = 3;
// the arena, in metres from the plinth's top: the island's lawn, its edges, the blast zones
const Y0 = 1.4, EDGE = 1.15, BX = 3.05, BTOP = 3.9, BBOT = .3;
const G = 7.5, FALL = 2.3, FFALL = 3.6, DEC = 3.2, HW = .05, SQ = .05;
const SURF = [{ x0: -EDGE, x1: EDGE, y: Y0 }, { x0: -.92, x1: -.34, y: Y0 + .45, pass: 1 }, { x0: .34, x1: .92, y: Y0 + .45, pass: 1 }, { x0: -.3, x1: .3, y: Y0 + .9, pass: 1 }];
const SPAWN = [-.75, .75, -.28, .28];
// held bits, pressed bits (a press is counted, so a quick tap is never lost on the network)
const H_L = 1, H_R = 2, H_U = 4, H_D = 8, H_S = 16, H_J = 32;
const P_J = 1, P_A = 2, P_B = 4, P_D = 8;
const MODES = [
  { id: 'vies', name: '3 vies', sub: 'quatre combattants sur l\'île volante · le dernier debout gagne', help: '3 vies · j : attaque (+ direction) · k : spécial · z + k : remontée · shift : bouclier · éjecte-les hors de l\'arène', unit: 'frags', lower: false },
  { id: 'chrono', name: 'chrono', sub: '2 minutes · chaque éjection +1, chaque chute −1', help: '2 min · j : attaque (+ direction) · k : spécial · z + k : remontée · shift : bouclier', unit: 'score', lower: false },
];
// run, air speed, jump, recovery, weight, power, gravity, air jumps, special
const CH = [
  { id: 'taupe', run: .95, air: .8, jump: 2.72, rec: 3.5, w: 1.2, pow: 1.1, grav: 1.05, jumps: 1, spec: 'dash' },
  { id: 'robot', run: .9, air: .82, jump: 2.7, rec: 3.6, w: 1.12, pow: 1.02, grav: 1, jumps: 1, spec: 'shot', shot: 0 },
  { id: 'grenouille', run: 1.05, air: .95, jump: 2.95, rec: 3.3, w: .9, pow: .95, grav: .95, jumps: 2, spec: 'dash' },
  { id: 'renard', run: 1.3, air: .95, jump: 2.85, rec: 3.7, w: .92, pow: .95, grav: 1.1, jumps: 1, spec: 'shot', shot: 1 },
];
// d: duration, a: active window, then damage, base and growing knockback, angle, hitbox
const MOVES = {
  jab: { d: .26, a: [.05, .12], dmg: 4, b: 1.2, g: 1, ang: 35, hx: .11, hy: .1, r: .07 },
  side: { d: .5, a: [.14, .22], dmg: 12, b: 1.7, g: 3.3, ang: 38, hx: .14, hy: .09, r: .085 },
  up: { d: .4, a: [.08, .18], dmg: 9, b: 1.8, g: 3.6, ang: 88, hx: .02, hy: .25, r: .09 },
  down: { d: .38, a: [.07, .16], dmg: 8, b: 1.3, g: 2.4, ang: 22, hx: .12, hy: .03, r: .075, both: 1 },
  nair: { d: .38, a: [.05, .24], dmg: 7, b: 1.2, g: 2, ang: 45, hx: 0, hy: .1, r: .12, air: 1 },
  fair: { d: .42, a: [.1, .18], dmg: 11, b: 1.5, g: 3, ang: 40, hx: .13, hy: .09, r: .085, air: 1 },
  uair: { d: .36, a: [.07, .16], dmg: 8, b: 1.7, g: 3.4, ang: 85, hx: 0, hy: .24, r: .09, air: 1 },
  dair: { d: .46, a: [.13, .22], dmg: 10, b: 1.4, g: 2.3, ang: -75, hx: 0, hy: -.02, r: .085, air: 1 },
  dash: { d: .5, a: [.04, .28], dmg: 9, b: 1.5, g: 2.4, ang: 32, hx: .1, hy: .09, r: .09 },
  upb: { d: .45, a: [.02, .28], dmg: 6, b: 1.4, g: 1.8, ang: 75, hx: 0, hy: .12, r: .1 },
  shot: { d: .4, fire: .12 },
  climb: { d: .25 },
};
const ACTS = ['', 'jab', 'side', 'up', 'down', 'nair', 'fair', 'uair', 'dair', 'dash', 'upb', 'shot', 'climb'];
const SHOTS = [{ dmg: 7, b: 1.1, g: 1.1, ang: 30, r: .05, v: 1.5, life: 1.5 }, { dmg: 3, b: .6, g: .3, ang: 12, r: .035, v: 3.4, life: .75 }];
const BOTS = [['bouba', 0xe8384f], ['zigo', 0x3a8ef0], ['titan', 0xf2c230], ['mimi', 0x45c060], ['kiki', 0xb05ae0], ['nono', 0xf08a2a]];
const PI = Math.PI, TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
const r3 = (v) => Math.round(v * 1000) / 1000;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const wallW = (y) => y >= Y0 - .28 ? EDGE : y >= Y0 - .8 ? .42 + (EDGE - .42) * (y - (Y0 - .8)) / .52 : .42;

// ---------- the low-poly kit: flat-shaded colours, rocks jittered the same on shared vertices ----------
const mats = new Map();
const M = (c, e = 0) => { const k = c + '/' + e; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true })); return mats.get(k); };
const glow = (c, k = 2) => { const key = 'g' + c + k; if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); return mats.get(key); };
function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  const h = (x, y, z, k) => { const s = Math.sin(x * 12.99 + y * 78.23 + z * 37.72 + seed * 5.1 + k * 1.7) * 43758.55; return s - Math.floor(s) - .5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + h(x, y, z, 1) * amt, y + h(x, y, z, 2) * amt, z + h(x, y, z, 3) * amt);
  }
  geo.computeVertexNormals();
  return geo;
}
function put(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz);
  parent.add(o);
  return o;
}
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);

// ---------- the fighters: built about a metre tall, feet at 0, facing +z, shrunk to toy size ----------
function fighterModel(ch, color) {
  const pc = new THREE.Color(color), dark = pc.clone().lerp(new THREE.Color(0x101018), .4).getHex(), lite = pc.clone().lerp(new THREE.Color(0xffffff), .35).getHex();
  const P = M(color), PD = M(dark), PL = M(lite);
  const g = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group();
  body.position.y = .36; g.add(body); body.add(torso); head.position.y = .44; torso.add(head);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * .25, .32, 0); torso.add(a); arms.push(a);
    const l = new THREE.Group(); l.position.set(s * .1, 0, 0); body.add(l); legs.push(l);
  }
  const white = M(0xf6f2ea), black = M(0x16141c);
  let tail = null;
  if (ch === 0) {
    // the mole miner: overalls in the player's colour, a helmet lamp, big pale claws
    const fur = M(0x6b5344), pink = M(0xf0a0a8);
    put(torso, ico(.27), P, 0, .18, 0, 0, 0, 0, 1.05, 1.08, .92);
    put(torso, box(.07, .3, .05), PD, -.12, .3, .2, -.2); put(torso, box(.07, .3, .05), PD, .12, .3, .2, -.2);
    put(torso, ico(.12, 0), fur, 0, .38, .1);
    put(head, ico(.24), fur, 0, .1, 0, 0, 0, 0, 1, .95, 1);
    put(head, cone(.1, .24, 6), fur, 0, .06, .26, PI / 2);
    put(head, ico(.055, 0), pink, 0, .06, .39);
    put(head, box(.05, .03, .02), black, -.09, .15, .2); put(head, box(.05, .03, .02), black, .09, .15, .2);
    put(head, new THREE.SphereGeometry(.26, 8, 4, 0, TAU, 0, PI / 2), M(0xf2c230), 0, .14, -.02);
    put(head, box(.54, .03, .56), M(0xd8a820), 0, .15, -.02);
    put(head, cyl(.06, .07, .06, 8), M(0x3a3a44), 0, .3, .2, PI / 2 - .4);
    put(head, cyl(.05, .05, .02, 8), glow(0xffe890, 2.4), 0, .31, .235, PI / 2 - .4);
    for (const a of arms) {
      put(a, cyl(.075, .065, .26, 6), fur, 0, -.13, 0);
      put(a, ico(.085, 0), pink, 0, -.28, .02);
      for (const k of [-1, 0, 1]) put(a, cone(.022, .11, 4), white, k * .04, -.36, .03, PI);
    }
    for (const l of legs) { put(l, cyl(.08, .08, .26, 6), fur, 0, -.13, 0); put(l, box(.14, .07, .2), pink, 0, -.32, .04); }
  } else if (ch === 1) {
    // the robot: a painted chest, a glowing visor, an antenna
    const steel = M(0xa8b0ba), light = M(0xd0d6de);
    put(torso, box(.46, .4, .32), P, 0, .2, 0);
    put(torso, box(.3, .18, .04), PL, 0, .24, .17);
    put(torso, box(.08, .05, .03), glow(0xff5a3a), 0, .12, .18);
    put(torso, cyl(.06, .08, .08, 6), steel, 0, .44, 0);
    put(head, box(.36, .3, .3), light, 0, .15, 0);
    put(head, box(.3, .1, .04), glow(0x40e0ff, 2.2), 0, .17, .15);
    put(head, cyl(.012, .012, .18, 4), steel, .1, .38, 0);
    put(head, ico(.035, 0), glow(0xff4040, 2.4), .1, .48, 0);
    put(head, box(.06, .12, .12), steel, -.2, .14, 0); put(head, box(.06, .12, .12), steel, .2, .14, 0);
    for (const a of arms) { put(a, cyl(.05, .05, .24, 6), steel, 0, -.12, 0); put(a, box(.13, .12, .13), P, 0, -.3, 0); }
    for (const l of legs) { put(l, box(.12, .26, .13), steel, 0, -.13, 0); put(l, box(.16, .08, .22), PD, 0, -.3, .03); }
  } else if (ch === 2) {
    // the frog knight: armour and cape in the player's colour, eyes on top, a little sword
    const skin = M(0x58b848), skin2 = M(0x3e9434);
    put(torso, ico(.25), P, 0, .18, 0, 0, 0, 0, 1, 1.1, .9);
    put(torso, box(.4, .06, .3), M(0xe0b040), 0, .04, 0);
    put(torso, box(.42, .5, .03), PD, 0, .12, -.22, .18);
    put(head, ico(.25), skin, 0, .1, 0, 0, 0, 0, 1.2, .75, 1.05);
    for (const s of [-1, 1]) { put(head, ico(.085, 0), white, s * .12, .25, .08); put(head, ico(.04, 0), black, s * .12, .26, .15); }
    put(head, box(.3, .02, .03), M(0x8a2a2a), 0, .04, .25);
    put(head, cyl(.2, .22, .06, 7), P, 0, .19, -.04);
    for (let k = 0; k < 5; k++) put(head, cone(.03, .08, 4), M(0xe0b040), Math.sin(k / 5 * TAU) * .2, .25, Math.cos(k / 5 * TAU) * .2 - .04);
    for (const a of arms) { put(a, cyl(.055, .05, .24, 6), skin, 0, -.12, 0); put(a, ico(.06, 0), skin2, 0, -.27, 0); }
    const sw = arms[0];
    put(sw, box(.035, .5, .015), M(0xdfe4ec), 0, -.3, .3, PI / 2);
    put(sw, box(.16, .03, .04), M(0xe0b040), 0, -.29, .06, PI / 2);
    for (const l of legs) { put(l, cyl(.07, .08, .26, 6), skin, 0, -.13, 0); put(l, box(.16, .05, .24), skin2, 0, -.32, .05); }
  } else {
    // the fox pilot: a flying jacket, a scarf, goggles up on the forehead, a big tail
    const fur = M(0xf08a2a);
    put(torso, ico(.24), P, 0, .19, 0, 0, 0, 0, 1, 1.12, .9);
    put(torso, new THREE.TorusGeometry(.15, .05, 4, 8), white, 0, .4, 0, PI / 2);
    put(torso, box(.08, .22, .03), white, .1, .38, -.16, .3);
    put(head, ico(.22), fur, 0, .1, 0);
    put(head, cone(.1, .22, 5), white, 0, .04, .22, PI / 2);
    put(head, ico(.035, 0), black, 0, .04, .33);
    for (const s of [-1, 1]) { put(head, cone(.075, .2, 4), fur, s * .12, .33, -.02, 0, 0, -s * .25); put(head, box(.05, .03, .02), black, s * .08, .14, .19); }
    put(head, box(.34, .06, .06), M(0x3a3a44), 0, .22, .13);
    for (const s of [-1, 1]) put(head, cyl(.045, .045, .03, 8), M(0x6ac8ff), s * .08, .22, .17, PI / 2);
    tail = new THREE.Group(); tail.position.set(0, .02, -.18); body.add(tail);
    put(tail, cone(.1, .42, 5), fur, 0, .08, -.16, -2.1);
    put(tail, cone(.06, .12, 5), white, 0, .2, -.36, -2.1);
    for (const a of arms) { put(a, cyl(.055, .05, .24, 6), P, 0, -.12, 0); put(a, ico(.06, 0), white, 0, -.27, 0); }
    for (const l of legs) { put(l, cyl(.065, .07, .24, 6), M(0x3a3a48), 0, -.12, 0); put(l, box(.13, .08, .2), M(0x6a4228), 0, -.3, .03); }
  }
  // one mesh per material and per moving part
  for (const p of [body, torso, head, ...arms, ...legs, tail]) if (p) { p.userData.pivot = true; mergeStatic(p, (o) => o !== p && o.userData.pivot); }
  g.scale.setScalar(SC);
  return { g, body, torso, head, arms, legs, tail };
}

function tagTex(text, color) {
  return paintTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(30, h / 2, 10, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}

export function createBagarre({ scene, camera, audio, ui, at }) {
  const deco = new THREE.Group(); deco.position.copy(at); scene.add(deco);
  const play = new THREE.Group(); play.position.copy(at); play.visible = false; scene.add(play);

  // ---------- the diorama: an island on a rocky pillar, above a sea of clouds ----------
  {
    const rock = M(0xa08a74, 0x3a2c22), rock2 = M(0x8c7864, 0x30241c), grass = M(0x5cc84a), grass2 = M(0x4cb03c), stone = M(0xd8c49a), stone2 = M(0xc4ae84), stone3 = M(0xe6d6b0);
    // the lawn, mown in stripes
    const W = EDGE * 2 + .06;
    for (let k = 0; k < 10; k++) put(deco, box(W / 10, .05, .86), k % 2 ? grass : grass2, -W / 2 + W / 20 + k * W / 10, Y0 - .025, 0);
    put(deco, box(EDGE * 2, .24, .8), stone, 0, Y0 - .17, 0);
    // dressed stones on the faces, grass dripping over the rim
    for (const z of [-.41, .41]) {
      for (let k = 0; k < 12; k++) for (let r = 0; r < 2; r++) put(deco, box(.17, .085, .03), (k + r) % 2 ? stone2 : stone3, -EDGE + .1 + k * .19 + r * .09, Y0 - .11 - r * .1, z);
      for (let k = 0; k < 16; k++) put(deco, cone(.035, .07 + (k % 3) * .02, 4), grass2, -EDGE + .07 + k * .145, Y0 - .08, z * 1.05, PI);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) put(deco, box(.03, .085, .17), k % 2 ? stone2 : stone3, s * (EDGE + .01), Y0 - .11 - (k % 2) * .1, -.3 + k * .2);
    // the rocky underside and the pillar down to the plinth
    const under = jitter(new THREE.CylinderGeometry(1, .37, .52, 9, 2), .05, 2);
    put(deco, under, rock, 0, Y0 - .54, 0, 0, 0, 0, EDGE * 1.04, 1, .46);
    const pil = jitter(new THREE.CylinderGeometry(.42, .6, Y0 - .8, 7, 4), .07, 3);
    put(deco, pil, rock2, 0, (Y0 - .8) / 2, 0, 0, 0, 0, 1, 1, .78);
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; put(deco, jitter(cone(.1 + (k % 3) * .04, .3 + (k % 2) * .15, 5), .03, k), rock, Math.cos(a) * .75, Y0 - .62, Math.sin(a) * .28, PI); }
    // a garden at the back of the lawn, out of the fighters' way
    for (const [x, s] of [[-.95, 1], [.9, .8], [-.2, .6]]) {
      put(deco, cyl(.02 * s, .03 * s, .2 * s, 5), M(0x7a4a2a), x, Y0 + .1 * s, -.33);
      put(deco, ico(.12 * s, 0), M(0x2e8a3a), x, Y0 + .24 * s, -.33); put(deco, ico(.09 * s, 0), M(0x3aa048), x + .04, Y0 + .32 * s, -.31);
    }
    for (const x of [-.6, .45, 1.02]) put(deco, ico(.06, 0), M(0x3aa048), x, Y0 + .03, -.34);
    const fl = [M(0xff5a6a), M(0xffe050), M(0xf6f2ea), M(0xb07af0)];
    for (let k = 0; k < 22; k++) put(deco, ico(.014, 0), fl[k % 4], -EDGE + .05 + ((k * 0.618) % 1) * (EDGE * 2 - .1), Y0 + .012, (k % 2 ? -.37 : .37) + ((k * .37) % .06));
    // three floating slabs to jump through
    const plank = M(0xc48a50), plank2 = M(0xa8743e);
    for (let i = 1; i < 4; i++) {
      const s = SURF[i], w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
      for (let k = 0; k < 4; k++) put(deco, box(w / 4 - .004, .035, .42), k % 2 ? plank : plank2, s.x0 + w / 8 + k * w / 4, s.y - .018, 0);
      put(deco, box(w + .02, .02, .44), M(0x6a4a2a), cx, s.y - .045, 0);
      put(deco, jitter(cone(.2, .24, 6), .025, i + 9), rock, cx, s.y - .17, 0, PI, 0, 0, w / .42, 1, .9);
      put(deco, ico(.03, 0), glow(0x9af0ff, 1.6), cx, s.y - .3, 0);
    }
    // far away: mountains with snowy tops, a castle on its own floating rock, big clouds
    const mt = [M(0x6a6ab8), M(0x7a74c8), M(0x5c5ea8)];
    [[-2.4, -2.6, .75, 1.5], [-1.3, -2.8, .7, 1.9], [-.2, -2.85, .85, 1.4], [1.0, -2.75, .75, 1.7], [2.3, -2.55, .8, 1.3], [2.75, -1.5, .42, 1.0], [-2.75, -1.4, .42, .9]].forEach(([x, z, r, h], k) => {
      put(deco, jitter(new THREE.ConeGeometry(r, h, 6, 2), .06, k + 20), mt[k % 3], x, .2 + h / 2, z);
      put(deco, new THREE.ConeGeometry(r * .36, h * .36, 6), M(0xf4f6ff), x, .2 + h * .82 + .01, z);
    });
    {
      const cx = 1.85, cy = 2.1, cz = -2.1, wall = M(0xe8e0d0), roof = M(0xd84040), roof2 = M(0x3a6ad8);
      put(deco, jitter(cone(.5, .7, 7), .05, 31), rock, cx, cy - .4, cz, PI);
      put(deco, cyl(.5, .5, .06, 7), grass, cx, cy - .02, cz);
      put(deco, box(.56, .22, .36), wall, cx, cy + .11, cz);
      for (const [dx, dz] of [[-.28, -.18], [.28, -.18], [-.28, .18], [.28, .18]]) { put(deco, cyl(.07, .07, .36, 6), wall, cx + dx, cy + .18, cz + dz); put(deco, cone(.1, .16, 6), roof, cx + dx, cy + .44, cz + dz); }
      put(deco, cyl(.12, .12, .6, 6), wall, cx, cy + .3, cz); put(deco, cone(.17, .3, 6), roof2, cx, cy + .75, cz);
      put(deco, box(.1, .14, .02), M(0x4a3a30), cx, cy + .07, cz + .185);
      for (const dx of [-.14, .14]) put(deco, box(.04, .06, .02), M(0x2a2a40), cx + dx, cy + .15, cz + .185);
      put(deco, box(.1, .06, .005), glow(0xffd040, 1.4), cx + .05, cy + .92, cz);
      put(deco, cyl(.006, .006, .14, 4), M(0x3a3a44), cx, cy + .92, cz);
    }
    const cloud = M(0xf4f6ff), cloud2 = M(0xdfe4f6);
    for (const [x, y, z, s] of [[-2.3, 2.9, -2.0, .34], [-.6, 3.4, -2.6, .4], [1.0, 3.55, -2.6, .3], [2.6, 1.4, -1.8, .28], [-2.6, 1.7, -.7, .24], [2.7, 2.7, .6, .22]]) {
      put(deco, ico(s, 1), cloud, x, y, z, 0, 0, 0, 1.3, .8, 1);
      put(deco, ico(s * .75, 1), cloud, x - s, y - s * .2, z + .05, 0, 0, 0, 1.2, .8, 1);
      put(deco, ico(s * .7, 1), cloud2, x + s, y - s * .25, z - .05, 0, 0, 0, 1.2, .8, 1);
      put(deco, ico(s * .55, 1), cloud, x + s * .3, y + s * .45, z, 0, 0, 0, 1.2, .9, 1);
    }
    mergeStatic(deco);
    // the sea of clouds the losers fall into
    const N = 150, sea = new THREE.InstancedMesh(ico(1, 1), M(0xeef0ff), N), d = new THREE.Object3D(), r = rng(99);
    let k = 0;
    while (k < N) {
      const x = (r() - .5) * 5.9, z = (r() - .5) * 5.9;
      if (Math.abs(x) < .55 && Math.abs(z) < .45) continue;
      const s = .18 + r() * .22;
      d.position.set(x, .08 + r() * .2, z); d.scale.set(s * 1.4, s * .45, s * 1.1); d.rotation.y = r() * TAU; d.updateMatrix();
      sea.setMatrixAt(k++, d.matrix);
    }
    sea.receiveShadow = true; deco.add(sea);
    // the blast zones: dashed lines round the arena
    const pts = [[-BX, BBOT], [BX, BBOT], [BX, BBOT], [BX, BTOP], [BX, BTOP], [-BX, BTOP], [-BX, BTOP], [-BX, BBOT]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const bz = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xff6a4a, dashSize: .08, gapSize: .06, transparent: true, opacity: .45 }));
    bz.computeLineDistances(); deco.add(bz);
  }

  // ---------- only while playing: a painted sky behind the arena ----------
  {
    const tex = paintTex(1024, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2c5cc8'); gr.addColorStop(.5, '#79b4ee'); gr.addColorStop(.8, '#f8d8c0'); gr.addColorStop(1, '#fff2e0');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let k = 0; k < 26; k++) {
        const x = r() * w, y = 30 + r() * 140, s = 12 + r() * 30;
        g.fillStyle = `rgba(255,255,255,${.35 + r() * .4})`;
        for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(x + (j - 1.5) * s * .9, y + (j % 2) * s * .2, s, s * .5, 0, 0, TAU); g.fill(); }
      }
    });
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 4.2, 32, 1, true, PI / 2 + .08, PI - .16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    sky.position.y = 1.95; play.add(sky);
  }

  // ---------- particles: sparks, smoke, stars ----------
  const dm = new THREE.Object3D(), tc = new THREE.Color();
  function pool(geo, mat, n, grav, kind) {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false; play.add(mesh);
    if (kind !== 1) { for (let i = 0; i < n; i++) mesh.setColorAt(i, tc.setRGB(1, 1, 1)); }
    const ps = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, r: 0 }));
    let next = 0;
    return {
      emit(x, y, z, vx, vy, vz, s, life, col) {
        const p = ps[next];
        if (col && mesh.instanceColor) { mesh.setColorAt(next, col); mesh.instanceColor.needsUpdate = true; }
        next = (next + 1) % n;
        p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.life = p.max = life; p.r = Math.random() * TAU;
      },
      step(dt) {
        for (let i = 0; i < n; i++) {
          const p = ps[i];
          let sc = 0;
          if (p.life > 0) {
            p.life -= dt; p.vy -= grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 6;
            const k = Math.max(0, p.life / p.max);
            if (kind === 1) { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; sc = p.s * (1 + (1 - k) * 1.6) * Math.min(1, k * 3); }
            else sc = p.s * (kind === 2 ? Math.min(1, k * 2) : k);
          }
          dm.position.set(p.x, p.y, p.z); dm.rotation.set(0, 0, p.r); dm.scale.setScalar(sc); dm.updateMatrix();
          mesh.setMatrixAt(i, dm.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
      clear() { for (const p of ps) p.life = 0; },
    };
  }
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = PI / 2 + k * PI / 5, r = k % 2 ? .45 : 1; k ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const sparks = pool(ico(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 220, 1.5, 0);
  const smoke = pool(ico(1, 0), M(0xd8d4cc), 160, -.15, 1);
  const stars = pool(new THREE.ExtrudeGeometry(starShape, { depth: .25, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xffffff }), 80, 0, 2);
  const flashTex = paintTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); g.stroke(); }
  });
  const flashes = [0, 1].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; play.add(s); return { s, t: 0 }; });
  let flashN = 0;
  // the projectiles: a slow bolt and a quick laser
  const shotMeshes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(ico(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; play.add(m); return m; });

  // ---------- the chip ----------
  const chip = createChip(.1);
  function sfx(k, big = 0) {
    if (k === 'jump') chip.tone(320, 640, .08, { type: .25, vol: .18 });
    else if (k === 'dj') chip.tone(420, 940, .1, { type: .25, vol: .18 });
    else if (k === 'swing') chip.noise(.07, { vol: .1, f: 3200 });
    else if (k === 'hit') { chip.noise(.1 + big * .15, { vol: .3 + big * .15, f: 1800 }); chip.tone(240, 70, .12 + big * .1, { type: .5, vol: .22 }); }
    else if (k === 'shield') chip.tone(900, 700, .06, { type: 'tri', vol: .25 });
    else if (k === 'break') chip.seq([84, 79, 76, 72, 67], .05, { type: .125, vol: .2 });
    else if (k === 'ko') { chip.noise(.7, { vol: .4, f: 900 }); chip.tone(1200, 90, .7, { type: 'saw', vol: .14 }); }
    else if (k === 'shot0') chip.tone(620, 180, .16, { type: .125, vol: .16 });
    else if (k === 'shot1') chip.tone(1500, 900, .07, { type: .5, vol: .14 });
    else if (k === 'halo') chip.seq([72, 76, 79, 84], .06, { type: .25, vol: .15 });
  }

  // ---------- state ----------
  let fighters = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'vies', count = 0, clock = 0, left = 0, fightT = 0, acc = 0, tickN = 0, snapT = 0, sendT = 0, endT = -1, result = null, over = null;
  let held = 0, pend = 0, prevA = false, prevB = false, sentH = -1, auto = false, shake = 0;
  let shots = [], shotN = 0, evq = [];
  const cnt = [0, 0, 0, 0], sentC = [0, 0, 0, 0];
  const hist = Array.from({ length: 256 }, () => ({ h: 0, p: 0 })), ZERO = { h: 0, p: 0 };
  let camFov = 50;
  const cam = { x: 0, y: Y0 + .5, d: 3 };
  const byKey = (k) => fighters.find(c => c.key === k);
  const TIME = () => mode === 'vies' ? 180 : 120;

  function makeFighter(n, key, name, color, bot, ch) {
    const m = fighterModel(ch, color);
    play.add(m.g);
    const shield = new THREE.Mesh(ico(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), transparent: true, opacity: .38, depthWrite: false }));
    const halo = new THREE.Mesh(cyl(.1, .06, .02, 10), glow(color, 1.5));
    const swoosh = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 14, 1, 0, PI * 1.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .6).multiplyScalar(1.6), transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }));
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false }));
    tag.scale.set(.16, .04, 1);
    for (const o of [shield, halo, swoosh, tag]) { o.visible = false; play.add(o); }
    const c = { n, key, name, color, bot, ch, m, shield, halo, swoosh, tag, bi: { h: 0, p: 0 }, ai: { cd: .5, jc: 0, sh: 0, t: null },
      rin: { h: 0, c: [0, 0, 0, 0], u: [0, 0, 0, 0], k: 0, at: 0 }, net: null, snap: null, seen: 0, ox: 0, oy: 0, yaw: 0, ph: 0, tum: 0, ract: '', smokeT: 0, starT: 0, hm: 0, by: null, byT: 0 };
    fresh(c);
    c.yaw = c.face * (PI / 2 - .5);
    return c;
  }
  function fresh(c) {
    const x = SPAWN[c.n % 4];
    Object.assign(c, { x, y: Y0, vx: 0, vy: 0, lx: 0, ly: 0, face: x < 0 ? 1 : -1, act: '', at: 0, hit: 0, stop: 0, pct: 0, stocks: STOCKS, sh: 1, shOn: false, gr: 0,
      jumps: CH[c.ch].jumps, dizzy: 0, inv: 0, dead: 0, rp: 0, land: 0, drop: 0, sq: 0, sqAtk: false, kos: 0, falls: 0, flip: 0, helpless: false, ff: false, upUsed: false, sideUsed: false, out: false, koAt: 0 });
  }
  function dropFighter(c) {
    c.m.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const o of [c.m.g, c.shield, c.halo, c.swoosh, c.tag]) play.remove(o);
    c.shield.material.dispose(); c.swoosh.material.dispose(); c.tag.material.map.dispose(); c.tag.material.dispose();
    fighters.splice(fighters.indexOf(c), 1);
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'vies';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    const r = rng(seed);
    state = 'count'; count = 3.5; clock = 0; left = TIME(); fightT = 0; acc = 0; tickN = 0; snapT = 0; sendT = 0; endT = -1; result = null; over = null;
    held = 0; pend = 0; prevA = prevB = false; sentH = -1; shake = 0; shots = []; shotN = 0; evq = [];
    cnt.fill(0); sentC.fill(0);
    for (const e of hist) { e.h = 0; e.p = 0; }
    // everyone gets a different fighter, drawn from the seed
    const chars = [0, 1, 2, 3].sort(() => r() - .5);
    const pool = BOTS.slice().sort(() => r() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    const list = humans.slice(0, SEATS).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false }));
    for (let n = 0; list.length < SEATS; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    fighters = list.map((u, n) => makeFighter(n, u.key, u.name, u.color, u.bot, chars[n]));
    me = byKey(meId);
    play.visible = true;
    camFov = camera.fov; camera.fov = 40; camera.updateProjectionMatrix();
    cam.x = 0; cam.y = Y0 + .9; cam.d = 4.6;
    chip.init();
    audio.tick();
    render(0);
    placeCam(0);
  }
  function stopDyn() {
    for (const c of [...fighters]) dropFighter(c);
    fighters = []; me = null; shots = [];
    sparks.clear(); smoke.clear(); stars.clear();
    for (const m of shotMeshes) m.visible = false;
    for (const f of flashes) { f.s.visible = false; f.t = 0; }
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    play.visible = false;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close();
  }

  // ---------- the fight: one fixed step of one fighter, the same on the host and in replays ----------
  function stepFighter(c, inp, dt, replay) {
    if (c.out) return;
    if (c.dead > 0) { c.dead -= dt; if (c.dead <= 0) toHalo(c, replay); return; }
    if (c.stop > 0) { c.stop = Math.max(0, c.stop - dt); return; }
    const st = CH[c.ch], h = inp.h, p = inp.p;
    const dir = (h & H_R ? 1 : 0) - (h & H_L ? 1 : 0);
    c.inv = Math.max(0, c.inv - dt); c.drop = Math.max(0, c.drop - dt); c.land = Math.max(0, c.land - dt); c.flip = Math.max(0, c.flip - dt);
    c.hit = Math.max(0, c.hit - dt); c.dizzy = Math.max(0, c.dizzy - dt);
    // on the halo until you move, or it gives way
    if (c.gr === 4) {
      c.rp -= dt;
      if (c.rp > 0 && !dir && !(p & (P_J | P_A | P_B | P_D))) return;
      c.gr = -1; c.rp = 0; c.inv = Math.max(c.inv, 1.5);
    }
    const busy = c.hit > 0 || c.dizzy > 0 || !!c.act || c.land > 0 || c.sq > 0;
    // the shield wears while held and grows back slowly; empty, it breaks and leaves you dizzy
    if ((h & H_S) && c.gr >= 0 && !busy && c.sh > 0 && !(p & P_J)) {
      c.shOn = true; c.sh -= .2 * dt;
      if (c.sh <= 0) { breakShield(c); return; }
    } else { c.shOn = false; c.sh = Math.min(1, c.sh + .1 * dt); }
    const free = !busy && !c.shOn && !c.helpless;
    if (p & P_J && free) {
      if (c.gr >= 0) c.sq = SQ;
      else if (c.jumps > 0) { c.jumps--; c.vy = st.jump * .92; c.vx = dir * st.air; c.ff = false; c.flip = .32; if (c === me && !replay) sfx('dj'); }
    }
    if (p & P_A) { if (c.sq > 0) c.sqAtk = true; else if (free) attack(c, dir, h); }
    if (p & P_B && free) special(c, dir, h, st);
    if (p & P_D && c.gr >= 1 && c.gr <= 3 && free) { c.gr = -1; c.drop = .25; c.y -= .003; }
    // the jump squat: attack in it for an up attack from the ground
    if (c.sq > 0) {
      c.sq -= dt;
      if (c.sq <= 0) {
        c.sq = 0;
        if (c.sqAtk) { c.sqAtk = false; begin(c, 'up'); }
        else { c.gr = -1; c.vy = st.jump * (h & H_J ? 1 : .72); c.vx = c.vx * .6 + dir * st.air * .5; if (c === me && !replay) sfx('jump'); }
      }
    }
    const dashing = c.act === 'dash' && c.at < MOVES.dash.a[1];
    if (c.gr >= 0) {
      let tv = 0, a = 9;
      if (!busy && !c.shOn) { tv = dir * st.run; a = 12; if (dir) c.face = dir; }
      if (dashing) { tv = c.face * 2.4; a = 60; }
      c.vx += clamp(tv - c.vx, -a * dt, a * dt);
      c.vy = 0;
    } else {
      if (dashing) { c.vx = c.face * 2.1; c.vy = 0; }
      else if (c.hit <= 0 && c.dizzy <= 0) c.vx += clamp(dir * st.air * (c.helpless ? .6 : 1) - c.vx, -5 * dt, 5 * dt);
      else c.vx -= c.vx * Math.min(1, 2 * dt);
      c.vy -= G * st.grav * (c.hit > 0 ? .6 : 1) * dt;
      if (h & H_D && !c.ff && c.vy < .3 && c.hit <= 0 && c.act !== 'upb') c.ff = true;
      if (c.ff) c.vy = -FFALL; else if (c.vy < -FALL) c.vy = -FALL;
    }
    // the launch from a hit fades on its own, over what you do
    if (c.lx || c.ly) {
      const m = Math.hypot(c.lx, c.ly);
      if (m < .02) c.lx = c.ly = 0; else { const k = Math.max(0, m - DEC * dt) / m; c.lx *= k; c.ly *= k; }
    }
    const py = c.y;
    c.x += (c.vx + c.lx) * dt; c.y += (c.vy + c.ly) * dt;
    collide(c, py, h, dir, st);
    if (c.act) {
      const m = MOVES[c.act], t0 = c.at;
      c.at += dt;
      if (c.act === 'shot' && t0 < m.fire && c.at >= m.fire && isHost && !replay) fire(c);
      if (c.at >= m.d) { if (c.act === 'upb' && c.gr < 0) c.helpless = true; c.act = ''; c.at = 0; }
    }
  }
  function collide(c, py, h, dir, st) {
    if (c.gr >= 0 && c.gr <= 3) {
      const s = SURF[c.gr];
      if (c.x < s.x0 - .005 || c.x > s.x1 + .005) c.gr = -1; else c.y = s.y;
    } else if (c.gr < 0 && c.vy + c.ly <= 0) {
      for (let i = 0; i < 4; i++) {
        const s = SURF[i];
        if (s.pass && c.drop > 0) continue;
        if (py >= s.y - 1e-4 && c.y <= s.y && c.x >= s.x0 && c.x <= s.x1) { land(c, i, st); break; }
      }
    }
    // the island's sides and its tapering rock
    if (c.y < Y0 - .002) {
      const w = wallW(c.y) + HW;
      if (Math.abs(c.x) < w) {
        const sg = Math.sign(c.x) || 1;
        c.x = sg * w;
        if (c.vx * sg < 0) c.vx = 0;
        if (c.lx * sg < 0) c.lx = -c.lx * .5;
      }
    }
    // falling past the ledge while facing or heading for the lawn: pull yourself up
    if (c.gr < 0 && c.hit <= 0 && c.dizzy <= 0 && !(h & H_D) && c.vy + c.ly <= 0 && c.y < Y0 && c.y > Y0 - .24) {
      const ax = Math.abs(c.x), sg = Math.sign(c.x);
      if (ax > EDGE && ax < EDGE + .16 && (c.face === -sg || dir === -sg)) {
        c.gr = 0; c.x = sg * (EDGE - .06); c.y = Y0; c.vx = c.vy = c.lx = c.ly = 0; c.face = -sg;
        c.jumps = st.jumps; c.upUsed = c.sideUsed = c.helpless = c.ff = false; c.inv = Math.max(c.inv, .3);
        begin(c, 'climb');
      }
    }
  }
  function land(c, i, st) {
    const vy = c.vy + c.ly, s = SURF[i];
    // thrown hard at the ground: bounce off it
    if (c.hit > 0 && vy < -2) { c.y = s.y + .001; c.ly = -vy * .4; c.vy = 0; return; }
    c.gr = i; c.y = s.y; c.vy = 0; c.ly = 0; c.lx *= .4; c.ff = false;
    c.jumps = st.jumps; c.upUsed = c.sideUsed = c.helpless = false;
    if (c.act && (MOVES[c.act].air || c.act === 'upb' || c.act === 'dash')) { c.act = ''; c.at = 0; c.land = .1; }
  }
  function attack(c, dir, h) {
    let n;
    if (c.gr >= 0) n = h & H_U ? 'up' : h & H_D ? 'down' : dir ? 'side' : 'jab';
    else n = h & H_U ? 'uair' : h & H_D ? 'dair' : dir ? 'fair' : 'nair';
    if (dir && (n === 'side' || n === 'fair')) c.face = dir;
    begin(c, n);
  }
  function special(c, dir, h, st) {
    if (h & H_U) {
      if (c.upUsed) return;
      c.upUsed = true; begin(c, 'upb'); c.gr = -1; c.vy = st.rec; c.vx = dir * .7; c.ly = Math.max(0, c.ly); c.ff = false;
      if (dir) c.face = dir;
      return;
    }
    if (dir) c.face = dir;
    if (st.spec === 'dash') { if (c.gr < 0) { if (c.sideUsed) return; c.sideUsed = true; } begin(c, 'dash'); }
    else begin(c, 'shot');
  }
  function begin(c, n) { c.act = n; c.at = 0; c.hm = 0; c.shOn = false; }
  function breakShield(c) {
    c.shOn = false; c.sh = .4; c.dizzy = 2.2; c.gr = -1; c.vy = 2.2; c.act = '';
    if (isHost) ev(['b', c.key]);
  }
  function toHalo(c, replay) {
    Object.assign(c, { dead: 0, gr: 4, x: SPAWN[c.n % 4] * .5, y: Y0 + 1.25, vx: 0, vy: 0, lx: 0, ly: 0, pct: 0, sh: 1, shOn: false, hit: 0, stop: 0, act: '', at: 0, dizzy: 0,
      land: 0, sq: 0, sqAtk: false, jumps: CH[c.ch].jumps, upUsed: false, sideUsed: false, helpless: false, ff: false, inv: 3, rp: 3, flip: 0 });
    if (c === me && !replay) sfx('halo');
  }

  // ---------- the host's word: hits, projectiles, ejections ----------
  const hittable = (v) => !v.dead && !v.out && v.gr !== 4 && v.inv <= 0;
  // distance from a point to a fighter's body (a short vertical segment)
  const bodyDist = (x, y, v) => Math.hypot(x - v.x, y - clamp(y, v.y + .04, v.y + .16));
  function ev(e) { evq.push(e); playEvent(e); }
  function hits() {
    for (const a of fighters) {
      if (!a.act || a.stop > 0 || a.dead || a.out) continue;
      const m = MOVES[a.act];
      if (!m.dmg || a.at < m.a[0] || a.at > m.a[1]) continue;
      for (const side of m.both ? [1, -1] : [1]) {
        const hx = a.x + a.face * side * m.hx, hy = a.y + m.hy;
        for (const v of fighters) {
          if (v === a || !hittable(v) || a.hm & (1 << v.n)) continue;
          if (bodyDist(hx, hy, v) < m.r + .06) { a.hm |= 1 << v.n; strike(a, v, m, a.face * side, hx, hy, true); }
        }
      }
    }
  }
  function strike(a, v, m, fdir, hx, hy, melee) {
    const pw = CH[a.ch].pow;
    if (v.shOn) {
      v.sh -= m.dmg * .05 * pw; v.lx = fdir * (.6 + m.dmg * .04); v.stop = .05; if (melee) a.stop = .05;
      ev(['h', v.key, a.key, r3(hx), r3(hy), m.dmg, 0, 1]);
      if (v.sh <= 0) breakShield(v);
      return;
    }
    v.pct = Math.min(999, v.pct + m.dmg * pw);
    const kb = (m.b + m.g * v.pct / 100) * pw / CH[v.ch].w;
    let ang = m.ang * PI / 180;
    if (v.gr >= 0 && ang < 0) ang = .4;
    v.lx = Math.cos(ang) * kb * fdir; v.ly = Math.sin(ang) * kb; v.vx = v.vy = 0;
    if (v.ly > 0) v.gr = -1;
    Object.assign(v, { hit: .12 + kb * .085, act: '', at: 0, sq: 0, sqAtk: false, shOn: false, land: 0, dizzy: 0, helpless: false, ff: false, upUsed: false, sideUsed: false });
    const hs = Math.min(.16, .03 + m.dmg * .005 + (kb > 4 ? .04 : 0));
    v.stop = hs; if (melee) a.stop = hs;
    v.by = a === v ? null : a.key; v.byT = clock;
    ev(['h', v.key, a.key, r3(hx), r3(hy), m.dmg, kb > 3.6 ? 1 : 0, 0]);
  }
  function fire(c) {
    const k = CH[c.ch].shot, S = SHOTS[k];
    if (shots.filter(s => s.o === c.key).length >= 2) return;
    shots.push({ id: ++shotN, k, o: c.key, x: c.x + c.face * .1, y: c.y + .1, vx: c.face * S.v, life: S.life });
    ev(['f', c.key, k]);
  }
  function stepShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.x += s.vx * dt; s.life -= dt;
      if (s.life <= 0 || Math.abs(s.x) > BX || (s.y < Y0 - .01 && Math.abs(s.x) < wallW(s.y))) { shots.splice(i, 1); continue; }
      if (!isHost) continue;
      const S = SHOTS[s.k];
      for (const v of fighters) {
        if (v.key === s.o || !hittable(v) || bodyDist(s.x, s.y, v) > S.r + .06) continue;
        strike(byKey(s.o) || v, v, S, Math.sign(s.vx), s.x, s.y, false);
        shots.splice(i, 1);
        break;
      }
    }
  }
  function ko(c) {
    ev(['k', c.key, r3(clamp(c.x, -BX + .2, BX - .2)), r3(clamp(c.y, BBOT + .2, BTOP - .2))]);
    c.falls++;
    const by = c.by && clock - c.byT < 10 ? byKey(c.by) : null;
    if (by) by.kos++;
    if (mode === 'vies') c.stocks--;
    Object.assign(c, { dead: 1.4, hit: 0, lx: 0, ly: 0, vx: 0, vy: 0, act: '', by: null, shOn: false, stop: 0 });
    if (mode === 'vies' && c.stocks <= 0) { c.out = true; c.koAt = fightT; c.dead = 0; }
  }
  const ranking = () => [...fighters].sort((a, b) => mode === 'vies'
    ? (a.out - b.out) || (a.out ? b.koAt - a.koAt : (b.stocks - a.stocks) || (a.pct - b.pct))
    : ((b.kos - b.falls) - (a.kos - a.falls)) || (a.pct - b.pct)).map(c => c.key);
  function checkEnd() {
    if (over) return;
    const alive = fighters.filter(c => !c.out);
    if (left <= 0 || (mode === 'vies' && (alive.length <= 1 || !alive.some(c => !c.bot)))) finish(ranking());
  }

  // ---------- the bots: close in, hit in range, get back to the island, shield now and then ----------
  function botInput(c) {
    const o = c.bi, ai = c.ai;
    o.h = 0; o.p = 0;
    if (c.dead > 0 || c.out) return o;
    if (c.gr === 4) { if (Math.random() < .015) o.p = P_D; return o; }
    ai.cd -= STEP; ai.jc -= STEP;
    const home = c.x > 0 ? H_L : H_R;
    if (c.gr < 0 && (Math.abs(c.x) > EDGE + .02 || c.y < Y0 - .05)) {
      o.h |= home;
      if (c.hit > 0 || c.helpless) return o;
      if (c.vy + c.ly <= .2 && c.y < Y0 + .2) {
        if (c.jumps > 0 && ai.jc <= 0) { o.p |= P_J; o.h |= H_J; ai.jc = .3; }
        else if (!c.upUsed && c.jumps === 0 && (c.y < Y0 - .05 || Math.abs(c.x) - EDGE > .45)) { o.h |= H_U; o.p |= P_B; }
      }
      return o;
    }
    let t = null, bd = 1e9;
    for (const q of fighters) {
      if (q === c || q.dead || q.out || q.gr === 4) continue;
      const d = Math.hypot(q.x - c.x, (q.y - c.y) * 1.5) - (q === ai.t ? .3 : 0);
      if (d < bd) { bd = d; t = q; }
    }
    ai.t = t;
    if (!t) { if (Math.abs(c.x) > .5) o.h |= home; return o; }
    const dx = t.x - c.x, dy = t.y - c.y, adx = Math.abs(dx), sx = dx > 0 ? 1 : -1;
    const tOff = Math.abs(t.x) > EDGE + .05 || t.y < Y0 - .1;
    if (ai.sh > 0) { ai.sh -= STEP; o.h |= H_S; return o; }
    if (c.gr >= 0 && t.act && MOVES[t.act].dmg && adx < .3 && Math.abs(dy) < .25 && ai.cd <= 0 && Math.random() < .06) { ai.sh = .25 + Math.random() * .3; ai.cd = .2; o.h |= H_S; return o; }
    if (adx > .16 || Math.abs(dy) > .2) {
      // chase, but never walk off after someone thrown out
      if (!(tOff && Math.abs(c.x + sx * .1) > EDGE - .12)) o.h |= sx > 0 ? H_R : H_L;
    }
    if (dy > .25 && adx < .6 && ai.jc <= 0 && (c.gr >= 0 || c.jumps > 0) && c.vy <= .5) { o.p |= P_J; o.h |= H_J; ai.jc = .45; }
    if (c.gr >= 1 && c.gr <= 3 && dy < -.2 && adx < .5 && ai.jc <= 0) { o.p |= P_D; ai.jc = .4; }
    if (ai.cd <= 0 && adx < .24 && Math.abs(dy) < .22) {
      ai.cd = .25 + Math.random() * .45;
      o.p |= P_A; o.h &= ~(H_L | H_R);
      if (dy > .12) o.h |= H_U;
      else if (dy < -.1 && c.gr < 0) o.h |= H_D;
      else if (c.gr >= 0) { const r = Math.random(); if (r < .5 || t.pct > 80) o.h |= sx > 0 ? H_R : H_L; else if (r < .7) o.h |= H_D; }
      else if (Math.random() < .6) o.h |= sx > 0 ? H_R : H_L;
    } else if (ai.cd <= 0 && Math.abs(dy) < .12 && adx > .45 && adx < 1.2 && !tOff && Math.random() < .03) {
      o.p |= P_B; o.h = (o.h & ~(H_L | H_R)) | (sx > 0 ? H_R : H_L); ai.cd = .6;
    }
    return o;
  }

  // ---------- the network ----------
  function pack(c, ack) {
    return [c.key, r3(c.x), r3(c.y), r3(c.vx), r3(c.vy), r3(c.lx), r3(c.ly), c.face, ACTS.indexOf(c.act), r3(c.at), r3(c.hit), r3(c.stop), Math.round(c.pct * 10) / 10, c.stocks, r3(c.sh),
      (c.gr + 1) | (c.shOn << 3) | (c.helpless << 4) | (c.ff << 5) | (c.out << 6) | (c.upUsed << 7) | (c.sideUsed << 8) | (c.sqAtk << 9),
      c.jumps, r3(c.dizzy), r3(c.inv), r3(c.dead), r3(c.rp), r3(c.land), r3(c.drop), r3(c.sq), c.kos, c.falls, r3(c.flip), ack, r3(c.koAt)];
  }
  function unpack(c, a, pos) {
    if (pos) { c.x = a[1]; c.y = a[2]; }
    c.vx = a[3]; c.vy = a[4]; c.lx = a[5]; c.ly = a[6]; c.face = a[7]; c.act = ACTS[a[8]] || ''; c.at = a[9]; c.hit = a[10]; c.stop = a[11]; c.pct = a[12]; c.stocks = a[13]; c.sh = a[14];
    const f = a[15];
    c.gr = (f & 7) - 1; c.shOn = !!(f & 8); c.helpless = !!(f & 16); c.ff = !!(f & 32); c.out = !!(f & 64); c.upUsed = !!(f & 128); c.sideUsed = !!(f & 256); c.sqAtk = !!(f & 512);
    c.jumps = a[16]; c.dizzy = a[17]; c.inv = a[18]; c.dead = a[19]; c.rp = a[20]; c.land = a[21]; c.drop = a[22]; c.sq = a[23]; c.kos = a[24]; c.falls = a[25]; c.flip = a[26]; c.koAt = a[28];
  }
  // my fighter: take the host's state, then replay the inputs it has not seen yet
  function reconcile(a) {
    const ox = me.x + me.ox, oy = me.y + me.oy;
    unpack(me, a, true);
    const ack = a[27];
    if (ack > 0 && tickN - ack < 90) for (let k = ack + 1; k <= tickN; k++) stepFighter(me, hist[k & 255], STEP, true);
    me.ox = ox - me.x; me.oy = oy - me.y;
    if (Math.hypot(me.ox, me.oy) > .5) me.ox = me.oy = 0;
  }
  function follow(c, dt) {
    const n = c.net;
    if (!n) return;
    n.t += dt;
    const k = c.stop > 0 ? 0 : Math.min(n.t, .12), tx = n.x + n.vx * k, ty = n.y + n.vy * k;
    if (c.dead > 0 || c.out || Math.hypot(tx - c.x, ty - c.y) > .6) { c.x = tx; c.y = ty; }
    const a = Math.min(1, dt * 16);
    c.x += (tx - c.x) * a; c.y += (ty - c.y) * a;
    if (c.act) c.at += dt;
    c.flip = Math.max(0, c.flip - dt); c.inv = Math.max(0, c.inv - dt); c.hit = Math.max(0, c.hit - dt); c.stop = Math.max(0, c.stop - dt); c.dizzy = Math.max(0, c.dizzy - dt);
  }
  function applySnap(s) {
    left = s.T;
    const keys = new Set();
    for (const a of s.f) {
      keys.add(a[0]);
      const c = byKey(a[0]);
      if (!c) continue;
      c.snap = a; c.seen = clock;
      if (c === me) { reconcile(a); continue; }
      const was = c.dead > 0;
      unpack(c, a, false);
      c.net = { x: a[1], y: a[2], vx: a[3] + a[5], vy: a[4] + a[6], t: 0 };
      if (was !== c.dead > 0) { c.x = a[1]; c.y = a[2]; }
    }
    for (const c of [...fighters]) if (c !== me && !keys.has(c.key)) dropFighter(c);
    shots.length = 0;
    for (const [id, k, x, y, vx, o] of s.p) shots.push({ id, k, x, y, vx, o, life: 1 });
    for (const e of s.e) playEvent(e);
    if (s.o && !over) finish(s.o);
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const c = byKey(pid);
    if (fx.t === 'i') {
      if (!c) return;
      c.seen = clock;
      const r = c.rin;
      r.h = fx.h; r.k = fx.k; r.at = tickN;
      for (let i = 0; i < 4; i++) { r.c[i] = fx.c[i]; if (!isHost) r.u[i] = fx.c[i]; }
    } else if (fx.t === 's' && pid === hostId && !isHost) applySnap(fx);
  }
  function remoteInput(c, fight) {
    const r = c.rin, o = c.bi;
    o.h = fight ? r.h : 0; o.p = 0;
    for (let i = 0; i < 4; i++) {
      if (!fight) r.u[i] = r.c[i];
      else if (r.u[i] < r.c[i]) { o.p |= 1 << i; r.u[i]++; }
    }
    return o;
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c && c !== me) dropFighter(c);
    if (id === hostId) {
      hostId = hostOf(fighters.filter(q => !q.bot).map(q => ({ id: q.key })), id) ?? meId;
      const was = isHost;
      isHost = hostId === meId;
      // the new host carries on from the last word of the old one
      if (isHost && !was) for (const q of fighters) if (q !== me && q.snap) { unpack(q, q.snap, true); q.net = null; q.ai.cd = .3; }
    }
  }

  // ---------- effects ----------
  const spark = new THREE.Color(), SPARK = [new THREE.Color(3, 3, 2.6), new THREE.Color(3, 2.2, .6), new THREE.Color(2.6, 1, .3)];
  function playEvent(e) {
    if (e[0] === 'h') {
      const [, vk, , x, y, dmg, big, sh] = e, v = byKey(vk);
      const n = sh ? 6 : 8 + dmg + big * 10;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, s = (.6 + Math.random() * 1.4) * (1 + big * .6);
        sparks.emit(x, y, .02, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - .5) * .4, .008 + Math.random() * .008 + big * .006, .18 + Math.random() * .2, sh ? spark.setRGB(1.2, 2.2, 3) : SPARK[k % 3]);
      }
      sfx(sh ? 'shield' : 'hit', big);
      if (big) shake = Math.max(shake, .05);
      if (v === me && !sh) shake = Math.max(shake, .025);
    } else if (e[0] === 'k') {
      const [, key, x, y] = e, c = byKey(key), col = c ? c.color : 0xffffff;
      const f = flashes[flashN++ % 2];
      f.t = .6; f.s.position.set(x, y, .05); f.s.material.color.setHex(col).multiplyScalar(2.2); f.s.visible = true;
      const ix = -Math.sign(x) * (Math.abs(x) > BX - .4 ? 1 : 0), iy = y > BTOP - .4 ? -1 : y < BBOT + .4 ? 1 : 0;
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * TAU, s = .5 + Math.random() * 1.6;
        stars.emit(x, y, .05, Math.cos(a) * s * .6 + ix * s, Math.sin(a) * s * .6 + iy * s, 0, .02 + Math.random() * .025, .6 + Math.random() * .5, spark.setHex(k % 3 ? col : 0xffe060).multiplyScalar(2));
      }
      sfx('ko'); shake = Math.max(shake, c === me ? .12 : .07);
    } else if (e[0] === 'b') {
      const c = byKey(e[1]);
      if (c) for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; sparks.emit(c.x, c.y + .1, .02, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0, .012, .4, spark.setHex(c.color).multiplyScalar(2)); }
      sfx('break'); shake = Math.max(shake, .05);
    } else if (e[0] === 'f') sfx('shot' + e[2]);
  }

  // ---------- the frame ----------
  function readKeys(keys) {
    const has = (a, b) => keys.has(a) || keys.has(b);
    let h = 0;
    if (has('KeyA', 'ArrowLeft')) h |= H_L;
    if (has('KeyD', 'ArrowRight')) h |= H_R;
    if (has('KeyW', 'ArrowUp')) h |= H_U | H_J;
    if (has('KeyS', 'ArrowDown')) h |= H_D;
    if (has('ShiftLeft', 'ShiftRight')) h |= H_S;
    if (keys.has('Space')) h |= H_J;
    const a = keys.has('KeyJ'), b = keys.has('KeyK');
    if (h & H_J && !(held & H_J)) tap(P_J);
    if (h & H_D && !(held & H_D)) tap(P_D);
    if (a && !prevA) tap(P_A);
    if (b && !prevB) tap(P_B);
    held = h; prevA = a; prevB = b;
  }
  function tap(bit) { pend |= bit; cnt[Math.log2(bit)]++; }
  function tick() {
    tickN++;
    const fight = state === 'fight';
    const mi = hist[tickN & 255];
    if (auto && me) { const o = botInput(me); held = o.h; for (let i = 0; i < 4; i++) if (o.p & (1 << i)) tap(1 << i); }
    mi.h = fight ? held : 0; mi.p = fight ? pend : 0; pend = 0;
    if (isHost) {
      for (const c of fighters) stepFighter(c, c === me ? mi : !fight ? ZERO : c.bot ? botInput(c) : remoteInput(c, fight), STEP, false);
      for (const c of fighters) if (!c.bot && c !== me && !fight) remoteInput(c, false);
      stepShots(STEP);
      hits();
      for (const c of fighters) if (!c.dead && !c.out && (c.x < -BX || c.x > BX || c.y > BTOP || c.y < BBOT)) ko(c);
      if (fight) { fightT += STEP; left = Math.max(0, TIME() - fightT); checkEnd(); }
    } else {
      if (me) stepFighter(me, mi, STEP, false);
      stepShots(STEP);
      if (fight) { fightT += STEP; left = Math.max(0, left - STEP); }
    }
  }
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
      if (count <= 0) { state = 'fight'; audio.buy(); }
    }
    acc += dt;
    while (acc >= STEP) { acc -= STEP; tick(); }
    if (!isHost) for (const c of fighters) if (c !== me) follow(c, dt);
    render(dt);
    // the network: the host's word at 15 Hz, everyone else's inputs when they change
    if (isHost) {
      snapT -= dt;
      if (snapT <= 0) {
        snapT = 1 / 15;
        const f = fighters.map(c => pack(c, c.bot || c === me ? 0 : c.rin.k + (tickN - c.rin.at)));
        const msg = { t: 's', T: r3(left), f, p: shots.map(s => [s.id, s.k, r3(s.x), r3(s.y), r3(s.vx), s.o]), e: evq };
        if (over) msg.o = over;
        send(msg); evq = [];
      }
    } else {
      sendT -= dt;
      const changed = held !== sentH || cnt.some((v, i) => v !== sentC[i]);
      if ((changed && sendT <= .25 - 1 / 15) || sendT <= 0) {
        sendT = .25; sentH = held;
        for (let i = 0; i < 4; i++) sentC[i] = cnt[i];
        send({ t: 'i', h: held, c: cnt.slice(), k: tickN });
      }
    }
    // drop the humans who never showed up
    if (clock > 9) for (const c of [...fighters]) if (!c.bot && c !== me && !c.seen) peerLeft(c.key);
    if (endT > 0) { endT -= dt; if (endT <= 0) { endT = -1; onEnd(result); } }
    placeCam(dt);
  }

  // ---------- drawing the fighters ----------
  const bump = (t, m) => t < m.a[0] ? t / m.a[0] : t < m.a[1] ? 1 : Math.max(0, 1 - (t - m.a[1]) / (m.d - m.a[1]));
  const aX = [0, 0], aZ = [0, 0], lX = [0, 0];
  function pose(c, dt) {
    const B = c.m, fa = c.face > 0 ? 0 : 1;
    let hip = .36, rx = 0, ry = 0, rz = 0, twist = 0, headX = 0;
    aX[0] = aX[1] = 0; aZ[0] = -.15; aZ[1] = .15; lX[0] = lX[1] = 0;
    const ground = c.gr >= 0, sp = Math.abs(c.vx);
    if (c.hit > 0) {
      c.tum += dt * 14 * (c.face > 0 ? -1 : 1);
      rx = Math.hypot(c.lx, c.ly) > 1.5 ? c.tum : -.5; aZ[0] = -1.4; aZ[1] = 1.4; lX[0] = -.6; lX[1] = .4;
    } else if (c.dizzy > 0) {
      rz = Math.sin(clock * 5) * .25; headX = Math.sin(clock * 3) * .3; aZ[0] = -.5; aZ[1] = .5; hip = .34;
    } else if (!ground) {
      lX[0] = -.8; lX[1] = .3; aX[0] = -.5; aX[1] = .4; aZ[0] = -.7; aZ[1] = .7;
      if (c.flip > 0) rx = (1 - c.flip / .32) * TAU;
      if (c.helpless) { rx = .3; aZ[0] = -2.4; aZ[1] = 2.4; }
    } else if (sp > .08) {
      c.ph += sp * dt * 24;
      const s = Math.sin(c.ph);
      lX[0] = s * .9; lX[1] = -s * .9; aX[0] = -s * .8; aX[1] = s * .8; rx = .12 + sp * .12; hip += Math.abs(Math.cos(c.ph)) * .03;
    } else hip += Math.sin(clock * 3 + c.n) * .012;
    if (c.shOn) { hip = .3; aX[0] = aX[1] = -1; lX[0] = -.4; lX[1] = .3; }
    if (c.sq > 0 || c.land > 0) { hip = .28; lX[0] = -.5; lX[1] = .5; }
    if (c.act && c.hit <= 0) {
      const m = MOVES[c.act], t = c.at, k = t / m.d;
      if (c.act === 'jab') aX[fa] = -1.6 * bump(t, m);
      else if (c.act === 'side') { const w = t < m.a[0]; twist = w ? .7 : -.6 * bump(t, m); aX[fa] = w ? .9 : -1.8 * bump(t, m); rx = .25 * bump(t, m); }
      else if (c.act === 'up') { aX[fa] = -3 * bump(t, m); aX[1 - fa] = -2.4 * bump(t, m); hip += .05 * bump(t, m); }
      else if (c.act === 'down') { hip = .26; ry = k * TAU; lX[0] = -1.3; lX[1] = 1.3; }
      else if (c.act === 'nair') { ry = k * TAU * 2; aZ[0] = -1.4; aZ[1] = 1.4; lX[0] = -.7; lX[1] = .7; }
      else if (c.act === 'fair') { lX[fa] = -1.7 * bump(t, m); aX[fa] = -2 * bump(t, m); rx = -.3 * bump(t, m); }
      else if (c.act === 'uair') rx = -k * TAU;
      else if (c.act === 'dair') { lX[0] = lX[1] = .15; aX[0] = aX[1] = -2.8 * bump(t, m); rx = -.2; }
      else if (c.act === 'dash') { rx = c.ch === 0 ? 1.2 : .6; aX[0] = aX[1] = -1.6; lX[0] = .8; lX[1] = .5; }
      else if (c.act === 'upb') { ry = k * TAU * 3; aX[0] = aX[1] = -3; }
      else if (c.act === 'shot') aX[fa] = -1.55;
      else if (c.act === 'climb') { hip = .36 - .25 * (1 - k); rx = .5 * (1 - k); aX[0] = aX[1] = -2.6 * (1 - k); }
    }
    const tgt = c.face * (PI / 2 - .5);
    c.yaw += (tgt - c.yaw) * Math.min(1, dt * 18);
    B.g.rotation.y = c.yaw;
    B.body.position.y = hip; B.body.rotation.set(rx, ry, rz);
    B.torso.rotation.y = twist; B.head.rotation.x = headX;
    for (let i = 0; i < 2; i++) { B.arms[i].rotation.set(aX[i], 0, aZ[i]); B.legs[i].rotation.x = lX[i]; }
    if (B.tail) B.tail.rotation.y = Math.sin(clock * 4 + c.n) * .3;
  }
  const DUST = new THREE.Color(1.6, 1.5, 1.3);
  function render(dt) {
    for (const c of fighters) {
      const vis = !c.dead && !c.out;
      if (c === me) { const k = Math.exp(-dt * 10); c.ox *= k; c.oy *= k; }
      const x = c.x + (c === me ? c.ox : 0) + (c.stop > 0 ? (Math.random() - .5) * .012 : 0), y = c.y + (c === me ? c.oy : 0);
      c.m.g.visible = vis && !(c.inv > 0 && c.gr !== 4 && Math.floor(clock * 16) % 2);
      c.m.g.position.set(x, y, 0);
      if (vis) pose(c, dt);
      // a swing sound and a trail for every attack that starts
      if (c.act !== c.ract) { if (c.act && MOVES[c.act].dmg && vis) sfx('swing'); c.ract = c.act; }
      const m = c.act ? MOVES[c.act] : null, on = vis && m && m.dmg && c.at >= m.a[0] - .02 && c.at <= m.a[1] + .05;
      c.swoosh.visible = !!on;
      if (on) {
        c.swoosh.position.set(x + c.face * m.hx, y + m.hy, .03);
        c.swoosh.scale.setScalar(m.r * 1.4);
        c.swoosh.rotation.set(0, c.face > 0 ? 0 : PI, (c.at - m.a[0]) * 14 - 1);
      }
      c.shield.visible = vis && c.shOn;
      if (c.shOn) { c.shield.position.set(x, y + .1, 0); c.shield.scale.setScalar(.06 + .07 * Math.max(0, c.sh)); }
      c.halo.visible = vis && c.gr === 4;
      if (c.gr === 4) c.halo.position.set(x, y - .01, 0);
      c.tag.visible = vis;
      c.tag.position.set(x, y + .31, 0);
      // smoke behind a hard throw, stars round a dizzy head
      c.smokeT -= dt; c.starT -= dt;
      if (vis && c.hit > 0 && Math.hypot(c.lx, c.ly) > 1.6 && c.smokeT <= 0) { c.smokeT = .025; smoke.emit(x, y + .1, -.02, (Math.random() - .5) * .1, (Math.random() - .5) * .1, 0, .018 + Math.random() * .01, .5); }
      if (vis && c.dizzy > 0 && c.starT <= 0) { c.starT = .12; const a = clock * 6; stars.emit(x + Math.cos(a) * .07, y + .26, Math.sin(a) * .07, -Math.sin(a) * .4, .05, Math.cos(a) * .4, .014, .4, spark.setRGB(2.4, 2.1, .5)); }
      if (vis && c.gr >= 0 && Math.abs(c.vx) > .7 && c.smokeT <= 0) { c.smokeT = .09; smoke.emit(x - c.face * .04, y + .01, 0, -c.vx * .1, .1, 0, .01, .35); }
    }
    let n = 0;
    for (const s of shots) {
      if (n >= shotMeshes.length) break;
      const o = byKey(s.o), sm = shotMeshes[n++];
      sm.visible = true; sm.position.set(s.x, s.y, 0);
      sm.material.color.setHex(o ? o.color : 0xffffff).lerp(DUST, .4).multiplyScalar(2);
      if (s.k === 0) { sm.scale.setScalar(.035 + Math.sin(clock * 30) * .005); sm.rotation.z += dt * 8; }
      else { sm.scale.set(.06, .012, .012); sm.rotation.z = 0; }
    }
    for (; n < shotMeshes.length; n++) shotMeshes[n].visible = false;
    for (const f of flashes) if (f.t > 0) {
      f.t -= dt;
      const k = 1 - f.t / .6;
      f.s.scale.setScalar(.3 + k * 1.6); f.s.material.opacity = Math.max(0, 1 - k);
      if (f.t <= 0) f.s.visible = false;
    }
    sparks.step(dt); smoke.step(dt); stars.step(dt);
  }

  // ---------- the camera: side on, framing everyone still in the fight ----------
  const look = new THREE.Vector3();
  function placeCam(dt) {
    let x0 = -.5, x1 = .5, y0 = Y0, y1 = Y0 + .3;
    for (const c of fighters) {
      if (c.dead > 0 || c.out) continue;
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y + .2);
    }
    x0 -= .6; x1 += .6; y0 -= .35; y1 += .4;
    const t = Math.tan(camera.fov * PI / 360), asp = camera.aspect || 1.6;
    const d = clamp(Math.max((x1 - x0) / 2 / (t * asp), (y1 - y0) / 2 / t), 1.9, 3.4);
    const cx = clamp((x0 + x1) / 2, -1.8, 1.8), cy = clamp((y0 + y1) / 2, Y0 - .3, BTOP - 1);
    if (state === 'count') {
      // a sweep down from high over the island
      const k = clamp(1 - Math.max(0, count - .5) / 3, 0, 1), e = k * k * (3 - 2 * k);
      cam.x = cx * e; cam.y = Y0 + 1.2 + (cy - Y0 - 1.2) * e; cam.d = 4.8 + (d - 4.8) * e;
    } else {
      const a = Math.min(1, dt * 3);
      cam.x += (cx - cam.x) * a; cam.y += (cy - cam.y) * a; cam.d += (d - cam.d) * Math.min(1, dt * 2);
    }
    camera.position.set(at.x + cam.x, at.y + cam.y + cam.d * .17, at.z + cam.d);
    look.set(at.x + cam.x, at.y + cam.y, at.z);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * .25);
      camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake;
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
  }

  // ---------- the end ----------
  function finish(rank) {
    over = rank; state = 'over';
    const of = rank.length, place = rank.indexOf(meId) + 1 || of;
    const value = me ? (mode === 'vies' ? me.kos : me.kos - me.falls) : 0;
    const txt = mode === 'vies' ? `${value} KO` : `${value > 0 ? '+' : ''}${value} pt${Math.abs(value) > 1 ? 's' : ''}`;
    result = { place, of, value, time: fightT, text: `${ord(place)} place · ${txt}` };
    ui.toast(place === 1 ? 'victoire !' : `${ord(place)} place`, false, 2600);
    if (place === 1) audio.win(); else chip.seq([67, 64, 60, 55], .12, { type: .25, vol: .15 });
    endT = 3;
  }

  function card(c) {
    const col = hexOf(c.color);
    const life = mode === 'vies' ? (c.out ? 'éliminé' : '●'.repeat(Math.max(0, c.stocks))) : `${c.kos - c.falls > 0 ? '+' : ''}${c.kos - c.falls}`;
    return `<span style="display:flex;flex-direction:column;align-items:center;min-width:56px;opacity:${c.out ? .45 : 1}"><span class="big" style="color:${col};font-size:32px">${c.out || c.dead > 0 ? '–' : Math.floor(c.pct)}<small>%</small></span>`
      + `<span style="font-size:12px;color:${col}">${c === me ? '<em>toi</em>' : c.name}</span><span style="font-size:11px;letter-spacing:.12em">${life}</span></span>`;
  }
  return {
    modes: MODES,
    keys: [['q d', 'courir'], ['z · espace', 'sauter · double saut'], ['s', 'traverser · chute rapide'], ['j · clic', 'attaque (+ direction)'], ['k · clic droit', 'spécial · z + k : remontée'], ['shift', 'bouclier']],
    start, stop, update, onFx, peerLeft,
    respawn() {},
    press(b, down) { if (down && state === 'fight') tap(b === 2 ? P_B : P_A); },
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (state === 'off') return { hidden: true };
      const list = over ? over.map(byKey).filter(Boolean) : fighters;
      const head = over ? `résultats · ${result ? ord(result.place) + ' place' : ''}` : `bagarre 64 · ${mmss(left)}`;
      const tip = !over && fightT < 7 ? '<span>j : attaque · k : spécial · z + k : remontée · shift : bouclier</span>' : '';
      return { html: `<b>${head}</b><div style="display:flex;gap:16px;justify-content:center;margin-top:2px">${list.map(card).join('')}</div>${tip}` };
    },
    preview() { return { x: at.x, y: at.y + Y0 + .4, z: at.z, yaw: PI, rad: 2.6, h: .5 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get fighters() { return fighters; }, get me() { return me; }, get shots() { return shots; }, get isHost() { return isHost; }, get state() { return state; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _tp(x, y, pct) { if (!me) return; me.x = x; me.y = y; me.gr = -1; if (pct != null) me.pct = pct; },
  };
}
