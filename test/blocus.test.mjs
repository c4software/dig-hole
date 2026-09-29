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

test('blocus: how far it carries (gain, lowpass, delay, walls, the hole, other worlds)', async () => {
  const H = await import('../src/blocus-hear.js');
  for (const [kind, max] of [['bang', 120], ['crowd', 70], ['poc', 40]]) {
    assert.equal(H.RANGE[kind].max, max);
    assert.ok(H.gainAt(0, kind) > .99, kind);
    let last = 2, lastF = 1e9;
    for (let d = 0; d <= max + 30; d += .5) {
      const g = H.gainAt(d, kind), f = H.lowpassAt(d, kind);
      assert.ok(g >= 0 && g <= 1 && g <= last + 1e-12, `${kind} gain at ${d}`);
      assert.ok(f <= lastF && f >= 900, `${kind} lowpass at ${d}`);
      last = g; lastF = f;
    }
    assert.equal(H.gainAt(max, kind), 0); assert.equal(H.gainAt(max + 50, kind), 0); assert.equal(H.gainAt(1e6, kind), 0);
    assert.ok(H.lowpassAt(0, kind) >= 15000 && H.lowpassAt(max, kind) <= 1100);
  }
  // the bang: quiet already past 60 m; the crowd carries much less far than the bang
  assert.ok(H.gainAt(60, 'bang') < .12 && H.gainAt(60, 'bang') > 0);
  assert.equal(H.gainAt(80, 'crowd'), 0); assert.ok(H.gainAt(80, 'bang') > 0);
  assert.equal(H.gainAt(45, 'poc'), 0);
  // seen 150 m away, heard ~0.44 s later
  assert.ok(Math.abs(H.delayAt(150) - .437) < .01); assert.equal(H.delayAt(0), 0);
  // the ears: other worlds and the hole hear nothing, walls muffle
  assert.deepEqual(H.hearing({ home: false, y: 1.6, indoor: false }), { on: false, lp: 16000 });
  assert.equal(H.hearing({ home: true, y: -5, indoor: false }).on, false);
  assert.deepEqual(H.hearing({ home: true, y: 1.6, indoor: true }), { on: true, lp: 650 });
  assert.deepEqual(H.hearing({ home: true, y: 1.6, indoor: false }), { on: true, lp: 16000 });
});

test('blocus: its start and its end follow the shared clock (same phase for everyone)', () => {
  const DAY = 360, h = (d, hr) => d * DAY + hr / 24 * DAY;
  // a Monday: arrives at 7h30, on through the day, breaks up at 17h30
  let s = S.scheduleAt(-1, h(7, 7.5) + 10, DAY);
  assert.equal(s.on, true); assert.ok(Math.abs(s.since - 10) < 1e-9);
  assert.equal(S.phaseOf(s.on, s.since).k, 'arrive');
  s = S.scheduleAt(-1, h(7, 12), DAY); assert.equal(S.phaseOf(s.on, s.since).k, 'on');
  s = S.scheduleAt(-1, h(7, 17.5) + 30, DAY);
  assert.equal(s.on, false); assert.ok(Math.abs(s.since - 30) < 1e-9);
  assert.deepEqual(S.phaseOf(s.on, s.since), { k: 'leave', s: s.since });
  s = S.scheduleAt(-1, h(7, 17.5) + S.LEAVE + 1, DAY); assert.equal(S.phaseOf(s.on, s.since).k, 'off');
  // the morning after a weekend: it ended on Friday (day 4), long ago
  s = S.scheduleAt(-1, h(7, 3), DAY); assert.equal(s.on, false); assert.ok(s.since > DAY * 2);
  // twice as fast a clock: half as long in real seconds
  s = S.scheduleAt(-1, h(7, 17.5) + 30, DAY, { speed: 2 }); assert.ok(Math.abs(s.since - 15) < 1e-9);
  // forced by the host, or a forced hour: the clock can't say (the client times it from the change)
  assert.equal(S.scheduleAt(1, 0, DAY).since, Infinity); assert.equal(S.scheduleAt(0, 0, DAY).on, false);
  assert.equal(S.scheduleAt(-1, h(7, 3), DAY, { hour: 10 }).since, Infinity);
});

test('blocus: the end clears things in order, the gate opens last; the start builds them', () => {
  const at = (k, s) => S.propsAt({ k, s });
  assert.equal(at('on', 0).barricade, true); assert.equal(at('on', 0).gateOpen, false);
  assert.equal(at('leave', 1).kit, false, 'the bag and the crate go first');
  assert.ok(at('leave', 1).fire > .9 && at('leave', 20).fire < .5 && at('leave', 40).fire === 0);
  assert.equal(at('leave', 1).events, false);
  let clearedAt = null, openAt = null;
  for (let s = 0; s <= S.LEAVE; s += .5) {
    const p = at('leave', s);
    if (!p.barricade && clearedAt === null) clearedAt = s;
    if (p.gateOpen && openAt === null) openAt = s;
    if (p.gateOpen) assert.equal(p.barricade, false, 'the gate opens once it is cleared');
    assert.ok(p.sound >= 0 && p.sound <= 1);
  }
  assert.ok(clearedAt > 30 && openAt >= clearedAt && openAt < S.LEAVE);
  assert.equal(at('arrive', 0).barricade, false); assert.equal(at('arrive', S.ARRIVE - 1).barricade, true);
  assert.equal(at('arrive', 40).gateOpen, false);
});

test('blocus: they go home in groups, both ways, all gone by the end; they arrive in time', () => {
  const c = S.createCrowd({ seed: 4217 }), w = {};
  let east = 0, west = 0, runners = 0;
  for (let i = 0; i < S.NP; i++) {
    const a = S.crowdWalk(i, 0, c.hx[i], c.hz[i], true, {});
    assert.equal(a.gone, false); assert.ok(Math.abs(a.x - c.hx[i]) < 1e-9 && Math.abs(a.z - c.hz[i]) < 1e-9, 'they start from their spot');
    const b = S.crowdWalk(i, S.LEAVE - .01, c.hx[i], c.hz[i], true, w);
    assert.ok(b.gone, `${i} still there at the end`);
    if (b.x > 0) east++; else west++;
    if (b.run) runners++;
    for (let s = 0; s < S.LEAVE; s += 1) { const p = S.crowdWalk(i, s, c.hx[i], c.hz[i], true, w); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z)); }
    const r = S.crowdWalk(i, S.ARRIVE, c.hx[i], c.hz[i], false, w);
    assert.ok(!r.gone && Math.abs(r.x - c.hx[i]) < 1e-6 && Math.abs(r.z - c.hz[i]) < 1e-6, `${i} arrives in time`);
    assert.ok(S.crowdWalk(i, 0, c.hx[i], c.hz[i], false, w).gone, 'nobody there before it starts');
  }
  assert.ok(east > 5 && west > 5 && runners > 0);
  // the police: all in the van before it leaves; out of it and on the line by the time it's on
  for (let k = 0; k < S.NC; k++) {
    assert.ok(S.policeWalk(k, 39, true, w).gone, `officer ${k} boards in time`);
    const p = S.policeWalk(k, S.ARRIVE, false, w);
    assert.ok(!p.gone && Math.abs(p.x - S.LINE_X(k)) < 1e-6);
  }
  assert.equal(S.vanAt({ k: 'leave', s: 30 }), S.VAN[0]); assert.ok(S.vanAt({ k: 'leave', s: 50 }) > 60);
  assert.ok(S.vanAt({ k: 'arrive', s: 0 }) > 60); assert.equal(S.vanAt({ k: 'arrive', s: 10 }), S.VAN[0]);
  // the same for everyone: pure functions of the time
  assert.deepEqual(S.crowdWalk(3, 17.25, 1, 2, true, {}), S.crowdWalk(3, 17.25, 1, 2, true, {}));
});
