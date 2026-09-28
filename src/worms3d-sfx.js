// worms3d-sfx.js, the sounds of « lombrics 3D », all synthesized: blasts, whooshes, bounces, the
// worms' little chipmunk voices, a bleating sheep, and the choir of the holy hand grenade.
export function createSfx() {
  let ctx = null, master = null, wet = null, noiseBuf = null, jet = null;
  const last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = .22; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let n = 0; n < nd.length; n++) nd[n] = Math.random() * 2 - 1;
    // a church-sized reverb for the choir (and a little for the blasts)
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2.4); }
    rev.buffer = ir; wet = ctx.createGain(); wet.gain.value = .5; wet.connect(rev); rev.connect(master);
  }
  const ok = (k, gap) => { if (!ctx || ctx.state !== 'running') return false; const t = performance.now(); if (last[k] && t - last[k] < gap) return false; last[k] = t; return true; };
  function tone(f, dur, { type = 'sine', vol = .3, to = f, at = 0, rev = 0, attack = .006 } = {}) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(wet); }
    o.start(t); o.stop(t + dur + .02);
  }
  function hiss(dur, f, { vol = .3, to = f, type = 'lowpass', at = 0, q = 1, rev = 0 } = {}) {
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (to !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); if (rev) { const w = ctx.createGain(); w.gain.value = rev; g.connect(w); w.connect(wet); }
    s.start(t, Math.random()); s.stop(t + dur + .02);
  }

  // ---------- voices: a few pitched blips per syllable, through a mouth-ish filter ----------
  function speak(text, pitch = 1) {
    if (!ok('voice', 250)) return;
    const syl = Math.max(2, Math.min(9, (text.match(/[aeiouyéèêàâîôû]+/gi) || []).length));
    const base = 330 * pitch;
    let at = 0;
    for (let n = 0; n < syl; n++) {
      const dur = .07 + Math.random() * .06, f = base * (1 + (Math.random() - .3) * .5) * (n === syl - 1 && /[!?]$/.test(text) ? 1.35 : 1);
      const t = ctx.currentTime + at, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (.8 + Math.random() * .5), t + dur);
      fl.type = 'bandpass'; fl.Q.value = 3; fl.frequency.setValueAtTime(900 + Math.random() * 1400, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
      at += dur + .015;
    }
  }

  // ---------- the choir: « hal-le-lu-jah », six voices through vowel formants ----------
  const VOWEL = { a: [800, 1150, 2900], e: [450, 1850, 2600], u: [350, 700, 2500], o: [500, 900, 2600] };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function choir() {
    if (!ctx) return 0;
    const t0 = ctx.currentTime + .05;
    // D major, G major, D over A, then the long A-to-D « jah »
    const SYL = [['a', .42, [50, 57, 62, 66, 69, 74]], ['e', .34, [55, 59, 62, 67, 71, 74]], ['u', .5, [45, 57, 62, 66, 69, 78]], ['a', 1.9, [50, 57, 62, 66, 69, 74]]];
    const bus = ctx.createGain(); bus.gain.value = .32; bus.connect(master); const bw = ctx.createGain(); bw.gain.value = .9; bus.connect(bw); bw.connect(wet);
    let t = t0;
    for (const [v, dur, chord] of SYL) {
      for (const [n, m] of chord.entries()) {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), env = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det + (Math.random() - .5) * 6;
          lfo.frequency.value = 5 + Math.random(); lg.gain.value = hz(m) * .012; lfo.connect(lg); lg.connect(o.frequency);
          const peak = (n < 2 ? .5 : .35) * (v === 'a' && dur > 1 ? 1.25 : 1);
          env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(peak, t + .07); env.gain.setValueAtTime(peak, t + dur - .06); env.gain.linearRampToValueAtTime(0, t + dur + (dur > 1 ? .5 : .04));
          for (const [k, f] of VOWEL[v].entries()) {
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (n > 3 ? 1.1 : 1); bp.Q.value = 7 + k * 3;
            const fg = ctx.createGain(); fg.gain.value = [1, .55, .25][k];
            o.connect(bp); bp.connect(fg); fg.connect(env);
          }
          env.connect(bus);
          o.start(t); lfo.start(t); o.stop(t + dur + .6); lfo.stop(t + dur + .6);
        }
      }
      // the consonants: a breath before « hal », a flick of the tongue before « le » and « lu »
      hiss(.08, 3000, { vol: .05, at: t - t0 + .02, type: 'bandpass', q: 2 });
      t += dur;
    }
    return t - t0;
  }

  return {
    init,
    get ready() { return !!ctx; },
    speak,
    choir,
    boom(v = 1) {
      if (!ok('boom', 50)) return;
      const k = Math.min(1.6, v);
      hiss(.7 + k * .6, 1400, { vol: .7 * Math.min(1, k), to: 60, rev: .3 });
      tone(90, .5 + k * .4, { vol: .6 * Math.min(1, k), to: 28 });
      tone(55, .7 + k * .5, { type: 'triangle', vol: .35, to: 22, at: .03 });
      if (k > 1.2) { hiss(2.2, 600, { vol: .6, to: 40, at: .1, rev: .6 }); tone(40, 2, { vol: .6, to: 18, at: .05 }); }
    },
    launch() { if (!ok('launch', 80)) return; hiss(.45, 3500, { vol: .35, to: 500, type: 'bandpass', q: 1.5 }); tone(160, .3, { type: 'sawtooth', vol: .08, to: 80 }); },
    throw() { if (!ok('throw', 80)) return; hiss(.2, 1800, { vol: .25, to: 600, type: 'bandpass', q: 2 }); },
    bounce(v = 1) { if (!ok('bounce', 70)) return; tone(480 + Math.random() * 160, .07, { type: 'triangle', vol: .18 * Math.min(1, v), to: 300 }); },
    splash() { if (!ok('splash', 150)) return; hiss(.7, 2400, { vol: .45, to: 300 }); tone(260, .3, { vol: .12, to: 900 }); },
    blub() { if (!ok('blub', 200)) return; for (let n = 0; n < 4; n++) tone(300 + Math.random() * 300, .08, { vol: .12, to: 700, at: n * .12 }); },
    jump() { if (!ok('jump', 150)) return; tone(260, .18, { type: 'square', vol: .07, to: 620 }); },
    flip() { if (!ok('jump', 150)) return; tone(220, .3, { type: 'square', vol: .07, to: 880 }); tone(330, .2, { type: 'triangle', vol: .06, to: 990, at: .1 }); },
    step() { if (!ok('step', 190)) return; hiss(.04, 900, { vol: .06, type: 'bandpass', q: 3 }); },
    land(v = 1) { if (!ok('land', 120)) return; hiss(.12, 500, { vol: .12 * Math.min(2, v) }); },
    charge(p) { if (!ok('charge', 60)) return; tone(200 + p * 700, .07, { type: 'square', vol: .05, to: 220 + p * 700 }); },
    select() { if (!ok('select', 50)) return; tone(880, .05, { type: 'square', vol: .06, to: 1200 }); },
    tick(hot) { if (!ok('tick', 300)) return; tone(hot ? 1320 : 990, .06, { type: 'square', vol: .06 }); },
    shotgun() { if (!ok('shot', 60)) return; hiss(.3, 5000, { vol: .6, to: 300 }); tone(120, .15, { type: 'square', vol: .2, to: 50 }); },
    bat() { if (!ok('bat', 100)) return; tone(700, .08, { type: 'triangle', vol: .3, to: 300 }); hiss(.1, 2000, { vol: .3, type: 'bandpass', q: 2 }); },
    punch() { if (!ok('bat', 100)) return; hiss(.5, 800, { vol: .3, to: 3000, type: 'bandpass', q: 1 }); tone(200, .4, { type: 'sawtooth', vol: .08, to: 600 }); },
    rope() { if (!ok('rope', 100)) return; tone(1400, .12, { type: 'triangle', vol: .08, to: 500 }); },
    zap() { if (!ok('zap', 100)) return; tone(300, .35, { type: 'sawtooth', vol: .08, to: 2400 }); tone(2400, .3, { type: 'sine', vol: .06, to: 300, at: .25 }); },
    plane() { if (!ok('plane', 500)) return; tone(110, 2.2, { type: 'sawtooth', vol: .05, to: 95, attack: .5 }); hiss(2.2, 400, { vol: .1, attack: .5 }); },
    whistle() { if (!ok('whistle', 100)) return; tone(2200, 1, { vol: .04, to: 700 }); },
    fuse() { if (!ok('fuse', 90)) return; hiss(.08, 6000, { vol: .05, type: 'highpass' }); },
    beep() { if (!ok('beep', 120)) return; tone(1800, .06, { type: 'square', vol: .06 }); },
    pickup() { if (!ok('pickup', 200)) return; [0, 4, 7, 12].forEach((s, n) => tone(660 * Math.pow(2, s / 12), .12, { type: 'triangle', vol: .09, at: n * .07 })); },
    sheep() { if (!ok('sheep', 700)) return; const t = ctx.currentTime; const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 420; l.frequency.value = 18; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + .6); o.connect(bp); bp.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + .65); l.stop(t + .65); },
    turn() { if (!ok('turn', 400)) return; [0, 7, 12].forEach((s, n) => tone(523 * Math.pow(2, s / 12), .16, { type: 'square', vol: .05, at: n * .09 })); },
    fanfare(win) { if (!ctx) return; (win ? [0, 4, 7, 12, 16, 19, 24] : [7, 4, 0, -5]).forEach((s, n) => tone(392 * Math.pow(2, s / 12), win ? .35 : .5, { type: 'triangle', vol: .1, at: n * (win ? .12 : .22), rev: .3 })); },
    // the jetpack roars while it's on
    jet(on) {
      if (!ctx) return;
      if (on && !jet) {
        const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true; fl.type = 'lowpass'; fl.frequency.value = 900; g.gain.value = 0;
        s.connect(fl); fl.connect(g); g.connect(master); s.start();
        jet = { s, g };
      }
      if (jet) jet.g.gain.setTargetAtTime(on ? .22 : 0, ctx.currentTime, .05);
    },
    stop() { if (jet) { try { jet.s.stop(); } catch {} jet = null; } },
  };
}
