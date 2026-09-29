// caddies-track.js, the shopping-cart course round the church: plain numbers only (no three.js),
// so the loop, its checkpoints and the ground are testable in node. The line starts on the square in
// front of the church portal heading west, turns up the lawn along the nave, crosses behind the apse,
// comes down the other side and swings back onto the square: lanes 5.5 to 6.5 m wide, room to overtake.
// Europe.js has the square (x 44..78, z -10.8..14, paved 10 cm over the grass), the church's nave
// (x 55.5..66.5, z 17..39) and its tower (x 57.75..64.25 from z 12.25), the garden wall at x 41.

// [x, z, half width]: the course's centre line, the start line first
export const CTRL = [
  // in front of the church, westwards, between the fountain and the tower
  [63.5, 9.3, 2.8], [60.5, 9.25, 2.85], [57.6, 9.5, 2.65],
  // round the tower's corner (the post box outside) onto the lawn
  [55.0, 10.7, 2.75], [52.6, 13.6, 2.9], [51, 17.2, 3], [49.9, 21, 3.1],
  // up the lawn along the nave
  [49.4, 26, 3.2], [49.4, 31, 3.2], [50.2, 37, 3.1],
  // behind the apse
  [53, 42.4, 3], [57.5, 44.8, 3], [62, 45.3, 3.1], [66.5, 44.6, 3], [70.4, 42, 3],
  // down the other side
  [72.4, 37, 3.2], [72.8, 31, 3.2], [72.6, 25, 3.2], [71.6, 19.5, 3.1],
  // back onto the square, past the cherry tree, to the line
  [69.6, 15, 2.9], [67.6, 11.8, 2.8], [65.8, 9.8, 2.8],
];
export const STEP = .25;   // metres between two samples of the line
// the checkpoints, as shares of a lap: the tower's corner, the lawn, behind the apse, the far side, the tree;
// the finish line (the start) is the last one
export const CP_AT = [.12, .3, .5, .7, .86];

// a closed Catmull-Rom through the control points, sampled every STEP metres
export function buildTrack(ctrl = CTRL, step = STEP) {
  const n = ctrl.length, dense = [];
  const P = (i) => ctrl[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < 24; s++) {
      const t = s / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * (t * t * (3 - 2 * t))]);
    }
  }
  // the running length along the dense line, then even samples
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[dense.length], N = Math.round(len / step), pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i / N * len;
    while (cum[j + 1] < d) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length], u = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    pts.push({ x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hw: a[2] + (b[2] - a[2]) * u, tx: 0, tz: 0, sx: 0, sz: 0, curve: 0 });
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], p = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    p.tx = dx / l; p.tz = dz / l;
    p.sx = -p.tz; p.sz = p.tx;   // the rider's right, facing along the line
  }
  // how hard the line bends over the next few metres (radians): the bots read it
  const ahead = Math.round(4 / step);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + ahead) % N];
    a.curve = Math.atan2(a.tz * b.tx - a.tx * b.tz, a.tx * b.tx + a.tz * b.tz);   // the change of yaw (+: to the left)
  }
  const cps = [...CP_AT.map(f => Math.round(f * N)), N];
  const yawAt = (i) => Math.atan2(pts[i].tx, pts[i].tz);
  // the nearest sample, looking `win` samples either side of `from` (the whole loop if from < 0)
  function nearest(x, z, from = -1, win = 40) {
    let best = 0, bd = Infinity;
    if (from < 0) { for (let i = 0; i < N; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
    for (let k = -win; k <= win; k++) { const i = ((from + k) % N + N) % N, d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // signed distance from the centre line at sample i (positive: to the right)
  const lateral = (i, x, z) => (x - pts[i].x) * pts[i].sx + (z - pts[i].z) * pts[i].sz;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x - p.hw); x1 = Math.max(x1, p.x + p.hw); z0 = Math.min(z0, p.z - p.hw); z1 = Math.max(z1, p.z + p.hw); }
  return { pts, N, len, cps, nearest, lateral, yawAt, box: { x0, x1, z0, z1 } };
}

// the ground under a wheel: the square's paving stands 10 cm over the grass round it
export const SQUARE = { x0: 44, x1: 78, z0: -10.78, z1: 14 };
export function groundY(x, z) {
  return x > SQUARE.x0 && x < SQUARE.x1 && z > SQUARE.z0 && z < SQUARE.z1 ? .1 : 0;
}

// the square's props a cart can hit (world colliders, { min, max }), as flat boxes near the course
export function solidsFrom(colliders, box, pad = 2) {
  const out = [];
  for (const c of colliders) {
    if (c.off || c.min.y > .9 || c.max.y < .12) continue;
    if (c.max.x - c.min.x > 70 || c.max.z - c.min.z > 70) continue;
    if (c.max.x < box.x0 - pad || c.min.x > box.x1 + pad || c.max.z < box.z0 - pad || c.min.z > box.z1 + pad) continue;
    out.push({ x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z, h: c.max.y });
  }
  return out;
}
