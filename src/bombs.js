// bombs.js, things you throw: they bounce on the voxels, fizz, and go off.
// The caller decides what an explosion does to the ground; this only flies and flashes.
import * as THREE from 'three';

export const BLAST = {
  dyn:  { r: 1.7, fuse: 2.0, dmg: 25, push: 9 },
  sup:  { r: 2.9, fuse: 2.4, dmg: 40, push: 15 },
  fus:  { r: 0.9, fuse: 1.0, dmg: 10, push: 4 },    // the drill rocket bores a shaft instead
  shell: { r: 2.3, fuse: 0, dmg: 45, push: 13 },    // an old buried shell
  air:   { r: 2.4, fuse: 0, dmg: 40, push: 14 },    // dropped by the bomber
  met:   { r: 4.2, fuse: 2.6, dmg: 50, push: 18 },   // a pocket meteor, made on the moon
};

function makeBomb(kind) {
  const g = new THREE.Group();
  if (kind === 'dyn') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .32, 10), new THREE.MeshLambertMaterial({ color: 0xc4202a }));
    stick.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .05, 10), new THREE.MeshLambertMaterial({ color: 0xf0e8d6 }));
    band.rotation.z = Math.PI / 2;
    g.add(stick, band);
  } else if (kind === 'sup') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: .6, roughness: .35 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.17, .02, 6, 20), new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .3 }));
    ring.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .06, 8), new THREE.MeshLambertMaterial({ color: 0xd9a125 }));
    cap.position.y = .18;
    g.add(ball, ring, cap);
  } else if (kind === 'met') {
    // a lump of dark iron with glowing cracks
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.2, 0), new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: .9, flatShading: true }));
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(.17, 0), new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }));
    glow.rotation.set(.4, .7, 0);
    g.add(glow, rock);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .45, 10), new THREE.MeshLambertMaterial({ color: 0xc4202a }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.07, .18, 10), new THREE.MeshLambertMaterial({ color: 0xd9a125 }));
    nose.position.y = -.31; nose.rotation.x = Math.PI;
    g.add(body, nose);
  }
  const spark = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd75e }));
  spark.position.set(kind === 'dyn' ? .17 : 0, kind === 'sup' ? .22 : kind === 'fus' ? .25 : 0, 0);
  g.add(spark);
  g.userData.spark = spark;
  return g;
}

export function createBombs(scene, getTerrain, onExplode) {
  const live = [];
  const flash = new THREE.PointLight(0xffb060, 0, 14, 1.2);
  scene.add(flash);
  let flashT = 0;
  // an expanding glow ball for the blast itself
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, depthWrite: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), ballMat);
  ball.visible = false;
  scene.add(ball);
  let ballT = 1, ballR = 1;

  const solidAt = (x, y, z) => { const t = getTerrain(); const [i, j, k] = t.cellOf(x, y, z); return t.solidCell(i, j, k); };

  function throwBomb(kind, origin, dir, inherit) {
    const mesh = makeBomb(kind);
    mesh.position.copy(origin);
    scene.add(mesh);
    const v = kind === 'fus'
      ? new THREE.Vector3(0, -4, 0)                                   // the drill goes straight down
      : dir.clone().multiplyScalar(8).add(new THREE.Vector3(0, 2.5, 0)).add(inherit.clone().multiplyScalar(.5));
    live.push({ kind, mesh, v, fuse: BLAST[kind].fuse, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), pos: mesh.position, vel: v, size: 0 });
  }

  function boom(kind, pos) {
    const b = BLAST[kind];
    flash.position.copy(pos); flash.intensity = 60 * b.r; flashT = 0.35;
    ball.position.copy(pos); ball.visible = true; ballT = 0; ballR = b.r;
    onExplode(kind, pos.clone());
  }

  function update(dt) {
    for (let n = live.length - 1; n >= 0; n--) {
      const b = live[n];
      b.fuse -= dt;
      b.v.y -= (b.kind === 'fus' ? 6 : 18) * dt;
      const p = b.mesh.position;
      // per-axis move with a bounce off whatever cell we'd enter
      for (const a of ['x', 'y', 'z']) {
        const old = p[a];
        p[a] += b.v[a] * dt;
        if (solidAt(p.x, p.y, p.z)) {
          p[a] = old;
          if (b.kind === 'fus' && a === 'y') { b.fuse = 0; }
          b.v[a] *= a === 'y' ? -.3 : -.4;
          if (a === 'y') { b.v.x *= .7; b.v.z *= .7; }
        }
      }
      if (b.kind !== 'fus') { b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; }
      b.mesh.userData.spark.visible = Math.random() > .3;
      b.mesh.userData.spark.scale.setScalar(.7 + Math.random() * .8);
      if (b.fuse <= 0) {
        scene.remove(b.mesh);
        live.splice(n, 1);
        boom(b.kind, p);
      }
    }
    if (flashT > 0) { flashT -= dt; flash.intensity *= Math.pow(0.001, dt); if (flashT <= 0) flash.intensity = 0; }
    if (ballT < 1) {
      ballT += dt / 0.45;
      ball.scale.setScalar(ballR * (0.3 + ballT * 0.9));
      ballMat.opacity = Math.max(0, 0.75 * (1 - ballT));
      if (ballT >= 1) ball.visible = false;
    }
  }

  return { throwBomb, boom, update, live, get count() { return live.length; } };
}
