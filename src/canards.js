// canards.js, chasse aux canards: a painted meadow under a sky dome, in the spirit of the NES
// light-gun duck hunt. You are a tiny hunter in a wooden hide, in first person: the mouse aims
// (or z q s d), a click shoots, three shells a wave. Ducks rise from the tall grass along seeded
// zigzags, faster each round, and everyone shoots the same ones: the host decides who hit first
// and tells the others. The mole pops up after each wave holding the catch, or laughs at you.
// Second mode: clay plates thrown from the grass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';
import { rng, createChip, hostOf, hexOf, ord } from './retro.js';

const ROUNDS = 10, WAVES = ROUNDS * 2, SHOTS = 3, SEATS = 3, G = .1;
const MODES = [
  { id: 'canards', name: 'canards', sub: '10 manches · des canards de plus en plus vifs · le premier qui touche gagne le canard', help: 'souris : viser · clic : tirer · 3 cartouches par vague · canard doré : 300 points', unit: 'score' },
  { id: 'plateaux', name: 'ball-trap', sub: 'des plateaux d\'argile lancés depuis les herbes · tire vite', help: 'souris : viser · clic : tirer · 3 cartouches par volée · vite touché : bonus', unit: 'score' },
];
const BOTS = [['gaston', 0xe8384f], ['odile', 0xf2c230], ['bertrand', 0x3a8ef0], ['nina', 0x45c060], ['firmin', 0xb05ae0]];
// body, head, wings, wing tips
const SPECIES = [[0x3a6fd8, 0x18a858, 0x24408a, 0xf4f0e0], [0xd8643a, 0x6a2a8a, 0x8a3a20, 0xffd060], [0x9a4ad8, 0x242028, 0xf2c230, 0x5a2a8a], [0xffc81f, 0xffe27a, 0xffa800, 0xfff4c0]];
const GOLD = 3;
const PI = Math.PI, TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
// the sky dome: a quarter ellipsoid over the meadow, open towards the hide
const DX = 3.1, DY = 3.85, DZ = 5.1, DC = 2;
const ell = (x, y, z) => (x / DX) ** 2 + (y / DY) ** 2 + ((z - DC) / DZ) ** 2;
const EYE_Y = .5, EYE_Z = 2.76, YAW = .5, PMIN = -.08, PMAX = .5;
const seatX = (i, n) => (i - (n - 1) / 2) * .45;

// solid-colour parts baked into one vertex-coloured geometry: [geo, color, pos, rot, scale]
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function paint(parts) {
  return mergeGeometries(parts.map(([geo, color, p = [0, 0, 0], r = [0, 0, 0], s = 1]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    g.applyMatrix4(_m.compose(_p.set(...p), _q.setFromEuler(_e.set(...r)), typeof s === 'number' ? _s.setScalar(s) : _s.set(...s)));
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }));
}
const BOX = new THREE.BoxGeometry(1, 1, 1), BALL = new THREE.IcosahedronGeometry(1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const VC = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8 });
const VCGOLD = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .35, metalness: .3, emissive: 0x5a3a00 });

// a duck, nose to +z: the body in one piece, the two wings apart so they can flap
function duckGeos([body, head, wing, tip]) {
  const g = paint([
    [BALL, body, [0, 0, 0], [0, 0, 0], [.048, .042, .075]],
    [BALL, head, [0, .045, .065], [0, 0, 0], .032],
    [BOX, 0xf4f4f0, [0, .025, .052], [.3, 0, 0], [.05, .012, .022]],
    [BOX, 0xffa21a, [0, .04, .1], [.15, 0, 0], [.024, .011, .04]],
    [BOX, 0x141418, [.027, .053, .078], [0, 0, 0], .01], [BOX, 0x141418, [-.027, .053, .078], [0, 0, 0], .01],
    [BOX, wing, [0, .015, -.078], [-.4, 0, 0], [.034, .012, .034]],
  ]);
  const w = paint([[BOX, wing, [.045, 0, 0], [0, 0, 0], [.09, .01, .055]], [BOX, tip, [.105, 0, -.005], [0, 0, 0], [.04, .008, .04]]]);
  return { g, w };
}
function hunterGeos(color) {
  const hat = new THREE.Color(color).multiplyScalar(.7).getHex();
  const body = paint([
    [BOX, 0x4a3a2a, [.02, .055, 0], [0, 0, 0], [.03, .11, .035]], [BOX, 0x4a3a2a, [-.02, .055, 0], [0, 0, 0], [.03, .11, .035]],
    [BOX, color, [0, .165, 0], [0, 0, 0], [.09, .11, .06]],
    [BOX, 0x6a7a3a, [0, .17, -.031], [0, 0, 0], [.07, .06, .005]],
    [BALL, 0xf0c8a0, [0, .25, 0], [0, 0, 0], .036],
    [CYL, hat, [0, .285, 0], [0, 0, 0], [.036, .026, .036]], [BOX, hat, [0, .274, -.02], [0, 0, 0], [.08, .006, .08]],
    [BOX, color, [.05, .19, -.035], [0, 0, 0], [.025, .025, .08]], [BOX, color, [-.045, .19, -.045], [0, 0, 0], [.025, .025, .09]],
  ]);
  return body;
}
const GUN = paint([[BOX, 0x2a2a32, [0, 0, -.075], [0, 0, 0], [.012, .012, .13]], [BOX, 0x8a5a2a, [0, -.006, .02], [0, 0, 0], [.016, .024, .06]]]);
// the view-model: a little double-barrelled gun seen from the eye
const FPGUN = paint([
  [CYL, 0x2a2a32, [.0045, 0, -.07], [PI / 2, 0, 0], [.004, .12, .004]], [CYL, 0x2a2a32, [-.0045, 0, -.07], [PI / 2, 0, 0], [.004, .12, .004]],
  [BOX, 0x9a6a36, [0, -.008, -.05], [0, 0, 0], [.015, .008, .05]], [BOX, 0xc8a050, [0, -.003, -.004], [0, 0, 0], [.017, .014, .024]],
  [BOX, 0x8a5a2a, [0, -.013, .03], [-.25, 0, 0], [.015, .02, .05]],]);

function softTex() {
  return V.paintTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}
// the painted sky: flat NES blue, blocky clouds, a far line of hills and trees
function skyTex() {
  const t = V.paintTex(256, 128, (g, w, h) => {
    const R = rng(11);
    g.fillStyle = '#5cb4fc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4aa2f4'; g.fillRect(0, 0, w, 22); g.fillStyle = '#54abf8'; g.fillRect(0, 22, w, 14);
    for (const [cx, cy, cw] of [[30, 58, 34], [96, 44, 26], [150, 66, 40], [210, 50, 30], [250, 72, 22], [70, 80, 20], [180, 86, 18]]) {
      [.5, .8, 1, 1, .7].forEach((k, i) => { g.fillStyle = i === 4 ? '#cfe6ff' : '#ffffff'; const ww = Math.round(cw * k / 2) * 2; g.fillRect(cx - ww / 2, cy + i * 3, ww, 3); });
    }
    g.fillStyle = '#3a9a44';
    for (let x = 0; x < w; x += 4) { const hh = Math.round((12 + 6 * Math.sin(x * .05) + 4 * Math.sin(x * .13)) / 2) * 2; g.fillRect(x, h - hh, 4, hh); }
    g.fillStyle = '#1f7a34';
    for (let x = 0; x < w; x += 6) { const hh = 6 + Math.round(R() * 5) * 2; g.fillRect(x, h - hh, 6, hh); g.fillRect(x + 2, h - hh - 2, 2, 2); }
    g.fillStyle = '#62c040'; g.fillRect(0, h - 3, w, 3);
  });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;
  return t;
}

export function createCanards({ scene, camera, audio, ui, at }) {
  const O = at.clone().add(new THREE.Vector3(0, G, 0));
  const root = new THREE.Group(); root.position.copy(O); scene.add(root);
  const chip = createChip(.12);

  // ---------- the diorama ----------
  const R = rng(5), ground = [], props = [];
  ground.push([BOX, 0x7a5232, [0, -G / 2 - .015, 0], [0, 0, 0], [6.4, G - .03, 6.4]], [BOX, 0x62c040, [0, -.015, 0], [0, 0, 0], [6.4, .03, 6.4]]);
  ground.push([BOX, 0xc89a5a, [0, .002, 1.95], [0, 0, 0], [2.3, .01, 1.05]], [BOX, 0xb08448, [0, .004, 2.3], [0, 0, 0], [1.6, .01, .4]]);
  // the tree: a trunk and a lumpy blob of cubes
  const TX = -1.7, TZ = -.2;
  props.push([BOX, 0x7a4a26, [TX, .6, TZ], [0, 0, 0], [.24, 1.2, .24]], [BOX, 0x6a3e20, [TX + .16, .06, TZ], [0, 0, 0], [.16, .12, .16]], [BOX, 0x6a3e20, [TX - .1, .05, TZ + .14], [0, 0, 0], [.14, .1, .14]]);
  props.push([BOX, 0x7a4a26, [TX + .22, 1.0, TZ], [0, 0, 0], [.32, .09, .09]], [BOX, 0x7a4a26, [TX + .36, 1.1, TZ], [0, 0, 0], [.09, .24, .09]]);
  for (let n = 0; n < 40; n++) {
    const a = R() * TAU, r = R() * .5, s = .36 + R() * .3, x = TX + .1 + Math.cos(a) * r, y = 1.35 + R() * .6, z = TZ + Math.sin(a) * r * .8;
    // stay inside the dome
    if (ell(Math.abs(x) + s / 2, y + s / 2, z - s / 2) > .97) continue;
    props.push([BOX, [0x2e8b2e, 0x3aa53a, 0x247a24][n % 3], [x, y, z], [0, 0, 0], s]);
  }
  // bushes
  for (const [bx, bz, k] of [[2.05, .15, 1], [-.9, -1.7, .8], [2.25, -.95, .7], [-2.4, .6, .7], [.4, -2.2, .6]]) {
    for (let n = 0; n < 6; n++) props.push([BOX, [0x2e9a36, 0x3cb040, 0x288a30][n % 3], [bx + (R() - .5) * .5 * k, (.1 + R() * .12) * k, bz + (R() - .5) * .35 * k], [0, 0, 0], (.18 + R() * .14) * k]);
  }
  // the pond: stones and reeds round it
  const PX = 1.1, PZ = -1.35, PR = .7;
  ground.push([CYL, 0x2a70b8, [PX, .004, PZ], [0, PI / 8, 0], [PR + .05, .012, PR + .05]]);
  for (let n = 0; n < 14; n++) { const a = n / 14 * TAU; props.push([BOX, n % 2 ? 0x9a9aa2 : 0x7c7c86, [PX + Math.cos(a) * (PR + .06), .025, PZ + Math.sin(a) * (PR + .06)], [0, a, 0], [.13, .05 + R() * .03, .1]]); }
  for (let n = 0; n < 9; n++) {
    const a = -.9 + n * .16, x = PX + Math.cos(a) * (PR + .14), z = PZ + Math.sin(a) * (PR + .14), h = .22 + R() * .14;
    props.push([BOX, 0x3a8a30, [x, h / 2, z], [0, 0, (R() - .5) * .2], [.014, h, .014]], [BOX, 0x6a3a1a, [x, h, z], [0, 0, 0], [.028, .07, .028]]);
  }
  for (const [lx, lz] of [[.85, -1.2], [1.35, -1.6], [1.3, -1.05]]) props.push([CYL, 0x3ca83a, [lx, .02, lz], [0, 0, 0], [.09, .006, .09]], [BOX, 0xfff0f4, [lx + .02, .03, lz], [0, 0, 0], .025]);
  // flowers and pebbles in the meadow
  for (let n = 0; n < 60; n++) {
    const x = (R() - .5) * 5.8, z = -2.6 + R() * 5;
    if (Math.hypot(x - PX, z - PZ) < PR + .2 || (Math.abs(x) < 1.2 && z > 2.3)) continue;
    ground.push([BOX, [0xffffff, 0xffe030, 0xff5a6a, 0xb080ff][n % 4], [x, .015, z], [0, 0, 0], .025]);
  }
  // the mole's mound, by the hide
  const MX = -1.15, MZ = 1.85;
  for (let n = 0; n < 11; n++) { const a = n / 11 * TAU; props.push([BOX, n % 2 ? 0x8a5a34 : 0x6e4628, [MX + Math.cos(a) * .22, .035, MZ + Math.sin(a) * .18], [0, a, 0], [.15, .08, .12]]); }
  ground.push([CYL, 0x2a1a10, [MX, .004, MZ], [0, 0, 0], [.18, .01, .15]]);
  // the hide: a floor of boards, a low front of planks, side walls, a sign
  props.push([BOX, 0xb07a44, [0, .115, 2.82], [0, 0, 0], [2.0, .23, .64]]);
  for (let n = 0; n < 10; n++) props.push([BOX, 0x9a6634, [-.9 + n * .2, .231, 2.82], [0, 0, 0], [.012, .002, .64]]);
  for (let n = 0; n < 21; n++) { const x = -1 + n * .1; props.push([BOX, n % 2 ? 0x8a5a30 : 0x9c6a38, [x, .2 + (n % 3) * .006, 2.47], [0, 0, 0], [.09, .4 + (n % 3) * .012, .03]]); }
  props.push([BOX, 0x6a4424, [0, .37, 2.47], [0, 0, 0], [2.08, .03, .05]], [BOX, 0x6a4424, [0, .14, 2.45], [0, 0, 0], [2.08, .03, .02]]);
  for (const s of [-1, 1]) {
    props.push([BOX, 0x8a5a30, [s * 1.03, .2, 2.8], [0, 0, 0], [.03, .4, .66]], [BOX, 0x6a4424, [s * 1.03, .24, 3.12], [0, 0, 0], [.05, .48, .05]]);
  }
  // camouflage branches tied on the front
  for (let n = 0; n < 16; n++) props.push([BOX, [0x3a7a2a, 0x4a8a30, 0x6a8a2a][n % 3], [-.95 + R() * 1.9, .06 + R() * .22, 2.44], [0, 0, (R() - .5) * 1.2], [.18, .03, .02]]);
  props.push([BOX, 0x6a4424, [1.45, .25, 2.6], [0, 0, 0], [.04, .5, .04]], [BOX, 0x8a5a30, [1.45, .45, 2.61], [0, 0, 0], [.56, .16, .02]]);
  // the frame round the front of the sky dome
  const arch = [];
  for (let n = 0; n <= 40; n++) { const a = n / 40 * PI; arch.push(new THREE.Vector3(Math.cos(a) * (DX + .02), Math.sin(a) * (DY + .02), DC)); }
  props.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 60, .05, 6), 0xe0b060]);
  for (const s of [-1, 1]) props.push([BOX, 0xc89040, [s * (DX + .02), .12, DC], [0, 0, 0], [.16, .24, .16]]);
  const gMesh = new THREE.Mesh(paint(ground), VC); gMesh.receiveShadow = true; root.add(gMesh);
  const pMesh = new THREE.Mesh(paint(props), VC); pMesh.receiveShadow = pMesh.castShadow = true; root.add(pMesh);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, .01, 8), new THREE.MeshStandardMaterial({ color: 0x3aa0f0, roughness: .12, metalness: .1, emissive: 0x0a3050, flatShading: true }));
  water.position.set(PX, .012, PZ); water.rotation.y = PI / 8; water.receiveShadow = true; root.add(water);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.52, .13), new THREE.MeshStandardMaterial({ roughness: .8, map: V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = '#8a5a30'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a4c26'; g.fillRect(0, 20, w, 3); g.fillRect(0, 42, w, 3);
    g.fillStyle = '#fff1d0'; g.font = '700 25px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('chasse aux canards', w / 2, h / 2 + 1);
  }) }));
  sign.position.set(1.45, .45, 2.625); root.add(sign);
  // the sky: painted inside, plain boards outside
  const domeGeo = new THREE.SphereGeometry(1, 48, 16, PI, PI, 0, PI / 2);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, toneMapped: false });
  const sky = new THREE.Mesh(domeGeo, skyMat); sky.scale.set(DX, DY, DZ); sky.position.z = DC; root.add(sky);
  const planks = V.paintTex(128, 32, (g, w, h) => {
    for (let x = 0; x < w; x += 4) { g.fillStyle = ['#7a4e2c', '#6a4226', '#845632', '#5e3a22'][(x / 4) % 4]; g.fillRect(x, 0, 4, h); }
    g.fillStyle = '#4a2c18'; for (let y = 3; y < h; y += 8) g.fillRect(0, y, w, 1);
  });
  planks.magFilter = THREE.NearestFilter; planks.wrapS = planks.wrapT = THREE.RepeatWrapping; planks.repeat.set(2, 2);
  const shell = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ map: planks, roughness: .9 })); shell.scale.set(DX + .03, DY + .03, DZ + .03); shell.position.z = DC; root.add(shell);
  // tall grass: a band in front where the ducks hide, tufts over the meadow
  const grassN = 760, grass = new THREE.InstancedMesh(BOX.clone().translate(0, .5, 0), new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), grassN);
  grass.receiveShadow = true;
  {
    const d = new THREE.Object3D(), cols = [0x2f9e2f, 0x3cb83a, 0x57cc3f, 0x288a2a].map(c => new THREE.Color(c));
    for (let n = 0; n < grassN; n++) {
      let x, z, h;
      if (n < 540) { x = (R() - .5) * 6.2; z = .62 + R() * .72; h = .18 + R() * .14; }
      else { do { x = (R() - .5) * 6; z = -2.5 + R() * 5.4; } while (Math.hypot(x - PX, z - PZ) < PR + .15 || ell(x, 0, z) > .9 || (z > .5 && z < 1.4)); h = .05 + R() * .08; }
      d.position.set(x, 0, z); d.rotation.set((R() - .5) * .3, R() * PI, (R() - .5) * .3); d.scale.set(.05 + R() * .05, h, .03 + R() * .02); d.updateMatrix();
      grass.setMatrixAt(n, d.matrix); grass.setColorAt(n, cols[n % 4]);
    }
  }
  root.add(grass);

  // ---------- the living things: ducks, plates, the mole ----------
  const SOFT = softTex();
  const species = SPECIES.map(duckGeos);
  const ducks = [], clays = [];
  const live = new THREE.Group(); root.add(live);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(), body = new THREE.Mesh(species[i % 3].g, VC); body.castShadow = true; g.add(body);
    const wl = new THREE.Mesh(species[i % 3].w, VC), wr = new THREE.Mesh(species[i % 3].w, VC);
    wl.position.set(.03, .02, .005); wr.position.set(-.03, .02, .005); wr.scale.x = -1; g.add(wl, wr);
    g.scale.setScalar(1.3); live.add(g);
    ducks.push({ g, body, wl, wr });
  }
  const clayGeo = paint([[CYL, 0xff6a1a, [0, 0, 0], [0, 0, 0], [.06, .016, .06]], [CYL, 0xd84a10, [0, .01, 0], [0, 0, 0], [.03, .008, .03]]]);
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(clayGeo, VC); m.scale.setScalar(1.4); m.visible = false; m.castShadow = true; live.add(m); clays.push(m); }
  function dress(slot, s) {
    const sp = species[s], mat = s === GOLD ? VCGOLD : VC;
    slot.body.geometry = sp.g; slot.wl.geometry = slot.wr.geometry = sp.w;
    slot.body.material = slot.wl.material = slot.wr.material = mat;
  }
  // the diorama pose: three ducks on thin rods, mid-flap
  const decor = new THREE.Group(); root.add(decor);
  const DECOR = [[-.6, 1.25, -1.2, .6], [.75, 1.75, -.7, -.9], [1.75, .95, .1, -2.2]];
  function decorPose() {
    DECOR.forEach(([x, y, z, yaw], i) => { const d = ducks[i]; dress(d, i); d.g.visible = true; d.g.position.set(x, y, z); d.g.rotation.set(-.2, yaw, 0); d.wl.rotation.z = -.5 + i * .4; d.wr.rotation.z = .5 - i * .4; });
    ducks[3].g.visible = false;
    for (const c of clays) c.visible = false;
  }
  for (const [x, y, z] of DECOR) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, y, 5), V.mat(0x3a3a40, { metalness: .6, roughness: .4 })); rod.position.set(x, y / 2, z); decor.add(rod); }

  // the mole: the game's mascot, pops out of the grass with the catch
  const mole = new THREE.Group(); mole.scale.setScalar(1.6); root.add(mole);
  const moleBody = new THREE.Mesh(paint([
    [BALL, 0x5b4a45, [0, 0, 0], [0, 0, 0], [.1, .135, .09]], [BALL, 0xc8a080, [0, -.01, .045], [0, 0, 0], [.07, .09, .055]],
    [BALL, 0xf29aa8, [0, .075, .08], [0, 0, 0], [.038, .03, .035]], [BALL, 0xd8506a, [0, .085, .115], [0, 0, 0], .016],
    [BALL, 0x101014, [.038, .11, .07], [0, 0, 0], .013], [BALL, 0x101014, [-.038, .11, .07], [0, 0, 0], .013],
    [BOX, 0x3a2e2a, [0, .12, -.01], [0, 0, 0], [.05, .03, .03]], [BOX, 0xfafaf0, [0, .05, .098], [0, 0, 0], [.022, .014, .006]],
  ]), VC);
  moleBody.castShadow = true; mole.add(moleBody);
  const mouth = new THREE.Mesh(paint([[BOX, 0x401018, [0, .035, .092], [0, 0, 0], [.04, .026, .01]], [BOX, 0xff7080, [0, .028, .096], [0, 0, 0], [.022, .01, .004]]]), VC);
  mole.add(mouth);
  const paws = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * .085, .02, .03); const m = new THREE.Mesh(paint([[BOX, 0x5b4a45, [0, .04, 0], [0, 0, 0], [.04, .08, .04]], [BALL, 0xf29aa8, [0, .09, 0], [0, 0, 0], [.035, .018, .03]]]), VC); p.add(m); mole.add(p); return p; });
  const miniDuck = paint([[BALL, 0x3a6fd8, [0, 0, 0], [0, 0, 0], [.035, .03, .05]], [BALL, 0x18a858, [0, .03, .045], [0, 0, 0], .022], [BOX, 0xffa21a, [0, .025, .075], [0, 0, 0], [.016, .008, .025]]]);
  const miniClay = paint([[CYL, 0xff6a1a, [0, 0, 0], [PI / 2, 0, 0], [.04, .012, .04]]]);
  const catchM = [0, 1, 2].map(n => { const m = new THREE.Mesh(miniDuck, VC); m.position.set(0, .1, .02); m.rotation.set(PI / 2 - .3, 0, 0); if (n < 2) paws[n].add(m); else { m.position.set(0, .23, .04); mole.add(m); } return m; });
  function moleIdle() {
    mole.position.set(MX, -.03, MZ); mole.rotation.set(0, .5, 0); mole.visible = true; mouth.visible = false;
    paws[0].rotation.set(-.9, 0, .3); paws[1].rotation.set(-.9, 0, -.3);
    for (const m of catchM) m.visible = false;
  }
  moleIdle(); decorPose();

  // ---------- feathers, plate shards, flashes, score tags ----------
  const PMAX = 200;
  const feathers = new THREE.InstancedMesh(new THREE.PlaneGeometry(.018, .032), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), PMAX);
  feathers.frustumCulled = false; feathers.visible = false; root.add(feathers);
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, sp: 0, g: 1, drag: 1, s: 1 }));
  let pNext = 0;
  const dm = new THREE.Object3D(), tc = new THREE.Color();
  for (let n = 0; n < PMAX; n++) feathers.setColorAt(n, tc.setHex(0xffffff));
  function burst(x, y, z, cols, n, clay) {
    for (let k = 0; k < n; k++) {
      const p = parts[pNext], a = Math.random() * TAU, v = (clay ? .7 : .35) + Math.random() * .5;
      Object.assign(p, { life: 1.2 + Math.random(), x, y, z, vx: Math.cos(a) * v, vy: (Math.random() - .2) * v * 1.3, vz: Math.sin(a) * v, rx: Math.random() * TAU, ry: Math.random() * TAU, sp: (Math.random() - .5) * 14, g: clay ? 3 : .5, drag: clay ? .4 : 2.6, s: clay ? 1.3 + Math.random() : .8 + Math.random() * .5 });
      p.max = p.life;
      feathers.setColorAt(pNext, tc.setHex(cols[k % cols.length]));
      pNext = (pNext + 1) % PMAX;
    }
    feathers.instanceColor.needsUpdate = true;
  }
  function stepParts(dt) {
    let any = false;
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) {
        any = true; p.life -= dt;
        const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt + (p.g < 1 ? Math.sin(p.life * 6 + n) * .05 * dt : 0); p.z += p.vz * dt; p.rx += p.sp * dt;
        if (p.y < .01) { p.y = .01; p.vx = p.vz = p.vy = 0; p.sp = 0; }
      }
      dm.position.set(p.x, p.y, p.z); dm.rotation.set(p.rx, p.ry, p.rx * .5); dm.scale.setScalar(p.life > 0 ? p.s * Math.min(1, p.life / p.max * 3) : 0); dm.updateMatrix();
      feathers.setMatrixAt(n, dm.matrix);
    }
    feathers.visible = any;
    feathers.instanceMatrix.needsUpdate = true;
  }
  const flashes = Array.from({ length: 8 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; root.add(s); return { s, life: 0 }; });
  let fNext = 0;
  function flash(x, y, z, color, size = .12) {
    const f = flashes[fNext]; fNext = (fNext + 1) % flashes.length;
    f.s.position.set(x, y, z); f.s.scale.setScalar(size); f.s.material.color.setHex(color).multiplyScalar(3); f.s.visible = true; f.life = .18;
  }
  const tags = Array.from({ length: 4 }, () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(.3, .11, 1); s.visible = false; root.add(s);
    return { s, c, tex, life: 0 };
  });
  let tNext = 0;
  function tag(x, y, z, text, color) {
    const t = tags[tNext]; tNext = (tNext + 1) % tags.length;
    const g = t.c.getContext('2d'); g.clearRect(0, 0, 128, 48);
    g.font = '900 34px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#1a1420'; g.strokeText(text, 64, 25); g.fillStyle = hexOf(color); g.fillText(text, 64, 25);
    t.tex.needsUpdate = true; t.s.position.set(x, y + .12, z); t.s.visible = true; t.life = 1.3;
  }

  // ---------- the hunters ----------
  function makeHunter(color) {
    const g = new THREE.Group(), body = new THREE.Mesh(hunterGeos(color), VC); body.castShadow = true; g.add(body);
    const gun = new THREE.Group(); gun.position.set(.03, .2, -.05); g.add(gun);
    gun.add(new THREE.Mesh(GUN, VC));
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(3, 2.2, 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fl.position.set(0, 0, -.16); fl.scale.setScalar(.07); fl.visible = false; gun.add(fl);
    return { g, gun, fl };
  }
  const decoHunter = makeHunter(0x3a7a3a); decoHunter.g.position.set(-.3, .23, 2.8); decoHunter.g.rotation.y = -.2; decoHunter.gun.rotation.x = .55; decor.add(decoHunter.g);
  const fp = new THREE.Group(), fpFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(3, 2.2, 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fp.add(new THREE.Mesh(FPGUN, VC)); fpFlash.position.set(0, 0, -.135); fpFlash.scale.setScalar(.035); fpFlash.visible = false; fp.add(fpFlash);

  // ---------- state ----------
  let seats = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'canards', seed = 1, count = 0, clock = 0, goAt = 0, endT = -1, result = null, ended = false;
  let waveK = 0, wt = 0, targets = [], moleK = -1, moleX = 0, moleHappy = 0, tint = 0, fireWas = false;
  let recoil = 0, crossHit = 0, sendA = 0, sendW = 0, camFov = 60, cross = null, crossG = null;
  const byId = (id) => seats.find(s => s.id === id);

  // ---------- the waves: every path drawn from the seed ----------
  // two waves a round; the round sets the pace
  function makeWave(w) {
    const r = rng(seed * 31 + w * 977 + (mode === 'plateaux' ? 7 : 0) + 1), k = w >> 1;
    const clay = mode === 'plateaux', n = clay ? 2 : k < 4 ? 2 : 3;
    const gold = !clay && r() < .25 ? Math.floor(r() * n) : -1;
    const list = [];
    let t0 = 0;
    for (let i = 0; i < n; i++) {
      const tg = { clay, gold: i === gold, sp: i === gold ? GOLD : Math.floor(r() * 3), t0, i: 0, dead: null, quack: false, flown: false };
      if (clay) {
        const s = 1 + k * .08;
        tg.s = s; tg.p0 = [(r() * 2 - 1) * 1.3, .05, .35 + r() * .3]; tg.v0 = [(r() - .5) * 1.3, 2.1 + r() * .5, -(.7 + r() * .45)];
        let tt = .1; while (tt < 4 && !(clayY(tg, tt) < 0) && ell(tg.p0[0] + tg.v0[0] * tt, clayY(tg, tt), tg.p0[2] + tg.v0[2] * tt) < .9) tt += .02;
        tg.gone = tg.flee = t0 + tt / s;
      } else duckPath(tg, r, k);
      list.push(tg);
      t0 += clay ? .25 + r() * .5 : .4 + r() * .7;
    }
    return list;
  }
  const clayY = (tg, tt) => tg.p0[1] + tg.v0[1] * tt - .9 * tt * tt;
  function duckPath(tg, r, k) {
    const v = (.8 + k * .13) * (tg.gold ? 1.35 : 1), fly = 6 - k * .25;
    let x = (r() * 2 - 1) * 1.6, y = -.05, z = -.3 + r() * .7, t = tg.t0;
    const pts = [[t, x, y, z]];
    const leg = (nx, ny, nz, sp) => { t += Math.max(.2, Math.hypot(nx - x, ny - y, nz - z) / sp); x = nx; y = ny; z = nz; pts.push([t, x, y, z]); };
    leg(x + (r() - .5) * .6, .9 + r() * .4, z - r() * .3, v * .8);
    while (t < tg.t0 + fly) {
      const a = r() * TAU, dur = .5 + r() * .7 - k * .02;
      let nx = clamp(x + Math.cos(a) * v * dur, -2.2, 2.2), ny = clamp(y + (r() - .45) * v * dur * .9, .6, 2.4), nz = clamp(z + Math.sin(a) * v * dur * .5, -2.1, .4);
      const e = ell(nx, ny, nz);
      if (e > .75) { const f = Math.sqrt(.75 / e); nx *= f; ny = Math.max(.6, ny * f); nz = DC + (nz - DC) * f; }
      if (Math.hypot(nx - x, ny - y, nz - z) < .3) { nx = x * .4; ny = 1.4; nz = -1; }
      leg(nx, ny, nz, v);
    }
    tg.flee = t;
    leg(x * .8, 4.4, z - .8, v * 1.6);   // off into the painted sky
    tg.pts = pts; tg.gone = t;
  }
  // where a target is at wave time t (into o), false when not in the air
  function posAt(tg, t, o) {
    if (tg.clay) {
      const tt = Math.max(0, (t - tg.t0) * tg.s);
      o.x = tg.p0[0] + tg.v0[0] * tt; o.y = clayY(tg, tt); o.z = tg.p0[2] + tg.v0[2] * tt;
      o.vx = tg.v0[0]; o.vy = tg.v0[1] - 1.8 * tt; o.vz = tg.v0[2];
      return t >= tg.t0 && t < tg.gone;
    }
    const P = tg.pts;
    let i = tg.i;
    while (i < P.length - 2 && P[i + 1][0] < t) i++;
    while (i > 0 && P[i][0] > t) i--;
    tg.i = i;
    const a = P[i], b = P[i + 1], d = b[0] - a[0], k = clamp((t - a[0]) / d, 0, 1);
    o.x = a[1] + (b[1] - a[1]) * k; o.y = a[2] + (b[2] - a[2]) * k; o.z = a[3] + (b[3] - a[3]) * k;
    o.vx = (b[1] - a[1]) / d; o.vy = (b[2] - a[2]) / d; o.vz = (b[3] - a[3]) / d;
    return t >= tg.t0 && t < tg.gone;
  }
  const tp = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const shootable = (tg, t) => !tg.dead && posAt(tg, t, tp) && tp.y > .3;
  // the first target a shot from this seat meets, or -1
  const eye = new THREE.Vector3(), dir = new THREE.Vector3(), rel = new THREE.Vector3();
  const aimDir = (yaw, pitch, o) => o.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  function hitTest(seat, yaw, pitch, t) {
    eye.set(seat.x, EYE_Y, EYE_Z); aimDir(yaw, pitch, dir);
    let best = -1, bd = Infinity;
    targets.forEach((tg, i) => {
      if (!shootable(tg, t)) return;
      rel.set(tp.x - eye.x, tp.y - eye.y, tp.z - eye.z);
      const along = rel.dot(dir);
      if (along <= 0) return;
      const off = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
      if (off < (tg.clay ? .13 : .16) && along < bd) { bd = along; best = i; }
    });
    return best;
  }
  const points = (tg, t) => tg.gold ? 300 : 100 + (t - tg.t0 < (tg.clay ? .9 : 1.6) ? 50 : 0);

  function beginWave(k, t = -1) {
    waveK = k; wt = t; targets = makeWave(k); moleK = -1; fireWas = false;
    for (const s of seats) { s.shots = SHOTS; s.nf = targets[0].t0 + s.react; s.aimT = -1; }
    targets.forEach((tg, i) => { if (!tg.clay) dress(ducks[i], tg.sp); });
    decor.visible = false; mole.visible = false;
    for (const d of ducks) d.g.visible = false;
    if (k % 2 === 0) ui.toast(k === WAVES - 2 ? 'dernière manche !' : `manche ${k / 2 + 1}`, false, 900);
    chip.seq([60, 64, 67, 72], .07, { type: .5, vol: .18 });
    if (isHost) send({ t: 'w', k, tm: wt });
  }
  function killTarget(tg, by, tm, pending = false) {
    posAt(tg, tm, tp);
    const y = Math.max(.35, tp.y);
    tg.dead = { by, tm, pending, at: wt, x: tp.x, y, z: tp.z, done: wt + (tg.clay ? .6 : .35 + Math.sqrt(y / 2.6) + .3), landed: false };
    const c = SPECIES[tg.sp];
    burst(tp.x, tp.y, tp.z, tg.clay ? [0xff6a1a, 0xd84a10, 0xffa050] : [c[0], c[2], c[3], 0xffffff], tg.clay ? 18 : 22, tg.clay);
    chip.tone(1000, 400, .1, { type: .5, vol: .22 });
    if (!tg.clay) chip.tone(1400, 260, .8, { type: 'tri', vol: .12 });
  }
  function credit(tg, by, p) {
    const s = byId(by);
    if (s) { s.score += p; s.n++; }
    if (tg && tg.dead) tag(tg.dead.x, tg.dead.y, tg.dead.z, '+' + p, s ? s.color : 0xffffff);
    if (by === meId) audio.pickup(tg?.gold ? 3 : 1);
  }
  const uncredit = (by, p) => { const s = byId(by); if (s) { s.score -= p; s.n--; } };
  // the host decides: the first valid hit on a live target wins it. A shot fired earlier (in
  // wave time) that arrives a moment late still takes it back, so the host's own seat has no edge.
  function award(i, by, tm) {
    const tg = targets[i];
    if (!tg) return;
    const d = tg.dead, p = points(tg, tm);
    let x = null, xp = 0;
    if (d && !d.pending) {
      if (d.by === by || tm >= d.tm || wt - d.at > .2) return;
      x = d.by; xp = d.p; uncredit(x, xp);
    }
    if (!d) killTarget(tg, by, tm);
    Object.assign(tg.dead, { by, tm, p, pending: false });
    credit(tg, by, p);
    send({ t: 'k', w: waveK, d: i, by, p, tm, x, xp });
  }

  // a shot: the flash at the gun, a coloured spark where it went
  function shotFx(seat, yaw, pitch, h) {
    if (seat === me) { fpFlash.visible = true; fpFlash.userData.t = .06; recoil = 1; chip.noise(.25, { vol: .5, f: 1800 }); chip.tone(120, 50, .12, { type: 'tri', vol: .45 }); }
    else if (seat.h) { seat.h.fl.visible = true; seat.flT = .07; seat.yaw = seat.ty = yaw; seat.pitch = seat.tp = pitch; chip.noise(.18, { vol: .16, f: 1400 }); }
    const tg = targets[h];
    if (tg && seat !== me) { posAt(tg, tg.dead ? tg.dead.tm : wt, tp); flash(tp.x, tp.y, tp.z, seat.color, .16); }
  }
  function fire() {
    if (state !== 'play' || !me) return;
    chip.init();
    if (me.shots <= 0 || wt < 0 || moleK === waveK) { chip.tone(1800, 1800, .02, { type: .5, vol: .12 }); return; }
    me.shots--;
    const h = hitTest(me, me.yaw, me.pitch, wt);
    shotFx(me, me.yaw, me.pitch, h);
    send({ t: 's', w: waveK, tm: Math.round(wt * 1000) / 1000, a: [me.yaw, me.pitch], h });
    if (h < 0) return;
    crossHit = .25;
    if (isHost) award(h, me.id, wt);
    else if (!targets[h].dead) killTarget(targets[h], meId, wt, true);
  }
  function botShoot(s) {
    const cand = [];
    targets.forEach((tg, i) => { if (shootable(tg, wt)) cand.push(i); });
    if (!cand.length) { s.nf = wt + .15; s.aimT = -1; return; }
    if (!cand.includes(s.aimT)) { s.aimT = cand[Math.floor(Math.random() * cand.length)]; s.nf = wt + .25 + Math.random() * .25; return; }
    posAt(targets[s.aimT], wt - s.lag, tp);
    const dx = tp.x - s.x, dy = tp.y - EYE_Y, dz = tp.z - EYE_Z, gs = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.2;
    const yaw = Math.atan2(dx, -dz) + gs() * s.sig, pitch = Math.atan2(dy, Math.hypot(dx, dz)) + gs() * s.sig;
    s.shots--; s.nf = wt + .45 + Math.random() * .45;
    const h = hitTest(s, yaw, pitch, wt);
    shotFx(s, yaw, pitch, h);
    send({ t: 's', w: waveK, tm: Math.round(wt * 1000) / 1000, a: [yaw, pitch], h, by: s.id });
    if (h >= 0) award(h, s.id, wt);
  }

  // ---------- start / stop ----------
  function start({ seed: sd = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: sn = () => {}, opts = {} } = {}) {
    stopDyn();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'canards';
    seed = sd >>> 0 || 1; meId = mid; hostId = h; isHost = hostId === meId; send = sn;
    state = 'count'; count = 3.5; clock = 0; goAt = 0; endT = -1; result = null; ended = false;
    waveK = 0; wt = -1; targets = []; moleK = -1; tint = 0; recoil = 0; crossHit = 0; sendA = 0; sendW = 0; fireWas = false;
    const r = rng(seed ^ 0x5bd1);
    const pool = BOTS.filter(([, c]) => !humans.some(u => u.color === c));
    const list = humans.map(u => ({ id: u.id, name: u.name, color: u.color, bot: false }));
    for (let n = 0; list.length < SEATS; n++) list.push({ id: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    seats = list.map((u, i) => {
      const s = { ...u, x: seatX(i, list.length), yaw: 0, pitch: .15, ty: 0, tp: .15, score: 0, n: 0, shots: SHOTS, seen: 0, flT: 0,
        react: 1.6 + r() * .8, sig: .036 + r() * .02, lag: .04 + r() * .06, nf: 0, aimT: -1, h: null };
      if (u.id !== meId) { s.h = makeHunter(u.color); s.h.g.position.set(s.x, .23, 2.8); root.add(s.h.g); }
      return s;
    });
    me = byId(meId);
    decoHunter.g.visible = false;
    camFov = camera.fov;
    scene.add(fp);
    cross = document.createElement('div');
    cross.style.cssText = 'position:fixed;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;pointer-events:none;z-index:40';
    cross.innerHTML = '<svg viewBox="0 0 46 46" width="46" height="46"><g fill="none" stroke="rgba(0,0,0,.55)" stroke-width="4"><circle cx="23" cy="23" r="12"/><path d="M23 3v12M23 31v12M3 23h12M31 23h12"/></g><g fill="none" stroke="#fff" stroke-width="2"><circle cx="23" cy="23" r="12"/><path d="M23 3v12M23 31v12M3 23h12M31 23h12"/><circle cx="23" cy="23" r="1.5" fill="#fff"/></g></svg>';
    document.body.appendChild(cross); crossG = cross.querySelectorAll('g')[1];
    chip.init(); audio.tick();
    update(0, new Set());
  }
  function stopDyn() {
    for (const s of seats) if (s.h) root.remove(s.h.g);
    seats = []; me = null; targets = [];
    for (const p of parts) p.life = 0;
    for (const f of flashes) { f.life = 0; f.s.visible = false; }
    for (const t of tags) { t.life = 0; t.s.visible = false; }
    feathers.visible = false;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    scene.remove(fp);
    if (cross) { cross.remove(); cross = null; }
    decor.visible = decoHunter.g.visible = true; moleIdle(); decorPose(); skyMat.color.setRGB(1, 1, 1);
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    chip.close();
  }

  // ---------- network ----------
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const src = byId(pid);
    if (src) src.seen = clock;
    if (fx.t === 'a' && src && src !== me) { src.ty = fx.a[0]; src.tp = fx.a[1]; }
    else if (fx.t === 'b' && !isHost) for (const [id, y, p] of fx.l) { const s = byId(id); if (s) { s.ty = y; s.tp = p; } }
    else if (fx.t === 's') {
      const s = byId(fx.by || pid);
      if (!s || s === me || fx.w !== waveK) return;
      shotFx(s, fx.a[0], fx.a[1], fx.h);
      if (isHost && !s.bot) { const h = hitTest(s, fx.a[0], fx.a[1], fx.tm); if (h >= 0) award(h, s.id, fx.tm); }
    } else if (fx.t === 'k' && !isHost) {
      const tg = fx.w === waveK ? targets[fx.d] : null;
      if (tg && !tg.dead) killTarget(tg, fx.by, fx.tm);
      if (tg) Object.assign(tg.dead, { by: fx.by, pending: false });
      if (fx.x) uncredit(fx.x, fx.xp);
      credit(tg, fx.by, fx.p);
    } else if (fx.t === 'w' && !isHost && state !== 'end') {
      if (fx.k >= WAVES) finish();
      else if (state === 'play' && fx.k !== waveK) beginWave(fx.k, fx.tm + .04);
      else if (state === 'play' && Math.abs(wt - fx.tm - .04) > .06) wt = fx.tm + .04;
    }
  }
  function peerLeft(id) {
    const s = byId(id);
    if (!s || s === me) return;
    if (s.h) root.remove(s.h.g);
    seats.splice(seats.indexOf(s), 1);
    if (id === hostId) {
      hostId = hostOf(seats.filter(q => !q.bot), hostId); isHost = hostId === meId;
      // the new host settles the hits it only guessed at
      if (isHost) targets.forEach((tg, i) => { if (tg.dead?.pending) award(i, meId, tg.dead.tm); });
    }
  }

  // ---------- the frame ----------
  function doneAt() { let d = -1; for (const tg of targets) d = Math.max(d, tg.dead ? tg.dead.done : tg.gone); return d; }
  function update(dt, keys) {
    if (state === 'off') return;
    dt = clamp(dt, 0, .05);
    clock += dt;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'play'; goAt = clock; audio.buy(); beginWave(0, -1); }
    }
    // aiming: the mouse through look(), the keys as a fallback
    if (me && state !== 'end') {
      const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      me.yaw = clamp(me.yaw + kx * 1.1 * dt, -YAW, YAW); me.pitch = clamp(me.pitch + ky * 1.1 * dt, PMIN, PMAX);
      const f = keys.has('Space');
      if (f && !fireWas) fire();
      fireWas = f;
    }
    if (state === 'play') {
      wt += dt;
      const done = doneAt();
      // the mole comes up once the wave is over
      if (wt > done && moleK !== waveK) {
        moleK = waveK;
        const dead = targets.filter(tg => tg.dead);
        moleHappy = dead.length;
        moleX = dead.length ? clamp(dead[dead.length - 1].dead.x, -1.6, 1.6) : 0;
        if (moleHappy) chip.seq([72, 76, 79, 76, 84], .09, { type: .25, vol: .2 }); else chip.seq([67, 64, 67, 64, 67, 64, 62], .08, { type: .125, vol: .25 });
      }
      if (isHost) {
        for (const s of seats) if (s.bot && s.shots > 0 && wt >= s.nf && moleK !== waveK) botShoot(s);
        if (moleK === waveK && wt > done + 2.5) {
          if (waveK + 1 >= WAVES) { send({ t: 'w', k: WAVES }); finish(); } else beginWave(waveK + 1, -1);
        }
      }
      // drop the humans that never came
      if (clock > 9) for (const s of [...seats]) if (!s.bot && s !== me && !s.seen) peerLeft(s.id);
    }
    // bots turn towards what they aim at (the host decides, the others follow)
    if (isHost) for (const s of seats) if (s.bot) {
      if (s.aimT >= 0 && targets[s.aimT] && posAt(targets[s.aimT], wt, tp)) { s.ty = Math.atan2(tp.x - s.x, EYE_Z - tp.z); s.tp = Math.atan2(tp.y - EYE_Y, Math.hypot(tp.x - s.x, tp.z - EYE_Z)); }
      else { s.ty *= .98; s.tp += (.2 - s.tp) * .02; }
    }
    for (const s of seats) {
      if (s === me || !s.h) continue;
      const a = Math.min(1, dt * 10);
      s.yaw += (s.ty - s.yaw) * a; s.pitch += (s.tp - s.pitch) * a;
      s.h.g.rotation.y = -s.yaw * .7; s.h.gun.rotation.set(s.pitch, -s.yaw * .3, 0);
      s.flT -= dt; if (s.flT <= 0) s.h.fl.visible = false;
    }
    drawTargets(dt);
    drawMole(dt);
    stepParts(dt);
    for (const f of flashes) if (f.life > 0) { f.life -= dt; f.s.scale.multiplyScalar(1 + dt * 4); if (f.life <= 0) f.s.visible = false; }
    for (const t of tags) if (t.life > 0) { t.life -= dt; t.s.position.y += dt * .2; t.s.material.opacity = Math.min(1, t.life * 2); if (t.life <= 0) t.s.visible = false; }
    // the sky blushes while a duck gets away
    const fleeing = state === 'play' && targets.some(tg => !tg.dead && !tg.clay && wt > tg.flee && wt < tg.gone);
    tint += ((fleeing ? 1 : 0) - tint) * Math.min(1, dt * 6);
    skyMat.color.setRGB(1, 1 - tint * .3, 1 - tint * .2);
    // network: my aim, the bots' aims, the wave clock
    sendA -= dt;
    if (sendA <= 0) {
      sendA = .15;
      if (me) send({ t: 'a', a: [Math.round(me.yaw * 1000) / 1000, Math.round(me.pitch * 1000) / 1000] });
      if (isHost) { const l = seats.filter(s => s.bot).map(s => [s.id, Math.round(s.ty * 1000) / 1000, Math.round(s.tp * 1000) / 1000]); if (l.length) send({ t: 'b', l }); }
    }
    sendW -= dt;
    if (sendW <= 0) { sendW = 1; if (isHost && state === 'play') send({ t: 'w', k: waveK, tm: Math.round(wt * 1000) / 1000 }); }
    if (endT > 0) { endT -= dt; if (endT <= 0 && !ended) { ended = true; onEnd(result); } }
    crossHit -= dt;
    if (crossG) crossG.setAttribute('stroke', crossHit > 0 ? '#ff4a3a' : '#fff');
    cam(dt);
  }

  function drawTargets(dt) {
    if (state === 'count') return;
    targets.forEach((tg, i) => {
      if (tg.clay) {
        const m = clays[i], d = tg.dead;
        m.visible = !d && posAt(tg, wt, tp);
        if (m.visible) { m.position.set(tp.x, tp.y, tp.z); m.rotation.set(.35, wt * 9, .2); }
        if (!tg.quack && wt > tg.t0) { tg.quack = true; chip.noise(.12, { vol: .2, f: 900 }); chip.tone(300, 900, .15, { type: .25, vol: .1 }); }
        return;
      }
      const s = ducks[i], d = tg.dead;
      if (d) {
        const since = wt - d.at;
        s.g.visible = true;
        if (since < .35) { s.g.position.set(d.x, d.y, d.z); s.g.rotation.set(0, PI, 0); s.wl.rotation.z = -1.1; s.wr.rotation.z = 1.1; }
        else {
          const f = since - .35, y = d.y - 1.3 * f * f;
          s.g.position.set(d.x, Math.max(-.2, y), d.z); s.g.rotation.set(PI * .9, f * 12, 0); s.wl.rotation.z = -1.4; s.wr.rotation.z = 1.4;
          if (y < .02) { s.g.visible = false; if (!d.landed) { d.landed = true; chip.noise(.14, { vol: .25, f: 500 }); } }
        }
        return;
      }
      const on = posAt(tg, wt, tp);
      s.g.visible = on;
      if (!on) return;
      s.g.position.set(tp.x, tp.y, tp.z);
      const hs = Math.hypot(tp.vx, tp.vz);
      const yaw = hs > .05 ? Math.atan2(tp.vx, tp.vz) : s.g.rotation.y;
      s.g.rotation.set(-Math.atan2(tp.vy, Math.max(.2, hs)) * .6, yaw, 0, 'YXZ');
      const fl = Math.sin(wt * (tg.gold ? 26 : 20) + i) * .9;
      s.wl.rotation.z = fl; s.wr.rotation.z = -fl;
      // fade into the painted sky as it gets away
      s.g.scale.setScalar(1.3 * clamp((1 - ell(tp.x, tp.y, tp.z)) / .15, 0, 1));
      if (!tg.quack && tp.y > .3) { tg.quack = true; chip.tone(720, 480, .08, { type: .25, vol: .18 }); if (chip.ctx) chip.tone(700, 460, .08, { type: .25, vol: .18, at: chip.ctx.currentTime + .12 }); }
      if (!tg.flown && wt > tg.flee) { tg.flown = true; chip.tone(500, 1500, .5, { type: .125, vol: .14 }); }
    });
    for (let i = targets.length; i < 4; i++) ducks[i].g.visible = false;
    for (let i = targets.length; i < 2; i++) clays[i].visible = false;
    if (!targets.length) for (const c of clays) c.visible = false;
  }
  function drawMole() {
    if (state === 'count') return;
    const t = moleK === waveK ? wt - doneAt() : -1;
    if (t < 0 || t > 2.4) { mole.visible = false; return; }
    const up = t < .3 ? t / .3 : t > 2 ? Math.max(0, 1 - (t - 2) / .3) : 1;
    mole.visible = true;
    mole.position.set(moleX, -.6 + up * .82, .45);
    mole.rotation.set(0, 0, 0);
    const happy = moleHappy > 0;
    mouth.visible = !happy;
    catchM.forEach((m, n) => { m.visible = happy && n < moleHappy; m.geometry = mode === 'plateaux' ? miniClay : miniDuck; });
    if (happy) { paws[0].rotation.set(0, 0, .6); paws[1].rotation.set(0, 0, -.6); mole.position.y += Math.abs(Math.sin(t * 8)) * .02; }
    else { paws[0].rotation.set(-1.2, 0, .9); paws[1].rotation.set(-1.2, 0, -.9); mole.rotation.z = Math.sin(t * 30) * .06; mole.position.y += Math.abs(Math.sin(t * 15)) * .015; }
  }

  // ---------- the camera: your eye in the hide ----------
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), from = new THREE.Vector3(), fromLook = new THREE.Vector3();
  function cam(dt) {
    if (!me) return;
    recoil = Math.max(0, recoil - dt * 6);
    const p = me.pitch + recoil * .03;
    camPos.set(me.x, EYE_Y + Math.sin(clock * 1.3) * .002, EYE_Z).add(O);
    aimDir(me.yaw, p, dir); look.copy(camPos).add(dir);
    if (state === 'count') {
      // a glide from above the meadow down into the hide
      const k = clamp(1 - Math.max(0, count - .5) / 3, 0, 1), e = k * k * (3 - 2 * k);
      from.set(0, 1.5, 3.9).add(O); fromLook.set(0, .7, -1).add(O);
      camPos.lerpVectors(from, camPos, e); look.lerpVectors(fromLook, look, e);
    }
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(look);
    camera.fov = 52; camera.updateProjectionMatrix();
    // the gun in hand, kicking back on each shot
    fp.visible = state !== 'count';
    fp.quaternion.copy(camera.quaternion);
    fp.position.set(.06, -.058 + recoil * .005, -.1 + recoil * .02).applyQuaternion(camera.quaternion).add(camera.position);
    fp.rotateY(.1); fp.rotateX(.06 + recoil * .25);
    if (fpFlash.visible) { fpFlash.userData.t -= dt; if (fpFlash.userData.t <= 0) fpFlash.visible = false; }
  }

  // ---------- the end ----------
  const catches = (n) => `${n} ${mode === 'plateaux' ? 'plateau' + (n > 1 ? 'x' : '') : 'canard' + (n > 1 ? 's' : '')}`;
  const order = () => [...seats].sort((a, b) => b.score - a.score || b.n - a.n);
  function finish() {
    if (state === 'end' || !me) return;
    state = 'end';
    const place = 1 + seats.filter(s => s !== me && s.score > me.score).length;
    result = { place, of: seats.length, value: me.score, time: clock - goAt, text: `${ord(place)} place · ${catches(me.n)} · ${me.score} pts` };
    if (place === 1) audio.win(); else audio.full();
    ui.toast(place === 1 ? 'meilleur chasseur !' : `${ord(place)} place`, false, 2200);
    endT = 3;
  }

  const board = () => `<div class="board">${order().map((s, i) => `<span style="color:${hexOf(s.color)}">${i + 1}. ${s.name} ${s.score}</span>`).join('')}</div>`;
  return {
    modes: MODES,
    keys: [['souris', 'viser'], ['clic', 'tirer'], ['z q s d', 'viser au clavier'], ['espace', 'tirer'], ['canard doré', '300 points']],
    start, update, stop, onFx, peerLeft,
    look(dx, dy) { if (!me || state === 'off' || state === 'end') return; me.yaw = clamp(me.yaw + dx * .0022, -YAW, YAW); me.pitch = clamp(me.pitch - dy * .0022, PMIN, PMAX); },
    press(b, down) { if (b === 0 && down) fire(); },
    respawn() {},
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { count: 0 };
      if (state === 'end') return { html: `<b>fin de la chasse</b><span class="big">${me.score}</span><span>${catches(me.n)}</span>${board()}` };
      return { html: `<b>${mode === 'plateaux' ? 'ball-trap' : 'chasse aux canards'} · manche ${(waveK >> 1) + 1} / ${ROUNDS}</b><span class="big">${me.score}</span><span>cartouches <em>${'●'.repeat(me.shots)}${'○'.repeat(SHOTS - me.shots)}</em> · ${catches(me.n)}</span>${board()}` };
    },
    preview() { return { x: O.x, y: O.y + .45, z: O.z + 2.2, yaw: PI, rad: 1.7, h: .55 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get seats() { return seats; }, get targets() { return targets; }, get wave() { return waveK; }, get wt() { return wt; }, get state() { return state; },
    _aim(i) { if (!me || !targets[i] || !posAt(targets[i], wt, tp)) return false; me.yaw = Math.atan2(tp.x - me.x, EYE_Z - tp.z); me.pitch = Math.atan2(tp.y - EYE_Y, Math.hypot(tp.x - me.x, tp.z - EYE_Z)); return true; },
    _go() { if (state === 'count') count = 0; },
  };
}
