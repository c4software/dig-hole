// hostpanel.js, the server's desk: only the host sees it (f2, or the pause menu, or a second
// window). Invitations, who's in (and out), the live values that drive everyone's game, and a
// few big buttons: a raid, a new map, the world saved to a file and back.
// backend: the host itself (p2p.js startHost) or remoteHost() from another window.
import { DEFS, GROUPS, tun } from './tunables.js';
import { readWorldFile } from './p2p.js';
import { getTurn, setTurn, parseTurn, turnText } from './rtc.js';
import { CATALOG } from './catalog.js';
import { esc } from './lib/fmt.js';

const CSS = `
.hp { position: fixed; z-index: 60; top: 16px; right: 16px; bottom: 16px; width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column;
  background: #261c14; color: #fff; border: 3px solid #1a130d; border-radius: 18px; box-shadow: 0 10px 0 rgba(0,0,0,.35), 0 24px 60px rgba(0,0,0,.5);
  font: 500 13px/1.35 'Rubik', system-ui, sans-serif; user-select: none; }
.hp.page { position: static; width: auto; max-width: 980px; margin: 16px auto; bottom: auto; }
.hp header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 3px solid #1a130d; }
.hp header b { font: 400 20px/1 'Titan One', 'Rubik', system-ui, sans-serif; letter-spacing: .02em; }
.hp header small { opacity: .6; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; font-size: 10px; }
.hp header .sp { flex: 1; }
.hp .body { overflow: auto; padding: 4px 14px 16px; flex: 1; }
.hp.page .body { columns: 2 420px; column-gap: 20px; }
.hp section { break-inside: avoid; padding: 10px 0 12px; border-bottom: 2px dashed rgba(255,255,255,.08); }
.hp h3 { font: 900 11px/1 'Rubik', system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #ffdc8f; margin: 4px 0 10px; display: flex; gap: 8px; align-items: center; }
.hp h3 em { font-style: normal; color: rgba(255,255,255,.45); letter-spacing: .06em; }
.hp button { cursor: pointer; border: 0; border-radius: 10px; padding: 7px 11px; font: 800 12px/1 'Rubik', system-ui, sans-serif; color: #1a130d; background: #ffb020; box-shadow: 0 3px 0 #6e420c; }
.hp button:active { transform: translateY(2px); box-shadow: 0 1px 0 #6e420c; }
.hp button.ghost { background: #35281c; color: #fff; box-shadow: 0 3px 0 #1a130d; }
.hp button.danger { background: #ff3d5e; color: #fff; box-shadow: 0 3px 0 #7a0f24; }
.hp button.x { background: transparent; color: #fff; box-shadow: none; font-size: 18px; padding: 4px 8px; }
.hp .row { display: grid; grid-template-columns: 1fr 120px 52px 22px; gap: 8px; align-items: center; padding: 3px 0; }
.hp .row label { font-weight: 600; }
.hp .row label small { display: block; opacity: .5; font-size: 10.5px; font-weight: 500; }
.hp .row.on label { color: #ffb020; }
.hp .row input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; margin: 0; border-radius: 99px; cursor: pointer; outline: none;
  background: linear-gradient(#ffb020, #ffb020) 0 0 / calc(var(--t, 0) * 100%) 100% no-repeat, #1a130d; box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
.hp .row input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #ffdc8f; box-shadow: 0 0 0 2px #1a130d; transition: none; }
.hp .row input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #ffdc8f; box-shadow: 0 0 0 2px #1a130d; transition: none; }
.hp .row input[type=range]:active::-webkit-slider-thumb { scale: 1.2; }
.hp .row output { text-align: right; font-variant-numeric: tabular-nums; font-weight: 800; }
.hp .row .rs { background: none; box-shadow: none; color: #fff; opacity: .35; padding: 2px; font-size: 14px; }
.hp .row.on .rs { opacity: 1; }
.hp .seg { display: flex; gap: 3px; flex-wrap: wrap; grid-column: 2 / 4; }
.hp .seg button { padding: 5px 7px; background: #35281c; color: #fff; box-shadow: none; font-weight: 700; }
.hp .seg button.on { background: #ffb020; color: #1a130d; }
.hp .acts { display: flex; flex-wrap: wrap; gap: 8px; }
.hp .who { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.hp .who i { width: 11px; height: 11px; border-radius: 50%; box-shadow: 0 0 0 2px #1a130d; }
.hp .who span { flex: 1; }
.hp .who em { font-style: normal; opacity: .55; font-size: 11px; }
.hp .chip { display: inline-block; padding: 2px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 800; background: #35281c; }
.hp .chip.on { background: #39c07a; color: #10261a; } .hp .chip.bad { background: #ff3d5e; } .hp .chip.wait { background: #4a8fe0; }
.hp .code { display: flex; gap: 6px; margin: 6px 0; }
.hp .code input, .hp textarea, .hp .turn input { flex: 1; min-width: 0; background: #1a130d; color: #ffdc8f; border: 0; border-radius: 9px; padding: 8px 10px; font: 600 12px/1.3 ui-monospace, monospace; outline: none; }
.hp textarea { width: 100%; resize: vertical; min-height: 54px; }
.hp .hint { opacity: .6; font-size: 11.5px; margin: 4px 0; }
.hp .err { color: #ff7a56; font-weight: 700; font-size: 12px; margin: 4px 0; }
.hp .turn { display: flex; gap: 6px; margin-top: 6px; }
.hp [hidden], .hp.page[hidden] { display: none !important; }
.hp details.grp { border-radius: 10px; margin: 4px 0; background: rgba(0,0,0,.14); }
.hp details.grp > summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; list-style: none; }
.hp details.grp > summary::-webkit-details-marker { display: none; }
.hp details.grp > summary::before { content: '▸'; opacity: .6; transition: transform .15s; }
.hp details.grp[open] > summary::before { transform: rotate(90deg); }
.hp details.grp > summary b { font: 900 11px/1 'Rubik', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #ffdc8f; }
.hp details.grp > summary .nm { flex: 1; font-style: normal; font-size: 11px; color: #ffb020; font-weight: 800; }
.hp details.grp > summary .rs { opacity: 0; font-size: 11px; }
.hp details.grp.on > summary .rs { opacity: 1; }
.hp details.grp > .row { padding: 3px 10px; }
.hp .row .mod { display: none; margin-left: 6px; padding: 1px 6px; border-radius: 99px; background: #ffb020; color: #1a130d; font-size: 9.5px; font-weight: 900; vertical-align: 1px; }
.hp .row.on .mod { display: inline-block; }
.hp .gift { margin: 8px 0 4px; padding: 10px; border-radius: 12px; background: #35281c; }
.hp .gift .g { display: grid; grid-template-columns: 1fr 64px; gap: 6px; margin: 5px 0; }
.hp .gift select, .hp .gift input { min-width: 0; background: #1a130d; color: #fff; border: 0; border-radius: 8px; padding: 6px 8px; font: 600 12px/1.2 'Rubik', system-ui, sans-serif; }
@media (max-width: 520px) { .hp .row { grid-template-columns: 1fr 90px 44px 20px; } }
`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const COLORS = [0xd9a125, 0x39c07a, 0x4a8fe0, 0xe4183a, 0xb05ae0, 0xf08a2a, 0x2ac0c0, 0xf2a7c3];
const fmt = (d, v) => d.options ? '' : d.k === 'hour' && v < 0 ? 'auto' : (Math.round(v * 100) / 100) + (d.unit || '');
const STATES = { rdv: ['par les relais', 'wait'], invite: ['en attente de réponse', 'wait'], answered: ['réponse reçue', 'wait'], connecting: ['connexion…', 'wait'], on: ['connecté', 'on'], failed: ['échec (réseau)', 'bad'], gone: ['parti', ''], kicked: ['renvoyé', 'bad'] };
const SIG = { probe: 'recherche du serveur…', wait: 'inscription…', on: 'en ligne', off: 'pas de serveur de rencontre : invitations par code', taken: 'nom déjà pris sur le serveur : invitations par code' };

// backend: set, reset, kick, raid, resetMap, invite, accept, cancel, exportWorld, importWorld; snap(): state
export function createHostPanel({ backend, page = false, detachUrl = null, parent = document.body }) {
  if (!document.getElementById('hp-css')) { const st = document.createElement('style'); st.id = 'hp-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'hp' + (page ? ' page' : ' hidden');
  el.innerHTML = `
    <header><div><small>serveur · ce que toi seul vois</small><br><b id="hp-title">ta partie</b></div><span class="sp"></span>
      ${detachUrl ? '<button class="ghost" data-a="detach" title="garder ce panneau ouvert dans une autre fenêtre">détacher ↗</button>' : ''}
      ${page ? '' : '<button class="x" data-a="close" title="fermer (f2)">×</button>'}</header>
    <div class="body">
      <section id="hp-invsec"><h3>inviter</h3>
        <div id="hp-sig"></div>
        <div class="acts"><button data-a="invite">nouvelle invitation par code</button></div>
        <div class="hint">une invitation = un invité. l'invité ouvre le lien, puis te renvoie sa réponse à coller ici (dans le même navigateur, c'est automatique).</div>
        <div id="hp-guests"></div>
      </section>
      <section><h3>joueurs <em id="hp-n"></em></h3><div id="hp-players"></div>
        <div class="acts" style="margin-top:6px"><button class="ghost" data-a="giftall">donner à tout le monde</button></div>
        <div class="gift" id="hp-gift" hidden></div></section>
      <section><h3>le monde <em id="hp-ops"></em></h3>
        <div class="acts">
          <button class="ghost" data-a="raid">lancer un raid</button>
          <button class="danger" data-a="resetmap">nouvelle carte</button>
          <button class="ghost" data-a="refinds" title="les trouvailles déjà déterrées retournent sous terre, pour tout le monde">remettre les trésors</button>
          <button class="ghost" data-a="export">exporter le monde</button>
          <button class="ghost" data-a="import">importer…</button>
          <input type="file" id="hp-file" accept=".json,application/json" hidden>
        </div>
        <div class="err" id="hp-err"></div>
        <div class="turn"><input id="hp-say" maxlength="200" placeholder="un mot pour tout le monde (un message à l'écran)" spellcheck="false"><button class="ghost" data-a="say">annoncer</button></div>
        <div class="turn" id="hp-turnrow"><input id="hp-turn" placeholder="serveur turn (optionnel) : turn:hôte:3478 nom motdepasse" spellcheck="false"><button class="ghost" data-a="turn">ok</button></div>
      </section>
      <section id="hp-notesec" hidden><h3>livre d'or <em>les derniers mots</em></h3><div id="hp-notes"></div></section>
      <section id="hp-tun"><h3>réglages en direct <em>suivis par tout le monde</em> <em id="hp-nmod"></em></h3>
        <div class="turn" style="margin:0 0 8px"><input id="hp-find" placeholder="chercher un réglage (gravité, dynamite, prix…)" spellcheck="false"><button class="ghost" data-a="resetall">tout remettre</button></div></section>
    </div>`;
  parent.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  // keys and clicks stay in the panel: typing a number doesn't walk the digger
  for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'wheel', 'pointerdown']) el.addEventListener(t, (e) => { if (!(t === 'keydown' && (e.code === 'F2' || e.code === 'Escape'))) e.stopPropagation(); });
  $('hp-turn').value = turnText(getTurn());
  // the node server's garden: no invitations, no import, no turn; a guest book to tidy
  if (backend.node) { $('hp-invsec').hidden = true; $('hp-turnrow').hidden = true; el.querySelector('[data-a="import"]').hidden = true; }
  $('hp-say').addEventListener('keydown', (e) => { if (e.code === 'Enter') el.querySelector('[data-a="say"]').click(); });

  // ---------- the live values: one fold per group, a search, what's changed marked ----------
  const rows = new Map(), folds = new Map();
  let values = {};
  const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const g of GROUPS) {
    const box = document.createElement('details');
    box.className = 'grp';
    box.innerHTML = `<summary><b>${esc(g)}</b><em class="nm"></em><button class="rs" data-g="${esc(g)}" title="remettre ce groupe">↺ groupe</button></summary>`;
    box.querySelector('summary .rs').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); for (const d of DEFS) if (d.g === g && d.k in values) backend.reset(d.k); });
    for (const d of DEFS.filter(x => x.g === g && !x.hidden)) {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<label>${esc(d.label)}<span class="mod">modifié</span>${d.note ? `<small>${esc(d.note)}</small>` : ''}</label>` +
        (d.options ? `<div class="seg">${d.options.map(([v, n]) => `<button data-v="${v}">${esc(n)}</button>`).join('')}</div>`
          : `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}"><output></output>`) +
        `<button class="rs" title="valeur d'origine">↺</button>`;
      const inp = r.querySelector('input'), out = r.querySelector('output');
      const fill = () => inp.style.setProperty('--t', (+inp.value - d.min) / (d.max - d.min));
      if (inp) inp.addEventListener('input', () => { fill(); out.textContent = fmt(d, +inp.value); backend.set(d.k, +inp.value); });
      r.querySelector('.seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) backend.set(d.k, +b.dataset.v); });
      r.querySelector('.rs').addEventListener('click', () => backend.reset(d.k));
      rows.set(d.k, { d, r, inp, out, fill, text: fold(`${d.label} ${d.k} ${g}`) });
      box.appendChild(r);
    }
    folds.set(g, box);
    $('hp-tun').appendChild(box);
  }
  // the search: only the matching rows, their groups open
  $('hp-find').addEventListener('input', () => {
    const q = fold($('hp-find').value.trim());
    for (const [g, box] of folds) {
      let n = 0;
      for (const x of rows.values()) if (x.d.g === g) { const hit = !q || x.text.includes(q); x.r.hidden = !hit; n += hit; }
      box.hidden = !n;
      if (q) box.open = true;
    }
  });
  function showValues() {
    const nMod = {};
    for (const { d, r, inp, out, fill } of rows.values()) {
      const on = d.k in values, v = on ? values[d.k] : d.def;
      if (on) nMod[d.g] = (nMod[d.g] || 0) + 1;
      r.classList.toggle('on', on);
      if (inp) { if (document.activeElement !== inp && +inp.value !== v) inp.value = v; fill(); out.textContent = fmt(d, v); }
      else r.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
    }
    for (const [g, box] of folds) { box.querySelector('.nm').textContent = nMod[g] ? `${nMod[g]} modifié${nMod[g] > 1 ? 's' : ''}` : ''; box.classList.toggle('on', !!nMod[g]); }
    const all = Object.values(nMod).reduce((a, b) => a + b, 0);
    $('hp-nmod').textContent = all ? `· ${all} modifié${all > 1 ? 's' : ''}` : '';
  }

  // ---------- invitations, guests, players ----------
  // every invitation still waiting shows its link and a box for the answer (made here or not)
  let guestSig = '';
  function renderGuests(snap) {
    const gs = snap.guests.filter(g => g.state !== 'on');
    const sig = JSON.stringify(gs.map(g => [g.key, g.state, g.name, g.ice, !!g.link]));
    if (sig === guestSig) return;
    guestSig = sig;
    $('hp-guests').innerHTML = gs.map(g => {
      const [t, c] = STATES[g.state] || [g.state, ''];
      const head = `<div class="who"><span>${esc(g.name || (g.via === 'sig' ? 'un invité (serveur)' : 'invitation #' + g.key))}</span><span class="chip ${c}">${t}</span><button class="x" data-a="cancel" data-k="${g.key}" title="oublier">×</button></div>`;
      const ice = g.ice && g.state !== 'invite' ? `<div class="hint">candidats ${esc(g.ice)}${g.state === 'failed' ? ' · essayez un serveur turn' : ''}</div>` : '';
      if (g.state !== 'invite' || !g.link) return head + ice;
      return head + `<div class="gift"><div class="hint">1 · envoie ce lien à l'invité</div>
        <div class="code"><input readonly value="${esc(g.link)}"><button data-a="copy" data-v="${esc(g.link)}">copier</button></div>
        <div class="hint">2 · colle ici la réponse qu'il te renvoie (même navigateur : c'est automatique)</div>
        <textarea data-ans="${g.key}" placeholder="réponse de l'invité" spellcheck="false"></textarea>
        <div class="acts"><button data-a="accept" data-k="${g.key}">accepter</button></div></div>`;
    }).join('');
  }
  let lastSnap = null;
  function render(snap) {
    if (!snap) return;
    lastSnap = snap;
    $('hp-title').textContent = '« ' + snap.room + ' »' + (snap.node ? ' · serveur' : '');
    $('hp-notesec').hidden = !Array.isArray(snap.notes) || !backend.delNote;
    if (Array.isArray(snap.notes)) $('hp-notes').innerHTML = snap.notes.map(n => `<div class="who"><span><b>${esc(n.name)}</b> · ${esc(n.text)}</span><button class="x" data-a="delnote" data-at="${n.at}" title="effacer">×</button></div>`).join('') || '<div class="hint">pas encore de mot</div>';
    $('hp-ops').textContent = snap.ops + ' changements au sol';
    const s = snap.sig;
    const r = snap.rdv;
    $('hp-sig').innerHTML = s.code
      ? `<div class="hint">code de la partie, à taper dans « rejoindre » : <b style="color:#ffdc8f">${esc(s.code)}</b></div><div class="code"><input readonly value="${esc(s.link)}"><button data-a="copy" data-v="${esc(s.link)}">copier le lien</button></div>`
      : r?.link
        ? `<div class="hint">le lien d'invitation, pour autant d'invités que tu veux · il passe par des relais publics (chiffré, clé dans le lien) · <b style="color:${r.up ? '#39c07a' : '#ff7a56'}">${r.up}/${r.of} relais joignables</b></div><div class="code"><input readonly value="${esc(r.link)}"><button data-a="copy" data-v="${esc(r.link)}">copier le lien</button></div>`
        : `<div class="hint">serveur de rencontre : ${esc(SIG[s.state] || s.state)}</div>`;
    renderGuests(snap);
    $('hp-n').textContent = snap.players.length;
    $('hp-players').innerHTML = snap.players.map(p => `<div class="who"><i style="background:${hex(COLORS[p.color % COLORS.length])}"></i><span>${esc(p.name)}${p.owner ? ' <em>(toi, l\'hôte)</em>' : ''}</span><em>${esc(p.w || '')}</em><button class="ghost" data-a="gift" data-id="${p.id}">donner</button>${p.owner ? '' : `<button class="danger" data-a="kick" data-id="${p.id}">renvoyer</button>`}</div>`).join('') || '<div class="hint">personne pour l\'instant</div>';
    values = snap.values || {};
    showValues();
  }

  // ---------- gifts: coins, an item, something for the sack, a rocket part ----------
  let giftTo = null;
  const opts = (list) => '<option value="">—</option>' + list.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('');
  function openGift(id) {
    giftTo = id;
    const who = id == null ? 'tout le monde (sauf toi)' : (lastSnap?.players.find(p => p.id === id)?.name ?? '?');
    const box = $('hp-gift');
    box.hidden = false;
    box.innerHTML = `<div class="hint">donner à <b style="color:#ffdc8f">${esc(who)}</b></div>
      <div class="g"><span>pièces ●</span><input type="number" min="0" step="10" value="0" data-g="coins"></div>
      <div class="g"><select data-g="item">${opts(CATALOG.items)}</select><input type="number" min="1" max="99" value="1" data-g="itemn"></div>
      <div class="g"><select data-g="sack">${opts(CATALOG.sack)}</select><input type="number" min="1" max="999" value="5" data-g="sackn"></div>
      <div class="g"><select data-g="part">${opts(CATALOG.parts.map(([v, n]) => [v, 'pièce de fusée : ' + n]))}</select><span></span></div>
      <div class="acts"><button data-a="giftgo">envoyer</button><button class="ghost" data-a="giftx">annuler</button></div>
      ${backend.act ? `<div class="hint" style="margin-top:10px">ou bien, pour ${esc(who)} :</div>
      <div class="acts"><button class="ghost" data-a="act" data-w="heal">soigner (vie, batterie, oxygène)</button><button class="ghost" data-a="act" data-w="parcel">envoyer un colis</button></div>
      <div class="acts" style="margin-top:6px"><span class="hint">téléporter :</span>${[['home', 'maison'], ['china', 'japon'], ['moon', 'lune'], ['mars', 'mars']].map(([w, n]) => `<button class="ghost" data-a="act" data-w="tp" data-v="${w}">${n}</button>`).join('')}</div>
      <div class="g" style="margin-top:6px"><input type="number" min="0" step="100" placeholder="fixer sa bourse à…" data-g="money"><button class="ghost" data-a="act" data-w="money">fixer ●</button></div>` : ''}`;
  }
  async function sendGift(b) {
    const v = (k) => $('hp-gift').querySelector(`[data-g="${k}"]`).value;
    const gift = { coins: Math.max(0, Math.floor(+v('coins') || 0)), items: {}, sack: {}, parts: [] };
    if (v('item')) gift.items[v('item')] = Math.max(1, Math.min(99, Math.floor(+v('itemn') || 1)));
    if (v('sack')) gift.sack[v('sack')] = Math.max(1, Math.min(999, Math.floor(+v('sackn') || 1)));
    if (v('part')) gift.parts.push(v('part'));
    if (!gift.coins && !v('item') && !v('sack') && !v('part')) return err('rien à donner');
    await backend.give(giftTo, gift);
    b.textContent = 'envoyé !'; setTimeout(() => { b.textContent = 'envoyer'; }, 1500);
  }

  const err = (m) => { $('hp-err').textContent = m || ''; if (m) setTimeout(() => { if ($('hp-err').textContent === m) $('hp-err').textContent = ''; }, 5000); };
  let armed = null;
  const confirm2 = (key, btn, text) => {
    if (armed === key) { armed = null; return true; }
    armed = key; const old = btn.textContent; btn.textContent = text;
    setTimeout(() => { if (armed === key) armed = null; btn.textContent = old; }, 3000);
    return false;
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === 'close') hide();
      else if (a === 'detach') { window.open(detachUrl, 'a-hole-serveur', 'width=520,height=860'); hide(); }
      else if (a === 'copy') { await navigator.clipboard?.writeText(b.dataset.v).catch(() => {}); b.textContent = 'copié !'; setTimeout(() => { b.textContent = 'copier'; }, 1500); }
      else if (a === 'invite') {
        b.disabled = true; b.textContent = 'préparation… (quelques secondes)';
        try { const r = await backend.invite(); if (backend.remote && lastSnap && !lastSnap.guests.some(g => g.key === r.key)) render({ ...lastSnap, guests: [...lastSnap.guests, { key: r.key, via: 'code', state: 'invite', link: r.link, code: r.code }] }); }
        finally { b.disabled = false; b.textContent = 'nouvelle invitation par code'; }
      }
      else if (a === 'accept') { const v = el.querySelector(`[data-ans="${b.dataset.k}"]`)?.value.trim(); if (!v) return err('colle d\'abord la réponse'); await backend.accept(v); }
      else if (a === 'cancel') { if (b.dataset.k) await backend.cancel(+b.dataset.k); }
      else if (a === 'gift' || a === 'giftall') openGift(a === 'gift' ? +b.dataset.id : null);
      else if (a === 'giftgo') await sendGift(b);
      else if (a === 'giftx') $('hp-gift').hidden = true;
      else if (a === 'act') {
        const w = b.dataset.w, v = w === 'money' ? +$('hp-gift').querySelector('[data-g="money"]').value : w === 'parcel' ? ($('hp-gift').querySelector('[data-g="item"]').value || 'dyn') : b.dataset.v;
        if (w === 'money' && !Number.isFinite(v)) return err('combien ?');
        await backend.act(giftTo, w, v); const t = b.textContent; b.textContent = 'fait !'; setTimeout(() => { b.textContent = t; }, 1400);
      }
      else if (a === 'refinds') { if (confirm2('refinds', b, 'sûr ? tous les trésors reviennent')) { await backend.refinds(); b.textContent = 'trésors revenus'; setTimeout(() => { b.textContent = 'remettre les trésors'; }, 2000); } }
      else if (a === 'say') { const t = $('hp-say').value.trim(); if (!t) return; await backend.say(t); $('hp-say').value = ''; b.textContent = 'annoncé !'; setTimeout(() => { b.textContent = 'annoncer'; }, 1500); }
      else if (a === 'delnote') { if (confirm2('note' + b.dataset.at, b, 'sûr ?')) await backend.delNote(+b.dataset.at); }
      else if (a === 'kick') { if (confirm2('kick' + b.dataset.id, b, 'sûr ?')) await backend.kick(+b.dataset.id); }
      else if (a === 'raid') { await backend.raid(); b.textContent = 'raid lancé · alerte dans le potager, bombes dans 12 s'; setTimeout(() => { b.textContent = 'lancer un raid'; }, 4000); }
      else if (a === 'resetmap') { if (confirm2('reset', b, 'sûr ? tout le monde repart à zéro')) await backend.resetMap(); }
      else if (a === 'export') await backend.exportWorld();
      else if (a === 'import') $('hp-file').click();
      else if (a === 'resetall') await backend.reset();
      else if (a === 'turn') { const t = parseTurn($('hp-turn').value); if ($('hp-turn').value.trim() && !t) return err('turn : « turn:hôte:port nom motdepasse »'); setTurn(t); b.textContent = t ? 'gardé' : 'enlevé'; setTimeout(() => { b.textContent = 'ok'; }, 1500); }
      if (lastSnap && !backend.remote) render(backend.snap());
    } catch (x) { err(x.message || String(x)); }
  });
  $('hp-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { const obj = JSON.parse(await f.text()); readWorldFile(obj); await backend.importWorld(obj); }
    catch (x) { err(x.message || 'fichier illisible'); }
  });

  function show() { el.classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); render(backend.snap ? backend.snap() : lastSnap); }
  function hide() { if (!page) el.classList.add('hidden'); }
  const toggle = () => (el.classList.contains('hidden') ? show() : hide());
  return { el, show, hide, toggle, render, get open() { return !el.classList.contains('hidden'); } };
}

// the local backend: the host object from p2p.js, plus the registry itself
export function localBackend(host) {
  return {
    snap: () => host.snap(),
    set: (k, v) => tun.set(k, v), reset: (k) => tun.reset(k),
    kick: (id) => host.kick(id), raid: () => host.raid(), resetMap: () => host.resetMap(), give: (id, g) => host.give(id, g), say: (t) => host.say(t), delNote: (at) => host.delNote(at), act: (id, w, v) => host.act(id, w, v), refinds: () => host.refinds(),
    invite: () => host.invite(), accept: (c) => host.accept(c), cancel: (k) => host.cancel(k),
    exportWorld: () => host.exportWorld(), importWorld: (o) => host.importWorld(o),
  };
}
