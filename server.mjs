// server.mjs, serves the game and hosts the rooms for digging together.
//   node server.mjs [--port 8765] [--dir dist]
// Each room keeps the list of changes made to its ground, so a late digger replays
// them on the same seed and sees the same hole. Rooms are saved to data/rooms/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createRoom, idCounter, clean, notePost, noteList } from './src/room.js';
import { createSignal } from './src/signal.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 8765);
const ROOT = path.resolve(arg('--dir', '.'));
const DATA = path.resolve('data/rooms');
fs.mkdirSync(DATA, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

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
const rooms = new Map();   // name → room (src/room.js)
const newId = idCounter();

function room(name) {
  if (rooms.has(name)) return rooms.get(name);
  let ops = [];
  try { ops = JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8')); } catch {}
  const r = createRoom({ name, ops, superPw: SUPER_PW, superMs: SUPER_MS, newId, log: console.log });
  rooms.set(name, r);
  return r;
}
setInterval(() => {
  for (const [name, r] of rooms) {
    if (r.dirty) { fs.writeFile(path.join(DATA, name + '.json'), JSON.stringify(r.ops), () => {}); r.dirty = false; }
    if (!r.size && !r.dirty) rooms.delete(name);
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

server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url, 'http://x').pathname;
  const to = p === '/ws' ? wss : p === '/sig' ? wsig : null;
  if (!to) { socket.destroy(); return; }
  to.handleUpgrade(req, socket, head, (ws) => to.emit('connection', ws, req));
});

server.listen(PORT, '0.0.0.0', () => console.log(`a hole · http://0.0.0.0:${PORT} · serving ${ROOT}`));
