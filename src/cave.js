// cave.js, the secret cave: a trapdoor behind the garden shed, half hidden under dead leaves, opens
// on a ladder down to a vaulted hall cut in the rock (in truth far off, out of sight: the ground
// under the garden is all packed earth). In the middle, the portal gun floats over its pedestal;
// taken, it comes back two minutes later, so that everyone gets one. All round, on stone plinths
// behind velvet ropes, the dioramas of the old console games: step up to a cartridge to shrink in.
import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { GAMES } from './minigames.js';

export const CAVE = new THREE.Vector3(0, 0, -900);
const HX = 24, HZ = 22, HH = 9;                 // the hall: half width, half depth, height to the vault's springing
// where each game's diorama stands (plinth centre, relative to the hall), and which console it is for
export const SLOTS = {
  bomber: [-16, -12, 'nes'], canards: [-16, 0, 'nes'], empile: [-16, 12, 'nes'],
  ballons: [0, 15, 'nes'],
  moto: [16, 12, 'nes'], bagarre: [16, 0, '64'], batballons: [16, -12, '64'],
};
export const PLINTH = .6;
export const slotAt = (id) => new THREE.Vector3(CAVE.x + SLOTS[id][0], PLINTH, CAVE.z + SLOTS[id][1]);
export const GUN_REGEN = 120;
const TRAP = new THREE.Vector3(30.7, 0, 43.5);   // behind the shed, against the back wall
const LADDER = new THREE.Vector3(CAVE.x, 0, CAVE.z - HZ + .5);

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rnd = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();

export function createCave({ scene, colliders, interactables }) {
  const g = new THREE.Group(); scene.add(g);
  const addBox = (x0, y0, z0, x1, y1, z1) => colliders.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
  const X = CAVE.x, Z = CAVE.z;
  const box = (w, h, d, m, x, y, z, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };

  // ---------- the rock: rough walls, flagstones, a barrel vault ----------
  const rockTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#7a6e62'; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 60; n++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 50, v = 90 + rnd() * 60;
      const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v - 10},${v - 22},.55)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.strokeStyle = 'rgba(30,24,20,.45)'; c.lineWidth = 2;
    for (let n = 0; n < 26; n++) { c.beginPath(); let x = rnd() * w, y = rnd() * h; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - .5) * 60; y += (rnd() - .3) * 40; c.lineTo(x, y); } c.stroke(); }
  }, [6, 2]);
  const rock = new THREE.MeshLambertMaterial({ color: 0xb0a494, map: rockTex, emissive: 0x2a2018 });
  const flagTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#3a322c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 120 + rnd() * 40, o = (y % 2) * 32;
      c.fillStyle = `rgb(${v},${v - 8},${v - 20})`; c.fillRect(x * 64 + o + 3, y * 64 + 3, 58, 58);
      c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x * 64 + o + 3, y * 64 + 3, 58, 6);
    }
  }, [HX / 2, HZ / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0xc8bca8, map: flagTex, emissive: 0x201810 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(X, .005, Z); floor.receiveShadow = true; floor.userData.keep = true; g.add(floor);
  // the walls: rock slabs, a little jagged at the top where they meet the vault
  for (const [w, d, x, z] of [[HX * 2 + 2, 1, X, Z - HZ - .5], [HX * 2 + 2, 1, X, Z + HZ + .5], [1, HZ * 2, X - HX - .5, Z], [1, HZ * 2, X + HX + .5, Z]]) {
    box(w, HH + 9, d, rock, x, (HH + 9) / 2, z);
    addBox(x - w / 2, -1, z - d / 2, x + w / 2, HH + 9, z + d / 2);
  }
  // the vault, springing from the long walls
  const vg = new THREE.BufferGeometry(), vp = [], vuv = [], vi = [], NA = 24;
  for (let a = 0; a <= NA; a++) for (const e of [0, 1]) {
    const th = a / NA * Math.PI;
    vp.push(X + Math.cos(th) * (HX + .5), HH + Math.sin(th) * HX * .3, Z + (e ? HZ + 1 : -HZ - 1));
    vuv.push(a / NA * 3, e * 4);
  }
  for (let a = 0; a < NA; a++) { const k = a * 2; vi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); vg.setAttribute('uv', new THREE.Float32BufferAttribute(vuv, 2)); vg.setIndex(vi); vg.computeVertexNormals();
  const vault = new THREE.Mesh(vg, new THREE.MeshLambertMaterial({ color: 0x8a7e70, map: rockTex, side: THREE.DoubleSide, emissive: 0x1a140e }));
  vault.userData.keep = true; g.add(vault);
  addBox(X - HX, HH + 3, Z - HZ, X + HX, HH + 8, Z + HZ);
  // ribs across the vault and pillars along the walls
  const dark = new THREE.MeshLambertMaterial({ color: 0x6a5e52, map: rockTex, emissive: 0x1a140e });
  for (let z = -HZ + 5.5; z < HZ; z += 11) {
    for (const s of [-1, 1]) { box(1.4, HH, 1.4, dark, X + s * (HX - .7), HH / 2, Z + z); addBox(X + s * (HX - .7) - .7, 0, Z + z - .7, X + s * (HX - .7) + .7, HH, Z + z + .7); }
    const rib = new THREE.Mesh(new THREE.TorusGeometry(HX - .3, .45, 6, 32, Math.PI), dark); rib.scale.set(1, .3, 1); rib.position.set(X, HH, Z + z); g.add(rib);
  }
  // stalactites hanging from the vault
  const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(.25, 1, 6), new THREE.MeshLambertMaterial({ color: 0x9a8e80 }), 90);
  const dm = new THREE.Object3D();
  for (let n = 0; n < 90; n++) {
    const x = (rnd() - .5) * 2 * (HX - 3), z = (rnd() - .5) * 2 * (HZ - 1), y = HH + Math.sqrt(Math.max(0, 1 - (x / HX) ** 2)) * HX * .3 - .2;
    const l = .4 + rnd() * 1.6;
    dm.position.set(X + x, y - l / 2, Z + z); dm.rotation.set(Math.PI + (rnd() - .5) * .2, rnd() * 6, 0); dm.scale.set(.6 + rnd() * .8, l, .6 + rnd() * .8); dm.updateMatrix();
    stal.setMatrixAt(n, dm.matrix);
  }
  g.add(stal);

  // ---------- light: crystals and torches (no lamps: they glow, the bloom does the rest) ----------
  const HUES = [0x39c8ff, 0xff4ad8, 0x8a5aff, 0x39e0a0].map(c => new THREE.Color(c));
  const glowMats = HUES.map(c => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.8), toneMapped: false }));
  const crystal = new THREE.OctahedronGeometry(.3, 0);
  const shards = [];
  for (const [cx, cz] of [[-HX + 1.5, -HZ + 1.5], [HX - 1.5, -HZ + 1.5], [-HX + 1.5, HZ - 1.5], [HX - 1.5, HZ - 1.5], [-HX + 1.2, -6], [HX - 1.2, 6], [-8, HZ - 1], [8, HZ - 1]]) {
    const m = glowMats[shards.length % 4];
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(crystal, m);
      s.position.set(X + cx + (rnd() - .5) * 1.4, .3 + rnd() * .5, Z + cz + (rnd() - .5) * 1.4);
      s.scale.set(.5 + rnd() * .6, 1.2 + rnd() * 2.4, .5 + rnd() * .6); s.rotation.set((rnd() - .5) * .8, rnd() * 6, (rnd() - .5) * .8);
      s.userData.keep = true; g.add(s);
    }
    shards.push(m);
  }
  const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .55, .15).multiplyScalar(2.4), toneMapped: false });
  const iron = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
  const flames = [];
  for (let z = -HZ + 5.5; z < HZ; z += 11) for (const s of [-1, 1]) {
    const tx = X + s * (HX - 1.5), tz = Z + z;
    box(.08, .5, .08, iron, tx, 3.1, tz);
    const f = new THREE.Mesh(new THREE.ConeGeometry(.14, .45, 8), flame); f.position.set(tx, 3.55, tz); f.userData.keep = true; g.add(f); flames.push(f);
  }

  // ---------- the plinths, their ropes and their cartridges ----------
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a8e7e, map: rockTex });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .3 });
  const velvet = new THREE.MeshLambertMaterial({ color: 0xa01828 });
  const nesGrey = new THREE.MeshLambertMaterial({ color: 0x9a9894 }), n64Black = new THREE.MeshLambertMaterial({ color: 0x26262a });
  for (const [id, [sx, sz, kind]] of Object.entries(SLOTS)) {
    const cx = X + sx, cz = Z + sz;
    box(6.8, PLINTH, 6.8, stone, cx, PLINTH / 2, cz);
    box(7, .08, 7, dark, cx, PLINTH + .04, cz).scale.y = .5;
    // velvet ropes on brass posts round the plinth, with a gap in front for the cartridge stand
    const toC = new THREE.Vector2(X - cx, Z - cz).normalize();
    const front = Math.abs(toC.x) > Math.abs(toC.y) ? [Math.sign(toC.x), 0] : [0, Math.sign(toC.y)];
    const R = 4;
    const posts = [];
    for (let k = -2; k <= 2; k++) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = ax ? ax * R : k * 2, pz = az ? az * R : k * 2;
      if (ax === front[0] && az === front[1] && Math.abs(k) < 1) continue;
      posts.push([cx + px, cz + pz]);
    }
    const uniq = [...new Map(posts.map(p => [p.join(), p])).values()];
    for (const [px, pz] of uniq) {
      box(.07, .9, .07, brass, px, .45, pz);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), brass); ball.position.set(px, .93, pz); g.add(ball);
    }
    for (let a = 0; a < uniq.length; a++) for (let b = a + 1; b < uniq.length; b++) {
      const [x0, z0] = uniq[a], [x1, z1] = uniq[b], d = Math.hypot(x1 - x0, z1 - z0);
      if (d > 2.05 || (Math.abs(x1 - x0) > .01 && Math.abs(z1 - z0) > .01)) continue;
      const mid = new THREE.Vector3((x0 + x1) / 2, .78, (z0 + z1) / 2);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, d, 6), velvet);
      rope.position.copy(mid); rope.rotation.set(Math.abs(z1 - z0) > .01 ? Math.PI / 2 : 0, 0, Math.abs(x1 - x0) > .01 ? Math.PI / 2 : 0); g.add(rope);
    }
    // the ropes keep you off the diorama: four low walls with a gap in front
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (ax === front[0] && az === front[1]) {
        // two stubs either side of the gap
        const along = ax ? [0, 1] : [1, 0];
        for (const s of [-1, 1]) {
          const mx = cx + ax * R + along[0] * s * 2.5, mz = cz + az * R + along[1] * s * 2.5;
          addBox(mx - (along[0] ? 1.5 : .1), 0, mz - (along[1] ? 1.5 : .1), mx + (along[0] ? 1.5 : .1), 1, mz + (along[1] ? 1.5 : .1));
        }
        continue;
      }
      const mx = cx + ax * R, mz = cz + az * R;
      addBox(mx - (ax ? .1 : R), 0, mz - (az ? .1 : R), mx + (ax ? .1 : R), 1, mz + (az ? .1 : R));
    }
    addBox(cx - 3.4, 0, cz - 3.4, cx + 3.4, PLINTH + .05, cz + 3.4);
    // the stand in the gap: a lectern, a giant cartridge in its slot, the game's name
    const sx2 = cx + front[0] * (R - .2), sz2 = cz + front[1] * (R - .2);
    const stand = new THREE.Group(); stand.position.set(sx2, 0, sz2); stand.rotation.y = Math.atan2(front[0], front[1]); g.add(stand);
    box(.9, .9, .6, dark, 0, .45, 0, stand);
    box(1, .08, .7, brass, 0, .92, 0, stand);
    const cart = box(kind === 'nes' ? .56 : .48, kind === 'nes' ? .62 : .4, .09, kind === 'nes' ? nesGrey : n64Black, 0, 1.25, -.05, stand);
    cart.rotation.x = -.15;
    const name = GAMES[id]?.name || id;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'nes' ? .46 : .4, kind === 'nes' ? .36 : .24), new THREE.MeshBasicMaterial({ map: tex(256, 192, (c, w, h) => {
      const hue = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 37 % 360;
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${hue},70%,55%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},70%,30%)`);
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = kind === 'nes' ? '#1a1a1a' : '#f2c21e'; c.fillRect(0, 0, w, 34);
      c.fillStyle = kind === 'nes' ? '#f2f2ee' : '#1a1a1a'; c.font = '700 22px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(kind === 'nes' ? '8 BITS' : '64', w / 2, 25);
      c.fillStyle = '#fff'; c.font = `700 ${name.length > 12 ? 28 : 36}px "Titan One", Rubik, sans-serif`; c.textBaseline = 'middle';
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 6; c.strokeText(name, w / 2, 112); c.fillText(name, w / 2, 112);
    }) }));
    label.position.set(0, 1.25, -.05); label.rotation.x = -.15; label.translateZ(.05); stand.add(label);
    interactables.push({ id: 'mg:' + id, game: id, pos: new THREE.Vector3(sx2, 1.2, sz2), reach: 2 });
  }

  // ---------- the portal gun, floating over its pedestal ----------
  const ped = new THREE.Group(); ped.position.set(X, 0, Z); g.add(ped);
  const pedM = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: .35, metalness: .1 });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.45, .6, 1.1, 24), pedM); col.position.y = .55; ped.add(col);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .08, 24), new THREE.MeshStandardMaterial({ color: 0x3a3e46 })); top.position.y = 1.14; ped.add(top);
  for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(1.4 - k * .3, 1.45 - k * .3, .12, 32), pedM); st.position.y = .06 + k * .12; ped.add(st); }
  const blueGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a8cff).multiplyScalar(2.2), toneMapped: false });
  const orangeGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a1a).multiplyScalar(2.2), toneMapped: false });
  const rings = [blueGlow, orangeGlow].map((m, k) => { const r = new THREE.Mesh(new THREE.TorusGeometry(.55 + k * .12, .02, 6, 48), m); r.position.y = 1.75; r.userData.keep = true; ped.add(r); return r; });
  // the gun itself
  const gun = new THREE.Group(); gun.position.y = 1.75; gun.userData.keep = true; ped.add(gun);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .3 }), grey = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: .5 });
  const gb = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .38, 6, 14), white); gb.rotation.z = Math.PI / 2; gun.add(gb);
  const gback = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), white); gback.position.x = -.25; gun.add(gback);
  const gcore = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .3, 12), blueGlow); gcore.rotation.z = Math.PI / 2; gcore.position.y = .09; gun.add(gcore);
  const ggrip = new THREE.Mesh(new THREE.BoxGeometry(.1, .24, .07), grey); ggrip.position.set(-.12, -.16, 0); ggrip.rotation.z = .3; gun.add(ggrip);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2, c = new THREE.Mesh(new THREE.BoxGeometry(.18, .025, .025), grey); c.position.set(.3, Math.cos(a) * .08, Math.sin(a) * .08); gun.add(c); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, 1.3, HH, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = HH / 2 + 1.1; ped.add(beam);
  // when it's gone: how long before the next one, on a little screen on the pedestal
  const clockCv = document.createElement('canvas'); clockCv.width = 256; clockCv.height = 64;
  const clockTex = new THREE.CanvasTexture(clockCv); clockTex.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(.8, .2), new THREE.MeshBasicMaterial({ map: clockTex, transparent: true }));
  clock.position.set(0, .8, .5); clock.rotation.x = -.2; clock.userData.keep = true; ped.add(clock);
  addBox(X - .65, 0, Z - .65, X + .65, 1.2, Z + .65);
  interactables.push({ id: 'pgun', pos: new THREE.Vector3(X, 1.6, Z), reach: 2.2 });
  let back = 0, shown = '';
  function drawClock(text) {
    if (text === shown) return; shown = text;
    const c = clockCv.getContext('2d'); c.clearRect(0, 0, 256, 64);
    if (!text) { clockTex.needsUpdate = true; return; }
    c.fillStyle = 'rgba(10,14,24,.85)'; c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#9ad8ff'; c.font = '600 30px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 33);
    clockTex.needsUpdate = true;
  }

  // ---------- the way in and out: the ladder up to the hatch ----------
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  for (const s of [-1, 1]) box(.07, HH + 2, .07, wood, LADDER.x + s * .3, (HH + 2) / 2, LADDER.z);
  for (let y = .3; y < HH + 1.5; y += .35) box(.6, .05, .05, wood, LADDER.x, y, LADDER.z);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.9, 2.5, HH + 4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.set(LADDER.x, (HH + 4) / 2, LADDER.z + 1); g.add(shaft);
  interactables.push({ id: 'caveup', pos: new THREE.Vector3(LADDER.x, 1.2, LADDER.z + .4), reach: 2 });
  // a sign by the ladder, and posters of the consoles on the walls
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .8), new THREE.MeshBasicMaterial({ map: tex(512, 128, (c, w, h) => {
    c.fillStyle = '#120c1c'; c.fillRect(0, 0, w, h);
    c.shadowColor = '#ff4ad8'; c.shadowBlur = 18; c.fillStyle = '#ff9af0'; c.font = '64px "Titan One", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('la cave secrète', w / 2, h / 2 + 4);
  }), toneMapped: false }));
  sign.position.set(LADDER.x + 3.5, 3.4, Z - HZ + .02); g.add(sign);

  // ---------- the garden's end of it: a trapdoor behind the shed, under the leaves ----------
  const trap = new THREE.Group(); trap.position.copy(TRAP); trap.rotation.y = -.2; scene.add(trap);
  const plank = new THREE.MeshLambertMaterial({ color: 0x6a4e34 });
  for (let k = 0; k < 5; k++) box(.2, .05, 1.1, plank, -.44 + k * .22, .025, 0, trap);
  for (const z of [-.35, .35]) box(1.1, .06, .1, new THREE.MeshLambertMaterial({ color: 0x4a3624 }), 0, .05, z, trap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.07, .015, 6, 16), iron); ring.rotation.x = Math.PI / 2; ring.position.set(.3, .06, 0); trap.add(ring);
  const leafM = [0xb8642a, 0xd89a3a, 0x8a4a1e, 0xa8782a].map(c => new THREE.MeshLambertMaterial({ color: c }));
  for (let k = 0; k < 40; k++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(.07 + rnd() * .05, 5), leafM[k % 4]);
    l.rotation.set(-Math.PI / 2, 0, rnd() * 6); const a = rnd() * 6, r = rnd() * .9;
    l.position.set(Math.cos(a) * r - .15, .07 + rnd() * .01, Math.sin(a) * r * .8); trap.add(l);
  }
  interactables.push({ id: 'trapdoor', pos: new THREE.Vector3(TRAP.x, .4, TRAP.z), reach: 1.6 });
  // a glint between the leaves, once you're close enough to notice
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(128, 128, (c) => {
    const r = c.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(.25, 'rgba(255,200,90,.6)'); r.addColorStop(1, 'rgba(255,160,40,0)');
    c.fillStyle = r; c.fillRect(0, 0, 128, 128); c.fillStyle = 'rgba(255,250,230,.9)'; c.fillRect(62, 4, 4, 120); c.fillRect(4, 62, 120, 4);
  }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glint.position.set(TRAP.x + .2, .25, TRAP.z); glint.scale.setScalar(.5); scene.add(glint);

  mergeStatic(g, (o) => o.userData.keep || o === stal);

  let t = 0;
  return {
    group: g, entry: new THREE.Vector3(LADDER.x, 0, LADDER.z + 1.4), exit: new THREE.Vector3(TRAP.x - .2, 0, TRAP.z - 1.3),
    // is this point in the hall?
    inside: (p) => Math.abs(p.x - X) < HX + 2 && Math.abs(p.z - Z) < HZ + 2 && p.y > -2 && p.y < HH + 8,
    get gunReady() { return back <= 0; },
    takeGun(seconds = GUN_REGEN) { back = seconds; },
    update(dt, near, eye) {
      t += dt;
      const dg = eye ? Math.hypot(eye.x - TRAP.x, eye.z - TRAP.z) : 99;
      glint.material.opacity = Math.max(0, Math.min(.8, (6 - dg) / 3)) * (.5 + .5 * Math.sin(t * 5));
      if (back > 0) back = Math.max(0, back - dt);
      const ready = back <= 0;
      gun.visible = ready;
      gun.rotation.y += dt * .8; gun.position.y = 1.75 + Math.sin(t * 1.6) * .06;
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t) * .4, t * 1.3, 0); rings[1].rotation.set(Math.PI / 2 + Math.cos(t * .8) * .4, -t, 0);
      for (const r of rings) r.visible = ready;
      beam.material.opacity = ready ? .06 + Math.sin(t * 2) * .015 : .02;
      drawClock(ready ? '' : `revient dans ${Math.floor(back / 60)}:${String(Math.floor(back % 60)).padStart(2, '0')}`);
      if (!near) return;
      for (const [k, f] of flames.entries()) { const s = .85 + Math.sin(t * 13 + k * 1.7) * .1 + Math.sin(t * 7.3 + k) * .08; f.scale.set(s, s * (1 + Math.sin(t * 9 + k) * .1), s); }
      for (const [k, m] of shards.entries()) m.color.copy(HUES[k % 4]).multiplyScalar(1.6 + Math.sin(t * 1.2 + k) * .3);
    },
  };
}

// ---------- after the key upstairs: the quest card again, now pointing at the trapdoor ----------
const WORDS = [[2, 'brûlant !!!'], [4, 'très chaud'], [8, 'chaud'], [15, 'tiède'], [25, 'froid'], [Infinity, 'glacial']];
export function createTrapGuide() {
  const $ = (id) => document.getElementById(id);
  const card = $('quest'), word = $('quest-word'), fill = $('quest-fill'), arrow = $('quest-arrow'), depthEl = $('quest-depth');
  const last = {};
  const set = (k, v, f) => { if (last[k] !== v) { last[k] = v; f(v); } };
  let shown = false, wait = 2;
  return {
    update(dt, player, show) {
      // let the key's card fly off first
      wait = show ? Math.max(0, wait - dt) : 2;
      show = show && wait <= 0;
      if (show !== shown) {
        shown = show;
        if (show) {
          for (const k in last) delete last[k];
          card.querySelector('.seclabel span').textContent = 'et maintenant…';
          $('quest-title').textContent = 'trouve la trappe secrète';
          $('quest-sub').textContent = 'quelque part dans le jardin · elle mène à une cave';
          card.classList.remove('hidden', 'got', 'out');
          card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
        } else card.classList.add('hidden');
      }
      if (!show) return;
      const dx = TRAP.x - player.pos.x, dz = TRAP.z - player.pos.z, d = Math.hypot(dx, dz);
      const heat = Math.max(0, 1 - d / 40);
      set('w', WORDS.find(([m]) => d < m)[1], (v) => { word.textContent = v; });
      set('c', Math.round(heat * 40), (v) => { word.style.color = `hsl(${200 - v * 5}, 95%, ${60 + v * .2}%)`; card.style.setProperty('--heat', v / 40); });
      set('f', Math.round(heat * 100), (v) => { fill.style.width = v + '%'; });
      const rel = Math.atan2(-dx, -dz) - player.yaw;
      set('a', d < 1.2 ? 'down' : Math.round(rel * 30), (v) => { arrow.classList.toggle('down', v === 'down'); if (v !== 'down') arrow.style.transform = `rotate(${-v / 30}rad)`; });
      set('d', d < 2 ? 'elle est là, sous les feuilles · e pour la soulever' : `à ${Math.round(d)} m d'ici`, (v) => { depthEl.textContent = v; });
      const lob = $('lobby');
      set('l', lob && !lob.classList.contains('hidden') ? lob.offsetHeight + 12 : 0, (v) => card.style.setProperty('--lift', v + 'px'));
    },
  };
}
