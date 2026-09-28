// marioportal-art.js, the pixels of « super portail »: original sprites from string maps (a miner with a
// portal gun, chestnuts on legs, turtles, pipe plants, a bony turtle, a stone face, the brute), the tiles
// of the plain, the sky and the fortress, the big bolted blocks and the backdrops. All drawn here.
import { PAL, canvas, sprite, flipped, hexOf, shade } from './nes-art.js';

// ---------- the miner: a helmet in the player's colour, a lamp, overalls ----------
const TOP_S = [
  '.....HHHHH......', '....HHHHHHHL....', '...hhhhhhhhhh...', '....SSSSKSS.....', '....SSSSKSSS....',
  '.....SSSSSS.....', '....WWOWWO......', '...WWWOOOWW.....', '..SSWOOOOOWSS...',
];
const LEGS_S = {
  stand: ['..SS.OOOOO.SS...', '.....OOOOO......', '....OOO.OOO.....', '....OO...OO.....', '...FFF...FFF....', '..FFFF...FFFF...', '................'],
  walk1: ['..S..OOOOO..S...', '....OOOOOOO.....', '...OOO...OOO....', '..OO......OO....', '.FFF......FFF...', '.FFFF.....FFFF..', '................'],
  walk2: ['...S.OOOOO.S....', '.....OOOOO......', '.....OOOOO......', '.....OO.OO......', '.....FFFFF......', '.....FFFFFF.....', '................'],
  jump: ['.SS..OOOOO..SS..', '.....OOOOOOO....', '....OOO..OOOFF..', '...OO......FFF..', '..FFF...........', '..FFFF..........', '................'],
  skid: ['..SS.OOOOO.SS...', '....OOOOOO......', '...OOO.OOO......', '..FFF...OO......', '..FFF...FFF.....', '.......FFFF.....', '................'],
};
const DEAD_S = [
  '................', '..SS.HHHHH.SS...', '..SSHHHHHHHSS...', '...hhhhhhhhh....', '...SSKSSSKSS....', '...SSSSSSSSS....', '....SSKKKSS.....',
  '....WWOWWOWW....', '...WWWOOOOWWW...', '.....OOOOOO.....', '.....OOOOOO.....', '....OOO..OOO....', '....FFF..FFF....', '...FFFF..FFFF...', '................', '................',
];
const HEAD_B = [
  '.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHL...', '..hhhhhhhhhhhh..', '...SSSSSSKSS....', '...SSSSSSKSSS...',
  '...SSSSSSSSSSS..', '....SSSSSKKKK...', '.....SSSSSS.....',
];
const TORSO_B = {
  stand: ['....WWOWWWOW....', '...WWWOWWWOWW...', '..WWWWOOOOOWWW..', '..WWWOOOOOOOWW..', '.SSWWOOYOOYOWSS.', '.SSS.OOOOOOO.SSS', '.SS..OOOOOOO..SS', '.....OOOOOOO....', '.....OOOOOOO....'],
  swing: ['....WWOWWWOW....', '...WWWOWWWOWW...', '..WWWWOOOOOWWW..', '..WWWOOOOOOOWWSS', '..SWWOOYOOYOW.SS', '..SS.OOOOOOO....', '.....OOOOOOO....', '.....OOOOOOO....', '.....OOOOOOO....'],
};
const LEGS_B = {
  stand: ['....OOOO.OOOO...', '....OOO...OOO...', '....OOO...OOO...', '....OOO...OOO...', '...FFFF...FFFF..', '..FFFFF...FFFFF.', '................'],
  walk1: ['...OOOO...OOOO..', '...OOO.....OOO..', '..OOO......OOO..', '..OOO.......OO..', '.FFFF......FFFF.', 'FFFFF......FFFFF', '................'],
  walk2: ['.....OOOOOO.....', '.....OOOOOO.....', '......OOOO......', '......OOOO......', '.....FFFFF......', '....FFFFFFF.....', '................'],
  jump: ['....OOOO.OOOOO..', '...OOO.....OOFF.', '..OOO.......FFF.', '..FFF........FF.', '.FFFF...........', '.FFF............', '................'],
  skid: ['....OOOOOOO.....', '...OOO..OOO.....', '..OOO....OOO....', '.FFF......OO....', '.FFF.....FFFF...', '.........FFFFF..', '................'],
};
const CROUCH_B = ['..WWWWOOOOOWWW..', '.SSWWOOYOOYOWSS.', '.SS.OOOOOOOO.SS.', '...FFFOOOOOFFF..', '..FFFFF..FFFFF..', '................'];

// frames: 0 stand, 1-2 walk, 3 jump, 4 skid, 5 dead, 6 crouch, 7 swing (tail or fire)
const heroCache = new Map();
export function heroFrames(color, form) {
  const key = color + ':' + form;
  if (heroCache.has(key)) return heroCache.get(key);
  const ex = { H: hexOf(color), h: shade(color, .62), L: PAL.Y, S: '#fcb890', O: '#2038a0', F: '#6c3410', W: '#fcfcfc', Y: '#f8d838', K: '#101010' };
  if (form === 2) Object.assign(ex, { O: '#d82800', W: '#fce0a8' });
  if (form === 3) Object.assign(ex, { O: '#6c4020', F: '#3a1c08' });
  let frames;
  if (!form) {
    const f = (k) => sprite([...TOP_S, ...LEGS_S[k]], ex);
    frames = [f('stand'), f('walk1'), f('walk2'), f('jump'), f('skid'), sprite(DEAD_S, ex), f('stand'), f('stand')];
  } else {
    const f = (t, l) => sprite([...HEAD_B, ...TORSO_B[t], ...LEGS_B[l]], ex);
    frames = [f('stand', 'stand'), f('stand', 'walk1'), f('swing', 'walk2'), f('swing', 'jump'), f('stand', 'skid'), sprite(DEAD_S, ex), sprite([...HEAD_B, ...CROUCH_B], ex), f('swing', 'stand')];
  }
  if (form === 3) frames = frames.map((c) => withEars(c));
  const out = { r: frames, l: frames.map(flipped) };
  heroCache.set(key, out);
  return out;
}
// the leaf: two round ears on the helmet
function withEars(src) {
  const [c, x] = canvas(src.width, src.height + 3);
  x.drawImage(src, 0, 3);
  x.fillStyle = '#6c4020'; x.fillRect(5, 0, 2, 4); x.fillRect(10, 0, 2, 4);
  x.fillStyle = '#e8a060'; x.fillRect(5, 1, 1, 2); x.fillRect(10, 1, 1, 2);
  return c;
}
// the striped tail, drawn from the hip: a = angle (0 down, 1 straight out)
export function drawTail(x, px, py, face, a) {
  const dir = -face;
  for (let k = 0; k < 7; k++) {
    const tx = px + dir * Math.round(k * (.4 + a * .7)), ty = py + Math.round(k * (1 - a) * .9) - Math.round(a * k * .15);
    x.fillStyle = k % 3 === 2 ? '#2a1408' : k > 4 ? '#f0d8a0' : '#9c6030';
    x.fillRect(tx, ty, 2, 3);
  }
}

// ---------- enemies ----------
const GB = [
  '.......EE.......', '......EE........', '.....DDDDDD.....', '...DDDDDDDDDD...', '..DDDDDDDDDDDD..', '.DDKKDDDDDDKKDD.',
  '.DDDWKKDDKKWDDD.', 'DDDDWKDDDDKWDDDD', 'DDDDDDDDDDDDDDDD', 'DDDDDKKKKKKDDDDD', '.dDDDDDDDDDDDDd.', '....yyyyyyyy....', '...yyyyyyyyyy...',
];
const GB_A = ['..KKK....yyy....', '.KKKKK...KKKK...', '.KKKKK..KKKKK...'], GB_B = ['....yyy....KKK..', '...KKKK...KKKKK.', '...KKKKK..KKKKK.'];
const GB_FLAT = ['.....DDDDDD.....', '..DDDDDDDDDDDD..', '.DDKWKDDDDKWKDD.', 'DDDDDDKKKKDDDDDD', '.dDDDDDDDDDDDDd.', '...yyyyyyyyyy...', '.KKKK......KKKK.'];
const KP = [
  '..........yyy...', '.........yyyyy..', '.........yWKyy..', '.........yWKyyy.', '........yyyyyyyy', '.........yyyyyy.', '..........yyyy..',
  '......GGGG.yyy..', '....GGEEGGG.yy..', '...GGEGGGGGGyy..', '..GGEGGGGGGGGy..', '..GGGGGGGGGGGG..', '.GGGGEEEGGGGGG..', '.GGGEGGGEGGGGG..',
  '.GGGGEEEGGGGGG..', '.WWWWWWWWWWWWW..', '..WWWWWWWWWWW...',
];
const KP_A = ['...yyyy..yyyy...', '..yyyyy..yyyyy..', '..KKKK...KKKKK..'], KP_B = ['....yyyyyyy.....', '....yyyyyy......', '...KKKKKKK......'];
const SHELL = [
  '................', '................', '................', '.....GGGGGG.....', '...GGEEGGGGGG...', '..GGEGGGGGGGGG..', '.GGEGGEEEEGGGGG.', '.GGGGEGGGGEGGGG.',
  'GGGGEGGGGGGEGGGG', 'GGGGGEGGGGEGGGGG', 'GGGGGGEEEEGGGGGG', 'WWWWWWWWWWWWWWWW', 'KWWWWWWWWWWWWWWK', '.KKKKKKKKKKKKKK.', '................', '................',
];
const WING = ['...WW...', '..WWWW..', '.WWWWWW.', 'WWWWWWW.', 'WWWWWW..', '.WWWW...'];
const PIR = [
  '....RRRRRRRR....', '...RRWRRRRWRR...', '..RRRRRRRRRRRR..', '..RWRRRRRRRRWR..', '..RRRRRRRRRRRR..', '...WWWWWWWWWW...', '...KKKKKKKKKK...',
  '...WWWWWWWWWW...', '..RRRRRRRRRRRR..', '..RRWRRRRRRWRR..', '...RRRRRRRRRR...', '.....RRRRRR.....', '.......GG.......', '..GGG..GG..GGG..',
  '.GGGGG.GG.GGGGG.', '..GGGGGGGGGGGG..', '.......GG.......', '.......GG.......', '.......GG.......', '.......GG.......', '.......GG.......',
  '.......GG.......', '.......GG.......', '.......GG.......',
];
const PIR_SHUT = ['................', '....RRRRRRRR....', '...RRWRRRRWRR...', '..RRRRRRRRRRRR..', '..RWRRRRRRRRWR..', '..RRRRRRRRRRRR..', '...RRRRRRRRRR...',
  '..RRWRRRRRRWRR..', '...RRRRRRRRRR...', '....RRRRRRRR....', '.....RRRRRR.....'];
const DB = [
  '..........www...', '.........wwwww..', '.........wKKww..', '.........wKKwww.', '........wwwwwwww', '.........wKwKw..', '..........www...',
  '......gggg.ww...', '....ggwwggg.w...', '...ggwgggggg....', '..ggwgggggggg...', '..gggggggggggw..', '.ggggwwwggggwww.', '.gggwgggwgggw...',
  '.ggggwwwggggw...', '.wwwwwwwwwwwww..', '..wwwwwwwwwww...',
];
const DB_PILE = ['................', '................', '..........www...', '.....www.wKKww..', '...wwgggwwwwww..', '..ggwggggww.....', '.gggggwgggg.www.', '.wwwwwwwwwwwww..', '.www.ww..www.ww.'];
const PODO = ['..YYYY..', '.YWWYYY.', 'YYWYYYRY', 'YYYYYRRY', 'RYYYRRRR', 'RRYRRRRR', '.RRRRRR.', '..RRRR..'];
const THWOMP = [
  '..gggggggggggggggggggg..', '.gwwwwwwwwwwwwwwwwwwwwg.', 'gwwwwwwwwwwwwwwwwwwwwwwg', 'gwgggwwwwwwwwwwwwwwgggwg', 'gwwwwwwwwwwwwwwwwwwwwwwg',
  'gwwwKKKKwwwwwwwwKKKKwwwg', 'gwwKKKKKKwwwwwwKKKKKKwwg', 'gwwwKKWKKwwwwwwKKWKKwwwg', 'gwwwwKKKwwwwwwwwKKKwwwwg', 'gwwwwwwwwwwwwwwwwwwwwwwg',
  'gwwwwwwwKKKKKKKKwwwwwwwg', 'gwwwwwwKWKWKWKWKKwwwwwwg', 'gwwwwwwKKKKKKKKKKwwwwwwg', 'gwwwwwwwwwwwwwwwwwwwwwwg', 'gwgggwwwwwwwwwwwwwwgggwg',
  'gwwwwwwwwwwwwwwwwwwwwwwg', '.gwwwwwwwwwwwwwwwwwwwwg.', '..gggggggggggggggggggg..',
];
const MUSH = ['.....RRRRRR.....', '...RRWWRRRRRR...', '..RRWWWWRRRWWR..', '.RRRWWWWRRWWWWR.', '.RRRRWWRRRRWWWR.', 'RRRRRRRRRRRRRRRR', 'RWWRRRRRRRRRRWWR',
  'WWWWRRRRRRRRWWWW', 'WWWRRRRRRRRRRWWW', '.RRyyyyyyyyyyRR.', '...yyyKyyKyyy...', '...yyyKyyKyyy...', '...yyyyyyyyyy...', '....yyyyyyyy....'];
const FLOWER = ['....YYYYYYYY....', '..YYRRRRRRRRYY..', '.YRRWWWWWWWWRRY.', 'YRRWWKWWWWKWWRRY', '.YRRWWWWWWWWRRY.', '..YYRRRRRRRRYY..', '....YYYYYYYY....',
  '.......GG.......', '.GG....GG....GG.', '.GGGG..GG..GGGG.', '..GGGG.GG.GGGG..', '...GGGGGGGGGG...', '.....GGGGGG.....', '.......GG.......'];
const LEAF = ['..........KK....', '........KKbbK...', '......KKbbbbK...', '....KKbbbbbbK...', '...KbbbbObbbK...', '..KbbbbObbbbK...', '..KbbbObbbbK....',
  '.KbbbObbbbbK....', '.KbbObbbbbK.....', '.KbObbbbKK......', 'KbOKKKKK........', 'KOK.............', 'KK..............'];
const COIN = ['....KKKKKK......', '...KYYYYYYK.....', '..KYYWWYYYYK....', '..KYWYYYOYYK....', '..KYWYYYOYYK....', '..KYWYYYOYYK....', '..KYWYYYOYYK....',
  '..KYYYYYOYYK....', '..KYYYYYYYYK....', '...KYYYYYYK.....', '....KKKKKK......'];
const COIN_T = ['......KKK.......', '.....KYYYK......', '.....KWYOK......', '.....KWYOK......', '.....KWYOK......', '.....KWYOK......', '.....KWYOK......',
  '.....KWYOK......', '.....KYYOK......', '.....KYYYK......', '......KKK.......'];
const COIN_E = ['.......K........', '.......K........', '.......Y........', '.......Y........', '.......Y........', '.......Y........', '.......Y........',
  '.......Y........', '.......Y........', '.......K........', '.......K........'];
const STAR = ['.......YY.......', '......YYYY......', '......YYYY......', '.....YYYYYY.....', 'YYYYYYYYYYYYYYYY', '.YYYYYKYYKYYYYY.', '..YYYYKYYKYYYY..',
  '...YYYYYYYYYY...', '...YYYYYYYYYY...', '..YYYYYYYYYYYY..', '..YYYYY..YYYYY..', '.YYYY......YYYY.', '.YY..........YY.'];

export function buildArt() {
  const A = {};
  const gbx = { D: '#a8501c', d: '#7c3410', E: '#40a020', y: '#fce0a8', W: '#fcfcfc', K: '#101010' };
  A.gb = [sprite([...GB, ...GB_A], gbx), sprite([...GB, ...GB_B], gbx)];
  A.gbFlat = sprite(GB_FLAT, gbx);
  const kg = { G: '#20a020', E: '#90e050', y: '#fcd8a0', W: '#fcfcfc', K: '#101010' }, kr = { ...kg, G: '#d02810', E: '#fc8870' };
  const koopa = (ex) => { const f = [sprite([...KP, ...KP_A], ex), sprite([...KP, ...KP_B], ex)]; return { l: f, r: f.map(flipped) }; };
  A.kp = koopa(kg); A.kr = koopa(kr);
  A.shell = sprite(SHELL, kg); A.shellR = sprite(SHELL, kr);
  A.wing = [sprite(WING, {}, 8), sprite(['........', '........', 'WWWWWW..', '.WWWWWWW', '..WWWWW.', '...WW...'], {}, 8)];
  const px = { R: '#d82800', W: '#fcfcfc', K: '#101010', G: '#20a020' };
  A.pp = [sprite(PIR, px), sprite([...PIR_SHUT, ...PIR.slice(12)], px)];
  const pfx = { ...px, R: '#20a020', G: '#006800' };
  A.pf = [sprite(PIR, pfx), sprite([...PIR_SHUT, ...PIR.slice(12)], pfx)];
  const dbx = { w: '#f0f0e8', g: '#a8a8a0', K: '#303030' };
  A.db = (() => { const f = [sprite([...DB, ...KP_A.map((r) => r.replace(/y/g, 'w'))], dbx), sprite([...DB, ...KP_B.map((r) => r.replace(/y/g, 'w'))], dbx)]; return { l: f, r: f.map(flipped) }; })();
  A.dbPile = sprite(DB_PILE, dbx);
  A.podo = [sprite(PODO, { Y: '#fcd820', R: '#f83800', W: '#fcfcfc' }, 8), sprite(PODO.map((r) => r.split('').reverse().join('')), { Y: '#fcb000', R: '#d82800', W: '#fcfcfc' }, 8)];
  A.thwomp = [sprite(THWOMP, { g: '#58585c', w: '#b8b8c0', K: '#101010', W: '#fcfcfc' }, 24), sprite(THWOMP.map((r, j) => j >= 5 && j <= 8 ? r.replace(/K/g, 'k') : r), { g: '#58585c', w: '#b8b8c0', K: '#101010', k: '#d82800', W: '#fcfcfc' }, 24)];
  A.mush = sprite(MUSH, { R: '#d82800', W: '#fcfcfc', y: '#fce0a8', K: '#101010' });
  A.flower = [sprite(FLOWER, { Y: '#f87800', R: '#fcd820', W: '#fcfcfc', K: '#101010', G: '#20a020' }), sprite(FLOWER, { Y: '#d82800', R: '#fcfcfc', W: '#fcd820', K: '#101010', G: '#20a020' })];
  A.leaf = [sprite(LEAF, { K: '#101010', b: '#f89830', O: '#a84800' }), flipped(sprite(LEAF, { K: '#101010', b: '#f89830', O: '#a84800' }))];
  const cx = { K: '#6c3000', Y: '#f8c020', W: '#fcfcfc', O: '#c87800' }, pad = (r) => ['', '', ...r, '', '', ''].map((s) => s.padEnd(16, '.'));
  A.coin = [sprite(pad(COIN), cx), sprite(pad(COIN_T), cx), sprite(pad(COIN_E), cx), flipped(sprite(pad(COIN_T), cx))];
  A.star = sprite(['', '', ...STAR, ''].map((s) => s.padEnd(16, '.')), { Y: '#f8d820', K: '#101010' });
  A.boom = [boomBoom(0), boomBoom(1), boomBoom(2)];
  // tiles
  A.gndTop = tileGround(true); A.gnd = tileGround(false);
  A.brick = tileBrick(); A.q = [tileQ('#f8b800'), tileQ('#fcd860'), tileQ('#c87800')]; A.used = tileUsed();
  A.note = tileNote('#fcfcfc'); A.snote = tileNote('#fcc8e8');
  A.wood = tileWood(); A.white = tileWhite(); A.stone = tileStone(); A.hedge = tileHedge();
  A.lava = [tileLava(0), tileLava(1)]; A.spike = tileSpike(); A.cloud = tileCloud();
  A.pipe = tilePipe();
  A.slopeU = tileSlope(1); A.slopeD = tileSlope(-1);
  A.debris = sprite(['.bb.', 'bbbD', 'bDbD', '.DD.'], { b: '#e8a040', D: '#6c3000' }, 4);
  A.fire = [sprite(['..YY....', '.YWWY...', 'YWWWYR..', '.YYYRR..', '..RR....', '........'], { Y: '#fcd820', W: '#fcfcfc', R: '#f83800' }, 8), sprite(['...RR...', '..YYYR..', '.YWWWY..', '.YWWY...', '..YY....', '........'], { Y: '#fcd820', W: '#fcfcfc', R: '#f83800' }, 8)];
  A.orb = sprite(['....KKKKKK......', '..KKWWYYYYKK....', '.KWWYYYYYYYYK...', '.KWYYYKKYYYYK...', 'KYYYYKYYKYYYYK..', 'KYYYYYYYKYYYYK..', 'KYYYYYYKYYYYYK..', 'KYYYYYKYYYYYYK..',
    'KYYYYYYYYYYYYK..', '.KYYYYKYYYYYK...', '.KYYYYYYYYYYK...', '..KKYYYYYYKK....', '....KKKKKK......'], { K: '#6c3000', Y: '#f8c020', W: '#fcfcfc' });
  return A;
}

// the brute of the fortress: a squat horned shell with swinging arms (0, 1: walk, 2: spin)
function boomBoom(f) {
  const [c, x] = canvas(32, 32);
  const px = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  // shell
  px('#101010', 4, 8, 24, 18); px('#e89830', 5, 9, 22, 16); px('#c86818', 5, 18, 22, 7);
  for (const [a, b] of [[8, 11], [16, 10], [22, 13], [11, 17]]) px('#fcfcfc', a, b, 3, 3);
  // head
  px('#101010', 9, 0, 14, 12); px('#f8c898', 10, 1, 12, 10);
  px('#fcfcfc', 11, 3, 4, 4); px('#fcfcfc', 17, 3, 4, 4); px('#101010', 13, 4, 2, 3); px('#101010', 17, 4, 2, 3);
  px('#101010', 10, 2, 5, 1); px('#101010', 17, 2, 5, 1);
  px('#d82800', 13, 8, 6, 2);
  px('#fcfcfc', 8, 0, 3, 3); px('#fcfcfc', 21, 0, 3, 3);
  // arms
  const up = f === 1 ? -4 : f === 2 ? -6 : 2;
  px('#101010', 0, 12 + up, 6, 6); px('#f8c898', 1, 13 + up, 4, 4);
  px('#101010', 26, 12 - up, 6, 6); px('#f8c898', 27, 13 - up, 4, 4);
  // feet
  px('#101010', 6, 26, 8, 6); px('#e89830', 7, 27, 6, 4); px('#101010', 18, 26, 8, 6); px('#e89830', 19, 27, 6, 4);
  if (f === 2) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 0, 32, 32); }
  return c;
}

function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function tileGround(top) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#f0b060'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#c87830';
  for (let j = 0; j < 16; j += 4) for (let i = (j / 4 % 2) * 2; i < 16; i += 4) x.fillRect(i + 1, j + 1, 1, 1);
  x.fillStyle = '#a05818'; x.fillRect(0, 15, 16, 1);
  if (top) {
    x.fillStyle = '#18a018'; x.fillRect(0, 0, 16, 5);
    x.fillStyle = '#88e060'; x.fillRect(0, 0, 16, 2);
    x.fillStyle = '#006800'; for (let i = 0; i < 16; i += 3) x.fillRect(i, 4 + (i % 2), 2, 2);
    x.fillStyle = '#101010'; x.fillRect(0, 0, 16, 1);
  }
  return c;
}
function tileBrick() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#e8a040'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#fcd898'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 8, 16, 1);
  x.fillStyle = '#6c3000';
  x.fillRect(0, 7, 16, 1); x.fillRect(0, 15, 16, 1); x.fillRect(7, 0, 1, 7); x.fillRect(3, 8, 1, 7); x.fillRect(11, 8, 1, 7); x.fillRect(15, 0, 1, 7);
  return c;
}
function tileQ(base) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#6c3000'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = base; x.fillRect(1, 1, 14, 14);
  x.fillStyle = '#fcfcfc'; x.fillRect(1, 1, 14, 1); x.fillRect(1, 1, 1, 14);
  x.fillStyle = '#6c3000'; for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) x.fillRect(a, b, 1, 1);
  const Q = ['.KKKK.', 'KK..KK', '....KK', '...KK.', '..KK..', '......', '..KK..'];
  Q.forEach((r, j) => { for (let i = 0; i < 6; i++) if (r[i] === 'K') { x.fillStyle = '#6c3000'; x.fillRect(5 + i, 4 + j, 1, 1); } });
  return c;
}
function tileUsed() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#6c3000'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#a86020'; x.fillRect(1, 1, 14, 14);
  x.fillStyle = '#6c3000'; for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) x.fillRect(a, b, 1, 1);
  return c;
}
function tileNote(base) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#404040'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = base; x.fillRect(1, 1, 14, 14);
  x.fillStyle = '#b8b8b8'; x.fillRect(1, 14, 14, 1); x.fillRect(14, 1, 1, 14);
  x.fillStyle = '#101010'; x.fillRect(8, 3, 1, 8); x.fillRect(9, 3, 3, 1); x.fillRect(11, 4, 1, 2); x.fillRect(5, 9, 3, 3); x.fillRect(4, 10, 1, 1);
  return c;
}
function tileWood() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#6c3000'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#e8a040'; x.fillRect(1, 1, 14, 14);
  x.strokeStyle = '#a86020'; x.lineWidth = 1;
  x.fillStyle = '#a86020'; x.fillRect(4, 4, 8, 1); x.fillRect(4, 11, 8, 1); x.fillRect(4, 4, 1, 8); x.fillRect(11, 4, 1, 8); x.fillRect(7, 7, 2, 2);
  x.fillStyle = '#fcd898'; x.fillRect(1, 1, 14, 1);
  return c;
}
// the portal surface: bright white panels, grey joints, a bevel
function tileWhite() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#9ca0ac'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#f4f6fa'; x.fillRect(1, 1, 14, 14);
  x.fillStyle = '#fcfcfc'; x.fillRect(1, 1, 14, 2);
  x.fillStyle = '#d4d8e0'; x.fillRect(1, 13, 14, 2); x.fillRect(13, 1, 2, 14);
  x.fillStyle = '#c0c4cc'; x.fillRect(7, 1, 1, 13);
  return c;
}
function tileStone() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#707078'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#9c9ca4'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 8, 16, 1);
  x.fillStyle = '#303038'; x.fillRect(0, 7, 16, 1); x.fillRect(0, 15, 16, 1); x.fillRect(7, 0, 1, 7); x.fillRect(15, 0, 1, 7); x.fillRect(3, 8, 1, 7); x.fillRect(11, 8, 1, 7);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (hash(i, j + 40) < .06) { x.fillStyle = '#5c5c64'; x.fillRect(i, j, 1, 1); }
  return c;
}
function tileHedge() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#005800'; x.fillRect(0, 0, 16, 16);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const h = hash(i * 3, j * 5);
    if (h < .22) { x.fillStyle = '#20a020'; x.fillRect(i, j, 2, 1); } else if (h < .3) { x.fillStyle = '#80d040'; x.fillRect(i, j, 1, 1); } else if (h < .36) { x.fillStyle = '#003800'; x.fillRect(i, j, 1, 1); }
  }
  return c;
}
function tileLava(f) {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#d82800'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#f87800'; for (let i = 0; i < 16; i++) x.fillRect(i, 2 + Math.round(Math.sin((i + f * 4) / 16 * Math.PI * 2) * 2), 1, 3);
  x.fillStyle = '#fcd820'; for (let i = 0; i < 16; i += 2) x.fillRect(i, 1 + Math.round(Math.sin((i + f * 4) / 16 * Math.PI * 2) * 2), 1, 1);
  x.fillStyle = '#a81000'; x.fillRect(0, 10, 16, 6);
  return c;
}
function tileSpike() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#505058'; x.fillRect(0, 12, 16, 4);
  for (let s = 0; s < 4; s++) for (let j = 0; j < 10; j++) {
    const w = Math.max(1, Math.round((j + 1) / 10 * 4));
    x.fillStyle = j < 2 ? '#fcfcfc' : '#b8b8c0'; x.fillRect(s * 4 + 2 - Math.floor(w / 2), 2 + j, w, 1);
  }
  return c;
}
function tileCloud() {
  const [c, x] = canvas(16, 16);
  x.fillStyle = '#101010';
  x.beginPath(); x.arc(4, 8, 5, 0, 7); x.arc(12, 8, 5, 0, 7); x.fill();
  x.fillStyle = '#fcfcfc'; x.beginPath(); x.arc(4, 8, 4, 0, 7); x.arc(12, 8, 4, 0, 7); x.fill();
  x.fillStyle = '#c8e8fc'; x.fillRect(1, 10, 14, 2);
  return c;
}
function tilePipe() {
  const [top, t] = canvas(32, 16), [body, b] = canvas(32, 16);
  for (const [x, h, y0] of [[t, 16, 0], [b, 16, 0]]) {
    const inset = x === t ? 0 : 2;
    x.fillStyle = '#101010'; x.fillRect(inset, y0, 32 - inset * 2, h);
    x.fillStyle = '#20a020'; x.fillRect(inset + 1, y0, 30 - inset * 2, h);
    x.fillStyle = '#88e060'; x.fillRect(inset + 4, y0, 3, h);
    x.fillStyle = '#006800'; x.fillRect(32 - inset - 8, y0, 5, h);
  }
  t.fillStyle = '#101010'; t.fillRect(0, 0, 32, 1); t.fillRect(0, 15, 32, 1);
  return { top, body };
}
function tileSlope(dir) {
  const [c, x] = canvas(16, 16);
  for (let i = 0; i < 16; i++) {
    const y0 = dir > 0 ? 15 - i : i;
    x.fillStyle = '#f0b060'; x.fillRect(i, y0, 1, 16 - y0);
    x.fillStyle = '#88e060'; x.fillRect(i, y0, 1, 2);
    x.fillStyle = '#18a018'; x.fillRect(i, y0 + 2, 1, 3);
    x.fillStyle = '#101010'; x.fillRect(i, y0, 1, 1);
  }
  x.fillStyle = '#c87830'; for (let j = 8; j < 16; j += 4) for (let i = 2; i < 16; i += 4) if ((dir > 0 ? 15 - i : i) + 6 < j) x.fillRect(i, j, 1, 1);
  return c;
}

// ---------- backdrops ----------
// a big bolted block, the colours of the plain
export const BIG = { w: ['#f4f6fa', '#c8ccd8', '#fcfcfc'], p: ['#f878a8', '#c04878', '#fcc4d8'], b: ['#6cc4fc', '#2878c8', '#c8ecfc'], g: ['#58d858', '#189818', '#b8f8b8'], o: ['#f8a040', '#c06010', '#fcd8a0'] };
export function drawBig(x, bx, by, w, h, color, dark) {
  const [base, sh, hi] = BIG[color];
  x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(bx + w, by + 6, 6, h - 6); x.fillRect(bx + 6, by + h, w, 6);
  x.fillStyle = '#101010'; x.fillRect(bx, by, w, h);
  x.fillStyle = base; x.fillRect(bx + 1, by + 1, w - 2, h - 2);
  x.fillStyle = hi; x.fillRect(bx + 1, by + 1, w - 2, 2); x.fillRect(bx + 1, by + 1, 2, h - 2);
  x.fillStyle = sh; x.fillRect(bx + w - 3, by + 3, 2, h - 4); x.fillRect(bx + 3, by + h - 3, w - 4, 2);
  for (const [a, b] of [[4, 4], [w - 7, 4], [4, h - 7], [w - 7, h - 7]]) { x.fillStyle = sh; x.fillRect(bx + a, by + b, 3, 3); x.fillStyle = hi; x.fillRect(bx + a, by + b, 2, 2); }
  if (dark) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(bx, by, w, h); }
}
export function drawBush(x, px, py, n = 1) {
  for (let k = 0; k < n; k++) {
    const cx = px + 12 + k * 16;
    x.fillStyle = '#101010'; x.beginPath(); x.arc(cx, py - 10, 12, Math.PI, 0); x.rect(cx - 12, py - 10, 24, 10); x.fill();
    x.fillStyle = '#58d858'; x.beginPath(); x.arc(cx, py - 10, 11, Math.PI, 0); x.rect(cx - 11, py - 10, 22, 10); x.fill();
    x.fillStyle = '#189818'; x.fillRect(cx - 6, py - 14, 2, 8); x.fillRect(cx + 4, py - 12, 2, 8);
  }
}
export function drawHill(x, px, py, big) {
  const w = big ? 96 : 64, h = big ? 64 : 40;
  x.fillStyle = '#101010'; x.beginPath(); x.ellipse(px + w / 2, py, w / 2 + 1, h + 1, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#40b850'; x.beginPath(); x.ellipse(px + w / 2, py, w / 2, h, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#189818';
  for (let k = 0; k < (big ? 5 : 3); k++) x.fillRect(px + w / 2 - 20 + k * 9, py - h + 16 + (k % 2) * 10, 3, 10);
  x.fillStyle = '#101010'; x.fillRect(px + w / 2 - 6, py - h + 10, 2, 5); x.fillRect(px + w / 2 + 4, py - h + 10, 2, 5);
}
export function drawCloud(x, px, py, s = 1) {
  x.fillStyle = '#101010';
  for (const [a, b, r] of [[0, 0, 9], [11, -5, 11], [23, 0, 9]]) { x.beginPath(); x.arc(px + a * s, py + b * s, (r + 1) * s, 0, 7); x.fill(); }
  x.fillStyle = '#fcfcfc';
  for (const [a, b, r] of [[0, 0, 9], [11, -5, 11], [23, 0, 9]]) { x.beginPath(); x.arc(px + a * s, py + b * s, r * s, 0, 7); x.fill(); }
  x.fillStyle = '#c8e8fc'; x.fillRect(px - 8 * s, py + 3 * s, 38 * s, 3 * s);
}
export function drawSign(x, px, py, kind) {
  x.fillStyle = '#6c3000'; x.fillRect(px + 7, py - 12, 2, 12);
  x.fillStyle = '#101010'; x.fillRect(px - 2, py - 26, 20, 16);
  x.fillStyle = '#e8a040'; x.fillRect(px - 1, py - 25, 18, 14);
  if (kind === 'gun') {
    x.fillStyle = '#fcfcfc'; x.fillRect(px + 2, py - 21, 10, 4); x.fillStyle = '#2a8cff'; x.fillRect(px + 12, py - 21, 3, 4); x.fillStyle = '#404040'; x.fillRect(px + 3, py - 17, 3, 3);
  } else {
    x.fillStyle = '#101010'; x.fillRect(px + 7, py - 23, 2, 7); x.fillRect(px + 4, py - 18, 8, 2); x.fillRect(px + 5, py - 16, 6, 1); x.fillRect(px + 6, py - 15, 4, 1);
    x.fillStyle = '#fcfcfc'; x.fillRect(px + 1, py - 13, 14, 1);
  }
}
