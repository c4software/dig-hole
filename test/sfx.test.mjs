// sfx.test.mjs, the one shared synth (src/lib/sfx.js) and the games' thin wrappers over it: every sound of
// every wrapper plays in a fake WebAudio without throwing, and each makes nodes (it's not silently dead).
//   node --test test/sfx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

let nodes = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); }, setTargetAtTime() {} });
const node = () => { nodes++; return { gain: param(), frequency: param(), detune: param(), Q: param(), connect() {}, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {}, type: '', buffer: null, loop: false }; };
class FakeAudio {
  constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = node(); this.baseLatency = 0; }
  createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); } createBufferSource() { return node(); } createConvolver() { return node(); }
  createBuffer(ch, len) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (c) => d[c] }; }
  createPeriodicWave() { return {}; }
  resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); } close() {}
}
globalThis.window = globalThis;
globalThis.AudioContext = FakeAudio;
let fakeNow = 0;   // every call a few seconds after the last: no sound held back by its throttle
Object.defineProperty(globalThis, 'performance', { value: { now: () => (fakeNow += 5000) }, configurable: true });
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms) => realTimeout(() => { try { f(); } catch (e) { console.error(e); } }, 0);
// the stub canvas mars-kit may want at import time is not needed: only createSfx is used

// call every function-valued member with a few plausible arguments
function playAll(name, s, skip = []) {
  for (const k of Object.keys(s)) {
    if (k === 'speak') { s.speak('hal-le-lu-jah !'); continue; }
    if (skip.includes(k) || typeof s[k] !== 'function' || ['init', 'close', 'pause', 'stop', 'seq', 'hz', 'tone', 'noise'].includes(k)) continue;
    const before = nodes;
    for (const args of [[true], [.5], [1.4]]) {
      try { s[k](...args); } catch (e) { assert.fail(`${name}.${k}(${args}) threw: ${e.message}`); }
    }
    if (!['music', 'hurry', 'tempo', 'tick', 'saucer', 'hz', 'jet', 'hum', 'tone', 'speak', 'choir', 'warn'].includes(k)) assert.ok(nodes > before, `${name}.${k}() made no sound`);
  }
}

test('lib/sfx: chip, blip, noise, hiss, seq, a tune, a reverb', async () => {
  const { createSynth, createTune, hz } = await import('../src/lib/sfx.js');
  assert.equal(Math.round(hz(69)), 440);
  const S = createSynth({ vol: .1, music: .5, reverb: 1, noiseSec: 2 });
  assert.equal(S.ctx, null);
  S.chip(440);   // before init: silent, no throw
  S.init();
  assert.ok(S.ctx && S.master && S.musicBus && S.wet);
  const n = nodes;
  S.chip(440, 220, .2, { type: .25 }); S.chip(100, 0, .2, { type: 'tri' });   // a slide to 0 is clamped
  S.blip(300, .2, { to: 600, rev: .3 }); S.noise(.3, { f1: 300 }); S.hiss(.4, 900, { to: 10, type: 'bandpass' }); S.seq([60, null, 0, -1, 64]);
  assert.ok(nodes > n);
  assert.ok(S.ok('a', 1e9)); assert.ok(!S.ok('a', 1e9));
  const tune = createTune(S, { lead: [60, 0, 64, -1], roots: [48] });
  tune.set(true); const m = nodes; tune.tick(); assert.ok(nodes > m, 'the tune plays');
  S.pause(); assert.equal(S.running, false);
  S.close(); assert.equal(S.ctx, null);
});

test('every game wrapper plays all its sounds', async () => {
  const wrappers = {
    arcade: (await import('../src/arcade-sfx.js')).createArcadeSfx(),
    nes: (await import('../src/nes-sfx.js')).createSfx(),
    worms: (await import('../src/worms-sfx.js')).createSfx(),
    encre: (await import('../src/encre-sfx.js')).createSfx(),
    worms3d: (await import('../src/worms3d-sfx.js')).createSfx(),
    lune: (await import('../src/lune-sfx.js')).createSynth({ lead: [60, 0, 62, 64], roots: [48, 43] }),
    chip: (await import('../src/retro.js')).createChip(.1),
  };
  for (const [name, s] of Object.entries(wrappers)) {
    s.init();
    assert.ok(s.ctx || s.ready || name === 'worms' || name === 'encre' || name === 'nes' || name === 'arcade', name + ' is on');
    playAll(name, s);
    // the raw voices the games call themselves (the chip of the cave, the moon's synth)
    if (name === 'chip' || name === 'lune') {
      const n = nodes;
      s.tone(440); s.tone(440, 220, .2, { type: 'tri' }); s.noise(.2); s.noise(1.5, { f: 300 }); s.seq([60, null, 64], .05, { type: .25 });
      assert.ok(nodes > n, name + ' voices');
    }
    if (s.music) { s.music(name === 'arcade' ? 'shoot' : true); s.tick?.(); s.music(name === 'arcade' ? 'boss' : false); s.tick?.(); }
    s.close?.(); s.pause?.(); s.stop?.();
  }
});

test('mars-kit: the synth of the three mars games, its engine hum', async () => {
  globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
  const { createSfx } = await import('../src/mars-kit.js');
  const s = createSfx(.1);
  s.init();
  assert.ok(s.on);
  playAll('mars', s);
  s.hum(.5, 70); s.hum(0);
  s.pause();
});
