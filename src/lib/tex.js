// lib/tex.js, textures painted on a canvas: any drawing, a racer's name tag, a rounded rectangle path.
import * as THREE from 'three';
import { hexOf } from './fmt.js';

// draw(ctx, w, h) on a w×h canvas → an sRGB texture (repeat: [u, v] to tile it)
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// the tag over a racer's head: a dark pill, a dot of its colour, its name
export function tagTex(text, color, bg = 'rgba(20,14,10,.72)') {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(30, h / 2, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}
// a rounded rectangle as the current path of a 2D context
export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
