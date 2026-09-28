// laser.js, the laser game in the garden: a blaster each, robots that hunt too, and
// whoever is hit goes straight back into the house. Nobody can shoot inside the house.
import * as THREE from 'three';
import { avatar } from './net.js';

const HOUSE = { x0: -5.5, x1: 5.5, z0: -22, z1: -15 };
export const inHouse = (p) => p.x > HOUSE.x0 && p.x < HOUSE.x1 && p.z > HOUSE.z0 && p.z < HOUSE.z1 && p.y > -1;
// somewhere inside, away from the door
export const houseSpot = (v = new THREE.Vector3()) => v.set(-3 + Math.random() * 6, .05, -20 + Math.random() * 2.5);
const FENCE = 9.8;            // bots walk round the plot, never into the hole
const RANGE = 60;
const BOTS = [['Bip', 0x28d7ff], ['Zap', 0x7cff3a], ['Pixel', 0xff8a1e]];
const rand = (a, b) => a + Math.random() * (b - a);

// does a straight walk from a to b cut through the fenced plot?
function crossesPlot(ax, az, bx, bz) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d] of [[ax, dx], [az, dz]]) {
    if (Math.abs(d) < 1e-6) { if (p < -FENCE || p > FENCE) return false; continue; }
    let a = (-FENCE - p) / d, b = (FENCE - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

export function createLaser({ scene, terrain, colliders, audio }) {
  const beamGeo = new THREE.CylinderGeometry(.03, .03, 1, 6, 1, true).translate(0, .5, 0);
  const sparkGeo = new THREE.SphereGeometry(.12, 8, 6);
  const beams = [];
  let bots = [];
  let running = false;
  let me = { frags: 0, deaths: 0, color: 0xff3fa4, safe: 0 };
  let onTagged = () => {};
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const box = new THREE.Box3();

  // ---------- beams ----------
  function beam(a, b, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    const m = new THREE.Mesh(beamGeo, mat);
    const d = tmp.copy(b).sub(a);
    m.position.copy(a);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    const s = new THREE.Mesh(sparkGeo, mat);
    s.position.copy(b);
    scene.add(m, s);
    beams.push({ m, s, mat, life: .18 });
  }

  // ---------- line of sight: the ground, and the walls of the house ----------
  function blockedAt(from, dir, max) {
    let t = max;
    const hit = terrain.raycast(from, dir, max);
    if (hit) t = hit.t;
    const ray = new THREE.Ray(from, dir);
    for (const c of colliders) {
      if (c.off || c.max.y - c.min.y < 2) continue;
      box.set(c.min, c.max);
      const p = ray.intersectBox(box, tmp2);
      if (p) t = Math.min(t, p.distanceTo(from));
    }
    return t;
  }
  const clear = (a, b) => { const d = tmp.copy(b).sub(a); const len = d.length(); return blockedAt(a, d.normalize().clone(), len) >= len - .05; };

  // ---------- bots ----------
  function wanderPoint(from) {
    for (let n = 0; n < 30; n++) {
      const x = rand(-22, 22), z = rand(-12.8, 22);
      if (Math.abs(x) < FENCE + .5 && Math.abs(z) < FENCE + .5) continue;
      if (crossesPlot(from.x, from.z, x, z)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(from.x > 0 ? 14 : -14, 0, -11.5);
  }
  function makeBot(name, color) {
    const a = avatar(name, color);
    a.tool.visible = false;
    const glow = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const vest = new THREE.Mesh(new THREE.TorusGeometry(.29, .045, 6, 20), glow);
    vest.rotation.x = Math.PI / 2; vest.position.y = 1.0;
    const gun = new THREE.Group();
    const gb = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .4), new THREE.MeshLambertMaterial({ color: 0x2a2e36 }));
    const gt = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .16, 8), glow);
    gt.rotation.x = Math.PI / 2; gt.position.set(0, .08, 0);
    gun.add(gb, gt);
    gun.position.set(.22, 1.2, .32);
    a.g.add(vest, gun);
    scene.add(a.g);
    return { name, color, g: a.g, rig: a.rig, pos: new THREE.Vector3(), path: [], cd: rand(.5, 1.5), react: 0, target: null, scan: 0, frags: 0, deaths: 0, t: Math.random() * 9, safe: 0, wasIn: false };
  }
  function toHouse(b) {
    houseSpot(b.pos);
    b.path = [new THREE.Vector3(0, 0, -16.4), new THREE.Vector3(rand(-1, 1), 0, -13.4)];
    b.target = null;
  }

  function start({ bots: nb, color }) {
    stop();
    running = true;
    me = { frags: 0, deaths: 0, color, safe: 0, wasIn: true };
    for (let n = 0; n < nb; n++) {
      const b = makeBot(...BOTS[n]);
      b.pos.copy(wanderPoint(new THREE.Vector3(0, 0, 15)));
      bots.push(b);
    }
  }
  function stop() {
    for (const b of bots) scene.remove(b.g);
    bots = [];
    for (const x of beams) { scene.remove(x.m, x.s); x.mat.dispose(); }
    beams.length = 0;
    running = false;
  }

  const chest = (p, v = new THREE.Vector3()) => v.copy(p).setY(p.y + 1.2);
  const eyeOf = (b) => new THREE.Vector3(b.pos.x, b.pos.y + 1.35, b.pos.z);

  function botFire(b, player) {
    const from = eyeOf(b);
    const t = b.target;
    const at = t === 'me' ? chest(player.pos) : chest(t.pos);
    const d = from.distanceTo(at);
    const hit = Math.random() < Math.min(t === 'me' ? .55 : .7, Math.max(.2, .8 - d / 35));
    audio.laser();
    if (hit) {
      beam(from, at, b.color);
      b.frags++;
      if (t === 'me') { me.deaths++; me.safe = 1.5; onTagged(b.name); }
      else { t.deaths++; toHouse(t); }
    } else {
      // a miss: the beam goes on past, until something stops it
      const side = tmp2.set(rand(-1, 1), rand(-.4, .8), rand(-1, 1)).normalize().multiplyScalar(rand(.7, 1.6));
      const dir = at.clone().add(side).sub(from).normalize();
      beam(from, from.clone().addScaledVector(dir, blockedAt(from, dir, RANGE)), b.color);
    }
    b.cd = rand(1.2, 2);
  }

  function update(dt, live, player) {
    for (let n = beams.length - 1; n >= 0; n--) {
      const x = beams[n];
      x.life -= dt;
      x.mat.opacity = Math.max(0, x.life / .18);
      if (x.life <= 0) { scene.remove(x.m, x.s); x.mat.dispose(); beams.splice(n, 1); }
    }
    // stepping out of the house: two seconds nobody can hit you, so the door isn't a trap
    const meIn = inHouse(player.pos);
    if (me.wasIn && !meIn) me.safe = 2;
    me.wasIn = meIn;
    me.safe = Math.max(0, me.safe - dt);
    const meOk = !meIn && me.safe <= 0;
    const open = (o) => !inHouse(o.pos) && o.safe <= 0;
    for (const b of bots) {
      b.t += dt;
      const bIn = inHouse(b.pos);
      if (b.wasIn && !bIn) b.safe = 2;
      b.wasIn = bIn;
      b.safe = Math.max(0, b.safe - dt);
      const safe = bIn;
      // who to shoot: the closest one in sight, looked for a few times a second
      b.scan -= dt;
      if (live && !safe && b.scan <= 0) {
        b.scan = .25;
        const eye = eyeOf(b);
        let best = null, bd = 28;
        const cands = [...(meOk ? [['me', player.pos]] : []), ...bots.filter(o => o !== b && open(o)).map(o => [o, o.pos])];
        for (const [who, p] of cands) {
          const d = eye.distanceTo(p);
          if (d < bd && clear(eye, chest(p))) { best = who; bd = d; }
        }
        if (best !== b.target) b.react = rand(.45, .85);
        b.target = best;
      }
      if (b.target === 'me' && !meOk) b.target = null;
      if (b.target && b.target !== 'me' && !open(b.target)) b.target = null;
      let face = null;
      if (b.target && live) {
        face = b.target === 'me' ? player.pos : b.target.pos;
        b.react -= dt; b.cd -= dt;
        if (b.react <= 0 && b.cd <= 0) botFire(b, player);
      } else {
        // walk: out of the house by the door, then from one corner of the lawn to another
        if (!b.path.length) b.path.push(wanderPoint(b.pos));
        const to = b.path[0];
        tmp.copy(to).sub(b.pos).setY(0);
        const len = tmp.length();
        if (len < .3) b.path.shift();
        else if (live) { b.pos.addScaledVector(tmp, Math.min(len, 3 * dt) / len); face = to; }
      }
      if (face) b.g.rotation.y = Math.atan2(face.x - b.pos.x, face.z - b.pos.z);
      const walking = !b.target && live;
      b.g.position.set(b.pos.x, b.pos.y, b.pos.z);
      b.rig.st.speed = walking ? 3.2 : 0; b.rig.update(dt);
    }
  }

  // you pull the trigger: the first robot or player on the line, if nothing is in between
  function fire(eye, dir, muzzle, player, peers) {
    if (!running) return null;
    if (inHouse(player.pos)) return { house: true };
    const block = blockedAt(eye, dir, RANGE);
    const ray = new THREE.Ray(eye, dir);
    let best = null, bt = block;
    const onRay = new THREE.Vector3();
    const test = (who, p, safe = 0) => {
      if (inHouse(p) || safe > 0) return;
      const d2 = ray.distanceSqToSegment(tmp.set(p.x, p.y + .15, p.z), tmp2.set(p.x, p.y + 1.7, p.z), onRay);
      const t = onRay.distanceTo(eye);
      if (d2 < .38 * .38 && t < bt) { best = who; bt = t; }
    };
    for (const b of bots) test(b, b.pos, b.safe);
    for (const [id, p] of peers) test({ peer: id, name: p.name }, p.avatar.g.position);
    const end = eye.clone().addScaledVector(dir, bt);
    beam(muzzle, end, me.color);
    audio.laser();
    let tagged = null;
    if (best) {
      me.frags++;
      audio.zap();
      if (best.peer) tagged = best.peer;
      else { best.deaths++; toHouse(best); }
    }
    return { fx: { k: 'beam', a: muzzle.toArray().map(x => +x.toFixed(2)), b: end.toArray().map(x => +x.toFixed(2)) }, tagged, hit: best ? best.name : null };
  }
  function onPeerBeam(peer, fx) {
    if (!running) return;
    beam(new THREE.Vector3().fromArray(fx.a), new THREE.Vector3().fromArray(fx.b), peer.color);
    audio.laser();
  }
  // a player online got you
  function peerTagged(name) {
    if (!running || me.safe > 0) return false;
    me.deaths++; me.safe = 1.5;
    onTagged(name);
    return true;
  }

  function standings() {
    return [{ name: 'toi', color: me.color, me: true, frags: me.frags, deaths: me.deaths }, ...bots.map(b => ({ name: b.name, color: b.color, frags: b.frags, deaths: b.deaths }))]
      .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
  }

  return {
    start, stop, update, fire, onPeerBeam, peerTagged, standings,
    get active() { return running; },
    get me() { return me; },
    get bots() { return bots; },
    set onTagged(f) { onTagged = f; },
  };
}
