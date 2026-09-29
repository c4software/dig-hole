// blocus-hear.js, how far the blockade carries: pure numbers (blocus-sfx.js applies them, the
// tests check them). Each kind of sound has a range: loud and sharp up close, fainter and duller
// (a lowpass closing) with distance, and true silence at the end of its range; a bang arrives
// late, at the speed of sound. Nothing from the school on the other worlds or down the hole;
// through walls, muffled.

export const SOUND_SPEED = 343;
// ref: full volume within; max: silent from there on
export const RANGE = {
  bang: { ref: 7, max: 120 },       // a mortar's burst: quiet already past ~60 m
  launch: { ref: 5, max: 90 },      // its fwoosh and whistle
  crowd: { ref: 6, max: 70 },       // chants, drums, whistles, the murmur
  police: { ref: 4, max: 55 },      // the shields banged together
  poc: { ref: 3, max: 40 },         // a foam ball, a launcher, the smoke's hiss, a fire's crackle
};
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// the volume at d metres (0..1): inverse distance, eased to nothing at the end of the range
export function gainAt(d, kind = 'crowd') {
  const R = RANGE[kind] || RANGE.crowd;
  if (!(d < R.max)) return 0;
  const inv = R.ref / Math.max(R.ref, d);
  return inv * (1 - smooth(R.max * .45, R.max, d));
}
// the air takes the highs first: 16 kHz up close, ~1 kHz at the end of the range
export function lowpassAt(d, kind = 'crowd') {
  const R = RANGE[kind] || RANGE.crowd;
  const u = Math.min(1, Math.max(0, d / R.max));
  return Math.round(16000 * Math.pow(1000 / 16000, u));
}
export const delayAt = (d) => Math.max(0, d) / SOUND_SPEED;

// where the ears are: { home (on the home map, not in a game elsewhere), y (the ear's height),
// indoor (in a room) } → { on, lp } ; lp caps every sound's lowpass (the walls)
export function hearing(where, out = {}) {
  out.on = !!where.home && !(where.y < -1.5);
  out.lp = where.indoor ? 650 : 16000;
  return out;
}
