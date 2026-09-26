// nes-level.js, a seeded level for "super creuseur": hand-made chunks strung together, harder towards the flag.
export const TS = 16, ROWS = 15, GROUND = 13;
// tiles
export const EMPTY = 0, DIRT = 1, BRICK = 2, QBLK = 3, USED = 4, STONE = 5, PIPE_TL = 6, PIPE_TR = 7, PIPE_L = 8, PIPE_R = 9, COIN = 10;
export const SOLID = new Uint8Array(16); for (const t of [DIRT, BRICK, QBLK, USED, STONE, PIPE_TL, PIPE_TR, PIPE_L, PIPE_R]) SOLID[t] = 1;

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildLevel(seed) {
  const R = rng(seed), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = (a) => a[Math.floor(R() * a.length)];
  const MAXW = 560;
  const tiles = new Uint8Array(MAXW * ROWS);
  const content = new Map();     // tile index → 'coin' | 'pow' | 'multi'
  const multi = new Map();       // tile index → coins left in a brick
  const enemies = [], plats = [], decor = [], checkpoints = [16 * 3];
  const idx = (x, y) => y * MAXW + x;
  const set = (x, y, t, c) => { if (x < 0 || x >= MAXW || y < 0 || y >= ROWS) return; tiles[idx(x, y)] = t; if (c) { content.set(idx(x, y), c); if (c === 'multi') multi.set(idx(x, y), 6); } };
  const ground = (a, b) => { for (let x = a; x < b; x++) { set(x, GROUND, DIRT); set(x, GROUND + 1, DIRT); } };
  const foe = (k, x, y = GROUND - 1) => enemies.push({ k, x: x * TS, y: y * TS });
  const pipe = (x, h) => {
    for (let j = 0; j < h; j++) { const y = GROUND - 1 - j, top = j === h - 1; set(x, y, top ? PIPE_TL : PIPE_L); set(x + 1, y, top ? PIPE_TR : PIPE_R); }
    return GROUND - h;
  };
  // a pattern of blocks on a row: B brick, ? coin block, P power block, M many-coin brick, o coin, S stone
  const row = (x, y, pat) => [...pat].forEach((ch, i) => {
    if (ch === 'B') set(x + i, y, BRICK); else if (ch === '?') set(x + i, y, QBLK, 'coin'); else if (ch === 'P') set(x + i, y, QBLK, 'pow');
    else if (ch === 'M') set(x + i, y, BRICK, 'multi'); else if (ch === 'o') set(x + i, y, COIN); else if (ch === 'S') set(x + i, y, STONE);
  });
  const coinArc = (x, w, y) => { for (let i = 0; i < w; i++) set(x + i, y - (i === 0 || i === w - 1 ? 0 : 1), COIN); };

  const CH = {
    blocks(x, d) {
      const w = ri(15, 18); ground(x, x + w);
      const pats = ['B?BPB', '?B?', 'BB?BB', 'B?M?B', '??'];
      const p = pick(pats), bx = x + ri(3, 5);
      row(bx, 9, p);
      if (R() < .6) row(bx + Math.floor(p.length / 2), 5, R() < .3 ? 'P' : '?');
      foe('mole', x + w - 4); if (d > .45) foe('mole', x + w - 2);
      return x + w;
    },
    pipes(x, d) {
      const w = ri(20, 24); ground(x, x + w);
      const hs = d < .3 ? [2, 3] : [2, 3, 4].sort(() => R() - .5);
      const xs = hs.map((_, i) => x + 3 + Math.floor(i * (w - 6) / hs.length));
      let tallest = 0;
      hs.forEach((h, i) => { pipe(xs[i], h); if (h > hs[tallest]) tallest = i; });
      xs.slice(0, -1).forEach((px, i) => { if (R() < .5 + d * .5) foe('mole', px + 3 + ((xs[i + 1] - px - 4) >> 1)); });
      if (d > .25 && tallest > 0) enemies.push({ k: 'worm', x: xs[tallest] * TS + 8, y: (GROUND - hs[tallest]) * TS });
      if (R() < .5) coinArc(xs[0] + 3, 3, GROUND - hs[0] - 3);
      return x + w;
    },
    gap(x, d) {
      const a = ri(3, 5), g = ri(2, d > .5 ? 4 : 3), b = ri(4, 6);
      ground(x, x + a); ground(x + a + g, x + a + g + b);
      coinArc(x + a - 1 + (g > 2 ? 0 : 0), g + 2, 9);
      if (d > .6) foe('mole', x + a + g + b - 2);
      return x + a + g + b;
    },
    stairs(x, d) {
      const h = d > .5 ? 4 : 3, gap = d > .35 ? 2 : 0, w = 3 + h + gap + h + 3;
      ground(x, x + 3 + h); ground(x + 3 + h + gap, x + w);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j <= i; j++) set(x + 3 + i, GROUND - 1 - j, STONE);
        for (let j = 0; j <= h - 1 - i; j++) set(x + 3 + h + gap + i, GROUND - 1 - j, STONE);
      }
      if (!gap) foe('mole', x + w - 2);
      return x + w;
    },
    lift(x, d) {
      const g = ri(7, 9), w = 3 + g + 4;
      ground(x, x + 3); ground(x + 3 + g, x + w);
      if (R() < .5) plats.push({ x: (x + 3) * TS + 4, y: 10 * TS, w: 48, ax: (g - 3) * TS - 8, ay: 0, per: 5 + R() * 1.5, ph: 0 });
      else {
        plats.push({ x: (x + 3) * TS, y: 7 * TS, w: 48, ax: 0, ay: 4 * TS, per: 4.2, ph: 0 });
        plats.push({ x: (x + g) * TS, y: 7 * TS, w: 48, ax: 0, ay: 4 * TS, per: 4.2, ph: .5 });
      }
      for (let i = 0; i < 3; i++) set(x + 4 + i + Math.floor(g / 2) - 2, 5, COIN);
      if (d > .5) foe('crow', x + 3 + g, 7);
      return x + w;
    },
    islands(x, d) {
      const g = d > .5 ? 3 : 2, n = 2 + (R() < .5 ? 1 : 0), iw = 3;
      let cx = x; ground(x, x + 3); cx = x + 3;
      for (let k = 0; k < n; k++) {
        cx += g - 1; const y = 11 - (k % 2);
        row(cx, y, 'SSS'); row(cx, y - 2, 'ooo'); cx += iw;
      }
      cx += g - 1; ground(cx, cx + 4);
      if (d > .4) foe('crow', cx - 2, 8);
      return cx + 4;
    },
    bricks(x, d) {
      const w = ri(20, 23); ground(x, x + w);
      row(x + 3, 9, pick(['BBPBBMBB', 'BB?BBBMB', 'BMBB?BBB']));
      row(x + 7, 5, pick(['BBB?BBBB', 'B??BBBB', 'BBBBoBBB']));
      row(x + 8, 4, 'oooo');
      foe(d > .3 ? 'beetle' : 'mole', x + 14);
      if (d > .5) foe('mole', x + 17);
      if (d > .6) foe('crow', x + w, 6);
      return x + w;
    },
    crows(x, d) {
      const w = ri(16, 19); ground(x, x + w);
      row(x + 4, 10, 'ooooo');
      foe('crow', x + 9, 8); foe('crow', x + w + 2, 6);
      if (d > .5) foe('mole', x + w - 3);
      row(x + w - 6, 9, 'B?B');
      return x + w;
    },
    beetles(x, d) {
      const w = ri(16, 19); ground(x, x + w);
      row(x + 5, 9, pick(['BB?B', 'B?P?B', 'BMB']));
      foe('beetle', x + 11); if (d > .35) foe('beetle', x + 14);
      foe('mole', x + w - 2);
      return x + w;
    },
  };
  const checkpoint = (x) => { ground(x, x + 8); checkpoints.push((x + 3) * TS); return x + 8; };

  // the start: the famous row of blocks, then the chunks
  let x = 0;
  ground(0, 18);
  row(10, 9, 'P'); row(13, 9, 'B?B?B'); row(15, 5, '?');
  foe('mole', 16);
  x = 18;
  const N = 20, order = [];
  const names = Object.keys(CH);
  let last = '';
  for (let i = 0; i < N; i++) {
    let n; do n = pick(names); while (n === last || (i < 2 && (n === 'lift' || n === 'islands')));
    order.push(n); last = n;
  }
  // make sure the good bits are all there once
  for (const must of ['pipes', 'stairs', 'lift', 'bricks', 'beetles']) if (!order.includes(must)) order[2 + Math.floor(R() * (N - 3))] = must;
  order.forEach((n, i) => {
    if (i === 7 || i === 14) x = checkpoint(x);
    x = CH[n](x, i / (N - 1));
  });
  // the end: a long staircase, the flag, the castle
  const endX = x;
  ground(x, x + 36);
  for (let i = 0; i < 8; i++) for (let j = 0; j <= i; j++) set(x + 3 + i, GROUND - 1 - j, STONE);
  for (let j = 0; j < 8; j++) set(x + 11, GROUND - 1 - j, STONE);
  const flagX = x + 20;
  set(flagX, GROUND - 1, STONE);
  const castleX = x + 25;
  const W = x + 36;

  // decor: hills, bushes on solid ground, clouds anywhere
  const hasGround = (a, b) => { for (let i = a; i < b; i++) if (tiles[idx(i, GROUND)] !== DIRT || tiles[idx(i, GROUND - 1)] !== EMPTY) return false; return true; };
  for (let i = 0; i < W; i += ri(5, 11)) {
    const k = R();
    if (k < .3 && hasGround(i, i + 5)) decor.push({ k: R() < .4 ? 'hillBig' : 'hill', x: i * TS, y: 0 });
    else if (k < .6 && hasGround(i, i + 3)) decor.push({ k: 'bush', x: i * TS, y: 0 });
    if (R() < .45) decor.push({ k: 'cloud', x: i * TS + ri(0, 40), y: ri(36, 90) });
  }
  enemies.sort((a, b) => a.x - b.x).forEach((e, i) => { e.i = i; });
  return { tiles, W: MAXW, len: W, content, multi, enemies, plats, decor, checkpoints, flagX, castleX, endX };
}
