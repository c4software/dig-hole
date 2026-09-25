// merge.js, static decor drawn in a handful of calls: every plain mesh under a group is
// baked into world space and merged with the others that share its material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root, keep = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || keep(o)) return;
    // only meshes whose ancestors up to the root are all plain groups
    for (let p = o.parent; p && p !== root; p = p.parent) if (keep(p)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  return victims.length;
}
