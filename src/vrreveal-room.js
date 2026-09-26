// vrreveal-room.js, the headset model and the real room around the game: a desk, a lamp,
// a window on a night city, and the game world as a model on a board (1 m of room = 100 units).
import * as THREE from 'three';

// the part of the world kept on the board; the rest is clipped away
export const BOX = { x0: -78, x1: 78, z0: -46, z1: 60, y0: -14 };
export const LAMP_HEAD = new THREE.Vector3(66, 92, 30), LAMP_AIM = new THREE.Vector3(-6, -4, -2);
const DESK = -16.5, FLOOR = DESK - 75, CEIL = FLOOR + 262, BACK = -122, FRONT = 330, SIDE = 262;

let seed = 11;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const DISPLAY = "'Titan One', 'Rubik', sans-serif";
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (map, k = 1, extra) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), ...extra });
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const ex = (shape, depth, bevel, seg = 3) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 10 }); g.center(); return g; };

// ---------- the headset: cream shell, orange ear pods, a glossy visor with two sleepy eyes ----------
export function buildHeadset() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: .42, metalness: .05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2631, roughness: .85 });
  const visorTex = tex(256, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a2f5e'); gr.addColorStop(.55, '#12162e'); gr.addColorStop(1, '#2a1640');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    // two soft cyan eyes
    for (const x of [84, 172]) {
      const e = c.createRadialGradient(x, 64, 2, x, 64, 30);
      e.addColorStop(0, 'rgba(120,255,240,.95)'); e.addColorStop(.45, 'rgba(60,200,255,.45)'); e.addColorStop(1, 'rgba(60,200,255,0)');
      c.fillStyle = e; c.fillRect(x - 32, 30, 64, 68);
      c.fillStyle = '#bffcff'; c.beginPath(); c.ellipse(x, 66, 9, 13, 0, 0, 7); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 3, 60, 3, 0, 7); c.fill();
    }
    // the gloss: a diagonal sheen and a thin reflection line
    c.fillStyle = 'rgba(255,255,255,.28)';
    c.beginPath(); c.moveTo(30, 0); c.lineTo(78, 0); c.lineTo(34, h); c.lineTo(-14, h); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, 10, w, 3);
  });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1a2038, roughness: .1, metalness: .4, map: visorTex, emissive: 0xffffff, emissiveMap: visorTex, emissiveIntensity: .45 });
  const Y = .062;
  const body = new THREE.Mesh(ex(rrect(.2, .1, .036), .075, .012, 4), shell);
  body.position.y = Y; g.add(body);
  const vg = ex(rrect(.188, .084, .03), .006, .006), vp = vg.attributes.position, vuv = vg.attributes.uv;
  for (let i = 0; i < vp.count; i++) vuv.setXY(i, vp.getX(i) / .2 + .5, vp.getY(i) / .096 + .5);
  const v = new THREE.Mesh(vg, visor);
  v.position.set(0, Y - .002, .054); g.add(v);
  // an orange band round the brow
  const band = new THREE.Mesh(ex(rrect(.21, .012, .006), .09, .003, 2), accent);
  band.position.set(0, Y + .052, -.004); g.add(band);
  const gasket = new THREE.Mesh(ex(rrect(.19, .088, .03), .018, .006), dark);
  gasket.position.set(0, Y - .003, -.062); g.add(gasket);
  // ear pods with little vents
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(.033, .035, .02, 24), accent);
    pod.rotation.z = Math.PI / 2; pod.position.set(s * .12, Y, -.01); g.add(pod);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .006, 24), shell);
    cap.rotation.z = Math.PI / 2; cap.position.set(s * .131, Y, -.01); g.add(cap);
    for (let k = -1; k <= 1; k++) { const vent = new THREE.Mesh(new THREE.BoxGeometry(.002, .003, .022), dark); vent.position.set(s * .1345, Y + k * .008, -.01); g.add(vent); }
  }
  // the strap round the back of the head, and one over the top
  const strapGeo = new THREE.TorusGeometry(.108, .0075, 6, 40, Math.PI);
  strapGeo.rotateX(-Math.PI / 2); strapGeo.scale(1, 3, 1.25);
  const strap = new THREE.Mesh(strapGeo, dark);
  strap.position.set(0, Y, -.05); g.add(strap);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(.032, .03, .008), accent);
  buckle.position.set(0, Y, -.05 - .108 * 1.25 - .002); g.add(buckle);
  const topGeo = new THREE.TorusGeometry(.068, .006, 6, 24, Math.PI);
  topGeo.rotateY(Math.PI / 2); topGeo.scale(3, .42, 1);
  const top = new THREE.Mesh(topGeo, dark);
  top.position.set(0, Y + .05, -.118); g.add(top);
  // a tiny antenna, and the led
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(.0022, .0022, .05, 6), dark);
  ant.position.set(-.07, Y + .085, -.01); ant.rotation.z = .25; g.add(ant);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.008, 12, 8), accent);
  ball.position.set(-.076, Y + .11, -.01); g.add(ball);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(.009, .01, .005, 16), dark);
  housing.position.set(.072, Y + .063, .035); g.add(housing);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 4, 1.4) });
  const led = new THREE.Mesh(new THREE.SphereGeometry(.0062, 12, 8), ledMat);
  led.position.set(.072, Y + .066, .035); g.add(led);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0x40ff90, transparent: true, opacity: .25, depthWrite: false }));
  halo.position.copy(led.position); g.add(halo);
  led.onBeforeRender = () => { const k = .45 + .55 * Math.pow(Math.sin(performance.now() / 420) * .5 + .5, 2); ledMat.color.setRGB(.4 * k, 4 * k, 1.4 * k); halo.material.opacity = .08 + .22 * k; };
  g.traverse(o => { if (o.isMesh && o !== halo) { o.castShadow = true; o.receiveShadow = true; } });
  g.name = 'vr-headset';
  return g;
}

// ---------- the room ----------
export function buildRoom() {
  seed = 11;
  const room = new THREE.Group();
  room.name = 'vr-room';
  const add = (m, x, y, z, parent = room) => { m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, parent);
  const rod = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
    m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    room.add(m); return m;
  };

  // --- the board: soil layers on the cut edges, a wooden tray, a brass plate
  const soil = (len) => tex(1024, 256, (c, w, h) => {
    const L = [[0, '#6da446'], [12, '#4a3020'], [60, '#7a5232'], [108, '#a8683a'], [148, '#6c655f'], [204, '#3b302b']];
    L.forEach(([y0, col], i) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y0 + (i ? Math.sin(x * .0123 + i * 2) * 5 + Math.sin(x * .049 + i) * 3 : 0));
      c.lineTo(w, h); c.fill();
    });
    for (let n = 0; n < 3000; n++) { c.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.18)' : 'rgba(255,240,210,.1)'; c.fillRect(rnd() * w, 14 + rnd() * (h - 14), 2 + rnd() * 3, 2); }
    for (let n = 0; n < 90; n++) { const y = 70 + rnd() * 180; c.fillStyle = `hsl(30,8%,${30 + rnd() * 30}%)`; c.beginPath(); c.ellipse(rnd() * w, y, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(40,24,12,.7)'; c.lineWidth = 1.5;
    for (let n = 0; n < 30; n++) { let x = rnd() * w, y = 12; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 14; y += 5 + rnd() * 6; c.lineTo(x, y); } c.stroke(); }
    for (let n = 0; n < 26; n++) { c.fillStyle = ['#6ff4ff', '#ffd75e', '#ff5e7a', '#b6ff6a'][n % 4]; const x = rnd() * w, y = 150 + rnd() * 90; c.fillRect(x, y, 5, 5); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x, y, 2, 2); }
    c.fillStyle = '#e8dcc0'; c.save(); c.translate(w * .63, 128); c.rotate(-.2); c.fillRect(-18, -2, 36, 4); for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 19, -3, 4, 0, 7); c.arc(s * 19, 3, 4, 0, 7); c.fill(); } c.restore();
    for (let x = 0; x < w; x += 3) { c.fillStyle = `hsl(${90 + rnd() * 20},45%,${30 + rnd() * 20}%)`; c.fillRect(x, 8 + rnd() * 6, 2, 6 + rnd() * 6); }
  }, true);
  const { x0, x1, z0, z1, y0 } = BOX, T = 1.2, H = -y0 + .3, lx = x1 - x0 + 2 * T, lz = z1 - z0 + 2 * T;
  const grassTop = lam(0x5c8f3a);
  const soilMat = (len) => { const t = soil(len); t.repeat.set(len / (H * 4), 1); return lam(0xffffff, { map: t }); };
  const sx = soilMat(lx), sz = soilMat(lz);
  const side = (w, d, m, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), [m, m, grassTop, m, m, m]); b.position.set(x, y0 + H / 2, z); b.castShadow = b.receiveShadow = true; room.add(b); };
  side(lx, T, sx, (x0 + x1) / 2, z1 + T / 2); side(lx, T, sx, (x0 + x1) / 2, z0 - T / 2);
  side(T, lz - 2 * T, sz, x0 - T / 2, (z0 + z1) / 2); side(T, lz - 2 * T, sz, x1 + T / 2, (z0 + z1) / 2);
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0x241810));
  pit.rotation.x = -Math.PI / 2; add(pit, (x0 + x1) / 2, y0 + .05, (z0 + z1) / 2);
  const woodTex = tex(512, 128, (c, w, h) => {
    c.fillStyle = '#6b4526'; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 60; n++) { c.strokeStyle = `rgba(${rnd() < .5 ? '40,22,10' : '150,100,60'},.35)`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); const y = rnd() * h; c.moveTo(0, y); for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * .02 + n) * 4); c.stroke(); }
  }, true);
  const tray = box(lx + 6, 2.5, lz + 6, lam(0xffffff, { map: woodTex }), (x0 + x1) / 2, y0 - 1.25, (z0 + z1) / 2);
  tray.castShadow = tray.receiveShadow = true;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), new THREE.MeshStandardMaterial({ map: tex(512, 64, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f3cf6a'); gr.addColorStop(1, '#a9771f');
    c.fillStyle = gr; c.fillRect(0, 0, w, h); c.strokeStyle = '#6b4a14'; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#3a2508'; c.font = `34px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('a hole  ·  échelle 1:100', w / 2, h / 2 + 2);
  }), metalness: .3, roughness: .4 }));
  add(plate, 0, y0 + 4.5, z1 + T + .05);

  // --- the desk
  const deskTex = tex(1024, 512, (c, w, h) => {
    c.fillStyle = '#3e2718'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) { c.fillStyle = `hsl(24,${38 + rnd() * 10}%,${15 + rnd() * 5}%)`; c.fillRect(0, r * 64 + 1, w, 62); }
    for (let n = 0; n < 220; n++) { c.strokeStyle = `rgba(${rnd() < .5 ? '20,10,4' : '120,80,48'},.28)`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); const y = rnd() * h; c.moveTo(0, y); for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * .01 + n) * 3); c.stroke(); }
    // the lamp's pool of light, painted in
    const g = c.createRadialGradient(w * .52, h * .52, 20, w * .52, h * .52, w * .62);
    g.addColorStop(0, 'rgba(255,200,130,.35)'); g.addColorStop(.5, 'rgba(255,190,120,.08)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const DW = 300, DZ0 = BACK + 1, DZ1 = 78;
  const desk = box(DW, 4, DZ1 - DZ0, lam(0xffffff, { map: deskTex }), 0, DESK - 2, (DZ0 + DZ1) / 2);
  desk.receiveShadow = true;
  const legM = lam(0x24170e);
  for (const x of [-DW / 2 + 4, DW / 2 - 4]) box(5, 75 - 4, DZ1 - DZ0 - 8, legM, x, FLOOR + (75 - 4) / 2, (DZ0 + DZ1) / 2);
  box(DW - 10, 30, 3, legM, 0, DESK - 19, DZ0 + 6);

  // --- walls, floor, ceiling: light painted in (basic materials), so the room stays dim
  const wall = (w, h, base, glows) => tex(1024, 512, (c, W, Hh) => {
    const gr = c.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#0d1016'); gr.addColorStop(.55, base); gr.addColorStop(1, '#0b0d12');
    c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
    for (let x = 0; x < W; x += 24) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(x, 0, 10, Hh); }
    for (const [gx, gy, r, col] of glows) { const g = c.createRadialGradient(gx * W, gy * Hh, 4, gx * W, gy * Hh, r * W); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, Hh); }
    const v = c.createRadialGradient(W / 2, Hh / 2, W * .2, W / 2, Hh / 2, W * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); c.fillStyle = v; c.fillRect(0, 0, W, Hh);
  });
  const WH = CEIL - FLOOR;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE, WH), basic(wall(2 * SIDE, WH, '#27303c', [[.62, .3, .28, 'rgba(255,180,110,.32)'], [.5, .45, .3, 'rgba(90,110,200,.2)']])));
  add(back, 0, FLOOR + WH / 2, BACK);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - BACK, WH), basic(wall(FRONT - BACK, WH, '#232a35', [[.2, .45, .3, 'rgba(90,110,200,.12)']])));
  left.rotation.y = Math.PI / 2; add(left, -SIDE, FLOOR + WH / 2, (BACK + FRONT) / 2);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - BACK, WH), basic(wall(FRONT - BACK, WH, '#262d38', [[.8, .4, .3, 'rgba(255,170,100,.22)']])));
  right.rotation.y = -Math.PI / 2; add(right, SIDE, FLOOR + WH / 2, (BACK + FRONT) / 2);
  const floorTex = tex(1024, 1024, (c, w, h) => {
    for (let r = 0; r < 16; r++) { c.fillStyle = `hsl(26,30%,${9 + rnd() * 4}%)`; c.fillRect(0, r * 64, w, 63); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(((r * 377) % w), r * 64, 3, 64); }
    const g = c.createRadialGradient(w / 2, h * .3, 30, w / 2, h * .3, w * .7); g.addColorStop(0, 'rgba(255,190,120,.12)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE, FRONT - BACK), basic(floorTex));
  floor.rotation.x = -Math.PI / 2; add(floor, 0, FLOOR, (BACK + FRONT) / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE, FRONT - BACK), new THREE.MeshBasicMaterial({ color: 0x0c0e13 }));
  ceil.rotation.x = Math.PI / 2; add(ceil, 0, CEIL, (BACK + FRONT) / 2);
  const skirting = lam(0x1a1714);
  box(2 * SIDE, 10, 2, skirting, 0, FLOOR + 5, BACK + 1);

  // --- the window: a night city, blinds half down, curtains
  const WX = 200, WY0 = DESK + 26, WYH = 112, WZ = BACK + .6;
  const city = tex(1024, 600, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#060a1e'); sky.addColorStop(.6, '#1a1640'); sky.addColorStop(1, '#4a2450');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 160; n++) { c.fillStyle = `rgba(255,255,255,${.3 + rnd() * .6})`; c.fillRect(rnd() * w, rnd() * h * .5, 1.5, 1.5); }
    c.fillStyle = '#f4ecd0'; c.beginPath(); c.arc(w * .8, h * .16, 26, 0, 7); c.fill();
    c.fillStyle = '#0a0f26'; c.beginPath(); c.arc(w * .8 + 12, h * .16 - 6, 24, 0, 7); c.fill();
    const layer = (y, col, bw, hmin, hmax, win, lit) => {
      let x = -10;
      while (x < w) {
        const bwid = bw * (.6 + rnd() * .8), bh = hmin + rnd() * (hmax - hmin);
        c.fillStyle = col; c.fillRect(x, h - y - bh, bwid, bh + y);
        if (rnd() < .2) { c.fillRect(x + bwid / 2 - 1, h - y - bh - 24, 2, 24); c.fillStyle = '#ff4050'; c.fillRect(x + bwid / 2 - 2, h - y - bh - 27, 4, 4); }
        for (let wy = h - y - bh + 8; wy < h - 6; wy += win * 1.8) for (let wx = x + 5; wx < x + bwid - win; wx += win * 1.7) {
          if (rnd() < lit) { c.fillStyle = rnd() < .8 ? `hsl(${40 + rnd() * 15},90%,${55 + rnd() * 25}%)` : `hsl(${180 + rnd() * 30},80%,65%)`; c.fillRect(wx, wy, win, win * 1.2); }
        }
        x += bwid + rnd() * 6;
      }
    };
    layer(40, '#141a38', 60, 120, 260, 3, .25);
    layer(20, '#0c1128', 80, 80, 200, 5, .3);
    layer(0, '#070a18', 110, 40, 130, 7, .35);
    c.font = `28px ${DISPLAY}`; c.fillStyle = '#ff5ec8'; c.shadowColor = '#ff5ec8'; c.shadowBlur = 16; c.fillText('hôtel', w * .2, h * .66);
    c.fillStyle = '#5ef0ff'; c.shadowColor = '#5ef0ff'; c.fillText('ramen', w * .62, h * .74); c.shadowBlur = 0;
  });
  add(new THREE.Mesh(new THREE.PlaneGeometry(WX, WYH), basic(city, 1.15)), 0, WY0 + WYH / 2, WZ);
  const frame = lam(0x2c2622);
  box(WX + 8, 5, 3, frame, 0, WY0 + WYH + 2, WZ + 1.5); box(WX + 8, 5, 3, frame, 0, WY0 - 2, WZ + 1.5);
  box(5, WYH + 8, 3, frame, -WX / 2 - 2, WY0 + WYH / 2, WZ + 1.5); box(5, WYH + 8, 3, frame, WX / 2 + 2, WY0 + WYH / 2, WZ + 1.5);
  box(3, WYH, 2, frame, 0, WY0 + WYH / 2, WZ + 1.2); box(WX, 2.5, 2, frame, 0, WY0 + WYH * .62, WZ + 1.2);
  box(WX + 16, 2, 8, lam(0x3a3230), 0, WY0 - 4, WZ + 4);
  const slat = new THREE.BoxGeometry(WX - 4, 1.6, .5), slatM = lam(0x8a8680);
  const slats = new THREE.InstancedMesh(slat, slatM, 16), dm = new THREE.Object3D();
  for (let k = 0; k < 16; k++) { dm.position.set(0, WY0 + WYH - 2 - k * 2.3, WZ + 3); dm.rotation.x = .5; dm.updateMatrix(); slats.setMatrixAt(k, dm.matrix); }
  room.add(slats);
  const curtainTex = tex(256, 512, (c, w, h) => { for (let x = 0; x < w; x++) { const k = .55 + .45 * Math.sin(x / w * Math.PI * 7); c.fillStyle = `rgb(${90 * k | 0},${28 * k | 0},${40 * k | 0})`; c.fillRect(x, 0, 1, h); } });
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.PlaneGeometry(34, WYH + 60), basic(curtainTex, .75)), s * (WX / 2 + 14), WY0 + WYH / 2 + 8, WZ + 6);
  box(WX + 110, 2, 2, lam(0x1a1714), 0, WY0 + WYH + 40, WZ + 6);

  // --- posters
  const poster = (w, h, draw, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic(tex(384, Math.round(384 * h / w), draw), .82)); m.rotation.y = ry; return add(m, x, y, z); };
  poster(58, 82, (c, w, h) => {
    c.fillStyle = '#1b2a5c'; c.fillRect(0, 0, w, h);
    const layers = ['#6da446', '#5b3b22', '#8a5a34', '#b0643a', '#6c655f', '#3b302b'];
    layers.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, h * .42 + i * h * .09, w, h * .09 + 1); });
    c.fillStyle = '#0c0906'; c.fillRect(w * .44, h * .42, w * .12, h * .5);
    const core = c.createRadialGradient(w / 2, h * .98, 4, w / 2, h * .98, 90); core.addColorStop(0, '#fff3a0'); core.addColorStop(.3, '#ff9a20'); core.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = core; c.fillRect(0, h * .6, w, h * .4);
    c.font = `76px ${DISPLAY}`; c.textAlign = 'center'; c.lineWidth = 12; c.strokeStyle = '#1a130d'; c.strokeText('a hole', w / 2, h * .2); c.fillStyle = '#ffb020'; c.fillText('a hole', w / 2, h * .2);
    c.font = `22px ${DISPLAY}`; c.fillStyle = '#f0e8d6'; c.fillText('creusez. toujours.', w / 2, h * .3);
  }, -170, DESK + 95, BACK + .5);
  poster(58, 82, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a0830'); g.addColorStop(.55, '#6a1a5a'); g.addColorStop(1, '#12051e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const sun = c.createLinearGradient(0, h * .2, 0, h * .55); sun.addColorStop(0, '#ffe060'); sun.addColorStop(1, '#ff3d8a');
    c.fillStyle = sun; c.beginPath(); c.arc(w / 2, h * .45, w * .3, Math.PI, 0); c.fill();
    c.fillStyle = '#2a0b3a'; for (let k = 0; k < 6; k++) c.fillRect(0, h * .3 + k * k * 4 + k * 8, w, 3 + k);
    c.strokeStyle = '#ff5ec8'; c.lineWidth = 2; for (let k = 0; k < 10; k++) { const y = h * .47 + Math.pow(k / 10, 2) * h * .5; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let k = -8; k <= 8; k++) { c.beginPath(); c.moveTo(w / 2 + k * 8, h * .47); c.lineTo(w / 2 + k * 70, h); c.stroke(); }
    c.font = `46px ${DISPLAY}`; c.textAlign = 'center'; c.fillStyle = '#5ef0ff'; c.shadowColor = '#5ef0ff'; c.shadowBlur = 14; c.fillText('joueur 1', w / 2, h * .16);
  }, 170, DESK + 95, BACK + .5);
  poster(90, 64, (c, w, h) => {
    c.fillStyle = '#05060c'; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 200; n++) { c.fillStyle = `rgba(255,255,255,${rnd()})`; c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    const m = c.createRadialGradient(w * .4, h * .45, 10, w * .45, h * .5, h * .38); m.addColorStop(0, '#f0a060'); m.addColorStop(.7, '#b04a24'); m.addColorStop(1, '#4a1a10');
    c.fillStyle = m; c.beginPath(); c.arc(w * .45, h * .5, h * .36, 0, 7); c.fill();
    c.font = `52px ${DISPLAY}`; c.fillStyle = '#ffb020'; c.fillText('mars', w * .7, h * .85);
  }, -SIDE + .5, DESK + 85, -20, Math.PI / 2);

  // --- a shelf on the right wall, with books
  box(18, 2, 110, lam(0x3a2718), SIDE - 9, DESK + 70, -60);
  for (let k = 0, z = -112; z < -10; k++) { const bw = 3 + rnd() * 3, bh = 16 + rnd() * 10; box(12, bh, bw, lam([0x7a2a2a, 0x2a4a7a, 0xb08030, 0x2a6a4a, 0x5a3a6a][k % 5]), SIDE - 10, DESK + 71 + bh / 2, z + bw / 2); z += bw + .4; }

  // --- the monitor, with the game's console on it
  const mon = new THREE.Group(); mon.position.set(-118, DESK, -84); mon.rotation.y = .38; room.add(mon);
  const monM = lam(0x17181d);
  box(24, 1.6, 15, monM, 0, .8, 0, mon); box(4, 22, 3, monM, 0, 11, -2, mon); box(66, 39, 3, monM, 0, 24, 0, mon);
  const term = tex(640, 360, (c, w, h) => {
    c.fillStyle = '#071014'; c.fillRect(0, 0, w, h);
    c.font = '20px monospace'; c.fillStyle = '#6cf29a';
    ['a_hole.exe  —  mode casque', '', '> casque ........ retiré', '> plateau ....... connecté', '> joueurs ....... 1', '> monde ......... en pause', '', '> en attente du joueur_'].forEach((l, i) => c.fillText(l, 22, 40 + i * 32));
    c.fillStyle = 'rgba(108,242,154,.06)'; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 2);
  });
  add(new THREE.Mesh(new THREE.PlaneGeometry(62, 35), basic(term, 1.25)), 0, 24, 1.6, mon);

  // --- the tower, glowing, and the cable into the board
  const pc = new THREE.Group(); pc.position.set(126, DESK, -92); room.add(pc);
  box(24, 50, 46, lam(0x15161c), 0, 25, 0, pc);
  box(.6, 3, 40, new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 2.2, 2.6) }), -12.1, 46, 0, pc);
  box(2, 44, .6, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .4, 2) }), 0, 25, 23.1, pc);
  for (const [y, z, col] of [[34, -10, [2.6, .5, 2.2]], [16, -10, [.4, 2, 2.6]], [25, 10, [2.4, 1.6, .3]]]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(6, .7, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col) }));
    f.rotation.y = Math.PI / 2; add(f, -12.2, y, z, pc);
  }
  const cable = new THREE.CatmullRomCurve3([[116, 8, -108], [110, DESK + 1, -104], [96, DESK + 1.1, -80], [88, DESK + 1.1, -48], [83, DESK + 3, -34], [81, y0 + 6, -30]].map(p => new THREE.Vector3(...p)));
  const cab = new THREE.Mesh(new THREE.TubeGeometry(cable, 80, 1.1, 8), lam(0x1c1c22));
  cab.castShadow = true; room.add(cab);
  box(2, 3.2, 5, lam(0x2a2a30), x1 + T + 1, y0 + 6, -30);
  box(.4, .9, .9, new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 3, 1.2) }), x1 + T + 2.1, y0 + 7.8, -28);

  // --- the lamp: an old anglepoise, red
  const red = new THREE.MeshStandardMaterial({ color: 0xc8402c, roughness: .45, metalness: .2 }), steel = lam(0xa9adb6);
  const base = new THREE.Vector3(128, DESK, 4), j1 = new THREE.Vector3(120, DESK + 70, -30), head = LAMP_HEAD;
  add(new THREE.Mesh(new THREE.CylinderGeometry(11, 12.5, 3.2, 32), red), base.x, DESK + 1.6, base.z);
  rod(base.clone().setY(DESK + 3), j1, 1.3, steel); rod(j1, head, 1.3, steel);
  rod(base.clone().add(new THREE.Vector3(2.5, 3, 0)), j1.clone().add(new THREE.Vector3(2.5, 0, 0)), .5, steel);
  for (const p of [j1, base.clone().setY(DESK + 3.5)]) add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), red), p.x, p.y, p.z);
  const aim = new THREE.Vector3().subVectors(LAMP_AIM, head).normalize(), up = new THREE.Vector3(0, 1, 0);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(13, 17, 32, 1, true), [red]);
  shade.material = new THREE.MeshStandardMaterial({ color: 0xc8402c, roughness: .45, metalness: .2, side: THREE.DoubleSide });
  shade.quaternion.setFromUnitVectors(up, aim.clone().negate()); shade.position.copy(head).addScaledVector(aim, 5); room.add(shade);
  const knob = add(new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), red), head.x, head.y, head.z); knob.position.addScaledVector(aim, -3);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(5.2, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5.4, 3.4) }));
  bulb.position.copy(head).addScaledVector(aim, 9); room.add(bulb);
  // the beam and the dust in it
  const from = head.clone().addScaledVector(aim, 11), len = from.distanceTo(LAMP_AIM) * .95;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 64, len, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(1, .78, .5) }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.6); float a = mix(0.015, 0.16, pow(vUv.y, 1.5)) * f * uK; gl_FragColor = vec4(uCol * a, 1.0); }',
  }));
  beam.quaternion.setFromUnitVectors(up, aim.clone().negate()); beam.position.copy(from).addScaledVector(aim, len / 2); room.add(beam);
  const DN = 420, dpos = new Float32Array(DN * 3), dseed = new Float32Array(DN * 3);
  const u = new THREE.Vector3().crossVectors(aim, up).normalize(), w2 = new THREE.Vector3().crossVectors(aim, u).normalize();
  for (let n = 0; n < DN; n++) { dseed[n * 3] = rnd(); dseed[n * 3 + 1] = rnd() * Math.PI * 2; dseed[n * 3 + 2] = Math.sqrt(rnd()); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dot = tex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: .7, map: dot, color: 0xffd9a0, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; room.add(dust);
  const tmp = new THREE.Vector3();
  function updateDust(t) {
    for (let n = 0; n < DN; n++) {
      const s = (dseed[n * 3] + t * .006 * (.5 + dseed[n * 3 + 2])) % 1, a = dseed[n * 3 + 1] + t * .05 * (n % 2 ? 1 : -1), r = (7 + s * 57) * dseed[n * 3 + 2] * .92;
      tmp.copy(from).addScaledVector(aim, s * len).addScaledVector(u, Math.cos(a) * r).addScaledVector(w2, Math.sin(a) * r);
      tmp.y += Math.sin(t * .4 + n) * 1.2;
      dpos[n * 3] = tmp.x; dpos[n * 3 + 1] = tmp.y; dpos[n * 3 + 2] = tmp.z;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }
  updateDust(0);

  // --- small things on the desk: a keyboard, a mug, books, a plant
  const kb = new THREE.Group(); kb.position.set(-116, DESK, 44); kb.rotation.y = .14; room.add(kb);
  box(48, 2.2, 16, lam(0x1b1c22), 0, 1.1, 0, kb);
  const keyGeo = new THREE.BoxGeometry(2.5, 1.2, 2.5), keys = new THREE.InstancedMesh(keyGeo, lam(0x3a3d48), 70);
  for (let k = 0; k < 70; k++) { dm.position.set(-20.5 + (k % 14) * 3.15, 2.6, -5.6 + Math.floor(k / 14) * 2.9); dm.rotation.set(0, 0, 0); dm.updateMatrix(); keys.setMatrixAt(k, dm.matrix); }
  kb.add(keys);
  box(48.4, .4, 16.4, new THREE.MeshBasicMaterial({ color: new THREE.Color(.2, .9, 1.4) }), 0, .2, 0, kb);
  const mug = new THREE.Group(); mug.position.set(-102, DESK, -6); room.add(mug);
  const mugM = new THREE.MeshStandardMaterial({ color: 0x2f6bff, roughness: .35 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.8, 11, 28, 1, true), mugM), 0, 5.5, 0, mug).material.side = THREE.DoubleSide;
  add(new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, .4, 28), mugM), 0, .2, 0, mug);
  add(new THREE.Mesh(new THREE.CircleGeometry(4.9, 28), lam(0x2a160a)), 0, 9, 0, mug).rotation.x = -Math.PI / 2;
  add(new THREE.Mesh(new THREE.TorusGeometry(3.2, .9, 10, 20, Math.PI * 1.2), mugM), 5.4, 5.5, 0, mug).rotation.z = -Math.PI * .6;
  add(new THREE.Mesh(new THREE.CylinderGeometry(5.25, 5.25, 1.2, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: .35 })), 0, 8, 0, mug);
  [[0x7a2a2a, 0], [0x2a4a7a, .2], [0xd9a125, -.15]].forEach(([c, r], k) => { const b = box(30, 3.6, 22, lam(c), -128, DESK + 1.8 + k * 3.6, -30); b.rotation.y = r; });
  const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, 12, 20), lam(0xb8643a)), 132, DESK + 6, 58);
  for (let k = 0; k < 9; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), lam(k % 2 ? 0x3f7a34 : 0x5c9a44)); l.scale.set(.6, 1.6, .35); l.position.set(pot.position.x + Math.cos(k * 2.4) * 4, DESK + 18 + (k % 3) * 3, pot.position.z + Math.sin(k * 2.4) * 4); l.rotation.set(Math.cos(k) * .6, k, Math.sin(k) * .6); room.add(l); }

  room.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial && !o.material.isShaderMaterial && o !== back && o !== floor) { o.castShadow = o.castShadow || false; o.receiveShadow = true; } });
  for (const o of [desk, tray, mon, pc, kb, mug]) o.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: room, updateDust, beam, bulb };
}
