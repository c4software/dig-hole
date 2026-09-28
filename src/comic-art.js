// comic-art.js, the pixels of « capitaine lune »: tiles and backdrops for the four zones, the captain, the flyers,
// the items. Everything is drawn with little rectangles on a 256×208 buffer.
import { canvas } from './nes-art.js';
import { TS, ROWS, ROCK, BLOCK, WALL, SPIKE, rng } from './comic-level.js';

export const VW = 256, VH = ROWS * TS, HUD = 32, H = VH + HUD;
export const THEMES = [
  { sky: '#05050d', rock: '#8a8a96', lite: '#c4c4d0', dark: '#4c4c58', top: '#dcdce6', block: '#6c7086', blite: '#9aa0b8', bdark: '#3a3e50', spike: '#7cf0ff', deco: '#aab' },
  { sky: '#0c1422', rock: '#48607a', lite: '#86a2c0', dark: '#26344a', top: '#a8c4e0', block: '#c89a28', blite: '#f0c850', bdark: '#6a4c10', spike: '#fff27a', deco: '#8cf' },
  { sky: '#0a060e', rock: '#5c3e5e', lite: '#8c6494', dark: '#2e1c34', top: '#a07ab0', block: '#4a3a52', blite: '#76608a', bdark: '#22182a', spike: '#6cf8d8', deco: '#6cf8d8' },
  { sky: '#120a22', rock: '#3a6a4a', lite: '#6aa474', dark: '#1a3424', top: '#8cc890', block: '#5a4a78', blite: '#8a78b0', bdark: '#2a2040', spike: '#ff5a4a', deco: '#ffb040', wall: '#2c4a38' },
];
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ---------- tiles ----------
export function buildTiles(th, zi) {
  const T = THEMES[th], R = rng(77 + zi * 13), out = {};
  const mk = (f) => { const [c, g] = canvas(TS, TS); f(g); return c; };
  const rockBody = (g) => {
    px(g, T.rock, 0, 0, TS, TS);
    if (zi === 1) { // metal plates with rivets
      px(g, T.dark, 0, 15, 16, 1); px(g, T.dark, 15, 0, 1, 16); px(g, T.lite, 0, 0, 15, 1); px(g, T.lite, 0, 0, 1, 15);
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) { px(g, T.lite, x, y); px(g, T.dark, x + 1, y + 1); }
    } else if (zi === 3) { // alien bricks
      px(g, T.dark, 0, 7, 16, 1); px(g, T.dark, 0, 15, 16, 1); px(g, T.dark, 7, 0, 1, 7); px(g, T.dark, 12, 8, 1, 7); px(g, T.dark, 3, 8, 1, 7);
      px(g, T.lite, 0, 0, 7, 1); px(g, T.lite, 8, 0, 8, 1); px(g, T.lite, 4, 8, 8, 1);
    } else {
      for (let n = 0; n < 9; n++) px(g, R() < .5 ? T.dark : T.lite, Math.floor(R() * 15), Math.floor(R() * 15), 1 + (R() < .3), 1);
      if (zi === 2 && R() < .6) { const x = 3 + Math.floor(R() * 9), y = 3 + Math.floor(R() * 9); px(g, T.spike, x, y, 2, 2); px(g, '#fff', x, y); }
      if (zi === 0 && R() < .5) { const x = 2 + Math.floor(R() * 10), y = 4 + Math.floor(R() * 8); px(g, T.dark, x, y, 4, 1); px(g, T.dark, x - 1, y + 1, 1, 2); px(g, T.lite, x, y + 3, 4, 1); }
    }
  };
  out.rock = [0, 1, 2].map(() => mk(rockBody));
  out.top = [0, 1].map(() => mk((g) => {
    rockBody(g);
    if (zi === 1) { px(g, T.top, 0, 0, 16, 2); for (let x = 0; x < 16; x += 4) px(g, '#ffd24a', x, 2, 2, 1); }
    else if (zi === 3) { px(g, T.top, 0, 0, 16, 2); px(g, T.lite, 0, 2, 16, 1); }
    else { px(g, T.top, 0, 0, 16, 2); for (let x = 0; x < 16; x++) if (R() < .4) px(g, T.top, x, 2); px(g, '#fff', Math.floor(R() * 14), 0, 2, 1); }
  }));
  out.block = mk((g) => {
    px(g, T.bdark, 0, 0, 16, 16); px(g, T.block, 1, 1, 14, 14); px(g, T.blite, 1, 1, 14, 2); px(g, T.blite, 1, 1, 2, 14);
    if (zi === 1) { for (let y = 4; y < 13; y++) for (let x = 4; x < 13; x++) if ((x + y) % 6 < 3) px(g, '#2a2a2a', x, y); }
    else if (zi === 3) { px(g, T.bdark, 7, 3, 2, 10); px(g, T.bdark, 3, 7, 10, 2); px(g, '#c8a8ff', 7, 7, 2, 2); }
    else { px(g, T.bdark, 4, 5, 3, 1); px(g, T.bdark, 9, 10, 3, 1); px(g, T.blite, 10, 4, 2, 1); }
  });
  out.wall = mk((g) => {
    px(g, T.wall || T.dark, 0, 0, 16, 16); px(g, '#0c1c12', 0, 15, 16, 1); px(g, '#0c1c12', 15, 0, 1, 16);
    px(g, '#4a7a58', 0, 0, 15, 1); px(g, '#4a7a58', 0, 0, 1, 15);
    px(g, '#9a70ff', 6, 5, 4, 1); px(g, '#9a70ff', 7, 4, 2, 7); px(g, '#9a70ff', 5, 9, 6, 1);
  });
  out.spike = [0, 1].map((f) => mk((g) => {
    for (let n = 0; n < 4; n++) {
      const x = n * 4, h = 6 + ((n + f) % 2) * 5;
      for (let j = 0; j < h; j++) { const w = Math.max(1, Math.round((j + 1) / h * 3)); px(g, j < 2 ? '#fff' : T.spike, x + 2 - Math.floor(w / 2), 16 - h + j, w, 1); }
    }
    px(g, T.dark, 0, 14, 16, 2);
  }));
  return out;
}

// ---------- backdrops: one wide strip per zone, scrolled at a third of the speed ----------
export function buildBack(zi, seed) {
  const T = THEMES[zi], R = rng(seed * 7 + zi), W = 512;
  const [c, g] = canvas(W, VH);
  px(g, T.sky, 0, 0, W, VH);
  if (zi === 0) {
    for (let n = 0; n < 160; n++) px(g, R() < .2 ? '#fff' : R() < .5 ? '#8888aa' : '#555570', Math.floor(R() * W), Math.floor(R() * VH * .8));
    // the earth, far away
    const ex = 380, ey = 34;
    for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) {
      const d = x * x + y * y; if (d > 196) continue;
      const land = Math.sin(x * .45 + y * .2) + Math.cos(y * .5 - x * .1) > .7;
      px(g, x + y > 8 ? (land ? '#1c4a20' : '#0e2a5a') : land ? '#3a9a40' : '#2a64d0', ex + x, ey + y);
      if (d < 196 && Math.sin(x * .8 + y * 1.3) > .92) px(g, '#fff', ex + x, ey + y);
    }
    // grey hills
    for (let x = 0; x < W; x++) {
      const h = 40 + Math.sin(x * .02) * 14 + Math.sin(x * .07 + 1) * 6;
      px(g, '#2a2a36', x, VH - h, 1, h);
      const h2 = 20 + Math.sin(x * .035 + 2) * 8;
      px(g, '#3a3a48', x, VH - h2, 1, h2);
    }
  } else if (zi === 1) {
    for (let x = 0; x < W; x += 32) {
      px(g, '#162030', x, 0, 31, VH); px(g, '#1e2a3e', x + 1, 1, 29, 2); px(g, '#0a0e16', x + 31, 0, 1, VH);
      if ((x / 32) % 3 === 1) { // a porthole with stars
        px(g, '#3a4a60', x + 6, 40, 20, 20); px(g, '#02030a', x + 8, 42, 16, 16);
        for (let n = 0; n < 6; n++) px(g, '#fff', x + 9 + Math.floor(R() * 14), 43 + Math.floor(R() * 14));
      } else for (let n = 0; n < 3; n++) px(g, ['#ff4a4a', '#4aff7a', '#ffd24a'][n], x + 6 + n * 7, 90, 3, 2);
      px(g, '#2a3a52', x, 110, 32, 3);
    }
  } else if (zi === 2) {
    for (let x = 0; x < W; x++) {
      const h = 22 + Math.abs(Math.sin(x * .09)) * 20 + (x % 17 < 3 ? 14 : 0);
      px(g, '#1a0e20', x, 0, 1, h);
      const b = 30 + Math.sin(x * .05) * 10;
      px(g, '#160c1a', x, VH - b, 1, b);
    }
    for (let n = 0; n < 30; n++) px(g, '#2a6a64', Math.floor(R() * W), 20 + Math.floor(R() * 120), 1, 1);
  } else {
    for (let y = 0; y < VH; y += 8) for (let x = (y / 8) % 2 * 8; x < W; x += 16) { px(g, '#1a1030', x, y, 15, 7); px(g, '#221640', x, y, 15, 1); }
    for (let x = 40; x < W; x += 96) { // arches with torches
      for (let y = 30; y < VH; y++) px(g, '#0a0616', x, y, 40, 1);
      for (let a = 0; a < 20; a++) px(g, '#120a22', x + a, 30 - Math.round(Math.sqrt(400 - (a - 20) * (a - 20)) * .5), 40 - a * 2, 1);
      px(g, '#6a4a20', x - 8, 60, 3, 10);
    }
  }
  return c;
}

// ---------- the captain ----------
export function drawHero(g, x, y, f, fr, col, o = {}) {
  // x: centre, y: feet; f: facing; fr: 0 stand, 1-2 walk, 3 jump
  const X = Math.round(x), Y = Math.round(y), s = f < 0 ? -1 : 1;
  const r = (dx, dy, w, h, c) => px(g, c, s > 0 ? X + dx : X - dx - w, Y + dy, w, h);
  const boot = o.boots ? '#ff8a1a' : '#5a5a6a';
  // legs
  const la = fr === 1 ? 2 : fr === 2 ? -2 : 0, jump = fr === 3;
  r(-4 + la, -8, 3, 6, '#1a1a24'); r(-3 + la, -8, 2, 6, '#e8e8f0');
  r(1 - la, -8, 3, 6, '#1a1a24'); r(1 - la, -8, 2, 6, '#e8e8f0');
  r(-5 + la, jump ? -4 : -2, 5, 2, boot); r(0 - la, -2, 5, 2, boot);
  // backpack
  r(-8, -18, 4, 9, '#1a1a24'); r(-7, -17, 3, 7, '#e07a1a'); r(-7, -17, 3, 1, '#ffb050');
  if (o.jet) { r(-7, -10, 3, 2 + (Math.random() * 3 | 0), '#ffd24a'); }
  // body
  r(-5, -18, 10, 11, '#1a1a24'); r(-4, -17, 8, 9, '#f4f4fa'); r(-4, -14, 8, 2, col); r(-4, -9, 8, 1, '#b8b8c8');
  // arm: out when shooting
  if (o.shoot) { r(2, -15, 7, 3, '#1a1a24'); r(3, -14, 6, 1, '#f4f4fa'); r(8, -15, 2, 3, '#ffd24a'); }
  else { r(1, -16, 3, 7, '#1a1a24'); r(2, -15, 1, 5, '#dcdce8'); }
  // helmet
  r(-5, -27, 10, 10, '#1a1a24'); r(-4, -26, 8, 8, '#f4f4fa'); r(-4, -26, 8, 1, '#ffffff');
  r(-1, -24, 5, 4, '#1a1a24'); r(0, -24, 4, 3, o.visor || '#3cbcfc'); r(1, -24, 1, 1, '#d8f4ff');
  r(-4, -19, 8, 1, col);
}

// ---------- the flyers ----------
export function drawFoe(g, e, t) {
  const x = Math.round(e.x), y = Math.round(e.y), a = Math.floor(t * 8) % 2;
  switch (e.k) {
    case 'sine': // a little saucer
      px(g, '#1a1a24', x - 8, y - 1, 16, 4); px(g, '#9aa0b0', x - 7, y, 14, 2); px(g, '#5ad0ff', x - 3, y - 4, 6, 3); px(g, '#c8f0ff', x - 2, y - 4, 2, 1);
      for (let n = 0; n < 3; n++) px(g, (n + a) % 2 ? '#ff4a4a' : '#ffd24a', x - 6 + n * 5, y + 2, 2, 1);
      break;
    case 'bounce': // a bouncing moon-marble with eyes
      px(g, '#1a1a24', x - 5, y - 5, 10, 10); px(g, '#b04ad0', x - 4, y - 4, 8, 8); px(g, '#e090ff', x - 3, y - 4, 3, 2);
      px(g, '#fff', x - 2, y - 1, 2, 2); px(g, '#fff', x + 1, y - 1, 2, 2); px(g, '#000', x - 1 + (e.vx > 0), y, 1, 1); px(g, '#000', x + 1 + (e.vx > 0), y, 1, 1);
      break;
    case 'seek': // a floating eye with tentacles
      px(g, '#1a1a24', x - 5, y - 5, 10, 9); px(g, '#f0f0e0', x - 4, y - 4, 8, 7); px(g, '#e04040', x - 2, y - 2, 4, 4); px(g, '#000', x - 1, y - 1, 2, 2);
      for (let n = 0; n < 3; n++) px(g, '#8a3aa0', x - 4 + n * 3, y + 4 + ((n + a) % 2), 2, 3);
      break;
    case 'zig': { // a moon bat
      const w = a ? 3 : -2;
      px(g, '#1a1a24', x - 3, y - 3, 6, 6); px(g, '#5a4a80', x - 2, y - 2, 4, 4); px(g, '#ffe04a', x - 1, y - 1, 1, 1); px(g, '#ffe04a', x + 1, y - 1, 1, 1);
      px(g, '#3a2a5a', x - 9, y - 2 + w, 6, 2); px(g, '#3a2a5a', x + 3, y - 2 + w, 6, 2); px(g, '#3a2a5a', x - 7, y - 1, 4, 1); px(g, '#3a2a5a', x + 3, y - 1, 4, 1);
      break;
    }
    case 'shy': // a jellyfish
      px(g, '#1a1a24', x - 6, y - 6, 12, 7); px(g, e.flee > 0 ? '#ff90c0' : '#6af0c0', x - 5, y - 5, 10, 5); px(g, '#fff', x - 3, y - 4, 2, 1);
      for (let n = 0; n < 4; n++) px(g, '#4ac0a0', x - 5 + n * 3, y + 1, 1, 3 + ((n + a) % 2) * 2);
      break;
    case 'leap': // a moon toad
      px(g, '#1a1a24', x - 6, y - 7, 12, 7); px(g, '#6ac040', x - 5, y - 6, 10, 5); px(g, '#fff', x - 4, y - 8, 3, 3); px(g, '#fff', x + 1, y - 8, 3, 3);
      px(g, '#000', x - 3 + (e.vx > 0), y - 7, 1, 1); px(g, '#000', x + 2 + (e.vx > 0), y - 7, 1, 1);
      px(g, '#3a7a20', x - 7, y - 2, 3, 2); px(g, '#3a7a20', x + 4, y - 2, 3, 2);
      break;
    case 'boss': { // the guardian: a big alien skull
      const hit = e.hit > 0;
      px(g, '#1a1a24', x - 16, y - 14, 32, 26); px(g, hit ? '#fff' : '#a070e0', x - 15, y - 13, 30, 22); px(g, hit ? '#fff' : '#c8a0ff', x - 13, y - 13, 26, 3);
      px(g, '#1a0a2a', x - 11, y - 6, 8, 7); px(g, '#1a0a2a', x + 3, y - 6, 8, 7);
      px(g, '#ff3a3a', x - 8 + (a ? 1 : 0), y - 4, 3, 3); px(g, '#ff3a3a', x + 6 + (a ? 1 : 0), y - 4, 3, 3);
      px(g, '#1a0a2a', x - 7, y + 4, 14, 3); for (let n = 0; n < 5; n++) px(g, '#fff', x - 6 + n * 3, y + 4, 2, 2);
      px(g, '#ffd24a', x - 10, y - 19, 20, 5); for (let n = 0; n < 5; n++) px(g, '#ffd24a', x - 10 + n * 4, y - 22, 2, 3);
      break;
    }
    case 'orb':
      px(g, '#ff5a2a', x - 2, y - 2, 4, 4); px(g, '#ffe04a', x - 1, y - 1, 2, 2);
      break;
  }
}

// ---------- items ----------
export const ITEM = {
  cola: 'blastola cola', shield: 'bouclier', boots: 'bottes lunaires', cork: 'tire-bouchon', key: 'clé de la porte',
  lantern: 'lanterne', wand: 'baguette de téléportation', lingot: 'le lingot', gemme: 'la gemme', couronne: 'la couronne',
};
export function drawItem(g, k, x, y) {
  x = Math.round(x); y = Math.round(y);
  switch (k) {
    case 'cola': px(g, '#1a1a24', x - 4, y - 7, 8, 13); px(g, '#e02a2a', x - 3, y - 6, 6, 11); px(g, '#fff', x - 3, y - 2, 6, 2); px(g, '#c0c0c0', x - 3, y - 7, 6, 1); px(g, '#ff8a8a', x - 2, y - 5, 1, 3); break;
    case 'shield': px(g, '#1a1a24', x - 6, y - 7, 12, 12); px(g, '#2a6ae0', x - 5, y - 6, 10, 8); px(g, '#2a6ae0', x - 3, y + 2, 6, 2); px(g, '#8ac0ff', x - 4, y - 5, 3, 3); px(g, '#ffd24a', x - 1, y - 4, 2, 6); break;
    case 'boots': px(g, '#1a1a24', x - 6, y - 6, 6, 12); px(g, '#ff8a1a', x - 5, y - 5, 4, 10); px(g, '#ff8a1a', x - 5, y + 2, 6, 3); px(g, '#1a1a24', x + 1, y - 6, 6, 12); px(g, '#ff8a1a', x + 2, y - 5, 4, 10); px(g, '#ff8a1a', x + 2, y + 2, 6, 3); px(g, '#ffe04a', x - 5, y - 5, 4, 1); px(g, '#ffe04a', x + 2, y - 5, 4, 1); break;
    case 'cork': for (let n = 0; n < 5; n++) { px(g, '#c0c0d0', x - 3 + (n % 2) * 3, y - 6 + n * 2, 4, 1); px(g, '#6a6a7a', x - 3 + (n % 2) * 3, y - 5 + n * 2, 4, 1); } px(g, '#8a5a2a', x - 5, y - 8, 10, 2); break;
    case 'key': px(g, '#1a1a24', x - 6, y - 4, 6, 6); px(g, '#ffd24a', x - 5, y - 3, 4, 4); px(g, '#1a1a24', x - 4, y - 2, 2, 2); px(g, '#ffd24a', x - 1, y - 2, 8, 2); px(g, '#ffd24a', x + 4, y, 2, 3); px(g, '#ffd24a', x + 1, y, 1, 2); break;
    case 'lantern': px(g, '#1a1a24', x - 4, y - 7, 8, 13); px(g, '#6a6a7a', x - 3, y - 6, 6, 2); px(g, '#ffe070', x - 3, y - 4, 6, 7); px(g, '#fff', x - 1, y - 3, 2, 4); px(g, '#6a6a7a', x - 3, y + 3, 6, 2); px(g, '#6a6a7a', x - 1, y - 8, 2, 2); break;
    case 'wand': px(g, '#6a3a1a', x - 5, y + 3, 2, 2); px(g, '#8a5a2a', x - 3, y + 1, 2, 2); px(g, '#8a5a2a', x - 1, y - 1, 2, 2); px(g, '#ffe04a', x + 1, y - 6, 2, 7); px(g, '#ffe04a', x - 2, y - 3, 8, 2); px(g, '#fff', x + 1, y - 3, 2, 2); break;
    case 'lingot': px(g, '#1a1a24', x - 7, y - 3, 14, 8); px(g, '#e0a820', x - 6, y - 2, 12, 6); px(g, '#ffe070', x - 4, y - 2, 8, 2); px(g, '#fff', x - 3, y - 2, 2, 1); break;
    case 'gemme': px(g, '#1a1a24', x - 6, y - 5, 12, 10); px(g, '#2ae0e0', x - 5, y - 4, 10, 3); px(g, '#1ab0c0', x - 4, y - 1, 8, 2); px(g, '#0a8090', x - 2, y + 1, 4, 2); px(g, '#fff', x - 3, y - 4, 2, 1); break;
    case 'couronne': px(g, '#1a1a24', x - 7, y - 6, 14, 11); px(g, '#ffd24a', x - 6, y - 1, 12, 5); for (let n = 0; n < 3; n++) px(g, '#ffd24a', x - 6 + n * 5, y - 5, 2, 4); px(g, '#e02a2a', x - 1, y + 1, 2, 2); px(g, '#2ae0e0', x - 5, y + 1, 2, 2); px(g, '#2ae0e0', x + 3, y + 1, 2, 2); break;
  }
}
export function drawDoor(g, x, y, kind, open, t) {
  // x, y: top-left of the lower tile; the door is two tiles tall
  px(g, '#1a1a24', x, y - 16, 16, 32); px(g, '#6a6a7a', x + 1, y - 15, 14, 31); px(g, '#9a9aaa', x + 1, y - 15, 14, 2);
  px(g, open ? '#000' : kind === 'lock' ? '#6a2a2a' : '#2a4a6a', x + 3, y - 12, 10, 28);
  if (!open) { px(g, '#ffffff22', x + 4, y - 11, 1, 26); px(g, '#c0c0c0', x + 10, y, 2, 2); }
  const lit = Math.floor(t * 3) % 2;
  px(g, kind === 'lock' ? (lit ? '#ff4a4a' : '#8a1a1a') : kind === 'back' ? '#ffd24a' : (lit ? '#4aff7a' : '#1a8a3a'), x + 6, y - 15, 4, 2);
  if (kind === 'lock') { px(g, '#ffd24a', x + 6, y - 2, 4, 4); px(g, '#1a1a24', x + 7, y - 1, 2, 3); }
}
export function drawDeco(g, zi, x, y, v, t) {
  if (zi === 0) { px(g, '#5a5a66', x + 3, y + 10, 10, 6); px(g, '#7a7a88', x + 4, y + 10, 8, 2); }
  else if (zi === 1) { px(g, '#2a3a52', x + 6, y + 2, 4, 14); px(g, Math.floor(t * 2 + v) % 2 ? '#ff4a4a' : '#ffd24a', x + 6, y, 4, 3); }
  else if (zi === 2) { px(g, '#1a8a7a', x + 5, y + 8, 3, 8); px(g, '#6cf8d8', x + 8, y + 5, 3, 11); px(g, '#fff', x + 9, y + 6, 1, 3); }
  else { px(g, '#6a4a20', x + 7, y + 6, 2, 8); const fl = Math.floor(t * 10 + v) % 3; px(g, '#ff8a1a', x + 6, y + 2 - fl, 4, 4 + fl); px(g, '#ffe04a', x + 7, y + 4, 2, 2); }
}
export function drawLander(g, x, y) {
  // feet at y, centre x
  px(g, '#1a1a24', x - 12, y - 4, 2, 4); px(g, '#1a1a24', x + 10, y - 4, 2, 4);
  px(g, '#c8a030', x - 11, y - 14, 22, 10); px(g, '#f0c850', x - 11, y - 14, 22, 2);
  px(g, '#d0d0dc', x - 7, y - 26, 14, 12); px(g, '#3cbcfc', x - 3, y - 23, 6, 4); px(g, '#8a8a96', x - 1, y - 32, 2, 6);
  px(g, '#e02a2a', x - 7, y - 16, 14, 2);
}
