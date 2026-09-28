// lib/math.js, the little number helpers the games kept writing again: clamp, lerp, an angle brought
// back to [-π, π], and two seeded randoms (the same draws as before, so a seed makes the same level).
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Park–Miller (16807): the cave's games, lombrics 3D
export function rng16807(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
// mulberry32: encre, taupes de guerre
export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
