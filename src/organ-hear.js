// organ-hear.js, how the church organ reaches your ears: full in the nave, muffled through its
// walls, dull down the hole, a little muted in the crypt right under it, faint but never gone
// anywhere on the home map, silent on the other worlds. Pure numbers: church.js applies them.

// the nave and the porch, in world coordinates (europe.js: the church at (61, 0, 25), turned round)
export const NAVE = { x0: 55.5, x1: 66.5, z0: 12.25, z1: 39, y0: -.5, y1: 10 };
// the pipes sound from here (the organ's case, a few metres up)
export const PIPES_Y = 3.8;
// distance falloff (the panner's inverse model): ~ -29 dB at 150 m, never zero
export const FALLOFF = { ref: 10, roll: 2 };
export const organGain = (d, o = FALLOFF) => o.ref / (o.ref + o.roll * Math.max(0, d - o.ref));

// ear {x,y,z}; where { here, crypt, cave }; out: reused { on, inside, lp, boost }
export function organHearing(ear, where, out = {}) {
  out.on = where.here === 'home'; out.inside = false; out.lp = 1800; out.boost = 1;
  if (!out.on) return out;
  const N = NAVE;
  if (ear.x > N.x0 && ear.x < N.x1 && ear.z > N.z0 && ear.z < N.z1 && ear.y > N.y0 && ear.y < N.y1) { out.inside = true; out.lp = 20000; out.boost = 1.3; }
  else if (where.crypt) { out.inside = true; out.lp = 2600; }
  else if (where.cave || ear.y < -1.5) out.lp = Math.max(280, 700 + ear.y * 8);
  return out;
}
