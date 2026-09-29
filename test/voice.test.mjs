// voice.test.mjs, the proximity voice mesh (fake peer connections through a fake room), the
// targeted fx of the room, the fall detection and the scream synth (fake WebAudio).
//   node --test test/voice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPeers, createMesh, VOICE } from '../src/voice-mesh.js';
import { createFallWatch, createScreamer, voiceOf, FALL } from '../src/scream.js';
import { createRoom } from '../src/room.js';

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

// ---------- a fake RTCPeerConnection: an offer and an answer pair up by their sdp ----------
const offers = new Map();
let uid = 0;
class FakePC {
  constructor() { this.id = ++uid; this.tracks = []; this.connectionState = 'new'; this.remote = null; this.ice = []; this.closed = false; }
  addTrack(t, s) { this.tracks.push([t, s]); }
  async createOffer() { return { type: 'offer', sdp: 'o' + this.id }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' + this.id }; }
  async setLocalDescription(d) {
    this.localDescription = d;
    if (d.type === 'offer') offers.set(d.sdp, this);
    setTimeout(() => this.onicecandidate?.({ candidate: { candidate: 'c' + this.id } }));
    if (d.type === 'answer') this.up();
  }
  async setRemoteDescription(d) { this.remote = d; if (d.type === 'answer') this.up(); else this.peer = offers.get(d.sdp); if (d.type === 'answer') {} }
  addIceCandidate(c) { this.ice.push(c); return Promise.resolve(); }
  up() {
    if (this.closed || this.connectionState === 'connected') return;
    this.connectionState = 'connected';
    setTimeout(() => { if (this.closed) return; this.ontrack?.({ streams: [{ from: this.id }], track: {} }); this.onconnectionstatechange?.(); });
  }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
const mic = { getAudioTracks: () => [{ kind: 'audio' }] };

// n players in a fake room: fx broadcast, or to one (`only`)
function world(n, o = VOICE) {
  const P = [];
  for (let i = 1; i <= n; i++) {
    const p = { id: i, pos: [i * 2, 0, 0], w: 'home', heard: new Set(), sent: [] };
    p.mesh = createMesh({
      send: (fx) => { p.sent.push(fx); for (const q of P) if (q !== p && (fx.only == null || fx.only === q.id)) q.mesh.onSignal(p.id, JSON.parse(JSON.stringify(fx))); },
      makePc: () => new FakePC(), stream: () => mic, opts: o,
      onTrack: (id) => p.heard.add(id), onGone: (id) => p.heard.delete(id),
    });
    P.push(p);
  }
  const tick = async () => {
    for (const p of P) p.mesh.tick({ id: p.id, pos: p.pos, w: p.w }, P.filter(q => q !== p).map(q => ({ id: q.id, pos: q.pos, w: q.w })));
    await flush();
  };
  return { P, tick };
}

test('pickPeers: range, hysteresis, the nearest few, same world, only the voiced', () => {
  const me = { pos: [0, 0, 0], w: 'home' };
  const L = [
    { id: 1, pos: [5, 0, 0], w: 'home', on: true },
    { id: 2, pos: [27, 0, 0], w: 'home', on: true },   // between range (25) and drop (30)
    { id: 3, pos: [3, 0, 0], w: 'china', on: true },
    { id: 4, pos: [2, 0, 0], w: 'home', on: false },
    { id: 5, pos: [40, 0, 0], w: 'home', on: true },
  ];
  assert.deepEqual([...pickPeers(me, L)], [1]);
  assert.deepEqual([...pickPeers(me, L, new Set([2]))].sort(), [1, 2], 'a linked one stays until 30 m');
  const many = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, pos: [i + 1, 0, 0], w: 'home', on: true }));
  assert.deepEqual([...pickPeers(me, many)], [1, 2, 3, 4, 5, 6], 'the six nearest');
});

test('mesh: two near players link, a far one does not, then comes and goes', async () => {
  const { P, tick } = world(3);
  const [a, b, c] = P;
  c.pos = [100, 0, 0];
  for (const p of P) p.mesh.start(p.id);
  await tick(); await tick();
  assert.ok(a.heard.has(2) && b.heard.has(1), 'a and b hear each other');
  assert.ok(!c.heard.size && !a.heard.has(3), 'c is too far');
  // only the smaller id offers
  assert.ok(a.sent.some(f => f.a === 'offer' && f.only === 2));
  assert.ok(!b.sent.some(f => f.a === 'offer' && f.only === 1));
  assert.ok(b.sent.some(f => f.a === 'answer' && f.only === 1));
  assert.ok(b.sent.some(f => f.a === 'ice'), 'candidates trickle through the room');
  // c walks over
  c.pos = [6, 0, 0];
  await tick(); await tick();
  assert.ok(c.heard.has(1) && c.heard.has(2) && a.heard.has(3) && b.heard.has(3), 'all three linked');
  // b walks away past the drop distance: both sides hang up
  b.pos = [60, 0, 0];
  await tick(); await tick();
  assert.ok(!a.heard.has(2) && !b.heard.has(1) && !b.heard.has(3), 'b is out');
  assert.ok(a.mesh.links.size === 1 && b.mesh.links.size === 0);
  // c leaves the voice chat: the others drop it
  c.mesh.stop();
  await tick();
  assert.equal(a.mesh.links.size, 0);
  assert.ok(!a.mesh.voiced.has(3));
  // c leaves the room
  a.mesh.peerLeft(3);
  assert.ok(!a.heard.has(3));
});

test('mesh: capped links, no one past the accept limit', async () => {
  const o = { ...VOICE, max: 2, accept: 3 };
  const { P, tick } = world(7, o);
  for (const p of P) { p.pos = [p.id, 0, 0]; p.mesh.start(p.id); }
  for (let i = 0; i < 4; i++) await tick();
  for (const p of P) assert.ok(p.mesh.links.size <= 3, `player ${p.id}: ${p.mesh.links.size} links`);
  assert.ok(P.every(p => p.heard.size >= 1), 'everyone hears someone');
  // no pc left open behind a dropped link
  for (const p of P) for (const L of p.mesh.links.values()) assert.ok(!L.pc.closed);
});

test('mesh: a player without the voice chat is never dialled; a newcomer hears who is in', async () => {
  const { P, tick } = world(2);
  P[0].mesh.start(1);
  await tick(); await tick();
  assert.equal(P[0].mesh.links.size, 0);
  P[1].mesh.start(2);
  await tick(); await tick();
  assert.ok(P[0].heard.has(2) && P[1].heard.has(1));
  P[1].sent.length = 0;
  P[1].mesh.hello();
  assert.deepEqual(P[1].sent, [{ k: 'vc', a: 'on' }]);
});

test('room: an fx with `only` goes to that digger alone', () => {
  const r = createRoom({ log() {} });
  const mk = () => { const got = []; const c = r.join({ send: (s) => got.push(JSON.parse(s)) }); return { c, got }; };
  const a = mk(), b = mk(), c = mk();
  for (const x of [a, b, c]) r.message(x.c, { t: 'hello', name: 'x' });
  const idB = b.c.me.id;
  const n = (x) => x.got.filter(m => m.t === 'fx').length;
  r.message(a.c, { t: 'fx', fx: { k: 'vc', a: 'offer', only: idB, s: 'sdp' } });
  assert.equal(n(b), 1); assert.equal(n(c), 0); assert.equal(n(a), 0);
  assert.equal(b.got.at(-1).id, a.c.me.id);
  r.message(a.c, { t: 'fx', fx: { k: 'vc', a: 'on' } });
  assert.equal(n(b), 2); assert.equal(n(c), 1);
  r.message(a.c, { t: 'fx', fx: { k: 'vc', a: 'x', only: a.c.me.id } });   // to oneself: nowhere
  assert.equal(n(a), 0);
});

// ---------- the fall ----------
function fall(w, { from = 0, to = -10, dt = 1 / 60, G = 20, extra = {}, drop } = {}) {
  let y = from, vy = 0; const out = [];
  w.step({ dt, y, vy, ground: true, active: true });
  while (y > to) {
    vy -= G * dt; y += vy * dt;
    const r = w.step({ dt, y, vy, ground: false, active: true, drop, ...extra });
    if (r) out.push(r);
  }
  const r = w.step({ dt, y: to, vy: 0, ground: true, active: true, ...extra });
  if (r) out.push(r);
  return out;
}

test('fall: a few metres screams and lands, a step or a small ledge does not', () => {
  assert.deepEqual(fall(createFallWatch(), { to: -1.5 }), []);
  assert.deepEqual(fall(createFallWatch(), { to: -2.8 }), []);
  assert.deepEqual(fall(createFallWatch(), { to: -8 }), ['start', 'land']);
});

test('fall: not on a jetpack, a ladder, in the lift or gliding; water ends it with a splash', () => {
  for (const k of ['jet', 'ladder', 'lift', 'glide']) assert.deepEqual(fall(createFallWatch(), { to: -8, extra: { [k]: true } }), [], k);
  const w = createFallWatch();
  let y = 0, vy = 0, r = null, got = [];
  w.step({ dt: .02, y, vy, ground: true, active: true });
  for (let i = 0; i < 60; i++) { vy -= 20 * .02; y += vy * .02; r = w.step({ dt: .02, y, vy, ground: false, active: true }); if (r) got.push(r); }
  got.push(w.step({ dt: .02, y, vy, ground: false, water: true, active: true }));
  assert.deepEqual(got, ['start', 'water']);
  // the jetpack mid-fall stops the scream
  const j = createFallWatch();
  y = 0; vy = 0; got = [];
  for (let i = 0; i < 40; i++) { vy -= 20 * .02; y += vy * .02; r = j.step({ dt: .02, y, vy, ground: false, active: true }); if (r) got.push(r); }
  got.push(j.step({ dt: .02, y, vy, ground: false, jet: true, active: true }));
  assert.deepEqual(got, ['start', 'cut']);
});

test('fall: over a deep shaft it starts sooner; a cooldown; a teleport is no fall', () => {
  // 2 m of fall: nothing on flat ground, a scream above 20 m of air
  assert.deepEqual(fall(createFallWatch(), { to: -2, drop: () => 3 }), []);
  assert.deepEqual(fall(createFallWatch(), { to: -2, drop: () => 20 }), ['start', 'land']);
  const w = createFallWatch();
  assert.deepEqual(fall(w, { to: -8 }), ['start', 'land']);
  assert.deepEqual(fall(w, { from: -8, to: -9 - FALL.start * 2, dt: 1 / 600 }).length <= 2, true);
  const c = createFallWatch();
  fall(c, { to: -8 });
  assert.deepEqual(fall(c, { from: -8, to: -16, dt: .001 }), [], 'too soon after the last one');
  // a jump of 30 m in one frame (r: back to the surface) cuts it
  const t = createFallWatch();
  let y = 0, vy = 0; const got = [];
  t.step({ dt: .02, y, vy, ground: true, active: true });
  for (let i = 0; i < 40; i++) { vy -= 20 * .02; y += vy * .02; const r = t.step({ dt: .02, y, vy, ground: false, active: true }); if (r) got.push(r); }
  got.push(t.step({ dt: .02, y: 30, vy: 0, ground: true, active: true }));
  assert.deepEqual(got, ['start', 'cut']);
});

// ---------- the scream, in a fake WebAudio ----------
test('scream: a voice per seed, nodes made, followed, ended with a thud or a splash', async () => {
  let nodes = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exp ramp to ' + v); }, setTargetAtTime(v) { if (!Number.isFinite(v)) throw new RangeError('not finite'); }, cancelScheduledValues() {} });
  const node = () => { nodes++; return { gain: param(), frequency: param(), detune: param(), Q: param(), positionX: param(), positionY: param(), positionZ: param(), connect() {}, disconnect() {}, start() {}, stop() {}, type: '', buffer: null }; };
  const ctx = { currentTime: 1, createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createPanner: node };
  const audio = { ctx, out: node(), noiseBuf: {} };
  const S = createScreamer(audio);
  assert.notDeepEqual(voiceOf(1), voiceOf(2));
  assert.deepEqual(voiceOf(7), voiceOf(7));
  const n0 = nodes;
  const mine = S.start({ seed: 3, local: true });
  assert.ok(nodes - n0 >= 8, 'a formant voice');
  assert.equal(mine.pan, null, 'mine is in the head');
  let y = 0;
  const other = S.start({ seed: 4, pos: () => ({ x: 0, y, z: 0 }) });
  assert.ok(other.pan);
  for (let i = 0; i < 30; i++) { y -= .3; ctx.currentTime += 1 / 60; S.update(1 / 60, { x: 0, y: 1.6, z: 5 }); }
  assert.ok(other.vr > 0, 'going away: a lower pitch');
  const n1 = nodes;
  other.end('land');
  assert.ok(nodes > n1, 'a thud');
  mine.end('water');
  assert.equal(S.live.size, 0);
  const late = S.start({ seed: 5, pos: () => null });
  ctx.currentTime += 7; S.update(.1, { x: 0, y: 0, z: 0 });
  assert.ok(late.done, 'out of breath');
  // no context yet: silent, no throw
  assert.equal(createScreamer({ ctx: null }).start({}), null);
});

// ---------- the organ, heard across the map ----------
test('organ: loud in the nave, ~ -30 dB at 150 m, never silent; muffled outside, deep, a bit in the crypt; off elsewhere', async () => {
  const { organGain, organHearing } = await import('../src/organ-hear.js');
  assert.equal(organGain(5), 1);
  const db = 20 * Math.log10(organGain(150));
  assert.ok(db < -27 && db > -32, `${db.toFixed(1)} dB at 150 m`);
  assert.ok(organGain(2000) > 0);
  const h = (x, y, z, w = {}) => ({ ...organHearing({ x, y, z }, { here: 'home', ...w }) });
  const nave = h(61, 1.6, 30), square = h(61, 1.6, 2), hole = h(0, -20, 0), crypt = h(61, -6, 27, { crypt: true });
  assert.ok(nave.inside && nave.lp >= 20000);
  assert.ok(!square.inside && square.lp < 3000);
  assert.ok(hole.lp < square.lp, 'duller down the hole');
  assert.ok(crypt.lp > square.lp && crypt.lp < nave.lp, 'the crypt: slightly muffled');
  assert.equal(organHearing({ x: 61, y: 1, z: 30 }, { here: 'moon' }).on, false);
});
