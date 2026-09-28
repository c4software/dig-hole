// lune-sfx.js, the little synth of the moon arcade (capitaine lune, potager lunaire), on the shared one (lib/sfx.js):
// pulses, a triangle, noise, and a looping tune given as lead + bass lines. Each game builds its own sounds on top.
import { createSynth as createCore, createTune, hz } from './lib/sfx.js';

export function createSynth({ vol = .12, lead = [], roots = [], bass = [0, 12, 7, 12], beat = .2, leadType = .25, drums = true } = {}) {
  const S = createCore({ vol, music: .5 });
  const tune = createTune(S, { lead, roots, bass, beat, leadType, drums });
  return {
    hz,
    tone: (f0, f1, dur, o = {}) => S.chip(f0, f1, dur, o),
    noise: (dur, o = {}) => S.noise(dur, { loop: false, ...o }),
    seq: S.seq,
    get ctx() { return S.ctx; },
    init: S.init,
    close() { tune.set(false); S.close(); },
    music: (v) => tune.set(v),
    hurry: (v) => tune.hurry(v),
    tick: tune.tick,
  };
}
