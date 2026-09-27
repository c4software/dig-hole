// jetski.js, vague à fond: mini jet-skis in the fountain on the church square, at toy scale,
// in the spirit of Wave Race 64. The basin is a lake with its own swell; the course winds
// round the island, the curtain of water and the frogs' jets. The buoys set the line: pass a
// red one on its right, a yellow one on its left. Each good buoy fills the power gauge (a
// faster top speed), a missed one empties it, and five misses put you out of the race.
// Floating ramps and wave crests throw you in the air. Two modes: the race against five
// riders, and a time trial alone on the water.
import * as THREE from 'three';
import * as V from './vehicles.js';

const LAPS = 3, N = 360, GRID = 6, SC = .06, MAX_MISS = 5, MAX_POW = 5;
const MODES = [
  { id: 'course', name: 'course', sub: '3 tours de la fontaine contre cinq pilotes · respecte les bouées', help: '3 tours · zqsd · shift : se pencher · bouée rouge à sa droite, jaune à sa gauche · r : revenir sur le parcours', unit: 'time', lower: true },
  { id: 'chrono', name: 'contre-la-montre', sub: 'seul sur l\'eau, 3 tours · ton meilleur temps', help: '3 tours seul · chaque bouée ratée vide la jauge de puissance', unit: 'time', lower: true },
];
const BOTS = [['ryota', 0xe8384f], ['ayumi', 0xf2c230], ['miles', 0x3a8ef0], ['dave', 0x45c060], ['lola', 0xb05ae0], ['kiki', 0xf08a2a]];
const RED = 0xe8303a, YELLOW = 0xffd21f;
const PI = Math.PI, TAU = PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

function tagTex(text, color) {
  return V.paintTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 20); g.fill();
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.beginPath(); g.arc(30, h / 2, 10, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.font = '600 30px Rubik, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 12), 50, h / 2 + 1);
  });
}

// a jet-ski and its rider, built at full size (2.8 m long, nose to +z), shrunk to toy scale
function skiModel(color, suit) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const hull = V.mat(0xf4f2ec, { roughness: .35 }), paint = V.mat(color, { roughness: .3, metalness: .15 }), dark = V.TRIM();
  const put = (geo, m, x, y, z, p = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  put(V.roundBox(1.05, .36, 2.5, .16), hull, 0, .12, -.1);
  const nose = put(V.roundBox(.9, .34, 1, .16), hull, 0, .2, 1.05); nose.rotation.x = -.35;
  put(V.roundBox(1, .26, 2.1, .12), paint, 0, .38, -.15);
  const hood = put(V.roundBox(.8, .22, .8, .1), paint, 0, .5, .75); hood.rotation.x = -.3;
  put(V.roundBox(.46, .2, 1.1, .09), dark, 0, .6, -.55);
  const col = put(new THREE.CylinderGeometry(.05, .06, .45, 8), dark, 0, .75, .35); col.rotation.x = -.5;
  const bar = put(new THREE.CylinderGeometry(.035, .035, .8, 8), dark, 0, .95, .22); bar.rotation.z = PI / 2;
  put(new THREE.BoxGeometry(.9, .06, .3), V.lamp(0xff6a1a, 1.2), 0, .02, -1.32);
  // the rider: knees on the deck, leaning into the bars
  const jacket = V.mat(suit, { roughness: .7 }), skin = V.mat(0xf0c8a0, { roughness: .8 });
  const rider = new THREE.Group(); rider.position.set(0, .7, -.5); body.add(rider);
  for (const s of [-1, 1]) { const leg = put(V.roundBox(.2, .5, .22, .08), V.mat(0x2a2e3a), s * .22, .05, .05, rider); leg.rotation.x = .9; }
  const torso = put(V.roundBox(.52, .66, .34, .14), jacket, 0, .52, .2, rider); torso.rotation.x = .5;
  for (const s of [-1, 1]) { const arm = put(V.roundBox(.14, .14, .62, .06), jacket, s * .3, .66, .48, rider); arm.rotation.x = .25; }
  put(new THREE.SphereGeometry(.2, 12, 10), skin, 0, .92, .44, rider);
  put(new THREE.SphereGeometry(.23, 12, 10, 0, TAU, 0, PI * .62), paint, 0, .95, .42, rider);
  const visor = put(new THREE.BoxGeometry(.3, .1, .06), V.glass(), 0, .92, .63, rider); visor.rotation.x = .2;
  g.scale.setScalar(SC);
  return { g, body, rider };
}

export function createJetski({ scene, camera, audio, ui, world }) {
  const F = world.fountain;
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const APO = F.r * Math.cos(PI / 8);
  // the basin is an octagon: how far the water reaches in a direction
  const rimAt = (a) => { let d = ((a % (PI / 4)) + PI / 4) % (PI / 4); if (d > PI / 8) d -= PI / 4; return APO / Math.cos(d); };

  // ---------- the swell ----------
  let wt = 0, amp = .018;
  const W1 = [.8, .6, 7.5, 1.9], W2 = [-.45, .89, 10, 2.6], W3 = [.2, -.98, 13, 3.3];
  function waveH(x, z) {
    const lx = x - F.x, lz = z - F.z;
    const r = Math.hypot(lx, lz);
    let h = Math.sin((W1[0] * lx + W1[1] * lz) * W1[2] + wt * W1[3]) + .6 * Math.sin((W2[0] * lx + W2[1] * lz) * W2[2] + wt * W2[3]) + .35 * Math.sin((W3[0] * lx + W3[1] * lz) * W3[2] + wt * W3[3]);
    h *= amp * .55;
    // rings running out from where the curtain falls in
    h += .006 * Math.sin(r * 16 - wt * 7) * Math.exp(-Math.max(0, r - 1.3) * .8);
    return F.y + h;
  }
  const RINGS = 44, SEG = 128, ISLE = .6;
  const wGeo = new THREE.BufferGeometry();
  const wPos = new Float32Array(RINGS * SEG * 3), wCol = new Float32Array(RINGS * SEG * 3), wIdx = [];
  for (let a = 0; a < SEG; a++) {
    const th = a / SEG * TAU, R = rimAt(th) * .997;
    for (let r = 0; r < RINGS; r++) {
      const rr = ISLE + (R - ISLE) * Math.pow(r / (RINGS - 1), .85), n = (a * RINGS + r) * 3;
      wPos[n] = F.x + Math.cos(th) * rr; wPos[n + 2] = F.z + Math.sin(th) * rr;
    }
  }
  for (let a = 0; a < SEG; a++) for (let r = 0; r < RINGS - 1; r++) {
    const p = a * RINGS + r, q = ((a + 1) % SEG) * RINGS + r;
    wIdx.push(p, p + 1, q, q, p + 1, q + 1);
  }
  wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
  wGeo.setIndex(wIdx);
  const water = new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .12, metalness: .15, transparent: true, opacity: .88, emissive: 0x0e3a5a, emissiveIntensity: .45 }));
  water.frustumCulled = false; water.receiveShadow = true;
  root.add(water);
  const deep = new THREE.Color(0x3a8ec8), foam = new THREE.Color(0xeaf6ff), tc = new THREE.Color();
  function stepWater() {
    for (let a = 0; a < SEG; a++) for (let r = 0; r < RINGS; r++) {
      const n = (a * RINGS + r) * 3, h = waveH(wPos[n], wPos[n + 2]);
      wPos[n + 1] = h;
      const crest = clamp(((h - F.y) / (amp * .55 * 1.6) - .45) * 1.6, 0, 1), edge = r >= RINGS - 2 || r === 0 ? .7 : 0;
      tc.copy(deep).lerp(foam, Math.max(crest * .75, edge));
      wCol[n] = tc.r; wCol[n + 1] = tc.g; wCol[n + 2] = tc.b;
    }
    wGeo.attributes.position.needsUpdate = true; wGeo.attributes.color.needsUpdate = true;
    wGeo.computeVertexNormals();
  }

  // ---------- the course: a line weaving round the island ----------
  const PHS = (-.4 - PI) / 3;   // the start: where the weave crosses its mean radius
  const radius = (ph) => 2.85 + .7 * Math.sin(3 * ph + .4);
  const pts = [], tang = [], side = [];
  for (let i = 0; i < N; i++) {
    const ph = PHS + i / N * TAU, r = radius(ph);
    pts.push(new THREE.Vector2(F.x + Math.cos(ph) * r, F.z + Math.sin(ph) * r));
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    tang.push(t); side.push(new THREE.Vector2(-t.y, t.x));   // the rider's right (x = -fz, z = fx)
  }
  const idxOf = (ph) => Math.round((((ph - PHS) % TAU) + TAU) % TAU / TAU * N) % N;
  const yawOf = (i) => Math.atan2(tang[i].x, tang[i].y);
  let LEN = 0; for (let i = 0; i < N; i++) LEN += pts[i].distanceTo(pts[(i + 1) % N]);
  function nearest(x, z, from, win = 40) {
    let b = from, bd = Infinity;
    for (let k = -win; k <= win; k++) { const i = ((from + k) % N + N) % N, d = (pts[i].x - x) ** 2 + (pts[i].y - z) ** 2; if (d < bd) { bd = d; b = i; } }
    return b;
  }
  const nearestAll = (x, z) => nearest(x, z, 0, N / 2);

  // buoys at the ends of each weave: outside the bulges, inside the hollows. The colour says
  // on which side to pass: a buoy on your left is red (pass to its right), on your right yellow.
  const buoys = [];
  const buoyMat = { [RED]: V.mat(RED, { roughness: .35, emissive: 0x3a0808 }), [YELLOW]: V.mat(YELLOW, { roughness: .35, emissive: 0x3a3008 }) };
  for (let n = 0; n < 6; n++) {
    const ph = (PI / 2 - .4 + n * PI) / 3, i = idxOf(ph);
    const out = Math.sin(3 * ph + .4) > 0;   // a bulge: the buoy goes outside
    const rad = new THREE.Vector2(pts[i].x - F.x, pts[i].y - F.z).normalize();
    const p = pts[i].clone().addScaledVector(rad, out ? .3 : -.3);
    const onRight = (p.x - pts[i].x) * side[i].x + (p.y - pts[i].y) * side[i].y > 0;
    const color = onRight ? YELLOW : RED;
    const m = new THREE.Group(); m.position.set(p.x, F.y, p.y); root.add(m);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), buoyMat[color]); ball.scale.y = 1.25; ball.position.y = .02; m.add(ball);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.051, .051, .015, 16), V.mat(0xf6f2ea)); band.position.y = .035; m.add(band);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .09, 6), V.TRIM()); pole.position.y = .1; m.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.04, .025), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); flag.position.set(.02, .13, 0); m.add(flag);
    buoys.push({ i, p, color, onRight, m, ph: n * 1.7 });
  }
  buoys.sort((a, b) => a.i - b.i);
  // the next buoy for you: a ring on the water, an arrow pointing to the side to take
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.1, .008, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) })); ring.rotation.x = PI / 2; root.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2) })); root.add(arrow);

  // floating ramps on two of the straights
  const ramps = [];
  const rampMat = new THREE.MeshStandardMaterial({ map: V.paintTex(64, 64, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f6f2ea' : '#ff6a1a'; g.fillRect(0, k * 8, 64, 8); } }), roughness: .6 });
  for (const n of [1, 3]) {
    const i = idxOf((-.4 + n * PI) / 3), len = .42, w = .28, h = .085;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(len, h); sh.lineTo(len, 0); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); geo.translate(-len / 2, 0, -w / 2); geo.rotateY(-PI / 2);
    const m = new THREE.Mesh(geo, rampMat); m.castShadow = true;
    const yaw = yawOf(i); m.rotation.y = yaw; m.position.set(pts[i].x, F.y - .01, pts[i].y); root.add(m);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w + .04, .03, len + .04), V.mat(0x3a4a5a)); fl.position.set(pts[i].x, F.y - .005, pts[i].y); fl.rotation.y = yaw; root.add(fl);
    ramps.push({ x: pts[i].x, z: pts[i].y, fx: Math.sin(yaw), fz: Math.cos(yaw), len, w, h });
  }
  // how high a ramp holds you here (or -1)
  function rampH(x, z) {
    for (const r of ramps) {
      const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, v = dx * r.fz - dz * r.fx;
      if (Math.abs(v) < r.w / 2 && u > -r.len / 2 && u < r.len / 2) return { y: F.y - .01 + r.h * (u + r.len / 2) / r.len, r };
    }
    return null;
  }
  // the start: two posts and a banner across the line
  {
    const p = pts[0], s = side[0], yaw = yawOf(0);
    for (const k of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .32, 8), V.mat(0xf6f2ea)); post.position.set(p.x + s.x * k * .62, F.y + .12, p.y + s.y * k * .62); root.add(post); const fl = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .04, 12), V.mat(k > 0 ? RED : YELLOW)); fl.position.set(post.position.x, F.y, post.position.z); root.add(fl); }
    const tex = V.paintTex(512, 64, (g, w, h) => { for (let k = 0; k < 32; k++) { g.fillStyle = (k + Math.floor(k / 16)) % 2 ? '#1a1a1a' : '#f6f2ea'; g.fillRect(k * 16, 0, 16, 16); g.fillRect(k * 16 + 8 * 0, 48, 16, 16); } g.fillStyle = '#1a3a78'; g.fillRect(0, 16, w, 32); g.fillStyle = '#fff'; g.font = '700 26px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('VAGUE À FOND · DÉPART', w / 2, h / 2 + 1); });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.24, .08), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    ban.position.set(p.x, F.y + .25, p.y); ban.rotation.y = yaw + PI; root.add(ban);
  }

  // ---------- spray ----------
  const PMAX = 500;
  const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xf2faff, transparent: true, opacity: .85 }), PMAX);
  pMesh.frustumCulled = false; root.add(pMesh);
  const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
  let pNext = 0;
  function emit(x, y, z, vx, vy, vz, s, life) { const p = parts[pNext]; pNext = (pNext + 1) % PMAX; Object.assign(p, { x, y, z, vx, vy, vz, s, life, max: life }); }
  const dm = new THREE.Object3D();
  function stepParts(dt) {
    for (let n = 0; n < PMAX; n++) {
      const p = parts[n];
      if (p.life > 0) {
        p.life -= dt; p.vy -= 2.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < F.y - .01) { p.y = F.y - .01; p.vy = 0; p.vx *= .9; p.vz *= .9; }
      }
      const k = p.life > 0 ? p.life / p.max : 0;
      dm.position.set(p.x, p.y, p.z); dm.scale.setScalar(p.s * (k > 0 ? .4 + k * .6 : 0)); dm.updateMatrix();
      pMesh.setMatrixAt(n, dm.matrix);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }
  function splash(x, z, n = 16, big = 1) { for (let k = 0; k < n; k++) { const a = Math.random() * TAU, v = (.3 + Math.random() * .5) * big; emit(x, F.y + .01, z, Math.cos(a) * v, (.5 + Math.random() * .7) * big, Math.sin(a) * v, .008 + Math.random() * .01, .5 + Math.random() * .4); } }

  // ---------- riders ----------
  let riders = [], me = null, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let state = 'off', mode = 'course', count = 0, clock = 0, goAt = 0, endT = -1, sendT = 0, result = null, respawnCd = 0, rnd = Math.random;
  let camYaw = 0, camFov = 72, shake = 0, auto = false;
  const savedAvatars = [];
  const byKey = (k) => riders.find(c => c.key === k);
  const mine = (c) => c && (c.key === meId || (isHost && c.bot));
  function makeRider(key, name, color, bot) {
    const suit = new THREE.Color(color).lerp(new THREE.Color(0x1a1a22), .35).getHex();
    const m = skiModel(color, suit);
    root.add(m.g);
    let tag = null;
    if (key !== meId) { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, color), transparent: true, depthWrite: false })); tag.scale.set(.2, .05, 1); root.add(tag); }
    return { key, name, color, bot, m, tag, x: 0, y: F.y, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, speed: 0, steer: 0, lean: 0, roll: 0, pitch: 0, air: false, lastH: F.y,
      idx: 0, k: 0, laps: 0, done: false, doneAt: 0, time: 0, pow: 0, miss: 0, out: false, nb: 0, bLap: 0, wrongT: 0, lane: 0, skill: 1, net: null, seen: 0, wakeT: 0, bonkT: 0, onRamp: null };
  }
  function place(c, i, lat, back = 0) {
    const t = tang[i], s = side[i];
    c.x = pts[i].x + s.x * lat - t.x * back; c.z = pts[i].y + s.y * lat - t.y * back;
    c.idx = nearestAll(c.x, c.z); c.yaw = yawOf(i); c.vx = c.vz = c.vy = 0; c.speed = 0; c.air = false; c.y = waveH(c.x, c.z); c.lastH = c.y; c.onRamp = null;
  }

  function start({ seed = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: s = () => {}, opts = {} } = {}) {
    stopDyn();
    mode = MODES.some(m => m.id === opts?.mode) ? opts.mode : 'course';
    meId = mid; hostId = h; isHost = hostId === meId; send = s;
    let rs = (seed >>> 0) || 1; rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
    state = 'count'; count = 3.5; clock = 0; goAt = 0; endT = -1; sendT = 0; result = null; respawnCd = 0; shake = 0; wt = rnd() * 50;
    amp = .014 + rnd() * .01;
    camFov = camera.fov;
    const list = [];
    if (mode === 'course') {
      const pool = BOTS.slice().sort(() => rnd() - .5).filter(([, c]) => !humans.some(u => u.color === c));
      for (let n = 0; n < Math.max(0, GRID - humans.length); n++) list.push({ key: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true });
    }
    for (const u of humans) list.push({ key: u.id, name: u.name, color: u.color, bot: false });
    riders = list.map((u, n) => {
      const c = makeRider(u.key, u.name, u.color, u.bot);
      place(c, 0, (n % 3 - 1) * .3, .12 + Math.floor(n / 3) * .3);
      c.k = c.idx > N / 2 ? c.idx - N : c.idx;
      c.lane = (rnd() - .5) * .16; c.skill = .88 + rnd() * .08;
      return c;
    });
    me = byKey(meId);
    root.visible = true; F.pool.visible = false;
    for (const p of window.__dig?.net?.peers?.values?.() || []) { savedAvatars.push(p.avatar.g); p.avatar.g.scale.setScalar(1e-4); }
    if (me) camYaw = me.yaw;
    motor(true);
    audio.tick();
    update(0, new Set());
  }
  function stopDyn() {
    for (const c of riders) { root.remove(c.m.g); if (c.tag) root.remove(c.tag); }
    riders = []; me = null;
    for (const p of parts) p.life = 0;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    stopDyn();
    root.visible = false; F.pool.visible = true;
    for (const g of savedAvatars) g.scale.setScalar(1); savedAvatars.length = 0;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
    motor(false);
  }

  // ---------- the motor: a high whine over the slap of the water ----------
  let actx = null, mOsc = null, mOsc2 = null, mGain = null, mFilt = null;
  function motor(on) {
    try {
      if (on && !actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        mOsc = actx.createOscillator(); mOsc.type = 'sawtooth'; mOsc2 = actx.createOscillator(); mOsc2.type = 'triangle';
        mFilt = actx.createBiquadFilter(); mFilt.type = 'lowpass'; mFilt.frequency.value = 1800;
        mGain = actx.createGain(); mGain.gain.value = 0;
        const g2 = actx.createGain(); g2.gain.value = .5;
        mOsc.connect(mFilt); mOsc2.connect(g2); g2.connect(mFilt); mFilt.connect(mGain); mGain.connect(actx.destination);
        mOsc.start(); mOsc2.start();
      }
      if (!actx) return;
      if (on && actx.state === 'suspended') actx.resume();
      if (!on) mGain.gain.setTargetAtTime(0, actx.currentTime, .05);
    } catch { actx = null; }
  }
  function motorTick(c, thr) {
    if (!actx || !mGain) return;
    const t = actx.currentTime, f = 110 + Math.abs(c.speed) * 170 + (c.air ? 120 : 0);
    mOsc.frequency.setTargetAtTime(f, t, .05); mOsc2.frequency.setTargetAtTime(f * 1.51, t, .05);
    mGain.gain.setTargetAtTime(c.out ? .003 : .012 + Math.abs(thr) * .014, t, .06);
  }

  // ---------- the ride ----------
  const topOf = (c) => (1.55 + c.pow * .07) * (c.bot ? c.skill : 1);
  function stepRider(c, inp, dt) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const lean = inp.lean ? 1 : 0;
    c.lean += (lean - c.lean) * Math.min(1, dt * 8);
    const top = topOf(c) * (1 - c.lean * .08);
    // throttle and drag, along the nose
    if (!c.air) {
      if (inp.thr > 0) c.speed += (2.6 - c.speed / top * 2.2) * inp.thr * dt;
      else if (inp.thr < 0) c.speed += (c.speed > 0 ? -3 : -1) * dt;
      c.speed -= c.speed * (inp.thr ? .25 : .9) * dt;
      c.speed = clamp(c.speed, -.35, top * 1.15);
      const sp = Math.abs(c.speed);
      c.yaw += inp.steer * (1.9 + c.lean * 1.6) * clamp(sp / .5, .35, 1) * dt * Math.sign(c.speed || 1);
    }
    c.steer += (inp.steer - c.steer) * Math.min(1, dt * 6);
    // the water lets the hull slide: the velocity turns after the nose, slower when leaning
    const grip = c.air ? 0 : 3.2 + c.lean * 1.5;
    const tx = Math.sin(c.yaw) * c.speed, tz = Math.cos(c.yaw) * c.speed;
    const a = Math.min(1, grip * dt);
    c.vx += (tx - c.vx) * a; c.vz += (tz - c.vz) * a;
    c.x += c.vx * dt; c.z += c.vz * dt;
    // the rim and the island
    const lx = c.x - F.x, lz = c.z - F.z, r = Math.hypot(lx, lz), ang = Math.atan2(lz, lx), rim = rimAt(ang) - .07;
    if (r > rim || r < F.island + .08) {
      const nx = lx / r, nz = lz / r, lim = r > rim ? rim : F.island + .08;
      c.x = F.x + nx * lim; c.z = F.z + nz * lim;
      const vn = c.vx * nx + c.vz * nz;
      if ((r > rim && vn > 0) || (r < rim && vn < 0)) { c.vx -= nx * vn * 1.5; c.vz -= nz * vn * 1.5; c.speed *= .55; if (c === me && c.bonkT <= 0) { audio.bonk(); shake = .05; c.bonkT = .3; } }
    }
    c.bonkT -= dt;
    // up and down: on the swell, on a ramp, or flying
    const wh = waveH(c.x, c.z), rh = rampH(c.x, c.z);
    const surf = rh ? Math.max(rh.y, wh) : wh;
    if (!c.air) {
      const vy = (surf - c.lastH) / Math.max(dt, 1e-3);
      c.onRamp = rh && rh.y >= wh ? rh.r : null;
      // off the top of a ramp, or a crest dropping away faster than we would fall: take off
      const was = c.vyWas || 0, ball = c.lastH + was * dt - 1.6 * dt * dt;
      if (c.wasRamp && !c.onRamp && c.speed > .5) { c.air = true; c.vy = c.speed * .52; c.y = c.lastH; }
      else if (!c.onRamp && was > .08 && c.speed > .7 && surf < ball - .0005) { c.air = true; c.vy = was * 1.5; c.y = ball; }
      else c.y = surf;
      c.vyWas = vy; c.wasRamp = !!c.onRamp;
    }
    if (c.air) {
      c.vy -= 3.2 * dt; c.y += c.vy * dt;
      if (c.y <= surf) {
        c.air = false; c.y = surf;
        const hard = Math.min(1, -c.vy / 1.2);
        splash(c.x, c.z, 8 + Math.round(hard * 14), .5 + hard * .5);
        c.speed *= .93 - hard * .08;
        if (c === me) { shake = Math.max(shake, .02 + hard * .05); audio.splash(); }
        c.vyWas = 0; c.wasRamp = false;
      }
    }
    c.lastH = c.air ? surf : c.y;
    // the frogs' jets: a slap of water
    for (let k = 0; k < 4; k++) {
      const fa = PI / 4 + k * PI / 2, jx = F.x + Math.cos(fa) * 2.2, jz = F.z + Math.sin(fa) * 2.2;
      if (!c.air && Math.hypot(c.x - jx, c.z - jz) < .14 && !c.jetHit) { c.jetHit = true; c.speed *= .8; c.yaw += (rnd() - .5) * .4; splash(jx, jz, 10, .6); if (c === me) audio.splash(); }
      else if (c.jetHit && Math.hypot(c.x - jx, c.z - jz) > .3) c.jetHit = false;
    }
  }
  function collide() {
    for (let a = 0; a < riders.length; a++) for (let b = a + 1; b < riders.length; b++) {
      const p = riders[a], q = riders[b], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > .13 || d < 1e-4 || Math.abs(p.y - q.y) > .08) continue;
      const nx = dx / d, nz = dz / d, push = (.13 - d) / 2;
      if (mine(p)) { p.x -= nx * push; p.z -= nz * push; p.speed *= .97; }
      if (mine(q)) { q.x += nx * push; q.z += nz * push; q.speed *= .97; }
      if ((p === me || q === me) && Math.random() < .2) audio.bonk();
    }
  }
  // how far round the course (in samples), and the buoys passed on the way
  function track(c, dt) {
    const i = nearest(c.x, c.z, c.idx);
    let d = i - c.idx; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    c.idx = i; c.k += d;
    c.wrongT = d < 0 && Math.abs(c.speed) > .3 ? c.wrongT + dt : Math.max(0, c.wrongT - dt * 2);
    if (c.out || c.done) return;
    while (c.k >= c.bLap * N + buoys[c.nb].i && c.bLap < LAPS) {
      const b = buoys[c.nb];
      const lat = (c.x - b.p.x) * side[b.i].x + (c.z - b.p.y) * side[b.i].y;
      // red: stay on its right (lat > 0) · yellow: stay on its left
      const good = b.color === RED ? lat > 0 : lat < 0;
      if (good) { c.pow = Math.min(MAX_POW, c.pow + 1); if (c === me) audio.pickup(Math.min(3, 1 + c.pow / 2)); }
      else {
        c.pow = 0; c.miss++;
        if (c === me) { audio.full(); ui.toast(c.miss >= MAX_MISS ? 'cinq bouées ratées : disqualifié' : `bouée ratée ! ${c.miss} / ${MAX_MISS}`, true, 1200); }
        if (c.miss >= MAX_MISS) { c.out = true; c.speed *= .3; if (c === me) finish(); return; }
      }
      c.nb++; if (c.nb >= buoys.length) { c.nb = 0; c.bLap++; }
    }
    const lap = Math.floor(c.k / N);
    if (lap > c.laps && c.k >= 0) {
      c.laps = lap;
      if (lap >= LAPS) { c.done = true; c.doneAt = clock; if (c === me) finish(); }
      else if (c === me) { ui.toast(lap === LAPS - 1 ? 'dernier tour !' : `tour ${lap + 1} / ${LAPS}`, false, 1000); audio.tick(); }
    }
  }
  function botDrive(c, dt) {
    if (c.done || c.out) return { thr: .3, steer: 0, lean: false };
    const ahead = (c.idx + 14) % N, t = pts[ahead], s = side[ahead];
    const tx = t.x + s.x * c.lane, tz = t.y + s.y * c.lane;
    const dyaw = wrap(Math.atan2(tx - c.x, tz - c.z) - c.yaw);
    return { thr: Math.abs(dyaw) > 1 ? .5 : 1, steer: clamp(dyaw * 2.6, -1, 1), lean: Math.abs(dyaw) > .45 };
  }
  function respawnRider(c) {
    place(c, (c.idx + N) % N, 0);
    c.k = c.k - ((c.k % N) + N) % N + c.idx;
    if (c === me) { camYaw = c.yaw; audio.splash(); }
  }

  // ---------- network ----------
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const pack = (c) => [r3(c.x), r3(c.y), r3(c.z), r3(c.yaw), r3(c.vx), r3(c.vz), c.k, c.done ? 1 : 0, r3(c.steer), r3(c.lean), r3(c.time), c.pow, c.miss, c.out ? 1 : 0, c.air ? 1 : 0];
  function unpack(c, a) {
    if (!a) return;
    const [x, y, z, yaw, vx, vz, k, done, steer, lean, time, pow, miss, out, air] = a;
    c.net = { x, y, z, yaw, vx, vz, t: 0 }; c.k = k; c.steer = steer; c.lean = lean; c.pow = pow; c.miss = miss; c.out = !!out; c.air = !!air; c.seen = clock;
    if (time != null && !c.bot) c.time = time;
    if (done && !c.done) { c.done = true; c.doneAt = clock; }
  }
  function follow(c, dt) {
    const n = c.net; if (!n) return;
    n.t += dt;
    const k = Math.min(n.t, .25), tx = n.x + n.vx * k, tz = n.z + n.vz * k;
    const a = Math.min(1, dt * 14);
    if (Math.hypot(tx - c.x, tz - c.z) > 1) { c.x = tx; c.z = tz; }
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
    if (c) { root.remove(c.m.g); if (c.tag) root.remove(c.tag); riders.splice(riders.indexOf(c), 1); }
    if (id === hostId) {
      const next = riders.filter(q => !q.bot).map(q => q.key).sort((a, b) => String(a).localeCompare(String(b)))[0];
      hostId = next ?? meId; isHost = hostId === meId;
      if (isHost) for (const b of riders) if (b.bot && b.net) { b.x = b.net.x; b.z = b.net.z; b.yaw = b.net.yaw; b.speed = Math.hypot(b.net.vx, b.net.vz); }
    }
  }

  // ---------- the frame ----------
  const order = () => [...riders].sort((a, b) => (a.out - b.out) || (b.done - a.done) || (a.done && b.done ? a.doneAt - b.doneAt : b.k - a.k));
  const inp = { thr: 0, steer: 0, lean: false };
  function update(dt, keys) {
    if (state === 'off') return;
    dt = Math.min(dt, .05);
    clock += dt; wt += dt;
    amp += (Math.sin(clock * .21) * .004 + .018 - amp) * dt * .2;
    if (state === 'count') {
      const before = Math.ceil(count - .5);
      count -= dt;
      const after = Math.ceil(count - .5);
      if (after !== before && after > 0) audio.tick();
      if (count <= 0) { state = 'race'; goAt = clock; audio.buy(); }
    }
    const racing = state === 'race';
    for (const c of riders) {
      if (!mine(c)) { follow(c, dt); continue; }
      let i2 = { thr: 0, steer: 0, lean: false };
      if (c === me) {
        inp.thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        inp.steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
        inp.lean = keys.has('ShiftLeft') || keys.has('ShiftRight');
        if (c.done || c.out) { inp.thr = Math.min(inp.thr, .3); }
        i2 = auto ? botDrive(c, dt) : inp;
      } else i2 = botDrive(c, dt);
      if (!racing) i2 = { thr: 0, steer: 0, lean: false };
      stepRider(c, i2, dt);
      if (racing) { track(c, dt); if (!c.done && !c.out) c.time = clock - goAt; }
      if (c === me) motorTick(c, i2.thr);
    }
    collide();
    // show every rider: bobbing, leaning into the turn, nose up on the swell
    for (const c of riders) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const ahead = waveH(c.x + fx * .08, c.z + fz * .08), behind = waveH(c.x - fx * .08, c.z - fz * .08);
      const pitchT = c.air ? clamp(-c.vy * .5, -.5, .5) : -Math.atan2(ahead - behind, .16) - Math.min(.12, Math.abs(c.speed) * .05);
      c.pitch += (pitchT - c.pitch) * Math.min(1, dt * 10);
      c.roll += (-c.steer * (.35 + c.lean * .3) * clamp(Math.abs(c.speed) / .8, 0, 1) - c.roll) * Math.min(1, dt * 8);
      c.m.g.position.set(c.x, c.y - .004, c.z);
      c.m.g.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
      c.m.rider.rotation.z = c.steer * .15; c.m.rider.position.y = .7 - c.lean * .1;
      if (c.tag) { c.tag.position.set(c.x, c.y + .2, c.z); const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0; c.tag.visible = d > .4 && d < 5; }
      // the wake, and spray off the side in a hard turn
      c.wakeT -= dt;
      const sp = Math.abs(c.speed);
      if (!c.air && sp > .25 && c.wakeT <= 0) {
        c.wakeT = .025;
        const sx = c.x - fx * .09, sz = c.z - fz * .09;
        emit(sx + (Math.random() - .5) * .03, F.y + .005, sz + (Math.random() - .5) * .03, -fx * .1 + (Math.random() - .5) * .1, .15 + sp * .2, -fz * .1 + (Math.random() - .5) * .1, .006 + sp * .004, .45);
        if (Math.abs(c.steer) > .5 && sp > .8) { const s = -Math.sign(c.steer); emit(c.x, F.y + .01, c.z, fz * s * .6 + (Math.random() - .5) * .1, .5 + Math.random() * .3, -fx * s * .6, .008, .5); }
      }
    }
    // your next buoy: a ring round it, an arrow to the side to take
    for (const b of buoys) { b.m.position.y = waveH(b.p.x, b.p.y) - .01; b.m.rotation.z = Math.sin(clock * 2 + b.ph) * .12; }
    const nb = me && !me.done && !me.out && state !== 'off' ? buoys[me.nb] : null;
    ring.visible = arrow.visible = !!nb;
    if (nb) {
      const s = side[nb.i], k = nb.color === RED ? 1 : -1;
      ring.position.set(nb.p.x, nb.m.position.y + .005, nb.p.y); ring.scale.setScalar(1 + Math.sin(clock * 6) * .12);
      ring.material.color.setHex(nb.color).multiplyScalar(1.8);
      arrow.material.color.setHex(nb.color).multiplyScalar(2);
      arrow.position.set(nb.p.x + s.x * k * .1, nb.m.position.y + .16 + Math.sin(clock * 5) * .01, nb.p.y + s.y * k * .1);
      arrow.rotation.set(0, 0, 0); arrow.lookAt(nb.p.x + s.x * k * 1, arrow.position.y, nb.p.y + s.y * k * 1); arrow.rotateX(PI / 2);
    }
    stepWater();
    stepParts(dt);
    // drop the humans that never came
    if (racing && clock > 9) for (const c of [...riders]) if (!c.bot && !mine(c) && !c.seen) peerLeft(c.key);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = .075;
      if (me) send({ t: 's', c: pack(me) });
      if (isHost) { const l = riders.filter(c => c.bot).map(c => [c.key, pack(c)]); if (l.length) send({ t: 'b', l }); }
    }
    if (endT > 0) { endT -= dt; if (endT <= 0) { const r = result; endT = -1; onEnd(r); } }
    cam(dt);
  }

  // ---------- the camera: low behind you, just over the waves ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), eye = new THREE.Vector3(), tmp = new THREE.Vector3();
  let camY = F.y;
  function cam(dt) {
    if (!me) return;
    if (state === 'count') camYaw = me.yaw;
    camYaw += wrap(me.yaw - camYaw) * Math.min(1, dt * 5);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), sp = Math.abs(me.speed);
    const back = .42 + sp * .05, up = .15 + sp * .012;
    camY += (me.y + up - camY) * Math.min(1, dt * 6);
    camPos.set(me.x - fx * back, camY, me.z - fz * back);
    // stay inside the basin
    const lx = camPos.x - F.x, lz = camPos.z - F.z, r = Math.hypot(lx, lz), rim = rimAt(Math.atan2(lz, lx)) - .04;
    if (r > rim) { camPos.x = F.x + lx / r * rim; camPos.z = F.z + lz / r * rim; }
    camPos.y = Math.max(camPos.y, waveH(camPos.x, camPos.z) + .05);
    camLook.set(me.x + fx * .6, me.y + .05, me.z + fz * .6);
    if (state === 'count') {
      // a swoop down from above the fountain
      const k = 1 - Math.pow(Math.max(0, count - .5) / 3, 2);
      tmp.set(F.x + (me.x - F.x) * 1.8, F.y + 2.2, F.z + (me.z - F.z) * 1.8);
      camPos.lerpVectors(tmp, camPos, clamp(k, 0, 1));
      eye.copy(camPos);
    } else eye.lerp(camPos, Math.min(1, dt * 20));
    camera.position.copy(eye);
    if (shake > 0) { shake = Math.max(0, shake - dt * .3); camera.position.x += (Math.random() - .5) * shake * .3; camera.position.y += (Math.random() - .5) * shake * .3; }
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    const fov = 64 + Math.min(12, sp * 6) + (me.air ? 4 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }

  // ---------- the end ----------
  function finish() {
    const of = riders.length, humans = riders.filter(c => !c.bot);
    if (me.out) {
      result = { place: of, of, time: me.time, value: null, text: `disqualifié : ${MAX_MISS} bouées ratées` };
    } else if (mode === 'course') {
      const p = riders.filter(c => c.done && c !== me && c.doneAt <= me.doneAt).length + 1;
      result = { place: p, of, time: me.time, value: me.time };
      ui.toast(p === 1 ? 'victoire !' : `arrivée : ${p}e`, false, 2000);
    } else {
      const p = humans.filter(c => c !== me && c.done && c.doneAt < me.doneAt).length + 1;
      result = { place: p, of: humans.length, time: me.time, value: me.time, text: `3 tours en ${fmt(me.time)} · ${me.miss ? me.miss + ' bouée' + (me.miss > 1 ? 's' : '') + ' ratée' + (me.miss > 1 ? 's' : '') : 'sans faute'}` };
      ui.toast(`arrivée en ${fmt(me.time)}`, false, 2000);
    }
    if (!me.out) audio.win();
    endT = 2.6;
  }

  const gauge = (c) => '▰'.repeat(c.pow) + '▱'.repeat(MAX_POW - c.pow);
  return {
    modes: MODES,
    keys: [['z q s d', 'piloter'], ['shift', 'se pencher · virage serré'], ['bouées', 'rouge à sa droite, jaune à sa gauche'], ['r', 'revenir sur le parcours']],
    start, update, stop, onFx, peerLeft,
    respawn() { if (state === 'race' && me && !me.done && respawnCd <= clock) { respawnCd = clock + 1; respawnRider(me); } },
    hud() {
      if (state === 'count') return { count: Math.ceil(count - .5) };
      if (!me || state === 'off') return { count: 0 };
      const o = order();
      const rule = clock - goAt < 8 ? ' · rouge : passe à sa droite, jaune : à sa gauche' : '';
      return {
        lap: clamp(Math.floor(me.k / N) + 1, 1, LAPS), laps: LAPS, place: o.indexOf(me) + 1, of: riders.length, time: me.time,
        wrong: me.wrongT > .8,
        extra: `puissance <em>${gauge(me)}</em> · ratées ${me.miss} / ${MAX_MISS}${rule}`,
        board: o.map(c => ({ name: c.name + (c.out ? ' ✗' : ''), color: c.color, me: c === me })),
      };
    },
    set onEnd(f) { onEnd = f; },
    // tests and the menu's preview
    get me() { return me; }, get riders() { return riders; }, get buoys() { return buoys; }, get len() { return LEN; },
    _tp(x, z, yaw = null, sp = 0) { if (!me) return; me.x = x; me.z = z; if (yaw != null) me.yaw = yaw; me.speed = sp; me.vx = Math.sin(me.yaw) * sp; me.vz = Math.cos(me.yaw) * sp; me.idx = nearestAll(x, z); },
    _at(i, lat = 0) { if (me) { place(me, ((i % N) + N) % N, lat); me.k = me.laps * N + me.idx; } },
    _warp(lapLeft = 0) { if (!me) return; place(me, N - 20, 0); me.k = (LAPS - 1 - lapLeft) * N + N - 20; me.laps = LAPS - 1 - lapLeft; me.bLap = LAPS - lapLeft; me.nb = 0; me.speed = 1.5; },
    _auto(on = true) { auto = on; },
    _go() { if (state === 'count') count = 0; },
  };
}
