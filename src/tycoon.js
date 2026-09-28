// tycoon.js: « colonie martienne » — a base on mars that keeps running while you're away (up to 8 hours).
// Build on a grid, feed the colonists, research, export alloys for credits, and send the credits home as coins
// or trade them for supplies. The colony lives in the save (eco.s.tycoon). Online, everyone builds the host's colony.
import { W, H, P, clamp, rng, createScreen, makeCanvas, createGui, createKeys, createSfx, txt, title, box, bar, hexOf, wrap } from './mars-kit.js';
import { ITEMS } from './economy.js';

const CW = 14, CH = 9, CS = 20, GX = 4, GY = 19;   // the grid: 14×9 cells of 20 px
const OFFLINE = 8 * 3600, STEP = 5;
const RES = ['power', 'water', 'o2', 'food', 'metal', 'alloy', 'sci', 'cr'];
const RN = { power: 'énergie', water: 'eau', o2: 'oxygène', food: 'nourriture', metal: 'métal', alloy: 'alliages', sci: 'science', cr: 'crédits' };
const RC = { power: '#ffcc4a', water: '#5fb8e8', o2: '#9be8ff', food: '#8ef08a', metal: '#b9c4cc', alloy: '#e0a0ff', sci: '#7fa8ff', cr: '#ffd76a' };
// per minute at level 1. in / out: resources; pw: power (+ made, - used); wk: workers; dep: the ground it wants
const B = {
  solar: { name: 'panneaux solaires', sub: 'de l\'énergie, sans personne', cost: { metal: 15 }, pw: 10 },
  drill: { name: 'foreuse', sub: 'du métal · sur un filon, quatre fois plus', cost: { metal: 25 }, pw: -5, wk: 1, out: { metal: 12 }, dep: 'ore' },
  ice: { name: 'extracteur de glace', sub: 'de l\'eau · sur la glace, quatre fois plus', cost: { metal: 20 }, pw: -4, wk: 1, out: { water: 12 }, dep: 'ice' },
  oxy: { name: 'oxygénateur', sub: 'l\'eau devient de l\'oxygène', cost: { metal: 30 }, pw: -4, wk: 1, in: { water: 4 }, out: { o2: 10 } },
  farm: { name: 'serre à patates', sub: 'de la nourriture, contre un peu d\'eau', cost: { metal: 35 }, pw: -3, wk: 2, in: { water: 4 }, out: { food: 10 } },
  hab: { name: 'habitat', sub: 'loge 5 colons par niveau', cost: { metal: 40 }, pw: -1, house: 5 },
  refine: { name: 'raffinerie', sub: 'le métal devient des alliages', cost: { metal: 60, cr: 20 }, pw: -6, wk: 2, in: { metal: 8 }, out: { alloy: 3 } },
  store: { name: 'entrepôt', sub: 'plus de place pour tout garder', cost: { metal: 50 }, pw: 0, cap: 150 },
  lab: { name: 'laboratoire', sub: 'de la science pour la recherche', cost: { metal: 50, cr: 40 }, pw: -4, wk: 2, out: { sci: 3 } },
  port: { name: 'astroport', sub: 'exporte les alliages vers la terre : des crédits', cost: { metal: 120, alloy: 15 }, pw: -6, wk: 3, in: { alloy: 2 }, out: { cr: 25 }, max: 1 },
  rtg: { name: 'générateur rtg', sub: 'beaucoup d\'énergie, jour et nuit', cost: { metal: 120, cr: 150 }, pw: 45, need: 'nuke' },
};
const ORDER = ['solar', 'drill', 'ice', 'oxy', 'farm', 'hab', 'refine', 'store', 'lab', 'port', 'rtg'];
const TECH = [
  { id: 'sun', name: 'panneaux souples', sub: 'panneaux solaires +50 %', cost: 40 },
  { id: 'deep', name: 'forage profond', sub: 'foreuses et glace +50 %', cost: 60 },
  { id: 'recy', name: 'recyclage', sub: 'les colons consomment 30 % de moins', cost: 60 },
  { id: 'hydro', name: 'hydroponie', sub: 'serres et oxygénateurs +50 %', cost: 80 },
  { id: 'nuke', name: 'nucléaire', sub: 'débloque le générateur rtg', cost: 120, req: 'sun' },
  { id: 'robot', name: 'automatisation', sub: 'moitié moins d\'ouvriers', cost: 150, req: 'deep' },
  { id: 'logi', name: 'logistique', sub: 'entrepôts deux fois plus grands', cost: 100 },
  { id: 'trade', name: 'commerce', sub: 'astroport +50 % et meilleur taux vers la terre', cost: 160, req: 'logi' },
  { id: 'terra', name: 'terraformation', sub: 'tout produit 25 % de plus', cost: 400, req: 'nuke' },
];
const SHIP = [['dyn', 3, 90], ['sup', 1, 260], ['med', 2, 110], ['cell', 2, 120], ['ladder', 5, 90], ['fus', 1, 700]];
const MAXLV = 5;
const lvF = (lv) => 1 + .75 * (lv - 1);
const upCost = (k, lv) => Object.fromEntries(Object.entries(B[k].cost).map(([r, v]) => [r, Math.round(v * Math.pow(1.8, lv))]));
const fmt = (v) => v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 100 ? Math.floor(v).toString() : (Math.floor(v * 10) / 10).toString().replace('.', ',');
const fmtDur = (s) => s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : s >= 60 ? `${Math.floor(s / 60)} min` : `${Math.floor(s)} s`;

// ---------- a colony ----------
export function freshColony(seed = Math.floor(Math.random() * 1e9)) {
  const R = rng(seed), ground = [];
  for (let i = 0; i < CW * CH; i++) ground.push(0);
  const blob = (kind, n, r) => { for (let k = 0; k < n; k++) { const cx = Math.floor(R() * CW), cy = Math.floor(R() * CH); for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < CW && y < CH && R() < .75 && Math.abs(x - cx) + Math.abs(y - cy) <= r) ground[y * CW + x] = kind; } };
  blob(1, 3, 1);   // ore
  blob(2, 3, 1);   // ice
  blob(3, 5, 0);   // rocks
  const C = { v: 1, seed, t: Date.now(), ground, grid: new Array(CW * CH).fill(null), res: { water: 30, o2: 40, food: 40, metal: 90, alloy: 0, sci: 0, cr: 40 }, pop: 3, grow: 0, starve: 0, tech: {}, earned: 0, sent: 0, made: 0 };
  // a first base in the middle, set on the right ground
  const put = (k, want) => { let best = -1; for (let i = 0; i < CW * CH; i++) { const x = i % CW, y = Math.floor(i / CW); if (C.grid[i] || ground[i] === 3) continue; if (want != null && ground[i] !== want) continue; const d = Math.abs(x - 6.5) + Math.abs(y - 4); if (best < 0 || d < Math.abs(best % CW - 6.5) + Math.abs(Math.floor(best / CW) - 4)) best = i; } if (best < 0) return put(k, null); C.grid[best] = { k, lv: 1 }; };
  put('hab', 0); put('solar', 0); put('solar', 0); put('ice', 2); put('oxy', 0); put('farm', 0);
  return C;
}
const caps = (C) => { let n = 0; for (const b of C.grid) if (b?.k === 'store') n += lvF(b.lv); const m = C.tech.logi ? 2 : 1; return { base: 120 + 150 * n * m, cr: 600 + 600 * n * m }; };
const housing = (C) => { let n = 0; for (const b of C.grid) if (b?.k === 'hab') n += 5 * b.lv; return n; };
function mult(C, k) {
  let m = C.tech.terra ? 1.25 : 1;
  if (k === 'solar' && C.tech.sun) m *= 1.5;
  if ((k === 'drill' || k === 'ice') && C.tech.deep) m *= 1.5;
  if ((k === 'farm' || k === 'oxy') && C.tech.hydro) m *= 1.5;
  if (k === 'port' && C.tech.trade) m *= 1.5;
  return m;
}
const workers = (C, b) => { const w = B[b.k].wk || 0; return w ? Math.ceil((w + Math.floor((b.lv - 1) / 2)) * (C.tech.robot ? .5 : 1)) : 0; };
// one step of the colony (dt in seconds); `ev`: what's going on (storm…)
function sim(C, dt, ev = {}) {
  const m = dt / 60, cap = caps(C), R = C.res;
  let prod = 0, cons = 0, need = 0;
  C.grid.forEach((b, i) => {
    if (!b || b.dmg) return;
    const d = B[b.k], f = lvF(b.lv);
    if (d.pw > 0) prod += d.pw * f * mult(C, b.k) * (b.k === 'solar' && ev.storm ? .3 : 1);
    else cons += -d.pw * f;
    need += workers(C, b);
  });
  const pr = cons > 0 ? Math.min(1, prod / cons) : 1, lab = need > 0 ? Math.min(1, C.pop / need) : 1;
  const flow = { power: prod - cons };
  C.grid.forEach((b, i) => {
    if (!b || b.dmg) return;
    const d = B[b.k];
    if (!d.out) return;
    let f = lvF(b.lv) * mult(C, b.k) * pr * (d.wk ? lab : 1) * (ev.flare ? .5 : 1);
    if (d.dep) f *= C.ground[i] === (d.dep === 'ore' ? 1 : 2) ? 1 : .25;
    if (d.in && m > 0) for (const r in d.in) f = Math.min(f, R[r] / (d.in[r] * m));
    f = Math.max(0, f);
    if (d.in) for (const r in d.in) { R[r] = Math.max(0, R[r] - d.in[r] * f * m); flow[r] = (flow[r] || 0) - d.in[r] * f; }
    for (const r in d.out) { R[r] += d.out[r] * f * m; flow[r] = (flow[r] || 0) + d.out[r] * f; if (r === 'cr') { C.earned += d.out[r] * f * m; } }
  });
  // the colonists breathe, eat, drink
  const eat = C.tech.recy ? .7 : 1, p = C.pop;
  for (const [r, v] of [['o2', 1], ['food', .7], ['water', .5]]) { R[r] = Math.max(0, R[r] - p * v * eat * m); flow[r] = (flow[r] || 0) - p * v * eat; }
  const hungry = R.o2 <= 0 || R.food <= 0 || R.water <= 0;
  if (hungry) { C.starve += dt; if (C.starve > 25 && C.pop > 1) { C.pop--; C.starve = 0; C.left = (C.left || 0) + 1; } C.grow = 0; }
  else {
    C.starve = 0;
    if (C.pop < housing(C) && R.o2 > 5 && R.food > 5) { C.grow += dt; if (C.grow > 30) { C.grow = 0; C.pop++; C.born = (C.born || 0) + 1; } }
  }
  for (const r of ['water', 'o2', 'food', 'metal', 'alloy', 'sci']) R[r] = Math.min(R[r], cap.base * (r === 'sci' ? 2 : 1));
  R.cr = Math.min(R.cr, cap.cr);
  C.made += dt;
  return { flow, pr, lab, need, prod, cons };
}
// everything the colony did while no one was looking
function catchUp(C, sec) {
  sec = Math.min(OFFLINE, Math.max(0, sec));
  if (sec < 1) return null;
  const before = { ...C.res }, pop0 = C.pop;
  let left = sec;
  while (left > 0) { const d = Math.min(STEP, left); sim(C, d); left -= d; }
  const diff = {};
  for (const r in C.res) diff[r] = C.res[r] - before[r];
  return { sec, diff, pop: C.pop - pop0 };
}
// a change asked for by a player: the same on the host and (for feel) on the guest
function act(C, a) {
  const R = C.res, i = a.i, b = C.grid[i];
  const pay = (cost) => { for (const r in cost) if ((R[r] || 0) < cost[r]) return false; for (const r in cost) R[r] -= cost[r]; return true; };
  switch (a.k) {
    case 'build': {
      const d = B[a.b];
      if (!d || b || C.ground[i] === 3 || (d.need && !C.tech[d.need])) return false;
      if (d.max && C.grid.filter((x) => x?.k === a.b).length >= d.max) return false;
      if (!pay(d.cost)) return false;
      C.grid[i] = { k: a.b, lv: 1 }; return true;
    }
    case 'up': if (!b || b.lv >= MAXLV || !pay(upCost(b.k, b.lv))) return false; b.lv++; return true;
    case 'del': if (!b) return false; for (const [r, v] of Object.entries(B[b.k].cost)) R[r] += Math.round(v * .5); C.grid[i] = null; return true;
    case 'fix': if (!b?.dmg || !pay({ metal: 20 * b.lv })) return false; delete b.dmg; return true;
    case 'clear': if (C.ground[i] !== 3 || !pay({ metal: 30 })) return false; C.ground[i] = 0; return true;
    case 'tech': { const t = TECH.find((x) => x.id === a.t); if (!t || C.tech[t.id] || (t.req && !C.tech[t.req]) || R.sci < t.cost) return false; R.sci -= t.cost; C.tech[t.id] = true; return true; }
    case 'cash': { const n = Math.min(Math.floor(R.cr), a.n); if (n <= 0) return false; R.cr -= n; C.sent += n; return n; }
    case 'ship': { const s = SHIP.find((x) => x[0] === a.item); if (!s || R.cr < s[2]) return false; R.cr -= s[2]; return true; }
  }
  return false;
}

export function createTycoon({ audio, ui, eco, pay, save } = {}) {
  const sfx = createSfx(.12);
  let onEnd = () => {};
  let run = null, rect = null, pending = null, lastLeave = null;
  const own = () => { if (!eco) return freshColony(); if (!eco.s.tycoon || eco.s.tycoon.v !== 1) eco.s.tycoon = freshColony(); return eco.s.tycoon; };
  const rate = (C) => C.tech.trade ? 1 : .8;   // crédits → coins

  // ---------- doing things ----------
  function doAct(a) {
    const r = run;
    const ok = act(r.C, a);
    if (!ok) { sfx.nope(); return false; }
    if (!r.host) r.send({ t: 'a', a });
    r.mine++;
    if (a.k === 'build' || a.k === 'up' || a.k === 'fix' || a.k === 'clear') { sfx.build(); puff(a.i); }
    if (a.k === 'tech') { sfx.good(); note(`recherche : ${TECH.find((t) => t.id === a.t).name}`, P.good); }
    if (a.k === 'del') sfx.drop();
    return ok;
  }
  function cash() {
    const C = run.C, n = Math.floor(C.res.cr);
    if (n < 10) { sfx.nope(); note('il faut au moins 10 crédits', P.warn); return; }
    const got = doAct({ k: 'cash', n });
    if (!got) return;
    const coins = Math.round(got * rate(C));
    run.coins += coins;
    pay?.(coins, `colonie martienne : ${got} crédits virés sur terre`);
    sfx.coin(); note(`+${coins} ● sur ton compte`, P.gold);
  }
  function ship(item) {
    const s = SHIP.find((x) => x[0] === item);
    if ((eco?.s.items[item] || 0) >= ITEMS[item].max) { sfx.nope(); note('tu en as déjà plein les poches', P.warn); return; }
    if (!doAct({ k: 'ship', item })) return;
    eco?.give(item, s[1]);
    sfx.coin(); note(`fusée de ravitaillement : ${ITEMS[item].name} ×${s[1]}`, P.gold);
  }
  function puff(i) { const x = GX + (i % CW) * CS + 10, y = GY + Math.floor(i / CW) * CS + 10; for (let k = 0; k < 14; k++) { const a = Math.random() * 7; run.parts.push({ x, y, vx: Math.cos(a) * 20, vy: Math.sin(a) * 14 - 6, life: 0, max: .6, c: P.dust }); } }
  function note(s, c = P.txt) { run.notes.push({ s, c, t: 0 }); if (run.notes.length > 3) run.notes.shift(); }

  // ---------- events (only while someone's there) ----------
  function stepEvents(dt) {
    const r = run, C = r.C;
    for (const k in r.ev) { r.ev[k] -= dt; if (r.ev[k] <= 0) delete r.ev[k]; }
    if (!r.host) return;
    r.evT -= dt;
    if (r.evT > 0) return;
    r.evT = 70 + Math.random() * 70;
    const roll = Math.random(), built = C.grid.map((b, i) => b ? i : -1).filter((i) => i >= 0);
    if (roll < .25) { r.ev.storm = 50; say('tempête de poussière : les panneaux solaires faiblissent', P.warn); }
    else if (roll < .45 && built.length) { const i = built[Math.floor(Math.random() * built.length)]; C.grid[i].dmg = 1; r.meteor = { i, t: 0 }; say(`météorite ! ${B[C.grid[i].k].name} endommagé(e) · clique pour réparer`, P.bad); }
    else if (roll < .65) { const n = 20 + Math.floor(Math.random() * 40); C.res.metal += n; C.res.food += 15; say(`un cargo de la terre : +${n} métal, +15 nourriture`, P.good); }
    else if (roll < .8) { r.ev.flare = 30; say('éruption solaire : les colons s\'abritent, production divisée par deux', P.warn); }
    else { const free = C.ground.map((g, i) => g === 0 && !C.grid[i] ? i : -1).filter((i) => i >= 0); if (free.length) { const i = free[Math.floor(Math.random() * free.length)]; C.ground[i] = Math.random() < .5 ? 1 : 2; say(`les géologues ont trouvé un ${C.ground[i] === 1 ? 'filon de métal' : 'gisement de glace'} !`, P.good); } }
  }
  function say(s, c) { note(s, c); run.send({ t: 'n', s, c, ev: run.ev }); sfx.beep(true); }

  // ---------- network ----------
  function netRecv(id, m) {
    const r = run;
    if (m.t === 'a' && r.host) { act(r.C, m.a); r.dirty = true; }
    else if (m.t === 'c' && id === r.hostId && !r.host) { r.C = m.C; r.ev = m.ev || {}; }
    else if (m.t === 'n' && id === r.hostId) { note(m.s, m.c); r.ev = m.ev || {}; }
  }

  // ---------- the frame ----------
  function step(dt, keys) {
    const r = run, C = r.C;
    r.K.frame(keys);
    r.gui.clicks((c) => clickGrid(c));
    if (r.K.hit('KeyQ') && r.place) r.place = null;
    for (const n of r.notes) n.t += dt;
    r.notes = r.notes.filter((n) => n.t < 6);
    for (const p of r.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    r.parts = r.parts.filter((p) => p.life < p.max);
    if (r.meteor) { r.meteor.t += dt; if (r.meteor.t > 1.2) r.meteor = null; }
    // the host's colony runs on the wall clock: a pause, a trip elsewhere, it catches up
    if (r.host) {
      const now = Date.now(), gap = (now - C.t) / 1000;
      if (gap > 3) { const rep = catchUp(C, gap); if (rep && rep.sec > 60) r.report = rep; }
      else r.stats = sim(C, Math.max(0, gap), r.ev);
      C.t = now;
      if ((r.syncT -= dt) <= 0 || r.dirty) { r.syncT = 1; r.dirty = false; r.send({ t: 'c', C, ev: r.ev }); }
      if ((r.saveT += dt) > 20) { r.saveT = 0; save?.(); }
    } else r.stats = sim(C, dt, r.ev);
    stepEvents(dt);
    if (C.left) { note(`${C.left} colon${C.left > 1 ? 's sont repartis' : ' est reparti'} sur terre : il manque de l'air, de l'eau ou à manger`, P.bad); C.left = 0; sfx.alarm(); }
    if (C.born) { note(`un nouveau colon arrive (${C.pop})`, P.good); C.born = 0; }
  }
  function clickGrid(c) {
    const r = run, C = r.C;
    const gx = Math.floor((c.x - GX) / CS), gy = Math.floor((c.y - GY) / CS);
    if (c.b === 2) { r.place = null; return; }
    if (gx < 0 || gy < 0 || gx >= CW || gy >= CH) return;
    const i = gy * CW + gx;
    if (r.place) {
      if (C.grid[i] || C.ground[i] === 3) { sfx.nope(); return; }
      if (doAct({ k: 'build', i, b: r.place })) { const d = B[r.place]; if (d.max && C.grid.filter((x) => x?.k === r.place).length >= d.max) r.place = null; }
      return;
    }
    r.sel = i; r.tab = 'info'; sfx.click();
  }

  // ---------- drawing: the pixels ----------
  let groundCv = null;
  function paintGround(C) {
    const [c, b] = makeCanvas(W, H), R = rng(C.seed + 5);
    b.fillStyle = P.sand; b.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) { b.fillStyle = [P.sand2, P.sand3, P.sand4][Math.floor(R() * 3)]; b.fillRect(Math.floor(R() * W), Math.floor(R() * H), 1 + Math.floor(R() * 2), 1); }
    for (let i = 0; i < CW * CH; i++) {
      const x = GX + (i % CW) * CS, y = GY + Math.floor(i / CW) * CS, g = C.ground[i];
      if (g === 1) { b.fillStyle = '#5a3a30'; b.fillRect(x + 2, y + 3, 16, 14); for (let k = 0; k < 9; k++) { b.fillStyle = k % 3 ? '#9aa4ad' : '#e8eef2'; b.fillRect(x + 3 + Math.floor(R() * 14), y + 4 + Math.floor(R() * 12), 2, 1); } }
      if (g === 2) { b.fillStyle = '#cfe6ee'; b.fillRect(x + 3, y + 4, 14, 12); b.fillStyle = '#eaf6fa'; b.fillRect(x + 4, y + 5, 8, 5); b.fillStyle = '#9ec8d8'; b.fillRect(x + 10, y + 11, 6, 4); }
      if (g === 3) { b.fillStyle = P.rock2; b.fillRect(x + 3, y + 7, 15, 11); b.fillStyle = P.rock; b.fillRect(x + 2, y + 5, 14, 11); b.fillStyle = '#8a4a30'; b.fillRect(x + 3, y + 5, 10, 2); }
    }
    b.strokeStyle = 'rgba(80,30,15,.12)'; b.lineWidth = 1;
    for (let x = 0; x <= CW; x++) { b.beginPath(); b.moveTo(GX + x * CS + .5, GY); b.lineTo(GX + x * CS + .5, GY + CH * CS); b.stroke(); }
    for (let y = 0; y <= CH; y++) { b.beginPath(); b.moveTo(GX, GY + y * CS + .5); b.lineTo(GX + CW * CS, GY + y * CS + .5); b.stroke(); }
    groundCv = c; groundCv.key = C.ground.join('');
  }
  function drawB(b, k, lv, x, y, t, o = {}) {
    const on = !o.dmg && !o.off;
    const f = (c, a, bb, w, h) => { b.fillStyle = c; b.fillRect(x + a, y + bb, w, h); };
    f('rgba(0,0,0,.25)', 2, 16, 17, 3);
    switch (k) {
      case 'solar': { const n = lv >= 3 ? 4 : 2; for (let q = 0; q < n; q++) { const i = q % 2, j = n > 2 ? Math.floor(q / 2) : .5; f('#333', 4 + i * 9, 6 + j * 8, 1, 3); f(lv >= 5 ? '#1e3a5a' : P.panel, 1 + i * 9, 1 + j * 8, 9, 6); f(P.cell, 2 + i * 9, 2 + j * 8, 3, 2); f(P.cell, 6 + i * 9, 2 + j * 8, 3, 2); f(P.cell, 2 + i * 9, 5 + j * 8, 3, 1); f(P.cell, 6 + i * 9, 5 + j * 8, 3, 1); }
        if (on && Math.sin(t * 2 + x) > .9) f('#fff', 3, 3, 1, 1); break; }
      case 'drill': { f('#6a6a6a', 5, 10, 10, 7); f('#9aa4ad', 8, 1, 4, 11); f('#e07a3a', 6, 1, 8, 2); const a = on ? Math.floor(t * 8) % 2 : 0; f('#444', 8 + a, 15, 4, 3); f('#c9c9c9', 9 - a, 16, 2, 2); break; }
      case 'ice': f('#8a9aa4', 3, 6, 14, 10); f('#5fb8e8', 5, 8, 10, 6); f('#dff4ff', 6, 9, 4, 2); f('#555', 14, 2, 2, 6); if (on && Math.sin(t * 4 + x) > 0) f('#9be8ff', 14, 1, 2, 1); break;
      case 'oxy': f('#b9c4cc', 3, 5, 6, 11); f('#b9c4cc', 11, 5, 6, 11); f('#e8eef2', 4, 6, 4, 3); f('#e8eef2', 12, 6, 4, 3); f('#5e6873', 9, 10, 2, 2); if (on) f(Math.sin(t * 3 + x) > 0 ? '#9be8ff' : '#5fb8e8', 5, 11, 2, 2); break;
      case 'farm': f('#b9b0a2', 1, 5, 18, 12); f('rgba(190,240,190,.6)', 2, 4, 16, 10); for (let i = 0; i < 4; i++) { f('#3f8f3a', 3 + i * 4, 9, 2, 3); f(on ? '#8ef08a' : '#8a7a3a', 3 + i * 4, 7 + (i % 2), 3, 2); } f('rgba(255,255,255,.5)', 3, 5, 12, 1); break;
      case 'hab': { f('#8a8174', 1, 6, 18, 11); f(P.hab, 2, 4, 16, 11); f('#cfc6b8', 4, 3, 12, 2); for (let i = 0; i < Math.min(3, lv); i++) f(on ? (Math.sin(t * .5 + i + x) > -.6 ? '#ffe08a' : '#6a5a3a') : '#333', 4 + i * 5, 9, 3, 3); if (lv > 3) f(P.hab2, 14, 1, 4, 4); break; }
      case 'refine': f('#6d5f4a', 2, 7, 16, 10); f('#9a8264', 3, 5, 8, 6); f('#555', 13, 1, 3, 9); f('#e0a0ff', 5, 12, 4, 2); if (on && Math.random() < .2) run.parts.push({ x: x + 14, y: y, vx: (Math.random() - .5) * 4, vy: -8, life: 0, max: 1.2, c: 'rgba(80,70,70,.6)' }); break;
      case 'store': f('#7a6a52', 2, 6, 16, 11); f('#a88c64', 3, 7, 6, 4); f('#a88c64', 11, 7, 6, 4); f('#a88c64', 3, 12, 6, 4); f('#a88c64', 11, 12, 6, 4); f('#5a4a36', 2, 5, 16, 1); break;
      case 'lab': f('#e8e2d6', 2, 5, 16, 12); f('#7fa8ff', 4, 8, 12, 3); f('#b9b0a2', 9, 1, 2, 5); f(on && Math.sin(t * 6) > 0 ? '#ff4d4d' : '#6a1a1a', 9, 0, 2, 2); break;
      case 'port': { f('#5e6873', 0, 13, 20, 5); f('#ffcc4a', 2, 15, 16, 1); const up = run.launch && run.launch.i === o.i ? run.launch.t * run.launch.t * 30 : 0; f('#e8e2d6', 8, 2 - up, 4, 12); f('#d84a3a', 8, 1 - up, 4, 2); f('#888', 7, 11 - up, 1, 3); f('#888', 12, 11 - up, 1, 3); if (up) f(Math.random() < .5 ? '#ffcc4a' : '#ff6a2a', 8, 14 - up, 4, 3 + Math.random() * 3); break; }
      case 'rtg': f('#4b5563', 4, 4, 12, 13); for (let i = 0; i < 4; i++) f('#9aa4ad', 3, 5 + i * 3, 14, 1); f(P.gold, 8, 8, 4, 4); f('#222', 9, 9, 2, 2); break;
    }
    if (lv > 1 && !o.ghost) for (let i = 0; i < lv - 1; i++) f(P.gold, 1 + i * 3, 1, 2, 2);
    if (o.dmg) { f('rgba(20,10,10,.5)', 0, 0, 20, 20); f('#ff4d4d', 8, 6, 4, 1); f('#ff4d4d', 9, 5, 2, 3); if (Math.random() < .3) run.parts.push({ x: x + 10, y: y + 6, vx: 0, vy: -10, life: 0, max: 1, c: 'rgba(60,50,50,.6)' }); }
  }
  // an icon for the panels, on the crisp layer
  const icons = new Map();
  function icon(k) {
    if (!icons.has(k)) { const [c, b] = makeCanvas(20, 20); const keep = run.parts; drawB(b, k, 1, 0, 0, 0, { ghost: true }); run.parts = keep; icons.set(k, c); }
    return icons.get(k);
  }

  function render() {
    const r = run, C = r.C, sc = r.scr, b = sc.b, t = r.clock;
    if (!groundCv || groundCv.key !== C.ground.join('')) paintGround(C);
    b.drawImage(groundCv, 0, 0);
    // colonists wander between the buildings
    const built = C.grid.map((x, i) => x ? i : -1).filter((i) => i >= 0);
    while (r.walkers.length < Math.min(C.pop, 24)) r.walkers.push({ x: GX + 140, y: GY + 90, to: 0, t: 0 });
    r.walkers.length = Math.min(r.walkers.length, C.pop, 24);
    C.grid.forEach((bd, i) => { if (bd) drawB(b, bd.k, bd.lv, GX + (i % CW) * CS, GY + Math.floor(i / CW) * CS, t, { dmg: bd.dmg, i }); });
    for (const w of r.walkers) {
      const ti = built[w.to % Math.max(1, built.length)] ?? 0, tx = GX + (ti % CW) * CS + 10, ty = GY + Math.floor(ti / CW) * CS + 18;
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      if (d < 2) { w.t += 1 / 60; if (w.t > 1) { w.t = 0; w.to = Math.floor(Math.random() * 999); } }
      else { w.x += dx / d * .35; w.y += dy / d * .35; }
      b.fillStyle = '#f2ede4'; b.fillRect(Math.round(w.x), Math.round(w.y) - 3, 2, 3); b.fillStyle = '#e07a3a'; b.fillRect(Math.round(w.x), Math.round(w.y) - 2, 2, 1);
    }
    for (const p of r.parts) { b.fillStyle = p.c; b.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    if (r.meteor) { const i = r.meteor.i, k = r.meteor.t / 1.2, x = GX + (i % CW) * CS + 10, y = GY + Math.floor(i / CW) * CS + 10; b.fillStyle = '#ffcc4a'; b.fillRect(Math.round(x + (1 - k) * 80), Math.round(y - (1 - k) * 90), 3, 3); b.fillStyle = 'rgba(255,150,60,.6)'; b.fillRect(Math.round(x + (1 - k) * 80) + 3, Math.round(y - (1 - k) * 90) - 3, 3, 3); }
    // the building about to go down, following the mouse
    const m = sc.mouse, gx = Math.floor((m.x - GX) / CS), gy = Math.floor((m.y - GY) / CS);
    if (r.place && gx >= 0 && gy >= 0 && gx < CW && gy < CH) {
      const i = gy * CW + gx, bad = C.grid[i] || C.ground[i] === 3;
      b.globalAlpha = .6; drawB(b, r.place, 1, GX + gx * CS, GY + gy * CS, t, { ghost: true }); b.globalAlpha = 1;
      b.fillStyle = bad ? 'rgba(255,60,60,.35)' : 'rgba(120,255,120,.25)'; b.fillRect(GX + gx * CS, GY + gy * CS, CS, CS);
    }
    if (r.sel != null) { const x = GX + (r.sel % CW) * CS, y = GY + Math.floor(r.sel / CW) * CS; b.strokeStyle = Math.sin(t * 6) > 0 ? P.gold : '#fff'; b.lineWidth = 1; b.strokeRect(x + .5, y + .5, CS - 1, CS - 1); }
    if (r.ev.storm) { b.fillStyle = 'rgba(190,100,50,.3)'; b.fillRect(0, 0, W, H); for (let i = 0; i < 60; i++) { b.fillStyle = 'rgba(230,160,110,.6)'; b.fillRect((t * 140 + i * 67) % W, (i * 41 + t * 12) % H, 3, 1); } }
    if (r.ev.flare) { b.fillStyle = `rgba(255,230,120,${.12 + Math.sin(t * 3) * .05})`; b.fillRect(0, 0, W, H); }
    // ---- crisp layer ----
    sc.blit();
    const g = sc.g;
    r.gui.begin();
    topBar(g);
    side(g);
    bottom(g);
    if (r.report) report(g);
    r.gui.tip(g);
  }
  function topBar(g) {
    const r = run, C = r.C, st = r.stats || {}, cap = caps(C), fl = st.flow || {};
    box(g, 0, 0, W, 16, 'rgba(18,10,16,.9)', null, 0);
    const pw = fl.power ?? 0;
    const cells = [
      ['power', `${Math.round(st.prod || 0)}/${Math.round(st.cons || 0)}`, pw < 0 ? P.bad : RC.power, `énergie produite / utilisée par minute${pw < 0 ? ' · il en manque : tout tourne au ralenti' : ''}`],
      ['water', fmt(C.res.water), null, null], ['o2', fmt(C.res.o2), null, null], ['food', fmt(C.res.food), null, null],
      ['metal', fmt(C.res.metal), null, null], ['alloy', fmt(C.res.alloy), null, null], ['sci', fmt(C.res.sci), null, null], ['cr', fmt(C.res.cr), null, null],
    ];
    cells.forEach(([k, v, col, tip], n) => {
      const x = 4 + n * 40, f = fl[k] || 0;
      g.fillStyle = RC[k]; g.fillRect(x, 3, 3, 3);
      txt(g, RN[k], x + 5, 4.7, 4.6, P.dim);
      txt(g, v, x, 11, 6.5, col ?? (k !== 'power' && C.res[k] < 3 && f < 0 ? P.bad : P.txt));
      if (k !== 'power' && Math.abs(f) > .05) txt(g, `${f > 0 ? '+' : ''}${fmt(Math.abs(f)) === '0' ? '0' : (f > 0 ? '' : '-') + fmt(Math.abs(f))}/min`, x + 38, 11.5, 4.3, f > 0 ? P.good : P.bad, 'right');
      r.gui.area(x, 0, 38, 16, null, tip ?? `${RN[k]} : ${fmt(C.res[k])} / ${k === 'cr' ? cap.cr : cap.base * (k === 'sci' ? 2 : 1)}${Math.abs(f) > .01 ? ` · ${f > 0 ? '+' : ''}${f.toFixed(1).replace('.', ',')} par minute` : ''}`);
    });
    const hs = housing(C), lab = st.lab ?? 1;
    txt(g, `colons ${C.pop}/${hs}`, 330, 5, 5.5, C.pop >= hs ? P.warn : P.txt);
    txt(g, `ouvriers ${st.need || 0}${lab < 1 ? ' · pas assez !' : ''}`, 330, 11.5, 4.8, lab < 1 ? P.bad : P.dim);
    r.gui.area(330, 0, 70, 16, null, `${C.pop} colons pour ${hs} places · ${st.need || 0} postes de travail. il faut de l'oxygène, de l'eau et à manger pour que de nouveaux colons arrivent.`);
  }
  function side(g) {
    const r = run, C = r.C, x = 290, y = 19, w = 106;
    box(g, x, y, w, 186, 'rgba(18,10,16,.86)', 'rgba(243,195,139,.35)', 4);
    const tabs = [['build', 'bâtir'], ['tech', 'recherche'], ['earth', 'terre']];
    tabs.forEach(([id, lab], n) => r.gui.button(g, x + 2 + n * 34.5, y + 2, 33, 11, lab, () => { r.tab = id; r.sel = null; }, { on: r.tab === id || (r.tab === 'info' && id === 'build' && false), size: 6 }));
    const y0 = y + 16;
    if (r.tab === 'info' && r.sel != null) return info(g, x, y0, w);
    if (r.tab === 'tech') {
      txt(g, `science : ${fmt(C.res.sci)}`, x + 4, y0 + 4, 6, RC.sci);
      TECH.forEach((t, n) => {
        const done = C.tech[t.id], lock = t.req && !C.tech[t.req], yy = y0 + 10 + n * 17.5;
        r.gui.button(g, x + 3, yy, w - 6, 16, '', () => doAct({ k: 'tech', t: t.id }), { dis: done || lock || C.res.sci < t.cost, on: done, col: '#2f6a3a', tip: `${t.sub}${t.req ? ` · il faut d'abord : ${TECH.find((q) => q.id === t.req).name}` : ''}` });
        txt(g, t.name, x + 6, yy + 5.5, 6, done ? P.good : lock ? '#7a6a68' : P.txt);
        txt(g, done ? 'fait' : `${t.cost} sc`, x + w - 6, yy + 5.5, 5.5, done ? P.good : RC.sci, 'right');
        txt(g, t.sub, x + 6, yy + 11.5, 4.6, P.dim, 'left', { w: 500 });
      });
      return;
    }
    if (r.tab === 'earth') {
      const n = Math.floor(C.res.cr), coins = Math.round(n * rate(C));
      txt(g, 'virer sur terre', x + 4, y0 + 4, 6.5, P.gold);
      txt(g, `${n} crédits → ${coins} ●${C.tech.trade ? '' : ' (taux 80 %)'}`, x + 4, y0 + 12, 5.5, P.txt);
      r.gui.button(g, x + 3, y0 + 17, w - 6, 13, `virer ${n} crédits`, () => cash(), { dis: n < 10, col: '#8a6a1a', on: n >= 10, tip: 'les crédits de la colonie deviennent des pièces dans le jeu' });
      txt(g, 'fusée de ravitaillement', x + 4, y0 + 38, 6.5, P.gold);
      SHIP.forEach(([id, q, price], k) => {
        const yy = y0 + 44 + k * 14, have = eco?.s.items[id] || 0, full = have >= ITEMS[id].max;
        r.gui.button(g, x + 3, yy, w - 6, 12.5, '', () => ship(id), { dis: C.res.cr < price || full, tip: `${ITEMS[id].sub} · tu en as ${have}` });
        txt(g, `${ITEMS[id].name} ×${q}`, x + 6, yy + 6.5, 5.5, full ? '#7a6a68' : P.txt);
        txt(g, full ? 'plein' : `${price} cr`, x + w - 6, yy + 6.5, 5.5, RC.cr, 'right');
      });
      txt(g, `virés en tout : ${fmt(C.sent)} crédits`, x + 4, y0 + 134, 5, P.dim);
      txt(g, `la colonie tourne même quand tu n'es pas là (8 h max)`, x + 4, y0 + 142, 4.6, P.dim, 'left', { w: 500 });
      if (!r.host) txt(g, 'colonie de l\'hôte · tout le monde en profite', x + 4, y0 + 150, 4.6, P.warn, 'left', { w: 500 });
      return;
    }
    // build list
    ORDER.forEach((k, n) => {
      const d = B[k], yy = y0 + 1 + n * 15.2, lock = d.need && !C.tech[d.need], maxed = d.max && C.grid.filter((q) => q?.k === k).length >= d.max;
      const afford = Object.entries(d.cost).every(([rr, v]) => (C.res[rr] || 0) >= v);
      const tip = `${d.sub}${d.pw ? ` · ${d.pw > 0 ? '+' : ''}${d.pw} énergie` : ''}${d.wk ? ` · ${d.wk} ouvrier${d.wk > 1 ? 's' : ''}` : ''}${d.in ? ' · consomme ' + Object.entries(d.in).map(([rr, v]) => `${v} ${RN[rr]}`).join(', ') : ''}${d.out ? ' · produit ' + Object.entries(d.out).map(([rr, v]) => `${v} ${RN[rr]}`).join(', ') : ''} (par minute)${lock ? ' · recherche : nucléaire' : ''}${maxed ? ' · un seul possible' : ''}`;
      r.gui.button(g, x + 3, yy, w - 6, 14, '', () => { r.place = r.place === k ? null : k; r.sel = null; }, { dis: lock || maxed, on: r.place === k, tip });
      g.imageSmoothingEnabled = false; g.drawImage(icon(k), x + 4, yy + 1, 12, 12); g.imageSmoothingEnabled = true;
      txt(g, d.name, x + 18, yy + 5, 5.6, lock ? '#7a6a68' : P.txt);
      txt(g, Object.entries(d.cost).map(([rr, v]) => `${v} ${rr === 'metal' ? 'mét.' : rr === 'cr' ? 'cr' : 'all.'}`).join(' · '), x + 18, yy + 10.5, 4.6, afford ? P.dim : P.bad);
    });
  }
  function info(g, x, y, w) {
    const r = run, C = r.C, i = r.sel, bd = C.grid[i], gr = C.ground[i];
    const close = () => { r.sel = null; r.tab = 'build'; };
    if (!bd) {
      txt(g, gr === 1 ? 'filon de métal' : gr === 2 ? 'glace' : gr === 3 ? 'rochers' : 'sable', x + 4, y + 5, 7, P.gold);
      txt(g, gr === 1 ? 'une foreuse ici ×4' : gr === 2 ? 'un extracteur de glace ici ×4' : gr === 3 ? 'à déblayer avant de bâtir' : 'on peut bâtir ici', x + 4, y + 14, 5.5, P.dim);
      if (gr === 3) r.gui.button(g, x + 3, y + 22, w - 6, 13, 'déblayer · 30 métal', () => doAct({ k: 'clear', i }), { dis: C.res.metal < 30 });
      r.gui.button(g, x + 3, y + 150, w - 6, 13, 'fermer', close);
      return;
    }
    const d = B[bd.k], f = lvF(bd.lv), st = r.stats || {};
    g.imageSmoothingEnabled = false; g.drawImage(icon(bd.k), x + 4, y + 1, 18, 18); g.imageSmoothingEnabled = true;
    txt(g, d.name, x + 25, y + 6, 6.5, P.gold);
    txt(g, `niveau ${bd.lv}/${MAXLV}${bd.dmg ? ' · en panne' : ''}`, x + 25, y + 14, 5.5, bd.dmg ? P.bad : P.txt);
    let yy = y + 26;
    const line = (s, c = P.txt) => { txt(g, s, x + 5, yy, 5.4, c); yy += 8; };
    if (d.pw) line(`${d.pw > 0 ? 'produit' : 'utilise'} ${Math.round(Math.abs(d.pw) * f * (d.pw > 0 ? mult(C, bd.k) : 1))} énergie/min`, d.pw > 0 ? RC.power : P.dim);
    if (d.out) for (const [rr, v] of Object.entries(d.out)) { let k = v * f * mult(C, bd.k); if (d.dep) k *= gr === (d.dep === 'ore' ? 1 : 2) ? 1 : .25; line(`produit ${fmt(k)} ${RN[rr]}/min`, RC[rr]); }
    if (d.in) for (const [rr, v] of Object.entries(d.in)) line(`consomme ${fmt(v * f)} ${RN[rr]}/min`, P.dim);
    if (d.dep && gr !== (d.dep === 'ore' ? 1 : 2)) line(`pas sur ${d.dep === 'ore' ? 'un filon' : 'de la glace'} : ×0,25`, P.bad);
    if (d.house) line(`loge ${d.house * bd.lv} colons`);
    if (d.cap) line(`+${Math.round(150 * f * (C.tech.logi ? 2 : 1))} de stockage`);
    if (d.wk) line(`${workers(C, bd)} ouvriers${(st.lab ?? 1) < 1 ? ' (il en manque)' : ''}`, (st.lab ?? 1) < 1 ? P.bad : P.dim);
    if ((st.pr ?? 1) < 1 && d.pw < 0) line('manque d\'énergie : ralenti', P.bad);
    yy += 4;
    if (bd.dmg) r.gui.button(g, x + 3, yy, w - 6, 13, `réparer · ${20 * bd.lv} métal`, () => doAct({ k: 'fix', i }), { dis: C.res.metal < 20 * bd.lv, on: true, col: '#6a2a2a' });
    else if (bd.lv < MAXLV) {
      const c = upCost(bd.k, bd.lv), ok = Object.entries(c).every(([rr, v]) => (C.res[rr] || 0) >= v);
      r.gui.button(g, x + 3, yy, w - 6, 13, `améliorer · ${Object.entries(c).map(([rr, v]) => `${v} ${rr === 'metal' ? 'mét.' : rr === 'cr' ? 'cr' : 'all.'}`).join(' · ')}`, () => doAct({ k: 'up', i }), { dis: !ok, size: 5.4, tip: `niveau ${bd.lv + 1} : ${Math.round(lvF(bd.lv + 1) * 100)} % du rendement de base` });
    } else txt(g, 'niveau maximum', x + w / 2, yy + 6, 6, P.good, 'center');
    r.gui.button(g, x + 3, y + 133, w - 6, 13, 'démolir (rend la moitié)', () => { if (doAct({ k: 'del', i })) close(); }, { bg: '#4a2020', size: 5.5 });
    r.gui.button(g, x + 3, y + 150, w - 6, 13, 'fermer', close);
  }
  function bottom(g) {
    const r = run;
    const y = H - 18;
    r.notes.forEach((n, i) => { g.globalAlpha = Math.min(1, (6 - n.t) * 2); box(g, 6, y - 11 * (r.notes.length - 1 - i), 278, 10, 'rgba(18,10,16,.85)', null, 3); txt(g, n.s, 10, y + 5 - 11 * (r.notes.length - 1 - i), 5.8, n.c); g.globalAlpha = 1; });
    r.gui.button(g, 292, H - 17, 50, 13, 'quitter', () => leaveNow(), { bg: '#4a2020', size: 6, tip: 'la colonie continue sans toi (jusqu\'à 8 h de production)' });
    r.gui.button(g, 344, H - 17, 52, 13, r.place ? 'annuler' : 'aide', () => { if (r.place) r.place = null; else r.help = !r.help; }, { size: 6 });
    if (r.place) { box(g, GX, GY - 1, 180, 9, 'rgba(18,10,16,.8)', null, 2); txt(g, `clique pour poser : ${B[r.place].name} · clic droit : fini`, GX + 3, GY + 3.5, 5.3, P.gold); }
    if (r.help) {
      box(g, 20, 40, 260, 120, 'rgba(18,10,16,.95)', P.line, 5);
      title(g, 'colonie martienne', 150, 54, 11);
      const L = ['bâtir : choisis un bâtiment à droite, puis clique une case. clique un bâtiment pour l\'améliorer.', 'les colons respirent, boivent et mangent : garde de l\'oxygène, de l\'eau et des patates.', 'foreuses sur les filons, extracteurs sur la glace. il faut assez d\'énergie et d\'ouvriers.', 'raffinerie → alliages → astroport → crédits. les crédits partent sur terre (onglet terre) en pièces ou en fournitures.', 'la colonie produit même quand tu joues ailleurs, jusqu\'à 8 h.'];
      let yy = 66; for (const l of L) for (const s of wrap(g, l, 245, 5.8)) { txt(g, s, 28, yy, 5.8, P.txt, 'left', { w: 600 }); yy += 8; }
      r.gui.area(20, 40, 260, 120, () => { r.help = false; });
    }
  }
  function report(g) {
    const r = run, rep = r.report;
    box(g, 50, 45, 230, 130, 'rgba(18,10,16,.96)', P.line, 6);
    title(g, 'pendant ton absence', 165, 60, 11);
    txt(g, `${fmtDur(rep.sec)} de production${rep.sec >= OFFLINE ? ' (maximum 8 h)' : ''}`, 165, 73, 6.5, P.dim, 'center');
    let n = 0;
    for (const k of ['water', 'o2', 'food', 'metal', 'alloy', 'sci', 'cr']) {
      const v = rep.diff[k]; if (Math.abs(v) < .5) continue;
      const x = 70 + (n % 2) * 105, y = 86 + Math.floor(n / 2) * 11;
      g.fillStyle = RC[k]; g.fillRect(x, y - 2, 4, 4);
      txt(g, `${RN[k]} ${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`, x + 7, y, 6.5, v > 0 ? P.txt : P.bad);
      n++;
    }
    if (!n) txt(g, 'rien n\'a bougé… il manque peut-être de l\'énergie ou des ouvriers', 165, 92, 6, P.warn, 'center');
    if (rep.pop) txt(g, `${rep.pop > 0 ? '+' + rep.pop + ' colons arrivés' : -rep.pop + ' colons repartis'}`, 165, 142, 6.5, rep.pop > 0 ? P.good : P.bad, 'center');
    r.gui.button(g, 125, 152, 80, 15, 'au travail !', () => { r.report = null; }, { on: true, size: 7 });
  }

  // ---------- leaving: no race to lose, the colony carries on ----------
  function summary() {
    const r = run;
    return { quiet: true, text: r.coins > 0 ? `la colonie continue sans toi · ${r.coins} ● virés sur terre aujourd'hui` : 'la colonie continue sans toi · reviens voir ce qu\'elle a produit' };
  }
  function leaveNow() {
    const res = summary(), f = onEnd;
    api.stop();
    f(res);
  }

  // ---------- the module ----------
  const api = {
    keys: [['clic', 'bâtir, choisir, améliorer'], ['clic droit', 'arrêter de poser'], ['q', 'arrêter de poser'], ['échap', 'pause · la colonie continue']],
    start({ seed = 1, humans = [], hostId, meId, send } = {}) {
      if (run) api.stop();
      sfx.init();
      const host = hostId === meId;
      const C = host ? own() : freshColony(seed);   // a guest waits for the host's colony
      const scr = createScreen('tycoon', '#0e0810');
      scr.setRect(rect);
      run = { scr, K: createKeys(), gui: null, C, host, hostId, meId, humans, send: send ?? (() => {}), ev: {}, evT: 45, parts: [], notes: [], walkers: [], tab: 'build', sel: null, place: null, clock: 0, syncT: 0, saveT: 0, mine: 0, coins: 0, report: null, stats: null, live: false };
      run.gui = createGui(scr, sfx);
      if (host) {
        // what happened while away: kept until the colony is really opened (the menu's preview doesn't count)
        const rep = catchUp(C, (Date.now() - C.t) / 1000);
        C.t = Date.now();
        if (rep && rep.sec > 30) {
          if (pending) { pending.sec += rep.sec; for (const k in rep.diff) pending.diff[k] = (pending.diff[k] || 0) + rep.diff[k]; pending.pop += rep.pop; }
          else pending = rep;
        }
        run.stats = sim(C, 0);
      }
      scr.cv.addEventListener('mousedown', () => sfx.init());
      render();
    },
    update(dt, keys = new Set()) {
      if (!run) return;
      if (document.pointerLockElement) document.exitPointerLock?.();
      dt = Math.min(Math.max(dt, 0), 1 / 20);
      run.scr.fit();
      if (dt > 0) {
        if (!run.live) { run.live = true; if (pending) { run.report = pending; pending = null; sfx.good(); } else if (run.host) note('bienvenue sur mars · clique « aide » pour les bases', P.gold); }
        run.clock += dt;
        step(dt, keys);
        if (run && Math.random() < dt / 40 && run.C.grid.some((b) => b?.k === 'port' && !b.dmg) && !run.launch) run.launch = { i: run.C.grid.findIndex((b) => b?.k === 'port'), t: 0 };
        if (run?.launch) { run.launch.t += dt; if (run.launch.t > 3) run.launch = null; }
      }
      if (run) render();
    },
    stop() {
      if (!run) return;
      lastLeave = summary();
      if (run.host) { run.C.t = Date.now(); save?.(); }
      run.scr.destroy(); run.K.destroy();
      run = null;
      sfx.pause();
    },
    // quitting from the pause menu: the colony isn't a race, nothing is abandoned
    leave() { return lastLeave || { quiet: true }; },
    respawn() {},
    onFx(id, fx) { if (run && fx) netRecv(id, fx); },
    peerLeft(id) {
      if (!run) return;
      run.humans = run.humans.filter((h) => h.id !== id);
      if (id === run.hostId) { note('l\'hôte est parti : retour à ta propre colonie', P.warn); run.hostId = run.meId; run.host = true; run.C = own(); run.C.t = Date.now(); }
    },
    setRect(r) { rect = r; run?.scr.setRect(r); },
    hud() { return { hidden: true }; },
    set onEnd(f) { onEnd = f; },
    _dbg: { get run() { return run; }, sim, catchUp, act, freshColony, do: (a) => doAct(a), cash: () => cash(), get pending() { return pending; } },
  };
  return api;
}
