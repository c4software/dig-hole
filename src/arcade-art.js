// arcade-art.js, the shared pixels of the Moon arcade: the screen (a canvas, its CRT glass), stars, the Earth, lunar ground.
import { canvas, PAL } from './nes-art.js';

export const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const ord = (n) => n === 1 ? '1re' : n + 'e';

// the page canvas the game is blitted to, with its bezel and scanlines; `rect` null = the whole page
export function createScreen(W, H, id) {
  const cv = document.createElement('canvas');
  cv.id = id;
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:15;pointer-events:auto;image-rendering:pixelated;background:#07060a;cursor:none';
  document.body.appendChild(cv);
  const cx = cv.getContext('2d');
  const [buf, bx] = canvas(W, H);
  let rect = null, over = null, view = null;
  function place() {
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100vw', height: '100vh' });
  }
  function blit(shake = 0) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((rect?.w ?? innerWidth) * dpr), ch = Math.round((rect?.h ?? innerHeight) * dpr);
    if (cv.width !== cw || cv.height !== ch || !over) {
      cv.width = cw; cv.height = ch;
      const s = Math.max(1, Math.floor(Math.min(cw / W, ch / H))) || Math.min(cw / W, ch / H);
      const w = W * s, h = H * s;
      view = { s, w, h, ox: Math.floor((cw - w) / 2), oy: Math.floor((ch - h) / 2) };
      const [oc, ox] = canvas(w, h);
      if (s >= 3) { ox.fillStyle = 'rgba(0,0,0,.16)'; for (let j = 0; j < H; j++) ox.fillRect(0, j * s + s - Math.max(1, Math.floor(s / 3)), w, Math.max(1, Math.floor(s / 3))); }
      const g = ox.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
      ox.fillStyle = g; ox.fillRect(0, 0, w, h);
      over = oc;
    }
    const { s, w, h, ox, oy } = view;
    const dx = shake ? Math.round((Math.random() - .5) * shake * s) : 0, dy = shake ? Math.round((Math.random() - .5) * shake * s) : 0;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#07060a'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#23262e'; cx.fillRect(ox - 6, oy - 6, w + 12, h + 12);
    cx.drawImage(buf, ox + dx, oy + dy, w, h);
    cx.drawImage(over, ox, oy);
  }
  place();
  return {
    cv, buf, bx, blit,
    setRect(r) { rect = r; place(); },
    remove() { cv.remove(); },
  };
}

// a night sky: stars in three layers (x, y, brightness), twinkling a little
export function stars(seed, W, H, n = 90) {
  const R = rng(seed);
  return Array.from({ length: n }, () => ({ x: R() * W, y: R() * H, b: R(), l: R() < .5 ? 0 : R() < .7 ? 1 : 2, tw: R() * 6.28 }));
}
export function drawStars(x, list, t, W, scroll = 0, speeds = [4, 12, 30]) {
  for (const s of list) {
    const sx = ((s.x - scroll * speeds[s.l]) % W + W) % W;
    const tw = .6 + .4 * Math.sin(t * 2 + s.tw);
    const v = Math.round((70 + s.b * 150 + s.l * 25) * tw);
    x.fillStyle = `rgb(${v},${v},${Math.min(255, v + 25)})`;
    x.fillRect(Math.floor(sx), Math.floor(s.y), 1, 1);
    if (s.l === 2 && s.b > .8) { x.fillStyle = `rgba(${v},${v},255,.35)`; x.fillRect(Math.floor(sx) - 1, Math.floor(s.y), 3, 1); x.fillRect(Math.floor(sx), Math.floor(s.y) - 1, 1, 3); }
  }
}

// the Earth, seen from the Moon: a lit blue disc with continents and clouds, the night side dark
export function earth(r = 14, seed = 3) {
  const d = r * 2 + 2, [c, x] = canvas(d, d), R = rng(seed);
  const blobs = Array.from({ length: 7 }, () => [R() * 2 - 1, R() * 2 - 1, .25 + R() * .35]);
  const clouds = Array.from({ length: 9 }, () => [R() * 2 - 1, R() * 2 - 1, .08 + R() * .12]);
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    const u = (i - r - .5) / r, v = (j - r - .5) / r, q = u * u + v * v;
    if (q > 1) continue;
    const land = blobs.some(([a, b, s]) => (u - a) ** 2 + ((v - b) * 1.4) ** 2 < s * s);
    const cloud = clouds.some(([a, b, s]) => ((u - a) * .5) ** 2 + (v - b) ** 2 < s * s);
    const lit = -u * .8 - v * .5 + Math.sqrt(1 - q) * .6;
    let col = cloud ? [236, 240, 248] : land ? [74, 150, 70] : [38, 92, 200];
    if (!cloud && land && v < -.7) col = [230, 236, 240];
    const k = lit > .25 ? 1 : lit > 0 ? .7 : lit > -.25 ? .38 : .18;
    x.fillStyle = `rgb(${Math.round(col[0] * k)},${Math.round(col[1] * k)},${Math.round(col[2] * k)})`;
    x.fillRect(i, j, 1, 1);
  }
  // a thin atmosphere on the lit limb
  for (let a = 0; a < 6.28; a += .02) {
    if (Math.cos(a - 3.8) < .2) continue;
    x.fillStyle = 'rgba(140,200,255,.55)';
    x.fillRect(Math.round(r + .5 + Math.cos(a) * (r + .5)), Math.round(r + .5 + Math.sin(a) * (r + .5)), 1, 1);
  }
  return c;
}

// a strip of lunar ground, w×h: grey regolith, a ridge line, craters, pebbles
export function lunarGround(w, h, seed, { top = 3, light = [150, 150, 158], dark = [70, 70, 80] } = {}) {
  const [c, x] = canvas(w, h), R = rng(seed);
  const ridge = [];
  let y = top;
  for (let i = 0; i < w; i++) { y = clamp(y + (R() < .3 ? (R() < .5 ? -1 : 1) : 0), 0, top + 3); ridge.push(y); }
  for (let i = 0; i < w; i++) for (let j = ridge[i]; j < h; j++) {
    const t = (j - ridge[i]) / h, n = R() * .12;
    const k = 1 - t * .55 + n;
    x.fillStyle = `rgb(${Math.round(light[0] * k)},${Math.round(light[1] * k)},${Math.round(light[2] * k)})`;
    x.fillRect(i, j, 1, 1);
  }
  x.fillStyle = `rgb(${light.map(v => Math.min(255, v + 50)).join(',')})`;
  for (let i = 0; i < w; i++) x.fillRect(i, ridge[i], 1, 1);
  const cr = Math.round(w / 22);
  for (let n = 0; n < cr; n++) {
    const cx0 = R() * w, cy0 = top + 5 + R() * (h - top - 7), rr = 2 + R() * 5;
    for (let j = -rr; j <= rr; j++) for (let i = -rr * 1.8; i <= rr * 1.8; i++) {
      const q = (i / 1.8) ** 2 + j * j;
      if (q > rr * rr) continue;
      const px = Math.round(cx0 + i), py = Math.round(cy0 + j * .55);
      const rim = q > (rr - 1.2) ** 2;
      x.fillStyle = rim ? (j < 0 ? `rgb(${dark.join(',')})` : `rgb(${light.map(v => Math.min(255, v + 35)).join(',')})`) : `rgb(${dark.map(v => v + 18).join(',')})`;
      x.fillRect(px, py, 1, 1);
    }
  }
  for (let n = 0; n < w / 3; n++) { x.fillStyle = R() < .5 ? `rgb(${dark.join(',')})` : `rgb(${light.map(v => Math.min(255, v + 30)).join(',')})`; x.fillRect(Math.floor(R() * w), Math.floor(top + 4 + R() * (h - top - 4)), 1, 1); }
  return c;
}

// a pixel burst: particles flying out
export function burst(parts, x, y, col, n = 10, sp = 60, life = .5) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.28, v = sp * (.3 + Math.random() * .7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (.5 + Math.random() * .5), col });
  }
}
export function stepParts(parts, dt, g = 0) {
  for (let n = parts.length - 1; n >= 0; n--) {
    const p = parts[n];
    p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += g * dt; p.vx *= .98; p.vy *= .98;
    if (p.t <= 0) parts.splice(n, 1);
  }
}
export function drawParts(x, parts, ox = 0) {
  for (const p of parts) { x.fillStyle = p.col; x.fillRect(Math.round(p.x - ox), Math.round(p.y), p.t > .2 ? 2 : 1, p.t > .2 ? 2 : 1); }
}

// a framed box
export function box(x, x0, y0, w, h, edge = PAL.Y, fill = 'rgba(0,0,0,.8)') {
  x.fillStyle = fill; x.fillRect(x0, y0, w, h);
  x.fillStyle = edge; x.fillRect(x0, y0, w, 1); x.fillRect(x0, y0 + h - 1, w, 1); x.fillRect(x0, y0, 1, h); x.fillRect(x0 + w - 1, y0, 1, h);
}

// the Moon arcade's high-score table: in solo you rank against these regulars
export const REGULARS = [
  { name: 'tranquillité', color: 0x9adcff },
  { name: 'armstrong', color: 0xffd23c },
  { name: 'copernic', color: 0xff7aa8 },
];
