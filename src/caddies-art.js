// caddies-art.js, the shopping trolley and the course's kit, all at real scale and procedural:
// the wire basket (a painted grid on a see-through surface), the chrome frame, the swivelling
// casters, the plastic handle in the rider's colour; what rides in the basket (a baguette, a
// watermelon, a bag of flour); crowd barriers, cones, crates, the checkered banner, the promo tags.
// Shared by the race (caddies.js) and the stack of trolleys in front of the church (caddies-stand.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';
import { canvasTex } from './lib/tex.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// the wire: a grid of bright bars on nothing (alpha-tested, so it casts a lattice shadow)
const wireTex = () => once('wire', () => {
  const t = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, 7); g.fillRect(0, 0, 7, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
});
export const wireMat = () => once('wireM', () => new THREE.MeshStandardMaterial({ color: 0xd4dae2, map: wireTex(), alphaTest: .5, side: THREE.DoubleSide, metalness: .65, roughness: .35 }));
const chrome = () => once('chrome', () => new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: .75, roughness: .3 }));
const rubber = () => V.RUBBER();
const plastic = (color) => once('pl' + color, () => new THREE.MeshStandardMaterial({ color, roughness: .45 }));

// a flat quad from four corners, its uv in metres / cell (the wire keeps its mesh size)
function quad(a, b, c, d, cell = .065) {
  const g = new THREE.BufferGeometry();
  const P = [a, b, c, a, c, d].flat();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const w = len(a, b) / cell, h = len(a, d) / cell;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, 0, w, h, 0, h], 2));
  g.computeVertexNormals();
  return g;
}
// a tube from p to q (radius r)
function tube(p, q, r = .012) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), l = d.length();
  const g = new THREE.CylinderGeometry(r, r, l, 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
const flat = (gs) => mergeGeometries(gs.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; }));

// the trolley's shape (metres, nose to +z, the handle at the back): basket, frame, wheels
export const CART = { rearZ: -.4, frontZ: .5, botY: .44, topY: .93, handleZ: -.56, handleY: 1.02, railZ: -.78, railY: .16 };
const cartGeos = () => once('cartGeo', () => {
  const C = CART, rw = .27, fw = .22, fb = .2;   // half widths: rear, front top, front bottom
  const zb = C.frontZ - .1;                       // the front face slants back towards the bottom
  const basket = flat([
    quad([-rw, C.botY, C.rearZ], [rw, C.botY, C.rearZ], [rw, C.topY, C.rearZ], [-rw, C.topY, C.rearZ]),     // back (it swings in when nested)
    quad([-fb, C.botY, zb], [fb, C.botY, zb], [fw, C.topY, C.frontZ], [-fw, C.topY, C.frontZ]),              // front
    quad([-rw, C.botY, C.rearZ], [-fb, C.botY, zb], [-fw, C.topY, C.frontZ], [-rw, C.topY, C.rearZ]),        // sides
    quad([rw, C.botY, C.rearZ], [fb, C.botY, zb], [fw, C.topY, C.frontZ], [rw, C.topY, C.rearZ]),
    quad([-rw, C.botY, C.rearZ], [rw, C.botY, C.rearZ], [fb, C.botY, zb], [-fb, C.botY, zb]),                 // floor
    quad([-.2, .2, -.3], [.2, .2, -.3], [.18, .2, .32], [-.18, .2, .32]),                                     // the lower tray
  ]);
  const T = C.topY, rails = [
    // the top rim
    [[-rw, T, C.rearZ], [rw, T, C.rearZ]], [[-fw, T, C.frontZ], [fw, T, C.frontZ]], [[-rw, T, C.rearZ], [-fw, T, C.frontZ]], [[rw, T, C.rearZ], [fw, T, C.frontZ]],
    [[-rw, C.botY, C.rearZ], [-fb, C.botY, zb]], [[rw, C.botY, C.rearZ], [fb, C.botY, zb]],
    // the chassis: a low U, the rear rail the rider stands on
    [[-.24, .14, C.railZ], [-.2, .14, .42]], [[.24, .14, C.railZ], [.2, .14, .42]], [[-.24, .14, C.railZ], [.24, .14, C.railZ]], [[-.2, .14, .42], [.2, .14, .42]],
    // the uprights from the chassis to the handle, the struts under the basket
    [[-.25, .14, -.42], [-.28, C.handleY, C.handleZ + .02]], [[.25, .14, -.42], [.28, C.handleY, C.handleZ + .02]],
    [[-.22, .14, .3], [-.19, C.botY, zb - .05]], [[.22, .14, .3], [.19, C.botY, zb - .05]],
    [[-.28, C.handleY, C.handleZ + .02], [-rw, T, C.rearZ]], [[.28, C.handleY, C.handleZ + .02], [rw, T, C.rearZ]],
  ].map(([p, q]) => tube(p, q, p[1] === .14 && q[1] === .14 ? .016 : .011));
  // the rear casters are fixed; their forks go with the frame
  for (const s of [-1, 1]) { const f = new THREE.BoxGeometry(.012, .09, .05); f.translate(s * .22, .1, -.36); rails.push(f); }
  const frame = flat(rails);
  const handle = new THREE.CylinderGeometry(.022, .022, .6, 10); handle.rotateZ(Math.PI / 2); handle.translate(0, C.handleY, C.handleZ);
  const flap = new THREE.BoxGeometry(.46, .012, .2); flap.rotateX(-.35); flap.translate(0, C.topY + .02, C.rearZ + .1);
  const caps = [handle, flap];
  for (const s of [-1, 1]) { const c = new THREE.BoxGeometry(.05, .035, .05); c.translate(s * rw, T, C.rearZ); caps.push(c); }
  const plasticG = flat(caps);
  const wheelG = new THREE.CylinderGeometry(.055, .055, .03, 12); wheelG.rotateZ(Math.PI / 2);
  const rear = flat([-1, 1].map(s => wheelG.clone().translate(s * .22, .055, -.38)));
  // a front caster: its fork and wheel, turning on the swivel above
  const fork = new THREE.BoxGeometry(.01, .08, .04); fork.translate(0, -.04, -.025);
  const casterF = flat([fork, new THREE.BoxGeometry(.03, .012, .03).translate(0, 0, 0)]);
  const casterW = wheelG.clone().translate(0, -.085, -.04);
  return { basket, frame, plasticG, rear, casterF, casterW };
});

// a trolley: { g, body (it tilts), swivels [2], items { baguette, melon, flour } }
export function cartModel(color = 0xe8384f, { items = true, shadow = true } = {}) {
  const G = cartGeos(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const add = (geo, m, p = body) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; p.add(o); return o; };
  add(G.basket, wireMat()); add(G.frame, chrome()); add(G.plasticG, plastic(color)); add(G.rear, rubber());
  const swivels = [];
  for (const s of [-1, 1]) {
    const sw = new THREE.Group(); sw.position.set(s * .2, .14, .4); body.add(sw);
    add(G.casterF, chrome(), sw); add(G.casterW, rubber(), sw);
    swivels.push(sw);
  }
  const it = {};
  if (items) {
    it.baguette = baguette(); it.baguette.position.set(.08, .72, .05); it.baguette.rotation.set(.9, .3, 0); body.add(it.baguette);
    it.melon = melon(); it.melon.position.set(0, .6, .1); body.add(it.melon);
    it.flour = flourBag(); it.flour.position.set(-.05, .58, .05); it.flour.rotation.y = .4; body.add(it.flour);
    for (const k in it) it[k].visible = false;
  }
  return { g, body, swivels, items: it };
}

// ---------- the groceries ----------
export function baguette() {
  const geo = once('bagG', () => { const g = new THREE.CylinderGeometry(.034, .03, .62, 10, 1); g.scale(1, 1, .8); return g; });
  const crust = once('bagM', () => new THREE.MeshStandardMaterial({ roughness: .8, map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#e0ad62'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f6dca0'; c.lineWidth = 5; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(4, k * 13 + 4); c.lineTo(w - 4, k * 13 + 12); c.stroke(); } }) }));
  const m = new THREE.Mesh(geo, crust); m.castShadow = true;
  return m;
}
const melonMat = () => once('melonM', () => new THREE.MeshStandardMaterial({ roughness: .5, map: canvasTex(128, 64, (c, w, h) => {
  c.fillStyle = '#3f8a3a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1f5a24'; for (let k = 0; k < 12; k++) { c.beginPath(); for (let y = 0; y <= h; y += 4) c.lineTo(k * w / 12 + Math.sin(y * .3 + k) * 2.5, y); for (let y = h; y >= 0; y -= 4) c.lineTo(k * w / 12 + 4 + Math.sin(y * .3 + k) * 2.5, y); c.fill(); }
}) }));
export function melon(r = .15) {
  const m = new THREE.Mesh(once('melonG' + r, () => { const g = new THREE.SphereGeometry(r, 16, 12); g.scale(1, .92, 1.12); return g; }), melonMat());
  m.castShadow = true;
  return m;
}
export function flourBag() {
  const m = new THREE.Mesh(once('flourG', () => V.roundBox(.2, .28, .11, .03)), once('flourM', () => new THREE.MeshStandardMaterial({ roughness: .9, map: canvasTex(64, 96, (c, w, h) => {
    c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a4ac0'; c.fillRect(0, 60, w, 16);
    c.fillStyle = '#c8281e'; c.font = '700 15px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('FARINE', w / 2, 40); c.fillStyle = '#fff'; c.font = '600 11px Rubik, sans-serif'; c.fillText('T55 · 1 kg', w / 2, 72);
  }) })));
  m.castShadow = true;
  return m;
}
// the red flesh and pips of a smashed melon (a flat splat on the paving)
export const splatMat = () => once('splat', () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: canvasTex(128, 128, (c, w) => {
  c.clearRect(0, 0, w, w);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = 20 + Math.random() * 38; c.fillStyle = k % 3 ? '#e2383e' : '#3f8a3a'; c.beginPath(); c.arc(64 + Math.cos(a) * r * .6, 64 + Math.sin(a) * r * .6, 6 + Math.random() * 14, 0, 7); c.fill(); }
  c.fillStyle = '#e8484c'; c.beginPath(); c.arc(64, 64, 24, 0, 7); c.fill();
  c.fillStyle = '#1a1210'; for (let k = 0; k < 16; k++) { c.beginPath(); c.ellipse(40 + Math.random() * 48, 40 + Math.random() * 48, 2.5, 1.5, Math.random() * 3, 0, 7); c.fill(); }
}) }));
export const flourMat = () => once('flourSpot', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: canvasTex(128, 128, (c, w) => {
  const r = c.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(.7, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = r; c.fillRect(0, 0, w, w);
  for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(Math.random() * w, Math.random() * w, 2 + Math.random() * 5, 0, 7); c.fill(); }
}) }));

// ---------- the course's kit ----------
// a crowd barrier panel: a galvanised frame, vertical bars (one plane, alpha-tested)
export const barrierMat = () => once('barrier', () => new THREE.MeshStandardMaterial({ color: 0xc4cad2, metalness: .6, roughness: .4, alphaTest: .5, side: THREE.DoubleSide, map: canvasTex(128, 96, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.fillStyle = '#fff';
  c.fillRect(0, 6, w, 7); c.fillRect(0, h - 22, w, 6); c.fillRect(0, 6, 6, h - 6); c.fillRect(w - 6, 6, 6, h - 6);
  for (let x = 14; x < w - 8; x += 10) c.fillRect(x, 10, 3, h - 30);
}) }));
export const coneMat = () => once('cone', () => new THREE.MeshStandardMaterial({ roughness: .5, map: canvasTex(16, 64, (c, w, h) => { c.fillStyle = '#ff6a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f6f2ea'; c.fillRect(0, 20, w, 9); c.fillRect(0, 38, w, 7); }) }));
export const crateMat = () => once('crate', () => new THREE.MeshStandardMaterial({ roughness: .8, map: canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#b5874f'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a6236';
  for (const y of [0, 21, 42]) c.fillRect(0, y + 17, w, 4);
  c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
  c.fillStyle = '#5a3a1e'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('POMMES', w / 2, 34);
}) }));
// the start: a checkered strip across the line, a banner between two poles
export function startGate(width, text = 'COURSE DE CADDIES') {
  const g = new THREE.Group();
  const chk = canvasTex(256, 32, (c, w, h) => { for (let x = 0; x < w / 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f6f2ea'; c.fillRect(x * 16, y * 16, 16, 16); } });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, .5), new THREE.MeshStandardMaterial({ map: chk, roughness: .7, polygonOffset: true, polygonOffsetFactor: -2 }));
  strip.rotation.x = -Math.PI / 2; strip.position.y = .005; strip.receiveShadow = true; g.add(strip);
  const pole = chrome();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 3, 8), pole); p.position.set(s * (width / 2 + .15), 1.5, 0); p.castShadow = true; g.add(p); }
  const tex = canvasTex(1024, 128, (c, w, h) => {
    for (let k = 0; k < 64; k++) { c.fillStyle = (k + Math.floor(k / 64)) % 2 ? '#1a1a1a' : '#f6f2ea'; c.fillRect(k * 16, 0, 16, 16); c.fillStyle = k % 2 ? '#f6f2ea' : '#1a1a1a'; c.fillRect(k * 16, h - 16, 16, 16); }
    c.fillStyle = '#c8281e'; c.fillRect(0, 16, w, h - 32);
    c.fillStyle = '#fff'; c.font = '800 60px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  });
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(width + .3, (width + .3) / 8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .7 }));
  ban.position.y = 2.7; g.add(ban);
  return g;
}
// a promo: a yellow price tag that spins over the course (drive through it for something in the basket)
export function promoMesh() {
  const m = new THREE.Mesh(once('promoG', () => V.roundBox(.55, .34, .04, .05)), once('promoM', () => new THREE.MeshStandardMaterial({ roughness: .4, emissive: 0x3a2a00, map: canvasTex(128, 80, (c, w, h) => {
    c.fillStyle = '#ffd21f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8281e'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#c8281e'; c.font = '800 30px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PROMO', w / 2, 30); c.font = '700 20px Rubik, sans-serif'; c.fillText('- 50 %', w / 2, 58);
  }) })));
  m.castShadow = true;
  return m;
}
