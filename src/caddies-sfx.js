// caddies-sfx.js, the trolley race's sounds over the shared synth (lib/sfx.js): your wheels' rattle
// on the paving (a looped noise that follows your speed, rougher on the road), the squeaky caster,
// the kicks, the drift's squeal; the crashes, bumps, the baguette's swat, the melon's splat and the
// flour's puff, placed where they happen (lib/spatial.js) with the ears on the camera.
import { createSynth } from './lib/sfx.js';
import { listen, panner, place } from './lib/spatial.js';

export function createCaddieSfx() {
  const S = createSynth({ vol: .16 });
  let rattle = null, rGain = null, rFilt = null, squeal = null, sqGain = null, pans = [], pi = 0, squeakT = 0;
  function init() {
    const fresh = !S.ctx;
    S.init();
    const ctx = S.ctx;
    if (!ctx || !fresh) return;
    // the rattle: noise through a band, its level jittered every frame
    rattle = ctx.createBufferSource(); rattle.buffer = S.noiseBuf; rattle.loop = true;
    rFilt = ctx.createBiquadFilter(); rFilt.type = 'bandpass'; rFilt.frequency.value = 1400; rFilt.Q.value = .9;
    rGain = ctx.createGain(); rGain.gain.value = 0;
    rattle.connect(rFilt); rFilt.connect(rGain); rGain.connect(S.master); rattle.start();
    // the drift: a caster squealing, a high sine wobbling
    squeal = ctx.createOscillator(); squeal.type = 'sine'; squeal.frequency.value = 1900;
    sqGain = ctx.createGain(); sqGain.gain.value = 0;
    squeal.connect(sqGain); sqGain.connect(S.master); squeal.start();
    pans = Array.from({ length: 4 }, () => { const p = panner(ctx, { ref: 3, max: 60, roll: 1.2 }); p.connect(S.master); return p; });
  }
  // an out node: straight to the master (yours), or a panner put where it happens
  function at(p) {
    if (!p || !pans.length) return S.master;
    const pn = pans[pi]; pi = (pi + 1) % pans.length;
    place(S.ctx, pn, p.x, p.y ?? .5, p.z);
    return pn;
  }
  return {
    init,
    get ctx() { return S.ctx; },
    ears(camera) { if (S.running) listen(S.ctx, camera); },
    // every frame, your cart: speed (m/s), drifting, on the road, in the air, off the cart
    ride(speed, drift = false, rough = false, air = false, off = false, dt = .016) {
      if (!S.running || !rGain) return;
      const t = S.ctx.currentTime, k = off || air ? 0 : Math.min(1, speed / 7);
      rGain.gain.setTargetAtTime(k * (rough ? .5 : .32) * (.55 + Math.random() * .9), t, .02);
      rFilt.frequency.setTargetAtTime((rough ? 700 : 1100) + speed * 180, t, .05);
      sqGain.gain.setTargetAtTime(drift && !off ? .05 + Math.min(.05, speed * .008) : 0, t, .04);
      squeal.frequency.setTargetAtTime(1700 + Math.sin(t * 23) * 180 + speed * 40, t, .02);
      // the one wheel that squeaks, more often the faster
      squeakT -= dt * speed;
      if (squeakT <= 0 && speed > 1.5 && !off && !air) { squeakT = 3 + Math.random() * 6; this.squeak(); }
    },
    squeak(p) { const o = at(p); S.blip(2100 + Math.random() * 500, .09, { type: 'sine', vol: .12, to: 2600, out: o }); S.blip(1800, .07, { type: 'sine', vol: .08, at: .08, to: 2300, out: o }); },
    // a kick on the paving; `sweet`: in rhythm (a bright ding over it)
    kick(sweet = false, combo = 0, p) {
      const o = at(p);
      S.hiss(.09, 2400, { vol: .35, to: 900, type: 'bandpass', out: o });
      S.blip(90, .1, { type: 'sine', vol: .4, to: 60, out: o });
      if (sweet && !p) { S.blip(880 * Math.pow(2, combo / 6), .14, { type: 'triangle', vol: .22 }); S.blip(1320 * Math.pow(2, combo / 6), .16, { type: 'sine', vol: .16, at: .05 }); }
    },
    // a drift let go well: a whoosh up
    boost() { S.hiss(.35, 600, { vol: .3, to: 3200, type: 'bandpass', q: 2 }); S.blip(440, .25, { type: 'triangle', vol: .15, to: 880 }); },
    // metal on metal, on stone: a clang and a rattle
    bump(v = 1, p) {
      if (!S.ok('bump' + (p ? 'x' : ''), 90)) return;
      const o = at(p), k = Math.min(1, v / 5);
      S.blip(160 + Math.random() * 60, .12, { type: 'triangle', vol: .25 + k * .3, to: 90, out: o });
      S.hiss(.15 + k * .1, 3200, { vol: .2 + k * .3, to: 1200, type: 'bandpass', q: 3, out: o });
    },
    crash(p) {
      const o = at(p);
      S.hiss(.6, 3000, { vol: .6, to: 500, type: 'bandpass', q: 1.5, out: o });
      for (let k = 0; k < 4; k++) S.blip(300 + Math.random() * 900, .25, { type: 'square', vol: .06, at: k * .05, to: 150 + Math.random() * 200, out: o });
      S.blip(110, .3, { type: 'sine', vol: .5, to: 50, out: o });
    },
    kerb(v = 1) { S.blip(120, .08, { type: 'sine', vol: .25 + Math.min(.3, v * .05), to: 70 }); S.hiss(.12, 1800, { vol: .25, to: 700 }); },
    swat(p) { const o = at(p); S.hiss(.18, 900, { vol: .4, to: 3000, type: 'bandpass', out: o }); S.hiss(.08, 2500, { vol: .5, at: .15, type: 'lowpass', out: o }); S.blip(220, .08, { type: 'triangle', vol: .3, at: .15, to: 120, out: o }); },
    splat(p) { const o = at(p); S.hiss(.35, 900, { vol: .6, to: 200, type: 'lowpass', out: o }); S.blip(80, .2, { type: 'sine', vol: .5, to: 45, out: o }); },
    roll(p) { const o = at(p); S.blip(70, .15, { type: 'sine', vol: .25, to: 60, out: o }); },
    flour(p) { const o = at(p); S.hiss(.7, 5000, { vol: .45, to: 600, type: 'highpass', out: o }); S.blip(140, .12, { type: 'sine', vol: .25, to: 80, out: o }); },
    pickup() { S.seq([72, 76, 79, 84], .06, { type: .25, vol: .25 }); },
    // the rider hitting the paving, a groan
    tumble(p) { const o = at(p); S.blip(95, .25, { type: 'sine', vol: .5, to: 55, out: o }); S.blip(260, .35, { type: 'saw', vol: .06, at: .1, to: 170, out: o }); },
    quiet() { if (!S.ctx || !rGain) return; const t = S.ctx.currentTime; rGain.gain.setTargetAtTime(0, t, .05); sqGain.gain.setTargetAtTime(0, t, .05); },
    pause() { this.quiet(); },
    close() { S.close(); rattle = rGain = rFilt = squeal = sqGain = null; pans = []; },
  };
}
