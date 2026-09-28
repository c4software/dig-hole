// house.js, the house you bought: a real door, and inside a bed, a charger for the
// shovel's battery, a computer for online orders, the exploits board, a trophy shelf,
// the previous owner's letter and a globe that knows the way to China. Upstairs, behind a
// locked door, the game room (gameroom.js); a staircase along the back wall leads there.
import * as THREE from 'three';
import { roofColliders } from './street.js';
import { buildGameRoom } from './gameroom.js';
import { buildWardrobe } from './boutiques.js';

const std = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });

export const ACH_LIST = [
  ['first', 'premier coup de pelle'], ['d10', '10 mètres'], ['d50', '50 mètres'], ['d100', 'tout au fond'],
  ['gold', 'premier or'], ['diamond', 'premier diamant'], ['fossil', 'un fossile'],
  ['mole', 'une taupe vaincue'], ['moles10', 'dix taupes'], ['boom', 'première explosion'],
  ['rich', '5 000 ● gagnés'], ['letters', 'toutes les lettres'], ['nap', 'une bonne sieste'],
  ['parcel', 'un colis livré'], ['china', 'bienvenue au japon'], ['dragon', 'un œuf de dragon'],
  ['find', 'une première trouvaille'], ['dino', 'un dinosaure'], ['van', 'délit de fuite'], ['craft', 'bricoleur'],
  ['plane', 'sous les bombes'], ['core', 'le centre de la terre'], ['obsidian', 'lave contre eau'],
  ['part', 'une pièce de fusée'], ['kart', 'vainqueur du grand prix'], ['rocket', 'la fusée est prête'], ['moon', 'sur la lune'], ['mars', 'sur mars'], ['animal', 'un animal attrapé'], ['swim', 'une poche d\'eau'], ['year', 'une année entière'],
];

export function createHouse({ scene, colliders, interactables, label }) {
  const g = new THREE.Group();
  scene.add(g);
  const HW = 11, HD = 7, HH = 3.4, T = 0.2;
  const F = HH + .15, H2 = 3, HH2 = HH + H2;             // upstairs: floor top, roof line
  const hz = -18.5, zf = hz + HD / 2, zb = hz - HD / 2;   // front -15, back -22
  const addBox = (x0, y0, z0, x1, y1, z1) => { const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }; colliders.push(c); return c; };
  const box = (w, h, d, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ---------- shell ----------
  const wallMat = std(0xeee3cc), innerMat = std(0xf3ead6);
  const DOOR_W = 1.2, DOOR_H = 2.2;
  box(HW, HH, T, wallMat, 0, HH / 2, zb + T / 2);
  box(T, HH, HD, wallMat, -HW / 2 + T / 2, HH / 2, hz);
  box(T, HH, HD, wallMat, HW / 2 - T / 2, HH / 2, hz);
  const segW = (HW - DOOR_W) / 2;
  box(segW, HH, T, wallMat, -HW / 2 + segW / 2, HH / 2, zf - T / 2);
  box(segW, HH, T, wallMat, HW / 2 - segW / 2, HH / 2, zf - T / 2);
  box(DOOR_W, HH - DOOR_H, T, wallMat, 0, DOOR_H + (HH - DOOR_H) / 2, zf - T / 2);
  addBox(-HW / 2, 0, zb, HW / 2, HH2, zb + T);
  addBox(-HW / 2, 0, zb, -HW / 2 + T, HH2, zf);
  addBox(HW / 2 - T, 0, zb, HW / 2, HH2, zf);
  addBox(-HW / 2, 0, zf - T, -DOOR_W / 2, HH, zf);
  addBox(DOOR_W / 2, 0, zf - T, HW / 2, HH, zf);
  addBox(-HW / 2, HH, zf - T, HW / 2, HH2, zf);
  // the upper storey, and a wooden band between the two
  box(HW, H2, T, wallMat, 0, HH + H2 / 2, zb + T / 2);
  box(T, H2, HD, wallMat, -HW / 2 + T / 2, HH + H2 / 2, hz);
  box(T, H2, HD, wallMat, HW / 2 - T / 2, HH + H2 / 2, hz);
  box(HW, H2, T, wallMat, 0, HH + H2 / 2, zf - T / 2);
  const band = std(0x8a5a3a);
  box(HW + .08, .22, .06, band, 0, HH + .05, zf + .02); box(HW + .08, .22, .06, band, 0, HH + .05, zb - .02);
  box(.06, .22, HD + .08, band, -HW / 2 - .02, HH + .05, hz); box(.06, .22, HD + .08, band, HW / 2 + .02, HH + .05, hz);
  // skirting inside, a darker band so the walls read as walls
  const skirt = std(0x8a6a4a);
  box(HW - 2 * T, .14, .03, skirt, 0, .07, zb + T + .015);
  box(.03, .14, HD - 2 * T, skirt, -HW / 2 + T + .015, .07, hz);
  box(.03, .14, HD - 2 * T, skirt, HW / 2 - T - .015, .07, hz);

  // floor planks
  const fc = document.createElement('canvas'); fc.width = 256; fc.height = 256;
  const fg = fc.getContext('2d');
  for (let n = 0; n < 8; n++) {
    fg.fillStyle = `hsl(28, 38%, ${34 + (n * 37 % 9)}%)`;
    fg.fillRect(0, n * 32, 256, 32);
    fg.fillStyle = 'rgba(0,0,0,.25)'; fg.fillRect(0, n * 32, 256, 2);
    fg.fillRect((n * 97) % 256, n * 32, 2, 32);
  }
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(3, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW - 2 * T, HD - 2 * T), new THREE.MeshLambertMaterial({ map: ft }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, .012, hz);
  g.add(floor);
  // the ceiling is the upstairs floor, with a hole for the stairs (x SX0..SX1 along the back wall)
  const SX0 = -3.22, SX1 = .2, SZ = -20.2, RISE = F / 10, RUN = .38;
  for (const [x0, x1, z0, z1] of [[-HW / 2 + T, HW / 2 - T, SZ, zf - T], [-HW / 2 + T, SX0, zb + T, SZ], [SX1, HW / 2 - T, zb + T, SZ]]) {
    box(x1 - x0, F - HH + .05, z1 - z0, innerMat, (x0 + x1) / 2, (HH - .05 + F) / 2, (z0 + z1) / 2);
    addBox(x0, HH - .05, z0, x1, F, z1);
  }
  // ---------- the staircase: nine steps up the back wall, then the landing ----------
  const stepMat = std(0x7a5634), treadMat = std(0x9a7248), nose = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39d8ff).multiplyScalar(1.8), toneMapped: false });
  for (let n = 1; n <= 9; n++) {
    const x1 = SX1 - (n - 1) * RUN, x0 = x1 - RUN, top = n * RISE, z1 = SZ;
    box(x1 - x0, top, z1 - zb - T, stepMat, (x0 + x1) / 2, top / 2, (zb + T + z1) / 2);
    box(x1 - x0 + .02, .04, z1 - zb - T + .02, treadMat, (x0 + x1) / 2, top - .02, (zb + T + z1) / 2);
    box(.02, .02, z1 - zb - T - .1, nose, x1 - .01, top + .005, (zb + T + z1) / 2);
    addBox(x0, 0, zb + T, x1, top, z1);
  }
  // a half step at the foot, the way in (from the room or along the wall)
  box(.4, RISE / 2, .65, stepMat, SX1 + .2, RISE / 4, SZ - .325);
  box(.02, .02, .55, nose, SX1 + .39, RISE / 2 + .005, SZ - .325);
  addBox(SX1, 0, SZ - .65, SX1 + .4, RISE / 2, SZ);
  // a banister on the open side: posts, a sloped rail, and a barrier so nobody bumps their head
  const railMat = std(0x5a3a22);
  for (let n = 4; n <= 9; n++) box(.05, .9, .05, railMat, SX1 - (n - .5) * RUN, n * RISE + .45, SZ + .03);
  const rail = box(Math.hypot(5 * RUN, 5 * RISE) + .2, .06, .07, railMat, SX1 - 6 * RUN, 6.5 * RISE + .9, SZ + .03);
  rail.rotation.z = -Math.atan2(RISE, RUN);
  addBox(SX0, 0, SZ, SX1 - 3 * RUN, F + 1, SZ + .07);
  // a rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), std(0x7a2a24));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-1.6, .02, -18.2); rug.scale.set(1.3, 1, 1);
  const rugIn = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.08, 32), std(0xd9a125));
  rugIn.rotation.x = -Math.PI / 2; rugIn.position.set(-1.6, .025, -18.2); rugIn.scale.set(1.3, 1, 1);
  g.add(rug, rugIn);

  // ---------- roof ----------
  const tri = new THREE.Shape();
  tri.moveTo(-HD / 2 - .6, 0); tri.lineTo(0, 2.4); tri.lineTo(HD / 2 + .6, 0); tri.lineTo(-HD / 2 - .6, 0);
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: HW + 0.8, bevelEnabled: false });
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(-(HW + 0.8) / 2, 0, 0);
  const roof = new THREE.Mesh(roofGeo, std(0xb8573a));
  roof.position.set(0, HH2, hz);
  g.add(roof);
  box(.7, 1.8, .7, std(0x8a4a38), 3, HH2 + 1.8, hz - 1);
  // the ceiling stops a jetpack; the roof above can be stood on
  addBox(-HW / 2, HH2 - .05, zb, HW / 2, HH2 + .15, zf);
  roofColliders(addBox, { x0: -HW / 2 - .4, x1: HW / 2 + .4, z0: hz - HD / 2 - .6, z1: hz + HD / 2 + .6, y: HH2, h: 2.4, kind: 'x' });

  // ---------- windows (through the wall, so they read from both sides) ----------
  const winMat = new THREE.MeshLambertMaterial({ color: 0x9cc0ee, emissive: 0x3a5a7a, transparent: true, opacity: .55 });
  const winDay = new THREE.Color(0x3a5a7a), winNight = new THREE.Color(0xffb860);
  const frameMat = std(0xfaf6ea);
  for (const x of [-3.4, 3.4]) {
    box(1.7, 1.3, T + .06, frameMat, x, 1.9, zf - T / 2).scale.set(1, 1, 1);
    box(1.45, 1.05, T + .1, winMat, x, 1.9, zf - T / 2);
    box(.07, 1.05, T + .12, frameMat, x, 1.9, zf - T / 2);
    box(1.9, .1, .3, frameMat, x, 1.22, zf + .12);
    box(1.6, .25, .3, std(0x7a4a2a), x, 1.05, zf + .2);
    // painted shutters, folded back against the wall
    for (const s2 of [-1, 1]) {
      box(.5, 1.35, .06, std(0x6f9a7c), x + s2 * 1.12, 1.9, zf + .04);
      for (let k = 0; k < 5; k++) box(.44, .03, .05, std(0x5a8266), x + s2 * 1.12, 1.4 + k * .25, zf + .08);
    }
    for (let n = 0; n < 6; n++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 4), std([0xe4183a, 0xffd75e, 0xf0e8d6][n % 3]));
      fl.position.set(x - .6 + n * .24, 1.24, zf + .2);
      g.add(fl);
    }
  }
  box(1.8, .15, .7, std(0xb8b0a0), 0, .075, zf + .35);

  // ---------- the door, on a hinge ----------
  const hinge = new THREE.Group();
  hinge.position.set(-DOOR_W / 2 + .03, 0, zf - T / 2);
  const doorMat = std(0x4b6b4f);
  const doorMesh = box(DOOR_W - .06, DOOR_H - .04, .07, doorMat, (DOOR_W - .06) / 2, DOOR_H / 2, 0, hinge);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.05), std(0xd9a125));
  knob.position.set(DOOR_W - .22, 1.05, .08);
  const knob2 = knob.clone(); knob2.position.z = -.08;
  hinge.add(knob, knob2);
  g.add(hinge);
  const doorBox = addBox(-DOOR_W / 2, 0, zf - T, DOOR_W / 2, DOOR_H, zf);
  let doorOpen = false, doorAng = 0;
  interactables.push({ id: 'door', pos: new THREE.Vector3(0, 1.2, zf - T / 2), reach: 2.2 });

  // warm light inside
  const bulb = new THREE.PointLight(0xffc98a, 6, 9, 1.2);
  bulb.position.set(0, HH - .4, hz);
  g.add(bulb);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.35, .3, 16, 1, true), std(0xd9a125, { side: THREE.DoubleSide, emissive: 0x5a3a10 }));
  shade.position.set(0, HH - .35, hz);
  g.add(shade);

  // ---------- the bed (back left) ----------
  const bed = new THREE.Group();
  box(1.2, .2, 2.1, std(0x6b4a2e), 0, .34, 0, bed);
  for (const [x, z] of [[-.54, -.98], [.54, -.98], [-.54, .98], [.54, .98]]) box(.08, .26, .08, std(0x5a3a22), x, .13, z, bed);
  box(1.1, .2, 2.0, std(0xf0e8d6), 0, .54, 0, bed);
  box(1.12, .1, 1.3, std(0x3b4a6b), 0, .66, .35, bed);
  box(1.16, .2, .02, std(0x3b4a6b), .0, .52, 1.0, bed);   // the cover hangs over the foot
  box(.8, .14, .4, std(0xffffff), 0, .7, -.72, bed);
  box(1.2, .9, .08, std(0x6b4a2e), 0, .55, -1.06, bed);
  bed.position.set(-4.4, 0, -20.6);
  g.add(bed);
  addBox(-5.3, 0, -21.8, -3.8, .7, -19.5);
  interactables.push({ id: 'bed', pos: new THREE.Vector3(-4.4, .6, -20.2) });

  // ---------- charger (right wall) ----------
  const charger = new THREE.Group();
  box(.55, 1.5, .45, std(0x2a2d33), 0, .75, 0, charger);
  box(.45, .08, .47, std(0xd9a125), 0, 1.45, 0, charger);
  const cells = [];
  for (let n = 0; n < 6; n++) {
    const c = box(.06, .12, .3, new THREE.MeshBasicMaterial({ color: 0x3a3020 }), -.28, .35 + n * .16, 0, charger);
    cells.push(c);
  }
  const plug = new THREE.Mesh(new THREE.TorusGeometry(.18, .025, 6, 16, Math.PI * 1.4), std(0x111111));
  plug.position.set(-.3, .9, .1); plug.rotation.y = Math.PI / 2;
  charger.add(plug);
  charger.position.set(5.0, 0, -17.0);
  g.add(charger);
  addBox(4.72, 0, -17.25, 5.3, 1.5, -16.75);
  const chargeLabel = new THREE.Mesh(new THREE.PlaneGeometry(.9, .3), new THREE.MeshBasicMaterial({ map: label('recharge', { color: '#ffd75e', bg: '#1a130c', size: 90 }) }));
  chargeLabel.position.set(5.28, 1.95, -17.0); chargeLabel.rotation.y = -Math.PI / 2;
  g.add(chargeLabel);
  interactables.push({ id: 'charger', pos: new THREE.Vector3(4.8, 1, -17.0) });

  // ---------- desk with the computer (back middle) ----------
  const desk = new THREE.Group();
  box(1.8, .06, .8, std(0x8a6a4a), 0, .78, 0, desk);
  for (const [x, z] of [[-.84, -.34], [.84, -.34], [-.84, .34], [.84, .34]]) box(.06, .78, .06, std(0x6b4a2e), x, .39, z, desk);
  box(.7, .45, .05, std(0x222428), 0, 1.13, -.2, desk);
  const screenTex = label('amazone · aliexpresso', { w: 512, h: 320, size: 38, color: '#ffd75e', bg: '#10141c' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.64, .39), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 1.13, -.17);
  desk.add(screen);
  box(.08, .15, .08, std(0x222428), 0, .88, -.2, desk);
  box(.5, .02, .16, std(0x33363c), 0, .82, .12, desk);
  box(.07, .02, .1, std(0x33363c), .4, .82, .12, desk);
  // a chair
  box(.5, .06, .5, std(0x6b4a2e), 0, .48, .75, desk);
  box(.5, .6, .06, std(0x6b4a2e), 0, .8, 1.0, desk);
  desk.position.set(1.55, 0, -21.3);
  g.add(desk);
  addBox(.65, 0, -21.75, 2.45, .85, -20.9);
  interactables.push({ id: 'computer', pos: new THREE.Vector3(1.55, 1.1, -21.1) });

  // ---------- the exploits board (left wall) ----------
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 768; boardCanvas.height = 512;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshLambertMaterial({ map: boardTex }));
  board.position.set(-HW / 2 + T + .03, 1.7, -16.9); board.rotation.y = Math.PI / 2;
  g.add(board);
  box(.05, 1.3, 1.9, std(0x6b4a2e), -HW / 2 + T + .01, 1.7, -16.9);
  function drawBoard(ach) {
    const c = boardCanvas.getContext('2d');
    c.fillStyle = '#9a7248'; c.fillRect(0, 0, 768, 512);
    for (let n = 0; n < 900; n++) { c.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; c.fillRect(Math.random() * 768, Math.random() * 512, 3, 3); }
    c.fillStyle = '#1a130c'; c.font = 'italic 44px Georgia'; c.textAlign = 'center'; c.fillText('exploits', 384, 56);
    c.textAlign = 'left'; c.font = 'italic 21px Georgia';
    ACH_LIST.forEach(([k, name], n) => {
      const x = 18 + (n % 3) * 248, y = 108 + Math.floor(n / 3) * 56;
      const got = !!ach[k];
      c.fillStyle = got ? '#fff6dc' : 'rgba(255,246,220,.35)';
      c.fillRect(x, y - 26, 236, 38);
      c.fillStyle = got ? '#d9a125' : '#555';
      c.beginPath(); c.arc(x + 16, y - 7, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = got ? '#1a130c' : 'rgba(26,19,12,.45)';
      c.fillText(got ? name : '? ? ?', x + 34, y);
    });
    boardTex.needsUpdate = true;
  }
  drawBoard({});
  interactables.push({ id: 'board', pos: new THREE.Vector3(-5.1, 1.6, -16.9) });

  // ---------- trophy shelf (back right) ----------
  const shelf = new THREE.Group();
  const wood = std(0x7a5530);
  for (let n = 0; n < 3; n++) box(1.6, .05, .35, wood, 0, .5 + n * .55, 0, shelf);
  box(.05, 1.7, .35, wood, -.8, .85, 0, shelf); box(.05, 1.7, .35, wood, .8, .85, 0, shelf);
  shelf.position.set(4.0, 0, -21.6);
  g.add(shelf);
  addBox(3.2, 0, -21.8, 4.8, 1.7, -21.4);
  const trophies = {};
  const addTrophy = (key, mesh, slot) => {
    const row = Math.floor(slot / 4), col = slot % 4;
    mesh.position.set(-.55 + col * .37, .62 + row * .55, 0);
    mesh.visible = false;
    shelf.add(mesh);
    trophies[key] = mesh;
  };
  // ore samples and the like, shown once found
  const gem = (color, geo) => new THREE.Mesh(geo || new THREE.OctahedronGeometry(.1), new THREE.MeshStandardMaterial({ color, metalness: .4, roughness: .3, emissive: color, emissiveIntensity: .15 }));
  [[20, 0xd4773a], [21, 0xc9b3a0], [22, 0xe8eef5], [23, 0xffc629], [24, 0xe4183a], [25, 0x7af4ff], [26, 0xf3ead0]].forEach(([id, c], n) => addTrophy(id, gem(c, id === 26 ? new THREE.TorusGeometry(.07, .025, 6, 12, Math.PI * 1.3) : null), n));
  interactables.push({ id: 'shelf', pos: new THREE.Vector3(4.0, 1.1, -21.4) });

  // ---------- the letter on a little round table ----------
  const table = new THREE.Group();
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .05, 20), std(0x8a6a4a));
  tt.position.y = .72;
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, .72, 8), std(0x6b4a2e));
  tl.position.y = .36;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(.26, .34), std(0xfff6dc, { emissive: 0x2a2010 }));
  paper.rotation.set(-Math.PI / 2, 0, .3); paper.position.y = .75;
  table.add(tt, tl, paper);
  table.position.set(-1.6, 0, -18.2);
  g.add(table);
  addBox(-2.05, 0, -18.65, -1.15, .75, -17.75);
  interactables.push({ id: 'letters', pos: new THREE.Vector3(-1.6, .8, -18.2) });

  // ---------- the globe (by the door, right) ----------
  const globe = new THREE.Group();
  const gc = document.createElement('canvas'); gc.width = 256; gc.height = 128;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#2d5d8a'; gg.fillRect(0, 0, 256, 128);
  gg.fillStyle = '#c9a25c';
  for (const [x, y, w, h] of [[20, 30, 50, 40], [60, 70, 25, 45], [120, 25, 40, 35], [125, 60, 30, 45], [165, 25, 70, 45], [205, 85, 30, 20]]) { gg.beginPath(); gg.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); gg.fill(); }
  gg.fillStyle = '#e4183a'; gg.beginPath(); gg.arc(128, 42, 4, 0, 7); gg.fill(); gg.beginPath(); gg.arc(206, 50, 4, 0, 7); gg.fill();
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(.3, 24, 16), new THREE.MeshLambertMaterial({ map: gt }));
  sphere.position.y = 1.2; sphere.rotation.z = .4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.34, .015, 6, 32, Math.PI * 1.2), std(0xd9a125));
  ring.position.y = 1.2; ring.rotation.set(0, Math.PI / 2, .4);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.04, .2, .9, 10), std(0x6b4a2e));
  stand.position.y = .45;
  globe.add(sphere, ring, stand);
  globe.position.set(3.2, 0, -15.9);
  g.add(globe);
  addBox(2.95, 0, -16.15, 3.45, 1.5, -15.65);
  interactables.push({ id: 'globe', pos: new THREE.Vector3(3.2, 1.1, -15.9) });

  // ---------- the workbench, for crafting (right wall, between charger and shelf) ----------
  const bench = new THREE.Group();
  box(.8, .08, 2, std(0x9a7248), 0, .9, 0, bench);
  for (const [x, z] of [[-.34, -.9], [.34, -.9], [-.34, .9], [.34, .9]]) box(.08, .9, .08, std(0x6b4a2e), x, .45, z, bench);
  box(.7, .05, 1.8, std(0x6b4a2e), 0, .3, 0, bench);
  box(.05, 1.1, 2, std(0xc8a878), .37, 1.5, 0, bench);            // pegboard
  const toolMat = std(0x555a60);
  box(.03, .5, .06, toolMat, .33, 1.6, -.6, bench);
  box(.03, .12, .25, toolMat, .33, 1.85, -.6, bench);
  box(.03, .4, .05, std(0x8a5f38), .33, 1.5, -.1, bench);
  box(.03, .18, .18, toolMat, .33, 1.72, -.1, bench);
  const saw = box(.02, .14, .55, toolMat, .33, 1.35, .5, bench);
  const vise = box(.18, .16, .2, std(0x2c4f9a), -.2, 1.02, .7, bench);
  const anvil = box(.22, .14, .4, std(0x33363c), -.1, 1.01, -.5, bench);
  bench.position.set(4.85, 0, -19.3);
  g.add(bench);
  addBox(4.4, 0, -20.35, 5.3, .95, -18.25);
  const craftLabel = new THREE.Mesh(new THREE.PlaneGeometry(.9, .3), new THREE.MeshBasicMaterial({ map: label('établi', { color: '#ffd75e', bg: '#1a130c', size: 100 }) }));
  craftLabel.position.set(5.26, 2.25, -19.3); craftLabel.rotation.y = -Math.PI / 2;
  g.add(craftLabel);
  interactables.push({ id: 'craft', pos: new THREE.Vector3(4.6, 1, -19.3) });

  // ---------- the big red button: fill the hole in, start a new map ----------
  const btn = new THREE.Group();
  box(.5, .6, .06, std(0xd9a125), 0, 0, 0, btn);
  box(.42, .52, .03, std(0x1a130c), 0, 0, .03, btn);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.11, .12, .08, 20), new THREE.MeshStandardMaterial({ color: 0xd42a2a, emissive: 0x5a0808, roughness: .3 }));
  cap.rotation.x = Math.PI / 2; cap.position.set(0, -.05, .08);
  btn.add(cap);
  const resetLabel = new THREE.Mesh(new THREE.PlaneGeometry(.4, .12), new THREE.MeshBasicMaterial({ map: label('RESET', { w: 256, h: 80, size: 56, italic: false, color: '#ffd75e' }), transparent: true }));
  resetLabel.position.set(0, .17, .05);
  btn.add(resetLabel);
  btn.position.set(-1.9, 1.35, zf - T - .04);
  btn.rotation.y = Math.PI;
  g.add(btn);
  interactables.push({ id: 'reset', pos: new THREE.Vector3(-1.9, 1.3, zf - T - .1), reach: 2.2 });

  // (the super reset lives in the admin console now, not on the wall)

  // a plant and a picture, for company
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.18, .14, .35, 10), std(0xa4452c));
  pot.position.set(-4.85, .18, -15.65);
  g.add(pot);
  for (let n = 0; n < 5; n++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(.18, 0), std(0x4f7d2c));
    leaf.position.set(-4.85 + Math.sin(n * 1.3) * .12, .5 + n * .1, -15.65 + Math.cos(n * 1.3) * .12);
    g.add(leaf);
  }
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(.9, .6), new THREE.MeshBasicMaterial({ map: label('le trou', { w: 256, h: 170, size: 42, color: '#f0e8d6', bg: '#2a3a28' }) }));
  // over the bed (the left wall is the wardrobe's)
  pic.position.set(-4.55, 1.95, zb + T + .02);
  g.add(pic);
  box(1.0, .7, .02, std(0xd9a125), -4.55, 1.95, zb + T + .005);

  // ---------- the wardrobe corner: armoire, mirror, turntable (boutiques.js) ----------
  const wardrobe = buildWardrobe({ g, addBox, interactables, label });

  // ---------- upstairs ----------
  const room = buildGameRoom({ g, addBox, interactables, label, F, HH, HH2, HW, T, zf, zb, hz, wallMat });

  let t = 0;
  return {
    group: g,
    get doorOpen() { return doorOpen; },
    toggleDoor() { doorOpen = !doorOpen; doorBox.off = doorOpen; return doorOpen; },
    // is a point inside the four walls?
    inside: (p) => p.x > -HW / 2 && p.x < HW / 2 && p.z > zb && p.z < zf && p.y > -0.5 && p.y < HH2,
    room, wardrobe,
    drawBoard,
    showTrophy(key) { if (trophies[key]) trophies[key].visible = true; },
    // lit windows at night, seen from the garden
    pressReset() { cap.position.z = .05; setTimeout(() => { cap.position.z = .08; }, 250); },
    pressSuper() {},
    setNight(n) { winMat.emissive.copy(winDay).lerp(winNight, n); winMat.opacity = .55 + n * .35; room.setNight(n); },
    setCharge(f) { cells.forEach((c, n) => c.material.color.setHex(f > n / 6 + .01 ? 0xffd75e : 0x3a3020)); },
    update(dt) {
      t += dt;
      doorAng += ((doorOpen ? 1.6 : 0) - doorAng) * Math.min(1, dt * 6);
      hinge.rotation.y = doorAng;
      sphere.rotation.y += dt * .3;
      room.update(dt);
    },
  };
}
