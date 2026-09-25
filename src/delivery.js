// delivery.js, online orders: a lane in front of the house, a little van that pulls up,
// and parcels left on the doorstep until you open them.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';

// parody shops. Prices are multiplied, eta in seconds, fake = chance of a counterfeit.
export const STORES = {
  amazone:    { name: 'amazone',     sub: 'livraison express', mult: 1,    eta: 20, fake: 0,   van: 0x1d2530, stripe: 0xffb23a, text: '#ffb23a' },
  aliexpresso: { name: 'aliexpresso', sub: 'pas cher, pas vite', mult: 0.55, eta: 70, fake: 0.2, van: 0xc4332b, text: '#ffffff', stripe: 0xffffff },
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

  // the van: a box with a cab, four wheels, a painted name on each side
  const van = new THREE.Group();
  const bodyMat = std(0xffffff), stripeMat = std(0xffffff);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.7, 1.7), bodyMat);
  body.position.set(-.3, 1.25, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 1.65), bodyMat);
  cab.position.set(1.8, 1.05, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(.05, .55, 1.4), new THREE.MeshLambertMaterial({ color: 0x9cc0ee, emissive: 0x2a3a4a, transparent: true, opacity: .22, depthWrite: false }));
  glass.position.set(2.36, 1.35, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.35, .12, 1.72), stripeMat);
  stripe.position.set(.25, .62, 0);
  van.add(body, cab, glass, stripe);
  const wheels = [];
  for (const [x, z] of [[-1.2, .8], [1.6, .8], [-1.2, -.8], [1.6, -.8]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .25, 14), std(0x151515));
    w.rotation.x = Math.PI / 2; w.position.set(x, .36, z);
    van.add(w); wheels.push(w);
  }
  const lights = new THREE.Mesh(new THREE.BoxGeometry(.05, .14, 1.3), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  lights.position.set(2.37, .75, 0);
  van.add(lights);
  const sideMats = [new THREE.MeshBasicMaterial({ transparent: true }), new THREE.MeshBasicMaterial({ transparent: true })];
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .8), sideMats[0]);
  sideL.position.set(-.3, 1.35, .86);
  const sideR = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .8), sideMats[1]);
  sideR.position.set(-.3, 1.35, -.86); sideR.rotation.y = Math.PI;
  van.add(sideL, sideR);
  van.visible = false;
  van.position.set(-120, 0, ROAD_Z);
  scene.add(van);
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
  let rounds = 25;   // seconds until the van's next pass
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
      wheels.forEach(w => { w.rotation.y -= d.speed * dt / .36; });
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
    // the van also does its rounds for the neighbours, orders or not
    if (!trip && !S.orders.some(o => o.eta <= 0)) {
      rounds -= dt;
      if (rounds <= 0) {
        rounds = 55 + Math.random() * 35;
        const store = Math.random() < .5 ? 'amazone' : 'aliexpresso';
        trip = { phase: 'in', x: -110, store, cargo: [], wait: 0, speed: 0 };
        paint(store);
        van.visible = true;
      }
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
    wheels.forEach(w => { w.rotation.y -= speed * dt / .36; });
  }

  return {
    update,
    get state() { return S; },
    load(s) { S = { orders: s?.orders || [], parcels: s?.parcels || [] }; sync(); },
    order(store, item, count) {
      const st = STORES[store];
      for (let n = 0; n < count; n++) S.orders.push({ store, item, eta: st.eta, fake: Math.random() < st.fake });
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
