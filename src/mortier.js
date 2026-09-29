// mortier.js, the firework mortars pinched from the blockade's bag (blocus.js): f fires one where
// you look, a little upward; a cardboard tube with its fuse flies off spitting sparks and bursts
// into colours with a bang after ~1.2 s. Harmless, mostly: a shove to whoever is close, passers-by
// and moles run off; one that hits the ground first bursts there and leaves a small hole.
// The others see it through one fx (where from, which way): every client flies the same rocket.
import * as THREE from 'three';
import { createPoints } from './blocus-fx.js';

export const FUSE = 1.2, SPEED = 17, LIFT = 7, HOLE = .8;
const COLS = [[1, .25, .2], [.35, 1, .35], [1, .8, .25], [.35, .55, 1], [1, .4, .85]];

// where a rocket is `t` s after leaving `p` going `d` (unit): straight on, lifted, a little gravity
export function rocketAt(p, d, t, out = {}) {
  out.x = p[0] + d[0] * SPEED * t;
  out.y = p[1] + (d[1] * SPEED + LIFT) * t - 3 * t * t;
  out.z = p[2] + d[2] * SPEED * t;
  return out;
}

// hooks: ground(x, y, z) → solid?; carve(x, y, z, r) (mine only); burst(x, y, z, mine): push, scare…
export function createMortiers({ scene, sfx = null, hooks = {} }) {
  const root = new THREE.Group(); root.userData.keep = true; scene.add(root);
  const fx = createPoints(root, { max: 700, additive: true });
  const puffs = createPoints(root, { max: 160, additive: false });
  // the tube: cardboard in a bright wrap, a white band, the fuse sticking out of its tail
  const tubeGeo = new THREE.CylinderGeometry(.045, .045, .34, 10); tubeGeo.rotateX(Math.PI / 2);
  const wrapM = [0xd8403a, 0x3f7fd8, 0xe8b830, 0x8a52c8].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const capGeo = new THREE.ConeGeometry(.05, .1, 10); capGeo.rotateX(Math.PI / 2); capGeo.translate(0, 0, .22);
  const fuseGeo = new THREE.CylinderGeometry(.006, .006, .12, 4); fuseGeo.rotateX(Math.PI / 2); fuseGeo.translate(0, 0, -.22);
  const capM = new THREE.MeshLambertMaterial({ color: 0xf4f0e6 }), fuseM = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const pool = Array.from({ length: 6 }, (_, k) => {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    g.add(new THREE.Mesh(tubeGeo, wrapM[k % wrapM.length]), new THREE.Mesh(capGeo, capM), new THREE.Mesh(fuseGeo, fuseM));
    return { g, on: false, p: [0, 0, 0], d: [0, 0, 1], t: 0, mine: false, col: 0 };
  });
  const _a = {}, _b = {}, _v = new THREE.Vector2();
  let next = 0;

  function burst(x, y, z, r, mine, low) {
    const [cr, cg, cb] = COLS[r.col], [c2r, c2g, c2b] = COLS[(r.col + 2) % COLS.length];
    const n = low ? 50 : 90, sp = low ? 5 : 7;
    for (let k = 0; k < n; k++) {
      const u = low ? Math.random() : Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = sp * (.7 + Math.random() * .5), two = k % 3 === 0;
      fx.spawn(x, y, z, Math.cos(th) * s * v, u * v, Math.sin(th) * s * v, 1 + Math.random() * .7, .45, .12, two ? c2r : cr, two ? c2g : cg, two ? c2b : cb, 1, 1.4, 2.2);
    }
    fx.spawn(x, y, z, 0, 0, 0, .22, 6, 9, 1, .9, .7, .9);
    for (let k = 0; k < 10; k++) puffs.spawn(x, y, z, (Math.random() - .5) * 2, Math.random(), (Math.random() - .5) * 2, 1.6, .4, 1.8, .75, .74, .72, .45, 1.2, -.1);
    sfx?.burst(x, y, z, true);
    if (low && mine) hooks.carve?.(x, y, z, HOLE);
    hooks.burst?.(x, y, z, mine);
  }

  return {
    root,
    // from p (array), towards d (unit array); mine: mine to dig with
    fire(p, d, mine = true) {
      const r = pool[next]; next = (next + 1) % pool.length;
      Object.assign(r, { on: true, p: [...p], d: [...d], t: 0, mine, col: Math.floor(Math.random() * COLS.length) });
      r.g.visible = true;
      if (globalThis.navigator?.userActivation?.hasBeenActive ?? true) sfx?.ensure?.();
      sfx?.launch(p[0], p[2], FUSE, p[1], true);
      for (let k = 0; k < 8; k++) puffs.spawn(p[0], p[1], p[2], (Math.random() - .5) * .6 - d[0], .4, (Math.random() - .5) * .6 - d[2], .9, .2, .8, .85, .85, .82, .5, 2);
      return r;
    },
    get live() { return pool.filter(r => r.on).length; },
    update(dt, camera, renderer) {
      for (const r of pool) {
        if (!r.on) continue;
        const t0 = r.t; r.t = Math.min(FUSE, r.t + dt);
        rocketAt(r.p, r.d, t0, _a); rocketAt(r.p, r.d, r.t, _b);
        r.g.position.set(_b.x, _b.y, _b.z);
        r.g.lookAt(_b.x + (_b.x - _a.x), _b.y + (_b.y - _a.y), _b.z + (_b.z - _a.z));
        for (let s = 0; s < 3; s++) fx.spawn(_b.x, _b.y, _b.z, (Math.random() - .5) * 1.2, -.5 - Math.random(), (Math.random() - .5) * 1.2, .3 + Math.random() * .3, .16, .05, 1, .75, .3, 1, 1, 2);
        // into the ground (or a wall) before its time: it bursts there
        const low = r.t > .05 && !!hooks.ground?.(_b.x, _b.y, _b.z);
        if (low || r.t >= FUSE) { r.on = false; r.g.visible = false; burst(_b.x, _b.y + (low ? .15 : 0), _b.z, r, r.mine, low); }
      }
      const h = renderer ? renderer.getDrawingBufferSize(_v).y : 720;
      const scale = (camera?.projectionMatrix.elements[5] ?? 1.4) * h * .5;
      fx.update(dt, scale); puffs.update(dt, scale);
    },
  };
}
