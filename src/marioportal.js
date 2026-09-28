// marioportal.js, « super portail »: a 2D platformer on its own 256×240 canvas, a world 1 in the spirit of
// the 8-bit classic's third episode (the plain, the hills, the big blocks, the sky, the fortress), with a
// portal gun: aim with the mouse, blue and orange portals on the white panels, momentum kept through them.
// Mushrooms, fire flowers, the leaf (tail and flight), chestnuts, turtles and their shells (which go
// through portals too), pipe plants, the brute of the fortress, the card roulette at the end.
// Everyone runs the same level at once, each with their own portals; first to the end wins. In solo,
// ghost rivals race you. Everyone simulates their own miner and shares position, portals, blocks, coins.
import { text, textW, PAL, canvas, hexOf } from './nes-art.js';
import { createChip, rng, ord, fmt } from './retro.js';
import { LEVELS, LEVEL_NAMES, TS, E, GND, BRK, QB, USED, NOTE, WOOD, WHITE, PTL, PTR, PL, PR, COIN, SU, SD, SEMI, SEMIW, CLOUD, STONE, LAVA, SPIKE, HEDGE, SNOTE, KIND } from './marioportal-levels.js';
import { buildArt, heroFrames, drawTail, drawBig, drawBush, drawHill, drawCloud, drawSign } from './marioportal-art.js';

const W = 256, H = 240, VH = 208, STEP = 1 / 60, COUNT = 3, SEND = 1 / 15, DONE = 10, PMAX = 56;
const MODES = [
  { id: 'monde', name: 'monde 1', sub: 'les cinq niveaux d\'affilée · le premier au bout du monde', unit: 'time', lower: true },
  ...LEVEL_NAMES.map((n, k) => ({ id: 'n' + (k + 1), name: n, sub: 'un seul niveau · le premier à la carte', unit: 'time', lower: true })),
];
for (const m of MODES) m.help = 'q d : courir · espace : sauter · shift : course, boule de feu, queue · souris : viser · clic gauche / droit : portail bleu / orange · r : dernier drapeau';
const RIVALS = [
  { name: 'pioche', color: 0x3cbcfc, speed: 1.3 },
  { name: 'bêche', color: 0xf878f8, speed: 1.1 },
  { name: 'râteau', color: 0x80d010, speed: .92 },
];
const PCOL = ['#2a8cff', '#ff8a1a'], PCOL2 = ['#b8e0ff', '#ffe0b0'];
const FACES = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const SIZE = { gb: [14, 14], pg: [14, 14], kp: [14, 20], kr: [14, 20], kw: [14, 20], db: [14, 20], pp: [16, 24], pf: [16, 24], tw: [22, 28], pd: [8, 8], bb: [26, 30] };

export function createMarioPortal({ audio, ui } = {}) {
  let onEnd = () => {}, running = false, ended = true;
  let A = null, cv = null, cx = null, buf = null, bx = null, over = null, view = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let L, levels, order, lvIdx, mode, send, meId, me, meName, meColor, remotes, ghosts, enemies, items, shots, parts, bumps, portals, beams;
  let camX, camY, camLead, autoX, clock, phase, phaseT, acc, prev, score, coins, finOrder, sendT, frame, cpX, doneT, limit, cards, titleT, bossOn;
  const mouse = { sx: W / 2, sy: VH / 2, used: false, idle: 0 };
  const chip = createChip(.11);
  let musicOn = false, musicT = 0, musicStep = 0;

  // ---------- tiles ----------
  const tile = (tx, ty) => (tx < 0 || tx >= L.W || ty < 0 || ty >= L.H) ? E : L.tiles[ty * L.W + tx];
  const solidT = (t, c) => KIND[t] === 1 && !(t === HEDGE && c?.behind);
  const solid = (tx, ty, c) => tx < 0 || tx >= L.W ? true : ty < 0 || ty >= L.H ? false : solidT(L.tiles[ty * L.W + tx], c);
  // the first floor under open air in a column (past any ceiling), -1 over a pit or lava
  function groundTop(tx) {
    let open = 0;
    for (let ty = 0; ty < L.H; ty++) {
      const t = tile(tx, ty);
      if (t === LAVA) return -1;
      if (KIND[t] === 1 || KIND[t] === 2) { if (open >= 2) return ty; open = 0; } else open++;
    }
    return -1;
  }

  // ---------- bodies ----------
  function newHero(x, color) {
    return { x, y: 0, w: 12, h: 15, vx: 0, vy: 0, form: 0, face: 1, ground: false, coyote: 0, jbuf: 0, jumped: false, fast: false, airMax: 1.5, animT: 0, inv: 0, dead: 0, grow: 0,
      crouch: false, crouchT: 0, behind: false, pm: 0, fly: 0, flutter: 0, spin: 0, slide: false, flung: false, slope: 0, goal: null, hidden: false, color, port: true, chain: 0, fireT: 0 };
  }
  const heroH = (c) => c.form ? (c.crouch ? 16 : 26) : 15;
  function setForm(c, f) {
    const h0 = c.h; c.form = f; c.h = heroH(c); c.y += h0 - c.h;
  }
  function moveX(c, dx) {
    c.x += dx;
    if (c.x < 0) { c.x = 0; return true; }
    if (c.x + c.w > L.W * TS) { c.x = L.W * TS - c.w; return true; }
    const t = Math.floor(c.y / TS), b = Math.floor((c.y + c.h - 1 - (c.ground ? 5 : 0)) / TS);
    if (dx > 0) {
      const tx = Math.floor((c.x + c.w - 1) / TS);
      for (let ty = t; ty <= b; ty++) if (solid(tx, ty, c)) { if (c.port && tryPortal(c, 'L', tx, ty)) return 'p'; c.x = tx * TS - c.w; return true; }
    } else if (dx < 0) {
      const tx = Math.floor(c.x / TS);
      for (let ty = t; ty <= b; ty++) if (solid(tx, ty, c)) { if (c.port && tryPortal(c, 'R', tx, ty)) return 'p'; c.x = (tx + 1) * TS; return true; }
    }
    return false;
  }
  // returns the tile hit by the head, if any
  function moveY(c, dy, nudge = false) {
    const prevFoot = c.y + c.h;
    c.y += dy;
    const l = Math.floor(c.x / TS), r = Math.floor((c.x + c.w - 1) / TS);
    c.ground = false; c.under = E;
    if (dy > 0) {
      const ty = Math.floor((c.y + c.h) / TS);
      let hit = -1;
      for (let tx = l; tx <= r; tx++) if (solid(tx, ty, c)) { hit = tx; break; }
      if (hit < 0 && !c.drop) for (let tx = l; tx <= r; tx++) {
        const t = tile(tx, ty);
        if (KIND[t] === 2 && !(c.behind && t !== CLOUD) && prevFoot <= ty * TS + 1) { hit = tx; break; }
      }
      if (hit >= 0) {
        if (c.port && solid(hit, ty, c) && tryPortal(c, 'U', hit, ty)) return 'p';
        c.y = ty * TS - c.h; c.vy = 0; c.ground = true;
        const mid = Math.floor((c.x + c.w / 2) / TS);
        c.under = KIND[tile(mid, ty)] ? tile(mid, ty) : tile(hit, ty); c.underX = KIND[tile(mid, ty)] ? mid : hit; c.underY = ty;
      }
    } else if (dy < 0) {
      const ty = Math.floor(c.y / TS);
      const hits = [];
      for (let tx = l; tx <= r; tx++) if (solid(tx, ty, c)) hits.push(tx);
      if (hits.length) {
        if (nudge && hits.length === 1) {
          const tx = hits[0];
          if (tx === l && (tx + 1) * TS - c.x <= 4 && !solid(tx + 1, ty, c)) { c.x = (tx + 1) * TS; return null; }
          if (tx === r && c.x + c.w - tx * TS <= 4 && !solid(tx - 1, ty, c)) { c.x = tx * TS - c.w; return null; }
        }
        const mid = (c.x + c.w / 2) / TS;
        const tx = hits.reduce((a, b) => Math.abs(b + .5 - mid) < Math.abs(a + .5 - mid) ? b : a);
        if (c.port && tryPortal(c, 'D', tx, ty)) return 'p';
        c.y = (ty + 1) * TS; c.vy = Math.max(c.vy, .5);
        return { tx, ty };
      }
    }
    return null;
  }
  // the 45° hills: the feet follow the slope under the body's middle
  function slopeFix(c, was) {
    if (c.vy < 0) { c.slope = 0; return; }
    const mx = c.x + c.w / 2, tx = Math.floor(mx / TS), foot = c.y + c.h;
    for (let ty = Math.floor((foot - 12) / TS); ty <= Math.floor((foot + 8) / TS); ty++) {
      const t = tile(tx, ty);
      if (t !== SU && t !== SD) continue;
      const fx = mx - tx * TS, sy = ty * TS + (t === SU ? TS - fx : fx);
      if ((foot >= sy && foot <= sy + 12) || (was && foot < sy && sy - foot <= 7)) {
        c.y = sy - c.h; c.vy = 0; c.ground = true; c.slope = t === SU ? -1 : 1; c.under = t;
        return;
      }
    }
    c.slope = 0;
  }
  const over2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- portals ----------
  function tryPortal(c, face, tx, ty) {
    const P = portals;
    for (let k = 0; k < 2; k++) {
      const p = P[k];
      if (!p || p.face !== face) continue;
      if (face === 'U' || face === 'D') { if (p.ty !== ty) continue; const m = c.x + c.w / 2; if (m < p.tx * TS + 1 || m > (p.tx + 2) * TS - 1) continue; }
      else { if (p.tx !== tx) continue; const m = c.y + c.h / 2; if (m < p.ty * TS - 2 || m > (p.ty + 2) * TS + 2) continue; }
      const o = P[1 - k];
      if (!o) return false;
      teleport(c, p, o);
      return true;
    }
    return false;
  }
  function teleport(c, pin, pout) {
    const ni = FACES[pin.face], no = FACES[pout.face];
    let vx, vy;
    if (pin.face === pout.face) {
      // same way round: bounce off the normal, keep the slide along it
      const d = c.vx * ni[0] + c.vy * ni[1];
      vx = c.vx - 2 * d * ni[0]; vy = c.vy - 2 * d * ni[1];
    } else {
      const a = Math.atan2(no[1], no[0]) - Math.atan2(-ni[1], -ni[0]);
      const ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
      vx = c.vx * ca - c.vy * sa; vy = c.vx * sa + c.vy * ca;
    }
    const along = vx * no[0] + vy * no[1], min = pout.face === 'U' ? 3.4 : 2;
    if (along < min) { vx += no[0] * (min - along); vy += no[1] * (min - along); }
    const sp = Math.hypot(vx, vy); if (sp > 7.5) { vx *= 7.5 / sp; vy *= 7.5 / sp; }
    const horiz = pout.face === 'U' || pout.face === 'D';
    if (horiz) {
      c.x = (pout.tx + 1) * TS - c.w / 2;
      c.y = pout.face === 'U' ? pout.ty * TS - c.h - 1 : (pout.ty + 1) * TS + 1;
    } else {
      c.x = pout.face === 'L' ? pout.tx * TS - c.w - 1 : (pout.tx + 1) * TS + 1;
      c.y = Math.max(pout.ty * TS, Math.min((pout.ty + 2) * TS - c.h, (pout.ty + 1) * TS - c.h / 2));
    }
    c.vx = vx; c.vy = vy; c.ground = false; c.flung = true; c.airMax = Math.max(1.5, Math.abs(vx)); c.jumped = false; c.coyote = 0; c.slope = 0;
    if (c === me) { swirl(pin); swirl(pout); sfx.warp(); c.fly = Math.min(c.fly, 0); }
  }
  function swirl(p) {
    const [cxp, cyp] = portalMid(p);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; parts.push({ k: 'spark', x: cxp, y: cyp, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, t: 0, col: PCOL2[portals.indexOf(p)] || '#fff' }); }
  }
  const portalMid = (p) => p.face === 'U' ? [(p.tx + 1) * TS, p.ty * TS] : p.face === 'D' ? [(p.tx + 1) * TS, (p.ty + 1) * TS] : p.face === 'L' ? [p.tx * TS, (p.ty + 1) * TS] : [(p.tx + 1) * TS, (p.ty + 1) * TS];
  const gunAt = (c) => [c.x + c.w / 2 + c.face * 3, c.y + (c.form ? (c.crouch ? 8 : 13) : 9)];
  function aimAngle() {
    if (mouse.used) { const [gx, gy] = gunAt(me); return Math.atan2(camY + mouse.sy - gy, camX + mouse.sx - gx); }
    return me.face > 0 ? -.35 : Math.PI + .35;
  }
  // the beam: a walk through the grid, the first solid face it meets; leaves let it through
  function shootPortal(k) {
    if (me.dead || me.goal || phase !== 'run') return;
    const a = aimAngle(), dx = Math.cos(a), dy = Math.sin(a);
    if (Math.abs(dx) > .01) me.face = dx > 0 ? 1 : -1;
    const [ox, oy] = gunAt(me);
    let tx = Math.floor(ox / TS), ty = Math.floor(oy / TS);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let tmx = dx ? ((sx > 0 ? (tx + 1) * TS : tx * TS) - ox) / dx : Infinity, tmy = dy ? ((sy > 0 ? (ty + 1) * TS : ty * TS) - oy) / dy : Infinity;
    const tdx = dx ? TS / Math.abs(dx) : Infinity, tdy = dy ? TS / Math.abs(dy) : Infinity;
    let t = 0, face = null;
    for (let n = 0; n < 80; n++) {
      if (tmx < tmy) { t = tmx; tmx += tdx; tx += sx; face = sx > 0 ? 'L' : 'R'; } else { t = tmy; tmy += tdy; ty += sy; face = sy > 0 ? 'U' : 'D'; }
      if (t > 420 || tx < 0 || tx >= L.W || ty >= L.H) break;
      if (ty < 0) continue;
      const tt = tile(tx, ty);
      if (KIND[tt] !== 1 || tt === HEDGE) continue;
      const hx = ox + dx * t, hy = oy + dy * t;
      beams.push({ x0: ox, y0: oy, x1: hx, y1: hy, k, t: 0 });
      if (tt === WHITE && place(k, tx, ty, face, hx, hy)) return;
      fizzle(hx, hy, k);
      return;
    }
    beams.push({ x0: ox, y0: oy, x1: ox + dx * 420, y1: oy + dy * 420, k, t: 0 });
    sfx.fizzle();
  }
  function fizzle(x, y, k) {
    for (let n = 0; n < 6; n++) parts.push({ k: 'spark', x, y, vx: (Math.random() - .5) * 2.4, vy: (Math.random() - .5) * 2.4, t: 0, col: PCOL[k] });
    sfx.fizzle();
  }
  function place(k, tx, ty, face, hx, hy) {
    const horiz = face === 'U' || face === 'D', [nx, ny] = FACES[face];
    const ok = (x, y) => tile(x, y) === WHITE && !solid(x + nx, y + ny) && KIND[tile(x + nx, y + ny)] !== 3;
    const other = portals[1 - k];
    const free = (s) => !other || other.face !== face || (horiz ? other.ty !== ty || Math.abs(other.tx - s) >= 2 : other.tx !== tx || Math.abs(other.ty - s) >= 2);
    const firstHalf = horiz ? hx - tx * TS < TS / 2 : hy - ty * TS < TS / 2;
    for (const s of firstHalf ? [horiz ? tx - 1 : ty - 1, horiz ? tx : ty] : [horiz ? tx : ty, horiz ? tx - 1 : ty - 1]) {
      const good = horiz ? ok(s, ty) && ok(s + 1, ty) : ok(tx, s) && ok(tx, s + 1);
      if (!good || !free(s)) continue;
      portals[k] = horiz ? { face, tx: s, ty } : { face, tx, ty: s };
      send({ t: 'pt', k, f: face, x: portals[k].tx, y: portals[k].ty, lv: lvIdx });
      swirl(portals[k]);
      sfx.portal(k);
      return true;
    }
    return false;
  }

  // ---------- life cycle ----------
  function start({ seed: sd = 1, humans = [], hostId, meId: id = 'me', send: s, opts = {} } = {}) {
    stop();
    A = A || buildArt();
    meId = id; send = s || (() => {});
    mode = MODES.find((m) => m.id === opts.mode) ? opts.mode : 'monde';
    order = mode === 'monde' ? [0, 1, 2, 3, 4] : [+mode.slice(1) - 1];
    levels = order.map((n) => LEVELS[n]());
    limit = mode === 'monde' ? 900 : 300;
    const mine = humans.find((h) => h.me) || { name: 'toi', color: 0xc8581a };
    meName = mine.name === 'toi' ? 'creuseur' : mine.name; meColor = mine.color ?? 0xc8581a;
    const slot = Math.max(0, humans.indexOf(mine));
    remotes = new Map();
    humans.forEach((h) => { if (!h.me) remotes.set(h.id, { id: h.id, name: h.name, color: h.color, snaps: [], x: 0, y: 0, a: 0, f: 1, p: 0, h: 0, lv: 0, fin: null, order: 0, portals: [null, null] }); });
    ghosts = [];
    if (humans.length <= 1) {
      const R = rng((sd >>> 0) ^ 0x9e3779b9);
      RIVALS.forEach((r, n) => ghosts.push({ ...r, tag: n, speed: r.speed * (.94 + R() * .12), c: null, lv: 0, ax: 0, fin: null, order: 0, hold: 0, lastX: 0, stuck: 0, respawn: 0, wait: 0 }));
    }
    prevBeep = 4; score = 0; coins = 0; finOrder = 0; sendT = 0; frame = 0; cards = []; clock = 0; phase = 'count'; phaseT = 0; acc = 0; doneT = 0;
    prev = { jump: false, run: false, a: false, e: false };
    me = newHero(0, meColor);
    loadLevel(0, slot);
    cv = document.createElement('canvas');
    cv.id = 'marioportal';
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:15;pointer-events:auto;image-rendering:pixelated;background:#07060a;cursor:none';
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(cv);
    place2();
    cx = cv.getContext('2d');
    [buf, bx] = canvas(W, H);
    chip.init();
    running = true; ended = false;
    render();
  }
  function loadLevel(n, slot = 0) {
    lvIdx = n; L = levels[n];
    const sx = (L.start + (slot % 4) * .8) * TS;
    Object.assign(me, { x: sx, vx: 0, vy: 0, goal: null, hidden: false, behind: false, dead: 0, fly: 0, flutter: 0, spin: 0, slide: false, flung: false, pm: 0, crouch: false, crouchT: 0 });
    me.h = heroH(me);
    me.y = groundTop(Math.floor(sx / TS)) * TS - me.h;
    cpX = sx;
    enemies = []; items = []; shots = []; parts = []; bumps = new Map(); beams = []; portals = [null, null];
    for (const s of L.enemies) { s.active = false; s.killed = false; s.inWin = false; }
    for (const r of remotes.values()) r.portals = [null, null];
    camLead = 0; camX = 0; camY = Math.max(0, L.H * TS - VH); autoX = 0; titleT = 2.5; bossOn = false;
    for (const g of ghosts) if (g.lv === n && g.fin == null) placeGhost(g, Math.floor(Math.max(g.ax, (L.start + 1 + g.tag) * TS) / TS));
    follow(true);
  }
  function stop() {
    running = false;
    if (cv) { cv.remove(); cv = null; cx = null; }
    over = null; musicOn = false;
    chip.close();
  }
  function end(res) {
    if (ended) return;
    ended = true;
    musicOn = false;
    onEnd(res);
  }
  function onMove(e) {
    const r = cv.getBoundingClientRect(), k = cv.width / Math.max(1, r.width);
    mouse.sx = ((e.clientX - r.left) * k - view.ox) / view.s;
    mouse.sy = ((e.clientY - r.top) * k - view.oy) / view.s;
    mouse.used = true; mouse.idle = 0;
  }
  function onDown(e) {
    e.preventDefault();
    chip.init(); audio?.init?.();
    onMove(e);
    if (e.button === 0 || e.button === 2) shootPortal(e.button === 0 ? 0 : 1);
  }

  // ---------- the loop ----------
  function update(dt, keys) {
    if (!running) return;
    dt = Math.min(dt, .1);
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = {
      l: k('ArrowLeft', 'KeyA'), r: k('ArrowRight', 'KeyD'), d: k('ArrowDown', 'KeyS'),
      jump: k('Space', 'KeyW', 'ArrowUp', 'KeyZ'),
      run: k('ShiftLeft', 'ShiftRight', 'KeyK', 'KeyJ', 'KeyX'),
      a: k('KeyQ'), e: k('KeyE'),
    };
    inp.jumpEdge = inp.jump && !prev.jump; inp.runEdge = inp.run && !prev.run;
    if (inp.a && !prev.a) shootPortal(0);
    if (inp.e && !prev.e) shootPortal(1);
    prev = { jump: inp.jump, run: inp.run, a: inp.a, e: inp.e };
    if (dt > 0) chip.init();
    acc += dt;
    while (acc >= STEP) { acc -= STEP; tick(inp); inp.jumpEdge = false; inp.runEdge = false; if (!running) return; }
    music();
    sendT += dt;
    if (sendT >= SEND && dt > 0) {
      sendT = 0;
      send({ t: 's', x: Math.round(me.x), y: Math.round(me.y), a: anim(me), f: me.face, p: me.form, c: me.crouch ? 1 : 0, h: me.hidden ? 1 : 0, b: me.behind ? 1 : 0, lv: lvIdx, g: Math.round(aimAngle() * 100) });
    }
    render();
  }
  const raceTime = () => Math.max(0, clock - COUNT);
  function tick(inp) {
    frame++;
    clock += STEP; phaseT += STEP; if (titleT > 0) titleT -= STEP;
    mouse.idle += STEP;
    if (phase === 'count') {
      const n = Math.ceil(COUNT - clock);
      if (n !== prevBeep && n > 0) { prevBeep = n; sfx.beep(false); }
      if (clock >= COUNT) { phase = 'run'; phaseT = 0; sfx.beep(true); musicOn = true; }
      heroPhysics(me, {});
      follow(true);
      return;
    }
    if (phase === 'run') {
      stepMe(inp);
      if (raceTime() >= limit && me.fin == null) { phase = 'timeup'; phaseT = 0; musicOn = false; sfx.time(); }
    } else if (phase === 'done') {
      doneT += STEP;
      const all = [...remotes.values(), ...ghosts].every((r) => r.fin != null);
      if (doneT >= DONE || (all && doneT >= 4)) return finish();
    } else if (phase === 'timeup') {
      if (phaseT > 3) { const list = standings(), place = list.findIndex((r) => r.me) + 1; return end({ place, of: list.length, time: limit, text: `temps écoulé · ${ord(place)} place · ${coins} pièces` }); }
    }
    if (me.goal) stepGoal();
    stepGhosts();
    stepEnemies();
    stepItems();
    stepParts();
    for (const [i, b] of bumps) if (b.f >= 10) bumps.delete(i); else b.f++;
    follow(false);
  }
  let prevBeep = 4;
  function finish() {
    const of = racers().length;
    const place = Math.min(of, me.order || of);
    end({ place, of, time: Math.round(me.fin * 10) / 10, text: `${ord(place)} place sur ${of} en ${fmt(me.fin)} · ${coins} pièce${coins > 1 ? 's' : ''}` });
  }
  const racers = () => [{ fin: me.fin }, ...remotes.values(), ...ghosts];

  // ---------- the camera: ahead where you aim, up when you fly, never back on the scrolling sky ----------
  function follow(snap) {
    const want = mouse.used && mouse.idle < 4 ? Math.max(-64, Math.min(64, (mouse.sx - W / 2) * .5)) : me.face * 20;
    camLead += (want - camLead) * (snap ? 1 : .06);
    if (!me.dead) {
      let tx = me.x + me.w / 2 - W / 2 + camLead;
      tx = Math.max(0, Math.min(L.W * TS - W, tx));
      if (L.auto) {
        if (phase === 'run' && !me.goal) autoX = Math.min(L.W * TS - W, autoX + L.auto);
        camX = autoX = Math.max(autoX, snap ? tx : camX + (tx - camX) * .3);
      } else camX = snap ? tx : camX + (tx - camX) * .3;
      const ty = Math.max(0, Math.min(L.H * TS - VH, me.y - 72));
      camY = snap ? ty : camY + (ty - camY) * .15;
    }
  }

  // ---------- me ----------
  function heroPhysics(c, inp) {
    const was = c.ground;
    // crouch on the ground (big), slide down a slope
    const wantCrouch = !!inp.d && c.ground && !c.slope && c.form > 0;
    if (wantCrouch !== c.crouch) { const h0 = c.h; c.crouch = wantCrouch; c.h = heroH(c); c.y += h0 - c.h; }
    if (inp.d && c.ground && c.slope && !c.slide) c.slide = true;
    if (c.slide && (!inp.d && !c.slope || (c.ground && !c.slope && Math.abs(c.vx) < .4) || inp.jumpEdge)) c.slide = false;
    const dir = c.crouch || c.slide ? 0 : (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const top = c.pm >= PMAX ? 3.05 : inp.run ? 2.5 : 1.5;
    c.skid = false;
    if (c.ground) {
      if (c.slide) {
        if (c.slope) c.vx = Math.max(-3.6, Math.min(3.6, c.vx + c.slope * .14));
        else { const s = Math.sign(c.vx); c.vx -= s * .06; if (Math.sign(c.vx) !== s) c.vx = 0; }
      } else if (dir) {
        if (c.vx * dir < 0 && Math.abs(c.vx) > .4) { c.vx += dir * .14; c.skid = true; }
        else {
          c.face = dir;
          const sp = c.vx * dir;
          if (sp < top) c.vx = dir * Math.min(top, sp + (inp.run ? .07 : .045));
          else c.vx = dir * Math.max(top, sp - .05);
        }
      } else { const s = Math.sign(c.vx); c.vx -= s * (c.crouch ? .08 : .06); if (Math.sign(c.vx) !== s) c.vx = 0; }
      // the P meter fills while you run flat out on the ground
      if (inp.run && dir && Math.abs(c.vx) >= 2.45) c.pm = Math.min(PMAX, c.pm + 1);
      else if (!c.fly) c.pm = Math.max(0, c.pm - 2);
    } else if (dir) {
      c.face = dir;
      c.vx += dir * (c.vx * dir < 0 ? .08 : .05);
      const cap = Math.max(1.5, c.airMax);
      if (Math.abs(c.vx) > cap) c.vx = Math.sign(c.vx) * cap;
    } else if (!c.flung) { const s = Math.sign(c.vx); c.vx -= s * .01; if (Math.sign(c.vx) !== s) c.vx = 0; }
    if (inp.jumpEdge) c.jbuf = 7; else if (c.jbuf) c.jbuf--;
    let jumped = false;
    if (c.jbuf && (c.ground || c.coyote > 0)) {
      const sp = Math.abs(c.vx);
      c.jbuf = 0; c.coyote = 0; c.fast = sp > 2.1;
      c.vy = sp > 2.9 ? -5.3 : sp > 2.1 ? -5 : sp > 1 ? -4.4 : -4.2;
      c.ground = false; c.airMax = Math.max(1.5, sp); c.jumped = true; c.flung = false; c.slide = false; jumped = true;
      if (c.form === 3 && c.pm >= PMAX) { c.fly = 250; }
    } else if (inp.jumpEdge && !c.ground && c.form === 3) {
      if (c.fly > 0) { c.vy = Math.min(c.vy, -2.3); c.wag = 10; sfx.wag(); }
      else if (c.vy > 0) { c.flutter = 16; c.wag = 10; sfx.wag(); }
    }
    const g = c.vy < 0 && inp.jump && c.jumped ? (c.fast ? .16 : .125) : c.flung && c.vy < 0 ? .22 : c.fly > 0 ? .2 : .44;
    c.vy = Math.min(c.flutter > 0 ? .9 : 5.8, c.vy + g);
    if (c.flutter) c.flutter--;
    if (c.wag) c.wag--;
    if (c.fly > 0) { c.fly--; c.pm = PMAX; if (!c.fly) c.pm = 0; }
    const mx = moveX(c, c.vx);
    if (mx === true) c.vx = 0;
    const head = mx === 'p' ? null : moveY(c, c.vy, c === me);
    if (head !== 'p' && mx !== 'p') slopeFix(c, was);
    if (c.ground) { c.jumped = false; c.coyote = 0; c.airMax = 1.5; c.flung = false; if (c.fly && !jumped) c.fly = 0; }
    else if (was && !jumped && mx !== 'p' && head !== 'p') { c.coyote = 6; c.airMax = Math.max(1.5, Math.abs(c.vx)); }
    else if (c.coyote) c.coyote--;
    c.animT += Math.abs(c.vx) * .1;
    return { head: head && head !== 'p' ? head : null, jumped };
  }
  const anim = (c) => c.dead ? 5 : c.crouch ? 6 : c.spin || c.fireT > 0 ? 7 : !c.ground ? 3 : c.skid ? 4 : Math.abs(c.vx) < .15 ? 0 : [0, 1, 0, 2][Math.floor(c.animT) % 4];
  function stepMe(inp) {
    const c = me;
    if (c.inv) c.inv--;
    if (c.fireT) c.fireT--;
    if (c.dead) {
      c.dead++;
      if (c.dead > 30) { c.vy = Math.min(4, c.vy + .25); c.y += c.vy; }
      if (c.dead > 140) respawnAt();
      return;
    }
    if (c.grow) { c.grow--; return; }
    if (c.goal) return;
    // the tail
    if (inp.runEdge && c.form === 3 && !c.spin) { c.spin = 18; sfx.wag(); }
    if (inp.runEdge && c.form === 2 && shots.length < 2) {
      shots.push({ x: c.face > 0 ? c.x + c.w : c.x - 8, y: c.y + 8, w: 8, h: 8, vx: 3.6 * c.face, vy: 1.5, t: 0, port: true });
      c.fireT = 10; sfx.fire();
    }
    if (c.spin) { c.spin--; tailHits(c); }
    const { head, jumped } = heroPhysics(c, inp);
    if (jumped) sfx.jump(c.form > 0);
    if (head) hitBlock(head.tx, head.ty, 'head');
    // note blocks throw you up, higher if you hold jump
    if (c.ground && (c.under === NOTE || c.under === SNOTE)) {
      const sup = c.under === SNOTE;
      c.vy = inp.jump ? (sup ? -9 : -6.4) : -3.6; c.jumped = inp.jump; c.fast = false; c.ground = false; c.airMax = Math.max(1.5, Math.abs(c.vx));
      bump(c.underX, c.underY, 1); sfx.note(sup && inp.jump);
    }
    // the white big block: crouch on it long enough and you fall behind the scenery
    if (c.ground && c.under === SEMIW && inp.d) {
      if (++c.crouchT === 150) { c.behind = true; c.y += 2; c.ground = false; sfx.behind(); pop('derrière !', c.x - 8, c.y - 10); }
    } else c.crouchT = 0;
    // coins as tiles
    const l = Math.floor(c.x / TS), r = Math.floor((c.x + c.w - 1) / TS), tt = Math.floor(c.y / TS), b = Math.floor((c.y + c.h - 1) / TS);
    for (let ty = tt; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      const t = tile(tx, ty);
      if (t === COIN) takeCoin(tx, ty);
      else if (t === LAVA && c.y + c.h > ty * TS + 6) return die(true);
    }
    if (c.ground && c.under === SPIKE) hurt();
    if (L.cp && cpX < L.cp * TS && c.x > L.cp * TS) { cpX = L.cp * TS; pop('relais !', c.x, c.y - 10); sfx.power(); }
    // bounce on the heads of the others
    if (c.vy > 0) for (const o of others()) {
      if (Math.abs(o.x - c.x) < 12 && c.y + c.h >= o.y && c.y + c.h - c.vy <= o.y + 3) { c.y = o.y - c.h; c.vy = prev.jump ? -4.6 : -3.2; c.fast = false; c.jumped = true; sfx.stomp(); break; }
    }
    if (c.y > L.H * TS + 8) return die(false);
    // the scrolling sky pushes you, and crushes you against a wall
    if (L.auto && c.x < camX) { c.x = camX; if (solid(Math.floor((c.x + c.w) / TS), Math.floor((c.y + c.h / 2) / TS), c)) return die(true); }
    hitEnemies(c);
    // the end: the card roulette, or the orb of the brute
    if (!L.boss && c.x + c.w >= L.goal * TS) reachGoal(['mush', 'flower', 'star'][Math.floor(frame / 8) % 3]);
    for (const it of items) if (it.k === 'orb' && !it.rise && over2(c, it)) { it.gone = true; reachGoal('star'); }
  }
  function reachGoal(card) {
    const c = me;
    c.goal = { t: 0 }; c.vx = 0; c.fly = 0; c.spin = 0; c.face = 1; c.slide = false;
    cards.push(card);
    const bonus = card === 'star' ? 5000 : card === 'flower' ? 2000 : 1000;
    score += bonus; pop(String(bonus), c.x, c.y - 12);
    musicOn = false; sfx.goal();
    const last = lvIdx === levels.length - 1;
    if (last) {
      c.fin = raceTime(); c.order = ++finOrder;
      phase = 'done'; doneT = 0;
      send({ t: 'fin', time: Math.round(c.fin * 10) / 10 });
    } else send({ t: 'lv', lv: lvIdx + 1 });
  }
  // after the card: walk off to the right, then (in the world) the next level
  function stepGoal() {
    const c = me, g = c.goal;
    g.t++;
    if (g.t > 30) { c.vx = 1.4; c.face = 1; c.animT += .14; moveX(c, c.vx); }
    c.vy = Math.min(4, c.vy + .4); moveY(c, c.vy); slopeFix(c, true);
    if (c.x > camX + W + 8) c.hidden = true;
    if (g.t > 150 && lvIdx < levels.length - 1 && phase === 'run') { loadLevel(lvIdx + 1); musicOn = true; }
  }
  function die(hop = true) {
    if (me.dead) return;
    me.dead = hop ? 1 : 60; me.vx = 0; me.vy = hop ? -4 : 0;
    me.fly = 0; me.spin = 0; me.slide = false; me.crouch = false;
    setForm(me, 0);
    musicOn = false; sfx.die();
  }
  function hurt() {
    if (me.inv || me.dead || me.grow || me.goal) return;
    if (me.form) { setForm(me, me.form > 1 ? 1 : 0); me.inv = 120; me.fly = 0; sfx.shrink(); return; }
    die(true);
  }
  function respawnAt() {
    const tx = Math.floor(cpX / TS);
    me.x = cpX; me.form = 0; me.crouch = false; me.h = heroH(me);
    me.y = Math.max(0, groundTop(tx)) * TS - me.h;
    me.vx = me.vy = 0; me.dead = 0; me.inv = 120; me.jumped = false; me.behind = false; me.flung = false; me.pm = 0;
    // what was near comes back
    enemies = enemies.filter((e) => e.k === 'bb' && !bossOn ? false : Math.abs(e.x - cpX) > W * 1.5);
    for (const s of L.enemies) if (!s.killed && !enemies.some((e) => e.i === s.i)) { s.active = false; s.inWin = false; }
    if (bossOn) { bossOn = false; setBossDoor(false); }
    items = items.filter((i) => i.k === 'orb');
    autoX = Math.max(0, Math.min(autoX, cpX - 32));
    camX = Math.max(0, Math.min(L.W * TS - W, cpX - W / 2)); if (L.auto) autoX = camX;
    score = Math.max(0, score - 200);
    musicOn = true;
  }
  function others() {
    const out = [];
    for (const r of remotes.values()) if (!r.h && r.lv === lvIdx && r.snaps.length && !r.b === !me.behind) out.push({ x: r.x, y: r.y });
    for (const g of ghosts) if (g.lv === lvIdx && g.c && !g.c.hidden && !g.respawn) out.push({ x: g.c.x, y: g.c.y });
    return out;
  }
  // the tail swats both sides at hip height
  function tailHits(c) {
    const hb = { x: c.x - 10, y: c.y + c.h - 12, w: c.w + 20, h: 10 };
    for (const e of enemies) if (e.alive && e.k !== 'tw' && e.k !== 'pd' && over2(hb, box(e))) {
      if (e.k === 'bb') { hitBoss(e, 1); continue; }
      if (e.k === 'db') { e.st = 'pile'; e.t = 0; continue; }
      kill(e, true); scorePop(e, 100);
    }
    if (c.spin === 12) for (const dx of [-1, 1]) {
      const tx = Math.floor((c.x + c.w / 2 + dx * 14) / TS), ty = Math.floor((c.y + c.h - 6) / TS);
      const t = tile(tx, ty);
      if (t === BRK || t === QB || t === NOTE || t === WOOD) hitBlock(tx, ty, 'tail');
    }
  }

  // ---------- blocks, coins, items ----------
  function bump(tx, ty, d = -1) { bumps.set(ty * L.W + tx, { f: 0, d }); }
  function takeCoin(tx, ty, silent) {
    L.tiles[ty * L.W + tx] = E;
    if (silent) return;
    coins++; score += 50; sfx.coin();
    send({ t: 'c', i: ty * L.W + tx, lv: lvIdx });
  }
  function coinPop(tx, ty) {
    parts.push({ k: 'coin', x: tx * TS, y: ty * TS - 16, vy: -5, t: 0 });
    coins++; score += 100; sfx.coin();
  }
  function hitBlock(tx, ty, by) {
    const i = ty * L.W + tx, t = L.tiles[i], c = L.content.get(i);
    if (t === QB || ((t === NOTE || t === WOOD) && c)) {
      if (t === QB) L.tiles[i] = USED;
      L.content.delete(i); bump(tx, ty);
      if (c === 'coin' || !c) coinPop(tx, ty);
      else spawnItem(c, tx, ty);
      send({ t: 'b', i, m: 1, lv: lvIdx });
    } else if (t === BRK) {
      if (me.form || by !== 'head') { L.tiles[i] = E; debris(tx, ty); score += 50; sfx.brick(); send({ t: 'b', i, m: 2, lv: lvIdx }); }
      else { bump(tx, ty); sfx.bump(); send({ t: 'b', i, m: 4, lv: lvIdx }); }
    } else if (t === NOTE || t === WOOD || t === SNOTE) { bump(tx, ty); sfx.bump(); }
    else sfx.bump();
    for (const e of enemies) if (e.alive && e.k !== 'pp' && e.k !== 'pf' && e.k !== 'tw' && e.k !== 'bb' && Math.abs(e.y + e.h - ty * TS) < 4 && e.x + e.w > tx * TS && e.x < tx * TS + TS) { kill(e, true); scorePop(e, 100); }
    if (tile(tx, ty - 1) === COIN) { takeCoin(tx, ty - 1, true); coinPop(tx, ty - 1); send({ t: 'c', i: (ty - 1) * L.W + tx, lv: lvIdx }); }
  }
  function spawnItem(c, tx, ty) {
    let k = c;
    if (c === 'pow') k = !me.form ? 'mush' : me.form === 3 ? 'flower' : 'leaf';
    const it = { k, x: tx * TS, y: ty * TS, w: 16, h: 16, vx: 0, vy: 0, rise: 16, t: 0 };
    if (k === 'leaf') { it.rise = 0; it.vy = -3.2; it.y -= 8; it.leaf = true; }
    items.push(it); sfx.sprout();
  }
  function debris(tx, ty) {
    for (const [dx, dy, vx, vy] of [[0, 0, -1.2, -5], [8, 0, 1.2, -5], [0, 8, -1.2, -3], [8, 8, 1.2, -3]]) parts.push({ k: 'debris', x: tx * TS + dx, y: ty * TS + dy, vx, vy, t: 0 });
  }
  function stepItems() {
    for (const it of items) {
      it.t++;
      if (it.rise > 0) { it.rise -= .5; it.y -= .5; if (it.rise <= 0 && it.k === 'mush') it.vx = 1.2; continue; }
      if (it.k === 'mush') {
        it.vy = Math.min(4, it.vy + .3);
        if (moveX(it, it.vx)) it.vx = -it.vx;
        moveY(it, it.vy); slopeFix(it, it.ground);
      } else if (it.k === 'leaf') {
        // up, then swinging down like a leaf
        if (it.vy < 0) { it.vy += .15; it.y += it.vy; }
        else { it.y += .55; it.x += Math.sin(it.t * .07) * 1.3; }
      } else if (it.k === 'orb') { it.vy = Math.min(4, it.vy + .25); moveY(it, it.vy); }
      if (it.k !== 'orb' && !me.dead && !me.goal && over2(me, { x: it.x + 2, y: it.y + 2, w: 12, h: 13 })) {
        it.gone = true; score += 1000; pop('1000', it.x, it.y);
        sfx.power();
        if (it.k === 'mush') { if (!me.form) { setForm(me, 1); me.grow = 40; } }
        else if (it.k === 'flower') { if (!me.form) { setForm(me, 2); me.grow = 40; } else setForm(me, 2); }
        else if (it.k === 'leaf') { setForm(me, 3); parts.push({ k: 'poof', x: me.x + 2, y: me.y + 6, t: 0 }); }
      }
      if (it.y > L.H * TS + 16 || it.x < camX - 64 || it.x > camX + W + 64) it.gone = it.k !== 'orb';
    }
    items = items.filter((i) => !i.gone);
    for (const s of shots) {
      s.t++;
      s.vy = Math.min(4, s.vy + .32);
      const mx = moveX(s, s.vx);
      if (mx === true) s.gone = true;
      const my = moveY(s, s.vy); if (s.ground) s.vy = -2.8;
      if (my && my !== 'p') s.gone = true;
      for (const e of enemies) if (e.alive && over2(s, box(e))) {
        if (e.k === 'tw' || e.k === 'pd' || e.k === 'db') { s.gone = true; break; }
        if (e.k === 'bb') { hitBoss(e, .34); s.gone = true; break; }
        kill(e, true); scorePop(e, 200); s.gone = true; break;
      }
      if (tile(Math.floor((s.x + 4) / TS), Math.floor((s.y + 4) / TS)) === LAVA) s.gone = true;
      if (s.gone) parts.push({ k: 'poof', x: s.x, y: s.y, t: 0 });
      if (s.t > 200 || s.x < camX - 16 || s.x > camX + W + 16 || s.y > L.H * TS) s.gone = true;
    }
    shots = shots.filter((s) => !s.gone);
  }
  const pop = (s, x, y) => parts.push({ k: 'text', s, x, y, t: 0 });
  function scorePop(e, v) { v *= Math.max(1, Math.min(8, 2 ** me.chain)); score += v; pop(String(v), e.x, e.y - 4); }
  function stepParts() {
    for (const p of parts) {
      p.t++;
      if (p.k === 'debris') { p.vy += .3; p.x += p.vx; p.y += p.vy; if (p.t > 90) p.gone = true; }
      else if (p.k === 'coin') { p.vy += .35; p.y += p.vy; if (p.t > 28) { p.gone = true; pop('100', p.x, p.y); } }
      else if (p.k === 'text') { p.y -= .6; if (p.t > 45) p.gone = true; }
      else if (p.k === 'spark') { p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; if (p.t > 22) p.gone = true; }
      else if (p.k === 'poof' && p.t > 14) p.gone = true;
      else if (p.k === 'efire') { p.x += p.vx; p.y += p.vy; if (p.t > 240) p.gone = true; if (!me.dead && over2(me, { x: p.x, y: p.y, w: 7, h: 7 })) hurt(); }
    }
    parts = parts.filter((p) => !p.gone);
    for (const b of beams) b.t++;
    beams = beams.filter((b) => b.t < 8);
  }

  // ---------- enemies ----------
  const box = (e) => (e.k === 'pp' || e.k === 'pf') ? { x: e.x + 2, y: e.by - e.off + 2, w: 12, h: Math.max(0, e.off - 2) } : e;
  function spawn() {
    for (const s of L.enemies) {
      const inWin = s.x > camX - 48 && s.x < camX + W + 48;
      if (inWin && !s.inWin && !s.active && !s.killed) {
        s.active = true;
        const [w, h] = SIZE[s.k];
        const e = { i: s.i, k: s.k, x: s.x + 1, y: s.y - h, w, h, vx: -.5, vy: 0, st: 'walk', t: 0, alive: true, ground: false };
        if (s.k === 'pp' || s.k === 'pf') { e.x = s.x; e.by = s.y; e.off = 0; e.t = 1.5 + (s.i % 3) * .4; }
        if (s.k === 'tw') { e.y = s.y; e.y0 = s.y; e.st = 'wait'; e.vx = 0; e.x = s.x - 3; }
        if (s.k === 'pd') { e.y0 = s.y; e.y = s.y + 8; e.st = 'lava'; e.t = (s.i % 4) * 30; e.vx = 0; }
        if (s.k === 'bb') { e.hp = 3; e.st = 'idle'; e.vx = 0; }
        enemies.push(e);
      }
      s.inWin = inWin;
    }
  }
  function kill(e, flip, remote) {
    if (!e.alive) return;
    e.alive = false;
    const s = L.enemies[e.i]; if (s) s.killed = true;
    e.wasShell = e.st === 'shell';
    if (flip) { e.st = 'flip'; e.vy = -3; e.vx = e.vx >= 0 ? .6 : -.6; } else { e.st = 'flat'; e.t = 0; }
    if (!remote) { send({ t: 'e', i: e.i, lv: lvIdx }); if (flip) sfx.kick(); }
  }
  function hitBoss(e, dmg) {
    if (e.inv > 0 || !e.alive) return;
    e.hp -= dmg; e.inv = 50; sfx.bossHit();
    if (e.hp <= 0) {
      kill(e, true); score += 5000; pop('5000', e.x, e.y);
      items.push({ k: 'orb', x: (L.boss.x0 + L.boss.x1) / 2 * TS - 8, y: 3 * TS, w: 16, h: 16, vx: 0, vy: 0, rise: 0, t: 0 });
      setBossDoor(false);
    } else { e.st = 'spin'; e.t = 0; e.vx = (e.x < me.x ? -1 : 1) * 2.4; e.vy = -3; }
  }
  function setBossDoor(shut) {
    const x = L.boss.x0 - 1;
    for (let y = L.G - 3; y < L.G; y++) L.tiles[y * L.W + x] = shut ? STONE : E;
  }
  function stepEnemies() {
    spawn();
    for (const e of enemies) {
      e.t++;
      if (e.inv) e.inv--;
      if (e.st === 'flip') { e.vy += .3; e.x += e.vx; e.y += e.vy; if (e.y > L.H * TS + 16) e.gone = true; continue; }
      if (e.st === 'flat') { if (e.t > 30) e.gone = true; continue; }
      if (e.k === 'pp' || e.k === 'pf') {
        const near = Math.abs(me.x + me.w / 2 - (e.x + 8)) < 26;
        const per = 4.2;
        e.ph = (e.ph || 0);
        if (!(e.ph % per >= 3.2 && near)) e.ph += STEP;
        const p = e.ph % per;
        e.off = p < 1 ? p * 24 : p < 2.2 ? 24 : p < 3.2 ? (3.2 - p) * 24 : 0;
        if (e.k === 'pf' && p > 1.5 && p - STEP <= 1.5 && !me.dead) {
          const dx = me.x - e.x, dy = me.y - (e.by - 24), d = Math.hypot(dx, dy) || 1;
          parts.push({ k: 'efire', x: e.x + 4, y: e.by - 22, vx: dx / d * 1.2, vy: dy / d * 1.2, t: 0 });
        }
      } else if (e.k === 'tw') {
        const under = me.x + me.w > e.x - 20 && me.x < e.x + e.w + 20 && me.y > e.y;
        if (e.st === 'wait' && under && !me.dead) e.st = 'fall';
        if (e.st === 'fall') { e.vy = Math.min(6, e.vy + .45); if (moveY(e, e.vy) || e.ground) { e.st = 'land'; e.t = 0; sfx.thud(); } }
        else if (e.st === 'land') { if (e.t > 60) e.st = 'rise'; }
        else if (e.st === 'rise') { e.y -= 1; e.vy = 0; if (e.y <= e.y0) { e.y = e.y0; e.st = 'wait'; } }
      } else if (e.k === 'pd') {
        if (e.st === 'lava') { if (e.t > 150) { e.st = 'jump'; e.vy = -4.8; e.t = 0; } }
        else { e.vy += .2; e.y += e.vy; if (e.y > e.y0 + 8) { e.y = e.y0 + 8; e.st = 'lava'; e.t = 0; } }
      } else if (e.k === 'bb') stepBoss(e);
      else {
        if (e.k === 'db' && e.st === 'pile') { if (e.t > 240) { e.st = 'walk'; e.vx = me.x < e.x ? -.5 : .5; } continue; }
        e.vy = Math.min(4.5, e.vy + .3);
        const wasG = e.ground;
        if (e.st === 'shell' && e.vx) e.port = e.kicker === meId;
        const mx = moveX(e, e.vx);
        if (mx === true) { e.vx = -e.vx; if (e.st === 'shell' && e.vx) { const tx = Math.floor((e.vx < 0 ? e.x + e.w + 1 : e.x - 1) / TS), ty = Math.floor((e.y + e.h / 2) / TS); if (tile(tx, ty) === BRK || tile(tx, ty) === QB) hitBlock(tx, ty, 'shell'); sfx.bump(); } }
        moveY(e, e.vy); slopeFix(e, wasG);
        e.port = false;
        if (e.ground && (e.under === NOTE || e.under === SNOTE)) e.vy = -3;
        // red turtles and bones turn at ledges; winged ones hop
        if ((e.k === 'kr' || e.k === 'db') && e.st === 'walk' && wasG && e.ground) {
          const fx = Math.floor((e.vx > 0 ? e.x + e.w + 1 : e.x - 1) / TS), fy = Math.floor((e.y + e.h + 2) / TS);
          if (!solid(fx, fy) && !KIND[tile(fx, fy)]) e.vx = -e.vx;
        }
        if ((e.k === 'kw' || e.k === 'pg') && e.ground) e.vy = e.k === 'kw' ? -4.2 : (e.t % 90 < 45 ? -1.6 : -3.4);
        if (e.st === 'shell') {
          if (e.vx === 0 && e.t > 420) { e.st = 'walk'; e.vx = me.x < e.x ? -.5 : .5; e.h = 20; e.y -= 7; }
          if (e.vx) for (const o of enemies) if (o !== e && o.alive && o.k !== 'tw' && o.k !== 'pd' && over2(e, box(o))) { if (o.k === 'bb') { hitBoss(o, 1); kill(e, true); break; } kill(o, true); scorePop(o, 200); }
        }
        if (e.imm) e.imm--;
        if (tile(Math.floor((e.x + e.w / 2) / TS), Math.floor((e.y + e.h - 2) / TS)) === LAVA) { e.alive = false; e.gone = true; }
      }
      if (e.y > L.H * TS + 16) { e.gone = true; e.alive = false; }
      if (e.x < camX - W - 64 || e.x > camX + W * 2 + 64) { e.gone = true; const s = L.enemies[e.i]; if (s && e.alive) s.active = false; }
    }
    // walkers bump into each other
    for (let a = 0; a < enemies.length; a++) for (let b = a + 1; b < enemies.length; b++) {
      const p = enemies[a], q = enemies[b];
      if (p.alive && q.alive && p.st === 'walk' && q.st === 'walk' && SIZE[p.k][1] <= 20 && SIZE[q.k][1] <= 20 && p.k !== 'pd' && q.k !== 'pd' && !['pp', 'pf'].includes(p.k) && !['pp', 'pf'].includes(q.k) && over2(p, q)) {
        if ((p.x < q.x) === (p.vx > 0)) p.vx = -p.vx;
        if ((q.x < p.x) === (q.vx > 0)) q.vx = -q.vx;
      }
    }
    enemies = enemies.filter((e) => !e.gone);
  }
  // the brute: waits for you, shuts the door, charges, leaps, spins away when hit
  function stepBoss(e) {
    if (!bossOn) {
      if (me.x > L.boss.x0 * TS + 8 && !me.dead) { bossOn = true; setBossDoor(true); e.st = 'walk'; sfx.bossHit(); pop('attention !', e.x - 10, e.y - 12); }
      else { e.vy = Math.min(4, e.vy + .3); moveY(e, e.vy); return; }
    }
    const speed = 1 + (3 - e.hp) * .45;
    if (e.st === 'spin') { if (e.t > 60) { e.st = 'walk'; e.t = 0; } }
    else {
      const want = me.x + me.w / 2 < e.x + e.w / 2 ? -speed : speed;
      e.vx += (want - e.vx) * .05;
      if (e.ground && e.t % 110 === 60) e.vy = -5.5;
    }
    e.vy = Math.min(5, e.vy + .3);
    if (moveX(e, e.vx) === true) e.vx = -e.vx;
    moveY(e, e.vy);
  }
  function hitEnemies(c) {
    if (c.dead || c.grow || c.behind) return;
    if (c.ground) c.chain = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const b = box(e);
      if (!b.h || !over2(c, b)) continue;
      const stomp = c.vy > 0 && c.y + c.h - c.vy <= b.y + 8;
      const bounce = () => { c.vy = prev.jump ? -4.8 : -3.2; c.fast = false; c.jumped = true; c.y = b.y - c.h; c.flung = false; c.chain++; };
      // sliding down a hill knocks everything over
      if (c.slide && Math.abs(c.vx) > 1 && !['tw', 'pd', 'bb', 'pp', 'pf'].includes(e.k)) { kill(e, true); scorePop(e, 100); continue; }
      if (e.k === 'tw' || e.k === 'pd' || e.k === 'pp' || e.k === 'pf') { hurt(); continue; }
      if (e.k === 'bb') { if (stomp && !e.inv) { bounce(); hitBoss(e, 1); } else if (!e.inv || e.st !== 'spin') hurt(); continue; }
      if (e.k === 'db') {
        if (e.st === 'pile') continue;
        if (stomp) { bounce(); e.st = 'pile'; e.t = 0; sfx.stomp(); scorePop(e, 100); } else hurt();
        continue;
      }
      if (e.st === 'shell') {
        if (e.vx === 0) {
          e.vx = c.x + c.w / 2 < e.x + e.w / 2 ? 4.2 : -4.2; e.imm = 14; e.t = 0; e.kicker = meId;
          sfx.kick(); scorePop(e, 400);
          if (stomp) bounce();
        } else if (stomp) { e.vx = 0; e.t = 0; bounce(); sfx.stomp(); scorePop(e, 100); }
        else if (!e.imm) hurt();
        continue;
      }
      if (stomp) {
        bounce(); sfx.stomp(); scorePop(e, 100);
        if (e.k === 'gb') kill(e, false);
        else if (e.k === 'pg') { e.k = 'gb'; }
        else if (e.k === 'kw') { e.k = 'kp'; }
        else if (e.k === 'kp' || e.k === 'kr') { e.st = 'shell'; e.vx = 0; e.t = 0; e.y += 7; e.h = 13; }
        else kill(e, true);
      } else hurt();
    }
  }

  // ---------- ghost rivals: run right, jump what's in the way; elsewhere in the world, just a pace ----------
  function stepGhosts() {
    for (const g of ghosts) {
      if (g.fin != null) { if (g.c && g.lv === lvIdx) { g.c.x += 1.2; g.c.animT += .12; if (g.c.x > camX + W + 16) g.c.hidden = true; } continue; }
      if (phase === 'count' || raceTime() >= limit) continue;
      const Lg = levels[g.lv];
      const goalX = Lg.boss ? Lg.boss.x0 * TS + 40 : Lg.goal * TS;
      if (g.lv !== lvIdx || !g.c) {
        // abstract: a pace, with a little stumble now and then
        if (g.wait > 0) g.wait--; else { g.ax += g.speed * .8; if (Math.random() < .002) g.wait = 60 + Math.random() * 90; }
        if (g.ax >= goalX) ghostGoal(g);
        continue;
      }
      const c = g.c;
      if (g.respawn) { if (--g.respawn === 0) placeGhost(g, Math.floor(c.x / TS) + 2); continue; }
      if (g.wait > 0) { g.wait--; if (!g.wait) ghostGoal(g); continue; }
      if (g.pause > 0) { g.pause--; c.vx *= .9; heroPhysics(c, {}); continue; }
      const feet = Math.floor((c.y + c.h - 1) / TS), front = c.x + c.w;
      const ahead = (d) => Math.floor((front + d) / TS);
      const wall = solid(ahead(6), feet) || solid(ahead(6), feet - 1);
      let gap = true;
      for (let ty = feet + 1; ty < L.H; ty++) { const t = tile(ahead(12), ty); if (t === LAVA) break; if (KIND[t]) { gap = false; break; } }
      const inp = { r: c.vx < g.speed || !c.ground, run: g.speed > 1.5 || !c.ground, jump: g.hold > 0 };
      if (c.ground && (wall || gap)) { inp.jumpEdge = true; inp.jump = true; g.hold = wall ? 26 : 22; inp.r = true; }
      if (g.hold) g.hold--;
      c.port = false;
      heroPhysics(c, inp);
      if (!c.ground && c.vx < 2) c.vx = Math.min(2, c.vx + .1);
      g.ax = c.x;
      if (frame % 90 === 0) { if (c.x - g.lastX < 8) { placeGhost(g, Math.floor(c.x / TS) + 3); g.pause = 90; } g.lastX = c.x; }
      if (c.y > L.H * TS + 8 || tile(Math.floor((c.x + 6) / TS), Math.floor((c.y + c.h - 2) / TS)) === LAVA) { g.respawn = 50; c.y = L.H * TS + 40; }
      if (L.auto && c.x < camX - 24) placeGhost(g, Math.floor(camX / TS) + 2);
      if (c.x >= goalX) { if (L.boss) { g.wait = 600 + Math.floor(Math.random() * 240); c.vx = 0; } else ghostGoal(g); }
    }
  }
  function ghostGoal(g) {
    if (g.lv < levels.length - 1) { g.lv++; g.ax = levels[g.lv].start * TS; g.c = null; if (g.lv === lvIdx) placeGhost(g, levels[g.lv].start); return; }
    g.fin = raceTime(); g.order = ++finOrder;
  }
  // a ghost that fell or got stuck reappears on the next bit of solid ground ahead
  function placeGhost(g, tx) {
    if (!g.c) g.c = newHero(0, g.color);
    const c = g.c;
    const ok = (t) => groundTop(t) > 0 && groundTop(t + 1) === groundTop(t) && !solid(t, groundTop(t) - 1) && !solid(t, groundTop(t) - 2);
    while (tx < L.W - 2 && !ok(tx)) tx++;
    c.x = tx * TS + 2; c.y = groundTop(tx) * TS - c.h; c.vx = 0; c.vy = 0; c.inv = 60; c.hidden = false;
  }

  // ---------- network ----------
  function onFx(id, fx) {
    if (!running || !fx) return;
    let r = remotes.get(id);
    if (!r && id !== meId) { r = { id, name: 'invité', color: 0xffffff, snaps: [], x: 0, y: 0, a: 0, f: 1, p: 0, h: 0, lv: 0, fin: null, order: 0, portals: [null, null] }; remotes.set(id, r); }
    if (!r) return;
    const here = (fx.lv | 0) === lvIdx;
    if (fx.t === 's') {
      r.snaps.push({ at: performance.now(), x: +fx.x || 0, y: +fx.y || 0, a: fx.a | 0, f: fx.f < 0 ? -1 : 1, p: fx.p | 0, c: fx.c | 0, h: fx.h | 0, b: fx.b | 0, g: (fx.g | 0) / 100 });
      if ((fx.lv | 0) !== r.lv) { r.lv = fx.lv | 0; r.snaps = r.snaps.slice(-1); r.portals = [null, null]; }
      if (r.snaps.length > 20) r.snaps.shift();
    } else if (fx.t === 'pt') {
      if (r.lv === (fx.lv | 0)) r.portals[fx.k ? 1 : 0] = { face: String(fx.f), tx: fx.x | 0, ty: fx.y | 0 };
    } else if (fx.t === 'b' && here) {
      const i = fx.i | 0, t = L.tiles[i];
      if (fx.m === 2 && t === BRK) { L.tiles[i] = E; debris(i % L.W, Math.floor(i / L.W)); }
      else if (fx.m === 1 && (t === QB || L.content.has(i))) { if (t === QB) L.tiles[i] = USED; L.content.delete(i); bump(i % L.W, Math.floor(i / L.W)); }
      else if (fx.m === 4) bump(i % L.W, Math.floor(i / L.W));
    } else if (fx.t === 'c' && here) { const i = fx.i | 0; if (L.tiles[i] === COIN) L.tiles[i] = E; }
    else if (fx.t === 'e' && here) {
      const i = fx.i | 0, s = L.enemies[i]; if (s) s.killed = true;
      const e = enemies.find((x) => x.i === i);
      if (e && e.k !== 'bb') kill(e, true, true);
    } else if (fx.t === 'lv') { r.lv = fx.lv | 0; r.portals = [null, null]; }
    else if (fx.t === 'fin' && r.fin == null) { r.fin = +fx.time || 0; r.order = ++finOrder; }
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
      r.a = c.a; r.f = c.f; r.p = c.p; r.h = c.h; r.b = c.b; r.c = c.c; r.g = c.g;
    }
  }

  // ---------- sound: a little chip, an original tune per place ----------
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const sfx = {
    jump: (big) => chip.tone(big ? 220 : 330, big ? 660 : 900, .15, { type: .5, vol: .3 }),
    coin: () => chip.seq([83, 88], .06, { type: .5, vol: .28 }),
    stomp: () => { chip.tone(420, 90, .12, { type: .5, vol: .38 }); chip.noise(.07, { vol: .2, f: 900 }); },
    kick: () => chip.tone(700, 280, .08, { type: .25, vol: .34 }),
    bump: () => chip.tone(130, 90, .08, { type: 'tri', vol: .7 }),
    brick: () => { chip.noise(.25, { vol: .45, f: 1400 }); chip.tone(200, 60, .15, { type: 'tri', vol: .6 }); },
    sprout: () => chip.tone(200, 700, .35, { type: .5, vol: .24 }),
    power: () => chip.seq([60, 64, 67, 72, 64, 67, 72, 76, 67, 72, 76, 79], .04, { type: .25, vol: .28 }),
    shrink: () => chip.seq([72, 67, 64, 60, 55, 52], .06, { type: .5, vol: .28 }),
    fire: () => chip.tone(900, 200, .06, { type: .125, vol: .3 }),
    die: () => chip.seq([71, 77, null, 77, 77, 76, 74, 72, 64, null, 64, 60], .11, { type: .5, vol: .28 }),
    beep: (hi) => chip.tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .35 : .12, { type: .5, vol: .28 }),
    goal: () => chip.seq([67, 72, 76, 79, 84, 88, null, 84, null, 88, 91], .09, { type: .5, vol: .26 }),
    time: () => chip.seq([84, 88, 91, null, 84, 88, 91], .07, { type: .25, vol: .24 }),
    note: (hi) => chip.tone(hi ? 500 : 380, hi ? 1600 : 900, hi ? .3 : .12, { type: .25, vol: .3 }),
    wag: () => chip.tone(300, 520, .08, { type: .125, vol: .2 }),
    behind: () => chip.seq([60, 55, 52, 48], .08, { type: 'tri', vol: .5 }),
    warp: () => { chip.tone(260, 1300, .22, { type: 'sine', vol: .35 }); chip.tone(1300, 400, .18, { type: .125, vol: .12 }); },
    portal: (k) => chip.tone(k ? 520 : 780, k ? 900 : 1300, .16, { type: .25, vol: .26 }),
    fizzle: () => chip.noise(.14, { vol: .22, f: 2400 }),
    thud: () => { chip.noise(.3, { vol: .5, f: 300 }); chip.tone(90, 40, .25, { type: 'tri', vol: .7 }); },
    bossHit: () => chip.seq([48, 55, 48, 43], .06, { type: .5, vol: .32 }),
  };
  const TUNES = {
    grass: { tempo: .16, lead: [76, 0, 79, 76, 72, 0, 74, 76, 77, 0, 76, 74, 72, 0, -1, -1, 74, 0, 76, 74, 71, 0, 72, 74, 76, 0, 74, 72, 67, 0, -1, -1], bass: [48, 55, 52, 55, 53, 57, 55, 59] },
    sky: { tempo: .15, lead: [79, 0, 84, 83, 81, 0, 79, 0, 76, 79, 81, 0, 79, 0, -1, -1, 77, 0, 81, 79, 77, 0, 76, 0, 74, 76, 77, 0, 79, 0, -1, -1], bass: [48, 52, 53, 55, 53, 52, 50, 55] },
    fort: { tempo: .19, lead: [69, 0, 72, 71, 69, 0, 68, 0, 69, 0, 64, 0, -1, -1, -1, -1, 65, 0, 69, 68, 65, 0, 64, 0, 62, 0, 64, 0, -1, -1, -1, -1], bass: [45, 45, 41, 41, 40, 40, 44, 44] },
  };
  function music() {
    const ctx = chip.ctx;
    if (!ctx || !musicOn) return;
    const tune = TUNES[L.theme] || TUNES.grass, now = ctx.currentTime;
    if (musicT < now - .1) musicT = now + .05;
    while (musicT < now + .25) {
      const e = tune.tempo, s = musicStep % 32;
      const b = tune.bass[s >> 2] - 12;
      if (s % 2 === 0) chip.tone(hz(b + (s % 4 ? 12 : 0)), hz(b + (s % 4 ? 12 : 0)), e * 1.6, { type: 'tri', vol: .42, at: musicT });
      const m = tune.lead[s];
      if (m > 0) { let n = 1; while (tune.lead[(s + n) % 32] === 0 && n < 4) n++; chip.tone(hz(m), hz(m), e * n * .9, { type: .25, vol: .12, at: musicT }); }
      if (s % 4 === 2) chip.noise(.04, { vol: .08, f: 6000, at: musicT });
      musicT += e; musicStep++;
    }
  }

  // ---------- drawing ----------
  function render() {
    if (!cv) return;
    lerpRemotes();
    const x = bx, cam = Math.round(camX), cy = Math.round(camY);
    drawBack(x, cam, cy);
    x.save(); x.beginPath(); x.rect(0, 0, W, VH); x.clip();
    for (const d of L.decor) {
      const px = d.x * TS - cam, py = d.y * TS - cy;
      if (px < -110 || px > W + 20) continue;
      if (d.k === 'bush') drawBush(x, px, py, d.n || 1);
      else if (d.k === 'hill') drawHill(x, px, py, d.big);
      else if (d.k === 'sign') drawSign(x, px, py, d.s);
      else if (d.k === 'door') { x.fillStyle = '#101010'; x.fillRect(px, py - 32, 24, 32); x.fillStyle = '#6c3000'; x.fillRect(px + 2, py - 30, 20, 30); x.fillStyle = '#f8b800'; x.fillRect(px + 17, py - 16, 2, 2); }
    }
    drawGoal(x, cam, cy);
    if (me.behind) drawMe(x, cam, cy);
    for (const b of L.bigs) {
      const px = b.x * TS - cam, py = b.y * TS - cy;
      if (px > W || px + b.w * TS < -8) continue;
      drawBig(x, px, py, b.w * TS, b.h * TS, b.color);
    }
    // plants first: the pipes hide their stems
    for (const e of enemies) if ((e.k === 'pp' || e.k === 'pf') && e.alive && e.off > 0) {
      const img = A[e.k][Math.floor(clock * 4) % 2];
      x.drawImage(img, 0, 0, 16, Math.min(24, Math.ceil(e.off)), Math.round(e.x - cam), Math.round(e.by - e.off - cy), 16, Math.min(24, Math.ceil(e.off)));
    }
    drawTiles(x, cam, cy);
    for (const it of items) {
      const img = it.k === 'mush' ? A.mush : it.k === 'flower' ? A.flower[Math.floor(clock * 8) % 2] : it.k === 'leaf' ? A.leaf[Math.sin(it.t * .07) > 0 ? 0 : 1] : A.orb;
      const px = Math.round(it.x - cam), py = Math.round(it.y - cy);
      if (it.rise > 0) { const vis = Math.round(16 - it.rise); if (vis > 0) x.drawImage(img, 0, 0, 16, vis, px, py, 16, vis); }
      else x.drawImage(img, px, py + (it.k === 'orb' ? Math.round(Math.sin(it.t * .1) * 2) : 0));
    }
    for (const e of enemies) if (!((e.k === 'pp' || e.k === 'pf') && e.alive)) drawEnemy(x, e, cam, cy);
    for (const s of shots) x.drawImage(A.fire[Math.floor(s.t / 4) % 2], Math.round(s.x - cam), Math.round(s.y - cy));
    for (const r of remotes.values()) if (r.lv === lvIdx) for (let k = 0; k < 2; k++) if (r.portals[k]) drawPortal(x, r.portals[k], k, cam, cy, r.color);
    for (let k = 0; k < 2; k++) if (portals[k]) drawPortal(x, portals[k], k, cam, cy);
    for (const g of ghosts) if (g.lv === lvIdx && g.c && !g.c.hidden && !g.respawn && !(g.c.inv && frame % 4 < 2)) drawHero(x, g.c, anim(g.c), g.color, cam, cy, .55, raceTime() < 4 && Math.abs(g.c.x - me.x) > 20 ? g.name : null, g.tag * 8);
    for (const r of remotes.values()) if (r.lv === lvIdx && !r.h && r.snaps.length) drawHero(x, { x: r.x, y: r.y, h: r.p ? (r.c ? 16 : 26) : 15, w: 12, form: r.p, face: r.f, behind: r.b, crouch: r.c, gun: r.g }, r.a, r.color, cam, cy, r.b ? .5 : 1, r.name);
    if (!me.behind) drawMe(x, cam, cy);
    for (const b of beams) {
      x.strokeStyle = b.t < 4 ? PCOL2[b.k] : PCOL[b.k]; x.globalAlpha = 1 - b.t / 8; x.lineWidth = 1;
      x.beginPath(); x.moveTo(Math.round(b.x0 - cam) + .5, Math.round(b.y0 - cy) + .5); x.lineTo(Math.round(b.x1 - cam) + .5, Math.round(b.y1 - cy) + .5); x.stroke();
      x.globalAlpha = 1;
    }
    for (const p of parts) {
      const px = Math.round(p.x - cam), py = Math.round(p.y - cy);
      if (p.k === 'debris') x.drawImage(A.debris, px, py);
      else if (p.k === 'coin') x.drawImage(A.coin[Math.floor(p.t / 3) % 4], px, py);
      else if (p.k === 'text') text(x, p.s, px, py, PAL.W, 1, PAL.K);
      else if (p.k === 'spark') { x.fillStyle = p.col; x.fillRect(px, py, 2, 2); }
      else if (p.k === 'efire') x.drawImage(A.fire[Math.floor(p.t / 4) % 2], px, py);
      else if (p.k === 'poof') { const d = p.t / 2; x.fillStyle = p.t % 4 < 2 ? PAL.W : PAL.Y; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) x.fillRect(px + 4 + a * d, py + 4 + b * d, 2, 2); }
    }
    // the crosshair
    if (mouse.used && phase !== 'count' && !me.goal && mouse.sy < VH) {
      const mx = Math.round(mouse.sx), my = Math.round(mouse.sy);
      x.fillStyle = PAL.K; x.fillRect(mx - 4, my, 3, 1); x.fillRect(mx + 2, my, 3, 1); x.fillRect(mx, my - 4, 1, 3); x.fillRect(mx, my + 2, 1, 3);
      x.fillStyle = PCOL[0]; x.fillRect(mx - 4, my - 1, 3, 1); x.fillRect(mx, my - 5, 1, 3);
      x.fillStyle = PCOL[1]; x.fillRect(mx + 2, my + 1, 3, 1); x.fillRect(mx + 1, my + 2, 1, 3);
    }
    x.restore();
    drawHud(x);
    blit();
  }
  function drawBack(x, cam, cy) {
    const th = L.theme;
    if (th === 'fort') {
      x.fillStyle = '#18141c'; x.fillRect(0, 0, W, VH);
      const off = Math.round(cam * .5) % 32;
      x.fillStyle = '#241e2a';
      for (let j = 0; j < VH; j += 16) for (let i = -32; i < W + 32; i += 32) x.fillRect(i - off + (j / 16 % 2) * 16, j - (cy % 16), 30, 14);
      for (let k = 0; k < 4; k++) {
        const wx = ((k * 96 - Math.round(cam * .5)) % 384 + 384) % 384 - 64;
        x.fillStyle = '#101014'; x.fillRect(wx, 60 - cy * .5, 20, 36); x.beginPath(); x.arc(wx + 10, 60 - cy * .5, 10, Math.PI, 0); x.fill();
        x.fillStyle = 'rgba(248,120,0,.25)'; x.fillRect(wx + 3, 70 - cy * .5, 14, 26);
      }
      return;
    }
    x.fillStyle = th === 'sky' ? '#6cc4fc' : '#a4e4fc'; x.fillRect(0, 0, W, VH);
    if (th === 'sky') {
      for (let k = 0; k < 7; k++) { const px = ((k * 90 - cam * .4) % 630 + 630) % 630 - 60; drawCloud(x, px, 170 - (k % 3) * 20 - (cy - (L.H * TS - VH)) * .3, 1.4); }
    } else {
      for (let k = 0; k < 5; k++) { const px = ((k * 120 - cam * .3) % 600 + 600) % 600 - 80; drawCloud(x, px, 34 + (k % 2) * 22 - (cy - (L.H * TS - VH)) * .3); }
    }
    if (th !== 'sky') for (let k = 0; k < 6; k++) {
      const px = ((k * 170 - cam * .5) % 1020 + 1020) % 1020 - 120;
      drawHill(x, px, VH - 20 + (L.H * TS - VH - cy) * .3, k % 2 === 0);
    }
  }
  function drawTiles(x, cam, cy) {
    const c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.W - 1, c0 + 17), r0 = Math.max(0, Math.floor(cy / TS)), r1 = Math.min(L.H - 1, r0 + 14);
    const qf = [0, 0, 0, 1, 2, 1][Math.floor(clock * 6) % 6], cf = [0, 0, 1, 2, 1, 0][Math.floor(clock * 5) % 6];
    for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
      const i = ty * L.W + tx, t = L.tiles[i];
      if (!t || t === SEMI || t === SEMIW) continue;
      const bf = bumps.get(i), px = tx * TS - cam, py = ty * TS - cy + (bf ? Math.round(Math.sin(bf.f / 10 * Math.PI) * 5) * bf.d : 0);
      let img = null;
      switch (t) {
        case GND: { const up = tile(tx, ty - 1); img = up === GND || up === SU || up === SD ? A.gnd : A.gndTop; break; }
        case BRK: img = A.brick; break;
        case QB: img = A.q[qf]; break;
        case USED: img = A.used; break;
        case NOTE: img = A.note; break;
        case SNOTE: img = A.snote; break;
        case WOOD: img = A.wood; break;
        case WHITE: img = A.white; break;
        case STONE: img = A.stone; break;
        case HEDGE: img = A.hedge; break;
        case SPIKE: img = A.spike; break;
        case CLOUD: img = A.cloud; break;
        case LAVA: img = tile(tx, ty - 1) === LAVA ? null : A.lava[Math.floor(clock * 3) % 2]; if (!img) { x.fillStyle = '#a81000'; x.fillRect(px, py, 16, 16); } break;
        case SU: img = A.slopeU; break;
        case SD: img = A.slopeD; break;
        case COIN: img = A.coin[cf]; break;
      }
      if (img) x.drawImage(img, px, py);
      else if (t >= PTL && t <= PR) x.drawImage(t < PL ? A.pipe.top : A.pipe.body, t === PTR || t === PR ? 16 : 0, 0, 16, 16, px, py, 16, 16);
    }
    if (me.behind) { x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 0, W, VH); }
  }
  // a portal: an oval of light on the surface, a darker swirl inside
  function drawPortal(x, p, k, cam, cy, tint) {
    const horiz = p.face === 'U' || p.face === 'D';
    const [mx, my] = portalMid(p), px = mx - cam, py = my - cy;
    const col = tint != null ? hexOf(tint) : PCOL[k], light = tint != null ? '#ffffff' : PCOL2[k];
    const n = FACES[p.face], ph = clock * 6 + k * 3;
    x.globalAlpha = tint != null ? .55 : 1;
    for (let s = -15; s <= 15; s++) {
      const w = Math.round(Math.sqrt(1 - (s / 16) ** 2) * 4) + 1;
      const shade = (Math.sin(ph + s * .5) > .3) ? light : col;
      if (horiz) { x.fillStyle = col; x.fillRect(px + s, py + (n[1] < 0 ? -w : 0), 1, w); x.fillStyle = shade; x.fillRect(px + s, py + (n[1] < 0 ? -w + 1 : 0), 1, Math.max(1, w - 2)); }
      else { x.fillStyle = col; x.fillRect(px + (n[0] < 0 ? -w : 0), py + s, w, 1); x.fillStyle = shade; x.fillRect(px + (n[0] < 0 ? -w + 1 : 0), py + s, Math.max(1, w - 2), 1); }
    }
    if (tint != null) { x.fillStyle = PCOL[k]; if (horiz) x.fillRect(px - 1, py + (n[1] < 0 ? -2 : 0), 3, 2); else x.fillRect(px + (n[0] < 0 ? -2 : 0), py - 1, 2, 3); }
    x.globalAlpha = 1;
  }
  const tagColor = (c) => { const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255, l = .3 * r + .59 * g + .11 * b, k = l < 150 ? (150 - l) / (255 - l) : 0; return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`; };
  function drawMe(x, cam, cy) {
    if (me.hidden || (me.inv && frame % 4 < 2)) return;
    if (me.grow && Math.floor(me.grow / 4) % 2) { drawHero(x, { ...me, form: 0, y: me.y + me.h - 15, h: 15 }, 0, meColor, cam, cy, 1); return; }
    drawHero(x, { ...me, gun: me.dead ? null : aimAngle() }, anim(me), meColor, cam, cy, me.behind ? .6 : 1);
  }
  function drawHero(x, c, a, color, cam, cy, alpha, name, lift = 0) {
    const form = c.form || 0, set = heroFrames(color, form), img = (c.face < 0 ? set.l : set.r)[a] || set.r[0];
    const px = Math.round(c.x - 2 - cam), py = Math.round(c.y + (a === 5 ? 15 : c.h) - img.height - cy);
    if (px < -24 || px > W + 8) return;
    if (alpha < 1) x.globalAlpha = alpha;
    if (form === 3 && a !== 5) {
      const ang = c.spin ? 1 : c.wag || c.fly > 0 ? .8 + Math.sin(clock * 30) * .2 : Math.abs(c.vx || 0) > 1.5 ? .6 : .15;
      drawTail(x, px + (c.face > 0 ? 3 : 12), py + img.height - (c.crouch ? 8 : 12), c.spin ? (Math.floor(c.spin / 4) % 2 ? 1 : -1) * c.face : c.face, ang);
    }
    x.drawImage(img, px, py);
    // the portal gun, pointing where the mouse is
    if (c.gun != null && a !== 5) {
      const gx = px + 2 + c.w / 2 + (c.face || 1) * 3, gy = py + img.height - c.h + (form ? (c.crouch ? 8 : 13) : 9) + (form === 3 ? 0 : 0);
      const dx = Math.cos(c.gun), dy = Math.sin(c.gun);
      for (let s = 0; s < 8; s++) { x.fillStyle = s > 5 ? (portals[1] && !portals[0] ? PCOL[1] : PCOL[0]) : s < 2 ? '#303038' : '#f4f4f0'; x.fillRect(Math.round(gx + dx * s) - 1, Math.round(gy + dy * s) - 1, 2, 2); }
    }
    if (c.behind) { x.globalAlpha = .35; x.fillStyle = '#000'; x.fillRect(px, py, img.width, img.height); }
    x.globalAlpha = 1;
    if (name) text(x, name.slice(0, 10), px + 8, py - 9 - lift, tagColor(color), 1, PAL.K, 'center');
  }
  function drawEnemy(x, e, cam, cy) {
    const f = Math.floor(clock * 6) % 2;
    let img, dx = 0;
    const left = e.vx <= 0;
    switch (e.k) {
      case 'gb': case 'pg': img = e.st === 'flat' ? A.gbFlat : A.gb[f]; break;
      case 'kp': case 'kw': case 'kr': {
        const red = e.k === 'kr';
        img = e.st === 'shell' || (e.st === 'flip' && e.wasShell) ? (red ? A.shellR : A.shell) : (red ? A.kr : A.kp)[left ? 'l' : 'r'][f];
        break;
      }
      case 'db': img = e.st === 'pile' ? A.dbPile : A.db[left ? 'l' : 'r'][f]; break;
      case 'tw': img = A.thwomp[e.st === 'fall' || e.st === 'land' ? 1 : 0]; break;
      case 'pd': img = A.podo[f]; break;
      case 'bb': img = A.boom[e.st === 'spin' ? 2 : f]; if (e.inv && frame % 4 < 2) return; break;
      default: return;
    }
    const px = Math.round(e.x + e.w / 2 - img.width / 2 - cam + dx), py = Math.round(e.y + e.h - img.height - cy + (e.k === 'pd' ? 0 : 1));
    if (px < -40 || px > W + 8) return;
    if (e.k === 'pd' && e.st === 'lava') return;
    if (e.st === 'shell' && e.vx === 0 && e.t > 330 && frame % 8 < 4) { x.drawImage(img, px + 1, py); return; }
    if (e.st === 'flip') { x.save(); x.translate(px, py + img.height); x.scale(1, -1); x.drawImage(img, 0, 0); x.restore(); return; }
    if (e.k === 'pd' && e.vy > 0) { x.save(); x.translate(px, py + img.height); x.scale(1, -1); x.drawImage(img, 0, 0); x.restore(); return; }
    x.drawImage(img, px, py);
    if ((e.k === 'kw' || e.k === 'pg') && e.alive) x.drawImage(A.wing[Math.floor(clock * 8) % 2], left ? px + 9 : px - 1, py + (e.k === 'pg' ? -2 : 6));
  }
  // the end of the level: a black band, the card box turning over
  function drawGoal(x, cam, cy) {
    if (L.boss) return;
    const gx = L.goal * TS - cam;
    if (gx > W || gx < -W) return;
    x.fillStyle = '#101010'; x.fillRect(gx + 24, 0, W, VH);
    const bxp = gx - 4, byp = (L.G - 5) * TS - cy;
    x.fillStyle = '#fcfcfc'; x.fillRect(bxp, byp, 26, 26);
    x.fillStyle = '#101010'; x.fillRect(bxp + 2, byp + 2, 22, 22);
    const k = me.goal ? cards[cards.length - 1] : ['mush', 'flower', 'star'][Math.floor(frame / 8) % 3];
    x.drawImage(k === 'mush' ? A.mush : k === 'flower' ? A.flower[0] : A.star, bxp + 5, byp + 5);
  }
  function drawCard(x, k, px, py) {
    x.fillStyle = '#101010'; x.fillRect(px, py, 20, 24);
    x.fillStyle = k ? '#fcfcfc' : '#404040'; x.fillRect(px + 1, py + 1, 18, 22);
    if (k) { x.save(); x.translate(px + 2, py + 4); x.drawImage(k === 'mush' ? A.mush : k === 'flower' ? A.flower[0] : A.star, 0, 0); x.restore(); }
  }
  function drawHud(x) {
    const sh = PAL.K, y0 = VH;
    x.fillStyle = '#101010'; x.fillRect(0, y0, W, H - y0);
    x.fillStyle = '#f8d8a0'; x.fillRect(4, y0 + 3, 180, 26);
    x.fillStyle = '#101010'; x.fillRect(6, y0 + 5, 176, 22);
    text(x, 'monde ' + L.name, 10, y0 + 7, PAL.W);
    // the P meter
    const segs = Math.floor(me.pm / PMAX * 6);
    for (let s = 0; s < 6; s++) { x.fillStyle = s < segs ? PAL.W : '#505050'; const ax = 10 + s * 8; x.fillRect(ax, y0 + 18, 2, 5); x.fillRect(ax + 2, y0 + 19, 2, 3); x.fillRect(ax + 4, y0 + 20, 1, 1); }
    const full = me.pm >= PMAX;
    x.fillStyle = full && frame % 16 < 8 ? PAL.W : '#505050'; x.fillRect(60, y0 + 17, 12, 7);
    text(x, 'p', 64, y0 + 17, full && frame % 16 < 8 ? PAL.K : '#101010');
    x.drawImage(A.coin[0], 0, 2, 16, 12, 136, y0 + 5, 12, 9);
    text(x, '×' + String(coins).padStart(2, '0'), 150, y0 + 7, PAL.W);
    text(x, String(score).padStart(7, '0'), 78, y0 + 17, PAL.W);
    const tl = Math.max(0, limit - raceTime());
    text(x, fmt(raceTime()), 178, y0 + 17, tl < 30 && frame % 30 < 15 ? PAL.R : PAL.W, 1, null, 'right');
    for (let k = 0; k < 3; k++) drawCard(x, cards[k], 188 + k * 22, y0 + 4);
    // the race: a line to the end of the world, everyone on it
    const x0 = 16, x1 = 200, y = 8;
    const prog = (lv, px, fin) => fin != null ? 1 : (lv + Math.min(1, px / ((levels[lv].boss ? levels[lv].boss.x1 : levels[lv].goal) * TS))) / levels.length;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(x0, y, x1 - x0, 3);
    x.fillStyle = PAL.W; x.fillRect(x0, y + 1, x1 - x0, 1);
    for (let k = 1; k < levels.length; k++) { x.fillStyle = PAL.w; x.fillRect(x0 + Math.round((x1 - x0) * k / levels.length), y - 1, 1, 5); }
    x.fillStyle = PAL.R; x.fillRect(x1, y - 4, 4, 3); x.fillStyle = PAL.w; x.fillRect(x1, y - 4, 1, 7);
    const dot = (p, col, big) => { const dx = Math.round(x0 + Math.max(0, Math.min(1, p)) * (x1 - x0)); x.fillStyle = PAL.K; x.fillRect(dx - (big ? 3 : 2), y - (big ? 2 : 1), big ? 6 : 4, big ? 6 : 4); x.fillStyle = col; x.fillRect(dx - (big ? 2 : 1), y - (big ? 1 : 0), big ? 4 : 2, big ? 4 : 2); };
    for (const g of ghosts) dot(prog(g.lv, g.lv === lvIdx && g.c ? g.c.x : g.ax, g.fin), hexOf(g.color), false);
    for (const r of remotes.values()) dot(prog(r.lv, r.x, r.fin), hexOf(r.color), false);
    dot(prog(lvIdx, me.x, me.fin), frame % 20 < 14 ? hexOf(meColor) : PAL.W, true);
    const list = standings(), pl = list.findIndex((r) => r.me) + 1;
    text(x, `${pl}/${list.length}`, 244, 6, pl === 1 ? PAL.Y : PAL.W, 1, sh, 'right');
    if (phase === 'count') {
      const n = Math.ceil(COUNT - clock);
      x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 56, W, 64);
      text(x, 'super portail', W / 2, 62, PAL.Y, 2, sh, 'center');
      text(x, `monde ${L.name} - ${L.title}`, W / 2, 82, PAL.W, 1, sh, 'center');
      text(x, String(Math.max(1, n)), W / 2, 98, PAL.W, 2, sh, 'center');
    } else if (phase === 'run' && phaseT < 1.2) text(x, 'partez !', W / 2, 90, PAL.Y, 3, PAL.K, 'center');
    else if (phase === 'run' && titleT > 0 && lvIdx > 0) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 76, W, 30); text(x, `monde ${L.name}`, W / 2, 80, PAL.Y, 1, sh, 'center'); text(x, L.title, W / 2, 92, PAL.W, 1, sh, 'center'); }
    else if (phase === 'timeup') { x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 90, W, 40); text(x, 'temps écoulé', W / 2, 104, PAL.R, 2, sh, 'center'); }
    if (me.dead && phase === 'run') text(x, 'retour au relais...', W / 2, 110, PAL.W, 1, sh, 'center');
    if (phase === 'run' && raceTime() < 12 && lvIdx === 0 && !me.goal) text(x, 'clic : portail bleu - clic droit : orange', W / 2, 24, PAL.W, 1, sh, 'center');
    if (phase === 'done') drawResults(x);
  }
  function standings() {
    const list = [{ me: true, name: meName, color: meColor, fin: me.fin, order: me.order, p: lvIdx * 1e5 + me.x }];
    for (const r of remotes.values()) list.push({ name: r.name, color: r.color, fin: r.fin, order: r.order, p: r.lv * 1e5 + r.x });
    for (const g of ghosts) list.push({ name: g.name, color: g.color, fin: g.fin, order: g.order, p: g.lv * 1e5 + (g.lv === lvIdx && g.c ? g.c.x : g.ax), ghost: true });
    return list.sort((a, b) => (a.fin != null) !== (b.fin != null) ? (a.fin != null ? -1 : 1) : a.fin != null ? a.order - b.order : b.p - a.p);
  }
  function drawResults(x) {
    if (doneT < 2.2) return;
    const list = standings(), h = 44 + list.length * 12;
    const y0 = Math.round((VH - h) / 2) + 6;
    x.fillStyle = 'rgba(0,0,0,.8)'; x.fillRect(40, y0, 176, h);
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
  // the game can be shown in a rectangle of the page (a screen) instead of the whole page
  let rect = null;
  function place2() {
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
      const [oc, ox] = canvas(w, h);
      if (s >= 3) { ox.fillStyle = 'rgba(0,0,0,.12)'; for (let j = 0; j < H; j++) ox.fillRect(0, j * s + s - Math.max(1, Math.floor(s / 3)), w, Math.max(1, Math.floor(s / 3))); }
      const g = ox.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
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
    modes: MODES,
    keys: [['q d', 'courir'], ['espace', 'sauter · planer (feuille)'], ['shift', 'sprint · feu · queue'], ['s', 's\'accroupir · glisser'], ['souris', 'viser'], ['clic g · a', 'portail bleu'], ['clic d · e', 'portail orange'], ['r', 'dernier drapeau']],
    start, stop, update, onFx,
    respawn() { if (running && phase === 'run' && !me.dead && !me.goal) { me.x = cpX; me.y = Math.max(0, groundTop(Math.floor(cpX / TS))) * TS - me.h; me.vx = me.vy = 0; me.inv = 60; me.behind = false; } },
    peerLeft(id) { remotes?.delete(id); },
    hud() { return { hidden: true }; },
    setRect(r) { rect = r; place2(); },
    set onEnd(f) { onEnd = f; },
    // for the tests
    get _dbg() {
      return {
        me, get L() { return L; }, get lv() { return lvIdx; }, get camX() { return camX; }, get phase() { return phase; }, enemies: () => enemies, items: () => items, ghosts, portals: () => portals, remotes, render, mouse,
        shoot: shootPortal, place, go() { if (phase === 'count') clock = COUNT; },
        warp(tx, ty) { me.dead = 0; me.inv = 60; me.x = tx * TS; me.y = ty != null ? ty * TS - me.h : (Math.max(0, groundTop(tx))) * TS - me.h; me.vx = me.vy = 0; camX = Math.max(0, Math.min(L.W * TS - W, me.x - 100)); if (L.auto) autoX = camX; follow(true); },
        form(f) { setForm(me, f); }, level(n) { if (levels[n]) loadLevel(n); },
      };
    },
  };
}
