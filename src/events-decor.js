// events-decor.js, where each feast puts its things: the tree on the square, bulbs on the
// house and the church, pumpkins on the doorsteps, eggs in the garden (and in the ground),
// fireworks over the village, lanterns in japan… Built only while the feast is on, torn down
// after (events.js). A builder gets a ctx and gives back what the manager needs:
//   spots: the hunt's things (id, w, p world, obj, buried?)
//   uses:  through ctx.use({ pos, kind, data }), what `e` does (events-play.js decides)
//   update(dt, t, env): what moves
import * as THREE from 'three';
import * as A from './events-art.js';
import { createBlossoms } from './street.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FX = 61, FZ = 2;                         // the fountain (europe.js)
const SQ = { x0: 44, x1: 78, z0: -10.78, z1: 14 };
const STALL = V(47.5, 0, 5);                   // a feast's stall, on the square's west side
const inSquare = (x, z) => x > SQ.x0 && x < SQ.x1 && z > SQ.z0 && z < SQ.z1;
const inChurch = (x, z) => x > 55.5 && x < 66.5 && z > 12 && z < 39;
export const groundY = (x, z) => inSquare(x, z) || inChurch(x, z) ? .11 : .01;

// the garden, the street, the square, the church, the town hall: somewhere to hide things
const HOME_SPOTS = [
  [-14, -4], [-18, 12], [-12, 24], [-24, 18], [-34, 8], [-36, 26], [12, 14], [21, 8], [26, 22], [34, 13], [36, 31], [22, 40],
  [-12, 42], [6, 44], [-21, 37], [0, 26], [-38, -6], [38, -4],
  [47, -8], [46, 11], [76, 12.5], [75.5, -9], [50, -.5], [72.5, .5], [61, 11.4], [58.5, 22], [63.5, 30], [66, -1.5],
  [25, -11.3], [-25, -11.3], [95, -11.3], [-95, -11.3], [-60, -9.5], [-52, -3], [85, 1], [40, 1],
];
// the dig plot, just under the grass: [x, depth, z]
const BURIED = [[-5.4, 1, -3.8], [4.6, 1.4, 5.4], [-2.2, 2.2, 5.8], [6.2, 1.8, -5.4], [1.4, 2.8, -1.4], [-6, 3.2, 1.8], [2.6, 3.6, 3]];
// japan (its town's own frame, CHINA added by the manager)
const JP_SPOTS = [[14, -11], [21, -5], [30, -7], [35, -12], [42, -8], [12, -2], [26, -14.5], [46, 6], [53, 2], [-15, 4], [-15, 22], [4, 20], [22, 20], [-30, 20]];

// ---------- shared: pick hunt spots, free of walls and not on the dig plot ----------
function pickSpots(ctx, list, n, seed, w = 'home') {
  const r = ctx.rng(seed);
  const pool = list.map((p) => [p, r()]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
  const out = [];
  for (const [x, z] of pool) {
    if (out.length >= n) break;
    const p = ctx.free(x, z, w);
    if (p) out.push(p);
  }
  return out;
}
function hideSpots(ctx, { n, seed, make, buried = 0, bury = null, w = 'home', list = HOME_SPOTS, y = 0 }) {
  const spots = [];
  const parent = w === 'home' ? ctx.home : ctx.jp;
  pickSpots(ctx, list, n, seed, w).forEach(([x, z], i) => {
    const obj = make(i); obj.position.set(x, (w === 'home' ? groundY(x, z) : .02) + y, z); obj.rotation.y = i * 1.7;
    parent.add(obj);
    spots.push({ id: i, w, p: w === 'home' ? obj.position.clone() : obj.position.clone().add(ctx.JP), obj });
  });
  for (let i = 0; i < buried; i++) {
    const [x, d, z] = BURIED[i % BURIED.length];
    const obj = (bury || make)(n + i); obj.position.set(x, -d - .12, z); obj.visible = false;
    ctx.home.add(obj);
    spots.push({ id: n + i, w: 'home', p: obj.position.clone().add(V(0, .12, 0)), obj, buried: true });
  }
  return spots;
}
const bob = (spots, t, amp = .06) => { for (const s of spots) if (s.obj.visible && !s.buried) s.obj.children[0].position.y = (s.base ??= s.obj.children[0].position.y) + Math.sin(t * 2 + s.id) * amp; };

// ---------- the neighbours' doors: where to knock, a step out and to the side ----------
function doorsteps(ctx, out = 1.5, side = 1.1) {
  return ctx.doors.map(d => ({ ...d, step: d.pos.clone().setY(0).addScaledVector(d.out, out).add(V(-d.out.z * side, 0, d.out.x * side)) }));
}

// ---------- the buildings' outlines, for the bulbs ----------
function houseLights(b) {
  const z = -14.86;
  b.add(V(-5.6, 3.45, z), V(5.6, 3.45, z), 34, .08);
  b.add(V(-5.6, 6.38, z), V(5.6, 6.38, z), 34, .08);
  b.path([V(-.7, 0.1, z), V(-.7, 2.3, z), V(.7, 2.3, z), V(.7, .1, z)], .25, .02);
}
function churchLights(b) {
  const z = 12.1;
  b.path([V(57.7, .4, z), V(57.7, 21.6, z), V(64.3, 21.6, z), V(64.3, .4, z)], .55, .02);
  b.path([V(57.7, 21.9, z), V(61, 34, 9.5), V(64.3, 21.9, z)], .6, .02);
}
function squareStrings(b, h = 4.1) {
  const L = [V(46, h, 12.5), V(76, h, 12.5), V(72.5, h, -10.3), V(53, h, -10.3)];
  for (let i = 0; i < 4; i++) { const a = L[i], c = L[(i + 1) % 4]; b.add(a, c, Math.round(a.distanceTo(c) / .45), .7); }
  b.add(V(57, h, -1.5), V(65, h, -1.5), 18, .4);
  b.add(L[0], V(57, h, -1.5), 26, .8); b.add(L[1], V(65, h, -1.5), 26, .8);
}
function streetStrings(b, xs = [-34, -22, 18, 30, 88, 102], y = 5.2) { for (const x of xs) b.add(V(x, y, -16.1), V(x, y, -10.7), 12, .5); }

// ============================== the feasts ==============================
export const DECOR = {
  // ---------- noël: snow (forced by the manager), the tree, bulbs everywhere, the sleigh ----------
  noel(ctx) {
    const H = ctx.home;
    const bulbs = ctx.bulbs(H);
    houseLights(bulbs); churchLights(bulbs); squareStrings(bulbs); streetStrings(bulbs);
    const TREE = V(70.5, .1, 3.5);
    const tree = A.firTree(7.5); tree.position.copy(TREE); H.add(tree);
    const spiral = [];
    for (let i = 0; i < 90; i++) { const t = i / 90, y = 1 + t * 5.9, r = (1 - (y - .8) / 7.5) * 7.5 * .31 + .22, a = t * 10 * Math.PI; spiral.push(V(TREE.x + Math.cos(a) * r, TREE.y + y, TREE.z + Math.sin(a) * r)); }
    const treeBulbs = ctx.bulbs(H, [0xffd23a, 0xfff4d8, 0xff5a3a]); for (const p of spiral) treeBulbs.point(p);
    ctx.addBox(TREE.x - .6, 0, TREE.z - .6, TREE.x + .6, 4, TREE.z + .6);
    const colors = [[0xc8282e, 0xffd75e], [0x2a6a3a, 0xf4f0e6], [0x2a4a8a, 0xe8e8f0], [0xf4f0e6, 0xc8282e], [0x8a3ab0, 0xffd75e]];
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + .3, r = 1.5 + (i % 3) * .35; const pr = A.present(...colors[i % colors.length], .8 + (i % 3) * .35); pr.position.set(TREE.x + Math.cos(a) * r, TREE.y, TREE.z + Math.sin(a) * r); pr.rotation.y = a; H.add(pr); }
    ctx.use({ pos: V(TREE.x - 2.3, 1, TREE.z - .5), kind: 'gift', reach: 2.8 });
    // the christmas market's chalet, and snowmen about
    const ch = A.chalet(ctx.label('marché de noël', { w: 512, h: 72, size: 46, bg: '#2a1a10', color: '#ffd75e' })); ch.position.copy(STALL); ch.rotation.y = Math.PI / 2; H.add(ch);
    ctx.addBox(STALL.x - .45, 0, STALL.z - 1.45, STALL.x + .45, 1.1, STALL.z + 1.45);
    ctx.use({ pos: V(STALL.x + 1.1, 1, STALL.z), kind: 'stall', reach: 2.4 });
    const sBulbs = ctx.bulbs(H, [0xfff0c8]); sBulbs.add(V(STALL.x + .5, 2.4, STALL.z - 1.5), V(STALL.x + .5, 2.4, STALL.z + 1.5), 12, .15);
    for (const [x, z, r, s] of [[-16, 8, .4, 1], [18, 18, -.6, 1.1], [52, 11.8, 2.4, .9], [-8.5, -8.8, .2, .8], [-24, 32, 1, 1]]) { const sm = A.snowman(s); sm.position.set(x, groundY(x, z), z); sm.rotation.y = r; H.add(sm); ctx.addBox(x - .4 * s, 0, z - .4 * s, x + .4 * s, 1.6 * s, z + .4 * s); }
    // wreaths on the neighbours' doors, and ours
    for (const d of ctx.doors) { const w = new THREE.Mesh(new THREE.TorusGeometry(.26, .08, 6, 14), A.lam(0x1f5a32)); w.position.copy(d.pos).addScaledVector(d.out, .12).setY(1.75); w.lookAt(w.position.clone().add(d.out)); H.add(w); }
    { const w = new THREE.Mesh(new THREE.TorusGeometry(.26, .08, 6, 14), A.lam(0x1f5a32)); w.position.set(0, 2.55, -14.8); H.add(w); const b2 = A.present(0xc8282e, 0xc8282e, .4); b2.position.set(0, 2.25, -14.75); H.add(b2); }
    // santa's presents, dropped all over the place
    const spots = hideSpots(ctx, { n: 12, seed: 25, make: (i) => A.present(...colors[i % colors.length], .9) });
    // the sleigh, round and round over the village at night
    const sl = A.sleigh(); sl.visible = false; sl.userData.keep = true; sl.scale.setScalar(1.4); H.add(sl);
    const bells = ctx.bulbs(sl, [0xffd23a]); bells.add(V(-.5, 1.1, 1.2), V(-.5, 1.1, 5.5), 8, 0); bells.add(V(.5, 1.1, 1.2), V(.5, 1.1, 5.5), 8, 0);
    return {
      spots,
      update(dt, t, env) {
        bob(spots, t, .03);
        tree.userData.star.rotation.y = t * .8;
        sl.visible = env.night > .45;
        if (sl.visible) {
          const a = t * .09, R = 70;
          sl.position.set(20 + Math.cos(a) * R, 34 + Math.sin(t * .7) * 3, 10 + Math.sin(a) * R);
          sl.rotation.y = -a + Math.PI;
          for (const r of sl.children) if (r.userData.legs) r.userData.legs.forEach((l, k) => { l.rotation.x = Math.sin(t * 9 + k * 1.6) * .5; });
        }
      },
    };
  },

  // ---------- nouvel an: a banner, and fireworks at midnight (the manager lights them) ----------
  nouvelan(ctx) {
    const H = ctx.home;
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: ctx.label('bonne année !', { w: 1024, h: 170, size: 120, color: '#ffd75e', bg: '#1a130c' }), side: THREE.DoubleSide }));
    ban.position.set(FX, 5.2, -10.4); H.add(ban);
    const b = ctx.bulbs(H, [0xffd23a, 0xfff4d8]); b.add(V(53, 4.1, -10.3), V(72.5, 4.1, -10.3), 40, .5); squareStrings(b, 3.9);
    const fw = ctx.fireworks(H);
    return { fireworks: fw, launchers: [V(0, 0, 66), V(FX, 0, 52), V(-40, 0, 62), V(40, 0, 60)] };
  },

  // ---------- épiphanie: the galette on a table outside the bakery ----------
  epiphanie(ctx) {
    const H = ctx.home;
    const T = V(72.6, .11, -7.4);
    const tb = new THREE.Group(); tb.position.copy(T); H.add(tb);
    A.mesh(new THREE.CylinderGeometry(.55, .55, .05, 18), A.lam(0xf4efe6), 0, .78, 0, tb);
    A.mesh(new THREE.CylinderGeometry(.05, .05, .78, 6), A.lam(0x2a2e34), 0, .39, 0, tb);
    const gal = A.galette(true); gal.position.y = .81; tb.add(gal);
    const g2 = A.galette(false); g2.position.set(.3, .81, .25); g2.scale.setScalar(.6); tb.add(g2);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .35), new THREE.MeshBasicMaterial({ map: ctx.label('galette des rois', { w: 512, h: 128, size: 64, bg: '#2a4a78', color: '#f2d78a' }), side: THREE.DoubleSide }));
    sign.position.set(0, 1.5, 0); sign.rotation.y = -Math.PI / 2; tb.add(sign);
    A.mesh(new THREE.CylinderGeometry(.02, .02, .7, 5), A.lam(0x2a2e34), 0, 1.15, 0, tb);
    ctx.addBox(T.x - .55, 0, T.z - .55, T.x + .55, .85, T.z + .55);
    ctx.use({ pos: V(T.x - 1, 1, T.z), kind: 'galette', reach: 2.2 });
    const b = ctx.bulbs(H, [0xffd23a, 0xfff4d8]); b.add(V(74.2, 3, -10), V(74.2, 3, -1.2), 20, .3);
    return {};
  },

  // ---------- crêpes (chandeleur, mardi gras): a stand on the square, confetti bunting ----------
  crepes(ctx) {
    const H = ctx.home;
    const st = A.stall(ctx.label('crêpes', { w: 512, h: 72, size: 44, bg: '#2a4a78', color: '#ffd75e' }), { stripes: ['#2a4a78', '#f4efe6'] });
    st.position.copy(STALL); st.rotation.y = Math.PI / 2; H.add(st);
    const pan = A.mesh(new THREE.CylinderGeometry(.22, .2, .04, 16), A.std(0x2a2a2e), 0, 1.1, .1, st);
    const cr = A.crepe(); cr.position.set(0, 1.14, .1); cr.userData.keep = true; st.add(cr);
    for (let i = 0; i < 5; i++) { const c = A.crepe(); c.position.set(.7, 1.06 + i * .012, 0); st.add(c); }
    ctx.addBox(STALL.x - .45, 0, STALL.z - 1.35, STALL.x + .45, 1.1, STALL.z + 1.35);
    ctx.use({ pos: V(STALL.x + 1.1, 1, STALL.z), kind: 'crepe', reach: 2.4 });
    const conf = [0xe8384f, 0xf6d23a, 0x4a9ae8, 0x6ac86a, 0xb04ad8, 0xf2a43a];
    for (const [a, b] of [[V(46, 4, 12.5), V(76, 4, 12.5)], [V(53, 4, -10.3), V(72.5, 4, -10.3)], [V(46, 4, 12.5), V(53, 4, -10.3)]]) H.add(A.bunting(a, b, conf, { size: .26 }));
    return { flip: cr, pan, update(dt, t) { void pan; if (cr.userData.fly > 0) { cr.userData.fly -= dt; const k = 1 - cr.userData.fly / .9; cr.position.y = 1.14 + Math.sin(k * Math.PI) * 1.2; cr.rotation.x = k * Math.PI * 2; } else { cr.position.y = 1.14; cr.rotation.x = 0; } void t; } };
  },

  // ---------- saint-valentin: floating hearts to catch, pink bunting, balloons ----------
  valentin(ctx) {
    const H = ctx.home;
    const pink = [0xff4a7a, 0xf6f0f4, 0xe8384f, 0xf6a8c8];
    for (const [a, b] of [[V(46, 4, 12.5), V(76, 4, 12.5)], [V(53, 4, -10.3), V(72.5, 4, -10.3)], [V(52.2, 3.2, -9), V(52.2, 3.2, -2)]]) H.add(A.bunting(a, b, pink, { size: .24 }));
    const balloons = [];
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const h = A.heart(1.4, i % 2 ? 0xff4a7a : 0xe8283e); h.position.set(FX + Math.cos(a) * 2.2, 4 + (i % 3) * .5, FZ + Math.sin(a) * 2.2); h.userData.keep = true; H.add(h); balloons.push(h); }
    const line = [];
    for (const h of balloons) line.push(h.position.clone(), V(FX, 2.6, FZ));
    H.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(line), A.lam(0xf4f0f4)));
    const spots = hideSpots(ctx, { n: 14, seed: 214, y: 1.1, make: (i) => A.heart(.7, i % 3 ? 0xff4a7a : 0xe8283e) });
    return { spots, update(dt, t) { bob(spots, t, .12); for (const s of spots) s.obj.rotation.y += dt * 1.2; balloons.forEach((h, i) => { h.rotation.y = Math.sin(t * .8 + i) * .5; h.position.y += Math.sin(t * 1.3 + i) * dt * .15; }); } };
  },

  // ---------- pâques: eggs in the garden, the town, and under the grass; bells; a rabbit ----------
  paques(ctx) {
    const H = ctx.home;
    const pastel = [0xf6a8c8, 0xa8d8f6, 0xf6e8a0, 0xb8f0b8, 0xd8b8f6];
    for (const [a, b] of [[V(46, 4, 12.5), V(76, 4, 12.5)], [V(53, 4, -10.3), V(72.5, 4, -10.3)], [V(-20, 5, -16.1), V(-20, 5, -10.7)], [V(20, 5, -16.1), V(20, 5, -10.7)]]) H.add(A.bunting(a, b, pastel, { size: .26 }));
    // big painted eggs for show: on the square, by the house
    for (const [x, z, s, n] of [[57, 9.2, 5, 0], [65, 9.2, 5.5, 3], [-2.6, -14.2, 3.5, 1], [2.6, -14.2, 3.5, 4]]) { const e = A.egg(n); e.scale.setScalar(s); e.position.set(x, groundY(x, z), z); H.add(e); }
    const st = A.stall(ctx.label('chocolaterie', { w: 512, h: 72, size: 46, bg: '#5a3218', color: '#f6e8c8' }), { stripes: ['#f6a8c8', '#f4efe6'] });
    st.position.copy(STALL); st.rotation.y = Math.PI / 2; H.add(st);
    for (let i = 0; i < 6; i++) { const e = A.egg(i); e.scale.setScalar(1.3); e.position.set(-.9 + i * .36, 1.02, .1); st.add(e); }
    const choc = A.bunny(.9); choc.traverse(o => { if (o.isMesh) o.material = A.lam(0x6a3a1a); }); choc.position.set(.95, 1.02, 0); st.add(choc);
    ctx.addBox(STALL.x - .45, 0, STALL.z - 1.35, STALL.x + .45, 1.1, STALL.z + 1.35);
    ctx.use({ pos: V(STALL.x + 1.1, 1, STALL.z), kind: 'stall', reach: 2.4 });
    const gold = 18;
    const spots = hideSpots(ctx, { n: 12, seed: 41, buried: 7, make: (i) => A.egg(i, i === gold) });
    // the golden one: the deepest
    const last = spots[spots.length - 1]; last.gold = true;
    last.obj.children[0].material = A.std(0xffc83a, { metalness: .9, roughness: .2, emissive: 0x5a3a00 });
    // the bells, back from rome, crossing the sky; a white rabbit hopping in the garden
    const bells = [0, 1, 2].map(i => { const b = A.bell(1.6); H.add(b); return { b, ph: i * 2.1 }; });
    const rab = A.bunny(1.2); rab.userData.keep = true; H.add(rab);
    return {
      spots,
      update(dt, t, env) {
        bob(spots, t, .02);
        for (const { b, ph } of bells) {
          const k = ((t * .018 + ph / 6) % 1);
          b.visible = env.day > .3;
          b.position.set(160 - k * 320, 26 + Math.sin(t * 1.3 + ph) * 2 + ph, 60 - k * 120 + ph * 8);
          b.rotation.set(Math.sin(t * 3 + ph) * .3, -.5, Math.sin(t * 2 + ph) * .2);
          b.userData.wings.forEach((w, s) => { w.rotation.y = (s ? -1 : 1) * (.3 + Math.sin(t * 10 + ph) * .5); });
        }
        const a = t * .35, hop = Math.abs(Math.sin(t * 5));
        rab.position.set(-14 + Math.cos(a) * 6, hop * .35, 20 + Math.sin(a) * 6);
        rab.rotation.y = -a;
      },
    };
  },

  // ---------- poisson d'avril: paper fish on the passers-by (some already done) ----------
  poisson(ctx) {
    const H = ctx.home;
    for (const [x, y, z, r] of [[0, 1.6, -14.78, 0], [61, 2, 12.1, Math.PI], [-60, 1.8, -10.8, 0]]) { const f = A.paperFish(0xf2a43a); f.position.set(x, y, z); f.rotation.y = r; f.scale.setScalar(2); H.add(f); }
    const blues = [0x6ab0e8, 0xf2a43a, 0x6ac86a, 0xe8384f];
    const fishLine = (a, b) => { const n = Math.round(a.distanceTo(b) / .6); for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); p.y -= Math.sin(i / n * Math.PI) * .5 + .15; const f = A.paperFish(blues[i % 4]); f.position.copy(p); f.rotation.set(0, Math.atan2(b.z - a.z, a.x - b.x), Math.PI / 2); f.scale.setScalar(1.6); H.add(f); } };
    fishLine(V(53, 4, -10.3), V(72.5, 4, -10.3)); fishLine(V(-20, 5, -16.1), V(-20, 5, -10.7)); fishLine(V(20, 5, -16.1), V(20, 5, -10.7));
    return {};
  },

  // ---------- fête de la musique: three musicians on the square, notes in the air ----------
  musique(ctx) {
    const H = ctx.home;
    const band = [[47.8, -1, 'accordeon', 0x2a4a78], [48.3, 1.6, 'guitare', 0xc8282e], [47.8, 4.2, 'trompette', 0x3a6a4a]].map(([x, z, what, c], i) => {
      const m = A.musician(c, what); m.position.set(x, .11, z); m.rotation.y = Math.PI / 2; H.add(m);
      ctx.addBox(x - .3, 0, z - .3, x + .3, 1.8, z + .3);
      ctx.use({ pos: V(x + .9, 1, z), kind: 'busk', data: { i, what }, reach: 1.9 });
      return m;
    });
    const notes = Array.from({ length: 12 }, (_, i) => { const s = A.noteSprite(); H.add(s); return { s, ph: i / 12, from: band[i % 3].position }; });
    const flags = [0xe8384f, 0xf6d23a, 0x4a9ae8, 0x6ac86a];
    H.add(A.bunting(V(46, 4, 12.5), V(46, 4, -8), flags, { size: .26 }));
    return {
      organ: true,
      update(dt, t) {
        band.forEach((m, i) => { m.rotation.z = Math.sin(t * 4 + i) * .04; m.userData.inst.rotation.z = Math.sin(t * 6 + i) * .15; });
        for (const n of notes) { const k = (t * .25 + n.ph) % 1; n.s.position.set(n.from.x + .5 + k * 1.5 + Math.sin(t + n.ph * 9) * .3, 1.8 + k * 2.5, n.from.z + Math.sin(k * 6 + n.ph * 7) * .5); n.s.material.opacity = 1 - k; }
      },
    };
  },

  // ---------- 14 juillet: tricolour bunting, flags, the ball's bulbs, fireworks at night ----------
  juillet(ctx) {
    const H = ctx.home;
    const bbr = [0x1d3a8a, 0xf4f4f2, 0xd8262e];
    for (const [a, b] of [[V(46, 4, 12.5), V(76, 4, 12.5)], [V(53, 4, -10.3), V(72.5, 4, -10.3)], [V(46, 4, 12.5), V(53, 4, -10.3)], [V(76, 4, 12.5), V(72.5, 4, -10.3)]]) H.add(A.bunting(a, b, bbr, { size: .3 }));
    for (const x of [-34, -22, 18, 30, 88, 102, -70, -50]) H.add(A.bunting(V(x, 5.2, -16.1), V(x, 5.2, -10.7), bbr, { size: .28 }));
    const flags = [];
    for (const [x, z] of [[53, -10.3], [72.5, -10.3], [46, 12.5], [76, 12.5], [-2.2, -15], [2.2, -15], [-49, -9.8], [-71, -9.8]]) { const f = A.flag(); f.position.set(x, 3.2, z); f.rotation.y = Math.PI / 2; H.add(f); flags.push(f.userData.cloth); }
    const b = ctx.bulbs(H, [0x4a6aff, 0xffffff, 0xff3a3a]); b.add(V(57, 4.1, -1.5), V(65, 4.1, -1.5), 18, .4); b.add(V(46, 4.3, 12.5), V(65, 4.1, -1.5), 30, .9); b.add(V(76, 4.3, 12.5), V(57, 4.1, -1.5), 30, .9);
    const st = A.stall(ctx.label('buvette du bal', { w: 512, h: 72, size: 46, bg: '#1d3a8a', color: '#f4f4f2' }), { stripes: ['#1d3a8a', '#f4f4f2'] });
    st.position.copy(STALL); st.rotation.y = Math.PI / 2; H.add(st);
    ctx.addBox(STALL.x - .45, 0, STALL.z - 1.35, STALL.x + .45, 1.1, STALL.z + 1.35);
    ctx.use({ pos: V(STALL.x + 1.1, 1, STALL.z), kind: 'stall', reach: 2.4 });
    const spots = hideSpots(ctx, { n: 10, seed: 1789, y: .02, make: () => { const c = A.cocarde(1.4); const w = new THREE.Group(); c.position.y = .3; w.add(c); return w; } });
    const fw = ctx.fireworks(H);
    return {
      spots, fireworks: fw, launchers: [V(FX, 0, 58), V(0, 0, 70), V(30, 0, 64), V(-30, 0, 64)], tricolor: true,
      update(dt, t) {
        bob(spots, t, .05); for (const s of spots) s.obj.rotation.y += dt;
        for (const f of flags) { const p = f.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k); p.setZ(k, Math.sin(t * 5 + x * 6) * .06 * (x + .45)); } p.needsUpdate = true; }
      },
    };
  },

  // ---------- halloween: pumpkins, bats, ghosts in the hole, the witch's stall, fog ----------
  halloween(ctx) {
    const H = ctx.home;
    for (const [x, z, s] of [[-1.3, -14.4, 1.2], [1.3, -14.4, 1], [-3.4, -10.4, .8], [3.9, -10.2, .9], [57.4, 12, 1.2], [64.6, 12, 1.1], [52.6, -5.6, .9], [-8, -9.5, 1.3]]) { const p = A.pumpkin(s); p.position.set(x, groundY(x, z), z); p.rotation.y = Math.PI + (x > 50 ? Math.PI : 0) + (Math.random() - .5) * .4; H.add(p); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2; const p = A.pumpkin(.7); p.position.set(FX + Math.cos(a) * 4.45, .78, FZ + Math.sin(a) * 4.45); p.rotation.y = -a + Math.PI / 2; H.add(p); }
    // trick or treat: a pumpkin on each neighbour's doorstep
    for (const d of doorsteps(ctx)) { const p = A.pumpkin(1); p.position.copy(d.step); p.lookAt(d.step.clone().add(d.out)); H.add(p); ctx.use({ pos: d.step.clone().setY(1), kind: 'treat', data: { name: d.name }, reach: 2 }); }
    const st = A.stall(ctx.label('chez la sorcière', { w: 512, h: 72, size: 46, bg: '#1a0f24', color: '#9aff6a' }), { stripes: ['#2a1a3a', '#e8741e'] });
    st.position.copy(STALL); st.rotation.y = Math.PI / 2; H.add(st);
    const caul = A.mesh(new THREE.SphereGeometry(.35, 14, 10, 0, Math.PI * 2, Math.PI * .3, Math.PI * .7), A.lam(0x1a1a1e, { side: THREE.DoubleSide }), 1.4, .45, .6, st);
    const brew = A.mesh(new THREE.CircleGeometry(.3, 16), A.glow(0x6aff3a, 1.2), 1.4, .6, .6, st); brew.rotation.x = -Math.PI / 2; void caul;
    ctx.addBox(STALL.x - .45, 0, STALL.z - 1.35, STALL.x + .45, 1.1, STALL.z + 1.35);
    ctx.use({ pos: V(STALL.x + 1.1, 1, STALL.z), kind: 'stall', reach: 2.4 });
    const orange = ctx.bulbs(H, [0xff8a1e, 0x9a3aff]); houseLights(orange); squareStrings(orange, 3.8);
    // the pumpkins to find (small, lit)
    const spots = hideSpots(ctx, { n: 13, seed: 1031, make: () => A.pumpkin(.55) });
    // bats over the house and the garden
    const bats = Array.from({ length: 14 }, (_, i) => { const b = A.bat(1.3); H.add(b); return { b, ph: i * .7, r: 6 + (i % 4) * 4, h: 9 + (i % 5) * 2.5, c: i % 2 ? V(0, 0, -18) : V(0, 0, 14), sp: .4 + (i % 3) * .15 }; });
    // ghosts in the ground of the plot: out of sight until dug out
    const ghosts = [[-4, 2.5, 3], [5, 4, -4], [0, 6.5, 0], [-5.5, 9, -5], [4, 12, 5]].map(([x, d, z], i) => { const g = A.ghost(1); g.position.set(x, -d, z); g.visible = false; g.userData.keep = true; H.add(g); return { g, base: V(x, -d, z), ph: i * 1.3, gone: 0, id: i }; });
    return {
      spots, ghosts, fog: true, hats: 'witch',
      update(dt, t, env) {
        bob(spots, t, .01);
        brew.material.emissiveIntensity = 1 + Math.sin(t * 5) * .4;
        for (const x of bats) {
          const a = t * x.sp + x.ph;
          x.b.visible = env.night > .25;
          if (!x.b.visible) continue;
          x.b.position.set(x.c.x + Math.cos(a) * x.r + Math.sin(a * 2.3) * 1.5, x.h + Math.sin(a * 3.1) * 1.4, x.c.z + Math.sin(a) * x.r);
          x.b.rotation.y = -a;
          x.b.userData.wings.forEach((w, s) => { w.rotation.z = (s ? -1 : 1) * Math.sin(t * 18 + x.ph) * .9; });
        }
      },
    };
  },

  // ---------- hanami (japan): more cherry trees in full bloom, blue sheets, lanterns, dango ----------
  hanami(ctx) {
    const J = ctx.jp;
    const bl = createBlossoms({ parent: J, addBox: ctx.addBoxJ, seed: 88 });
    for (const [x, z, s] of [[36, -6, 1.1], [22, -14, 1], [42, -13, .95], [11, -6, .9], [-26, 8, 1], [60, 18, 1.1]]) bl.tree(x, z, s);
    bl.finish({ scatter: [[26, -9, 3], [36, -8, 2], [-26, 8, 2]] });
    bl.setSeason(0);
    for (const [x, z, r] of [[25, -8, .2], [33, -10.5, -.3], [-22, 6, .1]]) {
      const sheet = A.mesh(new THREE.PlaneGeometry(2.6, 2), A.lam(0x3a7ae8, { side: THREE.DoubleSide }), x, .05, z, J); sheet.rotation.set(-Math.PI / 2, 0, r);
      for (let i = 0; i < 3; i++) { const bx = A.mesh(new THREE.BoxGeometry(.3, .08, .22), A.lam([0xd8262e, 0x1a1a1a, 0xe8c878][i]), x - .6 + i * .6, .09, z + .2, J); bx.rotation.y = r; }
    }
    const b = ctx.bulbs(J, [0xff5a3a, 0xfff0c8]); b.add(V(12, 3.6, -14), V(42, 3.6, -14), 30, .5); b.add(V(12, 3.6, -4.2), V(42, 3.6, -4.2), 30, .5);
    const lans = [];
    for (let x = 13; x < 42; x += 3) for (const z of [-14, -4.2]) { const l = A.lantern(x % 2 ? 0xf4f0e6 : 0xe8382e, 1); l.position.set(x, 3.2 - Math.sin((x - 12) / 30 * Math.PI) * .5, z); l.userData.keep = true; J.add(l); lans.push(l); }
    const spots = hideSpots(ctx, { w: 'china', list: JP_SPOTS, n: 10, seed: 77, make: () => {
      const g = new THREE.Group();
      A.mesh(new THREE.CylinderGeometry(.008, .008, .4, 4), A.lam(0xc8a878), 0, .3, 0, g);
      [0xf6a8c8, 0xf4f0e6, 0x8ac060].forEach((c, i) => A.mesh(new THREE.SphereGeometry(.055, 10, 8), A.lam(c, { emissive: c, emissiveIntensity: .25 }), 0, .2 + i * .1, 0, g));
      const w = new THREE.Group(); w.add(g); return w;
    } });
    return { spots, blossoms: bl, update(dt, t) { bob(spots, t, .04); lans.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.5 + i) * .08; }); } };
  },

  // ---------- tanabata, obon (japan): lanterns down the street, a bamboo of wishes ----------
  natsu(ctx) {
    const J = ctx.jp;
    const lans = [];
    for (let x = -60; x <= 60; x += 3.2) { const l = A.lantern(Math.round(x / 3.2) % 2 ? 0xf4f0e6 : 0xe8382e, 1.1); l.position.set(x, 3.4, 10); l.userData.keep = true; J.add(l); lans.push(l); }
    const b = ctx.bulbs(J, [0xffb86a]); b.add(V(-60, 3.75, 10), V(60, 3.75, 10), 60, .1);
    const bam = A.bamboo(4.5); bam.position.set(27, .06, -9); J.add(bam);
    ctx.addBoxJ(26.8, 0, -9.2, 27.2, 4, -8.8);
    ctx.use({ pos: V(27, 1, -9).add(ctx.JP), kind: 'wish', reach: 2.2 });
    return { update(dt, t) { lans.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.3 + i) * .07; }); } };
  },
};
