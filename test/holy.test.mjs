// holy.test.mjs, the holy bomba without a browser: the code and the tablet drawn from mars's
// seed, the chapel's cells, the item and its blast, and how main.js wires them.
//   node test/holy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holyCode, tabletDir, checkCode, cleanCode, chapelCells, knownCode, CODE_LEN, CHAPEL, CHEST, HOLY_TAKES } from '../src/holy-code.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

test('the code: four digits 1-9, the same for the same seed', () => {
  for (const seed of [1971, 3, 123456789, -5, 0]) {
    const c = holyCode(seed);
    assert.match(c, /^[1-9]{4}$/);
    assert.equal(c.length, CODE_LEN);
    assert.equal(holyCode(seed), c);
  }
  const seen = new Set(Array.from({ length: 200 }, (_, n) => holyCode(n * 7919 + 3)));
  assert.ok(seen.size > 150, 'codes vary with the seed: ' + seen.size);
});

test('the lock: right code opens, anything else does not', () => {
  const seed = 1971, c = holyCode(seed);
  assert.ok(checkCode(c, seed));
  assert.ok(checkCode(c.split('').join(' · '), seed), 'separators are ignored');
  assert.ok(!checkCode(c.slice(0, 3), seed));
  const wrong = c.split('').map(d => (+d % 9) + 1).join('');
  assert.ok(!checkCode(wrong, seed));
  assert.ok(!checkCode('', seed));
  assert.equal(cleanCode('12a345'), '1234');
});

test('what you know: only for the mars you read it on', () => {
  assert.equal(knownCode({ code: '1234', seed: 5 }, 5), '1234');
  assert.equal(knownCode({ code: '1234', seed: 5 }, 6), null);
  assert.equal(knownCode(null, 5), null);
  assert.equal(knownCode({ code: null, seed: 5 }, 5), null);
});

test('the tablet: far from the lander, clear of the dome, the rover, the hall and the deck', () => {
  const avoid = [[.4, 1, -.3], [-.3, 1, .4], [.66, 1, .12], [-.12, 1, -.66]].map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
  for (let seed = 0; seed < 300; seed++) {
    const d = tabletDir(seed);
    assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
    const off = Math.acos(d[1]) * 180 / Math.PI;
    assert.ok(off >= 55 && off <= 75, `seed ${seed}: ${off}° off the lander`);
    const clear = Math.min(...avoid.map(a => Math.acos(Math.min(1, a[0] * d[0] + a[1] * d[1] + a[2] * d[2])))) * 180 / Math.PI;
    assert.ok(clear > 20, `seed ${seed}: only ${clear.toFixed(1)}° from something`);
  }
  assert.deepEqual(tabletDir(1971), tabletDir(1971));
});

test('the chapel: inside the church ground, below the bell, the reliquary inside it', () => {
  // the church's ground: 40 cells of 40 cm from (53, -16, 19)
  const c = chapelCells(53, -16, 19, .4);
  for (const [a, n] of [[c.i, c.w], [c.j, c.h], [c.k, c.d]]) { assert.ok(a >= 1 && a + n <= 39, JSON.stringify(c)); assert.ok(n > 3); }
  assert.ok(CHAPEL.y1 < -12.4 + .01, 'lower than the bell');
  assert.ok(CHEST.x > CHAPEL.x0 && CHEST.x < CHAPEL.x1 && CHEST.z > CHAPEL.z0 && CHEST.z < CHAPEL.z1);
  assert.ok(HOLY_TAKES >= 1);
});

test('the item and its blast', async () => {
  const { ITEMS, SLOTS, createEconomy } = await import('../src/economy.js');
  const { BLAST, holyOrb } = await import('../src/bombs.js');
  assert.ok(ITEMS.holy && SLOTS.includes('holy'));
  assert.equal(ITEMS.holy.name, 'holy bomba');
  assert.equal(ITEMS.holy.price, 0, 'never sold');
  assert.ok(ITEMS.holy.secret);
  assert.ok(BLAST.holy.r > BLAST.met.r && BLAST.holy.r >= 6);
  assert.equal(BLAST.holy.fuse, 3);
  assert.ok(BLAST.holy.dmg < 100, 'it does not kill outright');
  const orb = holyOrb();
  assert.ok(orb.children.length >= 6);
  const eco = createEconomy('holy-test');
  eco.give('holy', 5);
  assert.equal(eco.s.items.holy, 1, 'one in hand at a time');
  assert.ok(eco.use('holy'));
  assert.equal(eco.s.items.holy, 0);
  assert.ok(!eco.shoddy('holy'), 'never aliexpresso');
});

test('main.js wires it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  assert.match(src, /import \{ createHoly \} from '\.\/holy\.js'/);
  assert.match(src, /const take = [^\n]*kind === 'holy'/, 'takes the ores like the super bomb');
  assert.match(src, /EXPLOSIVES = new Set\(\[[^\]]*'holy'/);
  assert.match(src, /op\.k === 'holy'\) holy\.opened\(op, local\)/, 'the opening is a room op');
  assert.match(src, /if \(it === 'holy'\) holy\.thrown\(\)/);
  assert.match(src, /holy\.buildMars\(marsDecor/);
  assert.match(src, /'Digit9'/);
  // aliexpresso only rolls for what it sells
  assert.match(src, /const ali = \['dyn', 'sup', 'med', 'cell'\]\.includes\(it\)/);
  const holy = fs.readFileSync(path.join(ROOT, 'src/holy.js'), 'utf8');
  assert.match(holy, /cinq/); assert.match(holy, /trois/); assert.match(holy, /choir\(\)/);
});

test('headless: the tablet read on mars, a wrong code, the right one, one each', async () => {
  // just enough of a browser for canvases and the keypad
  const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : noop, apply: () => noop, construct: () => noop, set: () => true });
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, innerHTML: '', querySelector: () => el(), querySelectorAll: () => [el(), el(), el(), el()], addEventListener() {}, appendChild() {}, getContext: () => noop, offsetWidth: 0 });
  globalThis.document ??= { createElement: el, head: el(), body: el() };
  globalThis.addEventListener ??= () => {};
  globalThis.window ??= globalThis;
  const THREE = await import('three');
  const { createHoly } = await import('../src/holy.js');
  const { createEconomy } = await import('../src/economy.js');
  const { createTerrain } = await import('../src/terrain.js');
  await import('../src/crypt.js');
  const scene = new THREE.Scene();
  const church = createTerrain(scene, { theme: 'church', seed: 1789, ox: 61, oz: 27 });
  const eco = createEconomy('holy-headless'), log = [], ops = [];
  const ui = { toast: (t) => log.push(t), hint: (t) => log.push(t), layer: (a) => log.push(a) };
  const holy = createHoly({ scene, fxScene: scene, interactables: [], colliders: [], church, eco, ui, audio: {}, hooks: {
    marsSeed: () => 1971, save() {}, unlock: (k) => log.push('ach ' + k), emit: (op) => { ops.push(op); holy.opened(op, true); },
    enterPanel() {}, closePanel() {}, puff() {}, readTablet() {}, myName: () => 'toi' } });
  // the chapel is hollow, the reliquary shut
  const c = chapelCells(church.X0, church.Y0, church.Z0, church.S);
  assert.ok(!church.solidCell(c.i + 2, c.j + 1, c.k + 2));
  assert.ok(!holy.isOpen && holy.known === null);
  holy.openKeypad();
  assert.equal(holy.tryCode('1111'), false);
  assert.equal(ops.length, 0);
  // mars: close enough to the tablet, and the code is known
  const m = holy.buildMars(new THREE.Group(), (d) => d.clone().multiplyScalar(50), new THREE.Vector3());
  holy.update(.1, { here: 'mars', pos: m.tabPos.clone().addScaledVector(m.d, 3) });
  assert.equal(holy.known, null, 'not from the surface');
  holy.update(.1, { here: 'mars', pos: m.tabPos.clone().addScaledVector(m.d, .5) });
  assert.equal(holy.known, holyCode(1971));
  assert.ok(holy.tabletText().includes(holyCode(1971).split('').join('  ·  ')));
  assert.equal(holy.tryCode(holy.code), true);
  await new Promise(r => setTimeout(r, 3000));
  assert.equal(ops.length, 1); assert.equal(ops[0].k, 'holy');
  assert.equal(eco.s.items.holy, 1); assert.equal(eco.s.holy.taken, 1);
  assert.equal(holy.take(), false, 'one in hand at a time');
  eco.use('holy'); assert.equal(holy.take(), true);
  eco.use('holy'); holy.take(); eco.use('holy');
  assert.equal(holy.take(), false, 'three and no more');
  assert.ok(log.includes('ach tablette') && log.includes('ach reliquaire'));
  holy.blast(new THREE.Vector3()); for (let n = 0; n < 40; n++) holy.update(.1, { here: 'home', pos: new THREE.Vector3() });
});
