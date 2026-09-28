// worms-sfx.js: the sounds of « taupes de guerre », on the shared synth (lib/sfx.js), its own context, quiet master.
import { createSynth } from './lib/sfx.js';
export function createSfx() {
  const S = createSynth({ vol: .12 });
  const ok = S.ok;
  const tone = (f, dur, type = 'sine', vol = .5, to = f, delay = 0) => S.blip(f, dur, { type, vol, to, at: delay });
  const hiss = (dur, f, vol = .5, to = f, type = 'lowpass', delay = 0, q = 1) => S.hiss(dur, f, { vol, to, type, at: delay, q });
  return {
    init: S.init,
    pause: S.pause,
    boom(v = 1) { if (!ok('boom', 60) || v < .04) return; hiss(.9 * Math.min(1.3, .6 + v * .5), 1100, .9 * Math.min(1, v), 50); tone(95, .6, 'sine', .8 * Math.min(1, v), 30); tone(60, .5, 'triangle', .4 * Math.min(1, v), 25, .03); },
    launch() { if (!ok('launch', 80)) return; hiss(.35, 3000, .5, 400, 'bandpass', 0, 1.5); tone(180, .25, 'sawtooth', .12, 90); },
    throw() { if (!ok('throw', 80)) return; hiss(.18, 1800, .35, 600, 'bandpass', 0, 2); },
    shot() { if (!ok('shot', 60)) return; hiss(.25, 4000, .9, 300); tone(140, .12, 'square', .3, 60); },
    bounce(v = 1) { if (!ok('bounce', 70)) return; tone(520 + Math.random() * 120, .06, 'triangle', .2 * v, 300); },
    splash() { if (!ok('splash', 120)) return; hiss(.6, 2400, .7, 300, 'lowpass'); tone(300, .25, 'sine', .15, 900); },
    jump() { if (!ok('jump', 150)) return; tone(300, .16, 'square', .1, 620); },
    step() { if (!ok('step', 170)) return; hiss(.04, 900, .12, 500, 'bandpass', 0, 3); },
    charge(p) { if (!ok('charge', 55)) return; tone(200 + p * 700, .06, 'square', .06, 220 + p * 700); },
    select() { if (!ok('select', 60)) return; tone(880, .05, 'square', .08, 1200); },
    tick(hi) { if (!ok('tick', 300)) return; tone(hi ? 1400 : 1000, .05, 'square', .1, hi ? 1400 : 1000); },
    turn(mine) { if (!ok('turn', 500)) return; (mine ? [660, 880, 1320] : [520, 660]).forEach((f, i) => tone(f, .14, 'triangle', .28, f, i * .09)); },
    hurt() { if (!ok('hurt', 90)) return; tone(760, .16, 'square', .1, 380); tone(560, .12, 'triangle', .14, 900, .08); },
    die() { if (!ok('die', 200)) return; [500, 420, 330, 250].forEach((f, i) => tone(f, .14, 'triangle', .22, f * .9, i * .1)); },
    pick() { if (!ok('pick', 200)) return; [784, 988, 1175, 1568].forEach((f, i) => tone(f, .1, 'square', .1, f, i * .06)); },
    fuse() { if (!ok('fuse', 90)) return; hiss(.08, 5000, .12, 3000, 'highpass'); },
    tele() { if (!ok('tele', 300)) return; tone(300, .4, 'sine', .25, 2400); tone(2400, .4, 'triangle', .1, 300, .1); },
    plane() { if (!ok('plane', 800)) return; tone(180, 1.2, 'sawtooth', .07, 120); hiss(1.2, 700, .2, 300); },
    sudden() { if (!ok('sudden', 1500)) return; [440, 415, 392, 370].forEach((f, i) => tone(f, .3, 'sawtooth', .14, f, i * .22)); },
    win() { if (!ok('win', 1500)) return; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? .7 : .16, 'triangle', .35, f, i * .13)); },
    lose() { if (!ok('lose', 1500)) return; [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? .6 : .2, 'triangle', .3, f * (i === 3 ? .8 : 1), i * .2)); },
  };
}
