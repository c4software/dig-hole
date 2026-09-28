// marioportal-cab.js, the arcade cabinet of « super portail » in the secret cave, against the wall left of
// the ladder: a tall purple cabinet, a lit marquee, a screen the game is laid on, a stick and two buttons
// (blue, orange). It registers its screen with the game room's, so the camera walks up to it to play.
import * as THREE from 'three';
import { CAVE } from './cave.js';
import { screens } from './gameroom.js';
import { mergeStatic } from './merge.js';

function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}

export function createMarioCabinet({ scene, colliders, interactables }) {
  const at = new THREE.Vector3(CAVE.x - 8, 0, CAVE.z - 22 + 1.1);
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const L = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // the sides: painted with a blue and an orange ring
  const sideTex = tex(64, 128, (x) => {
    x.fillStyle = '#3a1c6a'; x.fillRect(0, 0, 64, 128);
    x.fillStyle = '#5a2c9a'; for (let k = 0; k < 128; k += 8) x.fillRect(0, k, 64, 2);
    for (const [cx, cy, col] of [[22, 40, '#2a8cff'], [42, 88, '#ff8a1a']]) { x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.ellipse(cx, cy, 11, 17, 0, 0, 7); x.stroke(); }
  });
  const side = new THREE.MeshLambertMaterial({ map: sideTex, emissive: 0x1a0c30 });
  const body = L(0x2a1450, 0x12082a), black = L(0x141418), steel = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: .7, roughness: .3 });
  for (const s of [-1, 1]) add(B(.06, 1.95, .9), side, s * .4, .975, 0);
  add(B(.74, .95, .8), body, 0, .475, .02);                 // the base
  add(B(.74, .12, .5), black, 0, 1.0, .18);                  // the control panel
  add(B(.74, .7, .12), body, 0, 1.4, -.34);                  // behind the screen
  add(B(.74, .3, .7), body, 0, 1.82, -.05);                  // under the marquee
  add(B(.74, .05, .9), black, 0, 1.97, 0);
  // the stick and the buttons
  add(new THREE.CylinderGeometry(.012, .012, .1, 8), steel, -.16, 1.1, .22);
  add(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshLambertMaterial({ color: 0xd82800, emissive: 0x300000 }), -.16, 1.16, .22);
  const glow = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false });
  add(new THREE.CylinderGeometry(.035, .035, .03, 16), glow(0x2a8cff), .08, 1.07, .2).userData.keep = true;
  add(new THREE.CylinderGeometry(.035, .035, .03, 16), glow(0xff8a1a), .2, 1.07, .24).userData.keep = true;
  // the coin door
  add(B(.26, .3, .02), black, 0, .55, .425);
  add(B(.04, .07, .01), glow(0xff3030), -.06, .58, .437).userData.keep = true;
  add(B(.04, .07, .01), glow(0xff3030), .06, .58, .437).userData.keep = true;
  // the marquee
  const marquee = add(new THREE.PlaneGeometry(.72, .2), new THREE.MeshBasicMaterial({ toneMapped: false, map: tex(288, 80, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a0c3a'); gr.addColorStop(1, '#4a1c7a');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.font = '700 38px "Titan One", Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#101010'; x.strokeText('super portail', w / 2, h / 2 + 2);
    const tg = x.createLinearGradient(0, 16, 0, 64); tg.addColorStop(0, '#fcd860'); tg.addColorStop(1, '#f87800');
    x.fillStyle = tg; x.fillText('super portail', w / 2, h / 2 + 2);
    x.fillStyle = '#2a8cff'; x.fillRect(8, 30, 6, 22); x.fillStyle = '#ff8a1a'; x.fillRect(w - 14, 30, 6, 22);
  }) }), 0, 1.84, .31);
  marquee.userData.keep = true;
  // the screen: the title in pixels while nobody plays; the game's canvas is laid over it
  const W = .56, H = .525;
  add(B(.66, .6, .03), black, 0, 1.36, -.27);
  const screen = add(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ toneMapped: false, map: tex(128, 120, (x) => {
    x.fillStyle = '#a4e4fc'; x.fillRect(0, 0, 128, 120);
    x.fillStyle = '#f0b060'; x.fillRect(0, 96, 128, 24); x.fillStyle = '#18a018'; x.fillRect(0, 96, 128, 4);
    x.fillStyle = '#f4f6fa'; x.fillRect(84, 48, 16, 48); x.fillStyle = '#ff8a1a'; x.fillRect(82, 60, 3, 18);
    x.fillStyle = '#2a8cff'; x.fillRect(24, 94, 18, 3);
    x.fillStyle = '#c8581a'; x.fillRect(56, 76, 8, 5); x.fillStyle = '#fcb890'; x.fillRect(57, 81, 6, 4); x.fillStyle = '#2038a0'; x.fillRect(56, 85, 8, 8);
    x.fillStyle = '#101010'; x.font = '700 14px monospace'; x.textAlign = 'center'; x.fillText('SUPER', 64, 22); x.fillText('PORTAIL', 64, 38);
    x.fillStyle = '#fcfcfc'; x.font = '10px monospace'; x.fillText('INSERT COIN', 64, 112);
  }) }), 0, 1.36, -.25, -.12);
  screen.name = 'screen-marioportal'; screen.userData.keep = true;
  mergeStatic(g, (o) => o.userData.keep);
  g.updateMatrixWorld(true);
  const q = screen.getWorldQuaternion(new THREE.Quaternion());
  screens.marioportal = { center: screen.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), w: W, h: H, mesh: screen };
  colliders.push({ min: new THREE.Vector3(at.x - .44, 0, at.z - .45), max: new THREE.Vector3(at.x + .44, 2, at.z + .45) });
  interactables.push({ id: 'mg:marioportal', game: 'marioportal', pos: new THREE.Vector3(at.x, 1.2, at.z + .7), reach: 2 });
  return { group: g, screen };
}
