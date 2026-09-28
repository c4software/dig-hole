// boutiques.js, where clothes are sold and changed: a shop on the village square (inside one
// of its houses), a kimono shop in the Japanese town, a corner of each space hall on the moon
// and on mars, and at home a wardrobe corner with an armoire, a turntable and a real mirror.
// The shop people (clerks, window mannequins) are bodies from rig.js; the game animates them
// through PEOPLE while you're near.
import * as THREE from 'three';
import { createRig } from './rig.js';
import { DEFAULT, SHOPS } from './outfits.js';

export const PEOPLE = [];   // { rig, w, group, vis(), still }: the living ones get update()d
export const SPOTS = [];    // counters on the planets (not in world.interactables): { w, pos, shop }

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const B = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
function text(t, { w = 512, h = 128, bg = '#1a130c', color = '#ffd75e', size = 64, font = 'Georgia, serif', weight = 700 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(t, w / 2, h / 2 + 2);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return tx;
}
// someone working the counter, or a figure in the window
function person(parent, outfit, x, y, z, rot, w, { still = false, mannequin = false, vis = null, planet = false } = {}) {
  const rig = createRig(outfit, { lod: true, mannequin, planet });
  const g = new THREE.Group(); g.userData.keep = true;
  g.position.set(x, y, z); g.rotation.y = rot;
  g.add(rig.root); parent.add(g);
  rig.root.traverse(o => { o.userData.keep = true; });
  // everyone is listed (the try-on camera hides them); only the living ones get update()d
  if (still) rig.freeze();
  PEOPLE.push({ rig, w, group: g, vis, still });
  return rig;
}
// a window figure's stand: a round foot and a pole
function stand(parent, x, y, z, m) {
  const f = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, .06, 20), m); f.position.set(x, y + .03, z); parent.add(f);
}

// ---------- the village square: the shop inside one of the houses (interiors.js builders) ----------
export function europeBoutique(I, h, r, [d0, d1]) {
  const { X0, X1, Z0, Z1, y0 } = r;
  for (let x = X0 + .8; x < d0 - .5; x += 1.6) I.pane(h, r, 'front', x, 1.2, 1.2, 1.7);
  // the counter at the back, its till, shelves of folded jumpers behind
  I.counter(h, X0 + .4, X0 + 2.6, Z0 + 1.3, y0, I.WOOD_D, I.lit(0xe8dcc0, .4));
  I.till(h, X0 + 2.2, y0 + 1, Z0 + 1.3);
  const cloth = [0x1e2e5a, 0xf6f4ee, 0x9a2a3a, 0xc8b48a, 0x7a6a4e, 0x2a4a78, 0xe8b830, 0x6a3a22];
  I.shelves(h, r, 'back', X0 + 3, X1 - .2, 2.3, 4, cloth, I.WOOD);
  // a rail of coats and shirts along the right wall
  const rx = X1 - .45, za = Z0 + 2.2, zb = Z1 - 1.6;
  I.span(h, I.METAL, rx - .015, y0 + 1.62, za, rx + .015, y0 + 1.65, zb);
  for (const z of [za, zb]) I.span(h, I.METAL, rx - .02, y0, z - .02, rx + .02, y0 + 1.65, z + .02);
  let k = 0;
  for (let z = za + .15; z < zb - .1; z += .2) {
    const c = cloth[k++ % cloth.length], len = .6 + (k % 3) * .15;
    I.span(h, I.lit(c, .4), rx - .025, y0 + 1.58 - len, z - .08, rx + .025, y0 + 1.58, z + .08);
    I.span(h, I.lit(c, .4), rx - .2, y0 + 1.5 - len * .4, z - .01, rx + .2, y0 + 1.56, z + .01);
  }
  I.solid(h, rx - .3, y0, za, rx + .3, y0 + 1.7, zb);
  // a round table of folded things in the middle
  const tx = (X0 + X1) / 2 - .2, tz = (Z0 + Z1) / 2 + .3;
  I.cyl(h, .6, .75, I.WOOD_L, tx, y0 + .375, tz);
  for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; I.box(h, .26, .06 + (n % 2) * .05, .22, I.lit(cloth[n], .4), tx + Math.cos(a) * .32, y0 + .78 + (n % 2) * .025, tz + Math.sin(a) * .32); }
  I.solid(h, tx - .6, y0, tz - .6, tx + .6, y0 + .8, tz + .6);
  // a tall mirror on the left wall, a lamp, a rug
  I.span(h, I.GOLD, X0, y0 + .1, Z0 + 3.3, X0 + .04, y0 + 2.1, Z0 + 4.3);
  I.span(h, I.PANE, X0 + .04, y0 + .18, Z0 + 3.38, X0 + .05, y0 + 2.02, Z0 + 4.22);
  I.box(h, 1.6, .012, 2.4, I.lit(0x6a2a5a, .35), tx, y0 + .01, tz);
  I.lamp(h, tx, r.y1 - .4, tz, .3);
  // the people: the one who sells, two figures in the window
  const people = new THREE.Group(); people.userData.keep = true; h.add(people);
  const vis = () => h.userData.inner.g.visible;
  person(people, { ...DEFAULT, top: 'tweed', bottom: 'jupe', shoes: 'bottines', glasses: 'rondes', skin: 1, hair: 'chignon', hairC: 5 }, X0 + 1.4, y0, Z0 + .65, 0, 'home', { vis });
  for (const [x, o] of [[X0 + .9, { top: 'mariniere', bottom: 'chino', hat: 'beret', glasses: 'rondes', shoes: 'mocassins' }], [X0 + 2.05, { top: 'trench', bottom: 'jupe', hat: 'gibus', glasses: 'monocle', shoes: 'bottines' }]]) {
    stand(people, x, y0, Z1 - 1.05, I.WOOD_D);
    person(people, { ...DEFAULT, ...o }, x, y0 + .06, Z1 - 1.05, 0, 'home', { still: true, mannequin: true });
    I.solid(h, x - .3, y0, Z1 - 1.35, x + .3, y0 + 1.9, Z1 - .75);
  }
  h.updateMatrixWorld(true);
  return { id: 'boutique', shop: 'europe', pos: new THREE.Vector3(X0 + 1.5, y0 + 1, Z0 + 2.1).applyMatrix4(h.matrixWorld), reach: 2.6 };
}

// ---------- the Japanese town: a kimono shop of its own, north of the main street ----------
// origin: where the town's frame sits in the world; addBox takes the town's frame
export function japanBoutique({ parent, addBox, interactables, origin, sign }) {
  const g = new THREE.Group();
  const X = 84, Z = 26.7;
  g.position.set(X, 0, Z); g.rotation.y = Math.PI;      // its front (+z) faces the street (−z)
  parent.add(g);
  // a box in the shop's frame, turned into the town's frame for the colliders
  const solid = (x0, y0, z0, x1, y1, z1) => addBox(X - x1, y0, Z - z1, X - x0, y1, Z - z0);
  const W = 7, D = 6, H = 3.2, T = .15;
  const wood = lam(0x5a3a26), plaster = lam(0xf0e8d8), darkWood = lam(0x3a2418), tatami = lam(0xc8c088), paper = lam(0xfbf4e0, { emissive: 0xfff0d0, emissiveIntensity: .35 });
  const wall = (x0, y0, z0, x1, y1, z1, m = plaster, col = true) => { B(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, g); if (col) solid(x0, y0, z0, x1, y1, z1); };
  // walls, and the front round a doorway and two lattice windows
  wall(-W / 2, 0, -D / 2, W / 2, H, -D / 2 + T);
  wall(-W / 2, 0, -D / 2, -W / 2 + T, H, D / 2); wall(W / 2 - T, 0, -D / 2, W / 2, H, D / 2);
  const dw = .75, zf = D / 2 - T;
  wall(-W / 2, 0, zf, -dw, .8, D / 2, wood); wall(dw, 0, zf, W / 2, .8, D / 2, wood);
  wall(-W / 2, 2.25, zf, W / 2, H, D / 2, wood);
  for (const s of [-1, 1]) {
    // the window: paper panels behind a dark lattice (and a collider: you can't walk through it)
    const x0 = s < 0 ? -W / 2 : dw, x1 = s < 0 ? -dw : W / 2;
    B(x1 - x0, 1.45, .04, paper, (x0 + x1) / 2, 1.525, zf + .05, g);
    for (let x = x0 + .25; x < x1; x += .3) B(.035, 1.45, .06, darkWood, x, 1.525, zf + .08, g);
    for (const y of [1.0, 1.5, 2.0]) B(x1 - x0, .035, .06, darkWood, (x0 + x1) / 2, y, zf + .08, g);
    solid(x0, .8, zf, x1, 2.25, D / 2);
    // a red paper lantern either side of the door
    const lan = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), lam(0xd83a2a, { emissive: 0xd83a2a, emissiveIntensity: .45 }));
    lan.scale.set(1, 1.3, 1); lan.position.set(s * 1.25, 2.55, D / 2 + .25); g.add(lan);
    B(.2, .05, .2, darkWood, s * 1.25, 2.86, D / 2 + .25, g); B(.2, .05, .2, darkWood, s * 1.25, 2.24, D / 2 + .25, g);
  }
  // the noren over the doorway: three indigo panels with a white flower
  const noren = lam(0x1e2e5a, { side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) B(.46, .7, .01, noren, -.49 + k * .49, 1.9, D / 2 + .02, g);
  const mon = new THREE.Mesh(new THREE.CircleGeometry(.12, 5), lam(0xf4f0e6, { side: THREE.DoubleSide })); mon.position.set(0, 1.95, D / 2 + .03); g.add(mon);
  // the name board
  const nameTex = sign('きもの · 桜屋', { w: 1024, h: 192, bg: '#2a1a12', color: '#f2d78a', size: 110 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .64), lam(0xffffff, { map: nameTex, emissive: 0xffffff, emissiveMap: nameTex, emissiveIntensity: .2 }));
  board.position.set(0, 2.72, D / 2 + .09); g.add(board);
  // a floor of tatami, a ceiling, a roof of dark tiles with deep eaves
  B(W - 2 * T, .04, D - 2 * T, tatami, 0, .02, 0, g);
  for (let x = -W / 2 + T + .9; x < W / 2; x += .9) B(.025, .045, D - 2 * T, darkWood, x, .022, 0, g);
  B(W, .12, D, wood, 0, H + .06, 0, g);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), lam(0x3a4150));
  roof.rotation.y = Math.PI / 4; roof.scale.set((W + 1.6) * .72, 1.7, (D + 1.6) * .72); roof.position.set(0, H + .12 + .85, 0); g.add(roof);
  B(W + 1.4, .1, D + 1.4, lam(0x2f343c), 0, H + .15, 0, g);
  solid(-W / 2 - .7, H, -D / 2 - .7, W / 2 + .7, H + 2, D / 2 + .7);
  // inside: the counter at the back with its lady, kimonos spread on stands, bolts of cloth
  B(2.4, .9, .6, darkWood, -1.6, .45, -1.9, g); B(2.5, .05, .7, wood, -1.6, .92, -1.9, g);
  solid(-2.85, 0, -2.25, -.35, .95, -1.55);
  const bolts = [0xd83a2a, 0x2a3a78, 0xe0b040, 0xf4b8cc, 0x3a7a4a, 0xf4f0e6, 0x5a8ad0, 0x8a2a5a];
  B(2.6, 2.2, .35, wood, 1.8, 1.1, -2.65, g); solid(.5, 0, -2.85, 3.1, 2.2, -2.45);
  for (let r = 0; r < 4; r++) for (let n = 0; n < 7; n++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .3, 10), lam(bolts[(n + r * 3) % bolts.length]));
    c.rotation.z = Math.PI / 2; c.position.set(.8 + n * .34, .35 + r * .5, -2.45); g.add(c);
  }
  // kimonos hung open on their T stands, sleeves out
  for (const [x, c, c2] of [[-2.7, 0xd83a2a, 0xe0b040], [2.9, 0x2a6a5a, 0xf4f0e6]]) {
    B(.04, 1.8, .04, darkWood, x, .9, .2, g); B(1.3, .04, .04, darkWood, x, 1.75, .2, g);
    const k = B(.04, 1.35, .6, lam(c), x, 1.05, .2, g); k.rotation.y = Math.PI / 2;
    const sl = B(.04, .45, 1.25, lam(c), x, 1.5, .2, g); sl.rotation.y = Math.PI / 2;
    const obi = B(.045, .14, .62, lam(c2), x, 1.18, .2, g); obi.rotation.y = Math.PI / 2;
    solid(x - .35, 0, 0, x + .35, 1.8, .4);
  }
  // a mirror by the side wall
  B(.05, 1.8, .7, darkWood, W / 2 - T - .03, .95, 1.3, g);
  B(.02, 1.65, .58, lam(0xcfe4f0, { emissive: 0x6a8aa0, emissiveIntensity: .5 }), W / 2 - T - .06, .95, 1.3, g);
  const light = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 12), paper); light.scale.y = 1.3; light.position.set(0, H - .45, 0); g.add(light);
  // the people
  const people = new THREE.Group(); people.userData.keep = true; g.add(people);
  person(people, { ...DEFAULT, top: 'kimono', bottom: 'hakama', shoes: 'tabi', skin: 0, hair: 'chignon', hairC: 1 }, -1.6, 0, -2.45, 0, 'china');
  for (const [x, o] of [[-1.1, { top: 'yukata', hat: 'kasa', shoes: 'geta' }], [1.2, { top: 'happi', bottom: 'hakama', hat: 'hachimaki', glasses: 'kitsune', shoes: 'tabi' }]]) {
    stand(people, x, 0, 1.6, darkWood);
    person(people, { ...DEFAULT, ...o }, x, .06, 1.6, 0, 'china', { still: true, mannequin: true });
    solid(x - .3, 0, 1.3, x + .3, 1.9, 1.9);
  }
  // in front of the counter, in the world (the shop is turned half round in the town's frame)
  const pos = new THREE.Vector3(X + 1.6, 1, Z + 1.2).add(origin);
  const it = { id: 'boutique', shop: 'japon', pos, reach: 2.4 };
  interactables.push(it);
  return it;
}

// ---------- the space halls: a corner of clothes by the left wall ----------
const SPACE = {
  moon: { shop: 'lune', clerk: { ...DEFAULT, top: 'lunesuit', shoes: 'lunebottes', skin: 2, hair: 'queue', hairC: 4 }, mann: { top: 'lunesuit', hat: 'casque', shoes: 'lunebottes', glasses: 'visiere' }, rack: [0xf0eee8, 0x1e2a58, 0xf0eee8, 0xd9a125, 0xe8e8ee], neon: '#5ad8ff' },
  mars: { shop: 'mars', clerk: { ...DEFAULT, top: 'marssuit', bottom: 'cargo', shoes: 'marsbottes', hat: 'antennes', skinHex: 0x7ad06a, hair: 'rase' }, mann: { top: 'marssuit', hat: 'dome', shoes: 'marsbottes', glasses: 'masque' }, rack: [0xc84a2a, 0x8a5a3a, 0xc84a2a, 0x3a3a40, 0xe0702a], neon: '#ff8a3a' },
};
// in the hall's frame (see spacearcade.js): its left wall is at x = −5.5, the door at +z
export function spaceBoutique(w, group) {
  const S = SPACE[w];
  for (let i = PEOPLE.length - 1; i >= 0; i--) if (PEOPLE[i].w === w) PEOPLE.splice(i, 1);
  for (let i = SPOTS.length - 1; i >= 0; i--) if (SPOTS[i].w === w) SPOTS.splice(i, 1);
  const g = new THREE.Group(); group.add(g);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: .4, metalness: .6 });
  const sb = (wd, h, d, m, x, y, z) => { const o = B(wd, h, d, m, x, y, z, g); o.userData.solid = true; return o; };
  // the rack of suits
  B(.04, .04, 1.8, metal, -5.15, 1.7, -1.5, g);
  for (const z of [-2.4, -.6]) B(.04, 1.7, .04, metal, -5.15, .85, z, g);
  S.rack.forEach((c, n) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: .7 });
    B(.3, .9, .12, m, -5.15, 1.2, -2.15 + n * .36, g);
    B(.06, .55, .12, m, -5.15, .5, -2.15 + n * .36 - .07, g); B(.06, .55, .12, m, -5.15, .5, -2.15 + n * .36 + .07, g);
  });
  sb(.5, 1.75, 1.9, new THREE.MeshBasicMaterial({ visible: false }), -5.15, .88, -1.5);
  // the counter, lit from under its top
  sb(.6, 1, 1.1, new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: .5 }), -4.45, .5, .7);
  B(.62, .04, 1.12, new THREE.MeshBasicMaterial({ color: new THREE.Color(S.neon).multiplyScalar(1.6) }), -4.45, 1.0, .7, g);
  // a sign on the wall
  const tex = text(SHOPS[S.shop].sign, { w: 512, h: 110, bg: '#10101a', color: S.neon, size: 54, font: '"Titan One", Rubik, sans-serif', weight: 400 });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .47), new THREE.MeshBasicMaterial({ map: tex }));
  sg.rotation.y = Math.PI / 2; sg.position.set(-5.48, 2.75, .7); g.add(sg);
  // the clerk, a figure on a stand in the full kit
  person(g, S.clerk, -5.05, 0, .7, Math.PI / 2, w);
  stand(g, -4.75, 0, 3.0, metal);
  person(g, { ...DEFAULT, ...S.mann }, -4.75, .06, 3.0, Math.PI / 2, w, { still: true, mannequin: true });
  sb(.6, 1.9, .6, new THREE.MeshBasicMaterial({ visible: false }), -4.75, .95, 3.0);
  group.updateMatrixWorld(true);
  SPOTS.push({ w, shop: S.shop, pos: new THREE.Vector3(-3.9, 1, .7).applyMatrix4(group.matrixWorld), reach: 1.9 });
}

// ---------- the mirror: the room's reflection is a small scene of its own ----------
// Only the bodies (and a plain room round them) are seen in it, which keeps it cheap: the real
// world isn't drawn twice. The texture is projected as seen from the eye (a Reflector, simplified).
function createMirror(w, h, backdrop) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a50, 1.7));
  const sun = new THREE.DirectionalLight(0xffe8c8, 1.4); sun.position.set(3, 4, 2); scene.add(sun);
  scene.add(backdrop);
  const rt = new THREE.WebGLRenderTarget(320, Math.round(320 * h / w), { samples: 4 });
  const tm = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: tm }, tint: { value: new THREE.Color(.92, .96, 1) } },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec3 tint; varying vec4 vUv;\n#include <logdepthbuf_pars_fragment>\nvoid main() {\n#include <logdepthbuf_fragment>\nvec4 base = texture2DProj(tDiffuse, vUv); gl_FragColor = vec4(base.rgb * tint + vec3(.02, .025, .03), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const vcam = new THREE.PerspectiveCamera();
  const P = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), V = new THREE.Vector3(), L = new THREE.Vector3(), Tg = new THREE.Vector3(), R = new THREE.Matrix4();
  const m = { mesh, scene, on: false };
  mesh.onBeforeRender = (renderer, _s, camera) => {
    if (!m.on) return;
    P.setFromMatrixPosition(mesh.matrixWorld); C.setFromMatrixPosition(camera.matrixWorld);
    R.extractRotation(mesh.matrixWorld); N.set(0, 0, 1).applyMatrix4(R);
    V.subVectors(P, C);
    if (V.dot(N) > 0) return;
    V.reflect(N).negate().add(P);
    R.extractRotation(camera.matrixWorld);
    L.set(0, 0, -1).applyMatrix4(R).add(C);
    Tg.subVectors(P, L).reflect(N).negate().add(P);
    vcam.position.copy(V);
    vcam.up.set(0, 1, 0).applyMatrix4(R).reflect(N);
    vcam.lookAt(Tg);
    vcam.near = camera.near; vcam.far = 40;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    tm.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mesh.matrixWorld);
    const was = renderer.getRenderTarget(), xr = renderer.xr.enabled, sh = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    mesh.visible = false;
    renderer.render(scene, vcam);
    mesh.visible = true;
    renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sh;
    renderer.setRenderTarget(was);
    if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
  };
  return m;
}

// ---------- the wardrobe corner at home (house.js): an armoire, a turntable, the mirror ----------
export function buildWardrobe({ g, addBox, interactables, label }) {
  const WX = -5.3;                       // the left wall's inside face
  const walnut = lam(0x6a4428), dark = lam(0x4a2e1a), brass = lam(0xd9a125);
  // the armoire: two doors, a crown, brass knobs
  const A = new THREE.Group(); A.position.set(WX + .29, 0, -19.02); g.add(A);
  B(.58, 2.05, .85, walnut, 0, 1.08, 0, A); B(.64, .08, .92, dark, 0, 2.14, 0, A); B(.62, .1, .88, dark, 0, .05, 0, A);
  for (const s of [-1, 1]) { B(.02, 1.8, .4, lam(0x7a5232), .3, 1.1, s * .205, A); const kb = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), brass); kb.position.set(.32, 1.1, s * .04); A.add(kb); }
  B(.02, 1.8, .012, dark, .305, 1.1, 0, A);
  addBox(WX, 0, -19.45, WX + .58, 2.2, -18.6);
  if (label) { const lb = new THREE.Mesh(new THREE.PlaneGeometry(.6, .2), new THREE.MeshBasicMaterial({ map: label('vestiaire', { color: '#ffd75e', bg: '#1a130c', size: 90 }) })); lb.rotation.y = Math.PI / 2; lb.position.set(.31, 1.85, 0); A.add(lb); }
  // the mirror on the wall, in a gilded frame
  const MZ = -18.19, MW = .52, MH = 1.72, MY = 1.08;
  const fr = lam(0xc8a050);
  for (const s of [-1, 1]) { B(.04, MH + .08, .05, fr, WX + .02, MY, MZ + s * (MW / 2 + .02), g); B(.04, .05, MW + .08, fr, WX + .02, MY + s * (MH / 2 + .02), MZ, g); }
  // what the mirror sees: a plain version of the room (floor, walls, the rug) round the bodies in it
  const room = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(10.6, 3.4, 6.6), lam(0xf3ead6, { side: THREE.BackSide })); walls.position.set(0, 1.7, -18.5); room.add(walls);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 6.6), lam(0x8a5a36)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, .012, -18.5); room.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), lam(0x7a2a24)); rug.rotation.x = -Math.PI / 2; rug.position.set(-1.6, .02, -18.2); rug.scale.set(1.3, 1, 1); room.add(rug);
  for (const [w, h, d, c, x, y, z] of [[.55, 1.5, .45, 0x2a2d33, 5, .75, -17], [.8, .95, 2, 0x9a7248, 4.85, .48, -19.3], [1.6, 1.7, .35, 0x7a5530, 4, .85, -21.6], [1.2, .9, 2.1, 0x3b4a6b, -4.4, .45, -20.6], [.58, 2.05, .85, 0x6a4428, WX + .29, 1.02, -19.02]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); b.position.set(x, y, z); room.add(b);
  }
  const mirror = createMirror(MW, MH, room);
  mirror.mesh.rotation.y = Math.PI / 2; mirror.mesh.position.set(WX + .012, MY, MZ);
  g.add(mirror.mesh);
  // the turntable in front of it, where you stand to try things on
  const DAIS = new THREE.Vector3(WX + .68, 0, MZ);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.38, .4, .05, 32), lam(0x8a2a24)); top.position.set(DAIS.x, .025, DAIS.z); g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.39, .012, 6, 40), brass); ring.rotation.x = Math.PI / 2; ring.position.set(DAIS.x, .05, DAIS.z); g.add(ring);
  interactables.push({ id: 'wardrobe', pos: new THREE.Vector3(WX + .45, 1.1, -18.75), reach: 2.4 });
  return { mirror, dais: DAIS, mirrorPos: new THREE.Vector3(WX, MY, MZ), turntable: top };
}
