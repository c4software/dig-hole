// invaders.js, "envahisseurs lunaires": Space Invaders on a 256×240 screen, on the Moon, the Earth in the sky.
// Every ship sits on the same bottom row. The host runs the swarm (its march, its shots, the saucer, the bots) and
// streams it; each client flies its own ship and claims its own kills. Co-op: a score race against shared waves;
// versus: shots hit the other ships too, the last one flying wins.
import { canvas, text, PAL } from './nes-art.js';
import { createScreen, stars, drawStars, earth, lunarGround, burst, stepParts, drawParts, box, rng, hex, clamp, ord, REGULARS } from './arcade-art.js';
import { createArcadeSfx } from './arcade-sfx.js';

const W = 256, H = 240, STEP = 1 / 60, COUNT = 3, SEND = 1 / 15, OVER = 6;
const COLS = 11, ROWS = 5, CW = 16, CH = 14, GY = 218, SY = 206, SHY = 180, SHW = 22, SHH = 16, LIVES = 3, EXTRA = 1500;
const SHIELDS = [0, 1, 2, 3].map((k) => Math.round(W * (k + 1) / 5 - SHW / 2));
const ROW_KIND = [0, 1, 1, 2, 2], ROW_PTS = [30, 20, 20, 10, 10], ROW_COL = ['#ff8ae2', '#8fe3ff', '#8fe3ff', '#b6ff7a', '#b6ff7a'];
const UFO_PTS = [50, 100, 150, 100, 300, 50, 100, 150];
const MODES = [
  { id: 'coop', name: 'coopération', sub: 'tous contre la vague · le meilleur score gagne', help: 'q d : bouger · espace : tirer · abats la vague, les vagues accélèrent' },
  { id: 'versus', name: 'chacun pour soi', sub: 'les tirs touchent aussi les autres vaisseaux · le dernier en vol gagne', help: 'q d : bouger · espace : tirer · tes tirs touchent aussi les autres' },
];
const BOTS = [{ name: 'robot-1', color: 0x3cbcfc }, { name: 'robot-2', color: 0xf878f8 }];

// ---------- the pixels ----------
const SPR = {
  a0: ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
  a1: ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
  b0: ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
  b1: ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
  c0: ['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'],
  c1: ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..'],
  boom: ['.#..#...#..#.', '..#..#.#..#..', '...#.....#...', '##.........##', '...#.....#...', '..#..#.#..#..', '.#..#...#..#.', '.............'],
  ufo: ['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...'],
  ship: ['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############', '#############'],
  sboom0: ['...#...#.....', '.#.....#..#..', '...#.#.##....', '..##.#...#.#.', '.###.####.#..', '#############'],
  sboom1: ['#.....#....#.', '...#.....#...', '.#..##..#..#.', '....#...#....', '#.##.##.##.#.', '#.###########'],
};
function mask(rows, col) {
  const [c, x] = canvas(rows[0].length, rows.length);
  x.fillStyle = col;
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') x.fillRect(i, j, 1, 1); });
  return c;
}
const SHIP_ROWS = SPR.ship;
function shipArt(color) {
  const [c, x] = canvas(13, 8), base = hex(color);
  SHIP_ROWS.forEach((r, j) => { for (let i = 0; i < 13; i++) if (r[i] === '#') { x.fillStyle = j < 3 ? '#fcfcfc' : j === 3 ? base : (i + j) % 5 === 0 ? 'rgba(0,0,0,.35)' : base; x.fillRect(i, j, 1, 1); } });
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(1, 4, 11, 1);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 7, 13, 1);
  return c;
}
function shieldMask() {
  const m = new Uint8Array(SHW * SHH);
  for (let j = 0; j < SHH; j++) for (let i = 0; i < SHW; i++) {
    let on = true;
    if (j < 4 && (i < 4 - j || i >= SHW - 4 + j)) on = false;
    if (j >= 12 && i >= 6 && i < SHW - 6) on = false;
    if (j === 11 && i >= 7 && i < SHW - 7) on = false;
    m[j * SHW + i] = on ? 1 : 0;
  }
  return m;
}

export function createInvaders() {
  let onEnd = () => {}, run = null, rect = null, A = null;
  const sfx = createArcadeSfx();

  function art() {
    if (A) return A;
    A = { al: [], boom: [], ships: new Map() };
    for (let r = 0; r < ROWS; r++) {
      const k = 'abc'[ROW_KIND[r]];
      A.al.push([mask(SPR[k + '0'], ROW_COL[r]), mask(SPR[k + '1'], ROW_COL[r])]);
      A.boom.push(mask(SPR.boom, ROW_COL[r]));
    }
    A.ufo = mask(SPR.ufo, '#ff4a4a'); A.ufoHi = mask(SPR.ufo, '#ffd0d0');
    A.sboom = [mask(SPR.sboom0, '#ffd23c'), mask(SPR.sboom1, '#ff7a3c')];
    A.earth = earth(15, 11);
    A.ground = lunarGround(W, H - GY + 2, 77);
    return A;
  }
  const shipOf = (color) => { if (!A.ships.has(color)) A.ships.set(color, shipArt(color)); return A.ships.get(color); };

  // ---------- the swarm ----------
  const alienW = (r) => [8, 11, 12][ROW_KIND[r]];
  const aRect = (r, c) => { const w = alienW(r); return { x: run.gx + c * CW + (CW - w) / 2, y: run.gy + r * CH, w, h: 8 }; };
  const alive = (r, c) => (run.mask[r] >> c & 1) === 1 && !run.pending.has(r * COLS + c);
  function newWave(w) {
    const r = run;
    r.wave = w;
    r.mask = Array(ROWS).fill((1 << COLS) - 1);
    r.pending.clear();
    r.gx = (W - COLS * CW) / 2; r.gy = 44 + Math.min(w - 1, 6) * 7; r.dir = 1; r.frame = 0; r.stepT = 0;
    r.shields = SHIELDS.map(() => shieldMask());
    r.ab = []; r.ufo = null; r.ufoT = 16 + r.R() * 8; r.fireT = 1.5;
    r.shieldArt = null;
    for (const s of r.shots) s.dead = true;
  }
  const count = () => { let n = 0; for (let k = 0; k < ROWS; k++) for (let c = 0; c < COLS; c++) if (alive(k, c)) n++; return n; };
  function extent() {
    let c0 = COLS, c1 = -1, r1 = -1;
    for (let k = 0; k < ROWS; k++) for (let c = 0; c < COLS; c++) if (alive(k, c)) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r1 = Math.max(r1, k); }
    return { c0, c1, r1 };
  }
  // one step of the march: sideways, or down and back at an edge
  function march() {
    const r = run, e = extent();
    if (e.c1 < 0) return;
    const left = r.gx + e.c0 * CW + 2, right = r.gx + (e.c1 + 1) * CW - 2;
    if ((r.dir > 0 && right + 3 > W - 6) || (r.dir < 0 && left - 3 < 6)) { r.gy += 8; r.dir = -r.dir; }
    else r.gx += 3 * r.dir;
    r.frame ^= 1;
    sfx.march(r.note++);
    r.send({ t: 'g', ...snap() });
  }
  const interval = () => { const n = count(); return Math.max(1 / 45, (.016 + n / 55 * .52) * Math.max(.45, 1 - (run.wave - 1) * .08)); };
  function snap() {
    const r = run;
    return { w: r.wave, ph: r.phase, x: r.gx, y: r.gy, d: r.dir, f: r.frame, m: r.mask.slice(), u: r.ufo ? [Math.round(r.ufo.x), r.ufo.d] : 0, b: r.bots.map((b) => [Math.round(b.x), b.lives, b.score, b.dead > 0 ? 1 : 0, b.out ? 1 : 0]) };
  }
  function hostSwarm() {
    const r = run;
    r.stepT += STEP;
    if (r.stepT >= interval()) { r.stepT = 0; march(); }
    else if ((r.syncT += STEP) > .25) { r.syncT = 0; r.send({ t: 'g', ...snap() }); }
    // the aliens shoot from the bottom of a column, often the one above a ship
    r.fireT -= STEP;
    const max = 3 + Math.floor(r.wave / 2) + Math.min(3, r.players.size - 1);
    if (r.fireT <= 0 && r.ab.length < max) {
      r.fireT = Math.max(.22, 1.05 - r.wave * .07) / (1 + .25 * (r.players.size - 1)) * (.6 + r.R() * .8);
      const targets = [...r.players.values()].filter((p) => !p.out && !p.dead);
      let col = Math.floor(r.R() * COLS);
      if (targets.length && r.R() < .55) { const t = targets[Math.floor(r.R() * targets.length)]; col = clamp(Math.round((t.x + 6 - r.gx - CW / 2) / CW), 0, COLS - 1); }
      for (let d = 0; d < COLS; d++) {
        const c = (col + (d % 2 ? -1 : 1) * Math.ceil(d / 2) + COLS) % COLS;
        let row = -1;
        for (let k = ROWS - 1; k >= 0; k--) if (alive(k, c)) { row = k; break; }
        if (row < 0) continue;
        const a = aRect(row, c);
        const b = [Math.round(a.x + a.w / 2), Math.round(a.y + 8), Math.floor(r.R() * 3), Math.min(150, 70 + r.wave * 7)];
        addAB(b);
        r.send({ t: 'ab', b });
        break;
      }
    }
    // the saucer, now and then, while the swarm is still thick
    if (!r.ufo) {
      r.ufoT -= STEP;
      if (r.ufoT <= 0 && count() >= 8) { const d = r.R() < .5 ? 1 : -1; r.ufo = { x: d > 0 ? -16 : W, d }; r.ufoT = 18 + r.R() * 10; }
    } else {
      r.ufo.x += r.ufo.d * 42 * STEP;
      if (r.ufo.x < -20 || r.ufo.x > W + 4) r.ufo = null;
    }
    // cleared: the next wave, a bit lower and faster
    if (r.phase === 'play' && r.mask.every((m) => !m)) { r.phase = 'clear'; r.phaseT = 0; r.send({ t: 'g', ...snap() }); }
    // too low: the Moon is invaded
    const e = extent();
    if (r.phase === 'play' && e.r1 >= 0 && r.gy + e.r1 * CH + 8 >= SY) hostEnd('invasion');
  }
  function addAB([x, y, k, vy]) { run.ab.push({ x, y, k, vy, a: 0 }); }

  // ---------- shields ----------
  // a bite out of a shield around (x, y): a ragged blot, seeded so everyone bites the same
  function erode(si, x, y, seed, big = false) {
    const m = run.shields[si], R = rng(seed), rad = big ? 3.2 : 2.4;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const d = Math.hypot(i, j * 1.2);
      if (d > rad + R() * 1.6) continue;
      const px = x - SHIELDS[si] + i, py = y - SHY + j;
      if (px >= 0 && px < SHW && py >= 0 && py < SHH) m[py * SHW + px] = 0;
    }
    run.shieldArt = null;
  }
  // which shield pixel does a thin vertical thing at x, from y0 to y1, touch first (scanning in the direction of travel)
  function shieldHit(x, y0, y1) {
    if (Math.max(y0, y1) < SHY || Math.min(y0, y1) >= SHY + SHH) return null;
    const xi = Math.floor(x);
    for (let si = 0; si < SHIELDS.length; si++) {
      const px = xi - SHIELDS[si];
      if (px < 0 || px >= SHW) continue;
      const m = run.shields[si], a = Math.floor(y0), b = Math.floor(y1), s = b >= a ? 1 : -1;
      for (let y = a; y !== b + s; y += s) { const py = y - SHY; if (py >= 0 && py < SHH && m[py * SHW + px]) return { si, x: xi, y }; }
    }
    return null;
  }

  // ---------- life cycle ----------
  function start({ seed = 1, humans = [], hostId, meId, send, opts = {} } = {}) {
    stop();
    art();
    const mode = MODES.find((m) => m.id === opts.mode) || MODES[0];
    const scr = createScreen(W, H, 'invaders');
    scr.setRect(rect);
    const me0 = humans.find((h) => h.me) || { id: meId ?? 'me', name: 'toi', color: 0xc8581a, me: true };
    run = { seed, mode: mode.id, vs: mode.id === 'versus', scr, humans, hostId, meId: me0.id, host: hostId === me0.id || !hostId, send: send ?? (() => {}),
      R: rng(seed ^ 0x51ed), players: new Map(), gone: new Set(), bots: [], shots: [], vshots: [], ab: [], parts: [], pops: [], pending: new Map(),
      phase: 'count', phaseT: 0, clock: 0, acc: 0, sendT: 0, syncT: 0, note: 0, shake: 0, prevFire: false, sky: stars(seed, W, GY, 110), solo: humans.length < 2, final: null };
    const n = run.vs && humans.length < 2 ? 3 : Math.max(1, humans.length);
    humans.forEach((h, k) => run.players.set(h.id, newPlayer(h, k, n)));
    if (!run.players.has(run.meId)) run.players.set(run.meId, newPlayer(me0, 0, n));
    run.me = run.players.get(run.meId);
    run.me.me = true;
    // versus alone: two robots to shoot at
    if (run.vs && humans.length < 2) BOTS.forEach((b, k) => { const p = newPlayer({ id: '@b' + k, name: b.name, color: b.color }, k + 1, 3); p.bot = true; p.aim = p.x; p.think = 0; run.players.set(p.id, p); run.bots.push(p); });
    newWave(1);
    sfx.init();
    render();
  }
  function newPlayer(h, k, n) {
    const x = Math.round(W * (k + 1) / (n + 1) - 6);
    return { id: h.id, name: h.me ? 'toi' : h.name, color: h.color ?? 0xffffff, x, tx: x, lives: LIVES, score: 0, dead: 0, inv: 0, out: false, outAt: null, extra: false, shot: null };
  }
  function stop() {
    if (!run) return;
    run.scr.remove();
    run = null;
    sfx.close();
  }

  // ---------- the loop ----------
  function update(dt, keys) {
    const r = run;
    if (!r) return;
    dt = Math.min(dt, .1);
    if (dt > 0) sfx.init();
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = { l: k('ArrowLeft', 'KeyA'), r: k('ArrowRight', 'KeyD'), fire: k('Space', 'KeyW', 'ArrowUp', 'KeyJ', 'KeyK') };
    r.acc += dt;
    while (r.acc >= STEP && run === r) { r.acc -= STEP; tick(inp); }
    if (run !== r) return;
    sfx.tick();
    r.sendT += dt;
    if (r.sendT >= SEND && r.phase !== 'over' && r.phase !== 'done') {
      r.sendT = 0;
      const m = r.me;
      r.send({ t: 's', x: Math.round(m.x), l: m.lives, sc: m.score, d: m.dead > 0 ? 1 : 0, iv: m.inv > 0 ? 1 : 0, o: m.out ? 1 : 0 });
    }
    render();
  }
  function tick(inp) {
    const r = run;
    if (r.phase === 'done') return;
    r.clock += STEP; r.phaseT += STEP;
    r.shake = Math.max(0, r.shake - STEP * 8);
    if (r.phase === 'count') {
      const n = Math.ceil(COUNT - r.phaseT);
      if (n !== r.beep && n > 0) { r.beep = n; sfx.beep(false); }
      if (r.phaseT >= COUNT) { r.phase = 'play'; r.phaseT = 0; sfx.beep(true); }
      return;
    }
    if (r.phase === 'over') {
      stepParts(r.parts, STEP, 30);
      if (r.phaseT >= OVER) finish();
      return;
    }
    if (r.phase === 'clear' && r.host && r.phaseT >= 2.4) {
      newWave(r.wave + 1); r.phase = 'play'; r.phaseT = 0; sfx.wave();
      r.send({ t: 'g', ...snap() });
    }
    if (r.host && r.phase === 'play') hostSwarm();
    if (r.host) for (const b of r.bots) stepBot(b);
    // pending kills the host never confirmed come back
    for (const [i, t] of r.pending) if (r.clock - t > 1.2) r.pending.delete(i);
    stepMe(inp);
    stepShots();
    stepAB();
    // the swarm grinds through the shields as it comes down
    const e = extent();
    if (e.r1 >= 0 && r.gy + e.r1 * CH + 8 >= SHY) {
      for (let k = 0; k < ROWS; k++) for (let c = 0; c < COLS; c++) {
        if (!alive(k, c)) continue;
        const a = aRect(k, c);
        if (a.y + a.h < SHY || a.y > SHY + SHH) continue;
        SHIELDS.forEach((sx, si) => {
          for (let j = Math.max(0, a.y - SHY); j < Math.min(SHH, a.y + a.h - SHY); j++) for (let i = Math.max(0, a.x - sx); i < Math.min(SHW, a.x + a.w - sx); i++) {
            if (r.shields[si][j * SHW + i]) { r.shields[si][j * SHW + i] = 0; r.shieldArt = null; }
          }
        });
      }
    }
    // the saucer on the clients: ride along between two snapshots
    if (!r.host && r.ufo) { r.ufo.x += r.ufo.d * 42 * STEP; if (r.ufo.x < -20 || r.ufo.x > W + 4) r.ufo = null; }
    sfx.saucer(!!r.ufo && r.phase === 'play');
    // the others slide to where they said they were
    for (const p of r.players.values()) if (!p.me && !(p.bot && r.host)) p.x += (p.tx - p.x) * Math.min(1, STEP * 14);
    stepParts(r.parts, STEP, 30);
    for (let n = r.pops.length - 1; n >= 0; n--) if ((r.pops[n].t -= STEP) <= 0) r.pops.splice(n, 1);
    if (r.host) hostCheck();
  }
  function stepMe(inp) {
    const r = run, m = r.me;
    if (m.out) return;
    if (m.inv > 0) m.inv -= STEP;
    if (m.dead > 0) {
      m.dead -= STEP;
      if (m.dead <= 0) { m.dead = 0; if (m.lives <= 0) { m.out = true; m.outAt = r.clock; } else { m.inv = 2; } }
      return;
    }
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    m.x = clamp(m.x + dir * 100 * STEP, 6, W - 19);
    if (inp.fire && !m.shot && (r.phase === 'play' || r.phase === 'clear')) {
      m.shot = { x: Math.round(m.x + 6), y: SY - 4, o: m.id, real: true };
      r.shots.push(m.shot);
      r.send({ t: 'f', x: m.shot.x });
      sfx.shot();
    }
  }
  // a robot: stands under the lowest alien of a column, sidesteps the shots coming at it, shoots what's above
  function stepBot(b) {
    const r = run;
    if (b.out) return;
    if (b.inv > 0) b.inv -= STEP;
    if (b.dead > 0) { b.dead -= STEP; if (b.dead <= 0) { b.dead = 0; if (b.lives <= 0) { b.out = true; b.outAt = r.clock; } else b.inv = 2; } return; }
    if ((b.think -= STEP) <= 0) {
      b.think = .4 + r.R() * .8;
      const cols = []; for (let c = 0; c < COLS; c++) for (let k = ROWS - 1; k >= 0; k--) if (alive(k, c)) { cols.push(c); break; }
      if (r.vs && r.R() < .3) { const foes = [...r.players.values()].filter((p) => p !== b && !p.out && !p.dead); if (foes.length) b.aim = foes[Math.floor(r.R() * foes.length)].x; }
      else if (cols.length) b.aim = r.gx + cols[Math.floor(r.R() * cols.length)] * CW + 2;
    }
    let goal = b.aim;
    for (const s of r.ab) if (s.y > SY - 50 && s.y < SY + 4 && Math.abs(s.x - (b.x + 6)) < 12) goal = b.x + (s.x > b.x + 6 ? -30 : 30);
    const d = clamp(goal - b.x, -1, 1) * (Math.abs(goal - b.x) > 2 ? 1 : 0);
    b.x = clamp(b.x + d * 85 * STEP, 6, W - 19);
    if (!b.shot && r.phase === 'play' && r.R() < .08) {
      let target = false;
      const cx = b.x + 6;
      for (let k = 0; k < ROWS && !target; k++) for (let c = 0; c < COLS; c++) if (alive(k, c)) { const a = aRect(k, c); if (cx > a.x - 1 && cx < a.x + a.w + 1) { target = true; break; } }
      if (r.ufo && Math.abs(r.ufo.x + 8 - cx) < 20) target = true;
      if (r.vs) for (const p of r.players.values()) if (p !== b && !p.out && !p.dead && Math.abs(p.x - b.x) < 6) target = true;
      if (target) { b.shot = { x: Math.round(cx), y: SY - 4, o: b.id, real: true }; r.shots.push(b.shot); r.send({ t: 'f', x: b.shot.x, o: b.id }); }
    }
  }
  function award(p, pts, x, y) {
    p.score += pts;
    if (x != null) run.pops.push({ x, y, s: String(pts), t: .8, col: p.me ? '#ffd23c' : '#fcfcfc' });
    if (!p.extra && p.score >= EXTRA) { p.extra = true; p.lives++; if (p.me) { sfx.oneUp(); run.pops.push({ x: p.x + 6, y: SY - 14, s: '1up', t: 1.2, col: '#7fff7f' }); } }
  }
  function stepShots() {
    const r = run;
    for (const s of r.shots) {
      if (s.dead) continue;
      const y0 = s.y;
      s.y -= 260 * STEP;
      const owner = r.players.get(s.o);
      if (s.y < 20) { s.dead = true; burst(r.parts, s.x, 22, '#ff5a5a', 4, 30, .25); continue; }
      // shields
      const sh = shieldHit(s.x, y0, s.y);
      if (sh) {
        s.dead = true;
        if (s.real) { const sd = Math.floor(r.R() * 1e6); erode(sh.si, sh.x, sh.y, sd); r.send({ t: 'e', si: sh.si, x: sh.x, y: sh.y, s: sd }); }
        continue;
      }
      // alien bullets: shot against shot
      for (const b of r.ab) if (!b.dead && Math.abs(b.x - s.x) < 3 && b.y < y0 + 4 && b.y + 7 > s.y) { if ((b.k + b.x) % 3) { b.dead = true; } s.dead = true; burst(r.parts, s.x, s.y, '#fcfcfc', 5, 30, .2); break; }
      if (s.dead) continue;
      // aliens
      hit: for (let k = ROWS - 1; k >= 0; k--) for (let c = 0; c < COLS; c++) {
        if (!alive(k, c)) continue;
        const a = aRect(k, c);
        if (s.x >= a.x && s.x < a.x + a.w && s.y < a.y + a.h && y0 + 4 > a.y) {
          s.dead = true;
          if (s.real) killAlien(k, c, owner);
          else { burst(r.parts, a.x + a.w / 2, a.y + 4, ROW_COL[k], 6, 40, .3); }
          break hit;
        }
      }
      if (s.dead) continue;
      // the saucer
      if (r.ufo && s.y < 36 && s.y > 22 && s.x >= r.ufo.x && s.x < r.ufo.x + 16) {
        s.dead = true;
        if (s.real) {
          const pts = UFO_PTS[Math.floor(r.R() * UFO_PTS.length)];
          ufoDown(r.ufo.x, s.o, pts);
          r.send({ t: 'u', by: s.o, x: Math.round(r.ufo.x), p: pts });
          r.ufo = null;
        }
        continue;
      }
      // versus: the other ships
      if (r.vs) for (const p of r.players.values()) {
        if (p.id === s.o || p.out || p.dead || p.inv > 0) continue;
        if (s.x >= p.x && s.x < p.x + 13 && s.y < SY + 8 && s.y > SY - 4) {
          s.dead = true;
          // the one hit decides: me, or the host for its robots
          if (p.me || (p.bot && r.host)) shipHit(p, s.o);
          break;
        }
      }
    }
    for (const p of r.players.values()) if (p.shot?.dead) p.shot = null;
    r.shots = r.shots.filter((s) => !s.dead);
  }
  function killAlien(k, c, by) {
    const r = run, a = aRect(k, c), i = k * COLS + c;
    if (r.host) r.mask[k] &= ~(1 << c); else r.pending.set(i, r.clock);
    r.dying = r.dying || [];
    r.dying.push({ x: a.x + a.w / 2 - 6, y: a.y, k, t: .25 });
    burst(r.parts, a.x + a.w / 2, a.y + 4, ROW_COL[k], 8, 50, .35);
    if (by) award(by, ROW_PTS[k]);
    if (by?.me || by?.bot) sfx.pop();
    r.send({ t: 'k', i, by: by?.id });
  }
  function ufoDown(x, by, pts) {
    const r = run, p = r.players.get(by);
    if (p) award(p, pts, x + 8, 26);
    burst(r.parts, x + 8, 28, '#ff4a4a', 18, 70, .6);
    burst(r.parts, x + 8, 28, '#ffd23c', 10, 50, .5);
    sfx.ufoHit(); r.shake = 2;
  }
  function shipHit(p, by) {
    const r = run;
    if (p.dead || p.out || p.inv > 0) return;
    p.lives--; p.dead = 1.3;
    if (p.shot) { p.shot.dead = true; p.shot = null; }
    burst(r.parts, p.x + 6, SY + 4, hex(p.color), 16, 60, .7);
    burst(r.parts, p.x + 6, SY + 4, '#ffd23c', 10, 40, .5);
    if (p.me) { sfx.die(); r.shake = 4; } else sfx.boom(false);
    r.send({ t: 'hit', v: p.id, by: by || null });
    if (by && r.vs) { const s = r.players.get(by); if (s && (s.me || (s.bot && r.host))) award(s, 100, p.x + 6, SY - 8); }
  }
  function stepAB() {
    const r = run;
    for (const b of r.ab) {
      if (b.dead) continue;
      const y0 = b.y;
      b.y += b.vy * STEP; b.a += STEP;
      const sh = shieldHit(b.x, y0, b.y + 6);
      if (sh) { b.dead = true; erode(sh.si, sh.x, sh.y + 1, (b.x * 131 + sh.y * 7) | 0, true); continue; }
      if (b.y + 6 >= GY + 2) { b.dead = true; burst(r.parts, b.x, GY + 2, '#c8c8d0', 5, 30, .3); continue; }
      for (const p of r.players.values()) {
        if (!(p.me || (p.bot && r.host)) || p.out || p.dead || p.inv > 0) continue;
        if (b.x >= p.x && b.x < p.x + 13 && b.y + 6 >= SY && b.y < SY + 8) { b.dead = true; shipHit(p, null); break; }
      }
    }
    r.ab = r.ab.filter((b) => !b.dead);
  }
  function hostCheck() {
    const r = run;
    if (r.phase === 'over') return;
    const ps = [...r.players.values()], flying = ps.filter((p) => !p.out);
    if (!flying.length) hostEnd('out');
    else if (r.vs && ps.length > 1 && flying.length <= 1 && flying.every((p) => !p.dead)) hostEnd('last');
  }
  function hostEnd(why) {
    const r = run;
    if (r.phase === 'over') return;
    const sc = [...r.players.values()].map((p) => [p.id, p.score, p.out ? (p.outAt ?? r.clock) : null]);
    r.send({ t: 'end', why, sc });
    gameOver(why, sc);
  }
  function gameOver(why, sc) {
    const r = run;
    r.phase = 'over'; r.phaseT = 0; r.why = why;
    for (const [id, s, o] of sc) { const p = r.players.get(id); if (p) { p.score = Math.max(p.score, s); p.outAt = o; } }
    sfx.saucer(false);
    if (why === 'invasion') { r.shake = 6; sfx.over(); for (const p of r.players.values()) if (!p.out) burst(r.parts, p.x + 6, SY + 4, hex(p.color), 12, 50, .8); }
    else if (standings()[0]?.me) sfx.win(); else sfx.over();
  }
  // the ranking: versus, the last ones flying first; co-op, the scores
  function standings() {
    const r = run, list = [...r.players.values()];
    if (r.vs) return list.sort((a, b) => (b.outAt ?? 1e9) - (a.outAt ?? 1e9) || b.score - a.score);
    if (r.solo) {
      const regs = REGULARS.map((g, k) => ({ id: '@r' + k, name: g.name, color: g.color, score: [3800, 2200, 1100][k], reg: true }));
      return [...list, ...regs].sort((a, b) => b.score - a.score);
    }
    return list.sort((a, b) => b.score - a.score);
  }
  function finish() {
    const r = run, list = standings(), place = list.findIndex((p) => p.me) + 1, of = list.length;
    const m = r.me;
    const text = `${ord(place)} place sur ${of} · ${m.score} points · vague ${r.wave}`;
    r.phase = 'done';
    // after the frame: main drops the race when it hears the end
    setTimeout(() => { if (run === r) onEnd({ place, of, time: Math.round(r.clock * 10) / 10, value: m.score, text }); });
  }

  // ---------- the network ----------
  function onFx(id, fx) {
    const r = run;
    if (!r || !fx || id === r.meId || r.gone.has(id)) return;
    let p = r.players.get(id);
    if (!p && fx.t === 's') { p = newPlayer({ id, name: 'invité', color: 0xffffff }, 0, 1); r.players.set(id, p); }
    if (fx.t === 's' && p) {
      p.tx = +fx.x || 0; p.lives = fx.l | 0; p.score = Math.max(p.score, fx.sc | 0); p.dead = fx.d ? Math.max(p.dead, .01) : 0; p.inv = fx.iv ? .1 : 0;
      if (fx.o && !p.out) { p.out = true; p.outAt = r.clock; }
    } else if (fx.t === 'g' && id === r.hostId && !r.host) {
      if (fx.w !== r.wave) { newWave(fx.w); if (r.phase === 'clear' || fx.w > 1) sfx.wave(); }
      if (r.phase !== 'over' && r.phase !== 'count') r.phase = fx.ph;
      if (fx.f !== r.frame) sfx.march(r.note++);
      r.gx = fx.x; r.gy = fx.y; r.dir = fx.d; r.frame = fx.f; r.mask = fx.m;
      for (const i of r.pending.keys()) if (!(r.mask[Math.floor(i / COLS)] >> (i % COLS) & 1)) r.pending.delete(i);
      if (fx.u) { if (!r.ufo) r.ufo = { x: fx.u[0], d: fx.u[1] }; else r.ufo.x += (fx.u[0] - r.ufo.x) * .5; } else r.ufo = null;
      (fx.b || []).forEach(([x, l, sc, d, o], k) => {
        const b = r.bots[k] || (r.bots[k] = (() => { const q = newPlayer({ id: '@b' + k, name: BOTS[k].name, color: BOTS[k].color }, k + 1, 3); q.bot = true; r.players.set(q.id, q); return q; })());
        b.tx = x; b.lives = l; b.score = sc; b.dead = d ? .1 : 0;
        if (o && !b.out) { b.out = true; b.outAt = r.clock; }
      });
    } else if (fx.t === 'ab' && id === r.hostId) addAB(fx.b);
    else if (fx.t === 'f') { r.shots.push({ x: +fx.x, y: SY - 4, o: fx.o || id, real: false }); }
    else if (fx.t === 'k') {
      const i = fx.i | 0, k = Math.floor(i / COLS), c = i % COLS;
      if (k >= ROWS) return;
      const was = alive(k, c);
      if (r.host) r.mask[k] &= ~(1 << c); else r.pending.set(i, r.clock);
      if (was) { const a = aRect(k, c); (r.dying = r.dying || []).push({ x: a.x + a.w / 2 - 6, y: a.y, k, t: .25 }); burst(r.parts, a.x + a.w / 2, a.y + 4, ROW_COL[k], 6, 40, .3); sfx.pop(); }
      const by = r.players.get(fx.by);
      if (by && !by.me && was) by.score += ROW_PTS[k];
    } else if (fx.t === 'u') {
      if (r.ufo || fx.x != null) { r.ufo = null; const p = r.players.get(fx.by); const x = +fx.x || 0; burst(r.parts, x + 8, 28, '#ff4a4a', 18, 70, .6); sfx.ufoHit(); if (p && !p.me) { p.score += fx.p | 0; r.pops.push({ x: x + 8, y: 26, s: String(fx.p | 0), t: .8, col: '#fcfcfc' }); } }
    } else if (fx.t === 'e') { if (r.shields[fx.si]) erode(fx.si | 0, fx.x | 0, fx.y | 0, fx.s | 0); }
    else if (fx.t === 'hit') {
      const v = r.players.get(fx.v);
      if (v && !v.me) { burst(r.parts, v.x + 6, SY + 4, hex(v.color), 16, 60, .7); sfx.boom(false); v.dead = 1; }
      const by = r.players.get(fx.by);
      if (by && r.vs && (by.me || (by.bot && r.host))) award(by, 100, (v?.x ?? 0) + 6, SY - 8);
    } else if (fx.t === 'end' && id === r.hostId && r.phase !== 'over') gameOver(fx.why, fx.sc || []);
  }
  function peerLeft(id) {
    const r = run;
    if (!r || id === r.meId) return;
    r.gone.add(id);
    const p = r.players.get(id);
    if (p) r.players.delete(id);
    r.humans = r.humans.filter((h) => h.id !== id);
    if (id === r.hostId) {
      r.hostId = r.humans[0]?.id ?? r.meId;
      if (r.hostId === r.meId) {
        r.host = true; r.stepT = 0; r.syncT = 0; r.fireT = 1; r.ufoT = 15;
        for (const [i] of r.pending) r.mask[Math.floor(i / COLS)] &= ~(1 << (i % COLS));
        r.pending.clear();
        for (const b of r.bots) { b.x = b.tx; b.aim = b.x; b.think = 0; }
      }
    }
  }

  // ---------- drawing ----------
  function render() {
    const r = run, x = r.scr.bx;
    const g = x.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, '#020208'); g.addColorStop(1, '#0a0c1c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    drawStars(x, r.sky, r.clock, W);
    x.drawImage(A.earth, 10, 112);
    // aliens
    for (let k = 0; k < ROWS; k++) for (let c = 0; c < COLS; c++) {
      if (!alive(k, c)) continue;
      const a = aRect(k, c);
      x.drawImage(A.al[k][r.frame], Math.round(a.x), Math.round(a.y));
    }
    if (r.dying) { for (const d of r.dying) { x.drawImage(A.boom[d.k], Math.round(d.x), Math.round(d.y)); d.t -= 1 / 60; } r.dying = r.dying.filter((d) => d.t > 0); }
    if (r.ufo) x.drawImage(Math.floor(r.clock * 8) % 2 ? A.ufo : A.ufoHi, Math.round(r.ufo.x), 24);
    // shields
    if (!r.shieldArt) {
      const [c, sx] = canvas(W, SHH);
      r.shields.forEach((m, si) => { for (let j = 0; j < SHH; j++) for (let i = 0; i < SHW; i++) if (m[j * SHW + i]) { sx.fillStyle = j < 2 ? '#dfe6f0' : (i * 7 + j * 13) % 9 === 0 ? '#7d8698' : (i + j) % 7 === 0 ? '#aeb6c6' : '#9aa3b4'; sx.fillRect(SHIELDS[si] + i, j, 1, 1); } });
      r.shieldArt = c;
    }
    x.drawImage(r.shieldArt, 0, SHY);
    // the ground, and the ships on it
    x.drawImage(A.ground, 0, GY - 2);
    for (const p of r.players.values()) {
      if (p.out) continue;
      const px = Math.round(p.x);
      if (p.dead > 0) { x.drawImage(A.sboom[Math.floor(r.clock * 10) % 2], px, SY + 2); continue; }
      if (p.inv > 0 && Math.floor(r.clock * 12) % 2) continue;
      x.globalAlpha = p.me ? 1 : .8;
      x.drawImage(shipOf(p.color), px, SY);
      x.globalAlpha = 1;
      if (!p.me) { x.fillStyle = hex(p.color); x.fillRect(px + 5, SY + 11, 3, 1); }
      else if (r.players.size > 1) { x.fillStyle = '#ffd23c'; x.fillRect(px + 4, SY + 11, 5, 1); x.fillRect(px + 6, SY + 10, 1, 1); }
    }
    // shots
    for (const s of r.shots) {
      const p = r.players.get(s.o);
      x.fillStyle = p?.me ? '#fcfcfc' : p ? hex(p.color) : '#fcfcfc';
      x.fillRect(Math.round(s.x), Math.round(s.y), 1, 4);
    }
    for (const b of r.ab) drawAB(x, b);
    drawParts(x, r.parts);
    for (const p of r.pops) text(x, p.s, Math.round(p.x), Math.round(p.y - (.8 - p.t) * 10), p.col, 1, PAL.K, 'center');
    drawHud(x);
    r.scr.blit(r.shake);
  }
  function drawAB(x, b) {
    const px = Math.round(b.x), py = Math.round(b.y), f = Math.floor(b.a * 12) % 4;
    x.fillStyle = b.k === 0 ? '#ffe070' : b.k === 1 ? '#ff8a8a' : '#a0f0ff';
    if (b.k === 0) { for (let j = 0; j < 7; j++) x.fillRect(px + ((j + f) % 4 < 2 ? -1 : 0), py + j, 1, 1); }
    else if (b.k === 1) { x.fillRect(px, py, 1, 7); x.fillRect(px - 1, py + (f % 2 ? 1 : 5), 3, 1); }
    else { x.fillRect(px, py, 1, 7); x.fillRect(px + (f < 2 ? -1 : 1), py + 2 + f, 1, 2); }
  }
  function drawHud(x) {
    const r = run, m = r.me, sh = PAL.K;
    text(x, 'score', 6, 4, '#8fe3ff', 1, sh);
    text(x, String(m.score).padStart(5, '0'), 40, 4, PAL.W, 1, sh);
    text(x, 'vague ' + r.wave, W / 2 + 6, 4, '#b6ff7a', 1, sh, 'center');
    for (let n = 0; n < Math.min(5, Math.max(0, m.lives - (m.dead > 0 ? 0 : 1))); n++) x.drawImage(shipOf(m.color), W - 18 - n * 15, 3);
    // the others' scores down the left, small bars
    const others = [...r.players.values()].filter((p) => !p.me);
    others.slice(0, 5).forEach((p, n) => {
      const y = 14 + n * 9;
      x.fillStyle = hex(p.color); x.fillRect(6, y + 2, 4, 4);
      text(x, `${p.name.slice(0, 8)} ${p.score}${p.out ? ' x' : ''}`, 13, y, p.out ? '#707070' : '#bcbcbc');
    });
    if (r.phase === 'count') {
      const n = Math.ceil(COUNT - r.phaseT);
      box(x, 28, 86, W - 56, 64, '#8fe3ff');
      text(x, 'envahisseurs', W / 2, 94, '#ffd23c', 2, sh, 'center');
      text(x, 'lunaires', W / 2, 112, '#ffd23c', 2, sh, 'center');
      text(x, r.vs ? 'chacun pour soi' : r.players.size > 1 ? 'tous ensemble' : 'defends la lune', W / 2, 130, PAL.W, 1, null, 'center');
      text(x, String(n), W / 2, 139, PAL.W, 1, null, 'center');
    } else if (r.phase === 'play' && r.phaseT < 1.4) text(x, 'vague ' + r.wave, W / 2, 150, '#ffd23c', 2, sh, 'center');
    else if (r.phase === 'clear') text(x, 'vague nettoyee !', W / 2, 110, '#b6ff7a', 2, sh, 'center');
    if (m.out && r.phase !== 'over') text(x, 'plus de vaisseau - regarde les autres', W / 2, 160, '#bcbcbc', 1, sh, 'center');
    if (r.phase === 'over' || r.phase === 'done') drawResults(x);
  }
  function drawResults(x) {
    const r = run;
    if (r.why === 'invasion' && r.phaseT < 1.5) { text(x, 'la lune est envahie !', W / 2, 110, '#ff5a5a', 1, PAL.K, 'center'); return; }
    const list = standings().slice(0, 8), h = 46 + list.length * 12, y0 = Math.round((H - h) / 2);
    box(x, 32, y0, W - 64, h, '#ffd23c');
    text(x, r.vs ? 'dernier en vol' : r.solo ? 'meilleurs scores' : 'scores', W / 2, y0 + 7, '#ffd23c', 1, null, 'center');
    list.forEach((p, n) => {
      const y = y0 + 22 + n * 12, col = p.me ? '#ffd23c' : p.reg ? '#8a8a9a' : PAL.W;
      text(x, `${n + 1}.`, 42, y, col);
      x.fillStyle = hex(p.color); x.fillRect(58, y + 1, 5, 5);
      text(x, p.name.slice(0, 12), 68, y, col);
      text(x, String(p.score), W - 42, y, col, 1, null, 'right');
    });
    text(x, `fin dans ${Math.max(0, Math.ceil(OVER - r.phaseT))}`, W / 2, y0 + h - 12, '#bcbcbc', 1, null, 'center');
  }

  return {
    modes: MODES.map(({ id, name, sub, help }) => ({ id, name, sub, help })),
    keys: [['← →', 'bouger'], ['q d', 'bouger aussi'], ['espace', 'tirer']],
    start, stop, update, onFx, peerLeft,
    respawn() {},
    hud() { return { hidden: true }; },
    setRect(rc) { rect = rc; run?.scr.setRect(rc); },
    set onEnd(f) { onEnd = f; },
    get _dbg() { return run; },
  };
}
