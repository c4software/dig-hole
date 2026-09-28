// plane.js, now and then an old bomber crosses the sky over the garden and empties
// its bay on the plot. Bad for the lawn, good for the hole. Stay in the house.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { tun } from './tunables.js';

const ALT = 42, SPEED = 34;

// an old four-engined bomber, chunky and friendly-looking: a turned fuselage with a glazed
// nose, tapered wings, cowled engines with three-bladed props, blinking wingtip lights
const planeGeo = (pts, depth, bevel) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
function makePlane() {
  const g = new THREE.Group();
  const olive = V.mat(0x5d6a40, { roughness: .6 }), belly = V.mat(0x9aa6a0, { roughness: .6 }), dark = V.TRIM(), gold = V.mat(0xd9a125, { metalness: .5, roughness: .35 });
  const cream = V.mat(0xf0e8d6, { roughness: .5 }), glassM = V.glass(false);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  // the model flies along +x: the fuselage is turned on a lathe, then laid along x
  const prof = [[0, -6.3], [.28, -6.2], [.42, -5.2], [.62, -3.2], [.86, -1], [.95, 1.5], [.92, 3.8], [.82, 5], [.6, 5.8], [0, 6.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 20); fus.rotateZ(-Math.PI / 2);
  add(fus, olive);
  // grey belly: the same hull, a touch wider, cut to its lower half
  const bl = new THREE.LatheGeometry(prof.map(v => new THREE.Vector2(v.x * 1.01, v.y)), 20, 0, Math.PI); bl.rotateZ(-Math.PI / 2);
  add(bl, belly);
  const nose = add(new THREE.SphereGeometry(.84, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassM, 4.95, 0, 0); nose.rotation.z = -Math.PI / 2; nose.scale.set(1, 1.35, 1);
  for (const k of [.3, .7]) { const r = add(new THREE.TorusGeometry(.84 * Math.sin(Math.acos(k)) + .01, .035, 6, 22), dark, 4.95 + k * 1.1, 0, 0); r.rotation.y = Math.PI / 2; }
  // the cockpit canopy and a dorsal turret
  const can = add(new THREE.CapsuleGeometry(.48, 1.1, 6, 14), glassM, 3.5, .72, 0); can.rotation.z = Math.PI / 2; can.scale.set(1, 1, .9);
  add(new THREE.SphereGeometry(.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glassM, .6, .88, 0);
  // wings, tailplane and fin: flat outlines, extruded and bevelled
  const wing = add(planeGeo([[2.6, 0], [1.6, 10], [1.2, 10.3], [.6, 10.3], [.2, 10], [-.8, 0], [.2, -10], [.6, -10.3], [1.2, -10.3], [1.6, -10]], .18, .08), olive, 0, -.05, 0);
  wing.geometry.rotateX(-Math.PI / 2);
  const tail = add(planeGeo([[-4.3, 0], [-5.4, 3.4], [-5.8, 3.55], [-6.3, 3.4], [-6.6, 0], [-6.3, -3.4], [-5.8, -3.55], [-5.4, -3.4]], .1, .05), olive, 0, .35, 0);
  tail.geometry.rotateX(-Math.PI / 2);
  add(planeGeo([[-6.5, .3], [-4.2, .3], [-5.4, 2.4], [-6.1, 3], [-6.6, 2.8]], .12, .06), olive, 0, 0, 0);
  // roundels on the wings, a gold band and a white letter code on the fin
  const roundel = new THREE.MeshBasicMaterial({ map: V.paintTex(128, 128, (c, w) => { for (const [r, col] of [[62, '#15121c'], [56, '#f0e8d6'], [42, '#c4302a'], [26, '#f0e8d6'], [14, '#2f5bff']]) { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2, r, 0, 7); c.fill(); } }), transparent: true });
  // on top, and underneath where the garden sees them
  for (const z of [-7, 7]) for (const s of [-1, 1]) { const r = add(new THREE.CircleGeometry(.85, 24), roundel, 1.2, s > 0 ? .1 : -.21, z); r.rotation.x = -s * Math.PI / 2; }
  const band = add(new THREE.CylinderGeometry(.9, .9, .5, 20), gold, -3, 0, 0); band.rotation.z = Math.PI / 2;
  const code = new THREE.MeshBasicMaterial({ map: V.paintTex(256, 128, (c, w, h) => { c.fillStyle = '#f0e8d6'; c.font = '900 84px Rubik, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AH-1', w / 2, h / 2); }), transparent: true });
  for (const s of [-1, 1]) { const t = add(new THREE.PlaneGeometry(1.1, .55), code, -5.6, 1.25, s * .13); if (s < 0) t.rotation.y = Math.PI; }
  // the bomb bay, closed until it opens
  add(V.roundBox(2.6, .06, .9, .03), dark, .5, -.88, 0);
  // four engines: nacelle, cowl ring, spinner, three blades
  const props = [];
  const nac = new THREE.LatheGeometry([[0, -1.3], [.3, -1.1], [.44, -.2], [.46, .7], [.4, .95], [0, .95]].map(([r, y]) => new THREE.Vector2(r, y)), 14); nac.rotateZ(-Math.PI / 2);
  for (const z of [-4.5, -2.2, 2.2, 4.5]) {
    add(nac, olive, 1.8, -.05, z);
    const cowl = add(new THREE.TorusGeometry(.42, .07, 8, 18), dark, 2.75, -.05, z); cowl.rotation.y = Math.PI / 2;
    const prop = new THREE.Group(); prop.position.set(2.85, -.05, z); g.add(prop);
    const spin = new THREE.Mesh(new THREE.ConeGeometry(.2, .45, 12), cream); spin.rotation.z = -Math.PI / 2; spin.position.x = .18; prop.add(spin);
    for (let b = 0; b < 3; b++) {
      const bl = new THREE.Mesh(V.roundBox(.05, 1.25, .2, .025), dark); bl.position.y = .66; bl.rotation.y = .35;
      const arm = new THREE.Group(); arm.rotation.x = b * Math.PI * 2 / 3; arm.add(bl); prop.add(arm);
      const tip = new THREE.Mesh(V.roundBox(.06, .14, .21, .02), gold); tip.position.y = 1.22; tip.rotation.y = .35; arm.add(tip);
    }
    props.push(prop);
  }
  // navigation lights: red to port, green to starboard, white on the tail
  const blink = [];
  for (const [z, col] of [[-10.1, 0xff2a1e], [10.1, 0x2aff6a]]) blink.push(add(new THREE.SphereGeometry(.14, 8, 6), V.lamp(col, 3), .55, -.02, z));
  blink.push(add(new THREE.SphereGeometry(.1, 8, 6), V.lamp(0xffffff, 3), -6.6, 2.85, 0));
  g.userData.props = props; g.userData.blink = blink;
  return g;
}

function makeBomb() {
  const g = new THREE.Group();
  const m = V.mat(0x4a5238, { metalness: .4, roughness: .5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .6, 6, 12), m);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.225, .225, .08, 12), V.mat(0xffc81e)); band.position.y = -.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 14), m); ring.rotation.x = Math.PI / 2; ring.position.y = .62;
  const fins = new THREE.Mesh(V.roundBox(.52, .3, .03, .012), m);
  fins.position.y = .52;
  const fins2 = fins.clone(); fins2.rotation.y = Math.PI / 2;
  g.add(body, band, ring, fins, fins2);
  return g;
}

export function createPlane({ scene, getTerrain, onWarn, onBomb, onEnd, onCrash, audio }) {
  const plane = makePlane();
  plane.visible = false;
  scene.add(plane);
  const falling = [];
  // shot down: black smoke from the engines, fire, a spiral to the ground
  const smoke = V.createPuffs(scene, 60, 0x2a2624), fire = V.createPuffs(scene, 30, 0xff7a1a);
  let run = null;
  // raids are rare, and always announced well before: never a boom out of nowhere
  let next = 480 + Math.random() * 240, warned = false;   // first raid after 8 to 12 minutes
  // the host may space raids out or bring them closer (tunables.js), or call one in
  let every = tun.get('raidEvery'), forced = false;
  tun.on(() => { const k = tun.get('raidEvery'); if (k === every) return; if (!warned && !run) next = Math.max(13, next * k / every); every = k; });

  const solidAt = (p) => { const t = getTerrain(); const [i, j, k] = t.cellOf(p.x, p.y, p.z); return t.solidCell(i, j, k); };

  function launch() {
    // a straight pass over the plot, from a random side
    const a = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - .5) * 6);
    const start = dir.clone().multiplyScalar(-190).add(off).setY(ALT);
    run = { dir, pos: start, t: 0, drop: 0, dropped: 0 };
    plane.position.copy(start);
    plane.rotation.set(0, -a, 0);
    plane.visible = true;
  }

  function update(dt, active, auto = true) {
    if (!run) {
      if (!active || (!auto && !forced)) return;
      next -= dt;
      if (!warned && next <= 12) { warned = true; onWarn?.(); }
      if (next <= 0) { next = (600 + Math.random() * 300) * every; warned = false; forced = false; launch(); }
    }
    smoke.update(dt); fire.update(dt);
    if (run && run.down != null) {
      // going down: nose dipping, rolling over, trailing smoke, until it hits the fields
      run.down += dt; run.vy -= 7 * dt;
      run.pos.addScaledVector(run.dir, SPEED * .8 * dt); run.pos.y += run.vy * dt;
      plane.position.copy(run.pos);
      plane.rotation.z = -Math.min(1.1, run.down * .35);
      plane.rotation.x += dt * .9;
      for (const p of plane.userData.props) p.rotation.x += dt * 10;
      if (Math.random() < .8) smoke.emit(plane.position, new THREE.Vector3((Math.random() - .5) * 2, 1, (Math.random() - .5) * 2), 3.5, 3);
      if (Math.random() < .5) fire.emit(plane.position, new THREE.Vector3(0, 1.5, 0), 2, .5);
      if (run.pos.y < 1) { onCrash?.(run.pos.clone()); run = null; plane.visible = false; audio?.setPlane(0); }
    } else if (run) {
      run.t += dt;
      run.pos.addScaledVector(run.dir, SPEED * dt);
      plane.position.copy(run.pos);
      plane.position.y += Math.sin(run.t * .8) * .4;
      plane.rotation.x = Math.sin(run.t * .6) * .04;
      for (const p of plane.userData.props) p.rotation.x += dt * 40;
      plane.userData.blink.forEach((b, i) => { b.visible = (run.t * 1.4 + i * .5) % 1 < .35; });
      plane.rotation.z = Math.sin(run.t * .45) * .02;
      const dist = Math.hypot(run.pos.x, run.pos.z);
      // over the plot: open the bay, a bomb every 0.3 s
      run.drop -= dt;
      if (Math.abs(run.pos.x) < 9 && Math.abs(run.pos.z) < 9 && run.drop <= 0 && run.dropped < tun.get('raidBombs')) {
        run.drop = .3;
        run.dropped++;
        const b = makeBomb();
        b.position.copy(run.pos).add(new THREE.Vector3(0, -1.2, 0));
        scene.add(b);
        const v = run.dir.clone().multiplyScalar(3);
        falling.push({ mesh: b, v, whistle: false, pos: b.position, vel: v, size: 0 });
      }
      audio?.setPlane(Math.max(0, 1 - dist / 170));
      if (dist > 200 && run.t > 5) { run = null; plane.visible = false; audio?.setPlane(0); onEnd?.(); }
    }
    for (let n = falling.length - 1; n >= 0; n--) {
      const f = falling[n];
      f.v.y -= 16 * dt;
      f.v.x *= 1 - dt * .6; f.v.z *= 1 - dt * .6;
      f.mesh.position.addScaledVector(f.v, dt);
      // nose down along the fall
      f.mesh.lookAt(f.mesh.position.clone().add(f.v));
      f.mesh.rotateX(-Math.PI / 2);
      if (!f.whistle && f.mesh.position.y < 25) { f.whistle = true; audio?.whistle(); }
      if (solidAt(f.mesh.position) || f.mesh.position.y < -120) {
        scene.remove(f.mesh);
        falling.splice(n, 1);
        onBomb?.(f.mesh.position.clone());
      }
    }
  }

  return {
    update,
    get active() { return !!run || falling.length > 0; },
    falling,
    // does a point touch the bomber: its fuselage, its wings or its tail (in the plane's own frame)?
    hitTest(p) {
      if (!run || run.down != null) return false;
      const l = plane.worldToLocal(p.clone());
      if (l.x > -6.8 && l.x < 6.6 && Math.hypot(l.y, l.z) < 1.4) return true;
      if (Math.abs(l.y) < .8 && l.x > -1.3 && l.x < 3.1 && Math.abs(l.z) < 10.8) return true;
      return l.x < -4.5 && l.x > -7 && Math.abs(l.z) < 4 && l.y > -.6 && l.y < 3;
    },
    shootDown() { if (run && run.down == null) { run.down = 0; run.vy = 0; run.dropped = 99; audio?.boom?.(.5); } },
    trigger() { if (!run) { onWarn?.(); launch(); } },
    // called in by the host: announced, then over the garden in 12 s
    raid() { if (run) return; forced = true; if (next > 12.5) { next = 12.5; warned = false; } },
  };
}
