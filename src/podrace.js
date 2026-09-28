// podrace.js, la course de modules: podracers on mars, in the spirit of the Boonta Eve.
// Two huge engines on cables, a tiny cockpit dragged behind, a red canyon a little over
// two kilometres round, 3 laps. Very fast: the boost pushes further but heats the engines,
// and at 100 % they flame out for a few seconds. The walls, the rock needles and the others
// cost hull; a wrecked pod is put back on the track a little later. The canyon is built away
// from the planet (its own ground, under the martian sky). The host runs the bots.
import * as THREE from 'three';
import * as V from './vehicles.js';

export const PODRACE_AT = new THREE.Vector3(0, 0, -2600);
const LAPS = 3, N = 1600, GRID = 6, HOVER = 1.1;
const TOP = 96, BOOST = 128, ACC = 34, POD_R = 2.2;
const MODES = [
  { id: 'course', name: 'course', sub: '3 tours du canyon contre cinq pilotes · boost, surchauffe, casse', help: '3 tours · z : gaz · q d : piloter · shift : boost (ça chauffe) · s : freiner · r : revenir sur la piste', unit: 'time', lower: true },
  { id: 'chrono', name: 'contre-la-montre', sub: 'seul dans le canyon, 3 tours · ton meilleur temps', help: '3 tours seul · le boost chauffe les moteurs · évite les aiguilles de roche', unit: 'time', lower: true },
];
const BOTS = [['sebulbo', 0xe8742a], ['ratts', 0x3a8ef0], ['gasgano', 0x45c060], ['mawhonic', 0xd05aff], ['teemto', 0xf2c230], ['ody', 0xe8384f]];
const PI = Math.PI, TAU = PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');
const ord = (n) => n === 1 ? '1er' : n + 'e';

// the canyon's line, in metres from PODRACE_AT: a long start straight, then the loop
const CTRL = [[0, 0, 0], [0, 0, 250], [40, 4, 420], [160, 10, 520], [330, 18, 500], [430, 12, 380], [420, 0, 220], [340, -8, 120], [360, -4, -20], [470, 6, -120], [460, 14, -300], [330, 20, -380], [170, 12, -330], [110, 4, -200], [0, 0, -140]];
// rock needles standing in the canyon: [where along (0..1), across (-1..1 of the half width), radius]
const NEEDLES = [[.16, .45, 3], [.2, -.4, 2.6], [.31, .1, 4.5], [.44, -.5, 3], [.47, .42, 3.2], [.56, 0, 5], [.63, .5, 2.8], [.71, -.35, 3.6], [.8, .3, 3], [.88, -.1, 4]];
const ARCHES = [.26, .52, .74];
// 0 along the start straight (wide, low pit walls, the stands), 1 out in the canyon
const pitK = (i) => { const d = Math.min(i / N, 1 - i / N); return THREE.MathUtils.smoothstep(d, .06, .12); };

function podModel(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = V.mat(color, { roughness: .35, metalness: .45 }), steel = V.mat(0xb8bcc4, { roughness: .35, metalness: .8 }), dark = V.TRIM();
  const engines = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 1.6, 0, 5.2); body.add(e);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(.55, .45, 5, 14), paint); hull.rotation.x = PI / 2; e.add(hull);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(.62, .55, .6, 14, 1, true), steel); intake.rotation.x = PI / 2; intake.position.z = 2.7; e.add(intake);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 12), dark); cone.rotation.x = PI / 2; cone.position.z = 2.9; e.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.57, .57, .3, 14), steel); band.rotation.x = PI / 2; band.position.z = .6; e.add(band);
    for (const f of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(.05, .9, 1.2), paint); fin.position.set(0, f * .7, -1.6); e.add(fin); }
    const flap = new THREE.Mesh(new THREE.BoxGeometry(1.1, .05, .6), steel); flap.position.set(s * .5, .1, -1.9); e.add(flap);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.42, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ab8ff).multiplyScalar(2.2), transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.rotation.x = -PI / 2; flame.position.z = -3.6; e.add(flame);
    engines.push({ e, flame });
  }
  // the energy binder crackling between the engines
  const binder = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a4a).multiplyScalar(2.4), transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  binder.position.set(0, 0, 6.4); body.add(binder);
  // the cockpit, a tub dragged on two cables
  const cock = new THREE.Group(); cock.position.set(0, .1, -3.2); body.add(cock);
  const tub = new THREE.Mesh(V.roundBox(1.3, .7, 2.2, .3), paint); cock.add(tub);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.5, 1, 12), paint); nose.rotation.x = PI / 2; nose.position.z = 1.5; nose.scale.y = .6; cock.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.8, .1, .8), dark); seat.position.set(0, .36, -.2); cock.add(seat);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 10), V.mat(0x8a6a4a, { roughness: .8 })); pilot.position.set(0, .62, -.1); cock.add(pilot);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(.4, .1, .1), V.glass()); goggles.position.set(0, .66, .15); cock.add(goggles);
  const cableM = new THREE.LineBasicMaterial({ color: 0x1a1a1e });
  const cables = [-1, 1].map(s => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const l = new THREE.Line(geo, cableM); l.frustumCulled = false; body.add(l); return { l, s };
  });
  g.traverse(o => { if (o.isMesh && o.material.type === 'MeshStandardMaterial') o.castShadow = true; });
  return { g, body, engines, binder, cock, cables };
}

function tagTex(text, color) {
  return V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = hexOf(color); g.beginPath(); g.arc(30, h / 2, 10, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}

export function createPodrace({ scene, camera, audio, ui }) {
  const O = PODRACE_AT;
  const root = new THREE.Group(); root.visible = false; scene.add(root);

  // ---------- the line: evenly spaced samples, their tangent, their side, the canyon's width ----------
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, y, z]) => new THREE.Vector3(O.x + x, O.y + y, O.z + z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(N).slice(0, N);
  const tang = [], side = [], hw = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    const t = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
    tang.push(t); side.push(new THREE.Vector2(-t.y, t.x));
    const u = i / N, k = pitK(i);
    hw.push(21 * (1 - k) + Math.max(10, 16 + 5 * Math.sin(u * TAU * 3 + 1) + 3 * Math.sin(u * TAU * 7)) * k);
  }
  let LEN = 0; for (let i = 0; i < N; i++) LEN += pts[i].distanceTo(pts[(i + 1) % N]);
  const yawOf = (i) => Math.atan2(tang[i].x, tang[i].y);
  function nearest(x, z, from, win = 30) {
    let b = from, bd = Infinity;
    for (let k = -win; k <= win; k++) { const i = ((from + k) % N + N) % N, d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } }
    return b;
  }
  const nearestAll = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < N; i += 4) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return nearest(x, z, b, 6); };
  const latOf = (i, x, z) => (x - pts[i].x) * side[i].x + (z - pts[i].z) * side[i].y;
  // the floor: a shallow trough, higher towards the walls
  const floorY = (i, lat) => pts[i].y + Math.pow(Math.min(1, Math.abs(lat) / hw[i]), 3) * 1.6;

  // ---------- the canyon: floor, walls in red strata, a lip of plateau on top ----------
  const noise = (a, b) => Math.sin(a * 1.7 + b * 3.1) * .5 + Math.sin(a * .37 - b * 1.3) * .35 + Math.sin(a * 5.3 + b * .7) * .15;
  const wallH = (i, s) => 3 + (21 + 8 * Math.sin(i / N * TAU * 5 + s * 2) + 4 * Math.sin(i / N * TAU * 13 + s)) * pitK(i);
  const STRATA = [0x9a4a2e, 0xb8623a, 0x8a3a26, 0xc47a4a, 0x7a3424, 0xa85a36, 0xd09060];
  const col = new THREE.Color(), dust = new THREE.Color(0xc07a4e), dust2 = new THREE.Color(0xa8603c), lineC = new THREE.Color(0x8a4a32);
  {
    const STEP = 2, M = N / STEP, L = 14;
    const pos = [], cols = [], idx = [];
    for (let m = 0; m <= M; m++) {
      const i = (m * STEP) % N;
      for (let l = 0; l <= L; l++) {
        const lat = (l / L * 2 - 1) * (hw[i] + 1.5);
        pos.push(pts[i].x + side[i].x * lat, floorY(i, lat) - .05, pts[i].z + side[i].y * lat);
        const n = noise(m * .4, l * .9);
        col.copy(dust).lerp(dust2, .5 + n * .5);
        if (Math.abs(Math.abs(lat) - 4) < .6) col.lerp(lineC, .35);   // the racing grooves
        if (i < 8 || i > N - 8) col.setHex((l % 2) ? 0xf2f2f2 : 0x1a1a1a);   // the chequered line
        cols.push(col.r, col.g, col.b);
      }
    }
    for (let m = 0; m < M; m++) for (let l = 0; l < L; l++) { const a = m * (L + 1) + l, b = a + L + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
    floor.receiveShadow = true; root.add(floor);
    // the walls, one each side: rows from the floor up, pushed out by a rough noise, then the plateau
    const R = 9;
    for (const s of [-1, 1]) {
      const wp = [], wc = [], wi = [];
      for (let m = 0; m <= M; m++) {
        const i = (m * STEP) % N, H = wallH(i, s);
        for (let r = 0; r <= R + 1; r++) {
          const f = Math.min(1, r / R), y = pts[i].y + f * H;
          let out = hw[i] + 1.2 + f * 5 + noise(m * .25 + s * 9, r * 1.3) * 2.2 * Math.sin(f * PI);
          if (r === R + 1) out = hw[i] + 45;    // the plateau
          const yy = r === R + 1 ? y + 6 : y;
          wp.push(pts[i].x + side[i].x * out * s, yy, pts[i].z + side[i].y * out * s);
          col.setHex(STRATA[(Math.floor(y * .35 + noise(m * .05, s) * 1.5) % STRATA.length + STRATA.length) % STRATA.length]);
          if (r === R + 1 || r === R) col.lerp(dust, .5);
          col.multiplyScalar(.85 + noise(m * .7, r) * .12);
          wc.push(col.r, col.g, col.b);
        }
      }
      const W = R + 2;
      for (let m = 0; m < M; m++) for (let r = 0; r < W - 1; r++) {
        const a = m * W + r, b = a + W;
        if (s > 0) wi.push(a, b, a + 1, a + 1, b, b + 1); else wi.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const geo2 = new THREE.BufferGeometry();
      geo2.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); geo2.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3)); geo2.setIndex(wi); geo2.computeVertexNormals();
      const wall = new THREE.Mesh(geo2, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
      wall.receiveShadow = true; root.add(wall);
    }
  }
  // rock needles (they hurt) and arches overhead (they don't)
  const rockM = new THREE.MeshStandardMaterial({ color: 0x9a4a2e, roughness: 1, flatShading: true });
  const needles = NEEDLES.map(([u, a, r]) => {
    const i = Math.floor(u * N), lat = a * hw[i];
    const x = pts[i].x + side[i].x * lat, z = pts[i].z + side[i].y * lat;
    const h = 30 + r * 4;
    const geo = new THREE.CylinderGeometry(r * .55, r, h, 9, 5);
    const p = geo.attributes.position;
    for (let n = 0; n < p.count; n++) { const y = p.getY(n), k = 1 + Math.sin(y * .4 + n) * .12; p.setX(n, p.getX(n) * k); p.setZ(n, p.getZ(n) * k); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rockM); m.position.set(x, pts[i].y + h / 2 - 1, z); m.castShadow = true; root.add(m);
    return { x, z, r: r + .3, i };
  });
  for (const u of ARCHES) {
    const i = Math.floor(u * N), w = hw[i] + 5;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(w, 3.2, 7, 18, PI), rockM);
    arch.position.set(pts[i].x, pts[i].y + 4, pts[i].z); arch.rotation.y = yawOf(i); root.add(arch);
  }
  // the start: an arch of banners, a grandstand of little heads, the pit lamps
  {
    const i = 0, yaw = yawOf(i);
    const gate = new THREE.Group(); gate.position.copy(pts[i]); gate.rotation.y = yaw; root.add(gate);
    const steel = V.mat(0xd8d4cc, { metalness: .6, roughness: .4 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 16, 1.2), steel); p.position.set(s * 23, 8, 0); gate.add(p); }
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(46, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: V.paintTex(1024, 96, (g, w, h) => {
      g.fillStyle = '#1a130c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd75e'; g.font = '400 64px "Titan One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('COURSE DE MODULES · MARS', w / 2, h / 2 + 3);
    }) }));
    ban.position.set(0, 15, 0); gate.add(ban);
    for (let n = 0; n < 5; n++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x331010 })); l.position.set(-8 + n * 4, 12.4, .6); gate.add(l); }
    gate.userData.lights = gate.children.slice(-5);
    root.userData.gate = gate;
    // the stands, both sides of the straight
    const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(.35, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), 900);
    const dm = new THREE.Object3D(), cc = new THREE.Color();
    let n = 0;
    for (const s of [-1, 1]) for (let row = 0; row < 5; row++) for (let k = 0; k < 90 && n < 900; k++) {
      const j = (N - 40 + k) % N, lat = s * (hw[j] + 4 + row * 1.6);
      dm.position.set(pts[j].x + side[j].x * lat, pts[j].y + 2 + row * 1.3, pts[j].z + side[j].y * lat); dm.updateMatrix();
      crowd.setMatrixAt(n, dm.matrix); crowd.setColorAt(n, cc.setHSL((n * .137) % 1, .6, .55)); n++;
    }
    root.add(crowd);
    for (const s of [-1, 1]) for (let row = 0; row < 5; row++) {
      const j = 5, lat = s * (hw[j] + 4 + row * 1.6);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 70), V.mat(0x6a5a4a, { roughness: .9 }));
      b.position.set(pts[j].x + side[j].x * lat, pts[j].y + 1.2 + row * 1.3, pts[j].z + side[j].y * lat); b.rotation.y = yawOf(j); root.add(b);
    }
  }

  // ---------- particles: dust, sparks, smoke ----------
  const PMAX = 600;
  const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, depthWrite: false }), PMAX);
  pMesh.frustumCulled = false; root.add(pMesh);
  for (let n = 0; n < PMAX; n++) pMesh.setColorAt(n, new THREE.Color(0xffffff));
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  const pc = new THREE.Color();
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, s, life, color) {
    const p = parts[pNext]; pMesh.setColorAt(pNext, pc.setHex(color)); pNext = (pNext + 1) % PMAX;
    Object.assign(p, { x, y, z, vx, vy, vz, s, life, max: life });
  }
  const dm = new THREE.Object3D();
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) { p.life -= dt; p.vy -= 3 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt; p.vz *= 1 - dt; }
      const k = p.life > 0 ? p.life / p.max : 0;
      dm.position.set(p.x, p.y, p.z); dm.scale.setScalar(p.s * (k > 0 ? .3 + (1 - k) * 1.2 : 0)); dm.updateMatrix();
      pMesh.setMatrixAt(n, dm.matrix);
    }
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }
  function burst(x, y, z, n, color, v = 12, s = .4) { for (let k = 0; k < n; k++) { const a = Math.random() * TAU, b = Math.random() * v; emit(x, y, z, Math.cos(a) * b, Math.random() * v * .8, Math.sin(a) * b, s * (.5 + Math.random()), .5 + Math.random() * .6, color); } }

  // ---------- pods ----------
  let pods = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'course', count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, result = null, respawnCd = 0, rnd = Math.random;
  let camYaw = 0, camFov = 72, shake = 0, auto = false;
  const savedAvatars = [];
  const byKey = (k) => pods.find(c => c.key === k);
  const mine = (c) => c && (c.key === meId || (isHost && c.bot));
  function makePod(key, name, color, bot) {
    const m = podModel(color);
    root.add(m.g);
    let tag = null;
    if (key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false })); tag.scale.set(4, 1, 1); root.add(tag); }
    return { key, name, color, bot, m, tag, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, speed: 0, steer: 0, roll: 0, idx: 0, k: 0, laps: 0, done: false, doneAt: 0, time: 0,
      heat: 0, hot: 0, dmg: 0, wreck: 0, boost: false, wrongT: 0, lane: 0, skill: 1, net: null, seen: 0, bonkT: 0, dustT: 0, sw: [0, 0], best: 0 };
  }
  function place(c, i, lat, back = 0) {
    const t = tang[i], s = side[i];
    c.x = pts[i].x + s.x * lat - t.x * back; c.z = pts[i].z + s.y * lat - t.y * back;
    c.idx = nearestAll(c.x, c.z); c.yaw = yawOf(i); c.vx = c.vz = 0; c.speed = 0;
    c.y = floorY(c.idx, latOf(c.idx, c.x, c.z)) + HOVER;
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'course';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    let rs = (seed >>> 0) % 2147483646 || 1; rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    state = 'count'; count = 4.5; clock = 0; goAt = 0; endT = -1; sendT = 0; result = null; respawnCd = 0; shake = 0;
    camFov = camera.fov;
    const list = [];
    if (mode === 'course') {
      const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
      for (let n = 0; n < Math.max(0, GRID - humans.length); n++) list.push({ key: 'b' + n, name: pool[n % pool.length][0], color: pool[n % pool.length][1], bot: true });
    }
    for (const u of humans) list.push({ key: u.id, name: u.name, color: u.color, bot: false });
    pods = list.map((u, n) => {
      const c = makePod(u.key, u.name, u.color, u.bot);
      place(c, 0, (n % 2 ? 1 : -1) * 7, 14 + Math.floor(n / 2) * 16);
      c.k = c.idx > N / 2 ? c.idx - N : c.idx;
      c.lane = (rnd() - .5) * 10; c.skill = .9 + rnd() * .08;
      return c;
    });
    me = byKey(meId);
    root.visible = true;
    for (const l of root.userData.gate.userData.lights) l.material.color.setHex(0x331010);
    for (const p of window.__dig?.net?.peers?.values?.() || []) { savedAvatars.push(p.avatar.g); p.avatar.g.scale.setScalar(1e-4); }
    if (me) camYaw = me.yaw;
    motor(true);
    audio.tick();
    update(0, new Set());
  }
  function stopDyn() {
    for (const c of pods) { root.remove(c.m.g); if (c.tag) root.remove(c.tag); }
    pods = []; me = null;
    for (const p of parts) p.life = 0;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    root.visible = false;
    for (const g of savedAvatars) g.scale.setScalar(1); savedAvatars.length = 0;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    motor(false);
  }

  // ---------- the engines: two raw saws, a little apart, the roar of a podracer ----------
  let actx = null, oscs = [], mGain = null, mFilt = null;
  function motor(on) {
    try {
      if (on && !actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        mFilt = actx.createBiquadFilter(); mFilt.type = 'lowpass'; mFilt.frequency.value = 1400;
        mGain = actx.createGain(); mGain.gain.value = 0;
        oscs = [0, 1, 2].map(k => { const o = actx.createOscillator(); o.type = k === 2 ? 'square' : 'sawtooth'; const g = actx.createGain(); g.gain.value = k === 2 ? .25 : .5; o.connect(g); g.connect(mFilt); o.start(); return o; });
        mFilt.connect(mGain); mGain.connect(actx.destination);
      }
      if (!actx) return;
      if (on && actx.state === 'suspended') actx.resume();
      if (!on) mGain.gain.setTargetAtTime(0, actx.currentTime, .05);
    } catch { actx = null; }
  }
  function motorTick(c, thr) {
    if (!actx || !mGain) return;
    const t = actx.currentTime, f = 55 + Math.abs(c.speed) * 1.6 + (c.boost ? 40 : 0);
    oscs[0].frequency.setTargetAtTime(f, t, .05); oscs[1].frequency.setTargetAtTime(f * 1.013, t, .05); oscs[2].frequency.setTargetAtTime(f * .5, t, .05);
    mFilt.frequency.setTargetAtTime(700 + Math.abs(c.speed) * 14 + (c.boost ? 900 : 0), t, .08);
    mGain.gain.setTargetAtTime(c.wreck > 0 ? .002 : .012 + Math.abs(thr) * .018 + (c.boost ? .01 : 0), t, .06);
  }

  // ---------- the ride ----------
  function hurt(c, n, x, z) {
    if (c.wreck > 0) return;
    c.dmg = Math.min(100, c.dmg + n);
    burst(x, c.y, z, Math.min(16, 3 + Math.round(n * .5)), 0xffc060, 14, .12);
    if (c === me) { shake = Math.max(shake, Math.min(1, n * .05)); if (c.bonkT <= 0) { audio.bonk(); c.bonkT = .25; } }
    if (c.dmg >= 100) wreck(c);
  }
  function wreck(c) {
    c.wreck = 2.6; c.speed *= .2; c.boost = false;
    burst(c.x, c.y, c.z, 60, 0xff6a1a, 22, .9); burst(c.x, c.y, c.z, 30, 0x3a3a3a, 10, 1.4);
    if (c === me) { audio.boom(1.2); ui.toast('module en miettes ! retour sur la piste…', true, 2000); shake = 1.2; }
  }
  const turnRate = (sp) => 2 - clamp(sp / 200, 0, .5);
  function stepPod(c, inp, dt) {
    const i = c.idx;
    if (c.wreck > 0) {
      c.wreck -= dt;
      c.speed *= 1 - dt * 2; c.vx *= 1 - dt * 2; c.vz *= 1 - dt * 2;
      c.x += c.vx * dt; c.z += c.vz * dt;
      if (c.wreck <= 0) { place(c, (c.idx + 6) % N, 0); c.k = c.k - ((c.k % N) + N) % N + c.idx; c.dmg = 35; c.heat = 0; c.hot = 0; if (c === me) { camYaw = c.yaw; audio.charge(); } }
      return;
    }
    // heat: the boost warms the engines, anything else cools them; at 100 % they cut out
    c.boost = !!inp.boost && c.hot <= 0 && inp.thr > 0;
    if (c.boost) c.heat = Math.min(1, c.heat + dt * .24);
    else c.heat = Math.max(0, c.heat - dt * (inp.thr > 0 ? .1 : .2));
    if (c.heat >= 1 && c.hot <= 0) { c.hot = 3.2; c.boost = false; burst(c.x, c.y + 1, c.z, 20, 0x3a3a3a, 6, 1); if (c === me) { audio.hiss(); ui.toast('surchauffe ! les moteurs calent…', true, 1800); } }
    if (c.hot > 0) { c.hot -= dt; c.heat = Math.max(.55, c.heat - dt * .15); }
    const top = (c.boost ? BOOST : TOP) * (c.bot ? c.skill : 1) * (1 - c.dmg * .0025) * (c.hot > 0 ? .4 : 1);
    if (inp.thr > 0) c.speed += (ACC * (c.boost ? 1.5 : 1)) * (1 - c.speed / top) * inp.thr * dt;
    else if (inp.thr < 0) c.speed -= 60 * dt;
    c.speed -= c.speed * (inp.thr > 0 ? .02 : .35) * dt;
    if (c.speed > top) c.speed += (top - c.speed) * dt * 1.5;
    c.speed = clamp(c.speed, -8, BOOST * 1.1);
    const sp = Math.abs(c.speed);
    // steering: sharp at low speed, gentler flat out
    c.yaw += inp.steer * turnRate(sp) * clamp(sp / 12, .25, 1) * dt * Math.sign(c.speed || 1);
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * 5);
    // the pod slides a little: the velocity follows the nose
    const tx = Math.sin(c.yaw) * c.speed, tz = Math.cos(c.yaw) * c.speed, a = Math.min(1, dt * 3.6);
    c.vx += (tx - c.vx) * a; c.vz += (tz - c.vz) * a;
    c.x += c.vx * dt; c.z += c.vz * dt;
    // the canyon walls
    const j = nearest(c.x, c.z, i, 12), lat = latOf(j, c.x, c.z), lim = hw[j] - POD_R;
    if (Math.abs(lat) > lim) {
      const s = Math.sign(lat), nx = side[j].x * s, nz = side[j].y * s;
      c.x -= nx * (Math.abs(lat) - lim); c.z -= nz * (Math.abs(lat) - lim);
      const vn = c.vx * nx + c.vz * nz;
      if (vn > 0) {
        c.vx -= nx * vn * 1.6; c.vz -= nz * vn * 1.6;
        c.speed *= Math.max(.55, 1 - vn / 90);
        c.yaw += wrap(Math.atan2(tang[j].x, tang[j].y) - c.yaw) * .35;
        if (mine(c)) hurt(c, vn * .3, c.x + nx * POD_R, c.z + nz * POD_R);
      }
    }
    // the rock needles
    for (const nd of needles) {
      const dx = c.x - nd.x, dz = c.z - nd.z, d = Math.hypot(dx, dz), rr = nd.r + POD_R * .8;
      if (d < rr && d > 1e-3) {
        const nx = dx / d, nz = dz / d;
        c.x = nd.x + nx * rr; c.z = nd.z + nz * rr;
        const vn = -(c.vx * nx + c.vz * nz);
        if (vn > 0) { c.vx += nx * vn * 1.5; c.vz += nz * vn * 1.5; c.speed *= .45; if (mine(c)) hurt(c, 8 + vn * .6, c.x - nx * POD_R, c.z - nz * POD_R); }
      }
    }
    c.bonkT -= dt;
    // hover over the floor, nose following the slope
    const fy = floorY(j, latOf(j, c.x, c.z)) + HOVER + Math.sin(clock * 9 + c.x) * .08;
    c.y += (fy - c.y) * Math.min(1, dt * 10);
  }
  function collide() {
    for (let a = 0; a < pods.length; a++) for (let b = a + 1; b < pods.length; b++) {
      const p = pods[a], q = pods[b];
      if (p.wreck > 0 || q.wreck > 0) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > POD_R * 2 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, push = (POD_R * 2 - d) / 2;
      const rel = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;
      if (mine(p)) { p.x -= nx * push; p.z -= nz * push; p.vx -= nx * Math.max(0, rel) * .5; p.vz -= nz * Math.max(0, rel) * .5; if (rel > 4) hurt(p, rel * .3, p.x + nx * POD_R, p.z + nz * POD_R); }
      if (mine(q)) { q.x += nx * push; q.z += nz * push; q.vx += nx * Math.max(0, rel) * .5; q.vz += nz * Math.max(0, rel) * .5; if (rel > 4) hurt(q, rel * .3, q.x - nx * POD_R, q.z - nz * POD_R); }
    }
  }
  function track(c, dt) {
    const i = nearest(c.x, c.z, c.idx);
    let d = i - c.idx; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    c.idx = i; c.k += d;
    c.wrongT = d < 0 && Math.abs(c.speed) > 5 ? c.wrongT + dt : Math.max(0, c.wrongT - dt * 2);
    if (c.done) return;
    const lap = Math.floor(c.k / N);
    if (lap > c.laps && c.k >= 0) {
      c.laps = lap;
      if (lap >= LAPS) { c.done = true; c.doneAt = clock; if (c === me) finish(); }
      else if (c === me) { ui.toast(lap === LAPS - 1 ? 'dernier tour !' : `tour ${lap + 1} / ${LAPS}`, false, 1000); audio.tick(); }
    }
  }
  function botDrive(c) {
    if (c.done) return { thr: .4, steer: 0, boost: false };
    const look = Math.round(12 + Math.abs(c.speed) * .45);
    const ahead = (c.idx + look) % N;
    // a needle ahead: take the other side of it
    let lane = clamp(c.lane, -hw[ahead] * .5, hw[ahead] * .5);
    let best = null, bd = look + 30;
    for (const nd of needles) { let di = nd.i - c.idx; if (di < 0) di += N; if (di > 0 && di < bd) { best = nd; bd = di; } }
    if (best) { const nl = latOf(best.i, best.x, best.z); lane = clamp(nl > 0 ? nl - best.r - 6 : nl + best.r + 6, -hw[best.i] + 4, hw[best.i] - 4); }
    const tx = pts[ahead].x + side[ahead].x * lane, tz = pts[ahead].z + side[ahead].y * lane;
    const dyaw = wrap(Math.atan2(tx - c.x, tz - c.z) - c.yaw);
    // the bends ahead: the tightest over the next few seconds sets the speed to take them at
    let tight = Infinity;
    for (let k = 10; k < 10 + Math.abs(c.speed) * 1.6; k += 12) {
      const a = (c.idx + k) % N, b = (a + 24) % N;
      tight = Math.min(tight, 24 * 1.52 / Math.max(1e-3, Math.abs(wrap(yawOf(b) - yawOf(a)))));
    }
    const want = tight * turnRate(c.speed) * .9 * c.skill;
    const thr = c.speed > want + 4 ? -1 : c.speed > want ? 0 : Math.abs(dyaw) > .6 && c.speed > 50 ? .3 : 1;
    return { thr, steer: clamp(dyaw * 2.4, -1, 1), boost: thr > 0 && want > TOP * 1.1 && c.heat < .72 };
  }
  function respawnPod(c) {
    place(c, (c.idx + N) % N, 0);
    c.k = c.k - ((c.k % N) + N) % N + c.idx;
    if (c === me) { camYaw = c.yaw; audio.charge(); }
  }

  // ---------- network ----------
  const r2 = (v) => Math.round(v * 100) / 100;
  const pack = (c) => [r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), r2(c.vx), r2(c.vz), c.k, c.done ? 1 : 0, r2(c.steer), r2(c.time), Math.round(c.heat * 100), Math.round(c.dmg), c.boost ? 1 : 0, c.wreck > 0 ? 1 : 0];
  function unpack(c, a) {
    if (!a) return;
    const [x, y, z, yaw, vx, vz, k, done, steer, time, heat, dmg, boost, wrecked] = a;
    c.net = { x, y, z, yaw, vx, vz, t: 0 }; c.k = k; c.steer = steer; c.heat = heat / 100; c.dmg = dmg; c.boost = !!boost; c.seen = clock;
    if (wrecked && c.wreck <= 0) { c.wreck = 2.6; burst(x, y, z, 60, 0xff6a1a, 22, .9); } else if (!wrecked) c.wreck = 0;
    if (time != null && !c.bot) c.time = time;
    if (done && !c.done) { c.done = true; c.doneAt = clock; }
  }
  function follow(c, dt) {
    const n = c.net; if (!n) return;
    n.t += dt;
    const k = Math.min(n.t, .25), tx = n.x + n.vx * k, tz = n.z + n.vz * k;
    const a = Math.min(1, dt * 12);
    if (Math.hypot(tx - c.x, tz - c.z) > 30) { c.x = tx; c.z = tz; }
    c.x += (tx - c.x) * a; c.z += (tz - c.z) * a; c.y += (n.y - c.y) * a; c.yaw += wrap(n.yaw - c.yaw) * a;
    c.vx = n.vx; c.vz = n.vz; c.speed = Math.hypot(c.vx, c.vz);
    c.idx = nearest(c.x, c.z, c.idx);
  }
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    if (fx.t === 's') { const c = byKey(pid); if (c && !mine(c)) unpack(c, fx.c); }
    else if (fx.t === 'b' && !isHost) for (const [k, a] of fx.l) { const c = byKey(k); if (c) unpack(c, a); }
  }
  function peerLeft(id) {
    const c = byKey(id);
    if (c) { root.remove(c.m.g); if (c.tag) root.remove(c.tag); pods.splice(pods.indexOf(c), 1); }
    if (id === hostId) {
      const next = pods.filter(q => !q.bot).map(q => q.key).sort((a, b) => String(a).localeCompare(String(b)))[0];
      hostId = next ?? meId; isHost = hostId === meId;
      if (isHost) for (const b of pods) if (b.bot && b.net) { b.x = b.net.x; b.z = b.net.z; b.yaw = b.net.yaw; b.speed = Math.hypot(b.net.vx, b.net.vz); }
    }
  }

  // ---------- the frame ----------
  const order = () => [...pods].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.doneAt - b.doneAt : b.k - a.k));
  const inp = { thr: 0, steer: 0, boost: false };
  const _v = new THREE.Vector3();
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      // the start lights: one more red each second, all green at the go
      const lit = clamp(5 - Math.ceil(count - .5), 0, 5);
      root.userData.gate.userData.lights.forEach((l, n) => l.material.color.setHex(n < lit ? 0xff2a1a : 0x331010));
      if (count <= 0) { state = 'race'; goAt = clock; audio.buy(); root.userData.gate.userData.lights.forEach(l => l.material.color.setHex(0x39ff6a)); }
    }
    const racing = state === 'race';
    for (const c of pods) {
      if (!mine(c)) { follow(c, dt); continue; }
      let i2;
      if (c === me) {
        inp.thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        inp.steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
        inp.boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Space');
        if (c.done) { inp.thr = Math.min(inp.thr, .4); inp.boost = false; }
        i2 = auto ? botDrive(c) : inp;
      } else i2 = botDrive(c);
      if (!racing) i2 = { thr: 0, steer: 0, boost: false };
      stepPod(c, i2, dt);
      if (racing) { track(c, dt); if (!c.done) c.time = clock - goAt; }
      c.dmg = Math.max(0, c.dmg - dt * 1.2);
      if (c === me) motorTick(c, i2.thr);
    }
    collide();
    // show every pod: engines out front swaying on their own, the cockpit trailing on its cables
    for (const c of pods) {
      const g = c.m.g;
      g.visible = c.wreck <= 0 || c.wreck > 2.3;
      g.position.set(c.x, c.y, c.z);
      c.roll += (-c.steer * .45 * clamp(Math.abs(c.speed) / 40, 0, 1) - c.roll) * Math.min(1, dt * 6);
      g.rotation.set(0, c.yaw, 0);
      c.m.body.rotation.z = c.roll;
      const sp = Math.abs(c.speed), t = clock * 1.3 + c.x * .01;
      c.m.engines.forEach((e, n) => {
        const s = n ? 1 : -1;
        e.e.position.y = Math.sin(t * 7 + n * 2) * .12 * (sp / TOP) + s * c.roll * .6;
        e.e.rotation.z = Math.sin(t * 5 + n) * .06;
        e.e.position.x = s * (1.6 + Math.sin(t * 3 + n) * .08);
        e.flame.scale.set(1, (c.hot > 0 ? .15 : .4 + sp / TOP * (c.boost ? 1.4 : .8)) * (1 + Math.random() * .2), 1);
        e.flame.material.color.setHex(c.boost ? 0xff7a2a : 0x6ab8ff).multiplyScalar(2.2);
      });
      c.m.binder.material.opacity = c.hot > 0 ? .1 : .35 + Math.random() * .4;
      c.m.binder.position.y = (c.m.engines[0].e.position.y + c.m.engines[1].e.position.y) / 2;
      c.m.cock.position.x = -c.steer * .6 * clamp(sp / 60, 0, 1);
      c.m.cock.rotation.z = -c.roll * .5;
      for (const cb of c.m.cables) {
        const e = c.m.engines[cb.s > 0 ? 1 : 0].e, p = cb.l.geometry.attributes.position;
        p.setXYZ(0, e.position.x - cb.s * .3, e.position.y, e.position.z - 2.4);
        p.setXYZ(1, c.m.cock.position.x + cb.s * .45, c.m.cock.position.y + .2, c.m.cock.position.z + 1.1);
        p.needsUpdate = true;
      }
      if (c.tag) { c.tag.position.set(c.x, c.y + 4, c.z); const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0; c.tag.visible = g.visible && d > 30 && d < 160; }
      // dust off the floor, smoke from a hot engine
      c.dustT -= dt;
      if (c.dustT <= 0 && sp > 20 && g.visible) {
        c.dustT = .03;
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        emit(c.x - fx * 3 + (Math.random() - .5) * 3, c.y - HOVER + .2, c.z - fz * 3 + (Math.random() - .5) * 3, -fx * 6 + (Math.random() - .5) * 4, 1 + Math.random() * 2, -fz * 6 + (Math.random() - .5) * 4, .15 + Math.random() * .15, .6, 0xc8845a);
        if (c.dmg > 55 || c.hot > 0) emit(c.x + fx * 5, c.y + .5, c.z + fz * 5, (Math.random() - .5) * 3, 3, (Math.random() - .5) * 3, .3, .8, 0x2a2a2a);
      }
    }
    stepParts(dt);
    if (racing && clock > 9) for (const c of [...pods]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      if (me) send({ t: 's', c: pack(me) });
      if (isHost) { const l = pods.filter(c => c.bot).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', l }); }
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { const r = result; endT = -1; onEnd(r); } }
    cam(dt);
  }

  // ---------- the camera: behind the cockpit, low, the fov opening up with the speed ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), eye = new THREE.Vector3();
  function cam(dt) {
    if (!me) return;
    if (state === 'count') camYaw = me.yaw;
    camYaw += wrap(me.yaw - camYaw) * Math.min(1, dt * 6);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), sp = Math.abs(me.speed);
    camPos.set(me.x - fx * (11 + sp * .02), me.y + 3.4, me.z - fz * (11 + sp * .02));
    // never behind the canyon's wall
    { const j = nearest(camPos.x, camPos.z, me.idx, 20), lat = latOf(j, camPos.x, camPos.z), lim = hw[j] - 1.5; if (Math.abs(lat) > lim) { const k = Math.abs(lat) - lim; camPos.x -= side[j].x * Math.sign(lat) * k; camPos.z -= side[j].y * Math.sign(lat) * k; } }
    camLook.set(me.x + fx * 22, me.y + 1, me.z + fz * 22);
    if (state === 'count') {
      // a sweep over the grid down to the cockpit
      const k = clamp(1 - Math.pow(Math.max(0, count - .8) / 3.7, 2), 0, 1);
      _v.set(me.x + fx * 40 + fz * 20, me.y + 22, me.z + fz * 40 - fx * 20);
      camPos.lerpVectors(_v, camPos, k);
      eye.copy(camPos);
    } else eye.lerp(camPos, Math.min(1, dt * 14));
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * 1.5); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
    const hum = sp > 60 ? (sp - 60) / 60 * .06 : 0;
    camera.position.y += (Math.random() - .5) * hum;
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    const fov = 66 + Math.min(26, sp * .2) + (me.boost ? 6 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  function finish() {
    const of = pods.length, humans = pods.filter(c => !c.bot);
    if (mode === 'course') {
      const p = pods.filter(c => c.done && c !== me && c.doneAt <= me.doneAt).length + 1;
      result = { place: p, of, time: me.time, value: me.time };
      ui.toast(p === 1 ? 'victoire ! le module est à toi' : `arrivée : ${ord(p)}`, false, 2200);
    } else {
      const p = humans.filter(c => c !== me && c.done && c.doneAt < me.doneAt).length + 1;
      result = { place: p, of: humans.length, time: me.time, value: me.time, text: `3 tours du canyon en ${fmt(me.time)}` };
      ui.toast(`arrivée en ${fmt(me.time)}`, false, 2200);
    }
    audio.win();
    endT = 2.8;
  }

  const bar = (f, c) => `<div class="therm" style="display:flex;width:160px;height:8px;border-radius:999px;background:rgba(0,0,0,.55);overflow:hidden;margin-top:3px"><i style="display:block;height:100%;width:${Math.round(clamp(f, 0, 1) * 100)}%;background:${c}"></i></div>`;
  return {
    modes: MODES,
    keys: [['z', 'gaz'], ['q d', 'piloter'], ['s', 'freiner'], ['shift', 'boost · ça chauffe'], ['r', 'revenir sur la piste']],
    start, update, stop, onFx, peerLeft,
    respawn() { if (state === 'race' && me && !me.done && me.wreck <= 0 && respawnCd <= clock) { respawnCd = clock + 2; respawnPod(me); } },
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { hidden: true };
      const o = order(), pl = o.indexOf(me) + 1, heat = me.heat;
      const hc = me.hot > 0 ? '#ff3a10' : heat > .75 ? '#ff8a20' : heat > .45 ? '#f2c230' : '#4aa8e8';
      const dc = me.dmg > 70 ? '#ff3a10' : me.dmg > 40 ? '#f2c230' : '#6ad86a';
      const tip = clock - goAt < 6 ? '<span>shift : boost · attention à la surchauffe</span>' : me.hot > 0 ? '<span><em>surchauffe</em> : les moteurs refroidissent</span>' : me.wreck > 0 ? '<span><em>épave</em> : retour sur la piste…</span>' : '';
      return {
        html: `<b>course de modules</b><span class="big">${ord(pl)} <small>/ ${pods.length}</small></span>`
          + `<span>tour ${clamp(Math.floor(me.k / N) + 1, 1, LAPS)} / ${LAPS} · ${fmt(me.time)} · ${Math.round(Math.abs(me.speed) * 6.2)} km/h${me.wrongT > .8 ? ' · <em>mauvais sens !</em>' : ''}</span>`
          + `<span>chaleur</span>${bar(heat, hc)}<span>coque</span>${bar(1 - me.dmg / 100, dc)}${tip}`
          + `<div class="board">${o.map((c, i) => `<span style="color:${hexOf(c.color)}">${i + 1}. ${c === me ? '<em>' + c.name + '</em>' : c.name}${c.done ? ' ✓' : ''}</span>`).join('')}</div>`,
      };
    },
    preview() {
      const c = me || pods[0], i = c ? c.idx : 0;
      return { x: c ? c.x : pts[0].x, y: c ? c.y : pts[0].y, z: c ? c.z : pts[0].z, yaw: c ? c.yaw : yawOf(0), rad: 14, h: 4 };
    },
    set onEnd(f) { onEnd = f; },
    // tests
    get me() { return me; }, get pods() { return pods; }, get len() { return LEN; }, get state() { return state; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
    _warp(lapsLeft = 0) { if (!me) return; place(me, N - 30, 0); me.k = (LAPS - 1 - lapsLeft) * N + N - 30; me.laps = LAPS - 1 - lapsLeft; me.speed = 80; },
    _hurt(n) { if (me) hurt(me, n, me.x, me.z); },
  };
}
