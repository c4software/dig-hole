// delivery.js, online orders: a lane in front of the house, a little van that pulls up,
// and parcels left on the doorstep until you open them.
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

export function createDelivery({ scene, label, interactables, getTerrain }) {
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
  // the feel: springs for roll, pitch and bounce, puffs from the exhaust, the beacon's blink
  const roll = V.spring(70, 9), pitch = V.spring(60, 8), bob = V.spring(120, 9);
  const puffs = V.createPuffs(scene, 30);
  const pipeEnd = new THREE.Vector3(-2.1, .36, .5), pw = new THREE.Vector3(), pv = new THREE.Vector3();
  let lastSpeed = 0, puffT = 0, steerNow = 0, clock = 0;
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
    puffs.update(dt);
    beacon.visible = Math.sin(clock * 9) > -.2;
  }
  const paintTex = {};
  for (const [id, st] of Object.entries(STORES)) paintTex[id] = label(st.name, { w: 512, h: 160, size: 84, color: st.text });

  function paint(store) {
    const st = STORES[store];
    bodyMat.color.setHex(st.van);
    stripeMat.color.setHex(st.stripe);
    sideMats.forEach(m => { m.map = paintTex[store]; m.needsUpdate = true; });
  }

  // parcels on the doorstep
  const parcelGeo = new THREE.BoxGeometry(.5, .36, .4);
  const tapeGeo = new THREE.BoxGeometry(.52, .05, .1);
  const parcelMeshes = [];
  function layParcels(n) {
    while (parcelMeshes.length > n) scene.remove(parcelMeshes.pop());
    while (parcelMeshes.length < n) {
      const k = parcelMeshes.length;
      const p = new THREE.Group();
      p.add(new THREE.Mesh(parcelGeo, std(0xb88a58)));
      const tape = new THREE.Mesh(tapeGeo, std(0xd9c8a0)); tape.position.y = .18;
      p.add(tape);
      p.position.set(1.5 + (k % 3) * .55, .18 + Math.floor(k / 3) * .37, -14.62);
      p.rotation.y = (k * 1.7) % .4 - .2;
      scene.add(p);
      parcelMeshes.push(p);
    }
  }
  const spot = { id: 'parcel', pos: new THREE.Vector3(2, .5, -14.6), off: true };
  interactables.push(spot);

  // state lives in the save: orders waiting to ship, parcels waiting to be opened
  let S = { orders: [], parcels: [] };
  let trip = null;   // { phase, x, store, cargo, wait }
  let onArrive = () => {};

  function sync() { layParcels(S.parcels.length); spot.off = !S.parcels.length; }

  // ---------- joyriding ----------
  const fwd = new THREE.Vector3();
  let onCrash = () => {};
  function unsupported() {
    // the ground under the middle of the van: is there any?
    const t = getTerrain();
    const [i, j, k] = t.cellOf(van.position.x, -0.2, van.position.z);
    return !t.solidCell(i, j, k);
  }
  function drive(dt, input) {
    const d = trip;
    if (d.phase === 'stolen') {
      d.speed += (input.throttle * 11 - d.speed * 0.9) * dt;
      d.speed = THREE.MathUtils.clamp(d.speed, -5, 14);
      d.yaw -= input.steer * dt * 1.4 * Math.min(1, Math.abs(d.speed) / 3) * Math.sign(d.speed || 1);
      fwd.set(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
      van.position.addScaledVector(fwd, d.speed * dt);
      van.position.x = THREE.MathUtils.clamp(van.position.x, -60, 60);
      van.position.z = THREE.MathUtils.clamp(van.position.z, -60, 60);
      van.rotation.set(0, d.yaw, 0);
      juice(dt, d.speed, input.steer, input.throttle);
      if (unsupported()) { d.phase = 'falling'; d.vy = 0; d.tip = 0; }
    } else if (d.phase === 'falling') {
      d.vy -= 20 * dt;
      van.position.addScaledVector(fwd, d.speed * dt * .4);
      van.position.y += d.vy * dt;
      d.tip = Math.min(1.3, d.tip + dt * 1.6);
      van.rotation.set(0, d.yaw, -d.tip);
      const t = getTerrain();
      const [i, j, k] = t.cellOf(van.position.x, van.position.y - .1, van.position.z);
      if (van.position.y < -1 && t.solidCell(i, j, k)) {
        d.phase = 'wreck'; d.wait = 25;
        onCrash(van.position.clone(), d.cargo, -d.vy);
        d.cargo = null;
      }
    }
  }

  function update(dt, input) {
    for (const o of S.orders) o.eta -= dt;
    if (trip && (trip.phase === 'stolen' || trip.phase === 'falling')) { drive(dt, input || { throttle: 0, steer: 0 }); return; }
    if (trip && trip.phase === 'wreck') {
      trip.wait -= dt;
      if (trip.wait <= 0 || S.orders.some(o => o.eta <= 0)) { trip = null; van.visible = false; van.rotation.set(0, 0, 0); van.position.y = 0; }
      return;
    }
    if (!trip) {
      const due = S.orders.filter(o => o.eta <= 0);
      if (due.length) {
        const store = due[0].store;
        const cargo = due.filter(o => o.store === store);
        S.orders = S.orders.filter(o => !cargo.includes(o));
        trip = { phase: 'in', x: -110, store, cargo, wait: 0 };
        paint(store);
        van.visible = true;
      }
    }
    if (!trip) return;
    let speed = 0;
    if (trip.phase === 'in') {
      const left = STOP_X - trip.x;
      speed = Math.min(16, 1 + left * 0.9);
      trip.x += speed * dt;
      if (left < 0.05) { trip.phase = 'stop'; trip.wait = 6; }
    } else if (trip.phase === 'stop') {
      trip.wait -= dt;
      if (trip.wait < 5 && trip.cargo) {
        for (const o of trip.cargo) S.parcels.push({ store: o.store, item: o.item, fake: o.fake });
        onArrive(trip.cargo);
        trip.cargo = null;
        sync();
      }
      if (trip.wait <= 0) trip.phase = 'out';
    } else {
      trip.x += Math.min(18, (trip.x - STOP_X + 1) * 2) * dt;
      speed = 10;
      if (trip.x > 120) { trip = null; van.visible = false; return; }
    }
    van.position.set(trip.x, Math.sin(trip.x * 3) * .015, ROAD_Z);
    van.rotation.set(0, 0, 0);
    trip.speed = speed;
    juice(dt, speed);
  }

  return {
    update,
    get state() { return S; },
    load(s) { S = { orders: s?.orders || [], parcels: s?.parcels || [] }; sync(); },
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
    get busy() { return !!trip; },
    van,
    get driving() { return trip && (trip.phase === 'stolen' || trip.phase === 'falling') ? trip.phase : null; },
    // good timing: parked, or crawling in
    canSteal(p) {
      if (!trip || !van.visible) return false;
      if (!['in', 'stop', 'out', 'stolen'].includes(trip.phase)) return false;
      return Math.hypot(p.x - van.position.x, p.z - van.position.z) < 3.6;
    },
    steal() { if (trip.phase !== 'stolen') { trip.phase = 'stolen'; trip.yaw = 0; } trip.speed = Math.min(trip.speed || 0, 6); },
    park() { if (trip) trip.speed = 0; },
    // point the stolen van (tests, and a nudge if it ever gets stuck)
    aim(yaw) { if (trip) trip.yaw = yaw; },
    // where the driver's eye sits, in world space
    seat(out) { return out.set(1.7, 1.42, .35).applyEuler(van.rotation).add(van.position); },
    get yaw() { return trip ? trip.yaw : 0; },
    set onCrash(f) { onCrash = f; },
    set onArrive(f) { onArrive = f; },
  };
}
