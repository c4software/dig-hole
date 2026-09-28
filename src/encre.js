// encre.js: « encre 2D » — a side-view turf war, oranges against blues, four a side. Shoot ink, swim in it, climb it;
// after three minutes the side that covered the most ground wins. Each client runs its own kid, the host runs the bots.
import { T, W, H, INK, INK_DARK, INK_LIGHT, createLevel, rng, splatPath } from './encre-level.js';
import { txt, rrect, OUT, createBackdrop, drawKid, drawSquid } from './encre-draw.js';
import { createSfx } from './encre-sfx.js';
import { clamp } from './lib/math.js';

const DUR = 180, COUNT = 3.4, HX = 11, HT = 36, G = 2300, GB = 1300, STEP = 1 / 120;
const TEAM = ['oranges', 'bleus'];
const BOTN = ['pâté', 'tartine', 'bulot', 'moule', 'crevette', 'flaque', 'gribouille', 'pastèque'];
const MAIN = { v: 950, r: 21, dmg: 34, cost: .011, every: .11 };
const BOMB = { r: 82, dmg: 100, reach: 110 };
const pct = (v) => v.toFixed(1).replace('.', ',');

export function createEncre({ audio, ui } = {}) {
  const sfx = createSfx();
  let onEnd = () => {};
  let run = null;

  // ---------- characters ----------
  function makeChar(id, name, team, o = {}) {
    const sp = run.lv.spawn[team];
    return { id, name, team, bot: false, remote: false, x: sp.x + (Math.random() - .5) * 60, y: sp.y, vx: 0, vy: 0, ground: false, air: false,
      face: team ? -1 : 1, aim: team ? Math.PI : 0, squid: false, hidden: false, climb: false, ink: 1, sp: 0, hp: 100, dead: false,
      respT: 0, inv: 0, flash: 0, sq: 1, run: 0, cool: 0, hurtT: 9, coyote: 0, jumpCd: 0, tx: 0, ty: 0, netT: 0, swimT: 0, ...o };
  }
  const isAuth = (c) => c === run.me || (run.host && c.bot);

  function collide(e, dt) {
    const lv = run.lv;
    e.x += e.vx * dt;
    const r0 = Math.floor((e.y - HT) / T), r1 = Math.floor((e.y - .01) / T);
    if (e.vx > 0) { const tx = Math.floor((e.x + HX) / T); for (let ty = r0; ty <= r1; ty++) if (lv.isS(tx, ty)) { e.x = tx * T - HX - .01; e.vx = 0; break; } }
    else if (e.vx < 0) { const tx = Math.floor((e.x - HX) / T); for (let ty = r0; ty <= r1; ty++) if (lv.isS(tx, ty)) { e.x = (tx + 1) * T + HX + .01; e.vx = 0; break; } }
    e.y += e.vy * dt;
    const was = e.ground; e.ground = false;
    const c0 = Math.floor((e.x - HX + .01) / T), c1 = Math.floor((e.x + HX - .01) / T);
    if (e.vy >= 0) {
      const ty = Math.floor(e.y / T);
      for (let tx = c0; tx <= c1; tx++) if (lv.isS(tx, ty)) {
        if (!was && e.vy > 380) { e.sq = 1 + Math.min(.35, e.vy / 3000); if (e === run.me || near(e.x, e.y) > .5) puff(e.x, e.y, 4); }
        e.y = ty * T; e.vy = 0; e.ground = true; break;
      }
    } else {
      const ty = Math.floor((e.y - HT) / T);
      for (let tx = c0; tx <= c1; tx++) if (lv.isS(tx, ty)) { e.y = (ty + 1) * T + HT; e.vy = 0; break; }
    }
    if (e.y - HT < -3 * T) { e.y = -3 * T + HT; e.vy = Math.max(0, e.vy); }
  }
  const floorOwner = (e) => { const lv = run.lv; return lv.ownerAt(e.x, e.y + 2, 0) || lv.ownerAt(e.x - HX + 2, e.y + 2, 0) || lv.ownerAt(e.x + HX - 2, e.y + 2, 0); };
  const wallOwner = (e, dir) => { const lv = run.lv, wx = dir > 0 ? e.x + HX + 3 : e.x - HX - 3, f = dir > 0 ? 3 : 1; return lv.ownerAt(wx, e.y - 6, f) || lv.ownerAt(wx, e.y - 20, f); };

  function stepChar(e, inp, dt) {
    e.flash -= dt; e.inv -= dt; e.jumpCd -= dt; e.cool -= dt; e.hurtT += dt;
    e.sq += (1 - e.sq) * Math.min(1, dt * 11);
    if (e.dead) {
      e.respT -= dt;
      if (e.respT <= 0) respawnChar(e);
      return;
    }
    const own = e.team + 1, foe = 2 - e.team;
    const under = e.ground ? floorOwner(e) : 0;
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    e.squid = !!inp.squid;
    const climb = e.squid && dir !== 0 && wallOwner(e, dir) === own;
    e.climb = climb;
    const inOwn = e.squid && (climb || under === own), inFoe = under === foe;
    e.hidden = inOwn;
    if (!e.squid && (inp.shoot || inp.mouse)) e.face = Math.cos(inp.aim) >= 0 ? 1 : -1;
    else if (dir) e.face = dir;
    if (climb) {
      e.vy = inp.jump ? -780 : -430; e.vx = dir * 30; e.sq = .9;
    } else {
      const sp = e.squid ? (inOwn ? 540 : inFoe ? 80 : 170) : (inFoe ? 110 : e.cool > -.25 ? 195 : 265);
      e.vx += (dir * sp - e.vx) * Math.min(1, dt * (e.ground ? 16 : 6));
      e.vy = Math.min(1400, e.vy + G * dt);
      e.coyote = e.ground ? .09 : e.coyote - dt;
      if (inp.jump && e.coyote > 0 && e.jumpCd <= 0) {
        e.vy = inOwn ? -1030 : e.squid ? -700 : -800; e.coyote = 0; e.jumpCd = .18; e.sq = .72;
        if (inOwn && (e === run.me || near(e.x, e.y) > .4)) burst(e.x, e.y, e.team, 8, 260, 2);
      }
    }
    collide(e, dt);
    e.air = !e.ground && !climb;
    if (e.ground) e.run += Math.abs(e.vx) * dt * .07;
    // ink, health
    if (inOwn) e.ink = Math.min(1, e.ink + dt * .6);
    else if (e.squid) e.ink = Math.min(1, e.ink + dt * .05);
    else if (e.cool < -.5) e.ink = Math.min(1, e.ink + dt * .12);
    if (inFoe && e.hp > 40) { e.hp = Math.max(40, e.hp - dt * 24); e.hurtT = Math.min(e.hurtT, .6); }
    if (e.hurtT > 1.2) e.hp = Math.min(100, e.hp + dt * (inOwn ? 120 : 40));
    if (inOwn && Math.abs(e.vx) > 120) {
      e.swimT -= dt;
      if (e.swimT <= 0) { e.swimT = .09; if (e === run.me) sfx.swim(); if (e === run.me || e.team === run.me.team) bubble(e.x - e.face * 10, e.y - 3, e.team); }
    }
    // weapons
    if (!e.squid && inp.shoot && e.cool <= 0) {
      if (e.ink >= MAIN.cost) {
        e.ink -= MAIN.cost; e.cool = MAIN.every * (e.bot ? 1.6 : 1);
        const a = inp.aim + (Math.random() - .5) * .1, v = MAIN.v * (.96 + Math.random() * .08);
        fire(e, e.x + Math.cos(a) * 18 + e.face * 5, e.y - 15 + Math.sin(a) * 18, Math.cos(a) * v, Math.sin(a) * v, 0);
        if (e === run.me) sfx.shoot(); else sfx.shoot(near(e.x, e.y) * .5);
      } else { e.cool = .3; if (e === run.me) run.dryT = 1; }
    }
    if (inp.special && e.sp >= 1 && !e.squid) {
      e.sp = 0;
      for (let i = 0; i < 5; i++) {
        const a = inp.aim - .1 + (i - 2) * .16 - .25, v = 560 + i % 3 * 120;
        fire(e, e.x, e.y - 24, Math.cos(a) * v, Math.sin(a) * v, 1);
      }
      if (e === run.me) { sfx.special(); run.shake += 6; run.banner = { s: 'déluge !', t: 1.2, c: e.team }; }
      ring(e.x, e.y - 20, e.team, 70);
    }
  }
  function respawnChar(e) {
    const sp = run.lv.spawn[e.team];
    Object.assign(e, { dead: false, hp: 100, ink: 1, x: sp.x + (Math.random() - .5) * 40, y: sp.y - 420, vx: 0, vy: 300, inv: 2, squid: false, hidden: false });
    if (e === run.me) run.cam.y = e.y;
  }

  // ---------- blobs of ink ----------
  function fire(e, x, y, vx, vy, k) {
    const s = [Math.round(x), Math.round(y), Math.round(vx), Math.round(vy), e.team, k, e.id];
    run.out.push(s);
    addBlob(s);
  }
  function addBlob([x, y, vx, vy, team, k, owner]) { run.blobs.push({ x, y, vx, vy, team, k, owner, acc: 0, age: 0, dead: false }); }
  function stepBlobs(dt) {
    const { lv } = run;
    for (const b of run.blobs) {
      b.acc += dt;
      while (b.acc >= STEP && !b.dead) {
        b.acc -= STEP; b.age += STEP;
        b.vy += (b.k ? 1500 : GB) * STEP; b.x += b.vx * STEP; b.y += b.vy * STEP;
        if (b.x < 0 || b.x > lv.wpx || b.y > lv.hpx || b.age > 3) { b.dead = true; break; }
        for (const c of run.chars.values()) {
          if (c.dead || c.team === b.team || Math.abs(b.x - c.x) > HX + 5 || b.y < c.y - HT - 5 || b.y > c.y + 3) continue;
          b.dead = true;
          if (b.k) explode(b);
          else {
            if (isAuth(c) && c.inv <= 0) hurt(c, MAIN.dmg, b.owner);
            burst(b.x, b.y, b.team, 6, 200, 2);
            if (b.owner === run.me.id) { sfx.hit(); run.hitT = .15; }
          }
          break;
        }
        if (!b.dead && lv.solidAt(b.x, b.y)) {
          b.dead = true;
          if (b.k) explode(b);
          else {
            const n = lv.splat(b.x, b.y, MAIN.r, b.team + 1);
            charge(b.owner, n / 190);
            burst(b.x, b.y, b.team, 4, 160, 1.6);
            sfx.splat(near(b.x, b.y) * .8);
          }
        }
      }
    }
    run.blobs = run.blobs.filter((b) => !b.dead);
  }
  function explode(b) {
    run.lv.splat(b.x, b.y, BOMB.r, b.team + 1);
    for (const c of run.chars.values()) {
      if (!isAuth(c) || c.dead || c.team === b.team || c.inv > 0) continue;
      const d = Math.hypot(c.x - b.x, c.y - 18 - b.y);
      if (d < BOMB.reach) hurt(c, d < 45 ? BOMB.dmg : BOMB.dmg * (1 - (d - 45) / (BOMB.reach - 45)) * .8, b.owner);
    }
    const v = near(b.x, b.y);
    burst(b.x, b.y, b.team, 22, 520, 3); ring(b.x, b.y, b.team, BOMB.r);
    run.shake += 9 * v; sfx.boom(v);
  }
  function charge(owner, amt) {
    const c = run.chars.get(owner);
    if (!c || !isAuth(c) || c.dead || !amt) return;
    const was = c.sp;
    c.sp = Math.min(1, c.sp + amt);
    if (c === run.me && was < 1 && c.sp >= 1) { sfx.ready(); run.banner = { s: 'déluge prêt · e', t: 1.6, c: c.team }; }
  }
  function hurt(c, dmg, by) {
    c.hp -= dmg; c.flash = .18; c.hurtT = 0;
    if (c === run.me) { run.shake += 5; sfx.hurt(); run.hurtFx = 1; }
    if (c.hp <= 0) {
      c.dead = true; c.respT = 3; c.hp = 0;
      run.send({ t: 'die', id: c.id, by, x: Math.round(c.x), y: Math.round(c.y) });
      died(c.id, by, c.x, c.y);
    }
  }
  function died(id, by, x, y) {
    const c = run.chars.get(id), k = run.chars.get(by);
    if (!c) return;
    c.dead = true; c.respT = Math.max(c.respT, 2.5);
    const kt = 1 - c.team;
    run.lv.splat(x, y - 6, 62, kt + 1);
    burst(x, y - 18, kt, 36, 700, 3.4); burst(x, y - 18, c.team, 10, 400, 2.5); ring(x, y - 18, kt, 90);
    const v = near(x, y);
    run.shake += c === run.me ? 16 : 8 * v;
    sfx.splatted(); if (v < .2 && c !== run.me) sfx.splat(.3);
    run.feed.unshift({ a: k ? k.name : '?', at: k ? k.team : kt, b: c.name, bt: c.team, t: 0, me: c === run.me || k === run.me });
    run.feed.length = Math.min(run.feed.length, 5);
  }

  // ---------- juice ----------
  const near = (x, y) => run ? clamp(1 - Math.hypot(x - run.cam.x, (y - run.cam.y) * 1.3) / 900, 0, 1) : 0;
  function burst(x, y, team, n, sp, r) {
    for (let i = 0; i < n && run.parts.length < 700; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (.3 + Math.random() * .7);
      run.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - sp * .3, life: 0, max: .35 + Math.random() * .45, r: r * (.5 + Math.random()), c: INK[team], k: 0 });
    }
  }
  const ring = (x, y, team, r) => run.parts.push({ x, y, vx: 0, vy: 0, life: 0, max: .35, r, c: INK_LIGHT[team], k: 1 });
  const puff = (x, y, n) => { for (let i = 0; i < n; i++) run.parts.push({ x: x + (Math.random() - .5) * 20, y, vx: (Math.random() - .5) * 120, vy: -Math.random() * 60, life: 0, max: .35, r: 3 + Math.random() * 3, c: 'rgba(255,255,255,.7)', k: 2 }); };
  const bubble = (x, y, team) => run.parts.push({ x, y, vx: (Math.random() - .5) * 40, vy: -40 - Math.random() * 60, life: 0, max: .5, r: 2 + Math.random() * 2.5, c: INK_LIGHT[team], k: 3 });

  // ---------- bots (the host thinks for them) ----------
  function front(team) {
    const { lv } = run, own = team + 1;
    if (run.fronts[team].t > 0) return run.fronts[team].x;
    let x = team ? 11 * T : (W - 11) * T;
    for (let k = 9; k < W - 9; k++) {
      const i = team ? W - 1 - k : k, gy = lv.ground[i] * T;
      if (lv.ownerAt(i * T + 8, gy + 1, 0) !== own && lv.ownerAt(i * T + 24, gy + 1, 0) !== own) { x = i * T + T / 2; break; }
    }
    run.fronts[team] = { x, t: .5 };
    return x;
  }
  function ballistic(sx, sy, tx, ty, v, g) {
    const dx = tx - sx, up = sy - ty, v2 = v * v, ax = Math.abs(dx) || 1;
    const disc = v2 * v2 - g * (g * dx * dx + 2 * up * v2);
    const ang = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * ax));
    return dx >= 0 ? -ang : Math.PI + ang;
  }
  function botInput(b, dt) {
    const br = b.brain ??= { inp: {}, mode: 'push', think: 0, err: 0, strafe: 0, stuck: 0, off: 0, wob: Math.random() * 9 };
    const inp = br.inp, own = b.team + 1, home = b.team ? 1 : -1;
    inp.l = inp.r = inp.jump = inp.squid = inp.shoot = inp.special = false;
    if (b.dead) return inp;
    br.think -= dt; br.wob += dt;
    if (br.think <= 0) { br.think = .3 + Math.random() * .35; br.err = (Math.random() - .5) * .3; br.strafe = [-1, 0, 1, 1][Math.random() * 4 | 0]; br.off = (Math.random() - .3) * 260; }
    let foe = null, fd = 1e9;
    for (const c of run.chars.values()) {
      if (c.team === b.team || c.dead) continue;
      const dx = c.x - b.x, dy = c.y - b.y;
      if (c.hidden && dx * dx + dy * dy > 110 * 110) continue;
      const d = Math.abs(dx) + Math.abs(dy) * 1.5;
      if (d < fd) { fd = d; foe = c; }
    }
    if (b.ink < (foe && fd < 560 ? .05 : .22)) br.mode = 'refill';
    if (br.mode === 'refill' && b.ink > .9) br.mode = 'push';
    const under = b.ground ? floorOwner(b) : 0;
    let dir = 0, aim = b.aim;
    if (br.mode === 'refill') {
      if (under === own) { inp.squid = true; dir = foe && fd < 260 ? home : 0; }
      else dir = home;
    } else if (foe && fd < 560) {
      const dx = foe.x - b.x;
      aim = ballistic(b.x, b.y - 15, foe.x + foe.vx * .12, foe.y - 18, MAIN.v, GB) + br.err;
      inp.shoot = true;
      dir = Math.abs(dx) > 360 ? Math.sign(dx) : Math.abs(dx) < 170 ? -Math.sign(dx) : br.strafe;
      if (Math.random() < dt * 1.1) inp.jump = true;
    } else {
      const tgt = clamp(front(b.team) - home * 2 * T + br.off, 11 * T, (W - 11) * T);
      dir = Math.abs(tgt - b.x) > 50 ? Math.sign(tgt - b.x) : br.strafe;
      const f = dir || b.face;
      const w = Math.sin(br.wob * 2.6) * .45;
      aim = f > 0 ? .35 + w : Math.PI - .35 - w;
      if (Math.sin(br.wob * .9) > .75) aim = f > 0 ? -.7 : Math.PI + .7;
      inp.shoot = b.ink > .03;
      if (Math.abs(tgt - b.x) > 320 && under === own) { inp.squid = true; inp.shoot = false; }
      if (b.ground && Math.random() < dt * .5) inp.jump = true;
    }
    if (dir && b.ground && Math.abs(b.vx) < 25) br.stuck += dt; else if (!b.climb) br.stuck = Math.max(0, br.stuck - dt * .5);
    if (br.stuck > .12 && br.stuck < .6) inp.jump = true;
    if (br.stuck >= .6 && dir) {
      if (wallOwner(b, dir) === own) { inp.squid = true; inp.shoot = false; }
      else { inp.squid = false; inp.shoot = true; aim = dir > 0 ? -.9 : Math.PI + .9; }
      if (br.stuck > 3) br.stuck = 0;
    }
    if (b.climb) { inp.squid = true; inp.shoot = false; }
    if (b.sp >= 1 && ((foe && fd < 480) || Math.random() < dt * .15)) { inp.special = true; if (foe) aim = ballistic(b.x, b.y - 24, foe.x, foe.y, 700, 1500); }
    inp.l = dir < 0; inp.r = dir > 0; inp.aim = aim;
    b.aim = aim;
    return inp;
  }

  // ---------- network ----------
  const pack = (c) => [c.id, Math.round(c.x), Math.round(c.y), Math.round(c.vx), Math.round(c.vy),
    (c.squid ? 1 : 0) | (c.hidden ? 2 : 0) | (c.climb ? 4 : 0) | (c.dead ? 8 : 0) | (c.face > 0 ? 16 : 0) | (c.air ? 32 : 0),
    Math.round(c.hp), +c.aim.toFixed(2), +c.ink.toFixed(2), c.team];
  function unpack(a, bot) {
    const [id, x, y, vx, vy, f, hp, aim, ink, team] = a;
    if (id === run.meId || (bot && run.host)) return;
    let c = run.chars.get(id);
    if (!c) {
      if (run.gone.has(id)) return;
      const h = run.humans.find((h) => h.id === id);
      const name = bot ? BOTN[+String(id).slice(3) % BOTN.length] : h ? h.name : 'joueur';
      c = makeChar(id, name, team, { remote: true, bot, x, y });
      run.chars.set(id, c);
    }
    const wasDead = c.dead, wasAir = c.air;
    c.tx = x; c.ty = y; c.vx = vx; c.vy = vy; c.netT = 0;
    c.squid = !!(f & 1); c.hidden = !!(f & 2); c.climb = !!(f & 4); c.dead = !!(f & 8); c.face = f & 16 ? 1 : -1; c.air = !!(f & 32);
    c.hp = hp; c.aim = aim; c.ink = ink; c.team = team;
    if (wasDead && !c.dead || Math.hypot(c.x - x, c.y - y) > 200) { c.x = x; c.y = y; }
    if (wasAir && !c.air) c.sq = 1.25;
    if (!wasAir && c.air && vy < -300) c.sq = .75;
  }
  function netSend(dt) {
    run.sendT -= dt;
    if (run.sendT <= 0 || run.out.length > 10) {
      run.sendT = 1 / 15;
      const m = { t: 's', p: pack(run.me) };
      if (run.out.length) m.sh = run.out.splice(0);
      if (run.host) m.b = [...run.chars.values()].filter((c) => c.bot).map(pack);
      run.send(m);
    }
    if (run.host && run.phase !== 'judge') {
      run.chunkT -= dt;
      if (run.chunkT <= 0) { run.chunkT = .3; run.chunkK = (run.chunkK + 1) % run.lv.chunks; run.send({ t: 'pt', n: run.chunkK, d: run.lv.encode(run.chunkK) }); }
    }
  }
  function netRecv(peerId, fx) {
    if (fx.t === 's') {
      if (fx.p) unpack(fx.p, false);
      if (fx.b && peerId === run.hostId) for (const b of fx.b) unpack(b, true);
      if (fx.sh) for (const s of fx.sh) if (s[6] !== run.meId) addBlob(s);
    } else if (fx.t === 'die') {
      if (fx.id !== run.meId && !(run.host && run.chars.get(fx.id)?.bot)) died(fx.id, fx.by, fx.x, fx.y);
    } else if (fx.t === 'pt') {
      if (!run.host && peerId === run.hostId) run.lv.apply(fx.n, fx.d);
    } else if (fx.t === 'end') {
      if (peerId === run.hostId) run.hostEnd = [fx.o, fx.b];
    }
  }
  function remoteStep(c, dt) {
    c.netT += dt; c.flash -= dt; c.inv -= dt;
    c.sq += (1 - c.sq) * Math.min(1, dt * 11);
    const a = Math.min(c.netT, .15);
    c.x += (c.tx + c.vx * a - c.x) * Math.min(1, dt * 14);
    c.y += (c.ty + (c.air ? c.vy * a : 0) - c.y) * Math.min(1, dt * 14);
    if (!c.air) c.run += Math.abs(c.vx) * dt * .07;
    if (c.hidden && Math.abs(c.vx) > 120 && c.team === run.me.team && Math.random() < dt * 10) bubble(c.x, c.y - 3, c.team);
  }

  // ---------- input ----------
  function localInput(keys) {
    const k = (...c) => c.some((x) => keys.has(x)), m = run.mouse, me = run.me;
    const inp = run.inp;
    inp.l = k('KeyA', 'ArrowLeft'); inp.r = k('KeyD', 'ArrowRight');
    inp.jump = k('Space', 'KeyW', 'ArrowUp');
    inp.squid = k('ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown');
    const kj = k('KeyJ');
    inp.shoot = m.down || kj;
    inp.special = k('KeyE', 'KeyK') || m.right;
    if (m.active && !kj) {
      const w = toWorld(m.x, m.y);
      inp.aim = Math.atan2(w.y - (me.y - 15), w.x - me.x);
    } else {
      const d = (inp.r ? 1 : 0) - (inp.l ? 1 : 0) || me.face;
      inp.aim = d > 0 ? -.12 : Math.PI + .12;
    }
    me.aim = inp.aim; inp.mouse = m.active && !kj;
    return inp;
  }
  const toWorld = (sx, sy) => ({ x: (sx - run.cw / 2) / run.z + run.cam.x, y: (sy - run.ch / 2) / run.z + run.cam.y });

  // ---------- the match ----------
  function step(dt, keys) {
    const r = run;
    r.t += dt; r.lv.clock = r.t;
    for (const f of r.feed) f.t += dt;
    r.fronts[0].t -= dt; r.fronts[1].t -= dt;
    if (r.banner) { r.banner.t -= dt; if (r.banner.t <= 0) r.banner = null; }
    r.dryT -= dt; r.hitT -= dt; r.hurtFx = Math.max(0, r.hurtFx - dt * 2);
    if (r.phase === 'count') {
      const before = Math.ceil(r.count);
      r.count -= dt;
      if (Math.ceil(r.count) !== before && r.count > 0 && before <= 3) sfx.beep(false);
      if (r.count <= 0) { r.phase = 'play'; sfx.beep(true); r.banner = { s: 'encre !', t: 1, c: r.me.team }; }
    } else if (r.phase === 'play') {
      r.left -= dt;
      if (r.left < 10 && Math.ceil(r.left) !== Math.ceil(r.left + dt)) sfx.tick();
      const inp = r.auto ? botInput(r.me, dt) : localInput(keys);
      stepChar(r.me, inp, dt);
      for (const c of r.chars.values()) {
        if (c === r.me) continue;
        if (c.remote) remoteStep(c, dt);
        else if (c.bot) stepChar(c, botInput(c, dt), dt);
      }
      stepBlobs(dt);
      if (r.left <= 0) {
        r.left = 0; r.phase = 'judge'; r.judgeT = 0; sfx.whistle();
        if (r.host) r.send({ t: 'end', o: share(0), b: share(1) });
      }
    } else if (r.phase === 'judge') {
      r.judgeT += dt;
      if (r.judgeT >= 1.4 && !r.final) {
        r.final = r.hostEnd ?? [share(0), share(1)];
        r.win = r.final[0] > r.final[1] ? 0 : r.final[1] > r.final[0] ? 1 : -1;
      }
      if (r.judgeT >= 4 && !r.splashed) { r.splashed = true; r.shake += 14; if (r.win === r.me.team || r.win < 0) sfx.win(); else sfx.lose(); sfx.boom(1); }
      if (r.judgeT >= 7.6) finish();
    }
    if (r.phase !== 'judge') netSend(dt);
    // particles
    for (const p of r.parts) {
      p.life += dt;
      if (p.k === 0) { p.vy += 1400 * dt; p.vx *= .99; }
      if (p.k === 3) p.vx *= .95;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    r.parts = r.parts.filter((p) => p.life < p.max);
    // camera
    const me = r.me, m = r.mouse;
    let tx = me.x + me.face * 60, ty = me.y - 70;
    if (m.active && !r.auto) { const w = toWorld(m.x, m.y); tx = me.x + clamp((w.x - me.x) * .3, -220, 220); ty = me.y - 70 + clamp((w.y - me.y) * .2, -120, 120); }
    const k = Math.min(1, dt * 5);
    r.cam.x += (tx - r.cam.x) * k; r.cam.y += (ty - r.cam.y) * k * (me.dead ? .5 : 1.4);
    const hw = r.cw / 2 / r.z, hh = r.ch / 2 / r.z, lw = r.lv.wpx, lh = r.lv.hpx;
    r.cam.x = lw < hw * 2 ? lw / 2 : clamp(r.cam.x, hw, lw - hw);
    r.cam.y = clamp(r.cam.y, -3 * T + hh, lh - hh);
    r.shake = Math.min(24, r.shake) * Math.exp(-dt * 7);
  }
  const share = (team) => run.lv.cnt[team + 1] / run.lv.total * 100;
  function finish() {
    if (!run || run.ended) return;
    run.ended = true;
    const r = run, [o, b] = r.final, mine = r.me.team, my = r.final[mine], th = r.final[1 - mine];
    const text = r.win < 0 ? `égalité · ${pct(o)} % partout` : `victoire des ${TEAM[r.win]} · ${pct(Math.max(o, b))} % contre ${pct(Math.min(o, b))} %`;
    onEnd({ place: my >= th ? 1 : 2, of: 2, pct: +my.toFixed(1), time: DUR, text });
  }

  // ---------- drawing ----------
  // the game can be shown in a rectangle of the page (a screen in the game room) instead of the whole page
  let rect = null;
  function place(cv) {
    if (!cv) return;
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100%', height: '100%' });
  }
  function fit() {
    const r = run, dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(rect?.w ?? innerWidth), ch = Math.round(rect?.h ?? innerHeight);
    if (r.cw !== cw || r.ch !== ch || r.dpr !== dpr) {
      r.cw = cw; r.ch = ch; r.dpr = dpr;
      r.cv.width = Math.round(cw * dpr); r.cv.height = Math.round(ch * dpr);
    }
    r.z = Math.max(clamp(ch / 590, .55, 2.2), cw / r.lv.wpx);
  }
  function render() {
    const r = run, g = r.g, { cw, ch, dpr, z, lv } = r;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true;
    r.bg(g, cw, ch, r.cam.x, r.cam.y, r.t, dpr);
    const sh = r.shake, shx = (Math.random() - .5) * sh, shy = (Math.random() - .5) * sh;
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - r.cam.x * z + shx), dpr * (ch / 2 - r.cam.y * z + shy));
    const vx0 = r.cam.x - cw / 2 / z - 40, vy0 = r.cam.y - ch / 2 / z - 40, vx1 = vx0 + cw / z + 80, vy1 = vy0 + ch / z + 80;
    const x0 = Math.max(0, Math.floor(vx0)), y0 = Math.max(0, Math.floor(vy0)), x1 = Math.min(lv.wpx, Math.ceil(vx1)), y1 = Math.min(lv.hpx, Math.ceil(vy1));
    // spawn pads
    lv.spawn.forEach((s, k) => {
      const gr = g.createLinearGradient(0, s.y - 260, 0, s.y);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, INK[k]);
      g.fillStyle = gr; g.globalAlpha = .35 + .12 * Math.sin(r.t * 3);
      g.fillRect(s.x - 56, s.y - 260, 112, 260); g.globalAlpha = 1;
    });
    if (x1 > x0 && y1 > y0) {
      g.drawImage(lv.ink, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }
    g.beginPath();
    const L = lv.lines;
    for (let i = 0; i < L.length; i += 4) {
      if (Math.max(L[i], L[i + 2]) < vx0 || Math.min(L[i], L[i + 2]) > vx1 || Math.max(L[i + 1], L[i + 3]) < vy0 || Math.min(L[i + 1], L[i + 3]) > vy1) continue;
      g.moveTo(L[i], L[i + 1]); g.lineTo(L[i + 2], L[i + 3]);
    }
    g.lineWidth = 4; g.strokeStyle = OUT; g.lineCap = 'round'; g.stroke();
    // the aim guide
    const me = r.me;
    if (r.phase === 'play' && !me.dead && !me.squid) {
      const a = me.aim, ox = me.x + Math.cos(a) * 18 + me.face * 5, oy = me.y - 15 + Math.sin(a) * 18;
      g.fillStyle = INK_LIGHT[me.team];
      for (let i = 1; i <= 7; i++) { const tt = i * .045; g.globalAlpha = .55 - i * .06; g.beginPath(); g.arc(ox + Math.cos(a) * MAIN.v * tt, oy + Math.sin(a) * MAIN.v * tt + GB * tt * tt / 2, 2.6, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    // characters
    for (const c of r.chars.values()) {
      if (c.dead || c.x < vx0 - 40 || c.x > vx1 + 40 || c.y < vy0 - 40 || c.y > vy1 + 60) continue;
      const friend = c.team === me.team;
      let alpha = c.inv > 0 ? (Math.sin(r.t * 30) > 0 ? .45 : 1) : 1;
      if (c.squid) {
        if (c.hidden) drawSquid(g, c, r.t, friend ? .8 : (Math.abs(c.vx) > 150 ? .16 : .05), true);
        else drawSquid(g, c, r.t, alpha);
      } else drawKid(g, c, r.t, alpha);
      if (c !== me && (!c.hidden || friend)) {
        g.font = "700 12px 'Rubik', sans-serif"; g.textAlign = 'center'; g.lineJoin = 'round';
        g.lineWidth = 3.5; g.strokeStyle = OUT; g.strokeText(c.name, c.x, c.y - (c.squid ? 30 : 52));
        g.fillStyle = friend ? '#fff' : INK_LIGHT[c.team]; g.fillText(c.name, c.x, c.y - (c.squid ? 30 : 52));
        if (!friend && c.hp < 100) { g.fillStyle = OUT; g.fillRect(c.x - 16, c.y - (c.squid ? 26 : 48), 32, 5); g.fillStyle = INK[c.team]; g.fillRect(c.x - 15, c.y - (c.squid ? 25 : 47), 30 * c.hp / 100, 3); }
      }
    }
    if (r.phase === 'count' && !me.dead) {
      const bob = Math.sin(r.t * 6) * 4;
      g.fillStyle = '#fff'; g.strokeStyle = OUT; g.lineWidth = 3;
      g.beginPath(); g.moveTo(me.x - 9, me.y - 72 + bob); g.lineTo(me.x + 9, me.y - 72 + bob); g.lineTo(me.x, me.y - 60 + bob); g.closePath(); g.fill(); g.stroke();
      txt(g, 'toi', me.x, me.y - 86 + bob, 16, INK_LIGHT[me.team]);
    }
    // blobs
    for (const b of r.blobs) {
      g.save(); g.translate(b.x, b.y);
      if (b.k) {
        g.fillStyle = INK[b.team]; g.strokeStyle = OUT; g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-3, -3, 3, 0, 7); g.fill();
        g.fillStyle = '#fff4a0'; g.beginPath(); g.arc(Math.sin(r.t * 40) * 2, -13, 2.5 + Math.random() * 1.5, 0, 7); g.fill();
      } else {
        g.rotate(Math.atan2(b.vy, b.vx));
        const len = 6 + Math.min(8, Math.hypot(b.vx, b.vy) * .007);
        g.fillStyle = INK[b.team]; g.strokeStyle = OUT; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(0, 0, len, 5, 0, 0, 7); g.fill(); g.stroke();
        g.fillStyle = INK_LIGHT[b.team]; g.beginPath(); g.arc(len * .3, -1.5, 1.8, 0, 7); g.fill();
      }
      g.restore();
    }
    // particles
    for (const p of r.parts) {
      const f = 1 - p.life / p.max;
      if (p.k === 1) { g.strokeStyle = p.c; g.globalAlpha = f; g.lineWidth = 6 * f; g.beginPath(); g.arc(p.x, p.y, p.r * (1.1 - f * .7), 0, 7); g.stroke(); }
      else { g.fillStyle = p.c; g.globalAlpha = p.k === 2 ? f : Math.min(1, f * 2); g.beginPath(); g.arc(p.x, p.y, p.r * (p.k === 0 ? .6 + f * .4 : 1), 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud(g, cw, ch);
    const cur = r.phase === 'play' && !me.dead && r.mouse.active ? 'none' : 'default';
    if (r.cur !== cur) r.cv.style.cursor = r.cur = cur;
  }

  function hud(g, cw, ch) {
    const r = run, me = r.me, s = Math.min(1.2, Math.max(.7, Math.min(cw / 1100, ch / 640)));
    // hurt: the screen edges stain with the enemy's ink
    const hurtA = Math.max((100 - me.hp) / 100 * .55, r.hurtFx * .35);
    if (hurtA > .02 && !me.dead) {
      const gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * .3, cw / 2, ch / 2, Math.max(cw, ch) * .7);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, INK[1 - me.team]);
      g.globalAlpha = hurtA; g.fillStyle = gr; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1;
    }
    // timer, rosters, turf bar
    const left = r.phase === 'count' ? DUR : r.left, mm = Math.floor(Math.ceil(left) / 60), ss = Math.ceil(left) % 60;
    txt(g, `${mm}:${String(ss).padStart(2, '0')}`, cw / 2, 30 * s, 34 * s, left <= 10 ? (Math.sin(r.t * 12) > 0 ? '#ff3d5e' : '#fff') : '#fff');
    for (const team of [0, 1]) {
      const list = [...r.chars.values()].filter((c) => c.team === team).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      list.forEach((c, i) => {
        const x = cw / 2 + (team ? 1 : -1) * (68 + i * 28) * s, y = 30 * s;
        g.beginPath(); g.arc(x, y, 11 * s, 0, 7); g.fillStyle = c.dead ? '#4a4458' : INK[team]; g.fill();
        g.lineWidth = 3; g.strokeStyle = c === me ? '#fff' : OUT; g.stroke();
        if (c.dead) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 5 * s, y - 5 * s); g.lineTo(x + 5 * s, y + 5 * s); g.moveTo(x + 5 * s, y - 5 * s); g.lineTo(x - 5 * s, y + 5 * s); g.stroke(); }
        else { g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 3 * s, y - 1, 2.4 * s, 0, 7); g.arc(x + 3 * s, y - 1, 2.4 * s, 0, 7); g.fill(); }
      });
    }
    const bw = Math.min(420, cw * .5) * s, bx = cw / 2 - bw / 2, by = 54 * s, bh = 14 * s, po = share(0), pb = share(1);
    rrect(g, bx, by, bw, bh, bh / 2); g.fillStyle = 'rgba(20,14,35,.75)'; g.fill();
    g.save(); rrect(g, bx, by, bw, bh, bh / 2); g.clip();
    g.fillStyle = INK[0]; g.fillRect(bx, by, bw * po / 100, bh);
    g.fillStyle = INK[1]; g.fillRect(bx + bw - bw * pb / 100, by, bw * pb / 100, bh);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(bx, by + 2, bw, bh * .25);
    g.restore();
    rrect(g, bx, by, bw, bh, bh / 2); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    txt(g, pct(po) + ' %', bx - 8, by + bh / 2, 16 * s, INK_LIGHT[0], 'right');
    txt(g, pct(pb) + ' %', bx + bw + 8, by + bh / 2, 16 * s, INK_LIGHT[1], 'left');
    // kill feed
    g.font = `700 ${13 * s}px 'Rubik', sans-serif`; g.textBaseline = 'middle';
    r.feed.forEach((f, i) => {
      if (f.t > 6) return;
      const a = Math.min(1, (6 - f.t) * 2), y = (96 + i * 26) * s, wa = g.measureText(f.a).width, wb = g.measureText(f.b).width, w = wa + wb + 44 * s;
      const x = cw - 14 - w;
      g.globalAlpha = a;
      rrect(g, x, y - 11 * s, w, 22 * s, 11 * s); g.fillStyle = f.me ? 'rgba(255,255,255,.9)' : 'rgba(20,14,35,.8)'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      g.textAlign = 'left'; g.fillStyle = INK[f.at]; g.fillText(f.a, x + 10 * s, y + 1);
      g.fillStyle = INK[f.at]; splatPath(g, x + 20 * s + wa + 2, y, 6 * s, rng(i + 7)); g.fill();
      g.fillStyle = INK[f.bt]; g.fillText(f.b, x + 34 * s + wa, y + 1);
      g.globalAlpha = 1;
    });
    // ink tank & special
    const tx = 22 * s, th = 120 * s, tw = 40 * s, ty = ch - 22 * s - th;
    rrect(g, tx, ty, tw, th, 12 * s); g.fillStyle = 'rgba(230,240,255,.25)'; g.fill();
    g.save(); rrect(g, tx, ty, tw, th, 12 * s); g.clip();
    const lvl = ty + th * (1 - me.ink);
    g.fillStyle = me.ink < .15 && Math.sin(r.t * 14) > 0 ? '#ff3d5e' : INK[me.team];
    g.beginPath(); g.moveTo(tx, lvl);
    for (let x = 0; x <= tw; x += 4) g.lineTo(tx + x, lvl + Math.sin(r.t * 6 + x * .25) * 2.5 * s);
    g.lineTo(tx + tw, ty + th); g.lineTo(tx, ty + th); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(tx + 6 * s, ty + 8 * s, 5 * s, th - 16 * s);
    g.restore();
    rrect(g, tx, ty, tw, th, 12 * s); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
    txt(g, 'encre', tx + tw / 2, ty - 12 * s, 13 * s, '#fff');
    // health pips
    const hx = tx + tw + 14 * s, hw = 12 * s;
    rrect(g, hx, ty + th - 80 * s, hw, 80 * s, 5 * s); g.fillStyle = 'rgba(20,14,35,.7)'; g.fill();
    g.fillStyle = me.hp < 40 ? '#ff3d5e' : '#7dff8a'; rrect(g, hx + 2, ty + th - 2 - 76 * s * me.hp / 100, hw - 4, 76 * s * me.hp / 100, 4 * s); g.fill();
    rrect(g, hx, ty + th - 80 * s, hw, 80 * s, 5 * s); g.lineWidth = 3; g.stroke();
    const cx = hx + hw + 46 * s, cy = ty + th - 38 * s, cr = 32 * s, full = me.sp >= 1, pulse = full ? 1 + Math.sin(r.t * 8) * .08 : 1;
    g.beginPath(); g.arc(cx, cy, cr * pulse, 0, 7); g.fillStyle = full ? INK[me.team] : 'rgba(20,14,35,.75)'; g.fill();
    g.lineWidth = 8 * s; g.strokeStyle = INK_LIGHT[me.team];
    if (!full) { g.beginPath(); g.arc(cx, cy, cr - 7 * s, -Math.PI / 2, -Math.PI / 2 + me.sp * Math.PI * 2); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, cr * pulse, 0, 7); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
    txt(g, full ? 'e' : Math.floor(me.sp * 100) + '', cx, cy, (full ? 26 : 15) * s, '#fff');
    txt(g, 'déluge', cx, cy + cr + 12 * s, 12 * s, full ? '#fff' : '#bbb');
    // the reticle
    const m = r.mouse;
    if (m.active && r.phase === 'play' && !me.dead) {
      g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.stroke();
      g.strokeStyle = r.hitT > 0 ? '#fff' : INK_LIGHT[me.team]; g.lineWidth = 2.5; g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.stroke();
      if (r.hitT > 0) { g.beginPath(); for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.moveTo(m.x + dx * 14, m.y + dy * 14); g.lineTo(m.x + dx * 20, m.y + dy * 20); } g.stroke(); }
    }
    const msx = (me.x - r.cam.x) * r.z + cw / 2, msy = (me.y - r.cam.y) * r.z + ch / 2;
    if (r.dryT > 0 && !me.dead) txt(g, 'plus d\'encre ! nage (shift)', msx, msy - 80 * r.z, 16 * s, '#ff3d5e');
    if (r.banner) { const b = r.banner, k = Math.min(1, (1.6 - b.t) * 8); txt(g, b.s, cw / 2, ch * .3, 40 * s * (.6 + .4 * Math.min(1, k)), INK_LIGHT[b.c], 'center', -.04); }
    // splatted
    if (me.dead && r.phase === 'play') {
      g.fillStyle = 'rgba(15,10,30,.45)'; g.fillRect(0, 0, cw, ch);
      txt(g, 'éclaboussé !', cw / 2, ch * .42, 54 * s, INK[1 - me.team], 'center', -.05);
      txt(g, `retour dans ${Math.max(1, Math.ceil(me.respT))}`, cw / 2, ch * .42 + 54 * s, 22 * s, '#fff');
    }
    if (r.phase === 'count') {
      const n = Math.ceil(r.count), f = r.count - Math.floor(r.count);
      txt(g, `équipe ${TEAM[me.team]}`, cw / 2, ch * .26, 30 * s, INK_LIGHT[me.team]);
      if (n <= 3) txt(g, String(n), cw / 2, ch * .45, (70 + f * 60) * s, '#fff');
      g.font = `600 ${15 * s}px 'Rubik', sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText('zqsd · espace sauter · clic ou j tirer · shift nager (et grimper) · e déluge', cw / 2, ch - 30 * s);
    }
    if (r.phase === 'judge') judge(g, cw, ch, s);
  }

  function judge(g, cw, ch, s) {
    const r = run, t = r.judgeT;
    g.fillStyle = `rgba(15,10,30,${Math.min(.6, t * .8)})`; g.fillRect(0, 0, cw, ch);
    if (t < 1.4) { const k = Math.min(1, t * 5); txt(g, 'fin !', cw / 2, ch * .45, 110 * s * (.5 + .5 * k), '#fff', 'center', -.08 + Math.sin(t * 20) * .02 * (1 - k)); return; }
    const [o, b] = r.final, p = Math.min(1, (t - 1.4) / 2.2), e = 1 - (1 - p) ** 3;
    txt(g, 'le juge compte…', cw / 2, ch * .2, 34 * s, '#fff');
    const bw = Math.min(560, cw * .7), bh = 44 * s, bx = cw / 2 - bw / 2;
    [[0, o], [1, b]].forEach(([k, v], i) => {
      const y = ch * .33 + i * (bh + 26 * s);
      rrect(g, bx, y, bw, bh, 14 * s); g.fillStyle = 'rgba(20,14,35,.85)'; g.fill();
      g.save(); rrect(g, bx, y, bw, bh, 14 * s); g.clip();
      g.fillStyle = INK[k]; g.fillRect(bx, y, bw * v / 100 * e, bh);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(bx, y + 4, bw, bh * .22);
      g.restore(); rrect(g, bx, y, bw, bh, 14 * s); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
      txt(g, TEAM[k], bx + 14 * s, y + bh / 2, 20 * s, '#fff', 'left');
      txt(g, pct(v * e) + ' %', bx + bw - 14 * s, y + bh / 2, 22 * s, '#fff', 'right');
    });
    if (t >= 4) {
      const k = Math.min(1, (t - 4) / .35), c = r.win < 0 ? r.me.team : r.win;
      g.save(); g.translate(cw / 2, ch * .62); g.scale(k, k); g.rotate(.2);
      g.fillStyle = OUT; splatPath(g, 6, 8, Math.min(cw, ch) * .32, rng(r.seed + 1)); g.fill();
      g.fillStyle = INK[c]; splatPath(g, 0, 0, Math.min(cw, ch) * .32, rng(r.seed + 1)); g.fill();
      g.restore();
      const mine = r.win === r.me.team || r.win < 0;
      txt(g, r.win < 0 ? 'égalité !' : `victoire des ${TEAM[r.win]} !`, cw / 2, ch * .6, 46 * s * (.4 + .6 * k), '#fff', 'center', -.05);
      txt(g, mine ? 'bien joué !' : 'la prochaine fois…', cw / 2, ch * .6 + 52 * s, 22 * s, mine ? '#fff4a0' : '#ddd');
    }
  }

  // ---------- the frame ----------
  const api = {
    start({ seed = 1, humans = [], hostId, meId, send } = {}) {
      if (run) api.stop();
      sfx.init();
      const lv = createLevel(seed);
      const cv = document.createElement('canvas');
      cv.id = 'encre';
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:15;pointer-events:auto;display:block;background:#130e2a';
      document.body.appendChild(cv);
      place(cv);
      if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
      run = { seed, lv, cv, g: cv.getContext('2d'), bg: createBackdrop(seed), humans, hostId, meId, host: hostId === meId, send: send ?? (() => {}),
        chars: new Map(), blobs: [], parts: [], feed: [], out: [], gone: new Set(), fronts: [{ x: 0, t: 0 }, { x: 0, t: 0 }],
        phase: 'count', count: COUNT, left: DUR, t: 0, judgeT: 0, sendT: 0, chunkT: 1, chunkK: -1, shake: 0, dryT: 0, hitT: 0, hurtFx: 0,
        cam: { x: 0, y: 0 }, mouse: { x: 0, y: 0, down: false, right: false, active: false }, inp: {}, cw: 0, ch: 0, dpr: 0, z: 1, ended: false };
      // each team's base starts inked, somewhere to refill
      for (let i = 1; i <= 8; i++) { lv.splat(i * T + 16, (H - 6) * T, 24, 1); lv.splat(lv.wpx - i * T - 16, (H - 6) * T, 24, 2); }
      const cnt = [0, 0];
      humans.forEach((h, i) => {
        const team = i % 2; cnt[team]++;
        const c = makeChar(h.id, h.me ? 'toi' : h.name, team, { remote: h.id !== meId });
        if (c.remote) { c.tx = c.x; c.ty = c.y; }
        run.chars.set(h.id, c);
      });
      run.me = run.chars.get(meId) ?? [...run.chars.values()].find((c) => !c.remote);
      if (run.host) {
        let n = 0;
        for (const team of [0, 1]) for (let k = cnt[team]; k < 4; k++, n++) run.chars.set('bot' + n, makeChar('bot' + n, BOTN[n % BOTN.length], team, { bot: true }));
      }
      fit();
      run.cam.x = run.me.x; run.cam.y = run.me.y - 70;
      const m = run.mouse;
      const pos = (e) => { m.x = e.clientX - (rect?.x ?? 0); m.y = e.clientY - (rect?.y ?? 0); m.active = true; };
      const L = run.listeners = [
        [cv, 'mousemove', pos],
        [cv, 'mousedown', (e) => { pos(e); sfx.init(); if (e.button === 0) m.down = true; if (e.button === 2) m.right = true; e.preventDefault(); }],
        [window, 'mouseup', (e) => { if (e.button === 0) m.down = false; if (e.button === 2) m.right = false; }],
        [cv, 'contextmenu', (e) => e.preventDefault()],
        [window, 'blur', () => { m.down = m.right = false; }],
      ];
      for (const [el, ev, f] of L) el.addEventListener(ev, f);
    },
    update(dt, keys = new Set()) {
      if (!run) return;
      dt = Math.min(Math.max(dt, 0), 1 / 20);
      // a screen game: the mouse must stay free to aim
      if (document.pointerLockElement) document.exitPointerLock?.();
      fit();
      const n = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < n && run && !run.ended; i++) step(dt / n, keys);
      if (run && !run.ended) render();
    },
    stop() {
      if (!run) return;
      for (const [el, ev, f] of run.listeners || []) el.removeEventListener(ev, f);
      run.cv.remove();
      run = null;
      sfx.pause();
    },
    respawn() {
      // r: a super jump back to the base
      if (!run || run.phase !== 'play' || run.me.dead) return;
      const me = run.me;
      burst(me.x, me.y - 18, me.team, 14, 400, 2.5);
      respawnChar(me); me.hp = Math.max(me.hp, 60);
      run.cam.x = me.x;
    },
    onFx(peerId, fx) { if (run && fx) netRecv(peerId, fx); },
    peerLeft(id) {
      if (!run) return;
      run.gone.add(id);
      run.chars.delete(id);
      if (id === run.hostId) {
        // the next one in line runs the bots
        const next = run.humans.find((h) => !run.gone.has(h.id));
        run.hostId = next?.id;
        if (run.hostId === run.meId) { run.host = true; for (const c of run.chars.values()) if (c.bot) { c.remote = false; c.x = c.tx; c.y = c.ty; } }
      }
    },
    setRect(r) { rect = r; place(run?.cv); },
    hud() { return { hidden: true }; },
    set onEnd(f) { onEnd = f; },
    // for the tests: run the match fast, optionally with a bot at my controls
    _dbg: {
      get run() { return run; },
      sim(sec, auto = true) {
        if (!run) return;
        run.auto = auto;
        for (let i = 0; i < sec * 60 && run && !run.ended; i++) step(1 / 60, new Set());
        if (run && !run.ended) render();
      },
    },
  };
  return api;
}
