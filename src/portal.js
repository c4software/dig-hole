// portal.js, the portal gun from the secret cave: left click opens a blue portal, right click an
// orange one, on any ground, wall or ceiling, in any world. Walk (or fall) into one, come out of the
// other with your momentum turned to match: fall into a floor portal, fly out of a wall. Through
// your own pair you see the other side (the scene drawn again from a camera moved through the
// portals, clipped at the far portal); the others' portals only swirl, to keep the frame cheap.
// Everyone sees and may use everyone's portals.
import * as THREE from 'three';
import { toolMat } from './tool.js';

const RX = .5, RY = .9;                     // the oval's half width and half height
const COLORS = [0x2a8cff, 0xff8a1a];
const up0 = new THREE.Vector3(0, 1, 0);

const swirlVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// alone, a portal shows a swirl of its colour
const swirlFrag = `varying vec2 vUv; uniform vec3 uC; uniform float uT;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
  float s = sin(a * 5.0 + r * 9.0 - uT * 4.0) * .5 + .5;
  gl_FragColor = vec4(mix(uC * .25, uC * 1.6, s * (1.0 - r * .6) + (1.0 - r) * .5), 1.0); }`;
// paired, it shows what the other side sees: the picture drawn from the moved camera, at the same pixel
const viewFrag = `uniform sampler2D uMap; uniform vec2 uRes; uniform vec3 uC; varying vec2 vUv;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  vec3 c = texture2D(uMap, gl_FragCoord.xy / uRes).rgb;
  gl_FragColor = vec4(mix(c, uC * 1.4, smoothstep(.82, 1.0, r) * .8), 1.0); }`;

export function createPortals({ scene, camera, renderer, audio }) {
  const root = new THREE.Group(); scene.add(root);
  const T = { value: 0 };
  const rtSize = new THREE.Vector2();
  const res = { value: new THREE.Vector2(1, 1) };
  // the portals, by owner: [blue, orange], each null or { pos, n, up, right, g, surf, ring, rt, view }
  const pairs = new Map();
  const surfGeo = new THREE.CircleGeometry(1, 48), ringGeo = new THREE.RingGeometry(.94, 1.1, 64, 1), haloGeo = new THREE.RingGeometry(1.08, 1.3, 64, 1);

  function build(owner, which, p, w) {
    const g = new THREE.Group();
    const color = new THREE.Color(COLORS[which]);
    const swirl = new THREE.ShaderMaterial({ vertexShader: swirlVert, fragmentShader: swirlFrag, uniforms: { uC: { value: color }, uT: T } });
    const surf = new THREE.Mesh(surfGeo, swirl);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.4), toneMapped: false }));
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [surf, ring, halo]) { m.scale.set(RX, RY, 1); g.add(m); }
    ring.position.z = halo.position.z = .004;
    const basis = new THREE.Matrix4().makeBasis(p.right, p.up, p.n);
    g.quaternion.setFromRotationMatrix(basis);
    g.position.copy(p.pos);
    g.scale.setScalar(.01); g.visible = w === world;
    root.add(g);
    return { ...p, owner, which, w, g, surf, swirl, view: null, rt: null, open: 0 };
  }
  function drop(q) {
    if (!q) return;
    root.remove(q.g);
    q.swirl.dispose(); q.view?.dispose(); q.rt?.dispose();
    q.g.children.forEach(m => m.material !== q.swirl && m.material.dispose());
  }
  // a portal from what the network carries: [x, y, z, nx, ny, nz, ux, uy, uz]
  function frame(a) {
    const pos = new THREE.Vector3(a[0], a[1], a[2]), n = new THREE.Vector3(a[3], a[4], a[5]).normalize(), up = new THREE.Vector3(a[6], a[7], a[8]).normalize();
    return { pos, n, up, right: new THREE.Vector3().crossVectors(up, n).normalize() };
  }
  // a portal belongs to a world: the two of a pair must be in the same one to join
  let world = 'home';
  function set(owner, which, a, w = world) {
    const pair = pairs.get(owner) || [null, null];
    drop(pair[which]);
    pair[which] = a ? build(owner, which, frame(a), w) : null;
    const other = pair[1 - which];
    if (a && other && other.w !== w) { drop(other); pair[1 - which] = null; }
    pairs.set(owner, pair);
    if (!pair[0] && !pair[1]) pairs.delete(owner);
  }
  function clear(owner) { const p = pairs.get(owner); if (p) { drop(p[0]); drop(p[1]); pairs.delete(owner); } }

  // ---------- the gun in your hands ----------
  const gun = new THREE.Group();
  const white = toolMat(0xf4f4f0, 'gloss'), black = toolMat(0x24262c, 'gloss'), rubber = toolMat(0x1e2026, 'soft'), steel = toolMat(0xb8c0ca, 'metal');
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[0]).multiplyScalar(2), depthTest: false, transparent: true, toneMapped: false });
  const put = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); gun.add(o); return o; };
  // the shell: turned like a vase, fat at the back, slim at the nose
  const prof = [[0, .2], [.05, .195], [.074, .17], [.082, .12], [.078, .04], [.066, -.05], [.052, -.12], [.045, -.16], [0, -.16]].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.LatheGeometry(prof, 32); shell.rotateX(Math.PI / 2);
  put(shell, white);
  // a black band and a black cap at the back, with a ring of light
  put(new THREE.CylinderGeometry(.08, .082, .03, 32, 1, true), black, 0, 0, .06, Math.PI / 2);
  put(new THREE.TorusGeometry(.05, .006, 8, 32), glow, 0, 0, .196);
  // the glass tube on top, and its glowing core: the colour of the last portal
  put(new THREE.CylinderGeometry(.022, .022, .17, 16), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .3, depthTest: false, depthWrite: false }), 0, .085, .01, Math.PI / 2);
  const core = put(new THREE.CylinderGeometry(.009, .009, .15, 10), glow, 0, .085, .01, Math.PI / 2);
  for (const z of [-.075, .095]) put(new THREE.CylinderGeometry(.027, .027, .014, 16), black, 0, .085, z, Math.PI / 2);
  // the nose: a black collar, a steel ring, three white claws round the emitter
  put(new THREE.CylinderGeometry(.04, .048, .05, 24), black, 0, 0, -.17, Math.PI / 2);
  put(new THREE.TorusGeometry(.041, .005, 8, 24), steel, 0, 0, -.196);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(ca * .042, sa * .042, -.18), new THREE.Vector3(ca * .05, sa * .05, -.23), new THREE.Vector3(ca * .03, sa * .03, -.27)]);
    put(new THREE.TubeGeometry(curve, 12, .009, 6), white);
  }
  put(new THREE.SphereGeometry(.018, 14, 10), glow, 0, 0, -.225);
  // the grip, raked back, and a trigger
  const gs = new THREE.Shape(); gs.moveTo(-.02, 0); gs.lineTo(.035, 0); gs.lineTo(.05, -.15); gs.quadraticCurveTo(.05, -.17, .03, -.17); gs.lineTo(-.005, -.17); gs.lineTo(-.02, -.02);
  const gg = new THREE.ExtrudeGeometry(gs, { depth: .03, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 3 }); gg.translate(0, 0, -.015); gg.rotateY(-Math.PI / 2);
  put(gg, rubber, 0, -.05, .03);
  put(new THREE.BoxGeometry(.012, .035, .018), black, 0, -.07, -.015, .3);
  gun.traverse(o => { o.renderOrder = 999; });
  gun.scale.setScalar(.68); gun.visible = false;
  camera.add(gun);
  const REST = new THREE.Vector3(.27, -.14, -.62);
  let kick = 0, last = -1;
  // the shot: a bright streak from the gun to the wall
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  beam.visible = false; root.add(beam);
  let beamT = 0;

  // ---------- aiming: the ground (voxels), then the world's boxes ----------
  const tmp = new THREE.Vector3(), inv = new THREE.Vector3();
  function hitBoxes(eye, dir, boxes, max) {
    let best = null;
    inv.set(1 / dir.x, 1 / dir.y, 1 / dir.z);
    for (const c of boxes) {
      if (c.off) continue;
      let t0 = 0, t1 = max, face = -1, sign = 0;
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z', o = eye[k], iv = inv[k];
        let ta = (c.min[k] - o) * iv, tb = (c.max[k] - o) * iv, s = -1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
        if (ta > t0) { t0 = ta; face = a; sign = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { miss = true; break; }
      }
      if (miss || face < 0 || (best && t0 >= best.t)) continue;
      const n = new THREE.Vector3(); n.setComponent(face, sign);
      best = { t: t0, point: eye.clone().addScaledVector(dir, t0), normal: n };
    }
    return best;
  }
  function aim(eye, dir, terrain, boxes, max = 60) {
    const a = terrain?.raycast(eye, dir, max);
    const b = hitBoxes(eye, dir, boxes, a ? a.t : max);
    const h = b && (!a || b.t < a.t) ? b : a;
    if (!h || h.normal.lengthSq() < .5) return null;
    return h;
  }
  // a surface hit made into a portal: level on walls, turned to face you on floors and ceilings
  function place(hit, dir, worldUp = up0) {
    const n = hit.normal.clone().normalize();
    let up;
    if (Math.abs(n.dot(worldUp)) > .7) up = dir.clone().projectOnPlane(n).normalize().multiplyScalar(n.dot(worldUp) > 0 ? 1 : -1);
    else up = worldUp.clone().projectOnPlane(n).normalize();
    if (up.lengthSq() < .5) up = new THREE.Vector3(1, 0, 0).projectOnPlane(n).normalize();
    const pos = hit.point.clone().addScaledVector(n, .03);
    // on a wall, the bottom of the oval sits no lower than the hit's floor would allow: nudge it up a bit
    if (Math.abs(n.dot(worldUp)) <= .7) pos.addScaledVector(worldUp, .15);
    return [pos.x, pos.y, pos.z, n.x, n.y, n.z, up.x, up.y, up.z].map(v => Math.round(v * 1000) / 1000);
  }

  // ---------- going through ----------
  const loc = new THREE.Vector3(), out = new THREE.Vector3();
  // a direction through the pair: into A's frame, turned half round its up, out of B's frame
  function carry(v, A, B, target) {
    const r = v.dot(A.right), u = v.dot(A.up), n = v.dot(A.n);
    return target.set(0, 0, 0).addScaledVector(B.right, -r).addScaledVector(B.up, u).addScaledVector(B.n, -n);
  }
  // body: { pos, vel, up?, yaw?, cd?, size? }. Without a size, it's a walker (you): the feet go
  // into a floor portal, the chest into a wall. With one (an animal, a bomb, a clod of earth):
  // its point pos + up * size goes in, and comes out that far clear of the other side.
  function tryPass(body, A, B) {
    const bodyUp = body.up || up0;
    const floor = A.n.dot(bodyUp) > .7, small = body.size != null;
    const lift = small ? body.size : floor ? .05 : .9;
    tmp.copy(body.pos).addScaledVector(bodyUp, lift).sub(A.pos);
    const d = tmp.dot(A.n), x = tmp.dot(A.right), y = tmp.dot(A.up);
    // a floor portal takes you as soon as you stand on it; a wall one when you walk up against it
    const reach = small ? body.size + .15 : floor ? .15 : .42;
    if (d > reach || d < -.6 || body.vel.dot(A.n) > .3) return false;
    if ((x / RX) ** 2 + (y / RY) ** 2 > 1) return false;
    // through: the body lands clear of B, its speed and facing turned to match
    carry(body.vel, A, B, out);
    const exitSpeed = out.dot(B.n);
    if (exitSpeed < 1.5) out.addScaledVector(B.n, 1.5 - exitSpeed);
    body.vel.copy(out);
    const bUp = B.n.dot(bodyUp);
    if (small) body.pos.copy(B.pos).addScaledVector(B.n, reach + .05).addScaledVector(bodyUp, -lift);
    else if (bUp > .7) body.pos.copy(B.pos).addScaledVector(B.n, .1);
    else if (bUp < -.7) body.pos.copy(B.pos).addScaledVector(B.n, 1.9);
    else body.pos.copy(B.pos).addScaledVector(B.n, .45).addScaledVector(bodyUp, -.8);
    if (body.yaw != null) {
      loc.set(-Math.sin(body.yaw), 0, -Math.cos(body.yaw));
      carry(loc, A, B, out); out.y = 0;
      if (out.lengthSq() > .01) body.yaw = Math.atan2(-out.x, -out.z);
    }
    return true;
  }
  // anything that moves, once a frame: true when it went through
  function pass(body, dt, quiet = false) {
    if ((body.cd = (body.cd || 0) - dt) > 0) return false;
    for (const pair of pairs.values()) {
      if (!pair[0] || !pair[1] || pair[0].w !== world || pair[1].w !== world) continue;
      for (let k = 0; k < 2; k++) if (tryPass(body, pair[k], pair[1 - k])) { body.cd = .35; if (!quiet) audio.pop(); return true; }
    }
    return false;
  }

  // ---------- seeing through: the scene again, from the camera moved through the pair ----------
  const vcam = new THREE.PerspectiveCamera();
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), half = new THREE.Matrix4().makeRotationY(Math.PI), m = new THREE.Matrix4();
  const clip = new THREE.Plane(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();
  function drawThrough(A, B) {
    renderer.getDrawingBufferSize(rtSize);
    const w = Math.max(2, Math.round(rtSize.x * .5)), h = Math.max(2, Math.round(rtSize.y * .5));
    if (!A.rt) {
      A.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      A.view = new THREE.ShaderMaterial({ vertexShader: swirlVert, fragmentShader: viewFrag, uniforms: { uMap: { value: A.rt.texture }, uRes: res, uC: { value: new THREE.Color(COLORS[A.which]) } } });
    } else if (A.rt.width !== w || A.rt.height !== h) A.rt.setSize(w, h);
    mA.makeBasis(A.right, A.up, A.n).setPosition(A.pos);
    mB.makeBasis(B.right, B.up, B.n).setPosition(B.pos);
    m.copy(mB).multiply(half).multiply(mA.clone().invert()).multiply(camera.matrixWorld);
    vcam.matrixWorld.copy(m); vcam.matrixWorld.decompose(vcam.position, vcam.quaternion, vcam.scale);
    vcam.matrixWorldInverse.copy(m).invert();
    vcam.projectionMatrix.copy(camera.projectionMatrix); vcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    clip.setFromNormalAndCoplanarPoint(B.n, B.pos);
    const prevT = renderer.getRenderTarget(), prevClip = renderer.clippingPlanes;
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.setRenderTarget(A.rt);
    renderer.clippingPlanes = [clip]; renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, vcam);
    renderer.clippingPlanes = prevClip; renderer.shadowMap.autoUpdate = shadows;
    renderer.setRenderTarget(prevT);
    A.surf.material = A.view;
  }

  return {
    get held() { return gun.visible; },
    set held(v) { gun.visible = v; },
    // shoot a portal: returns what to send the others, or null (nothing to stick to)
    // only the portals of the world you're in show and work
    setWorld(w) { if (w === world) return; world = w; for (const p of pairs.values()) for (const q of p) if (q) q.g.visible = q.w === w; },
    shoot(which, eye, dir, terrain, boxes, worldUp, meId) {
      if (T.value - last < .25) return null;
      last = T.value; kick = 1;
      glow.color.setHex(COLORS[which]).multiplyScalar(2);
      const hit = aim(eye, dir, terrain, boxes);
      audio.zap();
      beam.material.color.setHex(COLORS[which]).multiplyScalar(2);
      const from = tmp.copy(REST).applyMatrix4(camera.matrixWorld), to = hit ? hit.point : eye.clone().addScaledVector(dir, 30);
      beam.position.lerpVectors(from, to, .5); beam.scale.set(1, from.distanceTo(to), 1);
      beam.quaternion.setFromUnitVectors(up0, to.clone().sub(from).normalize());
      beam.visible = true; beamT = .15;
      if (!hit) return null;
      const a = place(hit, dir, worldUp);
      set(meId, which, a);
      return a;
    },
    set, clear,
    // what to tell someone who just arrived: [which, data, world] of each of mine
    mine(owner) { const p = pairs.get(owner); return p ? p.map((q, k) => q && [k, [q.pos.x, q.pos.y, q.pos.z, q.n.x, q.n.y, q.n.z, q.up.x, q.up.y, q.up.z].map(v => Math.round(v * 1000) / 1000), q.w]).filter(Boolean) : []; },
    // every frame: the gun, the portals opening, and whether the body goes through one
    update(dt, body, moving) {
      T.value += dt;
      kick = Math.max(0, kick - dt * 8);
      gun.position.copy(REST); gun.position.z += kick * .06; gun.rotation.set(kick * .25 + .06, .2, 0);
      if (moving) gun.position.y += Math.sin(T.value * 9) * .008;
      core.scale.x = core.scale.z = 1 + Math.sin(T.value * 8) * .15;
      if (beamT > 0) { beamT -= dt; beam.material.opacity = Math.max(0, beamT / .15); if (beamT <= 0) beam.visible = false; }
      for (const pair of pairs.values()) for (const q of pair) if (q) { q.open = Math.min(1, q.open + dt * 5); q.g.scale.setScalar(.01 + q.open * .99); }
      return body ? pass(body, dt) : false;
    },
    pass,
    // the open pairs of the world you're in: [[a, b], …] (each end: pos, n, up, right)
    pairs() { const out = []; for (const p of pairs.values()) if (p[0] && p[1] && p[0].w === world && p[1].w === world) out.push(p); return out; },
    RX, RY,
    // is there a pair open in this world? (else nothing needs checking)
    get open() { for (const p of pairs.values()) if (p[0] && p[1] && p[0].w === world && p[1].w === world) return true; return false; },
    // before the frame: your own pair's views (the others only swirl)
    render(meId) {
      renderer.getDrawingBufferSize(res.value);
      const pair = pairs.get(meId);
      for (const p of pairs.values()) for (const q of p) if (q && (p !== pair || !p[0] || !p[1])) q.surf.material = q.swirl;
      if (!pair || !pair[0] || !pair[1] || pair[0].w !== world) return;
      camera.updateMatrixWorld();
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      const was = gun.visible; gun.visible = false;
      const vis = pair.map(q => { sphere.set(q.pos, RY); return frustum.intersectsSphere(sphere) && q.pos.distanceTo(camera.position) < 45 && tmp.subVectors(camera.position, q.pos).dot(q.n) > 0; });
      for (const q of pair) q.surf.visible = false;
      for (let k = 0; k < 2; k++) if (vis[k]) drawThrough(pair[k], pair[1 - k]); else pair[k].surf.material = pair[k].swirl;
      for (const q of pair) q.surf.visible = true;
      gun.visible = was;
    },
  };
}
