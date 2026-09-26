// worms-map.js: the island of « taupes de guerre » — a bitmap of garden earth over water, carved by every blast.
// Built from the seed alone, so every client has the same one; the carves replay exactly.
export const W = 2560, H = 1100, WATER = 1000;

export function rng(s) {
  s = (s >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// the shape: one to three islands, hills, floating clods with roots, old mole burrows
function shape(seed) {
  const r = rng(seed ^ 0x7a1d5), mask = new Uint8Array(W * H);
  const n = 1 + Math.floor(r() * 2.6), M = 150, gaps = [];
  let span = W - 2 * M;
  for (let i = 1; i < n; i++) gaps.push(110 + r() * 80);
  span -= gaps.reduce((a, b) => a + b, 0);
  const isl = [];
  let x = M;
  for (let i = 0; i < n; i++) { const w = span / n * (.8 + r() * .4) * (i === n - 1 ? 0 : 1) || (W - M - x); isl.push([x, x + w]); x += w + (gaps[i] || 0); }
  isl[n - 1][1] = W - M;
  const p = Array.from({ length: 6 }, () => r() * 6.28), amp = 90 + r() * 70, base = 600 + r() * 60;
  const bumps = Array.from({ length: 5 }, () => [M + r() * (W - 2 * M), 60 + r() * 120, (r() - .35) * 170]);
  const surf = new Float32Array(W).fill(H + 10);
  for (const [a, b] of isl) for (let x = Math.ceil(a); x < b; x++) {
    let h = base + amp * Math.sin(x * .0037 + p[0]) + amp * .45 * Math.sin(x * .0093 + p[1]) + 22 * Math.sin(x * .027 + p[2]) + 6 * Math.sin(x * .09 + p[3]);
    for (const [bx, bw, bh] of bumps) h -= bh * Math.exp(-(((x - bx) / bw) ** 2));
    const e = Math.sqrt(smooth(0, 190, Math.min(x - a, b - x)));
    surf[x] = Math.max(300, WATER + 70 - e * (WATER + 70 - h));
  }
  for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.floor(surf[x])); y < H; y++) mask[y * W + x] = 1;
  const disc = (cx, cy, rx, ry, v) => {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, cy + ry); y++) {
      const dx = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
      for (let x = Math.max(0, Math.ceil(cx - dx)); x <= Math.min(W - 1, cx + dx); x++) mask[y * W + x] = v;
    }
  };
  // floating clods, their bellies hanging in lumps
  const clods = 2 + Math.floor(r() * 3);
  for (let i = 0; i < clods; i++) {
    const cx = M + 120 + r() * (W - 2 * M - 240), top = Math.min(surf[Math.floor(cx)] - 190, 330 + r() * 150), rx = 60 + r() * 70;
    if (top < 200) continue;
    disc(cx, top + 16, rx, 16, 1);
    for (let k = 0; k < 5; k++) disc(cx + (r() - .5) * rx * 1.4, top + 22 + r() * 10, 18 + r() * 20, 14 + r() * 16, 1);
  }
  // burrows: wandering tunnels, now and then out to the air
  const holes = 3 + Math.floor(r() * 4);
  for (let i = 0; i < holes; i++) {
    let cx = M + 100 + r() * (W - 2 * M - 200); const s0 = surf[Math.floor(cx)];
    if (s0 > WATER - 60) continue;
    let cy = s0 + 60 + r() * 140, a = (r() - .5) * 1.2 + (r() < .5 ? 0 : Math.PI);
    const len = 18 + Math.floor(r() * 26), rad = 14 + r() * 7;
    for (let k = 0; k < len; k++) {
      disc(cx, cy, rad, rad * .85, 0);
      a += (r() - .5) * .7; cx += Math.cos(a) * 9; cy += Math.sin(a) * 6;
      if (cy > WATER - 40) a = -Math.abs(a);
    }
    disc(cx, cy, rad + 8, rad + 4, 0);
  }
  return { mask, surf, r };
}

// the paint: grass on top, soil in strata, pebbles, roots, a few earthworms and buried treasures
function paint(mask, seed) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data, r = rng(seed ^ 0x9e11);
  const N = 128, tile = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) tile[i] = r();
  for (let k = 0; k < 2; k++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) tile[y * N + x] = (tile[y * N + x] * 2 + tile[y * N + ((x + 1) & 127)] + tile[((y + 1) & 127) * N + x]) / 4;
  const soil = [[164, 108, 62], [140, 88, 50], [118, 72, 42], [98, 58, 36], [84, 50, 34]];
  for (let x = 0; x < W; x++) {
    let run = 0;
    const wav = Math.sin(x * .011) * 14 + Math.sin(x * .037) * 5;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (!mask[i]) { run = 0; continue; }
      run++;
      const n = tile[(y & 127) * N + (x & 127)], o = i * 4;
      let R, G, B;
      if (run <= 7) {
        const k = run <= 2 ? 1 : run <= 5 ? .82 : .62, v = .85 + n * .3;
        R = 96 * k * v; G = 196 * k * v; B = 64 * k * v;
      } else if (run <= 11) { R = 70 + n * 30; G = 52 + n * 20; B = 30; }
      else {
        const band = Math.floor((y + wav) / 46) % 5, c = soil[Math.abs(band)], v = .82 + n * .36;
        R = c[0] * v; G = c[1] * v; B = c[2] * v;
        if (n > .74) { R = G = B = 150 + n * 40; B -= 10; }   // grit
      }
      d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const inSoil = (x, y) => mask[Math.floor(y) * W + Math.floor(x)] && mask[Math.floor(y - 16) * W + Math.floor(x)];
  // pebbles
  for (let k = 0; k < 520; k++) {
    const x = r() * W, y = 330 + r() * (H - 330);
    if (!inSoil(x, y)) continue;
    const s = 3 + r() * 9, c = 120 + r() * 60 | 0;
    g.fillStyle = `rgb(${c},${c - 6},${c - 14})`; g.strokeStyle = 'rgba(40,24,14,.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(x, y, s, s * (.55 + r() * .3), r() * 3, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(x - s * .3, y - s * .25, s * .35, s * .18, 0, 0, 7); g.fill();
  }
  // roots hanging from the grass
  g.strokeStyle = 'rgba(70,40,22,.85)'; g.lineCap = 'round';
  for (let k = 0; k < 110; k++) {
    let x = r() * W, y = 0;
    while (y < H && !mask[Math.floor(y) * W + Math.floor(x)]) y += 4;
    if (y >= WATER - 40) continue;
    y += 9; g.lineWidth = 1.5 + r() * 2; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (r() - .5) * 14; y += 6 + r() * 10; g.lineTo(x, y); }
    g.stroke();
  }
  // little earthworms, bones, a carrot or two
  for (let k = 0; k < 40; k++) {
    const x = r() * W, y = 420 + r() * (WATER - 420);
    if (!inSoil(x, y)) continue;
    const kind = r();
    g.save(); g.translate(x, y); g.rotate(r() * 6.28);
    if (kind < .6) { g.strokeStyle = '#e88a9a'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(-5, -6, 0, 0); g.quadraticCurveTo(5, 6, 10, 0); g.stroke(); }
    else if (kind < .8) { g.fillStyle = '#efe6d0'; g.fillRect(-8, -1.5, 16, 3); for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 8, -2, 2.5, 0, 7); g.arc(s * 8, 2, 2.5, 0, 7); g.fill(); } }
    else { g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(-3, -9); g.lineTo(3, -9); g.lineTo(0, 10); g.fill(); g.fillStyle = '#4fb030'; g.fillRect(-2.5, -14, 2, 5); g.fillRect(.5, -14, 2, 5); }
    g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  // grass tufts on the open tops
  for (let x = 2; x < W - 2; x += 3) {
    let y = 0;
    while (y < WATER && !mask[y * W + x]) y++;
    if (y >= WATER - 10) continue;
    const h = 4 + r() * 7;
    g.strokeStyle = r() < .5 ? '#6fd048' : '#4fb030'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + (r() - .5) * 5, y - h); g.stroke();
    if (r() < .025) { g.fillStyle = ['#ffd21f', '#ff6fa0', '#ffffff', '#9a7aff'][Math.floor(r() * 4)]; g.beginPath(); g.arc(x, y - h - 2, 3, 0, 7); g.fill(); g.fillStyle = '#ffb020'; g.beginPath(); g.arc(x, y - h - 2, 1.2, 0, 7); g.fill(); }
  }
  return cv;
}

// behind the earth: dark packed soil down from the first surface, seen in burrows and deep craters (half size)
function backdrop(surf) {
  const cv = document.createElement('canvas'); cv.width = W / 2; cv.height = H / 2;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 150, 0, H / 2);
  gr.addColorStop(0, '#5a3820'); gr.addColorStop(1, '#2e1a0e');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, H / 2);
  for (let x = 0; x < W; x += 4) g.lineTo(x / 2, Math.min(H, surf[x] + 14) / 2);
  g.lineTo(W / 2, H / 2); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-atop';
  const r = rng(7);
  for (let k = 0; k < 900; k++) { g.fillStyle = r() < .5 ? 'rgba(0,0,0,.18)' : 'rgba(255,220,180,.06)'; g.beginPath(); g.arc(r() * W / 2, r() * H / 2, 1 + r() * 3, 0, 7); g.fill(); }
  return cv;
}

export function createMap(seed) {
  let { mask, surf } = shape(seed);
  let cv = paint(mask, seed), g = cv.getContext('2d');
  const back = backdrop(surf);
  const solid = (x, y) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= W || y < 0) return 0;
    if (y >= H) return 1;
    return mask[y * W + x];
  };
  function carveMask(cx, cy, r) {
    const y0 = Math.max(0, Math.ceil(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.max(0, Math.ceil(cx - dx)), x1 = Math.min(W - 1, Math.floor(cx + dx));
      if (x1 >= x0) mask.fill(0, y * W + x0, y * W + x1 + 1);
    }
  }
  function carveArt(cx, cy, r) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = 'rgba(52,30,16,.9)'; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, r + 3, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(30,16,8,.5)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r + 8, 0, 7); g.stroke();
    g.restore();
  }
  return {
    get cv() { return cv; },
    back,
    get mask() { return mask; },
    surf,
    solid,
    carve(cx, cy, r) { carveMask(cx, cy, r); carveArt(cx, cy, r); },
    hash() {
      const u = new Uint32Array(mask.buffer, 0, mask.length >> 2);
      let h = 2166136261;
      for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
      return h >>> 0;
    },
    // back to the pristine island, then every carve again
    rebuild(carves) {
      ({ mask } = shape(seed));
      cv = paint(mask, seed); g = cv.getContext('2d');
      for (const [x, y, r] of carves) { carveMask(x, y, r); carveArt(x, y, r); }
    },
    // spots for the moles: on top of something, apart from each other
    spawns(n, r) {
      const out = [];
      for (let tries = 0; out.length < n && tries < 4000; tries++) {
        const x = 170 + Math.floor(r() * (W - 340));
        let y = 60;
        while (y < WATER - 40 && !(solid(x, y) && !solid(x, y - 1))) y++;
        if (y >= WATER - 60) continue;
        let clear = true;
        for (let k = 1; k < 26 && clear; k++) if (solid(x - 4, y - k) || solid(x + 4, y - k)) clear = false;
        if (!clear || !solid(x - 5, y + 2) || !solid(x + 5, y + 2)) continue;
        if (out.some((p) => Math.abs(p.x - x) < (tries < 2500 ? 90 : 40) && Math.abs(p.y - y) < 60)) continue;
        out.push({ x, y });
      }
      while (out.length < n) out.push({ x: W / 2 + out.length * 7, y: 200 });
      return out;
    },
  };
}
