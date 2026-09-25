// tool.js, the shovel in your hands, the dirt that flies off it, and the thing at the bottom.
import * as THREE from 'three';

// blade colours per shovel level: rust, iron, steel, tungsten, diamond, gold
const BLADES = [0x8a5a3a, 0x9aa0a6, 0xc9ced4, 0x5c6470, 0x8ff0ff, 0xffd75e];

export function createShovel(camera) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, depthTest: false, ...extra });
  // local frame: the grip sits at the origin, the shaft runs down -y to the blade
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.0, 8), mat(0x8a5f38));
  handle.position.y = -0.5;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), mat(0x6b4a2e));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.12, 8), mat(0x555555));
  collar.position.y = -1.02;
  // a slightly cupped blade: a bent plane with a pointed tip
  const bladeGeo = new THREE.PlaneGeometry(0.26, 0.32, 6, 4);
  const p = bladeGeo.attributes.position;
  for (let n = 0; n < p.count; n++) {
    const x = p.getX(n), y = p.getY(n);
    p.setZ(n, -x * x * 1.6);
    if (y < -0.06) p.setX(n, x * (1 - (-0.06 - y) * 2.4));
  }
  bladeGeo.computeVertexNormals();
  const bladeMat = new THREE.MeshStandardMaterial({ color: BLADES[0], metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide, depthTest: false });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = -1.22;
  pivot.add(handle, grip, collar, blade);
  pivot.traverse(o => { o.renderOrder = 999; });
  camera.add(root);

  // resting pose, built from an explicit basis: grip low right near the body,
  // blade out in front, its face turned up toward the eye
  const GRIP = new THREE.Vector3(0.46, -0.66, -0.12);
  const TIP = new THREE.Vector3(0.2, -0.34, -1.25);
  const yAxis = GRIP.clone().sub(TIP).normalize();
  const zAxis = new THREE.Vector3(0, 1, 0.35).addScaledVector(yAxis, -new THREE.Vector3(0, 1, 0.35).dot(yAxis)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
  const BASE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const qSwing = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);

  let swing = 0;         // 0 = idle, runs 0 → 1 per swing
  let swingDur = 0.4;
  let idleT = 0;
  let onImpact = () => {};
  let impacted = false;

  function start(duration) {
    if (swing > 0) return false;
    swing = 0.0001; swingDur = duration; impacted = false;
    return true;
  }
  function update(dt, moving) {
    idleT += dt;
    let lift = 0, px = 0, py = 0, pz = 0;
    if (swing > 0) {
      swing += dt / swingDur;
      const s = Math.min(swing, 1);
      // draw back and up, then drive forward and down, then settle
      const back = s < 0.35 ? Math.sin(s / 0.35 * Math.PI / 2) : Math.cos((s - 0.35) / 0.65 * Math.PI / 2);
      const stab = s < 0.35 ? 0 : Math.sin((s - 0.35) / 0.65 * Math.PI);
      lift = back * 0.4 - stab * 0.12;
      pz = back * 0.16 - stab * 0.38;
      py = back * 0.02 + stab * 0.1;
      px = -stab * 0.12;
      if (!impacted && s >= 0.55) { impacted = true; onImpact(); }
      if (swing >= 1) swing = 0;
    } else {
      py = Math.sin(idleT * 1.6) * 0.008 + (moving ? Math.abs(Math.sin(idleT * 7)) * 0.02 : 0);
    }
    qSwing.setFromAxisAngle(X, lift);
    pivot.quaternion.copy(BASE).multiply(qSwing);
    root.position.set(GRIP.x + px, GRIP.y + py, GRIP.z + pz);
  }
  return {
    root, start, update,
    get busy() { return swing > 0; },
    set onImpact(f) { onImpact = f; },
    setLevel(l) { bladeMat.color.setHex(BLADES[Math.min(l, BLADES.length - 1)]); bladeMat.emissive.setHex(l >= 4 ? BLADES[l] : 0); bladeMat.emissiveIntensity = l >= 4 ? 0.25 : 0; },
  };
}

// clods of earth, a small pool of instanced cubes
export function createDebris(scene) {
  const N = 260;
  const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const parts = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, s: 1 }));
  const col = new THREE.Color();
  const dm = new THREE.Object3D();
  let next = 0;
  for (let n = 0; n < N; n++) { dm.scale.setScalar(0); dm.updateMatrix(); mesh.setMatrixAt(n, dm.matrix); mesh.setColorAt(n, col.setRGB(1, 1, 1)); }
  scene.add(mesh);

  function burst(at, normal, color, count = 12, spread = 1) {
    for (let c = 0; c < count; c++) {
      const q = parts[next];
      mesh.setColorAt(next, col.setHex(color).multiplyScalar(0.75 + Math.random() * 0.4));
      next = (next + 1) % N;
      q.life = 0.7 + Math.random() * 0.6;
      q.p.copy(at).addScaledVector(normal, 0.05);
      q.v.set((Math.random() - .5) * 3, Math.random() * 2.5 + 1, (Math.random() - .5) * 3).multiplyScalar(spread).addScaledVector(normal, 2);
      q.r = Math.random() * 6;
      q.s = 0.6 + Math.random() * 0.9;
    }
    mesh.instanceColor.needsUpdate = true;
  }
  function update(dt) {
    for (let n = 0; n < N; n++) {
      const q = parts[n];
      if (q.life <= 0) continue;
      q.life -= dt;
      q.v.y -= 14 * dt;
      q.p.addScaledVector(q.v, dt);
      q.r += dt * 8;
      dm.position.copy(q.p);
      dm.rotation.set(q.r, q.r * .7, 0);
      dm.scale.setScalar(q.life > 0 ? q.s * Math.min(1, q.life * 3) : 0);
      dm.updateMatrix();
      mesh.setMatrixAt(n, dm.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { burst, update };
}

// the heart of the hole: a slow gold thing turning in the dark at 98 m
export function createHeart(scene, pos) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xd9a125, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.25, flatShading: true })
  );
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.85, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd75e, wireframe: true, transparent: true, opacity: 0.35 })
  );
  const light = new THREE.PointLight(0xffc860, 12, 7, 1.6);
  // once taken, the heart turns into a way through: a gold whirl
  const portal = new THREE.Group();
  for (let n = 0; n < 3; n++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + n * .25, .03, 6, 40), new THREE.MeshBasicMaterial({ color: n % 2 ? 0xffd75e : 0xd9a125, transparent: true, opacity: .7 - n * .15 }));
    portal.add(r);
  }
  portal.visible = false;
  g.add(core, shell, light, portal);
  g.position.copy(pos);
  scene.add(g);
  let t = 0;
  return {
    group: g, core,
    update(dt) {
      t += dt;
      core.rotation.set(t * 0.4, t * 0.6, 0);
      shell.rotation.set(-t * 0.2, t * 0.3, t * 0.1);
      g.position.y = pos.y + Math.sin(t * 1.2) * 0.12;
      light.intensity = 10 + Math.sin(t * 2.2) * 3;
      portal.children.forEach((r, n) => { r.rotation.set(t * (.6 + n * .3), t * (.4 - n * .2), n); });
    },
    setPortal(on) { portal.visible = on; },
  };
}

// the drill: a site power drill. Orange shell, grey motor with vents, pistol grip,
// a battery pack whose LEDs follow the charge, a headlight, and a spiral bit that
// glows red as it heats up.
const BITS = [0x9aa0a6, 0x9aa0a6, 0xc9ced4, 0x39c07a];
export function createDrill(camera) {
  const root = new THREE.Group();
  // a touch of self-light so the tool still reads at the bottom of the hole
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, depthTest: false, roughness: .5, metalness: .2, emissive: new THREE.Color(color).multiplyScalar(.28), ...extra });
  const orange = M(0xe8762a, { roughness: .4 }), grey = M(0x5a606a, { metalness: .4 }), rubber = M(0x2e3036, { roughness: .9 }), steel = M(0xb8bec6, { metalness: .8, roughness: .25 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); root.add(m); return m; };
  const along = Math.PI / 2;   // cylinders along z

  // shell: a rounded orange body with a grey motor housing at the back
  add(new THREE.CylinderGeometry(.062, .07, .24, 20), orange, 0, 0, -.05, along);
  add(new THREE.SphereGeometry(.07, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), grey, 0, 0, .07, -along);
  add(new THREE.CylinderGeometry(.07, .07, .08, 20), grey, 0, 0, .1, along);
  for (let n = 0; n < 4; n++) add(new THREE.TorusGeometry(.071, .006, 6, 20), rubber, 0, 0, .075 + n * .018);
  add(new THREE.BoxGeometry(.03, .012, .16), rubber, 0, .066, -.04);                     // top strip
  // headlight
  add(new THREE.CylinderGeometry(.018, .02, .03, 12), grey, 0, .07, -.15, along);
  const lens = add(new THREE.CircleGeometry(.015, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0, depthTest: false }), 0, .07, -.166, 0, Math.PI);
  // pistol grip, trigger, battery pack with charge LEDs
  add(new THREE.BoxGeometry(.05, .17, .065), rubber, 0, -.115, .045, -.28);
  add(new THREE.BoxGeometry(.018, .045, .02), orange, 0, -.06, -.005, -.3);
  add(new THREE.BoxGeometry(.11, .06, .14), grey, 0, -.215, .07);
  add(new THREE.BoxGeometry(.112, .012, .142), orange, 0, -.184, .07);
  const leds = [];
  for (let n = 0; n < 4; n++) leds.push(add(new THREE.BoxGeometry(.014, .008, .01), new THREE.MeshBasicMaterial({ color: 0x3a3020, depthTest: false }), -.03 + n * .02, -.2, -.001));
  // chuck with teeth
  add(new THREE.CylinderGeometry(.034, .05, .07, 16), grey, 0, 0, -.2, along);
  for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; add(new THREE.BoxGeometry(.008, .008, .06), steel, Math.cos(a) * .042, Math.sin(a) * .042, -.2, 0, 0, a); }
  // the bit: a tapered core wrapped in a double helix
  const bit = new THREE.Group();
  const bitMat = M(BITS[1], { metalness: .9, roughness: .22 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.006, .018, .3, 10), bitMat);
  core.rotation.x = along;
  bit.add(core);
  for (const phase of [0, Math.PI]) {
    const pts = Array.from({ length: 40 }, (_, n) => { const t = n / 39, a = t * Math.PI * 9 + phase, r = .03 * (1 - t) + .006; return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, .15 - t * .3); });
    bit.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .0075, 5), bitMat));
  }
  bit.position.z = -.38;
  root.add(bit);
  root.traverse(o => { o.renderOrder = 999; });

  const REST = new THREE.Vector3(.22, -.21, -.74);
  root.position.copy(REST);
  root.scale.setScalar(.82);
  root.rotation.set(.05, .12, 0);
  root.visible = false;
  camera.add(root);

  let spin = 0, t = 0, speed = 0, kick = 0;
  const hot = new THREE.Color(0xff4a10), bitBase = bitMat.emissive.clone();
  return {
    root,
    setLevel(l) { bitMat.color.setHex(BITS[Math.min(l, BITS.length - 1)]); },
    // running: trigger held; biting: chewing ground right now; heat 0..1; charge 0..1
    update(dt, running, biting, heat = 0, charge = 1) {
      t += dt;
      speed += ((running ? 48 : 0) - speed) * Math.min(1, dt * (running ? 6 : 2.5));   // spins up, winds down
      spin += speed * dt;
      bit.rotation.z = spin;
      if (biting) kick = .02;
      kick = Math.max(0, kick - dt * .12);
      const shake = running ? (biting ? .01 : .004) : 0;
      root.position.set(REST.x + (Math.random() - .5) * shake, REST.y + (Math.random() - .5) * shake + Math.sin(t * 1.6) * .005, REST.z + (running ? -.04 : 0) + kick);
      bitMat.emissive.copy(bitBase).lerp(hot, Math.min(1, Math.max(0, heat - .3) * 1.4));
      leds.forEach((l, n) => l.material.color.setHex(charge > n / 4 + .01 ? (charge < .25 ? 0xff5a3a : 0x7aff7a) : 0x2a2418));
      lens.material.color.setHex(running ? 0xffffff : 0xfff2c0);
    },
  };
}

// the blaster for the arena games: a paint gun or a laser, the same body in a new colour
export function createBlaster(camera) {
  const root = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, depthTest: false, ...extra });
  const bodyMat = mat(0x2a2e36);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3fa4, depthTest: false, toneMapped: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.42), bodyMat);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), mat(0x1a1c22));
  grip.position.set(0, -0.13, 0.12); grip.rotation.x = -0.25;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), mat(0x9aa0a6));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.3);
  // the tank on top shows the colour you shoot
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 12), glowMat);
  tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.1, 0.02);
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), glowMat);
  tip.position.set(0, 0.02, -0.41);
  root.add(body, grip, barrel, tank, tip);
  root.traverse(o => { o.renderOrder = 999; });
  root.visible = false;
  root.scale.setScalar(0.55);
  camera.add(root);
  const REST = new THREE.Vector3(0.28, -0.26, -0.6);
  // the muzzle, in camera space: where shots leave from
  const MUZZLE = new THREE.Vector3(0.28, -0.24, -0.95);
  let kick = 0, t = 0;
  return {
    root, MUZZLE,
    setColor(c) { glowMat.color.setHex(c); },
    fire() { kick = 1; },
    update(dt, moving) {
      t += dt;
      kick = Math.max(0, kick - dt * 9);
      root.position.set(REST.x, REST.y + Math.sin(t * 1.6) * .006 + (moving ? Math.abs(Math.sin(t * 7)) * .015 : 0), REST.z + kick * .06);
      root.rotation.set(kick * .12, 0.04, 0);
    },
  };
}
