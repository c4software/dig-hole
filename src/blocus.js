// blocus.js, the blockade in front of the lycée (lycee.js): thirty students with banners and
// hand-painted signs behind a barricade against the gate, bins burning among them, firework
// mortars going up from crates by the gate; across the lane a line of police with helmets and
// shields (they bang them), a few with foam-ball launchers, a smoke canister now and then.
// The crowd moves on its own script (blocus-sim.js): surges, splits round the fires, retreats,
// scatters when a mortar goes off or a ball lands, people sitting down on their bum and getting
// up. It is the same for everyone (the shared clock and a seed: nothing on the network); what
// you do there is yours alone: the crowd shoves you, a ball can find you (poc), the smoke makes
// you cough. School days by daylight (tunable « blocus du lycée »: auto, en cours, levé).
import * as THREE from 'three';
import { createRig } from './rig.js';
import { DEFAULT, randomOutfit } from './outfits.js';
import { canvasTex } from './lib/tex.js';
import { mulberry } from './lib/math.js';
import * as SIM from './blocus-sim.js';
import { createLycee, LYCEE } from './lycee.js';
import { createPoints, createBalls } from './blocus-fx.js';
import { createBlocusSfx } from './blocus-sfx.js';

const SEED = 4217;
const SIGNS = ['non à la réforme', 'on veut des profs', 'lycée en lutte', 'le bac pour tous', 'on lâche rien', 'des profs, pas des trous', 'rendez-nous la récré', 'même pas peur', 'la cantine avec nous', 'des moyens pour l\'école'];
const BANNERS = ['lycée en lutte', 'on veut des profs !', 'non à la réforme'];
const BURST = [[1, .25, .2], [.35, 1, .35], [1, .8, .25], [.35, .55, 1], [1, .4, .85]];
const HITS = ['poc ! une balle en mousse · rien de cassé', 'poc ! en plein dans le sac à dos', 'aïe… non, même pas mal : c\'est de la mousse', 'poc ! touché, pas coulé', 'poc ! la mousse, ça rebondit'];
const TOPS = [0xd8403a, 0x3f7fd8, 0x3aa060, 0xe8b830, 0x8a52c8, 0xee7a2a, 0xf2efe8, 0x2a2c32, 0xe87aa8, 0x3ab8b0];

export function createBlocus({ parent, colliders, interactables, ui, shake = () => {}, renderer, insideOf = null, walkers = null }) {
  const lycee = createLycee({ parent, colliders });
  const root = new THREE.Group(); root.userData.keep = true; parent.add(root);
  const OX = LYCEE.x, OZ = LYCEE.z;
  const sim = SIM.createCrowd({ seed: SEED });
  const sfx = createBlocusSfx();
  const fx = createPoints(root, { max: 900, additive: true });
  const puffs = createPoints(root, { max: 420, additive: false });
  const balls = createBalls(root, 16);
  const rnd = mulberry(99);

  // ---------- the ground glow under each fire (no light: an added disc, flickering) ----------
  const glowTex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,170,80,1)'); g.addColorStop(.5, 'rgba(255,120,40,.35)'); g.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const glows = lycee.fires.map(f => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), glowMat); m.rotation.x = -Math.PI / 2; m.position.set(OX + f.x, .07, OZ + f.z); m.renderOrder = 3; root.add(m); return m; });

  // ---------- the people (built the first time someone comes near) ----------
  const agents = [];
  let built = false;
  const shared = new Map();
  const sm = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!shared.has(k)) shared.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return shared.get(k); };
  const signTex = (text, bg, fg) => canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const words = text.split(' '), lines = [];
    let line = '';
    c.font = '700 38px "Comic Sans MS", "Marker Felt", "Chalkboard", sans-serif';
    for (const wd of words) { const tr = line ? line + ' ' + wd : wd; if (c.measureText(tr).width > w - 26 && line) { lines.push(line); line = wd; } else line = tr; }
    lines.push(line);
    lines.forEach((l, i) => { c.save(); c.translate(w / 2, h / 2 + (i - (lines.length - 1) / 2) * 42); c.rotate((Math.random() - .5) * .08); c.fillText(l, 0, 0); c.restore(); });
  });
  const bannerTex = (text, bg, fg) => canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 64px "Comic Sans MS", "Marker Felt", sans-serif';
    c.save(); c.translate(w / 2, h / 2 + 3); c.rotate(-.02); c.fillText(text, 0, 0); c.restore();
  });
  const onBone = (rig, bone, mesh, x, y, z) => { mesh.position.set(x, y, z); rig.bone(bone).add(mesh); mesh.castShadow = false; return mesh; };
  const banners = [];

  function build() {
    built = true;
    const orng = mulberry(SEED);
    const stickM = sm(0xb89060), SB = [['#f6f2e6', '#c8222a'], ['#fbe36a', '#1d2430'], ['#ffffff', '#1d4ea8'], ['#f4c8d8', '#6a1a4a'], ['#c8ecc8', '#1a5a2a']];
    const boardGeo = new THREE.PlaneGeometry(.8, .5), stickGeo = new THREE.CylinderGeometry(.018, .018, 1.25, 5);
    for (let i = 0; i < SIM.NP; i++) {
      const o = randomOutfit(orng, { tops: TOPS, style: 'europe' });
      if (o.top === 'tweed' || o.top === 'trench') o.top = 'pull';        // they're sixteen
      const rig = createRig(o, { detail: 'lo', lod: true });
      const g = new THREE.Group(); g.add(rig.root); root.add(g);
      const a = { i, g, rig, police: false, x: sim.hx[i], z: sim.hz[i], yaw: Math.PI, sp: 0, offX: 0, offZ: 0, sat: false, role: 'plain', ph: orng() * 10, acc: 0 };
      if (i >= 6 && i < 16) {
        // a sign on a stick, held up in the right hand (seen from both sides)
        a.role = 'sign';
        const [bg, fg] = SB[i % SB.length], tex = signTex(SIGNS[i - 6], bg, fg), m = new THREE.MeshLambertMaterial({ map: tex });
        const s = new THREE.Group();
        const f = new THREE.Mesh(boardGeo, m); f.position.y = .62; s.add(f);
        const b = new THREE.Mesh(boardGeo, m); b.position.y = .62; b.rotation.y = Math.PI; s.add(b);
        const st = new THREE.Mesh(stickGeo, stickM); st.position.y = 0; s.add(st);
        onBone(rig, 'chest', s, -.3, .55, .12);
      } else if (i === 16 || i === 23) {
        a.role = 'drum';
        const d = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .26, 14), sm(0xd8403a)); d.rotation.z = Math.PI / 2; onBone(rig, 'spine', d, 0, -.02, .28);
        const skin = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .27, 14, 1, true), sm(0xf2eee4)); skin.rotation.z = Math.PI / 2; skin.scale.set(1, .6, 1); onBone(rig, 'spine', skin, 0, -.02, .28);
      } else if (i < 6) a.role = 'banner';
      agents.push(a);
    }
    // the police: navy, helmet and visor, a vest, a shield (round or tall and clear) or a launcher
    const helmetGeo = new THREE.SphereGeometry(.17, 14, 8, 0, Math.PI * 2, 0, Math.PI * .55), visorGeo = new THREE.CylinderGeometry(.18, .18, .17, 14, 1, true, -Math.PI / 2, Math.PI);
    const helmetM = sm(0x1c2436), visorM = new THREE.MeshLambertMaterial({ color: 0xa8c0d8, transparent: true, opacity: .45, side: THREE.DoubleSide }), vestM = sm(0x161b24);
    const clearM = new THREE.MeshLambertMaterial({ color: 0xd0e0ee, transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false });
    const bandTex = canvasTex(256, 64, (c) => { c.fillStyle = '#10141c'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#f4f4f2'; c.font = '700 40px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('POLICE', 128, 34); });
    const bandM = new THREE.MeshLambertMaterial({ map: bandTex }), roundM = sm(0x2a2e36), launcherM = sm(0x1a1a1e), tipM = sm(0xe8b830);
    for (let c = 0; c < SIM.NC; c++) {
      const i = SIM.NP + c;
      const o = { ...DEFAULT, top: 'pull', teeHex: 0x1f2a44, bottom: 'jean', shoes: 'bottines', hat: 'nohat', glasses: 'noglasses', skin: Math.floor(orng() * 6), hair: 'rase', hairC: 1 };
      const rig = createRig(o, { detail: 'lo', lod: true });
      const g = new THREE.Group(); g.add(rig.root); root.add(g);
      const a = { i, g, rig, police: true, x: sim.px[i], z: sim.pz[i], yaw: 0, sp: 0, offX: 0, offZ: 0, sat: false, role: 'shield', ph: orng() * 10, acc: 0, shield: null };
      onBone(rig, 'head', new THREE.Mesh(helmetGeo, helmetM), 0, .12, -.01).scale.set(1, 1.05, 1.15);
      onBone(rig, 'head', new THREE.Mesh(visorGeo, visorM), 0, .1, .02);
      onBone(rig, 'chest', new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .3), vestM), 0, -.06, 0);
      if (SIM.LAUNCHERS.includes(c)) {
        a.role = 'launcher';
        const l = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 10), launcherM); barrel.rotation.x = Math.PI / 2; barrel.position.z = .12; l.add(barrel);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .05, 10), tipM); tip.rotation.x = Math.PI / 2; tip.position.z = .38; l.add(tip);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(.07, .14, .3), launcherM); stock.position.set(0, -.04, -.18); l.add(stock);
        a.gun = onBone(rig, 'chest', l, -.14, .12, .3);
      } else {
        const s = new THREE.Group();
        if (c % 3 === 0) { const d = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .04, 20), roundM); d.rotation.x = Math.PI / 2; s.add(d); }
        else {
          const p = new THREE.Mesh(new THREE.BoxGeometry(.58, 1.05, .025), clearM); p.renderOrder = 4; s.add(p);
          const band = new THREE.Mesh(new THREE.PlaneGeometry(.5, .12), bandM); band.position.set(0, .28, .016); s.add(band);
        }
        a.shield = onBone(rig, 'chest', s, .08, c % 3 === 0 ? -.05 : -.25, .42);
      }
      agents.push(a);
    }
    // the banners between their two holders
    SIM.BANNERS.forEach(([ia, ib], k) => {
      const tex = bannerTex(BANNERS[k], ['#f6f2e6', '#fbe36a', '#ffffff'][k], ['#c8222a', '#1d2430', '#1d4ea8'][k]);
      const m = new THREE.MeshLambertMaterial({ map: tex });
      const g = new THREE.Group(); root.add(g);
      // two faces back to back: the words read right from both sides
      const cloth = new THREE.Group(); cloth.position.y = 1.72; g.add(cloth);
      const geo = new THREE.PlaneGeometry(1, .7, 6, 1);
      cloth.add(new THREE.Mesh(geo, m)); const back = new THREE.Mesh(geo, m); back.rotation.y = Math.PI; cloth.add(back);
      const poles = [-1, 1].map(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 2.1, 5), stickM); p.position.y = 1.05; g.add(p); return p; });
      banners.push({ a: agents[ia], b: agents[ib], g, cloth, geo, poles, base: geo.attributes.position.array.slice() });
    });
    // their shadows: soft blobs, one draw
    blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(.9, .9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), color: 0x1e1a30, transparent: true, opacity: .45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), agents.length);
    blobs.frustumCulled = false; blobs.renderOrder = 1; blobs.userData.keep = true; root.add(blobs);
  }
  let blobs = null;
  const blobTex = () => canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });

  // ---------- what flies: rockets, canisters (their balls are in fx.balls); the smoke clouds ----------
  const rockets = [], cans = [], clouds = [];
  const events = [];
  const _c = new THREE.Vector3(), _v = new THREE.Vector2(), m4 = new THREE.Matrix4();

  // what the script says happened this frame: show it
  function play(e, cam) {
    stats[e.k]++;
    if (e.k === 'mortar') {
      const tb = lycee.tubes[e.tube];
      rockets.push({ x0: OX + tb.x, y0: tb.y, z0: OZ + tb.z, x1: OX + e.bx, y1: e.by, z1: OZ + e.bz, t: 0, fl: e.fl });
      sfx.launch(OX + tb.x, OZ + tb.z, e.fl);
      for (let k = 0; k < 14; k++) puffs.spawn(OX + tb.x, .9, OZ + tb.z, (rnd() - .5) * 1.5, 1 + rnd(), (rnd() - .5) * 1.5, 1.4, .3, 1.2, .8, .8, .78, .5, 1.5, -.2);
    } else if (e.k === 'burst') {
      const x = OX + e.x, y = e.y, z = OZ + e.z, [r, g, b] = BURST[e.col % BURST.length], [r2, g2, b2] = BURST[(e.col + 2) % BURST.length];
      for (let k = 0; k < 110; k++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 6 + rnd() * 3.5, two = k % 3 === 0;
        fx.spawn(x, y, z, Math.cos(th) * s * sp, u * sp, Math.sin(th) * s * sp, 1.3 + rnd() * .8, .5, .15, two ? r2 : r, two ? g2 : g, two ? b2 : b, 1, 1.4, 2.2);
      }
      fx.spawn(x, y, z, 0, 0, 0, .25, 9, 14, 1, .9, .7, .9);
      for (let k = 0; k < 20; k++) fx.spawn(x + (rnd() - .5) * 6, y - rnd() * 2, z + (rnd() - .5) * 6, 0, -.5, 0, .3 + rnd() * .9, .25, .1, 1, 1, .9, 1);
      const d = cam.distanceTo(_c.set(x, y, z));
      sfx.burst(x, y, z, d);
      if (d < 30) shake(.08 + .3 * (1 - d / 30));
      for (const a of agents) if (a.police) a.flinch = .6;
    } else if (e.k === 'shot') {
      const cop = agents[SIM.NP + e.c];
      const x0 = OX + e.x0, z0 = OZ + e.z0 + .45, x1 = OX + e.x1, z1 = OZ + e.z1;
      cop.recoil = .25;
      balls.fire(x0, 1.45, z0, x1, 1.1 + rnd() * .3, z1, SIM.SHOT_T);
      sfx.shot(x0, z0);
      for (let k = 0; k < 4; k++) puffs.spawn(x0, 1.45, z0 + .2, (rnd() - .5) * .4, .3, .5, .6, .15, .5, .9, .9, .9, .5, 2);
    } else if (e.k === 'impact') {
      sfx.poc(OX + e.x, 1.2, OZ + e.z);
    } else if (e.k === 'smoke') {
      cans.push({ x0: OX + e.x0, z0: OZ + e.z0 + .3, x1: OX + e.x, z1: OZ + e.z, t: 0, fl: e.fl });
    } else if (e.k === 'cloud') {
      clouds.push({ x: OX + e.x, z: OZ + e.z, t: 0 });
      sfx.smoke(OX + e.x, OZ + e.z);
    }
  }

  // ---------- the player's part: a shove, a ball, the smoke ----------
  let localShotT = 5, hitCool = 0, coughT = 0, blur = 0, smokeToast = 0, veil = null, pushToast = 0;
  function setVeil(k) {
    if (!veil) {
      veil = document.createElement('div');
      Object.assign(veil.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', background: 'rgba(236,236,230,0)', transition: 'none' });
      document.body.appendChild(veil);
    }
    veil.style.display = k > .01 ? 'block' : 'none';
    if (k > .01) { veil.style.background = `rgba(236,236,230,${(k * .55).toFixed(3)})`; veil.style.backdropFilter = veil.style.webkitBackdropFilter = `blur(${(k * 7).toFixed(1)}px)`; }
  }
  function hitMe(player, b, nx, nz) {
    if (hitCool > 0) return;
    hitCool = 1.2;
    player.vel.x += nx * 6; player.vel.z += nz * 6; player.vel.y = Math.max(player.vel.y, 2.6);
    sfx.poc(0, 0, 0, true); sfx.poc(b.x, b.y, b.z);
    shake(.18);
    ui?.toast(HITS[Math.floor(rnd() * HITS.length)], false, 2200);
    balls.bounce(b, -nx, -nz);
  }

  // ---------- the gate ----------
  const gateIt = { id: 'lycee', pos: new THREE.Vector3(OX, 1.1, OZ + 4.4), reach: 3.2 };
  const doorIt = { id: 'lycee', door: true, pos: new THREE.Vector3(OX, 1.1, OZ + 8.8), reach: 2.6 };
  interactables.push(gateIt, doorIt);

  let indoorNow = false;
  const stats = { mortar: 0, burst: 0, shot: 0, impact: 0, smoke: 0, cloud: 0, shove: 0 };
  let active = null, t = 0, frame = 0, lastBeat = -1, crackleT = 0, sawFirst = false;
  const mood = (m, tau) => tau < 4 || tau >= SIM.E - SIM.SETTLE ? 'chant' : !m ? 'chant' : m.kind === 'surge' ? 'hoot' : m.kind === 'mill' ? 'chant' : 'murmur';
  const crowdAt = { x: OX, z: OZ + 1.5 }, policeAt = { x: OX, z: OZ + SIM.LINE_Z };
  // indoors (the village's rooms, the neighbours'): the street is muffled
  let rooms = null;
  const inside = (p) => { if (!rooms) { rooms = []; parent.traverse(o => { if (o.userData.inner?.box) rooms.push(o.userData.inner.box); }); } return rooms.some(b => b.containsPoint(p)) || !!insideOf?.(p); };

  return {
    lycee, sim, sfx, stats,
    get active() { return !!active; },
    get agents() { return agents; },
    get built() { return built; },
    center: new THREE.Vector3(OX, 0, OZ + 1),
    prompt(near) {
      if (near === gateIt) return active ? 'le lycée est bloqué · blocus en cours, personne n\'entre' : 'le portail du lycée · ouvert, la cour est libre';
      if (near === doorIt) return '<b>e</b> la porte du lycée';
      return undefined;
    },
    act(near) {
      if (near === gateIt) { ui?.toast(active ? 'pas moyen de passer : le portail est bloqué par les poubelles et les palettes' : 'la cour est ouverte · entre donc', active, 2400); return true; }
      if (near === doorIt) { ui?.toast('fermé · les cours ont lieu… ailleurs, aujourd\'hui', false, 2400); return true; }
      return false;
    },
    // the whole scene, once a frame. now: the shared clock (s); mode: the tunable; hour, day: game time
    update(dt, camera, { here = 'home', view = here, can = true, player = null, now, mode = -1, hour = 12, day = 0, night = 0 }) {
      t += dt; frame++;
      hitCool = Math.max(0, hitCool - dt);
      const on = SIM.blocusOn(mode, hour, day);
      if (on !== active) {
        active = on; lycee.setBlocked(on); root.visible = on;
        if (!on) { balls.clear(); fx.clear(); puffs.clear(); rockets.length = 0; cans.length = 0; clouds.length = 0; }
      }
      lycee.setNight(night);
      camera.getWorldPosition(_c);
      const home = here === 'home' && view === 'home';
      const dx = _c.x - OX, dz = _c.z - (OZ + 1), dist = Math.hypot(dx, dz);
      lycee.update(dt, home && dist < 90);
      // the sound: only at home, fading with distance, muffled indoors and underground
      if (home && active && dist < 220 && (navigator.userActivation?.hasBeenActive ?? true)) sfx.ensure();
      const m = active ? SIM.moveAt(sim.plan || SIM.makePlan(SEED, 0), sim.tau) : null;
      if ((frame & 7) === 0) indoorNow = home && active && dist < 220 && inside(_c);
      const muffle = _c.y < -1.5 ? Math.max(260, 700 + _c.y * 8) : indoorNow ? 650 : 16000;
      sfx.update(dt, camera, { active: home && active && dist < 220, crowdAt, policeAt, mood: mood(m, sim.tau), muffle });
      if (!home || !active) { setVeil(blur = 0); return; }
      if (dist > 200) { root.visible = false; return; }
      root.visible = true;
      if (!built) build();
      // the passers-by of the back lane turn round before the police line
      if (walkers) for (const w of walkers.people) {
        if (w.mode !== 'walk' || w.pts.length !== 2 || Math.abs(w.pts[0].z - OZ + 2.6) > 1) continue;
        const x = w.g.position.x - OX;
        if ((x > -18 && x < -15 && w.dir > 0) || (x > 15 && x < 18 && w.dir < 0)) w.dir = -w.dir;
      }
      // the script up to now
      events.length = 0;
      const frac = Math.min(1, Math.max(0, sim.advanceTo(now, events)));
      for (const e of events) play(e, _c);
      if (!sawFirst && dist < 45) { sawFirst = true; ui?.hint('un blocus devant le lycée · attention aux balles en mousse et aux fumées', 5000); }
      const px = player?.pos.x ?? 1e9, pz = player?.pos.z ?? 1e9, py = player?.pos.y ?? 0;
      const lx = px - OX, lz = pz - OZ;
      // ---------- the bodies ----------
      const plan = sim.plan, tau = sim.tau, adv = sim.advance;
      const beat = SIM.banging(plan, tau) ? Math.floor(t * 2.2) : -1;
      if (beat >= 0 && beat !== lastBeat) { sfx.bang(OX, OZ + SIM.LINE_Z + adv); for (const a of agents) if (a.shield) a.bang = .18; }
      lastBeat = beat;
      const k = 1 - Math.exp(-dt * 10);
      const chant = mood(m, tau) === 'chant', hoot = mood(m, tau) === 'hoot';
      let n = 0;
      for (const a of agents) {
        const i = a.i;
        // where the script has them (between its last two steps), smoothed; nudged by me (locally)
        const sx = sim.ox[i] + (sim.px[i] - sim.ox[i]) * frac, sz = sim.oz[i] + (sim.pz[i] - sim.oz[i]) * frac;
        const ox = a.x, oz = a.z;
        a.x += (sx - a.x) * k; a.z += (sz - a.z) * k;
        const ex = lx - (a.x + a.offX), ez = lz - (a.z + a.offZ), ed = Math.hypot(ex, ez);
        if (ed < .7 && py < 1.6 && py > -.5) {
          const nx = ex / (ed || 1), nz = ez / (ed || 1), f = 1 - ed / .7;
          // they give a little, and shove back
          a.offX -= nx * f * .03; a.offZ -= nz * f * .03;
          if (player && can) {
            const sp = Math.hypot(sim.vx[i], sim.vz[i]), push = (a.police ? 26 : 16) + sp * 8;
            player.vel.x += nx * push * f * dt * 6; player.vel.z += nz * push * f * dt * 6;
            if (f > .25 && pushToast <= 0) { pushToast = 8; stats.shove++; ui?.toast(a.police ? 'on ne passe pas ! le cordon te repousse' : 'ça bouscule !', false, 1400); }
          }
        }
        a.offX *= Math.exp(-dt * 1.2); a.offZ *= Math.exp(-dt * 1.2);
        const wx = OX + a.x + a.offX, wz = OZ + a.z + a.offZ;
        a.g.position.set(wx, 0, wz);
        const vx = (a.x - ox) / Math.max(dt, 1e-3), vz = (a.z - oz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
        a.sp += (Math.min(sp, 6) - a.sp) * Math.min(1, dt * 8);
        const d2 = (wx - _c.x) * (wx - _c.x) + (wz - _c.z) * (wz - _c.z);
        // facing: where they go, else the other side
        const want = a.sp > .5 ? Math.atan2(vx, vz) : a.police ? 0 : Math.PI + Math.sin(a.ph + t * .3) * .3;
        let dy = want - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        a.yaw += dy * Math.min(1, dt * 6);
        a.g.rotation.y = a.yaw;
        blobs.setMatrixAt(n++, m4.makeTranslation(wx, .045, wz));
        if (d2 > 140 * 140) { a.g.visible = false; continue; }
        a.g.visible = true;
        a.rig.mesh.castShadow = d2 < 20 * 20;
        // pose: down on their bum, running with arms up, or their role
        const st = a.rig.st;
        if (!a.police) {
          const down = sim.down[i] > 0, fleeing = sim.flee[i] > 0;
          if (down && !a.sat) { a.sat = true; a.rig.play('assis'); }
          else if (!down && a.sat) { a.sat = false; a.rig.stop(); }
          st.speed = a.sat ? 0 : a.sp;
          const pump = chant ? Math.max(0, Math.sin(t * Math.PI / .9 + a.ph)) : hoot ? Math.max(0, Math.sin(t * 7 + a.ph)) : 0;
          st.hands = fleeing && a.role !== 'sign' ? [2, 2] : a.role === 'sign' ? [0, 2] : a.role === 'banner' ? [1.3, 1.3] : a.role === 'drum' ? [.9, .9] : [0, pump > .5 ? 1.6 + pump * .4 : 0];
        } else {
          st.speed = a.sp;
          a.flinch = Math.max(0, (a.flinch || 0) - dt); a.bang = Math.max(0, (a.bang || 0) - dt); a.recoil = Math.max(0, (a.recoil || 0) - dt);
          st.hands = a.role === 'launcher' ? [.55, .7] : [1, 0];
          if (a.shield) a.shield.position.z = .42 + a.bang * 1.1 - a.flinch * .1;
          if (a.gun) a.gun.rotation.x = -a.recoil * 1.6;
          a.g.rotation.x = -a.flinch * .12;
        }
        // near: every frame; further: now and then
        a.acc += dt;
        const every = d2 < 35 * 35 ? 1 : d2 < 80 * 80 ? 2 : 4;
        if ((frame + i) % every === 0) { a.rig.update(a.acc); a.acc = 0; }
      }
      blobs.count = n; blobs.instanceMatrix.needsUpdate = true;
      // the banners, stretched between their holders (dropped if they're parted)
      for (const b of banners) {
        const A = b.a.g.position, B = b.b.g.position, bx = B.x - A.x, bz = B.z - A.z, d = Math.hypot(bx, bz);
        const ok = d > .8 && d < 3.6 && !b.a.sat && !b.b.sat && sim.flee[b.a.i] <= 0 && sim.flee[b.b.i] <= 0;
        b.g.visible = ok;
        if (!ok) continue;
        b.g.position.set((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
        b.g.rotation.y = Math.atan2(-bz, bx);
        b.cloth.scale.x = d - .1; b.poles[0].position.x = -d / 2; b.poles[1].position.x = d / 2;
        if (d2c(b.g.position) < 60 * 60) {
          const p = b.geo.attributes.position;
          for (let q = 0; q < p.count; q++) { const x0 = b.base[q * 3]; p.setZ(q, Math.sin(t * 3 + x0 * 5) * .06 * (1 - Math.abs(x0) * 1.6)); }
          p.needsUpdate = true;
        }
      }
      // ---------- fires ----------
      const flick = .75 + Math.sin(t * 17) * .12 + Math.sin(t * 29 + 1) * .08;
      glowMat.opacity = (.35 + night * .35) * flick;
      for (const f of lycee.fires) {
        const x = OX + f.x, z = OZ + f.z;
        for (let q = 0; q < 2; q++) fx.spawn(x + (rnd() - .5) * .35, f.y, z + (rnd() - .5) * .35, (rnd() - .5) * .3, 1.2 + rnd() * .9, (rnd() - .5) * .3, .45 + rnd() * .35, .7, .15, 1, .45 + rnd() * .35, .12, .9, .5, -1);
        if (rnd() < dt * 3) fx.spawn(x, f.y + .2, z, (rnd() - .5) * .8, 2.5 + rnd() * 2, (rnd() - .5) * .8, 1 + rnd(), .08, .04, 1, .7, .3, 1, .3, 1.5);
        fx.spawn(x, f.y + .3, z, 0, 0, 0, dt * 1.5, 2.4 * flick, 2.4, 1, .55, .2, .22 + night * .15);
        if (rnd() < dt * 4) puffs.spawn(x, f.y + .8, z, (rnd() - .5) * .3 + .15, .8 + rnd() * .4, (rnd() - .5) * .3, 4 + rnd() * 2, .5, 2.6, .22, .2, .2, .5, .1, -.05);
      }
      crackleT -= dt;
      if (crackleT <= 0) { crackleT = .25 + rnd() * .5; const f = lycee.fires[Math.floor(rnd() * lycee.fires.length)]; if (dist < 40) sfx.crackle(OX + f.x, f.y, OZ + f.z); }
      // ---------- rockets on their way up ----------
      for (let q = rockets.length - 1; q >= 0; q--) {
        const r = rockets[q]; r.t += dt;
        const u = Math.min(1, r.t / r.fl), e = 1 - (1 - u) * (1 - u);
        const x = r.x0 + (r.x1 - r.x0) * u, y = r.y0 + (r.y1 - r.y0) * e, z = r.z0 + (r.z1 - r.z0) * u;
        fx.spawn(x, y, z, 0, 0, 0, .08, .5, .3, 1, .9, .6, 1);
        for (let s = 0; s < 3; s++) fx.spawn(x, y, z, (rnd() - .5) * 1.2, -1 - rnd(), (rnd() - .5) * 1.2, .35 + rnd() * .3, .16, .05, 1, .7 + rnd() * .2, .3, 1, 1, 2);
        if (u >= 1) rockets.splice(q, 1);
      }
      // ---------- canisters, clouds ----------
      for (let q = cans.length - 1; q >= 0; q--) {
        const c = cans[q]; c.t += dt;
        const u = Math.min(1, c.t / c.fl), x = c.x0 + (c.x1 - c.x0) * u, z = c.z0 + (c.z1 - c.z0) * u, y = 1.4 + Math.sin(u * Math.PI) * 3.5 - u * 1.3;
        puffs.spawn(x, y, z, 0, .2, 0, 1.2, .2, .7, .95, .95, .95, .6);
        if (u >= 1) cans.splice(q, 1);
      }
      let inSmoke = false;
      for (let q = clouds.length - 1; q >= 0; q--) {
        const c = clouds[q]; c.t += dt;
        c.x += .3 * dt; c.z += .12 * dt;
        const r = 1.2 + 3.4 * Math.min(1, c.t / 4);
        if (c.t < 11 && rnd() < dt * 14) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * r * .7; puffs.spawn(c.x + Math.cos(a) * rr, .3, c.z + Math.sin(a) * rr, (rnd() - .5) * .4 + .25, .25 + rnd() * .3, (rnd() - .5) * .4, 5 + rnd() * 2, 1.2, 4.5, .96, .96, .94, .75, .15, -.03); }
        if (c.t > 17) { clouds.splice(q, 1); continue; }
        if (c.t < 15 && Math.hypot(px - c.x, pz - c.z) < r * .85 && py < 3) inSmoke = true;
      }
      // ---------- the player: in the smoke, in the line of fire ----------
      blur += ((inSmoke ? 1 : 0) - blur) * Math.min(1, dt * (inSmoke ? 1.5 : .6));
      setVeil(can ? blur : 0);
      if (inSmoke && can) {
        coughT -= dt;
        if (coughT <= 0) { coughT = 1.3 + rnd() * 1.2; sfx.cough(); }
        if (smokeToast <= 0) { smokeToast = 20; ui?.toast('kof kof… une fumée blanche : ça ne fait rien, mais on n\'y voit plus', false, 2600); }
      }
      smokeToast = Math.max(0, smokeToast - dt); pushToast = Math.max(0, pushToast - dt);
      const inZone = can && lx > -12.5 && lx < 12.5 && lz > SIM.LINE_Z + adv + .6 && lz < 5 && py < 2;
      if (inZone) {
        localShotT -= dt;
        if (localShotT <= 0) {
          // the nearest launcher takes aim at me (only I see this one)
          localShotT = 4 + rnd() * 5;
          let best = null, bd = 1e9;
          for (const c of SIM.LAUNCHERS) { const a = agents[SIM.NP + c], d = Math.hypot(a.g.position.x - px, a.g.position.z - pz); if (d < bd) { bd = d; best = a; } }
          if (best && bd < 18) {
            const x0 = best.g.position.x, z0 = best.g.position.z + .45, vxp = player.vel.x * .3, vzp = player.vel.z * .3;
            balls.fire(x0, 1.45, z0, px + vxp, py + 1.1, pz + vzp, Math.max(.2, bd / 30), true);
            best.recoil = .25; sfx.shot(x0, z0);
          }
        }
      } else localShotT = Math.max(localShotT, 2.5);
      balls.update(dt);
      if (player && can) for (const b of balls.B) {
        if (!b.on || b.hit) continue;
        const ex = b.x - px, ez = b.z - pz, ey = b.y - py;
        if (ey > .1 && ey < 1.85 && ex * ex + ez * ez < .38 * .38) {
          b.hit = true;
          const d = Math.hypot(ex, ez) || 1;
          const vx = b.free ? b.vx : b.x1 - b.x0, vz = b.free ? b.vz : b.z1 - b.z0, vl = Math.hypot(vx, vz) || 1;
          hitMe(player, b, vx / vl * .8 - ex / d * .2, vz / vl * .8 - ez / d * .2);
        }
      }
      // the points: size in pixels at 1 m
      const h = renderer ? renderer.getDrawingBufferSize(_v).y : innerHeight;
      const scale = camera.projectionMatrix.elements[5] * h * .5;
      fx.update(dt, scale); puffs.update(dt, scale);
    },
    // for tests: the nearest launcher aims at me now (if I'm in front of the line)
    testShot() { localShotT = 0; },
    dispose() { veil?.remove(); sfx.close(); },
  };
  function d2c(p) { return (p.x - _c.x) * (p.x - _c.x) + (p.z - _c.z) * (p.z - _c.z); }
}
