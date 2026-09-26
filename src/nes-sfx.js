// nes-sfx.js, a tiny 8-bit synth for "super creuseur": two pulses, a triangle, some noise, and an original little tune.
export function createSfx() {
  let ctx = null, master = null, musicG = null, noiseBuf = null, pulses = {};
  let nextT = 0, step = 0, tempo = 1, on = false;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = .12; master.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.gain.value = .55; musicG.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
    // pulse waves with the NES duty cycles
    for (const duty of [.125, .25, .5]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      pulses[duty] = ctx.createPeriodicWave(re, im);
    }
  }
  function tone(f0, f1, dur, { type = .5, vol = .5, at = 0, out = master, slide = 'exp' } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (type === 'tri') o.type = 'triangle'; else o.setPeriodicWave(pulses[type]);
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) slide === 'lin' ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, { vol = .4, at = 0, f = 3000, out = master } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = .7;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + .02);
  }
  const seq = (notes, len, opts = {}) => { if (!ctx) return; const t0 = ctx.currentTime; notes.forEach((m, i) => { if (m) tone(hz(m), hz(m), len * .95, { ...opts, at: t0 + i * len }); }); };

  // the tune: C, Am, F, G / C, Am, Dm, G in eighth notes; 0 = hold, -1 = rest
  const LEAD = [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 76, 0, 77, 0, 76, 74, 72, 0, 69, 0, 71, 0, 74, 0, 79, 0, -1, -1,
    72, 76, 79, 84, 79, 76, 72, -1, 69, 72, 76, 81, 76, 72, 69, -1, 74, 0, 77, 0, 81, 0, 77, 74, 79, 0, 77, 0, 74, 0, 71, -1];
  const ROOTS = [36, 33, 29, 31, 36, 33, 38, 31], BASS = [0, 12, 7, 12, 0, 12, 7, 10];
  function music() {
    if (!ctx || !on) return;
    const now = ctx.currentTime;
    if (nextT < now - .1) nextT = now + .05;
    while (nextT < now + .25) {
      const e = .2 / tempo, s = step % 64, bar = s >> 3;
      const b = ROOTS[bar] + BASS[s & 7];
      tone(hz(b), hz(b), e * .8, { type: 'tri', vol: .5, at: nextT, out: musicG });
      const m = LEAD[s];
      if (m > 0) { let n = 1; while (LEAD[(s + n) % 64] === 0 && n < 4) n++; tone(hz(m), hz(m), e * n * .9, { type: .25, vol: .16, at: nextT, out: musicG }); }
      if (s % 2) noise(.04, { vol: .1, at: nextT, f: 7000, out: musicG });
      else if (s % 4 === 0) noise(.08, { vol: .18, at: nextT, f: 200, out: musicG });
      nextT += e; step++;
    }
  }
  return {
    init() { init(); if (ctx?.state === 'suspended') ctx.resume(); },
    close() { on = false; if (ctx) { try { ctx.close(); } catch {} } ctx = null; },
    music(v) { on = v; if (v && ctx) nextT = ctx.currentTime + .05; },
    hurry(v) { tempo = v ? 1.3 : 1; },
    tick: music,
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
    die: () => { on = false; seq([71, 77, 0, 77, 77, 76, 74, 72, 64, 0, 64, 60], .12, { type: .5, vol: .3 }); },
    beep: (hi) => tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .35 : .12, { type: .5, vol: .3 }),
    flag: () => { on = false; tone(1200, 200, .9, { type: .25, vol: .3 }); setTimeout(() => seq([67, 72, 76, 79, 84, 88, 0, 84, 0, 88, 91], .1, { type: .5, vol: .28 }), 900); },
    bop: () => tone(600, 900, .07, { type: .5, vol: .25 }),
    time: () => seq([84, 88, 91, 0, 84, 88, 91], .07, { type: .25, vol: .25 }),
  };
}
