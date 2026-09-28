// nes-sfx.js, the 8-bit sounds of "super creuseur" on the shared synth (lib/sfx.js): two pulses, a triangle, some noise, and an original little tune.
import { createSynth, createTune } from './lib/sfx.js';
export function createSfx() {
  const S = createSynth({ vol: .12, music: .55 });
  const tone = (f0, f1, dur, o = {}) => S.chip(f0, f1, dur, o);
  const noise = (dur, o = {}) => S.noise(dur, { loop: false, ...o });
  const seq = S.seq;

  // the tune: C, Am, F, G / C, Am, Dm, G in eighth notes; 0 = hold, -1 = rest
  const LEAD = [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 76, 0, 77, 0, 76, 74, 72, 0, 69, 0, 71, 0, 74, 0, 79, 0, -1, -1,
    72, 76, 79, 84, 79, 76, 72, -1, 69, 72, 76, 81, 76, 72, 69, -1, 74, 0, 77, 0, 81, 0, 77, 74, 79, 0, 77, 0, 74, 0, 71, -1];
  const tune = createTune(S, { lead: LEAD, roots: [36, 33, 29, 31, 36, 33, 38, 31], bass: [0, 12, 7, 12, 0, 12, 7, 10], beat: .2, leadType: .25,
    bassVol: .5, leadVol: .16, hatVol: .1, kickVol: .18 });
  return {
    init: S.init,
    close() { tune.set(false); S.close(); },
    music: (v) => tune.set(v),
    hurry: (v) => tune.hurry(v),
    tick: tune.tick,
    jump: (big) => tone(big ? 220 : 330, big ? 700 : 990, .16, { type: .5, vol: .3 }),
    coin: () => { seq([83, 88], .07, { type: .5, vol: .3 }); },
    stomp: () => { tone(420, 90, .12, { type: .5, vol: .4 }); noise(.08, { vol: .2, f: 900 }); },
    kick: () => tone(700, 300, .08, { type: .25, vol: .35 }),
    bump: () => tone(130, 90, .08, { type: 'tri', vol: .7 }),
    brick: () => { noise(.25, { vol: .5, f: 1200 }); tone(200, 60, .15, { type: 'tri', vol: .6 }); },
    sprout: () => tone(200, 700, .35, { type: .5, vol: .25, slide: 'lin' }),
    power: () => seq([60, 64, 67, 72, 64, 67, 72, 76, 67, 72, 76, 79], .045, { type: .25, vol: .3 }),
    shrink: () => seq([72, 67, 64, 60, 55, 52], .06, { type: .5, vol: .3 }),
    fire: () => tone(900, 200, .06, { type: .125, vol: .3 }),
    die: () => { tune.set(false); seq([71, 77, 0, 77, 77, 76, 74, 72, 64, 0, 64, 60], .12, { type: .5, vol: .3 }); },
    beep: (hi) => tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .35 : .12, { type: .5, vol: .3 }),
    flag: () => { tune.set(false); tone(1200, 200, .9, { type: .25, vol: .3 }); setTimeout(() => seq([67, 72, 76, 79, 84, 88, 0, 84, 0, 88, 91], .1, { type: .5, vol: .28 }), 900); },
    bop: () => tone(600, 900, .07, { type: .5, vol: .25 }),
    time: () => seq([84, 88, 91, 0, 84, 88, 91], .07, { type: .25, vol: .25 }),
  };
}
