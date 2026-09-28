// p2p.js, a tab as the server: the host's tab runs the room (room.js) and each guest talks
// to it over its own WebRTC link (rtc.js), a star around the host. Guests find the host
// through the node server's /sig when there is one, or with an invitation code to paste.
// The host's world is kept in its IndexedDB, per room name, and goes back up on the next host.
import { createRoom } from './room.js';
import { tun } from './tunables.js';
import { createOffer, answerOffer, pipeSocket, watchIce, decode } from './rtc.js';
import { roomKey } from './signal.js';

export const P2P_BC = 'a-hole-p2p';       // same browser: a guest tab hands its answer to the host tab
export const ADMIN_BC = 'a-hole-admin';   // a second window showing the host's panel
const MAX_MSG = 64 * 1024;

// ---------- the host's disk: one record per room ----------
const DB = 'a-hole-p2p', STORE = 'rooms';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function loadWorld(name) {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).get(name); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; }
}
export async function saveWorld(name, data) {
  try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(data, name); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch { return false; }
}
export async function listWorlds() {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch { return []; }
}
// a world as a file, and back
export const worldFile = (name, w) => ({ game: 'a-hole', v: 1, room: name, at: Date.now(), ops: w.ops || [], tun: w.tun || null, notes: w.notes || [] });
export function readWorldFile(obj) {
  if (!obj || obj.game !== 'a-hole' || !Array.isArray(obj.ops)) throw new Error('ce fichier n\'est pas un monde');
  return { ops: obj.ops.filter(o => o && typeof o === 'object'), tun: obj.tun && typeof obj.tun === 'object' ? obj.tun : null, notes: Array.isArray(obj.notes) ? obj.notes : [] };
}
export function download(filename, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- signaling on the node server, when it's there ----------
export const sigUrl = () => (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/sig';
export function probeSig(ms = 2500) {
  return new Promise((res) => {
    let ws;
    try { ws = new WebSocket(sigUrl()); } catch { res(null); return; }
    const t = setTimeout(() => { try { ws.close(); } catch {} res(null); }, ms);
    ws.onopen = () => { clearTimeout(t); res(ws); };
    ws.onerror = () => { clearTimeout(t); res(null); };
  });
}
export const joinUrl = (code) => location.origin + location.pathname.replace(/[^/]*$/, '') + '?join=' + encodeURIComponent(code);

// ---------- a socket to a room in this same tab ----------
function localSocket(room, owner) {
  const s = { readyState: 0, onopen: null, onclose: null, onerror: null, onmessage: null };
  const link = { owner, send: (str) => queueMicrotask(() => { if (s.readyState === 1) s.onmessage?.({ data: str }); }), close() { s.close(); } };
  const c = room.join(link);
  s.send = (str) => queueMicrotask(() => { if (s.readyState !== 1) return; let m; try { m = JSON.parse(str); } catch { return; } room.message(c, m); });
  s.close = () => { if (s.readyState === 3) return; s.readyState = 3; room.leave(c); s.onclose?.(); };
  queueMicrotask(() => { s.readyState = 1; s.onopen?.(); });
  return s;
}

// ---------- hosting ----------
// hooks from the game: clock() the garden's clock now, raid(), resetMap()
export async function startHost({ name, nick = 'hôte', hooks = {}, useSig = true } = {}) {
  name = roomKey(name) || 'partie';
  const saved = await loadWorld(name) || {};
  tun.load(saved.tun || {});
  const room = createRoom({ name, ops: saved.ops || [], tun: saved.tun && Object.keys(saved.tun).length ? saved.tun : null, notes: saved.notes || [], superPw: null });
  const subs = new Set();
  const changed = () => { for (const f of subs) { try { f(); } catch (e) { console.error(e); } } };
  const guests = new Map();   // key → { key, via, state, id, name, pc, pipe, offer }
  let gKey = 0;
  const sig = { state: useSig ? 'probe' : 'off', ws: null, code: null };

  // ---------- persistence ----------
  const save = () => { if (!room.dirty) return; room.dirty = false; saveWorld(name, { ops: room.ops, tun: room.tun, notes: room.notes, at: Date.now() }); };
  setInterval(save, 4000);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // ---------- live values: the host's registry is the truth, the room hands it out ----------
  let tunT = 0, tunTimer = 0;
  const pushTun = () => { tunT = performance.now(); tunTimer = 0; room.setTun(tun.snapshot()); changed(); };
  tun.on((k) => {
    // the clock's pace changed: anchored where it is now, so it doesn't jump
    if (k === 'timeSpeed' && hooks.clock) { tun.set('clockAnchor', [Date.now(), hooks.clock(), tun.get('timeSpeed')]); return; }
    if (JSON.stringify(tun.snapshot()) === JSON.stringify(room.tun || {})) return;
    // a slider dragged: ten updates a second at most, the last one always goes
    if (performance.now() - tunT > 100) pushTun(); else if (!tunTimer) tunTimer = setTimeout(pushTun, 110);
  });

  // ---------- a guest's link, whatever found it ----------
  function attach(g, pipe) {
    g.pipe = pipe;
    const link = { send: (s, m) => pipe.send(s, m), close: () => pipe.close() };
    const c = room.join(link);
    pipe.onopen = () => { g.state = 'on'; changed(); };
    if (pipe.open) g.state = 'on';
    pipe.onmessage = (s) => {
      if (s.length > MAX_MSG) return;
      let m; try { m = JSON.parse(s); } catch { return; }
      const had = !!c.me;
      room.message(c, m);
      if (!had && c.me) { g.id = c.me.id; g.name = c.me.name; changed(); }
    };
    pipe.onclose = () => { room.leave(c); if (g.state !== 'kicked') g.state = 'gone'; changed(); setTimeout(() => { guests.delete(g.key); changed(); }, 8000); };
  }
  function newGuest(via) {
    const g = { key: ++gKey, via, state: 'invite', id: null, name: null, at: Date.now() };
    guests.set(g.key, g);
    return g;
  }
  async function offerFor(g) {
    const o = await createOffer({ r: name, n: nick });
    g.pc = o.pc; g.offer = o; g.id8 = o.id;
    attach(g, o.pipe);
    watchIce(o.pc, (st) => {
      if (st === 'connecting' || st === 'checking') { if (g.state === 'invite' || g.state === 'answered') { g.state = 'connecting'; changed(); } }
      else if (st === 'failed') { g.state = 'failed'; changed(); }
    });
    return o;
  }

  // ---------- invitations to paste ----------
  async function invite() {
    const g = newGuest('code');
    changed();
    const o = await offerFor(g);
    g.code = o.code;
    changed();
    return { key: g.key, code: o.code, link: joinUrl(o.code) };
  }
  async function accept(answer, key) {
    const a = await decode(answer);
    if (a.k !== 'a') throw new Error('ce n\'est pas une réponse d\'invité');
    const g = [...guests.values()].find(x => x.offer && (x.offer.id === a.i || (key && x.key === key)));
    if (!g) throw new Error('cette réponse ne correspond à aucune invitation');
    if (g.state !== 'invite') return g;
    await g.offer.accept(a);
    g.state = 'answered'; g.name = a.n || g.name;
    changed();
    return g;
  }
  // same browser: the guest tab posts its answer here, no paste needed
  let bc = null;
  try {
    bc = new BroadcastChannel(P2P_BC);
    bc.onmessage = (e) => { const m = e.data; if (m?.t === 'answer' && m.r === name) accept(m.code).catch(() => {}); if (m?.t === 'who') bc.postMessage({ t: 'hosting', r: name, n: nick }); };
  } catch {}

  // ---------- the node server's matchmaking ----------
  async function sigConnect() {
    const ws = await probeSig();
    if (!ws) { sig.state = 'off'; changed(); return; }
    sig.ws = ws;
    sig.state = 'wait';
    changed();
    const byGid = new Map();
    ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'hosting') { sig.state = 'on'; sig.code = '@' + m.room; changed(); }
      else if (m.t === 'err') { sig.state = m.e === 'pris' ? 'taken' : 'off'; changed(); }
      else if (m.t === 'guest') {
        const g = newGuest('sig');
        byGid.set(m.gid, g);
        try { const o = await offerFor(g); ws.send(JSON.stringify({ t: 'to', gid: m.gid, d: o.code })); } catch { g.state = 'failed'; }
        changed();
      } else if (m.t === 'sig') {
        const g = byGid.get(m.gid);
        if (g?.offer && g.state === 'invite') { try { const a = await decode(m.d); await g.offer.accept(a); g.state = 'answered'; g.name = a.n || null; } catch { g.state = 'failed'; } changed(); }
      } else if (m.t === 'gone') {
        const g = byGid.get(m.gid); byGid.delete(m.gid);
        // the guest left the matchmaker: fine once connected, a failure before
        if (g && g.state !== 'on') { g.state = 'failed'; try { g.pc?.close(); } catch {} changed(); }
      }
    };
    ws.onclose = () => { sig.ws = null; if (sig.state !== 'taken') { sig.state = 'off'; sig.code = null; changed(); setTimeout(sigConnect, 15000); } };
    ws.send(JSON.stringify({ t: 'host', room: name }));
  }
  if (useSig) sigConnect();

  const host = {
    name, room, guests, sig,
    get ops() { return room.ops.length; },
    // the host's own game: a socket straight into the room
    socket: () => localSocket(room, true),
    invite, accept,
    cancel(key) { const g = guests.get(key); if (!g) return; try { g.pipe?.close(); g.pc?.close(); } catch {} guests.delete(key); changed(); },
    kick(id) { const g = [...guests.values()].find(x => x.id === id); if (g) g.state = 'kicked'; const ok = room.kick(id); changed(); return ok; },
    raid() { room.broadcast({ t: 'admin', a: 'raid' }); },
    // a gift (drops.js bundle) to one digger, or to everyone but the host (id null)
    give(id, gift) { return room.give(id, gift, nick); },
    resetMap() { if (hooks.resetMap) hooks.resetMap(); else room.op({ k: 'reset', seed: Math.floor(Math.random() * 1e9) }); },
    players() { return room.players(); },
    exportWorld() { download(`a-hole-${name}.json`, worldFile(name, { ops: room.ops, tun: room.tun, notes: room.notes })); },
    worldData() { return worldFile(name, { ops: room.ops, tun: room.tun, notes: room.notes }); },
    // a world from a file: saved as this room's, and the room starts again from it
    async importWorld(obj) { const w = readWorldFile(obj); room.dirty = false; await saveWorld(name, { ...w, at: Date.now() }); room.broadcast({ t: 'kicked', why: 'l\'hôte charge un autre monde · reviens dans un instant' }); setTimeout(() => location.reload(), 300); },
    save,
    on(f) { subs.add(f); return () => subs.delete(f); },
    // what the panel shows, also sent to a second window
    snap() {
      return {
        room: name, ops: room.ops.length, values: tun.snapshot(),
        players: room.players().map(p => ({ id: p.id, name: p.name, color: p.color, owner: p.owner, w: p.w })),
        guests: [...guests.values()].map(g => ({ key: g.key, via: g.via, state: g.state, name: g.name, id: g.id, code: g.state === 'invite' && g.via === 'code' ? g.code : null })),
        sig: { state: sig.state, code: sig.code, link: sig.code ? joinUrl(sig.code) : null },
      };
    },
  };
  adminBridge(host);
  return host;
}

// ---------- the host's panel in another window of the same browser ----------
function adminBridge(host) {
  let bc;
  try { bc = new BroadcastChannel(ADMIN_BC); } catch { return; }
  const push = () => bc.postMessage({ t: 'state', snap: host.snap() });
  let pend = 0;
  host.on(() => { if (!pend) pend = setTimeout(() => { pend = 0; push(); }, 60); });
  setInterval(push, 2000);
  const calls = {
    set: (k, v) => tun.set(k, v), reset: (k) => tun.reset(k), kick: (id) => host.kick(id), raid: () => host.raid(), resetMap: () => host.resetMap(), give: (id, g) => host.give(id, g),
    invite: () => host.invite(), accept: (code) => host.accept(code).then(() => true), cancel: (key) => host.cancel(key),
    worldData: () => host.worldData(), importWorld: (obj) => host.importWorld(obj),
  };
  bc.onmessage = async (e) => {
    const m = e.data;
    if (m?.t === 'ping') push();
    else if (m?.t === 'call' && calls[m.fn]) {
      try { bc.postMessage({ t: 'ret', id: m.id, v: await calls[m.fn](...(m.args || [])) }); }
      catch (err) { bc.postMessage({ t: 'ret', id: m.id, err: String(err.message || err) }); }
    }
  };
}

// a stand-in for the host, from a second window: same calls, answered over the channel
export function remoteHost(onSnap) {
  const bc = new BroadcastChannel(ADMIN_BC);
  const waits = new Map();
  let n = 0, last = null;
  bc.onmessage = (e) => {
    const m = e.data;
    if (m?.t === 'state') { last = m.snap; onSnap(m.snap); }
    else if (m?.t === 'ret') { const w = waits.get(m.id); waits.delete(m.id); if (w) m.err ? w.rej(new Error(m.err)) : w.res(m.v); }
  };
  const call = (fn, ...args) => new Promise((res, rej) => { const id = ++n; waits.set(id, { res, rej }); bc.postMessage({ t: 'call', id, fn, args }); setTimeout(() => { if (waits.delete(id)) rej(new Error('l\'onglet hôte ne répond pas')); }, 20000); });
  bc.postMessage({ t: 'ping' });
  return {
    remote: true,
    get last() { return last; },
    ping: () => bc.postMessage({ t: 'ping' }),
    set: (k, v) => call('set', k, v), reset: (k) => call('reset', k), kick: (id) => call('kick', id), raid: () => call('raid'), resetMap: () => call('resetMap'), give: (id, g) => call('give', id, g),
    invite: () => call('invite'), accept: (code) => call('accept', code), cancel: (key) => call('cancel', key),
    exportWorld: async () => { const w = await call('worldData'); download(`a-hole-${w.room}.json`, w); },
    importWorld: (obj) => call('importWorld', obj),
    close: () => bc.close(),
  };
}

// ---------- joining ----------
// join: '@room' through the node server, or an invitation code (or a link holding one).
// onStep(what, data): 'sig' | 'offer' {host, room} | 'answer' {code} (to hand back) | 'ice' | 'open' | 'error' {why, hint}
export async function joinHost({ join, nick, onStep = () => {} }) {
  join = String(join || '').trim();
  const m = join.match(/[?&#]join=([^&\s]+)/);
  if (m) join = decodeURIComponent(m[1]);
  let ans, sigWs = null;
  if (join.startsWith('@')) {
    onStep('sig');
    sigWs = await probeSig();
    if (!sigWs) throw Object.assign(new Error('pas de serveur pour trouver la partie'), { hint: 'demande à l\'hôte un code d\'invitation à coller' });
    const offer = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('l\'hôte ne répond pas')), 15000);
      sigWs.onmessage = (e) => {
        let x; try { x = JSON.parse(e.data); } catch { return; }
        if (x.t === 'err') { clearTimeout(t); rej(new Error(x.e === 'absent' ? 'aucune partie à ce nom' : x.e === 'plein' ? 'la partie est pleine' : 'l\'hôte est parti')); }
        else if (x.t === 'sig') { clearTimeout(t); res(x.d); }
      };
      sigWs.onclose = () => { clearTimeout(t); rej(new Error('le serveur a coupé')); };
      sigWs.send(JSON.stringify({ t: 'join', room: join.slice(1) }));
    });
    ans = await answerOffer(offer, { n: nick });
    onStep('offer', { host: ans.offer.n, room: ans.offer.r });
    sigWs.send(JSON.stringify({ t: 'to', d: ans.code }));
  } else {
    ans = await answerOffer(join, { n: nick });
    onStep('offer', { host: ans.offer.n, room: ans.offer.r });
    onStep('answer', { code: ans.code });
    // the host's tab may be in this very browser: it takes the answer by itself
    try { const bc = new BroadcastChannel(P2P_BC); bc.postMessage({ t: 'answer', r: ans.offer.r, code: ans.code }); setTimeout(() => bc.close(), 1000); } catch {}
  }
  const failed = new Promise((_, rej) => watchIce(ans.pc, (st) => {
    if (st === 'checking' || st === 'connecting') onStep('ice');
    if (st === 'failed') rej(Object.assign(new Error('la connexion directe a échoué'), { hint: 'vos réseaux ne se voient pas : essayez un serveur turn (réglage), ou le jardin commun sur le serveur' }));
  }));
  const pipe = await Promise.race([ans.pipe, failed]);
  try { sigWs?.close(); } catch {}
  onStep('open');
  return { socket: () => pipeSocket(pipe), room: ans.offer.r, host: ans.offer.n, pc: ans.pc };
}

// ---------- the guest book through the room (a tab hosts: no /api/notes) ----------
// a fetch look-alike for the two calls the game makes
export function notesFetch(net) {
  return async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    const r = await net.ask(body ? { t: 'notes', text: body.text, name: body.name } : { t: 'notes' });
    return { ok: r.code === 200, status: r.code, json: async () => r.body };
  };
}
