// server.mjs, serves the game and hosts the rooms for digging together.
//   node server.mjs [--port 8765] [--dir dist] [--admin-token <jeton>]
// The admin door (/admin, admin.mjs, serveur.html?admin=…) opens with a token: --admin-token,
// or DIG_ADMIN_TOKEN, or the one kept in data/admin-token (made on the first start).
// Each room keeps the list of changes made to its ground, so a late digger replays
// them on the same seed and sees the same hole. Rooms are saved to data/rooms/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createRoom, idCounter, clean, notePost, noteList } from './src/room.js';
import { createSignal } from './src/signal.js';
import { createTunables } from './src/tunables.js';
import { roomAdmin } from './src/roomadmin.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 8765);
const ROOT = path.resolve(arg('--dir', '.'));
const DATA = path.resolve('data/rooms');
fs.mkdirSync(DATA, { recursive: true });
const PRIVATE = path.resolve('data');

// ---------- the admin token ----------
const TOKEN_FILE = path.join(PRIVATE, 'admin-token');
let ADMIN_TOKEN = arg('--admin-token', process.env.DIG_ADMIN_TOKEN || '');
if (!ADMIN_TOKEN) {
  try { ADMIN_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); fs.chmodSync(TOKEN_FILE, 0o600); } catch {}
  if (!ADMIN_TOKEN) { ADMIN_TOKEN = crypto.randomBytes(24).toString('base64url'); fs.writeFileSync(TOKEN_FILE, ADMIN_TOKEN + '\n', { mode: 0o600 }); }
  console.log(`console admin · jeton dans ${TOKEN_FILE}`);
}
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const tokenOk = (t) => typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(ADMIN_TOKEN));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

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
  if (req.method === 'GET') return json(200, noteList(notesOf(room)));
  if (req.method !== 'POST') return json(405, {});
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    let m; try { m = JSON.parse(body); } catch { return json(400, { error: 'bad' }); }
    const list = notesOf(room);
    const r = notePost(list, m, { key: req.socket.remoteAddress, lastPost });
    if (r.code === 200) fs.writeFile(path.join(NOTES, room + '.json'), JSON.stringify(list), () => {});
    json(r.code, r.body);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/notes') return api(req, res, url);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  // never the server's own data (the admin token, the rooms), even when serving the repo itself
  const hidden = (d) => file === d || file.startsWith(d + path.sep);
  if (!file.startsWith(ROOT) || hidden(PRIVATE) || hidden(path.join(ROOT, 'data'))) { res.writeHead(403).end(); return; }
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
const rooms = new Map();   // name → room (src/room.js)
const newId = idCounter();

function room(name) {
  if (rooms.has(name)) return rooms.get(name);
  let ops = [];
  try { ops = JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8')); } catch {}
  // the live values set from the admin console, kept apart from the ground's history
  let tun = null;
  try { tun = JSON.parse(fs.readFileSync(path.join(DATA, name + '.tun.json'), 'utf8')); } catch {}
  const r = createRoom({ name, ops, superPw: SUPER_PW, superMs: SUPER_MS, newId, log: console.log, tun: tun && Object.keys(tun).length ? tun : null });
  const reg = createTunables(); reg.load(tun || {});
  r.admins = 0;
  r.admin = roomAdmin(r, {
    tun: reg, notes: notesOf(name),
    saveTun: (v) => fs.writeFile(path.join(DATA, name + '.tun.json'), JSON.stringify(v), () => {}),
    saveNotes: () => fs.writeFile(path.join(NOTES, name + '.json'), JSON.stringify(notesOf(name)), () => {}),
  });
  rooms.set(name, r);
  return r;
}
setInterval(() => {
  for (const [name, r] of rooms) {
    if (r.dirty) { fs.writeFile(path.join(DATA, name + '.json'), JSON.stringify(r.ops), () => {}); r.dirty = false; }
    if (!r.size && !r.dirty && !r.admins) rooms.delete(name);
  }
}, 10000);

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  let c = null, r = null;
  const link = { send(s) { if (ws.readyState === 1) ws.send(s); }, close() { ws.close(); } };
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'hello' && !c) {
      r = room('jardin');   // a single garden, shared by everyone
      c = r.join(link);
    }
    if (c) r.message(c, m);
  });
  ws.on('close', () => { if (c) r.leave(c); });
});

// ---------- signaling: a host's tab and its guests find each other (webrtc), then talk directly ----------
const sig = createSignal();
const wsig = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
wsig.on('connection', (ws) => {
  const peer = sig.connect({ send(s) { if (ws.readyState === 1) ws.send(s); }, close() { ws.close(); } });
  ws.on('message', (data) => peer.message(String(data)));
  ws.on('close', () => peer.close());
});

// ---------- the admin door: the token first, then the owner's calls on a room ----------
const wadm = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
wadm.on('connection', (ws, req) => {
  const name = clean(new URL(req.url, 'http://x').searchParams.get('room'), 16).toLowerCase().replace(/ /g, '-') || 'jardin';
  let r = null, push = 0;
  const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const state = () => send({ t: 'state', snap: r.admin.snap() });
  const late = setTimeout(() => ws.close(), 8000);
  ws.on('message', async (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!r) {
      if (m.t !== 'auth') return;
      clearTimeout(late);
      // a wrong token: told after a pause, then shown the door
      if (!tokenOk(m.token)) { console.log('admin : jeton refusé'); setTimeout(() => { send({ t: 'auth-no' }); ws.close(); }, 500); return; }
      r = room(name); r.admins++;
      send({ t: 'auth-ok', room: name });
      state();
      push = setInterval(state, 1000);
      return;
    }
    if (m.t !== 'call') return;
    const fn = r.admin.calls[m.fn];
    if (!fn) { send({ t: 'ret', id: m.id, err: 'inconnu : ' + m.fn }); return; }
    try { send({ t: 'ret', id: m.id, v: await fn(...(Array.isArray(m.args) ? m.args : [])) }); }
    catch (e) { send({ t: 'ret', id: m.id, err: String(e.message || e) }); }
    if (m.fn !== 'players' && m.fn !== 'values' && m.fn !== 'notes') { console.log(`admin : ${m.fn} ${JSON.stringify(m.args || []).slice(0, 120)}`); state(); }
  });
  ws.on('close', () => { clearTimeout(late); clearInterval(push); if (r) r.admins--; });
});

server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url, 'http://x').pathname;
  const to = p === '/ws' ? wss : p === '/sig' ? wsig : p === '/admin' ? wadm : null;
  if (!to) { socket.destroy(); return; }
  to.handleUpgrade(req, socket, head, (ws) => to.emit('connection', ws, req));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`a hole · http://0.0.0.0:${PORT} · serving ${ROOT}`);
  // in a container (DIG_SHOW_TOKEN=1, set by the image) the logs are the only easy way to read the token
  if (process.env.DIG_SHOW_TOKEN === '1' || process.argv.includes('--show-token')) {
    const lines = ['console admin', '', `jeton  ${ADMIN_TOKEN}`, '', `web    http://<hôte>:${PORT}/serveur.html?admin`, 'cli    docker exec -it <conteneur> node admin.mjs'];
    const w = Math.max(...lines.map(l => l.length)) + 4;
    console.log('\n╔' + '═'.repeat(w) + '╗\n' + lines.map(l => '║  ' + l.padEnd(w - 2) + '║').join('\n') + '\n╚' + '═'.repeat(w) + '╝\n');
  }
});
