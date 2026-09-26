// rocket.js, the moon rocket in five parts (engine, fins, tank, cockpit, nose cone),
// each shown once found. The same model stands on the pad in the garden and, as the
// lander, on the moon.
import * as THREE from 'three';
import * as V from './vehicles.js';

export const PARTS = [
  { id: 'p_moteur',    name: 'moteur' },
  { id: 'p_ailerons',  name: 'ailerons' },
  { id: 'p_reservoir', name: 'réservoir' },
  { id: 'p_cockpit',   name: 'cockpit' },
  { id: 'p_coiffe',    name: 'coiffe' },
];

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .35, ...extra });

// turned shapes: the engine bell and the nose cone
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const bell = (k = 1) => lathe([[.95, 0], [.9, .1], [.76, .32], [.62, .58], [.53, .9]].map(([r, y]) => [r * k, y * k]));
const ogive = (k = 1) => lathe(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return [.75 * Math.cos(t * Math.PI / 2) ** .8 * k, 1.6 * t * k]; }));
const finShape = () => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.9, -.35); sh.quadraticCurveTo(1.22, -.46, 1.16, -.1);
  sh.lineTo(1.02, .6); sh.quadraticCurveTo(.62, 1.6, 0, 2.2); sh.lineTo(0, 0);
  return sh;
};
// the tank's skin: panel lines, rivets and the red and white checks
const skin = (() => {
  let t = null;
  return () => t || (t = V.paintTex(512, 256, (c, w, h) => {
    c.fillStyle = '#f0ece2'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(40,30,20,.14)'; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 2, h);
    for (const y of [22, h - 22]) for (let x = 8; x < w; x += 16) { c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#c4302a' : '#f0ece2'; c.fillRect(i * 32, 112 + j * 32, 32, 32); }
    c.fillStyle = '#15121c'; c.fillRect(0, 110, w, 3); c.fillRect(0, 175, w, 3);
    c.font = '900 40px Rubik, system-ui, sans-serif'; c.fillStyle = '#c4302a'; c.textAlign = 'center'; c.fillText('A HOLE', w * .75, 80);
  }));
})();

// a small version of each part, for the ground (a buried find) or the shelf
export function partModel(id) {
  const g = new THREE.Group();
  const white = M(0xf0ece2), gold = M(0xd9a125, { metalness: .8, roughness: .3 }), dark = M(0x2a2d33, { metalness: .6 }), red = M(0xc4302a);
  if (id === 'p_moteur') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .3, 16), dark));
    const noz = new THREE.Mesh(bell(.32), M(0xd9a125, { metalness: .8, roughness: .3, side: THREE.DoubleSide }));
    noz.position.y = -.44; g.add(noz);
  } else if (id === 'p_ailerons') {
    for (let n = 0; n < 3; n++) {
      const f = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape(), { depth: .02, bevelEnabled: true, bevelSize: .01, bevelThickness: .01, bevelSegments: 1 }), red);
      f.scale.setScalar(.22); f.position.y = -.2; f.rotation.y = n * 2.1; f.translateX(.14);
      g.add(f);
    }
  } else if (id === 'p_reservoir') {
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(.2, .4, 6, 14), M(0xffffff, { map: skin() })));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .06, 16), gold); g.add(b);
  } else if (id === 'p_cockpit') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .24, .3, 16), white));
    const w = new THREE.Mesh(new THREE.CircleGeometry(.09, 16), V.glass(false));
    w.position.set(0, .02, .235); g.add(w);
    const r = new THREE.Mesh(new THREE.TorusGeometry(.09, .015, 6, 16), gold); r.position.copy(w.position); g.add(r);
  } else {
    const c = new THREE.Mesh(ogive(.3), red); c.position.y = -.24; g.add(c);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.05), gold); tip.position.y = .26; g.add(tip);
  }
  return g;
}

// the full rocket, about 7 m tall, parts toggled by setParts()
export function createRocket() {
  const g = new THREE.Group();
  const white = M(0xf0ece2), gold = M(0xd9a125, { metalness: .8, roughness: .3 }), dark = M(0x2a2d33, { metalness: .6 }), red = M(0xc4302a, { roughness: .35 });
  const parts = {};
  const part = (id) => { const p = new THREE.Group(); g.add(p); parts[id] = p; return p; };
  const put = (geo, m, p, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };

  const engine = part('p_moteur');
  put(new THREE.CylinderGeometry(.8, .8, .8, 28), dark, engine, 0, 1.2, 0);
  for (const y of [.84, 1.56]) put(new THREE.TorusGeometry(.8, .045, 8, 32), gold, engine, 0, y, 0).rotation.x = Math.PI / 2;
  for (let n = 0; n < 8; n++) { const a = n / 8 * Math.PI * 2; put(V.roundBox(.1, .5, .1, .03), dark, engine, Math.cos(a) * .82, 1.2, Math.sin(a) * .82); }
  put(bell(), M(0xd9a125, { metalness: .8, roughness: .3, side: THREE.DoubleSide }), engine, 0, 0, 0);
  put(new THREE.CircleGeometry(.52, 24), M(0x1a1410, { emissive: 0x3a1a08 }), engine, 0, .85, 0).rotation.x = Math.PI / 2;

  const fins = part('p_ailerons');
  const finGeo = new THREE.ExtrudeGeometry(finShape(), { depth: .06, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 3, curveSegments: 8 });
  for (let n = 0; n < 4; n++) {
    const f = new THREE.Mesh(finGeo, red);
    f.position.y = .9; f.rotation.y = n * Math.PI / 2; f.translateX(.72); f.translateZ(-.03);
    fins.add(f);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), gold); pad.position.set(1.16, -.38, .03); f.add(pad);
  }

  const tank = part('p_reservoir');
  put(new THREE.CylinderGeometry(.85, .85, 2.6, 32), M(0xffffff, { map: skin(), roughness: .4 }), tank, 0, 2.9, 0);
  for (const y of [1.65, 4.15]) put(new THREE.TorusGeometry(.86, .07, 8, 32), gold, tank, 0, y, 0).rotation.x = Math.PI / 2;
  const ladder = put(V.roundBox(.12, 2.3, .05, .02), dark, tank, 0, 2.9, -.87); void ladder;

  const cockpit = part('p_cockpit');
  put(new THREE.CylinderGeometry(.75, .85, 1.1, 32), white, cockpit, 0, 4.75, 0);
  // the front window, and two small portholes round the sides
  for (const [a, r] of [[0, .3], [2.1, .16], [-2.1, .16]]) {
    const w = new THREE.Group(); w.rotation.y = a; cockpit.add(w);
    const gl = put(new THREE.CircleGeometry(r, 24), V.glass(false), w, 0, 4.8, .805); gl.rotation.x = -.09;
    put(new THREE.TorusGeometry(r, .045, 8, 24), gold, w, 0, 4.8, .8).rotation.x = -.09;
  }

  const cone = part('p_coiffe');
  put(ogive(), red, cone, 0, 5.3, 0);
  put(new THREE.TorusGeometry(.74, .05, 8, 32), white, cone, 0, 5.36, 0).rotation.x = Math.PI / 2;
  put(new THREE.SphereGeometry(.12, 12, 8), gold, cone, 0, 6.95, 0);
  put(new THREE.CylinderGeometry(.015, .02, .5, 6), gold, cone, 0, 7.2, 0);

  // the flame, for take-off: a hot white core inside an orange plume
  const flame = new THREE.Group(); flame.position.y = -1.1; flame.visible = false; g.add(flame);
  const fm = (c, k, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [r, h, c, k, o] of [[.62, 2.8, 0xff7a20, 1.4, .7], [.4, 2.2, 0xffc060, 2.2, .85], [.2, 1.4, 0xfff4e0, 3.2, 1]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18, 1, true), fm(c, k, o)); f.rotation.x = Math.PI; f.position.y = 1.1 - h / 2 - .02; flame.add(f);
  }
  g.traverse(o => { if (o.isMesh && o.parent !== flame) { o.castShadow = true; o.receiveShadow = true; } });

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
