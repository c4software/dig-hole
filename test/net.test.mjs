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
  async setLocalDescription(d) { this.localDescription = d; PCS.set(d.sdp.trim(), this); }
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
  assert.deepEqual(Object.keys(w), ['t', 'id', 'color', 'room', 'ops', 'players']);
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
  const host = await p2p.startHost({ name: 'Test Room', nick: 'hôte', useSig: false, hooks: { clock: () => 100 } });
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

test('p2p: an invitation that fails (nat), a pasted answer', async () => {
  const host = await p2p.startHost({ name: 'deux', nick: 'h', useSig: false });
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
  const norm = (m) => (m.t === 'welcome' ? { ...m, id: 'ID', players: m.players.map(p => ({ ...p, id: 'ID' })), ops: m.ops.length } : m.id ? { ...m, id: 'ID' } : m);
  return { a: a.got.map(norm), b: b.got.map(norm) };
}
test('server.mjs: same messages as the old server, and /sig', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-'));
  const tmpOld = fs.mkdtempSync(path.join(os.tmpdir(), 'ahole-old-'));
  // the server as it was before this change, from git
  const { execSync } = await import('node:child_process');
  const old = execSync('git show fe38c93:server.mjs', { cwd: ROOT }).toString();
  const oldFile = path.join(ROOT, '.old-server-test.mjs');
  fs.writeFileSync(oldFile, old);
  const [ns, os_] = [await run(path.join(ROOT, 'server.mjs'), 18771, tmp), await run(oldFile, 18772, tmpOld)];
  try {
    const now = await script(18771), before = await script(18772);
    assert.deepEqual(now, before);
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
  } finally { ns.kill(); os_.kill(); fs.rmSync(oldFile); for (const d of [tmp, tmpOld]) fs.rmSync(d, { recursive: true, force: true }); }
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
    await assert.rejects(p2p.joinHost({ join: '@personne', nick: 'x' }), /aucune partie/);
    // a second tab hosting the same name gets told
    const h2 = await p2p.startHost({ name: 'sigroom', nick: 'h2' });
    for (let i = 0; i < 40 && h2.sig.state !== 'taken'; i++) await tick(25);
    assert.equal(h2.sig.state, 'taken');
  } finally { location.host = was; srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test.after(() => setTimeout(() => process.exit(0), 50));
