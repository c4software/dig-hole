// caddies-track.js, the shopping-cart course on the church square: plain numbers only (no three.js),
// so the loop, its checkpoints and the ground are testable in node. The line starts in front of the
// church portal heading west, squeezes between the bench and the tower, turns down past the post box,
// weaves through the café terrace, drops off the kerb onto the high street, crosses the zebra, climbs
// back into the square by the bakery, threads between the parked cars and the clothes shop, rounds
// the cherry tree and comes back to the line. Europe.js has the square: x 44..78, z -10.8..14.

// [x, z, half width]: the course's centre line, the start line first
export const CTRL = [
  [66.0, 11.3, 1.35], [63.2, 11.2, .95], [60.9, 11.2, .9], [58.4, 11.2, 1.0], [56.2, 10.9, 1.1],
  // past the post box, between the house and the tree, the bench
  [54.4, 9.9, 1.1], [53.8, 8.2, 1.2], [53.4, 5.8, 1.3], [53.4, 3.2, 1.3], [53.9, .9, 1.05],
  // round the lamp post into the café terrace, between the tables
  [55.2, -.6, .85], [55.7, -2.6, .9], [55.7, -5.2, .95], [55.6, -7.6, .95], [55.2, -9.4, .9],
  // between two bollards, off the kerb, along the high street over the zebra crossing
  [54.9, -10.6, .85], [55.6, -12.2, 1.3], [57.8, -13.2, 1.5], [61.0, -13.4, 1.7], [64.6, -13.2, 1.6],
  [67.6, -12.6, 1.4], [69.6, -11.4, 1.1],
  // back up the kerb by the bakery, the wide east side
  [70.3, -10.0, .9], [70.6, -8.0, 1.6], [70.9, -5.0, 2.0], [70.9, -1.5, 2.0], [71.2, 2.0, 2.0],
  // between the parked cars and the clothes shop, round the cherry tree
  [72.4, 4.8, 1.4], [72.95, 7.2, 1.15], [73.2, 9.4, 1.1], [74.3, 11.0, 1.0], [74.1, 12.9, 1.0],
  [72.2, 13.4, 1.2], [70.0, 12.3, 1.4], [68.2, 11.4, 1.4],
];
export const STEP = .25;   // metres between two samples of the line
// the checkpoints, as shares of a lap: the church portal, the café, the zebra, the bakery, the tree;
// the finish line (the start) is the last one
export const CP_AT = [.1, .3, .5, .66, .84];

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

// the ground under a wheel: the square's paving and the pavements stand 10 cm over the road
const ROAD_Z = -13.1;
export function groundY(x, z) {
  if (z > ROAD_Z + 1.64 || z < ROAD_Z - 1.64) return .1;
  return .02;
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
