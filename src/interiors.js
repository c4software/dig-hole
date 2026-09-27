// interiors.js, the inside of the village's buildings: walls in two skins (the street's plaster
// outside, wallpaper or stone inside), floors, ceilings, bright window panes, furniture that says
// what the place is, and front doors you open and shut with e.
// Everything static comes from a small set of shared materials, so the world's merge pass folds
// it into a few draw calls; all the door leaves are two instanced meshes. No lights: the rooms
// glow a little by themselves (emissive), lamps and panes are unlit colours.
import * as THREE from 'three';
import { seeded } from './street.js';
import { mergeStatic } from './merge.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const BALL = new THREE.SphereGeometry(1, 8, 6);
const SHADE = new THREE.CylinderGeometry(.55, 1, 1, 8);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// palettes, kept short: every colour is a material, every material a draw call
const PAPERS = [0xf3e6c8, 0xe6dcc8, 0xdfe6d6, 0xf0d8cc, 0xd6e0e6, 0xf4ecdc];
const WOODS = [0xa87a4a, 0x8a5a3a, 0xc4a070];
const SOFAS = [0x5a7fa6, 0x94423e, 0x6f9a7c, 0xc8a878, 0x7a5a8a];
const RUGS = [0x8a2a2a, 0x2a4a6a, 0xb8843a, 0x5a6a3a];
const KITCHENS = [0xf2efe6, 0x8aa89a, 0x6a8ab0, 0xd8c8a0];
const GOODS = [0xc83a3a, 0x2a5a8a, 0x3a7a4a, 0xe0b030, 0xf2f0ea, 0xe07a30];
const ART = [0xd87a4a, 0x4a8ac8, 0x6ac85a, 0xe8c040, 0xc84a7a];

export function createInteriors({ addBox, seed = 911 }) {
  const rnd = seeded(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const mats = new Map();
  // lambert that glows a little on its own, so a closed room still reads
  const lit = (c, k = .4, map = null) => {
    k = k === 0 || k > .55 ? k : .4;          // one glow level: fewer materials, fewer draw calls
    const key = 'l' + c + ',' + k + (map ? map.uuid : '');
    if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color: c, map, emissive: new THREE.Color(c).multiplyScalar(k) }));
    return mats.get(key);
  };
  const glow = (c, map = null) => { const key = 'g' + c + (map ? map.uuid : ''); if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color: c, map })); return mats.get(key); };
  // shared textures: striped wallpaper, parquet, floor tiles
  const paperTex = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(0,0,0,.06)'; for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 6, 64); c.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 8; x < 64; x += 16) c.fillRect(x, 0, 1, 64); }, [6, 1]);
  const parquetTex = canvasTex(128, 128, (c) => { for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * 24; x < 176; x += 48) { const v = 200 + Math.random() * 55; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 47, 15); } c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 128; y += 16) c.fillRect(0, y + 15, 128, 1); }, [4, 4]);
  const tileTex = canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 64; k += 16) { c.fillRect(k, 0, 1, 64); c.fillRect(0, k, 64, 1); } }, [8, 8]);
  const checkTex = canvasTex(64, 64, (c) => { c.fillStyle = '#f4f0e6'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#2a2a2e'; for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 * 16; x < 64; x += 32) c.fillRect(x, y, 16, 16); }, [8, 8]);
  const paper = (c) => lit(c, .42, rnd() < .5 ? paperTex : null);
  const parquet = (c) => lit(c, .4, parquetTex);
  const CEIL = lit(0xf8f4ec, .5), SKIRT = lit(0x6a4a30, .3), FRAME = lit(0xf4f0e6, .45), DARK = lit(0x1e2024, 0);
  const PANE = glow(0xcfe4f0), SHADE_M = glow(0xffe2a8), FLAME = glow(0xffc050), SCREEN = glow(0x3a6a8a);
  const WOOD = lit(0x7a5530, .35), WOOD_D = lit(0x4a3020, .35), WOOD_L = lit(0xc09a6a, .4), METAL = lit(0xb8bcc2, .35), WHITE = lit(0xf6f4ee, .4);
  const LEAF = lit(0x4f8a3a, .3), POT = lit(0xb8643a, .35), GOLD = lit(0xd9a125, .45), BRASS = lit(0xc8a050, .4);

  // ---------- building blocks, in a building's own frame (a group placed in the world) ----------
  // what's inside a building lives in its own group: merged on its own, drawn only while you
  // are in there or its door stands open (the windows are opaque, so nothing shows otherwise)
  const buildings = [];
  function inner(p) {
    if (!p.userData.inner) {
      const g = new THREE.Group(); g.userData.keep = true; p.add(g);
      p.userData.inner = { p, g, doors: [], box: new THREE.Box3() };
      buildings.push(p.userData.inner);
    }
    return p.userData.inner.g;
  }
  const box = (p, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(UNIT, m); b.scale.set(w, h, d); b.position.set(x, y, z); inner(p).add(b); return b; };
  const span = (p, m, x0, y0, z0, x1, y1, z1) => box(p, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  // an outer skin whose texture lines up with the whole block it stands for (ref), so the
  // street sees the same wall as before, cut in pieces round the door
  function refUV(geo, r) {
    const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0, dz = r.z1 - r.z0;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k), nx = N.getX(k), ny = N.getY(k), nz = N.getZ(k);
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      let u, w;
      if (ax >= ay && ax >= az) { u = nx > 0 ? (r.z1 - z) / dz : (z - r.z0) / dz; w = (y - r.y0) / dy; }
      else if (ay >= az) { u = (x - r.x0) / dx; w = ny > 0 ? (r.z1 - z) / dz : (z - r.z0) / dz; }
      else { u = nz > 0 ? (x - r.x0) / dx : (r.x1 - x) / dx; w = (y - r.y0) / dy; }
      uv[k * 2] = u; uv[k * 2 + 1] = w;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  function skin(p, m, x0, y0, z0, x1, y1, z1, ref) {
    if (!ref) { const b = new THREE.Mesh(UNIT, m); b.scale.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); p.add(b); return b; }
    const geo = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const mesh = new THREE.Mesh(refUV(geo, ref), m); p.add(mesh); return mesh;
  }
  const cyl = (p, r, h, m, x, y, z, geo = CYL) => { const c = new THREE.Mesh(geo, m); c.scale.set(r, h, r); c.position.set(x, y, z); inner(p).add(c); return c; };
  const ball = (p, r, m, x, y, z) => { const b = new THREE.Mesh(BALL, m); b.scale.setScalar(r); b.position.set(x, y, z); inner(p).add(b); return b; };
  // a box that blocks: the building turns by quarter turns, so its AABB stays exact
  const bb = new THREE.Box3();
  const solid = (p, x0, y0, z0, x1, y1, z1) => {
    p.updateMatrix();
    bb.min.set(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)); bb.max.set(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
    bb.applyMatrix4(p.matrix);
    return addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z);
  };

  // four walls round a room, front at z1 with a doorway [d0, d1] up to dh (from dy0, a sill);
  // a thin outer skin in the street's material, the thickness in the room's own finish
  function shell(p, { x0, x1, z0, z1, y1, y0 = 0, t = .2, ext, ref, int, floor, ceil = CEIL, door, back = true, front = true, skirt = true }) {
    const s = .04, [d0, d1, dh, dy0 = 0] = door;
    if (ext) {
      skin(p, ext, x0, 0, z0, x0 + s, y1, z1, ref); skin(p, ext, x1 - s, 0, z0, x1, y1, z1, ref);
      if (back) skin(p, ext, x0 + s, 0, z0, x1 - s, y1, z0 + s, ref);
      if (front) { skin(p, ext, x0 + s, 0, z1 - s, d0, y1, z1, ref); skin(p, ext, d1, 0, z1 - s, x1 - s, y1, z1, ref); skin(p, ext, d0, dh, z1 - s, d1, y1, z1, ref); if (dy0) skin(p, ext, d0, 0, z1 - s, d1, dy0, z1, ref); }
    }
    const zb = back ? z0 + t : z0, zf = front ? z1 - t : z1;
    span(p, int, x0 + s, 0, z0 + (back ? s : 0), x0 + t, y1, z1 - (front ? s : 0)); span(p, int, x1 - t, 0, z0 + (back ? s : 0), x1 - s, y1, z1 - (front ? s : 0));
    if (back) span(p, int, x0 + t, 0, z0 + s, x1 - t, y1, zb);
    if (front) { span(p, int, x0 + t, 0, zf, d0, y1, z1 - s); span(p, int, d1, 0, zf, x1 - t, y1, z1 - s); span(p, int, d0, dh, zf, d1, y1, z1 - s); if (dy0) span(p, int, d0, 0, zf, d1, dy0, z1 - s); }
    solid(p, x0, 0, z0, x0 + t, y1, z1); solid(p, x1 - t, 0, z0, x1, y1, z1);
    if (back) solid(p, x0, 0, z0, x1, y1, z0 + t);
    if (front) { solid(p, x0, 0, zf, d0, y1, z1); solid(p, d1, 0, zf, x1, y1, z1); solid(p, d0, dh, zf, d1, y1, z1); if (dy0) solid(p, d0, 0, zf, d1, dy0, z1); }
    const X0 = x0 + t, X1 = x1 - t;
    span(p, floor, X0, Math.max(0, y0 - .04), zb, X1, y0 + .005, zf);
    if (y0 > .05) solid(p, X0, 0, zb, X1, y0, zf);
    if (front && !dy0) span(p, floor, d0, Math.max(0, y0 - .04), zf, d1, y0 + .005, z1);     // the threshold
    if (ceil) span(p, ceil, X0, y1 - .06, zb, X1, y1, zf);
    if (skirt) {
      const k = .025, h = y0 + .12;
      span(p, SKIRT, X0, y0, zb, X0 + k, h, zf); span(p, SKIRT, X1 - k, y0, zb, X1, h, zf);
      if (back) span(p, SKIRT, X0 + k, y0, zb, X1 - k, h, zb + k);
      if (front) { span(p, SKIRT, X0 + k, y0, zf - k, d0, h, zf); span(p, SKIRT, d1, y0, zf - k, X1 - k, h, zf); }
    }
    return { X0, X1, Z0: zb, Z1: zf, y0, y1 };
  }
  // the inside of a window: a painted frame, a bright pane, a cross of glazing bars
  function pane(p, r, side, a, y, w, h) {
    const along = side === 'front' || side === 'back';
    const f = side === 'front' ? r.Z1 : side === 'back' ? r.Z0 : side === 'left' ? r.X0 : r.X1;
    const n = side === 'front' || side === 'right' ? -1 : 1;
    const put = (m, ww, hh, dd, off, yy = y, aa = a) => along ? box(p, ww, hh, dd, m, aa, yy, f + n * off) : box(p, dd, hh, ww, m, f + n * off, yy, aa);
    put(FRAME, w + .14, h + .14, .03, .015);
    put(PANE, w, h, .02, .03);
    put(FRAME, .05, h, .02, .045); put(FRAME, w, .05, .02, .045, y + h * .18);
    put(FRAME, w + .3, .05, .2, .1, y - h / 2 - .09);
  }
  // a framed picture on a wall
  function picture(p, r, side, a, y, w, h) {
    const along = side === 'front' || side === 'back';
    const f = side === 'front' ? r.Z1 : side === 'back' ? r.Z0 : side === 'left' ? r.X0 : r.X1;
    const n = side === 'front' || side === 'right' ? -1 : 1;
    const put = (m, ww, hh, off, yy = y, aa = a) => along ? box(p, ww, hh, .03, m, aa, yy, f + n * off) : box(p, .03, hh, ww, m, f + n * off, yy, aa);
    put(pick([WOOD_D, GOLD, WOOD_L]), w, h, .02);
    put(lit(pick(ART), .45), w - .1, h - .1, .03);
    put(lit(pick(ART), .45), (w - .1) * .45, (h - .1) * .4, .04, y - h * .1, a + (rnd() - .5) * w * .3);
  }
  // a flight of stairs from (x0..x1) at zFoot up to zTop, closed off by the ceiling above
  function stairs(p, x0, x1, zFoot, zTop, y0, y1, m, railX = x0) {
    const n = Math.max(6, Math.round(Math.abs(zFoot - zTop) / .27)), run = (zTop - zFoot) / n, rise = (y1 - y0) / (n + 1);
    for (let k = 0; k < n; k++) span(p, m, x0, y0, zFoot + k * run, x1, y0 + (k + 1) * rise, zFoot + (k + 1) * run);
    span(p, DARK, x0, y1 - .065, zTop - run * 4, x1, y1 - .06, zTop);
    if (railX !== null) {
      const len = Math.hypot(n * run, n * rise), ang = Math.atan2(rise, Math.abs(run));
      const r = box(p, .06, .06, len * .8, WOOD_D, railX, y0 + n * rise * .4 + 1, zFoot + n * run * .4);
      r.rotation.x = run < 0 ? ang : -ang;
      box(p, .08, 1.1, .08, WOOD_D, railX, y0 + .55, zFoot + run * .5);
    }
    solid(p, x0, y0, Math.min(zFoot, zTop), x1, y1, Math.max(zFoot, zTop));
  }
  const plant = (p, x, z, s = 1, y = 0) => { cyl(p, .2 * s, .38 * s, POT, x, y + .19 * s, z); const b = ball(p, .38 * s, LEAF, x, y + .6 * s, z); b.scale.y = .5 * s; };
  const lamp = (p, x, y, z, r = .22) => { cyl(p, r, r * 1.1, SHADE_M, x, y, z, SHADE); };
  // a chair facing +z (rotated by a)
  function chair(p, x, z, a, m, y = 0) {
    const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = a; inner(p).add(c);
    box(c, .42, .05, .42, m, 0, .45, 0); box(c, .42, .5, .05, m, 0, .72, -.19);
    box(c, .04, .45, .38, m, -.19, .22, 0); box(c, .04, .45, .38, m, .19, .22, 0);
  }
  // a shelf unit against a wall with rows of goods facing the room
  function shelves(p, r, side, a0, a1, h, rows, colors, bodyM = WOOD, depth = .4) {
    const along = side === 'front' || side === 'back';
    const f = side === 'front' ? r.Z1 : side === 'back' ? r.Z0 : side === 'left' ? r.X0 : r.X1;
    const n = side === 'front' || side === 'right' ? -1 : 1;
    const put = (m, lo, hi, y0, y1, d0, d1) => along ? span(p, m, lo, y0, f + n * d0, hi, y1, f + n * d1) : span(p, m, f + n * d0, y0, lo, f + n * d1, y1, hi);
    put(bodyM, a0, a1, r.y0, r.y0 + h, 0, depth);
    for (let k = 0; k < rows; k++) {
      const y = r.y0 + .35 + k * (h - .5) / rows;
      put(bodyM, a0, a1, y - .03, y, depth, depth + .03);
      for (let a = a0 + .05; a < a1 - .12;) { const w = .12 + rnd() * .2, hh = .14 + rnd() * .16; put(lit(pick(colors), .4), a, Math.min(a + w, a1 - .05), y, y + hh, depth - .02, depth + .05); a += w + .02; }
    }
    along ? solid(p, a0, r.y0, f, a1, r.y0 + h, f + n * (depth + .05)) : solid(p, f, r.y0, a0, f + n * (depth + .05), r.y0 + h, a1);
  }

  // ---------- the doors: hinged leaves, one instanced mesh for all of them ----------
  const doors = [];
  function door(p, { x, y = 0, z, w, h, dir = 1, color = 0x5a3a28 }) {
    p.updateMatrix();
    const hinge = new THREE.Vector3(x, y, z).applyMatrix4(p.matrix);
    const yaw = p.rotation.y;
    const mid = new THREE.Vector3(x + dir * w / 2, y + 1, z).applyMatrix4(p.matrix);
    inner(p);
    // shut until someone opens it: a box fills the doorway meanwhile
    const col = solid(p, x, y, z - .08, x + dir * w, y + h, z + .08);
    const d = { hinge, yaw, w, h, dir, color: new THREE.Color(color), mid, ang: 0, open: false, col };
    doors.push(d); p.userData.inner.doors.push(d);
  }
  let leaves = null, knobs = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), off = new THREE.Vector3();
  function place(k) {
    const d = doors[k];
    q.setFromAxisAngle(up, d.yaw + d.dir * d.ang);
    off.set(d.dir * d.w / 2, d.h / 2, 0).applyQuaternion(q); v.copy(d.hinge).add(off);
    leaves.setMatrixAt(k, m4.compose(v, q, sc.set(d.w, d.h, .07)));
    off.set(d.dir * (d.w - .14), 1.02, 0).applyQuaternion(q); v.copy(d.hinge).add(off);
    knobs.setMatrixAt(k, m4.compose(v, q, sc.set(.07, .07, .16)));
  }
  function finish(parent) {
    parent.updateMatrixWorld(true);
    for (const b of buildings) {
      mergeStatic(b.g);
      // no sun gets in: the room's pieces needn't cast shadows (saves the shadow pass)
      b.g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      b.box.setFromObject(b.g).expandByScalar(.4);
      b.g.visible = false;
    }
    if (!doors.length) return;
    leaves = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial({ color: 0xffffff }), doors.length);
    knobs = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial({ color: 0xd9a125, emissive: 0x3a2a08 }), doors.length);
    doors.forEach((d, k) => { leaves.setColorAt(k, d.color); place(k); });
    leaves.name = 'doors'; leaves.userData.doors = doors;
    for (const m of [leaves, knobs]) { m.frustumCulled = false; m.userData.keep = true; m.castShadow = m.receiveShadow = true; parent.add(m); }
  }
  // doors swing to where they were left (e opens and shuts them); only those that move get rewritten
  function update(dt, eye) {
    if (!leaves) return;
    let dirty = false;
    for (let k = 0; k < doors.length; k++) {
      const d = doors[k];
      const want = d.open ? 1.45 : 0;
      if (d.col) d.col.off = d.ang > .5;
      if (Math.abs(d.ang - want) < 1e-3) continue;
      d.ang += (want - d.ang) * Math.min(1, dt * 5);
      if (Math.abs(d.ang - want) < 1e-3) d.ang = want;
      place(k); dirty = true;
    }
    if (dirty) { leaves.instanceMatrix.needsUpdate = true; knobs.instanceMatrix.needsUpdate = true; }
    for (const b of buildings) {
      const vis = b.box.containsPoint(eye) || b.doors.some(d => d.ang > 0);
      if (b.g.visible !== vis) b.g.visible = vis;
    }
  }

  // ---------- a home: stairs up, a kitchen corner, the table, the sofa and its lamp ----------
  function home(p, r, [d0, d1], { wins = [], sides = [] } = {}) {
    const s = rnd() < .5 ? -1 : 1;
    const xs = s > 0 ? r.X1 : r.X0, xo = s > 0 ? r.X0 : r.X1;
    const { Z0, Z1, y0, y1 } = r, Wi = r.X1 - r.X0;
    for (const x of wins) pane(p, r, 'front', x, 1.55, .8, 1.3);
    for (const [side, z] of sides) pane(p, r, side, z, 1.55, .72, 1.15);
    // the stairs, along one side wall at the back
    const sw = .9, stairM = parquet(pick(WOODS));
    stairs(p, Math.min(xs, xs - s * sw), Math.max(xs, xs - s * sw), Z0 + 3, Z0, y0, y1, stairM, xs - s * sw);
    // the kitchen along the back wall: fridge, cupboards, sink and hob, wall units
    const kM = lit(pick(KITCHENS), .4), L = Math.min(2.4, Wi - sw - .7 - 1.2);
    const kx = (a) => xo + s * a;
    span(p, lit(0xeef0f2, .45), Math.min(kx(0), kx(.7)), y0, Z0, Math.max(kx(0), kx(.7)), y0 + 1.8, Z0 + .65);
    box(p, .04, .5, .05, METAL, kx(.6), y0 + 1.15, Z0 + .67);
    const k0 = Math.min(kx(.72), kx(.72 + L)), k1 = Math.max(kx(.72), kx(.72 + L));
    span(p, kM, k0, y0, Z0, k1, y0 + .86, Z0 + .6);
    span(p, WOOD_L, k0, y0 + .86, Z0, k1, y0 + .9, Z0 + .63);
    span(p, WHITE, k0, y0 + .9, Z0, k1, y0 + 1.45, Z0 + .01);
    span(p, kM, k0, y0 + 1.45, Z0, k1, y0 + 2.1, Z0 + .35);
    box(p, .5, .03, .38, METAL, kx(.72 + L * .3), y0 + .91, Z0 + .3);
    box(p, .55, .02, .45, DARK, kx(.72 + L * .75), y0 + .91, Z0 + .3);
    box(p, .5, .45, .02, DARK, kx(.72 + L * .75), y0 + .45, Z0 + .61);
    cyl(p, .08, .2, pick([lit(0xc83a3a), METAL, WHITE]), kx(.72 + L * .5), y0 + 1, Z0 + .3);
    solid(p, Math.min(xo, kx(.72 + L)), y0, Z0, Math.max(xo, kx(.72 + L)), y0 + 1, Z0 + .66);
    // the table, round or square, four chairs and a hanging lamp
    const tx = ((xs - s * sw) + xo) / 2, tz = Z0 + 2.4, chM = lit(pick([0x7a5530, 0x4a3020, 0xc09a6a, 0xf2efe6]), .35), tM = parquet(pick(WOODS));
    if (rnd() < .5) {
      cyl(p, .55, .04, tM, tx, y0 + .75, tz); cyl(p, .06, .73, tM, tx, y0 + .37, tz);
      for (const [cx, cz, a] of [[tx - .72, tz, Math.PI / 2], [tx + .72, tz, -Math.PI / 2], [tx, tz - .72, 0], [tx, tz + .72, Math.PI]]) chair(p, cx, cz, a, chM, y0);
    } else {
      box(p, 1.25, .05, .8, tM, tx, y0 + .75, tz);
      for (const sx of [-.55, .55]) for (const sz of [-.33, .33]) box(p, .05, .73, .05, tM, tx + sx, y0 + .37, tz + sz);
      for (const [cx, cz, a] of [[tx - .3, tz - .62, 0], [tx + .3, tz - .62, 0], [tx - .3, tz + .62, Math.PI], [tx + .3, tz + .62, Math.PI]]) chair(p, cx, cz, a, chM, y0);
    }
    box(p, .5, .03, .5, lit(pick(RUGS), .4), tx, y0 + .79, tz);
    box(p, .015, .7, .015, DARK, tx, y1 - .35, tz); lamp(p, tx, y1 - .78, tz, .26);
    solid(p, tx - .9, y0, tz - .9, tx + .9, y0 + .8, tz + .9);
    // the sofa against the other wall, a rug, a low table, a reading lamp
    const sz = Z1 - 2.7, soM = lit(pick(SOFAS), .38), ruM = lit(pick(RUGS), .38);
    span(p, soM, Math.min(xo, kx(.88)), y0, sz - 1, Math.max(xo, kx(.88)), y0 + .42, sz + 1);
    span(p, soM, Math.min(xo, kx(.22)), y0, sz - 1, Math.max(xo, kx(.22)), y0 + .85, sz + 1);
    for (const e of [-1, 1]) span(p, soM, Math.min(xo, kx(.88)), y0, sz + e * 1 - .09, Math.max(xo, kx(.88)), y0 + .62, sz + e * 1 + .09);
    for (const e of [-.45, .45]) { const c = box(p, .14, .38, .38, ruM, kx(.36), y0 + .62, sz + e); c.rotation.z = s * .25; }
    solid(p, Math.min(xo, kx(.9)), y0, sz - 1.1, Math.max(xo, kx(.9)), y0 + .85, sz + 1.1);
    box(p, 1.9, .015, 2.6, ruM, kx(1.75), y0 + .03, sz);
    box(p, .6, .05, 1.1, parquet(pick(WOODS)), kx(1.6), y0 + .4, sz);
    for (const e of [-.45, .45]) box(p, .5, .38, .05, WOOD_D, kx(1.6), y0 + .19, sz + e);
    box(p, .22, .04, .3, lit(pick(ART), .4), kx(1.6), y0 + .44, sz + .15);
    cyl(p, .16, .03, DARK, kx(.35), y0 + .015, Z1 - 1.3); box(p, .03, 1.4, .03, DARK, kx(.35), y0 + .7, Z1 - 1.3); lamp(p, kx(.35), y0 + 1.5, Z1 - 1.3, .2);
    picture(p, r, s > 0 ? 'left' : 'right', sz + .2, y0 + 1.6, .7, .55);
    if (rnd() < .6) picture(p, r, s > 0 ? 'left' : 'right', sz + .95, y0 + 1.7, .45, .6);
    // across the room: a bookcase, or the telly on a low cabinet
    const bx = (a) => xs - s * a, bz = Z1 - 2.55;
    if (rnd() < .6) {
      span(p, WOOD, Math.min(xs, bx(.35)), y0, bz - .8, Math.max(xs, bx(.35)), y0 + 2, bz + .8);
      for (const y of [.45, 1, 1.55]) {
        span(p, WOOD_D, Math.min(bx(.35), bx(.37)), y0 + y - .03, bz - .78, Math.max(bx(.35), bx(.37)), y0 + y, bz + .78);
        for (let a = bz - .74; a < bz + .6;) { const w = .18 + rnd() * .25; span(p, lit(pick(GOODS), .4), Math.min(bx(.33), bx(.38)), y0 + y, a, Math.max(bx(.33), bx(.38)), y0 + y + .26 + rnd() * .12, Math.min(a + w, bz + .74)); a += w + .03; }
      }
      solid(p, Math.min(xs, bx(.4)), y0, bz - .82, Math.max(xs, bx(.4)), y0 + 2, bz + .82);
    } else {
      span(p, WOOD_L, Math.min(xs, bx(.45)), y0, bz - .8, Math.max(xs, bx(.45)), y0 + .5, bz + .8);
      span(p, DARK, Math.min(bx(.12), bx(.18)), y0 + .6, bz - .6, Math.max(bx(.12), bx(.18)), y0 + 1.3, bz + .6);
      span(p, SCREEN, Math.min(bx(.18), bx(.185)), y0 + .64, bz - .56, Math.max(bx(.18), bx(.185)), y0 + 1.26, bz + .56);
      plant(p, bx(.25), bz + .6, .7, y0 + .5);
      solid(p, Math.min(xs, bx(.5)), y0, bz - .82, Math.max(xs, bx(.5)), y0 + 1.3, bz + .82);
    }
    picture(p, r, s > 0 ? 'right' : 'left', Z0 + 2.3, y0 + 1.8, .5, .4);
    // a doormat, a ceiling light, a plant in the front corner if the door leaves room
    box(p, .9, .015, .5, lit(0x8a5a3a, .3), (d0 + d1) / 2, y0 + .02, Z1 - .35);
    cyl(p, .25, .05, SHADE_M, (r.X0 + r.X1) / 2, y1 - .085, sz);
    const px = xs - s * .4;
    if (Math.abs(px - (d0 + d1) / 2) > 1.1) plant(p, px, Z1 - .4, .9, y0);
  }

  // ---------- shops: a counter and its till, shelves of goods ----------
  function counter(p, x0, x1, z, y0, m, top = WOOD_L) {
    span(p, m, x0, y0, z - .3, x1, y0 + .95, z + .3); span(p, top, x0 - .03, y0 + .95, z - .33, x1 + .03, y0 + 1, z + .33);
    solid(p, x0, y0, z - .33, x1, y0 + 1, z + .33);
  }
  function till(p, x, y, z) { box(p, .4, .12, .35, DARK, x, y + .06, z); const s = box(p, .3, .2, .03, SCREEN, x, y + .25, z - .1); s.rotation.x = -.3; box(p, .3, .03, .2, lit(0x9a9ea4), x, y + .14, z + .05); }
  function shop(p, r, kind, [d0, d1]) {
    const { X0, X1, Z0, Z1, y0 } = r;
    const pharm = kind === 'pharmacie';
    for (let x = X0 + .8; x < d0 - .5; x += 1.6) pane(p, r, 'front', x, 1.2, 1.2, 1.7);
    const shelfM = pharm ? WHITE : WOOD, goods = pharm ? [0xf2f0ea, 0x3a9a5a, 0x5a8ac8, 0xf2f0ea, 0xe8e0d0] : GOODS;
    shelves(p, r, 'back', X0 + .1, X1 - .1, 2.3, 4, goods, shelfM);
    shelves(p, r, 'left', Z0 + 2.6, Z1 - .5, 2.1, 4, goods, shelfM);
    counter(p, X0 + .5, X1 - 1.3, Z0 + 2, y0, pharm ? WHITE : WOOD_D, pharm ? lit(0x3a9a5a, .4) : WOOD_L);
    till(p, X1 - 1.8, y0 + 1, Z0 + 2);
    if (pharm) {
      const g = lit(0x20c060, 1);
      box(p, .7, .22, .05, g, (X0 + X1) / 2, y0 + 2.55, Z0 + .45); box(p, .22, .7, .05, g, (X0 + X1) / 2, y0 + 2.55, Z0 + .45);
      span(p, WHITE, X0 + 1.8, y0, Z1 - 3.4, X0 + 2.4, y0 + 1.4, Z1 - 1.6);
      for (const e of [-1, 1]) for (let k = 0; k < 3; k++) for (let n = 0; n < 5; n++) span(p, lit(pick(goods), .4), X0 + 2.1 + e * .3, y0 + .3 + k * .4, Z1 - 3.3 + n * .35, X0 + 2.1 + e * .33, y0 + .5 + k * .4, Z1 - 3.05 + n * .35);
      solid(p, X0 + 1.75, y0, Z1 - 3.45, X0 + 2.45, y0 + 1.4, Z1 - 1.55);
      box(p, .5, .08, .4, METAL, X1 - .7, y0 + .05, Z1 - 1.8); box(p, .08, 1, .08, METAL, X1 - .7, y0 + .55, Z1 - 1.95);
    } else {
      // a stand of papers and magazines, a lottery desk
      const nx = X0 + 2.2;
      for (let k = 0; k < 3; k++) { const b = span(p, WOOD, nx - .5, y0 + .5 + k * .35, Z1 - 3.2, nx + .5, y0 + .54 + k * .35, Z1 - 2.6); b.rotation.x = -.35; for (let n = 0; n < 4; n++) { const mg = box(p, .22, .02, .3, lit(pick([0xf2f0ea, 0xc83a3a, 0x2a5a8a, 0xe0b030]), .45), nx - .36 + n * .24, y0 + .58 + k * .35, Z1 - 2.9); mg.rotation.x = -.35; } }
      span(p, WOOD_D, nx - .55, y0, Z1 - 3.3, nx + .55, y0 + .5, Z1 - 2.5);
      solid(p, nx - .55, y0, Z1 - 3.3, nx + .55, y0 + 1.4, Z1 - 2.5);
      span(p, lit(0x2a8a4a, .4), X1 - .7, y0, Z0 + 2.8, X1 - .1, y0 + 1.1, Z0 + 3.6);
      span(p, lit(0xc83a3a, .5), X1 - .68, y0 + 1.1, Z0 + 2.9, X1 - .12, y0 + 1.5, Z0 + 2.92);
      solid(p, X1 - .7, y0, Z0 + 2.8, X1 - .1, y0 + 1.1, Z0 + 3.6);
    }
    cyl(p, .3, .05, SHADE_M, (X0 + X1) / 2, r.y1 - .085, (Z0 + Z1) / 2);
    box(p, .9, .015, .5, lit(0x3a3a3a, .3), (d0 + d1) / 2, y0 + .02, Z1 - .35);
  }

  // ---------- the café: a zinc bar, bottles and a mirror, stools, little round tables ----------
  function cafe(p, r, [d0, d1]) {
    const { X0, X1, Z0, Z1, y0, y1 } = r;
    for (let x = X0 + .8; x < d0 - .5; x += 1.6) pane(p, r, 'front', x, 1.2, 1.2, 1.7);
    const bz = Z0 + 1.7;
    span(p, lit(0x5a2e1e, .35), X0 + .6, y0, bz - .3, X1 - 1.6, y0 + 1.05, bz + .3);
    span(p, METAL, X0 + .55, y0 + 1.05, bz - .35, X1 - 1.55, y0 + 1.1, bz + .38);
    solid(p, X0 + .55, y0, bz - .35, X1 - 1.55, y0 + 1.1, bz + .38);
    // behind the bar: a mirror, shelves of bottles, the coffee machine, the taps
    span(p, glow(0xbcd6e0), X0 + .6, y0 + 1.5, Z0, X1 - 1.6, y0 + 2.4, Z0 + .02);
    span(p, WOOD_D, X0 + .4, y0, Z0, X1 - 1.4, y0 + .9, Z0 + .45);
    for (const y of [1.25, 1.62]) {
      span(p, WOOD_D, X0 + .6, y0 + y - .03, Z0, X1 - 1.6, y0 + y, Z0 + .25);
      for (let x = X0 + .8; x < X1 - 1.8; x += .16 + rnd() * .08) cyl(p, .035, .3, lit(pick([0x2a5a2a, 0x6a3a1a, 0xd8c890, 0x3a6a8a, 0xa82a2a]), .45), x, y0 + y + .15, Z0 + .12);
    }
    solid(p, X0 + .4, y0, Z0, X1 - 1.4, y0 + 2, Z0 + .45);
    span(p, METAL, X0 + 1, y0 + 1.1, bz - .2, X0 + 1.6, y0 + 1.6, bz + .2); box(p, .4, .08, .1, DARK, X0 + 1.3, y0 + 1.35, bz + .22);
    for (let k = 0; k < 3; k++) box(p, .05, .35, .05, BRASS, X1 - 2.6 + k * .18, y0 + 1.27, bz);
    for (let x = X0 + .9; x < X1 - 1.8; x += .85) { cyl(p, .19, .05, lit(0x7a1e1e, .4), x, y0 + .75, bz + .75); cyl(p, .03, .72, METAL, x, y0 + .36, bz + .75); cyl(p, .18, .02, METAL, x, y0 + .01, bz + .75); }
    // little tables, two bistro chairs each
    const tables = [];
    for (let z = Z1 - 1.4; z > bz + 2; z -= 2) for (let x = X0 + 1.2; x < X1 - .8; x += 2.2) if (!(z > Z1 - 2.2 && x > d0 - 1)) tables.push([x, z]);
    for (const [x, z] of tables) {
      cyl(p, .38, .04, lit(0xe8e4dc, .4), x, y0 + .74, z); cyl(p, .04, .72, DARK, x, y0 + .36, z); cyl(p, .2, .02, DARK, x, y0 + .01, z);
      chair(p, x - .65, z, Math.PI / 2, lit(0x9a6a3a, .35), y0); chair(p, x + .65, z, -Math.PI / 2, lit(0x9a6a3a, .35), y0);
      solid(p, x - .45, y0, z - .45, x + .45, y0 + .78, z + .45);
    }
    // a slate with today's menu, a clock, globe lamps
    span(p, lit(0x2a2e2a, .2), X0, y0 + 1.2, Z1 - 3.4, X0 + .04, y0 + 2.2, Z1 - 1.8);
    for (let k = 0; k < 5; k++) span(p, lit(0xf2f0ea, .6), X0 + .04, y0 + 2 - k * .17, Z1 - 3.2, X0 + .05, y0 + 2.03 - k * .17, Z1 - 2.2 - rnd() * .5);
    for (let x = X0 + 1.2; x < X1 - .5; x += 2.4) { box(p, .015, .5, .015, DARK, x, y1 - .3, (bz + Z1) / 2); ball(p, .18, SHADE_M, x, y1 - .62, (bz + Z1) / 2); }
    box(p, .9, .015, .5, lit(0x3a3a3a, .3), (d0 + d1) / 2, y0 + .02, Z1 - .35);
  }

  // ---------- the bakery: a glass counter of pastries, racks of bread, the oven ----------
  function bakery(p, r, [d0, d1]) {
    const { X0, X1, Z0, Z1, y0 } = r;
    for (let x = X0 + .8; x < d0 - .5; x += 1.6) pane(p, r, 'front', x, 1.2, 1.2, 1.7);
    const cz = Z0 + 3.2, c0 = X0 + .4, c1 = X1 - 1.4;
    span(p, lit(0x2a4a78, .35), c0, y0, cz - .35, c1, y0 + .8, cz + .35);
    for (const x of [c0, (c0 + c1) / 2, c1]) span(p, METAL, x - .02, y0 + .8, cz + .3, x + .02, y0 + 1.25, cz + .34);
    span(p, glow(0xe8f2f4), c0, y0 + 1.22, cz - .35, c1, y0 + 1.25, cz + .35);
    solid(p, c0, y0, cz - .36, c1, y0 + 1.3, cz + .36);
    // pastries in the case: éclairs, tarts, croissants
    const PAST = [0x6a3a1a, 0xe8b860, 0xd8483a, 0xf2e8d0, 0xc88a3a];
    for (let x = c0 + .2; x < c1 - .2; x += .22) for (const z of [cz - .12, cz + .12]) { const k = Math.floor(rnd() * PAST.length); const pc = box(p, .16, .06, .09, lit(PAST[k], .45), x, y0 + .86, z); if (k === 1) pc.rotation.y = .6; }
    // bread racks on the back wall: baguettes standing in baskets, round loaves on shelves
    span(p, WOOD, X0 + .2, y0, Z0, X1 - .2, y0 + 2.2, Z0 + .45);
    const bread = lit(0xd8a050, .45), crust = lit(0xb8783a, .45);
    for (const y of [.5, 1.1, 1.7]) span(p, WOOD_D, X0 + .2, y0 + y - .03, Z0 + .45, X1 - .2, y0 + y, Z0 + .5);
    for (let x = X0 + .4; x < X1 - .4; x += .3) { const lf = ball(p, .13, crust, x, y0 + 1.18, Z0 + .3); lf.scale.y = .08; }
    for (let x = X0 + .35; x < X1 - .4; x += .1) { const b = cyl(p, .035, .7, bread, x, y0 + 1.95, Z0 + .35); b.rotation.z = (rnd() - .5) * .3; }
    for (let x = X0 + .4; x < X1 - .4; x += .25) cyl(p, .1, .06, bread, x, y0 + .56, Z0 + .3);
    solid(p, X0 + .2, y0, Z0, X1 - .2, y0 + 2.4, Z0 + .55);
    // the oven in the corner: brick, a dark mouth, embers
    const ox = X1 - .8;
    span(p, lit(0xa8583a, .35), ox - .7, y0, Z0 + .6, X1, y0 + 1.8, Z0 + 1.8);
    span(p, DARK, ox - .72, y0 + .7, Z0 + .9, ox - .69, y0 + 1.2, Z0 + 1.5);
    span(p, glow(0xff8a30), ox - .7, y0 + .72, Z0 + 1, ox - .68, y0 + .82, Z0 + 1.4);
    solid(p, ox - .7, y0, Z0 + .6, X1, y0 + 1.8, Z0 + 1.8);
    till(p, c1 - .3, y0 + 1.29, cz);
    // flour sacks, a price slate, a lamp
    for (let k = 0; k < 3; k++) { const s = box(p, .45, .6, .3, lit(0xe8e0cc, .45), X0 + .5 + k * .5, y0 + .3, Z1 - .5); s.rotation.y = (rnd() - .5) * .4; }
    span(p, lit(0x2a2e2a, .2), X0, y0 + 1.2, Z1 - 3, X0 + .04, y0 + 2, Z1 - 1.8);
    cyl(p, .3, .05, SHADE_M, (X0 + X1) / 2, r.y1 - .085, cz + 1.5);
    box(p, .9, .015, .5, lit(0x3a3a3a, .3), (d0 + d1) / 2, y0 + .02, Z1 - .35);
  }


  // ---------- the church: pillars, pews either side of the aisle, the choir and its altar ----------
  function church(p, n, po, stoneM) {
    const { X0, X1, Z0, Z1 } = n;
    // the altar, 2 m by 0.9, its front at az; the 0.8 m before it stays clear (a secret drawer goes there)
    const az = -11, zc = az + .8;
    span(p, lit(0x8a1e24, .35), -1.7, 0, Z0 + .3, 1.7, .012, az);
    span(p, WHITE, -.97, 0, az - .88, .97, 1, az - .02);
    span(p, WHITE, -1, 1, az - .9, 1, 1.04, az);
    span(p, GOLD, -.97, .72, az - .03, .97, 1, az);
    solid(p, -1, 0, az - .9, 1, 1.05, az);
    for (let k = 0; k < 5; k++) { const x = -.8 + k * .4; cyl(p, .035, .32, WHITE, x, 1.2, az - .7); box(p, .03, .07, .03, FLAME, x, 1.4, az - .7); }
    span(p, GOLD, -.08, 1.9, Z0, .08, 3.9, Z0 + .06); span(p, GOLD, -.6, 3.1, Z0, .6, 3.26, Z0 + .06);
    for (const x of [-2.2, 2.2]) {
      cyl(p, .2, .06, BRASS, x, .03, az - .6); cyl(p, .05, 1.3, BRASS, x, .65, az - .6); cyl(p, .05, .35, WHITE, x, 1.47, az - .6); box(p, .04, .09, .04, FLAME, x, 1.7, az - .6);
      solid(p, x - .2, 0, az - .8, x + .2, 1.7, az - .4);
      plant(p, x * 1.6, Z0 + .6, 1.1); for (let k = 0; k < 5; k++) ball(p, .07, lit(k % 2 ? 0xf6f0f4 : 0xe8384f, .5), x * 1.6 + (rnd() - .5) * .5, .75, Z0 + .6 + (rnd() - .5) * .4);
    }
    span(p, WOOD, -3.6, 0, az - .1, -3, 1.05, az + .4); const bk = box(p, .5, .04, .4, WOOD_D, -3.3, 1.12, az + .15); bk.rotation.x = .4;
    solid(p, -3.6, 0, az - .1, -3, 1.1, az + .4);
    // two rows of pillars up to the beams (none in the organ's corner, x -5.3..-3, z -10..-6)
    for (const z of [-10.6, -4, 2.6]) for (const x of [-3.6, 3.6]) {
      cyl(p, .3, n.y1, stoneM, x, n.y1 / 2, z); box(p, .8, .35, .8, stoneM, x, .175, z); box(p, .8, .3, .8, stoneM, x, n.y1 - .45, z);
      solid(p, x - .4, 0, z - .4, x + .4, n.y1, z + .4);
    }
    for (let z = Z0 + 1; z < Z1; z += 2.2) span(p, WOOD_D, X0, n.y1 - .45, z - .12, X1, n.y1 - .06, z + .12);
    // the pews, facing the altar, a central aisle between them
    const pz0 = zc + 1.6, pz1 = Z1 - 2.6;
    for (const sd of [-1, 1]) {
      for (let z = pz0; z <= pz1; z += 1.05) {
        span(p, WOOD, sd * .9, .42, z - .2, sd * 2.86, .47, z + .2);
        span(p, WOOD, sd * .9, .47, z + .2, sd * 2.86, .95, z + .25);
        span(p, WOOD_D, sd * .86, 0, z - .25, sd * .92, 1, z + .27); span(p, WOOD_D, sd * 2.84, 0, z - .25, sd * 2.9, 1, z + .27);
        span(p, WOOD_D, sd * .92, .12, z - .55, sd * 2.84, .2, z - .45);
      }
      solid(p, sd * .85, 0, pz0 - .6, sd * 2.92, 1, pz1 + .3);
    }
    // lamps hanging over the aisle, a stand of votive candles, a statue
    for (const z of [zc + 3, zc + 8, zc + 13]) { box(p, .015, n.y1 - 7.2, .015, DARK, 0, (n.y1 + 7) / 2, z); lamp(p, 0, 6.85, z, .35); }
    span(p, METAL, 4, 0, Z1 - 2.4, 4.7, .8, Z1 - 1.6); span(p, METAL, 4.1, .8, Z1 - 2.3, 4.6, .95, Z1 - 1.7);
    for (let k = 0; k < 12; k++) box(p, .035, .06, .035, FLAME, 4.1 + (k % 4) * .16, k < 8 ? .85 : 1, Z1 - 2.25 + Math.floor(k / 4) * .22);
    solid(p, 4, 0, Z1 - 2.4, 4.7, 1, Z1 - 1.6);
    span(p, WHITE, 4.1, 0, -9.3, 4.7, 1, -8.7); cyl(p, .28, 1.2, lit(0x4a6ab0, .4), 4.4, 1.6, -9, SHADE); ball(p, .14, lit(0xf2e0cc, .45), 4.4, 2.34, -9);
    solid(p, 4.1, 0, -9.3, 4.7, 2.4, -8.7);
    // the organ loft under the tower, its pipes
    span(p, WOOD_D, -3.2, 4.7, Z1 - 1.9, 3.2, 5, Z1); span(p, WOOD, -3.2, 5, Z1 - 1.9, 3.2, 5.8, Z1 - 1.82);
    for (let k = 0; k < 13; k++) { const h = 1.2 + (1 - Math.abs(k - 6) / 6) * 2; cyl(p, .08, h, METAL, -2.4 + k * .4, 5 + h / 2, Z1 - 1.55); }
    // the porch: a font of holy water, a notice board, a bench
    cyl(p, .1, .85, stoneM, po.X0 + .5, .42, po.Z0 + 1.2); cyl(p, .32, .2, stoneM, po.X0 + .5, .95, po.Z0 + 1.2); cyl(p, .26, .02, glow(0x9ac8e0), po.X0 + .5, 1.05, po.Z0 + 1.2);
    solid(p, po.X0 + .15, 0, po.Z0 + .85, po.X0 + .85, 1, po.Z0 + 1.55);
    span(p, lit(0xb8905a, .35), po.X1 - .04, 1.1, po.Z0 + 1, po.X1, 2.1, po.Z0 + 2.6);
    for (let k = 0; k < 5; k++) span(p, WHITE, po.X1 - .05, 1.25 + (k % 2) * .4, po.Z0 + 1.1 + k * .28, po.X1 - .04, 1.55 + (k % 2) * .4, po.Z0 + 1.32 + k * .28);
    span(p, WOOD, po.X0, .42, po.Z1 - 2.4, po.X0 + .45, .47, po.Z1 - .6); span(p, WOOD_D, po.X0, 0, po.Z1 - 2.4, po.X0 + .45, .42, po.Z1 - 2.3); span(p, WOOD_D, po.X0, 0, po.Z1 - .7, po.X0 + .45, .42, po.Z1 - .6);
    solid(p, po.X0, 0, po.Z1 - 2.4, po.X0 + .5, .5, po.Z1 - .6);
    lamp(p, 0, po.y1 - .5, (po.Z0 + po.Z1) / 2, .3);
  }

  // ---------- the town hall: reception desk, flags, the portrait, benches, a grand stair ----------
  function hall(p, r, wins) {
    const { X0, X1, Z0, Z1, y0, y1 } = r;
    for (const x of wins) pane(p, r, 'front', x, 1.8, 1, 1.7);
    span(p, lit(0x8a1e24, .35), -.8, y0, -5.2, .8, y0 + .012, Z1);
    // the desk, a chair, a screen and a bell
    span(p, WOOD, -1.8, y0, -6.3, 1.8, y0 + 1.05, -5.6); span(p, WOOD_L, -1.85, y0 + 1.05, -6.35, 1.85, y0 + 1.1, -5.55);
    span(p, WOOD_D, -1.8, y0 + .1, -5.62, 1.8, y0 + .9, -5.58);
    solid(p, -1.85, y0, -6.35, 1.85, y0 + 1.1, -5.55);
    span(p, DARK, -.9, y0 + 1.1, -6.2, -.3, y0 + 1.5, -6.16); span(p, SCREEN, -.87, y0 + 1.13, -6.16, -.33, y0 + 1.47, -6.15);
    ball(p, .06, GOLD, .9, y0 + 1.14, -5.8); span(p, WHITE, .2, y0 + 1.1, -6.1, .5, y0 + 1.11, -5.8);
    chair(p, 0, -6.9, 0, WOOD_D, y0);
    // the flags either side of the portrait
    const flag = (x, stripes) => {
      cyl(p, .03, 2.7, BRASS, x, y0 + 1.35, Z0 + .35); ball(p, .06, GOLD, x, y0 + 2.75, Z0 + .35);
      stripes.forEach(([c, a, b], k) => span(p, lit(c, .45), x + .04 + a, y0 + 1.1, Z0 + .33, x + .04 + b, y0 + 2.6, Z0 + .36));
      solid(p, x - .1, y0, Z0 + .2, x + .9, y0 + 2.7, Z0 + .5);
    };
    flag(-3, [[0x1d3a8a, 0, .27], [0xf4f4f2, .27, .54], [0xd8262e, .54, .81]]);
    flag(2.2, [[0x1d3a8a, 0, .81]]);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; box(p, .05, .05, .01, GOLD, 2.64 + Math.cos(a) * .22, y0 + 1.85 + Math.sin(a) * .22, Z0 + .37); }
    const portrait = canvasTex(64, 80, (c) => {
      c.fillStyle = '#2a3a2e'; c.fillRect(0, 0, 64, 80);
      c.fillStyle = '#1e1e28'; c.beginPath(); c.ellipse(32, 78, 26, 26, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#e8c8a8'; c.beginPath(); c.ellipse(32, 36, 10, 13, 0, 0, 7); c.fill();
      c.fillStyle = '#5a4a3a'; c.beginPath(); c.ellipse(32, 26, 11, 6, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#f4f4f2'; c.fillRect(28, 52, 8, 8);
      const sash = ['#1d3a8a', '#f4f4f2', '#d8262e']; sash.forEach((col, k) => { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(12 + k * 3, 56); c.lineTo(46 + k * 3, 80); c.stroke(); });
    });
    span(p, GOLD, -.7, y0 + 1.2, Z0, .7, y0 + 2.9, Z0 + .05);
    span(p, lit(0xffffff, .3, portrait), -.58, y0 + 1.32, Z0 + .05, .58, y0 + 2.78, Z0 + .06);
    // Marianne on her pedestal
    span(p, WHITE, -6.3, y0, Z0 + .3, -5.7, y0 + 1.1, Z0 + .9);
    span(p, WHITE, -6.25, y0 + 1.1, Z0 + .45, -5.75, y0 + 1.4, Z0 + .75); ball(p, .17, WHITE, -6, y0 + 1.6, Z0 + .6);
    cyl(p, .12, .2, lit(0xc8282e, .45), -6, y0 + 1.78, Z0 + .6, SHADE);
    solid(p, -6.3, y0, Z0 + .3, -5.7, y0 + 1.9, Z0 + .9);
    // benches along the left wall, notice boards over them
    const bench = (z) => {
      span(p, WOOD, X0 + .05, y0 + .42, z - .9, X0 + .5, y0 + .47, z + .9); span(p, WOOD, X0, y0 + .47, z - .9, X0 + .06, y0 + .95, z + .9);
      for (const e of [-.8, .8]) span(p, WOOD_D, X0 + .05, y0, z + e - .03, X0 + .5, y0 + .42, z + e + .03);
      solid(p, X0, y0, z - .9, X0 + .5, y0 + .95, z + .9);
      span(p, lit(0xb8905a, .35), X0, y0 + 1.3, z - .8, X0 + .03, y0 + 2.2, z + .8);
      for (let k = 0; k < 4; k++) span(p, WHITE, X0 + .03, y0 + 1.4 + (k % 2) * .38, z - .7 + k * .38, X0 + .04, y0 + 1.72 + (k % 2) * .38, z - .42 + k * .38);
    };
    bench(-3); bench(-7.5);
    // the grand stair up to the council room, a bench by the door
    stairs(p, X1 - 1.6, X1, -4.4, Z0, y0, y1, lit(0xe8e0d0, .4), X1 - 1.6);
    span(p, WOOD, X1 - .5, y0 + .42, -3.3, X1 - .05, y0 + .47, -1.5); span(p, WOOD, X1 - .06, y0 + .47, -3.3, X1, y0 + .95, -1.5);
    solid(p, X1 - .5, y0, -3.3, X1, y0 + .95, -1.5);
    plant(p, -2.2, Z1 - .6, 1.4, y0); plant(p, 2.2, Z1 - .6, 1.4, y0);
    // two chandeliers
    for (const x of [-5, 5]) {
      box(p, .02, .5, .02, BRASS, x, y1 - .3, -5.5); cyl(p, .5, .03, BRASS, x, y1 - .55, -5.5);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ball(p, .08, SHADE_M, x + Math.cos(a) * .5, y1 - .47, -5.5 + Math.sin(a) * .5); }
    }
  }

  return { inner, church, hall, skin, refUV, rnd, pick, lit, glow, box, span, cyl, ball, solid, shell, pane, picture, stairs, plant, lamp, chair, shelves, counter, till, door, doors, finish, update, home, shop, cafe, bakery, canvasTex, checkTex, tileTex, parquet, paper, CEIL, WOOD, WOOD_D, WOOD_L, METAL, WHITE, GOLD, BRASS, DARK, FLAME, SHADE_M, FRAME, PANE, SCREEN, LEAF, POT, PAPERS, WOODS };
}
