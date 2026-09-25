// elevator.js, a site lift in the corner of the plot: a timber headframe with a pulley,
// a cable and a cage that rides the shaft. It carries whoever stands in it.
import * as THREE from 'three';
import { S } from './terrain.js';

// the shaft: 3 x 3 voxels in the corner nearest the gate and the crate
const I0 = 1, K0 = 1, W = 3;

export function createElevator({ scene, terrain, colliders, interactables, label }) {
  const x0 = terrain.X0 + I0 * S, z0 = terrain.Z0 + K0 * S, size = W * S;
  const cx = x0 + size / 2, cz = z0 + size / 2;
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd9a125 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: .7, roughness: .4 });

  // headframe
  const H = 4.2;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.12, H, .12), wood);
    leg.position.set(cx + dx * (size / 2 + .08), H / 2, cz + dz * (size / 2 + .08));
    g.add(leg);
  }
  for (const y of [H, 1.2]) for (const [w, d, ox, oz] of [[size + .3, .1, 0, -(size / 2 + .08)], [size + .3, .1, 0, size / 2 + .08], [.1, size + .3, -(size / 2 + .08), 0], [.1, size + .3, size / 2 + .08, 0]]) {
    if (y === 1.2 && oz > 0) continue;   // leave the front open to step in
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, .1, d), wood);
    b.position.set(cx + ox, y, cz + oz);
    g.add(b);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.38, .05, 8, 24), gold);
  wheel.position.set(cx, H + .35, cz);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, size + .3, 8), steel);
  axle.rotation.z = Math.PI / 2; axle.position.copy(wheel.position);
  g.add(wheel, axle);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .32), new THREE.MeshBasicMaterial({ map: label('ascenseur', { color: '#ffd75e', bg: '#1a130c', size: 90 }), side: THREE.DoubleSide }));
  sign.position.set(cx, H - .4, cz + size / 2 + .16);
  g.add(sign);

  // the cage
  const cage = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size - .06, .1, size - .06), new THREE.MeshLambertMaterial({ color: 0x4a4a4e }));
  floor.position.y = -.05;
  cage.add(floor);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.3, .05), gold);
    post.position.set(dx * (size / 2 - .06), 1.15, dz * (size / 2 - .06));
    cage.add(post);
  }
  for (const y of [1, 2.3]) for (const [w, d, ox, oz] of [[size - .06, .04, 0, -(size / 2 - .06)], [.04, size - .06, -(size / 2 - .06), 0], [.04, size - .06, size / 2 - .06, 0]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, .04, d), gold);
    r.position.set(ox, y, oz);
    cage.add(r);
  }
  const bulb = new THREE.PointLight(0xffe2b0, 3, 6, 1.4);
  bulb.position.y = 2.1;
  cage.add(bulb);
  cage.position.set(cx, 0, cz);
  g.add(cage);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1, 5), steel);
  g.add(cable);

  const floorBox = { min: new THREE.Vector3(x0 + .03, -1, z0 + .03), max: new THREE.Vector3(x0 + size - .03, 0, z0 + size - .03), off: true };
  colliders.push(floorBox);
  const spot = { id: 'lift', pos: new THREE.Vector3(cx, 1, cz), off: true, column: { x: cx, z: cz, r: 2.2 } };
  interactables.push(spot);

  let owned = false, y = 0, target = null;
  const SPEED = 9;

  return {
    center: new THREE.Vector3(cx, 0, cz),
    get owned() { return owned; },
    get y() { return y; },
    get moving() { return target !== null; },
    // the shaft down to `depth`, carved at any hardness (the caller syncs it for other players)
    shaftBox(depth) {
      const jBottom = Math.max(1, terrain.NY - 1 - Math.floor(depth / S));
      return { i: I0, j: jBottom, k: K0, w: W, h: terrain.NY - jBottom, d: W };
    },
    setOwned(v) { owned = v; g.visible = v; floorBox.off = !v; spot.off = !v; },
    // is this body standing in the cage?
    holds(p) { return p.x > x0 && p.x < x0 + size && p.z > z0 && p.z < z0 + size && Math.abs(p.y - y) < .6; },
    near(p) { return Math.hypot(p.x - cx, p.z - cz) < 2.2; },
    goTo(ty) { target = ty; },
    update(dt, player) {
      if (!owned) return;
      if (target !== null) {
        const dir = Math.sign(target - y);
        const step = Math.min(Math.abs(target - y), SPEED * dt);
        const carry = this.holds(player.pos);
        y += dir * step;
        if (carry) { player.pos.y = y + .002; player.vel.y = 0; }
        wheel.rotation.z += dir * step / .38;
        if (Math.abs(target - y) < 1e-3) { y = target; target = null; }
      }
      cage.position.y = y;
      floorBox.min.y = y - .1; floorBox.max.y = y;
      spot.pos.y = y + 1;
      cable.scale.y = Math.max(.01, H + .35 - y - 2.3);
      cable.position.set(cx, (H + .35 + y + 2.3) / 2, cz);
    },
  };
}
