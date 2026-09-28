// survie.js: « survie sur mars » — from the hab to the MAV, 200 tiles of red desert away, before it lifts off.
// A rover to drive and to recharge in the sun, a suit to walk where it can't go, food to find, storms to dodge.
// Seen from above. Co-op: each has a rover, the caches are shared (the host says who got there first).
import { W, H, P, clamp, rng, createScreen, makeCanvas, createGui, createKeys, createSfx, txt, title, box, bar, hexOf, LEFT, RIGHT, UP, DOWN } from './mars-kit.js';

const TW = 8, N = 200, SOL = 100, COUNT = 3.4;
const HAB = [22, 176], MAV = [178, 22];
const DAY = (t) => (t / SOL + .12) % 1;
const SUN = (t) => { const f = DAY(t); return f > .05 && f < .72 ? Math.sin(Math.PI * (f - .05) / .67) : 0; };
const MODES = [
  { id: 'mav', name: 'vers le mav', sub: 'le mav décolle au sol 8', help: 'rejoins le mav avant le sol 8', sols: 7 },
  { id: 'dur', name: 'pénurie', sub: 'moins de vivres, le mav décolle au sol 7', help: 'moins de tout, le mav décolle au sol 7', sols: 6, hard: true },
];
const LOOT = {
  food: { name: 'rations', c: '#e8cf8a' }, o2: { name: 'oxygène', c: '#8fd8ff' }, kit: { name: 'kit de réparation', c: '#c9c9c9' },
  cell: { name: 'batterie', c: '#8ef08a' }, panel: { name: 'panneau solaire', c: '#5fa8ff' }, radio: { name: 'radio de pathfinder', c: '#ffcc4a' },
};
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

// ---------- the land: the same from the seed for everyone ----------
function makeLand(seed) {
  const R = rng(seed * 7 + 3);
  const G = 26, grid = Array.from({ length: (G + 1) * (G + 1) }, R), grid2 = Array.from({ length: (G + 1) * (G + 1) }, R);
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (g, x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j), k = (a, b) => g[(((b % G) + G) % G) * (G + 1) + (((a % G) + G) % G)];
    return (k(i, j) * (1 - fx) + k(i + 1, j) * fx) * (1 - fy) + (k(i, j + 1) * (1 - fx) + k(i + 1, j + 1) * fx) * fy; };
  const fbm = (g, x, y) => noise(g, x, y) * .55 + noise(g, x * 2.1 + 5, y * 2.1) * .3 + noise(g, x * 4.3, y * 4.3 + 9) * .15;
  const hgt = (px, py) => fbm(grid, px / (TW * 22), py / (TW * 22));
  const T = new Uint8Array(N * N);   // 0 sand · 1 dunes · 2 rocks · 3 crater rim · 4 crater floor
  const clear = (x, y) => dist(x, y, ...HAB) < 12 || dist(x, y, ...MAV) < 12;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = hgt(x * TW + 4, y * TW + 4), d = fbm(grid2, x / 15, y / 15);
    T[y * N + x] = clear(x, y) ? 0 : h > .69 ? 2 : d > .62 ? 1 : 0;
  }
  const craters = [];
  for (let n = 0; n < 16; n++) {
    const r = 4 + Math.floor(R() * 8), cx = 12 + Math.floor(R() * (N - 24)), cy = 12 + Math.floor(R() * (N - 24));
    if (dist(cx, cy, ...HAB) < r + 14 || dist(cx, cy, ...MAV) < r + 14) continue;
    const gap = R() * 6.28;
    craters.push({ x: cx, y: cy, r });
    for (let y = cy - r - 2; y <= cy + r + 2; y++) for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = dist(x + .5, y + .5, cx, cy), a = Math.atan2(y - cy, x - cx);
      const ingap = Math.abs(((a - gap + 9.42) % 6.28) - 3.14) < .35;
      if (d < r - .8) T[y * N + x] = 4;
      else if (d < r + .9) T[y * N + x] = ingap ? 4 : 3;
    }
  }
  // the edge of the map: cliffs
  for (let i = 0; i < N; i++) for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i], [i, 1], [1, i], [i, N - 2], [N - 2, i]]) T[y * N + x] = 2;
  // the sites: a second rover to strip near the hab, pathfinder half way, caches everywhere (often where the rover can't go)
  const sites = [];
  const free = (x, y, foot) => x > 4 && y > 4 && x < N - 4 && y < N - 4 && (foot ? true : T[y * N + x] === 0);
  function place(kind, loot, x0, y0, spread, foot = false) {
    for (let k = 0; k < 80; k++) {
      const x = Math.round(x0 + (R() - .5) * spread * 2), y = Math.round(y0 + (R() - .5) * spread * 2);
      if (!free(x, y, foot) || sites.some((s) => dist(s.x, s.y, x, y) < 10) || dist(x, y, ...HAB) < 9) continue;
      sites.push({ kind, loot, x, y, i: sites.length });
      if (!foot) T[y * N + x] = 0;
      return;
    }
  }
  place('wreck', ['cell', 'kit'], HAB[0] + 16, HAB[1] - 6, 5);
  place('pathfinder', ['radio', 'panel'], 92, 104, 14);
  const bag = ['food', 'food', 'food', 'o2', 'kit', 'kit', 'cell', 'panel', 'food', 'o2'];
  bag.forEach((l, i) => {
    const t = (i + .5) / bag.length, bx = HAB[0] + (MAV[0] - HAB[0]) * t, by = HAB[1] + (MAV[1] - HAB[1]) * t;
    const side = (i % 2 ? 1 : -1) * (18 + R() * 30);
    place('cache', [l, i % 3 === 0 ? 'food' : l === 'food' ? 'o2' : 'food'], bx + side * .7, by + side * .7, 12, R() < .6);
  });
  // storms roll across from the east
  const storms = [];
  for (let n = 0; n < 4; n++) {
    const t0 = SOL * (.6 + n * 1.35 + R() * .5), y = 30 + R() * (N - 60), r = 16 + R() * 12;
    storms.push({ t0, t1: t0 + SOL * (1.3 + R() * .6), x0: N + r, y0: y, vx: -(1.1 + R() * .5), vy: (R() - .5) * .4, r });
  }
  return { T, sites, craters, storms, hgt };
}
const stormAt = (s, t) => t < s.t0 || t > s.t1 ? null : { x: s.x0 + s.vx * (t - s.t0), y: s.y0 + s.vy * (t - s.t0), r: s.r * Math.min(1, (t - s.t0) / 20, (s.t1 - t) / 20) };

// the land painted once, pixel by pixel
function paintLand(L, seed) {
  const [c, g] = makeCanvas(N * TW, N * TW), img = g.createImageData(N * TW, N * TW), d = img.data;
  const R = rng(seed + 99);
  const pal = {
    0: [[193, 101, 58], [201, 110, 64], [184, 94, 53]], 1: [[214, 132, 80], [205, 122, 72], [222, 142, 90]],
    2: [[107, 53, 36], [124, 62, 40], [88, 43, 30]], 3: [[160, 82, 48], [176, 92, 54], [140, 70, 42]], 4: [[150, 72, 42], [140, 66, 38], [158, 78, 46]],
  };
  const S = N * TW, HS = S / 4 + 2;
  // the height every 4 pixels, the crater of every tile: looked up, not recomputed
  const hg = new Float32Array(HS * HS);
  for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) hg[y * HS + x] = L.hgt(x * 4, y * 4);
  const cr = new Int16Array(N * N).fill(-1);
  L.craters.forEach((q, n) => { for (let y = q.y - q.r - 3; y <= q.y + q.r + 3; y++) for (let x = q.x - q.r - 3; x <= q.x + q.r + 3; x++) if (x >= 0 && y >= 0 && x < N && y < N) cr[y * N + x] = n; });
  // 2×2 texels: coarse enough to be quick, fine enough under the 8 px tiles
  for (let py = 0; py < S; py += 2) {
    for (let px = 0; px < S; px += 2) {
      const tx = px >> 3, ty = py >> 3, t = L.T[ty * N + tx];
      const hx = px >> 2, hy = py >> 2, h0 = hg[hy * HS + hx], h1 = hg[Math.max(0, hy - 1) * HS + hx + 1];
      const shade = clamp((h1 - h0) * 55, -.25, .25);
      const k = (px * 7 + py * 13 + ((px * py) % 7)) % 3, cc = pal[t][R() < .12 ? 2 : k === 0 ? 1 : 0];
      let f = 1 + shade;
      if (t === 1) f += Math.sin((px + py * .6) * .45) * .06;
      else if (t === 3 || t === 4) { const q = L.craters[cr[ty * N + tx]]; if (q) f += (t === 3 ? .18 : -.12) * ((px / TW - q.x) * -.7 + (py / TW - q.y) * -.7) / q.r; }
      const cr0 = cc[0] * f, cg0 = cc[1] * f, cb0 = cc[2] * f;
      for (let o of [(py * S + px) * 4, (py * S + px + 1) * 4, ((py + 1) * S + px) * 4, ((py + 1) * S + px + 1) * 4]) { d[o] = cr0; d[o + 1] = cg0; d[o + 2] = cb0; d[o + 3] = 255; }
    }
  }
  g.putImageData(img, 0, 0);
  // boulders on the rocky tiles, pebbles everywhere
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const t = L.T[ty * N + tx], x = tx * TW, y = ty * TW;
    if (t === 2 && R() < .7) { const s = 3 + Math.floor(R() * 4), ox = Math.floor(R() * (8 - s)), oy = Math.floor(R() * (8 - s)); g.fillStyle = '#3e1d15'; g.fillRect(x + ox + 1, y + oy + 1, s, s); g.fillStyle = '#7a3e28'; g.fillRect(x + ox, y + oy, s, s - 1); g.fillStyle = '#95553a'; g.fillRect(x + ox, y + oy, s - 1, 1); }
    else if (t === 0 && R() < .05) { g.fillStyle = '#6b3524'; g.fillRect(x + Math.floor(R() * 7), y + Math.floor(R() * 7), 2, 1); }
  }
  // tracks around the hab
  g.fillStyle = 'rgba(80,30,15,.25)';
  for (let a = 0; a < 40; a++) { const x = HAB[0] * TW + a * 3, y = HAB[1] * TW - a * 1.2; g.fillRect(x, y, 2, 1); g.fillRect(x + 1, y + 5, 2, 1); }
  return c;
}

export function createSurvie({ audio, ui } = {}) {
  const sfx = createSfx(.13);
  let onEnd = () => {};
  let run = null, rect = null;

  const tileAt = (px, py) => { const x = Math.floor(px / TW), y = Math.floor(py / TW); return x < 0 || y < 0 || x >= N || y >= N ? 2 : run.L.T[y * N + x]; };
  const roverBlock = (px, py) => { const t = tileAt(px, py); return t === 2 || t === 3; };
  const inStorm = (x, y) => { for (const s of run.L.storms) { const p = stormAt(s, run.t); if (p && dist(x / TW, y / TW, p.x, p.y) < p.r) return 1 - dist(x / TW, y / TW, p.x, p.y) / p.r; } return 0; };

  // ---------- me ----------
  function freshMe(mode, i, color) {
    const hard = mode.hard;
    const rx = (HAB[0] + 4 + (i % 3) * 3) * TW, ry = (HAB[1] - 3 + Math.floor(i / 3) * 3) * TW;
    return {
      rv: { x: rx, y: ry, a: -.6, v: 0, panels: false }, x: rx, y: ry + 10, foot: false, face: 1, color,
      bat: 100, cap: 100, air: 100, suit: 100, food: hard ? 2.2 : 3, hull: 100, hp: 100, kits: hard ? 0 : 1, sun: 1, radio: false,
      st: 'go', doneT: 0, prog: 0, walk: false, wt: 0,
    };
  }
  const mePos = () => run.me.foot ? [run.me.x, run.me.y] : [run.me.rv.x, run.me.rv.y];
  const progress = (x, y) => clamp(1 - dist(x / TW, y / TW, ...MAV) / dist(...HAB, ...MAV), 0, 1);

  function stepMe(dt) {
    const r = run, me = r.me, K = r.K, rv = me.rv;
    if (me.st !== 'go') return;
    const sun = SUN(r.t), night = sun <= 0;
    const [px, py] = mePos(), storm = inStorm(px, py);
    r.storm = storm;
    // the rover's needs: life support, heating at night, the panels
    const heat = night ? .7 : .1;
    let use = .22 + heat;
    if (!me.foot && Math.abs(rv.v) > .5) use += 2.6 * Math.abs(rv.v) / 20;
    const charge = rv.panels ? 2.5 * sun * me.sun * (1 - storm * .92) : 0;
    const nearHab = dist(rv.x / TW, rv.y / TW, ...HAB) < 7 ? 6 : 0;
    me.bat = clamp(me.bat + (charge + nearHab - use) * dt, 0, me.cap);
    me.air = clamp(me.air + (me.bat > 0 ? .9 : -.7) * dt, 0, 100);
    // food: a day's worth a sol
    me.food = Math.max(0, me.food - dt / SOL);
    let hurt = 0;
    if (me.foot) {
      me.suit = Math.max(0, me.suit - dt * (1.5 + storm));
      if (me.suit <= 0) hurt += 6;
      if (night) hurt += .5;
    } else {
      me.suit = Math.min(100, me.suit + dt * 12);
      if (me.air <= 0) hurt += 4;
      if (me.bat <= 0 && night) hurt += 1;
    }
    if (me.food <= 0) hurt += .35;
    if (hurt) { me.hp -= hurt * dt; if (Math.random() < dt * 1.2) sfx.hurt(); }
    else me.hp = Math.min(100, me.hp + dt * .6);
    if (storm && !me.foot) me.hull = Math.max(0, me.hull - dt * storm * 1.2);
    if (me.hp <= 0) { me.hp = 0; me.st = 'dead'; me.doneT = r.t; sfx.lose(); note('tu n\'as pas survécu…', P.bad); return; }
    // moving
    if (r.task) {
      r.task.t += dt;
      if (K.has(...LEFT, ...RIGHT, ...UP, ...DOWN)) r.task = null;
      else if (r.task.t >= r.task.dur) { const f = r.task.fn; r.task = null; f(); }
      sfx.hum(0);
      return;
    }
    if (me.foot) {
      let dx = (K.has(...RIGHT) ? 1 : 0) - (K.has(...LEFT) ? 1 : 0), dy = (K.has(...DOWN) ? 1 : 0) - (K.has(...UP) ? 1 : 0);
      if (dx && dy) { dx *= .707; dy *= .707; }
      const t = tileAt(me.x, me.y), sp = 17 * (t === 2 || t === 3 ? .6 : 1) * (1 - storm * .4);
      const nx = me.x + dx * sp * dt, ny = me.y + dy * sp * dt;
      me.x = clamp(nx, TW * 2, (N - 2) * TW);
      me.y = clamp(ny, TW * 2, (N - 2) * TW);
      if (dx) me.face = dx;
      me.walk = !!(dx || dy);
      if (me.walk && (me.wt += dt) > .3) { me.wt = 0; sfx.step(); }
      sfx.hum(0);
    } else {
      const thr = (K.has(...UP) ? 1 : 0) - (K.has(...DOWN) ? .6 : 0), steer = (K.has(...RIGHT) ? 1 : 0) - (K.has(...LEFT) ? 1 : 0);
      const t = tileAt(rv.x, rv.y), terr = t === 1 ? .55 : t === 4 ? .8 : 1;
      const max = 20 * terr * (me.hull < 30 ? .55 : 1) * (1 - storm * .45) * (me.hull <= 0 || me.bat <= 0 ? 0 : 1);
      if (thr && rv.panels) { note('replie les panneaux d\'abord (espace)', P.warn); rv.panels = false; sfx.whoosh(); }
      rv.v += thr * 34 * dt;
      rv.v -= rv.v * (thr ? .6 : 2.2) * dt;
      rv.v = clamp(rv.v, -max * .5, max);
      if (Math.abs(rv.v) < .3 && !thr) rv.v = 0;
      rv.a += steer * 1.9 * dt * (rv.v >= 0 ? 1 : -1) * Math.min(1, Math.abs(rv.v) / 6 + .25);
      const nx = rv.x + Math.cos(rv.a) * rv.v * dt, ny = rv.y + Math.sin(rv.a) * rv.v * dt;
      const hit = [[5, 0], [-5, 0], [0, 4], [0, -4], [4, 3], [4, -3], [-4, 3], [-4, -3]].some(([ox, oy]) => roverBlock(nx + ox, ny + oy));
      if (hit) {
        if (Math.abs(rv.v) > 9) { const dmg = (Math.abs(rv.v) - 9) * 1.3; me.hull = Math.max(0, me.hull - dmg); r.shake = 4; sfx.boom(.4); if (me.hull <= 0) note('le rover est en panne : f pour réparer', P.bad); }
        rv.v *= -.25;
      } else { rv.x = nx; rv.y = ny; }
      me.x = rv.x; me.y = rv.y;
      sfx.hum(Math.abs(rv.v) > .5 ? .25 + Math.abs(rv.v) / 60 : 0, 45 + Math.abs(rv.v) * 2.2);
      if (me.bat <= 0 && thr && Math.random() < dt) note('batterie à plat : déploie les panneaux', P.bad);
    }
    // what e / space / f do
    const K2 = K, site = nearSite();
    r.site = site;
    if (K2.hit('KeyE')) {
      if (me.foot && dist(me.x, me.y, rv.x, rv.y) < 14) { me.foot = false; sfx.pick(); note('dans le rover'); }
      else if (me.foot && atMav()) board();
      else if (me.foot && site && !r.looted[site.i]) r.task = { t: 0, dur: 1.6, label: 'fouiller', fn: () => loot(site) };
      else if (!me.foot && Math.abs(rv.v) < 3) { me.foot = true; rv.v = 0; me.x = rv.x + Math.cos(rv.a + 1.57) * 10; me.y = rv.y + Math.sin(rv.a + 1.57) * 10; sfx.hiss(); }
      else sfx.nope();
    }
    if (K2.hit('Space') && !me.foot) {
      if (Math.abs(rv.v) > 2) note('arrête-toi pour déployer les panneaux', P.warn);
      else { rv.panels = !rv.panels; rv.v = 0; sfx.whoosh(); }
    }
    if (K2.hit('KeyF')) {
      if (!me.kits) { note('pas de kit de réparation', P.warn); sfx.nope(); }
      else if (me.hull >= 100) note('le rover est intact');
      else if (me.foot && dist(me.x, me.y, rv.x, rv.y) > 16) note('approche-toi du rover');
      else r.task = { t: 0, dur: 2.2, label: 'réparer', fn: () => { me.kits--; me.hull = Math.min(100, me.hull + 50); sfx.build(); note('rover réparé', P.good); } };
    }
    me.prog = progress(...mePos());
    // the fog lifts around me
    const fx = mePos()[0] / TW, fy = mePos()[1] / TW, rad = (me.foot ? 7 : 11) * (1 - storm * .5) + 1;
    const f = r.fogG; f.globalCompositeOperation = 'destination-out'; f.beginPath(); f.arc(fx, fy, rad, 0, 7); f.fill(); f.globalCompositeOperation = 'source-over';
  }
  const atMav = () => dist(run.me.x / TW, run.me.y / TW, ...MAV) < 3;
  function nearSite() {
    const [x, y] = mePos();
    let best = null, bd = run.me.foot ? 12 : 40;
    for (const s of run.L.sites) { const d = dist(x, y, s.x * TW + 4, s.y * TW + 4); if (d < bd && !run.looted[s.i]) { bd = d; best = s; } }
    return best;
  }
  function loot(site) {
    const r = run;
    if (r.host) { if (r.looted[site.i]) { note('déjà fouillé', P.dim); return; } r.looted[site.i] = r.meId; r.send({ t: 'lt', i: site.i, by: r.meId }); gain(site); }
    else r.send({ t: 'lr', i: site.i });
  }
  function gain(site) {
    const me = run.me, got = [];
    for (const l of site.loot) {
      if (l === 'food') { me.food += 1.3; got.push('rations'); }
      if (l === 'o2') { me.air = 100; me.suit = 100; me.hp = Math.min(100, me.hp + 30); got.push('oxygène'); }
      if (l === 'kit') { me.kits++; got.push('kit de réparation'); }
      if (l === 'cell') { me.cap += 35; me.bat += 35; got.push('batterie +35'); }
      if (l === 'panel') { me.sun += .35; got.push('panneau solaire'); }
      if (l === 'radio') { me.radio = true; got.push('radio : tempêtes et caches sur la carte'); }
    }
    run.score += 1;
    note((site.kind === 'pathfinder' ? 'pathfinder ! ' : site.kind === 'wreck' ? 'le rover 2 : ' : 'caisse : ') + got.join(', '), P.good);
    sfx.good();
  }
  function board() {
    const r = run, me = r.me;
    me.st = 'mav'; me.doneT = r.t; me.prog = 1;
    sfx.win(); note('à bord du mav !', P.gold);
  }
  function note(s, c = P.txt) { if (run.notes.at(-1)?.s === s) { run.notes.at(-1).t = 0; return; } run.notes.push({ s, c, t: 0 }); if (run.notes.length > 3) run.notes.shift(); }

  // ---------- network ----------
  function netRecv(id, m) {
    const r = run;
    if (m.t === 'p') {
      let o = r.others.get(id);
      const h = r.humans.find((h) => h.id === id);
      if (!o) { o = { name: h?.name ?? '?', color: h?.color ?? 0x4a8fe0, x: m.x, y: m.y, rx: m.rx, ry: m.ry }; r.others.set(id, o); }
      Object.assign(o, { tx: m.x, ty: m.y, trx: m.rx, try: m.ry, a: m.a, foot: m.f, panels: m.pn, st: m.st, doneT: m.dt, prog: m.pr, seen: r.t });
    } else if (m.t === 'lr' && r.host) {
      if (!r.looted[m.i]) { r.looted[m.i] = id; r.send({ t: 'lt', i: m.i, by: id }); }
    } else if (m.t === 'lt') {
      r.looted[m.i] = m.by;
      if (m.by === r.meId) gain(r.L.sites[m.i]);
      else { const o = r.others.get(m.by); if (o) note(`${o.name} a fouillé une caisse`, P.dim); }
    } else if (m.t === 'ls' && id === r.hostId) {
      for (const k in m.L) if (!r.looted[k]) { r.looted[k] = m.L[k]; }
    }
  }
  function netStep(dt) {
    const r = run, me = r.me;
    r.sendT -= dt;
    if (r.sendT > 0) return;
    r.sendT = .12;
    r.send({ t: 'p', x: Math.round(me.x), y: Math.round(me.y), rx: Math.round(me.rv.x), ry: Math.round(me.rv.y), a: Math.round(me.rv.a * 100) / 100, f: me.foot ? 1 : 0, pn: me.rv.panels ? 1 : 0, st: me.st, dt: Math.round(me.doneT), pr: Math.round(me.prog * 1000) / 1000 });
    if (r.host && (r.lsT = (r.lsT || 0) + 1) % 16 === 0) r.send({ t: 'ls', L: r.looted });
  }

  // ---------- the run ----------
  function everyone() {
    const r = run, me = r.me;
    return r.humans.map((h) => h.id === r.meId ? { id: h.id, name: 'toi', color: h.color, st: me.st, doneT: me.doneT, prog: me.prog, me: true }
      : { id: h.id, name: h.name, color: h.color, ...(r.others.get(h.id) || { st: 'go', prog: 0 }) });
  }
  const rank = (L) => [...L].sort((a, b) => {
    const k = (p) => p.st === 'mav' ? 0 : p.st === 'dead' ? 2 : 1;
    return k(a) - k(b) || (a.st === 'mav' ? a.doneT - b.doneT : b.prog - a.prog) || String(a.id).localeCompare(String(b.id));
  });
  function step(dt, keys) {
    const r = run;
    r.K.frame(keys);
    r.gui.clicks();
    r.shake = Math.max(0, r.shake - dt * 16);
    for (const n of r.notes) n.t += dt;
    r.notes = r.notes.filter((n) => n.t < 5);
    if (r.K.hit('KeyM')) { r.bigMap = !r.bigMap; sfx.click(); }
    if (r.phase === 'count') {
      r.count -= dt;
      if (Math.ceil(r.count) !== Math.ceil(r.count + dt)) sfx.beep(r.count <= 0);
      if (r.count <= 0) { r.phase = 'play'; note('cap au nord-est : le mav t\'attend', P.gold); }
      return;
    }
    if (r.phase === 'end') { r.endT += dt; sfx.hum(0); if (r.endT > 7 && !r.ended) finish(); return; }
    r.t += dt;
    const sol = Math.floor(r.t / SOL) + 1;
    if (sol !== r.sol) { r.sol = sol; if (sol > 1) note(`sol ${sol} · le mav décolle au sol ${r.mode.sols + 1}`, sol >= r.mode.sols ? P.warn : P.txt); }
    const before = r.nightNow; r.nightNow = SUN(r.t) <= 0;
    if (r.nightNow && !before) note('la nuit tombe : le chauffage tire sur la batterie', '#b8c4ff');
    stepMe(dt);
    for (const o of r.others.values()) {
      const k = Math.min(1, dt * 10);
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.rx += (o.trx - o.rx) * k; o.ry += (o.try - o.ry) * k;
    }
    for (const p of r.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    r.parts = r.parts.filter((p) => p.life < p.max);
    if (!r.me.foot && Math.abs(r.me.rv.v) > 8 && Math.random() < dt * 20) { const rv = r.me.rv; r.parts.push({ x: rv.x - Math.cos(rv.a) * 7, y: rv.y - Math.sin(rv.a) * 7, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, life: 0, max: .8 }); }
    netStep(dt);
    // the end: everyone done, or the MAV gone
    const all = everyone(), deadline = r.mode.sols * SOL;
    if (r.t >= deadline - 30 && !r.warned) { r.warned = true; note('le mav décolle dans 30 secondes !', P.bad); sfx.alarm(); }
    if (all.every((p) => p.st !== 'go') || r.t >= deadline) {
      if (r.me.st === 'go') { r.me.st = 'late'; r.me.doneT = r.t; }
      r.phase = 'end'; r.endT = 0; r.final = rank(everyone());
      if (r.me.st === 'mav') sfx.win(); else sfx.lose();
    }
  }
  function finish() {
    const r = run;
    r.ended = true;
    const L = r.final, i = L.findIndex((p) => p.me), me = r.me, of = L.length;
    let place = i + 1;
    if (me.st !== 'mav') place = Math.max(place, me.st === 'dead' ? 4 : 3);
    const pct = Math.round(me.prog * 100);
    const text = me.st === 'mav' ? `à bord du mav en ${fmtT(me.doneT)}${of > 1 ? ` · ${place}${place === 1 ? 'er' : 'e'} sur ${of}` : ''}`
      : me.st === 'dead' ? `mort en route, à ${pct} % du chemin` : `le mav est parti sans toi, à ${pct} % du chemin`;
    const f = onEnd;
    api.stop();
    f({ place, of, time: me.doneT, value: me.st === 'mav' ? me.doneT : null, text });
  }
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- drawing ----------
  function drawRover(b, x, y, a, color, panels, t) {
    b.save(); b.translate(Math.round(x), Math.round(y)); b.rotate(Math.round(a / (Math.PI / 16)) * (Math.PI / 16));
    if (panels) { b.fillStyle = '#26384f'; b.fillRect(-6, -13, 12, 7); b.fillRect(-6, 6, 12, 7); b.fillStyle = '#3f6a94'; for (let i = 0; i < 3; i++) { b.fillRect(-5 + i * 4, -12, 3, 5); b.fillRect(-5 + i * 4, 7, 3, 5); } }
    b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(-7, -4, 15, 10);
    b.fillStyle = '#2a2224'; for (const wx of [-6, -1, 4]) { b.fillRect(wx, -6, 3, 2); b.fillRect(wx, 4, 3, 2); }
    b.fillStyle = '#e8e2d6'; b.fillRect(-7, -4, 14, 8);
    b.fillStyle = '#b9b0a2'; b.fillRect(-7, 2, 14, 2);
    b.fillStyle = hexOf(color); b.fillRect(-7, -1, 9, 2);
    b.fillStyle = '#2a4a6a'; b.fillRect(3, -3, 3, 6); b.fillStyle = '#7fb4e0'; b.fillRect(4, -2, 1, 2);
    b.fillStyle = Math.sin(t * 6) > 0 ? '#ff4d4d' : '#6a1a1a'; b.fillRect(-7, -4, 1, 1);
    b.restore();
  }
  function drawWalker(b, x, y, color, face, t, walk) {
    x = Math.round(x); y = Math.round(y);
    const bob = walk ? Math.floor(t * 8) % 2 : 0;
    b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(x - 2, y + 1, 5, 1);
    b.fillStyle = '#d8d2c8'; b.fillRect(x - 2, y - 1, 1, 2 - bob); b.fillRect(x + 1, y - 1, 1, 1 + bob);
    b.fillStyle = '#f2ede4'; b.fillRect(x - 2, y - 5, 4, 4);
    b.fillStyle = hexOf(color); b.fillRect(x - 2, y - 3, 4, 1);
    b.fillStyle = '#f2ede4'; b.fillRect(x - 1, y - 8, 3, 3);
    b.fillStyle = '#e3a340'; b.fillRect(face > 0 ? x : x - 1, y - 7, 2, 1);
  }
  function drawSite(b, s, x, y, t, looted) {
    if (s.kind === 'cache') {
      b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(x - 3, y + 1, 8, 2);
      b.fillStyle = looted ? '#7a6a5a' : '#e8e2d6'; b.fillRect(x - 3, y - 4, 7, 5);
      b.fillStyle = looted ? '#5a4a3a' : '#ff9a3c'; b.fillRect(x - 3, y - 2, 7, 1);
      if (!looted) { b.fillStyle = '#6a6a6a'; b.fillRect(x + 4, y - 11, 1, 8); b.fillStyle = Math.sin(t * 4 + s.i) > 0 ? '#ff4d4d' : '#ffcc4a'; b.fillRect(x + 5, y - 11, 3, 2); }
    } else if (s.kind === 'pathfinder') {
      b.fillStyle = '#c9c0b0'; for (let k = 0; k < 3; k++) { const a = k * 2.09 + .3; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); b.lineTo(x + Math.cos(a + .8) * 7, y + Math.sin(a + .8) * 7); b.fill(); }
      b.fillStyle = '#5fa8ff'; b.fillRect(x - 1, y - 1, 3, 3);
      b.fillStyle = '#e8e2d6'; b.fillRect(x - 1, y - 5, 1, 4); b.fillRect(x - 2, y - 6, 3, 1);
      if (!looted && Math.sin(t * 3) > 0) { b.fillStyle = '#ffcc4a'; b.fillRect(x - 1, y - 7, 1, 1); }
    } else if (s.kind === 'wreck') {
      b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(x - 6, y - 2, 14, 8);
      b.fillStyle = '#9a9288'; b.fillRect(x - 7, y - 4, 13, 7); b.fillStyle = '#6a625a'; b.fillRect(x - 7, y + 1, 13, 2);
      b.fillStyle = '#2a2224'; b.fillRect(x - 6, y - 6, 3, 2); b.fillRect(x + 2, y + 3, 3, 2);
      if (!looted) { b.fillStyle = '#8ef08a'; b.fillRect(x - 2, y - 2, 3, 2); }
    }
  }
  function drawHab(b, x, y) {
    b.fillStyle = 'rgba(0,0,0,.3)'; b.beginPath(); b.ellipse(x + 2, y + 3, 15, 11, 0, 0, 7); b.fill();
    b.fillStyle = '#b9b0a2'; b.beginPath(); b.ellipse(x, y, 15, 11, 0, 0, 7); b.fill();
    b.fillStyle = '#e8e2d6'; b.beginPath(); b.ellipse(x - 1, y - 1, 13, 9, 0, 0, 7); b.fill();
    b.fillStyle = '#cfc6b8'; for (let i = -2; i <= 2; i++) b.fillRect(x + i * 5, y - 8, 1, 16);
    b.fillStyle = '#26384f'; for (let i = 0; i < 4; i++) b.fillRect(x - 26 + (i % 2) * 7, y - 14 + Math.floor(i / 2) * 7, 6, 5);
    b.fillStyle = '#9aa4ad'; b.fillRect(x + 13, y - 2, 6, 4);
  }
  function drawMav(b, x, y, t) {
    b.fillStyle = 'rgba(0,0,0,.35)'; b.beginPath(); b.ellipse(x + 3, y + 4, 9, 6, 0, 0, 7); b.fill();
    b.fillStyle = '#6a6a6a'; for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { b.fillRect(x + dx - 1, y + dy - 1, 3, 3); }
    b.strokeStyle = '#8a8a8a'; b.lineWidth = 1; b.beginPath(); b.moveTo(x - 7, y - 7); b.lineTo(x + 7, y + 7); b.moveTo(x + 7, y - 7); b.lineTo(x - 7, y + 7); b.stroke();
    b.fillStyle = '#e8e2d6'; b.beginPath(); b.arc(x, y, 7, 0, 7); b.fill();
    b.fillStyle = '#cfc6b8'; b.beginPath(); b.arc(x + 1, y + 1, 5, 0, 7); b.fill();
    b.fillStyle = '#d84a3a'; b.beginPath(); b.arc(x, y, 3, 0, 7); b.fill();
    b.fillStyle = Math.sin(t * 5) > 0 ? '#fff' : '#ff4d4d'; b.fillRect(x, y - 1, 1, 1);
  }
  function render() {
    const r = run, sc = r.scr, b = sc.b, t = r.clock, me = r.me;
    const [px, py] = mePos();
    // the camera: a little ahead of the rover
    const la = me.foot ? 0 : me.rv.v * .9;
    r.cam.x += (px + Math.cos(me.rv.a) * la - r.cam.x) * .12; r.cam.y += (py + Math.sin(me.rv.a) * la - r.cam.y) * .12;
    const cx = Math.round(clamp(r.cam.x - W / 2, 0, N * TW - W) + (r.shake ? (Math.random() - .5) * r.shake : 0)), cy = Math.round(clamp(r.cam.y - H / 2, 0, N * TW - H));
    b.drawImage(r.land, cx, cy, W, H, 0, 0, W, H);
    b.save(); b.translate(-cx, -cy);
    drawHab(b, HAB[0] * TW, HAB[1] * TW);
    drawMav(b, MAV[0] * TW, MAV[1] * TW, t);
    for (const s of r.L.sites) if (Math.abs(s.x * TW - px) < W && Math.abs(s.y * TW - py) < H) drawSite(b, s, s.x * TW + 4, s.y * TW + 4, t, !!r.looted[s.i]);
    b.fillStyle = 'rgba(230,160,110,.5)'; for (const p of r.parts) b.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    for (const o of r.others.values()) {
      if (o.st === 'mav') continue;
      drawRover(b, o.rx, o.ry, o.a ?? 0, o.color, o.panels, t);
      if (o.foot) drawWalker(b, o.x, o.y, o.color, 1, t, true);
    }
    if (me.st !== 'mav') { drawRover(b, me.rv.x, me.rv.y, me.rv.a, me.color, me.rv.panels, t); if (me.foot) drawWalker(b, me.x, me.y, me.color, me.face, t, me.walk); }
    // storms
    for (const s of r.L.storms) {
      const p = stormAt(s, r.t);
      if (!p || p.r <= 0) continue;
      const sx = p.x * TW, sy = p.y * TW, rr = p.r * TW;
      if (sx + rr < cx || sx - rr > cx + W || sy + rr < cy || sy - rr > cy + H) continue;
      const gr = b.createRadialGradient(sx, sy, rr * .2, sx, sy, rr);
      gr.addColorStop(0, 'rgba(170,85,45,.75)'); gr.addColorStop(.7, 'rgba(190,100,55,.45)'); gr.addColorStop(1, 'rgba(200,110,60,0)');
      b.fillStyle = gr; b.beginPath(); b.arc(sx, sy, rr, 0, 7); b.fill();
      b.fillStyle = 'rgba(240,180,130,.55)';
      for (let i = 0; i < 70; i++) { const a = i * 2.4 + t * .6, d = (i * 37 % 100) / 100 * rr; b.fillRect(Math.round(sx + Math.cos(a) * d + ((t * 60 + i * 13) % 20) - 10), Math.round(sy + Math.sin(a) * d * .8), 3, 1); }
    }
    b.restore();
    // the fog of what's never been seen
    b.imageSmoothingEnabled = false;
    b.drawImage(r.fog, cx / TW, cy / TW, W / TW, H / TW, 0, 0, W, H);
    // the dark of the night, a pool of light around me
    const sun = SUN(r.t), dark = (1 - Math.min(1, sun * 3)) * .72 + r.storm * .35;
    if (dark > .02) {
      const sh = r.shadeG;
      sh.globalCompositeOperation = 'source-over'; sh.clearRect(0, 0, W, H);
      sh.fillStyle = `rgba(14,6,34,${dark})`; sh.fillRect(0, 0, W, H);
      sh.globalCompositeOperation = 'destination-out';
      const lx = px - cx, ly = py - cy, lr = me.foot ? 26 : 44;
      const gr = sh.createRadialGradient(lx, ly, 4, lx, ly, lr); gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sh.fillStyle = gr; sh.beginPath(); sh.arc(lx, ly, lr, 0, 7); sh.fill();
      if (!me.foot) { const a = me.rv.a; sh.fillStyle = 'rgba(0,0,0,.7)'; sh.beginPath(); sh.moveTo(lx, ly); sh.arc(lx, ly, 90, a - .38, a + .38); sh.fill(); }
      b.drawImage(r.shade, 0, 0);
    }
    if (r.storm > 0) { b.fillStyle = `rgba(180,90,45,${r.storm * .5})`; b.fillRect(0, 0, W, H); }
    // ---- crisp layer ----
    sc.blit();
    const g = sc.g;
    r.gui.begin();
    for (const o of r.others.values()) if (o.st !== 'mav') txt(g, o.name, (o.foot ? o.x : o.rx) - cx, (o.foot ? o.y : o.ry) - cy - 12, 5.5, hexOf(o.color), 'center');
    hud(g, cx, cy, t);
    if (r.bigMap) bigMap(g);
    if (r.phase === 'count') {
      box(g, W / 2 - 115, 58, 230, 86, P.ui, P.line, 6);
      title(g, 'survie sur mars', W / 2, 76, 15);
      txt(g, `rejoins le mav avant le sol ${r.mode.sols + 1} · ${r.humans.length > 1 ? r.humans.length + ' rovers' : 'seul au monde'}`, W / 2, 94, 7, P.txt, 'center');
      txt(g, 'zqsd conduire · e sortir / monter / fouiller', W / 2, 106, 6, P.dim, 'center');
      txt(g, 'espace panneaux solaires · f réparer · m carte', W / 2, 115, 6, P.dim, 'center');
      title(g, String(Math.max(1, Math.ceil(r.count))), W / 2, 132, 12, P.txt);
    }
    if (r.phase === 'end') endCard(g);
    else if (me.st !== 'go') { box(g, W / 2 - 90, 70, 180, 30, P.ui, P.line, 5); txt(g, me.st === 'mav' ? 'à bord du mav · on attend les autres' : 'tu es tombé… les autres continuent', W / 2, 85, 7, me.st === 'mav' ? P.gold : P.bad, 'center'); }
  }
  function hud(g, cx, cy, t) {
    const r = run, me = r.me;
    box(g, 0, 0, W, 15, 'rgba(18,10,16,.86)', null, 0);
    const sun = SUN(r.t), sol = Math.floor(r.t / SOL) + 1, left = r.mode.sols * SOL - r.t;
    g.fillStyle = sun > 0 ? P.gold : '#b8c4ff'; g.beginPath(); g.arc(8, 7.5, 3.5, 0, 7); g.fill();
    txt(g, `sol ${sol}`, 15, 5.5, 7, P.txt); txt(g, `mav : ${fmtT(Math.max(0, left))}`, 15, 11.5, 5.5, left < 60 ? P.bad : P.dim);
    const it = (x, lab, v, frac, col) => { txt(g, lab, x, 4.8, 5, P.dim); bar(g, x, 9.5, 34, 2.4, frac, col); txt(g, v, x + 36, 10.5, 5.5, col); };
    it(62, 'batterie', `${Math.round(me.bat)}`, me.bat / me.cap, me.bat < 20 ? P.bad : P.good);
    if (me.foot) it(118, 'combinaison', `${Math.round(me.suit)}`, me.suit / 100, me.suit < 30 ? P.bad : '#8fd8ff');
    else it(118, 'air du rover', `${Math.round(me.air)}`, me.air / 100, me.air < 30 ? P.bad : '#8fd8ff');
    it(174, 'vivres', `${me.food.toFixed(1).replace('.', ',')} j`, Math.min(1, me.food / 4), me.food < .5 ? P.bad : '#e8cf8a');
    it(236, 'coque', `${Math.round(me.hull)}`, me.hull / 100, me.hull < 30 ? P.bad : P.metal);
    it(292, 'santé', `${Math.round(me.hp)}`, me.hp / 100, me.hp < 30 ? P.bad : '#ff9aa0');
    txt(g, `kits ${me.kits}`, W - 4, 5, 5.5, P.txt, 'right');
    txt(g, `${Math.round(me.prog * 100)} %`, W - 4, 11, 5.5, P.gold, 'right');
    // notes
    r.notes.forEach((n, i) => { g.globalAlpha = Math.min(1, (5 - n.t) * 2); box(g, W / 2 - 105, 18 + i * 11, 210, 10, 'rgba(18,10,16,.8)', null, 3); txt(g, n.s, W / 2, 23.5 + i * 11, 6.3, n.c, 'center'); g.globalAlpha = 1; });
    // the arrow to the MAV, at the edge of the view
    const [px, py] = mePos(), ang = Math.atan2(MAV[1] * TW - py, MAV[0] * TW - px), dm = dist(px, py, MAV[0] * TW, MAV[1] * TW);
    if (dm > 150) {
      const ax = W / 2 + Math.cos(ang) * 88, ay = H / 2 + 6 + Math.sin(ang) * 88 * .55;
      g.save(); g.translate(ax, ay); g.rotate(ang); g.fillStyle = P.gold; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.fill(); g.restore();
      txt(g, `mav ${Math.round(dm / TW)}`, ax, ay + 8, 5, P.gold, 'center');
    }
    // what's around
    let hint = null;
    if (r.task) { bar(g, px - cx - 12, py - cy - 20, 24, 3, r.task.t / r.task.dur, P.gold); hint = r.task.label + '…'; }
    else if (me.st === 'go' && r.phase === 'play') {
      if (me.foot && atMav()) hint = 'e : monter dans le mav !';
      else if (me.foot && dist(me.x, me.y, me.rv.x, me.rv.y) < 14) hint = 'e : remonter dans le rover';
      else if (me.foot && r.site) hint = `e : fouiller ${r.site.kind === 'pathfinder' ? 'pathfinder' : r.site.kind === 'wreck' ? 'le rover 2' : 'la caisse'}`;
      else if (!me.foot && r.site) hint = 'une caisse tout près : e pour sortir à pied';
      else if (!me.foot && dist(me.rv.x / TW, me.rv.y / TW, ...MAV) < 8) hint = 'le mav ! e pour sortir, puis e à la porte';
      else if (!me.foot && me.bat < 25 && !me.rv.panels && sun > 0) hint = 'espace : déployer les panneaux solaires';
      else if (!me.foot && me.rv.panels) hint = `panneaux déployés · ${sun > 0 ? '+' + (2.5 * sun * me.sun * (1 - r.storm * .92)).toFixed(1) + ' /s' : 'la nuit, rien'}`;
      else if (me.foot) hint = 'à pied : surveille l\'oxygène de la combinaison';
    }
    if (hint) { g.font = "700 6.5px 'Rubik', sans-serif"; const w = g.measureText(hint).width + 10; box(g, W / 2 - w / 2, H - 14, w, 11, 'rgba(18,10,16,.85)', hint.startsWith('e :') ? P.gold : null, 3); txt(g, hint, W / 2, H - 8.3, 6.5, hint.startsWith('e :') ? P.gold : P.txt, 'center'); }
    miniMap(g, W - 58, 18, 54);
  }
  function mapLayer(g, x, y, s, alpha = 1) {
    const r = run;
    g.save(); g.globalAlpha = alpha;
    g.imageSmoothingEnabled = true; g.drawImage(r.land, x, y, s, s);
    g.imageSmoothingEnabled = false; g.drawImage(r.fog, x, y, s, s);
    g.globalAlpha = 1;
    const k = s / N, dot = (tx, ty, c, d = 2) => { g.fillStyle = c; g.fillRect(x + tx * k - d / 2, y + ty * k - d / 2, d, d); };
    dot(...HAB, '#fff', 3); dot(...MAV, P.gold, 3.5);
    for (const st of r.L.sites) {
      const seen = r.me.radio || r.fogSeen(st.x, st.y);
      if (seen && !r.looted[st.i]) dot(st.x, st.y, st.kind === 'pathfinder' ? '#5fa8ff' : P.orange, 2.2);
    }
    if (r.me.radio) for (const st of r.L.storms) { const p = stormAt(st, r.t); if (p && p.r > 0) { g.strokeStyle = 'rgba(255,170,90,.8)'; g.lineWidth = .7; g.beginPath(); g.arc(x + p.x * k, y + p.y * k, p.r * k, 0, 7); g.stroke(); } }
    for (const o of r.others.values()) dot((o.foot ? o.x : o.rx) / TW, (o.foot ? o.y : o.ry) / TW, hexOf(o.color), 2.5);
    const [px, py] = mePos(); dot(px / TW, py / TW, Math.sin(r.clock * 8) > 0 ? '#fff' : hexOf(r.me.color), 3);
    g.restore();
  }
  function miniMap(g, x, y, s) {
    box(g, x - 2, y - 2, s + 4, s + 4, 'rgba(18,10,16,.85)', 'rgba(243,195,139,.5)', 2);
    mapLayer(g, x, y, s, .9);
    txt(g, 'm : carte', x + s / 2, y + s + 6, 5, P.dim, 'center');
  }
  function bigMap(g) {
    const s = 190, x = W / 2 - s / 2, y = 22;
    box(g, x - 4, y - 4, s + 8, s + 8, 'rgba(18,10,16,.95)', P.line, 4);
    mapLayer(g, x, y, s);
    txt(g, 'hab', x + HAB[0] / N * s + 6, y + HAB[1] / N * s, 6, '#fff', 'left');
    txt(g, 'mav', x + MAV[0] / N * s - 6, y + MAV[1] / N * s + 6, 6, P.gold, 'right');
    txt(g, run.me.radio ? 'radio : caches et tempêtes visibles' : 'la radio de pathfinder montrerait les tempêtes', W / 2, y + s + 1, 5.5, P.dim, 'center');
  }
  function endCard(g) {
    const r = run, L = r.final, me = r.me;
    box(g, W / 2 - 125, 36, 250, 150, 'rgba(18,10,16,.94)', P.line, 6);
    title(g, me.st === 'mav' ? 'décollage !' : me.st === 'dead' ? 'perdu sur mars' : 'le mav est parti…', W / 2, 56, 16, me.st === 'mav' ? P.gold : P.bad);
    L.slice(0, 7).forEach((p, i) => {
      const y = 80 + i * 13;
      g.fillStyle = hexOf(p.color ?? 0xc8581a); g.fillRect(W / 2 - 100, y - 3, 5, 5);
      txt(g, `${i + 1}. ${p.name}`, W / 2 - 90, y, 7, p.me ? P.gold : P.txt);
      txt(g, p.st === 'mav' ? `mav en ${fmtT(p.doneT)}` : p.st === 'dead' ? `mort · ${Math.round(p.prog * 100)} %` : `bloqué · ${Math.round(p.prog * 100)} %`, W / 2 + 100, y, 7, p.st === 'mav' ? P.good : P.dim, 'right');
    });
  }

  // ---------- the module ----------
  const api = {
    modes: MODES,
    keys: [['z q s d', 'conduire / marcher'], ['e', 'sortir, monter, fouiller'], ['espace', 'panneaux solaires'], ['f', 'réparer le rover'], ['m', 'carte']],
    start({ seed = 1, opts = {}, humans = [], hostId, meId, send } = {}) {
      if (run) api.stop();
      sfx.init();
      const mode = MODES.find((m) => m.id === opts.mode) || MODES[0];
      if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
      const L = makeLand(seed);
      const scr = createScreen('survie', '#0e0810');
      scr.setRect(rect);
      const [fog, fogG] = makeCanvas(N, N); fogG.fillStyle = '#140a10'; fogG.fillRect(0, 0, N, N);
      const [shade, shadeG] = makeCanvas(W, H);
      const i = Math.max(0, humans.findIndex((h) => h.id === meId));
      run = {
        scr, K: createKeys(), gui: null, L, land: paintLand(L, seed), fog, fogG, shade, shadeG, mode,
        humans, hostId, meId, host: hostId === meId, send: send ?? (() => {}), me: freshMe(mode, i, humans[i]?.color ?? 0xc8581a),
        others: new Map(), looted: {}, parts: [], notes: [], phase: 'count', count: COUNT, t: 0, clock: 0, sol: 1, cam: { x: 0, y: 0 }, shake: 0, storm: 0, sendT: 0, score: 0, ended: false,
        fogSeen: (x, y) => fogG.getImageData(x, y, 1, 1).data[3] < 128,
      };
      run.gui = createGui(scr, sfx);
      humans.forEach((h, j) => { if (h.id !== meId) { const o = freshMe(mode, j, h.color); run.others.set(h.id, { name: h.name, color: h.color ?? 0x4a8fe0, x: o.x, y: o.y, tx: o.x, ty: o.y, rx: o.rv.x, ry: o.rv.y, trx: o.rv.x, try: o.rv.y, a: o.rv.a, st: 'go', prog: 0 }); } });
      run.cam.x = run.me.rv.x; run.cam.y = run.me.rv.y;
      fogG.globalCompositeOperation = 'destination-out'; fogG.beginPath(); fogG.arc(HAB[0], HAB[1], 16, 0, 7); fogG.fill(); fogG.beginPath(); fogG.arc(MAV[0], MAV[1], 6, 0, 7); fogG.fill(); fogG.globalCompositeOperation = 'source-over';
      scr.cv.addEventListener('mousedown', () => sfx.init());
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
      sfx.hum(0);
      run.scr.destroy(); run.K.destroy();
      run = null;
      sfx.pause();
    },
    // r: back on your feet next to the rover (stuck on foot somewhere)
    respawn() { if (run && run.phase === 'play' && run.me.foot) { const me = run.me; me.x = me.rv.x; me.y = me.rv.y + 10; } },
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
    _dbg: { get run() { return run; }, MAV, HAB, TW, N },
  };
  return api;
}
export { makeLand, paintLand };
