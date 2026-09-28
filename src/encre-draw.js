// encre-draw.js: the look of « encre 2D » — chunky outlined text, the backdrop, the kids and their squid form.
import { INK, INK_DARK, INK_LIGHT, rng, splatPath } from './encre-level.js';
import { rrect } from './lib/tex.js';

export const OUT = '#1a130d';
export function txt(g, s, x, y, size, fill = '#fff', align = 'center', rot = 0) {
  g.save();
  g.translate(x, y); if (rot) g.rotate(rot);
  g.font = `${size}px 'Titan One', 'Rubik', sans-serif`;
  g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(3, size * .24); g.strokeStyle = OUT;
  g.fillStyle = OUT; g.fillText(s, size * .04, size * .09);
  g.strokeText(s, 0, 0);
  g.fillStyle = fill; g.fillText(s, 0, 0);
  g.restore();
}
export { rrect };

// the backdrop: a night city in two layers, some old splats on the walls, stars
export function createBackdrop(seed) {
  const r = rng(seed ^ 0x5eed);
  const layers = [0, 1].map((k) => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 520;
    const g = c.getContext('2d');
    let x = 0;
    while (x < 1600) {
      const w = 60 + r() * (k ? 110 : 150), h = (k ? 150 : 230) + r() * (k ? 180 : 250);
      g.fillStyle = k ? '#2c2352' : '#221b42';
      g.fillRect(x, 520 - h, w, h);
      if (r() < .5) g.fillRect(x + w * .3, 520 - h - 18, w * .2, 18);
      g.fillStyle = k ? 'rgba(255,214,140,.16)' : 'rgba(255,214,140,.09)';
      for (let yy = 520 - h + 14; yy < 510; yy += 22) for (let xx = x + 8; xx < x + w - 10; xx += 16) if (r() < .35) g.fillRect(xx, yy, 7, 10);
      x += w + r() * 14;
    }
    return c;
  });
  const stars = Array.from({ length: 70 }, () => [r(), r() * .6, .5 + r() * 1.4]);
  // everything is baked at the screen's pixel size: each frame is one blit and a few unscaled strips
  let cache = null;
  function build(W, H, dpr) {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const base = mk(W, H), g = base.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#100b24'); grd.addColorStop(.6, '#231a42'); grd.addColorStop(1, '#3a285a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (const [sx, sy, sz] of stars) g.fillRect(sx * W, sy * H, sz * dpr, sz * dpr);
    g.fillStyle = 'rgba(255,190,110,.08)'; g.beginPath(); g.arc(W * .72, H * .22, Math.min(W, H) * .16, 0, 7); g.fill();
    const sc = Math.max(.7, H / dpr / 700) * dpr;
    const lay = layers.map((c) => {
      const o = mk(Math.round(c.width * sc), Math.round(c.height * sc)), og = o.getContext('2d');
      og.drawImage(c, 0, 0, o.width, o.height);
      og.globalCompositeOperation = 'source-atop'; og.fillStyle = 'rgba(15,10,30,.28)'; og.fillRect(0, 0, o.width, o.height);
      return o;
    });
    cache = { W, H, base, lay, sc };
  }
  return function draw(g, cw, ch, camX, camY, t, dpr = 1) {
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (!cache || cache.W !== W || cache.H !== H) build(W, H, dpr);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(cache.base, 0, 0);
    cache.lay.forEach((c, k) => {
      const par = k ? .35 : .15, w = c.width, off = ((camX * par * dpr) % w + w) % w;
      const oy = Math.round(H - c.height + (k ? 40 : 10) * cache.sc - (camY - 500) * par * .3 * dpr);
      for (let x = -off; x < W; x += w) g.drawImage(c, Math.round(x), oy);
    });
    g.restore();
  };
}

// a kid: round body in team ink, a visor, tentacle hair, an ink tank on the back
export function drawKid(g, e, t, alpha = 1) {
  const c = e.team, f = e.face, a = e.aim, run = e.run;
  g.save(); g.translate(e.x, e.y); g.globalAlpha = alpha;
  g.scale(e.sq, 1 / e.sq);
  g.lineWidth = 3; g.strokeStyle = OUT; g.lineJoin = 'round'; g.lineCap = 'round';
  // legs
  const la = e.air ? 3 : Math.sin(run) * 4, lb = e.air ? -2 : -Math.sin(run) * 4;
  g.fillStyle = '#2b2233';
  rrect(g, -8 + la, -11, 7, 11, 3); g.fill(); g.stroke();
  rrect(g, 1 + lb, -11, 7, 11, 3); g.fill(); g.stroke();
  // tank
  g.save(); g.translate(-f * 13, -24);
  rrect(g, -5, -9, 10, 19, 4); g.fillStyle = 'rgba(230,240,255,.85)'; g.fill();
  const lv = Math.max(0, Math.min(1, e.ink)) * 15;
  g.fillStyle = INK[c]; g.fillRect(-3.5, 8 - lv, 7, lv);
  rrect(g, -5, -9, 10, 19, 4); g.stroke();
  g.restore();
  // tentacle hair, swaying with speed
  const sw = Math.max(-1, Math.min(1, -e.vx / 300)) * 5 + Math.sin(t * 5 + e.x * .01) * 1.5;
  g.lineWidth = 7; g.strokeStyle = OUT;
  for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) {
    const ex = -f * (10 + i * 4) + sw, ey = -30 + i * 6 + (e.air ? -6 : 0);
    g.beginPath(); g.moveTo(-f * 2, -34); g.quadraticCurveTo(-f * (6 + i * 2) + sw * .5, -42 + i * 3, ex, ey);
    if (k) { g.lineWidth = 4; g.strokeStyle = i === 1 ? INK_DARK[c] : INK[c]; } g.stroke();
  }
  // body
  g.lineWidth = 3; g.strokeStyle = OUT;
  g.beginPath(); g.ellipse(0, -21, 13, 16, 0, 0, 7); g.fillStyle = INK[c]; g.fill();
  g.save(); g.clip(); g.fillStyle = INK_LIGHT[c]; g.globalAlpha *= .55; g.beginPath(); g.ellipse(-4, -30, 7, 4, -.5, 0, 7); g.fill(); g.restore();
  g.beginPath(); g.ellipse(0, -21, 13, 16, 0, 0, 7); g.stroke();
  // visor & eyes
  g.fillStyle = OUT; g.beginPath(); g.ellipse(f * 4, -25, 10, 6, 0, 0, 7); g.fill();
  const px = Math.cos(a) * 1.6, py = Math.sin(a) * 1.6;
  for (const dx of [-3.8, 3.8]) {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(f * 4 + dx, -25, 3.4, 0, 7); g.fill();
    g.fillStyle = OUT; g.beginPath(); g.arc(f * 4 + dx + px, -25 + py, 1.7, 0, 7); g.fill();
  }
  // the blaster
  g.save(); g.translate(f * 5, -15); g.rotate(a);
  g.fillStyle = '#3a3346'; rrect(g, -2, -4, 19, 8, 3); g.fill(); g.lineWidth = 2.5; g.stroke();
  g.fillStyle = INK[c]; g.fillRect(12, -2.5, 5, 5);
  g.restore();
  if (e.flash > 0) { g.globalAlpha = Math.min(1, e.flash * 5) * alpha * .8; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -21, 14, 17, 0, 0, 7); g.fill(); }
  g.restore();
}

// the squid form: a little mantle, eyes, three wiggling tentacles
export function drawSquid(g, e, t, alpha = 1, ghost = false) {
  const c = e.team;
  g.save(); g.translate(e.x, e.y - 8); g.globalAlpha = alpha;
  const ang = e.climb ? -Math.PI / 2 : e.face > 0 ? 0 : Math.PI;
  g.rotate(ang); if (!e.climb && e.face < 0) g.scale(1, -1);
  g.scale(e.sq, 1 / e.sq);
  g.lineWidth = 3; g.strokeStyle = OUT; g.lineCap = 'round'; g.lineJoin = 'round';
  if (ghost) {
    // just a ripple in the ink and two eyes peeking out
    const w = Math.sin(t * 14 + e.x * .05) * 2;
    g.strokeStyle = INK_LIGHT[c]; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-18, 7); g.quadraticCurveTo(-9, 1 + w, 0, 5); g.quadraticCurveTo(9, 1 - w, 18, 7); g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = OUT; g.lineWidth = 1.5;
    for (const dx of [4, 10]) { g.beginPath(); g.arc(dx, 2, 2.8, 0, 7); g.fill(); g.stroke(); }
    g.restore(); return;
  }
  const wig = Math.sin(t * 18 + e.x * .05) * (Math.abs(e.vx) > 40 ? 3 : 1);
  g.strokeStyle = OUT; g.lineWidth = 6;
  for (let k = 0; k < 2; k++) for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(-6, i * 3); g.quadraticCurveTo(-13, i * 5 + wig * (i ? i : 1), -20, i * 6 - wig);
    if (k) { g.lineWidth = 3.5; g.strokeStyle = INK[c]; } g.stroke();
  }
  g.lineWidth = 3; g.strokeStyle = OUT;
  g.beginPath(); g.moveTo(-8, 0); g.bezierCurveTo(-8, -10, 6, -11, 10, -9); g.lineTo(19, 0); g.lineTo(10, 9); g.bezierCurveTo(6, 11, -8, 10, -8, 0); g.closePath();
  g.fillStyle = INK[c]; g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(4, -2, 3.6, 0, 7); g.fill(); g.lineWidth = 2; g.stroke();
  g.fillStyle = OUT; g.beginPath(); g.arc(5, -2, 1.7, 0, 7); g.fill();
  if (e.flash > 0) { g.globalAlpha = Math.min(1, e.flash * 5) * alpha * .8; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(2, 0, 12, 10, 0, 0, 7); g.fill(); }
  g.restore();
}
