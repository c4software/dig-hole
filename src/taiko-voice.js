// taiko-voice.js, the matsuri stage's sound: the big drum (don on the skin, ka on the rim), the
// little shime-daiko, the hand gong, the bamboo flute, all WebAudio, and a piece played whole.
// It sounds from the stage: through a lowpass and a panner of its own, placed at the drum and
// heard from the camera (spatialize, below), loud on the stage, fading across the town, muffled
// indoors and underground, silent on the other worlds. The rhythm game borrows a dry bus (lend).
import { SONGS, makeChart } from './taiko-songs.js';
import { listen, panner, place } from './lib/spatial.js';

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createTaikoVoice({ at }) {
  let ctx = null, noise = null, spatIn = null, lp = null, pan = null, dist = null, dry = null, lent = false;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
    // a short outdoor echo off the houses
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 1.1, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let n = 0; n < len; n++) x[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 3.2); }
    rev.buffer = ir;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.connect(ctx.destination);
    // the stage's own chain: in → (dry + echo) → lowpass → panner → distance gain → out
    spatIn = ctx.createGain();
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 14000; lp.Q.value = .5;
    const wet = ctx.createGain(); wet.gain.value = .22;
    spatIn.connect(lp); spatIn.connect(rev); rev.connect(wet); wet.connect(lp);
    // the shared panner for left/right; the fading with distance is ours (below), heard across the town
    pan = panner(ctx, { ref: 1, max: 1e4, roll: 0 });
    place(ctx, pan, at.x, at.y + 1, at.z);
    dist = ctx.createGain(); dist.gain.value = 0;
    lp.connect(pan); pan.connect(dist); dist.connect(comp);
    // the rhythm game's bus: straight to the ears, a touch of the echo
    dry = ctx.createGain(); dry.gain.value = 0;
    const dwet = ctx.createGain(); dwet.gain.value = .15;
    dry.connect(comp); dry.connect(rev); rev.connect(dwet); dwet.connect(comp);
    return ctx;
  }
  const resume = () => { if (ctx?.state === 'suspended') ctx.resume(); };

  // ---------- the voices ----------
  function env(t, peak, attack, decay, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0008, t + attack + decay);
    g.connect(dest);
    return g;
  }
  function tone(type, f0, f1, glide, t, peak, decay, dest) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    o.connect(env(t, peak, .002, decay, dest)); o.start(t); o.stop(t + decay + .05);
  }
  function hiss(type, f, q, t, peak, decay, dest) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); fl.connect(env(t, peak, .001, decay, dest)); s.start(t, Math.random() * .5); s.stop(t + decay + .05);
  }
  // kind: d don, k ka, D big don, K big ka, s shime, c the gong
  function hit(kind, t = ctx?.currentTime, vel = 1, dest = spatIn) {
    if (!ensure()) return;
    resume();
    t = Math.max(t ?? 0, ctx.currentTime);
    const v = vel;
    if (kind === 'd' || kind === 'D') {
      const big = kind === 'D' ? 1 : 0;
      tone('sine', 150 - big * 25, 58 - big * 10, .14, t, .95 * v * (1 + big * .3), .7 + big * .6, dest);
      tone('triangle', 215, 105, .1, t, .22 * v, .2 + big * .15, dest);
      hiss('lowpass', 900, .7, t, .5 * v, .08, dest);
      if (big) tone('sine', 72, 40, .5, t, .45 * v, 1.2, dest);
    } else if (kind === 'k' || kind === 'K') {
      const big = kind === 'K' ? 1.35 : 1;
      hiss('bandpass', 3200, 1.6, t, .55 * v * big, .035, dest);
      tone('triangle', 1180, 1100, .04, t, .3 * v * big, .05, dest);
      tone('sine', 640, 600, .03, t, .22 * v * big, .045, dest);
    } else if (kind === 's') {
      tone('sine', 430, 330, .05, t, .32 * v, .16, dest);
      hiss('highpass', 2200, .8, t, .18 * v, .03, dest);
    } else if (kind === 'c') {
      [[1, .16], [2.64, .1], [3.92, .08], [5.43, .06], [8.1, .035]].forEach(([k, a]) => tone('sine', 1040 * k, 1040 * k * .995, .3, t, a * v, .3, dest));
      hiss('highpass', 6000, .7, t, .07 * v, .02, dest);
    }
  }
  // the shinobue: a breathy sine, a little scoop up into the note, vibrato once it's held
  function flute(m, t, dur, vel = 1, dest = spatIn) {
    if (!ensure()) return;
    t = Math.max(t, ctx.currentTime);
    const f = hz(m), end = t + dur;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.075 * vel, t + .05); g.gain.setValueAtTime(.075 * vel, Math.max(t + .05, end - .06)); g.gain.linearRampToValueAtTime(0, end + .05);
    g.connect(dest);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * .97, t); o.frequency.exponentialRampToValueAtTime(f, t + .06);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .012, t + Math.min(.4, dur));
    lfo.connect(lg); lg.connect(o.frequency);
    const o2 = ctx.createOscillator(); o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = .12; o2.connect(g2); g2.connect(g);
    o.connect(g);
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f; bf.Q.value = 6;
    const bg = ctx.createGain(); bg.gain.value = .5; s.connect(bf); bf.connect(bg); bg.connect(g);
    for (const n of [o, o2, lfo, s]) { n.start(t); n.stop(end + .1); }
  }

  // ---------- a piece, whole: the drum part, the shime, the gong and the flute ----------
  let playing = null;
  function play(song, offset = 0) {
    if (!ensure()) return;
    resume();
    stop();
    const C = makeChart(song, 'expert');
    const bus = ctx.createGain(); bus.connect(spatIn);
    playing = { song, C, bus, t0: ctx.currentTime + .05 - offset, i: 0, j: 0, until: performance.now() / 1000 + C.length - offset + 1 };
    feed();
  }
  // notes go to the audio clock a second ahead
  function feed() {
    const P = playing;
    if (!P || !ctx) return;
    const now = ctx.currentTime;
    for (; P.i < P.C.gems.length; P.i++) {
      const q = P.C.gems[P.i], s = P.t0 + q.t;
      if (s > now + 1) break;
      if (s < now - .05) continue;
      if (q.kind === 'r') for (let k = 0; k * .075 < q.len; k++) hit('d', s + k * .075, .55, P.bus);
      else hit(q.big ? q.kind.toUpperCase() : q.kind, s, 1, P.bus);
    }
    for (; P.j < P.C.accomp.length; P.j++) {
      const [t, v, m, l] = P.C.accomp[P.j], s = P.t0 + t;
      if (s > now + 1) break;
      if (s < now - .05) continue;
      if (v === 'f') flute(m, s, l * .95, 1, P.bus); else hit(v, s, v === 'c' ? .8 : .7, P.bus);
    }
  }
  function stop() {
    if (!playing) return;
    const b = playing.bus; playing = null;
    b.gain.setTargetAtTime(0, ctx.currentTime, .06);
    setTimeout(() => b.disconnect(), 500);
  }

  // ---------- where it's heard from ----------
  // the ears on the camera (lib/spatial.js), then how far, indoors, underground;
  // opts.on false on another world
  function spatialize(ear, { on = true, indoor = false, under = false } = {}) {
    if (!ctx) return;
    listen(ctx, ear);
    const p = ear.position, t = ctx.currentTime;
    const d = Math.hypot(p.x - at.x, p.y - at.y - 1, p.z - at.z);
    let g = d < 6 ? 1 : Math.pow(Math.max(0, 1 - (d - 6) / 150), 1.6);
    let f = 14000 * (1 - Math.min(d, 150) / 150 * .75);
    if (indoor) { f = Math.min(f, 650); g *= .7; }
    if (under) { f = Math.min(f, 380); g *= .55; }
    if (!on) g = 0;
    dist.gain.setTargetAtTime(g, t, .08);
    lp.frequency.setTargetAtTime(f, t, .08);
  }
  return {
    ensure, hit, flute, play, stop, spatialize, at,
    get playing() { return !!playing; }, get song() { return playing ? playing.song : -1; },
    get ctx() { return ctx; }, get spatIn() { return spatIn; },
    // the rhythm game's own bus, straight to the ears (the stage's chain goes quiet meanwhile)
    lend(on) {
      lent = on;
      if (!ensure()) return null;
      resume();
      dry.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .05);
      if (on) stop();
      return on ? { ctx, out: dry, hit: (k, t, v) => hit(k, t, v, dry), flute: (m, t, d, v) => flute(m, t, d, v, dry) } : null;
    },
    get lent() { return lent; },
    update(ear, opts) {
      if (playing && performance.now() / 1000 > playing.until) playing = null;
      feed();
      if (ear) spatialize(ear, lent ? { ...opts, on: false } : opts);
    },
  };
}

export { SONGS };
