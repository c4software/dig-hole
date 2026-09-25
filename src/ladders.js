// ladders.js, wooden ladders you set against a wall of the hole and climb.
// Each one is 4.4 m; stand on one to set the next higher up.
import * as THREE from 'three';

export const LADDER_H = 4.4;
const wood = new THREE.MeshStandardMaterial({ color: 0xb07a48, roughness: .85 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: .9 });

function build(h) {
  const g = new THREE.Group();
  for (const x of [-.22, .22]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.055, h, .055), wood);
    rail.position.set(x, h / 2, 0);
    g.add(rail);
  }
  for (let y = .25; y < h; y += .32) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .44, 6), woodDark);
    rung.rotation.z = Math.PI / 2; rung.position.set(0, y, 0);
    g.add(rung);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function createLadders(scene) {
  const list = [];
  const inv = new THREE.Vector3();
  const box = new THREE.Box3(), ray = new THREE.Ray(), hitP = new THREE.Vector3();

  function add(l) {
    if (list.some(o => o.id === l.id)) return;
    const mesh = build(l.h);
    mesh.position.fromArray(l.p);
    mesh.rotation.y = l.yaw;
    scene.add(mesh);
    list.push({ ...l, mesh });
  }
  function remove(id) {
    const n = list.findIndex(o => o.id === id);
    if (n < 0) return null;
    scene.remove(list[n].mesh);
    return list.splice(n, 1)[0];
  }
  // the ladder a body is on, if any: in front of the rungs, between the rails
  function climbable(p, w) {
    for (const l of list) {
      if (l.w !== w) continue;
      inv.set(p.x - l.p[0], p.y - l.p[1], p.z - l.p[2]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -l.yaw);
      if (Math.abs(inv.x) < .45 && inv.z > -.2 && inv.z < .75 && inv.y > -.3 && inv.y < l.h + .1) return l;
    }
    return null;
  }
  function hitTest(origin, dir, far, w) {
    ray.set(origin, dir);
    let best = null, bt = far;
    for (const l of list) {
      if (l.w !== w) continue;
      box.setFromObject(l.mesh).expandByScalar(.05);
      if (!ray.intersectBox(box, hitP)) continue;
      const t = hitP.distanceTo(origin);
      if (t < bt) { bt = t; best = l; }
    }
    return best ? { ladder: best, t: bt } : null;
  }
  return {
    list, add, remove, climbable, hitTest,
    save: () => list.map(({ id, w, p, yaw, h }) => ({ id, w, p, yaw, h })),
    load(arr) { for (const l of arr || []) add(l); },
    clear() { for (const l of list) scene.remove(l.mesh); list.length = 0; },
  };
}
