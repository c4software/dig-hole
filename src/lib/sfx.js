// lib/sfx.js, the one little WebAudio synth the mini-games share (each game keeps its own sounds in a thin
// wrapper: arcade-sfx, lune-sfx, nes-sfx, retro's chip, worms-sfx, worms3d-sfx, encre-sfx, mars-kit).
// Two families of voices over one context per game:
//   chip(f0, f1, dur, o)  the 8-bit kind: pulse waves (duty .125 .25 .5), 'tri', 'saw', 'sine', 'square';
//                          held, then released to silence at the end
//   blip(f, dur, o)       the soft kind: a quick attack, an exponential fall (worms, encre, mars, lombrics)
//   noise(dur, o)         filtered noise, held then faded (chip family)
//   hiss(dur, f, o)       filtered noise with a sweep, faded (blip family)
// plus seq() for a run of midi notes, ok() to keep one sound from repeating too fast, an optional music bus
// and an optional reverb (the choir of lombrics 3D). createTune() plays a looping lead over a bass.

export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createSynth({ vol = .12, music = 0, reverb = 0, noiseSec = 1 } = {}) {
  let ctx = null, master = null, musicBus = null, wet = null, noiseBuf = null;
  const pulses = {}, last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    if (music) { musicBus = ctx.createGain(); musicBus.gain.value = music; musicBus.connect(master); }
    noiseBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * noiseSec), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
    // pulse waves with the NES duty cycles
    for (const duty of [.125, .25, .5]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      pulses[duty] = ctx.createPeriodicWave(re, im);
    }
    // a church-sized reverb: noise fading over a few seconds
    if (reverb) {
      const rev = ctx.createConvolver(), len = Math.round(ctx.sampleRate * reverb), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2.4); }
      rev.buffer = ir; wet = ctx.createGain(); wet.gain.value = .5; wet.connect(rev); rev.connect(master);
    }
  }
  const running = () => !!ctx && ctx.state === 'running';
  // once per `gap` ms at most for a given key (and only while the sound is on)
  const ok = (k, gap) => { if (!running()) return false; const t = performance.now(); if (last[k] && t - last[k] < gap) return false; last[k] = t; return true; };
  function wave(o, type) {
    if (type === 'tri') o.type = 'triangle';
    else if (type === 'saw') o.type = 'sawtooth';
    else if (typeof type === 'string') o.type = type;   // 'sine', 'square', 'sawtooth', 'triangle'
    else o.setPeriodicWave(pulses[type] || pulses[.5]);
  }
  // a send to the reverb
  function send(node, amount) { if (!amount || !wet) return; const s = ctx.createGain(); s.gain.value = amount; node.connect(s); s.connect(wet); }

  function chip(f0, f1 = f0, dur = .1, { type = .5, vol = .5, at = 0, out = master, slide = 'exp' } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const o = ctx.createOscillator(), g = ctx.createGain();
    wave(o, type);
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) slide === 'lin' ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur = .1, { vol = .4, at = 0, f = 3000, f1 = 0, q = .7, filter = 'bandpass', loop = dur > .9, out = master } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop;
    const fl = ctx.createBiquadFilter(); fl.type = filter; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + .02);
  }
  // midi notes one after the other; 0, null or a negative note is a rest
  function seq(notes, len = .08, opts = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    notes.forEach((m, i) => { if (m > 0) chip(hz(m), hz(m), len * .95, { ...opts, at: t0 + i * len }); });
  }
  function blip(f, dur, { type = 'sine', vol = .5, to = f, at = 0, attack = .008, rev = 0, out = master } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    wave(o, type);
    o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(out); send(g, rev);
    o.start(t); o.stop(t + dur + .02);
  }
  function hiss(dur, f, { vol = .5, to = f, type = 'lowpass', at = 0, q = 1, rev = 0, out = master } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (to !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); send(g, rev);
    s.start(t, Math.random() * noiseSec / 2); s.stop(t + dur + .02);
  }
  return {
    init, ok, hz, chip, noise, seq, blip, hiss, send,
    get ctx() { return ctx; },
    get master() { return master; },
    get musicBus() { return musicBus; },
    get wet() { return wet; },
    get noiseBuf() { return noiseBuf; },
    get running() { return running(); },
    pause() { if (running()) ctx.suspend().catch(() => {}); },
    close() { if (ctx) { try { ctx.close(); } catch {} } ctx = null; },
  };
}

// a looping tune: lead (midi notes, 0 = hold, -1 = rest), one root per bar of 8 steps, a bass pattern on the
// roots, a hat and a kick; played ahead of time, a little at every tick()
export function createTune(S, { lead = [], roots = [], bass = [0, 12, 7, 12], beat = .2, leadType = .25, drums = true,
  bassVol = .45, leadVol = .14, hatVol = .08, kickVol = .16 } = {}) {
  let on = false, nextT = 0, step = 0, tempo = 1;
  function tick() {
    const ctx = S.ctx;
    if (!ctx || !on || !lead.length) return;
    const now = ctx.currentTime, out = S.musicBus || S.master;
    if (nextT < now - .1) nextT = now + .05;
    while (nextT < now + .25) {
      const e = beat / tempo, s = step % lead.length, bar = (s >> 3) % roots.length;
      const b = roots[bar] + bass[s % bass.length];
      S.chip(hz(b), hz(b), e * .8, { type: 'tri', vol: bassVol, at: nextT, out });
      const m = lead[s];
      if (m > 0) { let n = 1; while (lead[(s + n) % lead.length] === 0 && n < 4) n++; S.chip(hz(m), hz(m), e * n * .9, { type: leadType, vol: leadVol, at: nextT, out }); }
      if (drums) { if (s % 2) S.noise(.04, { vol: hatVol, at: nextT, f: 7000, out }); else if (s % 4 === 0) S.noise(.08, { vol: kickVol, at: nextT, f: 200, out }); }
      nextT += e; step++;
    }
  }
  return {
    tick,
    get on() { return on; },
    set(v) { if (v && !on && S.ctx) nextT = S.ctx.currentTime + .05; on = v; },
    hurry(v) { tempo = v ? 1.3 : 1; },
  };
}
