// ballons.js, ballons fous: a balloon-fighting arena in a night-sky theatre box, in the spirit of
// Balloon Fight. Tiny fighters hang from two balloons and flap to stay up; land on someone's
// balloons to pop one, lose both and you parachute into the lake. The play is a vertical plane
// (x, y) in front of a starry backdrop: floating islands, spinning flippers, storm clouds that
// throw sparks, and a big fish under the water waiting for whoever skims the surface. Three
// lives, two minutes: points for every balloon you pop, and for every life you keep.
// Network: each human flies its own fighter and sends its state; the host runs the bots and
// decides everything shared (pops, sparks, the fish, lives, respawns) and broadcasts it.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { mergeStatic } from './merge.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hostOf, createChip, hexOf, ord } from './retro.js';
import { tagTex as tagPill } from './lib/tex.js';

const ROUND = 120, STEP = 1 / 60, LIVES = 3, FIGHTERS = 4;
const WATER = .28, CEIL = 3.52, XW = 2.8, LAKE = 2.02;
const HW = .045, FOOT = .055, TOP2 = .205, TOP0 = .05;   // the fighter's box round its body centre
const MODES = [{ id: 'arene', name: 'arène', sub: '4 combattants, 3 vies, 2 minutes · éclate les ballons des autres', help: 'espace : battre des bras · q d : dériver · tombe sur les ballons des autres · évite l\'eau et les étincelles', unit: 'score', lower: false }];
const BOTS = [['pipo', 0xe8384f], ['nina', 0xf2c230], ['bobo', 0x3a8ef0], ['lili', 0x45c060], ['zaza', 0xb05ae0], ['tom', 0xf08a2a]];
const PI = Math.PI, TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
const ST = ['fly', 'fall', 'gone', 'out'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// the arena, in the plinth's frame: islands (top, width; the two shores reach down into the lake)
const PLATS = [
  { x: -2.48, top: .62, w: .96, bot: -1, shore: true }, { x: 2.48, top: .62, w: .96, bot: -1, shore: true },
  { x: -1.2, top: 1.3, w: .86 }, { x: 1.1, top: 1.08, w: .78 }, { x: .05, top: 2.02, w: .74 },
  { x: -2.1, top: 2.42, w: .6 }, { x: 2.12, top: 2.5, w: .6 },
];
for (const p of PLATS) { p.bot ??= p.top - .14; p.l = p.x - p.w / 2; p.r = p.x + p.w / 2; }
const CLOUDS = [{ x: -.95, y: 3.02 }, { x: 1.2, y: 3.08 }];
const FLIPS = [{ x: 1.3, y: 1.86 }, { x: -.45, y: .92 }];
const SPAWNS = [[-2.1, 2.42], [2.12, 2.5], [-1.2, 1.3], [1.1, 1.08], [.05, 2.02]].map(([x, t]) => [x, t + FOOT + .002]);

const tagTex = (text, color) => tagPill(text, color, 'rgba(20,14,30,.72)');

// ---------- the fighters: vertex-coloured parts merged, so each is a few draw calls ----------
const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
function part(geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.clone(), n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.applyMatrix4(tm.compose(tv.set(x, y, z), tq.setFromEuler(te.set(rx, ry, rz)), ts.set(sx, sy, sz)));
  return g;
}
// a thin rod from a to b
function rod(a, b, r, hex) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = part(new THREE.CylinderGeometry(r, r, len, 5), hex, 0, 0, 0);
  g.applyMatrix4(tm.compose(tv.copy(a).addScaledVector(d, .5), tq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), ts.set(1, 1, 1)));
  return g;
}
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 });
const balloonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .22, metalness: .05, emissive: 0x201020, emissiveIntensity: .4 });
const HAND = [new THREE.Vector3(.006, .072, .019), new THREE.Vector3(.006, .072, -.019)];
const BX = .028, BY = .158;
function fighterModel(color) {
  const skin = 0xf2c49a, suit = new THREE.Color(color).lerp(new THREE.Color(0x1a1a2a), .45).getHex(), dark = 0x2a2230;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const parts = [
    part(V.roundBox(.042, .048, .032, .012), suit, 0, 0, 0),
    part(new THREE.SphereGeometry(.021, 10, 8), color, .004, -.012, 0, 0, 0, 0, 1.05, .6, 1.02),
    part(new THREE.SphereGeometry(.023, 12, 10), skin, .003, .045, 0),
    part(new THREE.SphereGeometry(.0255, 12, 8, 0, TAU, 0, PI * .5), color, .001, .048, 0, 0, 0, -.25),
    part(new THREE.BoxGeometry(.008, .009, .032), dark, .02, .054, 0, 0, 0, -.25),
    part(new THREE.SphereGeometry(.0065, 6, 5), 0xff9a7a, .026, .04, 0),
  ];
  for (const s of [1, -1]) {
    parts.push(part(new THREE.CylinderGeometry(.0075, .0075, .034, 6), dark, 0, -.038, s * .01));
    parts.push(part(new THREE.SphereGeometry(.011, 8, 6), 0x5a3020, .006, -.056, s * .01, 0, 0, 0, 1.4, .75, 1));
    parts.push(rod(new THREE.Vector3(0, .018, s * .02), HAND[s > 0 ? 0 : 1], .0065, suit));
    parts.push(part(new THREE.SphereGeometry(.0085, 6, 5), skin, HAND[s > 0 ? 0 : 1].x, HAND[s > 0 ? 0 : 1].y, HAND[s > 0 ? 0 : 1].z));
  }
  const bm = new THREE.Mesh(mergeGeometries(parts), vcMat); bm.castShadow = true; body.add(bm);
  for (const p of parts) p.dispose();
  // the balloons: each with its knot and string down to a hand
  const balloons = [];
  for (let k = 0; k < 2; k++) {
    const hand = HAND[k], bx = k ? -BX : BX;
    const geo = mergeGeometries([
      part(new THREE.SphereGeometry(.04, 14, 12), color, 0, 0, 0, 0, 0, 0, 1, 1.15, 1),
      part(new THREE.ConeGeometry(.007, .01, 6), color, 0, -.049, 0, PI),
      part(new THREE.SphereGeometry(.009, 6, 5), 0xffffff, -.015, .018, .025, 0, 0, 0, 1, 1.4, .6),
      rod(new THREE.Vector3(0, -.053, 0), new THREE.Vector3(hand.x - bx, hand.y - BY, hand.z), .0011, 0xf4f0e8),
    ]);
    const m = new THREE.Mesh(geo, balloonMat); m.position.set(bx, BY, 0); m.castShadow = true;
    body.add(m); balloons.push(m);
  }
  // the parachute, for the way down
  const chute = [];
  const can = new THREE.SphereGeometry(.075, 12, 5, 0, TAU, 0, PI * .42).toNonIndexed();
  const cc = new Float32Array(can.attributes.position.count * 3), ca = new THREE.Color(color), cb = new THREE.Color(0xf6f2ea);
  for (let i = 0; i < can.attributes.position.count; i++) {
    const a = Math.atan2(can.attributes.position.getZ(i), can.attributes.position.getX(i));
    const c = Math.floor((a + PI) / TAU * 12 + .5) % 2 ? ca : cb; cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b;
  }
  can.setAttribute('color', new THREE.BufferAttribute(cc, 3)); can.scale(1, .6, 1); can.translate(0, .15, 0);
  chute.push(can);
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; chute.push(rod(new THREE.Vector3(Math.cos(a) * .068, .163, Math.sin(a) * .068).setY(.165 - .02), HAND[k % 2], .001, 0xf4f0e8).toNonIndexed()); }
  const cm = new THREE.Mesh(mergeGeometries(chute), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide }));
  for (const p of chute) p.dispose();
  cm.visible = false; body.add(cm);
  return { g, body, balloons, chute: cm };
}
const disposeModel = (m) => m.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });

export function createBallons({ scene, camera, audio, ui, at }) {
  const root = new THREE.Group(); root.position.copy(at); scene.add(root);
  const deco = new THREE.Group(); root.add(deco);
  const add = (geo, m, x, y, z, p = deco) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const rough = (geo, k) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + (hash(x, y, z) - .5) * k, y + (hash(y, z, x) - .5) * k * .6, z + (hash(z, x, y) - .5) * k); } geo.computeVertexNormals(); return geo; };

  // ---------- the theatre box ----------
  const Z0 = -1.25, Z1 = 1.45, H = 3.95;
  const wood = V.mat(0x4a2418, { roughness: .7 }), gold = V.mat(0xd9a441, { roughness: .35, metalness: .6 }), velvet = V.mat(0x9a1428, { roughness: .75, side: THREE.DoubleSide });
  const stone = V.mat(0x4a4658, { roughness: .9 });
  // the sky: a painted night backdrop
  const skyTex = (moon) => V.paintTex(1024, 640, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#070a24'); gr.addColorStop(.6, '#1a1850'); gr.addColorStop(1, '#46307a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let k = 0; k < 420; k++) { const s = r() < .08 ? 2.2 : r() * 1.2 + .4; g.fillStyle = `rgba(255,${230 + r() * 25 | 0},${200 + r() * 55 | 0},${.4 + r() * .6})`; g.beginPath(); g.arc(r() * w, r() * h * .85, s, 0, TAU); g.fill(); }
    // the moon, and far hills on the horizon
    if (moon) { g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(w * .8, h * .2, 46, 0, TAU); g.fill(); g.fillStyle = '#0e1034'; g.beginPath(); g.arc(w * .8 - 20, h * .2 - 10, 42, 0, TAU); g.fill(); }
    g.fillStyle = '#231a4a'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * .82 - Math.sin(x * .011) * 30 - Math.sin(x * .031 + 1) * 14);
    g.lineTo(w, h); g.fill();
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex(true), color: new THREE.Color(1.15, 1.15, 1.2) }), sideMat = new THREE.MeshBasicMaterial({ map: skyTex(false), color: skyMat.color });
  add(new THREE.BoxGeometry(6.4, H, .08), wood, 0, H / 2, Z0 - .05);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(.08, H, Z1 - Z0 + .1), wood, s * 3.14, H / 2, (Z0 + Z1) / 2);
    add(new THREE.PlaneGeometry(Z1 - Z0, H - .05), sideMat, s * 3.09, H / 2, (Z0 + Z1) / 2).rotation.y = -s * PI / 2;
    // the proscenium pillars, gilded
    add(V.roundBox(.2, H, .14, .03), wood, s * 3.06, H / 2, Z1);
    add(new THREE.BoxGeometry(.04, H - .3, .03), gold, s * 2.97, H / 2, Z1 + .06);
    for (const y of [.15, H - .15]) add(new THREE.SphereGeometry(.07, 10, 8), gold, s * 3.06, y, Z1 + .07);
  }
  add(new THREE.BoxGeometry(6.4, .08, Z1 - Z0 + .1), wood, 0, H + .02, (Z0 + Z1) / 2);
  add(V.roundBox(6.3, .28, .14, .03), wood, 0, H - .14, Z1);
  add(new THREE.BoxGeometry(6.0, .025, .03), gold, 0, H - .28, Z1 + .07);
  add(new THREE.PlaneGeometry(6.2, H - .05), skyMat, 0, H / 2, Z0 - .005);
  // stars that catch the bloom, hung in front of the backdrop
  {
    const r = rng(5), n = 46, st = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.008, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3, 2.4) }), n), o = new THREE.Object3D();
    for (let k = 0; k < n; k++) { o.position.set((r() - .5) * 5.9, 1.2 + r() * 2.6, Z0 + .02 + r() * .1); o.rotation.set(r() * 3, r() * 3, r() * 3); o.scale.setScalar(.4 + r() * .9); o.updateMatrix(); st.setMatrixAt(k, o.matrix); }
    st.userData.keep = true; deco.add(st);
  }
  // the curtains: tied back at the sides, a pleated valance across the top
  function drape(w, h, folds, tie) {
    const g = new THREE.PlaneGeometry(w, h, folds * 4, 24), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), u = x / w + .5, v = y / h + .5;
      const pinch = tie ? 1 - .75 * Math.exp(-Math.pow((v - .3) / .12, 2)) : 1;
      p.setXYZ(i, (tie ? (u - (tie > 0 ? 0 : 1)) * pinch + (tie > 0 ? 0 : 1) - .5 : u - .5) * w, y, Math.sin(u * folds * TAU) * .035 * (tie ? 1 : .6));
    }
    g.computeVertexNormals();
    return g;
  }
  for (const s of [-1, 1]) { const c = add(drape(.42, H - .5, 5, s), velvet, s * 2.78, (H - .5) / 2 + .32, Z1 - .08); c.position.x = s * 2.78; }
  add(drape(6.0, .32, 36, 0), velvet, 0, H - .42, Z1 - .05);
  for (const s of [-1, 1]) add(new THREE.TorusGeometry(.05, .014, 6, 12), gold, s * 2.82, 1.28, Z1 - .04);
  {
    const tex = V.paintTex(512, 96, (g, w, h) => {
      g.fillStyle = '#3a0c16'; g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, 30); g.fill(); g.lineWidth = 5; g.strokeStyle = '#e8b64a'; g.stroke();
      g.fillStyle = '#ffd86a'; g.font = '800 54px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ballons fous', w / 2, h / 2 + 3);
      for (const [x, c] of [[40, '#ff4a5a'], [w - 40, '#4ab0ff']]) { g.fillStyle = c; g.beginPath(); g.ellipse(x, h / 2 - 6, 17, 21, 0, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, h / 2 + 15); g.lineTo(x, h - 12); g.stroke(); }
    });
    add(new THREE.PlaneGeometry(1.5, .28), new THREE.MeshBasicMaterial({ map: tex }), 0, H - .15, Z1 + .075);
  }

  // ---------- the lake: a stone basin, the water drawn below ----------
  add(new THREE.BoxGeometry(6.2, .04, Z1 - Z0), V.mat(0x0c1a38, { roughness: 1 }), 0, .02, (Z0 + Z1) / 2);
  add(V.roundBox(6.3, .36, .14, .04), stone, 0, .18, Z1 + .02);
  for (let k = 0; k < 13; k++) add(V.roundBox(.44, .07, .18, .03), V.mat(0x5a5468, { roughness: .9 }), -2.88 + k * .48, .37, Z1 + .02);

  // ---------- the islands ----------
  const grass = V.mat(0x4faa48, { roughness: .85 }), dirt = V.mat(0x6e4a30, { roughness: .95 }), rock = V.mat(0x6a6078, { roughness: .95, flatShading: true });
  const flower = [V.mat(0xffe36a), V.mat(0xff7aa8), V.mat(0xffffff)];
  let fi = 0;
  for (const p of PLATS) {
    add(V.roundBox(p.w + .05, .05, .6, .022), grass, p.x, p.top - .02, 0);
    if (p.shore) {
      for (let k = 0; k < 4; k++) add(rough(new THREE.CylinderGeometry(p.w * .5, p.w * .52, .16, 9, 1), .08), rock, p.x, p.top - .12 - k * .15, (k % 2) * .03);
    } else {
      add(V.roundBox(p.w, .08, .52, .03), dirt, p.x, p.top - .08, 0);
      add(rough(new THREE.ConeGeometry(p.w * .46, .34 + p.w * .2, 9, 3), .06), rock, p.x, p.top - .28 - p.w * .1, 0).rotation.x = PI;
    }
    // tufts and a few flowers along the front edge
    for (let k = 0; k < Math.round(p.w * 9); k++) {
      const x = p.l + .04 + hash(p.x, k, 1) * (p.w - .08), z = -.26 + hash(k, p.top, 2) * .52;
      add(new THREE.ConeGeometry(.012, .035, 4), grass, x, p.top + .012, z);
      if (hash(k, p.x, 3) < .3) add(new THREE.SphereGeometry(.009, 6, 4), flower[fi++ % 3], x + .01, p.top + .01, z + .01);
    }
  }
  // the cave-side of the shores: reeds
  for (let k = 0; k < 14; k++) { const s = k % 2 ? 1 : -1, x = s * (1.95 - hash(k, 1, 1) * .12), z = -.4 + hash(k, 2, 2) * .9; add(new THREE.CylinderGeometry(.004, .006, .22 + hash(k, 3, 3) * .12, 4), V.mat(0x3a7a3a), x, WATER + .1, z).rotation.z = s * (hash(k, 4, 4) - .5) * .4; }

  // ---------- storm clouds: dynamic (they flash), each one mesh ----------
  const clouds = CLOUDS.map((c, n) => {
    const r = rng(20 + n), geos = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; geos.push(new THREE.IcosahedronGeometry(.13 + r() * .08, 2).translate(Math.cos(a) * (.18 + r() * .1) * 1.4, Math.sin(a) * .08 + r() * .04, (r() - .5) * .25)); }
    geos.push(new THREE.IcosahedronGeometry(.2, 2).translate(0, .06, 0));
    const mat = new THREE.MeshStandardMaterial({ color: 0x55506e, roughness: 1, emissive: new THREE.Color(0x1a1438), emissiveIntensity: 1 });
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.position.set(c.x, c.y, 0); m.userData.keep = true; root.add(m);
    // a zigzag bolt hanging under each cloud
    const pts = [], bolt = new THREE.Group(); bolt.userData.keep = true;
    for (let k = 0; k < 5; k++) pts.push(new THREE.Vector3((k % 2 ? .05 : -.04) + (r() - .5) * .03, -.12 - k * .065, .08));
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(rod(pts[k], pts[k + 1], .007, 0xffffff), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 1.2) })); bolt.add(b); }
    bolt.position.set(c.x + (n ? .12 : -.1), c.y, 0); root.add(bolt);
    return { ...c, m, mat, bolt, warn: 0, crack: 0 };
  });

  // ---------- flippers: spinning paddles that throw you off ----------
  const flips = FLIPS.map((f) => {
    const g = new THREE.Group(); g.position.set(f.x, f.y, 0); g.userData.keep = true; root.add(g);
    const blade = new THREE.Mesh(mergeGeometries([
      part(V.roundBox(.3, .036, .05, .016), 0xe83848, 0, 0, 0),
      part(V.roundBox(.08, .038, .052, .016), 0xf6f2ea, .075, 0, 0), part(V.roundBox(.08, .038, .052, .016), 0xf6f2ea, -.075, 0, 0),
      part(new THREE.CylinderGeometry(.03, .03, .07, 12), 0xffd24a, 0, 0, 0, PI / 2),
    ]), vcMat);
    blade.castShadow = true; g.add(blade);
    return { ...f, g, spin: 0, w: 1.2 };
  });

  // ---------- the fish ----------
  const fish = (() => {
    const g = new THREE.Group(); g.userData.keep = true; root.add(g);
    const green = 0x3a7a6a, teeth = (x, y, z, down) => part(new THREE.ConeGeometry(.012, .03, 4), 0xffffff, x, y, z, 0, 0, down ? PI : 0);
    const body = new THREE.Mesh(mergeGeometries([
      part(new THREE.SphereGeometry(.12, 16, 12), green, 0, .02, 0, 0, 0, 0, 1, 1.5, .8),
      part(new THREE.SphereGeometry(.1, 14, 10), 0xe8e0b8, .045, 0, 0, 0, 0, 0, .7, 1.4, .7),
      part(new THREE.ConeGeometry(.1, .14, 4), 0x2a5a52, 0, -.22, 0, 0, 0, 0, 1, 1, .25),
      part(new THREE.ConeGeometry(.05, .14, 4), 0xd84a3a, -.1, .03, 0, 0, 0, PI / 2 + .5, 1, 1, .2),
      part(new THREE.SphereGeometry(.105, 12, 8), 0x8a1020, 0, .19, 0, 0, 0, 0, 1, .3, .7),
      ...[-.05, 0, .05].map(z => teeth(.085, .2, z, false)),
    ]), vcMat);
    body.castShadow = true; g.add(body);
    // the head lifts on a hinge at the back: a wide open mouth, teeth all round
    const jaw = new THREE.Group(); jaw.position.set(-.1, .19, 0); g.add(jaw);
    const jm = new THREE.Mesh(mergeGeometries([
      part(new THREE.SphereGeometry(.12, 14, 8, 0, TAU, 0, PI / 2), green, .1, 0, 0, 0, 0, 0, 1, .75, .8),
      part(new THREE.CircleGeometry(.12, 14), 0x8a1020, .1, -.001, 0, PI / 2, 0, 0, 1, .8, 1),
      part(new THREE.SphereGeometry(.03, 8, 6), 0xffffff, .15, .06, .07), part(new THREE.SphereGeometry(.03, 8, 6), 0xffffff, .15, .06, -.07),
      part(new THREE.SphereGeometry(.014, 6, 5), 0x101010, .175, .065, .085), part(new THREE.SphereGeometry(.014, 6, 5), 0x101010, .175, .065, -.085),
      ...[-.05, 0, .05].map(z => teeth(.19, -.01, z, true)),
    ]), vcMat);
    jm.castShadow = true; jaw.add(jm);
    return { g, jaw, st: 'idle', t: 0, x: 0, v: null };
  })();

  mergeStatic(deco, (o) => o.userData.keep);
  deco.traverse(o => { if (o.isMesh && (o.material === wood || o.material === skyMat || o.material === sideMat || o.material === velvet || o.material === stone)) o.castShadow = false; });

  // ---------- the water ----------
  const WX = 64, WZ = 18;
  const wGeo = new THREE.PlaneGeometry(6.2, Z1 - Z0, WX, WZ); wGeo.rotateX(-PI / 2); wGeo.translate(0, WATER, (Z0 + Z1) / 2);
  const water = new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({ color: 0x2a6ab0, roughness: .15, metalness: .2, transparent: true, opacity: .86, emissive: 0x0a2a5a, emissiveIntensity: .7 }));
  water.receiveShadow = true; root.add(water);
  const wPos = wGeo.attributes.position;
  const waveH = (x, z, t) => .012 * Math.sin(x * 5 + t * 1.7) + .008 * Math.sin(x * 9.3 - z * 4 - t * 2.3) + .005 * Math.sin(z * 7 + t * 1.1);
  function stepWater(t) { for (let i = 0; i < wPos.count; i++) wPos.setY(i, WATER + waveH(wPos.getX(i), wPos.getZ(i), t)); wPos.needsUpdate = true; wGeo.computeVertexNormals(); }
  stepWater(0);

  // ---------- particles: balloon shreds and drops (lit), sparks and crackle (glowing) ----------
  function pool(max, mat, geo) {
    const mesh = new THREE.InstancedMesh(geo, mat, max); mesh.frustumCulled = false; root.add(mesh);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const list = Array.from({ length: max }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0 }));
    let next = 0; const col = new THREE.Color();
    return {
      emit(x, y, z, vx, vy, vz, s, life, color, g = 2) { const p = list[next]; mesh.setColorAt(next, col.set(color)); mesh.instanceColor.needsUpdate = true; next = (next + 1) % max; Object.assign(p, { x, y, z, vx, vy, vz, s, life, max: life, g }); },
      step(dt) {
        for (let n = 0; n < max; n++) {
          const p = list[n];
          if (p.life > 0) { p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
          const k = p.life > 0 ? p.life / p.max : 0;
          dm.position.set(p.x, p.y, p.z); dm.rotation.set(p.x * 40, p.y * 30, 0); dm.scale.setScalar(p.s * k); dm.updateMatrix();
          mesh.setMatrixAt(n, dm.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
      clear() { for (const p of list) p.life = 0; },
    };
  }
  const dm = new THREE.Object3D();
  const bits = pool(260, new THREE.MeshStandardMaterial({ roughness: .5 }), new THREE.TetrahedronGeometry(1, 0));
  const glow = pool(200, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.3) }), new THREE.OctahedronGeometry(1, 0));
  function burst(x, y, z, color) { for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; bits.emit(x, y, z, Math.cos(a) * (.3 + Math.random() * .4), Math.sin(a) * (.3 + Math.random() * .4) + .2, (Math.random() - .5) * .3, .008 + Math.random() * .007, .5 + Math.random() * .3, color); } }
  function splash(x, n = 18) { for (let k = 0; k < n; k++) bits.emit(x + (Math.random() - .5) * .1, WATER + .01, (Math.random() - .5) * .1, (Math.random() - .5) * .8, .6 + Math.random() * .9, (Math.random() - .5) * .3, .007 + Math.random() * .008, .6 + Math.random() * .4, 0xcfe8ff, 3); }
  function crackle(x, y, n = 3, r = .25) { for (let k = 0; k < n; k++) { const a = Math.random() * TAU; glow.emit(x + Math.cos(a) * r * Math.random(), y + Math.sin(a) * r * .4 * Math.random() - .05, .1, Math.cos(a) * .3, Math.sin(a) * .3, 0, .006 + Math.random() * .006, .15 + Math.random() * .15, 0xffffff, 0); } }

  // ---------- sparks: little balls of lightning that bounce round the arena ----------
  const sparkGeo = mergeGeometries([new THREE.IcosahedronGeometry(.022, 1), ...[[.09, .008, .008], [.008, .09, .008], [.008, .008, .09]].map(([x, y, z]) => new THREE.BoxGeometry(x, y, z).rotateZ(PI / 4).rotateX(PI / 4).toNonIndexed())]);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3, 1.3) });
  const sparkMeshes = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; root.add(m); return m; });
  let sparks = [];
  function stepSpark(s, dt) {
    if (s.wait > 0) { s.wait -= dt; return; }
    s.life -= dt;
    const px = s.x, py = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < -XW || s.x > XW) { s.x = clamp(s.x, -XW, XW); s.vx = -s.vx; }
    if (s.y < WATER + .04 || s.y > CEIL - .03) { s.y = clamp(s.y, WATER + .04, CEIL - .03); s.vy = -s.vy; }
    for (const p of PLATS) {
      if (s.x < p.l - .02 || s.x > p.r + .02 || s.y < p.bot - .02 || s.y > p.top + .02) continue;
      if (px < p.l - .02 || px > p.r + .02) { s.vx = -s.vx; s.x = px; } else { s.vy = -s.vy; s.y = py; }
    }
  }

  // ---------- the fighters ----------
  let fighters = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {}, humansIn = [];
  let state = 'off', count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, snapT = 0, result = null, acc = 0, rnd = Math.random;
  let sparkT = 0, sparkId = 0, ended = false, camFov = 72, shake = 0, auto = false, wt = 0;
  const chip = createChip(.1);
  const byKey = (k) => fighters.find(c => c.key === k);
  const mine = (c) => c && (c.key === meId || (isHost && c.bot));
  const live = (c) => c.st === 'fly' || c.st === 'fall';
  function makeFighter(u, slot) {
    const m = fighterModel(u.color);
    root.add(m.g);
    let tag = null;
    if (u.key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(u.name, u.color), transparent: true, depthWrite: false })); tag.scale.set(.2, .05, 1); root.add(tag); }
    const [x, y] = SPAWNS[slot];
    return { key: u.key, name: u.name, color: u.color, bot: u.bot, m, tag, slot, z: (slot - 1.5) * .05,
      x, y, vx: 0, vy: 0, face: x > 0 ? -1 : 1, turn: x > 0 ? -1 : 1, ground: true, st: 'fly', bal: 2, lives: LIVES, pops: 0, score: 0,
      flapWas: false, flapHold: 0, flapAnim: 0, pumpT: 0, pumpCd: 0, inv: 0, blink: 0, fallT: 0, goneT: 0, low: 0,
      net: null, seen: 0, in: { l: false, r: false, flap: false, down: false }, tgt: null, thinkT: 0, aimX: 0, aimY: 0, skill: 1 };
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    meId = mid; hostId = h; isHost = hostId === meId; send = s; humansIn = humans.map(u => ({ id: u.id }));
    rnd = rng(seed);
    state = 'count'; count = 3.5; clock = 0; goAt = 0; endT = -1; sendT = 0; snapT = 0; result = null; acc = 0; ended = false; shake = 0;
    sparkT = 7 + rnd() * 3; sparkId = 0; wt = rnd() * 40;
    camFov = camera.fov;
    const list = humans.slice(0, FIGHTERS).map(u => ({ key: u.id, name: u.name, color: u.color, bot: false }));
    const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
    for (let n = 0; list.length < FIGHTERS; n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    fighters = list.map((u, n) => { const c = makeFighter(u, n); c.skill = .75 + rnd() * .25; return c; });
    me = byKey(meId);
    deco.visible = true;
    fish.st = 'idle'; fish.g.visible = false;
    for (const f of flips) f.spin = 0;
    chip.init();
    audio.tick();
    update(0, new Set());
  }
  function stopDyn() {
    for (const c of fighters) { root.remove(c.m.g); disposeModel(c.m); if (c.tag) { root.remove(c.tag); c.tag.material.map.dispose(); c.tag.material.dispose(); } }
    fighters = []; me = null; sparks = [];
    for (const m of sparkMeshes) m.visible = false;
    bits.clear(); glow.clear();
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    idlePose();
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close();
  }

  // ---------- flying ----------
  function stepFighter(c, I, dt) {
    if (c.st === 'fall') {
      // under the parachute: a slow sway down, through everything, to the water
      c.vy += (-.3 - c.vy) * Math.min(1, dt * 3);
      c.vx += ((I.r - I.l) * .18 - c.vx) * Math.min(1, dt * 2);
      c.x = clamp(c.x + c.vx * dt, -XW, XW); c.y = Math.max(WATER + FOOT, c.y + c.vy * dt);
      return;
    }
    if (c.st !== 'fly') return;
    const dir = (I.r ? 1 : 0) - (I.l ? 1 : 0), one = c.bal < 2;
    if (dir) c.face = dir;
    // a flap on each press, and a slower beat while held
    c.flapHold = I.flap ? c.flapHold + dt : 0;
    if (I.flap && (!c.flapWas || c.flapHold >= .24)) {
      if (c.flapWas) c.flapHold = 0;
      c.vy = Math.min(one ? .75 : .9, Math.max(c.vy, -.4) + (one ? .44 : .52));
      c.vx += dir * .22; c.ground = false; c.flapAnim = 1;
      if (c === me) chip.tone(260, 420, .05, { type: .25, vol: .12 });
    }
    c.flapWas = I.flap;
    if (c.ground) {
      c.vx += (dir * .45 - c.vx) * Math.min(1, dt * 8);
      // hold s on the ground with one balloon: blow up another
      if (c.bal === 1 && I.down && !dir) { c.pumpT += dt; if (c.pumpT >= 1.2 && c.pumpCd <= 0) { c.pumpT = 0; c.pumpCd = 1; askPump(c); } }
      else c.pumpT = 0;
    } else {
      c.pumpT = 0;
      c.vx += dir * .95 * dt; c.vx *= 1 - .35 * dt;
    }
    c.pumpCd -= dt;
    c.vx = clamp(c.vx, -.95, .95);
    c.vy = Math.max(-1.1, c.vy - (one ? 1.55 : 1.3) * dt);
    const pb = c.y - FOOT, pt = c.y + TOP2;
    c.x += c.vx * dt; c.y += c.vy * dt; c.ground = false;
    const top = c.bal ? TOP2 : TOP0;
    // islands: land on top, bump the underside, bounce off the sides
    for (const p of PLATS) {
      if (c.x + HW < p.l || c.x - HW > p.r || c.y + top < p.bot || c.y - FOOT > p.top) continue;
      if (pb >= p.top - .002 && c.vy <= 0) { c.y = p.top + FOOT; c.vy = 0; c.ground = true; }
      else if (pt <= p.bot + .002 && c.vy > 0) { c.y = p.bot - top; c.vy = -c.vy * .4; }
      else { c.x = c.x < p.x ? p.l - HW : p.r + HW; c.vx = -c.vx * .6; if (c === me) audio.bonk(); }
    }
    if (c.x < -XW || c.x > XW) { c.x = clamp(c.x, -XW, XW); c.vx = -c.vx * .7; }
    if (c.y + top > CEIL) { c.y = CEIL - top; c.vy = -Math.abs(c.vy) * .5; }
    if (c.y - FOOT < WATER) { c.y = WATER + FOOT; c.vy = .45; if (c === me) audio.splash(); splash(c.x, 8); }
    // the flippers throw you back where you came from
    for (const f of flips) {
      const dx = c.x - f.x, dy = c.y + .06 - f.y, d = Math.hypot(dx, dy);
      if (d < .15 && d > 1e-4) {
        const nx = dx / d, ny = dy / d, sp = Math.max(.7, Math.hypot(c.vx, c.vy));
        c.x = f.x + nx * .15; c.y = f.y + ny * .15 - .06; c.vx = nx * sp; c.vy = ny * sp; f.w = 14 * Math.sign(nx || 1);
        if (c === me) { chip.tone(700, 1400, .08, { type: .125, vol: .12 }); shake = .03; }
      }
    }
    // bump the others at the same height
    for (const o of fighters) {
      if (o === c || o.st !== 'fly') continue;
      const dx = c.x - o.x, dy = c.y - o.y;
      if (Math.abs(dx) < .085 && Math.abs(dy) < .09) { c.vx = Math.sign(dx || 1) * Math.max(.35, Math.abs(c.vx) * .8); c.x = o.x + Math.sign(dx || 1) * .086; }
    }
  }
  const wantFlap = (keys) => keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyJ') || keys.has('KeyK');

  // ---------- bots: climb above a target, drop onto its balloons, keep off the water ----------
  function botThink(c, dt) {
    const I = c.in; I.l = I.r = I.flap = I.down = false;
    if (c.st === 'fall') { I.l = c.x > 0; I.r = c.x < 0; return I; }
    if (c.st !== 'fly') return I;
    c.thinkT -= dt;
    if (c.thinkT <= 0) {
      c.thinkT = .25 + rnd() * .2;
      if (!c.tgt || c.tgt.st !== 'fly' || rnd() < .06) {
        let best = null, bd = Infinity;
        for (const o of fighters) if (o !== c && o.st === 'fly') { const d = Math.hypot(o.x - c.x, o.y - c.y) * (o.bot ? 1.2 : 1) * (.8 + rnd() * .4); if (d < bd) { bd = d; best = o; } }
        c.tgt = best;
      }
      c.aimX = (rnd() - .5) * .12 / c.skill; c.aimY = (rnd() - .5) * .1;
    }
    let tx = c.x, ty = 1.9;
    const t = c.tgt;
    if (t) { tx = t.x + c.aimX; ty = t.y + .3 + c.aimY; if (Math.abs(t.x - c.x) < .1 && c.y > t.y + .14) ty = t.y - 1; }
    // someone above me: get out from under and climb
    for (const o of fighters) if (o !== c && o.st === 'fly' && o.y > c.y + .05 && o.y < c.y + .6 && Math.abs(o.x - c.x) < .3) { tx = c.x + Math.sign(c.x - o.x || 1) * .6; ty = o.y + .35; }
    for (const s of sparks) if (s.wait <= 0 && Math.hypot(s.x - c.x, s.y - c.y) < .45) { tx = c.x + Math.sign(c.x - s.x || 1) * .7; ty = c.y + (s.y < c.y ? .4 : -.3); }
    for (const q of clouds) if (Math.abs(q.x - tx) < .55 && ty > q.y - .45) { ty = q.y - .45; if (Math.abs(q.x - c.x) < .55 && c.y > q.y - .5) ty = c.y - .3; }
    if (fish.st === 'up' && Math.abs(fish.x - c.x) < .5) ty = WATER + 1.2;
    ty = Math.max(ty, WATER + .7);
    const safe = !fighters.some(o => o !== c && o.st === 'fly' && Math.hypot(o.x - c.x, o.y - c.y) < 1.1);
    if (c.ground && c.bal === 1 && safe) { I.down = true; return I; }
    const dx = tx - c.x;
    if (Math.abs(dx) > .06) { if (dx > 0) I.r = true; else I.l = true; }
    I.flap = c.y + c.vy * .35 < ty && !(c.flapWas && c.flapHold > .2 && c.vy > .3);
    return I;
  }

  // ---------- the host decides: pops, sparks, the fish, lives ----------
  function ev(o) { applyEv(o); send({ t: 'e', e: o }); }
  function askPump(c) { if (isHost) doPump(c); else send({ t: 'p' }); }
  function doPump(c) { if (c && c.st === 'fly' && c.bal === 1) ev({ f: 'pump', v: c.key }); }
  function loseLife(c) { return Math.max(0, c.lives - 1); }
  function arbitrate(dt) {
    for (const c of fighters) c.inv -= dt;
    // pops: a body landing on someone's balloons from above
    for (const a of fighters) {
      if (a.st !== 'fly') continue;
      for (const v of fighters) {
        if (v === a || v.st !== 'fly' || v.bal <= 0 || v.inv > 0 || a.y < v.y + .09) continue;
        if (Math.abs(a.x - v.x) < HW + .07 && a.y - FOOT < v.y + TOP2 && a.y + .04 > v.y + .11) {
          const b = v.bal - 1, kill = b === 0;
          ev({ f: 'pop', v: v.key, a: a.key, b, lv: kill ? loseLife(v) : v.lives, ap: a.pops + 1, as: a.score + 100 + (kill ? 50 : 0), dx: Math.sign(v.x - a.x || 1) * .25 });
          v.inv = .6;
        }
      }
    }
    // sparks
    for (const s of sparks) {
      if (s.wait > 0 || s.life <= 0) continue;
      for (const c of fighters) {
        if (c.st !== 'fly' || c.inv > 0) continue;
        if (Math.abs(s.x - c.x) < .06 && s.y > c.y - FOOT - .02 && s.y < c.y + TOP2 + .02) {
          const b = c.bal - 1;
          ev({ f: 'pop', v: c.key, b, lv: b === 0 ? loseLife(c) : c.lives, s: s.id, dx: Math.sign(c.x - s.x || 1) * .2 });
          c.inv = .6; s.life = 0; break;
        }
      }
    }
    // the storm clouds zap whoever flies into them
    for (const c of fighters) {
      if (c.st !== 'fly' || c.inv > 0) continue;
      const cl = clouds.findIndex(q => Math.abs(c.x - q.x) < .4 && c.y + TOP2 > q.y - .12 && c.y - FOOT < q.y + .18);
      if (cl >= 0) { const b = c.bal - 1; ev({ f: 'pop', v: c.key, b, lv: b === 0 ? loseLife(c) : c.lives, cl, dx: Math.sign(c.x - clouds[cl].x || 1) * .4 }); c.inv = .6; }
    }
    sparkT -= dt;
    if (sparkT <= 0 && state === 'play') {
      const el = clock - goAt;
      sparkT = 9 - el / ROUND * 4 + rnd() * 3;
      if (sparks.filter(s => s.life > 0).length < 3) {
        const a = (rnd() < .5 ? -1 : 1) * (.5 + rnd() * .6) - PI / 2, sp = .5 + el / ROUND * .25;
        ev({ f: 'spk', id: ++sparkId, c: rnd() < .5 ? 0 : 1, vx: Math.round(Math.cos(a) * sp * 1000) / 1000, vy: Math.round(Math.sin(a) * sp * 1000) / 1000 });
      }
    }
    // the fish: whoever skims the lake
    if (fish.st === 'idle' && fish.t <= 0) {
      for (const c of fighters) {
        c.low = c.st === 'fly' && c.inv <= 0 && c.y < WATER + .24 && Math.abs(c.x) < LAKE ? c.low + dt : 0;
        if (c.low > .3) { ev({ f: 'fish', v: c.key, x: Math.round(c.x * 1000) / 1000 }); c.low = 0; break; }
      }
    }
    if (fish.st === 'up' && fish.t >= .45 && !fish.hit) {
      fish.hit = true;
      const c = byKey(fish.v);
      if (c && c.st === 'fly' && Math.abs(c.x - fish.x) < .24 && c.y < WATER + .42) ev({ f: 'eat', v: c.key, lv: loseLife(c) });
    }
    // parachutes reaching the water; respawns
    for (const c of fighters) {
      if (c.st === 'fall') { c.fallT += dt; if (c.y - FOOT <= WATER + .02 || c.fallT > 7) ev({ f: 'sink', v: c.key }); }
      else if (c.st === 'gone') { c.goneT += dt; if (c.goneT > 2.2 && state === 'play') respawnAt(c); }
    }
    // the end: time up, one fighter left, or every human out
    const alive = fighters.filter(c => c.st !== 'out');
    if (state === 'play' && (clock - goAt >= ROUND || alive.length <= 1 || !fighters.some(c => !c.bot && c.st !== 'out'))) ev({ f: 'end', l: stats() });
  }
  function respawnAt(c) {
    if (c.lives <= 0) { ev({ f: 'out', v: c.key }); return; }
    // the spawn farthest from everyone
    let best = SPAWNS[c.slot], bd = -1;
    for (const s of SPAWNS) { let d = Infinity; for (const o of fighters) if (o !== c && live(o)) d = Math.min(d, Math.hypot(o.x - s[0], o.y - s[1])); if (d > bd) { bd = d; best = s; } }
    ev({ f: 'res', v: c.key, x: best[0], y: best[1] });
  }
  const stats = () => fighters.map(c => [c.key, c.bal, c.lives, c.pops, c.score, ST.indexOf(c.st)]);
  function setStats(l) {
    for (const [k, bal, lives, pops, score, st] of l) {
      const c = byKey(k); if (!c) continue;
      c.bal = bal; c.lives = lives; c.pops = pops; c.score = score;
      const s = ST[st]; if (s !== c.st) { c.st = s; if (s === 'fall') c.fallT = 0; if (s === 'gone') c.goneT = 0; }
    }
  }
  function applyEv(o) {
    const v = byKey(o.v), a = byKey(o.a);
    if (o.f === 'pop' && v) {
      burst(v.x + (v.bal > 1 ? v.face * BX : 0), v.y + BY, v.z, v.color);
      v.bal = o.b; v.lives = o.lv;
      if (a) { a.pops = o.ap; a.score = o.as; if (mine(a)) { a.vy = .7; a.flapAnim = 1; } }
      if (mine(v)) { v.vy = Math.min(v.vy, -.3); v.vx += o.dx; }
      if (o.b === 0) { v.st = 'fall'; v.fallT = 0; }
      if (o.s) { const s = sparks.find(q => q.id === o.s); if (s) s.life = 0; }
      if (o.cl != null) { clouds[o.cl].warn = .3; crackle(v.x, v.y + .1, 8, .1); }
      chip.noise(.12, { vol: v === me || a === me ? .5 : .2, f: 4000 });
      if (a === me) { chip.seq([76, 83], .05, { type: .5, vol: .2 }); if (o.b === 0) ui.toast(`${v.name} tombe !`, false, 900); }
      if (v === me) { audio.hurt?.(); shake = .06; if (o.b === 0) ui.toast(me.lives ? 'plus de ballon : parachute !' : 'dernière vie perdue', true, 1200); }
    } else if (o.f === 'pump' && v) { v.bal = 2; v.pumpT = 0; if (v === me) audio.pickup(2); }
    else if (o.f === 'spk') {
      const cl = clouds[o.c];
      sparks = sparks.filter(s => s.life > 0);
      sparks.push({ id: o.id, x: cl.x, y: cl.y - .1, vx: o.vx, vy: o.vy, wait: 1.3, life: 11 });
      cl.warn = 1.3;
      chip.noise(.5, { vol: .12, f: 5000 });
    } else if (o.f === 'fish' && v) {
      fish.st = 'up'; fish.t = 0; fish.x = o.x; fish.v = o.v; fish.hit = false; fish.ate = false;
      splash(o.x, 10); if (v === me) chip.tone(90, 60, .4, { type: 'tri', vol: .4 });
    } else if (o.f === 'eat' && v) {
      v.st = 'gone'; v.goneT = 0; v.bal = 0; v.lives = o.lv; fish.ate = true;
      splash(v.x, 24); chip.tone(160, 50, .35, { type: .5, vol: v === me ? .35 : .15 });
      if (v === me) { audio.splash(); shake = .08; ui.toast(me.lives ? 'croqué par le poisson !' : 'croqué ! plus de vie', true, 1300); }
    } else if (o.f === 'sink' && v) { v.st = 'gone'; v.goneT = 0; splash(v.x, 16); if (v === me) audio.splash(); }
    else if (o.f === 'res' && v) {
      Object.assign(v, { st: 'fly', bal: 2, x: o.x, y: o.y, vx: 0, vy: 0, inv: 1.8, blink: 1.8, fallT: 0, net: null });
      if (v === me) { chip.seq([67, 72, 76], .07, { type: .25, vol: .2 }); }
    } else if (o.f === 'out' && v) { v.st = 'out'; if (v === me) ui.toast('éliminé : plus de vie', true, 1500); }
    else if (o.f === 'end') { setStats(o.l); finish(); }
  }

  // ---------- network ----------
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const pack = (c) => [r3(c.x), r3(c.y), r3(c.vx), r3(c.vy), c.face, c.ground ? 1 : 0, r3(c.pumpT)];
  function unpack(c, a) {
    if (!a) return;
    const [x, y, vx, vy, face, ground, pump] = a;
    c.net = { x, y, vx, vy, t: 0 }; c.face = face; c.ground = !!ground; c.pumpT = pump || 0; c.seen = clock;
    if (vy > c.vy + .3) c.flapAnim = 1;
  }
  function follow(c, dt) {
    const n = c.net; if (!n || !live(c)) return;
    n.t += dt;
    const k = Math.min(n.t, .2), tx = n.x + n.vx * k, ty = n.y + (n.vy - (c.st === 'fly' && !c.ground ? .65 * k : 0)) * k;
    if (Math.hypot(tx - c.x, ty - c.y) > .6) { c.x = tx; c.y = ty; }
    const a = Math.min(1, dt * 14);
    c.x += (tx - c.x) * a; c.y += (ty - c.y) * a; c.vx = n.vx; c.vy = n.vy;
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const c = byKey(pid);
    if (c) c.seen = clock;
    if (fx.t === 's') { if (c && !mine(c)) unpack(c, fx.c); }
    else if (fx.t === 'b' && !isHost) { for (const [k, a] of fx.l) { const b = byKey(k); if (b) unpack(b, a); } }
    else if (fx.t === 'e' && pid === hostId && !isHost) applyEv(fx.e);
    else if (fx.t === 'h' && pid === hostId && !isHost) setStats(fx.l);
    else if (fx.t === 'p' && isHost) doPump(c);
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c) { root.remove(c.m.g); disposeModel(c.m); if (c.tag) root.remove(c.tag); fighters.splice(fighters.indexOf(c), 1); }
    humansIn = humansIn.filter(u => u.id !== id);
    if (id === hostId) {
      hostId = hostOf(humansIn, hostId) ?? meId; isHost = hostId === meId;
      if (isHost) {
        // take the bots over where we last saw them
        for (const b of fighters) if (b.bot && b.net) { b.x = b.net.x; b.y = b.net.y; b.vx = b.net.vx; b.vy = b.net.vy; b.net = null; }
        sparkT = Math.max(sparkT, 4);
        if (fish.st !== 'idle') fish.hit = true;
      }
    }
  }

  // ---------- the frame ----------
  const noKeys = { l: false, r: false, flap: false, down: false };
  const myIn = { l: false, r: false, flap: false, down: false };
  function update(dt, keys) {
    if (state === 'off') return;
    dt = clamp(dt, 0, .05);
    clock += dt; wt += dt;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'play'; goAt = clock; audio.buy(); chip.seq([72, 76, 79, 84], .09, { type: .25, vol: .2 }); }
    }
    const play = state === 'play' || state === 'end';
    myIn.l = keys.has('KeyA') || keys.has('ArrowLeft'); myIn.r = keys.has('KeyD') || keys.has('ArrowRight');
    myIn.flap = wantFlap(keys); myIn.down = keys.has('KeyS') || keys.has('ArrowDown');
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      for (const c of fighters) {
        if (!mine(c)) continue;
        const I = !play ? noKeys : c === me ? (auto ? botThink(c, STEP) : myIn) : botThink(c, STEP);
        stepFighter(c, I, STEP);
      }
      for (const s of sparks) stepSpark(s, STEP);
      if (isHost && state === 'play') arbitrate(STEP);
    }
    for (const c of fighters) if (!mine(c)) follow(c, dt);
    sparks = sparks.filter(s => s.life > 0);
    animate(dt);
    // drop the humans that never came
    if (play && clock > 9) for (const c of [...fighters]) if (!c.bot && !mine(c) && clock - c.seen > 9) peerLeft(c.key);
    sendT -= dt; snapT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      if (me) send({ t: 's', c: pack(me) });
      if (isHost) { const l = fighters.filter(c => c.bot && live(c)).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', l }); }
    }
    if (isHost && snapT <= 0 && state === 'play') { snapT = .5; send({ t: 'h', l: stats() }); }
    // a lost host: finish on our own clock
    if (state === 'play' && clock - goAt > ROUND + 2) finish();
    if (endT > 0) { endT -= dt; if (endT <= 0 && !ended) { ended = true; onEnd(result); } }
    cam(dt);
  }

  // ---------- drawing ----------
  function animate(dt) {
    stepWater(wt);
    for (const c of fighters) {
      const m = c.m, show = live(c);
      m.g.visible = show;
      if (c.tag) c.tag.visible = show;
      if (!show) continue;
      c.turn += (c.face - c.turn) * Math.min(1, dt * 10);
      c.flapAnim = Math.max(0, c.flapAnim - dt * 4);
      c.blink = Math.max(0, c.blink - dt);
      m.g.position.set(c.x, c.y, c.z);
      // turned three-quarters to the camera, leaning into the drift
      m.g.rotation.set(0, -.4 - (1 - c.turn) / 2 * (PI - .8), clamp(-c.vx * c.face * .3, -.25, .25));
      m.body.position.y = -c.flapAnim * .01;
      const fall = c.st === 'fall';
      m.chute.visible = fall;
      if (fall) m.body.rotation.z = Math.sin(clock * 3 + c.slot) * .2; else m.body.rotation.z = 0;
      for (let k = 0; k < 2; k++) {
        const b = m.balloons[k];
        b.visible = !fall && (c.bal === 2 || (c.bal === 1 && k === 0) || (c.bal === 1 && k === 1 && c.pumpT > 0));
        const pump = c.bal === 1 && k === 1 ? clamp(c.pumpT / 1.2, .1, 1) : 1;
        b.position.x = c.bal === 1 && k === 0 ? 0 : (k ? -BX : BX);
        b.scale.set(pump, pump * (1 + c.flapAnim * .08), pump);
        b.rotation.z = Math.sin(clock * 2.3 + k * 2 + c.slot) * .08;
      }
      if (c.blink > 0) m.g.visible = Math.floor(c.blink * 12) % 2 === 0;
      if (c.tag) c.tag.position.set(c.x, c.y + .28, c.z);
    }
    for (const f of flips) { f.w += (1.2 * Math.sign(f.w || 1) - f.w) * Math.min(1, dt * 1.5); f.spin += f.w * dt; f.g.rotation.z = f.spin; }
    // clouds: grumbling, flashing hard before they let a spark go
    for (const cl of clouds) {
      cl.warn = Math.max(0, cl.warn - dt);
      const flash = cl.warn > 0 ? (Math.sin(clock * 40) > 0 ? 1 : .2) : 0;
      cl.mat.emissive.setRGB(.06 + flash * 1.4, .05 + flash * 1.3, .14 + flash * .6);
      cl.bolt.visible = cl.warn > 0 ? flash > .5 : Math.sin(clock * 1.3 + cl.x * 3) > .92;
      cl.crack -= dt;
      if (cl.crack <= 0) { cl.crack = cl.warn > 0 ? .03 : .15 + Math.random() * .4; crackle(cl.x, cl.y, cl.warn > 0 ? 3 : 1, .3); }
    }
    let n = 0;
    for (const s of sparks) {
      if (s.life <= 0 || n >= sparkMeshes.length) continue;
      const m = sparkMeshes[n++];
      m.visible = true; m.position.set(s.x, s.y, .02); m.rotation.set(clock * 7, clock * 5, clock * 9);
      m.scale.setScalar(s.wait > 0 ? .5 + Math.random() * .3 : .85 + Math.random() * .3);
      if (Math.random() < .3) glow.emit(s.x, s.y, .02, (Math.random() - .5) * .4, (Math.random() - .5) * .4, 0, .005, .12, 0xffffff, 0);
    }
    for (; n < sparkMeshes.length; n++) sparkMeshes[n].visible = false;
    // the fish: out of the water with its mouth wide, a snap, back under
    if (fish.st === 'up') {
      fish.t += dt;
      const t = fish.t;
      fish.g.visible = true;
      const rise = t < .45 ? t / .45 : Math.max(0, 1 - (t - .45) / .55);
      fish.g.position.set(fish.x, WATER - .36 + rise * .56, 0);
      fish.g.rotation.set(0, -.6, Math.sin(t * 5) * .15 + (t > .45 ? -.4 : 0));
      fish.jaw.rotation.z = t < .45 ? .9 * Math.min(1, t * 4) : Math.max(0, .9 - (t - .45) * 12);
      if (t > 1.05) { fish.st = 'idle'; fish.g.visible = false; fish.t = .9; splash(fish.x, 14); }
    } else if (fish.t > 0) fish.t -= dt;
    bits.step(dt); glow.step(dt);
  }
  // before and between games: the diorama tells its story
  const idle = [];
  function idlePose() {
    for (const c of idle) { root.remove(c.m.g); disposeModel(c.m); }
    idle.length = 0;
    const pose = [[-1.25, 1.62, 0xe8384f, 1, 2], [-1.05, 1.38, 0x3a8ef0, -1, 1], [2.2, 2.5 + FOOT, 0x45c060, -1, 2], [.3, 2.55, 0xf2c230, 1, 0]];
    for (const [x, y, color, face, bal] of pose) {
      const m = fighterModel(color); m.g.position.set(x, y, 0); m.g.rotation.y = face > 0 ? -.4 : PI + .4;
      m.balloons[1].visible = bal === 2; if (bal === 1) m.balloons[0].position.x = 0;
      m.balloons[0].visible = bal > 0; m.chute.visible = bal === 0;
      root.add(m.g); idle.push({ m });
    }
    fish.g.visible = true; fish.g.position.set(-.55, WATER + .04, 0); fish.g.rotation.set(0, -.6, .2); fish.jaw.rotation.z = .9;
    const s = sparkMeshes[0]; s.visible = true; s.position.set(.9, 2.55, .02);
    for (const cl of clouds) { cl.bolt.visible = true; cl.mat.emissive.setRGB(.25, .22, .3); }
    for (const f of flips) f.g.rotation.z = .5;
  }
  idlePose();
  function showIdle(on) { for (const c of idle) c.m.g.visible = on; }

  // ---------- the camera: from the stalls, tracking you with a little look-ahead ----------
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), eye = new THREE.Vector3(), wide = new THREE.Vector3(), aim = new THREE.Vector3();
  let camX = 0, camY = 1.8, leadX = 0;
  function cam(dt) {
    showIdle(false);
    const f = me && live(me) ? me : fighters.filter(live).sort((a, b) => b.score - a.score)[0];
    const fx = f ? f.x : 0, fy = f ? f.y + .08 : 1.8;
    leadX += ((f ? clamp(f.vx, -1, 1) * .45 : 0) - leadX) * Math.min(1, dt * 2);
    const k = Math.min(1, dt * 4);
    camX += (clamp(fx + leadX, -1.75, 1.75) - camX) * k;
    camY += (clamp(fy + .05, 1.05, 2.75) - camY) * k;
    camPos.set(at.x + camX * .96, at.y + camY + .32, at.z + 2.45);
    look.set(at.x + camX, at.y + camY, at.z - .1);
    if (state === 'count') {
      // from the back of the stalls, the whole stage, down to your seat
      const t = clamp(1 - Math.pow(Math.max(0, count - .5) / 3, 2), 0, 1);
      wide.set(at.x, at.y + 2, at.z + 6.2); aim.set(at.x, at.y + 1.9, at.z);
      camPos.lerpVectors(wide, camPos, t); look.lerpVectors(aim, look, t);
      eye.copy(camPos);
    } else eye.lerp(camPos, Math.min(1, dt * 10));
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .3); camera.position.x += (Math.random() - .5) * shake * .3; camera.position.y += (Math.random() - .5) * shake * .3; }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.fov += (52 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  const final = (c) => c.score + c.lives * 100;
  const order = () => [...fighters].sort((a, b) => final(b) - final(a) || b.lives - a.lives || b.pops - a.pops);
  function finish() {
    if (state === 'end' || state === 'off') return;
    state = 'end';
    if (!me) { result = { place: fighters.length, of: fighters.length, value: 0, time: clock - goAt, text: 'partie terminée' }; endT = 3; return; }
    const o = order(), place = o.indexOf(me) + 1;
    result = { place, of: fighters.length, value: final(me), time: Math.min(ROUND, clock - goAt), text: `${ord(place)} place · ${me.pops} ballon${me.pops > 1 ? 's' : ''} éclaté${me.pops > 1 ? 's' : ''}` };
    ui.toast(place === 1 ? 'victoire !' : `${ord(place)} place`, false, 2200);
    if (place === 1) audio.win(); else chip.seq([72, 67, 64, 60], .12, { type: .5, vol: .2 });
    endT = 3;
  }

  const hearts = (n) => '♥'.repeat(n) + '<span style="opacity:.3">' + '♥'.repeat(Math.max(0, LIVES - n)) + '</span>';
  return {
    modes: MODES,
    keys: [['espace / z', 'battre des bras'], ['q d', 'dériver à gauche, à droite'], ['s', 'au sol, un seul ballon : en regonfler un'], ['tombe sur eux', 'éclate leurs ballons par-dessus']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { count: 0 };
      const left = Math.max(0, ROUND - (clock - goAt)), el = clock - goAt;
      const line = me.st === 'out' ? 'éliminé · tu regardes la fin' : me.st === 'gone' ? 'retour dans un instant…' : me.st === 'fall' ? 'plus de ballon : parachute !' :
        el < 7 ? 'espace : battre des bras · tombe sur leurs ballons' : me.pumpT > 0 ? 'on regonfle…' : me.bal === 1 && me.ground ? 's : regonfler un ballon' : `ballons <em>${me.bal}</em>`;
      const o = order();
      return { html: `<b>ballons fous</b><span class="big">${mmss(left)}</span><span>${hearts(me.lives)} · ${me.score} pts · ${line}</span>` +
        `<div class="board">${o.map((c, i) => `<span style="color:${hexOf(c.color)}">${i + 1}. ${c.name} ${'♥'.repeat(c.lives)} ${c.score}${c === me ? ' ◂' : ''}</span>`).join('')}</div>` };
    },
    preview() { return { x: at.x, y: at.y + 1.8, z: at.z, yaw: PI, rad: 4.4, h: .1 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get me() { return me; }, get fighters() { return fighters; }, get sparks() { return sparks; }, get fish() { return fish; }, get isHost() { return isHost; }, get state() { return state; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _clock(t) { goAt = clock - t; },
  };
}
