// animals.js, the neighbours with fur and feathers. They wander the lawn outside the
// plot, bolt when you come close, run out of breath, and can be caught with a quick
// swipe. The farm down the road takes them in (the sell crate pays for them).
import * as THREE from 'three';

// speed in m/s (a sprint is 6.2), flee = how close before they bolt, w = how common
export const ANIMAL = {
  lapin:   { name: 'lapin',      value: 60,  speed: 5.4, flee: 5,   w: 5, where: ['home', 'china'] },
  poule:   { name: 'poule',      value: 35,  speed: 3.8, flee: 4,   w: 4, where: ['home'] },
  herisson: { name: 'hérisson',  value: 90,  speed: 1.8, flee: 3,   w: 2, where: ['home'], prickly: true },
  renard:  { name: 'renard',     value: 180, speed: 6.3, flee: 7,   w: 1.5, where: ['home'], night: true },
  cerf:    { name: 'cerf',       value: 400, speed: 7.2, flee: 9,   w: .8, where: ['home'] },
  panda:   { name: 'tanuki',     value: 500, speed: 4.4, flee: 5,   w: 2, where: ['china'] },
  grue:    { name: 'grue',       value: 350, speed: 5.6, flee: 7,   w: 2, where: ['china'] },
};

const L = (c) => new THREE.MeshLambertMaterial({ color: c });
const add = (g, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
const sph = (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b);
const cyl = (r1, r2, h, n = 6) => new THREE.CylinderGeometry(r1, r2, h, n);

// every model faces +z, feet at y = 0
function build(id) {
  const g = new THREE.Group();
  const legs = [];
  const leg = (mat, x, z, h, r = .025) => { const p = new THREE.Group(); p.position.set(x, h, z); add(p, cyl(r, r, h), mat, 0, -h / 2, 0); g.add(p); legs.push(p); };
  const eye = L(0x111111);
  switch (id) {
    case 'lapin': {
      const fur = L(Math.random() < .3 ? 0xf2efe8 : 0xa89478);
      add(g, sph(.18), fur, 0, .18, 0, 1, .85, 1.3);
      add(g, sph(.11), fur, 0, .3, .2);
      for (const x of [-.04, .04]) { const e = add(g, new THREE.BoxGeometry(.035, .2, .06), fur, x, .45, .18); e.rotation.x = -.2; }
      for (const x of [-.05, .05]) add(g, sph(.018), eye, x, .33, .29);
      add(g, sph(.06), L(0xffffff), 0, .22, -.24);
      break;
    }
    case 'poule': {
      const w = L(0xf4efe4);
      add(g, sph(.2), w, 0, .3, 0, 1, .9, 1.2);
      add(g, sph(.1), w, 0, .5, .16);
      add(g, new THREE.BoxGeometry(.03, .08, .1), L(0xd42a2a), 0, .6, .16);
      add(g, new THREE.ConeGeometry(.03, .08, 5), L(0xf0b030), 0, .49, .27).rotation.x = Math.PI / 2;
      add(g, new THREE.ConeGeometry(.1, .18, 6), w, 0, .38, -.22).rotation.x = -1;
      for (const x of [-.06, .06]) add(g, sph(.015), eye, x, .53, .24);
      for (const x of [-.06, .06]) leg(L(0xf0b030), x, 0, .14, .015);
      break;
    }
    case 'herisson': {
      const spikes = new THREE.Mesh(new THREE.IcosahedronGeometry(.2, 0), L(0x4a3424));
      spikes.position.y = .14; spikes.scale.set(1, .7, 1.3);
      g.add(spikes);
      for (let n = 0; n < 14; n++) {
        const s = add(g, new THREE.ConeGeometry(.025, .12, 4), L(0x2e2018), (Math.random() - .5) * .3, .2 + Math.random() * .08, (Math.random() - .5) * .35);
        s.rotation.set((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2);
      }
      add(g, new THREE.ConeGeometry(.07, .15, 6), L(0xc8a888), 0, .1, .28).rotation.x = Math.PI / 2;
      add(g, sph(.02), eye, 0, .1, .36);
      break;
    }
    case 'renard': {
      const o = L(0xd9652b), w = L(0xf4efe4), d = L(0x2a1a14);
      add(g, sph(.2), o, 0, .38, 0, .9, .8, 1.7);
      add(g, sph(.13), o, 0, .52, .36);
      add(g, new THREE.ConeGeometry(.07, .2, 6), w, 0, .5, .52).rotation.x = Math.PI / 2;
      for (const x of [-.07, .07]) add(g, new THREE.ConeGeometry(.045, .12, 4), o, x, .66, .34);
      for (const x of [-.05, .05]) add(g, sph(.018), eye, x, .56, .46);
      const tail = add(g, cyl(.02, .09, .45, 7), o, 0, .42, -.46); tail.rotation.x = -1.1;
      add(g, sph(.07), w, 0, .52, -.64);
      for (const [x, z] of [[-.08, .18], [.08, .18], [-.08, -.18], [.08, -.18]]) leg(d, x, z, .26);
      break;
    }
    case 'cerf': {
      const b = L(0x8a5a3a), c = L(0xd8c0a0), a = L(0xe8dcc0);
      add(g, new THREE.BoxGeometry(.35, .38, .9), b, 0, .95, 0);
      const neck = add(g, cyl(.08, .11, .5), b, 0, 1.25, .42); neck.rotation.x = .5;
      add(g, new THREE.BoxGeometry(.18, .18, .32), b, 0, 1.48, .6);
      add(g, sph(.06), c, 0, .98, -.48);
      for (const x of [-.06, .06]) add(g, sph(.022), eye, x, 1.52, .72);
      for (const s of [-1, 1]) {
        const an = add(g, cyl(.015, .02, .4), a, s * .08, 1.75, .56); an.rotation.z = -s * .4;
        const t1 = add(g, cyl(.012, .012, .18), a, s * .16, 1.85, .62); t1.rotation.x = .8;
      }
      for (const [x, z] of [[-.12, .35], [.12, .35], [-.12, -.35], [.12, -.35]]) leg(b, x, z, .78, .035);
      break;
    }
    case 'panda': {
      const r = L(0xc2482a), w = L(0xf4efe4), d = L(0x2a1a14);
      add(g, sph(.2), r, 0, .3, 0, 1, .85, 1.4);
      add(g, sph(.14), r, 0, .45, .3);
      for (const x of [-.06, .06]) add(g, sph(.045), w, x, .47, .41);
      for (const x of [-.1, .1]) add(g, sph(.05), w, x, .58, .28);
      for (const x of [-.05, .05]) add(g, sph(.018), eye, x, .5, .44);
      for (let n = 0; n < 5; n++) add(g, cyl(.07, .07, .09, 8), n % 2 ? r : L(0xe8b890), 0, .32 + n * .02, -.34 - n * .08).rotation.x = -1.2;
      for (const [x, z] of [[-.1, .18], [.1, .18], [-.1, -.16], [.1, -.16]]) leg(d, x, z, .16, .04);
      break;
    }
    case 'grue': {
      const w = L(0xf4f4f0), k = L(0x1a1a1a);
      add(g, sph(.22), w, 0, .9, 0, .8, .8, 1.4);
      const neck = add(g, cyl(.03, .045, .6), w, 0, 1.25, .25); neck.rotation.x = .35;
      add(g, sph(.07), w, 0, 1.55, .36);
      add(g, sph(.04), L(0xd42a2a), 0, 1.6, .36);
      add(g, new THREE.ConeGeometry(.02, .18, 5), L(0x5a5a40), 0, 1.53, .48).rotation.x = Math.PI / 2;
      add(g, new THREE.ConeGeometry(.14, .3, 6), k, 0, .88, -.3).rotation.x = -1.2;
      for (const x of [-.06, .06]) leg(k, x, 0, .72, .015);
      break;
    }
  }
  return { g, legs };
}

export function createAnimals(root, { world, center, blocked, count = () => 6, isNight = () => false }) {
  const list = [];
  const scene = new THREE.Group();
  root.add(scene);
  const species = Object.keys(ANIMAL).filter(id => ANIMAL[id].where.includes(world));
  const tmp = new THREE.Vector3();

  function pick() {
    const night = isNight();
    const ws = species.map(id => ANIMAL[id].w * (ANIMAL[id].night && night ? 3 : 1));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let n = 0; n < species.length; n++) { r -= ws[n]; if (r <= 0) return species[n]; }
    return species[0];
  }
  function randomSpot(rMin, rMax) {
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (!blocked(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(center.x + 30, 0, center.z);
  }
  function spawn() {
    const id = pick();
    const m = build(id);
    // its own shape, facing +z at the origin: what a disc has to touch
    const box = new THREE.Box3().setFromObject(m.g).expandByScalar(.04);
    const pos = randomSpot(24, 36);
    m.g.position.copy(pos);
    m.g.scale.setScalar(.01);
    scene.add(m.g);
    list.push({ id, def: ANIMAL[id], ...m, pos, target: randomSpot(12, 34), state: 'wander', t: 0, stamina: 1, rest: 0, heading: Math.random() * 6, born: 0, gone: false,
      // for the portals: how it moves, the height of its middle, and whether it's flying out of one
      vel: new THREE.Vector3(), size: id === 'cerf' ? .9 : id === 'grue' ? .8 : .22, fly: false, box });
  }

  function update(dt, player) {
    while (list.length < count()) spawn();
    const surface = player.pos.y > -1.2;
    for (let n = list.length - 1; n >= 0; n--) {
      const a = list[n];
      a.t += dt;
      a.born = Math.min(1, a.born + dt * 2);
      // thrown out of a portal: a fall, legs flailing, until it lands
      if (a.fly) {
        a.vel.y -= 18 * dt;
        a.pos.addScaledVector(a.vel, dt);
        if (a.pos.y <= 0 && a.vel.y < 0) { a.pos.y = 0; a.fly = false; a.vel.set(0, 0, 0); a.rest = .8; }
        a.g.position.copy(a.pos);
        a.g.rotation.set(0, a.heading, 0);
        a.legs.forEach((l, k) => { l.rotation.x = Math.sin(a.t * 30 + k * Math.PI) * .8; });
        continue;
      }
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      let speed = 0, dir = null;
      if (a.rest > 0) { a.rest -= dt; a.stamina = Math.min(1, a.stamina + dt * .8); }
      else if (surface && d < a.def.flee && a.stamina > 0) {
        // run: away from you, a little sideways so it isn't a straight line
        a.state = 'flee';
        dir = tmp.set(dx, 0, dz).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(a.t * 1.7) * .6);
        speed = a.def.speed;
        a.stamina -= dt / 2.6;
        if (a.stamina <= 0) a.rest = 1.3;           // out of breath: a chance to grab it
      } else {
        a.state = 'wander';
        a.stamina = Math.min(1, a.stamina + dt * .3);
        if (a.pos.distanceTo(a.target) < .8 || Math.random() < dt * .05) a.target = randomSpot(12, 34);
        dir = tmp.set(a.target.x - a.pos.x, 0, a.target.z - a.pos.z).normalize();
        speed = a.def.speed * .22;
        if (Math.sin(a.t * .7 + n) > .6) speed = 0;   // grazing
      }
      if (dir && speed) {
        let nx = a.pos.x + dir.x * speed * dt, nz = a.pos.z + dir.z * speed * dt;
        // cornered by the fence or the house: slide along it
        if (blocked(nx, nz)) {
          const turn = tmp.set(-dir.z, 0, dir.x);
          nx = a.pos.x + turn.x * speed * dt; nz = a.pos.z + turn.z * speed * dt;
          if (blocked(nx, nz)) { nx = a.pos.x; nz = a.pos.z; if (a.state === 'flee') a.rest = .8; }
        }
        const r = Math.hypot(nx - center.x, nz - center.z);
        if (r < 38) { a.pos.x = nx; a.pos.z = nz; }
        const want = Math.atan2(dir.x, dir.z);
        let dh = want - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.heading += dh * Math.min(1, dt * 8);
      }
      a.vel.set(dir && speed ? dir.x * speed : 0, 0, dir && speed ? dir.z * speed : 0);
      a.g.position.copy(a.pos);
      a.g.rotation.y = a.heading;
      const moving = speed > 0;
      const hop = a.id === 'lapin' && moving ? Math.abs(Math.sin(a.t * 12)) * .18 : 0;
      a.g.position.y = hop + (a.id === 'poule' && !moving ? Math.abs(Math.sin(a.t * 3)) * .02 : 0);
      a.legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(a.t * speed * 4 + k * Math.PI) * .6 : 0; });
      a.g.scale.setScalar(a.born);
    }
  }

  // a point (world) inside an animal's own shape?
  const loc = new THREE.Vector3();
  function touches(a, p) {
    if (a.gone || a.born < 1) return false;
    loc.subVectors(p, a.pos).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -a.heading);
    return a.box.containsPoint(loc);
  }
  // struck (a disc): knocked off its feet, lands dazed
  function knock(a, dir) {
    a.fly = true;
    a.vel.copy(dir).setY(0).normalize().multiplyScalar(3.5).setY(4);
  }
  // a swipe of the shovel: sphere per animal
  function hitTest(origin, dir, far) {
    let best = null, bt = far;
    for (const a of list) {
      const c = a.g.position.clone(); c.y += a.id === 'cerf' ? 1 : a.id === 'grue' ? .9 : .25;
      const oc = c.sub(origin);
      const t = oc.dot(dir);
      if (t < 0 || t > bt) continue;
      const r = a.id === 'cerf' || a.id === 'grue' ? .6 : .38;
      if (oc.lengthSq() - t * t < r * r) { bt = t; best = a; }
    }
    return best ? { animal: best, t: bt } : null;
  }
  function remove(a) { scene.remove(a.g); list.splice(list.indexOf(a), 1); }

  return { list, update, hitTest, remove, touches, knock, group: scene };
}
