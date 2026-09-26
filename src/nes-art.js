// nes-art.js, the pixels of "super creuseur": a small NES-like palette, sprites from string maps, a 5×7 font.
export const PAL = {
  K: '#000000', W: '#fcfcfc', w: '#bcbcbc', g: '#7c7c7c', q: '#404040',
  S: '#fcb890', D: '#503000', d: '#b0643a', n: '#f0a860', B: '#7c2c08',
  Y: '#f8b800', O: '#ac7c00', y: '#fce0a8',
  b: '#c84c0c', R: '#d82800', r: '#fc7460',
  E: '#b8f818', G: '#00a800', F: '#005800',
  T: '#00a0a0', t: '#78f0e8', M: '#005058',
  U: '#2038ec', u: '#6cc4fc', C: '#5c94fc', c: '#a4e4fc',
  H: '#6c4c3c', h: '#a4847c', X: '#f878a8', x: '#fcc4d8', V: '#8038c0',
};

export const shade = (hex, f) => {
  const n = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
export const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  return [c, x];
}
// rows of letters → a canvas; `extra` maps more letters (or overrides) to colours
export function sprite(rows, extra = {}, w = 16) {
  const [c, x] = canvas(w, rows.length);
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (!ch || ch === '.') continue;
      const col = extra[ch] ?? PAL[ch];
      if (!col) continue;
      x.fillStyle = col; x.fillRect(i, j, 1, 1);
    }
  });
  return c;
}
export function flipped(src) {
  const [c, x] = canvas(src.width, src.height);
  x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  return c;
}

// ---------- the digger ----------
const SH = [
  '......YYYY......',
  '....YYYYYYYW....',
  '...YYYYYYYYYYY..',
  '...OOOOOOOOOO...',
  '....DDSSSDSS....',
  '...DSSSSSDSSS...',
  '....SSSSSSSSSS..',
  '.....SSSSSSS....',
];
const SB = {
  stand: ['....WWPWWPW.....', '...WWWPPPPWW....', '..SSWPPPPPPSS...', '..SS.PPPPPP.SS..', '.....PPPPPP.....', '....PPP..PPP....', '...BBB....BBB...', '..BBBB....BBBB..'],
  walkA: ['....WWPWWPW.....', '...WWWPPPPWWS...', '..SWWPPPPPP.SS..', '..SS.PPPPPPP....', '....PPPPPPPPP...', '...PPP....PPP...', '..BBB......BBB..', '.BBBB......BBBB.'],
  walkB: ['....WWPWWPW.....', '...WWWPPPPW.....', '...SWPPPPPS.....', '...SSPPPPPSS....', '.....PPPPP......', '.....PPPP.......', '....BBBBB.......', '....BBBBBB......'],
  walkC: ['....WWPWWPW.....', '...WWWPPPPWW....', '...SWPPPPPPS....', '...SSPPPPPPSS...', '....PPPPPPPP....', '....PPP..PPP....', '...BBB...BBB....', '...BBBB..BBBB...'],
  jump: ['....WWPWWPW.SS..', '...WWWPPPPWWSS..', '..SSWPPPPPPW....', '..SS.PPPPPPP....', '.....PPPPPPPPBB.', '....PPP....PBBB.', '...BBB......BB..', '...BB...........'],
  skid: ['...SWWPWWPW.....', '..SSWWPPPPWW....', '..SWWPPPPPPSS...', '.....PPPPPPSS...', '....PPPPPPPP....', '...PPPP..PPP....', '..BBBB....BBB...', '..BBB.....BBBB..'],
};
const DEAD = [
  '..SS..YYYY..SS..', '..SSYYYYYYYYSS..', '..SYYYYWWYYYYS..', '..SOOOOOOOOOOS..',
  '..SSDSSSSSSDSS..', '...SSKSSSSKSS...', '...SSSSSSSSSS...', '....SSSKKSSS....',
  '....WWPWWPWW....', '...WWWPPPPWWW...', '...WWPPPPPPWW...', '.....PPPPPP.....',
  '.....PPPPPP.....', '....PPP..PPP....', '...BBB....BBB...', '...BBB....BBB...',
];
const BH = [
  '..DD............', '..DY..YYYYY.....', '..DYYYYYYYYYW...', '...YYYYYYYYYYW..', '..YYYYYYYYYYYYY.', '..OOOOOOOOOOOO..',
  '...DDDSSSSDSS...', '..DDDSSSSSDSSS..', '..DDSSSSSSSSSSS.', '...DSSSSSSSSSS..', '....SSSSSSBBS...', '......SSSSS.....',
];
const BA = {
  stand: ['...WWWPWWWPW....', '..WWWWWPWWPWW...', '.WWWWWWPPPPWWW..', '.WWWWWPPPPPPWWW.', '.SSWWPPPPPPPPWSS', '.SSSPPPPPPPPPSSS', '.SS.PPPYPPYPP.SS'],
  walk: ['...WWWPWWWPW....', '..WWWWWPWWPWW...', '..WWWWWPPPPWW...', '..WWWWPPPPPPW...', '..SSWPPPPPPPP...', '..SSSPPPPPPPP...', '...SSPPYPPYPP...'],
  jump: ['...WWWPWWWPW.SS.', '..WWWWWPWWPWWSS.', '.WWWWWWPPPPWWW..', '.WWWWWPPPPPPPW..', '.SSWWPPPPPPPP...', '.SSSPPPPPPPPP...', '.SS.PPPYPPYPP...'],
};
const BL = {
  stand: ['....PPPPPPPPP...', '....PPPPPPPPP...', '....PPPPPPPPP...', '....PPPPPPPPP...', '....PPPP.PPPP...', '....PPPP.PPPP...', '....PPPP.PPPP...', '....PPP...PPP...', '....PPP...PPP...', '....PPP...PPP...', '...BBBB...BBBB..', '..BBBBB...BBBBB.', '..BBBBB...BBBBB.'],
  stride: ['....PPPPPPPPP...', '....PPPPPPPPPP..', '...PPPPPPPPPPP..', '...PPPP...PPPP..', '..PPPP.....PPP..', '..PPP......PPPP.', '.PPP........PPP.', '.PPP........PPP.', '.PPP........PPP.', 'BBB.........BBB.', 'BBBB........BBBB', 'BBBB........BBBB', 'BBB..........BBB'],
  pass: ['....PPPPPPPPP...', '....PPPPPPPPP...', '....PPPPPPPPP...', '.....PPPPPPP....', '.....PPPPPP.....', '.....PPPPPP.....', '.....PPPPP......', '.....PPPPP......', '.....PPPPP......', '.....PPPP.......', '....BBBBBB......', '....BBBBBBB.....', '....BBBBBBB.....'],
  jump: ['....PPPPPPPPP...', '....PPPPPPPPPP..', '...PPPPP..PPPPP.', '...PPPP....PPPPB', '..PPPP......BBBB', '..PPP........BBB', '.PPP............', '.PPP............', 'BBBB............', 'BBBB............', 'BBB.............', '................', '................'],
};
// frames: 0 stand, 1-3 walk, 4 jump, 5 skid, 6 dead
const heroCache = new Map();
export function hero(color, power) {
  const key = color + ':' + power;
  if (heroCache.has(key)) return heroCache.get(key);
  const ex = { P: hexOf(color), p: shade(color, .6) };
  if (power === 2) Object.assign(ex, { Y: PAL.W, O: PAL.w, W: PAL.n });
  let frames;
  if (!power) frames = ['stand', 'walkA', 'walkB', 'walkC', 'jump', 'skid'].map((k) => sprite([...SH, ...SB[k]], ex));
  else {
    const f = (a, l) => sprite([...BH, ...BA[a], ...BL[l]], ex);
    frames = [f('stand', 'stand'), f('walk', 'stride'), f('stand', 'pass'), f('walk', 'stride'), f('jump', 'jump'), f('jump', 'stride')];
  }
  frames.push(sprite(DEAD, ex));
  const out = { r: frames, l: frames.map(flipped) };
  heroCache.set(key, out);
  return out;
}

// ---------- enemies and items ----------
const MOLE = ['......YYYY......', '.....YYYYYY.....', '....OOOOOOOO....', '...HHHHHHHHHH...', '..HHhHHHHHHhHH..', '..HHKHHHHHHKHH..', '.HHHHHHXXHHHHHH.', '.HHHHHXXXXHHHHH.', '.HHhhHHXXHHhhHH.', '.HHhhhhhhhhhhHH.', '..HhhhhhhhhhhH..', '..HHhhhhhhhhHH..', '...HHHHHHHHHH...'];
const MOLE_A = ['..XXX......XXX..', '.XXXX......XXXX.'], MOLE_B = ['...XXX....XXX...', '...XXXX..XXXX...'];
const MOLE_FLAT = ['................', '................', '................', '................', '................', '................', '................', '................',
  '....YYYYYYYY....', '..HHHHHHHHHHHH..', '.HHKHHHXXHHHKHH.', 'HHHHHHXXXXHHHHHH', 'HhhhhhhhhhhhhhhH', '.HhhhhhhhhhhhhH.', '.XXXX......XXXX.', '................'];
const BEETLE = ['................', '................', '................', '......UUUUU.....', '....UUuuUUUUU...', '...UUuuUUUUUUU..', '..UUuUUUUUUUUUU.', '..UUUUUUUUUUUUU.', '.KUUUUUUUUUUUUU.', 'KKKUUUUUUUUUUUU.', 'KWKKUUUUUUUUUUK.', 'KKKKKKKKKKKKKKK.', '.KKKwwwwwwwwwKK.'];
const BEETLE_A = ['...K.K..K.K..K..', '..K..K.K..K..K..', '..K...K...K...K.'];
const BEETLE_B = ['...K..K..K..K...', '...K..K..K..K...', '....K..K..K..K..'];
const SHELL = ['................', '................', '................', '................', '................', '....UUUUUUUU....', '..UUuuUUUUUUUU..', '.UUuuUUUUUUUUUU.', '.UuUUUUUUUUUUUU.', 'UUUUUUUUUUUUUUUU', 'UUUUUUUKKUUUUUUU', 'UUUUUUUKKUUUUUUU', 'UUUUUUUUUUUUUUUU', 'KKKKKKKKKKKKKKKK', '.KwwwwwwwwwwwwK.', '..KKKKKKKKKKKK..'];
const CROW_A = ['................', '..........KK....', '........KKKK....', '.......KKKK.....', '......KKKK......', '..KKK.KKKK......', '.KWKKKKKK.......', 'YYKKKKKKKKK.....', '.YYKKKKKKKKKK...', '...KKKKKKKKKKKK.', '.....KKKKKKKgKKK', '......KKKKK...KK', '.......Y..Y.....', '................'];
const CROW_B = ['................', '................', '................', '................', '................', '..KKK...........', '.KWKKK..........', 'YYKKKKKKKKK.....', '.YYKKKKKKKKKK...', '...KKKKKKKKKKKK.', '.....KKKKKKKgKKK', '......KKKKKK..KK', '.......KKKKK....', '........KKKK....'];
const WORM = ['................', '.....XXXXXX.....', '....XXXXXXXX....', '...XXWKXXWKXX...', '...XXWKXXWKXX...', '...XXXXXXXXXX...', '...XXKKKKKKXX...', '...XXKRRRRKXX...', '....XXKKKKXX....', '.....XXXXXX.....'];
const WORM_SHUT = ['................', '.....XXXXXX.....', '....XXXXXXXX....', '...XXWKXXWKXX...', '...XXWKXXWKXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXKKKKXXX...', '....XXXXXXXX....', '.....XXXXXX.....'];
const WORM_BODY = ['.....xxxxxx.....', '......XXXX......', '.....XXXXXX.....'];
const SHOVEL = ['................', '......YYYY......', '.....YyyYYY.....', '.....YyYYYY.....', '.....YYYYYY.....', '.....OYYYYO.....', '......OYYO......', '.......OO.......', '.......DD.......', '.......DD.......', '.......DD.......', '.......DD.......', '.......DD.......', '.....DDDDDD.....', '.....D....D.....', '.....DDDDDD.....'];
const MOTTE = ['................', '.......E........', '......EGE.......', '..E...EGE...E...', '..EE..EGE..EE...', '...EEE.G.EEE....', '.....EEGEE......', '.......G........', '....dddddddd....', '...ddnddddDdd...', '..ddddddnddddd..', '..dDddddddddnd..', '..dddnddDddddd..', '...dddddddddd...', '....DDDDDDDD....', '................'];
const CLOD = ['..dddd..', '.dnnddd.', 'dnnddddd', 'dnddddDd', 'ddddddDd', 'ddddDDDd', '.dDDDDd.', '..dddd..'];
const COIN = [
  ['.....OOOOO......', '....OYYYYYO.....', '...OYYWWYYYO....', '...OYWYYYYYO....', '...OYWYYOYYO....', '...OYWYYOYYO....', '...OYWYYOYYO....', '...OYWYYOYYO....', '...OYYYYOYYO....', '...OYYYYYYYO....', '....OYYYYYO.....', '.....OOOOO......'],
  ['......OOO.......', '.....OYYYO......', '.....OYWYO......', '.....OWYYO......', '.....OWYOO......', '.....OWYOO......', '.....OWYOO......', '.....OWYOO......', '.....OYYOO......', '.....OYYYO......', '.....OYYYO......', '......OOO.......'],
  ['.......O........', '.......O........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......O........', '.......O........'],
];

export function buildArt() {
  const A = {};
  const mole = (feet) => sprite(['................', ...MOLE, ...feet]);
  A.mole = [mole(MOLE_A), mole(MOLE_B)];
  A.moleFlat = sprite(MOLE_FLAT);
  A.beetle = [sprite([...BEETLE, ...BEETLE_A]), sprite([...BEETLE, ...BEETLE_B])];
  A.beetleR = A.beetle.map(flipped);
  A.shell = sprite(SHELL);
  A.crow = [sprite(CROW_A), sprite(CROW_B)];
  A.crowR = A.crow.map(flipped);
  const body = [];
  for (let n = 0; n < 5; n++) body.push(...WORM_BODY);
  A.worm = [sprite([...WORM, ...body].slice(0, 24)), sprite([...WORM_SHUT, ...body].slice(0, 24))];
  A.shovel = sprite(SHOVEL);
  A.motte = [sprite(MOTTE), sprite(MOTTE, { E: PAL.Y, G: PAL.b }), sprite(MOTTE, { E: PAL.c, G: PAL.U })];
  A.clod = [sprite(CLOD, {}, 8), flipped(sprite(CLOD, {}, 8))];
  const pad = (r) => ['', '', ...r, '', ''].map((s) => s.padEnd(16, '.'));
  const coin = COIN.map((r) => sprite(pad(r)));
  A.coinSpin = [coin[0], coin[1], coin[2], flipped(coin[1])];
  A.coin = [coin[0], sprite(pad(COIN[0]), { Y: PAL.n, O: PAL.b }), sprite(pad(COIN[0]), { Y: PAL.b, O: PAL.B })];
  A.coinHud = sprite(['.OOO.', 'OYWYO', 'OYWYO', 'OYYOO', 'OYYOO', 'OYYOO', '.OOO.'], {}, 5);
  // tiles
  A.dirt = tileDirt(false); A.grass = tileDirt(true);
  A.brick = tileBrick();
  A.q = [tileQ(PAL.Y), tileQ(PAL.n), tileQ(PAL.O)];
  A.used = tileUsed();
  A.stone = tileStone();
  A.pipe = tilePipe();
  A.castleBrick = tileBrick('#9c9c9c', '#505050', '#dcdcdc');
  A.cloud = decoCloud(); A.bush = decoBush(); A.hill = decoHill(false); A.hillBig = decoHill(true);
  A.debris = sprite(['.bb.', 'bbbD', 'bDbD', '.DD.'], {}, 4);
  return A;
}

function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function tileDirt(grass) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = PAL.d; x.fillRect(0, 0, 16, 16);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const h = hash(i + 3, j + 7);
    if (h < .07) { x.fillStyle = PAL.D; x.fillRect(i, j, 1, 1); }
    else if (h < .1) { x.fillStyle = PAL.n; x.fillRect(i, j, 2, 1); }
  }
  // two pebbles and a crack, the same in every tile, like the NES
  x.fillStyle = PAL.n; x.fillRect(3, 9, 3, 2); x.fillRect(11, 3, 2, 2);
  x.fillStyle = PAL.D; x.fillRect(3, 11, 3, 1); x.fillRect(11, 5, 2, 1); x.fillRect(8, 12, 1, 3); x.fillRect(9, 14, 2, 1);
  if (grass) {
    x.fillStyle = PAL.G; x.fillRect(0, 0, 16, 4);
    x.fillStyle = PAL.E; x.fillRect(0, 0, 16, 2);
    for (let i = 0; i < 16; i++) {
      const h = 4 + ((i * 7) % 3 === 0 ? 1 : 0) + (i % 5 === 2 ? 1 : 0);
      x.fillStyle = PAL.G; x.fillRect(i, 3, 1, h - 3);
      x.fillStyle = PAL.F; x.fillRect(i, h, 1, 1);
    }
  }
  return c;
}
function tileBrick(base = PAL.b, mortar = PAL.D, hi = '#fc9870') {
  const [c, x] = canvas(16, 16);
  x.fillStyle = base; x.fillRect(0, 0, 16, 16);
  x.fillStyle = hi; x.fillRect(0, 0, 16, 1);
  x.fillStyle = mortar;
  for (const j of [3, 7, 11, 15]) x.fillRect(0, j, 16, 1);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 3 : 11;
    x.fillRect(off, r * 4, 1, 3);
    if (r % 2) x.fillRect(off + 8, r * 4, 1, 3);
  }
  x.fillStyle = hi;
  for (let r = 1; r < 4; r++) x.fillRect(0, r * 4, 16, 1);
  x.fillStyle = mortar; for (const j of [3, 7, 11, 15]) x.fillRect(0, j, 16, 1);
  return c;
}
function tileQ(base) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = PAL.B; x.fillRect(0, 0, 16, 16);
  x.fillStyle = base; x.fillRect(1, 1, 14, 14);
  x.fillStyle = PAL.y; x.fillRect(1, 1, 14, 1); x.fillRect(1, 1, 1, 14);
  x.fillStyle = PAL.O; x.fillRect(1, 14, 14, 1); x.fillRect(14, 1, 1, 14);
  x.fillStyle = PAL.B; for (const [i, j] of [[2, 2], [13, 2], [2, 13], [13, 13]]) x.fillRect(i, j, 1, 1);
  // a little gem in the middle: ours, not a question mark
  const gem = ['..BBBBBB..', '.BWyBByyB.', 'BWyyByyyyB', 'BBBBBBBBBB', '.ByyyyyyB.', '..ByyyyB..', '...ByyB...', '....BB....'];
  x.drawImage(sprite(gem, {}, 10), 3, 4);
  return c;
}
function tileUsed() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = PAL.B; x.fillRect(0, 0, 16, 16);
  x.fillStyle = PAL.b; x.fillRect(1, 1, 14, 14);
  x.fillStyle = PAL.B; x.fillRect(2, 2, 12, 12);
  x.fillStyle = PAL.b; for (const [i, j] of [[3, 3], [12, 3], [3, 12], [12, 12]]) x.fillRect(i, j, 1, 1);
  return c;
}
function tileStone() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = PAL.g; x.fillRect(0, 0, 16, 16);
  x.fillStyle = PAL.W; x.fillRect(0, 0, 15, 1); x.fillRect(0, 0, 1, 15);
  x.fillStyle = PAL.w; x.fillRect(1, 1, 14, 14);
  x.fillStyle = PAL.q; x.fillRect(1, 15, 15, 1); x.fillRect(15, 1, 1, 15);
  x.fillStyle = PAL.g; x.fillRect(3, 3, 10, 1); x.fillRect(3, 3, 1, 10);
  x.fillStyle = PAL.W; x.fillRect(4, 12, 9, 1); x.fillRect(12, 4, 1, 9);
  return c;
}
function tilePipe() {
  // 32×16 lip and 28-wide body; tiles take their half. Rivets and rust: a garden drain, not a warp pipe
  const stripe = [PAL.T, PAL.t, PAL.t, PAL.T, PAL.T, PAL.T, PAL.T, PAL.t, PAL.T, PAL.T, PAL.T, PAL.T, PAL.M, PAL.T, PAL.M, PAL.M];
  const cols = (x, h, l, r) => {
    for (let i = l; i < r; i++) { x.fillStyle = i === l || i === r - 1 ? PAL.K : stripe[Math.floor((i - l - 1) * stripe.length / (r - l - 2))]; x.fillRect(i, 0, 1, h); }
  };
  const [top, tx] = canvas(32, 16); cols(tx, 16, 0, 32);
  tx.fillStyle = PAL.K; tx.fillRect(0, 0, 32, 1); tx.fillRect(0, 15, 32, 1);
  tx.fillStyle = PAL.M; for (const i of [5, 26]) tx.fillRect(i, 7, 2, 2);
  const [body, bx] = canvas(32, 16); cols(bx, 16, 2, 30);
  bx.fillStyle = PAL.M; bx.fillRect(9, 5, 1, 1); bx.fillRect(21, 11, 1, 1);
  return { top, body };
}
function circles(x, list, col) { x.fillStyle = col; for (const [cx, cy, r] of list) for (let j = -r; j <= r; j++) { const w = Math.floor(Math.sqrt(r * r - j * j)); x.fillRect(cx - w, cy + j, w * 2 + 1, 1); } }
function decoCloud() {
  const [c, x] = canvas(48, 24);
  const blobs = [[10, 15, 7], [21, 10, 9], [33, 13, 8], [40, 17, 6], [24, 17, 7]];
  circles(x, blobs.map(([a, b, r]) => [a, b, r + 1]), PAL.K);
  circles(x, blobs, PAL.c);
  circles(x, blobs.map(([a, b, r]) => [a - 1, b - 2, r - 1]), PAL.W);
  x.clearRect(0, 22, 48, 2);
  return c;
}
function decoBush() {
  const [c, x] = canvas(48, 16);
  const blobs = [[9, 13, 7], [20, 10, 9], [32, 11, 8], [41, 14, 6]];
  circles(x, blobs.map(([a, b, r]) => [a, b, r + 1]), PAL.F);
  circles(x, blobs, PAL.G);
  circles(x, blobs.map(([a, b, r]) => [a - 2, b - 3, Math.max(1, r - 5)]), PAL.E);
  return c;
}
function decoHill(big) {
  const w = big ? 80 : 48, h = big ? 38 : 22;
  const [c, x] = canvas(w, h);
  for (let j = 0; j < h; j++) {
    const t = j / h, half = Math.round((w / 2) * Math.sqrt(1 - (1 - t) * (1 - t)));
    x.fillStyle = PAL.F; x.fillRect(w / 2 - half - 1, j, half * 2 + 2, 1);
    x.fillStyle = PAL.G; x.fillRect(w / 2 - half, j, half * 2, 1);
  }
  x.fillStyle = PAL.F;
  for (const [i, j] of big ? [[30, 14], [46, 20], [36, 26], [52, 30]] : [[20, 10], [28, 15]]) { x.fillRect(i, j, 3, 1); x.fillRect(i + 1, j - 1, 1, 3); }
  return c;
}

// ---------- the font: 5×7 columns, bit 0 at the top ----------
const GLYPHS = {
  A: [0x7E, 0x11, 0x11, 0x11, 0x7E], B: [0x7F, 0x49, 0x49, 0x49, 0x36], C: [0x3E, 0x41, 0x41, 0x41, 0x22], D: [0x7F, 0x41, 0x41, 0x22, 0x1C],
  E: [0x7F, 0x49, 0x49, 0x49, 0x41], F: [0x7F, 0x09, 0x09, 0x09, 0x01], G: [0x3E, 0x41, 0x49, 0x49, 0x7A], H: [0x7F, 0x08, 0x08, 0x08, 0x7F],
  I: [0x00, 0x41, 0x7F, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3F, 0x01], K: [0x7F, 0x08, 0x14, 0x22, 0x41], L: [0x7F, 0x40, 0x40, 0x40, 0x40],
  M: [0x7F, 0x02, 0x0C, 0x02, 0x7F], N: [0x7F, 0x04, 0x08, 0x10, 0x7F], O: [0x3E, 0x41, 0x41, 0x41, 0x3E], P: [0x7F, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3E, 0x41, 0x51, 0x21, 0x5E], R: [0x7F, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7F, 0x01, 0x01],
  U: [0x3F, 0x40, 0x40, 0x40, 0x3F], V: [0x1F, 0x20, 0x40, 0x20, 0x1F], W: [0x3F, 0x40, 0x38, 0x40, 0x3F], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  0: [0x3E, 0x51, 0x49, 0x45, 0x3E], 1: [0x00, 0x42, 0x7F, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46], 3: [0x21, 0x41, 0x45, 0x4B, 0x31],
  4: [0x18, 0x14, 0x12, 0x7F, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39], 6: [0x3C, 0x4A, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03],
  8: [0x36, 0x49, 0x49, 0x49, 0x36], 9: [0x06, 0x49, 0x49, 0x29, 0x1E],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00], '.': [0x00, 0x60, 0x60, 0x00, 0x00], '!': [0x00, 0x00, 0x5F, 0x00, 0x00], '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '×': [0x00, 0x22, 0x14, 0x08, 0x14], '/': [0x20, 0x10, 0x08, 0x04, 0x02], '?': [0x02, 0x01, 0x51, 0x09, 0x06], "'": [0x00, 0x05, 0x03, 0x00, 0x00],
  ',': [0x00, 0x50, 0x30, 0x00, 0x00], '+': [0x08, 0x08, 0x3E, 0x08, 0x08], '(': [0x00, 0x1C, 0x22, 0x41, 0x00], ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
  '"': [0x00, 0x07, 0x00, 0x07, 0x00], '#': [0x14, 0x7F, 0x14, 0x7F, 0x14],
};
const atlases = new Map();
function atlas(color) {
  if (atlases.has(color)) return atlases.get(color);
  const keys = Object.keys(GLYPHS);
  const [c, x] = canvas(keys.length * 6, 8);
  x.fillStyle = color;
  keys.forEach((k, n) => GLYPHS[k].forEach((col, i) => { for (let j = 0; j < 7; j++) if (col >> j & 1) x.fillRect(n * 6 + i, j, 1, 1); }));
  const a = { c, idx: Object.fromEntries(keys.map((k, n) => [k, n])) };
  atlases.set(color, a);
  return a;
}
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const textW = (s, sc = 1) => norm(s).length * 6 * sc - sc;
// draws text (upper case, accents dropped); shadow: a dark copy one pixel down-right
export function text(ctx, s, x, y, color = PAL.W, sc = 1, shadow = null, align = 'left') {
  s = norm(s);
  if (align === 'center') x -= Math.floor(textW(s, sc) / 2); else if (align === 'right') x -= textW(s, sc);
  if (shadow) text(ctx, s, x + sc, y + sc, shadow, sc);
  const a = atlas(color);
  for (let n = 0; n < s.length; n++) {
    const g = a.idx[s[n]];
    if (g != null) ctx.drawImage(a.c, g * 6, 0, 5, 7, x + n * 6 * sc, y, 5 * sc, 7 * sc);
  }
}
