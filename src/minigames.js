// minigames.js, games played in the garden. Most are digging races, each round on a
// fresh, untouched column of the plot and to a depth drawn at random. The kart race
// lives in kart.js, the paint game in paint.js, the laser game in laser.js.
// A finished game hands back { value, unit, lower, reward, text }.
import * as THREE from 'three';
import { createPaint, PAINT_COLORS } from './paint.js';
import { createLaser, houseSpot } from './laser.js';
import { createBlaster } from './tool.js';

// unit: how the record reads. lower: a smaller value is a better record.
export const GAMES = {
  course:  { name: 'course au trou',     sub: 'creuse jusqu\'à une profondeur tirée au sort (8 à 25 m)', unit: 'speed' },
  plongeon: { name: 'aller-retour',       sub: 'descends à la profondeur demandée, puis remonte à l\'air libre', unit: 'speed' },
  chrono:  { name: 'une minute',         sub: 'le plus profond possible en 60 secondes', unit: 'depth' },
  anneaux: { name: 'les anneaux',        sub: 'trois anneaux d\'or enfouis : passe dedans, dans l\'ordre', unit: 'time', lower: true },
  pile:    { name: 'pile poil',          sub: 'arrête-toi pile à la profondeur demandée, puis e', unit: 'err', lower: true },
  ruee:    { name: 'ruée vers l\'or',     sub: '90 secondes pour remplir ton sac du plus de valeur possible', unit: 'coins' },
  taupe:   { name: 'tape-taupe',         sub: '30 secondes, un maximum de taupes', unit: 'score' },
  tresor:  { name: 'chasse au trésor',   sub: 'un coffre enfoui, un thermomètre, 3 minutes', unit: 'time', lower: true },
  kart:    { name: 'a hole grand prix',  sub: 'karting, 4 tours derrière le village, des adversaires, des objets · à plusieurs', unit: 'time', lower: true },
  rc:      { name: 'mini bolides',       sub: 'voitures télécommandées dans les rues de la ville · turbo, feux d\'artifice, bombes…', unit: 'time', lower: true },
  nes:     { name: 'super creuseur',     sub: 'plateforme rétro en 2D, façon 8 bits · à plusieurs · le premier au drapeau', unit: 'time', lower: true },
  worms:   { name: 'taupes de guerre',   sub: 'artillerie au tour par tour : équipes de taupes, terrain destructible, vent, bazooka, grenades…', unit: 'score' },
  encre:   { name: 'encre 2D',           sub: 'plateforme 2D en équipes : peins le niveau, nage dans ton encre', unit: 'pct' },
  peinture: { name: 'peinture',           sub: '90 secondes pour couvrir le trou de ta couleur, contre les drones-peintres · clic pour tirer', unit: 'pct' },
  laser:   { name: 'laser game',         sub: '2 minutes de laser dans le jardin · touché = retour à la maison', unit: 'frags' },
};
const ARENA = new Set(['peinture', 'laser']);
// played together: the first to finish wins (race), or everyone stops at once and the best wins (score)
const RACE = new Set(['course', 'plongeon', 'anneaux', 'tresor']);
const SCORE = new Set(['chrono', 'ruee', 'taupe', 'pile']);

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export function fmtRecord(unit, v) {
  if (unit === 'time') return fmt(v);
  if (unit === 'speed') return `${v.toFixed(2)} m/s`;
  if (unit === 'depth') return `${v.toFixed(1)} m`;
  if (unit === 'err') return `${Math.round(v * 100)} cm d'écart`;
  if (unit === 'coins') return `${Math.round(v).toLocaleString('fr-FR')} ●`;
  if (unit === 'pct') return `${v.toFixed(1)} % du trou`;
  if (unit === 'frags') return `${v} touche${v > 1 ? 's' : ''}`;
  return `${v}`;
}
const MOUNDS = Array.from({ length: 9 }, (_, n) => new THREE.Vector3(-14.5 + (n % 3) * 1.8, 0, -1.8 + Math.floor(n / 3) * 1.8));
// every game draws its targets from a seed: a game started online is the same for everyone
let R = Math.random;
const rand = (a, b) => a + R() * (b - a);
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function moleHead() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x3a2b24, roughness: 1 });
  const pink = new THREE.MeshLambertMaterial({ color: 0xe8a0aa });
  const b = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), fur); b.scale.y = 1.2; b.position.y = .2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), pink); nose.position.set(0, .3, .28);
  const eyes = [-.1, .1].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(.03), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(x, .4, .24); return e; });
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, .12, 12), new THREE.MeshStandardMaterial({ color: 0xd9a125 })); hat.position.y = .55;
  g.add(b, nose, ...eyes, hat);
  return g;
}

export function createMiniGames({ scene, terrain, player, audio, ui, sackValue, camera, colliders, house, debris, getNet }) {
  const hud = document.getElementById('mg');
  let game = null;
  let onEnd = () => {};

  // ---------- the arena games: paint and laser, a blaster in hand ----------
  const paint = createPaint({ scene, terrain, audio, debris });
  const laser = createLaser({ scene, terrain, colliders, audio });
  const blaster = createBlaster(camera);
  let fireCd = 0;
  // the others online who picked the same game
  const playing = (id) => { const net = getNet(); return net ? [...net.peers].filter(([, p]) => p.g === id && p.w === 'home') : []; };
  const myColor = () => getNet()?.color ?? PAINT_COLORS[0];
  function sendHome(by) {
    houseSpot(player.pos);
    player.vel.set(0, 0, 0); player.yaw = Math.PI; player.pitch = 0; player.unstick();
    ui.hurt(); ui.wash(); audio.tagged();
    ui.toast(`touché par ${by} · retour à la maison`, true, 2200);
  }
  laser.onTagged = sendHome;

  // ---------- whack-a-mole: mounds on the lawn west of the plot ----------
  const arena = new THREE.Group();
  arena.visible = false;
  scene.add(arena);
  const mounds = MOUNDS.map(p => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }));
    m.scale.y = .45; m.position.copy(p);
    const head = moleHead();
    head.position.copy(p).setY(-.6);
    arena.add(m, head);
    return { p, head, up: 0, life: 0 };
  });

  // ---------- treasure chest and golden rings, both seen through the ground ----------
  const chest = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a2a }), band = new THREE.MeshStandardMaterial({ color: 0xffd75e, metalness: .8, emissive: 0x5a3a08 });
  chest.add(new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .55), wood));
  for (const x of [-.28, .28]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .52, .57), band); b.position.x = x; chest.add(b); }
  chest.visible = false;
  scene.add(chest);
  const ringMat = (on) => new THREE.MeshBasicMaterial({ color: on ? 0xffd75e : 0x7a6a40, transparent: true, opacity: on ? .95 : .35, depthTest: false });
  const rings = [0, 1, 2].map(() => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.8, .07, 8, 32), ringMat(false));
    r.renderOrder = 997; r.visible = false; r.rotation.x = Math.PI / 2;
    scene.add(r);
    return r;
  });
  // the target depth, drawn as a gold disc across the shaft (course, plongeon, pile)
  const goal = new THREE.Mesh(new THREE.RingGeometry(.3, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: .5, depthTest: false, side: THREE.DoubleSide }));
  goal.rotation.x = -Math.PI / 2; goal.renderOrder = 997; goal.visible = false;
  scene.add(goal);

  let setHud = function (html) { hud.classList.toggle('hidden', !html); if (html) hud.innerHTML = html; };
  // each game's live value, for the board and the others
  function live(g, depth) {
    if (g.id === 'course') return [depth, depth.toFixed(1) + ' m'];
    if (g.id === 'plongeon') return [g.phase === 'down' ? depth : 2 * g.target - depth, g.phase === 'down' ? '↓ ' + depth.toFixed(1) + ' m' : '↑ ' + depth.toFixed(1) + ' m'];
    if (g.id === 'chrono') return [g.best, g.best.toFixed(1) + ' m'];
    if (g.id === 'anneaux') return [g.next, `anneau ${g.next + 1}`];
    if (g.id === 'ruee') return [Math.max(0, sackValue() - g.start), Math.round(Math.max(0, sackValue() - g.start)) + ' ●'];
    if (g.id === 'taupe') return [g.score, g.score + ''];
    if (g.id === 'pile') return [0, 'en cours'];
    if (g.id === 'tresor') return [0, 'cherche…'];
    return null;
  }

  // a column nobody has dug yet, away from the fence; the player is put on top of it
  function freshSpot() {
    const D = terrain.columnDepths(), n = terrain.NX, S = terrain.S;
    const free = [];
    for (let k = 4; k < n - 4; k++) for (let i = 4; i < n - 4; i++) {
      let ok = true;
      for (let dk = -2; dk <= 2 && ok; dk++) for (let di = -2; di <= 2 && ok; di++) if (D[(i + di) + n * (k + dk)] > .3) ok = false;
      if (ok) free.push([i, k]);
    }
    const [i, k] = free.length ? free[Math.floor(Math.random() * free.length)] : [n / 2, n / 2];
    const x = terrain.X0 + (i + .5) * S, z = terrain.Z0 + (k + .5) * S;
    player.pos.set(x, .05, z); player.vel.set(0, 0, 0); player.pitch = -1.2; player.unstick();
    return new THREE.Vector3(x, 0, z);
  }

  // the others in this game: id → { name, color, v (live value), txt, end (final value) , at (finish order) }
  let rivals = new Map(), sendFx = () => {}, sendT = 0, finished = 0;
  function start(id, { seed, humans, players, send } = {}) {
    stop(false);
    R = seeded((seed ?? Math.floor(Math.random() * 1e9)) % 2147483646 + 1);
    const others = humans != null ? humans - 1 : playing(id).length;
    rivals = new Map((players || []).filter(p => !p.me).map(p => [p.id, { name: p.name, color: p.color, v: 0, txt: '', end: null, at: 0 }]));
    sendFx = send || (() => {}); sendT = 0; finished = 0;
    const g = { id, t: 0, count: 3, best: 0 };
    if (['course', 'plongeon', 'chrono', 'anneaux', 'pile', 'ruee'].includes(id)) g.spot = freshSpot();
    if (id === 'course') { g.target = Math.round(rand(8, 25)); ui.toast(`creuse jusqu'à ${g.target} m !`, false, 2600); }
    else if (id === 'plongeon') { g.target = Math.round(rand(6, 16)); g.phase = 'down'; ui.toast(`descends à ${g.target} m, puis remonte !`, false, 2600); }
    else if (id === 'chrono') { ui.toast('60 secondes : le plus profond possible !', false, 2600); }
    else if (id === 'pile') { g.target = Math.round(rand(5, 18) * 2) / 2; ui.toast(`arrête-toi pile à ${g.target} m, puis e`, false, 3000); }
    else if (id === 'ruee') { g.start = sackValue(); ui.toast('90 secondes : remplis ton sac !', false, 2600); }
    else if (id === 'peinture') {
      player.pos.set(0, .05, -10.2); player.vel.set(0, 0, 0); player.yaw = Math.PI; player.pitch = -.35; player.unstick();
      paint.start({ myColor: myColor(), bots: Math.max(0, 2 - others) });
      blaster.setColor(myColor());
      ui.toast('peins le trou de ta couleur ! (tirer sur un drone l\'assomme)', false, 3000);
    } else if (id === 'laser') {
      if (!house.doorOpen) house.toggleDoor();
      player.pos.set(0, .05, -18.5); player.vel.set(0, 0, 0); player.yaw = Math.PI; player.pitch = 0; player.unstick();
      laser.start({ bots: Math.max(0, 3 - others), color: myColor() });
      blaster.setColor(myColor());
      ui.toast('sors de la maison et touche les autres · la maison est une zone sûre', false, 3200);
    }
    else if (id === 'anneaux') {
      g.next = 0;
      const depths = [rand(3, 6), rand(8, 12), rand(14, 19)];
      rings.forEach((r, n) => {
        r.position.set(g.spot.x + rand(-1.8, 1.8), -depths[n], g.spot.z + rand(-1.8, 1.8));
        r.material = ringMat(n === 0); r.visible = true;
      });
      ui.toast('trois anneaux d\'or sous tes pieds : passe dedans !', false, 2600);
    } else if (id === 'taupe') {
      player.pos.set(-12.7, 0.05, 1.6); player.yaw = Math.PI; player.pitch = -.55; player.vel.set(0, 0, 0);
      arena.visible = true;
      g.score = 0; g.next = 0;
      ui.toast('frappe les taupes !', false, 2600);
    } else if (id === 'tresor') {
      const S = terrain.S, n = terrain.NX;
      const i = 5 + Math.floor(R() * (n - 10)), k = 5 + Math.floor(R() * (n - 10));
      chest.position.set(terrain.X0 + (i + .5) * S, -rand(2, 12), terrain.Z0 + (k + .5) * S);
      chest.visible = true;
      g.count = 0; g.beep = 0;
      ui.toast('un coffre est enfoui dans le potager · suis le thermomètre', false, 3000);
    }
    if (g.target && id !== 'pile') { goal.position.set(g.spot.x, -g.target, g.spot.z); goal.visible = true; }
    game = g;
    audio.tick();
  }

  function clear() {
    arena.visible = false; chest.visible = false; goal.visible = false;
    rings.forEach(r => { r.visible = false; });
    mounds.forEach(m => { m.up = 0; m.head.position.y = -.6; });
    paint.stop(); laser.stop();
    blaster.root.visible = false;
    setHud(null);
  }
  function stop(announce = true) {
    if (!game) return;
    game = null; clear();
    if (announce) ui.toast('mini-jeu abandonné');
  }
  function end(result) {
    const id = game.id;
    if (rivals.size && !ARENA.has(id)) {
      sendFx({ t: 'end', v: result.lost ? null : result.value });
      if (RACE.has(id) && !result.lost) {
        // the first across the line: those who finished before me are ahead
        const place = 1 + [...rivals.values()].filter(r => r.end != null).length;
        return finish(id, placed(result, place));
      }
      if (SCORE.has(id) && !result.lost) {
        // wait (a little) for the others' scores before ranking
        game.waiting = { result, t: 0 };
        game.mine = result.value;
        return;
      }
    }
    finish(id, result);
  }
  function finish(id, result) {
    game = null; clear();
    onEnd(id, result);
  }
  const PLACE = (n) => n === 1 ? '1er' : n + 'e';
  function placed(result, place) {
    const of = rivals.size + 1;
    return { ...result, place, of, first: place === 1, reward: Math.round(result.reward * (place === 1 ? 1.5 : 1)), text: `${PLACE(place)} sur ${of} · ${result.text}${place === 1 ? ' · +50 % pour la victoire' : ''}` };
  }
  function rankScore() {
    const g = game, lower = GAMES[g.id].lower, mine = g.mine;
    const better = [...rivals.values()].filter(r => r.end != null && (lower ? r.end < mine : r.end > mine)).length;
    finish(g.id, placed(g.waiting.result, 1 + better));
  }
  // what the others send about this game: their progress, their result, a mole or a chest taken
  function onRival(id, fx) {
    const r = rivals.get(id);
    if (!game || !r) return;
    if (fx.t === 'p') { r.v = fx.v; r.txt = fx.txt; }
    else if (fx.t === 'end') {
      r.end = fx.v ?? (GAMES[game.id].lower ? Infinity : -Infinity); r.at = ++finished;
      if (game.id === 'tresor' && fx.v != null && !game.waiting) { finish('tresor', { lost: true, text: `${r.name} a trouvé le trésor en premier` }); return; }
      if (RACE.has(game.id) && !game.waiting && game.count <= 0) ui.toast(`${r.name} a fini !`, false, 1500);
    } else if (fx.t === 'mole' && game.id === 'taupe') { const m = mounds[fx.m]; if (m) { m.up = 0; m.life = 0; } }
  }
  function rivalLeft(id) { rivals.delete(id); }
  // the live board under the HUD: me and the others, best first
  function board(mine, txt) {
    if (!rivals.size) return '';
    const lower = GAMES[game.id].lower;
    const rows = [{ name: 'toi', v: mine, txt, me: true }, ...[...rivals.values()].map(r => ({ ...r, v: r.end ?? r.v }))];
    rows.sort((a, b) => lower ? a.v - b.v : b.v - a.v);
    const hex = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');
    return `<div class="board">${rows.slice(0, 5).map((r, n) => `<span style="color:${r.me ? '#fff' : hex(r.color)}">${n + 1}. ${r.me ? '<em>toi</em>' : r.name}${r.txt ? ' · ' + r.txt : ''}${r.end != null && !r.me ? ' ✓' : ''}</span>`).join('')}</div>`;
  }

  const bar = (f) => `<div class="therm"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;

  function update(dt, depth) {
    if (!game) return;
    const g = game;
    if (g.waiting) {
      g.waiting.t += dt;
      const all = [...rivals.values()].every(r => r.end != null);
      setHud(`<b>${GAMES[g.id].name}</b><span class="big">${all ? '…' : Math.ceil(Math.max(0, 8 - g.waiting.t))}</span><span>en attente des autres</span>${board(g.mine, '')}`);
      if (all || g.waiting.t > 8) rankScore();
      return;
    }
    fireCd -= dt;
    if (g.id === 'peinture') paint.update(dt, g.count <= 0);
    if (g.id === 'laser') laser.update(dt, g.count <= 0, player);
    if (g.count > 0) { g.count -= dt; setHud(`<b>${GAMES[g.id].name}</b><span class="big">${Math.ceil(g.count)}</span>${g.target ? `<span>objectif ${g.target} m</span>` : ''}`); if (g.count <= 0) audio.buy(); return; }
    g.t += dt;
    g.best = Math.max(g.best, depth);
    const title = `<b>${GAMES[g.id].name}</b>`;
    const lv = rivals.size ? live(g, depth) : null;
    if (lv) {
      sendT -= dt;
      if (sendT <= 0) { sendT = .25; sendFx({ t: 'p', v: +lv[0].toFixed(2), txt: lv[1] }); }
      const inner = setHud;
      setHud = (html) => inner(html + board(lv[0], lv[1]));
      try { tick(g, dt, depth, title); } finally { setHud = inner; }
      return;
    }
    tick(g, dt, depth, title);
  }
  function tick(g, dt, depth, title) {
    if (g.id === 'course') {
      setHud(`${title}<span class="big">${fmt(g.t)}</span><span>${depth.toFixed(1)} / ${g.target} m</span>${bar(depth / g.target)}`);
      if (depth >= g.target) {
        const v = g.target / g.t;
        end({ value: v, reward: Math.round(60 + v * 260), text: `${g.target} m en ${fmt(g.t)} · ${v.toFixed(2)} m/s` });
      }
    } else if (g.id === 'plongeon') {
      if (g.phase === 'down' && depth >= g.target) { g.phase = 'up'; audio.buy(); ui.toast('touché ! maintenant, remonte !', false, 1800); goal.visible = false; }
      const txt = g.phase === 'down' ? `descends · ${depth.toFixed(1)} / ${g.target} m` : `remonte · encore ${depth.toFixed(1)} m`;
      setHud(`${title}<span class="big">${fmt(g.t)}</span><span>${txt}</span>${bar(g.phase === 'down' ? depth / g.target : 1 - depth / g.target)}`);
      if (g.phase === 'up' && depth < .3) {
        const v = 2 * g.target / g.t;
        end({ value: v, reward: Math.round(100 + v * 320), text: `aller-retour à ${g.target} m en ${fmt(g.t)} · ${v.toFixed(2)} m/s` });
      }
    } else if (g.id === 'chrono') {
      const left = 60 - g.t;
      setHud(`${title}<span class="big">${g.best.toFixed(1)} m</span><span>${Math.max(0, left).toFixed(1)} s</span>${bar(left / 60)}`);
      if (left <= 0) end({ value: g.best, reward: Math.round(g.best * 45), text: `${g.best.toFixed(1)} m en une minute` });
    } else if (g.id === 'pile') {
      const diff = depth - g.target;
      const tone = Math.abs(diff) < .25 ? 'var(--gold-hot)' : diff > 0 ? 'var(--ember)' : 'var(--paper)';
      setHud(`${title}<span class="big" style="color:${tone}">${depth.toFixed(2)} m</span><span>objectif ${g.target} m · <b style="letter-spacing:.1em">e</b> pour valider</span>`);
    } else if (g.id === 'ruee') {
      const left = 90 - g.t, got = Math.max(0, sackValue() - g.start);
      setHud(`${title}<span class="big">${Math.round(got).toLocaleString('fr-FR')} ●</span><span>${Math.max(0, left).toFixed(1)} s</span>${bar(left / 90)}`);
      if (left <= 0) end({ value: got, reward: Math.round(got * .5), text: `${Math.round(got).toLocaleString('fr-FR')} ● de trouvailles en 90 s (+50 % de prime)` });
    } else if (g.id === 'anneaux') {
      const r = rings[g.next];
      const eye = player.pos.clone().setY(player.pos.y + 1);
      if (eye.distanceTo(r.position) < 1.1 || player.pos.distanceTo(r.position) < 1.1) {
        r.visible = false; audio.pickup(g.next * 2); ui.wash();
        g.next++;
        if (g.next < 3) rings[g.next].material = ringMat(true);
        else { end({ value: g.t, reward: Math.max(200, Math.round(1600 - g.t * 12)), text: `trois anneaux en ${fmt(g.t)}` }); return; }
      }
      setHud(`${title}<span class="big">${fmt(g.t)}</span><span>anneau ${g.next + 1} / 3 · à ${(-rings[g.next].position.y).toFixed(1)} m</span>`);
    } else if (g.id === 'taupe') {
      const left = 30 - g.t;
      g.next -= dt;
      if (g.next <= 0 && left > .5) {
        g.next = Math.max(.3, (.9 - g.t * .018) * (.6 + R() * .6));
        const free = mounds.filter(m => m.up <= 0);
        if (free.length) { const m = free[Math.floor(R() * free.length)]; m.up = 1; m.life = Math.max(.55, 1.3 - g.t * .025); audio.squeak(); }
      }
      for (const m of mounds) {
        if (m.up > 0) { m.life -= dt; if (m.life <= 0) m.up = 0; }
        m.head.position.y += ((m.up > 0 ? .05 : -.6) - m.head.position.y) * Math.min(1, dt * 14);
      }
      setHud(`${title}<span class="big">${g.score}</span><span>${Math.max(0, left).toFixed(1)} s</span>`);
      if (left <= 0) end({ value: g.score, reward: g.score * 20, text: `${g.score} taupes tapées` });
    } else if (g.id === 'tresor') {
      const d = chest.position.distanceTo(player.pos.clone().setY(player.pos.y + 1));
      const words = [[2, 'brûlant !!!'], [4, 'très chaud'], [7, 'chaud'], [11, 'tiède'], [16, 'froid'], [Infinity, 'glacial']];
      const heat = Math.max(0, 1 - d / 16);
      g.beep -= dt;
      if (g.beep <= 0) { g.beep = .25 + (1 - heat) * 1.4; audio.tick(); }
      const left = 180 - g.t;
      setHud(`${title}<span class="big" style="color:hsl(${40 - heat * 40},95%,${55 + heat * 10}%)">${words.find(([m]) => d < m)[1]}</span><span>${fmt(Math.max(0, left))}</span>${bar(heat)}`);
      if (left <= 0) end({ lost: true, text: 'le temps est écoulé · le coffre reste sous terre' });
    } else if (g.id === 'peinture') {
      const left = 90 - g.t, st = paint.standings(), me = paint.mine, rank = st.findIndex(s => s.me) + 1;
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      setHud(`${title}<span class="big" style="color:${hex(myColor())}">${me.toFixed(1)} %</span><span>${rank}${rank === 1 ? 'er' : 'e'} / ${st.length} · ${Math.max(0, left).toFixed(1)} s</span>${paint.bar()}`);
      if (left <= 0) {
        const first = rank === 1;
        end({ value: me, reward: Math.round(me * 20) + (first ? 400 : 0), text: `${me.toFixed(1)} % du trou à ta couleur · ${first ? 'victoire !' : rank + 'e place'}`, first });
      }
    } else if (g.id === 'laser') {
      const left = 120 - g.t, st = laser.standings(), me = laser.me, rank = st.findIndex(s => s.me) + 1;
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      const board = st.slice(0, 4).map(s => `<span style="color:${hex(s.color)}">${s.me ? '<em>toi</em>' : s.name} · ${s.frags}</span>`).join('');
      setHud(`${title}<span class="big">${me.frags} <small>touche${me.frags > 1 ? 's' : ''}</small></span><span>${fmt(Math.max(0, left))} · touché ${me.deaths} fois</span><div class="board">${board}</div>`);
      if (left <= 0) {
        const first = rank === 1;
        end({ value: me.frags, reward: me.frags * 120 + (first ? 400 : 0), text: `${me.frags} touche${me.frags > 1 ? 's' : ''}, touché ${me.deaths} fois · ${first ? 'victoire !' : rank + 'e place'}`, first });
      }
    }
  }

  // E during « pile poil »: lock in the depth
  function validate(depth) {
    if (!game || game.id !== 'pile' || game.count > 0) return false;
    const err = Math.abs(depth - game.target);
    end({ value: err, reward: Math.max(0, Math.round(1200 - err * 600)), text: `${depth.toFixed(2)} m pour ${game.target} m · ${Math.round(err * 100)} cm d'écart` });
    return true;
  }
  function onSwing(eye, dir) {
    if (!game || game.count > 0 || game.id !== 'taupe') return false;
    const ray = new THREE.Ray(eye, dir);
    for (const m of mounds) {
      if (m.up <= 0 || m.head.position.y < -.2) continue;
      const c = m.head.position.clone().setY(m.head.position.y + .25);
      if (ray.distanceSqToPoint(c) < .4 * .4 && c.distanceTo(eye) < 4) { m.up = 0; m.life = 0; game.score++; audio.bonk(); ui.hit(); sendFx({ t: 'mole', m: mounds.indexOf(m) }); return true; }
    }
    return false;
  }
  function onDig(point) {
    if (!game || game.id !== 'tresor' || game.count > 0) return;
    if (point.distanceTo(chest.position) < 1.3) end({ value: game.t, reward: 1000 + Math.round((180 - game.t) * 10), text: `trésor trouvé en ${fmt(game.t)}` });
  }

  // the trigger, held down: paint blobs come fast, laser shots a little slower
  function fire(eye, dir) {
    if (!game || !ARENA.has(game.id) || game.count > 0 || fireCd > 0) return;
    const muzzle = camera.localToWorld(blaster.MUZZLE.clone());
    const net = getNet();
    if (game.id === 'peinture') {
      fireCd = .11;
      const fx = paint.fire(muzzle, dir);
      if (fx) { blaster.fire(); net?.sendFx(fx); }
    } else {
      fireCd = .28;
      const r = laser.fire(eye, dir, muzzle, player, playing('laser'));
      if (!r) return;
      if (r.house) { ui.toast('pas de tir dans la maison', true, 900); fireCd = .8; return; }
      blaster.fire();
      net?.sendFx(r.fx);
      if (r.tagged != null) net?.sendFx({ k: 'tag', to: r.tagged });
      if (r.hit) { ui.hit(); ui.toast(`touché : ${r.hit} !`, false, 900); }
    }
  }
  // what the others online do in our game
  function onFx(id, peer, fx) {
    if (!game) return;
    if (game.id === 'peinture' && fx.k === 'blob' && peer.g === 'peinture') paint.onPeerBlob(id, peer, fx);
    if (game.id === 'laser' && peer.g === 'laser') {
      if (fx.k === 'beam') laser.onPeerBeam(peer, fx);
      if (fx.k === 'tag' && fx.to === getNet()?.id) laser.peerTagged(peer.name);
    }
  }
  function updateBlaster(dt, show, moving) {
    blaster.root.visible = show;
    if (show) blaster.update(dt, moving);
  }

  return {
    start, stop, update, onSwing, onDig, validate, fire, onFx, onRival, rivalLeft, updateBlaster, paint, laser,
    get armed() { return !!game && ARENA.has(game.id); },
    get active() { return game ? game.id : null; },
    set onEnd(f) { onEnd = f; },
    fmt,
  };
}
