// rcrace.js, mini bolides: little radio-controlled cars in the town at real scale, so the
// street is a motorway, a kerb is a jump and a park bench is a tunnel. The course: the whole
// rue des Cerisiers under a parked 4x4, the church square behind the parked cars, a paddling
// pool to jump by the church, a banked cardboard corner, a hairpin, the back lane and its
// cardboard loop, a detour round the neighbours' house through their garden gate, the town
// hall park under a bench, the alley by the town hall, or the roadworks trench on a plank.
// Four modes: the race, a time trial with your ghost, star tag on the church square and a
// stunt park the kids set up in our garden. Lightning pickups give the weapons: fireworks,
// water balloons, shockwave, oil, electro pulse, bomb, turbo battery, a fake pickup and,
// rarely, the global pulse.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { netTrack, netNow, netStamp } from './netlerp.js';
import { wrapAngle as wrap } from './lib/math.js';
import { fmtTime as fmt, esc } from './lib/fmt.js';

const LAPS = 3, GRID = 6, SP = .25, CP_M = 20, BATTLE_T = 180, STUNT_T = 360;
const ROAD_Z = -13.1, G = 15, R = .19;
const COURSE_ID = 'ville2';
const MODES = [
  { id: 'course', name: 'course', sub: '3 tours dans les rues de la ville contre les bolides · objets', help: '3 tours · zqsd · espace : objet · shift : frein à main · r : revenir sur la piste', unit: 'time', lower: true },
  { id: 'chrono', name: 'contre-la-montre', sub: 'seul sur la piste, sans objets · ton meilleur tour contre ton fantôme', help: '3 tours · ton meilleur tour compte · le fantôme refait ton record', unit: 'time', lower: true },
  { id: 'bataille', name: 'chasse à l\'étoile', sub: 'sur la place de l\'église · garde l\'étoile le plus longtemps · 3 min, armes', help: 'touche celui qui a l\'étoile pour la voler · espace : objet · r : se replacer', unit: 'time', lower: false },
  { id: 'cascades', name: 'cascades', sub: 'le jardin transformé en parc à cascades · ramasse les étoiles au chrono', help: 'tremplins, rampe, looping : ramasse toutes les étoiles · r : se replacer', unit: 'time', lower: true },
];

// ---------- the racing line: [x, z, half width] ----------
const arc = (cx, cz, r, a0, a1, n, w) => Array.from({ length: n }, (_, k) => { const a = a0 + (a1 - a0) * k / (n - 1); return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, w]; });
const PI = Math.PI;
const CTRL = [
  // the street, eastwards
  [-20, -13.1, 1.3], [-5, -13.1, 1.1], [10, -13, 1.3], [25, -13.1, 1.3], [40, -13.1, 1.3], [51, -13.2, 1.3],
  // into the church square over the zebra crossing, round the fountain, behind the parked cars
  [57.6, -12.9, 1.2], [61, -11, 1.1], [62.6, -8.2, 1.1], [64.4, -4.6, 1.1], [66.9, -1.2, 1.1], [69.8, 2.2, 1],
  [72.2, 5.4, .6], [72.9, 7.8, .5], [73.8, 10.3, .45], [74.3, 12.3, .5], [73.6, 14.7, 1.2], [71.6, 17.6, 1.5], [70.4, 21.5, 1.7],
  // up the lawn by the church, over the paddling pool, the banked corner
  [70.3, 26, 1.1], [70.3, 30.3, 1.1], [70.3, 34, 1.5], [70.3, 38, 1.7],
  ...arc(66.3, 40.6, 4, 0, PI / 2, 6, 1.7).slice(1),
  [61, 44.7, 1.7], [57, 44.7, 1.6],
  ...arc(55.5, 41.6, 3, PI / 2, PI, 4, 1.4).slice(1),
  [52.5, 34, 1.5], [52.5, 26, 1.5], [52.45, 21, 1.5],
  // the banked hairpin
  ...arc(49, 19, 3.45, -.05, -PI + .05, 8, 1.4),
  [45.55, 24, 1.5], [45.55, 32, 1.5], [45.6, 40, 1.5],
  ...arc(41.6, 45.5, 4, 0, PI / 2, 5, 1.4),
  // the back lane, westwards; the neighbours' garden: in by the gate, round the house, out
  [36, 49.5, 1.4], [30.5, 49.7, 1.4], [26, 51.2, 1.3], [22.4, 54.4, 1.1], [20.3, 57.4, .6], [20, 59.2, .35], [20.4, 60.55, .5],
  [22.3, 61.15, .55], [25, 61.3, .8], [27.3, 62.4, 1], [28.4, 64.6, 1.1], [28.5, 69, 1.2], [27.8, 72.6, 1.1], [25, 74, 1.1],
  [20, 74.2, 1.2], [15, 74, 1.1], [12.3, 72.6, 1], [11.5, 69, 1.1], [11.6, 64, 1.1], [11.8, 60.6, 1.1], [11.2, 56.8, 1.3],
  [9.6, 52.8, 1.4], [5.5, 50.2, 1.4], [0, 49.55, 1.4], [-8, 49.5, 1.3], [-13, 49.5, .6], [-20, 49.5, 1.3], [-30, 49.5, 1.4],
  [-40, 49.5, 1.4], [-50, 49.5, 1.5], [-58, 49.5, 1.5],
  ...arc(-66, 45.5, 4, PI / 2, PI, 6, 1.6),
  // the town hall park: under the bench, between the flower beds, then the alley by the town hall
  [-70, 38, 1.6], [-70, 30, 1.6], [-69.5, 23, 1.4], [-67.2, 18.2, 1.1], [-63.8, 15.2, .8], [-61.2, 12.4, .5], [-60.3, 10.6, .4], [-60, 9.5, .32],
  [-60.1, 7.4, .6], [-61.6, 4.3, 1], [-64.6, 2.35, 1], [-68.3, 1.65, .8], [-70.5, .5, .6], [-71.3, -2.4, .45], [-71.65, -5.6, .4],
  [-71.9, -8.6, .3], [-71.55, -11.2, .6], [-69.6, -12.75, 1.1], [-65, -13.1, 1.3], [-55, -13.1, 1.3], [-45, -13.1, 1.3], [-35, -13.1, 1.3],
];
// the shortcut: across the lawn by the town hall and over the roadworks trench on a plank
const SHORT = [[-60.1, 7.4], [-59, 4.6], [-56, 2.6], [-52.5, 1.9], [-49.8, 1.3], [-48.2, .3], [-47.35, -.9], [-47.25, -2.1], [-47.25, -3.8], [-47.25, -5.6], [-47.1, -8.3], [-46.1, -10.7], [-43.6, -12.6], [-40, -13.1]];
// kinds: top speed, acceleration, grip, turn rate; wheels (radius front/back, width, track, base)
const KINDS = [
  { id: 'buggy', top: 11.6, acc: 27, grip: 9, turn: 3.4, r: .068, rr: .078, ww: .056, wx: .135, wz: .145 },
  { id: 'monstre', top: 10.8, acc: 25, grip: 8, turn: 3.1, r: .102, rr: .102, ww: .075, wx: .155, wz: .15 },
  { id: 'formule', top: 12.4, acc: 25, grip: 10.5, turn: 3.1, r: .056, rr: .066, ww: .05, wx: .13, wz: .17 },
  { id: 'fourgon', top: 11, acc: 29, grip: 8.6, turn: 3.2, r: .062, rr: .062, ww: .05, wx: .115, wz: .15 },
  { id: 'coccinelle', top: 11.1, acc: 30, grip: 9.2, turn: 3.6, r: .062, rr: .062, ww: .05, wx: .115, wz: .14 },
  { id: 'rallye', top: 11.8, acc: 27, grip: 9.6, turn: 3.3, r: .064, rr: .064, ww: .052, wx: .12, wz: .145 },
];
const BOTS = [['turbo', 0xe8384f], ['frelon', 0xf2c230], ['mistral', 0x3a8ef0], ['grillon', 0x45c060], ['pétard', 0xb05ae0], ['zigzag', 0xf08a2a], ['bolide', 0x2ac0c0]];
const ITEMS = {
  fw: 'feu d\'artifice', wb: 'ballons d\'eau', sw: 'onde de choc', oil: 'flaque d\'huile', ep: 'pulse électrique',
  bomb: 'bombe', tb: 'batterie turbo', fk: 'faux bonus', star: 'pulse global',
};
// what a pickup gives: the leaders get traps, the back of the pack the big guns
const TABLE = [
  ['oil', 3, 1], ['fk', 2, .5], ['wb', 3, 2], ['bomb', 1.5, 1.5], ['sw', 1.5, 2.5], ['ep', 1, 2],
  ['fw', 1.5, 3], ['tb', 1, 3], ['star', 0, .7],
];

const clamp = THREE.MathUtils.clamp;

function canvasTex(w, h, draw) { return V.paintTex(w, h, draw); }
const glowTex = (() => { let t; return () => t ??= canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }); })();
function boltTex(fill = '#ffd21f') {
  return canvasTex(128, 128, (g) => {
    g.beginPath(); g.moveTo(74, 6); g.lineTo(28, 72); g.lineTo(60, 72); g.lineTo(48, 122); g.lineTo(100, 50); g.lineTo(66, 50); g.lineTo(84, 6); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#1a130d'; g.stroke(); g.fillStyle = fill; g.fill();
  });
}
function tagTex(text, color) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(11,13,18,.62)'; g.beginPath(); g.roundRect(8, 10, 240, 44, 22); g.fill();
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.font = '700 30px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1);
  });
}

// ---------- the cars: six little RC models, a body that bounces on its springs, an antenna ----------
function carModel(kind, color, num) {
  const K = KINDS[kind];
  const g = new THREE.Group(), shell = new THREE.Group(); g.add(shell);
  const base = new THREE.Color(color), hsl = {}; base.getHSL(hsl);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .28, metalness: .25 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((hsl.h + .5) % 1, .75, .55), roughness: .35 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(.4), roughness: .5 });
  const white = V.mat(0xf4f1ea, { roughness: .4 }), trim = V.TRIM(), chrome = V.CHROME(), glass = V.glass(false);
  const head = V.lamp(0xfff2c8, 2.2), tail = V.lamp(0xff2a20, 2.2);
  const put = (geo, m, x, y, z, p = shell) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  const rb = V.roundBox, ball = (r) => new THREE.SphereGeometry(r, 10, 8);
  let ant = [.07, .16, -.15], top = [0, .2, 0], lamps = [.1, .21, .08, .2];   // lamp: y, z front, x, z back
  if (K.id === 'buggy') {
    put(rb(.16, .02, .4, .008), trim, 0, .06, 0);
    put(rb(.17, .07, .26, .03), paint, 0, .1, 0);
    put(rb(.13, .05, .11, .02), paint, 0, .085, .17).rotation.x = .3;
    put(rb(.12, .07, .1, .02), V.mat(0x3a3c44, { metalness: .6, roughness: .35 }), 0, .11, -.14);
    for (const x of [-.06, .06]) for (const z of [.05, -.07]) put(new THREE.CylinderGeometry(.005, .005, .12, 5), trim, x, .19, z);
    for (const z of [.05, -.07]) put(rb(.13, .012, .012, .005), trim, 0, .25, z);
    for (const x of [-.06, .06]) put(rb(.012, .012, .13, .005), trim, x, .25, -.01);
    put(ball(.035), accent, 0, .18, -.01);
    put(rb(.26, .012, .09, .005), accent, 0, .24, -.19);
    for (const x of [-.05, .05]) put(rb(.008, .08, .03, .003), trim, x, .19, -.17);
    put(rb(.2, .02, .02, .008), trim, 0, .06, .23);
    ant = [.06, .13, -.15]; top = [0, .255, -.19]; lamps = [.1, .22, .04, -.2];
  } else if (K.id === 'monstre') {
    put(rb(.14, .03, .34, .01), trim, 0, .12, 0);
    for (const x of [-.11, .11]) for (const z of [-.15, .15]) put(new THREE.CylinderGeometry(.012, .012, .09, 6), chrome, x, .15, z);
    put(rb(.26, .09, .4, .035), paint, 0, .24, 0);
    put(rb(.262, .02, .402, .008), accent, 0, .245, 0);
    put(rb(.2, .085, .18, .03), paint, 0, .315, -.04);
    put(rb(.206, .045, .13, .01), glass, 0, .32, -.04);
    const ws = put(rb(.17, .055, .012, .005), glass, 0, .315, .052); ws.rotation.x = -.35;
    put(rb(.16, .02, .03, .008), trim, 0, .365, .02);
    for (const x of [-.05, 0, .05]) put(ball(.011), head, x, .365, .036);
    put(rb(.25, .03, .03, .01), chrome, 0, .2, .21); put(rb(.25, .03, .03, .01), chrome, 0, .2, -.21);
    ant = [.1, .28, -.17]; top = [0, .36, -.08]; lamps = [.24, .2, .09, -.2];
  } else if (K.id === 'formule') {
    put(rb(.2, .015, .42, .006), trim, 0, .035, 0);
    put(rb(.09, .05, .34, .02), paint, 0, .07, .02);
    put(rb(.06, .035, .14, .015), paint, 0, .06, .24);
    put(rb(.27, .01, .05, .004), accent, 0, .03, .31);
    for (const x of [-.13, .13]) put(rb(.008, .035, .06, .003), paint, x, .04, .31);
    for (const x of [-.07, .07]) put(rb(.05, .045, .16, .02), paint, x, .065, -.03);
    put(rb(.07, .02, .08, .008), trim, 0, .1, .03);
    put(ball(.028), accent, 0, .115, .02);
    put(rb(.04, .05, .07, .015), paint, 0, .12, -.06);
    put(rb(.22, .012, .06, .005), accent, 0, .16, -.21);
    for (const x of [-.11, .11]) put(rb(.008, .06, .07, .003), paint, x, .14, -.21);
    put(rb(.01, .07, .02, .004), trim, 0, .12, -.19);
    ant = [.04, .1, -.12]; top = [0, .098, .12]; lamps = [.06, .31, .035, -.24];
  } else if (K.id === 'fourgon') {
    put(rb(.22, .19, .42, .04), paint, 0, .18, 0);
    put(rb(.224, .03, .36, .01), accent, 0, .13, 0);
    const ws = put(rb(.19, .08, .02, .01), glass, 0, .22, .2); ws.rotation.x = -.15;
    put(rb(.223, .06, .22, .01), glass, 0, .23, .03);
    put(rb(.18, .015, .24, .006), trim, 0, .285, -.04);
    put(rb(.23, .03, .03, .01), trim, 0, .085, .215); put(rb(.23, .03, .03, .01), trim, 0, .085, -.215);
    ant = [.08, .28, -.17]; top = [0, .29, -.04]; lamps = [.12, .211, .08, -.211];
  } else if (K.id === 'coccinelle') {
    const b = put(new THREE.SphereGeometry(.12, 22, 14), paint, 0, .115, 0); b.scale.set(.95, .8, 1.72);
    const cab = put(new THREE.SphereGeometry(.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, .16, -.03); cab.scale.set(1, .95, 1.35);
    const roof = put(new THREE.SphereGeometry(.078, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, .176, -.035); roof.scale.set(1, .75, 1.25);
    for (const x of [-.1, .1]) for (const z of [-.14, .14]) put(ball(.052), dark, x, .09, z).scale.set(.8, .9, 1.1);
    put(rb(.25, .012, .16, .005), trim, 0, .045, 0);
    ant = [.06, .2, -.13]; top = [0, .235, -.04]; lamps = [.13, .185, .07, -.2];
  } else {
    put(rb(.22, .08, .4, .03), paint, 0, .11, 0);
    put(rb(.19, .08, .22, .035), paint, 0, .185, -.03);
    put(rb(.196, .045, .18, .01), glass, 0, .19, -.03);
    const ws = put(rb(.17, .05, .012, .005), glass, 0, .19, .08); ws.rotation.x = -.5;
    put(rb(.2, .012, .05, .005), accent, 0, .235, -.14);
    put(rb(.14, .03, .025, .008), trim, 0, .235, .05);
    for (const x of [-.045, -.015, .015, .045]) put(ball(.01), head, x, .235, .063);
    put(rb(.222, .025, .41, .008), accent, 0, .1, 0);
    ant = [.07, .22, -.13]; top = [0, .23, -.03]; lamps = [.11, .2, .08, -.2];
  }
  // lights, the number on the roof
  for (const s of [-1, 1]) { put(ball(.014), head, s * lamps[2], lamps[0], lamps[1]); put(rb(.03, .014, .01, .004), tail, s * lamps[2], lamps[0], lamps[3]); }
  const numTex = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill(); c.lineWidth = 4; c.strokeStyle = '#15121c'; c.stroke(); c.fillStyle = '#15121c'; c.font = '900 40px Rubik, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(num), 32, 35); });
  const disc = put(new THREE.CircleGeometry(.035, 18), new THREE.MeshBasicMaterial({ map: numTex }), top[0], top[1] + .004, top[2]); disc.rotation.x = -Math.PI / 2;
  // the antenna: a whip on a spring, a little ball on top
  const antenna = new THREE.Group(); antenna.position.set(...ant); shell.add(antenna);
  put(new THREE.CylinderGeometry(.0022, .0035, .26, 5), trim, 0, .13, 0, antenna);
  put(ball(.011), accent, 0, .262, 0, antenna);
  // turbo flames, electro aura
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60b0ff).multiplyScalar(2.4), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = put(new THREE.ConeGeometry(.03, .16, 10, 1, true), flameMat, 0, .09, -.27); flame.rotation.x = -Math.PI / 2; flame.visible = false;
  const aura = put(new THREE.IcosahedronGeometry(.34, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ad0ff).multiplyScalar(1.8), wireframe: true, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }), 0, .12, 0, g);
  aura.visible = false;
  // wheels: front pair on steering pivots
  const wheels = [], steerers = [];
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const r = sz > 0 ? K.r : K.rr;
    const piv = new THREE.Group(); piv.position.set(sx * K.wx, r, sz * K.wz); g.add(piv);
    const wh = V.wheel({ r, w: K.ww, spokes: 5 }); wh.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; piv.add(wh);
    wheels.push(wh); if (sz > 0) steerers.push(piv);
  }
  g.traverse(o => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = true; });
  const roll = V.spring(160, 9), pitch = V.spring(150, 8), bob = V.spring(260, 7), aX = V.spring(90, 2.2), aZ = V.spring(90, 2.2);
  let st = 0, last = 0, clock = Math.random() * 9;
  return {
    g, K, aura, flame,
    kick(v) { bob.kick(-v * .12); aX.kick(v * 1.5); aZ.kick((Math.random() - .5) * v); },
    anim(dt, speed, steer, lat, boost, grounded) {
      clock += dt;
      const acc = clamp((speed - last) / Math.max(dt, 1e-3), -60, 60); last = speed;
      st += (steer - st) * Math.min(1, dt * 16);
      for (const w of wheels) w.spin.rotation.z += (w.rotation.y > 0 ? 1 : -1) * speed * dt / w.radius;
      for (const p of steerers) p.rotation.y = st * .5;
      const fast = Math.min(1, Math.abs(speed) / 10);
      shell.rotation.z = roll.step(grounded ? clamp(-lat * .05, -.14, .14) + st * fast * .06 : 0, dt);
      shell.rotation.x = pitch.step(grounded ? clamp(-acc * .004, -.12, .12) : 0, dt);
      shell.position.y = bob.step(grounded ? Math.sin(clock * 31) * .002 * fast : .01, dt);
      antenna.rotation.x = aX.step(clamp(acc * .012, -.6, .6) + shell.rotation.x, dt);
      antenna.rotation.z = aZ.step(clamp(lat * .08, -.5, .5), dt);
      flame.visible = boost; if (boost) flame.scale.set(1, .7 + Math.random() * .7, 1);
    },
  };
}

function starTex() {
  return canvasTex(128, 128, (g) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 26 : 58; g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
    g.closePath(); g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#1a130d'; g.stroke(); g.fillStyle = '#ffd21f'; g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(52, 50, 10, 6, -.6, 0, 7); g.fill();
  });
}
const BLOCKC = [0xe8384f, 0xf2c230, 0x3a8ef0, 0x45c060, 0xf08a2a, 0xb05ae0, 0xf6f2ea];

export function createRC({ scene, camera, audio, ui, world, terrain }) {
  void terrain;   // every place used is well clear of the plot and its hole
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const dyn = new THREE.Group(); root.add(dyn);
  const GROUPS = {};
  let act = null, mode = 'course';
  // the course
  let N = 1000, CP = 80, LEN = 0, pts, tang, side, wd, vmax, shorts = [];
  let grass = null;
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function grp(name) {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    return GROUPS[name] = { name, g, ramps: [], banks: [], pipes: [], bumps: [], waters: [], loops: [], boxes: [], roofs: [], pickups: [], cones: [], stars: [], spawns: [], nav: [], inst: [], mowed: [], wps: [], built: false };
  }
  function mow(A, on) { if (!grass || !A?.mowed.length) return; for (const [i, m] of A.mowed) grass.setMatrixAt(i, on ? ZERO : m); grass.instanceMatrix.needsUpdate = true; }
  function findGrass() { if (!grass) scene.traverse(o => { if (!grass && o.isInstancedMesh && o.count > 5000 && o.material.vertexColors) grass = o; }); }
  function mowWhere(A, f) {
    findGrass(); if (!grass) return;
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (let i = 0; i < grass.count; i++) { grass.getMatrixAt(i, m); v.setFromMatrixPosition(m); if (f(v.x, v.z)) A.mowed.push([i, m.clone()]); }
  }

  // ---------- the ground: street, kerbs, the square's paving, then the pieces ----------
  const yawOf = (i) => Math.atan2(tang[i].x, tang[i].z);
  // a box you bump into: centre, half sizes (hx across, hz along the yaw), yaw, height range
  const addBox = (A, x, z, hx, hz, yaw, y0, y1, roof = false) => { const b = { x, z, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1 }; (roof ? A.roofs : A.boxes).push(b); return b; };
  const segBox = (A, x0, z0, x1, z1, th, y0, y1) => addBox(A, (x0 + x1) / 2, (z0 + z1) / 2, th / 2, Math.hypot(x1 - x0, z1 - z0) / 2, Math.atan2(x1 - x0, z1 - z0), y0, y1);
  function baseH(x, z) {
    let h = 0;
    const dz = z - ROAD_Z, ax = Math.abs(x);
    if (Math.abs(dz) < 1.57) h = .015;
    else if (dz >= 1.57 && dz < 1.71) h = ax > 6 ? .1 : .012;
    else if (dz >= 1.71 && dz < 2.33) h = ax > 6 ? .05 : .012;
    else if (dz <= -1.57 && dz > -1.71) h = .1;
    else if (dz <= -1.71 && dz > -3.1) h = .05;
    if (x > 44 && x < 78 && z > -10.78 && z < 14) h = .1;
    return h;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function bankH(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz, r = Math.hypot(dx, dz);
    if (r < b.r0 || r > b.r1 + .25) return -1;
    let t = Math.atan2(dz, dx) - b.a0; t -= Math.floor(t / (2 * PI)) * 2 * PI;
    const span = b.a1 - b.a0;
    if (t > span) return -1;
    const k = span > 6.2 ? 1 : smooth(Math.min(1, t / .45, (span - t) / .45));
    return b.h * Math.pow(Math.min(1, (r - b.r0) / (b.r1 - b.r0)), 1.8) * k;
  }
  function pipeH(p, x, z) {
    const lx = x - p.x, lz = z - p.z, u = lx * p.fx + lz * p.fz, v = Math.abs(lx * p.fz - lz * p.fx);
    if (Math.abs(u) > p.len / 2 || v > p.w / 2 + .3) return -1;
    return p.h * Math.pow(clamp((v - p.flat / 2) / (p.w / 2 - p.flat / 2), 0, 1), 2);
  }
  function groundH(x, z) {
    let h = baseH(x, z);
    const A = act; if (!A) return h;
    for (const w of A.waters) {
      if (w.r ? Math.hypot(x - w.x, z - w.z) < w.r : x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) { h = -w.d; break; }
    }
    for (const r of A.ramps) {
      const lx = x - r.x, lz = z - r.z;
      if (Math.abs(lx) > r.len + r.w || Math.abs(lz) > r.len + r.w) continue;
      const u = lx * r.fx + lz * r.fz, v = lx * r.fz - lz * r.fx;
      if (Math.abs(v) < r.w / 2 && u > -r.len / 2 && u < r.len / 2) h = Math.max(h, r.h0 + (r.h1 - r.h0) * (u + r.len / 2) / r.len);
    }
    for (const b of A.banks) { const q = bankH(b, x, z); if (q > 0) h = Math.max(h, q + b.base); }
    for (const p of A.pipes) { const q = pipeH(p, x, z); if (q >= 0) h = Math.max(h, q + p.base); }
    for (const b of A.bumps) { const d = Math.hypot(x - b.x, z - b.z); if (d < b.r) h = Math.max(h, b.base + b.h * (.5 + .5 * Math.cos(PI * d / b.r))); }
    return h;
  }
  const inWater = (x, z) => act.waters.find(w => w.r ? Math.hypot(x - w.x, z - w.z) < w.r : x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);

  // ---------- materials and little builders shared by every place ----------
  const plank = V.mat(0xc49a6c, { roughness: .8 });
  const BOOKS = [0xb8573a, 0x3a6ea8, 0x4f8a3a, 0xd9a125, 0x7a4a8a, 0xe8e0cc];
  const cardTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#c49a6c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,60,30,.13)'; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 3, h); c.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 0; y < h; y += 64) c.fillRect(0, y, w, 4); c.fillStyle = 'rgba(40,30,20,.5)'; c.font = '700 22px Rubik, sans-serif'; c.fillText('↑ FRAGILE ↑', 60, 140); });
  cardTex.wrapS = cardTex.wrapT = THREE.RepeatWrapping;
  const card = new THREE.MeshLambertMaterial({ map: cardTex, side: THREE.DoubleSide });
  const cardPlain = V.mat(0xbf9464, { roughness: .9 });
  const tape = canvasTex(16, 64, (g) => { g.fillStyle = '#e8384f'; g.fillRect(0, 0, 16, 32); g.fillStyle = '#f6f2ea'; g.fillRect(0, 32, 16, 32); });
  tape.wrapS = tape.wrapT = THREE.RepeatWrapping;
  const tapeMat = new THREE.MeshLambertMaterial({ map: tape, polygonOffset: true, polygonOffsetFactor: -2 });
  const put = (p, geo, m, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (shadow) o.castShadow = true; p.add(o); return o; };
  // books and a plank: a ramp from h0 to h1 (flat when equal)
  function ramp(A, x, z, yaw, len, w, h0, h1, { books = true, mat = plank } = {}) {
    const base = baseH(x, z), r = { x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), len, w, h0: h0 + base, h1: h1 + base };
    A.ramps.push(r);
    const g = new THREE.Group(); g.position.set(x, base, z); g.rotation.y = yaw; A.g.add(g);
    const ang = Math.atan2(h1 - h0, len), L = Math.hypot(h1 - h0, len);
    const p = put(g, V.roundBox(w, .022, L, .008), mat, 0, (h0 + h1) / 2 - .011, 0); p.rotation.x = -ang;
    if (books) for (const [u, hh] of [[len / 2 - .14, h1], [-len / 2 + .14, h0]]) {
      let y = 0, k = 0;
      while (y < hh - .03) { const bh = Math.min(.045 + (k % 3) * .012, hh - y - .012); const b = put(g, V.roundBox(Math.min(w * (.8 + (k % 2) * .15), .5), bh, .26, .006), V.mat(BOOKS[(k + Math.round(x * 3)) % BOOKS.length], { roughness: .7 }), (k % 2 - .5) * .04, y + bh / 2, u); b.rotation.y = (k % 3 - 1) * .08; y += bh; k++; }
      if (w > .6 && hh > .03) for (const sx of [-1, 1]) { let y2 = 0, k2 = 0; while (y2 < hh - .03) { const bh = Math.min(.05, hh - y2 - .012); put(g, V.roundBox(.2, bh, .26, .006), V.mat(BOOKS[(k2 + 2) % BOOKS.length], { roughness: .7 }), sx * (w / 2 - .12), y2 + bh / 2, u); y2 += bh; k2++; } }
    }
    const sh = V.contactShadow(w + .3, len + .3, .3); g.add(sh);
    return r;
  }
  // a wooden crate or a pile of big books: a platform to drive onto
  function crate(A, x, z, yaw, w, d, h, color = 0xa87a4a) {
    const base = baseH(x, z);
    A.ramps.push({ x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), len: d, w, h0: h + base, h1: h + base });
    const g = new THREE.Group(); g.position.set(x, base, z); g.rotation.y = yaw; A.g.add(g);
    const wood = V.mat(color, { roughness: .8 });
    put(g, V.roundBox(w, h, d, .02), wood, 0, h / 2, 0);
    for (const s of [-1, 1]) { put(g, V.roundBox(w + .01, .04, .04, .01), V.mat(0x7a5232), 0, h * .5, s * (d / 2 - .02)); put(g, V.roundBox(.04, .04, d + .01, .01), V.mat(0x7a5232), s * (w / 2 - .02), h * .5, 0); }
    g.add(V.contactShadow(w + .4, d + .4, .4));
    A.nav.push({ x, z, hx: w / 2 + .2, hz: d / 2 + .2, c: Math.cos(yaw), s: Math.sin(yaw) });
  }
  // a grid surface following a height function (banks, pipes, cushions)
  function surface(A, nu, nv, f, m) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [x, y, z] = f(i / nu, j / nv); pos.push(x, y, z); uv.push(i / nu * 4, j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m); o.receiveShadow = true; o.castShadow = true; A.g.add(o); return o;
  }
  // a banked cardboard curve: a ring sector that rises to the outside, walled at the edge
  function bank(A, cx, cz, r0, r1, a0, a1, h, wall = true) {
    const b = { cx, cz, r0, r1, a0, a1, h, base: baseH(cx, cz) };
    A.banks.push(b);
    const span = a1 - a0, na = Math.ceil(span * r1 / .35);
    surface(A, na, 10, (i, j) => { const a = a0 + span * i, r = r0 + (r1 + .25 - r0) * j, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return [x, Math.max(0, bankH(b, x, z)) + b.base + .012, z]; }, card);
    if (!wall) return b;
    const rw = r1 + .27, pos = [], idx = [];
    for (let i = 0; i <= na; i++) {
      const a = a0 + span * i / na, x = cx + Math.cos(a) * rw, z = cz + Math.sin(a) * rw, top = Math.max(.1, bankH(b, cx + Math.cos(a) * r1, cz + Math.sin(a) * r1)) + .14;
      pos.push(x, 0, z, x, top + b.base, z); if (i < na) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const wm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xa87c52, side: THREE.DoubleSide })); wm.castShadow = true; A.g.add(wm);
    const ns = Math.ceil(span * rw / .6);
    for (let i = 0; i < ns; i++) {
      const a = a0 + span * (i + .5) / ns, x = cx + Math.cos(a) * (rw + .05), z = cz + Math.sin(a) * (rw + .05);
      addBox(A, x, z, .06, span * rw / ns / 2 + .03, Math.atan2(-Math.sin(a), Math.cos(a)), 0, 1.2);
    }
    return b;
  }
  // a cardboard half-pipe along its axis
  function pipe(A, x, z, yaw, len, w, flat, h) {
    const p = { x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), len, w, flat, h, base: baseH(x, z) };
    A.pipes.push(p);
    surface(A, 12, 24, (i, j) => { const u = (i - .5) * len, v = (j - .5) * (w + .6), X = x + p.fx * u + p.fz * v, Z = z + p.fz * u - p.fx * v; return [X, pipeH(p, X, Z) + p.base + .012, Z]; }, card);
    for (const s of [-1, 1]) {
      const v = s * (w / 2 + .38), cxw = x + p.fz * v, czw = z - p.fx * v;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(.05, h + .2, len), cardPlain); wall.position.set(cxw, (h + .2) / 2 + p.base, czw); wall.rotation.y = yaw; wall.castShadow = true; A.g.add(wall);
      addBox(A, cxw, czw, .05, len / 2, yaw, 0, 1.5);
      A.nav.push({ x: cxw, z: czw, hx: .3, hz: len / 2 + .2, c: Math.cos(yaw), s: Math.sin(yaw) });
    }
    return p;
  }
  // a sofa cushion to drive over
  function cushion(A, x, z, r, h, color = 0xc8584a) {
    const b = { x, z, r, h, base: baseH(x, z) }; A.bumps.push(b);
    const fab = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 64; k += 8) { c.fillRect(k, 0, 3, 64); c.fillRect(0, k, 64, 3); } });
    surface(A, 32, 10, (i, j) => { const a = i * 2 * PI, d = j * r; return [x + Math.cos(a) * d, b.base + b.h * (.5 + .5 * Math.cos(PI * d / r)) + .01, z + Math.sin(a) * d]; }, new THREE.MeshLambertMaterial({ color, map: fab }));
    const pip = new THREE.Mesh(new THREE.TorusGeometry(r * .98, .025, 6, 40), V.mat(0xf2c230)); pip.rotation.x = PI / 2; pip.position.set(x, b.base + .02, z); A.g.add(pip);
    return b;
  }
  // the cardboard loop: a strip bent in a circle, shifted sideways so the exit clears the entry
  function loop(A, x, z, yaw, Rl = .75, shift = .6) {
    const L = { x, z, yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), R: Rl, shift };
    L.rx = L.fz; L.rz = -L.fx;
    A.loops.push(L);
    const W = .62, pos = [], idx = [], S = 64;
    for (let k = 0; k <= S; k++) {
      const t = k / S * 2 * PI, u = Rl * Math.sin(t), y = Rl * (1 - Math.cos(t)) + .005, v = shift * k / S;
      for (const o of [-W / 2, W / 2]) pos.push(x + L.fx * u + L.rx * (v + o), y, z + L.fz * u + L.rz * (v + o));
      if (k < S) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const band = new THREE.Mesh(geo, card); band.castShadow = true; A.g.add(band);
    // two pencils hold it up, and a flag on top
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; A.g.add(g);
    for (const sx of [-W / 2 - .12, shift + W / 2 + .12]) {
      put(g, new THREE.CylinderGeometry(.03, .03, 2 * Rl + .2, 6), V.mat(0xf2c230), sx, Rl + .1, 0);
      addBox(A, x + L.rx * sx, z + L.rz * sx, .05, .05, 0, 0, 2);
    }
    put(g, V.roundBox(shift + W + .3, .03, .06, .01), V.mat(0x2a2b33), shift / 2, 2 * Rl + .2, 0);
    // guides at the mouth
    for (const [v, u0, u1] of [[-W / 2 - .06, -2.4, -.15], [shift + W / 2 + .06, .15, 2.4]]) {
      const cx = x + L.fx * (u0 + u1) / 2 + L.rx * v, cz = z + L.fz * (u0 + u1) / 2 + L.rz * v;
      const b = new THREE.Mesh(V.roundBox(.06, .18, u1 - u0, .02), cardPlain); b.position.set(cx, .09, cz); b.rotation.y = yaw; b.castShadow = true; A.g.add(b);
      addBox(A, cx, cz, .04, (u1 - u0) / 2, yaw, 0, .4);
    }
    g.add(V.contactShadow(W + shift + .6, 2 * Rl + .6, .35));
    return L;
  }
  // toy blocks and cardboard boxes in a row: the barriers the kids put up
  const blockGeo = V.roundBox(.28, .28, .28, .04), boxGeo = new THREE.BoxGeometry(.5, .42, .5);
  const blockMat = new THREE.MeshStandardMaterial({ roughness: .45 }), boxMat = new THREE.MeshLambertMaterial({ map: cardTex, color: 0xffffff });
  function blocks(A, x0, z0, x1, z1, { rows = 1, big = false, collide = true, h = 1.2 } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0), s = big ? .54 : .3, n = Math.max(1, Math.round(len / s)), yaw = Math.atan2(x1 - x0, z1 - z0);
    const rnd = (k) => { const q = Math.sin(k * 12.9898 + x0 * 78.233 + z0 * 3.1) * 43758.5; return q - Math.floor(q); };
    for (let k = 0; k < n; k++) for (let r = 0; r < rows; r++) {
      if (r && rnd(k + 9) < .4) continue;
      const t = (k + .5) / n, m = new THREE.Matrix4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, baseH(x0, z0) + (big ? .21 : .14) + r * (big ? .42 : .28), z0 + (z1 - z0) * t), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (rnd(k * 3 + r) - .5) * .3, 0)), new THREE.Vector3(1, 1, 1));
      A.inst.push({ big, m, c: big ? 0xffffff : BLOCKC[Math.floor(rnd(k * 7 + r) * BLOCKC.length)] });
    }
    if (collide) { segBox(A, x0, z0, x1, z1, s, 0, h); A.nav.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: s / 2 + .3, hz: len / 2 + .3, c: Math.cos(yaw), s: Math.sin(yaw) }); }
  }
  function flushInst(A) {
    for (const big of [false, true]) {
      const l = A.inst.filter(q => q.big === big); if (!l.length) continue;
      const im = new THREE.InstancedMesh(big ? boxGeo : blockGeo, big ? boxMat : blockMat, l.length);
      l.forEach((q, i) => { im.setMatrixAt(i, q.m); im.setColorAt(i, new THREE.Color(q.c)); });
      im.castShadow = true; im.receiveShadow = true; A.g.add(im);
    }
    A.inst = [];
  }
  // a white picket fence
  function pickets(A, x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), n = Math.round(len / .16);
    const white = V.mat(0xf4f1ea, { roughness: .6 });
    const im = new THREE.InstancedMesh(V.roundBox(.07, .5, .025, .01), white, n);
    for (let k = 0; k < n; k++) { const t = (k + .5) / n; im.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, .25, z0 + (z1 - z0) * t), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + PI / 2, 0)), new THREE.Vector3(1, 1, 1))); }
    im.castShadow = true; A.g.add(im);
    for (const y of [.14, .38]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.03, .05, len), white); r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = yaw; A.g.add(r); }
    segBox(A, x0, z0, x1, z1, .12, 0, 1.2);
  }
  // a green wheelie bin
  function bin(A, x, z, yaw = 0) {
    const g = new THREE.Group(); g.position.set(x, baseH(x, z), z); g.rotation.y = yaw; A.g.add(g);
    put(g, V.roundBox(.58, .9, .66, .04), V.mat(0x2f6a3a, { roughness: .5 }), 0, .47, 0);
    put(g, V.roundBox(.62, .05, .72, .02), V.mat(0x255a30), 0, .95, .02);
    for (const s of [-1, 1]) { const w = put(g, new THREE.CylinderGeometry(.08, .08, .05, 12), V.RUBBER(), s * .27, .08, -.3); w.rotation.z = PI / 2; }
    addBox(A, x, z, .31, .35, yaw, 0, 1);
  }
  // a little road sign on a post
  function sign(A, x, z, yaw, text, bg = '#ffb020', fg = '#1a130d') {
    const g = new THREE.Group(); g.position.set(x, baseH(x, z), z); g.rotation.y = yaw; A.g.add(g);
    const t = canvasTex(256, 96, (c, w, h) => { c.fillStyle = bg; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 14); c.fill(); c.lineWidth = 6; c.strokeStyle = fg; c.stroke(); c.fillStyle = fg; c.font = '900 38px Rubik, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2); });
    const m = new THREE.MeshLambertMaterial({ map: t });
    put(g, new THREE.BoxGeometry(.8, .3, .02), [cardPlain, cardPlain, cardPlain, cardPlain, m, m], 0, .5, 0);
    put(g, new THREE.CylinderGeometry(.015, .015, .5, 5), V.mat(0x7a5232), 0, .25, -.02);
    addBox(A, x, z, .04, .04, 0, 0, .6);
  }
  // a floating lightning bolt, three abreast
  const boltMat = new THREE.MeshBasicMaterial({ map: boltTex(), transparent: true, side: THREE.DoubleSide, color: new THREE.Color(1.7, 1.6, 1.3), depthWrite: false });
  const haloMat = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, color: new THREE.Color(1.4, 1.1, .3), depthWrite: false, blending: THREE.AdditiveBlending });
  function pickup(A, x, z) {
    const y = groundH(x, z), g = new THREE.Group(); g.position.set(x, y, z); A.g.add(g);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), boltMat); b.position.y = .2; g.add(b);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), haloMat); h.rotation.x = -PI / 2; h.position.y = .02; g.add(h);
    A.pickups.push({ g, b, p: new THREE.Vector3(x, y, z), off: 0 });
  }
  const starMat = new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false });
  const starGlow = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1.1, .85, .25), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  function starMesh(size = .42) { const g = new THREE.Group(); const h = new THREE.Sprite(starGlow); h.scale.setScalar(size * 1.7); g.add(h); const s = new THREE.Sprite(starMat); s.scale.setScalar(size); s.renderOrder = 2; g.add(s); g.userData.s = s; return g; }
  // a cone to knock about
  const coneGeo = new THREE.ConeGeometry(.05, .17, 12), coneBase = V.roundBox(.12, .014, .12, .005), coneBand = new THREE.CylinderGeometry(.034, .04, .03, 12);
  const orange = V.mat(0xff6a1a, { roughness: .5 }), whiteM = V.mat(0xf6f2ea);
  function cone(A, x, z) {
    const y = baseH(x, z), g = new THREE.Group(); g.position.set(x, y, z); A.g.add(g);
    const c = new THREE.Mesh(coneGeo, orange); c.position.y = .098; const b = new THREE.Mesh(coneBase, orange); b.position.y = .007; const band = new THREE.Mesh(coneBand, whiteM); band.position.y = .1;
    g.add(c, b, band); g.traverse(o => { o.castShadow = true; });
    A.cones.push({ g, home: g.position.clone(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), hit: false });
  }
  // the town's walls, trees, posts and benches, where they matter; a bench becomes two feet
  // and a seat to drive under
  function importWorld(A, keep) {
    for (const c of world.colliders) {
      if (c.max.y < .02 || c.min.y > .5) continue;
      const w = c.max.x - c.min.x, d = c.max.z - c.min.z;
      if (w > 70 || d > 70) continue;
      const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
      if (!keep(cx, cz, Math.max(w, d) / 2)) continue;
      const benchX = Math.abs(c.max.y - .8) < .06 && Math.abs(w - 1.8) < .06 && Math.abs(d - .6) < .06;
      const benchZ = Math.abs(c.max.y - .8) < .06 && Math.abs(d - 1.8) < .06 && Math.abs(w - .6) < .06;
      if (benchX || benchZ) {
        for (const s of [-1, 1]) addBox(A, cx + (benchX ? s * .82 : 0), cz + (benchZ ? s * .82 : 0), benchX ? .07 : d / 2, benchX ? d / 2 : .07, 0, 0, .8);
        addBox(A, cx, cz, w / 2, d / 2, 0, .42, .8, true);
        continue;
      }
      if (Math.abs(cx - 8) < .2 && Math.abs(cz - 22) < .2) {
        // the picnic table: two leg panels, benches and top overhead
        for (const s of [-1, 1]) addBox(A, 8 + s * .8 * Math.cos(.3), 22 - s * .8 * Math.sin(.3), .05, .9, .3, 0, .8);
        addBox(A, 8, 22, 1, .45, .3, .42, .8, true);
        continue;
      }
      addBox(A, cx, cz, w / 2, d / 2, 0, c.min.y, c.max.y);
    }
  }
  const nearPts = (list, r) => {
    const cell = new Map(), key = (i, j) => i * 10000 + j;
    for (const p of list) { const k = key(Math.floor(p.x / 4), Math.floor(p.z / 4)); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); }
    return (x, z, e = 0) => {
      const rr = r + e, i0 = Math.floor((x - rr) / 4), i1 = Math.floor((x + rr) / 4), j0 = Math.floor((z - rr) / 4), j1 = Math.floor((z + rr) / 4);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const p of cell.get(key(i, j)) || []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < rr * rr) return true;
      return false;
    };
  };

  // ---------- the course through the town ----------
  function nearestAll(x, z) { let b = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; }
  function nearest(x, z, from, win = 120) {
    let b = from, bd = Infinity;
    for (let d = -win; d <= win; d++) { const i = (from + d + N) % N, q = pts[i]; const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bd) { bd = dd; b = i; } }
    return b;
  }
  function buildCourse() {
    const A = grp('course'); act = A;
    const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    LEN = curve.getLength(); N = Math.round(LEN / SP); CP = Math.round(CP_M / SP);
    pts = curve.getSpacedPoints(N); pts.pop();
    tang = pts.map((p, i) => pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize());
    side = tang.map(t => new THREE.Vector3(-t.z, 0, t.x));
    wd = pts.map(p => { let b = 0, bd = Infinity; CTRL.forEach((c, k) => { const d = (c[0] - p.x) ** 2 + (c[1] - p.z) ** 2; if (d < bd) { bd = d; b = k; } }); return CTRL[b][2]; });
    // how fast a bot can take each metre: from the bend, then braking back from the next
    const speedProfile = (P, closed, W) => {
      const n = P.length, k = Math.round(1.5 / SP), yw = (i) => { const a = P[Math.min(n - 1, Math.max(0, i))], b = P[Math.min(n - 1, Math.max(0, i + 1))]; return Math.atan2(b.x - a.x, b.z - a.z); };
      const at = (i) => closed ? (i + n) % n : Math.min(n - 1, Math.max(0, i));
      const v = P.map((p, i) => { const d = Math.abs(wrap(yw(at(i + k)) - yw(at(i - k)))); let s = Math.min(12.5, 2.25 * 3 / Math.max(d, 1e-3)); if (W && W[i] < .5) s = Math.min(s, 7.2); return s; });
      for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) { const j = closed ? (i + 1) % n : Math.min(n - 1, i + 1); v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * 15 * SP)); }
      return v;
    };
    vmax = speedProfile(pts, true, wd);
    {
      const sc = new THREE.CatmullRomCurve3(SHORT.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
      const K = Math.round(sc.getLength() / SP), sp = sc.getSpacedPoints(K);
      const a = nearestAll(...SHORT[0]), b = nearestAll(...SHORT[SHORT.length - 1]), span = (b - a + N) % N;
      const sv = speedProfile(sp, false);
      sp.forEach((p, k) => { if (Math.abs(p.z + 3.4) < 2.6 && Math.abs(p.x + 47.25) < 1) sv[k] = Math.min(sv[k], 6); });
      for (let i = sp.length - 2; i >= 0; i--) sv[i] = Math.min(sv[i], Math.sqrt(sv[i + 1] ** 2 + 2 * 15 * SP));
      shorts = [{ pts: sp, map: sp.map((_, k) => (a + Math.round(span * k / K)) % N), a, b, span, K, vmax: sv, len: sc.getLength() }];
    }
    const all = [...pts, ...shorts[0].pts];
    const near = nearPts(all, 9), near2 = nearPts(all, 2.3);
    importWorld(A, (x, z, r) => near(x, z, r));
    const at = (x, z, lat = 0) => { const i = nearestAll(x, z); return { i, p: pts[i].clone().addScaledVector(side[i], lat), yaw: yawOf(i) }; };
    const inBox = (x, z, e = 0) => A.boxes.some(b => { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; return Math.abs(lx) < b.hx + e && Math.abs(lz) < b.hz + e; });

    // the start line and its gate: two giant pencils and a banner
    const s0 = at(-20, -13.1);
    const check = canvasTex(128, 16, (g) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 4, j * 4, 4, 4); } });
    check.magFilter = THREE.NearestFilter;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .3), new THREE.MeshLambertMaterial({ map: check, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.set(-PI / 2, 0, s0.yaw); line.position.set(s0.p.x, .03, s0.p.z); A.g.add(line);
    const gate = new THREE.Group(); gate.position.copy(s0.p); gate.rotation.y = s0.yaw; A.g.add(gate);
    const pencilWood = V.mat(0xf2c230), tip = V.mat(0xe8c9a0);
    for (const sx of [-1.95, 1.95]) {
      put(gate, new THREE.CylinderGeometry(.06, .06, 1.2, 6), pencilWood, sx, .72, 0);
      put(gate, new THREE.ConeGeometry(.06, .12, 6), tip, sx, .06, 0).rotation.x = PI;
      put(gate, new THREE.CylinderGeometry(.061, .061, .08, 6), V.mat(0xf08aa0), sx, 1.36, 0);
      addBox(A, s0.p.x + side[s0.i].x * sx, s0.p.z + side[s0.i].z * sx, .07, .07, 0, 0, 1.4);
    }
    const bannerTex = canvasTex(1024, 128, (g, w, h) => {
      for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#15121c' : '#f6f2ea'; g.fillRect(i * 16, j * 16, 16, 16); g.fillRect(i * 16, h - 32 + j * 16, 16, 16); }
      g.fillStyle = '#ffb020'; g.fillRect(0, 32, w, h - 64);
      g.font = '900 64px "Titan One", Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#1a130d'; g.strokeText('mini bolides', w / 2, h / 2 + 3); g.fillStyle = '#fff'; g.fillText('mini bolides', w / 2, h / 2 + 3);
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(3.9, .48, .03), [V.TRIM(), V.TRIM(), V.TRIM(), V.TRIM(), new THREE.MeshLambertMaterial({ map: bannerTex }), new THREE.MeshLambertMaterial({ map: bannerTex })]);
    banner.position.set(0, 1.12, 0); banner.rotation.y = PI; gate.add(banner);

    // on the street: a plank on books, and a parked 4x4 high enough to drive under
    { const a = at(32, -13.1, .3); ramp(A, a.p.x, a.p.z, a.yaw, 1.1, 1, 0, .2); }
    {
      const a = at(12, -13.05), g = new THREE.Group(); g.position.copy(a.p); g.rotation.y = a.yaw; A.g.add(g);
      const body = V.mat(0x2f5f4a, { roughness: .35, metalness: .3 });
      put(g, V.roundBox(1.75, .7, 3.9, .16, 3), body, 0, .95, 0);
      put(g, V.roundBox(1.6, .62, 2.2, .14, 3), body, 0, 1.6, -.4);
      put(g, V.roundBox(1.62, .44, 2, .06), V.glass(false), 0, 1.62, -.4);
      put(g, V.roundBox(1.4, .18, 2.3, .04), V.TRIM(), 0, .62, 0);
      put(g, V.roundBox(1.8, .16, .16, .06), V.CHROME(), 0, .72, 1.98); put(g, V.roundBox(1.8, .16, .16, .06), V.CHROME(), 0, .72, -1.98);
      for (const sx of [-.62, .62]) { put(g, V.roundBox(.3, .14, .04, .04), V.lamp(0xfff2c8, 1.1), sx, 1.05, 1.95); put(g, V.roundBox(.24, .16, .04, .04), V.lamp(0xff3020, 1.2), sx, 1.05, -1.95); }
      const spare = V.wheel({ r: .36, w: .24, spokes: 6 }); spare.position.set(0, 1.05, -2.05); g.add(spare);
      for (const sx of [-.78, .78]) for (const sz of [-1.3, 1.3]) {
        const w = V.wheel({ r: .38, w: .26, spokes: 6 }); w.rotation.y = PI / 2; w.position.set(sx, .38, sz); g.add(w);
        const q = a.p.clone().addScaledVector(side[a.i], -sx).addScaledVector(tang[a.i], sz);
        addBox(A, q.x, q.z, .14, .38, a.yaw, 0, .76);
      }
      g.add(V.contactShadow(2.4, 4.6, .7));
      addBox(A, a.p.x, a.p.z, .9, 2, a.yaw, .5, 2.2, true);
    }
    // bins close the alley by the café and the passage between the café and its neighbour
    bin(A, 41.85, -9.55); bin(A, 43.05, -9.55, .2); bin(A, 51.95, -.55, PI / 2);
    // the kids closed the square's north side with toy blocks
    blocks(A, 51.7, 8.1, 57.6, 12.25, { rows: 2 });
    for (const [x, z] of [[60.2, -9.3], [66.2, -2.9], [71.3, 4.1], [72.7, 16.4], [57.4, 43.2], [53.9, 22.4], [44.3, 22.4]]) cone(A, x, z);
    // by the church: a chute of toy blocks, a kicker and the paddling pool to clear
    blocks(A, 68.9, 26.8, 68.9, 32.6, { rows: 2 }); blocks(A, 71.7, 26.8, 71.7, 32.6, { rows: 2 });
    blocks(A, 66.65, 26.8, 68.75, 26.8, { rows: 2 }); blocks(A, 71.85, 26.8, 84.7, 26.8, { rows: 2 });
    ramp(A, 70.3, 27.95, 0, 1.7, 2.5, 0, .42);
    A.noSpawn = [[(nearestAll(70.3, 27.1) - Math.round(16 / SP) + N) % N, nearestAll(70.3, 32)]];
    {
      A.waters.push({ x: 70.3, z: 30.35, r: 1.28, d: .25 });
      const g = new THREE.Group(); g.position.set(70.3, 0, 30.35); A.g.add(g);
      const ringT = canvasTex(64, 16, (c) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f6f2ea' : '#3a8ef0'; c.fillRect(k * 8, 0, 8, 16); } });
      const ring = put(g, new THREE.TorusGeometry(1.3, .12, 10, 40), new THREE.MeshStandardMaterial({ map: ringT, roughness: .3 }), 0, .12, 0); ring.rotation.x = PI / 2;
      const wtr = put(g, new THREE.CircleGeometry(1.25, 40), new THREE.MeshStandardMaterial({ color: 0x5ab4e8, roughness: .05, metalness: .2, emissive: 0x1a4a6a, emissiveIntensity: .4 }), 0, .06, 0, false); wtr.rotation.x = -PI / 2;
      put(g, new THREE.CircleGeometry(1.3, 40), V.mat(0x7ac8f0), 0, .01, 0, false).rotation.x = -PI / 2;
      const duck = new THREE.Group(); duck.position.set(.4, .08, -.3); g.add(duck);
      put(duck, new THREE.SphereGeometry(.09, 12, 8), V.mat(0xf2c230), 0, 0, 0).scale.set(1.2, .8, 1); put(duck, new THREE.SphereGeometry(.055, 10, 8), V.mat(0xf2c230), .07, .08, 0); put(duck, new THREE.ConeGeometry(.02, .05, 6), V.mat(0xf08a2a), .13, .08, 0).rotation.z = -PI / 2;
      A.duck = duck;
    }
    // the banked cardboard corner at the top of the lawn, closed off from the lane by boxes
    bank(A, 66.3, 40.6, 2.3, 5.9, -.12, PI / 2 + .12, .5);
    blocks(A, 47.2, 47.15, 90, 47.15, { big: true });
    // the hairpin: a banked turn round the end of a wall of boxes
    blocks(A, 49, 20.6, 49, 47, { big: true });
    bank(A, 49, 19, 1.5, 5.3, -PI - .12, .12, .55);
    // the neighbours' garden: their low wall and gate, a picket fence round it, a way out
    segBox(A, 15.85, 59.2, 19.2, 59.2, .38, 0, .9); segBox(A, 20.8, 59.2, 24.15, 59.2, .38, 0, .9);
    pickets(A, 24.15, 59.2, 31, 59.2); pickets(A, 31, 59.2, 31, 76); pickets(A, 31, 76, 9, 76); pickets(A, 9, 76, 9, 59.3);
    blocks(A, 18.95, 59.5, 18.95, 62.4, { rows: 2 });
    blocks(A, 17, 46.4, 17, 58.95, { big: true, rows: 2 });
    sign(A, 17.6, 48.4, PI / 2, 'déviation ↰'); sign(A, 20, 58.4, 0, 'chez les voisins', '#f6f2ea');
    // the back lane: a cardboard loop, then a cardboard box to drive through
    { const a = at(-13, 49.5); loop(A, a.p.x, a.p.z, a.yaw); }
    {
      const a = at(-36, 49.5), W = 1.3, L = 1.8, H = .62, g = new THREE.Group(); g.position.copy(a.p); g.rotation.y = a.yaw; A.g.add(g);
      const ct = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#c49a6c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,60,30,.12)'; for (let x = 0; x < w; x += 6) c.fillRect(x, 0, 2, h); c.fillStyle = '#6a4a2a'; c.font = '700 30px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('↑↑  FRAGILE  ↑↑', w / 2, h / 2 + 10); });
      const cm = new THREE.MeshLambertMaterial({ map: ct }), plain = cardPlain;
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(.02, H, L), [cm, cm, plain, plain, plain, plain]); s.position.set(sx * W / 2, H / 2, 0); g.add(s);
        const q = a.p.clone().addScaledVector(side[a.i], -sx * W / 2); addBox(A, q.x, q.z, .06, L / 2, a.yaw, 0, H);
      }
      put(g, new THREE.BoxGeometry(W + .02, .02, L), plain, 0, H, 0);
      put(g, new THREE.BoxGeometry(.12, .022, L + .01), V.mat(0xd8c090, { roughness: .4 }), 0, H + .002, 0);
      for (const sz of [-1, 1]) { const f = put(g, new THREE.BoxGeometry(W, .015, .4), plain, 0, H + .1, sz * (L / 2 + .17)); f.rotation.x = sz * .55; }
      addBox(A, a.p.x, a.p.z, W / 2 + .1, L / 2 + .2, a.yaw, H, H + .3, true);
    }
    // the corner to the park, banked
    bank(A, -66, 45.5, 2.3, 5.9, PI / 2 - .12, PI + .12, .5);
    // the shortcut: the roadworks trench by the town hall, full of rain, one plank across
    {
      A.waters.push({ x0: -49.95, x1: -41.3, z0: -4.6, z1: -3, d: .25 });
      const mud = put(A.g, new THREE.PlaneGeometry(8.65, 1.6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: .1, metalness: .15, emissive: 0x1a140e, polygonOffset: true, polygonOffsetFactor: -2 }), -45.63, .014, -3.8, false); mud.rotation.x = -PI / 2;
      for (const z of [-2.75, -4.85]) { const e = put(A.g, new THREE.PlaneGeometry(8.65, .5), new THREE.MeshLambertMaterial({ color: 0x6a4a2e, polygonOffset: true, polygonOffsetFactor: -1 }), -45.63, .012, z, false); e.rotation.x = -PI / 2; }
      for (let k = 0; k < 14; k++) { const m = put(A.g, new THREE.SphereGeometry(.22 + (k % 3) * .06, 7, 5), V.mat(0x7a5a3a, { roughness: 1 }), -49.6 + k * .64, .02, k % 2 ? -2.45 : -5.15); m.scale.y = .45; }
      ramp(A, -47.25, -3.8, 0, 2.6, .34, .04, .04, { books: false });
      const rw = canvasTex(64, 16, (c) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f6f2ea' : '#e8384f'; c.fillRect(k * 8, 0, 8, 16); } });
      const rwm = new THREE.MeshLambertMaterial({ map: rw });
      for (const z of [-2.55, -5.05]) for (const [x0, x1] of [[-49.9, -47.85], [-46.65, -41.4]]) {
        const b = put(A.g, new THREE.BoxGeometry(x1 - x0, .08, .03), rwm, (x0 + x1) / 2, .3, z); void b;
        for (const x of [x0 + .05, x1 - .05]) put(A.g, new THREE.BoxGeometry(.04, .34, .04), V.mat(0xf6f2ea), x, .17, z);
        segBox(A, x0, z, x1, z, .08, 0, .4);
      }
      sign(A, -49.2, -1.9, PI * .75, 'travaux', '#ffb020');
    }
    // pickups on the way round
    for (const [x, z] of [[2, -13.1], [70.35, 22.6], [36, 49.5], [-26, 49.5], [-70, 31]]) { const a = at(x, z); for (const l of [-.75, 0, .75]) { const q = pts[a.i].clone().addScaledVector(side[a.i], l * Math.min(1, wd[a.i])); pickup(A, q.x, q.z); } }
    // tape along both edges where there's room, red and white
    for (const s of [-1, 1]) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const k = i % N, w = wd[k] + .05, p = pts[k].clone().addScaledVector(side[k], s * w);
        for (const o of [-.03, .03]) { const q = p.clone().addScaledVector(side[k], o); pos.push(q.x, groundH(q.x, q.z) + .016, q.z); }
        uv.push(0, i * .35, 1, i * .35);
        const ok = (q) => Math.abs(q.z - ROAD_Z) > 2.4 && !(q.x > 44 && q.x < 78 && q.z > -11 && q.z < 14.2) && !inBox(q.x, q.z, .05);
        if (i < N && wd[k] >= .9 && wd[(k + 1) % N] >= .9 && ok(p) && ok(pts[(k + 1) % N].clone().addScaledVector(side[(k + 1) % N], s * w))) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, tapeMat); m.receiveShadow = true; A.g.add(m);
    }
    // arrow boards on the outside of the bends
    const arrowTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#1a130d'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb020'; for (let k = 0; k < 3; k++) { const x = 18 + k * 34; g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 26, 32); g.lineTo(x, 54); g.lineTo(x + 12, 54); g.lineTo(x + 38, 32); g.lineTo(x + 12, 10); g.fill(); } });
    const arrowMat = new THREE.MeshLambertMaterial({ map: arrowTex }), stick = V.mat(0x7a5232);
    const K = Math.round(10 / SP);
    let lastSign = -1e9;
    for (let i = 0; i < N; i++) {
      const a = wrap(yawOf((i + K) % N) - yawOf((i - K + N) % N));
      if (Math.abs(a) < .6 || i - lastSign < 2.5 * K) continue;
      let best = i, bestA = Math.abs(a);
      for (let j = i; j < i + K; j++) { const b = Math.abs(wrap(yawOf((j + K) % N) - yawOf((j - K + N) % N))); if (b > bestA) { bestA = b; best = j; } }
      lastSign = best + K; i = best + K;
      const k = best % N, out = a > 0 ? 1 : -1;
      const p = pts[k].clone().addScaledVector(side[k], out * (Math.max(wd[k], 1.2) + .7));
      if (Math.abs(p.z - ROAD_Z) < 3.2 || inBox(p.x, p.z, .4) || groundH(p.x, p.z) > .12) continue;
      const g = new THREE.Group(); g.position.copy(p); g.position.y = baseH(p.x, p.z); g.rotation.y = yawOf((k - Math.round(K * .75) + N) % N) + PI; A.g.add(g);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(.56, .28), arrowMat); board.position.y = .34; board.scale.x = a > 0 ? -1 : 1; g.add(board);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(.56, .28), stick); back.position.y = .34; back.rotation.y = PI; g.add(back);
      for (const sx of [-.2, .2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.025, .34, .025), stick); s.position.set(sx, .17, -.01); g.add(s); }
      addBox(A, p.x, p.z, .3, .05, g.rotation.y, 0, .5);
      A.signs = (A.signs || 0) + 1;
    }
    flushInst(A);
    // the lawn is mowed along the course: the tufts there are as tall as the cars
    mowWhere(A, (x, z) => near2(x, z));
    A.built = true;
  }

  // ---------- the church square, for star tag ----------
  function buildSquare() {
    const A = grp('place'); act = A;
    importWorld(A, (x, z, r) => x + r > 50 && x - r < 76 && z + r > -11.5 && z - r < 15);
    // what closes it: the bollards' line, the gaps between the houses, the north side
    blocks(A, 51.65, -10.68, 74.35, -10.68, { rows: 2 });
    bin(A, 51.95, -.55, PI / 2); bin(A, 74.15, -.55, PI / 2);
    blocks(A, 51.7, 8.1, 57.6, 12.25, { rows: 2 }); blocks(A, 64.35, 14.05, 74.45, 14.05, { rows: 2 }); blocks(A, 74.55, 8.1, 74.55, 13.9, { rows: 2 });
    // a plank over the fountain, a kicker, a cushion, a crate
    ramp(A, 62.75, -3.9, 0, 2.2, .46, 0, .85); ramp(A, 62.75, 2, 0, 9.6, .46, .85, .85); ramp(A, 62.75, 7.9, 0, 2.2, .46, .85, 0);
    A.waters.push({ x: 61, z: 2, r: 4.38, d: .2, lip: .7 });
    ramp(A, 70.6, -5.5, 0, 1.4, 1, 0, .32);
    cushion(A, 68.6, 2.6, 1.5, .35, 0x3a6ea8);
    crate(A, 55.2, 2.45, 0, 1.4, 1.4, .3); ramp(A, 55.2, 1.15, 0, 1.2, 1, 0, .3);
    for (const [x, z] of [[56.8, -9.4], [72.6, -2.4], [60.6, 11.3]]) pickup(A, x, z);
    A.spawns = [[61.8, -8.8], [70.2, -8.6], [71.9, 1.2], [66.3, 11.9], [53.6, 7.2], [53.1, 4.6]].map(([x, z]) => ({ x, z, yaw: Math.atan2(61 - x, 2 - z) }));
    A.starSpots = [[61, -6.6], [68.8, -1.7], [58.3, 10.6], [72.7, -7.2], [53.3, .6], [66.2, 5.3]];
    A.bounds = { x0: 51.6, x1: 74.4, z0: -10.5, z1: 14 };
    flushInst(A);
    waypoints(A, 1.6);
    A.built = true;
  }

  // ---------- our garden made into a stunt park ----------
  function buildGarden() {
    const A = grp('jardin'); act = A;
    importWorld(A, (x, z, r) => x + r > -42 && x - r < 42 && z + r > 16 && z - r < 47.5);
    // the kids' limit: a garden hose along the lawn, a few cones; the house stays out of it
    segBox(A, -41, 17.2, 41, 17.2, .2, 0, 1.5);
    { const hose = put(A.g, new THREE.CylinderGeometry(.03, .03, 81.4, 8), V.mat(0x45a050, { roughness: .4 }), 0, .03, 17.2); hose.rotation.z = PI / 2; }
    for (let x = -36; x <= 36; x += 8) cone(A, x, 17.5);
    addBox(A, -21.2, 31, .1, .1, 0, 0, 2);
    const S = [];
    // a plank bridge over the pond
    ramp(A, -4, 29.5, 0, 2.4, .5, 0, .42); ramp(A, -4, 34, 0, 6.6, .5, .42, .42); ramp(A, -4, 38.5, 0, 2.4, .5, .42, 0);
    A.waters.push({ x0: -7.5, x1: -.5, z0: 31.3, z1: 36.7, d: .25 });
    S.push([-4, .72, 34]);
    // a cardboard half-pipe along the back wall
    pipe(A, -14, 43.2, PI / 2, 16, 3.4, 1.1, .8);
    S.push([-18, .72, 41.75], [-10, .72, 44.65]);
    // the loop, by the shed
    loop(A, 13, 42.3, -PI / 2);
    S.push([13, 1.42, 42.6]);
    // a kicker over the vegetable patch
    ramp(A, -27, 24.6, 0, 1.8, 1.3, 0, .5);
    S.push([-27, 1.02, 27.9]);
    // a tower of crates by the washing line
    crate(A, 18, 24, 0, 2.6, 2.6, .4); ramp(A, 18, 21.9, 0, 1.6, 1.2, 0, .4);
    crate(A, 18, 24.85, 0, 1.2, .9, .8, 0x8a6a48); ramp(A, 18, 23.75, 0, 1.3, .8, .4, .8);
    S.push([18, 1.02, 24.85]);
    // a cardboard bowl
    bank(A, 34.5, 26.5, 2.2, 5.1, -PI / 2 + .55, 1.5 * PI - .55, .7);
    S.push([34.5, .66, 30.8]);
    // a table-top by the greenhouse
    ramp(A, -37, 27.8, 0, 1.6, 1.2, 0, .4); ramp(A, -37, 30, 0, 2.8, 1.2, .4, .4); ramp(A, -37, 32.2, 0, 1.6, 1.2, .4, 0);
    S.push([-37, .62, 30]);
    // a spine of books
    ramp(A, -.9, 26, PI / 2, 1.8, 1.6, 0, .45); ramp(A, .9, 26, PI / 2, 1.8, 1.6, .45, 0);
    S.push([0, .95, 26]);
    // a balance beam
    ramp(A, 16, 36, PI / 2, 1.2, .34, 0, .3); ramp(A, 19, 36, PI / 2, 4.8, .34, .3, .3); ramp(A, 22, 36, PI / 2, 1.2, .34, .3, 0);
    S.push([19, .5, 36]);
    // under the picnic table, over the sofa cushion
    S.push([8, .2, 22]);
    cushion(A, -20, 21, 1.9, .5);
    S.push([-20, .76, 21]);
    for (const p of S) { const m = starMesh(); m.position.set(...p); A.g.add(m); A.stars.push({ p: new THREE.Vector3(...p), m }); }
    A.spawns = [-5, -3, -1, 1, 3, 5].map(x => ({ x, z: 19.3, yaw: 0 }));
    A.bounds = { x0: -40.6, x1: 40.6, z0: 17.3, z1: 45.6 };
    flushInst(A);
    mowWhere(A, (x, z) => z > 16.8 && z < 46 && Math.abs(x) < 41);
    A.built = true;
  }
  // the free spots of a place, for the bots to find their way
  function blockedAt(A, x, z, e) {
    const hit = (b) => { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; return Math.abs(lx) < b.hx + e && Math.abs(lz) < b.hz + e; };
    return A.boxes.some(b => b.y0 < .2 && b.y1 > .08 && hit(b)) || A.nav.some(hit) || A.waters.some(w => w.r ? Math.hypot(x - w.x, z - w.z) < w.r + e : x > w.x0 - e && x < w.x1 + e && z > w.z0 - e && z < w.z1 + e);
  }
  function waypoints(A, step) {
    const b = A.bounds;
    for (let x = b.x0 + .8; x < b.x1 - .6; x += step) for (let z = b.z0 + .8; z < b.z1 - .6; z += step) if (!blockedAt(A, x, z, .7)) A.wps.push({ x, z });
  }
  function clearLine(A, x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / .5);
    for (let k = 1; k < n; k++) { const t = k / n; if (blockedAt(A, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, .3)) return false; }
    return true;
  }

  // ---------- fx pools ----------
  let smoke, fire, water, spark, dust;
  const flashes = [];
  function fxInit() {
    smoke = V.createPuffs(root, 90, 0xcfc8bc); fire = V.createPuffs(root, 70, 0xffa040);
    water = V.createPuffs(root, 60, 0xa8dcff); spark = V.createPuffs(root, 60, 0x8fd8ff); dust = V.createPuffs(root, 60, 0xd8ccb4);
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 1.5, .7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; root.add(s); flashes.push({ s, t: 0, size: 1 }); }
  }
  const rv = () => new THREE.Vector3((Math.random() - .5), Math.random(), (Math.random() - .5));
  function boomFx(p, size = 1) {
    const f = flashes.find(q => q.t <= 0) || flashes[0]; f.s.position.copy(p).setY(p.y + .15); f.t = .35; f.size = size; f.s.visible = true;
    for (let i = 0; i < 10 * size; i++) fire.emit(p, rv().multiplyScalar(2.2 * size), .12 * size, .45);
    for (let i = 0; i < 8 * size; i++) smoke.emit(p, rv().multiplyScalar(1.4 * size), .16 * size, 1.1);
    near(p, 14, (k) => { audio.boom(.35 * size * k); shake = Math.max(shake, .12 * size * k); });
  }
  function splashFx(p) { for (let i = 0; i < 18; i++) water.emit(p, rv().multiply(new THREE.Vector3(3, 2.4, 3)), .1, .6); near(p, 12, () => audio.splash()); }
  function sparkle(p, n = 14) { for (let i = 0; i < n; i++) spark.emit(p, rv().multiplyScalar(1.8), .08, .5); }

  // ---------- race state ----------
  let state = 'off', count = 0, clock = 0, goAt = 0, onEnd = () => {}, send = () => {}, meId = 'me', hostId = 'me', isHost = true, seq = 0;
  let cars = [], me = null, shots = [], hazards = [], bomb = null, shake = 0, sendT = 0, endT = -1, firePrev = false, respawnCd = 0;
  let items = true, ghostCar = null, ghostRec = null, lapFrames = [], lapSampleT = 0, tag = null, rnd = Math.random;
  const savedAvatars = [];
  let camFov = 72, auto = false, camYaw = 0, camY = 0;
  const byKey = (k) => cars.find(c => c.key === k);
  const mine = (c) => c && (c.key === meId || (isHost && c.bot));
  const onCourse = () => mode === 'course' || mode === 'chrono';
  const ghosts = () => mode === 'chrono' || mode === 'cascades';
  function near(p, r, f) { if (!me) return; const d = Math.hypot(me.x - p.x, me.z - p.z); if (d < r) f(1 - d / r * .7); }
  const GHOST_KEY = 'dig.rc.ghost.' + COURSE_ID;
  const loadGhost = () => { try { const g = JSON.parse(localStorage.getItem(GHOST_KEY) || 'null'); return g && g.f?.length ? g : null; } catch { return null; } };
  function ghostify(g) {
    g.traverse(o => {
      if (!o.isMesh && !o.isSprite) return;
      o.castShadow = false;
      const one = (m) => { const q = m.clone(); q.transparent = true; q.opacity = Math.min(q.opacity ?? 1, .45); q.depthWrite = false; return q; };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
  }

  function makeGhost(kind) {
    const g = carModel(kind, 0xf6f2ea, 0); ghostify(g.g);
    const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex('fantôme', 0xf6f2ea), transparent: true, depthWrite: false, opacity: .8 })); t.scale.set(.36, .09, 1); t.position.y = .5; g.g.add(t);
    root.add(g.g); return g;
  }
  function makeCar(key, name, color, kind, bot, num) {
    const m = carModel(kind, color, num);
    root.add(m.g);
    const sh = V.contactShadow(.42, .6, .6); root.add(sh);
    let tg = null;
    if (key !== meId) { tg = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false })); tg.scale.set(.36, .09, 1); root.add(tg); }
    return {
      key, name, color, bot, kind, m, K: m.K, sh, tag: tg, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, pr: 0, rr: 0,
      air: false, flipT: 0, spinT: 0, zapT: 0, zapCd: 0, oilT: 0, oilCd: 0, wetT: 0, boost: 0, pulseT: 0, steer: 0, lat: 0, speed: 0,
      idx: 0, lastIdx: 0, prog: 0, best: 0, done: false, doneAt: 0, time: 0, item: null, ammo: 0, fireCd: 0,
      offT: 0, wrongT: 0, stuckT: 0, revT: 0, lane: 0, laneT: 0, skill: 1, net: null, seen: 0, dustT: 0,
      loop: null, sinkT: 0, lapAt: 0, lapN: -1, bestLap: 0, got: new Set(), gotN: 0, navT: 0, navT2: 0, via: null, flee: null,
    };
  }
  function place(c, i, lat) {
    c.x = pts[i].x + side[i].x * lat; c.z = pts[i].z + side[i].z * lat; c.y = groundH(c.x, c.z);
    c.yaw = yawOf(i); c.vx = c.vy = c.vz = 0; c.pitch = c.roll = c.pr = c.rr = 0; c.air = false; c.flipT = c.spinT = 0; c.loop = null; c.sinkT = 0;
    c.idx = c.lastIdx = i;
  }
  function placeAt(c, s) {
    c.x = s.x; c.z = s.z; c.y = groundH(s.x, s.z); c.yaw = s.yaw;
    c.vx = c.vy = c.vz = 0; c.pitch = c.roll = c.pr = c.rr = 0; c.air = false; c.flipT = c.spinT = 0; c.loop = null; c.sinkT = 0;
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'course';
    if (!GROUPS.course) { buildCourse(); fxInit(); }
    const gname = mode === 'bataille' ? 'place' : mode === 'cascades' ? 'jardin' : 'course';
    if (gname === 'place' && !GROUPS.place) buildSquare();
    if (gname === 'jardin' && !GROUPS.jardin) { buildGarden(); waypoints(GROUPS.jardin, 2); }
    stopDyn();
    if (act) mow(act, false);
    for (const g of Object.values(GROUPS)) g.g.visible = false;
    act = GROUPS[gname]; act.g.visible = true;
    root.visible = true;
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    state = 'count'; count = 3.5; clock = 0; goAt = 0; endT = -1; shake = 0; sendT = 0; firePrev = true; respawnCd = 0; seq = 0; result = null;
    camFov = camera.fov;
    let rs = (seed >>> 0) || 1; rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    items = mode === 'course' || mode === 'bataille';
    for (const p of act.pickups) { p.off = 0; p.g.visible = items; }
    const kinds = [0, 1, 2, 3, 4, 5].sort(() => rnd() - .5);
    const botList = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    const list = [];
    const withBots = mode === 'course' || mode === 'bataille';
    if (withBots) for (let n = 0; n < Math.max(0, GRID - humans.length); n++) list.push({ key: 'b' + n, name: botList[n][0], color: botList[n][1], bot: true });
    for (const u of humans) list.push({ key: u.id, name: u.name, color: u.color, bot: false });
    const spots = act.spawns;
    cars = list.map((u, n) => {
      const c = makeCar(u.key, u.name, u.color, kinds[n % 6], u.bot, n + 1);
      if (onCourse()) {
        const i = (N - Math.round((2.2 + Math.floor(n / 2) * 1.5) / SP)) % N;
        place(c, i, n % 2 ? .55 : -.55);
        c.prog = c.best = i - N;
      } else {
        const sp = spots[n % spots.length];
        placeAt(c, { x: sp.x + (n >= spots.length ? .5 : 0), z: sp.z, yaw: sp.yaw });
      }
      c.lane = (rnd() - .5); c.skill = .9 + rnd() * .08;
      if (ghosts() && u.key !== meId) ghostify(c.m.g);
      return c;
    });
    me = byKey(meId);
    // chrono: your best lap comes back as a ghost
    ghostRec = mode === 'chrono' ? loadGhost() : null; lapFrames = []; lapSampleT = 0;
    if (ghostCar) { root.remove(ghostCar.g); ghostCar = null; }
    if (ghostRec && me) { ghostCar = makeGhost(ghostRec.k ?? me.kind); ghostCar.g.visible = false; }
    // star tag: the star waits somewhere on the square
    if (mode === 'bataille') {
      const sp = act.starSpots[Math.floor(rnd() * act.starSpots.length)];
      tag = { holder: null, pos: new THREE.Vector3(sp[0], groundH(sp[0], sp[1]) + .3, sp[1]), held: new Map(), t: -9, sendT: 0, mesh: tag?.mesh || starMesh(.5) };
      root.add(tag.mesh); tag.mesh.visible = true;
    } else if (tag) { root.remove(tag.mesh); tag = null; }
    for (const st of act.stars) st.m.visible = true;
    // the other diggers' big figures would stand in the course: shrink them away meanwhile
    for (const p of window.__dig?.net?.peers?.values?.() || []) { savedAvatars.push(p.avatar.g); p.avatar.g.scale.setScalar(1e-4); }
    motor(true); mow(act, true);
    audio.tick();
  }

  function stopDyn() {
    for (const c of cars) { root.remove(c.m.g, c.sh); if (c.tag) root.remove(c.tag); }
    cars = []; me = null;
    for (const s of shots) dyn.remove(s.mesh); shots = [];
    for (const h of hazards) dyn.remove(h.mesh); hazards = [];
    if (bomb) { bomb.mesh.parent?.remove(bomb.mesh); bomb = null; }
    for (const A of Object.values(GROUPS)) {
      for (const p of A.pickups) { p.off = 0; p.g.visible = true; }
      for (const c of A.cones) { c.g.position.copy(c.home); c.g.rotation.set(0, 0, 0); c.hit = false; c.vel.set(0, 0, 0); }
    }
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    if (ghostCar) { root.remove(ghostCar.g); ghostCar = null; }
    if (tag) { root.remove(tag.mesh); tag = null; }
    root.visible = false;
    for (const g of savedAvatars) g.scale.setScalar(1); savedAvatars.length = 0;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    motor(false); mow(act, false);
    ownHud(null);
  }

  // ---------- the motor: a small buzzing saw, only for your own car ----------
  let actx = null, mOsc = null, mOsc2 = null, mGain = null, mFilt = null;
  function motor(on) {
    try {
      if (on && !actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        mOsc = actx.createOscillator(); mOsc.type = 'sawtooth'; mOsc2 = actx.createOscillator(); mOsc2.type = 'square';
        mFilt = actx.createBiquadFilter(); mFilt.type = 'lowpass'; mFilt.frequency.value = 1400;
        mGain = actx.createGain(); mGain.gain.value = 0;
        const g2 = actx.createGain(); g2.gain.value = .35;
        mOsc.connect(mFilt); mOsc2.connect(g2); g2.connect(mFilt); mFilt.connect(mGain); mGain.connect(actx.destination);
        mOsc.start(); mOsc2.start();
      }
      if (!actx) return;
      if (on && actx.state === 'suspended') actx.resume();
      if (!on) mGain.gain.setTargetAtTime(0, actx.currentTime, .05);
    } catch { actx = null; }
  }
  function motorTick(c, thr) {
    if (!actx || !mGain) return;
    const sp = Math.abs(c.speed), t = actx.currentTime;
    const f = 70 + sp * 26 + (c.air ? 60 : 0) + (c.boost > 0 ? 40 : 0);
    mOsc.frequency.setTargetAtTime(f, t, .04); mOsc2.frequency.setTargetAtTime(f * .5 + 3, t, .04);
    mGain.gain.setTargetAtTime(c.zapT > 0 || c.flipT > 0 || c.sinkT > 0 ? .004 : .014 + Math.abs(thr) * .014 + sp * .0009, t, .06);
  }

  // ---------- items ----------
  function rank(c) { const o = order(); return o.indexOf(c); }
  function roll(c) {
    const r = cars.length > 1 ? rank(c) / (cars.length - 1) : .5;
    const T = mode === 'course' ? TABLE : TABLE.filter(t => t[0] !== 'star');
    const w = T.map(([, a, b]) => a + (b - a) * r), sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum;
    for (let i = 0; i < T.length; i++) { x -= w[i]; if (x <= 0) return T[i][0]; }
    return 'tb';
  }
  function ahead(c, range = 25, cone = .7) {
    let best = null, bd = range;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    for (const o of cars) {
      if (o === c || o.done) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > cone) { bd = d; best = o; }
    }
    return best;
  }
  const shotMat = {
    fw: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .14, 8), V.mat(0xe8384f)); b.rotation.x = PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(.02, .05, 8), V.mat(0xf6f2ea)); n.rotation.x = PI / 2; n.position.z = .09; const s = new THREE.Mesh(new THREE.CylinderGeometry(.002, .002, .2, 4), V.mat(0x7a5232)); s.rotation.x = PI / 2; s.position.z = -.14; g.add(b, n, s); return g; },
    wb: () => new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4aa8ff, roughness: .15, transparent: true, opacity: .85 })),
    sw: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.2, 2.6) }))); const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(.4, .9, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); h.scale.setScalar(.6); g.add(h); return g; },
    oil: () => { const m = new THREE.Mesh(new THREE.CircleGeometry(.55, 20), new THREE.MeshStandardMaterial({ color: 0x0c0a10, roughness: .05, metalness: .6, transparent: true, opacity: .9, polygonOffset: true, polygonOffsetFactor: -4 })); m.rotation.x = -PI / 2; m.scale.set(1, .8, 1); return m; },
    fk: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: boltTex('#ffc21f'), transparent: true, side: THREE.DoubleSide, color: new THREE.Color(1.7, 1.45, 1.2), depthWrite: false })); b.position.y = .2; g.add(b); g.userData.b = b; return g; },
  };
  // a projectile or a trap: every client runs the same one, the victim's client decides the hit
  function spawn(fx) {
    const o = byKey(fx.o), mesh = shotMat[fx.w]();
    const s = { id: fx.id, w: fx.w, o: fx.o, owner: o, mesh, pos: new THREE.Vector3(...fx.p), vel: new THREE.Vector3(...(fx.v || [0, 0, 0])), tg: fx.tg ? byKey(fx.tg) : null, age: 0, hit: new Set() };
    mesh.position.copy(s.pos); dyn.add(mesh);
    if (fx.w === 'oil' || fx.w === 'fk') { s.life = fx.w === 'oil' ? 30 : 40; if (fx.w === 'oil') { mesh.position.y = groundH(s.pos.x, s.pos.z) + .006; mesh.rotation.z = Math.random() * 6; } hazards.push(s); }
    else { s.life = fx.w === 'fw' ? 5 : fx.w === 'sw' ? 4 : 3; shots.push(s); }
    const whoosh = { fw: () => audio.whistle(), wb: () => audio.squirt(), sw: () => audio.pop(), oil: () => audio.splat(), fk: () => audio.tick() }[fx.w];
    near(s.pos, 14, () => whoosh?.());
  }
  function launch(c, w) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), sp = Math.max(0, c.speed);
    const f = { t: 'w', w, o: c.key, id: c.key + ':' + (++seq) };
    if (w === 'fw') { const tg = ahead(c, 30, .5); f.p = [c.x + fx * .3, c.y + .15, c.z + fz * .3]; f.v = [fx * (sp + 12), 0, fz * (sp + 12)]; if (tg) f.tg = tg.key; }
    else if (w === 'wb') { f.p = [c.x + fx * .2, c.y + .25, c.z + fz * .2]; f.v = [fx * (sp + 7), 3.6, fz * (sp + 7)]; }
    else if (w === 'sw') { f.p = [c.x + fx * .35, c.y + .2, c.z + fz * .35]; f.v = [fx * 13, 0, fz * 13]; }
    else { f.p = [c.x - fx * .55, c.y, c.z - fz * .55]; }
    for (const k of Object.keys(f)) if (Array.isArray(f[k])) f[k] = f[k].map(v => +v.toFixed(2));
    spawn(f); send(f);
  }
  function useItem(c) {
    if (!c.item || c.fireCd > 0 || c.done && c === me) return;
    const it = c.item;
    c.fireCd = .35;
    if (it === 'wb') { launch(c, 'wb'); if (--c.ammo > 0) return; }
    else if (it === 'fw' || it === 'sw' || it === 'oil' || it === 'fk') launch(c, it);
    else if (it === 'tb') { c.boost = 4; if (c === me) audio.charge(); }
    else if (it === 'ep') { c.pulseT = 6; send({ t: 'e', o: c.key }); near(c, 14, () => audio.zap()); }
    else if (it === 'bomb') { setBomb(c.key, 6); send({ t: 'bo', o: c.key, T: 6 }); }
    else if (it === 'star') { const f = { t: 'st', o: c.key, g: Math.round(c.prog) }; star(f); send(f); }
    c.item = null; c.ammo = 0;
  }
  function setBomb(key, T) {
    const c = byKey(key); if (!c) return;
    if (!bomb) {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(.07, 14, 10), V.mat(0x15121c, { roughness: .3, metalness: .4 })));
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .06, 5), V.mat(0x9a7a4a)); fuse.position.y = .08; fuse.rotation.z = .4; mesh.add(fuse);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.4, 1.6, .6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.position.set(-.014, .11, 0); sp.scale.setScalar(.08); mesh.add(sp);
      mesh.userData.sp = sp;
      bomb = { mesh, key, T, cd: 1 };
    }
    bomb.key = key; bomb.T = T; bomb.cd = 1;
    c.m.g.add(bomb.mesh); bomb.mesh.position.set(0, .36, 0);
    if (c === me) ui.toast('tu as la bombe ! touche une autre voiture', true, 1500);
    near(c, 10, () => audio.tick());
  }
  function bombBoom(p, key) {
    if (bomb) { bomb.mesh.parent?.remove(bomb.mesh); bomb = null; }
    boomFx(p, 1.8);
    for (const c of cars) if (mine(c) && Math.hypot(c.x - p.x, c.z - p.z) < 1.8) blast(c, c.key === key ? 1.2 : .9, p);
  }
  function star(f) {
    for (const c of cars) {
      if (c.key === f.o || c.prog <= f.g) continue;
      for (let i = 0; i < 8; i++) spark.emit(new THREE.Vector3(c.x, c.y + .2, c.z), rv().multiplyScalar(1.5), .1, .5);
      if (mine(c)) zap(c, 2.4);
    }
    if (me && me.key !== f.o && me.prog > f.g) ui.toast('pulse global !', true, 1200);
    audio.zap();
  }

  // ---------- what hurts ----------
  function blast(c, k = 1, from = null) {
    if (c.loop) return;
    c.air = true; c.y += .02; c.vy = 3.8 * k + Math.random();
    c.rr = (Math.random() < .5 ? -1 : 1) * (7 + Math.random() * 4) * k; c.pr = (Math.random() - .5) * 6;
    c.vx *= .25; c.vz *= .25;
    if (from) { const dx = c.x - from.x, dz = c.z - from.z, d = Math.hypot(dx, dz) || 1; c.vx += dx / d * 2.5 * k; c.vz += dz / d * 2.5 * k; }
    if (c === me) { shake = Math.max(shake, .25); ui.toast('boum !', true, 900); }
  }
  function knock(c, dir) {
    if (c.loop) return;
    c.air = true; c.y += .02; c.vy = 3; c.vx += dir.x * 6; c.vz += dir.z * 6; c.rr = (Math.random() < .5 ? -1 : 1) * 6;
    if (c === me) { shake = Math.max(shake, .2); audio.bonk(); }
  }
  function wet(c) { c.spinT = .9; c.wetT = 2; c.vx *= .45; c.vz *= .45; if (c === me) { shake = Math.max(shake, .1); ui.toast('splash !', true, 900); } }
  function zap(c, t = 2) { if (c.zapCd > 0) return; c.zapT = t; c.zapCd = t + .6; if (c === me) { audio.zap(); ui.toast('moteur grillé !', true, 900); } }
  function oil(c) { c.oilT = 1.3; c.oilCd = 1.2; c.spinT = Math.max(c.spinT, .35); if (c === me) audio.squeak(); }

  // ---------- driving ----------
  function collide(c) {
    for (const b of act.boxes) {
      if (b.y1 < c.y + .03 || b.y0 > c.y + .16) continue;
      const dx = c.x - b.x, dz = c.z - b.z;
      if (Math.abs(dx) > b.hx + b.hz + R && Math.abs(dz) > b.hx + b.hz + R) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz);
      let nx = lx - qx, nz = lz - qz, d = Math.hypot(nx, nz), pen;
      if (d > 1e-5) { if (d >= R) continue; nx /= d; nz /= d; pen = R - d; }
      else if (b.hx - Math.abs(lx) < b.hz - Math.abs(lz)) { nx = Math.sign(lx) || 1; nz = 0; pen = b.hx - Math.abs(lx) + R; }
      else { nx = 0; nz = Math.sign(lz) || 1; pen = b.hz - Math.abs(lz) + R; }
      const wx = nx * b.c + nz * b.s, wz = -nx * b.s + nz * b.c;
      c.x += wx * pen; c.z += wz * pen;
      const vn = c.vx * wx + c.vz * wz;
      if (vn < 0) {
        c.vx -= 1.35 * vn * wx; c.vz -= 1.35 * vn * wz;
        if (vn < -3) { c.m.kick(-vn * .3); for (let i = 0; i < 4; i++) dust.emit(new THREE.Vector3(c.x - wx * R, c.y + .05, c.z - wz * R), rv(), .06, .4); if (c === me) { audio.bonk(); shake = Math.max(shake, Math.min(.2, -vn * .02)); } }
      }
    }
  }
  // a wall (a step in the ground) rather than a slope?
  function stepLike(ox, oz, x, z) {
    const a = groundH(ox, oz), b = groundH(ox + (x - ox) / 3, oz + (z - oz) / 3), c2 = groundH(ox + (x - ox) * 2 / 3, oz + (z - oz) * 2 / 3), d = groundH(x, z);
    const j = Math.max(b - a, c2 - b, d - c2);
    return j > .04 && j > .7 * (d - a);
  }
  function stepCar(c, inp, dt) {
    const K = c.K;
    c.fireCd -= dt; c.zapT -= dt; c.zapCd -= dt; c.oilT -= dt; c.oilCd -= dt; c.wetT -= dt; c.pulseT -= dt;
    if (c.boost > 0) c.boost -= dt;
    if (c.sinkT > 0) { c.sinkT -= dt; c.y -= dt * .25; c.vx = c.vz = 0; if (c.sinkT <= 0) respawnCar(c); return; }
    if (c.loop) { loopStep(c, dt); track(c, dt); return; }
    const ox = c.x, oz = c.z, oy = c.y;
    let slp = 0;
    if (!c.air) {
      if (c.flipT > 0) {
        c.flipT -= dt;
        c.roll += (PI - c.roll) * Math.min(1, dt * 8);
        c.vx *= Math.exp(-4 * dt); c.vz *= Math.exp(-4 * dt);
        if (c.flipT <= 0) { c.air = true; c.vy = 3.2; c.rr = -wrap(c.roll) / .42; c.pr = -c.pitch / .42; c.y += .02; }
      } else {
        let thr = c.zapT > 0 ? 0 : inp.thr;
        const spin = c.spinT > 0;
        c.spinT -= dt;
        const top = K.top * (c.boost > 0 ? 1.4 : 1) * (c.wetT > 0 ? .7 : 1) * (c.band || 1);
        let fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        let vf = c.vx * fx + c.vz * fz;
        const sp = Math.abs(vf);
        const rate = K.turn * (1 - Math.min(1, sp / (K.top * 1.3)) * .38) * Math.min(1, sp / 1.1) * Math.sign(vf || 1);
        let yr = spin ? 11 : inp.steer * rate;
        if (c.oilT > 0) yr += Math.sin(clock * 11 + c.x) * 2.2;
        c.yaw += yr * dt;
        fx = Math.sin(c.yaw); fz = Math.cos(c.yaw);
        const rx = fz, rz = -fx;
        vf = c.vx * fx + c.vz * fz; let vl = c.vx * rx + c.vz * rz;
        if (spin) { vf *= Math.exp(-2.5 * dt); thr = 0; }
        if (thr > 0) { if (vf < 0) vf += 32 * dt; else vf += K.acc * (c.boost > 0 ? 1.5 : 1) * thr * Math.pow(Math.max(0, 1 - vf / top), .6) * dt; }
        else if (thr < 0) { if (vf > .3) vf -= 28 * dt; else vf = Math.max(-4.5, vf - 16 * dt); }
        else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 3.5 * dt);
        if (vf > top) vf += (top - vf) * Math.min(1, dt * 2.5);
        // the slope pulls you back down: ramps, banks, the half-pipe
        const e = .16;
        const sl = (groundH(c.x + fx * e, c.z + fz * e) - groundH(c.x - fx * e, c.z - fz * e)) / (2 * e);
        const sr = (groundH(c.x + rx * e, c.z + rz * e) - groundH(c.x - rx * e, c.z - rz * e)) / (2 * e);
        if (Math.abs(sl) < 1.6) { vf -= G * sl / Math.sqrt(1 + sl * sl) * dt; slp = sl; }
        if (Math.abs(sr) < 1.6) vl -= G * .5 * sr / Math.sqrt(1 + sr * sr) * dt;
        const grip = c.oilT > 0 ? .7 : inp.hand ? 2 : K.grip;
        vl *= Math.exp(-grip * dt);
        c.lat = vl;
        c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
        if (Math.abs(sl) < 1.6) c.pitch += (-Math.atan(sl) - c.pitch) * Math.min(1, dt * 18);
        if (Math.abs(sr) < 1.6) c.roll += (Math.atan(sr) - c.roll) * Math.min(1, dt * 18);
      }
    } else {
      c.vy -= G * dt;
      c.vx *= Math.exp(-.15 * dt); c.vz *= Math.exp(-.15 * dt);
      c.pr += 1.2 * dt;
      c.pitch += c.pr * dt; c.roll += c.rr * dt;
      c.y += c.vy * dt;
    }
    c.x += c.vx * dt; c.z += c.vz * dt;
    // into the water: the pool, the pond, the trench, the fountain
    const w = inWater(c.x, c.z);
    if (w && c.y < (w.lip ?? -.02)) { sink(c); return; }
    collide(c);
    const nh = groundH(c.x, c.z);
    if (!c.air) {
      if (nh - oy > .12 && stepLike(ox, oz, c.x, c.z)) {
        // a wall of a ramp's back or side: bounce back
        c.x = ox; c.z = oz; c.vx *= -.3; c.vz *= -.3;
        if (c === me) audio.bonk();
      } else if (nh >= oy - .03 - (slp < 0 ? -slp * Math.hypot(c.vx, c.vz) * dt * 1.4 : 0)) {
        const dh = nh - oy;
        c.vy = clamp(dh / dt, -2, 5.5);
        c.y = nh;
        if (dh > .05 && stepLike(ox, oz, c.x, c.z)) { c.vy = Math.min(dh / dt, 1.7); c.air = true; c.y += .005; c.m.kick(.6); }
      } else { c.air = true; if (c.vy < 0) c.vy = 0; c.pr = 0; }
      // the loops catch you at their mouth
      if (!c.air && c.flipT <= 0) for (const L of act.loops) {
        const u0 = (ox - L.x) * L.fx + (oz - L.z) * L.fz, u1 = (c.x - L.x) * L.fx + (c.z - L.z) * L.fz, v = (c.x - L.x) * L.rx + (c.z - L.z) * L.rz;
        const sp = c.vx * L.fx + c.vz * L.fz;
        if (u0 < 0 && u1 >= 0 && Math.abs(v) < .42 && sp > 2) { c.loop = { L, th: 0, sp, ok: sp >= 6.3, v0: v }; if (c === me) audio.whistle(); break; }
      }
    } else if (c.y <= nh) {
      const imp = -c.vy;
      c.y = nh;
      const flipped = Math.abs(wrap(c.roll)) > 1.25 || Math.abs(wrap(c.pitch)) > 1.25;
      c.roll = wrap(c.roll); c.pitch = wrap(c.pitch);
      if (flipped) {
        c.air = false; c.vy = 0; c.flipT = 1.4; c.rr = c.pr = 0; c.pitch = 0;
        if (c === me) { ui.toast('sur le toit ! (r pour repartir)', true, 1000); audio.bonk(); }
      } else if (imp > 4.2) {
        c.vy = imp * .28; c.m.kick(imp); c.rr *= .3; c.pr *= .3;
        if (c === me) audio.land(imp * 2);
      } else {
        c.air = false; c.vy = 0; c.rr = c.pr = 0; c.m.kick(imp);
        if (c === me && imp > 1.5) audio.land(imp * 2);
      }
    }
    if (c.y < -1.5) respawnCar(c);
    track(c, dt);
  }
  function sink(c) {
    splashFx(new THREE.Vector3(c.x, Math.max(0, c.y) + .05, c.z));
    c.sinkT = .8; c.air = false; c.vx = c.vz = c.vy = 0; c.loop = null;
    if (c === me) { ui.toast('plouf !', true, 900); shake = Math.max(shake, .12); }
  }
  // round the loop, or not fast enough and off you fall
  function loopStep(c, dt) {
    const o = c.loop, L = o.L;
    if (o.ok) o.th += o.sp / L.R * dt;
    else {
      o.sp -= G * Math.sin(o.th) * dt * 1.2; o.th += Math.max(0, o.sp) / L.R * dt;
      if (o.sp <= .4 || o.th > 2.5) {
        c.loop = null; c.air = true; c.pr = 3; c.rr = (Math.random() - .5) * 2; c.vy = Math.max(0, o.sp) * Math.sin(o.th); c.y += .02;
        if (c === me) ui.toast('pas assez vite !', true, 900);
        return;
      }
    }
    if (o.th >= 2 * PI) {
      c.loop = null; c.pitch = 0; c.roll = 0;
      const v = o.v0 + L.shift;
      c.x = L.x + L.fx * .03 + L.rx * v; c.z = L.z + L.fz * .03 + L.rz * v; c.y = groundH(c.x, c.z);
      c.vx = L.fx * o.sp; c.vz = L.fz * o.sp; c.vy = 0; c.air = false; c.boost = Math.max(c.boost, .5);
      if (c === me) { ui.toast('looping !', false, 900); audio.pickup(2); }
      return;
    }
    const u = L.R * Math.sin(o.th), v = o.v0 + L.shift * o.th / (2 * PI);
    c.x = L.x + L.fx * u + L.rx * v; c.z = L.z + L.fz * u + L.rz * v; c.y = L.R * (1 - Math.cos(o.th));
    c.pitch = -o.th; c.roll = 0; c.yaw = L.yaw; c.air = false;
    c.vx = L.fx * o.sp * Math.cos(o.th); c.vz = L.fz * o.sp * Math.cos(o.th); c.vy = o.sp * Math.sin(o.th);
  }
  // where along the course (the trench shortcut counts as the way it skips)
  function track(c, dt) {
    c.speed = c.loop ? c.loop.sp : c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);
    if (!onCourse()) {
      const b = act.bounds;
      if (c.x < b.x0 - 1.5 || c.x > b.x1 + 1.5 || c.z < b.z0 - 1.5 || c.z > b.z1 + 1.5) { respawnCar(c); if (c === me) ui.toast('hors du terrain', true, 900); }
      return;
    }
    const prev = c.idx;
    c.idx = nearest(c.x, c.z, c.idx);
    let off = Math.hypot(c.x - pts[c.idx].x, c.z - pts[c.idx].z);
    c.onSc = null;
    for (const s of shorts) {
      const rel = (prev - s.a + N) % N;
      if (rel > s.span + 30 && rel < N - 60) continue;
      let bk = 0, bd = Infinity;
      for (let k = 0; k < s.pts.length; k += 2) { const q = s.pts[k], d = (q.x - c.x) ** 2 + (q.z - c.z) ** 2; if (d < bd) { bd = d; bk = k; } }
      bd = Math.sqrt(bd);
      if (bd < off - .3) { off = bd; c.idx = s.map[bk]; c.onSc = s; c.scK = bk; }
    }
    let d = c.idx - c.lastIdx; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    c.prog += d; c.lastIdx = c.idx; c.best = Math.max(c.best, c.prog);
    c.offT = off > 5.2 ? c.offT + dt : 0;
    if (c.offT > 1.2) { respawnCar(c); if (c === me) ui.toast('hors piste', true, 900); }
    const wrong = !c.onSc && tang[c.idx].x * Math.sin(c.yaw) + tang[c.idx].z * Math.cos(c.yaw) < -.3 && Math.abs(c.speed) > 1.5 && !c.air;
    c.wrongT = wrong ? c.wrongT + dt : 0;
  }
  function respawnCar(c) {
    if (onCourse()) {
      let base = Math.floor(c.best / CP) * CP, i = ((base % N) + N) % N;
      // not just before the pool: you need a run-up
      for (const [a, b] of act.noSpawn || []) { const r = (i - a + N) % N; if (r <= (b - a + N) % N) { base -= r; i = a; } }
      place(c, i, (Math.random() - .5) * .7 * Math.min(1, wd[i]));
      c.prog = base;
    } else {
      // the free spot nearest to where you were
      const sp = act.spawns.map(s => ({ s, d: Math.hypot(s.x - c.x, s.z - c.z) + (cars.some(o => o !== c && Math.hypot(o.x - s.x, o.z - s.z) < .8) ? 50 : 0) })).sort((a, b) => a.d - b.d)[0].s;
      placeAt(c, sp);
    }
    c.offT = 0; c.wrongT = 0; c.stuckT = 0; c.resp = (c.resp || 0) + 1;
    if (c === me) { audio.pop(); shake = 0; }
  }

  // ---------- the bots (host) ----------
  function drive(c, dt) {
    const sp = Math.abs(c.speed), L = 1.2 + sp * .24;
    let tx, tz, vt = 12;
    // now and then a bot tries the trench
    for (const s of shorts) { const rel = (s.a - c.idx + N) % N, lap = Math.floor(c.prog / N); if (rel > 2 && rel < 24 && c.scLap !== lap) { c.scLap = lap; c.goSc = Math.random() < .35 ? s : null; } }
    let s = c.goSc, bk = 0, bd = Infinity;
    const rel = s ? (c.idx - s.a + N) % N : 1e9;
    if (s && rel < s.span) {
      for (let k = 0; k < s.pts.length; k++) { const q = s.pts[k], d = (q.x - c.x) ** 2 + (q.z - c.z) ** 2; if (d < bd) { bd = d; bk = k; } }
      // put back on the main line after a swim: give it up
      if (bd > 9 && rel > 8) { c.goSc = s = null; }
    }
    if (s && rel < s.span) {
      if (bk >= s.pts.length - 4) c.goSc = null;
      vt = s.vmax[Math.min(s.pts.length - 1, bk + 3)];
      const j = Math.min(s.pts.length - 1, bk + Math.round((vt < 7 ? 1 : L) / SP));
      tx = s.pts[j].x; tz = s.pts[j].z;
    } else {
      if (s && rel >= s.span && rel < s.span + 200) c.goSc = null;
      const j = (c.idx + Math.round(L / SP)) % N;
      c.laneT -= dt; if (c.laneT <= 0) { c.laneT = 2 + Math.random() * 3; c.lane = (Math.random() - .5); }
      const lane = c.lane * wd[j] * .55 * (Math.abs(pts[j].z - ROAD_Z) < 2 && Math.abs(pts[j].x - 12) < 4 ? .3 : 1);
      tx = pts[j].x + side[j].x * lane; tz = pts[j].z + side[j].z * lane;
      vt = vmax[(c.idx + Math.round(1 / SP)) % N];
    }
    let d = wrap(Math.atan2(tx - c.x, tz - c.z) - c.yaw);
    let steer = clamp(d * 2.6, -1, 1);
    vt *= c.bot ? (c.band || 1) : 1;
    let thr = sp < vt - .3 ? 1 : sp > vt + 1 ? -.6 : .3;
    if (Math.abs(d) > 1.1) thr = Math.min(thr, .4);
    return unstick(c, dt, steer, thr);
  }
  function unstick(c, dt, steer, thr) {
    const sp = Math.abs(c.speed);
    c.stuckT = sp < .6 && state === 'race' && !c.air && c.flipT <= 0 && !c.loop && c.sinkT <= 0 ? c.stuckT + dt : 0;
    if (c.stuckT > .8 && c.revT <= 0) c.revT = .7;
    if (c.revT > 0) { c.revT -= dt; thr = -1; steer = -steer; }
    if (c.stuckT > 3.5) respawnCar(c);
    if (onCourse() && c.wrongT > 1.5) respawnCar(c);
    // the bomb: chase someone
    if (bomb && bomb.key === c.key) { const t = ahead(c, 5, .2); if (t) { steer = clamp(wrap(Math.atan2(t.x - c.x, t.z - c.z) - c.yaw) * 3, -1, 1); thr = 1; } }
    // items
    if (items && c.item && c.fireCd <= 0 && state === 'race') {
      const it = c.item, tg = ahead(c, it === 'wb' ? 9 : it === 'sw' ? 12 : 22, .8);
      const behind = cars.some(o => o !== c && (onCourse() ? o.prog < c.prog && c.prog - o.prog < 40 / SP : true) && Math.hypot(o.x - c.x, o.z - c.z) < 7 && (o.x - c.x) * Math.sin(c.yaw) + (o.z - c.z) * Math.cos(c.yaw) < 0);
      const close = cars.some(o => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 1.8);
      if (((it === 'fw' || it === 'wb' || it === 'sw') && tg) || ((it === 'oil' || it === 'fk') && behind) || (it === 'ep' && close) || it === 'star' || it === 'bomb' || (it === 'tb' && Math.abs(steer) < .3) || c.itemT > 9) { useItem(c); c.fireCd = .7; c.itemT = 0; }
      else c.itemT = (c.itemT || 0) + dt;
    }
    return { thr: c.done ? .6 : thr, steer, hand: false };
  }
  // on the square or in the garden: go for the target, round what's in the way
  function viaPoint(c, T) {
    const A = act, cand = [];
    for (const w of A.wps) { const d1 = Math.hypot(w.x - c.x, w.z - c.z); if (d1 > .8 && d1 < 10) cand.push([d1 + Math.hypot(T.x - w.x, T.z - w.z), w]); }
    cand.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(cand.length, 14); k++) if (clearLine(A, c.x, c.z, cand[k][1].x, cand[k][1].z)) return cand[k][1];
    return cand[0]?.[1] || null;
  }
  function arenaDrive(c, dt) {
    const A = act;
    let T;
    if (mode === 'bataille' && tag) {
      if (tag.holder === c.key) {
        c.navT -= dt;
        if (c.navT <= 0 || !c.flee || Math.hypot(c.flee.x - c.x, c.flee.z - c.z) < 1.2) {
          c.navT = 2.2; let best = null, bs = -1;
          for (let k = 0; k < 24; k++) { const w = A.wps[Math.floor(Math.random() * A.wps.length)]; const s = Math.min(...cars.filter(o => o !== c).map(o => Math.hypot(o.x - w.x, o.z - w.z)), 99) - Math.hypot(w.x - c.x, w.z - c.z) * .25; if (s > bs) { bs = s; best = w; } }
          c.flee = best;
        }
        T = c.flee || c;
      } else if (!tag.holder) T = tag.pos;
      else { const h = byKey(tag.holder); T = h ? { x: h.x + h.vx * .25, z: h.z + h.vz * .25 } : tag.pos; }
    } else {
      // the stunt park, on autopilot (tests): the nearest star left
      let bd = Infinity; T = c;
      A.stars.forEach((s, k) => { if (c.got.has(k)) return; const d = Math.hypot(s.p.x - c.x, s.p.z - c.z); if (d < bd) { bd = d; T = s.p; } });
    }
    c.navT2 -= dt;
    if (c.navT2 <= 0) { c.navT2 = .35; c.via = clearLine(A, c.x, c.z, T.x, T.z) ? null : viaPoint(c, T); }
    const P = c.via && Math.hypot(c.via.x - c.x, c.via.z - c.z) > .7 ? c.via : T;
    const d = wrap(Math.atan2(P.x - c.x, P.z - c.z) - c.yaw), dist = Math.hypot(P.x - c.x, P.z - c.z);
    let steer = clamp(d * 2.4, -1, 1), thr = Math.abs(d) > 1.3 ? .35 : dist < 2 && P !== T ? .6 : 1;
    if (Math.abs(c.speed) > 7 && Math.abs(d) > .6) thr = -.4;
    return unstick(c, dt, steer, thr * (c.band || 1));
  }

  // ---------- network ----------
  const r2 = (v) => Math.round(v * 100) / 100;
  function packCar(c) {
    const extra = mode === 'chrono' ? r2(c.bestLap) : mode === 'cascades' ? c.got.size : 0;
    return [r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), r2(c.pitch), r2(c.roll), r2(c.vx), r2(c.vz), Math.round(c.prog), c.done ? 1 : 0, (c.boost > 0 ? 1 : 0) | (c.zapT > 0 ? 2 : 0) | (c.air ? 4 : 0) | (c.loop ? 8 : 0) | (c.sinkT > 0 ? 16 : 0), r2(c.steer), extra, r2(c.time)];
  }
  // the others' cars: replayed ~100 ms late from their stamped states; a 3 m jump is a respawn
  const newTrack = () => netTrack({ angles: [3, 4, 5], cut: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) > 3 });
  function unpack(c, a, ts, src) {
    if (!a) return;
    const [x, y, z, yaw, pitch, roll, vx, vz, prog, done, fl, steer, extra, time] = a;
    c.trk ??= newTrack();
    if (!c.trk.push(ts ?? netNow(), [x, y, z, yaw, pitch, roll, vx, vz], src)) return;   // older than what we have
    c.net = { x, y, z, yaw, pitch, roll, vx, vz, t: 0 }; c.prog = prog; c.best = Math.max(c.best, prog);
    c.boostFx = fl & 1; c.zapFx = fl & 2; c.air = !!(fl & 4); c.loopFx = !!(fl & 8); c.steer = steer || 0; c.seen = clock;
    if (mode === 'chrono') c.bestLap = extra || 0;
    if (mode === 'cascades') c.gotN = extra || 0;
    if (time != null && !c.bot) c.time = time;
    if (done && !c.done) { c.done = true; c.doneAt = clock; }
  }
  function follow(c, dt) {
    const s = c.trk?.sample(c.smp ??= []); if (!s) return;
    [c.x, c.y, c.z, c.yaw, c.pitch, c.roll, c.vx, c.vz] = s;
    c.speed = c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);
    if (onCourse()) c.idx = nearest(c.x, c.z, c.idx, 160);
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') { const c = byKey(pid); if (c && !mine(c)) unpack(c, fx.c, fx.ts, pid); }
    else if (fx.t === 'b') { if (!isHost) for (const [k, a] of fx.l) { const c = byKey(k); if (c) unpack(c, a, fx.ts, pid); } }
    else if (fx.t === 'w') spawn(fx);
    else if (fx.t === 'x') { const s = shots.find(q => q.id === fx.id) || hazards.find(q => q.id === fx.id); if (s) kill(s, fx.big); }
    else if (fx.t === 'pk') { const p = act.pickups[fx.i]; if (p) { p.off = 5; p.g.visible = false; } }
    else if (fx.t === 'e') { const c = byKey(fx.o); if (c) c.pulseT = 6; }
    else if (fx.t === 'bo') setBomb(fx.o, fx.T);
    else if (fx.t === 'bx') bombBoom(new THREE.Vector3(...fx.p), fx.o);
    else if (fx.t === 'st') star(fx);
    else if (fx.t === 'tg' && tag && !isHost) {
      const was = tag.holder;
      tag.holder = fx.o ?? null; tag.held = new Map(fx.h); if (fx.p) tag.pos.set(...fx.p);
      if (was !== tag.holder) tagChanged(was);
    }
  }
  function kill(s, big = 1) {
    dyn.remove(s.mesh);
    const a = shots.indexOf(s); if (a >= 0) shots.splice(a, 1);
    const b = hazards.indexOf(s); if (b >= 0) hazards.splice(b, 1);
    if (s.w === 'fw' || s.w === 'fk') boomFx(s.pos, big);
    else if (s.w === 'sw') for (let i = 0; i < 10; i++) spark.emit(s.pos, rv().multiplyScalar(2), .1, .4);
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c) {
      root.remove(c.m.g, c.sh); if (c.tag) root.remove(c.tag); cars.splice(cars.indexOf(c), 1);
      if (bomb?.key === id) { bomb.mesh.parent?.remove(bomb.mesh); bomb = null; }
      if (tag?.holder === id) { tag.holder = null; tag.pos.set(c.x, groundH(c.x, c.z) + .3, c.z); }
    }
    if (id === hostId) {
      // the host left: the first human still here takes the bots over from where they are
      const next = cars.filter(q => !q.bot).map(q => q.key).sort((a, b) => String(a).localeCompare(String(b)))[0];
      hostId = next ?? meId; isHost = hostId === meId;
      if (isHost) for (const b of cars) if (b.bot && b.net) { b.x = b.net.x; b.z = b.net.z; b.y = b.net.y; b.vx = b.net.vx; b.vz = b.net.vz; b.vy = 0; b.air = false; }
    }
    if (isHost && tag) sendTag();
  }

  // ---------- star tag ----------
  function sendTag() { if (!tag) return; tag.sendT = .25; send({ t: 'tg', o: tag.holder, h: [...tag.held].map(([k, v]) => [k, r2(v)]), p: [r2(tag.pos.x), r2(tag.pos.y), r2(tag.pos.z)] }); }
  function tagChanged(was) {
    tag.t = clock;
    const h = byKey(tag.holder);
    if (h) { sparkle(new THREE.Vector3(h.x, h.y + .4, h.z), 20); near(h, 16, () => audio.pickup(2)); }
    if (tag.holder === meId) ui.toast('l\'étoile est à toi ! file !', false, 1300);
    else if (was === meId) ui.toast(`${h?.name || 'on'} t'a volé l'étoile !`, true, 1300);
  }
  function setHolder(k) { const was = tag.holder; tag.holder = k; tagChanged(was); sendTag(); }
  function tagStep(dt, racing) {
    if (!tag) return;
    if (isHost && racing) {
      if (!tag.holder) { for (const c of cars) if (Math.hypot(c.x - tag.pos.x, c.z - tag.pos.z) < .6 && Math.abs(c.y + .15 - tag.pos.y) < .8) { setHolder(c.key); break; } }
      else {
        const h = byKey(tag.holder);
        if (!h) { tag.holder = null; sendTag(); }
        else if (clock - tag.t > 1.3) for (const c of cars) if (c !== h && c.sinkT <= 0 && Math.hypot(c.x - h.x, c.z - h.z) < .5 && Math.abs(c.y - h.y) < .35) { setHolder(c.key); break; }
      }
      tag.sendT -= dt; if (tag.sendT <= 0) sendTag();
    }
    if (tag.holder && racing) tag.held.set(tag.holder, (tag.held.get(tag.holder) || 0) + dt);
    const h = byKey(tag.holder);
    if (h) tag.mesh.position.set(h.x, h.y + .55 + Math.sin(clock * 5) * .03, h.z);
    else tag.mesh.position.set(tag.pos.x, tag.pos.y + Math.sin(clock * 3) * .06, tag.pos.z);
    tag.mesh.userData.s.material.rotation = Math.sin(clock * 2) * .3;
    if (Math.random() < .25) spark.emit(tag.mesh.position, rv().multiplyScalar(.5), .05, .4);
  }

  // ---------- the frame ----------
  function order() {
    if (mode === 'chrono') return [...cars].sort((a, b) => ((a.bestLap || 1e9) - (b.bestLap || 1e9)) || (b.prog - a.prog));
    if (mode === 'bataille') return [...cars].sort((a, b) => (tag?.held.get(b.key) || 0) - (tag?.held.get(a.key) || 0));
    if (mode === 'cascades') return [...cars].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.doneAt - b.doneAt : (b === me ? b.got.size : b.gotN) - (a === me ? a.got.size : a.gotN)));
    return [...cars].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.doneAt - b.doneAt : b.prog - a.prog));
  }
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), eye = new THREE.Vector3();
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'race'; goAt = clock; audio.buy(); if (me) me.lapAt = clock; }
    }
    const racing = state === 'race';
    if (racing) for (const c of cars) if (!c.done) c.time += dt;
    // your inputs
    const inp = { thr: 0, steer: 0, hand: false };
    if (me && racing && !me.done) {
      inp.thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      inp.steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      inp.hand = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const fire = keys.has('Space');
      if (fire && !firePrev && items) useItem(me);
      firePrev = fire;
    }
    // rubber band for the bots, against the best human
    const bestHuman = Math.max(...cars.filter(c => !c.bot).map(c => c.prog), -N);
    const steps = Math.ceil(dt / .0167), h = dt / steps;
    for (const c of cars) {
      if (!mine(c)) { follow(c, dt); continue; }
      const ai = () => onCourse() ? drive(c, dt) : arenaDrive(c, dt);
      let i = c === me ? (me.done || auto ? ai() : inp) : racing ? ai() : { thr: 0, steer: 0 };
      if (!racing) i = { thr: 0, steer: 0 };
      if (c.bot) c.band = onCourse() ? clamp(1 + (bestHuman - c.prog) / N * .25, .92, 1.08) * c.skill : c.skill;
      c.steer = i.steer;
      for (let s = 0; s < steps; s++) stepCar(c, i, h);
      if (c === me) motorTick(c, i.thr);
      if (onCourse() && c.prog >= LAPS * N && !c.done) {
        if (mode === 'chrono' && c === me) lapDone();
        c.done = true; c.doneAt = clock;
        if (c === me) finish();
      } else if (c === me && racing && onCourse()) {
        const lap = Math.floor(c.prog / N);
        if (mode === 'chrono' && lap > me.lapN) lapDone(lap);
        if (lap > (c.lapShown ?? 0) && lap < LAPS) { c.lapShown = lap; ui.toast(lap === LAPS - 1 ? 'dernier tour !' : `tour ${lap + 1} / ${LAPS}`, false, 1400); audio.tick(); }
      }
      // pickups
      if (items && !c.item && racing) for (let k = 0; k < act.pickups.length; k++) {
        const p = act.pickups[k];
        if (p.off > 0 || Math.hypot(p.p.x - c.x, p.p.z - c.z) > .42 || Math.abs(c.y - p.p.y) > .6) continue;
        p.off = 5; p.g.visible = false; send({ t: 'pk', i: k });
        c.item = roll(c); c.ammo = c.item === 'wb' ? 3 : 1;
        if (c === me) { audio.pickup(3); ui.toast(ITEMS[c.item], false, 1200); }
        break;
      }
    }
    // chrono: the ghost of your best lap, and this lap recorded
    if (mode === 'chrono' && me && racing && me.lapN >= 0) {
      lapSampleT -= dt;
      if (lapSampleT <= 0) { lapSampleT += .1; lapFrames.push(r2(me.x), r2(me.y), r2(me.z), r2(me.yaw), r2(me.pitch), r2(me.roll)); }
      if (ghostCar && ghostRec) {
        const t = (clock - me.lapAt) * 10, k = Math.floor(t), f = ghostRec.f, n = f.length / 6;
        ghostCar.g.visible = k < n - 1;
        if (k < n - 1) {
          const a = t - k, q = (j) => f[k * 6 + j] + (f[(k + 1) * 6 + j] - f[k * 6 + j]) * (j >= 3 ? 0 : a), qa = (j) => f[k * 6 + j] + wrap(f[(k + 1) * 6 + j] - f[k * 6 + j]) * a;
          ghostCar.g.position.set(q(0), q(1), q(2)); ghostCar.g.rotation.set(qa(4), qa(3), qa(5), 'YXZ');
          ghostCar.anim(dt, 9, 0, 0, false, true);
        }
      }
    } else if (ghostCar) ghostCar.g.visible = false;
    // cars bump into each other (only yours get pushed here); ghosts pass through
    if (!ghosts()) for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b];
      if (!mine(A) && !mine(B)) continue;
      if (A.loop || B.loop) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d > .4 || d < 1e-4 || Math.abs(A.y - B.y) > .2) continue;
      const nx = dx / d, nz = dz / d, pen = .4 - d;
      const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      // against a car someone else drives (a replay a little late): eased apart, never a jolt backwards
      const both = mine(A) && mine(B), mv = both ? pen * .5 : Math.min(pen, dt * 1.5);
      if (mine(A)) { A.x -= nx * mv; A.z -= nz * mv; if (rel < 0) { A.vx += nx * rel * .6; A.vz += nz * rel * .6; } }
      if (mine(B)) { B.x += nx * mv; B.z += nz * mv; if (rel < 0) { B.vx -= nx * rel * .6; B.vz -= nz * rel * .6; } }
      if (rel < -3 && (A === me || B === me)) { audio.bonk(); shake = Math.max(shake, .06); }
      // the bomb changes hands
      if (bomb && bomb.cd <= 0) {
        const from = bomb.key === A.key ? A : bomb.key === B.key ? B : null, to = from === A ? B : A;
        if (from && mine(from) && !to.done) { setBomb(to.key, bomb.T); send({ t: 'bo', o: to.key, T: +bomb.T.toFixed(2) }); }
      }
    }
    tagStep(dt, racing);
    // the stunt park's stars
    if (mode === 'cascades' && me && racing && !me.done) {
      const cy = me.y + .12 * Math.cos(me.pitch);
      act.stars.forEach((s, k) => {
        if (me.got.has(k) || Math.hypot(s.p.x - me.x, s.p.z - me.z) > .6 || Math.abs(s.p.y - cy) > .5) return;
        me.got.add(k); s.m.visible = false; sparkle(s.p, 24); audio.pickup(4);
        const n = act.stars.length;
        if (me.got.size >= n) { me.done = true; me.doneAt = clock; finish(); }
        else ui.toast(`étoile ${me.got.size} / ${n}`, false, 900);
      });
      if (clock - goAt > STUNT_T) { me.done = true; me.doneAt = clock; finish(); }
    }
    for (const s of act.stars) if (s.m.visible) { s.m.userData.s.material.rotation = Math.sin(clock * 2) * .25; s.m.position.y = s.p.y + Math.sin(clock * 3 + s.p.x) * .04; }
    // star tag ends after three minutes
    if (mode === 'bataille' && racing && me && !me.done && clock - goAt >= BATTLE_T) { me.done = true; me.doneAt = clock; finish(); }
    // cones get kicked
    for (const k of act.cones) {
      if (k.hit) {
        k.vel.y -= G * dt; k.g.position.addScaledVector(k.vel, dt);
        k.g.rotation.x += k.spin.x * dt; k.g.rotation.z += k.spin.z * dt;
        const gh = groundH(k.g.position.x, k.g.position.z);
        if (k.g.position.y < gh) { k.g.position.y = gh; k.vel.y = Math.abs(k.vel.y) * .3; k.vel.x *= .6; k.vel.z *= .6; k.spin.multiplyScalar(.6); if (k.vel.lengthSq() < .05) { k.vel.set(0, 0, 0); k.spin.set(0, 0, 0); k.g.rotation.x = PI / 2 * Math.sign(k.g.rotation.x || 1); } }
        continue;
      }
      for (const c of cars) if (Math.hypot(c.x - k.g.position.x, c.z - k.g.position.z) < .22 && c.y < k.g.position.y + .3) {
        k.hit = true; k.vel.set(c.vx * 1.1 + (Math.random() - .5), 2.2, c.vz * 1.1 + (Math.random() - .5)); k.spin.set((Math.random() - .5) * 18, 0, (Math.random() - .5) * 18);
        if (mine(c)) { c.vx *= .9; c.vz *= .9; }
        if (c === me) audio.bonk();
        break;
      }
    }
    if (act.duck) { act.duck.rotation.y += dt * .4; act.duck.position.y = .08 + Math.sin(clock * 2) * .01; }
    // projectiles
    for (let n = shots.length - 1; n >= 0; n--) {
      const s = shots[n];
      s.age += dt; s.life -= dt;
      if (s.w === 'fw') {
        if (s.tg && cars.includes(s.tg)) {
          const want = Math.atan2(s.tg.x - s.pos.x, s.tg.z - s.pos.z), cur = Math.atan2(s.vel.x, s.vel.z);
          const a = cur + clamp(wrap(want - cur), -3.6 * dt, 3.6 * dt), sp = Math.max(15, Math.hypot(s.vel.x, s.vel.z));
          s.vel.set(Math.sin(a) * sp, 0, Math.cos(a) * sp);
        }
        s.pos.addScaledVector(s.vel, dt); s.pos.y += (Math.max(0, groundH(s.pos.x, s.pos.z)) + .16 - s.pos.y) * Math.min(1, dt * 10);
        s.mesh.rotation.y = Math.atan2(s.vel.x, s.vel.z);
        fire.emit(s.pos, rv().multiplyScalar(.3), .05, .25); if (Math.random() < .5) smoke.emit(s.pos, rv().multiplyScalar(.2), .06, .7);
      } else if (s.w === 'wb') {
        s.vel.y -= G * dt; s.pos.addScaledVector(s.vel, dt); s.mesh.scale.set(1 + Math.sin(s.age * 20) * .1, 1 - Math.sin(s.age * 20) * .1, 1);
      } else {
        s.pos.addScaledVector(s.vel, dt); s.pos.y = Math.max(0, groundH(s.pos.x, s.pos.z)) + .2;
        s.mesh.children[1].scale.setScalar(.5 + Math.sin(s.age * 30) * .12);
        if (Math.random() < .5) spark.emit(s.pos, rv().multiplyScalar(.6), .07, .3);
      }
      s.mesh.position.copy(s.pos);
      // walls
      let wall = false;
      for (const b of act.boxes) {
        if (b.y1 < s.pos.y || b.y0 > s.pos.y) continue;
        const dx = s.pos.x - b.x, dz = s.pos.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx + .03 && Math.abs(lz) < b.hz + .03) { wall = true; break; }
      }
      if (s.w === 'wb') {
        const gh = groundH(s.pos.x, s.pos.z);
        const direct = cars.find(c => c !== s.owner && Math.hypot(c.x - s.pos.x, c.z - s.pos.z) < .3 && Math.abs(c.y + .1 - s.pos.y) < .2);
        if (s.pos.y <= gh || wall || direct) {
          splashFx(s.pos);
          for (const c of cars) if (mine(c) && Math.hypot(c.x - s.pos.x, c.z - s.pos.z) < 1.1 && (c !== s.owner || s.age > .6)) wet(c);
          dyn.remove(s.mesh); shots.splice(n, 1); continue;
        }
      } else {
        let hit = null;
        for (const c of cars) {
          if (!mine(c) || (c === s.owner && s.age < .6) || s.hit.has(c)) continue;
          const d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
          if (s.w === 'fw' && d < .38) { hit = c; break; }
          if (s.w === 'sw' && d < 1.4) { s.hit.add(c); tmp.set(c.x - s.pos.x, 0, c.z - s.pos.z).normalize(); knock(c, tmp); }
        }
        if (hit) { blast(hit, 1, s.pos); send({ t: 'x', id: s.id }); kill(s); continue; }
      }
      if (s.life <= 0 || wall) kill(s, .6);
    }
    for (let n = hazards.length - 1; n >= 0; n--) {
      const s = hazards[n];
      s.age += dt; s.life -= dt;
      if (s.w === 'fk') { s.mesh.userData.b.rotation.y += dt * 2.2; s.mesh.userData.b.position.y = .2 + Math.sin(clock * 3) * .03; }
      else s.mesh.material.opacity = Math.min(.9, s.life / 3);
      let gone = s.life <= 0;
      for (const c of cars) {
        if (!mine(c) || c.air) continue;
        const d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
        if (s.w === 'oil' && d < .55 && c.oilCd <= 0) oil(c);
        if (s.w === 'fk' && d < .35 && (c !== s.owner || s.age > 1.5)) { blast(c, .7, s.pos); send({ t: 'x', id: s.id, big: .7 }); kill(s, .7); gone = false; break; }
      }
      if (gone) { dyn.remove(s.mesh); hazards.splice(n, 1); }
    }
    // the bomb
    if (bomb) {
      bomb.T -= dt; bomb.cd -= dt;
      bomb.mesh.userData.sp.scale.setScalar(.06 + Math.random() * .05);
      bomb.mesh.children[0].scale.setScalar(1 + (bomb.T < 2 ? Math.max(0, Math.sin(clock * 20)) * .15 : 0));
      const holder = byKey(bomb.key);
      if (holder && mine(holder) && bomb.T <= 0) { const p = [r2(holder.x), r2(holder.y), r2(holder.z)]; send({ t: 'bx', o: holder.key, p }); bombBoom(new THREE.Vector3(...p), holder.key); }
      else if (bomb && (!holder || bomb.T < -1.5)) { bomb.mesh.parent?.remove(bomb.mesh); bomb = null; }
    }
    // electro pulses zap whoever comes close
    for (const o of cars) {
      if (o.pulseT <= 0) continue;
      if (Math.random() < .3) spark.emit(new THREE.Vector3(o.x + (Math.random() - .5) * .6, o.y + .15, o.z + (Math.random() - .5) * .6), rv().multiplyScalar(.4), .05, .25);
      for (const c of cars) if (c !== o && mine(c) && Math.hypot(c.x - o.x, c.z - o.z) < 2 && c.zapCd <= 0) { zap(c, 2); for (let i = 0; i < 6; i++) spark.emit(new THREE.Vector3(c.x, c.y + .2, c.z), rv().multiplyScalar(1.2), .08, .35); }
    }
    // pickups come back
    for (const p of act.pickups) {
      p.b.rotation.y += dt * 2.4; p.b.position.y = .2 + Math.sin(clock * 3 + p.p.x) * .03;
      if (p.off > 0) { p.off -= dt; if (p.off <= 0) p.g.visible = items; }
    }
    // show every car
    for (const c of cars) {
      const lp = c.loop || c.loopFx;
      c.m.g.position.set(c.x, c.y + (lp ? 0 : Math.max(0, -Math.cos(c.roll)) * .2 + Math.max(0, -Math.cos(c.pitch)) * .2), c.z);
      c.m.g.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
      const gh = Math.max(0, groundH(c.x, c.z));
      c.sh.position.set(c.x, gh + .004, c.z); c.sh.rotation.z = c.yaw; c.sh.material.opacity = .6 * clamp(1 - (c.y - gh) * 1.5, .15, 1) * (ghosts() && c !== me ? .4 : 1);
      c.m.anim(dt, c.speed, c.steer, c.lat || 0, c.boost > 0 || !!c.boostFx, !c.air);
      c.m.aura.visible = c.pulseT > 0; if (c.pulseT > 0) { c.m.aura.rotation.y += dt * 5; c.m.aura.scale.setScalar(.9 + Math.random() * .25); }
      if (c.zapT > 0 || c.zapFx) { if (Math.random() < .4) spark.emit(new THREE.Vector3(c.x, c.y + .15, c.z), rv().multiplyScalar(.5), .05, .25); }
      if (c.tag) { c.tag.position.set(c.x, c.y + .5, c.z); const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0; c.tag.visible = d > 1.2 && d < 14; }
      // dust and turbo sparks behind the fast ones
      c.dustT -= dt;
      if (c.dustT <= 0 && Math.abs(c.speed) > 5 && !c.air && !lp && baseH(c.x, c.z) < .04 && c.y < .05) { c.dustT = .06; dust.emit(tmp.set(c.x - Math.sin(c.yaw) * .22, c.y + .03, c.z - Math.cos(c.yaw) * .22), rv().multiplyScalar(.3), .06, .5); }
      if (c.flipT > 0 && Math.random() < .2) smoke.emit(tmp.set(c.x, c.y + .1, c.z), rv().multiplyScalar(.2), .06, .7);
      if (c.sinkT > 0 && Math.random() < .3) water.emit(tmp.set(c.x, Math.max(0, c.y) + .05, c.z), rv().multiplyScalar(.6), .06, .5);
    }
    smoke.update(dt); fire.update(dt); water.update(dt); spark.update(dt); dust.update(dt);
    for (const f of flashes) if (f.t > 0) { f.t -= dt; f.s.scale.setScalar(f.size * (1.8 - f.t * 3)); f.s.material.opacity = f.t / .35; if (f.t <= 0) f.s.visible = false; }
    // drop the humans that never came
    if (racing && clock > 9) for (const c of [...cars]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    // tell the others
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      const ts = netStamp();
      if (me) send({ t: 's', ts, c: packCar(me) });
      if (isHost) { const l = cars.filter(c => c.bot).map(c => [c.key, packCar(c)]); if (l.length) send({ t: 'b', ts, l }); }
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { const r = result; endT = -1; onEnd(r); } }
    cam(dt);
  }
  // a lap of the time trial: keep the best, and its ghost if it beats the record
  function lapDone(lap) {
    if (me.lapN >= 0) {
      const t = clock - me.lapAt;
      if (t < LEN / 16) { me.lapN = lap ?? me.lapN + 1; me.lapAt = clock; lapFrames = []; return; }   // not a real lap (a warp, a glitch)
      if (!me.bestLap || t < me.bestLap) me.bestLap = t;
      const rec = loadGhost();
      if (lapFrames.length > 12 && (!rec || t < rec.t)) {
        const g = { t, k: me.kind, f: lapFrames };
        try { localStorage.setItem(GHOST_KEY, JSON.stringify(g)); } catch { /* full: no ghost */ }
        if (rec) ui.toast(`nouveau record du tour : ${fmt(t)}`, false, 1600);
        ghostRec = g;
        if (!ghostCar) ghostCar = makeGhost(me.kind);
      } else ui.toast(`tour en ${fmt(t)}`, false, 1200);
    }
    me.lapN = lap ?? me.lapN + 1; me.lapAt = clock; lapFrames = []; lapSampleT = 0;
  }

  // ---------- the camera: low behind your car ----------
  function cam(dt) {
    if (!me) return;
    // rigid behind the car, only the heading and the height are smoothed: no lag at speed
    if (state === 'count' || Math.abs(wrap(me.yaw - camYaw)) > 2.8 && me.flipT <= 0 && me.spinT <= 0) camYaw = me.yaw;
    camYaw += wrap(me.yaw - camYaw) * Math.min(1, dt * (me.spinT > 0 ? 2 : 7));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), sp = Math.abs(me.speed);
    const back = .95 + Math.min(sp, 14) * .02, up = .34 + Math.min(sp, 14) * .005 + (me.loop ? .5 : 0);
    const gy = me.loop ? groundH(me.x, me.z) : me.y;
    camY += (gy + up - camY) * Math.min(1, dt * 9);
    if (state === 'count' || Math.abs(camY - gy - up) > 2.5) camY = gy + up;
    camPos.set(me.x - fx * back * (me.loop ? 2 : 1), camY, me.z - fz * back * (me.loop ? 2 : 1));
    camLook.set(me.x + fx * 1.2, me.y + .14, me.z + fz * 1.2);
    if (state === 'count') {
      // a swoop down from above the grid
      const k = 1 - Math.pow(Math.max(0, count - .5) / 3, 2);
      tmp.set(me.x - fx * 5 + fz * 2, me.y + 3.5, me.z - fz * 5 - fx * 2);
      camPos.lerpVectors(tmp, camPos, clamp(k, 0, 1));
    }
    // keep the eye out of walls and under roofs
    tmp.set(me.x, me.y + .25, me.z);
    const S = 8, pt = new THREE.Vector3();
    const free = tmp.clone();
    for (let s = 1; s <= S; s++) {
      pt.lerpVectors(tmp, camPos, s / S);
      let inside = false;
      for (const b of act.boxes) {
        if (b.y1 < pt.y || b.y0 > pt.y + .05) continue;
        const dx = pt.x - b.x, dz = pt.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx + .08 && Math.abs(lz) < b.hz + .08) { inside = true; break; }
      }
      if (inside) break;
      free.copy(pt);
    }
    camPos.copy(free);
    for (const b of act.roofs) {
      const dx = camPos.x - b.x, dz = camPos.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + .2 && Math.abs(lz) < b.hz + .2 && camPos.y > b.y0 - .06 && me.y < b.y0) camPos.y = Math.max(me.y + .15, b.y0 - .06);
    }
    camPos.y = Math.max(camPos.y, groundH(camPos.x, camPos.z) + .08);
    const a = state === 'count' ? 1 : Math.min(1, dt * 30);
    // our own eye: main puts the camera back on the (disabled) player every frame
    eye.lerp(camPos, a);
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .6); camera.position.x += (Math.random() - .5) * shake * .4; camera.position.y += (Math.random() - .5) * shake * .4; }
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    const fov = 62 + Math.min(14, sp * 1.05) + (me.boost > 0 ? 7 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  let result = null;
  function finish() {
    const of = cars.length, humans = cars.filter(c => !c.bot);
    if (mode === 'course') {
      const p = cars.filter(c => c.done && c !== me && c.doneAt <= me.doneAt).length + 1;
      result = { place: p, of, time: me.time, value: me.time };
      ui.toast(p === 1 ? 'victoire !' : `arrivée : ${p}e`, false, 2000);
    } else if (mode === 'chrono') {
      const best = me.bestLap || me.time / LAPS;
      const p = humans.filter(c => c !== me && c.bestLap > 0 && c.bestLap < best).length + 1;
      result = { place: p, of: humans.length, time: me.time, value: best, text: `meilleur tour ${fmt(best)}` + (humans.length > 1 ? ` · ${p === 1 ? '1er' : p + 'e'} sur ${humans.length}` : '') };
      ui.toast(`meilleur tour : ${fmt(best)}`, false, 2000);
    } else if (mode === 'bataille') {
      const held = tag?.held.get(meId) || 0, o = order(), p = o.indexOf(me) + 1;
      result = { place: p, of, time: held, value: held, text: `${p === 1 ? '1re' : p + 'e'} place · étoile gardée ${fmt(held)}` };
      ui.toast(p === 1 ? 'c\'est toi qui l\'as gardée le plus !' : `fin : ${p}e`, false, 2000);
    } else {
      const n = act.stars.length, got = me.got.size, t = me.time;
      if (got >= n) {
        const p = humans.filter(c => c !== me && c.done && c.doneAt < me.doneAt).length + 1;
        result = { place: p, of: humans.length, time: t, value: t, text: `${n} étoiles en ${fmt(t)}` + (humans.length > 1 ? ` · ${p === 1 ? '1er' : p + 'e'}` : '') };
        ui.toast(`toutes les étoiles ! ${fmt(t)}`, false, 2000);
      } else {
        result = { place: humans.length + 1, of: humans.length, time: t, text: `${got} / ${n} étoiles, temps écoulé` };
        ui.toast('temps écoulé', true, 2000);
      }
    }
    audio.win();
    endT = 2.6;
    if (me.item) me.item = null;
  }

  // ---------- the HUD of the other modes (the race uses main's) ----------
  let hudEl = null;
  function ownHud(html) {
    if (!html) { if (hudEl) hudEl.style.display = 'none'; return; }
    if (!hudEl) {
      const st = document.createElement('style');
      st.textContent = `#rchud{position:absolute;top:108px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;min-width:220px;padding:12px 22px;font-variant-numeric:tabular-nums;color:#fff;pointer-events:none;
background:linear-gradient(170deg,rgba(52,39,28,.9),rgba(22,16,12,.93));border-radius:calc(var(--u,8px)*1.5);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08),inset 0 2px 0 rgba(255,255,255,.06),0 calc(var(--u,8px)*.45) 0 rgba(0,0,0,.38)}
#rchud b{font:900 11px/1.2 var(--text);letter-spacing:.16em;text-transform:uppercase;color:var(--a-light)}
#rchud .big{font:400 36px/1 var(--display);color:#fff;-webkit-text-stroke:.15em var(--k);paint-order:stroke fill;text-shadow:0 3px 0 var(--k)}
#rchud .big small{font-size:16px;color:var(--a-light);-webkit-text-stroke:.12em var(--k)}
#rchud span{font:600 14px/1.3 var(--text)}
#rchud .board{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin-top:3px;max-width:520px}
#rchud .board span{font-size:13px}
#rchud em{font-style:normal;text-decoration:underline}`;
      document.head.appendChild(st);
      hudEl = document.createElement('div'); hudEl.id = 'rchud';
      (document.getElementById('mg')?.parentElement || document.body).appendChild(hudEl);
    }
    hudEl.style.display = '';
    if (hudEl._h !== html) { hudEl.innerHTML = html; hudEl._h = html; }
  }
  const hex = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');
  const board = (list, val) => list.length > 1 ? `<div class="board">${list.map((c, n) => `<span style="color:${hex(c.color)}">${n + 1}. ${c === me ? '<em>toi</em>' : esc(c.name)} ${val(c)}</span>`).join('')}</div>` : '';
  function hudHtml() {
    const o = order();
    if (mode === 'chrono') {
      const lap = clamp(Math.floor(me.prog / N) + 1, 1, LAPS), cur = me.lapN >= 0 && !me.done ? clock - me.lapAt : 0, rec = ghostRec?.t;
      return `<b>contre-la-montre · tour ${lap} / ${LAPS}</b><span class="big">${fmt(cur)}</span><span>meilleur tour ${me.bestLap ? fmt(me.bestLap) : '–'} · record ${rec ? fmt(rec) : '–'}${me.wrongT > .8 ? ' · <em>mauvais sens !</em>' : ''}</span>` + board(o, c => c.bestLap ? fmt(c.bestLap) : '');
    }
    if (mode === 'bataille') {
      const left = Math.max(0, BATTLE_T - (clock - goAt)), mineT = tag?.held.get(meId) || 0, h = byKey(tag?.holder);
      const who = !h ? 'l\'étoile attend sur la place : fonce !' : h === me ? '<em>tu as l\'étoile</em> · sème-les !' : `<span style="color:${hex(h.color)}">${esc(h.name)}</span> a l'étoile · touche-le !`;
      return `<b>chasse à l'étoile · ${fmt(left)}</b><span class="big">${fmt(mineT)}${h === me ? ' <small>★</small>' : ''}</span><span>${who}${me.item ? ' · <em>' + ITEMS[me.item] + (me.item === 'wb' ? ' ×' + me.ammo : '') + '</em> (espace)' : ''}</span>` + board(o, c => fmt(tag?.held.get(c.key) || 0) + (tag?.holder === c.key ? ' ★' : ''));
    }
    const n = act.stars.length, t = me.time;
    return `<b>cascades · ${fmt(t)}</b><span class="big">${me.got.size} / ${n} <small>★</small></span><span>tremplins, rampe, looping, pont sur la mare…</span>` + board(o, c => `${c === me ? c.got.size : c.gotN} ★`);
  }

  return {
    modes: MODES,
    start, update, stop, onFx, peerLeft,
    respawn() { if (state === 'race' && me && !me.done && respawnCd <= clock && !me.loop) { respawnCd = clock + 1; respawnCar(me); } },
    hud() {
      if (state === 'count') { ownHud(null); return { count: Math.ceil(count - .5) }; }
      if (!me || state === 'off') { ownHud(null); return { count: 0 }; }
      if (mode !== 'course') { ownHud(hudHtml()); return { hidden: true }; }
      const o = order();
      return {
        lap: clamp(Math.floor(me.prog / N) + 1, 1, LAPS), laps: LAPS, place: o.indexOf(me) + 1, of: cars.length, time: me.time,
        item: me.item ? ITEMS[me.item] + (me.item === 'wb' ? ' ×' + me.ammo : '') : null, wrong: me.wrongT > .8,
        board: o.map(c => ({ name: c.name, color: c.color, me: c === me })),
      };
    },
    set onEnd(f) { onEnd = f; },
    // tests
    get _n() { const A = act || GROUPS.course; return { len: Math.round(LEN), N, signs: A?.signs, boxes: A?.boxes.length, ramps: A?.ramps.length, banks: A?.banks.length, loops: A?.loops.length, waters: A?.waters.length, stars: A?.stars.length, wps: A?.wps.length, mowed: A?.mowed.length, pickups: A?.pickups.length }; },
    get _shots() { return shots; }, get _act() { return act; },
    get _ghost() { return ghostCar && { vis: ghostCar.g.visible, p: ghostCar.g.position.toArray().map(v => +v.toFixed(2)), root: ghostCar.g.parent === root, n: ghostRec?.f.length, t: ghostRec?.t }; },
    get _mode() { return mode; }, get _tag() { return tag && { holder: tag.holder, held: Object.fromEntries(tag.held) }; },
    get cars() { return cars; }, get me() { return me; }, get pts() { return pts; }, get shorts() { return shorts; }, useItem, launch, groundH,
    _warp(lapLeft = 0) { if (!me || !onCourse()) return; const i = N - Math.round(10 / SP); place(me, i, 0); me.prog = me.best = (LAPS - 1 - lapLeft) * N + i; me.vx = Math.sin(me.yaw) * 10; me.vz = Math.cos(me.yaw) * 10; },
    _tp(x, z, yaw = null, sp = 0) { if (!me) return; me.x = x; me.z = z; me.y = groundH(x, z); if (yaw != null) me.yaw = yaw; me.vx = Math.sin(me.yaw) * sp; me.vz = Math.cos(me.yaw) * sp; me.vy = 0; me.air = false; me.loop = null; me.sinkT = 0; if (onCourse()) { me.idx = me.lastIdx = nearestAll(x, z); } },
    _at(i) { if (!me) return; place(me, ((i % N) + N) % N, 0); },
    _collect(k = 1) { if (!me || mode !== 'cascades') return; act.stars.forEach((s, j) => { if (j < act.stars.length - k) { me.got.add(j); s.m.visible = false; } }); if (me.got.size >= act.stars.length && !me.done) { me.done = true; me.doneAt = clock; finish(); } },
    _end(t = 1) { if (me) goAt = clock - (mode === 'bataille' ? BATTLE_T : STUNT_T) + t; },
    _auto(on = true) { auto = on; },
    _give(it) { if (me) { me.item = it; me.ammo = it === 'wb' ? 3 : 1; } },
  };
}
