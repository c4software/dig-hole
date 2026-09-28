// delivery.js, online orders: a lane in front of the house, a little van that pulls up,
// and parcels left on the doorstep until you open them. Online, everyone sees everyone's vans and
// piles, each owner alone opens theirs; the owner runs its own trips and tells the others.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import * as V from './vehicles.js';

// parody shops. Prices are multiplied, eta in seconds, fake = chance of a counterfeit,
// shoddy = what arrives is a gamble (dead, explodes in your hands, too fast, or much stronger)
export const STORES = {
  amazone:    { name: 'amazone',     sub: 'livraison express', mult: 1,    eta: 20, fake: 0,   van: 0x1d2530, stripe: 0xffb23a, text: '#ffb23a' },
  aliexpresso: { name: 'aliexpresso', sub: 'pas cher, pas vite, pas fiable', mult: 0.55, eta: 70, fake: 0, shoddy: true, van: 0xc4332b, text: '#ffffff', stripe: 0xffffff },
};

const ROAD_Z = -13.1;
const STOP_X = 1.8;

export function createDelivery({ scene, label, interactables, getTerrain, shadows }) {
  const std = (color) => new THREE.MeshLambertMaterial({ color });

  // the lane: blue-grey asphalt, white lines, a paved pavement with a kerb on each side
  const asphalt = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 6000; n++) { const v = 150 + Math.random() * 105; g.fillStyle = `rgba(${v},${v},${v + 8},.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    for (let n = 0; n < 6; n++) { g.strokeStyle = 'rgba(60,60,70,.18)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - .5) * 40; y += (Math.random() - .5) * 40; g.lineTo(x, y); } g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(80, 1);
    return t;
  })();
  const road = new THREE.Mesh(new THREE.PlaneGeometry(320, 3.2), new THREE.MeshLambertMaterial({ color: 0x6a707e, map: asphalt }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, .015, ROAD_Z);
  road.receiveShadow = true;
  scene.add(road);
  const dashes = new THREE.Group();
  const dashMat = std(0xf2f2ee);
  const flat = (w, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; dashes.add(m); return m; };
  for (let x = -158; x < 160; x += 5) flat(2.4, .1, dashMat, x, .022, ROAD_Z);
  for (const dz of [-1.42, 1.42]) flat(320, .1, dashMat, 0, .022, ROAD_Z + dz);
  const paver = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 * 16; x < 128 + 16; x += 32) { g.fillStyle = `rgba(0,0,0,${.03 + Math.random() * .05})`; g.fillRect(x + 1, y + 1, 30, 14); g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, y, 32, 1); g.fillRect(x, y, 1, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(160, .5);
    return t;
  })();
  const walk = new THREE.MeshLambertMaterial({ color: 0xd8d0c4, map: paver }), kerb = std(0xbab4aa);
  // our side: the pavement stops at the house front
  for (const sx of [-1, 1]) flat(154.4, .72, walk, sx * 82.8, .05, ROAD_Z - 2);
  flat(11.2, .3, walk, 0, .05, ROAD_Z - 1.8);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(320, .1, .14), kerb); kb.position.set(0, .05, ROAD_Z - 1.64); dashes.add(kb);
  // the far side: pavement either side of the patio
  for (const sx of [-1, 1]) {
    flat(154, .7, walk, sx * 83, .05, ROAD_Z + 1.97);
    const k2 = new THREE.Mesh(new THREE.BoxGeometry(154, .1, .14), kerb); k2.position.set(sx * 83, .05, ROAD_Z + 1.64); dashes.add(k2);
  }
  scene.add(dashes);
  mergeStatic(dashes);

  function makeVan() {
    // the van: a tall cargo box, a sloped cab you can see out of, real wheels. Everything that
    // leans (roll, pitch, the bounce of the springs) hangs off `shell`; the wheels stay put.
    const van = new THREE.Group();
    const shell = new THREE.Group(); van.add(shell);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .12 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .45 });
    const trim = V.TRIM(), chrome = V.CHROME();
    const put = (geo, m, x, y, z, p = shell) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
    put(V.roundBox(3.32, 1.72, 1.72, .16, 3), bodyMat, -.24, 1.3, 0);
    // the cab: one side profile (bonnet, windscreen, roof) extruded across the van
    put(V.profile([[1.12, .55], [2.24, .55], [2.33, .66], [2.33, 1.08], [2.22, 1.16], [1.96, 1.8], [1.86, 1.86], [1.12, 1.86]], 1.7, .09, 'van'), bodyMat, 0, 0, 0);
    const see = V.glass(true), dark = V.glass(false);
    // windscreen along the slope, side windows in the doors
    const ws = put(new THREE.PlaneGeometry(1.5, .62), see, 2.183, 1.518, 0);
    ws.lookAt(ws.position.x + .926, ws.position.y + .376, 0);
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([new THREE.Vector2(1.48, 1.2), new THREE.Vector2(2.17, 1.2), new THREE.Vector2(1.95, 1.74), new THREE.Vector2(1.48, 1.74)]);
      const w = put(new THREE.ShapeGeometry(sh), see, 0, 0, s * .856); if (s < 0) w.rotation.y = Math.PI, w.scale.x = -1;
      // mirrors on little arms
      put(V.roundBox(.2, .05, .16, .02), trim, 2.1, 1.3, s * .95);
      put(V.roundBox(.1, .24, .18, .04), bodyMat, 2.14, 1.4, s * 1.06);
      put(new THREE.PlaneGeometry(.16, .2), dark, 2.08, 1.4, s * 1.06).rotation.y = -Math.PI / 2;
      // sliding door seam and handle, a window strip in the rear doors
      put(V.roundBox(.03, 1.3, .02, .01), trim, .75, 1.22, s * .865);
      put(V.roundBox(.16, .05, .05, .02), chrome, .6, 1.2, s * .87);
      put(V.roundBox(.14, .05, .05, .02), chrome, 1.62, 1.08, s * .86);
      // wheel arches
      for (const x of [-1.2, 1.6]) { const a = put(new THREE.RingGeometry(.4, .5, 18, 1, 0, Math.PI), trim, x, .36, s * .868); if (s < 0) a.rotation.y = Math.PI; }
      // lamps: headlights, indicators, tall tail lights
      put(V.roundBox(.08, .17, .34, .05), V.lamp(0xfff4d8, 3), 2.43, .96, s * .56);
      put(V.roundBox(.07, .08, .14, .03), V.lamp(0xffa020, 2), 2.43, .96, s * .8);
      put(V.roundBox(.07, .44, .13, .04), V.lamp(0xff2a1e, 2.2), -1.9, 1.05, s * .75);
      put(V.roundBox(.08, .14, .13, .04), V.lamp(0xfff4d8, 1.1), -1.9, .74, s * .75);
    }
    // grille, bumpers, plates, rear door seam, exhaust
    put(V.roundBox(.06, .3, .7, .06), trim, 2.43, .86, 0);
    for (const y of [.78, .86, .94]) put(V.roundBox(.04, .025, .64, .01), chrome, 2.46, y, 0);
    put(V.roundBox(.24, .2, 1.84, .08), trim, 2.36, .52, 0);
    put(V.roundBox(.24, .2, 1.84, .08), trim, -1.88, .52, 0);
    const plateMat = new THREE.MeshBasicMaterial({ map: V.plate('A-H0LE') });
    put(new THREE.PlaneGeometry(.5, .12), plateMat, 2.49, .54, 0).rotation.y = Math.PI / 2;
    put(new THREE.PlaneGeometry(.5, .12), plateMat, -2.01, .54, 0).rotation.y = -Math.PI / 2;
    put(V.roundBox(.02, 1.4, .03, .01), trim, -1.91, 1.25, 0);
    put(V.roundBox(.05, .05, .2, .02), chrome, -1.93, 1.2, .12);
    const pipe = put(new THREE.CylinderGeometry(.045, .05, .3, 10), chrome, -1.9, .36, .5); pipe.rotation.z = Math.PI / 2;
    // roof: a rack, an aerial, an amber beacon
    for (const x of [-1.3, -.3, .7]) put(V.roundBox(.06, .06, 1.5, .02), trim, x, 2.2, 0);
    for (const z of [-.72, .72]) put(V.roundBox(2.2, .05, .05, .02), trim, -.3, 2.23, z);
    put(new THREE.CylinderGeometry(.008, .012, .7, 5), trim, 1.4, 2.28, -.7);
    const beacon = put(V.roundBox(.2, .1, .5, .05), V.lamp(0xffb020, 1.6), 1.6, 2.0, 0);
    // inside the cab: dashboard, seats, a steering wheel that turns
    put(V.roundBox(.3, .18, 1.56, .08), trim, 2.16, 1.06, 0);
    for (const z of [-.38, .38]) { put(V.roundBox(.4, .12, .5, .05), trim, 1.68, .98, z); put(V.roundBox(.12, .62, .5, .05), trim, 1.5, 1.3, z); }
    const column = new THREE.Group(); column.position.set(2.06, 1.15, .35); column.rotation.z = -.5; shell.add(column);
    const wheelMesh = new THREE.Group(); column.add(wheelMesh);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(.15, .02, 8, 24), trim); sw.rotation.y = Math.PI / 2; wheelMesh.add(sw);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.02, .025, .28), trim); wheelMesh.add(bar);
    const stripe = put(V.roundBox(4.3, .12, 1.74, .05), stripeMat, .25, .66, 0);
    void stripe;
    // the wheels, the front pair on steering pivots
    const wheels = [], steerers = [];
    for (const [x, z] of [[-1.2, .8], [1.6, .8], [-1.2, -.8], [1.6, -.8]]) {
      const piv = new THREE.Group(); piv.position.set(x, .36, z); van.add(piv);
      const w = V.wheel({ r: .36, w: .26 }); if (z < 0) w.rotation.y = Math.PI;
      piv.add(w); wheels.push(w);
      if (x > 0) steerers.push(piv);
    }
    const shade = V.contactShadow(5.2, 2.6, .6); shade.position.x = .2; van.add(shade);
    const sideMats = [new THREE.MeshBasicMaterial({ transparent: true }), new THREE.MeshBasicMaterial({ transparent: true })];
    const sideL = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .8), sideMats[0]);
    sideL.position.set(-.3, 1.4, .865);
    const sideR = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .8), sideMats[1]);
    sideR.position.set(-.3, 1.4, -.865); sideR.rotation.y = Math.PI;
    shell.add(sideL, sideR);
    van.visible = false;
    van.position.set(-120, 0, ROAD_Z);
    scene.add(van);
    // the feel: springs for roll, pitch and bounce, the beacon's blink
    const roll = V.spring(70, 9), pitch = V.spring(60, 8), bob = V.spring(120, 9);
    let lastSpeed = 0, puffT = 0, steerNow = 0, clock = Math.random() * 10;
    function juice(dt, speed, steer = 0, throttle = 0) {
      clock += dt;
      const accel = THREE.MathUtils.clamp((speed - lastSpeed) / Math.max(dt, 1e-3), -30, 30); lastSpeed = speed;
      steerNow += (steer - steerNow) * Math.min(1, dt * 8);
      for (const w of wheels) w.spin.rotation.z -= (w.rotation.y ? -1 : 1) * speed * dt / .36;
      for (const p of steerers) p.rotation.y = -steerNow * .42;
      wheelMesh.rotation.x = steerNow * 2.4;
      const moving = Math.min(1, Math.abs(speed) / 6);
      shell.rotation.x = roll.step(-steerNow * moving * .07, dt);
      shell.rotation.z = pitch.step(THREE.MathUtils.clamp(accel * .006, -.06, .05), dt);
      shell.position.y = bob.step((Math.sin(clock * 11) * .012 + Math.sin(clock * 6.7) * .01) * moving, dt);
      puffT -= dt;
      if (puffT <= 0 && van.visible) {
        puffT = throttle > 0 ? .05 : .16 + (1 - moving) * .1;
        van.updateMatrixWorld();
        pw.copy(pipeEnd).applyMatrix4(van.matrixWorld);
        pv.set(-1 - Math.random(), .4, (Math.random() - .5) * .6).applyEuler(van.rotation).multiplyScalar(1 + moving);
        puffs.emit(pw, pv, throttle > 0 ? .4 : .28, .8 + Math.random() * .4);
      }
      beacon.visible = Math.sin(clock * 9) > -.2;
    }
    function paint(store) {
      const st = STORES[store] || STORES.amazone;
      bodyMat.color.setHex(st.van);
      stripeMat.color.setHex(st.stripe);
      sideMats.forEach(m => { m.map = paintTex[store] || paintTex.amazone; m.needsUpdate = true; });
    }
    shadows?.(van);
    return { g: van, juice, paint, trip: null };
  }
  const puffs = V.createPuffs(scene, 60);
  const pipeEnd = new THREE.Vector3(-2.1, .36, .5), pw = new THREE.Vector3(), pv = new THREE.Vector3();
  const paintTex = {};
  for (const [id, st] of Object.entries(STORES)) paintTex[id] = label(st.name, { w: 512, h: 160, size: 84, color: st.text });
  // a few vans, built when needed and handed from trip to trip
  const pool = [makeVan()];
  const takeVan = () => pool.find(v => !v.trip) || (pool.push(makeVan()), pool[pool.length - 1]);

  // ---------- the timeline of a delivery, the same on every screen ----------
  // in: from far down the lane at full speed, then easing onto its stop; a pause; then away.
  // A function of the time since the start: a shared start time is all a peer needs.
  const LEFT0 = 111.8, L1 = 15 / .9;
  const T_FAST = (LEFT0 - L1) / 16, T_EASE = Math.log(1 + .9 * L1) / .9;
  const T_IN = T_FAST + T_EASE, T_STOP = 6, T_DROP = T_IN + 1;
  const T_BOOST = Math.log(9) / 2, T_END = T_IN + T_STOP + T_BOOST + 110 / 18;
  const GAP = 9;   // one van at the door at a time: the next one starts this long after the last
  function motion(tau, stop, out) {
    if (tau < T_FAST) { out.x = stop - LEFT0 + 16 * tau; out.s = 16; }
    else if (tau < T_IN) {
      const L = Math.max(0, (L1 + 1 / .9) * Math.exp(-.9 * (tau - T_FAST)) - 1 / .9);
      out.x = stop - L; out.s = 1 + .9 * L;
    } else if (tau < T_IN + T_STOP) { out.x = stop; out.s = 0; }
    else {
      const t = tau - T_IN - T_STOP;
      if (t < T_BOOST) { const u = Math.exp(2 * t); out.x = stop - 1 + u; out.s = 2 * u; }
      else { out.x = stop + 8 + 18 * (t - T_BOOST); out.s = 18; }
    }
    return out;
  }
  const now = () => performance.now() / 1000;

  // ---------- parcels on the doorstep: a pile per owner, side by side ----------
  // piles sit in slots along the front, picked from the owner's id so everyone sees the same
  const SLOT_X = [1.5, -.4, 3.4, -2.3, -4.2, 5.3];
  const parcelGeo = new THREE.BoxGeometry(.5, .36, .4);
  const tapeGeo = new THREE.BoxGeometry(.52, .05, .1);
  const boxMat = std(0xb88a58), plainTape = std(0xd9c8a0);
  const piles = new Map();   // owner ('me' or a peer id) → { n, name, color, slot, group, spot, tag }
  let me = { id: 0, name: 'toi', color: 0xd9c8a0 };
  let net = null;            // { send(fx) } once online
  const num = (owner) => owner === 'me' ? me.id : +owner || 0;
  const free = (taken, owner) => {
    let s = num(owner) % SLOT_X.length;
    for (let k = 0; k < SLOT_X.length && [...taken.values()].includes(s); k++) s = (s + 1) % SLOT_X.length;
    return s;
  };
  function slots() {
    // owners by id, each in its own slot or the next free one
    const taken = new Map();
    for (const o of [...piles.keys()].filter(o => piles.get(o).n > 0).sort((a, b) => num(a) - num(b))) taken.set(o, free(taken, o));
    return taken;
  }
  function slotOf(owner) { const t = slots(); return t.has(owner) ? t.get(owner) : free(t, owner); }
  const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
  const mySpot = { id: 'parcel', pos: new THREE.Vector3(2, .5, -14.6), off: true, owner: 'me' };
  interactables.push(mySpot);
  function pileOf(owner) {
    if (piles.has(owner)) return piles.get(owner);
    const group = new THREE.Group(); scene.add(group);
    const spot = owner === 'me' ? mySpot : { id: 'parcel', pos: new THREE.Vector3(), off: true, owner };
    if (owner !== 'me') interactables.push(spot);
    const p = { n: 0, name: '', color: 0, slot: -1, group, spot, tag: null, tape: null, tapeColor: null, built: -1 };
    piles.set(owner, p);
    return p;
  }
  function build(p, owner) {
    // online, the tape in the owner's colour and a name over the pile
    const multi = !!net, tc = multi ? p.color : -1;
    if (p.tapeColor !== tc) { p.tapeColor = tc; p.tape = multi ? std(p.color) : plainTape; p.built = -1; }
    if (p.built !== p.n) {
      while (p.group.children.length) p.group.remove(p.group.children[0]);
      for (let k = 0; k < p.n; k++) {
        const b = new THREE.Group();
        b.add(new THREE.Mesh(parcelGeo, boxMat));
        const tape = new THREE.Mesh(tapeGeo, p.tape); tape.position.y = .18;
        b.add(tape);
        b.position.set((k % 3) * .55, .18 + Math.floor(k / 3) * .37, 0);
        b.rotation.y = (k * 1.7) % .4 - .2;
        p.group.add(b);
      }
      p.built = p.n;
      p.tag = null;
      shadows?.(p.group);
    }
    if (multi && p.n && !p.tag) {
      const tex = label(p.name, { w: 256, h: 64, size: 34, color: hex(p.color), bg: 'rgba(11,13,18,.55)' });
      p.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      p.tag.scale.set(1.1, .275, 1);
      p.tag.position.set(.55, .35 + Math.ceil(p.n / 3) * .37, 0);
      p.group.add(p.tag);
    }
  }
  function layout() {
    const t = slots();
    for (const [owner, p] of piles) {
      p.slot = t.has(owner) ? t.get(owner) : -1;
      if (owner === 'me') { p.name = me.name; p.color = me.color; }
      build(p, owner);
      p.group.visible = p.n > 0;
      const x = SLOT_X[Math.max(0, p.slot)];
      p.group.position.set(x, 0, -14.62);
      p.spot.pos.set(x + .5, .5, -14.6);
      p.spot.name = p.name;
      p.spot.off = !p.n;
    }
  }

  // state lives in the save: orders waiting to ship, the ones riding in a van, parcels waiting to be opened
  let S = { orders: [], parcels: [], ride: [] };
  let onArrive = () => {}, onCrash = () => {}, onRemoteCrash = () => {};

  function sync() { pileOf('me').n = S.parcels.length; layout(); net?.send({ k: 'dv', t: 'pile', n: S.parcels.length }); }

  // ---------- the trips: mine and everyone else's ----------
  // { key, owner, id, name, store, t0, stop, cargo, mode: null (on the timeline) | 'stolen' | 'falling' | 'wreck' | 'remote', van }
  const trips = new Map();
  let tripN = 0;
  let cur = null;            // the trip I'm driving (or last drove)
  let hidden = false;
  const mv = { x: 0, s: 0 };
  const mine = (t) => t.owner === 'me';
  const ownActive = () => [...trips.values()].some(t => mine(t) && (!t.mode || t.mode === 'falling' || (t.mode === 'stolen' && t.driver)));
  function laneFree(skip) {
    let t = now();
    for (const o of trips.values()) if (!o.mode && o !== skip) t = Math.max(t, o.t0 + GAP);
    return t;
  }
  const stopFor = (owner) => SLOT_X[slotOf(owner)] + .3;
  const tripMsg = (t) => ({ k: 'dv', t: 'trip', id: t.id, store: t.store, in: +(t.t0 - now()).toFixed(2), stop: +t.stop.toFixed(2) });
  function drop(t) {
    if (t.van) { t.van.trip = null; t.van.g.visible = false; t.van.g.rotation.set(0, 0, 0); t.van.g.position.y = 0; }
    t.van = null;
    trips.delete(t.key);
    if (cur === t) cur = null;
    // a van taken off the road with its cargo: the parcels ship again
    if (mine(t) && t.cargo) {
      S.ride = S.ride.filter(o => !t.cargo.includes(o));
      for (const o of t.cargo) { o.eta = 0; S.orders.push(o); }
      t.cargo = null;
    }
  }
  function vanFor(t) {
    if (!t.van) { t.van = takeVan(); t.van.trip = t; t.van.paint(t.store); }
    return t.van;
  }

  // ---------- joyriding: only the van carrying my own parcels ----------
  const fwd = new THREE.Vector3();
  let poseT = 0;
  function unsupported(g) {
    // the ground under the middle of the van: is there any?
    const t = getTerrain();
    const [i, j, k] = t.cellOf(g.position.x, -0.2, g.position.z);
    return !t.solidCell(i, j, k);
  }
  const poseMsg = (d) => ({ k: 'dv', t: 'pose', id: d.id, store: d.store, p: d.van.g.position.toArray().map(v => +v.toFixed(2)), yaw: +d.yaw.toFixed(3), tip: +(d.tip || 0).toFixed(2), s: +(d.speed || 0).toFixed(1) });
  function drive(d, dt, input) {
    const g = d.van.g;
    if (d.mode === 'stolen') {
      d.speed += (input.throttle * 11 - d.speed * 0.9) * dt;
      d.speed = THREE.MathUtils.clamp(d.speed, -5, 14);
      d.yaw -= input.steer * dt * 1.4 * Math.min(1, Math.abs(d.speed) / 3) * Math.sign(d.speed || 1);
      fwd.set(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
      g.position.addScaledVector(fwd, d.speed * dt);
      g.position.x = THREE.MathUtils.clamp(g.position.x, -60, 60);
      g.position.z = THREE.MathUtils.clamp(g.position.z, -60, 60);
      g.rotation.set(0, d.yaw, 0);
      d.van.juice(dt, d.speed, input.steer, input.throttle);
      if (unsupported(g)) { d.mode = 'falling'; d.vy = 0; d.tip = 0; }
    } else {
      fwd.set(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
      d.vy -= 20 * dt;
      g.position.addScaledVector(fwd, d.speed * dt * .4);
      g.position.y += d.vy * dt;
      d.tip = Math.min(1.3, d.tip + dt * 1.6);
      g.rotation.set(0, d.yaw, -d.tip);
      const t = getTerrain();
      const [i, j, k] = t.cellOf(g.position.x, g.position.y - .1, g.position.z);
      if (g.position.y < -1 && t.solidCell(i, j, k)) {
        // the crash happens once, here, on the owner's screen; the others only see it
        d.mode = 'wreck'; d.wait = 25; d.driver = false;
        const cargo = d.cargo;
        if (cargo) S.ride = S.ride.filter(o => !cargo.includes(o));
        d.cargo = null;
        net?.send({ k: 'dv', t: 'crash', id: d.id, store: d.store, p: g.position.toArray().map(v => +v.toFixed(2)), yaw: +d.yaw.toFixed(3) });
        onCrash(g.position.clone(), cargo, -d.vy);
        return;
      }
    }
    // the others see it move: a few poses a second, eased on their side
    poseT -= dt;
    if (net && poseT <= 0) { poseT = .12; net.send(poseMsg(d)); }
  }

  function update(dt, input) {
    for (const o of S.orders) o.eta -= dt;
    const T = now();
    // a new van for me once the last one is done: what's due from one shop rides together
    if (!ownActive() && S.orders.some(o => o.eta <= 0)) {
      // an abandoned van (parked after a joyride, or a wreck) goes away, its cargo back with the rest
      for (const t of [...trips.values()]) if (mine(t)) { drop(t); net?.send({ k: 'dv', t: 'gone', id: t.id }); }
      const store = S.orders.find(o => o.eta <= 0).store;
      const cargo = S.orders.filter(o => o.eta <= 0 && o.store === store);
      S.orders = S.orders.filter(o => !cargo.includes(o));
      S.ride.push(...cargo);
      const t = { key: 'me:' + (++tripN), owner: 'me', id: tripN, name: me.name, store, t0: laneFree(), stop: stopFor('me'), cargo, mode: null, van: null };
      trips.set(t.key, t);
      net?.send(tripMsg(t));
    }
    for (const t of [...trips.values()]) {
      if (t.mode === 'stolen' || t.mode === 'falling') {
        if (mine(t) && (t.driver || t.mode === 'falling')) drive(t, dt, input || { throttle: 0, steer: 0 });
        continue;
      }
      if (t.mode === 'wreck') {
        t.wait -= dt;
        if (t.wait <= 0) { drop(t); if (mine(t)) net?.send({ k: 'dv', t: 'gone', id: t.id }); }
        continue;
      }
      if (t.mode === 'remote') {
        // someone else at the wheel: ease towards the last pose they sent
        const g = t.van.g, k = Math.min(1, dt * 10);
        g.position.lerp(t.to, k);
        const dy = t.yaw - t.yawNow;
        t.yawNow += Math.atan2(Math.sin(dy), Math.cos(dy)) * k;
        g.rotation.set(0, t.yawNow, -(t.tip || 0));
        t.van.juice(dt, t.s || 0);
        continue;
      }
      const tau = T - t.t0;
      if (tau < 0) continue;
      if (tau > T_END) { drop(t); continue; }
      const v = vanFor(t);
      if (mine(t) && tau > T_DROP && t.cargo) {
        const cargo = t.cargo;
        S.ride = S.ride.filter(o => !cargo.includes(o));
        for (const o of cargo) S.parcels.push({ store: o.store, item: o.item, fake: o.fake });
        t.cargo = null;
        sync();
        onArrive(cargo);
      }
      motion(tau, t.stop, mv);
      v.g.position.set(mv.x, Math.sin(mv.x * 3) * .015, ROAD_Z);
      v.g.rotation.set(0, 0, 0);
      t.speed = mv.s;
      v.juice(dt, mv.s);
    }
    for (const v of pool) v.g.visible = !!v.trip && !hidden && (!!v.trip.mode || T >= v.trip.t0);
    puffs.update(dt);
  }

  // ---------- what the others tell us ----------
  function remote(pid, fx, peer) {
    const key = pid + ':' + fx.id, T = now();
    let t = trips.get(key);
    if (fx.t === 'pile') {
      const p = pileOf(pid);
      const name = peer?.name || '?', color = peer?.color ?? 0xd9c8a0;
      if (p.name !== name || p.color !== color) p.tag = null, p.built = -1;
      p.n = Math.max(0, Math.min(60, fx.n | 0)); p.name = name; p.color = color;
      layout();
      return;
    }
    const store = STORES[fx.store] ? fx.store : 'amazone';
    if (fx.t === 'trip') {
      const t0 = T + (+fx.in || 0), stop = Number.isFinite(+fx.stop) ? +fx.stop : STOP_X;
      if (t) { if (!t.mode) { t.t0 = t0; t.stop = stop; } return; }
      t = { key, owner: pid, id: fx.id, name: peer?.name || '?', store, t0, stop, mode: null, van: null };
      trips.set(key, t);
      // two orders at once: the lower id keeps its turn, mine waits for the lane
      for (const o of trips.values()) {
        if (!mine(o) || o.mode || T - o.t0 > 2 || Math.abs(o.t0 - t0) >= GAP || num('me') < +pid) continue;
        o.t0 = laneFree(o);
        net?.send(tripMsg(o));
      }
      return;
    }
    if (fx.t === 'gone') { if (t) drop(t); return; }
    if (!Array.isArray(fx.p) || fx.p.length !== 3 || !fx.p.every(Number.isFinite)) return;
    if (!t) { t = { key, owner: pid, id: fx.id, name: peer?.name || '?', store, t0: T, stop: STOP_X, mode: 'remote', van: null, to: new THREE.Vector3().fromArray(fx.p), yawNow: +fx.yaw || 0 }; trips.set(key, t); vanFor(t).g.position.fromArray(fx.p); }
    const g = vanFor(t).g;
    if (fx.t === 'pose') {
      // taken off its timeline: from where it was, towards where its driver says
      if (t.mode !== 'remote') { t.mode = 'remote'; t.to = new THREE.Vector3(); t.yawNow = g.rotation.y; }
      t.to.fromArray(fx.p); t.yaw = +fx.yaw || 0; t.tip = +fx.tip || 0; t.s = +fx.s || 0;
    } else if (fx.t === 'crash') {
      t.mode = 'wreck'; t.wait = 30;
      g.position.fromArray(fx.p); g.rotation.set(0, +fx.yaw || 0, -1.3);
      if (!fx.quiet) onRemoteCrash(g.position.clone(), t.name);
    }
  }
  // what a newcomer needs: my pile, my vans on the road, where the stolen one is
  function snapshot() {
    const out = [{ k: 'dv', t: 'pile', n: S.parcels.length }];
    for (const t of trips.values()) {
      if (!mine(t)) continue;
      if (!t.mode) out.push(tripMsg(t));
      else if (!t.van) continue;
      else if (t.mode === 'wreck') out.push({ k: 'dv', t: 'crash', id: t.id, store: t.store, p: t.van.g.position.toArray().map(v => +v.toFixed(2)), yaw: +(t.yaw || 0).toFixed(3), quiet: 1 });
      else out.push(poseMsg(t));
    }
    return out;
  }
  // someone left (or we went offline): their vans and parcels go with them
  function dropPeer(pid) {
    for (const t of [...trips.values()]) if (!mine(t) && (pid == null || t.owner === pid)) drop(t);
    for (const [o, p] of [...piles]) {
      if (o === 'me' || (pid != null && o !== pid)) continue;
      scene.remove(p.group);
      const i = interactables.indexOf(p.spot); if (i >= 0) interactables.splice(i, 1);
      piles.delete(o);
    }
    layout();
  }
  // the van at hand: mine (to steal) or somebody else's (hands off)
  function vanNear(p, own) {
    for (const t of trips.values()) {
      if (mine(t) !== own || !t.van || !t.van.g.visible || t.mode === 'wreck' || t.mode === 'falling') continue;
      if (own && t.mode && t.mode !== 'stolen') continue;
      if (Math.hypot(p.x - t.van.g.position.x, p.z - t.van.g.position.z) < 3.6) return t;
    }
    return null;
  }
  let stealable = null;
  pileOf('me');

  return {
    update,
    remote, snapshot, dropPeer,
    // online: how to reach the others, and who I am
    link(send) { net = { send }; layout(); },
    setMe(id, name, color) { me = { id: +id || 0, name, color }; const p = piles.get('me'); p.tag = null; p.built = -1; layout(); },
    get state() { return S; },
    load(s) {
      // what was riding in a van when the game closed ships again
      S = { orders: [...(s?.orders || []), ...(s?.ride || []).map(o => ({ ...o, eta: 0 }))], parcels: s?.parcels || [], ride: [] };
      for (const t of [...trips.values()]) if (mine(t)) { t.cargo = null; drop(t); }
      sync();
    },
    order(store, item, count) {
      const st = STORES[store];
      // one delivery: what's ordered while a parcel from the same shop is on its way rides with it
      const pend = S.orders.filter(o => o.store === store);
      const eta = pend.length ? Math.min(...pend.map(o => o.eta)) : st.eta;
      for (let n = 0; n < count; n++) S.orders.push({ store, item, eta, fake: Math.random() < st.fake });
    },
    // hand every parcel over, the counterfeits flagged
    open() { const p = S.parcels; S.parcels = []; sync(); return p; },
    get eta() { return S.orders.length ? Math.max(0, Math.min(...S.orders.map(o => o.eta))) : null; },
    get busy() { return [...trips.values()].some(t => t.van); },
    // the van I'm driving, else the first one on the road
    get van() { return (cur?.van || [...trips.values()].find(t => t.van && t.van.g.visible)?.van || pool[0]).g; },
    // out of the way (a kart race in the streets)
    set hidden(v) { hidden = !!v; if (hidden) for (const p of pool) p.g.visible = false; },
    get driving() { return cur && cur.driver && (cur.mode === 'stolen' || cur.mode === 'falling') ? cur.mode : null; },
    // good timing: parked, or crawling in. Only my own van: the others' carry their owners' parcels
    canSteal(p) { stealable = vanNear(p, true); return !!stealable; },
    // whose van this is, when it isn't mine
    foreignVan(p) { return vanNear(p, false)?.name ?? null; },
    steal() {
      const t = stealable || cur; if (!t) return;
      if (t.mode !== 'stolen') { t.mode = 'stolen'; t.yaw = 0; }
      t.speed = Math.min(t.speed || 0, 6); t.driver = true; cur = t;
      if (net) net.send(poseMsg(t));
    },
    park() { if (cur) { cur.speed = 0; cur.driver = false; if (cur.van && net) net.send(poseMsg(cur)); } },
    // point the stolen van (tests, and a nudge if it ever gets stuck)
    aim(yaw) { if (cur) cur.yaw = yaw; },
    // where the driver's eye sits, in world space
    seat(out) { const g = this.van; return out.set(1.7, 1.42, .35).applyEuler(g.rotation).add(g.position); },
    get yaw() { return cur ? cur.yaw : 0; },
    set onCrash(f) { onCrash = f; },
    set onArrive(f) { onArrive = f; },
    set onRemoteCrash(f) { onRemoteCrash = f; },
    trips, piles,
  };
}
