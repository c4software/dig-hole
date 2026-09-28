// p2p-ui.js, hosting and joining from the title screen: « héberger une partie », « rejoindre »,
// the join card that shows where the connection is at (and the answer to hand back), and,
// in the host's tab, the server panel (f2 or the pause menu).
import { startHost, joinHost, listWorlds, saveWorld, readWorldFile, notesFetch } from './p2p.js';
import { createHostPanel, localBackend } from './hostpanel.js';
import { getTurn, setTurn, parseTurn, turnText } from './rtc.js';
import { roomKey } from './signal.js';
import { serverless } from './mode.js';
import { CONFIG } from './config.js';
import { esc } from './lib/fmt.js';

const CSS = `
.p2p-card { position: fixed; z-index: 70; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
  background: #261c14; color: #fff; border: 3px solid #1a130d; border-radius: 20px; padding: 18px 18px 16px; box-shadow: 0 10px 0 rgba(0,0,0,.35), 0 30px 80px rgba(0,0,0,.6);
  font: 500 14px/1.4 'Rubik', system-ui, sans-serif; }
.p2p-dim { position: fixed; inset: 0; z-index: 69; background: rgba(11,13,18,.55); }
.p2p-card h2 { font: 400 26px/1.05 'Titan One', 'Rubik', system-ui, sans-serif; margin-bottom: 4px; }
.p2p-card .sub { opacity: .7; margin-bottom: 12px; }
.p2p-card label { display: block; font: 900 10.5px/1 'Rubik', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; opacity: .7; margin: 12px 0 6px; }
.p2p-card input, .p2p-card textarea { width: 100%; background: #1a130d; color: #fff; border: 0; border-radius: 10px; padding: 10px 12px; font: 600 14px/1.3 'Rubik', system-ui, sans-serif; outline: none; }
.p2p-card textarea { font: 600 12px/1.3 ui-monospace, monospace; color: #ffdc8f; min-height: 70px; resize: vertical; }
.p2p-card input:focus, .p2p-card textarea:focus { box-shadow: inset 0 0 0 3px #ffb020; }
.p2p-card .acts { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.p2p-card button { cursor: pointer; border: 0; border-radius: 12px; padding: 10px 14px; font: 800 14px/1 'Rubik', system-ui, sans-serif; color: #1a130d; background: #ffb020; box-shadow: 0 4px 0 #6e420c; }
.p2p-card button.ghost { background: #35281c; color: #fff; box-shadow: 0 4px 0 #1a130d; }
.p2p-card button:disabled { opacity: .5; }
.p2p-card .worlds { display: flex; flex-wrap: wrap; gap: 6px; }
.p2p-card .worlds button { padding: 6px 10px; font-size: 12px; background: #35281c; color: #ffdc8f; box-shadow: none; }
.p2p-card .step { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
.p2p-card .dot { width: 12px; height: 12px; border-radius: 50%; background: #35281c; flex: none; }
.p2p-card .dot.go { background: #4a8fe0; animation: p2pblink 1s infinite; } .p2p-card .dot.ok { background: #39c07a; } .p2p-card .dot.bad { background: #ff3d5e; }
@keyframes p2pblink { 50% { opacity: .35; } }
.p2p-card .err { color: #ff7a56; font-weight: 700; margin-top: 8px; } .p2p-card .hint { opacity: .6; font-size: 12.5px; margin-top: 6px; }
.p2p-card details { margin-top: 12px; opacity: .85; } .p2p-card summary { cursor: pointer; font-size: 12.5px; }
.p2p-more { display: flex; gap: 8px; margin-top: 6px; }
/* the two extra buttons make the menu taller: it rises a little, and on short screens the
   quality chip in the corner steps aside rather than sit on « héberger une partie » */
.main-menu:has(#multi-form:not(.hidden)) { top: max(200px, calc(var(--u) * 15.5)); z-index: 3; }
@media (max-height: 860px) { body:has(#multi-form:not(.hidden)) .corner--bl { display: none; } }
.p2p-more button { flex: 1; cursor: pointer; border: 0; border-radius: 12px; padding: 8px 10px; font: 800 13px/1 'Rubik', system-ui, sans-serif; color: #fff; background: rgba(26,19,13,.8); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12); }
.p2p-more button:hover { box-shadow: inset 0 0 0 2px #ffb020; }
`;
function css() { if (!document.getElementById('p2p-css')) { const st = document.createElement('style'); st.id = 'p2p-css'; st.textContent = CSS; document.head.appendChild(st); } }
function card(html) {
  css();
  const dim = document.createElement('div'); dim.className = 'p2p-dim';
  const el = document.createElement('div'); el.className = 'p2p-card'; el.innerHTML = html;
  for (const t of ['keydown', 'keyup', 'mousedown', 'click', 'wheel']) { el.addEventListener(t, (e) => e.stopPropagation()); dim.addEventListener(t, (e) => e.stopPropagation()); }
  document.body.append(dim, el);
  return { el, $: (s) => el.querySelector(s), close() { el.remove(); dim.remove(); } };
}
const nickOf = (nickIn) => { const n = nickIn?.value.trim() || (() => { try { return localStorage.getItem('a-hole-nick'); } catch { return null; } })() || 'creuseur'; try { localStorage.setItem('a-hole-nick', n); } catch {} return n; };
const turnRow = `<details><summary>réseau difficile ? un serveur turn</summary><label>turn (optionnel)</label><input data-turn placeholder="turn:hôte:3478 nom motdepasse" spellcheck="false"></details>`;
function keepTurn(c) { const i = c.$('[data-turn]'); if (!i) return true; if (!i.value.trim()) { setTurn(null); return true; } const t = parseTurn(i.value); if (!t) return false; setTurn(t); return true; }

// ---------- the title screen: two more ways to play together ----------
// returns { serverless, host() }: with no node server, « à plusieurs » is hosting or joining only
export function initP2PMenu({ form, nickIn }) {
  css();
  const menu = { serverless: CONFIG.serverless, host: () => hostCard(nickIn), join: () => joinCard(nickIn) };
  const noServer = () => {
    menu.serverless = true;
    const b = document.querySelector('.m-opt[data-mode="multi"]');
    if (b) b.dataset.desc = 'héberger une partie ou en rejoindre une · sans serveur';
    const sub = document.getElementById('play-sub');
    if (sub && /jardin commun/.test(sub.textContent)) sub.textContent = 'à plusieurs · héberger ou rejoindre';
  };
  // (again a moment later: the title menu may be dressed up after us)
  const soon = () => { noServer(); setTimeout(noServer, 0); setTimeout(noServer, 1500); };
  if (CONFIG.serverless) soon(); else serverless().then((no) => { if (no) soon(); });
  const more = document.createElement('div');
  more.className = 'p2p-more';
  more.innerHTML = `<button type="button" data-p="host" title="ton onglet devient le serveur">héberger une partie</button><button type="button" data-p="join" title="avec un code ou un lien">rejoindre</button>`;
  form.appendChild(more);
  form.style.flexWrap = 'wrap';
  more.style.flexBasis = '100%';
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-p]');
    if (b?.dataset.p === 'host') hostCard(nickIn); else if (b) joinCard(nickIn);
  });
  return menu;
}

async function hostCard(nickIn) {
  let last = 'ma-partie';
  try { last = localStorage.getItem('a-hole-host-room') || last; } catch {}
  const c = card(`<h2>héberger une partie</h2><div class="sub">ton onglet devient le serveur : les autres se connectent directement à toi. garde-le ouvert.</div>
    <label>nom de la partie</label><input data-room maxlength="24" value="${esc(last)}" spellcheck="false">
    <div data-worlds></div>
    <label>ou partir d'un monde exporté</label><input type="file" data-file accept=".json,application/json">
    ${turnRow}
    <div class="err" data-err></div>
    <div class="acts"><button data-go>héberger</button><button class="ghost" data-x>retour</button></div>`);
  c.$('[data-turn]').value = turnText(getTurn());
  const worlds = await listWorlds();
  if (worlds.length) c.$('[data-worlds]').innerHTML = `<label>tes mondes gardés</label><div class="worlds">${worlds.map(w => `<button data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
  c.el.addEventListener('click', async (e) => {
    const w = e.target.closest('[data-w]');
    if (w) { c.$('[data-room]').value = w.dataset.w; return; }
    if (e.target.closest('[data-x]')) { c.close(); return; }
    if (!e.target.closest('[data-go]')) return;
    const room = roomKey(c.$('[data-room]').value);
    if (!room) { c.$('[data-err]').textContent = 'il faut un nom'; return; }
    if (!keepTurn(c)) { c.$('[data-err]').textContent = 'turn : « turn:hôte:port nom motdepasse »'; return; }
    const f = c.$('[data-file]').files?.[0];
    if (f) {
      try { const w = readWorldFile(JSON.parse(await f.text())); await saveWorld(room, { ...w, at: Date.now() }); }
      catch (x) { c.$('[data-err]').textContent = x.message || 'fichier illisible'; return; }
    }
    try { localStorage.setItem('a-hole-host-room', room); } catch {}
    location.search = `?room=${encodeURIComponent(room)}&host=1&name=${encodeURIComponent(nickOf(nickIn))}&go=1`;
  });
  c.$('[data-room]').focus();
}

function joinCard(nickIn) {
  const c = card(`<h2>rejoindre</h2><div class="sub">colle le lien ou le code que l'hôte t'a donné${CONFIG.serverless ? '' : ' (ou « @nom » si la partie est sur le serveur)'}.</div>
    <label>lien ou code</label><textarea data-code spellcheck="false" placeholder="https://…?join=… · @ma-partie"></textarea>
    ${turnRow}
    <div class="err" data-err></div>
    <div class="acts"><button data-go>rejoindre</button><button class="ghost" data-x>retour</button></div>`);
  c.$('[data-turn]').value = turnText(getTurn());
  c.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { c.close(); return; }
    if (!e.target.closest('[data-go]')) return;
    let code = c.$('[data-code]').value.trim();
    const m = code.match(/[?&#]join=([^&\s]+)/);
    if (m) code = decodeURIComponent(m[1]);
    if (!code) { c.$('[data-err]').textContent = 'colle d\'abord le code'; return; }
    if (!keepTurn(c)) { c.$('[data-err]').textContent = 'turn : « turn:hôte:port nom motdepasse »'; return; }
    if (!code.startsWith('@') && !code.startsWith('t:') && !/^[zj][A-Za-z0-9_-]{20,}$/.test(code)) {
      if (CONFIG.serverless) { c.$('[data-err]').textContent = 'colle le lien d\'invitation en entier'; return; }
      code = '@' + roomKey(code);
    }
    location.search = `?join=${encodeURIComponent(code)}&name=${encodeURIComponent(nickOf(nickIn))}&auto=1`;
  });
  c.$('[data-code]').focus();
}

// ---------- once the game is up: host or join ----------
// hooks: clock(), raid(), resetMap(), start(), toast(text, bad, ms), fetchNotes(fn) to route the guest book
export function p2pConnect(net, { params, hooks }) {
  if (params.has('host')) return hostNow(net, params, hooks);
  return joinNow(net, params, hooks);
}

async function hostNow(net, params, hooks) {
  const nick = params.get('name') || 'hôte';
  const host = await startHost({ name: params.get('room'), nick, hooks, useSig: !CONFIG.serverless });
  window.__host = host;
  net.title = `ta partie · ${host.name}`;
  net.connect(host.name, nick, host.socket);
  hooks.fetchNotes?.(notesFetch(net));
  const backend = localBackend(host);
  // the alert itself only sounds on the plot: the host hears it's on its way anyway
  backend.raid = () => { host.raid(); hooks.toast?.('raid lancé : le bombardier passe sur le jardin dans 12 s', false, 4000); };
  const panel = createHostPanel({ backend, detachUrl: `serveur.html?room=${encodeURIComponent(host.name)}` });
  let t = 0;
  host.on(() => { if (panel.open && !t) t = setTimeout(() => { t = 0; panel.render(host.snap()); }, 50); });
  addEventListener('keydown', (e) => { if (e.code === 'F2') { e.preventDefault(); panel.toggle(); } else if (e.code === 'Escape' && panel.open) panel.hide(); });
  // and a way in from the pause menu
  const pm = document.querySelector('.pause-menu');
  if (pm) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--menu in'; b.style.setProperty('--i', 2);
    b.innerHTML = '<span class="btn__icon"><svg viewBox="0 0 32 32"><rect x="5" y="4" width="22" height="9" rx="2.5" fill="currentColor"/><rect x="5" y="16" width="22" height="9" rx="2.5" fill="currentColor"/><circle cx="10" cy="8.5" r="1.6" fill="var(--k)"/><circle cx="10" cy="20.5" r="1.6" fill="var(--k)"/></svg></span><span class="btn__text"><span class="btn__label">serveur · f2</span></span>';
    b.addEventListener('click', (e) => { e.stopPropagation(); panel.show(); });
    pm.insertBefore(b, pm.children[1] || null);
  }
  // closing this tab closes the room: asked once when others are in
  addEventListener('beforeunload', (e) => { if (host.room.size > 1) { e.preventDefault(); e.returnValue = ''; } });
  setTimeout(() => hooks.toast?.(`tu héberges « ${host.name} » · f2 pour inviter et tout régler`, false, 6000), 2500);
  return host;
}

function joinNow(net, params, hooks) {
  const join = params.get('join');
  let nick = params.get('name') || (() => { try { return localStorage.getItem('a-hole-nick'); } catch { return null; } })() || '';
  const c = card(`<h2>rejoindre une partie</h2><div class="sub" data-sub>${join.startsWith('@') ? `la partie « ${esc(join.slice(1))} »` : join.startsWith('t:') ? `la partie « ${esc(join.split(':')[1] || '?')} »` : 'avec une invitation'}</div>
    <div data-name><label>ton nom</label><input data-nick maxlength="10" value="${esc(nick)}" placeholder="creuseur" spellcheck="false"></div>
    <div data-steps></div>
    <div data-ans hidden><label>ta réponse, à renvoyer à l'hôte</label><textarea data-code readonly></textarea>
      <div class="acts"><button class="ghost" data-copy>copier la réponse</button></div>
      <div class="hint">l'hôte la colle dans son panneau serveur (f2). si vous êtes dans le même navigateur, c'est déjà fait.</div></div>
    <div class="err" data-err></div><div class="hint" data-hint></div>
    <div class="acts"><button data-go>se connecter</button><button class="ghost" data-x>jouer seul</button></div>`);
  const steps = [];
  const step = (key, text, st = 'go') => {
    let s = steps.find(x => x.key === key);
    for (const o of steps) if (o !== s && o.st === 'go') o.st = 'ok';
    if (!s) { s = { key }; steps.push(s); }
    s.text = text; s.st = st;
    c.$('[data-steps]').innerHTML = steps.map(x => `<div class="step"><i class="dot ${x.st}"></i><span>${esc(x.text)}</span></div>`).join('');
  };
  let busy = false, done = false, spent = false;
  async function go() {
    if (busy) return;
    if (spent) { location.search = ''; return; }
    if (done) { c.close(); hooks.start?.(); return; }
    busy = true;
    nick = c.$('[data-nick]').value.trim() || 'creuseur';
    try { localStorage.setItem('a-hole-nick', nick); } catch {}
    c.$('[data-name]').hidden = true;
    c.$('[data-err]').textContent = ''; c.$('[data-hint]').textContent = '';
    const btn = c.$('[data-go]'); btn.disabled = true; btn.textContent = 'connexion…';
    try {
      const r = await joinHost({ join, nick, onStep(what, d) {
        if (what === 'sig') step('sig', 'recherche de la partie sur le serveur…');
        else if (what === 'rdv') step('rdv', `recherche de l'hôte par les relais publics${d?.round ? ` · essai ${d.round}` : ''}${d?.up != null ? ` · ${d.up} relais joignable${d.up > 1 ? 's' : ''}` : ''}…`);
        else if (what === 'offer') { step('offer', `invitation de ${d.host || 'l\'hôte'} · partie « ${d.room || '?'} »`, 'ok'); c.$('[data-sub]').textContent = `la partie « ${d.room || '?'} » de ${d.host || '?'}`; step('wait', join.startsWith('@') || join.startsWith('t:') ? 'poignée de main…' : 'en attente de l\'hôte…'); }
        else if (what === 'answer') { c.$('[data-ans]').hidden = false; c.$('[data-code]').value = d.code; }
        else if (what === 'ice') step('ice', 'connexion directe…');
      } });
      step('open', 'connecté !', 'ok');
      c.$('[data-ans]').hidden = true;
      net.title = `partie de ${r.host || '?'} · ${r.room || ''}`;
      net.connect(r.room || 'p2p', nick, r.socket);
      hooks.fetchNotes?.(notesFetch(net));
      done = true;
      btn.disabled = false; btn.textContent = 'creuser !';
      c.$('[data-x]').hidden = true;
      btn.focus();
    } catch (x) {
      const last = steps.find(s => s.st === 'go'); if (last) last.st = 'bad';
      step('err', 'raté', 'bad');
      c.$('[data-err]').textContent = x.message || String(x);
      c.$('[data-hint]').textContent = x.hint || 'vérifie le code, ou demande une nouvelle invitation';
      btn.disabled = false; btn.textContent = 'réessayer';
      busy = false;
      // a code is used once: trying again only makes sense through the server
      if (!join.startsWith('@') && !join.startsWith('t:')) { btn.textContent = 'retour au menu'; spent = true; }
      return;
    }
    busy = false;
  }
  c.$('[data-go]').addEventListener('click', go);
  c.$('[data-nick]').addEventListener('keydown', (e) => { if (e.code === 'Enter') go(); });
  c.$('[data-copy]').addEventListener('click', async (e) => { await navigator.clipboard?.writeText(c.$('[data-code]').value).catch(() => {}); e.target.textContent = 'copié !'; });
  c.$('[data-x]').addEventListener('click', () => { location.search = ''; });
  if (params.has('auto') && nick) go(); else c.$('[data-nick]').focus();
  return null;
}
