// hologram.js, above the globe in the house: the hole seen through the ground, a
// translucent gold model of every dug-out block (blue where water sits), and its depth.
import * as THREE from 'three';
import { NX, NZ, S } from './terrain.js';

const MAX = 16000;

export function createHologram({ scene, at, label }) {
  const g = new THREE.Group();
  g.position.copy(at);
  g.visible = false;
  scene.add(g);
  // the plot is 16 m wide and 100 m deep: squash it into 0.5 m x 1.6 m
  const H = 0.5 / (NX * S), V = 1.6 / 400;
  const W = NX * S * H, D = NZ * S * H;

  const glass = new THREE.Mesh(new THREE.BoxGeometry(W, 1.62, D), new THREE.MeshBasicMaterial({ color: 0x9cc0ee, transparent: true, opacity: .06, depthWrite: false }));
  glass.position.y = -0.81;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0xd9a125, transparent: true, opacity: .7 }));
  edges.position.copy(glass.position);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x6fa33c, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }));
  lawn.rotation.x = -Math.PI / 2;
  g.add(glass, edges, lawn);

  const cell = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false });
  const blocks = new THREE.InstancedMesh(cell, mat, MAX);
  blocks.count = 0;
  blocks.frustumCulled = false;
  g.add(blocks);

  const tagCanvas = document.createElement('canvas'); tagCanvas.width = 512; tagCanvas.height = 128;
  const tagTex = new THREE.CanvasTexture(tagCanvas); tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false }));
  tag.scale.set(.8, .2, 1);
  tag.position.y = .14;
  g.add(tag);
  function drawTag(depth) {
    const c = tagCanvas.getContext('2d');
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = 'rgba(11,13,18,.7)'; c.beginPath(); c.roundRect(20, 18, 472, 92, 46); c.fill();
    c.fillStyle = '#ffd75e'; c.font = 'italic 54px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`le trou · ${depth.toFixed(1)} m`, 256, 66);
    tagTex.needsUpdate = true;
  }

  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const gold = new THREE.Color(0xffd75e), blue = new THREE.Color(0x3f9fe0);
  let t = 0;
  let depthNow = 0;
  function rebuild(terrain) {
    const list = terrain.airBlocks(2);
    let n = 0;
    for (const [i, j, k, water] of list) {
      if (n >= MAX) break;
      const x = (i + 1) * S * H - W / 2, z = (k + 1) * S * H - D / 2;
      const y = -((terrain.NY - j - 1) * S) * V;
      m4.makeScale(2 * S * H * .95, 2 * S * V * 1.4, 2 * S * H * .95).setPosition(x, y, z);
      blocks.setMatrixAt(n, m4);
      blocks.setColorAt(n, col.copy(water ? blue : gold).multiplyScalar(.6 + .4 * Math.min(1, j / terrain.NY + .3)));
      n++;
    }
    blocks.count = n;
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    drawTag(depthNow);
  }

  return {
    get on() { return g.visible; },
    setDepth(d) { depthNow = d; },
    toggle(terrain) { g.visible = !g.visible; if (g.visible) { rebuild(terrain); t = 0; } return g.visible; },
    update(dt, terrain) {
      if (!g.visible) return;
      t += dt;
      g.rotation.y += dt * .25;
      if (t > 2) { t = 0; rebuild(terrain); }
    },
  };
}
