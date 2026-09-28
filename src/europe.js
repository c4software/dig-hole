// europe.js, the village around our garden: terraced houses along the street, some
// half-timbered, with shutters, dormers and flower boxes; a square with a fountain, a café
// terrace, a bakery and the church; the town hall and its flags; shops with their signs;
// a stone viaduct on the horizon where a regional train goes by. Every door opens: the
// rooms behind them (homes, shops, the café, the bakery, the town hall, the church) are
// built by interiors.js.
import * as THREE from 'three';
import { createBlossoms, createCars, createContact, createLamps, createWalkers, puffGeometry, roofColliders, seeded } from './street.js';
import * as V from './vehicles.js';
import { createInteriors } from './interiors.js';

const ROAD_Z = -13.1;
const NORTH_FRONT = -16.2;          // house fronts on our side of the street
const SOUTH_FRONT = -10.6;          // and across it
const SANS = '"Helvetica Neue", Arial, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function lettering(text, { w = 1024, h = 128, bg = null, color = '#1a1a1a', size = 80, font = SERIF, weight = 700, spacing = 6 } = {}) {
  return canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${weight} ${size}px ${font}`;
    if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}

export function createEurope({ scene, addBox }) {
  const g = new THREE.Group();
  scene.add(g);
  const rnd = seeded(313);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return mats.get(k); };
  const box = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const flat = (w, d, m, x, y, z, rot = 0, parent = g) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-Math.PI / 2, 0, rot); p.position.set(x, y, z); p.receiveShadow = true; parent.add(p); return p; };

  // ---------- materials ----------
  const plasterTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 1500; n++) { c.fillStyle = `rgba(${170 + Math.random() * 60},${150 + Math.random() * 60},${130 + Math.random() * 60},${Math.random() * .06})`; c.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 4 + Math.random() * 16); }
  });
  const plaster = (c) => { const k = 'pl' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, map: plasterTex })); return mats.get(k); };
  const stoneTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 * 24; x < 280; x += 48) { const v = 205 + Math.random() * 45; c.fillStyle = `rgb(${v},${v - 6},${v - 16})`; c.fillRect(x + 1, y + 1, 46, 30); }
    c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < 256; y += 32) c.fillRect(0, y, 256, 2);
  }, [1, 1]);
  const stone = (c, rx = 1, ry = 1) => { const k = 'st' + c + rx + ',' + ry; if (!mats.has(k)) { const t = stoneTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); mats.set(k, new THREE.MeshLambertMaterial({ color: c, map: t })); } return mats.get(k); };
  const tileTex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, y + 6, 64, 2); for (let x = (y / 8) % 2 * 4; x < 64; x += 8) { c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(x, y, 1, 8); } }
  }, [4, 4]);
  const tiles = (c) => { const k = 'tl' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, map: tileTex })); return mats.get(k); };
  // two glasses: most windows dark at night, some lit
  const winTex = canvasTex(64, 64, (c) => { const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#e4f0fa'); gr.addColorStop(.55, '#94b4cc'); gr.addColorStop(1, '#5d7a92'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(8, 64); c.lineTo(30, 0); c.lineTo(40, 0); c.lineTo(18, 64); c.fill(); });
  const glassLit = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffc47a, emissiveIntensity: 0 });
  const glassDark = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0x6a88a8, emissiveIntensity: 0 });
  const white = mat(0xf6f2ea), timber = mat(0x4a3428), iron = mat(0x2a2e34);
  const WALLS = [0xf4ead6, 0xecd9b6, 0xf2dcc2, 0xe2cca6, 0xf6f1e8, 0xe9d2b2, 0xdfe3e2, 0xf0e0cc, 0xe8c9a8, 0xd8dcc8];
  const ROOFS = [0xb8573a, 0xa84c33, 0xc0663f, 0x4d5563, 0x434b58, 0x9a4a36];
  const SHUTTERS = [0x6f9a7c, 0x5a7fa6, 0x94423e, 0x98a6ac, 0x7d8c5a, 0x4f6f8f, 0xd8c8a0];
  const FLOWERS = [0xe8384f, 0xf06a9a, 0xf6f0f4, 0xf2a43a, 0xb04ad8];
  const hedgeGeo = puffGeometry(1, .8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4f8a3a, emissive: 0x0e1a08 });
  const carBuilder = createCars({ parent: g, addBox });
  const contact = createContact({ parent: g });
  const cars = (x, z, rot, color, kind) => { const c = carBuilder(x, z, rot, color, kind); contact.blob(x, z, 2.4, .125); return c; };
  // the rooms behind the doors, with their own seeded random so the street keeps its looks
  const I = createInteriors({ addBox });
  const camera = scene.children.find(o => o.isCamera);

  // ---------- one house of a terrace: a street front, built in its own frame, front at +z ----------
  function facade(x, zFront, rot, W, { floors = rnd() < .45 ? 3 : 2, shop = null, timbered = rnd() < .25, color = pick(WALLS), roofC = pick(ROOFS), floorY = 0 } = {}) {
    const h = new THREE.Group();
    const D = 8, FH = 2.9, H = floors * FH;
    h.position.set(x, 0, zFront); h.rotation.y = rot; h.updateMatrix();
    g.add(h);
    const wall = plaster(timbered ? 0xf2e8d2 : color);
    // the upper floors are a solid block; the ground floor is a room (walls built below)
    const REF = { x0: -W / 2, x1: W / 2, y0: 0, y1: H, z0: -D, z1: 0 };
    I.skin(h, wall, -W / 2, FH, -D, W / 2, H, 0, REF);
    const cols = Math.max(1, Math.round((W - 1) / 2.3));
    const dx = shop ? W / 2 - 1.1 : -W / 2 + (Math.floor(cols / 2) + .5) * W / cols, d0 = dx - .5, d1 = dx + .5;
    // the stone plinth, as four strips so the room stays clear, cut at the door
    const plin = stone(0xc8bca8, W / 3, .3), PR = { x0: -W / 2 - .02, x1: W / 2 + .02, y0: 0, y1: .5, z0: -D - .02, z1: .02 };
    I.skin(h, plin, -W / 2 - .02, 0, -D - .02, W / 2 + .02, .5, -D + .02, PR);
    for (const sx of [-1, 1]) I.skin(h, plin, sx * W / 2 - .02, 0, -D + .02, sx * W / 2 + .02, .5, -.02, PR);
    I.skin(h, plin, -W / 2 - .02, 0, -.02, d0 - .08, .5, .02, PR); I.skin(h, plin, d1 + .08, 0, -.02, W / 2 + .02, .5, .02, PR);
    for (let f = 1; f < floors; f++) box(W + .06, .14, .1, mat(new THREE.Color(color).multiplyScalar(.85).getHex()), 0, f * FH, .03, h);
    box(W + .1, .22, .3, white, 0, H - .05, .1, h);
    // the roof: a gable along the street, tiles, a chimney, sometimes a dormer
    const ridge = 2.4 + rnd() * 1.2;
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2 - .45, -.1); tri.lineTo(D / 2 + .45, -.1); tri.lineTo(0, ridge); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: W + .2, bevelEnabled: false });
    rg.rotateY(Math.PI / 2); rg.translate(-(W + .2) / 2, H, -D / 2);
    const roofM = tiles(roofC);
    h.add(new THREE.Mesh(rg, roofM));
    const gab = new THREE.Shape(); gab.moveTo(-D / 2, 0); gab.lineTo(D / 2, 0); gab.lineTo(0, ridge - .12); gab.closePath();
    for (const sx of [-1, 1]) { const gg = new THREE.ExtrudeGeometry(gab, { depth: .02, bevelEnabled: false }); gg.rotateY(Math.PI / 2); gg.translate(sx * (W / 2 + .005) - .01, H, -D / 2); h.add(new THREE.Mesh(gg, wall)); }
    const chx = (rnd() - .5) * W * .6;
    box(.6, 1.8, .6, plaster(0xd8c8b0), chx, H + ridge * .6, -D * .62, h);
    box(.75, .12, .75, mat(0x8a7a6a), chx, H + ridge * .6 + .95, -D * .62, h);
    if (rnd() < .45 && W > 5.5) {
      // a dormer: a small gabled window standing out of the roof slope
      const dz = -D * .22, dy = H + ridge * .38;
      box(1.3, 1.2, 1.4, wall, 0, dy, dz, h);
      box(.8, .8, .06, glassDark, 0, dy - .05, dz + .71, h);
      const dt = new THREE.Shape(); dt.moveTo(-.85, 0); dt.lineTo(.85, 0); dt.lineTo(0, .7); dt.closePath();
      const dg = new THREE.ExtrudeGeometry(dt, { depth: 1.6, bevelEnabled: false }); dg.translate(0, dy + .6, dz - .8);
      h.add(new THREE.Mesh(dg, roofM));
    }
    // half-timbering on the upper floors: posts, rails and braces in dark oak
    if (timbered) for (let f = 1; f < floors; f++) {
      const y0 = f * FH;
      box(W, .16, .06, timber, 0, y0 + .08, .03, h); box(W, .16, .06, timber, 0, y0 + FH - .1, .03, h);
      for (let px = -W / 2 + .08; px <= W / 2; px += W / Math.round(W / 1.1)) box(.16, FH, .06, timber, px, y0 + FH / 2, .035, h);
      for (let k = 0; k < Math.round(W / 2.2); k++) { const b = box(.14, 1.6, .05, timber, -W / 2 + 1.1 + k * 2.2, y0 + FH / 2, .04, h); b.rotation.z = (k % 2 ? 1 : -1) * .6; }
    }
    // windows: shutters, sills, flower boxes, now and then a little iron balcony
    const shut = mat(pick(SHUTTERS)), flower = mat(pick(FLOWERS));
    for (let f = shop ? 1 : 0; f < floors; f++) for (let k = 0; k < cols; k++) {
      const wx = -W / 2 + (k + .5) * W / cols, wy = f * FH + 1.55;
      if (f === 0 && k === Math.floor(cols / 2)) continue;
      box(.95, 1.45, .06, white, wx, wy, .03, h);
      box(.8, 1.3, .05, rnd() < .35 ? glassLit : glassDark, wx, wy, .05, h);
      box(.04, 1.3, .08, white, wx, wy, .07, h); box(.8, .04, .08, white, wx, wy + .25, .07, h);
      box(1.05, .07, .2, mat(0xd8d0c0), wx, wy - .76, .1, h);
      if (!timbered || f === 0) for (const s of [-1, 1]) { box(.44, 1.45, .05, shut, wx + s * .72, wy, .06, h); for (let q = 0; q < 5; q++) box(.38, .025, .04, mat(new THREE.Color(shut.color).multiplyScalar(.8).getHex()), wx + s * .72, wy - .55 + q * .27, .09, h); }
      if (f > 0 && rnd() < .3) { box(1.1, .06, .45, iron, wx, wy - .8, .25, h); for (let q = 0; q < 7; q++) box(.025, .5, .025, iron, wx - .5 + q * .166, wy - .55, .45, h); box(1.1, .04, .04, iron, wx, wy - .3, .45, h); }
      else if (rnd() < .6) { box(.85, .18, .2, mat(0x8a5a3a), wx, wy - .66, .16, h); for (let q = 0; q < 4; q++) { const m = new THREE.Mesh(hedgeGeo, q % 2 ? flower : leafMat); m.scale.setScalar(.12 + rnd() * .05); m.position.set(wx - .3 + q * .2, wy - .52, .18); h.add(m); } }
    }
    // the ground floor: a front door, or a shop front with its awning and sign
    if (shop) shopFront(h, W, shop, d0, d1);
    else {
      // a frame round the doorway, and the door itself on its hinge (it opens as you come)
      box(.075, 2.25, .06, white, d0 - .0375, 1.125, .03, h); box(.075, 2.25, .06, white, d1 + .0375, 1.125, .03, h); box(1.15, .1, .06, white, dx, 2.2, .03, h);
      I.door(h, { x: d0, z: -.06, w: 1, h: 2.15, color: pick([0x5a3a28, 0x2f4a6a, 0x3a5a3a, 0x7a2a24, 0x4a4a4a]) });
      box(1.4, .12, .5, stone(0xc8bca8), dx, .06, .25, h);
      box(1.3, .08, .12, white, dx, 2.3, .08, h);
    }
    // the other sides get windows too (the street's neighbours hide most of them)
    for (let f = 0; f < floors; f++) {
      const wy = f * FH + 1.55;
      for (const k of [-1, 1]) {
        box(.85, 1.3, .06, white, k * W * .25, wy, -D - .03, h); box(.72, 1.15, .05, rnd() < .3 ? glassLit : glassDark, k * W * .25, wy, -D - .05, h);
      }
      for (const sx of [-1, 1]) { box(.06, 1.3, .85, white, sx * (W / 2 + .03), wy, -D * .5, h); box(.05, 1.15, .72, glassDark, sx * (W / 2 + .05), wy, -D * .5, h); }
    }
    // by the door: a pot of flowers, now and then a bin or a bicycle
    if (!shop) {
      if (rnd() < .7) { const pot = new THREE.Mesh(new THREE.CylinderGeometry(.22, .16, .4, 10), mat(0xb8643a)); pot.position.set(dx + .9, .2, .3); h.add(pot); const pl = new THREE.Mesh(hedgeGeo, rnd() < .5 ? leafMat : mat(pick(FLOWERS))); pl.scale.set(.32, .38, .32); pl.position.set(dx + .9, .6, .3); h.add(pl); }
      if (rnd() < .3) { box(.55, .95, .6, mat(pick([0x3a6a3a, 0x5a5e66, 0xd8b830])), dx - 1.1, .48, .4, h); box(.6, .06, .66, mat(0x2a2e34), dx - 1.1, .98, .4, h); }
    }
    h.updateMatrix();
    const bb = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D), new THREE.Vector3(W / 2, H, 0)).applyMatrix4(h.matrix);
    addBox(bb.min.x, FH, bb.min.z, bb.max.x, H, bb.max.z);
    // the ground floor: walls round a room, a doorway, and what the room is for
    const inside = shop ? shop.inside : 'home';
    const room = I.shell(h, { x0: -W / 2, x1: W / 2, z0: -D, z1: 0, y0: floorY, y1: FH, ext: wall, ref: REF, door: [d0, d1, 2.15],
      int: inside === 'cafe' ? I.lit(0xe8d6ae, .42) : inside === 'home' ? I.paper(I.pick(I.PAPERS)) : I.lit(0xf2efe6, .42),
      floor: inside === 'cafe' ? I.lit(0xffffff, .3, I.checkTex) : inside === 'bakery' ? I.lit(0xc8845a, .38, I.tileTex) : inside === 'home' ? I.parquet(I.pick(I.WOODS)) : I.lit(0xd8d0c0, .4, I.tileTex) });
    if (inside === 'home') {
      const wins = []; for (let k = 0; k < cols; k++) if (k !== Math.floor(cols / 2)) wins.push(-W / 2 + (k + .5) * W / cols);
      I.home(h, room, [d0, d1], { wins, sides: [['left', -D / 2], ['right', -D / 2]] });
    } else if (inside === 'cafe') I.cafe(h, room, [d0, d1]);
    else if (inside === 'bakery') I.bakery(h, room, [d0, d1]);
    else I.shop(h, room, inside, [d0, d1]);
    roofColliders(addBox, { x0: -W / 2, x1: W / 2, z0: -D - .4, z1: .4, y: H, h: ridge, kind: 'x', matrix: h.matrix });
    contact.rect((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2, bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0, .125);
    return h;
  }
  // shop fronts: big windows lit from inside, a striped awning, painted letters
  const shopGlass = new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, (c) => {
    c.fillStyle = '#f4efe2'; c.fillRect(0, 0, 256, 128);
    for (let k = 0; k < 5; k++) { c.fillStyle = `hsl(${30 + Math.random() * 30},40%,${60 + Math.random() * 20}%)`; c.fillRect(10 + k * 50, 70, 40, 58); c.fillStyle = `hsl(${Math.random() * 360},45%,55%)`; for (let q = 0; q < 4; q++) c.fillRect(14 + k * 50 + q * 9, 40, 7, 24); }
    c.fillStyle = 'rgba(255,255,255,.3)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(k * 70 + 10, 128); c.lineTo(k * 70 + 50, 0); c.lineTo(k * 70 + 64, 0); c.lineTo(k * 70 + 24, 128); c.fill(); }
  }), emissive: 0xfff0d0, emissiveIntensity: .12 });
  const awningTex = (a, b) => canvasTex(128, 64, (c) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? a : b; c.fillRect(k * 16, 0, 16, 64); } c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, 56, 128, 8); });
  function shopFront(h, W, { name, color = '#1d3a5a', text = '#f2d78a', awning = ['#b8282e', '#f4efe6'], sign = null }, d0, d1) {
    const fm = mat(new THREE.Color(color).getHex()), dark = mat(0x2a2e34);
    // the painted front round the doorway, the window up to the door, a glazed door
    I.skin(h, fm, -W / 2 + .1, 0, 0, d0, 2.9, .12); I.skin(h, fm, d1, 0, 0, W / 2 - .1, 2.9, .12); I.skin(h, fm, d0, 2.15, 0, d1, 2.9, .12);
    I.skin(h, shopGlass, -W / 2 + .7, .25, .1, d0 - .15, 2.15, .16);
    I.skin(h, dark, d0 - .07, 0, 0, d0, 2.2, .16); I.skin(h, dark, d1, 0, 0, d1 + .07, 2.2, .16); I.skin(h, dark, d0 - .07, 2.15, 0, d1 + .07, 2.22, .16);
    I.door(h, { x: d0, z: -.06, w: 1, h: 2.15, color: 0x2a2e34 });
    const lt = lettering(name, { color: text, size: 70, font: SERIF, spacing: 8 });
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(W - .6, .55), new THREE.MeshLambertMaterial({ map: lt, transparent: true, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: .08 }));
    nm.position.set(0, 2.55, .135); h.add(nm);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(W - .4, 1.3), new THREE.MeshLambertMaterial({ map: awningTex(...awning), side: THREE.DoubleSide }));
    aw.position.set(0, 2.25, .62); aw.rotation.x = -Math.PI / 2 + .55; h.add(aw);
    if (sign === 'pharmacie') {
      const cross = new THREE.MeshLambertMaterial({ color: 0x20c060, emissive: 0x20e070, emissiveIntensity: .8 });
      const cg = new THREE.Group(); cg.position.set(W / 2 - .3, 3.6, .7); h.add(cg);
      box(.08, .08, .6, iron, 0, 0, -.35, cg);
      box(.7, .22, .08, cross, 0, 0, 0, cg); box(.22, .7, .08, cross, 0, 0, 0, cg);
      glows.push({ m: cross, a: .8, b: .6 });
    }
    if (sign === 'tabac') {
      const carrot = new THREE.Mesh(new THREE.OctahedronGeometry(.4, 0), new THREE.MeshLambertMaterial({ color: 0xc8282e, emissive: 0xc8282e, emissiveIntensity: .3 }));
      carrot.scale.set(.55, 1, .55); carrot.position.set(-W / 2 + .4, 3.5, .7); h.add(carrot);
      box(.06, .06, .6, iron, -W / 2 + .4, 3.95, .4, h);
      glows.push({ m: carrot.material, a: .3, b: 1.2 });
    }
  }
  const glows = [];

  // a terrace of houses along a stretch of street, skipping what's reserved
  function terrace(x0, x1, zFront, rot, shops = {}) {
    let x = x0;
    while (x1 - x > 5) {
      const W = Math.min(x1 - x, 5.5 + rnd() * 3.5);
      const cx = rot === 0 ? x + W / 2 : x + W / 2;
      // a shop goes to the house that spans its spot
      const k = Object.keys(shops).find(k => +k >= x && +k < x + W);
      facade(cx, zFront, rot, W, k ? { shop: shops[k], floors: 3 } : {});
      x += W + (rnd() < .25 ? .35 : 0);
    }
  }
  // our side of the street (fronts face the street, +z), leaving room for the houses you can enter
  const NORTH_GAPS = [[-117, -103], [-91, -76], [-64, -50], [-38, -9], [9, 36], [48, 61], [73, 88], [100, 117]];
  const northShops = { [-26]: { name: 'TABAC · PRESSE', color: '#8a1f24', text: '#f6e8c8', awning: ['#8a1f24', '#f4efe6'], sign: 'tabac', inside: 'tabac' } };
  for (const [a, b] of NORTH_GAPS) terrace(a, b, NORTH_FRONT, 0, a === -38 ? northShops : {});
  // across the street, beyond the garden: fronts face the street (−z)
  function terraceSouth(x0, x1, shops = {}) {
    let x = x0;
    while (x1 - x > 5) {
      const W = Math.min(x1 - x, 5.5 + rnd() * 3.5);
      const cx = x + W / 2;
      facade(cx, SOUTH_FRONT, Math.PI, W, shops[Math.round(cx) > 0 ? 'e' : 'w'] && !shops.used ? (shops.used = true, { shop: shops[Math.round(cx) > 0 ? 'e' : 'w'], floors: 3 }) : {});
      x += W + (rnd() < .25 ? .35 : 0);
    }
  }
  terraceSouth(-117, -72);
  terraceSouth(84, 117, { e: { name: 'PHARMACIE', color: '#f2f0ea', text: '#1d7a44', awning: ['#1d7a44', '#f4efe6'], sign: 'pharmacie', inside: 'pharmacie' } });
  // a second row behind, seen over the roofs
  for (let x = -115; x < 115; x += 8 + rnd() * 3) if (rnd() < .8) facade(x, -27.8, 0, 6 + rnd() * 2, {});

  // ---------- the square: paving, a fountain, the café, the bakery, the church ----------
  const SQ = { x0: 44, x1: 78, z0: -10.78, z1: 14 };
  const pave = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * 8; x < 136; x += 16) { const v = 200 + Math.random() * 55; c.fillStyle = `rgb(${v},${v - 6},${v - 14})`; c.fillRect(x + 1, y + 1, 14, 14); } }, [(SQ.x1 - SQ.x0) / 2, (SQ.z1 - SQ.z0) / 2]);
  const sqMat = new THREE.MeshLambertMaterial({ color: 0xd8ccb8, map: pave });
  box(SQ.x1 - SQ.x0, .1, SQ.z1 - SQ.z0, sqMat, (SQ.x0 + SQ.x1) / 2, .05, (SQ.z0 + SQ.z1) / 2);
  // the fountain: a wide stone basin (the mini jet-skis race in it), an island, a column,
  // two bowls, a curtain of water, and four frogs spitting at the island from the rim
  const FX = 61, FZ = 2, FR = 4.5, FW = FR - .12, FY = .55;
  const fountain = new THREE.Group(); fountain.position.set(FX, 0, FZ); g.add(fountain);
  const fs = stone(0xd4c8b0, 4, .3);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(FR, FR + .1, .7, 8, 1, true), fs); basin.position.y = .35; basin.rotation.y = Math.PI / 8; fountain.add(basin);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(FW, FW, .7, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xb8ac94, map: fs.map, side: THREE.BackSide })); inner.position.y = .35; inner.rotation.y = Math.PI / 8; fountain.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(FR - .05, .16, 6, 8), fs); rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 8; rim.position.y = .72; fountain.add(rim);
  // a pale floor under the water, so it reads shallow and blue
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FW, 8), mat(0x8ab4c0)); floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.PI / 8; floor.position.y = .12; fountain.add(floor);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x7ab8d8, roughness: .08, metalness: .2, emissive: 0x2a5a78, emissiveIntensity: .5, transparent: true, opacity: .82 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(FW, 8), waterMat); pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.PI / 8; pool.position.y = FY; fountain.add(pool);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(.62, .78, .62, 16), fs); island.position.y = .31; fountain.add(island);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.22, .32, 2.4, 12), fs); col.position.y = 1.2; fountain.add(col);
  for (const [r, y] of [[1.1, 1.45], [.55, 2.35]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * .45, .3, 16), fs); b.position.y = y; fountain.add(b); const w = new THREE.Mesh(new THREE.CircleGeometry(r * .92, 16), waterMat); w.rotation.x = -Math.PI / 2; w.position.y = y + .16; fountain.add(w); }
  const curtainTex = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(230,245,255,${.2 + Math.random() * .5})`; c.fillRect(Math.random() * 64, 0, 1 + Math.random() * 2, 64); } }, [6, 1]);
  const curtainMat = new THREE.MeshBasicMaterial({ map: curtainTex, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide });
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, .9, 24, 1, true), curtainMat); curtain.position.y = 1.0; fountain.add(curtain);
  const curtain2 = new THREE.Mesh(new THREE.CylinderGeometry(.5, .75, .75, 20, 1, true), curtainMat); curtain2.position.y = 2.0; fountain.add(curtain2);
  const frogM = mat(0x5a8a5a);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const frog = new THREE.Mesh(hedgeGeo, frogM); frog.scale.set(.22, .18, .26); frog.position.set(ca * (FR - .05), .92, sa * (FR - .05)); frog.rotation.y = -a - Math.PI / 2; fountain.add(frog);
    const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ca * (FR - .25), .95, sa * (FR - .25)), new THREE.Vector3(ca * (FR - 1.6), 1.9, sa * (FR - 1.6)), new THREE.Vector3(ca * 2.2, FY, sa * 2.2));
    fountain.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 16, .035, 5), curtainMat));
  }
  fountain.userData.keep = true;
  // the rim, as three boxes round the octagon
  const fa = FR * .95, fb = FR * .42, fc = FR * .68;
  addBox(FX - fa, 0, FZ - fb, FX + fa, .8, FZ + fb); addBox(FX - fb, 0, FZ - fa, FX + fb, .8, FZ + fa); addBox(FX - fc, 0, FZ - fc, FX + fc, .8, FZ + fc);
  contact.blob(FX, FZ, FR * 1.5, .12);
  // the café, facing the square: tables, parasols, a string of lights to the lamp posts
  const cafe = facade(51.6, -5.6, Math.PI / 2, 9, { floors: 3, shop: { name: 'CAFÉ DES CERISIERS', color: '#23402f', text: '#f2d78a', awning: ['#23402f', '#efe6cf'], inside: 'cafe' }, color: 0xecd9b6, floorY: .11 });
  void cafe;
  const rattan = mat(0x9a6a3a), tableTop = mat(0xe8e4dc);
  for (const [tx, tz] of [[54, -8.4], [54, -5.2], [54, -2], [57.4, -6.8], [57.4, -3.6]]) {
    const t = new THREE.Group(); t.position.set(tx, 0, tz); g.add(t);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .04, 16), tableTop); top.position.y = .74; t.add(top);
    box(.05, .72, .05, iron, 0, .36, 0, t);
    for (const a of [0, Math.PI]) { const ch = new THREE.Group(); ch.position.set(Math.cos(a) * .7, 0, Math.sin(a) * .7); ch.rotation.y = -a + Math.PI / 2; t.add(ch); box(.42, .05, .42, rattan, 0, .45, 0, ch); box(.42, .45, .05, rattan, 0, .7, -.2, ch); for (const [lx, lz] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) box(.03, .45, .03, iron, lx, .22, lz, ch); }
    const para = new THREE.Mesh(new THREE.ConeGeometry(1.35, .45, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xf0e6cf, side: THREE.DoubleSide })); para.position.y = 2.35; t.add(para);
    box(.04, 2.3, .04, mat(0x6a4a30), 0, 1.15, 0, t);
    addBox(tx - .5, 0, tz - .5, tx + .5, .8, tz + .5);
    contact.blob(tx, tz, 1.3, .12);
  }
  const bulbs = new THREE.MeshLambertMaterial({ color: 0xfff4d8, emissive: 0xffd890, emissiveIntensity: .2 });
  const festoon = [];
  const string = (a, b, n) => { for (let k = 0; k <= n; k++) { const t = k / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * .5; const s = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), bulbs); s.position.copy(p); g.add(s); festoon.push(p); } };
  for (const z of [-9, -5.5, -2]) { box(.08, 3.4, .08, iron, 59, 1.7, z); string(new THREE.Vector3(52.2, 3.3, z), new THREE.Vector3(59, 3.3, z), 14); addBox(58.9, 0, z - .1, 59.1, 3.4, z + .1); }
  const festoonLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(festoon.flatMap((p, k) => k && festoon[k - 1].distanceTo(p) < 1 ? [festoon[k - 1], p] : [])), new THREE.LineBasicMaterial({ color: 0x2a2e34 }));
  g.add(festoonLine);
  // the bakery on the other side
  facade(74.4, -5.6, -Math.PI / 2, 9, { floors: 2, shop: { name: 'BOULANGERIE', color: '#2a4a78', text: '#f2d78a', awning: ['#2a4a78', '#f4efe6'], inside: 'bakery' }, color: 0xf2dcc2, roofC: 0xa84c33, floorY: .11 });
  // (the square's paving stands 10 cm proud: these rooms' floors sit on top of it)
  facade(74.4, 4, -Math.PI / 2, 8, { floors: 3, color: 0xe8c9a8, floorY: .11 });
  facade(51.6, 4, Math.PI / 2, 8, { floors: 2, timbered: true, floorY: .11 });
  // a zebra crossing from the square to our side, bollards, benches, a post box
  for (let k = 0; k < 3; k++) flat(2.6, .5, white, FX, .03, ROAD_Z - 1 + k * 1);
  for (let x = SQ.x0 + 1; x < SQ.x1; x += 2.2) if (Math.abs(x - FX) > 2) { box(.16, .75, .16, iron, x, .38, -10.4); const cap = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), iron); cap.position.set(x, .78, -10.4); g.add(cap); }
  const bench = (x, z, rot) => { const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = rot; g.add(b); box(1.8, .06, .42, mat(0x6a8a5a), 0, .45, 0, b); box(1.8, .42, .05, mat(0x6a8a5a), 0, .72, -.2, b); for (const sx of [-.8, .8]) box(.06, .45, .45, iron, sx, .22, 0, b); addBox(x - .9, 0, z - .3, x + .9, .8, z + .3); contact.blob(x, z, 1.2, .12); };
  bench(FX - 5, FZ + 4, Math.PI * .8); bench(FX + 5, FZ + 4, -Math.PI * .8); bench(FX, FZ + 7.8, Math.PI);
  const post = new THREE.Group(); post.position.set(52, 0, 9); g.add(post);
  box(.5, .7, .4, mat(0xf2c21e), 0, 1.05, 0, post); box(.12, .7, .12, mat(0xf2c21e), 0, .35, 0, post);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(.42, .14), new THREE.MeshLambertMaterial({ map: lettering('LA POSTE', { w: 256, h: 64, color: '#1d3a78', size: 40, font: SANS }), transparent: true })); pl.position.set(0, 1.25, .21); post.add(pl);
  addBox(51.7, 0, 8.8, 52.3, 1.4, 9.2);
  // the church closes the square: a nave, a tower with a clock and a slate spire
  const ch = new THREE.Group(); ch.position.set(FX, 0, 25); ch.rotation.y = Math.PI; g.add(ch); ch.updateMatrix();
  const cStone = stone(0xd8ccb4, 3, 3);
  // inside, the same stone lit softly, and flagstones
  const inStone = (() => { const t = stoneTex.clone(); t.needsUpdate = true; t.repeat.set(4, 2); return new THREE.MeshLambertMaterial({ color: 0xe6dac4, map: t, emissive: 0x4a4436 }); })();
  const NAVE = { x0: -5.5, x1: 5.5, y0: 0, y1: 10, z0: -14, z1: 8 }, TOWER = { x0: -3.25, x1: 3.25, y0: 0, y1: 22, z0: 6.25, z1: 12.75 };
  const flagstones = I.lit(0xd0c4b0, .36, I.tileTex).clone();   // its own: the crypt's diggable ground cuts it (see main.js)
  const naveR = I.shell(ch, { x0: -5.5, x1: 5.5, z0: -14, z1: 8, y1: 10, t: .5, ext: cStone, ref: NAVE, int: inStone, floor: flagstones, ceil: I.lit(0x6a4a30, .35), door: [-1.1, 1.1, 3.9], skirt: false });
  const nave = new THREE.Shape(); nave.moveTo(-6, 0); nave.lineTo(6, 0); nave.lineTo(0, 5); nave.closePath();
  const ng = new THREE.ExtrudeGeometry(nave, { depth: 22.4, bevelEnabled: false }); ng.translate(0, 10, -14.2); ch.add(new THREE.Mesh(ng, tiles(0x4d5563)));
  // the tower: a porch on the ground floor, solid above it
  I.skin(ch, cStone, -3.25, 5, 6.25, 3.25, 22, 12.75, TOWER); I.solid(ch, -3.25, 5, 6.25, 3.25, 22, 12.75);
  const porch = I.shell(ch, { x0: -3.25, x1: 3.25, z0: 8, z1: 12.75, y1: 5, t: .5, ext: cStone, ref: TOWER, int: inStone, floor: flagstones, back: false, front: false, door: [0, 0, 0], skirt: false });
  porch.Z1 = 12.25;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 12, 4), tiles(0x434b58)); spire.rotation.y = Math.PI / 4; spire.position.set(0, 28, 9.5); ch.add(spire);
  const cross = new THREE.Group(); cross.position.set(0, 35, 9.5); ch.add(cross); box(.12, 1.4, .12, mat(0xd9a125), 0, 0, 0, cross); box(.8, .12, .12, mat(0xd9a125), 0, .2, 0, cross);
  const clockTex = canvasTex(128, 128, (c) => { c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#2a2a2a'; c.lineWidth = 5; c.stroke(); c.fillStyle = '#2a2a2a'; c.font = `700 14px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; ['XII', 'III', 'VI', 'IX'].forEach((r, k) => { const a = k / 4 * Math.PI * 2 - Math.PI / 2; c.fillText(r, 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); }); c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 28); c.moveTo(64, 64); c.lineTo(88, 74); c.stroke(); });
  const clk = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshLambertMaterial({ map: clockTex })); clk.position.set(0, 17, 12.8); ch.add(clk);
  // a rose window and a pointed door on the front of the tower
  const rose = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (c) => { c.fillStyle = '#2a3a6a'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.fillStyle = ['#c83a3a', '#f2c21e', '#3a8ac8', '#6ac85a'][k % 4]; c.beginPath(); c.arc(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38, 13, 0, 7); c.fill(); } c.fillStyle = '#f2c21e'; c.beginPath(); c.arc(64, 64, 16, 0, 7); c.fill(); }), emissive: 0xffc070, emissiveIntensity: 0 }));
  rose.position.set(0, 10.5, 12.8); ch.add(rose); glows.push({ m: rose.material, a: 0, b: .9 });
  // its front wall with the pointed doorway cut through, two leaves and the arch above them
  const archPath = (P) => { P.moveTo(-1.1, 0); P.lineTo(1.1, 0); P.lineTo(1.1, 2.4); P.quadraticCurveTo(1.1, 3.6, 0, 3.9); P.quadraticCurveTo(-1.1, 3.6, -1.1, 2.4); P.closePath(); return P; };
  const tw = new THREE.Shape(); tw.moveTo(-3.25, 0); tw.lineTo(3.25, 0); tw.lineTo(3.25, 5); tw.lineTo(-3.25, 5); tw.closePath(); tw.holes.push(archPath(new THREE.Path()));
  for (const [dep, z, m] of [[.04, 12.71, cStone], [.46, 12.25, inStone]]) { const eg = new THREE.ExtrudeGeometry(tw, { depth: dep, bevelEnabled: false, curveSegments: 6 }); eg.translate(0, 0, z); ch.add(new THREE.Mesh(I.refUV(eg, TOWER), m)); }
  I.solid(ch, -3.25, 0, 12.25, -1.1, 5, 12.75); I.solid(ch, 1.1, 0, 12.25, 3.25, 5, 12.75); I.solid(ch, -1.1, 3.9, 12.25, 1.1, 5, 12.75);
  const tymp = new THREE.Shape(); tymp.moveTo(-1.1, 2.4); tymp.lineTo(1.1, 2.4); tymp.quadraticCurveTo(1.1, 3.6, 0, 3.9); tymp.quadraticCurveTo(-1.1, 3.6, -1.1, 2.4);
  const ty = new THREE.Mesh(new THREE.ShapeGeometry(tymp, 6), new THREE.MeshLambertMaterial({ color: 0x4a2e22, side: THREE.DoubleSide })); ty.position.z = 12.5; ch.add(ty);
  I.door(ch, { x: -1.1, z: 12.5, w: 1.1, h: 2.4, dir: 1, color: 0x4a2e22 }); I.door(ch, { x: 1.1, z: 12.5, w: 1.1, h: 2.4, dir: -1, color: 0x4a2e22 });
  // stained glass down both sides and over the altar: lit from inside by day, glowing out at night
  const stainedTex = canvasTex(64, 192, (c) => {
    c.fillStyle = '#1e2430'; c.fillRect(0, 0, 64, 192);
    const cols = ['#c83a3a', '#2a5ac8', '#f2c21e', '#3aa85a', '#8a3ac8', '#e87a2a', '#5ab8e8'];
    for (let y = 0; y < 192; y += 16) for (let x = 0; x < 64; x += 16) { c.fillStyle = cols[Math.floor(Math.random() * cols.length)]; c.fillRect(x + 2, y + 2, 12, 12); }
    c.fillStyle = '#f2e8c0'; c.beginPath(); c.arc(32, 40, 14, 0, 7); c.fill(); c.fillStyle = '#c83a3a'; c.beginPath(); c.arc(32, 40, 7, 0, 7); c.fill();
  });
  const lancet = (w, hh) => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, hh - w * .7); sh.quadraticCurveTo(w / 2, hh - w * .15, 0, hh); sh.quadraticCurveTo(-w / 2, hh - w * .15, -w / 2, hh - w * .7); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh, 4), P = geo.attributes.position, U = geo.attributes.uv;
    for (let k = 0; k < P.count; k++) U.setXY(k, P.getX(k) / w + .5, P.getY(k) / hh);
    return geo;
  };
  const stainOut = new THREE.MeshLambertMaterial({ map: stainedTex, emissive: 0xffffff, emissiveMap: stainedTex, emissiveIntensity: .1 }), stainIn = new THREE.MeshBasicMaterial({ map: stainedTex });
  glows.push({ m: stainOut, a: .1, b: .9 });
  const sideWin = lancet(1.3, 4.2), backWin = lancet(2, 5);
  const pane = (geo, m, x, y, z, ry) => { const w = new THREE.Mesh(geo, m); w.position.set(x, y, z); w.rotation.y = ry; (m === stainIn ? I.inner(ch) : ch).add(w); };
  for (const z of [-11, -5, 1]) for (const sx of [-1, 1]) { pane(sideWin, stainOut, sx * 5.51, 3.5, z, sx * Math.PI / 2); pane(sideWin, stainIn, sx * 4.99, 3.5, z, -sx * Math.PI / 2); }
  pane(backWin, stainOut, 0, 4.4, -14.01, Math.PI); pane(backWin, stainIn, 0, 4.4, -13.49, 0);
  I.span(ch, flagstones, -1.1, 0, 7.5, 1.1, .005, 8);          // the floor through the arch into the nave
  I.church(ch, naveR, porch, inStone);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) box(.5, 1.8, .6, cStone, sx * 5.8, 3 + k * 3, -8 + k * 6, ch);
  ch.updateMatrix();
  roofColliders(addBox, { x0: -6, x1: 6, z0: -14.2, z1: 8.2, y: 10, h: 5, kind: 'z', matrix: ch.matrix });
  contact.rect(FX, 28, 11, 22); contact.rect(FX, 15.5, 6.5, 6.5, 0, .12);
  // parked cars along the square's east side
  const CARC = [0xc8282e, 0xf4f4f2, 0x2a4a78, 0x9ec4a0, 0xd8d0b8, 0x3a3e46, 0xe8b830];
  for (const z of [7, 9.6]) cars(69.5, z, Math.PI, pick(CARC), 'hatch');
  cars(66, -7.8, Math.PI / 2, 0xc8282e, 'hatch');

  // ---------- the town hall: stone, three floors, flags over the door ----------
  const MX = -60;
  const mh = new THREE.Group(); mh.position.set(MX, 0, SOUTH_FRONT); mh.rotation.y = Math.PI; g.add(mh); mh.updateMatrix();
  const ms = stone(0xe0d6c2, 6, 3);
  // the floors upstairs are solid; the ground floor is the hall, up four steps
  const MREF = { x0: -10, x1: 10, y0: 0, y1: 10.5, z0: -11, z1: 0 };
  I.skin(mh, ms, -10, 3.6, -11, 10, 10.5, 0, MREF); I.solid(mh, -10, 3.6, -11, 10, 10.5, 0);
  const hallR = I.shell(mh, { x0: -10, x1: 10, z0: -11, z1: 0, y0: .6, y1: 3.6, t: .3, ext: ms, ref: MREF, int: I.lit(0xf2e8d4, .42), floor: I.lit(0xffffff, .32, I.checkTex), door: [-1, 1, 3, .6] });
  const hallWins = [];
  const mr = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), tiles(0x4d5563)); mr.rotation.y = Math.PI / 4; mr.scale.set(15.5, 4, 8.6); mr.position.set(0, 12.5, -5.5); mh.add(mr);
  box(20.4, .4, 11.4, white, 0, 10.5, -5.5, mh);
  for (const f of [0, 1, 2]) for (let k = 0; k < 7; k++) {
    const wx = -8.6 + k * 2.87, wy = 1.8 + f * 3.3;
    if (f === 0 && k === 3) continue;
    if (f === 0) hallWins.push(wx);
    box(1.2, 1.9, .06, white, wx, wy, .03, mh); box(1, 1.7, .05, rnd() < .5 ? glassLit : glassDark, wx, wy, .05, mh);
    box(1.4, .12, .2, white, wx, wy + 1.05, .1, mh);
  }
  box(3.2, .12, 1.2, white, 0, 4.2, .6, mh);
  for (let q = 0; q < 12; q++) box(.03, .8, .03, iron, -1.5 + q * .27, 4.6, 1.15, mh);
  // the double door, a stone frame round it, steps you can climb
  for (const x of [-1.05, 1.05]) box(.1, 3.1, .1, white, x, 1.55, .04, mh);
  box(2.2, .12, .1, white, 0, 3.06, .04, mh);
  I.door(mh, { x: -1, y: .6, z: -.075, w: 1, h: 2.4, dir: 1, color: 0x3a2a20 }); I.door(mh, { x: 1, y: .6, z: -.075, w: 1, h: 2.4, dir: -1, color: 0x3a2a20 });
  for (let k = 0; k < 4; k++) { box(4 - k * .4, .15, .5, ms, 0, .08 + k * .15, .3 + (3 - k) * .3, mh); const hw = 2 - k * .2, sz = .3 + (3 - k) * .3; I.solid(mh, -hw, 0, sz - .25, hw, .155 + k * .15, sz + .25); }
  I.hall(mh, hallR, hallWins);
  const mairie = new THREE.Mesh(new THREE.PlaneGeometry(6, .7), new THREE.MeshLambertMaterial({ map: lettering('MAIRIE', { color: '#2a2a2a', size: 88, spacing: 24 }), transparent: true })); mairie.position.set(0, 8.1, .04); mh.add(mairie);
  const motto = new THREE.Mesh(new THREE.PlaneGeometry(9, .5), new THREE.MeshLambertMaterial({ map: lettering('LIBERTÉ · ÉGALITÉ · FRATERNITÉ', { color: '#2a2a2a', size: 60, spacing: 6 }), transparent: true })); motto.position.set(0, 9.4, .04); mh.add(motto);
  const flags = [];
  const flagTex = [canvasTex(96, 64, (c) => { c.fillStyle = '#1d3a8a'; c.fillRect(0, 0, 32, 64); c.fillStyle = '#f4f4f2'; c.fillRect(32, 0, 32, 64); c.fillStyle = '#d8262e'; c.fillRect(64, 0, 32, 64); }),
    canvasTex(96, 64, (c) => { c.fillStyle = '#1d3a8a'; c.fillRect(0, 0, 96, 64); c.fillStyle = '#f2c21e'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.arc(48 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 3, 0, 7); c.fill(); } })];
  for (const [k, sx] of [[0, -.9], [1, .9]]) {
    const pole = box(.06, 2.2, .06, iron, sx, 5.6, .9, mh); pole.rotation.x = .6;
    const fg = new THREE.PlaneGeometry(1.2, .8, 8, 1);
    const fl = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: flagTex[k], side: THREE.DoubleSide }));
    fl.position.set(sx + .6, 6.2, 1.5); fl.userData.keep = true; mh.add(fl); flags.push({ fl, base: fg.attributes.position.array.slice(), ph: k * 1.3 });
  }
  mh.updateMatrix();
  roofColliders(addBox, { x0: -10, x1: 10, z0: -11, z1: 0, y: 10.5, h: 4, kind: 'hip', matrix: mh.matrix });
  contact.rect(MX, SOUTH_FRONT + 5.5, 20, 11, 0, .125);
  // its little park: a lawn, flower beds, cherry trees, benches
  for (const [x, z] of [[MX - 6, 7], [MX + 6, 7]]) { const bed = box(4, .35, 2, stone(0xc8bca8, 1, .2), x, .17, z); void bed; for (let k = 0; k < 14; k++) { const fl = new THREE.Mesh(hedgeGeo, mat(pick(FLOWERS))); fl.scale.setScalar(.14); fl.position.set(x - 1.6 + (k % 7) * .53, .45, z - .5 + Math.floor(k / 7) * 1); g.add(fl); } addBox(x - 2, 0, z - 1, x + 2, .35, z + 1); }
  bench(MX, 9.5, Math.PI);

  // ---------- cherry trees on the square, in the park, along the street ----------
  const blossoms = createBlossoms({ parent: g, addBox, seed: 77 });
  for (const [x, z, s] of [[48.5, 11, 1.05], [73, 11.5, 1.1], [56, 8, .85], [MX - 9, 4, 1], [MX + 9, 3.5, .95], [MX, 14, 1.1], [85, 3, .9], [-80, 3, .95], [-44.5, -6, .85], [40, 3, .9]]) blossoms.tree(x, z, s);
  blossoms.finish({ scatter: [[FX, FZ + 6, 2], [FX - 6, -4, 1.5], [MX, 11, 2]] });
  for (const t of blossoms.trees) contact.blob(t.x, t.z, t.r * .8, .125);

  // ---------- the stone viaduct on the horizon, and the regional train that crosses it ----------
  const VZ = 112, VH = 16, SPAN = 14;
  const vStone = stone(0xcdbfa6, 2, 3);
  const arches = [];
  for (let x = -210; x <= 210; x += SPAN) {
    const sh = new THREE.Shape();
    sh.moveTo(-SPAN / 2, 0); sh.lineTo(SPAN / 2, 0); sh.lineTo(SPAN / 2, VH); sh.lineTo(-SPAN / 2, VH); sh.closePath();
    const hole = new THREE.Path(); const r = SPAN * .33, hw = r, top = VH - 3.2;
    hole.moveTo(-hw, 0); hole.lineTo(hw, 0); hole.lineTo(hw, top - r); hole.absarc(0, top - r, r, 0, Math.PI, false); hole.lineTo(-hw, 0);
    sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false, curveSegments: 10 });
    geo.translate(x, 0, VZ - 3);
    arches.push(new THREE.Mesh(geo, vStone));
  }
  arches.forEach(a => g.add(a));
  box(430, .5, 7, stone(0xbfb098, 60, .2), 0, VH + .25, VZ);
  box(430, .8, .3, vStone, 0, VH + .9, VZ - 3.35); box(430, .8, .3, vStone, 0, VH + .9, VZ + 3.35);
  // the train: white, a blue band, a red nose; two cars
  const train = new THREE.Group(); train.userData.keep = true; g.add(train);
  const terTex = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d4a8a'; c.fillRect(0, 84, w, 22); c.fillStyle = '#6ab0e0'; c.fillRect(0, 78, w, 6);
    for (let k = 0; k < 7; k++) { c.fillStyle = '#2a3a4a'; c.fillRect(20 + k * 70, 30, 52, 34); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(22 + k * 70, 32, 18, 4); }
    c.fillStyle = '#c8282e'; c.fillRect(0, 106, w, 6);
  });
  const terMat = new THREE.MeshLambertMaterial({ map: terTex, emissive: 0xffe0a0, emissiveMap: terTex, emissiveIntensity: 0 });
  const TC = 22;
  for (let k = 0; k < 2; k++) {
    const body = new THREE.Mesh(V.roundBox(TC, 3.4, 3, .35, 2), [mat(0xf4f4f2), mat(0xf4f4f2), mat(0xc8ccd2), mat(0x3a3e46), terMat, terMat]);
    body.position.set(k * (TC + .5), VH + 2.6, VZ); train.add(body);
    box(TC - 3, .6, 2.6, mat(0x3a3e46), k * (TC + .5), VH + .75, VZ, train);
  }
  for (const [xo, s] of [[-TC / 2, -1], [TC + .5 + TC / 2, 1]]) {
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 12, 1, false, 0, Math.PI), mat(0xc8282e)); nose.rotation.z = Math.PI / 2; nose.rotation.y = s > 0 ? 0 : Math.PI; nose.scale.set(1, 1, .9);
    nose.position.set(xo, VH + 2.3, VZ); train.add(nose);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1), mat(0x2a3a4a)); ws.position.set(xo + s * 1.36, VH + 3.1, VZ); ws.rotation.y = s * Math.PI / 2; ws.rotation.x = 0; train.add(ws);
  }
  let tX = -400, tWait = 6;

  // ---------- street lamps on the square and in front of the town hall ----------
  const lamps = createLamps({ parent: g, addBox, points: [[SQ.x0 + 2, 12.5], [SQ.x1 - 2, 12.5], [53, -10.3], [72.5, -10.3], [FX - 4, FZ - 3.5], [FX + 4, FZ - 3.5], [MX - 11, -9.8], [MX + 11, -9.8], [-100, -11.4], [-84, -11.4], [96, -11.4], [110, -11.4]] });

  // ---------- a blue street sign at the corner, as every French street has ----------
  const plaque = new THREE.MeshLambertMaterial({ map: canvasTex(256, 96, (c) => { c.fillStyle = '#1d3a78'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#f4f4f2'; c.lineWidth = 5; c.strokeRect(8, 8, 240, 80); c.fillStyle = '#f4f4f2'; c.textAlign = 'center'; c.font = `700 22px ${SANS}`; c.fillText('RUE DES', 128, 38); c.font = `700 28px ${SANS}`; c.fillText('CERISIERS', 128, 70); }) });
  for (const [x, z, r] of [[9.2, NORTH_FRONT + .06, 0], [-9.2, NORTH_FRONT + .06, 0], [43.9, SOUTH_FRONT - .06, Math.PI], [-49.9, SOUTH_FRONT - .06, Math.PI]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.8, .3), plaque); p.position.set(x, 3.2, z); p.rotation.y = r; g.add(p); }

  // ---------- the countryside towards the viaduct: a lane lined with cypresses, lavender,
  // a vineyard, ripe wheat and its bales ----------
  const LZ = 84;
  flat(420, 4.2, mat(0x8a8478, { map: canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let n = 0; n < 1600; n++) { const v = 160 + Math.random() * 90; c.fillStyle = `rgba(${v},${v - 6},${v - 18},.4)`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } }, [100, 1]) }), 0, .02, LZ);
  // a cypress: a slim spindle, bushy, darker at the foot than at the tip
  const cypress = (() => {
    const prof = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; prof.push(new THREE.Vector2(Math.max(.001, Math.pow(Math.sin(Math.PI * Math.pow(t, .75)), .9) * (1 - t * .35)), t)); }
    const geo = new THREE.LatheGeometry(prof, 12);
    const p = geo.attributes.position, col = [], c = new THREE.Color();
    for (let n = 0; n < p.count; n++) {
      const x = p.getX(n), y = p.getY(n), z = p.getZ(n);
      const k = 1 + (Math.sin(y * 31 + Math.atan2(z, x) * 3) * .5 + Math.sin(y * 57 + x * 9) * .5) * .13;
      p.setXYZ(n, x * k, y, z * k);
      c.setHex(0x2f5a34).lerp(new THREE.Color(0x7aa860), Math.pow(y, 1.2) * .75 + (k - 1) * 1.5);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  const cyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x0a1608 });
  for (let x = -200; x <= 200; x += 9 + rnd() * 3) for (const side of [-1, 1]) {
    if (rnd() < .25) continue;
    const hgt = 7 + rnd() * 4, r = .9 + rnd() * .3;
    const cy = new THREE.Mesh(cypress, cyMat); cy.scale.set(r, hgt, r); cy.position.set(x + (rnd() - .5) * 2, .3, LZ + side * 3.6); cy.rotation.y = rnd() * 6; g.add(cy);
    box(.25, .8, .25, timber, cy.position.x, .4, cy.position.z);
    contact.blob(cy.position.x, cy.position.z, 1.4);
  }
  const rowGeo = new THREE.CylinderGeometry(.5, .5, 1, 10, 1); rowGeo.rotateZ(Math.PI / 2);
  const speckle = (base, dots) => canvasTex(128, 64, (c) => { c.fillStyle = base; c.fillRect(0, 0, 128, 64); for (let n = 0; n < 900; n++) { c.fillStyle = dots[Math.floor(Math.random() * dots.length)]; c.fillRect(Math.random() * 128, Math.random() * 64, 2, 2); } }, [20, 1]);
  const lavender = new THREE.MeshLambertMaterial({ color: 0xffffff, map: speckle('#8a6ac8', ['#b48ae8', '#6a4aa8', '#caa8f0', '#5a8a4a']), emissive: 0x2a1a48, emissiveIntensity: .4 });
  const vines = new THREE.MeshLambertMaterial({ color: 0xffffff, map: speckle('#4f8a3a', ['#6aa84a', '#3a6a2a', '#8ac060']) });
  const field = (x0, x1, z0, z1, m, gap, hgt, posts) => {
    const len = x1 - x0;
    for (let z = z0; z <= z1; z += gap) {
      const r = new THREE.Mesh(rowGeo, m); r.scale.set(len, hgt, .9); r.position.set((x0 + x1) / 2, hgt * .35, z); g.add(r);
      if (posts) for (let x = x0; x <= x1; x += 6) box(.08, 1.4, .08, timber, x, .7, z);
    }
    flat(len + 2, z1 - z0 + 2, mat(m === lavender ? 0x9a8a6a : 0x8a7a58), (x0 + x1) / 2, .015, (z0 + z1) / 2);
  };
  field(-150, -40, LZ + 7, LZ + 22, lavender, 1.7, .9, false);
  field(40, 150, LZ + 7, LZ + 22, lavender, 1.7, .9, false);
  field(-36, 36, LZ + 7, LZ + 22, vines, 2.2, 1.3, true);
  // wheat, gold and rippled, with round bales
  const wheat = new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (c) => { c.fillStyle = '#e0b85a'; c.fillRect(0, 0, 128, 128); for (let n = 0; n < 2500; n++) { c.fillStyle = ['#f0cc70', '#c89a40', '#e8c060', '#b88a38'][n % 4]; c.fillRect(Math.random() * 128, Math.random() * 128, 1, 4); } }, [30, 10]) });
  for (const [x, z, w, d] of [[-120, 58, 70, 34], [120, 58, 70, 34], [-150, 20, 40, 60], [150, 20, 40, 60]]) {
    flat(w, d, wheat, x, .02, z);
    for (let k = 0; k < 5; k++) { const bx = x + (rnd() - .5) * w * .8, bz = z + (rnd() - .5) * d * .8; const bale = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 1.2, 16), mat(0xd8b060)); bale.rotation.z = Math.PI / 2; bale.rotation.y = rnd() * 3; bale.position.set(bx, .8, bz); g.add(bale); contact.blob(bx, bz, 1.4); addBox(bx - .9, 0, bz - .9, bx + .9, 1.6, bz + .9); }
  }
  // hedgerows between the fields
  for (const [x0, x1, z] of [[-200, -40, LZ - 6], [40, 200, LZ - 6], [-200, 200, LZ + 25]]) for (let x = x0; x < x1; x += 1.1) { const hg = new THREE.Mesh(hedgeGeo, leafMat); hg.scale.set(.8, .9, .7); hg.position.set(x, .7, z + (rnd() - .5) * .3); g.add(hg); }

  // ---------- our garden, fenced in: a dry-stone wall and a hedge, a vegetable patch,
  // a greenhouse, a shed, a pond, a washing line; a gravel lane behind for the back houses ----------
  const GW = 41, GZ = 46;
  const dry = stone(0xbfb4a0, 6, .3);
  for (const [x0, z0, x1, z1] of [[-GW, GZ, GW, GZ], [-GW, -9.9, -GW, GZ], [GW, -9.9, GW, GZ]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), along = z0 === z1;
    box(along ? len : .6, .9, along ? .6 : len, dry, (x0 + x1) / 2, .45, (z0 + z1) / 2);
    box(along ? len + .2 : .75, .1, along ? .75 : len + .2, stone(0xa89c88, 6, .2), (x0 + x1) / 2, .95, (z0 + z1) / 2);
    for (let t = 0; t < len; t += 1.2) { const hg = new THREE.Mesh(hedgeGeo, leafMat); hg.scale.set(.75, .8, .7); hg.position.set(along ? x0 + t : x0 + (x0 < 0 ? -.9 : .9), 1.3, along ? z0 + .9 : z0 + t); g.add(hg); }
    addBox(Math.min(x0, x1) - .3, 0, Math.min(z0, z1) - .3, Math.max(x0, x1) + .3, 1, Math.max(z0, z1) + .3);
  }
  // a wooden gate in the back wall
  box(2.4, 1.1, .08, mat(0x8a6a48), 0, .7, GZ - .05);
  // the vegetable patch: dark earth, rows of cabbages and lettuces, a scarecrow
  const PX0 = -27, PZ0 = 30;
  flat(10, 7, mat(0x5a3a26, { map: canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); for (let n = 0; n < 500; n++) { const v = 150 + Math.random() * 100; c.fillStyle = `rgba(${v},${v * .8},${v * .6},.4)`; c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } }, [4, 3]) }), PX0, .03, PZ0);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 11; k++) { const veg = new THREE.Mesh(hedgeGeo, mat([0x6aa84a, 0x8ac060, 0x4a8a3a, 0x9a4a8a, 0x6aa84a][r])); veg.scale.set(.32, .24, .32); veg.position.set(PX0 - 4.5 + k * .9, .2, PZ0 - 2.6 + r * 1.3); g.add(veg); }
  box(10.4, .18, .12, mat(0x8a6a48), PX0, .09, PZ0 - 3.55); box(10.4, .18, .12, mat(0x8a6a48), PX0, .09, PZ0 + 3.55);
  const scare = new THREE.Group(); scare.position.set(PX0 + 5.8, 0, PZ0 + 1); g.add(scare);
  box(.08, 2, .08, timber, 0, 1, 0, scare); box(1.4, .08, .08, timber, 0, 1.5, 0, scare);
  box(.5, .7, .3, mat(0x3a5a8a), 0, 1.4, 0, scare); const sh = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), mat(0xe8d8b0)); sh.position.y = 2; scare.add(sh);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(.36, .3, 12), mat(0xd8b860)); hat.position.y = 2.25; scare.add(hat);
  // the greenhouse: a glass box on a brick base, tomatoes inside
  const gh = new THREE.Group(); gh.position.set(-31, 0, 40); g.add(gh);
  box(5, .5, 3, stone(0xa8583a, 2, .2), 0, .25, 0, gh);
  const glassM = new THREE.MeshLambertMaterial({ color: 0xd8ecf4, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide });
  box(5, 1.8, 3, glassM, 0, 1.4, 0, gh);
  const ghr = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 3, 1, false), glassM); ghr.rotation.z = Math.PI / 2; ghr.rotation.x = Math.PI / 6; ghr.scale.set(1, 1, .9); ghr.position.y = 2.7; gh.add(ghr);
  for (const x of [-2.5, -1.25, 0, 1.25, 2.5]) box(.05, 1.8, 3, mat(0xeeeeee), x, 1.4, 0, gh);
  for (let k = 0; k < 6; k++) { const tp = new THREE.Mesh(hedgeGeo, mat(0x4a8a3a)); tp.scale.set(.3, .6, .3); tp.position.set(-2 + k * .8, 1.1, .6); gh.add(tp); const to = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 5), mat(0xd8282e)); to.position.set(-2 + k * .8, 1.2, .9); gh.add(to); }
  addBox(-33.5, 0, 38.5, -28.5, 3, 41.5); contact.rect(-31, 40, 5, 3);
  // the shed: planks, a tin roof, a wheelbarrow and a wood pile beside it
  const sd = new THREE.Group(); sd.position.set(30, 0, 39); sd.rotation.y = -.2; g.add(sd);
  const planks = new THREE.MeshLambertMaterial({ color: 0x8a6a48, map: canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); for (let x = 0; x < 64; x += 8) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x, 0, 1.5, 64); } }, [3, 1]) });
  box(4, 2.4, 3, planks, 0, 1.2, 0, sd);
  const sr = box(4.6, .1, 3.6, mat(0x7a8088), 0, 2.6, 0, sd); sr.rotation.x = .12;
  box(1, 1.9, .06, mat(0x5a7a5a), .8, .95, 1.53, sd);
  for (let k = 0; k < 12; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.2, 8), mat(0x9a7048)); lg.rotation.x = Math.PI / 2; lg.position.set(-2.5 - (k % 4) * .3, .15 + Math.floor(k / 4) * .27, (k % 2) * .1); sd.add(lg); }
  const wb = new THREE.Group(); wb.position.set(1.8, 0, 2.6); wb.rotation.y = .5; sd.add(wb);
  box(.8, .35, 1.1, mat(0x3a6a4a), 0, .55, 0, wb); const wh = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .08, 12), iron); wh.rotation.z = Math.PI / 2; wh.position.set(0, .2, .6); wb.add(wh);
  for (const sx of [-.3, .3]) box(.05, .05, 1, timber, sx, .45, -.8, wb);
  sd.updateMatrix(); addBox(27.5, 0, 37, 32.5, 2.6, 41); contact.rect(30, 39, 4.5, 3.5);
  // the pond: stones round still water, lily pads
  const PX = -4, PZ = 34;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshStandardMaterial({ color: 0x5a8aa0, roughness: .05, metalness: .3, emissive: 0x1a3a4a, emissiveIntensity: .4 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(PX, .04, PZ); pond.scale.set(1.3, 1, 1); g.add(pond);
  for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(.35 + rnd() * .2, 0), mat(0x9a948a)); st.position.set(PX + Math.cos(a) * 4.2, .1, PZ + Math.sin(a) * 3.3); st.scale.y = .5; st.rotation.y = rnd() * 3; g.add(st); }
  for (let k = 0; k < 7; k++) { const lp = new THREE.Mesh(new THREE.CircleGeometry(.3, 10, .3, 5.8), mat(0x4a8a3a)); lp.rotation.x = -Math.PI / 2; lp.position.set(PX + (rnd() - .5) * 5, .06, PZ + (rnd() - .5) * 3.5); g.add(lp); if (k % 3 === 0) { const fl = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), mat(0xf6c8d8)); fl.position.set(lp.position.x, .12, lp.position.z); g.add(fl); } }
  addBox(PX - 4, 0, PZ - 3, PX + 4, .3, PZ + 3);
  // a washing line between two posts, sheets and shirts on it
  const WX = 16, WZ = 30;
  for (const x of [WX - 3.5, WX + 3.5]) { box(.1, 2.2, .1, timber, x, 1.1, WZ); addBox(x - .1, 0, WZ - .1, x + .1, 2.2, WZ + .1); }
  const clothesM = [0xf4f4f2, 0x8ac0e0, 0xf2c8d4, 0xe8e0a0, 0xf4f4f2];
  for (let k = 0; k < 5; k++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(.8 + rnd() * .5, .7 + rnd() * .5), new THREE.MeshLambertMaterial({ color: clothesM[k], side: THREE.DoubleSide })); cl.position.set(WX - 2.6 + k * 1.3, 1.75, WZ); cl.rotation.y = (rnd() - .5) * .3; g.add(cl); }
  const lineG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(WX - 3.5, 2.15, WZ), new THREE.Vector3(WX, 2.05, WZ), new THREE.Vector3(WX, 2.05, WZ), new THREE.Vector3(WX + 3.5, 2.15, WZ)]);
  g.add(new THREE.LineSegments(lineG, new THREE.LineBasicMaterial({ color: 0xe8e8e8 })));
  // a picnic table under the trees
  const pt = new THREE.Group(); pt.position.set(8, 0, 22); pt.rotation.y = .3; g.add(pt);
  box(2, .08, .9, planks, 0, .75, 0, pt); for (const z of [-.75, .75]) box(2, .06, .3, planks, 0, .45, z, pt);
  for (const x of [-.8, .8]) { const l = box(.08, .8, 1.8, timber, x, .38, 0, pt); void l; }
  addBox(6.9, 0, 21, 9.1, .8, 23); contact.blob(8, 22, 1.8);
  // the back lane: gravel, between our wall and the houses behind
  flat(420, 3.2, mat(0xc8bca4, { map: canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); for (let n = 0; n < 2000; n++) { const v = 140 + Math.random() * 110; c.fillStyle = `rgba(${v},${v - 6},${v - 14},.5)`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } }, [100, 1]) }), 0, .025, GZ + 3.4);

  // ---------- people: on the pavements, round the square, and sat at the café ----------
  const walkers = createWalkers({ parent: g, clothes: [0x2a4a78, 0xc8282e, 0xf4f0e6, 0x3a6a4a, 0xe8b830, 0x8a4a8a, 0x5a6a7a, 0xd88aa0], seed: 41, paths: [
    [[-110, -14.95], [-6, -14.95]], [[6, -14.95], [110, -14.95]],
    [[-110, -11.1], [-42, -11.1]], [[80, -11.1], [110, -11.1]],
    [[53, -10.3], [58, 8], [70, 10], [72.5, -9.5]], [[FX - 5, FZ + 6.4], [FX + 5, FZ + 6.4]],
    [[MX - 12, -12.4], [MX + 12, -12.4]], [[-100, LZ - 1.4], [100, LZ - 1.4]], [[-120, GZ + 3.4], [120, GZ + 3.4]],
  ] });
  for (const [x, z, rot] of [[53.3, -8.4, Math.PI / 2], [54.7, -5.2, -Math.PI / 2], [57.4 - .7, -3.6, Math.PI / 2], [58.1, -6.8, -Math.PI / 2]]) walkers.sit(x, .45, z, rot);
  contact.finish();

  g.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  I.finish(g);

  let t = 0;
  return {
    group: g,
    // for the maps and the animals: what's built where
    SQ, MX,
    // the front doors, opened and shut with e
    doors: I.doors,
    walkers,
    // the fountain's basin, for the mini jet-skis: its centre, the water's radius and height
    fountain: { x: FX, z: FZ, r: FW, y: FY, pool, island: .8 },
    // the church, for what goes inside it: the altar (its front at z 36), the organ's corner, the tower
    church: { flagstones, altar: new THREE.Vector3(61, 0, 36.5), organ: new THREE.Vector3(65.3, 0, 33), tower: new THREE.Vector3(FX, 0, 25 - 9.5) },
    setNight(n) {
      glassLit.emissiveIntensity = n * 1.3;
      glassDark.emissiveIntensity = n * .08;
      shopGlass.emissiveIntensity = .12 + n * .4;
      bulbs.emissiveIntensity = .2 + n * 2.6;
      terMat.emissiveIntensity = n * .6;
      for (const gl of glows) gl.m.emissiveIntensity = gl.a + n * gl.b;
      lamps.setNight(n);
      blossoms.setNight(n);
    },
    setSeason(n) { blossoms.setSeason(n); },
    update(dt) {
      t += dt;
      curtainTex.offset.y -= dt * 1.6;
      waterMat.emissiveIntensity = .45 + Math.sin(t * 2) * .05;
      for (const f of flags) {
        const p = f.fl.geometry.attributes.position;
        for (let k = 0; k < p.count; k++) { const x0 = f.base[k * 3]; p.setZ(k, Math.sin(t * 5 + x0 * 5 + f.ph) * .08 * (x0 + .6)); }
        p.needsUpdate = true;
      }
      // the train: rolls across the viaduct, waits off-stage, comes back
      if (tWait > 0) { tWait -= dt; train.visible = false; }
      else { train.visible = true; tX += 24 * dt; if (tX > 320) { tX = -400; tWait = 20 + Math.random() * 25; } }
      train.position.x = tX;
      walkers.update(dt);
      if (camera) I.update(dt, camera.position);
    },
  };
}
