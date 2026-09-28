// orgue.test.mjs, the organ's pieces without a browser: the scores, cathedral metal, the charts
// orgue héros reads off them at every level, and the crypt still opening to the dies irae.
//   node test/orgue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const any = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : any, apply: () => any, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => any }), getElementById: () => null, body: any, head: any, addEventListener() {} };
globalThis.addEventListener ??= () => {};

const { SONGS } = await import('../src/church.js');
const { SETLIST, SECTIONS, LEVELS, makeChart } = await import('../src/orgue-songs.js');

test('the free-play pieces: the old ones in their places, the metal ones after', () => {
  assert.deepEqual(SONGS.slice(0, 5).map(S => S.name.split(' · ')[0]), ['toccata et fugue en ré mineur', 'jésus que ma joie demeure', 'canon en ré', 'ode à la joie', 'dies irae']);
  assert.ok(SONGS.slice(0, 5).every(S => !S.metal));
  const metal = SONGS.filter(S => S.metal);
  assert.ok(metal.length >= 10, 'metal pieces: ' + metal.length);
  assert.equal(SONGS.findIndex(S => S.metal), 5);
  assert.equal(new Set(SONGS.map(S => S.name)).size, SONGS.length, 'names unique');
});

test('every score parses: numbers, midi in range, in time order, sane length', () => {
  for (const S of SONGS) {
    assert.ok(S.beat > .15 && S.beat < 1, S.name);
    let prev = -1;
    for (const e of S.score) {
      const [t, l, ...notes] = e;
      assert.ok(Number.isFinite(t) && t >= 0 && t >= prev, `${S.name}: onset ${t}`);
      assert.ok(Number.isFinite(l) && l > 0, `${S.name}: length ${l}`);
      assert.ok(notes.length > 0 && notes.every(m => Number.isInteger(m) && m >= 12 && m <= 100), `${S.name}: notes ${notes}`);
      prev = t;
    }
    assert.ok(S.length > 15 && S.length < 95, `${S.name}: ${S.length.toFixed(1)} s`);
    if (S.metal) {
      assert.ok(S.length >= 28, `${S.name}: ${S.length.toFixed(1)} s`);
      assert.ok(S.score.some(e => e.acc) && S.score.some(e => !e.acc), S.name + ': a tune and a band');
    }
  }
});

test('the setlist: two sections, the metal one last', () => {
  assert.deepEqual(SECTIONS, ['l\'église', 'cathédrale métal']);
  const first = SETLIST.findIndex(S => S.section === 1);
  assert.ok(first > 0 && SETLIST.slice(first).every(S => S.section === 1 && S.metal));
  assert.ok(SETLIST.slice(0, first).every(S => S.section === 0 && !S.metal));
  assert.equal(SETLIST.length - first, SONGS.filter(S => S.metal).length);
});

test('charts at every level: non-empty, lanes in range, gaps kept, fast runs thinned, deterministic', () => {
  const order = ['facile', 'normal', 'difficile', 'expert'];
  SETLIST.forEach((S, i) => {
    const counts = order.map(lv => {
      const L = LEVELS[lv], c = makeChart(i, lv);
      assert.ok(c.gems.length >= 12, `${S.name} ${lv}: ${c.gems.length} notes`);
      assert.ok(c.length > 15 && c.length < 100, `${S.name} ${lv}: ${c.length}`);
      assert.equal(c.metal, S.metal);
      const tune = c.gems.filter(q => !q.extra);
      for (let k = 0; k < c.gems.length; k++) {
        const q = c.gems[k];
        assert.ok(q.lane >= 0 && q.lane < L.lanes && Number.isFinite(q.t) && q.len >= 0, `${S.name} ${lv}`);
        if (k) assert.ok(q.t >= c.gems[k - 1].t, 'in order');
      }
      for (let k = 1; k < tune.length; k++) assert.ok(tune[k].t - tune[k - 1].t >= L.gap - 1e-3, `${S.name} ${lv}: gap ${(tune[k].t - tune[k - 1].t).toFixed(3)}`);
      // the band never becomes the tune
      if (S.metal) {
        assert.ok(c.accomp.some(a => a.acc));
        const band = new Set(S.score.filter(e => e.acc).map(([t, , ...n]) => +(t * S.beat).toFixed(4) + ':' + n));
        const tunes = new Set(S.score.filter(e => !e.acc).map(([t, , ...n]) => +(t * S.beat).toFixed(4) + ':' + n));
        for (const q of tune) { const k = q.t + ':' + q.notes; assert.ok(tunes.has(k) || !band.has(k), `${S.name} ${lv}: a band note to play at ${q.t}`); }
      }
      assert.deepEqual(makeChart(i, lv).gems.map(q => q.t + ':' + q.lane), c.gems.map(q => q.t + ':' + q.lane));
      return tune.length / c.length;
    });
    for (let k = 1; k < 4; k++) assert.ok(counts[k] >= counts[k - 1] - 1e-9, `${S.name}: harder levels keep at least as many notes`);
    // nothing faster than the level allows, even in the sixteenths
    assert.ok(counts[0] <= 1 / LEVELS.facile.gap + 1e-6 && counts[3] <= 1 / LEVELS.expert.gap + 1e-6);
  });
});

test('the crypt: the dies irae on the organ moves the slab (the plainchant and the metal one)', async () => {
  const { createCrypt } = await import('../src/crypt.js');
  const mk = (song) => {
    const organ = { playing: song >= 0, song };
    const s = {};
    const interactables = [];
    const crypt = createCrypt({
      scene: new THREE.Scene(), colliders: [], interactables, terrain: { group: new THREE.Group() }, eco: { s },
      ui: { toast() {}, hint() {}, layer() {} }, audio: {}, organ, songs: SONGS,
      hooks: { save() {}, goTo() {}, unlock() {}, hasGame: () => false, offerGame() {}, openVault() {} },
    });
    crypt.interact(interactables.find(it => it.id === 'gisant'));
    return s.crypt.open;
  };
  const dies = SONGS.findIndex(S => /dies irae/i.test(S.name));
  assert.equal(dies, 4);
  assert.equal(mk(dies), true);
  assert.equal(mk(SONGS.findIndex(S => S.name === 'dies irae · version métal')), true);
  assert.equal(mk(0), false);
  assert.equal(mk(SONGS.findIndex(S => /walkyries/.test(S.name))), false);
  assert.equal(mk(-1), false);
});
