// player.js, first person body: a 0.6 x 1.7 m box that walks, jumps, climbs 40 cm
// steps on its own, and flies a little once the jetpack is bought.
import * as THREE from 'three';
import { S } from './terrain.js';
import { tun } from './tunables.js';

const R = 0.28, H = 1.7, EYE = 1.56;
const G0 = 22;   // times the host's gravity (tunables.js)
const EPS = 1e-4;

export function createPlayer(camera, getTerrain, colliders) {
  const T = getTerrain;
  const pos = new THREE.Vector3(0, 0, -11.5);
  const vel = new THREE.Vector3();
  let yaw = Math.PI, pitch = -0.15;
  let onGround = false, enabled = false;
  let eyeLift = 0;              // smooths the camera over auto-steps
  let bob = 0, stepDist = 0;
  const keys = new Set();
  const stats = { jump: 1.25, fuelMax: 0, fuel: 0, jetting: false, canJet: true, kite: false, gliding: false, inWater: false, onLadder: false, away: false };
  let onStep = () => {}, onLand = () => {};

  addEventListener('keydown', (e) => { if (enabled) keys.add(e.code); if (e.code === 'Space' && enabled) e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  addEventListener('mousemove', (e) => {
    if (!enabled || !document.pointerLockElement) return;
    look(e.movementX, e.movementY);
  });
  const feel = { sens: 1, invert: false };
  function look(dx, dy) {
    yaw -= dx * 0.0022 * feel.sens;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0022 * feel.sens * (feel.invert ? -1 : 1), -1.55, 1.55);
  }

  // ---------- collision ----------
  const boxes = [];
  function overlaps(p) {
    boxes.length = 0;
    const x0 = p.x - R, x1 = p.x + R, y0 = p.y, y1 = p.y + H, z0 = p.z - R, z1 = p.z + R;
    const [i0, j0, k0] = T().cellOf(x0, y0, z0);
    const [i1, j1, k1] = T().cellOf(x1 - EPS, y1 - EPS, z1 - EPS);
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (!T().solidCell(i, j, k)) continue;
      const bx = T().X0 + i * S, by = T().Y0 + j * S, bz = T().Z0 + k * S;
      boxes.push({ key: i + ',' + j + ',' + k, min: [bx, by, bz], max: [bx + S, by + S, bz + S] });
    }
    for (const c of colliders) {
      if (c.off) continue;
      if (x1 > c.min.x && x0 < c.max.x && y1 > c.min.y && y0 < c.max.y && z1 > c.min.z && z0 < c.max.z)
        boxes.push({ key: c, min: [c.min.x, c.min.y, c.min.z], max: [c.max.x, c.max.y, c.max.z] });
    }
    return boxes;
  }
  const AX = ['x', 'y', 'z'];
  function moveAxis(a, amount) {
    if (!amount) return false;
    const k = AX[a];
    // whatever we were already stuck in doesn't count, only what this move runs into
    const before = new Set(overlaps(pos).map(b => b.key));
    pos[k] += amount;
    const hits = overlaps(pos).filter(b => !before.has(b.key));
    if (!hits.length) return false;
    if (amount > 0) {
      let m = Infinity;
      for (const b of hits) m = Math.min(m, b.min[a]);
      pos[k] = m - (a === 1 ? H : R) - EPS;
    } else {
      let m = -Infinity;
      for (const b of hits) m = Math.max(m, b.max[a]);
      pos[k] = m + (a === 1 ? 0 : R) + EPS;
    }
    return true;
  }
  const probe = new THREE.Vector3();
  function tryStep(a, amount) {
    // blocked sideways while standing: is there room one voxel up?
    // on the ground, or near the top of a jump (a little mantle onto a ledge)
    if (!onGround && vel.y < -2.5) return false;
    probe.copy(pos); probe.y += S + 0.02;
    if (overlaps(probe).length) return false;
    probe[AX[a]] += amount;
    if (overlaps(probe).length) return false;
    pos.copy(probe);
    eyeLift -= S + 0.02;
    return true;
  }
  function unstick() {
    // something grew around us (a save, a teleport): climb out
    for (let n = 0; n < 400 && overlaps(pos).length; n++) pos.y += S / 2;
  }

  // ---------- update ----------
  const wish = new THREE.Vector3();
  function update(dt) {
    if (!enabled) { applyCamera(dt); return; }
    wish.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) wish.z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) wish.z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) wish.x += 1;
    if (wish.lengthSq()) wish.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.2 : 4.3) * (stats.inWater ? 0.55 : 1) * (stats.speed || 1) * tun.get('walk');
    const G = G0 * tun.get('gravity');
    const accel = onGround ? 14 : 5;
    vel.x += (wish.x * speed - vel.x) * Math.min(1, accel * dt);
    vel.z += (wish.z * speed - vel.z) * Math.min(1, accel * dt);

    const space = keys.has('Space');
    if (stats.onLadder) {
      // on a ladder: forward or space climbs, back climbs down, nothing holds you there
      const up = space || keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
      vel.y = up ? 3.2 : down ? -3 : 0;
    } else if (space && onGround) { vel.y = Math.sqrt(2 * G * stats.jump * tun.get('jump')); onGround = false; }
    stats.jetting = false;
    if (space && !onGround && stats.canJet && stats.fuelMax > 0 && stats.fuel > 0 && vel.y < 6) {
      vel.y += 40 * dt;
      stats.fuel = Math.max(0, stats.fuel - dt);
      stats.jetting = true;
    }
    if (onGround) stats.fuel = Math.min(stats.fuelMax, stats.fuel + dt * 0.8);
    if (stats.onLadder) {
      // no gravity while holding the rungs
    } else if (stats.inWater) {
      // swimming: slow sinking, space to rise
      vel.y -= G * 0.18 * dt;
      if (space) vel.y = Math.min(3.2, vel.y + 16 * dt);
      vel.y = Math.max(vel.y, -2.2);
    } else vel.y -= G * (stats.grav || 1) * dt;
    // the kite: hold space while falling and drift down gently
    stats.gliding = stats.kite && space && !onGround && !stats.jetting && vel.y < -2.5;
    vel.y = Math.max(vel.y, stats.gliding ? -2.5 : -40);

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt / 0.15));
    const h = dt / steps;
    const wasGround = onGround;
    const fallSpeed = vel.y;
    for (let s = 0; s < steps; s++) {
      if (moveAxis(0, vel.x * h) && !tryStep(0, Math.sign(vel.x) * 0.06)) vel.x = 0;
      if (moveAxis(2, vel.z * h) && !tryStep(2, Math.sign(vel.z) * 0.06)) vel.z = 0;
      const hitY = moveAxis(1, vel.y * h);
      if (hitY) { if (vel.y < 0) onGround = true; vel.y = 0; }
      else if (vel.y * h < 0 || vel.y > 0) onGround = false;
    }
    // stay grounded on the frame we land, so a jump press isn't eaten
    if (!onGround) { probe.copy(pos); probe.y -= 0.03; if (overlaps(probe).length && vel.y <= 0) onGround = true; }
    if (onGround && !wasGround && fallSpeed < -8) onLand(-fallSpeed);

    const t = T();
    // both towns go on beyond their plots: the neighbours' houses, the station, the mars rocket
    const B = t.theme === 'home' || t.theme === 'china' ? 115 : 40;
    // (the secret cave lies far beyond them: stats.away lets you be there)
    if (!stats.away) {
      pos.x = THREE.MathUtils.clamp(pos.x, t.ox - B, t.ox + B);
      pos.z = THREE.MathUtils.clamp(pos.z, t.oz - B, t.oz + B);
    }

    const hs = Math.hypot(vel.x, vel.z);
    if (onGround && hs > 0.5) {
      bob += dt * hs * 2.2;
      stepDist += hs * dt;
      if (stepDist > 1.7) { stepDist = 0; onStep(); }
    } else bob *= 0.9;
    applyCamera(dt);
  }

  function applyCamera(dt) {
    eyeLift += (0 - eyeLift) * Math.min(1, dt * 12);
    camera.position.set(pos.x, pos.y + EYE + eyeLift + Math.sin(bob) * 0.035, pos.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  return {
    pos, vel, stats, keys, look, feel,
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get onGround() { return onGround; },
    get enabled() { return enabled; },
    enable() { enabled = true; }, disable() { enabled = false; keys.clear(); vel.set(0, 0, 0); },
    update, unstick, applyCamera: () => applyCamera(1),
    set onStep(f) { onStep = f; }, set onLand(f) { onLand = f; },
    EYE, H, R,
  };
}
