// painkiller.js, « painkiller »: an arena shooter in the spirit of the gothic classic, in the cursed nave
// under the church (a crypt-cathedral built far off, like the secret cave). You become a first-person
// hunter: the painkiller (a spinning blade, and its head you throw), the stake gun (stakes, grenades,
// and a stake through a grenade catches fire), the shotgun (and its freezing shot). Skeletons, undead
// monks, gargoyles and demons pour in by waves; each kill drops a soul, sixty-six of them turn you into
// a demon for a few seconds. Two lords: the executioner and the archdemon. Bunny hop: keep jumping as
// you land and you keep (and gain) speed. Co-op (« croisade ») or everyone for themselves (« carnage »,
// with hunters as bots). The host runs the monsters and the bots; everyone runs their own hunter.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { rng, hostOf, ord, fmt, createChip } from './retro.js';

export const PK_ARENA = new THREE.Vector3(700, 0, 700);
const HX = 14, HZ = 28, HH = 16, EYE = 1.62, PR = .4;
const GRAV = 22, JUMP = 7.4, RUN = 8.6, MAXH = 17, SNAP = .1, PSEND = 1 / 15;
const TAU = Math.PI * 2;
const MODES = [
  { id: 'croisade', name: 'croisade', sub: 'ensemble contre six vagues de damnés et deux seigneurs · le meilleur score', help: 'zqsd · espace (garde-le au sol : bunny hop) · clic : tir · clic droit : tir secondaire · 1 2 3 ou molette : arme · 66 âmes : démon', unit: 'score', lower: false },
  { id: 'carnage', name: 'carnage', sub: 'chacun pour soi dans la nef · 3 minutes, le plus de frags', help: 'zqsd · espace (garde-le au sol : bunny hop) · clic : tir · clic droit : tir secondaire · 1 2 3 ou molette : arme', unit: 'frags', lower: false },
];
// hp, speed, radius, height, damage, points, souls
const KINDS = {
  sk: { name: 'squelette', hp: 45, speed: 4.8, r: .38, h: 1.85, dmg: 7, pts: 100, souls: 1, reach: 1.4, rate: 1 },
  mo: { name: 'moine', hp: 75, speed: 3.1, r: .42, h: 1.95, dmg: 12, pts: 150, souls: 1, reach: 1.4, rate: 2.8 },
  ga: { name: 'gargouille', hp: 50, speed: 6.5, r: .5, h: 1.1, dmg: 11, pts: 150, souls: 1, reach: 1.2, rate: 2.2, fly: true },
  de: { name: 'démon', hp: 220, speed: 4.2, r: .75, h: 2.7, dmg: 22, pts: 300, souls: 3, reach: 2, rate: 1.4 },
  bo: { name: 'le bourreau', hp: 1700, speed: 3.2, r: 1.2, h: 4.2, dmg: 32, pts: 3000, souls: 20, reach: 3.4, rate: 1.8, boss: true },
  ar: { name: 'l\'archidémon', hp: 3200, speed: 3.8, r: 1.5, h: 5.2, dmg: 38, pts: 6000, souls: 30, reach: 3.8, rate: 1.6, boss: true },
  bt: { name: 'chasseur', hp: 100, speed: 7.5, r: .4, h: 1.8, dmg: 20, pts: 0, souls: 5, reach: 0, rate: 1.1, bot: true },
};
const KORDER = Object.keys(KINDS);
const WAVES = [{ sk: 10 }, { sk: 10, mo: 6 }, { boss: 'bo', sk: 8 }, { sk: 10, mo: 6, ga: 6 }, { sk: 10, mo: 6, ga: 5, de: 4 }, { boss: 'ar', ga: 5, de: 3, mo: 4 }];
const SPAWNS = [[0, -24], [-11, -21], [11, -21], [-12, -2], [12, -2], [-11, 15], [11, 15], [0, 8]];
const PILLARS = [];
for (const x of [-7, 7]) for (let z = -21; z <= 21; z += 7) PILLARS.push([x, z, .8]);
// pews, tombs, the altar: [x0, z0, x1, z1, top]
const BOXES = [
  [-5.2, -16, -2.2, -15.4, .9], [2.2, -16, 5.2, -15.4, .9], [-5.2, -9, -2.2, -8.4, .9], [2.2, -3, 5.2, -2.4, .9], [-5.2, 4, -2.2, 4.6, .9], [2.2, 10, 5.2, 10.6, .9],
  [-12.6, -13, -10.8, -10, 1], [10.8, -7, 12.6, -4, 1], [-12.6, 7, -10.8, 10, 1], [10.8, 5, 12.6, 8, 1],
  [-1.8, 23.6, 1.8, 25.2, 2.15],
];
const WEAPONS = [
  { id: 'pk', name: 'painkiller', a: 'lame qui tourne', b: 'tête lancée' },
  { id: 'st', name: 'lance-pieux', a: 'pieux', b: 'grenades' },
  { id: 'sg', name: 'fusil', a: 'chevrotine', b: 'tir glaçant' },
];
const BOT_NAMES = ['belzébuth', 'gédéon', 'sœur agathe', 'le frère', 'mortimer'];
const BOT_COLORS = [0x9a3ad8, 0x3ad8a0, 0xd8b03a, 0x3a8ad8, 0xd83a6a];

export function createPainkiller({ scene, camera, audio, ui }) {
  const root = new THREE.Group(); root.position.copy(PK_ARENA); root.visible = false; scene.add(root);
  let built = false, onEnd = () => {}, running = false, ended = true, hudOn = false;
  let mode, seed, R, meId, hostId, isHost, send, humans, board, P, remotes, sims, views, nextId, shots, fbs, rings, souls, drops, decals, clock, wave, ws, wt, queue, spawnT, alive, left, limit, endT, sendT, snapT, lastSnapAt, banner, bannerT, flashT, shake;
  let held = [false, false, false], edge = [false, false, false], wheelN = 0, oldFov = 72, bossRef = null, won = false;
  const chip = createChip(.16);

  // ---------- materials and little helpers ----------
  const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e, fog: false });
  const GLOW = (c, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, fog: false });
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const put = (p, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); p.add(m); return m; };
  function tex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
    return t;
  }
  const radial = (inner, outer) => tex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(.35, outer); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });

  // ---------- the nave ----------
  let partMesh, sprites = [], decalPool = [], vm = null, ringMat, stakeGeo, stakeMat, grenGeo, grenMat, headProto, fbTex, soulTex, flashTex, iceMat;
  const R0 = rng(77);
  function build() {
    built = true;
    const g = new THREE.Group(); root.add(g);
    const stoneTex = tex(256, 256, (x, w, h) => {
      x.fillStyle = '#4a4046'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) {
        const v = 58 + R0() * 26, o = (j % 2) * 32;
        x.fillStyle = `rgb(${v + 6},${v - 4},${v})`; x.fillRect(i * 64 + o + 2, j * 32 + 2, 60, 28);
      }
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(20,10,14,${.2 + R0() * .3})`; x.fillRect(R0() * w, R0() * h, 2 + R0() * 10, 2); }
    }, [6, 3]);
    const floorTex = tex(256, 256, (x, w, h) => {
      x.fillStyle = '#231c20'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 52 + R0() * 22; x.fillStyle = `rgb(${v},${v - 8},${v - 4})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
      x.strokeStyle = 'rgba(150,20,20,.5)'; x.lineWidth = 2;
      for (let k = 0; k < 6; k++) { x.beginPath(); let a = R0() * w, b = R0() * h; x.moveTo(a, b); for (let s = 0; s < 5; s++) { a += (R0() - .5) * 50; b += (R0() - .5) * 50; x.lineTo(a, b); } x.stroke(); }
    }, [HX / 2, HZ / 2]);
    const stone = new THREE.MeshLambertMaterial({ color: 0xb8a8b0, map: stoneTex, emissive: 0x1c1418, fog: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0x8a7a84, map: stoneTex, emissive: 0x140e12, fog: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0xc8b8bc, map: floorTex, emissive: 0x1a1216, fog: false }));
    floor.rotation.x = -Math.PI / 2; floor.userData.keep = true; g.add(floor);
    // the walls, the vault
    for (const [w, d, x, z] of [[HX * 2 + 2, 1, 0, -HZ - .5], [HX * 2 + 2, 1, 0, HZ + .5], [1, HZ * 2, -HX - .5, 0], [1, HZ * 2, HX + .5, 0]]) put(g, B(w, HH, d), stone, x, HH / 2, z);
    put(g, B(HX * 2, .5, HZ * 2), dark, 0, HH, 0);
    // the aisles' lower ceilings and the pointed vault of the nave
    for (const s of [-1, 1]) put(g, B(7, .4, HZ * 2), dark, s * 10.5, 10, 0);
    const vg = new THREE.BufferGeometry(), vp = [], vi = [], N = 16;
    for (let a = 0; a <= N; a++) for (const e of [0, 1]) { const th = Math.PI * (1 - a / N); vp.push(7 * Math.cos(th), 10 + 5.5 * Math.sin(th), e ? HZ : -HZ); }
    for (let a = 0; a < N; a++) { const k = a * 2; vi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setIndex(vi); vg.computeVertexNormals();
    const vault = new THREE.Mesh(vg, new THREE.MeshLambertMaterial({ color: 0x5a4a54, emissive: 0x100a0e, side: THREE.DoubleSide, fog: false })); vault.userData.keep = true; g.add(vault);
    // the pillars, their arches, the ribs
    const pillarG = new THREE.CylinderGeometry(.75, .8, 10, 10);
    for (const [x, z] of PILLARS) {
      put(g, pillarG, stone, x, 5, z);
      put(g, B(1.9, .5, 1.9), dark, x, .25, z); put(g, B(1.9, .5, 1.9), dark, x, 9.9, z);
    }
    for (const s of [-1, 1]) for (let z = -21; z < 21; z += 7) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.5, .3, 6, 16, Math.PI), dark); arch.position.set(s * 7, 9.9, z + 3.5); arch.rotation.y = Math.PI / 2; arch.scale.set(1, .5, 1); g.add(arch);
    }
    for (let z = -21; z <= 21; z += 7) { const rib = new THREE.Mesh(new THREE.TorusGeometry(7, .25, 5, 18, Math.PI), dark); rib.position.set(0, 10, z); rib.scale.set(1, .78, 1); g.add(rib); }
    // the dais, its steps, the altar with its candles, the great rose window
    put(g, B(HX * 2, 1, 8), dark, 0, .5, 24);
    for (let k = 0; k < 3; k++) put(g, B(HX * 2, (k + 1) / 3, .5), stone, 0, (k + 1) / 6, 18.75 + k * .5);
    put(g, B(3.6, 1.15, 1.6), dark, 0, 1.575, 24.4);
    put(g, B(3.8, .08, 1.8), GLOW(0x5a0808, 1), 0, 2.19, 24.4);
    const crossM = GLOW(0xff3020, 1.4);
    put(g, B(.25, 3.2, .1), crossM, 0, 5.2, HZ - .05).userData.keep = true;
    put(g, B(1.8, .25, .1), crossM, 0, 4.2, HZ - .05).userData.keep = true;
    const rose = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, map: tex(256, 256, (x) => {
      x.fillStyle = '#1a0408'; x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + r * .26, d = 30 + r * 34; x.fillStyle = ['#ff2a1a', '#a8102a', '#ff8a1a', '#6a1aa8'][(k + r) % 4]; x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 14 - r * 2, 0, TAU); x.fill(); }
      x.fillStyle = '#ffd040'; x.beginPath(); x.arc(128, 128, 20, 0, TAU); x.fill();
      x.strokeStyle = '#000'; x.lineWidth = 6; x.beginPath(); x.arc(128, 128, 124, 0, TAU); x.stroke();
    }) }));
    rose.position.set(0, 11, HZ - .02); rose.rotation.y = Math.PI; rose.userData.keep = true; g.add(rose);
    // tall lancet windows glowing red along the aisles, the doors at the back
    const winTex = tex(64, 192, (x) => { x.fillStyle = '#12040a'; x.fillRect(0, 0, 64, 192); for (let j = 0; j < 12; j++) for (let i = 0; i < 4; i++) { x.fillStyle = ['#b01818', '#6a1030', '#d85a18', '#3a0a4a'][(i * 3 + j) % 4]; x.fillRect(i * 16 + 2, j * 16 + 2, 12, 12); } });
    const winM = new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false, fog: false });
    const lancet = (w, h) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w * .7); sh.quadraticCurveTo(w / 2, h - w * .15, 0, h); sh.quadraticCurveTo(-w / 2, h - w * .15, -w / 2, h - w * .7); sh.closePath(); const geo = new THREE.ShapeGeometry(sh, 4), P2 = geo.attributes.position, U = geo.attributes.uv; for (let k = 0; k < P2.count; k++) U.setXY(k, P2.getX(k) / w + .5, P2.getY(k) / h); return geo; };
    const lg = lancet(1.6, 5.5);
    for (const s of [-1, 1]) for (let z = -17.5; z <= 17.5; z += 7) { const w = new THREE.Mesh(lg, winM); w.position.set(s * (HX - .02), 3, z); w.rotation.y = -s * Math.PI / 2; w.userData.keep = true; g.add(w); }
    const doorM = L(0x2a1810, 0x0a0404);
    for (const s of [-1, 1]) put(g, B(2.4, 6, .3), doorM, s * 1.25, 3, -HZ + .15);
    for (let k = 0; k < 3; k++) put(g, B(5.4, .12, .4), L(0x3a3a40, 0x0a0a0c), 0, 1.5 + k * 1.6, -HZ + .3);
    // pews and tombs
    const wood = L(0x3a2418, 0x0c0604), tomb = L(0x6a6068, 0x141014);
    for (const [x0, z0, x1, z1, top] of BOXES.slice(0, 6)) { put(g, B(x1 - x0, .08, z1 - z0), wood, (x0 + x1) / 2, .45, (z0 + z1) / 2); put(g, B(x1 - x0, top, .08), wood, (x0 + x1) / 2, top / 2, z1); for (const x of [x0 + .1, x1 - .1]) put(g, B(.08, .45, z1 - z0), wood, x, .22, (z0 + z1) / 2); }
    for (const [x0, z0, x1, z1, top] of BOXES.slice(6, 10)) { put(g, B(x1 - x0, top, z1 - z0), tomb, (x0 + x1) / 2, top / 2, (z0 + z1) / 2); put(g, B(x1 - x0 - .3, .15, z1 - z0 - .3), dark, (x0 + x1) / 2, top + .07, (z0 + z1) / 2); }
    // braziers and candles: fire you see, no lamps (a light that comes and goes recompiles everything)
    const fireTex = radial('rgba(255,230,160,1)', 'rgba(255,90,20,.6)');
    const iron = L(0x2a2426, 0x060404);
    for (const [x, z] of [[-4, -22], [4, -22], [-4, 16], [4, 16], [-12, -16], [12, -16], [-12, 2], [12, 2], [-12, 20], [12, 20]]) {
      put(g, new THREE.CylinderGeometry(.35, .15, .5, 8), iron, x, 1.25, z); put(g, new THREE.CylinderGeometry(.06, .1, 1, 6), iron, x, .5, z);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      f.position.set(x, 1.9, z); f.scale.set(1.4, 1.9, 1); f.userData.keep = true; f.userData.fire = Math.random() * 6; g.add(f); sprites.push(f);
    }
    // the spawn circles: pentagrams in the floor
    const penta = tex(128, 128, (x) => {
      x.strokeStyle = '#ff2a10'; x.lineWidth = 4; x.shadowColor = '#ff2a10'; x.shadowBlur = 8;
      x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.stroke();
      x.beginPath(); for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; x[k ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); } x.stroke();
    });
    const pm = new THREE.MeshBasicMaterial({ map: penta, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
    for (const [x, z] of SPAWNS) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), pm); p.rotation.x = -Math.PI / 2; p.position.set(x, heightAt(x, z) + .03, z); p.userData.keep = true; g.add(p); }
    mergeStatic(g, (o) => o.userData.keep);
    // pools: particles, sprites, decals, projectiles
    partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x201010, fog: false }), 420);
    partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); partMesh.count = 0; partMesh.frustumCulled = false;
    partMesh.setColorAt(0, new THREE.Color()); root.add(partMesh);
    const decalM = new THREE.MeshBasicMaterial({ color: 0x3a0404, transparent: true, opacity: .85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const dg = new THREE.CircleGeometry(1, 10);
    for (let k = 0; k < 40; k++) { const d = new THREE.Mesh(dg, decalM); d.rotation.x = -Math.PI / 2; d.visible = false; root.add(d); decalPool.push(d); }
    fbTex = radial('rgba(255,240,180,1)', 'rgba(255,90,10,.7)');
    soulTex = radial('rgba(220,255,220,1)', 'rgba(60,255,120,.6)');
    flashTex = radial('rgba(255,255,220,1)', 'rgba(255,170,60,.6)');
    stakeGeo = new THREE.CylinderGeometry(.025, .04, .8, 6); stakeGeo.rotateX(Math.PI / 2);
    stakeMat = L(0x8a6a44, 0x1a1008);
    grenGeo = new THREE.SphereGeometry(.13, 10, 8); grenMat = L(0x3a4a2a, 0x0a1004);
    iceMat = new THREE.MeshLambertMaterial({ color: 0xa8e0ff, emissive: 0x2a5a8a, transparent: true, opacity: .85, fog: false });
    ringMat = new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: .8, toneMapped: false, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    headProto = bladeHead(); headProto.visible = false;
    buildViewModel();
  }
  function bladeHead() {
    const h = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xd0d0d8, emissive: 0x303038, fog: false });
    put(h, new THREE.CylinderGeometry(.07, .07, .12, 10), L(0x303034, 0x080808), 0, 0, 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) { const b = put(h, B(.05, .34, .015), steel, 0, 0, 0); b.rotation.z = k * Math.PI / 2; b.position.set(Math.sin(k * Math.PI / 2) * .17, Math.cos(k * Math.PI / 2) * .17, 0); }
    return h;
  }
  // the arena's floor, the dais and its steps
  function heightAt(x, z) { return z >= 20 ? 1 : z > 18.5 ? Math.floor((z - 18.5) / .5 + 1) / 3 : 0; }
  function floorAt(x, z, feet) {
    let y = heightAt(x, z);
    for (const [x0, z0, x1, z1, top] of BOXES) if (x > x0 - .15 && x < x1 + .15 && z > z0 - .15 && z < z1 + .15 && feet >= top - .35) y = Math.max(y, top);
    return y;
  }
  // a circle in the nave: kept off the walls, the pillars, and whatever is too tall to step on
  function collide(o, r, feet) {
    o.x = Math.max(-HX + r, Math.min(HX - r, o.x)); o.z = Math.max(-HZ + r, Math.min(HZ - r, o.z));
    for (const [px, pz, pr] of PILLARS) {
      const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz), m = r + pr;
      if (d < m && d > 1e-4) { o.x = px + dx / d * m; o.z = pz + dz / d * m; }
    }
    for (const [x0, z0, x1, z1, top] of BOXES) {
      if (feet >= top - .35) continue;
      const cx = Math.max(x0, Math.min(x1, o.x)), cz = Math.max(z0, Math.min(z1, o.z));
      const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
      if (d < r) { if (d > 1e-4) { o.x = cx + dx / d * r; o.z = cz + dz / d * r; } else o.x = o.x < (x0 + x1) / 2 ? x0 - r : x1 + r; }
    }
  }
  // the first thing a ray meets in the nave: walls, floor, vault, pillars (t, or Infinity)
  function rayWorld(o, d, max = 80) {
    let t = max;
    const planes = [[d.x, HX - o.x], [-d.x, HX + o.x], [d.z, HZ - o.z], [-d.z, HZ + o.z], [d.y, HH - .3 - o.y]];
    for (const [dv, dist] of planes) if (dv > 1e-6) t = Math.min(t, dist / dv);
    if (d.y < -1e-6) t = Math.min(t, (o.y - heightAt(o.x, o.z)) / -d.y);
    const a = d.x * d.x + d.z * d.z;
    if (a > 1e-8) for (const [px, pz, pr] of PILLARS) {
      const fx = o.x - px, fz = o.z - pz, b = fx * d.x + fz * d.z, c = fx * fx + fz * fz - pr * pr, disc = b * b - a * c;
      if (disc < 0) continue;
      const tt = (-b - Math.sqrt(disc)) / a;
      if (tt > 0 && tt < t && o.y + d.y * tt < 10) t = tt;
    }
    return t;
  }
  // a ray against a standing capsule: the distance along the ray, or null
  function rayCapsule(o, d, x, y, z, r, h) {
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-8) return null;
    const fx = o.x - x, fz = o.z - z, b = fx * d.x + fz * d.z, c = fx * fx + fz * fz - r * r, disc = b * b - a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    for (const t of [(-b - s) / a, (-b + s) / a]) { if (t < 0) continue; const yy = o.y + d.y * t; if (yy >= y && yy <= y + h) return t; }
    return null;
  }

  // ---------- the models ----------
  const skin = (k, color) => {
    const g = new THREE.Group(), parts = {};
    const limb = (mat, w, len, x, y, z, name, pivotOnly) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); const m = put(p, B(w, len, w), mat, 0, -len / 2, 0); parts[name] = p; return m; };
    if (k === 'sk') {
      const bone = L(0xe8e0c8, 0x2a241c), eye = GLOW(0xff2010);
      limb(bone, .09, .9, -.13, .9, 0, 'll'); limb(bone, .09, .9, .13, .9, 0, 'rl');
      const t = new THREE.Group(); t.position.y = .9; g.add(t); parts.body = t;
      put(t, B(.06, .6, .06), bone, 0, .3, 0);
      for (let k2 = 0; k2 < 4; k2++) put(t, B(.44 - k2 * .04, .05, .26), bone, 0, .32 + k2 * .09, 0);
      put(t, B(.36, .08, .14), bone, 0, .05, 0);
      const head = new THREE.Group(); head.position.y = .82; t.add(head); parts.head = head;
      put(head, new THREE.SphereGeometry(.15, 10, 8), bone, 0, .08, 0); put(head, B(.16, .07, .12), bone, 0, -.05, .04);
      put(head, new THREE.SphereGeometry(.03, 6, 4), eye, -.055, .08, .12); put(head, new THREE.SphereGeometry(.03, 6, 4), eye, .055, .08, .12);
      const la = new THREE.Group(); la.position.set(-.27, .66, 0); t.add(la); put(la, B(.08, .7, .08), bone, 0, -.35, 0); parts.la = la;
      const ra = new THREE.Group(); ra.position.set(.27, .66, 0); t.add(ra); put(ra, B(.08, .7, .08), bone, 0, -.35, 0); parts.ra = ra;
      put(ra, B(.05, .75, .1), L(0x7a6a5a, 0x100c08), 0, -.75, .25, Math.PI / 2);
    } else if (k === 'mo' || k === 'bo') {
      const robe = L(k === 'bo' ? 0x141014 : 0x3a2618, k === 'bo' ? 0x040204 : 0x0c0604), eye = GLOW(k === 'bo' ? 0xff3010 : 0x40ff60);
      const t = new THREE.Group(); g.add(t); parts.body = t;
      put(t, new THREE.ConeGeometry(.5, 1.55, 10, 1, true), robe, 0, .78, 0);
      put(t, new THREE.CylinderGeometry(.26, .4, .5, 10), robe, 0, 1.4, 0);
      const head = new THREE.Group(); head.position.y = 1.72; t.add(head); parts.head = head;
      put(head, new THREE.SphereGeometry(.24, 10, 8), robe, 0, 0, 0); put(head, new THREE.ConeGeometry(.2, .35, 8), robe, 0, .22, -.05, -.4);
      put(head, new THREE.SphereGeometry(.15, 8, 6), L(0x080406), 0, -.02, .12);
      put(head, new THREE.SphereGeometry(.035, 6, 4), eye, -.06, 0, .25); put(head, new THREE.SphereGeometry(.035, 6, 4), eye, .06, 0, .25);
      const la = new THREE.Group(); la.position.set(-.33, 1.52, 0); t.add(la); put(la, new THREE.CylinderGeometry(.08, .12, .65, 6), robe, 0, -.3, 0); parts.la = la;
      const ra = new THREE.Group(); ra.position.set(.33, 1.52, 0); t.add(ra); put(ra, new THREE.CylinderGeometry(.08, .12, .65, 6), robe, 0, -.3, 0); parts.ra = ra;
      if (k === 'mo') { put(la, new THREE.SphereGeometry(.09, 8, 6), GLOW(0xffa030, 1.8), 0, -.68, .06); }
      else { put(ra, new THREE.CylinderGeometry(.04, .04, 1.9, 6), L(0x4a3020, 0x0a0604), 0, -.7, .3, Math.PI / 2); put(ra, B(.08, .7, .9), L(0xa8a8b0, 0x202024), 0, -.7, 1.15); }
    } else if (k === 'ga') {
      const st = L(0x6a6a72, 0x141418), eye = GLOW(0xffd020);
      const t = new THREE.Group(); t.position.y = .55; g.add(t); parts.body = t;
      const b = put(t, new THREE.SphereGeometry(.35, 10, 8), st, 0, 0, 0); b.scale.set(1, .8, 1.3);
      const head = new THREE.Group(); head.position.set(0, .2, .38); t.add(head); parts.head = head;
      put(head, new THREE.SphereGeometry(.18, 8, 6), st, 0, 0, 0);
      put(head, new THREE.ConeGeometry(.05, .22, 5), st, -.1, .16, -.04, -.5); put(head, new THREE.ConeGeometry(.05, .22, 5), st, .1, .16, -.04, -.5);
      put(head, new THREE.SphereGeometry(.035, 6, 4), eye, -.07, .02, .15); put(head, new THREE.SphereGeometry(.035, 6, 4), eye, .07, .02, .15);
      const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.1, .2, -.3, .9, -.35, -.2, 0, 0, 0, .9, -.35, -.2, .3, -.3, -.1], 3)); wingG.computeVertexNormals();
      const wm = new THREE.MeshLambertMaterial({ color: 0x4a4a52, emissive: 0x0c0c10, side: THREE.DoubleSide, fog: false });
      const la = new THREE.Group(); la.position.set(-.2, .15, 0); t.add(la); const lw = new THREE.Mesh(wingG, wm); lw.scale.x = -1; la.add(lw); parts.la = la;
      const ra = new THREE.Group(); ra.position.set(.2, .15, 0); t.add(ra); ra.add(new THREE.Mesh(wingG, wm)); parts.ra = ra;
      put(t, new THREE.ConeGeometry(.06, .6, 5), st, 0, -.1, -.6, -Math.PI / 2 - .4);
    } else if (k === 'de' || k === 'ar') {
      const red = L(k === 'ar' ? 0x4a0a0a : 0x8a1a12, k === 'ar' ? 0x1a0202 : 0x2a0604), horn = L(0x2a2020, 0x080404), eye = GLOW(0xffe020);
      limb(red, .26, 1.1, -.28, 1.1, 0, 'll'); limb(red, .26, 1.1, .28, 1.1, 0, 'rl');
      const t = new THREE.Group(); t.position.y = 1.1; g.add(t); parts.body = t;
      const torso = put(t, new THREE.SphereGeometry(.55, 10, 8), red, 0, .55, 0); torso.scale.set(1.15, 1.1, .8);
      if (k === 'ar') put(t, new THREE.SphereGeometry(.22, 10, 8), GLOW(0xff6a10, 2), 0, .6, .38);
      const head = new THREE.Group(); head.position.y = 1.3; t.add(head); parts.head = head;
      put(head, B(.42, .38, .4), red, 0, 0, 0);
      put(head, new THREE.ConeGeometry(.08, .45, 6), horn, -.2, .3, 0, 0, 0, .5); put(head, new THREE.ConeGeometry(.08, .45, 6), horn, .2, .3, 0, 0, 0, -.5);
      put(head, B(.08, .05, .02), eye, -.1, .04, .21); put(head, B(.08, .05, .02), eye, .1, .04, .21);
      const la = new THREE.Group(); la.position.set(-.7, 1.05, 0); t.add(la); put(la, B(.22, .95, .22), red, 0, -.45, 0); put(la, new THREE.ConeGeometry(.09, .3, 4), horn, 0, -1, .08, Math.PI); parts.la = la;
      const ra = new THREE.Group(); ra.position.set(.7, 1.05, 0); t.add(ra); put(ra, B(.22, .95, .22), red, 0, -.45, 0); put(ra, new THREE.ConeGeometry(.09, .3, 4), horn, 0, -1, .08, Math.PI); parts.ra = ra;
      if (k === 'ar') {
        const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2.2, 1.2, -.4, 2, -.8, -.3, 0, 0, 0, 2, -.8, -.3, .6, -.9, -.1], 3)); wingG.computeVertexNormals();
        const wm = new THREE.MeshLambertMaterial({ color: 0x2a0606, emissive: 0x0a0202, side: THREE.DoubleSide, fog: false });
        for (const s of [-1, 1]) { const w = new THREE.Mesh(wingG, wm); w.scale.x = s; w.position.set(s * .3, .9, -.35); t.add(w); }
      }
    } else {
      // a hunter: long coat in the player's colour, a wide hat
      const coat = L(color, new THREE.Color(color).multiplyScalar(.15).getHex()), dk = L(0x1a1416, 0x040304), sk = L(0xe0b090, 0x201008);
      limb(dk, .14, .85, -.12, .85, 0, 'll'); limb(dk, .14, .85, .12, .85, 0, 'rl');
      const t = new THREE.Group(); t.position.y = .85; g.add(t); parts.body = t;
      put(t, new THREE.CylinderGeometry(.24, .34, .8, 8), coat, 0, .3, 0);
      put(t, new THREE.CylinderGeometry(.26, .24, .1, 8), dk, 0, .02, 0);
      const head = new THREE.Group(); head.position.y = .82; t.add(head); parts.head = head;
      put(head, new THREE.SphereGeometry(.15, 10, 8), sk, 0, 0, 0);
      put(head, new THREE.CylinderGeometry(.34, .34, .03, 12), dk, 0, .11, 0); put(head, new THREE.CylinderGeometry(.15, .17, .2, 10), dk, 0, .22, 0);
      const la = new THREE.Group(); la.position.set(-.3, .62, 0); t.add(la); put(la, B(.11, .6, .11), coat, 0, -.28, 0); parts.la = la;
      const ra = new THREE.Group(); ra.position.set(.3, .62, 0); t.add(ra); put(ra, B(.11, .6, .11), coat, 0, -.28, 0); parts.ra = ra;
      put(ra, B(.08, .1, .6), dk, 0, -.55, .25);
    }
    const sc = k === 'bo' ? 2.1 : k === 'ar' ? 1.95 : 1;
    g.scale.setScalar(sc);
    g.userData.parts = parts;
    return g;
  }
  // limbs swing with the stride, the right arm swings when it strikes, wings flap
  function animate(m, k, speed, t, atk, dt) {
    const p = m.userData.parts;
    if (!p) return;
    m.userData.ph = (m.userData.ph || 0) + speed * dt * (k === 'ga' ? 0 : 2.4);
    const s = Math.sin(m.userData.ph), sw = Math.min(1, speed / 3);
    if (p.ll) { p.ll.rotation.x = s * .7 * sw; p.rl.rotation.x = -s * .7 * sw; }
    if (k === 'ga') { const f = Math.sin(t * 14) * .7; p.la.rotation.z = f; p.ra.rotation.z = -f; return; }
    if (p.la) { p.la.rotation.x = -s * .5 * sw; p.ra.rotation.x = atk > 0 ? -2.2 + atk * 3 : s * .5 * sw; }
    if (k === 'mo' || k === 'bo') p.body.position.y = Math.sin(t * 3) * .04;
  }

  // ---------- the hunter's weapons, held in view ----------
  let vmParts = {};
  function buildViewModel() {
    vm = new THREE.Group(); vm.visible = false;
    const mat = (c, e = 0x101010) => new THREE.MeshLambertMaterial({ color: c, emissive: e, depthTest: false, transparent: true, fog: false });
    const glow = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), depthTest: false, transparent: true, toneMapped: false, fog: false });
    // the painkiller
    const pk = new THREE.Group(); vm.add(pk);
    put(pk, new THREE.CylinderGeometry(.035, .045, .5, 8), mat(0x2a2224), 0, -.05, .1, Math.PI / 2 - .2);
    put(pk, B(.09, .1, .3), mat(0x4a3a3a), 0, 0, -.15);
    const head = bladeHead(); head.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.depthTest = false; o.material.transparent = true; } });
    head.position.set(0, .01, -.36); head.scale.setScalar(.8); pk.add(head);
    // the stake gun: a long wooden body, iron bands, a stake ready
    const st = new THREE.Group(); vm.add(st);
    put(st, B(.1, .12, .7), mat(0x5a3a22), 0, 0, -.1);
    for (const z of [-.35, -.1, .15]) put(st, B(.12, .14, .04), mat(0x3a3a40), 0, 0, z);
    const stake = put(st, new THREE.ConeGeometry(.03, .3, 6), mat(0xc8a878), 0, .02, -.55, -Math.PI / 2);
    put(st, new THREE.CylinderGeometry(.06, .06, .16, 10), mat(0x2a3a22), 0, -.1, -.2, Math.PI / 2);
    // the shotgun: two barrels, a stock, the frost tube
    const sg = new THREE.Group(); vm.add(sg);
    for (const x of [-.03, .03]) put(sg, new THREE.CylinderGeometry(.028, .028, .6, 8), mat(0x2a2a30), x, .02, -.3, Math.PI / 2);
    put(sg, B(.1, .1, .35), mat(0x5a3a22), 0, -.03, .05);
    const frost = put(sg, new THREE.CylinderGeometry(.018, .018, .4, 6), glow(0x60c0ff), 0, -.045, -.25, Math.PI / 2);
    vm.traverse((o) => { o.renderOrder = 999; });
    vm.scale.setScalar(.9);
    vmParts = { pk, st, sg, head, stake, frost, list: [pk, st, sg] };
    camera.add(vm);
  }

  // ---------- particles, sprites, decals ----------
  const parts = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
  function burst(x, y, z, n, color, speed = 4, size = .08, life = 1.2) {
    for (let k = 0; k < n && parts.length < 420; k++) {
      const a = Math.random() * TAU, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), v = speed * (.4 + Math.random() * .8);
      parts.push({ x, y, z, vx: Math.cos(a) * r * v, vy: Math.abs(u) * v + 1.5, vz: Math.sin(a) * r * v, t: 0, life: life * (.6 + Math.random() * .6), s: size * (.6 + Math.random() * .8), c: color, rot: Math.random() * 6 });
    }
  }
  const glows = [];
  function glow(x, y, z, texR, size, life, color = 0xffffff, follow = null) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texR, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); root.add(s);
    const g = { s, t: 0, life, size, follow }; glows.push(g); return g;
  }
  let decalN = 0;
  function decal(x, z, r) {
    const d = decalPool[decalN++ % decalPool.length];
    d.visible = true; d.position.set(x, floorAt(x, z, 9) + .015 + (decalN % 7) * .001, z); d.scale.setScalar(r); d.rotation.z = Math.random() * 6;
  }
  function stepFx(dt) {
    let n = 0;
    for (const p of parts) {
      p.t += dt;
      if (p.t > p.life) continue;
      p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const fl = heightAt(p.x, p.z);
      if (p.y < fl + p.s / 2) { p.y = fl + p.s / 2; p.vy *= -.3; p.vx *= .6; p.vz *= .6; }
      p.rot += dt * 5;
      _q.setFromAxisAngle(_p.set(1, 1, 0).normalize(), p.rot);
      const k = Math.min(1, (p.life - p.t) * 3);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.s * k));
      partMesh.setMatrixAt(n, _m); partMesh.setColorAt(n, _c.set(p.c)); n++;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) parts.splice(i, 1);
    partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    for (const g of glows) {
      g.t += dt;
      const k = Math.max(0, 1 - g.t / g.life);
      g.s.material.opacity = k; g.s.scale.setScalar(g.size * (g.life > .5 ? 1 : 1 + (1 - k)));
      if (g.follow) g.s.position.copy(g.follow);
    }
    for (let i = glows.length - 1; i >= 0; i--) if (glows[i].t >= glows[i].life) { root.remove(glows[i].s); glows[i].s.material.dispose(); glows.splice(i, 1); }
    for (const f of sprites) { f.userData.fire += dt * 9; const s = 1 + Math.sin(f.userData.fire) * .08 + Math.sin(f.userData.fire * 2.3) * .06; f.scale.set(1.4 * s, 1.9 * s, 1); }
  }

  // ---------- sound: a chip, noise for the guns, a slow dark pulse under it all ----------
  const sfx = {
    shotgun: () => { chip.noise(.45, { vol: 1, f: 1600 }); chip.tone(110, 40, .25, { type: 'tri', vol: .9 }); },
    stake: () => { chip.noise(.12, { vol: .5, f: 4000 }); chip.tone(320, 90, .14, { type: .125, vol: .3 }); },
    thunk: () => chip.tone(180, 60, .1, { type: 'tri', vol: .6 }),
    gren: () => chip.tone(160, 90, .12, { type: 'tri', vol: .6 }),
    boom: () => { chip.noise(.9, { vol: 1, f: 700 }); chip.tone(80, 28, .7, { type: 'tri', vol: 1 }); },
    blade: () => chip.tone(70 + Math.random() * 20, 60, .07, { type: 'saw', vol: .12 }),
    head: () => chip.tone(180, 900, .3, { type: 'saw', vol: .2 }),
    freeze: () => { chip.tone(2200, 300, .45, { type: 'sine', vol: .35 }); chip.noise(.35, { vol: .3, f: 7000 }); },
    soul: () => chip.tone(880, 1760, .12, { type: 'sine', vol: .25 }),
    morph: () => { chip.seq([40, 43, 46, 52, 55, 58], .09, { type: 'saw', vol: .35 }); chip.noise(1, { vol: .5, f: 400 }); },
    ray: () => { chip.tone(90, 45, .35, { type: 'saw', vol: .6 }); chip.noise(.3, { vol: .5, f: 900 }); },
    growl: () => chip.tone(95 + Math.random() * 30, 55, .45, { type: 'saw', vol: .22 }),
    die: () => { chip.noise(.3, { vol: .45, f: 1100 }); chip.tone(260, 70, .25, { type: .5, vol: .25 }); },
    bones: () => { for (let k = 0; k < 4; k++) chip.tone(900 + Math.random() * 600, 700, .04, { type: .125, vol: .15, at: (chip.ctx?.currentTime || 0) + k * .045 }); },
    hurt: () => { chip.tone(220, 110, .18, { type: .5, vol: .4 }); chip.noise(.12, { vol: .3, f: 900 }); },
    hit: () => chip.tone(1500, 1500, .03, { type: .125, vol: .12 }),
    fire: () => chip.tone(300, 120, .3, { type: 'saw', vol: .2 }),
    slam: () => { chip.noise(1.1, { vol: .9, f: 260 }); chip.tone(60, 25, .9, { type: 'tri', vol: 1 }); },
    bell: () => chip.seq([45, 57, 45], .5, { type: 'sine', vol: .5 }),
    pick: () => chip.seq([72, 79], .05, { type: .25, vol: .25 }),
  };
  let musicT = 0, musicN = 0;
  function music() {
    const ctx = chip.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (musicT < now - .1) musicT = now + .1;
    const boss = bossRef && ws === 'fight';
    while (musicT < now + .3) {
      const step = boss ? .22 : .3, n = musicN % 16, root0 = [38, 38, 41, 36][(musicN >> 4) % 4];
      if (n % 4 === 0) chip.tone(chip.hz(root0 - 12), chip.hz(root0 - 12), step * 3.6, { type: 'saw', vol: .1, at: musicT });
      if (n % 2 === 0) chip.noise(.08, { vol: boss ? .22 : .14, f: 180, at: musicT });
      if (boss && n % 4 === 2) chip.noise(.05, { vol: .12, f: 5000, at: musicT });
      if (n === 8 || n === 14) chip.tone(chip.hz(root0 + 12), chip.hz(root0 + 11), step * 1.8, { type: .25, vol: .05, at: musicT });
      musicT += step; musicN++;
    }
  }

  // ---------- the life of a game ----------
  function start({ seed: sd = 1, humans: hs = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stop();
    if (!built) build();
    root.visible = true;
    mode = opts.mode === 'carnage' ? 'carnage' : 'croisade';
    seed = sd; R = rng(sd); meId = mid; send = s; humans = hs;
    hostId = hostOf(hs, h); isHost = hostId === meId;
    board = new Map();
    for (const hu of hs) board.set(hu.id, { name: hu.me ? 'toi' : hu.name, color: hu.color ?? 0xc8581a, score: 0, frags: 0, deaths: 0, me: !!hu.me });
    const me = hs.find((x) => x.me) || hs[0];
    const slot = Math.max(0, hs.indexOf(me));
    P = { x: (slot % 4 - 1.5) * 2, y: 0, z: -24, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0, ground: true, hp: 100, souls: 0, morph: 0, weapon: 0, last: 1, cd: 0, cd2: 0, alive: true, deadT: 0, bob: 0, landT: 0, swap: 0, blade: 0, bladeT: 0, jumpHeld: false, ammo: { stake: 15, gren: 4, shell: 16, frz: 3 }, color: me?.color ?? 0xc8581a, hurtBy: null };
    remotes = new Map();
    for (const hu of hs) if (!hu.me) remotes.set(hu.id, { id: hu.id, name: hu.name, color: hu.color ?? 0xffffff, snaps: [], x: 0, y: 0, z: 0, yaw: 0, alive: true, w: 0, mesh: null });
    sims = []; views = new Map(); nextId = 1; shots = []; fbs = []; rings = []; souls = []; drops = [];
    clock = 0; wave = 0; ws = 'intro'; wt = 2.5; queue = []; spawnT = 0; left = 0; endT = 0; sendT = 0; snapT = 0; lastSnapAt = performance.now(); banner = ''; bannerT = 0; flashT = 0; shake = 0; won = false; bossRef = null;
    limit = mode === 'carnage' ? 180 : 720;
    held = [false, false, false]; edge = [false, false, false]; wheelN = 0; respawnBots = [];
    for (const d of decalPool) d.visible = false;
    // the bots of the carnage: enough hunters to make four
    if (mode === 'carnage' && isHost) for (let k = hs.length; k < 4; k++) spawnFoe('bt', null, { name: BOT_NAMES[k % BOT_NAMES.length], color: BOT_COLORS[k % BOT_COLORS.length] });
    running = true; ended = false;
    camera.position.set(PK_ARENA.x + P.x, PK_ARENA.y + EYE, PK_ARENA.z + P.z); camera.rotation.set(0, P.yaw, 0, 'YXZ');
    showBanner(mode === 'carnage' ? 'carnage' : 'la nef maudite', 2.5);
  }
  function stop() {
    if (running || hudOn) { running = false; }
    root.visible = false;
    if (vm) vm.visible = false;
    if (hudOn) { hudEl?.remove(); hudEl = null; hudOn = false; camera.fov = oldFov; camera.updateProjectionMatrix(); removeEventListener('wheel', onWheel); }
    for (const f of sims || []) root.remove(f.mesh);
    for (const v of views?.values() || []) root.remove(v.mesh);
    for (const r of remotes?.values() || []) if (r.mesh) root.remove(r.mesh);
    for (const s of shots || []) if (s.mesh) root.remove(s.mesh);
    for (const f of fbs || []) root.remove(f.mesh);
    for (const r of rings || []) root.remove(r.mesh);
    for (const s of souls || []) root.remove(s.sp);
    for (const d of drops || []) root.remove(d.mesh);
    for (const g of glows) { root.remove(g.s); g.s.material.dispose(); }
    glows.length = 0; parts.length = 0; if (partMesh) partMesh.count = 0;
    sims = []; views = new Map(); shots = []; fbs = []; rings = []; souls = []; drops = [];
    chip.close();
  }
  function onWheel(e) { if (running && P?.alive) wheelN += Math.sign(e.deltaY); }

  // ---------- the loop ----------
  function update(dt, keys) {
    if (!running) return;
    dt = Math.min(dt, .05);
    if (!hudOn && dt > 0) {
      hudOn = true; makeHud(); oldFov = camera.fov; camera.fov = Math.max(oldFov, 84); camera.updateProjectionMatrix();
      addEventListener('wheel', onWheel, { passive: true });
      chip.init();
    }
    if (vm) vm.visible = P.alive && !P.morph;
    clock += dt;
    stepMe(dt, keys);
    if (isHost) { hostStep(dt); } else { stepViews(dt); if (performance.now() - lastSnapAt > 6000 && clock > 8) takeOver(); }
    stepRemotes(dt);
    stepShots(dt); stepFireballs(dt); stepRings(dt); stepSouls(dt); stepFx(dt);
    placeCamera(dt);
    if (hudOn) { drawHud(); music(); }
    sendT += dt;
    if (sendT >= PSEND) {
      sendT = 0;
      send({ t: 'p', x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), a: +P.yaw.toFixed(2), b: +P.pitch.toFixed(2), w: P.morph ? 3 : P.weapon, l: P.alive ? 1 : 0 });
    }
    if (bannerT > 0) bannerT -= dt;
    if (flashT > 0) flashT -= dt;
    // the end: said by the host; the others give up waiting after a while
    if (endT > 0) { endT -= dt; if (endT <= 0) finish(); }
    else if (clock > limit + 12) finish();
  }

  // ---------- me: move like the wind, shoot everything ----------
  const fwd = new THREE.Vector3(), rightV = new THREE.Vector3(), aim = new THREE.Vector3(), eye = new THREE.Vector3();
  function stepMe(dt, keys) {
    const k = (...c) => c.some((x) => keys.has(x));
    if (!P.alive) {
      P.deadT -= dt;
      if (P.deadT <= 0) respawnMe();
      return;
    }
    // weapons: keys, the wheel, the last one
    const pick = ['Digit1', 'Digit2', 'Digit3'].findIndex((c) => keys.has(c));
    if (pick >= 0 && pick !== P.weapon) setWeapon(pick);
    if (k('KeyQ') && !P.qHeld) setWeapon(P.last);
    P.qHeld = k('KeyQ');
    if (wheelN) { setWeapon(((P.weapon + wheelN) % 3 + 3) % 3); wheelN = 0; }
    // move: quake-like ground and air acceleration, a bunny hop on landing
    const f = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0), s = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); rightV.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    let wx = fwd.x * f + rightV.x * s, wz = fwd.z * f + rightV.z * s;
    const wl = Math.hypot(wx, wz); if (wl) { wx /= wl; wz /= wl; }
    const jump = k('Space');
    const top = RUN * (P.morph ? 1.25 : 1);
    const accel = (wishspeed, a) => { const cur = P.vx * wx + P.vz * wz, add = wishspeed - cur; if (add <= 0 || !wl) return; const as = Math.min(add, a * dt * wishspeed); P.vx += as * wx; P.vz += as * wz; };
    if (P.ground) {
      if (jump && (!P.jumpHeld || P.landT < .2)) {
        // on the beat: keep the speed, and a little more
        accel(top, 11);
        const hs = Math.hypot(P.vx, P.vz);
        if (P.landT < .2 && hs > 4) { const m = Math.min(MAXH, hs * 1.07) / hs; P.vx *= m; P.vz *= m; }
        P.vy = JUMP; P.ground = false;
      } else {
        const sp = Math.hypot(P.vx, P.vz);
        if (sp > 0) { const drop = Math.max(sp, 3) * 9 * dt, ns = Math.max(0, sp - drop) / sp; P.vx *= ns; P.vz *= ns; }
        accel(top, 11);
      }
    } else accel(1.3, 70);
    P.jumpHeld = jump;
    const hs = Math.hypot(P.vx, P.vz); if (hs > MAXH) { P.vx *= MAXH / hs; P.vz *= MAXH / hs; }
    P.vy -= GRAV * dt;
    const o = { x: P.x + P.vx * dt, z: P.z + P.vz * dt };
    collide(o, PR, P.y);
    if (Math.abs(o.x - (P.x + P.vx * dt)) > 1e-4) P.vx *= .5;
    if (Math.abs(o.z - (P.z + P.vz * dt)) > 1e-4) P.vz *= .5;
    P.x = o.x; P.z = o.z;
    P.y += P.vy * dt;
    const fl = floorAt(P.x, P.z, P.y + .01);
    const was = P.ground;
    if (P.y <= fl) { if (!was && P.vy < -12) chip.noise(.08, { vol: .3, f: 600 }); P.y = fl; P.vy = 0; if (!was) P.landT = 0; P.ground = true; }
    else if (P.ground && P.y - fl < .4 && P.vy <= 0) P.y = fl;
    else P.ground = false;
    P.landT += dt;
    P.bob += hs * dt * (P.ground ? 1.6 : 0);
    if (P.morph > 0) { P.morph -= dt; if (P.morph <= 0) { P.morph = 0; showBanner('', 0); } }
    fire(dt);
    edge = [false, false, false];
  }
  function setWeapon(n) { if (n === P.weapon) return; P.last = P.weapon; P.weapon = n; P.swap = .3; sfx.pick(); }
  function respawnMe() {
    const pts = SPAWNS.map(([x, z]) => ({ x, z, d: Math.min(...[...foeList()].map((f) => Math.hypot(f.x - x, f.z - z)), 99) })).sort((a, b) => b.d - a.d);
    const sp = pts[Math.floor(Math.random() * 2)];
    Object.assign(P, { x: sp.x, z: sp.z, y: heightAt(sp.x, sp.z), vx: 0, vy: 0, vz: 0, hp: 100, alive: true, morph: 0 });
    if (mode === 'carnage') Object.assign(P.ammo, { stake: 15, gren: 4, shell: 16, frz: 3 });
  }
  function eyePos() { return eye.set(P.x, P.y + EYE, P.z); }
  function aimDir(spread = 0) {
    aim.set(0, 0, -1).applyEuler(new THREE.Euler(P.pitch + (Math.random() - .5) * spread, P.yaw + (Math.random() - .5) * spread, 0, 'YXZ'));
    return aim;
  }
  function fire(dt) {
    P.cd -= dt; P.cd2 -= dt; if (P.swap > 0) P.swap -= dt;
    const a = held[0], b = edge[2];
    if (P.swap > 0) return;
    if (P.morph) {
      if (a && P.cd <= 0) { P.cd = .28; demonRay(); }
      if (edge[2] && P.cd2 <= 0) { P.cd2 = 1.5; scream(); }
      return;
    }
    if (P.weapon === 0) {
      P.blade = a ? Math.min(1, P.blade + dt * 5) : Math.max(0, P.blade - dt * 3);
      if (a) { P.bladeT -= dt; if (P.bladeT <= 0) { P.bladeT = .1; bladeTick(); sfx.blade(); } }
      if (b && !P.headOut) launchHead();
    } else if (P.weapon === 1) {
      if (a && P.cd <= 0 && P.ammo.stake > 0) { P.cd = .7; P.ammo.stake--; shootStake(); P.kick = 1; }
      if (b && P.cd2 <= 0 && P.ammo.gren > 0) { P.cd2 = .9; P.ammo.gren--; throwGrenade(); P.kick = .6; }
    } else {
      if (a && P.cd <= 0 && P.ammo.shell > 0) { P.cd = .85; P.ammo.shell--; shotgun(); P.kick = 1.4; }
      if (b && P.cd2 <= 0 && P.ammo.frz > 0) { P.cd2 = 1.4; P.ammo.frz--; freezeShot(); P.kick = .8; }
    }
  }
  // everything that can be hit: the monsters (the host's or their copies), the bots, the others in the carnage
  function* foeList() {
    if (isHost) { for (const f of sims) if (!f.rise) yield f; } else for (const v of views.values()) yield v;
  }
  function* targets() {
    for (const f of foeList()) yield { kind: 'foe', ref: f, id: f.id, x: f.x, y: f.y, z: f.z, r: KINDS[f.k].r * (f.k === 'bo' || f.k === 'ar' ? 1 : 1), h: KINDS[f.k].h };
    if (mode === 'carnage') for (const r of remotes.values()) if (r.alive && r.snaps.length) yield { kind: 'pl', id: r.id, x: r.x, y: r.y, z: r.z, r: PR, h: 1.8 };
  }
  function hitscan(o, d, max) {
    const wall = Math.min(max, rayWorld(o, d, max));
    let best = null, bt = wall;
    for (const t of targets()) { const h = rayCapsule(o, d, t.x, t.y, t.z, t.r, t.h); if (h != null && h < bt) { bt = h; best = t; } }
    return { t: bt, target: best };
  }
  function damage(t, d, opt = {}) {
    if (!t) return;
    sfx.hit();
    if (t.kind === 'pl') { send({ t: 'hitp', to: t.id, d: Math.round(d) }); return; }
    if (isHost) applyHit(t.id, d, meId, opt);
    else send({ t: 'hit', id: t.id, d: Math.round(d), f: opt.f ? 1 : 0, kx: opt.kx ? +opt.kx.toFixed(1) : 0, kz: opt.kz ? +opt.kz.toFixed(1) : 0 });
    const col = t.ref?.k === 'sk' ? 0xe8e0c8 : t.ref?.k === 'ga' ? 0x7a7a80 : 0x8a0a0a;
    if (opt.x != null) burst(opt.x, opt.y, opt.z, 4, col, 3, .06, .6);
  }
  function bladeTick() {
    const o = eyePos(); aimDir();
    for (const t of targets()) {
      const dx = t.x - o.x, dz = t.z - o.z, dist = Math.hypot(dx, dz) - t.r;
      if (dist > 2.4) continue;
      const cos = (dx * aim.x + dz * aim.z) / (Math.hypot(dx, dz) * Math.hypot(aim.x, aim.z) || 1);
      if (cos < .72) continue;
      damage(t, 12, { x: t.x, y: t.y + t.h * .6, z: t.z });
    }
  }
  function launchHead() {
    P.headOut = true; sfx.head();
    const o = eyePos(); aimDir();
    const m = headProto.clone(); m.visible = true; root.add(m);
    shots.push({ k: 'head', mesh: m, x: o.x + aim.x * .6, y: o.y - .15, z: o.z + aim.z * .6, vx: aim.x * 30, vy: aim.y * 30, vz: aim.z * 30, t: 0, hit: new Set(), back: false, mine: true });
    send({ t: 'sh', k: 'head', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [aim.x, aim.y, aim.z].map((v) => +v.toFixed(3)) });
  }
  function shootStake(vis) {
    const o = vis ? vis.o : eyePos(), d = vis ? vis.d : aimDir(.01);
    const m = new THREE.Mesh(stakeGeo, stakeMat); root.add(m);
    shots.push({ k: 'stake', mesh: m, x: o.x + d.x * .5, y: o.y - .1, z: o.z + d.z * .5, vx: d.x * 55, vy: d.y * 55, vz: d.z * 55, t: 0, mine: !vis });
    if (!vis) { sfx.stake(); send({ t: 'sh', k: 'stake', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) }); }
  }
  function throwGrenade(vis) {
    const o = vis ? vis.o : eyePos(), d = vis ? vis.d : aimDir();
    const m = new THREE.Mesh(grenGeo, grenMat); root.add(m);
    const gl = glow(o.x, o.y, o.z, fbTex, .5, 9, 0x80ff40, m.position);
    shots.push({ k: 'gren', mesh: m, gl, x: o.x + d.x * .5, y: o.y - .1, z: o.z + d.z * .5, vx: d.x * 17, vy: d.y * 17 + 3.5, vz: d.z * 17, t: 0, mine: !vis });
    if (!vis) { sfx.gren(); send({ t: 'sh', k: 'gren', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) }); }
  }
  function shotgun(vis) {
    const o = vis ? vis.o : eyePos();
    if (!vis) { sfx.shotgun(); aimDir(); }
    const base = vis ? vis.d : aim.clone();
    glow(o.x + base.x * .8, o.y + base.y * .8 - .1, o.z + base.z * .8, flashTex, .9, .08);
    for (let k = 0; k < 10; k++) {
      const d = vis ? base.clone().add(new THREE.Vector3((Math.random() - .5) * .14, (Math.random() - .5) * .14, (Math.random() - .5) * .14)).normalize() : aimDir(.14).clone();
      const h = hitscan(o, d, 45);
      const px = o.x + d.x * h.t, py = o.y + d.y * h.t, pz = o.z + d.z * h.t;
      if (!vis && h.target) { const fall = h.t < 10 ? 1 : Math.max(.3, 1 - (h.t - 10) / 30); damage(h.target, 11 * fall, { x: px, y: py, z: pz, kx: d.x * .6, kz: d.z * .6 }); }
      else burst(px, py, pz, 1, 0xd8c8a0, 2, .04, .4);
    }
    if (!vis) send({ t: 'sh', k: 'sg', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [base.x, base.y, base.z].map((v) => +v.toFixed(3)) });
  }
  function freezeShot(vis) {
    const o = vis ? vis.o : eyePos(), d = vis ? vis.d : aimDir().clone();
    if (!vis) sfx.freeze();
    for (let k = 1; k < 10; k++) glow(o.x + d.x * k * 1.4, o.y + d.y * k * 1.4 - .1, o.z + d.z * k * 1.4, soulTex, .6 + k * .25, .5, 0x60c0ff);
    if (vis) return;
    for (const t of targets()) {
      if (t.kind !== 'foe') continue;
      const dx = t.x - o.x, dz = t.z - o.z, dist = Math.hypot(dx, dz);
      if (dist > 15) continue;
      const cos = (dx * d.x + dz * d.z) / (dist * Math.hypot(d.x, d.z) || 1);
      if (cos > .86) damage(t, 5, { f: true, x: t.x, y: t.y + 1, z: t.z });
    }
    send({ t: 'sh', k: 'frz', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) });
  }
  function demonRay() {
    sfx.ray();
    const o = eyePos(), d = aimDir().clone(), h = hitscan(o, d, 60);
    for (let k = 1; k < h.t; k += 1.5) glow(o.x + d.x * k, o.y + d.y * k - .2, o.z + d.z * k, fbTex, .8, .25, 0xff2020);
    if (h.target) damage(h.target, 400, { x: o.x + d.x * h.t, y: o.y + d.y * h.t, z: o.z + d.z * h.t });
  }
  function scream() {
    sfx.slam(); shake = .5;
    for (const t of targets()) { const dist = Math.hypot(t.x - P.x, t.z - P.z); if (dist < 7) damage(t, 160, { x: t.x, y: t.y + 1, z: t.z, kx: (t.x - P.x) / dist * 3, kz: (t.z - P.z) / dist * 3 }); }
    ringAt(P.x, P.z, 0xff2020);
  }
  function explode(x, y, z, dmg, mine) {
    sfx.boom(); shake = Math.max(shake, .35);
    glow(x, y + .3, z, fbTex, 4.5, .45); burst(x, y, z, 18, 0xff8a20, 7, .1, .8); burst(x, y, z, 8, 0x2a2a2a, 4, .15, 1.2);
    if (!mine) return;
    for (const t of targets()) {
      const dist = Math.hypot(t.x - x, t.z - z, (t.y + t.h / 2) - y) - t.r;
      if (dist < 4.5) damage(t, dmg * Math.max(.25, 1 - dist / 4.5), { x: t.x, y: t.y + 1, z: t.z, kx: (t.x - x) * .5, kz: (t.z - z) * .5 });
    }
  }

  // ---------- projectiles ----------
  const _v = new THREE.Vector3();
  function stepShots(dt) {
    for (const s of shots) {
      s.t += dt;
      if (s.k === 'stake' || s.k === 'fstake') {
        s.vy -= 4 * dt;
        const sp = Math.hypot(s.vx, s.vy, s.vz), d = _v.set(s.vx / sp, s.vy / sp, s.vz / sp), step = sp * dt;
        const o = { x: s.x, y: s.y, z: s.z };
        const wall = rayWorld(o, d, step + .05);
        let hitT = null;
        if (s.mine) for (const t of targets()) { const h = rayCapsule(o, d, t.x, t.y, t.z, t.r, t.h); if (h != null && h <= step && (hitT == null || h < hitT.h)) hitT = { h, t }; }
        // a stake through a grenade: it catches fire
        if (s.k === 'stake') for (const g of shots) if (g.k === 'gren' && !g.gone && Math.hypot(g.x - s.x, g.y - s.y, g.z - s.z) < 1.1) { g.gone = true; s.k = 'fstake'; s.gl = glow(s.x, s.y, s.z, fbTex, 1.2, 9, 0xffffff, s.mesh.position); sfx.fire(); }
        if (hitT && hitT.h < wall) {
          const t = hitT.t, px = s.x + d.x * hitT.h, py = s.y + d.y * hitT.h, pz = s.z + d.z * hitT.h;
          if (s.k === 'fstake') { damage(t, 160, { x: px, y: py, z: pz }); explode(px, py, pz, 140, true); }
          else damage(t, 110, { x: px, y: py, z: pz, kx: d.x * 2, kz: d.z * 2 });
          s.gone = true;
        } else if (wall <= step) {
          s.x += d.x * wall; s.y += d.y * wall; s.z += d.z * wall;
          if (s.k === 'fstake') explode(s.x, s.y, s.z, 140, s.mine);
          else { sfx.thunk(); burst(s.x, s.y, s.z, 3, 0xa89878, 2, .05, .5); }
          s.gone = true; s.stuck = 4;
        } else { s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }
        s.mesh.position.set(s.x, s.y, s.z); s.mesh.lookAt(s.x + d.x, s.y + d.y, s.z + d.z);
        if (s.t > 3) s.gone = true;
      } else if (s.k === 'gren') {
        s.vy -= 20 * dt;
        let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, nz = s.z + s.vz * dt;
        const o = { x: nx, z: nz }; collide(o, .13, ny);
        if (o.x !== nx) s.vx *= -.5; if (o.z !== nz) s.vz *= -.5;
        nx = o.x; nz = o.z;
        const fl = floorAt(nx, nz, ny + .2);
        if (ny < fl + .13) { ny = fl + .13; s.vy = Math.abs(s.vy) * .45; s.vx *= .7; s.vz *= .7; if (Math.abs(s.vy) > 1) sfx.thunk(); }
        if (ny > HH - .5) { ny = HH - .5; s.vy = -Math.abs(s.vy); }
        s.x = nx; s.y = ny; s.z = nz;
        s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.x += dt * 8;
        let touch = false;
        if (s.mine) for (const t of targets()) if (Math.hypot(t.x - s.x, t.z - s.z) < t.r + .2 && s.y > t.y && s.y < t.y + t.h) touch = true;
        if (touch || s.t > 1.9) { explode(s.x, s.y, s.z, 150, s.mine); s.gone = true; }
      } else if (s.k === 'head') {
        // out, through up to three of them, then home to the hand
        if (!s.back) {
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          if (s.t > .7 || rayWorld({ x: s.x, y: s.y, z: s.z }, _v.set(s.vx, s.vy, s.vz).normalize(), .6) < .6) { s.back = true; sfx.thunk(); }
        } else {
          const tx = s.mine ? P.x : s.ox, ty = s.mine ? P.y + 1.3 : s.oy, tz = s.mine ? P.z : s.oz;
          const dx = tx - s.x, dy = ty - s.y, dz = tz - s.z, dist = Math.hypot(dx, dy, dz);
          const sp = Math.min(dist / dt, 34);
          s.x += dx / dist * sp * dt; s.y += dy / dist * sp * dt; s.z += dz / dist * sp * dt;
          if (dist < .8 || s.t > 3) { s.gone = true; if (s.mine) P.headOut = false; }
        }
        if (s.mine) for (const t of targets()) if (!s.hit.has(t.id) && Math.hypot(t.x - s.x, t.z - s.z) < t.r + .35 && s.y > t.y - .2 && s.y < t.y + t.h + .2) { s.hit.add(t.id); damage(t, 75, { x: s.x, y: s.y, z: s.z }); if (s.hit.size >= 3) s.back = true; }
        s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.z += dt * 30; s.mesh.rotation.y = Math.atan2(s.vx, s.vz);
      }
    }
    for (const s of shots) if (s.gone && !s.dead) {
      s.dead = true;
      if (s.gl) s.gl.t = s.gl.life;
      if (s.stuck) { s.keepT = s.stuck; } else root.remove(s.mesh);
    }
    for (const s of shots) if (s.dead && s.keepT != null) { s.keepT -= dt; if (s.keepT <= 0) { root.remove(s.mesh); s.keepT = null; } }
    shots = shots.filter((s) => !s.dead || s.keepT != null);
  }
  // the monsters' fireballs: everyone sees them, each checks them against themself
  function spawnFireball(x, y, z, vx, vy, vz, big = 0) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fbTex, color: big ? 0xff4020 : 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sp.scale.setScalar(big ? 1.4 : .9); sp.position.set(x, y, z); root.add(sp);
    fbs.push({ mesh: sp, x, y, z, vx, vy, vz, t: 0, dmg: big ? 20 : 12 });
    sfx.fire();
  }
  function stepFireballs(dt) {
    for (const f of fbs) {
      f.t += dt;
      const sp = Math.hypot(f.vx, f.vy, f.vz), d = _v.set(f.vx / sp, f.vy / sp, f.vz / sp);
      if (rayWorld({ x: f.x, y: f.y, z: f.z }, d, sp * dt + .1) <= sp * dt) f.gone = true;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      f.mesh.position.set(f.x, f.y, f.z);
      if (P.alive && Math.hypot(f.x - P.x, f.z - P.z) < PR + .35 && f.y > P.y && f.y < P.y + 1.9) { hurtMe(f.dmg, f.by || 'mo'); f.gone = true; }
      if (f.t > 5) f.gone = true;
      if (f.gone) { burst(f.x, f.y, f.z, 6, 0xff7a20, 3, .07, .5); root.remove(f.mesh); f.mesh.material.dispose(); }
    }
    fbs = fbs.filter((f) => !f.gone);
  }
  // the lords' slams: a ring of fire along the floor, jump over it
  function ringAt(x, z, color = 0xff5020) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, .09, 6, 48), ringMat.clone()); m.material.color.set(color);
    m.rotation.x = -Math.PI / 2; m.position.set(x, heightAt(x, z) + .15, z); root.add(m);
    rings.push({ mesh: m, x, z, r: .5, t: 0, hitMe: color === 0xff2020 });
  }
  function stepRings(dt) {
    for (const r of rings) {
      r.t += dt; r.r += 11 * dt;
      r.mesh.scale.set(r.r, r.r, 1 + r.t); r.mesh.material.opacity = Math.max(0, .9 - r.t / 1.6);
      const d = Math.hypot(P.x - r.x, P.z - r.z);
      if (!r.hitMe && P.alive && Math.abs(d - r.r) < .6 && P.y - floorAt(P.x, P.z, P.y) < .35) { r.hitMe = true; hurtMe(22, 'bo'); P.vy = 5; P.ground = false; }
      if (r.t > 1.6) { r.gone = true; root.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
    }
    rings = rings.filter((r) => !r.gone);
  }
  // souls float where a monster fell: walk into them (a heal, and 66 make a demon); ammo too
  function dropSoul(x, y, z, n) {
    for (let k = 0; k < Math.min(n, 6); k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soulTex, color: 0x60ff90, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      const a = k / Math.max(1, n) * TAU;
      sp.position.set(x + (n > 1 ? Math.cos(a) * .6 : 0), y + 1, z + (n > 1 ? Math.sin(a) * .6 : 0)); sp.scale.setScalar(.55); root.add(sp);
      souls.push({ sp, t: 0, v: n > 6 && k === 0 ? n - 5 : 1, y0: sp.position.y });
    }
  }
  function stepSouls(dt) {
    for (const s of souls) {
      s.t += dt;
      s.sp.position.y = s.y0 + Math.sin(s.t * 3) * .15;
      const dx = P.x - s.sp.position.x, dz = P.z - s.sp.position.z, d = Math.hypot(dx, dz);
      if (P.alive && d < 3.5 && d > .01) { s.sp.position.x += dx / d * Math.min(d, 6 * dt); s.sp.position.z += dz / d * Math.min(d, 6 * dt); }
      if (P.alive && d < 1) { s.gone = true; P.hp = Math.min(150, P.hp + s.v); P.souls += s.v; sfx.soul(); if (P.souls >= 66 && !P.morph) { P.souls -= 66; P.morph = 12; sfx.morph(); showBanner('démon !', 2); } }
      if (s.t > 25) s.gone = true;
      if (s.gone) { root.remove(s.sp); s.sp.material.dispose(); }
    }
    souls = souls.filter((s) => !s.gone);
    for (const d of drops) {
      d.t += dt; d.mesh.rotation.y += dt * 2; d.mesh.position.y = d.y + .35 + Math.sin(d.t * 3) * .08;
      if (P.alive && Math.hypot(P.x - d.x, P.z - d.z) < 1.1) {
        d.gone = true; sfx.pick();
        const A = P.ammo;
        if (d.kind === 'stake') A.stake = Math.min(50, A.stake + 8); else if (d.kind === 'gren') A.gren = Math.min(12, A.gren + 2); else if (d.kind === 'shell') A.shell = Math.min(50, A.shell + 8); else A.frz = Math.min(8, A.frz + 1);
        ui?.toast?.(d.kind === 'stake' ? '+8 pieux' : d.kind === 'gren' ? '+2 grenades' : d.kind === 'shell' ? '+8 cartouches' : '+1 tir glaçant', false, 900);
      }
      if (d.t > 30) d.gone = true;
      if (d.gone) root.remove(d.mesh);
    }
    drops = drops.filter((d) => !d.gone);
  }
  const DROP_COL = { stake: 0xc8a060, gren: 0x60c040, shell: 0xd84020, frz: 0x60c0ff };
  function dropAmmo(id, x, z) {
    const r = rng(id * 7919 + seed);
    if (r() > .35) return;
    const kind = ['stake', 'shell', 'stake', 'shell', 'gren', 'frz'][Math.floor(r() * 6)];
    const m = new THREE.Mesh(B(.4, .3, .3), new THREE.MeshLambertMaterial({ color: DROP_COL[kind], emissive: new THREE.Color(DROP_COL[kind]).multiplyScalar(.35), fog: false }));
    const y = heightAt(x, z); m.position.set(x, y + .35, z); root.add(m);
    drops.push({ mesh: m, x, z, y, t: 0, kind });
  }

  // ---------- being hurt, dying ----------
  function hurtMe(d, by) {
    if (!P.alive || P.morph || ended) return;
    P.hp -= d; flashT = .35; shake = Math.max(shake, .15); P.hurtBy = by;
    sfx.hurt();
    if (P.hp <= 0) {
      P.hp = 0; P.alive = false; P.deadT = mode === 'carnage' ? 3 : 5; P.headOut = false;
      burst(P.x, P.y + 1, P.z, 14, 0x8a0a0a, 5, .1, 1); decal(P.x, P.z, 1.2);
      const ev = { t: 'died', id: meId, by: String(by) };
      send(ev); onDied(ev);
      showBanner(mode === 'carnage' ? 'fauché · retour dans 3' : 'tu es tombé · retour dans 5', 2.5);
    }
  }
  function onDied(ev) {
    const v = board.get(ev.id); if (v) v.deaths++;
    if (mode === 'carnage') { const k = board.get(ev.by); if (k && ev.by !== ev.id) { k.frags++; if (ev.by === meId) showBanner(`tu as fauché ${v?.name ?? '?'}`, 1.4); } }
    const r = remotes.get(ev.id); if (r) { r.alive = false; burst(r.x, r.y + 1, r.z, 12, 0x8a0a0a, 5, .1, 1); decal(r.x, r.z, 1.1); }
  }

  // ---------- the host: waves, monsters, bots ----------
  function spawnFoe(k, at, extra = {}) {
    const K = KINDS[k];
    let x, z;
    if (at) [x, z] = at; else { const s = SPAWNS[Math.floor(R() * SPAWNS.length)]; x = s[0] + (R() - .5) * 1.5; z = s[1] + (R() - .5) * 1.5; }
    if (K.boss) { x = 0; z = 22; }
    const f = { id: nextId++, k, name: extra.name, color: extra.color, x, z, y: heightAt(x, z), vx: 0, vz: 0, vy: 0, yaw: Math.atan2(-x, -z), hp: K.hp, max: K.hp, t: 0, cd: 1 + R() * 1.5, cd2: 5, cd3: 9, atk: 0, st: 'walk', frozen: 0, rise: K.bot ? 0 : .9, ...extra };
    if (K.fly) f.y = 3;
    f.mesh = skin(k, extra.color ?? 0xffffff); f.mesh.position.set(f.x, f.y - (f.rise ? 2.2 : 0), f.z); root.add(f.mesh);
    if (K.bot) f.mesh.add(nameTag(extra.name, extra.color));
    if (K.bot) { f.key = extra.key || 'b' + f.id; if (!board.has(f.key)) board.set(f.key, { name: extra.name, color: extra.color, score: 0, frags: 0, deaths: 0, bot: true }); }
    if (K.boss) { bossRef = f; showBanner(K.name + ' !', 2.5); sfx.bell(); }
    if (f.rise) { burst(x, .1, z, 8, 0xff3010, 3, .08, .8); if (R() < .3) sfx.growl(); }
    sims.push(f);
    return f;
  }
  function players() {
    const out = [];
    if (P.alive) out.push({ id: meId, x: P.x, y: P.y, z: P.z, me: true });
    for (const r of remotes.values()) if (r.alive && r.snaps.length) out.push({ id: r.id, x: r.x, y: r.y, z: r.z });
    return out;
  }
  function hitPlayer(pid, d, by) { if (pid === meId) hurtMe(d, by); else send({ t: 'dmg', to: pid, d: Math.round(d), by: String(by) }); }
  function hostStep(dt) {
    if (endT > 0 || ended) return;
    if (mode === 'croisade') {
      wt -= dt;
      if (ws === 'intro' && wt <= 0) nextWave();
      else if (ws === 'break' && wt <= 0) { ws = 'fight'; }
      else if (ws === 'fight') {
        spawnT -= dt;
        const cap = 10 + 4 * humans.length;
        if (queue.length && spawnT <= 0 && sims.length < cap) { spawnFoe(queue.shift()); spawnT = .55; }
        if (!queue.length && !sims.length) { if (wave >= WAVES.length) win(); else nextWave(); }
      }
      if (clock > limit && !won) endGame();
    } else {
      // bots come back three seconds after they fall
      for (const b of respawnBots) { b.t -= dt; if (b.t <= 0) { spawnFoe('bt', null, b.extra); b.done = true; } }
      respawnBots = respawnBots.filter((b) => !b.done);
      const top = Math.max(0, ...[...board.values()].map((b) => b.frags));
      if (clock > limit || top >= 20) endGame();
    }
    const ps = players();
    for (const f of sims) stepFoe(f, dt, ps);
    // they keep apart
    for (let a = 0; a < sims.length; a++) for (let b = a + 1; b < sims.length; b++) {
      const p = sims[a], q = sims[b], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = KINDS[p.k].r + KINDS[q.k].r;
      if (d < m && d > 1e-3 && !KINDS[p.k].fly && !KINDS[q.k].fly) { const push = (m - d) / 2; p.x -= dx / d * push; p.z -= dz / d * push; q.x += dx / d * push; q.z += dz / d * push; }
    }
    for (const f of sims) poseFoe(f, dt);
    snapT += dt;
    if (snapT >= SNAP) {
      snapT = 0;
      send({ t: 'sn', w: wave, ws, wt: +Math.max(0, wt).toFixed(1), c: +clock.toFixed(1), l: queue.length + sims.length, b: bossRef ? bossRef.id : 0,
        e: sims.map((f) => [f.id, KORDER.indexOf(f.k), Math.round(f.x * 20), Math.round(f.z * 20), Math.round(f.y * 20), Math.round(f.yaw * 100), Math.round(f.hp / f.max * 100), (f.frozen > 0 ? 1 : 0) | (f.atk > 0 ? 2 : 0) | (f.rise > 0 ? 4 : 0), f.name ? f.name : 0, f.color ?? 0]),
        sc: [...board].map(([id, v]) => [id, v.score, v.frags, v.deaths, v.bot ? 1 : 0, v.bot ? v.name : 0, v.bot ? v.color : 0]) });
    }
  }
  let respawnBots = [];
  function nextWave() {
    const W = WAVES[wave];
    wave++; ws = 'break'; wt = 4;
    queue = [];
    const mult = 1 + .5 * (humans.length - 1);
    for (const [k, n] of Object.entries(W)) if (k !== 'boss') for (let j = 0; j < Math.round(n * mult); j++) queue.push(k);
    for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    if (W.boss) queue.unshift(W.boss);
    const ev = { t: 'banner', s: W.boss ? `vague ${wave} · ${KINDS[W.boss].name}` : `vague ${wave}` };
    send(ev); showBanner(ev.s, 3); sfx.bell();
  }
  function win() {
    won = true; ws = 'win';
    const ev = { t: 'banner', s: 'la nef est purifiée !' }; send(ev); showBanner(ev.s, 4);
    endGame();
  }
  function endGame() { if (endT > 0) return; const ev = { t: 'end', won: won ? 1 : 0 }; send(ev); endT = 4.5; }
  function stepFoe(f, dt, ps) {
    const K = KINDS[f.k];
    f.t += dt;
    if (f.rise > 0) { f.rise = Math.max(0, f.rise - dt); return; }
    if (f.frozen > 0) { f.frozen -= dt; f.vx = f.vz = 0; return; }
    if (f.kb) { f.x += f.kb.x; f.z += f.kb.z; f.kb = null; }
    // the prey: the closest living hunter (bots also hunt each other)
    let tg = null, best = 1e9;
    const pool = K.bot ? [...ps, ...sims.filter((o) => o !== f && KINDS[o.k].bot && !o.rise).map((o) => ({ id: o.key, x: o.x, y: o.y, z: o.z, bot: o }))] : ps;
    for (const p of pool) { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < best) { best = d; tg = p; } }
    f.cd -= dt; f.cd2 -= dt; f.cd3 -= dt;
    if (f.atk > 0) { f.atk -= dt; if (f.atk <= 0 && f.pending) { const p = f.pending; f.pending = null; if (tg && Math.hypot(p.x - f.x, p.z - f.z) < K.reach + 1.2) hitPlayer(p.id, K.dmg, f.k); } }
    let want = 0, dirx = 0, dirz = 0;
    if (tg) { dirx = (tg.x - f.x) / (best || 1); dirz = (tg.z - f.z) / (best || 1); f.yaw = Math.atan2(dirx, dirz); }
    const melee = () => { if (tg && best < K.reach + .4 && f.cd <= 0 && f.atk <= 0) { f.atk = .35; f.cd = K.rate; f.pending = { id: tg.id, x: tg.x, z: tg.z }; } };
    switch (f.k) {
      case 'sk': want = K.speed; melee(); break;
      case 'mo':
        want = best > 14 ? K.speed : best < 7 ? -K.speed * .8 : 0;
        if (best < 7 && best > 2) { dirx = -dirz; dirz = (tg.x - f.x) / (best || 1); want = K.speed; }
        if (tg && f.cd <= 0 && best < 24 && best > 2.5) { f.cd = K.rate + R(); f.atk = .3; throwAt(f, tg, 14, 0); }
        else melee();
        break;
      case 'ga': {
        const hy = f.st === 'dive' ? (tg ? tg.y + 1.1 : 3) : 3.4 + Math.sin(f.t * 1.7 + f.id) * .7;
        f.y += (hy - f.y) * Math.min(1, dt * (f.st === 'dive' ? 6 : 2));
        if (f.st === 'dive') { want = 12; if (tg && best < 1.2 && Math.abs(f.y - (tg.y + 1.1)) < 1) { hitPlayer(tg.id, K.dmg, f.k); f.st = 'walk'; f.cd = 2.5; } if (f.t > f.diveEnd) f.st = 'walk'; }
        else { want = best > 6 ? K.speed : 3; const sd = f.id % 2 ? 1 : -1; if (best < 9) { const ox = dirx; dirx = dirx * .4 - dirz * sd; dirz = dirz * .4 + ox * sd; } if (tg && f.cd <= 0 && best < 12) { f.st = 'dive'; f.diveEnd = f.t + 1.3; } }
        break;
      }
      case 'de':
        if (f.st === 'charge') { want = 13; dirx = f.cx; dirz = f.cz; f.yaw = Math.atan2(dirx, dirz); if (tg && best < K.reach && !f.hitC) { f.hitC = true; hitPlayer(tg.id, K.dmg, f.k); } if (f.t > f.chEnd) f.st = 'walk'; }
        else { want = K.speed; melee(); if (tg && f.cd2 <= 0 && best > 5 && best < 15) { f.st = 'charge'; f.cx = dirx; f.cz = dirz; f.chEnd = f.t + 1; f.hitC = false; f.cd2 = 6; sfx.growl(); } }
        break;
      case 'bo': case 'ar':
        want = K.speed * (f.st === 'charge' ? 3.2 : 1);
        if (f.st === 'charge') { dirx = f.cx; dirz = f.cz; if (tg && best < K.reach && !f.hitC) { f.hitC = true; hitPlayer(tg.id, K.dmg, f.k); } if (f.t > f.chEnd) f.st = 'walk'; break; }
        if (f.st === 'slam') { want = 0; if (f.t > f.slamAt) { f.st = 'walk'; const ev = { t: 'ring', x: +f.x.toFixed(2), z: +f.z.toFixed(2) }; send(ev); ringAt(f.x, f.z); sfx.slam(); shake = .5; for (const p of ps) if (Math.hypot(p.x - f.x, p.z - f.z) < 3.5) hitPlayer(p.id, K.dmg, f.k); } break; }
        melee();
        if (f.cd2 <= 0) { f.cd2 = f.k === 'bo' ? 7 : 9; f.st = 'slam'; f.slamAt = f.t + .9; f.atk = .9; }
        else if (f.k === 'ar' && tg && f.cd <= 0 && best > 5) { f.cd = 3.5; for (let j = -2; j <= 2; j++) throwAt(f, tg, 13, j * .16, 1); }
        else if (f.cd3 <= 0) {
          f.cd3 = f.k === 'bo' ? 13 : 15;
          if (tg && best > 6 && f.k === 'ar') { f.st = 'charge'; f.cx = dirx; f.cz = dirz; f.chEnd = f.t + 1.2; f.hitC = false; }
          for (let j = 0; j < (f.k === 'bo' ? 3 : 2); j++) spawnFoe(f.k === 'bo' ? 'sk' : 'ga');
        }
        break;
      case 'bt': {
        // a hunter: circles at mid range, hops, fires when it sees you
        const sd = f.id % 2 ? 1 : -1;
        want = K.speed;
        if (best < 6) { const ox = dirx; dirx = -dirz * sd - dirx * .3; dirz = ox * sd - dirz * .3; }
        else if (best < 14) { const ox = dirx; dirx = dirx * .3 - dirz * sd; dirz = dirz * .3 + ox * sd; }
        if (f.y <= heightAt(f.x, f.z) + .01 && R() < dt * .8) f.vy = 6.5;
        if (tg && f.cd <= 0 && best < 30) {
          f.cd = K.rate + R() * .6; f.atk = .2;
          const o = { x: f.x, y: f.y + 1.5, z: f.z }, d = new THREE.Vector3(tg.x - f.x, (tg.y + 1.1) - (f.y + 1.5), tg.z - f.z).normalize();
          if (rayWorld(o, d, best) >= best - .5) {
            send({ t: 'sh', k: 'bt', o: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), d: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) });
            tracer(o, d, best);
            if (R() < .5 - best / 80) { if (tg.bot) applyHit(tg.bot.id, K.dmg, f.key, {}); else hitPlayer(tg.id, K.dmg, f.key); }
          }
        }
        break;
      }
    }
    const fly = K.fly;
    f.vx += (dirx * want - f.vx) * Math.min(1, dt * 6); f.vz += (dirz * want - f.vz) * Math.min(1, dt * 6);
    const o = { x: f.x + f.vx * dt, z: f.z + f.vz * dt };
    collide(o, K.r, fly ? 9 : f.y);
    f.x = o.x; f.z = o.z;
    if (!fly) {
      f.vy -= GRAV * dt; f.y += f.vy * dt;
      const fl = floorAt(f.x, f.z, f.y + .3);
      if (f.y <= fl) { f.y = fl; f.vy = 0; }
    }
  }
  function throwAt(f, tg, speed, spread = 0, big = 0) {
    const K = KINDS[f.k], hy = f.y + K.h * .8;
    const dist = Math.hypot(tg.x - f.x, tg.z - f.z), tt = dist / speed;
    const r = remotes.get(tg.id), vx = tg.me ? P.vx : r ? r.vx || 0 : 0, vz = tg.me ? P.vz : r ? r.vz || 0 : 0;
    const ax = tg.x + vx * tt * .6 - f.x, az = tg.z + vz * tt * .6 - f.z, ay = tg.y + 1.1 - hy;
    const a = Math.atan2(ax, az) + spread, h = Math.hypot(ax, az);
    const d = new THREE.Vector3(Math.sin(a) * h, ay, Math.cos(a) * h).normalize();
    const ev = { t: 'fb', x: +f.x.toFixed(2), y: +hy.toFixed(2), z: +f.z.toFixed(2), vx: +(d.x * speed).toFixed(2), vy: +(d.y * speed).toFixed(2), vz: +(d.z * speed).toFixed(2), g: big };
    send(ev); spawnFireball(ev.x, ev.y, ev.z, ev.vx, ev.vy, ev.vz, big);
  }
  function tracer(o, d, len) {
    for (let k = 1; k < len; k += 2) glow(o.x + d.x * k, o.y + d.y * k, o.z + d.z * k, flashTex, .25, .12, 0xffe0a0);
    sfx.stake();
  }
  function poseFoe(f, dt) {
    const m = f.mesh;
    const rise = f.rise > 0 ? f.rise / .9 : 0;
    m.position.set(f.x, f.y - rise * 2.2, f.z); m.rotation.y = f.yaw;
    animate(m, f.k, f.frozen > 0 ? 0 : Math.hypot(f.vx, f.vz), f.t, f.atk, dt);
    setIce(m, f.frozen > 0);
  }
  function setIce(m, on) {
    if (!!m.userData.ice === on) return;
    m.userData.ice = on;
    m.traverse((o) => { if (!o.isMesh) return; if (on) { o.userData.mat = o.material; o.material = iceMat; } else if (o.userData.mat) o.material = o.userData.mat; });
  }
  // the host takes a hit from anyone
  function applyHit(id, d, by, opt) {
    const f = sims.find((x) => x.id === id);
    if (!f || f.rise > 0) return;
    const frozen = f.frozen > 0;
    f.hp -= d * (frozen ? 2 : 1);
    if (opt.f) f.frozen = 4;
    if (opt.kx || opt.kz) { const w = KINDS[f.k].boss ? .1 : f.k === 'de' ? .4 : 1; f.kb = { x: (opt.kx || 0) * w, z: (opt.kz || 0) * w }; }
    if (f.hp <= 0) killFoe(f, by, frozen);
  }
  function killFoe(f, by, shatter) {
    sims = sims.filter((x) => x !== f);
    root.remove(f.mesh);
    if (f === bossRef) bossRef = null;
    const ev = { t: 'kill', id: f.id, k: f.k, by: String(by), x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(2), s: shatter ? 1 : 0, bk: f.key || 0 };
    send(ev); onKill(ev);
    if (KINDS[f.k].bot) respawnBots.push({ t: 3, extra: { name: f.name, color: f.color, key: f.key } });
  }
  // everyone: a monster fell
  function onKill(ev) {
    const K = KINDS[ev.k];
    if (!K) return;
    const v = views.get(ev.id); if (v) { root.remove(v.mesh); views.delete(ev.id); }
    const col = ev.s ? 0xa8e0ff : ev.k === 'sk' ? 0xe8e0c8 : ev.k === 'ga' ? 0x6a6a72 : ev.k === 'bt' ? 0x8a0a0a : 0x8a1010;
    burst(ev.x, ev.y + K.h * .5, ev.z, K.boss ? 60 : 16, col, K.boss ? 9 : 5, K.boss ? .2 : .1, 1.4);
    if (!ev.s && ev.k !== 'sk') { burst(ev.x, ev.y + K.h * .5, ev.z, 8, 0x5a0404, 4, .08, 1); decal(ev.x, ev.z, K.boss ? 3 : .9 + Math.random() * .5); }
    if (ev.k === 'sk') sfx.bones(); else sfx.die();
    if (K.boss) { glow(ev.x, ev.y + 2, ev.z, fbTex, 9, 1.2); sfx.boom(); shake = .8; }
    dropSoul(ev.x, ev.y, ev.z, K.souls);
    dropAmmo(ev.id, ev.x, ev.z);
    const b = board.get(ev.by === meId ? meId : ev.by);
    if (b) { if (mode === 'carnage') { if (K.bot) b.frags++; } else b.score += K.pts; }
    if (K.bot) { const bb = board.get(ev.bk); if (bb) bb.deaths++; }
    if (ev.by === meId && K.boss) showBanner(`${K.name} est tombé !`, 3);
  }

  // ---------- the others: hunters in the nave, and the host's word ----------
  function onFx(id, fx) {
    if (!running || !fx) return;
    let r = remotes.get(id);
    if (!r && id !== meId && fx.t === 'p') { r = { id, name: 'invité', color: 0xffffff, snaps: [], x: 0, y: 0, z: 0, yaw: 0, alive: true, w: 0, mesh: null }; remotes.set(id, r); if (!board.has(id)) board.set(id, { name: 'invité', color: 0xffffff, score: 0, frags: 0, deaths: 0 }); }
    switch (fx.t) {
      case 'p': r.snaps.push({ at: performance.now(), x: +fx.x || 0, y: +fx.y || 0, z: +fx.z || 0, a: +fx.a || 0, w: fx.w | 0, l: fx.l ? 1 : 0 }); if (r.snaps.length > 20) r.snaps.shift(); break;
      case 'sn': if (!isHost) applySnap(fx); break;
      case 'hit': if (isHost) applyHit(fx.id | 0, Math.min(500, +fx.d || 0), id, { f: fx.f, kx: +fx.kx || 0, kz: +fx.kz || 0 }); break;
      case 'hitp': if (fx.to === meId && mode === 'carnage') hurtMe(Math.min(500, +fx.d || 0), id); break;
      case 'dmg': if (fx.to === meId) hurtMe(Math.min(200, +fx.d || 0), fx.by); break;
      case 'died': onDied(fx); break;
      case 'kill': if (!isHost) onKill(fx); break;
      case 'fb': spawnFireball(+fx.x, +fx.y, +fx.z, +fx.vx, +fx.vy, +fx.vz, fx.g); break;
      case 'ring': ringAt(+fx.x, +fx.z); sfx.slam(); shake = Math.max(shake, .3); break;
      case 'banner': showBanner(String(fx.s), 3); if (/vague/.test(fx.s)) sfx.bell(); break;
      case 'end': won = !!fx.won; if (endT <= 0) endT = 4.5; break;
      case 'sh': {
        const o = { x: +fx.o[0], y: +fx.o[1], z: +fx.o[2] }, d = new THREE.Vector3(+fx.d[0], +fx.d[1], +fx.d[2]);
        if (fx.k === 'stake') { shootStake({ o, d }); sfx.stake(); }
        else if (fx.k === 'gren') { throwGrenade({ o, d }); sfx.gren(); }
        else if (fx.k === 'sg') { shotgun({ o, d }); sfx.shotgun(); }
        else if (fx.k === 'frz') { freezeShot({ o, d }); sfx.freeze(); }
        else if (fx.k === 'bt') tracer(o, d, 30);
        else if (fx.k === 'head') { const m = headProto.clone(); m.visible = true; root.add(m); shots.push({ k: 'head', mesh: m, x: o.x, y: o.y, z: o.z, vx: d.x * 30, vy: d.y * 30, vz: d.z * 30, t: 0, hit: new Set(), back: false, mine: false, ox: o.x, oy: o.y, oz: o.z }); }
        break;
      }
    }
  }
  function applySnap(s) {
    lastSnapAt = performance.now();
    wave = s.w | 0; ws = String(s.ws); wt = +s.wt || 0; left = s.l | 0;
    if (s.c > clock + 1 || s.c < clock - 1) clock = +s.c;
    const seen = new Set(), now = performance.now();
    for (const e of s.e || []) {
      const [id, ki, x, z, y, yaw, hp, fl, name, color] = e, k = KORDER[ki];
      if (!k) continue;
      seen.add(id);
      let v = views.get(id);
      if (!v) {
        v = { id, k, x: x / 20, z: z / 20, y: y / 20, yaw: yaw / 100, snaps: [], mesh: skin(k, color || 0xffffff), hp, t: 0 };
        root.add(v.mesh); views.set(id, v);
        if (KINDS[k].bot) v.mesh.add(nameTag(String(name), color));
        if (KINDS[k].boss) { showBanner(KINDS[k].name + ' !', 2.5); sfx.bell(); }
      }
      v.snaps.push({ at: now, x: x / 20, z: z / 20, y: y / 20, yaw: yaw / 100 }); if (v.snaps.length > 12) v.snaps.shift();
      v.hp = hp; v.fl = fl; v.name = name; v.color = color;
    }
    for (const [id, v] of views) if (!seen.has(id)) { root.remove(v.mesh); views.delete(id); }
    bossRef = s.b ? views.get(s.b) || null : null;
    for (const [id, sc, fr, de, bot, name, color] of s.sc || []) {
      let b = board.get(id);
      if (!b) { b = { name: bot ? name : 'invité', color: bot ? color : 0xffffff, score: 0, frags: 0, deaths: 0, bot: !!bot }; board.set(id, b); }
      b.score = sc; b.frags = fr; b.deaths = de;
    }
  }
  function stepViews(dt) {
    const now = performance.now() - 120;
    for (const v of views.values()) {
      const s = v.snaps; if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let n = s.length - 1; n > 0; n--) if (s[n - 1].at <= now) { a = s[n - 1]; b = s[n]; break; }
      const k = b.at > a.at ? Math.max(0, Math.min(1, (now - a.at) / (b.at - a.at))) : 1;
      const px = v.x, pz = v.z;
      v.x = a.x + (b.x - a.x) * k; v.z = a.z + (b.z - a.z) * k; v.y = a.y + (b.y - a.y) * k;
      let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      v.yaw = a.yaw + dy * k; v.t += dt;
      const rise = v.fl & 4 ? 1 : 0;
      v.mesh.position.set(v.x, v.y - rise * 1.5, v.z); v.mesh.rotation.y = v.yaw;
      animate(v.mesh, v.k, v.fl & 1 ? 0 : Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 1e-3), v.t, v.fl & 2 ? .2 : 0, dt);
      setIce(v.mesh, !!(v.fl & 1));
    }
  }
  function stepRemotes(dt) {
    const now = performance.now() - 110;
    for (const r of remotes.values()) {
      const s = r.snaps; if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let n = s.length - 1; n > 0; n--) if (s[n - 1].at <= now) { a = s[n - 1]; b = s[n]; break; }
      const k = b.at > a.at ? Math.max(0, Math.min(1, (now - a.at) / (b.at - a.at))) : 1;
      const px = r.x, pz = r.z;
      r.x = a.x + (b.x - a.x) * k; r.y = a.y + (b.y - a.y) * k; r.z = a.z + (b.z - a.z) * k;
      r.vx = (r.x - px) / Math.max(dt, 1e-3); r.vz = (r.z - pz) / Math.max(dt, 1e-3);
      r.yaw = b.a; r.alive = !!b.l; r.w = b.w;
      if (!r.mesh) { r.mesh = skin('hunter', r.color); r.mesh.add(nameTag(r.name, r.color)); root.add(r.mesh); }
      r.mesh.visible = r.alive;
      r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.y = r.yaw + Math.PI;
      animate(r.mesh, 'hunter', Math.hypot(r.vx, r.vz), clock, 0, dt);
    }
  }
  function nameTag(name, color) {
    const t = tex(256, 64, (x) => { x.font = '700 34px Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(name, 128, 32); x.fillStyle = '#' + (color >>> 0).toString(16).padStart(6, '0'); x.fillText(name, 128, 32); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(1.6, .4, 1); s.position.y = 2.25; return s;
  }
  // the host is gone: the next one in line takes the monsters over from what it saw last
  function takeOver() {
    const left2 = [meId, ...remotes.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    hostId = left2[0];
    if (hostId !== meId) { lastSnapAt = performance.now(); return; }
    isHost = true;
    for (const v of views.values()) {
      const K = KINDS[v.k];
      const f = { id: v.id, k: v.k, x: v.x, z: v.z, y: v.y, vx: 0, vz: 0, vy: 0, yaw: v.yaw, hp: K.hp * v.hp / 100, max: K.hp, t: 0, cd: 1, cd2: 4, cd3: 8, atk: 0, st: 'walk', frozen: 0, rise: 0, mesh: v.mesh, name: v.name, color: v.color };
      sims.push(f); nextId = Math.max(nextId, v.id + 1);
      if (bossRef === v) bossRef = f;
    }
    views.clear();
    if (ws === 'fight' && !sims.length && mode === 'croisade') queue = [];
  }

  // ---------- the camera, the weapon in hand ----------
  function placeCamera(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt);
    const bob = P.ground ? Math.sin(P.bob * 1.2) * .05 : 0;
    camera.position.set(PK_ARENA.x + P.x + (Math.random() - .5) * shake * .3, PK_ARENA.y + P.y + (P.alive ? EYE : .4) + bob, PK_ARENA.z + P.z + (Math.random() - .5) * shake * .3);
    camera.rotation.set(P.pitch, P.yaw, P.alive ? 0 : .4, 'YXZ');
    camera.up.set(0, 1, 0);
    if (!vm) return;
    P.kick = Math.max(0, (P.kick || 0) - dt * 6);
    const sw = P.swap > 0 ? P.swap / .3 : 0;
    vm.position.set(.26 + Math.sin(P.bob * .6) * .01, -.28 - sw * .3 + Math.abs(Math.cos(P.bob * .6)) * .01, -.5 + P.kick * .06);
    vm.rotation.set(P.kick * .12, 0, 0);
    vmParts.list.forEach((g, n) => { g.visible = n === P.weapon; });
    vmParts.head.visible = !P.headOut;
    vmParts.head.rotation.z += dt * (4 + P.blade * 40);
    vmParts.stake.visible = P.cd <= .1 && P.ammo.stake > 0;
  }

  // ---------- the screen: health and souls, the weapon, the banner ----------
  let hudEl = null, hudLast = {};
  function makeHud() {
    hudEl = document.createElement('div');
    hudEl.id = 'pk-hud';
    hudEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:14;font-family:Rubik,system-ui,sans-serif;color:#f4e8e0;text-shadow:0 2px 6px rgba(0,0,0,.8)';
    hudEl.innerHTML = `
      <div id="pk-morph" style="position:absolute;inset:0;background:#808080;mix-blend-mode:saturation;opacity:0;transition:opacity .4s"></div>
      <div id="pk-morph2" style="position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 40%,rgba(160,0,0,.55) 100%);opacity:0;transition:opacity .4s"></div>
      <div id="pk-flash" style="position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 35%,rgba(200,0,0,.6) 100%);opacity:0"></div>
      <div style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px">
        <div style="position:absolute;left:10px;top:0;width:2px;height:7px;background:#fff;box-shadow:0 0 3px #000"></div><div style="position:absolute;left:10px;bottom:0;width:2px;height:7px;background:#fff;box-shadow:0 0 3px #000"></div>
        <div style="position:absolute;top:10px;left:0;height:2px;width:7px;background:#fff;box-shadow:0 0 3px #000"></div><div style="position:absolute;top:10px;right:0;height:2px;width:7px;background:#fff;box-shadow:0 0 3px #000"></div>
      </div>
      <div style="position:absolute;left:28px;bottom:24px;display:flex;align-items:flex-end;gap:22px">
        <div><div style="font-size:13px;letter-spacing:.14em;opacity:.8">santé</div><div id="pk-hp" style="font:700 54px/1 'Titan One',Rubik,sans-serif;color:#ff5a4a">100</div></div>
        <div><div style="font-size:13px;letter-spacing:.14em;opacity:.8">âmes</div><div id="pk-souls" style="font:700 30px/1 'Titan One',Rubik,sans-serif;color:#7aff9a">0<small style="font-size:16px;opacity:.7"> / 66</small></div>
          <div style="width:150px;height:7px;background:rgba(0,0,0,.5);border-radius:4px;margin-top:6px;overflow:hidden"><div id="pk-soulbar" style="height:100%;width:0;background:linear-gradient(90deg,#2a8a4a,#9affb0)"></div></div></div>
      </div>
      <div style="position:absolute;right:28px;bottom:24px;text-align:right">
        <div id="pk-wname" style="font:700 26px/1.1 'Titan One',Rubik,sans-serif">painkiller</div>
        <div id="pk-ammo" style="font-size:16px;opacity:.9;margin-top:4px"></div>
        <div id="pk-slots" style="font-size:13px;opacity:.7;margin-top:6px;letter-spacing:.1em"></div>
      </div>
      <div id="pk-banner" style="position:absolute;left:0;right:0;top:62%;text-align:center;font:700 44px/1.1 'Titan One',Rubik,sans-serif;color:#ffcf6a;opacity:0;transition:opacity .3s;letter-spacing:.02em"></div>
      <div id="pk-boss" style="position:absolute;left:50%;bottom:120px;width:420px;margin-left:-210px;display:none">
        <div id="pk-bossname" style="text-align:center;font-size:14px;letter-spacing:.14em"></div>
        <div style="height:10px;background:rgba(0,0,0,.6);border:1px solid rgba(255,120,80,.6);border-radius:5px;overflow:hidden;margin-top:4px"><div id="pk-bossbar" style="height:100%;width:100%;background:linear-gradient(90deg,#a80a0a,#ff5a2a)"></div></div>
      </div>`;
    document.body.appendChild(hudEl);
    hudLast = {};
  }
  const $h = (id) => hudEl.querySelector('#' + id);
  const setH = (id, key, v, f) => { if (hudLast[id + key] === v) return; hudLast[id + key] = v; f($h(id), v); };
  function drawHud() {
    setH('pk-hp', 't', Math.ceil(P.hp), (e, v) => { e.textContent = v; e.style.color = v > 100 ? '#9affb0' : v > 30 ? '#ff5a4a' : '#ff2a2a'; });
    setH('pk-souls', 't', P.souls, (e, v) => { e.firstChild.textContent = v; });
    setH('pk-soulbar', 'w', P.morph ? 100 : Math.round(P.souls / 66 * 100), (e, v) => { e.style.width = v + '%'; });
    const W = WEAPONS[P.weapon], A = P.ammo;
    setH('pk-wname', 't', P.morph ? 'démon' : W.name, (e, v) => { e.textContent = v; e.style.color = P.morph ? '#ff4a3a' : '#f4e8e0'; });
    const am = P.morph ? `clic : rayon · clic droit : cri · ${Math.ceil(P.morph)} s` : P.weapon === 0 ? 'lame ∞ · tête ' + (P.headOut ? 'lancée' : 'prête') : P.weapon === 1 ? `pieux ${A.stake} · grenades ${A.gren}` : `cartouches ${A.shell} · glace ${A.frz}`;
    setH('pk-ammo', 't', am, (e, v) => { e.textContent = v; });
    setH('pk-slots', 't', P.weapon, (e, v) => { e.innerHTML = WEAPONS.map((w, n) => `<span style="opacity:${n === v ? 1 : .45}">${n + 1} ${w.name}</span>`).join(' · '); });
    setH('pk-flash', 'o', flashT > 0 ? Math.round(flashT / .35 * 10) / 10 : P.hp < 25 && P.alive ? .35 : 0, (e, v) => { e.style.opacity = v; });
    setH('pk-morph', 'o', P.morph ? 1 : 0, (e, v) => { e.style.opacity = v; });
    setH('pk-morph2', 'o', P.morph ? 1 : 0, (e, v) => { e.style.opacity = v; });
    setH('pk-banner', 't', bannerT > 0 ? banner : '', (e, v) => { if (v) e.textContent = v; e.style.opacity = v ? 1 : 0; });
    const bf = bossRef ? (isHost ? bossRef.hp / bossRef.max * 100 : bossRef.hp) : null;
    setH('pk-boss', 'v', bf != null ? Math.max(0, Math.round(bf)) : -1, (e, v) => { e.style.display = v >= 0 ? 'block' : 'none'; if (v >= 0) { $h('pk-bossbar').style.width = v + '%'; $h('pk-bossname').textContent = KINDS[bossRef.k].name; } });
  }
  function showBanner(s, t) { banner = s; bannerT = t; }

  // ---------- the end ----------
  function ranking() {
    const list = [...board.entries()].filter(([, v]) => mode === 'carnage' || !v.bot).map(([id, v]) => ({ id, ...v }));
    return list.sort((a, b) => mode === 'carnage' ? b.frags - a.frags || a.deaths - b.deaths : b.score - a.score);
  }
  function finish() {
    if (ended) return;
    const list = ranking(), mine = board.get(meId) || { score: 0, frags: 0 };
    let place = list.findIndex((r) => r.id === meId) + 1 || list.length, of = list.length;
    const value = mode === 'carnage' ? mine.frags : mine.score;
    let text;
    if (mode === 'croisade') {
      // alone and beaten by the clock: the nave wins
      if (!won && of === 1) { place = 2; of = 2; }
      text = won ? `${ord(place)} place · la nef est purifiée · ${value} points` : `${of > 1 ? ord(place) + ' place · ' : ''}la nef l'emporte · vague ${wave} · ${value} points`;
    } else text = `${ord(place)} place sur ${of} · ${value} frag${value > 1 ? 's' : ''}`;
    ended = true;
    if (place === 1) audio?.win?.();
    onEnd({ place, of, value, time: clock, text });
  }
  function card(r) {
    const col = '#' + (r.color >>> 0).toString(16).padStart(6, '0');
    return `<span style="color:${col}">${r.me ? '<em>toi</em>' : r.name} ${mode === 'carnage' ? r.frags : r.score}</span>`;
  }

  return {
    modes: MODES,
    keys: [['z q s d', 'courir'], ['espace', 'sauter · garde-le : bunny hop'], ['clic', 'tir principal'], ['clic droit', 'tir secondaire'], ['1 2 3 · molette', 'painkiller · pieux · fusil'], ['a', 'arme précédente']],
    start, stop, update, onFx,
    respawn() {},
    peerLeft(id) {
      const r = remotes?.get(id);
      if (r) { if (r.mesh) root.remove(r.mesh); remotes.delete(id); }
      if (id === hostId && running) { lastSnapAt = 0; takeOver(); }
    },
    look(dx, dy) { if (!running || !P) return; P.yaw -= dx * .0022; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - dy * .0022)); },
    press(b, down) { if (!running) return; held[b] = down; if (down) edge[b] = true; },
    hud() {
      if (!running) return { hidden: true };
      const t = mode === 'carnage' ? Math.max(0, Math.ceil(limit - clock)) : Math.floor(clock);
      const head = mode === 'carnage' ? `carnage · ${fmt(t).split('.')[0]}` : ws === 'intro' ? 'la nef maudite' : `vague ${wave} / ${WAVES.length} · ${fmt(t).split('.')[0]}${ws === 'fight' ? ` · ${isHost ? queue.length + sims.length : left} damnés` : ''}`;
      const list = ranking().slice(0, 4);
      return { html: `<b>${head}</b><div class="board" style="display:flex;gap:14px;justify-content:center">${list.map(card).join('')}</div>` };
    },
    preview() { return { x: PK_ARENA.x, y: PK_ARENA.y + 1.2, z: PK_ARENA.z - 12, yaw: 0, rad: 9, h: 2.4 }; },
    set onEnd(f) { onEnd = f; },
    // for the tests
    get _dbg() { return { P, get sims() { return sims; }, get views() { return views; }, board, get wave() { return wave; }, get ws() { return ws; }, get clock() { return clock; }, set clock(v) { clock = v; }, spawnFoe, applyHit, get isHost() { return isHost; }, get shots() { return shots; }, get souls() { return souls; }, skip() { wt = 0; }, hurtMe }; },
  };
}
