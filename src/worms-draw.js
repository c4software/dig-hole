// worms-draw.js: the look of « taupes de guerre » — outlined text, the helmeted moles, their weapons, the sky.
import { rng, W } from './worms-map.js';

export const OUT = '#1a130d';
export const TEAM = [
  { name: 'les rouges', c: '#ff3d5e', d: '#a8182f' },
  { name: 'les bleus', c: '#3f7bff', d: '#1a3fa0' },
  { name: 'les verts', c: '#39d06a', d: '#17803a' },
  { name: 'les jaunes', c: '#ffb020', d: '#b06a00' },
];
// the font comes in a few sizes only (a new size each frame makes the browser build glyphs again): scaled to fit
export function txt(g, s, x, y, size, fill = '#fff', align = 'center', rot = 0) {
  if (!(size > .5)) return;
  const base = size < 12 ? 12 : size < 24 ? 24 : 48, k = size / base;
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot);
  g.scale(k, k); size = base;
  g.font = `${size}px 'Titan One', 'Rubik', sans-serif`;
  g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(2.5, size * .24); g.strokeStyle = OUT;
  g.fillStyle = OUT; g.fillText(s, size * .04, size * .09);
  g.strokeText(s, 0, 0);
  g.fillStyle = fill; g.fillText(s, 0, 0);
  g.restore();
}
export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); };

// a weapon, centred on the paw, pointing along +x
export function drawWeapon(g, id, t = 0) {
  g.lineJoin = 'round'; g.lineWidth = 1.8; g.strokeStyle = OUT;
  switch (id) {
    case 'bazooka':
      g.fillStyle = '#6f8a3a'; rrect(g, -9, -3.6, 25, 7.2, 3); g.fill(); g.stroke();
      g.fillStyle = '#4c6326'; g.fillRect(12, -4.6, 5, 9.2); g.strokeRect(12, -4.6, 5, 9.2);
      g.fillStyle = '#ffb020'; g.fillRect(-2, -3.6, 3, 7.2);
      g.fillStyle = '#3a3a3a'; g.fillRect(-1, 3, 3, 5); break;
    case 'grenade':
      g.fillStyle = '#4f8a3a'; ell(g, 3, 0, 6, 7); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(-1, -2); g.lineTo(7, -2); g.moveTo(-1, 2); g.lineTo(7, 2); g.stroke();
      g.strokeStyle = OUT; g.fillStyle = '#b8b8b8'; g.fillRect(1, -10, 4, 4); g.strokeRect(1, -10, 4, 4);
      g.beginPath(); g.arc(7, -9, 2.5, 0, 7); g.stroke(); break;
    case 'grappe':
      g.fillStyle = '#d83a2a'; ell(g, 3, 0, 7, 7); g.fill(); g.stroke();
      g.fillStyle = '#ffd21f'; for (const [a, b] of [[0, -3], [5, 2], [1, 3], [6, -3]]) { g.beginPath(); g.arc(a, b, 1.3, 0, 7); g.fill(); }
      g.fillStyle = '#b8b8b8'; g.fillRect(1, -10, 4, 3.5); g.strokeRect(1, -10, 4, 3.5); break;
    case 'fusil':
      g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(-10, -2); g.lineTo(0, -3); g.lineTo(0, 3); g.lineTo(-10, 5); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#6a6a72'; g.fillRect(0, -3, 22, 3); g.strokeRect(0, -3, 22, 3); g.fillRect(0, 0, 18, 2.6); g.strokeRect(0, 0, 18, 2.6); break;
    case 'dyna':
      g.fillStyle = '#e8342a'; rrect(g, -3, -9, 8, 18, 2); g.fill(); g.stroke();
      g.fillStyle = '#f5e6c0'; g.fillRect(-3, -2, 8, 4);
      g.strokeStyle = '#3a2a1a'; g.beginPath(); g.moveTo(1, -9); g.quadraticCurveTo(4, -14, 1, -16); g.stroke();
      g.fillStyle = (t * 10 | 0) % 2 ? '#ffd21f' : '#ff7a1a'; g.beginPath(); g.arc(1, -16.5, 2.4, 0, 7); g.fill(); break;
    case 'frappe':
      g.fillStyle = '#5a6a3a'; rrect(g, -4, -7, 11, 14, 2.5); g.fill(); g.stroke();
      g.fillStyle = '#1a2a1a'; g.fillRect(-2, -5, 7, 4);
      g.fillStyle = '#ff3d5e'; g.beginPath(); g.arc(1.5, 3, 1.6, 0, 7); g.fill();
      g.beginPath(); g.moveTo(4, -7); g.lineTo(6, -16); g.stroke();
      g.fillStyle = '#ff3d5e'; g.beginPath(); g.arc(6, -16, 1.8, 0, 7); g.fill(); break;
    case 'tp':
      g.fillStyle = '#b07aff'; rrect(g, -4, -3, 16, 6, 3); g.fill(); g.stroke();
      g.fillStyle = '#e8d8ff'; g.beginPath(); g.arc(14, 0, 4 + Math.sin(t * 8), 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { const a = t * 4 + k * 2.1; g.fillRect(14 + Math.cos(a) * 8 - 1, Math.sin(a) * 8 - 1, 2, 2); } break;
  }
}

// a mole in a helmet, feet at (0,0), facing +x (flipped by the caller)
export function drawMole(g, m, col, t) {
  const f = m.face, blink = (t + m.i * .77) % 3.3 < .12, hurt = m.hurtT < .35;
  const bob = m.walk ? Math.abs(Math.sin(m.walk * .5)) * 1.6 : 0;
  g.save(); g.translate(m.x, m.y - bob); g.scale(f, 1);
  if (m.air) g.rotate(Math.max(-.6, Math.min(.6, (m.vx * f) * .0015 + m.vy * .0006)));
  g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 2;
  // feet
  g.fillStyle = '#f2a0b4';
  const st = m.walk ? Math.sin(m.walk * .5) * 2.5 : 0;
  ell(g, -5 + st, -1.8, 4.2, 2.4); g.fill(); g.stroke();
  ell(g, 5 - st, -1.8, 4.2, 2.4); g.fill(); g.stroke();
  // body, belly
  g.fillStyle = hurt ? '#a07888' : '#5e4d5c'; ell(g, 0, -12.5, 10.5, 12); g.fill(); g.stroke();
  g.fillStyle = '#8a7584'; ell(g, 3, -9, 6, 7); g.fill();
  // snout, nose, whiskers
  g.fillStyle = '#c9a3b4'; ell(g, 9, -13.5, 5.2, 3.8); g.fill(); g.stroke();
  g.fillStyle = '#ff7fa4'; g.beginPath(); g.arc(13.6, -14.2, 2.7, 0, 7); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(26,19,13,.6)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(10, -12); g.lineTo(17, -10); g.moveTo(10, -11.5); g.lineTo(16, -8.3); g.stroke();
  g.strokeStyle = OUT; g.lineWidth = 2;
  // eyes: tiny, moles barely see
  if (blink || hurt) { g.beginPath(); g.moveTo(3.2, -17.2); g.lineTo(6.6, -17.2); g.stroke(); }
  else { g.fillStyle = OUT; g.beginPath(); g.arc(5, -17.4, 1.9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(5.2, -18.6, 1, 1); }
  // the helmet, in the team's colour
  g.fillStyle = col.c; g.beginPath(); g.arc(-.5, -19.3, 10, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = col.d; rrect(g, -12.5, -20.6, 24, 3.4, 1.7); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.4)'; ell(g, -4, -25, 3.4, 1.8, -.3); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-1, -23.5, 1.5, 0, 7); g.fill();
  // the weapon and the paws holding it
  if (m.hold) {
    g.save(); g.translate(2, -9.5); g.rotate(-m.aim);
    drawWeapon(g, m.hold, t);
    g.fillStyle = '#f2a0b4'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(1, 2.5, 2.6, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(7, 1.5, 2.6, 0, 7); g.fill(); g.stroke();
    g.restore();
  } else {
    g.fillStyle = '#f2a0b4'; g.lineWidth = 1.6;
    ell(g, 7, -6, 3, 2.4); g.fill(); g.stroke();
  }
  g.restore();
}

// what stays of a fallen mole: a mound with its helmet on top
export function drawGrave(g, x, y, col) {
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 2;
  g.fillStyle = '#7a4a28'; g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(0, -18, 13, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#5a3418'; for (const [a, b] of [[-5, -4], [3, -7], [6, -2]]) { g.beginPath(); g.arc(a, b, 1.5, 0, 7); g.fill(); }
  g.fillStyle = col.c; g.beginPath(); g.arc(0, -10, 7.5, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = col.d; rrect(g, -9.5, -11, 19, 3, 1.5); g.fill(); g.stroke();
  g.restore();
}

export function drawCrate(g, c, t) {
  g.save(); g.translate(c.x, c.y); g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 2;
  if (c.fall) {
    g.rotate(Math.sin(t * 2.4 + c.id) * .12);
    g.strokeStyle = 'rgba(26,19,13,.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-9, -16); g.lineTo(-20, -44); g.moveTo(9, -16); g.lineTo(20, -44); g.moveTo(0, -16); g.lineTo(0, -48); g.stroke();
    g.strokeStyle = OUT; g.lineWidth = 2;
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-24, -42); g.quadraticCurveTo(0, -70, 24, -42); g.quadraticCurveTo(12, -48, 0, -44); g.quadraticCurveTo(-12, -48, -24, -42); g.fill(); g.stroke();
    g.fillStyle = c.k === 'soin' ? '#ff3d5e' : '#3f7bff'; g.beginPath(); g.moveTo(-8, -55); g.quadraticCurveTo(0, -60, 8, -55); g.lineTo(6, -46); g.lineTo(-6, -46); g.fill();
  }
  g.fillStyle = c.k === 'soin' ? '#f4efe6' : '#c8883e'; rrect(g, -10, -18, 20, 18, 3); g.fill(); g.stroke();
  if (c.k === 'soin') { g.fillStyle = '#ff3d5e'; g.fillRect(-2.5, -15, 5, 12); g.fillRect(-6, -11.5, 12, 5); }
  else { g.strokeStyle = 'rgba(26,19,13,.5)'; g.beginPath(); g.moveTo(-10, -9); g.lineTo(10, -9); g.stroke(); txt(g, '?', 0, -9, 13, '#ffd21f'); }
  g.restore();
}

// the backdrop: a sunny sky, clouds pushed by the wind, far hills, giant garden plants
export function createBackdrop(seed) {
  const r = rng(seed ^ 0xb4c7);
  const layer = (k) => {
    const c = document.createElement('canvas'); c.width = 1800; c.height = 520;
    const g = c.getContext('2d');
    if (k === 0) {
      g.fillStyle = '#9ccbe0';
      g.beginPath(); g.moveTo(0, 520);
      for (let x = 0; x <= 1800; x += 20) g.lineTo(x, 330 - 70 * Math.sin(x / 1800 * Math.PI * 4 + 1) - 40 * Math.sin(x / 1800 * Math.PI * 10));
      g.lineTo(1800, 520); g.fill();
      g.fillStyle = '#b4d9e8';
      for (let i = 0; i < 16; i++) { const x = r() * 1800, s = 20 + r() * 30; g.beginPath(); g.arc(x, 330, s, Math.PI, 0); g.fill(); }
    } else {
      // a fence, sunflowers and leek tops, much bigger than us
      g.fillStyle = '#6fae7a';
      for (let x = 0; x < 1800; x += 46) { g.fillRect(x, 300, 36, 220); g.beginPath(); g.moveTo(x, 300); g.lineTo(x + 18, 282); g.lineTo(x + 36, 300); g.fill(); }
      g.fillRect(0, 340, 1800, 12); g.fillRect(0, 440, 1800, 12);
      for (let i = 0; i < 5; i++) {
        const x = 150 + i * 360 + r() * 120, top = 60 + r() * 90;
        g.fillStyle = '#4f9a5a'; g.fillRect(x - 6, top, 12, 520 - top);
        g.beginPath(); g.ellipse(x - 30, top + 160, 34, 12, -.5, 0, 7); g.ellipse(x + 30, top + 230, 34, 12, .5, 0, 7); g.fill();
        g.fillStyle = '#e8b830'; for (let a = 0; a < 16; a++) { g.beginPath(); g.ellipse(x + Math.cos(a / 16 * 6.28) * 40, top + Math.sin(a / 16 * 6.28) * 40, 20, 9, a / 16 * 6.28, 0, 7); g.fill(); }
        g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(x, top, 30, 0, 7); g.fill();
      }
      g.fillStyle = '#5aa468';
      for (let x = 0; x < 1800; x += 12) { const h = 40 + r() * 70; g.beginPath(); g.moveTo(x, 520); g.quadraticCurveTo(x + 4, 520 - h * .6, x + (r() - .5) * 20, 520 - h); g.lineTo(x + 8, 520); g.fill(); }
    }
    return c;
  };
  const layers = [layer(0), layer(1)];
  const clouds = Array.from({ length: 9 }, () => ({ x: r() * 3000, y: 30 + r() * 170, s: .6 + r() * .9, k: r() * .6 + .2 }));
  let sky = null, skyH = 0;
  return (g, cw, ch, cam, z, t, wind, dt) => {
    if (!sky || skyH !== ch) {
      skyH = ch; sky = g.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, '#3d8de0'); sky.addColorStop(.55, '#8fd0ff'); sky.addColorStop(1, '#fff0c8');
    }
    g.fillStyle = sky; g.fillRect(0, 0, cw, ch);
    // the sun
    g.fillStyle = 'rgba(255,240,170,.35)'; g.beginPath(); g.arc(cw * .8, ch * .18, 60 * ch / 700, 0, 7); g.fill();
    g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(cw * .8, ch * .18, 38 * ch / 700, 0, 7); g.fill();
    // clouds drift with the wind
    const k = ch / 700;
    for (const c of clouds) {
      c.x += (6 + wind * 60) * c.k * dt;
      const w = 3000, x = ((c.x - cam.x * c.k * .3) % w + w) % w - 300;
      const y = c.y * k, s = c.s * k;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(x, y, 30 * s, 0, 7); g.arc(x + 34 * s, y - 12 * s, 36 * s, 0, 7); g.arc(x + 70 * s, y, 28 * s, 0, 7); g.rect(x, y, 70 * s, 28 * s); g.fill();
    }
    // two layers of scenery, parallax
    [[.2, .62], [.45, .74]].forEach(([p, h], i) => {
      const L = layers[i], s = ch / 700 * (i ? 1.1 : 1), lw = L.width * s, lh = L.height * s;
      const y = ch * h - lh * .6 - (cam.y - 600) * z * p * .5;
      let x = -((cam.x * z * p) % lw); if (x > 0) x -= lw;
      for (; x < cw; x += lw) g.drawImage(L, x, y, lw, lh);
      g.fillStyle = i ? '#5aa468' : '#9ccbe0'; if (y + lh < ch) g.fillRect(0, y + lh - 1, cw, ch - y - lh + 1);
    });
  };
}

// the water: bands of waves, drawn over everything from its level down
export function drawWater(g, x0, x1, y, yb, t, back) {
  const layers = back ? [['#3f8fd0', .9, 0]] : [['rgba(40,120,200,.78)', 1, 1.3], ['rgba(24,86,160,.88)', 1.6, 2.4]];
  for (const [c, a, off] of layers) {
    const yy = y + off * 12 - (back ? 10 : 0);
    g.fillStyle = c; g.beginPath(); g.moveTo(x0, yb);
    for (let x = Math.floor(x0 / 16) * 16; x <= x1 + 16; x += 16) g.lineTo(x, yy + Math.sin(x * .03 * a + t * (1.6 + off) + off) * 5);
    g.lineTo(x1 + 16, yb); g.closePath(); g.fill();
    if (!back && off < 2) {
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2.5; g.beginPath();
      for (let x = Math.floor(x0 / 16) * 16; x <= x1 + 16; x += 16) { const v = yy + Math.sin(x * .03 * a + t * (1.6 + off) + off) * 5; x === Math.floor(x0 / 16) * 16 ? g.moveTo(x, v) : g.lineTo(x, v); }
      g.stroke();
    }
  }
}
export const MAP_W = W;
