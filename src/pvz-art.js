// pvz-art.js, the pixels of « potager lunaire »: moon plants, space zombies, the moon base, the field, the stars.
// Little rectangles on a low-res buffer; `S` scales a sprite while keeping its pixels square.
import { canvas, sprite } from './nes-art.js';

export const CW = 32, LH = 32, FX = 48, COLS = 9, FY = 44, W = 400;
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function disc(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j + r * .8)); g.fillRect(cx - w, cy + j, w * 2 + 1, 1); }
}
const OUT = '#141420';

export const STAR = sprite([
  '.....Y.....', '....YYY....', '....YWY....', 'YYYYYWYYYYY', '.YYyWWWyYY.', '..YYyWyYY..', '...YYYYY...', '..YYY.YYY..', '..YY...YY..', '.YY.....YY.', '.Y.......Y.',
], {}, 11);
export const MOON = sprite([
  '...wWWw....', '..wWWw.....', '.wWWw......', '.wWW.......', 'wWWw.......', 'wWWw.......', 'wWWw.......', '.wWW.......', '.wWWw......', '..wWWw.....', '...wWWw....',
], {}, 11);

// ---------- plants: (x, y) is the middle of the cell's floor ----------
export function drawPlant(g, k, x, y, o = {}) {
  const t = o.t || 0, bob = Math.round(Math.sin(t * 3 + x * .1) * 1);
  const flash = o.flash > 0;
  const stem = (h, c = '#2a8a3a') => { px(g, OUT, x - 2, y - h, 4, h); px(g, c, x - 1, y - h, 2, h); px(g, '#3ac050', x - 7, y - 5, 6, 2); px(g, '#3ac050', x + 1, y - 7, 6, 2); px(g, '#1a6a2a', x - 7, y - 4, 6, 1); };
  switch (k) {
    case 'lunelle': {
      stem(12);
      const cy = y - 19 + bob, glow = o.glow > 0;
      for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4 + t * .4; disc(g, x + Math.round(Math.cos(ang) * 7), cy + Math.round(Math.sin(ang) * 7), 2, glow ? '#fff8c0' : '#e8d880'); }
      disc(g, x, cy, 6, OUT); disc(g, x, cy, 5, glow ? '#fff0a0' : '#f0e0a0');
      px(g, '#c8b060', x + 1, cy - 4, 3, 8); px(g, '#c8b060', x + 3, cy - 3, 1, 6);
      px(g, OUT, x - 3, cy - 1, 1, 2); px(g, OUT, x, cy - 1, 1, 2); px(g, OUT, x - 2, cy + 2, 3, 1);
      break;
    }
    case 'pois': case 'givre': case 'double': {
      stem(10);
      const c = k === 'givre' ? '#6ac8ff' : k === 'double' ? '#2fae3a' : '#5ad04a', d = k === 'givre' ? '#2a6aa0' : '#1a6a1a', cy = y - 16 + bob;
      const kick = o.fire > 0 ? 1 : 0;
      disc(g, x - 1, cy, 7, OUT); disc(g, x - 1, cy, 6, c); px(g, '#ffffff60', x - 5, cy - 4, 3, 2);
      px(g, OUT, x + 3 - kick, cy - 4, 8, 7); px(g, c, x + 4 - kick, cy - 3, 6, 5); px(g, d, x + 8 - kick, cy - 2, 2, 3);
      px(g, OUT, x - 1, cy - 3, 2, 3); px(g, '#fff', x - 1, cy - 3, 1, 1);
      if (k === 'givre') { px(g, '#e8f8ff', x - 5, cy - 9, 2, 3); px(g, '#e8f8ff', x - 1, cy - 10, 2, 4); px(g, '#e8f8ff', x + 3, cy - 8, 2, 2); }
      else if (k === 'double') { px(g, '#1a6a1a', x - 8, cy - 7, 6, 3); px(g, '#3ac050', x - 7, cy - 8, 4, 2); px(g, OUT, x + 2 - kick, cy + 2, 7, 5); px(g, c, x + 3 - kick, cy + 3, 5, 3); }
      else { px(g, '#8a8a96', x - 2, cy - 12, 1, 5); px(g, t % 1 < .5 ? '#ff4a4a' : '#ffd24a', x - 3, cy - 13, 3, 2); }
      break;
    }
    case 'triple': {
      stem(9);
      [[-7, -14], [0, -22], [7, -13]].forEach(([dx, dy], n) => {
        const cx = x + dx, cy = y + dy + (n === 1 ? bob : 0);
        disc(g, cx, cy, 5, OUT); disc(g, cx, cy, 4, '#5ad04a');
        px(g, OUT, cx + 2, cy - 2, 5, 5); px(g, '#5ad04a', cx + 3, cy - 1, 3, 3); px(g, '#1a6a1a', cx + 5, cy - 1, 1, 2);
        px(g, OUT, cx - 1, cy - 2, 1, 2);
      });
      break;
    }
    case 'roche': {
      const hp = o.hp ?? 1, cy = y - 12;
      px(g, OUT, x - 10, cy - 11, 20, 23); px(g, OUT, x - 11, cy - 8, 22, 17);
      px(g, '#9a9aa8', x - 9, cy - 10, 18, 21); px(g, '#9a9aa8', x - 10, cy - 7, 20, 15);
      px(g, '#b8b8c6', x - 8, cy - 10, 12, 3); px(g, '#6a6a78', x - 9, cy + 7, 18, 3);
      disc(g, x + 5, cy + 3, 2, '#7a7a88'); disc(g, x - 6, cy - 4, 1, '#7a7a88');
      px(g, '#fff', x - 5, cy - 3, 3, 4); px(g, '#fff', x + 1, cy - 3, 3, 4); px(g, OUT, x - 4 + (hp < .5 ? 0 : 1), cy - 2, 2, 2); px(g, OUT, x + 2, cy - 2, 2, 2);
      if (hp < .66) { px(g, OUT, x - 2, cy - 10, 1, 4); px(g, OUT, x - 1, cy - 6, 1, 3); px(g, OUT, x + 6, cy + 1, 3, 1); }
      if (hp < .33) { px(g, OUT, x - 9, cy + 2, 5, 1); px(g, OUT, x + 4, cy - 9, 1, 5); px(g, OUT, x - 3, cy + 4, 4, 1); }
      break;
    }
    case 'mine': {
      if (!o.armed) { px(g, '#5a4a3a', x - 7, y - 3, 14, 3); px(g, '#6a5a4a', x - 5, y - 4, 10, 1); px(g, '#3ac050', x, y - 8, 1, 4); px(g, '#3ac050', x + 1, y - 8, 2, 1); break; }
      px(g, OUT, x - 8, y - 11, 16, 11); px(g, '#c89a60', x - 7, y - 10, 14, 9); px(g, '#e0b880', x - 6, y - 10, 8, 2);
      px(g, '#fff', x - 4, y - 7, 2, 2); px(g, '#fff', x + 1, y - 7, 2, 2); px(g, OUT, x - 3, y - 6, 1, 1); px(g, OUT, x + 2, y - 6, 1, 1);
      px(g, '#8a8a96', x, y - 15, 1, 4); px(g, Math.floor(t * 3) % 2 ? '#ff2a2a' : '#6a0a0a', x - 1, y - 17, 3, 3);
      px(g, '#5a4a3a', x - 9, y - 2, 18, 2);
      break;
    }
    case 'bombe': {
      const s = o.fuse > 0 ? 1 + Math.floor(t * 12) % 2 : 0;
      px(g, '#2a8a3a', x - 4, y - 22, 1, 8); px(g, '#2a8a3a', x + 3, y - 22, 1, 10); px(g, '#2a8a3a', x - 4, y - 23, 8, 2);
      for (const [dx, dy] of [[-5, -8], [5, -10]]) { disc(g, x + dx, y + dy, 6 + s, OUT); disc(g, x + dx, y + dy, 5 + s, flash || s ? '#ff8a6a' : '#e02a2a'); px(g, '#ffb0a0', x + dx - 3, y + dy - 4, 2, 2); px(g, OUT, x + dx - 2, y + dy - 1, 1, 2); px(g, OUT, x + dx + 1, y + dy - 1, 1, 2); px(g, OUT, x + dx - 2, y + dy - 2, 1, 1); px(g, OUT, x + dx + 2, y + dy - 2, 1, 1); }
      px(g, '#ffe04a', x - 1 + (Math.floor(t * 20) % 3), y - 26, 2, 2);
      break;
    }
    case 'gobe': {
      stem(10, '#3a7a3a');
      const cy = y - 20 + bob, chew = o.chew > 0;
      disc(g, x + 2, cy, 9, OUT); disc(g, x + 2, cy, 8, '#9a4ac0'); px(g, '#c07ae0', x - 3, cy - 7, 6, 3);
      if (chew) { disc(g, x + 2, cy + 2, 6, '#7a2aa0'); px(g, OUT, x + 4, cy + 1, 7, 1); for (let n = 0; n < 3; n++) px(g, '#fff', x + 5 + n * 2, cy, 1, 1); px(g, '#c07ae0', x - 5, cy + 3, 3, 3); }
      else { px(g, OUT, x + 3, cy - 2, 9, 7); px(g, '#4a0a20', x + 4, cy - 1, 8, 5); for (let n = 0; n < 4; n++) { px(g, '#fff', x + 4 + n * 2, cy - 1, 1, 2); px(g, '#fff', x + 5 + n * 2, cy + 2, 1, 2); } }
      px(g, '#fff', x - 3, cy - 3, 3, 3); px(g, OUT, x - 2, cy - 2, 1, 1);
      px(g, '#5ad04a', x - 9, y - 10, 5, 2);
      break;
    }
  }
}

// ---------- zombies: (x, y) = feet, facing left ----------
export function drawZombie(g, k, x, y, o = {}) {
  const t = o.t || 0, big = k === 'geant', mini = k === 'mini', S = big ? 1.7 : mini ? .65 : 1;
  const r = (dx, dy, w, h, c) => px(g, c, Math.round(x + dx * S), Math.round(y + dy * S), Math.max(1, Math.round(w * S)), Math.max(1, Math.round(h * S)));
  const white = o.flash > 0, slow = o.slow > 0;
  const suit = white ? '#fff' : k === 'coureur' ? '#d04040' : big ? '#6a6a80' : '#8a9ab0', dark = k === 'coureur' ? '#8a2020' : '#5a6a80';
  const skin = white ? '#fff' : slow ? '#8ad0e8' : '#8ac070', skinD = slow ? '#4a90b0' : '#5a8a40';
  const eat = o.eat ? Math.floor(t * 6) % 2 : 0, step = o.eat || o.hop ? 0 : Math.floor(t * (k === 'coureur' || k === 'jetpack' ? 8 : 4)) % 2;
  const rise = o.hop ? -Math.round(Math.sin(Math.min(1, o.hop) * Math.PI) * 18) : 0;
  y += rise;
  // legs
  r(-4 + step * 2, -9, 4, 9, OUT); r(-3 + step * 2, -9, 2, 8, dark);
  r(1 - step * 2, -9, 4, 9, OUT); r(2 - step * 2, -9, 2, 8, dark);
  r(-5 + step * 2, -2, 5, 2, '#3a3a4a'); r(0 - step * 2, -2, 5, 2, '#3a3a4a');
  // back things
  if (k === 'jetpack') { r(4, -20, 5, 10, OUT); r(5, -19, 3, 8, '#a0a0b0'); if (o.fly || o.hop) { r(5, -10, 3, 3 + Math.floor(t * 20) % 3, '#ffb040'); r(6, -9, 1, 2, '#fff'); } }
  if (k === 'drapeau') { r(4, -34, 1, 26, '#8a6a4a'); r(5, -34, 10, 7, '#e02a2a'); r(8, -32, 3, 3, '#fff'); r(9, -31, 1, 1, OUT); }
  // body
  r(-6, -22, 12, 14, OUT); r(-5, -21, 10, 12, suit); r(-5, -21, 10, 2, white ? '#fff' : '#b0c0d0');
  if (k === 'coureur') { r(-5, -17, 10, 1, '#fff'); r(-5, -14, 10, 1, '#fff'); }
  else { r(-3, -16, 3, 3, dark); r(2, -12, 2, 2, '#c05050'); }
  // arms reaching forward (to the left)
  const ay = eat ? -16 : -18;
  r(-12, ay, 8, 4, OUT); r(-11, ay + 1, 7, 2, suit); r(-13, ay, 2, 3, skin);
  // head in a cracked bubble helmet
  const hx = -1, hy = -29 + (eat ? 1 : 0);
  r(hx - 5, hy - 5, 11, 11, OUT); r(hx - 4, hy - 4, 9, 9, skin); r(hx - 4, hy + 2, 9, 2, skinD);
  r(hx - 3, hy - 2, 3, 3, '#fff'); r(hx + 1, hy - 2, 3, 3, '#fff'); r(hx - 3, hy - 1, 1, 1, '#c02020'); r(hx + 1, hy - 1, 1, 1, '#c02020');
  r(hx - 3, hy + 2, 5, 1, OUT); r(hx - 2, hy + 3, 1, 1, '#fff');
  if (!mini) { r(hx - 6, hy - 7, 13, 1, '#d8f4ff'); r(hx - 7, hy - 6, 1, 11, '#d8f4ff'); r(hx + 7, hy - 6, 1, 8, '#d8f4ff'); r(hx - 6, hy - 6, 3, 1, '#ffffff'); r(hx + 5, hy - 7, 1, 3, OUT); }
  // headgear
  const arm = o.arm || 0;
  if (k === 'cone' && arm > 0) { for (let j = 0; j < 9; j++) r(hx - 1 - Math.floor(j / 2), hy - 14 + j, 3 + Math.floor(j / 2) * 2, 1, j % 4 === 2 ? '#fff' : '#ff8a1a'); r(hx - 6, hy - 5, 13, 2, '#c05a0a'); }
  if (k === 'seau' && arm > 0) { r(hx - 6, hy - 11, 13, 9, OUT); r(hx - 5, hy - 10, 11, 7, arm < 400 ? '#8a8a96' : '#b8b8c6'); r(hx - 7, hy - 4, 15, 2, '#6a6a78'); r(hx - 4, hy - 9, 2, 5, '#e8e8f0'); }
  if (big) { r(-16, -40, 3, 30, OUT); r(-15, -40, 2, 30, '#8a5a3a'); r(-18, -42, 7, 3, '#8a8a96'); if (!o.thrown) { r(6, -30, 6, 8, OUT); r(7, -29, 4, 6, '#8ac070'); } }
}

// ---------- the scenery: the field for n lanes, drawn once ----------
export function buildField(lanes, seed, owners) {
  const Hh = FY + lanes * LH + 6;
  const [c, g] = canvas(W, Hh);
  let s = seed >>> 0 || 1; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  px(g, '#05050e', 0, 0, W, Hh);
  for (let n = 0; n < 90; n++) px(g, R() < .3 ? '#fff' : '#6a6a90', Math.floor(R() * W), Math.floor(R() * Hh));
  // the earth up in the corner
  disc(g, W - 26, 20, 11, '#2a64d0'); disc(g, W - 28, 18, 5, '#3a9a40'); disc(g, W - 21, 25, 3, '#3a9a40'); px(g, '#fff', W - 32, 12, 4, 1);
  for (let l = 0; l < lanes; l++) for (let col = 0; col < COLS; col++) {
    const x = FX + col * CW, y = FY + l * LH, a = (l + col) % 2;
    px(g, a ? '#6c6c7a' : '#7a7a88', x, y, CW, LH);
    for (let n = 0; n < 6; n++) px(g, R() < .5 ? '#5a5a68' : '#8e8e9c', x + Math.floor(R() * CW), y + Math.floor(R() * LH), 1 + (R() < .3), 1);
    if (R() < .18) { const cx = x + 6 + Math.floor(R() * 18), cy = y + 8 + Math.floor(R() * 16); px(g, '#50505e', cx, cy, 7, 2); px(g, '#9c9caa', cx, cy + 2, 7, 1); }
  }
  // beyond the field: grey dust where they come from
  px(g, '#4a4a58', FX + COLS * CW, FY, W - FX - COLS * CW, lanes * LH);
  for (let n = 0; n < 40; n++) px(g, '#3a3a48', FX + COLS * CW + Math.floor(R() * 60), FY + Math.floor(R() * lanes * LH), 2, 1);
  // the base: a wall with portholes, one per lane
  px(g, '#c8ccd8', 0, FY - 6, 16, lanes * LH + 12); px(g, '#e8ecf4', 0, FY - 6, 16, 2); px(g, '#8a8e9a', 14, FY - 6, 2, lanes * LH + 12);
  for (let l = 0; l < lanes; l++) {
    const y = FY + l * LH;
    disc(g, 7, y + 12, 4, '#5a5e6a'); disc(g, 7, y + 12, 3, '#ffe890'); px(g, '#fff', 5, y + 10, 1, 1);
    px(g, '#5a5e6a', 16, y + LH - 2, FX - 16, 2);
    if (owners?.[l]) px(g, owners[l], 2, y + 22, 10, 3);
  }
  // the card bar
  px(g, '#10101c', 0, 0, W, FY - 4); px(g, '#2a2a44', 0, FY - 5, W, 1);
  return c;
}
export function drawRover(g, x, y, t, moving) {
  const b = moving ? Math.floor(t * 20) % 2 : 0;
  px(g, OUT, x - 10, y - 11, 20, 7); px(g, '#e0e0ea', x - 9, y - 10, 18, 5); px(g, '#ff8a1a', x - 9, y - 7, 18, 2);
  px(g, OUT, x - 4, y - 16, 7, 6); px(g, '#6ac8ff', x - 3, y - 15, 5, 4); px(g, '#8a8a96', x + 6, y - 18, 1, 8); px(g, '#ff4a4a', x + 5, y - 19, 3, 2);
  for (const dx of [-7, 6]) { px(g, OUT, x + dx - 3, y - 5 - b, 6, 5); px(g, '#5a5a68', x + dx - 2, y - 4 - b, 4, 3); }
  if (moving) { px(g, '#c8c8d0', x - 14, y - 4, 3, 2); px(g, '#a0a0b0', x - 18, y - 3, 2, 2); }
}
export function drawPea(g, x, y, ice) {
  px(g, OUT, x - 3, y - 3, 6, 6); px(g, ice ? '#8ad8ff' : '#6ae05a', x - 2, y - 2, 4, 4); px(g, '#fff', x - 1, y - 2, 1, 1);
}
