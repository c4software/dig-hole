// comic.js, « capitaine lune »: a Captain Comic–like platformer on its own 256×208 canvas. Four zones of the moon
// (craters, the base, the caves, the alien fortress), the high moon jump, blastola cola for the shots, flyers that come
// in patterns, doors, the boots / corkscrew / key / lantern / wand, a shield bar, lives, and three treasures to bring back.
// Together: everyone in the same world, the items that open the way are shared, each one fights their own flyers.
import { text, canvas, hexOf } from './nes-art.js';
import { TS, ROWS, EMPTY, ROCK, BLOCK, WALL, SPIKE, DOOR, BACK, LOCK, createWorld, tileAt, solidAt, rng } from './comic-level.js';
import { VW, VH, H, THEMES, buildTiles, buildBack, drawHero, drawFoe, drawItem, drawDoor, drawDeco, drawLander, ITEM } from './comic-art.js';
import { createSynth } from './arcade-sfx.js';

const STEP = 1 / 60, COUNT = 2.6, SEND = 1 / 12, G = 620, JUMP = 272, JUMP_BOOTS = 342, WALK = 86, HW = 5, HH = 22;
const HP = 6, LIVES = 4, MAXCOLA = 5, SHOT_V = 200;
const TEAM_ITEMS = new Set(['boots', 'cork', 'key', 'lantern', 'wand']);
const TREASURES = ['lingot', 'gemme', 'couronne'];
const FOE = {
  sine: { hp: 1, pts: 100 }, bounce: { hp: 1, pts: 100 }, seek: { hp: 2, pts: 150 }, zig: { hp: 1, pts: 150 },
  shy: { hp: 2, pts: 200 }, leap: { hp: 2, pts: 200 }, orb: { hp: 1, pts: 50 }, boss: { hp: 24, pts: 5000 },
};
const SAY = {
  boots: 'bottes lunaires : tu sautes bien plus haut !', cork: 'tire-bouchon : tes tirs tournent et passent les murs',
  key: 'la clé ! les portes verrouillées s\'ouvrent', lantern: 'la lanterne : les grottes s\'éclairent', wand: 'baguette : k pour te téléporter devant',
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function createSfx() {
  const s = createSynth({
    vol: .12, beat: .19, leadType: .25,
    lead: [69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 72, 74, 76, 0, -1, -1, 69, 0, 72, 0, 77, 0, 76, 74, 72, 0, 71, 0, 69, 0, -1, -1,
      64, 0, 69, 0, 72, 0, 71, 69, 67, 0, 69, 71, 72, 0, -1, -1, 74, 0, 72, 71, 69, 0, 67, 0, 69, 0, 0, 0, -1, -1, -1, -1],
    roots: [45, 45, 41, 43, 45, 43, 41, 40], bass: [0, 12, 7, 12],
  });
  const { tone, noise, seq } = s;
  return Object.assign(s, {
    jump: (hi) => tone(hi ? 200 : 260, hi ? 820 : 700, .18, { type: .5, vol: .22 }),
    shoot: () => tone(1200, 300, .09, { type: .125, vol: .22 }),
    kill: () => { noise(.18, { vol: .35, f: 1400 }); tone(500, 80, .15, { type: .5, vol: .25 }); },
    hit: () => tone(300, 180, .06, { type: .25, vol: .3 }),
    hurt: () => { tone(220, 110, .2, { type: .5, vol: .35 }); noise(.1, { vol: .2, f: 600 }); },
    die: () => seq([72, 71, 69, 67, 65, 64, 62, 60, 48], .09, { type: .5, vol: .3 }),
    item: () => seq([72, 76, 79, 84], .06, { type: .25, vol: .3 }),
    big: () => seq([67, 71, 74, 79, 0, 74, 79, 83, 86], .08, { type: .5, vol: .28 }),
    life: () => seq([76, 79, 88, 84, 86, 91], .07, { type: .25, vol: .3 }),
    door: () => { tone(120, 60, .35, { type: 'tri', vol: .6 }); noise(.3, { vol: .15, f: 400 }); },
    teleport: () => tone(300, 2400, .3, { type: .125, vol: .25 }),
    deny: () => tone(150, 150, .12, { type: .5, vol: .25 }),
    boss: () => { tone(90, 60, .6, { type: .5, vol: .35 }); noise(.5, { vol: .2, f: 300 }); },
    win: () => { s.music(false); seq([72, 76, 79, 84, 0, 79, 84, 88, 0, 84, 88, 91, 96], .11, { type: .5, vol: .3 }); },
    lose: () => { s.music(false); seq([67, 0, 64, 0, 60, 0, 55, 0, 48], .14, { type: .5, vol: .3 }); },
    beep: (hi) => tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .3 : .1, { type: .5, vol: .25 }),
  });
}

export function createComic({ audio, ui } = {}) {
  const sfx = createSfx();
  let onEnd = () => {};
  let run = null, cv = null, cx = null, buf = null, bx = null, rect = null, view = null, over = null;

  // ---------- setup ----------
  function start({ seed = 1, humans = [], hostId, meId, send } = {}) {
    if (run) stop();
    if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
    const world = createWorld(seed);
    const mine = humans.find((h) => h.id === meId) || humans[0];
    run = {
      seed, world, humans, meId: mine.id, hostId, send: send ?? (() => {}), R: rng(seed * 31 + 7),
      art: world.map((_, zi) => buildTiles(zi, zi)), backs: world.map((_, zi) => buildBack(zi, seed)),
      team: { boots: false, cork: false, key: false, lantern: false, wand: false, tr: { lingot: false, gemme: false, couronne: false } },
      remotes: new Map(), gone: new Set(), bossDead: false,
      foes: [], shots: [], parts: [], pops: [], zone: 0, camX: 0, phase: 'count', phaseT: 0, clock: 0, acc: 0, frame: 0,
      prev: {}, sendT: 0, spawnT: 3, msg: null, fade: 0, ended: false, color: hexOf(mine.color ?? 0xd82800),
      me: { x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: false, hp: HP, lives: LIVES, cola: 0, inv: 0, dead: 0, shootT: 0, shootA: 0,
        tpT: 0, walk: 0, score: 0, out: false, safe: null, jumping: false },
    };
    for (const h of humans) if (h.id !== run.meId) run.remotes.set(h.id, { id: h.id, name: h.name || 'invité', color: hexOf(h.color ?? 0xffffff), snaps: [], x: -99, y: 0, z: -1, f: 1, a: 0, s: 0, o: 0 });
    place(0, 'start');
    cv = document.createElement('canvas');
    cv.id = 'comic';
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:15;pointer-events:auto;image-rendering:pixelated;background:#07060a;cursor:none';
    document.body.appendChild(cv);
    placeCanvas();
    cx = cv.getContext('2d');
    [buf, bx] = canvas(VW, H);
    over = null;
    sfx.init();
    render();
  }
  function stop() {
    if (cv) { cv.remove(); cv = null; cx = null; }
    run = null; over = null;
    sfx.close();
  }
  const Z = () => run.world[run.zone];

  // puts me in zone zi, at its start or at its far door
  function place(zi, where) {
    const r = run, z = run.world[zi], me = r.me;
    r.zone = zi;
    const p = where === 'end' ? z.door : z.spawn;
    me.x = p.x * TS + (where === 'end' ? -12 : 8); me.y = (p.y + 1) * TS; me.vx = me.vy = 0;
    me.safe = { x: me.x, y: me.y };
    r.camX = clamp(me.x - VW / 2, 0, z.W * TS - VW);
    r.foes = []; r.shots = []; r.spawnT = 2.2; r.fade = .5;
    say(z.name, 2.2);
  }
  function say(t, d = 2.6) { run.msg = { t, d, at: run.clock }; }

  // ---------- the loop ----------
  function update(dt, keys = new Set()) {
    if (!run || !cv) return;
    dt = Math.min(Math.max(dt, 0), .1);
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (dt > 0) sfx.init();
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = {
      l: k('ArrowLeft', 'KeyA'), r: k('ArrowRight', 'KeyD'),
      jump: k('Space', 'ArrowUp', 'KeyW'), fire: k('KeyJ', 'KeyX', 'ShiftLeft', 'ShiftRight', 'ControlLeft'),
      door: k('KeyE', 'ArrowDown', 'KeyS'), tp: k('KeyK', 'KeyC'),
    };
    const p = run.prev;
    inp.jumpE = inp.jump && !p.jump; inp.doorE = inp.door && !p.door; inp.tpE = inp.tp && !p.tp; inp.fireE = inp.fire && !p.fire;
    run.prev = inp;
    run.acc += dt;
    while (run && run.acc >= STEP) {
      run.acc -= STEP; tick(inp);
      inp.jumpE = inp.doorE = inp.tpE = inp.fireE = false;
      if (!run || run.ended) return;
    }
    sfx.tick();
    run.sendT += dt;
    if (run.sendT >= SEND && dt > 0) {
      run.sendT = 0;
      const me = run.me;
      run.send({ t: 's', x: Math.round(me.x), y: Math.round(me.y), z: run.zone, f: me.face, a: anim(me), s: me.score, o: me.out ? 1 : 0, d: me.dead > 0 ? 1 : 0 });
    }
    lerpRemotes();
    render();
  }
  const anim = (m) => m.dead > 0 ? 4 : !m.ground ? 3 : Math.abs(m.vx) > 5 ? 1 + (Math.floor(m.walk * 8) % 2) : 0;

  function tick(inp) {
    const r = run, me = r.me;
    r.frame++;
    r.clock += STEP;
    r.phaseT += STEP;
    r.fade = Math.max(0, r.fade - STEP);
    if (r.phase === 'count') {
      const left = COUNT - r.phaseT;
      if (Math.ceil(left) !== Math.ceil(left + STEP) && left > 0) sfx.beep(false);
      if (left <= 0) { r.phase = 'run'; r.phaseT = 0; r.clock = 0; sfx.beep(true); sfx.music(true); }
      return;
    }
    if (r.phase === 'win') { if (r.phaseT > 5) finish(true); else stepParts(); return; }
    if (r.phase === 'over') { if (r.phaseT > 3.5) finish(false); else stepParts(); return; }
    if (!me.out) stepMe(inp);
    stepShots();
    stepFoes();
    stepParts();
    // the camera: a little ahead of where the captain looks
    const z = Z(), tx = clamp(me.x - VW / 2 + me.face * 24, 0, z.W * TS - VW);
    r.camX += (tx - r.camX) * .08;
    r.camX = clamp(r.camX, Math.max(0, me.x - VW + 40), Math.min(z.W * TS - VW, me.x - 40));
    // everyone out of lives
    if (me.out && [...r.remotes.values()].every((x) => x.o || r.gone.has(x.id))) { r.phase = 'over'; r.phaseT = 0; sfx.lose(); }
  }

  // ---------- the captain ----------
  const boxHit = (z, x, y) => {
    const x0 = Math.floor((x - HW) / TS), x1 = Math.floor((x + HW - .01) / TS), y0 = Math.floor((y - HH) / TS), y1 = Math.floor((y - .01) / TS);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (solidAt(z, i, j)) return true;
    return false;
  };
  function stepMe(inp) {
    const r = run, me = r.me, z = Z();
    me.inv = Math.max(0, me.inv - STEP); me.shootT -= STEP; me.shootA -= STEP; me.tpT -= STEP;
    if (me.dead > 0) {
      me.dead -= STEP; me.vy += G * STEP * .5; me.y += me.vy * STEP;
      if (me.dead <= 0) revive();
      return;
    }
    // walking, jumping (hold for the full moon jump)
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (dir) me.face = dir;
    me.vx = dir * WALK;
    if (dir && me.ground) me.walk += STEP;
    if (inp.jumpE && me.ground) { me.vy = -(r.team.boots ? JUMP_BOOTS : JUMP); me.ground = false; me.jumping = true; sfx.jump(r.team.boots); }
    if (!inp.jump && me.jumping && me.vy < -90) me.vy = -90;
    if (me.vy >= 0) me.jumping = false;
    me.vy = Math.min(me.vy + G * STEP, 420);
    // x then y against the tiles
    let nx = me.x + me.vx * STEP;
    if (boxHit(z, nx, me.y)) { nx = me.vx > 0 ? Math.floor((nx + HW) / TS) * TS - HW - .01 : Math.floor((nx - HW) / TS + 1) * TS + HW + .01; if (boxHit(z, nx, me.y)) nx = me.x; }
    me.x = clamp(nx, HW, z.W * TS - HW);
    let ny = me.y + me.vy * STEP;
    me.ground = false;
    if (ny - HH < -10) { ny = HH - 10; me.vy = Math.max(me.vy, 0); }
    if (boxHit(z, me.x, ny)) {
      if (me.vy > 0) { ny = Math.floor(ny / TS) * TS; me.ground = true; }
      else { ny = Math.floor((ny - HH) / TS + 1) * TS + HH + .01; }
      if (boxHit(z, me.x, ny)) ny = me.y;
      me.vy = 0;
    }
    me.y = ny;
    // standing firmly somewhere: where I come back after a fall
    const fy = Math.floor(me.y / TS);
    if (me.ground && solidAt(z, Math.floor((me.x - HW) / TS), fy) && solidAt(z, Math.floor((me.x + HW) / TS), fy) && !onSpike(z, me)) me.safe = { x: me.x, y: me.y };
    if (me.y > VH + 24) { fall(); return; }
    if (onSpike(z, me)) { hurt(2); me.vy = -230; me.ground = false; }
    // shooting: as many shots at once as cans of cola drunk
    if (inp.fire && me.shootT <= 0) {
      if (!me.cola) { if (inp.fireE) { sfx.deny(); say('pas de blastola cola : pas de tir !', 1.6); } }
      else if (r.shots.filter((s) => s.mine).length < me.cola) {
        const s = { x: me.x + me.face * 9, y: me.y - 14, y0: me.y - 14, vx: me.face * SHOT_V, t: 0, cork: r.team.cork, mine: true };
        r.shots.push(s); me.shootT = .2; me.shootA = .15; sfx.shoot();
        r.send({ t: 'sh', x: Math.round(s.x), y: Math.round(s.y), f: me.face, c: s.cork ? 1 : 0, z: r.zone });
      }
    }
    // the wand: a hop through walls
    if (inp.tpE) teleport();
    // doors
    const tx = Math.floor(me.x / TS), ty = Math.floor((me.y - 1) / TS), t = tileAt(z, tx, ty);
    if (inp.doorE && me.ground && (t === DOOR || t === BACK || t === LOCK)) useDoor(t);
    // items
    for (const it of z.items) {
      if (it.taken || (it.boss && !r.bossDead)) continue;
      const ix = it.x * TS + 8, iy = it.y * TS + 8;
      if (Math.abs(ix - me.x) < 12 && Math.abs(iy - (me.y - 11)) < 18) take(it);
    }
  }
  function onSpike(z, me) {
    const x0 = Math.floor((me.x - HW + 2) / TS), x1 = Math.floor((me.x + HW - 2) / TS), j = Math.floor((me.y - 4) / TS);
    for (let i = x0; i <= x1; i++) if (tileAt(z, i, j) === SPIKE) return true;
    return false;
  }
  function teleport() {
    const r = run, me = r.me, z = Z();
    if (!r.team.wand) { if (me.tpT < -1) { say('il te faudrait la baguette de téléportation', 1.6); me.tpT = 0; } return; }
    if (me.tpT > 0) return;
    for (let d = 5; d >= 2; d--) {
      const nx = me.x + me.face * d * TS;
      if (nx < HW || nx > z.W * TS - HW) continue;
      for (const dy of [0, -16, -32, 16, 32, -48]) {
        const ny = Math.floor((me.y + dy) / TS) * TS;
        if (ny < HH || ny > VH) continue;
        if (!boxHit(z, nx, ny) && solidAt(z, Math.floor(nx / TS), Math.floor(ny / TS))) {
          burst(me.x, me.y - 11, '#ffe04a', 14);
          me.x = nx; me.y = ny; me.vy = 0; me.tpT = .6;
          burst(me.x, me.y - 11, '#fff', 14);
          sfx.teleport();
          return;
        }
      }
    }
    sfx.deny(); me.tpT = .3;
  }
  function useDoor(t) {
    const r = run;
    if (t === LOCK && !r.team.key) { sfx.deny(); say('verrouillée · il faut la clé', 2); return; }
    sfx.door();
    if (t === BACK) place(r.zone - 1, 'end');
    else place(r.zone + 1, 'start');
  }
  function hurt(n) {
    const me = run.me;
    if (me.inv > 0 || me.dead > 0 || run.phase !== 'run') return;
    me.hp -= n; me.inv = 1.3; sfx.hurt();
    if (me.hp <= 0) die();
  }
  function die() {
    const me = run.me;
    me.hp = 0; me.dead = 1.6; me.vy = -200; me.lives--;
    sfx.die();
  }
  function fall() {
    const me = run.me;
    me.hp = 0; me.dead = .9; me.vy = 0; me.lives--; me.y = VH + 60;
    sfx.die();
  }
  function revive() {
    const r = run, me = r.me;
    if (me.lives < 0) {
      me.out = true; me.lives = 0;
      if (r.remotes.size) say('plus de vies · regarde les autres finir', 4);
      return;
    }
    me.hp = HP; me.inv = 2; me.dead = 0; me.vx = me.vy = 0;
    me.x = me.safe.x; me.y = me.safe.y;
    r.foes = r.foes.filter((f) => f.k === 'boss');
    r.spawnT = 2;
  }

  // ---------- items ----------
  function take(it) {
    const r = run;
    it.taken = true;
    r.send({ t: 'it', z: r.zone, i: it.i, k: it.k });
    gain(it.k, true, null);
    burst(it.x * TS + 8, it.y * TS + 8, '#ffe04a', 10);
  }
  function gain(k, mine, who) {
    const r = run, me = r.me;
    if (k === 'cola') { if (!mine) return; me.cola = Math.min(MAXCOLA, me.cola + 1); addScore(500, me.x, me.y - 30); sfx.item(); say(`blastola cola ! ${me.cola} tir${me.cola > 1 ? 's' : ''} à la fois`, 2); return; }
    if (k === 'shield') {
      if (!mine) return;
      if (me.hp >= HP) { me.lives++; sfx.life(); say('bouclier plein : une vie en plus !', 2); } else { me.hp = HP; sfx.item(); say('bouclier rechargé', 1.6); }
      addScore(250, me.x, me.y - 30); return;
    }
    if (TEAM_ITEMS.has(k)) {
      if (r.team[k]) return;
      r.team[k] = true;
      if (mine) addScore(1000, me.x, me.y - 30);
      sfx.big(); say((who ? who + ' · ' : '') + SAY[k], 3.2); return;
    }
    if (TREASURES.includes(k)) {
      if (r.team.tr[k]) return;
      r.team.tr[k] = true;
      if (mine) addScore(5000, me.x, me.y - 30);
      sfx.big();
      const left = TREASURES.filter((t) => !r.team.tr[t]);
      say((who ? who + ' rapporte ' : 'trésor : ') + ITEM[k] + (left.length ? ` · encore ${left.length}` : ' !'), 3.2);
      if (!left.length) win(true);
    }
  }
  function win(send) {
    const r = run;
    if (r.phase === 'win' || r.phase === 'over') return;
    r.phase = 'win'; r.phaseT = 0;
    if (!r.me.out) addScore(Math.max(0, Math.round((900 - r.clock) * 10)), r.me.x, r.me.y - 40);
    if (send) r.send({ t: 'win' });
    sfx.win();
  }
  function addScore(n, x, y) { run.me.score += n; if (x != null) run.pops.push({ t: String(n), x, y, life: 0 }); }

  // ---------- shots ----------
  function stepShots() {
    const r = run, z = Z();
    for (const s of r.shots) {
      s.t += STEP; s.x += s.vx * STEP;
      s.y = s.y0 + (s.cork ? Math.sin(s.t * 20) * 9 : 0);
      if (!s.cork && solidAt(z, Math.floor(s.x / TS), Math.floor(s.y / TS))) { s.dead = true; burst(s.x, s.y, '#ffb040', 3); continue; }
      if (s.t > 1.2 || s.x < r.camX - 20 || s.x > r.camX + VW + 20) { s.dead = true; continue; }
      for (const f of r.foes) {
        if (f.dead) continue;
        const w = f.k === 'boss' ? 16 : 8, h = f.k === 'boss' ? 14 : 8;
        if (Math.abs(f.x - s.x) < w && Math.abs(f.y - s.y) < h) { s.dead = true; hitFoe(f, s.mine); break; }
      }
    }
    r.shots = r.shots.filter((s) => !s.dead);
  }
  function hitFoe(f, mine) {
    f.hp--; f.hit = .12;
    if (f.hp > 0) { sfx.hit(); return; }
    f.dead = true; sfx.kill();
    burst(f.x, f.y, f.k === 'boss' ? '#c8a0ff' : '#ffb040', f.k === 'boss' ? 40 : 10);
    if (mine) addScore(FOE[f.k].pts, f.x, f.y - 8);
    if (f.k === 'boss') { run.bossDead = true; run.foes.forEach((o) => { if (o.k === 'orb') o.dead = true; }); run.send({ t: 'boss' }); say('le gardien est tombé · la couronne !', 3); }
  }

  // ---------- the flyers ----------
  function spawnFoe(k, x, y, o = {}) {
    const r = run, me = r.me;
    const f = { k, x, y, y0: y, vx: 0, vy: 0, t: r.R() * 6, hp: FOE[k].hp, dir: Math.sign(me.x - x) || 1, flee: 0, hit: 0, cd: 1.5, ...o };
    if (k === 'sine') f.vx = f.dir * 58;
    if (k === 'bounce') { f.vx = f.dir * 62; f.vy = -60; }
    if (k === 'zig') { f.vx = f.dir * 76; f.vy = (r.R() < .5 ? -1 : 1) * 70; }
    if (k === 'leap') { f.vx = f.dir * 60; f.y = 20; }
    r.foes.push(f);
    return f;
  }
  function stepFoes() {
    const r = run, me = r.me, z = Z();
    // the guardian waits in its hall
    if (z.boss && !r.bossDead && !r.foes.some((f) => f.k === 'boss') && me.x > z.boss.x0 * TS + 24 && !me.out) {
      spawnFoe('boss', (z.boss.x0 + 9) * TS, 60, { cx: (z.boss.x0 + 9) * TS });
      sfx.boss(); say('le gardien de la forteresse !', 2.4);
    }
    const inHall = z.boss && me.x > z.boss.x0 * TS && !r.bossDead;
    r.spawnT -= STEP;
    if (r.spawnT <= 0 && !me.out && me.dead <= 0) {
      r.spawnT = 1.1 + r.R() * 1.8;
      const max = 3 + (r.zone >= 2 ? 1 : 0);
      if (!inHall && r.foes.filter((f) => f.k !== 'orb').length < max) {
        const kind = z.foes[Math.floor(r.R() * z.foes.length)], ahead = r.R() < .75 ? me.face : -me.face;
        const x = ahead > 0 ? r.camX + VW + 10 : r.camX - 10;
        spawnFoe(kind, x, 16 + r.R() * 110);
      }
    }
    for (const f of r.foes) {
      f.t += STEP; f.hit = Math.max(0, f.hit - STEP);
      const dx = me.x - f.x, dy = (me.y - 12) - f.y;
      switch (f.k) {
        case 'sine': f.x += f.vx * STEP; f.y = f.y0 + Math.sin(f.t * 3.2) * 22; break;
        case 'bounce':
          f.vy += 480 * STEP; f.x += f.vx * STEP; f.y += f.vy * STEP;
          if (f.vy > 0 && (solidAt(z, Math.floor(f.x / TS), Math.floor((f.y + 5) / TS)) || f.y > VH - 12)) { f.vy = -250 - r.R() * 40; }
          break;
        case 'seek': {
          const d = Math.hypot(dx, dy) || 1;
          f.vx += dx / d * 140 * STEP; f.vy += dy / d * 140 * STEP;
          const v = Math.hypot(f.vx, f.vy); if (v > 52) { f.vx *= 52 / v; f.vy *= 52 / v; }
          f.x += f.vx * STEP; f.y += f.vy * STEP; break;
        }
        case 'zig':
          f.x += f.vx * STEP; f.y += f.vy * STEP;
          if (f.y < 10) f.vy = Math.abs(f.vy); if (f.y > VH - 20) f.vy = -Math.abs(f.vy);
          break;
        case 'shy': {
          f.flee -= STEP;
          const d = Math.hypot(dx, dy) || 1, sgn = f.flee > 0 ? -1 : 1;
          if (f.flee <= -1.6 && d < 44) f.flee = 1.1;
          f.x += dx / d * 62 * sgn * STEP; f.y += dy / d * 50 * sgn * STEP + Math.sin(f.t * 5) * .4;
          break;
        }
        case 'leap': {
          f.vy = Math.min(f.vy + 560 * STEP, 300);
          const nx = f.x + f.vx * STEP;
          if (!solidAt(z, Math.floor(nx / TS), Math.floor((f.y - 3) / TS))) f.x = nx; else f.vx = -f.vx;
          f.y += f.vy * STEP;
          if (f.vy > 0 && solidAt(z, Math.floor(f.x / TS), Math.floor(f.y / TS))) {
            f.y = Math.floor(f.y / TS) * TS; f.vy = 0; f.vx = 0; f.cd -= STEP * 6;
            if (f.cd <= 0) { f.cd = .6 + r.R() * .6; f.vy = -210 - r.R() * 60; f.vx = Math.sign(dx) * 64; }
          }
          if (f.y > VH + 20) f.dead = true;
          break;
        }
        case 'boss':
          f.x = f.cx + Math.sin(f.t * .9) * 78; f.y = 58 + Math.sin(f.t * 1.8) * 30;
          f.cd -= STEP;
          if (f.cd <= 0 && me.dead <= 0) {
            f.cd = 1.3 + r.R() * .6;
            const d = Math.hypot(dx, dy) || 1;
            spawnFoe('orb', f.x, f.y + 10, { vx: dx / d * 90, vy: dy / d * 90, life: 4 });
          }
          break;
        case 'orb': f.x += f.vx * STEP; f.y += f.vy * STEP; f.life -= STEP; if (f.life <= 0) f.dead = true; break;
      }
      if (f.k !== 'boss' && (f.x < r.camX - 60 || f.x > r.camX + VW + 60)) f.dead = true;
      // touching the captain: the flyer bursts, the shield takes it
      if (!f.dead && me.dead <= 0 && !me.out) {
        const w = f.k === 'boss' ? 18 : 7, h = f.k === 'boss' ? 16 : 7;
        if (Math.abs(dx) < w + HW && Math.abs(me.y - 11 - f.y) < h + 11) {
          if (me.inv <= 0) {
            hurt(f.k === 'boss' ? 2 : 1);
            if (f.k !== 'boss') { f.dead = true; burst(f.x, f.y, '#ffb040', 8); }
          }
        }
      }
    }
    r.foes = r.foes.filter((f) => !f.dead);
  }

  // ---------- particles ----------
  function burst(x, y, c, n) {
    for (let i = 0; i < n; i++) { const a = run.R() * Math.PI * 2, v = 30 + run.R() * 90; run.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, c, life: 0, max: .4 + run.R() * .4 }); }
  }
  function stepParts() {
    const r = run;
    for (const p of r.parts) { p.life += STEP; p.vy += 200 * STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; }
    r.parts = r.parts.filter((p) => p.life < p.max);
    for (const p of r.pops) { p.life += STEP; p.y -= 20 * STEP; }
    r.pops = r.pops.filter((p) => p.life < 1);
  }

  // ---------- the end ----------
  function finish(won) {
    const r = run;
    if (!r || r.ended) return;
    r.ended = true;
    const me = r.me;
    const list = [{ id: r.meId, s: me.score }, ...[...r.remotes.values()].filter((x) => !r.gone.has(x.id)).map((x) => ({ id: x.id, s: x.s }))].sort((a, b) => b.s - a.s);
    const solo = list.length === 1;
    const place = solo ? (won ? 1 : 2) : list.findIndex((x) => x.id === r.meId) + 1;
    const pts = me.score.toLocaleString('fr-FR');
    const text = solo ? (won ? `les trois trésors rapportés en ${fmt(r.clock)} · ${pts} points` : `plus de vies · ${pts} points`)
      : `${won ? 'trésors rapportés' : 'tout le monde est tombé'} · ${place === 1 ? '1re' : place + 'e'} place sur ${list.length} · ${pts} points`;
    onEnd({ place, of: list.length, time: r.clock, value: me.score, text });
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- the others ----------
  function onFx(id, fx) {
    const r = run;
    if (!r || !fx || id === r.meId) return;
    if (!r.humans.some((h) => h.id === id)) return;
    const o = r.remotes.get(id);
    if (!o) return;
    if (fx.t === 's') {
      o.snaps.push({ at: performance.now(), x: +fx.x || 0, y: +fx.y || 0, z: fx.z | 0, f: fx.f < 0 ? -1 : 1, a: fx.a | 0 });
      if (o.snaps.length > 20) o.snaps.shift();
      o.s = +fx.s || 0; o.o = fx.o | 0;
    } else if (fx.t === 'sh') {
      if ((fx.z | 0) !== r.zone) return;
      r.shots.push({ x: +fx.x, y: +fx.y, y0: +fx.y, vx: (fx.f < 0 ? -1 : 1) * SHOT_V, t: 0, cork: !!fx.c, mine: false });
    } else if (fx.t === 'it') {
      const z = r.world[fx.z | 0], it = z?.items[fx.i | 0];
      if (!it || it.taken) return;
      it.taken = true;
      gain(it.k, false, o.name);
    } else if (fx.t === 'boss') r.bossDead = true;
    else if (fx.t === 'win') win(false);
  }
  function lerpRemotes() {
    const now = performance.now() - 110;
    for (const o of run.remotes.values()) {
      const s = o.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let n = s.length - 1; n > 0; n--) if (s[n - 1].at <= now) { a = s[n - 1]; b = s[n]; break; }
      const k = b.at > a.at ? clamp((now - a.at) / (b.at - a.at), 0, 1) : 1;
      if (a.z !== b.z) a = b;
      o.x = a.x + (b.x - a.x) * k; o.y = a.y + (b.y - a.y) * k;
      const c = k < .5 ? a : b;
      o.z = c.z; o.f = c.f; o.a = c.a;
    }
  }

  // ---------- drawing ----------
  function render() {
    const r = run, g = bx, z = Z(), zi = r.zone, T = THEMES[zi], art = r.art[zi], t = r.clock, cam = Math.round(r.camX);
    g.fillStyle = T.sky; g.fillRect(0, 0, VW, H);
    const back = r.backs[zi], bo = Math.round(cam * .3) % back.width;
    g.drawImage(back, -bo, 0); g.drawImage(back, back.width - bo, 0);
    const c0 = Math.floor(cam / TS), c1 = Math.min(z.W - 1, c0 + VW / TS + 1);
    for (const d of z.deco) if (d.x >= c0 - 1 && d.x <= c1) drawDeco(g, zi, d.x * TS - cam, d.y * TS, d.v, t);
    if (zi === 0) drawLander(g, z.spawn.x * TS + 8 - 20 - cam, (z.spawn.y + 1) * TS);
    for (let j = 0; j < ROWS; j++) for (let i = c0; i <= c1; i++) {
      const tl = z.tiles[j * z.W + i], X = i * TS - cam, Y = j * TS;
      if (tl === ROCK) g.drawImage(solidAt(z, i, j - 1) || j === 0 ? art.rock[(i * 7 + j * 3) % 3] : art.top[i % 2], X, Y);
      else if (tl === BLOCK) g.drawImage(art.block, X, Y);
      else if (tl === WALL) g.drawImage(art.wall, X, Y);
      else if (tl === SPIKE) g.drawImage(art.spike[Math.floor(t * 4 + i) % 2], X, Y);
      else if (tl === DOOR || tl === BACK || tl === LOCK) drawDoor(g, X, Y, tl === LOCK ? (r.team.key ? 'door' : 'lock') : tl === BACK ? 'back' : 'door', false, t);
    }
    // items, bobbing
    for (const it of z.items) {
      if (it.taken || (it.boss && !r.bossDead)) continue;
      const X = it.x * TS + 8 - cam;
      if (X < -16 || X > VW + 16) continue;
      const Y = it.y * TS + 8 + Math.sin(t * 3 + it.i) * 2;
      if (TREASURES.includes(it.k) && Math.floor(t * 6) % 2) { g.fillStyle = '#ffffff30'; g.fillRect(X - 9, Y - 9, 18, 18); }
      drawItem(g, it.k, X, Y);
    }
    for (const f of r.foes) drawFoe(g, { ...f, x: f.x - cam }, t);
    // the others, in this zone
    for (const o of r.remotes.values()) {
      if (o.z !== zi || o.o || r.gone.has(o.id)) continue;
      if (o.a === 4 && Math.floor(t * 10) % 2) continue;
      drawHero(g, o.x - cam, o.y, o.f, o.a === 4 ? 3 : o.a, o.color, { boots: r.team.boots });
      text(g, o.name, Math.round(o.x - cam), Math.round(o.y - 36), o.color, 1, '#000', 'center');
    }
    const me = r.me;
    if (!me.out && !(me.inv > 0 && me.dead <= 0 && Math.floor(t * 14) % 2)) {
      if (me.dead > 0) { if (me.y < VH + 30) drawHero(g, me.x - cam, me.y, me.face, 3, r.color, { visor: '#e04040' }); }
      else drawHero(g, me.x - cam, me.y, me.face, anim(me), r.color, { boots: r.team.boots, shoot: me.shootA > 0, jet: !me.ground && me.vy < 0 });
    }
    for (const s of r.shots) {
      const X = Math.round(s.x - cam), Y = Math.round(s.y), c = Math.floor(t * 20) % 2;
      g.fillStyle = s.mine ? '#ff8a1a' : '#8ad0ff'; g.fillRect(X - 3, Y - 2, 6, 4);
      g.fillStyle = c ? '#fff' : '#ffe04a'; g.fillRect(X - 1, Y - 1, 3, 2);
    }
    for (const p of r.parts) { g.fillStyle = p.c; g.fillRect(Math.round(p.x - cam), Math.round(p.y), 2, 2); }
    for (const p of r.pops) text(g, p.t, Math.round(p.x - cam), Math.round(p.y), '#ffe04a', 1, '#000', 'center');
    // the caves without the lantern: only a little halo around the captain
    if (z.dark) darkness(g, me.x - cam, me.y - 12, r.team.lantern ? 150 : 34);
    if (r.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, r.fade * 2.4)})`; g.fillRect(0, 0, VW, VH); }
    // what's going on
    if (r.msg && r.clock - r.msg.at < r.msg.d) box(g, r.msg.t, 8);
    const near = tileAt(z, Math.floor(me.x / TS), Math.floor((me.y - 1) / TS));
    if (r.phase === 'run' && me.ground && !me.dead && (near === DOOR || near === BACK || near === LOCK)) box(g, near === LOCK && !r.team.key ? 'verrouillée' : 'e : entrer', VH - 50);
    if (r.phase === 'count') {
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, VW, VH);
      text(g, 'capitaine lune', VW / 2, 44, '#ffe04a', 2, '#6a3a00', 'center');
      text(g, 'rapporte les trois trésors', VW / 2, 70, '#fff', 1, '#000', 'center');
      TREASURES.forEach((k, n) => drawItem(g, k, VW / 2 - 30 + n * 30, 94));
      text(g, r.remotes.size ? `${r.remotes.size + 1} capitaines · tout est partagé` : 'bonne chance, capitaine', VW / 2, 116, '#aaa', 1, '#000', 'center');
      const n = Math.ceil(COUNT - r.phaseT);
      if (r.phaseT > 0) text(g, n > 0 ? String(n) : 'go !', VW / 2, 134, '#fff', 2, '#000', 'center');
    }
    if (r.phase === 'win') {
      g.fillStyle = 'rgba(0,0,20,.6)'; g.fillRect(0, 30, VW, 90);
      text(g, 'victoire !', VW / 2, 44, '#ffe04a', 3, '#6a3a00', 'center');
      TREASURES.forEach((k, n) => drawItem(g, k, VW / 2 - 30 + n * 30, 84 + Math.sin(t * 4 + n) * 3));
      text(g, `${me.score.toLocaleString('fr-FR')} points`, VW / 2, 102, '#fff', 1, '#000', 'center');
    }
    if (r.phase === 'over') { g.fillStyle = 'rgba(20,0,0,.6)'; g.fillRect(0, 50, VW, 50); text(g, 'game over', VW / 2, 66, '#ff5a4a', 3, '#000', 'center'); }
    if (me.out && r.phase === 'run') box(g, 'plus de vies · les autres continuent', VH - 30);
    hud(g);
    blit();
  }
  function box(g, s, y) {
    const w = Math.min(VW - 8, s.length * 6 + 10);
    g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(VW / 2 - w / 2, y - 3, w, 13);
    text(g, s, VW / 2, y, '#fff', 1, null, 'center');
  }
  let dark = null;
  function darkness(g, x, y, rad) {
    if (!dark) dark = canvas(VW, VH);
    const [c, d] = dark;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VW, VH);
    d.fillStyle = 'rgba(0,0,0,.96)'; d.fillRect(0, 0, VW, VH);
    d.globalCompositeOperation = 'destination-out';
    const gr = d.createRadialGradient(x, y, rad * .4, x, y, rad);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = gr; d.fillRect(0, 0, VW, VH);
    d.globalCompositeOperation = 'source-over';
    g.drawImage(c, 0, 0);
  }
  function hud(g) {
    const r = run, me = r.me, y = VH;
    g.fillStyle = '#0a0a14'; g.fillRect(0, y, VW, H - y);
    g.fillStyle = '#3a3a5a'; g.fillRect(0, y, VW, 1);
    text(g, 'score', 4, y + 4, '#8a8aaa');
    text(g, String(me.score).padStart(6, '0'), 36, y + 4, '#fff');
    // lives: little helmets
    for (let n = 0; n < Math.min(7, me.lives); n++) { g.fillStyle = '#f4f4fa'; g.fillRect(4 + n * 9, y + 17, 7, 7); g.fillStyle = '#3cbcfc'; g.fillRect(7 + n * 9, y + 19, 3, 3); }
    if (me.lives > 7) text(g, '+' + (me.lives - 7), 66, y + 17, '#fff');
    if (r.phase === 'run') text(g, fmt(r.clock), VW - 4, 4, '#ffffffa0', 1, '#000', 'right');
    // the shield
    text(g, 'bouclier', 80, y + 4, '#8a8aaa');
    for (let n = 0; n < HP; n++) { g.fillStyle = n < me.hp ? (me.hp <= 2 ? '#ff4a4a' : '#2a8ae0') : '#20203a'; g.fillRect(80 + n * 8, y + 16, 7, 8); if (n < me.hp) { g.fillStyle = '#ffffff50'; g.fillRect(80 + n * 8, y + 16, 7, 2); } }
    // firepower: cans of cola
    text(g, 'tirs', 134, y + 4, '#8a8aaa');
    for (let n = 0; n < MAXCOLA; n++) { g.fillStyle = n < me.cola ? '#e02a2a' : '#20203a'; g.fillRect(134 + n * 6, y + 15, 4, 10); if (n < me.cola) { g.fillStyle = '#fff'; g.fillRect(134 + n * 6, y + 19, 4, 1); } }
    // the bag
    ['boots', 'cork', 'key', 'lantern', 'wand'].forEach((k, n) => { g.globalAlpha = r.team[k] ? 1 : .18; drawItem(g, k, 176 + n * 16, y + 9); });
    TREASURES.forEach((k, n) => { g.globalAlpha = r.team.tr[k] ? 1 : .18; drawItem(g, k, 192 + n * 20, y + 24); });
    g.globalAlpha = 1;
    text(g, String(r.zone + 1), 172, y + 21, '#8a8aaa');
  }
  function placeCanvas() {
    if (!cv) return;
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100vw', height: '100vh' });
  }
  function blit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((rect?.w ?? innerWidth) * dpr), ch = Math.round((rect?.h ?? innerHeight) * dpr);
    if (cv.width !== cw || cv.height !== ch || !over) {
      cv.width = cw; cv.height = ch;
      const s = Math.max(1, Math.floor(Math.min(cw / VW, ch / H))) || Math.min(cw / VW, ch / H);
      const w = VW * s, h = H * s;
      view = { s, w, h, ox: Math.floor((cw - w) / 2), oy: Math.floor((ch - h) / 2) };
      const [oc, ox] = canvas(w, h);
      if (s >= 3) { ox.fillStyle = 'rgba(0,0,0,.14)'; for (let j = 0; j < H; j++) ox.fillRect(0, j * s + s - Math.max(1, Math.floor(s / 3)), w, Math.max(1, Math.floor(s / 3))); }
      const gr = ox.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .72);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
      ox.fillStyle = gr; ox.fillRect(0, 0, w, h);
      over = oc;
    }
    const { w, h, ox, oy } = view;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#07060a'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#1a1a2a'; cx.fillRect(ox - 6, oy - 6, w + 12, h + 12);
    cx.drawImage(buf, ox, oy, w, h);
    cx.drawImage(over, ox, oy);
  }

  return {
    start, stop, update, onFx,
    respawn() {
      const me = run?.me;
      if (!run || run.phase !== 'run' || me.out || me.dead > 0) return;
      me.x = me.safe.x; me.y = me.safe.y; me.vx = me.vy = 0; me.inv = Math.max(me.inv, 1);
    },
    peerLeft(id) { if (!run) return; run.gone.add(id); run.remotes.delete(id); },
    hud() { return { hidden: true }; },
    setRect(r) { rect = r; placeCanvas(); over = null; },
    set onEnd(f) { onEnd = f; },
    // for the tests
    get _dbg() {
      return {
        get run() { return run; },
        sim(sec, inp = {}) { for (let i = 0; i < sec * 60 && run && !run.ended; i++) tick({ ...inp }); if (run && !run.ended) render(); },
        give(k) { gain(k, true, null); },
        goto(zi, where = 'start') { place(zi, where); },
      };
    },
  };
}
