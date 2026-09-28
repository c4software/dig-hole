// orgue.js, orgue héros: a rhythm game at the church organ. You sit at the console, the notes
// come down a highway laid over the church (a 2D canvas), and you play them on the home row
// (d f j k · s d f j k l) as they cross the line: the organ itself sounds them (church.js's
// pipes and stone reverb), the other voices play by themselves; a missed note leaves a hole,
// a wrong one sounds sour. Long notes are held. Gold phrases, played through, fill the grand jeu:
// shift pulls all the stops out, the score doubles and the pipes blaze. Play badly and the
// congregation boos, the bats flee the pipes, the organ loses its wind.
// Together: the host picks the piece, sends when it starts, everyone plays it on their own organ,
// scores go round live; places by score (booed off: behind everyone who finished). Solo: two bots
// from the parish, their runs worked out from the seed.
import * as THREE from 'three';
import { SETLIST, SECTIONS, LEVELS, LANE_KEYS, makeChart } from './orgue-songs.js';
import { rng, hostOf, hexOf, ord } from './retro.js';

const MODES = [
  { id: 'facile', name: 'facile', sub: '4 couloirs · d f j k · des notes espacées, de longues tenues', help: 'd f j k : jouer les notes au passage de la ligne · shift : grand jeu', unit: 'score' },
  { id: 'normal', name: 'normal', sub: '5 couloirs · d f espace j k · la mélodie presque entière', help: 'd f espace j k : jouer · maintenir les notes longues · shift : grand jeu', unit: 'score' },
  { id: 'difficile', name: 'difficile', sub: '6 couloirs · s d f j k l · des accords', help: 's d f j k l : jouer · maintenir les notes longues · shift ou espace : grand jeu', unit: 'score' },
  { id: 'expert', name: 'expert', sub: '6 couloirs · toutes les notes, les accords à trois, peu de marge', help: 's d f j k l : jouer · maintenir les notes longues · shift ou espace : grand jeu', unit: 'score' },
];
const LANE_COL = { 4: ['#3fc25a', '#e8384f', '#f2c230', '#3a8ef0'], 5: ['#3fc25a', '#e8384f', '#f2c230', '#3a8ef0', '#f08a24'], 6: ['#3fc25a', '#e8384f', '#f2c230', '#3a8ef0', '#f08a24', '#b05ae0'] };
const KEY_LABEL = { KeyS: 's', KeyD: 'd', KeyF: 'f', KeyJ: 'j', KeyK: 'k', KeyL: 'l', Space: '␣' };
const BOTS = [['l\'abbé martin', 0x7a5ad8, .02], ['sœur cécile', 0x3a9ef0, -.03], ['le bedeau', 0xe8a030, -.07]];
const SKILL = { facile: .95, normal: .92, difficile: .89, expert: .86 };
const LEAD_IN = 3.2, PICK_TIME = 25;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = (n) => Math.round(n).toLocaleString('fr-FR');

export function createOrgue({ scene, camera, audio, ui, organ, church }) {
  const G = organ.group;
  let state = 'off';
  let seed = 1, mode = 'normal', L = LEVELS.normal, N = 5, keysOf = LANE_KEYS[5], cols = LANE_COL[5];
  let meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let seats = [], me = null;
  let pick = 0, pickT = 0, pickSent = -1;
  let chart = null, songI = 0, t0 = 0, songT = -LEAD_IN, lastPerf = 0, goSent = 0;
  let meter = .5, gauge = 0, gj = false, combo = 0, maxCombo = 0, score = 0, hitsN = 0, perfN = 0, total = 0, failed = false, failT = 0;
  let head = 0, broken = new Set(), lastOf = new Map(), held = new Map(), pressed = new Set(), flash = [], popups = [], gjFlash = 0;
  let drawFrom = 0, maxLen = 0;
  let sendT = 0, endT = 0, ended = false, result = null, clock = 0, live = false, humansN = 1;

  // ---------- the pipes' voice, borrowed from the organ ----------
  let A = null, accBus = null, accIdx = 0, noiseBuf = null;
  function openAudio() {
    A = organ.lend(true);
    if (!A) return;
    if (!noiseBuf) { noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1; }
    newBus();
  }
  function newBus() {
    if (!A) return;
    if (accBus) { const b = accBus; b.gain.setTargetAtTime(0, A.ctx.currentTime, .05); setTimeout(() => b.disconnect(), 500); }
    accBus = A.ctx.createGain(); accBus.connect(chart?.metal && A.drive ? A.drive : A.out);
  }
  const songNow = () => (performance.now() - t0) / 1000;
  const lat = () => A ? (A.ctx.outputLatency || A.ctx.baseLatency || 0) : 0;
  const audioAt = (st) => A ? Math.max(A.ctx.currentTime, A.ctx.currentTime + st - songNow() - lat()) : 0;
  // notes on the organ; the grand jeu adds the 16' and 4' ranks
  // (a metal piece: the reeds, through the drive)
  function sound(notes, at, dur, vel, bus) {
    if (!A) return [];
    const out = [], metal = !!chart?.metal;
    bus ??= metal && A.drive ? A.drive : A.out;
    for (const m of notes) {
      out.push(A.voice(m, at, dur, vel, bus, metal));
      if (gj) { out.push(A.voice(m + 12, at, dur, vel * .45, bus, metal)); if (m > 36) out.push(A.voice(m - 12, at, dur, vel * .35, bus, metal)); }
    }
    return out;
  }
  function cut(envs, at = A?.ctx.currentTime) {
    for (const e of envs) { try { if (e.gain.cancelAndHoldAtTime) e.gain.cancelAndHoldAtTime(at); else e.gain.cancelScheduledValues(at); e.gain.setTargetAtTime(0, at, .03); } catch {} }
  }
  // what plays by itself, a second ahead
  function schedule() {
    if (!A || !chart || failed) return;
    const ac = chart.accomp, ahead = songT + 1.1;
    while (accIdx < ac.length && ac[accIdx][0] < ahead) {
      const e = ac[accIdx++], [t, l, ...notes] = e;
      if (t + l < songT + .05) continue;
      const s0 = Math.max(t, songT);
      sound(notes, audioAt(s0), t + l - s0, .065 / Math.sqrt(notes.length) * (e.acc ? .8 : 1), accBus);
    }
  }
  // back in time with the song after a pause: what was scheduled goes, it starts again from here
  function resync() {
    newBus();
    for (const h of held.values()) cut(h.envs);
    held.clear();
    accIdx = 0;
    if (chart) while (accIdx < chart.accomp.length && chart.accomp[accIdx][0] + chart.accomp[accIdx][1] < songT) accIdx++;
  }
  function noise(dur, f, q, vol, at = A?.ctx.currentTime, type = 'bandpass') {
    if (!A) return;
    const s = A.ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = A.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + .01); g.gain.exponentialRampToValueAtTime(.001, at + dur);
    s.connect(fl); fl.connect(g); g.connect(A.out); s.start(at, Math.random() * .5); s.stop(at + dur + .05);
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // a missed note: the pipe wheezes; a wrong one: a sour cluster
  function wheeze(m) { noise(.28, hz(m), 9, .09); }
  function sour(m) { if (!A) return; const t = A.ctx.currentTime; A.voice(m + 1, t, .14, .045, A.out); A.voice(m + 6, t, .14, .04, A.out); noise(.12, 300, 1, .03); }
  // the organ runs out of wind: every pipe sags and dies
  function dying() {
    if (!A) return;
    const c = A.ctx, t = c.currentTime;
    for (const m of [38, 50, 57, 62, 65, 69]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(m), t); o.frequency.exponentialRampToValueAtTime(hz(m) * .45, t + 1.6);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = c.createGain(); g.gain.setValueAtTime(.035, t); g.gain.linearRampToValueAtTime(0, t + 1.7);
      o.connect(f); f.connect(g); g.connect(A.out); o.start(t); o.stop(t + 1.8);
    }
    noise(1.2, 500, .7, .06, t, 'lowpass');
  }
  // the congregation: booing (low voices sliding down), clapping (a rain of short noises)
  function boo() {
    if (!A) return;
    const c = A.ctx, t = c.currentTime + .3;
    for (let k = 0; k < 7; k++) {
      const f0 = 120 + Math.random() * 90, o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t + k * .05); o.frequency.linearRampToValueAtTime(f0 * .72, t + 1.9);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5 + Math.random() * 2; lg.gain.value = f0 * .03; lfo.connect(lg); lg.connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.03, t + .35); g.gain.linearRampToValueAtTime(0, t + 2);
      o.connect(f); f.connect(g); g.connect(A.out); o.start(t); o.stop(t + 2.1); lfo.start(t); lfo.stop(t + 2.1);
    }
  }
  function applause(n = 90, len = 3.2) {
    if (!A) return;
    const t = A.ctx.currentTime + .1;
    for (let k = 0; k < n; k++) { const u = Math.random(); noise(.05 + Math.random() * .04, 1200 + Math.random() * 1600, 1.4, .05 + Math.random() * .05, t + u * u * len); }
  }

  // ---------- the church reacts: pipes glow and puff, beams from the vault, the faithful, the bats ----------
  const deco = new THREE.Group(); deco.visible = false; G.add(deco);
  const add = (m) => new THREE.MeshBasicMaterial({ color: m, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const glows = organ.pipes.map((p, i) => {
    const m = new THREE.Mesh(p.geometry, add(0xffffff));
    m.position.copy(p.position); m.scale.set(p.scale.x * 1.45, p.scale.y * 1.02, p.scale.z * 1.45); m.renderOrder = 3;
    deco.add(m);
    return { m, i, v: 0, col: new THREE.Color() };
  }).sort((a, b) => a.m.position.x - b.m.position.x);
  const softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const puffs = [];
  for (let k = 0; k < 36; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.visible = false; deco.add(s); puffs.push({ s, life: 0, v: new THREE.Vector3() });
  }
  let puffK = 0;
  function puff(i, col) {
    const p = organ.pipes[i], q = puffs[puffK++ % puffs.length];
    q.s.position.set(p.position.x, p.position.y + p.scale.y / 2 + .05, p.position.z); q.s.scale.setScalar(.25);
    q.v.set((Math.random() - .5) * .3, 1.1 + Math.random() * .6, .25 + Math.random() * .2);
    q.s.material.color.set(col); q.life = 1; q.s.visible = true;
  }
  // three beams of light from the vault onto the pipes
  const beams = [-1.1, 0, 1.1].map((x, k) => {
    const geo = new THREE.CylinderGeometry(.18, .9, 5.5, 20, 1, true);
    const m = new THREE.Mesh(geo, add(0xffe0a0)); m.position.set(x, 5.2, 2.2); m.rotation.x = -.55; m.rotation.z = (k - 1) * -.25; m.renderOrder = 2;
    deco.add(m);
    return { m, v: 0 };
  });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.2), new THREE.MeshBasicMaterial({ map: softTex, color: 0xffc860, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.set(0, 4.1, .3); deco.add(aura);

  // the faithful in the pews, facing the altar (the pews: church-local x ±0.9..2.9, rows every 1.05 m)
  const flock = new THREE.Group(); flock.visible = false; scene.add(flock);
  const faithful = [];
  {
    const R = rng(4242), box = new THREE.BoxGeometry(1, 1, 1), ball = new THREE.SphereGeometry(1, 12, 8);
    const skin = new THREE.MeshLambertMaterial({ color: 0xf0c8a0 });
    const cloth = [0x5a3a6a, 0x2a4a78, 0x7a2a2a, 0x3a5a3a, 0x8a6a3a, 0x4a4a52, 0x9a4a6a, 0x2a2a30];
    const hairs = [0x2a1a10, 0x6a4020, 0xd8d0c0, 0x1a1a1a, 0xa86a30];
    const cx = church.altar.x, cz = church.altar.z - 11.5;
    const taken = new Set();
    while (faithful.length < 16) {
      const row = Math.floor(R() * 11), side = R() < .5 ? -1 : 1, slot = Math.floor(R() * 3), key = row + ':' + side + ':' + slot;
      if (taken.has(key)) continue;
      taken.add(key);
      const lx = side * (1.2 + slot * .72), lz = -8.6 + row * 1.05;
      const f = new THREE.Group(); f.position.set(cx - lx, .47, cz - lz); flock.add(f);
      const body = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: cloth[Math.floor(R() * cloth.length)] })); body.scale.set(.4, .5, .26); body.position.y = .25; f.add(body);
      const hd = new THREE.Group(); hd.position.y = .63; f.add(hd);
      const h = new THREE.Mesh(ball, skin); h.scale.setScalar(.12); hd.add(h);
      const hair = new THREE.Mesh(ball, new THREE.MeshLambertMaterial({ color: hairs[Math.floor(R() * hairs.length)] })); hair.scale.set(.125, .09, .125); hair.position.set(0, .04, -.015); hd.add(hair);
      const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .23, .45, 0); f.add(a); const m = new THREE.Mesh(box, body.material); m.scale.set(.09, .38, .09); m.position.y = -.17; a.add(m); return a; });
      faithful.push({ f, hd, arms, ph: R() * 6.28, y0: .47, mood: 0 });
    }
  }
  function flockPose(t) {
    // mood: 0 listening, 1 cheering (up, arms high, hopping), -1 booing (up, fists shaking)
    for (const p of faithful) {
      const k = p.mood;
      p.f.position.y = p.y0 + (k ? .28 + (k > 0 ? Math.max(0, Math.sin(t * 9 + p.ph)) * .12 : 0) : Math.sin(t * 1.5 + p.ph) * .005);
      p.arms[0].rotation.x = p.arms[1].rotation.x = k > 0 ? -2.8 + Math.sin(t * 12 + p.ph) * .3 : k < 0 ? -2.2 + Math.sin(t * 16 + p.ph) * .5 : 0;
      p.hd.rotation.y = k ? Math.sin(t * (k < 0 ? 7 : 2) + p.ph) * .4 : (p.ph - 3) * .05;
    }
  }
  // the bats: they live in the pipes and leave when it goes wrong
  const bats = [];
  {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .22, .03, -.05, .16, -.02, .09, 0, 0, 0, .16, -.02, .09, .05, 0, .1], 3));
    wingGeo.computeVertexNormals();
    const black = new THREE.MeshBasicMaterial({ color: 0x141018, side: THREE.DoubleSide });
    for (let k = 0; k < 16; k++) {
      const b = new THREE.Group(); b.visible = false; scene.add(b);
      const body = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), black); body.scale.set(1, .8, 1.5); b.add(body);
      const w = [1, -1].map(s => { const g = new THREE.Group(); g.scale.x = s; const m = new THREE.Mesh(wingGeo, black); g.add(m); b.add(g); return g; });
      bats.push({ b, w, v: new THREE.Vector3(), life: 0, ph: k });
    }
  }
  let batK = 0;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function flee(n) {
    for (let k = 0; k < n; k++) {
      const q = bats[batK++ % bats.length];
      G.localToWorld(q.b.position.set((Math.random() - .5) * 2.6, 3.4 + Math.random() * 2, .2));
      // out into the nave, up towards the vault
      G.localToWorld(_v.set((Math.random() - .5) * 6, 2 + Math.random() * 3, 5 + Math.random() * 4)).sub(q.b.position).normalize().multiplyScalar(4 + Math.random() * 3);
      q.v.copy(_v); q.life = 3.5; q.b.visible = true;
    }
  }

  // ---------- the camera: at the console, looking up the pipes ----------
  const EYE = new THREE.Vector3(0, 2.1, 2.95), AT = new THREE.Vector3(0, 3.05, -.2);
  const camP = new THREE.Vector3(), camL = new THREE.Vector3(), wideP = new THREE.Vector3(), wideL = new THREE.Vector3(), endL = new THREE.Vector3();
  let camFov = 72, shake = 0;
  function cam(dt) {
    G.localToWorld(camP.copy(EYE)); G.localToWorld(camL.copy(AT));
    if (state === 'pick' || state === 'count') {
      // a glide from the nave to the bench
      G.localToWorld(wideP.set(-2.6, 2.9, 7.6)); G.localToWorld(wideL.set(0, 2.6, 0));
      const k = state === 'pick' ? 0 : clamp(1 - (-songT - .6) / (LEAD_IN - .6), 0, 1), e = k * k * (3 - 2 * k);
      camP.lerpVectors(wideP, camP, e); camL.lerpVectors(wideL, camL, e);
      if (state === 'pick') camP.x += Math.sin(clock * .3) * .3;
    } else if (state === 'end' || failed) {
      // turning round to the congregation
      const k = clamp((clock - (failed ? failT + .4 : endT)) / 1.6, 0, 1), e = k * k * (3 - 2 * k);
      scene.localToWorld(endL.set(church.altar.x, 1.1, church.altar.z - 9));
      camL.lerp(endL, e); camP.y += e * .5;
    } else {
      const b = chart ? Math.pow(1 - ((songT / chart.beat) % 1 + 1) % 1, 4) : 0;
      camP.y += b * .012 * (gj ? 2 : 1);
    }
    if (shake > 0) { shake = Math.max(0, shake - dt); camP.x += (Math.random() - .5) * shake * .08; camP.y += (Math.random() - .5) * shake * .08; }
    camera.position.copy(camP); camera.up.set(0, 1, 0); camera.lookAt(camL);
    if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
  }

  // ---------- starting ----------
  function start({ seed: sd = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: sn = () => {}, opts = {} } = {}) {
    if (state !== 'off') stop();
    mode = LEVELS[opts?.mode] ? opts.mode : 'facile';
    L = LEVELS[mode]; N = L.lanes; keysOf = LANE_KEYS[N]; cols = LANE_COL[N];
    seed = sd >>> 0 || 1; meId = mid; hostId = h; isHost = hostId === meId; send = sn;
    humansN = humans.length;
    const pool = BOTS.filter(([, c]) => !humans.some(u => u.color === c));
    const list = humans.map(u => ({ id: u.id, name: u.me ? 'toi' : u.name, color: u.color, bot: false }));
    for (let n = 0; list.length < 3 && n < pool.length; n++) list.push({ id: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true, skill: clamp(SKILL[mode] + pool[n][2], .5, .99) });
    seats = list.map(u => ({ ...u, score: 0, combo: 0, failed: false, pct: 0, done: false, seen: 0 }));
    me = seats.find(s => s.id === meId);
    state = 'pick'; clock = 0; live = false;
    pick = rng(seed)() * SETLIST.length | 0; pickT = PICK_TIME; pickSent = -1;
    chart = null; songT = -LEAD_IN; ended = false; result = null; endT = 0;
    resetPlay();
    camFov = camera.fov;
    deco.visible = true; flock.visible = true;
    for (const p of faithful) p.mood = 0;
    organ.stop();
    cam(0);
  }
  function resetPlay() {
    meter = .5; gauge = 0; gj = false; combo = 0; maxCombo = 0; score = 0; hitsN = 0; perfN = 0; failed = false; failT = 0;
    head = 0; broken = new Set(); held.clear(); pressed.clear(); popups = []; gjFlash = 0; sendT = 0; goSent = 0;
    flash = new Array(6).fill(0);
  }
  // the first real frame: keys, sound, the highway (the menu's preview never gets there)
  function goLive() {
    live = true;
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
    openAudio();
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8';
    document.body.appendChild(cv); g2 = cv.getContext('2d');
  }
  // the host's choice, or what came from them: the countdown to the first beat
  function begin(i, inSec) {
    songI = i; chart = makeChart(i, mode);
    resetPlay();
    total = chart.gems.length;
    lastOf = new Map(); chart.gems.forEach((q, k) => lastOf.set(q.phrase, k));
    drawFrom = 0; maxLen = chart.gems.reduce((a, q) => Math.max(a, q.len), 0);
    t0 = performance.now() + inSec * 1000; songT = -inSec; lastPerf = performance.now();
    accIdx = 0; newBus();
    for (const s of seats) { s.score = 0; s.combo = 0; s.failed = false; s.done = false; if (s.bot) s.sim = simulate(s); }
    state = 'count';
    audio.tick();
  }
  // a parish bot's run, worked out ahead from the seed: its score at each note
  function simulate(s) {
    const R = rng(seed ^ (s.id.charCodeAt(1) * 7919)), tl = [];
    let sc = 0, cb = 0, ga = 0, on = false, onUntil = 0, br = new Set();
    for (const [k, q] of chart.gems.entries()) {
      if (on && q.t > onUntil) on = false;
      if (!on && ga >= .5) { on = true; onUntil = q.t + ga * 32 * chart.beat; ga = 0; }
      const hit = R() < s.skill, m = Math.min(4, 1 + Math.floor(cb / 10)) * (on ? 2 : 1);
      if (hit) { cb++; sc += (R() < s.skill - .15 ? 100 : 60) * m + (q.len ? q.len / chart.beat * 20 * m : 0); } else { cb = 0; br.add(q.phrase); }
      if (q.gold && lastOf.get(q.phrase) === k && !br.has(q.phrase)) ga = Math.min(1, ga + .25);
      tl.push([q.t, Math.round(sc), cb]);
    }
    return tl;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    if (live) { removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true); }
    live = false;
    for (const h of held.values()) cut(h.envs);
    held.clear();
    if (accBus && A) { const b = accBus; b.gain.setTargetAtTime(0, A.ctx.currentTime, .1); setTimeout(() => b.disconnect(), 800); }
    accBus = null; A = null;
    organ.lend(false);
    if (cv) { cv.remove(); cv = null; g2 = null; }
    deco.visible = false; flock.visible = false;
    for (const b of bats) { b.b.visible = false; b.life = 0; }
    seats = []; me = null; chart = null;
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
  }

  // ---------- playing ----------
  const songAt = (ts) => { const now = performance.now(); return ((ts && Math.abs(ts - now) < 1000 ? ts : now) - t0) / 1000; };
  const paused = () => performance.now() - lastPerf > 1000;
  function onKey(e) {
    if (e.repeat || state === 'off' || paused() || e.target?.closest?.('input, textarea')) return;
    if (state === 'pick') {
      if (!isHost) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { pick = (pick + SETLIST.length - 1) % SETLIST.length; audio.tick(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pick = (pick + 1) % SETLIST.length; audio.tick(); }
      else if (e.code === 'Enter' || e.code === 'Space') choose();
      return;
    }
    const lane = keysOf.indexOf(e.code);
    if (lane >= 0 && (state === 'play' || state === 'count')) { e.preventDefault(); press(lane, songAt(e.timeStamp)); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space' || e.code === 'Enter') grandJeu();
  }
  function onKeyUp(e) {
    const lane = keysOf.indexOf(e.code);
    if (lane >= 0) release(lane, songAt(e.timeStamp));
  }
  function choose() {
    if (state !== 'pick' || !isHost) return;
    begin(pick, LEAD_IN);
    send({ t: 'go', i: pick, in: LEAD_IN, m: mode });
    goSent = 1;
  }
  function press(lane, t) {
    pressed.add(lane);
    if (failed || !chart || state !== 'play' && state !== 'count' || t < -L.good - .3) return;
    const gems = chart.gems;
    let best = null, bd = 9;
    for (let k = head; k < gems.length && gems[k].t < t + L.good + .01; k++) {
      const q = gems[k];
      if (q.lane !== lane || q.j) continue;
      const d = Math.abs(q.t - t);
      if (d <= L.good && d < bd) { best = q; bd = d; }
    }
    if (best) hit(best, bd, t);
    else {
      // a wrong note: sour, the congregation frowns, the run stops (not in facile)
      const near = gems.slice(head).find(q => q.lane === lane);
      sour(near ? near.pitch : 60 + lane * 2);
      bump(-.025);
      if (mode !== 'facile') combo = 0;
      pop('fausse note', '#c86a5a', lane);
    }
  }
  function hit(q, d, t) {
    const perfect = d <= L.perfect;
    q.j = perfect ? 'p' : 'g';
    combo++; maxCombo = Math.max(maxCombo, combo); hitsN++; if (perfect) perfN++;
    score += (perfect ? 100 : 60) * mult();
    bump(gj ? .05 : mode === 'facile' ? .04 : .03);
    const dur = q.len ? q.len + .08 : Math.min(q.sound || .3, 4);
    const envs = sound(q.notes, A ? A.ctx.currentTime : 0, dur, (q.extra ? .07 : .1) / Math.sqrt(q.notes.length));
    if (q.len) held.set(q.lane, { q, envs, end: q.t + q.len });
    flash[q.lane] = 1;
    pipeFx(q.lane, 1);
    pop(perfect ? 'parfait !' : 'bien', perfect ? '#ffe27a' : '#bfe3ff', q.lane);
    if (q.gold && lastOf.get(q.phrase) === chart.gems.indexOf(q) && !broken.has(q.phrase)) {
      gauge = Math.min(1, gauge + .25); gjFlash = 1;
      pop('phrase dorée · grand jeu +', '#ffc83a', -1);
      audio.pickup(1);
    }
  }
  function release(lane, t) {
    pressed.delete(lane);
    const h = held.get(lane);
    if (!h) return;
    held.delete(lane);
    if (t < h.end - .12) { cut(h.envs); h.q.dropped = t; }
  }
  const mult = () => Math.min(4, 1 + Math.floor(combo / 10)) * (gj ? 2 : 1);
  function bump(v) {
    if (failed) return;
    meter = clamp(meter + v, 0, 1);
    if (meter <= 0) fail();
  }
  function grandJeu() {
    if (gj || gauge < .5 || failed || state !== 'play') return;
    gj = true; gjFlash = 1.4;
    pop('grand jeu !', '#ffd85a', -1);
    // every stop out: a tutti on the next notes, a gust through the pipes
    const nx = chart.gems.slice(head).find(q => !q.j);
    const m = nx ? nx.pitch : 62;
    if (A) { const t = A.ctx.currentTime; for (const n of [m - 24, m - 12, m, m + 7, m + 12]) A.voice(n, t, .7, .05, A.out); noise(.9, 900, .5, .07, t, 'lowpass'); }
    for (let k = 0; k < organ.pipes.length; k++) puff(k, 0xffe0a0);
    shake = .4;
  }
  function fail() {
    failed = true; failT = clock;
    for (const h of held.values()) cut(h.envs);
    held.clear();
    newBus(); dying(); boo();
    for (const p of faithful) p.mood = -1;
    flee(16);
    shake = .8; gj = false;
    send({ t: 's', sc: score, cb: 0, f: 1 });
  }
  function pipeFx(lane, k) {
    const a = Math.floor(lane * glows.length / N), b = Math.max(a + 1, Math.floor((lane + 1) * glows.length / N));
    const col = new THREE.Color(cols[lane]);
    for (let i = a; i < b; i++) { glows[i].v = Math.max(glows[i].v, k); glows[i].col.copy(col); }
    puff(glows[a + ((b - a) >> 1)].i, col);
    beams[Math.min(2, Math.floor(lane * 3 / N))].v = 1;
  }
  function pop(text, color, lane) { popups.push({ text, color, lane, t: 0 }); if (popups.length > 5) popups.shift(); }

  // ---------- network ----------
  const byId = (id) => seats.find(s => s.id === id);
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const s = byId(pid);
    if (s) s.seen = clock;
    if (fx.t === 'pick' && pid === hostId && state === 'pick') pick = fx.i | 0;
    else if (fx.t === 'go' && state === 'pick') begin(fx.i | 0, Math.max(.5, (+fx.in || LEAD_IN) - .05));
    else if (fx.t === 's' && s && s !== me) { s.score = fx.sc | 0; s.combo = fx.cb | 0; s.failed = !!fx.f; }
    else if (fx.t === 'end' && s && s !== me) { s.score = fx.sc | 0; s.failed = !!fx.f; s.pct = fx.p | 0; s.done = true; }
  }
  function peerLeft(id) {
    const s = byId(id);
    if (!s || s === me) return;
    seats.splice(seats.indexOf(s), 1);
    humansN = seats.filter(q => !q.bot).length;
    if (id === hostId) { hostId = hostOf(seats.filter(q => !q.bot), hostId); isHost = hostId === meId; }
  }

  // ---------- the frame ----------
  function update(dt, keys) {
    if (state === 'off') return;
    if (!live) goLive();
    const now = performance.now();
    const gap = now - lastPerf;
    lastPerf = now;
    dt = clamp(dt, 0, .05);
    clock += dt;
    if (state === 'pick') {
      pickT -= dt;
      if (isHost && pick !== pickSent) { pickSent = pick; send({ t: 'pick', i: pick }); }
      if (isHost && pickT <= 0) choose();
    } else if (state === 'count' || state === 'play') {
      // back from a pause: alone, the song waits; together, it went on without us
      if (gap > 1000) { if (humansN <= 1) t0 += gap - dt * 1000; songT = songNow(); resync(); }
      songT = songNow();
      if (state === 'count' && songT >= 0) state = 'play';
      if (isHost && goSent && goSent < 3 && songT > -LEAD_IN + goSent * .8) { send({ t: 'go', i: songI, in: -songT, m: mode }); goSent++; }
      schedule();
      judgeMisses();
      holds(dt, keys);
      if (gj) { gauge -= dt * .25 / (8 * chart.beat); if (gauge <= 0) { gauge = 0; gj = false; } }
      for (const s of seats) if (s.bot && s.sim) { let v = null; for (const e of s.sim) { if (e[0] > songT) break; v = e; } if (v) { s.score = v[1]; s.combo = v[2]; } }
      if (me) { me.score = Math.round(score); me.combo = combo; me.failed = failed; }
      sendT -= dt;
      if (sendT <= 0) { sendT = .3; send({ t: 's', sc: Math.round(score), cb: combo, f: failed ? 1 : 0 }); }
      if (songT > chart.length + .8 || (failed && humansN <= 1 && clock - failT > 3.2)) finish();
    } else if (state === 'end') {
      const waiting = seats.some(s => !s.bot && s !== me && !s.done);
      if (!ended && clock - endT > (waiting ? 7 : 4.5)) { ended = true; onEnd(outcome()); }
    }
    fx(dt);
    cam(dt);
    draw();
  }
  function judgeMisses() {
    const gems = chart.gems;
    while (head < gems.length && gems[head].j) head++;
    for (let k = head; k < gems.length && gems[k].t < songT - L.good; k++) {
      const q = gems[k];
      if (q.j) continue;
      q.j = 'm';
      if (failed) continue;
      combo = 0; broken.add(q.phrase);
      wheeze(q.pitch);
      bump(mode === 'facile' ? -.05 : mode === 'expert' ? -.085 : -.07);
      pop('raté', '#ff7a6a', q.lane);
      if (Math.random() < .35) flee(1);
    }
    while (head < gems.length && gems[head].j) head++;
  }
  function holds(dt, keys) {
    for (const [lane, h] of held) {
      if (songT >= h.end) { held.delete(lane); score += 20 * mult(); continue; }
      if (!keys.has(keysOf[lane])) { release(lane, songT); continue; }
      score += dt / chart.beat * 20 * mult();
      if (h.q.gold) gauge = Math.min(1, gauge + dt * .02);
      glowLane(lane, .7);
    }
  }
  function glowLane(lane, k) {
    const a = Math.floor(lane * glows.length / N), b = Math.max(a + 1, Math.floor((lane + 1) * glows.length / N));
    for (let i = a; i < b; i++) glows[i].v = Math.max(glows[i].v, k);
  }
  function finish() {
    if (state === 'end') return;
    state = 'end'; endT = clock;
    for (const h of held.values()) cut(h.envs);
    held.clear();
    if (me) { me.score = Math.round(score); me.done = true; me.pct = pct(); }
    for (const s of seats) if (s.bot && s.sim?.length) { s.score = s.sim[s.sim.length - 1][1]; s.done = true; }
    send({ t: 'end', sc: Math.round(score), f: failed ? 1 : 0, p: pct() });
    if (!failed) {
      applause(meter > .6 ? 130 : 70, meter > .6 ? 4 : 2.5);
      for (const p of faithful) p.mood = 1;
      if (placeOf() === 1) audio.win(); else audio.full();
    }
  }
  const pct = () => total ? Math.round(hitsN / total * 100) : 0;
  const order = () => [...seats].sort((a, b) => (a.failed - b.failed) || b.score - a.score);
  const placeOf = () => me ? 1 + order().indexOf(me) : 1;
  function outcome() {
    // booed off: behind everyone, a coin for the effort
    const place = failed ? seats.length + 1 : placeOf();
    return { place, of: seats.length, value: Math.round(score), time: chart ? chart.length : 0,
      text: `${failed ? 'hué par l\'assemblée' : ord(place) + ' place'} · ${fmtN(score)} pts · ${pct()} % des notes${failed ? '' : maxCombo >= 30 ? ' · série de ' + maxCombo : ''}` };
  }
  function fx(dt) {
    const t = clock;
    for (const g of glows) {
      g.v = Math.max(gj ? .55 + Math.sin(t * 8 + g.m.position.x * 3) * .2 : 0, g.v - dt * 2.6);
      g.m.material.opacity = failed ? 0 : g.v * .55;
      g.m.material.color.copy(gj ? g.col.clone().lerp(new THREE.Color(0xffd070), .6) : g.col);
    }
    for (const b of beams) { b.v = Math.max(gj ? .6 : state === 'end' && !failed ? .5 : 0, b.v - dt * 2); b.m.material.opacity = b.v * .09; b.m.material.color.set(gj ? 0xffd070 : 0xfff0d0); }
    aura.material.opacity = failed ? 0 : (gj ? .28 + Math.sin(t * 6) * .06 : 0) + gjFlash * .25 + (state === 'play' ? Math.min(combo, 40) / 40 * .08 : 0);
    gjFlash = Math.max(0, gjFlash - dt * 1.5);
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.4;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(.25 + (1 - p.life) * .7);
      p.s.material.opacity = Math.max(0, p.life) * .5;
      if (p.life <= 0) p.s.visible = false;
    }
    for (const q of bats) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.v.y += Math.sin(t * 6 + q.ph) * dt * 3;
      q.b.position.addScaledVector(q.v, dt);
      q.b.lookAt(_w.copy(q.b.position).add(q.v));
      const f = Math.sin(t * 28 + q.ph) * .9;
      q.w[0].rotation.z = f; q.w[1].rotation.z = f;
      if (q.life <= 0) q.b.visible = false;
    }
    flockPose(t);
    for (let k = 0; k < flash.length; k++) flash[k] = Math.max(0, flash[k] - dt * 5);
    for (const p of popups) p.t += dt;
    popups = popups.filter(p => p.t < .7);
  }

  // ---------- the highway, drawn over the church ----------
  let cv = null, g2 = null;
  function draw() {
    if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = g2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (state === 'pick') { drawPick(g, W, H); return; }
    if (!chart) return;
    drawHighway(g, W, H);
  }
  function txt(g, s, x, y, size, color, align = 'center', font = 'Titan One', stroke = 5) {
    g.font = `${font === 'Titan One' ? 400 : 800} ${size}px '${font}', Rubik, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = 'rgba(26,19,13,.95)'; if (stroke) g.strokeText(s, x, y);
    g.fillStyle = color; g.fillText(s, x, y);
  }
  // the setlist by section, a window of rows that follows the choice when it doesn't all fit
  function drawPick(g, W, H) {
    const rows = [];
    SETLIST.forEach((S, i) => { if (!i || S.section !== SETLIST[i - 1].section) rows.push({ head: SECTIONS[S.section] }); rows.push({ i, S }); });
    const top = Math.max(200, H * .3), w = Math.min(560, W - 40), rowH = clamp((H - top - 120) / rows.length, 26, 34);
    const fit = Math.max(4, Math.min(rows.length, Math.floor((H - top - 126) / rowH)));
    const at = rows.findIndex(r => r.i === pick), from = clamp(at - Math.floor(fit / 2), 0, rows.length - fit);
    const h = 110 + rowH * fit, x = (W - w) / 2, y = Math.max(top, H - h - 16);
    g.fillStyle = 'rgba(26,19,13,.82)'; round(g, x, y, w, h, 18); g.fill();
    g.strokeStyle = 'rgba(255,176,32,.6)'; g.lineWidth = 3; g.stroke();
    txt(g, 'orgue héros · ' + mode, W / 2, y + 34, 26, '#ffdc8f');
    rows.slice(from, from + fit).forEach((r, k) => {
      const yy = y + 70 + k * rowH, mid = yy + (rowH - 6) / 2;
      if (r.head) { txt(g, r.head, x + 24, mid, Math.min(15, rowH * .45), r.head === SECTIONS[1] ? '#ff7a4a' : '#ffdc8f', 'left', 'Titan One', 0); return; }
      const on = r.i === pick;
      if (on) { g.fillStyle = r.S.metal ? 'rgba(255,110,60,.92)' : 'rgba(255,176,32,.9)'; round(g, x + 14, yy, w - 28, rowH - 6, 10); g.fill(); }
      const [name, who] = r.S.name.split(' · ');
      txt(g, name, x + 30, mid, Math.min(18, rowH * .5), on ? '#1a130d' : '#f6ecd8', 'left', 'Rubik', 0);
      txt(g, who || '', x + w - 30, mid, Math.min(14, rowH * .4), on ? '#3a2410' : '#b8a888', 'right', 'Rubik', 0);
    });
    if (from > 0) txt(g, '▲', x + w - 22, y + 58, 12, '#ffdc8f', 'center', 'Rubik', 0);
    if (from + fit < rows.length) txt(g, '▼', x + w - 22, y + h - 44, 12, '#ffdc8f', 'center', 'Rubik', 0);
    const host = seats.find(s => s.id === hostId);
    txt(g, isHost ? `↑ ↓ choisir · entrée ou espace : jouer · ${Math.max(0, Math.ceil(pickT))} s` : `${host?.name ?? 'l\'hôte'} choisit le morceau…`, W / 2, y + h - 24, 15, '#ffdc8f', 'center', 'Rubik', 0);
  }
  function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawHighway(g, W, H) {
    const hw = Math.min(W * .46, 600, H * .85), hitY = H - Math.max(60, H * .1), farY = H * .3, K = 2.6;
    const vy = (farY * (1 + K) - hitY) / K, s = (z) => 1 / (1 + K * z);
    const Y = (z) => vy + (hitY - vy) * s(z), X = (p, z) => W / 2 + (p - N / 2) * (hw / N) * s(z);
    const zOf = (t) => (t - songT) / L.look, Z0 = -.07;
    const dead = failed;
    // the board: dark oak, gold edged in the grand jeu
    g.beginPath(); g.moveTo(X(0, 1), Y(1)); g.lineTo(X(N, 1), Y(1)); g.lineTo(X(N, Z0), Y(Z0)); g.lineTo(X(0, Z0), Y(Z0)); g.closePath();
    const bg = g.createLinearGradient(0, Y(1), 0, Y(Z0));
    bg.addColorStop(0, 'rgba(20,12,8,0)'); bg.addColorStop(.25, dead ? 'rgba(40,20,20,.55)' : gj ? 'rgba(80,52,10,.7)' : 'rgba(28,17,10,.7)'); bg.addColorStop(1, dead ? 'rgba(50,20,20,.85)' : gj ? 'rgba(110,70,10,.88)' : 'rgba(30,18,10,.86)');
    g.fillStyle = bg; g.fill();
    g.lineWidth = gj ? 4 : 2; g.strokeStyle = gj ? `rgba(255,210,90,${.7 + Math.sin(clock * 10) * .3})` : 'rgba(255,220,150,.35)'; g.stroke();
    for (let i = 1; i < N; i++) { g.beginPath(); g.moveTo(X(i, 1), Y(1)); g.lineTo(X(i, Z0), Y(Z0)); g.strokeStyle = 'rgba(255,220,160,.12)'; g.lineWidth = 1; g.stroke(); }
    // beats and bars
    const bt = chart.beat;
    for (let b = Math.ceil((songT + Z0 * L.look) / bt); b * bt < songT + L.look; b++) {
      const z = zOf(b * bt);
      if (z < Z0 || b < 0) continue;
      g.beginPath(); g.moveTo(X(0, z), Y(z)); g.lineTo(X(N, z), Y(z));
      g.strokeStyle = `rgba(255,220,160,${(b % 4 ? .07 : .2) * (1 - z)})`; g.lineWidth = b % 4 ? 1 : 2.5; g.stroke();
    }
    // the progress through the piece
    const pw = X(N, 1) - X(0, 1), pr = clamp(songT / chart.length, 0, 1);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(X(0, 1), Y(1) - 10, pw, 4); g.fillStyle = '#ffb020'; g.fillRect(X(0, 1), Y(1) - 10, pw * pr, 4);
    // the line and its keys
    const lw = hw / N;
    for (let i = 0; i < N; i++) {
      const cx = X(i + .5, 0), r = lw * .34, on = pressed.has(i);
      g.beginPath(); g.ellipse(cx, hitY, r, r * .5, 0, 0, Math.PI * 2);
      g.fillStyle = on ? cols[i] : 'rgba(20,12,8,.8)'; g.fill();
      g.lineWidth = 4; g.strokeStyle = cols[i]; g.stroke();
      if (flash[i] > 0) { g.beginPath(); g.ellipse(cx, hitY, r * (1 + (1 - flash[i]) * .8), r * .5 * (1 + (1 - flash[i]) * .8), 0, 0, Math.PI * 2); g.strokeStyle = `rgba(255,250,220,${flash[i]})`; g.lineWidth = 6 * flash[i]; g.stroke(); }
      txt(g, KEY_LABEL[keysOf[i]] || '?', cx, hitY + r * .5 + 16, 16, on ? '#fff' : '#e8d8b8', 'center', 'Rubik', 4);
    }
    // the notes, far to near
    const gems = chart.gems;
    const vis = [];
    while (drawFrom < gems.length && gems[drawFrom].t < songT - 1 - maxLen) drawFrom++;
    for (let k = drawFrom; k < gems.length; k++) {
      const q = gems[k];
      if (q.t > songT + L.look) break;
      vis.push(q);
    }
    for (let k = vis.length - 1; k >= 0; k--) {
      const q = vis[k], z = zOf(q.t);
      const holding = held.get(q.lane)?.q === q;
      const col = dead || q.j === 'm' ? '#6a625a' : gj ? '#ffe9a8' : cols[q.lane];
      if (q.len) {
        const zt = Math.min(1, zOf(q.dropped != null ? Math.max(q.t, q.dropped) : q.t + q.len)), zh = holding ? 0 : Math.max(Z0, z);
        if (zt > zh && !(q.j && q.j !== 'm' && !holding && q.dropped == null && songT > q.t + q.len)) {
          const c = q.lane + .5, w0 = lw * .12 * s(zh), w1 = lw * .12 * s(zt);
          g.beginPath(); g.moveTo(X(c, zh) - w0, Y(zh)); g.lineTo(X(c, zt) - w1, Y(zt)); g.lineTo(X(c, zt) + w1, Y(zt)); g.lineTo(X(c, zh) + w0, Y(zh)); g.closePath();
          g.fillStyle = q.dropped != null || q.j === 'm' ? 'rgba(110,100,90,.6)' : col; g.globalAlpha = holding ? .95 : .7; g.fill(); g.globalAlpha = 1;
          if (holding) { g.strokeStyle = `rgba(255,255,240,${.5 + Math.sin(clock * 30) * .3})`; g.lineWidth = 2; g.stroke(); }
        }
      }
      if (q.j && q.j !== 'm') continue;
      if (z < Z0 || z > 1) continue;
      const cx = X(q.lane + .5, z), cy = Y(z), r = lw * .33 * s(z), fade = z > .85 ? (1 - z) / .15 : 1;
      g.globalAlpha = fade;
      // a stop knob seen from above: a coloured rim, an ivory face
      g.beginPath(); g.ellipse(cx, cy + r * .12, r, r * .55, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.55)'; g.fill();
      g.beginPath(); g.ellipse(cx, cy, r, r * .52, 0, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      g.beginPath(); g.ellipse(cx, cy - r * .06, r * .62, r * .3, 0, 0, Math.PI * 2); g.fillStyle = q.j === 'm' || dead ? '#8a8278' : q.gold ? '#fff2b0' : '#f6efe0'; g.fill();
      if (q.gold && !dead && q.j !== 'm') { g.beginPath(); g.ellipse(cx, cy, r * 1.12, r * .6, 0, 0, Math.PI * 2); g.strokeStyle = `rgba(255,214,90,${.6 + Math.sin(clock * 12) * .35})`; g.lineWidth = 2.5; g.stroke(); }
      g.globalAlpha = 1;
    }
    // ferveur (left) and grand jeu (right)
    const mh = Math.min(260, hitY - farY - 40), mx0 = X(0, 0) - 44, mx1 = X(N, 0) + 26, my = hitY - mh;
    g.fillStyle = 'rgba(26,19,13,.8)'; round(g, mx0 - 4, my - 4, 26, mh + 8, 8); g.fill();
    const mg = g.createLinearGradient(0, my + mh, 0, my); mg.addColorStop(0, '#e8384f'); mg.addColorStop(.45, '#f2c230'); mg.addColorStop(1, '#3fc25a');
    g.fillStyle = mg; g.fillRect(mx0, my, 18, mh);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(mx0, my, 18, mh * (1 - meter));
    const ny = my + mh * (1 - meter);
    g.beginPath(); g.moveTo(mx0 - 8, ny - 7); g.lineTo(mx0 + 2, ny); g.lineTo(mx0 - 8, ny + 7); g.fillStyle = '#fff'; g.fill();
    if (meter < .25 && !dead && Math.sin(clock * 14) > 0) { g.strokeStyle = '#ff4a3a'; g.lineWidth = 3; round(g, mx0 - 4, my - 4, 26, mh + 8, 8); g.stroke(); }
    g.save(); g.translate(mx0 - 16, my + mh / 2); g.rotate(-Math.PI / 2); txt(g, 'ferveur', 0, 0, 13, '#ffdc8f', 'center', 'Rubik', 4); g.restore();
    g.fillStyle = 'rgba(26,19,13,.8)'; round(g, mx1 - 4, my - 4, 26, mh + 8, 8); g.fill();
    g.fillStyle = gj ? `hsl(${45 + Math.sin(clock * 9) * 8},100%,62%)` : '#d9a125'; g.fillRect(mx1, my + mh * (1 - gauge), 18, mh * gauge);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(mx1, my + mh / 2 - 1, 18, 2);
    g.save(); g.translate(mx1 + 34, my + mh / 2); g.rotate(Math.PI / 2); txt(g, 'grand jeu', 0, 0, 13, '#ffdc8f', 'center', 'Rubik', 4); g.restore();
    if (gauge >= .5 && !gj && !dead && Math.sin(clock * 8) > -.3) txt(g, 'shift !', mx1 + 9, my - 18, 15, '#ffd85a', 'center', 'Rubik', 4);
    // score, the run, the multiplier
    const bx = X(0, 0) - 60, by = hitY + 4;
    txt(g, fmtN(score), X(0, 0) - 70, my + 20, 30, '#fff', 'right');
    txt(g, combo >= 2 ? `série ${combo}` : '', X(0, 0) - 70, my + 52, 15, '#ffdc8f', 'right', 'Rubik', 4);
    const m = dead ? 1 : mult(), mcx = X(N, 0) + 86, mcy = my + 30;
    g.beginPath(); g.arc(mcx, mcy, 26, 0, Math.PI * 2); g.fillStyle = 'rgba(26,19,13,.85)'; g.fill();
    g.beginPath(); g.arc(mcx, mcy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (combo >= 30 ? 1 : (combo % 10) / 10)); g.strokeStyle = gj ? '#ffd85a' : '#ffb020'; g.lineWidth = 5; g.stroke();
    txt(g, '×' + m, mcx, mcy + 1, 22, m >= 4 ? '#ffd85a' : '#fff');
    void bx; void by;
    // what the last notes were worth
    for (const p of popups) {
      const k = p.t / .7, x = p.lane >= 0 ? X(p.lane + .5, 0) : W / 2, y = (p.lane >= 0 ? hitY - 44 : Y(.45)) - k * 26;
      g.globalAlpha = 1 - k * k; txt(g, p.text, x, y, p.lane >= 0 ? 17 : 24, p.color); g.globalAlpha = 1;
    }
    if (state === 'count') { const n = Math.ceil(-songT); txt(g, n > 0 ? String(n) : '', W / 2, Y(.55), 64, '#ffdc8f'); txt(g, chart.name, W / 2, Y(.95) - 28, 18, '#fff', 'center', 'Rubik', 5); }
    if (dead) { txt(g, 'hué !', W / 2, Y(.5), 52, '#ff6a5a'); txt(g, 'l\'assemblée te hue · les chauves-souris s\'enfuient', W / 2, Y(.5) + 44, 16, '#ffdc8f', 'center', 'Rubik', 4); }
    if (state === 'end') {
      const bw = Math.min(420, W - 40), bh = 150, bx2 = (W - bw) / 2, by2 = Y(.62) - bh / 2;
      g.fillStyle = 'rgba(26,19,13,.88)'; round(g, bx2, by2, bw, bh, 16); g.fill(); g.strokeStyle = failed ? '#e8384f' : '#ffb020'; g.lineWidth = 3; g.stroke();
      txt(g, failed ? 'l\'assemblée a hué' : pct() >= 95 ? 'standing ovation !' : 'l\'assemblée applaudit', W / 2, by2 + 30, 24, failed ? '#ff8a7a' : '#ffdc8f');
      txt(g, fmtN(score) + ' pts', W / 2, by2 + 72, 34, '#fff');
      txt(g, `${pct()} % des notes · ${perfN} parfaites · plus longue série ${maxCombo}${failed ? '' : ` · ${ord(placeOf())} place`}`, W / 2, by2 + 116, 14, '#e8d8b8', 'center', 'Rubik', 0);
    }
  }

  const board = () => `<div class="board">${order().map((s, i) => `<span style="color:${hexOf(s.color)}">${i + 1}. ${s.id === meId ? '<em>toi</em>' : s.name} ${fmtN(s.score)}${s.failed ? ' · hué' : ''}</span>`).join('')}</div>`;
  return {
    modes: MODES,
    keys: [['d f j k', 'facile · les notes'], ['s d f j k l', 'difficile, expert'], ['maintenir', 'notes longues'], ['shift', 'grand jeu'], ['↑ ↓ entrée', 'choisir le morceau']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    hud() {
      if (state === 'off') return { hidden: true };
      if (state === 'pick') return { html: `<b>orgue héros · ${mode}</b><span>${isHost ? 'choisis le morceau' : 'l\'hôte choisit le morceau'}</span>` };
      return { html: `<b>orgue héros · ${mode}</b>${board()}` };
    },
    preview() {
      G.localToWorld(_v.set(0, 2.4, 1.2)); G.localToWorld(_w.set(0, 2.4, 0)).sub(_v);
      return { x: _v.x, y: _v.y, z: _v.z, yaw: Math.atan2(-_w.x, -_w.z) + Math.PI, rad: 3.4, h: .6 };
    },
    set onEnd(f) { onEnd = f; },
    // tests
    get state() { return state; }, get chart() { return chart; }, get songT() { return songT; }, get score() { return score; }, get combo() { return combo; },
    get meter() { return meter; }, get gauge() { return gauge; }, get gj() { return gj; }, get failed() { return failed; }, get seats() { return seats; },
    _choose(i) { if (state === 'pick') { pick = i; choose(); } },
    _skip() { if (state === 'count') { t0 -= -songT * 1000; songT = 0; resync(); } },
    _now: () => songNow(), _press: (lane, t = songNow()) => press(lane, t), _release: (lane, t = songNow()) => release(lane, t),
    _gauge(v) { gauge = v; }, _grandJeu: () => grandJeu(), _meter(v) { meter = v; bump(0); },
  };
}
