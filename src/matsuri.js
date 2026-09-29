// matsuri.js, the summer festival in the Japanese street, between the station plaza and the shrine:
// a low stage with a big ō-daiko on its stand, two shime-daiko, a hand gong and a drummer in his
// happi; next to it a goldfish stall (kingyo-sukui) with its tub, its vendor and bags of fish; paper
// lanterns strung over both. The drum is for anyone: e takes the sticks (free play, heard by all
// nearby, spatialised: taiko-voice.js), t starts « taiko héros » (taiko.js); the stall opens
// « kingyo-sukui » (kingyo.js). Everything here lives in the Japanese town's group.
import * as THREE from 'three';
import { createTaikoVoice } from './taiko-voice.js';
import { SONGS } from './taiko-songs.js';
import { spawnList, fishAt, KINDS, TUB } from './kingyo-rules.js';
import { createRig } from './rig.js';
import { DEFAULT } from './outfits.js';
import { canvasTex } from './lib/tex.js';
import { mergeStatic } from './merge.js';

const JP_FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
// china-local places: the stage faces the street (+z), the stall beside it
export const STAGE = { x: 27, z: 2.2 }, STALL = { x: 37.6, z: 2.6 };
// the free-play keys: f j don, d k ka, space a big don, g h the shime, c the gong
const FREE = { KeyF: 'd', KeyJ: 'd', KeyD: 'k', KeyK: 'k', Space: 'D', KeyG: 's', KeyH: 's', KeyC: 'c' };

export function createMatsuri({ parent, origin, colliders, interactables, rooms = [], ui, send = () => {} }) {
  const root = new THREE.Group(); parent.add(root);
  const W = (x, y, z) => new THREE.Vector3(origin.x + x, y, origin.z + z);
  const solid = (x0, y0, z0, x1, y1, z1) => colliders.push({ min: W(Math.min(x0, x1), y0, Math.min(z0, z1)), max: W(Math.max(x0, x1), y1, Math.max(z0, z1)) });
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return mats.get(k); };
  const box = (w, h, d, m, x, y, z, p = root) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; p.add(b); return b; };
  const cyl = (r, h, m, x, y, z, p = root, seg = 12, r2 = r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m); c.position.set(x, y, z); c.castShadow = true; p.add(c); return c; };
  const wood = mat(0x8a5a36), darkWood = mat(0x4a2c1c), boards = mat(0xb8905e), iron = mat(0x2a2a2e);
  const writing = (text, { w = 512, h = 128, bg = '#f6efe0', color = '#b8231c', size = 84, border = null } = {}) => canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    if (border) { c.strokeStyle = border; c.lineWidth = 10; c.strokeRect(6, 6, w - 12, h - 12); }
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${size}px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 4);
  });
  const signMat = (t) => new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .25 });
  // the red-and-white festival curtain
  const kohaku = (rep) => canvasTex(128, 32, (c) => { for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#f6f2ea' : '#c8221c'; c.fillRect(k * 32, 0, 32, 32); } }, rep);

  // ---------- the stage ----------
  const stage = new THREE.Group(); stage.position.set(STAGE.x, 0, STAGE.z); root.add(stage);
  const SW = 6, SD = 3.6, SH = .3;
  box(SW, SH, SD, boards, 0, SH / 2, 0, stage);
  for (let k = 0; k < 11; k++) box(.02, .005, SD, darkWood, -SW / 2 + .55 + k * .5, SH + .003, 0, stage);
  // the curtain round its skirt
  const skirt = new THREE.MeshLambertMaterial({ map: kohaku([SW * 2, 1]) }), skirtS = new THREE.MeshLambertMaterial({ map: kohaku([SD * 2, 1]) });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), skirt); f.position.set(0, SH / 2, s * (SD / 2 + .01)); f.rotation.y = s > 0 ? 0 : Math.PI; stage.add(f);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(SD, SH), skirtS); q.position.set(s * (SW / 2 + .01), SH / 2, 0); q.rotation.y = s * Math.PI / 2; stage.add(q);
  }
  solid(STAGE.x - SW / 2, 0, STAGE.z - SD / 2, STAGE.x + SW / 2, SH, STAGE.z + SD / 2);
  // the back: two posts, a lintel, a white cloth with the festival's name
  for (const s of [-1, 1]) { box(.18, 3.4, .18, darkWood, s * (SW / 2 - .1), SH + 1.7, -SD / 2 + .1, stage); solid(STAGE.x + s * (SW / 2 - .1) - .1, 0, STAGE.z - SD / 2, STAGE.x + s * (SW / 2 - .1) + .1, 3.7, STAGE.z - SD / 2 + .2); }
  box(SW + .5, .2, .24, darkWood, 0, SH + 3.4, -SD / 2 + .1, stage);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(SW - .3, 2.2), signMat(writing('夏祭り', { w: 1024, h: 384, size: 250, border: '#1e1a18' })));
  cloth.position.set(0, SH + 2, -SD / 2 + .12); stage.add(cloth);
  const clothBack = new THREE.Mesh(new THREE.PlaneGeometry(SW - .3, 2.2), mat(0xe8e0cc)); clothBack.rotation.y = Math.PI; clothBack.position.set(0, SH + 2, -SD / 2 + .1); stage.add(clothBack);
  // the ō-daiko: a barrel of staves, two skins nailed on, lying on a wooden cradle, skin to the drummer
  const DR = .55, DL = .9, DY = SH + 1.05, DZ = 0;
  const staves = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#7a3a1e'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = `rgba(30,10,4,${.25 + Math.random() * .2})`; c.fillRect(x, 0, 2, h); c.fillStyle = `rgba(255,190,120,${Math.random() * .08})`; c.fillRect(x + 3, 0, 10, h); }
  });
  const prof = [];
  for (let k = 0; k <= 12; k++) { const u = k / 12 - .5; prof.push(new THREE.Vector2(DR * (1 + .14 * (1 - 4 * u * u)), u * DL)); }
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshLambertMaterial({ map: staves }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, DY, DZ); barrel.castShadow = true; stage.add(barrel);
  // the skins, a mitsudomoe painted on each
  const skinTex = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#efe2c4'; c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,90,50,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 22, 0, 7); c.stroke();
    c.fillStyle = '#b8231c';
    for (let k = 0; k < 3; k++) {
      c.save(); c.translate(w / 2, w / 2); c.rotate(k * Math.PI * 2 / 3);
      c.beginPath(); c.arc(0, -26, 24, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(24, -26); c.quadraticCurveTo(40, 30, -30, 44); c.quadraticCurveTo(10, 20, -24, -26); c.fill();
      c.restore();
    }
  });
  const skins = [];
  for (const s of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.CircleGeometry(DR, 32), new THREE.MeshLambertMaterial({ map: skinTex, emissive: 0xffc070, emissiveIntensity: 0 }));
    sk.position.set(0, DY, DZ + s * (DL / 2 + .005)); sk.rotation.y = s > 0 ? 0 : Math.PI; sk.userData.keep = true; stage.add(sk); skins.push(sk);
    const tack = mat(0xd8b048);
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), tack); b.position.set(Math.cos(a) * (DR - .01), DY + Math.sin(a) * (DR - .01), DZ + s * (DL / 2 + .01)); stage.add(b); }
  }
  for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.1, .018, 6, 14), iron); ring.position.set(s * (DR * 1.12), DY + .05, DZ); ring.rotation.y = Math.PI / 2; stage.add(ring); }
  // the cradle
  for (const s of [-1, 1]) {
    box(.12, .95, .12, darkWood, s * .45, SH + .45, DZ - .3, stage); box(.12, .95, .12, darkWood, s * .45, SH + .45, DZ + .3, stage);
    box(.12, .1, .8, darkWood, s * .45, SH + .72, DZ, stage);
  }
  box(1.1, .08, .12, darkWood, 0, SH + .2, DZ - .3, stage); box(1.1, .08, .12, darkWood, 0, SH + .2, DZ + .3, stage);
  solid(STAGE.x - .7, 0, STAGE.z + DZ - .5, STAGE.x + .7, DY + DR, STAGE.z + DZ + .5);
  // two sticks (bachi) resting across the top
  for (const s of [-1, 1]) { const b = cyl(.022, .42, mat(0xe0c89a), s * .1, DY + DR * 1.14 + .02, DZ, stage, 6); b.rotation.x = Math.PI / 2; b.rotation.z = s * .2; }
  // the shime-daiko: small tight drums, laced with orange rope, on low stands
  const shimes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 1.9, SH, .5); stage.add(g);
    box(.06, .55, .06, darkWood, -.18, .27, 0, g); box(.06, .55, .06, darkWood, .18, .27, 0, g); box(.45, .05, .3, darkWood, 0, .5, 0, g);
    const body = cyl(.2, .16, mat(0x2a1a14), 0, .66, 0, g, 16); body.rotation.x = -.5;
    const head = cyl(.24, .03, mat(0xefe2c4), 0, .74, -.043, g, 18); head.rotation.x = -.5; head.userData.keep = true;
    const rope = cyl(.245, .1, mat(0xe8702a), 0, .66, 0, g, 18); rope.rotation.x = -.5;
    shimes.push(head);
  }
  // the hand gong on its little frame
  const kane = new THREE.Group(); kane.position.set(-2.5, SH, -.4); stage.add(kane);
  box(.04, .8, .04, darkWood, -.15, .4, 0, kane); box(.04, .8, .04, darkWood, .15, .4, 0, kane); box(.34, .04, .04, darkWood, 0, .8, 0, kane);
  const gong = cyl(.12, .04, new THREE.MeshStandardMaterial({ color: 0xc89a3a, metalness: .8, roughness: .35 }), 0, .6, 0, kane, 16); gong.rotation.x = Math.PI / 2; gong.userData.keep = true;
  // the drummer: happi, hachimaki, his shime to his left
  const drummer = new THREE.Group(); drummer.position.set(STAGE.x - 1.9, SH, STAGE.z - .25); drummer.userData.keep = true; root.add(drummer);
  const drummerRig = createRig({ ...DEFAULT, top: 'happi', bottom: 'hakama', shoes: 'tabi', hat: 'hachimaki', skin: 2, hair: 'court', hairC: 1 }, { detail: 'lo' });
  drummer.add(drummerRig.root);
  solid(STAGE.x - 2.2, 0, STAGE.z - .55, STAGE.x - 1.6, 2, STAGE.z + .05);

  // ---------- the goldfish stall ----------
  const stall = new THREE.Group(); stall.position.set(STALL.x, 0, STALL.z); root.add(stall);
  const TY = .55;                                // the water's surface
  const tubM = mat(0x3a7ad8), tubIn = mat(0x2a64c0);
  // the blue basin on its trestles, the water in it, pebbles on the bottom
  const tw = TUB.w + .24, td = TUB.d + .24;
  box(tw, .08, td, tubM, 0, TY - .28, 0, stall);
  for (const [w, d, x, z] of [[tw, .12, 0, td / 2 - .06], [tw, .12, 0, -td / 2 + .06], [.12, td, tw / 2 - .06, 0], [.12, td, -tw / 2 + .06, 0]]) box(w, .34, d, tubM, x, TY - .1, z, stall);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(.08, TY - .3, .08, darkWood, s * (tw / 2 - .2), (TY - .3) / 2, t * (td / 2 - .15), stall);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(TUB.w, TUB.d), new THREE.MeshLambertMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#2f6ec8'; c.fillRect(0, 0, w, h); for (let k = 0; k < 90; k++) { c.fillStyle = `hsl(${30 + Math.random() * 40},${20 + Math.random() * 30}%,${60 + Math.random() * 25}%)`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, 7); c.fill(); } }) }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = TY - .23; stall.add(bottom);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(TUB.w, TUB.d), new THREE.MeshStandardMaterial({ color: 0x6ab8f0, transparent: true, opacity: .32, roughness: .1, metalness: .1, depthWrite: false }));
  water.rotation.x = -Math.PI / 2; water.position.y = TY; water.renderOrder = 2; stall.add(water);
  void tubIn;
  solid(STALL.x - tw / 2, 0, STALL.z - td / 2, STALL.x + tw / 2, TY + .1, STALL.z + td / 2);
  // the roof: four posts, a striped awning, the name on a board, a noren at the back
  const RW = 3.4, RD = 2.6;
  for (const s of [-1, 1]) for (const t of [-1, 1]) { box(.1, 2.5, .1, wood, s * RW / 2, 1.25, t * RD / 2, stall); solid(STALL.x + s * RW / 2 - .06, 0, STALL.z + t * RD / 2 - .06, STALL.x + s * RW / 2 + .06, 2.5, STALL.z + t * RD / 2 + .06); }
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(RW + .5, RD + .5), new THREE.MeshLambertMaterial({ map: kohaku([6, 1]), side: THREE.DoubleSide }));
  awning.rotation.x = -Math.PI / 2 + .18; awning.position.set(0, 2.62, 0); stall.add(awning);
  const nameTex = writing('金魚すくい', { w: 1024, h: 256, bg: '#f6efe0', color: '#c8221c', size: 150, border: '#2a64c0' });
  const nb = new THREE.Mesh(new THREE.PlaneGeometry(RW, .7), signMat(nameTex)); nb.position.set(0, 2.2, RD / 2 + .08); stall.add(nb);
  const nbBack = box(RW, .7, .04, wood, 0, 2.2, RD / 2 + .04, stall); void nbBack;
  // the fish drawn on a price board by the tub: rouge 1, noir 3, shubunkin 5, or 10
  const priceTex = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#f6efe0'; c.fillRect(0, 0, w, w); c.strokeStyle = '#2a64c0'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, w - 8);
    const rows = [['rouge', '#e8481c'], ['noir', '#1c1a22'], ['calico', '#f2eee4'], ['or', '#ffc22a']];
    rows.forEach(([k, col], i) => {
      const y = 40 + i * 58;
      c.fillStyle = col; c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.ellipse(70, y, 30, 16, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(100, y); c.lineTo(122, y - 14); c.lineTo(122, y + 14); c.closePath(); c.fill(); c.stroke();
      if (k === 'calico') { c.fillStyle = '#e8481c'; c.beginPath(); c.arc(62, y - 4, 7, 0, 7); c.fill(); c.fillStyle = '#1c1a22'; c.beginPath(); c.arc(78, y + 5, 5, 0, 7); c.fill(); }
      c.fillStyle = '#1e1a18'; c.font = '700 40px Rubik, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('× ' + KINDS[k].value, 146, y + 2);
    });
  });
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), signMat(priceTex)); pb.position.set(RW / 2 - .05, 1.35, RD / 2 - .02); pb.rotation.y = -.3; stall.add(pb);
  // the vendor behind the tub, and his bags of fish hanging from the back bar
  const vendor = new THREE.Group(); vendor.position.set(STALL.x - .2, 0, STALL.z - RD / 2 + .35); vendor.userData.keep = true; root.add(vendor);
  const vendorRig = createRig({ ...DEFAULT, top: 'yukata', bottom: 'hakama', shoes: 'geta', hat: 'hachimaki', skin: 1, hair: 'rase', hairC: 5 }, { detail: 'lo' });
  vendor.add(vendorRig.root);
  solid(STALL.x - .5, 0, STALL.z - RD / 2 + .1, STALL.x + .1, 2, STALL.z - RD / 2 + .6);
  box(RW, .05, .05, wood, 0, 2.05, -RD / 2 + .1, stall);
  const bagM = new THREE.MeshStandardMaterial({ color: 0xd8eeff, transparent: true, opacity: .45, roughness: .05 });
  const bagFish = mat(0xe8481c, { emissive: 0x401000 });
  for (let k = 0; k < 7; k++) {
    const x = -RW / 2 + .4 + k * .44;
    if (Math.abs(x + .2) < .3) continue;
    const bag = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), bagM); bag.scale.set(1, 1.3, 1); bag.position.set(x, 1.72, -RD / 2 + .1); bag.renderOrder = 3; stall.add(bag);
    box(.01, .2, .01, mat(0xf0f0f0), x, 1.95, -RD / 2 + .1, stall);
    const f = new THREE.Mesh(new THREE.SphereGeometry(.03, 6, 4), k % 3 ? bagFish : mat(0x1c1a22)); f.scale.set(1.6, 1, 1); f.position.set(x, 1.68, -RD / 2 + .1); stall.add(f);
  }
  // a crate of fresh poi, a bowl on the rim
  box(.4, .25, .3, wood, -RW / 2 + .35, .12, RD / 2 - .3, stall);
  for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.07, .008, 5, 16), mat(0xf0f0f0)); r.position.set(-RW / 2 + .22 + k * .06, .27, RD / 2 - .3); r.rotation.set(-Math.PI / 2 + .6, 0, 0); stall.add(r); }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.12, .08, .08, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0xf4f0e8, side: THREE.DoubleSide })); bowl.position.set(tw / 2 - .25, TY + .12, td / 2 - .05); stall.add(bowl);

  // ---------- the lanterns: strings of red paper chōchin over the stage and the stall ----------
  const lantM = new THREE.MeshLambertMaterial({ color: 0xe8341c, emissive: 0xff5a20, emissiveIntensity: .15 });
  const lantW = new THREE.MeshLambertMaterial({ color: 0xf6efe0, emissive: 0xffd8a0, emissiveIntensity: .15 });
  const capM = mat(0x1e1a18), ropeM = mat(0x2a2420);
  const lantGeo = new THREE.SphereGeometry(.17, 12, 8), capGeo = new THREE.CylinderGeometry(.09, .09, .05, 10);
  const lanterns = [];
  const string = (a, b, n, sag = .5) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const u = k / 16; pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0))); }
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .012, 4), ropeM); root.add(rope);
    for (let k = 1; k <= n; k++) {
      const u = k / (n + 1), p = new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u) - .24, 0));
      const l = new THREE.Group(); l.position.copy(p); l.userData.keep = true; root.add(l);
      const body = new THREE.Mesh(lantGeo, (k % 3 === 1 ? lantW : lantM).clone()); body.scale.set(1, 1.3, 1); l.add(body);
      for (const s of [-1, 1]) { const c = new THREE.Mesh(capGeo, capM); c.position.y = s * .21; l.add(c); }
      lanterns.push({ l, m: body.material, base: body.material.color.getHex(), ph: lanterns.length * .7 });
    }
  };
  // tall poles at the corners, strung across and along
  const poleAt = [[STAGE.x - 3.6, STAGE.z + 2.4], [STAGE.x + 3.6, STAGE.z + 2.4], [STALL.x + 2.1, STALL.z + 1.9], [STAGE.x - 3.6, STAGE.z - 2.2]];
  for (const [x, z] of poleAt) { cyl(.07, 4.6, darkWood, x, 2.3, z, root, 8); solid(x - .08, 0, z - .08, x + .08, 4.6, z + .08); }
  const top = ([x, z]) => new THREE.Vector3(x, 4.4, z);
  string(top(poleAt[0]), top(poleAt[1]), 7); string(top(poleAt[1]), top(poleAt[2]), 8); string(top(poleAt[3]), top(poleAt[0]), 5, .4);
  string(new THREE.Vector3(STAGE.x - SW / 2 + .1, SH + 3.5, STAGE.z - SD / 2 + .1), top(poleAt[1]), 5, .3);

  root.updateMatrixWorld(true);
  mergeStatic(root, (o) => o.userData.keep || o === water || o.material === bagM);

  // ---------- the stall's fish, when nobody plays there: the same swimmers as the game, looping ----------
  const idleFish = spawnList(7).slice(0, 12);
  const fishGeo = new THREE.SphereGeometry(1, 10, 6), tailGeo = new THREE.ConeGeometry(.9, 1.4, 4);
  const fishMats = Object.fromEntries(Object.entries(KINDS).map(([k, K]) => [k, new THREE.MeshLambertMaterial({ color: K.color, emissive: K.color, emissiveIntensity: k === 'or' ? .35 : .08 })]));
  const makeFish = (kind) => {
    const g = new THREE.Group(), K = KINDS[kind], m = fishMats[kind];
    const b = new THREE.Mesh(fishGeo, m); b.scale.set(K.size * .32, K.size * .22, K.size * .6); g.add(b);
    const tl = new THREE.Mesh(tailGeo, m); tl.scale.setScalar(K.size * .35); tl.rotation.x = -Math.PI / 2; tl.position.z = -K.size * .75; g.add(tl);
    if (kind === 'calico') { const sp = new THREE.Mesh(fishGeo, fishMats.rouge); sp.scale.set(K.size * .2, K.size * .12, K.size * .25); sp.position.set(0, K.size * .1, K.size * .15); g.add(sp); }
    if (kind === 'noir') for (const s of [-1, 1]) { const e = new THREE.Mesh(fishGeo, m); e.scale.setScalar(K.size * .12); e.position.set(s * K.size * .28, K.size * .1, K.size * .38); g.add(e); }
    g.userData.tail = tl;
    return g;
  };
  const tubG = new THREE.Group(); tubG.position.set(STALL.x, TY, STALL.z); root.add(tubG);
  const idle = idleFish.map(f => { const m = makeFish(f.kind); tubG.add(m); return { f, m }; });
  const _p = {};

  // ---------- the drum's voice, and playing it freely ----------
  const voice = createTaikoVoice({ at: W(STAGE.x, SH, STAGE.z + DZ) });
  let drumming = false, song = SONGS.length - 1, wobble = 0, shimeK = 0, gongK = 0, t = 0, toastAt = 0;
  // someone struck: the skin shakes, the lanterns jump (local or not)
  function strike(kind) {
    if (kind === 's') shimeK = 1; else if (kind === 'c') gongK = 1; else wobble = Math.max(wobble, kind === 'D' ? 1.3 : kind === 'k' ? .4 : .9);
  }
  function hit(kind, local) {
    voice.hit(kind);
    strike(kind);
    if (local) send({ k: 'taiko', h: kind });
  }
  function piece(i, local, by = null) {
    song = ((i % SONGS.length) + SONGS.length) % SONGS.length;
    voice.play(song, local ? 0 : .1);
    if (local) send({ k: 'taiko', s: song });
    const now = performance.now();
    if (now - toastAt > 1500) { toastAt = now; ui?.toast((by ? `${by} joue du taiko · ` : '♪ ') + SONGS[song].name, false, 3000); }
  }
  function onKey(e) {
    if (!drumming || e.target?.closest?.('input, textarea')) return;
    if (FREE[e.code]) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) hit(FREE[e.code], true); return; }
    if (e.code === 'KeyM') { piece(song + 1, true); e.stopImmediatePropagation(); return; }
    if (e.code === 'KeyN') { voice.stop(); send({ k: 'taiko', s: -1 }); e.stopImmediatePropagation(); return; }
    // t: the rhythm game (main.js offers it), e and escape: let go; walking keys are held while drumming
    if (e.code === 'KeyT') { release(); return; }
    if (e.code === 'KeyE' || e.code === 'Escape') { release(); e.stopImmediatePropagation(); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyQ', 'KeyZ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyX', 'KeyV', 'KeyB'].includes(e.code) || /^Digit/.test(e.code)) e.stopImmediatePropagation();
  }
  // the mouse too, once it's captured: left a don, right a ka (not a spadeful of the stage)
  function onMouse(e) {
    if (!drumming || !document.pointerLockElement || (e.button !== 0 && e.button !== 2)) return;
    e.stopImmediatePropagation();
    hit(e.button === 0 ? 'd' : 'k', true);
  }
  addEventListener('keydown', onKey, true);
  addEventListener('mousedown', onMouse, true);
  function grab() { drumming = true; voice.ensure(); }
  function release() { drumming = false; }

  const stageIt = { id: 'taiko', game: 'taiko', pos: W(STAGE.x, 1.1, STAGE.z + DZ), reach: 2.8 };
  const stallIt = { id: 'mg:kingyo', game: 'kingyo', pos: W(STALL.x, 1.1, STALL.z + td / 2 + .3), reach: 2.2 };
  interactables.push(stageIt, stallIt);
  // the konbini is a room too (china.js builds it outside interiors-jp.js)
  const konbini = new THREE.Box3(W(-5.5, 0, -19.5), W(5.5, 3.6, -13));
  const _c = new THREE.Vector3(), stallAt = W(STALL.x, TY, STALL.z);
  return {
    root, voice, lanterns, skins, shimes, gong, water, tubG, makeFish, fishMats, KINDS,
    stage: { x: origin.x + STAGE.x, y: SH, z: origin.z + STAGE.z, drumY: DY, drumZ: origin.z + STAGE.z + DZ, R: DR, L: DL },
    stall: { x: origin.x + STALL.x, z: origin.z + STALL.z, y: TY, tub: TUB, group: stall, idle: tubG },
    get drumming() { return drumming; }, strike, hit, piece, release,
    get song() { return song; },
    prompt(near) {
      if (near !== stageIt) return undefined;
      if (drumming) return '<b>f j</b> don · <b>d k</b> ka · <b>espace</b> grand don · <b>g</b> shime · <b>c</b> cloche · <b>clic</b> don, ka · ' +
        `<b>m</b> morceau : ${SONGS[(song + 1) % SONGS.length].name} · <b>e</b> lâcher · <b>t</b> taiko héros`;
      return `<b>e</b> prendre les baguettes · pour tout le monde · <b>t</b> taiko héros`;
    },
    act(near) { if (near === stageIt) { if (drumming) release(); else grab(); return true; } return false; },
    // from the others: a stroke, a piece (-1: stopped)
    onFx(fx, by, here) {
      if (here !== 'china') return;
      if (typeof fx.h === 'string' && 'dkDKsc'.includes(fx.h) && fx.h.length === 1) { voice.hit(fx.h); strike(fx.h); }
      else if (fx.s === -1) voice.stop();
      else if (Number.isInteger(fx.s)) piece(fx.s, false, by);
    },
    // each frame: `can` false (another world, a game, a menu) lets go of the sticks
    update(dt, camera, { here, can = true, night = 0, view = here } = {}) {
      t += dt;
      if (drumming && !can) release();
      const on = here === 'china' && view === 'china';
      camera.getWorldPosition(_c);
      voice.update(camera, { on, indoor: rooms.some(r => r.containsPoint(_c)) || konbini.containsPoint(_c), under: _c.y < -1.5 });
      if (!(view === 'china')) return;
      // the pieces played for everyone move the skin too
      if (voice.playing) { const b = voice.song >= 0 ? SONGS[voice.song].beat : .5; if ((t % b) < dt) wobble = Math.max(wobble, .5); }
      wobble = Math.max(0, wobble - dt * 5); shimeK = Math.max(0, shimeK - dt * 8); gongK = Math.max(0, gongK - dt * 3);
      for (const s of skins) { s.scale.setScalar(1 + Math.sin(t * 60) * .02 * wobble); s.material.emissiveIntensity = wobble * .25; }
      for (const s of shimes) s.position.y = .74 - shimeK * .012;
      gong.rotation.z = Math.sin(t * 20) * .15 * gongK;
      const glow = .15 + night * 1.4;
      for (const L of lanterns) { L.m.emissiveIntensity = glow + wobble * .25; L.l.rotation.z = Math.sin(t * 1.3 + L.ph) * .05; }
      drummerRig.update(dt); vendorRig.update(dt);
      // the stall's fish (hidden while the game has the tub)
      if (tubG.visible && _c.distanceToSquared(stallAt) < 900) {
        const tt = 6 + (t % 600);
        for (const { f, m } of idle) { fishAt(f, tt, _p); m.position.set(_p.x, _p.y, _p.z); m.rotation.y = _p.h; m.userData.tail.rotation.y = Math.sin(t * 12 + f.id) * .4; }
      }
    },
    dispose() { removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); },
  };
}
