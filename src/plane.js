// plane.js, now and then an old bomber crosses the sky over the garden and empties
// its bay on the plot. Bad for the lawn, good for the hole. Stay in the house.
import * as THREE from 'three';

const ALT = 42, SPEED = 34;

function makePlane() {
  const g = new THREE.Group();
  const olive = new THREE.MeshLambertMaterial({ color: 0x4f5a3a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2f22 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd9a125 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9cc0ee, emissive: 0x2a3a4a });
  // the model flies along +x
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.9, .6, 12, 12), olive);
  body.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.9, 12, 8), glass);
  nose.position.x = 6; nose.scale.x = 1.3;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, .18, 20), olive);
  wing.position.set(.8, .1, 0);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, .14, 6), olive);
  tailWing.position.set(-5.4, .3, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, .16), olive);
  fin.position.set(-5.4, 1.4, 0);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(.92, .92, .5, 12), gold);
  stripe.rotation.z = Math.PI / 2; stripe.position.x = -3;
  g.add(body, nose, wing, tailWing, fin, stripe);
  const props = [];
  for (const z of [-4.5, -2.2, 2.2, 4.5]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(.45, .4, 1.8, 10), dark);
    eng.rotation.z = Math.PI / 2; eng.position.set(1.8, -.1, z);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.6, .18), dark);
    prop.position.set(2.75, -.1, z);
    g.add(eng, prop);
    props.push(prop);
  }
  for (const z of [-7, 7]) {
    const roundel = new THREE.Mesh(new THREE.CircleGeometry(.7, 16), gold);
    roundel.rotation.x = -Math.PI / 2; roundel.position.set(.8, .2, z);
    g.add(roundel);
  }
  g.userData.props = props;
  return g;
}

function makeBomb() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3f33, metalness: .5, roughness: .6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .6, 4, 10), m);
  const fins = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, .04), m);
  fins.position.y = .55;
  const fins2 = fins.clone(); fins2.rotation.y = Math.PI / 2;
  g.add(body, fins, fins2);
  return g;
}

export function createPlane({ scene, getTerrain, onWarn, onBomb, onEnd, audio }) {
  const plane = makePlane();
  plane.visible = false;
  scene.add(plane);
  const falling = [];
  let run = null;
  let next = 150 + Math.random() * 120;   // first raid after a few minutes

  const solidAt = (p) => { const t = getTerrain(); const [i, j, k] = t.cellOf(p.x, p.y, p.z); return t.solidCell(i, j, k); };

  function launch() {
    // a straight pass over the plot, from a random side
    const a = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - .5) * 6);
    const start = dir.clone().multiplyScalar(-190).add(off).setY(ALT);
    run = { dir, pos: start, t: 0, drop: 0, dropped: 0, warned: false };
    plane.position.copy(start);
    plane.rotation.set(0, -a, 0);
    plane.visible = true;
  }

  function update(dt, active) {
    if (!run) {
      if (!active) return;
      next -= dt;
      if (next <= 0) { next = 180 + Math.random() * 180; launch(); }
    }
    if (run) {
      run.t += dt;
      run.pos.addScaledVector(run.dir, SPEED * dt);
      plane.position.copy(run.pos);
      plane.position.y += Math.sin(run.t * .8) * .4;
      plane.rotation.x = Math.sin(run.t * .6) * .04;
      for (const p of plane.userData.props) p.rotation.x += dt * 40;
      const dist = Math.hypot(run.pos.x, run.pos.z);
      if (!run.warned && dist < 150) { run.warned = true; onWarn?.(); }
      // over the plot: open the bay, a bomb every 0.3 s
      run.drop -= dt;
      if (Math.abs(run.pos.x) < 9 && Math.abs(run.pos.z) < 9 && run.drop <= 0 && run.dropped < 10) {
        run.drop = .3;
        run.dropped++;
        const b = makeBomb();
        b.position.copy(run.pos).add(new THREE.Vector3(0, -1.2, 0));
        scene.add(b);
        falling.push({ mesh: b, v: run.dir.clone().multiplyScalar(3), whistle: false });
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
    trigger() { if (!run) launch(); },
  };
}
