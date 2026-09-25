// moles.js, the locals. Down in the hole they push out of the walls, waddle after you,
// bite, snatch something shiny from your sack and dive back into the ground with it.
// Three helmeted ones guard the thing at the very bottom.
import * as THREE from 'three';
import { S } from './terrain.js';

const velvet = new THREE.MeshStandardMaterial({ color: 0x3a2b24, roughness: 1 });
const pinkMat = new THREE.MeshLambertMaterial({ color: 0xe8a0aa });
const clawMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const helmetMat = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .5, roughness: .4 });
const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });

function makeMole(guardian) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 12), velvet);
  body.scale.set(1, .85, 1.35); body.position.y = .22;
  const snout = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 10), pinkMat);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, .22, .4);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), pinkMat);
  nose.position.set(0, .22, .5);
  g.add(body, snout, nose);
  for (const x of [-.09, .09]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.018), eyeMat);
    e.position.set(x, .3, .33);
    g.add(e);
  }
  const paws = [];
  for (const side of [-1, 1]) {
    const paw = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), pinkMat);
    palm.scale.set(1.2, .45, 1);
    paw.add(palm);
    for (let c = 0; c < 4; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(.018, .08, 5), clawMat);
      claw.rotation.x = Math.PI / 2; claw.position.set(-.06 + c * .04, 0, .1);
      paw.add(claw);
    }
    paw.position.set(side * .26, .12, .22);
    paw.rotation.z = side * .5;
    g.add(paw); paws.push(paw);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.015, .03, .15, 5), pinkMat);
  tail.rotation.x = -1.1; tail.position.set(0, .2, -.36);
  g.add(tail);
  if (guardian) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat);
    helmet.position.set(0, .36, .12);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .02, 16), helmetMat);
    brim.position.set(0, .36, .12);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .05, 10), lampMat);
    lamp.rotation.x = Math.PI / 2; lamp.position.set(0, .45, .31);
    g.add(helmet, brim, lamp);
    g.scale.setScalar(1.35);
  }
  return { g, paws, body };
}

export function createMoles(scene, getTerrain, hooks) {
  const list = [];
  const tmp = new THREE.Vector3();
  const solid = (x, y, z) => { const t = getTerrain(); const [i, j, k] = t.cellOf(x, y, z); return t.solidCell(i, j, k); };

  function spawn(at, from, guardian = false) {
    const m = makeMole(guardian);
    scene.add(m.g);
    const mole = {
      ...m, guardian,
      pos: at.clone(), from: from.clone(), vy: 0,
      hp: guardian ? 5 : 3, state: 'emerge', t: 0, bite: 1, carry: null, life: guardian ? Infinity : 40,
      tunnelCd: 0, hurt: 0,
    };
    m.g.position.copy(from);
    list.push(mole);
    hooks.onEmerge?.(mole);
    return mole;
  }

  // look around the player for a wall to come out of
  function trySpawnNear(player) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const dir = tmp.set(Math.cos(a), -0.15, Math.sin(a)).normalize();
      const origin = player.pos.clone().add(new THREE.Vector3(0, .8, 0));
      const hit = getTerrain().raycast(origin, dir, 7);
      if (!hit || !hit.inside || hit.t < 1.6) continue;
      const out = hit.point.clone().addScaledVector(hit.normal, .35);
      if (solid(out.x, out.y + .3, out.z)) continue;
      out.y -= .15;
      return spawn(out, hit.point.clone().addScaledVector(hit.normal, -.2));
    }
    return null;
  }

  function burrow(m) { if (m.state !== 'dead') { m.state = 'flee'; m.t = 0; } }

  function damage(m, n, knock) {
    if (m.state === 'dead' || m.state === 'gone') return false;
    m.hp -= n; m.hurt = .25;
    if (knock) { m.pos.addScaledVector(knock, .35); }
    if (m.hp <= 0) { m.state = 'dead'; m.t = 0; hooks.onKill?.(m); return true; }
    return false;
  }

  function update(dt, player) {
    for (let n = list.length - 1; n >= 0; n--) {
      const m = list[n];
      m.t += dt;
      m.hurt = Math.max(0, m.hurt - dt);
      m.body.material = m.hurt > 0 ? pinkMat : velvet;
      const toP = tmp.set(player.pos.x - m.pos.x, 0, player.pos.z - m.pos.z);
      const dist = toP.length();
      if (m.state === 'emerge') {
        const k = Math.min(1, m.t / .7);
        m.g.position.lerpVectors(m.from, m.pos, k);
        m.g.scale.setScalar((m.guardian ? 1.35 : 1) * (.3 + .7 * k));
        if (k >= 1) m.state = 'chase';
      } else if (m.state === 'chase') {
        m.life -= dt;
        if (m.life <= 0) burrow(m);
        // gravity and the floor
        m.vy -= 20 * dt;
        m.pos.y += m.vy * dt;
        if (solid(m.pos.x, m.pos.y, m.pos.z)) {
          const t = getTerrain();
          const [, j] = t.cellOf(m.pos.x, m.pos.y, m.pos.z);
          m.pos.y = t.Y0 + (j + 1) * S; m.vy = 0;
        }
        if (dist > 0.75 && dist < 30) {
          toP.normalize();
          const sp = (m.guardian ? 2.2 : 1.8) * dt;
          const nx = m.pos.x + toP.x * sp, nz = m.pos.z + toP.z * sp;
          if (!solid(nx, m.pos.y + .2, nz)) { m.pos.x = nx; m.pos.z = nz; }
          else if (!solid(nx, m.pos.y + .6, nz) && !solid(m.pos.x, m.pos.y + .6, m.pos.z)) { m.pos.y += S + .01; }
          else if (m.tunnelCd <= 0) {
            // no way round: dig through, like a mole does
            hooks.onTunnel?.(new THREE.Vector3(nx, m.pos.y + .25, nz));
            m.tunnelCd = .5;
          }
        }
        m.tunnelCd -= dt;
        if (dist > 30) burrow(m);
        m.bite -= dt;
        const dy = Math.abs(player.pos.y - m.pos.y);
        if (dist < 0.95 && dy < 1.6 && m.bite <= 0) {
          m.bite = m.guardian ? 1.0 : 1.3;
          const stolen = hooks.onBite?.(m);
          if (stolen != null && !m.guardian) { m.carry = stolen; burrow(m); }
        }
        m.g.position.copy(m.pos);
        m.g.rotation.y = Math.atan2(toP.x, toP.z);
        const w = m.t * 12;
        m.paws[0].rotation.x = Math.sin(w) * .6; m.paws[1].rotation.x = -Math.sin(w) * .6;
        m.g.position.y += Math.abs(Math.sin(w)) * .03;
      } else if (m.state === 'flee') {
        m.g.position.y = m.pos.y - m.t * .6;
        m.g.rotation.x = Math.min(1.2, m.t * 2);
        m.paws.forEach((p, k) => { p.rotation.x = Math.sin(m.t * 30 + k) * .9; });
        if (m.t > 1.2) { m.state = 'gone'; hooks.onEscape?.(m); }
      } else if (m.state === 'dead') {
        m.g.rotation.z = Math.min(Math.PI, m.t * 8);
        m.g.scale.setScalar(Math.max(0.01, (m.guardian ? 1.35 : 1) * (1 - m.t * 1.5)));
        if (m.t > .7) m.state = 'gone';
      }
      if (m.state === 'gone') { scene.remove(m.g); list.splice(n, 1); }
    }
  }

  // ray vs moles: a sphere around each body
  function hitTest(origin, dir, far) {
    let best = null, bt = far;
    for (const m of list) {
      if (m.state !== 'chase' && m.state !== 'emerge') continue;
      const c = m.g.position.clone(); c.y += .25 * (m.guardian ? 1.35 : 1);
      const oc = c.sub(origin);
      const t = oc.dot(dir);
      if (t < 0 || t > bt) continue;
      const d2 = oc.lengthSq() - t * t;
      const r = m.guardian ? .5 : .4;
      if (d2 < r * r) { bt = t; best = m; }
    }
    return best ? { mole: best, t: bt } : null;
  }

  function blast(center, r) {
    for (const m of list) if (m.g.position.distanceTo(center) < r + .5) damage(m, 99);
  }

  return {
    list, spawn, trySpawnNear, update, hitTest, damage, blast, burrow,
    count: (guardian) => list.filter(m => m.guardian === guardian && m.state !== 'dead' && m.state !== 'gone').length,
    clear() { for (const m of list) scene.remove(m.g); list.length = 0; },
  };
}
