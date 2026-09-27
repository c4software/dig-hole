// tool.js, the shovel in your hands, the dirt that flies off it, and the thing at the bottom.
import * as THREE from 'three';

// blade colours per shovel level: rust, iron, steel, tungsten, diamond, gold
const BLADES = [0x8a5a3a, 0x9aa0a6, 0xc9ced4, 0x5c6470, 0x8ff0ff, 0xffd75e];

// ---------- the tools' own little studio ----------
// What you hold is shaded by a matcap (a painted sphere of light) rather than by the world's
// lights: it reads the same at noon, at night and at the bottom of the hole.
// kind: 'gloss' (paint, plastic), 'metal' (a sky and a horizon in it), 'soft' (wood, rubber)
const caps = new Map();
function capTex(color, kind) {
  const key = color + kind;
  if (caps.has(key)) return caps.get(key);
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const base = new THREE.Color(color), L = new THREE.Vector3(-.45, .65, .62).normalize(), H = L.clone().add(new THREE.Vector3(0, 0, 1)).normalize();
  const n = new THREE.Vector3(), out = new THREE.Color(), sky = new THREE.Color(), tmp = new THREE.Color();
  const S = kind === 'metal' ? [.45, 90, 1.1] : kind === 'gloss' ? [.3, 45, .75] : [.15, 8, .12];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + .5) / N * 2 - 1, y = 1 - (j + .5) / N * 2, r2 = x * x + y * y;
    const k = (j * N + i) * 4;
    if (r2 > 1) { d[k + 3] = 0; continue; }
    n.set(x, y, Math.sqrt(1 - r2));
    const dif = Math.max(0, n.dot(L) * .5 + .5), spec = Math.pow(Math.max(0, n.dot(H)), S[1]) * S[2], rim = Math.pow(1 - n.z, 3) * S[0];
    if (kind === 'metal') {
      // a bright sky above the horizon, the dark ground below: what makes metal look like metal
      const h = n.y + .12;
      sky.setRGB(1.05, 1.05, 1.1).lerp(tmp.setRGB(.55, .6, .7), 1 - Math.min(1, Math.max(0, h) * 2.2));
      if (h < 0) sky.setRGB(.16, .14, .13).lerp(tmp.setRGB(.34, .3, .27), Math.min(1, -h * 3));
      out.copy(base).multiply(sky).multiplyScalar(.55 + dif * .6);
    } else out.copy(base).multiplyScalar(.28 + dif * .95);
    out.r += spec + rim * base.r; out.g += spec + rim * base.g; out.b += spec + rim * base.b;
    d[k] = Math.min(255, out.r * 255); d[k + 1] = Math.min(255, out.g * 255); d[k + 2] = Math.min(255, out.b * 255); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  caps.set(key, t);
  return t;
}
// transparent (though opaque) so it is drawn after everything, the world's leaves and glows included
export const toolMat = (color, kind = 'gloss', extra = {}) => new THREE.MeshMatcapMaterial({ matcap: capTex(color, kind), depthTest: false, transparent: true, ...extra });
// wood, with its grain running along the handle (v)
let grain = null;
function woodTex() {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 256);
  for (let n = 0; n < 40; n++) { const x = Math.random() * 64, w = 1 + Math.random() * 3; g.fillStyle = `rgba(90,50,20,${.08 + Math.random() * .18})`; g.fillRect(x, 0, w, 256); }
  for (let n = 0; n < 5; n++) { const y = Math.random() * 256; g.fillStyle = 'rgba(70,35,15,.25)'; g.beginPath(); g.ellipse(Math.random() * 64, y, 3, 9, 0, 0, 7); g.fill(); }
  grain = new THREE.CanvasTexture(c); grain.colorSpace = THREE.SRGBColorSpace; grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  return grain;
}
// a flat outline, extruded and rounded off: the tools' bodies
function slab(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

export function createShovel(camera) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  // local frame: the grip sits at the origin, the shaft runs down -y to the blade
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); pivot.add(o); return o; };
  const wood = toolMat(0xc88a52, 'soft', { map: woodTex() }), rubber = toolMat(0x2a2a30, 'soft'), dark = toolMat(0x3a3e46, 'metal');
  // the D-grip: a rubber bar held by a bent steel loop
  add(new THREE.CylinderGeometry(.02, .02, .13, 14), rubber, 0, .09, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    const loop = new THREE.CatmullRomCurve3([new THREE.Vector3(s * .012, -.05, 0), new THREE.Vector3(s * .045, .01, 0), new THREE.Vector3(s * .068, .07, 0), new THREE.Vector3(s * .062, .1, 0)]);
    add(new THREE.TubeGeometry(loop, 16, .009, 8), dark);
  }
  // the shaft: turned ash, a little thicker towards the blade
  const shaft = add(new THREE.CylinderGeometry(.021, .026, .98, 14, 1), wood, 0, -.54);
  shaft.geometry.attributes.uv.array.forEach((v, n, a) => { if (n % 2) a[n] = v * 3; });
  // the socket, riveted, flaring into the blade
  add(new THREE.CylinderGeometry(.028, .042, .16, 16), dark, 0, -1.08);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(.007, 8, 6), toolMat(0xd8d2c4, 'metal'), 0, -1.06, s * .03);
  // the blade: rounded shoulders, a pointed tip, a folded tread on top, cupped towards you
  const sh = new THREE.Shape();
  sh.moveTo(-.135, -.04); sh.quadraticCurveTo(-.14, 0, -.1, 0); sh.lineTo(.1, 0); sh.quadraticCurveTo(.14, 0, .135, -.04);
  sh.bezierCurveTo(.13, -.2, .07, -.3, 0, -.34); sh.bezierCurveTo(-.07, -.3, -.13, -.2, -.135, -.04);
  const bladeGeo = slab(sh, .008, .003);
  const p = bladeGeo.attributes.position;
  for (let n = 0; n < p.count; n++) { const x = p.getX(n), y = p.getY(n); p.setZ(n, p.getZ(n) - x * x * 1.5 - y * y * .25); }
  bladeGeo.computeVertexNormals();
  const bladeMat = toolMat(BLADES[0], 'metal', { side: THREE.DoubleSide });
  add(bladeGeo, bladeMat, 0, -1.14);
  add(new THREE.BoxGeometry(.25, .012, .03), bladeMat, 0, -1.142, -.014);
  // a spine down the middle of the blade
  add(new THREE.CylinderGeometry(.006, .002, .22, 6), bladeMat, 0, -1.25, .006);
  root.add(pivot);
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
    setLevel(l) { bladeMat.matcap = capTex(BLADES[Math.min(l, BLADES.length - 1)], 'metal'); },
  };
}

// clods of earth, a small pool of instanced cubes
export function createDebris(scene) {
  const N = 260;
  const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const parts = Array.from({ length: N }, () => { const p = new THREE.Vector3(), v = new THREE.Vector3(); return { life: 0, p, v, r: 0, s: 1, pos: p, vel: v, size: 0 }; });
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
  return { burst, update, parts };
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
  const orange = toolMat(0xf07a26, 'gloss'), grey = toolMat(0x6a707a, 'gloss'), rubber = toolMat(0x3c4048, 'soft'), steel = toolMat(0xc8ced6, 'metal'), black = toolMat(0x1a1b20, 'metal');
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); root.add(m); return m; };
  const along = Math.PI / 2;   // cylinders along z
  // outlines drawn side on (x forward, y up), extruded across and turned to point the nose at -z
  const side = (pts, depth, bevel, mat) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const q of pts.slice(1)) q.length === 4 ? sh.quadraticCurveTo(...q) : sh.lineTo(...q); const g = slab(sh, depth, bevel); g.rotateY(Math.PI / 2); return add(g, mat); };
  // the housing: a motor barrel with a rounded back, narrowing to the nose
  side([[-.11, -.05], [-.11, .03, -.11, .065, -.07, .065], [.08, .065, .13, .062, .14, .04], [.15, .035], [.15, -.035], [.12, -.05]], .082, .016, orange);
  // the rubber overmould: a band round the back, vents on the side
  side([[-.117, -.045], [-.117, .03, -.117, .07, -.075, .07], [-.03, .07], [-.03, -.05]], .086, .014, grey);
  for (let n = 0; n < 4; n++) for (const s of [-1, 1]) add(new THREE.BoxGeometry(.004, .05, .007), black, s * .044, .01, .03 + n * .016);
  // the pistol grip, raked back, and its trigger
  side([[-.02, -.05], [.045, -.05], [.03, -.12], [.015, -.19], [-.05, -.19], [-.035, -.12]], .058, .014, rubber);
  side([[.032, -.055], [.05, -.055], [.047, -.09], [.033, -.095]], .02, .005, orange);
  // the battery pack under the grip, a stripe of colour, charge lights
  side([[-.075, -.185], [.05, -.185], [.058, -.25], [-.085, -.25]], .1, .012, grey);
  side([[-.076, -.188], [.051, -.188], [.052, -.2], [-.078, -.2]], .102, .004, orange);
  const leds = [];
  for (let n = 0; n < 4; n++) leds.push(add(new THREE.BoxGeometry(.012, .007, .004), new THREE.MeshBasicMaterial({ color: 0x3a3020, depthTest: false, transparent: true, toneMapped: false }), -.027 + n * .018, -.22, -.056));
  // a speed switch on top, a light under the nose
  add(new THREE.CylinderGeometry(.012, .014, .012, 12), black, 0, .075, .05);
  const lens = add(new THREE.CircleGeometry(.009, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0, depthTest: false, transparent: true, toneMapped: false }), 0, -.04, -.152, 0, Math.PI);
  // the chuck: a knurled black sleeve and a steel nose
  add(new THREE.CylinderGeometry(.036, .038, .055, 20), black, 0, 0, -.18, along);
  for (let n = 0; n < 5; n++) add(new THREE.TorusGeometry(.038, .003, 5, 20), steel, 0, 0, -.16 - n * .01);
  add(new THREE.CylinderGeometry(.016, .03, .035, 20), steel, 0, 0, -.225, along);
  // the bit: a tapered core wrapped in a double helix
  const bit = new THREE.Group();
  const bitMat = toolMat(BITS[1], 'metal');
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.006, .014, .3, 10), bitMat);
  core.rotation.x = along;
  bit.add(core);
  for (const phase of [0, Math.PI]) {
    const pts = Array.from({ length: 40 }, (_, n) => { const t = n / 39, a = t * Math.PI * 9 + phase, r = .026 * (1 - t) + .006; return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, .15 - t * .3); });
    bit.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .0065, 6), bitMat));
  }
  bit.position.z = -.39;
  root.add(bit);
  root.traverse(o => { o.renderOrder = 999; });

  // turned a little so its orange flank shows, not just its back
  const REST = new THREE.Vector3(.27, -.15, -.7);
  root.position.copy(REST);
  root.scale.setScalar(.85);
  root.rotation.set(.04, .42, -.05);
  root.visible = false;
  camera.add(root);

  let spin = 0, t = 0, speed = 0, kick = 0;
  const hot = new THREE.Color(2.2, .7, .2), cold = new THREE.Color(1, 1, 1);
  return {
    root,
    setLevel(l) { bitMat.matcap = capTex(BITS[Math.min(l, BITS.length - 1)], 'metal'); },
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
      // a hot bit glows
      bitMat.color.copy(cold).lerp(hot, Math.min(1, Math.max(0, heat - .3) * 1.4));
      leds.forEach((l, n) => l.material.color.setHex(charge > n / 4 + .01 ? (charge < .25 ? 0xff5a3a : 0x7aff7a) : 0x2a2418));
      lens.material.color.setHex(running ? 0xffffff : 0xfff2c0);
    },
  };
}

// the blaster for the arena games: a paint gun or a laser, the same body in a new colour
export function createBlaster(camera) {
  const root = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, depthTest: false, transparent: true, ...extra });
  const bodyMat = mat(0x2a2e36);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3fa4, depthTest: false, transparent: true, toneMapped: false });
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
