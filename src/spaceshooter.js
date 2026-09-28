// spaceshooter.js, "comète furieuse": a horizontal shoot'em up on a 320×180 screen, level after level around the Moon.
// Eight levels (a boss every third one, then it loops, harder), capsules (spread, laser, missiles, shield, speed,
// bomb, power, 1up), combos. Co-op: every ship on screen, places by score. The level script and the enemy paths are
// deterministic (seed + level clock), so everyone spawns the same enemies; the host keeps their hit points, decides
// the kills, the drops and the enemy fire, and streams those. Each client flies its own ship and reports its hits.
import { canvas, text, PAL } from './nes-art.js';
import { createScreen, stars, drawStars, earth, burst, stepParts, drawParts, box, rng, hex, clamp, ord, REGULARS } from './arcade-art.js';
import { createArcadeSfx } from './arcade-sfx.js';
import { LEVELS, buildScript, pathOf, floorAt, SCROLL } from './spaceshooter-level.js';

const W = 320, H = 180, STEP = 1 / 60, COUNT = 3, SEND = 1 / 15, OVER = 7, LIVES = 3;
const CAPS = {
  S: { name: 'dispersion', col: '#ff9a3c' }, L: { name: 'laser', col: '#5ae8ff' }, M: { name: 'missiles', col: '#ff5a8a' },
  P: { name: 'puissance', col: '#ffd23c' }, B: { name: 'bouclier', col: '#7aff8a' }, V: { name: 'vitesse', col: '#c88aff' },
  X: { name: 'bombe', col: '#ff4a4a' }, 1: { name: '1up', col: '#fcfcfc' },
};
const CAP_BAG = 'SSSLLLMMMPPPPBBBVVXXX1';
const WEAPONS = { N: 'blaster', S: 'dispersion', L: 'laser' };

// ---------- the pixels ----------
function spr(rows, pal) {
  const [c, x] = canvas(rows[0].length, rows.length);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = pal[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } } });
  return c;
}
const SHIP = ['....aa..........', '....baa.........', '...cbbaaa.......', 'ddcbbbbbaaaww...', 'eddbbbbbbbbbbww.', 'eddbbbbbbbbbbbbw', 'eddbbbbbbbbbbww.', 'ddcbbbbbaaaww...', '...cbbaaa.......', '....baa.........', '....aa..........'];
const ART = {
  drone: [['..aaaa..', '.abbbba.', 'abcddcba', 'abddddba', 'abcddcba', '.abbbba.', '..aaaa..'], { a: '#6a2a8a', b: '#b04ae0', c: '#ffd23c', d: '#ff7aff' }],
  dart: [['......aa', '....aabb', '..aabbcc', 'aabbccdd', '..aabbcc', '....aabb', '......aa'], { a: '#8a2a2a', b: '#e04a4a', c: '#ff8a5a', d: '#ffe070' }],
  diver: [['...aaaa...', '..abbbba..', 'aabccccbaa', 'abcdddddcb', 'aabccccbaa', '..abbbba..', '...aaaa...'], { a: '#2a5a3a', b: '#4ab06a', c: '#8aff9a', d: '#ffffff' }],
  zig: [['aa......aa', 'abaa..aaba', '.abbbbbba.', '..bccccb..', '.abbbbbba.', 'abaa..aaba', 'aa......aa'], { a: '#8a6a1a', b: '#e0b03a', c: '#ff5a3c' }],
  bat: [['a........a', 'aa......aa', 'aba.bb.aba', 'abbbccbbba', '.abbbbbba.', '..a.aa.a..'], { a: '#3a2a5a', b: '#7a5ab0', c: '#ff4a4a' }],
  mine: [['...a...', '.a.b.a.', '..bcb..', 'abcdcba', '..bcb..', '.a.b.a.', '...a...'], { a: '#8a8a9a', b: '#c0c0d0', c: '#ff4a4a', d: '#ffd23c' }],
  turret: [['...aa...', '..abba..', '.abccba.', 'abbbbbba', 'dddddddd', 'deeeeeed'], { a: '#5a6a7a', b: '#9aaabb', c: '#ff4a4a', d: '#3a3a4a', e: '#6a6a7a' }],
  seg: [['..aaaa..', '.abbbba.', 'abbccbba', 'abcddcba', 'abbccbba', '.abbbba.', '..aaaa..'], { a: '#1a6a6a', b: '#3ab0a0', c: '#8affe0', d: '#ffffff' }],
};

export function createShooter() {
  let onEnd = () => {}, run = null, rect = null, A = null;
  const sfx = createArcadeSfx();

  function art() {
    if (A) return A;
    A = { ships: new Map(), en: {}, rocks: {}, earth: earth(22, 5), moon: moonDisc(38) };
    for (const [k, [rows, pal]] of Object.entries(ART)) {
      A.en[k] = spr(rows, pal);
      A.en[k + '!'] = spr(rows, Object.fromEntries(Object.keys(pal).map((c) => [c, '#ffffff'])));
    }
    A.carrier = carrierArt(); A.carrierF = whiten(A.carrier);
    for (const s of [6, 10]) { A.rocks[s] = rockArt(s, 3 + s); A.rocks[s + '!'] = whiten(A.rocks[s]); }
    A.crab = crabArt(); A.crabF = whiten(A.crab);
    A.claw = clawArt(); A.clawF = whiten(A.claw); A.clawB = flipY(A.claw); A.clawBF = whiten(A.clawB);
    A.eye = eyeArt(); A.eyeF = whiten(A.eye);
    A.pod = spr(['..aaaa..', '.abbbba.', 'abbccbba', 'abcddcba', 'abcddcba', 'abbccbba', '.abbbba.', '..aaaa..'], { a: '#5a1a3a', b: '#c03a6a', c: '#ff8ab0', d: '#ffffff' });
    A.podF = whiten(A.pod);
    A.head = headArt(); A.headF = whiten(A.head);
    A.caps = {};
    for (const [k, c] of Object.entries(CAPS)) A.caps[k] = capArt(k, c.col);
    return A;
  }
  const shipOf = (color) => {
    if (!A.ships.has(color)) {
      const base = hex(color);
      A.ships.set(color, spr(SHIP, { a: base, b: '#dfe6f0', c: '#8a94a8', d: '#5a6478', e: '#ff9a3c', w: '#5ae8ff' }));
    }
    return A.ships.get(color);
  };

  // ---------- life cycle ----------
  function start({ seed = 1, humans = [], hostId, meId, send } = {}) {
    stop();
    art();
    const scr = createScreen(W, H, 'shooter');
    scr.setRect(rect);
    const me0 = humans.find((h) => h.me) || { id: meId ?? 'me', name: 'toi', color: 0xc8581a, me: true };
    run = { seed, scr, humans, hostId, meId: me0.id, host: hostId === me0.id || !hostId, send: send ?? (() => {}), solo: humans.length < 2,
      R: rng(seed ^ 0x5eed), players: new Map(), enemies: new Map(), eb: [], shots: [], caps: new Map(), parts: [], pops: [], rings: [], outBox: [],
      level: 0, loop: 0, lvT: 0, phase: 'count', phaseT: 0, clock: 0, acc: 0, sendT: 0, syncT: 0, hpT: 0, shake: 0, flash: 0, capN: 0,
      script: null, si: 0, killed: new Set(), groups: new Map(), sky: stars(seed, W, H, 140), scroll: 0, prevBomb: false, final: null };
    const n = Math.max(1, humans.length);
    humans.forEach((h, k) => run.players.set(h.id, newPlayer(h, k, n)));
    if (!run.players.has(run.meId)) run.players.set(run.meId, newPlayer(me0, 0, 1));
    run.me = run.players.get(run.meId);
    run.me.me = true;
    setLevel(0, 0);
    sfx.init();
    render();
  }
  function newPlayer(h, k, n) {
    const y = Math.round(H * (k + 1) / (n + 1));
    return { id: h.id, name: h.me ? 'toi' : h.name, color: h.color ?? 0xffffff, x: 36, y, tx: 36, ty: y, lives: LIVES, score: 0, dead: 0, inv: 0, out: false,
      w: 'N', wl: 1, mis: 0, spd: 0, sh: 0, bombs: 2, combo: 0, comboT: 0, best: 0, fireT: 0, misT: 0, firing: false, tilt: 0 };
  }
  function stop() {
    if (!run) return;
    run.scr.remove();
    run = null;
    sfx.close();
  }
  const hpScale = () => (1 + .35 * (run.players.size - 1)) * (1 + .6 * run.loop);
  function setLevel(l, loop) {
    const r = run;
    r.level = l; r.loop = loop; r.lvT = 0; r.si = 0;
    r.script = buildScript(r.seed + l * 7919 + loop * 104729, l, loop);
    r.groups.clear();
    if (r.phase !== 'count') { r.phase = 'intro'; r.phaseT = 0; }
    for (const e of r.enemies.values()) if (!e.boss) e.gone = true;
    r.bossOn = false;
    sfx.music(LEVELS[l].boss ? 'boss' : 'shoot');
    sfx.tempo(1 + loop * .08);
  }

  // ---------- the loop ----------
  function update(dt, keys) {
    const r = run;
    if (!r) return;
    dt = Math.min(dt, .1);
    if (dt > 0) sfx.init();
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = {
      l: k('ArrowLeft', 'KeyA'), r: k('ArrowRight', 'KeyD'), u: k('ArrowUp', 'KeyW'), d: k('ArrowDown', 'KeyS'),
      fire: k('Space', 'KeyJ'), bomb: k('KeyE', 'KeyK', 'KeyB'), slow: k('ShiftLeft', 'ShiftRight'),
    };
    inp.bombEdge = inp.bomb && !r.prevBomb; r.prevBomb = inp.bomb;
    r.acc += dt;
    while (r.acc >= STEP && run === r) { r.acc -= STEP; tick(inp); inp.bombEdge = false; }
    if (run !== r) return;
    sfx.tick();
    if (r.host && r.outBox.length) { r.send({ t: 'eb', b: r.outBox }); r.outBox = []; }
    r.sendT += dt;
    if (r.sendT >= SEND && r.phase !== 'over' && r.phase !== 'done') {
      r.sendT = 0;
      const m = r.me;
      r.send({ t: 's', x: Math.round(m.x), y: Math.round(m.y), sc: m.score, l: m.lives, w: m.w, wl: m.wl, m: m.mis, sh: m.sh, d: m.dead > 0 ? 1 : 0, iv: m.inv > 0 ? 1 : 0, o: m.out ? 1 : 0, f: m.firing ? 1 : 0, cb: m.combo });
    }
    render();
  }
  function tick(inp) {
    const r = run;
    if (r.phase === 'done') return;
    r.clock += STEP; r.phaseT += STEP;
    r.shake = Math.max(0, r.shake - STEP * 10); r.flash = Math.max(0, r.flash - STEP * 3);
    r.scroll += STEP * (LEVELS[r.level].boss ? 1.6 : 1);
    if (r.phase === 'count') {
      const n = Math.ceil(COUNT - r.phaseT);
      if (n !== r.beep && n > 0) { r.beep = n; sfx.beep(false); }
      if (r.phaseT >= COUNT) { r.phase = 'intro'; r.phaseT = 0; sfx.beep(true); }
      stepMe(inp, false);
      return;
    }
    if (r.phase === 'over') { stepParts(r.parts, STEP); if (r.phaseT >= OVER) finish(); return; }
    if (r.phase === 'intro' && r.phaseT >= 2.5) { r.phase = 'fight'; r.phaseT = 0; if (LEVELS[r.level].boss) sfx.warn(); }
    if (r.phase === 'fight') {
      r.lvT += STEP;
      // the script: everyone spawns the same enemies at the same level time
      while (r.si < r.script.length && r.script[r.si].at <= r.lvT) spawn(r.script[r.si++]);
      if (r.host) hostLevel();
    }
    if (r.phase === 'clear' && r.host && r.phaseT >= 3) {
      const nl = (r.level + 1) % LEVELS.length, lp = r.loop + (nl === 0 ? 1 : 0);
      setLevel(nl, lp);
      r.send({ t: 'lv', l: nl, lp, ph: 'intro', tt: 0 });
    }
    if (r.host && (r.syncT += STEP) > 1) { r.syncT = 0; r.send({ t: 'lv', l: r.level, lp: r.loop, ph: r.phase, tt: r.lvT }); }
    stepEnemies();
    stepMe(inp, true);
    stepShots();
    stepEB();
    stepCaps();
    for (const p of r.players.values()) if (!p.me) stepRemote(p);
    stepParts(r.parts, STEP);
    for (let n = r.pops.length - 1; n >= 0; n--) if ((r.pops[n].t -= STEP) <= 0) r.pops.splice(n, 1);
    for (let n = r.rings.length - 1; n >= 0; n--) if ((r.rings[n].t += STEP) > r.rings[n].d) r.rings.splice(n, 1);
    if (r.host) {
      if ((r.hpT += STEP) > .3) { r.hpT = 0; const h = [...r.enemies.values()].filter((e) => e.big && !e.dead).map((e) => [e.id, Math.round(e.hp * 10) / 10]); if (h.length) r.send({ t: 'hp', h }); }
      const ps = [...r.players.values()];
      if (ps.length && ps.every((p) => p.out)) hostEnd();
    }
  }
  // the host: when the script is done and the screen is empty, the level is cleared
  function hostLevel() {
    const r = run;
    if (r.si < r.script.length) return;
    const left = [...r.enemies.values()].some((e) => !e.dead && !e.gone);
    if (!left && r.lvT > 2) { r.phase = 'clear'; r.phaseT = 0; clearBonus(); r.send({ t: 'lv', l: r.level, lp: r.loop, ph: 'clear', tt: r.lvT }); }
  }
  function clearBonus() {
    const r = run;
    sfx.wave();
    const bonus = 1000 * (r.level + 1) * (1 + r.loop);
    for (const p of r.players.values()) if (p.me && !p.out) { p.score += bonus; r.pops.push({ x: W / 2, y: 110, s: '+' + bonus, t: 2.5, col: '#ffd23c', big: true }); }
  }

  // ---------- enemies ----------
  function spawn(ev) {
    const r = run, sc = hpScale();
    for (const d of ev.list) {
      const id = r.level * 100000 + r.loop * 10000000 + d.id;
      if (r.enemies.has(id) || r.killed.has(id)) continue;
      const hp = d.hp * sc;
      const e = { id, k: d.k, p: d.p, age: d.age0 || 0, t0: r.lvT, hp, max: hp, dead: false, gone: false, flash: 0, x: -99, y: -99, g: d.g, big: d.hp >= 20, boss: !!d.boss, part: d.part != null ? r.level * 100000 + r.loop * 10000000 + d.part : null, pts: d.pts, ft: 1 + r.R() * 1.5, shield: d.shield };
      r.enemies.set(id, e);
      if (d.g != null) r.groups.set(d.g, (r.groups.get(d.g) || 0) + 1);
      if (e.boss && !e.part) { r.bossOn = e; sfx.music('boss'); }
    }
  }
  const alive = (e) => !e.dead && !e.gone && e.age >= 0;
  function stepEnemies() {
    const r = run;
    for (const e of r.enemies.values()) {
      if (e.dead || e.gone) continue;
      e.age += STEP;
      if (e.flash) e.flash--;
      if (e.age < 0) continue;
      const parent = e.part ? r.enemies.get(e.part) : null;
      const pos = pathOf(e, parent, r.lvT);
      if (!pos) { e.gone = true; continue; }
      e.x = pos.x; e.y = pos.y; e.rot = pos.rot || 0; e.w = pos.w; e.h = pos.h;
      if (r.host) enemyFire(e);
    }
    for (const [id, e] of r.enemies) if (e.dead || e.gone) r.enemies.delete(id);
  }
  // the host aims at the nearest ship; patterns by kind
  function nearest(x, y) {
    let best = null, bd = 1e9;
    for (const p of run.players.values()) { if (p.out || p.dead) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function shoot(x, y, ang, sp, k = 0) {
    const r = run, b = [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(Math.cos(ang) * sp * 10) / 10, Math.round(Math.sin(ang) * sp * 10) / 10, k];
    r.eb.push({ x: b[0], y: b[1], vx: b[2], vy: b[3], k });
    r.outBox.push(b);
  }
  function enemyFire(e) {
    const r = run;
    if (e.x > W - 4 || e.x < 8) return;
    e.ft -= STEP;
    if (e.ft > 0) return;
    const t = nearest(e.x, e.y);
    const aim = t ? Math.atan2(t.y - e.y, t.x - e.x) : Math.PI;
    const L = r.loop, bs = 1 + L * .15, rate = 1 / (1 + L * .25);
    switch (e.k) {
      case 'drone': e.ft = (2.5 + r.R() * 3) * rate; if (r.R() < .45) shoot(e.x, e.y, aim, 70 * bs); break;
      case 'dart': e.ft = 99; break;
      case 'diver': e.ft = 1.6 * rate; if (e.age > 1) shoot(e.x, e.y, aim, 85 * bs); break;
      case 'zig': e.ft = 1.8 * rate; shoot(e.x, e.y, Math.PI, 90 * bs, 2); break;
      case 'bat': e.ft = 2.2 * rate; for (const d of [-.2, .2]) shoot(e.x, e.y, aim + d, 70 * bs); break;
      case 'mine': e.ft = 99; break;
      case 'turret': e.ft = 1.4 * rate; shoot(e.x, e.y - 3, aim, 80 * bs, 1); break;
      case 'rock': e.ft = 99; break;
      case 'seg': case 'wseg': e.ft = (3 + r.R() * 3) * rate; if (r.R() < .5) shoot(e.x, e.y, aim, 65 * bs); break;
      case 'carrier': e.ft = 1.7 * rate; for (let n = -2; n <= 2; n++) shoot(e.x - 14, e.y, aim + n * .16, 75 * bs, 1); break;
      case 'claw': e.ft = 1.5 * rate; for (let n = -1; n <= 1; n++) shoot(e.x - 8, e.y, aim + n * .18, 95 * bs); break;
      case 'crab': {
        const hurt = e.hp < e.max / 2;
        e.ft = (hurt ? 1.3 : 2.1) * rate;
        const n = hurt ? 16 : 12, off = r.R() * 6.28;
        for (let k = 0; k < n; k++) shoot(e.x - 8, e.y, off + k * 6.28 / n, 60 * bs, 1);
        break;
      }
      case 'pod': e.ft = 2.4 * rate; shoot(e.x, e.y, aim, 80 * bs); break;
      case 'eye': {
        const hurt = e.hp < e.max / 2;
        e.ft = (hurt ? .09 : .13) * rate;
        e.sp = (e.sp || 0) + (hurt ? .55 : .42);
        shoot(e.x - 10, e.y, e.sp, 62 * bs, 2);
        if (hurt) shoot(e.x - 10, e.y, -e.sp + Math.PI, 62 * bs, 2);
        if ((e.burst = (e.burst || 0) + 1) % 22 === 0) for (let n = -3; n <= 3; n++) shoot(e.x - 10, e.y, aim + n * .1, 110 * bs, 1);
        break;
      }
      case 'head': {
        const hurt = e.hp < e.max / 2;
        e.ft = (hurt ? .9 : 1.4) * rate;
        for (let n = -2; n <= 2; n++) shoot(e.x - 6, e.y, aim + n * .22, 90 * bs, 1);
        if (hurt) for (let k = 0; k < 10; k++) shoot(e.x, e.y, k * .628 + e.age, 55 * bs);
        break;
      }
      default: e.ft = 99;
    }
    if (e.k !== 'eye' && r.clock - (r.pewAt || 0) > .09) { r.pewAt = r.clock; sfx.pew(); }
  }
  // one hit on an enemy, by me: I tell the host, the host keeps the count
  function damage(e, n, by) {
    const r = run;
    if (!alive(e)) return;
    // the eye's core shrugs most of it off while its pods still turn
    if (e.shield && [...r.enemies.values()].some((q) => q.part === e.id && alive(q))) n *= .2;
    e.flash = 3;
    if (r.host) {
      e.hp -= n;
      if (e.hp <= 0) kill(e, by);
    } else {
      e.hp = Math.max(.01, e.hp - n);
      r.dmg = r.dmg || new Map();
      r.dmg.set(e.id, (r.dmg.get(e.id) || 0) + n);
    }
  }
  function flushDmg() {
    const r = run;
    if (r.host || !r.dmg?.size) return;
    r.send({ t: 'd', d: [...r.dmg].map(([i, n]) => [i, Math.round(n * 100) / 100]) });
    r.dmg.clear();
  }
  // the host: an enemy dies, perhaps drops a capsule; everyone hears it
  function kill(e, by) {
    const r = run;
    if (e.dead) return;
    let cap = null;
    const g = e.g;
    if (g != null) { const left = (r.groups.get(g) || 1) - 1; r.groups.set(g, left); if (left <= 0 && !e.boss) cap = true; }
    const chance = e.boss ? 1 : e.big ? .5 : e.k === 'rock' && e.p.s > 6 ? .12 : .035;
    if (!cap && r.R() < chance) cap = true;
    let c = null;
    if (cap) { const kind = CAP_BAG[Math.floor(r.R() * CAP_BAG.length)]; c = [++r.capN + r.level * 1000 + r.loop * 100000, kind]; }
    r.send({ t: 'x', i: e.id, by, c, x: Math.round(e.x), y: Math.round(e.y) });
    died(e, by, c);
  }
  function died(e, by, c) {
    const r = run;
    e.dead = true;
    r.killed.add(e.id);
    const big = e.big || e.boss;
    burst(r.parts, e.x, e.y, '#ffd23c', big ? 30 : 10, big ? 120 : 70, big ? .9 : .45);
    burst(r.parts, e.x, e.y, '#ff6a3c', big ? 20 : 6, big ? 90 : 50, big ? .8 : .4);
    r.rings.push({ x: e.x, y: e.y, t: 0, d: big ? .6 : .3, r: big ? 30 : 12 });
    if (big) { r.shake = Math.max(r.shake, e.boss ? 6 : 3); sfx.boom(true); } else sfx.boom(false);
    const p = r.players.get(by);
    if (p?.me) score(p, e.pts ?? 100, e.x, e.y);
    // a big rock breaks in two
    if (e.k === 'rock' && e.p.s > 6) {
      for (const s of [-1, 1]) {
        const id = -(Math.abs(e.id) * 2 + (s > 0 ? 1 : 0));
        if (!r.enemies.has(id)) r.enemies.set(id, { id, k: 'rock', p: { s: 6, x0: e.x, y0: e.y, vx: -40 - Math.abs(e.p.vx || 0) * .3, vy: s * 30, sp: 0, free: true }, age: 0, hp: 2 * hpScale(), max: 2, dead: false, gone: false, flash: 0, x: e.x, y: e.y, pts: 50, ft: 99 });
      }
    }
    // a mine goes off in a ring
    if (e.k === 'mine' && r.host) for (let k = 0; k < 10; k++) shoot(e.x, e.y, k * .628, 60 * (1 + r.loop * .15), 2);
    // the boss down: its parts with it, the screen shakes
    if (e.boss && !e.part) {
      for (const q of r.enemies.values()) if (q.part === e.id && !q.dead) { q.dead = true; burst(r.parts, q.x, q.y, '#ffd23c', 14, 90, .7); }
      r.flash = 1; r.bossOn = false; r.eb.length = 0;
      for (let n = 0; n < 5; n++) setTimeout(() => { if (run === r) { burst(r.parts, e.x + (Math.random() - .5) * 50, e.y + (Math.random() - .5) * 40, '#fcfcfc', 20, 100, .8); sfx.boom(true); r.shake = 5; } }, n * 180);
      sfx.music('shoot');
    }
    if (c) addCap(c[0], c[1], e.x, e.y);
  }
  function score(p, base, x, y) {
    const r = run;
    p.combo = p.comboT > 0 ? p.combo + 1 : 1;
    p.comboT = 1.4;
    p.best = Math.max(p.best, p.combo);
    const mult = Math.min(8, 1 + Math.floor(p.combo / 6));
    const pts = base * mult;
    p.score += pts;
    r.pops.push({ x, y, s: String(pts), t: .7, col: mult > 1 ? '#ffd23c' : '#fcfcfc' });
    if (p.combo > 1 && p.combo % 6 === 0) { r.pops.push({ x: p.x + 10, y: p.y - 10, s: `combo x${mult}`, t: 1.2, col: '#ff8ae2' }); sfx.clank(); }
    if (!p.extra && p.score >= 50000) { p.extra = true; p.lives++; sfx.oneUp(); r.pops.push({ x: p.x, y: p.y - 12, s: '1up', t: 1.4, col: '#7aff8a' }); }
  }

  // ---------- capsules ----------
  function addCap(id, kind, x, y) {
    const r = run;
    if (r.caps.has(id)) return;
    r.caps.set(id, { id, k: kind, x: clamp(x, 10, W - 10), y: clamp(y, 16, H - 12), age: 0, claimed: false });
  }
  function stepCaps() {
    const r = run, m = r.me;
    for (const c of r.caps.values()) {
      c.age += STEP;
      c.x -= 22 * STEP; c.y += Math.sin(c.age * 3) * 12 * STEP;
      if (c.x < -12) { r.caps.delete(c.id); continue; }
      if (!m.out && !m.dead && !c.claimed && Math.abs(c.x - (m.x + 8)) < 12 && Math.abs(c.y - m.y) < 10) {
        c.claimed = true;
        if (r.host) { grant(c.id, m.id); r.send({ t: 'pg', i: c.id, by: m.id }); }
        else r.send({ t: 'pk', i: c.id });
      }
    }
  }
  function grant(id, by) {
    const r = run, c = r.caps.get(id);
    if (!c) return;
    r.caps.delete(id);
    const p = r.players.get(by);
    burst(r.parts, c.x, c.y, CAPS[c.k].col, 10, 50, .4);
    if (!p?.me) return;
    take(p, c.k);
  }
  function take(p, k) {
    const r = run;
    r.pops.push({ x: p.x + 8, y: p.y - 10, s: CAPS[k].name, t: 1.2, col: CAPS[k].col });
    p.score += 500;
    if (k === 'S' || k === 'L') { if (p.w === k) p.wl = Math.min(3, p.wl + 1); else p.w = k; sfx.power(); }
    else if (k === 'P') { p.wl = Math.min(3, p.wl + 1); sfx.power(); }
    else if (k === 'M') { p.mis = Math.min(3, p.mis + 1); sfx.power(); }
    else if (k === 'B') { p.sh = Math.min(3, p.sh + 1); sfx.shield(); }
    else if (k === 'V') { p.spd = Math.min(3, p.spd + 1); sfx.power(); }
    else if (k === 'X') { p.bombs = Math.min(5, p.bombs + 1); sfx.power(); }
    else if (k === '1') { p.lives++; sfx.oneUp(); }
  }

  // ---------- me ----------
  function stepMe(inp, live) {
    const r = run, m = r.me;
    if (m.out) return;
    if (m.comboT > 0 && (m.comboT -= STEP) <= 0) m.combo = 0;
    if (m.inv > 0) m.inv -= STEP;
    if (m.dead > 0) {
      m.dead -= STEP;
      if (m.dead <= 0) {
        m.dead = 0;
        if (m.lives <= 0) { m.out = true; sfx.over(); }
        else { m.inv = 2.5; m.x = -10; m.y = H / 2; m.enter = .6; }
      }
      return;
    }
    if (m.enter > 0) { m.enter -= STEP; m.x += 80 * STEP; return; }
    const sp = (inp.slow ? 55 : 95) + m.spd * 18;
    const dx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), dy = (inp.d ? 1 : 0) - (inp.u ? 1 : 0), n = dx && dy ? .7071 : 1;
    m.x = clamp(m.x + dx * sp * n * STEP, 4, W - 20);
    const floor = LEVELS[r.level].floor && r.phase !== 'count' ? floorAt(r.lvT * SCROLL + m.x) : H;
    m.y = clamp(m.y + dy * sp * n * STEP, 14, Math.min(H - 8, floor - 6));
    m.tilt += (dy - m.tilt) * .2;
    m.firing = live && inp.fire;
    if (m.firing) fire(m, true);
    if (live && inp.bombEdge && m.bombs > 0 && (r.phase === 'fight' || r.phase === 'intro')) { m.bombs--; bomb(m.id); r.send({ t: 'bomb' }); }
    // the collisions: bullets and bodies against a tiny core
    if (!live || m.inv > 0) return;
    const cx = m.x + 8, cy = m.y;
    for (const b of r.eb) if (!b.dead && Math.abs(b.x - cx) < (b.k === 1 ? 4 : 3) && Math.abs(b.y - cy) < (b.k === 1 ? 4 : 3)) { b.dead = true; hurt(); return; }
    for (const e of r.enemies.values()) {
      if (!alive(e) || e.x < -20) continue;
      const ew = (e.w || 8) / 2, eh = (e.h || 8) / 2;
      if (Math.abs(e.x - cx) < ew + 2 && Math.abs(e.y - cy) < eh + 1) { hurt(); damage(e, 6, m.id); return; }
    }
  }
  function hurt() {
    const r = run, m = r.me;
    if (m.sh > 0) { m.sh--; m.inv = 1; sfx.shield(); r.rings.push({ x: m.x + 8, y: m.y, t: 0, d: .4, r: 18, col: '#7aff8a' }); return; }
    m.lives--; m.dead = 1.6; m.combo = 0;
    m.wl = Math.max(1, m.wl - 1); m.mis = Math.max(0, m.mis - 1); m.spd = Math.max(0, m.spd - 1);
    burst(r.parts, m.x + 8, m.y, hex(m.color), 26, 100, .9);
    burst(r.parts, m.x + 8, m.y, '#ffd23c', 18, 70, .7);
    r.rings.push({ x: m.x + 8, y: m.y, t: 0, d: .5, r: 26 });
    r.shake = 5; sfx.die();
    r.send({ t: 'hurt' });
  }
  function bomb(by) {
    const r = run, p = r.players.get(by);
    r.flash = 1; r.shake = 6; sfx.bomb();
    r.eb.length = 0;
    r.rings.push({ x: (p?.x ?? W / 2) + 8, y: p?.y ?? H / 2, t: 0, d: .8, r: 260, col: '#ffffff' });
    if (r.host) for (const e of r.enemies.values()) if (alive(e) && e.x < W + 4) { e.flash = 6; e.hp -= e.boss ? 30 * (1 + r.loop * .5) : 40; if (e.hp <= 0) kill(e, by); }
  }
  // a ship fires: its own shots are real, the others' only for the eyes
  function fire(p, real) {
    const r = run;
    p.fireT -= STEP; p.misT -= STEP;
    const x = p.x + 16, y = p.y, o = p.id;
    if (p.fireT <= 0) {
      if (p.w === 'N') {
        p.fireT = [.13, .11, .09][p.wl - 1];
        r.shots.push({ x, y: y - 2, vx: 340, vy: 0, k: 'N', dmg: 1, o, real }, { x, y: y + 2, vx: 340, vy: 0, k: 'N', dmg: 1, o, real });
        if (p.wl >= 2) r.shots.push({ x: x - 4, y: y - 4, vx: 320, vy: -40, k: 'N', dmg: 1, o, real }, { x: x - 4, y: y + 4, vx: 320, vy: 40, k: 'N', dmg: 1, o, real });
        if (p.wl >= 3) r.shots.push({ x: x - 8, y, vx: 360, vy: 0, k: 'N', dmg: 1.5, o, real });
      } else if (p.w === 'S') {
        p.fireT = .15;
        const n = [3, 5, 7][p.wl - 1];
        for (let k = 0; k < n; k++) { const a = (k - (n - 1) / 2) * .17; r.shots.push({ x, y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, k: 'S', dmg: 1, o, real }); }
      } else {
        p.fireT = .05;
        const lines = [[0], [-3, 3], [-5, 0, 5]][p.wl - 1];
        for (const d of lines) r.shots.push({ x, y: y + d, vx: 460, vy: 0, k: 'L', dmg: .45, o, real, pierce: new Set() });
      }
      if (p.me) (p.w === 'L' ? sfx.laser : sfx.shot)();
    }
    if (p.mis && p.misT <= 0) {
      p.misT = .55;
      for (let k = 0; k < p.mis; k++) r.shots.push({ x: p.x + 6, y: y + (k % 2 ? 5 : -5), vx: 60, vy: (k % 2 ? 1 : -1) * 60, k: 'M', dmg: 3, o, real, life: 2.5 });
      if (p.me) sfx.missile();
    }
  }
  // the others: glide to where they said, and fire what they fire
  function stepRemote(p) {
    p.x += (p.tx - p.x) * Math.min(1, STEP * 12); p.y += (p.ty - p.y) * Math.min(1, STEP * 12);
    if (p.firing && !p.dead && !p.out) fire(p, false);
  }
  function stepShots() {
    const r = run;
    for (const s of r.shots) {
      if (s.dead) continue;
      if (s.k === 'M') {
        s.life -= STEP;
        // homing: the closest enemy ahead
        let t = null, bd = 1e9;
        for (const e of r.enemies.values()) { if (!alive(e) || e.x > W + 4) continue; const d = Math.hypot(e.x - s.x, e.y - s.y); if (d < bd) { bd = d; t = e; } }
        const sp = Math.min(260, Math.hypot(s.vx, s.vy) + 400 * STEP);
        let a = Math.atan2(s.vy, s.vx);
        if (t) { const want = Math.atan2(t.y - s.y, t.x - s.x); let d = want - a; while (d > Math.PI) d -= 6.28; while (d < -Math.PI) d += 6.28; a += clamp(d, -5 * STEP, 5 * STEP); }
        s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
        if (Math.random() < .5) r.parts.push({ x: s.x, y: s.y, vx: -20, vy: 0, t: .2, col: '#ff9a3c' });
        if (s.life <= 0) s.dead = true;
      }
      s.x += s.vx * STEP; s.y += s.vy * STEP;
      if (s.x > W + 20 || s.x < -10 || s.y < -10 || s.y > H + 10) { s.dead = true; continue; }
      for (const e of r.enemies.values()) {
        if (!alive(e) || (s.pierce && s.pierce.has(e.id))) continue;
        const ew = (e.w || 8) / 2 + (s.k === 'L' ? 3 : 1), eh = (e.h || 8) / 2 + 1;
        if (Math.abs(e.x - s.x) < ew && Math.abs(e.y - s.y) < eh) {
          if (s.pierce) s.pierce.add(e.id); else s.dead = true;
          if (s.real) { damage(e, s.dmg, s.o); if (!e.big) sfx.hit(); }
          else e.flash = Math.max(e.flash, 2);
          r.parts.push({ x: s.x, y: s.y, vx: -30, vy: (Math.random() - .5) * 60, t: .15, col: '#fcfcfc' });
          if (!s.pierce) break;
        }
      }
    }
    r.shots = r.shots.filter((s) => !s.dead);
    flushDmg();
  }
  function stepEB() {
    const r = run;
    for (const b of r.eb) { b.x += b.vx * STEP; b.y += b.vy * STEP; if (b.x < -8 || b.x > W + 8 || b.y < -8 || b.y > H + 8) b.dead = true; }
    r.eb = r.eb.filter((b) => !b.dead);
  }
  function hostEnd() {
    const r = run;
    if (r.phase === 'over') return;
    const sc = [...r.players.values()].map((p) => [p.id, p.score]);
    r.send({ t: 'end', sc });
    gameOver(sc);
  }
  function gameOver(sc) {
    const r = run;
    r.phase = 'over'; r.phaseT = 0;
    for (const [id, s] of sc) { const p = r.players.get(id); if (p && !p.me) p.score = Math.max(p.score, s); }
    sfx.music(null);
    if (standings()[0]?.me) sfx.win(); else sfx.over();
  }
  function standings() {
    const r = run, list = [...r.players.values()];
    if (r.solo) return [...list, ...REGULARS.map((g, k) => ({ id: '@r' + k, name: g.name, color: g.color, score: [180000, 90000, 35000][k], reg: true }))].sort((a, b) => b.score - a.score);
    return list.sort((a, b) => b.score - a.score);
  }
  function finish() {
    const r = run, list = standings(), place = list.findIndex((p) => p.me) + 1, of = list.length, m = r.me;
    const lv = r.loop * LEVELS.length + r.level + 1;
    const txt = `${ord(place)} place sur ${of} · ${m.score} points · niveau ${lv} · combo x${m.best}`;
    r.phase = 'done';
    setTimeout(() => { if (run === r) onEnd({ place, of, time: Math.round(r.clock * 10) / 10, value: m.score, text: txt }); });
  }

  // ---------- the network ----------
  function onFx(id, fx) {
    const r = run;
    if (!r || !fx || id === r.meId) return;
    let p = r.players.get(id);
    if (!p && fx.t === 's') { p = newPlayer({ id, name: 'invité', color: 0xffffff }, 0, 1); r.players.set(id, p); }
    if (fx.t === 's' && p) {
      p.tx = +fx.x || 0; p.ty = +fx.y || 0; p.score = Math.max(p.score, fx.sc | 0); p.lives = fx.l | 0;
      p.w = WEAPONS[fx.w] ? fx.w : 'N'; p.wl = clamp(fx.wl | 0, 1, 3); p.mis = clamp(fx.m | 0, 0, 3); p.sh = fx.sh | 0;
      p.dead = fx.d ? 1 : 0; p.inv = fx.iv ? 1 : 0; p.out = !!fx.o; p.firing = !!fx.f; p.combo = fx.cb | 0;
    } else if (fx.t === 'eb' && id === r.hostId) { for (const [x, y, vx, vy, k] of fx.b || []) r.eb.push({ x, y, vx, vy, k }); }
    else if (fx.t === 'x') {
      const e = r.enemies.get(fx.i);
      if (e && !e.dead) { if (e.x < -50) { e.x = fx.x; e.y = fx.y; } died(e, fx.by, fx.c); }
      else { r.killed.add(fx.i); if (fx.c) addCap(fx.c[0], fx.c[1], +fx.x || W / 2, +fx.y || H / 2); }
    } else if (fx.t === 'd' && r.host) {
      for (const [i, n] of fx.d || []) { const e = r.enemies.get(i); if (e && alive(e)) { e.hp -= +n || 0; e.flash = 3; if (e.hp <= 0) kill(e, id); } }
    } else if (fx.t === 'hp' && id === r.hostId) { for (const [i, h] of fx.h || []) { const e = r.enemies.get(i); if (e && !e.dead) e.hp = Math.min(e.hp, h); } }
    else if (fx.t === 'pk' && r.host) { if (r.caps.has(fx.i)) { grant(fx.i, id); r.send({ t: 'pg', i: fx.i, by: id }); } }
    else if (fx.t === 'pg') { const c = r.caps.get(fx.i); if (c) grant(fx.i, fx.by); }
    else if (fx.t === 'bomb') bomb(id);
    else if (fx.t === 'hurt' && p) { burst(r.parts, p.x + 8, p.y, hex(p.color), 22, 90, .8); r.rings.push({ x: p.x + 8, y: p.y, t: 0, d: .5, r: 24 }); sfx.boom(true); }
    else if (fx.t === 'lv' && id === r.hostId && !r.host) {
      if (fx.l !== r.level || fx.lp !== r.loop) setLevel(fx.l, fx.lp);
      if (r.phase !== 'count' && r.phase !== 'over' && r.phase !== 'done' && fx.ph !== r.phase) {
        if (fx.ph === 'clear') clearBonus();
        r.phase = fx.ph; r.phaseT = 0;
      }
      // the level clock: catch up with the host's
      if (fx.ph === 'fight' && Math.abs(fx.tt - r.lvT) > .3) { r.lvT = fx.tt; while (r.si < r.script.length && r.script[r.si].at <= r.lvT) spawn(r.script[r.si++]); }
    } else if (fx.t === 'end' && id === r.hostId && r.phase !== 'over' && r.phase !== 'done') gameOver(fx.sc || []);
  }
  function peerLeft(id) {
    const r = run;
    if (!r || id === r.meId) return;
    r.players.delete(id);
    r.humans = r.humans.filter((h) => h.id !== id);
    if (id === r.hostId) {
      r.hostId = r.humans[0]?.id ?? r.meId;
      if (r.hostId === r.meId) { r.host = true; for (const e of r.enemies.values()) e.ft = 1 + Math.random(); }
    }
  }

  // ---------- drawing ----------
  function render() {
    const r = run, x = r.scr.bx, lv = LEVELS[r.level];
    x.fillStyle = lv.sky; x.fillRect(0, 0, W, H);
    if (lv.nebula) { const g = x.createRadialGradient(W * .7, H * .4, 5, W * .7, H * .4, 150); g.addColorStop(0, lv.nebula); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    drawStars(x, r.sky, r.clock, W, r.scroll, [6, 16, 40]);
    // the backdrop of each level
    if (lv.back === 'earth') x.drawImage(A.earth, Math.round(W - 80 - r.lvT * 1.5), 30);
    else if (lv.back === 'moon') x.drawImage(A.moon, Math.round(W - 110 - r.lvT * 1), 40);
    if (lv.floor) {
      const off = r.phase === 'count' ? 0 : r.lvT * SCROLL;
      for (let i = 0; i < W; i++) {
        const top = Math.round(floorAt(off + i));
        x.fillStyle = '#b8bcc8'; x.fillRect(i, top, 1, 1);
        x.fillStyle = '#8a8e9a'; x.fillRect(i, top + 1, 1, 3);
        x.fillStyle = '#5a5e6a'; x.fillRect(i, top + 4, 1, H - top - 4);
      }
    }
    // capsules
    for (const c of r.caps.values()) { if (c.age > 8 && Math.floor(c.age * 8) % 2) continue; x.drawImage(A.caps[c.k], Math.round(c.x - 6), Math.round(c.y - 5)); }
    // enemies
    for (const e of r.enemies.values()) if (!e.dead && !e.gone && e.age >= 0) drawEnemy(x, e);
    // ships
    for (const p of r.players.values()) {
      if (p.out || p.dead > 0) continue;
      if (p.inv > 0 && Math.floor(r.clock * 14) % 2) continue;
      const sx = Math.round(p.x), sy = Math.round(p.y - 5);
      // the flame
      const fl = 3 + Math.floor(Math.random() * 4);
      x.fillStyle = '#ffd23c'; x.fillRect(sx - fl, sy + 5, fl, 1);
      x.fillStyle = '#ff6a3c'; x.fillRect(sx - fl + 1, sy + 4, fl - 2, 3);
      x.globalAlpha = p.me ? 1 : .85;
      x.drawImage(shipOf(p.color), sx, sy);
      x.globalAlpha = 1;
      if (p.sh > 0) { x.strokeStyle = `rgba(122,255,138,${.35 + .15 * Math.sin(r.clock * 10)})`; x.beginPath(); x.arc(sx + 8, sy + 5, 12, 0, 6.28); x.stroke(); }
      if (!p.me) { x.fillStyle = hex(p.color); x.fillRect(sx + 4, sy - 3, 6, 1); }
    }
    // shots
    for (const s of r.shots) {
      const p = r.players.get(s.o), sx = Math.round(s.x), sy = Math.round(s.y), a = s.real ? 1 : .6;
      x.globalAlpha = a;
      if (s.k === 'N') { x.fillStyle = '#ffe070'; x.fillRect(sx - 5, sy, 6, 1); x.fillStyle = '#fff'; x.fillRect(sx - 2, sy, 3, 1); }
      else if (s.k === 'S') { x.fillStyle = '#ff9a3c'; x.fillRect(sx - 1, sy - 1, 3, 3); x.fillStyle = '#fff'; x.fillRect(sx, sy, 1, 1); }
      else if (s.k === 'L') { x.fillStyle = '#5ae8ff'; x.fillRect(sx - 14, sy, 15, 1); x.fillStyle = 'rgba(90,232,255,.35)'; x.fillRect(sx - 14, sy - 1, 15, 3); }
      else { x.fillStyle = '#ff5a8a'; x.fillRect(sx - 2, sy - 1, 4, 2); x.fillStyle = '#fff'; x.fillRect(sx + 1, sy - 1, 1, 2); }
      if (!p?.me && p && s.k !== 'M') { x.fillStyle = hex(p.color); x.fillRect(sx, sy, 1, 1); }
      x.globalAlpha = 1;
    }
    // enemy bullets
    const blink = Math.floor(r.clock * 12) % 2;
    for (const b of r.eb) {
      const bx = Math.round(b.x), by = Math.round(b.y);
      if (b.k === 1) { x.fillStyle = blink ? '#ff4a8a' : '#ff8ab0'; x.fillRect(bx - 2, by - 1, 5, 3); x.fillRect(bx - 1, by - 2, 3, 5); x.fillStyle = '#fff'; x.fillRect(bx, by, 1, 1); }
      else if (b.k === 2) { x.fillStyle = blink ? '#b05aff' : '#e0aaff'; x.fillRect(bx - 1, by - 1, 3, 3); x.fillStyle = '#fff'; x.fillRect(bx, by, 1, 1); }
      else { x.fillStyle = blink ? '#ff9a3c' : '#ffd23c'; x.fillRect(bx - 1, by - 1, 3, 3); x.fillStyle = '#fff'; x.fillRect(bx, by, 1, 1); }
    }
    drawParts(x, r.parts);
    for (const g of r.rings) {
      const k = g.t / g.d;
      x.strokeStyle = g.col || `rgba(255,210,60,${1 - k})`; x.globalAlpha = 1 - k;
      x.beginPath(); x.arc(g.x, g.y, 2 + g.r * k, 0, 6.28); x.stroke();
      x.globalAlpha = 1;
    }
    for (const p of r.pops) text(x, p.s, Math.round(p.x), Math.round(p.y - (1 - p.t) * 8), p.col, 1, PAL.K, 'center');
    if (r.flash > 0) { x.fillStyle = `rgba(255,255,255,${r.flash * .7})`; x.fillRect(0, 0, W, H); }
    drawHud(x);
    r.scr.blit(r.shake);
  }
  function drawEnemy(x, e) {
    const f = e.flash > 0, ex = Math.round(e.x), ey = Math.round(e.y);
    let img;
    switch (e.k) {
      case 'rock': img = A.rocks[e.p.s + (f ? '!' : '')]; break;
      case 'carrier': img = f ? A.carrierF : A.carrier; break;
      case 'crab': img = f ? A.crabF : A.crab; break;
      case 'claw': img = e.p.side > 0 ? (f ? A.clawBF : A.clawB) : (f ? A.clawF : A.claw); break;
      case 'eye': img = f ? A.eyeF : A.eye; break;
      case 'pod': img = f ? A.podF : A.pod; break;
      case 'head': img = f ? A.headF : A.head; break;
      default: img = A.en[(e.k === 'wseg' ? 'seg' : e.k) + (f ? '!' : '')];
    }
    if (!img) return;
    if (e.k === 'rock') { x.save(); x.translate(ex, ey); x.rotate(Math.round(e.age * (e.p.spin || 1) * 4) / 4); x.drawImage(img, -img.width / 2, -img.height / 2); x.restore(); }
    else x.drawImage(img, Math.round(ex - img.width / 2), Math.round(ey - img.height / 2));
    if (e.k === 'eye') {
      // the pupil follows the nearest ship
      const t = nearest(e.x, e.y), a = t ? Math.atan2(t.y - e.y, t.x - e.x) : Math.PI;
      x.fillStyle = '#1a0a1a'; x.fillRect(Math.round(ex - 4 + Math.cos(a) * 6), Math.round(ey - 4 + Math.sin(a) * 6), 8, 8);
      x.fillStyle = '#ff2a4a'; x.fillRect(Math.round(ex - 2 + Math.cos(a) * 7), Math.round(ey - 2 + Math.sin(a) * 7), 4, 4);
    }
  }
  function drawHud(x) {
    const r = run, m = r.me, sh = PAL.K, lv = LEVELS[r.level];
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W, 11);
    text(x, String(m.score).padStart(7, '0'), 3, 2, PAL.W, 1, sh);
    const mult = Math.min(8, 1 + Math.floor(m.combo / 6));
    if (m.combo > 1) text(x, `${m.combo} x${mult}`, 50, 2, mult > 1 ? '#ff8ae2' : '#bcbcbc', 1, sh);
    for (let n = 0; n < Math.min(4, m.lives - (m.dead > 0 || m.out ? 0 : 1)); n++) { x.drawImage(shipOf(m.color), 0, 0, 16, 11, 94 + n * 11, 2, 9, 6); }
    for (let n = 0; n < m.bombs; n++) { x.fillStyle = '#ff4a4a'; x.fillRect(142 + n * 6, 3, 4, 4); x.fillStyle = '#ffd23c'; x.fillRect(143 + n * 6, 2, 2, 1); }
    text(x, `${WEAPONS[m.w]} ${m.wl}${m.mis ? ' +m' + m.mis : ''}`, 176, 2, CAPS[m.w === 'N' ? 'P' : m.w].col, 1, sh);
    text(x, `niv ${r.loop * LEVELS.length + r.level + 1}`, W - 3, 2, '#8fe3ff', 1, sh, 'right');
    // the others
    [...r.players.values()].filter((p) => !p.me).slice(0, 5).forEach((p, n) => {
      x.fillStyle = hex(p.color); x.fillRect(3, 15 + n * 9, 4, 4);
      text(x, `${p.name.slice(0, 8)} ${p.score}${p.out ? ' x' : ''}`, 10, 13 + n * 9, p.out ? '#707070' : '#bcbcbc', 1, sh);
    });
    // the boss's life
    const boss = r.bossOn && !r.bossOn.dead ? r.bossOn : null;
    if (boss) {
      const k = clamp(boss.hp / boss.max, 0, 1);
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(W / 2 - 60, H - 8, 120, 5);
      x.fillStyle = k < .5 ? '#ff4a4a' : '#ffd23c'; x.fillRect(W / 2 - 59, H - 7, Math.round(118 * k), 3);
    }
    if (r.phase === 'count') {
      const n = Math.ceil(COUNT - r.phaseT);
      box(x, 50, 50, W - 100, 70, '#ff9a3c');
      text(x, 'comete furieuse', W / 2, 60, '#ffd23c', 2, sh, 'center');
      text(x, r.players.size > 1 ? `${r.players.size} vaisseaux - le meilleur score gagne` : 'bats le tableau des records', W / 2, 84, PAL.W, 1, null, 'center');
      text(x, String(n), W / 2, 100, PAL.W, 2, null, 'center');
    } else if (r.phase === 'intro') {
      const t = r.phaseT;
      if (Math.floor(t * 4) % 2 || !lv.boss) {
        text(x, `niveau ${r.loop * LEVELS.length + r.level + 1}`, W / 2, 66, lv.boss ? '#ff4a4a' : '#8fe3ff', 1, sh, 'center');
        text(x, lv.name, W / 2, 78, lv.boss ? '#ff4a4a' : '#ffd23c', 2, sh, 'center');
        if (lv.boss) text(x, 'attention !', W / 2, 98, '#ff4a4a', 1, sh, 'center');
      }
    } else if (r.phase === 'clear') {
      text(x, 'niveau termine !', W / 2, 70, '#7aff8a', 2, sh, 'center');
      text(x, `bonus ${1000 * (r.level + 1) * (1 + r.loop)}`, W / 2, 92, '#ffd23c', 1, sh, 'center');
    }
    if (m.out && r.phase !== 'over' && r.phase !== 'done') text(x, 'plus de vaisseau - regarde les autres', W / 2, H / 2, '#bcbcbc', 1, sh, 'center');
    if (r.phase === 'over' || r.phase === 'done') drawResults(x);
  }
  function drawResults(x) {
    const r = run;
    if (r.phaseT < 1) { text(x, 'fin de partie', W / 2, 80, '#ff4a4a', 2, PAL.K, 'center'); return; }
    const list = standings().slice(0, 8), h = 46 + list.length * 11, y0 = Math.round((H - h) / 2), w = 200, x0 = (W - w) / 2;
    box(x, x0, y0, w, h, '#ffd23c');
    text(x, r.solo ? 'meilleurs scores' : 'scores', W / 2, y0 + 7, '#ffd23c', 1, null, 'center');
    list.forEach((p, n) => {
      const y = y0 + 21 + n * 11, col = p.me ? '#ffd23c' : p.reg ? '#8a8a9a' : PAL.W;
      text(x, `${n + 1}.`, x0 + 8, y, col);
      x.fillStyle = hex(p.color); x.fillRect(x0 + 24, y + 1, 5, 5);
      text(x, p.name.slice(0, 12), x0 + 34, y, col);
      text(x, String(p.score), x0 + w - 8, y, col, 1, null, 'right');
    });
    text(x, `fin dans ${Math.max(0, Math.ceil(OVER - r.phaseT))}`, W / 2, y0 + h - 12, '#bcbcbc', 1, null, 'center');
  }

  return {
    keys: [['z q s d', 'voler'], ['← ↑ → ↓', 'voler aussi'], ['espace', 'tirer (garder appuyé)'], ['e', 'bombe'], ['shift', 'ralentir']],
    start, stop, update, onFx, peerLeft,
    respawn() {},
    hud() { return { hidden: true }; },
    setRect(rc) { rect = rc; run?.scr.setRect(rc); },
    set onEnd(f) { onEnd = f; },
    get _dbg() { return run; },
    // for the tests: straight to a level
    warp(l, loop = 0) { if (!run) return; run.phase = 'intro'; setLevel(l, loop); run.phaseT = 2.4; },
  };
}

// ---------- procedural sprites ----------
function whiten(src) {
  const [c, x] = canvas(src.width, src.height);
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function flipY(src) { const [c, x] = canvas(src.width, src.height); x.translate(0, src.height); x.scale(1, -1); x.drawImage(src, 0, 0); return c; }
function rockArt(r, seed) {
  const d = r * 2 + 2, [c, x] = canvas(d, d), R = rng(seed);
  const bumps = Array.from({ length: 8 }, () => .75 + R() * .3);
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    const u = i - r - .5, v = j - r - .5, a = Math.atan2(v, u), q = Math.hypot(u, v);
    const rr = r * bumps[Math.floor(((a + Math.PI) / 6.2832) * 8) % 8];
    if (q > rr) continue;
    const lit = (-u - v) / (r * 1.4);
    const k = q > rr - 1 ? .55 : .75 + lit * .35 + (R() - .5) * .12;
    x.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(140 * k)},${Math.round(130 * k)})`;
    x.fillRect(i, j, 1, 1);
  }
  x.fillStyle = 'rgba(40,36,32,.6)';
  for (let n = 0; n < r / 2; n++) { const a = R() * 6.28, q = R() * r * .5; x.fillRect(Math.round(r + Math.cos(a) * q), Math.round(r + Math.sin(a) * q), 2, 2); }
  return c;
}
function moonDisc(r) {
  const d = r * 2 + 2, [c, x] = canvas(d, d), R = rng(21);
  const cr = Array.from({ length: 14 }, () => [R() * 2 - 1, R() * 2 - 1, .06 + R() * .16]);
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    const u = (i - r - .5) / r, v = (j - r - .5) / r, q = u * u + v * v;
    if (q > 1) continue;
    const lit = -u * .6 - v * .4 + Math.sqrt(1 - q) * .7;
    let k = lit > .3 ? .95 : lit > 0 ? .7 : .35;
    if (cr.some(([a, b, s]) => (u - a) ** 2 + (v - b) ** 2 < s * s)) k *= .78;
    x.fillStyle = `rgb(${Math.round(200 * k)},${Math.round(200 * k)},${Math.round(210 * k)})`;
    x.fillRect(i, j, 1, 1);
  }
  return c;
}
function capArt(k, col) {
  const [c, x] = canvas(13, 11);
  x.fillStyle = '#1a1a2a'; x.fillRect(1, 0, 11, 11); x.fillRect(0, 1, 13, 9);
  x.fillStyle = col; x.fillRect(2, 1, 9, 9); x.fillRect(1, 2, 11, 7);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(3, 2, 6, 1);
  text(x, k, 4, 2, '#1a1a2a');
  return c;
}
function carrierArt() {
  return spr([
    '..........aaaaaaaaaa......',
    '......aaaabbbbbbbbbbaa....',
    '...aaabbbbccccccccbbbbaa..',
    '.aabbbbccccddddccccbbbbba.',
    'abbbeebccddddddddccbbbbbba',
    'abbbeebccddffffddccbbbbbba',
    'abbbeebccddddddddccbbbbbba',
    '.aabbbbccccddddccccbbbbba.',
    '...aaabbbbccccccccbbbbaa..',
    '......aaaabbbbbbbbbbaa....',
    '..........aaaaaaaaaa......',
  ], { a: '#3a3a4a', b: '#7a7a8a', c: '#aaaabb', d: '#5a5a6a', e: '#ff4a4a', f: '#ffd23c' });
}
function crabArt() {
  const [c, x] = canvas(48, 40);
  for (let j = 0; j < 40; j++) for (let i = 0; i < 48; i++) {
    const u = (i - 26) / 22, v = (j - 20) / 18, q = u * u + v * v;
    if (q > 1) continue;
    const k = .6 + .4 * (1 - q) + (i + j) % 5 * .02;
    x.fillStyle = q > .85 ? '#5a1a1a' : `rgb(${Math.round(210 * k)},${Math.round(80 * k)},${Math.round(50 * k)})`;
    x.fillRect(i, j, 1, 1);
  }
  // plates, eyes, the mouth
  x.fillStyle = '#8a2a1a'; for (let n = 0; n < 4; n++) x.fillRect(16 + n * 7, 6, 1, 28);
  x.fillStyle = '#ffffff'; x.fillRect(8, 12, 6, 6); x.fillRect(8, 22, 6, 6);
  x.fillStyle = '#1a0a0a'; x.fillRect(8, 14, 3, 3); x.fillRect(8, 24, 3, 3);
  x.fillStyle = '#ffd23c'; x.fillRect(4, 18, 8, 4);
  x.fillStyle = '#ff4a4a'; x.fillRect(5, 19, 6, 2);
  return c;
}
function clawArt() {
  return spr([
    '.....aaaaaaa....',
    '...aabbbbbbbaa..',
    '..abbccccccbbba.',
    '.abcc......ccbba',
    'abc...........ba',
    'abc.........aaba',
    'abcc.......abbba',
    '.abbcccccccbbba.',
    '..aabbbbbbbbaa..',
    '....aaaaaaaa....',
  ], { a: '#5a1a1a', b: '#c04a2a', c: '#ff8a5a' });
}
function eyeArt() {
  const [c, x] = canvas(40, 40);
  for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
    const u = (i - 19.5) / 19, v = (j - 19.5) / 19, q = u * u + v * v;
    if (q > 1) continue;
    x.fillStyle = q > .88 ? '#4a1a3a' : q > .6 ? '#b03a6a' : q > .45 ? '#ffd0e0' : '#fff4f8';
    if (q <= .6 && ((i * 7 + j * 3) % 23 === 0)) x.fillStyle = '#ff6a8a';
    x.fillRect(i, j, 1, 1);
  }
  return c;
}
function headArt() {
  return spr([
    '.......aaaaaa.....',
    '.....aabbbbbbaa...',
    '...aabbccccccbba..',
    '..abbccddddddccba.',
    '.abccdd..dd..dccba',
    'abccdddeedddeedcba',
    'aaccddeefeeeefdcba',
    'ffccddeeeeeeeedcba',
    'aaccddeefeeeefdcba',
    'abccdddeedddeedcba',
    '.abccdd..dd..dccba',
    '..abbccddddddccba.',
    '...aabbccccccbba..',
    '.....aabbbbbbaa...',
    '.......aaaaaa.....',
  ], { a: '#0a3a3a', b: '#1a7a6a', c: '#3ab0a0', d: '#8affe0', e: '#ffffff', f: '#ff4a4a' });
}
