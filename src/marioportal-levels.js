// marioportal-levels.js, the five levels of « super portail », a world 1 in the spirit of the 8-bit
// classic's third episode: the plain with its note blocks and its leaf, the hills and their pipes, the
// big blocks (and the white one you can crouch through), the sky that scrolls on its own, the fortress
// and its brute. The white panels are the only surfaces a portal sticks to.
export const TS = 16;
export const E = 0, GND = 1, BRK = 2, QB = 3, USED = 4, NOTE = 5, WOOD = 6, WHITE = 7, PTL = 8, PTR = 9, PL = 10, PR = 11, COIN = 12,
  SU = 13, SD = 14, SEMI = 15, SEMIW = 16, CLOUD = 17, STONE = 18, LAVA = 19, SPIKE = 20, HEDGE = 21, SNOTE = 22;
// 1: solid, 2: one-way from above, 3: slope
export const KIND = new Uint8Array(32);
for (const t of [GND, BRK, QB, USED, NOTE, WOOD, WHITE, PTL, PTR, PL, PR, STONE, SPIKE, HEDGE, SNOTE]) KIND[t] = 1;
for (const t of [SEMI, SEMIW, CLOUD]) KIND[t] = 2;
KIND[SU] = KIND[SD] = 3;

function mk(W, H, theme, name, title) {
  const L = { W, H, G: H - 2, theme, name, title, tiles: new Uint8Array(W * H), content: new Map(), enemies: [], bigs: [], decor: [], start: 3, cp: 0, goal: W - 12, auto: 0, boss: null };
  const at = (x, y) => y * W + x;
  const b = {
    L,
    set(x, y, t, c) { if (x < 0 || x >= W || y < 0 || y >= H) return b; L.tiles[at(x, y)] = t; if (c) L.content.set(at(x, y), c); else L.content.delete(at(x, y)); return b; },
    fill(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b.set(x, y, t); return b; },
    ground(x0, x1, top = L.G, t = GND) { return b.fill(x0, top, x1, H - 1, t); },
    row(x0, x1, y, t, c) { for (let x = x0; x <= x1; x++) b.set(x, y, t, c); return b; },
    coins(x0, x1, y) { return b.row(x0, x1, y, COIN); },
    // a pipe from row `top` down to the ground, maybe with a plant in it
    pipe(x, top, plant, bottom = L.G - 1) {
      b.set(x, top, PTL).set(x + 1, top, PTR);
      for (let y = top + 1; y <= bottom; y++) b.set(x, y, PL).set(x + 1, y, PR);
      if (plant) b.foe(plant, x + .5, top);
      return b;
    },
    // a hill: up `h` tiles on 45° slopes, `flat` tiles on top, down again (down = false: a cliff)
    hill(x0, h, flat, down = true, base = L.G) {
      for (let k = 0; k < h; k++) { b.set(x0 + k, base - 1 - k, SU); b.fill(x0 + k, base - k, x0 + k, base - 1, GND); }
      b.fill(x0 + h, base - h, x0 + h + flat - 1, base - 1, GND);
      if (down) for (let k = 0; k < h; k++) { const x = x0 + h + flat + k; b.set(x, base - h + k, SD); b.fill(x, base - h + k + 1, x, base - 1, GND); }
      return b;
    },
    // a big coloured block with bolts: only its top holds you (the white one hides a trick)
    big(x, y, w, h, color) {
      for (let yy = y + 1; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const t = L.tiles[at(xx, yy)]; if (t === SEMI || t === SEMIW) b.set(xx, yy, E); }
      L.bigs.push({ x, y, w, h, color });
      return b.row(x, x + w - 1, y, color === 'w' ? SEMIW : SEMI);
    },
    // an enemy standing on row `y` (its feet on that row's top)
    foe(k, x, y = L.G, extra = {}) { L.enemies.push({ k, x: x * TS, y: y * TS, i: L.enemies.length, ...extra }); return b; },
    deco(k, x, y = L.G, extra = {}) { L.decor.push({ k, x, y, ...extra }); return b; },
    stairs(x0, n, t = WOOD, dir = 1) { for (let k = 0; k < n; k++) { const x = dir > 0 ? x0 + k : x0 + n - 1 - k; b.fill(x, L.G - 1 - k, x, L.G - 1, t); } return b; },
  };
  return b;
}

// ---------- 1-1: the plain ----------
function plain() {
  const b = mk(184, 27, 'grass', '1-1', 'la plaine'), L = b.L, G = L.G;
  b.ground(0, 30);
  b.deco('bush', 2).deco('hill', 6, G, { big: 1 }).deco('bush', 24, G, { n: 2 });
  b.set(8, 21, QB, 'coin').set(11, 21, QB, 'pow').set(12, 21, BRK).set(13, 21, QB, 'coin');
  b.foe('gb', 16);
  b.big(18, 22, 4, 3, 'p').big(21, 20, 3, 5, 'b');
  b.coins(21, 23, 18);
  b.foe('gb', 26).foe('kp', 29);
  // a pit, then the portal lesson: a white floor under your feet, a white ceiling over the ledge
  b.ground(34, 66);
  b.pipe(37, 23, 'pp');
  b.foe('gb', 43);
  b.fill(46, 18, 55, 19, GND);
  b.fill(46, 14, 57, 15, WOOD).row(53, 55, 15, WHITE).set(48, 15, QB, 'leaf');
  b.coins(49, 52, 17);
  b.row(58, 61, G, WHITE);
  b.deco('sign', 63, G, { s: 'gun' });
  b.foe('kp', 64);
  // note blocks over a pit
  b.row(69, 76, 22, NOTE).set(72, 18, QB, 'coin');
  b.ground(78, 108);
  b.deco('hill', 80).deco('bush', 100, G, { n: 3 });
  b.set(82, 22, SNOTE);
  b.foe('kw', 88);
  b.pipe(91, 22);
  b.foe('gb', 95).foe('gb', 97);
  b.pipe(100, 21, 'pp');
  b.row(103, 107, 21, BRK).set(105, 21, QB, 'pow');
  L.cp = 86;
  // up in the sky: clouds and coins, for the leaf and the super note
  b.row(80, 90, 6, CLOUD).coins(81, 89, 4);
  b.row(93, 101, 5, CLOUD).coins(94, 100, 3);
  b.row(104, 114, 7, CLOUD).coins(105, 113, 5);
  b.row(117, 128, 6, CLOUD).coins(118, 127, 4);
  b.row(131, 138, 8, CLOUD).coins(132, 137, 6);
  // the hill and the stairs to the end
  b.ground(111, 150);
  b.hill(115, 4, 6);
  b.foe('gb', 121, G - 4).foe('gb', 123, G - 4);
  b.set(122, 17, QB, 'pow');
  b.foe('kr', 136).foe('gb', 140);
  b.stairs(142, 5);
  b.ground(155, 183);
  b.deco('bush', 158, G, { n: 2 });
  L.goal = 170;
  return L;
}

// ---------- 1-2: the hills and the pipes ----------
function hills() {
  const b = mk(176, 20, 'grass', '1-2', 'les collines'), L = b.L, G = L.G;
  b.ground(0, 34);
  b.deco('hill', 1, G, { big: 1 });
  b.hill(6, 3, 4);
  b.set(10, 11, QB, 'coin').set(11, 11, QB, 'pow');
  b.foe('gb', 11, G - 3);
  b.pipe(19, 16, 'pp');
  b.foe('gb', 23).foe('gb', 25);
  b.hill(27, 2, 2);
  b.deco('bush', 31, G);
  b.ground(38, 71);
  b.hill(40, 6, 10);
  b.row(47, 51, 8, BRK).set(49, 8, QB, 'pow');
  b.coins(41, 44, 12);
  b.foe('gb', 47, G - 6).foe('gb', 50, G - 6).foe('gb', 53, G - 6).foe('kp', 60);
  // the canyon: the last hill stops dead at its edge, the far floor is white
  b.hill(62, 6, 6, false);
  b.row(70, 73, G - 6, WHITE);
  b.deco('sign', 69, G - 6, { s: 'gun' });
  b.ground(84, 124);
  b.row(84, 88, G, WHITE);
  L.cp = 90;
  b.pipe(94, 15, 'pf');
  b.pipe(100, 14);
  b.pipe(106, 15, 'pp');
  b.foe('kp', 111).foe('gb', 114).foe('gb', 116);
  b.coins(101, 103, 10);
  b.hill(118, 4, 3);
  b.ground(124, 175);
  b.foe('kw', 136);
  b.row(134, 139, 13, WOOD).set(136, 13, QB, 'coin').set(137, 13, QB, 'pow');
  b.pipe(143, 16, 'pf');
  b.foe('gb', 148).foe('gb', 150);
  b.stairs(152, 4);
  b.deco('bush', 160, G, { n: 2 });
  L.goal = 164;
  return L;
}

// ---------- 1-3: the big blocks, and the white one ----------
function blocks() {
  const b = mk(170, 15, 'grass', '1-3', 'les blocs blancs'), L = b.L, G = L.G;
  b.ground(0, 42);
  b.big(6, 10, 4, 3, 'w');
  b.deco('sign', 4, G, { s: 'duck' });
  b.set(12, 8, QB, 'coin');
  b.big(14, 11, 3, 2, 'p').big(16, 9, 3, 4, 'g').big(19, 7, 3, 6, 'b');
  b.coins(19, 21, 5);
  b.foe('gb', 25).foe('kp', 29);
  b.big(31, 9, 5, 4, 'o');
  b.set(33, 5, QB, 'pow');
  b.ground(46, 92);
  b.row(50, 53, 9, NOTE);
  b.coins(50, 53, 5);
  b.foe('kw', 57).foe('gb', 61).foe('gb', 63);
  b.big(65, 10, 6, 3, 'p').big(69, 7, 4, 6, 'w');
  b.coins(69, 72, 5);
  b.pipe(77, 10, 'pp');
  b.foe('kr', 83);
  b.big(85, 8, 3, 5, 'g');
  L.cp = 97;
  b.ground(96, 169);
  b.foe('gb', 101).foe('kp', 106);
  b.row(103, 107, 8, BRK).set(105, 8, QB, 'pow');
  b.big(110, 9, 4, 4, 'b');
  // the hedge: too tall to jump. Fly over it, portal through it (the beam goes through leaves),
  // or come from behind the scenery
  b.row(117, 120, G, WHITE);
  b.fill(123, 3, 124, G - 1, HEDGE);
  b.row(128, 131, G, WHITE);
  b.coins(126, 127, 11);
  b.foe('gb', 136).foe('gb', 139);
  b.big(142, 10, 5, 3, 'o').big(145, 7, 3, 6, 'b');
  b.deco('bush', 150, G, { n: 3 });
  L.goal = 156;
  return L;
}

// ---------- 1-4: the sky, scrolling on its own ----------
function sky() {
  const b = mk(196, 15, 'sky', '1-4', 'dans les nuages'), L = b.L, G = L.G;
  L.auto = .55;
  b.ground(0, 14);
  const isle = (x0, x1, y, t = GND) => { b.fill(x0, y, x1, y + 1, t); return b; };
  b.row(17, 21, 10, CLOUD).coins(17, 21, 8);
  isle(24, 29, 9, WOOD).foe('gb', 27, 9);
  b.row(32, 35, 7, CLOUD).row(38, 41, 5, CLOUD).coins(38, 41, 3);
  isle(44, 52, 10);
  b.set(47, 6, QB, 'pow').set(48, 6, BRK).set(49, 6, QB, 'coin');
  b.foe('kw', 51, 10);
  // a white island up high, a white island far below: the portal is quicker than the screen
  isle(56, 60, 5, WOOD).row(57, 60, 5, WHITE);
  isle(69, 74, 11, WOOD).row(70, 73, 11, WHITE);
  b.row(62, 66, 8, CLOUD);
  b.foe('pg', 72, 11);
  b.row(77, 80, 9, CLOUD).row(83, 86, 7, CLOUD).row(89, 92, 9, CLOUD).coins(83, 86, 5);
  b.foe('kw', 85, 7);
  L.cp = 96;
  isle(95, 104, 10);
  b.row(98, 101, 6, NOTE);
  b.foe('gb', 100, 10).foe('gb', 102, 10);
  b.row(107, 110, 8, CLOUD);
  isle(113, 118, 6, WOOD).row(114, 117, 6, WHITE);
  isle(126, 131, 11, WOOD).row(127, 130, 11, WHITE);
  b.row(120, 123, 10, CLOUD).coins(120, 123, 8);
  b.foe('pg', 129, 11).foe('kw', 124, 10);
  b.row(134, 137, 9, CLOUD).row(140, 143, 7, CLOUD).row(146, 149, 9, CLOUD);
  b.foe('kw', 142, 7);
  isle(152, 160, 10);
  b.set(155, 6, QB, 'pow').coins(152, 160, 8);
  b.row(163, 166, 8, CLOUD).row(169, 171, 10, CLOUD);
  b.ground(174, 195);
  L.goal = 184;
  return L;
}

// ---------- 1-5: the fortress and its brute ----------
function fortress() {
  const b = mk(170, 15, 'fort', '1-5', 'la forteresse'), L = b.L, G = L.G;
  b.fill(0, 0, 169, 1, STONE);
  b.ground(0, 24, G, STONE);
  b.fill(10, 2, 24, 7, STONE);
  b.foe('db', 14);
  b.foe('tw', 20, 8);
  b.row(28, 31, G, LAVA).row(28, 31, G + 1, LAVA);
  b.foe('pd', 29.5, G);
  b.ground(32, 60, G, STONE);
  b.row(38, 40, G - 1, SPIKE);
  b.fill(36, 2, 44, 6, STONE);
  b.foe('tw', 39, 7);
  b.set(47, 8, QB, 'pow');
  b.foe('db', 52).foe('db', 56);
  b.fill(50, 2, 60, 5, STONE);
  // the lava lake under a low ceiling: little islands, white ceilings to drop from
  b.fill(61, 2, 104, 8, STONE);
  b.row(57, 60, G, WHITE);
  b.row(61, 103, G, LAVA).row(61, 103, G + 1, LAVA);
  for (const x of [65, 73, 81, 89, 97]) { b.ground(x, x + 1, G - 1, STONE); b.row(x, x + 1, G - 1, WHITE).row(x, x + 1, 8, WHITE); }
  b.foe('pd', 69, G).foe('pd', 77, G).foe('pd', 85, G).foe('pd', 93, G).foe('pd', 101, G);
  L.cp = 106;
  b.ground(104, 169, G, STONE);
  b.row(104, 107, G, WHITE);
  b.foe('db', 112).foe('tw', 116, 5);
  b.fill(114, 2, 118, 4, STONE);
  b.row(120, 122, G - 1, SPIKE);
  b.set(126, 8, QB, 'pow');
  b.foe('db', 128);
  b.deco('door', 136, G);
  // the brute's room
  b.fill(140, 2, 169, 2, STONE);
  b.fill(169, 2, 169, G - 1, STONE);
  L.boss = { x0: 142, x1: 168 };
  b.foe('bb', 160);
  L.goal = 155;
  return L;
}

export const LEVELS = [plain, hills, blocks, sky, fortress];
export const LEVEL_NAMES = ['1-1 · la plaine', '1-2 · les collines', '1-3 · les blocs blancs', '1-4 · dans les nuages', '1-5 · la forteresse'];
export const buildLevel = (n) => LEVELS[n]();
