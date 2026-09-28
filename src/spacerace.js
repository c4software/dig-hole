// spacerace.js, the orbital grand prix: little spaceships racing round the moon (and round
// mars), for ever, one race every RACE seconds. Everything is worked out from the clock: the
// race number seeds the ships' form, their progress is an exact function of the time, so
// everyone online sees the same race without a word sent. A grandstand by the track, a big
// board, a console to watch from (a camera on any ship), and a bet or two.
import * as THREE from 'three';
import * as V from './vehicles.js';
import { solidsOf, frameAt, clearGround } from './spacearcade.js';

export const DECK_DIR = { moon: [.34, 1, .38], mars: [-.12, 1, -.66] };
const RACE = 100, GRID = 14, LAPS = 4, LAP = 13.5;   // a race every 100 s: 14 s on the grid, then 4 laps of ~13.5 s
const SHIPS = [['comète', 0xff5a3a], ['nova', 0xffd21f], ['pulsar', 0x39ffcc], ['quasar', 0x5a8aff], ['orion', 0xd05aff], ['véga', 0xf2f2f2]];
const ODDS = [2, 3, 4, 5, 7, 10];
export const STAKE = 50;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const seeded = (seed) => { let s = (seed % 2147483646 + 2147483646) % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; };

// a race's cast: each ship's form, and its wobbles (all from the race number)
function raceOf(n) {
  const r = seeded(n * 7919 + 13);
  const ships = SHIPS.map(([name, color], i) => ({
    i, name, color,
    base: .9 + r() * .16,
    w: [0, 1, 2].map(() => ({ a: .05 + r() * .09, f: .15 + r() * .5, p: r() * TAU })),
    lane: (r() - .5) * 2, lf: .2 + r() * .4, lp: r() * TAU,
  }));
  // the favourite gets the shortest odds
  [...ships].sort((a, b) => b.base - a.base).forEach((s, k) => { s.odds = ODDS[k]; });
  // the finish, worked out once: the time each one completes its laps
  for (const s of ships) {
    let lo = 0, hi = 200;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (lapsAt(s, m) >= LAPS) hi = m; else lo = m; }
    s.finish = hi;
  }
  const order = [...ships].sort((a, b) => a.finish - b.finish);
  return { n, ships, order, end: order[order.length - 1].finish };
}
// laps done after t seconds of racing: the integral of a wobbling speed
function lapsAt(s, t) {
  if (t <= 0) return 0;
  let x = s.base * t;
  for (const w of s.w) x -= w.a / w.f * (Math.cos(w.f * t + w.p) - Math.cos(w.p));
  return x / LAP;
}

function shipModel(color, num) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = V.mat(color, { roughness: .3, metalness: .4 }), white = V.mat(0xeeeef2, { roughness: .35, metalness: .3 }), dark = V.TRIM();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(.18, .42, 3, 12), white); fus.rotation.x = Math.PI / 2; body.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.18, .9, 12), paint); nose.rotation.x = Math.PI / 2; nose.position.z = 1.95; body.add(nose);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8, 0, TAU, 0, Math.PI / 2), V.glass()); cab.position.set(0, .22, .6); cab.scale.set(1, .8, 1.8); body.add(cab);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, .06, .9), paint); wing.position.set(s * .9, -.05, -.5); wing.rotation.z = s * -.12; body.add(wing);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 1.3, 10), dark); pod.rotation.x = Math.PI / 2; pod.position.set(s * 1.55, -.1, -.6); body.add(pod);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(.15, 10), V.lamp(color, 3)); glow.position.set(s * 1.55, -.1, -1.26); glow.rotation.y = Math.PI; body.add(glow);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.06, .7, .7), paint); fin.position.set(0, .45, -1.1); body.add(fin);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(.3, 2.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .5).multiplyScalar(2), transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  jet.rotation.x = -Math.PI / 2; jet.position.z = -2.5; body.add(jet);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: V.paintTex(64, 64, (c, w, h) => { c.fillStyle = hex(color); c.beginPath(); c.arc(32, 32, 30, 0, TAU); c.fill(); c.fillStyle = '#10101a'; c.font = '900 40px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(num), 32, 34); }), transparent: true }));
  tag.position.set(0, .39, -.2); tag.rotation.x = -Math.PI / 2; body.add(tag);
  return { g, body, jet };
}

export function createSpaceRace({ ui, audio, pay = () => false, earn = () => {}, me = () => null } = {}) {
  const tracks = {};   // w → everything built for that planet
  const now = () => Date.now() / 1000;
  const races = new Map();
  const race = (n) => { if (!races.has(n)) { races.set(n, raceOf(n)); if (races.size > 6) races.delete(races.keys().next().value); } return races.get(n); };

  // ---------- the track: a loop round the planet, low past the grandstand, high on the far side ----------
  function makeTrack(center, radius, a) {
    const b = new THREE.Vector3(0, 1, 0).cross(a); if (b.lengthSq() < .01) b.set(1, 0, 0); b.normalize();
    const nrm = new THREE.Vector3().crossVectors(a, b).normalize();
    const N = 720, pts = [];
    for (let i = 0; i < N; i++) {
      const th = i / N * TAU;
      const d = new THREE.Vector3().addScaledVector(a, Math.cos(th)).addScaledVector(b, Math.sin(th)).addScaledVector(nrm, .42 + .22 * Math.sin(3 * th)).normalize();
      const alt = 9 + 7 * (1 - Math.cos(th)) + 3 * Math.sin(4 * th) * (1 - Math.cos(th)) * .5;
      pts.push(center.clone().addScaledVector(d, radius + alt));
    }
    const len = pts.reduce((s, p, i) => s + p.distanceTo(pts[(i + 1) % N]), 0);
    return { pts, N, len, center };
  }
  // a point along the track (u in laps), its forward and up
  function along(tr, u, out, fwd, up) {
    const f = ((u % 1) + 1) % 1 * tr.N, i = Math.floor(f), k = f - i;
    const p0 = tr.pts[i], p1 = tr.pts[(i + 1) % tr.N];
    out.copy(p0).lerp(p1, k);
    if (fwd) fwd.copy(p1).sub(p0).normalize();
    if (up) up.copy(out).sub(tr.center).normalize();
    return out;
  }

  // ---------- the grandstand: a raised deck, benches, a rail, the board and a console ----------
  function build(w, { terrain, center, radius, at, face }) {
    if (tracks[w]) { tracks[w].group.removeFromParent(); tracks[w].ships.forEach(s => s.m.g.removeFromParent()); }
    const a = at.clone().sub(center).normalize();
    const tr = makeTrack(center, radius, a);
    // the deck faces the track where it passes closest
    let near = tr.pts[0];
    for (const p of tr.pts) if (p.distanceTo(at) < near.distanceTo(at)) near = p;
    const group = new THREE.Group();
    group.position.copy(at); group.quaternion.copy(frameAt(center, at, near));
    const stone = V.mat(w === 'mars' ? 0x7a4432 : 0x9a9aa0, { roughness: .95 }), deckM = V.mat(0x3a3d44, { roughness: .6, metalness: .3 }), rail = V.mat(0xe8e4dc, { roughness: .4, metalness: .5 });
    const neon = V.lamp(w === 'mars' ? 0xff8a3a : 0x5ad8ff, 2.2);
    const bx = (wd, h, d, m, x, y, z, solid = false) => { const o = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), m); o.position.set(x, y, z); if (solid) o.userData.solid = true; group.add(o); return o; };
    const H = 1.6;   // the deck's height
    bx(9, H + 3, 5, stone, 0, (H - 3) / 2, 0, true);
    bx(9.2, .12, 5.2, deckM, 0, H + .06, 0);
    // steps up the back
    for (let n = 0; n < 4; n++) bx(2.4, .4 * (n + 1) + 2, .5, stone, 0, .4 * (n + 1) / 2 - 1, -2.75 - (3 - n) * .5, true);
    // the rail along the front and the sides (not the stairs)
    bx(9, .08, .08, rail, 0, H + 1, 2.5, true); bx(9, .9, .06, new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: .25, depthWrite: false }), 0, H + .5, 2.5, true);
    for (const s of [-1, 1]) bx(.08, 1, 5, rail, s * 4.5, H + .5, 0, true);
    for (const s of [-1, 1]) bx(3.3, 1, .08, rail, s * 2.85, H + .5, -2.5, true);
    bx(9, .05, .05, neon, 0, H + .02, 2.55);
    // benches in two rows
    for (const z of [.2, -1.3]) bx(7, .4, .45, V.TRIM(), 0, H + .2 + (z < 0 ? .3 : 0), z, false);
    bx(7, .3, .5, stone, 0, H + .15, -1.3);
    // the console: a pedestal with a glowing top, in front on the left
    bx(.6, 1.1, .5, deckM, -3.4, H + .55, 1.6, true);
    bx(.62, .06, .52, neon, -3.4, H + 1.13, 1.6);
    const cscr = new THREE.Mesh(new THREE.PlaneGeometry(.55, .35), new THREE.MeshBasicMaterial({ map: V.paintTex(128, 80, (g, W, Hh) => { g.fillStyle = '#10141e'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#5ad8ff'; g.font = '700 16px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('e : regarder', W / 2, 32); g.fillText('parier', W / 2, 56); }) }));
    cscr.position.set(-3.4, H + 1.2, 1.36); cscr.rotation.x = -.6; cscr.rotation.y = 0; group.add(cscr);
    // the board: a big screen on two masts beside the deck
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(6.8, H + 4.2, -1); board.rotation.y = -.5; group.add(board);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.3, 5.3, .2), deckM); back.position.copy(board.position); back.rotation.y = -.5; back.translateZ(-.12); group.add(back);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.25, H + 6.8, .25), rail); m.position.set(6.8 + s * 2 * Math.cos(.5), (H + 6.8) / 2 - 1, -1 + s * 2 * Math.sin(.5)); m.userData.solid = true; group.add(m); }
    // a sign across the back
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: V.paintTex(512, 86, (g, W, Hh) => { g.fillStyle = '#10101a'; g.beginPath(); g.roundRect(3, 3, W - 6, Hh - 6, 16); g.fill(); g.fillStyle = w === 'mars' ? '#ff8a3a' : '#5ad8ff'; g.font = '400 44px "Titan One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('grand prix orbital', W / 2, Hh / 2 + 2); }), side: THREE.DoubleSide }));
    sign.position.set(0, H + 2.6, -2.5); group.add(sign);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.12, 2.2, .12), rail); m.position.set(s * 2.9, H + 1.5, -2.5); group.add(m); }
    group.traverse(o => { if (o.isMesh && o.material.type === 'MeshStandardMaterial') { o.receiveShadow = true; o.castShadow = true; } });
    clearGround(terrain, group, [[-4.6, H, -2.6, 4.6, H + 4, 2.6], [-1.3, 0, -5.3, 1.3, H + 3, -2.4]]);
    // the start line: two beacons on the track, facing the stand
    const gate = new THREE.Group();
    const p0 = new THREE.Vector3(), f0 = new THREE.Vector3(), u0 = new THREE.Vector3();
    along(tr, 0, p0, f0, u0);
    const side0 = new THREE.Vector3().crossVectors(f0, u0).normalize();
    for (const s of [-1, 1]) {
      const bcn = new THREE.Mesh(new THREE.OctahedronGeometry(.6), V.lamp(s > 0 ? 0xff3a4a : 0x39ffcc, 2.5));
      bcn.position.copy(p0).addScaledVector(side0, s * 7); gate.add(bcn);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(14, .12, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: .5 }));
    line.position.copy(p0); line.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side0, u0, f0)); gate.add(line);
    // a faint trail of dots marking the track
    const dotGeo = new THREE.SphereGeometry(.12, 6, 4), dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: w === 'mars' ? 0xffc080 : 0x9adfff, transparent: true, opacity: .5 }), 120);
    const dm = new THREE.Object3D();
    for (let n = 0; n < 120; n++) { dm.position.copy(tr.pts[Math.floor(n / 120 * tr.N)]); dm.updateMatrix(); dots.setMatrixAt(n, dm.matrix); }
    gate.add(dots);
    const root = new THREE.Group(); root.add(group, gate);
    const ships = SHIPS.map(([name, color], i) => { const m = shipModel(color, i + 1); root.add(m.g); return { i, name, color, m, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), u: 0, bank: 0 }; });
    const solid = solidsOf(group);
    const consolePos = new THREE.Vector3(-3.4, H, 1.6).applyMatrix4(group.matrixWorld);
    const stand = new THREE.Vector3(0, H + 1.7, 1.2).applyMatrix4(group.matrixWorld);
    tracks[w] = { w, group: root, tr, ships, solid, board: { cv, tex, key: '' }, consolePos, stand, it: { id: 'deck', pos: consolePos, reach: 1.6 } };
    return root;
  }

  // ---------- the race, now ----------
  function phase(t = now()) {
    const n = Math.floor(t / RACE), local = t - n * RACE;
    return { n, local, rt: local - GRID, r: race(n) };
  }
  const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  let last = { n: -1, told: -1 }, bet = null;   // bet: { n, i }
  let watching = null;   // { w, i, mode, t, pos, look }
  const ph = { n: 0, rt: 0, r: null };
  function update(dt, w) {
    const T = tracks[w];
    if (!T || !T.group.visible) return;
    const { n, rt, r } = phase();
    Object.assign(ph, { n, rt, r });
    for (const s of T.ships) {
      const rs = r.ships[s.i];
      let u;
      if (rt < 0) {
        // on the grid, in two rows behind the line, bobbing
        u = -(.012 + Math.floor(s.i / 2) * .018 + (s.i % 2) * .009);
      } else u = lapsAt(rs, rt);
      along(T.tr, u, _p, _f, _u);
      _s.crossVectors(_f, _u).normalize();
      const lane = rt < 0 ? ((s.i % 2) ? 2.6 : -2.6) : rs.lane * 4 + Math.sin(rt * rs.lf + rs.lp) * 2.2;
      const bob = Math.sin(now() * 2 + s.i) * .15 + (rt < 0 ? 0 : Math.sin(rt * rs.lf * 1.7 + rs.lp) * 1.2);
      s.pos.copy(_p).addScaledVector(_s, lane).addScaledVector(_u, bob);
      // bank into the weave
      const dl = rt < 0 ? 0 : Math.cos(rt * rs.lf + rs.lp) * rs.lf * 2.2;
      s.bank += (clamp(-dl * .5, -.7, .7) - s.bank) * Math.min(1, dt * 4);
      s.fwd.copy(_f); s.up.copy(_u); s.u = u;
      const right = _s.clone().multiplyScalar(-1);
      s.m.g.position.copy(s.pos);
      s.m.g.quaternion.setFromRotationMatrix(_m.makeBasis(right, _u, _f));
      s.m.body.rotation.z = s.bank;
      s.m.jet.scale.setScalar(rt < 0 ? .3 + Math.sin(now() * 20 + s.i) * .05 : .9 + Math.random() * .3);
    }
    // the news: the start, the winner, the bet paid (once per race, wherever you are on this planet)
    const close = watching || (me() && T.stand.distanceTo(me()) < 70);
    if (last.n !== n) { last = { n, told: 0 }; }
    if (rt >= 0 && last.told < 1) { last.told = 1; if (close) { ui.toast(`grand prix orbital n° ${n % 1000} · c'est parti !`, false, 1800); audio.buy(); } }
    if (rt >= r.order[0].finish && last.told < 2) {
      last.told = 2;
      const win = r.order[0];
      if (close) { ui.toast(`victoire de ${win.name} !`, false, 3000); audio.win(); }
      if (bet && bet.n === n) {
        if (bet.i === win.i) earn(STAKE * win.odds, `pari gagné sur ${win.name} · cote ${win.odds}`);
        else if (close) ui.toast(`pari perdu : ${r.ships[bet.i].name} finit ${r.order.indexOf(r.ships[bet.i]) + 1}e`, true, 2400);
        bet = null;
      }
    }
    drawBoard(T, n, rt, r);
  }
  function standings(r, rt) {
    if (rt < 0) return [...r.ships].sort((a, b) => a.odds - b.odds);
    return [...r.ships].sort((a, b) => {
      const fa = a.finish <= rt, fb = b.finish <= rt;
      if (fa || fb) return fa && fb ? a.finish - b.finish : fa ? -1 : 1;
      return lapsAt(b, rt) - lapsAt(a, rt);
    });
  }
  function status(r, rt) {
    if (rt < 0) return `départ dans ${Math.ceil(-rt)}`;
    const lead = Math.min(LAPS, Math.floor(lapsAt(r.order[0], rt)) + 1);
    if (rt >= r.end) return 'course terminée';
    if (rt >= r.order[0].finish) return `vainqueur : ${r.order[0].name}`;
    return `tour ${lead} / ${LAPS}`;
  }
  function drawBoard(T, n, rt, r) {
    const st = standings(r, rt);
    const key = n + status(r, rt) + st.map(s => s.i).join('') + (bet ? bet.n + ':' + bet.i : '') + (watching ? watching.i : '');
    if (key === T.board.key) return;
    T.board.key = key;
    const g = T.board.cv.getContext('2d'), W = 512;
    g.fillStyle = '#0c0e18'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#ffd75e'; g.font = '400 38px "Titan One", Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('grand prix orbital', W / 2, 52);
    g.fillStyle = '#9adfff'; g.font = '700 24px Rubik, sans-serif'; g.fillText(`course n° ${n % 1000} · ${status(r, rt)}`, W / 2, 90);
    g.textAlign = 'left';
    st.forEach((s, k) => {
      const y = 140 + k * 56, done = rt >= 0 && s.finish <= rt;
      g.fillStyle = watching && watching.i === s.i ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)'; g.fillRect(20, y - 34, W - 40, 48);
      g.fillStyle = hex(s.color); g.beginPath(); g.arc(50, y - 10, 14, 0, TAU); g.fill();
      g.fillStyle = '#10101a'; g.font = '900 16px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText(String(s.i + 1), 50, y - 4); g.textAlign = 'left';
      g.fillStyle = '#fff'; g.font = '700 26px Rubik, sans-serif'; g.fillText(`${k + 1}. ${s.name}`, 78, y);
      g.fillStyle = '#b8b8c8'; g.font = '600 20px Rubik, sans-serif';
      const right = rt < 0 ? `cote ${s.odds}` : done ? `${s.finish.toFixed(1)} s` : `tour ${Math.min(LAPS, Math.floor(lapsAt(s, rt)) + 1)}`;
      g.textAlign = 'right'; g.fillText(right, W - 36, y); g.textAlign = 'left';
      if (bet && bet.n === n && bet.i === s.i) { g.fillStyle = '#ffd75e'; g.fillText('●', W - 150, y); }
    });
    g.fillStyle = '#6a6a80'; g.font = '600 18px Rubik, sans-serif'; g.textAlign = 'center';
    g.fillText(bet ? `ta mise : ${STAKE} ● sur ${race(bet.n).ships[bet.i].name}${bet.n > n ? ' (prochaine course)' : ''}` : 'la console du balcon : regarder, parier', W / 2, 490);
    T.board.tex.needsUpdate = true;
  }

  // ---------- watching: a camera on a ship ----------
  function watch(w) {
    const T = tracks[w];
    if (!T) return false;
    const { rt, r } = phase();
    watching = { w, i: standings(r, rt)[0].i, mode: 0, pos: null, look: new THREE.Vector3() };
    return true;
  }
  function unwatch() { watching = null; }
  function cycle(d) { if (watching) { watching.i = (watching.i + d + SHIPS.length) % SHIPS.length; audio.tick(); } }
  function placeBet() {
    if (!watching) return;
    const { n, rt } = phase();
    const target = rt < -2 ? n : n + 1, r = race(target), s = r.ships[watching.i];
    if (bet && bet.n >= n) { ui.toast(`déjà un pari en cours sur ${race(bet.n).ships[bet.i].name}`, true, 2000); return; }
    if (!pay(STAKE)) { ui.toast(`il faut ${STAKE} ● pour parier`, true, 1800); audio.deny(); return; }
    bet = { n: target, i: s.i };
    audio.buy();
    ui.toast(`${STAKE} ● sur ${s.name} · cote ${s.odds}${target > n ? ' · pour la prochaine course' : ''}`, false, 2600);
  }
  const _cam = new THREE.Vector3(), _look = new THREE.Vector3();
  function cam(dt, camera) {
    if (!watching) return;
    const T = tracks[watching.w], s = T.ships[watching.i];
    if (watching.mode === 0) {
      // behind and a little above the ship
      _cam.copy(s.pos).addScaledVector(s.fwd, -9).addScaledVector(s.up, 3.2);
      _look.copy(s.pos).addScaledVector(s.fwd, 6);
    } else if (watching.mode === 1) {
      // alongside, a little ahead, the planet rolling by underneath
      _s.crossVectors(s.fwd, s.up).normalize();
      _cam.copy(s.pos).addScaledVector(_s, 10).addScaledVector(s.fwd, 4).addScaledVector(s.up, 2.5);
      _look.copy(s.pos);
    } else {
      // from the stand, following it with the eye
      _cam.copy(T.stand); _look.copy(s.pos);
    }
    if (!watching.pos) watching.pos = _cam.clone();
    else watching.pos.lerp(_cam, Math.min(1, dt * (watching.mode ? 20 : 6)));
    if (watching.pos.distanceTo(_cam) > 40) watching.pos.copy(_cam);
    watching.look.lerp(_look, watching.look.lengthSq() ? Math.min(1, dt * 10) : 1);
    camera.position.copy(watching.pos);
    camera.up.copy(watching.mode < 2 ? s.up : _u.copy(T.stand).sub(T.tr.center).normalize());
    camera.lookAt(watching.look);
  }
  function hud() {
    if (!watching) return '';
    const { n, rt, r } = phase(), s = r.ships[watching.i], st = standings(r, rt);
    const place = st.indexOf(s) + 1;
    const where = rt < 0 ? `sur la grille · cote ${s.odds}` : s.finish <= rt ? `arrivé ${place}e en ${s.finish.toFixed(1)} s` : `${place}e · tour ${Math.min(LAPS, Math.floor(lapsAt(s, rt)) + 1)} / ${LAPS}`;
    const b = bet ? `<span>pari : ${STAKE} ● sur ${race(bet.n).ships[bet.i].name}${bet.n > n ? ' (prochaine)' : ''}</span>` : '';
    return `<b>grand prix orbital · ${status(r, rt)}</b><span class="big" style="color:${hex(s.color)}">${s.name}</span><span>${where}</span>${b}<span>q d : autre vaisseau · c : caméra · b : parier ${STAKE} ● · e : quitter</span>`;
  }

  return {
    build, update, watch, unwatch, cycle, cam, hud, placeBet,
    group: (w) => tracks[w]?.group || null,
    show(w) { for (const [k, T] of Object.entries(tracks)) T.group.visible = k === w; },
    near(w, pos) { const T = tracks[w]; return T && T.consolePos.distanceTo(pos) < T.it.reach ? T.it : null; },
    solid(w, p, r) { const T = tracks[w]; return !!T && T.solid(p, r); },
    toggleCam() { if (watching) { watching.mode = (watching.mode + 1) % 3; watching.pos = null; audio.tick(); } },
    get watching() { return watching; },
    get bet() { return bet; },
    // tests
    phase, raceOf, lapsAt, get tracks() { return tracks; },
  };
}
