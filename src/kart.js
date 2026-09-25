// kart.js, the A Hole Grand Prix: a closed track far south of the garden, four karts
// (you and three drivers), item boxes (mushroom boost, banana, shell), three laps.
import * as THREE from 'three';

export const KART_ORIGIN = new THREE.Vector3(0, 0, 650);
const WIDTH = 10, N = 800, LAPS = 3;
const COLORS = [0xc8581a, 0xb02a24, 0x2a5cc0, 0x33904f];
const NAMES = ['toi', 'rouge', 'bleu', 'vert'];
const ITEMS = ['champi', 'banane', 'carapace'];
const ITEM_NAMES = { champi: 'champignon turbo', banane: 'banane', carapace: 'carapace' };

function kartModel(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .15 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: .8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: .9, roughness: .2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, .32, 2), paint); body.position.y = .38;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1, .22, .6), paint); nose.position.set(0, .34, 1.15); nose.rotation.x = .25;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.6, .5, .15), black); seat.position.set(0, .7, -.45);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, .06, .35), paint); wing.position.set(0, .95, -1.05);
  for (const x of [-.5, .5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.05, .4, .2), black); s.position.set(x, .75, -1.05); g.add(s); }
  const wheels = [];
  for (const [x, z] of [[-.7, .7], [.7, .7], [-.7, -.75], [.7, -.75]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .28, 14), black);
    w.rotation.z = Math.PI / 2; w.position.set(x, .3, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .3, 10), chrome);
    hub.rotation.z = Math.PI / 2; hub.position.copy(w.position);
    g.add(w, hub); wheels.push(w);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.16, .03, 6, 16), black); wheel.position.set(0, .82, .25); wheel.rotation.x = -.9;
  // the driver: a body and a helmet in the kart's colour
  const driver = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .3, 4, 10), new THREE.MeshStandardMaterial({ color: 0xf0ece2 }));
  driver.position.set(0, .85, -.2);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), paint); helmet.position.set(0, 1.28, -.18);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8, -.9, 1.8, 1, .9), new THREE.MeshStandardMaterial({ color: 0x222a3a, metalness: .8, roughness: .1 }));
  visor.position.set(0, 1.28, -.12);
  g.add(body, nose, seat, wing, wheel, driver, helmet, visor);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, wheels };
}

function label(text, color = '#ffd75e', bg = '#1a130c', w = 1024, h = 160, size = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.font = `italic ${size}px Georgia`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createKart({ scene, camera, audio, ui }) {
  const root = new THREE.Group();
  root.position.copy(KART_ORIGIN);
  root.visible = false;
  scene.add(root);

  // ---------- the track: a closed curve, a ribbon of road, kerbs on both sides ----------
  const ctrl = [[0, 0], [40, -6], [70, 10], [78, 45], [55, 70], [20, 62], [0, 80], [-30, 88], [-62, 70], [-70, 35], [-48, 18], [-58, -10], [-34, -24]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(N);
  pts.pop();
  const tang = pts.map((p, i) => pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize());
  const side = tang.map(t => new THREE.Vector3(-t.z, 0, t.x));
  function ribbon(inner, outer, y, mat, uvScale = 1) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = pts[k], s = side[k];
      pos.push(p.x + s.x * inner, y, p.z + s.z * inner, p.x + s.x * outer, y, p.z + s.z * outer);
      uv.push(0, i * uvScale, 1, i * uvScale);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    root.add(m);
    return m;
  }
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x6fa33c, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.02, 35); grass.receiveShadow = true;
  root.add(grass);
  const asphalt = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#4a4a50'; g.fillRect(0, 0, 128, 128);
    for (let n = 0; n < 1500; n++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .08})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(62, 0, 4, 60);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  ribbon(-WIDTH / 2, WIDTH / 2, .01, new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9 }), .15);
  const kerbTex = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#d42a2a'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#f4f4f0'; g.fillRect(0, 16, 16, 16);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: .7 });
  ribbon(WIDTH / 2, WIDTH / 2 + 1, .03, kerbMat, .5);
  ribbon(-WIDTH / 2 - 1, -WIDTH / 2, .03, kerbMat, .5);

  // start line, arch, grandstand, tyres, trees
  const check = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 4, j * 4, 4, 4); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, 1.4), new THREE.MeshBasicMaterial({ map: check }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = -Math.atan2(tang[0].z, tang[0].x) + Math.PI / 2;
  line.position.set(pts[0].x, .04, pts[0].z);
  root.add(line);
  const arch = new THREE.Group();
  const archMat = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .5, roughness: .4 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.5, 6, .5), archMat); p.position.set(s * (WIDTH / 2 + 1.2), 3, 0); arch.add(p); }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 3, 1.3, .3), new THREE.MeshBasicMaterial({ map: label('A HOLE · GRAND PRIX') }));
  banner.position.y = 6; arch.add(banner);
  arch.position.set(pts[0].x, 0, pts[0].z);
  arch.rotation.y = Math.atan2(tang[0].x, tang[0].z) + Math.PI / 2;
  root.add(arch);
  const stand = new THREE.Group();
  for (let r = 0; r < 4; r++) { const step = new THREE.Mesh(new THREE.BoxGeometry(24, .6, 1.4), new THREE.MeshStandardMaterial({ color: 0x9a9a9e })); step.position.set(0, .3 + r * .6, r * 1.4); stand.add(step); }
  for (let n = 0; n < 50; n++) { const f = new THREE.Mesh(new THREE.SphereGeometry(.25, 8, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), .6, .55) })); const r = Math.floor(Math.random() * 4); f.position.set(-11 + Math.random() * 22, .9 + r * .6, r * 1.4); stand.add(f); }
  stand.position.copy(pts[0]).addScaledVector(side[0], -WIDTH / 2 - 7);
  stand.rotation.y = Math.atan2(tang[0].x, tang[0].z) - Math.PI / 2;
  root.add(stand);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: .9 });
  for (let i = 0; i < N; i += 40) {
    const o = i % 80 ? 1 : -1;
    for (let h = 0; h < 3; h++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.4, .18, 8, 14), tyreMat); t.rotation.x = Math.PI / 2; t.position.copy(pts[i]).addScaledVector(side[i], o * (WIDTH / 2 + 2.5)); t.position.y = .18 + h * .34; root.add(t); }
  }
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f7d2c, roughness: .9 }), trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e });
  for (let n = 0; n < 60; n++) {
    const p = new THREE.Vector3((Math.random() - .5) * 220, 0, 35 + (Math.random() - .5) * 220);
    if (pts.some(q => q.distanceTo(p) < WIDTH + 6)) continue;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.25, .35, 2.4, 7), trunk); t.position.set(p.x, 1.2, p.z);
    const l = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 12, 10), leaf); l.position.set(p.x, 3.4, p.z);
    t.castShadow = l.castShadow = true;
    root.add(t, l);
  }

  // ---------- item boxes ----------
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xffd75e, transparent: true, opacity: .75, emissive: 0x6a4a08, roughness: .2 });
  const qTex = label('?', '#1a130c', 'rgba(0,0,0,0)', 128, 128, 110);
  const boxes = [];
  for (const i of [150, 380, 600]) for (const o of [-3, 0, 3]) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(.8, .8), new THREE.MeshBasicMaterial({ map: qTex, transparent: true })); q.rotation.y = r; q.translateZ(.51); b.add(q); }
    b.position.copy(pts[i]).addScaledVector(side[i], o); b.position.y = 1;
    root.add(b);
    boxes.push({ g: b, off: 0 });
  }

  // ---------- karts ----------
  const karts = [0, 1, 2, 3].map(n => {
    const m = kartModel(COLORS[n]);
    root.add(m.g);
    return { n, name: NAMES[n], ...m, pos: new THREE.Vector3(), yaw: 0, speed: 0, idx: 0, lap: 0, done: false, time: 0, spin: 0, boost: 0, item: null, lane: 0, skill: .9 + n * .03 };
  });
  const hazards = [];     // bananas on the road, shells in flight
  let state = 'off', t = 0, count = 0, onEnd = () => {}, playerTime = 0;

  function nearestIdx(p, from) {
    let best = from, bd = Infinity;
    for (let d = -40; d <= 40; d++) {
      const i = (from + d + N) % N;
      const q = pts[i];
      const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }
  const local = (v) => v.clone().sub(KART_ORIGIN);
  const progress = (k) => k.lap * N + k.idx;

  function start() {
    root.visible = true;
    state = 'count'; count = 3.5; t = 0; playerTime = 0;
    hazards.forEach(h => root.remove(h.g)); hazards.length = 0;
    boxes.forEach(b => { b.off = 0; b.g.visible = true; });
    // a staggered grid behind the line
    karts.forEach((k, n) => {
      const i = (N - 6 - n * 5) % N;
      k.pos.copy(pts[i]).addScaledVector(side[i], n % 2 ? 2.2 : -2.2).add(KART_ORIGIN);
      k.yaw = Math.atan2(tang[i].x, tang[i].z);
      k.speed = 0; k.idx = i; k.lap = -1; k.done = false; k.spin = 0; k.boost = 0; k.item = null;
      k.lane = (Math.random() - .5) * 5; k.skill = .86 + Math.random() * .1;
    });
    audio.tick();
  }

  function useItem(k) {
    if (!k.item) return;
    const it = k.item; k.item = null;
    const fwd = new THREE.Vector3(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    if (it === 'champi') { k.boost = 1.6; if (k.n === 0) audio.charge(); }
    else if (it === 'banane') {
      const g = new THREE.Mesh(new THREE.TorusGeometry(.25, .09, 6, 12, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0xffd21f }));
      g.position.copy(local(k.pos)).addScaledVector(fwd, -1.8); g.position.y = .2; g.rotation.x = Math.PI / 2;
      root.add(g); hazards.push({ type: 'banane', g, pos: g.position.clone(), life: 60 });
    } else {
      const g = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x39c07a, roughness: .3 }));
      g.position.copy(local(k.pos)).addScaledVector(fwd, 2); g.position.y = .2;
      root.add(g); hazards.push({ type: 'carapace', g, pos: g.position.clone(), vel: fwd.multiplyScalar(k.speed + 22), life: 5, owner: k });
    }
  }

  function hitKart(k) {
    if (k.spin > 0) return;
    k.spin = 1.2; k.speed *= .25;
    if (k.n === 0) { audio.bonk(); ui.toast('aïe !', true, 900); }
  }

  function update(dt, keys) {
    if (state === 'off') return;
    t += dt;
    if (state === 'count') {
      count -= dt;
      if (count <= 0) { state = 'race'; audio.buy(); }
    }
    const racing = state === 'race' || state === 'finished';
    const leader = Math.max(...karts.map(progress));
    for (const k of karts) {
      const lp = local(k.pos);
      k.idx = nearestIdx(lp, k.idx);
      // crossing the line forward
      if (k.prevIdx !== undefined) {
        if (k.prevIdx > N - 60 && k.idx < 60) {
          k.lap++;
          if (k.lap >= LAPS && !k.done) { k.done = true; k.time = playerTime; if (k.n === 0) finish(); }
          else if (k.n === 0 && k.lap > 0) { ui.toast(k.lap === LAPS - 1 ? 'dernier tour !' : `tour ${k.lap + 1} / ${LAPS}`, false, 1500); audio.tick(); }
        } else if (k.prevIdx < 60 && k.idx > N - 60) k.lap--;
      }
      k.prevIdx = k.idx;
      const off = Math.abs(lp.clone().sub(pts[k.idx]).dot(side[k.idx]));
      const offRoad = off > WIDTH / 2 + .5;
      let accel = 0, steer = 0;
      if (racing && !(k.done && k.n === 0)) {
        if (k.n === 0) {
          accel = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
          steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
        } else {
          // aim a little ahead along the track, in their own lane; catch up if behind
          const ahead = (k.idx + 22) % N;
          const target = pts[ahead].clone().addScaledVector(side[ahead], k.lane);
          const want = Math.atan2(target.x - lp.x, target.z - lp.z);
          let d = want - k.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          steer = THREE.MathUtils.clamp(d * 2.2, -1, 1);
          accel = 1;
          if (k.item && Math.random() < dt * .4) useItem(k);
        }
      } else if (k.done) accel = .3;
      const band = k.n === 0 ? 1 : THREE.MathUtils.clamp(1 + (progress(karts[0]) - progress(k)) / 400, .92, 1.12);
      let top = (k.n === 0 ? 24 : 24 * k.skill * band) * (offRoad ? .45 : 1) * (k.boost > 0 ? 1.55 : 1);
      if (k.spin > 0) { k.spin -= dt; accel = 0; steer = 0; }
      k.boost = Math.max(0, k.boost - dt);
      if (accel > 0) k.speed += (top - k.speed) * Math.min(1, dt * 1.4);
      else if (accel < 0) k.speed = Math.max(-6, k.speed - 30 * dt);
      else k.speed *= 1 - dt * .9;
      if (k.speed > top) k.speed += (top - k.speed) * Math.min(1, dt * 3);
      k.yaw += steer * dt * 2.2 * Math.min(1, Math.abs(k.speed) / 8) * Math.sign(k.speed || 1);
      k.pos.x += Math.sin(k.yaw) * k.speed * dt;
      k.pos.z += Math.cos(k.yaw) * k.speed * dt;
      // the barriers: a soft wall well off the road
      const lp2 = local(k.pos), c = pts[k.idx], s = side[k.idx];
      const o2 = lp2.clone().sub(c).dot(s);
      if (Math.abs(o2) > WIDTH / 2 + 5) { k.pos.addScaledVector(s, (Math.sign(o2) * (WIDTH / 2 + 5) - o2)); k.speed *= .7; }
      // item boxes
      for (const b of boxes) if (b.g.visible && b.g.position.distanceTo(lp2.setY(1)) < 1.4) {
        b.g.visible = false; b.off = 3;
        if (!k.item) { k.item = ITEMS[Math.floor(Math.random() * ITEMS.length)]; if (k.n === 0) { audio.pickup(2); ui.toast('objet : ' + ITEM_NAMES[k.item], false, 1500); } }
      }
      // bump into each other
      for (const o of karts) if (o !== k) { const d = k.pos.distanceTo(o.pos); if (d < 1.6 && d > 0) { const push = k.pos.clone().sub(o.pos).setY(0).normalize().multiplyScalar((1.6 - d) * .5); k.pos.add(push); } }
      k.g.position.copy(lp2.setY(0));
      k.g.rotation.y = k.yaw + (k.spin > 0 ? k.spin * 12 : 0);
      k.wheels.forEach(w => { w.rotation.x += k.speed * dt / .3; });
    }
    for (const b of boxes) { b.g.rotation.y += dt * 1.5; b.g.position.y = 1 + Math.sin(t * 3) * .12; if (b.off > 0) { b.off -= dt; if (b.off <= 0) b.g.visible = true; } }
    for (let n = hazards.length - 1; n >= 0; n--) {
      const h = hazards[n];
      h.life -= dt;
      if (h.vel) { h.pos.addScaledVector(h.vel, dt); h.g.position.copy(h.pos); h.g.rotation.y += dt * 10; }
      let gone = h.life <= 0;
      for (const k of karts) {
        if (h.owner === k && h.life > 4.6) continue;
        if (local(k.pos).setY(.2).distanceTo(h.pos) < 1.1) { hitKart(k); gone = true; break; }
      }
      if (gone) { root.remove(h.g); hazards.splice(n, 1); }
    }
    if (racing && !karts[0].done) playerTime += dt;
    if (keys.has('Space') && racing && karts[0].item) useItem(karts[0]);
    // camera: chasing your kart
    const me = karts[0];
    const behind = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    const want = me.pos.clone().addScaledVector(behind, 5.5).setY(2.6 + KART_ORIGIN.y);
    if (camera.position.distanceTo(want) > 30) camera.position.copy(want);
    camera.position.lerp(want, Math.min(1, dt * 6));
    camera.up.set(0, 1, 0);
    camera.lookAt(me.pos.clone().setY(1).addScaledVector(behind, -3));
    void leader;
  }

  function place() {
    const order = [...karts].sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.time - b.time : progress(b) - progress(a)));
    return order.indexOf(karts[0]) + 1;
  }
  function finish() {
    state = 'finished';
    const p = place();
    audio.win();
    setTimeout(() => onEnd({ place: p, time: playerTime }), 1800);
  }

  return {
    start, update,
    stop() { state = 'off'; root.visible = false; },
    // tests: put your kart just before the line on its last lap
    _warp() { const k = karts[0], i = N - 30; k.lap = LAPS - 1; k.idx = i; k.prevIdx = i; k.pos.copy(pts[i]).add(KART_ORIGIN); k.yaw = Math.atan2(tang[i].x, tang[i].z); k.speed = 20; },
    get running() { return state !== 'off'; },
    // for the HUD
    hud() {
      const me = karts[0];
      if (state === 'count') return { count: Math.ceil(count - .5) };
      return { lap: Math.min(LAPS, Math.max(1, me.lap + 1)), laps: LAPS, place: place(), of: karts.length, time: playerTime, item: me.item ? ITEM_NAMES[me.item] : null };
    },
    set onEnd(f) { onEnd = f; },
  };
}
