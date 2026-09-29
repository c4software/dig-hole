// caddies.test.mjs, la course de caddies: the loop on the church square is closed and clear of the
// village's props, the checkpoints come in order, the trolley's physics stay sane (the drift bounded,
// no NaN, the rhythm pays), a whole race of bots finishes, and two players see each other's carts
// through netlerp without ever steering the other's.
//   node --test test/caddies.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

// ---------- a browser made of nothing (as in games.test.mjs) ----------
const any = new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : any,
  set: () => true, apply: () => any, construct: () => any, has: () => true,
});
const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [], width: 64, height: 64,
  appendChild: (c) => c, append() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => el(), querySelectorAll: () => [],
  getContext: () => any, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }), toDataURL: () => '', insertAdjacentHTML() {}, focus() {} });
globalThis.document = { createElement: el, createElementNS: el, getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [], body: el(), documentElement: el(), addEventListener() {}, removeEventListener() {} };
globalThis.window = globalThis;
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
// a wall clock the test turns (netlerp reads performance.now)
let wall = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => wall }, configurable: true });
const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('serialize')) warn(...a); };

const { buildTrack, groundY, solidsFrom, STEP } = await import('../src/caddies-track.js');
const P = await import('../src/caddies-physics.js');
const { createEurope } = await import('../src/europe.js');

// the village's colliders, as world.js makes them
const colliders = [];
createEurope({ scene: new THREE.Scene(), addBox: (x0, y0, z0, x1, y1, z1) => { const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }; colliders.push(c); return c; } });
const { STAND } = await import('../src/caddies-stand.js');
colliders.push({ min: new THREE.Vector3(STAND.x - 1.1, 0, STAND.z - .35), max: new THREE.Vector3(STAND.x + 1.4, 1.1, STAND.z + .35) });
const tr = buildTrack();
const solids = solidsFrom(colliders, tr.box);
const env = { track: tr, solids };
const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const finite = (c) => ['x', 'z', 'y', 'vx', 'vz', 'yaw', 'slip'].every(k => Number.isFinite(c[k]));

test('the course: a closed loop on the church square, checkpoints in order', () => {
  assert.ok(tr.N > 200 && tr.len > 60 && tr.len < 140, `length ${tr.len}`);
  // evenly sampled, and the last sample comes back to the first
  for (let i = 0; i < tr.N; i++) {
    const a = tr.pts[i], b = tr.pts[(i + 1) % tr.N], d = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(Math.abs(d - tr.len / tr.N) < .02, `gap at ${i}: ${d}`);
    assert.ok(a.hw >= .8 && a.hw <= 2.2, `half width at ${i}`);
  }
  assert.ok(Math.abs(tr.len / tr.N - STEP) < .01);
  // the checkpoints: rising, the last one the line itself
  for (let i = 1; i < tr.cps.length; i++) assert.ok(tr.cps[i] > tr.cps[i - 1]);
  assert.equal(tr.cps[tr.cps.length - 1], tr.N);
  // the start line is in front of the church portal (the tower's front at z 12.25, x 57.75..64.25)
  const s = tr.pts[0];
  assert.ok(s.z > 10 && s.z < 12.5 && s.x > 60 && s.x < 70, `start at ${s.x}, ${s.z}`);
  // it never crosses itself: two samples far apart along the line stay apart
  for (let i = 0; i < tr.N; i += 3) for (let j = i + 40; j < tr.N - 40 + i && j < tr.N; j += 3) {
    const a = tr.pts[i], b = tr.pts[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.hw + b.hw, `the line meets itself near ${i} / ${j}`);
  }
});

test('the course keeps clear of the square\'s props: benches, café tables, cars, the fountain', () => {
  assert.ok(solids.length > 20, 'the village\'s props are read');
  for (let i = 0; i < tr.N; i++) {
    const p = tr.pts[i];
    for (const b of solids) {
      const dx = p.x - Math.max(b.x0, Math.min(p.x, b.x1)), dz = p.z - Math.max(b.z0, Math.min(p.z, b.z1));
      assert.ok(Math.hypot(dx, dz) > P.TUNE.R + .25, `sample ${i} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) runs into a prop`);
    }
  }
  // the kerbs: the square and the pavements over the road
  assert.equal(groundY(61, 2), .1); assert.equal(groundY(61, -13.1), .02);
});

test('the trolley: kicks push it, the drift stays bounded, no NaN under any keys', () => {
  const c = P.newCart('me');
  P.placeCart(c, tr, 20);
  const rnd = seeded(5);
  let maxSlip = 0, maxSp = 0;
  for (let n = 0; n < 12000; n++) {
    const inp = { steer: rnd() * 2 - 1, kick: rnd() < .7, tap: rnd() < .2, brake: rnd() < .08, drift: rnd() < .5 };
    P.stepCart(c, inp, n % 50 === 0 ? .05 : 1 / 60, env);
    assert.ok(finite(c), `NaN at step ${n}`);
    maxSlip = Math.max(maxSlip, Math.abs(c.slip)); maxSp = Math.max(maxSp, Math.hypot(c.vx, c.vz));
    // never out of the barriers
    const i = tr.nearest(c.x, c.z);
    assert.ok(Math.abs(tr.lateral(i, c.x, c.z)) < tr.pts[i].hw + .5, `out of the course at ${n}`);
  }
  assert.ok(maxSlip <= P.TUNE.SLIP_MAX + 1e-6, `slip ${maxSlip}`);
  assert.ok(maxSp < 11, `top speed ${maxSp}`);
  // a drift on an open square: the rear swings out, then the counter-steer brings it back
  const d = P.newCart('d'); d.yaw = 0; d.vz = 6; d.x = 0; d.z = 0;
  const open = { track: null, solids: [] };
  let peak = 0;
  for (let n = 0; n < 40; n++) { P.stepCart(d, { steer: 1, drift: true }, 1 / 60, open); peak = Math.max(peak, Math.abs(d.slip)); }
  assert.ok(d.drift === 1 && peak > .25, `the rear swings out (${peak})`);
  for (let n = 0; n < 60; n++) P.stepCart(d, { steer: -1, drift: true }, 1 / 60, open);
  assert.ok(Math.abs(d.slip) < peak, 'the counter-steer catches it');
});

test('the kick: tapping in rhythm goes faster than holding the key', () => {
  const run = (rhythm) => {
    const c = P.newCart('k'); c.yaw = 0;
    const open = { track: null, solids: [] };
    let held = false;
    for (let n = 0; n < 60 * 12; n++) {
      const tap = rhythm ? c.kick === 0 && c.since > .05 && (c.since < .12 || c.since > 5) && !held : false;
      held = tap;
      P.stepCart(c, { steer: 0, kick: !rhythm || tap, tap }, 1 / 60, open);
    }
    return Math.hypot(c.vx, c.vz);
  };
  const hold = run(false), tap = run(true);
  assert.ok(hold > 3.5 && hold < 7, `holding: ${hold}`);
  assert.ok(tap > hold + .5, `in rhythm ${tap} vs holding ${hold}`);
});

test('a hard knock throws the rider off; up again after a while', () => {
  const c = P.newCart('f'); c.yaw = 0; c.vz = 7; c.x = 0; c.z = 0;
  const wall = { track: null, solids: [{ x0: -5, x1: 5, z0: .8, z1: 1.2 }] };
  const ev = [];
  for (let n = 0; n < 30 && c.fall < 0; n++) P.stepCart(c, { steer: 0 }, 1 / 60, wall, ev);
  assert.ok(c.fall >= 0 && ev.some(e => e.kind === 'fall'), 'off the cart');
  for (let n = 0; n < 60 * 3; n++) P.stepCart(c, { steer: 0, kick: true, tap: true }, 1 / 60, wall);
  assert.equal(c.fall, -1, 'back on');
  // a gentle touch does not
  const g = P.newCart('g'); g.yaw = 0; g.vz = 2;
  for (let n = 0; n < 60; n++) P.stepCart(g, { steer: 0 }, 1 / 60, wall);
  assert.equal(g.fall, -1);
});

test('a barrier never pins a cart: head-on or glancing, it slides along and gets going again', () => {
  const wall = { track: null, solids: [{ x0: -50, x1: 50, z0: 1.2, z1: 1.6 }] };
  for (const yaw of [0, .5]) {
    const c = P.newCart('w'); c.yaw = yaw; c.vx = Math.sin(yaw) * 3; c.vz = Math.cos(yaw) * 3;
    for (let n = 0; n < 60 * 4; n++) P.stepCart(c, { steer: 0, kick: true, tap: false }, 1 / 60, wall);
    assert.ok(Math.hypot(c.vx, c.vz) > 2, `still rolling along the wall (yaw ${yaw}: ${Math.hypot(c.vx, c.vz).toFixed(2)})`);
    assert.ok(Math.abs(c.x) > 3, 'slid along it');
  }
});

test('a whole race of bots: three laps, every checkpoint in order, everyone home', () => {
  for (const seed of [3, 11]) {
    const rnd = seeded(seed), carts = [];
    for (let n = 0; n < 6; n++) {
      const c = P.newCart('b' + n, { bot: true, skill: .86 + rnd() * .12, ph: n * 2.3 + 1 });
      P.placeCart(c, tr, (tr.N - 5 - Math.floor(n / 2) * 7) % tr.N, n % 2 ? .45 : -.45);
      c.k = c.idx - tr.N; c.lane = (rnd() - .5) * 1.3; c.seq = [];
      carts.push(c);
    }
    let t = 0;
    const dt = 1 / 60;
    while (t < 150 && !carts.every(c => c.done)) {
      t += dt;
      for (const c of carts) {
        P.stepCart(c, P.botInput(c, tr, rnd), dt, env);
        assert.ok(finite(c), `NaN (${c.key} at ${t.toFixed(2)})`);
        const before = c.cp;
        P.trackProgress(c, tr, 3, dt);
        for (let m = before; m < c.cp; m++) c.seq.push(m % tr.cps.length);
        if (Math.hypot(c.vx, c.vz) < .4 && c.fall < 0) { c.stuckT += dt; if (c.stuckT > 2.5) { c.stuckT = 0; P.placeCart(c, tr, c.idx); } } else c.stuckT = 0;
      }
      for (let a = 0; a < carts.length; a++) for (let b = a + 1; b < carts.length; b++) P.collideCarts(carts[a], carts[b], true, true, dt);
    }
    for (const c of carts) {
      assert.ok(c.done, `${c.key} finished (seed ${seed}, k ${c.k})`);
      assert.equal(c.laps, 3);
      // 0 1 2 … per-1, three times: never one skipped or out of order
      assert.deepEqual(c.seq, Array.from({ length: 3 * tr.cps.length }, (_, m) => m % tr.cps.length));
    }
    assert.ok(t < 120, `the race took ${t.toFixed(1)} s`);
  }
});

// ---------- the module itself, twice, over a fake network ----------
const stubAudio = new Proxy({}, { get: () => () => {} });
const stubUi = { toast() {} };
function makeGame(meId) {
  const cam = new THREE.PerspectiveCamera(70, 1.6, .1, 500);
  return import('../src/caddies.js').then(({ createCaddies }) => {
    const scene = new THREE.Scene();
    const mod = createCaddies({ scene, camera: cam, audio: stubAudio, ui: stubUi, world: { colliders } });
    mod.onEnd = (r) => { mod.ended = r; };
    return { mod, cam, scene, meId };
  });
}

test('the race module: solo with bots, a lap done, quit cleans up; the camera never jumps', async () => {
  const g = await makeGame('me');
  const m = g.mod;
  m.start({ seed: 42 });
  assert.equal(m.carts.length, 6);
  assert.ok(m.me && !m.me.bot);
  m._go(); m._auto(true);
  let last = g.cam.position.clone(), jump = 0;
  for (let n = 0; n < 60 * 20; n++) {
    wall += 1000 / 60;
    m.update(1 / 60, new Set());
    if (n > 90) jump = Math.max(jump, g.cam.position.distanceTo(last));
    last.copy(g.cam.position);
    for (const c of m.carts) assert.ok(finite(c), `NaN on ${c.key}`);
  }
  assert.ok(m.me.cp >= 3, `me past a few checkpoints (${m.me.cp})`);
  assert.ok(jump < .8, `the camera jumped ${jump.toFixed(2)} m in a frame`);
  const h = m.hud();
  assert.ok(h.lap >= 1 && h.place >= 1 && h.of === 6 && h.board.length === 6);
  // r: back to the last checkpoint passed, facing along the course
  const cp = m.me.cp, idx = tr.cps[(cp - 1) % tr.cps.length] % tr.N;
  m.respawn();
  assert.equal(m.me.cp, cp); assert.equal(m.me.idx, idx);
  assert.ok(Math.abs(m.me.x - tr.pts[idx].x) < .01 && Math.abs(m.me.z - tr.pts[idx].z) < .01);
  // items: a flour cloud and a melon behind, a swat beside
  m._give('flour'); m._use(); assert.ok(m.flours.some(f => f.id.startsWith('me:')), 'my flour on the paving');
  m._give('melon'); m._use(); assert.ok(m.melons.some(f => f.id.startsWith('me:')), 'my melon rolling');
  m._give('baguette'); m._use();
  for (let n = 0; n < 30; n++) { wall += 16; m.update(1 / 60, new Set()); }
  // the finish
  m._warp(1);
  for (let n = 0; n < 60 * 8 && !m.ended; n++) { wall += 1000 / 60; m.update(1 / 60, new Set()); }
  assert.ok(m.ended && m.ended.place >= 1 && m.ended.of === 6 && m.ended.time > 0, 'onEnd with a place');
  m.stop();
  assert.equal(m.carts.length, 0);
  assert.equal(g.scene.children.filter(o => o.visible).length, 0, 'nothing left on the square');
});

test('holding only z from the grid: the cart gets going and slides round the first corner', async () => {
  const g = await makeGame('me');
  const m = g.mod;
  m.start({ seed: 5, opts: { mode: 'chrono' } });
  m._go();
  const keys = new Set(['KeyW']);
  let top = 0;
  for (let n = 0; n < 60 * 10; n++) { wall += 1000 / 60; m.update(1 / 60, keys); top = Math.max(top, Math.hypot(m.me.vx, m.me.vz)); }
  assert.ok(top > 4, `top speed with z held: ${top.toFixed(2)}`);
  assert.ok(m.me.k > 30 * 4, `got along the course (k ${m.me.k})`);
  assert.ok(Math.hypot(m.me.vx, m.me.vz) > 1, 'not pinned');
  m.stop();
});

test('two players: each drives their own cart, the other one comes through netlerp', async () => {
  const src = fs.readFileSync(new URL('../src/caddies.js', import.meta.url), 'utf8');
  assert.match(src, /netTrack\(/);
  const A = await makeGame('a'), B = await makeGame('b');
  const humans = [{ id: 'a', name: 'anna', color: 0xe8384f }, { id: 'b', name: 'bob', color: 0x3a8ef0 }];
  // what one sends reaches the other ~40 ms later
  const wire = [];
  const post = (to, from) => (fx) => wire.push({ at: wall + 40, to, from, fx: JSON.parse(JSON.stringify(fx)) });
  A.mod.start({ seed: 9, humans, hostId: 'a', meId: 'a', send: post(B, 'a') });
  B.mod.start({ seed: 9, humans, hostId: 'a', meId: 'b', send: post(A, 'b') });
  assert.equal(A.mod.carts.length, 6); assert.equal(B.mod.carts.length, 6);
  A.mod._go(); B.mod._go(); A.mod._auto(true); B.mod._auto(true);
  let worst = 0, n = 0;
  for (let f = 0; f < 60 * 15; f++) {
    wall += 1000 / 60;
    while (wire.length && wire[0].at <= wall) { const w = wire.shift(); w.to.mod.onFx(w.from, w.fx); }
    A.mod.update(1 / 60, new Set()); B.mod.update(1 / 60, new Set());
    if (f > 120) {
      // B's copy of A's cart is close to where A is (a little behind), and B never moved it itself
      const a = A.mod.carts.find(c => c.key === 'a'), aB = B.mod.carts.find(c => c.key === 'a');
      const d = Math.hypot(a.x - aB.x, a.z - aB.z);
      worst = Math.max(worst, d); n++;
      assert.ok(aB.trk && aB.trk.ready, 'A\'s cart replayed through netlerp');
      // the bots come from the host
      const bA = A.mod.carts.find(c => c.bot), bB = B.mod.carts.find(c => c.key === bA.key);
      assert.ok(Math.hypot(bA.x - bB.x, bA.z - bB.z) < 3, 'the host\'s bot, replayed');
    }
  }
  assert.ok(n > 0 && worst < 2.5, `A seen by B at most ${worst.toFixed(2)} m off`);
  A.mod.stop(); B.mod.stop();
});

test('the sounds: every one plays in a fake WebAudio, placed ones too', async () => {
  let nodes = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('ramp to ' + v); }, setTargetAtTime() {} });
  const node = () => { nodes++; return { gain: param(), frequency: param(), Q: param(), positionX: param(), positionY: param(), positionZ: param(), connect() {}, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {}, type: '', buffer: null, loop: false }; };
  class FakeAudio {
    constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = node(); this.listener = { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() }; }
    createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); } createBufferSource() { return node(); } createPanner() { return node(); }
    createBuffer(ch, len) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (c) => d[c] }; }
    createPeriodicWave() { return {}; }
    resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() {}
  }
  globalThis.AudioContext = FakeAudio;
  const { createCaddieSfx } = await import('../src/caddies-sfx.js');
  const s = createCaddieSfx();
  s.init();
  s.ears(new THREE.PerspectiveCamera());
  const at = { x: 60, y: .5, z: 5 };
  for (const k of ['squeak', 'kick', 'boost', 'bump', 'crash', 'kerb', 'swat', 'splat', 'roll', 'flour', 'pickup', 'tumble']) {
    wall += 5000;
    const before = nodes;
    s[k](); s[k](k === 'kick' ? true : 2, 1, at);
    assert.ok(nodes > before, `${k} made no sound`);
  }
  for (let n = 0; n < 50; n++) s.ride(6, n % 2 === 0, n % 3 === 0, false, false, .5);
  s.quiet(); s.close();
  delete globalThis.AudioContext;
});
