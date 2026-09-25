// neighbours.js, the other houses of the street: along the lane on either side of ours,
// and a row far off behind the garden. Their doors open, nobody's home, and there are
// drawers, shelves, fridges and safes worth a look. Their windows light up at night.
import * as THREE from 'three';

// a European village: plastered walls in creams and ochres, terracotta or slate roofs,
// painted shutters, flower boxes under the windows
const WALLS = [0xf4ead6, 0xecd9b6, 0xf2dcc2, 0xe2cca6, 0xf6f1e8, 0xe9d2b2, 0xdfe3e2, 0xf0e0cc];
const ROOFS = [0xb8573a, 0xa84c33, 0xc0663f, 0x4d5563, 0x434b58];
const SHUTTERS = [0x6f9a7c, 0x5a7fa6, 0x94423e, 0x98a6ac, 0x7d8c5a, 0x4f6f8f];
const FLOWERS = [0xe8384f, 0xf06a9a, 0xf6f0f4, 0xf2a43a];
const FLOORS = [0x8a5a3a, 0x6a4a30, 0xa87a4a, 0x9a8a78];
const OWNERS = ['les Martin', 'les Bernard', 'les Petit', 'les Durand', 'les Leroy', 'les Moreau', 'les Simon', 'les Laurent', 'les Michel', 'les Garcia', 'les David', 'les Roux'];

// a lane-side house faces the lane (+z), a back-row house faces the garden (-z)
export const SPOTS = [
  [-44, -22, 0], [-70, -21.5, 0], [-97, -22.5, 0], [42, -22, 0], [67, -21, 0], [94, -22.5, 0],
  [-52, 64, Math.PI], [-18, 70, Math.PI], [20, 66, Math.PI], [56, 72, Math.PI],
  [-86, 30, Math.PI / 2], [88, 24, -Math.PI / 2],
];
// what can be searched, and how: `alarm` is the chance that searching sets it off
export const LOOT_SPOTS = {
  drawer: { name: 'la commode', alarm: .15 },
  shelf:  { name: 'la bibliothèque', alarm: .1 },
  fridge: { name: 'le frigo', alarm: .1 },
  safe:   { name: 'le coffre-fort', alarm: .45 },
};

import { puffGeometry, roofColliders } from './street.js';

export function createNeighbours({ colliders, interactables }) {
  const group = new THREE.Group();
  const mats = new Map();
  const lambert = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
  // plaster: faint mottling, a little darker near the ground
  const plasterTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 1400; n++) { g.fillStyle = `rgba(${180 + Math.random() * 50},${165 + Math.random() * 50},${150 + Math.random() * 50},${Math.random() * .05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 4 + Math.random() * 14); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const plaster = (c) => { const k = 'pl' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, map: plasterTex })); return mats.get(k); };
  // roof tiles: rows of shadowed courses
  const tileTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + 6, 64, 2); for (let x = (y / 8) % 2 * 4; x < 64; x += 8) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y, 1, 8); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
    return t;
  })();
  const tiles = (c) => { const k = 'tl' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, map: tileTex })); return mats.get(k); };
  const hedgeGeo = puffGeometry(1, .8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4f8a3a, emissive: 0x0e1a08 });
  // one material for every window: lit together when night falls
  const glass = new THREE.MeshLambertMaterial({ color: 0x5a7080, emissive: 0xffc070, emissiveIntensity: 0 });
  const frame = lambert(0xf4f0e6), doorMat = lambert(0x6a4a30), stone = lambert(0x8a8680), hedge = lambert(0x3f6a2a);
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: .6, roughness: .4, emissive: 0x2a2c32 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .9, roughness: .25 });
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const houses = [];
  // inside, nobody has left a lamp on: the rooms glow a little by themselves
  const inner = new THREE.MeshLambertMaterial({ color: 0xf3ead6, emissive: 0x6a5e48 });
  const lit = (c) => { const k = 'lit' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(.35) })); return mats.get(k); };
  const T = .2;                 // wall thickness
  const DOOR_W = 1.2, DOOR_H = 2.2;

  function house(x, z, rot, n) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.updateMatrixWorld();
    const W = 8 + rnd() * 2.5, D = 6.5 + rnd() * 1.5, H = 3 + rnd() * .6, two = rnd() < .35;
    const HH = two ? H * 1.8 : H;
    const wallC = pick(WALLS), wall = plaster(wallC), roofMat = tiles(pick(ROOFS)), shut = lambert(pick(SHUTTERS));
    const trim = lambert(new THREE.Color(wallC).multiplyScalar(.82).getHex()), flower = lambert(pick(FLOWERS));
    const h = { name: OWNERS[n % OWNERS.length], g, W, D, doorOpen: false, doorAng: 0, locked: false, spots: [] };
    const box = (w, hh, d, m, px, py, pz, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(px, py, pz); parent.add(b); return b; };
    // a box that blocks, given in the house's own frame
    const solid = (x0, y0, z0, x1, y1, z1) => {
      const b = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)).applyMatrix4(g.matrixWorld);
      const c = { min: b.min, max: b.max };
      colliders.push(c);
      return c;
    };
    const wallBox = (x0, y0, z0, x1, y1, z1, m = wall) => {
      box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      return solid(x0, y0, z0, x1, y1, z1);
    };
    const f = D / 2;
    // ---------- shell: four walls, the front one with a doorway ----------
    wallBox(-W / 2, 0, -f, W / 2, HH, -f + T);
    wallBox(-W / 2, 0, -f, -W / 2 + T, HH, f);
    wallBox(W / 2 - T, 0, -f, W / 2, HH, f);
    wallBox(-W / 2, 0, f - T, -DOOR_W / 2, HH, f);
    wallBox(DOOR_W / 2, 0, f - T, W / 2, HH, f);
    wallBox(-DOOR_W / 2, DOOR_H, f - T, DOOR_W / 2, HH, f);
    // inside: pale walls, a floor, and a ceiling where the upstairs would be
    for (const [w, d, px, pz] of [[W - 2 * T, .02, 0, -f + T + .011], [.02, D - 2 * T, -W / 2 + T + .011, 0], [.02, D - 2 * T, W / 2 - T - .011, 0]]) box(w, H, d, inner, px, H / 2, pz);
    box(W - 2 * T, .03, D - 2 * T, lit(pick(FLOORS)), 0, .015, 0);
    box(W - 2 * T, .1, D - 2 * T, inner, 0, H + .05, 0);
    // a gable roof across the width, with eaves that overhang the walls
    const ridge = 2 + rnd() * .9;
    const tri = new THREE.Shape();
    tri.moveTo(-f - .55, -.12); tri.lineTo(f + .55, -.12); tri.lineTo(0, ridge); tri.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: W + .7, bevelEnabled: false });
    roofGeo.rotateY(Math.PI / 2); roofGeo.translate(-(W + .7) / 2, HH, 0);
    g.add(new THREE.Mesh(roofGeo, roofMat));
    // the gable ends in the wall's own plaster, under the roof
    const gab = new THREE.Shape();
    gab.moveTo(-f, 0); gab.lineTo(f, 0); gab.lineTo(0, ridge - .15); gab.closePath();
    for (const sx of [-1, 1]) { const gg = new THREE.ExtrudeGeometry(gab, { depth: .02, bevelEnabled: false }); gg.rotateY(Math.PI / 2); gg.translate(sx * (W / 2 + .005) - .01, HH, 0); g.add(new THREE.Mesh(gg, wall)); }
    // a ceiling, and the gable's slopes to stand on
    solid(-W / 2, H - .02, -f, W / 2, H + .12, f);
    roofColliders((x0, y0, z0, x1, y1, z1) => solid(x0, y0, z0, x1, y1, z1), { x0: -W / 2, x1: W / 2, z0: -f - .5, z1: f + .5, y: HH, h: ridge, kind: 'x' });
    const chimX = W * (rnd() < .5 ? -.28 : .28);
    box(.55, 1.6, .55, plaster(0xd8c8b0), chimX, HH + ridge * .55, -D * .15);
    box(.7, .12, .7, lambert(0x8a7a6a), chimX, HH + ridge * .55 + .85, -D * .15);
    // a darker plinth, corner stones, a band under the eaves
    for (const [w, d, px, pz] of [[W + .04, .04, 0, -f - .01], [.04, D, -W / 2 - .01, 0], [.04, D, W / 2 + .01, 0], [W / 2 - DOOR_W / 2, .04, -(W / 4 + DOOR_W / 4), f + .01], [W / 2 - DOOR_W / 2, .04, W / 4 + DOOR_W / 4, f + .01]]) box(w, .45, d, trim, px, .22, pz);
    for (const sx of [-1, 1]) for (let y = .6; y < HH - .2; y += .7) box(.36, .3, .36, trim, sx * (W / 2 - .16), y, f - .16 + .02);
    box(W + .06, .18, D + .06, trim, 0, HH - .09, 0);
    // ---------- the front: windows with shutters and flower boxes, lit inside and out ----------
    box(1.8, .16, 1, lambert(0xb8b0a4), 0, .08, f + .5);
    box(1.9, .1, .9, roofMat, 0, 2.55, f + .42);
    const rows = two ? [1.5, H + 1.1] : [1.5];
    for (const y of rows) for (const cx of (y > 2 ? [-W * .3, 0, W * .3] : [-W * .3, W * .3])) {
      box(1.05, 1.3, .06, frame, cx, y, f + .02);
      box(.85, 1.1, .08, glass, cx, y, f + .03);
      box(.05, 1.1, .1, frame, cx, y, f + .05);
      box(.85, .05, .1, frame, cx, y + .15, f + .05);
      if (y < 2) box(.85, 1.1, .02, glass, cx, y, f - T - .02);
      box(1.2, .08, .22, trim, cx, y - .7, f + .1);
      for (const s2 of [-1, 1]) {
        box(.42, 1.3, .06, shut, cx + s2 * .76, y, f + .05);
        for (let k = 0; k < 4; k++) box(.36, .03, .04, trim, cx + s2 * .76, y - .45 + k * .3, f + .09);
      }
      // a flower box, spilling over
      box(.9, .18, .22, lambert(0x8a5a3a), cx, y - .62, f + .2);
      for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(hedgeGeo, k % 2 ? flower : leafMat); m.scale.setScalar(.13 + rnd() * .05); m.position.set(cx - .36 + k * .18, y - .47, f + .22); g.add(m); }
    }
    for (const sx of [-1, 1]) { box(.08, .9, .9, glass, sx * (W / 2 + .03), 1.5, 0); box(.02, .9, .9, glass, sx * (W / 2 - T - .02), 1.5, 0); }
    // a low stone wall with a clipped hedge behind it, split for the path
    const hz = f + 3;
    for (const sx of [-1, 1]) {
      const len = W / 2 - .8, cx = sx * (W / 4 + .4);
      box(len, .55, .35, lambert(0xcfc6b6), cx, .27, hz + .3);
      box(len + .06, .08, .42, lambert(0xb8ae9e), cx, .58, hz + .3);
      for (let k = 0; k < len / .7; k++) { const m = new THREE.Mesh(hedgeGeo, leafMat); m.scale.set(.5, .55, .45); m.position.set(cx - len / 2 + .35 + k * .7, .85, hz - .05); m.rotation.y = rnd() * 6; g.add(m); }
    }
    for (let k = 0; k < 4; k++) box(.9, .04, .6, lambert(0xb4aca0), 0, .03, f + 1.2 + k * .75);
    // ---------- the door, on a hinge (kept out of the static merge: it moves) ----------
    const pivot = new THREE.Group();
    pivot.position.set(-DOOR_W / 2, 0, f - T / 2);
    pivot.userData.keep = true;
    box(DOOR_W, DOOR_H, .08, doorMat, DOOR_W / 2, DOOR_H / 2, 0, pivot);
    const knob = box(.08, .08, .14, gold, DOOR_W - .15, 1.05, 0, pivot);
    knob.castShadow = false;
    g.add(pivot);
    h.pivot = pivot;
    h.doorBox = solid(-DOOR_W / 2, 0, f - T, DOOR_W / 2, DOOR_H, f);
    interactables.push({ id: 'ndoor', house: h, pos: g.localToWorld(new THREE.Vector3(0, 1.2, f - T / 2)), reach: 2.2 });
    // ---------- inside: a rug, a sofa, a table, and the things worth searching ----------
    box(3, .02, 2, lit(pick([0x8a2a2a, 0x2a4a6a, 0x6a5a2a])), 0, .04, .3);
    box(2.2, .5, .8, lit(pick(SHUTTERS)), W * .12, .25, f - T - 1.4);
    box(2.2, .6, .2, lit(0x3a3a3a), W * .12, .6, f - T - 1.75);
    box(1.2, .06, .8, lit(0x7a5530), -W * .1, .75, -.4);
    for (const [lx, lz] of [[-.5, -.3], [.5, -.3], [-.5, .3], [.5, .3]]) box(.06, .72, .06, lit(0x5a3a20), -W * .1 + lx, .36, -.4 + lz);
    const addSpot = (kind, px, pz, mesh) => {
      mesh();
      solid(px - .45, 0, pz - .45, px + .45, .9, pz + .45);
      const spot = { kind, ...LOOT_SPOTS[kind], looted: false };
      h.spots.push(spot);
      interactables.push({ id: 'loot', house: h, spot, pos: g.localToWorld(new THREE.Vector3(px, 1, pz)), reach: 1.9 });
    };
    const bx = -W / 2 + T, bz = -f + T;
    addSpot('drawer', bx + 1.3, bz + .3, () => {
      box(1.4, .9, .5, lit(0x7a5530), bx + 1.3, .45, bz + .25);
      for (const y of [.25, .6]) box(1.3, .3, .02, lit(0x8a6540), bx + 1.3, y, bz + .51);
    });
    addSpot('shelf', bx + .25, 0, () => {
      box(.4, 2, 1.5, lit(0x6a4a30), bx + .2, 1, 0);
      for (const y of [.5, 1.1, 1.7]) for (let k = 0; k < 6; k++) box(.25, .35, .1, lit(pick([0x8a2a2a, 0x2a5a8a, 0x3a6a3a, 0xd9a125, 0xeeeeee])), bx + .28, y, -.6 + k * .23);
    });
    addSpot('fridge', W / 2 - T - .4, .8, () => {
      box(.7, 1.8, .7, lit(0xeef0f2), W / 2 - T - .4, .9, .8);
      box(.04, .5, .06, metal, W / 2 - T - .77, 1.2, .55);
    });
    addSpot('safe', W / 2 - T - .45, bz + .4, () => {
      box(.75, .8, .65, metal, W / 2 - T - .45, .4, bz + .35);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .04, 16), gold);
      dial.rotation.x = Math.PI / 2; dial.position.set(W / 2 - T - .45, .5, bz + .69); g.add(dial);
    });
    // the ground floor, for the alarm: are you still inside?
    h.inside = new THREE.Box3(new THREE.Vector3(-W / 2, -1, -f), new THREE.Vector3(W / 2, HH, f)).applyMatrix4(g.matrixWorld);
    group.add(g);
    houses.push(h);
  }
  SPOTS.forEach(([x, z, r], n) => house(x, z, r, n));

  // ---------- far off: soft hills with a village on them, and a church spire ----------
  const far = new THREE.Group();
  const hillMat = lambert(0x86a882);
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + rnd() * .3, r = 190 + rnd() * 40;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    m.scale.set(70 + rnd() * 50, 9 + rnd() * 10, 50 + rnd() * 25);
    m.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    far.add(m);
  }
  const village = [];
  for (let k = 0; k < 90; k++) {
    const a = rnd() * Math.PI * 2, r = 125 + rnd() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z + 13) < 6) continue;
    const w = 5 + rnd() * 4, d = 5 + rnd() * 3, hh = 4 + rnd() * 4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), plaster(pick(WALLS)));
    b.position.set(x, hh / 2, z); b.rotation.y = rnd() * 3;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .75, 2.5 + rnd(), 4), lambert(pick(ROOFS)));
    rf.position.set(x, hh + 1.2, z); rf.rotation.y = b.rotation.y + Math.PI / 4; rf.scale.z = d / w;
    far.add(b, rf);
    village.push(b);
  }
  const church = new THREE.Group();
  const part = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; church.add(m); return m; };
  part(new THREE.BoxGeometry(9, 9, 18), plaster(0xe8dcc4), 0, 4.5, 0);
  part(new THREE.BoxGeometry(5, 20, 5), plaster(0xe8dcc4), 0, 10, 10);
  part(new THREE.ConeGeometry(3.6, 12, 4), lambert(0x4a5260), 0, 26, 10, Math.PI / 4);
  const roofC = new THREE.Mesh(new THREE.ConeGeometry(7, 4, 4), lambert(0xa84c33)); roofC.position.set(0, 11, 0); roofC.rotation.y = Math.PI / 4; roofC.scale.z = 2.1;
  church.add(roofC);
  church.position.set(-120, 0, 95); church.rotation.y = .6;
  far.add(church);
  group.add(far);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  function toggleDoor(h) { h.doorOpen = !h.doorOpen; h.doorBox.off = h.doorOpen; return h.doorOpen; }

  return {
    group, houses, toggleDoor,
    // 0 by day, 1 at night
    setNight(n) { glass.emissiveIntensity = n * 1.4; },
    update(dt) {
      for (const h of houses) {
        const want = h.doorOpen ? 1.6 : 0;
        if (Math.abs(h.doorAng - want) < 1e-3) continue;
        h.doorAng += (want - h.doorAng) * Math.min(1, dt * 6);
        h.pivot.rotation.y = h.doorAng;
      }
    },
    insideOf(p) { return houses.find(h => h.inside.containsPoint(p)) || null; },
    // a new day: the neighbours are back from the shops, the locks are off
    restock() { for (const h of houses) { h.locked = false; for (const s of h.spots) s.looted = false; } },
    lock(h) { h.locked = true; if (h.doorOpen) toggleDoor(h); },
  };
}
