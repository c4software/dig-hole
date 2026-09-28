// moonplayer.js, third person on a small round world: gravity pulls to the moon's
// centre, "up" is wherever you stand, the camera orbits behind a little astronaut.
import * as THREE from 'three';

const G = 3.2;            // weaker than home: long, floaty jumps
const HALF = 0.34;        // the body is a small box, the world's voxels don't rotate
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function astronaut() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: .6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .9, roughness: .15, emissive: 0x3a2a08 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.26, .45, 6, 14), suit); body.position.y = .82;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 18, 14), suit); head.position.y = 1.42;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 12, -1.1, 2.2, .9, 1.1), gold); visor.position.set(0, 1.43, .06);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.4, .5, .2), dark); pack.position.set(0, .95, -.3);
  const tanks = [-.1, .1].map(x => { const t = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .46, 10), gold); t.position.set(x, .97, -.42); return t; });
  const legs = [-.12, .12].map(x => { const p = new THREE.Group(); p.position.set(x, .52, 0); const l = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .32, 4, 8), suit); l.position.y = -.26; p.add(l); const b = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, .24), dark); b.position.set(0, -.5, .04); p.add(b); return p; });
  const arms = [-.34, .34].map(x => { const p = new THREE.Group(); p.position.set(x, 1.08, 0); const a = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .34, 4, 8), suit); a.position.y = -.24; p.add(a); return p; });
  // the tool in the right hand, held along the arm, working end past the glove:
  // a short drill, or a little shovel, whichever you dig with
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: .9, roughness: .2 });
  const drill = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .26, 10), new THREE.MeshStandardMaterial({ color: 0xe8762a }));
  tb.position.y = -.1; drill.add(tb);
  // the bit spins on its own axis: its own group, turned about y
  const bit = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.035, .24, 8), steel);
  cone.rotation.x = Math.PI; bit.add(cone);
  bit.position.y = -.35; drill.add(bit);
  const shovel = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .5, 8), new THREE.MeshStandardMaterial({ color: 0x8a5f38 }));
  shaft.position.y = -.2; shovel.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.18, .22, .025), steel);
  blade.position.set(0, -.52, .02); blade.rotation.x = -.25; shovel.add(blade);
  for (const t of [drill, shovel]) { t.position.set(0, -.5, 0); arms[1].add(t); }
  shovel.visible = false;
  g.add(body, head, visor, pack, ...tanks, ...legs, ...arms);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, arms, bit, drill, shovel };
}

export function createMoonPlayer(scene, camera, getTerrain) {
  const T = getTerrain;
  const pos = new THREE.Vector3();          // feet
  const vel = new THREE.Vector3();
  const heading = new THREE.Vector3(1, 0, 0);   // where the astronaut faces
  const view = new THREE.Vector3(1, 0, 0);      // where the camera looks, turned by the mouse
  let camPitch = .3, camDist = 2.8, onGround = false, t = 0, swing = 0, active = false;
  let toolKind = 'drill', aimAt = null, aimT = 0, armX = -.9;
  const up = new THREE.Vector3(0, 1, 0);
  const model = astronaut();
  model.g.visible = false;
  scene.add(model.g);
  const stats = { fuelMax: 0, fuel: 0, jetting: false, jump: 1.6, g: G };

  addEventListener('mousemove', (e) => {
    if (!active || !document.pointerLockElement) return;
    look(e.movementX, e.movementY);
  });
  function look(dx, dy, sens = 1) {
    view.applyAxisAngle(up, -dx * .0024 * sens);
    camPitch = THREE.MathUtils.clamp(camPitch + dy * .0024 * sens, -1.1, 1.45);
  }
  addEventListener('wheel', (e) => { if (active) camDist = THREE.MathUtils.clamp(camDist + Math.sign(e.deltaY) * .4, 1.5, 7); }, { passive: true });

  // collisions: the box against the voxels, one world axis at a time (and the halls and decks built on the ground)
  let extra = null;
  const solidBox = (c) => {
    if (extra && extra(c, HALF)) return true;
    const t = T();
    const [i0, j0, k0] = t.cellOf(c.x - HALF, c.y - HALF, c.z - HALF);
    const [i1, j1, k1] = t.cellOf(c.x + HALF - 1e-4, c.y + HALF - 1e-4, c.z + HALF - 1e-4);
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (t.solidCell(i, j, k)) return true;
    return false;
  };
  const body = new THREE.Vector3();
  // the body is two boxes stacked along `up`: the legs, and the chest and helmet above,
  // so the astronaut's head no longer pokes through a tunnel roof
  const HEAD = HALF * 2 + .06;
  const solidBody = (p) => {
    body.copy(p).addScaledVector(up, HALF + .02);
    if (solidBox(body)) return true;
    body.copy(p).addScaledVector(up, HALF + .02 + HEAD);
    return solidBox(body);
  };
  const probeP = new THREE.Vector3();
  function moveAxis(a, d) {
    if (!d) return false;
    probeP.copy(pos); probeP[a] += d;
    if (solidBody(probeP)) return true;
    pos[a] += d;
    return false;
  }
  // stuck in the rock (a dug wall caved in, a step taken too high): climb out along `up`
  function unstick() {
    for (let n = 0; n < 30 && solidBody(pos); n++) pos.addScaledVector(up, .1);
  }

  function update(dt, keys) {
    t += dt;
    const t0 = T();
    up.copy(pos).sub(t0.center).normalize();
    unstick();
    // keep both directions flat against the ground under your feet
    heading.addScaledVector(up, -heading.dot(up)).normalize();
    view.addScaledVector(up, -view.dot(up)).normalize();
    const right = tmp.crossVectors(view, up).normalize();
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const speed = keys.has('ShiftLeft') ? 5 : 3.4;
    // split velocity into along-up and flat parts
    const vUp = vel.dot(up);
    const flat = tmp2.copy(vel).addScaledVector(up, -vUp);
    // moves are relative to the camera; the body turns to face where it goes
    const want = new THREE.Vector3().addScaledVector(view, f * speed).addScaledVector(right, s * speed);
    // while digging, face the spot you dig; otherwise face where you walk
    aimT = Math.max(0, aimT - dt);
    if (aimT > 0 && aimAt) {
      const to = tmp2.copy(aimAt).sub(pos);
      to.addScaledVector(up, -to.dot(up));
      if (to.lengthSq() > .01) heading.lerp(to.normalize(), Math.min(1, dt * 14)).normalize();
    } else if (want.lengthSq() > .01) heading.lerp(tmp2.copy(want).normalize(), Math.min(1, dt * 10)).normalize();
    flat.lerp(want, Math.min(1, dt * (onGround ? 10 : 2.5)));
    const g = stats.g || G;             // mars pulls harder than the moon
    let vu = vUp - g * dt;
    if (keys.has('Space') && onGround) vu = Math.sqrt(2 * g * stats.jump);
    stats.jetting = false;
    if (keys.has('Space') && !onGround && stats.fuelMax && stats.fuel > 0) { vu += 7 * dt; stats.fuel -= dt; stats.jetting = true; }
    if (onGround) stats.fuel = Math.min(stats.fuelMax, stats.fuel + dt * .8);
    vu = Math.max(vu, -12);
    vel.copy(flat).addScaledVector(up, vu);
    // move in small steps; a blocked axis loses its speed
    const steps = Math.max(1, Math.ceil(vel.length() * dt / .12));
    for (let n = 0; n < steps; n++) for (const a of ['x', 'y', 'z']) if (moveAxis(a, vel[a] * dt / steps)) {
      // walking into a low step: hop up it
      if (onGround && Math.abs(up[a]) < .7) { probeP.copy(pos).addScaledVector(up, .42); if (!solidBody(probeP)) { pos.copy(probeP); continue; } }
      vel[a] = 0;
    }
    body.copy(pos).addScaledVector(up, HALF - .06);
    onGround = solidBox(body) && vel.dot(up) <= .5;
    if (onGround && vel.dot(up) < 0) vel.addScaledVector(up, -vel.dot(up));

    // the little astronaut: stand on `up`, face `heading`
    const m = new THREE.Matrix4().makeBasis(tmp.crossVectors(up, heading).normalize(), up, heading);
    model.g.quaternion.setFromRotationMatrix(m);
    model.g.position.copy(pos);
    const moving = flat.length() > .5 && onGround;
    const w = moving ? Math.sin(t * 8) * .6 : 0;
    model.legs[0].rotation.x = w; model.legs[1].rotation.x = -w;
    model.arms[0].rotation.x = -w * .6;
    // the digging arm: points at the spot, draws back, then drives the tool into it
    let aim = -.9;
    if (aimT > 0 && aimAt) {
      model.g.updateMatrixWorld();
      const local = model.g.worldToLocal(tmp2.copy(aimAt));
      local.sub(model.arms[1].position);
      // the arm hangs along -y; a turn of a about x swings its end to (0, -cos a, -sin a)
      aim = THREE.MathUtils.clamp(-Math.atan2(local.z, -local.y), -2.4, -.2);
    }
    swing = Math.max(0, swing - dt * 3.2);
    const k = 1 - swing;   // 0 → 1 through one stroke
    const stroke = swing > 0 ? (k < .35 ? -Math.sin(k / .35 * Math.PI / 2) * .7 : -Math.cos((k - .35) / .65 * Math.PI / 2) * .7 + Math.sin((k - .35) / .65 * Math.PI) * .25) : 0;
    armX += (aim + stroke - armX) * Math.min(1, dt * 18);
    model.arms[1].rotation.x = armX;
    model.arms[1].rotation.z = aimT > 0 ? -.15 : 0;
    model.drill.visible = toolKind === 'drill'; model.shovel.visible = toolKind !== 'drill';
    if (toolKind === 'drill' && aimT > 0) model.bit.rotation.y += dt * 40;

    // camera: behind and above, pulled in if the ground is in the way
    // over the right shoulder, so the crosshair sits beside the astronaut, on the ground ahead
    const shoulder = tmp.crossVectors(view, up).normalize();
    const target = new THREE.Vector3().copy(pos).addScaledVector(up, 1.45).addScaledVector(shoulder, .45);
    const back = new THREE.Vector3().copy(view).multiplyScalar(-Math.cos(camPitch)).addScaledVector(up, Math.sin(camPitch)).normalize();
    let dist = camDist;
    const hit = t0.raycast(target, back, dist);
    if (hit) dist = Math.max(.6, hit.t - .3);
    camera.position.copy(target).addScaledVector(back, dist);
    // never leave the eye inside the rock: slide it in towards the astronaut until it's clear
    const inRock = (p) => { const [i, j, k] = t0.cellOf(p.x, p.y, p.z); return t0.solidCell(i, j, k) || (extra && extra(p, .12)); };
    for (let n = 0; n < 12 && dist > .25 && inRock(camera.position); n++) { dist -= .15; camera.position.copy(target).addScaledVector(back, dist); }
    camera.up.copy(up);
    // the crosshair lands on the ground a few metres ahead; the mouse slides it nearer or further
    camera.lookAt(tmp.copy(target).addScaledVector(view, 2.4).addScaledVector(up, -2.5 + (.3 - camPitch) * 2.6));
  }

  return {
    pos, vel, heading, stats, model, look, update,
    get up() { return up; },
    get onGround() { return onGround; },
    // arrive standing on the surface above `at`, facing along the ground
    place(at) {
      const t0 = T();
      pos.copy(at);
      up.copy(pos).sub(t0.center).normalize();
      // climb out if we landed inside rock
      for (let n = 0; n < 200 && solidBody(pos); n++) pos.addScaledVector(up, .2);
      vel.set(0, 0, 0);
      heading.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
      if (heading.lengthSq() < .01) heading.set(0, 0, 1);
      view.copy(heading);
    },
    // a stroke at a point (or straight ahead when there's nothing in reach)
    dig(at, kind = 'drill') {
      toolKind = kind;
      aimAt = at ? at.clone() : pos.clone().addScaledVector(heading, 1.2).addScaledVector(up, .2);
      aimT = .6;
      if (swing <= 0 || kind === 'drill') swing = kind === 'drill' ? Math.max(swing, .35) : 1;
    },
    setTool(kind) { toolKind = kind; },
    // what else is solid on the ground: fn(point, radius) → true
    setSolid(fn) { extra = fn; },
    setActive(v) { active = v; model.g.visible = v; },
  };
}
