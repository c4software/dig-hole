// games.test.mjs, the mini-games fetched on demand (src/games.js): every game main.js lists in RACES has
// its code in GAME_CODE, loads with import(), and its factory gives a race module with the whole contract.
//   node --test test/games.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

// ---------- a browser made of nothing: any call works, any value reads as 0 ----------
const any = new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : any,
  set: () => true, apply: () => any, construct: () => any, has: () => true,
});
const el = () => {
  const n = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [], width: 64, height: 64,
    appendChild: (c) => c, append() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => el(), querySelectorAll: () => [],
    getContext: () => any, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }), toDataURL: () => '', insertAdjacentHTML() {}, focus() {} };
  return n;
};
globalThis.document = { createElement: el, createElementNS: el, getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [], body: el(), documentElement: el(), addEventListener() {}, removeEventListener() {} };
globalThis.window = globalThis;
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.Image = class { set src(v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return any; } };
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });

const { GAME_CODE } = await import('../src/games.js');
const { createOrgan } = await import('../src/church.js');

// the ids main.js offers (its RACES table), read from the source
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const block = main.slice(main.indexOf('const RACES = {'), main.indexOf('\n};\n', main.indexOf('const RACES = {')));
const RACE_IDS = [...block.matchAll(/^ {2}([a-z0-9]+): \{ make:/gm)].map(m => m[1]);

test('every game of RACES has its code in games.js, and nothing more', () => {
  assert.ok(RACE_IDS.length >= 20, `RACES read from main.js: ${RACE_IDS.length}`);
  assert.deepEqual([...RACE_IDS].sort(), Object.keys(GAME_CODE).sort());
  // and no game module is still imported up front
  for (const src of fs.readFileSync(new URL('../src/games.js', import.meta.url), 'utf8').matchAll(/import\('\.\/([a-z0-9-]+)\.js'\)/g))
    assert.ok(!new RegExp(`^import .* from '\\./${src[1]}\\.js';`, 'm').test(main), `${src[1]}.js imported statically by main.js`);
});

// what main.js hands the factories (the real values are the game's scene, audio, ui…)
function ctx() {
  const scene = new THREE.Scene();
  const organ = createOrgan({ parent: scene, at: new THREE.Vector3(10, 0, 20), rot: -Math.PI / 2 });
  const world = { colliders: [], interactables: [], F: { pool: new THREE.Group() }, fountain: new THREE.Group(), label: () => new THREE.Texture(), sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), lamp: new THREE.PointLight() };
  return { scene, camera: new THREE.PerspectiveCamera(), audio: any, ui: any, world, terrain: any, at: new THREE.Vector3(0, .6, -900), organ, church: { altar: new THREE.Vector3(0, 0, 30), organ: new THREE.Vector3(10, 0, 20) }, eco: { s: {} }, pay() {}, save() {} };
}
const CONTRACT = ['start', 'stop', 'update', 'hud', 'onFx', 'peerLeft', 'respawn'];

for (const id of Object.keys(GAME_CODE)) {
  test(`« ${id} » loads with import() and builds a race module`, async () => {
    const create = await GAME_CODE[id]();
    assert.equal(typeof create, 'function', `${id}: the factory`);
    let mod;
    try { mod = create(ctx()); } catch (e) { assert.fail(`${id}: its factory threw in the stub browser: ${e.stack}`); }
    for (const k of CONTRACT) assert.equal(typeof mod[k], 'function', `${id}.${k}()`);
    mod.onEnd = () => {};   // main.js sets it on every game
    if (mod.modes) for (const m of mod.modes) assert.ok(m.id && m.name, `${id}: a mode needs an id and a name`);
  });
}
