// moonplayer.js, third person on a small round world: gravity pulls to the moon's
// centre, "up" is wherever you stand, the camera orbits behind a little astronaut.
import * as THREE from 'three';
import { tun } from './tunables.js';
import { createRig } from './rig.js';
import { DEFAULT } from './outfits.js';

const G = 3.2;            // weaker than home: long, floaty jumps
const HALF = 0.34;        // the body is a small box, the world's voxels don't rotate
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), flatV = new THREE.Vector3();

// the walker up there: the same body as everyone's, in your outfit, under a glass bubble
function astronaut() {
  const rig = createRig(DEFAULT, { planet: true });
  const g = new THREE.Group();
  g.add(rig.root);
  rig.hold('drill');
  return { g, rig };
}

export function createMoonPlayer(scene, camera, getTerrain) {
  const T = getTerrain;
  const pos = new THREE.Vector3();          // feet
  const vel = new THREE.Vector3();
  const heading = new THREE.Vector3(1, 0, 0);   // where the astronaut faces
  const view = new THREE.Vector3(1, 0, 0);      // where the camera looks, turned by the mouse
  let camPitch = .3, camDist = 2.8, onGround = false, t = 0, swing = 0, active = false, groundT = 0;
  let toolKind = 'drill', aimAt = null, aimT = 0, armX = -.9;
  const up = new THREE.Vector3(0, 1, 0);
  const model = astronaut();
  const SHOULDER = new THREE.Vector3(-.185, 1.425, -.01);
  const me = { frozen: false };
  model.g.visible = false;
  scene.add(model.g);
  const stats = { fuelMax: 0, fuel: 0, jetting: false, jump: 1.6, g: G };

  addEventListener('mousemove', (e) => {
    if (!active || !document.pointerLockElement || me.frozen) return;
    look(e.movementX, e.movementY);
  });
  function look(dx, dy, sens = 1) {
    if (me.frozen) return;
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
  const probeP = new THREE.Vector3(), step = new THREE.Vector3();
  const CLIMB = [.12, .24, .36, .48, .6, .68];   // ledge heights tried, a voxel is .4 and the slopes are stairs
  const SLIDES = [['x'], ['y'], ['z'], ['x', 'y'], ['y', 'z'], ['x', 'z']];
  const tryMove = (d) => { probeP.copy(pos).add(d); if (solidBody(probeP)) return false; pos.copy(probeP); return true; };
  // drop along -up by at most `most`, stopping on whatever is below; true if something was
  function sink(most) {
    let dropped = 0;
    for (const s of [.16, .08, .04, .02, .01]) while (dropped + s <= most + 1e-6) {
      probeP.copy(pos).addScaledVector(up, -s);
      if (solidBody(probeP)) break;
      pos.copy(probeP); dropped += s;
    }
    return most - dropped > .011;
  }
  // a ledge ahead: rise a little, step over, then settle back onto it
  function climb(d) {
    for (const h of CLIMB) {
      probeP.copy(pos).addScaledVector(up, h);
      if (solidBody(probeP)) continue;   // a corner in the way (up is slanted against the voxels), try higher
      probeP.add(d);
      if (!solidBody(probeP)) { pos.copy(probeP); sink(h); return true; }
    }
    return false;
  }
  // a flat move: straight on, up a ledge, else sliding along the voxel face that stopped it
  function walk(d, canClimb) {
    if (tryMove(d) || (canClimb && climb(d))) return true;
    // drop one world axis (or two) of the move, flatten again, longest first
    const l2 = d.lengthSq(), tries = [];
    for (const [a, b] of SLIDES) {
      const v = d.clone(); v[a] = 0; if (b) v[b] = 0;
      v.addScaledVector(up, -v.dot(up));
      if (v.lengthSq() > l2 * .04) tries.push(v);
    }
    // the halls' walls sit at any angle: glance off them too
    for (const a of [.35, -.35, .7, -.7, 1.05, -1.05, 1.4, -1.4]) tries.push(d.clone().applyAxisAngle(up, a).multiplyScalar(Math.cos(a)));
    tries.sort((p, q) => q.lengthSq() - p.lengthSq());
    for (const v of tries) if (tryMove(v) || (canClimb && climb(v))) return true;
    return false;
  }
  // stuck in the rock (a dug wall caved in, a step taken too high): climb out along `up`
  // first the smallest nudge any way round (as `up` turns, the body brushing a wall tips into it:
  // it must not be lifted onto the hall's roof)
  const nudge = new THREE.Vector3();
  function unstick() {
    if (!solidBody(pos)) return;
    for (const r of [.03, .08, .16, .3]) for (let a = -1; a < 8; a++) {
      if (a < 0) nudge.copy(up); else nudge.copy(heading).applyAxisAngle(up, a * Math.PI / 4);
      probeP.copy(pos).addScaledVector(nudge, r);
      if (!solidBody(probeP)) { pos.copy(probeP); return; }
    }
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
    const speed = (keys.has('ShiftLeft') ? 5 : 3.4) * tun.get('planetWalk');
    // split velocity into along-up and flat parts
    const vUp = vel.dot(up);
    // (its own vector: tmp2 is reused just below for the facing, which used to shrink the walk to ~1.4 m/s)
    const flat = flatV.copy(vel).addScaledVector(up, -vUp);
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
    const g = (stats.g || G) * tun.get(stats.g > G ? 'marsGravity' : 'moonGravity');   // mars pulls harder than the moon
    let vu = vUp - g * dt;
    if (keys.has('Space') && onGround) vu = Math.sqrt(2 * g * stats.jump * tun.get('planetJump'));
    stats.jetting = false;
    if (keys.has('Space') && !onGround && stats.fuelMax && stats.fuel > 0) { vu += 7 * dt; stats.fuel -= dt; stats.jetting = true; }
    if (onGround) stats.fuel = Math.min(stats.fuelMax, stats.fuel + dt * .8);
    vu = Math.max(vu, -12);
    // move in small steps, along `up` then along the ground (the voxels are world-aligned, the ground isn't)
    const wasGround = onGround;
    groundT = onGround ? .15 : Math.max(0, groundT - dt);
    const steps = Math.max(1, Math.ceil((flat.length() + Math.abs(vu)) * dt / .1));
    let blocked = false;
    for (let n = 0; n < steps; n++) {
      step.copy(up).multiplyScalar(vu * dt / steps);
      if (vu && !tryMove(step)) {
        // landed or bumped the head: come right up against it
        if (vu < 0) sink(-vu * dt / steps); else vu = 0;
        if (vu < 0) vu = 0;
      }
      step.copy(flat).multiplyScalar(dt / steps);
      if (step.lengthSq() > 1e-10 && !walk(step, groundT > 0 && vu <= .5)) blocked = true;
    }
    // a wall all round: stop pushing into it
    if (blocked) flat.multiplyScalar(.5);
    // walking downhill: keep the feet on the ground instead of skipping off every step
    if (wasGround && vu <= 0 && !stats.jetting) { step.copy(pos); if (!sink(.5)) pos.copy(step); }
    probeP.copy(pos).addScaledVector(up, -.06);
    onGround = solidBody(probeP) && vu <= .5;
    if (onGround && vu < 0) vu = 0;
    vel.copy(flat).addScaledVector(up, vu);

    // the little astronaut: stand on `up`, face `heading`
    const m = new THREE.Matrix4().makeBasis(tmp.crossVectors(up, heading).normalize(), up, heading);
    model.g.quaternion.setFromRotationMatrix(m);
    model.g.position.copy(pos);
    const R = model.rig;
    R.st.speed = onGround ? flat.length() : 0; R.st.ground = onGround; R.st.vy = vel.dot(up);
    R.st.dig = false;
    R.update(dt);
    // the digging arm: points at the spot, draws back, then drives the tool into it
    let aim = -.9;
    if (aimT > 0 && aimAt) {
      model.g.updateMatrixWorld();
      const local = model.g.worldToLocal(tmp2.copy(aimAt));
      local.sub(SHOULDER);
      // the arm hangs along -y; a turn of a about x swings its end to (0, -cos a, -sin a)
      aim = THREE.MathUtils.clamp(-Math.atan2(local.z, -local.y), -2.4, -.2);
    }
    swing = Math.max(0, swing - dt * 3.2);
    const k = 1 - swing;   // 0 → 1 through one stroke
    const stroke = swing > 0 ? (k < .35 ? -Math.sin(k / .35 * Math.PI / 2) * .7 : -Math.cos((k - .35) / .65 * Math.PI / 2) * .7 + Math.sin((k - .35) / .65 * Math.PI) * .25) : 0;
    armX += (aim + stroke - armX) * Math.min(1, dt * 18);
    if (aimT > 0 && !R.emote) { const sh = R.bone('shR'); sh.rotation.x = armX; sh.rotation.y = 0; sh.rotation.z = .12; R.bone('elbR').rotation.x = -.2; }
    R.hold(toolKind === 'hands' ? null : toolKind === 'drill' ? 'drill' : 'shovel');

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
    // a wall of a hall between the astronaut and the eye: come in front of it
    if (extra) for (let s = .3; s < dist; s += .2) if (extra(tmp2.copy(target).addScaledVector(back, s), .15)) { dist = Math.max(.25, s - .3); camera.position.copy(target).addScaledVector(back, dist); break; }
    camera.up.copy(up);
    // the crosshair lands on the ground a few metres ahead; the mouse slides it nearer or further
    camera.lookAt(tmp.copy(target).addScaledVector(view, 2.4).addScaledVector(up, -2.5 + (.3 - camPitch) * 2.6));
  }

  return {
    pos, vel, heading, stats, model, look, update,
    get up() { return up; },
    get onGround() { return onGround; },
    // arrive standing on the surface above `at`, facing along the ground
    place(at, face = null) {
      const t0 = T();
      pos.copy(at);
      up.copy(pos).sub(t0.center).normalize();
      // climb out if we landed inside rock
      for (let n = 0; n < 200 && solidBody(pos); n++) pos.addScaledVector(up, .2);
      vel.set(0, 0, 0);
      // facing a point (a terminal, a door) when asked, otherwise along the ground
      if (face) heading.copy(face).sub(pos).addScaledVector(up, -face.clone().sub(pos).dot(up));
      if (!face || heading.lengthSq() < .01) heading.set(1, 0, 0).addScaledVector(up, -up.x);
      heading.normalize();
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
    get rig() { return model.rig; },
    // no turning while the emote wheel is out
    get frozen() { return me.frozen; }, set frozen(v) { me.frozen = v; },
  };
}
