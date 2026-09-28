// crypt.js, what lies under the church. In the west aisle, the tomb of « messire lombric », a stone
// knight lying on his slab: « au jour de colère, je m'ouvrirai ». Play the Dies irae on the organ and
// the slab slides away over a stair down to the crypt, a vaulted hall under the nave with a table
// where an island waits (lombrics 3D) and an iron door that burns. The ground all round is the
// church's own: dig it and find the ossuary, the templar's tomb and its ghost, the monks' cellar,
// the bell that fell from the tower in 1432, and a sealed room whose three stone dials want the
// right signs.
import * as THREE from 'three';
import { S, addTheme } from './terrain.js';
import { FIND } from './finds.js';
import { ACH_LIST } from './house.js';
import { islandModel } from './worms3d-land.js';

// the church's ground: 16 m square under the nave, 16 m deep
export const DIG = { x0: 53, x1: 69, z0: 19, z1: 35, ox: 61, oz: 27 };
export const inChurchDig = (p) => p.x > DIG.x0 && p.x < DIG.x1 && p.z > DIG.z0 && p.z < DIG.z1 && p.y < 3;
const FOUND = 116, CEMETERY = 117, FILL = 118, TUFA = 119, ROCK = 120, MASON = 121, RUBBLE = 122;
const BONES = 70, COINS = 71, ROSARY = 72, GLASS = 73;
const HALL = { x0: 57, x1: 65, y0: -7.2, y1: -3.2, z0: 22.2, z1: 31.8 };
const ROOMS = {
  ossuary: { x0: 53.4, x1: 56.4, y0: -7.2, y1: -5.2, z0: 19.4, z1: 23 },
  knight: { x0: 65.8, x1: 68.6, y0: -7.2, y1: -4.8, z0: 28.6, z1: 33 },
  cellar: { x0: 58, x1: 64, y0: -7.2, y1: -5.4, z0: 19.4, z1: 21.4 },
  bell: { x0: 60, x1: 62.4, y0: -12.4, y1: -10, z0: 19.8, z1: 22.2 },
  vault: { x0: 59, x1: 63, y0: -7.2, y1: -5, z0: 32.6, z1: 34.8 },
};
// the sealed room's door, in cells of the church's ground
const DOOR = { i: 18, j: 22, k: 32, w: 4, h: 5, d: 2 };
const STAIR = { x0: 57, x1: 58.2, z0: 25.2, n: 12, rise: .3, run: .35 };
const TOMB = { x: 56.5, z: 26 };
export const CRYPT_ENTRY = new THREE.Vector3(58.7, HALL.y0, 23.4);
const SIGNS = ['la croix', 'le crâne', 'la clé', 'la colombe'];
const ANSWER = [0, 1, 2];

addTheme('church', {
  n: 40, ny: 40, grass: FOUND, chamber: false, water: 0, caves: false, core: false, letters: [],
  layers: [
    { id: FOUND, name: 'fondations de l\'église', sub: 'on ne touche pas à ça', to: .8, hard: 99, color: 0xb8ac98 },
    { id: CEMETERY, name: 'terre du cimetière', sub: 'noire, pleine de choses', to: 5, hard: 1, color: 0x4e3a2a },
    { id: FILL, name: 'remblai', sub: 'les moines ont creusé avant toi', to: 10, hard: 1, color: 0x7a6248 },
    { id: TUFA, name: 'tuffeau', sub: 'la pierre blanche des cathédrales', to: 14, hard: 2, color: 0xd8cfb4 },
    { id: ROCK, name: 'roche', sub: 'le socle du village', to: 16, hard: 3, color: 0x77746f },
  ],
  ores: [
    { id: BONES, name: 'ossements', value: 6, min: 1, max: 12, w: 6, color: 0xeee4c8 },
    { id: COINS, name: 'denier d\'argent', value: 45, min: 2, max: 14, w: 2.5, color: 0xc8ccd4 },
    { id: GLASS, name: 'éclat de vitrail', value: 25, min: .8, max: 6, w: 2.5, color: 0x3a8ae8 },
    { id: ROSARY, name: 'chapelet', value: 90, min: 4, max: 14, w: 1, color: 0x9a3a4a },
  ],
  post: carveRooms,
}, { [MASON]: 0x8e8578, [RUBBLE]: 0xa89c88 });

// ---------- the rooms, cut when the ground is made ----------
const X0 = DIG.ox - 20 * S, Z0 = DIG.oz - 20 * S, Y0 = -40 * S;
const cellC = (i, j, k) => [X0 + (i + .5) * S, Y0 + (j + .5) * S, Z0 + (k + .5) * S];
function carveRooms({ vox, hardOf, idx, NX, NY, NZ }) {
  const lo = (v, o, n) => Math.max(0, Math.floor((v - o) / S) - 1), hi = (v, o, n) => Math.min(n - 1, Math.ceil((v - o) / S) + 1);
  const each = (b, pad, f) => {
    for (let j = Math.max(1, lo(b.y0 - pad, Y0)); j <= Math.min(NY - 3, hi(b.y1 + pad, Y0, NY)); j++) for (let k = lo(b.z0 - pad, Z0); k <= hi(b.z1 + pad, Z0, NZ); k++) for (let i = lo(b.x0 - pad, X0); i <= hi(b.x1 + pad, X0, NX); i++) {
      const [x, y, z] = cellC(i, j, k);
      if (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad && z > b.z0 - pad && z < b.z1 + pad) f(idx(i, j, k), x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1, y < b.y0);
    }
  };
  const set = (n, m, h) => { vox[n] = m; hardOf[n] = h; };
  // the crypt: old rubble walls you can dig through, a paved floor you can't, a shaft up to the tomb
  each(HALL, .45, (n, inside, below) => set(n, inside ? 0 : below ? MASON : RUBBLE, inside ? 0 : below ? 99 : 1));
  each({ x0: STAIR.x0, x1: STAIR.x1, y0: HALL.y1 - .1, y1: -1, z0: 27.4, z1: 29.6 }, 0, (n, inside) => { if (inside) set(n, 0, 0); });
  // the ossuary: walls of bones
  each(ROOMS.ossuary, .45, (n, inside) => set(n, inside ? 0 : BONES, inside ? 0 : 1));
  for (const r of [ROOMS.knight, ROOMS.cellar]) each(r, .45, (n, inside, below) => set(n, inside ? 0 : below ? MASON : RUBBLE, inside ? 0 : below ? 99 : 1));
  each(ROOMS.bell, 0, (n, inside) => { if (inside) set(n, 0, 0); });
  // the sealed room: masonry nothing goes through, but its door
  each(ROOMS.vault, .85, (n, inside) => set(n, inside ? 0 : MASON, inside ? 0 : 99));
  for (let j = DOOR.j; j < DOOR.j + DOOR.h; j++) for (let k = DOOR.k; k < DOOR.k + DOOR.d; k++) for (let i = DOOR.i; i < DOOR.i + DOOR.w; i++) set(idx(i, j, k), MASON, 99);
}

// ---------- what's hidden: finds of the church ----------
Object.assign(FIND, {
  fiacre: { name: 'reliquaire de saint fiacre', kind: 'sack', value: 1600, quip: 'le reliquaire de saint fiacre, patron des jardiniers. il veille sur ton trou.' },
  epee: { name: 'épée du templier', kind: 'sack', value: 2200, quip: 'l\'épée du templier. elle est encore froide.' },
  heaume: { name: 'heaume du templier', kind: 'sack', value: 1400, quip: 'un heaume cabossé. quelqu\'un a tapé fort, un jour.' },
  vin: { name: 'vin de messe 1789', kind: 'sack', value: 180, quip: 'vin de messe, 1789. une bonne année, paraît-il.' },
  cloche: { name: 'cloche de 1432', kind: 'sack', value: 3000, quip: 'la cloche tombée du clocher en 1432. on la cherchait depuis.' },
  croix: { name: 'croix des templiers', kind: 'sack', value: 4000, quip: 'la croix des templiers. le trésor était donc vrai.' },
  tresor: { name: 'trésor des templiers', kind: 'coins', coins: 5000, value: 0, quip: 'le trésor des templiers ! des pièces d\'or à ne plus savoir qu\'en faire.' },
});
for (const a of [['crypte', 'la crypte sous la nef'], ['ossuaire', 'l\'ossuaire'], ['templier', 'le tombeau du templier'], ['templiers', 'le trésor des templiers'], ['cloche', 'la cloche perdue'], ['lombrics', 'vainqueur de lombrics 3D']])
  if (!ACH_LIST.some(x => x[0] === a[0])) ACH_LIST.push(a);

const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
const glow = (c, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const rnd = (() => { let s = 1432; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();

export function createCrypt({ scene, colliders, interactables, terrain, eco, ui, audio, organ, songs, hooks }) {
  const g = new THREE.Group(); scene.add(g);
  terrain.group.position.y = -.06;   // its lid stays under the church's flagstones
  const addBox = (x0, y0, z0, x1, y1, z1) => { const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }; colliders.push(c); return c; };
  const box = (w, h, d, m, x, y, z, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  const stone = L(0xa89c88), dark = L(0x4a4038), black = new THREE.MeshBasicMaterial({ color: 0x050403 }), bone = L(0xeee4c8), iron = L(0x2a2624), wood = L(0x6a4a2e), gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .3, emissive: 0x2a1a00 });
  const flame = glow(0xff9030, 2.4);
  const s = eco.s;
  s.crypt = Object.assign({ open: false, seen: false, dials: [3, 3, 3], vault: false, ghost: false, bones: false, pushes: 0 }, s.crypt);

  // ---------- up in the nave: the tomb of messire lombric ----------
  const tomb = new THREE.Group(); tomb.position.set(TOMB.x, 0, TOMB.z); g.add(tomb);
  const tStone = L(0xcfc4ae, 0x1a160e), tDark = L(0x8a8070);
  for (const [w, d, x, z] of [[.7, .08, 0, -.96], [.7, .08, 0, .96], [.08, 2, -.31, 0], [.08, 2, .31, 0]]) box(w, .55, d, tStone, x, .275, z, tomb);
  box(.54, .02, 1.84, black, 0, .02, 0, tomb);
  for (let n = 0; n < 4; n++) box(.5, .05, .3, dark, 0, .45 - n * .12, -.7 + n * .3, tomb);
  // the slab and the knight lying on it, hands joined on his sword
  const slab = new THREE.Group(); slab.position.y = .55; tomb.add(slab);
  box(.76, .08, 2.08, tStone, 0, .04, 0, slab);
  box(.3, .14, 1.2, tDark, 0, .15, .1, slab);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), tDark); head.position.set(0, .18, -.72); slab.add(head);
  box(.24, .06, .1, tDark, 0, .12, -.86, slab);
  box(.03, .02, .9, L(0xb0a898), 0, .235, .25, slab); box(.16, .02, .03, L(0xb0a898), 0, .235, -.18, slab);
  for (const sx of [-.07, .07]) box(.08, .1, .12, tDark, sx, .13, .72, slab);
  // on the side facing the aisle: the inscription, a worm carved in the corner
  const insc = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .4), new THREE.MeshLambertMaterial({ transparent: true, map: tex(512, 120, (c, w, h) => {
    c.fillStyle = 'rgba(60,50,38,.85)'; c.font = 'italic 30px Georgia, serif'; c.textAlign = 'center';
    c.fillText('ci-gît messire lombric', w / 2, 40); c.font = 'italic 24px Georgia, serif'; c.fillText('au jour de colère, je m\'ouvrirai', w / 2, 86);
    c.strokeStyle = 'rgba(60,50,38,.8)'; c.lineWidth = 5; c.beginPath(); c.moveTo(20, 100); c.bezierCurveTo(40, 80, 50, 118, 70, 96); c.stroke();
  }) }));
  insc.position.set(.315, .3, 0); insc.rotation.y = Math.PI / 2; tomb.add(insc);
  addBox(TOMB.x - .38, 0, TOMB.z - 1.04, TOMB.x + .38, .8, TOMB.z + 1.04);
  interactables.push({ id: 'gisant', pos: new THREE.Vector3(TOMB.x + .2, .7, TOMB.z), reach: 1.8 });
  // a cold breath from the crack, once you're close
  const draft = [];
  for (let n = 0; n < 8; n++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0, depthWrite: false })); tomb.add(p); draft.push({ p, t: n / 8 }); }

  // ---------- the crypt ----------
  const H = HALL, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, fy = H.y0;
  const flags = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.z1 - H.z0), new THREE.MeshLambertMaterial({ color: 0x9a8e7c, map: tex(256, 256, (c, w, h) => {
    c.fillStyle = '#3a322c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 110 + rnd() * 40, o = (y % 2) * 32; c.fillStyle = `rgb(${v},${v - 8},${v - 20})`; c.fillRect(x * 64 + o + 3, y * 64 + 3, 58, 58); }
  }) }));
  flags.material.map.wrapS = flags.material.map.wrapT = THREE.RepeatWrapping; flags.material.map.repeat.set(4, 5);
  flags.rotation.x = -Math.PI / 2; flags.position.set(cx, fy + .02, cz); g.add(flags);
  // pillars and ribs
  for (const px of [59.5, 62.5]) for (const pz of [25, 29]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, H.y1 - H.y0, 10), stone); p.position.set(px, fy + (H.y1 - H.y0) / 2, pz); g.add(p);
    box(.7, .25, .7, stone, px, fy + .12, pz); box(.64, .2, .64, stone, px, H.y1 - .1, pz);
    addBox(px - .32, fy, pz - .32, px + .32, H.y1, pz + .32);
    // a candle on each, the only light down here
    box(.1, .2, .1, L(0xf2ead8), px + .3, fy + 1.9, pz); const f = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 6), flame); f.position.set(px + .3, fy + 2.06, pz); f.userData.flame = 1; g.add(f);
    box(.14, .04, .14, iron, px + .3, fy + 1.79, pz);
  }
  for (const pz of [25, 29]) box(H.x1 - H.x0, .2, .3, dark, cx, H.y1 - .1, pz);
  // the stair up to the tomb
  for (let n = 0; n < STAIR.n; n++) {
    const z0 = STAIR.z0 + n * STAIR.run, top = fy + (n + 1) * STAIR.rise;
    box(STAIR.x1 - STAIR.x0, top - fy, STAIR.run, stone, (STAIR.x0 + STAIR.x1) / 2, (top + fy) / 2, z0 + STAIR.run / 2);
    addBox(STAIR.x0, fy, z0, STAIR.x1, top, z0 + STAIR.run);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.5, 1.2, 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.set(57.6, -3, 28.6); g.add(shaft);
  interactables.push({ id: 'cryptup', pos: new THREE.Vector3(58.6, fy + 1.1, 25), reach: 1.8 });
  // graves along the south wall, a skull or two
  for (let n = 0; n < 4; n++) {
    const gx = 59.2 + n * 1.5;
    box(.5, .7, .12, stone, gx, fy + .35, 22.45); box(.3, .06, .02, dark, gx, fy + .55, 22.52);
  }
  const skullGeo = new THREE.SphereGeometry(.09, 8, 6);
  // the table and its island
  const table = new THREE.Group(); table.position.set(cx, fy, cz); g.add(table);
  box(2, .12, 1.5, wood, 0, .86, 0, table);
  for (const [x, z] of [[-.88, -.62], [.88, -.62], [-.88, .62], [.88, .62]]) box(.12, .86, .12, wood, x, .43, z, table);
  box(2.1, .04, 1.6, L(0x2a5a3a), 0, .93, 0, table);
  addBox(cx - 1.05, fy, cz - .8, cx + 1.05, fy + .95, cz + .8);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.9, .22), new THREE.MeshBasicMaterial({ map: tex(512, 128, (c, w, h) => {
    c.fillStyle = '#2a1a0c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9a125'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#f2d78a'; c.font = '64px "Titan One", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('lombrics 3D', w / 2, h / 2 + 4);
  }) }));
  plate.position.set(0, .8, -.76); plate.rotation.y = Math.PI; table.add(plate);
  let island = null;
  interactables.push({ id: 'mg:worms3d', game: 'worms3d', pos: new THREE.Vector3(cx, fy + 1.1, cz - .9), reach: 2 });
  // the iron door that burns (painkiller, when it's there)
  const pk = new THREE.Group(); pk.position.set(H.x1 - .02, fy, 27); pk.rotation.y = -Math.PI / 2; g.add(pk);
  box(1.8, 2.6, .12, L(0x3a3634), 0, 1.3, -.06, pk);
  box(1.4, 2.3, .06, L(0x1e1a18, 0x200400), 0, 1.15, .02, pk);
  for (const y of [.5, 1.2, 1.9]) box(1.45, .08, .04, iron, 0, y, .06, pk);
  const cracks = glow(0xff3a10, 1.6);
  for (let n = 0; n < 7; n++) { const c = box(.02, .3 + rnd() * .5, .01, cracks, -.55 + n * .18, .4 + rnd() * 1.6, .09, pk); c.rotation.z = (rnd() - .5) * .8; }
  const pkSkulls = [];
  for (const x of [-.6, .6]) { const k = new THREE.Mesh(skullGeo, bone); k.position.set(x, 2.45, .1); k.scale.set(1.3, 1.2, 1.2); pk.add(k); pkSkulls.push(k); }
  const pkGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .4), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }));
  pkGlow.position.set(0, .12, .2); pkGlow.rotation.x = -Math.PI / 2; pk.add(pkGlow);
  interactables.push({ id: 'pkdoor', pos: new THREE.Vector3(H.x1 - .5, fy + 1.2, 27), reach: 1.8 });

  // ---------- the sealed room's door: three stone dials ----------
  const door = new THREE.Group(); door.position.set(61, fy, H.z1 - .01); door.rotation.y = Math.PI; g.add(door);
  const leaf = new THREE.Group(); door.add(leaf);
  box(1.6, 2, .16, L(0x8e8578), 0, 1, .08, leaf);
  box(1.8, .2, .2, stone, 0, 2.1, .1, door);
  const signTex = SIGNS.map((_, k) => tex(128, 128, (c, w) => {
    c.fillStyle = '#d8cfb4'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#4a4038'; c.lineWidth = 6; c.stroke();
    c.fillStyle = '#3a322a'; c.strokeStyle = '#3a322a'; c.lineWidth = 10; c.lineCap = 'round';
    if (k === 0) { c.fillRect(56, 26, 16, 76); c.fillRect(36, 46, 56, 16); }
    else if (k === 1) { c.beginPath(); c.arc(64, 56, 28, 0, 7); c.fill(); c.fillRect(46, 70, 36, 22); c.fillStyle = '#d8cfb4'; c.beginPath(); c.arc(53, 56, 8, 0, 7); c.arc(75, 56, 8, 0, 7); c.fill(); }
    else if (k === 2) { c.lineWidth = 9; c.beginPath(); c.arc(44, 64, 16, 0, 7); c.stroke(); c.beginPath(); c.moveTo(60, 64); c.lineTo(100, 64); c.moveTo(88, 64); c.lineTo(88, 80); c.moveTo(98, 64); c.lineTo(98, 78); c.stroke(); }
    else { c.beginPath(); c.ellipse(64, 66, 30, 16, -.3, 0, 7); c.fill(); c.beginPath(); c.moveTo(60, 60); c.lineTo(30, 36); c.lineTo(52, 70); c.fill(); c.beginPath(); c.arc(90, 52, 10, 0, 7); c.fill(); }
  }));
  const dials = [0, 1, 2].map(n => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .06, 20), [L(0x8e8578), new THREE.MeshLambertMaterial({ map: signTex[s.crypt.dials[n]] }), L(0x8e8578)]);
    d.rotation.x = Math.PI / 2; d.position.set(-.45 + n * .45, 1.25, .19); leaf.add(d);
    interactables.push({ id: 'cdial' + n, pos: new THREE.Vector3(61 + .45 - n * .45, fy + 1.25, H.z1 - .25), reach: 1.4, aim: .96 });
    return d;
  });
  const doorNote = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .22), new THREE.MeshLambertMaterial({ transparent: true, map: tex(512, 96, (c, w) => { c.fillStyle = 'rgba(50,42,34,.9)'; c.font = 'italic 34px Georgia, serif'; c.textAlign = 'center'; c.fillText('ce que les morts ont gravé', w / 2, 58); }) }));
  doorNote.position.set(0, 1.7, .17); leaf.add(doorNote);
  let doorT = s.crypt.vault ? 1 : 0;
  leaf.position.y = doorT * 2.05;
  const setDial = (n) => { dials[n].material[1].map = signTex[s.crypt.dials[n]]; dials[n].material[1].needsUpdate = true; };

  // ---------- inside the rooms ----------
  // the ossuary: skulls stacked along the walls
  const O = ROOMS.ossuary;
  const skulls = new THREE.InstancedMesh(skullGeo, bone, 60), dm = new THREE.Object3D();
  for (let n = 0; n < 60; n++) {
    const side = n % 3, a = rnd();
    const x = side === 0 ? O.x0 + .15 : side === 1 ? O.x0 + .3 + a * (O.x1 - O.x0 - .6) : O.x1 - .15;
    const z = side === 1 ? O.z0 + .15 : O.z0 + .4 + a * (O.z1 - O.z0 - .8);
    dm.position.set(x, O.y0 + .1 + Math.floor(rnd() * 5) * .2, z); dm.rotation.set(0, rnd() * 6, 0); dm.scale.set(1.2, 1.1, 1.3); dm.updateMatrix();
    skulls.setMatrixAt(n, dm.matrix);
  }
  g.add(skulls);
  const ossNote = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .5), new THREE.MeshLambertMaterial({ transparent: true, map: tex(512, 180, (c, w) => {
    c.fillStyle = 'rgba(40,32,24,.9)'; c.font = 'italic 32px Georgia, serif'; c.textAlign = 'center';
    c.fillText('d\'abord la croix,', w / 2, 50); c.fillText('puis le crâne,', w / 2, 95); c.fillText('enfin la clé', w / 2, 140);
  }) }));
  ossNote.position.set(O.x0 + .02, O.y0 + 1.3, (O.z0 + O.z1) / 2); ossNote.rotation.y = Math.PI / 2; g.add(ossNote);
  // the templar's tomb
  const K = ROOMS.knight, kx = (K.x0 + K.x1) / 2, kz = (K.z0 + K.z1) / 2;
  box(.9, .75, 2.2, stone, kx, K.y0 + .375, kz); box(1, .08, 2.3, L(0x9a9080), kx, K.y0 + .79, kz);
  const redCross = new THREE.Mesh(new THREE.PlaneGeometry(.4, .4), new THREE.MeshLambertMaterial({ transparent: true, map: tex(64, 64, (c) => { c.fillStyle = '#a81a1a'; c.fillRect(26, 4, 12, 56); c.fillRect(8, 20, 48, 12); }) }));
  redCross.rotation.x = -Math.PI / 2; redCross.position.set(kx, K.y0 + .84, kz + .7); g.add(redCross);
  addBox(kx - .5, K.y0, kz - 1.15, kx + .5, K.y0 + .83, kz + 1.15);
  // the monks' cellar: barrels
  const C = ROOMS.cellar;
  for (const x of [58.6, 63.4]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .9, 12), wood); b.rotation.z = Math.PI / 2; b.position.set(x, C.y0 + .38, (C.z0 + C.z1) / 2); g.add(b); addBox(x - .45, C.y0, C.z0, x + .45, C.y0 + .76, C.z1); }
  // the sealed room: an altar block
  const V = ROOMS.vault;
  box(.8, .8, .5, stone, 62.2, V.y0 + .4, 34.1);

  // ---------- the finds: made where they lie ----------
  const list = [], fg = new THREE.Group(); g.add(fg);
  function find(id, key, x, y, z, model, w = .6, h = .6, d = .6) {
    model.position.set(x, y, z); fg.add(model);
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
    list.push({ key: 'church:' + key, id, def: FIND[id], box: b, center: b.getCenter(new THREE.Vector3()), obj: model, armed: 0, gone: false, world: 'church' });
  }
  const grp = (...ms) => { const q = new THREE.Group(); for (const [geo, m, x, y, z, rx = 0, ry = 0, rz = 0] of ms) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); q.add(o); } return q; };
  find('fiacre', 'fiacre', O.x0 + .5, O.y0, (O.z0 + O.z1) / 2, grp([new THREE.BoxGeometry(.34, .22, .2), gold, 0, .11, 0], [new THREE.ConeGeometry(.14, .2, 4), gold, 0, .32, 0, 0, Math.PI / 4], [new THREE.BoxGeometry(.2, .1, .01), glow(0xfff0c0, 1.2), 0, .12, .105]), .5, .5, .5);
  find('epee', 'epee', kx + .15, K.y0 + .83, kz, grp([new THREE.BoxGeometry(.05, .02, 1.1), L(0xd8dce2), 0, .02, .1], [new THREE.BoxGeometry(.3, .03, .05), gold, 0, .03, -.45], [new THREE.BoxGeometry(.04, .04, .2), L(0x5a3a22), 0, .03, -.58]), .5, .3, 1.4);
  find('heaume', 'heaume', kx - .2, K.y0 + .83, kz - .7, grp([new THREE.CylinderGeometry(.14, .15, .28, 12), L(0x9aa0a8), 0, .14, 0], [new THREE.BoxGeometry(.2, .02, .01), black, 0, .18, .145]), .4, .4, .4);
  [[58.9, 0], [60.6, 1], [62.4, 2]].forEach(([x, n]) => find('vin', 'vin' + n, x, C.y0, C.z0 + .45, grp([new THREE.CylinderGeometry(.06, .07, .3, 8), L(0x2a4a2a), 0, .15, 0], [new THREE.CylinderGeometry(.025, .03, .12, 6), L(0x2a4a2a), 0, .36, 0], [new THREE.BoxGeometry(.1, .08, .01), L(0xe8dcc0), 0, .15, .07]), .4, .5, .4));
  const B = ROOMS.bell;
  const bellM = new THREE.Mesh(new THREE.LatheGeometry([[0, 1.1], [.25, 1.08], [.35, .95], [.4, .6], [.5, .2], [.62, .05], [.6, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 20), new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: .7, roughness: .45, side: THREE.DoubleSide }));
  find('cloche', 'cloche', (B.x0 + B.x1) / 2, B.y0, (B.z0 + B.z1) / 2, grp([bellM.geometry, bellM.material, 0, 0, 0, .15, 0, .1]), 1.3, 1.2, 1.3);
  find('croix', 'croix', 62.2, V.y0 + .8, 34.1, grp([new THREE.BoxGeometry(.08, .5, .06), gold, 0, .25, 0], [new THREE.BoxGeometry(.3, .08, .06), gold, 0, .35, 0]), .4, .6, .3);
  find('tresor', 'tresor', 60, V.y0, 33.9, grp([new THREE.BoxGeometry(.8, .45, .5), wood, 0, .225, 0], [new THREE.CylinderGeometry(.25, .25, .8, 12, 1, false, 0, Math.PI), wood, 0, .45, 0, 0, 0, Math.PI / 2], [new THREE.BoxGeometry(.7, .1, .4), gold, 0, .5, 0]), .9, .8, .6);
  for (const key of s.finds?.church || []) { const f = list.find(q => q.key === key); if (f) { f.gone = true; f.obj.visible = false; } }
  const finds = {
    list, group: fg,
    hollow() {}, reset() {},
    remove(key) { const f = list.find(x => x.key === key); if (f && !f.gone) { f.gone = true; f.obj.visible = false; } return f; },
    hitTest(origin, dir, far) {
      const ray = new THREE.Ray(origin, dir), hp = new THREE.Vector3();
      let best = null, bt = far;
      for (const f of list) { if (f.gone || !ray.intersectBox(f.box, hp)) continue; const t = hp.distanceTo(origin); if (t < bt) { bt = t; best = f; } }
      return best ? { find: best, t: bt } : null;
    },
    update() {},
  };
  // what they do when they come out
  FIND.fiacre.onFind = () => hooks.unlock('ossuaire');
  FIND.epee.onFind = FIND.heaume.onFind = () => hooks.unlock('templier');
  FIND.croix.onFind = FIND.tresor.onFind = () => hooks.unlock('templiers');
  FIND.cloche.onFind = () => { hooks.unlock('cloche'); bong(); };

  // ---------- the ghost and the bats of the templar's tomb ----------
  const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false, map: tex(128, 192, (c) => {
    const gr = c.createRadialGradient(64, 70, 10, 64, 90, 90); gr.addColorStop(0, 'rgba(230,245,255,.95)'); gr.addColorStop(1, 'rgba(180,220,255,0)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(20, 190); c.quadraticCurveTo(10, 40, 64, 20); c.quadraticCurveTo(118, 40, 108, 190); c.lineTo(90, 170); c.lineTo(75, 190); c.lineTo(58, 170); c.lineTo(40, 190); c.closePath(); c.fill();
    c.fillStyle = 'rgba(20,30,50,.9)'; c.beginPath(); c.ellipse(48, 70, 8, 12, 0, 0, 7); c.ellipse(80, 70, 8, 12, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(64, 104, 10, 14, 0, 0, 7); c.fill();
  }) }));
  ghost.scale.set(1.2, 1.8, 1); ghost.visible = false; g.add(ghost);
  const batM = new THREE.MeshBasicMaterial({ color: 0x100c0e, side: THREE.DoubleSide });
  const batGeo = new THREE.ShapeGeometry((() => { const q = new THREE.Shape(); q.moveTo(0, 0); q.lineTo(.22, .08); q.lineTo(.16, -.02); q.lineTo(.08, .01); q.lineTo(0, -.05); q.lineTo(-.08, .01); q.lineTo(-.16, -.02); q.lineTo(-.22, .08); q.closePath(); return q; })());
  const bats = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(batGeo, batM); m.visible = false; g.add(m); return { m, t: 0, a: 0, r: 0, h: 0, sp: 0 }; });
  let ghostT = 0;
  function haunt() {
    s.crypt.ghost = true; ghostT = 6;
    ghost.visible = true; ghost.position.set(kx, K.y0 + 1.4, kz);
    for (const b of bats) { b.t = 3 + rnd() * 2; b.a = rnd() * 6.28; b.r = 1 + rnd() * 3; b.h = rnd(); b.sp = 3 + rnd() * 3; b.m.visible = true; }
    audio.whistle?.(); audio.squeak?.();
    ui.hint('« qui ose troubler mon repos ? »', 4000);
    hooks.save();
  }

  // ---------- the bell's voice ----------
  function bong() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const c = new AC(), t = c.currentTime, out = c.createGain(); out.gain.value = .25; out.connect(c.destination);
      for (const [f, a, d] of [[196, 1, 6], [392, .5, 4], [470, .35, 3], [587, .25, 2.5], [784, .15, 2]]) {
        const o = c.createOscillator(), gn = c.createGain(); o.frequency.value = f;
        gn.gain.setValueAtTime(a, t); gn.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(gn); gn.connect(out); o.start(t); o.stop(t + d);
      }
      setTimeout(() => c.close(), 7000);
    } catch {}
  }

  // ---------- the way down and up ----------
  const diesIrae = () => { if (!organ?.playing) return false; const song = songs?.[organ.song]; return !!song && /dies irae/i.test(song.name); };
  let slideT = s.crypt.open ? 1 : 0;
  function openTomb() {
    s.crypt.open = true;
    audio.boom?.(.4); audio.dig?.(3);
    ui.toast('la dalle glisse… un escalier descend sous la nef', false, 3000);
    hooks.save();
  }
  function descend() {
    hooks.goTo(CRYPT_ENTRY, -Math.PI / 2, () => {
      if (!s.crypt.seen) { s.crypt.seen = true; ui.layer('la crypte', 'sous la nef, les morts… une île sur une table, et une porte qui brûle'); hooks.unlock('crypte'); hooks.save(); }
    });
  }
  function interact(it) {
    const id = it.id;
    if (id === 'gisant') {
      if (s.crypt.open) { descend(); return true; }
      if (diesIrae()) { openTomb(); return true; }
      s.crypt.pushes++;
      audio.clink?.();
      ui.toast('« ci-gît messire lombric, qui creusa plus profond que tous · au jour de colère, je m\'ouvrirai »', false, 4200);
      if (s.crypt.pushes >= 3) setTimeout(() => ui.hint('la dalle ne bouge pas d\'un pouce… « le jour de colère »… l\'orgue en connaît peut-être l\'air', 5000), 2000);
      return true;
    }
    if (id === 'cryptup') { hooks.goTo(new THREE.Vector3(TOMB.x + 1.1, 0, TOMB.z), -Math.PI / 2); return true; }
    if (id === 'pkdoor') {
      if (hooks.hasGame('painkiller')) hooks.offerGame('painkiller');
      else { audio.deny?.(); ui.toast('la porte de fer est brûlante · derrière, des cris… elle ne s\'ouvre pas encore', true, 3200); }
      return true;
    }
    if (id.startsWith('cdial')) {
      if (s.crypt.vault) { ui.toast('la porte est ouverte'); return true; }
      const n = +id.slice(5);
      s.crypt.dials[n] = (s.crypt.dials[n] + 1) % SIGNS.length;
      setDial(n); audio.tick?.();
      if (s.crypt.dials.every((v, k) => v === ANSWER[k])) {
        s.crypt.vault = true;
        hooks.openVault(DOOR);
        audio.boom?.(.6);
        ui.toast('les trois signes s\'enclenchent… la porte scellée se lève', false, 3200);
      }
      hooks.save();
      return true;
    }
    return false;
  }
  function prompt(near) {
    const id = near.id;
    if (id === 'gisant') return s.crypt.open ? '<b>e</b> descendre dans la crypte' : diesIrae() ? '<b>e</b> pousser la dalle… elle bouge !' : '<b>e</b> le gisant de messire lombric';
    if (id === 'cryptup') return '<b>e</b> remonter dans l\'église';
    if (id === 'pkdoor') return hooks.hasGame('painkiller') ? '<b>e</b> franchir la porte de fer · painkiller' : 'une porte de fer, brûlante';
    if (id.startsWith('cdial')) return s.crypt.vault ? 'la porte est ouverte' : `<b>e</b> tourner le disque · ${SIGNS[s.crypt.dials[+id.slice(5)]]}`;
    return undefined;
  }
  const inBox = (p, b, pad = 0) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - 1 - pad && p.y < b.y1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad;

  let t = 0;
  return {
    group: g, finds, interact, prompt, entry: CRYPT_ENTRY, door: DOOR,
    inside: (p) => inBox(p, { x0: DIG.x0, x1: DIG.x1, y0: -16, y1: -.5, z0: DIG.z0, z1: DIG.z1 }),
    get opened() { return s.crypt.open; },
    // a door opened elsewhere (another player, a save)
    vaultOpened() { s.crypt.vault = true; },
    update(dt, player) {
      t += dt;
      const p = player?.pos;
      // the tomb's slab slides off once
      if (s.crypt.open && slideT < 1) slideT = Math.min(1, slideT + dt / 2.2);
      slab.position.set(-slideT * .1, .55 + Math.sin(slideT * Math.PI) * .03, slideT * 1.35);
      const near = p ? Math.hypot(p.x - TOMB.x, p.z - TOMB.z) : 99;
      for (const d of draft) {
        d.t = (d.t + dt * .25) % 1;
        d.p.position.set(Math.sin(d.t * 9 + d.p.id) * .2, .5 + d.t * .8, -.9 + (d.p.id % 8) * .25);
        d.p.material.opacity = near < 4 ? Math.sin(d.t * Math.PI) * .25 : 0;
      }
      if (!p || p.y > -1 || !inChurchDig(p)) return;
      // the crypt comes alive when you're in it
      if (!island && Math.hypot(p.x - cx, p.z - cz) < 12) { island = islandModel(777, 1.6); island.position.set(0, .95, 0); table.add(island); }
      if (island) island.rotation.y += dt * .05;
      for (const o of g.children) if (o.userData.flame) o.scale.setScalar(.85 + Math.sin(t * 13 + o.position.x * 3) * .1 + Math.random() * .08);
      cracks.color.setRGB(1.4 + Math.sin(t * 3) * .5, .5, .15);
      pkGlow.material.opacity = .2 + Math.sin(t * 2.3) * .08;
      if (s.crypt.vault && doorT < 1) doorT = Math.min(1, doorT + dt / 3);
      leaf.position.y = doorT * 2.05;
      // the rooms give their secrets when you step in
      if (!s.crypt.bones && inBox(p, ROOMS.ossuary, .3)) { s.crypt.bones = true; ui.hint('l\'ossuaire… sur le mur, gravé dans la pierre : « d\'abord la croix, puis le crâne, enfin la clé »', 6000); hooks.save(); }
      if (!s.crypt.ghost && inBox(p, ROOMS.knight, .2)) haunt();
      if (ghostT > 0) {
        ghostT -= dt;
        const k = ghostT > 4.5 ? (6 - ghostT) / 1.5 : Math.min(1, ghostT / 1.5);
        ghost.material.opacity = k * .8; ghost.position.y = K.y0 + 1.4 + (6 - ghostT) * .15 + Math.sin(t * 2) * .05;
        if (ghostT <= 0) ghost.visible = false;
      }
      for (const b of bats) {
        if (b.t <= 0) continue;
        b.t -= dt; b.a += dt * b.sp;
        b.m.position.set(kx - (4 - b.t) * 1.5 + Math.cos(b.a) * b.r * .4, K.y0 + 1 + b.h * 1.6 + Math.sin(b.a * 2) * .2, kz + Math.sin(b.a) * b.r * .5);
        b.m.rotation.set(0, b.a, 0); b.m.scale.y = .6 + Math.abs(Math.sin(t * 20 + b.a)) * .6;
        if (b.t <= 0) b.m.visible = false;
      }
    },
  };
}
