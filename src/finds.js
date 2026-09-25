// finds.js, things people buried: each one sits in a small hidden pocket of the ground,
// out of sight until the shovel opens the pocket. Hit it to dig it out.
import * as THREE from 'three';
import { S } from './terrain.js';
import { partModel } from './rocket.js';

const L = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: .4, metalness: .5, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent && parent.add(m); return m; };

const BOTTLE_NOTES = [
  'si tu lis ceci, creuse plus vite.',
  'au secours, je suis coincé dans un trou. signé : un creuseur.',
  'le voisin aussi a un trou. le sien est plus petit.',
  'ne fais jamais confiance à une taupe.',
  'il n\'y a pas de fond. (il y en a un.)',
];

// kind: sack (goes in the sack, sold later) · coins (paid on the spot) · bomb (arms when hit)
export const FIND = {
  skel:    { name: 'squelette',          kind: 'sack',  value: 120,  cells: [5, 2, 2], quip: 'un squelette. il tenait encore une pelle.' },
  bottle:  { name: 'bouteille à la mer', kind: 'sack',  value: 15,   cells: [1, 2, 1], quip: () => '« ' + BOTTLE_NOTES[Math.floor(Math.random() * BOTTLE_NOTES.length)] + ' »' },
  dino:    { name: 'dinosaure',          kind: 'sack',  value: 2500, cells: [9, 4, 3], quip: 'un dinosaure entier. le musée va adorer.' },
  trump:   { name: 'buste doré de trump', kind: 'sack', value: 900,  cells: [3, 3, 2], quip: 'un buste doré de Trump. personne ne sait ce qu\'il faisait là.' },
  shell:   { name: 'obus',               kind: 'bomb',  value: 0,    cells: [3, 1, 1], quip: 'un vieil obus… il fait tic tac ?' },
  chest:   { name: 'coffre au trésor',   kind: 'coins', value: 0,    cells: [2, 2, 2], quip: 'un coffre au trésor !' },
  tv:      { name: 'vieille télé',       kind: 'sack',  value: 40,   cells: [2, 2, 2], quip: 'une vieille télé. elle grésille encore.' },
  sword:   { name: 'épée dans la pierre', kind: 'sack', value: 1800, cells: [2, 4, 2], quip: 'une épée dans la pierre. elle vient toute seule.' },
  alien:   { name: 'crâne alien',        kind: 'sack',  value: 3000, cells: [2, 2, 2], quip: 'un crâne… pas tout à fait humain.' },
  capsule: { name: 'capsule temporelle', kind: 'coins', value: 0,    cells: [1, 2, 1], quip: 'capsule temporelle, 1987 : une cassette, une photo floue, et de vieux billets.' },
  duck:    { name: 'canard en plastique', kind: 'sack', value: 1,    cells: [1, 1, 1], quip: 'un canard en plastique. couin.' },
  panda:   { name: 'maneki-neko de jade', kind: 'sack', value: 4000, cells: [2, 2, 2], quip: 'un maneki-neko de jade. il te fait signe.' },
  teapot:  { name: 'théière en fonte',   kind: 'sack',  value: 2600, cells: [1, 1, 1], quip: 'une théière en fonte, un tetsubin. encore tiède ?' },
  // pieces of a moon rocket, scattered by whoever tried before
  p_ailerons:  { name: 'ailerons de fusée', kind: 'part', value: 0, cells: [2, 2, 2], quip: 'des ailerons de fusée. quelqu\'un a voulu partir d\'ici.' },
  p_moteur:    { name: 'moteur de fusée',   kind: 'part', value: 0, cells: [2, 2, 2], quip: 'un moteur-fusée, au fond d\'une grotte.' },
  p_coiffe:    { name: 'coiffe de fusée',   kind: 'part', value: 0, cells: [2, 2, 2], quip: 'la coiffe d\'une fusée. encore rouge.' },
  p_reservoir: { name: 'réservoir de fusée', kind: 'part', value: 0, cells: [2, 2, 2], quip: 'un réservoir de fusée, au japon. le monde est petit.' },
};

// how many of each, and where (metres of depth)
const PLAN = {
  home: [
    ['skel', 3, 3, 60], ['bottle', 3, 0.8, 35], ['dino', 1, 30, 70], ['trump', 1, 12, 60], ['shell', 4, 5, 94],
    ['chest', 2, 20, 94], ['tv', 1, 2, 30], ['sword', 1, 40, 90], ['alien', 1, 60, 94], ['capsule', 1, 6, 40], ['duck', 2, 1, 95],
    ['p_ailerons', 1, 60, 95], ['p_moteur', 1, 180, 260], ['p_coiffe', 1, 300, 380],
  ],
  moon: [],
  mars: [],
  china: [['panda', 1, 15, 55], ['teapot', 2, 5, 50], ['shell', 2, 5, 55], ['bottle', 1, 1, 30], ['chest', 1, 20, 55], ['skel', 1, 10, 50], ['p_reservoir', 1, 30, 55]],
};

function build(id) {
  if (id.startsWith('p_')) { const p = partModel(id); p.scale.setScalar(1.4); return p; }
  const g = new THREE.Group();
  const bone = L(0xeee6cc);
  switch (id) {
    case 'skel': {
      mesh(new THREE.SphereGeometry(.16, 10, 8), bone, -.8, 0, 0, g);
      for (let n = 0; n < 5; n++) { const r = mesh(new THREE.TorusGeometry(.16, .025, 5, 12, Math.PI), bone, -.45 + n * .1, 0, 0, g); r.rotation.y = Math.PI / 2; }
      mesh(new THREE.CylinderGeometry(.03, .03, .9, 5), bone, -.2, 0, 0, g).rotation.z = Math.PI / 2;
      for (const z of [-.12, .12]) { const l = mesh(new THREE.CylinderGeometry(.03, .025, .8, 5), bone, .5, 0, z, g); l.rotation.z = Math.PI / 2; }
      for (const z of [-.25, .25]) { const a = mesh(new THREE.CylinderGeometry(.025, .02, .6, 5), bone, -.35, 0, z, g); a.rotation.z = Math.PI / 2 + .3; }
      const sh = mesh(new THREE.BoxGeometry(.18, .02, .24), M(0x777777), -.05, .05, .42, g); sh.rotation.y = .4;
      break;
    }
    case 'bottle': {
      mesh(new THREE.CylinderGeometry(.09, .09, .3, 10), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, transparent: true, opacity: .7, roughness: .1 }), 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(.03, .06, .12, 8), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, transparent: true, opacity: .7 }), 0, .2, 0, g);
      mesh(new THREE.CylinderGeometry(.03, .03, .05, 6), L(0x8a5f38), 0, .28, 0, g);
      mesh(new THREE.CylinderGeometry(.05, .05, .2, 6), L(0xfff6dc), 0, 0, 0, g);
      g.rotation.z = 1.2;
      break;
    }
    case 'dino': {
      const skull = mesh(new THREE.BoxGeometry(.6, .4, .35), bone, 1.5, .5, 0, g);
      mesh(new THREE.BoxGeometry(.4, .12, .3), bone, 1.8, .28, 0, g);
      for (let n = 0; n < 7; n++) mesh(new THREE.ConeGeometry(.025, .09, 4), bone, 1.6 + n * .05, .2, .12, g).rotation.x = Math.PI;
      for (let n = 0; n < 14; n++) mesh(new THREE.SphereGeometry(.09 - n * .004, 6, 5), bone, 1.1 - n * .2, .45 - Math.abs(n - 4) * .03, 0, g);
      for (let n = 0; n < 6; n++) { const r = mesh(new THREE.TorusGeometry(.35 - n * .03, .03, 5, 12, Math.PI), bone, .6 - n * .18, .35, 0, g); r.rotation.set(Math.PI, Math.PI / 2, 0); }
      for (const [x, z] of [[.3, .25], [.3, -.25], [-.6, .25], [-.6, -.25]]) mesh(new THREE.CylinderGeometry(.05, .04, .7, 5), bone, x, -.15, z, g);
      skull.rotation.z = -.2;
      break;
    }
    case 'trump': {
      const gold = M(0xd9a125, { metalness: .8, roughness: .25, emissive: 0x3a2400 });
      mesh(new THREE.BoxGeometry(.8, .45, .4), M(0x1f2a44, { metalness: .1, roughness: .7 }), 0, -.3, 0, g);
      mesh(new THREE.BoxGeometry(.24, .3, .02), L(0xf4f4f4), 0, -.2, .205, g);
      mesh(new THREE.BoxGeometry(.07, .32, .03), L(0xc4202a), 0, -.23, .215, g);
      mesh(new THREE.CylinderGeometry(.09, .1, .12, 10), L(0xf0a060), 0, .0, 0, g);
      const head = mesh(new THREE.SphereGeometry(.2, 16, 12), L(0xf0a060), 0, .2, 0, g);
      head.scale.set(1, 1.1, 1);
      const hair = mesh(new THREE.SphereGeometry(.21, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), L(0xffd75e), -.02, .27, -.01, g);
      hair.scale.set(1.12, .6, 1.08); hair.rotation.z = .15;
      mesh(new THREE.BoxGeometry(.3, .06, .1), L(0xffd75e), .06, .33, .15, g).rotation.z = -.2;
      for (const x of [-.07, .07]) mesh(new THREE.SphereGeometry(.02), L(0x223355), x, .22, .18, g);
      mesh(new THREE.BoxGeometry(.4, .06, .3), gold, 0, -.55, 0, g);
      break;
    }
    case 'shell': {
      const rust = M(0x5a4a38, { metalness: .6, roughness: .8 });
      const body = mesh(new THREE.CylinderGeometry(.16, .16, .7, 12), rust, 0, 0, 0, g);
      body.rotation.z = Math.PI / 2;
      const nose = mesh(new THREE.ConeGeometry(.16, .3, 12), rust, .5, 0, 0, g);
      nose.rotation.z = -Math.PI / 2;
      for (const x of [-.3, -.2]) { const f = mesh(new THREE.BoxGeometry(.04, .42, .04), rust, x, 0, 0, g); }
      const light = mesh(new THREE.SphereGeometry(.04), new THREE.MeshBasicMaterial({ color: 0x331111 }), .1, .16, 0, g);
      g.userData.light = light;
      break;
    }
    case 'chest': {
      const wood = L(0x7a4a2a), band = M(0xd9a125, { metalness: .8 });
      mesh(new THREE.BoxGeometry(.7, .4, .45), wood, 0, -.1, 0, g);
      const lid = mesh(new THREE.CylinderGeometry(.225, .225, .7, 12, 1, false, 0, Math.PI), wood, 0, .1, 0, g);
      lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2;
      for (const x of [-.25, .25]) mesh(new THREE.BoxGeometry(.05, .46, .47), band, x, -.1, 0, g);
      mesh(new THREE.BoxGeometry(.1, .12, .03), band, 0, .02, .23, g);
      for (let n = 0; n < 5; n++) mesh(new THREE.CylinderGeometry(.04, .04, .015, 10), band, -.2 + n * .1, .12, .05, g);
      break;
    }
    case 'tv': {
      mesh(new THREE.BoxGeometry(.6, .45, .45), L(0x5a4a3a), 0, 0, 0, g);
      mesh(new THREE.BoxGeometry(.42, .32, .02), new THREE.MeshBasicMaterial({ color: 0x8aa0a8 }), -.05, 0, .23, g);
      for (const r of [-.4, .4]) mesh(new THREE.CylinderGeometry(.01, .01, .4, 4), M(0xaaaaaa), r * .3, .38, 0, g).rotation.z = r;
      g.userData.screen = g.children[1];
      break;
    }
    case 'sword': {
      mesh(new THREE.BoxGeometry(.7, .55, .7), L(0x77746f), 0, -.5, 0, g);
      mesh(new THREE.BoxGeometry(.06, .9, .015), M(0xdfe6ee, { metalness: .9, roughness: .15 }), 0, .15, 0, g);
      mesh(new THREE.BoxGeometry(.3, .04, .05), M(0xd9a125, { metalness: .8 }), 0, .6, 0, g);
      mesh(new THREE.CylinderGeometry(.025, .025, .18, 6), L(0x5a2a1a), 0, .7, 0, g);
      mesh(new THREE.SphereGeometry(.04), M(0xd9a125, { metalness: .8 }), 0, .8, 0, g);
      break;
    }
    case 'alien': {
      const sk = M(0xbfe8c0, { emissive: 0x2a8a3a, emissiveIntensity: .6, metalness: .1, roughness: .5 });
      const h = mesh(new THREE.SphereGeometry(.3, 16, 12), sk, 0, .1, 0, g); h.scale.set(.85, 1.25, .95);
      const eye = new THREE.MeshBasicMaterial({ color: 0x050505 });
      for (const x of [-.12, .12]) { const e = mesh(new THREE.SphereGeometry(.09, 10, 8), eye, x, .02, .22, g); e.scale.set(1, .6, .4); e.rotation.z = x > 0 ? -.5 : .5; }
      mesh(new THREE.ConeGeometry(.1, .25, 8), sk, 0, -.25, .05, g).rotation.x = Math.PI;
      break;
    }
    case 'capsule': {
      mesh(new THREE.CylinderGeometry(.15, .15, .5, 12), M(0x9aa0a6, { metalness: .8 }), 0, 0, 0, g);
      mesh(new THREE.SphereGeometry(.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0x9aa0a6, { metalness: .8 }), 0, .25, 0, g);
      mesh(new THREE.BoxGeometry(.2, .08, .02), L(0xd9a125), 0, 0, .15, g);
      break;
    }
    case 'duck': {
      const y = L(0xffd21f);
      const b = mesh(new THREE.SphereGeometry(.12, 12, 8), y, 0, 0, 0, g); b.scale.set(1.3, .9, 1);
      mesh(new THREE.SphereGeometry(.08, 12, 8), y, .1, .12, 0, g);
      mesh(new THREE.ConeGeometry(.03, .08, 6), L(0xff7a1a), .2, .12, 0, g).rotation.z = -Math.PI / 2;
      break;
    }
    case 'panda': {
      const jade = M(0x39c07a, { metalness: .2, roughness: .2, emissive: 0x0a3a1a });
      const b = mesh(new THREE.SphereGeometry(.28, 14, 10), jade, 0, -.1, 0, g); b.scale.set(1, 1.1, .9);
      mesh(new THREE.SphereGeometry(.2, 14, 10), jade, 0, .28, .02, g);
      for (const x of [-.14, .14]) mesh(new THREE.SphereGeometry(.07, 8, 6), jade, x, .44, 0, g);
      for (const x of [-.07, .07]) mesh(new THREE.SphereGeometry(.035), L(0x0a2a1a), x, .3, .19, g);
      break;
    }
    case 'teapot': {
      const por = M(0xdfe9ff, { metalness: .1, roughness: .2 });
      const b = mesh(new THREE.SphereGeometry(.14, 14, 10), por, 0, 0, 0, g); b.scale.y = .8;
      mesh(new THREE.CylinderGeometry(.02, .03, .16, 6), por, .15, .05, 0, g).rotation.z = -.9;
      mesh(new THREE.TorusGeometry(.06, .015, 5, 10), por, -.15, .02, 0, g);
      mesh(new THREE.SphereGeometry(.03), L(0x2c4f9a), 0, .12, 0, g);
      break;
    }
  }
  return g;
}

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createFinds(scene, terrain, world, seed = 99) {
  const list = [];
  const group = new THREE.Group();
  scene.add(group);
  const rnd = rng(seed + (world === 'china' ? 7 : 0));
  const taken = [];
  const ray = new THREE.Ray();
  const hitP = new THREE.Vector3();
  const overlaps = (a) => taken.some(b => a.i < b.i + b.w + 1 && b.i < a.i + a.w + 1 && a.j < b.j + b.h + 1 && b.j < a.j + a.h + 1 && a.k < b.k + b.d + 1 && b.k < a.k + a.d + 1);

  for (const [id, count, min, max] of PLAN[world]) {
    const def = FIND[id];
    const [w, h, d] = def.cells;
    for (let n = 0; n < count; n++) {
      let spot = null;
      for (let tries = 0; tries < 40 && !spot; tries++) {
        const depth = min + rnd() * (max - min);
        const j = Math.max(15, Math.min(terrain.NY - 2 - h, terrain.NY - 1 - Math.round(depth / S)));
        const cand = { i: 1 + Math.floor(rnd() * (38 - w)), j, k: 1 + Math.floor(rnd() * (38 - d)), w, h, d };
        if (!overlaps(cand)) spot = cand;
      }
      if (!spot) continue;
      taken.push(spot);
      const key = world + ':' + id + ':' + n;
      const min3 = new THREE.Vector3(terrain.X0 + spot.i * S, terrain.Y0 + spot.j * S, terrain.Z0 + spot.k * S);
      const box = new THREE.Box3(min3, min3.clone().add(new THREE.Vector3(w * S, h * S, d * S)));
      const center = box.getCenter(new THREE.Vector3());
      const obj = build(id);
      obj.position.copy(center);
      obj.rotation.y = (rnd() - .5) * .5;
      // lie flat things on the pocket floor
      obj.position.y = box.min.y + (id === 'sword' ? .8 : id === 'dino' ? .6 : Math.min(.35, (h * S) / 2));
      group.add(obj);
      list.push({ key, id, def, spot, box, center, obj, armed: 0, gone: false, world });
    }
  }

  return {
    list, group,
    // open the pockets in freshly generated ground
    hollow() { for (const f of list) terrain.hollowBox(f.spot.i, f.spot.j, f.spot.k, f.spot.w, f.spot.h, f.spot.d); },
    // everything back in the ground (the pockets are opened again by hollow())
    reset() { for (const f of list) { f.gone = false; f.armed = 0; f.obj.visible = true; f.obj.position.x = f.center.x; } },
    remove(key) { const f = list.find(x => x.key === key); if (f && !f.gone) { f.gone = true; f.obj.visible = false; } return f; },
    hitTest(origin, dir, far) {
      ray.set(origin, dir);
      let best = null, bt = far;
      for (const f of list) {
        if (f.gone) continue;
        if (!ray.intersectBox(f.box, hitP)) continue;
        const t = hitP.distanceTo(origin);
        if (t < bt) { bt = t; best = f; }
      }
      return best ? { find: best, t: bt } : null;
    },
    update(dt, onBoom, onTick) {
      for (const f of list) {
        if (f.gone || !f.armed) continue;
        f.armed -= dt;
        const blink = Math.floor(f.armed * (f.armed < 1 ? 10 : 4)) % 2;
        if (blink && !f.blink) onTick?.(f);
        f.blink = blink;
        const l = f.obj.userData.light;
        l.material.color.setHex(blink ? 0xff2a1a : 0x331111);
        l.scale.setScalar(blink ? 2.2 : 1);
        f.obj.position.x = f.center.x + (Math.random() - .5) * .02;
        if (f.armed <= 0) { f.gone = true; f.obj.visible = false; onBoom(f); }
      }
      for (const f of list) if (!f.gone && f.id === 'tv' && Math.random() < .2) f.obj.userData.screen.material.color.setHSL(0, 0, .4 + Math.random() * .4);
    },
  };
}
