// events.js, the feasts of the calendar in the game: which are on (the server's date, or the
// host's / admin's word through the tunable `event`, or ?event= to try one), their decor built
// while they last and torn down after, the hunt and its card, the stall, the fireworks, the fog…
//   events.update(dt)              every frame, after the world's fog and light are set
//   events.season                  a season to force (noël: winter), or null
//   events.prompt(it) / act(it)    an `e` on one of its things (interactables of id 'ev')
//   events.panel(quip) / click(id) the stall's counter (main.js's panel 'ev')
//   events.onOp(op, local)         { k: 'ev', key, i, by }: a hunted thing taken, by anyone
//   events.on(fn)                  fn(ids) when the feasts change (a hook for seasonal outfits)
import * as THREE from 'three';
import { BY_ID, kindOf, activeEvents, parseOverride, tunToOverride, serverClock, fmtDay } from './events-calendar.js';
import { DECOR } from './events-decor.js';
import { PLAY, EV_ACH } from './events-play.js';
import { dispose, paperFish, witchHat, santaHat } from './events-art.js';
import * as A from './events-art.js';
import { mergeStatic } from './merge.js';

// which feats go with which feast (listed on the board only once they're on, or won)
const ACH_OF = {
  noel: ['ev_noel'], nouvelan: ['ev_nouvelan', 'ev_feu'], epiphanie: ['ev_roi'], chandeleur: ['ev_crepes'], mardigras: ['ev_crepes'],
  valentin: ['ev_valentin'], paques: ['ev_paques', 'ev_gold'], poisson: ['ev_poisson'], hanami: ['ev_hanami'], musique: ['ev_musique'],
  tanabata: ['ev_voeu'], obon: ['ev_voeu'], juillet: ['ev_juillet', 'ev_feu'], halloween: ['ev_halloween', 'ev_bonbons'],
};
const CARD_CSS = `
#evcard { position: absolute; left: 20px; top: 58px; width: 250px; padding: 10px 14px 11px; border-radius: 16px; display: flex; flex-direction: column; gap: 4px; pointer-events: none;
  background: rgba(14, 12, 20, .62); box-shadow: 0 0 0 2px rgba(255, 255, 255, .06), 0 10px 30px rgba(0, 0, 0, .35); backdrop-filter: blur(6px); color: #f4ead8; transition: opacity .3s, translate .3s; }
#evcard.hidden { display: none; }
#evcard .ek { font: 900 10.5px / 1.3 var(--text, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--ev, #ffb020); display: flex; gap: 7px; align-items: center; }
#evcard .ek i { width: 9px; height: 9px; border-radius: 50%; background: var(--ev, #ffb020); box-shadow: 0 0 10px var(--ev, #ffb020); }
#evcard .et { font: 400 18px / 1.1 var(--display, Georgia); color: #fff4dc; }
#evcard .es { font: 600 11.5px / 1.35 var(--text, sans-serif); color: rgba(244, 234, 216, .75); }
#evcard .em { display: flex; align-items: center; gap: 10px; margin-top: 3px; }
#evcard .eb { flex: 1; height: 8px; border-radius: 5px; background: rgba(0, 0, 0, .45); overflow: hidden; }
#evcard .eb b { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--ev, #ffb020); transition: width .4s; }
#evcard .en { font: 400 16px / 1 var(--display, Georgia); color: #fff4dc; font-variant-numeric: tabular-nums; }
#evcard .ec { font: 700 11px / 1.3 var(--text, sans-serif); color: rgba(255, 244, 220, .8); }
#evcard.pop { animation: evpop .6s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes evpop { 40% { scale: 1.06; } }
body.has-ev #net { top: calc(58px + var(--evh, 0px) + 8px); }
body.in-menu #evcard, body.in-kart #evcard, body.on-screen #evcard { display: none !important; }
body.touch #evcard { top: auto; bottom: 200px; transform: scale(.85); transform-origin: bottom left; }
#evspook { position: fixed; inset: 0; pointer-events: none; z-index: 40; background: radial-gradient(circle, rgba(154, 255, 106, .0) 30%, rgba(40, 0, 60, .85)); opacity: 0; transition: opacity .15s; }
#evspook.on { opacity: 1; }
`;
const TINT = { noel: '#ff5a5a', nouvelan: '#ffd75e', epiphanie: '#f2c230', chandeleur: '#f0c878', mardigras: '#f0c878', valentin: '#ff6a9a', paques: '#b8f0b8', poisson: '#6ab0e8', hanami: '#f6a8c8', musique: '#ffe07a', tanabata: '#ffb86a', obon: '#ffb86a', juillet: '#6a8aff', halloween: '#ff8a1e' };

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createEvents({ world, terrains, eco, ui, audio, tun, moles, organ, songs = [], CHINA, ACH_LIST, hooks }) {
  const params = new URLSearchParams(location.search);
  const urlOver = parseOverride(params.get('event'));
  const subs = new Set();
  const built = new Map();    // kind → { d: what the decor gave, roots, boxes, uses, bulbs, fw }
  const taken = new Map();    // key → Set of hunted things gone (the room's word, or our save)
  let active = [];            // [{ id, key, year, from, to, forced }]
  let sig = '', checkT = 0, t = 0, bannerFor = null;
  const HALLOWEEN_FOG = new THREE.Color(0x2a2438);

  // ---------- the card, under the clock ----------
  const style = document.createElement('style'); style.textContent = CARD_CSS; document.head.appendChild(style);
  const card = document.createElement('div'); card.id = 'evcard'; card.className = 'hidden';
  (document.getElementById('hud') || document.body).appendChild(card);
  const spookEl = document.createElement('div'); spookEl.id = 'evspook'; document.body.appendChild(spookEl);
  let cardHtml = '', cardKey = '';

  const save = () => (eco.s.ev ||= {});
  const stOf = (key) => (save()[key] ||= {});
  const dayKey = () => { const p = serverClock.parts(); return `${p.y}-${p.m}-${p.d}`; };
  const tk = (key) => { if (!taken.has(key)) taken.set(key, new Set(hooks.multi ? [] : stOf(key).got || [])); return taken.get(key); };

  // ---------- which feasts ----------
  function resolve() {
    const ov = urlOver ?? tunToOverride(tun.get('event'));
    const list = activeEvents(serverClock.parts(), ov);
    // tried out from the address bar: its own save, so the real one stays untouched
    if (urlOver && urlOver !== 'auto' && urlOver !== 'none') for (const e of list) if (e.forced) e.key += '-essai';
    return list;
  }
  function apply(list) {
    const s = list.map(e => e.key).join(',');
    if (s === sig) return false;
    const before = new Set(active.map(e => e.id));
    active = list; sig = s;
    const kinds = new Set(active.map(e => kindOf(e.id)));
    for (const k of [...built.keys()]) if (!kinds.has(k)) teardown(k);
    for (const k of kinds) if (!built.has(k) && DECOR[k]) build(k);
    // the feats of the feasts on now (and those already won) go on the board
    let added = false;
    for (const [k, name] of EV_ACH) if ((active.some(e => ACH_OF[e.id]?.includes(k)) || eco.s.ach[k]) && !ACH_LIST.some(a => a[0] === k)) { ACH_LIST.push([k, name]); added = true; }
    if (added) hooks.redrawBoard?.();
    const fresh = active.filter(e => !before.has(e.id));
    if (fresh.length) bannerFor = fresh[0];
    for (const f of subs) { try { f(active.map(e => e.id)); } catch (e) { console.error(e); } }
    return true;
  }

  // ---------- decor: built when a feast starts, gone when it ends ----------
  function build(kind) {
    const home = new THREE.Group(); home.name = 'ev-' + kind;
    const jp = new THREE.Group(); jp.name = 'ev-jp-' + kind;
    world.homeDecor.add(home); world.china.group.add(jp);
    const b = { roots: [home, jp], boxes: [], uses: [], bulbs: [], fw: [], hats: new Set(), fish: [] };
    const addBox = (x0, y0, z0, x1, y1, z1) => { const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }; world.colliders.push(c); b.boxes.push(c); return c; };
    const ctx = {
      home, jp, JP: CHINA, world, rng: (s) => rng(s),
      label: world.label,
      addBox, addBoxJ: (x0, y0, z0, x1, y1, z1) => addBox(x0 + CHINA.x, y0, z0 + CHINA.z, x1 + CHINA.x, y1, z1 + CHINA.z),
      use(u) { const it = { id: 'ev', ev: kind, pos: u.pos.clone(), reach: u.reach || 2.2, kind: u.kind, data: u.data || {} }; world.interactables.push(it); b.uses.push(it); return it; },
      bulbs(parent, colors) { const bb = A.createBulbs(parent, colors); b.bulbs.push(bb); return bb; },
      fireworks(parent) { const f = A.createFireworks(parent); b.fw.push(f); return f; },
      doors: world.interactables.filter(i => i.id === 'ndoor').map(i => ({ pos: i.pos.clone(), name: i.house.name, out: i.pos.clone().sub(i.house.g.getWorldPosition(new THREE.Vector3())).setY(0).normalize() })),
      free: (x, z, w = 'home') => freeSpot(x, z, w),
    };
    b.d = DECOR[kind](ctx) || {};
    for (const bb of b.bulbs) bb.finish();
    // what moves or hides stays apart; the rest is merged into a few draw calls
    for (const s of b.d.spots || []) s.obj.userData.keep = true;
    for (const r of b.roots) { r.traverse(o => { if (o.isSprite || o.isPoints || o.isLineSegments) o.userData.keep = true; }); keepMoving(r); mergeStatic(r, (o) => !!o.userData.keep); }
    built.set(kind, b);
  }
  // anything animated by a decor's update is a direct child group with children of its own:
  // those keep their own meshes (mergeStatic leaves groups marked keep alone)
  function keepMoving(root) { for (const o of root.children) if (o.isGroup && (o.userData.wings || o.userData.legs || o.userData.inst || o.userData.cloth)) o.userData.keep = true; }
  function teardown(kind) {
    const b = built.get(kind);
    if (!b) return;
    for (const c of b.boxes) { const i = world.colliders.indexOf(c); if (i >= 0) world.colliders.splice(i, 1); }
    for (const u of b.uses) { const i = world.interactables.indexOf(u); if (i >= 0) world.interactables.splice(i, 1); }
    for (const h of b.hats) h.removeFromParent();
    for (const f of b.fish) f.removeFromParent();
    if (b.fish.length) for (const p of world.walkers.home.people) delete p.evFish;
    if (fishIt.ev === kind) fishIt.off = true;
    for (const r of b.roots) dispose(r);
    built.delete(kind);
  }
  function freeSpot(x, z, w) {
    const ox = w === 'home' ? 0 : CHINA.x, oz = w === 'home' ? 0 : CHINA.z;
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4, r = k ? .8 + k * .3 : 0;
      const X = x + Math.cos(a) * r, Z = z + Math.sin(a) * r;
      if (Math.abs(X) < 8.4 && Math.abs(Z) < 8.4) continue;         // the dig plots
      const wx = X + ox, wz = Z + oz;
      if (!world.colliders.some(c => !c.off && c.min.y < 1.2 && c.max.y > .15 && wx > c.min.x - .45 && wx < c.max.x + .45 && wz > c.min.z - .45 && wz < c.max.z + .45)) return [X, Z];
    }
    return null;
  }

  // ---------- helpers the rules use ----------
  function helpers(ev) {
    const P = PLAY[ev.id] || {};
    const st = stOf(ev.key);
    const cur = P.cur || ['bonbon', 'bonbons'];
    return {
      st, day: dayKey(), audio, ev,
      toast: (s, bad = false, ms) => ui.toast(s, bad, ms),
      hint: (s) => hooks.hintOnce('ev-' + ev.id + s.length, s, 5000),
      deny: (s) => { audio.deny(); ui.toast(s, true); },
      unlock: (k) => hooks.unlock(k),
      coins: (v) => { eco.earn(v); ui.plus('+' + ui.fmt(v)); ui.setCoins(eco.s.money, true); audio.sell(); },
      cur: (n) => { st.cur = (st.cur || 0) + n; ui.plus(`+${n} ${n > 1 ? cur[1] : cur[0]}`); },
      pay: (v) => { if (!eco.pay(v)) { audio.deny(); ui.toast('pas assez de pièces', true); return false; } ui.setCoins(eco.s.money, true); return true; },
      give: (id, n) => { for (let i = 0; i < n; i++) eco.give(id); },
      nameOf: (id) => eco.nameOf(id),
      heal: (n) => hooks.heal(n), battery: () => hooks.battery(), speed: (s) => hooks.speed(s), grav: (s) => hooks.grav(s),
      flip: () => { const f = built.get('crepes')?.d.flip; if (f) f.userData.fly = .9; audio.pop(); },
      spook: () => { spookEl.classList.add('on'); audio.tagged(); setTimeout(() => spookEl.classList.remove('on'), 700); },
      untilMidnight: () => { const h = hooks.hour(); const left = (24 - h) % 24; return left < 1.3 || h < 1.3 ? 'regarde le ciel, c\'est maintenant !' : `à minuit, sur le village · dans ${Math.ceil(left)} h de jeu`; },
    };
  }
  const evOf = (id) => active.find(e => e.id === id || kindOf(e.id) === id);

  // ---------- the hunts ----------
  function huntsHere() {
    const out = [];
    for (const e of active) {
      const P = PLAY[e.id], b = built.get(kindOf(e.id));
      if (!P?.hunt || !b?.d.spots) continue;
      out.push({ e, P, spots: b.d.spots });
    }
    return out;
  }
  function take(e, P, s, local) {
    const set = tk(e.key);
    if (set.has(s.id)) return;
    set.add(s.id);
    s.obj.visible = false;
    if (!local) return;
    const st = stOf(e.key);
    if (!hooks.multi) st.got = [...set];
    st.mine = (st.mine || 0) + 1;
    const h = helpers(e);
    const H = P.hunt;
    hooks.sendOp({ k: 'ev', key: e.key, i: s.id, by: hooks.myName() });
    if (H.cur) st.cur = (st.cur || 0) + H.cur;
    eco.earn(H.coins); ui.setCoins(eco.s.money, true);
    ui.plus(`+${H.coins}` + (H.cur ? ` · +${H.cur} ${P.cur?.[1] || ''}` : ''));
    ui.toast(`${H.one} trouvé${H.one.endsWith('e') && !H.one.endsWith('é') ? 'e' : ''} · ${set.size}/${spotsN(e)}`, false, 1800);
    audio.pickup(3);
    if (s.gold && H.gold) { h.coins(H.gold.coins); ui.toast(H.gold.text, false, 3200); h.unlock(H.gold.ach); audio.win(); }
    cardPop();
    checkDone(e);
    hooks.save();
  }
  const spotsN = (e) => built.get(kindOf(e.id))?.d.spots?.length || 0;
  function checkDone(e) {
    const P = PLAY[e.id], st = stOf(e.key);
    if (!P?.hunt || st.done || tk(e.key).size < spotsN(e) || !spotsN(e)) return;
    st.done = true;
    eco.earn(P.hunt.done); ui.setCoins(eco.s.money, true); ui.plus('+' + ui.fmt(P.hunt.done));
    hooks.unlock(P.hunt.ach);
    ui.layer(`${P.hunt.many} : tous trouvés !`, hooks.multi ? `le jardin a tout trouvé · +${P.hunt.done} ● pour chacun` : `+${P.hunt.done} ●`);
    audio.win();
  }
  let visT = 0;
  function updateHunts(dt, here, pos, eyeY) {
    visT -= dt;
    const checkVis = visT <= 0;
    if (checkVis) visT = .25;
    const T = terrains.home;
    for (const { e, P, spots } of huntsHere()) {
      const set = tk(e.key);
      for (const s of spots) {
        if (set.has(s.id)) { s.obj.visible = false; continue; }
        if (s.buried && checkVis) { const [i, j, k] = T.cellOf(s.p.x, s.p.y, s.p.z); s.obj.visible = !T.solidCell(i, j, k); }
        if (!pos || (s.w === 'china') !== (here === 'china') || !s.obj.visible) continue;
        const dx = pos.x - s.p.x, dz = pos.z - s.p.z, dy = pos.y - s.p.y;
        const near = s.buried ? Math.hypot(dx, dz, eyeY - s.p.y) < 1.9 || Math.hypot(dx, dz, dy) < 1.3 : Math.hypot(dx, dz) < 1.25 && dy > -1.2 && dy < 1.8;
        if (near) take(e, P, s, true);
      }
    }
  }

  // ---------- the card ----------
  function cardPop() { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
  function mainEvent(here) {
    const jp = here === 'china';
    const withCard = active.filter(e => PLAY[e.id]?.hunt || PLAY[e.id]?.card);
    return withCard.find(e => (BY_ID[e.id].region === 'jp') === jp) || withCard[0] || null;
  }
  function renderCard(here) {
    const e = mainEvent(here);
    const show = !!e && hooks.cardOk();
    if (!show) { if (!card.classList.contains('hidden')) { card.classList.add('hidden'); document.body.classList.remove('has-ev'); } return; }
    const P = PLAY[e.id], st = stOf(e.key), E = BY_ID[e.id];
    let c;
    if (P.hunt) {
      const n = tk(e.key).size, of = spotsN(e);
      const sub = st.done ? `tous trouvés ! ${P.hunt.done} ● de bonus` : P.hunt.sub;
      c = { title: P.hunt.title, sub, n, of, word: `${n}/${of}`, extra: hooks.multi ? `dont ${st.mine || 0} par toi` : '' };
    } else c = P.card(helpers(e));
    if (P.cur && st.cur) c.extra = [c.extra, `${st.cur} ${st.cur > 1 ? P.cur[1] : P.cur[0]}` + (P.stall ? ' · à dépenser au stand de la place' : '')].filter(Boolean).join(' · ');
    const pct = c.of ? Math.min(100, c.n / c.of * 100) : 0;
    const html = `<div class="ek"><i></i>${E.name} · ${e.forced ? 'forcé' : `jusqu'au ${fmtDay(e.to)}`}</div><div class="et">${c.title}</div><div class="es">${c.sub}</div>` +
      (c.of ? `<div class="em"><div class="eb"><b style="width:${pct}%"></b></div><div class="en">${c.word || `${c.n}/${c.of}`}</div></div>` : c.word ? `<div class="em"><div class="en">${c.word}</div></div>` : '') +
      (c.extra ? `<div class="ec">${c.extra}</div>` : '');
    let measure = false;
    if (html !== cardHtml) { cardHtml = html; card.innerHTML = html; card.style.setProperty('--ev', TINT[e.id] || '#ffb020'); measure = true; }
    if (card.classList.contains('hidden')) { card.classList.remove('hidden'); document.body.classList.add('has-ev'); measure = true; }
    const k = e.key;
    if (k !== cardKey) { cardKey = k; cardPop(); }
    if (measure) document.body.style.setProperty('--evh', card.offsetHeight + 'px');
  }

  // ---------- poisson d'avril: a fish on a back ----------
  const fishIt = { id: 'ev', ev: 'poisson', kind: 'fish', pos: new THREE.Vector3(), reach: 2, off: true, data: {} };
  world.interactables.push(fishIt);
  let toastT = 60;
  function updateFish(dt, here, pos) {
    const b = built.get('poisson');
    fishIt.off = true;
    if (!b || here !== 'home' || !pos) return;
    const W = world.walkers.home;
    if (!b.primed) { b.primed = true; W.people.slice(0, 5).forEach((p, i) => { if (i % 2 === 0) stickFish(b, p); }); }
    let best = null, bd = 2.2;
    const tmp = new THREE.Vector3();
    for (const p of W.people) {
      if (p.evFish || !p.g.visible || p.mode !== 'walk') continue;
      p.g.getWorldPosition(tmp);
      const d = Math.hypot(pos.x - tmp.x, pos.z - tmp.z);
      if (d > bd) continue;
      // behind them: where they're walking away from
      const fx = Math.sin(p.g.rotation.y), fz = Math.cos(p.g.rotation.y);
      if ((pos.x - tmp.x) * fx + (pos.z - tmp.z) * fz > .2) continue;
      best = p; bd = d;
    }
    if (best) { best.g.getWorldPosition(fishIt.pos); fishIt.pos.y = 1; fishIt.walker = best; fishIt.off = false; }
    // silly news, now and then
    toastT -= dt;
    if (toastT <= 0 && hooks.state() === 'play') { toastT = 75 + Math.random() * 60; const l = PLAY.poisson.toasts; ui.toast(l[Math.floor(Math.random() * l.length)], false, 4200); }
  }
  function stickFish(b, p) {
    const f = paperFish([0x6ab0e8, 0xf2a43a, 0x6ac86a, 0xe8384f][b.fish.length % 4]);
    f.position.set(0, 1.18, -.21); f.rotation.set(0, Math.PI, Math.PI / 2 + .3); f.scale.setScalar(1.3);
    p.g.add(f); p.evFish = f; b.fish.push(f);
  }

  // ---------- moles in costume ----------
  let hatT = 0;
  function updateHats(dt) {
    hatT -= dt;
    if (hatT > 0) return;
    hatT = .5;
    const kind = built.get('halloween') ? 'witch' : built.get('noel') ? 'santa' : null;
    const b = built.get(kind === 'witch' ? 'halloween' : 'noel');
    if (!kind || !b) return;
    for (const m of moles.list) {
      if (m.g.userData.evHat) continue;
      const h = kind === 'witch' ? witchHat() : santaHat();
      h.position.set(0, .36, .1); h.rotation.x = -.15;
      m.g.add(h); m.g.userData.evHat = h; b.hats.add(h);
      h.addEventListener('removed', () => { if (m.g.userData.evHat === h) delete m.g.userData.evHat; });
    }
  }

  // ---------- ghosts in the hole (halloween) ----------
  function updateGhosts(dt, here, pos) {
    const b = built.get('halloween');
    if (!b?.d.ghosts) return;
    const T = terrains.home;
    for (const g of b.d.ghosts) {
      if (g.gone > 0) {
        g.gone -= dt;
        if (g.gone > 88) { g.g.position.y += dt * 6; g.g.rotation.y += dt * 8; continue; }
        g.g.visible = false; if (g.gone <= 0) g.g.position.copy(g.base);
        continue;
      }
      const [i, j, k] = T.cellOf(g.base.x, g.base.y + .4, g.base.z);
      g.g.visible = !T.solidCell(i, j, k);
      if (!g.g.visible) continue;
      g.g.position.set(g.base.x + Math.sin(t * .7 + g.ph) * .5, g.base.y + Math.sin(t * 1.4 + g.ph) * .2, g.base.z + Math.cos(t * .6 + g.ph) * .5);
      g.g.rotation.y = Math.sin(t * .5 + g.ph);
      if (pos && here === 'home' && g.g.position.distanceTo(pos) < 1.7) {
        g.gone = 90;
        const e = evOf('halloween');
        if (e) { const h = helpers(e); h.cur(1); }
        ui.toast('bouh ! le fantôme file · +1 bonbon', false, 2000);
        audio.whistle();
      }
    }
  }

  // ---------- fireworks: new year at midnight, the 14th of july all night ----------
  let fwT = 0, lastHour = null, burstSeen = false;
  function updateFireworks(dt, here, eye) {
    const ny = built.get('nouvelan'), jl = built.get('juillet');
    const hour = hooks.hour(), night = world.env.night;
    const newYear = !!ny && (hour > 23.6 || hour < 1.3);
    const bastille = !!jl && night > .6;
    const b = newYear ? ny : bastille ? jl : null;
    if (b && here === 'home') {
      fwT -= dt;
      if (fwT <= 0) {
        fwT = newYear ? .35 + Math.random() * .5 : .6 + Math.random() * .9;
        const L = b.d.launchers, from = L[Math.floor(Math.random() * L.length)];
        const colors = bastille ? [[.3, .45, 1], [1, 1, 1], [1, .25, .25]] : null;
        b.d.fireworks.launch(from, { colors });
        if (Math.random() < .3) audio.whistle();
      }
    }
    for (const k of ['nouvelan', 'juillet']) {
      const bb = built.get(k);
      if (!bb) continue;
      bb.d.fireworks.update(dt, (p) => {
        if (here !== 'home') return;
        const d = p.distanceTo(eye);
        if (d < 160 && Math.random() < .8) audio.pop();
        if (!burstSeen && eye.y > -1 && hooks.state() === 'play') { burstSeen = true; hooks.unlock('ev_feu'); }
      });
    }
    // midnight on new year's: the toast, the pocket money once a day
    if (ny && lastHour != null && lastHour > 23 && hour < 1 && here === 'home') {
      const e = evOf('nouvelan'), st = stOf(e.key);
      ui.layer('bonne année !', 'meilleurs vœux de tout le trou');
      audio.win();
      st.seen = true;
      if (eye.y > -1) hooks.unlock('ev_nouvelan');
      if (st.etrennes !== dayKey()) { st.etrennes = dayKey(); helpers(e).coins(200); ui.toast('les étrennes : +200 ●', false, 3000); }
    }
    lastHour = hour;
  }

  // ---------- the fête de la musique: the organ plays by itself ----------
  let organT = 20;
  function updateOrgan(dt, here, pos) {
    if (!built.get('musique') || here !== 'home' || !pos || !organ) return;
    organT -= dt;
    if (organT > 0) return;
    organT = 140;
    if (!organ.playing && Math.hypot(pos.x - 61, pos.z - 25) < 70) organ.play(Math.floor(Math.random() * Math.max(1, songs.length)), 0);
  }

  // ---------- the halloween fog: lower, closer, a violet hue ----------
  function fog(view, eye) {
    if (!built.get('halloween') || view !== 'home' || eye.y < -2 || world.space) return;
    const f = world.scene.fog, n = world.env.night;
    f.near *= .3;
    f.far = Math.min(f.far, 48 + 70 * world.env.day);
    f.color.lerp(HALLOWEEN_FOG, .25 + n * .5);
    world.scene.background.copy(f.color);
  }

  // the first `e` fires the stall's panel; the rest go to the feast's rules
  function useOf(it) { const e = evOf(it.ev) || evOf(it.kind === 'fish' ? 'poisson' : it.ev); return { e, P: e ? PLAY[e.id] : null }; }
  let stallEv = null;

  const api = {
    get active() { return active.map(e => e.id); },
    get list() { return active.slice(); },
    // a season to force while it lasts (noël: snow), unless the host forces one
    get season() { const e = active.find(x => BY_ID[x.id].season != null); return e ? BY_ID[e.id].season : null; },
    on(f) { subs.add(f); return () => subs.delete(f); },
    // what the room says: a hunted thing gone
    onOp(op, local) {
      if (local || !op || typeof op.key !== 'string') return;
      const set = tk(op.key);
      if (set.has(op.i)) return;
      set.add(op.i);
      const e = active.find(x => x.key === op.key);
      if (!e) return;
      const b = built.get(kindOf(e.id)), s = b?.d.spots?.find(x => x.id === op.i);
      if (s) s.obj.visible = false;
      checkDone(e);
    },
    prompt(it) {
      if (it.kind === 'fish') return '<b>e</b> coller un poisson dans son dos';
      const { e, P } = useOf(it);
      if (!e) return '';
      if (it.kind === 'stall') return `<b>e</b> ${P.stall?.title || 'le stand'}`;
      const u = P.uses?.[it.kind];
      return u ? u.prompt(helpers(e), it.data) : '';
    },
    act(it) {
      if (it.kind === 'fish') {
        const b = built.get('poisson'), p = it.walker, e = evOf('poisson');
        if (!b || !p || p.evFish || !e) return;
        stickFish(b, p);
        const st = stOf(e.key); st.fish = (st.fish || 0) + 1;
        ui.toast(st.fish >= 10 ? 'poisson d\'avril ! (dix !)' : `poisson d'avril ! · ${st.fish}/10`, false, 1600);
        audio.squeak();
        if (st.fish >= 10) hooks.unlock('ev_poisson');
        it.off = true; hooks.save();
        return;
      }
      const { e, P } = useOf(it);
      if (!e) return;
      if (it.kind === 'stall') { stallEv = e; hooks.openPanel('ev'); return; }
      P.uses?.[it.kind]?.act(helpers(e), it.data);
      hooks.save();
    },
    // ---------- the stall's counter ----------
    panel(quip) {
      const e = stallEv && active.includes(stallEv) ? stallEv : null;
      if (!e) return { title: 'le stand est fermé', rows: [], close: 'fermer' };
      const P = PLAY[e.id], S = P.stall, st = stOf(e.key), cur = P.cur;
      const have = st.cur || 0;
      const rows = S.shelf.map(x => {
        const c = x.cost.cur ? `${x.cost.cur} ${x.cost.cur > 1 ? cur[1] : cur[0]}` : null;
        return { id: 'ev:eat:' + x.id, kind: 'de saison', name: x.name, sub: x.sub + (c ? ` · ${c}` : ''), price: x.cost.coins ?? null, lock: x.cost.cur && have < x.cost.cur ? `${c}` : null, poor: x.cost.coins != null && eco.s.money < x.cost.coins };
      });
      if (S.rate && cur) {
        rows.push({ id: 'ev:swap1', kind: 'échange', name: `1 ${cur[0]} → ${S.rate} ●`, sub: `tu en as ${have}`, lock: have < 1 ? 'il en faut une' : null });
        if (have > 1) rows.push({ id: 'ev:swapall', kind: 'échange', name: `tout : ${have} ${cur[1]} → ${ui.fmt(have * S.rate)} ●`, sub: 'la fête a du bon' });
      }
      return { title: S.title, quip, rows, note: `${BY_ID[e.id].name} · seulement pendant la fête`, close: 'retour à la fête' };
    },
    click(id) {
      const e = stallEv;
      if (!e) return 'deny';
      const P = PLAY[e.id], S = P.stall, st = stOf(e.key), h = helpers(e);
      if (id.startsWith('ev:eat:')) {
        const x = S.shelf.find(s => s.id === id.slice(7));
        if (!x) return 'deny';
        if (x.cost.cur) { if ((st.cur || 0) < x.cost.cur) return 'deny'; st.cur -= x.cost.cur; }
        else if (!eco.pay(x.cost.coins)) return 'deny';
        x.eat(h); audio.buy(); ui.setCoins(eco.s.money, true); hooks.save();
        return pickQuip();
      }
      if (id === 'ev:swap1' || id === 'ev:swapall') {
        const n = id === 'ev:swap1' ? 1 : st.cur || 0;
        if (!n || (st.cur || 0) < n) return 'deny';
        st.cur -= n; h.coins(n * S.rate); hooks.save();
        return 'merci !';
      }
      return 'deny';
    },
    update(dt) {
      t += dt;
      checkT -= dt;
      if (checkT <= 0) { checkT = 20; apply(resolve()); }
      const here = hooks.here(), view = hooks.view(), state = hooks.state();
      const pos = hooks.pos(), eye = hooks.eye();
      const playing = state === 'play';
      if (bannerFor && playing) { const E = BY_ID[bannerFor.id]; ui.layer(E.name, E.sub); audio.win(); bannerFor = null; }
      const env = world.env;
      for (const [, b] of built) {
        for (const bb of b.bulbs) bb.update(t, env.night);
        b.d.update?.(dt, t, env);
        b.d.blossoms?.setNight(env.night);
      }
      updateHunts(dt, here, playing ? pos : null, eye.y);
      updateFish(dt, here, playing ? pos : null);
      updateHats(dt);
      updateGhosts(dt, here, playing ? pos : null);
      updateFireworks(dt, here, eye);
      updateOrgan(dt, here, pos);
      fog(view, eye);
      renderCard(here);
    },
    // for tests and the curious
    get built() { return [...built.keys()]; },
    spotsOf: (id) => built.get(kindOf(id))?.d.spots || [],
    taken, resolve, apply: (l) => apply(l),
    refresh() { checkT = 0; },
  };
  const QUIPS = ['bonne fête !', 'c\'est de saison.', 'fait maison, ou presque.', 'on en reprend ?'];
  const pickQuip = () => QUIPS[Math.floor(Math.random() * QUIPS.length)];
  // the host's word, or the server's new day: looked at again straight away
  tun.on((k) => { if (k === 'event' || k == null) checkT = 0; });
  serverClock.on(() => { checkT = 0; });
  apply(resolve());
  bannerFor = active[0] || null;
  return api;
}
