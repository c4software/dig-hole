// serveur.js, the server tab: the host's panel kept open in its own window (it talks to the
// hosting game tab over a BroadcastChannel), or, when no tab hosts, a dedicated server: the
// room runs here, without the game, and whoever wants to dig joins it, the host included.
import { remoteHost, startHost, download } from './p2p.js';
import { connectAdmin } from './admin-client.js';
import { CONFIG } from './config.js';
import { createHostPanel, localBackend } from './hostpanel.js';
import { tun } from './tunables.js';
import { roomKey } from './signal.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY8 = 360 * 8;
// the garden's clock, as the game computes it together (main.js clockNow)
const clock = () => { const a = tun.get('clockAnchor'); return a ? ((a[1] + (Date.now() - a[0]) / 1000 * a[2]) % DAY8 + DAY8) % DAY8 : (Date.now() / 1000) % DAY8; };

const box = (html) => { const w = document.createElement('div'); w.className = 'hp page'; w.style.cssText = 'padding:18px;max-width:560px;font:500 14px/1.4 Rubik,system-ui,sans-serif;color:#fff;background:#261c14;border-radius:18px;margin:16px auto'; w.innerHTML = html; document.body.appendChild(w); return w; };
const btnCss = 'cursor:pointer;border:0;border-radius:10px;padding:9px 12px;font:800 13px Rubik,system-ui;background:#ffb020;color:#1a130d';
const inCss = 'background:#1a130d;color:#fff;border:0;border-radius:9px;padding:9px 11px;font:600 14px Rubik,system-ui;min-width:260px';

// ---------- serveur.html?admin=ws://host:port&room=jardin: the node server's console ----------
// a static build has no node server to drive
if (params.has('admin') && CONFIG.serverless) box(`<b style="font:400 24px/1 'Titan One',system-ui">pas de serveur ici</b><p style="margin:10px 0;opacity:.75">cette version du jeu tourne sans serveur node : la console du jardin commun n'existe pas. pour régler une partie, héberge-la (f2 dans le jeu) ou ouvre <a style="color:#ffb020" href="serveur.html">serveur.html</a>.</p>`);
else if (params.has('admin')) nodeConsole();
else sameBrowser();

function nodeConsole() {
  const url = params.get('admin') || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  const room = params.get('room') || 'jardin';
  const KEY = 'a-hole-admin:' + url;
  let panel = null, client = null;
  const gate = box('');
  function ask(msg) {
    gate.style.display = '';
    gate.innerHTML = `<b style="font:400 24px/1 'Titan One',system-ui">console du serveur</b>
      <p style="margin:10px 0;opacity:.75">${esc(url)} · salle « ${esc(room)} ». le jeton est dans <code>data/admin-token</code> sur le serveur (ou --admin-token).</p>
      <p><input id="sv-token" type="password" autocomplete="off" placeholder="jeton" style="${inCss}"> <button id="sv-in" style="${btnCss}">entrer</button></p>
      <p style="color:#ff7a56;font-weight:700">${esc(msg || '')}</p>`;
    const go = () => { const t = document.getElementById('sv-token').value.trim(); if (t) open(t); };
    document.getElementById('sv-in').onclick = go;
    document.getElementById('sv-token').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    document.getElementById('sv-token').focus();
  }
  async function open(token) {
    gate.innerHTML = '<p style="opacity:.75">connexion…</p>';
    try { client = await connectAdmin({ url, room, token }); }
    catch (e) { if (/jeton/.test(e.message)) { try { sessionStorage.removeItem(KEY); } catch {} } ask(e.message); return; }
    try { sessionStorage.setItem(KEY, token); } catch {}
    gate.style.display = 'none';   // .hp is display:flex: the hidden attribute alone won't do
    const call = (fn) => (...a) => client.call(fn, ...a);
    const backend = {
      node: true, remote: true, snap: () => client.snap,
      set: call('set'), reset: call('reset'), kick: call('kick'), raid: call('raid'), resetMap: call('resetMap'),
      give: call('give'), say: call('say'), delNote: call('delNote'), act: call('act'), refinds: call('refinds'),
      exportWorld: async () => { const w = await client.call('worldData'); download(`a-hole-${w.room}.json`, w); },
      importWorld: async () => { throw new Error('pas d\'import sur le serveur'); },
    };
    if (!panel) panel = createHostPanel({ backend, page: true });
    if (client.snap) panel.render(client.snap);
    client.onSnap = (snap) => panel.render(snap);
    client.onClose = () => { panel.el.querySelector('#hp-err').textContent = 'déconnecté du serveur · nouvel essai…'; setTimeout(() => open(token), 3000); };
    document.title = `A Hole | console · ${room}`;
  }
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  if (saved) open(saved); else ask();
}

// ---------- a hosting tab in this browser? then this window is its panel ----------
function sameBrowser() {
let panel = null, seen = 0;
const remote = remoteHost((snap) => {
  if (mine || (params.get('room') && snap.room !== roomKey(params.get('room')))) return;
  seen = Date.now();
  if (!panel) { wait.remove(); panel = createHostPanel({ backend: { ...remote, snap: () => remote.last }, page: true }); }
  panel.render(snap);
  document.title = `A Hole | serveur · ${snap.room}`;
});
// (only for a panel of another tab: a dedicated server here is its own host)
let mine = false;
setInterval(() => { if (panel && !mine && seen && Date.now() - seen > 5000) panel.el.querySelector('#hp-err').textContent = 'l\'onglet hôte ne répond plus : fermé ?'; }, 2000);

const wait = document.createElement('div');
wait.className = 'hp page';
wait.style.cssText = 'padding:18px;max-width:560px;font:500 14px/1.4 Rubik,system-ui,sans-serif;color:#fff;background:#261c14;border-radius:18px;margin:16px auto';
wait.innerHTML = `<b style="font:400 24px/1 'Titan One',system-ui">le serveur</b><p style="margin:10px 0;opacity:.75">recherche d'un onglet qui héberge une partie dans ce navigateur…</p>`;
document.body.appendChild(wait);
setTimeout(() => {
  if (panel) return;
  const room = roomKey(params.get('room') || '') || 'ma-partie';
  wait.innerHTML = `<b style="font:400 24px/1 'Titan One',system-ui">aucune partie hébergée ici</b>
    <p style="margin:10px 0;opacity:.75">tu peux héberger depuis le jeu (« à plusieurs » → « héberger une partie »), ou faire de cet onglet un serveur dédié : la partie tourne ici, sans le jeu, et tout le monde la rejoint, toi compris (invite-toi : le lien s'ouvre dans ce navigateur, la réponse revient toute seule).</p>
    <p><input id="sv-room" value="${esc(room)}" maxlength="24" style="background:#1a130d;color:#fff;border:0;border-radius:9px;padding:9px 11px;font:600 14px Rubik,system-ui"> <button id="sv-go" style="cursor:pointer;border:0;border-radius:10px;padding:9px 12px;font:800 13px Rubik,system-ui;background:#ffb020;color:#1a130d">démarrer le serveur ici</button></p>`;
  document.getElementById('sv-go').onclick = () => dedicated(document.getElementById('sv-room').value);
  if (params.has('start')) dedicated(room);
}, 1200);

async function dedicated(name) {
  if (panel) return;
  mine = true;
  remote.close();
  const host = await startHost({ name: roomKey(name) || 'ma-partie', nick: 'serveur', hooks: { clock }, useSig: !CONFIG.serverless });
  window.__host = host;
  wait.remove();
  panel = createHostPanel({ backend: localBackend(host), page: true });
  panel.render(host.snap());
  let t = 0;
  host.on(() => { if (!t) t = setTimeout(() => { t = 0; panel.render(host.snap()); }, 50); });
  document.title = `A Hole | serveur dédié · ${host.name}`;
  addEventListener('beforeunload', (e) => { if (host.room.size) { e.preventDefault(); e.returnValue = ''; } });
}
}
