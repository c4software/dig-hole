// events.test.mjs, the feasts of the calendar without a browser: Easter over the centuries,
// which feasts are on at a date, the overrides, and whose date counts (the server's).
//   node test/events.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { easter, activeEvents, parseOverride, tunToOverride, overrideToTun, EVENTS, EVENT_IDS, createServerClock, dateNow, dayNum } = await import('../src/events-calendar.js');
const { createRoom } = await import('../src/room.js');
const { createTunables, DEFS } = await import('../src/tunables.js');

// an independent computus (Knuth, TAOCP 1.3.2 ex. 14) to check the other one against
function knuth(y) {
  const G = y % 19 + 1, C = Math.floor(y / 100) + 1, X = Math.floor(3 * C / 4) - 12, Z = Math.floor((8 * C + 5) / 25) - 5;
  const D = Math.floor(5 * y / 4) - X - 10;
  let E = (11 * G + 20 + Z - X) % 30; if (E < 0) E += 30;
  if ((E === 25 && G > 11) || E === 24) E++;
  let N = 44 - E; if (N < 21) N += 30;
  N = N + 7 - ((D + N) % 7);
  return N > 31 ? [4, N - 31] : [3, N];
}
const ids = (d, o) => activeEvents(d, o).map(e => e.id).sort();
const D = (y, m, d) => ({ y, m, d });

test('easter: known dates, and the same as knuth\'s every year from 1583 to 4099', () => {
  const known = { 1818: [3, 22], 1943: [4, 25], 2000: [4, 23], 2008: [3, 23], 2011: [4, 24], 2019: [4, 21], 2024: [3, 31], 2025: [4, 20], 2026: [4, 5], 2027: [3, 28], 2038: [4, 25], 2285: [3, 22] };
  for (const [y, md] of Object.entries(known)) assert.deepEqual(easter(+y), md, `easter ${y}`);
  for (let y = 1583; y <= 4099; y++) {
    const [m, d] = easter(y);
    assert.deepEqual([m, d], knuth(y), `year ${y}`);
    assert.equal(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), 0, `a sunday in ${y}`);
    const n = dayNum(y, m, d);
    assert.ok(n >= dayNum(y, 3, 22) && n <= dayNum(y, 4, 25), `between 22 march and 25 april in ${y}`);
  }
});

test('calendar: which feasts are on at a date', () => {
  assert.deepEqual(ids(D(2026, 12, 24)), ['noel']);
  assert.deepEqual(ids(D(2026, 12, 1)), ['noel']);
  assert.deepEqual(ids(D(2026, 12, 31)), ['noel', 'nouvelan']);
  const ny = activeEvents(D(2027, 1, 1));
  assert.deepEqual(ny.map(e => e.key), ['nouvelan-2026']);          // the one that started in 2026
  assert.deepEqual(ids(D(2027, 1, 2)), ['nouvelan']);
  assert.deepEqual(ids(D(2027, 1, 3)), ['epiphanie']);
  assert.deepEqual(ids(D(2027, 1, 16)), []);
  assert.deepEqual(ids(D(2026, 2, 2)), ['chandeleur']);
  assert.deepEqual(ids(D(2026, 2, 17)), ['mardigras']);            // easter 5 april 2026 - 47
  assert.deepEqual(ids(D(2026, 2, 16)), ['mardigras']);
  assert.deepEqual(ids(D(2026, 2, 18)), []);
  assert.deepEqual(ids(D(2026, 2, 14)), ['valentin']);
  // 2026: easter on the 5th of april, the eggs from palm sunday (29 march) to easter monday (6 april)
  assert.deepEqual(ids(D(2026, 3, 28)), ['hanami']);
  assert.deepEqual(ids(D(2026, 3, 29)), ['hanami', 'paques']);
  assert.deepEqual(ids(D(2026, 4, 1)), ['hanami', 'paques', 'poisson']);
  assert.deepEqual(ids(D(2026, 4, 6)), ['hanami', 'paques']);
  assert.deepEqual(ids(D(2026, 4, 7)), ['hanami']);
  assert.deepEqual(ids(D(2026, 4, 13)), []);
  // 2027: easter on the 28th of march
  assert.deepEqual(ids(D(2027, 3, 20)), []);
  assert.deepEqual(ids(D(2027, 3, 21)), ['paques']);
  assert.deepEqual(ids(D(2027, 3, 29)), ['hanami', 'paques']);
  assert.deepEqual(ids(D(2027, 6, 21)), ['musique']);
  assert.deepEqual(ids(D(2027, 7, 3)), ['tanabata']);
  assert.deepEqual(ids(D(2027, 7, 14)), ['juillet']);
  assert.deepEqual(ids(D(2027, 7, 15)), []);
  assert.deepEqual(ids(D(2027, 8, 15)), ['obon']);
  assert.deepEqual(ids(D(2026, 10, 19)), []);
  assert.deepEqual(ids(D(2026, 10, 20)), ['halloween']);
  assert.deepEqual(ids(D(2026, 10, 31)), ['halloween']);
  assert.deepEqual(ids(D(2026, 11, 2)), ['halloween']);
  assert.deepEqual(ids(D(2026, 11, 3)), []);
  assert.deepEqual(ids(D(2026, 9, 28)), []);
  // leap years, and a february 29th
  assert.deepEqual(ids(D(2028, 2, 29)), ['mardigras']);   // easter 16 april 2028: mardi gras on the 29th
  // every feast is on at least one day of the years 2020-2060, and never for more than five weeks
  for (const e of EVENTS) for (let y = 2020; y <= 2060; y++) { const [a, b] = e.span(y); assert.ok(b >= a && b - a < 36, `${e.id} ${y}`); }
});

test('calendar: overrides (the host or the admin, ?event=)', () => {
  assert.deepEqual(ids(D(2026, 12, 24), 'none'), []);
  assert.deepEqual(ids(D(2026, 7, 20), 'noel'), ['noel']);
  const f = activeEvents(D(2026, 7, 20), 'halloween')[0];
  assert.equal(f.forced, true); assert.equal(f.key, 'halloween-2026');
  // forced while it's on anyway: the same key as by the date (the hunt carries on)
  assert.equal(activeEvents(D(2027, 1, 1), 'nouvelan')[0].key, 'nouvelan-2026');
  assert.deepEqual(ids(D(2026, 12, 31), 'noel'), ['noel']);        // one only, even when two are on
  assert.deepEqual(ids(D(2026, 12, 24), 'auto'), ['noel']);
  assert.deepEqual(ids(D(2026, 12, 24), 'nope'), []);
  for (const [s, id] of [['noel', 'noel'], ['Noël', 'noel'], ['halloween', 'halloween'], ['paques', 'paques'], ['Pâques', 'paques'], ['14juillet', 'juillet'], ['14-juillet', 'juillet'], ['none', 'none'], ['aucune', 'none'], ['auto', 'auto'], ['hanami', 'hanami'], ['what', null]]) assert.equal(parseOverride(s), id, s);
  assert.equal(parseOverride(null), null);
  // the tunable is a number: -1 auto, 0 none, n the n-th feast
  assert.equal(tunToOverride(-1), 'auto'); assert.equal(tunToOverride(0), 'none'); assert.equal(tunToOverride(1), 'noel');
  for (const id of [...EVENT_IDS, 'none', 'auto']) assert.equal(tunToOverride(overrideToTun(id)), id);
  const d = DEFS.find(x => x.k === 'event');
  assert.ok(d && d.def === -1 && d.options.length === EVENT_IDS.length + 2);
  const tun = createTunables();
  assert.equal(tun.get('event'), -1);
  tun.set('event', overrideToTun('halloween')); assert.equal(tunToOverride(tun.get('event')), 'halloween');
  tun.set('event', 99); assert.equal(tun.get('event'), -1);          // not an option: back to auto
  tun.load({ event: 0 }); assert.equal(tunToOverride(tun.get('event')), 'none');
});

const JULY = Date.UTC(2026, 6, 10, 15, 0);
const XMAS = Date.UTC(2026, 11, 24, 12, 0);

test('server clock: the server\'s date counts, not ours (and its time zone)', () => {
  const c = createServerClock(() => JULY);
  assert.deepEqual(ids(c.parts()), []);                               // alone: our own date (july)
  c.set({ at: XMAS, tz: 60 });
  assert.deepEqual(ids(c.parts()), ['noel']);
  // at 23:30 UTC on the 31st, it's already new year's day in Paris, not yet in New York
  const late = Date.UTC(2026, 11, 31, 23, 30);
  c.set({ at: late, tz: 60 }); assert.deepEqual(c.parts().d, 1); assert.deepEqual(ids(c.parts()), ['nouvelan']);
  c.set({ at: late, tz: -300 }); assert.deepEqual(c.parts().d, 31); assert.deepEqual(ids(c.parts()), ['noel', 'nouvelan']);
  // the clock goes on: an hour later here is an hour later there
  let now = JULY; const c2 = createServerClock(() => now);
  c2.set({ at: Date.UTC(2026, 11, 31, 22, 30), tz: 0 }); now += 2 * 3600e3;
  assert.deepEqual([c2.parts().m, c2.parts().d], [1, 1]);
  // junk is ignored
  c2.set(null); c2.set({ at: 'x' }); assert.deepEqual([c2.parts().m, c2.parts().d], [1, 1]);
  const d = dateNow(XMAS); assert.equal(d.at, XMAS); assert.equal(typeof d.tz, 'number');
});

const fakeLink = () => { const l = { got: [], send(s) { l.got.push(JSON.parse(s)); } }; return l; };

test('room (node server): the welcome carries the server\'s date; a new day is told to all', () => {
  let now = XMAS;
  const r = createRoom({ name: 'jardin', now: () => now });
  const a = fakeLink(), ca = r.join(a);
  r.message(ca, { t: 'hello', name: 'anne' });
  const w = a.got.find(m => m.t === 'welcome');
  assert.equal(w.date.at, XMAS); assert.equal(typeof w.date.tz, 'number');
  // a client whose clock says july sees christmas
  let local = JULY;
  const c = createServerClock(() => local);
  c.set(w.date, JULY);
  assert.deepEqual(ids(c.parts()), ['noel']);
  // two days later where the server runs: told on the next message
  r.message(ca, { t: 'state', p: [0, 0, 0], yaw: 0, w: 'home' });
  now += 2 * 864e5;
  r.message(ca, { t: 'state', p: [0, 0, 0], yaw: 0, w: 'home' });
  const dm = a.got.filter(m => m.t === 'date');
  assert.equal(dm.length, 1); assert.equal(dm[0].date.at, now);
  local = JULY + 2 * 864e5;
  c.set(dm[0].date);
  assert.equal(c.parts().d, 26);
  // same day: not told again
  now += 3600e3; r.message(ca, { t: 'state', p: [0, 0, 0], yaw: 0, w: 'home' });
  assert.equal(a.got.filter(m => m.t === 'date').length, 1);
});

test('net.js: a client in july joining a server on christmas eve gets noël', async () => {
  const realNow = Date.now;
  globalThis.addEventListener ??= () => {};
  globalThis.location ??= { protocol: 'http:', host: 'lab', search: '' };
  const { createNet } = await import('../src/net.js');
  const { serverClock } = await import('../src/events-calendar.js');
  const r = createRoom({ name: 'jardin', now: () => XMAS });
  // a websocket look-alike straight into the room
  const sock = () => {
    const s = { readyState: 0 };
    const c = r.join({ send: (str) => queueMicrotask(() => s.onmessage?.({ data: str })) });
    s.send = (str) => queueMicrotask(() => r.message(c, JSON.parse(str)));
    s.close = () => {};
    queueMicrotask(() => { s.readyState = 1; s.onopen?.(); });
    return s;
  };
  Date.now = () => JULY;
  try {
    serverClock.clear();
    assert.deepEqual(ids(serverClock.parts()), []);
    const net = createNet({ scene: { add() {}, remove() {} } });
    net.connect('jardin', 'bob', sock);
    await new Promise(res => setTimeout(res, 20));
    assert.equal(serverClock.remote, true);
    assert.deepEqual(ids(serverClock.parts()), ['noel']);
    // the admin's word still wins
    assert.deepEqual(ids(serverClock.parts(), tunToOverride(overrideToTun('none'))), []);
  } finally { Date.now = realNow; serverClock.clear(); }
});

// ---------- the decor, built and torn down, without a browser (canvases are stand-ins) ----------
function domStubs() {
  const el = () => ({ style: { setProperty() {} }, classList: { _s: new Set(['hidden']), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle() {}, contains(c) { return this._s.has(c); } }, appendChild() {}, set className(v) { this.classList._s = new Set(String(v).split(' ').filter(Boolean)); }, offsetHeight: 80 });
  const ctx2d = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: (t) => t === 'canvas' ? { width: 0, height: 0, style: {}, getContext: () => ctx2d } : el(), getElementById: () => null, head: el(), body: el(), addEventListener() {} };
  globalThis.location = { protocol: 'http:', host: 'lab', search: '' };
}

test('events.js: every feast builds its decor, its uses answer, and it leaves nothing behind', async () => {
  domStubs();
  const THREE = await import('three');
  const { tun } = await import('../src/tunables.js');
  const { createEvents } = await import('../src/events.js');
  const { serverClock, kindOf } = await import('../src/events-calendar.js');
  const CHINA = new THREE.Vector3(400, 0, 0);
  const homeDecor = new THREE.Group(), chinaG = new THREE.Group(); chinaG.position.copy(CHINA);
  const house = new THREE.Group(); house.position.set(42, 0, -22); homeDecor.add(house);
  const colliders = [{ min: new THREE.Vector3(-5.5, 0, -22), max: new THREE.Vector3(5.5, 6, -15) }];
  const interactables = [{ id: 'ndoor', pos: new THREE.Vector3(42, 1.2, -18.6), house: { name: 'mme michu', g: house } }];
  const world = { homeDecor, china: { group: chinaG }, colliders, interactables, label: () => new THREE.Texture(), env: { day: .2, night: .8 },
    walkers: { home: { people: [] } }, scene: { fog: new THREE.Fog(0xffffff, 45, 300), background: new THREE.Color() }, space: false };
  const terrains = { home: { cellOf: () => [0, 0, 0], solidCell: () => false } };   // all dug: the buried eggs show
  const eco = { s: { ach: {}, money: 5000, health: 50, battery: 1 }, earn(v) { this.s.money += v; }, pay(v) { if (this.s.money < v) return false; this.s.money -= v; return true; }, give() {}, nameOf: (id) => id };
  const ui = { toast() {}, plus() {}, fmt: String, setCoins() {}, layer() {}, panel() {} };
  const audio = new Proxy({}, { get: () => () => {} });
  const ACH = [], got = [];
  let here = 'home';
  const pos = new THREE.Vector3(0, 0, 0);
  const ev = createEvents({ world, terrains, eco, ui, audio, tun, moles: { list: [] }, organ: { playing: false, play() {} }, songs: [1], CHINA, ACH_LIST: ACH, hooks: {
    multi: false, unlock: (k) => got.push(k), save() {}, sendOp() {}, myName: () => 'moi', here: () => here, view: () => here, state: () => 'play',
    pos: () => pos, eye: () => pos, hour: () => 23.9, buildDelay: 0, heal() {}, battery() {}, speed() {}, grav() {}, openPanel() {}, hintOnce() {}, redrawBoard() {}, cardOk: () => true,
  } });
  const base = { c: colliders.length, i: interactables.length, h: homeDecor.children.length, j: chinaG.children.length };
  for (const id of EVENT_IDS) {
    tun.set('event', overrideToTun(id)); ev.refresh(); ev.update(.016);
    assert.deepEqual(ev.active, [id], id);
    assert.deepEqual(ev.built, [kindOf(id)], id);
    const want = { noel: 12, valentin: 14, paques: 19, hanami: 10, juillet: 10, halloween: 13 }[id] || 0;
    assert.equal(ev.spotsOf(id).length, want, id + ' hunt spots');
    for (let k = 0; k < 30; k++) ev.update(.1);          // its updates run (fireworks at 23:54, bats at night…)
    for (const it of interactables.filter(i => i.id === 'ev' && !i.off)) {
      assert.equal(typeof ev.prompt(it), 'string', id + ' ' + it.kind);
      ev.act(it);
      if (it.kind === 'stall') { const p = ev.panel(); assert.ok(p.rows.length, id + ' stall rows'); for (const r of p.rows) ev.click(r.id); }
    }
    tun.set('event', 0); ev.refresh(); ev.update(.016);
    assert.deepEqual(ev.built, [], id + ' torn down');
    assert.equal(colliders.length, base.c, id + ' colliders back');
    assert.equal(interactables.length, base.i, id + ' interactables back');
    assert.equal(homeDecor.children.length, base.h, id + ' home decor gone'); assert.equal(chinaG.children.length, base.j, id + ' japan decor gone');
  }
  // a hunt, walked through: pâques, every egg (seven under the plot), the golden one last
  tun.set('event', overrideToTun('paques')); ev.refresh(); ev.update(.3);
  const key = ev.list[0].key, spots = ev.spotsOf('paques');
  assert.equal(spots.length, 19); assert.equal(spots.filter(s => s.buried).length, 7);
  assert.ok(spots.every(s => s.buried || Math.abs(s.p.x) > 8.4 || Math.abs(s.p.z) > 8.4), 'none on the dig plot');
  assert.ok(spots.every(s => s.buried || !colliders.some(c => s.p.x > c.min.x && s.p.x < c.max.x && s.p.z > c.min.z && s.p.z < c.max.z)), 'none in a wall');
  for (const s of spots) { pos.copy(s.p); ev.update(.3); }
  assert.equal(ev.taken.get(key).size, 19);
  assert.equal(eco.s.ev[key].done, true, 'every egg found');
  assert.ok(got.includes('ev_paques') && got.includes('ev_gold'));
  assert.ok(ACH.some(a => a[0] === 'ev_paques'));
  // someone else's find, through the room: gone here too
  tun.set('event', overrideToTun('halloween')); ev.refresh(); ev.update(.3);
  const hk = ev.list[0].key;
  ev.onOp({ k: 'ev', key: hk, i: 3, by: 'anne' }, false);
  assert.equal(ev.spotsOf('halloween').find(s => s.id === 3).obj.visible, false);
  assert.ok(ev.taken.get(hk).has(3));
  tun.reset(); serverClock.clear();
});
