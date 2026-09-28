// holy-code.js, the numbers behind the holy bomba: the reliquary's code and where on mars the
// templars buried it, both drawn from mars's seed, so everyone in a room digs up the same one.
// No three.js here: node tests read it as is.

export const CODE_LEN = 4;
// the chapel under the templar's tomb, in the church's ground (world metres)
export const CHAPEL = { x0: 63.6, x1: 68.4, y0: -14.8, y1: -12.4, z0: 28.4, z1: 33.2 };
// the reliquary in it, against the east wall
export const CHEST = { x: 67.4, z: 30.8 };
// how many a player may take from the reliquary, one in hand at a time
export const HOLY_TAKES = 3;
// how deep the tablet lies under the arch (metres), and how close you must dig to it
export const TABLET_DEPTH = 3.2, TABLET_REACH = 2.1;

function mix(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
function rng(seed) {
  let h = mix((seed | 0) ^ 0x1432b0b);
  return () => (h = mix(h + 0x9e3779b9)) / 4294967296;
}

// four digits, 1 to 9 (no zero: it reads too much like an o on a stone)
export function holyCode(seed) {
  const r = rng((seed | 0) * 31 + 7);
  let s = '';
  for (let n = 0; n < CODE_LEN; n++) s += 1 + Math.floor(r() * 9);
  return s;
}

// what's already stood up on mars, as directions from its centre (lander straight up)
const AVOID = [[0, 1, 0], [.4, 1, -.3], [-.3, 1, .4], [.66, 1, .12], [-.12, 1, -.66]].map(norm);
function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// the arch: a direction from mars's centre, 55 to 75° off the lander, clear of the rest
export function tabletDir(seed) {
  const r = rng((seed | 0) * 17 + 3);
  let best = null;
  for (let n = 0; n < 40; n++) {
    const th = (55 + r() * 20) * Math.PI / 180, ph = r() * Math.PI * 2;
    const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    const clear = Math.min(...AVOID.slice(1).map(a => Math.acos(Math.min(1, dot(a, d)))));
    if (!best || clear > best.clear) best = { d, clear };
    if (clear > 30 * Math.PI / 180) break;
  }
  return best.d;
}

// a guess at the lock: only digits count
export const cleanCode = (s) => String(s ?? '').replace(/\D/g, '').slice(0, CODE_LEN);
export const checkCode = (guess, seed) => cleanCode(guess).length === CODE_LEN && cleanCode(guess) === holyCode(seed);

// the chapel's cells in a ground whose corner is (X0, Y0, Z0) and cells S wide
export function chapelCells(X0, Y0, Z0, S) {
  const lo = (v, o) => Math.ceil((v - o) / S - .5), hi = (v, o) => Math.floor((v - o) / S - .5);
  const i = lo(CHAPEL.x0, X0), j = lo(CHAPEL.y0, Y0), k = lo(CHAPEL.z0, Z0);
  return { i, j, k, w: hi(CHAPEL.x1, X0) - i + 1, h: hi(CHAPEL.y1, Y0) - j + 1, d: hi(CHAPEL.z1, Z0) - k + 1 };
}

// what the player knows: the code only counts for the mars it was read on
export function knownCode(holy, seed) {
  return holy && holy.code && holy.seed === seed ? holy.code : null;
}
