// nes.js, "super creuseur": a 2D side-scrolling platformer on its own 256×240 canvas, first to the flag wins.
// Everyone simulates their own digger and shares position, blocks, coins and fallen enemies; in solo, ghost rivals race you.
import { buildArt, hero, text, textW, PAL, canvas, hexOf, shade } from './nes-art.js';
import { buildLevel, rng, TS, ROWS, GROUND, SOLID, EMPTY, DIRT, BRICK, QBLK, USED, STONE, PIPE_TL, PIPE_TR, PIPE_L, PIPE_R, COIN } from './nes-level.js';
import { createSfx } from './nes-sfx.js';

const W = 256, H = 240, STEP = 1 / 60, COUNT = 3, UNITS = 300, UNIT = .6, SEND = 1 / 15, DONE = 10;
const RIVALS = [
  { name: 'pioche', color: 0x3cbcfc, speed: 1.32 },
  { name: 'bêche', color: 0xf878f8, speed: 1.06 },
  { name: 'râteau', color: 0x80d010, speed: .86 },
];
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const ord = (n) => n === 1 ? '1re' : n + 'e';

export function createNes() {
  let onEnd = () => {}, running = false, ended = true;
  let A = null, cv = null, cx = null, buf = null, bx = null, over = null, view = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let L, send, meId, seed, me, meName, meColor, remotes, ghosts, enemies, spawnIdx, killed, items, shots, parts, bumps, plats;
  let camX, clock, phase, phaseT, acc, prev, score, coins, finOrder, sendT, frame, cp, cpTaken, doneT, world, flagY, lastBeep;
  const sfx = createSfx();

  // ---------- tiles ----------
  const tile = (tx, ty) => (tx < 0 || tx >= L.len || ty < 0 || ty >= ROWS) ? EMPTY : L.tiles[ty * L.W + tx];
  const solid = (tx, ty) => tx < 0 || (ty >= 0 && ty < ROWS && tx < L.len && SOLID[L.tiles[ty * L.W + tx]] === 1);
  const groundTop = (tx) => { for (let ty = 0; ty < ROWS; ty++) if (solid(tx, ty)) return ty; return -1; };

  // ---------- bodies ----------
  function newChar(x, color) {
    return { x, y: (GROUND * TS) - 14, w: 12, h: 14, vx: 0, vy: 0, pow: 0, face: 1, ground: true, coyote: 0, jbuf: 0, fast: false, airMax: 1.5, jumped: false, skid: false, animT: 0, inv: 0, dead: 0, grow: 0, plat: null, goal: null, hidden: false, color };
  }
  function setPow(c, p) {
    if (p > 0 && !c.pow) { c.y -= 12; c.h = 26; } else if (!p && c.pow) { c.y += 12; c.h = 14; }
    c.pow = p;
  }
  function moveX(c, dx, wall = false) {
    c.x += dx;
    if (wall && c.x < camX) { c.x = camX; if (c.vx < 0) c.vx = 0; }
    const t = Math.floor(c.y / TS), b = Math.floor((c.y + c.h - 1) / TS);
    if (dx > 0) { const tx = Math.floor((c.x + c.w - 1) / TS); for (let ty = t; ty <= b; ty++) if (solid(tx, ty)) { c.x = tx * TS - c.w; return true; } }
    else if (dx < 0) { const tx = Math.floor(c.x / TS); for (let ty = t; ty <= b; ty++) if (solid(tx, ty)) { c.x = (tx + 1) * TS; return true; } }
    return false;
  }
  // returns the tile hit by the head, if any
  function moveY(c, dy, nudge = false) {
    const prevBottom = c.y + c.h;
    c.y += dy;
    const l = Math.floor(c.x / TS), r = Math.floor((c.x + c.w - 1) / TS);
    c.ground = false;
    let head = null;
    if (dy > 0) {
      const ty = Math.floor((c.y + c.h) / TS);
      if (ty >= 0) for (let tx = l; tx <= r; tx++) if (solid(tx, ty)) { c.y = ty * TS - c.h; c.vy = 0; c.ground = true; break; }
      if (!c.ground) for (const p of plats) {
        if (c.x + c.w > p.cx && c.x < p.cx + p.w && prevBottom <= p.cy + 2 && c.y + c.h >= p.cy) { c.y = p.cy - c.h; c.vy = 0; c.ground = true; c.plat = p; break; }
      }
    } else if (dy < 0) {
      const ty = Math.floor(c.y / TS);
      const hits = [];
      for (let tx = l; tx <= r; tx++) if (solid(tx, ty)) hits.push(tx);
      if (hits.length) {
        // clip a corner by a few pixels: slide past it rather than bonk
        if (nudge && hits.length === 1) {
          const tx = hits[0];
          if (tx === l && (tx + 1) * TS - c.x <= 4 && !solid(tx + 1, ty)) { c.x = (tx + 1) * TS; return null; }
          if (tx === r && c.x + c.w - tx * TS <= 4 && !solid(tx - 1, ty)) { c.x = tx * TS - c.w; return null; }
        }
        c.y = (ty + 1) * TS; c.vy = Math.max(c.vy, .5);
        const mid = (c.x + c.w / 2) / TS;
        head = { tx: hits.reduce((a, b) => Math.abs(b + .5 - mid) < Math.abs(a + .5 - mid) ? b : a), ty };
      }
    }
    if (c.ground && c.plat && !(c.x + c.w > c.plat.cx && c.x < c.plat.cx + c.plat.w && Math.abs(c.y + c.h - c.plat.cy) < 1)) c.plat = null;
    if (!c.ground) c.plat = null;
    return head;
  }
  // one frame of platformer physics: walk/run with momentum, skids, coyote time, buffered variable jumps
  function physics(c, inp, local) {
    if (c.plat) { moveX(c, c.plat.dx, local); c.y += c.plat.dy; }
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), maxv = inp.run ? 2.5 : 1.5;
    c.skid = false;
    if (c.ground) {
      if (dir) {
        if (c.vx * dir < 0 && Math.abs(c.vx) > .4) { c.vx += dir * .12; c.skid = true; }
        else {
          c.face = dir;
          const sp = c.vx * dir;
          if (sp < maxv) c.vx = dir * Math.min(maxv, sp + (inp.run ? .06 : .04));
          else c.vx = dir * Math.max(maxv, sp - .05);
        }
      } else { const s = Math.sign(c.vx); c.vx -= s * .055; if (Math.sign(c.vx) !== s) c.vx = 0; }
    } else if (dir) {
      c.vx += dir * (c.vx * dir < 0 ? .06 : .04);
      const cap = Math.max(1.5, c.airMax);
      if (Math.abs(c.vx) > cap) c.vx = Math.sign(c.vx) * cap;
    }
    if (inp.jumpEdge) c.jbuf = 7; else if (c.jbuf) c.jbuf--;
    let jumped = false;
    if (c.jbuf && (c.ground || c.coyote > 0)) {
      c.jbuf = 0; c.coyote = 0; c.fast = Math.abs(c.vx) > 2.1;
      c.vy = c.fast ? -5 : Math.abs(c.vx) > 1 ? -4.4 : -4.2;
      c.ground = false; c.plat = null; c.airMax = Math.max(1.5, Math.abs(c.vx)); c.jumped = true; jumped = true;
    }
    c.vy = Math.min(4.5, c.vy + (inp.jump && c.vy < 0 ? (c.fast ? .16 : .125) : (c.fast ? .56 : .44)));
    if (moveX(c, c.vx, local)) c.vx = 0;
    const was = c.ground;
    const head = moveY(c, c.vy, local);
    if (c.ground) { c.jumped = false; c.coyote = 0; c.airMax = 1.5; }
    else if (was && !jumped) { c.coyote = 6; c.airMax = Math.max(1.5, Math.abs(c.vx)); }
    else if (c.coyote) c.coyote--;
    c.animT += Math.abs(c.vx) * .1;
    return { head, jumped };
  }
  const anim = (c) => c.dead ? 6 : c.goal && c.goal.st === 'slide' ? 4 : !c.ground && c.jumped ? 4 : c.skid ? 5 : Math.abs(c.vx) < .15 ? 0 : 1 + Math.floor(c.animT) % 3;
  const over2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- life cycle ----------
  function start({ seed: sd = 1, humans = [], hostId, meId: id = 'me', send: s } = {}) {
    stop();
    A = A || buildArt();
    seed = sd; meId = id; send = s || (() => {});
    L = buildLevel(seed);
    world = `${1 + (seed % 8)}-${1 + ((seed >> 3) % 4)}`;
    const mine = humans.find((h) => h.me) || { name: 'toi', color: 0xc8581a };
    meName = mine.name === 'toi' ? 'creuseur' : mine.name; meColor = mine.color ?? 0xc8581a;
    const slot = Math.max(0, humans.indexOf(mine));
    me = newChar(28 + (slot % 4) * 14, meColor);
    remotes = new Map();
    humans.forEach((h, n) => { if (!h.me) remotes.set(h.id, { id: h.id, name: h.name, color: h.color, snaps: [], x: 28 + (n % 4) * 14, y: GROUND * TS - 14, a: 0, f: 1, p: 0, hid: 0, fin: null, order: 0 }); });
    ghosts = [];
    if (humans.length <= 1) {
      const R = rng(seed ^ 0x9e3779b9);
      RIVALS.forEach((r, n) => {
        const c = newChar(50 + n * 20, r.color);
        ghosts.push({ ...r, tag: n, speed: r.speed * (.95 + R() * .1), c, fin: null, order: 0, hold: 0, stuck: 0, lastX: c.x, respawn: 0, hid: false });
      });
    }
    enemies = []; spawnIdx = 0; killed = new Set(); items = []; shots = []; parts = []; bumps = new Map();
    plats = L.plats.map((p) => ({ ...p, cx: p.x, cy: p.y, dx: 0, dy: 0 }));
    camX = 0; clock = 0; phase = 'count'; phaseT = 0; acc = 0; prev = { jump: false, run: false };
    score = 0; coins = 0; finOrder = 0; sendT = 0; frame = 0; cp = L.checkpoints[0]; cpTaken = 0; doneT = 0; flagY = 3 * TS + 8; lastBeep = 4;
    cv = document.createElement('canvas');
    cv.id = 'nes';
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:15;pointer-events:auto;image-rendering:pixelated;background:#07060a;cursor:none';
    document.body.appendChild(cv);
    place();
    cx = cv.getContext('2d');
    [buf, bx] = canvas(W, H);
    sfx.init();
    running = true; ended = false;
    render();
  }
  function stop() {
    running = false;
    if (cv) { cv.remove(); cv = null; cx = null; }
    over = null;
    sfx.close();
  }
  function end(res) {
    if (ended) return;
    ended = true;
    onEnd(res);
  }

  // ---------- the loop ----------
  function update(dt, keys) {
    if (!running) return;
    dt = Math.min(dt, .1);
    sfx.init();
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = {
      l: k('ArrowLeft', 'KeyA'), r: k('ArrowRight', 'KeyD'),
      jump: k('Space', 'KeyW', 'ArrowUp', 'KeyZ'),
      run: k('ShiftLeft', 'ShiftRight', 'KeyK', 'KeyJ', 'KeyX'),
    };
    inp.jumpEdge = inp.jump && !prev.jump; inp.fire = inp.run && !prev.run;
    prev = { jump: inp.jump, run: inp.run };
    acc += dt;
    while (acc >= STEP) { acc -= STEP; tick(inp); inp.jumpEdge = false; inp.fire = false; if (!running) return; }
    sfx.tick();
    sendT += dt;
    if (sendT >= SEND) {
      sendT = 0;
      send({ t: 's', x: Math.round(me.x), y: Math.round(me.y), a: anim(me), f: me.face, p: me.pow, h: me.hidden ? 1 : 0 });
    }
    render();
  }
  const raceTime = () => Math.max(0, clock - COUNT);
  function tick(inp) {
    frame++;
    clock += STEP; phaseT += STEP;
    const t = clock - COUNT;
    for (const p of plats) {
      const k = (1 - Math.cos((Math.max(0, t) / p.per + p.ph) * Math.PI * 2)) / 2;
      const nx = p.x + p.ax * k, ny = p.y + p.ay * k;
      p.dx = nx - p.cx; p.dy = ny - p.cy; p.cx = nx; p.cy = ny;
    }
    if (phase === 'count') {
      const n = Math.ceil(COUNT - clock);
      if (n !== lastBeep && n > 0) { lastBeep = n; sfx.beep(false); }
      if (clock >= COUNT) { phase = 'run'; phaseT = 0; sfx.beep(true); sfx.music(true); }
      physics(me, {}, true);
      ghosts.forEach((g) => physics(g.c, {}, false));
      return;
    }
    if (phase === 'run') {
      stepMe(inp);
      if (t >= UNITS * UNIT && !me.goal) { phase = 'timeup'; phaseT = 0; sfx.music(false); sfx.time(); }
      else if (t >= (UNITS - 100) * UNIT) sfx.hurry(true);
    } else if (phase === 'goal' || phase === 'done') {
      flagY = Math.min((GROUND - 1) * TS - 14, flagY + 2);
      stepGoal(me);
      if (me.goal.st === 'in' && phase === 'goal') { phase = 'done'; }
      doneT += STEP;
      const all = [...remotes.values(), ...ghosts].every((r) => r.fin != null);
      if (doneT >= DONE || (all && doneT >= 5)) finish();
    } else if (phase === 'timeup') {
      if (phaseT > 3.5) {
        const of = racers().length;
        end({ place: of, of, time: UNITS * UNIT, text: `temps écoulé · pas de drapeau · ${coins} pièces` });
        return;
      }
    }
    stepGhosts();
    stepEnemies();
    stepItems();
    stepParts();
    for (const [i, f] of bumps) if (f >= 10) bumps.delete(i); else bumps.set(i, f + 1);
    // the camera only goes forward, like on the NES
    const target = Math.min(L.len * TS - W, me.x + me.w / 2 - W * .42);
    if (!me.dead) camX = Math.max(camX, Math.round(target));
  }
  function finish() {
    const of = racers().length;
    const place = Math.min(of, me.order);
    end({ place, of, time: Math.round(me.fin * 10) / 10, text: `${ord(place)} place sur ${of} en ${fmt(me.fin)} · ${coins} pièce${coins > 1 ? 's' : ''}` });
  }
  const racers = () => [{ fin: me.fin }, ...remotes.values(), ...ghosts];

  // ---------- me ----------
  function stepMe(inp) {
    const c = me;
    if (c.inv) c.inv--;
    if (c.dead) {
      c.dead++;
      if (c.dead > 30) { c.vy = Math.min(4, c.vy + .25); c.y += c.vy; }
      if (c.dead > 150) respawnAt();
      return;
    }
    if (c.grow) { c.grow--; return; }
    const { head, jumped } = physics(c, inp, true);
    if (jumped) sfx.jump(c.pow > 0);
    if (head) hitBlock(head.tx, head.ty);
    if (inp.fire && c.pow === 2 && shots.length < 2) {
      shots.push({ x: c.face > 0 ? c.x + c.w : c.x - 8, y: c.y + 6, vx: 4 * c.face, vy: 2, t: 0 });
      sfx.fire();
    }
    // coins as tiles
    const l = Math.floor(c.x / TS), r = Math.floor((c.x + c.w - 1) / TS), tt = Math.floor(c.y / TS), b = Math.floor((c.y + c.h - 1) / TS);
    for (let ty = tt; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (tile(tx, ty) === COIN) takeCoin(tx, ty);
    // checkpoints
    for (let n = cpTaken + 1; n < L.checkpoints.length; n++) if (c.x > L.checkpoints[n]) { cpTaken = n; cp = L.checkpoints[n]; pop('relais !', c.x, c.y - 10); sfx.power(); }
    // bounce on the heads of the others
    if (c.vy > 0) for (const o of others()) {
      if (Math.abs(o.x - c.x) < 12 && c.y + c.h >= o.y && c.y + c.h - c.vy <= o.y + 3) { c.y = o.y - c.h; c.vy = prev.jump ? -4.5 : -3.2; c.fast = false; c.jumped = true; sfx.bop(); break; }
    }
    // the flag
    if (c.x + c.w >= L.flagX * TS && c.y < (GROUND) * TS) {
      c.fin = raceTime(); c.order = ++finOrder;
      const h = Math.max(0, (GROUND - 1) * TS - (c.y + c.h));
      const bonus = h > 120 ? 5000 : h > 90 ? 2000 : h > 60 ? 800 : h > 30 ? 400 : 100;
      score += bonus; pop(String(bonus), c.x + 12, c.y);
      c.goal = { st: 'slide', t: 0 }; c.x = L.flagX * TS + 8 - c.w; c.vx = c.vy = 0; c.face = 1;
      phase = 'goal'; phaseT = 0; doneT = 0;
      sfx.flag();
      send({ t: 'fin', time: Math.round(c.fin * 10) / 10 });
      return;
    }
    if (c.y > H + 8) die(false);
    if (c.x < camX) c.x = camX;
    hitEnemies(c);
  }
  // the end of the run: slide down the pole, hop off, walk into the castle
  function stepGoal(c) {
    const g = c.goal;
    g.t++;
    const bottom = (GROUND - 1) * TS;
    if (g.st === 'slide') {
      c.y = Math.min(bottom - c.h, c.y + 2);
      if (c.y >= bottom - c.h && (c !== me || flagY >= bottom - 14) && g.t > 40) { g.st = 'walk'; c.x = L.flagX * TS + 10; c.vy = -2; }
    } else if (g.st === 'walk') {
      c.vx = 1; c.face = 1; c.animT += .12; c.x += c.vx;
      c.vy = Math.min(4, c.vy + .3); moveY(c, c.vy);
      if (c.x + c.w / 2 >= L.castleX * TS + 40) { g.st = 'in'; c.hidden = true; }
    }
  }
  function die(hop = true) {
    if (me.dead) return;
    me.dead = 1; me.vx = 0; me.vy = hop ? -4 : 0; me.goal = null;
    if (!hop) me.dead = 60;
    setPow(me, 0);
    sfx.die();
  }
  function hurt() {
    if (me.inv || me.dead || me.grow) return;
    if (me.pow) { setPow(me, 0); me.inv = 120; sfx.shrink(); return; }
    die(true);
  }
  function respawnAt() {
    const tx = Math.floor(cp / TS);
    me.x = cp; me.y = (groundTop(tx) || GROUND) * TS - 14; me.h = 14; me.pow = 0;
    me.vx = me.vy = 0; me.dead = 0; me.inv = 120; me.jumped = false; me.plat = null;
    camX = Math.max(0, Math.min(L.len * TS - W, cp - 64));
    // enemies left behind by the camera come back later
    enemies = enemies.filter((e) => e.x > camX + W + 32 || killed.has(e.i));
    spawnIdx = L.enemies.findIndex((e) => e.x > camX + W + 16 && !enemies.some((x) => x.i === e.i));
    if (spawnIdx < 0) spawnIdx = L.enemies.length;
    score = Math.max(0, score - 200);
    sfx.music(true);
  }
  function others() {
    const out = [];
    for (const r of remotes.values()) if (!r.hid) out.push({ x: r.x, y: r.y + (r.p ? 0 : 0) });
    for (const g of ghosts) if (!g.c.hidden && !g.respawn) out.push({ x: g.c.x, y: g.c.y });
    return out;
  }

  // ---------- blocks, coins, items ----------
  function takeCoin(tx, ty, silent) {
    L.tiles[ty * L.W + tx] = EMPTY;
    if (silent) return;
    coins++; score += 200; sfx.coin();
    send({ t: 'c', i: ty * L.W + tx });
  }
  function coinPop(tx, ty) {
    parts.push({ k: 'coin', x: tx * TS, y: ty * TS - 16, vy: -5, t: 0 });
    coins++; score += 200; sfx.coin();
  }
  function hitBlock(tx, ty) {
    const i = ty * L.W + tx, t = L.tiles[i];
    if (t === QBLK) {
      L.tiles[i] = USED; bumps.set(i, 0);
      const c = L.content.get(i);
      if (c === 'pow') { items.push({ k: me.pow ? 'motte' : 'shovel', x: tx * TS, y: ty * TS, vx: 0, vy: 0, rise: 16, w: 16, h: 16 }); sfx.sprout(); }
      else coinPop(tx, ty);
      send({ t: 'b', i, m: 1 });
    } else if (t === BRICK) {
      if (L.content.get(i) === 'multi') {
        const left = (L.multi.get(i) ?? 1) - 1;
        L.multi.set(i, left); if (left <= 0) L.tiles[i] = USED;
        bumps.set(i, 0); coinPop(tx, ty);
        send({ t: 'b', i, m: 3 });
      } else if (me.pow) {
        L.tiles[i] = EMPTY; debris(tx, ty); score += 50; sfx.brick();
        send({ t: 'b', i, m: 2 });
      } else { bumps.set(i, 0); sfx.bump(); send({ t: 'b', i, m: 4 }); }
    } else sfx.bump();
    // what stood on the block gets knocked out
    for (const e of enemies) if (e.alive && e.k !== 'worm' && e.k !== 'crow' && Math.abs(e.y + e.h - ty * TS) < 4 && e.x + e.w > tx * TS && e.x < tx * TS + TS) { kill(e, true); score += 100; pop('100', e.x, e.y); }
    if (tile(tx, ty - 1) === COIN) { takeCoin(tx, ty - 1, true); coinPop(tx, ty - 1); send({ t: 'c', i: (ty - 1) * L.W + tx }); }
  }
  function debris(tx, ty) {
    for (const [dx, dy, vx, vy] of [[0, 0, -1.2, -5], [8, 0, 1.2, -5], [0, 8, -1.2, -3], [8, 8, 1.2, -3]]) parts.push({ k: 'debris', x: tx * TS + dx, y: ty * TS + dy, vx, vy, t: 0 });
  }
  function stepItems() {
    for (const it of items) {
      if (it.rise > 0) { it.rise -= .5; it.y -= .5; if (it.rise <= 0 && it.k === 'shovel') it.vx = 1.1; continue; }
      if (it.k === 'shovel') {
        it.vy = Math.min(4, it.vy + .3);
        if (moveX(it, it.vx)) it.vx = -it.vx;
        moveY(it, it.vy);
      }
      if (!me.dead && !me.goal && over2(me, { x: it.x + 2, y: it.y + 2, w: 12, h: 14 })) {
        it.gone = true; score += 1000; pop('1000', it.x, it.y);
        sfx.power();
        if (!me.pow) { setPow(me, 1); me.grow = 48; me.fireAfter = it.k === 'motte'; }
        else if (it.k === 'motte') setPow(me, 2);
      }
      if (it.y > H + 16 || it.x < camX - 32) it.gone = true;
    }
    if (me.fireAfter && !me.grow) { me.fireAfter = false; setPow(me, 2); }
    items = items.filter((i) => !i.gone);
    for (const s of shots) {
      s.t++;
      s.vy = Math.min(4, s.vy + .35);
      const b = { x: s.x, y: s.y, w: 8, h: 8 };
      if (moveX(b, s.vx)) s.gone = true;
      moveY(b, s.vy); if (b.ground) s.vy = -3.2;
      s.x = b.x; s.y = b.y;
      for (const e of enemies) if (e.alive && over2(b, box(e))) { kill(e, true); score += 200; pop('200', e.x, e.y); s.gone = true; break; }
      if (s.gone) parts.push({ k: 'poof', x: s.x, y: s.y, t: 0 });
      if (s.t > 180 || s.x < camX - 16 || s.x > camX + W + 16 || s.y > H) s.gone = true;
    }
    shots = shots.filter((s) => !s.gone);
  }
  const pop = (s, x, y) => parts.push({ k: 'text', s, x, y, t: 0 });
  function stepParts() {
    for (const p of parts) {
      p.t++;
      if (p.k === 'debris') { p.vy += .3; p.x += p.vx; p.y += p.vy; if (p.y > H) p.gone = true; }
      else if (p.k === 'coin') { p.vy += .35; p.y += p.vy; if (p.t > 28) { p.gone = true; pop('200', p.x, p.y); } }
      else if (p.k === 'text') { p.y -= .6; if (p.t > 45) p.gone = true; }
      else if (p.k === 'poof' && p.t > 12) p.gone = true;
    }
    parts = parts.filter((p) => !p.gone);
  }

  // ---------- enemies ----------
  const box = (e) => e.k === 'worm' ? { x: e.x + 2, y: e.by - e.off + 2, w: 12, h: Math.max(0, e.off - 2) } : e;
  function spawn() {
    while (spawnIdx < L.enemies.length && L.enemies[spawnIdx].x < camX + W + 24) {
      const s = L.enemies[spawnIdx++];
      if (killed.has(s.i) || enemies.some((e) => e.i === s.i)) continue;
      const e = { i: s.i, k: s.k, x: s.x + 1, y: s.y + 2, w: 14, h: 14, vx: -.5, vy: 0, st: 'walk', t: 0, alive: true, ground: false };
      if (s.k === 'crow') { e.y = s.y; e.h = 12; e.by = s.y; e.vx = -.6; e.ph = s.i; }
      if (s.k === 'worm') { e.x = s.x - 8; e.by = s.y; e.off = 0; e.t = 2.5 + (s.i % 3) * .5; e.w = 16; }
      enemies.push(e);
    }
  }
  function kill(e, flip, remote) {
    if (!e.alive) return;
    e.alive = false; killed.add(e.i); e.wasShell = e.st === 'shell';
    if (flip) { e.st = 'flip'; e.vy = -3; e.vx = e.vx >= 0 ? .6 : -.6; } else { e.st = 'flat'; e.t = 0; }
    if (!remote) { send({ t: 'e', i: e.i }); if (flip) sfx.kick(); }
  }
  function stepEnemies() {
    spawn();
    for (const e of enemies) {
      if (e.st === 'flip') { e.vy += .3; e.x += e.vx; e.y += e.vy; if (e.y > H + 16) e.gone = true; continue; }
      if (e.st === 'flat') { if (++e.t > 30) e.gone = true; continue; }
      if (e.k === 'crow') { e.x += e.vx; e.y = e.by + Math.sin(clock * 2.6 + e.ph) * 18; }
      else if (e.k === 'worm') {
        const near = Math.abs(me.x + me.w / 2 - (e.x + 8)) < 30;
        const ph = e.t % 4;
        if (!(ph >= 3.2 && near)) e.t += STEP;
        const p = e.t % 4;
        e.off = p < 1 ? p * 24 : p < 2.2 ? 24 : p < 3.2 ? (3.2 - p) * 24 : 0;
      } else {
        e.vy = Math.min(4, e.vy + .3);
        const wasG = e.ground;
        if (moveX(e, e.vx)) e.vx = -e.vx;
        moveY(e, e.vy);
        // beetles turn at ledges, moles walk off them
        if (e.k === 'beetle' && e.st === 'walk' && wasG && e.ground) {
          const fx = Math.floor((e.vx > 0 ? e.x + e.w + 1 : e.x - 1) / TS), fy = Math.floor((e.y + e.h + 2) / TS);
          if (!solid(fx, fy)) e.vx = -e.vx;
        }
        if (e.st === 'shell') {
          e.t += STEP;
          if (e.vx === 0 && e.t > 7) { e.st = 'walk'; e.vx = me.x < e.x ? -.5 : .5; e.h = 14; }
          if (e.vx) for (const o of enemies) if (o !== e && o.alive && over2(e, box(o))) { kill(o, true); score += 200; pop('200', o.x, o.y); }
        }
        if (e.imm) e.imm--;
      }
      if (e.y > H + 16 || e.x < camX - 64 || e.x > camX + W + 400) { e.gone = true; if (e.y > H + 16) { e.alive = false; } }
    }
    // walkers bump into each other
    for (let a = 0; a < enemies.length; a++) for (let b = a + 1; b < enemies.length; b++) {
      const p = enemies[a], q = enemies[b];
      if (p.alive && q.alive && p.st === 'walk' && q.st === 'walk' && p.k !== 'crow' && q.k !== 'crow' && p.k !== 'worm' && q.k !== 'worm' && over2(p, q)) {
        if ((p.x < q.x) === (p.vx > 0)) p.vx = -p.vx;
        if ((q.x < p.x) === (q.vx > 0)) q.vx = -q.vx;
      }
    }
    enemies = enemies.filter((e) => !e.gone);
  }
  function hitEnemies(c) {
    if (c.dead || c.grow) return;
    for (const e of enemies) {
      if (!e.alive) continue;
      const b = box(e);
      if (!b.h || !over2(c, b)) continue;
      const stomp = c.vy > 0 && c.y + c.h - c.vy <= b.y + 6 && e.k !== 'worm';
      const bounce = () => { c.vy = prev.jump ? -4.6 : -3.2; c.fast = false; c.jumped = true; c.y = b.y - c.h; };
      if (e.k === 'beetle' && e.st === 'shell') {
        if (e.vx === 0) {
          e.vx = c.x + c.w / 2 < e.x + e.w / 2 ? 3.2 : -3.2; e.imm = 14; e.t = 0;
          sfx.kick(); score += 400; pop('400', e.x, e.y);
          if (stomp) bounce();
        } else if (stomp) { e.vx = 0; e.t = 0; bounce(); sfx.stomp(); score += 100; }
        else if (!e.imm) hurt();
        continue;
      }
      if (stomp) {
        bounce(); sfx.stomp(); score += 100; pop('100', e.x, e.y - 4);
        if (e.k === 'mole') kill(e, false);
        else if (e.k === 'beetle') { e.st = 'shell'; e.vx = 0; e.t = 0; }
        else kill(e, true);
      } else hurt();
    }
  }

  // ---------- ghost rivals: run right, jump what's in the way ----------
  function stepGhosts() {
    for (const g of ghosts) {
      const c = g.c;
      if (g.fin != null) { if (c.goal) stepGoal(c); continue; }
      if (phase === 'count') continue;
      if (raceTime() >= UNITS * UNIT) continue;
      if (g.respawn) { if (--g.respawn === 0) place(g, Math.floor(c.x / TS) + 1); continue; }
      if (c.inv) c.inv--;
      const feet = Math.floor((c.y + c.h - 1) / TS), front = c.x + c.w;
      const ahead = (d) => Math.floor((front + d) / TS);
      const wall = solid(ahead(6), feet) || solid(ahead(6), feet - 1);
      let gap = true;
      for (let ty = feet + 1; ty < ROWS; ty++) if (solid(ahead(10), ty)) { gap = false; break; }
      const inp = { r: c.vx < g.speed || !c.ground, run: g.speed > 1.5 || !c.ground, jump: g.hold > 0 };
      if (c.ground && (wall || gap)) { inp.jumpEdge = true; inp.jump = true; g.hold = wall ? 26 : 20; inp.r = true; }
      if (g.hold) g.hold--;
      physics(c, inp, false);
      if (!c.ground && c.vx < 2) c.vx = Math.min(2, c.vx + .1);
      if (frame % 90 === 0) { if (c.x - g.lastX < 6) place(g, Math.floor(c.x / TS) + 2); g.lastX = c.x; }
      if (c.y > H + 8) { g.respawn = 50; c.y = H + 40; }
      if (c.x + c.w >= L.flagX * TS) {
        g.fin = raceTime(); g.order = ++finOrder;
        c.goal = { st: 'slide', t: 0 }; c.x = L.flagX * TS + 8 - c.w; c.vx = c.vy = 0;
      }
    }
  }

  // a ghost that fell or got stuck reappears on the next bit of solid ground ahead
  function place(g, tx) {
    const c = g.c;
    const ok = (t) => groundTop(t) > 0 && groundTop(t + 1) === groundTop(t) && !solid(t, groundTop(t) - 1);
    while (tx < L.len - 1 && !ok(tx)) tx++;
    c.x = tx * TS + 2; c.y = groundTop(tx) * TS - c.h; c.vx = 0; c.vy = 0; c.inv = 60; c.plat = null;
  }

  // ---------- network ----------
  function onFx(id, fx) {
    if (!running || !fx) return;
    let r = remotes.get(id);
    if (!r && id !== meId) { r = { id, name: 'invité', color: 0xffffff, snaps: [], x: 0, y: 0, a: 0, f: 1, p: 0, hid: 0, fin: null, order: 0 }; remotes.set(id, r); }
    if (!r) return;
    if (fx.t === 's') {
      r.snaps.push({ at: performance.now(), x: +fx.x || 0, y: +fx.y || 0, a: fx.a | 0, f: fx.f < 0 ? -1 : 1, p: fx.p | 0, h: fx.h | 0 });
      if (r.snaps.length > 20) r.snaps.shift();
    } else if (fx.t === 'b') {
      const i = fx.i | 0, t = L.tiles[i];
      if (fx.m === 2 && t === BRICK) { L.tiles[i] = EMPTY; debris(i % L.W, Math.floor(i / L.W)); }
      else if (fx.m === 1 && t === QBLK) { L.tiles[i] = USED; bumps.set(i, 0); }
      else if (fx.m === 3 && t === BRICK) { const left = (L.multi.get(i) ?? 1) - 1; L.multi.set(i, left); if (left <= 0) L.tiles[i] = USED; bumps.set(i, 0); }
      else if (fx.m === 4) bumps.set(i, 0);
    } else if (fx.t === 'c') { const i = fx.i | 0; if (L.tiles[i] === COIN) L.tiles[i] = EMPTY; }
    else if (fx.t === 'e') {
      const i = fx.i | 0; killed.add(i);
      const e = enemies.find((x) => x.i === i);
      if (e) kill(e, true, true);
    } else if (fx.t === 'fin' && r.fin == null) { r.fin = +fx.time || 0; r.order = ++finOrder; }
  }
  function lerpRemotes() {
    const now = performance.now() - 110;
    for (const r of remotes.values()) {
      const s = r.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let n = s.length - 1; n > 0; n--) if (s[n - 1].at <= now) { a = s[n - 1]; b = s[n]; break; }
      const k = b.at > a.at ? Math.max(0, Math.min(1, (now - a.at) / (b.at - a.at))) : 1;
      r.x = a.x + (b.x - a.x) * k; r.y = a.y + (b.y - a.y) * k;
      const c = k < .5 ? a : b;
      r.a = c.a; r.f = c.f; r.p = c.p; r.hid = c.h;
    }
  }

  // ---------- drawing ----------
  function render() {
    if (!cv) return;
    lerpRemotes();
    const x = bx, cam = Math.round(camX);
    x.fillStyle = PAL.C; x.fillRect(0, 0, W, H);
    // clouds drift at half speed, hills and bushes sit on the ground
    for (const d of L.decor) {
      if (d.k === 'cloud') { const px = Math.round(d.x - cam * .5); if (px > -48 && px < W) x.drawImage(A.cloud, px, d.y); }
    }
    for (const d of L.decor) {
      if (d.k === 'cloud') continue;
      const img = A[d.k], px = d.x - cam;
      if (px > -img.width && px < W) x.drawImage(img, px, GROUND * TS - img.height);
    }
    drawCastle(x, cam);
    drawFlag(x, cam);
    drawCheckpoints(x, cam);
    // worms first: the pipes hide their tails
    for (const e of enemies) if (e.k === 'worm' && e.off > 0 && e.alive) x.drawImage(A.worm[Math.floor(clock * 4) % 2], Math.round(e.x - cam), Math.round(e.by - e.off));
    const c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.len - 1, c0 + 17);
    const qf = [0, 0, 0, 1, 2, 1][Math.floor(clock * 6) % 6], cf = [0, 0, 1, 2, 1, 0][Math.floor(clock * 6) % 6];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = c0; tx <= c1; tx++) {
      const i = ty * L.W + tx, t = L.tiles[i];
      if (!t) continue;
      const bf = bumps.get(i), px = tx * TS - cam, py = ty * TS - (bf != null ? Math.round(Math.sin(bf / 10 * Math.PI) * 5) : 0);
      if (t === DIRT) x.drawImage(tile(tx, ty - 1) === DIRT ? A.dirt : A.grass, px, py);
      else if (t === BRICK) x.drawImage(A.brick, px, py);
      else if (t === QBLK) x.drawImage(A.q[qf], px, py);
      else if (t === USED) x.drawImage(A.used, px, py);
      else if (t === STONE) x.drawImage(A.stone, px, py);
      else if (t === COIN) x.drawImage(A.coin[cf], px, py);
      else if (t >= PIPE_TL && t <= PIPE_R) x.drawImage(t < PIPE_L ? A.pipe.top : A.pipe.body, t === PIPE_TR || t === PIPE_R ? 16 : 0, 0, 16, 16, px, py, 16, 16);
    }
    for (const p of plats) {
      const px = Math.round(p.cx - cam), py = Math.round(p.cy);
      if (px < -p.w || px > W) continue;
      for (let i = 0; i < p.w; i += 16) x.drawImage(A.used, 0, 0, 16, 8, px + i, py, 16, 8);
      x.fillStyle = PAL.y; x.fillRect(px, py, p.w, 1);
    }
    for (const it of items) {
      const img = it.k === 'shovel' ? A.shovel : A.motte[Math.floor(clock * 8) % 3];
      const px = Math.round(it.x - cam), py = Math.round(it.y);
      if (it.rise > 0) { const vis = 16 - it.rise; if (vis > 0) x.drawImage(img, 0, 0, 16, vis, px, py, 16, vis); }
      else x.drawImage(img, px, py);
    }
    for (const e of enemies) if (e.k !== 'worm' || !e.alive) drawEnemy(x, e, cam);
    for (const s of shots) x.drawImage(A.clod[Math.floor(s.t / 4) % 2], Math.round(s.x - cam), Math.round(s.y));
    // the others, then me on top
    for (const g of ghosts) if (!g.c.hidden && !g.respawn && !(g.c.inv && frame % 4 < 2)) drawChar(x, g.c, anim(g.c), g.color, cam, .55, g.name, g.tag * 8);
    for (const r of remotes.values()) if (!r.hid && r.snaps.length) drawChar(x, { x: r.x, y: r.y, h: r.p ? 26 : 14, pow: r.p, face: r.f }, r.a, r.color, cam, 1, r.name);
    if (!me.hidden && !(me.inv && frame % 4 < 2)) {
      const grow = me.grow && Math.floor(me.grow / 4) % 2;
      if (grow) drawChar(x, { ...me, pow: 0, y: me.y + 12, h: 14 }, 0, meColor, cam, 1);
      else drawChar(x, me, anim(me), meColor, cam, 1);
    }
    for (const p of parts) {
      const px = Math.round(p.x - cam), py = Math.round(p.y);
      if (p.k === 'debris') x.drawImage(A.debris, px, py);
      else if (p.k === 'coin') x.drawImage(A.coinSpin[Math.floor(p.t / 3) % 4], px, py);
      else if (p.k === 'text') text(x, p.s, px, py, PAL.W, 1, PAL.K);
      else if (p.k === 'poof') { x.fillStyle = p.t % 4 < 2 ? PAL.W : PAL.Y; x.fillRect(px + 4 - p.t / 3, py + 4 - p.t / 3, 2, 2); x.fillRect(px + 4 + p.t / 3, py + 4 - p.t / 3, 2, 2); x.fillRect(px + 4 - p.t / 3, py + 4 + p.t / 3, 2, 2); x.fillRect(px + 4 + p.t / 3, py + 4 + p.t / 3, 2, 2); }
    }
    drawHud(x);
    blit();
  }
  // name tags stay readable on the sky: dark colours are lifted towards white
  const tagColor = (c) => { const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255, l = .3 * r + .59 * g + .11 * b, k = l < 150 ? (150 - l) / (255 - l) : 0; return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`; };
  function drawChar(x, c, a, color, cam, alpha, name, lift = 0) {
    const set = hero(color, c.pow || 0), img = (c.face < 0 ? set.l : set.r)[a] || set.r[0];
    const px = Math.round(c.x - 2 - cam), py = Math.round(c.y + (a === 6 ? 14 : c.h) - img.height);
    if (px < -24 || px > W + 8) return;
    if (alpha < 1) x.globalAlpha = alpha;
    x.drawImage(img, px, py);
    x.globalAlpha = 1;
    if (name) text(x, name.slice(0, 10), px + 8, py - 9 - lift, tagColor(color), 1, PAL.K, 'center');
  }
  function drawEnemy(x, e, cam) {
    const px = Math.round(e.x - 1 - cam), py = Math.round(e.y - 2);
    if (px < -20 || px > W + 4) return;
    const f = Math.floor(clock * 6) % 2;
    let img;
    if (e.k === 'mole') img = e.st === 'flat' ? A.moleFlat : A.mole[f];
    else if (e.k === 'beetle') img = e.st === 'shell' || (e.st === 'flip' && e.wasShell) ? A.shell : (e.vx > 0 ? A.beetleR : A.beetle)[f];
    else if (e.k === 'crow') img = (e.vx > 0 ? A.crowR : A.crow)[Math.floor(clock * 5) % 2];
    else if (e.k === 'worm') img = A.worm[0];
    if (e.k === 'beetle' && e.st === 'shell' && e.vx === 0 && e.t > 5.5 && frame % 8 < 4) { x.drawImage(img, px + 1, py); return; }
    if (e.st === 'flip') { x.save(); x.translate(px, py + img.height); x.scale(1, -1); x.drawImage(img, 0, 0); x.restore(); return; }
    x.drawImage(img, px, e.k === 'worm' ? Math.round(e.by - e.off) : py);
  }
  function drawFlag(x, cam) {
    const px = L.flagX * TS + 7 - cam;
    if (px < -24 || px > W + 8) return;
    x.fillStyle = PAL.w; x.fillRect(px, 3 * TS + 6, 2, (GROUND - 1) * TS - 3 * TS - 6);
    x.fillStyle = PAL.W; x.fillRect(px, 3 * TS + 6, 1, (GROUND - 1) * TS - 3 * TS - 6);
    x.fillStyle = PAL.O; x.fillRect(px - 2, 3 * TS, 6, 6); x.fillStyle = PAL.Y; x.fillRect(px - 1, 3 * TS + 1, 3, 3);
    // our pennant: a shovel on red
    const fy = Math.round(flagY);
    x.fillStyle = PAL.R;
    for (let j = 0; j < 14; j++) { const w = 14 - Math.abs(j - 7) * 2 + 2; x.fillRect(px - w, fy + j, w, 1); }
    x.fillStyle = PAL.W; x.fillRect(px - 9, fy + 4, 4, 3); x.fillRect(px - 8, fy + 7, 2, 4);
  }
  function drawCheckpoints(x, cam) {
    L.checkpoints.forEach((cpx, n) => {
      if (!n) return;
      const px = cpx - cam;
      if (px < -16 || px > W + 16) return;
      const y0 = GROUND * TS - 30;
      x.fillStyle = PAL.D; x.fillRect(px, y0, 2, 30);
      x.fillStyle = n <= cpTaken ? hexOf(meColor) : PAL.w;
      x.fillRect(px + 2, y0, 10, 7); x.fillStyle = PAL.K; x.fillRect(px + 2, y0 + 7, 10, 1);
      x.fillStyle = n <= cpTaken ? PAL.Y : PAL.g; x.fillRect(px - 1, y0 - 3, 4, 3);
    });
  }
  function drawCastle(x, cam) {
    const px = L.castleX * TS - cam, top = GROUND * TS;
    if (px < -96 || px > W + 8) return;
    const br = (i, j) => x.drawImage(A.castleBrick, px + i * 16, top - j * 16);
    for (let i = 0; i < 5; i++) for (let j = 1; j <= 3; j++) br(i, j);
    for (let i = 0; i < 5; i += 2) x.drawImage(A.castleBrick, 0, 8, 16, 8, px + i * 16, top - 4 * 16 + 8, 16, 8);
    for (let i = 1; i < 4; i++) for (let j = 5; j <= 6; j++) br(i, j);
    for (let i = 1; i < 4; i += 2) x.drawImage(A.castleBrick, 0, 8, 16, 8, px + i * 16, top - 7 * 16 + 8, 16, 8);
    x.fillStyle = PAL.K;
    x.fillRect(px + 34, top - 26, 12, 26); x.fillRect(px + 36, top - 28, 8, 2);
    x.fillRect(px + 22, top - 84, 4, 10); x.fillRect(px + 54, top - 84, 4, 10);
    if (me.hidden) { x.fillStyle = hexOf(meColor); x.fillRect(px + 40, top - 7 * 16 - 6, 10, 6); x.fillStyle = PAL.w; x.fillRect(px + 39, top - 7 * 16 - 6, 1, 14); }
  }
  function drawHud(x) {
    const sh = PAL.K;
    const tLeft = Math.max(0, UNITS - Math.floor(raceTime() / UNIT));
    text(x, meName.slice(0, 9), 16, 8, PAL.W, 1, sh);
    text(x, String(score).padStart(6, '0'), 16, 17, PAL.W, 1, sh);
    x.drawImage(A.coinHud, 88, 17);
    text(x, '×' + String(coins).padStart(2, '0'), 95, 17, PAL.W, 1, sh);
    text(x, 'monde', 136, 8, PAL.W, 1, sh); text(x, world, 142, 17, PAL.W, 1, sh);
    text(x, 'temps', 196, 8, PAL.W, 1, sh);
    text(x, String(tLeft).padStart(3, '0'), 202, 17, tLeft < 100 && frame % 30 < 15 ? PAL.R : PAL.W, 1, sh);
    // the race: a line to the flag, everyone on it
    const x0 = 16, x1 = 196, y = 30, len = L.flagX * TS;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(x0, y, x1 - x0, 3);
    x.fillStyle = PAL.W; x.fillRect(x0, y + 1, x1 - x0, 1);
    x.fillStyle = PAL.R; x.fillRect(x1, y - 4, 4, 3); x.fillStyle = PAL.w; x.fillRect(x1, y - 4, 1, 7);
    const dot = (px, col, big) => { const dx = Math.round(x0 + Math.max(0, Math.min(1, px / len)) * (x1 - x0)); x.fillStyle = PAL.K; x.fillRect(dx - (big ? 2 : 1) - 1, y - (big ? 2 : 1) - 1 + 1, big ? 6 : 4, big ? 6 : 4); x.fillStyle = col; x.fillRect(dx - (big ? 2 : 1), y - (big ? 2 : 1) + 1, big ? 4 : 2, big ? 4 : 2); };
    for (const g of ghosts) dot(g.fin != null ? len : g.c.x, hexOf(g.color), false);
    for (const r of remotes.values()) dot(r.fin != null ? len : r.x, hexOf(r.color), false);
    dot(me.fin != null ? len : me.x, frame % 20 < 14 ? hexOf(meColor) : PAL.W, true);
    const list = standings(), pl = list.findIndex((r) => r.me) + 1;
    text(x, `${pl}/${list.length}`, 240, 28, pl === 1 ? PAL.Y : PAL.W, 1, sh, 'right');
    if (phase === 'count') {
      const n = Math.ceil(COUNT - clock);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 56, W, 60);
      text(x, 'super creuseur', W / 2, 62, PAL.Y, 2, sh, 'center');
      text(x, `monde ${world} · premier au drapeau !`.replace('·', '-'), W / 2, 82, PAL.W, 1, sh, 'center');
      text(x, String(n), W / 2, 96, PAL.W, 2, sh, 'center');
    } else if (phase === 'run' && phaseT < 1.2) text(x, 'partez !', W / 2, 90, PAL.Y, 3, PAL.K, 'center');
    else if (phase === 'timeup') { x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 90, W, 40); text(x, 'temps écoulé', W / 2, 104, PAL.R, 2, sh, 'center'); }
    if (me.dead && phase === 'run') text(x, 'retour au relais…'.replace('…', '...'), W / 2, 110, PAL.W, 1, sh, 'center');
    if (phase === 'goal' || phase === 'done') drawResults(x);
  }
  function standings() {
    const list = [{ me: true, name: meName, color: meColor, fin: me.fin, order: me.order, x: me.x }];
    for (const r of remotes.values()) list.push({ name: r.name, color: r.color, fin: r.fin, order: r.order, x: r.x });
    for (const g of ghosts) list.push({ name: g.name, color: g.color, fin: g.fin, order: g.order, x: g.c.x, ghost: true });
    return list.sort((a, b) => (a.fin != null) !== (b.fin != null) ? (a.fin != null ? -1 : 1) : a.fin != null ? a.order - b.order : b.x - a.x);
  }
  function drawResults(x) {
    if (doneT < 2.2) return;
    const list = standings(), h = 44 + list.length * 12;
    const y0 = Math.round((H - h) / 2) + 6;
    x.fillStyle = 'rgba(0,0,0,.78)'; x.fillRect(40, y0, 176, h);
    x.fillStyle = PAL.Y; x.fillRect(40, y0, 176, 1); x.fillRect(40, y0 + h - 1, 176, 1); x.fillRect(40, y0, 1, h); x.fillRect(215, y0, 1, h);
    text(x, 'arrivée', W / 2, y0 + 7, PAL.Y, 1, null, 'center');
    list.forEach((r, n) => {
      const y = y0 + 22 + n * 12, col = r.me ? PAL.Y : PAL.W;
      text(x, r.fin != null ? `${n + 1}.` : '-', 50, y, col);
      x.fillStyle = hexOf(r.color); x.fillRect(66, y + 1, 5, 5);
      text(x, r.name.slice(0, 11), 76, y, col);
      text(x, r.fin != null ? fmt(r.fin) : '...', 206, y, col, 1, null, 'right');
    });
    text(x, `fin dans ${Math.max(0, Math.ceil(DONE - doneT))}`, W / 2, y0 + h - 12, PAL.w, 1, null, 'center');
  }
  // the game can be shown in a rectangle of the page (a screen in the game room) instead of the whole page
  let rect = null;
  function place() {
    if (!cv) return;
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100vw', height: '100vh' });
  }
  function blit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((rect?.w ?? innerWidth) * dpr), ch = Math.round((rect?.h ?? innerHeight) * dpr);
    if (cv.width !== cw || cv.height !== ch || !over) {
      cv.width = cw; cv.height = ch;
      const s = Math.max(1, Math.floor(Math.min(cw / W, ch / H))) || Math.min(cw / W, ch / H);
      const w = W * s, h = H * s;
      view = { s, w, h, ox: Math.floor((cw - w) / 2), oy: Math.floor((ch - h) / 2) };
      // the CRT: soft vignette, faint scanlines, a thin bezel
      const [oc, ox] = canvas(w, h);
      if (s >= 3) { ox.fillStyle = 'rgba(0,0,0,.14)'; for (let j = 0; j < H; j++) ox.fillRect(0, j * s + s - Math.max(1, Math.floor(s / 3)), w, Math.max(1, Math.floor(s / 3))); }
      const g = ox.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
      ox.fillStyle = g; ox.fillRect(0, 0, w, h);
      over = oc;
    }
    const { s, w, h, ox, oy } = view;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#07060a'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#1a130d'; cx.fillRect(ox - 6, oy - 6, w + 12, h + 12);
    cx.drawImage(buf, ox, oy, w, h);
    cx.drawImage(over, ox, oy);
  }

  return {
    start, stop, update, onFx,
    respawn() { if (running && phase === 'run' && !me.dead && !me.goal) { setPow(me, 0); respawnAt(); } },
    peerLeft(id) { remotes?.delete(id); },
    hud() { return { hidden: true }; },
    setRect(r) { rect = r; place(); },
    set onEnd(f) { onEnd = f; },
    // for the tests
    get _dbg() { return { me, L, camX, phase, enemies, ghosts, remotes, render, warp(tx) { me.dead = 0; me.inv = 60; me.x = tx * TS; me.y = (groundTop(tx) > 0 ? groundTop(tx) : GROUND) * TS - me.h; me.vy = 0; camX = Math.max(0, Math.min(L.len * TS - W, me.x - 100)); spawnIdx = L.enemies.findIndex((e) => e.x > camX); if (spawnIdx < 0) spawnIdx = L.enemies.length; }, setCam(v) { camX = v; }, set clock(v) { clock = v; }, get clock() { return clock; } }; },
  };
}
