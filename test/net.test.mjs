// net.test.mjs, the room, the signaling, the codes and the p2p host, without a browser:
// WebRTC is faked (two peer connections pair up through their sdp), IndexedDB is a Map.
//   node test/net.test.mjs            (server tests need the `ws` package)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// ---------- browser stand-ins ----------
globalThis.addEventListener ??= () => {};
globalThis.document ??= { addEventListener() {}, hidden: false };
globalThis.location ??= { origin: 'http://lab', pathname: '/', protocol: 'http:', host: 'lab', search: '' };
{
  const stores = new Map();
  const req = (fn) => { const r = {}; setTimeout(() => { try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } }); return r; };
  globalThis.indexedDB = {
    open() {
      const r = {};
      setTimeout(() => {
        const db = {
          createObjectStore(n) { stores.set(n, new Map()); },
          transaction(n) {
            const t = { objectStore: () => ({
              get: (k) => req(() => structuredClone(stores.get(n).get(k))),
              put: (v, k) => { stores.get(n).set(k, structuredClone(v)); setTimeout(() => t.oncomplete?.()); },
              getAllKeys: () => req(() => [...stores.get(n).keys()]),
            }) };
            return t;
          },
        };
        r.result = db;
        if (!stores.size) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
}
class FakeChannel extends EventTarget {
  constructor(label) { super(); this.label = label; this.readyState = 'connecting'; this.bufferedAmount = 0; this.bufferedAmountLowThreshold = 0; this.peer = null; this.sent = 0; }
  send(d) {
    if (this.readyState !== 'open') throw new Error('not open');
    this.sent++;
    const p = this.peer;
    // the unordered channel may swap two messages: it does, now and then
    const late = this.label === 'fast' && this.sent % 7 === 0 ? 5 : 0;
    setTimeout(() => { if (p.readyState === 'open') p.dispatchEvent(new MessageEvent('message', { data: d })); }, late);
  }
  close() { for (const c of [this, this.peer]) if (c && c.readyState !== 'closed') { c.readyState = 'closed'; setTimeout(() => c.dispatchEvent(new Event('close'))); } }
  _open() { this.readyState = 'open'; this.dispatchEvent(new Event('open')); }
}
const PCS = new Map();
let failNext = false;
class FakePC extends EventTarget {
  constructor() { super(); this.chans = []; this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.n = Math.random().toString(36).slice(2); }
  createDataChannel(label) { const c = new FakeChannel(label); this.chans.push(c); return c; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\na=fake:offer-' + this.n + '\r\n' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\na=fake:answer-' + this.n + '\r\n' }; }
  async setLocalDescription(d) {
    this.localDescription = d; PCS.set(d.sdp.trim(), this);
    // a slow stun answer: one more candidate once the code is made
    setTimeout(() => { const e = new Event('icecandidate'); e.candidate = { candidate: 'candidate:late ' + this.n + ' typ srflx', toJSON() { return { candidate: this.candidate, sdpMid: '0' }; } }; this.dispatchEvent(e); }, 3);
  }
  async addIceCandidate(c) { (this.added ||= []).push(c.candidate); }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    if (d.type !== 'answer') return;
    const guest = PCS.get(d.sdp.trim());
    const state = (st) => { for (const pc of [this, guest]) { pc.connectionState = st; pc.dispatchEvent(new Event('connectionstatechange')); } };
    setTimeout(() => state('connecting'));
    if (failNext) { failNext = false; setTimeout(() => state('failed'), 5); return; }
    setTimeout(() => {
      state('connected');
      for (const hc of this.chans) {
        const gc = new FakeChannel(hc.label); gc.peer = hc; hc.peer = gc;
        guest.ondatachannel?.({ channel: gc });
        hc._open(); gc._open();
      }
    }, 5);
  }
  close() { for (const c of this.chans) c.close(); }
}
globalThis.RTCPeerConnection = FakePC;

const { createRoom, notePost } = await import('../src/room.js');
const roomAdminMod = await import('../src/roomadmin.js');
const { createSignal } = await import('../src/signal.js');
const { encode, decode, createPipe } = await import('../src/rtc.js');
const { tun, createTunables } = await import('../src/tunables.js');
const p2p = await import('../src/p2p.js');

// a link that records what the room sends
const fakeLink = (owner = false) => { const l = { owner, got: [], send(s) { l.got.push(JSON.parse(s)); }, closed: false, close() { l.closed = true; } }; return l; };
const last = (l, t) => l.got.filter(m => m.t === t).at(-1);

test('room: welcome, join, state, op log, fx, leave', () => {
  const r = createRoom({ name: 'jardin', ops: [{ k: 'carve', c: [0, 0, 0] }] });
  const a = fakeLink(), b = fakeLink();
  const ca = r.join(a), cb = r.join(b);
  r.message(ca, { t: 'hello', name: 'anne<>' });
  const w = last(a, 'welcome');
  assert.equal(w.id, 1); assert.equal(w.room, 'jardin'); assert.equal(w.ops.length, 1); assert.deepEqual(w.players, []);
  assert.equal(w.tun, undefined); assert.equal(w.host, undefined);   // the node server's welcome is unchanged
  assert.deepEqual(Object.keys(w), ['t', 'id', 'color', 'room', 'ops', 'players', 'date']);   // + the room's date (feasts)
  r.message(cb, { t: 'hello', name: 'bob' });
  assert.equal(last(a, 'join').name, 'bob');
  assert.equal(last(b, 'welcome').players[0].name, 'anne');
  r.message(cb, { t: 'state', p: [1, 2, 3], yaw: 1, w: 'home', dig: 1, g: 'kart' });
  assert.deepEqual(last(a, 'state'), { t: 'state', id: 2, p: [1, 2, 3], yaw: 1, w: 'home', dig: true, g: 'kart' });
  assert.equal(b.got.filter(m => m.t === 'state').length, 0);
  r.message(ca, { t: 'op', op: { k: 'ladder', l: 1 } });
  assert.equal(r.ops.length, 2); assert.equal(r.dirty, true); assert.equal(last(b, 'op').op.k, 'ladder');
  r.message(ca, { t: 'op', op: { k: 'reset', seed: 5 } });
  assert.deepEqual(r.ops, [{ k: 'reset', seed: 5 }]);
  r.message(cb, { t: 'fx', fx: { k: 'laser' } });
  assert.deepEqual(last(a, 'fx'), { t: 'fx', id: 2, fx: { k: 'laser' } });
  r.message(cb, { t: 'op' });   // junk: ignored
  r.leave(cb);
  assert.deepEqual(last(a, 'leave'), { t: 'leave', id: 2 });
  assert.equal(r.size, 1);
});

test('room: super reset by password, or by the owner in a p2p room', () => {
  const timers = [];
  const r = createRoom({ superPw: 'valentin', later: (f) => timers.push(f) });
  const a = fakeLink(), ca = r.join(a);
  r.message(ca, { t: 'hello', name: 'a' });
  r.message(ca, { t: 'superreset', pw: 'nope' });
  assert.ok(last(a, 'superreset-denied'));
  r.message(ca, { t: 'superreset', pw: ' Valentin ' });
  assert.equal(last(a, 'superreset').in, 15000);
  timers[0]();
  assert.equal(r.ops[0].all, true);
  const p = createRoom({ superPw: null, later: () => {} });
  const g = fakeLink(), h = fakeLink(true);
  const cg = p.join(g), ch = p.join(h);
  p.message(ch, { t: 'hello', name: 'host' }); p.message(cg, { t: 'hello', name: 'guest' });
  assert.equal(last(g, 'welcome').host, 1);
  p.message(cg, { t: 'superreset', pw: 'valentin' });
  assert.ok(last(g, 'superreset-denied'));
  p.message(ch, { t: 'superreset' });
  assert.ok(last(g, 'superreset'));
});

test('room: owner powers: tunables to all and to late comers, kick, notes', () => {
  const r = createRoom({ notes: [] });
  const h = fakeLink(true), g = fakeLink();
  const ch = r.join(h), cg = r.join(g);
  r.message(ch, { t: 'hello', name: 'host' }); r.message(cg, { t: 'hello', name: 'guest' });
  r.message(cg, { t: 'tun', v: { gravity: 3 } });            // a guest can't
  assert.equal(r.tun, null);
  r.setTun({ gravity: .5 });
  assert.deepEqual(last(g, 'tun').v, { gravity: .5 });
  const late = fakeLink(); r.message(r.join(late), { t: 'hello', name: 'late' });
  assert.deepEqual(last(late, 'welcome').tun, { gravity: .5 });
  assert.equal(r.kick(1), false);                            // not the host
  assert.equal(r.kick(2), true);
  assert.ok(last(g, 'kicked')); assert.ok(g.closed);
  assert.equal(last(h, 'leave').id, 2);
  const cl = [...r.clients.values()].find(c => c.link === late);
  r.message(cl, { t: 'notes', rid: 7, text: '  bonjour   le trou ', name: 'x' });
  assert.equal(last(late, 'notes').code, 200);
  r.message(cl, { t: 'notes', rid: 8, text: 'encore' });
  assert.equal(last(late, 'notes').code, 429);
  r.message(cl, { t: 'notes', rid: 9 });
  assert.equal(last(late, 'notes').body[0].text, 'bonjour le trou');
  assert.equal(notePost([], { text: '' }, { key: 'k' }).code, 400);
});

test('signal: host, join, relay both ways, gone', () => {
  const s = createSignal();
  const mk = () => { const got = []; return { got, link: { send: (x) => got.push(JSON.parse(x)) } }; };
  const H = mk(), G = mk(), H2 = mk(), X = mk();
  const h = s.connect(H.link), g = s.connect(G.link), h2 = s.connect(H2.link), x = s.connect(X.link);
  h.message(JSON.stringify({ t: 'host', room: 'Ma Partie' }));
  assert.deepEqual(H.got.at(-1), { t: 'hosting', room: 'ma-partie' });
  h2.message(JSON.stringify({ t: 'host', room: 'ma partie' }));
  assert.equal(H2.got.at(-1).e, 'pris');
  x.message(JSON.stringify({ t: 'join', room: 'nope' }));
  assert.equal(X.got.at(-1).e, 'absent');
  g.message(JSON.stringify({ t: 'join', room: 'ma-partie' }));
  const gid = H.got.at(-1).gid;
  assert.ok(gid);
  h.message(JSON.stringify({ t: 'to', gid, d: 'OFFER' }));
  assert.deepEqual(G.got.at(-1), { t: 'sig', d: 'OFFER' });
  g.message(JSON.stringify({ t: 'to', d: 'ANSWER' }));
  assert.deepEqual(H.got.at(-1), { t: 'sig', gid, d: 'ANSWER' });
  g.close();
  assert.deepEqual(H.got.at(-1), { t: 'gone', gid });
  h.close();
  assert.deepEqual(s.rooms, []);
});

test('tunables: defaults, bounds, load, events', () => {
  const t = createTunables();
  assert.equal(t.get('gravity'), 1); assert.equal(t.get('hour'), -1); assert.equal(t.get('clockAnchor'), null);
  let n = 0; t.on(() => n++);
  t.set('gravity', 99); assert.equal(t.get('gravity'), 3);
  t.set('season', 7); assert.equal(t.get('season'), -1);
  t.set('season', 2); assert.equal(t.get('season'), 2);
  assert.deepEqual(t.snapshot(), { gravity: 3, season: 2 });
  t.load({ walk: 2, bogus: 1 }); assert.deepEqual(t.snapshot(), { walk: 2 });
  const before = n; t.load({ walk: 2 }); assert.equal(n, before);   // same values: no event
  t.reset(); assert.equal(t.changed, false);
});

test('codes: encode/decode, a link or a code', async () => {
  const obj = { k: 'o', i: 'abc', s: 'v=0\r\n'.repeat(80) + 'a=candidate:1 1 udp 2122260223 192.168.1.2 51234 typ host', n: 'anne' };
  const c = await encode(obj);
  assert.match(c, /^z[A-Za-z0-9_-]+$/);
  assert.ok(c.length < 300, 'compressed: ' + c.length);
  assert.deepEqual(await decode(c), obj);
  assert.deepEqual(await decode('https://x.fr/?join=' + encodeURIComponent(c) + '&name=b'), obj);
});

test('pipe: big messages in parts, stale positions dropped', async () => {
  const rel = new FakeChannel('rel'), fast = new FakeChannel('fast');
  const rel2 = new FakeChannel('rel'), fast2 = new FakeChannel('fast');
  rel.peer = rel2; rel2.peer = rel; fast.peer = fast2; fast2.peer = fast;
  const a = createPipe({ rel, fast, isFast: (s) => s.startsWith('{"t":"state"') });
  const b = createPipe({ rel: rel2, fast: fast2 });
  const got = [];
  b.onmessage = (s) => got.push(s);
  const big = JSON.stringify({ t: 'welcome', ops: Array.from({ length: 5000 }, (_, i) => ({ k: 'carve', c: [i, i, i], r: .5 })) });
  a.send(big);                                     // queued until open
  for (const c of [rel, fast, rel2, fast2]) c._open();
  for (let i = 0; i < 30; i++) a.send(JSON.stringify({ t: 'state', id: 4, p: [i, 0, 0] }));
  await tick(30);
  assert.equal(got[0], big, 'reassembled');
  const xs = got.slice(1).map(s => JSON.parse(s).p[0]);
  assert.ok(xs.length < 30 && xs.length > 20, 'some late ones dropped: ' + xs.length);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'never backwards');
});

test('p2p: host a room, a guest joins by code (same browser answer), tunables, kick, persistence', async () => {
  const host = await p2p.startHost({ name: 'Test Room', nick: 'hôte', useSig: false, rendezvous: false, hooks: { clock: () => 100 } });
  assert.equal(host.name, 'test-room');
  // the host's own game, through a socket in the same tab
  const hs = host.socket(); const hgot = [];
  hs.onmessage = (e) => hgot.push(JSON.parse(e.data));
  hs.onopen = () => hs.send(JSON.stringify({ t: 'hello', name: 'hôte' }));
  await tick(5);
  assert.equal(hgot[0].t, 'welcome'); assert.equal(hgot[0].host, hgot[0].id);
  hs.send(JSON.stringify({ t: 'op', op: { k: 'carve', c: [1, 1, 1], r: 1 } }));
  // an invitation, answered by a guest: the answer comes back over the BroadcastChannel
  const inv = await host.invite();
  assert.match(inv.link, /\?join=z/);
  const steps = [];
  const j = await p2p.joinHost({ join: inv.link, nick: 'bob', onStep: (w) => steps.push(w) });
  assert.deepEqual(steps.slice(0, 2), ['offer', 'answer']);
  assert.equal(j.room, 'test-room'); assert.equal(j.host, 'hôte');
  const gs = j.socket(); const ggot = [];
  gs.onmessage = (e) => ggot.push(JSON.parse(e.data));
  await new Promise(r => { gs.onopen = r; });
  gs.send(JSON.stringify({ t: 'hello', name: 'bob' }));
  await tick(20);
  const w = ggot.find(m => m.t === 'welcome');
  assert.equal(w.ops.length, 1); assert.equal(w.players[0].name, 'hôte');
  assert.equal(hgot.at(-1).t, 'join');
  assert.equal(host.snap().guests[0].state, 'on');
  // late candidates crossed over the BroadcastChannel, both ways
  const hpc = [...host.guests.values()][0].pc;
  assert.ok(hpc.added?.some(c => c.includes(j.pc.n)), 'host got the guest\'s late candidate');
  assert.ok(j.pc.added?.some(c => c.includes(hpc.n)), 'guest got the host\'s late candidate');
  assert.match(host.snap().guests[0].ice, /local \d+ · stun \d+ · turn \d+/);
  // positions over the fast channel, ops over the reliable one
  gs.send(JSON.stringify({ t: 'state', p: [3, 0, 3], yaw: 0, w: 'home', dig: false, g: null }));
  gs.send(JSON.stringify({ t: 'op', op: { k: 'ladder', l: 2 } }));
  await tick(20);
  assert.ok(hgot.some(m => m.t === 'state' && m.p[0] === 3));
  assert.equal(host.room.ops.length, 2);
  // the host turns a knob: every guest hears it
  tun.set('gravity', .4);
  await tick(150);
  assert.deepEqual(ggot.filter(m => m.t === 'tun').at(-1).v, { gravity: .4 });
  // the clock's pace: anchored where the clock is
  tun.set('timeSpeed', 5);
  await tick(150);
  const v = ggot.filter(m => m.t === 'tun').at(-1).v;
  assert.equal(v.timeSpeed, 5); assert.equal(v.clockAnchor[1], 100); assert.equal(v.clockAnchor[2], 5);
  host.raid();
  await tick(10);
  assert.ok(ggot.some(m => m.t === 'admin' && m.a === 'raid'));
  // a guest's big message is refused
  gs.send(JSON.stringify({ t: 'op', op: { k: 'x', pad: 'x'.repeat(70000) } }));
  await tick(20);
  assert.equal(host.room.ops.length, 2);
  // kicked
  host.kick(w.id);
  await tick(350);
  assert.ok(ggot.some(m => m.t === 'kicked'));
  assert.equal(gs.readyState, 3);
  assert.equal(host.room.size, 1);
  // saved, and back on the next host
  host.save();
  await tick(20);
  const saved = await p2p.loadWorld('test-room');
  assert.equal(saved.ops.length, 2); assert.equal(saved.tun.gravity, .4);
  tun.reset();
  await tick(150);
});

test('p2p: the feasts go by the host\'s date: a guest in july sees noël when the host is on christmas eve', async () => {
  const { serverClock, activeEvents, tunToOverride } = await import('../src/events-calendar.js');
  const { createNet } = await import('../src/net.js');
  const XMAS = Date.UTC(2026, 11, 24, 12), JULY = Date.UTC(2026, 6, 10, 15);
  const host = await p2p.startHost({ name: 'fete', nick: 'h', useSig: false, rendezvous: false, now: () => XMAS });
  const inv = await host.invite();
  const j = await p2p.joinHost({ join: inv.link, nick: 'bob' });
  const realNow = Date.now;
  serverClock.clear();
  Date.now = () => JULY;          // the guest's own clock
  try {
    assert.deepEqual(activeEvents(serverClock.parts()).map(e => e.id), []);
    const net = createNet({ scene: { add() {}, remove() {} } });
    net.connect('fete', 'bob', () => j.socket());
    await tick(40);
    assert.equal(serverClock.remote, true);
    assert.deepEqual(activeEvents(serverClock.parts()).map(e => e.id), ['noel']);
    // the host's (or the admin's) override still wins: `event` none for everyone
    tun.set('event', 0);
    await tick(150);
    assert.deepEqual(activeEvents(serverClock.parts(), tunToOverride(tun.get('event'))), []);
  } finally { Date.now = realNow; serverClock.clear(); tun.reset(); await tick(150); }
});

test('p2p: an invitation that fails (nat), a pasted answer', async () => {
  const host = await p2p.startHost({ name: 'deux', nick: 'h', useSig: false, rendezvous: false });
  const inv = await host.invite();
  failNext = true;
  await assert.rejects(p2p.joinHost({ join: inv.code, nick: 'z' }), (e) => /directe/.test(e.message) && /turn/.test(e.hint));
  // a second guest whose answer is pasted by hand
  const inv2 = await host.invite();
  let answer = null;
  const pj = p2p.joinHost({ join: inv2.code, nick: 'paste', onStep: (w, d) => { if (w === 'answer') answer = d.code; } });
  await tick(20);
  const g = await host.accept(answer);   // may already be accepted over the channel: both fine
  assert.ok(g);
  const j = await pj;
  assert.equal(j.room, 'deux');
  await assert.rejects(host.accept(await encode({ k: 'a', i: 'nope', s: '' })), /aucune invitation/);
});

test('p2p: world file round trip', () => {
  const f = p2p.worldFile('r', { ops: [{ k: 'carve' }], tun: { walk: 2 } });
  assert.equal(f.game, 'a-hole');
  assert.deepEqual(p2p.readWorldFile(JSON.parse(JSON.stringify(f))).ops, [{ k: 'carve' }]);
  assert.throws(() => p2p.readWorldFile({ nope: 1 }), /monde/);
});

// ---------- the node server: same bytes as before the room moved into src/room.js ----------
async function run(file, port, cwd) {
  const p = spawn(process.execPath, [file, '--port', String(port), '--dir', ROOT], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => { p.stdout.on('data', (d) => { if (String(d).includes('a hole')) res(); }); p.on('exit', (c) => rej(new Error('exit ' + c))); setTimeout(() => rej(new Error('no start')), 5000); });
  return p;
}
async function script(port) {
  // two diggers: hello, state, op, fx, reset, leave: every message each one gets, in order
  const WebSocket = globalThis.WebSocket;
  const open = (p) => new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`); const got = []; ws.onmessage = (e) => got.push(JSON.parse(e.data)); ws.onopen = () => res({ ws, got }); });
  const a = await open('/ws'); a.ws.send(JSON.stringify({ t: 'hello', room: 'x', name: 'anne' })); await tick(80);
  const b = await open('/ws'); b.ws.send(JSON.stringify({ t: 'hello', name: 'bob!!' })); await tick(80);
  a.ws.send(JSON.stringify({ t: 'state', p: [1, 2, 3], yaw: .5, w: 'home', dig: true, g: 'kart-long-name-over-16' })); await tick(40);
  b.ws.send(JSON.stringify({ t: 'op', op: { k: 'carve', c: [0, 0, 0], r: .5 } })); await tick(40);
  a.ws.send(JSON.stringify({ t: 'fx', fx: { k: 'laser' } })); await tick(40);
  b.ws.send(JSON.stringify({ t: 'superreset', pw: 'wrong' })); await tick(40);
  a.ws.send(JSON.stringify({ t: 'tun', v: { gravity: 3 } })); await tick(40);   // unknown to the node server: ignored
  b.ws.close(); await tick(80);
  a.ws.close();
  // (the room's date is new: the feasts of the calendar go by it)
  const norm = (m) => (m.t === 'welcome' ? { ...m, date: undefined, id: 'ID', players: m.players.map(p => ({ ...p, id: 'ID' })), ops: m.ops.length } : m.id ? { ...m, id: 'ID' } : m);
  return { a: a.got.map(norm), b: b.got.map(norm) };
}
test('server.mjs: same messages as the old server, and /sig', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-'));
  const tmpOld = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-old-'));
  // the server as it was before this change, from git
  const { execSync } = await import('node:child_process');
  // (the last commit before the room moved to room.js; its hash may be gone after a history rewrite,
  // or out of a shallow CI checkout: then only the new server is checked)
  let old = null;
  for (const ref of [process.env.OLD_SERVER_REF, 'fe38c93', ':/^Fusion : console du serveur'].filter(Boolean)) {
    try { old = execSync(`git show '${ref}^{commit}' >/dev/null 2>&1 && git show '${ref}:server.mjs'`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); if (!old.includes('createRoom')) break; old = null; } catch { old = null; }
  }
  const oldFile = old && path.join(ROOT, '.old-server-test.mjs');
  if (old) fs.writeFileSync(oldFile, old);
  const [ns, os_] = [await run(path.join(ROOT, 'server.mjs'), 18771, tmp), old ? await run(oldFile, 18772, tmpOld) : null];
  try {
    const now = await script(18771);
    if (old) assert.deepEqual(now, await script(18772));
    else console.log('# (no old server in this checkout: the byte-for-byte comparison is skipped)');
    assert.equal(now.a[0].t, 'welcome'); assert.equal(now.a[1].t, 'join');
    // signaling on the new one
    const WebSocket = globalThis.WebSocket;
    const open = () => new Promise((res) => { const ws = new WebSocket('ws://127.0.0.1:18771/sig'); const got = []; ws.onmessage = (e) => got.push(JSON.parse(e.data)); ws.onopen = () => res({ ws, got }); });
    const h = await open(), g = await open();
    h.ws.send(JSON.stringify({ t: 'host', room: 'labo' })); await tick(50);
    g.ws.send(JSON.stringify({ t: 'join', room: 'labo' })); await tick(50);
    const gid = h.got.at(-1).gid;
    h.ws.send(JSON.stringify({ t: 'to', gid, d: 'o' })); await tick(50);
    assert.deepEqual(g.got.at(-1), { t: 'sig', d: 'o' });
    h.ws.close(); g.ws.close();
    // static files and the guest book still there
    const r = await fetch('http://127.0.0.1:18771/src/room.js'); assert.equal(r.status, 200);
    const n = await fetch('http://127.0.0.1:18771/api/notes?room=t', { method: 'POST', body: JSON.stringify({ name: 'a', text: 'yo' }) });
    assert.equal(n.status, 200);
    assert.equal((await (await fetch('http://127.0.0.1:18771/api/notes?room=t')).json())[0].text, 'yo');
    const bad = await fetch('http://127.0.0.1:18771/api/notes?room=t', { method: 'POST', body: JSON.stringify({ name: 'a', text: 'again' }) });
    assert.equal(bad.status, 429);
  } finally { ns.kill(); os_?.kill(); if (oldFile) fs.rmSync(oldFile); for (const d of [tmp, tmpOld]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('p2p through /sig: a guest types @room, the host answers by itself', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-sig-'));
  const srv = await run(path.join(ROOT, 'server.mjs'), 18773, tmp);
  const was = location.host;
  location.host = '127.0.0.1:18773';
  try {
    const host = await p2p.startHost({ name: 'sigroom', nick: 'h' });
    for (let i = 0; i < 40 && host.sig.state !== 'on'; i++) await tick(25);
    assert.equal(host.sig.code, '@sigroom');
    assert.match(host.snap().sig.link, /join=%40sigroom/);
    const steps = [];
    const j = await p2p.joinHost({ join: '@sigroom', nick: 'guest', onStep: (w) => steps.push(w) });
    assert.deepEqual(steps.filter(s => s !== 'ice'), ['sig', 'offer', 'open']);
    const gs = j.socket(); const got = [];
    gs.onmessage = (e) => got.push(JSON.parse(e.data));
    gs.onopen = () => gs.send(JSON.stringify({ t: 'hello', name: 'guest' }));
    await tick(40);
    assert.equal(got[0].t, 'welcome');
    await tick(20);
    assert.equal(host.snap().guests[0].state, 'on');
    const hpc = [...host.guests.values()][0].pc;
    assert.ok(hpc.added?.some(c => c.includes(j.pc.n)), 'late candidate through /sig');
    assert.ok(j.pc.added?.some(c => c.includes(hpc.n)), 'late candidate through /sig, back');
    await assert.rejects(p2p.joinHost({ join: '@personne', nick: 'x' }), /aucune partie/);
    // a second tab hosting the same name gets told
    const h2 = await p2p.startHost({ name: 'sigroom', nick: 'h2' });
    for (let i = 0; i < 40 && h2.sig.state !== 'taken'; i++) await tick(25);
    assert.equal(h2.sig.state, 'taken');
  } finally { location.host = was; srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- bags on the ground: exactly one digger gets each ----------
test('room: a drop is taken once, whoever asks second gets nothing', () => {
  const r = createRoom({ ops: [{ k: 'drop', id: 'old', c: {} }, { k: 'drop', id: 'gone', c: {} }, { k: 'take', id: 'gone', by: 9 }] });
  assert.deepEqual([...r.drops], ['old']);
  const A = fakeLink(), B = fakeLink(), C = fakeLink();
  const ca = r.join(A), cb = r.join(B), cc = r.join(C);
  for (const [c, n] of [[ca, 'a'], [cb, 'b'], [cc, 'c']]) r.message(c, { t: 'hello', name: n });
  r.message(ca, { t: 'op', op: { k: 'drop', id: 'd1', w: 'home', p: [0, 0, 0], by: 'a', c: { coins: 5 } } });
  assert.equal(last(B, 'op').op.id, 'd1'); assert.equal(A.got.filter(m => m.t === 'op').length, 0);
  r.message(ca, { t: 'op', op: { k: 'drop', id: 'd1', c: {} } });   // same id again: ignored
  assert.equal(r.ops.filter(o => o.id === 'd1').length, 1);
  // b and c both grab it: b's take reaches the room first
  r.message(cb, { t: 'op', op: { k: 'take', id: 'd1', tok: 'bbb' } });
  r.message(cc, { t: 'op', op: { k: 'take', id: 'd1', tok: 'ccc' } });
  for (const L of [A, B, C]) { const t = L.got.filter(m => m.t === 'op' && m.op.k === 'take'); assert.equal(t.length, 1); assert.deepEqual(t[0].op, { k: 'take', id: 'd1', tok: 'bbb', by: 2 }); }
  assert.deepEqual(last(C, 'op-no'), { t: 'op-no', id: 'd1' });
  assert.equal(r.ops.filter(o => o.k === 'take' && o.id === 'd1').length, 1);
  // a late comer replays: drop then take
  const L = fakeLink(); r.message(r.join(L), { t: 'hello', name: 'late' });
  assert.deepEqual(last(L, 'welcome').ops.filter(o => o.id === 'd1').map(o => o.k), ['drop', 'take']);
  r.message(ca, { t: 'op', op: { k: 'reset', seed: 1 } });
  assert.equal(r.drops.size, 0);
});

test('room: gifts from the host go to one digger, or to all but the host', () => {
  const r = createRoom();
  const H = fakeLink(true), A = fakeLink(), B = fakeLink();
  const ch = r.join(H), ca = r.join(A), cb = r.join(B);
  r.message(ch, { t: 'hello', name: 'h' }); r.message(ca, { t: 'hello', name: 'a' }); r.message(cb, { t: 'hello', name: 'b' });
  r.message(ca, { t: 'admin', a: 'give', gift: { coins: 1e6 } });   // a guest can't
  assert.equal(B.got.filter(m => m.t === 'admin').length, 0);
  r.give(2, { coins: 50 }, 'h');
  assert.deepEqual(last(A, 'admin'), { t: 'admin', a: 'give', gift: { coins: 50 }, by: 'h' });
  assert.equal(B.got.filter(m => m.t === 'admin').length, 0);
  r.give(null, { items: { dyn: 2 } }, 'h');
  assert.equal(last(B, 'admin').gift.items.dyn, 2); assert.equal(A.got.filter(m => m.t === 'admin').length, 2);
  assert.equal(H.got.filter(m => m.t === 'admin').length, 0);
});

test('drops.js: dropping takes it from you, the room\'s answer gives it to the first', async () => {
  globalThis.document.createElement ??= () => ({ getContext: () => null });
  const THREE = await import('three');
  const { createEconomy, ITEMS } = await import('../src/economy.js');
  const { createDrops, cleanPack } = await import('../src/drops.js');
  const ui = { toasts: [], setCoins() {}, setBag() {}, toast(t) { ui.toasts.push(t); } };
  const mk = (netObj) => { const eco = createEconomy('t'); const sent = []; const scene = new THREE.Group(); const d = createDrops({ scene, eco, ui, ITEMS, PARTS: [{ id: 'p_moteur', name: 'moteur' }], nameOf: (id) => eco.nameOf(id), gainPart: () => {}, save() {}, emit: (op) => sent.push(op), net: () => netObj, myName: () => 'val' }); return { eco, d, sent, scene }; };
  // solo: drop, walk away, walk back: it's yours again
  const solo = mk(null);
  solo.eco.s.money = 120; solo.eco.s.items.dyn = 3; solo.eco.add(21); solo.eco.add(21);
  for (const id of ['coin:100', 'item:dyn', 'item:dyn', 'sack:21']) assert.equal(solo.d.click(id), 'ok');
  assert.equal(solo.d.click('put', { w: 'home', p: [1, 0, 1] }), 'put');
  assert.equal(solo.eco.s.money, 20); assert.equal(solo.eco.s.items.dyn, 1); assert.equal(solo.eco.s.sack[21], 1); assert.equal(solo.eco.s.sackN, 1);
  assert.equal(solo.sent[0].k, 'drop'); assert.deepEqual(solo.sent[0].c.items, { dyn: 2 });
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  solo.d.update(.1, 'home', P(1, 0, 1));                  // still standing on it: not picked up
  assert.equal(solo.d.size, 1);
  solo.d.update(.1, 'home', P(9, 0, 9)); solo.d.update(.1, 'home', P(1.2, 0, 1));
  assert.equal(solo.d.size, 0);
  assert.equal(solo.eco.s.money, 120); assert.equal(solo.eco.s.items.dyn, 3); assert.equal(solo.eco.s.sack[21], 2);
  // online: two diggers step on the same bag; the room's take says who
  const sentA = [], sentB = [];
  const A = mk({ sendOp: (op) => sentA.push(op) }), B = mk({ sendOp: (op) => sentB.push(op) });
  const drop = { k: 'drop', id: 'x1', w: 'home', p: [0, 0, 0], by: 'zoé', c: { coins: 40, sack: { 21: 2 }, items: { bogus: 5 } } };
  A.d.add(drop); B.d.add(drop);
  A.d.update(.1, 'home', P(0, 0, 0)); B.d.update(.1, 'home', P(0, 0, 0));
  assert.equal(sentA.length, 1); assert.equal(sentB.length, 1);
  // what the room does with both (the first one in wins)
  const room = createRoom({ ops: [drop] });
  const la = fakeLink(), lb = fakeLink(); const ca = room.join(la), cb = room.join(lb);
  room.message(ca, { t: 'hello', name: 'a' }); room.message(cb, { t: 'hello', name: 'b' });
  room.message(cb, { t: 'op', op: sentB[0] }); room.message(ca, { t: 'op', op: sentA[0] });
  const take = last(la, 'op').op;
  A.d.taken(take); B.d.taken(take);
  assert.equal(A.eco.s.money, 0); assert.equal(B.eco.s.money, 40); assert.equal(B.eco.s.sack[21], 2);
  assert.equal(A.d.size, 0); assert.equal(B.d.size, 0);
  // replaying the log later grants nothing
  const C = mk({ sendOp() {} }); C.d.add(drop); C.d.taken(take); assert.equal(C.eco.s.money, 0);
  // a gift is cleaned: unknown things out, amounts capped
  assert.deepEqual(cleanPack({ coins: -3, items: { dyn: 500, zz: 1 }, sack: { 999: 1, 21: 2 }, parts: ['p_moteur', 'x'] }, { items: ITEMS, sackOk: (id) => id === '21', partOk: (id) => id === 'p_moteur' }), { coins: 0, items: { dyn: 99 }, ali: {}, sack: { 21: 2 }, parts: ['p_moteur'] });
});

test('p2p: simultaneous pickups through a hosted room, and gifts', async () => {
  const host = await p2p.startHost({ name: 'sacs', nick: 'hh', useSig: false, rendezvous: false });
  const hs = host.socket(); const hgot = [];
  hs.onmessage = (e) => hgot.push(JSON.parse(e.data));
  hs.onopen = () => hs.send(JSON.stringify({ t: 'hello', name: 'hh' }));
  const guest = async (name) => {
    const inv = await host.invite();
    const j = await p2p.joinHost({ join: inv.code, nick: name });
    const s = j.socket(); const got = [];
    s.onmessage = (e) => got.push(JSON.parse(e.data));
    await new Promise(r => { s.onopen = r; });
    s.send(JSON.stringify({ t: 'hello', name }));
    await tick(20);
    return { s, got, id: got.find(m => m.t === 'welcome').id };
  };
  const g1 = await guest('un'), g2 = await guest('deux');
  hs.send(JSON.stringify({ t: 'op', op: { k: 'drop', id: 'bag', w: 'home', p: [0, 0, 0], by: 'hh', c: { coins: 9 } } }));
  await tick(20);
  assert.ok(g1.got.some(m => m.t === 'op' && m.op.k === 'drop'));
  g1.s.send(JSON.stringify({ t: 'op', op: { k: 'take', id: 'bag', tok: 't1' } }));
  g2.s.send(JSON.stringify({ t: 'op', op: { k: 'take', id: 'bag', tok: 't2' } }));
  await tick(40);
  const takes = [hgot, g1.got, g2.got].map(l => l.filter(m => m.t === 'op' && m.op.k === 'take').map(m => m.op.tok));
  assert.equal(takes[0].length, 1);
  for (const t of takes) assert.deepEqual(t, takes[0]);   // everyone agrees on the one winner
  assert.equal(host.room.ops.filter(o => o.k === 'take').length, 1);
  host.give(g2.id, { coins: 7 });
  host.give(null, { items: { dyn: 1 } });
  await tick(20);
  assert.deepEqual(g2.got.filter(m => m.t === 'admin').map(m => m.gift), [{ coins: 7 }, { items: { dyn: 1 } }]);
  assert.deepEqual(g1.got.filter(m => m.t === 'admin').map(m => m.gift), [{ items: { dyn: 1 } }]);
  assert.equal(hgot.filter(m => m.t === 'admin').length, 0);
  assert.equal(g2.got.find(m => m.t === 'admin').by, 'hh');
});

test('server.mjs: two diggers grab the same bag at once, one gets it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-bag-'));
  const srv = await run(path.join(ROOT, 'server.mjs'), 18774, tmp);
  try {
    const open = () => new Promise((res) => { const ws = new WebSocket('ws://127.0.0.1:18774/ws'); const got = []; ws.onmessage = (e) => got.push(JSON.parse(e.data)); ws.onopen = () => res({ ws, got }); });
    const [a, b, c] = [await open(), await open(), await open()];
    for (const [x, n] of [[a, 'a'], [b, 'b'], [c, 'c']]) x.ws.send(JSON.stringify({ t: 'hello', name: n }));
    await tick(80);
    for (let round = 0; round < 20; round++) {
      const id = 'bag' + round;
      a.ws.send(JSON.stringify({ t: 'op', op: { k: 'drop', id, w: 'home', p: [0, 0, 0], by: 'a', c: { coins: 1 } } }));
      await tick(15);
      // sent in the same tick: the server's order decides
      b.ws.send(JSON.stringify({ t: 'op', op: { k: 'take', id, tok: 'b' + round } }));
      c.ws.send(JSON.stringify({ t: 'op', op: { k: 'take', id, tok: 'c' + round } }));
    }
    await tick(200);
    for (let round = 0; round < 20; round++) {
      const seen = [a, b, c].map(x => x.got.filter(m => m.t === 'op' && m.op.k === 'take' && m.op.id === 'bag' + round).map(m => m.op.tok));
      assert.equal(seen[0].length, 1, 'one take per bag');
      assert.deepEqual(seen[1], seen[0]); assert.deepEqual(seen[2], seen[0]);
    }
    // a late comer: all bags taken
    const d = await open(); d.ws.send(JSON.stringify({ t: 'hello', name: 'd' })); await tick(80);
    const w = d.got.find(m => m.t === 'welcome');
    assert.equal(w.ops.filter(o => o.k === 'drop').length, 20); assert.equal(w.ops.filter(o => o.k === 'take').length, 20);
    for (const x of [a, b, c, d]) x.ws.close();
  } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- the node server's admin door, and admin.mjs ----------
const { connectAdmin } = await import('../src/admin-client.js');
const sh = (args, cwd) => new Promise((res) => {
  const p = spawn(process.execPath, [path.join(ROOT, 'admin.mjs'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let o = '', e = '';
  p.stdout.on('data', (d) => { o += d; }); p.stderr.on('data', (d) => { e += d; });
  p.on('exit', (code) => res({ code, out: o, err: e }));
});
test('admin: token, owner powers on the garden, values kept across a restart, admin.mjs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-adm-'));
  const url = 'ws://127.0.0.1:9137';
  let srv = await run(path.join(ROOT, 'server.mjs'), 9137, tmp);
  try {
    // a token made on the first start, kept private, never served
    const tokFile = path.join(tmp, 'data/admin-token');
    const token = fs.readFileSync(tokFile, 'utf8').trim();
    assert.ok(token.length >= 24);
    assert.equal(fs.statSync(tokFile).mode & 0o777, 0o600);
    assert.notEqual((await fetch('http://127.0.0.1:9137/data/admin-token')).status, 200);
    await assert.rejects(connectAdmin({ url, token: 'wrong' }), /mauvais jeton/);
    await assert.rejects(connectAdmin({ url, token: '' }), /mauvais jeton/);
    // two diggers in the garden
    const open = () => new Promise((res) => { const ws = new WebSocket('ws://127.0.0.1:9137/ws'); const got = []; ws.onmessage = (e) => got.push(JSON.parse(e.data)); ws.onopen = () => res({ ws, got }); });
    const a = await open(), b = await open();
    a.ws.send(JSON.stringify({ t: 'hello', name: 'anne' })); b.ws.send(JSON.stringify({ t: 'hello', name: 'bob' }));
    await tick(60);
    a.ws.send(JSON.stringify({ t: 'state', p: [1, 2, 3], yaw: 0, w: 'china', dig: false, g: null }));
    await tick(40);
    const adm = await connectAdmin({ url, token });
    const ps = await adm.call('players');
    assert.deepEqual(ps.map(p => p.name).sort(), ['anne', 'bob']);
    assert.equal(ps.find(p => p.name === 'anne').w, 'china');
    const aid = ps.find(p => p.name === 'anne').id, bid = ps.find(p => p.name === 'bob').id;
    await adm.call('set', 'gravity', .5);
    await adm.call('set', 'timeSpeed', 4);
    await tick(40);
    assert.deepEqual(b.got.filter(m => m.t === 'tun').at(-1).v.gravity, .5);
    assert.equal(b.got.filter(m => m.t === 'tun').at(-1).v.clockAnchor[2], 4);
    await adm.call('give', aid, { coins: 30 });
    await adm.call('give', null, { items: { dyn: 2 } });
    await adm.call('raid'); await adm.call('say', 'bonjour le jardin');
    await tick(40);
    assert.deepEqual(a.got.filter(m => m.t === 'admin').map(m => m.a), ['give', 'give', 'raid', 'say']);
    assert.deepEqual(b.got.filter(m => m.t === 'admin').map(m => m.a), ['give', 'raid', 'say']);
    assert.equal(a.got.find(m => m.a === 'give').by, 'le serveur');
    await adm.call('resetMap');
    await tick(40);
    assert.equal(b.got.filter(m => m.t === 'op').at(-1).op.k, 'reset');
    assert.ok(adm.snap && adm.snap.node && adm.snap.players.length === 2);
    assert.equal(await adm.call('kick', bid), true);
    await tick(80);
    assert.ok(b.got.some(m => m.t === 'kicked'));
    await assert.rejects(adm.call('nope'), /inconnu/);
    // the guest book, tidied
    await fetch('http://127.0.0.1:9137/api/notes?room=jardin', { method: 'POST', body: JSON.stringify({ name: 'x', text: 'gros mot' }) });
    const ns = await adm.call('notes');
    assert.equal(ns[0].text, 'gros mot');
    assert.equal(await adm.call('delNote', ns[0].at), true);
    assert.equal((await (await fetch('http://127.0.0.1:9137/api/notes?room=jardin')).json()).length, 0);
    // the command line, one shot, token read from data/admin-token in the server's folder
    let r = await sh(['--url', url, 'players'], tmp);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /anne/); assert.match(r.out, /1 joueur/);
    r = await sh(['--url', url, 'set', 'season', 'hiver'], tmp);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /hiver/);
    r = await sh(['--url', url, 'get', 'season'], tmp); assert.match(r.out, /\* season\s+hiver/);
    r = await sh(['--url', url, 'give', 'anne', 'fer', '3'], tmp); assert.equal(r.code, 0, r.err); assert.match(r.out, /anne : 3 × fer/);
    r = await sh(['--url', url, 'give', 'all', 'pièces', '50'], tmp); assert.match(r.out, /tout le monde : 50 × pièces/);
    r = await sh(['--url', url, 'give', 'anne', 'dynamite', '2'], tmp); assert.match(r.out, /2 × dynamite/);
    await tick(40);
    const gifts = a.got.filter(m => m.a === 'give').slice(-3).map(m => m.gift);
    assert.equal(Object.values(gifts[0].sack)[0], 3); assert.equal(gifts[1].coins, 50); assert.equal(gifts[2].items.dyn, 2);
    r = await sh(['--url', url, 'say', 'à', 'table'], tmp); assert.match(r.out, /annoncé/);
    r = await sh(['--url', url, 'kick', 'personne'], tmp); assert.equal(r.code, 1); assert.match(r.err, /personne ne s'appelle/);
    r = await sh(['--url', url, 'set', 'nope', '1'], tmp); assert.equal(r.code, 1);
    r = await sh(['--url', url, '--token', 'bad', 'players'], tmp); assert.equal(r.code, 1); assert.match(r.err, /mauvais jeton/);
    r = await sh(['--url', url, 'help'], tmp); assert.match(r.out, /newmap/);
    adm.close(); a.ws.close(); b.ws.close();
    await tick(50);
    // a restart: same token, the values still there, and sent to the next digger
    srv.kill(); await tick(200);
    srv = await run(path.join(ROOT, 'server.mjs'), 9137, tmp);
    assert.equal(fs.readFileSync(tokFile, 'utf8').trim(), token);
    const c = await open(); c.ws.send(JSON.stringify({ t: 'hello', name: 'cid' })); await tick(80);
    const w = c.got.find(m => m.t === 'welcome');
    assert.equal(w.tun.gravity, .5); assert.equal(w.tun.season, 3);
    c.ws.close();
  } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('admin: a token given on the command line, none written', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-adm2-'));
  const p = spawn(process.execPath, [path.join(ROOT, 'server.mjs'), '--port', '9138', '--dir', tmp, '--admin-token', 'secret-du-jardin'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => p.stdout.on('data', (d) => { if (String(d).includes('a hole')) res(); }));
  try {
    assert.equal(fs.existsSync(path.join(tmp, 'data/admin-token')), false);
    // serving the very folder the data lives in: the data stays out of reach
    fs.writeFileSync(path.join(tmp, 'data/rooms/jardin.json'), '[]');
    assert.equal((await fetch('http://127.0.0.1:9138/data/rooms/jardin.json')).status, 403);
    assert.equal((await fetch('http://127.0.0.1:9138/data/../data/rooms/jardin.json')).status, 403);
    const a = await connectAdmin({ url: 'ws://127.0.0.1:9138', token: 'secret-du-jardin' });
    assert.deepEqual(await a.call('players'), []);
    a.close();
  } finally { p.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- no server of ours: public trackers as the meeting point ----------
// a WebTorrent tracker, in memory: swarms by info_hash, offers handed to the others, answers back
function fakeTrackers() {
  const swarms = new Map();   // url → info_hash → Map(peer_id → socket)
  const seen = [];            // every message a tracker got (to check nothing readable goes through)
  class TWS {
    constructor(url) {
      this.url = url; this.readyState = 0;
      if (url.includes('dead')) { setTimeout(() => { this.readyState = 3; this.onerror?.(); this.onclose?.(); }, 2); return; }
      setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 2);
    }
    close() { this.readyState = 3; }
    push(m) { if (this.readyState === 1) setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }), 1); }
    send(str) {
      const m = JSON.parse(str); seen.push(str);
      if (m.action !== 'announce') return;
      const byHash = swarms.get(this.url) || new Map(); swarms.set(this.url, byHash);
      const swarm = byHash.get(m.info_hash) || new Map(); byHash.set(m.info_hash, swarm);
      if (m.event === 'stopped') { swarm.delete(m.peer_id); return; }
      if (m.answer) { swarm.get(m.to_peer_id)?.push({ action: 'announce', info_hash: m.info_hash, peer_id: m.peer_id, offer_id: m.offer_id, answer: m.answer }); return; }
      swarm.set(m.peer_id, this);
      this.push({ action: 'announce', info_hash: m.info_hash, interval: 120, complete: 0, incomplete: swarm.size });
      const others = [...swarm.entries()].filter(([id]) => id !== m.peer_id).map(([, s]) => s);
      (m.offers || []).forEach((o, i) => { const to = others[i % Math.max(1, others.length)]; to?.push({ action: 'announce', info_hash: m.info_hash, peer_id: m.peer_id, offer_id: o.offer_id, offer: o.offer }); });
    }
  }
  return { TWS, seen, swarms };
}

test('rendezvous: sealed offers, only the right secret opens them', async () => {
  const r = await import('../src/rendezvous.js');
  const a = await r.roomKeys('ma-partie', 'k1'), b = await r.roomKeys('ma-partie', 'k2');
  assert.match(a.hash, /^[0-9a-f]{20}$/); assert.notEqual(a.hash, b.hash);
  const s = await r.seal(a.key, { c: 'offre', g: 'x' });
  assert.deepEqual(await r.unseal(a.key, s), { c: 'offre', g: 'x' });
  assert.equal(await r.unseal(b.key, s), null);
  assert.equal(await r.unseal(a.key, 'n\'importe quoi'), null);
});

test('rendezvous: a guest finds the host through (fake) public trackers, one of them dead', async () => {
  const { TWS, seen } = fakeTrackers();
  const trackers = ['wss://dead.example', 'wss://t1.example', 'wss://t2.example'];
  const host = await p2p.startHost({ name: 'sans-serveur', nick: 'hh', useSig: false, rendezvous: true, trackers, WS: TWS });
  for (let i = 0; i < 40 && host.rdv.up < 2; i++) await tick(10);
  const snap = host.snap();
  assert.equal(snap.rdv.up, 2); assert.equal(snap.rdv.of, 3);
  assert.match(snap.rdv.code, /^t:sans-serveur:[a-z0-9]{12}$/);
  assert.match(snap.rdv.link, /\?join=t%3Asans-serveur%3A/);
  const hs = host.socket(); const hgot = [];
  hs.onmessage = (e) => hgot.push(JSON.parse(e.data));
  hs.onopen = () => hs.send(JSON.stringify({ t: 'hello', name: 'hh' }));
  // two guests at once, each announcing on both live trackers
  const steps = [];
  const [j1, j2] = await Promise.all(['un', 'deux'].map(n => p2p.joinHost({ join: snap.rdv.link, nick: n, trackers, WS: TWS, rdv: { roundMs: 300 }, onStep: (w) => steps.push(w) })));
  assert.equal(j1.room, 'sans-serveur'); assert.equal(j1.host, 'hh');
  assert.ok(steps.includes('rdv') && steps.includes('offer') && steps.includes('open'));
  for (const [j, n] of [[j1, 'un'], [j2, 'deux']]) { const s = j.socket(); s.onopen = () => s.send(JSON.stringify({ t: 'hello', name: n })); }
  await tick(60);
  assert.deepEqual(host.room.players().map(p => p.name).sort(), ['deux', 'hh', 'un']);
  // one connection per guest, however many offers they announced
  assert.equal([...host.guests.values()].filter(g => g.state === 'on').length, 2);
  // nothing the trackers saw holds an sdp or a name
  const all = seen.join('\n');
  assert.ok(!/v=0|candidate|"un"|deux|sans-serveur/.test(all), 'sealed');
  // a wrong secret finds nobody (quickly, with short rounds)
  await assert.rejects(p2p.joinHost({ join: 't:sans-serveur:mauvais', nick: 'x', trackers, WS: TWS, rdv: { roundMs: 50, rounds: 3 } }), /personne ne répond/);
  // no tracker reachable at all
  await assert.rejects(p2p.joinHost({ join: 't:sans-serveur:x', nick: 'x', trackers: ['wss://dead.a', 'wss://dead.b'], WS: TWS, rdv: { roundMs: 50, rounds: 2 } }), /aucun relais/);
});

test('rendezvous: a tracker that never answers is left alone after 3 tries', async () => {
  const r = await import('../src/rendezvous.js');
  const { TWS } = fakeTrackers();
  let made = 0;
  class Counting extends TWS { constructor(u) { super(u); made++; } }
  const h = await r.hostRendezvous({ room: 'x', secret: 'y', trackers: ['wss://dead.never'], WS: Counting, onOffer() {} });
  await tick(6800);   // tries at 0, 2 s, 6 s
  assert.equal(made, 3);
  assert.ok(r.deadTrackers.get('wss://dead.never').until > Date.now() + 14 * 60000);
  assert.equal(h.links[0].state, 'dead');
  // a guest on the same page doesn't even try it
  const before = made;
  await assert.rejects(r.guestRendezvous({ room: 'x', secret: 'y', trackers: ['wss://dead.never'], WS: Counting, makeOffer: async () => ({ data: {}, accept() {} }), rounds: 1, roundMs: 30 }), /aucun relais|personne/);
  assert.equal(made, before);
  h.close();
});

// ---------- the live values: many of them, all harmless by default ----------
test('tunables: every key sane, defaults are today\'s game, values clamped', async () => {
  const { DEFS, GROUPS, createTunables } = await import('../src/tunables.js');
  const vis = DEFS.filter(d => !d.hidden);
  assert.ok(vis.length >= 55, 'many values: ' + vis.length);
  assert.equal(new Set(DEFS.map(d => d.k)).size, DEFS.length);
  assert.deepEqual(GROUPS, ['corps', 'creuser', 'explosifs', 'temps', 'dangers', 'boutique', 'aliexpresso', 'fêtes', 'mini-jeux', 'planètes']);
  for (const d of vis) {
    assert.ok(d.label && d.g, d.k);
    if (d.options) assert.ok(d.options.some(o => o[0] === d.def), d.k);
    else { assert.ok(d.min <= d.def && d.def <= d.max && d.step > 0, d.k); if (d.unit === '×') assert.equal(d.def, 1, d.k); }
  }
  for (const k of ['dyn', 'sup', 'fus', 'met', 'holy', 'air', 'shell']) assert.ok(DEFS.some(d => d.k === k + 'Radius') && DEFS.some(d => d.k === k + 'Damage'), k);
  const t = createTunables();
  assert.equal(t.get('holyShaft'), 8); assert.equal(t.get('raidBombs'), 10); assert.equal(t.get('stackCap'), 99); assert.equal(t.get('kartLaps'), 4);
  t.set('dynRadius', 99); assert.equal(t.get('dynRadius'), 4);
  t.set('holyShaft', -3); assert.equal(t.get('holyShaft'), 0);
  t.set('selfHurt', 5); assert.equal(t.get('selfHurt'), 1);            // not an option: back to the default
  t.set('selfHurt', 0); assert.equal(t.get('selfHurt'), 0);
  t.set('shopPrice', 'abc'); assert.equal(t.get('shopPrice'), 1);
  assert.deepEqual(t.snapshot(), { dynRadius: 4, holyShaft: 0, selfHurt: 0 });
});

test('tunables in the game: prices, caps, battery, ore and treasure values', async () => {
  globalThis.document.createElement ??= () => ({ getContext: () => null });
  const { tun } = await import('../src/tunables.js');
  const { createEconomy, priceOf, capOf, UPGRADES } = await import('../src/economy.js');
  const eco = createEconomy('t2');
  tun.reset();
  const bat = eco.batteryMax;
  assert.equal(priceOf(123), 123); assert.equal(capOf('dyn'), 99); assert.equal(capOf('holy'), 1);
  eco.add(20); eco.add(20);
  const v0 = eco.sackValue();
  tun.set('shopPrice', 2); tun.set('stackCap', 10); tun.set('batteryCap', 1.5); tun.set('oreValue', 3);
  assert.equal(priceOf(123), 246);
  eco.give('dyn', 50); assert.equal(eco.s.items.dyn, 10);
  assert.equal(eco.batteryMax, bat * 1.5);
  assert.equal(eco.sackValue(), v0 * 3);
  // an upgrade costs the doubled price
  const n = UPGRADES.shovel.levels[1];
  eco.s.money = n.price * 2 - 1; assert.equal(eco.buy('shovel'), 'poor');
  eco.s.money = n.price * 2; assert.equal(eco.buy('shovel'), 'ok'); assert.equal(eco.s.money, 0);
  tun.reset();
  await tick(150);
});

test('admin actions: heal / money / tp / parcel to one or all, treasures back in the log, values saved', () => {
  const r = createRoom();
  const H = fakeLink(true), A = fakeLink(), B = fakeLink();
  for (const [l, n] of [[H, 'h'], [A, 'a'], [B, 'b']]) r.message(r.join(l), { t: 'hello', name: n });
  const saved = [];
  const t = createTunables();
  const adm = roomAdminMod.roomAdmin(r, { tun: t, saveTun: (v) => saved.push(v) });
  assert.equal(adm.calls.act(2, 'money', 500), true);
  assert.deepEqual(last(A, 'admin'), { t: 'admin', a: 'act', act: 'money', v: 500, by: 'le serveur' });
  assert.equal(B.got.filter(m => m.t === 'admin').length, 0);
  adm.calls.act(null, 'heal');
  assert.equal(last(B, 'admin').act, 'heal'); assert.equal(H.got.filter(m => m.t === 'admin').length, 0);
  assert.equal(adm.calls.act(2, 'nuke'), false);   // only the known ones
  adm.calls.refinds();
  assert.equal(r.ops.at(-1).k, 'refinds'); assert.equal(last(A, 'op').op.k, 'refinds');
  adm.calls.set('holyShaft', 20); adm.calls.set('dynRadius', 2);
  assert.deepEqual(saved.at(-1), { holyShaft: 20, dynRadius: 2 });
  assert.deepEqual(last(A, 'tun').v, { holyShaft: 20, dynRadius: 2 });
  adm.calls.reset('holyShaft');
  assert.deepEqual(saved.at(-1), { dynRadius: 2 });
});

test('build-static.sh: a self-contained folder, no server, every module versioned', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-static-'));
  const { execFileSync } = await import('node:child_process');
  try {
    const log = execFileSync(path.join(ROOT, 'build-static.sh'), [out], { cwd: ROOT }).toString();
    assert.match(log, /static v\d+/);
    for (const f of ['index.html', 'serveur.html', 'style.css', 'src/main.js', 'src/rendezvous.js', 'vendor/three.module.min.js', '_headers', '_redirects']) assert.ok(fs.existsSync(path.join(out, f)), f);
    assert.match(fs.readFileSync(path.join(out, 'src/config.js'), 'utf8'), /serverless: ?(true|!0)/);   // minified or not
    assert.match(fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8'), /serverless: false/);   // the source stays as is
    const v = /static v(\d+)/.exec(log)[1];
    assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), new RegExp(`src="\\./src/main\\.js\\?v=${v}"`));
    // every import, static or import() (the games come on demand), versioned — minified or not
    for (const f of fs.readdirSync(path.join(out, 'src'), { recursive: true })) {
      if (!f.endsWith('.js')) continue;
      const s = fs.readFileSync(path.join(out, 'src', f), 'utf8');
      assert.ok(!/(from\s*|import\s*\(\s*)["']\.{1,2}\/[a-z0-9/-]+\.js["']/.test(s), f + ' has an unversioned import');
    }
    assert.match(fs.readFileSync(path.join(out, 'src/games.js'), 'utf8'), new RegExp(`import\\(\\s*["']\\./kart\\.js\\?v=${v}["']`));
    assert.match(fs.readFileSync(path.join(out, '_headers'), 'utf8'), /\/src\/\*\n\s+Content-Type: text\/javascript/);
    // and deploy.sh keeps its interface: dist/, port 8765, the same versioning and minifying
    const deploy = fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8');
    assert.match(deploy, /node server\.mjs --port 8765 --dir dist/);
    assert.match(deploy, /node tools\/minify\.mjs dist/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('mode: a static build is serverless without asking; otherwise the guest book tells', async () => {
  const { serverless } = await import('../src/mode.js');
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, headers: { get: () => 'text/html' } });
  try { assert.equal(await serverless(), true); } finally { globalThis.fetch = real; }
});

test.after(() => setTimeout(() => process.exit(0), 50));
