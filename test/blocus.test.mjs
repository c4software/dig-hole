// blocus.test.mjs, the lycée's blockade without a browser: the crowd is the same for everyone
// (same seed and time, same bodies, whether you came early or late), stays in its street, never
// goes NaN, settles back on its spots between two episodes; the script has its mortars, foam
// balls and smoke; the schedule and the admin setting.
//   node --test test/blocus.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/blocus-sim.js';
import { createTunables } from '../src/tunables.js';

const T0 = 1_790_000_000;          // a shared clock, seconds

test('blocus: same seed and time, same crowd (early or late joiner)', () => {
  const a = S.createCrowd({ seed: 7 }), b = S.createCrowd({ seed: 7 });
  // a watches for a while frame by frame; b joins late, straight to the same moment
  for (let t = T0; t < T0 + 50; t += 1 / 60) a.advanceTo(t, []);
  const t = T0 + 50;
  a.advanceTo(t, []); b.advanceTo(t, []);
  assert.equal(a.ep, b.ep); assert.equal(a.n, b.n);
  for (let i = 0; i < a.N; i++) {
    assert.equal(a.px[i], b.px[i], `x of ${i}`);
    assert.equal(a.pz[i], b.pz[i], `z of ${i}`);
  }
});

test('blocus: another seed, another crowd; episodes differ', () => {
  const a = S.createCrowd({ seed: 7 }), b = S.createCrowd({ seed: 8 });
  a.advanceTo(T0 + 20); b.advanceTo(T0 + 20);
  let diff = 0;
  for (let i = 0; i < a.N; i++) diff += Math.abs(a.px[i] - b.px[i]);
  assert.ok(diff > 1);
  assert.notDeepEqual(S.makePlan(7, 3).ev.map(e => e.k + e.t.toFixed(2)), S.makePlan(7, 4).ev.map(e => e.k + e.t.toFixed(2)));
});

test('blocus: bounded, no NaN, over many episodes; nobody walks through the barricade', () => {
  const c = S.createCrowd({ seed: 3 }), out = [];
  const B = S.BARRICADE;
  let moved = 0;
  for (let t = T0; t < T0 + S.E * 12; t += 1 / 30) {
    out.length = 0;
    c.advanceTo(t, out);
    for (let i = 0; i < c.N; i++) {
      assert.ok(Number.isFinite(c.px[i]) && Number.isFinite(c.pz[i]) && Number.isFinite(c.vx[i]) && Number.isFinite(c.vz[i]), `NaN at ${t} for ${i}`);
      if (i >= S.NP) continue;
      assert.ok(c.px[i] >= S.ZONE.x0 - 1e-9 && c.px[i] <= S.ZONE.x1 + 1e-9, `x out ${c.px[i]}`);
      assert.ok(c.pz[i] >= S.ZONE.z0 - 1e-9 && c.pz[i] <= S.ZONE.z1 + 1e-9, `z out ${c.pz[i]}`);
      assert.ok(!(c.px[i] > B.x0 && c.px[i] < B.x1 && c.pz[i] > B.z0), `in the barricade: ${c.px[i]}, ${c.pz[i]}`);
      moved = Math.max(moved, Math.hypot(c.px[i] - c.hx[i], c.pz[i] - c.hz[i]));
    }
    for (const e of out) for (const v of Object.values(e)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `event ${e.k}`);
  }
  assert.ok(moved > 3, `the crowd moves (${moved.toFixed(1)} m at most)`);
});

test('blocus: at the end of an episode everyone is back on their spot (no jump into the next)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const c = S.createCrowd({ seed });
    const k = 1000;
    c.advanceTo(k * S.E + S.E - .01);
    let worst = 0;
    for (let i = 0; i < S.NP; i++) worst = Math.max(worst, Math.hypot(c.px[i] - c.hx[i], c.pz[i] - c.hz[i]));
    assert.ok(worst < .6, `seed ${seed}: ${worst.toFixed(2)} m from home`);
  }
});

test('blocus: the script has fireworks, foam balls, and the crowd scatters from them', () => {
  let mortars = 0, shots = 0, smokes = 0, falls = 0, charges = 0;
  for (let k = 0; k < 40; k++) {
    const p = S.makePlan(11, k);
    mortars += p.ev.filter(e => e.k === 'mortar').length;
    shots += p.ev.filter(e => e.k === 'shot').length;
    smokes += p.ev.filter(e => e.k === 'smoke').length;
    charges += p.charges.length;
    for (const e of p.ev) assert.ok(e.t > 3 && e.t < S.E - S.SETTLE + 1, `${e.k} at ${e.t}`);
    assert.ok(p.ev.some(e => e.k === 'mortar') && p.ev.some(e => e.k === 'burst'));
    for (let i = 1; i < p.ev.length; i++) assert.ok(p.ev[i].t >= p.ev[i - 1].t);
  }
  assert.ok(mortars >= 40 && shots >= 80 && smokes > 5 && charges > 5, `${mortars} ${shots} ${smokes} ${charges}`);
  // a whole episode seen live: the events come out, some get knocked on their bum
  const c = S.createCrowd({ seed: 11 }), seen = new Set();
  for (let t = 0; t < S.E * 3; t += 1 / 60) {
    const out = [];
    c.advanceTo(T0 - (T0 % S.E) + t, out);
    for (const e of out) seen.add(e.k);
    for (let i = 0; i < S.NP; i++) if (c.down[i] > 0) falls++;
  }
  for (const k of ['mortar', 'burst', 'shot', 'impact']) assert.ok(seen.has(k), k);
  assert.ok(falls > 0);
});

test('blocus: a late joiner does not replay the past (only the last second shows)', () => {
  const c = S.createCrowd({ seed: 7 }), out = [];
  c.advanceTo(T0 - (T0 % S.E) + 30, out);
  for (const e of out) assert.ok(e.t > 30 - 1.01, `${e.k} at ${e.t}`);
});

test('blocus: the schedule and the admin setting', () => {
  assert.equal(S.blocusOn(1, 3, 6), true);
  assert.equal(S.blocusOn(0, 10, 1), false);
  assert.equal(S.blocusOn(-1, 10, 1), true);          // a school day, mid-morning
  assert.equal(S.blocusOn(-1, 10, 5), false);         // the weekend
  assert.equal(S.blocusOn(-1, 10, 6), false);
  assert.equal(S.blocusOn(-1, 10, 7), true);
  assert.equal(S.blocusOn(-1, 6, 1), false);          // too early
  assert.equal(S.blocusOn(-1, 20, 1), false);         // night
  const tun = createTunables();
  assert.equal(tun.get('blocus'), -1);
  tun.set('blocus', 1); assert.equal(tun.get('blocus'), 1);
  tun.set('blocus', 5); assert.equal(tun.get('blocus'), -1);   // not an option: back to auto
  const d = tun.DEFS.find(x => x.k === 'blocus');
  assert.ok(d && d.g && d.label.includes('blocus'));
});
