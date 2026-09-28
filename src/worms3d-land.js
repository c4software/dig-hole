// worms3d-land.js, the island of « vers de terre 3D »: a density field on a grid (positive is
// ground), drawn with surface nets in chunks, dug by explosions and grown by girders. The same
// seed makes the same island everywhere; after that only the explosions travel.
import * as THREE from 'three';
import { rng16807 as rng } from './lib/math.js';

export const VS = .5;                          // one cell, 50 cm
export const NX = 96, NY = 40, NZ = 96;        // 48 m x 20 m x 48 m
export const HALF = NX * VS / 2;
export const TOP = NY * VS;
export const WATER0 = 3;                       // the sea at the start
const PX = NX + 1, PY = NY + 1, PZ = NZ + 1;
const C = 16;                                  // cells a chunk, each way
const NCX = Math.ceil(NX / C), NCY = Math.ceil(NY / C), NCZ = Math.ceil(NZ / C);

export { rng };
// seeded value noise
function noiseKit(seed) {
  const h3 = (i, j, k) => {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
      l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
  }
  const fbm2 = (x, z) => n3(x, 0, z) * .55 + n3(x * 2.1, 3.3, z * 2.1) * .28 + n3(x * 4.3, 7.7, z * 4.3) * .17;
  const fbm3 = (x, y, z) => n3(x, y, z) * .65 + n3(x * 2.3, y * 2.3, z * 2.3) * .35;
  return { n3, fbm2, fbm3 };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- the field ----------
// d: density at each grid point; hTop: the ground's first height (grass above it); mat: 1 where a girder stands
export function makeField(seed) {
  const d = new Float32Array(PX * PY * PZ), mat = new Uint8Array(PX * PY * PZ), hTop = new Float32Array(PX * PZ);
  const r = rng(seed), { fbm2, fbm3 } = noiseKit(seed % 100000);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28], ox = r() * 50, oz = r() * 50;
  // a few mesas and a crater lake, so no two islands read the same
  const bumps = Array.from({ length: 3 + Math.floor(r() * 3) }, () => { const a = r() * 6.28, rr = 4 + r() * 10; return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, s: 2.5 + r() * 3.5, h: 3 + r() * 5 }; });
  const pit = { x: (r() - .5) * 14, z: (r() - .5) * 14, s: 3 + r() * 2 };
  for (let k = 0; k <= NZ; k++) for (let i = 0; i <= NX; i++) {
    const x = i * VS - HALF, z = k * VS - HALF, a = Math.atan2(z, x);
    const rad = 17 + 2.6 * Math.sin(2 * a + ph[0]) + 2 * Math.sin(3 * a + ph[1]) + 1.3 * Math.sin(5 * a + ph[2]);
    const rr = Math.hypot(x, z) / rad;
    const mask = 1 - smooth(.55, 1.08, rr);
    let h = fbm2(x * .055 + ox, z * .055 + oz) * 9 + 1.5;
    for (const b of bumps) h += b.h * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.s * b.s * 2));
    h -= 3.5 * Math.exp(-((x - pit.x) ** 2 + (z - pit.z) ** 2) / (pit.s * pit.s * 2));
    // soft terraces
    h = h * .7 + Math.round(h / 1.6) * 1.6 * .3;
    hTop[i + PX * k] = 1 + mask * (WATER0 + h);
  }
  for (let j = 0; j <= NY; j++) for (let k = 0; k <= NZ; k++) for (let i = 0; i <= NX; i++) {
    const n = i + PX * (k + PZ * j), y = j * VS;
    if (j === 0) { d[n] = 1; continue; }
    if (i === 0 || k === 0 || i === NX || k === NZ || j === NY) { d[n] = -1; continue; }
    const x = i * VS - HALF, z = k * VS - HALF, h = hTop[i + PX * k];
    let v = h - y;
    // overhangs and arches above the waterline
    if (v > -3 && v < 6 && y > WATER0) v += (fbm3(x * .09 + ox, y * .11, z * .09 + oz) - .5) * 5 * smooth(WATER0, WATER0 + 3, y);
    d[n] = Math.max(-3, Math.min(3, v));
  }
  return { d, mat, hTop, seed };
}

// ---------- sampling ----------
export function createLand(field) {
  const { d, mat, hTop } = field;
  const P = (i, j, k) => i + PX * (k + PZ * j);
  function dens(x, y, z) {
    if (y < 0) return 1;
    const fx = (x + HALF) / VS, fy = y / VS, fz = (z + HALF) / VS;
    if (fx < 0 || fz < 0 || fx >= NX || fz >= NZ || fy >= NY) return -1;
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k;
    const n = P(i, j, k);
    const a = d[n], b = d[n + 1], c = d[n + PX], e = d[n + PX + 1];
    const n2 = n + PX * PZ;
    const a2 = d[n2], b2 = d[n2 + 1], c2 = d[n2 + PX], e2 = d[n2 + PX + 1];
    const l0 = (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * w;
    const l1 = (a2 + (b2 - a2) * u) + ((c2 + (e2 - c2) * u) - (a2 + (b2 - a2) * u)) * w;
    return l0 + (l1 - l0) * v;
  }
  const solid = (x, y, z) => dens(x, y, z) > 0;
  // outward normal: down the density
  function normal(x, y, z, out = new THREE.Vector3()) {
    const e = .3;
    out.set(dens(x - e, y, z) - dens(x + e, y, z), dens(x, y - e, z) - dens(x, y + e, z), dens(x, y, z - e) - dens(x, y, z + e));
    const l = out.length();
    return l > 1e-5 ? out.divideScalar(l) : out.set(0, 1, 0);
  }
  // the first ground under (x, from, z), or -Infinity
  function groundBelow(x, from, z, down = TOP) {
    let y = from;
    if (solid(x, y, z)) return null;
    for (let s = 0; s < down / .1; s++) {
      y -= .1;
      if (y < -1) return -Infinity;
      if (solid(x, y, z)) {
        // refine the crossing
        let lo = y, hi = y + .1;
        for (let n = 0; n < 5; n++) { const m = (lo + hi) / 2; if (solid(x, m, z)) lo = m; else hi = m; }
        return hi;
      }
    }
    return -Infinity;
  }
  // the highest ground of a column
  function topAt(x, z) { const g = groundBelow(x, TOP - .1, z); return g == null ? TOP : g; }
  // a ray against the ground: the distance to the first solid, or null
  function ray(o, dir, max, step = .12) {
    for (let t = 0; t < max; t += step) if (solid(o.x + dir.x * t, o.y + dir.y * t, o.z + dir.z * t)) {
      let lo = Math.max(0, t - step), hi = t;
      for (let n = 0; n < 6; n++) { const m = (lo + hi) / 2; if (solid(o.x + dir.x * m, o.y + dir.y * m, o.z + dir.z * m)) hi = m; else lo = m; }
      return lo;
    }
    return null;
  }

  // ---------- editing ----------
  const dirty = new Set();
  function mark(i0, j0, k0, i1, j1, k1) {
    for (let cj = Math.max(0, Math.floor((j0 - 1) / C)); cj <= Math.min(NCY - 1, Math.floor((j1 + 1) / C)); cj++)
      for (let ck = Math.max(0, Math.floor((k0 - 1) / C)); ck <= Math.min(NCZ - 1, Math.floor((k1 + 1) / C)); ck++)
        for (let ci = Math.max(0, Math.floor((i0 - 1) / C)); ci <= Math.min(NCX - 1, Math.floor((i1 + 1) / C)); ci++) dirty.add(ci + ',' + cj + ',' + ck);
  }
  const clampI = (v, n) => Math.max(0, Math.min(n, v));
  // a ball out of the ground; returns how many points changed
  function carve(cx, cy, cz, r) {
    const i0 = clampI(Math.floor((cx - r + HALF) / VS) - 1, NX), i1 = clampI(Math.ceil((cx + r + HALF) / VS) + 1, NX);
    const j0 = clampI(Math.floor((cy - r) / VS) - 1, NY), j1 = clampI(Math.ceil((cy + r) / VS) + 1, NY);
    const k0 = clampI(Math.floor((cz - r + HALF) / VS) - 1, NZ), k1 = clampI(Math.ceil((cz + r + HALF) / VS) + 1, NZ);
    let n = 0;
    for (let j = Math.max(1, j0); j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const x = i * VS - HALF - cx, y = j * VS - cy, z = k * VS - HALF - cz;
      const s = Math.sqrt(x * x + y * y + z * z) - r;
      const p = P(i, j, k);
      if (s < d[p]) { d[p] = Math.max(-3, s); if (s <= 0) mat[p] = 0; n++; }
    }
    mark(i0, j0, k0, i1, j1, k1);
    return n;
  }
  // a girder: a box `len` long along (dx, dy, dz), 0.5 thick
  const tmpV = new THREE.Vector3(), ax = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3();
  function girder(cx, cy, cz, yaw, pitch, len = 4) {
    ax.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    up.crossVectors(side, ax).normalize();
    const hl = len / 2, hw = .45, ht = .3, ext = hl + 1;
    const i0 = clampI(Math.floor((cx - ext + HALF) / VS), NX), i1 = clampI(Math.ceil((cx + ext + HALF) / VS), NX);
    const j0 = clampI(Math.floor((cy - ext) / VS), NY), j1 = clampI(Math.ceil((cy + ext) / VS), NY - 1);
    const k0 = clampI(Math.floor((cz - ext + HALF) / VS), NZ), k1 = clampI(Math.ceil((cz + ext + HALF) / VS), NZ);
    for (let j = Math.max(1, j0); j <= j1; j++) for (let k = Math.max(1, k0); k <= Math.min(NZ - 1, k1); k++) for (let i = Math.max(1, i0); i <= Math.min(NX - 1, i1); i++) {
      tmpV.set(i * VS - HALF - cx, j * VS - cy, k * VS - HALF - cz);
      const a = Math.abs(tmpV.dot(ax)) - hl, b = Math.abs(tmpV.dot(side)) - hw, c = Math.abs(tmpV.dot(up)) - ht;
      const s = -Math.max(a, b, c);   // positive inside the box
      const p = P(i, j, k);
      if (s > d[p]) { d[p] = Math.min(3, s); mat[p] = 1; }
    }
    mark(i0, j0, k0, i1, j1, k1);
  }

  // ---------- meshing: surface nets, a vertex per crossed cell ----------
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const chunks = new Map();
  const vmap = new Int32Array((C + 2) ** 3);
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cd = new Float32Array(8);
  const nrm = new THREE.Vector3(), col = new THREE.Color();
  const GRASS = [new THREE.Color(0x5cb846), new THREE.Color(0x4ea83c), new THREE.Color(0x6cc452)];
  const EARTH = [new THREE.Color(0x9a6a40), new THREE.Color(0x86582f), new THREE.Color(0xa87a4c)];
  const SAND = new THREE.Color(0xe6d09a), ROCK = new THREE.Color(0x7c746c), STEEL = new THREE.Color(0xc0482a), DARK = new THREE.Color(0x5a3a22);
  function colorAt(x, y, z, n, girderHere) {
    if (girderHere) return col.copy(STEEL).multiplyScalar(.85 + ((Math.floor(x * 2) + Math.floor(z * 2)) & 1) * .15);
    const gi = Math.round((x + HALF) / VS), gk = Math.round((z + HALF) / VS);
    const h = hTop[Math.max(0, Math.min(NX, gi)) + PX * Math.max(0, Math.min(NZ, gk))];
    const wob = Math.sin(x * 1.7 + z * .9) * .5 + Math.sin(z * 2.3 - x * .7) * .3;
    if (y < WATER0 + .5 + wob * .3) return col.copy(SAND).multiplyScalar(.92 + wob * .06);
    if (n.y > .55 && y > h - .9) return col.copy(GRASS[(Math.floor(x * .8 + wob) + Math.floor(z * .8)) & 1 ? 0 : 1]).lerp(GRASS[2], Math.max(0, wob) * .5);
    if (y < 1.6) return col.copy(ROCK);
    // strata down the walls, darker the deeper under the lawn
    const band = Math.floor((y + wob * .4) * 1.4) % 3;
    col.copy(EARTH[(band + 3) % 3]);
    return col.lerp(DARK, Math.min(.5, Math.max(0, (h - y - 1) * .08)));
  }
  function buildChunk(ci, cj, ck) {
    const key = ci + ',' + cj + ',' + ck;
    const old = chunks.get(key);
    if (old) { group.remove(old); old.geometry.dispose(); chunks.delete(key); }
    const i0 = ci * C, j0 = cj * C, k0 = ck * C, i1 = Math.min(NX, i0 + C), j1 = Math.min(NY, j0 + C), k1 = Math.min(NZ, k0 + C);
    const bi = Math.max(0, i0 - 1), bj = Math.max(0, j0 - 1), bk = Math.max(0, k0 - 1);
    const W = C + 2;
    const vi = (i, j, k) => (i - bi) + W * ((k - bk) + W * (j - bj));
    vmap.fill(-1);
    const pos = [], nor = [], cols = [], idx = [];
    let nv = 0;
    for (let j = bj; j < j1; j++) for (let k = bk; k < k1; k++) for (let i = bi; i < i1; i++) {
      let m = 0;
      for (let c = 0; c < 8; c++) { const v = d[P(i + (c & 1), j + (c >> 2 & 1), k + (c >> 1 & 1))]; cd[c] = v; if (v > 0) m |= 1 << c; }
      if (m === 0 || m === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        const va = cd[a], vb = cd[b];
        if ((va > 0) === (vb > 0)) continue;
        const t = va / (va - vb);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * t; sz += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * t;
        n++;
      }
      const x = (i + sx / n) * VS - HALF, y = (j + sy / n) * VS, z = (k + sz / n) * VS - HALF;
      normal(x, y, z, nrm);
      let g = 0;
      for (let c = 0; c < 8; c++) if (mat[P(i + (c & 1), j + (c >> 2 & 1), k + (c >> 1 & 1))]) { g = 1; break; }
      colorAt(x, y, z, nrm, g);
      pos.push(x, y, z); nor.push(nrm.x, nrm.y, nrm.z); cols.push(col.r, col.g, col.b);
      vmap[vi(i, j, k)] = nv++;
    }
    const quad = (a, b, c, e, flip) => {
      if (a < 0 || b < 0 || c < 0 || e < 0) return;
      if (flip) idx.push(a, e, c, a, c, b); else idx.push(a, b, c, a, c, e);
    };
    for (let j = j0; j < j1; j++) for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
      const da = d[P(i, j, k)] > 0;
      if (i < NX && j >= 1 && k >= 1 && da !== (d[P(i + 1, j, k)] > 0))
        quad(vmap[vi(i, j - 1, k - 1)], vmap[vi(i, j, k - 1)], vmap[vi(i, j, k)], vmap[vi(i, j - 1, k)], !da);
      if (j < NY && i >= 1 && k >= 1 && da !== (d[P(i, j + 1, k)] > 0))
        quad(vmap[vi(i - 1, j, k - 1)], vmap[vi(i - 1, j, k)], vmap[vi(i, j, k)], vmap[vi(i, j, k - 1)], !da);
      if (k < NZ && i >= 1 && j >= 1 && da !== (d[P(i, j, k + 1)] > 0))
        quad(vmap[vi(i - 1, j - 1, k)], vmap[vi(i, j - 1, k)], vmap[vi(i, j, k)], vmap[vi(i - 1, j, k)], !da);
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh); chunks.set(key, mesh);
  }
  function buildAll() { for (let cj = 0; cj < NCY; cj++) for (let ck = 0; ck < NCZ; ck++) for (let ci = 0; ci < NCX; ci++) buildChunk(ci, cj, ck); dirty.clear(); }
  function flush(max = Infinity) {
    let n = 0;
    for (const key of dirty) {
      if (n++ >= max) break;
      dirty.delete(key);
      const [a, b, c] = key.split(',').map(Number);
      buildChunk(a, b, c);
    }
  }
  function dispose() { for (const m of chunks.values()) { group.remove(m); m.geometry.dispose(); } chunks.clear(); material.dispose(); }
  return { dens, solid, normal, groundBelow, topAt, ray, carve, girder, group, buildAll, flush, dispose, hTop: (x, z) => hTop[Math.max(0, Math.min(NX, Math.round((x + HALF) / VS))) + PX * Math.max(0, Math.min(NZ, Math.round((z + HALF) / VS)))] };
}

// ---------- a model of the island, for the table in the crypt ----------
export function islandModel(seed, size = 1.2) {
  const land = createLand(makeField(seed));
  land.buildAll();
  const g = new THREE.Group();
  land.group.scale.setScalar(size / (NX * VS));
  g.add(land.group);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(size * .62, 40), new THREE.MeshLambertMaterial({ color: 0x2a78b8, transparent: true, opacity: .8 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = WATER0 * size / (NX * VS); g.add(sea);
  return g;
}
