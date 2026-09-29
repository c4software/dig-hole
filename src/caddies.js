// caddies.js, la course de caddies: supermarket trolleys raced round the church square, each rider
// standing on the back rail and hanging on to the handle. Kick like on a scooter (tap z in rhythm
// for a bigger push), ride with both feet up, drift the corners (shift, then counter-steer), and
// hold on: a hard knock throws you off, you get up and run back to your cart. Promo tags on the
// course put something in the basket: a baguette to swat the one beside you, a watermelon to roll
// behind you, a bag of flour that leaves the paving like ice. The course (caddies-track.js) only
// appears for the race: barriers, cones, crates, a checkered banner at the church portal, and the
// village watching. Each player drives their own cart; the host drives the regulars of the market.
import * as THREE from 'three';
import { netTrack, netNow, netStamp } from './netlerp.js';
import { wrapAngle as wrap, clamp } from './lib/math.js';
import { fmtTime as fmt } from './lib/fmt.js';
import { tagTex } from './lib/tex.js';
import { createRig } from './rig.js';
import { randomOutfit, DEFAULT, TEES } from './outfits.js';
import { tun } from './tunables.js';
import { mergeStatic } from './merge.js';
import * as V from './vehicles.js';
import { buildTrack, groundY, solidsFrom } from './caddies-track.js';
import { TUNE, newCart, placeCart, stepCart, collideCarts, botInput, trackProgress, stepMelon, throwOff } from './caddies-physics.js';
import { CART, cartModel, barrierMat, coneMat, crateMat, startGate, promoMesh, melon as melonMesh, splatMat, flourMat } from './caddies-art.js';
import { createCaddieSfx } from './caddies-sfx.js';

const GRID = 6, PI = Math.PI;
const MODES = [
  { id: 'course', name: 'course', sub: 'devant l\'église contre les habitués du marché · promos dans le panier', help: 'z : pousser du pied (en rythme : plus fort) · q d : tourner · shift : déraper · espace : objet · r : revenir sur la piste', unit: 'time', lower: true },
  { id: 'chrono', name: 'contre-la-montre', sub: 'seul sur la place, sans promos · ton meilleur temps', help: 'z en rythme · shift : déraper, contre-braquer pour rattraper · r : revenir sur la piste', unit: 'time', lower: true },
];
const BOTS = [['mamie jo', 0xe8384f], ['le boucher', 0xf2c230], ['kévin', 0x3a8ef0], ['sœur agnès', 0x45c060], ['le facteur', 0xb05ae0], ['la mercière', 0xf08a2a], ['le curé', 0x2ac0c0]];
const ITEMS = { baguette: 'baguette', melon: 'pastèque', flour: 'farine' };
const ITEM_CODE = { baguette: 1, melon: 2, flour: 3 }, CODE_ITEM = [null, 'baguette', 'melon', 'flour'];
// the people watching, round the course
const CROWD = [[49.4, 11.6], [50.3, 13.3], [48.6, 12.6], [65.2, 13.9], [66.6, 14.4], [58.2, -15.9], [60.3, -15.9], [63.6, -15.9], [66.1, -15.9], [73.9, -3.6], [73.9, -6.7], [75.6, 9.6], [76.4, 11.1], [51.1, 11.9]];
// the trolley corrals: [x, z, yaw]
const CORRALS = [[48.7, 9.6, PI / 2], [73.95, 1.2, 0]];

export function createCaddies({ scene, camera, audio, ui, world, lookOf = () => null, getNet = () => null }) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const TR = buildTrack(), N = TR.N;
  const sfx = createCaddieSfx();
  let solids = [], tall = [];

  // ---------- the course's dressing, built the first time ----------
  let built = false, promos = [], crowd = [], puffs = null;
  const MELONS = 6, FLOURS = 4;
  const melonPool = [], splatPool = [], flourPool = [];
  function build() {
    if (built) return;
    built = true;
    const deco = new THREE.Group(); root.add(deco);
    // barriers along the edges where nothing already stands, cones and crates in the bends
    const pan = [], cones = [], crates = [];
    const near = (x, z, r) => solids.some(b => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);
    const crowdsLine = (x, z, i) => { for (let j = 0; j < N; j += 2) { const d = Math.abs(j - i), dd = Math.min(d, N - d); if (dd > 16 && Math.hypot(TR.pts[j].x - x, TR.pts[j].z - z) < TR.pts[j].hw + .5) return true; } return false; };
    for (let i = 0; i < N; i += 5) {
      const p = TR.pts[i];
      if (i < 10 || i > N - 10) continue;   // the start gate stands there
      for (const s of [-1, 1]) {
        const off = p.hw + .45, x = p.x + p.sx * s * off, z = p.z + p.sz * s * off;
        if (near(x, z, .45) || crowdsLine(x, z, i)) continue;
        const c = Math.abs(p.curve);
        if (c > .85) crates.push([x, z, Math.atan2(p.tx, p.tz), (i / 5) % 3 === 0 ? 3 : 2]);
        else if (c > .45) cones.push([x, z]);
        else pan.push([x, z, Math.atan2(p.tx, p.tz)]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    const inst = (geo, mat, list, put) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length; list.forEach((a, n) => { put(a, n); m.setMatrixAt(n, m4); }); m.castShadow = true; m.receiveShadow = true; deco.add(m); return m; };
    const panG = new THREE.PlaneGeometry(1.3, 1); panG.translate(0, .6, 0); panG.rotateY(PI / 2);
    inst(panG, barrierMat(), pan, ([x, z, yaw]) => m4.compose(pos.set(x, groundY(x, z), z), q.setFromEuler(e.set(0, yaw, 0)), one));
    const footG = new THREE.BoxGeometry(.6, .04, .08);
    inst(footG, V.mat(0x8a9098, { metalness: .5 }), pan.flatMap(a => [[a, -.6], [a, .6]]), ([[x, z, yaw], o]) => m4.compose(pos.set(x + Math.sin(yaw) * o, groundY(x, z) + .02, z + Math.cos(yaw) * o), q.setFromEuler(e.set(0, yaw, 0)), one));
    const coneG = new THREE.ConeGeometry(.16, .5, 12); coneG.translate(0, .27, 0);
    const coneList = [...cones];
    // cones either side of the start line too
    for (const s of [-1, 1]) for (const k of [-3, 3]) { const p = TR.pts[(k + N) % N]; coneList.push([p.x + p.sx * s * (p.hw + .35), p.z + p.sz * s * (p.hw + .35)]); }
    inst(coneG, coneMat(), coneList, ([x, z]) => m4.compose(pos.set(x, groundY(x, z), z), q.identity(), one));
    const crateG = new THREE.BoxGeometry(.5, .34, .38); crateG.translate(0, .17, 0);
    const crateList = crates.flatMap(([x, z, yaw, h]) => Array.from({ length: h }, (_, k) => [x, z, yaw + (k % 2) * .25, k]));
    inst(crateG, crateMat(), crateList, ([x, z, yaw, k]) => m4.compose(pos.set(x, groundY(x, z) + k * .34, z), q.setFromEuler(e.set(0, yaw, 0)), one));
    // the start gate across the line, in front of the church portal
    const p0 = TR.pts[0], gate = startGate(p0.hw * 2 + .5);
    gate.position.set(p0.x, groundY(p0.x, p0.z), p0.z); gate.rotation.y = Math.atan2(p0.tx, p0.tz) + PI; deco.add(gate);   // across the line, its words to the ones coming
    // the corrals: nested trolleys under a little roof of tubes
    for (const [x, z, yaw] of CORRALS) {
      const g = new THREE.Group(); g.position.set(x, groundY(x, z), z); g.rotation.y = yaw; deco.add(g);
      for (let k = 0; k < 4; k++) { const c = cartModel(0x2a4ac0, { items: false }); c.g.position.z = k * .26 - .4; c.body.position.y = k * .012; g.add(c.g); }
      const bar = V.mat(0x1d7a44, { metalness: .4 });
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 1.9), bar); r.position.set(s * .38, .9, 0); g.add(r); for (const t of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.05, .9, .05), bar); l.position.set(s * .38, .45, t * .92); g.add(l); } }
      mergeStatic(g);
    }
    // the promos: three rows across the course
    for (const f of [.2, .56, .76]) {
      const i = Math.round(f * N), p = TR.pts[i];
      for (const s of [-1, 0, 1]) {
        const m = promoMesh(), x = p.x + p.sx * s * p.hw * .55, z = p.z + p.sz * s * p.hw * .55;
        m.position.set(x, 1, z); deco.add(m);
        promos.push({ x, z, m, off: 0, ph: promos.length * 1.3 });
      }
    }
    // melons rolling, their splats, the flour on the ground
    for (let k = 0; k < MELONS; k++) { const m = melonMesh(.17); m.visible = false; root.add(m); melonPool.push(m); }
    const splatG = new THREE.PlaneGeometry(1, 1); splatG.rotateX(-PI / 2);
    for (let k = 0; k < MELONS; k++) { const s = new THREE.Mesh(splatG, splatMat()); s.visible = false; s.renderOrder = 1; root.add(s); splatPool.push({ s, t: 0 }); }
    for (let k = 0; k < FLOURS; k++) { const s = new THREE.Mesh(splatG, flourMat().clone()); s.visible = false; s.renderOrder = 1; root.add(s); flourPool.push(s); }
    puffs = V.createPuffs(root, 60, 0xf6f2ea);
    // the crowd
    let rs = 99; const rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    for (const [x, z] of CROWD) {
      const rig = createRig(randomOutfit(rnd), { detail: 'lo', lod: true });
      const i = TR.nearest(x, z), p = TR.pts[i];
      rig.root.position.set(x, groundY(x, z), z); rig.root.rotation.y = Math.atan2(p.x - x, p.z - z);
      root.add(rig.root);
      crowd.push({ rig, t: rnd() * 3 });
    }
  }
  // the shaders compiled off the frame when the code arrives (behind the menu), not at the start:
  // the dressing, a cart in each colour with its groceries, a melon, a splat, the flour, drawn far below
  function warm() {
    const R = world?.renderer;
    if (!R?.compileAsync) return;
    const w = new THREE.Group(); root.add(w);
    for (const [, color] of BOTS) { const c = cartModel(color); for (const k in c.items) c.items[k].visible = true; w.add(c.g); }
    const rider = createRig(DEFAULT, { lod: true }); w.add(rider.root);
    for (const o of [...melonPool, ...splatPool.map(q => q.s), ...flourPool]) o.visible = true;
    root.position.y = -500; root.visible = true;
    const done = () => { if (!w.parent) return; root.remove(w); if (state !== 'off') return; root.position.y = 0; root.visible = false; for (const o of [...melonPool, ...splatPool.map(q => q.s), ...flourPool]) o.visible = false; };
    R.compileAsync(root, camera, world.scene || scene).then(done, done);
    setTimeout(done, 3000);
  }

  // ---------- carts ----------
  let carts = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'course', LAPS = 3, count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, result = null, respawnCd = 0, rnd = Math.random;
  let camYaw = 0, camFov = 70, shake = 0, auto = false, prevKick = false, prevItem = false, melons = [], flours = [], serial = 0;
  const hidden = [];
  const riderPool = [];
  const byKey = (k) => carts.find(c => c.key === k);
  const mine = (c) => !!c && (c.key === meId || (isHost && c.bot));
  const env = { track: TR, solids: [], grip: (x, z) => flours.some(f => (x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) ? .12 : 1, fallV: 1 };

  function outfitFor(u, n) {
    if (u.bot) { let s = 1000 + n * 77; return randomOutfit(() => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }); }
    const o = lookOf(u.key);
    if (o) return o;
    const gap = (a, b) => Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
    const tee = TEES.reduce((b, t, i) => gap(t[1], u.color) < gap(TEES[b][1], u.color) ? i : b, 0);
    return { ...DEFAULT, tee };
  }
  function makeCart(u, n) {
    const c = newCart(u.key, { bot: u.bot, skill: u.bot ? .86 + rnd() * .12 : 1, ph: n * 2.3 + 1 });
    c.name = u.name; c.color = u.color;
    const model = cartModel(u.color);
    root.add(model.g);
    let rig = riderPool[n];
    if (!rig) { rig = riderPool[n] = createRig(outfitFor(u, n), { lod: true }); }
    else rig.dress(outfitFor(u, n));
    rig.root.visible = true; root.add(rig.root);
    let tag = null;
    if (u.key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(u.name, u.color), transparent: true, depthWrite: false })); tag.scale.set(1.2, .3, 1); root.add(tag); }
    c.view = { model, rig, tag, fx0: 0, fz0: 0, fx1: 0, fz1: 0, wasFall: false, swing: 0, roll: 0, pitch: 0 };
    c.item = null; c.doneAt = 0; c.seen = 0; c.botItemT = 0;
    return c;
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'course';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    let rs = (seed >>> 0) || 1; rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    LAPS = Math.max(1, Math.round(tun.get('caddiesLaps') ?? 3));
    env.fallV = tun.get('caddiesFall') ?? 1;
    solids = solidsFrom(world?.colliders || [], TR.box); env.solids = solids;
    tall = solids.filter(b => b.h > 1.3);
    build();
    root.position.y = 0;
    state = 'count'; count = 3.5; clock = 0; goAt = 0; endT = -1; sendT = 0; result = null; respawnCd = 0; shake = 0; melons = []; flours = []; serial = 0;
    camFov = camera.fov;
    const list = [];
    if (mode === 'course') {
      const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
      for (let n = 0; n < Math.max(0, GRID - humans.length); n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    }
    for (const u of humans) list.push({ key: u.id, name: u.name, color: u.color, bot: false });
    carts = list.map((u, n) => {
      const c = makeCart(u, n);
      // the grid behind the line: two by two
      placeCart(c, TR, (N - 5 - Math.floor(n / 2) * 7) % N, (n % 2 ? .45 : -.45) * Math.min(1, TR.pts[N - 5].hw / .9));
      c.k = c.idx - N; c.lane = (rnd() - .5) * 1.3;
      return c;
    });
    me = byKey(meId);
    for (const p of promos) { p.off = 0; p.m.visible = true; }
    for (const m of melonPool) m.visible = false;
    for (const s of splatPool) s.s.visible = false;
    for (const f of flourPool) f.visible = false;
    root.visible = true;
    hideTown(false); hideTown(true);
    if (me) camYaw = me.yaw;
    sfx.init();
    audio.tick();
    update(0, new Set());
  }
  // the square's passers-by step aside, the others' bodies too (they're on their carts)
  function hideTown(on) {
    if (on) {
      const B = TR.box;
      for (const p of world?.walkers?.home?.people || []) {
        const xs = p.pts?.map(v => v.x) || [], zs = p.pts?.map(v => v.z) || [];
        if (!xs.length || Math.max(...xs) < B.x0 - 3 || Math.min(...xs) > B.x1 + 3 || Math.max(...zs) < B.z0 - 3 || Math.min(...zs) > B.z1 + 3) continue;
        hidden.push([p.g, p.g.visible, 'v']); p.g.visible = false;
      }
      for (const p of getNet()?.peers?.values?.() || []) if (p.avatar?.g) { hidden.push([p.avatar.g, 1, 's']); p.avatar.g.scale.setScalar(1e-4); }
    } else {
      for (const [g, v, k] of hidden) { if (k === 'v') g.visible = v; else g.scale.setScalar(1); }
      hidden.length = 0;
    }
  }
  function stopDyn() {
    for (const c of carts) { root.remove(c.view.model.g); root.remove(c.view.rig.root); if (c.view.tag) { root.remove(c.view.tag); c.view.tag.material.map?.dispose(); c.view.tag.material.dispose(); } }
    carts = []; me = null;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    root.visible = false;
    hideTown(false);
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    sfx.quiet();
  }

  // ---------- items ----------
  function giveItem(c) {
    // the leaders get the traps, the back of the pack the baguette
    const o = order(), r = o.indexOf(c) / Math.max(1, o.length - 1), roll = (c.bot ? rnd() : Math.random());
    c.item = roll < .25 + r * .4 ? 'baguette' : roll < .62 + r * .15 ? 'melon' : 'flour';
    if (c === me) { sfx.pickup(); ui.toast(`dans le panier : ${ITEMS[c.item]} !`, false, 1100); }
  }
  function useItem(c) {
    const it = c.item; if (!it || c.fall >= 0) return;
    c.item = null;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (it === 'baguette') {
      c.view.swing = .45;
      sfx.swat(c === me ? null : c);
      // the nearest cart within reach, in front or beside
      let best = null, bd = 2.1;
      for (const o of carts) {
        if (o === c || o.fall >= 0 || o.done) continue;
        const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > -.35) { best = o; bd = d; }
      }
      if (best) {
        if (mine(best)) hitBy(best, c); else send({ t: 'sw', o: c.key, v: best.key });
        if (c === me) ui.toast(`paf ! ${best.name} valse`, false, 1000);
      } else send({ t: 'sw', o: c.key });
    } else if (it === 'melon') {
      const m = { id: c.key + ':' + (++serial), x: c.x - fx * .8, z: c.z - fz * .8, vx: c.vx * .35 - fx * 1.2, vz: c.vz * .35 - fz * 1.2, roll: 0, age: 0 };
      addMelon(m); send({ t: 'ml', id: m.id, x: r2(m.x), z: r2(m.z), vx: r2(m.vx), vz: r2(m.vz) });
    } else if (it === 'flour') {
      const f = { id: c.key + ':' + (++serial), x: c.x - fx * 1.1, z: c.z - fz * 1.1 };
      addFlour(f); send({ t: 'fl', id: f.id, x: r2(f.x), z: r2(f.z) });
    }
  }
  function hitBy(c, from) {
    if (c.fall >= 0) return;
    const ev = [];
    const dx = c.x - from.x, dz = c.z - from.z, d = Math.hypot(dx, dz) || 1;
    c.vx += dx / d * 1.5; c.vz += dz / d * 1.5;
    throwOff(c, ev, dx / d, dz / d);
    if (c === me) ui.toast('coup de baguette !', true, 1000);
  }
  function addMelon(m) {
    if (melons.some(o => o.id === m.id) || melons.length >= MELONS) return;
    m.age = m.age || 0; m.roll = 0; m.mesh = melonPool.find(p => !p.visible); if (!m.mesh) return;
    m.mesh.visible = true; melons.push(m);
    sfx.roll(m);
  }
  function smash(id, spl = true) {
    const m = melons.find(o => o.id === id); if (!m) return;
    melons.splice(melons.indexOf(m), 1); m.mesh.visible = false;
    if (spl) {
      const s = splatPool.find(p => !p.s.visible) || splatPool[0];
      s.s.visible = true; s.s.position.set(m.x, groundY(m.x, m.z) + .01, m.z); s.s.scale.setScalar(1.1); s.s.rotation.y = Math.random() * 6; s.t = 12;
      sfx.splat(m);
      for (let k = 0; k < 8; k++) puffs?.emit(new THREE.Vector3(m.x, .3, m.z), new THREE.Vector3((Math.random() - .5) * 2, 1, (Math.random() - .5) * 2), .12, .5);
    }
  }
  function addFlour(f) {
    if (flours.some(o => o.id === f.id)) return;
    f.r = 1.7; f.t = 8; f.mesh = flourPool.find(p => !p.visible) || flourPool[0];
    if (flours.length >= FLOURS) flours.shift();
    f.mesh.visible = true; f.mesh.position.set(f.x, groundY(f.x, f.z) + .012, f.z); f.mesh.scale.setScalar(f.r * 2); f.mesh.material.opacity = .8;
    flours.push(f);
    sfx.flour(f);
    for (let k = 0; k < 16; k++) puffs?.emit(new THREE.Vector3(f.x + (Math.random() - .5) * 1.5, .4, f.z + (Math.random() - .5) * 1.5), new THREE.Vector3((Math.random() - .5), .6, (Math.random() - .5)), .6, 1.6);
  }

  // ---------- network ----------
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const pack = (c) => [r3(c.x), r3(c.z), r3(c.yaw), r3(c.vx), r3(c.vz), r3(c.y), c.k, c.done ? 1 : 0, r2(c.fall), r2(c.kick), c.drift, r2(c.steer), r2(c.time), ITEM_CODE[c.item] || 0, c.combo, c.cp];
  function unpack(c, a, ts, src) {
    if (!a) return;
    c.trk ??= netTrack({ angles: [2], cut: (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 3 });
    if (!c.trk.push(ts ?? netNow(), a.slice(0, 6), src)) return;
    const [, , , , , , k, done, fall, kick, drift, steer, time, item, combo, cp] = a;
    c.k = k; c.fall = fall; c.kick = kick; c.drift = drift; c.steer = steer; c.item = CODE_ITEM[item] || null; c.combo = combo; c.cp = cp ?? c.cp; c.seen = clock;
    if (time != null && !c.bot) c.time = time;
    if (done && !c.done) { c.done = true; c.doneAt = clock; }
  }
  function follow(c, dt) {
    const s = c.trk?.sample(c.smp ??= []); if (!s) return;
    [c.x, c.z, c.yaw, c.vx, c.vz, c.y] = s;
    c.idx = TR.nearest(c.x, c.z, c.idx, 30);
    if (c.fall >= 0) c.fall += dt;
    if (c.kick > 0) { c.kick += dt / TUNE.KICK_T; if (c.kick >= 1) c.kick = 0; }
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') { const c = byKey(pid); if (c && !mine(c)) unpack(c, fx.c, fx.ts, pid); }
    else if (fx.t === 'b' && !isHost) for (const [k, a] of fx.l) { const c = byKey(k); if (c) unpack(c, a, fx.ts, pid); }
    else if (fx.t === 'sw') { const o = byKey(fx.o); if (o) { o.view.swing = .45; sfx.swat(o); } const v = byKey(fx.v); if (v && o && mine(v)) hitBy(v, o); }
    else if (fx.t === 'ml') addMelon({ id: fx.id, x: fx.x, z: fx.z, vx: fx.vx, vz: fx.vz });
    else if (fx.t === 'mx') smash(fx.id);
    else if (fx.t === 'fl') addFlour({ id: fx.id, x: fx.x, z: fx.z });
    else if (fx.t === 'pk') { const p = promos[fx.i]; if (p) p.off = 6; }
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c) { root.remove(c.view.model.g); root.remove(c.view.rig.root); if (c.view.tag) root.remove(c.view.tag); carts.splice(carts.indexOf(c), 1); }
    if (id === hostId) {
      const next = carts.filter(q => !q.bot).map(q => q.key).sort((a, b) => String(a).localeCompare(String(b)))[0];
      hostId = next ?? meId; isHost = hostId === meId;
    }
  }

  // ---------- the frame ----------
  const order = () => [...carts].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.doneAt - b.doneAt : b.k - a.k));
  const NOKEYS = { steer: 0, kick: false, tap: false, brake: false, drift: false };
  const evs = [];
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'race'; goAt = clock; audio.buy(); }
    }
    const racing = state === 'race';
    for (const c of carts) {
      if (!mine(c)) { follow(c, dt); continue; }
      let inp = NOKEYS;
      if (c === me) {
        const kick = keys.has('KeyW') || keys.has('ArrowUp'), item = keys.has('Space');
        inp = auto ? botInput(c, TR, rnd) : {
          steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
          kick, tap: kick && !prevKick, brake: keys.has('KeyS') || keys.has('ArrowDown'), drift: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        };
        if (racing && item && !prevItem) useItem(c);
        if (auto && racing && c.item && rnd() < dt * .5) useItem(c);
        prevKick = kick; prevItem = item;
      } else if (racing) {
        inp = botInput(c, TR, rnd);
        botItems(c, dt);
      }
      if (!racing) inp = NOKEYS;
      evs.length = 0;
      stepCart(c, inp, dt, env, evs);
      for (const e of evs) cartEvent(c, e);
      if (racing) {
        const pr = trackProgress(c, TR, LAPS, dt);
        if (!c.done) c.time = clock - goAt;
        if (pr === 'done') { c.doneAt = clock; if (c === me) finish(); }
        else if (pr === 'lap' && c === me) { ui.toast(c.laps === LAPS - 1 ? 'dernier tour !' : `tour ${c.laps + 1} / ${LAPS}`, false, 1000); audio.tick(); }
        // a bot stuck against something: back on the line
        if (c.bot) { if (Math.hypot(c.vx, c.vz) < .4 && c.fall < 0) { c.stuckT += dt; if (c.stuckT > 2.5) { c.stuckT = 0; respawnCart(c); } } else c.stuckT = 0; }
        // the promos
        if (mode === 'course' && !c.item && c.fall < 0) promos.forEach((p, i) => { if (!p.off && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < .7 * .7) { p.off = 6; giveItem(c); send({ t: 'pk', i }); } });
      }
    }
    // carts against carts
    for (let a = 0; a < carts.length; a++) for (let b = a + 1; b < carts.length; b++) {
      const p = carts[a], q = carts[b];
      if (!mine(p) && !mine(q)) continue;
      evs.length = 0;
      collideCarts(p, q, mine(p), mine(q), dt, evs);
      for (const e of evs) { if (e.kind === 'clash' && (p === me || q === me)) { sfx.bump(e.v); shake = Math.max(shake, Math.min(.15, e.v * .03)); } else if (e.kind === 'clash') sfx.bump(e.v, p); else if (e.kind === 'fall') fallFx(e.p ?? (p.fall === 0 ? p : q)); }
    }
    // melons roll; the one who hits one takes the fall
    for (const m of [...melons]) {
      stepMelon(m, dt, env);
      m.mesh.position.set(m.x, groundY(m.x, m.z) + .16, m.z);
      m.mesh.rotation.set(m.roll, Math.atan2(m.vx, m.vz), 0, 'YXZ');
      if (m.age > 25) { smash(m.id, false); continue; }
      for (const c of carts) {
        if (!mine(c) || c.fall >= 0) continue;
        const d = Math.hypot(c.x - m.x, c.z - m.z);
        if (d > TUNE.R + .17) continue;
        const rel = Math.hypot(c.vx - m.vx, c.vz - m.vz);
        if (rel > 1.6) { evs.length = 0; throwOff(c, evs); fallFx(c); smash(m.id); send({ t: 'mx', id: m.id }); break; }
        // slowly: nudged along
        const nx = (m.x - c.x) / (d || 1), nz = (m.z - c.z) / (d || 1);
        m.vx += nx * 1.2; m.vz += nz * 1.2;
      }
    }
    for (const f of [...flours]) { f.t -= dt; f.mesh.material.opacity = Math.min(.8, f.t * .4); if (f.t <= 0) { f.mesh.visible = false; flours.splice(flours.indexOf(f), 1); } }
    for (const s of splatPool) if (s.s.visible && (s.t -= dt) <= 0) s.s.visible = false;
    for (const p of promos) {
      if (p.off > 0) p.off = Math.max(0, p.off - dt);
      p.m.visible = mode === 'course' && !p.off;
      p.m.rotation.y = clock * 2 + p.ph; p.m.position.y = 1 + Math.sin(clock * 3 + p.ph) * .08;
    }
    for (const c of carts) draw(c, dt);
    for (const s of crowd) {
      s.t -= dt;
      if (s.t <= 0) { s.t = 2 + Math.random() * 4; s.rig.play(Math.random() < .5 ? 'bravo' : 'hourra'); }
      s.rig.update(dt, camera.position);
    }
    puffs?.update(dt);
    // drop the humans that never came
    if (racing && clock > 9) for (const c of [...carts]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      const ts = netStamp();
      if (me) send({ t: 's', ts, c: pack(me) });
      if (isHost) { const l = carts.filter(c => c.bot).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', ts, l }); }
    }
    if (me) {
      const road = me.z < -11.46 && me.z > -14.74;
      sfx.ride(Math.hypot(me.vx, me.vz), !!me.drift, road, me.vy !== 0, me.fall >= 0, dt);
    }
    cam(dt);
    sfx.ears(camera);
    if (endT > 0) { endT -= dt; if (endT <= 0) { const r = result; endT = -1; onEnd(r); } }
  }
  function botItems(c, dt) {
    if (!c.item || mode !== 'course') return;
    c.botItemT += dt;
    if (c.item === 'baguette') { if (carts.some(o => o !== c && o.fall < 0 && Math.hypot(o.x - c.x, o.z - c.z) < 1.8) || c.botItemT > 12) { useItem(c); c.botItemT = 0; } }
    else if (carts.some(o => o !== c && o.k < c.k && o.k > c.k - 24) || c.botItemT > 8) { useItem(c); c.botItemT = 0; }
  }
  // what happened to a cart this step: sounds, shakes, words
  function cartEvent(c, e) {
    const mineNow = c === me, at = mineNow ? null : c;
    if (e.kind === 'kick' || e.kind === 'sweet') { if (mineNow || Math.random() < .3) sfx.kick(e.kind === 'sweet', e.v, at); }
    else if (e.kind === 'bump') { sfx.bump(e.v, at); if (mineNow) shake = Math.max(shake, Math.min(.2, e.v * .04)); }
    else if (e.kind === 'fall') fallFx(c);
    else if (e.kind === 'boost' && mineNow) { sfx.boost(); ui.toast('zoum !', false, 600); }
    else if (e.kind === 'kerb' && mineNow) { sfx.kerb(e.v); shake = Math.max(shake, .06); }
    else if (e.kind === 'up' && mineNow) ui.toast('et on repart !', false, 800);
  }
  function fallFx(c) {
    sfx.crash(c === me ? null : c);
    if (c === me) { shake = .35; ui.toast('gamelle !', true, 1200); }
  }
  // back on the line where you are along it (a bot stuck), or at the last checkpoint passed (r)
  function respawnCart(c, toCheckpoint = false) {
    if (toCheckpoint) {
      const per = TR.cps.length, m = c.cp - 1;
      const k = m < 0 ? -5 : Math.floor(m / per) * N + TR.cps[m % per];
      placeCart(c, TR, ((k % N) + N) % N, 0);
      c.k = k;
    } else {
      placeCart(c, TR, c.idx, 0);
      c.k = c.k - (((c.k % N) + N) % N) + c.idx;
    }
    if (c === me) { camYaw = c.yaw; shake = 0; }
  }

  // ---------- drawing a cart and its rider ----------
  const tmpV = new THREE.Vector3();
  function draw(c, dt) {
    const v = c.view, M = v.model, sp = Math.hypot(c.vx, c.vz);
    M.g.position.set(c.x, c.y, c.z); M.g.rotation.y = c.yaw;
    // the body leans out of the turn, shakes on the paving
    const rough = sp > .5 ? (Math.random() - .5) * .012 * Math.min(1, sp / 5) : 0;
    v.roll += ((c.fall >= 0 ? 0 : -c.steer * Math.min(1, sp / 6) * .07 + (c.drift || 0) * .05) - v.roll) * Math.min(1, dt * 8);
    M.body.rotation.set(rough, 0, v.roll + rough);
    // the front casters trail the way the cart moves, one of them wobbling
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), vl = c.vx * fz - c.vz * fx, vf = c.vx * fx + c.vz * fz;
    const ang = sp > .3 ? Math.atan2(vl, vf) : 0;
    M.swivels.forEach((s, k) => { s.rotation.y = ang + (k ? Math.sin(clock * 31 + c.ph) * .35 * Math.min(1, sp / 3) : 0); });
    for (const k in M.items) M.items[k].visible = c.item === k;
    if (v.swing > 0) { v.swing -= dt; const b = M.items.baguette; b.visible = true; b.rotation.set(.9 - Math.sin((1 - v.swing / .45) * PI) * 2.2, .3, 0); }
    // the rider
    const R = v.rig, rr = R.root;
    if (c.fall >= 0) {
      if (!v.wasFall) {
        v.wasFall = true;
        const k = Math.min(1, 5 / Math.max(.1, sp));
        v.fx0 = c.x - fx * .7; v.fz0 = c.z - fz * .7; v.fx1 = v.fx0 + c.vx * k * .45; v.fz1 = v.fz0 + c.vz * k * .45;
        if (c !== me && !mine(c)) sfx.crash(c);
      }
      tumble(c, v, dt);
    } else {
      v.wasFall = false;
      tmpV.set(0, CART.railY + .016, CART.railZ - .06).applyAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      rr.position.set(c.x + tmpV.x, c.y + tmpV.y, c.z + tmpV.z);
      rr.rotation.set(0, c.yaw, v.roll * 1.5);
      R.st.speed = 0; R.st.ground = true; R.st.sit = false;
      R.update(dt, camera.position);
      ridePose(R, c);
    }
    if (v.tag) { v.tag.position.set(c.x, c.y + 2.3, c.z); const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0; v.tag.visible = d > 1.5 && d < 30; }
    // dust off the wheels in a drift, flour off a floured cart
    if ((c.drift && sp > 3 && Math.random() < dt * 20) || (c.slick > 0 && sp > 1 && Math.random() < dt * 12)) puffs?.emit(tmpV.set(c.x - fx * .4, .15, c.z - fz * .4), new THREE.Vector3((Math.random() - .5) * .5, .4, (Math.random() - .5) * .5), c.slick > 0 ? .35 : .18, .6);
  }
  // hanging on to the handle, leaning on it; one foot kicking, both up, or one dragged to brake
  function ridePose(R, c) {
    const set = (n, x, y = 0, z = 0) => R.bone(n).rotation.set(x, y, z);
    const d = c.drift || 0;
    set('spine', .34, d * .12, 0); set('chest', .12, d * .1, 0);
    set('neck', -.12); set('head', -.42, -d * .2, 0);
    for (const [s, n] of [[1, 'L'], [-1, 'R']]) { set('sh' + n, -.3, 0, s * .16); set('elb' + n, -.9, 0, 0); }
    let drop = -.05;
    const legs = (n, hip, knee, foot) => { set('hip' + n, hip, 0, n === 'L' ? .04 : -.04); set('knee' + n, knee); set('foot' + n, foot); };
    if (c.kick > 0) {
      const ph = c.kick;
      legs('R', -.42, .85, -.4);
      let hip, knee;
      if (ph < .3) { const t = ph / .3; hip = -.2 - .35 * t; knee = .9 - .5 * t; }
      else if (ph < .7) { const t = (ph - .3) / .4; hip = -.55 + 1.35 * t; knee = .4 - .3 * t; }
      else { const t = (ph - .7) / .3; hip = .8 - 1 * t; knee = .1 + Math.sin(t * PI) * 1.3; }
      legs('L', hip, knee, -.2);
      drop = -.16;
    } else if (c.brakeT > 0) {
      legs('R', -.42, .85, -.4); legs('L', .55, .15, .5); drop = -.14;
    } else {
      legs('L', -.22, .5, -.28); legs('R', -.22, .5, -.28); drop = -.07;
    }
    R.bones[0].position.y += drop;
  }
  // off the cart: flying, rolling on the paving, up, and running back to the cart
  function tumble(c, v, dt) {
    const R = v.rig, rr = R.root, t = c.fall;
    if (t < .7) {
      const u = t / .7;
      rr.position.set(v.fx0 + (v.fx1 - v.fx0) * u, c.y + .3 + Math.sin(u * PI) * .6 - u * .3, v.fz0 + (v.fz1 - v.fz0) * u);
      rr.rotation.set(u * PI * 1.5, Math.atan2(v.fx1 - v.fx0, v.fz1 - v.fz0), 0, 'YXZ');
      R.st.ground = false; R.st.vy = -3; R.st.speed = 0;
    } else if (t < 1.5) {
      rr.position.set(v.fx1, groundY(v.fx1, v.fz1) + .12, v.fz1);
      rr.rotation.set(-PI / 2 + Math.sin(t * 9) * .05 * (1.5 - t), rr.rotation.y, 0, 'YXZ');
      R.st.ground = true; R.st.speed = 0;
    } else if (t < 1.85) {
      const u = (t - 1.5) / .35;
      rr.position.set(v.fx1, groundY(v.fx1, v.fz1) + .12 * (1 - u), v.fz1);
      rr.rotation.set(-PI / 2 * (1 - u * u), rr.rotation.y, 0, 'YXZ');
      R.st.ground = true; R.st.speed = 0;
    } else {
      // run back to the rail
      const u = Math.min(1, (t - 1.85) / Math.max(.1, TUNE.FALL_T - 1.85));
      tmpV.set(0, CART.railY + .016, CART.railZ - .06).applyAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      const tx = c.x + tmpV.x, tz = c.z + tmpV.z;
      rr.position.set(v.fx1 + (tx - v.fx1) * u, groundY(v.fx1, v.fz1) + (c.y + tmpV.y - groundY(v.fx1, v.fz1)) * u * u, v.fz1 + (tz - v.fz1) * u);
      rr.rotation.set(0, Math.atan2(tx - v.fx1, tz - v.fz1) + (u > .8 ? wrap(c.yaw - Math.atan2(tx - v.fx1, tz - v.fz1)) * (u - .8) * 5 : 0), 0, 'YXZ');
      R.st.ground = true; R.st.speed = 3.5;
    }
    R.update(dt, camera.position);
  }

  // ---------- the camera: behind your cart, easing round with it ----------
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), tmp = new THREE.Vector3();
  let camReady = false;
  function blocked(x, y, z) { for (const b of tall) if (x > b.x0 - .15 && x < b.x1 + .15 && z > b.z0 - .15 && z < b.z1 + .15 && y < b.h + .2) return true; return false; }
  function cam(dt) {
    if (!me) return;
    const sp = Math.hypot(me.vx, me.vz);
    // between where the cart points and where it goes (the drift shows)
    const travel = sp > 1 ? Math.atan2(me.vx, me.vz) : me.yaw;
    const aim = me.yaw + wrap(travel - me.yaw) * .55;
    if (state === 'count') camYaw = me.yaw;
    camYaw += wrap(aim - camYaw) * Math.min(1, dt * 3.2);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let back = 3.4 + Math.min(1.2, sp * .12);
    const hy = 1.75;
    // pulled in when a wall would stand between
    for (let s = .6; s <= back; s += .2) if (blocked(me.x - fx * s, me.y + hy * s / back + .6, me.z - fz * s)) { back = Math.max(.9, s - .3); break; }
    want.set(me.x - fx * back, me.y + hy, me.z - fz * back);
    look.set(me.x + fx * 2.2, me.y + .8, me.z + fz * 2.2);
    if (state === 'count') {
      // a swoop down from over the church portal
      const k = 1 - Math.pow(Math.max(0, count - .5) / 3, 2);
      tmp.set(me.x - fx * 9, me.y + 9, me.z - fz * 9 + 6);
      eye.lerpVectors(tmp, want, clamp(k, 0, 1));
      camReady = true;
    } else if (!camReady || dt === 0) { eye.copy(want); camReady = true; }
    else eye.lerp(want, Math.min(1, dt * 8));
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .8); camera.position.x += (Math.random() - .5) * shake * .3; camera.position.y += (Math.random() - .5) * shake * .3; }
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const fov = 68 + Math.min(10, sp * 1.3);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  function finish() {
    const of = carts.length, humans = carts.filter(c => !c.bot);
    if (mode === 'course') {
      const p = carts.filter(c => c.done && c !== me && c.doneAt <= me.doneAt).length + 1;
      result = { place: p, of, time: me.time, value: me.time };
      ui.toast(p === 1 ? 'victoire ! le caddie d\'or' : `arrivée : ${p}e`, false, 2000);
    } else {
      const p = humans.filter(c => c !== me && c.done && c.doneAt < me.doneAt).length + 1;
      result = { place: p, of: humans.length, time: me.time, value: me.time, text: `${LAPS} tours en ${fmt(me.time)}` };
      ui.toast(`arrivée en ${fmt(me.time)}`, false, 2000);
    }
    audio.win();
    endT = 2.6;
  }

  // built as soon as the code is here (the square's props are known by then), and warmed
  solids = solidsFrom(world?.colliders || [], TR.box);
  build();
  warm();

  const gauge = (c) => '▰'.repeat(c.combo) + '▱'.repeat(3 - c.combo);
  return {
    modes: MODES,
    keys: [['z', 'pousser du pied · en rythme : plus fort'], ['q d', 'tourner'], ['s', 'freiner du pied'], ['shift', 'déraper · contre-braquer'], ['espace', 'objet du panier'], ['r', 'revenir sur la piste']],
    start, update, stop, onFx, peerLeft,
    respawn() { if (state === 'race' && me && !me.done && respawnCd <= clock) { respawnCd = clock + 1; respawnCart(me, true); ui.toast('retour au dernier point de passage', false, 900); } },
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { count: 0 };
      const o = order();
      const hint = clock - goAt < 7 ? ' · garde z pour pousser, tape-le en rythme pour plus d\'élan' : me.fall >= 0 ? ' · on se relève…' : me.drift ? ' · contre-braque pour rattraper' : '';
      return {
        lap: clamp(me.laps + 1, 1, LAPS), laps: LAPS, place: o.indexOf(me) + 1, of: carts.length, time: me.time,
        wrong: me.wrongT > .8, item: me.item ? ITEMS[me.item] : null,
        extra: `élan <em>${gauge(me)}</em>${hint}`,
        board: o.map(c => ({ name: c.name, color: c.color, me: c === me })),
      };
    },
    preview() { return me ? { x: me.x, z: me.z, y: me.y + .6, yaw: me.yaw, rad: 4.5, h: 1.8 } : null; },
    set onEnd(f) { onEnd = f; },
    // tests and the menu
    get me() { return me; }, get carts() { return carts; }, get track() { return TR; }, get state() { return state; }, get melons() { return melons; }, get flours() { return flours; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _give(it) { if (me) me.item = it; },
    _use() { if (me) useItem(me); },
    // just before the line, `lapsLeft` laps from the end (1: the last lap)
    _warp(lapsLeft = 1) { if (!me) return; const i = N - 30, per = TR.cps.length; placeCart(me, TR, i); me.laps = Math.max(0, LAPS - lapsLeft); me.cp = me.laps * per + per - 1; me.k = me.laps * N + i; },
  };
}
