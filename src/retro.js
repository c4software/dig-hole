// retro.js, what the games of the secret cave share: a little chip synth, a seeded random,
// who hosts, and the clock format. Each game is a diorama of the cave you shrink into, a module
// like jetski.js: start, stop, update(dt, keys), onFx, peerLeft, respawn, hud, preview, onEnd.
import { createSynth } from './lib/sfx.js';
import { hexOf, ord, fmtTime as fmt } from './lib/fmt.js';
import { rng16807 as rng } from './lib/math.js';

export { fmt };
export { ord };
export { hexOf };
export { rng };
// who runs the shared world: the host if still here, else the first human by id
export const hostOf = (humans, hostId) => humans.some(h => h.id === hostId) ? hostId : [...humans].map(h => h.id).sort((a, b) => String(a).localeCompare(String(b)))[0];

// ---------- a chip synth: pulses, triangle, noise (the shared one, lib/sfx.js) ----------
// tone type: .125 | .25 | .5 (pulse duty), 'tri', 'saw', 'sine'; seq: midi notes one after the other (null: a rest)
export function createChip(volume = .12) {
  const S = createSynth({ vol: volume });
  return {
    init: S.init, hz: S.hz, close: S.close, get ctx() { return S.ctx; },
    seq: (notes, step = .08, opts = {}) => S.seq(notes, step, { vol: .4, ...opts }),
    tone: (f0, f1 = f0, dur = .1, { type = .5, vol = .4, at = 0 } = {}) => S.chip(f0, f1, dur, { type, vol, at }),
    noise: (dur = .1, { vol = .3, f = 1200, at = 0 } = {}) => S.noise(dur, { vol, f, at, filter: 'lowpass', q: 1, loop: true }),
  };
}
