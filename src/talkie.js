// talkie.js, the walkie-talkie of the proximity voice: the handheld radio (a chunky case in the
// player's colour, a stubby antenna, a speaker grille, an LED that goes red on air), the
// push-to-talk logic (hold n: a key, R3 on a pad, a touch button), the « kssht » of the squelch
// and the radio colour put on incoming voices. voice.js wires them together.
import * as THREE from 'three';

// ---------- the radio: ~16 cm tall, its origin in the palm ----------
const dark = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
const grey = new THREE.MeshLambertMaterial({ color: 0x55585f });
const bodyMats = new Map();
const bodyMat = (c) => { if (!bodyMats.has(c)) bodyMats.set(c, new THREE.MeshLambertMaterial({ color: c })); return bodyMats.get(c); };
const G = {
  body: new THREE.BoxGeometry(.062, .12, .034),
  cap: new THREE.CylinderGeometry(.031, .031, .034, 16),   // half sunk in the case: a rounded top
  grille: new THREE.BoxGeometry(.046, .004, .003),
  knob: new THREE.CylinderGeometry(.009, .009, .014, 12),
  ant: new THREE.CylinderGeometry(.0045, .006, .075, 8),
  tip: new THREE.SphereGeometry(.007, 8, 6),
  led: new THREE.SphereGeometry(.0055, 8, 6),
  ptt: new THREE.BoxGeometry(.006, .03, .014),
};
export function talkieModel(color = 0xd9a125) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); g.add(o); return o; };
  add(G.body, bodyMat(color), 0, .06, 0);
  add(G.cap, bodyMat(color), 0, .12, 0, Math.PI / 2);
  for (let k = 0; k < 6; k++) add(G.grille, dark, 0, .03 + k * .009, .0175);
  add(G.knob, grey, -.018, .15, 0);
  add(G.ant, dark, .018, .17, 0);
  add(G.tip, dark, .018, .21, 0);
  add(G.ptt, dark, -.033, .075, 0);
  const ledM = new THREE.MeshBasicMaterial({ color: 0x3a1010 });
  add(G.led, ledM, .004, .128, .017);
  return { g, led(on) { ledM.color.setHex(on ? 0xff2a2a : 0x3a1010); } };
}

// ---------- push to talk ----------
// the modes left: off, or the walkie (an old saved « open » mic becomes the walkie)
export const normMode = (m) => m === 'off' || !m ? 'off' : 'ptt';
// ready(): the mic is open · join(): asks for it (→ Promise<bool>) · talk(on): on air or not
// The first press asks for the mic; if the button is still held when it comes, it talks.
export function createPtt({ ready, join, talk }) {
  let held = false, on = false, asking = false;
  const set = (v) => { if (v === on) return; on = v; talk(v); };
  return {
    get held() { return held; }, get on() { return on; },
    down() {
      if (held) return;
      held = true;
      if (ready()) { set(true); return; }
      if (asking) return;
      asking = true;
      Promise.resolve(join()).then((ok) => { asking = false; if (ok && held && ready()) set(true); }, () => { asking = false; });
    },
    up() { held = false; set(false); },
  };
}

// ---------- the sound of the radio ----------
// the « kssht » and a short beep, press (up) or release (down), into dest
export function squelch(ctx, noiseBuf, dest, press = true) {
  const t = ctx.currentTime;
  if (noiseBuf) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .7;
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.16, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + (press ? .09 : .16));
    n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random()); n.stop(t + .2);
  }
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(press ? 1250 : 1500, t + .02); o.frequency.setValueAtTime(press ? 1500 : 1050, t + .07);
  const og = ctx.createGain(); og.gain.setValueAtTime(0, t); og.gain.setValueAtTime(.035, t + .02); og.gain.setValueAtTime(.035, t + .11); og.gain.linearRampToValueAtTime(0, t + .125);
  o.connect(og); og.connect(dest); o.start(t); o.stop(t + .15);
}

// through the radio: full up to 60 % of the range, then fading to nothing at the range, with static
// growing near the edge; a wall or the ground in between only adds some crackle (and dulls a little)
export function radioLevel(d, range, blocked = false) {
  if (!(d < range)) return { voice: 0, hiss: 0, lp: 16000 };
  const edge = Math.max(0, (d - range * .6) / (range * .4));
  return { voice: 1 - edge, hiss: .07 * edge + (blocked ? .035 : 0), lp: blocked ? 2600 : 16000 };
}

// the radio's colour for a voice: 300–3400 Hz and a little grit. Returns { input, output, nodes }
let curve = null;
export function radioChain(ctx) {
  if (!curve) { curve = new Float32Array(512); for (let n = 0; n < 512; n++) { const x = n / 255.5 - 1; curve[n] = Math.tanh(2 * x) / Math.tanh(2); } }
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = .7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = .7;
  const pre = ctx.createGain(); pre.gain.value = 1.6;
  const ws = ctx.createWaveShaper(); ws.curve = curve;
  const post = ctx.createGain(); post.gain.value = .8;
  hp.connect(lp); lp.connect(pre); pre.connect(ws); ws.connect(post);
  return { input: hp, output: post, nodes: [hp, lp, pre, ws, post] };
}
