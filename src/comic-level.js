// comic-level.js, the moon of « capitaine lune »: four zones strung from hand-drawn chunks (11 rows each), in an
// order drawn from the seed. Items that open the way (boots, key, lantern, wand) always come before what they open.
export const TS = 16, ROWS = 11;
export const EMPTY = 0, ROCK = 1, BLOCK = 2, WALL = 3, SPIKE = 4, DOOR = 5, BACK = 6, LOCK = 7, DECO = 8;
export const SOLID = new Set([ROCK, BLOCK, WALL]);

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// '.' void · '#' rock · 'B' block · 'W' fortress wall · '^' crystals that bite · 'o' a decoration
// 'D' door onwards · 'd' door back · 'L' locked door · 'S' where you land · 'i' the chunk's item · 'c' cola · 'h' shield · 'b' the guardian
const G = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => r.padEnd(w, '.')); };
const AIR = (n) => Array.from({ length: n }, () => '');
const P = {
  flat: G([...AIR(6), '............', '...o.....o..', '............', '############', '############']),
  pit: G([...AIR(8), '............', '####...#####', '####...#####']),
  bridge: G([...AIR(4), '.......c......', '..............', '......BBB.....', '..BBB.....BBB.', '..............', '##..........##', '##..........##']),
  steps: G([...AIR(6), '.......###..', '....######..', '..########..', '############', '############']),
  crater: G([...AIR(6), '......o.....', '.....##.....', '....####....', '###.####.###', '###.####.###']),
  spikes: G([...AIR(7), '.....BB.....', '............', '###^^^^^^###', '############']),
  ceiling: G(['############', '############', '############', '####....####', '.o........o.', '............', '............', '............', '............', '############', '############']),
  hop: G([...AIR(5), '........BB....', '..............', '....BB........', '..............', '###........###', '###........###']),
  tower: G([...AIR(3), '......c.....', '.....BB.....', '............', '...BB..BB...', '............', '.BB......BB.', '##^^^^^^^^##', '############']),
};
const POOLS = [
  ['flat', 'pit', 'bridge', 'steps', 'crater', 'spikes', 'hop'],
  ['flat', 'pit', 'bridge', 'steps', 'ceiling', 'spikes', 'hop', 'tower'],
  ['flat', 'pit', 'steps', 'ceiling', 'crater', 'spikes', 'bridge', 'tower'],
  ['flat', 'pit', 'bridge', 'steps', 'ceiling', 'spikes', 'hop', 'tower'],
];
const S = {
  start0: G([...AIR(8), '..S.......o.', '############', '############']),
  start: G([...AIR(8), '.d.S........', '############', '############']),
  end: G([...AIR(8), '........D...', '############', '############']),
  lock: G([...AIR(8), '........L...', '############', '############']),
  item: G([...AIR(5), '.....i......', '....BBB.....', '..BB........', '............', '############', '############']),
  itemLow: G([...AIR(7), '.....i......', '....BBB.....', '###.####.###', '###.####.###']),
  itemHigh: G([...AIR(3), '......i.....', '.....BBB....', '............', '..BB....BB..', '............', '............', '############', '############']),
  // only boots clear it
  tall: G([...AIR(4), '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '############', '############']),
  // only the wand goes through
  wand: G(['....WWWW....', '....WWWW....', '....WWWW....', '....WWWW....', '....WWWW....', '....WWWW....', '....WWWW....', '....WWWW....', '..o.WWWW.o..', '############', '############']),
  boss: G([...AIR(4), '..................', '..............i...', '............BBBBB.', '..b.........B.....', '..................', '##################', '##################']),
};

// what each zone holds, in order; strings are pool chunks drawn at random
export const ZONES = [
  { name: 'les cratères', foes: ['sine', 'bounce'], seq: ['start0', 'P', ['item', 'cola'], 'P', 'P', ['itemHigh', 'boots'], 'P', ['itemLow', 'shield'], 'P', 'P', 'end'] },
  { name: 'la base lunaire', foes: ['seek', 'zig', 'sine'], seq: ['start', 'P', ['item', 'cola'], 'P', 'tall', 'P', ['itemLow', 'key'], 'P', ['itemHigh', 'lantern'], 'P', ['item', 'lingot'], 'P', ['itemLow', 'shield'], 'lock'] },
  { name: 'les grottes', dark: true, foes: ['zig', 'bounce', 'leap'], seq: ['start', 'P', ['item', 'cork'], 'P', 'P', ['itemLow', 'cola'], 'P', ['itemHigh', 'gemme'], 'P', ['item', 'wand'], 'P', ['itemLow', 'shield'], 'end'] },
  { name: 'la forteresse', foes: ['shy', 'seek', 'zig', 'leap'], seq: ['start', 'P', ['item', 'cola'], 'P', 'wand', 'P', ['itemLow', 'shield'], 'P', 'P', ['boss', 'couronne']] },
];

export function createWorld(seed) {
  const R = rng(seed ^ 0x51ed27);
  return ZONES.map((z, zi) => {
    const pool = POOLS[zi];
    let last = null;
    const parts = z.seq.map((s) => {
      if (s === 'P') { let k; do k = pool[Math.floor(R() * pool.length)]; while (k === last && pool.length > 1); last = k; return { rows: P[k] }; }
      if (Array.isArray(s)) return { rows: S[s[0]], item: s[1], boss: s[0] === 'boss' };
      return { rows: S[s] };
    });
    const W = parts.reduce((a, p) => a + p.rows[0].length, 0);
    const tiles = new Uint8Array(W * ROWS), deco = [], items = [], z0 = { name: z.name, dark: !!z.dark, foes: z.foes, W, tiles, deco, items, spawn: null, door: null, back: null, boss: null };
    let x0 = 0;
    for (const p of parts) {
      const w = p.rows[0].length;
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < w; i++) {
        const ch = p.rows[j][i], x = x0 + i, k = j * W + x;
        const t = { '#': ROCK, B: BLOCK, W: WALL, '^': SPIKE, D: DOOR, d: BACK, L: LOCK }[ch];
        if (t) tiles[k] = t;
        if (ch === 'D' || ch === 'L') z0.door = { x, y: j };
        if (ch === 'd') z0.back = { x, y: j };
        if (ch === 'S') z0.spawn = { x, y: j };
        if (ch === 'o') deco.push({ x, y: j, v: Math.floor(R() * 4) });
        if (ch === 'i') items.push({ x, y: j, k: p.item, boss: p.boss });
        if (ch === 'c') items.push({ x, y: j, k: 'cola' });
        if (ch === 'h') items.push({ x, y: j, k: 'shield' });
        if (ch === 'b') z0.boss = { x, y: j, x0, x1: x0 + w };
      }
      x0 += w;
    }
    items.forEach((it, n) => { it.i = n; it.taken = false; });
    return z0;
  });
}
export const tileAt = (z, x, y) => (x < 0 || x >= z.W) ? ROCK : (y < 0 ? EMPTY : y >= ROWS ? EMPTY : z.tiles[y * z.W + x]);
export const solidAt = (z, x, y) => SOLID.has(tileAt(z, x, y));
