// potato.js: « patates martiennes » — alone on mars (or not quite), grow potatoes in the hab until the rescue sol.
// Martian dirt from outside, the crew's waste for the bacteria, water from hydrazine (careful), cut potatoes to plant;
// keep the power, the heat and the pressure up. Co-op: the host owns the shared hab, everyone sends what they do.
import { W, H, P, clamp, rng, createScreen, makeCanvas, createGui, createKeys, createSfx, txt, title, box, bar, astro, hexOf, LEFT, RIGHT, UP, DOWN } from './mars-kit.js';

const T = 16, SOL = 40, COUNT = 3;
const MODES = [
  { id: 'mission', name: 'mission', sub: 'le sauvetage arrive au sol 14', help: 'tiens jusqu\'au sol 14', rescue: 14 },
  { id: 'court', name: 'mission courte', sub: 'le sauvetage arrive au sol 7', help: 'tiens jusqu\'au sol 7', rescue: 7 },
];
const ITEM = {
  terre: { name: 'terre martienne', c: '#c1653a', n: 2 },
  dechets: { name: 'déchets de l\'équipage', c: '#7a5a3a', n: 3 },
  eau: { name: 'arrosoir', c: '#5fb8e8', n: 4 },
  plants: { name: 'morceaux de patate', c: '#e8cf8a', n: 4 },
  patates: { name: 'patates', c: '#d9b25f' },
  bache: { name: 'bâche et ruban', c: '#e8e2d6' },
  rtg: { name: 'rtg (radioactif)', c: '#ffcc4a' },
};
const POT = .2;   // a potato: a fifth of a day's food
// the hab: tile rects [x, y, w, h]
const BEDS = [];
for (const y of [5, 7, 9]) for (const x of [3, 6, 9, 12]) BEDS.push([x, y, 2, 1]);
const ST = {
  cuisine: [2, 2], toilettes: [5, 2], reservoir: [8, 2], reacteur: [11, 2], chauffage: [14, 2],
  reserve: [2, 12], batteries: [15, 12], lits: [5, 12], radio: [9, 12],
};
const PANELS = [[20, 2], [22, 2], [20, 4], [22, 4]];
const SAND = [21, 11], RTG = [23, 9], ROVER = [22, 7];
const BREACH = [16.4, 6.2], LEAK = [11.5, 3.2];

export function createPotato({ audio, ui } = {}) {
  const sfx = createSfx(.13);
  let onEnd = () => {};
  let run = null, rect = null;

  // ---------- the shared hab ----------
  function freshHab(mode, n) {
    const rescue = mode.rescue, need = 1 + .6 * (n - 1);
    return {
      t: SOL * .12, rescue, need, n,
      beds: BEDS.map(() => ({ st: 0, g: 0, w: 0, hp: 1, fert: 0 })),
      stock: 12, rations: Math.round(rescue * need * .5 * 10) / 10, waste: 8, tank: 40,
      bat: 70, temp: 21, pres: 1, dust: [.2, .35, .1, .4], rtg: 0, breach: null, reactorT: 0,
      storm: 0, stormAt: 2 + Math.floor(rescue * .3), breachAt: Math.max(3, Math.round(rescue * .5)) + .45, lastSol: 1,
      contrib: {}, over: null, msg: 0,
    };
  }
  const solOf = (S) => Math.floor(S.t / SOL) + 1;
  const dayOf = (S) => (S.t / SOL) % 1;
  const light = (S) => { const f = dayOf(S); return f > .05 && f < .7 ? Math.sin(Math.PI * (f - .05) / .65) : 0; };

  // every change to the hab goes through here, on the host and (for a snappy feel) on the one who does it
  function apply(S, a, who) {
    const b = S.beds[a.i];
    let pts = 0;
    switch (a.k) {
      case 'waste': S.waste = Math.max(0, S.waste - a.n); pts = 1; break;
      case 'fill': S.tank = Math.max(0, S.tank - 20); pts = 1; break;
      case 'soil': if (b && b.st === 0) { b.st = 1; pts = 3; } break;
      case 'fert': if (b && b.st === 1) { b.st = 2; b.fert = 2; pts = 3; } break;
      case 'plant': if (b && b.st === 2) { Object.assign(b, { st: 3, g: 0, w: .35, hp: 1 }); pts = 3; } break;
      case 'water': if (b && b.st === 3) { b.w = 1; pts = 2; } break;
      case 'harvest': if (b && b.st === 4) { b.st = --b.fert > 0 ? 2 : 1; b.g = 0; pts = 4; } break;
      case 'deposit': S.stock += a.n; pts = a.n; break;
      case 'cut': S.stock = Math.max(0, S.stock - 1); pts = 1; break;
      case 'inject': S.tank = Math.min(200, S.tank + 6); pts = 1; break;
      case 'boom': S.reactorT = 30; if (!S.breach) S.breach = { big: false, x: LEAK[0], y: LEAK[1] }; break;
      case 'clean': S.dust[a.i] = 0; pts = 3; break;
      case 'rtgTake': S.rtg = 1; pts = 3; break;
      case 'rtgPut': S.rtg = 2; pts = 6; break;
      case 'rtgDrop': if (S.rtg === 1) S.rtg = 0; break;
      case 'patch': if (S.breach) { S.breach = null; pts = 10; } break;
    }
    if (pts && who != null) S.contrib[who] = (S.contrib[who] || 0) + pts;
  }
  const yieldOf = (b, i) => 3 + Math.round(b.hp * 2) + ((i * 7 + b.fert) % 2);

  // what time does to the hab: everyone runs it between the host's snapshots
  function tick(S, dt, host) {
    if (S.over) return;
    S.t += dt;
    const sun = light(S), storm = S.storm > 0;
    // power: the panels (dust hides them), the heater, life support
    let gain = 0;
    S.dust.forEach((d, i) => { gain += (1 - d) * sun * 1.1 * (storm ? .35 : 1); S.dust[i] = Math.min(1, d + dt / SOL * (storm ? .8 : .22)); });
    const use = .55 + (S.rtg === 2 ? .25 : 1.05) + (S.reactorT > 0 ? 0 : .1);
    S.bat = clamp(S.bat + (gain - use) * dt, 0, 100);
    const warm = S.bat > 0 || S.rtg === 2, target = S.breach ? -40 : warm ? 21 : -55;
    S.temp += (target - S.temp) * Math.min(1, dt * (warm && !S.breach ? .5 : .08));
    // pressure: a breach bleeds it, the oxygenator brings it back
    if (S.breach) S.pres = Math.max(0, S.pres - dt * (S.breach.big ? .05 : .012));
    else if (S.bat > 0) S.pres = Math.min(1, S.pres + dt * .04);
    S.reactorT = Math.max(0, S.reactorT - dt);
    if (S.bat > 0) S.tank = Math.min(200, S.tank + dt * .08);   // the water reclaimer
    if (S.storm > 0) S.storm -= dt;
    // the beds
    const cold = S.temp < 4, freezing = S.temp < -4, vacuum = S.pres < .35;
    for (const b of S.beds) {
      if (b.st !== 3) continue;
      b.w = Math.max(0, b.w - dt / (SOL * .85));
      if (!cold && b.w > 0 && !vacuum) b.g += dt / (SOL * 1.5) * (S.bat > 0 ? 1 : .5);
      if (freezing || vacuum) b.hp -= dt / 14;
      else if (b.w <= 0) b.hp -= dt / 60;
      if (b.hp <= 0) { b.st = 1; b.g = 0; b.hp = 1; b.fert = 0; if (host) say(S, 'un plant est mort…', P.bad); }
      else if (b.g >= 1) { b.st = 4; b.g = 1; }
    }
    if (!host) return;
    // the host decides the rest: sols, meals, storms, the breach, the end
    const sol = solOf(S);
    if (sol > S.lastSol) {
      S.lastSol = sol;
      let need = S.need;
      const r = Math.min(S.rations, need); S.rations = Math.round((S.rations - r) * 100) / 100; need -= r;
      if (need > 0) { const p = Math.ceil(need / POT - 1e-6); if (S.stock >= p) S.stock -= p; else { S.stock = 0; S.over = { won: false, sol }; return; } }
      S.waste += S.n;
      if (sol >= S.rescue) { S.over = { won: true, sol }; return; }
      say(S, `sol ${sol} · ${S.rations > 0 ? 'une ration de moins' : 'des patates au menu'}`);
    }
    const f = S.t / SOL + 1;
    if (!S.stormDone && f >= S.stormAt + .3) { S.stormDone = true; S.storm = SOL * .8; say(S, 'tempête de poussière ! les panneaux s\'encrassent', P.warn); }
    if (!S.breachDone && f >= S.breachAt) {
      S.breachDone = true; S.breach = { big: true, x: BREACH[0], y: BREACH[1] };
      say(S, 'brèche dans le sas ! une bâche, vite !', P.bad);
    }
    if (S.pres <= 0 && S.breach?.big && !S.wiped) {
      S.wiped = true;
      for (const b of S.beds) if (b.st >= 2) { b.st = 1; b.g = 0; b.fert = 0; }
      say(S, 'dépressurisé : les bactéries sont mortes, tout est à refaire', P.bad);
    }
  }
  function say(S, s, c = P.txt) { S.msg++; S.say = { s, c, n: S.msg }; }

  // ---------- the map ----------
  const solid = new Uint8Array(25 * 14);
  const setS = (x, y, w = 1, h = 1) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) solid[j * 25 + i] = 1; };
  (function build() {
    for (let i = 0; i < 25; i++) { setS(i, 0); setS(i, 13); }
    for (let j = 0; j < 14; j++) { setS(0, j); setS(24, j); }
    for (let i = 0; i < 18; i++) { setS(i, 1); setS(i, 13); }
    for (let j = 1; j < 14; j++) if (j !== 7) setS(17, j);
    setS(18, 6); setS(18, 8); setS(18, 1, 1, 5); setS(18, 9, 1, 4);
    for (const b of BEDS) setS(...b);
    for (const k in ST) setS(...ST[k]);
    setS(6, 12); setS(10, 12);
    for (const p of PANELS) setS(p[0], p[1]);
    setS(ROVER[0], ROVER[1], 2, 1);
  })();
  const isSolid = (px, py) => { const x = Math.floor(px / T), y = Math.floor(py / T); return x < 0 || y < 0 || x >= 25 || y >= 14 || !!solid[y * 25 + x]; };
  const outside = (p) => p.x > 18.2 * T;

  // what's within reach, and what e would do there
  function spots(S) {
    const L = [];
    const add = (id, x, y, w = 1, h = 1, i) => L.push({ id, x: x * T, y: y * T, w: w * T, h: h * T, i });
    BEDS.forEach((b, i) => add('bed', ...b, i));
    for (const k in ST) add(k, ...ST[k]);
    PANELS.forEach((p, i) => add('panel', p[0], p[1], 1, 1, i));
    add('sand', SAND[0], SAND[1], 2, 1);
    if (S.rtg === 0) add('rtg', RTG[0], RTG[1]);
    if (S.breach) add('breach', S.breach.x - .5, S.breach.y - .5, 1, 1);
    return L;
  }
  function nearest(S, me) {
    let best = null, bd = 13;
    for (const s of spots(S)) {
      const dx = Math.max(s.x - me.x, 0, me.x - (s.x + s.w)), dy = Math.max(s.y - me.y, 0, me.y - (s.y + s.h));
      const d = Math.hypot(dx, dy) + (s.id === 'breach' ? -6 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // the offer at a spot: { label, dur, run() } or { label } (can't) or null
  function offer(S, me, s) {
    if (!s) return null;
    const c = me.carry, b = s.i != null ? S.beds[s.i] : null;
    const act = (label, dur, fn) => ({ label, dur, fn });
    switch (s.id) {
      case 'sand': return c ? { label: 'mains pleines' } : act('remplir un sac de terre', 1.6, () => { hold('terre'); sfx.dig(); });
      case 'toilettes':
        if (c) return { label: 'mains pleines' };
        if (S.waste < 1) return { label: 'plus de déchets… il faut attendre' };
        return act(`prendre des déchets (${Math.floor(S.waste)})`, 1, () => { const n = Math.min(3, Math.floor(S.waste)); hold('dechets', n); send({ k: 'waste', n }); });
      case 'reservoir':
        if (c && c !== 'eau') return { label: 'mains pleines' };
        if (S.tank < 20) return { label: `réservoir presque vide (${Math.floor(S.tank)} l)` };
        return act(`remplir l'arrosoir (${Math.floor(S.tank)} l)`, 1.2, () => { hold('eau'); send({ k: 'fill' }); sfx.water(); });
      case 'reacteur':
        if (S.reactorT > 0) return { label: `réacteur en panne (${Math.ceil(S.reactorT)} s)` };
        return act('brûler de l\'hydrazine → eau', .3, () => startChem());
      case 'cuisine':
        if (c === 'patates') return act(`ranger ${me.n} patates`, .5, () => { send({ k: 'deposit', n: me.n }); drop(); sfx.pick(); });
        if (c) return { label: 'mains pleines' };
        if (S.stock < 1) return { label: 'plus une seule patate !' };
        return act(`couper une patate en 4 (${S.stock} en stock)`, 1, () => { hold('plants'); send({ k: 'cut' }); sfx.dig(); });
      case 'bed':
        if (b.st === 4) return c && c !== 'patates' ? { label: 'mains pleines' } : act('récolter', 1.2, () => { const n = yieldOf(b, s.i); send({ k: 'harvest', i: s.i }); hold('patates', (c === 'patates' ? me.n : 0) + n); sfx.good(); });
        if (b.st === 0) return c === 'terre' ? act('étaler la terre martienne', 1, () => { send({ k: 'soil', i: s.i }); use(); }) : { label: 'bac vide : de la terre (dehors)' };
        if (b.st === 1) return c === 'dechets' ? act('mélanger les déchets', 1, () => { send({ k: 'fert', i: s.i }); use(); sfx.dig(); }) : { label: 'terre stérile : des déchets (toilettes)' };
        if (b.st === 2) return c === 'plants' ? act('planter un morceau', .8, () => { send({ k: 'plant', i: s.i }); use(); sfx.drop(); }) : { label: 'terre prête : des patates coupées (cuisine)' };
        if (b.st === 3) return c === 'eau' ? act('arroser', .6, () => { send({ k: 'water', i: s.i }); use(); sfx.water(); }) : { label: `pousse ${Math.floor(b.g * 100)} % · ${b.w > 0 ? 'humide' : 'sec !'}` };
        return null;
      case 'panel': return S.dust[s.i] < .08 ? { label: 'panneau propre' } : act(`dépoussiérer (${Math.round(S.dust[s.i] * 100)} %)`, 1.4, () => { send({ k: 'clean', i: s.i }); sfx.whoosh(); });
      case 'rtg': return c ? { label: 'mains pleines' } : act('déterrer le rtg', 3, () => { hold('rtg'); send({ k: 'rtgTake' }); sfx.dig(); });
      case 'chauffage':
        if (c === 'rtg') return act('brancher le rtg au chauffage', 2, () => { send({ k: 'rtgPut' }); drop(); sfx.good(); });
        return { label: S.rtg === 2 ? `chauffage au rtg · ${Math.round(S.temp)} °c` : `chauffage électrique · ${Math.round(S.temp)} °c${S.rtg ? '' : ' · un rtg est enterré dehors'}` };
      case 'reserve':
        if (c === 'bache') return { label: 'tu as déjà une bâche' };
        return c ? { label: 'mains pleines' } : act('prendre une bâche et du ruban', .5, () => { hold('bache'); sfx.pick(); });
      case 'breach': return c === 'bache' ? act('colmater la brèche', S.breach.big ? 2.5 : 1.5, () => { send({ k: 'patch' }); drop(); sfx.good(); }) : { label: 'une bâche ! (réserve)' };
      case 'batteries': return { label: `batteries ${Math.round(S.bat)} %` };
      case 'lits': return { label: `${S.rations > 0 ? S.rations.toFixed(1).replace('.', ',') + ' jours de rations' : 'plus de rations'} · ${S.stock} patates` };
      case 'radio': return { label: `la nasa : sauvetage au sol ${S.rescue}` };
    }
    return null;
  }
  function hold(k, n = ITEM[k].n ?? 1) { run.me.carry = k; run.me.n = n; }
  function use() { const me = run.me; if (--me.n <= 0) drop(); }
  function drop() { run.me.carry = null; run.me.n = 0; }
  function send(a) {
    const r = run;
    apply(r.S, a, r.host ? r.meId : null);
    if (!r.host) r.send({ t: 'a', a });
  }

  // ---------- the hydrazine: tap in the green, don't let it overheat ----------
  function startChem() { run.chem = { p: 0, v: 1.2, zone: .5, heat: 0, n: 0, flash: 0, t: 0 }; }
  function stepChem(dt, K) {
    const c = run.chem;
    c.t += dt; c.flash -= dt;
    c.p = .5 + .5 * Math.sin(c.t * c.v * 2.2);
    c.heat = Math.max(0, c.heat - dt * .07);
    if (K.hit('KeyE', 'Space')) {
      if (Math.abs(c.p - c.zone) < .09) {
        c.heat += .13; c.n++; c.v = Math.min(3.4, c.v + .15); c.zone = .2 + Math.random() * .6; c.flash = .25;
        send({ k: 'inject' }); sfx.water(); sfx.beep(true);
        burst(ST.reservoir[0] * T + 8, ST.reservoir[1] * T + 12, P.water, 6);
      } else { c.heat += .34; run.shake = 3; sfx.hiss(); }
      if (c.heat >= 1) {
        run.chem = null; send({ k: 'boom' });
        const me = run.me; me.stun = 3; me.vx = 0; me.y += 10;
        run.shake = 12; sfx.boom(1.2); burst(ST.reacteur[0] * T + 8, ST.reacteur[1] * T + 10, P.orange, 30, 90);
        flash('boum ! le réacteur a explosé', P.bad);
        return;
      }
    }
    if (K.hit(...LEFT, ...RIGHT, ...UP, ...DOWN, 'KeyQ')) run.chem = null;
  }

  // ---------- particles & notes ----------
  function burst(x, y, c, n, sp = 40) { for (let i = 0; i < n; i++) { const a = Math.random() * 7; run.parts.push({ x, y, vx: Math.cos(a) * sp * Math.random(), vy: Math.sin(a) * sp * Math.random() - 10, c, life: 0, max: .5 + Math.random() * .6 }); } }
  function flash(s, c = P.txt) { run.notes.push({ s, c, t: 0 }); if (run.notes.length > 4) run.notes.shift(); }

  // ---------- network ----------
  function netRecv(id, m) {
    const r = run;
    if (m.t === 'p') {
      let o = r.others.get(id);
      if (!o) { const h = r.humans.find((h) => h.id === id); o = { x: m.x, y: m.y, name: h?.name ?? '?', color: h?.color ?? 0x4a8fe0 }; r.others.set(id, o); }
      Object.assign(o, { tx: m.x, ty: m.y, face: m.f, carry: m.c, task: m.k, walk: m.w });
    } else if (m.t === 'a' && r.host) apply(r.S, m.a, id);
    else if (m.t === 's' && id === r.hostId && !r.host) {
      const say0 = r.S.say?.n;
      r.S = m.S;
      if (r.S.say && r.S.say.n !== say0) flash(r.S.say.s, r.S.say.c);
    }
  }
  function netStep(dt) {
    const r = run;
    r.sendT -= dt;
    if (r.sendT > 0) return;
    r.sendT = .1;
    const me = r.me;
    r.send({ t: 'p', x: Math.round(me.x), y: Math.round(me.y), f: me.face, c: me.carry, k: r.task ? 1 : 0, w: me.walk ? 1 : 0 });
    if (r.host && (r.snapT = (r.snapT || 0) + 1) % 3 === 0) r.send({ t: 's', S: r.S });
  }

  // ---------- the frame ----------
  function step(dt, keys) {
    const r = run, S = r.S, K = r.K;
    K.frame(keys);
    r.gui.clicks();
    r.shake = Math.max(0, r.shake - dt * 20);
    for (const n of r.notes) n.t += dt;
    r.notes = r.notes.filter((n) => n.t < 4.5);
    if (r.phase === 'count') {
      r.count -= dt;
      if (Math.ceil(r.count) !== Math.ceil(r.count + dt)) sfx.beep(r.count <= 0);
      if (r.count <= 0) { r.phase = 'play'; flash(`sol 1 · sauvetage au sol ${S.rescue}`, P.gold); }
      return;
    }
    if (r.phase === 'end') {
      r.endT += dt;
      if (r.endT > 7 && !r.ended) finish();
      return;
    }
    const say0 = S.say?.n;
    tick(S, dt, r.host);
    if (r.host && S.say && S.say.n !== say0) flash(S.say.s, S.say.c);
    if (S.over) { r.phase = 'end'; r.endT = 0; S.over.won ? sfx.win() : sfx.lose(); if (r.host) r.send({ t: 's', S }); return; }
    if (S.breach && Math.random() < dt * 2) sfx.alarm();
    // me
    const me = r.me;
    me.stun = Math.max(0, (me.stun || 0) - dt);
    if (r.chem) stepChem(dt, K);
    else if (r.task) {
      r.task.t += dt;
      if (K.has(...LEFT, ...RIGHT, ...UP, ...DOWN)) r.task = null;
      else if (r.task.t >= r.task.dur) { const f = r.task.fn; r.task = null; f(); }
      else if (Math.random() < dt * 5) sfx.step();
    } else if (!me.stun) {
      let dx = (K.has(...RIGHT) ? 1 : 0) - (K.has(...LEFT) ? 1 : 0), dy = (K.has(...DOWN) ? 1 : 0) - (K.has(...UP) ? 1 : 0);
      if (dx && dy) { dx *= .707; dy *= .707; }
      const sp = outside(me) ? 44 : 54;
      move(me, dx * sp * dt, dy * sp * dt);
      if (dx) me.face = dx;
      me.walk = !!(dx || dy);
      if (me.walk) { me.wt += dt; if (me.wt > .28) { me.wt = 0; sfx.step(); } }
      const s = nearest(S, me), o = offer(S, me, s);
      r.near = s; r.offer = o;
      if (o?.fn && K.hit('KeyE', 'Space')) r.task = { t: 0, dur: o.dur, fn: o.fn, label: o.label };
      else if (o && !o.fn && K.hit('KeyE', 'Space')) sfx.nope();
    }
    if (me.carry && K.hit('KeyX')) { if (me.carry === 'rtg') send({ k: 'rtgDrop' }); drop(); sfx.drop(); }
    // the others glide to where they are
    for (const o of r.others.values()) { o.x += (o.tx - o.x) * Math.min(1, dt * 12); o.y += (o.ty - o.y) * Math.min(1, dt * 12); }
    for (const p of r.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt; }
    r.parts = r.parts.filter((p) => p.life < p.max);
    // dust blowing through the breach, outside in a storm
    if (S.breach && Math.random() < dt * (S.breach.big ? 40 : 12)) {
      const a = Math.random() * Math.PI + Math.PI / 2, d = 20 + Math.random() * 40;
      r.parts.push({ x: S.breach.x * T + Math.cos(a) * d, y: S.breach.y * T + Math.sin(a) * d * .7, vx: -Math.cos(a) * d * 2, vy: -Math.sin(a) * d * 1.4 - 15, c: 'rgba(255,255,255,.55)', life: 0, max: .5 });
    }
    netStep(dt);
  }
  function move(e, dx, dy) {
    const hw = 3, fy = 0;
    const free = (x, y) => !isSolid(x - hw, y - 2 + fy) && !isSolid(x + hw, y - 2 + fy) && !isSolid(x - hw, y + fy) && !isSolid(x + hw, y + fy);
    if (free(e.x + dx, e.y)) e.x += dx;
    if (free(e.x, e.y + dy)) e.y += dy;
  }
  function finish() {
    const r = run, S = r.S;
    r.ended = true;
    const rank = [...r.humans].sort((a, b) => (S.contrib[b.id] || 0) - (S.contrib[a.id] || 0) || String(a.id).localeCompare(String(b.id)));
    const place = rank.findIndex((h) => h.id === r.meId) + 1 || 1, of = rank.length;
    const kcal = Math.round((S.rations + S.stock * POT) * 1500), pts = S.contrib[r.meId] || 0;
    const res = S.over.won
      ? { place, of, time: S.t, value: kcal, text: `sauvé au sol ${S.over.sol} · ${kcal.toLocaleString('fr-FR')} kcal en réserve · ${pts} points d'effort${of > 1 ? ` (${place}${place === 1 ? 'er' : 'e'})` : ''}` }
      : { place: 4, of, time: S.t, text: `famine au sol ${S.over.sol}… il fallait plus de patates` };
    const f = onEnd;
    api.stop();
    f(res);
  }

  // ---------- drawing ----------
  let bg = null;
  function paintBg() {
    const [c, b] = makeCanvas(W, H), R = rng(11);
    b.fillStyle = P.sand; b.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { b.fillStyle = [P.sand2, P.sand3, P.sand4][Math.floor(R() * 3)]; b.fillRect(Math.floor(R() * W), Math.floor(R() * H), 1 + Math.floor(R() * 2), 1); }
    for (let i = 0; i < 16; i++) { const x = 19 * T + R() * 6 * T, y = T + R() * 12 * T; b.fillStyle = P.rock2; b.fillRect(x, y + 1, 5, 3); b.fillStyle = P.rock; b.fillRect(x, y, 4, 3); }
    // the hab: shell, floor, ribs
    b.fillStyle = '#6e645a'; b.beginPath(); b.roundRect(2, T - 2, 18 * T - 2, 13 * T - 10, 14); b.fill();
    b.fillStyle = P.hab; b.beginPath(); b.roundRect(4, T, 18 * T - 6, 13 * T - 14, 12); b.fill();
    b.fillStyle = '#cfc6b8'; b.fillRect(T, 2 * T, 16 * T, 11 * T);
    for (let y = 2; y < 13; y++) for (let x = 1; x < 17; x++) { b.fillStyle = (x + y) % 2 ? '#c9bfb1' : '#d3cabd'; b.fillRect(x * T, y * T, T, T); b.fillStyle = '#b8ad9e'; b.fillRect(x * T, y * T, T, 1); b.fillRect(x * T, y * T, 1, T); }
    b.fillStyle = 'rgba(0,0,0,.12)'; b.fillRect(T, 2 * T, 16 * T, 3);
    for (let x = 3; x < 17; x += 4) { b.fillStyle = P.hab2; b.fillRect(x * T, T + 2, 2, T - 4); b.fillRect(x * T, 13 * T, 2, 6); }
    // the airlock
    b.fillStyle = '#6e645a'; b.fillRect(17 * T - 2, 5.6 * T, 2 * T + 6, 3 * T - 4);
    b.fillStyle = P.metal; b.fillRect(17 * T, 6 * T, 2 * T + 2, 3 * T - 6);
    b.fillStyle = '#7f8a94'; b.fillRect(17 * T, 7 * T, 2 * T + 2, T);
    for (let i = 0; i < 6; i++) { b.fillStyle = i % 2 ? '#222' : P.gold; b.fillRect(17 * T + i * 6, 7 * T - 2, 6, 2); b.fillRect(17 * T + i * 6, 8 * T, 6, 2); }
    // paths in the sand
    b.fillStyle = 'rgba(80,30,15,.18)';
    for (let x = 19 * T; x < 23 * T; x += 3) { b.fillRect(x, 7 * T + 4 + Math.sin(x * .2) * 1.5, 2, 2); b.fillRect(x, 7 * T + 10 + Math.cos(x * .2) * 1.5, 2, 2); }
    bg = c;
  }
  function drawStation(b, id, x, y, S, t) {
    const px = x * T, py = y * T;
    const base = (c1 = P.metal, c2 = P.metal2) => { b.fillStyle = c2; b.fillRect(px + 1, py + 2, 14, 14); b.fillStyle = c1; b.fillRect(px + 1, py + 1, 14, 12); };
    switch (id) {
      case 'cuisine': base('#d9d2c4', '#8f877b'); b.fillStyle = '#6b4a2e'; b.fillRect(px + 3, py + 3, 10, 7);
        for (let i = 0; i < Math.min(12, S.stock); i++) { b.fillStyle = '#d9b25f'; b.fillRect(px + 4 + (i % 4) * 2, py + 4 + Math.floor(i / 4) * 2, 2, 2); }
        if (S.stock > 12) { b.fillStyle = P.gold; b.fillRect(px + 12, py + 3, 2, 2); } break;
      case 'toilettes': base('#e8e2d6', '#9e968a'); b.fillStyle = '#fff'; b.fillRect(px + 4, py + 3, 8, 6); b.fillStyle = '#9ed0e8'; b.fillRect(px + 5, py + 4, 6, 4);
        for (let i = 0; i < Math.min(5, Math.floor(S.waste)); i++) { b.fillStyle = '#7a5a3a'; b.fillRect(px + 1 + i * 3, py + 10, 2, 3); } break;
      case 'reservoir': { base('#b9c4cc', '#5e6873'); const h = Math.round(clamp(S.tank / 120, 0, 1) * 10); b.fillStyle = '#20303c'; b.fillRect(px + 4, py + 2, 8, 11); b.fillStyle = P.water; b.fillRect(px + 4, py + 13 - h, 8, h); b.fillStyle = 'rgba(255,255,255,.4)'; b.fillRect(px + 5, py + 3, 1, 9); break; }
      case 'reacteur': base('#c4b49a', '#6d5f4a');
        b.fillStyle = S.reactorT > 0 ? '#333' : '#d8c64a'; b.fillRect(px + 3, py + 3, 10, 8); b.fillStyle = '#222'; b.fillRect(px + 7, py + 4, 2, 4); b.fillRect(px + 7, py + 9, 2, 1);
        b.fillStyle = (S.reactorT > 0 ? Math.sin(t * 10) > 0 : Math.sin(t * 3) > .6) ? P.red : '#5a1a1a'; b.fillRect(px + 12, py + 2, 2, 2);
        if (S.reactorT > 0 && Math.random() < .3) { b.fillStyle = '#444'; b.fillRect(px + 4 + Math.random() * 8, py - Math.random() * 6, 2, 2); } break;
      case 'chauffage': base('#b98a6a', '#6a4430'); for (let i = 0; i < 4; i++) { b.fillStyle = S.bat > 0 || S.rtg === 2 ? (Math.sin(t * 4 + i) > 0 ? P.orange : '#ff6a2a') : '#553'; b.fillRect(px + 3 + i * 3, py + 3, 2, 8); }
        if (S.rtg === 2) { b.fillStyle = P.gold; b.fillRect(px + 11, py + 10, 4, 4); b.fillStyle = '#222'; b.fillRect(px + 12, py + 11, 2, 2); } break;
      case 'reserve': base('#9a8264', '#5a4a36'); b.fillStyle = '#e8e2d6'; b.fillRect(px + 3, py + 4, 10, 3); b.fillStyle = '#c9c0b0'; b.fillRect(px + 3, py + 7, 10, 3); b.fillStyle = '#a8a8a8'; b.fillRect(px + 6, py + 11, 4, 2); break;
      case 'batteries': { base('#4b5563', '#252b33'); const h = Math.round(S.bat / 100 * 10); b.fillStyle = '#111'; b.fillRect(px + 4, py + 2, 8, 11); b.fillStyle = S.bat < 20 ? P.red : P.good; b.fillRect(px + 4, py + 13 - h, 8, h); break; }
      case 'lits': b.fillStyle = '#6d7f96'; b.fillRect(px + 1, py + 2, 30, 13); b.fillStyle = '#9fb3cc'; b.fillRect(px + 2, py + 3, 28, 5); b.fillStyle = '#fff'; b.fillRect(px + 3, py + 4, 5, 3); b.fillRect(px + 18, py + 4, 5, 3); break;
      case 'radio': base('#555', '#333'); b.fillStyle = Math.sin(t * 5) > 0 ? P.good : '#1a3a1a'; b.fillRect(px + 3, py + 3, 3, 2); b.fillStyle = '#999'; b.fillRect(px + 8, py + 3, 5, 6); b.fillRect(px + 17, py + 3, 12, 8); b.fillStyle = '#2a4a6a'; b.fillRect(px + 18, py + 4, 10, 6); break;
    }
  }
  function drawBed(b, i, bed, t, S) {
    const [x, y] = BEDS[i], px = x * T, py = y * T;
    b.fillStyle = '#6b5a48'; b.fillRect(px, py + 2, 32, 15); b.fillStyle = '#8a7660'; b.fillRect(px, py, 32, 14);
    const soil = bed.st === 0 ? '#9a9088' : bed.st === 1 ? (bed.fert === 0 && S.wiped ? '#b0603a' : P.sand) : bed.st === 3 && bed.w > 0 ? '#2e1c12' : P.soil;
    b.fillStyle = soil; b.fillRect(px + 2, py + 2, 28, 10);
    if (bed.st >= 1) { const R = rng(i + 3); b.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 10; k++) b.fillRect(px + 2 + Math.floor(R() * 27), py + 2 + Math.floor(R() * 9), 1, 1); }
    if (bed.st === 2) { b.fillStyle = '#6a4a28'; for (let k = 0; k < 4; k++) b.fillRect(px + 5 + k * 7, py + 6, 3, 1); }
    if (bed.st >= 3) {
      const g = bed.g, dead = bed.hp < .4;
      for (let k = 0; k < 4; k++) {
        const cx = px + 5 + k * 7, cy = py + 9, h = 1 + Math.round(g * 6), sw = Math.round(Math.sin(t * 2 + k) * (g > .5 ? 1 : 0));
        b.fillStyle = dead ? '#8a7a3a' : P.green2; b.fillRect(cx + 1, cy - h, 1, h);
        b.fillStyle = dead ? '#a8964a' : bed.st === 4 ? P.leaf : P.green;
        if (g > .15) { b.fillRect(cx - 1 + sw, cy - h, 2, 2); b.fillRect(cx + 2 + sw, cy - h + 1, 2, 2); }
        if (g > .6) { b.fillRect(cx - 2 + sw, cy - h + 3, 2, 2); b.fillRect(cx + 3 + sw, cy - h + 3, 2, 2); }
        if (bed.st === 4) { b.fillStyle = '#d9b25f'; b.fillRect(cx - 1, cy + 1, 2, 2); b.fillRect(cx + 2, cy + 1, 2, 1); }
      }
      if (bed.w <= 0 && Math.sin(t * 6) > 0) { b.fillStyle = P.orange; b.fillRect(px + 29, py, 3, 3); }
    }
  }
  function panelSprite(b, i, S) {
    const [x, y] = PANELS[i], px = x * T, py = y * T;
    b.fillStyle = '#333'; b.fillRect(px + 7, py + 10, 2, 6);
    b.fillStyle = P.panel; b.fillRect(px - 2, py, 20, 12);
    b.fillStyle = P.cell; for (let a = 0; a < 4; a++) for (let c = 0; c < 2; c++) b.fillRect(px - 1 + a * 5, py + 1 + c * 5, 4, 4);
    b.fillStyle = 'rgba(255,255,255,.25)'; b.fillRect(px - 1, py + 1, 18, 1);
    const d = S.dust[i];
    if (d > .05) { const R = rng(i * 13 + 1); b.fillStyle = `rgba(200,110,60,${.25 + d * .7})`; b.fillRect(px - 2, py, 20, 12); b.fillStyle = `rgba(230,160,110,${d * .8})`; for (let k = 0; k < 14 * d; k++) b.fillRect(px - 2 + Math.floor(R() * 19), py + Math.floor(R() * 11), 2, 1); }
  }
  function render() {
    const r = run, S = r.S, sc = r.scr, b = sc.b, t = r.clock;
    if (!bg) paintBg();
    b.save();
    if (r.shake) b.translate(Math.round((Math.random() - .5) * r.shake), Math.round((Math.random() - .5) * r.shake));
    b.drawImage(bg, 0, 0);
    // outside: the rover, the panels, the sand pile, the buried rtg
    b.fillStyle = '#d8d2c8'; b.fillRect(ROVER[0] * T, ROVER[1] * T + 2, 30, 12); b.fillStyle = '#8a8a8a'; b.fillRect(ROVER[0] * T + 2, ROVER[1] * T + 4, 10, 8);
    b.fillStyle = '#333'; for (const dx of [2, 12, 22]) { b.fillRect(ROVER[0] * T + dx, ROVER[1] * T, 5, 2); b.fillRect(ROVER[0] * T + dx, ROVER[1] * T + 14, 5, 2); }
    PANELS.forEach((_, i) => panelSprite(b, i, S));
    b.fillStyle = P.sand4; b.beginPath(); b.ellipse(SAND[0] * T + 16, SAND[1] * T + 9, 15, 7, 0, 0, 7); b.fill();
    b.fillStyle = P.sand3; b.beginPath(); b.ellipse(SAND[0] * T + 15, SAND[1] * T + 7, 12, 5, 0, 0, 7); b.fill();
    b.fillStyle = '#8a5a2a'; b.fillRect(SAND[0] * T + 24, SAND[1] * T - 2, 2, 10); b.fillStyle = P.metal; b.fillRect(SAND[0] * T + 22, SAND[1] * T + 7, 6, 4);
    if (S.rtg === 0) { const px = RTG[0] * T, py = RTG[1] * T; b.fillStyle = P.sand4; b.fillRect(px + 2, py + 6, 12, 6); b.fillStyle = P.gold; b.fillRect(px + 6, py, 1, 7); b.fillRect(px + 7, py, 4, 3); b.fillStyle = '#222'; b.fillRect(px + 8, py + 1, 1, 1); }
    // inside
    for (const k in ST) drawStation(b, k, ...ST[k], S, t);
    S.beds.forEach((bed, i) => drawBed(b, i, bed, t, S));
    // the breach: a torn flap and the air rushing out
    if (S.breach) {
      const x = S.breach.x * T, y = S.breach.y * T, big = S.breach.big;
      b.fillStyle = '#111'; b.beginPath(); b.ellipse(x, y, big ? 6 : 3, big ? 9 : 4, 0, 0, 7); b.fill();
      b.fillStyle = P.hab; b.fillRect(x + 2, y - 8 + Math.sin(t * 20) * 2, 4, 6);
    }
    // people
    const ppl = [...[...r.others.values()].map((o) => ({ ...o, me: false })), { ...r.me, me: true, name: 'toi', task: !!r.task }];
    ppl.sort((a, b2) => a.y - b2.y);
    for (const p of ppl) astro(b, p.x, p.y, p.color, p.face, t, { walk: p.walk, carry: p.carry ? ITEM[p.carry]?.c : null, visor: p.me ? '#e3a340' : '#7fb4e0' });
    for (const p of r.parts) { b.fillStyle = p.c; b.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    // the light of the sol: night outside, and inside when the power is out
    const sun = light(S), lit = S.bat > 0 ? 1 : .35;
    const night = 1 - Math.min(1, sun * 2.5);
    if (night > 0) { b.fillStyle = `rgba(18,8,40,${night * .55})`; b.fillRect(18 * T + 4, 0, W, H); }
    if (lit < 1) { b.fillStyle = 'rgba(8,4,20,.5)'; b.fillRect(0, T, 18 * T, 13 * T); }
    if (S.storm > 0) { b.fillStyle = 'rgba(190,100,50,.35)'; b.fillRect(18 * T, 0, W, H); for (let i = 0; i < 40; i++) { b.fillStyle = 'rgba(230,160,110,.6)'; b.fillRect(18 * T + ((t * 160 + i * 53) % 110), (i * 37 + t * 20) % H, 3, 1); } }
    if (S.pres < .6 && Math.sin(t * 8) > 0) { b.fillStyle = 'rgba(255,40,40,.12)'; b.fillRect(0, T, 18 * T, 13 * T); }
    if (S.temp < 0) { b.fillStyle = `rgba(160,210,255,${Math.min(.3, -S.temp / 150)})`; b.fillRect(0, T, 18 * T, 13 * T); }
    b.restore();
    // ---- crisp layer ----
    sc.blit();
    const g = sc.g;
    r.gui.begin();
    for (const o of r.others.values()) txt(g, o.name, o.x, o.y - 19, 5.5, hexOf(o.color), 'center');
    hud(g, S, t);
    if (r.phase === 'count') {
      box(g, W / 2 - 110, 60, 220, 80, P.ui, P.line, 6);
      title(g, 'patates martiennes', W / 2, 78, 15);
      txt(g, `sauvetage au sol ${S.rescue} · ${r.humans.length > 1 ? r.humans.length + ' astronautes' : 'seul sur mars'}`, W / 2, 97, 7, P.txt, 'center');
      txt(g, 'zqsd bouger · e agir · x lâcher', W / 2, 110, 6.5, P.dim, 'center');
      title(g, String(Math.max(1, Math.ceil(r.count))), W / 2, 127, 13, P.txt);
    }
    if (r.phase === 'end') endCard(g, S);
    r.gui.tip(g);
  }
  function hud(g, S, t) {
    const r = run, me = r.me;
    box(g, 0, 0, W, 15, 'rgba(18,10,16,.88)', null, 0);
    const f = dayOf(S), sol = solOf(S), sun = light(S);
    g.fillStyle = sun > 0 ? P.gold : '#b8c4ff'; g.beginPath(); g.arc(8, 7.5, 3.5, 0, 7); g.fill();
    txt(g, `sol ${sol}/${S.rescue}`, 15, 7.8, 7, P.txt);
    bar(g, 15, 11.5, 36, 1.8, f, sun > 0 ? P.gold : '#8a8ac8');
    const item = (x, lab, v, col, frac) => { txt(g, lab, x, 5, 5, P.dim); txt(g, v, x, 11, 6.5, col); if (frac != null) bar(g, x + 28, 9.8, 22, 2, frac, col); };
    item(60, 'énergie', `${Math.round(S.bat)} %`, S.bat < 15 ? P.bad : P.good, S.bat / 100);
    item(118, 'chaleur', `${Math.round(S.temp)} °c`, S.temp < 5 ? '#9ad8ff' : P.txt);
    item(158, 'pression', `${Math.round(S.pres * 100)} %`, S.pres < .6 ? P.bad : P.txt, S.pres);
    item(216, 'eau', `${Math.floor(S.tank)} l`, P.water);
    item(250, 'rations', `${S.rations.toFixed(1).replace('.', ',')} j`, S.rations < S.need ? P.warn : P.txt);
    item(288, 'patates', `${S.stock}`, '#e8cf8a');
    item(322, 'déchets', `${Math.floor(S.waste)}`, '#c9a06a');
    const food = S.rations + S.stock * POT, left = S.rescue - sol + 1 - f;
    txt(g, food >= left * S.need ? 'ça tient' : 'pas assez !', W - 4, 7.5, 6.5, food >= left * S.need ? P.good : P.bad, 'right');
    // notes
    r.notes.forEach((n, i) => {
      const a = Math.min(1, (4.5 - n.t) * 2);
      g.globalAlpha = a; box(g, W / 2 - 100, 19 + i * 11, 200, 10, 'rgba(18,10,16,.8)', null, 3); txt(g, n.s, W / 2, 24.5 + i * 11, 6.5, n.c, 'center'); g.globalAlpha = 1;
    });
    // what's in hand, what e does
    if (me.carry) { box(g, 3, H - 14, 110, 11, 'rgba(18,10,16,.85)', null, 3); g.fillStyle = ITEM[me.carry].c; g.fillRect(6, H - 11, 5, 5); txt(g, `${ITEM[me.carry].name}${me.n > 1 ? ' ×' + me.n : ''} · x lâcher`, 14, H - 8.3, 6, P.txt); }
    if (r.task) {
      const k = r.task.t / r.task.dur;
      bar(g, me.x - 12, me.y - 22, 24, 3, k, P.gold);
      txt(g, r.task.label, me.x, me.y - 27, 5.5, P.txt, 'center');
    } else if (r.offer && !r.chem && r.phase === 'play') {
      const o = r.offer, s = `${o.fn ? 'e : ' : ''}${o.label}`;
      g.font = "700 6.5px 'Rubik', sans-serif"; const w = g.measureText(s).width + 10;
      box(g, W / 2 - w / 2, H - 14, w, 11, o.fn ? 'rgba(60,34,20,.92)' : 'rgba(18,10,16,.8)', o.fn ? P.gold : null, 3);
      txt(g, s, W / 2, H - 8.3, 6.5, o.fn ? P.gold : P.dim, 'center');
    }
    if (me.stun) txt(g, 'sonné…', me.x, me.y - 24, 7, P.bad, 'center');
    if (S.breach && S.breach.big) txt(g, `brèche ! ${Math.round(S.pres * 100)} %`, S.breach.x * T, S.breach.y * T - 14, 6.5, Math.sin(t * 8) > 0 ? P.bad : P.txt, 'center');
    if (r.chem) chemPanel(g);
  }
  function chemPanel(g) {
    const c = run.chem, x = W / 2 - 90, y = 60;
    box(g, x, y, 180, 70, 'rgba(18,10,16,.94)', P.line, 5);
    txt(g, 'réduction de l\'hydrazine', W / 2, y + 9, 7.5, P.gold, 'center');
    txt(g, 'e ou espace dans le vert · zqsd pour arrêter', W / 2, y + 19, 5.5, P.dim, 'center');
    const gx = x + 12, gw = 156, gy = y + 27;
    box(g, gx, gy, gw, 10, '#301a1a', null, 2);
    box(g, gx + (c.zone - .09) * gw, gy, .18 * gw, 10, c.flash > 0 ? '#bfffb0' : P.green2, null, 2);
    g.fillStyle = P.white; g.fillRect(gx + c.p * gw - 1, gy - 2, 2, 14);
    txt(g, 'chaleur', gx, gy + 20, 6, P.dim);
    bar(g, gx + 30, gy + 18, gw - 30, 4, c.heat, c.heat > .7 ? P.bad : P.orange);
    txt(g, `+${c.n * 6} l d'eau · ${Math.floor(run.S.tank)} l au réservoir`, W / 2, gy + 32, 6, P.water, 'center');
  }
  function endCard(g, S) {
    const r = run, won = S.over.won;
    box(g, W / 2 - 120, 40, 240, 140, 'rgba(18,10,16,.94)', P.line, 6);
    title(g, won ? 'l\'hermès est là !' : 'famine…', W / 2, 60, 16, won ? P.gold : P.bad);
    txt(g, won ? `sauvés au sol ${S.over.sol}` : `plus rien à manger au sol ${S.over.sol}`, W / 2, 77, 7, P.txt, 'center');
    const kcal = Math.round((S.rations + S.stock * POT) * 1500);
    if (won) txt(g, `${kcal.toLocaleString('fr-FR')} kcal en réserve · ${S.stock} patates`, W / 2, 88, 6.5, P.dim, 'center');
    const rank = [...r.humans].sort((a, b) => (S.contrib[b.id] || 0) - (S.contrib[a.id] || 0));
    rank.slice(0, 6).forEach((h, i) => {
      const y = 104 + i * 11;
      g.fillStyle = hexOf(h.color ?? 0xc8581a); g.fillRect(W / 2 - 80, y - 3, 5, 5);
      txt(g, `${i + 1}. ${h.id === r.meId ? 'toi' : h.name}`, W / 2 - 70, y, 7, h.id === r.meId ? P.gold : P.txt);
      txt(g, `${S.contrib[h.id] || 0} pts d'effort`, W / 2 + 80, y, 7, P.dim, 'right');
    });
  }

  // ---------- the module ----------
  const api = {
    modes: MODES,
    keys: [['z q s d', 'bouger'], ['e', 'agir (maintenir en place)'], ['x', 'lâcher ce qu\'on porte'], ['hydrazine', 'e dans le vert']],
    start({ seed = 1, opts = {}, humans = [], hostId, meId, send } = {}) {
      if (run) api.stop();
      sfx.init();
      const mode = MODES.find((m) => m.id === opts.mode) || MODES[0];
      if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
      const scr = createScreen('potato', '#0e0810');
      scr.setRect(rect);
      run = {
        scr, gui: null, K: createKeys(), S: freshHab(mode, humans.length), humans, hostId, meId, host: hostId === meId, send: send ?? (() => {}),
        me: null, others: new Map(), parts: [], notes: [], phase: 'count', count: COUNT, clock: 0, shake: 0, sendT: 0, task: null, chem: null, ended: false,
      };
      run.gui = createGui(scr, sfx);
      const i = Math.max(0, humans.findIndex((h) => h.id === meId)), mh = humans[i];
      run.me = { x: (7 + (i % 4) * 2) * T + 8, y: 11 * T + 12, face: 1, carry: null, n: 0, wt: 0, color: mh?.color ?? 0xc8581a };
      for (const h of humans) if (h.id !== meId) { const j = humans.indexOf(h); run.others.set(h.id, { x: (7 + (j % 4) * 2) * T + 8, y: 11 * T + 12, tx: (7 + (j % 4) * 2) * T + 8, ty: 11 * T + 12, face: 1, name: h.name, color: h.color ?? 0x4a8fe0 }); }
      run.cvDown = (e) => { sfx.init(); };
      scr.cv.addEventListener('mousedown', run.cvDown);
      render();
    },
    update(dt, keys = new Set()) {
      if (!run) return;
      if (document.pointerLockElement) document.exitPointerLock?.();
      dt = Math.min(Math.max(dt, 0), 1 / 20);
      run.scr.fit();
      run.clock += dt;
      if (dt > 0) step(dt, keys);
      if (run && !run.ended) render();
    },
    stop() {
      if (!run) return;
      run.scr.destroy(); run.K.destroy();
      run = null;
      sfx.pause();
    },
    respawn() { if (run && run.phase === 'play') { run.me.x = 8 * T + 8; run.me.y = 11 * T + 12; run.task = null; run.chem = null; } },
    onFx(id, fx) { if (run && fx) netRecv(id, fx); },
    peerLeft(id) {
      if (!run) return;
      run.others.delete(id);
      run.humans = run.humans.filter((h) => h.id !== id);
      if (id === run.hostId) { run.hostId = [...run.humans].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]?.id; run.host = run.hostId === run.meId; }
    },
    setRect(r) { rect = r; run?.scr.setRect(r); },
    hud() { return { hidden: true }; },
    set onEnd(f) { onEnd = f; },
    _dbg: {
      get run() { return run; },
      apply: (a) => apply(run.S, a, run.meId),
      skip(sec) { for (let i = 0; i < sec * 20 && run && run.phase !== 'end'; i++) { run.phase = 'play'; tick(run.S, .05, run.host); if (run.S.over) { run.phase = 'end'; run.endT = 0; } } },
    },
  };
  return api;
}
