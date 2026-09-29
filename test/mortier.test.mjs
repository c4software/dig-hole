// mortier.test.mjs, the firework mortars pinched at the lycée's blockade: an item never sold,
// nine at most, its own hotbar slot, the admin's handful; a rocket bursts in the air after its
// fuse, or on the ground first (and only the thrower's digs a small hole); every client flies it
// the same from the fx.
//   node --test test/mortier.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const any = new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : any,
  set: () => true, apply: () => any, construct: () => any, has: () => true,
});
const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, width: 64, height: 64, appendChild: (c) => c, remove() {}, addEventListener() {}, getContext: () => any });
globalThis.document ??= { createElement: el, createElementNS: el, getElementById: () => el(), body: el(), addEventListener() {}, removeEventListener() {} };
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { ITEMS, SLOTS, createEconomy } = await import('../src/economy.js');
const { createTunables } = await import('../src/tunables.js');
const M = await import('../src/mortier.js');

test('mortier: an item never sold, nine at most, in the hotbar, the admin sets the handful', () => {
  const it = ITEMS.mortier;
  assert.ok(it && it.stolen && it.price === 0 && it.max === 9);
  assert.ok(it.name.includes('mortier'));
  assert.ok(SLOTS.includes('mortier'));
  const eco = createEconomy('t-mortier');
  eco.give('mortier', 3); assert.equal(eco.s.items.mortier, 3);
  eco.give('mortier', 20); assert.equal(eco.s.items.mortier, 9);
  assert.ok(eco.use('mortier')); assert.equal(eco.s.items.mortier, 8);
  const tun = createTunables();
  assert.equal(tun.get('mortierVol'), 3);
  tun.set('mortierVol', 50); assert.equal(tun.get('mortierVol'), 9);
});

function town(ground) {
  const scene = new THREE.Scene(), bursts = [], holes = [], sounds = [];
  const sfx = { launch: (...a) => sounds.push(['launch', ...a]), burst: (...a) => sounds.push(['burst', ...a]) };
  const m = M.createMortiers({ scene, sfx, hooks: { ground, carve: (x, y, z, r) => holes.push([x, y, z, r]), burst: (x, y, z, mine) => bursts.push([x, y, z, mine]) } });
  return { m, bursts, holes, sounds };
}
const camera = new THREE.PerspectiveCamera(70, 1.6, .1, 500);

test('mortier: up and away, bursts in the air after its fuse, the same for everyone', () => {
  const A = town(() => false), B = town(() => false);
  const p = [0, 1.6, 0], d = [0, 0, -1];
  A.m.fire(p, d, true); B.m.fire(p, d, false);
  assert.equal(A.m.live, 1);
  for (let t = 0; t < M.FUSE + .2; t += 1 / 60) { A.m.update(1 / 60, camera); }
  for (let t = 0; t < M.FUSE + .2; t += 1 / 25) { B.m.update(1 / 25, camera); }
  assert.equal(A.m.live, 0); assert.equal(A.bursts.length, 1); assert.equal(B.bursts.length, 1);
  const [x, y, z] = A.bursts[0];
  assert.ok(y > 4 && z < -15 && Math.abs(x) < 1e-6, `burst at ${x} ${y} ${z}`);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(A.bursts[0][k] - B.bursts[0][k]) < 1e-6, 'same burst on another client');
  assert.equal(A.holes.length, 0, 'in the air: no hole');
  assert.ok(A.sounds.some(s => s[0] === 'launch') && A.sounds.some(s => s[0] === 'burst'));
  const q = M.rocketAt(p, d, M.FUSE);
  assert.ok(Math.abs(q.z - z) < 1e-6 && Math.abs(q.y - y) < 1e-6);
});

test('mortier: into the ground, it bursts there; only the thrower digs (a small hole)', () => {
  const ground = (x, y) => y < 0;
  const A = town(ground), B = town(ground);
  A.m.fire([0, 1.6, 0], [0, -.3 / Math.hypot(1, .3), -1 / Math.hypot(1, .3)], true);
  B.m.fire([0, 1.6, 0], [0, -.3 / Math.hypot(1, .3), -1 / Math.hypot(1, .3)], false);
  for (let t = 0; t < 2; t += 1 / 60) { A.m.update(1 / 60, camera); B.m.update(1 / 60, camera); }
  assert.equal(A.bursts.length, 1); assert.ok(A.bursts[0][1] < 1, 'on the ground');
  assert.equal(A.holes.length, 1); assert.equal(A.holes[0][3], M.HOLE);
  assert.ok(M.HOLE <= 1);
  assert.equal(B.holes.length, 0, 'the others only watch');
});
