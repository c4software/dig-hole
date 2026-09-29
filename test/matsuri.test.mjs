// matsuri.test.mjs, the japanese street's festival without a browser: the taiko pieces and their
// charts at every level, a round of taiko héros, the drum's strokes going round (fx), and the
// goldfish scooping's rules and who gets a fish when two poi go for it.
//   node --test test/matsuri.test.mjs
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
globalThis.innerWidth ??= 1280; globalThis.innerHeight ??= 800; globalThis.devicePixelRatio ??= 1;
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { SONGS, LEVELS, LEVEL_ORDER, makeChart, drumNotes } = await import('../src/taiko-songs.js');
const { createMatsuri } = await import('../src/matsuri.js');
const { createTaiko } = await import('../src/taiko.js');
const { createKingyo } = await import('../src/kingyo.js');
const R = await import('../src/kingyo-rules.js');

const quiet = { tick() {}, win() {}, full() {}, pickup() {}, deny() {}, splash() {}, squeak() {} };
function town() {
  const scene = new THREE.Scene(), g = new THREE.Group(); scene.add(g);
  const sent = [];
  const m = createMatsuri({ parent: g, origin: new THREE.Vector3(400, 0, 0), colliders: [], interactables: [], ui: { toast() {} }, send: (fx) => sent.push(fx) });
  return { scene, m, sent };
}

// ---------- the pieces ----------
test('taiko pieces: sixteen steps a bar, a pentatonic flute, sane lengths', () => {
  assert.ok(SONGS.length >= 5);
  assert.ok(SONGS.some(S => S.name.startsWith('sakura sakura')));
  for (const S of SONGS) {
    assert.doesNotThrow(() => drumNotes(S), S.name);
    const pcs = new Set(S.flute.map(([, , m]) => m % 12));
    assert.ok(pcs.size <= 5, `${S.name}: ${pcs.size} pitch classes`);
    const end = Math.max(...S.flute.map(([t, l]) => t + l));
    assert.ok(end <= S.drums.length * 4, `${S.name}: the flute outlasts the drums`);
    const len = S.drums.length * 4 * S.beat;
    assert.ok(len > 20 && len < 60, `${S.name}: ${len.toFixed(1)} s`);
  }
});

test('taiko charts at every level: non-empty, in order, gaps kept, harder keeps more, deterministic', () => {
  SONGS.forEach((S, i) => {
    const counts = LEVEL_ORDER.map(lv => {
      const L = LEVELS[lv], c = makeChart(i, lv);
      const hits = c.gems.filter(q => q.kind !== 'r');
      assert.ok(hits.length >= 20, `${S.name} ${lv}: ${hits.length} notes`);
      assert.ok(hits.some(q => q.kind === 'd') && hits.some(q => q.kind === 'k'), `${S.name} ${lv}: don and ka`);
      assert.ok(hits.some(q => q.big), `${S.name} ${lv}: big notes`);
      let last = -9;
      for (const q of c.gems) {
        assert.ok(['d', 'k', 'r'].includes(q.kind) && Number.isFinite(q.t) && q.t >= 0 && q.t <= c.length, `${S.name} ${lv}`);
        assert.ok(q.t - last >= L.gap - 1e-3, `${S.name} ${lv}: gap ${(q.t - last).toFixed(3)} at ${q.t}`);
        last = q.t + (q.len || 0);
      }
      assert.ok(c.accomp.length > 20 && c.accomp.some(a => a[1] === 'f'), `${S.name}: the band plays`);
      assert.deepEqual(makeChart(i, lv).gems, c.gems);
      return hits.length;
    });
    for (let k = 1; k < counts.length; k++) assert.ok(counts[k] >= counts[k - 1], `${S.name}: ${counts}`);
  });
});

// ---------- a round of taiko héros ----------
test('taiko héros: a clean run scores every note, the fête comes, a place at the end', () => {
  const { m } = town();
  const game = createTaiko({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: m });
  let res = null; game.onEnd = (r) => { res = r; };
  game.start({ seed: 42, opts: { mode: 'normal' } });
  game.update(.016);
  assert.equal(game.state, 'pick');
  assert.equal(game.seats.length, 3, 'two neighbours keep you company');
  game._choose(1); game._skip();
  const hits = game.chart.gems.filter(q => q.kind !== 'r');
  for (const q of hits) { game._press(q.kind, 'L', q.t); if (q.big) game._press(q.kind, 'R', q.t + .02); }
  assert.equal(game.combo, hits.length);
  assert.ok(game.score > hits.length * 300, 'big notes doubled, combo bonus');
  assert.ok(game.fever > 0 || game.gauge > 0, 'the festival gauge moved');
  game._finish();
  for (let k = 0; k < 120 && !res; k++) game.update(.05);
  assert.ok(res, 'onEnd called');
  assert.equal(res.place, 1);
  assert.equal(res.of, 3);
  assert.match(res.text, /1re place/);
  game.stop();
});

test('taiko héros together: the host picks, the other plays the same piece, scores go round', () => {
  const a = town(), b = town();
  const A = createTaiko({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: a.m });
  const B = createTaiko({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: b.m });
  const humans = [{ id: 'a', name: 'ana', color: 1 }, { id: 'b', name: 'ben', color: 2 }];
  A.start({ seed: 7, humans: humans.map(h => ({ ...h, me: h.id === 'a' })), hostId: 'a', meId: 'a', send: (fx) => B.onFx('a', JSON.parse(JSON.stringify(fx))), opts: { mode: 'difficile' } });
  B.start({ seed: 7, humans: humans.map(h => ({ ...h, me: h.id === 'b' })), hostId: 'a', meId: 'b', send: (fx) => A.onFx('b', JSON.parse(JSON.stringify(fx))), opts: { mode: 'difficile' } });
  assert.equal(A.seats.length, 2, 'no bots together');
  A._choose(3);
  assert.equal(B.state, 'count');
  assert.equal(B.chart.name, A.chart.name);
  assert.deepEqual(B.chart.gems.map(q => q.t), A.chart.gems.map(q => q.t));
  B._skip();
  const q = B.chart.gems.find(g => g.kind !== 'r');
  B._press(q.kind, 'L', q.t);
  B.update(.016);
  assert.ok(A.seats.find(s => s.id === 'b').score > 0, 'the host sees the other\'s score');
  A.stop(); B.stop();
});

// ---------- the drum for everyone ----------
test('free play: a stroke and a piece go out as fx and come back in on another client', () => {
  const a = town(), b = town();
  a.m.hit('D', true);
  a.m.piece(0, true);
  assert.deepEqual(a.sent, [{ k: 'taiko', h: 'D' }, { k: 'taiko', s: 0 }]);
  for (const fx of a.sent) b.m.onFx(JSON.parse(JSON.stringify(fx)), 'ana', 'china');
  assert.equal(b.m.song, 0);
  // junk and other worlds are ignored
  assert.doesNotThrow(() => b.m.onFx({ k: 'taiko', h: 'zz' }, 'x', 'china'));
  b.m.onFx({ k: 'taiko', s: 3 }, 'x', 'home');
  assert.equal(b.m.song, 0);
  const it = a.m.stage;
  assert.ok(Number.isFinite(it.x) && it.x > 400, 'the stage sits in the japanese town');
});

// ---------- kingyo-sukui ----------
test('kingyo: the same fish for everyone, inside the tub, some gold ones', () => {
  const A = R.spawnList(99), B = R.spawnList(99), C = R.spawnList(100);
  assert.deepEqual(A, B);
  assert.notDeepEqual(A.map(f => f.kind), C.map(f => f.kind));
  let gold = 0;
  for (let s = 1; s < 30; s++) gold += R.spawnList(s).filter(f => f.kind === 'or').length;
  assert.ok(gold > 5, 'gold fish exist');
  const p = {};
  for (const f of A) for (let t = f.born; t < R.ROUND; t += .37) {
    R.fishAt(f, t, p);
    assert.ok(Math.abs(p.x) <= R.TUB.w / 2 && Math.abs(p.z) <= R.TUB.d / 2 && p.y < 0, `fish ${f.id} out of the tub at ${t}`);
  }
});

test('kingyo: the paper soaks slowly, tears when dragged fast; heavy fish break a weak poi', () => {
  let slow = 1, fast = 1;
  for (let k = 0; k < 20; k++) { slow = R.wear(slow, .05, .05, true); fast = R.wear(fast, .05, .7, true); }
  assert.ok(slow > .9, 'slow: ' + slow);
  assert.ok(fast <= 0, 'fast: ' + fast);
  assert.equal(R.wear(.5, 1, 5, false), .5, 'dry paper does not wear');
  const fish = R.spawnList(5), f = fish[0], at = R.fishAt(f, 3), taken = new Set();
  const got = R.scoop({ x: at.x, z: at.z, hp: 1, dip: .5 }, fish, 3, taken);
  assert.ok(got && !got.torn && got.hp < 1, 'caught');
  assert.equal(R.scoop({ x: at.x, z: at.z, hp: 1, dip: .05 }, fish, 3, taken), null, 'too quick: it didn\'t slide over');
  const weak = R.scoop({ x: at.x, z: at.z, hp: .05, dip: .5 }, fish, 3, taken);
  assert.ok(weak?.torn, 'the paper gives way');
  taken.add(got.fish.id);
  const again = R.scoop({ x: at.x, z: at.z, hp: 1, dip: .5 }, fish, 3, taken);
  assert.ok(!again || again.fish.id !== got.fish.id, 'a taken fish stays taken');
  assert.equal(R.points(['rouge', 'or', 'calico', 'noir']), 19);
  assert.deepEqual(R.ranking([{ score: 3, fish: 1 }, { score: 3, fish: 3 }, { score: 9, fish: 1 }]).map(s => s.fish + ':' + s.score), ['1:9', '3:3', '1:3']);
});

test('kingyo together: the host says who got a fish first; a scoop too late is stolen', () => {
  const a = town(), b = town();
  const A = createKingyo({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: a.m });
  const B = createKingyo({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: b.m });
  const humans = [{ id: 'a', name: 'ana', color: 1 }, { id: 'b', name: 'ben', color: 2 }];
  let hold = null;
  A.start({ seed: 3, humans: humans.map(h => ({ ...h, me: h.id === 'a' })), hostId: 'a', meId: 'a', send: (fx) => B.onFx('a', JSON.parse(JSON.stringify(fx))) });
  B.start({ seed: 3, humans: humans.map(h => ({ ...h, me: h.id === 'b' })), hostId: 'a', meId: 'b', send: (fx) => hold ? hold.push(fx) : A.onFx('b', JSON.parse(JSON.stringify(fx))) });
  assert.equal(A.seats.length, 2, 'no kids together');
  A._skip(); B._skip(); A._time(2); B._time(2);
  const val = (i) => R.KINDS[A.fish[i].kind].value;
  // ben scoops fish 3: the host grants it
  B._claim(3);
  assert.equal(A.taken.get(3), 'b');
  assert.equal(B.seats.find(s => s.id === 'b').score, val(3));
  assert.equal(A.seats.find(s => s.id === 'b').score, val(3));
  // ana lifts the same fish later: nothing for her
  A._claim(3);
  assert.equal(A.seats.find(s => s.id === 'a').score, 0);
  // ben's claim on fish 5 is slow to arrive; ana gets it first: stolen
  hold = [];
  B._claim(5);
  A._claim(5);
  assert.equal(B.taken.get(5), 'a');
  for (const fx of hold) A.onFx('b', fx);
  hold = null;
  assert.equal(B.seats.find(s => s.id === 'b').score, val(3));
  assert.equal(B.seats.find(s => s.id === 'a').score, val(5));
  assert.equal(A.seats.find(s => s.id === 'a').score, val(5));
  A.stop(); B.stop();
});

test('kingyo solo: two kids at the tub, a round ends with a place and the fish in the bag', () => {
  const { m } = town();
  const K = createKingyo({ camera: new THREE.PerspectiveCamera(), audio: quiet, ui: any, matsuri: m });
  let res = null; K.onEnd = (r) => { res = r; };
  K.start({ seed: 11 });
  assert.equal(K.seats.length, 3);
  K._skip();
  K._claim(0); K._claim(1);
  // the kids fish by themselves for the whole minute
  for (let k = 0; k < 1400 && !res; k++) K.update(.05, new Set());
  assert.ok(res, 'the round ended');
  assert.equal(res.fish, 2);
  assert.ok(res.value > 0 && res.place >= 1 && res.of === 3);
  assert.ok(K.seats.filter(s => s.bot).some(s => s.fish > 0), 'the kids caught something');
  // human-paced: a fish every few seconds at best, not a net
  for (const s of K.seats.filter(s => s.bot)) assert.ok(s.fish <= 15, `${s.name}: ${s.fish} fish in a round`);
  K.stop();
});
