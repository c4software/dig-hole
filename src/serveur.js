// serveur.js, the server tab: the host's panel kept open in its own window (it talks to the
// hosting game tab over a BroadcastChannel), or, when no tab hosts, a dedicated server: the
// room runs here, without the game, and whoever wants to dig joins it, the host included.
import { remoteHost, startHost } from './p2p.js';
import { createHostPanel, localBackend } from './hostpanel.js';
import { tun } from './tunables.js';
import { roomKey } from './signal.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY8 = 360 * 8;
// the garden's clock, as the game computes it together (main.js clockNow)
const clock = () => { const a = tun.get('clockAnchor'); return a ? ((a[1] + (Date.now() - a[0]) / 1000 * a[2]) % DAY8 + DAY8) % DAY8 : (Date.now() / 1000) % DAY8; };

// a hosting tab in this browser? then this window is its panel
let panel = null, seen = 0;
const remote = remoteHost((snap) => {
  seen = Date.now();
  if (params.get('room') && snap.room !== roomKey(params.get('room'))) return;
  if (!panel) { wait.remove(); panel = createHostPanel({ backend: { ...remote, snap: () => remote.last }, page: true }); }
  panel.render(snap);
  document.title = `A Hole | serveur · ${snap.room}`;
});
setInterval(() => { if (panel && remote.last && Date.now() - seen > 5000) panel.el.querySelector('#hp-err').textContent = 'l\'onglet hôte ne répond plus : fermé ?'; }, 2000);

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
  remote.close();
  const host = await startHost({ name: roomKey(name) || 'ma-partie', nick: 'serveur', hooks: { clock } });
  window.__host = host;
  wait.remove();
  panel = createHostPanel({ backend: localBackend(host), page: true });
  panel.render(host.snap());
  let t = 0;
  host.on(() => { if (!t) t = setTimeout(() => { t = 0; panel.render(host.snap()); }, 50); });
  document.title = `A Hole | serveur dédié · ${host.name}`;
  addEventListener('beforeunload', (e) => { if (host.room.size) { e.preventDefault(); e.returnValue = ''; } });
}
