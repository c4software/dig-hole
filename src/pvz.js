// pvz.js, « potager lunaire »: a lane defence on the moon. Stars fall, moon plants turn them into peas, rocks and
// bombs; space zombies walk in by waves. Together: a wider field, each gardener their own lanes and stars.
// Face à face: one side plants, the other spends moon dust to send the zombies (solo, you lead the zombies).
// The host runs the game and sends it to the others ten times a second; the others send what they click.
import { text, canvas, hexOf } from './nes-art.js';
import { CW, LH, FX, COLS, FY, W, STAR, MOON, drawPlant, drawZombie, buildField, drawRover, drawPea } from './pvz-art.js';
import { createSynth } from './lune-sfx.js';

const COUNT = 2.5, SEND = .1, STAR_V = 25, PEA_V = 175, VS_DUR = 240, WAVES = 12, FLAGS = new Set([6, 12]);
const PLANTS = {
  lunelle: { name: 'lunelle', cost: 50, cd: 7.5, hp: 300 },
  pois: { name: 'pois laser', cost: 100, cd: 7.5, hp: 300, rate: 1.45 },
  roche: { name: 'roche', cost: 50, cd: 30, hp: 4000 },
  mine: { name: 'patate-mine', cost: 25, cd: 25, hp: 300, arm: 11 },
  givre: { name: 'pois givré', cost: 175, cd: 7.5, hp: 300, rate: 1.45 },
  gobe: { name: 'gobe-lune', cost: 150, cd: 7.5, hp: 300, chew: 20 },
  bombe: { name: 'comète-cerise', cost: 150, cd: 40, hp: 9999, fuse: .9 },
  double: { name: 'double pois', cost: 200, cd: 7.5, hp: 300, rate: 1.45 },
  triple: { name: 'tripois', cost: 325, cd: 7.5, hp: 300, rate: 1.45 },
};
const PK = Object.keys(PLANTS);
const ZOMB = {
  base: { name: 'zombi', hp: 200, arm: 0, v: 6.5, pts: 10, cost: 50, cd: 5, w: 1 },
  cone: { name: 'cône', hp: 200, arm: 370, v: 6.5, pts: 20, cost: 75, cd: 6, w: 2 },
  coureur: { name: 'coureur', hp: 220, arm: 0, v: 15, pts: 20, cost: 75, cd: 7, w: 2 },
  seau: { name: 'seau', hp: 200, arm: 1100, v: 6.5, pts: 40, cost: 125, cd: 10, w: 4 },
  jetpack: { name: 'jetpack', hp: 340, arm: 0, v: 16, pts: 30, cost: 100, cd: 9, w: 3 },
  geant: { name: 'géant', hp: 3000, arm: 0, v: 4.2, pts: 100, cost: 300, cd: 35, w: 8 },
  drapeau: { name: 'drapeau', hp: 200, arm: 0, v: 9, pts: 10, w: 1 },
  mini: { name: 'mini', hp: 120, arm: 0, v: 11, pts: 10, w: 1 },
};
const ZK = Object.keys(ZOMB), ZCARDS = ZK.slice(0, 6);
const MODES = [
  { id: 'survie', name: 'survie', sub: '12 vagues, deux drapeaux · à plusieurs : un champ plus large, chacun ses rangées', help: 'ramasse les étoiles, plante, tiens jusqu\'à la dernière vague' },
  { id: 'versus', name: 'face à face', sub: 'plantes contre zombies · seul, tu mènes les zombies contre un jardinier', help: 'plantes : tenir 4 minutes · zombies : entrer dans la base' },
];
const BOTN = ['radis', 'tournesol', 'bêche', 'râteau'];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const laneY = (l) => FY + l * LH + LH - 4;
const cellX = (c) => FX + c * CW + CW / 2;

function createSfx() {
  const s = createSynth({
    vol: .11, beat: .21, leadType: .5,
    lead: [76, 0, 79, 81, 79, 0, 76, 0, 74, 0, 72, 74, 76, 0, -1, -1, 72, 0, 74, 76, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, -1, -1,
      76, 0, 79, 81, 84, 0, 81, 79, 77, 0, 76, 74, 72, 0, -1, -1, 74, 0, 76, 74, 72, 0, 71, 0, 72, 0, 0, 0, -1, -1, -1, -1],
    roots: [48, 45, 41, 43, 48, 45, 41, 43], bass: [0, 7, 12, 7],
  });
  const { tone, noise, seq } = s;
  return Object.assign(s, {
    plant: () => { tone(160, 80, .1, { type: 'tri', vol: .7 }); noise(.12, { vol: .2, f: 500 }); },
    shoot: () => tone(520, 900, .05, { type: .25, vol: .1 }),
    hit: () => noise(.05, { vol: .12, f: 1800 }),
    star: () => seq([84, 91], .05, { type: .125, vol: .22 }),
    boom: () => { noise(.7, { vol: .6, f: 180, q: .5 }); tone(120, 30, .5, { type: .5, vol: .4 }); },
    chomp: () => { tone(300, 80, .15, { type: .5, vol: .35 }); noise(.1, { vol: .3, f: 900 }); },
    munch: () => noise(.06, { vol: .1, f: 700 }),
    rover: () => { tone(80, 240, .9, { type: .125, vol: .25, slide: 'lin' }); noise(.9, { vol: .15, f: 300 }); },
    groan: () => tone(140 + Math.random() * 40, 90, .5, { type: 'saw', vol: .08 }),
    smash: () => { noise(.3, { vol: .5, f: 250 }); tone(90, 40, .3, { type: 'tri', vol: .7 }); },
    wave: () => seq([60, 0, 60, 0, 67], .12, { type: .5, vol: .25 }),
    flag: () => { tone(220, 440, .5, { type: 'saw', vol: .15, slide: 'lin' }); tone(440, 220, .6, { type: 'saw', vol: .15, at: s.ctx ? s.ctx.currentTime + .5 : 0, slide: 'lin' }); },
    pick: () => tone(900, 900, .04, { type: .25, vol: .18 }),
    deny: () => tone(150, 150, .1, { type: .5, vol: .2 }),
    send: () => tone(200, 120, .15, { type: .25, vol: .2 }),
    win: () => { s.music(false); seq([72, 76, 79, 84, 0, 79, 84, 88, 0, 84, 88, 91, 96], .11, { type: .5, vol: .28 }); },
    lose: () => { s.music(false); seq([67, 0, 63, 0, 60, 0, 55, 0, 48], .15, { type: .5, vol: .28 }); },
    beep: (hi) => tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .3 : .1, { type: .5, vol: .2 }),
  });
}

export function createPvz({ audio, ui } = {}) {
  const sfx = createSfx();
  let onEnd = () => {};
  let S = null, L = null, cv = null, cx = null, buf = null, bx = null, rect = null, view = null;

  // ---------- setup ----------
  function start({ seed = 1, opts = {}, humans = [], hostId, meId, send } = {}) {
    if (S) stop();
    if (!humans.length) humans = [{ id: meId ?? 'me', name: 'toi', me: true }];
    const mode = opts.mode === 'versus' ? 'versus' : 'survie';
    let s = (seed >>> 0) || 1;
    const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    // who plays what: in face à face the sides alternate, solo you lead the zombies; missing sides are bots
    const pl = humans.map((h, i) => ({ id: h.id, name: h.id === meId ? 'toi' : h.name || 'invité', color: hexOf(h.color ?? [0xc8581a, 0x39c07a, 0x4a8fe0, 0xe4183a][i % 4]),
      side: mode === 'survie' ? 'p' : (humans.length === 1 ? 'z' : i % 2 ? 'z' : 'p'), bot: false }));
    if (mode === 'versus') for (const side of ['p', 'z']) if (!pl.some((p) => p.side === side)) pl.push({ id: 'bot-' + side, name: BOTN[pl.length % 4], color: side === 'p' ? '#3ac050' : '#b04ad0', side, bot: true });
    const gard = pl.filter((p) => p.side === 'p');
    const lanes = mode === 'versus' ? 5 : [5, 6, 9, 12][Math.min(4, gard.length) - 1];
    // each gardener their own lanes, in blocks
    const own = Array.from({ length: lanes }, (_, l) => pl.indexOf(gard[Math.min(gard.length - 1, Math.floor(l * gard.length / lanes))]));
    for (const p of pl) Object.assign(p, { e: p.side === 'p' ? 150 : 50, cd: {}, score: 0, kills: 0, skyT: 4 + R() * 3, think: 1, inc: 3 });
    S = { mode, lanes, own, pl, t: 0, phase: 'count', count: COUNT, left: VS_DUR, nextId: 1, plants: [], zombies: [], peas: [], stars: [],
      rovers: Array.from({ length: lanes }, () => ({ s: 0, x: FX - 16 })), wave: { n: 0, t: 0, q: [] }, res: null, endT: 0, ev: [] };
    const me = pl.findIndex((p) => p.id === meId);
    L = { seed, R, hostId, meId, host: hostId === meId || humans.length === 1, send: send ?? (() => {}), humans, me: me < 0 ? 0 : me,
      field: buildField(lanes, seed, own.map((i) => gard.length > 1 ? pl[i].color : null)), H: FY + lanes * LH + 6,
      sel: null, hover: null, cur: { l: 0, c: 2 }, mouse: { x: -1, y: -1, in: false }, sendT: 0, parts: [], msg: null, ended: false, fx: new Map(),
      prevKeys: new Set(), groanT: 3, lastPeas: 0 };
    L.cur.l = own.indexOf(L.me) >= 0 ? own.indexOf(L.me) : 0;
    if (pl[L.me].side === 'z') L.cur.c = COLS - 1;
    cv = document.createElement('canvas');
    cv.id = 'pvz';
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:15;pointer-events:auto;image-rendering:pixelated;background:#05050e;cursor:crosshair';
    document.body.appendChild(cv);
    placeCanvas();
    cx = cv.getContext('2d');
    [buf, bx] = canvas(W, L.H);
    const pos = (e) => { const b = cv.getBoundingClientRect(); L.mouse.x = e.clientX - b.left; L.mouse.y = e.clientY - b.top; L.mouse.in = true; };
    L.listeners = [
      [cv, 'mousemove', pos],
      [cv, 'mouseleave', () => { L.mouse.in = false; }],
      [cv, 'mousedown', (e) => { pos(e); sfx.init(); e.preventDefault(); if (e.button === 2) { L.sel = null; return; } if (e.button === 0) click(); }],
      [cv, 'contextmenu', (e) => e.preventDefault()],
    ];
    for (const [el, ev, f] of L.listeners) el.addEventListener(ev, f);
    sfx.init();
    render();
  }
  function stop() {
    if (L) for (const [el, ev, f] of L.listeners || []) el.removeEventListener(ev, f);
    if (cv) { cv.remove(); cv = null; cx = null; }
    S = null; L = null;
    sfx.close();
  }
  const mine = () => S.pl[L.me];
  const cards = () => mine().side === 'z' ? ZCARDS : PK;
  const cardDef = (k) => PLANTS[k] || ZOMB[k];

  // ---------- the host's game ----------
  function ev(e) { S.ev.push(e); play(e); }
  function addStar(x, y, ty, owner = -1) { S.stars.push({ id: S.nextId++, x, y, ty, life: 10, owner }); }
  function plantAt(l, c) { return S.plants.find((p) => p.l === l && p.c === c); }
  function tryPlant(pi, k, l, c) {
    const p = S.pl[pi], d = PLANTS[k];
    if (!p || p.side !== 'p' || !d || S.phase !== 'play') return false;
    if (l < 0 || l >= S.lanes || c < 0 || c >= COLS || S.own[l] !== pi || plantAt(l, c) || p.e < d.cost || (p.cd[k] || 0) > 0) return false;
    p.e -= d.cost; p.cd[k] = d.cd;
    S.plants.push({ k, l, c, hp: d.hp, t: k === 'lunelle' ? 3 + L.R() * 3 : k === 'mine' ? d.arm : k === 'bombe' ? d.fuse : .6, owner: pi, armed: false, chew: 0, fire: 0, glow: 0 });
    ev({ e: 'plant', l, c });
    return true;
  }
  function tryDig(pi, l, c) {
    const p = plantAt(l, c);
    if (!p || S.own[l] !== pi) return false;
    S.plants.splice(S.plants.indexOf(p), 1);
    ev({ e: 'dig', l, c });
    return true;
  }
  function trySend(pi, k, l) {
    const p = S.pl[pi], d = ZOMB[k];
    if (!p || p.side !== 'z' || !ZCARDS.includes(k) || S.phase !== 'play' || l < 0 || l >= S.lanes || p.e < d.cost || (p.cd[k] || 0) > 0) return false;
    p.e -= d.cost; p.cd[k] = d.cd;
    spawnZombie(k, l, pi);
    ev({ e: 'send' });
    return true;
  }
  function tryGrab(pi, id) {
    const i = S.stars.findIndex((s) => s.id === id);
    if (i < 0 || S.pl[pi]?.side !== 'p') return false;
    S.stars.splice(i, 1);
    S.pl[pi].e += 25; S.pl[pi].score += 5;
    return true;
  }
  function spawnZombie(k, l, owner = -1, x = W + 8) {
    const d = ZOMB[k];
    S.zombies.push({ id: S.nextId++, k, l, x, hp: d.hp, arm: d.arm, slow: 0, eat: 0, hop: 0, jumped: false, thrown: false, smash: 0, flash: 0, t: L.R() * 3, owner, by: -1 });
  }
  function hurtZ(z, n, by, ice) {
    if (z.hp <= 0) return;
    if (z.arm > 0) { const a = Math.min(z.arm, n); z.arm -= a; n -= a; }
    z.hp -= n; z.flash = .08;
    if (by >= 0) z.by = by;
    if (ice) z.slow = 8;
  }
  const zScore = (z, n) => { const o = S.pl[z.owner]; if (o) o.score += n; };
  const inLane = (l, x0, x1) => S.zombies.filter((z) => z.l === l && z.hp > 0 && z.x >= x0 && z.x <= x1);

  function sim(dt) {
    S.t += dt;
    for (const p of S.pl) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
    if (S.phase === 'count') { S.count -= dt; if (S.count <= 0) { S.phase = 'play'; ev({ e: 'go' }); } return; }
    if (S.phase === 'end') { S.endT += dt; return; }
    // stars from the sky, one stream per gardener
    for (const p of S.pl) {
      if (p.side === 'z') { p.inc -= dt; if (p.inc <= 0) { p.inc = 4; p.e += 25; } continue; }
      p.skyT -= dt;
      if (p.skyT <= 0) {
        p.skyT = (S.mode === 'versus' ? 5 : 6.5) + L.R() * 2;
        const ls = S.own.map((o, l) => o === S.pl.indexOf(p) ? l : -1).filter((l) => l >= 0), l = ls[Math.floor(L.R() * ls.length)] ?? 0;
        addStar(FX + 10 + L.R() * (COLS * CW - 20), FY - 8, laneY(l) - 6 - L.R() * 12);
      }
    }
    for (const s of S.stars) { if (s.y < s.ty) s.y = Math.min(s.ty, s.y + STAR_V * dt); else s.life -= dt; }
    S.stars = S.stars.filter((s) => s.life > 0);
    for (const p of S.pl) if (p.bot) bot(p, dt);
    // plants
    for (const p of [...S.plants]) {
      const d = PLANTS[p.k], x = cellX(p.c);
      p.fire = Math.max(0, p.fire - dt); p.glow = Math.max(0, p.glow - dt);
      if (p.k === 'lunelle') { p.t -= dt; if (p.t <= 0) { p.t = 18; p.glow = 1; addStar(x + (L.R() - .5) * 10, laneY(p.l) - 26, laneY(p.l) - 8, p.owner); } }
      else if (d.rate) {
        p.t -= dt;
        const ls = p.k === 'triple' ? [p.l - 1, p.l, p.l + 1].filter((l) => l >= 0 && l < S.lanes) : [p.l];
        if (p.t <= 0 && ls.some((l) => inLane(l, x - 4, W - 4).length)) {
          p.t = d.rate; p.fire = .15;
          for (const l of ls) S.peas.push({ l, x: x + 8, k: p.k === 'givre' ? 1 : 0, o: p.owner, d: 0 });
          if (p.k === 'double') S.peas.push({ l: p.l, x: x - 6, k: 0, o: p.owner, d: .12 });
          ev({ e: 'shoot' });
        }
      } else if (p.k === 'mine') {
        if (!p.armed) { p.t -= dt; if (p.t <= 0) { p.armed = true; ev({ e: 'arm', l: p.l, c: p.c }); } }
        else if (inLane(p.l, x - 14, x + 14).some((z) => !z.hop)) { boom(p, 30, 0); }
      } else if (p.k === 'bombe') { p.t -= dt; if (p.t <= 0) boom(p, 50, 1); }
      else if (p.k === 'gobe') {
        if (p.chew > 0) p.chew -= dt;
        else {
          const z = inLane(p.l, x - 6, x + 42).filter((z) => !z.hop).sort((a, b) => a.x - b.x)[0];
          if (z) {
            if (z.k === 'geant') hurtZ(z, 400, p.owner);
            else { z.by = p.owner; z.hp = 0; z.eaten = true; }
            p.chew = d.chew; ev({ e: 'chomp', l: p.l, c: p.c });
          }
        }
      }
    }
    // peas
    for (const b of S.peas) {
      if (b.d > 0) { b.d -= dt; continue; }
      b.x += PEA_V * dt;
      const z = S.zombies.find((z) => z.l === b.l && z.hp > 0 && !z.hop && Math.abs(z.x - b.x) < 8 && z.x < W - 2);
      if (z) { hurtZ(z, 20, b.o, b.k === 1); b.dead = true; ev({ e: 'hit', x: Math.round(b.x), l: b.l, k: b.k }); }
      if (b.x > W + 8) b.dead = true;
    }
    S.peas = S.peas.filter((b) => !b.dead);
    // zombies
    for (const z of S.zombies) {
      if (z.hp <= 0) continue;
      const d = ZOMB[z.k], k = z.slow > 0 ? .5 : 1;
      z.t += dt * k; z.slow = Math.max(0, z.slow - dt); z.flash = Math.max(0, z.flash - dt);
      if (z.hop > 0) { z.hop += dt / .7; z.x -= 62 * dt; if (z.hop >= 1) z.hop = 0; continue; }
      // the giant throws its little one once hurt
      if (z.k === 'geant' && !z.thrown && z.hp < 1500 && z.x > FX + 4 * CW) { z.thrown = true; spawnZombie('mini', z.l, z.owner, FX + CW * (1.5 + L.R() * 1.5)); ev({ e: 'throw' }); }
      const p = S.plants.find((p) => p.l === z.l && z.x - cellX(p.c) < 16 && z.x - cellX(p.c) > -4 && !(p.k === 'mine' && p.armed) && p.k !== 'bombe');
      if (p) {
        if (z.k === 'jetpack' && !z.jumped) { z.jumped = true; z.hop = .001; continue; }
        if (z.k === 'geant') { z.smash += dt; if (z.smash > 1.1) { z.smash = 0; S.plants.splice(S.plants.indexOf(p), 1); ev({ e: 'smash', l: p.l, c: p.c }); zScore(z, 50); } z.eat = 1; continue; }
        z.eat = 1; p.hp -= 100 * dt * k;
        if (p.hp <= 0) { S.plants.splice(S.plants.indexOf(p), 1); ev({ e: 'gulp', l: p.l, c: p.c }); zScore(z, 50); }
        continue;
      }
      z.eat = 0; z.smash = 0;
      z.x -= (z.k === 'jetpack' && z.jumped ? 6.5 : d.v) * k * dt;
      // at the base: the rover, and after it, the door
      const r = S.rovers[z.l];
      if (z.x < FX - 4 && r.s === 0) { r.s = 1; ev({ e: 'rover', l: z.l }); zScore(z, 100); }
      if (z.x < 10 && r.s === 2) { end('z'); return; }
    }
    for (const [l, r] of S.rovers.entries()) {
      if (r.s !== 1) continue;
      r.x += 150 * dt;
      for (const z of S.zombies) if (z.l === l && z.hp > 0 && z.x < r.x + 12 && z.x > r.x - 30) { z.hp = 0; z.by = -1; z.run = true; }
      if (r.x > W + 20) r.s = 2;
    }
    for (const z of S.zombies) if (z.hp <= 0 && !z.gone) {
      z.gone = true;
      const by = S.pl[z.by];
      if (by) { by.kills++; by.score += ZOMB[z.k].pts * 10; }
      if (!z.eaten) ev({ e: 'die', x: Math.round(z.x), l: z.l, k: ZK.indexOf(z.k) });
    }
    S.zombies = S.zombies.filter((z) => !z.gone);
    if (S.mode === 'versus') { S.left -= dt; if (S.left <= 0) end('p'); }
    else waves(dt);
  }
  function boom(p, rad, lanes) {
    const x = cellX(p.c);
    for (const z of S.zombies) if (Math.abs(z.l - p.l) <= lanes && Math.abs(z.x - x) < rad) hurtZ(z, 1800, p.owner);
    S.plants.splice(S.plants.indexOf(p), 1);
    ev({ e: 'boom', l: p.l, c: p.c, big: lanes });
  }
  // survie: twelve waves, the sixth and the last behind a flag
  function waves(dt) {
    const w = S.wave;
    w.t += dt;
    for (const q of w.q) { q.at -= dt; if (q.at <= 0) { spawnZombie(q.k, q.l); q.done = true; } }
    w.q = w.q.filter((q) => !q.done);
    const idle = !w.q.length && !S.zombies.length;
    if (w.n >= WAVES) { if (idle) end('p'); return; }
    if ((w.n === 0 && S.t > 25) || (w.n > 0 && (w.t > 28 || (idle && w.t > 6)))) {
      w.n++; w.t = 0;
      const flag = FLAGS.has(w.n), f = S.lanes / 5;
      let budget = Math.round((w.n <= 3 ? w.n : 1 + (w.n - 1) * .9) * f * (flag ? 2.2 : 1));
      const kinds = ['base', 'cone', ...(w.n >= 3 ? ['coureur'] : []), ...(w.n >= 4 ? ['jetpack'] : []), ...(w.n >= 5 ? ['seau'] : []), ...(w.n >= 8 ? ['geant'] : [])];
      const list = flag ? ['drapeau'] : [];
      if (w.n === WAVES) for (let i = 0; i < Math.max(1, Math.round(f)); i++) { list.push('geant'); budget -= 8; }
      while (budget > 0) {
        const k = kinds[Math.floor(L.R() * kinds.length)], c = ZOMB[k].w;
        if (c > budget + 1) { if (L.R() < .7) continue; list.push('base'); budget--; continue; }
        list.push(k); budget -= c;
      }
      let last = -1;
      list.forEach((k, i) => {
        let l; do l = Math.floor(L.R() * S.lanes); while (l === last && S.lanes > 1);
        last = l;
        w.q.push({ k, l, at: i === 0 ? 0 : (flag ? 1 : 2) + L.R() * (flag ? 6 : 12) });
      });
      ev({ e: flag ? 'flag' : 'wave', n: w.n });
    }
  }
  function end(side) {
    if (S.phase === 'end') return;
    S.phase = 'end'; S.endT = 0;
    S.res = side;
    if (side === 'p') for (const p of S.pl) if (p.side === 'p') p.score += S.mode === 'survie' ? 1000 : 500;
    if (side === 'z') for (const p of S.pl) if (p.side === 'z') p.score += 1500;
    ev({ e: 'end', w: side });
  }

  // ---------- the bots ----------
  function bot(p, dt) {
    p.think -= dt;
    if (p.think > 0) return;
    p.think = .6 + L.R() * .5;
    const pi = S.pl.indexOf(p);
    if (p.side === 'z') {
      // spends when it can, where the defence is thinnest
      if (L.R() < .25) return;
      const ok = ZCARDS.filter((k) => p.e >= ZOMB[k].cost && !(p.cd[k] > 0));
      if (!ok.length) return;
      const k = ok.includes('geant') && L.R() < .5 ? 'geant' : ok[Math.floor(L.R() * ok.length)];
      const def = Array.from({ length: S.lanes }, (_, l) => S.plants.filter((q) => q.l === l).reduce((a, q) => a + (PLANTS[q.k].rate ? 3 : q.k === 'roche' ? 2 : 1), 0) + L.R() * 4);
      trySend(pi, k, L.R() < .6 ? def.indexOf(Math.min(...def)) : Math.floor(L.R() * S.lanes));
      return;
    }
    const mineL = S.own.map((o, l) => o === pi ? l : -1).filter((l) => l >= 0);
    for (const s of [...S.stars]) if (s.y >= s.ty && (S.mode === 'versus' || s.owner === pi || mineL.includes(Math.floor((s.ty - FY) / LH)))) tryGrab(pi, s.id);
    const free = (l, cs) => cs.find((c) => !plantAt(l, c));
    const ready = (k) => !(p.cd[k] > 0) && p.e >= PLANTS[k].cost;
    const gun = (l) => ready('triple') && l > 0 && l < S.lanes - 1 && S.own[l - 1] === pi && S.own[l + 1] === pi ? 'triple' : ready('double') ? 'double' : ready('givre') && L.R() < .5 ? 'givre' : 'pois';
    const threat = mineL.map((l) => {
      const z = inLane(l, 0, W + 20);
      return { l, z, hp: z.reduce((a, z) => a + z.hp + z.arm, 0), guns: S.plants.filter((q) => q.l === l && PLANTS[q.k].rate).reduce((a, q) => a + (q.k === 'double' ? 2 : 1), 0) };
    });
    // an emergency: something close to the base
    for (const t of threat) {
      const near = t.z.filter((z) => z.x < FX + 3.5 * CW).sort((a, b) => a.x - b.x)[0];
      if (!near) continue;
      const c = clamp(Math.floor((near.x - FX) / CW), 0, COLS - 1);
      if (near.hp + near.arm > 300 && ready('bombe') && tryPlant(pi, 'bombe', t.l, c)) return;
      if (near.k !== 'geant' && ready('gobe') && c > 0 && free(t.l, [c - 1]) != null && tryPlant(pi, 'gobe', t.l, c - 1)) return;
    }
    // lanes under attack get guns, a wall in front of the big ones
    threat.sort((a, b) => (b.hp - b.guns * 400) - (a.hp - a.guns * 400));
    for (const t of threat) {
      if (!t.z.length) continue;
      if (t.guns < 1 + Math.floor(t.hp / 700)) { const c = free(t.l, [2, 3, 4, 5]); if (c != null) { const k = gun(t.l); if (!ready(k)) return; if (tryPlant(pi, k, t.l, c)) return; } }
      if (t.guns && t.hp > 500 && free(t.l, [6]) != null && ready('roche') && t.z.every((z) => z.x > cellX(6) + 10)) { if (tryPlant(pi, 'roche', t.l, 6)) return; }
      // a mine three cells ahead of the first one: armed by the time it gets there
      const lead = t.z.filter((z) => z.x < W).sort((a, b) => a.x - b.x)[0];
      if (lead && ready('mine') && !S.plants.some((q) => q.l === t.l && q.k === 'mine')) {
        const c = Math.floor((lead.x - FX) / CW) - 3;
        if (c >= 3 && c < COLS && !plantAt(t.l, c) && tryPlant(pi, 'mine', t.l, c)) return;
      }
    }
    // calm: star flowers first, then a gun in every lane, then more of both
    const suns = S.plants.filter((q) => q.k === 'lunelle' && mineL.includes(q.l)).length;
    const want = Math.min(mineL.length * 2, S.mode === 'versus' ? 8 : 9);
    const bare = threat.filter((t) => !t.guns).map((t) => t.l);
    if (suns < mineL.length || (suns < want && (!bare.length || S.t < 40))) {
      if (!ready('lunelle')) return;
      const n = (l) => S.plants.filter((q) => q.k === 'lunelle' && q.l === l).length;
      const l = mineL.filter((m) => free(m, [0, 1]) != null).sort((a, b) => n(a) - n(b))[0];
      if (l != null && tryPlant(pi, 'lunelle', l, free(l, [0, 1]))) return;
    }
    if (bare.length && S.t > 15) { const l = bare[Math.floor(L.R() * bare.length)], c = free(l, [2, 3]); if (c != null && ready('pois')) { tryPlant(pi, 'pois', l, c); return; } }
    if (p.e >= 350) {
      const t = threat.slice().sort((a, b) => a.guns - b.guns)[0], c = t && free(t.l, [2, 3, 4]);
      if (c != null) { tryPlant(pi, gun(t.l), t.l, c); return; }
      const w = mineL.find((l) => free(l, [6]) != null && S.plants.some((q) => q.l === l && PLANTS[q.k].rate));
      if (w != null && ready('roche')) tryPlant(pi, 'roche', w, 6);
    }
  }

  // ---------- net ----------
  const PKi = (k) => PK.indexOf(k), r1 = (v) => Math.round(v * 10) / 10;
  function snapshot() {
    return {
      t: 'S', T: r1(S.t), ph: S.phase, cn: r1(S.count), lf: r1(S.left), w: [S.wave.n, r1(S.wave.t)], res: S.res, et: r1(S.endT), ni: S.nextId,
      pl: S.pl.map((p) => [Math.floor(p.e), cards_of(p).map((k) => r1(p.cd[k] || 0)), p.score, p.kills, p.bot ? 1 : 0]),
      P: S.plants.map((p) => [PKi(p.k), p.l, p.c, Math.round(p.hp), r1(p.t), p.owner, p.armed ? 1 : 0, r1(p.chew), p.fire > 0 ? 1 : 0, p.glow > 0 ? 1 : 0]),
      Z: S.zombies.map((z) => [z.id, ZK.indexOf(z.k), z.l, r1(z.x), Math.round(z.hp), Math.round(z.arm), r1(z.slow), (z.eat ? 1 : 0) | (z.jumped ? 2 : 0) | (z.thrown ? 4 : 0), Math.round(z.hop * 100), z.by, r1(z.smash), r1(z.t)]),
      B: S.peas.map((b) => [b.l, Math.round(b.x), b.k, b.o, r1(b.d)]),
      St: S.stars.map((s) => [s.id, Math.round(s.x), Math.round(s.y), Math.round(s.ty), r1(s.life), s.owner]),
      R: S.rovers.map((r) => [r.s, Math.round(r.x)]),
      ev: S.ev.filter((e) => e.e !== 'shoot' && e.e !== 'hit'),
    };
  }
  const cards_of = (p) => p.side === 'z' ? ZCARDS : PK;
  function applySnap(m) {
    S.t = m.T; S.phase = m.ph; S.count = m.cn; S.left = m.lf; S.wave.n = m.w[0]; S.wave.t = m.w[1]; S.res = m.res; S.endT = m.et; S.nextId = m.ni;
    m.pl.forEach((a, i) => { const p = S.pl[i]; if (!p) return; p.e = a[0]; cards_of(p).forEach((k, j) => { p.cd[k] = a[1][j]; }); p.score = a[2]; p.kills = a[3]; p.bot = !!a[4]; });
    S.plants = m.P.map((a) => ({ k: PK[a[0]], l: a[1], c: a[2], hp: a[3], t: a[4], owner: a[5], armed: !!a[6], chew: a[7], fire: a[8] ? .15 : 0, glow: a[9] ? 1 : 0 }));
    S.zombies = m.Z.map((a) => ({ id: a[0], k: ZK[a[1]], l: a[2], x: a[3], hp: a[4], arm: a[5], slow: a[6], eat: a[7] & 1, jumped: !!(a[7] & 2), thrown: !!(a[7] & 4), hop: a[8] / 100, by: a[9], smash: a[10], t: a[11], flash: 0, owner: -1 }));
    if (m.B.length > L.lastPeas) sfx.shoot();
    L.lastPeas = m.B.length;
    S.peas = m.B.map((a) => ({ l: a[0], x: a[1], k: a[2], o: a[3], d: a[4] }));
    const gone = L.grabbed || new Set();
    S.stars = m.St.filter((a) => !gone.has(a[0])).map((a) => ({ id: a[0], x: a[1], y: a[2], ty: a[3], life: a[4], owner: a[5] }));
    S.rovers = m.R.map((a) => ({ s: a[0], x: a[1] }));
    for (const e of m.ev) play(e);
  }
  // the client between two snapshots: things keep moving
  function drift(dt) {
    if (S.phase === 'end') S.endT += dt;
    for (const z of S.zombies) {
      z.t += dt;
      if (z.hop > 0) { z.hop = Math.min(.99, z.hop + dt / .7); z.x -= 62 * dt; continue; }
      if (!z.eat) z.x -= (z.k === 'jetpack' && z.jumped ? 6.5 : ZOMB[z.k].v) * (z.slow > 0 ? .5 : 1) * dt;
    }
    for (const b of S.peas) { if (b.d > 0) b.d -= dt; else b.x += PEA_V * dt; }
    for (const s of S.stars) if (s.y < s.ty) s.y = Math.min(s.ty, s.y + STAR_V * dt);
    for (const r of S.rovers) if (r.s === 1) r.x += 150 * dt;
  }
  function act(a) {
    if (L.host) return hostAct(L.me, a);
    L.send({ t: 'a', ...a });
    return true;
  }
  function hostAct(pi, a) {
    if (a.a === 'plant') return tryPlant(pi, a.k, a.l | 0, a.c | 0);
    if (a.a === 'dig') return tryDig(pi, a.l | 0, a.c | 0);
    if (a.a === 'send') return trySend(pi, a.k, a.l | 0);
    if (a.a === 'grab') return tryGrab(pi, a.id | 0);
    return false;
  }
  function onFx(id, fx) {
    if (!S || !fx || id === L.meId) return;
    const pi = S.pl.findIndex((p) => p.id === id);
    if (pi < 0) return;
    if (fx.t === 'a' && L.host) hostAct(pi, fx);
    else if (fx.t === 'S' && !L.host && id === L.hostId) applySnap(fx);
  }
  function peerLeft(id) {
    if (!S) return;
    const pi = S.pl.findIndex((p) => p.id === id);
    if (pi >= 0) { S.pl[pi].bot = true; S.pl[pi].gone = true; }
    if (id === L.hostId) {
      // the next one in line carries on from the last picture
      const next = L.humans.find((h) => !S.pl.find((p) => p.id === h.id)?.gone);
      L.hostId = next?.id;
      if (L.hostId === L.meId) { L.host = true; L.grabbed = null; }
    }
  }

  // ---------- events: sounds and sparks, on every screen ----------
  function play(e) {
    if (!L) return;
    const P = (x, y, c, n, v = 80) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * v; L.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, c, life: 0, max: .3 + Math.random() * .4 }); } };
    switch (e.e) {
      case 'plant': sfx.plant(); P(cellX(e.c), laneY(e.l), '#8a7a6a', 6, 40); break;
      case 'dig': sfx.plant(); break;
      case 'shoot': sfx.shoot(); break;
      case 'hit': sfx.hit(); P(e.x, laneY(e.l) - 18, e.k ? '#8ad8ff' : '#6ae05a', 3, 40); break;
      case 'boom': sfx.boom(); P(cellX(e.c), laneY(e.l) - 10, '#ffb040', 30, 160); P(cellX(e.c), laneY(e.l) - 10, '#ff4a2a', 20, 120); L.fx.set('boom' + e.l + e.c, { x: cellX(e.c), y: laneY(e.l) - 10, r: e.big ? 50 : 26, t: 0 }); break;
      case 'chomp': sfx.chomp(); break;
      case 'gulp': sfx.chomp(); P(cellX(e.c), laneY(e.l) - 8, '#3ac050', 8, 60); break;
      case 'smash': sfx.smash(); P(cellX(e.c), laneY(e.l), '#8a7a6a', 16, 100); break;
      case 'rover': sfx.rover(); break;
      case 'die': P(e.x, laneY(e.l) - 16, '#8ac070', 10, 80); P(e.x, laneY(e.l) - 12, '#8a9ab0', 8, 60); break;
      case 'arm': sfx.pick(); break;
      case 'send': sfx.send(); break;
      case 'throw': sfx.groan(); break;
      case 'go': sfx.beep(true); sfx.music(true); break;
      case 'wave': sfx.wave(); if (e.n === 1) say('les zombies arrivent !', 2.5); break;
      case 'flag': sfx.flag(); say(e.n === WAVES ? 'la dernière vague !' : 'une grosse vague de zombies approche !', 3); break;
      case 'end': { const side = mine().side; (e.w === side ? sfx.win : sfx.lose)(); break; }
    }
  }
  function say(t, d = 2.5) { if (L) L.msg = { t, d, at: performance.now() / 1000 }; }

  // ---------- input ----------
  function toBuf(mx, my) {
    if (!view) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { x: (mx * dpr - view.ox) / view.s, y: (my * dpr - view.oy) / view.s };
  }
  const cardRect = (i) => ({ x: 42 + i * 30, y: 2, w: 28, h: 36 });
  const SHOVEL = { x: 42 + 9 * 30 + 4, y: 2, w: 28, h: 36 };
  function cellAt(p) {
    if (!p) return null;
    const c = Math.floor((p.x - FX) / CW), l = Math.floor((p.y - FY) / LH);
    if (l < 0 || l >= S.lanes) return null;
    if (mine().side === 'z') return p.x >= FX ? { l, c: clamp(c, 0, COLS - 1) } : null;
    return c >= 0 && c < COLS ? { l, c } : null;
  }
  function click() {
    if (!S || S.phase !== 'play') return;
    const p = toBuf(L.mouse.x, L.mouse.y);
    if (!p) return;
    // a star first: they sit over everything
    if (mine().side === 'p') {
      const s = S.stars.find((s) => Math.abs(s.x - p.x) < 9 && Math.abs(s.y - p.y) < 9);
      if (s) { grab(s); return; }
    }
    const cs = cards();
    for (let i = 0; i < cs.length; i++) { const r = cardRect(i); if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) { pick(cs[i]); return; } }
    if (mine().side === 'p' && p.x >= SHOVEL.x && p.x < SHOVEL.x + SHOVEL.w && p.y < SHOVEL.y + SHOVEL.h) { pick('pelle'); return; }
    const cell = cellAt(p);
    if (cell) { L.cur = { ...cell }; use(cell); }
  }
  function grab(s) {
    if (!L.host) { L.grabbed = L.grabbed || new Set(); L.grabbed.add(s.id); S.stars.splice(S.stars.indexOf(s), 1); }
    act({ a: 'grab', id: s.id });
    sfx.star();
    L.parts.push({ x: s.x, y: s.y, vx: -(s.x - 20) * 2.2, vy: -(s.y - 20) * 2.2, c: '#ffe04a', life: 0, max: .45, big: true });
  }
  function pick(k) {
    if (L.sel === k) { L.sel = null; return; }
    const d = cardDef(k);
    if (d && ((mine().cd[k] || 0) > 0 || mine().e < d.cost)) { sfx.deny(); return; }
    L.sel = k; sfx.pick();
  }
  function use(cell) {
    const me = mine(), k = L.sel;
    if (!k) return;
    if (me.side === 'z') {
      if (!ZOMB[k] || me.e < ZOMB[k].cost || (me.cd[k] || 0) > 0) { sfx.deny(); return; }
      act({ a: 'send', k, l: cell.l });
      L.sel = null;
      return;
    }
    if (S.own[cell.l] !== L.me) { sfx.deny(); say('ce rang est à ' + S.pl[S.own[cell.l]].name, 1.5); return; }
    if (k === 'pelle') { if (plantAt(cell.l, cell.c)) { act({ a: 'dig', l: cell.l, c: cell.c }); L.sel = null; } else sfx.deny(); return; }
    const d = PLANTS[k];
    if (plantAt(cell.l, cell.c) || me.e < d.cost || (me.cd[k] || 0) > 0) { sfx.deny(); return; }
    act({ a: 'plant', k, l: cell.l, c: cell.c });
    L.sel = null;
  }
  function keyInput(keys) {
    const pk = L.prevKeys, edge = (c) => keys.has(c) && !pk.has(c);
    const cs = cards();
    for (let i = 0; i < 9; i++) if (edge('Digit' + (i + 1)) || edge('Numpad' + (i + 1))) { if (cs[i]) pick(cs[i]); }
    if ((edge('Digit0') || edge('Numpad0')) && mine().side === 'p') pick('pelle');
    const c = L.cur;
    if (edge('ArrowUp') || edge('KeyW')) c.l = Math.max(0, c.l - 1);
    if (edge('ArrowDown') || edge('KeyS')) c.l = Math.min(S.lanes - 1, c.l + 1);
    if (edge('ArrowLeft') || edge('KeyA')) c.c = Math.max(0, c.c - 1);
    if (edge('ArrowRight') || edge('KeyD')) c.c = Math.min(COLS - 1, c.c + 1);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].some(edge)) L.keyCur = true;
    if (edge('Space') || edge('Enter')) {
      // the space bar also picks up the stars under the cursor's lane
      if (mine().side === 'p') { const s = S.stars.find((s) => s.y >= s.ty && Math.floor((s.ty + 6 - FY) / LH) === c.l && Math.abs(s.x - cellX(c.c)) < CW); if (s && !L.sel) { grab(s); L.prevKeys = new Set(keys); return; } }
      if (S.phase === 'play') use({ ...c });
    }
    L.prevKeys = new Set(keys);
  }

  // ---------- the loop ----------
  function update(dt, keys = new Set()) {
    if (!S || !cv) return;
    dt = Math.min(Math.max(dt, 0), .1);
    if (document.pointerLockElement) document.exitPointerLock?.();
    if (dt > 0) sfx.init();
    if (dt > 0) keyInput(keys);
    if (dt > 0) {
      if (L.host) {
        const n = dt > 1 / 45 ? 2 : 1;
        for (let i = 0; i < n; i++) sim(dt / n);
        // the events pile up until the next picture carries them
        L.sendT += dt;
        if (L.humans.length <= 1) S.ev = [];
        else if (L.sendT >= SEND) { L.sendT = 0; L.send(snapshot()); S.ev = []; }
      } else drift(dt);
      // a groan now and then
      L.groanT -= dt;
      if (L.groanT <= 0) { L.groanT = 4 + Math.random() * 6; if (S.zombies.length) sfx.groan(); }
      if (S.zombies.some((z) => z.eat) && Math.random() < dt * 3) sfx.munch();
      for (const p of L.parts) { p.life += dt; p.vy += (p.big ? 0 : 200) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      L.parts = L.parts.filter((p) => p.life < p.max);
      for (const [k, f] of L.fx) { f.t += dt; if (f.t > .4) L.fx.delete(k); }
      sfx.tick();
      if (S.phase === 'end' && S.endT > 4.5 && !L.ended) { finish(); if (!S) return; }
    }
    render();
  }
  function finish() {
    L.ended = true;
    const me = mine(), humans = S.pl.filter((p) => !p.bot || p.gone), won = S.res === me.side;
    let place, text;
    if (S.mode === 'versus') {
      place = won ? 1 : 2;
      text = `${won ? 'victoire' : 'défaite'} · ${S.res === 'p' ? 'les plantes ont tenu' : 'les zombies sont entrés'} · ${me.kills ? me.kills + ' zombies abattus · ' : ''}${me.score} points`;
    } else {
      const list = humans.filter((p) => !p.gone).sort((a, b) => b.score - a.score);
      place = list.length <= 1 ? (won ? 1 : 2) : list.indexOf(me) + 1;
      text = won ? `base défendue, ${WAVES} vagues · ${me.kills} zombies · ${me.score} points` : `les zombies sont entrés à la vague ${S.wave.n} · ${me.score} points`;
      if (list.length > 1) text += ` · ${place === 1 ? '1re' : place + 'e'} place sur ${list.length}`;
    }
    onEnd({ place, of: Math.max(1, S.pl.filter((p) => !p.bot).length), time: S.t, value: me.score, text });
  }

  // ---------- drawing ----------
  function render() {
    const g = bx, t = S.t, me = mine();
    g.drawImage(L.field, 0, 0);
    // rovers
    S.rovers.forEach((r, l) => { if (r.s !== 2) drawRover(g, Math.round(r.x + 12), laneY(l) + 2, t, r.s === 1); });
    // where the mouse or the cursor points
    const p = L.mouse.in && !L.keyCur ? toBuf(L.mouse.x, L.mouse.y) : null;
    const cell = p ? cellAt(p) : S.phase === 'play' ? L.cur : null;
    if (L.mouse.in && p && L.lastM !== L.mouse.x + ',' + L.mouse.y) { L.lastM = L.mouse.x + ',' + L.mouse.y; L.keyCur = false; }
    if (cell && S.phase === 'play') {
      if (me.side === 'z') { g.fillStyle = 'rgba(176,74,208,.18)'; g.fillRect(FX, FY + cell.l * LH, COLS * CW + 64, LH); }
      else {
        const ok = S.own[cell.l] === L.me && (L.sel === 'pelle' ? !!plantAt(cell.l, cell.c) : !plantAt(cell.l, cell.c));
        g.fillStyle = ok ? 'rgba(255,255,255,.18)' : 'rgba(255,60,60,.2)'; g.fillRect(FX + cell.c * CW, FY + cell.l * LH, CW, LH);
        g.strokeStyle = ok ? '#fff8' : '#f448'; g.strokeRect(FX + cell.c * CW + .5, FY + cell.l * LH + .5, CW - 1, LH - 1);
        if (ok && L.sel && PLANTS[L.sel]) { g.globalAlpha = .45; drawPlant(g, L.sel, cellX(cell.c), laneY(cell.l), { t }); g.globalAlpha = 1; }
      }
    }
    // lane by lane, back to front
    for (let l = 0; l < S.lanes; l++) {
      for (const q of S.plants) if (q.l === l) drawPlant(g, q.k, cellX(q.c), laneY(q.l), { t, hp: q.hp / PLANTS[q.k].hp, armed: q.armed, chew: q.chew, fire: q.fire, glow: q.glow, fuse: q.k === 'bombe' ? 1 : 0 });
      const zs = S.zombies.filter((z) => z.l === l).sort((a, b) => b.x - a.x);
      for (const z of zs) drawZombie(g, z.k, Math.round(z.x), laneY(l), { t: z.t, eat: z.eat, hop: z.hop, slow: z.slow, flash: z.flash, arm: z.arm, thrown: z.thrown, fly: z.k === 'jetpack' && !z.jumped });
      for (const b of S.peas) if (b.l === l && b.d <= 0) drawPea(g, Math.round(b.x), laneY(l) - 17, b.k === 1);
    }
    for (const f of L.fx.values()) { g.fillStyle = `rgba(255,200,80,${.6 * (1 - f.t / .4)})`; g.beginPath(); g.arc(f.x, f.y, f.r * (.5 + f.t * 2), 0, 7); g.fill(); }
    for (const s of S.stars) {
      if (s.life < 2 && Math.floor(s.life * 8) % 2) continue;
      const k = 1 + Math.sin(t * 5 + s.id) * .08;
      g.fillStyle = 'rgba(255,230,120,.25)'; g.fillRect(Math.round(s.x - 7 * k), Math.round(s.y - 7 * k), Math.round(14 * k), Math.round(14 * k));
      g.drawImage(STAR, Math.round(s.x - 5), Math.round(s.y - 5));
    }
    for (const q of L.parts) { g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.big ? 4 : 2, q.big ? 4 : 2); }
    bar(g, t);
    // what's going on
    if (L.msg && performance.now() / 1000 - L.msg.at < L.msg.d) banner(g, L.msg.t, FY + S.lanes * LH / 2 - 8, '#fff');
    if (S.phase === 'count') {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, FY, W, S.lanes * LH);
      text(g, 'potager lunaire', W / 2, FY + 12, '#ffe04a', 2, '#6a3a00', 'center');
      const role = S.mode === 'versus' ? (me.side === 'p' ? 'tu es le jardinier · tiens 4 minutes' : 'tu mènes les zombies · entre dans la base') : S.lanes > 5 ? 'tes rangées sont marquées de ta couleur' : 'ramasse les étoiles et plante !';
      text(g, role, W / 2, FY + 36, '#fff', 1, '#000', 'center');
      text(g, String(Math.max(1, Math.ceil(S.count))), W / 2, FY + 54, '#fff', 2, '#000', 'center');
    }
    if (S.phase === 'end') {
      const won = S.res === me.side;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, FY, W, S.lanes * LH);
      const big = S.res === 'z' ? (me.side === 'z' ? 'la base est à vous !' : 'les zombies ont mangé la base !') : (me.side === 'p' ? 'la base tient bon !' : 'les plantes ont tenu…');
      text(g, big, W / 2, FY + S.lanes * LH / 2 - 16, won ? '#ffe04a' : '#ff6a5a', 2, '#000', 'center');
      text(g, `${me.score} points`, W / 2, FY + S.lanes * LH / 2 + 8, '#fff', 1, '#000', 'center');
    }
    blit();
  }
  function banner(g, s, y, c) {
    const w = s.length * 12 + 16;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W / 2 - w / 2, y - 4, w, 22);
    text(g, s, W / 2, y, c, 2, '#000', 'center');
  }
  function bar(g, t) {
    const me = mine(), cs = cards(), z = me.side === 'z';
    g.fillStyle = '#10101c'; g.fillRect(0, 0, W, FY - 4);
    // energy
    g.fillStyle = '#1e1e34'; g.fillRect(2, 2, 36, 36);
    g.drawImage(z ? MOON : STAR, 14, 5);
    text(g, String(me.e), 20, 24, z ? '#d8b0ff' : '#ffe04a', 1, '#000', 'center');
    cs.forEach((k, i) => {
      const r = cardRect(i), d = cardDef(k), cd = me.cd[k] || 0, can = me.e >= d.cost && cd <= 0;
      g.fillStyle = L.sel === k ? '#fff' : '#000'; g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      g.fillStyle = z ? '#3a2a4a' : '#2a4a2a'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = z ? '#4a3a5e' : '#3a5e3a'; g.fillRect(r.x, r.y, r.w, 2);
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h - 9); g.clip();
      if (z) drawZombie(g, k, r.x + 15, r.y + 30 + (k === 'geant' ? 10 : 0), { t: 0, arm: 1 });
      else drawPlant(g, k, r.x + 13, r.y + 27, { t: 0, armed: true, hp: 1 });
      g.restore();
      g.fillStyle = '#000'; g.fillRect(r.x, r.y + r.h - 9, r.w, 9);
      text(g, String(d.cost), r.x + r.w / 2, r.y + r.h - 8, can ? '#fff' : '#ff6a5a', 1, null, 'center');
      if (cd > 0) { const f = cd / d.cd; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(r.x, r.y, r.w, Math.ceil((r.h - 9) * f)); }
      else if (me.e < d.cost) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(r.x, r.y, r.w, r.h - 9); }
      text(g, String(i + 1), r.x + 2, r.y + 2, '#ffffff90');
    });
    if (!z) {
      const r = SHOVEL;
      g.fillStyle = L.sel === 'pelle' ? '#fff' : '#000'; g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      g.fillStyle = '#3a3020'; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#8a5a2a'; g.fillRect(r.x + 13, r.y + 6, 2, 16); g.fillStyle = '#c0c0d0'; g.fillRect(r.x + 9, r.y + 20, 10, 9); g.fillStyle = '#8a8a96'; g.fillRect(r.x + 9, r.y + 27, 10, 2);
      text(g, '0', r.x + 2, r.y + 2, '#ffffff90');
    }
    // progress: the waves, or the clock
    const px0 = 346, pw = 50;
    if (S.mode === 'versus') {
      const s = Math.max(0, Math.ceil(S.left));
      text(g, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, px0 + pw / 2, 8, s < 30 ? '#ff6a5a' : '#fff', 1, '#000', 'center');
      text(g, me.side === 'p' ? 'plantes' : 'zombies', px0 + pw / 2, 22, me.side === 'p' ? '#6ae05a' : '#d8b0ff', 1, '#000', 'center');
    } else {
      text(g, `vague ${S.wave.n}`, px0 + pw / 2, 6, '#fff', 1, '#000', 'center');
      g.fillStyle = '#000'; g.fillRect(px0, 18, pw, 6); g.fillStyle = '#6ae05a'; g.fillRect(px0 + 1, 19, Math.round((pw - 2) * S.wave.n / WAVES), 4);
      for (const f of FLAGS) { const x = px0 + Math.round((pw - 2) * f / WAVES) - 1; g.fillStyle = '#8a6a4a'; g.fillRect(x, 13, 1, 8); g.fillStyle = S.wave.n >= f ? '#6ae05a' : '#e02a2a'; g.fillRect(x + 1, 13, 4, 3); }
      text(g, String(me.score), px0 + pw / 2, 28, '#ffe04a', 1, '#000', 'center');
    }
  }
  function placeCanvas() {
    if (!cv) return;
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100vw', height: '100vh' });
  }
  function blit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((rect?.w ?? innerWidth) * dpr), ch = Math.round((rect?.h ?? innerHeight) * dpr);
    if (cv.width !== cw || cv.height !== ch || !view) {
      cv.width = cw; cv.height = ch;
      const f = Math.min(cw / W, ch / L.H), s = f >= 2 ? Math.floor(f) : f;
      const w = Math.round(W * s), h = Math.round(L.H * s);
      view = { s, w, h, ox: Math.floor((cw - w) / 2), oy: Math.floor((ch - h) / 2) };
    }
    const { w, h, ox, oy } = view;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#05050e'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(buf, ox, oy, w, h);
  }

  return {
    start, stop, update, onFx, peerLeft,
    modes: MODES.map(({ id, name, sub, help }) => ({ id, name, sub, help })),
    respawn() {},
    hud() { return { hidden: true }; },
    setRect(r) { rect = r; view = null; placeCanvas(); },
    set onEnd(f) { onEnd = f; },
    // for the tests
    get _dbg() {
      return {
        get S() { return S; }, get L() { return L; }, get view() { return view; },
        page(bx, by) { const d = Math.min(2, window.devicePixelRatio || 1), b = cv.getBoundingClientRect(); return { x: b.left + (view.ox + bx * view.s) / d, y: b.top + (view.oy + by * view.s) / d }; },
        sim(sec) { for (let i = 0; i < sec * 30 && S && !L.ended; i++) { S.ev = []; sim(1 / 30); if (S.phase === 'end' && S.endT > 4.5) { finish(); break; } } if (S) render(); },
        act: (a) => act(a), rich() { mine().e = 5000; },
      };
    },
  };
}
