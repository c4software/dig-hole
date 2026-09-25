// server.mjs, serves the game and hosts the rooms for digging together.
//   node server.mjs [--port 8765] [--dir dist]
// Each room keeps the list of changes made to its ground, so a late digger replays
// them on the same seed and sees the same hole. Rooms are saved to data/rooms/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 8765);
const ROOT = path.resolve(arg('--dir', '.'));
const DATA = path.resolve('data/rooms');
fs.mkdirSync(DATA, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, n);

// ---------- the guest book on the table in the house ----------
const NOTES = path.resolve('data/notes');
fs.mkdirSync(NOTES, { recursive: true });
const notes = new Map();
const lastPost = new Map();
function notesOf(room) {
  if (!notes.has(room)) {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(path.join(NOTES, room + '.json'), 'utf8')); } catch {}
    notes.set(room, list);
  }
  return notes.get(room);
}
function api(req, res, url) {
  const room = clean(url.searchParams.get('room'), 16).toLowerCase().replace(/ /g, '-') || 'monde';
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET') return json(200, notesOf(room).slice(-40).reverse());
  if (req.method !== 'POST') return json(405, {});
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    let m; try { m = JSON.parse(body); } catch { return json(400, { error: 'bad' }); }
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!text) return json(400, { error: 'vide' });
    const ip = req.socket.remoteAddress;
    if (Date.now() - (lastPost.get(ip) || 0) < 8000) return json(429, { error: 'doucement' });
    lastPost.set(ip, Date.now());
    const list = notesOf(room);
    list.push({ name: clean(m.name, 10) || 'anonyme', text, at: Date.now() });
    if (list.length > 300) list.splice(0, list.length - 300);
    fs.writeFile(path.join(NOTES, room + '.json'), JSON.stringify(list), () => {});
    json(200, { ok: true });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/notes') return api(req, res, url);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

// ---------- rooms ----------
// the super reset: every world remade, for everyone, after a countdown
const SUPER_PW = process.env.SUPER_PW || 'valentin';
const SUPER_MS = 15000;
const rooms = new Map();   // name → { ops, clients: Map(id → ws), dirty, nextColor }
const MAX_OPS = 80000;

function room(name) {
  if (rooms.has(name)) return rooms.get(name);
  let ops = [];
  try { ops = JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8')); } catch {}
  const r = { ops, clients: new Map(), dirty: false, nextColor: 0 };
  rooms.set(name, r);
  return r;
}
setInterval(() => {
  for (const [name, r] of rooms) {
    if (r.dirty) { fs.writeFile(path.join(DATA, name + '.json'), JSON.stringify(r.ops), () => {}); r.dirty = false; }
    if (!r.clients.size && !r.dirty) rooms.delete(name);
  }
}, 10000);

let nextId = 1;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  let me = null, r = null, rname = null;
  const others = (msg) => { const s = JSON.stringify(msg); for (const c of r.clients.values()) if (c !== ws && c.readyState === 1) c.send(s); };
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'hello' && !me) {
      rname = 'jardin';   // a single garden, shared by everyone
      r = room(rname);
      me = { id: nextId++, name: clean(m.name, 10) || 'creuseur', color: r.nextColor++, p: [0, 0, -11.5], yaw: 0, w: 'home' };
      ws.me = me;
      r.clients.set(me.id, ws);
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, color: me.color, room: rname, ops: r.ops, players: [...r.clients.values()].filter(c => c !== ws).map(c => c.me) }));
      others({ t: 'join', ...me });
      return;
    }
    if (!me) return;
    if (m.t === 'state') {
      me.p = m.p; me.yaw = m.yaw; me.w = m.w; me.g = typeof m.g === 'string' ? m.g.slice(0, 16) : null;
      others({ t: 'state', id: me.id, p: m.p, yaw: m.yaw, w: m.w, dig: !!m.dig, g: me.g });
    } else if (m.t === 'superreset') {
      if (String(m.pw || '').trim().toLowerCase() !== SUPER_PW) { ws.send(JSON.stringify({ t: 'superreset-denied' })); return; }
      if (r.superAt && Date.now() < r.superAt) return;        // already counting down
      const seed = Math.floor(Math.random() * 1e9);
      r.superAt = Date.now() + SUPER_MS;
      const s = JSON.stringify({ t: 'superreset', in: SUPER_MS, seed, by: me.name });
      for (const c of r.clients.values()) if (c.readyState === 1) c.send(s);
      // when it goes off, the room's history is gone: late comers start from the new seed too
      setTimeout(() => { r.ops = [{ k: 'reset', seed, all: true }]; r.dirty = true; r.superAt = 0; }, SUPER_MS);
      console.log(`super reset by ${me.name}`);
    } else if (m.t === 'fx' && m.fx && typeof m.fx === 'object') {
      // a laser shot, a paint blob: passed on, never kept
      others({ t: 'fx', id: me.id, fx: m.fx });
    } else if (m.t === 'op' && m.op && typeof m.op === 'object') {
      // a reset wipes the room's history: the new map starts from its seed
      if (m.op.k === 'reset') { r.ops = [m.op]; r.dirty = true; }
      else if (r.ops.length < MAX_OPS) { r.ops.push(m.op); r.dirty = true; }
      others({ t: 'op', op: m.op });
    }
  });
  ws.on('close', () => {
    if (!me) return;
    r.clients.delete(me.id);
    others({ t: 'leave', id: me.id });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`a hole · http://0.0.0.0:${PORT} · serving ${ROOT}`));
