// street.js, the pieces both towns are dressed with: cherry trees in bloom and the
// petals they drop, Japanese utility poles and their sagging bundles of wire, and
// old European street lamps. Everything is built in a parent group's own frame.
import * as THREE from 'three';
import { createRig } from './rig.js';
import { randomOutfit } from './outfits.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as V from './vehicles.js';

// blossom colours per season: spring pinks, summer greens, autumn reds, winter snow
export const CANOPY = [
  [0xfbd6e3, 0xf6b2cb, 0xee94b6],
  [0x6fae4a, 0x5b9a3c, 0x7fbe58],
  [0xe8923a, 0xd8662e, 0xf0b048],
  [0xf4f7fb, 0xe6ecf2, 0xd8e0ea],
];
const Y = new THREE.Vector3(0, 1, 0);

export function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// a lumpy, faceted ball: reads as a painted clump of blossom (or a clipped hedge)
export function puffGeometry(detail = 2, squash = .72) {
  // welded, so the normals come out smooth rather than faceted
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('uv').deleteAttribute('normal'));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) {
    v.fromBufferAttribute(p, n);
    const k = 1 + Math.sin(v.x * 4.1 + 1) * Math.sin(v.y * 3.3) * Math.sin(v.z * 3.9 + 2) * .14;
    p.setXYZ(n, v.x * k, v.y * k * squash, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- cherry trees, and the petals under them ----------
// A crown is many small clumps of blossom, lighter on top and rosier underneath, fringed
// with little cards of flowers so the edge reads soft and feathery instead of solid.
export function createBlossoms({ parent, addBox, seed = 11 }) {
  const rnd = seeded(seed);
  const bark = new THREE.MeshLambertMaterial({ color: 0x74605a });
  // one material for the clumps (colour by vertex), one for the flower cards
  const clumpMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xb86a86, emissiveIntensity: .5 });
  const flowerTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    // a bunch of tiny five-petal flowers, densest in the middle
    for (let n = 0; n < 70; n++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), .6) * 52;
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s = 3 + rnd() * 4;
      const l = 86 + rnd() * 11;
      g.fillStyle = `hsl(${338 + rnd() * 14}, ${70 + rnd() * 25}%, ${l}%)`;
      for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2 + rnd(); g.beginPath(); g.ellipse(x + Math.cos(pa) * s * .55, y + Math.sin(pa) * s * .55, s * .55, s * .38, pa, 0, 7); g.fill(); }
      g.fillStyle = `hsl(345, 80%, ${l - 22}%)`;
      g.beginPath(); g.arc(x, y, s * .22, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const cardMat = new THREE.MeshLambertMaterial({ map: flowerTex, alphaTest: .45, side: THREE.DoubleSide, emissive: 0xc07890, emissiveIntensity: .55 });
  const puffGeo = puffGeometry(2, .8);
  const barkGeos = [], clumpGeos = [], cardGeos = [];
  const top = new THREE.Color(), bottom = new THREE.Color(), tmpC = new THREE.Color();
  let pal = CANOPY[0];
  const limb = (from, to, r0, r1) => {
    const d = to.clone().sub(from), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 7);
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(from.clone().addScaledVector(d, .5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()), new THREE.Vector3(1, 1, 1));
    barkGeos.push(g.applyMatrix4(m));
  };
  const card = new THREE.PlaneGeometry(1, 1);
  const clump = (at, r) => {
    const g = puffGeo.clone();
    const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(Y, rnd() * 6), new THREE.Vector3(r, r, r));
    g.applyMatrix4(m);
    // light from above: the top of each clump pale, its underside a deeper rose
    const p = g.attributes.position, col = [];
    const shade = .9 + rnd() * .2;
    for (let n = 0; n < p.count; n++) {
      const k = THREE.MathUtils.clamp((p.getY(n) - at.y) / r * .5 + .5, 0, 1);
      // a speckle of lighter and darker flowers across each clump
      tmpC.copy(bottom).lerp(top, Math.pow(k, .8)).multiplyScalar(shade * (.93 + Math.random() * .12));
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    clumpGeos.push(g);
    // the fringe: flower cards on the surface, mostly on top and at the sides
    const cards = 9 + Math.floor(r * 8);
    for (let k = 0; k < cards; k++) {
      const dir = new THREE.Vector3(rnd() - .5, rnd() * .9 - .25, rnd() - .5).normalize();
      const pos = at.clone().addScaledVector(dir, r * (.8 + rnd() * .35));
      const sz = r * (.7 + rnd() * .55);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      cardGeos.push(card.clone().applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(sz, sz, sz))));
    }
  };
  const petalGeos = [];
  const trees = [];
  function tree(x, z, s = 1) {
    s *= .9 + rnd() * .35;
    top.setHex(0xfff0f5); bottom.setHex(0xef9cbc);
    const base = new THREE.Vector3(x, -.1, z);
    const fork = new THREE.Vector3(x + (rnd() - .5) * .9, 2.2 * s, z + (rnd() - .5) * .9);
    // a trunk with a kink, then limbs that split in two, each end in a cloud of clumps
    const mid = base.clone().lerp(fork, .5).add(new THREE.Vector3((rnd() - .5) * .4, 0, (rnd() - .5) * .4));
    limb(base, mid, .26 * s, .21 * s); limb(mid, fork, .21 * s, .16 * s);
    const n = 4 + Math.floor(rnd() * 3), tips = [];
    for (let b = 0; b < n; b++) {
      const a = b / n * Math.PI * 2 + rnd() * .6;
      const out = (1.9 + rnd() * 1.5) * s, up = (1.0 + rnd() * 1.4) * s;
      const elbow = fork.clone().add(new THREE.Vector3(Math.cos(a) * out * .5, up * .55, Math.sin(a) * out * .5));
      limb(fork, elbow, .13 * s, .09 * s);
      for (const da of [-.35, .35]) {
        const tip = fork.clone().add(new THREE.Vector3(Math.cos(a + da) * out, up + (rnd() - .3) * .8 * s, Math.sin(a + da) * out));
        limb(elbow, tip, .08 * s, .03 * s);
        tips.push(tip);
      }
    }
    tips.push(fork.clone().add(new THREE.Vector3(0, 2.6 * s, 0)));
    for (const t of tips) {
      clump(t, (.7 + rnd() * .35) * s);
      for (let k = 0; k < 3; k++) clump(t.clone().add(new THREE.Vector3((rnd() - .5) * 1.7 * s, (rnd() - .35) * .9 * s, (rnd() - .5) * 1.7 * s)), (.42 + rnd() * .32) * s);
    }
    addBox?.(x - .3 * s, 0, z - .3 * s, x + .3 * s, 3 * s, z + .3 * s);
    trees.push({ x, z, r: 3.8 * s });
  }
  const patch = (x, z, r, y = .035) => {
    const pg = new THREE.PlaneGeometry(r * 2, r * 2);
    pg.rotateX(-Math.PI / 2); pg.rotateY(rnd() * 6); pg.translate(x, y, z);
    petalGeos.push(pg);
  };
  const petalTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let n = 0; n < 1100; n++) {
      // thick in the middle, thinning to nothing at the edge
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), .75) * 122;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
      g.fillStyle = `rgba(${246 + rnd() * 9}, ${196 + rnd() * 34}, ${212 + rnd() * 24}, ${.55 + rnd() * .45})`;
      g.beginPath(); g.ellipse(x, y, 2.2 + rnd() * 2.6, 1.3 + rnd() * 1.2, rnd() * 3, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  let petals = null, clumps = null, cards = null;
  return {
    tree, patch, trees, rnd,
    // bake everything into a few meshes; petals under every tree
    finish({ scatter = [] } = {}) {
      clumps = new THREE.Mesh(mergeGeometries(clumpGeos), clumpMat);
      cards = new THREE.Mesh(mergeGeometries(cardGeos), cardMat);
      const made = [new THREE.Mesh(mergeGeometries(barkGeos), bark), clumps, cards];
      for (const m of made) { m.castShadow = true; m.receiveShadow = true; m.userData.keep = true; parent.add(m); }
      for (const t of trees) {
        patch(t.x + (rnd() - .5), t.z + (rnd() - .5), t.r);
        if (rnd() < .7) patch(t.x + (rnd() - .5) * 9, t.z + (rnd() - .5) * 9, 1.2 + rnd() * 1.6);
      }
      for (const [x, z, r] of scatter) patch(x, z, r);
      petals = new THREE.Mesh(mergeGeometries(petalGeos), new THREE.MeshLambertMaterial({ map: petalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      petals.receiveShadow = true;
      petals.renderOrder = 1;
      petals.userData.keep = true;
      parent.add(petals);
      return petals;
    },
    // their own glow is a daylight thing: at night the blossom goes dim like everything else
    setNight(n) { clumpMat.emissiveIntensity = .5 * (1 - n * .85); cardMat.emissiveIntensity = .55 * (1 - n * .85); },
    // the seasons tint the whole crown: pink, green, russet, snow
    setSeason(n) {
      // spring keeps the painted pinks; the other seasons repaint the crown in one colour
      clumpMat.vertexColors = n === 0;
      clumpMat.color.setHex([0xffffff, 0x78b452, 0xe0883a, 0xeef3f8][n]);
      clumpMat.emissive.setHex([0xb86a86, 0x1a2a10, 0x3a1a08, 0x4a5260][n]);
      clumpMat.needsUpdate = true;
      cardMat.visible = n === 0;
      if (petals) petals.visible = n === 0;
    },
  };
}

// ---------- Japanese utility poles: concrete, a striped guard at the foot, crossarms,
// transformers, and bundles of wire sagging from one to the next ----------
const stripesMat = (() => {
  let m = null;
  return () => {
    if (m) return m;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#1c1c1e';
    for (let y = -64; y < 192; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 32); g.lineTo(64, y + 48); g.lineTo(0, y + 16); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    m = new THREE.MeshLambertMaterial({ map: t });
    return m;
  };
})();
export function createPoles({ parent, addBox, points, H = 8.8, seed = 5 }) {
  const rnd = seeded(seed);
  const concrete = new THREE.MeshLambertMaterial({ color: 0xa4a4a0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a4e56 });
  const grey = new THREE.MeshLambertMaterial({ color: 0x7c828c });
  const wire = [];
  const heads = [];
  points.forEach(([x, z, rot = 0], k) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = rot;
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    add(new THREE.CylinderGeometry(.12, .18, H, 10), concrete, 0, H / 2, 0);
    add(new THREE.CylinderGeometry(.2, .2, 1.9, 12), stripesMat(), 0, .95, 0);
    add(new THREE.BoxGeometry(.12, .12, 2.2), dark, 0, H - .45, 0);
    add(new THREE.BoxGeometry(.1, .1, 1.4), dark, 0, H - 1.25, 0);
    for (const dz of [-1, -.35, .35, 1]) add(new THREE.CylinderGeometry(.05, .05, .16, 6), new THREE.MeshLambertMaterial({ color: 0xe8e8ea }), 0, H - .33, dz);
    if (k % 3 === 1) {
      add(new THREE.CylinderGeometry(.34, .34, 1.0, 12), grey, .45, H - 2.5, 0);
      add(new THREE.CylinderGeometry(.34, .34, 1.0, 12), grey, .45, H - 3.6, .1);
    }
    if (k % 4 === 2) add(new THREE.BoxGeometry(.5, .7, .25), grey, .3, H - 4.4, 0);
    // step bolts up the side
    for (let y = 2.4; y < H - 1.5; y += .45) add(new THREE.BoxGeometry(.24, .03, .03), dark, 0, y, (y * 10 % 2 > 1 ? .14 : -.14));
    parent.add(g);
    g.updateMatrix();
    addBox?.(x - .2, 0, z - .2, x + .2, H, z + .2);
    heads.push(g);
  });
  // wires between neighbours: five strands, each with its own sag, some bundled thick
  const sag = (a, b, drop) => {
    const N = 16;
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const p0 = a.clone().lerp(b, t0); p0.y -= Math.sin(t0 * Math.PI) * drop;
      const p1 = a.clone().lerp(b, t1); p1.y -= Math.sin(t1 * Math.PI) * drop;
      wire.push(p0, p1);
    }
  };
  // in the parent's own frame (it may sit anywhere in the world)
  const at = (g, y, dz) => new THREE.Vector3(0, y, dz).applyMatrix4(g.matrix);
  for (let k = 0; k + 1 < heads.length; k++) {
    const a = heads[k], b = heads[k + 1];
    const span = a.position.distanceTo(b.position);
    if (span > 40) continue;
    for (const [y, dz, d] of [[H - .36, -1, .03], [H - .36, -.35, .032], [H - .36, .35, .031], [H - .36, 1, .03], [H - 1.2, -.6, .045], [H - 1.25, .6, .05], [H - 2.1, 0, .06], [H - 2.25, .05, .065]]) {
      sag(at(a, y, dz), at(b, y, dz), span * d + rnd() * .15);
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x262a33 }));
  lines.frustumCulled = false;
  parent.add(lines);
  return {
    // one more wire, from a pole down to a house
    drop(k, to) { const a = heads[k]; sag(at(a, H - 1.25, .6), to, .4); lines.geometry.dispose(); lines.geometry = new THREE.BufferGeometry().setFromPoints(wire); },
    heads,
  };
}

// ---------- European street lamps: a cast-iron post with a lantern on top ----------
export function createLamps({ parent, addBox, points }) {
  const iron = new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: .55, roughness: .45 });
  const glass = new THREE.MeshLambertMaterial({ color: 0xfff1c8, emissive: 0xffc870, emissiveIntensity: .05 });
  // no real lights: a warm pool painted on the ground under each lamp, drawn at night
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,210,140,1)'); gr.addColorStop(.4, 'rgba(255,190,110,.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const pools = [];
  for (const [x, z] of points) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const add = (geo, mat, py) => { const m = new THREE.Mesh(geo, mat); m.position.y = py; g.add(m); return m; };
    add(new THREE.CylinderGeometry(.16, .22, .5, 10), iron, .25);
    add(new THREE.CylinderGeometry(.06, .09, 3.4, 10), iron, 2.1);
    add(new THREE.TorusGeometry(.1, .025, 6, 12), iron, 1.1).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(.12, .08, .2, 8), iron, 3.85);
    add(new THREE.CylinderGeometry(.24, .14, .55, 6), glass, 4.2);
    add(new THREE.ConeGeometry(.34, .3, 6), iron, 4.62);
    add(new THREE.SphereGeometry(.06, 8, 6), iron, 4.82);
    parent.add(g);
    addBox?.(x - .15, 0, z - .15, x + .15, 4, z + .15);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, .06, z); pool.userData.keep = true; pool.renderOrder = 2;
    parent.add(pool); pools.push(pool);
  }
  return { setNight(n) { glass.emissiveIntensity = .05 + n * 2.2; poolMat.opacity = n * .55; pools.forEach(p => { p.visible = n > .02; }); } };
}

// ---------- parked cars: a boxy kei car, a small saloon, a European hatchback ----------
// a rounded body, a glasshouse of dark glass under a painted roof, real wheels in dark arches
export function createCars({ parent, addBox }) {
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return mats.get(k); };
  const trim = mat(0x2a2c34), lampM = mat(0xfff6e0, { emissive: 0xfff0c8, emissiveIntensity: .2 }), tail = mat(0xd83030, { emissive: 0x801010, emissiveIntensity: .3 }), amber = mat(0xffa030, { emissive: 0x804010, emissiveIntensity: .3 });
  const glassM = V.glass(false), plateM = new THREE.MeshBasicMaterial({ map: V.plate('A-H0LE') });
  const put = (geo, m, x, y, z, p) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); p.add(b); return b; };
  return function car(x, z, rot, color, kind = 'saloon') {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rot; parent.add(c);
    const kei = kind === 'kei', hatch = kind === 'hatch';
    const L = kei ? 3.4 : hatch ? 3.9 : 4.3, Wd = hatch ? 1.65 : 1.5, paint = mat(color);
    put(V.roundBox(L, .64, Wd, .18, 2), paint, 0, .64, 0, c);
    const cabL = kei ? 2.5 : hatch ? 2.3 : 2.2, cabH = kei ? .95 : hatch ? .72 : .7, cabX = kei ? -.35 : hatch ? -.5 : -.2;
    // the glasshouse: a side outline with a raked windscreen, extruded in dark glass
    const fr = cabH * (kei ? .25 : .75), rr = cabH * (kei ? .1 : hatch ? .2 : .6), b = .05, y0 = .9, x0 = cabX - cabL / 2 + b, x1 = cabX + cabL / 2 - b, yt = y0 + cabH - b;
    put(V.profile([[x0, y0], [x1, y0], [x1 - fr, yt], [x0 + rr, yt]], Wd - .12, b, kind), glassM, 0, 0, 0, c);
    put(V.roundBox(cabL - fr - rr + .1, .08, Wd - .06, .04), paint, cabX + (rr - fr) / 2, y0 + cabH + .02, 0, c);
    for (const px of [cabX + (rr - fr) / 2]) put(V.roundBox(.1, cabH, Wd - .08, .03), paint, px, y0 + cabH / 2, 0, c);
    // bumpers, lamps, grille, plate, mirrors
    put(V.roundBox(.18, .18, Wd + .04, .07), trim, L / 2 - .02, .4, 0, c);
    put(V.roundBox(.18, .18, Wd + .04, .07), trim, -L / 2 + .02, .4, 0, c);
    put(V.roundBox(.04, .1, Wd * .45, .02), trim, L / 2 + .01, .66, 0, c);
    put(new THREE.PlaneGeometry(.4, .1), plateM, L / 2 + .11, .42, 0, c).rotation.y = Math.PI / 2;
    for (const sz of [-1, 1]) {
      put(V.roundBox(.06, .15, .3, .05), lampM, L / 2 - .01, .78, sz * (Wd / 2 - .25), c);
      put(V.roundBox(.06, .08, .1, .03), amber, L / 2 - .01, .78, sz * (Wd / 2 - .06), c);
      put(V.roundBox(.06, .17, .26, .05), tail, -L / 2 + .01, .8, sz * (Wd / 2 - .22), c);
      put(V.roundBox(.12, .12, .1, .04), paint, cabX + cabL / 2 - fr * .3, y0 + .12, sz * (Wd / 2 + .06), c);
      put(V.roundBox(.5, .03, .03, .01), trim, cabX - .1, .88, sz * (Wd / 2 + .005), c);
    }
    for (const [wx, wz] of [[L * .32, Wd / 2 - .08], [-L * .32, Wd / 2 - .08], [L * .32, -Wd / 2 + .08], [-L * .32, -Wd / 2 + .08]]) {
      const w = V.wheel({ r: .3, w: .2, rim: mat(0xc8ccd2), tyre: mat(0x1c1c1e), spokes: 0 }); w.position.set(wx, .3, wz); c.add(w);
      const a = put(new THREE.RingGeometry(.32, .4, 14, 1, 0, Math.PI), trim, wx, .3, Math.sign(wz) * (Wd / 2 + .005), c); if (wz < 0) a.rotation.y = Math.PI;
    }
    c.updateMatrix();
    const bb = new THREE.Box3(new THREE.Vector3(-L / 2, 0, -Wd / 2), new THREE.Vector3(L / 2, 1.9, Wd / 2)).applyMatrix4(c.matrix);
    addBox?.(bb.min.x, 0, bb.min.z, bb.max.x, 1.9, bb.max.z);
    return c;
  };
}

// ---------- contact shadows: soft darkening where things meet the ground ----------
// Baked, not computed: a soft-edged rectangle round a building's foot, a round blob under
// a car, a tree, a table. All of one world's go into two meshes.
function softTex(round) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + .5) / N * 2 - 1, v = (y + .5) / N * 2 - 1;
    const d = round ? Math.hypot(u, v) : Math.max(Math.abs(u), Math.abs(v));
    const a = round ? Math.pow(Math.max(0, 1 - d), 1.6) : Math.pow(Math.min(1, Math.max(0, (1 - d) / .45)), 1.4);
    const k = (y * N + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
export function createContact({ parent, color = 0x1e1a30, opacity = .5 }) {
  const rects = [], blobs = [];
  const quad = (list, x, y, z, w, d, rot) => { const q = new THREE.PlaneGeometry(w, d); q.rotateX(-Math.PI / 2); q.rotateY(rot); q.translate(x, y, z); list.push(q); };
  return {
    // a footprint w × d (the dark reaches ~0.9 m past its edges)
    rect(x, z, w, d, rot = 0, y = .03) { quad(rects, x, y, z, w + 1.8, d + 1.8, rot); },
    blob(x, z, r, y = .03) { quad(blobs, x, y, z, r * 2, r * 2, 0); },
    finish() {
      for (const [list, round] of [[rects, false], [blobs, true]]) {
        if (!list.length) continue;
        const m = new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: softTex(round), color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
        m.renderOrder = 1; m.userData.keep = true;
        parent.add(m);
      }
    },
  };
}

// ---------- passers-by: they walk the pavements, to and fro ----------
// what people say when a disc flies at them, or they come out of a portal
const SHOUTS = { hit: ['aïe !', 'ouille !', 'au secours !', 'mais ça va pas ?!'], near: ['hé !', 'attention !', 'ouh là !'], fly: ['waaah !', 'mais… ?!', 'au secours !'], dazed: ['où suis-je ?', 'ma tête…', 'drôle de rue…'] };
const bubbleTex = new Map();
function bubble(text) {
  if (bubbleTex.has(text)) return bubbleTex.get(text);
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d');
  g.font = '700 30px Rubik, sans-serif';
  const w = Math.min(244, g.measureText(text).width + 34);
  g.fillStyle = '#fffdf6'; g.strokeStyle = '#1a130d'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(128 - w / 2, 6, w, 50, 22); g.moveTo(118, 55); g.lineTo(128, 74); g.lineTo(140, 55); g.fill(); g.stroke();
  g.fillStyle = '#1a130d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  bubbleTex.set(text, t);
  return t;
}

export function createWalkers({ parent, paths, clothes, seed = 3, style = 'europe' }) {
  const rnd = seeded(seed);
  const people = [];
  function person(sitting = false) {
    const g = new THREE.Group();
    const rig = createRig(randomOutfit(rnd, { tops: clothes, style }), { detail: 'lo', lod: true });
    rig.st.sit = sitting;
    g.add(rig.root);
    g.userData.keep = true;           // they move: never baked into the static decor
    parent.add(g);
    // the old limbs, now bones: the thighs and the shoulders
    const legs = [rig.bone('hipL'), rig.bone('hipR')], arms = [rig.bone('shL'), rig.bone('shR')];
    // what they do: walk their path; fly (out of a portal); lie (knocked down); daze; flee; back (walking home)
    // body: where they are in the world, for the portals (size: the height of their middle)
    return { g, rig, legs, arms, mode: 'walk', t2: 0, sitting, body: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: .9, cd: 0 }, say: null, sayT: 0, flee: new THREE.Vector3() };
  }
  for (const path of paths) {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const n = Math.max(1, Math.round(pts[0].distanceTo(pts[pts.length - 1]) / 22));
    for (let k = 0; k < n; k++) {
      const p = person();
      people.push(Object.assign(p, { pts, seg: Math.floor(rnd() * (pts.length - 1)), t: rnd(), dir: rnd() < .5 ? 1 : -1, speed: 1 + rnd() * .5, ph: rnd() * 6, lane: (rnd() - .5) * .8 }));
    }
  }
  const sitters = [];
  const off = parent.position;   // the town's own frame is only ever shifted, never turned
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function shout(p, kind, time = 1.8) {
    if (!p.say) { p.say = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); p.say.scale.set(1.1, .34, 1); p.say.position.y = 2.15; p.g.add(p.say); }
    p.say.material.map = bubble(SHOUTS[kind][Math.floor(Math.random() * SHOUTS[kind].length)]); p.say.material.needsUpdate = true;
    p.say.visible = true; p.sayT = time;
  }
  // where on its path someone should be walking back to
  function pathPoint(p) {
    const A = p.pts[p.seg], B = p.pts[p.seg + 1] || A;
    return tmp2.set(A.x + (B.x - A.x) * p.t, 0, A.z + (B.z - A.z) * p.t);
  }
  // a body's state for the rig: how fast, on the ground or not; then its pose for this frame
  const pose = (p, dt, speed, ground = true, vy = 0) => { p.rig.st.speed = speed; p.rig.st.ground = ground; p.rig.st.vy = vy; p.rig.update(dt); };
  return {
    people,
    // someone sitting still (a café chair, a bench), facing `rot`
    sit(x, y, z, rot) { const p = person(true); p.g.position.set(x, y - .45, z); p.g.rotation.y = rot; sitters.push(p); return p; },
    // the person a point (world) is inside of: a capsule for the body, a ball for the head
    hitTest(w) {
      for (const p of [...people, ...sitters]) {
        if (!p.g.visible || p.mode === 'lie' || p.mode === 'fly') continue;
        const x = w.x - off.x - p.g.position.x, z = w.z - off.z - p.g.position.z, y = w.y - off.y - p.g.position.y;
        const r = Math.hypot(x, z);
        if ((y > .05 && y < 1.45 && r < .27) || (y > 1.45 && y < 1.8 && Math.hypot(r, y - 1.62) < .19)) return p;
      }
      return null;
    },
    // struck by a disc going `dir`: knocked flat, then up and running
    knock(p, dir) {
      shout(p, 'hit', 2.2);
      if (p.sitting) { p.g.position.y += .15; p.t2 = .3; return; }
      p.mode = 'lie'; p.t2 = 0;
      p.flee.copy(dir).setY(0).normalize();
      p.g.rotation.y = Math.atan2(-p.flee.x, -p.flee.z);
    },
    // a disc whistling past: a jump and a word
    startle(w) {
      for (const p of [...people, ...sitters]) {
        if (p.mode !== 'walk' || p.sayT > 0) continue;
        if (Math.hypot(w.x - off.x - p.g.position.x, w.z - off.z - p.g.position.z) < 1.4 && Math.abs(w.y - off.y - 1) < 1.2) shout(p, 'near', 1.2);
      }
    },
    // for the portals: the walking ones' bodies, in the world
    bodies() { return people.filter(p => p.mode === 'walk' || p.mode === 'flee' || p.mode === 'back'); },
    // one came out of a portal: flying, then lost somewhere
    flung(p) { p.mode = 'fly'; p.g.position.copy(p.body.pos).sub(off); shout(p, 'fly', 1.5); },
    update(dt) {
      for (const p of sitters) {
        if (p.g.visible) p.rig.update(dt);
        if (p.t2 > 0) { p.t2 -= dt; if (p.t2 <= 0) p.g.position.y -= .15; }
        if (p.sayT > 0) { p.sayT -= dt; if (p.sayT <= 0) p.say.visible = false; }
      }
      for (const p of people) {
        if (p.sayT > 0) { p.sayT -= dt; if (p.sayT <= 0) p.say.visible = false; }
        const G = p.g.position;
        if (p.mode === 'fly') {
          // thrown: arms and legs everywhere, down to the ground, then sat there dazed
          const v = p.body.vel; v.y -= 14 * dt;
          G.addScaledVector(v, dt);
          p.g.rotation.x += dt * 3;
          pose(p, dt, 0, false, -8);
          if (G.y <= 0 && v.y < 0) { G.y = 0; p.g.rotation.x = 0; p.mode = 'daze'; p.t2 = 2.5; shout(p, 'dazed', 2.2); }
        } else if (p.mode === 'lie') {
          // falling back, a moment on the ground, getting up
          p.t2 += dt;
          const k = p.t2 < .35 ? p.t2 / .35 : p.t2 < 2 ? 1 : Math.max(0, 1 - (p.t2 - 2) / .5);
          p.g.rotation.x = -k * 1.45; G.y = k * .15;
          pose(p, dt, 0);
          if (p.t2 > 2.5) { p.g.rotation.x = 0; G.y = 0; p.mode = 'flee'; p.t2 = 4; }
        } else if (p.mode === 'daze') {
          p.t2 -= dt; p.g.rotation.z = Math.sin(p.t2 * 6) * .12;
          pose(p, dt, 0);
          if (p.t2 <= 0) {
            p.g.rotation.z = 0;
            // too far from home (another town, the cave): gone, and back on the path in a while
            if (pathPoint(p).distanceTo(G) > 45) { p.g.visible = false; p.mode = 'gone'; p.t2 = 8; } else p.mode = 'back';
          }
        } else if (p.mode === 'gone') {
          p.t2 -= dt;
          if (p.t2 <= 0) { p.g.visible = true; p.mode = 'walk'; }
        } else if (p.mode === 'flee' || p.mode === 'back') {
          // running off (arms up), or walking back to where they were on their path
          const home = pathPoint(p);
          const d = p.mode === 'flee' ? p.flee : tmp.subVectors(home, G).setY(0);
          const dist = d.length();
          if (p.mode === 'back' && dist < .4) { p.mode = 'walk'; continue; }
          d.normalize();
          const sp = p.mode === 'flee' ? 4.2 : p.speed;
          G.addScaledVector(d, sp * dt); G.y = 0;
          p.body.vel.copy(d).multiplyScalar(sp);
          p.g.rotation.set(0, Math.atan2(d.x, d.z), 0);
          p.ph += dt * sp * 5.5;
          pose(p, dt, sp);
          // running off with the arms up
          if (p.mode === 'flee') { p.arms[0].rotation.set(-2.8 + Math.sin(p.ph * 2) * .3, 0, .3); p.arms[1].rotation.set(-2.8 - Math.sin(p.ph * 2) * .3, 0, -.3); p.t2 -= dt; if (p.t2 <= 0) p.mode = 'back'; }
        } else {
          const a = p.pts[p.seg], b = p.pts[p.seg + 1];
          const len = a.distanceTo(b) || 1;
          p.t += p.dir * p.speed * dt / len;
          if (p.t > 1) { if (p.seg + 2 < p.pts.length) { p.seg++; p.t -= 1; } else { p.t = 1; p.dir = -1; } }
          if (p.t < 0) { if (p.seg > 0) { p.seg--; p.t += 1; } else { p.t = 0; p.dir = 1; } }
          const A = p.pts[p.seg], B = p.pts[p.seg + 1];
          const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
          G.set(A.x + dx * p.t - dz / l * p.lane, 0, A.z + dz * p.t + dx / l * p.lane);
          p.g.rotation.y = Math.atan2(dx * p.dir, dz * p.dir);
          p.body.vel.set(dx / l * p.dir * p.speed, 0, dz / l * p.dir * p.speed);
          p.ph += dt * p.speed * 5.5;
          G.y = 0;
          if (p.g.visible) pose(p, dt, p.speed);
        }
        p.body.pos.copy(G).add(off);
      }
    },
  };
}

// ---------- roofs you can stand on, and can't fly through ----------
// A pitched roof becomes a stack of slabs that narrow towards the ridge, all inside the
// roof's own volume. `kind`: 'x' (gable, ridge along x), 'z' (ridge along z), 'hip' (both).
// Boxes are given in the building's own frame; `matrix` (if any) takes them to the frame
// `push(x0, y0, z0, x1, y1, z1)` expects.
export function roofColliders(push, { x0, x1, z0, z1, y, h, kind = 'x', matrix = null, steps = 6 }) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const b = new THREE.Box3();
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps, k = 1 - t1;
    const ex = kind === 'x' ? hx : hx * k, ez = kind === 'z' ? hz : hz * k;
    b.min.set(cx - ex, y + h * t0, cz - ez); b.max.set(cx + ex, y + h * t1, cz + ez);
    if (matrix) b.applyMatrix4(matrix);
    push(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
  }
}
