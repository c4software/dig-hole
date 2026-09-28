// room.js, a room for digging together: the list of changes to its ground (replayed to
// late diggers), who is in, and the passing messages relayed between them. No Node, no DOM:
// server.mjs runs it behind WebSockets, a host's tab runs it behind WebRTC data channels.
// A link is what the room talks through: { send(str, msg), close?(), owner? }.

export const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, n);
export const MAX_OPS = 80000;

// ids shared by every room of a process (the server numbers diggers across rooms)
export function idCounter(start = 1) { let n = start; return () => n++; }

export function createRoom({
  name = 'jardin', ops = [], maxOps = MAX_OPS,
  superPw = null,            // a password for the super reset; null: only the room's owner may
  superMs = 15000,
  newId = idCounter(),
  now = () => Date.now(), later = (f, ms) => setTimeout(f, ms),
  tun = null,                // live values set by the owner (tunables.js), sent to every newcomer
  notes = null,              // the guest book, when the room keeps it (p2p); the server keeps its own
  log = () => {},
} = {}) {
  const clients = new Map();   // id → client { link, me }
  let dirty = false, nextColor = 0, superAt = 0;

  const out = (msg) => JSON.stringify(msg);
  const to = (c, msg) => { if (c) c.link.send(out(msg), msg); };
  function others(from, msg) {
    const s = out(msg);
    for (const c of clients.values()) if (c !== from) c.link.send(s, msg);
  }
  function all(msg) { others(null, msg); }

  function join(link) { return { link, me: null }; }

  // things dropped on the ground and not yet picked up: the room decides who gets each one
  const drops = new Set();
  const scan = () => { drops.clear(); for (const o of ops) track(o); };
  function track(o) { if (o.k === 'reset') drops.clear(); else if (o.k === 'drop') drops.add(o.id); else if (o.k === 'take') drops.delete(o.id); }
  scan();
  // an op into the log and out to the others (from: null → to everyone). A take is the only
  // one echoed to its sender too: the first take of a drop wins, the later ones are dropped.
  function record(op, from, by) {
    if (op.k === 'take') {
      if (typeof op.id !== 'string' || !drops.has(op.id)) { if (from) to(from, { t: 'op-no', id: op.id }); return; }
      op = { k: 'take', id: op.id, tok: String(op.tok || '').slice(0, 16), by };
      drops.delete(op.id); ops.push(op); dirty = true;
      all({ t: 'op', op });
      return;
    }
    if (op.k === 'drop' && (typeof op.id !== 'string' || drops.has(op.id))) return;
    // a reset wipes the room's history: the new map starts from its seed
    if (op.k === 'reset') { ops.length = 0; ops.push(op); dirty = true; track(op); }
    else if (ops.length < maxOps) { ops.push(op); dirty = true; track(op); }
    others(from, { t: 'op', op });
  }

  function message(c, m) {
    if (!m || typeof m !== 'object') return;
    const me = c.me;
    if (m.t === 'hello' && !me) {
      c.me = { id: newId(), name: clean(m.name, 10) || 'creuseur', color: nextColor++, p: [0, 0, -11.5], yaw: 0, w: 'home' };
      clients.set(c.me.id, c);
      const w = { t: 'welcome', id: c.me.id, color: c.me.color, room: name, ops, players: [...clients.values()].filter(o => o !== c).map(o => o.me) };
      if (tun) w.tun = tun;
      const owner = [...clients.values()].find(o => o.link.owner);
      if (owner) w.host = owner.me.id;
      to(c, w);
      others(c, { t: 'join', ...c.me });
      return;
    }
    if (!me) return;
    if (m.t === 'state') {
      me.p = m.p; me.yaw = m.yaw; me.w = m.w; me.g = typeof m.g === 'string' ? m.g.slice(0, 16) : null;
      others(c, { t: 'state', id: me.id, p: m.p, yaw: m.yaw, w: m.w, dig: !!m.dig, g: me.g });
    } else if (m.t === 'superreset') {
      const ok = superPw != null ? String(m.pw || '').trim().toLowerCase() === superPw : !!c.link.owner;
      if (!ok) { to(c, { t: 'superreset-denied' }); return; }
      if (superAt && now() < superAt) return;        // already counting down
      const seed = Math.floor(Math.random() * 1e9);
      superAt = now() + superMs;
      all({ t: 'superreset', in: superMs, seed, by: me.name });
      // when it goes off, the room's history is gone: late comers start from the new seed too
      later(() => { ops.length = 0; ops.push({ k: 'reset', seed, all: true }); drops.clear(); dirty = true; superAt = 0; }, superMs);
      log(`super reset by ${me.name}`);
    } else if (m.t === 'fx' && m.fx && typeof m.fx === 'object') {
      // a laser shot, a paint blob: passed on, never kept
      others(c, { t: 'fx', id: me.id, fx: m.fx });
    } else if (m.t === 'op' && m.op && typeof m.op === 'object') {
      record(m.op, c, me.id);
    } else if (m.t === 'notes' && notes) {
      // the guest book, asked through the room: { t:'notes', rid, text?, name? }
      const r = m.text != null ? notePost(notes, m, { key: me.id, now: now() }) : { code: 200, body: noteList(notes) };
      if (r.code === 200 && m.text != null) dirty = true;
      to(c, { t: 'notes', rid: m.rid, code: r.code, body: r.body });
    }
  }

  function leave(c) {
    if (!c.me || clients.get(c.me.id) !== c) return;
    clients.delete(c.me.id);
    others(c, { t: 'leave', id: c.me.id });
  }

  return {
    name, clients, join, message, leave,
    get ops() { return ops; },
    get dirty() { return dirty; }, set dirty(v) { dirty = v; },
    get size() { return clients.size; },
    get tun() { return tun; },
    get notes() { return notes; },
    // ---------- the owner's hand: only called by the host's own code, never from a message ----------
    setTun(v) { tun = v && Object.keys(v).length ? v : null; dirty = true; all({ t: 'tun', v: tun || {} }); },
    broadcast(msg) { all(msg); },
    // a change to the ground made by the host's own hand (a dedicated server tab has no game to send it)
    op(op) { record(op, null, 0); },
    // gifts from the host: to one digger (id) or to everyone but the host (id null)
    give(id, gift, by = 'l\'hôte') {
      const msg = { t: 'admin', a: 'give', gift, by };
      if (id == null) { for (const c of clients.values()) if (!c.link.owner) to(c, msg); return true; }
      const c = clients.get(id);
      if (!c) return false;
      to(c, msg);
      return true;
    },
    get drops() { return drops; },
    kick(id, why = 'renvoyé par l\'hôte') {
      const c = clients.get(id);
      if (!c || c.link.owner) return false;
      to(c, { t: 'kicked', why });
      leave(c);
      c.me = null;
      try { c.link.close?.(); } catch {}
      return true;
    },
    players() { return [...clients.values()].map(c => ({ ...c.me, owner: !!c.link.owner })); },
  };
}

// ---------- the guest book on the table in the house ----------
export const noteList = (list) => list.slice(-40).reverse();
// posts a note to a list; key: who posts (an ip, a digger's id), lastPost: key → time
const lastPosts = new Map();
export function notePost(list, m, { key, now = Date.now(), lastPost = lastPosts } = {}) {
  const text = String(m?.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (!text) return { code: 400, body: { error: 'vide' } };
  if (now - (lastPost.get(key) || 0) < 8000) return { code: 429, body: { error: 'doucement' } };
  lastPost.set(key, now);
  list.push({ name: clean(m.name, 10) || 'anonyme', text, at: now });
  if (list.length > 300) list.splice(0, list.length - 300);
  return { code: 200, body: { ok: true } };
}
