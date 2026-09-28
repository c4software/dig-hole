// encre-sfx.js: the sounds of « encre 2D », on the shared synth (lib/sfx.js), its own context, quiet master.
import { createSynth } from './lib/sfx.js';
export function createSfx() {
  const S = createSynth({ vol: .12 });
  const ok = S.ok;
  const tone = (f, dur, type = 'sine', vol = .5, to = f, delay = 0) => S.blip(f, dur, { type, vol, to, at: delay });
  const hiss = (dur, f, vol = .5, to = f, type = 'lowpass', delay = 0, q = 1) => S.hiss(dur, f, { vol, to, type, at: delay, q });
  return {
    init: S.init,
    pause: S.pause,
    shoot(v = 1) { if (!ok('shoot', 60)) return; hiss(.07, 2600, .35 * v, 900, 'bandpass', 0, 2); tone(520 + Math.random() * 80, .06, 'square', .08 * v, 260); },
    splat(v = 1) { if (!ok('splat', 45) || v < .05) return; hiss(.16, 1400, .5 * v, 180); tone(170 + Math.random() * 60, .1, 'sine', .25 * v, 70); },
    boom(v = 1) { if (!ok('boom', 80)) return; hiss(.5, 900, .9 * v, 60); tone(110, .4, 'sine', .7 * v, 35); },
    swim() { if (!ok('swim', 110)) return; tone(300 + Math.random() * 400, .07, 'sine', .12, 700 + Math.random() * 500); },
    hit() { if (!ok('hit', 70)) return; tone(880, .05, 'square', .12, 440); hiss(.08, 3000, .2, 1500, 'highpass'); },
    hurt() { if (!ok('hurt', 120)) return; tone(220, .12, 'sawtooth', .2, 110); },
    splatted() { if (!ok('splatted', 300)) return; hiss(.6, 2000, .9, 100); tone(600, .5, 'sawtooth', .25, 60); tone(90, .5, 'sine', .6, 40, .05); },
    beep(hi) { if (!ok('beep' + hi, 300)) return; tone(hi ? 1320 : 660, hi ? .45 : .16, 'square', .22, hi ? 1320 : 660); },
    special() { if (!ok('special', 300)) return; [0, .06, .12, .18].forEach((d, i) => tone(400 + i * 200, .18, 'triangle', .3, 900 + i * 200, d)); },
    ready() { if (!ok('ready', 500)) return; tone(880, .12, 'triangle', .3, 880); tone(1320, .2, 'triangle', .3, 1320, .1); },
    whistle() { if (!ok('whistle', 800)) return; tone(2100, .6, 'square', .12, 1900); tone(2140, .6, 'sine', .15, 1950); },
    tick() { if (!ok('tick', 50)) return; tone(1500, .03, 'square', .07, 1500); },
    win() { if (!ok('win', 1500)) return; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? .7 : .16, 'triangle', .35, f, i * .13)); },
    lose() { if (!ok('lose', 1500)) return; [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? .6 : .2, 'triangle', .3, f * (i === 3 ? .8 : 1), i * .2)); },
  };
}
