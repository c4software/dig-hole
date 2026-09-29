// church.js, what the village church hides: an organ that plays famous pieces (Bach, Pachelbel,
// Beethoven, plainchant: all public domain) for everyone in the garden at once, a
// vampire hunter's disc launcher in a secret drawer of the altar, and, by night, the bats that
// circle the belfry: silver discs, whirring, bouncing off walls, for whoever dares.
import * as THREE from 'three';
import { toolMat } from './tool.js';
import { metalSongs } from './orgue-metal.js';
import { listen, panner, place } from './lib/spatial.js';
import { organGain, FALLOFF, PIPES_Y } from './organ-hear.js';

// ---------- the pieces (all public domain): [start in beats, length in beats, midi notes…] ----------
// The Toccata in D minor (Bach): the mordent and fall, three times, an octave lower each time, in
// octaves; the pedal D, the diminished seventh piled up over it, the D minor chord; a running
// passage and the close. What plays when someone takes the vampire hunter's launcher.
function toccata() {
  const s = [];
  let t = 0;
  for (const o of [0, -12, -24]) {
    const n = (m) => [m + o, m + o - 12];
    s.push([t, .12, ...n(81)], [t + .12, .12, ...n(79)], [t + .24, 2.2, ...n(81)]);
    t += 3.2;
    [79, 77, 76, 74].forEach((m, k) => s.push([t + k * .28, .26, ...n(m)]));
    s.push([t + 1.12, .9, ...n(73)], [t + 2.1, 2.4, ...n(74)]);
    t += 5.4;
  }
  s.push([t, 7.6, 38]);
  [49, 52, 55, 58, 61, 64].forEach((m, k) => s.push([t + .6 + k * .32, 3.6 - k * .32, m]));
  s.push([t + 4.4, 3.2, 50, 53, 57, 62, 65, 69]);
  t += 8.2;
  const run = [81, 79, 81, 77, 79, 76, 77, 74, 76, 73, 74, 70, 69, 70, 73, 74, 76, 77, 79, 81, 82, 81, 79, 77, 76, 74, 73, 74];
  run.forEach((m, k) => s.push([t + k * .16, .15, m, m - 12]));
  t += run.length * .16 + .2;
  s.push([t, .6, 61, 64, 67, 70, 49], [t + .8, 5, 50, 57, 62, 65, 69, 74, 38]);
  return s;
}
// Jesu, Joy of Man's Desiring (Bach): the flowing triplets over the chorale's bass
function jesu() {
  const mel = [67, 69, 71, 74, 72, 72, 76, 74, 74, 79, 78, 79, 74, 71, 67, 69, 71, 72, 74, 76, 74, 72, 71, 69, 71, 67, 66, 67, 69, 62, 66, 69, 72, 71, 69, 71,
    67, 69, 71, 74, 72, 72, 76, 74, 74, 79, 78, 79, 74, 71, 67, 69, 71, 72, 62, 74, 72, 71, 69, 67, 62, 67, 66, 67];
  const bass = [[43, 55, 59], [43, 55, 59], [48, 55, 64], [43, 55, 59], [43, 59, 62], [48, 57, 64], [50, 57, 62], [43, 55, 59], [40, 55, 59], [45, 57, 60], [50, 54, 57], [43, 55, 59],
    [43, 55, 59], [48, 55, 64], [43, 55, 59], [43, 59, 62], [48, 57, 64], [50, 57, 62], [36, 55, 64], [50, 54, 57], [43, 50, 55], [43, 50, 55]];
  const s = mel.map((m, k) => [k / 3, .32, m]);
  bass.forEach((c, k) => s.push([k, .95, ...c]));
  s.push([mel.length / 3, 3, 43, 50, 55, 59, 67]);
  return s;
}
// the Canon in D (Pachelbel): the ground bass under three variations of the upper line
function canon() {
  const ground = [50, 45, 47, 42, 43, 38, 43, 45];
  const chords = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [57, 61, 66], [55, 59, 62], [54, 57, 62], [55, 59, 62], [57, 61, 64]];
  const lines = [[78, 76, 74, 73, 71, 69, 71, 73], [74, 73, 71, 69, 67, 66, 67, 64], [74, 78, 81, 79, 78, 74, 78, 76, 74, 71, 74, 81, 79, 83, 81, 79]];
  const s = [];
  let t = 0;
  for (let v = 0; v < 4; v++) {
    ground.forEach((b, k) => { s.push([t + k * 2, 1.95, b, b - 12]); s.push([t + k * 2, 1.95, ...chords[k].map(m => m - 12)]); });
    const line = lines[Math.min(v, 2)], step = 16 / line.length;
    if (v > 0) line.forEach((m, k) => s.push([t + k * step, step * .95, m]));
    if (v === 3) lines[0].forEach((m, k) => s.push([t + k * 2, 1.9, m - 12]));
    t += 16;
  }
  s.push([t, 4, 38, 50, 62, 66, 69, 74]);
  return s;
}
// Ode to Joy (Beethoven): the tune in octaves over simple chords
function ode() {
  const tune = [[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, .5], [62, 2],
    [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, .5], [60, 2]];
  const harm = [[48, 55], [43, 50], [48, 55], [43, 50], [48, 55], [43, 50], [48, 55], [43, 48]];
  const s = [];
  let t = 0;
  for (const [m, l] of tune) { s.push([t, l * .92, m + 12, m]); t += l; }
  harm.forEach((c, k) => s.push([k * 4, 3.9, ...c]));
  s.push([t, 3, 36, 48, 55, 60, 64, 72]);
  return s;
}
// Dies irae (plainchant): the day of wrath, slow, in octaves over a low drone
function dies() {
  const chant = [[65, 1], [64, 1], [65, 1], [62, 1], [64, 1], [60, 1], [62, 2], [62, 2],
    [65, 1], [65, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [65, 1], [64, 1], [62, 2], [62, 3]];
  const s = [];
  let t = 0;
  for (const [m, l] of chant) { s.push([t, l * .95, m, m - 12, m - 24]); t += l; }
  s.push([0, t, 26, 38], [0, t / 2, 45], [t / 2, t / 2, 43]);
  s.push([t, 5, 26, 38, 50, 53, 57, 62]);
  return s;
}
// name, the piece, seconds a beat; then the cathedral metal (orgue-metal.js), after the dies irae
// so the pieces before keep their places. Scores in time order: they are fed a little at a time
export const SONGS = [
  { name: 'toccata et fugue en ré mineur · j.-s. bach', score: toccata(), beat: .5 },
  { name: 'jésus que ma joie demeure · j.-s. bach', score: jesu(), beat: .62 },
  { name: 'canon en ré · pachelbel', score: canon(), beat: .45 },
  { name: 'ode à la joie · beethoven', score: ode(), beat: .5 },
  { name: 'dies irae · plain-chant', score: dies(), beat: .75 },
  ...metalSongs(toccata),
].map(p => ({ ...p, score: p.score.sort((a, b) => a[0] - b[0]), length: p.score.reduce((a, [t, l]) => Math.max(a, t + l), 0) * p.beat + 3 }));

export function createOrgan({ parent, at, rot = 0 }) {
  // the instrument: a case of pipes against the wall, a console with two keyboards and a bench
  const g = new THREE.Group(); g.position.copy(at); g.rotation.y = rot; parent.add(g);
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3422 }), dark = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });
  const tin = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: .85, roughness: .28 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .3 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  box(3.4, 5.2, .8, wood, 0, 2.6, -.4);
  box(3.6, .25, 1, gold, 0, 5.3, -.4);
  // the pipes: tallest in the middle, in three flats
  const pipes = [];
  const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  for (let k = 0; k < 15; k++) {
    const x = -1.5 + k * (3 / 14), h = 1.6 + (1 - Math.abs(k - 7) / 7) * 2.1 + (k % 2) * .25, r = .06 + (1 - Math.abs(k - 7) / 7) * .04;
    const p = new THREE.Mesh(pipeGeo, tin); p.scale.set(r, h, r); p.position.set(x, 2.2 + h / 2, .05); g.add(p);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, .08, .01), dark); mouth.position.set(x, 2.35, .05 + r); g.add(mouth);
    pipes.push(p);
  }
  // the console: two manuals, stops, a music rest, a bench
  box(1.8, 1, .7, wood, 0, .5, .6);
  const keys = new THREE.MeshBasicMaterial({ color: 0xf2eee4 });
  for (const [y, z] of [[1.02, .72], [1.14, .6]]) { box(1.5, .04, .18, keys, 0, y, z); box(1.5, .05, .02, dark, 0, y + .02, z - .1); }
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .06, 8), k % 3 ? keys : new THREE.MeshBasicMaterial({ color: 0xc8282e })); st.rotation.x = Math.PI / 2; st.position.set(s * (.82 + (k % 2) * .08), 1.1 + Math.floor(k / 2) * .09, .45); g.add(st); }
  box(.8, .5, .03, dark, 0, 1.45, .36);
  box(1.2, .08, .35, wood, 0, .5, 1.25); for (const s of [-1, 1]) box(.06, .5, .3, wood, s * .5, .25, 1.25);
  // the pipes glow a little while it plays
  const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, .6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.2), halo); glow.position.set(0, 4.2, .25); glow.userData.keep = true; g.add(glow);
  for (const p of pipes) p.userData.keep = true;
  g.updateMatrixWorld(true);
  const pipesAt = new THREE.Vector3();

  // ---------- the sound: additive pipes, a long stone reverb ----------
  // heard from the pipes (a panner, organ-hear.js), muffled by a lowpass through walls and ground;
  // the rhythm game at the console (lend) gets the whole mix, straight
  let ctx = null, out = null, drive = null, playing = null, lp = null, pan = null, spat = null, direct = null, wet = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = 0;
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2.6); }
    rev.buffer = ir;
    const dry = ctx.createGain(); dry.gain.value = .55; wet = ctx.createGain(); wet.gain.value = 0;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
    pan = panner(ctx, { ref: FALLOFF.ref, roll: FALLOFF.roll, max: 10000, model: 'equalpower' });
    spat = ctx.createGain(); spat.gain.value = 0; direct = ctx.createGain(); direct.gain.value = 0;
    out.connect(lp); lp.connect(dry); dry.connect(pan); pan.connect(spat); spat.connect(ctx.destination);
    lp.connect(rev); rev.connect(wet); wet.connect(ctx.destination);
    out.connect(direct); direct.connect(ctx.destination);
    // the metal registration: the plenum and reeds pushed through a soft clipper, some left clean
    drive = ctx.createGain();
    const pre = ctx.createGain(), ws = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), post = ctx.createGain(), clean = ctx.createGain();
    const curve = new Float32Array(1024);
    for (let n = 0; n < curve.length; n++) { const x = n / 511.5 - 1; curve[n] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
    ws.curve = curve; ws.oversample = '2x';
    pre.gain.value = 2.6; tone.type = 'lowpass'; tone.frequency.value = 4800; post.gain.value = .34; clean.gain.value = .5;
    drive.connect(pre); pre.connect(ws); ws.connect(tone); tone.connect(post); post.connect(out); drive.connect(clean); clean.connect(out);
    return ctx;
  }
  const PARTIALS = [[1, 1], [2, .5], [3, .22], [4, .2], [6, .08], [8, .06]];
  // the reeds: a trompette (a sawtooth) over the 8' and 4' flues
  const REEDS = [['sawtooth', 1, .45], ['sine', 1, .6], ['sine', 2, .3]];
  function voice(m, t0, dur, vel, dest = bus, reed = false) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const env = ctx.createGain(); env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(vel, t0 + .03); env.gain.setValueAtTime(vel, t0 + dur); env.gain.linearRampToValueAtTime(0, t0 + dur + .12);
    env.connect(dest);
    if (reed) {
      for (const [type, h, a] of REEDS) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * h * (type === 'sawtooth' ? 1.0015 : 1);
        const gg = ctx.createGain(); gg.gain.value = a; o.connect(gg); gg.connect(env);
        o.start(t0); o.stop(t0 + dur + .2);
      }
      return env;
    }
    for (const [h, a] of PARTIALS) {
      if (f * h > 9000) continue;
      const o = ctx.createOscillator(); o.frequency.value = f * h * (1 + (h === 2 ? .0012 : 0));
      const gg = ctx.createGain(); gg.gain.value = a; o.connect(gg); gg.connect(env);
      o.start(t0); o.stop(t0 + dur + .2);
    }
    return env;
  }
  // a piece from `offset` seconds in (someone else started it a little earlier); the one playing stops.
  // Its notes go to the audio clock a second and a half ahead (the metal pieces have thousands)
  let bus = null;
  function play(song = 0, offset = 0) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    stop();
    const S = SONGS[song % SONGS.length];
    bus = ctx.createGain(); bus.connect(S.metal ? drive : out);
    playing = { song, S, t0: ctx.currentTime + .05 - offset, i: 0, until: performance.now() / 1000 + S.length - offset };
    feed();
  }
  function feed() {
    if (!playing || !bus || !ctx) return;
    const P = playing, S = P.S, now = ctx.currentTime;
    while (P.i < S.score.length) {
      const e = S.score[P.i], [t, l, ...notes] = e, start = P.t0 + t * S.beat, end = start + l * S.beat;
      if (start > now + 1.5) break;
      P.i++;
      if (end < now) continue;
      // metal: the tune above the band
      const vel = .09 / Math.sqrt(notes.length) * (S.metal ? (e.acc ? .8 : 1.25) : 1);
      const at = Math.max(now, start);
      for (const m of notes) voice(m, at, end - at, vel, bus, S.metal);
    }
  }
  function stop() {
    if (!bus) return;
    const b = bus; bus = null; playing = null;
    b.gain.setTargetAtTime(0, ctx.currentTime, .08);
    setTimeout(() => b.disconnect(), 600);
  }
  // the rhythm game (orgue.js) borrows the pipes: the same voices and reverb, on its own buses
  let lent = false;
  function lend(on) { lent = on; if (!on || !ensure()) return null; if (ctx.state === 'suspended') ctx.resume(); return { ctx, out, drive, voice }; }
  return {
    group: g, play, stop, pipes, lend,
    get playing() { return !!playing; }, get song() { return playing ? playing.song : -1; },
    // loud in the church, still heard across the village and down the hole.
    // cam: the listener; hear: organ-hear.js { on, inside, lp, boost } (none: the old flat mix)
    update(dt, ear, cam = null, hear = null) {
      const on = playing && performance.now() / 1000 < playing.until;
      if (playing && !on) playing = null;
      feed();
      halo.opacity += ((on ? .12 + Math.random() * .05 : 0) - halo.opacity) * Math.min(1, dt * 4);
      if (!ctx) return;
      const t = ctx.currentTime, h = hear || { on: true, inside: true, lp: 20000, boost: 1 };
      out.gain.setTargetAtTime(on || lent ? 1 : 0, t, .2);
      if (!on && !lent) return;
      g.getWorldPosition(pipesAt); pipesAt.y += PIPES_Y;
      listen(ctx, cam); place(ctx, pan, pipesAt.x, pipesAt.y, pipesAt.z);
      const d = ear ? ear.distanceTo(pipesAt) : 999;
      // the stone's echo fills the nave; outside, it fades with the rest
      const room = lent ? .5 : !h.on ? 0 : h.inside ? .5 : .5 * Math.min(1, organGain(d) * 1.5);
      direct.gain.setTargetAtTime(lent ? .55 : 0, t, .15);
      spat.gain.setTargetAtTime(lent || !h.on ? 0 : h.boost, t, .15);
      wet.gain.setTargetAtTime(room, t, .2);
      lp.frequency.setTargetAtTime(lent ? 20000 : h.lp, t, .1);
    },
  };
}

// ---------- the disc launcher: in your hands, and its discs ----------
export function createDiscLauncher({ scene, camera, audio }) {
  const vm = new THREE.Group();
  const iron = toolMat(0x3a3a42, 'metal'), silver = toolMat(0xe8ecf2, 'metal'), wood = toolMat(0x6a3a22, 'soft'), velvet = toolMat(0x9a1a28, 'soft'), brass = toolMat(0xd9a64a, 'metal');
  const put = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); vm.add(o); return o; };
  // the body: a dark iron outline drawn side on (x forward), extruded, nose at -z
  const side = (pts, depth, m) => {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const q of pts.slice(1)) q.length === 4 ? sh.quadraticCurveTo(...q) : sh.lineTo(...q);
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - .01, bevelEnabled: true, bevelThickness: .005, bevelSize: .005, bevelSegments: 3, curveSegments: 12 });
    g.translate(0, 0, -(depth - .01) / 2); g.rotateY(Math.PI / 2); return put(g, m);
  };
  side([[-.14, -.025], [-.14, .02, -.1, .035], [.12, .035], [.2, .06], [.24, .02], [.24, -.035], [.1, -.04], [.02, -.03]], .06, iron);
  // the saw guard at the nose: a round iron housing, open in front, the silver disc spinning in it
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .05, 32, 1, true, Math.PI * 1.25, Math.PI * 1.5), iron);
  guard.rotation.set(0, 0, Math.PI / 2); guard.position.set(0, .02, -.27); vm.add(guard);
  // its two cheeks, open over the front quarter where the blade shows
  for (const x of [-.026, .026]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(.1, 32, Math.PI * (x > 0 ? .25 : 1.25), Math.PI * 1.5), iron); cap.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; cap.position.set(x, .02, -.27); vm.add(cap); }
  const blade = put(discGeo(.092), silver, 0, .02, -.27, 0, 0, Math.PI / 2);
  put(new THREE.CylinderGeometry(.02, .02, .07, 12), toolMat(0x9a8058, 'metal'), 0, .02, -.27, 0, 0, Math.PI / 2);
  // the magazine along the top: a slotted tube with the next discs showing through
  put(new THREE.CylinderGeometry(.034, .034, .2, 16, 1, true), iron, 0, .075, -.03, Math.PI / 2);
  for (let k = 0; k < 7; k++) put(new THREE.CylinderGeometry(.03, .03, .006, 16), silver, 0, .075, -.11 + k * .026, Math.PI / 2);
  for (const z of [-.13, .07]) put(new THREE.TorusGeometry(.035, .0035, 6, 18), brass, 0, .075, z);
  // the stock: dark carved wood, and the grip wrapped in red velvet with brass bands
  side([[.11, -.02], [.3, .01], [.38, -.02, .38, -.07], [.36, -.1], [.2, -.06], [.11, -.045]], .045, wood);
  put(new THREE.CylinderGeometry(.022, .026, .12, 12), velvet, 0, -.085, .06, -.3);
  for (const y of [-.035, -.13]) put(new THREE.TorusGeometry(.025, .003, 6, 14), brass, 0, y, .06 + (y + .085) * -.3, Math.PI / 2 - .3);
  // a silver cross on the flank, for the vampires
  put(new THREE.BoxGeometry(.004, .05, .012), silver, .033, 0, -.02);
  put(new THREE.BoxGeometry(.004, .012, .034), silver, .033, .01, -.02);
  vm.traverse(o => { o.renderOrder = 999; });
  vm.scale.setScalar(.8); vm.visible = false;
  camera.add(vm);
  const REST = new THREE.Vector3(.27, -.17, -.58);
  let kick = 0, t = 0, cd = 0;

  // the discs in flight (yours and the others')
  const discs = [];
  const flyGeo = discGeo(.09), flyMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: .9, roughness: .2, emissive: 0x303844 });
  const tmp = new THREE.Vector3();
  function launch(from, dir, mine) {
    const m = new THREE.Mesh(flyGeo, flyMat); m.position.copy(from); m.castShadow = true; scene.add(m);
    const d = { m, pos: m.position, vel: dir.clone().multiplyScalar(24), size: 0, life: 3.2, bounces: 3, mine, stuck: 0 };
    discs.push(d);
    return d;
  }
  return {
    get held() { return vm.visible; }, set held(v) { vm.visible = v; },
    discs,
    // fire from the eye: returns the shot to send, or null while reloading
    fire(eye, dir) {
      if (cd > 0) return null;
      cd = .35; kick = 1;
      audio.laser?.();
      const from = tmp.copy(eye).addScaledVector(dir, .6);
      launch(from, dir, true);
      return { p: from.toArray().map(v => Math.round(v * 100) / 100), d: dir.toArray().map(v => Math.round(v * 1000) / 1000) };
    },
    remote(shot) { launch(new THREE.Vector3(...shot.p), new THREE.Vector3(...shot.d), false); },
    // solid(x, y, z): is there ground or a wall here; hit(disc): did it strike something (yours only)
    update(dt, moving, solid, hit) {
      t += dt; cd -= dt;
      kick = Math.max(0, kick - dt * 7);
      vm.position.copy(REST); vm.position.z += kick * .07; vm.rotation.set(kick * .3 + .05, .18, 0);
      if (moving) vm.position.y += Math.sin(t * 9) * .008;
      blade.rotation.x += dt * (kick ? 40 : 14);
      for (let n = discs.length - 1; n >= 0; n--) {
        const d = discs[n];
        d.life -= dt;
        if (d.stuck > 0) { d.stuck -= dt; if (d.stuck <= 0) d.life = 0; }
        else {
          d.vel.y -= 3 * dt;
          // move axis by axis: a wall turns the disc back, the floor skims it
          for (const a of ['x', 'y', 'z']) {
            const old = d.pos[a];
            d.pos[a] += d.vel[a] * dt;
            if (solid(d.pos.x, d.pos.y, d.pos.z)) {
              d.pos[a] = old;
              if (d.bounces-- <= 0) { d.stuck = 2.5; d.vel.set(0, 0, 0); audio.clink?.(); break; }
              d.vel[a] *= -.8; audio.clink?.();
            }
          }
          // it flies flat, like a saw blade, spinning
          d.m.rotation.y += dt * 40;
          if (d.mine && hit(d)) { d.life = 0; }
        }
        if (d.life <= 0) { scene.remove(d.m); discs.splice(n, 1); }
      }
    },
  };
}
// a flat toothed disc, facing +y
function discGeo(r) {
  const sh = new THREE.Shape();
  const T = 16;
  for (let k = 0; k <= T * 2; k++) {
    const a = k / (T * 2) * Math.PI * 2, rr = k % 2 ? r : r * .82;
    if (k === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.holes.push(new THREE.Path().absarc(0, 0, r * .22, 0, Math.PI * 2, true));
  const g = new THREE.ExtrudeGeometry(sh, { depth: r * .08, bevelEnabled: false });
  g.translate(0, 0, -r * .04); g.rotateX(Math.PI / 2);
  return g;
}

// ---------- the vampire bats round the belfry, by night ----------
export function createBats({ scene, center }) {
  const bats = [];
  const body = new THREE.MeshLambertMaterial({ color: 0x1a1418 }), eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .2, .2), toneMapped: false });
  const wingGeo = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(.5, .12); s.lineTo(.42, -.02); s.lineTo(.3, .02); s.lineTo(.2, -.06); s.lineTo(.1, -.02); s.lineTo(0, -.08); return s; })());
  for (let n = 0; n < 7; n++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), body); b.scale.set(1, .9, 1.3); g.add(b);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.025, 6, 4), eye); e.position.set(s * .05, .04, .14); g.add(e);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(.03, .08, 4), body); ear.position.set(s * .06, .13, .06); g.add(ear);
    }
    const wings = [-1, 1].map(s => { const p = new THREE.Group(); const w = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({ color: 0x2a1a22, side: THREE.DoubleSide })); w.scale.x = s; p.add(w); g.add(p); return p; });
    g.visible = false; scene.add(g);
    bats.push({ g, wings, ph: n * .9, r: 5 + (n % 3) * 3, h: 17 + (n % 4) * 3, sp: .35 + (n % 3) * .12, down: 0, back: 0, vy: 0 });
  }
  const tmp = new THREE.Vector3();
  return {
    bats,
    update(dt, t, night) {
      for (const b of bats) {
        if (b.back > 0) { b.back -= dt; b.g.visible = false; continue; }
        if (b.down > 0) {
          // hit: tumbling down, then gone for a while
          b.down -= dt; b.vy -= 9 * dt; b.g.position.y += b.vy * dt; b.g.rotation.x += dt * 12;
          if (b.down <= 0 || b.g.position.y < 0) { b.back = 40 + Math.random() * 30; b.g.visible = false; }
          continue;
        }
        b.g.visible = night > .5;
        if (!b.g.visible) continue;
        const a = t * b.sp + b.ph;
        b.g.position.set(center.x + Math.cos(a) * b.r + Math.sin(a * 2.3) * 1.5, b.h + Math.sin(a * 3.1) * 1.5, center.z + Math.sin(a) * b.r);
        b.g.rotation.set(0, -a, Math.sin(a * 2) * .3);
        const f = Math.sin(t * 16 + b.ph * 5) * .9;
        b.wings[0].rotation.z = f; b.wings[1].rotation.z = -f;
      }
    },
    // a disc passing: the bat it strikes, if any
    hit(p) {
      for (const b of bats) {
        if (!b.g.visible || b.down > 0 || b.back > 0) continue;
        if (tmp.copy(b.g.position).distanceTo(p) < .5) { b.down = 3; b.vy = 0; return b; }
      }
      return null;
    },
  };
}

// ---------- the reliquary at the foot of the altar: the launcher on red velvet ----------
export function createReliquary({ parent, at }) {
  const g = new THREE.Group(); g.position.copy(at); parent.add(g);
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a2a1a }), gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .8, roughness: .3 });
  const velvet = new THREE.MeshLambertMaterial({ color: 0x8a1420 });
  const box = (w, h, d, m, x, y, z, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  box(.9, .45, .5, wood, 0, .225, 0);
  box(.94, .04, .54, gold, 0, .45, 0);
  box(.82, .02, .42, velvet, 0, .47, 0);
  for (const s of [-1, 1]) box(.04, .5, .04, gold, s * .45, .25, -.25);
  // the lid, hinged at the back: open while the launcher waits in it
  const hinge = new THREE.Group(); hinge.position.set(0, .47, .25); hinge.userData.keep = true; g.add(hinge);
  box(.9, .06, .5, wood, 0, .03, -.25, hinge);
  box(.1, .012, .3, gold, 0, .065, -.25, hinge); box(.3, .012, .08, gold, 0, .065, -.3, hinge);
  // the launcher itself, a small copy of the one you'll hold
  const gun = new THREE.Group(); gun.position.set(0, .54, 0); gun.rotation.y = .3; gun.userData.keep = true; g.add(gun);
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: .8, roughness: .35 }), silver = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: .9, roughness: .2 });
  box(.1, .08, .5, iron, 0, 0, 0, gun);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .07, 20), silver); drum.rotation.z = Math.PI / 2; drum.position.set(0, .1, 0); gun.add(drum);
  box(.08, .1, .22, wood, 0, -.02, .32, gun);
  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sx = sc.getContext('2d'), sgr = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
  sgr.addColorStop(0, 'rgba(255,240,200,1)'); sgr.addColorStop(.35, 'rgba(255,210,120,.35)'); sgr.addColorStop(1, 'rgba(255,200,100,0)');
  sx.fillStyle = sgr; sx.fillRect(0, 0, 64, 64);
  const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  shine.scale.setScalar(.6); shine.position.set(0, .7, 0); g.add(shine);
  let t = 0, back = 0;
  return {
    group: g,
    get ready() { return back <= 0; },
    take(seconds) { back = seconds; },
    update(dt) {
      t += dt;
      if (back > 0) back = Math.max(0, back - dt);
      const open = back <= 0;
      hinge.rotation.x += ((open ? -1.9 : 0) - hinge.rotation.x) * Math.min(1, dt * 4);
      gun.visible = open; shine.visible = open;
      shine.material.opacity = .3 + Math.sin(t * 3) * .15;
    },
    get left() { return back; },
  };
}
