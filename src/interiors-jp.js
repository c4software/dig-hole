// interiors-jp.js, the insides of the Japanese town: hollow shells with a real doorway,
// doors that swing open as you walk up, and rooms behind them (a genkan full of shoes,
// tatami behind shoji, a kitchen, a shrine's altar, a station's gates). Everything is
// painted from one palette texture (a swatch per colour, a second map for its glow), so
// the town's merge folds every room into a single draw call; no light is ever added.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from './street.js';

const IN_WALLS = [0xf2ece0, 0xeae6dc, 0xf4efe6, 0xe8e2d4];
const IN_FLOORS = [0xa8784a, 0x8a6040, 0xc09462];
const FABRIC = [0x5a7a9a, 0x8a4a4a, 0x6a8a5a, 0xc8a878, 0x4a4a5a, 0xd88a6a];
const WOOD = [0x7a5530, 0x5a3e28, 0xa8804e];
const SHOES = [0x2a2a2e, 0xf4f4f0, 0x8a5a3a, 0xd8262e, 0x2f6cc0];

export function jpInteriors({ box, mat, colliders, sign }) {
  const rnd = seeded(211);                       // its own dice: the exteriors keep theirs
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  // the palette: 16 x 16 swatches; lit(c, k) is a colour that glows k of itself (k = 0: plain)
  const palC = document.createElement('canvas'), palE = document.createElement('canvas');
  palC.width = palC.height = palE.width = palE.height = 64;
  const palTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
  const palMap = palTex(palC), palEm = palTex(palE);
  const palM = new THREE.MeshLambertMaterial({ map: palMap, emissive: 0xffffff, emissiveMap: palEm });
  const slots = new Map();
  const paint = (s, c, e) => {
    const x = (s.i % 16) * 4, y = Math.floor(s.i / 16) * 4;
    const gc = palC.getContext('2d'), ge = palE.getContext('2d');
    gc.fillStyle = '#' + new THREE.Color(c).getHexString(); gc.fillRect(x, y, 4, 4);
    ge.fillStyle = '#' + new THREE.Color(e).getHexString(); ge.fillRect(x, y, 4, 4);
    palMap.needsUpdate = palEm.needsUpdate = true;
  };
  const lit = (c, k = .4, e = null) => {
    const key = c + ':' + k + ':' + e;
    if (!slots.has(key)) {
      const i = slots.size; if (i >= 256) throw new Error('interiors-jp: palette full');
      const s = { pal: true, i, u: (i % 16 * 4 + 2) / 64, v: 1 - (Math.floor(i / 16) * 4 + 2) / 64 };
      paint(s, c, e ?? new THREE.Color(c).multiplyScalar(k).getHex());
      slots.set(key, s);
    }
    return slots.get(key);
  };
  const pal = (c) => lit(c, 0);
  // a geometry in the palette: every vertex on its swatch
  const onSwatch = (geo, s) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, s.u, s.v); return geo; };
  const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(m.pal ? onSwatch(geo, m) : geo, m.pal ? palM : m); o.position.set(x, y, z); parent.add(o); return o; };
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  // the inside of a window: plain bright sky, dark blue at night (its swatch is repainted)
  const pane = lit(0xdcecf6, 1);
  const DAY = new THREE.Color(0xdcecf6), NIGHT = new THREE.Color(0x1c2840), paneC = new THREE.Color();
  let paneN = -1;
  const lampM = lit(0xfff4dc, 1, 0xffe6b0);
  const panelM = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: .9 });
  const shojiTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#fbf7ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6a4a30';
    for (let x = 0; x <= w; x += w / 3) c.fillRect(Math.min(x, w - 3), 0, 3, h);
    for (let y = 0; y <= h; y += h / 6) c.fillRect(0, Math.min(y, h - 3), w, 3);
    c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h); c.fillRect(0, h - 10, w, 10);
  });
  const shojiM = new THREE.MeshLambertMaterial({ map: shojiTex, emissive: 0xffffff, emissiveMap: shojiTex, emissiveIntensity: .55 });
  const tatamiTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#c9c48a'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = `rgba(90,80,30,${.06 + Math.random() * .08})`; c.fillRect(0, y, w, 1); }
    c.fillStyle = '#2e3a2a'; c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
  });
  const tatamiM = new THREE.MeshLambertMaterial({ map: tatamiTex, emissive: 0xffffff, emissiveMap: tatamiTex, emissiveIntensity: .3 });
  // (signs stick to the glyphs index.html's Noto Sans JP subset carries: latin, digits, a few kana and kanji)
  const signM = (t, k) => new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: k });
  const doors = [], rooms = [];
  // the volume inside a building, in world space (tests use it to find what pokes through)
  const room = (obj, x0, y0, z0, x1, y1, z1) => { obj.updateWorldMatrix(true, false); rooms.push(new THREE.Box3().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]).applyMatrix4(obj.matrixWorld)); };

  // a box given by its corners, in `obj`'s own frame
  const B = (obj, x0, y0, z0, x1, y1, z1, m) => mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, obj);
  // something that blocks, in world space
  const solid = (obj, x0, y0, z0, x1, y1, z1) => {
    obj.updateWorldMatrix(true, false);
    const b = new THREE.Box3().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]).applyMatrix4(obj.matrixWorld);
    const c = { min: b.min, max: b.max };
    colliders.push(c);
    return c;
  };
  const S = (obj, x0, y0, z0, x1, y1, z1, m) => { if (m) B(obj, x0, y0, z0, x1, y1, z1, m); return solid(obj, x0, y0, z0, x1, y1, z1); };
  const cyl = (obj, r, h, m, x, y, z, seg = 8, r2 = r) => mesh(new THREE.CylinderGeometry(r, r2, h, seg), m, x, y, z, obj);
  const blob = (obj, r, m, x, y, z) => mesh(new THREE.IcosahedronGeometry(r, 0), m, x, y, z, obj);

  // a wall piece whose texture is laid as if it were still one big box W x H x D:
  // the siding's courses run on unbroken across the pieces
  function piece(obj, x0, y0, z0, x1, y1, z1, m, { W, D, H, y: yb }) {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), nz = n.getZ(i);
      if (Math.abs(nz) > .5) uv.setXY(i, nz > 0 ? (x + W / 2) / W : (W / 2 - x) / W, (y - yb) / H);
      else if (Math.abs(nx) > .5) uv.setXY(i, nx > 0 ? (D / 2 - z) / D : (z + D / 2) / D, (y - yb) / H);
      else uv.setXY(i, (x + W / 2) / W, (z + D / 2) / D);
    }
    obj.add(new THREE.Mesh(geo, m));
  }
  // four walls of thickness T round a W x D footprint (front at +z), with doorways cut out
  function shell(obj, { W, D, H, y = 0, T, m, door = null, back = null, collide = false }) {
    const o = { W, D, H, y }, y1 = y + H;
    const P = (x0, y0, z0, x1, yy1, z1) => { if (x1 - x0 < 1e-3 || yy1 - y0 < 1e-3) return; piece(obj, x0, y0, z0, x1, yy1, z1, m, o); if (collide) solid(obj, x0, y0, z0, x1, yy1, z1); };
    const face = (z0, z1, d) => {
      if (!d || d.h <= y) { P(-W / 2, y, z0, W / 2, y1, z1); return; }
      P(-W / 2, y, z0, d.x - d.w / 2, y1, z1); P(d.x + d.w / 2, y, z0, W / 2, y1, z1);
      if (d.h < y1) P(d.x - d.w / 2, d.h, z0, d.x + d.w / 2, y1, z1);
    };
    face(D / 2 - T, D / 2, door); face(-D / 2, -D / 2 + T, back);
    P(-W / 2, y, -D / 2 + T, -W / 2 + T, y1, D / 2 - T); P(W / 2 - T, y, -D / 2 + T, W / 2, y1, D / 2 - T);
  }
  // a hinged door (one leaf or a pair) in a doorway at x, in the wall at z; `inward` is the
  // side it swings to (-1: towards -z). e opens and shuts it.
  function door(obj, { x, z, w, h, y = 0, t = .2, m, leaves = 1, inward = -1, handle = lit(0xc8ccd2, .2), glass = null }) {
    const lw = w / leaves, pivots = [];
    for (let k = 0; k < leaves; k++) {
      const hinge = leaves === 2 ? (k ? 1 : -1) : -1, s = -hinge;
      const pv = new THREE.Group(); pv.position.set(x + hinge * w / 2, y, z); pv.userData.keep = true; obj.add(pv);
      // the leaf and its handle in one mesh: one draw call a leaf
      const lg = onSwatch(new THREE.BoxGeometry(lw - .02, h - .02, .06), m).translate(s * lw / 2, h / 2, 0);
      const hg = onSwatch(new THREE.BoxGeometry(.05, .2, .14), handle).translate(s * (lw - .1), 1, 0);
      const leaf = new THREE.Mesh(mergeGeometries([lg, hg]), palM); leaf.castShadow = false; pv.add(leaf);
      if (glass) { const gl = box(lw - .24, h - .5, .07, glass, s * lw / 2, h / 2 + .05, 0, pv); gl.castShadow = false; }
      pivots.push([pv, 1.45 * inward * hinge]);
    }
    const col = solid(obj, x - w / 2, y, z - t / 2, x + w / 2, y + h, z + t / 2);
    obj.updateWorldMatrix(true, false);
    const pos = obj.localToWorld(new THREE.Vector3(x, y + 1, z));
    doors.push({ pivots, col, pos, t: 0, open: false });
  }
  // an inner window: bright glass on the wall's inside face, an aluminium frame, a mullion
  function inWindow(obj, axis, at, a, y, w, h, n) {
    const alu = lit(0xc4c9d0, .3);
    if (axis === 'z') { B(obj, a - w / 2 - .06, y - h / 2 - .06, at - .012 * n, a + w / 2 + .06, y + h / 2 + .06, at - .022 * n, alu); B(obj, a - w / 2, y - h / 2, at - .02 * n, a + w / 2, y + h / 2, at - .03 * n, pane); B(obj, a - .02, y - h / 2, at - .03 * n, a + .02, y + h / 2, at - .04 * n, alu); }
    else { B(obj, at - .012 * n, y - h / 2 - .06, a - w / 2 - .06, at - .022 * n, y + h / 2 + .06, a + w / 2 + .06, alu); B(obj, at - .02 * n, y - h / 2, a - w / 2, at - .03 * n, y + h / 2, a + w / 2, pane); }
  }
  const picture = (obj, axis, at, a, y, w, h, n) => {
    const fr = lit(pick(WOOD), .3), art = lit(pick([0x8ab0d8, 0xe8b0a0, 0x9ac08a, 0xf0e0b0]), .5);
    if (axis === 'z') { B(obj, a - w / 2, y - h / 2, at, a + w / 2, y + h / 2, at - .03 * n, fr); B(obj, a - w / 2 + .05, y - h / 2 + .05, at, a + w / 2 - .05, y + h / 2 - .05, at - .035 * n, art); }
    else { B(obj, at, y - h / 2, a - w / 2, at - .03 * n, y + h / 2, a + w / 2, fr); B(obj, at, y - h / 2 + .05, a - w / 2 + .05, at - .035 * n, y + h / 2 - .05, a + w / 2 - .05, art); }
  };
  // a row of sliding shoji along x (z fixed) or along z (x fixed), from a to b, with a lintel and wall above
  function shoji(obj, axis, at, a, b, y0, top, wallM, gap = null) {
    const trim = lit(0x5a3e28, .3), kam = y0 + 1.9;
    const seg = (p0, p1) => {
      const n = Math.max(1, Math.round((p1 - p0) / .9)), pw = (p1 - p0) / n;
      for (let k = 0; k < n; k++) {
        const q0 = p0 + k * pw, q1 = q0 + pw;
        if (axis === 'z') B(obj, q0, y0, at - .03, q1, kam, at + .03, shojiM); else B(obj, at - .03, y0, q0, at + .03, kam, q1, shojiM);
      }
      if (axis === 'z') solid(obj, p0, y0, at - .06, p1, top, at + .06); else solid(obj, at - .06, y0, p0, at + .06, top, p1);
    };
    if (gap) { seg(a, gap[0]); seg(gap[1], b); if (axis === 'z') solid(obj, gap[0], kam, at - .06, gap[1], top, at + .06); else solid(obj, at - .06, kam, gap[0], at + .06, top, gap[1]); }
    else seg(a, b);
    // the panel slid aside, doubled up behind its neighbour
    if (gap) { const q1 = gap[0], q0 = q1 - .9; if (axis === 'z') B(obj, q0, y0, at - .1, q1, kam, at - .05, shojiM); else B(obj, at - .1, y0, q0, at - .05, kam, q1, shojiM); }
    if (axis === 'z') { B(obj, a, kam, at - .05, b, kam + .08, at + .05, trim); B(obj, a, kam + .08, at - .04, b, top, at + .04, wallM); B(obj, a, y0, at - .05, b, y0 + .03, at + .05, trim); }
    else { B(obj, at - .05, kam, a, at + .05, kam + .08, b, trim); B(obj, at - .04, kam + .08, a, at + .04, top, b, wallM); B(obj, at - .05, y0, a, at + .05, y0 + .03, b, trim); }
  }

  // ---------- a two-storey house: the ground floor, lived in; upstairs stays shut ----------
  // frame: front at +z, inner faces at ±(W/2-T), ±(D/2-T); the door at x = dx
  function house(h, { W, D, H1, T, dx, DW, DH, wins }) {
    const ax0 = -W / 2 + T, ax1 = W / 2 - T, az0 = -D / 2 + T, az1 = D / 2 - T, FL = .3, CE = H1 - .1;
    const wallM = lit(pick(IN_WALLS), .45), floorM = lit(pick(IN_FLOORS), .35), trim = lit(0x5a3e28, .3), woodM = lit(pick(WOOD), .35);
    const L = (...a) => B(h, ...a);
    room(h, ax0, 0, az0, ax1, CE, az1);
    // the lining, the ceiling (shut: the upstairs is private), a skirting board
    L(ax0, 0, az0, ax1, CE, az0 + .02, wallM); L(ax0, 0, az0, ax0 + .02, CE, az1, wallM); L(ax1 - .02, 0, az0, ax1, CE, az1, wallM);
    L(ax0, 0, az1 - .02, dx - DW / 2, CE, az1, wallM); L(dx + DW / 2, 0, az1 - .02, ax1, CE, az1, wallM); L(dx - DW / 2, DH, az1 - .02, dx + DW / 2, CE, az1, wallM);
    S(h, ax0, CE, az0, ax1, H1 + .15, az1, lit(0xf4f2ec, .45));
    // the genkan: stone floor at street level, a step up to the wooden floor, the shoe cupboard
    const gx1 = dx + DW / 2 + .35, gz0 = az1 - 1.25;
    L(ax0, 0, gz0, gx1, .08, az1, lit(0x8a8680, .3));          // over the street's contact shadow
    S(h, ax0, 0, az0, ax1, FL, gz0, floorM); S(h, gx1, 0, gz0, ax1, FL, az1, floorM);
    L(ax0, FL - .05, gz0 - .1, gx1, FL + .01, gz0 + .01, trim); L(gx1 - .01, FL - .05, gz0, gx1 + .1, FL + .01, az1, trim);
    for (const [x0, z0, x1, z1] of [[ax0, az0 + .02, ax1, az0 + .04], [ax0 + .02, az0, ax0 + .04, gz0], [ax1 - .04, az0, ax1 - .02, az1], [gx1, az1 - .04, ax1, az1 - .02]]) L(x0, FL, z0, x1, FL + .08, z1, trim);
    S(h, ax0, 0, gz0 + .1, ax0 + .38, .95, az1 - .1, woodM); L(ax0, .95, gz0 + .1, ax0 + .4, .99, az1 - .1, trim);
    if (rnd() < .6) { const p = cyl(h, .06, .14, lit(pick(FABRIC), .4), ax0 + .2, 1.06, gz0 + .4, 6); void p; }
    const shoes = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < shoes; k++) { const sm = lit(pick(SHOES), .3), sx = dx - .15 + k * .32, sz = az1 - .55 - rnd() * .35; L(sx - .1, .08, sz - .13, sx - .01, .15, sz + .13, sm); L(sx + .01, .08, sz - .13, sx + .1, .15, sz + .13, sm); }
    L(dx - .5, .08, az1 - .95, dx + .5, .09, az1 - .35, lit(pick(FABRIC), .3));
    // the stairs, straight up from the hall along the left wall into the ceiling
    const n = 12, rise = (CE - FL) / n, run = .24, sx1 = ax0 + .85;
    for (let k = 0; k < n; k++) L(ax0 + .02, FL, gz0 - run * (k + 1), sx1, FL + rise * (k + 1), gz0 - run * k, woodM);
    L(sx1, FL, gz0 - run * n, sx1 + .04, FL + .9, gz0, trim);
    const rail = mesh(new THREE.BoxGeometry(.05, .05, Math.hypot(run * n, CE - FL)), trim, sx1 + .02, FL + .9 + (CE - FL) / 2, gz0 - run * n / 2, h); rail.rotation.x = Math.atan2(CE - FL, run * n);
    solid(h, ax0, FL, gz0 - run * n, sx1 + .06, CE, gz0);
    // the tatami room at the back right, behind shoji; the kitchen and the table at the back left
    const xs = ax1 - (2.8 + rnd() * .4), zt = az0 + 2.8 + rnd() * .3;
    shoji(h, 'x', xs, az0, zt, FL, CE, wallM);
    shoji(h, 'z', zt, xs, ax1, FL, CE, wallM, [xs + .3, xs + 1.3]);
    const tw = ax1 - xs - .04, td = zt - az0 - .04, nc = Math.max(1, Math.round(tw / 1.8)), nr = Math.max(1, Math.round(td / .9));
    for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(td / nr, .02, tw / nc), tatamiM); m.rotation.y = Math.PI / 2; m.position.set(xs + .04 + (i + .5) * tw / nc, FL + .01, az0 + (j + .5) * td / nr); h.add(m); }
    // the tokonoma: a raised alcove, a hanging scroll, a vase
    L(ax1 - 1.2, FL, az0, ax1, FL + .15, az0 + .55, trim);
    L(ax1 - .85, FL + .7, az0 + .02, ax1 - .35, FL + 1.8, az0 + .04, lit(0xf2ead4, .5)); L(ax1 - .88, FL + 1.78, az0 + .02, ax1 - .32, FL + 1.82, az0 + .06, trim);
    L(ax1 - .78, FL + 1.05, az0 + .02, ax1 - .42, FL + 1.3, az0 + .045, lit(0x3a3a3a, .2));
    cyl(h, .08, .3, lit(0x3a5a7a, .4), ax1 - .25, FL + .3, az0 + .28, 8, .06);
    blob(h, .14, lit(pick([0xe8384f, 0xf08ab0, 0xf4f0f4]), .4), ax1 - .25, FL + .55, az0 + .28);
    // a low table with cushions round it, or a kotatsu under its quilt
    const rx = (xs + ax1) / 2, rz = (az0 + .55 + zt) / 2;
    if (rnd() < .5) { L(rx - .45, FL, rz - .45, rx + .45, FL + .32, rz + .45, woodM); L(rx - .5, FL + .32, rz - .5, rx + .5, FL + .36, rz + .5, woodM); }
    else { L(rx - .55, FL, rz - .55, rx + .55, FL + .33, rz + .55, lit(pick(FABRIC), .35)); L(rx - .45, FL + .33, rz - .45, rx + .45, FL + .37, rz + .45, woodM); }
    const cush = lit(pick(FABRIC), .4);
    for (const [ox, oz] of [[0, -.8], [0, .8], [-.8, 0], [.8, 0]]) if (rnd() < .8) L(rx + ox - .26, FL, rz + oz - .26, rx + ox + .26, FL + .08, rz + oz + .26, cush);
    L(rx - .3, CE - .45, rz - .3, rx + .3, CE - .1, rz + .3, lampM); L(rx - .01, CE - .1, rz - .01, rx + .01, CE, rz + .01, trim);
    // the kitchen along the back wall: counter, sink, hob, cupboards, the fridge
    const kx1 = ax0 + 2.2 + rnd() * .3, cab = lit(pick([0xf4f4f0, 0xd8c8a8, 0x8a9aa8, 0xa8784a]), .35), top = lit(0x9aa0a8, .35);
    L(ax0 + .02, FL, az0 + .02, kx1, FL + .82, az0 + .62, cab); L(ax0 + .02, FL + .82, az0 + .02, kx1, FL + .86, az0 + .64, top);
    L(ax0 + .4, FL + .8, az0 + .12, ax0 + .95, FL + .865, az0 + .5, lit(0x6a7078, .3));
    L(kx1 - .75, FL + .86, az0 + .1, kx1 - .1, FL + .88, az0 + .55, lit(0x2a2c30, .2));
    for (const ox of [-.52, -.28]) cyl(h, .08, .01, lit(0x5a5e66, .2), kx1 + ox, FL + .885, az0 + .32, 10);
    L(kx1 - .8, FL + 1.55, az0 + .02, kx1 - .05, FL + 1.9, az0 + .45, top);
    L(ax0 + .02, FL + 1.5, az0 + .02, kx1 - .85, FL + 2.2, az0 + .36, cab);
    L(kx1 + .05, FL, az0 + .02, kx1 + .72, FL + 1.8, az0 + .7, lit(0xeef0f2, .4)); L(kx1 + .08, FL + 1.1, az0 + .7, kx1 + .12, FL + 1.5, az0 + .74, top);
    solid(h, ax0, FL, az0, kx1 + .72, FL + 1.8, az0 + .72);
    L(ax0 + .4, FL + .88, az0 + .3, ax0 + .7, FL + .94, az0 + .5, lit(pick(FABRIC), .3));
    // the dining table and its chairs
    const tx = Math.max(sx1 + 1.1, Math.min((ax0 + xs) / 2, xs - 1.1)), tz = az0 + 1.75;
    S(h, tx - .65, FL, tz - .4, tx + .65, FL + .74, tz + .4); L(tx - .65, FL + .7, tz - .4, tx + .65, FL + .74, tz + .4, woodM);
    for (const [ox, oz] of [[-.55, -.35], [.55, -.35], [-.55, .35], [.55, .35]]) L(tx + ox - .03, FL, tz + oz - .03, tx + ox + .03, FL + .7, tz + oz + .03, woodM);
    const chairM = lit(pick(WOOD), .35);
    for (const [ox, sz] of [[-.35, -1], [.35, -1], [-.35, 1], [.35, 1]]) {
      const cz = tz + sz * .62;
      L(tx + ox - .2, FL + .42, cz - .2, tx + ox + .2, FL + .46, cz + .2, chairM); L(tx + ox - .04, FL, cz - .04, tx + ox + .04, FL + .42, cz + .04, chairM);
      L(tx + ox - .2, FL + .46, cz + sz * .18, tx + ox + .2, FL + .9, cz + sz * .21, chairM);
    }
    L(tx - .22, CE - .5, tz - .22, tx + .22, CE - .3, tz + .22, lampM); L(tx - .01, CE - .3, tz - .01, tx + .01, CE, tz + .01, trim);
    // the living room at the front: a sofa facing the television, a rug, a lamp, books
    const sofaM = lit(pick(FABRIC), .35), lz = (zt + az1) / 2 + .15, sx = ax1 - 2.6;
    L(sx - .7, FL + .01, lz - 1.1, ax1 - .6, FL + .02, lz + 1.1, lit(pick(FABRIC), .3));
    S(h, sx - .45, FL, lz - .95, sx + .4, FL + .42, lz + .95, sofaM); L(sx - .45, FL + .42, lz - .95, sx - .25, FL + .85, lz + .95, sofaM);
    for (const sz of [-1, 1]) L(sx - .45, FL + .42, lz + Math.min(sz * .95, sz * .8), sx + .4, FL + .62, lz + Math.max(sz * .95, sz * .8), sofaM);
    L(sx + .75, FL, lz - .45, sx + 1.25, FL + .38, lz + .45, woodM);
    S(h, ax1 - .45, FL, lz - .7, ax1, FL + .45, lz + .7, woodM);
    L(ax1 - .3, FL + .5, lz - .6, ax1 - .24, FL + 1.18, lz + .6, lit(0x1a1c20, .1)); L(ax1 - .31, FL + .54, lz - .56, ax1 - .305, FL + 1.14, lz + .56, lit(0x2a3a58, .5)); L(ax1 - .3, FL + .45, lz - .08, ax1 - .2, FL + .5, lz + .08, lit(0x1a1c20, .1));
    picture(h, 'x', ax1 - .02, lz, FL + 1.75, .7, .5, 1);
    if (rnd() < .7 && ax1 - .6 - (xs + 1.4) > .7) {
      const b0 = xs + 1.45, b1 = Math.min(ax1 - .55, b0 + 1.1);
      S(h, b0, FL, zt + .06, b1, FL + 1.8, zt + .38, woodM);
      for (const y of [.35, .8, 1.25, 1.7]) for (let k = 0; k < Math.floor((b1 - b0) / .09) - 1; k++) if (rnd() < .8) L(b0 + .05 + k * .09, FL + y - .28, zt + .12, b0 + .12 + k * .09, FL + y - .02 - rnd() * .06, zt + .4, lit(pick([0x8a2a2a, 0x2a5a8a, 0x3a6a3a, 0xd9a125, 0xeeeeee]), .35));
    }
    L(ax1 - .38, FL, az1 - .38, ax1 - .18, FL + .04, az1 - .18, trim); cyl(h, .015, 1.4, trim, ax1 - .28, FL + .72, az1 - .28, 4); cyl(h, .15, .3, lampM, ax1 - .28, FL + 1.5, az1 - .28, 8, .2);
    if (rnd() < .6) { cyl(h, .15, .3, lit(0xc8b8a0, .3), sx - .1, FL + .15, az1 - .3, 8); blob(h, .3, lit(0x4f8c3c, .3), sx - .1, FL + .55, az1 - .3); }
    cyl(h, .32, .06, lampM, sx + .6, CE - .03, lz, 12);
    picture(h, 'z', az1 - .02, dx + DW / 2 + .3 + .45, FL + 1.9, .5, .35, 1);
    // the windows, from inside
    for (const [axis, at, a, y, w, hh, nn] of wins) inWindow(h, axis, at, a, y, w, hh, nn);
  }

  // ---------- the shrine hall (haiden): polished boards, the altar, the sacred rope ----------
  // frame: the hall's own, body 5.2 x 4.2 from y .7 to 3.3, front at +z
  function hall(obj, { wood }) {
    const FL = .7, CE = 3.1, ix = 2.45, iz = 1.95;   // (the ceiling stays under the roof's base)
    room(obj, -ix, FL, -iz, ix, CE, iz);
    const inW = lit(0xb88a5a, .35), floorM = lit(0x9a6a40, .35), white = lit(0xf4f0e4, .5), dark = lit(0x3a2a1e, .25);
    shell(obj, { W: 5.2, D: 4.2, H: 2.6, y: FL, T: .15, m: wood, door: { x: 0, w: 1.3, h: 2.85 }, collide: true });
    // inside: boards, walls, a ceiling of dark beams
    B(obj, -ix, FL, -iz, ix, FL + .02, iz, floorM);
    B(obj, -ix, FL, -iz, ix, CE, -iz + .02, inW); B(obj, -ix, FL, -iz, -ix + .02, CE, iz, inW); B(obj, ix - .02, FL, -iz, ix, CE, iz, inW);
    B(obj, -ix, FL, iz - .02, -.65, CE, iz, inW); B(obj, .65, FL, iz - .02, ix, CE, iz, inW); B(obj, -.65, 2.85, iz - .02, .65, CE, iz, inW);
    B(obj, -ix, CE, -iz, ix, 3.18, iz, lit(0x6a4a30, .3)); solid(obj, -ix, CE, -iz, ix, 3.35, iz);
    for (let x = -2; x <= 2; x += 1) B(obj, x - .05, CE - .12, -iz, x + .05, CE, iz, dark);
    for (const x of [-ix + .08, ix - .08]) for (const z of [-iz + .08, 0, iz - .08]) B(obj, x - .08, FL, z - .08, x + .08, CE, z + .08, dark);
    // purple curtains along the top of the walls, a white crest in the middle
    const maku = lit(0x5a2a6a, .35);
    B(obj, -ix + .02, CE - .55, -iz + .02, ix - .02, CE - .15, -iz + .05, maku); B(obj, -ix + .02, CE - .55, -iz + .02, -ix + .05, CE - .15, iz - .02, maku); B(obj, ix - .05, CE - .55, -iz + .02, ix - .02, CE - .15, iz - .02, maku);
    cyl(obj, .14, .02, white, 0, CE - .35, -iz + .06, 10).rotation.x = Math.PI / 2;
    // the altar: three white tiers, the mirror, sakaki in vases, offerings, lanterns
    S(obj, -1.6, FL, -iz, 1.6, FL + .3, -iz + 1, white); S(obj, -1.2, FL, -iz, 1.2, FL + .6, -iz + .7, white); S(obj, -.8, FL, -iz, .8, FL + .9, -iz + .42, white);
    const mirror = cyl(obj, .22, .04, lit(0xf0f0e8, .8, 0xa09a80), 0, FL + 1.3, -iz + .22, 16); mirror.rotation.x = Math.PI / 2;
    B(obj, -.1, FL + .9, -iz + .15, .1, FL + 1.08, -iz + .3, dark);
    const green = lit(0x3a6a2a, .3), vase = lit(0xf4f4f0, .45);
    for (const sx of [-1, 1]) {
      cyl(obj, .06, .22, vase, sx * .6, FL + 1.01, -iz + .2, 8);
      blob(obj, .18, green, sx * .6, FL + 1.3, -iz + .2).scale.y = 1.4;
      // gohei: a wand with zigzag paper
      B(obj, sx * 1 - .01, FL + .6, -iz + .5, sx * 1 + .01, FL + 1.3, -iz + .52, dark);
      for (let k = 0; k < 3; k++) B(obj, sx * 1 - .08 + (k % 2) * .06, FL + 1.18 - k * .12, -iz + .5, sx * 1 + .02 + (k % 2) * .06, FL + 1.3 - k * .12, -iz + .53, white);
      // an offering stand with a sake bottle and rice
      B(obj, sx * 1.35 - .15, FL + .3, -iz + .6, sx * 1.35 + .15, FL + .5, -iz + .9, lit(0xd8c8a0, .35));
      cyl(obj, .05, .22, white, sx * 1.35, FL + .61, -iz + .75, 8);
      // a paper lantern on the floor either side
      B(obj, sx * 2.05 - .03, FL, -iz + .9, sx * 2.05 + .03, FL + .5, -iz + .96, dark);
      B(obj, sx * 2.05 - .18, FL + .5, -iz + .75, sx * 2.05 + .18, FL + 1.05, -iz + 1.11, lampM);
    }
    // the sacred rope across the altar, its paper streamers
    const rope = cyl(obj, .07, 3.4, lit(0xd8c89a, .4), 0, CE - .75, -iz + .95, 8); rope.rotation.z = Math.PI / 2;
    for (let k = -2; k <= 2; k++) for (let j = 0; j < 3; j++) B(obj, k * .6 - .06 + (j % 2) * .05, CE - .88 - j * .12, -iz + .93, k * .6 + .04 + (j % 2) * .05, CE - .78 - j * .12, -iz + .97, white);
    // a taiko drum on its stand in a corner, cushions for the priest
    const drum = cyl(obj, .32, .45, lit(0x8a3a24, .35), -1.95, FL + .75, .9, 12); drum.rotation.x = Math.PI / 2;
    for (const z of [.72, 1.08]) cyl(obj, .33, .02, lit(0xe8dcc0, .4), -1.95, FL + .75, z, 12).rotation.x = Math.PI / 2;
    B(obj, -2.2, FL, .7, -1.7, FL + .45, 1.1, dark); solid(obj, -2.3, FL, .5, -1.6, FL + 1.1, 1.3);
    L2(obj, lit(0x6a2a3a, .35));
    function L2(o, m) { for (const x of [-.4, .4]) B(o, x - .25, FL + .02, -.1, x + .25, FL + .08, .4, m); }
    // a small offering box inside, in front of the altar
    B(obj, -.4, FL, -iz + 1.3, .4, FL + .4, -iz + 1.7, lit(0x8a6a3a, .35)); for (let k = 0; k < 5; k++) B(obj, -.38 + k * .19, FL + .4, -iz + 1.32, -.35 + k * .19, FL + .42, -iz + 1.68, dark);
    solid(obj, -.4, FL, -iz + 1.3, .4, FL + .4, -iz + 1.7);
  }

  // ---------- the station building: kiosk, ticket machines, the gates, a way through to the platform ----------
  // frame: the building's own, 14 x 4 x 6, front (the plaza) at +z, back (the platform) at -z
  function station(obj, { wall, goodsM, fridgeM, glassM }) {
    const ix = 6.8, iz = 2.8, CE = 3.2, DX = 2, DW = 1.8, DH = 2.3;
    room(obj, -ix, 0, -iz, ix, CE, iz);
    const inW = lit(0xf2f0ea, .45), floorM = lit(0xcac6be, .35), steel = lit(0xb8bec6, .35), dark = lit(0x2a2e34, .2);
    shell(obj, { W: 14, D: 6, H: 4, T: .2, m: wall, door: { x: DX, w: DW, h: DH }, back: { x: DX, w: DW, h: DH + .2 }, collide: true });
    door(obj, { x: DX, z: 2.9, w: DW, h: DH, m: steel, leaves: 2, inward: -1, glass: glassM });
    door(obj, { x: DX, z: -2.9, w: DW, h: DH + .2, m: steel, leaves: 2, inward: 1, glass: glassM });   // (taller: the steps up to the platform start right outside)
    // floor, walls, ceiling with light panels
    S(obj, -ix, 0, -iz, ix, .1, iz, floorM);                    // over the plaza's paving and the contact shadow
    for (const z of [-iz, iz - .02]) { B(obj, -ix, 0, z, DX - DW / 2, CE, z + .02, inW); B(obj, DX + DW / 2, 0, z, ix, CE, z + .02, inW); B(obj, DX - DW / 2, DH + (z < 0 ? .2 : 0), z, DX + DW / 2, CE, z + .02, inW); }
    B(obj, -ix, 0, -iz, -ix + .02, CE, iz, inW); B(obj, ix - .02, 0, -iz, ix, CE, iz, inW);
    S(obj, -ix, CE, -iz, ix, 4, iz, lit(0xf4f4f0, .4));
    for (let x = -5; x <= 5; x += 2.5) for (const z of [-1.8, 1.4]) B(obj, x - .6, CE - .03, z - .15, x + .6, CE, z + .15, panelM);
    for (const [x0, z0, x1, z1] of [[-ix, -iz + .02, ix, -iz + .04], [-ix, iz - .04, ix, iz - .02], [-ix + .02, -iz, -ix + .04, iz], [ix - .04, -iz, ix - .02, iz]]) B(obj, x0, .1, z0, x1, .2, z1, dark);
    // the kiosk window from inside, the tactile path from the door to the gates
    inWindow(obj, 'z', iz, -2.5, 1.3, 4, 2.4, 1);
    B(obj, DX - .15, .1, -.2, DX + .15, .11, iz, mat(0xf2c21e));
    // the kiosk: shelves of goods, a drinks fridge, a counter with its till
    S(obj, -ix, 0, -.6, -ix + .45, 1.8, 1.8, lit(0xdcdfe2, .35)); B(obj, -ix + .45, .05, -.55, -ix + .47, 1.75, 1.75, goodsM);
    S(obj, -ix, 0, iz - .7, -4.9, 2, iz, lit(0xd8dce0, .3)); B(obj, -ix + .1, .1, iz - .72, -5, 1.9, iz - .7, fridgeM);
    S(obj, -4.4, 0, .3, -2.6, 1, .9, lit(0xe8e8e4, .4)); B(obj, -4.45, 1, .25, -2.55, 1.04, .95, dark);
    B(obj, -3.2, 1.04, .45, -2.8, 1.3, .75, dark); B(obj, -3.15, 1.3, .5, -2.85, 1.5, .52, lit(0x9ad0f0, .8));
    B(obj, -4.3, 1.04, .4, -3.7, 1.25, .8, goodsM);
    // ticket machines on the right wall, the fare map above them
    for (const z of [-.2, .75, 1.7]) {
      S(obj, ix - .55, 0, z - .42, ix, 1.7, z + .42, lit(0xdfe3e8, .4));
      const scr = B(obj, ix - .6, 1.0, z - .3, ix - .55, 1.4, z + .3, lit(0x6ab0e0, .9)); void scr;
      B(obj, ix - .58, .7, z - .3, ix - .55, .9, z - .05, dark); B(obj, ix - .6, .45, z + .05, ix - .55, .6, z + .3, lit(0xd8262e, .4));
    }
    const fare = canvasTex(512, 192, (c, w, h) => {
      c.fillStyle = '#fbfaf4'; c.fillRect(0, 0, w, h);
      c.lineWidth = 8; c.strokeStyle = '#e87aa0'; c.beginPath(); c.moveTo(20, 100); c.lineTo(492, 100); c.stroke();
      c.strokeStyle = '#2f6cc0'; c.beginPath(); c.moveTo(200, 20); c.lineTo(200, 100); c.lineTo(330, 170); c.stroke();
      c.fillStyle = '#1a1a1a'; c.font = '700 16px "Noto Sans JP", sans-serif'; c.textAlign = 'center';
      for (let k = 0; k < 8; k++) { const x = 30 + k * 64; c.beginPath(); c.arc(x, 100, 9, 0, 7); c.fillStyle = k === 3 ? '#d8262e' : '#fff'; c.fill(); c.strokeStyle = '#1a1a1a'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#1a1a1a'; c.fillText(['170', '150', '140', '桜ヶ丘', '140', '160', '190', '220'][k], x, 80); }
      c.font = '700 22px "Noto Sans JP", sans-serif'; c.fillText('tarifs · yen', w / 2, 30);
    });
    B(obj, ix - .04, 1.95, -.6, ix - .02, 2.9, 2.1, signM(fare, .45));
    const tk = sign('billets', { w: 512, h: 96, bg: '#1d3a6a', color: '#ffffff', size: 54 });
    B(obj, ix - .5, 2.95, -.4, ix - .45, 3.15, 1.9, signM(tk, .4));
    // the ticket gates: cabinets with blue readers, lanes between, a railing either side
    const GZ = -.9, cabM = lit(0xe4e6ea, .4), reader = lit(0x3a8ad8, .8);
    const xs = [DX - 1.53, DX - .51, DX + .51, DX + 1.53, DX + 2.55];
    for (const x of xs) {
      S(obj, x - .11, 0, GZ - .6, x + .11, 1.05, GZ + .6, cabM);
      B(obj, x - .12, 1.05, GZ - .6, x + .12, 1.08, GZ + .6, dark); B(obj, x - .1, 1.08, GZ + .25, x + .1, 1.1, GZ + .45, reader);
      for (const sx of [-1, 1]) B(obj, x + sx * .11, .55, GZ - .05, x + sx * .25, .85, GZ + .02, lit(0xf2a43a, .5));
    }
    for (const [x0, x1] of [[-ix, xs[0] - .11], [xs[4] + .11, ix]]) {
      S(obj, x0, 0, GZ - .04, x1, 1.9, GZ + .04);
      B(obj, x0, 1.0, GZ - .03, x1, 1.05, GZ + .03, steel); B(obj, x0, .5, GZ - .02, x1, .53, GZ + .02, steel);
      for (let x = x0 + .4; x < x1; x += 1.2) B(obj, x - .025, 0, GZ - .025, x + .025, 1.05, GZ + .025, steel);
    }
    const kaisatsu = sign('quais  »', { w: 512, h: 96, bg: '#1a1c20', color: '#ffe08a', size: 52 });
    B(obj, DX - 1.6, 2.6, GZ - .03, DX + 1.6, 2.9, GZ + .03, signM(kaisatsu, .5));
    B(obj, DX - .02, 2.9, GZ - .02, DX + .02, CE, GZ + .02, steel);
    // beyond the gates: the departure board over the back door, benches, posters
    const board = sign('trains · 10h24 · 10h31', { w: 512, h: 96, bg: '#101214', color: '#ffa030', size: 44 });
    B(obj, DX - 1.3, 2.62, -iz + .02, DX + 1.3, 3.1, -iz + .1, signM(board, .8));
    const bench = lit(0x8a5a36, .35);
    for (const [x0, x1] of [[-5.6, -3.4], [-2.6, -.6], [4.4, 6.4]]) {
      S(obj, x0, 0, -iz + .02, x1, .45, -iz + .5); B(obj, x0, .41, -iz + .05, x1, .45, -iz + .5, bench); B(obj, x0, .45, -iz + .03, x1, .95, -iz + .08, bench);
      for (const x of [x0 + .1, x1 - .1]) B(obj, x - .04, 0, -iz + .1, x + .04, .41, -iz + .45, steel);
    }
    for (const [x, col] of [[-4.5, 0xe87aa0], [-1.6, 0x5a9ad8], [5.4, 0xf2c230]]) B(obj, x - .4, 1.3, -iz + .02, x + .4, 2.3, -iz + .04, lit(col, .5));
    for (const [z, col] of [[-.3, 0x8ac06a]]) B(obj, -ix + .02, 1.3, z + 1.9, -ix + .04, 2.1, z + 2.5, lit(col, .5));
    // outside at the back: three steps up to the platform
    const stepM = pal(0xd8d2c8);
    for (let k = 0; k < 3; k++) S(obj, DX - 1.1, 0, -3.4 - k * .4, DX + 1.1, (k + 1) * .95 / 3, -3 - k * .4, stepM);
  }

  return {
    B, S, cyl, solid, shell, door, house, hall, station, inWindow, doors, rooms,
    palM, lit, pal,
    setNight(n) {
      const q = Math.round(n * 20) / 20;
      if (q === paneN) return;
      paneN = q; paneC.copy(DAY).lerp(NIGHT, q); paint(pane, paneC.getHex(), paneC.getHex());
    },
    // doors swing to where they were left: open or shut
    update(dt) {
      for (const d of doors) {
        const want = d.open ? 1 : 0;
        if (d.t === want) continue;
        d.t += (want - d.t) * Math.min(1, dt * 5);
        if (Math.abs(want - d.t) < .005) d.t = want;
        for (const [pv, a] of d.pivots) pv.rotation.y = a * d.t;
        d.col.off = d.t > .3;
      }
    },
  };
}
