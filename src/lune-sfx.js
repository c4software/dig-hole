// arcade-sfx.js, the little synth of the moon arcade (capitaine lune, potager lunaire): pulses, a triangle, noise,
// and a looping tune given as lead + bass lines. Each game builds its own sounds on top.
export function createSynth({ vol = .12, lead = [], roots = [], bass = [0, 12, 7, 12], beat = .2, leadType = .25, drums = true } = {}) {
  let ctx = null, master = null, musicG = null, noiseBuf = null, pulses = {};
  let nextT = 0, step = 0, tempo = 1, on = false;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
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
    if (f1 !== f0) slide === 'lin' ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, { vol = .4, at = 0, f = 3000, q = .7, out = master } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + .02);
  }
  const seq = (notes, len, opts = {}) => { if (!ctx) return; const t0 = ctx.currentTime; notes.forEach((m, i) => { if (m > 0) tone(hz(m), hz(m), len * .95, { ...opts, at: t0 + i * len }); }); };
  // lead: midi notes, 0 = hold, -1 = rest; roots: one per bar of 8 steps
  function music() {
    if (!ctx || !on || !lead.length) return;
    const now = ctx.currentTime;
    if (nextT < now - .1) nextT = now + .05;
    while (nextT < now + .25) {
      const e = beat / tempo, s = step % lead.length, bar = (s >> 3) % roots.length;
      const b = roots[bar] + bass[s % bass.length];
      tone(hz(b), hz(b), e * .8, { type: 'tri', vol: .45, at: nextT, out: musicG });
      const m = lead[s];
      if (m > 0) { let n = 1; while (lead[(s + n) % lead.length] === 0 && n < 4) n++; tone(hz(m), hz(m), e * n * .9, { type: leadType, vol: .14, at: nextT, out: musicG }); }
      if (drums) { if (s % 2) noise(.04, { vol: .08, at: nextT, f: 7000, out: musicG }); else if (s % 4 === 0) noise(.08, { vol: .16, at: nextT, f: 200, out: musicG }); }
      nextT += e; step++;
    }
  }
  return {
    hz, tone, noise, seq,
    get ctx() { return ctx; },
    init,
    close() { on = false; if (ctx) { try { ctx.close(); } catch {} } ctx = null; },
    music(v) { if (v && !on && ctx) nextT = ctx.currentTime + .05; on = v; },
    hurry(v) { tempo = v ? 1.3 : 1; },
    tick: music,
  };
}
