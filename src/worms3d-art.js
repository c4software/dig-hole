// worms3d-art.js, what « lombrics 3D » is made of: the worms (pink, googly-eyed, a headband in
// their team's colour), their weapons, crates on parachutes, mines, oil drums, gravestones,
// labels drawn on canvases, particle pools, the sea.
import * as THREE from 'three';

const PI = Math.PI, TAU = PI * 2;
const mats = new Map();
export const M = (c, e = 0) => { const k = c + '/' + e; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e })); return mats.get(k); };
export const GLOW = (c, k = 2) => { const key = 'g' + c + '/' + k; if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false })); return mats.get(key); };
export function put(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s);
  parent.add(o); return o;
}
const sph = (r, a = 12, b = 8) => new THREE.SphereGeometry(r, a, b);
const cyl = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s);
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- the worm ----------
const PINK = 0xf2a0a6, PINK2 = 0xe68890;
const bodyCurve = new THREE.CatmullRomCurve3([[0, .1, -.34], [0, .1, -.16], [0, .16, 0], [0, .36, .05], [0, .52, .02]].map(p => new THREE.Vector3(...p)));
const bodyGeo = (() => {
  // a tube that thins toward the tail
  const g = new THREE.TubeGeometry(bodyCurve, 16, .13, 10, false), p = g.attributes.position;
  const pts = bodyCurve.getSpacedPoints(16), v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) {
    const seg = Math.floor(n / 11), c = pts[Math.min(16, seg)], k = .55 + .45 * Math.min(1, seg / 7);
    v.fromBufferAttribute(p, n).sub(c).multiplyScalar(k).add(c); p.setXYZ(n, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
})();
export function wormModel(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = M(PINK, 0x2a0a0c), skin2 = M(PINK2, 0x200608);
  put(body, bodyGeo, skin);
  put(body, sph(.075), skin2, 0, .1, -.34);
  for (let k = 0; k < 4; k++) put(body, new THREE.TorusGeometry(.12 - k * .01, .012, 5, 14), skin2, 0, .1 + (k > 1 ? .04 : 0), -.26 + k * .08, 0, 0, 0).rotation.set(0, 0, 0);
  const head = new THREE.Group(); head.position.set(0, .56, .03); body.add(head);
  put(head, sph(.16, 16, 12), skin);
  put(head, new THREE.TorusGeometry(.155, .028, 6, 20), M(color), 0, .05, 0, PI / 2 - .15);
  put(head, bx(.04, .12, .03), M(color), .02, .03, -.16, .5, 0, .6);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = put(head, sph(.065, 12, 8), M(0xffffff, 0x404040), s * .065, .07, .11);
    put(e, sph(.032, 8, 6), M(0x111111), 0, 0, .045);
    eyes.push(e);
  }
  put(head, new THREE.TorusGeometry(.045, .01, 4, 10, PI), M(0x6a1a22), 0, -.04, .145, 0, 0, PI);
  // a little hand to hold things
  const hand = new THREE.Group(); hand.position.set(.1, .34, .14); body.add(hand);
  put(hand, sph(.045), skin);
  const held = new THREE.Group(); hand.add(held);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, body, head, eyes, hand, held };
}

// what a worm holds for each weapon (pointing along +z)
export function heldModel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'bazooka': case 'homing':
      put(g, cyl(.05, .05, .6, 10), M(id === 'homing' ? 0x3a6ab0 : 0x4a6a3a), 0, 0, .05, PI / 2);
      put(g, cyl(.065, .05, .1, 10), M(0x2a2a2a), 0, 0, .35, PI / 2); break;
    case 'grenade': put(g, sph(.07), M(0x3a7a3a), 0, 0, .05); put(g, cyl(.015, .015, .05), M(0x999999), 0, .07, .05); break;
    case 'cluster': put(g, sph(.07), M(0xb83a2a), 0, 0, .05); break;
    case 'banana': put(g, new THREE.TorusGeometry(.09, .03, 6, 12, PI * .8), M(0xf2d23a), 0, 0, .05, 0, PI / 2); break;
    case 'holy': put(g, sph(.08, 14, 10), M(0xd9a520, 0x3a2800), 0, 0, .05); put(g, bx(.02, .09, .02), M(0xf2d060), 0, .1, .05); put(g, bx(.06, .02, .02), M(0xf2d060), 0, .11, .05); break;
    case 'shotgun': put(g, cyl(.025, .025, .6, 8), M(0x3a3a3a), 0, .02, .1, PI / 2); put(g, bx(.06, .08, .22), M(0x6a3a1a), 0, -.02, -.15); break;
    case 'dynamite': put(g, cyl(.035, .035, .22, 8), M(0xc8281e), 0, 0, .05); break;
    case 'mine': put(g, cyl(.08, .09, .05, 12), M(0x2a2a2a), 0, 0, .05); break;
    case 'sheep': put(g, sph(.09), M(0xf4f4f0), 0, 0, .05); break;
    case 'bat': put(g, cyl(.02, .045, .65, 8), M(0xc89a5a), 0, .1, .25, PI / 2 - .4); break;
    case 'firepunch': put(g, sph(.07), GLOW(0xff7a1a, 1.4), 0, 0, 0); break;
    case 'girder': put(g, bx(.08, .06, .5), M(0xc0482a), 0, 0, .1); break;
    case 'rope': put(g, new THREE.TorusGeometry(.06, .015, 5, 12), M(0xc8b080), 0, 0, 0); break;
    case 'jetpack': break;
    case 'teleport': put(g, cyl(.03, .03, .2, 8), M(0x8a8a9a), 0, 0, .05, PI / 2); put(g, sph(.04), GLOW(0x8af0ff, 1.6), 0, 0, .17); break;
    case 'airstrike': put(g, bx(.1, .14, .04), M(0x2a2a2a), 0, 0, .05); put(g, bx(.07, .07, .01), GLOW(0x6af06a, 1.2), 0, .02, .075); break;
    case 'skip': case 'surrender': put(g, cyl(.01, .01, .5, 6), M(0x8a6a4a), 0, .2, 0); if (id === 'surrender') put(g, new THREE.PlaneGeometry(.25, .18), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), .13, .38, 0); break;
  }
  return g;
}

// ---------- what flies ----------
export function projModel(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'bazooka': case 'homing': case 'strike':
      put(g, cyl(.06, .06, .34, 10), M(kind === 'homing' ? 0x3a6ab0 : kind === 'strike' ? 0x5a5a62 : 0x6a7a4a), 0, 0, 0, PI / 2);
      put(g, new THREE.ConeGeometry(.06, .14, 10), M(0xc83a2a), 0, 0, .24, PI / 2);
      for (let k = 0; k < 4; k++) put(g, bx(.01, .12, .1), M(0x3a3a3a), 0, 0, -.14, 0, 0, k * PI / 4 * 2).position.set(Math.cos(k * PI / 2) * .06, Math.sin(k * PI / 2) * .06, -.14);
      break;
    case 'grenade': put(g, sph(.09), M(0x3a7a3a)); put(g, cyl(.02, .02, .06), M(0x9a9a9a), 0, .09, 0); break;
    case 'cluster': case 'frag': put(g, sph(kind === 'frag' ? .06 : .09), M(0xb83a2a)); break;
    case 'banana': case 'banana2': put(g, new THREE.TorusGeometry(.12, .04, 6, 12, PI * .8), M(0xf2d23a, 0x2a2000)); put(g, sph(.03), M(0x3a2a1a), .12, 0, 0); break;
    case 'holy':
      put(g, sph(.12, 16, 12), M(0xd9a520, 0x5a3a00));
      put(g, bx(.03, .13, .03), M(0xf2d060, 0x3a2800), 0, .16, 0); put(g, bx(.09, .03, .03), M(0xf2d060, 0x3a2800), 0, .18, 0);
      for (let k = 0; k < 6; k++) put(g, sph(.018), GLOW(0xff3a5a, 1.4), Math.cos(k / 6 * TAU) * .12, .02, Math.sin(k / 6 * TAU) * .12);
      break;
    case 'dynamite':
      for (const x of [-.04, 0, .04]) put(g, cyl(.035, .035, .26, 8), M(0xc8281e), x, .13, 0);
      put(g, cyl(.005, .005, .1, 4), M(0x2a2a2a), 0, .3, 0);
      g.userData.spark = put(g, sph(.03), GLOW(0xffc040, 2), 0, .35, 0);
      break;
    case 'mine': {
      put(g, cyl(.16, .18, .08, 16), M(0x2a2a2e), 0, .04, 0);
      put(g, cyl(.06, .08, .04, 10), M(0x3a3a40), 0, .1, 0);
      g.userData.light = put(g, sph(.035), GLOW(0xff2a1a, 1.6), 0, .13, 0);
      break;
    }
    case 'sheep': {
      const wool = M(0xf6f4ee), face = M(0x2a2622);
      for (const [x, y, z, r] of [[0, .22, 0, .16], [.08, .24, -.1, .12], [-.08, .24, -.1, .12], [.07, .25, .09, .11], [-.07, .25, .09, .11], [0, .32, 0, .12]]) put(g, sph(r, 10, 8), wool, x, y, z);
      put(g, sph(.08, 10, 8), face, 0, .28, .2, 0, 0, 0, [1, 1.1, 1.3]);
      for (const s of [-1, 1]) { put(g, sph(.022), M(0xffffff), s * .04, .31, .28); put(g, bx(.05, .02, .1), face, s * .09, .32, .18, 0, s * .6, 0); }
      g.userData.legs = [[-.07, -.08], [.07, -.08], [-.07, .08], [.07, .08]].map(([x, z]) => put(g, cyl(.02, .02, .14, 6), face, x, .07, z));
      break;
    }
    case 'drum':
      put(g, cyl(.3, .3, .9, 16), M(0xb82a1e), 0, .45, 0);
      for (const y of [.12, .45, .78]) put(g, cyl(.31, .31, .05, 16), M(0x2a2a2a), 0, y, 0);
      put(g, cyl(.22, .22, .01, 16), M(0xf2c21e), 0, .905, 0);
      break;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- crates, falling on a parachute ----------
export function crateModel(kind) {
  const g = new THREE.Group();
  const wood = kind === 'health' ? M(0xf2f0ea) : M(0xa8743e), dark = kind === 'health' ? M(0xd8d4cc) : M(0x7a5028);
  put(g, bx(.56, .56, .56), wood, 0, .28, 0);
  for (const [x, z] of [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]]) put(g, bx(.06, .58, .06), dark, x, .28, z);
  if (kind === 'health') {
    for (const [rx, ry] of [[0, 0], [0, PI / 2]]) { const p = new THREE.Group(); p.rotation.set(rx, ry, 0); g.add(p); for (const s of [-1, 1]) { put(p, bx(.32, .1, .01), M(0xd8281e), 0, .28, s * .285); put(p, bx(.1, .32, .01), M(0xd8281e), 0, .28, s * .285); } }
    put(g, bx(.32, .01, .1), M(0xd8281e), 0, .565, 0); put(g, bx(.1, .01, .32), M(0xd8281e), 0, .565, 0);
  } else {
    const q = canvasTex(64, 64, (c) => { c.fillStyle = '#a8743e'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#3a2210'; c.font = '900 48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 32, 36); });
    const qm = new THREE.MeshLambertMaterial({ map: q });
    for (let k = 0; k < 4; k++) { const p = put(g, new THREE.PlaneGeometry(.4, .4), qm, Math.sin(k * PI / 2) * .285, .28, Math.cos(k * PI / 2) * .285, 0, k * PI / 2, 0); p.renderOrder = 1; }
  }
  // the parachute
  const chute = new THREE.Group(); chute.position.y = 1.6; g.add(chute);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.9, 12, 6, 0, TAU, 0, PI / 2.6), new THREE.MeshLambertMaterial({ color: kind === 'health' ? 0xf2f2f2 : 0xe83a3a, side: THREE.DoubleSide }));
  canopy.scale.y = .6; chute.add(canopy);
  const line = M(0xdddddd);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, top = new THREE.Vector3(Math.cos(a) * .75, .2, Math.sin(a) * .75), bot = new THREE.Vector3(Math.cos(a) * .2, -1.05, Math.sin(a) * .2);
    const l = put(chute, cyl(.006, .006, top.distanceTo(bot), 3), line);
    l.position.copy(top).add(bot).multiplyScalar(.5); l.lookAt(chute.localToWorld(bot.clone())); l.rotateX(PI / 2);
    l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
  }
  g.userData.chute = chute;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function graveModel(color) {
  const g = new THREE.Group(), stone = M(0x9a968e);
  put(g, bx(.36, .42, .1), stone, 0, .21, 0);
  put(g, cyl(.18, .18, .1, 14, 1), stone, 0, .42, 0, PI / 2);
  put(g, bx(.04, .2, .02), M(0x5a5650), 0, .36, .06); put(g, bx(.12, .04, .02), M(0x5a5650), 0, .4, .06);
  put(g, bx(.46, .06, .2), M(color), 0, .03, 0);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- labels drawn on canvases ----------
// a sprite whose canvas redraws on demand; `w` × `h` pixels, `sw` metres wide
export function label(w, h, sw, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(sw, sw * h / w, 1); s.renderOrder = 20;
  let key = null;
  s.userData.set = (...args) => { const k = JSON.stringify(args); if (k === key) return; key = k; const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h, ...args); t.needsUpdate = true; };
  return s;
}
export function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const FONT = '"Titan One", Rubik, sans-serif';
export function tagSprite() {
  return label(256, 110, 1.25, (c, w, h, name, hp, color, active) => {
    c.font = `700 30px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(name, w / 2, 24); c.fillStyle = color; c.fillText(name, w / 2, 24);
    const t = String(hp); c.font = `34px ${FONT}`;
    const tw = c.measureText(t).width + 26;
    roundRect(c, w / 2 - tw / 2, 50, tw, 48, 12); c.fillStyle = active ? color : 'rgba(10,10,14,.8)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = active ? '#fff' : color; c.stroke();
    c.fillStyle = active ? '#111' : '#fff'; c.fillText(t, w / 2, 76);
  });
}
export function popSprite() {
  return label(192, 96, 1.1, (c, w, h, text, color) => {
    c.font = `56px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 10; c.strokeStyle = '#111'; c.strokeText(text, w / 2, h / 2); c.fillStyle = color; c.fillText(text, w / 2, h / 2);
  });
}
export function bubbleSprite() {
  return label(512, 150, 2.6, (c, w, h, text) => {
    c.font = `600 30px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = Math.min(w - 20, c.measureText(text).width + 44);
    roundRect(c, w / 2 - tw / 2, 10, tw, 90, 34); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#1a1a1a'; c.stroke();
    c.beginPath(); c.moveTo(w / 2 - 16, 98); c.lineTo(w / 2, 136); c.lineTo(w / 2 + 14, 98); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(w / 2 - 14, 92, 27, 9);
    c.fillStyle = '#1a1a1a'; c.fillText(text, w / 2, 56, tw - 30);
  });
}

// ---------- particles ----------
export function particlePool(parent, geo, mat, n, grav, kind) {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false; parent.add(mesh);
  const tc = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, tc);
  const ps = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, r: 0 }));
  const dm = new THREE.Object3D();
  let next = 0, live = 0;
  return {
    emit(x, y, z, vx, vy, vz, s, life, col) {
      const p = ps[next];
      if (col) { mesh.setColorAt(next, col); mesh.instanceColor.needsUpdate = true; }
      next = (next + 1) % n;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.life = p.max = life; p.r = Math.random() * TAU;
      live = n;
    },
    step(dt, floor = -99) {
      if (!live) return;
      let any = 0;
      for (let i = 0; i < n; i++) {
        const p = ps[i];
        let sc = 0;
        if (p.life > 0) {
          any++;
          p.life -= dt; p.vy -= grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 4;
          if (kind === 0 && p.y < floor) { p.y = floor; p.vy *= -.3; p.vx *= .6; p.vz *= .6; }
          const k = Math.max(0, p.life / p.max);
          if (kind === 1) { p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; p.vy *= 1 - dt * .8; sc = p.s * (1 + (1 - k) * 2.2) * Math.min(1, k * 2.5); }
          else if (kind === 2) sc = p.s * (.4 + k * .8);
          else sc = p.s * Math.min(1, k * 3);
        }
        dm.position.set(p.x, p.y, p.z); dm.rotation.set(p.r, p.r * .7, 0); dm.scale.setScalar(sc); dm.updateMatrix();
        mesh.setMatrixAt(i, dm.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!any) live = 0;
    },
    clear() { for (const p of ps) p.life = 0; live = n; this.step(0); },
  };
}

export const flashTex = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.3, 'rgba(255,220,120,.9)'); gr.addColorStop(.6, 'rgba(255,120,30,.35)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

// ---------- the sea: a big plane, its ripples scrolling ----------
export function seaModel() {
  const tex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#2f86c4'; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 90; n++) {
      const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 30;
      c.strokeStyle = `rgba(200,235,255,${.15 + Math.random() * .3})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 4, x + l, y); c.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(40, 40);
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: tex, color: 0xa8d8ff, transparent: true, opacity: .84, depthWrite: false }));
  top.rotation.x = -PI / 2; top.renderOrder = 2; g.add(top);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0x0c3050 }));
  deep.rotation.x = -PI / 2; deep.position.y = -2.5; g.add(deep);
  g.userData.tex = tex;
  return g;
}
