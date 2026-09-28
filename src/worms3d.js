// worms3d.js, « lombrics 3D »: the hidden game of the crypt, in the spirit of Worms 3D. Teams of four
// pink worms on a destructible island in the middle of the sea, one worm at a time, a turn clock,
// wind, fall damage, drowning, and the whole arsenal: bazooka, grenades, the holy hand grenade and
// its choir, banana bomb, sheep, air strike, ninja rope, jetpack… Crates fall on parachutes, mines
// and oil drums lie about, the dead leave gravestones, and in sudden death the sea rises.
// The island comes from the seed; the host runs everything else (the bots too) from everyone's
// inputs and sends it round; the others draw what they're told and replay the explosions.
import * as THREE from 'three';
import { createLand, makeField, VS, HALF, TOP, WATER0, rng } from './worms3d-land.js';
import { wormModel, heldModel, projModel, crateModel, graveModel, tagSprite, popSprite, bubbleSprite, particlePool, flashTex, seaModel, M, GLOW, put, hex } from './worms3d-art.js';
import { createSfx } from './worms3d-sfx.js';
import { clamp } from './lib/math.js';

export const W3D_AT = new THREE.Vector3(-700, 0, 700);
const PI = Math.PI, TAU = PI * 2, STEP = 1 / 60;
const G = 12, WIND_MAX = 5, TURN_T = 45, RETREAT_T = 5, HP0 = 100, WALK = 1.7;
const r2 = (v) => Math.round(v * 100) / 100;
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

// key: the number key that selects it (again to go through the others on the same key)
const WEAPONS = [
  { id: 'bazooka', name: 'bazooka', key: 1, ammo: -1, charge: true, speed: 24, wind: 1, impact: true, r: 2.2, dmg: 50, q: ['feu !', 'prends ça !', 'cadeau !'] },
  { id: 'homing', name: 'missile à tête chercheuse', key: 1, ammo: 1, charge: true, speed: 18, impact: true, homing: true, r: 2.2, dmg: 50, q: ['il te suit…', 'verrouillé !'] },
  { id: 'grenade', name: 'grenade', key: 2, ammo: -1, charge: true, speed: 15, fuse: true, bounce: .45, r: 2.2, dmg: 50, q: ['attrape !', 'grenade !', 'attention…'] },
  { id: 'cluster', name: 'bombe à fragmentation', key: 2, ammo: 3, charge: true, speed: 15, fuse: true, bounce: .4, r: 1.6, dmg: 30, frags: 'frag', q: ['ça va éclater'] },
  { id: 'banana', name: 'banane explosive', key: 2, ammo: 1, charge: true, speed: 15, fuse: true, bounce: .5, r: 3, dmg: 75, frags: 'banana2', q: ['banane !', 'une banane ? pour moi ?'] },
  { id: 'holy', name: 'sainte grenade', key: 2, ammo: 1, charge: true, speed: 14, fixedFuse: 3, bounce: .2, r: 6.5, dmg: 100, q: ['sainte grenade !', 'un, deux… cinq !', 'alléluia !'] },
  { id: 'shotgun', name: 'fusil à pompe', key: 3, ammo: -1, shots: 2, r: .9, dmg: 25, q: ['pan !', 'chevrotine !'] },
  { id: 'dynamite', name: 'dynamite', key: 4, ammo: 2, drop: true, r: 3.5, dmg: 75, q: ['ça va chauffer', 'je file !'] },
  { id: 'mine', name: 'mine', key: 4, ammo: 2, drop: true, q: ['attention où tu marches'] },
  { id: 'sheep', name: 'mouton', key: 4, ammo: 1, drop: true, r: 3, dmg: 75, q: ['va, mouton !', 'bêêê !'] },
  { id: 'airstrike', name: 'frappe aérienne', key: 5, ammo: 1, target: true, r: 1.8, dmg: 30, q: ['frappe aérienne !', 'à couvert !'] },
  { id: 'bat', name: 'batte de baseball', key: 6, ammo: -1, melee: true, dmg: 30, q: ['home run !', 'hors du stade !'] },
  { id: 'firepunch', name: 'poing de feu', key: 6, ammo: -1, melee: true, dmg: 30, q: ['poing de feu !', 'hadoukeu !'] },
  { id: 'girder', name: 'poutre', key: 7, ammo: 3, place: true, q: ['bâtisseur !'] },
  { id: 'rope', name: 'corde ninja', key: 8, ammo: 5, util: true, q: ['youhou !', 'tarzan !'] },
  { id: 'jetpack', name: 'jetpack', key: 8, ammo: 1, util: true, q: ['décollage !'] },
  { id: 'teleport', name: 'téléporteur', key: 8, ammo: 2, target: true, q: ['pouf !'] },
  { id: 'skip', name: 'passer son tour', key: 9, ammo: -1, q: ['pas envie…', 'je passe'] },
  { id: 'surrender', name: 'se rendre', key: 0, ammo: -1, q: ['on se rend !'] },
];
const WI = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
// what flies, how it flies
const PROJ = {
  bazooka: { impact: true, wind: 1, r: 2.2, dmg: 50 }, homing: { impact: true, r: 2.2, dmg: 50 },
  grenade: { bounce: .45, r: 2.2, dmg: 50 }, cluster: { bounce: .4, r: 1.6, dmg: 30 }, frag: { impact: true, wind: .5, r: 1.2, dmg: 20 },
  banana: { bounce: .5, r: 3, dmg: 75 }, banana2: { impact: true, r: 2, dmg: 40, arm: .35 },
  holy: { bounce: .2, r: 6.5, dmg: 100 }, dynamite: { bounce: .15, r: 3.5, dmg: 75 }, sheep: { bounce: .1, r: 3, dmg: 75 },
  strike: { impact: true, wind: .6, r: 1.8, dmg: 30 },
};
const PKINDS = Object.keys(PROJ);
const MINE = { bounce: .2 };
const CRATE_WEAPONS = ['holy', 'banana', 'homing', 'cluster', 'sheep', 'airstrike', 'dynamite', 'mine', 'jetpack', 'rope', 'teleport', 'girder'];
const MODES = [
  { id: 'duel', name: 'duel', sub: 'deux équipes de quatre lombrics · une île, la mer autour', help: 'zqsd : ramper · espace : sauter (deux fois : salto) · souris : viser · clic maintenu : tirer · 1…0, molette : armes', teams: 2, worms: 4, sd: 18, unit: 'pv', lower: false },
  { id: 'melee', name: 'mêlée', sub: 'quatre équipes de trois lombrics · chacun pour soi', help: 'zqsd : ramper · espace : sauter · souris : viser · clic maintenu : tirer · 1…0, molette : armes', teams: 4, worms: 3, sd: 24, unit: 'pv', lower: false },
];
const NAMES = ['gaston', 'josette', 'bébert', 'ginette', 'dédé', 'lulu', 'momo', 'fifi', 'zaza', 'riton', 'mimile', 'nénette', 'toto', 'jojo', 'loulou', 'pépette', 'kiki', 'nono', 'titine', 'bibi'];
const BOTS = [['les asticots', 0x3a8ef0], ['les lombrics', 0xf2c230], ['les vermisseaux', 0x45c060], ['les nématodes', 0xb05ae0], ['les annélides', 0xf08a2a]];
const Q = {
  turn: ['à l\'attaque !', 'c\'est parti !', 'tremblez, vermisseaux !', 'mon tour !', 'je vais tout casser', 'on y va'],
  hurt: ['aïe !', 'ouille !', 'mes fesses !', 'même pas mal', 'tu vas me le payer !', 'argh !', 'hé !'],
  friend: ['traître !', 'hé, on est ensemble !', 'mais… pourquoi ?'],
  die: ['adieu…', 'je reviendrai…', 'bye bye', 'maman…', 'c\'est injuste…'],
  drown: ['glou glou…', 'je sais pas nager !', 'au secours !'],
  miss: ['raté…', 'oups', 'c\'était exprès', 'bon…'],
  win: ['victoire !', 'trop facile', 'on est les meilleurs !'],
};
// held input bits
const H_F = 1, H_B = 2, H_L = 4, H_R = 8, H_UP = 16, H_FIRE = 32;

export function createWorms3d({ scene, camera, ui }) {
  const AT = W3D_AT;
  const root = new THREE.Group(); root.position.copy(AT); root.visible = false; scene.add(root);
  const sfx = createSfx();
  let onEnd = () => {};

  // ---------- what stays: the sea, far rocks, a heavenly beam, particles ----------
  const sea = seaModel(); root.add(sea);
  {
    const rock = M(0x7a7066), r = rng(3);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU + r(), d = 70 + r() * 60, h = 6 + r() * 16;
      const m = put(root, new THREE.ConeGeometry(4 + r() * 6, h, 6), rock, Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d, 0, r() * 3);
      m.scale.x = .6 + r() * .8;
      put(root, new THREE.ConeGeometry(2.4, 2, 6), M(0x5cb846), m.position.x, h - .6, m.position.z).scale.set(m.scale.x * .7, .5, .7);
    }
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, 2.4, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.visible = false; root.add(beam);
  const fx = new THREE.Group(); root.add(fx);
  const fire = particlePool(fx, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 260, -1.5, 2);
  const smoke = particlePool(fx, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .75, depthWrite: false }), 220, -.6, 1);
  const dirt = particlePool(fx, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 300, 12, 0);
  const sparks = particlePool(fx, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 200, 4, 3);
  const FT = flashTex();
  const flashes = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.visible = false; fx.add(s); return { s, t: 0, r: 1 }; });
  const rings = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -PI / 2; m.visible = false; fx.add(m); return { m, t: 0, r: 1 }; });
  let flashN = 0, ringN = 0;
  const pops = Array.from({ length: 10 }, () => { const s = popSprite(); s.visible = false; fx.add(s); return { s, t: 0 }; });
  let popN = 0;
  const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true }));
  tracer.visible = false; fx.add(tracer);
  let tracerT = 0;
  // the rope, the aim, the target on the map, the girder about to be placed
  const ropeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8d8a8 }));
  ropeLine.visible = false; ropeLine.frustumCulled = false; root.add(ropeLine);
  const cross = new THREE.Group(); root.add(cross);
  put(cross, new THREE.TorusGeometry(.16, .025, 6, 20), GLOW(0xff3a2a, 1.5));
  put(cross, new THREE.SphereGeometry(.03, 6, 4), GLOW(0xff3a2a, 1.5));
  cross.traverse(o => { if (o.material) { o.material.depthTest = false; o.renderOrder = 30; } });
  const dots = Array.from({ length: 8 }, () => { const m = put(root, new THREE.SphereGeometry(.035, 6, 4), GLOW(0xffffff, 1.2)); m.visible = false; return m; });
  const reticle = new THREE.Group(); root.add(reticle); reticle.visible = false;
  put(reticle, new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xff3a2a, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: .85 }), 0, 0, 0, -PI / 2);
  put(reticle, new THREE.CylinderGeometry(.05, .05, 30, 6), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: .4, depthWrite: false }), 0, 15, 0);
  reticle.traverse(o => { o.renderOrder = 30; });
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(.9, .6, 4), new THREE.MeshBasicMaterial({ color: 0xff8a4a, transparent: true, opacity: .45, depthWrite: false }));
  ghost.visible = false; root.add(ghost);

  // ---------- the run ----------
  let run = null;
  let land = null;
  const world = new THREE.Group(); root.add(world);

  function clearWorld() {
    if (land) { root.remove(land.group); land.dispose(); land = null; }
    for (const o of [...world.children]) world.remove(o);
  }

  function start({ seed, opts = {}, humans = [], hostId, meId, send }) {
    stop(true);
    const mode = MODES.find(m => m.id === opts.mode) || MODES[0];
    const R = rng(seed ^ 0x5eed);
    clearWorld();
    const field = makeField(seed);
    land = createLand(field); land.buildAll(); root.add(land.group);
    root.visible = true;
    run = {
      seed, mode, meId, hostId, send: send || (() => {}), isHost: hostId === meId, R,
      teams: [], worms: [], projs: [], crates: [], mines: [], drums: [], graves: [],
      phase: 'intro', phaseT: 3.2, timer: TURN_T, turnTeam: -1, active: null, wind: new THREE.Vector2(),
      water: WATER0, sudden: false, turnN: 0, clock: 0, acc: 0, evq: [], snapT: 0, sendT: 0, idN: 1,
      cam: { yaw: 0, pitch: .25, aim: false, pos: new THREE.Vector3(0, 30, 40), look: new THREE.Vector3(), shake: 0, focus: null, focusT: 0 },
      local: { held: 0, fireDown: false, power: 0, charging: false, w: 0, fuse: 3, target: null, taps: [], lastSpace: -9, sent: '' },
      inputs: new Map(), bot: null, later: [], result: null, endT: 0, out: [], shots: 0, usedTurn: false, hurtThisTurn: false, banner: null, dmgDone: 0,
    };
    // teams: every human, then bots up to the mode's count
    const hs = humans.slice(0, 4);
    const nT = Math.max(mode.teams, hs.length);
    for (let t = 0; t < nT; t++) {
      const h = hs[t], b = BOTS[(t - hs.length + BOTS.length) % BOTS.length];
      const team = { i: t, owner: h ? h.id : '@bot', name: h ? (h.me ? 'ton équipe' : 'équipe ' + h.name) : b[0], short: h ? (h.me ? 'toi' : h.name) : b[0].replace(/^les /, ''), color: h ? (h.color ?? 0xe8384f) : b[1], worms: [], next: 0, ammo: {}, out: false, me: !!h?.me };
      if (h && team.color === 0xc8581a) team.color = 0xe8384f;
      for (const w of WEAPONS) team.ammo[w.id] = w.ammo;
      run.teams.push(team);
    }
    // spread the worms over the island's dry land, away from each other
    const names = [...NAMES].sort(() => R() - .5);
    const spots = [];
    const spot = (minD) => {
      for (let n = 0; n < 400; n++) {
        // inland first, anywhere dry if need be
        const x = (R() - .5) * (n < 250 ? 28 : 36), z = (R() - .5) * (n < 250 ? 28 : 36), y = land.topAt(x, z);
        if (y < run.water + (n < 250 ? 1.8 : .8) || y > TOP - 2) continue;
        if (n < 250 && (land.topAt(x + 1.5, z) < run.water + .5 || land.topAt(x - 1.5, z) < run.water + .5 || land.topAt(x, z + 1.5) < run.water + .5 || land.topAt(x, z - 1.5) < run.water + .5)) continue;
        if (spots.some(s => Math.hypot(s.x - x, s.z - z) < minD)) continue;
        const s = { x, y, z }; spots.push(s); return s;
      }
      return { x: 0, y: land.topAt(0, 0), z: 0 };
    };
    let wid = 0;
    for (let k = 0; k < mode.worms; k++) for (const team of run.teams) {
      const s = spot(4);
      const w = { id: wid++, team, name: names[wid % names.length], hp: HP0, shown: HP0, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, yaw: R() * TAU, ground: true, state: 'idle', dead: false, knock: false, fallFrom: s.y, flip: 0, pitch: .2, voice: .8 + R() * .5, net: null };
      team.worms.push(w); run.worms.push(w);
    }
    for (let k = 0; k < 5; k++) { const s = spot(3); run.mines.push({ id: run.idN++, def: MINE, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, rest: true, trig: 0, arm: 0 }); }
    for (let k = 0; k < 4; k++) { const s = spot(3); run.drums.push({ id: run.idN++, x: s.x, y: s.y, z: s.z, vy: 0, hp: 40 }); }
    for (const w of run.worms) makeWormView(w);
    for (const m of run.mines) m.model = addModel(projModel('mine'), m);
    for (const d of run.drums) d.model = addModel(projModel('drum'), d);
    sea.position.y = run.water;
    sfx.init();
    makeOverlay();
    const me = run.teams.find(t => t.me);
    run.cam.yaw = me && me.worms[0] ? Math.atan2(-me.worms[0].x, -me.worms[0].z) : 0;
    render(0);
  }
  function stop(silent) {
    if (!run) { root.visible = false; return; }
    run = null;
    sfx.jet(false); sfx.stop();
    removeOverlay();
    root.visible = false;
    ropeLine.visible = false; reticle.visible = false; ghost.visible = false; beam.visible = false;
    for (const d of dots) d.visible = false;
    fire.clear(); smoke.clear(); dirt.clear(); sparks.clear();
    if (!silent) clearWorld();
  }
  function addModel(g, o) { g.position.set(o.x, o.y, o.z); world.add(g); return g; }
  function makeWormView(w) {
    const m = wormModel(w.team.color);
    w.m = m; world.add(m.g);
    w.tag = tagSprite(); world.add(w.tag);
    w.bubble = bubbleSprite(); w.bubble.visible = false; world.add(w.bubble); w.bubbleT = 0;
    w.heldId = null;
  }

  // ---------- helpers ----------
  const activeWorm = () => run?.active;
  const activeTeam = () => run?.active?.team;
  const alive = (w) => !w.dead && w.hp > 0;
  const teamAlive = (t) => !t.out && t.worms.some(w => !w.dead && w.hp > 0);
  const myTurn = () => !!run && (run.phase === 'turn' || run.phase === 'retreat') && activeTeam()?.owner === run.meId;
  const dirOf = (yaw, pitch, out = new THREE.Vector3()) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  function event(e) { if (!run) return; run.evq.push(e); playEvent(e, true); }
  function say(w, list) { if (!w || w.dead) return; event(['q', w.id, typeof list === 'string' ? list : pick(list)]); }
  function banner(text, t = 2.2) { if (run) run.banner = { text, t }; }

  // ---------- the ground under a worm ----------
  const WALL = 1e9;
  function footAt(x, y, z) {
    if (land.solid(x, y + .55, z)) return WALL;
    for (let t = y + .5; t >= y - .65; t -= .05) {
      if (land.solid(x, t, z)) {
        let lo = t, hi = t + .05;
        for (let n = 0; n < 4; n++) { const m = (lo + hi) / 2; if (land.solid(x, m, z)) lo = m; else hi = m; }
        if (land.solid(x, hi + .3, z) || land.solid(x, hi + .55, z)) return WALL;
        return hi;
      }
    }
    return null;
  }
  const wormHitAt = (x, y, z, skip, r = .38) => run.worms.find(w => w !== skip && alive(w) && (w.x - x) ** 2 + (w.y + .3 - y) ** 2 + (w.z - z) ** 2 < r * r);

  // ---------- damage ----------
  function hurt(w, n, by) {
    if (!alive(w) || n <= 0) return;
    n = Math.round(n);
    w.hp = Math.max(0, w.hp - n);
    event(['d', w.id, n]);
    run.dmgDone += w.team !== activeTeam() ? n : 0;
    if (w === run.active && (run.phase === 'turn' || run.phase === 'retreat')) run.hurtThisTurn = true;
    if (w.hp > 0 && Math.random() < .6) say(w, by && by.team === w.team && by !== w ? Q.friend : Q.hurt);
  }
  function knock(w, vx, vy, vz) {
    w.vx = vx; w.vy = vy; w.vz = vz; w.ground = false; w.knock = true; w.fallFrom = w.y;
    if (w.state === 'rope' || w.state === 'jet') { w.state = 'idle'; w.rope = null; }
  }
  // a blast: the ground, the worms, the things lying about
  function blast(x, y, z, r, dmg, by = null, opt = {}) {
    land.carve(x, y, z, r);
    event(['x', r2(x), r2(y), r2(z), r2(r), opt.holy ? 1 : 0]);
    const R = r * 1.5 + .4;
    for (const w of run.worms) {
      if (!alive(w) && !(w.hp <= 0 && !w.dead)) continue;
      const dx = w.x - x, dy = w.y + .3 - y, dz = w.z - z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const k = 1 - d / R;
      hurt(w, dmg * Math.min(1, k * 1.5 + .1), by);
      const sp = (2 + 7.5 * k) * Math.sqrt(dmg / 50), l = d || 1;
      knock(w, dx / l * sp * .7, Math.max(.5, dy / l + .8) * sp * .7, dz / l * sp * .7);
    }
    for (const m of run.mines) if (!m.gone && Math.hypot(m.x - x, m.y - y, m.z - z) < R) { m.trig = m.trig || .25 + Math.random() * .3; m.rest = false; m.vy = 3 + Math.random() * 3; m.vx = (m.x - x) * 1.5; m.vz = (m.z - z) * 1.5; }
    for (const d of run.drums) if (!d.gone && Math.hypot(d.x - x, d.y + .45 - y, d.z - z) < R) { d.hp -= dmg * (1 - Math.hypot(d.x - x, d.y + .45 - y, d.z - z) / R) * 1.4; if (d.hp <= 0) d.boomT = d.boomT || .25; }
    for (const c of run.crates) if (!c.gone && Math.hypot(c.x - x, c.y + .3 - y, c.z - z) < R * .8) { c.gone = true; event(['cr', c.id]); if (c.kind === 'weapon') run.later.push([.15, () => blast(c.x, c.y + .3, c.z, 1.4, 20)]); }
    for (const p of run.projs) if (p.rest && Math.hypot(p.x - x, p.y - y, p.z - z) < R) { p.rest = false; p.vy += 4; p.vx += (p.x - x) * 2; p.vz += (p.z - z) * 2; }
    for (const gv of run.graves) if (Math.hypot(gv.x - x, gv.z - z) < R) { gv.vy = 3; gv.air = true; }
    run.quiet = 0;
  }

  // ---------- turns ----------
  function nextTurn() {
    const left = run.teams.filter(teamAlive);
    if (left.length <= 1 || run.turnN > 400) { gameOver(left); return; }
    run.turnN++;
    // sudden death: the sea rises every turn
    if (!run.sudden && run.turnN > run.mode.sd) { run.sudden = true; event(['sd']); }
    if (run.sudden) event(['wa', r2(Math.min(TOP - 4, run.water + .7))]);
    // a crate on a parachute, now and then
    if (run.turnN > 1 && run.R() < .45) dropCrate();
    let t = run.turnTeam;
    for (let n = 0; n < run.teams.length; n++) { t = (t + 1) % run.teams.length; if (teamAlive(run.teams[t])) break; }
    run.turnTeam = t;
    const team = run.teams[t];
    const ws = team.worms.filter(alive);
    const w = ws[team.next % ws.length]; team.next++;
    run.active = w;
    const a = run.R() * TAU, s = run.R() ** 1.3;
    run.wind.set(Math.cos(a) * s, Math.sin(a) * s);
    run.phase = 'ready'; run.phaseT = 1.4; run.timer = TURN_T;
    run.shots = 0; run.usedTurn = false; run.hurtThisTurn = false; run.dmgDone = 0; run.firedBy = null;
    run.cam.yaw = w.yaw; run.cam.aim = false; run.local.target = null; run.local.charging = false; run.local.power = 0;
    const iw = team.me ? run.local.w : 0;
    if (team.owner === '@bot' || (team.owner !== run.meId && run.isHost)) run.bot = team.owner === '@bot' ? { stage: 'think', t: .9 + run.R() * .8, walked: 0 } : null;
    else run.bot = null;
    if (team.owner === run.meId) { run.local.w = team.ammo[WEAPONS[iw].id] === 0 ? 0 : iw; }
    event(['t', t, w.id, r2(run.wind.x), r2(run.wind.y)]);
    say(w, Q.turn);
  }
  function endTurn(retreat) {
    if (run.phase !== 'turn' && run.phase !== 'retreat') return;
    const w = run.active;
    if (w && (w.state === 'rope' || w.state === 'jet')) { w.state = 'idle'; w.rope = null; w.ground = false; }
    if (retreat && run.phase === 'turn') { run.phase = 'retreat'; run.timer = RETREAT_T; return; }
    run.phase = 'settle'; run.phaseT = .8; run.quiet = 0; run.settleT = 0;
  }
  function gameOver(left) {
    run.phase = 'over'; run.phaseT = 5;
    // the order they went out in, the last team standing first
    const rank = [...left.map(t => t.i), ...[...run.out].reverse()];
    for (const t of run.teams) if (!rank.includes(t.i)) rank.push(t.i);
    event(['o', rank]);
  }
  function dropCrate() {
    for (let n = 0; n < 60; n++) {
      const x = (run.R() - .5) * 34, z = (run.R() - .5) * 34, y = land.topAt(x, z);
      if (y < run.water + .6) continue;
      const kind = run.R() < .35 ? 'health' : 'weapon';
      const c = { id: run.idN++, kind, weapon: kind === 'weapon' ? pick(CRATE_WEAPONS, run.R) : null, x, y: TOP + 6, z, vy: -3, falling: true };
      run.crates.push(c);
      event(['cc', c.id, c.kind, r2(x), r2(c.y), r2(z)]);
      return;
    }
  }

  // ---------- the host's step ----------
  const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpD = new THREE.Vector3();
  function tick() {
    const dt = STEP;
    run.clock += dt;
    run.later = run.later || [];
    for (let n = run.later.length - 1; n >= 0; n--) { const l = run.later[n]; l[0] -= dt; if (l[0] <= 0) { run.later.splice(n, 1); l[1](); } }
    const ph = run.phase;
    const w = run.active;
    // the one playing: a human here or there, or a bot
    let inp = null;
    if ((ph === 'turn' || ph === 'retreat') && w && alive(w)) {
      const owner = w.team.owner;
      if (owner === run.meId) inp = localInput();
      else if (owner === '@bot') inp = botInput(dt);
      else inp = remoteInput(owner);
    }
    if (ph === 'intro') { run.phaseT -= dt; if (run.phaseT <= 0) nextTurn(); }
    else if (ph === 'ready') { run.phaseT -= dt; if (run.phaseT <= 0) { run.phase = 'turn'; event(['go']); } }
    else if (ph === 'turn' || ph === 'retreat') {
      run.timer -= dt;
      if (inp) applyInput(w, inp, dt);
      if (run.timer <= 0) endTurn(false);
      else if (!w || !alive(w) || w.state === 'drown' || run.hurtThisTurn) endTurn(false);
    } else if (ph === 'settle') {
      run.phaseT -= dt;
      const busy = run.projs.length || run.worms.some(q => !q.dead && (!q.ground || q.state === 'drown')) || run.mines.some(m => !m.gone && (m.trig > 0 || !m.rest)) || run.drums.some(d => !d.gone && d.boomT > 0) || run.later.length || run.crates.some(c => !c.gone && c.falling);
      run.settleT = (run.settleT || 0) + dt;
      if (busy && run.settleT < 25) run.phaseT = Math.max(run.phaseT, .5);
      if (run.phaseT <= 0) {
        const dying = run.worms.find(q => !q.dead && q.hp <= 0);
        if (dying) { run.phase = 'deaths'; run.phaseT = 1.1; run.dying = dying; say(dying, Q.die); }
        else {
          // teams that have no one left go out now
          for (const t of run.teams) if (!t.out && !teamAlive(t)) { t.out = true; run.out.push(t.i); event(['k', t.i]); }
          if (run.firedBy && run.dmgDone === 0 && alive(run.firedBy) && Math.random() < .5) say(run.firedBy, Q.miss);
          run.firedBy = null;
          nextTurn();
        }
      }
    } else if (ph === 'deaths') {
      run.phaseT -= dt;
      if (run.phaseT <= 0) {
        const q = run.dying; run.dying = null;
        if (q && !q.dead) {
          q.dead = true;
          event(['dd', q.id, 0]);
          blast(q.x, q.y + .3, q.z, 1.3, 20, null);
          const gv = { id: run.idN++, x: q.x, y: q.y + .3, z: q.z, vy: 2, air: true, color: q.team.color };
          run.graves.push(gv); event(['gv', gv.id, r2(gv.x), r2(gv.y), r2(gv.z), q.team.color]);
        }
        run.phase = 'settle'; run.phaseT = .6;
      }
    } else if (ph === 'over') {
      run.phaseT -= dt;
    }
    // the world moves on, whoever's turn it is
    for (const q of run.worms) stepWorm(q, q === w ? inp : null, dt);
    stepProjs(dt);
    stepThings(dt);
  }

  // ---------- inputs ----------
  function localInput() {
    const L = run.local;
    const o = { h: L.held, yaw: run.cam.yaw, pitch: run.cam.pitch, w: L.w, fuse: L.fuse, ev: L.taps };
    L.taps = [];
    return o;
  }
  function remoteInput(owner) {
    const r = run.inputs.get(owner);
    if (!r) return { h: 0, yaw: run.active.yaw, pitch: run.active.pitch, w: 0, fuse: 3, ev: [] };
    const o = { h: r.h, yaw: r.y, pitch: r.p, w: r.w, fuse: r.f, ev: r.ev };
    r.ev = [];
    return o;
  }
  function applyInput(w, inp, dt) {
    w.pitch = clamp(inp.pitch, -1.3, 1.45);
    run.aimYaw = inp.yaw;
    const wd = WEAPONS[inp.w] || WEAPONS[0];
    run.sel = inp.w; run.fuse = inp.fuse;
    // the worm faces where it aims, as long as it isn't crawling somewhere else
    if (!(inp.h & (H_F | H_B | H_L | H_R)) && w.ground && w.state === 'idle') w.yaw = inp.yaw;
    w.ctl = inp;
    for (const e of inp.ev) {
      const k = e[0];
      if (k === 'j' || k === 'b') {
        if (w.state === 'rope') { w.state = 'idle'; w.rope = null; w.ground = false; w.fallFrom = w.y; sfx.rope(); continue; }
        // a second press just after the jump turns it into a backflip
        const late = k === 'b' && !w.ground && w.jumpT > 0 && w.state === 'idle';
        if (!late && (!w.ground || w.state !== 'idle')) continue;
        const f = k === 'b' ? -1.3 : 2.6, up = k === 'b' ? 6.4 : 4.6;
        w.vx = Math.sin(w.yaw) * f; w.vz = Math.cos(w.yaw) * f; w.vy = up; w.ground = false; w.knock = false; w.fallFrom = w.y;
        w.jumpT = k === 'j' ? .35 : 0;
        if (k === 'b') w.flip = 1;
        event(['s', k === 'b' ? 'flip' : 'jump']);
      } else if (k === 'f' || k === 'u' || k === 't') {
        if (run.phase !== 'turn') {
          // the sheep goes off when asked, even in retreat
          const sh = run.projs.find(p => p.kind === 'sheep' && p.owner === w);
          if (sh && k === 'u') sh.fuse = 0;
          continue;
        }
        useWeapon(w, wd, inp, e);
      }
    }
  }

  // ---------- the arsenal ----------
  function takeAmmo(team, id) {
    if (team.ammo[id] === 0) return false;
    if (team.ammo[id] > 0) team.ammo[id]--;
    return true;
  }
  function useWeapon(w, wd, inp, e) {
    const team = w.team;
    const sheep = run.projs.find(p => p.kind === 'sheep' && p.owner === w);
    if (sheep && e[0] === 'u') { sheep.fuse = 0; return; }
    if (w.state === 'rope' && wd.id !== 'rope') return;
    if (team.ammo[wd.id] === 0) return;
    if (run.shots > 0 && wd.id !== 'shotgun') return;
    const dir = dirOf(inp.yaw, clamp(inp.pitch, -1.3, 1.45), new THREE.Vector3());
    const head = new THREE.Vector3(w.x, w.y + .55, w.z);
    const face = () => { w.yaw = inp.yaw; };
    switch (wd.id) {
      case 'bazooka': case 'homing': case 'grenade': case 'cluster': case 'banana': case 'holy': {
        if (e[0] !== 'f') return;
        const pw = clamp(e[1], .05, 1);
        if (!takeAmmo(team, wd.id)) return;
        face();
        const p = spawnProj(wd.id, head.x + dir.x * .45, head.y + dir.y * .45, head.z + dir.z * .45, dir.x * wd.speed * pw, dir.y * wd.speed * pw, dir.z * wd.speed * pw, w);
        if (wd.fuse || wd.fixedFuse) p.fuse = wd.fixedFuse || clamp(inp.fuse, 1, 5);
        if (wd.homing) p.target = homingTarget(w, head, dir);
        event(['s', wd.fuse ? 'throw' : 'launch']);
        say(w, wd.q);
        fired(w, true);
        return;
      }
      case 'shotgun': {
        if (e[0] !== 'u') return;
        face();
        const t = land.ray(head, dir, 40);
        let end = t == null ? 40 : t, hit = null;
        for (const q of run.worms) {
          if (q === w || !alive(q)) continue;
          tmpV.set(q.x - head.x, q.y + .3 - head.y, q.z - head.z);
          const along = tmpV.dot(dir);
          if (along < 0 || along > end) continue;
          if (tmpV.lengthSq() - along * along < .16) { end = along; hit = q; }
        }
        const px = head.x + dir.x * end, py = head.y + dir.y * end, pz = head.z + dir.z * end;
        event(['tr', r2(head.x), r2(head.y), r2(head.z), r2(px), r2(py), r2(pz)]);
        event(['s', 'shotgun']);
        if (hit) { hurt(hit, 25, w); knock(hit, dir.x * 5, 2.5, dir.z * 5); }
        if (t != null || hit) blast(px, py, pz, .9, hit ? 0 : 20, w);
        run.shots++;
        if (run.shots === 1) say(w, wd.q);
        if (run.shots >= 2) fired(w, true);
        return;
      }
      case 'dynamite': case 'mine': case 'sheep': {
        if (e[0] !== 'u' || w.state !== 'idle' || !w.ground) return;
        if (!takeAmmo(team, wd.id)) return;
        face();
        const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
        if (wd.id === 'mine') {
          const m = { id: run.idN++, def: MINE, x: w.x + fx * .5, y: w.y + .4, z: w.z + fz * .5, vx: fx * 1.2, vy: 1, vz: fz * 1.2, rest: false, trig: 0, arm: 2.5 };
          run.mines.push(m); event(['mn', m.id, r2(m.x), r2(m.y), r2(m.z)]);
        } else {
          const p = spawnProj(wd.id, w.x + fx * .45, w.y + .4, w.z + fz * .45, fx * (wd.id === 'sheep' ? 1.5 : 1.2), 1.4, fz * (wd.id === 'sheep' ? 1.5 : 1.2), w);
          p.fuse = wd.id === 'sheep' ? 10 : 5; p.yaw = w.yaw;
          if (wd.id === 'sheep') event(['s', 'sheep']);
        }
        say(w, wd.q);
        fired(w, true);
        return;
      }
      case 'airstrike': case 'teleport': {
        if (e[0] !== 't') return;
        const x = clamp(e[1], -HALF, HALF), z = clamp(e[2], -HALF, HALF);
        if (wd.id === 'teleport') {
          const y = land.topAt(x, z);
          if (y < run.water + .3 || y > TOP - 1) return;
          if (!takeAmmo(team, wd.id)) return;
          event(['z', r2(w.x), r2(w.y), r2(w.z)]);
          w.x = x; w.y = y; w.z = z; w.vx = w.vy = w.vz = 0; w.ground = true; w.fallFrom = y;
          event(['z', r2(x), r2(y), r2(z)]);
          say(w, wd.q);
          fired(w, true);
          return;
        }
        if (!takeAmmo(team, wd.id)) return;
        const a = inp.yaw, fx = Math.sin(a), fz = Math.cos(a);
        event(['s', 'plane']);
        for (let k = 0; k < 5; k++) {
          const o = (k - 2) * 1.5;
          run.later.push([.9 + k * .12, () => { if (!run) return; const p = spawnProj('strike', x + fx * (o - 5), TOP + 8, z + fz * (o - 5), fx * 5, -14, fz * 5, w); p.yaw = a; }]);
        }
        say(w, wd.q);
        fired(w, true);
        return;
      }
      case 'bat': case 'firepunch': {
        if (e[0] !== 'u' || !w.ground || w.state !== 'idle') return;
        face();
        const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
        event(['s', wd.id === 'bat' ? 'bat' : 'punch']);
        say(w, wd.q);
        for (const q of run.worms) {
          if (q === w || !alive(q)) continue;
          const dx = q.x - w.x, dy = q.y - w.y, dz = q.z - w.z, d = Math.hypot(dx, dz);
          if (d > 1.5 || Math.abs(dy) > 1.1 || (dx * fx + dz * fz) / (d || 1) < .2) continue;
          hurt(q, wd.dmg, w);
          if (wd.id === 'bat') knock(q, dir.x * 13, Math.max(3, dir.y * 13 + 3), dir.z * 13);
          else knock(q, fx * 3, 9, fz * 3);
          event(['s', 'bat']);
        }
        if (wd.id === 'firepunch') { w.vx = fx * .4; w.vz = fz * .4; w.vy = 7.5; w.ground = false; w.punch = .8; w.fallFrom = w.y + 2.5; }
        fired(w, true);
        return;
      }
      case 'girder': {
        if (e[0] !== 'u') return;
        const c = girderSpot(w, inp);
        if (!c) return;
        if (!takeAmmo(team, 'girder')) return;
        land.girder(c.x, c.y, c.z, c.yaw, c.pitch, 4);
        event(['g', r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), r2(c.pitch)]);
        say(w, wd.q);
        fired(w, true);
        return;
      }
      case 'rope': {
        if (e[0] !== 'u') return;
        const t = land.ray(head, dir, 16);
        if (t == null) { event(['s', 'rope']); return; }
        if (!takeAmmo(team, 'rope')) return;
        face();
        const ax = head.x + dir.x * t, ay = head.y + dir.y * t, az = head.z + dir.z * t;
        w.state = 'rope'; w.rope = { x: ax, y: ay, z: az, L: Math.max(1, Math.hypot(ax - w.x, ay - w.y - .3, az - w.z)) };
        w.ground = false; w.knock = false;
        event(['s', 'rope']);
        if (!run.usedTurn) say(w, wd.q);
        run.usedTurn = true;
        return;
      }
      case 'jetpack': {
        if (e[0] !== 'u') return;
        if (w.state === 'jet') { w.state = 'idle'; w.ground = false; w.fallFrom = w.y; return; }
        if (!takeAmmo(team, 'jetpack')) return;
        w.state = 'jet'; w.fuel = 12; w.ground = false; w.knock = false; w.vy = 2; w.jetT = 0;
        say(w, wd.q);
        run.usedTurn = true;
        return;
      }
      case 'skip': if (e[0] === 'u') { say(w, wd.q); endTurn(false); } return;
      case 'surrender':
        if (e[0] !== 'u') return;
        say(w, wd.q);
        for (const q of team.worms) if (alive(q)) { q.hp = 0; event(['d', q.id, 0]); }
        team.out = true; run.out.push(team.i); event(['k', team.i]);
        endTurn(false);
        return;
    }
  }
  function fired(w, retreat) {
    run.usedTurn = true; run.firedBy = w;
    endTurn(retreat);
  }
  function spawnProj(kind, x, y, z, vx, vy, vz, owner) {
    const p = { id: run.idN++, kind, def: PROJ[kind], x, y, z, vx, vy, vz, owner, age: 0, fuse: null, rest: false, yaw: 0 };
    run.projs.push(p);
    return p;
  }
  function homingTarget(w, head, dir) {
    let best = null, bs = Infinity;
    for (const q of run.worms) {
      if (!alive(q) || q.team === w.team) continue;
      tmpV.set(q.x - head.x, q.y + .3 - head.y, q.z - head.z);
      const d = tmpV.length(), a = Math.acos(clamp(tmpV.dot(dir) / (d || 1), -1, 1));
      const s = a * 10 + d * .1;
      if (s < bs) { bs = s; best = q; }
    }
    return best ? best.id : null;
  }
  function girderSpot(w, inp) {
    const d = dirOf(inp.yaw, clamp(inp.pitch, -.9, .9), new THREE.Vector3());
    const c = { x: w.x + d.x * 3, y: w.y + .5 + d.y * 3, z: w.z + d.z * 3, yaw: inp.yaw + PI / 2, pitch: clamp(inp.pitch * .5, -.5, .5) };
    if (c.y < run.water || c.y > TOP - 1) return null;
    if (run.worms.some(q => alive(q) && Math.hypot(q.x - c.x, q.y + .3 - c.y, q.z - c.z) < 1.2)) return null;
    return c;
  }

  // ---------- worms moving ----------
  function stepWorm(w, inp, dt) {
    if (w.dead) return;
    if (w.state === 'drown') {
      w.y -= .7 * dt; w.drownT -= dt;
      if (w.drownT <= 0) { w.dead = true; event(['dd', w.id, 1]); }
      return;
    }
    if (w.y + .2 < run.water && w.state !== 'drown') {
      w.state = 'drown'; w.drownT = 1.6; w.hp = 0; w.rope = null; w.ground = false;
      event(['s', 'splash']); event(['d', w.id, 0]); say(w, Q.drown);
      return;
    }
    const h = inp ? inp.h : 0;
    if (w.state === 'rope') { stepRope(w, h, inp, dt); return; }
    if (w.state === 'jet') { stepJet(w, h, inp, dt); return; }
    if (w.punch > 0) w.punch -= dt;
    if (w.jumpT > 0) w.jumpT -= dt;
    if (w.flip > 0) w.flip = Math.max(0, w.flip - dt * 1.4);
    if (w.ground) {
      w.vx = w.vy = w.vz = 0;
      // crawling, the way the camera looks
      let mx = 0, mz = 0;
      if (inp && !(h & H_FIRE)) {
        const fx = Math.sin(inp.yaw), fz = Math.cos(inp.yaw);
        if (h & H_F) { mx += fx; mz += fz; }
        if (h & H_B) { mx -= fx; mz -= fz; }
        if (h & H_L) { mx += fz; mz -= fx; }
        if (h & H_R) { mx -= fz; mz += fx; }
      }
      const l = Math.hypot(mx, mz);
      w.walking = false;
      if (l > 0) {
        mx /= l; mz /= l;
        w.yaw = Math.atan2(mx, mz);
        const nx = w.x + mx * WALK * dt, nz = w.z + mz * WALK * dt;
        const f = footAt(nx, w.y, nz);
        if (f === null) { w.x = nx; w.z = nz; w.ground = false; w.vx = mx * WALK; w.vz = mz * WALK; w.vy = 0; w.fallFrom = w.y; w.knock = false; }
        else if (f !== WALL && Math.abs(nx) < HALF - .5 && Math.abs(nz) < HALF - .5) { w.x = nx; w.z = nz; w.y = f; w.walking = true; }
        if (w.walking) { w.stepT = (w.stepT || 0) + dt; if (w.stepT > .3) { w.stepT = 0; if (w === run.active) event(['s', 'step']); } }
      }
      // the ground went away (a blast, a girder gone)
      if (w.ground && !land.solid(w.x, w.y - .12, w.z)) { const f = footAt(w.x, w.y, w.z); if (f === null || f === WALL) { w.ground = false; w.fallFrom = w.y; } else w.y = f; }
      if (w.ground && land.solid(w.x, w.y + .3, w.z)) { const f = footAt(w.x, w.y + .5, w.z); if (f !== null && f !== WALL) w.y = f; }
    } else {
      // wedged somewhere, barely moving: find the nearest place to stand
      w.airT = (w.airT || 0) + dt;
      if (w.airT > 1 && Math.hypot(w.vx, w.vy, w.vz) < 2.5) {
        for (const [ox, oz] of [[0, 0], [.3, 0], [-.3, 0], [0, .3], [0, -.3], [.6, 0], [-.6, 0], [0, .6], [0, -.6], [.5, .5], [-.5, -.5], [.5, -.5], [-.5, .5]]) {
          const f = footAt(w.x + ox, w.y + .6, w.z + oz);
          if (f !== null && f !== WALL) { w.x += ox; w.z += oz; w.y = f; w.ground = true; w.knock = false; w.vx = w.vy = w.vz = 0; w.airT = 0; break; }
        }
        if (w.ground) return;
        if (w.airT > 3) { w.y += .3; w.airT = 1; }
      }
      w.vy -= G * dt;
      w.fallFrom = Math.max(w.fallFrom, w.y);
      const sp = Math.hypot(w.vx, w.vy, w.vz), n = Math.max(1, Math.ceil(sp * dt / .08));
      const hdt = dt / n;
      for (let s = 0; s < n; s++) {
        const px = w.x + w.vx * hdt, py = w.y + w.vy * hdt, pz = w.z + w.vz * hdt;
        const hit = land.solid(px, py + .3, pz) || land.solid(px, py + .02, pz) || land.solid(px, py + .58, pz);
        if (!hit) {
          w.x = px; w.y = py; w.z = pz;
          if (Math.abs(w.x) > HALF + 30 || Math.abs(w.z) > HALF + 30) { w.x = clamp(w.x, -HALF - 30, HALF + 30); w.z = clamp(w.z, -HALF - 30, HALF + 30); w.vx = w.vz = 0; }
          continue;
        }
        land.normal(px, py + .15, pz, tmpN);
        const vn = w.vx * tmpN.x + w.vy * tmpN.y + w.vz * tmpN.z;
        const speed = Math.hypot(w.vx, w.vy, w.vz);
        if (tmpN.y > .5 && w.vy <= 0 && !(w.knock && speed > 6)) {
          const f = footAt(px, py + .35, pz);
          if (f !== null && f !== WALL) {
            w.x = px; w.z = pz; w.y = f;
            const impact = -w.vy;
            w.ground = true; w.knock = false; w.flip = 0; w.punch = 0; w.airT = 0;
            if (impact > 9.5) { hurt(w, (impact - 9.5) * 3.2, null); event(['s', 'land']); }
            w.vx = w.vy = w.vz = 0;
            break;
          }
        }
        // off a wall or a slope: bounce (a little more when thrown by a blast)
        if (vn < 0) { const e = w.knock ? .45 : .15; w.vx -= (1 + e) * vn * tmpN.x; w.vy -= (1 + e) * vn * tmpN.y; w.vz -= (1 + e) * vn * tmpN.z; w.vx *= .82; w.vy *= .82; w.vz *= .82; }
        else { w.x += tmpN.x * .05; w.y += tmpN.y * .05; w.z += tmpN.z * .05; }
        if (speed < 1.2 && tmpN.y > .3) {
          const f = footAt(w.x, w.y + .4, w.z);
          if (f !== null && f !== WALL) { w.y = f; w.ground = true; w.knock = false; w.vx = w.vy = w.vz = 0; break; }
        }
        break;
      }
    }
    // crates: the one who plays picks them up
    if (w === run.active) for (const c of run.crates) {
      if (c.gone || Math.hypot(c.x - w.x, c.z - w.z) > .8 || Math.abs(c.y - w.y) > 1.1) continue;
      c.gone = true;
      if (c.kind === 'health') { w.hp += 25; event(['hp', w.id, 25]); }
      else { const t = w.team; if (t.ammo[c.weapon] >= 0) t.ammo[c.weapon]++; event(['pk', w.id, c.weapon]); }
      event(['cr', c.id]);
    }
  }
  function stepRope(w, h, inp, dt) {
    const R = w.rope;
    if (!R) { w.state = 'idle'; return; }
    if (h & H_F) R.L = Math.max(.8, R.L - 3.5 * dt);
    if (h & H_B) R.L = Math.min(18, R.L + 3.5 * dt);
    w.vy -= G * dt;
    if (inp && (h & (H_L | H_R))) {
      const yaw = inp.yaw, s = (h & H_L ? 1 : 0) - (h & H_R ? 1 : 0);
      w.vx += Math.cos(yaw) * s * 7 * dt; w.vz -= Math.sin(yaw) * s * 7 * dt;
      w.vx += Math.sin(yaw) * 2 * dt; w.vz += Math.cos(yaw) * 2 * dt;
    }
    let px = w.x + w.vx * dt, py = w.y + w.vy * dt, pz = w.z + w.vz * dt;
    // the rope is taut: back onto the sphere, the outward speed gone
    tmpD.set(px - R.x, py + .3 - R.y, pz - R.z);
    const d = tmpD.length();
    if (d > R.L) {
      tmpD.divideScalar(d);
      px = R.x + tmpD.x * R.L; py = R.y + tmpD.y * R.L - .3; pz = R.z + tmpD.z * R.L;
      const vr = w.vx * tmpD.x + w.vy * tmpD.y + w.vz * tmpD.z;
      if (vr > 0) { w.vx -= vr * tmpD.x; w.vy -= vr * tmpD.y; w.vz -= vr * tmpD.z; }
    }
    if (land.solid(px, py + .3, pz) || land.solid(px, py + .05, pz)) { w.vx *= -.3; w.vy *= -.3; w.vz *= -.3; }
    else { w.x = px; w.y = py; w.z = pz; }
    w.vx *= 1 - dt * .15; w.vz *= 1 - dt * .15;
    w.yaw = Math.atan2(w.vx, w.vz) || w.yaw;
    w.fallFrom = w.y;
  }
  function stepJet(w, h, inp, dt) {
    w.jetT += dt;
    const on = w.fuel > 0;
    let thrust = 0;
    if (on && (h & H_UP)) { w.vy += 17 * dt; thrust = 1; }
    if (on && inp) {
      const fx = Math.sin(inp.yaw), fz = Math.cos(inp.yaw);
      let ax = 0, az = 0;
      if (h & H_F) { ax += fx; az += fz; } if (h & H_B) { ax -= fx; az -= fz; }
      if (h & H_L) { ax += fz; az -= fx; } if (h & H_R) { ax -= fz; az += fx; }
      w.vx += ax * 7 * dt; w.vz += az * 7 * dt;
      if (ax || az) { thrust = Math.max(thrust, .6); w.yaw = Math.atan2(ax, az); }
    }
    if (thrust) w.fuel -= dt * thrust;
    w.jetOn = thrust;
    w.vy -= G * dt; w.vx *= 1 - dt * .9; w.vz *= 1 - dt * .9;
    w.vy = clamp(w.vy, -12, 6);
    const px = w.x + w.vx * dt, py = w.y + w.vy * dt, pz = w.z + w.vz * dt;
    if (land.solid(px, py + .3, pz) || land.solid(px, py, pz) || land.solid(px, py + .58, pz)) {
      if (w.vy <= 0 && w.jetT > .4) { const f = footAt(px, py + .4, pz); if (f !== null && f !== WALL) { w.x = px; w.z = pz; w.y = f; w.state = 'idle'; w.ground = true; w.vx = w.vy = w.vz = 0; w.jetOn = 0; return; } }
      w.vx *= -.2; w.vy *= -.2; w.vz *= -.2;
    } else { w.x = px; w.y = py; w.z = pz; }
    w.fallFrom = w.y;
    if (w.fuel <= 0) { w.state = 'idle'; w.ground = false; w.jetOn = 0; }
  }

  // ---------- things flying ----------
  // one step of a projectile's flight: 'boom', 'water' or null (shared with the bots' guesses)
  function flyStep(p, dt, wind, water, worms = true, stepLen = .12) {
    const d = p.def;
    if (p.rest) {
      if (!land.solid(p.x, p.y - .12, p.z)) p.rest = false;
      else return null;
    }
    p.vy -= G * dt;
    if (d.wind) { p.vx += wind.x * WIND_MAX * d.wind * dt; p.vz += wind.y * WIND_MAX * d.wind * dt; }
    const sp = Math.hypot(p.vx, p.vy, p.vz), n = Math.max(1, Math.ceil(sp * dt / stepLen)), h = dt / n;
    for (let s = 0; s < n; s++) {
      const nx = p.x + p.vx * h, ny = p.y + p.vy * h, nz = p.z + p.vz * h;
      if (ny < water) { p.x = nx; p.y = ny; p.z = nz; return 'water'; }
      if (Math.abs(nx) > 90 || Math.abs(nz) > 90) return 'water';
      if (d.impact && worms && p.age > (d.arm || .08)) {
        const q = typeof worms === 'object' ? worms.find(w => (w.x - nx) ** 2 + (w.y + .3 - ny) ** 2 + (w.z - nz) ** 2 < .16) : wormHitAt(nx, ny, nz, p.age < .3 ? p.owner : null);
        if (q) { p.x = nx; p.y = ny; p.z = nz; return 'boom'; }
      }
      if (land.solid(nx, ny, nz)) {
        if (d.impact) { p.x = nx; p.y = ny; p.z = nz; return 'boom'; }
        land.normal(nx, ny, nz, tmpN);
        const vn = p.vx * tmpN.x + p.vy * tmpN.y + p.vz * tmpN.z;
        if (vn < 0) { const e = d.bounce ?? .4; p.vx -= (1 + e) * vn * tmpN.x; p.vy -= (1 + e) * vn * tmpN.y; p.vz -= (1 + e) * vn * tmpN.z; p.vx *= .8; p.vz *= .8; p.vy *= .9; p.bounced = (p.bounced || 0) + 1; p.bounceV = -vn; }
        p.x += tmpN.x * .03; p.y += tmpN.y * .03; p.z += tmpN.z * .03;
        if (Math.hypot(p.vx, p.vy, p.vz) < .7 && tmpN.y > .5) { p.rest = true; p.vx = p.vy = p.vz = 0; }
        return null;
      }
      p.x = nx; p.y = ny; p.z = nz;
    }
    return null;
  }
  function stepProjs(dt) {
    for (let n = run.projs.length - 1; n >= 0; n--) {
      const p = run.projs[n];
      p.age += dt;
      if (p.kind === 'homing' && p.age > .5 && p.target != null) {
        const q = run.worms.find(w => w.id === p.target && !w.dead);
        if (q) {
          tmpV.set(q.x - p.x, q.y + .3 - p.y, q.z - p.z).normalize().multiplyScalar(17);
          const k = Math.min(1, dt * 3.2);
          p.vx += (tmpV.x - p.vx) * k; p.vy += (tmpV.y - p.vy) * k + G * dt; p.vz += (tmpV.z - p.vz) * k;
        }
      }
      if (p.kind === 'sheep') { stepSheep(p, dt); }
      let ev = p.kind === 'sheep' ? sheepFly(p, dt) : flyStep(p, dt, run.wind, run.water);
      if (p.bounced && p.bounceV > 2) { event(['s', 'bounce']); p.bounceV = 0; }
      if (p.fuse != null) {
        p.fuse -= dt;
        if (p.kind === 'dynamite' && Math.random() < .3) event(['s', 'fuse']);
        if (p.fuse <= 0 && !p.hally) {
          if (p.kind === 'holy') { p.hally = 1.9; p.fuse = null; event(['h', p.id]); }
          else ev = ev || 'fuse';
        }
      }
      if (p.hally) { p.hally -= dt; if (p.hally <= 0) ev = 'fuse'; }
      if (p.age > 20) ev = ev || 'fuse';
      if (!ev) continue;
      run.projs.splice(n, 1);
      event(['pg', p.id]);
      if (ev === 'water') { event(['sp', r2(p.x), r2(run.water), r2(p.z)]); continue; }
      const d = p.def;
      blast(p.x, p.y, p.z, d.r, d.dmg, p.owner, { holy: p.kind === 'holy' });
      if (p.kind === 'cluster' || p.kind === 'banana') {
        const kid = p.kind === 'cluster' ? 'frag' : 'banana2';
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * TAU + Math.random(), s = kid === 'frag' ? 3 + Math.random() * 3 : 3 + Math.random() * 4;
          spawnProj(kid, p.x, p.y + .4, p.z, Math.cos(a) * s, 7 + Math.random() * 4, Math.sin(a) * s, p.owner);
        }
      }
    }
  }
  function sheepFly(p, dt) {
    if (p.walk) return null;
    const ev = flyStep(p, dt, run.wind, run.water, false);
    if (p.rest) { p.rest = false; p.walk = true; p.hop = .4; }
    return ev === 'water' ? 'water' : null;
  }
  function stepSheep(p, dt) {
    if (!p.walk) return;
    p.hop -= dt;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const nx = p.x + fx * 2.4 * dt, nz = p.z + fz * 2.4 * dt;
    const f = footAt(nx, p.y, nz);
    if (f === WALL) {
      if (p.hop <= 0) { p.walk = false; p.vx = fx * 1.6; p.vz = fz * 1.6; p.vy = 5.5; p.hop = .5; if (Math.random() < .3) p.yaw += PI * (.6 + Math.random() * .8); event(['s', 'sheep']); }
    } else if (f === null) { p.walk = false; p.vx = fx * 2.4; p.vz = fz * 2.4; p.vy = 0; p.x = nx; p.z = nz; }
    else { p.x = nx; p.z = nz; p.y = f; if (p.hop <= 0) { p.hop = .55 + Math.random() * .3; p.walk = false; p.vx = fx * 2.4; p.vz = fz * 2.4; p.vy = 3; } }
    if (p.y < run.water) p.fuse = 0;
  }
  function stepThings(dt) {
    for (const m of run.mines) {
      if (m.gone) continue;
      if (!m.rest) {
        const r = flyStep(m, dt, run.wind, run.water, false);
        if (r === 'water') { m.gone = true; event(['mg', m.id]); event(['sp', r2(m.x), r2(run.water), r2(m.z)]); continue; }
      }
      if (m.arm > 0) { m.arm -= dt; continue; }
      if (!m.trig && run.worms.some(w => alive(w) && Math.hypot(w.x - m.x, w.y - m.y, w.z - m.z) < 1.3)) { m.trig = 1.4; event(['s', 'beep']); }
      if (m.trig > 0) {
        m.trig -= dt;
        if (Math.floor(m.trig * 6) !== Math.floor((m.trig + dt) * 6)) event(['s', 'beep']);
        if (m.trig <= 0) { m.gone = true; event(['mg', m.id]); blast(m.x, m.y + .1, m.z, 2, 45); }
      }
    }
    for (const d of run.drums) {
      if (d.gone) continue;
      if (!land.solid(d.x, d.y - .08, d.z)) { d.vy -= G * dt; d.y += d.vy * dt; if (land.solid(d.x, d.y, d.z)) { const g = land.groundBelow(d.x, d.y + .6, d.z); if (g != null && g > -1) d.y = g; d.vy = 0; } }
      if (d.y < run.water - .5) { d.gone = true; event(['dg', d.id]); continue; }
      if (d.boomT > 0) { d.boomT -= dt; if (d.boomT <= 0) { d.gone = true; event(['dg', d.id]); blast(d.x, d.y + .45, d.z, 2.6, 45); event(['fl', r2(d.x), r2(d.y), r2(d.z)]); } }
    }
    for (const c of run.crates) {
      if (c.gone || !c.falling) continue;
      c.y += c.vy * dt; c.x += run.wind.x * .35 * dt; c.z += run.wind.y * .35 * dt;
      if (c.y < run.water) { c.gone = true; event(['cr', c.id]); continue; }
      if (land.solid(c.x, c.y - .02, c.z)) { const g = land.groundBelow(c.x, c.y + .8, c.z); if (g != null && g > -1) c.y = g; c.falling = false; }
    }
    for (const g of run.graves) {
      if (!g.air) continue;
      g.vy -= G * dt; g.y += g.vy * dt;
      if (land.solid(g.x, g.y, g.z) && g.vy < 0) { const gy = land.groundBelow(g.x, g.y + .6, g.z); if (gy != null && gy > -1) g.y = gy; g.air = false; g.vy = 0; }
      if (g.y < run.water - 1) g.air = false;
    }
  }

  // ---------- the bots ----------
  // they pick a target, try a few hundred shots in their head with the same physics, and take the best
  function botInput(dt) {
    const w = run.active;
    if (!run.bot) run.bot = { stage: 'think', t: .5, walked: 0 };
    const b = run.bot;
    const o = { h: 0, yaw: b.yaw ?? w.yaw, pitch: b.pitch ?? .3, w: b.wi ?? 0, fuse: b.fuse ?? 3, ev: [] };
    if (!b || run.phase === 'retreat') {
      // run from what was just thrown
      if (b && b.away != null && b.awayT > 0 && safeAhead(w, b.away)) { b.awayT -= dt; o.yaw = b.away; o.h = H_F; if (b.jumpT !== undefined && (b.jumpT -= dt) < 0 && safeAhead(w, b.away, 2.2)) { b.jumpT = .9; o.ev.push(['j']); } }
      return o;
    }
    b.t -= dt;
    if (b.stage === 'think') {
      if (b.t > 0) return o;
      if (!b.search) b.search = planSearch(w);
      const done = b.search.next();
      if (!done.done) return o;
      const plan = done.value;
      b.search = null;
      if (!plan) { o.w = WI.skip; o.ev.push(['u']); b.stage = 'done'; return o; }
      if (plan.walk && b.walked < 2) { b.walked++; b.stage = 'walk'; b.t = 1.2 + run.R(); b.walkYaw = plan.walk; return o; }
      Object.assign(b, { stage: 'aim', plan, t: .9, yaw0: w.yaw, pitch0: w.pitch });
      b.wi = WI[plan.w]; b.fuse = plan.fuse || 3;
      return o;
    }
    if (b.stage === 'walk') {
      o.yaw = b.walkYaw; o.h = H_F;
      if (b.t < 0 || run.timer < 12 || !safeAhead(w, b.walkYaw)) { b.stage = 'think'; b.t = .3; o.h = 0; }
      else if (Math.random() < dt * .8 && safeAhead(w, b.walkYaw, 2.2)) o.ev.push(['j']);
      return o;
    }
    if (b.stage === 'aim') {
      const p = b.plan, k = clamp(1 - b.t / .9, 0, 1), e = k * k * (3 - 2 * k);
      let dy = p.yaw - b.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw = b.yaw0 + dy * e; b.pitch = b.pitch0 + (p.pitch - b.pitch0) * e;
      o.yaw = b.yaw; o.pitch = b.pitch;
      if (b.t <= 0) { b.stage = 'fire'; b.pw = 0; }
      return o;
    }
    if (b.stage === 'fire') {
      const p = b.plan, wd = WEAPONS[b.wi];
      o.yaw = b.yaw = p.yaw; o.pitch = b.pitch = p.pitch;
      if (wd.charge) {
        b.pw += dt / 1.4; o.h = H_FIRE; run.botPower = b.pw;
        if (b.pw >= p.power) { o.ev.push(['f', p.power]); b.stage = 'done'; run.botPower = 0; retreatPlan(w, p); }
      } else if (wd.target) { o.ev.push(['t', p.tx, p.tz]); b.stage = 'done'; }
      else { o.ev.push(['u']); if (wd.id === 'shotgun') { b.t = .8; b.stage = 'again'; } else { b.stage = 'done'; retreatPlan(w, p); } }
      return o;
    }
    if (b.stage === 'again') { o.yaw = b.plan.yaw; o.pitch = b.plan.pitch; if (b.t <= 0) { o.ev.push(['u']); b.stage = 'done'; } return o; }
    return o;
  }
  // no crawling off a cliff or into the sea
  function safeAhead(w, yaw, far = 1.1) {
    for (const d of [.5, far]) {
      const x = w.x + Math.sin(yaw) * d, z = w.z + Math.cos(yaw) * d;
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return false;
      const f = footAt(x, w.y, z);
      if (f === WALL) return true;
      const g = f ?? land.groundBelow(x, w.y + .5, z);
      if (g == null || g < run.water + .6 || w.y - g > 2.5) return false;
    }
    return true;
  }
  function retreatPlan(w, p) {
    const b = run.bot;
    b.away = p.yaw + PI + (run.R() - .5); b.awayT = p.w === 'dynamite' || p.w === 'sheep' ? 3 : 1.6; b.jumpT = .6;
  }
  function* planSearch(w) {
    const team = w.team;
    const foes = run.worms.filter(q => alive(q) && q.team !== team);
    if (!foes.length) return null;
    const friends = run.worms.filter(q => alive(q) && q.team === team && q !== w);
    const head = new THREE.Vector3(w.x, w.y + .55, w.z);
    foes.sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) + a.hp * .03 - Math.hypot(b.x - w.x, b.z - w.z) - b.hp * .03);
    const has = (id) => team.ammo[id] !== 0;
    // close enough to hit
    const near = foes[0], nd = Math.hypot(near.x - w.x, near.z - w.z);
    if (nd < 1.3 && Math.abs(near.y - w.y) < .8) {
      const yaw = Math.atan2(near.x - w.x, near.z - w.z);
      const out = Math.atan2(near.x, near.z);
      return { w: run.R() < .6 ? 'bat' : 'firepunch', yaw, pitch: Math.abs(Math.atan2(Math.sin(yaw - out), Math.cos(yaw - out))) < 1.2 ? .35 : .9, power: 1 };
    }
    let best = null, bs = Infinity, evals = 0;
    const sim = { def: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rest: false, age: 0 };
    const tries = [];
    for (const f of foes.slice(0, 2)) {
      tries.push(['bazooka', f]);
      tries.push(['grenade', f]);
      if (has('holy') && foes.filter(q => Math.hypot(q.x - f.x, q.z - f.z) < 5).length >= 2 && !friends.some(q => Math.hypot(q.x - f.x, q.z - f.z) < 8)) tries.push(['holy', f]);
      if (has('banana') && run.turnN > 6 && run.R() < .3) tries.push(['banana', f]);
      if (has('cluster') && run.R() < .4) tries.push(['cluster', f]);
      if (has('homing') && run.R() < .3) tries.push(['homing', f]);
    }
    for (const [wid, f] of tries) {
      const wd = WEAPONS[WI[wid]], def = PROJ[wid];
      const tx = f.x, ty = f.y + .3, tz = f.z;
      const yaw0 = Math.atan2(tx - w.x, tz - w.z);
      const fuse = wd.fixedFuse || (wd.fuse ? 3 : 0);
      const yawSpan = def.wind ? .4 : .1;
      for (let dy = -yawSpan; dy <= yawSpan + 1e-6; dy += .1) {
        for (let pitch = -.3; pitch <= 1.35; pitch += .1) {
          for (let pw = .3; pw <= 1.001; pw += .1) {
            const yaw = yaw0 + dy;
            const d = dirOf(yaw, pitch, tmpD);
            Object.assign(sim, { def, x: head.x + d.x * .45, y: head.y + d.y * .45, z: head.z + d.z * .45, vx: d.x * wd.speed * pw, vy: d.y * wd.speed * pw, vz: d.z * wd.speed * pw, rest: false, age: 0 });
            let t = 0, ev = null;
            const dt = 1 / 30, T = fuse || 5;
            while (t < T && !ev) { sim.age += dt; ev = flyStep(sim, dt, run.wind, run.water, def.impact ? foes : false, .35); t += dt; if (sim.y < run.water - 1) break; }
            if (ev === 'water' || (!ev && !fuse)) continue;
            const ix = sim.x, iy = sim.y, iz = sim.z;
            let s = Math.hypot(ix - tx, iy - ty, iz - tz);
            if (Math.hypot(ix - w.x, iy - w.y, iz - w.z) < def.r * 1.5 + .5) s += 30;
            for (const q of friends) if (Math.hypot(ix - q.x, iy - q.y, iz - q.z) < def.r * 1.5) s += 8;
            for (const q of foes) if (q !== f && Math.hypot(ix - q.x, iy - q.y, iz - q.z) < def.r * 1.5) s -= 1.5;
            if (wid === 'holy' || wid === 'banana') s -= 1.5;
            if (s < bs) { bs = s; best = { w: wid, yaw, pitch, power: pw, fuse: fuse || 3 }; }
            if (++evals % 40 === 0) yield null;
          }
        }
      }
    }
    // nothing lands close: walk toward them, or an air strike if we have one
    if (bs > 4 && team.ammo.airstrike !== 0 && run.R() < .7) { const f = foes[0]; return { w: 'airstrike', yaw: w.yaw, pitch: .3, tx: f.x + (run.R() - .5), tz: f.z + (run.R() - .5) }; }
    if (bs > 6) {
      const f = foes[0];
      if (run.bot.walked < 2) return { walk: Math.atan2(f.x - w.x, f.z - w.z) + (run.R() - .5) * .6 };
    }
    if (!best) return null;
    // a little human in the aim
    best.power = clamp(best.power + (run.R() - .5) * .1, .1, 1);
    best.pitch += (run.R() - .5) * .06;
    best.yaw += (run.R() - .5) * .05;
    return best;
  }

  // ---------- what everyone sees and hears ----------
  const byWorm = (id) => run.worms.find(w => w.id === id);
  const WORDS = ['boum !', 'badaboum !', 'vlan !', 'paf !', 'kaboum !'];
  const cFire = [new THREE.Color(3, 2.6, 1.6), new THREE.Color(3, 1.6, .4), new THREE.Color(2.4, .8, .2)], cSmoke = new THREE.Color(), cDirt = new THREE.Color();
  function playEvent(e, local) {
    if (!run) return;
    const k = e[0];
    if (k === 'x') {
      const [, x, y, z, r, holy] = e;
      if (!local && land) land.carve(x, y, z, r);
      const f = flashes[flashN++ % flashes.length]; f.t = holy ? 1.2 : .5; f.r = r * (holy ? 3.2 : 2.4); f.s.position.set(x, y, z); f.s.visible = true;
      const rg = rings[ringN++ % rings.length]; rg.t = holy ? 1.2 : .6; rg.r = r * (holy ? 3 : 1.8); rg.m.position.set(x, y + .1, z); rg.m.visible = true;
      const n = Math.min(60, 10 + r * 12);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, b = Math.random() * PI - PI / 2, s = (1 + Math.random() * 3) * r;
        fire.emit(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.abs(Math.sin(b)) * s + 1, Math.sin(a) * Math.cos(b) * s, .2 + Math.random() * .25 * r, .35 + Math.random() * .3, cFire[i % 3]);
      }
      for (let i = 0; i < n * .7; i++) {
        const a = Math.random() * TAU, s = Math.random() * r * 1.3;
        cSmoke.setScalar(.35 + Math.random() * .3);
        smoke.emit(x + Math.cos(a) * s * .5, y + Math.random() * r * .5, z + Math.sin(a) * s * .5, Math.cos(a) * s * .4, 1 + Math.random() * 1.5, Math.sin(a) * s * .4, .3 + Math.random() * .3 * r, 1.5 + Math.random() * 1.5, cSmoke);
      }
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 3 + Math.random() * 6;
        cDirt.setHex(Math.random() < .5 ? 0x7a5230 : 0x5cb846).multiplyScalar(.8 + Math.random() * .3);
        dirt.emit(x, y, z, Math.cos(a) * s * .6, 3 + Math.random() * 7, Math.sin(a) * s * .6, .06 + Math.random() * .1, 1.5 + Math.random(), cDirt);
      }
      sfx.boom(holy ? 2 : r / 2.2);
      run.cam.shake = Math.max(run.cam.shake, holy ? .9 : .12 * r);
      if (r > 1.2 && Math.random() < .5) popText(x, y + 1.5, z, pick(WORDS), '#fff2a0');
      run.cam.boomAt = new THREE.Vector3(x, y, z); run.cam.boomT = 1;
      if (holy) { beam.visible = false; run.holyId = null; }
    } else if (k === 'q') { const w = byWorm(e[1]); if (w) { w.bubbleText = e[2]; w.bubbleT = 2.4; sfx.speak(e[2], w.voice); } }
    else if (k === 'd') { const w = byWorm(e[1]); if (w && e[2] > 0) popText(w.x, w.y + 1.3, w.z, '-' + e[2], hex(w.team.color)); if (w && !local) w.hitT = .3; }
    else if (k === 'hp') { const w = byWorm(e[1]); if (w) { popText(w.x, w.y + 1.3, w.z, '+' + e[2], '#7aff7a'); sfx.pickup(); } }
    else if (k === 'pk') { const w = byWorm(e[1]); if (w) { const name = WEAPONS[WI[e[2]]].name; popText(w.x, w.y + 1.6, w.z, '+1', '#ffd23a'); w.bubbleText = '+1 ' + name; w.bubbleT = 2; sfx.pickup(); } }
    else if (k === 's') { const f = sfx[e[1]]; if (f) f.call(sfx); }
    else if (k === 'h') {
      // the holy hand grenade: a beam from the sky, the choir
      const p = run.projs.find(q => q.id === e[1]) || run.views?.get(e[1]);
      run.holyId = e[1]; beam.visible = true; beam.material.opacity = 0;
      sfx.choir(); banner('alléluia !', 2);
      if (p) beam.position.set(p.x, p.y + 20, p.z);
    }
    else if (k === 'tr') { const [, a, b, c, x, y, z] = e; tracer.geometry.setFromPoints([new THREE.Vector3(a, b, c), new THREE.Vector3(x, y, z)]); tracer.visible = true; tracerT = .15; for (let i = 0; i < 8; i++) sparks.emit(x, y, z, (Math.random() - .5) * 4, Math.random() * 4, (Math.random() - .5) * 4, .04, .4, cFire[0]); }
    else if (k === 'sp') { const [, x, y, z] = e; for (let i = 0; i < 24; i++) { const a = Math.random() * TAU, s = Math.random() * 2; dirt.emit(x, y, z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, .08, 1, cSmoke.setRGB(.8, .9, 1)); } sfx.splash(); }
    else if (k === 'z') { const [, x, y, z] = e; for (let i = 0; i < 30; i++) { const a = Math.random() * TAU; sparks.emit(x, y + Math.random() * 1.2, z, Math.cos(a) * 1.5, Math.random() * 2, Math.sin(a) * 1.5, .06, .6, cSmoke.setRGB(1, 2.4, 3)); } sfx.zap(); }
    else if (k === 'fl') { const [, x, y, z] = e; for (let i = 0; i < 30; i++) fire.emit(x + (Math.random() - .5) * 2, y + .2, z + (Math.random() - .5) * 2, (Math.random() - .5), 2 + Math.random() * 2, (Math.random() - .5), .2 + Math.random() * .2, 1 + Math.random(), cFire[i % 3]); }
    else if (k === 'g') { const [, x, y, z, yaw, pitch] = e; if (!local && land) land.girder(x, y, z, yaw, pitch, 4); sfx.land(2); }
    else if (k === 'sd') { banner('mort subite ! la mer monte', 3); sfx.fanfare(false); }
    else if (k === 'wa') { if (!local) run.water = e[1]; else run.water = e[1]; }
    else if (k === 't') {
      const [, t, wid, wx, wz] = e;
      if (!local) { run.turnTeam = t; run.active = byWorm(wid); run.wind.set(wx, wz); run.phase = 'ready'; run.timer = TURN_T; run.cam.aim = false; run.local.charging = false; run.local.power = 0; run.local.target = null; }
      const team = run.teams[t];
      if (run.active) run.cam.yaw = run.active.yaw;
      if (team.owner === run.meId) banner('à toi ! · ' + (run.active?.name || ''), 2);
      else banner(team.name + ' · ' + (run.active?.name || ''), 1.6);
      sfx.turn();
    }
    else if (k === 'go') { if (!local) run.phase = 'turn'; }
    else if (k === 'k') { const t = run.teams[e[1]]; if (t) { t.out = true; if (!local && !run.out.includes(t.i)) run.out.push(t.i); banner(t.name + ' est éliminée', 2); } }
    else if (k === 'dd') { const w = byWorm(e[1]); if (w) { w.dead = true; if (w.m) w.m.g.visible = false; if (e[2]) sfx.blub(); } }
    else if (k === 'o') { finish(e[1]); }
  }
  function popText(x, y, z, text, color) {
    const p = pops[popN++ % pops.length];
    p.s.userData.set(text, color); p.s.position.set(x, y, z); p.s.visible = true; p.t = 1.6;
  }

  // ---------- the end ----------
  function finish(rank) {
    if (run.result) return;
    run.phase = 'over'; run.phaseT = 5;
    const mine = run.teams.find(t => t.owner === run.meId);
    const place = mine ? rank.indexOf(mine.i) + 1 : rank.length;
    const hp = mine ? mine.worms.reduce((a, w) => a + (w.dead ? 0 : Math.max(0, w.hp)), 0) : 0;
    const standing = mine ? mine.worms.filter(w => !w.dead && w.hp > 0).length : 0;
    const winner = run.teams[rank[0]];
    run.result = { place, of: run.teams.length, time: run.clock, value: place === 1 ? hp : 0, text: place === 1 ? `victoire ! · ${standing} lombric${standing > 1 ? 's' : ''} debout · ${hp} pv` : `${place === 2 ? '2e' : place + 'e'} sur ${run.teams.length} · ${winner ? winner.name + ' gagne' : ''}` };
    banner(place === 1 ? 'victoire !' : winner ? winner.name + ' gagne' : 'égalité', 4);
    sfx.fanfare(place === 1);
    if (winner) { const w = winner.worms.find(q => !q.dead && q.hp > 0); if (w) { w.bubbleText = pick(Q.win); w.bubbleT = 3; sfx.speak(w.bubbleText, w.voice); } }
    run.endT = 4.5;
  }

  // ---------- the network ----------
  const PK = Object.fromEntries(PKINDS.map((k, i) => [k, i]));
  PK.sheep = PKINDS.indexOf('sheep'); PK.dynamite = PKINDS.indexOf('dynamite');
  function snapshot() {
    const s = {
      t: 's', ph: run.phase, tt: run.turnTeam, a: run.active?.id ?? -1, T: r2(run.timer), wd: [r2(run.wind.x), r2(run.wind.y)], wa: r2(run.water), sd: run.sudden ? 1 : 0,
      W: run.worms.map(w => [w.id, r2(w.x), r2(w.y), r2(w.z), r2(w.yaw), w.hp, (w.dead ? 1 : 0) | (w.ground ? 2 : 0) | (w.state === 'rope' ? 4 : 0) | (w.state === 'jet' ? 8 : 0) | (w.state === 'drown' ? 16 : 0) | (w.knock ? 32 : 0) | (w.jetOn ? 64 : 0) | (w.walking ? 128 : 0), r2(w.pitch), w.flip > 0 ? 1 : 0]),
      P: run.projs.map(p => [p.id, PK[p.kind], r2(p.x), r2(p.y), r2(p.z), r2(p.yaw || Math.atan2(p.vx, p.vz)), p.fuse != null ? Math.ceil(p.fuse) : -1]),
      M: run.mines.filter(m => !m.gone).map(m => [m.id, r2(m.x), r2(m.y), r2(m.z), m.trig > 0 ? 1 : 0]),
      D: run.drums.filter(d => !d.gone).map(d => [d.id, r2(d.x), r2(d.y), r2(d.z)]),
      C: run.crates.filter(c => !c.gone).map(c => [c.id, c.kind === 'health' ? 1 : 0, r2(c.x), r2(c.y), r2(c.z), c.falling ? 1 : 0]),
      G: run.graves.map(g => [g.id, r2(g.x), r2(g.y), r2(g.z), g.color]),
      am: run.active ? WEAPONS.map(w => run.active.team.ammo[w.id]) : null,
      sel: [run.sel ?? 0, run.fuse ?? 3, r2(run.aimYaw ?? 0), r2(run.botPower || 0)],
      rp: run.active?.rope ? [r2(run.active.rope.x), r2(run.active.rope.y), r2(run.active.rope.z)] : null,
      out: run.out, e: run.evq,
    };
    run.evq = [];
    return s;
  }
  function applySnap(s) {
    for (const e of s.e) playEvent(e, false);
    if (!run || run.result) return;
    run.phase = s.ph; run.turnTeam = s.tt; run.timer = s.T; run.wind.set(s.wd[0], s.wd[1]); run.water = s.wa; run.sudden = !!s.sd;
    run.active = byWorm(s.a) || null;
    for (const a of s.W) {
      const w = byWorm(a[0]); if (!w) continue;
      w.net = { x: a[1], y: a[2], z: a[3] }; w.yaw = a[4]; w.hp = a[5];
      const f = a[6];
      if (f & 1 && !w.dead) { w.dead = true; }
      w.ground = !!(f & 2); w.state = f & 4 ? 'rope' : f & 8 ? 'jet' : f & 16 ? 'drown' : 'idle'; w.knock = !!(f & 32); w.jetOn = f & 64 ? 1 : 0; w.walking = !!(f & 128);
      w.pitch = a[7]; if (a[8] && !w.flip) w.flip = 1;
      if (Math.hypot(w.net.x - w.x, w.net.y - w.y, w.net.z - w.z) > 4) { w.x = w.net.x; w.y = w.net.y; w.z = w.net.z; }
    }
    run.netP = s.P; run.netM = s.M; run.netD = s.D; run.netC = s.C; run.netG = s.G;
    if (s.am && run.active) { for (const [i, w] of WEAPONS.entries()) run.active.team.ammo[w.id] = s.am[i]; }
    run.sel = s.sel[0]; run.fuse = s.sel[1]; run.aimYaw = s.sel[2]; run.botPower = s.sel[3];
    if (run.active) run.active.rope = s.rp ? { x: s.rp[0], y: s.rp[1], z: s.rp[2] } : null;
    run.out = s.out;
  }
  // what the others see of things: meshes made and dropped by id
  function syncViews(dt) {
    run.views = run.views || new Map();
    const seen = new Set();
    const k = Math.min(1, dt * 14);
    const show = (key, make, x, y, z, fn) => {
      seen.add(key);
      let v = run.views.get(key);
      if (!v) { v = { m: make(), x, y, z }; world.add(v.m); run.views.set(key, v); v.m.position.set(x, y, z); }
      if (Math.hypot(x - v.x, y - v.y, z - v.z) > 5) { v.x = x; v.y = y; v.z = z; }
      v.x += (x - v.x) * k; v.y += (y - v.y) * k; v.z += (z - v.z) * k;
      v.m.position.set(v.x, v.y, v.z);
      fn?.(v);
      return v;
    };
    if (run.isHost) {
      for (const p of run.projs) show('p' + p.id, () => projModel(viewKind(p.kind)), p.x, p.y, p.z, (v) => orientProj(v, p.kind, p.vx, p.vy, p.vz, p.yaw, p.walk, p.fuse, dt, p.rest));
      for (const m of run.mines) if (!m.gone) show('m' + m.id, () => projModel('mine'), m.x, m.y, m.z, (v) => { v.m.userData.light.visible = m.trig > 0 ? Math.floor(run.clock * 8) % 2 === 0 : Math.floor(run.clock * 1.5) % 2 === 0; });
      for (const d of run.drums) if (!d.gone) show('d' + d.id, () => projModel('drum'), d.x, d.y, d.z);
      for (const c of run.crates) if (!c.gone) show('c' + c.id, () => crateModel(c.kind), c.x, c.y, c.z, (v) => { v.m.userData.chute.visible = !!c.falling; v.m.rotation.z = c.falling ? Math.sin(run.clock * 2 + c.id) * .12 : 0; });
      for (const g of run.graves) show('g' + g.id, () => graveModel(g.color), g.x, g.y, g.z);
    } else {
      for (const [id, ki, x, y, z, yaw, fuse] of run.netP || []) show('p' + id, () => projModel(viewKind(PKINDS[ki])), x, y, z, (v) => orientProj(v, PKINDS[ki], x - (v.px ?? x), y - (v.py ?? y), z - (v.pz ?? z), yaw, PKINDS[ki] === 'sheep', fuse, dt, false, v));
      for (const [id, x, y, z, trig] of run.netM || []) show('m' + id, () => projModel('mine'), x, y, z, (v) => { v.m.userData.light.visible = trig ? Math.floor(run.clock * 8) % 2 === 0 : Math.floor(run.clock * 1.5) % 2 === 0; });
      for (const [id, x, y, z] of run.netD || []) show('d' + id, () => projModel('drum'), x, y, z);
      for (const [id, h, x, y, z, falling] of run.netC || []) show('c' + id, () => crateModel(h ? 'health' : 'weapon'), x, y, z, (v) => { v.m.userData.chute.visible = !!falling; });
      for (const [id, x, y, z, col] of run.netG || []) show('g' + id, () => graveModel(col), x, y, z);
    }
    for (const [key, v] of run.views) if (!seen.has(key)) { world.remove(v.m); run.views.delete(key); }
    // the holy grenade's beam follows it
    if (run.holyId != null) { const v = run.views.get('p' + run.holyId); if (v) beam.position.set(v.x, v.y + 20, v.z); }
  }
  const viewKind = (k) => k === 'strike' ? 'strike' : k === 'banana2' ? 'banana' : k;
  function orientProj(v, kind, vx, vy, vz, yaw, walking, fuse, dt, rest, nv) {
    const m = v.m;
    if (nv) { nv.px = v.x; nv.py = v.y; nv.pz = v.z; }
    if (kind === 'bazooka' || kind === 'homing' || kind === 'strike') {
      const l = Math.hypot(vx, vy, vz);
      if (l > 1e-4) { tmpV.set(vx / l, vy / l, vz / l); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV); }
      if (Math.random() < .8) smoke.emit(v.x, v.y, v.z, (Math.random() - .5) * .3, .3, (Math.random() - .5) * .3, .12, .8, cSmoke.setScalar(.7));
    } else if (kind === 'sheep') {
      m.rotation.set(0, yaw, 0);
      const legs = m.userData.legs, t = run.clock * 14;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(t + i * PI) * .5; });
    } else if (kind === 'dynamite') {
      if (m.userData.spark) m.userData.spark.scale.setScalar(.7 + Math.random() * .8);
      if (Math.random() < .5) sparks.emit(v.x, v.y + .35, v.z, (Math.random() - .5) * 1.5, 1.5, (Math.random() - .5) * 1.5, .025, .3, cFire[0]);
    } else if (!rest) { m.rotation.x += dt * 8; m.rotation.z += dt * 5; }
    if (kind === 'holy') { if (Math.random() < .3) sparks.emit(v.x, v.y + .2, v.z, (Math.random() - .5), 1, (Math.random() - .5), .03, .6, cFire[0]); }
  }
  function onFx(pid, fx) {
    if (!run || !fx) return;
    if (fx.t === 'i') {
      const r = run.inputs.get(pid) || { h: 0, y: 0, p: 0, w: 0, f: 3, ev: [] };
      r.h = fx.h; r.y = fx.y; r.p = fx.p; r.w = fx.w; r.f = fx.f;
      if (fx.ev) r.ev.push(...fx.ev);
      run.inputs.set(pid, r);
    } else if (fx.t === 's' && pid === run.hostId && !run.isHost) applySnap(fx);
  }
  function peerLeft(id) {
    if (!run) return;
    for (const t of run.teams) if (t.owner === id) t.owner = '@bot';
    run.inputs.delete(id);
    if (id === run.hostId) {
      const humans = [...new Set(run.teams.map(t => t.owner).filter(o => o !== '@bot'))];
      if (!humans.includes(run.meId)) humans.push(run.meId);
      run.hostId = humans.sort((a, b) => String(a).localeCompare(String(b)))[0];
      const was = run.isHost;
      run.isHost = run.hostId === run.meId;
      if (run.isHost && !was) {
        // take over from the last word of the old host
        for (const w of run.worms) { if (w.net) { w.x = w.net.x; w.y = w.net.y; w.z = w.net.z; } w.ground = true; w.vx = w.vy = w.vz = 0; }
        run.projs = [];
        run.mines = (run.netM || []).map(([id, x, y, z]) => ({ id, def: MINE, x, y, z, vx: 0, vy: 0, vz: 0, rest: true, trig: 0, arm: 0 }));
        run.drums = (run.netD || []).map(([id, x, y, z]) => ({ id, x, y, z, vy: 0, hp: 40 }));
        run.crates = (run.netC || []).map(([id, h, x, y, z]) => ({ id, kind: h ? 'health' : 'weapon', weapon: pick(CRATE_WEAPONS), x, y, z, vy: -2, falling: true }));
        run.graves = (run.netG || []).map(([id, x, y, z, color]) => ({ id, x, y, z, vy: 0, air: true, color }));
        run.idN = 100000;
        run.phase = 'settle'; run.phaseT = .5;
      }
    }
  }

  // ---------- the local player's hands ----------
  function readKeys(keys) {
    const L = run.local;
    const has = (a, b) => keys.has(a) || (b && keys.has(b));
    let h = 0;
    if (has('KeyW', 'ArrowUp')) h |= H_F;
    if (has('KeyS', 'ArrowDown')) h |= H_B;
    if (has('KeyA', 'ArrowLeft')) h |= H_L;
    if (has('KeyD', 'ArrowRight')) h |= H_R;
    if (keys.has('Space')) h |= H_UP;
    if (L.charging) h |= H_FIRE;
    const edge = (code) => { const on = keys.has(code), was = L.prev?.has(code); return on && !was; };
    const mine = myTurn();
    if (mine) {
      const w = run.active;
      // space: a jump; again at once, a backflip
      if (edge('Space') && w?.state !== 'jet') {
        if (run.clock - L.lastSpace < .35) { L.taps.push(['b']); L.lastSpace = -9; }
        else { L.lastSpace = run.clock; L.taps.push(['j']); }
      }
      if (edge('Backspace')) L.taps.push(['b']);
      if (edge('Enter')) L.taps.push(['j']);
      if (edge('KeyE')) cycleWeapon(1);
      if (edge('KeyQ')) cycleWeapon(-1);
      if (edge('KeyF')) { L.fuse = L.fuse % 5 + 1; sfx.select(); }
      for (let n = 0; n <= 9; n++) if (edge('Digit' + n) || edge('Numpad' + n)) pickKey(n);
    }
    L.prev = new Set(keys);
    L.held = h;
  }
  function cycleWeapon(d) {
    const L = run.local, team = activeTeam();
    if (!team || L.charging) return;
    for (let n = 1; n <= WEAPONS.length; n++) {
      const i = (L.w + d * n + WEAPONS.length * 4) % WEAPONS.length;
      if (team.ammo[WEAPONS[i].id] !== 0) { L.w = i; break; }
    }
    L.target = null; sfx.select();
  }
  function pickKey(n) {
    const L = run.local, team = activeTeam();
    if (!team || L.charging) return;
    const list = WEAPONS.map((w, i) => i).filter(i => WEAPONS[i].key === n && team.ammo[WEAPONS[i].id] !== 0);
    if (!list.length) return;
    const at = list.indexOf(L.w);
    L.w = list[(at + 1) % list.length]; L.target = null; sfx.select();
  }
  function press(b, down) {
    if (!run || !myTurn()) return;
    sfx.init();
    const L = run.local, wd = WEAPONS[L.w];
    if (b === 2) {
      if (!down) return;
      if (wd.target) { L.target = null; return; }
      run.cam.aim = !run.cam.aim; return;
    }
    if (b !== 0) return;
    if (run.phase === 'retreat') { if (down) L.taps.push(['u']); return; }
    if (wd.charge) {
      if (down && !L.charging && activeTeam().ammo[wd.id] !== 0) { L.charging = true; L.power = 0; }
      else if (!down && L.charging) { L.charging = false; L.taps.push(['f', r2(Math.max(.05, L.power))]); L.power = 0; }
      return;
    }
    if (!down) return;
    if (wd.target) {
      if (!L.target) { const w = run.active; L.target = { x: w.x, z: w.z }; return; }
      L.taps.push(['t', r2(L.target.x), r2(L.target.z)]); L.target = null;
      return;
    }
    L.taps.push(['u']);
  }
  function look(dx, dy) {
    if (!run) return;
    const L = run.local;
    if (L.target && myTurn()) { const c = Math.cos(run.cam.yaw), s = Math.sin(run.cam.yaw); L.target.x = clamp(L.target.x + (-c * dx - s * dy) * .04, -HALF, HALF); L.target.z = clamp(L.target.z + (s * dx - c * dy) * .04, -HALF, HALF); return; }
    run.cam.yaw -= dx * .0025;
    run.cam.pitch = clamp(run.cam.pitch - dy * .0025, -1.3, 1.45);
  }
  const onWheel = (e) => { if (run && myTurn()) cycleWeapon(e.deltaY > 0 ? 1 : -1); };

  // ---------- the frame ----------
  function update(dt, keys) {
    if (!run) return;
    dt = Math.min(dt, .05);
    readKeys(keys);
    const L = run.local;
    if (L.charging) {
      L.power = Math.min(1, L.power + dt / 1.4);
      sfx.charge(L.power);
      if (L.power >= 1) { L.charging = false; L.taps.push(['f', 1]); L.power = 0; }
    }
    if (!myTurn()) { L.charging = false; L.target = null; }
    if (run.isHost) {
      run.acc += dt;
      let n = 0;
      while (run.acc >= STEP && n++ < 5) { run.acc -= STEP; tick(); if (!run) return; }
      if (n >= 5) run.acc = 0;
      run.snapT -= dt;
      if (run.snapT <= 0) { run.snapT = 1 / 12; const s = snapshot(); run.send(s); }
    } else {
      run.clock += dt;
      // my inputs to the host, when it's my turn
      if (myTurn()) {
        run.sendT -= dt;
        const key = [L.held, r2(run.cam.yaw), r2(run.cam.pitch), L.w, L.fuse].join();
        if (L.taps.length || (key !== L.sent && run.sendT <= .02) || run.sendT <= -.2) {
          run.send({ t: 'i', h: L.held, y: r2(run.cam.yaw), p: r2(run.cam.pitch), w: L.w, f: L.fuse, ev: L.taps });
          L.taps = []; L.sent = key; run.sendT = 1 / 15;
        }
      } else L.taps = [];
      // everything glides to the host's word
      for (const w of run.worms) if (w.net) { const k = Math.min(1, dt * 12); w.x += (w.net.x - w.x) * k; w.y += (w.net.y - w.y) * k; w.z += (w.net.z - w.z) * k; }
    }
    land.flush(6);
    render(dt);
    placeCam(dt);
    drawOverlay();
    if (run.endT > 0) { run.endT -= dt; if (run.endT <= 0) { const r = run.result; run.endT = -1; onEnd(r); } }
  }

  // ---------- drawing ----------
  function render(dt) {
    const t = run.clock;
    sea.position.y = run.water + Math.sin(t * .8) * .04;
    sea.userData.tex.offset.set(t * .01 + run.wind.x * t * .004, t * .006 + run.wind.y * t * .004);
    for (const w of run.worms) {
      const m = w.m;
      const vis = !w.dead;
      m.g.visible = vis; w.tag.visible = vis && w.state !== 'drown';
      if (!vis) { w.bubble.visible = false; continue; }
      w.shown += (w.hp - w.shown) * Math.min(1, dt * 3);
      if (Math.abs(w.hp - w.shown) < .6) w.shown = w.hp;
      const act = w === run.active && (run.phase === 'turn' || run.phase === 'retreat' || run.phase === 'ready');
      w.tag.userData.set(w.name, Math.max(0, Math.round(w.shown)), hex(w.team.color), act);
      m.g.position.set(w.x, w.y, w.z);
      m.g.rotation.set(0, w.yaw, 0);
      // alive-looking: breathing, crawling, flying, flipping
      const walk = w.walking ? Math.sin(t * 16) : 0;
      m.body.position.y = w.ground ? Math.abs(walk) * .04 + Math.sin(t * 2.5 + w.id) * .01 : 0;
      m.body.scale.set(1, 1 + (w.ground ? Math.sin(t * 2.5 + w.id) * .02 - Math.abs(walk) * .06 : .05), 1);
      m.body.rotation.set(w.flip > 0 ? -(1 - w.flip) * TAU : w.knock ? t * 9 : w.state === 'jet' ? .15 : 0, 0, w.walking ? walk * .08 : 0);
      if (w.state === 'drown') m.body.rotation.x = .6;
      m.head.rotation.x = act ? -(w.pitch || 0) * .35 : 0;
      for (const e of m.eyes) e.scale.y = Math.sin(t * .7 + w.id * 3) > .985 ? .15 : 1;
      // what it holds: the chosen weapon on its turn
      const hid = act && run.phase !== 'retreat' ? WEAPONS[run.sel ?? 0]?.id : null;
      if (hid !== w.heldId) { m.held.clear(); if (hid) m.held.add(heldModel(hid)); w.heldId = hid; }
      m.hand.rotation.x = -(w.pitch || 0);
      w.tag.position.set(w.x, w.y + 1.15, w.z);
      if (w.bubbleT > 0) { w.bubbleT -= dt; w.bubble.visible = true; w.bubble.userData.set(w.bubbleText); w.bubble.position.set(w.x, w.y + 1.95, w.z); } else w.bubble.visible = false;
      if (w.state === 'jet' && w.jetOn) for (let i = 0; i < 2; i++) fire.emit(w.x - Math.sin(w.yaw) * .2, w.y + .25, w.z - Math.cos(w.yaw) * .2, (Math.random() - .5) * .5, -3 - Math.random() * 2, (Math.random() - .5) * .5, .08, .3, cFire[i % 3]);
      if (w.state === 'drown' && Math.random() < .2) dirt.emit(w.x, run.water, w.z, (Math.random() - .5), 2, (Math.random() - .5), .05, .6, cSmoke.setRGB(.8, .9, 1));
    }
    const aw = run.active;
    sfx.jet(!!(aw && aw.state === 'jet' && aw.jetOn));
    // the rope
    if (aw && aw.state === 'rope' && aw.rope) {
      ropeLine.visible = true;
      const p = ropeLine.geometry.attributes.position;
      p.setXYZ(0, aw.rope.x, aw.rope.y, aw.rope.z); p.setXYZ(1, aw.x, aw.y + .4, aw.z); p.needsUpdate = true;
    } else ropeLine.visible = false;
    // the aim: a red ring out in front, dots for a throw
    const aiming = aw && myTurn() && run.phase === 'turn' && !run.local.target;
    const wd = WEAPONS[aiming ? run.local.w : run.sel ?? 0];
    const showAim = aw && (run.phase === 'turn') && wd && (wd.charge || wd.id === 'shotgun' || wd.id === 'rope' || wd.id === 'bat' || wd.id === 'girder');
    cross.visible = !!showAim && wd.id !== 'girder';
    if (showAim) {
      const yaw = aiming ? run.cam.yaw : run.aimYaw ?? aw.yaw, pitch = aiming ? run.cam.pitch : aw.pitch;
      dirOf(yaw, pitch, tmpD);
      cross.position.set(aw.x + tmpD.x * 3, aw.y + .55 + tmpD.y * 3, aw.z + tmpD.z * 3);
      cross.lookAt(cross.position.x + tmpD.x, cross.position.y + tmpD.y, cross.position.z + tmpD.z);
      const pw = aiming ? run.local.power : run.botPower || 0;
      for (const [i, d] of dots.entries()) {
        d.visible = wd.charge && pw > 0 && i < Math.ceil(pw * 8);
        const s = (i + 1) / 8 * 2.6;
        d.position.set(aw.x + tmpD.x * s, aw.y + .55 + tmpD.y * s, aw.z + tmpD.z * s);
        d.material.color.setRGB(1.5 + pw, 1.6 - pw * 1.4, .3);
      }
      if (wd.id === 'girder' && aiming) {
        const c = girderSpot(aw, { yaw: run.cam.yaw, pitch: run.cam.pitch });
        ghost.visible = !!c;
        if (c) { ghost.position.set(c.x, c.y, c.z); ghost.rotation.set(0, 0, 0); ghost.rotateY(c.yaw); ghost.rotateX(-c.pitch); }
      } else ghost.visible = false;
    } else { for (const d of dots) d.visible = false; ghost.visible = false; }
    // the target on the map
    reticle.visible = !!(run.local.target && myTurn());
    if (reticle.visible) { const T = run.local.target; reticle.position.set(T.x, land.topAt(T.x, T.z) + .1, T.z); reticle.rotation.y += dt; }
    syncViews(dt);
    // effects
    for (const f of flashes) if (f.t > 0) { f.t -= dt; const k = 1 - f.t / .5; f.s.scale.setScalar(f.r * (.4 + Math.min(1, k) * .8)); f.s.material.opacity = Math.max(0, f.t * 2); if (f.t <= 0) f.s.visible = false; }
    for (const r of rings) if (r.t > 0) { r.t -= dt; const k = 1 - r.t / .6; r.m.scale.setScalar(r.r * (.3 + k * 1.2)); r.m.material.opacity = Math.max(0, r.t * 1.4); if (r.t <= 0) r.m.visible = false; }
    for (const p of pops) if (p.t > 0) { p.t -= dt; p.s.position.y += dt * .6; p.s.material.opacity = Math.min(1, p.t * 1.5); if (p.t <= 0) p.s.visible = false; }
    if (tracerT > 0) { tracerT -= dt; tracer.material.opacity = tracerT / .15; if (tracerT <= 0) tracer.visible = false; }
    if (beam.visible) beam.material.opacity = Math.min(.35, beam.material.opacity + dt * .3) * (.85 + Math.random() * .15);
    fire.step(dt); smoke.step(dt); dirt.step(dt, run.water - .2); sparks.step(dt);
  }

  // ---------- the camera ----------
  const look3 = new THREE.Vector3(), want = new THREE.Vector3(), wantLook = new THREE.Vector3();
  function placeCam(dt) {
    const C = run.cam, aw = run.active;
    const mineNow = myTurn();
    const yaw = C.yaw, pitch = mineNow ? C.pitch : Math.min(C.pitch, .6);
    // what to look at: the flying thing, the blast, the one playing
    let focus = null;
    const fly = run.isHost ? run.projs[run.projs.length - 1] : null;
    if (fly) focus = tmpV.set(fly.x, fly.y, fly.z);
    else if (!run.isHost && run.netP?.length) { const p = run.netP[run.netP.length - 1]; focus = tmpV.set(p[2], p[3], p[4]); }
    if (!focus && C.boomT > 0) { C.boomT -= dt; focus = tmpV.copy(C.boomAt); }
    if (focus) C.follow = Math.min(1, (C.follow || 0) + dt * 3); else C.follow = 0;
    const overview = run.phase === 'intro' || run.phase === 'over' || (!aw && !focus);
    if (run.local.target && mineNow) {
      const T = run.local.target;
      want.set(T.x - Math.sin(yaw) * 10, TOP + 22, T.z - Math.cos(yaw) * 10);
      wantLook.set(T.x, run.water, T.z);
    } else if (overview) {
      const a = run.clock * .12 + (run.phase === 'over' ? 0 : 0);
      want.set(Math.sin(a) * 38, 20, Math.cos(a) * 38); wantLook.set(0, 4, 0);
    } else if (C.aim && mineNow && aw && !focus) {
      dirOf(yaw, pitch, tmpD);
      const sx = Math.cos(yaw), sz = -Math.sin(yaw);
      want.set(aw.x - tmpD.x * .9 - sx * .45, aw.y + .9 - tmpD.y * .6, aw.z - tmpD.z * .9 - sz * .45);
      wantLook.set(aw.x + tmpD.x * 6, aw.y + .7 + tmpD.y * 6, aw.z + tmpD.z * 6);
    } else {
      const tgt = focus || (aw ? tmpV.set(aw.x, aw.y + .4, aw.z) : tmpV.set(0, 4, 0));
      const cp = clamp(.32 - pitch * .35, -.05, 1.1), D = focus && !aw ? 9 : focus ? 8 : 6.2;
      want.set(tgt.x - Math.sin(yaw) * Math.cos(cp) * D, tgt.y + .6 + Math.sin(cp) * D, tgt.z - Math.cos(yaw) * Math.cos(cp) * D);
      wantLook.set(tgt.x + Math.sin(yaw) * 1.5, tgt.y + .5, tgt.z + Math.cos(yaw) * 1.5);
    }
    // never inside the ground, never under the sea
    for (let n = 0; n < 30 && land.solid(want.x, want.y, want.z); n++) want.y += .4;
    want.y = Math.max(want.y, run.water + .4);
    const k = C.snap ? 1 : Math.min(1, dt * (C.aim && mineNow ? 14 : overview ? 1.5 : 5));
    C.snap = false;
    C.pos.lerp(want, k); C.look.lerp(wantLook, k);
    camera.position.copy(C.pos).add(AT);
    if (C.shake > 0) { C.shake = Math.max(0, C.shake - dt * 1.2); camera.position.x += (Math.random() - .5) * C.shake; camera.position.y += (Math.random() - .5) * C.shake; camera.position.z += (Math.random() - .5) * C.shake; }
    camera.up.set(0, 1, 0);
    camera.lookAt(look3.copy(C.look).add(AT));
  }

  // ---------- the overlay: the weapons, the power, the banners ----------
  let ov = null;
  function makeOverlay() {
    removeOverlay();
    ov = document.createElement('div');
    ov.id = 'w3d-ui';
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;font-family:var(--text, Rubik, sans-serif);color:#fff';
    ov.innerHTML = `<div class="w3-banner" style="position:absolute;top:34%;left:0;right:0;text-align:center;font:400 54px/1 var(--display, 'Titan One', sans-serif);color:#fff;-webkit-text-stroke:.14em #1a1a1a;paint-order:stroke fill;text-shadow:0 4px 0 #1a1a1a;opacity:0;transition:opacity .25s"></div>
      <div class="w3-cross" style="position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:3px solid rgba(255,80,60,.9);border-radius:50%;display:none"></div>
      <div class="w3-power" style="position:absolute;left:50%;bottom:118px;width:260px;height:14px;margin-left:-130px;border-radius:999px;background:rgba(0,0,0,.55);box-shadow:0 0 0 2px #1a1a1a;overflow:hidden;display:none"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,#ffe060,#ff7a1a,#ff2a1a)"></i></div>
      <div class="w3-hint" style="position:absolute;left:0;right:0;bottom:92px;text-align:center;font:600 14px/1.3 var(--text, Rubik, sans-serif);text-shadow:0 2px 3px #000"></div>
      <div class="w3-bar" style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:4px;flex-wrap:wrap;justify-content:center;max-width:96vw"></div>`;
    document.body.appendChild(ov);
    addEventListener('wheel', onWheel, { passive: true });
  }
  function removeOverlay() { if (ov) { ov.remove(); ov = null; } removeEventListener('wheel', onWheel); }
  let lastBar = '';
  function drawOverlay() {
    if (!ov) return;
    const b = ov.querySelector('.w3-banner');
    if (run.banner) { run.banner.t -= 1 / 60; b.textContent = run.banner.text; b.style.opacity = run.banner.t > 0 ? 1 : 0; if (run.banner.t <= 0) run.banner = null; }
    const mine = myTurn(), L = run.local, wd = WEAPONS[L.w];
    ov.querySelector('.w3-cross').style.display = mine && run.cam.aim && !L.target ? 'block' : 'none';
    const pw = ov.querySelector('.w3-power');
    pw.style.display = mine && L.charging ? 'block' : 'none';
    pw.firstElementChild.style.width = Math.round(L.power * 100) + '%';
    const hint = ov.querySelector('.w3-hint');
    let ht = '';
    if (mine && run.phase === 'turn') {
      if (L.target) ht = 'souris : déplacer la cible · clic : valider · clic droit : annuler';
      else if (wd.target) ht = 'clic : choisir la cible sur la carte';
      else if (wd.charge) ht = `maintiens le clic pour la puissance${wd.fuse && !wd.fixedFuse ? ` · f : minuterie ${L.fuse} s` : ''} · clic droit : vue visée`;
      else if (wd.id === 'rope') ht = run.active?.state === 'rope' ? 'z s : monter, descendre · q d : se balancer · espace : lâcher · clic : relancer' : 'clic : lancer la corde vers la cible';
      else if (wd.id === 'jetpack') ht = run.active?.state === 'jet' ? 'espace : monter · zqsd : diriger · clic : couper' : 'clic : allumer le jetpack';
      else if (wd.id === 'girder') ht = 'vise l\'endroit · clic : poser la poutre';
      else if (wd.id === 'sheep') ht = 'clic : lâcher le mouton · clic encore : boum';
      else ht = 'clic : utiliser';
    } else if (mine && run.phase === 'retreat') ht = run.projs?.some?.(p => p.kind === 'sheep') ? 'clic : faire sauter le mouton · file !' : 'file te mettre à l\'abri !';
    if (hint.textContent !== ht) hint.textContent = ht;
    const bar = ov.querySelector('.w3-bar');
    const team = activeTeam();
    const key = mine && team ? L.w + '|' + WEAPONS.map(w => team.ammo[w.id]).join() : '';
    if (key !== lastBar) {
      lastBar = key;
      bar.innerHTML = !key ? '' : WEAPONS.map((w, i) => {
        const a = team.ammo[w.id], on = i === L.w;
        return `<span style="display:flex;flex-direction:column;align-items:center;min-width:54px;padding:4px 6px;border-radius:10px;background:${on ? 'rgba(255,210,60,.95)' : 'rgba(10,10,20,.72)'};color:${on ? '#1a1a1a' : a === 0 ? 'rgba(255,255,255,.35)' : '#fff'};box-shadow:0 0 0 2px #1a1a1a;font:600 11px/1.15 var(--text, Rubik, sans-serif)"><b style="font:400 13px/1 var(--display, sans-serif)">${w.key}</b>${w.name}<em style="font-style:normal;opacity:.8">${a < 0 ? '∞' : '×' + a}</em></span>`;
      }).join('');
    }
  }

  function hud() {
    if (!run) return { hidden: true };
    const t = run.teams, total = HP0 * run.mode.worms;
    const bars = t.map(tm => {
      const hp = tm.worms.reduce((a, w) => a + (w.dead ? 0 : Math.max(0, Math.round(w.shown ?? w.hp))), 0);
      const on = run.active && run.active.team === tm;
      return `<div style="display:flex;align-items:center;gap:6px;opacity:${tm.out ? .4 : 1}"><span style="width:118px;text-align:right;font:600 12px/1.2 var(--text);color:${hex(tm.color)}">${on ? '▶ ' : ''}${tm.short}</span><span style="display:block;width:${Math.round(150 * hp / total)}px;height:10px;border-radius:6px;background:${hex(tm.color)};box-shadow:0 0 0 2px #1a1a1a"></span><span style="font:600 11px/1 var(--text)">${hp}</span></div>`;
    }).join('');
    const w = run.active, wa = Math.atan2(run.wind.x, run.wind.y) - run.cam.yaw, ws = Math.hypot(run.wind.x, run.wind.y);
    const arrow = `<span style="display:inline-block;width:${20 + Math.round(ws * 50)}px;height:8px;background:linear-gradient(90deg,rgba(140,200,255,.2),#8cf);border-radius:4px;transform:rotate(${Math.round((-wa - PI / 2) * 180 / PI)}deg)"></span>`;
    const phase = run.phase;
    const time = phase === 'turn' || phase === 'retreat' ? Math.max(0, Math.ceil(run.timer)) : phase === 'ready' ? '…' : phase === 'over' ? '' : '·';
    if ((phase === 'turn' || phase === 'retreat') && run.timer < 5.5 && run.timer > 0) sfx.tick(true);
    const sel = WEAPONS[myTurn() ? run.local.w : run.sel ?? 0];
    const who = w && phase !== 'over' ? `${w.team.me ? '<em>toi</em>' : w.team.short} · ${w.name}${phase === 'retreat' ? ' · retraite !' : sel && phase === 'turn' ? ' · ' + sel.name : ''}` : phase === 'over' ? 'fin de la partie' : '';
    const sd = run.sudden ? '<span style="color:#ff8a6a">mort subite · la mer monte</span>' : '';
    return { html: `<b>lombrics 3D</b><span class="big" style="${phase === 'retreat' ? 'color:#ffb040' : run.timer < 6 ? 'color:#ff6a4a' : ''}">${time}</span><span>${who}</span><span style="display:flex;align-items:center;gap:8px;font-size:12px">vent ${arrow}</span>${sd}<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">${bars}</div>` };
  }

  return {
    modes: MODES,
    keys: [['z q s d', 'ramper'], ['espace', 'sauter · deux fois : salto arrière'], ['souris', 'viser · clic droit : vue visée'], ['clic', 'maintenir : puissance, lâcher : tir'], ['1 … 0 · e · molette', 'choisir une arme'], ['f', 'minuterie des grenades']],
    start, stop: () => stop(false), update, onFx, peerLeft, press, look,
    respawn() { if (run) run.cam.snap = true; },
    hud,
    preview() { return { x: AT.x, y: AT.y + 5, z: AT.z, yaw: PI * .25, rad: 30, h: 13 }; },
    set onEnd(f) { onEnd = f; },
    // tests
    get run() { return run; }, get land() { return land; }, WEAPONS,
    _skipIntro() { if (run && run.phase === 'intro') run.phaseT = 0; },
    _fire(id, yaw, pitch, power = .7) {
      if (!run || !myTurn()) return false;
      run.local.w = WI[id]; run.cam.yaw = yaw; run.cam.pitch = pitch;
      const wd = WEAPONS[WI[id]];
      if (wd.charge) run.local.taps.push(['f', power]); else if (wd.target) run.local.taps.push(['t', Math.sin(yaw) * 8, Math.cos(yaw) * 8]); else run.local.taps.push(['u']);
      return true;
    },
    _tp(x, z) { const w = run?.active; if (!w) return; w.x = x; w.z = z; w.y = land.topAt(x, z); w.ground = true; },
  };
}
