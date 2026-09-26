// worms.js: « taupes de guerre » — turn-based artillery between teams of helmeted moles on a crumbly island.
// Everyone builds the same island from the seed and plays the same shots on it, step by fixed step. The one whose
// turn it is (the host for the bots) streams the active mole, sends the shot, then a snapshot everyone lines up on.
import { W, H, WATER, rng, createMap } from './worms-map.js';
import { OUT, TEAM, txt, rrect, drawWeapon, drawMole, drawGrave, drawCrate, createBackdrop, drawWater } from './worms-draw.js';
import { createSfx } from './worms-sfx.js';

const STEP = 1 / 60, G = 520, WIND = 190, TURN = 30, COUNT = 3.2, READY = 1.3, WALK = 52;
const WEAPONS = [
  { id: 'bazooka', name: 'bazooka', ammo: -1, charge: true },
  { id: 'grenade', name: 'grenade', ammo: -1, charge: true },
  { id: 'grappe', name: 'bombe à grappe', ammo: 3, charge: true },
  { id: 'fusil', name: 'fusil', ammo: -1, shots: 2 },
  { id: 'dyna', name: 'dynamite', ammo: 2, retreat: 5 },
  { id: 'frappe', name: 'frappe aérienne', ammo: 1, target: true },
  { id: 'tp', name: 'téléporteur', ammo: 2, target: true, retreat: 0 },
];
const WI = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
const NAMES = ['grattouille', 'pioche', 'boulette', 'truffe', 'gadoue', 'radis', 'navet', 'caillou', 'lombric', 'biscotte', 'bouchon', 'cornichon',
  'taupinette', 'moustache', 'patate', 'bigorneau', 'crumble', 'praline', 'fripouille', 'pépite', 'gribouille', 'noisette', 'pistache', 'tonnerre'];
const MODES = [
  { id: 'duel', name: 'duel', sub: 'deux équipes de quatre taupes', help: 'le dernier camp debout gagne', teams: 2, moles: 4, sd: 16, max: 40 },
  { id: 'melee', name: 'mêlée', sub: 'quatre équipes de trois taupes', help: 'chacun pour soi, quatre camps', teams: 4, moles: 3, sd: 20, max: 48 },
];
const WORDS = ['boum !', 'paf !', 'vlan !', 'badaboum !', 'crac !', 'pouf !'];
const DIRS = Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6), Math.sin(k * Math.PI / 6)]);
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function createWorms() {
  const sfx = createSfx();
  let onEnd = () => {};
  let run = null, rect = null;
  const solid = (x, y) => run.map.solid(x, y);
  const isAuth = () => !!run.turn && (run.turn.owner === run.meId || (run.turn.owner === '@bot' && run.host));
  const botTurn = () => !!run.turn && (run.turn.owner === '@bot' || (run.auto && run.turn.owner === run.meId));
  const present = (tm) => tm.members.filter((id) => !run.gone.has(id));
  const teamGone = (tm) => !tm.botted && tm.members.length > 0 && !present(tm).length;
  function ownerOf(tm, j) {
    if (tm.botted || !tm.members.length) return '@bot';
    const p = present(tm);
    return p.length ? p[j % p.length] : null;
  }

  // ---------- the world ----------
  function normalAt(x, y) {
    let sx = 0, sy = 0;
    for (const [cx, cy] of DIRS) if (solid(x + cx * 5, y + cy * 5)) { sx -= cx; sy -= cy; }
    const l = Math.hypot(sx, sy);
    return l < 1e-6 ? [0, -1] : [sx / l, sy / l];
  }
  function hitMole(x, y) {
    const tr = run.turn;
    for (const m of run.moles) {
      if (m.dead || (tr && m.i === tr.mi)) continue;
      const dx = x - m.x, dy = y - m.y + 11;
      if (dx * dx + dy * dy < 169) return true;
    }
    return false;
  }
  const mk = (o) => ({ vx: 0, vy: 0, age: 0, fuse: 0, bounce: .45, wind: 0, impact: false, r: 40, dmg: 40, rest: false, hit: 0, ...o });
  function projFor(id, x, y, f, a, pw) {
    const dx = f * Math.cos(a), dy = -Math.sin(a), o = { x: x + dx * 16, y: y - 11 + dy * 16 };
    if (id === 'bazooka') return mk({ ...o, k: 'rocket', vx: dx * 950 * pw, vy: dy * 950 * pw, impact: true, wind: 1, r: 46, dmg: 50 });
    if (id === 'grenade') return mk({ ...o, k: 'nade', vx: dx * 760 * pw, vy: dy * 760 * pw, fuse: 180, bounce: .5, r: 46, dmg: 50 });
    return mk({ ...o, k: 'grappe', vx: dx * 760 * pw, vy: dy * 760 * pw, fuse: 180, bounce: .4, r: 34, dmg: 30, frags: 5 });
  }
  // one fixed step of a projectile: an event or null (the real thing and the bots' guesses share it)
  function advance(p, coarse = false) {
    p.age++;
    if (p.fuse > 0 && --p.fuse === 0) return 'fuse';
    if (p.rest) { if (solid(p.x, p.y + 3) || solid(p.x, p.y)) return null; p.rest = false; }
    if (p.wind) p.vx += run.wind * WIND * p.wind * STEP;
    p.vy += G * STEP;
    const sp = Math.hypot(p.vx, p.vy), n = Math.max(1, Math.ceil(sp * STEP / (coarse ? 6 : 2)));
    for (let i = 0; i < n; i++) {
      const nx = p.x + p.vx * STEP / n, ny = p.y + p.vy * STEP / n;
      if (ny > run.water) { p.x = nx; p.y = ny; return 'water'; }
      if (nx < -300 || nx > W + 300 || p.age > 1800) return 'out';
      if (solid(nx, ny)) {
        if (p.impact) { p.x = nx; p.y = ny; return 'hit'; }
        const [ux, uy] = normalAt(nx, ny), d = p.vx * ux + p.vy * uy;
        if (d < 0) { p.vx = (p.vx - (1 + p.bounce) * d * ux) * .84; p.vy = (p.vy - (1 + p.bounce) * d * uy) * .84; p.hit = -d; }
        if (Math.hypot(p.vx, p.vy) < 28) { p.vx = p.vy = 0; p.rest = true; }
        return null;
      }
      if (p.impact && hitMole(nx, ny)) { p.x = nx; p.y = ny; return 'hit'; }
      p.x = nx; p.y = ny;
    }
    return null;
  }

  function hurt(m, a) {
    const tr = run.turn, was = m.hp;
    m.hp = Math.max(0, m.hp - a); m.hurtT = 0;
    const got = was - m.hp;
    if (tr) {
      if (m.i === tr.mi) tr.hurt = true;
      if (m.team !== tr.team) { run.dmg[tr.team] += got; if (tr.owner === run.meId) run.myDmg += got; }
    }
    run.texts.push({ x: m.x, y: m.y - 42, s: '-' + a, c: TEAM[m.team].c, t: 0, big: a >= 30 });
    sfx.hurt();
  }
  function drown(m) {
    if (m.drown) return;
    if (!m.dead && m.hp > 0) { const a = m.hp; hurt(m, a); }
    m.drown = true; m.dead = true; m.hp = 0; m.air = false;
    splash(m.x, run.water, 1.4);
    if (run.turn && m.i === run.turn.mi) run.turn.hurt = true;
  }
  function kill(m) {
    m.dead = true; m.hp = 0;
    sfx.die();
    for (let k = 0; k < 14; k++) part('smoke', m.x, m.y - 10, (Math.random() - .5) * 90, -Math.random() * 90, .8 + Math.random() * .6, 8 + Math.random() * 8);
    run.texts.push({ x: m.x, y: m.y - 50, s: 'adieu ' + m.name, c: '#fff', t: 0, small: true });
  }

  function explode(x, y, r, dmg) {
    const rn = run, tr = rn.turn, auth = isAuth();
    rn.map.carve(x, y, r); rn.carves.push([x, y, r]);
    for (const m of rn.moles) {
      if (m.drown) continue;
      const dx = m.x - x, dy = m.y - 10 - y, d = Math.hypot(dx, dy), R = r + 24;
      if (d >= R) continue;
      const k = 1 - d / R;
      if (!m.dead) hurt(m, Math.max(1, Math.round(dmg * k)));
      if (tr && m.i === tr.mi && !auth) continue;   // the active mole goes where its player says
      const sp = Math.min(760, 90 + dmg * 9 * k);
      let ux = d > .5 ? dx / d : 0, uy = d > .5 ? dy / d : -1;
      uy -= .7; const l = Math.hypot(ux, uy); ux /= l; uy /= l;
      m.vx += ux * sp; m.vy += uy * sp; m.air = true; m.flyT = 0; m.stuck = 0;
    }
    rn.crates = rn.crates.filter((c) => { if (Math.hypot(c.x - x, c.y - 9 - y) < r + 12) { puff(c.x, c.y - 9, '#c8883e', 10); return false; } return true; });
    // the show
    const cam = rn.cam, near = clamp(1.3 - Math.hypot(x - cam.x, y - cam.y) / (rn.cw / rn.z), .1, 1);
    rn.shake = Math.min(22, rn.shake + r * .28 * near);
    sfx.boom(near * (r / 50));
    part('ring', x, y, 0, 0, .35, r * 1.5);
    part('flash', x, y, 0, 0, .12, r * 1.2);
    for (let k = 0; k < r * .35; k++) { const a = Math.random() * 6.28, s = Math.random() * r * 3; part('fire', x + Math.cos(a) * r * .3, y + Math.sin(a) * r * .3, Math.cos(a) * s * .4, Math.sin(a) * s * .4 - 30, .35 + Math.random() * .35, r * (.25 + Math.random() * .25)); }
    for (let k = 0; k < r * .3; k++) part('smoke', x + (Math.random() - .5) * r, y + (Math.random() - .5) * r, (Math.random() - .5) * 60, -30 - Math.random() * 60, 1 + Math.random(), r * (.2 + Math.random() * .3));
    for (let k = 0; k < r * .6; k++) { const a = -Math.random() * Math.PI, s = 150 + Math.random() * 380; part('dirt', x, y, Math.cos(a) * s, Math.sin(a) * s, .8 + Math.random() * .8, 2 + Math.random() * 4, ['#8a5a34', '#6e4428', '#4fb030', '#a07040'][k % 4]); }
    if (r > 30) rn.texts.push({ x, y: y - r * .6, s: WORDS[Math.floor(Math.random() * WORDS.length)], c: '#ffd21f', t: 0, word: true, rot: (Math.random() - .5) * .5 });
    if (rn.follow) { rn.camHold = .8; rn.holdX = x; rn.holdY = y; }
  }

  // ---------- the moles ----------
  function walk(m, dir) {
    m.walkAcc += WALK * STEP;
    while (m.walkAcc >= 1) {
      m.walkAcc -= 1;
      const nx = m.x + dir;
      let ny = null;
      if (solid(nx, m.y - 1)) { for (let up = 1; up <= 6; up++) if (!solid(nx, m.y - 1 - up)) { ny = m.y - up; break; } }
      else {
        for (let d = 0; d <= 6; d++) if (solid(nx, m.y + d)) { ny = m.y + d; break; }
        if (ny == null) { m.x = nx; m.air = true; m.vx = dir * 40; m.vy = 0; m.flyT = 0; return true; }
      }
      if (ny == null) { m.walkAcc = 0; return false; }
      for (let k = 3; k <= 20; k += 3) if (solid(nx, ny - k)) { m.walkAcc = 0; return false; }
      m.x = nx; m.y = ny; m.walk++;
      if (m.walk % 9 === 0) sfx.step();
    }
    return true;
  }
  function jump(m) { m.vx = m.face * 120; m.vy = -270; m.air = true; m.flyT = 0; m.stuck = 0; m.y -= 1; sfx.jump(); }
  function stand(m) {
    if (solid(m.x, m.y) || solid(m.x - 3, m.y) || solid(m.x + 3, m.y)) {
      for (let u = 0; u < 10 && solid(m.x, m.y - 1); u++) m.y--;
      return;
    }
    if (solid(m.x, m.y + 1)) { m.y += 1; return; }
    if (solid(m.x, m.y + 2)) { m.y += 2; return; }
    m.air = true; m.vx = 0; m.vy = 0; m.flyT = 0; m.stuck = 0;
  }
  function land(m, x, y, sp) {
    let yy = Math.floor(y);
    for (let k = 0; k < 8 && solid(x, yy - 1); k++) yy--;
    m.x = x; m.y = yy; m.air = false; m.vx = m.vy = 0; m.stuck = 0;
    if (sp > 470 && !m.dead) hurt(m, Math.min(30, Math.round((sp - 470) / 12)));
    if (sp > 220) puff(m.x, m.y, '#a07a50', 6);
  }
  function fly(m) {
    m.flyT += STEP;
    m.vy = Math.min(1100, m.vy + G * STEP);
    const sp = Math.hypot(m.vx, m.vy), n = Math.max(1, Math.ceil(sp * STEP / 1.5));
    for (let i = 0; i < n; i++) {
      const nx = m.x + m.vx * STEP / n, ny = m.y + m.vy * STEP / n;
      const feet = solid(nx, ny), mid = solid(nx, ny - 10), head = solid(nx, ny - 19);
      if (!feet && !mid && !head) { m.x = nx; m.y = ny; continue; }
      if (feet && !mid && m.vy >= 0) { land(m, nx, ny, sp); return; }
      const [ux, uy] = normalAt(nx, mid ? ny - 10 : head ? ny - 19 : ny), d = m.vx * ux + m.vy * uy;
      if (d < 0) { m.vx = (m.vx - 1.35 * d * ux) * .7; m.vy = (m.vy - 1.35 * d * uy) * .7; }
      if (++m.stuck > 40 || m.flyT > 12) { let y = Math.floor(m.y); for (let k = 0; k < 40 && (solid(m.x, y - 1) || solid(m.x, y - 10)); k++) y--; land(m, m.x, y, 0); return; }
      break;
    }
    if (m.y > run.water) drown(m);
  }

  // ---------- crates ----------
  function stepCrates() {
    const r = run;
    for (const c of r.crates) {
      if (c.fall) {
        c.y += 110 * STEP;
        if (solid(c.x, c.y)) { for (let k = 0; k < 20 && solid(c.x, c.y - 1); k++) c.y = Math.floor(c.y) - 1; c.fall = false; }
        if (c.y > r.water) c.gone = true;
      } else if (!solid(c.x, c.y + 1) && !solid(c.x - 6, c.y + 1) && !solid(c.x + 6, c.y + 1)) c.fall = true;
    }
    if (r.crates.some((c) => c.gone)) r.crates = r.crates.filter((c) => !c.gone);
    const tr = r.turn;
    if (!tr || !isAuth() || !(tr.phase === 'aim' || tr.phase === 'retreat')) return;
    const m = r.moles[tr.mi];
    const c = r.crates.find((c) => Math.abs(c.x - m.x) < 18 && Math.abs(c.y - m.y) < 22);
    if (c) { r.send({ t: 'pick', n: tr.n, id: c.id }); pick(c.id); }
  }
  function pick(id) {
    const r = run, c = r.crates.find((c) => c.id === id), tr = r.turn;
    if (!c || !tr) return;
    r.crates = r.crates.filter((o) => o !== c);
    const m = r.moles[tr.mi], tm = r.teams[tr.team];
    if (c.k === 'soin') { m.hp += 25; r.texts.push({ x: m.x, y: m.y - 42, s: '+25', c: '#6fe06a', t: 0, big: true }); }
    else { const i = WI[c.k]; if (tm.ammo[i] >= 0) tm.ammo[i]++; r.texts.push({ x: m.x, y: m.y - 46, s: WEAPONS[i].name + ' +1', c: '#ffd21f', t: 0, small: true }); }
    puff(c.x, c.y - 9, '#ffd21f', 10);
    sfx.pick();
  }

  // ---------- the shots ----------
  function fire(s) {
    const r = run, tr = r.turn, m = r.moles[tr.mi], w = WEAPONS[s.w], tm = r.teams[tr.team];
    m.x = s.x; m.y = s.y; m.face = s.f; m.aim = s.a; m.tx = s.x; m.ty = s.y; tr.w = s.w; tm.w = s.w;
    if (tm.ammo[s.w] > 0) tm.ammo[s.w]--;
    r.trng = rng(r.seed * 7 + tr.n * 131 + tr.shots * 17 + 1);
    tr.shots++; tr.charging = false; tr.power = 0;
    const dx = s.f * Math.cos(s.a), dy = -Math.sin(s.a);
    switch (w.id) {
      case 'bazooka': case 'grenade': case 'grappe':
        r.projs.push(projFor(w.id, s.x, s.y, s.f, s.a, s.pw));
        w.id === 'bazooka' ? sfx.launch() : sfx.throw();
        if (w.id === 'bazooka') for (let k = 0; k < 6; k++) part('smoke', s.x - dx * 14, s.y - 11 - dy * 14, -dx * 60 + (Math.random() - .5) * 40, -dy * 60 - 20, .6, 7);
        break;
      case 'fusil': {
        let x = s.x + dx * 12, y = s.y - 11 + dy * 12, hit = false;
        for (let k = 0; k < 450 && !hit; k++) {
          x += dx * 2; y += dy * 2;
          if (x < -50 || x > W + 50 || y < -200 || y > r.water) break;
          if (solid(x, y) || hitMole(x, y)) hit = true;
        }
        r.tracers.push({ x0: s.x + dx * 18, y0: s.y - 11 + dy * 18, x1: x, y1: y, t: 0 });
        if (hit) explode(x, y, 16, 24);
        sfx.shot(); r.shake = Math.min(22, r.shake + 3);
        break;
      }
      case 'dyna': r.projs.push(mk({ k: 'dyna', x: s.x + s.f * 8, y: s.y - 8, vx: s.f * 40, vy: -60, fuse: 300, bounce: .15, r: 76, dmg: 75 })); sfx.throw(); break;
      case 'frappe':
        for (let i = 0; i < 5; i++) r.projs.push(mk({ k: 'missile', x: s.tx - s.f * 200 + (i - 2) * 30, y: -60 - i * 16, vx: s.f * 180, vy: 300, impact: true, wind: .5, r: 30, dmg: 28 }));
        r.plane = { x: s.tx - s.f * 900, f: s.f, t: 0 }; sfx.plane();
        break;
      case 'tp':
        for (let k = 0; k < 16; k++) part('star', m.x, m.y - 10, (Math.random() - .5) * 200, (Math.random() - .5) * 200, .6, 3);
        m.x = s.tx; m.y = s.ty; m.air = true; m.vx = m.vy = 0; m.flyT = 0; m.tx = s.tx; m.ty = s.ty;
        for (let k = 0; k < 16; k++) part('star', m.x, m.y - 10, (Math.random() - .5) * 200, (Math.random() - .5) * 200, .6, 3);
        sfx.tele();
        break;
    }
    if (w.shots && tr.shots < w.shots) return;
    tr.rt = w.retreat ?? 3;
    tr.phase = tr.rt > 0 ? 'retreat' : 'settle';
  }
  const tpOk = (x, y) => {
    if (x < 20 || x > W - 20 || y < 30 || y > run.water - 30) return false;
    for (let k = 0; k <= 22; k += 2) if (solid(x, y - k) || solid(x - 5, y - k) || solid(x + 5, y - k)) return false;
    return true;
  };
  // the local player (or bot) pulls the trigger: play it here, tell the others
  function doFire(tx = 0, ty = 0) {
    const r = run, tr = r.turn, m = r.moles[tr.mi], w = WEAPONS[tr.w];
    if (r.teams[tr.team].ammo[tr.w] === 0) return;
    if (w.id === 'tp' && !tpOk(tx, ty)) { sfx.select(); r.texts.push({ x: tx, y: ty - 20, s: 'pas ici !', c: '#fff', t: 0, small: true }); return; }
    const s = { n: tr.n, x: r2(m.x), y: r2(m.y), f: m.face, a: r2(m.aim), w: tr.w, pw: w.charge ? r2(Math.max(.05, tr.power)) : 1, tx: Math.round(tx), ty: Math.round(ty) };
    r.send({ t: 'shot', ...s });
    fire(s);
  }

  // ---------- the turn ----------
  function beginTurn(nx) {
    const r = run, tm = r.teams[nx.team];
    tm.last = nx.mole;
    const mi = tm.moles[nx.mole], m = r.moles[mi];
    r.wind = nx.wind;
    r.carves = [];
    r.turn = { n: nx.n, team: nx.team, mi, owner: nx.owner, phase: 'ready', t: TURN, rt: 0, ph: READY, shots: 0, w: tm.w, power: 0, charging: false, hurt: false, calm: 0,
      cx: m.x + m.face * 220, cy: m.y - 140, sendT: 0, bot: null, tick: 99 };
    if (nx.crate) r.crates.push({ id: r.crateId++, x: nx.crate.x, y: -40, k: nx.crate.k, fall: true });
    m.tx = m.x; m.ty = m.y;
    const mine = nx.owner === r.meId;
    r.banner = { s: mine ? 'à toi !' : tm.label, sub: mine ? m.name : 'joue ' + m.name, c: TEAM[tm.i].c, t: 0 };
    if (nx.n === r.mode.sd) { r.banner2 = { s: 'mort subite !', sub: 'l\'eau monte à chaque tour', t: 0 }; sfx.sudden(); }
    sfx.turn(mine);
    r.cam.free = false; r.camHold = 0;
  }
  function settle() {
    const tr = run.turn;
    if (tr.phase === 'settle') return;
    tr.phase = 'settle'; tr.charging = false; tr.calm = 0;
  }
  function pickNext() {
    const r = run, tr = r.turn, T = r.teams.length;
    for (let k = 1; k <= T; k++) {
      const tm = r.teams[(tr.team + k) % T];
      if (teamGone(tm)) continue;
      for (let j = 1; j <= tm.moles.length; j++) {
        const mj = (tm.last + j) % tm.moles.length;
        if (!r.moles[tm.moles[mj]].dead) return { team: tm.i, mole: mj, owner: ownerOf(tm, mj) };
      }
    }
    return null;
  }
  const teamHp = (tm) => tm.moles.reduce((s, i) => s + (run.moles[i].dead ? 0 : run.moles[i].hp), 0);
  function ranking() {
    const r = run, alive = (t) => !teamGone(t) && teamHp(t) > 0;
    const rank = r.teams.map((t) => t.i).sort((a, b) => (alive(r.teams[b]) - alive(r.teams[a])) || (teamHp(r.teams[b]) - teamHp(r.teams[a])) || (r.dmg[b] - r.dmg[a]) || a - b);
    const al = r.teams.filter(alive);
    let win = al.length === 1 ? al[0].i : -1;
    if (al.length > 1 && teamHp(r.teams[rank[0]]) > teamHp(r.teams[rank[1]])) win = rank[0];
    return { rank, win };
  }
  function snapshot() {
    const r = run;
    return {
      m: r.moles.map((m) => [r2(m.x), r2(m.y), m.hp, m.drown ? 2 : m.dead ? 1 : 0]),
      w: r.water, d: r.dmg.slice(), a: r.teams.map((t) => t.ammo.slice()), l: r.teams.map((t) => t.last), tw: r.teams.map((t) => t.w),
      c: r.crates.map((c) => [c.id, r2(c.x), r2(c.y), c.k]), ci: r.crateId, cv: r.carves, h: r.map.hash(),
    };
  }
  function endTurn() {
    const r = run, tr = r.turn;
    for (const m of r.moles) if (!m.dead && m.hp <= 0) kill(m);
    const n = tr.n + 1;
    if (n > r.mode.sd) { r.water -= 16; for (const m of r.moles) if (!m.drown && m.y > r.water) drown(m); }
    for (const m of r.moles) if (!m.dead && m.hp <= 0) kill(m);
    const alive = r.teams.filter((t) => !teamGone(t) && teamHp(t) > 0);
    let nx = alive.length > 1 && n < r.mode.max ? pickNext() : null;
    const over = nx ? null : ranking();
    if (nx) {
      const crate = n > 1 && Math.random() < .32 ? { x: Math.round(200 + Math.random() * (W - 400)), k: Math.random() < .45 ? 'soin' : WEAPONS[2 + Math.floor(Math.random() * 5)].id } : null;
      nx = { n, ...nx, wind: Math.round((Math.random() * 2 - 1) * 10) / 10, crate };
    }
    const msg = { t: 'end', n: tr.n, s: snapshot(), nx, over };
    r.send(msg);
    applyEnd(msg, true);
  }
  function applySnap(s) {
    const r = run;
    s.m.forEach(([x, y, hp, st], i) => {
      const m = r.moles[i];
      if (st && !m.dead) st === 2 ? splash(x, r.water, 1) : kill(m);
      Object.assign(m, { x, y, hp, dead: !!st, drown: st === 2, air: false, vx: 0, vy: 0, tx: x, ty: y });
    });
    r.water = s.w; r.dmg = s.d.slice(); r.crateId = s.ci;
    r.teams.forEach((t, k) => { t.ammo = s.a[k].slice(); t.last = s.l[k]; t.w = s.tw[k]; });
    r.crates = s.c.map(([id, x, y, k]) => ({ id, x, y, k, fall: false }));
  }
  function applyEnd(msg, own) {
    const r = run;
    r.projs = [];
    r.log.push(...msg.s.cv);
    if (!own && r.map.hash() !== msg.s.h) { r.map.rebuild(r.log); r.resync++; }
    applySnap(msg.s);
    if (msg.over) gameOver(msg.over);
    else beginTurn(msg.nx);
  }
  function gameOver(o) {
    const r = run;
    r.phase = 'over'; r.overT = 0; r.result = o;
    if (r.turn) r.turn.phase = 'over';
    (o.win === r.myTeam ? sfx.win : sfx.lose)();
  }
  function finish() {
    const r = run;
    r.ended = true;
    const o = r.result, of = r.teams.length, place = Math.max(1, o.rank.indexOf(r.myTeam) + 1);
    const text = (o.win === r.myTeam ? 'victoire !' : o.win < 0 && place === 1 ? 'égalité !' : `${place}e sur ${of}`) + ` · ${r.myDmg} dégâts infligés`;
    onEnd({ place: o.win === r.myTeam ? 1 : Math.max(place, o.win < 0 ? 1 : 2), of, value: r.myDmg, time: r.simT, text });
  }

  // ---------- one fixed step of everything ----------
  function control(m, inp) {
    const r = run, tr = r.turn, w = WEAPONS[tr.w], aim = tr.phase === 'aim';
    if (aim && inp.pick != null && !tr.charging && !(tr.shots && WEAPONS[tr.w].shots)) {
      const tm = r.teams[tr.team], n = WEAPONS.length;
      let i = inp.pick === 'next' || inp.pick === 'prev' ? tr.w : inp.pick;
      if (inp.pick === 'next' || inp.pick === 'prev') { const d = inp.pick === 'next' ? 1 : -1; do i = (i + d + n) % n; while (tm.ammo[i] === 0 && i !== tr.w); }
      if (tm.ammo[i] !== 0 && i !== tr.w) { tr.w = i; tm.w = i; sfx.select(); if (WEAPONS[i].target) { tr.cx = m.x + m.face * 220; tr.cy = m.y - 140; } }
    }
    if (aim && WEAPONS[tr.w].target) {
      if (inp.mouse) { tr.cx = inp.mouse.x; tr.cy = inp.mouse.y; }
      tr.cx = clamp(tr.cx + inp.dx * 520 * STEP, 0, W); tr.cy = clamp(tr.cy + inp.dy * 520 * STEP, -100, r.water);
      if (inp.click) doFire(inp.click.x, inp.click.y);
      else if (inp.firePress) doFire(tr.cx, tr.cy);
      return;
    }
    if (!m.air && inp.dx && !tr.charging) { m.face = inp.dx; walk(m, inp.dx); }
    if (inp.jump && !m.air && !tr.charging) jump(m);
    if (!aim) return;
    if (inp.dy) m.aim = clamp(m.aim - inp.dy * 1.25 * STEP, -1.5, 1.5);
    if (w.charge) {
      if (inp.fire && !m.air && (tr.charging || inp.firePress || tr.armed)) {
        if (!tr.charging) { tr.charging = true; tr.power = 0; }
        tr.power = Math.min(1, tr.power + STEP / 1.5);
        if (Math.floor(tr.power * 16) !== Math.floor((tr.power - STEP / 1.5) * 16)) sfx.charge(tr.power);
        if (tr.power >= 1) doFire();
      } else if (tr.charging) doFire();
      tr.armed = !inp.fire;   // a space held since before the turn doesn't count
    } else if (inp.firePress && !m.air) doFire();
  }
  function step(inp) {
    const r = run, tr = r.turn;
    r.simT += STEP;
    if (tr && tr.phase !== 'over') {
      const m = r.moles[tr.mi], auth = isAuth();
      if (tr.phase === 'ready') { tr.ph -= STEP; if (tr.ph <= 0) tr.phase = 'aim'; }
      else if (tr.phase === 'aim') {
        tr.t -= STEP;
        if (tr.t <= 0) settle();
        else if (auth && tr.t < 5.5 && Math.ceil(tr.t) !== tr.tick && !botTurn()) { tr.tick = Math.ceil(tr.t); sfx.tick(true); }
      } else if (tr.phase === 'retreat') { tr.rt -= STEP; if (tr.rt <= 0) settle(); }
      if (auth && (tr.phase === 'aim' || tr.phase === 'retreat')) {
        if (m.dead || tr.hurt) settle();
        else if (botTurn()) botStep(m);
        else control(m, inp);
      }
    }
    for (const m of r.moles) {
      if (m.drown) continue;
      if (tr && m.i === tr.mi && !isAuth() && tr.phase !== 'over') {
        m.x += (m.tx - m.x) * .3; m.y += (m.ty - m.y) * .3;
        if (Math.abs(m.tx - m.x) > 90 || Math.abs(m.ty - m.y) > 90) { m.x = m.tx; m.y = m.ty; }
        continue;
      }
      if (m.air) fly(m); else stand(m);
    }
    const ps = r.projs;
    r.follow = true;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dead) continue;
      const ev = advance(p);
      if (p.hit > 70) { sfx.bounce(Math.min(1, p.hit / 400)); p.hit = 0; }
      if (ev === 'hit' || ev === 'fuse') {
        p.dead = true;
        explode(p.x, p.y, p.r, p.dmg);
        if (p.frags) for (let k = 0; k < p.frags; k++) ps.push(mk({ k: 'frag', x: p.x, y: p.y - 4, vx: (r.trng() - .5) * 380, vy: -220 - r.trng() * 260, impact: true, r: 26, dmg: 22 }));
      } else if (ev === 'water') { p.dead = true; splash(p.x, r.water, .7); }
      else if (ev === 'out') p.dead = true;
      else if ((p.k === 'rocket' || p.k === 'missile') && p.age % 2 === 0) part('smoke', p.x, p.y, (Math.random() - .5) * 20, (Math.random() - .5) * 20, .5, 4 + Math.random() * 3);
      else if (p.k === 'dyna' && p.age % 3 === 0) { part('spark', p.x + 1, p.y - 16, (Math.random() - .5) * 120, -Math.random() * 120, .3, 2); sfx.fuse(); }
    }
    r.follow = false;
    if (ps.some((p) => p.dead)) r.projs = ps.filter((p) => !p.dead);
    stepCrates();
    if (tr && tr.phase === 'settle' && isAuth()) {
      const calm = !r.projs.length && r.moles.every((m) => m.drown || !m.air);
      tr.calm = calm ? tr.calm + STEP : 0;
      if (tr.calm > .8) endTurn();
    }
  }

  // ---------- the bots ----------
  function plan(m) {
    const r = run, tm = r.teams[m.team], foes = r.moles.filter((o) => !o.dead && o.team !== m.team);
    const score = (x, y, rad, dmg, noSelf) => {
      let s = 0;
      for (const o of r.moles) {
        if (o.dead || (noSelf && o === m)) continue;
        const d = Math.hypot(o.x - x, o.y - 10 - y), R = rad + 24;
        if (d >= R) continue;
        const v = Math.min(o.hp, dmg * (1 - d / R));
        s += o.team === m.team ? -(o === m ? 2.2 : 1.4) * v : v + (v >= o.hp ? 30 : 0);
      }
      return s;
    };
    let best = { s: -1e9 };
    const tries = ['bazooka', 'grenade', ...(tm.ammo[WI.grappe] ? ['grappe'] : [])];
    for (const id of tries) for (const f of [-1, 1]) {
      if (!foes.some((o) => (o.x - m.x) * f > -30)) continue;
      for (let a = -.45; a <= 1.45; a += .085) for (let pw = .3; pw <= 1.001; pw += .075) {
        const p = projFor(id, m.x, m.y, f, a, pw);
        let ev = null;
        for (let k = 0; k < 420 && !ev; k++) ev = advance(p, true);
        if (ev !== 'hit' && ev !== 'fuse') continue;
        const s = score(p.x, p.y, p.r, p.dmg) * (id === 'grappe' ? 1.4 : 1) - pw * 2 - (id === 'grenade' ? 2 : 0) - (id === 'grappe' ? 4 : 0);
        if (s > best.s) best = { s, w: WI[id], a, f, pw };
      }
    }
    for (const o of foes) {
      const dx = o.x - m.x, dy = o.y - 10 - (m.y - 11), d = Math.hypot(dx, dy);
      if (d < 650 && d > 20) {
        let clear = true;
        for (let k = 16; k < d - 10 && clear; k += 4) if (solid(m.x + dx * k / d, m.y - 11 + dy * k / d)) clear = false;
        const a = Math.atan2(-dy, Math.abs(dx));
        if (clear && Math.abs(a) < 1.45) { const s = Math.min(o.hp, 40) * 1.3 + (o.hp <= 40 ? 30 : 0); if (s > best.s) best = { s, w: WI.fusil, a, f: Math.sign(dx) || 1, pw: 1 }; }
      }
      if (tm.ammo[WI.dyna] && Math.abs(dx) < 40 && Math.abs(o.y - m.y) < 30) {
        const s = score(m.x + Math.sign(dx) * 8, m.y - 6, 76, 75, true) * .9;
        if (s > best.s) best = { s, w: WI.dyna, a: 0, f: Math.sign(dx) || 1, pw: 1 };
      }
      if (tm.ammo[WI.frappe]) {
        let sky = true;
        for (let y = o.y - 26; y > 0 && sky; y -= 6) if (solid(o.x, y)) sky = false;
        const s = sky ? score(o.x, o.y - 8, 32, 30) * 2.2 : -1;
        if (s > best.s) best = { s, w: WI.frappe, a: m.aim, f: m.face, pw: 1, tx: o.x, ty: o.y - 30 };
      }
    }
    if (best.s < 8) {
      const o = foes.sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
      best.walk = o ? Math.sign(o.x - m.x) || 1 : 0;
    }
    // aim like a mole: close, not perfect
    const sloppy = Math.random() < .22 ? 2.6 : 1;
    if (WEAPONS[best.w]?.charge) { best.a += (Math.random() - .5) * .07 * sloppy; best.pw = clamp(best.pw * (1 + (Math.random() - .5) * .07 * sloppy), .1, 1); }
    else if (best.w === WI.fusil) best.a += (Math.random() - .5) * .05 * sloppy;
    if (best.tx != null) best.tx += (Math.random() - .5) * 50 * sloppy;
    return best;
  }
  function botStep(m) {
    const r = run, tr = r.turn, b = tr.bot || (tr.bot = { t: 0, plan: null, tries: 0, walkT: 0, last: 0 });
    b.t += STEP;
    if (tr.phase === 'retreat') { if (b.flee && !m.air) { m.face = b.flee; if (!walk(m, b.flee) && b.t % 1 < STEP) jump(m); } return; }
    if (b.walkT > 0) {
      b.walkT -= STEP;
      if (!m.air) { m.face = b.walkDir; if (!walk(m, b.walkDir)) { jump(m); b.walkT -= .3; } }
      if (b.walkT <= 0) b.t = .3;
      return;
    }
    if (!b.plan) {
      if (b.t < 1 || m.air) return;
      const p = plan(m);
      if (p.walk && b.tries < 2 && tr.t > 8) { b.tries++; b.walkT = 1.8; b.walkDir = p.walk; return; }
      if (p.s <= 0 || p.w == null) { settle(); return; }
      b.plan = p;
      b.flee = p.w === WI.dyna || (WEAPONS[p.w].charge && p.s < 20) ? -p.f : 0;
    }
    const p = b.plan, w = WEAPONS[p.w];
    if (tr.w !== p.w) { tr.w = p.w; r.teams[tr.team].w = p.w; sfx.select(); b.t = 0; tr.cx = m.x + m.face * 220; tr.cy = m.y - 140; return; }
    if (b.t < .5) return;
    if (w.target) {
      const dx = p.tx - tr.cx, dy = p.ty - tr.cy, d = Math.hypot(dx, dy);
      if (d > 8) { const s = Math.min(d, 700 * STEP); tr.cx += dx / d * s; tr.cy += dy / d * s; return; }
      doFire(p.tx, p.ty); return;
    }
    m.face = p.f;
    const da = p.a - m.aim;
    if (Math.abs(da) > .01) { m.aim += Math.sign(da) * Math.min(Math.abs(da), 1.25 * STEP); return; }
    if (!w.charge) { if (b.t - b.last > .8) { b.last = b.t; doFire(); } return; }
    tr.charging = true; tr.power = Math.min(1, tr.power + STEP / 1.5);
    if (tr.power >= p.pw) { tr.power = p.pw; doFire(); }
  }

  // ---------- particles & bits ----------
  function part(k, x, y, vx, vy, life, size, color) {
    const ps = run.parts;
    if (ps.length > 700) ps.shift();
    ps.push({ k, x, y, vx, vy, life, max: life, size, color });
  }
  function puff(x, y, color, n) { for (let k = 0; k < n; k++) part('dirt', x, y, (Math.random() - .5) * 200, -Math.random() * 200, .5 + Math.random() * .4, 2 + Math.random() * 3, color); }
  function splash(x, y, s) {
    sfx.splash();
    for (let k = 0; k < 22 * s; k++) part('drop', x + (Math.random() - .5) * 20, y, (Math.random() - .5) * 220 * s, -120 - Math.random() * 320 * s, .9 + Math.random() * .5, 2 + Math.random() * 3);
  }
  function stepParts(dt) {
    const r = run;
    for (const p of r.parts) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'dirt' || p.k === 'drop' || p.k === 'spark') p.vy += 700 * dt;
      else if (p.k === 'smoke') { p.vx += r.wind * 40 * dt; p.vy -= 10 * dt; p.vx *= .98; }
      else if (p.k === 'fire') { p.vx *= .9; p.vy *= .9; }
      else if (p.k === 'star') { p.vx *= .92; p.vy *= .92; }
    }
    r.parts = r.parts.filter((p) => p.life > 0);
    for (const t of r.texts) t.t += dt;
    r.texts = r.texts.filter((t) => t.t < (t.word ? .9 : 1.6));
    for (const t of r.tracers) t.t += dt;
    r.tracers = r.tracers.filter((t) => t.t < .25);
    if (r.plane) { r.plane.t += dt; r.plane.x += r.plane.f * 800 * dt; if (r.plane.t > 3) r.plane = null; }
    r.shake *= Math.pow(.02, dt);
    if (r.banner) r.banner.t += dt;
    if (r.banner2) { r.banner2.t += dt; if (r.banner2.t > 3) r.banner2 = null; }
  }

  // ---------- the camera ----------
  function camera(dt) {
    const r = run, c = r.cam, tr = r.turn, hw = r.cw / 2 / r.z, hh = r.ch / 2 / r.z;
    let tx = c.x, ty = c.y;
    const fly = r.projs.find((p) => !p.rest && p.k !== 'dyna') || r.projs.find((p) => !p.rest);
    if (fly || r.camHold > 0) c.free = false;
    if (r.camHold > 0) { r.camHold -= dt; tx = r.holdX; ty = r.holdY; }
    else if (fly) { tx = fly.x; ty = fly.y; }
    else if (tr && tr.phase === 'settle' && r.projs.length) { tx = r.projs[0].x; ty = r.projs[0].y - 40; }
    else if (tr && tr.phase === 'aim' && WEAPONS[tr.w].target) { tx = tr.cx; ty = tr.cy; }
    else { const m = tr ? r.moles[tr.mi] : r.moles[r.firstMi]; tx = m.x; ty = m.y - 50; }
    if (!c.free) {
      const k = Math.min(1, dt * (fly ? 6 : 3.2));
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    }
    c.x = W + 300 < hw * 2 ? W / 2 : clamp(c.x, hw - 150, W + 150 - hw);
    c.y = clamp(c.y, hh - 260, Math.max(hh - 260, WATER + 110 - hh));
  }

  // ---------- drawing ----------
  function place(cv) {
    if (!cv) return;
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100%', height: '100%' });
  }
  function fit() {
    const r = run, dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.max(40, Math.round(rect?.w ?? innerWidth)), ch = Math.max(30, Math.round(rect?.h ?? innerHeight));
    if (r.cw !== cw || r.ch !== ch || r.dpr !== dpr) {
      r.cw = cw; r.ch = ch; r.dpr = dpr;
      r.cv.width = Math.round(cw * dpr); r.cv.height = Math.round(ch * dpr);
    }
    r.z = clamp(Math.min(ch / 640, cw / 900), .3, 3);
  }
  function drawProj(g, p, t) {
    g.save(); g.translate(p.x, p.y);
    if (p.k === 'rocket' || p.k === 'missile') {
      g.rotate(Math.atan2(p.vy, p.vx));
      g.fillStyle = (t * 30 | 0) % 2 ? '#ffd21f' : '#ff7a1a'; g.beginPath(); g.moveTo(-9, -3); g.lineTo(-18 - Math.random() * 6, 0); g.lineTo(-9, 3); g.fill();
      g.lineWidth = 1.6; g.strokeStyle = OUT; g.fillStyle = p.k === 'rocket' ? '#6f8a3a' : '#5a5f6a';
      rrect(g, -10, -3.5, 18, 7, 3.5); g.fill(); g.stroke();
      g.fillStyle = '#ff3d5e'; g.beginPath(); g.moveTo(6, -3.5); g.quadraticCurveTo(13, 0, 6, 3.5); g.fill(); g.stroke();
      g.fillStyle = '#4c6326'; g.beginPath(); g.moveTo(-10, -3); g.lineTo(-14, -7); g.lineTo(-7, -3); g.moveTo(-10, 3); g.lineTo(-14, 7); g.lineTo(-7, 3); g.fill();
    } else if (p.k === 'frag') {
      g.fillStyle = '#3a2a2a'; g.strokeStyle = OUT; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 3.4, 0, 7); g.fill(); g.stroke();
    } else {
      g.rotate(p.k === 'dyna' ? 0 : p.age * .14 * Math.sign(p.vx || 1));
      g.translate(p.k === 'dyna' ? -1 : -3, 0);
      drawWeapon(g, p.k === 'nade' ? 'grenade' : p.k, t);
    }
    g.restore();
  }
  function label(g, s, x, y, size, fill) { txt(g, s, x, y, size, fill); }
  function render() {
    const r = run, g = r.g, { cw, ch, dpr, z } = r, t = r.t, tr = r.turn;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true;
    r.bg(g, cw, ch, r.cam, z, t, r.wind, r.fdt || 0);
    const sh = r.shake, shx = (Math.random() - .5) * sh, shy = (Math.random() - .5) * sh;
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - r.cam.x * z + shx), dpr * (ch / 2 - r.cam.y * z + shy));
    const vx0 = r.cam.x - cw / 2 / z - 30, vy0 = r.cam.y - ch / 2 / z - 30, vx1 = vx0 + cw / z + 60, vy1 = vy0 + ch / z + 60;
    const L = 13 * clamp(ch / 620, .75, 1.3) / z;   // labels keep their size on the page
    drawWater(g, vx0, vx1, r.water, vy1, t, true);
    const sx0 = Math.max(0, Math.floor(vx0)), sy0 = Math.max(0, Math.floor(vy0)), sx1 = Math.min(W, Math.ceil(vx1)), sy1 = Math.min(H, Math.ceil(vy1));
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(r.map.back, sx0 / 2, sy0 / 2, (sx1 - sx0) / 2, (sy1 - sy0) / 2, sx0, sy0, sx1 - sx0, sy1 - sy0);
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(r.map.cv, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
    // the plane of an air strike
    if (r.plane) {
      const p = r.plane; g.save(); g.translate(p.x, -20); g.scale(p.f, 1);
      g.fillStyle = '#5a6a3a'; g.strokeStyle = OUT; g.lineWidth = 2;
      rrect(g, -40, -8, 80, 16, 8); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-8, 0); g.lineTo(-22, 26); g.lineTo(4, 26); g.lineTo(10, 0); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-38, -4); g.lineTo(-48, -20); g.lineTo(-30, -6); g.fill(); g.stroke();
      g.fillStyle = '#9ad8ff'; g.fillRect(18, -6, 12, 6);
      g.restore();
    }
    for (const c of r.crates) drawCrate(g, c, t);
    // the moles
    const act = tr ? r.moles[tr.mi] : null, aimPh = tr && tr.phase === 'aim';
    for (const m of r.moles) {
      if (m.drown) continue;
      if (m.dead) { drawGrave(g, m.x, m.y, TEAM[m.team]); continue; }
      m.hold = m === act && aimPh ? WEAPONS[tr.w].id : null;
      drawMole(g, m, TEAM[m.team], t);
    }
    for (const p of r.projs) drawProj(g, p, t);
    for (const s of r.tracers) { g.strokeStyle = `rgba(255,240,180,${1 - s.t * 4})`; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke(); }
    // aim and power
    if (act && aimPh && !act.air && !WEAPONS[tr.w].target && WEAPONS[tr.w].id !== 'dyna') {
      const dx = act.face * Math.cos(act.aim), dy = -Math.sin(act.aim), cx = act.x + dx * 52, cy = act.y - 11 + dy * 52;
      if (tr.charging) for (let k = 0; k < 14; k++) {
        if (k / 14 > tr.power) break;
        const d = 16 + k * 4.4, s = 2 + k * .45;
        g.fillStyle = `hsl(${50 - k * 4},100%,${55 - k}%)`; g.beginPath(); g.arc(act.x + dx * d, act.y - 11 + dy * d, s, 0, 7); g.fill();
      }
      g.strokeStyle = OUT; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.stroke();
      g.strokeStyle = '#ff3d5e'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.moveTo(cx - 10, cy); g.lineTo(cx - 3, cy); g.moveTo(cx + 3, cy); g.lineTo(cx + 10, cy); g.moveTo(cx, cy - 10); g.lineTo(cx, cy - 3); g.moveTo(cx, cy + 3); g.lineTo(cx, cy + 10); g.stroke();
    }
    if (act && aimPh && WEAPONS[tr.w].target) {
      const x = tr.cx, y = tr.cy, ok = WEAPONS[tr.w].id !== 'tp' || tpOk(x, y);
      g.save(); g.translate(x, y); g.rotate(t * 1.5);
      g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke();
      g.strokeStyle = ok ? '#ffd21f' : '#ff3d5e'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke(); g.setLineDash([]);
      g.restore();
      g.fillStyle = ok ? '#ffd21f' : '#ff3d5e'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      if (WEAPONS[tr.w].id === 'frappe') for (let k = -2; k <= 2; k++) { const ax = x + k * 30, ay = y - 60 + ((t * 60 + k * 9) % 30); g.fillStyle = 'rgba(255,61,94,.7)'; g.beginPath(); g.moveTo(ax - 5, ay - 8); g.lineTo(ax + 5, ay - 8); g.lineTo(ax, ay); g.fill(); }
    }
    // particles
    for (const p of r.parts) {
      const k = p.life / p.max;
      if (p.k === 'dirt' || p.k === 'spark') { g.fillStyle = p.k === 'spark' ? '#ffd21f' : p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      else if (p.k === 'drop') { g.fillStyle = `rgba(180,225,255,${Math.min(1, k * 2)})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); }
      else if (p.k === 'smoke') { g.fillStyle = `rgba(90,80,80,${k * .45})`; g.beginPath(); g.arc(p.x, p.y, p.size * (1.8 - k), 0, 7); g.fill(); }
      else if (p.k === 'fire') { g.fillStyle = k > .6 ? `rgba(255,240,160,${k})` : `rgba(255,${Math.round(120 + k * 150)},40,${k})`; g.beginPath(); g.arc(p.x, p.y, p.size * (.6 + k * .6), 0, 7); g.fill(); }
      else if (p.k === 'ring') { g.strokeStyle = `rgba(255,255,230,${k})`; g.lineWidth = 5 * k + 1; g.beginPath(); g.arc(p.x, p.y, p.size * (1 - k * k), 0, 7); g.stroke(); }
      else if (p.k === 'flash') { g.fillStyle = `rgba(255,255,220,${k})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); }
      else if (p.k === 'star') { g.fillStyle = `rgba(230,200,255,${k})`; g.save(); g.translate(p.x, p.y); g.rotate(k * 6); g.fillRect(-p.size, -1, p.size * 2, 2); g.fillRect(-1, -p.size, 2, p.size * 2); g.restore(); }
    }
    drawWater(g, vx0, vx1, r.water, vy1 + 20, t, false);
    // names & health, the arrow over the one who plays
    for (const m of r.moles) {
      if (m.dead) continue;
      const c = TEAM[m.team], y = m.y - 34;
      label(g, m.name, m.x, y - L * 1.15, L * .8, c.c);
      const w = L * (.62 * String(m.hp).length + .8);
      g.fillStyle = OUT; rrect(g, m.x - w / 2, y - L * .6, w, L * 1.2, L * .35); g.fill();
      g.fillStyle = c.c; rrect(g, m.x - w / 2 + 1.5 / z, y - L * .6 + 1.5 / z, w - 3 / z, L * 1.2 - 3 / z, L * .3); g.fill();
      label(g, String(m.hp), m.x, y, L * .85, '#fff');
    }
    if (act && !act.dead && tr && (tr.phase === 'ready' || (tr.phase === 'aim' && tr.t > TURN - 4))) {
      const y = act.y - 34 - L * 2.4 - Math.abs(Math.sin(t * 5)) * 8;
      g.fillStyle = TEAM[act.team].c; g.strokeStyle = OUT; g.lineWidth = 2.5 / z * 1.2;
      g.beginPath(); g.moveTo(act.x - L * .6, y - L * .8); g.lineTo(act.x + L * .6, y - L * .8); g.lineTo(act.x, y); g.closePath(); g.fill(); g.stroke();
    }
    for (const s of r.texts) {
      const k = s.t / (s.word ? .9 : 1.6), pop = Math.min(1, s.t * 8);
      g.globalAlpha = k > .7 ? (1 - k) / .3 : 1;
      txt(g, s.s, s.x, s.y - s.t * (s.word ? 10 : 30), L * (s.word ? 2 : s.big ? 1.6 : s.small ? .9 : 1.25) * (s.word ? .6 + pop * .5 : pop), s.c, 'center', s.rot || 0);
      g.globalAlpha = 1;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud(g);
  }
  function hud(g) {
    const r = run, { cw, ch } = r, tr = r.turn, s = clamp(Math.min(cw / 1000, ch / 620), .42, 1.5), pad = 12 * s;
    // the teams, health bars
    const bw = 150 * s, bh = 13 * s;
    r.teams.forEach((tm, k) => {
      const y = pad + k * (bh + 6 * s), hp = teamHp(tm), full = tm.moles.length * 100;
      const x = pad + 78 * s;
      txt(g, tm.label.length > 11 ? tm.label.slice(0, 10) + '…' : tm.label, x - 6 * s, y + bh / 2, 12 * s, teamGone(tm) ? '#999' : TEAM[k].c, 'right');
      g.fillStyle = 'rgba(26,19,13,.55)'; rrect(g, x, y, bw, bh, bh / 2); g.fill();
      if (hp > 0) { g.fillStyle = TEAM[k].c; rrect(g, x, y, Math.max(bh, bw * Math.min(1, hp / full)), bh, bh / 2); g.fill(); }
      g.strokeStyle = OUT; g.lineWidth = 2; rrect(g, x, y, bw, bh, bh / 2); g.stroke();
      if (tr && tr.team === k && r.phase === 'play') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + bw + 6 * s, y + bh / 2); g.lineTo(x + bw + 14 * s, y + 2 * s); g.lineTo(x + bw + 14 * s, y + bh - 2 * s); g.fill(); }
    });
    // wind
    {
      const w = 150 * s, h = 34 * s, x = cw - pad - w, y = ch - pad - h;
      g.fillStyle = 'rgba(26,19,13,.6)'; rrect(g, x, y, w, h, 10 * s); g.fill();
      txt(g, 'vent', x + w / 2, y + 9 * s, 10 * s, '#cfe8ff');
      const cx = x + w / 2, by = y + 22 * s, len = r.wind * (w / 2 - 10 * s);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 10 * s, by - 4 * s, w - 20 * s, 8 * s);
      if (Math.abs(len) > 1) {
        g.fillStyle = r.wind > 0 ? '#39c8ff' : '#ff7a9a';
        g.fillRect(Math.min(cx, cx + len), by - 4 * s, Math.abs(len), 8 * s);
        const d = Math.sign(len), n = Math.ceil(Math.abs(r.wind) * 3);
        g.fillStyle = '#fff';
        for (let i = 0; i < n; i++) { const ax = cx + d * (6 * s + i * 13 * s) + d * ((r.t * 30 * s) % (13 * s)); if (Math.abs(ax - cx) > Math.abs(len)) continue; g.beginPath(); g.moveTo(ax + d * 5 * s, by); g.lineTo(ax - d * 2 * s, by - 5 * s); g.lineTo(ax - d * 2 * s, by + 5 * s); g.fill(); }
      }
      g.fillStyle = '#fff'; g.fillRect(cx - 1, by - 7 * s, 2, 14 * s);
    }
    // the clock
    if (tr && r.phase === 'play') {
      const R = 26 * s, x = pad + R, y = ch - pad - R, col = TEAM[tr.team];
      const v = tr.phase === 'retreat' ? tr.rt : tr.phase === 'aim' || tr.phase === 'ready' ? tr.t : null;
      g.fillStyle = OUT; g.beginPath(); g.arc(x, y, R + 3 * s, 0, 7); g.fill();
      g.fillStyle = col.d; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
      if (tr.phase === 'aim') { g.fillStyle = col.c; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tr.t / TURN); g.fill(); }
      txt(g, v == null ? '…' : String(Math.max(0, Math.ceil(v))), x, y + 1, 24 * s, tr.phase === 'retreat' || (v != null && v < 5.5) ? '#ffd21f' : '#fff');
      if (r.turn.n >= r.mode.sd) txt(g, 'mort subite', x + R + 8 * s, y + R * .6, 11 * s, '#9ad8ff', 'left');
      else txt(g, `tour ${tr.n + 1}`, x + R + 8 * s, y + R * .6, 11 * s, '#fff', 'left');
    }
    // the weapons, for the one who plays; else who plays
    r.slots = [];
    if (tr && r.phase === 'play') {
      const mine = isAuth() && !botTurn(), tm = r.teams[tr.team];
      if (mine) {
        const n = WEAPONS.length, sz = 44 * s, gap = 6 * s, tw = n * sz + (n - 1) * gap, x0 = cw / 2 - tw / 2, y0 = ch - pad - sz;
        const sel = WEAPONS[tr.w];
        txt(g, sel.name + (sel.target ? ' · vise et clique' : sel.charge ? ' · garde espace' : ''), cw / 2, y0 - 14 * s, 15 * s, '#fff');
        WEAPONS.forEach((w, i) => {
          const x = x0 + i * (sz + gap), on = i === tr.w, y = y0 - (on ? 5 * s : 0), am = tm.ammo[i];
          g.fillStyle = on ? '#ffb020' : 'rgba(26,19,13,.66)'; rrect(g, x, y, sz, sz, 9 * s); g.fill();
          g.strokeStyle = OUT; g.lineWidth = 2.5; rrect(g, x, y, sz, sz, 9 * s); g.stroke();
          g.save(); g.globalAlpha = am === 0 ? .3 : 1; g.translate(x + sz / 2 - 3 * s, y + sz / 2 + (w.id === 'dyna' ? 3 * s : 0)); g.scale(1.25 * s, 1.25 * s);
          if (w.id === 'fusil' || w.id === 'bazooka') g.rotate(-.5);
          drawWeapon(g, w.id, r.t); g.restore();
          txt(g, String(i + 1), x + 7 * s, y + 8 * s, 9 * s, on ? '#fff' : '#bbb');
          if (am >= 0) txt(g, String(am), x + sz - 7 * s, y + sz - 8 * s, 11 * s, am ? '#fff' : '#ff3d5e');
          r.slots.push({ x, y, w: sz, h: sz, i });
        });
      } else {
        const m = r.moles[tr.mi], s2 = `${tm.label} · ${m.name}`;
        g.font = `24px 'Titan One', 'Rubik', sans-serif`;
        const w = g.measureText(s2).width * 15 * s / 24 + 36 * s, h = 32 * s, x = cw / 2 - w / 2, y = ch - pad - h;
        g.fillStyle = TEAM[tm.i].c; rrect(g, x, y, w, h, h / 2); g.fill(); g.strokeStyle = OUT; g.lineWidth = 3; g.stroke();
        txt(g, s2, cw / 2, y + h / 2, 15 * s, '#fff');
      }
    }
    // banners
    const bn = r.banner;
    if (bn && bn.t < 1.8 && r.phase === 'play') {
      const k = Math.min(1, bn.t * 5), out = bn.t > 1.5 ? (bn.t - 1.5) / .3 : 0, sc = (.5 + .5 * k) * (1 + Math.sin(Math.min(1, bn.t * 5) * Math.PI) * .15);
      g.globalAlpha = 1 - out;
      txt(g, bn.s, cw / 2, ch * .28, 50 * s * sc, bn.c, 'center', -.04);
      txt(g, bn.sub, cw / 2, ch * .28 + 42 * s, 18 * s, '#fff');
      g.globalAlpha = 1;
    }
    const b2 = r.banner2;
    if (b2 && b2.t > 1.6) { const k = Math.min(1, (b2.t - 1.6) * 4); g.globalAlpha = Math.min(1, (3 - b2.t) * 3); txt(g, b2.s, cw / 2, ch * .42, 40 * s * k, '#9ad8ff', 'center', .04); txt(g, b2.sub, cw / 2, ch * .42 + 36 * s, 15 * s, '#fff'); g.globalAlpha = 1; }
    if (r.phase === 'count' && r.t > 0) {
      const n = Math.ceil(r.count), f = r.count % 1;
      txt(g, 'prêts ?', cw / 2, ch * .3, 30 * s, '#fff');
      txt(g, String(n), cw / 2, ch * .47, (70 + f * 40) * s, '#ffb020');
    }
    if (r.phase === 'over') {
      const o = r.result, k = Math.min(1, r.overT * 3);
      g.fillStyle = `rgba(20,14,30,${.5 * k})`; g.fillRect(0, 0, cw, ch);
      const mine = o.win === r.myTeam;
      txt(g, o.win < 0 ? 'égalité !' : mine ? 'victoire !' : `victoire : ${r.teams[o.win].label}`, cw / 2, ch * .3, (mine ? 60 : 42) * s * (.5 + .5 * k), o.win < 0 ? '#fff' : TEAM[o.win].c, 'center', -.04);
      o.rank.forEach((ti, i) => {
        const tm = r.teams[ti], y = ch * .45 + i * 30 * s;
        txt(g, `${i + 1}. ${tm.label}`, cw / 2 - 20 * s, y, 18 * s, TEAM[ti].c, 'right');
        txt(g, `${teamHp(tm)} pv · ${r.dmg[ti]} dégâts`, cw / 2, y, 16 * s, '#fff', 'left');
      });
      txt(g, `tu as infligé ${r.myDmg} dégâts`, cw / 2, ch * .45 + o.rank.length * 30 * s + 20 * s, 16 * s, '#ffd21f');
    }
  }

  // ---------- the frame ----------
  function input(keys) {
    const k = (...c) => c.some((x) => keys.has(x)), q = run.q;
    return {
      dx: (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0),
      dy: (k('ArrowDown', 'KeyS') ? 1 : 0) - (k('ArrowUp', 'KeyW') ? 1 : 0),
      fire: k('Space'), firePress: !!q.fire, jump: !!q.jump, pick: q.pick ?? null, click: q.click || null, mouse: q.mouse || null,
    };
  }
  function netSend(dt) {
    const r = run, tr = r.turn;
    if (!tr || !isAuth() || r.solo || tr.phase === 'over') return;
    tr.sendT -= dt;
    if (tr.sendT > 0) return;
    tr.sendT = 1 / 15;
    const m = r.moles[tr.mi];
    r.send({ t: 'p', n: tr.n, x: r2(m.x), y: r2(m.y), f: m.face, a: r2(m.aim), w: tr.w, c: tr.charging ? r2(tr.power) : 0, air: m.air ? 1 : 0, cx: Math.round(tr.cx), cy: Math.round(tr.cy), ph: tr.phase });
  }
  function netRecv(id, fx) {
    const r = run, tr = r.turn;
    if (fx.t === 'end') { if (r.phase === 'play' && (!tr || fx.n >= tr.n)) applyEnd(fx, false); return; }
    if (!tr || fx.n !== tr.n || isAuth()) return;
    const m = r.moles[tr.mi];
    if (fx.t === 'p') {
      m.tx = fx.x; m.ty = fx.y; m.face = fx.f; m.aim = fx.a; m.air = !!fx.air;
      if (tr.w !== fx.w) { tr.w = fx.w; r.teams[tr.team].w = fx.w; }
      tr.charging = fx.c > 0; tr.power = fx.c; tr.cx = fx.cx; tr.cy = fx.cy;
      if (fx.ph === 'aim' && tr.phase === 'ready') tr.phase = 'aim';
    } else if (fx.t === 'shot') fire(fx);
    else if (fx.t === 'pick') pick(fx.id);
  }

  const api = {
    modes: MODES.map(({ id, name, sub, help }) => ({ id, name, sub, help })),
    keys: [['← →', 'marcher'], ['↑ ↓', 'viser'], ['espace', 'garder pour charger, lâcher pour tirer'], ['shift', 'sauter'], ['e j', 'changer d\'arme'], ['1 … 7', 'choisir une arme'], ['clic', 'cible : frappe, téléporteur']],
    start({ seed = 1, humans = [], hostId, meId, send, opts = {} } = {}) {
      if (run) api.stop();
      const mode = MODES.find((m) => m.id === opts?.mode) || MODES[0];
      if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
      const map = createMap(seed), R = rng(seed ^ 0x51ab);
      const cv = document.createElement('canvas');
      cv.id = 'worms';
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:15;pointer-events:auto;display:block;background:#8fd0ff';
      document.body.appendChild(cv);
      place(cv);
      const teams = Array.from({ length: mode.teams }, (_, i) => ({ i, members: [], names: [], moles: [], last: -1, w: 0, botted: false, ammo: WEAPONS.map((w) => w.ammo) }));
      humans.forEach((h, k) => { const t = teams[k % mode.teams]; t.members.push(h.id); t.names.push(h.id === meId ? 'toi' : h.name); });
      for (const t of teams) t.label = t.names.length ? t.names.join(' & ') : TEAM[t.i].name;
      const names = NAMES.slice();
      for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
      const spots = map.spawns(mode.teams * mode.moles, R);
      for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
      const moles = [];
      for (let j = 0; j < mode.moles; j++) for (const t of teams) {
        const sp = spots[moles.length], i = moles.length;
        moles.push({ i, team: t.i, j, name: names[i % names.length], x: sp.x, y: sp.y, tx: sp.x, ty: sp.y, vx: 0, vy: 0, air: false, hp: 100, dead: false, drown: false,
          face: sp.x < W / 2 ? 1 : -1, aim: .35, walk: 0, walkAcc: 0, hurtT: 9, flyT: 0, stuck: 0, hold: null });
        t.moles.push(i);
      }
      const ft = Math.floor(R() * mode.teams);
      run = { seed, mode, map, cv, g: cv.getContext('2d'), bg: createBackdrop(seed), humans, hostId, meId, host: hostId === meId, solo: humans.length < 2, send: send ?? (() => {}),
        teams, moles, projs: [], parts: [], texts: [], tracers: [], crates: [], carves: [], log: [], gone: new Set(), dmg: teams.map(() => 0), myDmg: 0,
        myTeam: teams.findIndex((t) => t.members.includes(meId)), water: WATER, wind: Math.round((R() * 2 - 1) * 10) / 10, crateId: 0, resync: 0,
        phase: 'count', count: COUNT, t: 0, simT: 0, acc: 0, overT: 0, turn: null, cam: { x: 0, y: 0, free: false }, camHold: 0, shake: 0, q: {}, cw: 0, ch: 0, dpr: 0, z: 1, ended: false, slots: [] };
      run.first = { n: 0, team: ft, mole: 0, owner: ownerOf(teams[ft], 0), wind: run.wind, crate: null };
      run.firstMi = teams[ft].moles[0];
      fit();
      const m0 = moles[run.firstMi];
      run.cam.x = m0.x; run.cam.y = m0.y - 50;
      camera(0);
      // input: taps (pads send keydown+keyup at once), the mouse for the targets and to look around
      const cvPos = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
      const toWorld = (p) => ({ x: run.cam.x + (p.x - run.cw / 2) / run.z, y: run.cam.y + (p.y - run.ch / 2) / run.z });
      const onKey = (e) => {
        if (!run || e.repeat) return;
        sfx.init();
        const c = e.code, qq = run.q;
        if (c === 'Space') qq.fire = true;
        else if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'Enter' || c === 'NumpadEnter') qq.jump = true;
        else if (c === 'KeyE') qq.pick = 'next';
        else if (c === 'KeyJ') qq.pick = 'prev';
        else { const d = /^(Digit|Numpad)([1-7])$/.exec(c); if (d) qq.pick = +d[2] - 1; }
        if (c.startsWith('Arrow') || c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') run.cam.free = false;
      };
      let drag = null;
      const L = run.listeners = [
        [window, 'keydown', onKey],
        [cv, 'mousedown', (e) => {
          sfx.init(); e.preventDefault();
          const p = cvPos(e), sl = run.slots.find((s) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
          if (sl && e.button === 0) { run.q.pick = sl.i; return; }
          const tr = run.turn;
          if (e.button === 0 && tr && tr.phase === 'aim' && WEAPONS[tr.w].target && isAuth() && !botTurn()) { run.q.click = toWorld(p); return; }
          drag = { x: p.x, y: p.y, cx: run.cam.x, cy: run.cam.y };
        }],
        [cv, 'mousemove', (e) => {
          const p = cvPos(e);
          if (drag) { const dx = p.x - drag.x, dy = p.y - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) { run.cam.free = true; run.cam.x = drag.cx - dx / run.z; run.cam.y = drag.cy - dy / run.z; } return; }
          const tr = run.turn;
          if (tr && tr.phase === 'aim' && WEAPONS[tr.w].target) run.q.mouse = toWorld(p);
        }],
        [window, 'mouseup', () => { drag = null; }],
        [cv, 'contextmenu', (e) => e.preventDefault()],
        [window, 'blur', () => { drag = null; }],
      ];
      for (const [el, ev, f] of L) el.addEventListener(ev, f);
      render();
    },
    update(dt, keys = new Set()) {
      if (!run) return;
      if (document.pointerLockElement) document.exitPointerLock?.();
      fit();
      dt = Math.min(Math.max(dt || 0, 0), .1);
      if (dt === 0) { run.q = {}; render(); return; }   // frozen behind the title screen
      const r = run;
      r.t += dt; r.fdt = dt;
      if (r.phase === 'count') {
        const c0 = Math.ceil(r.count);
        r.count -= dt;
        if (Math.ceil(r.count) !== c0 && r.count > 0) sfx.tick(false);
        if (r.count <= 0) { r.phase = 'play'; beginTurn(r.first); }
      }
      if (r.phase === 'play') {
        r.acc += dt;
        const inp = input(keys);
        let n = 0;
        while (r.acc >= STEP && n < 8 && run && r.phase === 'play') {
          r.acc -= STEP; n++;
          step(inp);
          inp.firePress = inp.jump = false; inp.pick = inp.click = inp.mouse = null;
        }
        if (n) r.q = {};
        if (n >= 8) r.acc = 0;
        netSend(dt);
      } else if (r.phase === 'over') {
        r.overT += dt;
        if (r.overT > 5 && !r.ended) { finish(); return; }
      }
      if (!run) return;
      for (const m of r.moles) m.hurtT += dt;
      camera(dt); stepParts(dt); render();
    },
    stop() {
      if (!run) return;
      for (const [el, ev, f] of run.listeners || []) el.removeEventListener(ev, f);
      run.cv.remove();
      run = null;
      sfx.pause();
    },
    respawn() { if (run) { run.cam.free = false; run.camHold = 0; } },
    onFx(peerId, fx) { if (run && fx) netRecv(peerId, fx); },
    peerLeft(id) {
      const r = run;
      if (!r || r.gone.has(id) || !r.humans.some((h) => h.id === id)) return;
      r.gone.add(id);
      if (id === r.hostId) { r.hostId = r.humans.find((h) => !r.gone.has(h.id))?.id; r.host = r.hostId === r.meId; }
      const early = r.phase === 'count' || (r.turn && r.turn.n === 0 && !r.turn.shots);
      for (const t of r.teams) if (early && t.members.includes(id) && !present(t).length) t.botted = true;
      if (r.phase === 'count') { const t = r.teams[r.first.team]; r.first.owner = ownerOf(t, 0); return; }
      const tr = r.turn;
      if (tr && tr.owner === id) {
        tr.owner = '@bot';
        const t = r.teams[tr.team];
        if (!(t.botted && (tr.phase === 'ready' || tr.phase === 'aim'))) { if (tr.phase === 'ready' || tr.phase === 'aim' || tr.phase === 'retreat') tr.phase = 'settle'; tr.calm = 0; }
      }
    },
    setRect(rc) { rect = rc; place(run?.cv); },
    hud() { return { hidden: true }; },
    set onEnd(f) { onEnd = f; },
    // for the tests: run the game fast, a bot at my controls; fire a shot of mine
    _dbg: {
      get run() { return run; },
      sim(sec, auto = true, draw = true) {
        if (!run) return;
        run.auto = auto;
        if (run.phase === 'count') { run.count = 0; run.phase = 'play'; beginTurn(run.first); }
        for (let i = 0; i < sec * 60 && run && !run.ended; i++) {
          if (run.phase === 'play') step({ dx: 0, dy: 0 });
          else if (run.phase === 'over') { run.overT = 99; finish(); break; }
        }
        if (run && !run.ended && draw) render();
      },
      plan() { const r = run, m = r.moles[r.turn.mi]; return plan(m); },
      boom(x, y, r = 46) { explode(x, y, r, 50); },
      fire(w, a, pw, tx = 0, ty = 0) {
        const tr = run?.turn;
        if (!tr || !isAuth()) return false;
        tr.phase = 'aim'; tr.w = WI[w] ?? w; run.moles[tr.mi].aim = a; tr.power = pw; tr.charging = true;
        doFire(tx, ty);
        return true;
      },
    },
  };
  return api;
}
