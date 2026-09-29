// taiko.js, taiko héros: the rhythm game at the matsuri stage in the Japanese street. You stand
// behind the big drum, the notes slide in along a band from the right to the circle: red ones on
// the skin (don: f or j), blue ones on the rim (ka: d or k); the big ones want both hands at once
// (double points), the yellow rolls take every stroke you can give. The shime, the gong and the
// flute play by themselves (taiko-songs.js, taiko-voice.js). Good hits fill the festival gauge:
// full, it's the fête, points doubled while it drains, the lanterns go wild.
// Together: the host picks the piece, everyone plays it on their own drum, scores go round live,
// places by score. Solo: two musicians of the neighbourhood, their runs worked out from the seed.
import * as THREE from 'three';
import { SONGS, LEVELS, makeChart } from './taiko-songs.js';
import { rng, hostOf, hexOf, ord } from './retro.js';

const MODES = [
  { id: 'facile', name: 'facile', sub: 'une note par temps · les grosses et les roulements', help: 'f j : don (rouge) · d k : ka (bleu) · les grosses à deux mains', unit: 'score' },
  { id: 'normal', name: 'normal', sub: 'les croches · don et ka mêlés', help: 'f j : don (rouge) · d k : ka (bleu) · les grosses à deux mains', unit: 'score' },
  { id: 'difficile', name: 'difficile', sub: 'les doubles croches · des séries serrées', help: 'f j : don · d k : ka · alterne les mains dans les séries', unit: 'score' },
  { id: 'expert', name: 'expert', sub: 'toute la partition du tambour · peu de marge', help: 'f j : don · d k : ka · alterne les mains · les grosses à deux mains', unit: 'score' },
];
const DON = { KeyF: 'L', KeyJ: 'R' }, KA = { KeyD: 'L', KeyK: 'R' };
const BOTS = [['mamie haru', 0x5ab0e0, .02], ['le petit kenta', 0xe8703a, -.04], ['le vieux daisuke', 0x8a5ad8, -.08]];
const SKILL = { facile: .95, normal: .92, difficile: .88, expert: .84 };
const LEAD_IN = 3.2, PICK_TIME = 25, FEVER = 8;
const COL = { d: '#e8402a', k: '#3aa8d8', r: '#f6c21a' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = (n) => Math.round(n).toLocaleString('fr-FR');

export function createTaiko({ camera, audio, ui, matsuri }) {
  let state = 'off';
  let seed = 1, mode = 'normal', L = LEVELS.normal;
  let meId = 'me', hostId = 'me', isHost = true, send = () => {}, onEnd = () => {};
  let seats = [], me = null, humansN = 1;
  let pick = 0, pickT = 0, pickSent = -1;
  let chart = null, songI = 0, t0 = 0, songT = -LEAD_IN, lastPerf = 0, goSent = 0;
  let score = 0, combo = 0, maxCombo = 0, goodN = 0, okN = 0, missN = 0, rollN = 0, total = 0, gauge = 0, fever = 0, feverN = 0;
  let head = 0, big = null, popups = [], flash = { dL: 0, dR: 0, kL: 0, kR: 0 }, judgeFlash = 0;
  let sendT = 0, endT = 0, ended = false, clock = 0, live = false;

  // ---------- the drum's voice, borrowed from the stage ----------
  let A = null, accIdx = 0;
  const songNow = () => (performance.now() - t0) / 1000;
  const lat = () => A ? (A.ctx.outputLatency || A.ctx.baseLatency || 0) : 0;
  const audioAt = (st) => A ? Math.max(A.ctx.currentTime, A.ctx.currentTime + st - songNow() - lat()) : 0;
  function schedule() {
    if (!A || !chart) return;
    const ac = chart.accomp, ahead = songT + 1;
    while (accIdx < ac.length && ac[accIdx][0] < ahead) {
      const [t, v, m, l] = ac[accIdx++];
      if (t < songT - .03) continue;
      if (v === 'f') A.flute(m, audioAt(t), l * .95, fever > 0 ? 1.1 : .9); else A.hit(v, audioAt(t), v === 'c' ? .6 : .55);
    }
  }
  function resync() { accIdx = 0; if (chart) while (accIdx < chart.accomp.length && chart.accomp[accIdx][0] < songT) accIdx++; }
  const stroke = (k) => { if (A) A.hit(k, A.ctx.currentTime, 1); matsuri.strike(k); };

  // ---------- the lanterns: they pulse on the beat, go every colour in the fête ----------
  const _col = new THREE.Color();
  function lanterns(dt) {
    const b = chart ? Math.pow(1 - ((songT / chart.beat) % 1 + 1) % 1, 3) : 0;
    for (const [i, L2] of matsuri.lanterns.entries()) {
      if (fever > 0) L2.m.color.copy(_col.setHSL(((clock * .5 + i * .09) % 1), .85, .55));
      else L2.m.color.setHex(L2.base);
      L2.m.emissiveIntensity = .3 + b * (fever > 0 ? 1.4 : .6) + judgeFlash * .4;
      L2.l.position.y += Math.sin(clock * 8 + i) * dt * (fever > 0 ? .05 : 0);
    }
  }
  function restoreLanterns() { for (const L2 of matsuri.lanterns) { L2.m.color.setHex(L2.base); L2.m.emissiveIntensity = .15; } }

  // ---------- the camera: behind the drum, over the street ----------
  const S = matsuri.stage, camP = new THREE.Vector3(), camL = new THREE.Vector3(), wide = new THREE.Vector3(), wideL = new THREE.Vector3();
  let camFov = 70;
  function cam() {
    camP.set(S.x + .15, S.drumY + .75, S.drumZ - 1.35); camL.set(S.x, S.drumY - .1, S.drumZ + 6);
    if (state === 'pick' || state === 'count') {
      wide.set(S.x - 5 + Math.sin(clock * .25) * .6, 3.2, S.drumZ + 9); wideL.set(S.x, 1.6, S.drumZ);
      const k = state === 'pick' ? 0 : clamp(1 - (-songT - .6) / (LEAD_IN - .6), 0, 1), e = k * k * (3 - 2 * k);
      camP.lerpVectors(wide, camP, e); camL.lerpVectors(wideL, camL, e);
    } else if (state === 'play' && chart) {
      const b = Math.pow(1 - ((songT / chart.beat) % 1 + 1) % 1, 4);
      camP.y += b * .015 * (fever > 0 ? 2 : 1);
    }
    camera.position.copy(camP); camera.up.set(0, 1, 0); camera.lookAt(camL);
    if (camera.fov !== 64) { camera.fov = 64; camera.updateProjectionMatrix(); }
  }

  // ---------- starting ----------
  function start({ seed: sd = 1, humans = [{ id: 'me', name: 'toi', color: 0xc8581a, me: true }], hostId: h = 'me', meId: mid = 'me', send: sn = () => {}, opts = {} } = {}) {
    if (state !== 'off') stop();
    mode = LEVELS[opts?.mode] ? opts.mode : 'facile'; L = LEVELS[mode];
    seed = sd >>> 0 || 1; meId = mid; hostId = h; isHost = hostId === meId; send = sn;
    humansN = humans.length;
    const list = humans.map(u => ({ id: u.id, name: u.me ? 'toi' : u.name, color: u.color, bot: false }));
    // the neighbourhood's musicians keep you company when you play alone
    if (humansN < 2) { const pool = BOTS.filter(([, c]) => !humans.some(u => u.color === c)); for (let n = 0; list.length < 3 && n < pool.length; n++) list.push({ id: 'b' + n, name: pool[n][0], color: pool[n][1], bot: true, skill: clamp(SKILL[mode] + pool[n][2], .5, .99) }); }
    seats = list.map(u => ({ ...u, score: 0, combo: 0, pct: 0, done: false }));
    me = seats.find(s => s.id === meId);
    state = 'pick'; clock = 0; live = false;
    pick = rng(seed)() * SONGS.length | 0; pickT = PICK_TIME; pickSent = -1;
    chart = null; songT = -LEAD_IN; ended = false; endT = 0;
    resetPlay();
    camFov = camera.fov;
    matsuri.voice.stop();
    cam();
  }
  function resetPlay() {
    score = 0; combo = 0; maxCombo = 0; goodN = 0; okN = 0; missN = 0; rollN = 0; gauge = 0; fever = 0; feverN = 0;
    head = 0; big = null; popups = []; judgeFlash = 0; sendT = 0; goSent = 0;
    flash = { dL: 0, dR: 0, kL: 0, kR: 0 };
  }
  function goLive() {
    live = true;
    addEventListener('keydown', onKey, true);
    A = matsuri.voice.lend(true);
    cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8';
    document.body.appendChild(cv); g2 = cv.getContext('2d');
  }
  function begin(i, inSec) {
    songI = i; chart = makeChart(i, mode);
    resetPlay();
    for (const q of chart.gems) q.j = null;
    total = chart.gems.filter(q => q.kind !== 'r').length;
    t0 = performance.now() + inSec * 1000; songT = -inSec; lastPerf = performance.now();
    resync();
    for (const s of seats) { s.score = 0; s.combo = 0; s.done = false; if (s.bot) s.sim = simulate(s); }
    state = 'count';
    audio.tick();
  }
  // a neighbour's run, worked out ahead from the seed: its score at each note
  function simulate(s) {
    const R = rng(seed ^ (s.id.charCodeAt(1) * 7919)), tl = [];
    let sc = 0, cb = 0, ga = 0, fe = 0, lastT = 0;
    for (const q of chart.gems) {
      fe = Math.max(0, fe - (q.t - lastT)); lastT = q.t;
      const x = fe > 0 ? 2 : 1;
      if (q.kind === 'r') { const n = Math.floor(q.len * 9 * s.skill); sc += n * 100 * x; }
      else if (R() < s.skill) {
        const good = R() < s.skill - .12;
        cb++; sc += ((good ? 300 : 150) * (q.big && R() < s.skill ? 2 : 1) + Math.min(100, Math.floor(cb / 10) * 10)) * x;
        ga += good ? .035 : .018;
      } else { cb = 0; ga = Math.max(0, ga - .06); }
      if (ga >= 1 && fe <= 0) { fe = FEVER; ga = 0; }
      tl.push([q.t, Math.round(sc), cb]);
    }
    return tl;
  }
  function stop() {
    if (state === 'off') return;
    state = 'off';
    if (live) removeEventListener('keydown', onKey, true);
    live = false; A = null;
    matsuri.voice.lend(false);
    restoreLanterns();
    if (cv) { cv.remove(); cv = null; g2 = null; }
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
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { pick = (pick + SONGS.length - 1) % SONGS.length; audio.tick(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pick = (pick + 1) % SONGS.length; audio.tick(); }
      else if (e.code === 'Enter' || e.code === 'Space') choose();
      return;
    }
    const hand = DON[e.code] || KA[e.code];
    if (hand && (state === 'play' || state === 'count')) { e.preventDefault(); press(DON[e.code] ? 'd' : 'k', hand, songAt(e.timeStamp)); }
  }
  function choose() {
    if (state !== 'pick' || !isHost) return;
    begin(pick, LEAD_IN);
    send({ t: 'go', i: pick, in: LEAD_IN, m: mode });
    goSent = 1;
  }
  const mult = () => fever > 0 ? 2 : 1;
  // a stroke of kind 'd' or 'k' with hand 'L' or 'R' at song time t
  function press(kind, hand, t) {
    stroke(kind);
    flash[kind + hand] = 1;
    if (!chart || state !== 'play' && state !== 'count') return;
    // the second hand on a big note just struck: double
    if (big && big.kind === kind && big.hand !== hand && t - big.at < .07) { score += big.pts * mult(); big.q.dbl = true; pop('à deux mains !', '#ffe27a'); big = null; return; }
    // a roll: every stroke counts
    const roll = chart.gems.find(q => q.kind === 'r' && t >= q.t - .05 && t <= q.t + q.len);
    if (roll) { rollN++; score += 100 * mult(); gauge = Math.min(1, gauge + .004); roll.j = 'r'; judgeFlash = .6; return; }
    const gems = chart.gems;
    let best = null, bd = 9;
    for (let k = head; k < gems.length && gems[k].t < t + L.ok + .01; k++) {
      const q = gems[k];
      if (q.j || q.kind !== kind) continue;
      const d = Math.abs(q.t - t);
      if (d <= L.ok && d < bd) { best = q; bd = d; }
    }
    if (best) hit(best, bd, hand, t);
  }
  function hit(q, d, hand, t) {
    const good = d <= L.good;
    q.j = good ? 'g' : 'o';
    combo++; maxCombo = Math.max(maxCombo, combo);
    if (good) goodN++; else okN++;
    const pts = (good ? 300 : 150) + Math.min(100, Math.floor(combo / 10) * 10);
    score += pts * mult();
    if (q.big) big = { q, kind: q.kind, hand, at: t, pts };
    gauge = Math.min(1, gauge + (good ? .035 : .018));
    if (gauge >= 1 && fever <= 0) { fever = FEVER; feverN++; pop('fête !', '#ffd85a', true); audio.pickup(1); }
    judgeFlash = 1;
    pop(good ? 'bien !' : 'ok', good ? '#ffe27a' : '#e8e8e8');
    if (combo && combo % 50 === 0) pop(`${combo} de suite !`, '#ffb020', true);
  }
  function judgeMisses() {
    const gems = chart.gems;
    while (head < gems.length && gems[head].j) head++;
    for (let k = head; k < gems.length && gems[k].t < songT - L.ok; k++) {
      const q = gems[k];
      if (q.j) continue;
      if (q.kind === 'r') { if (songT > q.t + q.len) q.j = 'r'; continue; }
      q.j = 'm'; missN++;
      combo = 0;
      gauge = Math.max(0, gauge - .06);
      pop('raté', '#ff7a6a');
    }
    while (head < gems.length && gems[head].j) head++;
  }
  function pop(text, color, big2 = false) { popups.push({ text, color, big: big2, t: 0 }); if (popups.length > 4) popups.shift(); }

  // ---------- network ----------
  const byId = (id) => seats.find(s => s.id === id);
  function onFx(pid, fx) {
    if (state === 'off' || !fx) return;
    const s = byId(pid);
    if (fx.t === 'pick' && pid === hostId && state === 'pick') pick = fx.i | 0;
    else if (fx.t === 'go' && state === 'pick') { if (LEVELS[fx.m]) { mode = fx.m; L = LEVELS[mode]; } begin(fx.i | 0, Math.max(.5, (+fx.in || LEAD_IN) - .05)); }
    else if (fx.t === 's' && s && s !== me) { s.score = fx.sc | 0; s.combo = fx.cb | 0; }
    else if (fx.t === 'end' && s && s !== me) { s.score = fx.sc | 0; s.pct = fx.p | 0; s.done = true; }
  }
  function peerLeft(id) {
    const s = byId(id);
    if (!s || s === me) return;
    seats.splice(seats.indexOf(s), 1);
    humansN = seats.filter(q => !q.bot).length;
    if (id === hostId) { hostId = hostOf(seats.filter(q => !q.bot), hostId); isHost = hostId === meId; }
  }

  // ---------- the frame ----------
  function update(dt) {
    if (state === 'off') return;
    if (!live) goLive();
    const now = performance.now(), gap = now - lastPerf;
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
      if (fever > 0) { fever -= dt; if (fever <= 0) { fever = 0; gauge = 0; } else gauge = fever / FEVER; }
      for (const s of seats) if (s.bot && s.sim) { let v = null; for (const e of s.sim) { if (e[0] > songT) break; v = e; } if (v) { s.score = v[1]; s.combo = v[2]; } }
      if (me) { me.score = Math.round(score); me.combo = combo; }
      sendT -= dt;
      if (sendT <= 0) { sendT = .3; send({ t: 's', sc: Math.round(score), cb: combo }); }
      if (songT > chart.length + .8) finish();
    } else if (state === 'end') {
      const waiting = seats.some(s => !s.bot && s !== me && !s.done);
      if (!ended && clock - endT > (waiting ? 7 : 4.5)) { ended = true; onEnd(outcome()); return; }
    }
    for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 6);
    judgeFlash = Math.max(0, judgeFlash - dt * 4);
    for (const p of popups) p.t += dt;
    popups = popups.filter(p => p.t < (p.big ? 1.2 : .6));
    lanterns(dt);
    cam();
    draw();
  }
  function finish() {
    if (state === 'end') return;
    state = 'end'; endT = clock;
    if (me) { me.score = Math.round(score); me.done = true; me.pct = pct(); }
    for (const s of seats) if (s.bot && s.sim?.length) { s.score = s.sim[s.sim.length - 1][1]; s.done = true; }
    send({ t: 'end', sc: Math.round(score), p: pct() });
    if (placeOf() === 1) audio.win(); else audio.full();
    if (A) { const t = A.ctx.currentTime; for (let k = 0; k < 6; k++) A.hit(k < 5 ? 'd' : 'D', t + k * .12, .8); }
  }
  const pct = () => total ? Math.round((goodN + okN) / total * 100) : 0;
  const order = () => [...seats].sort((a, b) => b.score - a.score);
  const placeOf = () => me ? 1 + order().indexOf(me) : 1;
  function outcome() {
    const place = placeOf();
    return { place, of: seats.length, value: Math.round(score), time: chart ? chart.length : 0,
      text: `${ord(place)} place · ${fmtN(score)} pts · ${pct()} % des notes${maxCombo >= 20 ? ' · série de ' + maxCombo : ''}${feverN ? ' · ' + feverN + ' fête' + (feverN > 1 ? 's' : '') : ''}` };
  }

  // ---------- the band, drawn over the stage ----------
  let cv = null, g2 = null;
  function draw() {
    if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = g2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (state === 'pick') { drawPick(g, W, H); return; }
    if (chart) drawBand(g, W, H);
  }
  function txt(g, s, x, y, size, color, align = 'center', font = 'Titan One', stroke = 5) {
    g.font = `${font === 'Titan One' ? 400 : 800} ${size}px '${font}', Rubik, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = 'rgba(26,19,13,.95)'; if (stroke) g.strokeText(s, x, y);
    g.fillStyle = color; g.fillText(s, x, y);
  }
  function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawPick(g, W, H) {
    const w = Math.min(520, W - 40), rowH = 36, h = 110 + rowH * SONGS.length, x = (W - w) / 2, y = Math.max(16, H - h - 40);
    g.fillStyle = 'rgba(26,19,13,.84)'; round(g, x, y, w, h, 18); g.fill();
    g.strokeStyle = 'rgba(232,64,42,.75)'; g.lineWidth = 3; g.stroke();
    txt(g, 'taiko héros · ' + mode, W / 2, y + 34, 26, '#ffdc8f');
    SONGS.forEach((S2, i) => {
      const yy = y + 66 + i * rowH, on = i === pick;
      if (on) { g.fillStyle = 'rgba(232,64,42,.92)'; round(g, x + 14, yy, w - 28, rowH - 6, 10); g.fill(); }
      const [name, who] = S2.name.split(' · ');
      txt(g, name, x + 30, yy + (rowH - 6) / 2, 18, on ? '#fff' : '#f6ecd8', 'left', 'Rubik', 0);
      txt(g, who || 'matsuri', x + w - 30, yy + (rowH - 6) / 2, 13, on ? '#ffe0c8' : '#b8a888', 'right', 'Rubik', 0);
    });
    const host = seats.find(s => s.id === hostId);
    txt(g, isHost ? `↑ ↓ choisir · entrée ou espace : jouer · ${Math.max(0, Math.ceil(pickT))} s` : `${host?.name ?? 'l\'hôte'} choisit le morceau…`, W / 2, y + h - 24, 15, '#ffdc8f', 'center', 'Rubik', 0);
  }
  function drawBand(g, W, H) {
    const top = Math.max(190, H * .25), bh = Math.min(110, H * .14), cy = top + bh / 2;
    const jx = Math.max(150, W * .2), span = W - jx - 20, R = bh * .3;
    const X = (tt) => jx + (tt - songT) / L.look * span;
    // the band: dark lacquer, gold in the fête
    g.fillStyle = fever > 0 ? 'rgba(90,40,10,.86)' : 'rgba(30,18,14,.82)'; g.fillRect(0, top, W, bh);
    g.fillStyle = fever > 0 ? `hsl(${(clock * 120) % 360},90%,60%)` : '#c8221c'; g.fillRect(0, top - 4, W, 4); g.fillRect(0, top + bh, W, 4);
    // the beats
    const bt = chart.beat;
    for (let b = Math.ceil((songT - .3) / bt); b * bt < songT + L.look; b++) {
      if (b < 0) continue;
      const x = X(b * bt); if (x < jx - 20) continue;
      g.fillStyle = `rgba(255,230,190,${b % 4 ? .07 : .2})`; g.fillRect(x - 1, top + 6, b % 4 ? 1 : 2, bh - 12);
    }
    // the judging circle
    g.beginPath(); g.arc(jx, cy, R * 1.12, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,240,220,.85)'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(jx, cy, R * .78, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,240,220,.4)'; g.lineWidth = 2; g.stroke();
    if (judgeFlash > 0) { g.beginPath(); g.arc(jx, cy, R * (1.1 + (1 - judgeFlash) * .6), 0, Math.PI * 2); g.strokeStyle = `rgba(255,220,120,${judgeFlash})`; g.lineWidth = 6 * judgeFlash; g.stroke(); }
    // the notes, far to near
    const gems = chart.gems;
    const vis = [];
    for (let k = Math.max(0, head - 8); k < gems.length; k++) { const q = gems[k]; if (q.t > songT + L.look + .1) break; vis.push(q); }
    for (let k = vis.length - 1; k >= 0; k--) {
      const q = vis[k];
      if (q.kind === 'r') {
        const x0 = Math.max(jx, X(q.t)), x1 = X(q.t + q.len);
        if (x1 < jx - 4) continue;
        g.fillStyle = COL.r; round(g, x0 - R * .8, cy - R * .8, Math.max(R * 1.6, x1 - x0 + R * 1.6), R * 1.6, R * .8); g.fill();
        g.strokeStyle = '#1a130d'; g.lineWidth = 3; g.stroke();
        if (x0 > jx + 2 || songT < q.t) txt(g, 'roulement !', x0 + R, cy, 14, '#1a130d', 'left', 'Rubik', 0);
        continue;
      }
      if (q.j && q.j !== 'm') continue;
      const x = X(q.t);
      if (x < -R || x > W + R) continue;
      const r = R * (q.big ? 1.3 : .9);
      g.globalAlpha = q.j === 'm' ? .35 : 1;
      g.beginPath(); g.arc(x, cy, r + 4, 0, Math.PI * 2); g.fillStyle = '#1a130d'; g.fill();
      g.beginPath(); g.arc(x, cy, r + 1, 0, Math.PI * 2); g.fillStyle = '#f6efe0'; g.fill();
      g.beginPath(); g.arc(x, cy, r - 3, 0, Math.PI * 2); g.fillStyle = COL[q.kind]; g.fill();
      // a little face, as on the festival drums
      g.fillStyle = '#1a130d'; g.beginPath(); g.arc(x - r * .3, cy - r * .12, r * .09, 0, 7); g.arc(x + r * .3, cy - r * .12, r * .09, 0, 7); g.fill();
      g.beginPath(); g.arc(x, cy + r * .12, r * .22, 0, Math.PI); g.strokeStyle = '#1a130d'; g.lineWidth = 2; g.stroke();
      g.globalAlpha = 1;
    }
    // the drum at the left: the skin (don) and the rim (ka) light up under each hand
    const dx = jx * .45, dr = Math.min(bh * .42, jx * .32);
    g.beginPath(); g.arc(dx, cy, dr, 0, Math.PI * 2); g.fillStyle = '#7a3a1e'; g.fill();
    for (const [hand, s] of [['L', -1], ['R', 1]]) {
      g.beginPath(); g.moveTo(dx, cy - dr); g.arc(dx, cy, dr, -Math.PI / 2, Math.PI / 2, s < 0); g.closePath();
      g.fillStyle = `rgba(58,168,216,${flash['k' + hand]})`; g.fill();
      g.beginPath(); g.moveTo(dx, cy - dr * .78); g.arc(dx, cy, dr * .78, -Math.PI / 2, Math.PI / 2, s < 0); g.closePath();
      g.fillStyle = flash['d' + hand] > 0 ? `rgba(232,64,42,${.4 + flash['d' + hand] * .6})` : '#efe2c4'; g.fill();
    }
    g.beginPath(); g.moveTo(dx, cy - dr); g.lineTo(dx, cy + dr); g.strokeStyle = 'rgba(26,19,13,.5)'; g.lineWidth = 2; g.stroke();
    txt(g, 'd  f  j  k', dx, top + bh + 18, 13, '#ffdc8f', 'center', 'Rubik', 4);
    // the score, the run, the festival gauge
    txt(g, fmtN(score), 20, top - 26, 30, '#fff', 'left');
    if (combo >= 3) txt(g, String(combo), jx, cy, Math.min(34, R * 1.1), '#fff');
    const gw = Math.min(360, W * .4), gx = W - gw - 20, gy = top + bh + 14;
    g.fillStyle = 'rgba(26,19,13,.82)'; round(g, gx - 4, gy - 4, gw + 8, 20, 8); g.fill();
    const segs = 20;
    for (let k = 0; k < segs; k++) {
      const on = gauge * segs > k;
      g.fillStyle = on ? (fever > 0 ? `hsl(${(clock * 200 + k * 18) % 360},90%,60%)` : k >= segs * .75 ? '#ffc83a' : '#e8402a') : 'rgba(255,255,255,.12)';
      g.fillRect(gx + k * gw / segs + 1, gy, gw / segs - 2, 12);
    }
    txt(g, fever > 0 ? 'fête ! points ×2' : 'jauge de fête', gx - 10, gy + 6, 13, fever > 0 ? '#ffd85a' : '#ffdc8f', 'right', 'Rubik', 4);
    // what the last strokes were worth
    for (const p of popups) {
      const k = p.t / (p.big ? 1.2 : .6);
      g.globalAlpha = 1 - k * k;
      if (p.big) txt(g, p.text, W / 2, top + bh + 70 - k * 20, 34, p.color);
      else txt(g, p.text, jx, top - 14 - k * 18, 18, p.color);
      g.globalAlpha = 1;
    }
    if (state === 'count') { const n = Math.ceil(-songT); txt(g, n > 0 ? String(n) : '', W / 2, H * .5, 64, '#ffdc8f'); txt(g, chart.name, W / 2, H * .5 + 50, 20, '#fff', 'center', 'Rubik', 5); }
    if (state === 'end') {
      const bw = Math.min(440, W - 40), bh2 = 150, bx = (W - bw) / 2, by = H * .5 - bh2 / 2;
      g.fillStyle = 'rgba(26,19,13,.9)'; round(g, bx, by, bw, bh2, 16); g.fill(); g.strokeStyle = '#e8402a'; g.lineWidth = 3; g.stroke();
      txt(g, pct() >= 95 ? 'la rue entière applaudit !' : pct() >= 70 ? 'le quartier applaudit' : 'quelques applaudissements polis', W / 2, by + 30, 22, '#ffdc8f');
      txt(g, fmtN(score) + ' pts', W / 2, by + 72, 34, '#fff');
      txt(g, `${goodN} bien · ${okN} ok · ${missN} ratés · ${rollN} coups de roulement · ${ord(placeOf())} place`, W / 2, by + 116, 14, '#e8d8b8', 'center', 'Rubik', 0);
    }
  }

  const board = () => `<div class="board">${order().map((s, i) => `<span style="color:${hexOf(s.color)}">${i + 1}. ${s.id === meId ? '<em>toi</em>' : s.name} ${fmtN(s.score)}</span>`).join('')}</div>`;
  return {
    modes: MODES,
    keys: [['f j', 'don · la peau (rouge)'], ['d k', 'ka · le bord (bleu)'], ['deux mains', 'les grosses notes'], ['↑ ↓ entrée', 'choisir le morceau']],
    start, update, stop, onFx, peerLeft,
    respawn() {},
    hud() {
      if (state === 'off') return { hidden: true };
      if (state === 'pick') return { html: `<b>taiko héros · ${mode}</b><span>${isHost ? 'choisis le morceau' : 'l\'hôte choisit le morceau'}</span>` };
      return { html: `<b>taiko héros · ${mode}</b>${board()}` };
    },
    // the menu looks at the stage from the street
    preview: () => ({ x: S.x, y: .3, z: S.drumZ, yaw: Math.PI, rad: 6.5, h: 1.6 }),
    set onEnd(f) { onEnd = f; },
    // tests
    get state() { return state; }, get chart() { return chart; }, get songT() { return songT; }, get score() { return score; }, get combo() { return combo; },
    get gauge() { return gauge; }, get fever() { return fever; }, get seats() { return seats; },
    _choose(i) { if (state === 'pick') { pick = i; choose(); } },
    _skip() { if (state === 'count') { t0 -= -songT * 1000; songT = 0; resync(); } },
    _finish: () => finish(), _now: () => songNow(), _press: (kind, hand = 'L', t = songNow()) => press(kind, hand, t),
  };
}
