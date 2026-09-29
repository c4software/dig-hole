// audio.js, everything synthesised: no files to load, nothing to license.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, volume = .7;
  let wind = null, drone = null, jet = null, engine = null, planeG = null, drillG = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;

    // looping beds: wind on the surface, a low drone in the deep, the jetpack hiss
    wind = loopNoise('bandpass', 500, 0.6);
    jet = loopNoise('highpass', 1400, 0.8);
    engine = loopNoise('lowpass', 160, 4);
    planeG = loopNoise('lowpass', 110, 8);
    // the drill: a buzzing saw tooth over gritty noise
    drillG = ctx.createGain(); drillG.gain.value = 0; drillG.connect(master);
    const dOsc = ctx.createOscillator(); dOsc.type = 'sawtooth'; dOsc.frequency.value = 96;
    const dF = ctx.createBiquadFilter(); dF.type = 'lowpass'; dF.frequency.value = 900;
    dOsc.connect(dF); dF.connect(drillG); dOsc.start();
    const dN = loopNoise('bandpass', 2200, 1.2); dN.disconnect(); dN.connect(drillG); dN.gain.value = .6;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 46;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 69.3;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); o2.connect(g); g.connect(master);
    o.start(); o2.start();
    drone = g;
  }
  function loopNoise(type, freq, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    return g;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noise(freq, dur, vol, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.005, vol, dur);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, vol, type = 'sine', when = 0, slide = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    o.connect(g); g.connect(master);
    env(g, t, 0.004, vol, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    init,
    // for the sounds built elsewhere (scream.js, voice.js): the context, the master bus, white noise
    get ctx() { return ctx; }, get out() { return master; }, get noiseBuf() { return noiseBuf; },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    dig(hard = 1) {
      noise(500 + hard * 180, 0.22, 0.55);
      tone(95 + hard * 12, 0.16, 0.35, 'sine', 0, 0.5);
      if (hard >= 3) tone(900 + Math.random() * 300, 0.08, 0.05, 'triangle');
    },
    clink() {
      tone(1900, 0.25, 0.12, 'triangle');
      tone(2650, 0.18, 0.07, 'sine', 0.01);
      noise(3000, 0.05, 0.15, 'highpass');
    },
    pickup(n = 0) {
      const base = 660 * Math.pow(2, (n % 5) / 12);
      tone(base, 0.12, 0.12, 'sine');
      tone(base * 1.5, 0.18, 0.08, 'sine', 0.06);
    },
    sell() {
      [0, 4, 7, 12, 16].forEach((s, i) => tone(784 * Math.pow(2, s / 12), 0.2, 0.1, 'triangle', i * 0.06));
    },
    buy() {
      [0, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.35, 0.1, 'sine', i * 0.08));
    },
    deny() { tone(180, 0.18, 0.15, 'square', 0, 0.8); },
    step() { noise(900, 0.06, 0.08); },
    land(v) { noise(300, 0.2, Math.min(0.6, v * 0.03)); },
    full() { tone(300, 0.2, 0.12, 'triangle'); tone(240, 0.3, 0.12, 'triangle', 0.12); },
    boom(big = 1) {
      noise(180, 1.1 * big, 0.9, 'lowpass');
      noise(900, 0.35, 0.4, 'lowpass');
      tone(70, 0.8, 0.5, 'sine', 0, 0.35);
    },
    squeak() { tone(1700 + Math.random() * 300, 0.12, 0.08, 'sine', 0, 1.5); tone(2300, 0.08, 0.05, 'sine', 0.1, 1.3); },
    bonk() { tone(260, 0.12, 0.25, 'triangle', 0, 0.6); noise(700, 0.08, 0.2); },
    tick() { tone(1400, 0.05, 0.08, 'square'); },
    hover() { tone(880, 0.05, 0.025, 'sine', 0, 1.25); },
    pop() { tone(420, 0.1, 0.07, 'triangle', 0, 1.9); noise(2400, 0.04, 0.04); },
    horn() { tone(392, 0.35, 0.12, 'sawtooth'); tone(494, 0.35, 0.1, 'sawtooth'); },
    charge() { tone(220, 1.1, 0.06, 'sawtooth', 0, 3); },
    // an air-raid siren: two slow wails
    siren() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(master);
      o.frequency.setValueAtTime(380, t);
      for (let n = 0; n < 2; n++) {
        o.frequency.linearRampToValueAtTime(820, t + n * 2.4 + 1.2);
        o.frequency.linearRampToValueAtTime(380, t + n * 2.4 + 2.4);
      }
      g.gain.linearRampToValueAtTime(0.07, t + 0.3);
      g.gain.setValueAtTime(0.07, t + 4.4);
      g.gain.linearRampToValueAtTime(0, t + 4.8);
      o.start(t); o.stop(t + 5);
    },
    splash() { noise(1400, 0.5, 0.35, 'bandpass'); noise(400, 0.3, 0.2); },
    setDrill(on, biting) { if (drillG) drillG.gain.setTargetAtTime(on ? (biting ? .1 : .05) : 0, ctx.currentTime, .04); },
    hiss() { noise(5000, 1.4, 0.25, 'highpass'); tone(2400, .6, .03, 'sine', 0, .5); },
    splat() { noise(1600, 0.1, 0.22, 'bandpass'); tone(200, 0.08, 0.06, 'sine', 0, 0.5); },
    squirt() { noise(2600, 0.06, 0.1, 'highpass'); },
    laser() { tone(2200, 0.16, 0.06, 'sawtooth', 0, 0.2); tone(1100, 0.12, 0.05, 'square', 0, 0.3); },
    zap() { tone(880, 0.1, 0.1, 'square'); tone(1320, 0.14, 0.08, 'square', 0.06); },
    tagged() { tone(520, 0.4, 0.12, 'sawtooth', 0, 0.3); noise(600, 0.3, 0.2); },
    whistle() { tone(1500, 1.3, 0.05, 'sine', 0, 0.3); },
    setPlane(v) { if (ctx) planeG.gain.setTargetAtTime(v * 0.35, ctx.currentTime, 0.2); },
    win() { [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 1.2, 0.08, 'sine', i * 0.18)); },
    // continuous beds, called every frame
    setBeds(depth, jetting, driving = 0) {
      if (!ctx) return;
      engine.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.08, Math.abs(driving) * 0.008) : 0, ctx.currentTime, 0.1);
      const t = ctx.currentTime;
      const surf = Math.max(0, 1 - depth / 6);
      wind.gain.setTargetAtTime(0.05 * surf, t, 0.3);
      drone.gain.setTargetAtTime(Math.min(0.08, depth / 900), t, 0.5);
      jet.gain.setTargetAtTime(jetting ? 0.12 : 0, t, 0.05);
    },
  };
}
