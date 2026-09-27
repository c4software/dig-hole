// retro.js, what the games of the secret cave share: a little chip synth, a seeded random,
// who hosts, and the clock format. Each game is a diorama of the cave you shrink into, a module
// like jetski.js: start, stop, update(dt, keys), onFx, peerLeft, respawn, hud, preview, onEnd.

export const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const ord = (n) => n === 1 ? '1re' : n + 'e';
export const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
// who runs the shared world: the host if still here, else the first human by id
export const hostOf = (humans, hostId) => humans.some(h => h.id === hostId) ? hostId : [...humans].map(h => h.id).sort((a, b) => String(a).localeCompare(String(b)))[0];

// ---------- a chip synth: pulses, triangle, noise ----------
export function createChip(volume = .12) {
  let ctx = null, master = null, noiseBuf = null, pulses = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
    for (const duty of [.125, .25, .5]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      pulses[duty] = ctx.createPeriodicWave(re, im);
    }
  }
  // type: .125 | .25 | .5 (pulse duty), 'tri', 'saw', 'sine'
  function tone(f0, f1 = f0, dur = .1, { type = .5, vol = .4, at = 0 } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (type === 'tri') o.type = 'triangle'; else if (type === 'saw') o.type = 'sawtooth'; else if (type === 'sine') o.type = 'sine'; else o.setPeriodicWave(pulses[type] || pulses[.5]);
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur = .1, { vol = .3, f = 1200, at = 0 } = {}) {
    if (!ctx) return;
    const t = (at || ctx.currentTime) + .005;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
  }
  // midi notes one after the other (null: a rest)
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function seq(notes, step = .08, opts = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    notes.forEach((m, n) => { if (m != null) tone(hz(m), hz(m), step * .95, { ...opts, at: t0 + n * step }); });
  }
  return { init, tone, noise, seq, hz, close() { if (ctx) { try { ctx.close(); } catch {} } ctx = null; }, get ctx() { return ctx; } };
}
