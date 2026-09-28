// vehicles.js, the kit every vehicle is built from: rounded boxes, real wheels (tyre, rim,
// hub), glossy glass, lamps bright enough to bloom, soft contact shadows, exhaust puffs,
// and a little spring for body roll, pitch and squash.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex as paintTex } from './lib/tex.js';

const geos = new Map();
const cached = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };

// a box with rounded edges: segments bunched in the corners, pushed out onto a radius r
export function roundBox(w, h, d, r = .08, n = 2) {
  return cached(`rb${w},${h},${d},${r},${n}`, () => {
    r = Math.min(r, w / 2, h / 2, d / 2) * .999;
    const s = 2 * n + 1, g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
    const p = g.attributes.position, nm = g.attributes.normal, half = [w / 2, h / 2, d / 2];
    const v = new THREE.Vector3(), c = new THREE.Vector3(), o = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      for (let a = 0; a < 3; a++) {
        const k = Math.round((v.getComponent(a) + .5) * s), H = half[a];
        const x = k <= n ? -H + r * k / n : H - r * (s - k) / n;
        v.setComponent(a, x); c.setComponent(a, THREE.MathUtils.clamp(x, -(H - r), H - r));
      }
      o.subVectors(v, c).normalize();
      v.copy(c).addScaledVector(o, r);
      p.setXYZ(i, v.x, v.y, v.z); nm.setXYZ(i, o.x, o.y, o.z);
    }
    return g;
  });
}

// a side profile (points in x, y) extruded across z, bevelled all round, centred on z
export function profile(pts, depth, bevel = .08, key = '') {
  return cached(`pf${key}${pts.join()}${depth},${bevel}`, () => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(depth - bevel * 2) / 2);
    g.computeVertexNormals();
    return g;
  });
}

// ---------- materials ----------
const mats = new Map();
export const mat = (color, extra = {}) => {
  const k = color + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .05, ...extra }));
  return mats.get(k);
};
export const RUBBER = () => mat(0x1b1a20, { roughness: .92 });
export const CHROME = () => mat(0xdfe4ec, { metalness: .85, roughness: .22 });
export const TRIM = () => mat(0x2a2b33, { roughness: .6 });
// glass: glossy and dark. `see` is for a cab you sit in: one-sided and translucent, so
// from outside it reads as a window and from the seat (its back face) it is not there at all
export function glass(see = false) {
  return cached('glass' + see, () => new THREE.MeshPhongMaterial({ color: 0x28405a, specular: 0xb8d8ff, shininess: 110, emissive: 0x0c1826,
    transparent: see, opacity: see ? .86 : 1, depthWrite: !see }));
}
// lamps: colours pushed over 1 so the bloom catches them
export const lamp = (color, k = 2.6) => cached('lamp' + color + k, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));

// ---------- a wheel: axle along z, spun by .spin.rotation.z ----------
export function wheel({ r = .36, w = .26, rim = CHROME(), tyre = RUBBER(), spokes = 5, key = '' } = {}) {
  const tg = cached(`ty${r},${w}`, () => {
    const ri = r * .64, e = Math.min(w * .32, r * .2), pts = [];
    pts.push(new THREE.Vector2(ri, -w / 2));
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -w / 2 + e + Math.sin(a) * e)); }
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, w / 2 - e + Math.sin(a) * e)); }
    pts.push(new THREE.Vector2(ri, w / 2));
    const g = new THREE.LatheGeometry(pts, 22); g.rotateX(Math.PI / 2); return g;
  });
  const rg = cached(`rm${r},${w},${spokes}`, () => {
    const ri = r * .66, parts = [];
    const barrel = new THREE.CylinderGeometry(ri, ri, w * .86, 20, 1, true); barrel.rotateX(Math.PI / 2); parts.push(barrel);
    for (const s of [-1, 1]) {
      const lip = new THREE.TorusGeometry(ri * .96, r * .045, 6, 22); lip.translate(0, 0, s * w * .4); parts.push(lip);
      const dish = new THREE.CylinderGeometry(ri * .92, ri * .92, .01, 20); dish.rotateX(Math.PI / 2); dish.translate(0, 0, s * w * .22); parts.push(dish);
      const cap = new THREE.CylinderGeometry(r * .2, r * .24, w * .2, 12); cap.rotateX(Math.PI / 2); cap.translate(0, 0, s * w * .32); parts.push(cap);
      for (let k = 0; k < spokes; k++) {
        const sp = new THREE.BoxGeometry(r * .13, ri * .8, w * .1); sp.translate(0, ri * .5, s * w * .28); sp.rotateZ(k / spokes * Math.PI * 2); parts.push(sp);
      }
    }
    for (const p of parts) { for (const n of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(n)) p.deleteAttribute(n); }
    return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  });
  // the dark inside of the rim, so it never looks hollow
  const hg = cached(`hb${r},${w}`, () => { const g = new THREE.CylinderGeometry(r * .64, r * .64, w * .3, 16); g.rotateX(Math.PI / 2); return g; });
  const g = new THREE.Group(), spin = new THREE.Group();
  spin.add(new THREE.Mesh(tg, tyre), new THREE.Mesh(rg, rim), new THREE.Mesh(hg, TRIM()));
  g.add(spin); g.spin = spin; g.radius = r;
  return g;
}

// ---------- soft round shadow under a vehicle ----------
const softTex = () => cached('soft', () => {
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.55, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  return new THREE.CanvasTexture(c);
});
export function contactShadow(w, d, opacity = .55) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: softTex(), color: 0x14101e, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .03; m.renderOrder = 1; m.userData.keep = true;
  return m;
}

// ---------- a painted canvas: plates, numbers, stickers ----------
export { paintTex };
export const plate = (text, bg = '#f4f1e6', fg = '#1a1a22') => cached('plate' + text + bg, () => paintTex(256, 64, (g, w, h) => {
  g.fillStyle = bg; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 10); g.fill();
  g.lineWidth = 4; g.strokeStyle = fg; g.stroke();
  g.fillStyle = '#2a4ac0'; g.fillRect(6, 6, 26, h - 12);
  g.fillStyle = fg; g.font = '900 40px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2 + 12, h / 2 + 2);
}));

// ---------- exhaust puffs: a small pool of soft sprites that swell and fade ----------
export function createPuffs(parent, max = 28, color = 0xd8d4cc) {
  const list = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.userData.keep = true; parent.add(s);
    list.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1 });
  }
  let next = 0;
  const tmp = new THREE.Vector3();
  return {
    // p in world space
    emit(p, v, size = .35, life = .9) {
      const q = list[next]; next = (next + 1) % max;
      q.s.position.copy(parent.worldToLocal(tmp.copy(p)));
      q.v.copy(v); q.life = q.max = life; q.size = size; q.s.visible = true;
    },
    update(dt) {
      for (const q of list) {
        if (q.life <= 0) continue;
        q.life -= dt;
        const t = 1 - q.life / q.max;
        q.v.y += dt * .8; q.v.multiplyScalar(1 - dt * 1.5);
        q.s.position.addScaledVector(q.v, dt);
        q.s.scale.setScalar(q.size * (.5 + t * 2.2));
        q.s.material.opacity = .55 * (1 - t) * Math.min(1, t * 8);
        if (q.life <= 0) q.s.visible = false;
      }
    },
  };
}

// ---------- a damped spring, for roll, pitch and suspension ----------
export function spring(k = 90, damp = 11) {
  return { x: 0, v: 0, step(target, dt) { dt = Math.min(dt, .05); this.v += ((target - this.x) * k - this.v * damp) * dt; this.x += this.v * dt; return this.x; }, kick(v) { this.v += v; } };
}
