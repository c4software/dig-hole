// teleport.js, a pad in the corner of the house and its twin in China: step on one,
// come out of the other. A gold disc, a ring, a column of light that breathes.
import * as THREE from 'three';

export function createPad(scene, at, label, text) {
  const g = new THREE.Group();
  g.position.copy(at);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.8, .88, .1, 32), new THREE.MeshStandardMaterial({ color: 0x1d2029, metalness: .6, roughness: .4 }));
  base.position.y = .05;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.72, .045, 8, 40), new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .25, emissive: 0x5a3a08 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .11;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(.66, 32), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = .105;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.62, .68, 2.6, 32, 1, true), beamMat);
  beam.position.y = 1.4;
  // little sparks rising
  const sparkGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(40 * 3);
  for (let n = 0; n < 40; n++) { const a = Math.random() * 6.28, r = Math.random() * .6; sp[n * 3] = Math.cos(a) * r; sp[n * 3 + 1] = Math.random() * 2.6; sp[n * 3 + 2] = Math.sin(a) * r; }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const dg = dot.getContext('2d'), gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffe08a, size: .06, map: new THREE.CanvasTexture(dot), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .32), new THREE.MeshBasicMaterial({ map: label(text, { color: '#ffd75e', bg: '#1a130c', size: 64 }), side: THREE.DoubleSide }));
  sign.position.y = 2.95;
  g.add(base, ring, glow, beam, sparks, sign);
  scene.add(g);
  let t = 0;
  return {
    group: g,
    pos: at.clone(),
    sign,
    // is someone standing on it?
    on: (p) => Math.hypot(p.x - at.x, p.z - at.z) < .6 && Math.abs(p.y - at.y) < .6,
    update(dt, cam) {
      t += dt;
      glowMat.opacity = .45 + Math.sin(t * 3) * .15;
      beamMat.opacity = .12 + Math.sin(t * 2) * .05;
      ring.rotation.z = t * .4;
      for (let n = 0; n < 40; n++) { sp[n * 3 + 1] += dt * (.4 + (n % 5) * .15); if (sp[n * 3 + 1] > 2.6) sp[n * 3 + 1] = 0; }
      sparkGeo.attributes.position.needsUpdate = true;
      if (cam) sign.lookAt(cam.x, at.y + 2.95, cam.z);
    },
  };
}
