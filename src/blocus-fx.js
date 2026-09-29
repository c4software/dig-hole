// blocus-fx.js, the blockade's fire and smoke: a pool of glowing points (flames, sparks, rockets,
// firework bursts: added light, one draw) and a pool of soft puffs (bin smoke, the police's white
// cloud: one draw), both drawn as sized points; the foam balls, instanced. Nothing is allocated
// once built: a spawn takes the next free slot, a dead one is swapped out with the last.
import * as THREE from 'three';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(512.0, aSize * uScale / max(.1, -mv.z));
  vAlpha = aAlpha; vColor = aColor;
}`;
const FRAG_GLOW = `
varying float vAlpha; varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - .5) * 2.0;
  float a = vAlpha * pow(max(0.0, 1.0 - d), 1.6);
  gl_FragColor = vec4(vColor, a);
}`;
const FRAG_PUFF = `
uniform sampler2D uMap;
varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
}`;

function puffTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let k = 0; k < 9; k++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// a pool of points: spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha, drag, gravity)
export function createPoints(parent, { max = 600, additive = true } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uniforms = { uScale: { value: 600 }, uMap: { value: additive ? null : puffTex() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: additive ? FRAG_GLOW : FRAG_PUFF,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5; pts.userData.keep = true;
  parent.add(pts);
  // per particle: position, velocity, age, life, sizes, colour, alpha, drag, gravity
  const P = new Float32Array(max * 3), Vv = new Float32Array(max * 3), age = new Float32Array(max), life = new Float32Array(max),
    s0 = new Float32Array(max), s1 = new Float32Array(max), C = new Float32Array(max * 3), A = new Float32Array(max), drag = new Float32Array(max), grav = new Float32Array(max);
  let n = 0;
  function spawn(x, y, z, vx, vy, vz, lf, a0, a1, r, g, b, al = 1, dr = 0, gr = 0) {
    if (n >= max) return;
    const i = n++, i3 = i * 3;
    P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z; Vv[i3] = vx; Vv[i3 + 1] = vy; Vv[i3 + 2] = vz;
    age[i] = 0; life[i] = lf; s0[i] = a0; s1[i] = a1; C[i3] = r; C[i3 + 1] = g; C[i3 + 2] = b; A[i] = al; drag[i] = dr; grav[i] = gr;
  }
  function kill(i) {
    const j = --n; if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) { P[i3 + k] = P[j3 + k]; Vv[i3 + k] = Vv[j3 + k]; C[i3 + k] = C[j3 + k]; }
    age[i] = age[j]; life[i] = life[j]; s0[i] = s0[j]; s1[i] = s1[j]; A[i] = A[j]; drag[i] = drag[j]; grav[i] = grav[j];
  }
  function update(dt, scale) {
    uniforms.uScale.value = scale;
    for (let i = 0; i < n;) {
      age[i] += dt;
      if (age[i] >= life[i]) { kill(i); continue; }
      const i3 = i * 3, k = drag[i] ? Math.max(0, 1 - drag[i] * dt) : 1;
      Vv[i3] *= k; Vv[i3 + 1] = Vv[i3 + 1] * k - grav[i] * dt; Vv[i3 + 2] *= k;
      P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
      i++;
    }
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, u = age[i] / life[i];
      pos[i3] = P[i3]; pos[i3 + 1] = P[i3 + 1]; pos[i3 + 2] = P[i3 + 2];
      col[i3] = C[i3]; col[i3 + 1] = C[i3 + 1]; col[i3 + 2] = C[i3 + 2];
      size[i] = s0[i] + (s1[i] - s0[i]) * u;
      // in fast, out slow
      alpha[i] = A[i] * Math.min(1, u * 8) * (1 - u);
    }
    const had = geo.drawRange.count;
    geo.setDrawRange(0, n);
    if (n || had) for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[k].needsUpdate = true;
  }
  return { pts, spawn, update, clear() { n = 0; geo.setDrawRange(0, 0); }, get count() { return n; } };
}

// a firework's burst: a sphere of sparks in one pure colour (every third in a second one),
// spread wide so they don't pile up into white, bright enough for the bloom; a coloured flash
// and its lit smoke. low: a half sphere (it went off on the ground)
export const FIRE_COLS = [[1, .12, .06], [.1, 1, .2], [.2, .35, 1], [1, .72, 0], [.85, .15, 1]];
export function fireworkBurst(fx, puffs, x, y, z, col, { low = false, n = 120, speed = 9, rnd = Math.random } = {}) {
  const [r, g, b] = FIRE_COLS[col % FIRE_COLS.length], [r2, g2, b2] = FIRE_COLS[(col + 2) % FIRE_COLS.length];
  for (let k = 0; k < n; k++) {
    const u = low ? rnd() : rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = speed * (.75 + rnd() * .4), two = k % 3 === 0;
    fx.spawn(x, y, z, Math.cos(th) * s * v, u * v, Math.sin(th) * s * v, 1.4 + rnd() * .8, .75, .25, (two ? r2 : r) * 1.8, (two ? g2 : g) * 1.8, (two ? b2 : b) * 1.8, .75, 1.3, 2);
  }
  // the flash, in the burst's colour, and glitter falling after
  fx.spawn(x, y, z, 0, 0, 0, .3, 10, 16, r * 1.5 + .2, g * 1.5 + .2, b * 1.5 + .2, .8);
  for (let k = 0; k < 24; k++) fx.spawn(x + (rnd() - .5) * 7, y - rnd() * 2, z + (rnd() - .5) * 7, 0, -.6, 0, .4 + rnd() * .9, .35, .12, r * 1.4 + .3, g * 1.4 + .3, b * 1.4 + .3, 1);
  // its smoke, lit in its colour for a moment
  for (let k = 0; k < 10; k++) puffs.spawn(x + (rnd() - .5) * 2, y, z + (rnd() - .5) * 2, (rnd() - .5) * 1.5, rnd() * .6, (rnd() - .5) * 1.5, 1.8, 1, 3, .55 + r * .45, .55 + g * .45, .55 + b * .45, .45, 1, -.05);
}

// the foam balls: flying from a launcher to where they're sent, then bouncing away
export function createBalls(parent, max = 16) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.06, 10, 7), new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0x6a4a00 }), max);
  mesh.frustumCulled = false; mesh.userData.keep = true; mesh.count = 0;
  parent.add(mesh);
  const B = Array.from({ length: max }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, fl: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, free: false, local: false, hit: false }));
  const m4 = new THREE.Matrix4();
  let next = 0;
  return {
    B,
    // fly from a to b in `fl` seconds (a faint arc), then fall free
    fire(x0, y0, z0, x1, y1, z1, fl, local = false) {
      const b = B[next]; next = (next + 1) % max;
      Object.assign(b, { on: true, x: x0, y: y0, z: z0, x0, y0, z0, x1, y1, z1, t: 0, fl, free: false, local, hit: false });
      return b;
    },
    // knocked off something: bounce back, fall
    bounce(b, nx, nz) { b.free = true; b.vx = nx * 2.5; b.vz = nz * 2.5; b.vy = 2.2; b.t = 0; },
    update(dt, onArrive) {
      let n = 0;
      for (const b of B) {
        if (!b.on) continue;
        b.t += dt;
        if (!b.free) {
          const u = Math.min(1, b.t / b.fl);
          b.x = b.x0 + (b.x1 - b.x0) * u; b.z = b.z0 + (b.z1 - b.z0) * u; b.y = b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * .25;
          if (u >= 1) {
            const k = 1 / b.fl;
            b.free = true; b.vx = (b.x1 - b.x0) * k * .25; b.vz = (b.z1 - b.z0) * k * .25; b.vy = 1.5; b.t = 0;
            onArrive?.(b);
          }
        } else {
          b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          if (b.y < .06) { b.y = .06; b.vy = -b.vy * .45; b.vx *= .7; b.vz *= .7; }
          if (b.t > 2.2) { b.on = false; continue; }
        }
        m4.makeTranslation(b.x, b.y, b.z);
        mesh.setMatrixAt(n++, m4);
      }
      mesh.count = n;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { for (const b of B) b.on = false; mesh.count = 0; },
  };
}
