// paint.js, the paint game: blobs of colour lobbed into the hole, and robot drones that
// paint it their own colour on top. When the time is up, the most ground wins.
import * as THREE from 'three';

const G = 14;                 // blobs fall a little slower than you do
const ZONE = 24;              // metres of hole that count
const SPLAT = 0.95;           // splat radius, metres
export const PAINT_COLORS = [0xff3fa4, 0x7cff3a, 0x28d7ff, 0xffd21e, 0x9b4dff, 0xff8a1e, 0x3affd8];
const rand = (a, b) => a + Math.random() * (b - a);

function droneMesh(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .4 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: .6, roughness: .4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), paint);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .04, 6, 28), metal);
  ring.rotation.x = Math.PI / 2;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, .28, 10), metal);
  nozzle.position.y = -.36;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  eye.position.set(0, .06, .3);
  const rotors = [];
  for (let n = 0; n < 4; n++) {
    const a = n * Math.PI / 2 + Math.PI / 4;
    const r = new THREE.Mesh(new THREE.BoxGeometry(.36, .015, .05), metal);
    r.position.set(Math.cos(a) * .62, .06, Math.sin(a) * .62);
    rotors.push(r);
  }
  g.add(body, ring, nozzle, eye, ...rotors);
  g.traverse(o => { o.castShadow = true; });
  return { g, rotors, paint };
}

export function createPaint({ scene, terrain, audio, debris }) {
  const blobGeo = new THREE.SphereGeometry(.13, 10, 8);
  const blobMats = new Map();
  const blobMat = (c) => { if (!blobMats.has(c)) blobMats.set(c, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); return blobMats.get(c); };
  const blobs = [];
  let teams = [];               // teams[0] unused; 1 = you, then drones, then the others online
  let zone = new Set(), zoneList = [];
  let drones = [];
  const peerTeam = new Map();
  let running = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function setColors() { terrain.setPaintColors(teams.slice(1).map(t => t.color)); }
  function addTeam(name, color, extra = {}) { teams.push({ name, color, count: 0, ...extra }); setColors(); return teams.length - 1; }

  function start({ myColor, bots }) {
    stop();
    running = true;
    zoneList = terrain.exposedCells(ZONE);
    zone = new Set(zoneList);
    teams = [null];
    addTeam('toi', myColor, { me: true });
    const used = new Set([myColor]);
    for (let n = 0; n < bots; n++) {
      const color = PAINT_COLORS.find(c => !used.has(c));
      used.add(color);
      const team = addTeam(['drone Pinceau', 'drone Rouleau', 'drone Pochoir'][n], color, { bot: true });
      const m = droneMesh(color);
      const d = { ...m, team, pos: new THREE.Vector3(rand(-6, 6), rand(3, 5), rand(-4, 6)), to: new THREE.Vector3(), cd: rand(.5, 1.2), stun: 0, t: Math.random() * 9 };
      d.to.copy(d.pos);
      d.g.position.copy(d.pos);
      scene.add(d.g);
      drones.push(d);
    }
  }
  function stop() {
    for (const b of blobs) scene.remove(b.mesh);
    blobs.length = 0;
    for (const d of drones) scene.remove(d.g);
    drones = [];
    peerTeam.clear();
    terrain.clearPaint();
    running = false;
    teams = [null];
    zone = new Set(); zoneList = [];
  }

  function throwBlob(from, vel, team, mine) {
    const mesh = new THREE.Mesh(blobGeo, blobMat(teams[team].color));
    mesh.position.copy(from);
    scene.add(mesh);
    blobs.push({ mesh, p: from.clone(), v: vel.clone(), team, mine, life: 4 });
  }

  function splat(at, team, mine) {
    const changes = terrain.paintBall(at, SPLAT, team);
    for (const [n, old] of changes) {
      if (!zone.has(n)) continue;
      if (old && teams[old]) teams[old].count--;
      teams[team].count++;
    }
    debris?.burst(at, tmp2.set(0, 1, 0), teams[team].color, 6, .6);
    if (mine) audio.splat();
  }

  // you: a blob straight out of the blaster
  function fire(muzzle, dir) {
    if (!running) return null;
    const v = dir.clone().multiplyScalar(19);
    throwBlob(muzzle, v, 1, true);
    audio.squirt();
    return { k: 'blob', p: muzzle.toArray().map(x => +x.toFixed(2)), v: v.toArray().map(x => +x.toFixed(2)) };
  }
  // someone else in the garden, playing too
  function onPeerBlob(id, peer, fx) {
    if (!running) return;
    if (!peerTeam.has(id)) peerTeam.set(id, addTeam(peer.name, peer.color));
    throwBlob(tmp.fromArray(fx.p), tmp2.fromArray(fx.v), peerTeam.get(id), false);
  }

  // a drone lobs at a patch of ground near it, rather one that isn't its colour yet
  function droneShot(d) {
    let best = null;
    for (let n = 0; n < 10 && zoneList.length; n++) {
      const c = zoneList[Math.floor(Math.random() * zoneList.length)];
      terrain.cellCenter(c, tmp);
      if (Math.hypot(tmp.x - d.pos.x, tmp.z - d.pos.z) > 9) continue;
      best = c;
      if (terrain.paintOf(c) !== d.team) break;
    }
    if (best == null) return;
    const to = terrain.cellCenter(best, new THREE.Vector3());
    to.y += .25;
    const from = d.pos.clone().setY(d.pos.y - .45);
    const T = Math.min(.9, Math.max(.35, from.distanceTo(to) / 12));
    const v = to.sub(from).divideScalar(T);
    v.y += .5 * G * T;
    throwBlob(from, v, d.team, false);
  }

  function update(dt, live) {
    for (const d of drones) {
      d.t += dt;
      d.rotors.forEach((r, n) => { r.rotation.y += dt * (d.stun > 0 ? 3 : 30) * (n % 2 ? 1 : -1); });
      if (d.stun > 0) {
        d.stun -= dt;
        d.g.rotation.z = Math.sin(d.t * 18) * .3;
        d.paint.emissiveIntensity = (Math.sin(d.t * 30) > 0) ? .9 : .1;
        continue;
      }
      d.g.rotation.z *= .9; d.paint.emissiveIntensity = .35;
      if (d.pos.distanceTo(d.to) < .4) d.to.set(rand(-6.5, 6.5), rand(2.2, 5), rand(-6.5, 6.5));
      tmp.copy(d.to).sub(d.pos);
      const len = tmp.length();
      if (len > 0) d.pos.addScaledVector(tmp, Math.min(len, 2.8 * dt) / len);
      d.g.position.copy(d.pos).setY(d.pos.y + Math.sin(d.t * 2.3) * .12);
      d.g.rotation.y = Math.atan2(tmp.x, tmp.z);
      if (!live) continue;
      d.cd -= dt;
      if (d.cd <= 0) { d.cd = rand(.4, .6); droneShot(d); }
    }
    for (let n = blobs.length - 1; n >= 0; n--) {
      const b = blobs[n];
      b.life -= dt;
      b.v.y -= G * dt;
      const step = b.v.length() * dt;
      tmp.copy(b.v).normalize();
      // your paint knocks a drone out for a few seconds
      if (b.mine) for (const d of drones) {
        if (d.stun > 0) continue;
        const ray = new THREE.Ray(b.p, tmp);
        if (ray.distanceSqToPoint(d.pos) < .55 * .55 && b.p.distanceTo(d.pos) < step + .6) { d.stun = 3; audio.bonk(); b.life = 0; break; }
      }
      const hit = b.life > 0 && terrain.raycast(b.p, tmp, step);
      if (hit || b.life <= 0) {
        if (hit && hit.inside) splat(hit.point, b.team, b.mine);
        scene.remove(b.mesh);
        blobs.splice(n, 1);
        continue;
      }
      b.p.addScaledVector(b.v, dt);
      b.mesh.position.copy(b.p);
    }
  }

  const pct = (t) => zoneList.length ? t.count / zoneList.length * 100 : 0;
  function standings() {
    return teams.slice(1).map(t => ({ name: t.name, color: t.color, me: !!t.me, pct: pct(t) })).sort((a, b) => b.pct - a.pct);
  }
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  // one bar, split between the colours, the bare ground left grey
  function bar() {
    return `<div class="paintbar">${standings().map(s => `<i style="width:${s.pct}%;background:${hex(s.color)}"></i>`).join('')}</div>`;
  }

  return {
    start, stop, update, fire, onPeerBlob, standings, bar,
    get active() { return running; },
    get mine() { return teams[1] ? pct(teams[1]) : 0; },
    get drones() { return drones; },
  };
}
