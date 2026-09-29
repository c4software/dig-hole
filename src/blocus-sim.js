// blocus-sim.js, the crowd of the lycée's blockade as pure numbers (no three.js, testable in node).
// Everyone sees the same crowd without a byte on the network: time is cut into episodes of E
// seconds; each episode's script (surges, splits, retreats, mortar volleys, the police's foam
// balls and smoke, their charges) comes from the seed and the episode's number, and the crowd is
// stepped at a fixed HZ from a canonical start (everyone on their spot). The last seconds of an
// episode walk everyone back to their spot, so the next one starts where this one ended.
// Only + - * / and sqrt in the steps: the same numbers on every client.
//   frame: the school's own, x along the lane, z from the police (−) to the gate (+), metres.
import { mulberry } from './lib/math.js';

export const E = 36;                 // an episode (s)
export const HZ = 15;                // steps per second
export const NP = 30, NC = 12;       // protesters, police
export const SETTLE = 6;             // the last seconds: back to the spots
export const SHOT_T = .34;           // a foam ball's flight
export const ZONE = { x0: -13, x1: 13, z0: -1.9, z1: 4.4 };
export const LINE_Z = -3.4;          // the police line at rest
// two groups, a gap in front of the gate (the lane's view of the school stays open)
export const LINE_X = (c) => c < 6 ? -11.4 + c * 1.75 : 2.65 + (c - 6) * 1.75;
export const LAUNCHERS = [2, 5, 8, 10];            // the police with a launcher, a step behind
export const FIRES = [[-7.2, 2.3], [6.4, 1.1], [10.6, 3.4]];   // bins on fire, loose in the crowd
export const TUBES = [[-4.6, 3.7], [4.7, 3.8]];    // the mortar batteries, on crates by the gate
export const BARRICADE = { x0: -3.4, x1: 3.4, z0: 3.1, z1: 5.3 };
export const BAG = [-11.6, 4.1];
export const CRATE = [13.6, -5.4];                 // the police's kit, behind their line                   // the holdall of mortars, by the railing
export const BANNERS = [[0, 1], [2, 3], [4, 5]];   // leader, partner
export const BANNER_W = 2.3;
const OBST = [...FIRES.map(([x, z]) => [x, z, .95]), ...TUBES.map(([x, z]) => [x, z, .75]), [BAG[0], BAG[1], .7]];
const R2 = .8;                       // two bodies closer than this push apart

// the blockade's hours: 1 always, 0 never, -1 school days (5 in 7) by daylight
export function blocusOn(mode, hour, day) {
  if (mode === 1) return true;
  if (mode === 0) return false;
  return ((day % 7) + 7) % 7 < 5 && hour >= 7.5 && hour < 17.5;
}

const hash = (a, b) => { let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// everyone's spot, the same in every episode
export function makeHomes(seed) {
  const r = mulberry((seed ^ 0x5bd1e995) >>> 0), hx = new Float64Array(NP), hz = new Float64Array(NP);
  const free = (x, z, n) => {
    if (x < ZONE.x0 + .6 || x > ZONE.x1 - .6 || z < -.8 || z > ZONE.z1 - .3) return false;
    if (x > BARRICADE.x0 - .6 && x < BARRICADE.x1 + .6 && z > BARRICADE.z0 - .6) return false;
    for (const [ox, oz, or] of OBST) if ((x - ox) * (x - ox) + (z - oz) * (z - oz) < (or + .35) * (or + .35)) return false;
    for (let j = 0; j < n; j++) if ((x - hx[j]) * (x - hx[j]) + (z - hz[j]) * (z - hz[j]) < 1.05 * 1.05) return false;
    return true;
  };
  let i = 0;
  // the banners in the front row, then everyone else
  for (const [a, b] of BANNERS) {
    for (let tries = 0; tries < 400; tries++) {
      const x = -10 + r() * 17.5, z = -.7 + r() * 1.2;
      hx[a] = x; hz[a] = z;
      if (free(x, z, a) && free(x + BANNER_W, z, a + 1)) { hx[b] = x + BANNER_W; hz[b] = z; break; }
    }
    i = b + 1;
  }
  for (; i < NP; i++) {
    let ok = false;
    for (let tries = 0; tries < 600 && !ok; tries++) { const x = -11 + r() * 22, z = -.6 + r() * 4.6; if (free(x, z, i)) { hx[i] = x; hz[i] = z; ok = true; } }
    if (!ok) { hx[i] = -11 + (i % 12) * 2; hz[i] = 1 + Math.floor(i / 12) * .9; }
  }
  return { hx, hz };
}

// an episode's script
export function makePlan(seed, k) {
  const r = mulberry((hash(seed, k) * 4294967296) >>> 0);
  const moves = [];
  let t = 4;
  while (t < E - SETTLE - 1.5) {
    let d = 4.5 + r() * 3.5;
    if (t + d > E - SETTLE) d = E - SETTLE - t;
    if (d < 2.5) break;
    const u = r();
    moves.push({ t0: t, t1: t + d, kind: u < .42 ? 'surge' : u < .62 ? 'split' : u < .84 ? 'mill' : 'back', cx: (r() - .5) * 14, mask: 1 + Math.floor(r() * 7) });
    t += d;
  }
  const ev = [];
  const shot = (ts, c = LAUNCHERS[Math.floor(r() * LAUNCHERS.length)]) => {
    const j = Math.floor(r() * NP), fall = r() < .5;
    ev.push({ t: ts, k: 'shot', c, j, fall }, { t: ts + SHOT_T, k: 'impact', c, j, fall });
  };
  // mortars from the crowd, a volley every 8 to 14 s, burst over the police; they answer with foam balls
  for (let t0 = 4 + r() * 4; t0 < E - SETTLE - 4; t0 += 8 + r() * 6) {
    for (let m = 1 + Math.floor(r() * 3), dt = 0; m > 0; m--, dt += .35 + r() * .5) {
      const tube = Math.floor(r() * TUBES.length), fl = 1.2 + r() * .4;
      const x = (r() - .5) * 16, y = 6.5 + r() * 3, z = LINE_Z - .5 - r() * 2, col = Math.floor(r() * 5);
      ev.push({ t: t0 + dt, k: 'mortar', tube, x, y, z, fl, col }, { t: t0 + dt + fl, k: 'burst', tube, x, y, z, col });
    }
    for (let s = 1 + Math.floor(r() * 2); s > 0; s--) shot(t0 + 2 + r() * 1.5);
  }
  for (let s = 1 + Math.floor(r() * 3); s > 0; s--) shot(5 + r() * 22);
  // a smoke canister, lobbed into the crowd
  if (r() < .55) {
    const t0 = 7 + r() * 17, c = Math.floor(r() * NC), x = (r() - .5) * 16, z = .4 + r() * 3;
    ev.push({ t: t0, k: 'smoke', c, x, z, fl: .9 }, { t: t0 + .9, k: 'cloud', c, x, z });
  }
  // the police line steps forward, shields first
  const charges = [];
  if (r() < .45) { const t0 = 8 + r() * 14; charges.push([t0, t0 + 4.5]); }
  // and bangs its shields
  const bangs = charges.map(([a]) => [a - 1.5, a + 1.5]);
  for (let n = Math.floor(r() * 3); n > 0; n--) { const a = 4 + r() * 22; bangs.push([a, a + 2 + r() * 2]); }
  ev.sort((a, b) => a.t - b.t);
  return { k, moves, ev, charges, bangs };
}

// how far forward the police stand (0 at rest), piecewise linear: no trigonometry in the steps
export function advanceAt(plan, tau) {
  let a = 0;
  for (const [t0, t1] of plan.charges) {
    if (tau < t0 || tau > t1 + 1.5) continue;
    const u = tau - t0;
    a = Math.max(a, u < 1 ? u * 1.4 : tau < t1 ? 1.4 : 1.4 * (1 - (tau - t1) / 1.5));
  }
  return a;
}
export const banging = (plan, tau) => plan.bangs.some(([a, b]) => tau >= a && tau < b);
export function moveAt(plan, tau) { for (const m of plan.moves) if (tau >= m.t0 && tau < m.t1) return m; return null; }

export function createCrowd({ seed = 1 } = {}) {
  const N = NP + NC;
  const px = new Float64Array(N), pz = new Float64Array(N), vx = new Float64Array(N), vz = new Float64Array(N);
  const ox = new Float64Array(N), oz = new Float64Array(N);            // before the last step
  const down = new Float64Array(NP), flee = new Float64Array(NP), fx = new Float64Array(NP), fz = new Float64Array(NP), fsp = new Float64Array(NP);
  const { hx, hz } = makeHomes(seed);
  let ep = -Infinity, n = 0, plan = null, ei = 0, adv = 0;
  const h = 1 / HZ;

  function canonical() {
    for (let i = 0; i < NP; i++) { px[i] = hx[i]; pz[i] = hz[i]; down[i] = 0; flee[i] = 0; }
    for (let c = 0; c < NC; c++) { const i = NP + c; px[i] = LINE_X(c); pz[i] = LINE_Z - (LAUNCHERS.includes(c) ? .7 : 0); }
    vx.fill(0); vz.fill(0); ox.set(px); oz.set(pz);
  }
  function reset(k) { ep = k; n = 0; ei = 0; adv = 0; plan = makePlan(seed, k); canonical(); }

  // run away from (x, z) for `time`, ending `dist` away; some trip and sit down
  function scatter(x, z, rad, time, dist, speed, trip, salt, except = -1) {
    for (let i = 0; i < NP; i++) {
      if (i === except || down[i] > 0) continue;
      const dx = px[i] - x, dz = pz[i] - z, d2 = dx * dx + dz * dz;
      if (d2 > rad * rad) continue;
      const d = Math.sqrt(d2) || .01, k = dist / d;
      fx[i] = px[i] + dx * k; fz[i] = pz[i] + dz * k + (d < .02 ? 1 : 0); flee[i] = time; fsp[i] = speed;
      if (hash(i + salt, ep) < trip) { down[i] = 1.4 + hash(salt, i) * .8; flee[i] = 0; }
    }
  }

  function fire(e, out) {
    if (e.k === 'mortar') {
      const [x, z] = TUBES[e.tube];
      scatter(x, z, 2.3, 1.2, 2.6, 3.2, 0, 11);
      out?.push({ k: 'mortar', t: e.t, x, z, bx: e.x, by: e.y, bz: e.z, fl: e.fl, col: e.col, tube: e.tube });
    } else if (e.k === 'burst') out?.push({ k: 'burst', t: e.t, x: e.x, y: e.y, z: e.z, col: e.col });
    else if (e.k === 'shot') {
      const c = NP + e.c;
      e.x0 = px[c]; e.z0 = pz[c]; e.x1 = px[e.j]; e.z1 = pz[e.j];
      out?.push({ k: 'shot', t: e.t, c: e.c, j: e.j, x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1 });
    } else if (e.k === 'impact') {
      const j = e.j;
      if (e.fall) { down[j] = 1.8; flee[j] = 0; } else { fx[j] = px[j]; fz[j] = Math.min(ZONE.z1, pz[j] + 1.4); flee[j] = .8; fsp[j] = 2.2; }
      scatter(px[j], pz[j], 1.8, 1.5, 2.5, 3.4, .12, 23 + j, j);
      out?.push({ k: 'impact', t: e.t, c: e.c, j, x: px[j], z: pz[j], fall: e.fall });
    } else if (e.k === 'smoke') out?.push({ k: 'smoke', t: e.t, c: e.c, x0: px[NP + e.c], z0: pz[NP + e.c], x: e.x, z: e.z, fl: e.fl });
    else if (e.k === 'cloud') {
      scatter(e.x, e.z, 3.4, 2.4, 4, 3.6, .1, 37);
      out?.push({ k: 'cloud', t: e.t, x: e.x, z: e.z });
    }
  }

  function target(i, tau, m, o) {
    let x = hx[i], z = hz[i], sp = 1.3;
    if (tau >= E - SETTLE) { o.x = x; o.z = z; o.sp = 2.4; return o; }
    if (m) {
      const g = 1 << (i % 3);
      if (m.kind === 'surge' && (m.mask & g)) { x = x * .65 + m.cx * .35; z = ZONE.z0 + .4 + (hz[i] + .8) * .3; sp = 2.4; }
      else if (m.kind === 'split') {
        // open a lane round the fire nearest the move's centre: each side leans away and forward
        let fxn = FIRES[0][0], best = 1e9;
        for (const [fx0] of FIRES) { const d = (fx0 - m.cx) * (fx0 - m.cx); if (d < best) { best = d; fxn = fx0; } }
        const s = hx[i] < fxn ? -1 : 1, near = s * (hx[i] - fxn);
        if (near < 5) { x = fxn + s * (2.2 + near * .5); z = hz[i] * .5 - .3; sp = 2; }
      } else if (m.kind === 'mill') { x += (hash(i, m.t0 * 100) - .5) * 3.2; z += (hash(i + 99, m.t0 * 100) - .5) * 1.8; sp = 1.1; }
      else if (m.kind === 'back') { z = Math.min(ZONE.z1 - .2, hz[i] + 1.4); sp = 2.8; }
    }
    o.x = x; o.z = z; o.sp = sp;
    return o;
  }
  const T = { x: 0, z: 0, sp: 0 };

  function step(out) {
    const t0 = n * h, tau = (n + 1) * h;
    ox.set(px); oz.set(pz);
    while (ei < plan.ev.length && plan.ev[ei].t <= tau) { if (plan.ev[ei].t > t0 - 1e-9) fire(plan.ev[ei], out); ei++; }
    // the police: their line, a step forward when charging
    const a = advanceAt(plan, tau);
    for (let c = 0; c < NC; c++) {
      const i = NP + c, zz = LINE_Z + a - (LAUNCHERS.includes(c) ? .7 : 0);
      vx[i] = 0; vz[i] = (zz - pz[i]) / h; pz[i] = zz;
    }
    adv = a;
    const m = moveAt(plan, tau), lim = LINE_Z + a + 1.25;
    for (let i = 0; i < NP; i++) {
      if (down[i] > 0) { down[i] -= h; vx[i] = 0; vz[i] = 0; continue; }
      let tx, tz, sp;
      if (flee[i] > 0) { flee[i] -= h; tx = fx[i]; tz = fz[i]; sp = fsp[i]; }
      else { target(i, tau, m, T); tx = T.x; tz = T.z; sp = T.sp; }
      // banner partners keep their width
      if (flee[i] <= 0 && (i === 1 || i === 3 || i === 5) && down[i - 1] <= 0 && flee[i - 1] <= 0) { target(i - 1, tau, m, T); tx = T.x + BANNER_W; tz = T.z; }
      let dx = tx - px[i], dz = tz - pz[i];
      const d = Math.sqrt(dx * dx + dz * dz);
      let wx = 0, wz = 0;
      if (d > .04) { const s = Math.min(sp, d * 1.8) / d; wx = dx * s; wz = dz * s; }
      // keep apart
      for (let j = 0; j < NP; j++) {
        if (j === i) continue;
        const ex = px[i] - px[j], ez = pz[i] - pz[j], e2 = ex * ex + ez * ez;
        if (e2 >= R2 * R2) continue;
        const e = Math.sqrt(e2);
        if (e < 1e-6) { wx += (i < j ? -1 : 1) * 1.5; continue; }
        const f = (R2 - e) / e * 5;
        wx += ex * f; wz += ez * f;
      }
      for (const [cx, cz, cr] of OBST) {
        const ex = px[i] - cx, ez = pz[i] - cz, e2 = ex * ex + ez * ez;
        if (e2 >= cr * cr) continue;
        const e = Math.sqrt(e2) || .01, f = (cr - e) / e * 7;
        wx += ex * f; wz += ez * f;
      }
      const k = 8 * h > 1 ? 1 : 8 * h;
      vx[i] += (wx - vx[i]) * k; vz[i] += (wz - vz[i]) * k;
      const s2 = vx[i] * vx[i] + vz[i] * vz[i];
      if (s2 > 25) { const s = 5 / Math.sqrt(s2); vx[i] *= s; vz[i] *= s; }
      px[i] += vx[i] * h; pz[i] += vz[i] * h;
      // the zone, the police line, the barricade
      if (px[i] < ZONE.x0) px[i] = ZONE.x0; else if (px[i] > ZONE.x1) px[i] = ZONE.x1;
      if (pz[i] > ZONE.z1) pz[i] = ZONE.z1;
      const zmin = px[i] > -11.2 && px[i] < 11.2 ? Math.max(ZONE.z0, lim) : ZONE.z0;
      if (pz[i] < zmin) { pz[i] = zmin; if (vz[i] < 0) vz[i] = 0; }
      const B = BARRICADE;
      if (px[i] > B.x0 - .3 && px[i] < B.x1 + .3 && pz[i] > B.z0 - .3) {
        const l = px[i] - (B.x0 - .3), r = (B.x1 + .3) - px[i], f = pz[i] - (B.z0 - .3);
        if (f <= l && f <= r) pz[i] = B.z0 - .3; else if (l < r) px[i] = B.x0 - .3; else px[i] = B.x1 + .3;
      }
    }
    n++;
  }

  // catch up with the shared time t (s); `out` collects what happened (null: nothing to show);
  // a long catch-up (a join, a hidden tab) shows only its last second
  function advanceTo(t, out = null) {
    const k = Math.floor(t / E), want = Math.min(E * HZ, Math.floor((t - k * E) * HZ));
    if (k !== ep || want < n) {
      reset(k);
    }
    let left = want - n;
    while (left > 0) { step(left <= HZ ? out : null); left--; }
    return (t - k * E) * HZ - n;       // how far into the next step (for smoothing), 0..1
  }

  canonical();
  return {
    N, px, pz, vx, vz, ox, oz, down, flee, hx, hz,
    reset, step, advanceTo,
    get ep() { return ep; }, get n() { return n; }, get tau() { return n * h; },
    get plan() { return plan; }, get advance() { return adv; },
  };
}
