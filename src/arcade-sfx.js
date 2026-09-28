// arcade-sfx.js, a small chip synth for the Moon arcade (invaders, shooter): pulses, a triangle, noise, and two loops.
export function createArcadeSfx() {
  let ctx = null, master = null, musicG = null, noiseBuf = null, pulses = {};
  let nextT = 0, step = 0, tempo = 1, song = null, ufo = null;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = .12; master.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.gain.value = .5; musicG.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
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
    if (type === 'tri') o.type = 'triangle'; else if (type === 'saw') o.type = 'sawtooth'; else o.setPeriodicWave(pulses[type]);
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) slide === 'lin' ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, { vol = .4, at = 0, f = 3000, out = master, q = .7, f1 = 0 } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = dur > .9;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + .02);
  }
  const seq = (notes, len, opts = {}) => { if (!ctx) return; const t0 = ctx.currentTime; notes.forEach((m, i) => { if (m > 0) tone(hz(m), hz(m), len * .95, { ...opts, at: t0 + i * len }); }); };

  // the shooter's loop: Am, F, C, G in sixteenths, a pumping bass and an arpeggio
  const ROOTS = [45, 41, 48, 43], ARP = [0, 7, 12, 15, 12, 7, 0, 12];
  const LEAD = [81, 0, 0, 79, 76, 0, 74, 0, 76, 0, 0, 0, 72, 0, 74, 0, 77, 0, 0, 76, 72, 0, 69, 0, 72, 0, 0, 0, 0, 0, 0, 0,
    84, 0, 0, 83, 79, 0, 76, 0, 79, 0, 0, 0, 76, 0, 79, 0, 83, 0, 81, 0, 79, 0, 74, 0, 71, 0, 0, 0, 74, 0, 79, 0];
  function music() {
    if (!ctx || !song) return;
    const now = ctx.currentTime;
    if (nextT < now - .1) nextT = now + .05;
    while (nextT < now + .25) {
      if (song === 'shoot' || song === 'boss') {
        const e = (song === 'boss' ? .105 : .12) / tempo, s = step % 64, bar = (s >> 4) & 3;
        const r = ROOTS[bar] + (song === 'boss' ? -2 : 0);
        tone(hz(r - 12 + (s % 2 ? 12 : 0)), hz(r - 12 + (s % 2 ? 12 : 0)), e * .8, { type: 'tri', vol: .55, at: nextT, out: musicG });
        const a = r + 12 + ARP[s & 7] + (song === 'boss' ? (s & 8 ? 1 : 0) : 0);
        tone(hz(a), hz(a), e * .6, { type: .125, vol: .07, at: nextT, out: musicG });
        const m = song === 'boss' ? 0 : LEAD[(step >> 1) & 63];
        if (m > 0 && s % 2 === 0) tone(hz(m), hz(m), e * 1.8, { type: .25, vol: .1, at: nextT, out: musicG });
        if (s % 4 === 0) noise(.09, { vol: .22, at: nextT, f: 160, out: musicG });
        else if (s % 4 === 2) noise(.06, { vol: .12, at: nextT, f: 2400, out: musicG });
        else noise(.02, { vol: .05, at: nextT, f: 8000, out: musicG });
        nextT += e;
      } else {
        // the invaders' march: four falling notes, as fast as the swarm
        const NOTES = [41, 39, 37, 36];
        tone(hz(NOTES[step & 3]), hz(NOTES[step & 3]) * .9, .09, { type: .5, vol: .45, at: nextT, out: musicG });
        nextT += .6 / tempo;
      }
      step++;
    }
    if (ufo) ufo();
  }
  let ufoT = 0;
  return {
    init() { init(); if (ctx?.state === 'suspended') ctx.resume(); },
    close() { song = null; ufo = null; if (ctx) { try { ctx.close(); } catch {} } ctx = null; },
    music(s) { if (s !== song) { song = s; step = 0; if (ctx) nextT = ctx.currentTime + .05; } },
    tempo(v) { tempo = v; },
    tick: music,
    // the saucer's warble while it flies
    saucer(on) {
      if (!on) { ufo = null; return; }
      if (ufo) return;
      ufo = () => { if (!ctx) return; const n = ctx.currentTime; if (n < ufoT) return; ufoT = n + .16; tone(1400, 900, .15, { type: .25, vol: .12 }); };
    },
    march: (n) => { const f = hz([41, 39, 37, 36][n & 3]); tone(f, f * .92, .1, { type: .5, vol: .45 }); },
    shot: () => tone(1500, 300, .09, { type: .125, vol: .22 }),
    laser: () => tone(2400, 1200, .05, { type: .125, vol: .12 }),
    pew: () => tone(1000, 500, .05, { type: .25, vol: .12 }),
    missile: () => noise(.12, { vol: .15, f: 3000, f1: 800 }),
    boom: (big) => { noise(big ? .8 : .3, { vol: big ? .7 : .45, f: big ? 500 : 1100, f1: 80 }); tone(big ? 160 : 260, 40, big ? .5 : .2, { type: 'tri', vol: .5 }); },
    pop: () => { noise(.12, { vol: .35, f: 2000, f1: 400 }); },
    hit: () => tone(300, 200, .04, { type: .5, vol: .15 }),
    clank: () => tone(900, 850, .04, { type: .125, vol: .12 }),
    die: () => { noise(1.1, { vol: .6, f: 900, f1: 60 }); seq([64, 60, 57, 52, 48], .09, { type: .5, vol: .25 }); },
    ufoHit: () => seq([84, 79, 84, 88, 91, 96], .05, { type: .25, vol: .28 }),
    power: () => seq([60, 64, 67, 72, 76, 79, 84], .04, { type: .25, vol: .3 }),
    oneUp: () => seq([76, 79, 88, 84, 86, 91], .08, { type: .5, vol: .3 }),
    shield: () => tone(300, 1200, .3, { type: 'tri', vol: .4, slide: 'lin' }),
    bomb: () => { noise(1.5, { vol: .8, f: 300, f1: 40 }); tone(90, 30, 1.2, { type: 'saw', vol: .35 }); },
    beep: (hi) => tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? .3 : .1, { type: .5, vol: .3 }),
    wave: () => seq([60, 67, 72, 0, 67, 72, 76, 79], .07, { type: .25, vol: .28 }),
    warn: () => { for (let n = 0; n < 3; n++) setTimeout(() => tone(440, 440, .25, { type: .5, vol: .25 }), n * 450); },
    over: () => { song = null; seq([67, 0, 63, 0, 60, 0, 55, 55, 55], .14, { type: .5, vol: .3 }); },
    win: () => { song = null; seq([72, 76, 79, 84, 0, 79, 84, 88, 91], .1, { type: .5, vol: .3 }); },
  };
}
