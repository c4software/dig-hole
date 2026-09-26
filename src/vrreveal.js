// vrreveal.js, the headset easter egg: take it off and the game turns out to be a model on
// a desk, in a real room. Nothing of the game is moved: the camera, the lights and the fog are
// swapped only for the time of each draw (scene.onBeforeRender / onAfterRender), then put back.
// createReveal({ scene, camera, renderer, world, audio }) → { headset(), play(), update(dt), playing }
import * as THREE from 'three';
import { buildHeadset, buildRoom, BOX, LAMP_HEAD, LAMP_AIM } from './vrreveal-room.js';

const CSS = `
#vr-ov { position: fixed; inset: 0; z-index: 9000; pointer-events: none; overflow: hidden; font-family: var(--text, 'Rubik', sans-serif); }
#vr-ov > * { position: absolute; inset: 0; }
#vr-ov .vr-tilt { backdrop-filter: blur(2.6px); -webkit-backdrop-filter: blur(2.6px);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 34%, transparent 64%, #000 100%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 34%, transparent 64%, #000 100%); }
#vr-ov .vr-vig { background: radial-gradient(ellipse at 50% 55%, transparent 45%, rgba(4,3,8,.62) 100%); }
#vr-ov .vr-hs { will-change: transform, opacity; transform-origin: 50% 45%; }
#vr-ov .vr-hs canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
#vr-ov .vr-hs svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
#vr-ov .vr-flare { background: radial-gradient(ellipse at 50% 110%, rgba(255,226,170,.95) 0%, rgba(255,170,90,.55) 40%, rgba(255,140,60,0) 80%); opacity: 0; }
#vr-ov .vr-flash { background: radial-gradient(ellipse at 50% 40%, #fff8e8 0%, #ffd9a0 45%, #ff9a50 100%); opacity: 0; }
#vr-ov .vr-txt { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5em; padding-bottom: 32vh; text-align: center; }
#vr-ov .vr-q { font-family: var(--display, 'Titan One'), 'Titan One', sans-serif; font-size: clamp(38px, 6.6vw, 108px); color: #fff; letter-spacing: .015em;
  -webkit-text-stroke: .17em var(--k, #1a130d); paint-order: stroke fill; text-shadow: 0 .085em 0 #1a130d, 0 .16em .12em rgba(0,0,0,.28), 0 0 .6em rgba(255,176,32,.25); opacity: 0; }
#vr-ov .vr-q2 { font-weight: 500; font-size: clamp(15px, 1.7vw, 26px); color: #f0e8d6; text-shadow: 0 2px 0 #1a130d, 0 0 12px rgba(0,0,0,.7); opacity: 0; }
#vr-ov .vr-hint { top: auto; bottom: 7vh; left: 50%; right: auto; transform: translateX(-50%); font-size: clamp(12px, 1.1vw, 16px); color: #f0e8d6; opacity: 0;
  background: rgba(20,14,10,.55); border: 2px solid rgba(255,176,32,.5); border-radius: 999px; padding: .45em 1.1em; white-space: nowrap; }
#vr-ov .vr-hint b { font-family: var(--display, 'Titan One'), sans-serif; font-weight: 400; color: #ffb020; margin-right: .35em; }
#vr-ov .vr-boot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .55em; }
#vr-ov .vr-boot .l { font-family: var(--display, 'Titan One'), sans-serif; font-size: clamp(18px, 2.2vw, 34px); color: #ffb020; -webkit-text-stroke: .12em #1a130d; paint-order: stroke fill; min-height: 1.2em; }
#vr-ov .vr-boot .s { font-size: clamp(12px, 1.05vw, 16px); color: #9fd8ff; letter-spacing: .08em; min-height: 1.2em; opacity: .85; }
#vr-ov .vr-boot .bar { width: min(320px, 50vw); height: 8px; border-radius: 99px; background: rgba(255,255,255,.12); overflow: hidden; }
#vr-ov .vr-boot .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffb020, #fff2a0); border-radius: 99px; }
#vr-ov .vr-boot.red .l { color: #ff3d5e; text-shadow: 3px 0 0 rgba(47,107,255,.8), -3px 0 0 rgba(57,255,208,.6); }
`;
// the headset seen from inside: black, two lenses, a gap for the nose
const SVG = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs>
<mask id="vr-m"><rect x="-800" y="-600" width="3200" height="2100" fill="#fff"/><ellipse cx="440" cy="430" rx="335" ry="330" fill="#000"/><ellipse cx="1160" cy="430" rx="335" ry="330" fill="#000"/></mask>
<radialGradient id="vr-lv" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
<linearGradient id="vr-gl" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff" stop-opacity=".07"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="vr-fo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16131a"/><stop offset=".85" stop-color="#0a090c"/><stop offset="1" stop-color="#242029"/></linearGradient></defs>
<ellipse cx="440" cy="430" rx="335" ry="330" fill="url(#vr-lv)"/><ellipse cx="1160" cy="430" rx="335" ry="330" fill="url(#vr-lv)"/>
<ellipse cx="440" cy="430" rx="335" ry="330" fill="url(#vr-gl)"/><ellipse cx="1160" cy="430" rx="335" ry="330" fill="url(#vr-gl)"/>
<path d="M-800,-600 H2400 V1500 H-800 Z" fill="url(#vr-fo)" mask="url(#vr-m)"/>
<ellipse cx="440" cy="430" rx="343" ry="338" fill="none" stroke="#2c2730" stroke-width="16"/><ellipse cx="1160" cy="430" rx="343" ry="338" fill="none" stroke="#2c2730" stroke-width="16"/>
<ellipse cx="440" cy="430" rx="333" ry="328" fill="none" stroke="#6a6070" stroke-opacity=".45" stroke-width="3"/><ellipse cx="1160" cy="430" rx="333" ry="328" fill="none" stroke="#6a6070" stroke-opacity=".45" stroke-width="3"/>
<path d="M-800,1500 V900 H700 Q800,760 900,900 H2400 V1500 Z" fill="#050406"/>
<path d="M700,900 Q800,760 900,900" fill="none" stroke="#3a3440" stroke-width="10"/>
<path d="M-800,902 H700 M900,902 H2400" stroke="#ff7a2f" stroke-width="5"/></svg>`;

// the timeline, in seconds
const SWAP = 1.9, LIFT = 2.25, PULL = 3.0, Q1 = 8.4, Q2 = 10.6, HINT = 13.5, OUT = 24, BACK_T = OUT + 1.55, END = OUT + 4.7;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export function createReveal({ scene, camera, renderer, world, audio }) {
  let room = null, playing = false, t = 0, done = null, promise = null, swapped = false, ov = null, el = {};
  let mats = [], hidden = [], fired = new Set(), hudKeep = [], canvasKeep = null, localKeep = false;
  const view = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 55 };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const PLANES = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -BOX.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), BOX.x1),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -BOX.z0), new THREE.Plane(new THREE.Vector3(0, 0, -1), BOX.z1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOX.y0),
  ];
  const FOG = new THREE.Fog(0x0d0b10, 260, 1100), BG = new THREE.Color(0x07070b);
  const LAMP_COL = new THREE.Color(0xffc488), HEMI_SKY = new THREE.Color(0x6a78b0), HEMI_GROUND = new THREE.Color(0x3a2618);
  const sun = world.sun, hemi = world.hemi, lamp = world.lamp;
  const ambient = scene.children.find(o => o.isAmbientLight);
  const sky = scene.children.find(o => o.isMesh && o.material?.uniforms?.uSpace);
  const fall = scene.children.find(o => o.isPoints && o.frustumCulled === false);

  // ---------- per draw: the real room's camera and light, then everything put back ----------
  const K = { p: new THREE.Vector3(), q: new THREE.Quaternion(), e: [0, 0, 0, 'XYZ'], fov: 0, near: 0, far: 0, bg: null, fog: null, exp: 1,
    sunP: new THREE.Vector3(), sunT: new THREE.Vector3(), sunC: new THREE.Color(), sunI: 0, sh: {}, hC: new THREE.Color(), hG: new THREE.Color(), hI: 0, aI: 0, lI: 0, vis: [] };
  let applied = false, prevBefore = null, prevAfter = null;
  function before(r, s, cam, rt) {
    prevBefore?.call(scene, r, s, cam, rt);
    if (!swapped || cam !== camera) return;
    applied = true;
    K.p.copy(cam.position); K.q.copy(cam.quaternion); K.e = [cam.rotation._x, cam.rotation._y, cam.rotation._z, cam.rotation._order];
    K.fov = cam.fov; K.near = cam.near; K.far = cam.far;
    cam.position.copy(view.p); cam.quaternion.copy(view.q); cam.fov = view.fov; cam.near = .5; cam.far = 2400;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    K.bg = scene.background; K.fog = scene.fog; K.exp = r.toneMappingExposure;
    scene.background = BG; scene.fog = FOG; r.toneMappingExposure = 1.05;
    const sc = sun.shadow.camera;
    K.sunP.copy(sun.position); K.sunT.copy(sun.target.position); K.sunC.copy(sun.color); K.sunI = sun.intensity;
    K.sh = { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, n: sc.near, f: sc.far, bias: sun.shadow.bias, nb: sun.shadow.normalBias };
    sun.position.copy(LAMP_HEAD); sun.target.position.copy(LAMP_AIM); sun.color.copy(LAMP_COL); sun.intensity = 3.1 * room.k;
    Object.assign(sc, { left: -175, right: 175, top: 175, bottom: -175, near: 1, far: 420 }); sc.updateProjectionMatrix();
    sun.shadow.bias = -.0012; sun.shadow.normalBias = .15;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    K.hC.copy(hemi.color); K.hG.copy(hemi.groundColor); K.hI = hemi.intensity;
    hemi.color.copy(HEMI_SKY); hemi.groundColor.copy(HEMI_GROUND); hemi.intensity = .75;
    if (ambient) { K.aI = ambient.intensity; ambient.intensity = .12; }
    K.lI = lamp.intensity; lamp.intensity = 0;
    K.vis.length = 0;
    for (const o of [sky, fall, ...cam.children]) if (o && !o.isLight && o.visible) { o.visible = false; K.vis.push(o); }
    r.shadowMap.needsUpdate = true;
  }
  function after(r, s, cam) {
    prevAfter?.call(scene, r, s, cam);
    if (!applied || cam !== camera) return;
    applied = false;
    cam.position.copy(K.p); cam.quaternion.copy(K.q);
    const e = cam.rotation; e._x = K.e[0]; e._y = K.e[1]; e._z = K.e[2]; e._order = K.e[3];
    cam.fov = K.fov; cam.near = K.near; cam.far = K.far; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    scene.background = K.bg; scene.fog = K.fog; r.toneMappingExposure = K.exp;
    const sc = sun.shadow.camera;
    sun.position.copy(K.sunP); sun.target.position.copy(K.sunT); sun.color.copy(K.sunC); sun.intensity = K.sunI;
    Object.assign(sc, { left: K.sh.l, right: K.sh.r, top: K.sh.t, bottom: K.sh.b, near: K.sh.n, far: K.sh.f }); sc.updateProjectionMatrix();
    sun.shadow.bias = K.sh.bias; sun.shadow.normalBias = K.sh.nb;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    hemi.color.copy(K.hC); hemi.groundColor.copy(K.hG); hemi.intensity = K.hI;
    if (ambient) ambient.intensity = K.aI;
    lamp.intensity = K.lI;
    for (const o of K.vis) o.visible = true;
  }

  // the world is cut to the board: every material of the scene gets the box's planes
  function swapIn() {
    if (swapped) return;
    const set = new Set();
    const walk = (o) => { if (o === room.group || o === camera || o === sky) return; if (o.material) [].concat(o.material).forEach(m => set.add(m)); o.children.forEach(walk); };
    scene.children.forEach(walk);
    mats = [...set].map(m => [m, m.clippingPlanes, m.clipShadows]);
    for (const [m] of mats) { m.clippingPlanes = PLANES; m.clipShadows = true; }
    localKeep = renderer.localClippingEnabled; renderer.localClippingEnabled = true;
    scene.add(room.group);
    prevBefore = scene.onBeforeRender === THREE.Object3D.prototype.onBeforeRender ? null : scene.onBeforeRender;
    prevAfter = scene.onAfterRender === THREE.Object3D.prototype.onAfterRender ? null : scene.onAfterRender;
    scene.onBeforeRender = before; scene.onAfterRender = after;
    swapped = true;
  }
  function swapOut() {
    if (!swapped) return;
    swapped = false;
    for (const [m, planes, cs] of mats) { m.clippingPlanes = planes; m.clipShadows = cs; }
    mats = [];
    renderer.localClippingEnabled = localKeep;
    scene.remove(room.group);
    scene.onBeforeRender = prevBefore || THREE.Object3D.prototype.onBeforeRender;
    scene.onAfterRender = prevAfter || THREE.Object3D.prototype.onAfterRender;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- the overlay ----------
  function buildOverlay() {
    if (!document.getElementById('vr-css')) { const st = document.createElement('style'); st.id = 'vr-css'; st.textContent = CSS; document.head.appendChild(st); }
    ov = document.createElement('div'); ov.id = 'vr-ov';
    ov.innerHTML = `<div class="vr-tilt"></div><div class="vr-vig"></div>
      <div class="vr-txt"><div class="vr-q">que faites-vous ici ?</div><div class="vr-q2">le vrai monde est un peu plus grand.</div></div>
      <div class="vr-hint"><b>e</b>remettre le casque</div>
      <div class="vr-flare"></div>
      <div class="vr-hs"><canvas width="48" height="27"></canvas>${SVG}</div>
      <div class="vr-boot"><div class="l"></div><div class="s"></div><div class="bar"><i></i></div></div>
      <div class="vr-flash"></div>`;
    document.body.appendChild(ov);
    for (const k of ['tilt', 'vig', 'q', 'q2', 'hint', 'flare', 'hs', 'boot', 'flash']) el[k] = ov.querySelector('.vr-' + k);
    el.cells = ov.querySelector('canvas'); el.cg = el.cells.getContext('2d');
    el.line = el.boot.querySelector('.l'); el.sub = el.boot.querySelector('.s'); el.bar = el.boot.querySelector('.bar i');
    el.order = [...Array(48 * 27).keys()].sort(() => Math.random() - .5);
  }
  const COLS = ['#ff3d5e', '#2f6bff', '#ffb020', '#39ffd0', '#ffffff'];
  // the lenses' screen: f = share of cells gone black, with a fizz of colour at the front
  function cells(f) {
    const g = el.cg, N = el.order.length, n = Math.floor(f * N);
    g.clearRect(0, 0, 48, 27);
    g.fillStyle = '#000';
    for (let i = 0; i < n; i++) { const c = el.order[i]; g.fillRect(c % 48, (c / 48) | 0, 1, 1); }
    if (f > 0 && f < 1) for (let i = 0; i < 70; i++) {
      const c = el.order[Math.min(N - 1, n + Math.floor(Math.random() * 90))];
      g.fillStyle = COLS[(Math.random() * COLS.length) | 0]; g.globalAlpha = .35 + Math.random() * .5;
      g.fillRect(c % 48, (c / 48) | 0, 1, 1); g.globalAlpha = 1;
    }
  }
  const type = (s, a, b) => s.slice(0, Math.floor(s.length * ramp(t, a, b)));
  function cue(name, at, fn) { if (t >= at && !fired.has(name)) { fired.add(name); try { fn(); } catch (e) { /* no sound */ } } }

  // ---------- the camera: close over the garden, then back, up into the room ----------
  const P0 = new THREE.Vector3(-8, 36, 40), L0 = new THREE.Vector3(-3, 0, -17);
  const P1 = new THREE.Vector3(24, 82, 186), L1 = new THREE.Vector3(2, -6, -16);
  const tp = new THREE.Vector3(), tl = new THREE.Vector3(), m4 = new THREE.Matrix4(), eul = new THREE.Euler(0, 0, 0, 'YXZ'), qo = new THREE.Quaternion();
  function cam() {
    const k = ease(ramp(t, PULL, PULL + 10.5));
    tp.lerpVectors(P0, P1, k); tl.lerpVectors(L0, L1, k);
    // the head coming up from under the visor
    const lift = 1 - easeOut(ramp(t, SWAP, PULL + 1.2));
    tl.y -= lift * 26; tp.y -= lift * 6;
    // a slow breathing drift
    const d = ramp(t, PULL, PULL + 6);
    tp.x += Math.sin(t * .23) * 7 * d; tp.y += Math.sin(t * .31 + 1) * 2.2 * d; tl.x += Math.sin(t * .17 + 2) * 3 * d;
    // lowering the head to put it back on
    const down = ease(ramp(t, OUT + .2, OUT + 1.5));
    tl.y -= down * 16; tp.addScaledVector(new THREE.Vector3().subVectors(tl, tp).normalize(), down * 10);
    m4.lookAt(tp, tl, THREE.Object3D.DEFAULT_UP);
    view.p.copy(tp); view.q.setFromRotationMatrix(m4);
    look.x += (look.tx - look.x) * .08; look.y += (look.ty - look.y) * .08;
    eul.set(look.y, look.x, 0); view.q.multiply(qo.setFromEuler(eul));
    view.fov = 58 - 8 * k;
  }

  // ---------- input: frozen; the mouse just turns the head a little; e puts it back ----------
  const onMove = (e) => {
    if (!swapped) return;
    if (document.pointerLockElement) { look.tx -= e.movementX * .0012; look.ty -= e.movementY * .0012; }
    else { look.tx = -(e.clientX / innerWidth - .5) * .36; look.ty = -(e.clientY / innerHeight - .5) * .22; }
    look.tx = Math.max(-.18, Math.min(.18, look.tx)); look.ty = Math.max(-.11, Math.min(.11, look.ty));
  };
  const skip = () => { if (t > Q1 + 1.5 && t < OUT) t = OUT; };
  const onKey = (e) => {
    if (!playing) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!e.repeat && ['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) skip();
  };
  const onDown = (e) => { if (!playing) return; e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'mousedown') skip(); };

  function finish() {
    swapOut();
    playing = false;
    removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onDown, true); removeEventListener('pointerdown', onDown, true); removeEventListener('mousemove', onMove);
    for (const [n, v] of hudKeep) n.style.visibility = v;
    hudKeep = [];
    const cv = renderer.domElement; cv.style.filter = canvasKeep.filter; cv.style.transform = canvasKeep.transform; cv.style.transformOrigin = canvasKeep.origin;
    ov.remove(); ov = null;
    const f = done; done = null; promise = null;
    f?.();
  }

  function update(dt) {
    if (!playing) return;
    t += Math.min(dt, .1);
    const cv = renderer.domElement;
    // 1. off: the headset closes in, the game fizzles out
    const inK = easeOut(ramp(t, 0, .7)), outK = ease(ramp(t, END - 1.1, END - .2));
    const liftK = ease(ramp(t, LIFT, LIFT + 1.1)), downK = ease(ramp(t, OUT + .5, OUT + 1.45));
    const y = t < OUT ? -112 * liftK : -112 * (1 - downK);
    const sc = t < 1 ? 1.5 - .5 * inK : 1 + .5 * outK;
    el.hs.style.transform = `translateY(${y}%) scale(${sc}) rotate(${(t < OUT ? liftK : 1 - downK) * -3}deg)`;
    el.hs.style.opacity = t < 1 ? inK : 1 - outK;
    let f = 0;
    if (t < BACK_T) f = ease(ramp(t, .55, SWAP - .15));
    else f = 1 - ease(ramp(t, END - 1.25, END - .6));
    if (t > OUT) f = t < BACK_T ? 1 : f;
    cells(f);
    el.boot.style.opacity = (t > .5 && t < SWAP + .2) || (t > BACK_T && t < END - .9) ? 1 : 0;
    if (t < SWAP + .2) {
      el.boot.classList.add('red');
      el.line.textContent = type('déconnexion…', .5, 1.1); el.sub.textContent = type('signal perdu', 1.1, 1.6); el.bar.style.width = (100 - 100 * ramp(t, .5, SWAP)) + '%';
    } else if (t > BACK_T) {
      el.boot.classList.remove('red');
      el.line.textContent = type('reconnexion…', BACK_T + .1, BACK_T + .7);
      const lines = ['casque détecté', 'plateau : a hole', 'bon retour, creuseur.'], k = ramp(t, BACK_T + .7, END - 1.3) * 3;
      el.sub.textContent = lines[Math.min(2, Math.floor(k))].slice(0, Math.floor((k % 1 + (k >= 3 ? 1 : 0)) * 30));
      el.bar.style.width = (100 * ease(ramp(t, BACK_T + .3, END - 1.2))) + '%';
    }
    // the glitch on the game's own image
    if (t > .35 && t < SWAP) {
      const j = Math.random() < .5 ? (Math.random() - .5) * 26 * ramp(t, .35, 1.2) : 0;
      cv.style.filter = `hue-rotate(${(Math.random() * 90 - 45) * ramp(t, .35, 1)}deg) saturate(${1 + ramp(t, .35, 1.4)}) contrast(1.2)`;
      cv.style.transform = `translate(${j}px, ${Math.random() < .2 ? (Math.random() - .5) * 8 : 0}px)`;
    } else if (t >= SWAP && t < 6.5) {
      const b = 1 - easeOut(ramp(t, LIFT, 6.2));
      cv.style.filter = `blur(${(b * 9).toFixed(2)}px) brightness(${(1 + b * .7).toFixed(3)})`; cv.style.transform = canvasKeep.transform;
    } else { cv.style.filter = canvasKeep.filter; cv.style.transform = canvasKeep.transform; }
    // 2. the room
    if (t >= SWAP && t < BACK_T) { if (!swapped) swapIn(); }
    else if (swapped) swapOut();
    if (swapped) {
      cam();
      room.updateDust(t);
      room.k = 1 + Math.sin(t * 7.3) * .004 + Math.sin(t * 2.1) * .006;
    }
    el.flare.style.opacity = ramp(t, LIFT, LIFT + .5) * (1 - easeOut(ramp(t, LIFT + .6, 5.2))) * .8;
    el.flash.style.opacity = t > END - 1.25 ? 1 - ramp(t, END - 1.1, END - .2) : 0;
    const room1 = ramp(t, 4.5, 7) * (1 - ramp(t, OUT - .2, OUT + .6));
    el.tilt.style.opacity = room1; el.vig.style.opacity = room1;
    // 3. the question
    const q = ramp(t, Q1, Q1 + 1.4) * (1 - ramp(t, OUT - .6, OUT + .2));
    el.q.style.opacity = q; el.q.style.transform = `scale(${.94 + .06 * easeOut(ramp(t, Q1, Q1 + 1.6))})`;
    el.q2.style.opacity = ramp(t, Q2, Q2 + 1.2) * (1 - ramp(t, OUT - .6, OUT + .2));
    el.hint.style.opacity = ramp(t, HINT, HINT + .8) * (1 - ramp(t, OUT - .8, OUT));
    // sounds
    if (audio) {
      cue('off', .1, () => audio.zap?.());
      cue('fizz', .6, () => audio.hiss?.());
      cue('cut', SWAP - .3, () => audio.deny?.());
      cue('lift', LIFT, () => audio.whistle?.());
      cue('q', Q1, () => audio.hover?.());
      cue('on', OUT + .5, () => audio.pop?.());
      cue('boot', BACK_T + .1, () => audio.charge?.());
      for (let i = 0; i < 3; i++) cue('tick' + i, BACK_T + .9 + i * .55, () => audio.tick?.());
      cue('flash', END - 1.2, () => audio.win?.());
    }
    if (t >= END) finish();
  }

  return {
    headset() { return buildHeadset(); },
    play() {
      if (promise) return promise;
      if (!room) { room = buildRoom(); room.k = 1; }
      t = 0; fired = new Set(); look.x = look.y = look.tx = look.ty = 0;
      buildOverlay();
      const cv = renderer.domElement;
      canvasKeep = { filter: cv.style.filter, transform: cv.style.transform, origin: cv.style.transformOrigin };
      for (const id of ['hud', 'minimap', 'relock', 'bigmap']) { const n = document.getElementById(id); if (n) { hudKeep.push([n, n.style.visibility]); n.style.visibility = 'hidden'; } }
      addEventListener('keydown', onKey, true); addEventListener('mousedown', onDown, true); addEventListener('pointerdown', onDown, true); addEventListener('mousemove', onMove);
      playing = true;
      promise = new Promise(res => { done = res; });
      update(0);
      return promise;
    },
    update,
    get playing() { return playing; },
    // for tests: jump in the timeline
    seek(s) { t = s; },
    get time() { return t; },
  };
}
