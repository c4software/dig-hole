// encre-level.js: the arena of « encre 2D » — a symmetric tile map, its paintable faces cut in segments, and the ink.
import { mulberry as rng } from './lib/math.js';
export const T = 32, S = 4, SL = T / S, W = 128, H = 30, D = 10;
export const INK = ['#ff7a14', '#2e64ff'], INK_DARK = ['#b44700', '#1634b0'], INK_LIGHT = ['#ffb35c', '#8fb0ff'];

export { rng };

// a blotchy splat: one big drop, satellites, a few flung droplets
export function splatPath(g, x, y, r, rand = Math.random) {
  g.beginPath();
  g.arc(x, y, r * .82, 0, Math.PI * 2);
  const n = 7 + (rand() * 5 | 0);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, d = r * (.55 + rand() * .5), rr = r * (.16 + rand() * .22);
    g.moveTo(x + Math.cos(a) * d + rr, y + Math.sin(a) * d); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2);
  }
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2, d = r * (1 + rand() * .45), rr = r * (.05 + rand() * .07);
    g.moveTo(x + Math.cos(a) * d + rr, y + Math.sin(a) * d); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2);
  }
}

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function createLevel(seed) {
  const r = rng(seed), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const HW = W / 2, solid = new Uint8Array(W * H);
  const fill = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(HW - 1, x1); x++) solid[y * W + x] = 1; };
  // the ground: a raised base, a random walk of steps, a flat valley in the middle
  const gh = new Array(HW).fill(2);
  for (let x = 0; x < 9; x++) gh[x] = 6;
  let x = 9, h = 4;
  while (x < HW) {
    const len = ri(3, 7);
    for (let i = 0; i < len && x < HW; i++, x++) gh[x] = x >= HW - 7 ? 2 : x >= HW - 11 ? Math.min(h, 4) : h;
    h = Math.max(2, Math.min(6, h + [-2, -1, 1, 2][ri(0, 3)]));
  }
  gh[HW - 1] = gh[HW - 2] = 3;
  for (let i = 0; i < HW; i++) fill(i, H - gh[i], i, H - 1);
  fill(0, 0, 0, H - 1);
  // floating platforms, sometimes a second tier
  const plats = [];
  let px = 11;
  while (px < HW - 13) {
    const w = ri(3, 6);
    let mg = 0; for (let i = px; i < px + w; i++) mg = Math.max(mg, gh[i]);
    const row = H - mg - 4;
    fill(px, row, px + w - 1, row); plats.push([px, w, row]);
    if (r() < .55 && row - 4 >= 3) { const w2 = ri(3, 5), x2 = px + ri(-1, w - 2); fill(x2, row - 4, x2 + w2 - 1, row - 4); plats.push([x2, w2, row - 4]); }
    px += w + ri(3, 6);
  }
  // pillars to climb when painted, only where nothing hangs above
  for (let k = 0; k < 3; k++) {
    const c = ri(13, HW - 14), top = H - gh[c], ph = ri(3, 5);
    let free = true;
    for (let y = top - ph - 3; y < top; y++) for (let i = c - 1; i <= c + 1; i++) if (solid[y * W + i]) free = false;
    if (free) fill(c, top - ph, c, top - 1);
  }
  // the fort in the middle: a wide deck and a lookout
  fill(HW - 6, H - 7, HW - 1, H - 7);
  fill(HW - 3, H - 11, HW - 1, H - 11);
  // mirror: the right half is the left half, backwards
  for (let y = 0; y < H; y++) for (let i = 0; i < HW; i++) solid[y * W + (W - 1 - i)] = solid[y * W + i];

  const isS = (x, y) => (x < 0 || x >= W || y >= H) ? 1 : y < 0 ? 0 : solid[y * W + x];
  const NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const open = new Uint8Array(W * H); // bit f: face f touches the air
  const expo = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid[y * W + x]) continue;
    for (let f = 0; f < 4; f++) if (!isS(x + NB[f][0], y + NB[f][1])) {
      open[y * W + x] |= 1 << f;
      for (let s = 0; s < S; s++) expo.push(((y * W + x) * 4 + f) * S + s);
    }
  }
  const exp = Int32Array.from(expo), total = exp.length;
  const paint = new Uint8Array(W * H * 4 * S), stamp = new Float32Array(W * H * 4 * S).fill(-99), cnt = [0, 0, 0];

  // the outlines, merged into long strokes
  const lines = [];
  for (let f = 0; f < 4; f++) {
    const horiz = f === 0 || f === 2;
    const A = horiz ? H : W, B = horiz ? W : H;
    for (let a = 0; a < A; a++) {
      let run = -1;
      for (let b = 0; b <= B; b++) {
        const tx = horiz ? b : a, ty = horiz ? a : b;
        const on = b < B && (open[ty * W + tx] >> f & 1);
        if (on && run < 0) run = b;
        if (!on && run >= 0) {
          if (horiz) { const yy = (a + (f === 2 ? 1 : 0)) * T; lines.push(run * T, yy, b * T, yy); }
          else { const xx = (a + (f === 1 ? 1 : 0)) * T; lines.push(xx, run * T, xx, b * T); }
          run = -1;
        }
      }
    }
  }

  // static art: the tiles, and the mask of the bands the ink can cover
  const art = canvas(W * T, H * T), mask = canvas(W * T, H * T), ink = canvas(W * T, H * T);
  const g = art.getContext('2d'), m = mask.getContext('2d');
  m.fillStyle = '#fff';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid[y * W + x]) continue;
    const o = open[y * W + x], X = x * T, Y = y * T;
    let deep = 3;
    for (let d = 1; d <= 2; d++) if (!isS(x, y - d) || !isS(x - d, y) || !isS(x + d, y)) { deep = d; break; }
    if (o) deep = 0;
    g.fillStyle = ['#f4ecd9', '#e6dac0', '#d6c7a6', '#c9b893'][deep];
    g.fillRect(X, Y, T, T);
    g.fillStyle = 'rgba(80,60,30,.13)';
    if (deep >= 1) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(X + 8 + i * 16, Y + 8 + j * 16, 2.2, 0, 7); g.fill(); }
    g.fillRect(X, Y + T - 1.5, T, 1.5);
    if (o & 1) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(X, Y + 3, T, 3); }
    if (o & 1) m.fillRect(X, Y, T, D);
    if (o & 2) m.fillRect(X + T - D, Y, D, T);
    if (o & 4) m.fillRect(X, Y + T - D, T, D);
    if (o & 8) m.fillRect(X, Y, D, T);
  }
  // the ink layer is the art with the ink on it: one blit a frame
  const ig = ink.getContext('2d');
  ig.drawImage(art, 0, 0);
  const tmp = canvas(320, 320), tg = tmp.getContext('2d');

  function splat(x, y, rad, c) {
    let n = 0;
    const r2 = rad * rad;
    for (let ty = Math.floor((y - rad) / T); ty <= Math.floor((y + rad) / T); ty++) {
      if (ty < 0 || ty >= H) continue;
      for (let tx = Math.floor((x - rad) / T); tx <= Math.floor((x + rad) / T); tx++) {
        if (tx < 0 || tx >= W) continue;
        const o = open[ty * W + tx];
        if (!o) continue;
        for (let f = 0; f < 4; f++) {
          if (!(o >> f & 1)) continue;
          for (let s = 0; s < S; s++) {
            const along = (s + .5) * SL;
            const cx = f === 0 || f === 2 ? tx * T + along : tx * T + (f === 1 ? T : 0);
            const cy = f === 1 || f === 3 ? ty * T + along : ty * T + (f === 2 ? T : 0);
            if ((cx - x) ** 2 + (cy - y) ** 2 > r2) continue;
            const i = ((ty * W + tx) * 4 + f) * S + s;
            if (paint[i] === c) continue;
            if (paint[i]) cnt[paint[i]]--;
            paint[i] = c; cnt[c]++; n++; stamp[i] = L.clock;
          }
        }
      }
    }
    if (n) splatArt(x, y, rad, c);
    return n;
  }
  // the ink you see: a splat drawn on a scrap canvas, cut to the bands, then laid on the ink layer
  function splatArt(x, y, rad, c) {
    const R = Math.min(150, Math.ceil(rad * 1.5)), sz = R * 2;
    tg.clearRect(0, 0, sz, sz);
    tg.fillStyle = INK[c - 1];
    splatPath(tg, R, R, rad);
    tg.fill();
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(mask, x - R, y - R, sz, sz, 0, 0, sz, sz);
    tg.globalCompositeOperation = 'source-over';
    ig.drawImage(tmp, 0, 0, sz, sz, x - R, y - R, sz, sz);
  }
  function segArt(i, c) {
    const tile = i / (4 * S) | 0, f = (i / S | 0) % 4, s = i % S, X = (tile % W) * T, Y = (tile / W | 0) * T;
    const rect = f === 0 ? [X + s * SL, Y, SL, D] : f === 1 ? [X + T - D, Y + s * SL, D, SL] : f === 2 ? [X + s * SL, Y + T - D, SL, D] : [X, Y + s * SL, D, SL];
    ig.drawImage(art, ...rect, ...rect);
    if (c) { ig.fillStyle = INK[c - 1]; ig.fillRect(...rect); }
  }
  function setSeg(i, c) {
    if (paint[i] === c) return;
    if (paint[i]) cnt[paint[i]]--;
    paint[i] = c; if (c) cnt[c]++;
    segArt(i, c);
  }

  const solidAt = (px, py) => isS(Math.floor(px / T), Math.floor(py / T));
  // who owns the surface at a point, seen from the air on side f of the tile the point is in
  function ownerAt(px, py, f) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || tx >= W || ty < 0 || ty >= H || !(open[ty * W + tx] >> f & 1)) return 0;
    const along = f === 0 || f === 2 ? px - tx * T : py - ty * T;
    return paint[((ty * W + tx) * 4 + f) * S + Math.max(0, Math.min(S - 1, along / SL | 0))];
  }

  // the host's corrections: 4 segments a byte
  const CH = 1200, chunks = Math.ceil(total / CH);
  function encode(k) {
    const a = k * CH, b = Math.min(total, a + CH);
    const bytes = new Uint8Array(Math.ceil((b - a) / 4));
    for (let j = a; j < b; j++) bytes[(j - a) >> 2] |= paint[exp[j]] << (((j - a) & 3) * 2);
    let s = ''; for (const v of bytes) s += String.fromCharCode(v);
    return btoa(s);
  }
  function apply(k, str) {
    const a = k * CH, b = Math.min(total, a + CH), s = atob(str);
    for (let j = a; j < b; j++) {
      const v = (s.charCodeAt((j - a) >> 2) >> (((j - a) & 3) * 2)) & 3, i = exp[j];
      if (v <= 2 && paint[i] !== v && L.clock - stamp[i] > 1.5) setSeg(i, v);
    }
  }

  const spawn = [{ x: 4 * T + T / 2, y: (H - 6) * T }, { x: W * T - 4 * T - T / 2, y: (H - 6) * T }];
  // the column tops, for the bots to find the front
  const ground = Array.from({ length: W }, (_, i) => { let y = H - 1; while (y > 0 && solid[(y - 1) * W + i]) y--; return y; });
  const L = { clock: 0, solid, open, paint, cnt, total, lines: Float32Array.from(lines), art, ink, spawn, ground, chunks, plats,
    isS, solidAt, ownerAt, splat, setSeg, encode, apply, wpx: W * T, hpx: H * T };
  return L;
}
