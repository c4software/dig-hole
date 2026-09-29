// kingyo-rules.js, the goldfish scooping's rules, without a scene: the tub, the fish (the same for
// everyone: they swim on paths drawn from the seed, never from what a player does), the paper poi
// that soaks and tears when dragged too fast through the water, what a scoop catches, the score.
// The tests read it in node; kingyo.js draws it and plays it together.
import { rng16807 as rng } from './lib/math.js';

export const TUB = { w: 2, d: 1 };                 // the water, metres (x across, z deep)
export const ROUND = 60, POIS = 3, POI_R = .075, DIP_MIN = .22;
export const KINDS = {
  rouge: { name: 'poisson rouge', value: 1, weight: .12, speed: .75, size: .07, color: 0xe8481c },
  noir: { name: 'démékin noir', value: 3, weight: .2, speed: .5, size: .085, color: 0x1c1a22 },
  calico: { name: 'shubunkin', value: 5, weight: .24, speed: 1, size: .075, color: 0xf2eee4 },
  or: { name: 'poisson d\'or', value: 10, weight: .32, speed: 1.45, size: .09, color: 0xffc22a },
};
const ODDS = [['rouge', .6], ['noir', .2], ['calico', .14], ['or', .06]];
export const kindOf = (u) => { let a = 0; for (const [k, p] of ODDS) { a += p; if (u < a) return k; } return 'rouge'; };

// the tub's fish over a round: 16 at the start, one more poured in every 2.5 s (from the vendor's side)
export function spawnList(seed, round = ROUND) {
  const R = rng((seed >>> 0) * 7 + 11), out = [];
  const one = (born) => ({
    id: out.length, kind: kindOf(R()), born,
    a: [.55 + R() * .5, .9 + R() * .7, .45 + R() * .5, .8 + R() * .8], p: [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28],
    dart: R() * 6.28,
  });
  for (let k = 0; k < 16; k++) out.push(one(0));
  for (let t = 2.5; t < round; t += 2.5) out.push(one(t));
  return out;
}
// where a fish is at time t (tub coords, centre 0,0): { x, z, h (heading), y (depth, <0) }
export function fishAt(f, t, out = {}) {
  const K = KINDS[f.kind], s = K.speed * .35, age = Math.max(0, t - f.born);
  // a darting fish: bursts of speed now and then (the gold ones the most)
  const u = t * s + Math.sin(t * .7 + f.dart) * .35 * K.speed;
  const X = (v) => TUB.w / 2 * .84 * (.62 * Math.sin(f.a[0] * v + f.p[0]) + .38 * Math.sin(f.a[1] * v + f.p[1]));
  const Z = (v) => TUB.d / 2 * .8 * (.6 * Math.sin(f.a[2] * v + f.p[2]) + .4 * Math.sin(f.a[3] * v + f.p[3]));
  let x = X(u), z = Z(u);
  // a new one swims in from the far side
  if (f.born > 0 && age < 1.2) { const k = age / 1.2; x = x * k + (1 - k) * (f.id % 2 ? .8 : -.8); z = z * k + (1 - k) * -.42; }
  const dx = X(u + .02) - X(u), dz = Z(u + .02) - Z(u);
  out.x = x; out.z = z; out.h = Math.atan2(dx, dz); out.y = -.05 - .035 * (.5 + .5 * Math.sin(t * .9 + f.p[2]));
  return out;
}
export const alive = (f, t, taken) => t >= f.born && !taken.has(f.id);

// the paper: soaks slowly, tears fast when dragged (speed in m/s), only while in the water
export function wear(hp, dt, speed, wet) {
  if (!wet) return hp;
  return hp - dt * (.05 + Math.max(0, speed - .15) * 3.2);
}
// lifting the poi at (x, z): the nearest fish over the paper, if it had time to slide under it.
// → { fish, hp } caught, { torn, fish, hp } the paper gave way under it, or null (nothing there)
export function scoop({ x, z, hp, dip }, fish, t, taken) {
  if (dip < DIP_MIN || hp <= 0) return null;
  let best = null, bd = Infinity;
  const at = {};
  for (const f of fish) {
    if (!alive(f, t, taken)) continue;
    fishAt(f, t, at);
    const d = Math.hypot(at.x - x, at.z - z);
    if (d < POI_R + KINDS[f.kind].size * .3 && d < bd) { best = f; bd = d; }
  }
  if (!best) return null;
  const left = hp - KINDS[best.kind].weight;
  return left <= 0 ? { torn: true, fish: best, hp: 0 } : { fish: best, hp: left };
}
export const points = (kinds) => kinds.reduce((a, k) => a + KINDS[k].value, 0);
// places by score, more fish breaking ties
export const ranking = (seats) => [...seats].sort((a, b) => b.score - a.score || b.fish - a.fish);
