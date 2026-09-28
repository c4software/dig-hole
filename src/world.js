// world.js, renderer, sky, the garden, the house, the fence and the two things you
// talk to: the sell crate and the hardware stall.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NX, NZ, S } from './terrain.js';
import { createHouse } from './house.js';
import { createChina } from './china.js';
import { mergeStatic } from './merge.js';
import { createNeighbours, SPOTS as NEIGHBOURS } from './neighbours.js';
import { createBlossoms, createLamps } from './street.js';
import { createEurope } from './europe.js';
import { DIG } from './crypt.js';

const HALF = NX * S / 2;   // 8 m, half the plot

function label(text, { w = 512, h = 256, size = 120, color = '#f0e8d6', bg = null, italic = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color;
  g.font = `${italic ? 'italic ' : ''}${size}px Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // neutral: keeps the hues of a painted scene, no ACES crush in the darks
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  // soft sun shadows over the garden, following the player
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // shadows are redrawn only when the view moves (see main's loop), not every frame
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 600);
  scene.add(camera);

  const DAY_FOG = new THREE.Color(0xc4dcf2);
  const DEEP_FOG = new THREE.Color(0x0c0906);
  scene.fog = new THREE.Fog(DAY_FOG.clone(), 45, 300);
  scene.background = DAY_FOG.clone();

  // ---------- sky: a painted anime sky, all in one shader ----------
  // a deep cobalt zenith fading to a pale, hazy horizon; a bank of tall cumulus all
  // round the horizon, a scattered layer overhead, and thin cirrus streaks. Clouds have
  // bright white tops and lavender undersides, and drift slowly.
  const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
  const skyTime = { value: 0 };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: { uSun: { value: SUN_DIR }, uDark: { value: 0 }, uNight: { value: 0 }, uDusk: { value: 0 }, uSpace: { value: 0 }, uMars: { value: 0 }, uTime: skyTime },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 uSun; uniform float uDark, uNight, uDusk, uSpace, uMars, uTime;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          // the gradient: pale haze at the horizon, cobalt overhead
          vec3 horizon = vec3(0.60, 0.78, 0.93), mid = vec3(0.20, 0.45, 0.88), top = vec3(0.045, 0.20, 0.66);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.95, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(0.9, 0.85, 0.7) * pow(s, 6.0) * 0.18;
          // the Earth's clouds: skipped altogether on the moon and on mars
          float cov = 0.0, bank = 0.0;
          float az = atan(d.z, d.x);
          if (uSpace + uMars < 0.5) {
          vec3 lit = vec3(1.0, 0.985, 0.96), shade = vec3(0.60, 0.62, 0.86), deep = vec3(0.47, 0.50, 0.78);
          // dusk warms the lit side of every cloud
          lit = mix(lit, vec3(1.0, 0.72, 0.52), uDusk * 0.8); shade = mix(shade, vec3(0.62, 0.48, 0.62), uDusk * 0.7);
          // 1. the cumulus bank round the horizon: a billowing silhouette, lit from the top
          float prof = 0.035 + 0.16 * pow(fbm(vec2(az * 1.6 + 3.0, 2.0)), 1.6) + 0.05 * fbm(vec2(az * 5.0, 7.0));
          float edge = prof + (fbm(vec2(az * 14.0, h * 22.0 - uTime * 0.02)) - 0.5) * 0.045;
          bank = smoothstep(0.004, 0.0, h - edge) * smoothstep(-0.03, 0.0, h);
          float up = clamp(h / max(prof, 0.01), 0.0, 1.0);
          float bumps = fbm(vec2(az * 9.0, h * 30.0));
          vec3 bankC = mix(deep, shade, smoothstep(0.1, 0.55, up)) ;
          bankC = mix(bankC, lit, smoothstep(0.45, 0.95, up + (bumps - 0.5) * 0.5));
          bankC = mix(bankC, horizon * 1.05, smoothstep(0.03, -0.01, h) * 0.6);
          // 2. scattered cumulus overhead, on a flat layer
          vec2 uv = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.004, uTime * 0.0015);
          float den = fbm(uv * 1.3);
          cov = smoothstep(0.54, 0.6, den) * smoothstep(0.03, 0.22, d.y);
          vec2 toSun = normalize(uSun.xz + 1e-4) * 0.08;
          float lightS = clamp((den - fbm((uv + toSun) * 1.3)) * 7.0 + 0.55, 0.0, 1.0);
          vec3 layerC = mix(shade, lit, lightS);
          layerC = mix(layerC, deep, smoothstep(0.62, 0.8, den) * 0.35);
          // 3. cirrus: long thin brush strokes, high up
          vec2 cu = d.xz / (d.y + 0.25);
          float ci = fbm(vec2(cu.x * 0.7 + cu.y * 0.3, (cu.y - cu.x * 0.2) * 7.0) + uTime * 0.003);
          float cirrus = smoothstep(0.55, 0.75, ci) * smoothstep(0.08, 0.35, d.y) * 0.45;
          c = mix(c, lit, cirrus);
          c = mix(c, layerC, cov);
          c = mix(c, bankC, bank);
          }
          // dusk: a warm band low on the horizon
          c = mix(c, vec3(0.98, 0.58, 0.32), uDusk * (1.0 - smoothstep(0.0, 0.35, h)) * 0.55);
          // the sun itself
          c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.25) * (1.0 - uNight) * (1.0 - max(cov, bank) * 0.8);
          // night: deep blue, clouds dim to silhouettes, and stars between them
          vec3 night = mix(vec3(0.05, 0.07, 0.15), vec3(0.01, 0.015, 0.05), smoothstep(0.0, 0.7, h));
          night = mix(night, vec3(0.07, 0.08, 0.14), max(cov, bank) * 0.8);
          vec3 cell = floor(d * 260.0);
          float star = step(0.9975, hash(cell)) * smoothstep(0.02, 0.2, h) * (1.0 - max(cov, bank));
          night += vec3(0.9, 0.9, 1.0) * star * (0.6 + 0.4 * hash(cell + 1.0));
          c = mix(c, night, uNight);
          // space: pure black, many more stars, all the way round
          vec3 cell2 = floor(d * 340.0);
          vec3 spaceC = vec3(0.9, 0.9, 1.0) * step(0.996, hash(cell2)) * (0.5 + 0.5 * hash(cell2 + 2.0));
          c = mix(c, spaceC, uSpace);
          // mars: a butterscotch sky, darker overhead, a cold blue halo round a small sun,
          // and a band of dust low on the horizon
          vec3 marsC = mix(vec3(0.88, 0.64, 0.46), vec3(0.50, 0.30, 0.24), smoothstep(0.0, 0.85, h));
          marsC = mix(marsC, vec3(0.93, 0.72, 0.52), (1.0 - smoothstep(0.0, 0.12, h)) * 0.7);
          marsC = mix(marsC, vec3(0.62, 0.72, 0.86), pow(s, 10.0) * 0.55);
          marsC += vec3(1.0, 0.96, 0.9) * (pow(s, 1400.0) * 2.5 + pow(s, 60.0) * 0.2);
          float dust = fbm(vec2(az * 3.0 + uTime * 0.01, h * 14.0)) * (1.0 - smoothstep(0.0, 0.25, h));
          marsC = mix(marsC, vec3(0.78, 0.52, 0.36), dust * 0.5);
          c = mix(c, marsC, uMars);
          c = mix(c, vec3(0.05, 0.035, 0.025), uDark);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);
  // the clouds live in the sky shader now; the group stays for whoever hides it
  const clouds = new THREE.Group();
  scene.add(clouds);

  // ---------- light ----------
  const sun = new THREE.DirectionalLight(0xfff0da, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // the fill: sky blue from above, lavender from below, so every shadow turns blue-violet
  const hemi = new THREE.HemisphereLight(0xc2d8ff, 0xa294cc, 1.25);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x3a2c20, 0.0);
  scene.add(ambient);
  // the headlamp rides on the camera
  const lamp = new THREE.PointLight(0xffe2b0, 0, 8, 1.4);
  lamp.position.set(-0.1, 0.4, 0.6);
  camera.add(lamp);

  // ---------- the garden: a big lawn with a square hole where the plot is ----------
  const lawnShape = new THREE.Shape();
  lawnShape.moveTo(-400, -400); lawnShape.lineTo(400, -400); lawnShape.lineTo(400, 400); lawnShape.lineTo(-400, 400);
  const hole = new THREE.Path();
  hole.moveTo(-HALF, -HALF); hole.lineTo(-HALF, HALF); hole.lineTo(HALF, HALF); hole.lineTo(HALF, -HALF);
  lawnShape.holes.push(hole);
  // and one under the church, over its diggable ground (shape y is world -z)
  const hc = new THREE.Path();
  hc.moveTo(DIG.x0, -DIG.z1); hc.lineTo(DIG.x0, -DIG.z0); hc.lineTo(DIG.x1, -DIG.z0); hc.lineTo(DIG.x1, -DIG.z1);
  lawnShape.holes.push(hc);
  const lawnGeo = new THREE.ShapeGeometry(lawnShape);
  lawnGeo.rotateX(-Math.PI / 2);
  // flip Y of shape coords: after rotateX(-90), shape y becomes -z; the hole is symmetric so it doesn't matter
  const lawnTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#80b450'; g.fillRect(0, 0, 512, 512);
    // soft patches, then blades, then flowers
    for (let n = 0; n < 60; n++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 30 + Math.random() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const tone = Math.random() < .5 ? '96,150,66' : '160,200,96';
      gr.addColorStop(0, `rgba(${tone},.35)`); gr.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = gr;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }
    for (let n = 0; n < 9000; n++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.fillStyle = `hsl(${88 + Math.random() * 20}, ${32 + Math.random() * 22}%, ${36 + Math.random() * 24}%)`;
      g.fillRect(x, y, 1.5, 3 + Math.random() * 4);
    }
    for (let n = 0; n < 140; n++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.fillStyle = Math.random() < .7 ? '#ffe45a' : '#ffffff';
      g.beginPath(); g.arc(x, y, 1.6 + Math.random() * 1.4, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  })();
  // shape UVs are in metres: one tile every 4 m
  lawnTex.repeat.set(.25, .25);
  const lawn = new THREE.Mesh(lawnGeo, new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
  lawn.receiveShadow = true;
  scene.add(lawn);

  // grass tufts, instanced, sway in the vertex shader
  // a tuft: a few thin curved blades, dark at the root and light at the tip
  const bladeGeo = (() => {
    const pos = [], col = [], idx = [];
    const root = new THREE.Color(0x4f8236), tip = new THREE.Color(0xb2d67a), tmp = new THREE.Color();
    const SEG = 2;
    for (let b = 0; b < 5; b++) {
      const a = b / 5 * Math.PI * 2 + Math.random() * .8, lean = .04 + Math.random() * .1;
      const h = .1 + Math.random() * .16, w = .014 + Math.random() * .01;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      const o = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG, y = t * h, off = lean * t * t, ww = w * (1 - t * .9);
        const cx = dx * (off + .02), cz = dz * (off + .02);
        pos.push(cx - px * ww, y, cz - pz * ww, cx + px * ww, y, cz + pz * ww);
        tmp.copy(root).lerp(tip, Math.pow(t, .8));
        col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
        if (k < SEG) { const q = o + k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  const grassTime = { value: 0 };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      float sway = sin(uTime * 1.6 + ip.x * 0.4 + ip.z * 0.3) * 0.08 * position.y * 2.5;
      transformed.x += sway; transformed.z += sway * 0.6;`);
  };
  const GRASS_N = 12000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_N);
  const dm = new THREE.Object3D();
  const gcol = new THREE.Color();
  let gi = 0;
  while (gi < GRASS_N) {
    const x = (Math.random() - .5) * 90, z = (Math.random() - .5) * 90;
    if (Math.abs(x) < HALF + 0.3 && Math.abs(z) < HALF + 0.3) continue;   // not in the plot
    if (Math.abs(x) < 8 && z < -13 && z > -24) continue;                  // not in the house
    if (Math.abs(x) < 1.4 && z < -8 && z > -14) continue;                 // the path
    if (z < -10.7) continue;                                               // the street and the village across it
    if (Math.abs(x) > 41 && z < 42) continue;                              // the square, the town hall, the terraces
    if (NEIGHBOURS.some(([hx, hz]) => Math.abs(x - hx) < 7 && Math.abs(z - hz) < 7)) continue;   // the neighbours' floors
    dm.position.set(x, 0, z);
    dm.rotation.set((Math.random() - .5) * .4, Math.random() * 6, (Math.random() - .5) * .4);
    const s = 0.6 + Math.random() * 0.9;
    dm.scale.set(s, s * (0.7 + Math.random() * 0.8), s);
    dm.updateMatrix();
    grass.setMatrixAt(gi, dm.matrix);
    grass.setColorAt(gi, gcol.setHSL(0.24 + Math.random() * 0.04, 0.35, 0.62 + Math.random() * 0.16));
    gi++;
  }
  grass.userData.noAO = true;
  scene.add(grass);

  // ---------- colliders (axis-aligned boxes) ----------
  const colliders = [];
  // returns the box, so a door can switch its own off while it stands open
  const addBox = (x0, y0, z0, x1, y1, z1) => { const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }; colliders.push(c); return c; };

  const std = (color) => new THREE.MeshLambertMaterial({ color });
  const interactables = [];

  // brick paving in front of the gate, where the crate and the stall stand
  const brickTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#8a5a44'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2 ? 32 : 0), y = row * 32;
      g.fillStyle = `hsl(${12 + Math.random() * 10}, ${45 + Math.random() * 15}%, ${42 + Math.random() * 12}%)`;
      g.fillRect(x + 2, y + 2, 60, 28);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 2, y + 2, 60, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.repeat.set(6, 1.6);
    return t;
  })();
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshStandardMaterial({ map: brickTex, roughness: .85 }));
  patio.rotation.x = -Math.PI / 2; patio.position.set(0, .012, -10.55);
  patio.receiveShadow = true;
  scene.add(patio);

  // the path from the door to the gate
  for (let n = 0; n < 6; n++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.42, .45, .04, 8), std(0xa8a298));
    p.position.set((n % 2 ? .25 : -.25), .02, -14.2 + n * .95);
    scene.add(p);
  }

  // ---------- fence around the plot, a gate facing the house ----------
  const F = HALF + 1.0;
  const postGeo = new THREE.BoxGeometry(.13, 1.15, .13);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: .9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: .9 });
  const railGeo = new THREE.BoxGeometry(1, .1, .05);
  const fence = new THREE.Group();
  const GATE = 1.5;
  const sideRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x0 + (x1 - x0) * t, .55, z0 + (z1 - z0) * t);
      fence.add(post);
    }
    for (const y of [.4, .85]) {
      const r = new THREE.Mesh(railGeo, railMat);
      r.scale.x = len;
      r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      fence.add(r);
    }
    const t = 0.06;
    addBox(Math.min(x0, x1) - t, 0, Math.min(z0, z1) - t, Math.max(x0, x1) + t, 1.1, Math.max(z0, z1) + t);
  };
  sideRun(-F, F, F, F);
  sideRun(-F, -F, -F, F);
  sideRun(F, -F, F, F);
  sideRun(-F, -F, -GATE, -F);
  sideRun(GATE, -F, F, -F);
  scene.add(fence);
  mergeStatic(fence);

  // ---------- trees: cherry trees in the garden, and an avenue of them along the lane ----------
  const blossoms = createBlossoms({ parent: scene, addBox, seed: 21 });
  for (const [x, z] of [[-16, -6], [23, -6], [22, 11], [-19, 10], [-8, 19], [10, 20], [-30, 2], [-14, 24], [26, 28], [-34, 26], [34, -3], [-2, 30], [32, 20]]) blossoms.tree(x, z, 1.05);
  const HOUSES_X = [-97, -70, -44, 42, 67, 94];
  // along the garden's side of the street; beyond it the village begins
  for (const x of [-38, -26, -14, 14, 26, 38]) blossoms.tree(x + (blossoms.rnd() - .5) * 2, -9.4, .92);
  void HOUSES_X;
  const lamps = createLamps({ parent: scene, addBox, points: [-100, -80, -60, -40, -20, -8, 8, 20, 40, 60, 80, 100].map(x => [x, -14.75]) });
  blossoms.finish({ scatter: Array.from({ length: 30 }, () => [-100 + Math.random() * 200, -13.1 + (Math.random() - .5) * 2, .8 + Math.random() * 1.2]) });
  // the village around the garden
  const europe = createEurope({ scene, addBox });
  interactables.push(...europe.boutiques);

  // ---------- the two stations ----------

  // sell crate, to the left of the gate
  const crate = new THREE.Group();
  const wood = std(0xa87a48), woodDark = std(0x7a5530);
  const crateBody = new THREE.Mesh(new THREE.BoxGeometry(1.3, .8, .9), wood);
  crateBody.position.y = .4;
  crate.add(crateBody);
  for (const y of [.12, .68]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.34, .1, .94), woodDark);
    slat.position.y = y;
    crate.add(slat);
  }
  const sellSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .5), new THREE.MeshBasicMaterial({ map: label('vendre', { bg: '#1a130c', color: '#ffd75e' }), fog: true }));
  sellSign.position.set(0, 1.35, 0.05);
  const sellPost = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.1, .08), woodDark);
  sellPost.position.set(0, .9, 0);
  crate.add(sellPost, sellSign);
  crate.position.set(-3.2, 0, -11.2);
  crate.rotation.y = 0.15;
  scene.add(crate);
  addBox(-3.9, 0, -11.7, -2.5, .85, -10.7);
  interactables.push({ id: 'sell', object: crate, pos: new THREE.Vector3(-3.2, .6, -11.2) });

  // hardware stall: a little counter with an awning, to the right
  const stall = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 1, .8), std(0x8a6a4a));
  counter.position.y = .5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, .08, .9), woodDark);
  top.position.y = 1.02;
  stall.add(counter, top);
  for (const x of [-.95, .95]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.3, .08), woodDark);
    p.position.set(x, 1.15, -.35);
    stall.add(p);
  }
  // striped awning
  const stripes = document.createElement('canvas'); stripes.width = 256; stripes.height = 16;
  const sg = stripes.getContext('2d');
  for (let n = 0; n < 8; n++) { sg.fillStyle = n % 2 ? '#f0e8d6' : '#d9a125'; sg.fillRect(n * 32, 0, 32, 16); }
  const stripeTex = new THREE.CanvasTexture(stripes); stripeTex.colorSpace = THREE.SRGBColorSpace;
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.1), new THREE.MeshLambertMaterial({ map: stripeTex, side: THREE.DoubleSide }));
  awning.position.set(0, 2.2, .05);
  awning.rotation.x = -Math.PI / 2 + 0.45;
  stall.add(awning);
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .45), new THREE.MeshBasicMaterial({ map: label('outils', { bg: '#1a130c', color: '#ffd75e' }) }));
  shopSign.position.set(0, .6, .41);
  stall.add(shopSign);
  // a shovel for sale, leaning on the counter
  const forSale = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.2, 6), std(0x6b4a2e));
  const b = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .03), std(0xc8c8cc));
  b.position.y = -.7;
  forSale.add(h, b);
  forSale.position.set(.7, 1.0, .5);
  forSale.rotation.z = .25;
  stall.add(forSale);
  stall.position.set(3.4, 0, -11.4);
  stall.rotation.y = -0.15;
  scene.add(stall);
  addBox(2.35, 0, -11.9, 4.45, 1.1, -10.9);
  interactables.push({ id: 'shop', object: stall, pos: new THREE.Vector3(3.4, .8, -11.4) });

  // a soft rim so the plot edge doesn't read as a razor cut
  const rimMat = std(0x4f3a22);
  for (const [x, z, w, d] of [[0, HALF + .08, 2 * HALF + .32, .16], [0, -HALF - .08, 2 * HALF + .32, .16], [HALF + .08, 0, .16, 2 * HALF], [-HALF - .08, 0, .16, 2 * HALF]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, .04, d), rimMat);
    r.position.set(x, .02, z);
    scene.add(r);
  }

  // the rest of the street, seen from the garden
  const neighbours = createNeighbours({ colliders, interactables });
  scene.add(neighbours.group);

  // everything built so far outside the sky and the lights is the home garden: group it,
  // merge what never moves, so it can be drawn cheaply and hidden while in China
  const homeDecor = new THREE.Group();
  const keepAtRoot = new Set([sky, clouds, sun, sun.target, hemi, ambient, camera]);
  for (const o of [...scene.children]) if (!keepAtRoot.has(o)) homeDecor.add(o);
  scene.add(homeDecor);
  mergeStatic(homeDecor, (o) => o === grass || o === lawn || o === patio || o.userData.keep);

  const house = createHouse({ scene, colliders, interactables, label });
  const china = createChina({ scene, colliders, interactables, label });
  china.playerPos = () => camera.position;

  let quality = 'moyenne';
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .3, .5, .93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // the grade, in display space: a touch more colour, blue-violet lifted into the
  // shadows, warm highlights, a soft haze of light, and a faint vignette
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 g = mix(vec3(l), c, 1.08);
        float sh = 1.0 - smoothstep(0.04, 0.55, l);
        g += vec3(0.30, 0.26, 0.52) * sh * 0.16;
        g *= mix(vec3(1.0), vec3(1.035, 1.01, 0.975), smoothstep(0.55, 1.0, l));
        g = mix(g, vec3(1.0), smoothstep(0.75, 1.0, l) * 0.06);
        vec2 q = vUv - 0.5;
        g *= 1.0 - dot(q, q) * 0.28;
        gl_FragColor = vec4(mix(c, g, uAmount), 1.0);
      }`,
  });
  composer.addPass(grade);
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  // everything solid casts and takes shadows (not the sky, the labels or the glass)
  function shadows(root) {
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh && o === grass) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial) || m.transparent || o === lawn) return;
      o.castShadow = true; o.receiveShadow = true;
    });
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  // ---------- time of day and seasons ----------
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xf0e8d6, fog: false, transparent: true }));
  scene.add(moon);
  const NIGHT_FOG = new THREE.Color(0x0b1224);
  const SEASON_FOG = [0xc8def4, 0xc4dcf2, 0xdcd4c8, 0xdfe6ee].map(c => new THREE.Color(c));
  const GRASS_TINT = [0xffffff, 0xfff2c0, 0xf2c890, 0xf4f8ff];
  const LEAVES = [[0x6aa83c, 0x7ab84a, 0xf2a7c3], [0x3f6d24, 0x4f7d2c, 0x456f27], [0xd9822b, 0xc4502a, 0xe0b030], [0xe8eef2, 0xdfe6ee, 0xcfd8e0]];
  const env = { day: 1, night: 0, fog: DAY_FOG.clone() };
  const hemiDay = new THREE.Color(0xc2d8ff), hemiNight = new THREE.Color(0x2a3a6a);
  const sunDay = new THREE.Color(0xfff0da), sunDusk = new THREE.Color(0xff9a50);
  let season = -1;

  // falling things around the eye: petals, nothing, leaves, snow (and fireflies on summer nights)
  const FALL_N = 900;
  const fallGeo = new THREE.BufferGeometry();
  const fallPos = new Float32Array(FALL_N * 3);
  for (let n = 0; n < FALL_N; n++) { fallPos[n * 3] = (Math.random() - .5) * 40; fallPos[n * 3 + 1] = Math.random() * 20; fallPos[n * 3 + 2] = (Math.random() - .5) * 40; }
  fallGeo.setAttribute('position', new THREE.BufferAttribute(fallPos, 3));
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const fallMat = new THREE.PointsMaterial({ size: .1, map: dotTex, color: 0xffffff, transparent: true, opacity: .9, depthWrite: false });
  const fall = new THREE.Points(fallGeo, fallMat);
  fall.frustumCulled = false;
  scene.add(fall);
  const FALL = [{ color: 0xf7c6d9, size: .07, speed: .6 }, { color: 0xfff27a, size: .08, speed: 0 }, { color: 0xd9822b, size: .1, speed: 1.1 }, { color: 0xffffff, size: .08, speed: 1.4 }];

  function setSeason(n) {
    if (n === season) return;
    season = n;
    grassMat.color.setHex(GRASS_TINT[n]);
    lawn.material.map = n === 3 ? null : lawnTex;
    lawn.material.color.setHex(n === 3 ? 0xeef2f6 : [0xffffff, 0xf4e8a0, 0xe0b878][n]);
    lawn.material.needsUpdate = true;
    blossoms.setSeason(n);
    europe.setSeason(n);
    fallMat.color.setHex(FALL[n].color);
    fallMat.size = FALL[n].size;
  }

  // hour 0..24: the sun goes round, the sky follows
  function setTime(hour) {
    const a = (hour - 6) / 24 * Math.PI * 2;          // 0 at 6h, π/2 at noon
    const elev = Math.sin(a);
    SUN_DIR.set(Math.cos(a) * .8, elev, .45).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.18);
    env.day = day; env.night = 1 - day;
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.25) * (elev > -0.15 ? 1 : 0);
    sky.material.uniforms.uNight.value = env.night;
    sky.material.uniforms.uDusk.value = dusk;
    sun.intensity = 2.4 * day;
    sun.color.copy(sunDay).lerp(sunDusk, dusk * .7);
    hemi.color.copy(hemiDay).lerp(hemiNight, env.night);
    env.fog.copy(SEASON_FOG[Math.max(0, season)]).lerp(NIGHT_FOG, env.night * .96);
    if (dusk > 0) env.fog.lerp(new THREE.Color(0xe8a070), dusk * .25);
    moon.material.opacity = env.night;
    neighbours.setNight(env.night);
    lamps.setNight(env.night);
    europe.setNight(env.night);
    blossoms.setNight(env.night);
    china.setNight(env.night);
    moon.visible = env.night > 0.02;
    fallMat.opacity = season === 1 ? env.night * .9 : .9;   // summer: only fireflies, only at night
  }

  let fallT = 0;
  // under a roof (the secret cave): no petals, no snow
  let indoor = false;
  function updateFall(dt, eye) {
    fallT += dt;
    skyTime.value += dt;
    if (homeDecor.visible) europe.update(dt);     // the village only moves while you're there
    fall.visible = !space && !indoor && eye.y > -3 && (season !== 1 || env.night > .1);
    if (!fall.visible) return;
    fall.position.set(eye.x, eye.y - 4, eye.z);
    const sp = FALL[season].speed;
    for (let n = 0; n < FALL_N; n++) {
      let y = fallPos[n * 3 + 1] - sp * dt * (0.7 + (n % 5) * .1);
      if (sp === 0) y += Math.sin(fallT * 2 + n) * dt * .4;   // fireflies drift
      if (y < 0) y += 20;
      fallPos[n * 3 + 1] = y;
      fallPos[n * 3] += Math.sin(fallT + n) * dt * (season === 3 ? .2 : .6);
    }
    fallGeo.attributes.position.needsUpdate = true;
  }

  // ---------- space: the moon's sky, black, starry, with the Earth hanging in it ----------
  const earth = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2d6aa8'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#4f8a3a';
    for (const [x, y, w, h] of [[20, 30, 50, 40], [60, 70, 25, 45], [120, 25, 40, 35], [125, 60, 30, 45], [165, 25, 70, 45], [205, 85, 30, 20]]) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (let n = 0; n < 40; n++) { g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 128, 6 + Math.random() * 16, 2 + Math.random() * 4, 0, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(55, 40, 24), new THREE.MeshBasicMaterial({ map: t, fog: false }));
    m.visible = false;
    scene.add(m);
    return m;
  })();
  // phobos, a lumpy potato over mars
  const phobos = (() => {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, v = new THREE.Vector3();
    for (let n = 0; n < p.count; n++) { v.fromBufferAttribute(p, n); const k = 1 + Math.sin(v.x * 5) * Math.sin(v.y * 4 + 1) * .12 + Math.sin(v.z * 7) * .06; p.setXYZ(n, v.x * k * 1.3, v.y * k, v.z * k * .9); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a7a6a, fog: false }));
    m.scale.setScalar(16); m.visible = false;
    scene.add(m);
    return m;
  })();
  // mode: false (the Earth), 'moon' (black space) or 'mars' (a thin dusty sky)
  let space = false, mars = false;
  function setSpace(mode) {
    space = !!mode; mars = mode === 'mars';
    sky.material.uniforms.uSpace.value = mode === 'moon' ? 1 : 0;
    sky.material.uniforms.uMars.value = mars ? 1 : 0;
    earth.visible = mode === 'moon';
    phobos.visible = mars;
    clouds.visible = !mode;
    moon.visible = !mode && moon.visible;
  }

  // ---------- depth mood: the deeper the eye, the closer and darker the world ----------
  const OUT = { near: 45, far: 300, exposure: 1.0, hemi: 1.25, sun: 2.4 };
  function setDepth(eyeY, lampRange, lampPower) {
    const t = THREE.MathUtils.clamp(-eyeY / 5, 0, 1);            // 0 at the lip, 1 a few metres in
    const deep = THREE.MathUtils.clamp(-eyeY / 100, 0, 1);       // 0..1 over the whole hole
    const night = env.night;
    // at night the lamp's reach is all there is, even on the lawn
    // at night the street is still there: the lit windows and lamps read far off
    const outFar = THREE.MathUtils.lerp(OUT.far, Math.max(lampRange * 2.2, 90), night);
    scene.fog.near = THREE.MathUtils.lerp(THREE.MathUtils.lerp(OUT.near, 8, night), 0.5, t);
    scene.fog.far = THREE.MathUtils.lerp(outFar, lampRange * 1.25, t);
    scene.fog.color.copy(env.fog).lerp(DEEP_FOG, t);
    scene.background.copy(scene.fog.color);
    sky.material.uniforms.uDark.value = t * 0.97;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(OUT.exposure, 1.15, t);
    // the grade is for the open air: it fades out down the hole and in space
    grade.uniforms.uAmount.value = (1 - t) * (1 - (mars ? 0 : night) * .6) * (space && !mars ? 0 : 1);
    // moonlight: a blue fill that never quite goes out
    hemi.intensity = OUT.hemi * (0.28 + 0.72 * env.day) * (1 - t * 0.85);
    ambient.intensity = t * (0.55 - deep * 0.3) + night * 0.05;
    lamp.intensity = lampPower * Math.max(t, night * 0.9);
    lamp.distance = lampRange;
    if (mars) {
      // mars: always day, a warm dusty haze, a weaker sun
      sky.material.uniforms.uNight.value = 0; sky.material.uniforms.uDusk.value = 0;
      scene.fog.near = THREE.MathUtils.lerp(30, .5, t); scene.fog.far = THREE.MathUtils.lerp(260, lampRange * 1.25, t);
      scene.fog.color.setHex(0xc89470).lerp(DEEP_FOG, t); scene.background.copy(scene.fog.color);
      sun.intensity = 2.3; sun.color.setHex(0xffe4c8);
      hemi.color.setHex(0xf0b890); hemi.intensity = .95 * (1 - t * .85); ambient.intensity = t * .4;
      lamp.intensity = lampPower * t;
      renderer.toneMappingExposure = 1.0;
      fall.visible = false; moon.visible = false;
    } else if (space) {
      // no air: black sky, stars, no haze, hard sunlight
      sky.material.uniforms.uNight.value = 1; sky.material.uniforms.uDusk.value = 0;
      scene.fog.near = t > .5 ? .5 : 200; scene.fog.far = t > .5 ? lampRange * 1.25 : 900;
      scene.fog.color.setHex(0x020308); scene.background.setHex(0x020308);
      sun.intensity = 3.2; hemi.intensity = .18 * (1 - t); ambient.intensity = .08 + t * .3;
      lamp.intensity = lampPower * Math.max(t, .3);
      renderer.toneMappingExposure = 1.1;
      fall.visible = false; moon.visible = false;
    }
  }

  return {
    renderer, scene, camera, sun, hemi, lamp, colliders, interactables, grassTime,
    setDepth, setTime, setSeason, updateFall, env, label, FENCE: F, house, china, shadows, homeDecor, setSpace, neighbours, fountain: europe.fountain, church: europe.church,
    // every front door of both towns: { eu: [...], jp: [...] }
    doors: { eu: europe.doors, jp: china.interiors.doors },
    // the people in the streets of each town
    walkers: { home: europe.walkers, china: china.walkers },
    setIndoor(v) { indoor = v; },
    get space() { return space; },
    // quality: haute (bloom, fine shadows), moyenne (bloom, lighter), basse (no bloom, no shadows)
    setQuality(q) {
      quality = q;
      const pr = q === 'haute' ? Math.min(devicePixelRatio, 1.5) : q === 'moyenne' ? Math.min(devicePixelRatio, 1.15) : 1;
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
      bloom.enabled = q !== 'basse';
      const size = q === 'haute' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      const wantShadows = q !== 'basse';
      if (renderer.shadowMap.enabled !== wantShadows) {
        renderer.shadowMap.enabled = wantShadows;
        scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
      }
      renderer.shadowMap.needsUpdate = true;
    },
    get quality() { return quality; },
    // a disabled bloom pass is simply skipped by the composer
    render() { composer.render(); },
    composer, bloom,
    // the sky and its clouds travel with the eye, so China gets a sky too
    follow(p) {
      sky.position.copy(p); clouds.position.set(p.x, 0, p.z);
      sun.position.copy(p).addScaledVector(SUN_DIR, 60); sun.target.position.copy(p); sun.target.updateMatrixWorld();
      moon.position.copy(p).addScaledVector(SUN_DIR, -400); moon.lookAt(p);
      earth.position.copy(p).add(new THREE.Vector3(-180, 260, 120)); earth.rotation.y += .0004;
      phobos.position.copy(p).add(new THREE.Vector3(160, 210, -190)); phobos.rotation.y += .0006;
    },
  };
}
