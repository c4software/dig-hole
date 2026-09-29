// kingyo.js, kingyo-sukui: scooping goldfish at the matsuri stall in the Japanese street. You lean
// over the tub with a paper poi: the mouse (or z q s d) moves it, click or space dips it, letting go
// lifts it, and a fish that had time to slide over the paper comes up with it. The paper soaks while
// it's in the water and tears when dragged fast; a heavy fish can break it on the way up. Three poi,
// sixty seconds; red fish 1, black 3, calico 5, the rare gold ones 10 (and quick). Everyone shares
// the tub: the fish swim the same paths for all (kingyo-rules.js), the host says who got a fish
// first, so a friend can scoop the one you were aiming at. Solo: two kids of the neighbourhood.
import * as THREE from 'three';
import { TUB, ROUND, POIS, POI_R, KINDS, spawnList, fishAt, alive, wear, scoop, ranking } from './kingyo-rules.js';
import { rng, hostOf, hexOf, ord } from './retro.js';

const BOTS = [['la petite yui', 0xf07aa8, .7], ['sōta, 8 ans', 0x3aa0e8, .55]];
const COUNT = 3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createKingyo({ camera, audio, ui, matsuri }) {
  const ST = matsuri.stall, C = new THREE.Vector3(ST.x, ST.y, ST.z);
  let state = 'off', seed = 1, meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let seats = [], me = null, fish = [], taken = new Map(), pending = new Set(), clock = 0, t = -COUNT, endT = 0, ended = false, live = false;
  let dipKey = false, dipMouse = false, sendT = 0, popups = [], camFov = 70;

  // ---------- the scene: the fish, the pois, the ripples, over the stall's own tub ----------
  const g = new THREE.Group(); g.position.copy(matsuri.tubG.position); g.visible = false; matsuri.root.add(g);
  const paperM = new THREE.MeshLambertMaterial({ color: 0xfbf8f0, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false });
  const ringGeo = new THREE.TorusGeometry(POI_R, .006, 6, 24), paperGeo = new THREE.CircleGeometry(POI_R - .003, 24);
  const shredGeo = new THREE.PlaneGeometry(.02, .035);
  function makePoi(color) {
    const p = new THREE.Group();
    const frame = new THREE.MeshLambertMaterial({ color });
    const ring = new THREE.Mesh(ringGeo, frame); ring.rotation.x = Math.PI / 2; p.add(ring);
    const paper = new THREE.Mesh(paperGeo, paperM); paper.rotation.x = -Math.PI / 2; paper.renderOrder = 4; p.add(paper);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.018, .008, .16), frame); handle.position.set(0, 0, POI_R + .075); p.add(handle);
    const shreds = [0, 1, 2, 3].map(k => { const s = new THREE.Mesh(shredGeo, paperM); const a = k * 1.6 + .4; s.position.set(Math.cos(a) * (POI_R - .012), -.012, Math.sin(a) * (POI_R - .012)); s.rotation.set(-1.2, a, 0); s.visible = false; p.add(s); return s; });
    g.add(p);
    return { p, paper, shreds };
  }
  // ripples where a poi enters the water
  const ripM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const ripples = Array.from({ length: 10 }, () => { const r = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 24), ripM.clone()); r.rotation.x = -Math.PI / 2; r.position.y = .004; r.visible = false; g.add(r); return { r, life: 0 }; });
  let ripK = 0;
  function ripple(x, z, big = 1) { const q = ripples[ripK++ % ripples.length]; q.r.position.x = x; q.r.position.z = z; q.life = 1; q.big = big; q.r.visible = true; }
  let fishMeshes = [];
  const flying = [];
  const _p = {};

  // ---------- starting ----------
  function start({ seed: sd = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: sn = () => {} } = {}) {
    if (state !== 'off') stop();
    seed = sd >>> 0 || 1; meId = mid; hostId = h; isHost = hostId === meId; send = sn;
    const list = humans.map(u => ({ id: u.id, name: u.me ? 'toi' : u.name, color: u.color, bot: false }));
    if (humans.length < 2) BOTS.forEach(([name, color, skill], n) => list.push({ id: 'b' + n, name, color, bot: true, skill }));
    seats = list.map((u, i) => ({ ...u, score: 0, fish: 0, kinds: [], out: false, poi: { x: -.6 + i * .6, z: .3, y: .08, dip: 0, wet: false, down: false, hp: 1, left: POIS, torn: 0, v: 0 }, target: null, think: 0, R: rng(seed + i * 101) }));
    me = seats.find(s => s.id === meId);
    for (const s of seats) s.mesh = makePoi(s.color);
    fish = spawnList(seed);
    fishMeshes.forEach(m => g.remove(m));
    fishMeshes = fish.map(f => { const m = matsuri.makeFish(f.kind); m.visible = false; g.add(m); return m; });
    taken = new Map(); pending = new Set(); popups = [];
    state = 'count'; clock = 0; t = -COUNT; ended = false; endT = 0; live = false;
    g.visible = true; matsuri.tubG.visible = false;
    camFov = camera.fov;
    place(0);
    cam();
  }
  function goLive() {
    live = true;
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8';
    document.body.appendChild(cv); g2 = cv.getContext('2d');
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    if (live) { removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true); }
    live = false;
    for (const s of seats) g.remove(s.mesh.p);
    seats = []; me = null;
    g.visible = false; matsuri.tubG.visible = true;
    if (cv) { cv.remove(); cv = null; g2 = null; }
    camera.fov = camFov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
  }
  const onKey = (e) => { if (e.code === 'Space' && !e.repeat) { dipKey = true; e.preventDefault(); } };
  const onKeyUp = (e) => { if (e.code === 'Space') dipKey = false; };

  // ---------- the camera: leaning over the tub from the street side ----------
  function cam() {
    const k = state === 'count' ? clamp(1 - (-t) / COUNT, 0, 1) : 1, e = k * k * (3 - 2 * k);
    camera.position.set(C.x, C.y + 1.6 - e * .55, C.z + 2.2 - e * 1.25);
    camera.up.set(0, 1, 0); camera.lookAt(C.x, C.y - .05, C.z - .08);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  }

  // ---------- the poi ----------
  const HX = TUB.w / 2 - POI_R * .6, HZ = TUB.d / 2 - POI_R * .6;
  function move(s, dx, dz) { s.poi.x = clamp(s.poi.x + dx, -HX, HX); s.poi.z = clamp(s.poi.z + dz, -HZ, HZ); }
  // one poi's frame: up and down, soaking, tearing, and the scoop when it comes up
  function poiStep(s, dt, want, px, pz) {
    const P = s.poi;
    if (s.out || P.torn > 0) { if (P.torn > 0) { P.torn -= dt; if (P.torn <= 0) nextPoi(s); } P.y += (.12 - P.y) * Math.min(1, dt * 6); return; }
    P.v = Math.hypot(P.x - px, P.z - pz) / Math.max(dt, 1e-3);
    const wasWet = P.wet;
    P.y += ((want ? -.025 : .08) - P.y) * Math.min(1, dt * 10);
    P.wet = P.y < 0;
    if (P.wet && !wasWet) { ripple(P.x, P.z, 1); if (s === me) audio.splash?.(); }
    if (P.wet) {
      P.dip += dt;
      P.hp = wear(P.hp, dt, P.v, true);
      if (P.v > .3 && Math.random() < dt * 8) ripple(P.x, P.z, .5);
      if (P.hp <= 0) return tear(s, null);
    }
    if (!P.wet && wasWet) {
      const r = scoop({ x: P.x, z: P.z, hp: P.hp, dip: P.dip }, fish, t, taken);
      P.dip = 0;
      if (r?.torn) { P.hp = 0; return tear(s, r.fish); }
      if (r) { P.hp = r.hp; claim(s, r.fish); }
    }
  }
  function tear(s, f) {
    const P = s.poi;
    P.torn = 1.2; P.hp = 0; P.wet = false; P.dip = 0;
    if (s === me) { audio.deny(); pop(f ? `le papier cède sous le ${KINDS[f.kind].name} !` : 'le papier se déchire !', '#ff8a7a', true); }
  }
  function nextPoi(s) {
    const P = s.poi;
    P.left--;
    if (P.left <= 0) { s.out = true; if (s === me) { pop('plus de poi !', '#ffdc8f', true); send({ t: 'out', sc: s.score }); } return; }
    P.hp = 1; P.torn = 0;
    if (s === me) { audio.tick(); pop(`nouveau poi · encore ${P.left}`, '#e8f4ff', true); }
  }
  // a fish came up on someone's paper: the host (or you, alone) says whose it is
  function claim(s, f) {
    if (isHost || s.bot) { grant(f.id, s.id); return; }
    pending.add(f.id); taken.set(f.id, s.id);
    fishMeshes[f.id].visible = false;
    send({ t: 'c', f: f.id });
  }
  function grant(fid, by) {
    const had = taken.get(fid);
    if (had && had !== by && !pending.has(fid)) { if (isHost) send({ t: 'got', f: fid, by: had }); return; }
    const mine = pending.has(fid);
    pending.delete(fid); taken.set(fid, by);
    if (mine && by !== meId) { const s2 = seats.find(q => q.id === by); pop(`volé par ${s2?.name ?? 'quelqu\'un'} !`, '#ff9a7a', true); audio.squeak?.(); }
    const s = seats.find(q => q.id === by), f = fish[fid];
    if (isHost) send({ t: 'got', f: fid, by });
    if (!s || !f) return;
    s.score += KINDS[f.kind].value; s.fish++; s.kinds.push(f.kind);
    // it flies up out of the water to its catcher's side
    const m = fishMeshes[fid]; m.visible = true;
    flying.push({ m, from: m.position.clone(), to: new THREE.Vector3(clamp(s.poi.x, -HX, HX), .35, TUB.d / 2 + .15), t: 0 });
    if (s === me) { audio.pickup(f.kind === 'or' ? 2 : 1); pop(`+${KINDS[f.kind].value} · ${KINDS[f.kind].name}`, f.kind === 'or' ? '#ffd23a' : '#ffe7c8'); }
  }

  // ---------- the neighbourhood's kids: pick a fish, creep up on it, dip, lift ----------
  function botStep(s, dt) {
    const P = s.poi, R = s.R;
    const px = P.x, pz = P.z;
    s.think -= dt;
    if (s.out || P.torn > 0) { poiStep(s, dt, false, px, pz); return; }
    if (!s.target || taken.has(s.target.id) || !alive(s.target, t, taken) || s.think <= 0) {
      s.think = 3 + R() * 3;
      const live2 = fish.filter(f => alive(f, t, taken));
      // the greedy ones go for gold, the careful ones for what's close
      let best = null, bs = -Infinity;
      for (const f of live2) { fishAt(f, t, _p); const sc = KINDS[f.kind].value * (R() < s.skill ? 1 : .2) - Math.hypot(_p.x - P.x, _p.z - P.z) * 4 + R(); if (sc > bs) { bs = sc; best = f; } }
      s.target = best; s.phase = 'go';
    }
    let want = false;
    if (s.target) {
      fishAt(s.target, t + .4, _p);
      const dx = _p.x - P.x, dz = _p.z - P.z, d = Math.hypot(dx, dz);
      // a careful kid moves slowly in the water, a hasty one tears paper
      const sp = P.wet ? .11 + (1 - s.skill) * .35 : .5;
      if (d > .01) move(s, dx / d * Math.min(d, sp * dt), dz / d * Math.min(d, sp * dt));
      want = d < .25 || (P.wet && P.dip < .5);
      if (P.wet && P.dip > .3 + R() * .2 && d < .04) want = false;
      if (P.dip > 2) want = false;
    }
    poiStep(s, dt, want, px, pz);
  }

  // ---------- network ----------
  const byId = (id) => seats.find(s => s.id === id);
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const s = byId(pid);
    if (fx.t === 'p' && s && s !== me) { s.net = { x: +fx.x || 0, z: +fx.z || 0, w: !!fx.w, hp: +fx.hp, left: fx.l | 0 }; s.score = fx.sc | 0; }
    else if (fx.t === 'c' && isHost && s) { const f = fish[fx.f | 0]; if (f && !taken.has(f.id) && alive(f, t + .5, taken)) grant(f.id, pid); else if (f) send({ t: 'got', f: f.id, by: taken.get(f.id) }); }
    else if (fx.t === 'got' && pid === hostId && fx.by != null) { const had = taken.get(fx.f | 0); if (had === fx.by && !pending.has(fx.f | 0)) return; grant(fx.f | 0, fx.by); }
    else if (fx.t === 'out' && s) { s.out = true; s.score = fx.sc | 0; }
  }
  function peerLeft(id) {
    const s = byId(id);
    if (!s || s === me) return;
    g.remove(s.mesh.p);
    seats.splice(seats.indexOf(s), 1);
    if (id === hostId) { hostId = hostOf(seats.filter(q => !q.bot), hostId); isHost = hostId === meId; }
  }

  // ---------- the frame ----------
  function update(dt, keys = new Set()) {
    if (state === 'off') return;
    if (!live) goLive();
    dt = clamp(dt, 0, .05);
    clock += dt; t += dt;
    if (state === 'count' && t >= 0) { state = 'play'; audio.tick(); }
    if (state === 'play' && me) {
      const px = me.poi.x, pz = me.poi.z;
      const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? .1 : .3) * dt;
      const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft') ? 1 : 0);
      const kz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp') ? 1 : 0);
      if (kx || kz) move(me, kx * sp, kz * sp);
      poiStep(me, dt, dipKey || dipMouse, px, pz);
      for (const s of seats) if (s.bot && isHost) botStep(s, dt);
      sendT -= dt;
      if (sendT <= 0) { sendT = .1; send({ t: 'p', x: +me.poi.x.toFixed(3), z: +me.poi.z.toFixed(3), w: me.poi.wet ? 1 : 0, hp: +me.poi.hp.toFixed(2), l: me.poi.left, sc: me.score }); }
      const humansOut = seats.filter(s => !s.bot).every(s => s.out);
      if (t >= ROUND || humansOut) finish();
    } else if (state === 'end') {
      if (!ended && clock - endT > 4.5) { ended = true; onEnd(outcome()); return; }
    }
    place(dt);
    cam();
    draw();
  }
  function finish() {
    if (state === 'end') return;
    state = 'end'; endT = clock;
    if (placeOf() === 1) audio.win(); else audio.full();
  }
  const placeOf = () => me ? 1 + ranking(seats).indexOf(me) : 1;
  function outcome() {
    const place = placeOf(), n = me?.fish || 0, kinds = me?.kinds || [];
    const gold = kinds.filter(k => k === 'or').length;
    return { place, of: seats.length, value: me?.score || 0, time: Math.min(ROUND, Math.max(0, t)), fish: n, kinds,
      text: `${ord(place)} place · ${me?.score || 0} pts · ${n ? `${n} poisson${n > 1 ? 's' : ''} dans le sachet` : 'le sachet est vide'}${gold ? ` · dont ${gold} doré${gold > 1 ? 's' : ''} !` : ''}` };
  }
  // everything where it is this frame
  function place(dt) {
    const tt = Math.max(0, t);
    fish.forEach((f, i) => {
      const m = fishMeshes[i];
      if (flying.some(q => q.m === m)) return;
      const on = alive(f, tt, taken);
      m.visible = on;
      if (!on) return;
      fishAt(f, tt, _p);
      m.position.set(_p.x, _p.y, _p.z); m.rotation.set(0, _p.h, 0);
      m.userData.tail.rotation.y = Math.sin(clock * (f.kind === 'or' ? 18 : 11) + i) * .45;
    });
    for (let k = flying.length - 1; k >= 0; k--) {
      const q = flying[k];
      q.t += dt * 1.8;
      const e = Math.min(1, q.t);
      q.m.position.lerpVectors(q.from, q.to, e); q.m.position.y += Math.sin(e * Math.PI) * .35;
      q.m.rotation.z += dt * 12;
      if (q.t >= 1) { q.m.visible = false; flying.splice(k, 1); }
    }
    for (const s of seats) {
      const P = s.poi, M = s.mesh;
      if (s.net && s !== me) { P.x += (s.net.x - P.x) * Math.min(1, dt * 12); P.z += (s.net.z - P.z) * Math.min(1, dt * 12); P.y += ((s.net.w ? -.025 : .08) - P.y) * Math.min(1, dt * 10); P.hp = s.net.hp; }
      M.p.position.set(P.x, P.y, P.z);
      M.p.rotation.x = P.y < .02 ? 0 : -.35;
      const torn = P.torn > 0 || P.hp <= 0 || s.out;
      M.paper.visible = !torn; for (const sh of M.shreds) sh.visible = torn && !s.out;
      M.p.visible = !(s.out && s !== me);
    }
    paperM.opacity = .8;
    for (const q of ripples) { if (q.life <= 0) continue; q.life -= dt * 1.6; q.r.scale.setScalar((1 - q.life) * .18 * q.big + .02); q.r.material.opacity = Math.max(0, q.life) * .5; if (q.life <= 0) q.r.visible = false; }
  }
  function pop(text, color, big = false) { popups.push({ text, color, big, t: 0 }); if (popups.length > 4) popups.shift(); }

  // ---------- the overlay: the time, the paper, what was caught ----------
  let cv = null, g2 = null;
  function txt(g, s, x, y, size, color, align = 'center', stroke = 5) {
    g.font = `800 ${size}px Rubik, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = 'rgba(26,19,13,.95)'; if (stroke) g.strokeText(s, x, y);
    g.fillStyle = color; g.fillText(s, x, y);
  }
  function draw() {
    if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = g2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (const p of popups) p.t += 1 / 60;
    popups = popups.filter(p => p.t < (p.big ? 1.6 : .9));
    if (state === 'count') { txt(g, String(Math.ceil(-t)), W / 2, H * .42, 64, '#ffdc8f'); txt(g, 'la souris ou z q s d : le poi · clic ou espace : plonger, lâcher : sortir', W / 2, H * .42 + 54, 16, '#fff'); }
    if (!me) return;
    // the clock and the pois left, top centre
    const left = Math.max(0, ROUND - Math.max(0, t));
    txt(g, `${Math.ceil(left)} s`, W / 2, 40, 30, left < 10 ? '#ff8a6a' : '#fff');
    for (let k = 0; k < POIS; k++) { g.beginPath(); g.arc(W / 2 - 30 + k * 30, 76, 10, 0, 7); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); if (k < me.poi.left - (me.poi.torn > 0 ? 1 : 0)) { g.fillStyle = '#fbf8f0'; g.fill(); } }
    // the paper's strength
    const bw = 180, bx = W / 2 - bw / 2, by = 96, hp = clamp(me.poi.hp, 0, 1);
    g.fillStyle = 'rgba(26,19,13,.8)'; g.fillRect(bx - 3, by - 3, bw + 6, 14);
    g.fillStyle = hp > .5 ? '#9ad86a' : hp > .25 ? '#f2c230' : '#e8484a'; g.fillRect(bx, by, bw * hp, 8);
    if (me.poi.wet && me.poi.v > .15) txt(g, 'doucement !', W / 2, by + 30, 18, '#ff9a7a');
    txt(g, `${me.score} pts · ${me.fish} poisson${me.fish > 1 ? 's' : ''}`, 20, 40, 22, '#ffe7c8', 'left');
    popups.forEach((p, i) => { const k = p.t / (p.big ? 1.6 : .9); g.globalAlpha = 1 - k * k; txt(g, p.text, W / 2, H * (p.big ? .3 : .62) - k * 24 - i * 30, p.big ? 26 : 20, p.color); g.globalAlpha = 1; });
    if (state === 'end') {
      const w = Math.min(440, W - 40), h = 130, x = (W - w) / 2, y = H * .45 - h / 2;
      g.fillStyle = 'rgba(26,19,13,.9)'; g.fillRect(x, y, w, h);
      txt(g, placeOf() === 1 ? 'le meilleur pêcheur du matsuri !' : 'fin du temps', W / 2, y + 30, 22, '#ffdc8f');
      txt(g, `${me.score} pts`, W / 2, y + 70, 32, '#fff');
      txt(g, me.fish ? `tu repars avec ${me.fish} poisson${me.fish > 1 ? 's' : ''} en sachet` : 'rien dans le sachet, cette fois', W / 2, y + 106, 15, '#e8d8b8', 'center', 0);
    }
  }

  const board = () => `<div class="board">${ranking(seats).map((s, i) => `<span style="color:${hexOf(s.color)}">${i + 1}. ${s.id === meId ? '<em>toi</em>' : s.name} ${s.score}${s.out ? ' · plus de poi' : ''}</span>`).join('')}</div>`;
  return {
    keys: [['souris · z q s d', 'bouger le poi'], ['clic · espace', 'plonger (tenir)'], ['lâcher', 'sortir le poi · attraper'], ['shift', 'tout doux']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    look(dx, dy) { if (state === 'play' && me && !me.out) move(me, dx * .0014, dy * .0014); },
    press(b, down) { if (b === 0) dipMouse = down; },
    hud() {
      if (state === 'off') return { hidden: true };
      return { html: `<b>kingyo-sukui</b>${board()}` };
    },
    // the menu looks at the stall from the street
    preview: () => ({ x: C.x, y: 0, z: C.z, yaw: Math.PI, rad: 4.2, h: 1.4 }),
    set onEnd(f) { onEnd = f; },
    // tests
    get state() { return state; }, get seats() { return seats; }, get fish() { return fish; }, get taken() { return taken; }, get t() { return t; },
    _skip() { if (state === 'count') t = 0; }, _claim: (fid) => claim(me, fish[fid]), _outcome: () => outcome(), _poi: () => me?.poi, _move: (dx, dz) => move(me, dx, dz), _dip(v) { dipKey = v; }, _time(v) { t = v; },
  };
}
