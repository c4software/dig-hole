// blocus-sfx.js, what the blockade sounds like, all WebAudio: a crowd chanting « on lâche rien ! »
// (six voices through two formant filters: vowels, no words spoken by a machine), a big drum,
// whistles, cheers; the police's shields banged together; firework mortars (the fwoosh, the
// whistle, the bang, the crackle); the foam balls' « poc »; the smoke's hiss, the cough.
// Every sound comes from a place (lib/spatial.js) and carries only so far (blocus-hear.js): sharp
// up close, duller and fainter with distance, silent past its range, a bang heard late; muffled
// through walls, silent down the hole and on the other worlds.
import { createSynth } from './lib/sfx.js';
import { listen, panner, place } from './lib/spatial.js';
import { gainAt, lowpassAt, delayAt } from './blocus-hear.js';

// the chant: syllable, start (beats), length (beats), formants F1 F2, pitch (×), consonant
const CHANT = [
  ['on', 0, .8, 460, 820, 1, null], ['lâ', 1, .8, 760, 1180, 1.12, 'l'],
  ['che', 2, .8, 520, 1560, 1.06, 'ch'], ['rien', 3, 1.6, 380, 2050, 1.2, 'r'],
];
const BEAT = .3;              // a syllable
const CYCLE = 6;              // beats a line (two for the drum)

export function createBlocusSfx() {
  const S = createSynth({ vol: .9 });
  let ctx = null, lp = null, out = null, crowd = null, police = null, spots = [], spotI = 0;
  let voice = null, nextLine = 0, lines = 0, whistleT = 2, murmur = null, on = false;
  let cheerT = 0, ears = false;
  const ear = { x: 0, y: 0, z: 0 };

  function ensure() {
    S.init();
    if (!S.ctx || ctx) return !!ctx;
    ctx = S.ctx;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = .4;
    out = ctx.createGain(); out.gain.value = 0;
    lp.connect(out); out.connect(S.master);
    // a place: its own air (a lowpass), left or right (the panner), its own distance (a gain)
    const spot = () => {
      const g = ctx.createGain(), air = ctx.createBiquadFilter(), p = panner(ctx, { ref: 1, max: 1e4, roll: 0 }), dist = ctx.createGain();
      air.type = 'lowpass'; air.frequency.value = 16000; dist.gain.value = 0;
      g.connect(air); air.connect(p); p.connect(dist); dist.connect(lp);
      return { g, air, p, dist };
    };
    crowd = spot(); police = spot();
    spots = Array.from({ length: 10 }, spot);
    // the crowd's voices: saws around two pitches (low and high voices), always running, gated
    voice = { g: ctx.createGain(), f1: ctx.createBiquadFilter(), f2: ctx.createBiquadFilter(), osc: [] };
    voice.g.gain.value = 0;
    for (const f of [voice.f1, voice.f2]) { f.type = 'bandpass'; f.Q.value = 5; voice.g.connect(f); f.connect(crowd.g); }
    voice.f1.frequency.value = 500; voice.f2.frequency.value = 1500;
    const f2g = ctx.createGain(); f2g.gain.value = .6; voice.f2.disconnect(); voice.f2.connect(f2g); f2g.connect(crowd.g);
    for (let k = 0; k < 7; k++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const base = k < 4 ? 125 + k * 9 : 215 + (k - 4) * 13;
      o.frequency.value = base; o.base = base;
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4 + Math.random() * 2; vg.gain.value = base * .012; vib.connect(vg); vg.connect(o.frequency); vib.start();
      const g = ctx.createGain(); g.gain.value = .13;
      o.connect(g); g.connect(voice.g); o.start();
      voice.osc.push(o);
    }
    // a murmur under it all
    const src = ctx.createBufferSource(); src.buffer = S.noiseBuf; src.loop = true;
    const mf = ctx.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 650; mf.Q.value = .8;
    murmur = ctx.createGain(); murmur.gain.value = 0;
    src.connect(mf); mf.connect(murmur); murmur.connect(crowd.g); src.start();
    return true;
  }
  // how far from the ears
  const far = (x, y, z) => Math.hypot(x - ear.x, y - ear.y, z - ear.z);
  // set a place for a sound of `kind` at d metres
  function tune(s, d, kind, now = false) {
    const g = ears ? gainAt(d, kind) : 0, f = lowpassAt(d, kind), t = ctx.currentTime;
    if (now) { s.dist.gain.cancelScheduledValues(t); s.dist.gain.setValueAtTime(g, t); s.air.frequency.setValueAtTime(f, t); }
    else { s.dist.gain.setTargetAtTime(g, t, .15); s.air.frequency.setTargetAtTime(f, t, .15); }
    return g;
  }
  // a place for a one-off, where it happens: null if it's out of earshot; `late`: the sound's delay
  function at(x, y, z, kind) {
    const d = far(x, y, z);
    if (!ears || gainAt(d, kind) <= 0) return null;
    const s = spots[spotI]; spotI = (spotI + 1) % spots.length;
    place(ctx, s.p, x, y, z); tune(s, d, kind, true);
    return { out: s.g, late: kind === 'bang' || kind === 'launch' ? delayAt(d) : 0 };
  }

  // ---------- the voices of the street ----------
  function syllable(t, [, , len, F1, F2, pitch, cons], loud) {
    const d = len * BEAT;
    if (cons === 'ch') S.hiss(.09, 3200, { type: 'highpass', vol: .5 * loud, at: t - ctx.currentTime, out: crowd.g });
    if (cons === 'r') S.hiss(.07, 700, { type: 'lowpass', vol: .5 * loud, at: t - ctx.currentTime, out: crowd.g });
    const g = voice.g.gain;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(.9 * loud, t + .04); g.setValueAtTime(.9 * loud, t + d * .7); g.linearRampToValueAtTime(0, t + d * .95);
    voice.f1.frequency.setTargetAtTime(F1, t, .02); voice.f2.frequency.setTargetAtTime(F2, t, .02);
    for (const o of voice.osc) { o.frequency.setTargetAtTime(o.base * pitch, t, .03); if (pitch > 1.15) o.frequency.setTargetAtTime(o.base * 1.05, t + d * .5, .08); }
  }
  function drum(t, v = 1, dest = crowd.g) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + .25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.1 * v, t + .005); g.gain.exponentialRampToValueAtTime(.001, t + .45);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + .5);
    S.hiss(.05, 1600, { vol: .35 * v, at: t - ctx.currentTime, out: dest });
  }
  function whistle(t) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    const f = 2500 + Math.random() * 700, d = .25 + Math.random() * .5;
    o.frequency.value = f; lfo.frequency.value = 22 + Math.random() * 8; lg.gain.value = f * .05; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .02); g.gain.setValueAtTime(.16, t + d); g.gain.linearRampToValueAtTime(0, t + d + .05);
    o.connect(g); g.connect(crowd.g); o.start(t); lfo.start(t); o.stop(t + d + .1); lfo.stop(t + d + .1);
  }
  // a cheer: many voices sliding up on « ouais »
  function cheer(t, v = 1) {
    const g = voice.g.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(1.1 * v, t + .12); g.setValueAtTime(1.1 * v, t + .6); g.linearRampToValueAtTime(0, t + 1.1);
    voice.f1.frequency.setValueAtTime(420, t); voice.f1.frequency.linearRampToValueAtTime(720, t + .5);
    voice.f2.frequency.setValueAtTime(900, t); voice.f2.frequency.linearRampToValueAtTime(1900, t + .8);
    for (const o of voice.osc) { o.frequency.setValueAtTime(o.base * 1.1, t); o.frequency.linearRampToValueAtTime(o.base * 1.4, t + .5); o.frequency.linearRampToValueAtTime(o.base, t + 1.1); }
    S.hiss(.9, 1200, { type: 'bandpass', vol: .5 * v, at: t - ctx.currentTime, out: crowd.g });
    nextLine = Math.max(nextLine, t + 1.3);
  }

  return {
    ensure,
    get ready() { return !!ctx; },
    // each frame: where the ears are, the crowd and the police, what the crowd is up to
    //   mood: 'chant' | 'hoot' | 'murmur'; hear: blocus-hear.js hearing() { on, lp }
    update(dt, camera, { active, crowdAt, policeAt, mood = 'chant', hear = { on: true, lp: 16000 } }) {
      if (!ctx) return;
      const t = ctx.currentTime;
      on = active; ears = hear.on;
      const e = camera.matrixWorld.elements; ear.x = e[12]; ear.y = e[13]; ear.z = e[14];
      out.gain.setTargetAtTime(ears ? 1 : 0, t, .2);
      lp.frequency.setTargetAtTime(hear.lp, t, .1);
      listen(ctx, camera);
      place(ctx, crowd.p, crowdAt.x, 1.6, crowdAt.z);
      place(ctx, police.p, policeAt.x, 1.2, policeAt.z);
      const gc = active ? tune(crowd, far(crowdAt.x, 1.6, crowdAt.z), 'crowd') : tune(crowd, 1e9, 'crowd');
      tune(police, active ? far(policeAt.x, 1.2, policeAt.z) : 1e9, 'police');
      if (!active || gc <= 0) { murmur.gain.setTargetAtTime(0, t, .3); nextLine = t + .5; return; }
      murmur.gain.setTargetAtTime(mood === 'murmur' ? .16 : .07, t, .5);
      // the chant, a line at a time, a little ahead; the drum on « on » and « rien »
      if (nextLine < t) nextLine = t + .1;
      while (nextLine < t + .4) {
        const t0 = nextLine;
        if (mood === 'chant') {
          const loud = .75 + (lines % 3 === 2 ? .25 : 0);
          for (const s of CHANT) syllable(t0 + s[1] * BEAT, s, loud);
          drum(t0, .9); drum(t0 + 3 * BEAT, 1); drum(t0 + 4.5 * BEAT, .6); drum(t0 + 5 * BEAT, .7);
        } else if (mood === 'hoot') {
          // « ouh ! ouh ! » with the drum, faster
          for (let k = 0; k < 3; k++) syllable(t0 + k * 2 * BEAT, ['ouh', 0, 1, 330, 700, 1.1, null], .9);
          for (let k = 0; k < 6; k++) drum(t0 + k * BEAT, k % 2 ? .6 : 1);
        } else {
          drum(t0, .7); drum(t0 + 2 * BEAT, .5); drum(t0 + 3 * BEAT, .5);
        }
        lines++;
        nextLine = t0 + CYCLE * BEAT;
      }
      whistleT -= dt;
      if (whistleT <= 0) { whistleT = .8 + Math.random() * 3.5; whistle(t + .05); if (Math.random() < .35) whistle(t + .3); }
      cheerT = Math.max(0, cheerT - dt);
    },
    // the police's shields, all together
    bang(x, z) {
      if (!ctx || !on) return;
      const p = at(x, 1.1, z, 'police'); if (!p) return;
      for (let k = 0; k < 3; k++) {
        S.hiss(.12, 800 + k * 150, { type: 'bandpass', q: 2.5, vol: .7, at: k * .012, out: p.out });
        S.blip(170 + k * 20, .14, { type: 'triangle', vol: .45, at: k * .012, out: p.out });
      }
    },
    // a mortar's launch: the fwoosh, the rising whistle
    launch(x, z, fl, y = 1, mine = false) {
      if (!ctx || (!on && !mine)) return;
      const p = at(x, y, z, 'launch'); if (!p) return;
      S.hiss(.35, 900, { type: 'bandpass', to: 3200, vol: 1, q: 1.2, at: p.late, out: p.out });
      S.blip(1300, fl * .8, { to: 2600, vol: .12, attack: .1, at: p.late, out: p.out });
      S.blip(80, .15, { type: 'sine', vol: .5, to: 40, at: p.late, out: p.out });
    },
    // the burst: a bang (late, if far), then the crackle; the crowd cheers
    burst(x, y, z, mine = false) {
      if (!ctx || (!on && !mine)) return;
      const p = at(x, y, z, 'bang'); if (!p) return;
      const d = p.out, late = p.late;
      S.hiss(1.4, 1800, { to: 180, vol: 1.6, at: late, out: d });
      S.blip(70, .7, { to: 32, vol: 1.2, at: late, out: d });
      for (let k = 0; k < 14; k++) S.hiss(.03, 3000 + Math.random() * 3000, { type: 'bandpass', q: 3, vol: .35 + Math.random() * .3, at: late + .3 + Math.random() * 1.1, out: d });
      if (!mine && cheerT <= 0 && far(x, y, z) < 90) { cheerT = 3; cheer(ctx.currentTime + late + .5, .9); }
    },
    // the launcher's « pomp », then the « poc » where the ball lands
    shot(x, z) {
      if (!ctx || !on) return;
      const p = at(x, 1.3, z, 'poc'); if (!p) return;
      S.blip(190, .12, { to: 70, vol: .9, out: p.out }); S.hiss(.07, 1300, { vol: .5, out: p.out });
    },
    poc(x, y, z, close = false) {
      if (!ctx) return;
      const p = close ? { out: S.master } : at(x, y, z, 'poc'); if (!p) return;
      const d = p.out, v = close ? .5 : 1;
      S.blip(1050, .06, { to: 380, vol: .8 * v, out: d }); S.hiss(.02, 4000, { type: 'highpass', vol: .5 * v, out: d });
    },
    // the canister: a long hiss
    smoke(x, z) {
      if (!ctx || !on) return;
      const p = at(x, .3, z, 'poc'); if (!p) return;
      const d = p.out;
      S.hiss(3.5, 3500, { type: 'highpass', to: 2500, vol: .5, out: d });
    },
    // a fire's crackle, now and then
    crackle(x, y, z) {
      if (!ctx || !on) return;
      const p = at(x, y, z, 'poc'); if (!p) return;
      const d = p.out;
      for (let k = 0; k < 3; k++) S.hiss(.02, 2200 + Math.random() * 2500, { type: 'bandpass', q: 2, vol: .25 + Math.random() * .3, at: Math.random() * .25, out: d });
    },
    // me, coughing in the smoke (in my own head: no place)
    cough() {
      if (!ctx) return;
      for (let k = 0; k < 3; k++) {
        const a = k * .26 + Math.random() * .05;
        S.hiss(.16, 900, { type: 'bandpass', q: 1.2, vol: .5, at: a, out: S.master });
        S.blip(160 - k * 10, .14, { type: 'sawtooth', vol: .08, at: a, to: 110, out: S.master });
      }
    },
    close() { S.close(); ctx = null; },
  };
}
