// scream.js, the cartoon scream of someone falling down the hole: a vocal formant synth (a
// sawtooth and some breath through the bandpass formants of an « a »), the pitch contour of the
// classic film scream, a voice of its own per player. Heard where the body is (a panner that follows it,
// a little doppler as it drops away), cut by a thud on landing or a splash in water.
// createFallWatch() decides when a fall is worth a scream (pure: tested in node).
import { panner, place } from './lib/spatial.js';

// ---------- when: a fall of a few metres, or a short one over a deep shaft ----------
export const FALL = { start: 3, fast: 6, shaft: 8, shaftStart: 1.2, cool: 3, teleport: 6 };

// step(s) once per frame, s: { dt, y, vy, ground, jet, ladder, lift, water, glide, active, drop?() }
// → 'start' | 'land' | 'water' | 'cut' | null
export function createFallWatch(o = FALL) {
  let peak = null, on = false, coolT = 0, lastY = null;
  const end = (r) => { on = false; peak = null; coolT = o.cool; return r; };
  return {
    get on() { return on; },
    step(s) {
      coolT = Math.max(0, coolT - (s.dt || 0));
      // a jump in height from one frame to the next is a teleport (r, a portal, a trip)
      const jump = lastY != null && Math.abs(s.y - lastY) > o.teleport;
      lastY = s.y;
      if (!s.active || jump) { peak = null; return on ? end('cut') : null; }
      if (on) {
        if (s.water) return end('water');
        if (s.ground) return end('land');
        if (s.jet || s.ladder || s.lift || s.glide || s.vy > .5) return end('cut');
        return null;
      }
      if (s.ground || s.ladder || s.lift || s.water || s.jet || s.glide) { peak = null; return null; }
      if (peak == null || s.y > peak) peak = s.y;
      if (coolT > 0 || s.vy > -o.fast) return null;
      const fallen = peak - s.y;
      if (fallen >= o.start || (fallen >= o.shaftStart && s.drop && s.drop() >= o.shaft)) { on = true; return 'start'; }
      return null;
    },
  };
}

// ---------- a voice per player: the same seed, the same scream everywhere ----------
// f0: the top of the yelp (a strained male voice), size: the formants (throat), small spreads
// only: every scream is recognisably the same one, just not quite
export function voiceOf(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { f0: 560 + r() * 200, size: .92 + r() * .16, vib: 5.5 + r() * 2, depth: .02 + r() * .02, fry: 32 + r() * 14 };
}

// the open « a », strained and a little nasal: F1, F2, F3, a nasal ring; (Hz, Q, level)
const FORMANTS = [[780, 6, 1], [1180, 8, .6], [2550, 10, .32], [3300, 14, .12]];
const SOUND = 343;

// audio: audio.js (ctx, out, noiseBuf once started)
export function createScreamer(audio) {
  const live = new Set();
  // the recorded scream (assets/wilhelmscream.mp3, made for the game): fetched with the page, decoded
  // as soon as the sound is on (the first click); until then (or if it fails) the synthesised one stands in
  let clip = null, raw = null, decoding = false;
  fetch(new URL('../assets/wilhelmscream.mp3', import.meta.url))
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status)))
    .then(a => { raw = a; load(); })
    .catch(e => { console.warn('cri de chute : fichier indisponible, voix de synthèse', e?.message || e); });
  function load() {
    if (clip || decoding || !raw || !audio.ctx) return;
    decoding = true;
    audio.ctx.decodeAudioData(raw).then(b => { clip = b; raw = null; })
      .catch(e => { decoding = false; raw = null; console.warn('cri de chute : décodage raté, voix de synthèse', e?.message || e); });
  }

  // the clip, a touch higher or lower per player (the same seed, the same voice everywhere)
  function startClip(v, pos, local, vol) {
    const ctx = audio.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = clip;
    src.playbackRate.value = .88 + (v.f0 - 560) / 200 * .22;
    const env = ctx.createGain();
    env.gain.value = (local ? .45 : 1) * vol;
    src.connect(env);
    const nodes = [src, env];
    let pan = null;
    if (local || !pos) env.connect(audio.out);
    else { pan = panner(ctx, { ref: 2.5, max: 120, roll: 1.1 }); env.connect(pan); pan.connect(audio.out); nodes.push(pan); }
    src.start(t);
    const h = { osc: src, env, pan, pos, nodes, srcs: [src], t0: t, dist: null, vr: 0, last: null, done: false, end: (kind) => end(h, kind) };
    if (pan) move(h, 0, null);
    live.add(h);
    return h;
  }

  // pos(): where the body is now ({x,y,z}, or null: gone); local: my own voice, in the head.
  // A Wilhelm-style imitation (synthesised, no sample): a sharp strained attack jumping up, a
  // crack, a second yelp, the « aaah-ah » falling away with a bit of fry, then a long fading
  // « aaa… » for as deep as the hole goes
  function start({ seed = 1, pos = null, local = false, vol = 1 } = {}) {
    const ctx = audio.ctx;
    if (!ctx || !audio.out) return null;
    load();
    if (clip) return startClip(voiceOf(seed), pos, local, vol);
    const v = voiceOf(seed), t = ctx.currentTime, F = v.f0;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const f = osc.frequency;
    f.setValueAtTime(F * .62, t);
    f.linearRampToValueAtTime(F, t + .07);                 // the jump up
    f.linearRampToValueAtTime(F * .94, t + .3);            // strained, sagging
    f.setValueAtTime(F * .7, t + .33);                     // the crack
    f.linearRampToValueAtTime(F * .98, t + .45);           // the second yelp
    f.exponentialRampToValueAtTime(F * .46, t + 1.15);     // « aaah-ah » down
    f.exponentialRampToValueAtTime(F * .4, t + 1.3);
    f.setValueAtTime(F * .5, t + 1.38);                    // a breath, and the long fall
    f.exponentialRampToValueAtTime(F * .3, t + 5.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = v.vib;
    const lg = ctx.createGain(); lg.gain.value = F * v.depth;
    lfo.connect(lg); lg.connect(f);
    const sum = ctx.createGain(); sum.gain.value = 1;
    const nodes = [osc, lfo, lg, sum], srcs = [osc, lfo];
    for (const [hz, q, g] of FORMANTS) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz * v.size; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = g * 4;
      osc.connect(bp); bp.connect(bg); bg.connect(sum);
      nodes.push(bp, bg);
    }
    // breath in the throat
    if (audio.noiseBuf) {
      const n = ctx.createBufferSource(); n.buffer = audio.noiseBuf; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400 * v.size; nf.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = .35;
      n.connect(nf); nf.connect(ng); ng.connect(sum);
      n.start(t); n.stop(t + 6.5);
      nodes.push(n, nf, ng); srcs.push(n);
    }
    // vocal fry at the end of the phrase: the voice chopped at a few tens of Hz
    const fry = ctx.createGain(); fry.gain.value = 1;
    const fo = ctx.createOscillator(); fo.type = 'square'; fo.frequency.value = v.fry;
    const fd = ctx.createGain(); fd.gain.setValueAtTime(0, t);
    fd.gain.setValueAtTime(0, t + 1);
    fd.gain.linearRampToValueAtTime(.7, t + 1.25);
    fd.gain.linearRampToValueAtTime(0, t + 1.4);
    fo.connect(fd); fd.connect(fry.gain);
    sum.connect(fry);
    nodes.push(fry, fo, fd); srcs.push(fo);
    const env = ctx.createGain(), g = env.gain;
    const P = (local ? .22 : .5) * vol;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(P, t + .03);
    g.setValueAtTime(P, t + .32);
    g.linearRampToValueAtTime(P * .3, t + .34);           // the crack
    g.linearRampToValueAtTime(P, t + .4);
    g.linearRampToValueAtTime(P * .7, t + 1.1);
    g.linearRampToValueAtTime(P * .25, t + 1.33);
    g.linearRampToValueAtTime(P * .45, t + 1.45);         // still going down
    g.setTargetAtTime(0, t + 1.6, 1.4);                   // fading as they drop
    fry.connect(env); nodes.push(env);
    let pan = null;
    if (local || !pos) env.connect(audio.out);
    else { pan = panner(ctx, { ref: 2.5, max: 120, roll: 1.1 }); env.connect(pan); pan.connect(audio.out); nodes.push(pan); }
    osc.start(t); lfo.start(t); fo.start(t);
    osc.stop(t + 6.5); lfo.stop(t + 6.5); fo.stop(t + 6.5);
    const h = { osc, env, pan, pos, nodes, srcs, t0: t, dist: null, vr: 0, last: null, done: false, end: (kind) => end(h, kind) };
    if (pan) move(h, 0, null);
    live.add(h);
    return h;
  }

  // where it is, and how fast it goes away from the ears: a little doppler
  function move(h, dt, ears) {
    const p = h.pos?.();
    if (!p) return;
    h.last = { x: p.x, y: p.y, z: p.z };
    place(audio.ctx, h.pan, p.x, p.y + 1.5, p.z);
    if (!ears) return;
    const d = Math.hypot(p.x - ears.x, p.y + 1.5 - ears.y, p.z - ears.z);
    if (h.dist != null && dt > 0) h.vr += ((d - h.dist) / dt - h.vr) * Math.min(1, dt * 6);
    h.dist = d;
    const ratio = SOUND / (SOUND + Math.max(-60, Math.min(60, h.vr * 1.5)));
    h.osc.detune.setTargetAtTime(1200 * Math.log2(ratio), audio.ctx.currentTime, .05);
  }

  function end(h, kind = 'cut') {
    if (h.done) return;
    h.done = true;
    live.delete(h);
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // cut short on impact, faded out otherwise
    h.env.gain.cancelScheduledValues?.(t);
    h.env.gain.setTargetAtTime(0, t, kind === 'cut' ? .25 : .02);
    for (const n of h.srcs) try { n.stop(t + (kind === 'cut' ? 1.2 : .2)); } catch {}
    // the others' landing is heard where they land (mine: audio.land / audio.splash already)
    if (h.pan && audio.noiseBuf && (kind === 'land' || kind === 'water')) {
      const src = ctx.createBufferSource(); src.buffer = audio.noiseBuf;
      const bf = ctx.createBiquadFilter(); bf.type = kind === 'water' ? 'bandpass' : 'lowpass'; bf.frequency.value = kind === 'water' ? 1400 : 260;
      const g = ctx.createGain();
      g.gain.setValueAtTime(kind === 'water' ? .5 : .9, t); g.gain.exponentialRampToValueAtTime(.001, t + (kind === 'water' ? .55 : .3));
      src.connect(bf); bf.connect(g); g.connect(h.pan);
      src.start(t); src.stop(t + .6);
      if (kind === 'land') {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + .25);
        const og = ctx.createGain(); og.gain.setValueAtTime(.6, t); og.gain.exponentialRampToValueAtTime(.001, t + .3);
        o.connect(og); og.connect(h.pan); o.start(t); o.stop(t + .35);
      }
    }
    setTimeout(() => { for (const n of h.nodes) try { n.disconnect(); } catch {} }, 1600);
  }

  return {
    start,
    get live() { return live; },
    // each frame: ears { x, y, z } (the camera). A scream past its breath ends by itself.
    update(dt, ears) {
      const ctx = audio.ctx;
      if (!ctx) return;
      if (!clip) load();
      for (const h of [...live]) {
        if (ctx.currentTime - h.t0 > 6.2) { end(h, 'cut'); continue; }
        if (h.pan) move(h, dt, ears);
      }
    },
    stopAll() { for (const h of [...live]) end(h, 'cut'); },
  };
}
