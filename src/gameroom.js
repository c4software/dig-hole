// gameroom.js, upstairs: an eighties gamer's den behind a locked door. One little homage per
// mini-game on a lit pedestal (e to play), the golden egg, a giant robot, three keys on the
// wall, the arcade cabinet and a stack of old tellies. The key to the door is buried in the
// garden: createKeyQuest places it from the map's seed and runs the hot/cold card.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { GAMES } from './minigames.js';

const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const L = (c) => memo('l' + c, () => new THREE.MeshLambertMaterial({ color: c }));
const M = (c, metal = .6, rough = .35, em = 0) => memo(`m${c},${metal},${rough},${em}`, () => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, emissive: em }));
// neon: brighter than white, so the bloom picks it up
const N = (c, k = 2) => memo(`n${c},${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }));
const GOLD = () => M(0xffc629, .9, .22, 0x5a3a00);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cy = (rt, rb, h, s = 16, open = false, a0 = 0, al = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, a0, al);
const Sp = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const To = (r, t, rs = 8, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts);
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}

// canvases painted now, and again once the page's fonts are in
const repaint = [];
const DISPLAY = '"Titan One", Rubik, sans-serif', TEXT = 'Rubik, sans-serif';
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const paint = () => { const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h); t.needsUpdate = true; };
  paint(); repaint.push(paint);
  return t;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function neon(x, text, px, py, size, color, font = DISPLAY, maxW = Infinity) {
  x.font = `${size}px ${font}`;
  while (x.measureText(text).width > maxW && size > 10) { size -= 2; x.font = `${size}px ${font}`; }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = size * .45; x.fillStyle = color;
  x.fillText(text, px, py); x.fillText(text, px, py);
  x.shadowBlur = 0; x.globalAlpha = .7; x.fillStyle = '#fff'; x.fillText(text, px, py); x.globalAlpha = 1;
}
const glowMat = (map, k = 1.35) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), toneMapped: false });
const plane = (parent, w, h, mat, x, y, z, ry = 0) => add(parent, new THREE.PlaneGeometry(w, h), mat, x, y, z, 0, ry);

// a key: a ring with a gem, a shaft, two teeth (lying in the xy plane, bow on the left)
export function keyMesh(body, gem) {
  const k = new THREE.Group();
  add(k, To(.045, .013, 8, 24), body, -.1, 0, 0);
  add(k, new THREE.OctahedronGeometry(.024), gem, -.1, 0, 0);
  add(k, Cy(.011, .011, .2, 8), body, .03, 0, 0, 0, 0, Math.PI / 2);
  add(k, To(.016, .006, 6, 12), body, -.045, 0, 0, 0, Math.PI / 2);
  add(k, B(.02, .045, .012), body, .115, -.028, 0);
  add(k, B(.016, .03, .012), body, .08, -.02, 0);
  return k;
}

// ---------- the little homages, one per game: built at the origin, facing +z, about 40 cm ----------
const MINI = {
  // a stainless time machine, gull-wing doors up, blue light along the flanks
  kart(g) {
    const c = new THREE.Group(); c.position.y = .05; c.rotation.y = .55; g.add(c);
    const steel = M(0xc4c8cc, .85, .28);
    add(c, B(.24, .06, .46), steel, 0, .03, 0);
    add(c, B(.2, .06, .18), steel, 0, .09, -.03);
    add(c, B(.17, .045, .01), L(0x1a2230), 0, .095, .062, -.5);
    add(c, B(.24, .025, .14), steel, 0, .06, .17, .18);
    for (const s of [-1, 1]) {
      add(c, B(.13, .008, .15), steel, s * .16, .17, -.03, 0, 0, s * .9);
      add(c, B(.004, .012, .42), N(0x39c8ff, 2.6), s * .122, .03, 0);
      for (const z of [-.15, .15]) add(c, Cy(.045, .045, .035, 14), L(0x151515), s * .12, 0, z, 0, 0, Math.PI / 2);
    }
    add(c, B(.18, .03, .012), N(0xff5a1a, 2.2), 0, .06, -.232);
    add(c, B(.12, .05, .07), M(0x6a6e74, .8, .4), 0, .135, -.17);
    add(c, Cy(.022, .022, .03, 10), N(0xffd75e, 2.6), 0, .175, -.17);
    for (const x of [-.06, 0, .06]) add(c, Cy(.012, .012, .03, 8), L(0x333333), x, .05, -.245, Math.PI / 2);
  },
  // a radio-controlled buggy on the box it came in
  rc(g) {
    add(g, B(.38, .15, .26), L(0xd8342a), 0, .075, 0);
    add(g, B(.384, .02, .264), L(0x1a130d), 0, .15, 0);
    plane(g, .34, .1, new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (x) => { x.fillStyle = '#ffd21f'; x.fillRect(0, 0, 256, 80); x.fillStyle = '#1a130d'; x.font = `40px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('mini bolides', 128, 42); }) }), 0, .08, .131);
    const car = new THREE.Group(); car.position.set(0, .215, 0); car.rotation.y = -.5; g.add(car);
    const blue = L(0x2f6bff), cage = L(0xffd21f);
    add(car, B(.12, .025, .24), blue);
    add(car, B(.1, .04, .1), blue, 0, .03, -.02);
    for (const s of [-1, 1]) { add(car, Cy(.006, .006, .09, 6), cage, s * .045, .07, .02, -.4); add(car, Cy(.006, .006, .09, 6), cage, s * .045, .07, -.06, .4); }
    add(car, Cy(.006, .006, .1, 6), cage, 0, .11, -.02, 0, 0, Math.PI / 2);
    for (const [x, z] of [[-.08, -.08], [.08, -.08], [-.08, .08], [.08, .08]]) {
      add(car, Cy(.042, .042, .035, 14), L(0x151515), x, -.02, z, 0, 0, Math.PI / 2);
      add(car, Cy(.018, .018, .037, 10), cage, x, -.02, z, 0, 0, Math.PI / 2);
    }
    add(car, Cy(.003, .003, .16, 4), L(0x222222), .04, .1, -.1);
    add(car, Sp(.009, 6, 4), N(0xff3d5e, 2.5), .04, .18, -.1);
  },
  // a grey 8-bit console, a cartridge in, two pads, and a ? block floating above
  nes(g, anim) {
    const grey = L(0xc9c6c0), dark = L(0x3a3a3e);
    add(g, B(.3, .07, .22), grey, 0, .035, 0);
    add(g, B(.302, .03, .09), dark, 0, .05, .066);
    add(g, B(.15, .11, .025), L(0x8e8e92), 0, .12, -.04);
    add(g, B(.11, .06, .004), L(0xd83a2a), 0, .135, -.026);
    add(g, B(.03, .012, .004), L(0xd83a2a), -.1, .042, .112);
    add(g, B(.03, .012, .004), grey, -.06, .042, .112);
    for (const s of [-1, 1]) {
      const pad = new THREE.Group(); pad.position.set(s * .11, .007, .19); pad.rotation.y = s * .25; g.add(pad);
      add(pad, B(.13, .012, .055), grey);
      add(pad, B(.12, .003, .045), L(0x222226), 0, .007, 0);
      add(pad, B(.03, .005, .01), L(0x777777), -.035, .01, 0); add(pad, B(.01, .005, .03), L(0x777777), -.035, .01, 0);
      for (const x of [.03, .052]) add(pad, Cy(.008, .008, .007, 10), L(0xd83a2a), x, .01, 0);
    }
    const qTex = canvasTex(64, 64, (x) => {
      x.fillStyle = '#6a3a10'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#f8b818'; x.fillRect(3, 3, 58, 58);
      x.fillStyle = '#6a3a10'; for (const [a, b] of [[7, 7], [53, 7], [7, 53], [53, 53]]) x.fillRect(a, b, 4, 4);
      x.font = `44px ${DISPLAY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#6a3a10'; x.fillText('?', 35, 37); x.fillStyle = '#fff'; x.fillText('?', 32, 34);
    });
    qTex.magFilter = THREE.NearestFilter;
    const q = new THREE.Group(); q.position.y = .34; q.userData.keep = true; g.add(q);
    add(q, B(.12, .12, .12), glowMat(qTex, 1.15));
    anim((dt, t) => { q.position.y = .34 + Math.sin(t * 2.2) * .02; q.rotation.y += dt * .7; });
  },
  // an ink squid on its splat
  encre(g) {
    const ink = N(0x39e05a, 1.25);
    for (const [x, z, r] of [[0, 0, .14], [.11, .06, .06], [-.12, -.05, .07], [.06, -.12, .05], [-.05, .13, .045]]) add(g, new THREE.CircleGeometry(r, 18), ink, x, .004, z, -Math.PI / 2);
    const pink = M(0xff3fa4, .1, .4, 0x40081c);
    const b = add(g, Sp(.075, 18, 12), pink, 0, .15, 0); b.scale.set(1, 1.25, 1);
    add(g, new THREE.ConeGeometry(.07, .14, 20), pink, 0, .29, 0);
    for (const s of [-1, 1]) { const f = add(g, new THREE.ConeGeometry(.045, .12, 3), pink, s * .07, .28, 0, 0, 0, -s * 1.25); f.scale.z = .35; }
    add(g, B(.13, .035, .012), L(0x1a1a1a), 0, .17, .062);
    for (const s of [-1, 1]) { add(g, Sp(.022, 10, 8), L(0xffffff), s * .032, .17, .066); add(g, Sp(.011, 8, 6), L(0x111111), s * .032, .17, .085); }
    for (let n = 0; n < 6; n++) {
      const a = n / 6 * Math.PI * 2;
      add(g, new THREE.CapsuleGeometry(.014, .06, 4, 8), pink, Math.sin(a) * .045, .05, Math.cos(a) * .045, Math.cos(a) * .35, 0, -Math.sin(a) * .35);
    }
  },
  // spray cans and a paint roller
  peinture(g) {
    for (const [x, z, c] of [[-.1, 0, 0xff7a1a], [0, -.07, 0x2f6bff], [.1, .01, 0x39e05a]]) {
      add(g, Cy(.034, .034, .15, 16), L(c), x, .075, z);
      add(g, Cy(.0345, .0345, .05, 16), L(0x1a130d), x, .08, z);
      add(g, Cy(.03, .034, .03, 16), L(0xe8e8e8), x, .165, z);
      add(g, B(.012, .012, .014), L(0x333333), x, .185, z + .01);
      add(g, new THREE.CircleGeometry(.05, 16), N(c, 1.2), x + .03, .004, z + .12, -Math.PI / 2);
    }
    const lying = add(g, Cy(.034, .034, .15, 16), L(0xff3fa4), .05, .035, .15, 0, .3, Math.PI / 2);
    lying.position.y = .035;
    const r = new THREE.Group(); r.position.set(-.14, .03, .14); r.rotation.y = .9; g.add(r);
    add(r, Cy(.03, .03, .13, 14), L(0xffd21f), 0, 0, 0, 0, 0, Math.PI / 2);
    add(r, Cy(.004, .004, .08, 6), L(0x888888), .07, .03, 0);
    add(r, Cy(.009, .009, .12, 8), L(0x1a1a1a), .07, .1, 0, 0, 0, .5);
  },
  // a glowing sabre on its stand, and a chunky eighties laser-tag pistol
  laser(g) {
    add(g, B(.3, .03, .08), L(0x1a1a22), 0, .015, -.07);
    for (const x of [-.09, .09]) add(g, B(.02, .06, .03), L(0x1a1a22), x, .05, -.07);
    const s = new THREE.Group(); s.position.set(-.05, .07, -.07); s.rotation.z = -.55; g.add(s);
    add(s, Cy(.018, .018, .11, 14), M(0xb8bcc2, .9, .3), 0, 0, 0);
    for (const y of [-.03, -.01, .01]) add(s, Cy(.0195, .0195, .008, 14), L(0x111111), 0, y, 0);
    add(s, Cy(.022, .018, .02, 14), M(0x888c92, .9, .3), 0, .06, 0);
    add(s, Cy(.012, .012, .34, 10), N(0x4a9aff, 2.6), 0, .24, 0);
    add(s, Cy(.006, .006, .34, 8), N(0xffffff, 2), 0, .24, 0);
    const p = new THREE.Group(); p.position.set(-.02, .03, .1); p.rotation.set(0, .4, 0); g.add(p);
    add(p, B(.15, .05, .035), L(0xff7a1a), 0, .03, 0);
    add(p, B(.12, .015, .03), L(0x3a3a44), -.01, .062, 0);
    add(p, B(.035, .07, .03), L(0x3a3a44), -.045, -.02, 0, 0, 0, -.3);
    add(p, Cy(.013, .013, .05, 10), L(0x3a3a44), .1, .03, 0, 0, 0, Math.PI / 2);
    add(p, Sp(.012, 8, 6), N(0xff3d5e, 2.6), .126, .03, 0);
  },
  // a whack-a-mole cabinet, in miniature
  taupe(g, anim) {
    add(g, B(.36, .14, .26), L(0xffd21f), 0, .07, 0);
    add(g, B(.364, .03, .264), L(0xd83a2a), 0, .1, 0);
    add(g, B(.36, .01, .26), L(0x2f8a3a), 0, .145, 0);
    const moles = [];
    for (let n = 0; n < 6; n++) {
      const x = -.11 + (n % 3) * .11, z = -.05 + Math.floor(n / 3) * .1;
      add(g, new THREE.CircleGeometry(.038, 16), L(0x0a0a0a), x, .151, z, -Math.PI / 2);
      if (n === 1 || n === 5) {
        const m = new THREE.Group(); m.position.set(x, .15, z); m.userData.keep = true; g.add(m);
        add(m, Sp(.034, 12, 8), L(0x5a3a2a), 0, .02, 0).scale.y = 1.2;
        add(m, Sp(.01, 6, 4), L(0xe8a0aa), 0, .03, .032);
        add(m, Cy(.022, .026, .015, 12), L(0xd9a125), 0, .058, 0);
        moles.push(m);
      }
    }
    add(g, Cy(.007, .007, .2, 6), L(0x8a5f38), .02, .17, .1, 0, 0, 1.3);
    add(g, Cy(.026, .026, .07, 12), L(0xd83a2a), -.08, .19, .1, Math.PI / 2, 0, 0);
    add(g, B(.36, .08, .02), L(0x1a130d), 0, .2, -.12);
    plane(g, .34, .065, glowMat(canvasTex(256, 48, (x) => { x.fillStyle = '#1a130d'; x.fillRect(0, 0, 256, 48); neon(x, 'tape-taupe', 128, 25, 34, '#ffd21f'); }), 1.4), 0, .2, -.109);
    anim((dt, t) => moles.forEach((m, n) => { m.position.y = .12 + Math.max(0, Math.sin(t * 3 + n * 2.1)) * .04; }));
  },
  // a treasure chest, the adventurer's hat on its lid, a coiled whip
  tresor(g) {
    const ch = new THREE.Group(); ch.rotation.y = -.3; g.add(ch);
    const wood = L(0x7a4a2a), band = GOLD();
    add(ch, B(.26, .13, .17), wood, 0, .065, 0);
    add(ch, Cy(.085, .085, .26, 14, false, 0, Math.PI), wood, 0, .13, 0, 0, 0, Math.PI / 2);
    for (const x of [-.09, .09]) add(ch, B(.02, .135, .175), band, x, .065, 0);
    add(ch, B(.03, .04, .01), band, 0, .12, .086);
    const hat = new THREE.Group(); hat.position.set(.02, .215, 0); hat.rotation.set(.12, .4, -.1); ch.add(hat);
    const felt = L(0x7a5a38);
    add(hat, Cy(.1, .1, .006, 22), felt);
    add(hat, Cy(.052, .066, .065, 18), felt, 0, .035, 0);
    add(hat, Cy(.067, .067, .015, 18), L(0x2a1a10), 0, .012, 0);
    for (let n = 0; n < 3; n++) add(g, To(.06 - n * .006, .006, 6, 20), L(0x4a2e1a), -.13, .008 + n * .012, .12, Math.PI / 2);
    add(g, Cy(.01, .01, .08, 8), L(0x3a2412), -.06, .012, .17, 0, 0, Math.PI / 2);
    for (let n = 0; n < 6; n++) add(g, Cy(.018, .018, .006, 12), band, .14 + Math.sin(n) * .05, .004 + (n % 2) * .006, .1 + Math.cos(n * 1.7) * .04, .2 * (n % 3));
  },
  // three golden rings over a chequered hill
  anneaux(g, anim) {
    const chk = canvasTex(64, 64, (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#8a4a1a' : '#c87a2a'; x.fillRect(i * 16, j * 16, 16, 16); } });
    chk.magFilter = THREE.NearestFilter;
    add(g, B(.4, .06, .4), new THREE.MeshLambertMaterial({ map: chk }), 0, .03, 0);
    add(g, B(.41, .02, .41), L(0x39c040), 0, .065, 0);
    for (const [x, z] of [[-.13, -.13], [.14, -.1]]) { add(g, Cy(.01, .014, .16, 6), L(0x8a5a2a), x, .15, z); add(g, Sp(.04, 8, 6), L(0x2f9a3a), x, .24, z).scale.y = .4; }
    const rings = [[-.07, .17, .05], [.02, .27, -.02], [.09, .37, .04]].map(([x, y, z]) => {
      const r = new THREE.Group(); r.position.set(x, y, z); r.userData.keep = true; g.add(r);
      add(r, To(.06, .013, 10, 32), GOLD());
      return r;
    });
    anim((dt, t) => rings.forEach((r, n) => { r.rotation.y = t * 2.4 + n; r.position.y = .17 + n * .1 + Math.sin(t * 2 + n) * .01; }));
  },
  // a 3x3 puzzle cube, balanced on its corner, the top layer mid-twist
  pile(g) {
    add(g, Cy(.05, .07, .04, 16), L(0x1a1a22), 0, .02, 0);
    const cube = new THREE.Group(); cube.position.y = .19; cube.rotation.set(Math.atan(1 / Math.SQRT2), 0, Math.PI / 4); g.add(cube);
    const top = new THREE.Group(); top.rotation.y = .35; cube.add(top);
    const cols = { px: 0xd83a2a, nx: 0xff8a1a, py: 0xf2f2f2, ny: 0xffd21f, pz: 0x2fbf4a, nz: 0x2f6bff };
    const P = .056, H = .0275;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const par = j === 1 ? top : cube, x = i * P, y = j * P, z = k * P;
      add(par, B(.053, .053, .053), L(0x111111), x, y, z);
      if (i === 1) add(par, B(.003, .045, .045), L(cols.px), x + H, y, z);
      if (i === -1) add(par, B(.003, .045, .045), L(cols.nx), x - H, y, z);
      if (j === 1) add(par, B(.045, .003, .045), L(cols.py), x, y + H, z);
      if (j === -1) add(par, B(.045, .003, .045), L(cols.ny), x, y - H, z);
      if (k === 1) add(par, B(.045, .045, .003), L(cols.pz), x, y, z + H);
      if (k === -1) add(par, B(.045, .045, .003), L(cols.nz), x, y, z - H);
    }
  },
  // a heap of gold coins, a diving board over it
  ruee(g) {
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 46; n++) {
      const a = n * 2.4, d = .17 * Math.sqrt(n / 46);
      add(g, Cy(.022, .022, .006, 12), GOLD(), Math.cos(a) * d, .005 + (1 - d / .17) * .1 + r() * .01, Math.sin(a) * d, (r() - .5) * .8, 0, (r() - .5) * .8);
    }
    for (const [x, z, c] of [[.05, .08, 0xe4183a], [-.07, .03, 0x7af4ff], [.02, -.08, 0x39e05a]]) add(g, new THREE.OctahedronGeometry(.02), M(c, .3, .2, c & 0x3f3f3f), x, .09, z);
    add(g, B(.02, .22, .02), L(0x9a9aa2), -.17, .11, -.17);
    add(g, B(.2, .012, .045), L(0xf2f2f2), -.1, .225, -.1, 0, -Math.PI / 4, 0);
  },
  // a stopwatch, and a shovel planted in a mound
  course(g) {
    add(g, B(.1, .04, .05), L(0x1a1a22), .05, .02, 0);
    const sw = new THREE.Group(); sw.position.set(.05, .13, 0); sw.rotation.y = -.3; g.add(sw);
    add(sw, Cy(.09, .09, .035, 28), M(0xd8dde6, .9, .25), 0, 0, 0, Math.PI / 2);
    add(sw, To(.088, .008, 8, 28), GOLD(), 0, 0, .018);
    const dial = canvasTex(128, 128, (x) => {
      x.fillStyle = '#f6f2e8'; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
      x.strokeStyle = '#1a130d'; x.lineWidth = 3;
      for (let n = 0; n < 12; n++) { const a = n / 12 * Math.PI * 2; x.beginPath(); x.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); x.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); x.stroke(); }
      x.strokeStyle = '#d83a2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(98, 34); x.stroke();
      x.fillStyle = '#1a130d'; x.font = `18px ${TEXT}`; x.textAlign = 'center'; x.fillText('0:08', 64, 96);
    });
    add(sw, new THREE.CircleGeometry(.079, 28), new THREE.MeshBasicMaterial({ map: dial }), 0, 0, .0185);
    add(sw, Cy(.014, .014, .03, 10), M(0xd8dde6, .9, .25), 0, .1, 0);
    add(sw, To(.02, .005, 6, 14), M(0xd8dde6, .9, .25), 0, .13, 0);
    add(g, new THREE.SphereGeometry(.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), L(0x7a5230), -.13, 0, .06);
    add(g, Cy(.008, .008, .26, 8), L(0x8a5f38), -.14, .2, .06, 0, 0, .12);
    add(g, B(.06, .012, .012), L(0x3a2412), -.155, .33, .06, 0, 0, .12);
    add(g, B(.06, .075, .006), M(0x9aa0a6, .8, .35), -.125, .07, .06, 0, 0, .12);
  },
  // a brass diving helmet
  plongeon(g) {
    const brass = M(0xc8923a, .95, .28, 0x2a1a00), copper = M(0xb8653a, .9, .3), glass = M(0x1a3040, .2, .05, 0x0a2030);
    add(g, Cy(.1, .15, .07, 24), brass, 0, .035, 0);
    for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2; add(g, Sp(.01, 6, 4), brass, Math.sin(a) * .12, .07, Math.cos(a) * .12); }
    add(g, Sp(.105, 24, 18), copper, 0, .16, 0);
    add(g, To(.045, .011, 8, 20), brass, 0, .16, .098);
    add(g, new THREE.CircleGeometry(.043, 20), glass, 0, .16, .1);
    for (const x of [-.018, 0, .018]) add(g, B(.004, .08, .006), brass, x, .16, .106);
    for (const s of [-1, 1]) { add(g, To(.032, .009, 8, 18), brass, s * .096, .165, 0, 0, Math.PI / 2); add(g, new THREE.CircleGeometry(.03, 16), glass, s * .1, .165, 0, 0, s * Math.PI / 2); }
    add(g, Cy(.02, .02, .03, 10), brass, 0, .27, 0);
    add(g, To(.018, .005, 6, 12), brass, 0, .29, 0, Math.PI / 2);
  },
  // an hourglass that turns over now and then
  chrono(g, anim) {
    const hg = new THREE.Group(); hg.position.y = .17; hg.userData.keep = true; g.add(hg);
    const wood = L(0x6b4a2e);
    for (const y of [-.16, .16]) add(hg, Cy(.09, .09, .02, 18), wood, 0, y, 0);
    for (let n = 0; n < 3; n++) { const a = n / 3 * Math.PI * 2; add(hg, Cy(.008, .008, .31, 6), wood, Math.sin(a) * .075, 0, Math.cos(a) * .075); }
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: .3, roughness: .05, depthWrite: false });
    add(hg, new THREE.ConeGeometry(.065, .15, 20, 1, true), glass, 0, .075, 0, Math.PI);
    add(hg, new THREE.ConeGeometry(.065, .15, 20, 1, true), glass, 0, -.075, 0);
    const sand = L(0xe8c46a);
    add(hg, new THREE.ConeGeometry(.052, .055, 18), sand, 0, -.122, 0);
    add(hg, new THREE.ConeGeometry(.03, .04, 14), sand, 0, .03, 0, Math.PI);
    add(hg, Cy(.003, .003, .1, 4), N(0xffd75e, 1.4), 0, -.04, 0);
    anim((dt, t) => { const c = t % 12; hg.rotation.z = c < 11 ? 0 : (c - 11) * Math.PI; hg.rotation.y = t * .3; });
  },
};

// which game sits where: the front wall, the right wall, the back
const PLACES = [
  ['nes', 0xff3d5e], ['rc', 0xff7a1a], ['kart', 0x39c8ff], ['encre', 0x39e05a], ['peinture', 0xffd21f], ['laser', 0x4a9aff], ['taupe', 0xc07aff], ['tresor', 0xffc629],
  ['course', 0x39e0c8], ['plongeon', 0xff9a3a], ['chrono', 0xffe08a],
  ['anneaux', 0xffc629], ['pile', 0xff4ad8], ['ruee', 0xffd21f],
];

// where the 2D games are shown: filled by buildGameRoom, in world space
// { center, normal (out of the glass), up, w, h, mesh }
export const screens = {};

export function buildGameRoom({ g, addBox, interactables, F, HH, HH2, HW, T, zf, zb, wallMat }) {
  const room = new THREE.Group();
  g.add(room);
  const anims = [];
  const anim = (f) => anims.push(f);
  const X0 = -HW / 2 + T, X1 = HW / 2 - T, ZB = zb + T, ZF = zf - T;   // inner faces
  const PZ0 = -20.2, PZ1 = -20.08, DX0 = -4.6, DX1 = -3.6, DH = 2.2, CX = .32;   // partition, door
  const wall = L(0x1d1630), dark = L(0x17131f);

  // ---------- the floor: a glowing grid; the walls: dark; the ceiling: darker ----------
  const grid = canvasTex(128, 128, (x) => {
    x.fillStyle = '#0a0716'; x.fillRect(0, 0, 128, 128);
    x.shadowColor = '#39d8ff'; x.shadowBlur = 8; x.strokeStyle = '#39c8ff'; x.lineWidth = 3;
    x.strokeRect(1.5, 1.5, 125, 125);
    x.shadowBlur = 0; x.strokeStyle = 'rgba(255,74,216,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
  });
  grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
  const gridMat = glowMat(grid, 1.25);
  const floorPiece = (x0, x1, z0, z1) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = geo.attributes.uv;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) * (x1 - x0) / .7, uv.getY(n) * (z1 - z0) / .7);
    add(room, geo, gridMat, (x0 + x1) / 2, F + .004, (z0 + z1) / 2, -Math.PI / 2);
  };
  floorPiece(X0, X1, PZ1, ZF);
  floorPiece(CX, X1, ZB, PZ1);
  add(room, new THREE.PlaneGeometry(-3.22 - X0, PZ0 - ZB), L(0x2a2238), (X0 - 3.22) / 2, F + .004, (ZB + PZ0) / 2, -Math.PI / 2);
  add(room, new THREE.PlaneGeometry(HW, zf - zb), L(0x0d0a18), 0, HH2 - .01, (zb + zf) / 2, Math.PI / 2);
  const H = HH2 - F;
  add(room, new THREE.PlaneGeometry(X1 - X0, H), wall, 0, F + H / 2, ZF - .005, 0, Math.PI);
  add(room, new THREE.PlaneGeometry(X1 - X0, H), wall, 0, F + H / 2, ZB + .005);
  add(room, new THREE.PlaneGeometry(ZF - ZB, H), wall, X0 + .005, F + H / 2, (ZB + ZF) / 2, 0, Math.PI / 2);
  add(room, new THREE.PlaneGeometry(ZF - ZB, H), wall, X1 - .005, F + H / 2, (ZB + ZF) / 2, 0, -Math.PI / 2);

  // ---------- the partition round the stairs, with the locked door ----------
  const part = (x0, x1, y0, y1, z0, z1) => { add(room, B(x1 - x0, y1 - y0, z1 - z0), wall, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); addBox(x0, y0, z0, x1, y1, z1); };
  part(X0, DX0, F, HH2, PZ0, PZ1);
  part(DX1, CX, F, HH2, PZ0, PZ1);
  part(DX0, DX1, F + DH, HH2, PZ0, PZ1);
  part(CX - .12, CX, F, HH2, ZB, PZ0);
  const hinge = new THREE.Group(); hinge.position.set(DX0 + .02, F, (PZ0 + PZ1) / 2); hinge.userData.keep = true; room.add(hinge);
  add(hinge, B(.96, DH - .03, .05), L(0x2a2438), .48, DH / 2, 0);
  for (const z of [-.028, .028]) {
    add(hinge, B(.02, DH - .1, .006), N(0x39c8ff, 2), .06, DH / 2, z);
    add(hinge, B(.02, DH - .1, .006), N(0x39c8ff, 2), .9, DH / 2, z);
    add(hinge, B(.86, .02, .006), N(0x39c8ff, 2), .48, DH - .06, z);
  }
  add(hinge, B(.08, .16, .07), M(0xd9a125, .8, .3), .84, 1.05, 0);
  const lockRed = N(0xff3d5e, 2.6), lockGreen = N(0x39e05a, 2.6);
  const locks = [-.04, .04].map(z => add(hinge, Sp(.018, 10, 8), lockRed, .84, 1.11, z));
  const doorBox = addBox(DX0, F, PZ0, DX1, F + DH, PZ1);
  let locked = true, doorOpen = false, doorAng = 0;
  interactables.push({ id: 'updoor', pos: new THREE.Vector3((DX0 + DX1) / 2, F + 1.2, (PZ0 + PZ1) / 2), reach: 2 });
  // a neon sign over the door, on the landing side
  plane(room, 1.1, .3, glowMat(canvasTex(512, 140, (x) => { x.fillStyle = '#0b0816'; x.fillRect(0, 0, 512, 140); neon(x, 'salle d\'arcade', 256, 74, 70, '#ff4ad8', DISPLAY, 470); }), 1.6), (DX0 + DX1) / 2, F + 2.55, PZ0 - .005, Math.PI);
  plane(room, .7, .22, glowMat(canvasTex(320, 100, (x) => { x.fillStyle = '#0b0816'; x.fillRect(0, 0, 320, 100); neon(x, 'joueur 1', 160, 52, 56, '#39c8ff'); }), 1.5), (DX0 + DX1) / 2, F + 2.5, PZ1 + .005);

  // ---------- neon along the ceiling ----------
  const y = HH2 - .12;
  const strip = (w, d, x, z, c) => add(room, B(w, .035, d), N(c, 2.4), x, y, z);
  strip(X1 - X0, .035, 0, ZF - .03, 0xff4ad8);
  strip(X1 - CX, .035, (CX + X1) / 2, ZB + .03, 0xff4ad8);
  strip(CX - X0, .035, (X0 + CX) / 2, PZ1 + .03, 0xff4ad8);
  strip(.035, ZF - PZ1, X0 + .03, (PZ1 + ZF) / 2, 0x39c8ff);
  strip(CX - .12 - X0, .035, (X0 + CX - .12) / 2, ZB + .03, 0x39c8ff);
  strip(.035, PZ0 - ZB, X0 + .03, (ZB + PZ0) / 2, 0xff4ad8);
  strip(.035, ZF - ZB, X1 - .03, (ZB + ZF) / 2, 0x39c8ff);
  for (const [x, z] of [[X0 + .03, ZF - .03], [X1 - .03, ZF - .03], [X1 - .03, ZB + .03]]) add(room, B(.035, H - .2, .035), N(0x7a4aff, 2.2), x, F + H / 2, z);

  // ---------- windows in the upper walls: purple glass, bright at night ----------
  const glass = new THREE.MeshLambertMaterial({ color: 0x6a4a9a, emissive: 0x4a1a6a, transparent: true, opacity: .7 });
  const frame = L(0xfaf6ea);
  const win = (w, h, x, yy, z, side) => {
    if (side) { add(g, B(T + .06, h + .16, w + .16), frame, x, yy, z); add(g, B(T + .1, h, w), glass, x, yy, z); }
    else { add(g, B(w + .16, h + .16, T + .06), frame, x, yy, z); add(g, B(w, h, T + .1), glass, x, yy, z); add(g, B(w + .3, .08, .25), frame, x, yy - h / 2 - .08, z + (z > -18 ? .12 : -.12)); }
  };
  win(1.4, .75, -3.4, F + 1.95, zf - T / 2, false);
  win(1.4, .75, 3.4, F + 1.95, zf - T / 2, false);
  win(1.2, .6, 2.25, F + 2.05, zb + T / 2, false);
  win(.9, .6, -HW / 2 + T / 2, F + 2.0, -21.15, true);
  win(1.1, .6, HW / 2 - T / 2, F + 2.05, -18.4, true);
  const glassDay = new THREE.Color(0x4a1a6a), glassNight = new THREE.Color(0xff3ad0);

  // ---------- posters ----------
  const poster = (w, h, x, yy, z, ry, draw, W = 256) => plane(room, w, h, new THREE.MeshBasicMaterial({ map: canvasTex(W, Math.round(W * h / w), draw), color: 0xd8d0e0 }), x, yy, z, ry);
  // a sunset over a neon grid: « prêt, joueur 1 ? »
  poster(1.2, .8, 0, F + 1.75, ZF - .01, Math.PI, (x, w, h) => {
    const sky = x.createLinearGradient(0, 0, 0, h * .6); sky.addColorStop(0, '#1a0a3a'); sky.addColorStop(1, '#ff4ad8');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    const sun = x.createLinearGradient(0, h * .2, 0, h * .6); sun.addColorStop(0, '#ffd21f'); sun.addColorStop(1, '#ff3d7e');
    x.fillStyle = sun; x.beginPath(); x.arc(w / 2, h * .6, h * .3, Math.PI, 0); x.fill();
    x.fillStyle = '#1a0a3a'; for (let n = 0; n < 5; n++) x.fillRect(0, h * (.45 + n * .03), w, 2 + n);
    x.fillStyle = '#0a0716'; x.fillRect(0, h * .6, w, h * .4);
    x.strokeStyle = '#39c8ff'; x.lineWidth = 2;
    for (let n = -8; n <= 8; n++) { x.beginPath(); x.moveTo(w / 2 + n * 6, h * .6); x.lineTo(w / 2 + n * 60, h); x.stroke(); }
    for (let n = 0; n < 6; n++) { const yy = h * .6 + Math.pow(n / 6, 1.8) * h * .4; x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy); x.stroke(); }
    neon(x, 'prêt, joueur 1 ?', w / 2, h * .16, 34, '#ffffff', DISPLAY, w - 20);
  }, 384);
  poster(.55, .8, X1 - .01, F + 1.8, -17.75, -Math.PI / 2, (x, w, h) => {
    x.fillStyle = '#0b0816'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffd21f'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    neon(x, 'insert', w / 2, h * .3, 50, '#ffd21f'); neon(x, 'coin', w / 2, h * .48, 64, '#ffd21f');
    x.fillStyle = '#ffd21f'; x.beginPath(); x.arc(w / 2, h * .74, 34, 0, 7); x.fill(); x.fillStyle = '#c77c0a'; x.font = `44px ${DISPLAY}`; x.textAlign = 'center'; x.fillText('1', w / 2, h * .76);
  });
  poster(.55, .8, X1 - .01, F + 1.8, -19.05, -Math.PI / 2, (x, w, h) => {
    x.fillStyle = '#10213a'; x.fillRect(0, 0, w, h);
    const px = 14, alien = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
    x.fillStyle = '#39e05a';
    alien.forEach((row, j) => [...row].forEach((c, i) => { if (c === '1') x.fillRect(w / 2 - 5.5 * px + i * px, h * .22 + j * px, px - 1, px - 1); }));
    neon(x, '1up', w / 2, h * .66, 56, '#39e05a'); neon(x, '000000', w / 2, h * .8, 34, '#ffffff');
  });
  poster(.8, .44, -3.1, F + 1.75, PZ1 + .01, 0, (x, w, h) => {
    x.fillStyle = '#0b0816'; x.fillRect(0, 0, w, h);
    neon(x, 'meilleurs scores', w / 2, 30, 30, '#ff4ad8');
    ['1 · ???  999 999', '2 · toi    12 345', '3 · taupe    404'].forEach((s, n) => { x.fillStyle = ['#ffd21f', '#39c8ff', '#ffffff'][n]; x.font = `26px ${TEXT}`; x.textAlign = 'center'; x.fillText(s, w / 2, 76 + n * 32); });
  }, 384);

  // ---------- a stack of old tellies on the left wall ----------
  const tvTex = [
    (x, w, h) => { ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach((c, n) => { x.fillStyle = c; x.fillRect(n * w / 7, 0, w / 7 + 1, h * .75); }); x.fillStyle = '#111'; x.fillRect(0, h * .75, w, h * .25); },
    (x, w, h) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.strokeStyle = '#2121ff'; x.lineWidth = 5;
      for (const [a, b, c, d] of [[10, 10, 236, 10], [10, 10, 10, 150], [246, 10, 246, 150], [10, 150, 246, 150], [50, 50, 110, 50], [146, 50, 206, 50], [50, 110, 206, 110], [128, 50, 128, 90]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); }
      x.fillStyle = '#ffb8ae'; for (let n = 0; n < 9; n++) x.fillRect(30 + n * 24, 80, 4, 4);
      x.fillStyle = '#ffd21f'; x.beginPath(); x.moveTo(60, 130); x.arc(60, 130, 12, .6, Math.PI * 2 - .6); x.fill();
      x.fillStyle = '#ff3d3d'; x.beginPath(); x.arc(190, 126, 11, Math.PI, 0); x.lineTo(201, 140); x.lineTo(179, 140); x.fill();
    },
    (x, w, h) => {
      x.fillStyle = '#050510'; x.fillRect(0, 0, w, h);
      const inv = ['0011100', '0111110', '1101011', '1111111', '0101010', '1000001'];
      for (let r = 0; r < 3; r++) for (let q = 0; q < 5; q++) { x.fillStyle = ['#ff4ad8', '#39c8ff', '#39e05a'][r]; inv.forEach((row, j) => [...row].forEach((c, i) => { if (c === '1') x.fillRect(22 + q * 44 + i * 4, 18 + r * 36 + j * 4, 4, 4); })); }
      x.fillStyle = '#39e05a'; x.fillRect(118, 140, 20, 8); x.fillRect(125, 134, 6, 6);
    },
    (x, w, h) => { const d = x.createImageData(w, h); for (let n = 0; n < d.data.length; n += 4) { const v = Math.random() * 255; d.data[n] = d.data[n + 1] = d.data[n + 2] = v; d.data[n + 3] = 255; } x.putImageData(d, 0, 0); },
    (x, w, h) => { x.fillStyle = '#0a0a30'; x.fillRect(0, 0, w, h); neon(x, 'appuie sur', w / 2, h * .38, 30, '#ffffff'); neon(x, 'start', w / 2, h * .62, 52, '#ffd21f'); },
  ].map(d => canvasTex(256, 160, d));
  const noise = tvTex[3]; noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.repeat.set(.5, .5);
  const tvs = new THREE.Group(); tvs.position.set(X0, F, -18.0); tvs.rotation.y = Math.PI / 2; room.add(tvs);
  const tv = (w, h, d, x, yy, shell, scr, ry = 0) => {
    const t = new THREE.Group(); t.position.set(x, yy, d / 2 + .04); t.rotation.y = ry; tvs.add(t);
    add(t, B(w, h, d), L(shell), 0, h / 2, 0);
    add(t, B(w * .7, h * .7, d * .4), L(shell), 0, h / 2, -d * .6);
    add(t, B(w * .84, h * .8, .02), L(0x151515), -w * .05, h / 2, d / 2 + .005);
    plane(t, w * .72, h * .64, glowMat(tvTex[scr], 1.35), -w * .05, h / 2, d / 2 + .017);
    for (const k of [.3, .15]) add(t, Cy(.018, .018, .02, 10), L(0x222222), w * .42, h * k + h * .3, d / 2 + .01, Math.PI / 2);
  };
  add(tvs, B(2.2, .4, .6), dark, 0, .2, .32);
  add(tvs, B(2.2, .02, .012), N(0xff4ad8, 2), 0, .38, .626);
  // the big one, for « super creuseur »: a flat 4:3 face of dark glass
  const big = new THREE.Group(); big.position.set(0, .4, .34); tvs.add(big);
  add(big, B(.95, .74, .6), L(0x2a2a2e), 0, .37, 0);
  add(big, B(.66, .52, .26), L(0x2a2a2e), 0, .37, -.4);
  add(big, B(.8, .6, .02), L(0x0c0c0e), 0, .39, .305);
  const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: .12, metalness: .4, emissive: 0x060a14 });
  const nesScreen = plane(big, .68, .51, glassMat(), 0, .39, .318);
  nesScreen.name = 'screen-nes'; nesScreen.userData.keep = true;
  for (const k of [.2, .1]) add(big, Cy(.022, .022, .02, 10), L(0x888888), .41, k, .3, Math.PI / 2);
  plane(big, .3, .05, glowMat(canvasTex(256, 44, (x) => { x.fillStyle = '#0c0c0e'; x.fillRect(0, 0, 256, 44); neon(x, 'super creuseur', 128, 24, 28, '#ff3d5e'); }), 1.3), -.15, .055, .302);
  tv(.55, .42, .5, -.8, .4, 0xcfc3a5, 0); tv(.55, .42, .5, .8, .4, 0x6b4a2e, 2);
  tv(.46, .36, .42, -.8, .82, 0x2a2a2e, 1, .06); tv(.46, .36, .42, .8, .82, 0xcfc3a5, 4, -.06);
  tv(.46, .36, .42, 0, 1.14, 0x3a3a44, 3, .1);
  addBox(X0, F, -19.1, X0 + .66, F + 1.5, -16.9);
  // two bean bags in front of them
  for (const [x, z, c] of [[-3.3, -17.4, 0xc4202a], [-3.0, -16.4, 0x2a9a9a]]) { const b = add(room, Sp(.42, 18, 12), L(c), x, F + .2, z); b.scale.set(1, .55, 1); }
  // cables snaking across the floor
  const cable = (pts) => add(room, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, F + .02, z))), 40, .014, 5), L(0x111111));
  cable([[-4.7, -18.6], [-4.0, -19.0], [-3.1, -19.4], [-2.4, -19.7]]);
  cable([[-4.7, -17.5], [-3.9, -16.9], [-3.2, -16.0], [-2.2, -15.9], [-.6, -16.1]]);
  cable([[-4.7, -18.1], [-3.8, -18.3], [-2.2, -18.0], [-.3, -18.3]]);

  // ---------- the arcade cabinet ----------
  const cab = new THREE.Group(); cab.position.set(-2.2, F, PZ1 + .36); room.add(cab);
  add(cab, B(.8, 1.9, .7), M(0x1a1830, .2, .5), 0, .95, 0);
  for (const s of [-1, 1]) [[.5, 0xff4ad8], [.56, 0x39c8ff], [.62, 0xffd21f]].forEach(([yy, c]) => add(cab, B(.004, .03, .62), N(c, 2.2), s * .402, yy, 0));
  add(cab, B(.8, .22, .12), M(0x1a1830, .2, .5), 0, 1.8, .3);
  plane(cab, .76, .2, glowMat(canvasTex(512, 128, (x) => { x.fillStyle = '#12082a'; x.fillRect(0, 0, 512, 128); neon(x, 'mini-jeux', 256, 66, 76, '#ffd21f'); }), 1.7), 0, 1.8, .361);
  plane(cab, .6, .45, glowMat(canvasTex(320, 240, (x) => {
    x.fillStyle = '#05050f'; x.fillRect(0, 0, 320, 240);
    neon(x, 'choisis ton jeu', 160, 26, 24, '#39c8ff');
    Object.values(GAMES).slice(0, 8).forEach((gm, n) => { x.fillStyle = n === 0 ? '#ffd21f' : '#c8c0e0'; x.font = `18px ${TEXT}`; x.textAlign = 'left'; x.fillText((n === 0 ? '▶ ' : '   ') + gm.name, 40, 62 + n * 22); });
  }), 1.3), 0, 1.36, .352).rotation.x = -.12;
  add(cab, B(.78, .08, .35), M(0x12101e, .2, .5), 0, 1.02, .45, .3);
  add(cab, Cy(.01, .01, .08, 8), L(0x222222), -.18, 1.1, .47);
  add(cab, Sp(.035, 12, 8), L(0xd42a2a), -.18, 1.15, .47);
  [[.05, 0xffd21f], [.15, 0x39e05a], [.25, 0x39c8ff]].forEach(([x, c]) => add(cab, Cy(.03, .03, .03, 12), N(c, 1.8), x, 1.09, .47, .3));
  add(cab, B(.22, .26, .01), L(0x2a2a2a), 0, .5, .351);
  for (const x of [-.05, .05]) add(cab, B(.02, .06, .01), N(0xff3d5e, 2.2), x, .52, .357);
  addBox(-2.6, F, PZ1, -1.8, F + 1.9, PZ1 + .75);
  interactables.push({ id: 'arcade', pos: new THREE.Vector3(-2.2, F + 1.2, PZ1 + .9) });

  // ---------- the three keys, on the wall by the cabinet ----------
  const kb = new THREE.Group(); kb.position.set(X0 + .02, F + 1.97, -18.0); kb.rotation.y = Math.PI / 2; room.add(kb);
  add(kb, B(1.2, .56, .03), L(0x120e1c));
  for (const [w, h, x, yy] of [[1.2, .02, 0, .28], [1.2, .02, 0, -.28], [.02, .56, -.6, 0], [.02, .56, .6, 0]]) add(kb, B(w, h, .012), N(0xffc629, 2), x, yy, .02);
  const keyMats = [[M(0xc87533, .9, .3, 0x3a1a08), N(0xff9a3a, 2), 'cuivre'], [M(0x2fbf71, .3, .2, 0x0a4a2a), N(0x39e05a, 2), 'jade'], [M(0xcff4ff, .4, .08, 0x3a8ac8), N(0xcff4ff, 2.4), 'cristal']];
  keyMats.forEach(([body, gem, name], n) => {
    const k = keyMesh(body, gem); k.position.set(-.38 + n * .38, .05, .035); k.rotation.z = -Math.PI / 2; k.scale.setScalar(1.3); kb.add(k);
    plane(kb, .3, .07, new THREE.MeshBasicMaterial({ map: canvasTex(200, 48, (x) => { x.fillStyle = '#120e1c'; x.fillRect(0, 0, 200, 48); x.fillStyle = '#d8d0e0'; x.font = `26px ${TEXT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 100, 25); }) }), -.38 + n * .38, -.21, .02);
  });

  // ---------- a gaming desk under a big wall screen, for « encre 2D » (16:10) ----------
  const MX = -.75;
  add(room, B(1.5, .05, .6), M(0x14121e, .3, .4), MX, F + .74, PZ1 + .32);
  for (const x of [-.7, .7]) add(room, B(.05, .72, .5), dark, MX + x, F + .36, PZ1 + .32);
  add(room, B(1.5, .02, .012), N(0x39c8ff, 2.2), MX, F + .71, PZ1 + .62);
  add(room, B(.46, .02, .15), L(0x1a1a22), MX - .05, F + .775, PZ1 + .38);
  add(room, B(.44, .004, .01), N(0xff4ad8, 2), MX - .05, F + .787, PZ1 + .45);
  add(room, B(.06, .02, .1), L(0x1a1a22), MX + .32, F + .775, PZ1 + .38);
  add(room, B(.08, .3, .04), M(0x2a2a30, .6, .4), MX, F + 1.02, PZ1 + .03);
  add(room, B(1.36, .9, .01), N(0xff4ad8, 1.6), MX, F + 1.5, PZ1 + .012);
  add(room, B(1.3, .84, .05), M(0x111118, .4, .35), MX, F + 1.5, PZ1 + .045);
  const encreScreen = plane(room, 1.22, .7625, glassMat(), MX, F + 1.5, PZ1 + .072);
  encreScreen.name = 'screen-encre'; encreScreen.userData.keep = true;
  const chair = new THREE.Group(); chair.position.set(MX + .75, F, PZ1 + .95); chair.rotation.y = -.7; room.add(chair);
  add(chair, Cy(.25, .25, .04, 5), L(0x1a1a22), 0, .06, 0);
  add(chair, Cy(.03, .03, .4, 8), L(0x555555), 0, .26, 0);
  add(chair, B(.5, .1, .48), L(0xc4202a), 0, .5, 0);
  add(chair, B(.5, .7, .1), L(0xc4202a), 0, .9, -.22);
  add(chair, B(.12, .5, .105), L(0x1a1a22), 0, .92, -.22);
  addBox(MX - .75, F, PZ1, MX + .75, F + .77, PZ1 + .62);

  // ---------- the pedestals: one homage per mini-game ----------
  const plateTex = (name, color) => canvasTex(512, 128, (x) => {
    x.fillStyle = '#0b0816'; x.fillRect(0, 0, 512, 128);
    x.strokeStyle = hex(color); x.lineWidth = 6; x.shadowColor = hex(color); x.shadowBlur = 12; x.strokeRect(8, 8, 496, 112); x.shadowBlur = 0;
    neon(x, name, 256, 66, 58, hex(color), DISPLAY, 460);
  });
  const spots = [];
  for (let n = 0; n < 8; n++) spots.push([-4.55 + n * 1.3, ZF - .55, Math.PI]);
  for (const z of [-17.1, -18.4, -19.7]) spots.push([X1 - .5, z, -Math.PI / 2]);
  for (const x of [1.0, 2.25, 3.5]) spots.push([x, ZB + .55, 0]);
  PLACES.forEach(([id, color], n) => {
    const [x, z, ry] = spots[n];
    const p = new THREE.Group(); p.position.set(x, F, z); p.rotation.y = ry; room.add(p);
    add(p, B(.56, .9, .56), dark, 0, .45, 0);
    add(p, B(.62, .06, .62), L(0x241c30), 0, .93, 0);
    add(p, B(.5, .012, .5), N(color, .9), 0, .966, 0);
    add(p, B(.6, .03, .6), N(color, 2.2), 0, .04, 0);
    add(p, B(.566, .02, .566), N(color, 1.8), 0, .88, 0);
    plane(p, .5, .125, new THREE.MeshBasicMaterial({ map: plateTex(GAMES[id]?.name || id, color) }), 0, .68, .282);
    const top = new THREE.Group(); top.position.y = .972; p.add(top);
    MINI[id](top, anim);
    addBox(x - .31, F, z - .31, x + .31, F + .96, z + .31);
    interactables.push({ id: 'mg:' + id, game: id, pos: new THREE.Vector3(x, F + 1.15, z), reach: 1.7 });
  });

  // ---------- the golden egg, under glass, in a beam of light ----------
  const EX = .6, EZ = -18.2;
  const pil = new THREE.Group(); pil.position.set(EX, F, EZ); room.add(pil);
  add(pil, Cy(.26, .3, 1.0, 24), dark, 0, .5, 0);
  add(pil, Cy(.31, .31, .04, 24), L(0x241c30), 0, 1.02, 0);
  for (const yy of [.04, .97]) add(pil, To(.285, .014, 6, 36), N(0xffc629, 2.4), 0, yy, 0, Math.PI / 2);
  plane(pil, .4, .1, new THREE.MeshBasicMaterial({ map: plateTex('l\'œuf', 0xffc629) }), 0, .7, .285);
  const eggPts = []; for (let n = 0; n <= 16; n++) { const a = n / 16 * Math.PI; eggPts.push(new THREE.Vector2(Math.sin(a) * .1 * (1 - .18 * Math.cos(a)), -Math.cos(a) * .14)); }
  const egg = new THREE.Group(); egg.position.set(EX, F + 1.2, EZ); egg.userData.keep = true; room.add(egg);
  add(egg, new THREE.LatheGeometry(eggPts, 24), M(0xffd23a, .55, .2, 0xb07a10));
  const dome = add(room, new THREE.SphereGeometry(.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: .08, roughness: .05, depthWrite: false }), EX, F + 1.04, EZ);
  dome.scale.y = 1.7;
  const beamH = HH2 - (F + 1.04);
  add(room, new THREE.ConeGeometry(.4, beamH, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: .035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), EX, F + 1.04 + beamH / 2, EZ);
  addBox(EX - .3, F, EZ - .3, EX + .3, F + 1.4, EZ + .3);
  interactables.push({ id: 'egg', pos: new THREE.Vector3(EX, F + 1.2, EZ), reach: 1.8 });
  anim((dt, t) => { egg.rotation.y += dt * .6; egg.position.y = F + 1.22 + Math.sin(t * 1.4) * .025; });

  // ---------- a giant robot, in miniature (1.3 m of it) ----------
  const rb = new THREE.Group(); rb.position.set(4.72, F, -21.2); rb.rotation.y = -1.0; room.add(rb);
  const W = L(0xe8e8ee), BL = L(0x2f4fb0), R = L(0xd83a2a), Y = L(0xffd21f);
  add(rb, B(.7, .1, .6), dark, 0, .05, 0);
  add(rb, B(.72, .02, .62), N(0x39c8ff, 2), 0, .1, 0);
  for (const s of [-1, 1]) {
    add(rb, B(.14, .08, .24), BL, s * .1, .14, .03);
    add(rb, B(.12, .26, .13), W, s * .1, .31, 0);
    add(rb, B(.13, .08, .1), BL, s * .1, .45, .03);
    add(rb, B(.11, .2, .12), L(0xc8c8d0), s * .1, .58, 0);
    add(rb, B(.16, .14, .18), W, s * .27, .96, 0);
    add(rb, B(.09, .18, .09), W, s * .29, .8, 0);
    add(rb, B(.1, .16, .11), W, s * .29, .63, .02);
    add(rb, B(.08, .07, .08), L(0x555555), s * .29, .52, .02);
    add(rb, B(.08, .05, .01), Y, s * .08, .93, .101);
    add(rb, B(.015, .13, .012), Y, s * .045, 1.21, .07, 0, 0, -s * .75);
    add(rb, B(.03, .012, .006), N(0x39ffcc, 2.6), s * .026, 1.115, .072);
    add(rb, Cy(.03, .04, .1, 10), L(0x777777), s * .06, .8, -.19);
  }
  add(rb, B(.3, .1, .16), R, 0, .72, 0);
  add(rb, B(.36, .24, .2), BL, 0, .88, 0);
  add(rb, B(.2, .22, .08), W, 0, .92, -.14);
  add(rb, B(.06, .04, .06), L(0x999999), 0, 1.02, 0);
  add(rb, B(.14, .14, .14), W, 0, 1.1, 0);
  add(rb, B(.08, .05, .01), L(0x999999), 0, 1.075, .071);
  add(rb, B(.05, .02, .02), R, 0, 1.04, .07);
  add(rb, B(.02, .03, .012), R, 0, 1.17, .072);
  addBox(4.3, F, -21.8, X1, F + 1.3, -20.6);

  // ---------- light: one purple lamp for the whole floor ----------
  const lamp = new THREE.PointLight(0xb46cff, 5, 8, 1.2);
  lamp.position.set(0, HH2 - .5, -18.2);
  g.add(lamp);   // never hidden with the room: a light that comes and goes recompiles every material

  mergeStatic(room, (o) => o.userData.keep || o.isLight);
  g.updateMatrixWorld(true);
  const anchor = (mesh, w, h) => {
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    return { center: mesh.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), w, h, mesh };
  };
  screens.nes = anchor(nesScreen, .68, .51);
  screens.encre = anchor(encreScreen, 1.22, .7625);
  // the page fonts arrive after the house is built: paint the signs again then
  document.fonts?.load?.(`40px ${DISPLAY}`).then(() => document.fonts.load(`20px ${TEXT}`)).then(() => repaint.forEach(p => p())).catch(() => {});

  let t = 0;
  return {
    group: room, screens,
    get locked() { return locked; },
    get doorOpen() { return doorOpen; },
    setUnlocked(on, open = false) {
      locked = !on;
      locks.forEach(l => { l.material = on ? lockGreen : lockRed; });
      if (locked && doorOpen) this.toggleDoor();
      if (on && open && !doorOpen) this.toggleDoor();
    },
    toggleDoor() { if (locked) return false; doorOpen = !doorOpen; doorBox.off = doorOpen; return true; },
    // the room is shut in: nothing in it needs to throw a shadow
    noShadows() { room.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; }); },
    setNight(n) { glass.emissive.copy(glassDay).lerp(glassNight, n); },
    update(dt) {
      t += dt;
      doorAng += ((doorOpen ? -1.6 : 0) - doorAng) * Math.min(1, dt * 6);
      hinge.rotation.y = doorAng;
      noise.offset.set(Math.random(), Math.random());
      for (const f of anims) f(dt, t);
    },
  };
}

// ---------- the key to upstairs: buried in the garden, a hot/cold card to find it ----------
export function createKeyQuest({ parent, terrain, camera }) {
  const key = keyMesh(M(0xd88a3a, .7, .3, 0x8a4a10), N(0x7af4ff, 2.4));
  key.scale.setScalar(1.8);
  parent.add(key);
  // a glint seen through the ground once you're close
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gx = gc.getContext('2d');
  const rad = gx.createRadialGradient(64, 64, 0, 64, 64, 64); rad.addColorStop(0, 'rgba(255,240,200,1)'); rad.addColorStop(.25, 'rgba(255,200,90,.6)'); rad.addColorStop(1, 'rgba(255,160,40,0)');
  gx.fillStyle = rad; gx.fillRect(0, 0, 128, 128);
  gx.fillStyle = 'rgba(255,250,230,.9)'; gx.fillRect(62, 4, 4, 120); gx.fillRect(4, 62, 120, 4);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glint.renderOrder = 996; glint.scale.setScalar(.6);
  parent.add(glint);
  const pos = new THREE.Vector3(), body = new THREE.Vector3();
  const $ = (id) => document.getElementById(id);
  const card = $('quest'), word = $('quest-word'), fill = $('quest-fill'), arrow = $('quest-arrow'), depthEl = $('quest-depth');
  const WORDS = [[2, 'brûlant !!!'], [4, 'très chaud'], [7, 'chaud'], [11, 'tiède'], [16, 'froid'], [Infinity, 'glacial']];
  let t = 0, done = false, shown = false, last = {}, fly = 0;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const set = (k, v, f) => { if (last[k] !== v) { last[k] = v; f(v); } };

  return {
    pos,
    // the same spot for everyone on the same map: 1.3 to 2.3 m down, away from the fence
    place(seed) {
      let s = (seed ^ 0x6b65790a) | 0;
      const r = () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      const S = terrain.S, i = 8 + Math.floor(r() * 24), k = 8 + Math.floor(r() * 24);
      pos.set(terrain.X0 + (i + .5) * S, -(1.3 + r()), terrain.Z0 + (k + .5) * S);
      key.position.copy(pos); glint.position.copy(pos);
      key.rotation.set(0, r() * 6.28, .4);
    },
    setDone(on) { done = on; key.visible = glint.visible = !on; if (on) { card.classList.add('hidden'); shown = false; } },
    // a swing of the shovel that opens the ground round it, or the body brushing it
    hits: (c, r) => !done && c.distanceTo(pos) < r + .25,
    touches: (p) => !done && body.set(p.x, p.y + .9, p.z).distanceTo(pos) < .85,
    // picked up: the card flies off
    take() {
      done = true; glint.visible = false;
      key.visible = true; from.copy(key.position); fly = 1e-6;
      word.textContent = 'trouvée !'; fill.style.width = '100%'; card.classList.add('got');
      setTimeout(() => card.classList.add('out'), 700);
      setTimeout(() => { card.classList.add('hidden'); card.classList.remove('out', 'got'); shown = false; }, 1400);
    },
    update(dt, player, show) {
      t += dt;
      key.rotation.y += dt * (fly ? 9 : .8);
      if (fly) {
        // up from the ground to just in front of the eyes, then gone
        fly += dt / 1.1;
        camera.getWorldDirection(to); to.multiplyScalar(.7).add(camera.position); to.y -= .1;
        const k = 1 - Math.pow(1 - Math.min(1, fly), 3);
        key.position.lerpVectors(from, to, k);
        key.scale.setScalar(1.8 * (fly < .8 ? 1 : Math.max(0, 1 - (fly - .8) * 5)));
        if (fly >= 1) { fly = 0; key.visible = false; key.scale.setScalar(1.8); }
      }
      if (done) return;
      body.set(player.pos.x, player.pos.y + .9, player.pos.z);
      const d = body.distanceTo(pos);
      glint.material.opacity = Math.max(0, Math.min(.85, (3.2 - d) / 2)) * (.6 + .4 * Math.sin(t * 7));
      glint.scale.setScalar(.45 + .15 * Math.sin(t * 3));
      if (show !== shown) {
        shown = show;
        card.classList.toggle('hidden', !show);
        if (show) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
      }
      if (!show) return;
      const heat = Math.max(0, 1 - d / 16);
      set('w', WORDS.find(([m]) => d < m)[1], (v) => { word.textContent = v; });
      set('c', Math.round(heat * 40), (v) => { word.style.color = `hsl(${200 - v * 5}, 95%, ${60 + v * .2}%)`; card.style.setProperty('--heat', v / 40); });
      set('f', Math.round(heat * 100), (v) => { fill.style.width = v + '%'; });
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, flat = Math.hypot(dx, dz);
      const rel = Math.atan2(-dx, -dz) - player.yaw;
      set('a', flat < 1.2 ? 'down' : Math.round(rel * 30), (v) => { arrow.classList.toggle('down', v === 'down'); if (v !== 'down') arrow.style.transform = `rotate(${-v / 30}rad)`; });
      const dy = pos.y - player.pos.y;
      const txt = flat < 1.4 ? (dy < -.3 ? `juste en dessous · ${(-dy).toFixed(1)} m` : 'elle est là · creuse autour de toi')
        : `à ${Math.round(flat)} m d'ici · sous ~${Math.max(1, Math.round(-pos.y))} m de terre`;
      set('d', txt, (v) => { depthEl.textContent = v; });
      const lob = $('lobby');
      set('l', lob && !lob.classList.contains('hidden') ? lob.offsetHeight + 12 : 0, (v) => card.style.setProperty('--lift', v + 'px'));
    },
  };
}
