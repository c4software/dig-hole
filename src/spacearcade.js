// spacearcade.js, a game hall on the moon and one on mars: a pressurised hangar you walk
// into (the air is good inside), one terminal per game. A terminal lights up only when its
// game exists (RACES), so a game added later simply appears. Also the solid-box helper the
// planets' structures share (the astronaut collides with the voxels, and with these).
import * as THREE from 'three';
import * as V from './vehicles.js';

// the games of each hall, left to right along the back wall: the one place to edit
export const SPACE_GAMES = {
  moon: ['invaders', 'comic', 'pvz', 'shooter'],
  mars: ['potato', 'survie', 'tycoon', 'podrace'],
};
// the planet a game belongs to (its scenery, its sky), or null
export const spaceWorld = (id) => SPACE_GAMES.moon.includes(id) ? 'moon' : SPACE_GAMES.mars.includes(id) ? 'mars' : null;
// where the halls stand: a direction from the planet's centre (the lander is straight up)
export const HALL_DIR = { moon: [-.3, 1, .22], mars: [.66, 1, .12] };

const TAU = Math.PI * 2;
const HW = 5.5, HD = 4.5, HH = 4;            // half width, half depth, height of the hall
const LOOK = {
  moon: { title: 'arcade lunaire', sub: 'air respirable · 4 bornes', wall: 0xdcdde2, trim: 0x2a2e3a, neon: 0x5ad8ff, neon2: 0xb46cff, floor: 0x24262e },
  mars: { title: 'salle de jeux · mars', sub: 'air respirable · 4 bornes', wall: 0xe8ddd0, trim: 0x3a2a24, neon: 0xff8a3a, neon2: 0x39ffcc, floor: 0x2e2420 },
};

// ---------- solids: boxes flagged userData.solid, tested as a ball against an oriented box ----------
const _q = new THREE.Vector3();
export function solidsOf(root) {
  root.updateMatrixWorld(true);
  const list = [];
  root.traverse(o => {
    if (!o.isMesh || !o.userData.solid) return;
    const p = o.geometry.parameters;
    list.push({ inv: o.matrixWorld.clone().invert(), hx: p.width / 2, hy: p.height / 2, hz: p.depth / 2 });
  });
  const c = new THREE.Box3().setFromObject(root), center = c.getCenter(new THREE.Vector3()), rad = c.getSize(new THREE.Vector3()).length() / 2 + 1;
  return (p, r) => {
    if (p.distanceTo(center) > rad + r) return false;
    for (const b of list) {
      _q.copy(p).applyMatrix4(b.inv);
      const dx = Math.max(0, Math.abs(_q.x) - b.hx), dy = Math.max(0, Math.abs(_q.y) - b.hy), dz = Math.max(0, Math.abs(_q.z) - b.hz);
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    return false;
  };
}
// a structure's frame on a planet: stood on `at`, its +z towards `face`
export function frameAt(center, at, face) {
  const up = at.clone().sub(center).normalize();
  const fwd = face.clone().sub(at); fwd.addScaledVector(up, -fwd.dot(up));
  if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0).addScaledVector(up, -up.x);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
}
// clear the voxels inside local boxes ([x0, y0, z0, x1, y1, z1]) of a structure: the rooms stay open
export function clearGround(terrain, group, boxes) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert(), p = new THREE.Vector3(), S = terrain.S;
  for (const b of boxes) {
    const bb = new THREE.Box3();
    for (let n = 0; n < 8; n++) bb.expandByPoint(p.set(n & 1 ? b[3] : b[0], n & 2 ? b[4] : b[1], n & 4 ? b[5] : b[2]).applyMatrix4(group.matrixWorld));
    const [i0, j0, k0] = terrain.cellOf(bb.min.x, bb.min.y, bb.min.z), [i1, j1, k1] = terrain.cellOf(bb.max.x, bb.max.y, bb.max.z);
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (!terrain.solidCell(i, j, k)) continue;
      p.set(terrain.X0 + (i + .5) * S, terrain.Y0 + (j + .5) * S, terrain.Z0 + (k + .5) * S).applyMatrix4(inv);
      if (p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5]) terrain.setCell(i, j, k, 0);
    }
  }
}
const box = (w, h, d, m, x, y, z, parent, solid = false) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
  if (solid) o.userData.solid = true;
  parent.add(o); return o;
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function createSpaceArcade({ has = () => false, name = (id) => id } = {}) {
  const halls = {};   // w → { group, solid, frame, terminals, inv }

  // a terminal's marquee and screen: the game's name, or « bientôt » when it isn't there yet
  function screenTex(id, on, look) {
    return V.paintTex(256, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, on ? '#141a3a' : '#0c0c10'); gr.addColorStop(1, on ? '#2a0f3a' : '#141418');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (on) {
        g.strokeStyle = hex(look.neon); g.lineWidth = 3; g.globalAlpha = .35;
        for (let y = 20; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.globalAlpha = 1;
      }
      g.fillStyle = on ? '#ffffff' : '#55555c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `400 ${on ? 30 : 26}px "Titan One", Rubik, sans-serif`;
      const words = (on ? name(id) : 'bientôt').split(' '), lines = [];
      for (const wd of words) { const l = lines[lines.length - 1]; if (l && (l + ' ' + wd).length <= 12) lines[lines.length - 1] = l + ' ' + wd; else lines.push(wd); }
      lines.slice(0, 3).forEach((l, n, a) => g.fillText(l, w / 2, h / 2 + (n - (a.length - 1) / 2) * 34));
      if (on) { g.font = '700 15px Rubik, sans-serif'; g.fillStyle = hex(look.neon); g.fillText('e : jouer', w / 2, h - 18); }
    });
  }
  function marqueeTex(id, on, look) {
    return V.paintTex(256, 64, (g, w, h) => {
      g.fillStyle = on ? hex(look.neon2) : '#2a2a30'; g.fillRect(0, 0, w, h);
      g.fillStyle = on ? '#10101a' : '#55555c'; g.font = '900 26px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((on ? name(id) : '· · ·').toUpperCase().slice(0, 16), w / 2, h / 2 + 1);
    });
  }

  function cabinet(id, look, parent, x, z) {
    const on = has(id);
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const body = V.mat(on ? look.trim : 0x303036, { roughness: .5 }), side = V.mat(on ? look.neon2 : 0x44444a, { roughness: .4, emissive: on ? look.neon2 : 0, emissiveIntensity: .25 });
    box(1.1, 1.9, .8, body, 0, .95, 0, g, true);
    for (const s of [-1, 1]) box(.06, 1.95, .84, side, s * .56, .975, 0, g);
    const desk = box(1.1, .1, .45, body, 0, 1.02, .5, g); desk.rotation.x = -.25;
    for (let n = 0; n < 4; n++) box(.08, .04, .08, V.lamp([0xff3a4a, 0xffd21f, 0x39ffcc, 0x5ad8ff][n], on ? 2 : .3), -.3 + n * .2, 1.1, .52, g);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1, .75), new THREE.MeshBasicMaterial({ map: screenTex(id, on, look) }));
    scr.position.set(0, 1.5, .41); g.add(scr);
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(1.06, .26), new THREE.MeshBasicMaterial({ map: marqueeTex(id, on, look) }));
    mq.position.set(0, 2.06, .41); g.add(mq);
    box(1.1, .3, .8, body, 0, 2.05, 0, g, true);
    return { id, on, g, scr, front: new THREE.Vector3(x, 0, z + 1.3) };
  }

  // a hall for the planet `w`, stood on `at`, its door towards `face`
  function build(w, { terrain, center, at, face }) {
    if (halls[w]) halls[w].group.removeFromParent();
    const look = LOOK[w];
    const group = new THREE.Group();
    group.position.copy(at); group.quaternion.copy(frameAt(center, at, face));
    const wallM = V.mat(look.wall, { roughness: .55, emissive: look.wall, emissiveIntensity: w === 'moon' ? .22 : .08 }), trimM = V.mat(look.trim, { roughness: .6 }), neon = V.lamp(look.neon, 2.2), neon2 = V.lamp(look.neon2, 2.2);
    // the foundation hides the ground's bumps under the floor
    box(HW * 2 + 1.2, 3, HD * 2 + 1.2, V.mat(w === 'mars' ? 0x6a3a2a : 0x8a8a90, { roughness: .95 }), 0, -1.5, 0, group, true);
    // a tiled floor, unlit: the moon has next to no ambient light
    const tiles = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#3a3c44'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#b8bac4' : '#e6e8ee'; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HW, HD);
      return t;
    })();
    box(HW * 2, .06, HD * 2, new THREE.MeshBasicMaterial({ map: tiles, color: w === 'moon' ? 0x8a8c96 : 0x9a7462 }), 0, .03, 0, group);
    // neon lines on the floor, towards the terminals
    for (const x of [-3.6, -1.2, 1.2, 3.6]) box(.06, .02, 6, neon, x, .07, .6, group);
    box(HW * 2, .02, .06, neon2, 0, .07, HD - .4, group);
    // walls: back, sides, and the front around a door
    const T = .3;
    box(HW * 2 + T * 2, HH, T, wallM, 0, HH / 2, -HD - T / 2, group, true);
    for (const s of [-1, 1]) box(T, HH, HD * 2 + T * 2, wallM, s * (HW + T / 2), HH / 2, 0, group, true);
    const DW = 1.2;   // half the door's width
    for (const s of [-1, 1]) box(HW - DW + T, HH, T, wallM, s * (DW + (HW - DW + T) / 2), HH / 2, HD + T / 2, group, true);
    box(DW * 2, HH - 2.6, T, wallM, 0, 2.6 + (HH - 2.6) / 2, HD + T / 2, group, true);
    // the door frame: an airlock ring of light
    for (const s of [-1, 1]) box(.12, 2.6, .4, neon, s * DW, 1.3, HD + T / 2, group);
    box(DW * 2 + .12, .12, .4, neon, 0, 2.6, HD + T / 2, group);
    // a band of windows, the stripes of the trim
    for (const s of [-1, 1]) box(.02, .5, HD * 2 - 1, new THREE.MeshBasicMaterial({ color: 0x0a1020 }), s * (HW + T + .01), 2.7, 0, group);
    // the trim's stripe, a band on the outer faces (split at the door)
    const ow = HW + T + .01, od = HD + T + .01;
    box(ow * 2, .16, .02, trimM, 0, .9, -od, group);
    for (const s of [-1, 1]) box(.02, .16, od * 2, trimM, s * ow, .9, 0, group);
    for (const s of [-1, 1]) box(ow - DW, .16, .02, trimM, s * (DW + (ow - DW) / 2), .9, od, group);
    // the roof: a flat slab (solid) under a low glass vault
    box(HW * 2 + T * 2 + .2, .25, HD * 2 + T * 2 + .2, trimM, 0, HH + .12, 0, group, true);
    // a half cylinder along the width, flattened: its axis turned from y to x, its height squashed
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(HD, HD, HW * 2, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9ab8cc, roughness: .45, metalness: .1, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }));
    vault.rotation.z = Math.PI / 2; vault.scale.set(.35, 1, 1); vault.position.y = HH + .25; group.add(vault);
    for (let n = -2; n <= 2; n++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(HD, .05, 4, 24, Math.PI), trimM); rib.rotation.y = Math.PI / 2; rib.scale.set(1, .35, 1); rib.position.set(n * HW * .45, HH + .25, 0); group.add(rib); }
    // inside, a ceiling glowing strip or two (no real lights: they would recompile every material)
    for (const z of [-2, 1]) box(HW * 2 - 1, .05, .2, V.lamp(0xfff4e0, 1.6), 0, HH - .05, z, group);
    // the sign over the door
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, .9), new THREE.MeshBasicMaterial({ map: V.paintTex(512, 110, (g, W, H) => {
      g.fillStyle = '#10101a'; g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, 18); g.fill();
      g.lineWidth = 5; g.strokeStyle = hex(look.neon); g.stroke();
      g.fillStyle = hex(look.neon); g.font = '400 48px "Titan One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(look.title, W / 2, H / 2 - 8);
      g.fillStyle = '#ffffff'; g.font = '700 18px Rubik, sans-serif'; g.fillText(look.sub, W / 2, H - 18);
    }) }));
    sign.position.set(0, HH + .9, HD + T + .05); group.add(sign);
    for (const s of [-1, 1]) box(.1, 1, .1, trimM, s * 1.9, HH + .5, HD + T, group);
    // a mat and two posts outside the door, a landing strip to follow
    box(2.4, .05, 3, V.mat(0x3a3d44, { roughness: .9 }), 0, .02, HD + 1.9, group);
    box(3, 1.2, 3.4, V.mat(w === 'mars' ? 0x6a3a2a : 0x8a8a90, { roughness: .95 }), 0, -.6, HD + 1.9, group, true);
    for (const s of [-1, 1]) { box(.12, 1.1, .12, trimM, s * 1.5, .55, HD + 3.2, group, true); box(.2, .12, .2, neon2, s * 1.5, 1.15, HD + 3.2, group); }
    // the terminals along the back wall
    const terminals = SPACE_GAMES[w].map((id, n) => cabinet(id, look, group, -3.6 + n * 2.4, -HD + .55));
    // a bench in the middle, a plant in a pot, a water fountain: somewhere to breathe
    box(2.4, .45, .5, trimM, 0, .225, 1.4, group, true);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.3, .24, .5, 12), trimM); pot.position.set(HW - .6, .25, HD - .6); group.add(pot);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 1), V.mat(0x4f8a3a, { roughness: .8 })); leaf.position.set(HW - .6, .85, HD - .6); group.add(leaf);
    group.traverse(o => { if (o.isMesh && o.material.type === 'MeshStandardMaterial') o.receiveShadow = true; });
    // clear the rock out of the room and the doorway
    clearGround(terrain, group, [[-HW, .06, -HD, HW, HH, HD], [-DW - .4, .06, HD - .5, DW + .4, 3.2, HD + 3.6]]);
    const solid = solidsOf(group);
    const inv = group.matrixWorld.clone().invert();
    // each lit terminal: its screen (for the 2D games laid on the glass) and where to stand
    for (const t of terminals) {
      t.scr.updateMatrixWorld(true);
      const q = t.scr.getWorldQuaternion(new THREE.Quaternion());
      t.screen = { center: t.scr.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), w: 1, h: .75, mesh: t.scr };
      t.stand = t.front.clone().applyMatrix4(group.matrixWorld);
      t.it = { id: 'mg:' + t.id, game: t.id, pos: t.stand.clone(), reach: 1.4 };
    }
    halls[w] = { group, solid, terminals, inv, look };
    return group;
  }

  const local = new THREE.Vector3();
  return {
    SPACE_GAMES, build,
    group: (w) => halls[w]?.group || null,
    // a lit terminal within reach of where you stand
    near(w, pos) {
      const h = halls[w];
      if (!h) return null;
      let best = null, bd = Infinity;
      for (const t of h.terminals) {
        if (!t.on) continue;
        const d = t.stand.distanceTo(pos);
        if (d < t.it.reach && d < bd) { best = t.it; bd = d; }
      }
      return best;
    },
    solid(w, p, r) { const h = halls[w]; return !!h && h.solid(p, r); },
    // inside the hall (or in its doorway): the air is good
    breathable(w, pos) {
      const h = halls[w];
      if (!h) return false;
      local.copy(pos).applyMatrix4(h.inv);
      return Math.abs(local.x) < HW + .2 && local.y > -1 && local.y < HH + .5 && local.z > -HD - .2 && local.z < HD + 1.2;
    },
    inside(w, pos) {
      const h = halls[w];
      if (!h) return false;
      local.copy(pos).applyMatrix4(h.inv);
      return Math.abs(local.x) < HW && local.y > -1 && local.y < HH && Math.abs(local.z) < HD;
    },
    // the glass of a game's terminal (for the 2D games), and the spot in front of it
    screen(w, id) { return halls[w]?.terminals.find(t => t.id === id && t.on)?.screen || null; },
    stand(w, id) { return halls[w]?.terminals.find(t => t.id === id)?.stand || null; },
    // the terminal's glass, to face it
    glass(w, id) { return halls[w]?.terminals.find(t => t.id === id)?.screen?.center || halls[w]?.terminals.find(t => t.id === id)?.stand || null; },
    // the door, outside, facing in: where to put someone arriving
    door(w) { const h = halls[w]; return h ? new THREE.Vector3(0, .3, HD + 2.4).applyMatrix4(h.group.matrixWorld) : null; },
    show(w) { for (const [k, h] of Object.entries(halls)) h.group.visible = k === w; },
    update(dt, w, t) {
      const h = halls[w];
      if (!h || !h.group.visible) return;
      // the lit screens breathe a little
      for (const tm of h.terminals) if (tm.on) tm.scr.material.color.setScalar(.85 + Math.sin(t * 3 + tm.g.position.x) * .15);
    },
  };
}
