// caddies-stand.js, where the trolley race starts: a row of nested shopping trolleys by the church
// portal, a board on a post, and the « e » to play. Light enough to stay on the square all the time.
import * as THREE from 'three';
import { cartModel } from './caddies-art.js';
import { canvasTex } from './lib/tex.js';
import { mergeStatic } from './merge.js';

export const STAND = { x: 56.3, z: 13.9 };

export function createCaddieStand({ parent, colliders, interactables, at = STAND }) {
  const g = new THREE.Group(); g.position.set(at.x, .1, at.z); parent.add(g);
  // five trolleys nested nose to tail, pointing west
  const row = new THREE.Group(); row.rotation.y = -Math.PI / 2; g.add(row);
  for (let k = 0; k < 5; k++) { const c = cartModel(0x2a4ac0, { items: false }); c.g.position.z = .7 - k * .25; c.body.position.y = k * .012; row.add(c.g); }
  // the board: « course de caddies », a checkered flag
  const tex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#f6f2ea'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8281e'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    for (let x = 0; x < 6; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f6f2ea'; c.fillRect(80 + x * 16, 14 + y * 16, 16, 16); }
    c.fillStyle = '#c8281e'; c.font = '800 30px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('COURSE', w / 2, 70); c.fillText('DE CADDIES', w / 2, 102);
  });
  const post = new THREE.Mesh(new THREE.BoxGeometry(.07, 1.6, .07), new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: .5 }));
  post.position.set(1.3, .8, 0); g.add(post);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .7 }));
  board.position.set(1.3, 1.55, .05); g.add(board);
  mergeStatic(g);
  colliders.push({ min: new THREE.Vector3(at.x - 1.1, 0, at.z - .35), max: new THREE.Vector3(at.x + 1.4, 1.1, at.z + .35) });
  const it = { id: 'mg:caddies', game: 'caddies', pos: new THREE.Vector3(at.x, 1.1, at.z - .7), reach: 2.2 };
  interactables.push(it);
  return { group: g, it };
}
