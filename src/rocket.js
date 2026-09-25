// rocket.js, the moon rocket in five parts (engine, fins, tank, cockpit, nose cone),
// each shown once found. The same model stands on the pad in the garden and, as the
// lander, on the moon.
import * as THREE from 'three';

export const PARTS = [
  { id: 'p_moteur',    name: 'moteur' },
  { id: 'p_ailerons',  name: 'ailerons' },
  { id: 'p_reservoir', name: 'réservoir' },
  { id: 'p_cockpit',   name: 'cockpit' },
  { id: 'p_coiffe',    name: 'coiffe' },
];

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .35, ...extra });

// a small version of each part, for the ground (a buried find) or the shelf
export function partModel(id) {
  const g = new THREE.Group();
  const white = M(0xf0ece2), gold = M(0xd9a125, { metalness: .8, roughness: .3 }), dark = M(0x2a2d33, { metalness: .6 }), red = M(0xc4302a);
  if (id === 'p_moteur') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .3, 16), dark));
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(.14, .3, .35, 16, 1, true), gold);
    noz.material.side = THREE.DoubleSide; noz.position.y = -.3; g.add(noz);
  } else if (id === 'p_ailerons') {
    for (let n = 0; n < 3; n++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(.04, .45, .3), red);
      f.position.set(Math.cos(n * 2.1) * .2, 0, Math.sin(n * 2.1) * .2); f.rotation.y = -n * 2.1;
      g.add(f);
    }
  } else if (id === 'p_reservoir') {
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(.2, .4, 6, 14), white));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .06, 16), gold); g.add(b);
  } else if (id === 'p_cockpit') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .24, .3, 16), white));
    const w = new THREE.Mesh(new THREE.CircleGeometry(.09, 16), M(0x6ab8e8, { emissive: 0x1a4a6a }));
    w.position.set(0, .02, .23); g.add(w);
  } else {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 16), red));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.05), gold); tip.position.y = .26; g.add(tip);
  }
  return g;
}

// the full rocket, about 7 m tall, parts toggled by setParts()
export function createRocket() {
  const g = new THREE.Group();
  const white = M(0xf0ece2), gold = M(0xd9a125, { metalness: .8, roughness: .3 }), dark = M(0x2a2d33, { metalness: .6 }), red = M(0xc4302a);
  const parts = {};
  const part = (id) => { const p = new THREE.Group(); g.add(p); parts[id] = p; return p; };

  const engine = part('p_moteur');
  const eb = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .8, 24), dark); eb.position.y = 1.2; engine.add(eb);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(.5, .95, .9, 24, 1, true), gold);
  noz.material.side = THREE.DoubleSide; noz.position.y = .45; engine.add(noz);

  const fins = part('p_ailerons');
  for (let n = 0; n < 4; n++) {
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1.1, -.3); shape.lineTo(1.1, .4); shape.lineTo(0, 2.2);
    const f = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false }), red);
    f.position.y = .9; f.rotation.y = n * Math.PI / 2; f.translateX(.72); f.translateZ(-.04);
    fins.add(f);
  }

  const tank = part('p_reservoir');
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, 2.6, 28), white); tb.position.y = 2.9; tank.add(tb);
  for (const y of [1.75, 4.05]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.87, .87, .14, 28), gold); b.position.y = y; tank.add(b); }

  const cockpit = part('p_cockpit');
  const cb = new THREE.Mesh(new THREE.CylinderGeometry(.75, .85, 1.1, 28), white); cb.position.y = 4.75; cockpit.add(cb);
  const win = new THREE.Mesh(new THREE.CircleGeometry(.3, 24), M(0x6ab8e8, { emissive: 0x1a4a6a, metalness: .5 }));
  win.position.set(0, 4.8, .8); win.rotation.x = -.1; cockpit.add(win);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .04, 8, 24), gold); ring.position.copy(win.position); ring.rotation.x = -.1; cockpit.add(ring);

  const cone = part('p_coiffe');
  const cn = new THREE.Mesh(new THREE.ConeGeometry(.75, 1.6, 28), red); cn.position.y = 6.1; cone.add(cn);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), gold); tip.position.y = 6.95; cone.add(tip);

  // the flame, for take-off
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.6, 2.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = Math.PI; flame.position.y = -1.1; flame.visible = false;
  g.add(flame);
  g.traverse(o => { if (o.isMesh && o !== flame) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    group: g, flame,
    setParts(have, ghost = true) {
      for (const p of PARTS) {
        const on = !!have[p.id];
        parts[p.id].visible = on || ghost;
        parts[p.id].traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = !on; o.material.opacity = on ? 1 : .18; o.material.depthWrite = on; } });
      }
    },
  };
}
