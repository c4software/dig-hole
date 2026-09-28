// main.js, boot + state machine: attract → swoop → play ⇄ panels, the van, the bottom, China.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createTerrain, ORE, isOre, isLetter, S, setGrassColors, WATER, LAVA } from './terrain.js';
import { createPlayer } from './player.js';
import { createShovel, createDebris, createHeart, createDrill } from './tool.js';
import { createAudio } from './audio.js';
import { createEconomy, UPGRADES, ORDER, CHINA_ORDER, ITEMS, SLOTS } from './economy.js';
import { createUI } from './ui.js';
import { CHINA } from './china.js';
import { ACH_LIST } from './house.js';
import { createDelivery, STORES } from './delivery.js';
import { createFinds } from './finds.js';
import { createBombs, BLAST } from './bombs.js';
import { createMoles } from './moles.js';
import { createElevator } from './elevator.js';
import { createNet } from './net.js';
import { createPlane } from './plane.js';
import { createAnimals, ANIMAL } from './animals.js';
import { createHologram } from './hologram.js';
import { createPad } from './teleport.js';
import { createLadders, LADDER_H } from './ladders.js';
import { createMaps } from './map.js';
import { createMoonPlayer } from './moonplayer.js';
import { createRocket, PARTS } from './rocket.js';
import { createMiniGames, GAMES, fmtRecord } from './minigames.js';
import { createKart } from './kart.js';
import { createRC } from './rcrace.js';
import { createJetski } from './jetski.js';
import { createCave, createTrapGuide, GUN_REGEN, slotAt } from './cave.js';
import { createPartCompass } from './compass.js';
import { createBatballons } from './batballons.js';
import { createCanards } from './canards.js';
import { createBagarre } from './bagarre.js';
import { createEmpile } from './empile.js';
import { createBallons } from './ballons.js';
import { createMoto } from './moto.js';
import { createBomber } from './bomber.js';
import { createPortals } from './portal.js';
import { createOrgan, createDiscLauncher, createBats, createReliquary, SONGS } from './church.js';
import { createNes } from './nes.js';
import { createEncre } from './encre.js';
import { createWorms } from './worms.js';
import { createPotato } from './potato.js';
import { createSurvie } from './survie.js';
import { createTycoon } from './tycoon.js';
import { createInvaders } from './invaders.js';
import { createShooter } from './spaceshooter.js';
import { createOrgue } from './orgue.js';
import { createWorms3d } from './worms3d.js';
import { createCrypt, inChurchDig, DIG, cutDig } from './crypt.js';
import { createComic } from './comic.js';
import { createPvz } from './pvz.js';
import { createMarioPortal } from './marioportal.js';
import { createMarioCabinet } from './marioportal-cab.js';
import { createPainkiller } from './painkiller.js';
import { initMenus } from './menufx.js';
import { createGamepad } from './gamepad.js';
import { createTouch } from './touch.js';
import { createKeyQuest } from './gameroom.js';
import { createReveal } from './vrreveal.js';
import { createSpaceArcade, spaceWorld, HALL_DIR } from './spacearcade.js';
import { createSpaceRace, DECK_DIR } from './spacerace.js';
import { createPodrace } from './podrace.js';

const REACH = 3.2;
const params = new URLSearchParams(location.search);
const MULTI = params.has('room');
// exploration: solo, and everything unlimited
const EXPLORE = !MULTI && params.get('mode') === 'explore';
const MODE = MULTI ? 'multi' : EXPLORE ? 'explore' : 'solo';
const loadBar = document.getElementById('load-bar');
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

const LETTERS = {
  1: 'Bienvenue chez vous.\n\nLe jardin est à vous, le trou aussi. J\'ai commencé à creuser il y a trente ans. Il y a quelque chose, tout au fond. Je l\'ai entendu battre.\n\nMéfiez-vous des taupes.\n\n— l\'ancien propriétaire',
  2: '30 mètres.\n\nLes taupes sont plus grosses que je ne le pensais. Elles volent tout ce qui brille. Frappez-les avant qu\'elles ne replongent, sinon adieu le butin.',
  3: '60 mètres.\n\nJ\'ai acheté des bombes. Le voisin s\'est plaint. Le granit, lui, ne s\'est pas plaint. Il n\'y a plus de granit.',
  4: '90 mètres.\n\nJe le vois presque. Doré. Trois taupes casquées montent la garde. Si vous lisez ceci, c\'est que je n\'ai pas réussi.\n\nFinissez le trou. Et dites bonjour au Japon de ma part.',
};

const RECIPES = [
  { id: 'c_dyn', name: '2 dynamites', need: { 21: 4, 20: 2 }, item: 'dyn', n: 2 },
  { id: 'c_med', name: 'trousse de soin', need: { 20: 3, 22: 1 }, item: 'med', n: 1 },
  { id: 'c_cell', name: 'pile de secours', need: { 20: 2, 22: 2 }, item: 'cell', n: 1 },
  { id: 'c_sup', name: 'super bombe', need: { 23: 3, 24: 1 }, item: 'sup', n: 1 },
  { id: 'c_fus', name: 'fusée-foreuse', need: { 40: 2, 42: 1 }, item: 'fus', n: 1 },
  { id: 'helmet', name: 'casque de mineur', need: { 21: 5, 23: 2 }, perk: 'helmet', sub: 'morsures et explosions : moitié moins' },
  { id: 'detector', name: 'détecteur de trouvailles', need: { 22: 6, 25: 1 }, perk: 'detector', sub: 'bipe près des objets enfouis' },
  { id: 'sharp', name: 'pelle affûtée', need: { 25: 2, 23: 4 }, perk: 'sharp', sub: '+15 % de rayon de pelle' },
  { id: 'compass', name: 'boussole de fusée', need: { 21: 4, 22: 2 }, perk: 'compass', sub: 'indique au dixième de mètre la pièce de fusée la plus proche' },
  // the moon's own: made with what only the moon gives (at the lander, or on the bench once you've been)
  { id: 'm_grav', name: '2 gélules anti-gravité', need: { 50: 2, 51: 1 }, item: 'grav', n: 2, moon: true },
  { id: 'm_met', name: 'météore de poche', need: { 53: 1, 52: 2 }, item: 'met', n: 1, moon: true },
  { id: 'titan', name: 'pelle en titane lunaire', need: { 52: 5, 54: 1 }, perk: 'titan', sub: 'pelle : +20 % de rayon, coups plus rapides', moon: true },
  { id: 'icepack', name: 'recycleur à glace', need: { 50: 5, 51: 2 }, perk: 'icepack', sub: 'l\'oxygène dure deux fois plus longtemps', moon: true },
  { id: 'crystal', name: 'lampe à cristal lunaire', need: { 54: 3, 50: 2 }, perk: 'crystal', sub: 'la lumière porte 50 % plus loin sous terre', moon: true },
];

// ---------- boot ----------
const ui = createUI();
// the signs of the Japanese town are painted once, at start: wait (a little) for their font
try { await Promise.race([document.fonts.load('700 40px "Noto Sans JP"', '桜ひ'), new Promise(r => setTimeout(r, 3000))]); } catch {}
const world = createWorld(document.getElementById('app'));
const { renderer, scene, camera } = world;
world.shadows(scene);
loadBar.style.width = '20%';
await frame();

const eco = createEconomy(MULTI ? 'a-hole-multi-v2' : EXPLORE ? 'a-hole-explore-v1' : 'a-hole-save-v2', { unlimited: EXPLORE });
const MOON = new THREE.Vector3(-400, 0, 0);
const MARS = new THREE.Vector3(0, 0, -900);
// the two worlds you walk round on: a ball of voxels, gravity to its centre
const PLANET = { moon: MOON, mars: MARS };
const onPlanet = (w = here) => w === 'moon' || w === 'mars';
const terrains = {
  home: createTerrain(scene, { theme: 'home' }),
  china: createTerrain(scene, { theme: 'china', seed: 4242, ox: CHINA.x, oz: CHINA.z }),
  moon: createTerrain(scene, { theme: 'moon', seed: 777, ox: MOON.x, oy: MOON.y, oz: MOON.z }),
  mars: createTerrain(scene, { theme: 'mars', seed: 1971, ox: MARS.x, oy: MARS.y, oz: MARS.z }),
  // the ground under the church, with its crypt (see crypt.js)
  church: createTerrain(scene, { theme: 'church', seed: 1789, ox: DIG.ox, oz: DIG.oz }),
};
const finds = { home: createFinds(scene, terrains.home, 'home'), china: createFinds(scene, terrains.china, 'china'), moon: createFinds(scene, terrains.moon, 'moon'), mars: createFinds(scene, terrains.mars, 'mars') };
finds.home.hollow(); finds.china.hollow();
loadBar.style.width = '55%';
await frame();

const saved = eco.load();
if (!MULTI && saved && saved.t) {
  try { terrains.home.deserialize(saved.t); if (saved.tc) terrains.china.deserialize(saved.tc); }
  catch (e) { console.warn('save ignored', e); }
  // the planets keep only what was dug (an older, smaller moon is simply forgotten),
  // on the seeds the last super reset gave them
  if (eco.s.planetSeeds) for (const w of ['moon', 'mars']) terrains[w].reseed(eco.s.planetSeeds[w]);
  for (const [w, k] of [['moon', 'tm'], ['mars', 'tmars'], ['church', 'tch']]) if (saved[k]) try { terrains[w].deserialize(saved[k]); } catch (e) { console.warn(w + ' save ignored', e.message); }
}
for (const w of ['home', 'china']) for (const key of eco.s.finds[w] || []) finds[w].remove(key);
terrains.home.setFocus(new THREE.Vector3(...(eco.s.pos && eco.s.where !== 'china' ? eco.s.pos : [0, 0, -8])));
terrains.china.setFocus(new THREE.Vector3(CHINA.x, 0, CHINA.z - 8));
for (const w of ['moon', 'mars']) { terrains[w].setFocus(PLANET[w].clone().add(new THREE.Vector3(0, terrains[w].radius + 1, 0))); terrains[w].markAll(); }
terrains.home.rebuildAll(); terrains.china.rebuildAll();
terrains.church.setFocus(new THREE.Vector3(DIG.ox, -5, DIG.oz)); terrains.church.markAll();   // built a chunk a frame
loadBar.style.width = '100%';

let here = eco.s.where === 'china' && eco.s.china ? 'china' : 'home';   // never wake up on the moon: you'd have no air
// under the church, the church's own ground
const W = (p = player.pos) => here === 'home' && inChurchDig(p) ? 'church' : here;
const T = () => terrains[W()];
const player = createPlayer(camera, T, world.colliders);
const shovel = createShovel(camera);
const drill = createDrill(camera);
const debris = createDebris(scene);
// everything that belongs to the home garden lives in its group, hidden anywhere else
const homeRoot = world.homeDecor;
const heart = createHeart(homeRoot, terrains.home.heartPos);
const audio = createAudio();
const house = world.house;
// the secret cave behind the shed, and the portal gun waiting in it
const cave = createCave({ scene: homeRoot, colliders: world.colliders, interactables: world.interactables });
createMarioCabinet({ scene: homeRoot, colliders: world.colliders, interactables: world.interactables });
const portals = createPortals({ scene, camera, renderer: world.renderer, audio });
// the portal gun is a tool like the shovel and the drill: eco.s.tool === 'portal'
const gunOut = () => eco.s.tool === 'portal' && eco.s.portal;
const trapGuide = createTrapGuide();
const partCompass = createPartCompass();
// where the next rocket part is when none is left in this world
const WORLD_NAMES = { home: 'dans le potager', china: 'au japon' };
function partsElsewhere() {
  for (const w of ['home', 'china']) if (w !== W() && finds[w].list.some(f => !f.gone && f.def.kind === 'part' && !eco.s.parts[f.id])) return WORLD_NAMES[w];
  return null;
}
// the church: its organ for everyone, the launcher in the reliquary, the bats round the belfry
const CH = world.church;
// over the church's diggable ground, its own top is the floor: the flagstones and the shade decals give way
cutDig(CH.flagstones);
scene.traverse(o => { if (o.isMesh && o.userData.keep && o.material.isMeshBasicMaterial && o.material.transparent && o.material.color.getHex() === 0x1e1a30) cutDig(o.material); });
const organ = createOrgan({ parent: homeRoot, at: CH.organ, rot: -Math.PI / 2 });
world.colliders.push({ min: new THREE.Vector3(CH.organ.x, 0, CH.organ.z - 1.75), max: new THREE.Vector3(CH.organ.x + .9, 5.6, CH.organ.z + 1.75) });
world.colliders.push({ min: new THREE.Vector3(CH.organ.x - 1, 0, CH.organ.z - .95), max: new THREE.Vector3(CH.organ.x, 1, CH.organ.z + .95) });
world.interactables.push({ id: 'organ', pos: new THREE.Vector3(CH.organ.x - 1.3, 1.1, CH.organ.z), reach: 2 });
const reliquary = createReliquary({ parent: homeRoot, at: new THREE.Vector3(CH.altar.x, 0, CH.altar.z - .95) });
world.colliders.push({ min: new THREE.Vector3(CH.altar.x - .47, 0, CH.altar.z - 1.22), max: new THREE.Vector3(CH.altar.x + .47, .5, CH.altar.z - .68) });
world.interactables.push({ id: 'dgun', pos: new THREE.Vector3(CH.altar.x, .7, CH.altar.z - .95), reach: 1.8 });
const launcher = createDiscLauncher({ scene, camera, audio });
const bats = createBats({ scene: homeRoot, center: CH.tower });
// under the nave: the tomb that opens, the crypt, what's buried round it
const crypt = createCrypt({ scene: homeRoot, colliders: world.colliders, interactables: world.interactables, terrain: terrains.church, eco, ui, audio, organ, songs: SONGS, hooks: {
  unlock: (k) => unlock(k), save: () => save(), hasGame: (g) => !!RACES[g], offerGame: (g) => offerGame(g),
  goTo(pos, yaw, then) {
    ui.veil(1); audio.step();
    setTimeout(() => { player.pos.copy(pos); player.vel.set(0, 0, 0); player.yaw = yaw; player.pitch = 0; player.unstick(); ui.veil(0); then?.(); }, 450);
  },
  openVault(D) { applyOp({ k: 'box', w: 'church', i: D.i, j: D.j, kk: D.k, wd: D.w, h: D.h, d: D.d }); terrains.church.flush(); },
} });
finds.church = crypt.finds;
eco.s.finds.church = eco.s.finds.church || [];
if (eco.s.crypt?.vault) { const D = crypt.door; terrains.church.hollowBox(D.i, D.j, D.k, D.w, D.h, D.d); }
const DGUN_REGEN = 120;
// the organ: e plays the next piece, for everyone
let organSong = SONGS.length - 1;   // so the first press plays the toccata
function playOrgan(song, local, by = null) {
  organ.play(song, local ? 0 : .1);
  organSong = song;
  if (local) net?.sendFx({ k: 'organ', s: song });
  ui.toast((by ? `${by} joue de l'orgue · ` : '♪ ') + SONGS[song].name, false, 3200);
}
// every front door in both towns: e to open or shut it (for everyone)
for (const [w, list] of Object.entries(world.doors)) list.forEach((d, i) => world.interactables.push({ id: 'sdoor', w, i, pos: (d.mid || d.pos).clone(), reach: 1.9 }));
const doorOf = (it) => world.doors[it.w]?.[it.i];
function setDoor(w, i, open, local) {
  const d = world.doors[w]?.[i];
  if (!d || d.open === open) return;
  d.open = open; audio.step();
  if (local) net?.sendFx({ k: 'sdoor', w, i, o: open ? 1 : 0 });
}
house.room.noShadows();
// the key to upstairs: buried in the garden, where the map's seed says; exploration starts with it
const quest = createKeyQuest({ parent: house.group, terrain: terrains.home, camera });
if (EXPLORE) { eco.s.upKey = true; eco.s.portal = true; }
quest.place(eco.s.mapSeed ?? 1337);
quest.setDone(!!eco.s.upKey);
house.room.setUnlocked(!!eco.s.upKey);
// a VR headset under the bed, for the curious (vrreveal.js runs the show)
const reveal = createReveal({ scene, camera, renderer, world, audio });
const headset = reveal.headset();
headset.position.set(-3.98, 0, -20.95); headset.rotation.y = Math.PI / 2 - .35;
house.group.add(headset);
world.interactables.push({ id: 'vr', pos: new THREE.Vector3(-3.95, .1, -20.95), reach: 1.7, aim: .9 });
const delivery = createDelivery({ scene: homeRoot, label: world.label, interactables: world.interactables, getTerrain: () => terrains.home });
delivery.load(eco.s.delivery);
world.shadows(delivery.van);
const elevator = createElevator({ scene: homeRoot, terrain: terrains.home, colliders: world.colliders, interactables: world.interactables, label: world.label });
player.onStep = () => audio.step();
player.onLand = (v) => { audio.land(v); if (v > 18) hurt((v - 18) * 2.5); };

const HOME_SPAWN = new THREE.Vector3(0, 0.05, -11.5);
const BED_SPOT = new THREE.Vector3(-3.3, 0.05, -19.6);
if (eco.s.pos && !MULTI) { player.pos.fromArray(eco.s.pos); player.yaw = eco.s.yaw; player.pitch = eco.s.pitch; player.stats.away = cave.inside(player.pos); player.unstick(); }
else if (here === 'china') player.pos.copy(world.china.spawn);

function applyUpgrades() {
  player.stats.jump = eco.cur('boots').jump;
  player.stats.fuelMax = eco.cur('jet').fuel;
  player.stats.fuel = Math.min(player.stats.fuel, player.stats.fuelMax);
  player.stats.kite = eco.s.lv.kite > 0;
  shovel.setLevel(eco.s.lv.shovel);
  drill.setLevel(eco.s.lv.drill);
  if ((eco.s.tool === 'drill' && !eco.s.lv.drill) || (eco.s.tool === 'portal' && !eco.s.portal) || (eco.s.tool === 'disc' && !eco.s.discs)) eco.s.tool = 'shovel';
  elevator.setOwned(eco.s.lv.lift > 0);
  eco.s.battery = Math.min(eco.s.battery, eco.batteryMax);
  ui.setBag(eco.s.sackN, eco.cap);
  ui.setCoins(eco.s.money);
}
applyUpgrades();

// exploration: every tool at its best, China open, nothing to earn
function maxOut() {
  for (const k in UPGRADES) eco.s.lv[k] = UPGRADES[k].levels.length - 1;
  for (const k in ITEMS) eco.s.items[k] = ITEMS[k].max;
  for (const p of PARTS) eco.s.parts[p.id] = true;
  eco.s.money = 999999;
  eco.s.battery = eco.batteryMax; eco.s.health = 100;
}
if (EXPLORE) { eco.s.china = true; maxOut(); applyUpgrades(); }

// together: everyone starts with a random bundle of gear
let giftText = null;
if (MULTI && !eco.s.gifted) {
  eco.s.gifted = true;
  const r = Math.random;
  const lv = eco.s.lv, it = eco.s.items;
  lv.shovel = r() < .45 ? 0 : r() < .7 ? 1 : 2;
  lv.bag = Math.floor(r() * 3);
  lv.lamp = Math.floor(r() * 3);
  lv.boots = r() < .3 ? 1 : 0;
  lv.jet = r() < .12 ? 1 : 0;
  it.dyn = Math.floor(r() * 5); it.sup = Math.floor(r() * 3); it.med = 1 + Math.floor(r() * 2); it.cell = Math.floor(r() * 3);
  eco.s.money = Math.floor(r() * 40) * 10;
  applyUpgrades();
  eco.s.battery = eco.batteryMax;
  const got = ['shovel', 'bag', 'lamp', 'boots', 'jet'].filter(k => lv[k] > 0).map(k => UPGRADES[k].levels[lv[k]].name);
  for (const k of ['dyn', 'sup', 'cell']) if (it[k]) got.push(`${it[k]} ${ITEMS[k].name}`);
  if (eco.s.money) got.push(`${eco.s.money} ●`);
  giftText = 'équipement de départ : ' + (got.join(' · ') || 'une vieille bêche et beaucoup de courage');
}

// the neighbours with fur and feathers, outside the fences
const animals = {
  home: createAnimals(scene, {
    world: 'home', center: new THREE.Vector3(0, 0, 0),
    // the garden and the lawns around it; not the street, the village or the square
    blocked: (x, z) => z < -10.4 || Math.abs(x) > 40 || z > 45 || Math.hypot(x + 27, z - 30) < 6.5 || Math.hypot(x + 31, z - 40) < 3.5 || Math.hypot(x - 30, z - 39) < 4 || Math.hypot(x + 4, z - 34) < 4.6 || (Math.abs(x) < 10 && Math.abs(z) < 10) || (Math.abs(x) < 6.5 && z < -13.8 && z > -23)
      || (x > -4.6 && x < -1.8 && z > -12 && z < -10.4) || (x > 2 && x < 4.8 && z > -12.2 && z < -10.6),
    count: () => Math.round(7 * [1.5, 1, 1, .5][Math.max(0, seasonNow)] + (world.env.night > .5 ? 1 : 0)),
    isNight: () => world.env.night > .5,
  }),
  moon: createAnimals(scene, { world: 'moon', center: MOON.clone(), blocked: () => true, count: () => 0 }),
  mars: createAnimals(scene, { world: 'mars', center: MARS.clone(), blocked: () => true, count: () => 0 }),
  china: createAnimals(scene, {
    world: 'china', center: CHINA.clone(),
    // the Japanese town: out on the streets, the station plaza and the shrine, nowhere else
    blocked: (x, z) => {
      const lx = x - CHINA.x, lz = z - CHINA.z;
      const open = (lx > 10 && lx < 42 && lz > -15 && lz < -4.5) || (lx > 45.8 && lx < 54.2 && lz > -8 && lz < 8)
        || (lz > 9.6 && lz < 20.2 && Math.abs(lx) < 80) || (lx > -20 && lx < -10 && lz > -24 && lz < 60);
      return !open;
    },
    count: () => 5,
    isNight: () => world.env.night > .5,
  }),
};
// two pads: the corner of the house, and a corner of the Japanese lot
const pads = {
  home: createPad(scene, new THREE.Vector3(-4.3, 0.012, -16.4), world.label, 'téléporteur · japon'),
  // in the back corner of the konbini
  china: createPad(scene, new THREE.Vector3(CHINA.x + 3.6, 0.045, CHINA.z - 18.3), world.label, 'téléporteur · maison'),
};
let padCool = 0;
const hologram = createHologram({ scene: homeRoot, at: new THREE.Vector3(3.2, 3.05, -15.9), label: world.label });

// ---------- time: days of 6 minutes, two days a season ----------
const DAY = 360;
const SEASONS = [
  { name: 'printemps', sub: 'tout repousse · les animaux sortent' },
  { name: 'été', sub: 'le soleil recharge la batterie plus vite' },
  { name: 'automne', sub: 'foire aux minerais : +25 % à la vente' },
  { name: 'hiver', sub: 'il gèle · on ne guérit plus dehors' },
];
const GRASS_HOME = [0x78ac4c, 0x9cb44c, 0xb09c4a, 0xeef2f6], GRASS_CHINA = [0x98a462, 0xa2a85c, 0xb0a062, 0xeef2f6];
let seasonNow = -1, clockTxt = '', lootDay = -1;
const clockEl = document.getElementById('clock'), clockTxtEl = document.getElementById('clock-txt');
function clockNow() { return MULTI ? (Date.now() / 1000) % (DAY * 8) : eco.s.clock; }
function updateClock(dt) {
  if (!MULTI && state !== 'attract') eco.s.clock += dt;
  const c = clockNow();
  const hour = (c % DAY) / DAY * 24;
  const day = Math.floor(c / DAY);
  const season = Math.floor(day / 2) % 4;
  if (season !== seasonNow) {
    world.setSeason(season);
    setGrassColors(GRASS_HOME[season], GRASS_CHINA[season]);
    terrains.home.rebuildTop(); terrains.china.rebuildTop();
    if (seasonNow !== -1 && state !== 'attract') { ui.layer(SEASONS[season].name, SEASONS[season].sub); audio.win(); }
    seasonNow = season;
  }
  if (day >= 8) unlock('year');
  if (day !== lootDay) { if (lootDay !== -1) world.neighbours.restock(); lootDay = day; }
  // the grand prix is always raced in broad daylight; the garden's clock keeps turning meanwhile
  // the menu and the grand prix are always seen in broad daylight; the garden's clock keeps turning
  world.setTime(state === 'attract' || state === 'kart' || (state === 'paused' && pausedFrom === 'kart') ? 13 : hour);
  house.setNight(world.env.night);
  const txt = `${SEASONS[season].name} · jour ${day + 1} · <b>${String(Math.floor(hour)).padStart(2, '0')}h</b>`;
  if (txt !== clockTxt) { clockTxt = txt; clockTxtEl.innerHTML = txt; clockEl.classList.toggle('night', world.env.night > .5); }
}

house.drawBoard(eco.s.ach);
for (const id in eco.s.found) house.showTrophy(+id);
heart.setPortal(eco.s.portal);

const ladders = createLadders(scene);
if (!MULTI) ladders.load(eco.s.ladders);

// ---------- ground changes: every one goes through here, and out to the room ----------
let net = null;
function applyOp(op, local = true) {
  const t = terrains[op.w];
  let out = null;
  if (op.k === 'carve') {
    let space = op.space;
    out = t.carve(new THREE.Vector3(...op.c), op.r, op.tier, (m) => isLetter(m) || space-- > 0, op.destroy);
  } else if (op.k === 'box') t.hollowBox(op.i, op.j, op.kk, op.wd, op.h, op.d);
  else if (op.k === 'reset') { if (op.all) superReset(op.seed); else resetMap(op.seed, false); }
  else if (op.k === 'ladder') ladders.add(op.l);
  else if (op.k === 'moonportal') { eco.s.moonPortal = true; }
  else if (op.k === 'unladder') ladders.remove(op.id);
  else if (op.k === 'find') {
    const f = finds[op.w].remove(op.key);
    if (!local && f && !(eco.s.finds[op.w] = eco.s.finds[op.w] || []).includes(op.key)) eco.s.finds[op.w].push(op.key);
    // a rocket part dug up by anyone in the garden is everyone's: one rocket for the room
    if (!local && f?.def.kind === 'part') gainPart(f.id);
  }
  if (local && net) net.sendOp(op);
  return out;
}

// ---------- state ----------
let state = 'attract';
let digging = false;
let swoop = 1;
let panelKind = null, panelTab = 'amazone';
let waterT = 0;
let chargeT = 0, idleT = 0, shakeT = 0, regenT = 0, moleT = 20, detectT = 0;
let guardiansUp = false;
const swoopFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
const hinted = new Set();
const hintOnce = (key, text, ms) => { if (hinted.has(key)) return; hinted.add(key); ui.hint(text, ms); };
const down = new Set();
addEventListener('keydown', (e) => down.add(e.code));
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

const resetBtn = document.getElementById('reset');
if (eco.hasSave()) resetBtn.classList.remove('hidden');
setTimeout(() => ui.el.load.classList.add('gone'), 200);

function lockPointer() {
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
}
// a way back into the game when the pointer couldn't be taken without a click
function relock() { lockPointer(); }

// the pause menu opens only when asked for (P, or Escape once the mouse is free);
// losing the mouse (alt-tab, a notification, a panel closing) just asks for a click
const relockEl = document.getElementById('relock');
let pausedFrom = 'play';
function openPause() {
  if (state !== 'play' && state !== 'drive' && state !== 'kart') return;
  if (state === 'drive') exitVan();
  pausedFrom = state === 'kart' ? 'kart' : 'play';
  state = 'paused'; digging = false; throwing = false;
  player.disable();
  ui.el.resume.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  save();
}

// ---------- attract: solo or together ----------
const modeBtns = document.querySelectorAll('.m-opt');
const multiForm = document.getElementById('multi-form');
const nickIn = document.getElementById('nick');
let wantMode = MODE;
function setMode(m) {
  wantMode = m;
  modeBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  multiForm.classList.toggle('hidden', m !== 'multi');
  document.getElementById('play-sub').textContent = { solo: 'solo · ta sauvegarde', explore: 'exploration · tout illimité', multi: 'à plusieurs · le jardin commun' }[m];
}
try { nickIn.value = params.get('name') || localStorage.getItem('a-hole-nick') || ''; } catch {}
setMode(MODE);
modeBtns.forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); setMode(b.dataset.mode); }));
multiForm.addEventListener('click', (e) => e.stopPropagation());
multiForm.addEventListener('submit', (e) => { e.preventDefault(); start(); });

function start() {
  // switching mode reloads into the other world
  if (wantMode !== MODE) {
    if (wantMode === 'multi') {
      const nick = nickIn.value.trim() || 'creuseur';
      try { localStorage.setItem('a-hole-nick', nick); } catch {}
      // one garden for everyone
      location.search = '?room=jardin&name=' + encodeURIComponent(nick) + '&go=1';
    } else location.search = wantMode === 'explore' ? '?mode=explore&go=1' : '?go=1';
    return;
  }
  audio.init();
  if (settings.full) goFull(true);
  ui.el.attract.classList.add('hidden');
  ui.el.hud.classList.remove('hidden');
  swoopFrom.p.copy(camera.position);
  swoopFrom.q.copy(camera.quaternion);
  swoop = 0;
  state = 'play';
  player.enable();
  lockPointer();
  if (EXPLORE) setTimeout(() => ui.hint('exploration : tout est illimité · jetpack, bombes, pelle en jade… amuse-toi', 7000), 1500);
  else if (giftText) setTimeout(() => { ui.hint(giftText, 7000); giftText = null; }, 1500);

  else if (!eco.s.upKey) setTimeout(() => hintOnce('key', 'une clef est enterrée dans le potager : suis le thermomètre en bas à droite · clic gauche pour creuser', 7000), 1400);
  else if (eco.s.best < 0.5) setTimeout(() => hintOnce('dig', 'clic gauche pour creuser · e pour interagir · la maison est ouverte', 6000), 1400);
  // the portal gun is put away between two visits: say where it is
  if (eco.s.portal && !gunOut()) setTimeout(() => hintOnce('portaltool', 'molette ou x : changer d\'outil · le pistolet à portails est avec la pelle', 6000), 9000);
}
document.getElementById('play').addEventListener('click', start);
resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (resetBtn.dataset.armed) { eco.wipe(); location.reload(); return; }
  resetBtn.dataset.armed = '1';
  resetBtn.textContent = 'sûr ? cliquer encore';
  setTimeout(() => { delete resetBtn.dataset.armed; resetBtn.textContent = 'tout recommencer'; }, 3000);
});
ui.el.resume.addEventListener('click', (e) => {
  if (e.target.closest('#settings, #set-title, #set-quit, .set-keys')) return;
  ui.el.resume.classList.add('hidden'); state = pausedFrom; pausedFrom = 'play';
  if (state === 'play') player.enable();
  if (!race?.screen) lockPointer();
});

// the mouse let go while playing (Escape, alt-tab): straight to the pause menu.
// Every other way out of the lock (a panel, the bottom, a trip…) changes the state first.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  digging = false; throwing = false;
  if ((state === 'play' || state === 'drive' || (state === 'kart' && !race?.screen)) && !window.__dig?.test) openPause();
  else if (state === 'play' || state === 'drive') save();
});

addEventListener('contextmenu', (e) => { if (state !== 'attract') e.preventDefault(); });
addEventListener('mousedown', (e) => {
  // a game started on its own (after a change of mode) gets its sound at the first click
  if (state !== 'attract') audio.init();
  // a click on the game while the mouse is free just takes it back
  if ((state === 'play' || state === 'drive' || (state === 'kart' && !race?.screen)) && !document.pointerLockElement && e.target === renderer.domElement) { lockPointer(); return; }
  if (state === 'kart' && race && !race.screen) { race.mod.press?.(e.button, true); return; }
  if (state !== 'play') return;
  if (gunOut() && !mg.armed && (e.button === 0 || e.button === 2)) { shootPortal(e.button === 0 ? 0 : 1); return; }
  if (eco.s.tool === 'disc' && eco.s.discs && !mg.armed && e.button === 0) { fireDisc(); return; }
  if (e.button === 0) digging = true;
  if (e.button === 2) { throwing = true; throwT = THROW_EVERY; useItem(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) digging = false; if (e.button === 2) throwing = false; if (state === 'kart') race?.mod.press?.(e.button, false); });
addEventListener('mousemove', (e) => { if (state === 'kart' && race?.mod.look && document.pointerLockElement) race.mod.look(e.movementX, e.movementY); });
// right button held: explosives keep coming, one every THROW_EVERY seconds
const THROW_EVERY = 0.35;
let throwing = false, throwT = 0;
const EXPLOSIVES = new Set(['dyn', 'sup', 'fus', 'met']);
addEventListener('wheel', () => { if (state === 'play' && (eco.s.lv.drill || eco.s.portal || eco.s.discs) && (!onPlanet() || eco.s.portal || eco.s.discs)) switchTool(); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.repeat || e.target.closest?.('input, textarea')) return;
  if (state === 'drive') {
    if (e.code === 'KeyE') exitVan();
    if (e.code === 'Space') audio.horn();
    return;
  }
  if (e.code === 'KeyE') {
    if (state === 'panel' || state === 'read') closePanel();
    else if (state === 'play' && mg.active === 'pile' && here === 'home') mg.validate(Math.max(0, -player.pos.y));
    else if (state === 'play' && near) interact(near);
  }
  if (e.code === 'Escape' && (state === 'panel' || state === 'read')) closePanel();
  else if (e.code === 'Escape' && bigMap) toggleMap();
  else if (e.code === 'Escape' && (state === 'play' || state === 'drive' || (state === 'kart' && race?.screen)) && !document.pointerLockElement) openPause();
  if (e.code === 'KeyP' && (state === 'play' || state === 'drive' || state === 'kart')) openPause();
  if (e.code === 'KeyR' && state === 'kart') { race?.mod.respawn(); return; }
  if (e.code === 'KeyM' && (state === 'play' || bigMap)) { if (onPlanet() && !bigMap) ui.toast('pas de carte ici… pour l\'instant'); else toggleMap(); }
  if (state !== 'play') return;
  if (e.code === 'KeyR') toSurface();
  if (e.code === 'KeyT' && near && near.id === 'organ') { offerGame('orgue'); return; }
  if (e.code === 'KeyT' && near && near.id === 'globe') {
    if (eco.s.china) travel('china', 'globe');
    else ui.toast('le globe tourne… il faudrait d\'abord trouver le chemin, tout au fond');
  }
  if (e.code === 'KeyF') useItem();
  if (e.code === 'KeyX') switchTool();
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(e.code);
  const slots = hotSlots();
  if (n >= 0 && n < slots.length) { eco.s.slot = slots[n]; audio.tick(); }
});

function toSurface() {
  if (onPlanet()) { moonP.place(landerSpot(here)); ui.wash(); ui.toast(here === 'mars' ? 'retour au module martien' : 'retour au module lunaire'); return; }
  player.pos.copy(here === 'china' ? world.china.spawn : HOME_SPAWN);
  player.vel.set(0, 0, 0);
  player.yaw = Math.PI; player.pitch = -0.15;
  player.unstick();
  ui.wash();
  ui.toast('retour à la surface');
  audio.pickup(0);
}

// ---------- achievements ----------
function unlock(key) {
  if (eco.s.ach[key]) return;
  eco.s.ach[key] = true;
  house.drawBoard(eco.s.ach);
  const a = ACH_LIST.find(x => x[0] === key);
  setTimeout(() => { ui.toast('exploit · ' + (a ? a[1] : key), false, 2400); audio.buy(); }, 600);
}

// ---------- life and battery ----------
function hurt(n) {
  if (EXPLORE) return;
  if (state === 'faint' || state === 'win' || state === 'travel') return;
  eco.s.health -= n * (eco.s.perks.helmet ? 0.5 : 1);
  ui.hurt();
  shakeT = Math.max(shakeT, 0.2);
  if (eco.s.health <= 0) faint();
}
function faint() {
  eco.s.health = 0;
  state = 'faint';
  digging = false;
  player.disable();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.el.faint.classList.remove('hidden');
  audio.full();
  setTimeout(() => {
    ui.el.faint.classList.add('hidden');
    moles.clear(); guardiansUp = false;
    eco.emptySack();
    eco.s.health = 100;
    applyWorld('home');
    player.pos.copy(BED_SPOT); player.vel.set(0, 0, 0); player.yaw = Math.PI / 2; player.pitch = 0;
    ui.setBag(0, eco.cap);
    state = 'play'; player.enable(); lockPointer();
    save();
  }, 2600);
}

// ---------- aiming and the things you can talk to ----------
const eye = new THREE.Vector3(), dir = new THREE.Vector3();
const heartRay = new THREE.Raycaster();
let near = null;
const VAN = { id: 'van' };
const LIFT = { id: 'lift' };

function findNear() {
  camera.getWorldDirection(dir);
  if (onPlanet()) return space.near(here, moonP.pos) || orbit.near(here, moonP.pos) || (moonP.pos.distanceTo(LANDERS[here]) < (here === 'mars' ? 6 : 4.5) ? LANDER : null);
  if (here === 'home' && delivery.canSteal(player.pos)) return VAN;
  if (here === 'home' && elevator.owned && elevator.near(player.pos)) return LIFT;
  let best = null, bd = Infinity;
  for (const it of world.interactables) {
    if (it.off || it.column) continue;
    const reach = it.reach || 2.6;
    const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
    // underground, only what's down there too (the crypt's stairs, table, doors, dials)
    if (d > reach || (d > bd + 0.3 && !it.aim) || (player.pos.y < -1 && it.pos.y > -1) || Math.abs(player.pos.y + 1 - it.pos.y) > 2) continue;
    const to = it.pos.clone().sub(camera.position).normalize();
    if (to.dot(dir) < (it.aim || 0.5)) continue;
    // something small you have to look right at (the headset) wins over what's around it
    if (it.aim) return it;
    best = it; bd = d;
  }
  return best;
}

const PROMPTS = {
  shop: '<b>e</b> la quincaillerie', cshop: '<b>e</b> acheter au konbini', bed: '<b>e</b> faire une sieste',
  charger: '<b>e</b> recharger la batterie', computer: '<b>e</b> commander en ligne', board: '<b>e</b> les exploits',
  globe: null, shelf: '<b>e</b> les trophées', letters: '<b>e</b> les lettres · le livre d\'or', globe: '<b>e</b> faire tourner le globe',
  well: '<b>e</b> rentrer à la maison', parcel: '<b>e</b> ouvrir les colis', craft: '<b>e</b> l\'établi',
  trapdoor: '<b>e</b> soulever la trappe…', caveup: '<b>e</b> remonter l\'échelle', organ: '<b>e</b> jouer de l\'orgue · pour tout le monde',
  deck: '<b>e</b> regarder le grand prix orbital · parier', van: '<b>e</b> piquer la camionnette', arcade: '<b>e</b> la borne d\'arcade · mini-jeux', reset: '<b>e</b> RESET · reboucher le trou, nouvelle carte',
};

function updateAim() {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  near = findNear();
  if (onPlanet() && !near) {
    ui.prompt('');
    const hit = T().raycast(eye, dir, 11);
    const ok = hit && hit.point.distanceTo(moonP.pos.clone().addScaledVector(moonP.up, 1)) < 7;
    ui.cross(ok ? (T().hardness(hit.i, hit.j, hit.k) > activeTool().tier ? 'hard' : 'dig') : '');
    return;
  }
  if (near) {
    ui.cross('use');
    let p = PROMPTS[near.id];
    if (near.id === 'sell') {
      const v = eco.sackValue();
      p = eco.s.sackN ? `<b>e</b> vendre ${eco.s.sackN} trouvaille${eco.s.sackN > 1 ? 's' : ''} · ${ui.fmt(v)} ●` : 'le sac est vide';
    } else if (near.id === 'door') p = house.doorOpen ? '<b>e</b> fermer la porte' : '<b>e</b> ouvrir la porte';
    else if (near.id === 'lander') p = here === 'mars' ? '<b>e</b> le module martien · vendre, rentrer au japon' : '<b>e</b> le module lunaire · vendre, fabriquer, rentrer';
    else if (near.id === 'marsrocket') p = eco.s.moon || EXPLORE ? '<b>e</b> décoller pour mars' : 'la fusée pour mars · il faut d\'abord être allé sur la lune';
    else if (near.id === 'ndoor') p = near.house.locked ? `chez ${near.house.name} · fermé à clé jusqu'à demain` : near.house.doorOpen ? '<b>e</b> fermer la porte' : `<b>e</b> entrer chez ${near.house.name}`;
    else if (near.id === 'loot') p = near.spot.looted ? `${near.spot.name} · déjà vidé` : `<b>e</b> fouiller ${near.spot.name}`;
    else if (near.id === 'rocket') { const n = PARTS.filter(q => eco.s.parts[q.id]).length; p = n === 5 ? '<b>e</b> décoller pour la lune' : `la fusée · ${n}/5 pièces · il manque : ${PARTS.filter(q => !eco.s.parts[q.id]).map(q => q.name).join(', ')}`; }
    else if (near.id === 'globe') p = `<b>e</b> ${hologram.on ? 'éteindre' : 'voir'} le trou en transparence` + (eco.s.china ? ' · <b>t</b> voyager au japon' : '');
    else if (near.id === 'updoor') p = house.room.locked ? 'la porte de l\'étage · fermée à clef' : house.room.doorOpen ? '<b>e</b> fermer la porte' : '<b>e</b> ouvrir la porte';
    else if (near.id === 'vr') p = '<b>e</b> mettre le casque… ?';
    else if (near.id === 'egg') p = '<b>e</b> l\'œuf d\'or';
    else if (near.id === 'sdoor') p = doorOf(near)?.open ? '<b>e</b> fermer la porte' : '<b>e</b> ouvrir la porte';
    else if (near.id === 'dgun') p = !reliquary.ready ? 'le reliquaire est vide · il en revient un bientôt' : eco.s.discs ? '<b>e</b> le lance-disques · tu as déjà le tien' : '<b>e</b> prendre le lance-disques chasse-vampire';
    else if (near.id === 'organ') p = `<b>e</b> ${organ.playing ? 'morceau suivant' : 'jouer de l\'orgue'} · ${SONGS[(organSong + 1) % SONGS.length].name} · <b>t</b> orgue héros`;
    else if (near.id === 'pgun') p = !cave.gunReady ? 'le socle du pistolet à portails · il en revient un bientôt' : eco.s.portal ? '<b>e</b> le pistolet à portails · tu as déjà le tien' : '<b>e</b> prendre le pistolet à portails';
    else if (near.game) p = `<b>e</b> jouer · ${GAMES[near.game].name}`;
    else if (crypt.prompt(near) !== undefined) p = crypt.prompt(near);
    else if (near.id === 'lift') p = elevator.holds(player.pos) ? (elevator.y > -1 ? `<b>e</b> descendre à ${liftBottomDepth().toFixed(0)} m` : '<b>e</b> remonter') : '<b>e</b> appeler l\'ascenseur';
    ui.prompt(p);
    return;
  }
  ui.prompt('');
  const ah = animals[here].hitTest(eye, dir, REACH);
  if (ah) { ui.cross('use'); ui.prompt(`<b>clic</b> attraper : ${ah.animal.def.name}`); return; }
  if (heartInReach()) { ui.cross('dig'); ui.prompt(eco.s.portal ? '<b>clic</b> traverser' : '<b>clic</b> ?'); return; }
  if (coreInReach()) { ui.cross('dig'); ui.prompt('<b>clic</b> toucher le noyau'); return; }
  const aim = T().raycast(eye, dir, REACH, true);
  const fh = finds[W()].hitTest(eye, dir, REACH);
  if (fh && (!aim || fh.t < aim.t)) { ui.cross('dig'); return; }
  if (!aim || !aim.inside) { ui.cross(''); return; }
  ui.cross(T().hardness(aim.i, aim.j, aim.k) > activeTool().tier ? 'hard' : 'dig');
}

function heartInReach() {
  if (here !== 'home' || !heart.group.visible) return false;
  if (camera.position.distanceTo(heart.group.position) > REACH + 1) return false;
  heartRay.set(eye, dir);
  heartRay.far = REACH + 0.6;
  return heartRay.intersectObject(heart.core, false).length > 0;
}

// ---------- digging ----------
// the tool in hand: the shovel swings, the drill bites continuously
function activeTool() {
  if (eco.s.tool === 'drill' && eco.s.lv.drill > 0) return { kind: 'drill', ...eco.cur('drill') };
  return { kind: 'shovel', ...eco.cur('shovel'), cost: 1 };
}
// the tools you own, in turn: shovel, drill, portal gun
function switchTool() {
  const tools = ['shovel', ...(eco.s.lv.drill ? ['drill'] : []), ...(eco.s.portal ? ['portal'] : []), ...(eco.s.discs ? ['disc'] : [])];
  if (tools.length < 2) { ui.toast('pas encore de foreuse · la quincaillerie en vend', true); return; }
  eco.s.tool = tools[(tools.indexOf(eco.s.tool) + 1) % tools.length];
  ui.toast(eco.s.tool === 'portal' ? 'pistolet à portails · clic gauche : bleu · clic droit : orange' : eco.s.tool === 'disc' ? 'lance-disques chasse-vampire · clic pour tirer' : activeTool().name);
  audio.tick();
}
let drillT = 0, drillBite = 0;
// the drill heats up as it bites; at 100 % it cuts out until it has cooled to 30 %
let drillHeat = 0, overheated = false;
const heatEl = document.getElementById('heat'), heatFill = document.getElementById('heat-fill');
let pickCount = 0;
function collectOres(ores, normal) {
  if (!ores.length) return;
  const counts = {};
  for (const o of ores) {
    if (isLetter(o.id)) { findLetter(ORE[o.id].letter); continue; }
    eco.add(o.id);
    counts[o.id] = (counts[o.id] || 0) + 1;
    debris.burst(o.pos, normal, ORE[o.id].color, 4, 0.6);
    if (!eco.s.found[o.id]) { eco.s.found[o.id] = true; house.showTrophy(o.id); }
    if (o.id === 23) unlock('gold');
    if (o.id === 25) unlock('diamond');
    if (o.id === 26) unlock('fossil');
    if (o.id === 45) unlock('dragon');
  }
  const txt = Object.entries(counts).map(([id, n]) => `+${n} ${ORE[id].name}`).join('  ·  ');
  if (txt) { ui.toast(txt); audio.pickup(pickCount++); }
  ui.setBag(eco.s.sackN, eco.cap, true);
}

function findLetter(n) {
  if (eco.s.letters.includes(n)) return;
  eco.s.letters.push(n);
  eco.s.letters.sort();
  audio.buy();
  if (eco.s.letters.length >= 4) unlock('letters');
  setTimeout(() => openReader(n), 300);
}

function collectFind(f) {
  const def = f.def;
  const quip = typeof def.quip === 'function' ? def.quip() : def.quip;
  if (def.kind === 'bomb') {
    if (f.armed) return;
    f.armed = 2.6;
    ui.toast('tu as cogné un vieil obus ! il va sauter, éloigne-toi !', true, 2600);
    hintOnce('shell', 'les obus enfouis explosent quelques secondes après un coup de pelle', 5000);
    return;
  }
  applyOp({ k: 'find', w: f.world, key: f.key });
  (eco.s.finds[f.world] = eco.s.finds[f.world] || []).push(f.key);
  def.onFind?.(f);
  if (def.kind === 'part') { gainPart(f.id); ui.hint(quip, 5000); return; }
  debris.burst(f.center, new THREE.Vector3(0, 1, 0), 0xd9c8a0, 18, 1.2);
  unlock('find');
  if (f.id === 'dino') unlock('dino');
  if (def.kind === 'coins') {
    const v = f.id === 'chest' ? 300 + Math.floor(Math.random() * 900 + Math.max(0, -player.pos.y) * 8) : def.coins ?? 200;
    eco.earn(v);
    ui.plus('+' + ui.fmt(v)); ui.wash(); ui.setCoins(eco.s.money, true);
    audio.sell();
  } else {
    eco.add(f.id, true);
    ui.setBag(eco.s.sackN, eco.cap, true);
    ui.toast(`+1 ${def.name} · ${ui.fmt(def.value)} ●`);
    audio.pickup(3);
  }
  ui.hint(quip, 5000);
}

function doDig() {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  if (onPlanet()) { moonDig(); return; }
  if (mg.onSwing(eye, dir)) return;
  if (heartInReach()) { claimHeart(); return; }
  if (coreInReach()) { reachCore(); return; }
  const terrain = T();
  const hit = terrain.raycast(eye, dir, REACH, true);
  const ah = animals[here].hitTest(eye, dir, REACH);
  if (ah && (!hit || ah.t < hit.t)) { catchAnimal(ah.animal); return; }
  // a swipe at a ladder takes it back
  const lh = ladders.hitTest(eye, dir, REACH, here);
  if (lh && (!hit || lh.t < hit.t)) {
    applyOp({ k: 'unladder', w: here, id: lh.ladder.id });
    eco.give('ladder');
    audio.step(); ui.toast('échelle récupérée');
    return;
  }
  const mh = moles.hitTest(eye, dir, REACH);
  const fh = finds[W()].hitTest(eye, dir, REACH);
  const ht = hit ? hit.t : Infinity;
  if (mh && mh.t < ht && (!fh || mh.t < fh.t)) {
    const tool = activeTool();
    const killed = moles.damage(mh.mole, tool.kind === 'drill' ? .5 : tool.tier >= 4 ? 2 : 1, dir.clone().setY(0).normalize());
    audio.bonk(); audio.squeak();
    ui.hit();
    debris.burst(mh.mole.g.position.clone().add(new THREE.Vector3(0, .3, 0)), dir.clone().negate(), 0xe8a0aa, killed ? 14 : 5);
    return;
  }
  if (fh && fh.t < ht) { ui.hit(); audio.dig(1); collectFind(fh.find); return; }
  if (!hit) return;
  ui.hit();
  if (!hit.inside) {
    audio.dig(1);
    debris.burst(hit.point, hit.normal, 0x5f8d33, 5);
    hintOnce('fence', 'le trou, c\'est dans le potager', 2500);
    return;
  }
  if (eco.s.battery < activeTool().cost) {
    audio.deny();
    ui.toast('batterie à plat', true);
    hintOnce('flat', 'batterie à plat : reste immobile un instant, elle remonte toute seule (ou la borne, dans la maison)', 6000);
    return;
  }
  const tool = activeTool();
  const h = terrain.hardness(hit.i, hit.j, hit.k);
  if (h > tool.tier) {
    audio.clink();
    debris.burst(hit.point, hit.normal, 0xffe6b0, 4, 0.5);
    ui.toast(h >= 99 ? 'rien ne passe' : tool.kind === 'drill' ? 'trop dur pour cette foreuse' : 'trop dur pour cette pelle', true);
    if (h < 99) hintOnce('hard', here === 'china' ? 'le konbini vend une pelle en jade…' : 'la quincaillerie aura mieux. remonte vendre, puis achète.', 5000);
    return;
  }
  eco.s.battery -= tool.cost;
  drillBite = .15;
  const m = terrain.get(hit.i, hit.j, hit.k);
  const center = hit.point.clone().addScaledVector(dir, 0.18);
  if (dir.y < -0.7 && Math.hypot(hit.point.x - player.pos.x, hit.point.z - player.pos.z) < 0.7) {
    center.x = player.pos.x; center.z = player.pos.z;
  }
  const r = tool.r * (eco.s.perks.sharp ? 1.15 : 1) * (eco.s.perks.titan && tool.kind === 'shovel' ? 1.2 : 1);
  const out = applyOp({ k: 'carve', w: W(), c: center.toArray().map(v => +v.toFixed(3)), r, tier: tool.tier, space: eco.space, destroy: false });
  if (here === 'home') mg.onDig(center);
  if (here === 'home' && quest.hits(center, r)) takeKey();
  terrain.flush();
  unlock('first');
  if (tool.kind === 'shovel') audio.dig(h); else if (Math.random() < .3) audio.dig(h);
  // clods the colour of what you see: grass only off the flat top, earth on the walls
  const grassy = m === 1 || m === 14;
  const col = isOre(m) ? ORE[m].color
    : grassy && hit.normal.y > .5 ? (here === 'china' ? 0xa6c452 : 0x9ccc3c)
    : (terrain.LAYERS.find(l => l.id === m) || terrain.LAYERS[0]).color;
  debris.burst(hit.point, hit.normal, col, tool.kind === 'drill' ? 3 : 8 + Math.min(10, out.removed >> 1), tool.kind === 'drill' ? .6 : 1);
  collectOres(out.ores, hit.normal);
  if (out.water) { audio.splash(); debris.burst(hit.point, hit.normal, 0x3f8fc0, 10); hintOnce('water', 'une poche d\'eau ! elle va couler au fond du trou', 5000); }
  if (out.left) {
    ui.toast('sac plein', true);
    audio.full();
    hintOnce('full', 'sac plein. remonte vendre à la caisse, près du portail.', 5000);
  }
}
shovel.onImpact = doDig;

// on the moon the camera is behind you: aim through the screen centre, dig within arm's reach
function moonDig() {
  const t = T();
  const hit = t.raycast(eye, dir, 11);
  const hands = moonP.pos.clone().addScaledVector(moonP.up, 1);
  const inReach = hit && hit.point.distanceTo(hands) <= 7;
  moonP.dig(inReach ? hit.point : null, activeTool().kind);
  if (!hit) return;
  if (!inReach) { ui.toast('trop loin', true, 900); return; }
  if (eco.s.battery < activeTool().cost) { audio.deny(); ui.toast('batterie à plat', true); return; }
  const tool = activeTool();
  const h = t.hardness(hit.i, hit.j, hit.k);
  if (h > tool.tier) { audio.clink(); ui.toast('trop dur pour cet outil', true); return; }
  eco.s.battery -= tool.cost;
  drillBite = .15;
  const m = t.get(hit.i, hit.j, hit.k);
  const out = applyOp({ k: 'carve', w: here, c: hit.point.clone().addScaledVector(dir, .18).toArray().map(v => +v.toFixed(3)), r: tool.r * 1.1, tier: tool.tier, space: eco.space, destroy: false });
  t.flush();
  audio.dig(h);
  debris.burst(hit.point, hit.normal, isOre(m) ? ORE[m].color : (t.LAYERS.find(l => l.id === m) || t.LAYERS[0]).color, 8);
  collectOres(out.ores, hit.normal);
  if (out.left) { ui.toast('sac plein', true); audio.full(); }
}

function catchAnimal(a) {
  if (eco.space <= 0) { audio.deny(); ui.toast('le sac est plein', true); return; }
  animals[here].remove(a);
  eco.add(a.id);
  eco.s.animals++;
  ui.setBag(eco.s.sackN, eco.cap, true);
  ui.toast(`attrapé : ${a.def.name} · ${a.def.value} ●`);
  audio.pickup(4); audio.squeak();
  debris.burst(a.g.position.clone().add(new THREE.Vector3(0, .3, 0)), new THREE.Vector3(0, 1, 0), 0xf0e8d6, 8, .6);
  unlock('animal');
  if (a.def.prickly) { hurt(6); ui.toast('aïe, ça pique !', true); }
  hintOnce('animals', 'la caisse « vendre » les prend aussi : la ferme d\'à côté les adopte', 5000);
}

// ---------- items: explosives, first aid, spare cells ----------
// the moon's items join the hotbar once you've been up there
// what the konbini sells over the counter: used at once
let speedT = 0;
const KONBINI = {
  onigiri: { name: 'onigiri au saumon', sub: '+35 vie', price: 30, quip: 'itadakimasu !', use: () => { eco.s.health = Math.min(100, eco.s.health + 35); } },
  bento:   { name: 'bentō du jour', sub: 'vie au maximum', price: 90, quip: 'encore tiède.', use: () => { eco.s.health = 100; } },
  energy:  { name: 'canette énergisante', sub: 'batterie pleine, où que tu sois', price: 45, quip: 'ça pique un peu.', use: () => { eco.s.battery = eco.batteryMax; audio.charge(); } },
  coffee:  { name: 'café glacé en canette', sub: '60 s à courir plus vite', price: 60, quip: 'bien frais, du distributeur.', use: () => { speedT = 60; } },
  melon:   { name: 'melon pan', sub: '+15 vie, et la bonne humeur', price: 15, quip: 'croustillant dessus, moelleux dedans.', use: () => { eco.s.health = Math.min(100, eco.s.health + 15); } },
};
const hotSlots = () => SLOTS.filter(id => !ITEMS[id].moon || eco.s.moon || EXPLORE);
let gravT = 0;
// an aliexpresso unit: mostly fine, sometimes dead, sometimes it goes off as you touch it,
// sometimes the wick is far too short, and sometimes it's way better than the real thing
function aliRoll() {
  const r = Math.random();
  return r < .15 ? 'dud' : r < .25 ? 'boom' : r < .42 ? 'fast' : r < .57 ? 'strong' : 'ok';
}
// it went off in your hands
function aliBoom(power) {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  bombs.boom('dyn', eye.clone().addScaledVector(dir, .4).add(new THREE.Vector3(0, -.4, 0)), power);
}
function useItem() {
  const it = eco.s.slot;
  if (!eco.s.items[it]) { audio.deny(); ui.toast(`plus de ${ITEMS[it].name}`, true); return; }
  const ali = ['dyn', 'sup', 'med', 'cell'].includes(it) && eco.s.items[it] && eco.shoddy(it) ? aliRoll() : null;
  if (it === 'grav') {
    if (onPlanet()) { ui.toast('ici, la gravité est déjà faible'); return; }
    eco.use(it); gravT = 20; player.stats.grav = .35; audio.charge(); ui.toast('gravité lunaire · 20 s');
    return;
  }
  if (it === 'med') {
    if (eco.s.health >= 100) { if (ali) eco.s.ali.med++; ui.toast('déjà en pleine forme'); return; }
    eco.use(it);
    if (ali === 'dud') { audio.deny(); ui.toast('la trousse est vide… merci aliexpresso', true, 2400); return; }
    if (ali === 'boom') { aliBoom(.5); ui.toast('la trousse de soin a explosé ?! merci aliexpresso', true, 2600); return; }
    if (ali === 'strong') { eco.s.health = 100; audio.buy(); ui.toast('trousse miracle · vie au maximum', false, 2400); return; }
    eco.s.health = Math.min(100, eco.s.health + 60); audio.buy(); ui.toast('+60 vie');
    return;
  }
  if (it === 'ladder') { placeLadder(); return; }
  if (it === 'cell') {
    eco.use(it);
    if (ali === 'dud') { audio.deny(); ui.toast('pile morte · merci aliexpresso', true, 2400); return; }
    if (ali === 'boom') { aliBoom(.6); ui.toast('la pile t\'a explosé dans les mains !', true, 2600); return; }
    eco.s.battery = eco.batteryMax; audio.charge();
    // too much juice: it runs through your legs too
    if (ali === 'strong' || ali === 'fast') { speedT = Math.max(speedT, 30); ui.toast('pile survoltée · batterie pleine, et tu cours plus vite', false, 2600); }
    else ui.toast('batterie pleine');
    return;
  }
  eco.use(it);
  if (ali === 'boom') { aliBoom(it === 'sup' ? .8 : 1); ui.toast('ça t\'a pété dans les mains · merci aliexpresso', true, 2600); return; }
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  const from = it === 'fus' ? player.pos.clone().add(new THREE.Vector3(0, .3, 0)) : eye.clone().addScaledVector(dir, .5);
  bombs.throwBomb(it, from, dir, player.vel, { dud: ali === 'dud', fuse: ali === 'fast' ? .25 : 1, power: ali === 'strong' ? 1.7 : 1 });
  audio.tick();
  if (ali === 'fast') { audio.hiss(); ui.toast('mèche ultra courte !', true, 1400); }
}

// a ladder against the wall you're looking at: from the floor below, or from your feet
// if you're already up a ladder (that's how you chain them)
function placeLadder() {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  const t = T();
  const hit = t.raycast(eye, dir, REACH);
  if (!hit || !hit.inside || Math.abs(hit.normal.y) > .5) { audio.deny(); ui.toast('vise une paroi du trou', true); return; }
  const n = hit.normal;
  const x = hit.point.x + n.x * .12, z = hit.point.z + n.z * .12;
  let y;
  if (player.stats.onLadder) y = player.pos.y - .2;
  else {
    y = hit.point.y;
    for (let k = 0; k < 40; k++) {
      const [i, j, kk] = t.cellOf(x + n.x * .25, y - .05, z + n.z * .25);
      if (t.solidCell(i, j, kk)) { y = t.Y0 + (j + 1) * S; break; }
      y -= .2;
    }
  }
  eco.use('ladder');
  const id = `${here}:${x.toFixed(2)}:${y.toFixed(2)}:${z.toFixed(2)}`;
  applyOp({ k: 'ladder', w: here, l: { id, w: here, p: [+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)], yaw: +Math.atan2(n.x, n.z).toFixed(4), h: LADDER_H } });
  audio.step(); audio.tick();
  hintOnce('ladder', 'avance ou espace pour grimper, recule pour descendre · un coup de pelle la récupère', 5000);
}

const bombs = createBombs(scene, T, (kind, pos, power) => explode(kind, pos, power), () => {
  audio.hiss();
  ui.toast('pschitt… pétard mouillé, merci aliexpresso', true, 2400);
});
function explode(kind, pos, power = 1) {
  const b = power === 1 ? BLAST[kind] : { r: BLAST[kind].r * power, dmg: BLAST[kind].dmg * power, push: BLAST[kind].push * power };
  if (power > 1.2) setTimeout(() => ui.toast('wow · la version aliexpresso est surpuissante', false, 2200), 300);
  const tier = kind === 'dyn' ? Math.min(7, eco.cur('shovel').tier + 2) : 7;
  if (kind === 'air') planeHits++;
  const take = kind === 'sup' || kind === 'fus' || kind === 'met';
  let ores = [];
  if (kind === 'fus') {
    // the drill: a straight shaft, 14 m down
    for (let n = 0; n < 18; n++) {
      const out = applyOp({ k: 'carve', w: W(pos), c: [+pos.x.toFixed(3), +(pos.y - n * .8).toFixed(3), +pos.z.toFixed(3)], r: .85, tier, space: eco.space, destroy: false });
      ores.push(...out.ores);
    }
  } else {
    const out = applyOp({ k: 'carve', w: W(pos), c: pos.toArray().map(v => +v.toFixed(3)), r: b.r, tier, space: take ? eco.space : 0, destroy: !take });
    ores = out.ores;
  }
  T().flush();
  collectOres(ores, new THREE.Vector3(0, 1, 0));
  audio.boom((kind === 'met' ? 1.8 : kind === 'sup' || kind === 'shell' ? 1.3 : 0.8) * Math.max(.6, power));
  debris.burst(pos, new THREE.Vector3(0, 1, 0), 0x5a4030, 40, 2.4);
  debris.burst(pos, new THREE.Vector3(0, 1, 0), 0xffb060, 14, 2.8);
  moles.blast(pos, b.r);
  unlock('boom');
  // old shells nearby go off too
  for (const f of finds[here].list) if (!f.gone && f.id === 'shell' && !f.armed && f.center.distanceTo(pos) < b.r + 1.5) f.armed = 0.3;
  // push and hurt whoever stood too close
  const chest = player.pos.clone().add(new THREE.Vector3(0, 1, 0));
  const d = chest.distanceTo(pos);
  const reach = b.r + 2;
  if (d < reach && state === 'play') {
    const k = 1 - d / reach;
    const away = chest.sub(pos).normalize();
    player.vel.addScaledVector(away, b.push * k);
    player.vel.y += b.push * k * 0.6;
    if (kind !== 'air' || inDigZone()) shakeT = Math.max(shakeT, 0.5 * k + 0.2);
    if (d < b.r + .5) hurt(b.dmg * (1 - d / (b.r + .5)));
  } else if (d < 25 && (kind !== 'air' || inDigZone())) shakeT = Math.max(shakeT, 0.15);
}

// ---------- moles ----------
const moles = createMoles(scene, T, {
  onEmerge(m) { audio.squeak(); debris.burst(m.from, new THREE.Vector3(0, 1, 0), 0x6a4a30, 10); hintOnce('mole', 'une taupe ! frappe-la avant qu\'elle ne te vole', 5000); },
  onBite(m) {
    hurt(m.guardian ? 14 : 9);
    audio.squeak();
    if (m.guardian || EXPLORE) return null;
    const stolen = eco.steal();
    if (stolen != null) {
      ui.setBag(eco.s.sackN, eco.cap, true);
      ui.toast(`une taupe t'a volé : ${eco.nameOf(stolen)} !`, true, 2200);
    }
    return stolen;
  },
  onKill(m) {
    eco.s.moles++;
    const v = m.guardian ? 150 : 10 + Math.round(Math.max(0, -m.pos.y) * 0.6);
    eco.earn(v);
    ui.plus('+' + v); ui.setCoins(eco.s.money, true);
    if (m.carry != null) { eco.add(m.carry, true); ui.toast(`récupéré : ${eco.nameOf(m.carry)}`); ui.setBag(eco.s.sackN, eco.cap, true); }
    unlock('mole');
    if (eco.s.moles >= 10) unlock('moles10');
  },
  onEscape(m) { if (m.carry != null) ui.toast(`la taupe a filé avec : ${eco.nameOf(m.carry)}`, true, 2200); },
  onTunnel(p) { applyOp({ k: 'carve', w: here, c: p.toArray().map(v => +v.toFixed(3)), r: .38, tier: 6, space: 0, destroy: false }); T().flush(); },
});

function updateMoles(dt) {
  if (onPlanet()) return;
  const d = Math.max(0, -player.pos.y);
  const minD = here === 'china' ? 8 : 12;
  if (d > minD) {
    moleT -= dt;
    const maxN = d > 60 ? 3 : d > 35 ? 2 : 1;
    if (moleT <= 0) {
      moleT = (18 + Math.random() * 25) * (d > 60 ? 0.6 : 1);
      if (moles.count(false) < maxN) moles.trySpawnNear(player);
    }
  }
  // the three guards at the bottom
  if (here === 'home' && !eco.s.guardians) {
    const hp = terrains.home.heartPos;
    const dist = player.pos.distanceTo(hp);
    if (!guardiansUp && dist < 9) {
      guardiansUp = true;
      for (let n = 0; n < 3; n++) {
        const a = n / 3 * Math.PI * 2 + .5;
        const at = hp.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, -1.3, Math.sin(a) * 1.5));
        moles.spawn(at, at.clone().add(new THREE.Vector3(0, -.6, 0)), true);
      }
      ui.toast('trois taupes casquées gardent le cœur !', true, 2600);
    } else if (guardiansUp && moles.count(true) === 0) {
      eco.s.guardians = true;
      ui.toast('la voie est libre', false, 2600);
      ui.wash();
    } else if (guardiansUp && dist > 30) { moles.clear(); guardiansUp = false; }
  }
}

// ---------- the deep: heat, lava, and the centre of the Earth ----------
const tempEl = document.getElementById('temp');
const tempAt = (d) => d <= 100 ? 15 + d * .3 : 45 + Math.pow((d - 100) / 300, 1.6) * 5355;
let heatT = 0, lavaT = 0;
const DEEP = new Set(['home', 'china']);      // the two plots that go down to the core
function updateDeep(dt) {
  const d = Math.max(0, -player.pos.y);
  const show = DEEP.has(here) && d > 60;
  tempEl.classList.toggle('hidden', !show);
  const suit = eco.cur('suit');
  if (show) {
    tempEl.textContent = `température ${Math.round(tempAt(d)).toLocaleString('fr-FR')} °C`;
    tempEl.classList.toggle('hot', d > suit.heat);
  }
  if (!DEEP.has(here)) return;
  // too deep for what you wear: the heat gets through
  heatT += dt;
  if (heatT > 1) {
    heatT = 0;
    if (d > suit.heat) {
      hurt(4 + (d - suit.heat) * .1);
      hintOnce('hot', 'trop chaud pour ta tenue · la quincaillerie vend une combinaison ignifugée', 5000);
    } else if (d > 150 && suit.heat < 300) hintOnce('warm', 'il fait chaud… plus bas, il faudra une combinaison ignifugée', 5000);
  }
  // standing in lava
  if (T().lavaAt(player.pos.x, player.pos.y + .3, player.pos.z)) {
    lavaT += dt;
    hurt((suit.lava ? 5 : 32) * dt);
    player.vel.y = Math.max(player.vel.y, 2.5);
    if (lavaT > .3) { lavaT = 0; debris.burst(player.pos.clone(), new THREE.Vector3(0, 1, 0), 0xff6a1a, 4, .6); }
    hintOnce('lava', 'aïe, la lave ! le scaphandre thermique la supporte mieux', 4000);
  }
}
terrains.home.onSteam = terrains.china.onSteam = (x, y, z) => {
  debris.burst(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), 0xf0f0f0, 10, 1.2);
  audio.hiss();
  unlock('obsidian');
};

// the core: a small sun at the very bottom (one under each plot)
const makeCore = (w) => {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 3), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }));
  const light = new THREE.PointLight(0xffc060, 30, 16, 1.4);
  g.add(ball, halo, light);
  g.position.copy(terrains[w].corePos);
  finds[w].group.add(g);   // hidden with its world
  return { g, ball, halo };
};
const cores = { home: makeCore('home'), china: makeCore('china') };
const core = cores.home;
function coreInReach() {
  const c = cores[here];
  if (!c || camera.position.distanceTo(c.g.position) > REACH + 1.6) return false;
  heartRay.set(eye, dir); heartRay.far = REACH + 1.6;
  return heartRay.intersectObject(c.ball, false).length > 0;
}
function reachCore() {
  if (state !== 'play') return;
  unlock('core');
  state = 'win'; digging = false; player.disable();
  if (document.pointerLockElement) document.exitPointerLock();
  audio.win();
  // a reward for each side of the Earth
  const doneKey = here === 'china' ? 'coreDoneChina' : 'coreDone';
  if (!eco.s[doneKey]) { eco.s[doneKey] = true; eco.earn(50000); ui.setCoins(eco.s.money, true); }
  if (!eco.s.parts.p_cockpit) gainPart('p_cockpit');
  document.querySelector('#win .w-title').textContent = 'le centre de la terre';
  document.getElementById('win-depth').textContent = '400 m';
  document.getElementById('win-quip').textContent = here === 'china' ? 'le même soleil qu\'à la maison, vu de l\'autre côté. 5 400 °C, et toujours personne. (+50 000 ●)' : 'personne n\'était jamais descendu aussi bas. il fait 5 400 °C, et pourtant ça valait le détour. (+50 000 ●)';
  document.getElementById('through').classList.add('hidden');
  ui.el.win.classList.remove('hidden');
  save();
}

// ---------- to the moon: the pad in the garden, the lander up there, the way back ----------
const PAD = new THREE.Vector3(14, 0, 0);
const rocket = createRocket();
const padGroup = new THREE.Group();
padGroup.position.copy(PAD);
const slab = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, .2, 32), new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: .9 }));
slab.position.y = .1; slab.receiveShadow = true;
const tower = new THREE.Group();
for (const [x, z] of [[-2, -.3], [-2, .3]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.12, 7.5, .12), new THREE.MeshStandardMaterial({ color: 0xc4302a })); leg.position.set(x, 3.75, z); tower.add(leg); }
for (let y = .8; y < 7.5; y += 1) { const r = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .7), new THREE.MeshStandardMaterial({ color: 0xc4302a })); r.position.set(-2, y, 0); tower.add(r); }
rocket.group.position.y = .2;
padGroup.add(slab, tower, rocket.group);
// you, in a helmet, behind the porthole (only during take-off)
const pilot = new THREE.Mesh(new THREE.SphereGeometry(.24, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf2efe8, emissive: 0x3a3020 }));
pilot.position.set(0, 4.8, .55);
pilot.visible = false;
rocket.group.add(pilot);
const padSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .4), new THREE.MeshBasicMaterial({ map: world.label('aire de lancement', { color: '#ffd75e', bg: '#1a130c', size: 60 }), side: THREE.DoubleSide }));
padSign.position.set(-2.1, 8.1, 0); padSign.rotation.y = -Math.PI / 2;
padGroup.add(padSign);
world.homeDecor.add(padGroup);
world.colliders.push({ min: new THREE.Vector3(PAD.x - .9, 0, PAD.z - .9), max: new THREE.Vector3(PAD.x + .9, 7, PAD.z + .9) });
world.interactables.push({ id: 'rocket', pos: new THREE.Vector3(PAD.x, 1.2, PAD.z), reach: 3.6 });
rocket.setParts(eco.s.parts);
const moonPortal = createPad(scene, new THREE.Vector3(PAD.x, .012, PAD.z + 4.6), world.label, 'portail · lune');
moonPortal.group.visible = false;

// the ground's surface above a direction from a planet's centre
function surfaceAt(w, dir) {
  const t = terrains[w], c = PLANET[w];
  const from = c.clone().addScaledVector(dir, t.radius + 12);
  const hit = t.raycast(from, dir.clone().negate(), 30);
  return hit ? hit.point : c.clone().addScaledVector(dir, t.radius);
}
const UP = new THREE.Vector3(0, 1, 0);
// the planets are made on the first trip there; so are the positions of what stands on them
const LANDERS = {};
let landerPos = null, DOME = null;
const moonDecor = new THREE.Group();
const lander = createRocket();
lander.setParts(Object.fromEntries(PARTS.map(p => [p.id, true])), false);
lander.group.scale.setScalar(.55);
const flag = new THREE.Group();
const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 2, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: .8 }));
pole.position.y = 1;
const cloth = new THREE.Mesh(new THREE.PlaneGeometry(.9, .55), new THREE.MeshBasicMaterial({ map: world.label('A HOLE', { w: 256, h: 150, size: 60, italic: false, color: '#ffd75e', bg: '#1a130c' }), side: THREE.DoubleSide }));
cloth.position.set(.46, 1.7, 0);
const clothBack = cloth.clone(); clothBack.rotation.y = Math.PI; clothBack.position.z -= .005;
cloth.material.side = THREE.FrontSide;
flag.add(pole, cloth, clothBack);
moonDecor.add(lander.group, flag);
scene.add(moonDecor);
// ---------- mars: the lander, a habitat dome, a rover, rocks scattered to the horizon ----------
const marsDecor = new THREE.Group();
let domeBox = null;
function buildMars() {
// built again after a super reset: the old decor and its dome wall go first
marsDecor.clear();
if (domeBox) world.colliders.splice(world.colliders.indexOf(domeBox), 1);
const marsLanderPos = surfaceAt('mars', UP).add(new THREE.Vector3(0, -.3, 0));
LANDERS.mars = marsLanderPos;
const marsLander = createRocket();
marsLander.setParts(Object.fromEntries(PARTS.map(p => [p.id, true])), false);
marsLander.group.scale.setScalar(.75);
marsLander.group.position.copy(marsLanderPos);
marsDecor.add(marsLander.group);
const marsFlag = flag.clone(); marsFlag.position.copy(marsLanderPos).add(new THREE.Vector3(3.2, .1, 1)); marsDecor.add(marsFlag);
// the dome: a white ring, a glass cap, a door; the air is refilled near it
{
  const at = surfaceAt('mars', new THREE.Vector3(.4, 1, -.3).normalize());
  DOME = at;
  const dome = new THREE.Group(); dome.position.copy(at);
  dome.quaternion.setFromUnitVectors(UP, at.clone().sub(MARS).normalize());
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 1.6, 32), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: .6 })); base.position.y = -.1;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe6f2, roughness: .1, metalness: .2, transparent: true, opacity: .35, depthWrite: false }));
  cap.position.y = .7;
  const ribs = new THREE.Mesh(new THREE.SphereGeometry(4.02, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4f4f0, wireframe: true }));
  ribs.position.y = .7;
  const light = new THREE.Mesh(new THREE.SphereGeometry(.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8 })); light.position.y = 3.2;
  const garden = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, .3, 24), new THREE.MeshLambertMaterial({ color: 0x4f8a3a })); garden.position.y = .85;
  dome.add(base, cap, ribs, light, garden);
  marsDecor.add(dome);
  domeBox = { min: at.clone().add(new THREE.Vector3(-4.2, -1, -4.2)), max: at.clone().add(new THREE.Vector3(4.2, 1.2, 4.2)) };
  world.colliders.push(domeBox);
}
// a six-wheeled rover, left where it stopped
{
  const at = surfaceAt('mars', new THREE.Vector3(-.3, 1, .4).normalize());
  const rover = new THREE.Group(); rover.position.copy(at);
  rover.quaternion.setFromUnitVectors(UP, at.clone().sub(MARS).normalize());
  const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: .3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, .6, 1.6), std(0xe8e4dc)); body.position.y = 1.1;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, 1.2), std(0x2a3a5a)); deck.position.y = 1.45;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.4, 8), std(0xcfcfcf)); mast.position.set(.7, 2.1, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.4, .25, .3), std(0xe8e4dc)); head.position.set(.7, 2.85, 0);
  rover.add(body, deck, mast, head);
  for (const x of [-.8, 0, .8]) for (const z of [-.95, .95]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .3, 16), std(0x3a3a3e)); w.rotation.x = Math.PI / 2; w.position.set(x, .35, z); rover.add(w); }
  marsDecor.add(rover);
}
// rocks, from pebbles to boulders, sat on the ground all round the planet
{
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) { v.fromBufferAttribute(p, n); const k = 1 + Math.sin(v.x * 3 + v.z * 2) * .15; p.setXYZ(n, v.x * k, v.y * k * .7, v.z * k); }
  geo.computeVertexNormals();
  const N = 700;
  const rocks = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const dm = new THREE.Object3D(), col = new THREE.Color();
  for (let n = 0; n < N; n++) {
    const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    const at = surfaceAt('mars', d);
    const r = Math.random() < .08 ? .8 + Math.random() * 1.6 : .12 + Math.random() * .4;
    dm.position.copy(at).addScaledVector(d, -r * .25);
    dm.quaternion.setFromUnitVectors(UP, d).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * 6));
    dm.scale.setScalar(r); dm.updateMatrix();
    rocks.setMatrixAt(n, dm.matrix); rocks.setColorAt(n, col.setHex([0x7a3a28, 0x5a3024, 0x9a5236, 0x4a2a22][n % 4]));
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  marsDecor.add(rocks);
}
}
scene.add(marsDecor);
function setupPlanet(w) {
  if (LANDERS[w]) return;
  terrains[w].ensure();
  if (w === 'mars') buildMars();
  else {
    landerPos = LANDERS.moon = surfaceAt('moon', UP).add(new THREE.Vector3(0, -.3, 0));
    lander.group.position.copy(landerPos);
    flag.position.copy(landerPos).add(new THREE.Vector3(2.4, .1, .6));
  }
  buildSpace(w);
}
// the game hall and the grandstand of the orbital grand prix (spacearcade.js, spacerace.js)
function buildSpace(w) {
  const t = terrains[w], at = (d) => surfaceAt(w, new THREE.Vector3(...d).normalize());
  scene.add(space.build(w, { terrain: t, center: PLANET[w], at: at(HALL_DIR[w]), face: LANDERS[w] }));
  scene.add(orbit.build(w, { terrain: t, center: PLANET[w], radius: t.radius, at: at(DECK_DIR[w]), face: LANDERS[w] }));
}
// where you stand on arriving, next to the lander
const landerSpot = (w) => LANDERS[w].clone().add(new THREE.Vector3(2.5, 1.5, -2));

// ---------- the rocket for mars: a launch site in a corner of the Japanese town ----------
const MARS_PAD = CHINA.clone().add(new THREE.Vector3(-46, 0, -5));
const marsRocket = createRocket();
marsRocket.setParts(Object.fromEntries(PARTS.map(p => [p.id, true])), false);
// orange and white, a bigger machine for a longer trip
marsRocket.group.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0xc4302a) o.material.color.setHex(0xe8742a); });
marsRocket.group.scale.setScalar(1.35);
const marsPadGroup = new THREE.Group();
marsPadGroup.position.copy(MARS_PAD).sub(CHINA);          // it lives in the Japanese town's group
{
  const slab2 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, .3, 40), new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: .9 }));
  slab2.position.y = .15; slab2.receiveShadow = true;
  const trench = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0x1a1a1e })); trench.rotation.x = -Math.PI / 2; trench.position.y = .31;
  const towerM = new THREE.MeshStandardMaterial({ color: 0xe8742a, roughness: .6 });
  const tw = new THREE.Group();
  for (const [x, z] of [[-3, -.5], [-3, .5], [-4, -.5], [-4, .5]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.16, 11, .16), towerM); leg.position.set(x, 5.5, z); tw.add(leg); }
  for (let y = .8; y < 11; y += 1.1) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.1, .08, 1.1), towerM); r.position.set(-3.5, y, 0); tw.add(r); }
  for (const y of [5, 7.5]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, .3), towerM); arm.position.set(-2, y, 0); tw.add(arm); }
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), new THREE.MeshBasicMaterial({ map: world.label('fusée · mars', { color: '#ffd75e', bg: '#1a130c', size: 70 }), side: THREE.DoubleSide }));
  sg.position.set(-3.5, 11.8, 0); sg.rotation.y = Math.PI / 2;
  // a low fence round the site, with a gap facing the town
  const fenceM = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: .7 });
  for (let a = 0; a < 40; a++) { const ang = a / 40 * Math.PI * 2; if (Math.abs(Math.sin(ang)) > .92 && Math.cos(ang) > -.2 && Math.sin(ang) > 0) continue; const pst = new THREE.Mesh(new THREE.BoxGeometry(.1, 1, .1), fenceM); pst.position.set(Math.cos(ang) * 7, .5, Math.sin(ang) * 7); tw.add(pst); }
  marsRocket.group.position.y = .3;
  marsPadGroup.add(slab2, trench, tw, sg, marsRocket.group);
}
const marsPilot = pilot.clone(); marsPilot.visible = false; marsRocket.group.add(marsPilot);
world.china.group.add(marsPadGroup);
world.colliders.push({ min: new THREE.Vector3(MARS_PAD.x - 1.3, 0, MARS_PAD.z - 1.3), max: new THREE.Vector3(MARS_PAD.x + 1.3, 9, MARS_PAD.z + 1.3) });
world.colliders.push({ min: new THREE.Vector3(MARS_PAD.x - 4.2, 0, MARS_PAD.z - .7), max: new THREE.Vector3(MARS_PAD.x - 2.8, 11, MARS_PAD.z + .7) });
world.interactables.push({ id: 'marsrocket', pos: new THREE.Vector3(MARS_PAD.x, 1.2, MARS_PAD.z), reach: 4.4 });
// the two launch sites: which rocket, where it stands, where it goes
const SITES = {
  moon: { pad: PAD, rocket, pilot, to: 'moon', group: padGroup },
  mars: { pad: MARS_PAD, rocket: marsRocket, pilot: marsPilot, to: 'mars', group: marsPadGroup, scale: 1.35 },
};
let site = SITES.moon;

const moonP = createMoonPlayer(scene, camera, () => terrains[onPlanet() ? here : 'moon']);
const LANDER = { id: 'lander' };

function gainPart(id) {
  if (eco.s.parts[id]) return;
  eco.s.parts[id] = true;
  rocket.setParts(eco.s.parts);
  const n = PARTS.filter(p => eco.s.parts[p.id]).length;
  ui.toast(`pièce de fusée · ${PARTS.find(p => p.id === id).name} (${n}/5)`, false, 3000);
  audio.buy(); ui.wash();
  unlock('part');
  if (n === 5) { unlock('rocket'); setTimeout(() => ui.hint('la fusée est complète ! l\'aire de lancement est à l\'est du potager', 7000), 1500); }
  save();
}

// the world you're in decides the rules: sky, gravity, camera
function applyWorld(w) {
  here = w;
  eco.s.where = w;
  world.setSpace(onPlanet(w) ? w : false);
  moonP.setActive(onPlanet(w));
  moonP.stats.g = w === 'mars' ? 5.4 : 3.2;
  if (!onPlanet(w)) camera.up.set(0, 1, 0);
}

let launching = 0;
// take-off in three beats: you climb in (the view flies into the cockpit window),
// a countdown on the pad, then the rocket climbs away with the camera chasing it
function launch(to = 'moon') {
  site = SITES[to];
  state = 'launch';
  digging = false;
  player.disable();
  launching = 0.001;
  launchFrom.copy(camera.position);
  audio.tick();
  ui.toast('tu montes à bord…', false, 1800);
  setTimeout(() => ui.toast('3…', false, 900), 1800);
  setTimeout(() => ui.toast('2…', false, 900), 2600);
  setTimeout(() => ui.toast('1…', false, 900), 3400);
  setTimeout(() => { ui.toast('décollage !', false, 1600); site.rocket.flame.visible = true; audio.boom(1.4); }, 4200);
}
const launchFrom = new THREE.Vector3();
const cockpitWin = new THREE.Vector3();
function updateLaunch(dt) {
  if (!launching) return;
  launching += dt;
  const k = launching;
  const lift = Math.max(0, k - 4.2);
  site.rocket.group.position.y = .2 + lift * lift * 2.4;
  const sc = site.scale || 1;
  const top = site.pad.clone().setY(site.rocket.group.position.y);
  cockpitWin.copy(top).add(new THREE.Vector3(0, 4.8 * sc, .8 * sc));
  if (k < 1.6) {
    // walking up to the hatch: glide into the porthole
    const e = k / 1.6, s = e * e * (3 - 2 * e);
    camera.position.lerpVectors(launchFrom, cockpitWin.clone().add(new THREE.Vector3(0, 0, 1.2)), s);
    camera.lookAt(cockpitWin);
    if (k > 1.2) ui.veil(Math.min(1, (k - 1.2) * 2.5));
  } else {
    // from the ground, watching the rocket (with you inside) leave
    ui.veil(Math.max(0, 1 - (k - 1.6) * 2));
    const watch = site.pad.clone().add(new THREE.Vector3(-11 * sc, 2.2 + lift * 1.5, 9 * sc));
    camera.position.copy(watch);
    camera.lookAt(top.clone().add(new THREE.Vector3(0, 3.5 * sc, 0)));
    site.pilot.visible = true;
    if (k > 4.2) {
      site.rocket.flame.scale.setScalar(1 + Math.random() * .3);
      shakeT = Math.max(shakeT, .25 / (1 + lift));
      if (lift < 1.5 && Math.random() < .6) debris.burst(site.pad.clone().add(new THREE.Vector3((Math.random() - .5) * 3, .3, (Math.random() - .5) * 3)), new THREE.Vector3(0, 1, 0), 0xe8e0d0, 4, 2.2);
    }
  }
  shovel.root.visible = false; drill.root.visible = false;
  ui.prompt(''); ui.cross('');
  if (k > 8.2) {
    launching = 0;
    site.rocket.group.position.y = site === SITES.mars ? .3 : .2; site.rocket.flame.visible = false; site.pilot.visible = false;
    ui.veil(0);
    state = 'play';
    travel(site.to, 'rocket');
  }
}

// ---------- mini-games ----------
const mg = createMiniGames({ scene, terrain: terrains.home, player, audio, ui, sackValue: () => eco.sackValue(), camera, colliders: world.colliders, house, debris, getNet: () => net });
function record(id, value, lowerIsBetter) {
  eco.s.records = eco.s.records || {};
  const old = eco.s.records[id];
  const better = old == null || (lowerIsBetter ? value < old : value > old);
  if (better) eco.s.records[id] = value;
  return better;
}
function reward(v, text) {
  if (EXPLORE) { ui.hint(text, 5000); return; }
  eco.earn(v); ui.plus('+' + ui.fmt(v)); ui.setCoins(eco.s.money, true); ui.wash();
  ui.hint(text + ` · +${ui.fmt(v)} ●`, 5000);
}
mg.onEnd = (id, r) => {
  syncPauseQuit();
  if (r.lost) { audio.full(); ui.hint(r.text, 4000); return; }
  audio.win();
  const best = record(id, r.value, GAMES[id].lower);
  reward(r.reward, r.text + (best ? ' · nouveau record !' : ''));
  save();
};

// ---------- the races, kart and rc: one frame for both ----------
// A race module: start({ seed, humans, hostId, meId, send }), update(dt, keys), stop(), respawn(),
// onFx(peerId, fx), peerLeft(id), hud(), onEnd({ place, time, of }). The host runs the bots.
const RACES = {
  kart: { mod: createKart({ scene, camera, audio, ui }), help: '4 tours · zqsd pour piloter · shift pour déraper · espace pour l\'objet · r pour revenir sur la piste', prizes: [1500, 800, 400, 100] },
  rc: { mod: createRC({ scene, camera, audio, ui, world, terrain: terrains.home }), help: 'petites voitures dans la ville · zqsd · espace pour l\'objet · r pour revenir sur la piste', prizes: [2000, 1100, 600, 300, 150, 80] },
  jetski: { mod: createJetski({ scene, camera, audio, ui, world }), help: 'mini jet-skis dans la fontaine · zqsd · shift pour se pencher · bouée rouge à sa droite, jaune à sa gauche · r pour revenir', prizes: [1800, 900, 450, 200, 100, 50] },
  // the secret cave's games: dioramas you shrink into
  bomber: { mod: createBomber({ scene: homeRoot, camera, audio, ui, at: slotAt('bomber') }), help: 'zqsd : bouger · espace : poser une bombe · le dernier debout gagne la manche', prizes: [1500, 700, 350, 150] },
  canards: { mod: createCanards({ scene: homeRoot, camera, audio, ui, at: slotAt('canards') }), help: 'souris : viser · clic : tirer · 3 cartouches par vague · canard doré : 300 points', prizes: [1500, 700, 350, 150] },
  moto: { mod: createMoto({ scene: homeRoot, camera, audio, ui, at: slotAt('moto') }), help: 'z ou k : gaz · espace : turbo, ça chauffe · q d : couloir · en l\'air z s : pencher la moto, atterris parallèle à la pente', prizes: [1500, 700, 350, 150] },
  ballons: { mod: createBallons({ scene: homeRoot, camera, audio, ui, at: slotAt('ballons') }), help: 'espace : battre des bras · q d : dériver · tombe sur les ballons des autres · évite l\'eau et les étincelles', prizes: [1500, 700, 350, 150] },
  empile: { mod: createEmpile({ scene: homeRoot, camera, audio, ui, at: slotAt('empile') }), help: 'q d : déplacer · z : tourner · s : descendre · espace : lâcher · 2, 3 ou 4 lignes d\'un coup envoient des gravats', prizes: [1500, 700, 350, 150] },
  bagarre: { mod: createBagarre({ scene: homeRoot, camera, audio, ui, at: slotAt('bagarre') }), help: '3 vies · j : attaque (+ direction) · k : spécial · z + k : remontée · shift : bouclier · éjecte-les hors de l\'arène', prizes: [1500, 700, 350, 150] },
  batballons: { mod: createBatballons({ scene: homeRoot, camera, audio, ui, at: slotAt('batballons') }), help: 'zqsd · shift : saut et dérapage · espace : objet (s + espace : vers l\'arrière) · r : retour au fort', prizes: [1500, 700, 350, 150] },
  // under the church: the cursed nave, in first person
  painkiller: { mod: createPainkiller({ scene: homeRoot, camera, audio, ui }), where: 'dans la crypte sous l\'église', help: 'zqsd · espace (garde-le : bunny hop) · clic : tir · clic droit : secondaire · 1 2 3 : armes', prizes: [2500, 1200, 600, 300] },
  // the 2D games draw on their own canvas over the world: no mouse to hold
  nes: { mod: createNes({ audio, ui }), screen: true, help: 'flèches / zqsd · espace pour sauter · shift pour courir', prizes: [1800, 900, 450, 200] },
  worms: { mod: createWorms({ audio, ui }), screen: true, help: 'au tour par tour · chaque taupe a son tour', prizes: [1500, 700, 350, 150] },
  encre: { mod: createEncre({ audio, ui }), screen: true, help: 'zqsd · espace pour sauter · clic ou j pour tirer · shift pour nager', prizes: [1600, 600], value: (r) => r.pct },
  // mars: the pod race, in its own canyon (the terminal is in the martian hall)
  podrace: { mod: createPodrace({ scene, camera, audio, ui }), help: '3 tours · z : gaz · q d : piloter · shift : boost (ça chauffe) · r : revenir sur la piste', prizes: [2500, 1300, 700, 350, 150, 80] },
  // mars: potatoes in the hab
  potato: { mod: createPotato({ audio, ui }), screen: true, help: 'zqsd · e pour agir · x pour lâcher · tiens jusqu\'au sauvetage', prizes: [2200, 1200, 700, 300] },
  survie: { mod: createSurvie({ audio, ui }), screen: true, help: 'zqsd · e sortir, monter, fouiller · espace panneaux · f réparer · m carte', prizes: [2500, 1300, 600, 250] },
  tycoon: { mod: createTycoon({ audio, ui, eco, pay: (v, text) => reward(v, text), save: () => save() }), screen: true, help: 'souris · la colonie tourne même sans toi', prizes: [0] },
  invaders: { mod: createInvaders({ audio, ui }), screen: true, help: 'q d ou ← → : bouger · espace : tirer · abats la vague avant qu\'elle ne touche la lune', prizes: [1500, 700, 350, 150] },
  shooter: { mod: createShooter({ audio, ui }), screen: true, help: 'zqsd ou flèches : voler · espace : tirer · e : bombe · ramasse les capsules', prizes: [1800, 900, 450, 200] },
  // the church organ's rhythm game, at the console
  orgue: { mod: createOrgue({ scene: homeRoot, camera, audio, ui, organ, church: CH }), help: 'les notes au passage de la ligne · maintenir les longues · shift : grand jeu', prizes: [1500, 700, 350, 150] },
  // the crypt's secret: an island far off, reached from the table under the nave
  worms3d: { mod: createWorms3d({ scene, camera, ui }), help: 'zqsd : ramper · espace : sauter · souris : viser · clic maintenu : tirer · 1…0, molette : armes', prizes: [2500, 1000, 500, 200] },
  // the moon arcade
  comic: { mod: createComic({ audio, ui }), screen: true, help: 'flèches / zqsd · espace pour sauter · j pour tirer · e pour les portes · k pour la baguette', prizes: [2000, 900, 450, 200] },
  pvz: { mod: createPvz({ audio, ui }), screen: true, help: 'souris : ramasser les étoiles, choisir une carte, planter · 1 à 9 : cartes · clic droit : annuler', prizes: [1800, 800, 400, 150] },
  marioportal: { mod: createMarioPortal({ audio, ui }), screen: true, where: 'sur la borne de la cave secrète', help: 'q d · espace pour sauter · shift pour courir · souris et clics pour les portails', prizes: [2000, 1000, 500, 200] },
};
let race = null;
const raceReturn = { pos: new THREE.Vector3(), yaw: 0 };
// ---------- the moon and mars: a game hall, a grandstand, the orbital grand prix ----------
const space = createSpaceArcade({ has: (id) => !!RACES[id] && !!GAMES[id], name: (id) => GAMES[id]?.name || id });
const orbit = createSpaceRace({ ui, audio, pay: (n) => { if (!EXPLORE && !eco.pay(n)) return false; ui.setCoins(eco.s.money, true); return true; }, earn: (v, text) => { reward(v, text); save(); }, me: () => onPlanet() ? moonP.pos : null });
moonP.setSolid((p, r) => onPlanet() && (space.solid(here, p, r) || orbit.solid(here, p, r)));
// where a game's world is: its scenery and its sky (null: a 2D game, played on any screen)
const gameView = (id) => RACES[id]?.world ?? spaceWorld(id) ?? (RACES[id]?.screen ? null : 'home');
// the glass a 2D game is played on: the game room at home, a terminal in a planet's hall
const screenOf = (id) => here === 'home' ? house.room?.screens?.[id] : onPlanet() ? space.screen(here, id) : null;
// watching the orbital grand prix from the grandstand
let watchAt = 0;
function startWatch() {
  if (!orbit.watch(here)) return;
  watchAt = performance.now();
  state = 'watch'; digging = false; throwing = false;
  player.disable(); ui.prompt(''); ui.cross('');
  document.body.classList.add('in-kart');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.pickup(1);
}
function stopWatch() {
  if (state !== 'watch') return;
  orbit.unwatch();
  document.body.classList.remove('in-kart');
  document.getElementById('mg').classList.add('hidden');
  state = 'play'; player.enable(); relock();
}
addEventListener('keydown', (e) => {
  if (state !== 'watch' || e.repeat) return;
  // the e that opened the view is still going round the listeners
  if ((e.code === 'KeyE' && performance.now() - watchAt > 250) || e.code === 'Escape') stopWatch();
  else if (e.code === 'KeyA' || e.code === 'ArrowLeft') orbit.cycle(-1);
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') orbit.cycle(1);
  else if (e.code === 'KeyC') orbit.toggleCam();
  else if (e.code === 'KeyB') orbit.placeBet();
});
const myId = () => net?.id ?? 'me';
// who races: me, and everyone else in the garden (they all join), sorted so every client agrees
const myName = () => MULTI ? (params.get('name') || 'creuseur') : 'toi';
function raceHumans(roster = null) {
  const hs = [{ id: myId(), name: myName(), color: net?.color ?? 0xc8581a, me: true }];
  if (net) for (const [id, p] of net.peers) if (roster ? roster.includes(id) : p.w === 'home') hs.push({ id, name: p.name, color: p.color, me: false });
  return hs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
function startRace(id, { seed = Math.floor(Math.random() * 1e9), hostId = myId(), roster = null, opts = null } = {}) {
  if (race) quitRace(null, true);
  else { raceReturn.pos.copy(onPlanet() ? moonP.pos : player.pos); raceReturn.yaw = player.yaw; }
  mg.stop(false);
  state = 'kart'; digging = false;
  player.disable();
  document.body.classList.add('in-kart');
  race = { id, ...RACES[id], opts, view: gameView(id) };
  applyView();
  race.mod.start({ seed, opts: opts || {}, humans: raceHumans(roster), hostId, meId: myId(), send: (fx) => net?.sendFx({ k: 'race', race: id, f: fx }) });
  if (race.screen) {
    const scr = screenOf(id);
    race.onScreen = scr || null; race.screenT = 0;
    race.mod.setRect?.(null);
    if (scr) { document.body.classList.add('on-screen'); screenView(0); }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  else {
    const mode = opts?.mode && race.mod.modes?.find(m => m.id === opts.mode);
    ui.layer(GAMES[id].name + (mode ? ' · ' + mode.name : ''), mode?.help || race.help);
  }
  syncPauseQuit();
}
function quitRace(result, silent = false) {
  if (!race) return;
  const r = race;
  race = null;
  r.mod.stop();
  applyView();
  document.body.classList.remove('in-kart', 'on-screen');
  document.getElementById('mg').classList.add('hidden');
  syncPauseQuit();
  if (silent) return;
  if (state === 'paused') { ui.el.resume.classList.add('hidden'); pausedFrom = 'play'; }
  state = 'play';
  player.pos.copy(raceReturn.pos); player.yaw = raceReturn.yaw; player.vel.set(0, 0, 0);
  // on a planet, the astronaut is back where it stood (in the hall, most likely)
  if (onPlanet()) { moonP.pos.copy(raceReturn.pos); moonP.vel.set(0, 0, 0); T().setFocus(moonP.pos); }
  player.enable();
  camera.up.set(0, 1, 0);
  if (!result && r.mod.leave) result = r.mod.leave();   // a long-running game: leaving isn't giving up
  if (result?.quiet) { if (result.text) ui.hint(result.text, 4000); save(); return; }
  if (!result) { ui.toast(r.screen ? 'partie abandonnée' : 'course abandonnée'); return; }
  const mode = r.opts?.mode && r.mod.modes?.find(m => m.id === r.opts.mode);
  const first = !mode || mode.id === r.mod.modes[0].id;
  const value = result.value ?? (r.value ? r.value(result) : result.time);
  const lower = mode && 'lower' in mode ? mode.lower : GAMES[r.id].lower;
  const best = result.place === 1 && value != null && record(first ? r.id : r.id + ':' + mode.id, value, lower);
  const text = result.text ?? `${result.place === 1 ? '1re' : result.place + 'e'} place sur ${result.of} en ${mg.fmt(result.time)}`;
  reward(r.prizes[Math.min(result.place, r.prizes.length) - 1], text + (best ? ' · nouveau record !' : ''));
  if (result.place === 1 && r.id === 'kart') unlock('kart');
  if (result.place === 1 && r.id === 'worms3d') unlock('lombrics');
  save();
}
for (const r of Object.values(RACES)) r.mod.onEnd = (res) => quitRace(res);
// the sky of the world being looked at: a game's own (the kart from the moon is raced under the garden's sky)
const viewNow = () => race?.view || gm?.prev?.view || here;
function applyView() { const v = viewNow(); world.setSpace(onPlanet(v) ? v : false); }
// the 2D games are played on a screen of the game room upstairs: the camera walks up to it,
// and the game's canvas is laid exactly over the glass (away from home: the whole page)
const _sv = { a: new THREE.Vector3(), b: new THREE.Vector3(), side: new THREE.Vector3(), c: new THREE.Vector3() };
function screenView(dt) {
  const scr = race.onScreen;
  if (!scr) return;
  race.screenT = Math.min(1, (race.screenT || 0) + dt / 1.1);
  placeOnScreen(scr, race.mod, race.screenT);
}
// the camera in front of a screen of the game room, the game's canvas laid on the glass; `back` > 1 stands further off
// `frame` ({ w, cx }): the screen takes that share of the page's width, centred at cx — between the menu and its panels
function placeOnScreen(scr, mod, t, frame = null) {
  const k = 1 - Math.pow(1 - t, 3);
  // far enough for the glass to fill ~70 % of the height (and of the width), a little closer as it settles
  const vf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const fit = Math.max(scr.h / 2 / vf / .7, scr.w / 2 / (vf * camera.aspect) / .8);
  const d = frame ? scr.w / (2 * vf * camera.aspect * frame.w) * (1.6 - .6 * k) : fit * (1.9 - .9 * k);
  const pan = frame ? (frame.cx * 2 - 1) * d * vf * camera.aspect : 0;
  camera.position.copy(scr.center).addScaledVector(scr.normal, d);
  camera.up.copy(scr.up);
  // looking a little beside the screen moves it across the page
  _sv.side.crossVectors(scr.up, scr.normal).normalize();
  camera.lookAt(_sv.a.copy(scr.center).addScaledVector(_sv.side, -pan));
  camera.updateMatrixWorld();
  // the four corners on the page
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _sv.c.copy(scr.center).addScaledVector(_sv.side, sx * scr.w / 2).addScaledVector(scr.up, sy * scr.h / 2).project(camera);
    const px = (_sv.c.x + 1) / 2 * innerWidth, py = (1 - _sv.c.y) / 2 * innerHeight;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  mod.setRect?.({ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) });
}

// kept for the tests and the curious
const kart = RACES.kart.mod;
const startKart = () => startRace('kart'), quitKart = (res) => quitRace(res);
function raceHud() {
  const h = race.mod.hud(), el = document.getElementById('mg');
  el.classList.toggle('hidden', !!h.hidden);
  if (h.hidden) return;
  const title = GAMES[race.id].name;
  if (h.count != null) { el._h = null; el.innerHTML = `<b>${title}</b><span class="big">${h.count > 0 ? h.count : 'partez !'}</span>`; return; }
  if (h.html != null) { if (el._h !== h.html) { el.innerHTML = h.html; el._h = h.html; } return; }
  const hex = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');
  const board = h.board ? `<div class="board">${h.board.map((b, n) => `<span style="color:${hex(b.color)}">${n + 1}. ${b.me ? '<em>toi</em>' : b.name}</span>`).join('')}</div>` : '';
  el._h = null;
  el.innerHTML = `<b>tour ${h.lap} / ${h.laps}</b><span class="big">${h.place}${h.place === 1 ? 're' : 'e'} / ${h.of}</span><span>${mg.fmt(h.time)}${h.item ? ' · <em>' + h.item + '</em> (espace)' : ''}${h.wrong ? ' · <em>mauvais sens !</em>' : ''}</span>${h.extra ? `<span>${h.extra}</span>` : ''}${board}`;
}

// ---------- a game offered online: the lobby ----------
// Picking a game at the arcade offers it to everyone, wherever they are. Players press « prêt »;
// from two ready, a 10 s countdown (time to take the teleporter home); at zero the host sends the
// list of the ready ones and they all start together, on the same seed.
const SCREEN_GAMES = new Set(['nes', 'encre', 'worms', 'potato', 'survie', 'tycoon', 'invaders', 'shooter', 'comic', 'pvz', 'marioportal']);   // played on a screen: from anywhere
const CAVE_GAMES = new Set(['bomber', 'canards', 'empile', 'ballons', 'moto', 'bagarre', 'batballons']);   // dioramas in the secret cave
// the races (their own scenery) can be joined from a planet too; the garden's games only from the garden
const playableHere = (g) => here === 'home' || SCREEN_GAMES.has(g) || !!RACES[g]?.screen || (onPlanet() && !!RACES[g]);
function launchGame(g, seed = Math.floor(Math.random() * 1e9), hostId = null, roster = null, opts = null) {
  const players = raceHumans(roster);
  if (RACES[g]) startRace(g, { seed, hostId: hostId ?? myId(), roster, opts });
  else mg.start(g, { seed, humans: players.length, players, send: (fx) => net?.sendFx({ k: 'mgp', g, ...fx }) });
  syncPauseQuit();
}
const lobbyEl = document.getElementById('lobby');
const $l = (id) => document.getElementById(id);
let lobby = null;   // { g, seed, host, ready: Map(id → name), count, left, forced, waitGo }
let modesFor = null;
// picking a game (a pedestal, the arcade) opens its own title screen
function offerGame(g) { openGameMenu(g, { host: true }); }
function openLobby(g, opts) {
  if (lobby && lobby.host === myId()) net.sendFx({ k: 'lobby', t: 'cancel', seed: lobby.seed });
  lobby = { g, opts, seed: Math.floor(Math.random() * 1e9), host: myId(), ready: new Map([[myId(), myName()]]), count: null };
  net.sendFx({ k: 'lobby', t: 'open', g, opts, seed: lobby.seed });
  showLobby();
  ui.toast('partie proposée à tout le monde', false, 1800);
}

// ---------- a mini-game's own title screen ----------
// Its scenery behind (the module started, frozen, the camera circling its start or facing its screen),
// its modes for the one who starts it, who is ready, the countdown. Solo: « jouer » starts it.
const GAME_KEYS = {
  kart: [['z q s d', 'piloter'], ['shift', 'déraper · mini-turbo'], ['espace', 'objet'], ['r', 'revenir sur la piste']],
  rc: [['z q s d', 'piloter'], ['shift', 'frein à main'], ['espace', 'arme'], ['r', 'replacer la voiture']],
  podrace: [['z', 'gaz'], ['q d', 'piloter'], ['s', 'freiner'], ['shift', 'boost · ça chauffe'], ['r', 'revenir sur la piste']],
  nes: [['← →', 'courir'], ['espace', 'sauter'], ['shift', 'sprinter'], ['r', 'dernier drapeau']],
  invaders: [['q d', 'bouger'], ['← →', 'bouger aussi'], ['espace', 'tirer']],
  shooter: [['z q s d', 'voler'], ['espace', 'tirer (garder appuyé)'], ['e', 'bombe'], ['shift', 'ralentir, viser fin']],
  encre: [['q d', 'bouger'], ['espace', 'sauter'], ['clic', 'tirer'], ['shift', 'nager, grimper'], ['e', 'déluge'], ['r', 'retour à la base']],
  peinture: [['z q s d', 'marcher'], ['clic', 'tirer de la peinture']],
  laser: [['z q s d', 'marcher'], ['clic', 'tirer'], ['maison', 'zone sûre']],
  taupe: [['clic', 'taper les taupes']],
  pile: [['clic', 'creuser'], ['e', 'valider la profondeur']],
  tresor: [['clic', 'creuser'], ['thermo', 'chaud / froid']],
  orgue: [['d f j k', 'jouer les notes'], ['shift', 'grand jeu']],
  comic: [['← →', 'marcher'], ['espace', 'sauter (garder : plus haut)'], ['j', 'tirer (il faut du cola)'], ['e', 'ouvrir une porte'], ['k', 'baguette : se téléporter'], ['r', 'revenir au dernier sol sûr']],
  pvz: [['clic', 'étoiles, cartes, planter'], ['1 … 9', 'choisir une carte'], ['0', 'la pelle'], ['clic droit', 'annuler'], ['flèches espace', 'planter au clavier']],
  painkiller: [['z q s d', 'courir'], ['espace', 'sauter · bunny hop'], ['clic', 'tir'], ['clic droit', 'secondaire'], ['1 2 3', 'armes']],
};
const DEFAULT_KEYS = [['z q s d', 'marcher'], ['clic', 'creuser'], ['espace', 'sauter'], ['r', 'remonter']];
const gmEl = document.getElementById('gamemenu'), $g = (id) => document.getElementById(id);
const escH = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let gm = null;   // { g, host, opts, prev, t }
const defaultOpts = (g) => { const m = RACES[g]?.mod.modes; return m?.length ? { mode: m[0].id } : {}; };
function openGameMenu(g, { host = true } = {}) {
  if (!GAMES[g]) return;
  if (gm) closeGameMenu(true);
  if (state === 'panel' || state === 'read') { ui.el.shop.classList.add('hidden'); ui.el.reader.classList.add('hidden'); panelKind = null; }
  gm = { g, host, opts: host ? defaultOpts(g) : (lobby?.opts || defaultOpts(g)), t: 0 };
  state = 'gamemenu'; digging = false; throwing = false;
  player.disable(); ui.prompt('');
  document.body.classList.add('in-menu');
  if (document.pointerLockElement) document.exitPointerLock();
  startPreview();
  renderGameMenu(true);
  gmEl.classList.remove('hidden');
  if (host && net?.online && net.peers.size) openLobby(g, gm.opts);
  audio.pickup(1);
}
function closeGameMenu(silent = false) {
  if (!gm) return;
  stopPreview();
  gm = null;
  gmEl.classList.add('hidden');
  document.body.classList.remove('in-menu');
  if (silent) return;
  state = 'play'; player.enable(); camera.up.set(0, 1, 0);
  relock();
}
function gameMenuBack() {
  if (!gm) return;
  if (lobby && lobby.g === gm.g && lobby.ready.has(myId())) setReady(false);
  closeGameMenu();
}
function gameMenuPlay() {
  if (!gm) return;
  const g = gm.g, multi = lobby && lobby.g === g;
  if (!multi) { const opts = gm.opts; closeGameMenu(true); state = 'play'; player.enable(); launchGame(g, undefined, null, null, opts); return; }
  if (gm.host) { if (lobby.count == null) { lobby.forced = true; hostCheck(); renderLobby(); } }
  else setReady(!lobby.ready.has(myId()));
}
function pickMode(id) {
  if (!gm || !gm.host || gm.opts.mode === id) return;
  gm.opts = { mode: id };
  startPreview();
  if (lobby && lobby.host === myId() && lobby.g === gm.g) { lobby.opts = gm.opts; net.sendFx({ k: 'lobby', t: 'opts', seed: lobby.seed, opts: gm.opts }); }
  audio.tick();
  renderGameMenu();
}
function renderGameMenu(fresh = false) {
  if (!gm) return;
  const g = gm.g, mods = RACES[g]?.mod.modes || [], me = myId();
  const multi = !!lobby && lobby.g === g, ready = multi && lobby.ready.has(me);
  $g('gm-title').textContent = GAMES[g].name;
  document.querySelector('.gm-head').classList.toggle('long', GAMES[g].name.length > 14);
  $g('gm-kicker').textContent = multi ? (gm.host ? 'ta partie · en ligne' : `${net.peers.get(lobby.host)?.name ?? '?'} propose`)
    : RACES[g]?.where || (spaceWorld(g) ? (spaceWorld(g) === 'moon' ? 'sur la lune' : 'sur mars') : SCREEN_GAMES.has(g) ? 'sur un écran de la salle de jeux' : g === 'kart' ? 'autour du village' : g === 'jetski' ? 'dans la fontaine de la place' : g === 'orgue' ? 'à l\'orgue de l\'église' : CAVE_GAMES.has(g) ? 'dans la cave secrète' : g === 'worms3d' ? 'dans la crypte, sous la nef' : RACES[g] ? 'dans les rues de la ville' : 'dans le jardin');
  const box = $g('gm-modes');
  if (fresh) {
    box.innerHTML = mods.map((m, i) => `<button type="button" class="btn btn--menu m-opt in" style="--i:${i + 2};--tilt:${i % 2 ? .5 : -.5}deg" data-mode="${m.id}" data-desc="${escH(m.sub)}"${gm.host ? '' : ' disabled'}>` +
      `<span class="btn__text"><span class="btn__label">${escH(m.name)}</span></span><span class="m-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>`).join('');
    box.querySelectorAll('.btn').forEach(b => b.insertAdjacentHTML('afterbegin', '<span class="btn__blob"></span>'));
    $g('gm-keys').innerHTML = (RACES[g]?.mod.keys || GAME_KEYS[g] || DEFAULT_KEYS).map(([k, what]) => `<div class="krow"><span class="kk">${k.split(' ').map(x => `<b${x.length > 2 ? ' class="wide"' : ''}>${escH(x)}</b>`).join('')}</span><span>${escH(what)}</span></div>`).join('');
    $g('gm-play').dataset.desc = GAMES[g].sub;
    $g('main-desc-text2').textContent = GAMES[g].sub;
  }
  box.querySelectorAll('.m-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === gm.opts.mode)));
  const counting = multi && lobby.count != null, left = counting ? Math.max(0, Math.ceil(lobby.left)) : 0;
  const n = multi ? lobby.ready.size : 1;
  const mode = mods.find(m => m.id === gm.opts.mode);
  let label, sub;
  if (!multi) { label = 'jouer'; sub = mode ? mode.name : 'solo'; }
  else if (gm.host) { label = counting ? `départ dans ${left}` : 'lancer'; sub = counting ? 'les autres peuvent encore rejoindre' : `${n} prêt${n > 1 ? 's' : ''} · départ auto dès 2`; }
  else { label = ready ? 'plus prêt' : 'prêt !'; sub = counting ? `départ dans ${left}` : 'l\'hôte choisit le mode'; }
  $g('gm-play-label').textContent = label; $g('gm-play-sub').textContent = sub;
  gmEl.classList.toggle('is-ready', !gm.host && ready);
  // who's there (online), else the record
  $g('gm-players-title').textContent = multi ? 'joueurs' : 'record';
  if (multi) {
    const everyone = [{ id: me, name: 'toi', color: net.color }, ...[...net.peers].map(([id, p]) => ({ id, name: p.name, color: p.color }))];
    $g('gm-list').innerHTML = everyone.map(p => `<div class="gm-p${lobby.ready.has(p.id) ? ' on' : ''}"><i style="background:${hexc(p.color)}"></i><span>${escH(p.name)}</span><em>${p.id === lobby.host ? 'hôte' : lobby.ready.has(p.id) ? 'prêt' : 'pas prêt'}</em></div>`).join('');
  } else $g('gm-list').innerHTML = '';
  const key = mode && mods[0] && mode.id !== mods[0].id ? g + ':' + mode.id : g, rec = (eco.s.records || {})[key];
  $g('gm-record').innerHTML = rec != null ? `ton record : <b>${escH(fmtRecord(mode?.unit || GAMES[g].unit, rec))}</b>` : multi ? '' : 'pas encore de record · à toi de jouer';
  const c = $g('gm-count');
  c.classList.toggle('hidden', !counting);
  c.classList.toggle('hot', counting && left <= 3);
  if (counting && $g('gm-count-n').textContent !== String(left)) { const el = $g('gm-count-n'); el.textContent = left; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
}
$g('gm-play').addEventListener('click', () => gameMenuPlay());
$g('gm-back').addEventListener('click', () => gameMenuBack());
$g('gm-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b && !b.disabled) pickMode(b.dataset.mode); });

// the scenery behind the menu: the game itself, set up and frozen
const PREVIEW_SPOTS = { taupe: [-12.7, 1.6, 6, 3], laser: [0, -16, 15, 6], peinture: [0, -2, 13, 7] };
function stopPreview() {
  const pv = gm?.prev;
  if (!pv) return;
  gm.prev = null;
  pv.mod?.stop();
  applyView();
  document.body.classList.remove('on-screen');
  camera.up.set(0, 1, 0);
}
function startPreview() {
  stopPreview();
  const g = gm.g, r = RACES[g], me = myId();
  if (!r) { const s = PREVIEW_SPOTS[g] || [orbitTarget.x, orbitTarget.z, 15, 8]; gm.prev = { x: s[0], z: s[1], y: 0, rad: s[2], h: s[3], view: 'home' }; applyView(); return; }
  r.mod.start({ seed: 7, opts: gm.opts, humans: [{ id: me, name: myName(), color: net?.color ?? 0xc8581a, me: true }], hostId: me, meId: me, send: () => {} });
  const pv = gm.prev = { mod: r.mod, screen: r.screen, view: gameView(g) };
  applyView();
  if (r.screen) {
    pv.scr = screenOf(g);
    r.mod.setRect?.(null);
    if (pv.scr) document.body.classList.add('on-screen');
  } else {
    // the cave's games say themselves where to look from
    const own = r.mod.preview?.();
    const a = own || (g === 'kart' ? r.mod._dbg?.() : r.mod.me);
    Object.assign(pv, { x: a?.x ?? 0, z: a?.z ?? 0, y: a?.y ?? 0, yaw: a?.yaw ?? 0, rad: own?.rad ?? (g === 'kart' ? 10 : g === 'jetski' ? .9 : 2.6), h: own?.h ?? (g === 'kart' ? 3.8 : g === 'jetski' ? .3 : .9), follow: true });
  }
}
function updateGameMenu(dt) {
  if (!gm) return;
  gm.t += dt;
  const pv = gm.prev;
  if (!pv) return;
  if (pv.screen) {
    pv.mod.update(0, new Set());
    if (pv.scr) { pv.k = Math.min(1, (pv.k || 0) + dt / 1.1); placeOnScreen(pv.scr, pv.mod, pv.k, { w: .32, cx: .52 }); }
    return;
  }
  camera.up.set(0, 1, 0);
  if (pv.follow) {
    // behind the grid, down the track, swaying a little
    const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw), sw = Math.sin(gm.t * .35) * .35;
    camera.position.set(pv.x - fx * pv.rad + fz * sw * pv.rad, pv.y + pv.h + Math.sin(gm.t * .5) * .1 * pv.h, pv.z - fz * pv.rad - fx * sw * pv.rad);
    camera.lookAt(pv.x + fx * pv.rad * .8, pv.y + pv.h * .15, pv.z + fz * pv.rad * .8);
    return;
  }
  // a slow circle around the spot, looking at it
  const a = gm.t * .12;
  camera.position.set(pv.x + Math.sin(a) * pv.rad, pv.y + pv.h, pv.z + Math.cos(a) * pv.rad);
  camera.lookAt(pv.x, pv.y + pv.h * .25, pv.z);
}

// ---------- a game offered online: the lobby card ----------
function showLobby() {
  lobbyEl.classList.remove('hidden', 'out');
  lobbyEl.style.animation = 'none'; void lobbyEl.offsetWidth; lobbyEl.style.animation = '';
  renderLobby();
}
function closeLobby() {
  lobby = null;
  if (lobbyEl.classList.contains('hidden')) return;
  lobbyEl.classList.add('out');
  setTimeout(() => { if (!lobby) lobbyEl.classList.add('hidden'); }, 300);
}
const hexc = (c) => '#' + (c ?? 0xffffff).toString(16).padStart(6, '0');
function renderLobby() {
  if (gm) renderGameMenu();
  if (!lobby) return;
  const me = myId(), host = lobby.host === me, ready = lobby.ready.has(me);
  const mode = lobby.opts?.mode && RACES[lobby.g]?.mod.modes?.find(m => m.id === lobby.opts.mode);
  $l('lobby-game').textContent = GAMES[lobby.g].name + (mode ? ' · ' + mode.name : '');
  $l('lobby-kicker').textContent = host ? 'ta partie' : `${net.peers.get(lobby.host)?.name ?? '?'} propose`;
  const n = lobby.ready.size;
  $l('lobby-sub').textContent = lobby.count != null ? (lobby.left > 0 ? `départ dans ${Math.ceil(lobby.left)} s · il est encore temps` : 'c\'est parti…')
    : n < 2 ? 'il faut deux joueurs prêts pour lancer le décompte' : '';
  const everyone = [{ id: me, name: myName(), color: net.color }, ...[...net.peers].map(([id, p]) => ({ id, name: p.name, color: p.color }))];
  $l('lobby-list').innerHTML = everyone.map(p => `<span class="lb-p${lobby.ready.has(p.id) ? ' on' : ''}"><i style="background:${hexc(p.color)}"></i>${p.id === me ? 'toi' : p.name.replace(/[<>&]/g, '')}</span>`).join('');
  lobbyEl.classList.toggle('is-ready', ready);
  $l('lobby-ready').querySelector('.btn__label').textContent = ready ? (host ? 'annuler' : 'plus prêt') : 'prêt !';
  // the host can start alone (or with whoever is ready) without waiting for a second player
  $l('lobby-alt').classList.toggle('hidden', !(host && lobby.count == null && n < 2));
  const away = !playableHere(lobby.g);
  const w = $l('lobby-where');
  w.textContent = away ? 'reviens au jardin (téléporteur)' : SCREEN_GAMES.has(lobby.g) || RACES[lobby.g]?.screen ? 'se joue d\'où tu veux' : onPlanet() ? 'se joue d\'ici' : 'dans le jardin';
  w.classList.toggle('warn', away);
  const c = $l('lobby-count');
  c.classList.toggle('hidden', lobby.count == null);
  c.classList.toggle('hot', lobby.count != null && lobby.left <= 3);
}
function setReady(on) {
  if (!lobby) return;
  const me = myId();
  if (lobby.host === me && !on) { net.sendFx({ k: 'lobby', t: 'cancel', seed: lobby.seed }); closeLobby(); ui.toast('partie annulée'); return; }
  if (on) lobby.ready.set(me, myName()); else lobby.ready.delete(me);
  net.sendFx({ k: 'lobby', t: 'ready', seed: lobby.seed, on });
  audio.tick();
  hostCheck(); renderLobby();
}
// the host decides when the countdown starts, stops, and when everyone goes
function hostCheck() {
  if (!lobby || lobby.host !== myId()) return;
  const n = lobby.ready.size;
  if (lobby.count == null && (n >= 2 || lobby.forced)) { lobby.count = 10; lobby.left = 10; net.sendFx({ k: 'lobby', t: 'count', seed: lobby.seed }); audio.buy(); }
  else if (lobby.count != null && n < 2 && !lobby.forced) { lobby.count = null; net.sendFx({ k: 'lobby', t: 'uncount', seed: lobby.seed }); }
}
function onLobby(id, peer, fx) {
  // someone on the list who could not come (away from the garden): out of the game
  if (fx.t === 'out') { race?.mod.peerLeft(id); mg.rivalLeft(id); return; }
  if (fx.t === 'open') {
    lobby = { g: fx.g, opts: fx.opts || null, seed: fx.seed, host: id, ready: new Map([[id, peer.name]]), count: null };
    if (state !== 'attract') { showLobby(); audio.pickup(1); }
    return;
  }
  if (!lobby || fx.seed !== lobby.seed) return;
  if (fx.t === 'ready') { if (fx.on) lobby.ready.set(id, peer.name); else lobby.ready.delete(id); hostCheck(); }
  else if (fx.t === 'count') { lobby.count = 10; lobby.left = 10; audio.buy(); }
  else if (fx.t === 'uncount') lobby.count = null;
  else if (fx.t === 'opts') { lobby.opts = fx.opts; if (gm && !gm.host && gm.g === lobby.g) { gm.opts = fx.opts || {}; startPreview(); renderGameMenu(); } }
  else if (fx.t === 'cancel') { closeLobby(); if (gm && !gm.host) closeGameMenu(); ui.toast(`${peer.name} a annulé la partie`); return; }
  else if (fx.t === 'go') { go(fx.roster, id); return; }
  renderLobby();
}
function go(roster, hostId) {
  const l = lobby;
  closeLobby();
  if (gm) { const was = gm.g; closeGameMenu(!!(l && was === l.g && roster.includes(myId()))); }
  if (!l || !roster.includes(myId())) return;
  if (state === 'gamemenu') { state = 'play'; player.enable(); }
  if (!playableHere(l.g)) { ui.toast('tu n\'étais pas dans le jardin · partie ratée', true, 3000); net?.sendFx({ k: 'lobby', t: 'out', seed: l.seed }); return; }
  if (state === 'watch') stopWatch();
  if (['travel', 'launch', 'faint', 'win', 'attract'].includes(state)) { net?.sendFx({ k: 'lobby', t: 'out', seed: l.seed }); return; }
  if (state === 'paused') { ui.el.resume.classList.add('hidden'); state = pausedFrom; pausedFrom = 'play'; if (state === 'play') player.enable(); }
  if (state === 'panel' || state === 'read') closePanel();
  if (state === 'drive') exitVan();
  launchGame(l.g, l.seed, hostId, roster.filter(id => id !== myId()), l.opts);
  ui.hint(`« ${GAMES[l.g].name} » · ${roster.length} joueur${roster.length > 1 ? 's' : ''}`, 3000);
}
let lobbyT = 0;
function updateLobby(dt) {
  if (!lobby) return;
  lobbyEl.classList.toggle('hidden', state === 'attract');
  if ((lobbyT -= dt) <= 0) { lobbyT = .5; renderLobby(); }
  if (lobby.count == null) return;
  const before = Math.ceil(lobby.left);
  lobby.left -= dt;
  if (Math.ceil(lobby.left) !== before && lobby.left > 0) {
    const c = $l('lobby-count');
    c.textContent = Math.ceil(lobby.left); c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
    if (lobby.left <= 3) audio.tick();
    renderLobby();
  }
  if (lobby.left <= 0 && lobby.host === myId() && !lobby.waitGo) {
    lobby.waitGo = true;
    const roster = [...lobby.ready.keys()];
    net.sendFx({ k: 'lobby', t: 'go', seed: lobby.seed, roster });
    go(roster, myId());
  } else if (lobby.left < -4) { closeLobby(); ui.toast('la partie n\'a pas démarré', true); }
}
function readyFromCard() {
  if (!lobby) return;
  const on = !lobby.ready.has(myId());
  const canHere = state === 'play' && playableHere(lobby.g);
  if (on && canHere && !gm) openGameMenu(lobby.g, { host: false });
  setReady(on);
}
$l('lobby-ready').addEventListener('click', (e) => { e.stopPropagation(); readyFromCard(); });
$l('lobby-alt').addEventListener('click', (e) => { e.stopPropagation(); if (lobby && lobby.host === myId()) { lobby.forced = true; hostCheck(); renderLobby(); } });
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea') || e.repeat) return;
  if (e.code === 'KeyO' && lobby && !gm) readyFromCard();
  if (e.code === 'Escape' && state === 'gamemenu') gameMenuBack();
});

// the pause menu offers a way out of the game in progress
const pauseQuit = document.getElementById('set-quit');
function syncPauseQuit() { pauseQuit.classList.toggle('hidden', !race && !mg.active); }
pauseQuit.addEventListener('click', () => {
  if (race) quitRace(null); else { mg.stop(); syncPauseQuit(); }
  ui.el.resume.classList.add('hidden');
  if (state === 'paused') { state = 'play'; pausedFrom = 'play'; player.enable(); }
  lockPointer();
});

// ---------- the bomber: a random raid over the garden ----------
let planeHits = 0, raidHp = 100, raidAlert = false;
// the raids only concern the plot you dig (and the hole under it): the alert and the shaking stay there
function inDigZone() {
  const t = terrains.home;
  return here === 'home' && Math.abs(player.pos.x) < -t.X0 + 1 && Math.abs(player.pos.z) < -t.Z0 + 1;
}
function raidWarn() {
  raidAlert = false;
  audio.siren();
  ui.toast('alerte : un bombardier arrive ! à l\'abri !', true, 6000);
  hintOnce('plane', 'les bombes tombent sur le potager : la maison est un bon abri', 6000);
}
const plane = createPlane({
  scene: homeRoot, audio, getTerrain: () => terrains.home,
  onWarn() {
    planeHits = 0; raidHp = eco.s.health;
    raidAlert = true;
    if (inDigZone()) raidWarn();
  },
  onBomb(p) { if (here === 'home') bombs.boom('air', p); },
  onEnd() { raidAlert = false; if (here === 'home' && planeHits && state !== 'faint') unlock('plane'); },
  // it came down in the fields: a far boom, a flash
  onCrash(p) { if (here === 'home') { audio.boom(Math.max(.3, 1 - p.length() / 250)); bombs.boom('air', p); } },
});

// ---------- the bottom, and China ----------
function claimHeart() {
  if (eco.s.portal) { travel('china', 'through'); return; }
  if (!eco.s.guardians) { ui.toast('les taupes casquées le gardent encore', true); return; }
  win();
}

async function travel(to, how, arrive) {
  if (state === 'travel') return;
  const from = here;
  state = 'travel';
  digging = false;
  player.disable();
  if (document.pointerLockElement) document.exitPointerLock();
  audio.win();
  const title = to === 'mars' ? 'en route pour mars' : from === 'mars' ? 'retour sur terre, au japon' : to === 'moon' ? (how === 'portal' ? 'portail lunaire…' : 'en route pour la lune') : from === 'moon' ? 'retour sur terre' : how === 'through' ? 'tu traverses la terre' : how === 'globe' ? 'vol direct pour le japon' : how === 'tele' ? 'téléportation…' : 'retour à la maison';
  const km = to === 'mars' || from === 'mars' ? 225000000 : to === 'moon' || from === 'moon' ? 384400 : how === 'through' ? 12742 : 8900;
  await ui.travel(title, km, how === 'through' || onPlanet(to) || onPlanet(from) ? (to === 'mars' || from === 'mars' ? 4000 : 3000) : how === 'tele' ? 1100 : 2000);
  moles.clear(); guardiansUp = false;
  if (onPlanet(to)) setupPlanet(to);
  applyWorld(to);
  if (from === 'moon' && !arrive) arrive = PAD.clone().add(new THREE.Vector3(-3.2, .05, 2));
  if (from === 'mars' && !arrive) arrive = MARS_PAD.clone().add(new THREE.Vector3(6, .05, 3));
  player.pos.copy(arrive || (to === 'china' ? world.china.spawn : HOME_SPAWN));
  if (onPlanet(to)) {
    moonP.place(landerSpot(to));
    player.pos.copy(moonP.pos);
    eco.s.oxygen = eco.cur('o2').o2;
    // build the ground round the landing spot now, not a few chunks a frame
    T().setFocus(moonP.pos); T().flush(80);
    if (to === 'mars' && !eco.s.mars) {
      eco.s.mars = true;
      unlock('mars');
      setTimeout(() => ui.layer('mars', 'la planète rouge · gravité plus forte que la lune · surveille ton oxygène'), 400);
      setTimeout(() => hintOnce('mars', 'l\'oxygène se recharge près du module et du dôme · e au module pour vendre ou rentrer', 6000), 2600);
    }
  }
  if (to === 'moon') {
    if (!eco.s.moon) {
      eco.s.moon = true; eco.s.moonPortal = true;
      if (net) net.sendOp({ k: 'moonportal' });
      unlock('moon');
      setTimeout(() => ui.layer('la lune', 'gravité faible · surveille ton oxygène'), 400);
      setTimeout(() => hintOnce('moon', 'l\'oxygène se recharge près du module lunaire · e pour vendre ou rentrer', 6000), 2600);
    }
  }
  player.vel.set(0, 0, 0);
  player.yaw = arrive ? player.yaw : Math.PI; player.pitch = -0.05;
  padCool = 2;
  ui.endTravel();
  if (to === 'china' && !eco.s.china) {
    eco.s.china = true;
    unlock('china');
    setTimeout(() => ui.layer('japon', 'こんにちは · bienvenue de l\'autre côté'), 400);
    setTimeout(() => hintOnce('china', 'le konbini vend ce qu\'on ne trouve pas chez nous. le puits ou le téléporteur te ramènent à la maison.', 6000), 2500);
  }
  state = 'play'; player.enable(); lockPointer();
  save();
}

// ---------- the neighbours' houses: nobody's home, a few things worth taking ----------
// the upgrades a safe can hold: whatever the hardware store sells next, never China's
const STEALABLE = ['shovel', 'drill', 'bag', 'battery', 'lamp', 'boots', 'jet'];
let alarm = null;   // { house, t }
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function stealCoins(v, what) { eco.earn(v); ui.plus('+' + ui.fmt(v)); ui.setCoins(eco.s.money, true); return `${what} · +${ui.fmt(v)} ●`; }
function stealItem(ids) {
  const it = ids[Math.floor(Math.random() * ids.length)], n = rint(1, it === 'sup' ? 2 : 3);
  eco.give(it, n);
  return `+${n} ${ITEMS[it].name}`;
}
function stealUpgrade() {
  const ok = STEALABLE.filter(id => { const n = eco.next(id); return n && !n.china; });
  if (!ok.length) return null;
  const id = ok[Math.floor(Math.random() * ok.length)];
  eco.s.lv[id]++;
  applyUpgrades();
  return `évolution volée : ${eco.cur(id).name} !`;
}
function steal(h, spot) {
  if (spot.looted) { ui.toast('déjà vidé'); return; }
  spot.looted = true;
  const r = Math.random();
  let got;
  if (spot.kind === 'safe') got = (r < .45 && stealUpgrade()) || (r < .85 ? stealCoins(rint(400, 1800), 'des liasses de billets') : stealItem(['sup', 'dyn']));
  else if (spot.kind === 'drawer') got = r < .65 ? stealCoins(rint(60, 400), 'de la monnaie') : stealItem(['med', 'cell', 'ladder', 'dyn']);
  else if (spot.kind === 'shelf') got = r < .45 ? stealCoins(rint(30, 220), 'un billet dans un livre') : r < .75 ? stealItem(['ladder', 'dyn']) : null;
  else {
    eco.s.health = Math.min(100, eco.s.health + 40);
    got = r < .5 ? 'un sandwich · +40 vie' : `un sandwich · +40 vie · ${stealItem(['cell', 'med'])}`;
  }
  if (got) { audio.buy(); ui.toast(got, false, 2400); ui.wash(); }
  else { audio.deny(); ui.toast('que des vieux livres…'); }
  save();
  // some things are wired: a siren, and the police on the way
  if (!alarm && Math.random() < spot.alarm) {
    alarm = { house: h, t: 10, shown: 11 };
    audio.siren(); ui.hurt();
    ui.hint(`alarme chez ${h.name} ! sors avant l'arrivée de la police`, 3500);
  }
}
function updateAlarm(dt) {
  if (!alarm) return;
  alarm.t -= dt;
  const inside = world.neighbours.insideOf(player.pos) === alarm.house;
  if (!inside) {
    world.neighbours.lock(alarm.house);
    ui.toast('ouf, personne ne t\'a vu… la maison est fermée à clé jusqu\'à demain', false, 3000);
    alarm = null;
    return;
  }
  if (Math.ceil(alarm.t) < alarm.shown) { alarm.shown = Math.ceil(alarm.t); ui.toast(`alarme ! ${alarm.shown} s avant la police`, true, 1000); audio.tick(); }
  if (alarm.t > 0) return;
  // caught red-handed: a fine, and a ride home
  const fine = EXPLORE ? 0 : Math.min(eco.s.money, Math.max(50, Math.round(eco.s.money * .25)));
  eco.s.money -= fine;
  ui.setCoins(eco.s.money, true);
  world.neighbours.lock(alarm.house);
  alarm = null;
  player.pos.copy(HOME_SPAWN); player.vel.set(0, 0, 0); player.yaw = Math.PI; player.pitch = -.15; player.unstick();
  ui.wash(); audio.full();
  ui.hint(`la police t'a attrapé · amende de ${ui.fmt(fine)} ● · retour à la maison`, 5000);
  save();
}

// ---------- the van ----------
const seat = new THREE.Vector3();
function enterVan() {
  delivery.steal();
  ui.prompt(''); ui.cross('');
  state = 'drive';
  digging = false;
  player.disable();
  audio.horn();
  hintOnce('van', 'zqsd pour conduire · espace pour klaxonner · e pour descendre. le trou est juste là…', 6000);
}
function exitVan() {
  if (delivery.driving !== 'stolen') return;
  delivery.park();
  const v = delivery.van;
  player.pos.set(v.position.x + Math.sin(delivery.yaw) * 1.6, 0.05, v.position.z + Math.cos(delivery.yaw) * 1.6);
  player.unstick();
  player.yaw = delivery.yaw - Math.PI / 2; player.pitch = 0;
  state = 'play'; player.enable();
}
delivery.onCrash = (pos, cargo, speed) => {
  audio.boom(1.2);
  shakeT = 0.8;
  debris.burst(pos, new THREE.Vector3(0, 1, 0), 0xf0e8d6, 30, 2);
  unlock('van');
  if (cargo) for (const o of cargo) eco.give(o.item);
  player.pos.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
  player.vel.set(0, 3, 0);
  player.unstick();
  state = 'play'; player.enable();
  hurt(Math.min(35, speed * 0.8));
  ui.toast(cargo ? 'la camionnette est au fond du trou… et les colis avec toi' : 'la camionnette est au fond du trou', false, 3200);
};
delivery.onArrive = (cargo) => {
  if (here !== 'home') return;
  if (cargo.length) ui.toast('un colis vient d\'arriver devant la porte', false, 2600);
  else if (player.pos.y > -2) ui.toast('la camionnette de livraison s\'arrête devant chez toi…', false, 2600);
};

// ---------- the key to upstairs ----------
function takeKey() {
  if (eco.s.upKey) return;
  eco.s.upKey = true;
  quest.take();
  house.room.setUnlocked(true, true);
  audio.win(); ui.wash(); shakeT = Math.max(shakeT, .15);
  debris.burst(quest.pos.clone(), new THREE.Vector3(0, 1, 0), 0xffc629, 18, 1.2);
  ui.layer('la clef de l\'étage', 'la porte du haut est ouverte · les mini-jeux t\'attendent');
  save();
}

// ---------- the headset under the bed: someone else's show, we just hand over ----------
async function startReveal() {
  if (state !== 'play' || reveal.playing) return;
  state = 'reveal'; digging = false; throwing = false;
  player.disable(); ui.prompt(''); ui.cross('');
  if (document.pointerLockElement) document.exitPointerLock();
  ui.el.hud.classList.add('hidden');
  try { await reveal.play(); } catch (e) { console.warn('reveal', e); }
  ui.el.hud.classList.remove('hidden');
  state = 'play'; player.enable(); player.applyCamera(); lockPointer();
}

// ---------- stations ----------
function interact(it) {
  if (crypt.interact(it)) return;
  switch (it.id) {
    case 'sell': {
      if (!eco.s.sackN) { audio.deny(); ui.toast('rien à vendre', true); return; }
      const fair = seasonNow === 2;
      const { v, n } = eco.sellAll(fair ? 1.25 : 1);
      if (fair) setTimeout(() => ui.toast('foire d\'automne : +25 %'), 1500);
      audio.sell();
      ui.plus('+' + ui.fmt(v)); ui.wash();
      ui.setCoins(eco.s.money, true);
      ui.setBag(0, eco.cap, true);
      ui.toast(`${n} trouvaille${n > 1 ? 's' : ''} vendue${n > 1 ? 's' : ''}`);
      if (eco.s.earned >= 5000) unlock('rich');
      if (eco.next('shovel') && eco.s.money >= eco.next('shovel').price) hintOnce('afford', 'de quoi s\'offrir une meilleure pelle, à la quincaillerie', 4000);
      save();
      return;
    }
    case 'door': house.toggleDoor(); audio.step(); return;
    case 'updoor':
      if (house.room.locked) { audio.deny(); ui.toast('fermée à clef · creuse pour trouver la clef', true, 2600); return; }
      house.room.toggleDoor(); audio.step();
      return;
    case 'vr': startReveal(); return;
    case 'trapdoor': goCave(true); return;
    case 'caveup': goCave(false); return;
    case 'pgun': takeGun(); return;
    case 'dgun': takeLauncher(); return;
    case 'sdoor': setDoor(it.w, it.i, !doorOf(it)?.open, true); return;
    case 'organ': playOrgan((organSong + 1) % SONGS.length, true); return;
    case 'egg': audio.tick(); ui.toast('trois clefs, trois portes… et un œuf. il y a toujours quelque chose de caché, même sous un lit', false, 3600); return;
    case 'bed': {
      ui.veil(1);
      setTimeout(() => { eco.s.health = 100; ui.veil(0); ui.toast('requinqué · partie sauvegardée'); unlock('nap'); save(); }, 900);
      return;
    }
    case 'charger':
      if (eco.s.battery >= eco.batteryMax) { ui.toast('la batterie est déjà pleine'); return; }
      chargeT = 1.2; audio.charge(); ui.toast('ça charge…');
      return;
    case 'globe':
      hologram.setDepth(eco.s.best);
      ui.toast(hologram.toggle(terrains.home) ? 'le trou, vu à travers la terre' : 'hologramme éteint');
      audio.tick();
      return;
    case 'well': travel('home', 'well'); return;
    case 'parcel': openParcels(); return;
    case 'reset':
      house.pressReset(); audio.tick();
      if (!resetArmed) {
        resetArmed = true;
        ui.toast('appuie encore : le trou sera rebouché, une nouvelle carte t\'attend', true, 3000);
        setTimeout(() => { resetArmed = false; }, 3000);
        return;
      }
      resetArmed = false;
      resetMap(Math.floor(Math.random() * 1e9), true);
      return;
    case 'superreset': house.pressSuper(); audio.tick(); openSuperPw(); return;
    case 'letters': openReader(eco.s.letters[eco.s.letters.length - 1]); return;
    case 'van': enterVan(); return;
    case 'arcade': openPanel('arcade'); return;
    case 'rocket':
      if (PARTS.every(q => eco.s.parts[q.id])) launch('moon');
      else { audio.deny(); ui.toast('il manque des pièces', true); }
      return;
    case 'lander': openPanel('lander'); return;
    case 'deck': startWatch(); return;
    case 'marsrocket':
      if (!eco.s.moon && !EXPLORE) { audio.deny(); ui.toast('il faut d\'abord être allé sur la lune', true); return; }
      launch('mars');
      return;
    case 'ndoor':
      if (it.house.locked) { audio.deny(); ui.toast('fermé à clé', true); return; }
      world.neighbours.toggleDoor(it.house); audio.step();
      return;
    case 'loot': steal(it.house, it.spot); return;
    case 'lift': useLift(); return;
    default:
      // the pedestals upstairs: one game each
      if (it.game) { offerGame(it.game); return; }
      openPanel(it.id);
  }
}

// ---------- the secret cave, and the portal gun ----------
function goCave(down) {
  ui.veil(1); audio.step();
  setTimeout(() => {
    player.pos.copy(down ? cave.entry : cave.exit); player.vel.set(0, 0, 0); player.stats.away = down;
    player.yaw = down ? Math.PI : 0; player.pitch = 0; player.unstick();
    ui.veil(0);
    if (down && !eco.s.caveSeen) { eco.s.caveSeen = true; ui.layer('la cave secrète', 'des jeux d\'un autre temps… et un drôle de pistolet'); save(); }
  }, 450);
}
function takeGun() {
  if (!cave.gunReady) { audio.deny(); ui.toast('le socle est vide · il en revient un bientôt', true); return; }
  if (eco.s.portal) { ui.toast('tu as déjà le tien · g pour le sortir'); return; }
  eco.s.portal = true; eco.s.tool = 'portal';
  // gone for everyone, back in two minutes for the next one
  cave.takeGun(); net?.sendFx({ k: 'pgun', left: GUN_REGEN });
  audio.win(); ui.layer('le pistolet à portails', 'clic gauche : portail bleu · clic droit : orange · molette ou x : changer d\'outil'); save();
}
function takeLauncher() {
  if (!reliquary.ready) { audio.deny(); ui.toast('le reliquaire est vide · il en revient un bientôt', true); return; }
  if (eco.s.discs) { ui.toast('tu as déjà le tien · molette ou x pour le sortir'); return; }
  eco.s.discs = true; eco.s.tool = 'disc';
  reliquary.take(DGUN_REGEN); net?.sendFx({ k: 'dgun', left: DGUN_REGEN });
  // the church answers: the toccata, the vampire hunter's anthem, for everyone
  playOrgan(0, true);
  audio.win(); ui.layer('le lance-disques chasse-vampire', 'clic : un disque d\'argent · ils ricochent · la nuit, les chauves-souris du clocher…'); save();
}
function fireDisc() {
  camera.getWorldPosition(eye); camera.getWorldDirection(dir);
  const shot = launcher.fire(eye, dir);
  if (shot) net?.sendFx({ k: 'disc', ...shot });
}
// where a disc bounces: the ground, or any wall of the world
function solidAt(x, y, z) {
  const t = T(), [i, j, k] = t.cellOf(x, y, z);
  if (t.solidCell(i, j, k)) return true;
  for (const c of world.colliders) if (!c.off && x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return true;
  return false;
}
// what a disc of yours strikes: a bat, a mole, an animal
function discHit(d) {
  // the bomber, for whoever manages it: the big prize
  if (here === 'home' && plane.hitTest(d.pos)) {
    plane.shootDown(); audio.win();
    reward(5000, 'bombardier abattu ! super bonus');
    ui.layer('bombardier abattu !', 'un tir de légende · +5 000 ●');
    net?.sendFx({ k: 'planedown' });
    return true;
  }
  const b = here === 'home' && bats.hit(d.pos);
  if (b) { audio.pop(); reward(150, 'chauve-souris vampire abattue'); return true; }
  for (const m of moles.list) if ((m.state === 'chase' || m.state === 'emerge') && m.pos.distanceTo(d.pos) < .6) { moles.damage(m, 2, d.vel.clone().setY(0).normalize()); audio.bonk(); return true; }
  const W = world.walkers[here];
  const who = W?.hitTest(d.pos);
  if (who) { W.knock(who, d.vel); audio.bonk(); return true; }
  W?.startle(d.pos);
  for (const a of animals[here].list) if (animals[here].touches(a, d.pos)) { animals[here].knock(a, d.vel); audio.squeak(); return true; }
  return false;
}
// ---------- water and lava pour through the portals too ----------
// The cells of liquid just in front of one portal go out of the other: into the hole as real water
// (or lava) that flows on; out of the plot, a gush that falls away; into a full side, not at all.
let liqT = 0;
const lc = new THREE.Vector3(), fresh = new Map();   // cells just poured out, by key → time they may go in again
function portalCells(t, P) {
  const out = [], r = Math.ceil(portals.RY / S) + 1;
  const [ci, cj, ck] = t.cellOf(P.pos.x, P.pos.y, P.pos.z);
  for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) for (let i = ci - r; i <= ci + r; i++) {
    lc.set(t.X0 + (i + .5) * S, t.Y0 + (j + .5) * S, t.Z0 + (k + .5) * S).sub(P.pos);
    const d = lc.dot(P.n);
    if (d < 0 || d > S * 1.2 || (lc.dot(P.right) / portals.RX) ** 2 + (lc.dot(P.up) / portals.RY) ** 2 > 1) continue;
    out.push([i, j, k]);
  }
  return out;
}
function pourThrough(dt) {
  if ((liqT -= dt) > 0) return;
  liqT = .12;
  const t = T();
  if (t.sphere) return;
  const now = performance.now();
  for (const [key, until] of fresh) if (until < now) fresh.delete(key);
  for (const pair of portals.pairs()) for (let s = 0; s < 2; s++) {
    const A = pair[s], B = pair[1 - s], floor = A.n.y > .5;
    // what goes in: liquid falling onto a floor portal, or leaning (resting on something) against a wall one;
    // not what just came out of it
    const src = portalCells(t, A).filter(([i, j, k]) => {
      const m = t.get(i, j, k);
      if ((m !== WATER && m !== LAVA) || fresh.has(i + ',' + j + ',' + k)) return false;
      return floor || t.get(i, j - 1, k) !== 0;
    });
    if (!src.length) continue;
    const exit = portalCells(t, B), inside = exit.some(([i, , k]) => t.inArea(i, k));
    const free = exit.filter(([i, j, k]) => t.inArea(i, k) && t.get(i, j, k) === 0);
    for (const [i, j, k] of src.slice(0, 10)) {
      const m = t.get(i, j, k), to = free.shift();
      if (to) { t.setCell(i, j, k, 0); t.setCell(...to, m); fresh.set(to.join(), now + 500); }
      else if (!inside) { t.setCell(i, j, k, 0); debris.burst(B.pos.clone().addScaledVector(B.n, .3), B.n, m === LAVA ? 0xff6a1a : 0x4a9ad8, 5, 1.3); }
      else break;
    }
  }
}
function shootPortal(which) {
  camera.getWorldPosition(eye); camera.getWorldDirection(dir);
  const a = portals.shoot(which, eye, dir, T(), onPlanet() ? [] : world.colliders, onPlanet() ? moonP.up : UP, myId());
  if (!a) return;
  net?.sendFx({ k: 'portal', i: which, a, w: here });
}
// on a planet, what goes through a portal is the astronaut
const planetBody = { get pos() { return moonP.pos; }, get vel() { return moonP.vel; }, get up() { return moonP.up; } };

// ---------- a new map: the ground regenerated, the finds buried again ----------
let resetArmed = false;
function resetMap(seed, local) {
  if (local && net) net.sendOp({ k: 'reset', seed });
  terrains.home.reseed(seed);
  terrains.china.reseed(seed + 1);
  for (const w of ['home', 'china']) { finds[w].reset(); finds[w].hollow(); eco.s.finds[w] = []; }
  terrains.home.rebuildAll(); terrains.china.rebuildAll();
  moles.clear(); guardiansUp = false;
  ladders.clear();
  eco.s.mapSeed = seed; quest.place(seed);
  eco.s.best = 0; eco.s.bestChina = 0; eco.s.layerSeen = 0; eco.s.layerSeenChina = 0; eco.s.guardians = false;
  heart.group.visible = true;
  if (elevator.owned) {
    const box = elevator.shaftBox(3);
    terrains.home.hollowBox(box.i, box.j, box.k, box.w, box.h, box.d);
    terrains.home.flush();
    elevator.goTo(0);
  }
  // anyone standing in the old hole comes back up
  if (player.pos.y < -0.5) toSurface();
  audio.boom(0.6); ui.wash();
  ui.layer('nouvelle carte', 'le trou est rebouché');
  save();
}

// ---------- the super reset: every world remade, for everyone, after a countdown ----------
const superPw = document.getElementById('super-pw'), superIn = document.getElementById('super-in'), superErr = document.getElementById('super-err');
const superCount = document.getElementById('super-count'), superN = document.getElementById('super-n'), superSub = document.getElementById('super-sub');
// solo checks the word here: only its fingerprint is in the code (in multi the server checks)
const fnv = (s) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const SUPER_FP = 0x467d6562;
let superTimer = null;
function openSuperPw() {
  if (superTimer) { ui.toast('le compte à rebours est déjà lancé', true); return; }
  state = 'panel'; panelKind = 'superpw';
  digging = false; player.disable();
  if (document.pointerLockElement) document.exitPointerLock();
  superErr.textContent = ''; superIn.value = '';
  superPw.classList.remove('hidden');
  setTimeout(() => superIn.focus(), 50);
}
document.getElementById('super-cancel').addEventListener('click', () => closePanel());
document.getElementById('super-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = superIn.value.trim().toLowerCase();
  if (net && net.online) {
    // the server checks, then starts the countdown for everyone (us included)
    net.superReset(pw);
    superErr.textContent = 'vérification…';
    return;
  }
  if (fnv(pw) !== SUPER_FP) { superErr.textContent = 'mauvais mot de passe'; audio.deny(); superIn.select(); return; }
  closePanel();
  startSuperCountdown(15000, Math.floor(Math.random() * 1e9), null);
});
function superDenied() { superErr.textContent = 'mauvais mot de passe'; audio.deny(); superIn.select(); }
function startSuperCountdown(ms, seed, by) {
  if (superTimer) return;
  if (panelKind === 'superpw') closePanel();
  const end = performance.now() + ms;
  superSub.textContent = by ? `lancé par ${by} · destruction de tous les mondes` : 'destruction de tous les mondes';
  superCount.classList.remove('hidden');
  audio.siren();
  let last = -1;
  superTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    if (left !== last) {
      last = left;
      superN.textContent = left;
      superN.classList.remove('tick'); void superN.offsetWidth; superN.classList.add('tick');
      if (left <= 5) { audio.deny(); shakeT = Math.max(shakeT, .15); } else audio.tick();
      if (left === 10) audio.siren();
    }
    if (performance.now() >= end) {
      clearInterval(superTimer); superTimer = null;
      superCount.classList.add('hidden');
      const flash = document.createElement('div'); flash.id = 'super-flash'; document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 1700);
      audio.boom(2); shakeT = 1.2;
      superReset(seed);
    }
  }, 100);
}
// the destruction itself: new seeds for all four worlds; progress (money, gear, parts) is kept
function superReset(seed) {
  if (onPlanet()) { applyWorld('home'); player.pos.copy(HOME_SPAWN); player.vel.set(0, 0, 0); player.yaw = Math.PI; player.unstick(); }
  eco.s.planetSeeds = { moon: seed + 2, mars: seed + 3 };
  for (const w of ['moon', 'mars']) { terrains[w].reseed(eco.s.planetSeeds[w]); delete LANDERS[w]; }
  eco.s.bestMoon = 0; eco.s.bestMars = 0; eco.s.layerSeenMoon = 0; eco.s.layerSeenMars = 0;
  resetMap(seed, false);
  ui.layer('super reset', 'tous les mondes ont été détruits, puis refaits');
}

const ORDER_QTY = [1, 5, 10, 20];
let orderQty = 1;

function openParcels() {
  const ps = delivery.open();
  if (!ps.length) return;
  let fakes = 0, shoddy = 0;
  const got = {};
  for (const p of ps) {
    if (p.fake) { fakes++; continue; }
    const sh = !!STORES[p.store]?.shoddy && !EXPLORE;
    eco.give(p.item, 1, sh);
    if (sh) shoddy++;
    got[p.item] = (got[p.item] || 0) + 1;
  }
  audio.pickup(2);
  unlock('parcel');
  const txt = Object.entries(got).map(([k, n]) => `+${n} ${ITEMS[k].name}`).join(' · ');
  ui.toast(txt || 'rien de bon là-dedans', false, 2600);
  if (fakes) setTimeout(() => ui.toast(`${fakes} contrefaçon${fakes > 1 ? 's' : ''} · merci aliexpresso`, true, 2600), 1400);
  else if (shoddy) setTimeout(() => ui.toast('made in aliexpresso · à utiliser à tes risques', true, 2600), 1400);
  if (shoddy) hintOnce('ali', 'les produits aliexpresso sont peu fiables : parfois rien, parfois boum dans les mains, parfois trop rapides… parfois bien plus puissants', 6000);
  save();
}

function liftBottomDepth() { return Math.min(395, Math.max(2, eco.s.best)); }
function useLift() {
  const inCage = elevator.holds(player.pos);
  const box = elevator.shaftBox(liftBottomDepth());
  if (inCage && elevator.y > -1) {
    applyOp({ k: 'box', w: 'home', i: box.i, j: box.j, kk: box.k, wd: box.w, h: box.h, d: box.d });
    terrains.home.flush();
    elevator.goTo(terrains.home.Y0 + box.j * S);
    audio.charge();
  } else if (inCage) { elevator.goTo(0); audio.charge(); }
  else {
    // call it to where you stand, as far as the shaft goes
    elevator.goTo(Math.max(terrains.home.Y0 + box.j * S, Math.min(0, player.pos.y)));
    ui.toast('l\'ascenseur arrive');
  }
}

// ---------- panels ----------
function openPanel(kind) {
  panelKind = kind;
  state = 'panel';
  digging = false;
  player.disable();
  ui.prompt('');
  ui.el.hint.classList.remove('show');
  renderPanel();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closePanel() {
  superPw.classList.add('hidden');
  ui.el.shop.classList.add('hidden');
  ui.el.reader.classList.add('hidden');
  panelKind = null;
  state = 'play';
  player.enable();
  relock();
}

function upgradeRow(id, inChina) {
  const n = eco.next(id), c = eco.cur(id), U = UPGRADES[id];
  const row = { id, kind: U.kind, name: n ? n.name : c.name, lvl: `${eco.s.lv[id] + 1}/${U.levels.length}` };
  if (!n) return { ...row, owned: true };
  if (n.china && !inChina) return { ...row, lock: 'au japon…' };
  if (!n.china && inChina) return { ...row, name: c.name, lock: 'à la quincaillerie' };
  return { ...row, price: n.price, poor: eco.s.money < n.price };
}
const needText = (need) => Object.entries(need).map(([id, n]) => `${eco.s.sack[id] || 0}/${n} ${ORE[id].name}`).join(' · ');
const canCraft = (need) => Object.entries(need).every(([id, n]) => (eco.s.sack[id] || 0) >= n);
function craftRow(r) {
  const owned = r.perk && eco.s.perks[r.perk];
  const ok = canCraft(r.need);
  return { id: 'craft:' + r.id, kind: r.moon ? (r.perk ? 'bonus lunaire' : 'objet lunaire') : r.perk ? 'bonus' : 'objet', name: r.name, sub: (r.sub ? r.sub + ' — ' : '') + needText(r.need), owned, ownedText: 'fabriqué', lock: owned || ok ? null : 'il manque des minerais', done: !owned && ok };
}

function renderPanel(quip) {
  const k = panelKind;
  if (k === 'shop') {
    const rows = ORDER.map(id => upgradeRow(id, false));
    for (const id of ['ladder', 'med', 'cell']) rows.push({ id: 'item:' + id, kind: 'objet', name: ITEMS[id].name, lvl: `×${eco.s.items[id]}`, sub: ITEMS[id].sub, price: ITEMS[id].price, poor: eco.s.money < ITEMS[id].price });
    ui.panel({ title: 'la quincaillerie', quip, rows, close: 'retour au trou' });
  } else if (k === 'cshop') {
    const rows = CHINA_ORDER.map(id => {
      const r = upgradeRow(id, true);
      if (id === 'shovel' && eco.s.lv.shovel < 5) return { ...r, lock: 'd\'abord la dernière pelle' };
      if (id === 'lamp' && eco.s.lv.lamp < 3) return { ...r, lock: 'd\'abord le projecteur' };
      return r;
    });
    // the konbini's own shelves: eaten or drunk on the spot
    for (const [id, g] of Object.entries(KONBINI)) rows.push({ id: 'kgood:' + id, kind: 'konbini', name: g.name, sub: g.sub, price: g.price, poor: eco.s.money < g.price });
    for (const id of ['fus', 'med', 'cell']) rows.push({ id: 'item:' + id, kind: 'objet', name: ITEMS[id].name, lvl: `×${eco.s.items[id]}`, sub: ITEMS[id].sub, price: ITEMS[id].price, poor: eco.s.money < ITEMS[id].price });
    ui.panel({ title: 'le konbini · いらっしゃいませ', quip, rows, note: 'les produits du konbini se consomment tout de suite', close: 'sortir' });
  } else if (k === 'computer') {
    const st = STORES[panelTab];
    // how many of each per click: a row that cycles ×1, ×5, ×10, ×20
    const rows = [{ id: 'qty', kind: 'quantité', name: `×${orderQty} par commande`, sub: 'clique pour changer · tout part dans la même livraison' }];
    rows.push(...['dyn', 'sup', 'med', 'cell', 'ladder'].map(id => {
      const price = Math.round(ITEMS[id].price * st.mult) * orderQty;
      const ali = Math.min(eco.s.ali[id] || 0, eco.s.items[id]);
      return { id: 'order:' + id, kind: 'colis', name: `${orderQty > 1 ? orderQty + ' × ' : ''}${ITEMS[id].name}`, lvl: `×${eco.s.items[id]}${ali ? ` (${ali} ali)` : ''}`, sub: ITEMS[id].sub, price, poor: eco.s.money < price };
    }));
    const mine = delivery.state.orders.filter(o => o.store === panelTab);
    const pend = delivery.state.orders.length, eta = delivery.eta;
    const note = mine.length ? `${mine.length} article${mine.length > 1 ? 's' : ''} dans le colis ${st.name} · livré dans ${Math.ceil(Math.min(...mine.map(o => o.eta)))} s · ce que tu commandes maintenant part avec`
      : pend ? `${pend} article${pend > 1 ? 's' : ''} en route · prochain dans ${Math.ceil(eta)} s` : `${st.sub} · livré devant la porte en ~${st.eta} s`;
    ui.panel({ title: 'commander en ligne', quip, tabs: Object.entries(STORES).map(([id, s]) => ({ id, name: s.name, sub: s.sub })), tab: panelTab, rows, note, close: 'se déconnecter' });
  } else if (k === 'lander') {
    const rows = [];
    if (eco.s.sackN) rows.push({ id: 'lander:sell', kind: 'vendre', name: `${eco.s.sackN} trouvaille${eco.s.sackN > 1 ? 's' : ''}`, sub: `${ui.fmt(eco.sackValue())} ● · garde les minerais lunaires si tu veux fabriquer`, done: true });
    rows.push({ id: 'lander:home', kind: 'voyage', name: here === 'mars' ? 'rentrer sur terre (au japon)' : 'rentrer sur terre', sub: eco.s.sackN ? 'avec ton sac, tel quel' : '', done: true });
    if (here === 'moon') rows.push(...RECIPES.filter(r => r.moon).map(craftRow));
    ui.panel({ title: here === 'mars' ? 'le module martien' : 'le module lunaire', quip, rows, note: here === 'mars' ? 'les minerais martiens valent cher à la vente' : 'les recettes lunaires prennent les minerais de la lune dans ton sac', close: 'fermer' });
  } else if (k === 'craft') {
    const rows = RECIPES.filter(r => !r.moon || eco.s.moon).map(craftRow);
    ui.panel({ title: 'l\'établi', quip, rows, note: 'les recettes prennent les minerais dans ton sac', close: 'ranger les outils' });
  } else if (k === 'arcade') {
    const rec = eco.s.records || {};
    const rows = Object.entries(GAMES).filter(([, g]) => !g.secret).map(([id, g]) => {
      const r = rec[id];
      const best = r == null ? 'pas encore de record' : `record : ${fmtRecord(g.unit, r)}`;
      return { id: 'game:' + id, kind: 'jouer', name: g.name, sub: `${g.sub} · ${best}`, done: r != null };
    });
    if (mg.active) rows.push({ id: 'game:stop', kind: '', name: 'abandonner le jeu en cours' });
    ui.panel({ title: 'la borne d\'arcade', quip, rows, note: MULTI ? 'la partie est proposée à tout le monde · départ dès deux joueurs prêts' : 'les mini-jeux rapportent des pièces', close: 'fermer' });
  } else if (k === 'modes') {
    // a game with several modes: the one who starts it picks
    const g = modesFor, mods = RACES[g].mod.modes;
    const rec = eco.s.records || {};
    const rows = mods.map(m => {
      const r = rec[g + (m.id === mods[0].id ? '' : ':' + m.id)];
      return { id: 'mode:' + m.id, kind: 'mode', name: m.name, sub: m.sub + (r != null ? ` · record : ${fmtRecord(m.unit || GAMES[g].unit, r)}` : ''), done: r != null };
    });
    ui.panel({ title: GAMES[g].name, rows, note: MULTI ? 'le mode choisi est proposé à tout le monde' : 'choisis un mode', close: 'retour' });
  } else if (k === 'board') {
    const rows = ACH_LIST.map(([id, name]) => ({ id: 'ach:' + id, name: eco.s.ach[id] ? name : '? ? ?', done: !!eco.s.ach[id], static: true, kind: eco.s.ach[id] ? '●' : '○' }));
    ui.panel({ title: `exploits · ${Object.keys(eco.s.ach).length}/${ACH_LIST.length}`, rows, close: 'fermer' });
  } else if (k === 'shelf') {
    const ores = Object.values(ORE).filter(o => !o.letter);
    const rows = ores.map(o => ({ id: 'tro:' + o.id, name: eco.s.found[o.id] ? o.name : '? ? ?', sub: eco.s.found[o.id] ? `${ui.fmt(o.value)} ● pièce` : '', done: !!eco.s.found[o.id], static: true }));
    const nf = Object.values(eco.s.finds).flat().length;
    ui.panel({ title: 'les trophées', rows, note: `${nf} trouvaille${nf > 1 ? 's' : ''} déterrée${nf > 1 ? 's' : ''} · ${eco.s.moles} taupe${eco.s.moles > 1 ? 's' : ''} vaincue${eco.s.moles > 1 ? 's' : ''}`, close: 'fermer' });
  }
}

const QUIPS = ['bon choix.', 'elle creusera bien, celle-là.', 'revenez quand vous voulez.', 'ça, c\'est du matériel.', 'le trou vous remercie.'];
ui.el.shopTabs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  panelTab = b.dataset.tab; renderPanel();
});
ui.el.shopItems.addEventListener('click', (e) => {
  const b = e.target.closest('.ns-item');
  if (!b || b.classList.contains('static')) return;
  const id = b.dataset.id;
  const deny = () => { audio.deny(); ui.flashItem(id, 'shake'); };
  if (panelKind === 'cshop' && id.startsWith('kgood:')) {
    const k = KONBINI[id.slice(6)];
    if (!eco.pay(k.price)) return deny();
    k.use();
    audio.buy();
    ui.setCoins(eco.s.money, true);
    renderPanel(k.quip);
    ui.flashItem(id, 'bought');
    save();
    return;
  }
  if (panelKind === 'shop' || panelKind === 'cshop') {
    if (id.startsWith('item:')) {
      const it = id.slice(5);
      if (!eco.pay(ITEMS[it].price)) return deny();
      eco.give(it);
    } else {
      if (b.classList.contains('locked')) return deny();
      const r = eco.buy(id, panelKind === 'cshop');
      if (r !== 'ok') return deny();
      if (id === 'lift') {
        const box = elevator.shaftBox(Math.max(3, liftBottomDepth()));
        applyOp({ k: 'box', w: 'home', i: box.i, j: box.j, kk: box.k, wd: box.w, h: box.h, d: box.d });
        terrains.home.flush();
        ui.toast('l\'ascenseur est monté dans le coin du potager');
      }
      applyUpgrades();
    }
    audio.buy();
    ui.setCoins(eco.s.money, true);
    renderPanel(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
    ui.flashItem(id, 'bought');
    save();
  } else if (panelKind === 'computer') {
    if (id === 'qty') { orderQty = ORDER_QTY[(ORDER_QTY.indexOf(orderQty) + 1) % ORDER_QTY.length]; audio.tick(); renderPanel(); return; }
    const it = id.slice(6);
    const price = Math.round(ITEMS[it].price * STORES[panelTab].mult) * orderQty;
    if (!eco.pay(price)) return deny();
    delivery.order(panelTab, it, orderQty);
    audio.buy();
    ui.setCoins(eco.s.money, true);
    renderPanel('commandé !');
    ui.flashItem(id, 'bought');
    save();
  } else if (panelKind === 'modes' && id.startsWith('mode:')) {
    const g = modesFor;
    closePanel();
    offerGame(g, { mode: id.slice(5) });
    return;
  } else if (panelKind === 'arcade') {
    const g = id.slice(5);
    if (g === 'stop') { closePanel(); mg.stop(); syncPauseQuit(); return; }
    // straight from the panel to the game's screen: no grab of the mouse in between
    offerGame(g);
    return;
  } else if (panelKind === 'lander' && id.startsWith('lander:')) {
    closePanel();
    if (id === 'lander:sell') interact({ id: 'sell' });
    else travel(here === 'mars' ? 'china' : 'home', 'rocket');
    return;
  } else if (panelKind === 'craft' || panelKind === 'lander') {
    const r = RECIPES.find(x => 'craft:' + x.id === id);
    if (!r || (r.perk && eco.s.perks[r.perk]) || !canCraft(r.need)) return deny();
    for (const [oid, n] of Object.entries(r.need)) { eco.s.sack[oid] -= n; eco.s.sackN -= n; if (!eco.s.sack[oid]) delete eco.s.sack[oid]; }
    if (r.perk) eco.s.perks[r.perk] = true; else eco.give(r.item, r.n);
    audio.buy();
    unlock('craft');
    ui.setBag(eco.s.sackN, eco.cap, true);
    renderPanel('fabriqué !');
    ui.flashItem(id, 'bought');
    save();
  }
});
ui.el.shopClose.addEventListener('click', closePanel);

const readerNav = (on) => [...eco.s.letters.map(k => ({ n: k, on: k === on })), { n: '✎ livre d\'or', key: 'notes', on: on === 'notes' }];
function enterReader() {
  panelKind = 'read';
  if (state !== 'read') {
    state = 'read'; digging = false; player.disable();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
function openReader(n) {
  enterReader();
  ui.read(n === 1 ? 'la lettre sur la table' : `lettre ${n} · trouvée à ${[0, 0, 30, 60, 90][n]} m`, LETTERS[n], readerNav(n));
}

// ---------- the guest book: a word for whoever digs here next ----------
const NOTES_ROOM = MULTI ? 'jardin' : 'monde';
async function openNotes() {
  enterReader();
  ui.read('le livre d\'or', '', readerNav('notes'), true);
  ui.notes(null);
  try {
    const r = await fetch('api/notes?room=' + encodeURIComponent(NOTES_ROOM));
    ui.notes(r.ok ? await r.json() : []);
  } catch { ui.notes([]); }
}
ui.el.readerNav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  if (b.dataset.n === 'notes') openNotes(); else openReader(+b.dataset.n);
});
document.getElementById('note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ta = document.getElementById('note-text'), btn = e.target.querySelector('button');
  const text = ta.value.trim();
  if (!text) return;
  btn.disabled = true;
  try {
    const name = params.get('name') || (() => { try { return localStorage.getItem('a-hole-nick'); } catch { return null; } })() || 'anonyme';
    const r = await fetch('api/notes?room=' + encodeURIComponent(NOTES_ROOM), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, text }) });
    if (r.ok) { ta.value = ''; audio.buy(); openNotes(); }
    else ui.toast(r.status === 429 ? 'doucement, un mot à la fois' : 'le mot n\'est pas parti', true);
  } catch { ui.toast('pas de serveur pour le livre d\'or', true); }
  btn.disabled = false;
});
document.getElementById('reader-close').addEventListener('click', closePanel);

// ---------- the bottom ----------
const WIN_QUIPS = [
  'tout ça pour ça. et pourtant, ça brille.',
  'le trou était la vraie récompense depuis le début.',
  'le précédent propriétaire l\'avait enterré ici. et dessous… il y a encore autre chose.',
];
function win() {
  state = 'win';
  digging = false;
  player.disable();
  if (document.pointerLockElement) document.exitPointerLock();
  eco.s.won = true; eco.s.portal = true;
  document.querySelector('#win .w-title').textContent = 'tout au fond';
  document.getElementById('through').classList.remove('hidden');
  heart.setPortal(true);
  unlock('d100');
  audio.win();
  const m3 = terrains.home.dugCount() * S * S * S;
  const t = Math.floor(eco.s.time);
  const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  document.getElementById('win-depth').textContent = Math.max(eco.s.best, -player.pos.y).toFixed(1) + ' m';
  document.getElementById('win-quip').textContent = WIN_QUIPS[Math.floor(Math.random() * WIN_QUIPS.length)];
  document.getElementById('win-stats').innerHTML =
    `<div>${hh ? hh + 'h' : ''}${String(mm).padStart(hh ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}<span>temps</span></div>` +
    `<div>${Math.round(m3).toLocaleString('fr-FR')} m³<span>de terre</span></div>` +
    `<div>${eco.s.earned.toLocaleString('fr-FR')} ●<span>gagnés</span></div>`;
  ui.el.win.classList.remove('hidden');
  save();
}
document.getElementById('again').addEventListener('click', () => {
  ui.el.win.classList.add('hidden');
  state = 'play'; player.enable(); lockPointer();
});
document.getElementById('through').addEventListener('click', () => { ui.el.win.classList.add('hidden'); travel('china', 'through'); });
document.getElementById('restart').addEventListener('click', () => { eco.wipe(); location.reload(); });

// ---------- save ----------
function save() {
  eco.s.pos = player.pos.toArray();
  eco.s.yaw = player.yaw; eco.s.pitch = player.pitch;
  eco.s.where = here;
  eco.s.delivery = delivery.state;
  eco.s.ladders = ladders.save();
  eco.save(MULTI ? {} : { t: terrains.home.serialize(), tc: terrains.china.serialize(), tm: terrains.moon.serialize(), tmars: terrains.mars.serialize(), tch: terrains.church.serialize() });
}
let saveT = 0;
addEventListener('beforeunload', () => { if (state !== 'attract') save(); });

// ---------- together ----------
if (MULTI) {
  net = createNet({
    scene,
    onWelcome(m) {
      for (const op of m.ops) applyOp(op, false);
      terrains.home.flush(); terrains.china.flush();
      ui.toast(`le jardin commun · ${m.players.length + 1} creuseur${m.players.length ? 's' : ''}`, false, 3000);
    },
    onOp(op) { applyOp(op, false); },
    onFx(id, peer, fx) {
      if (fx.k === 'lobby') onLobby(id, peer, fx);
      else if (fx.k === 'mgp') { if (mg.active === fx.g) mg.onRival(id, fx); }
      // a game's own message rides whole in f: its keys can't clash with the routing
      else if (fx.k === 'race') { if (race && race.id === fx.race) race.mod.onFx(id, fx.f); }
      else if (fx.k === 'portal') portals.set(id, fx.i, fx.a, fx.w);
      else if (fx.k === 'pgun') cave.takeGun(fx.left);
      else if (fx.k === 'dgun') { reliquary.take(fx.left); ui.toast(`${peer?.name ?? 'quelqu\'un'} a trouvé le lance-disques`, false, 2600); }
      else if (fx.k === 'sdoor') setDoor(fx.w, fx.i, !!fx.o, false);
      else if (fx.k === 'planedown') ui.toast(`${peer?.name ?? 'quelqu\'un'} a abattu le bombardier !`, false, 3500);
      else if (fx.k === 'organ' && race?.id !== 'orgue') playOrgan(fx.s | 0, false, peer?.name ?? 'quelqu\'un');
      else if (fx.k === 'disc' && fx.p && fx.d) launcher.remote(fx);
      else mg.onFx(id, peer, fx);
    },
    onSuperReset(m) { startSuperCountdown(m.in, m.seed, m.by); },
    onSuperDenied() { superDenied(); },
    onJoin(name) {
      ui.toast(`${name} arrive dans le jardin`);
      // the newcomer learns where my portals are
      for (const [i, a, w] of portals.mine(myId())) net.sendFx({ k: 'portal', i, a, w });
    },
    onLeave(name, id) {
      ui.toast(`${name} est parti`);
      race?.mod.peerLeft(id); mg.rivalLeft(id); portals.clear(id);
      if (lobby) { if (lobby.host === id) { closeLobby(); if (gm && !gm.host) closeGameMenu(); ui.toast('la partie proposée est annulée'); } else { lobby.ready.delete(id); hostCheck(); renderLobby(); } }
    },
    onStatus(s) { if (s === 'off') ui.setNet('<span class="t">hors ligne</span>', true); },
  });
  net.connect('jardin', params.get('name') || 'creuseur');
}
let netListT = 0;
function updateNetList(dt) {
  if (!net) return;
  netListT -= dt;
  if (netListT > 0) return;
  netListT = 1;
  if (!net.online) return;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  ui.setNet(`<div class="t">le jardin commun</div>` + net.list().map(p => `<div><i style="background:${hex(p.color)}"></i>${esc(p.name)}${p.me ? ' (toi)' : ''}</div>`).join(''));
}

// ---------- quality: a switch, and an automatic step down when frames run late ----------
const QUALITIES = ['auto', 'haute', 'moyenne', 'basse'];
let qualityPref = 'auto', autoLevel = 'moyenne';
try { qualityPref = localStorage.getItem('a-hole-quality') || 'auto'; } catch {}
const qBtns = document.querySelectorAll('.q-btn');
const qSeg = document.getElementById('set-quality');
qSeg.innerHTML = QUALITIES.map(q => `<button type="button" data-q="${q}">${q}</button>`).join('');
qSeg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  qualityPref = b.dataset.q;
  try { localStorage.setItem('a-hole-quality', qualityPref); } catch {}
  applyQuality();
});
function applyQuality() {
  world.setQuality(qualityPref === 'auto' ? autoLevel : qualityPref);
  qBtns.forEach(b => { b.textContent = 'qualité : ' + qualityPref + (qualityPref === 'auto' ? ` (${autoLevel})` : ''); });
  qSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.q === qualityPref));
}
qBtns.forEach(b => b.addEventListener('click', (e) => {
  e.stopPropagation();
  qualityPref = QUALITIES[(QUALITIES.indexOf(qualityPref) + 1) % QUALITIES.length];
  try { localStorage.setItem('a-hole-quality', qualityPref); } catch {}
  applyQuality();
}));
applyQuality();
let slowMs = 0, slowN = 0;
function watchFrames(ms) {
  if (qualityPref !== 'auto' || state !== 'play' || ms > 250) return;
  slowMs += ms; slowN++;
  if (slowN < 180) return;
  const avg = slowMs / slowN;
  slowMs = 0; slowN = 0;
  // below ~40 images/s while aiming for 60: one notch down
  if (avg > 25 && autoLevel !== 'basse') {
    autoLevel = autoLevel === 'haute' ? 'moyenne' : 'basse';
    applyQuality();
    ui.toast(`qualité réduite : ${autoLevel}`, false, 2000);
  }
}

// ---------- settings: volume, mouse, field of view, minimap ----------
const settings = { volume: .7, sens: 1, fov: 72, minimap: true, invert: false, full: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('a-hole-settings') || '{}')); } catch {}
const $s = (id) => document.getElementById(id);
function applySettings() {
  audio.setVolume(settings.volume);
  player.feel.sens = settings.sens; player.feel.invert = settings.invert;
  camera.fov = settings.fov; camera.updateProjectionMatrix();
  $s('set-volume').value = settings.volume; $s('set-volume-v').textContent = Math.round(settings.volume * 100) + ' %';
  $s('set-sens').value = settings.sens; $s('set-sens-v').textContent = settings.sens.toFixed(2);
  $s('set-fov').value = settings.fov; $s('set-fov-v').textContent = settings.fov + '°';
  $s('set-minimap').textContent = settings.minimap ? 'oui' : 'non'; $s('set-minimap').classList.toggle('on', settings.minimap);
  $s('set-invert').textContent = settings.invert ? 'oui' : 'non'; $s('set-invert').classList.toggle('on', settings.invert);
  $s('set-full').textContent = settings.full ? 'oui' : 'non'; $s('set-full').classList.toggle('on', settings.full);
  try { localStorage.setItem('a-hole-settings', JSON.stringify(settings)); } catch {}
}
$s('set-volume').addEventListener('input', (e) => { settings.volume = +e.target.value; applySettings(); });
$s('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; applySettings(); });
$s('set-fov').addEventListener('input', (e) => { settings.fov = +e.target.value; applySettings(); });
$s('set-minimap').addEventListener('click', () => { settings.minimap = !settings.minimap; applySettings(); });
$s('set-invert').addEventListener('click', () => { settings.invert = !settings.invert; applySettings(); });
// full screen: asked for on the click that starts the game (a browser only allows it on a click), or here
function goFull(on) {
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
    else if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
  } catch { /* not allowed here */ }
}
$s('set-full').addEventListener('click', () => { settings.full = !settings.full; applySettings(); goFull(settings.full); });
$s('set-title').addEventListener('click', () => { save(); location.reload(); });
applySettings();

// ---------- the maps ----------
const maps = createMaps({
  terrains, player, getHere: () => here,
  getExtras: () => ({
    animals: animals[here].list.map(a => a.pos),
    moles: moles.list.filter(m => m.state === 'chase' && m.pos.distanceTo(player.pos) < 25).map(m => m.pos),
    peers: net ? [...net.peers.values()].filter(p => p.w === here).map(p => ({ x: p.avatar.g.position.x, z: p.avatar.g.position.z, color: p.color })) : [],
    van: here === 'home' && delivery.van.visible ? delivery.van.position : null,
  }),
});
let bigMap = false;
const bigMapEl = document.getElementById('bigmap'), miniEl = document.getElementById('minimap');
function toggleMap() { bigMap = !bigMap; bigMapEl.classList.toggle('hidden', !bigMap); maps.forceBig(); audio.tick(); }

// ---------- loop ----------
const clock = new THREE.Timer();
let lastTs = 0, shadowT = 0;
const shadowAt = new THREE.Vector3(1e9, 0, 0);
let t = 0;
const orbitTarget = new THREE.Vector3(0, -1, 0);
function loop(ts) {
  // no more images than useful: 60 in play, 30 behind menus
  const cap = state === 'play' || state === 'drive' || state === 'kart' || state === 'launch' ? 60 : 30;
  if (ts - lastTs < 1000 / cap - 2) return;
  watchFrames(ts - lastTs);
  lastTs = ts;
  clock.update(ts);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  updateClock(dt);
  pad.update(dt);
  touch.render(state === 'kart' ? (race?.screen ? 'screen' : 'race') : state === 'drive' ? 'drive' : state === 'play' && !bigMap ? 'play' : '', { lobby: !!lobby && !gm });
  updateLobby(dt);
  animals[here].update(dt, player);
  // everything that moves goes through the portals too: the animals, the thrown bombs, the clods
  if (portals.open) {
    for (const an of animals[here].list) if (!an.gone && portals.pass(an, dt)) an.fly = true;
    for (const b of bombs.live) portals.pass(b, dt);
    for (const q of debris.parts) if (q.life > 0) portals.pass(q, dt, true);
    for (const d of launcher.discs) portals.pass(d, dt, true);
    pourThrough(dt);
    for (const f of plane.falling) portals.pass(f, dt, true);
    // the moles on your heels: their speed read from how far they went since the last frame
    for (const m of moles.list) {
      if (m.state !== 'chase') continue;
      m.size = .25; m.vel ??= new THREE.Vector3(); m.prev ??= m.pos.clone();
      m.vel.subVectors(m.pos, m.prev).divideScalar(Math.max(dt, 1e-3));
      portals.pass(m, dt, true);
      m.prev.copy(m.pos);
    }
    const W = world.walkers[here];
    if (W) for (const p of W.bodies()) if (portals.pass(p.body, dt)) W.flung(p);
  }

  if (state === 'attract') {
    camera.position.set(Math.sin(t * .05) * 22, 11, Math.cos(t * .05) * 22);
    camera.lookAt(orbitTarget);
    world.setDepth(camera.position.y, 8, 0);
  } else {
    const playing = state === 'play';
    if (EXPLORE) { maxOut(); player.stats.fuel = player.stats.fuelMax; }
    player.stats.canJet = eco.s.battery > 0;
    player.stats.onLadder = !!ladders.climbable(player.pos, here);
    waterT += dt;
    if (waterT > 0.08) { waterT = 0; T().stepWater(350); }
    const wasIn = player.stats.inWater;
    player.stats.inWater = T().waterAt(player.pos.x, player.pos.y + 0.9, player.pos.z);
    if (player.stats.inWater && !wasIn && state === 'play') { audio.splash(); unlock('swim'); }
    if (onPlanet()) {
      // third person on a planet: the walker drives, the first-person body just follows
      moonP.stats.fuelMax = player.stats.fuelMax; moonP.stats.jump = player.stats.jump * 1.3;
      if (EXPLORE) moonP.stats.fuel = moonP.stats.fuelMax;
      moonP.update(playing ? dt : 0, playing ? down : new Set());
      player.pos.copy(moonP.pos); player.vel.copy(moonP.vel);
      player.stats.jetting = moonP.stats.jetting;
    } else if (state === 'reveal') reveal.update(dt);
    else player.update(playing ? dt : 0);
    elevator.update(dt, player);
    updateLaunch(dt);
    if (state === 'kart' && race) { race.mod.update(dt, down); if (race) raceHud(); if (race?.screen) screenView(dt); }
    if (state === 'gamemenu') updateGameMenu(dt);
    if (state === 'watch') { orbit.cam(dt, camera); const el = document.getElementById('mg'); el.classList.remove('hidden'); const h = orbit.hud(); if (el._h !== h) { el.innerHTML = h; el._h = h; } }
    if (state === 'drive') {
      const input = {
        throttle: (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0),
        steer: (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0),
      };
      delivery.update(dt, input);
      if (state === 'drive') {
        delivery.seat(seat);
        camera.position.copy(seat);
        camera.rotation.set(-0.12, delivery.yaw - Math.PI / 2, 0, 'YXZ');
      }
    } else delivery.update(dt);
    if (swoop < 1 && !onPlanet()) {
      swoop = Math.min(1, swoop + dt / 1.3);
      const k = 1 - Math.pow(1 - swoop, 3);
      camera.position.lerpVectors(swoopFrom.p, camera.position, k);
      camera.quaternion.slerpQuaternions(swoopFrom.q, camera.quaternion, k);
    }
    if (shakeT > 0) {
      shakeT -= dt;
      const a = Math.min(.25, shakeT * .5);
      camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a;
    }
    const lamp = eco.cur('lamp');
    const eyeY = viewNow() !== here ? 0 : onPlanet() ? Math.min(0, camera.position.distanceTo(PLANET[here]) - T().radius) : camera.position.y;
    const crystal = eco.s.perks.crystal ? 1.5 : 1;
    world.setDepth(eyeY, lamp.range * crystal, lamp.power * (eco.s.perks.crystal ? 1.2 : 1));
    if (T().waterAt(camera.position.x, camera.position.y, camera.position.z)) {
      scene.fog.color.set(0x0e3a55); scene.background.set(0x0e3a55);
      scene.fog.near = 0.1; scene.fog.far = Math.min(scene.fog.far, 7);
    }
    hologram.setDepth(eco.s.best);
    hologram.update(dt, terrains.home);

    bombs.update(dt);
    plane.update(dt, here === 'home' && playing);
    // stepping onto the plot while a raid is on its way: the alert, then
    if (raidAlert && inDigZone()) raidWarn();
    moles.update(dt, player);
    finds[here].update(dt, (f) => { applyOp({ k: 'find', w: here, key: f.key }); eco.s.finds[here].push(f.key); bombs.boom('shell', f.center.clone()); }, () => audio.tick());

    if (playing && onPlanet()) {
      // air: refills by the lander (and on mars, the dome), runs out everywhere else
      const max = eco.cur('o2').o2;
      const air = moonP.pos.distanceTo(LANDERS[here]) < 6 || (here === 'mars' && moonP.pos.distanceTo(DOME) < 6) || space.breathable(here, moonP.pos);
      if (air) eco.s.oxygen = Math.min(max, eco.s.oxygen + 40 * dt);
      else if (!EXPLORE) eco.s.oxygen = Math.max(0, eco.s.oxygen - dt * (eco.s.perks.icepack ? .5 : 1));
      if (eco.s.oxygen / max < .25) hintOnce('o2' + here, here === 'mars' ? 'oxygène bas ! retourne au module ou au dôme' : 'oxygène bas ! retourne au module lunaire', 4000);
      if (eco.s.oxygen <= 0) hurt(12 * dt);
      const tr = T(), C = PLANET[here];
      if (moonP.pos.distanceTo(C) - tr.radius < -1) {
        const d = Math.max(0, tr.radius - moonP.pos.distanceTo(C));
        const li = tr.LAYERS.indexOf(tr.layerAt(d)) + 1, key = here === 'mars' ? 'layerSeenMars' : 'layerSeenMoon';
        if (li > (eco.s[key] || 0)) { eco.s[key] = li; const l = tr.LAYERS[li - 1]; ui.layer(l.name, l.sub); }
      }
    }
    if (playing) {
      if (here === 'home' && quest.touches(player.pos)) takeKey();
      eco.s.time += dt;
      if (player.stats.jetting) eco.s.battery = Math.max(0, eco.s.battery - 5 * dt);
    moonP.stats.fuel = onPlanet() && eco.s.battery <= 0 ? 0 : moonP.stats.fuel;
      if (chargeT > 0) { chargeT -= dt; eco.s.battery = Math.min(eco.batteryMax, eco.s.battery + eco.batteryMax * dt / 1.2); }
      // standing still, the battery catches its breath: full again in ~8 s
      const still = !digging && !shovel.busy && !player.stats.jetting && Math.hypot(player.vel.x, player.vel.z) < 0.3;
      idleT = still ? idleT + dt : 0;
      if (idleT > 0.8 && eco.s.battery < eco.batteryMax) {
        const sunny = seasonNow === 1 && player.pos.y > -1 && world.env.day > .5 ? 1.8 : 1;
        eco.s.battery = Math.min(eco.batteryMax, eco.s.battery + eco.batteryMax * 0.13 * sunny * dt);
        if (eco.s.battery / eco.batteryMax < 0.9) hintOnce('rest', 'immobile, la batterie se recharge toute seule', 4000);
      }
      regenT += dt;
      if (regenT > 1) { regenT = 0; eco.s.health = Math.min(100, eco.s.health + (player.pos.y > -1 && seasonNow !== 3 ? 3 : 0.5)); }
      const tool = activeTool();
      // the arena games put a blaster in your hands: the button shoots instead of digging
      if (mg.armed) {
        if (digging) { camera.getWorldPosition(eye); camera.getWorldDirection(dir); mg.fire(eye, dir); }
      } else if (tool.kind === 'drill') {
        drillT -= dt;
        if (digging && drillT <= 0 && !overheated) {
          drillT = tool.rate;
          doDig();
          drillHeat = Math.min(EXPLORE ? .9 : 1, drillHeat + tool.heat);
          if (drillHeat >= 1) { overheated = true; audio.hiss(); ui.toast('surchauffe ! la foreuse refroidit…', true, 2000); hintOnce('heat', 'relâche un peu la foreuse entre deux perçages : elle chauffe', 5000); }
        }
      } else if (digging && !shovel.busy) shovel.start(tool.cd * (eco.s.perks.titan ? .85 : 1));
      updateAim();
      updateMoles(dt);
      updateDeep(dt);
      mg.update(dt, here === 'home' ? Math.max(0, -player.pos.y) : 0);
      if (throwing && EXPLOSIVES.has(eco.s.slot)) {
        throwT -= dt;
        if (throwT <= 0) { throwT = THROW_EVERY; if (eco.s.items[eco.s.slot]) useItem(); else throwing = false; }
      }
      padCool -= dt;
      // the moon portal next to the pad, once someone has been up there
      moonPortal.group.visible = !!eco.s.moonPortal && here === 'home';
      if (padCool <= 0 && moonPortal.group.visible && moonPortal.on(player.pos)) { padCool = 3; audio.charge(); travel('moon', 'portal'); }
      if (padCool <= 0 && pads[here] && pads[here].on(player.pos)) {
        audio.charge();
        if (here === 'home') { player.yaw = Math.PI; travel('china', 'tele', pads.china.pos.clone().add(new THREE.Vector3(0, .05, 1.7))); }
        else { player.yaw = -Math.PI / 2; travel('home', 'tele', pads.home.pos.clone().add(new THREE.Vector3(1.4, .05, 0))); }
      }

      // depth: below the ground (or, on the moon, below its surface)
      const d = onPlanet() ? Math.max(0, T().radius - moonP.pos.distanceTo(PLANET[here])) : Math.max(0, -player.pos.y);
      const bestKey = W() === 'church' ? 'bestChurch' : here === 'china' ? 'bestChina' : here === 'moon' ? 'bestMoon' : here === 'mars' ? 'bestMars' : 'best';
      eco.s[bestKey] = eco.s[bestKey] || 0;
      if (d > eco.s[bestKey]) {
        if (Math.floor(d / 5) > Math.floor(eco.s[bestKey] / 5)) ui.popBest();
        eco.s[bestKey] = d;
        if (here === 'home' && bestKey === 'best') { if (d >= 10) unlock('d10'); if (d >= 50) unlock('d50'); }
      }
      if (d > 0.6 && !onPlanet()) {
        const tr = T();
        const li = tr.LAYERS.indexOf(tr.layerAt(d)) + 1;
        const seenKey = W() === 'church' ? 'layerSeenChurch' : here === 'china' ? 'layerSeenChina' : 'layerSeen';
        if (li > (eco.s[seenKey] || 0)) { eco.s[seenKey] = li; const l = tr.LAYERS[li - 1]; ui.layer(l.name, l.sub); }
      }
      if (d > 1.7 && !onPlanet()) hintOnce('climb', 'pour remonter : taille des marches (40 cm passent sans sauter), ou r pour la surface', 6000);
      if (eco.s.battery / eco.batteryMax < 0.15) hintOnce('lowbat', 'batterie faible · immobile, elle remonte ; la borne de la maison la remplit d\'un coup', 5000);
      ui.setDepth(d, eco.s[bestKey]);
      ui.setFuel(player.stats.fuel, player.stats.fuelMax);
      ui.veil(Math.min(0.75, d / 30));
      detectT -= dt;
      if (detectT <= 0) {
        detectT = 0.5;
        let txt = null;
        if (eco.s.perks.detector) {
          let bd = 10;
          for (const f of finds[W()].list) if (!f.gone) { const fd = f.center.distanceTo(player.pos); if (fd < bd) bd = fd; }
          if (bd < 10) { txt = `bip · ${bd.toFixed(1)} m`; if (bd < 4) audio.tick(); }
        }
        ui.setDetector(txt);
      }
      saveT += dt;
      if (saveT > 8) { saveT = 0; save(); }
    }
    house.setCharge(eco.s.battery / eco.batteryMax);
    ui.setBars(eco.s.health, eco.s.battery, eco.batteryMax);
    ui.setHotbar(eco.s.items, eco.s.slot, hotSlots());
    // the iced coffee: quicker legs for a minute
    if (speedT > 0) { speedT -= dt; player.stats.speed = speedT > 0 ? 1.45 : 1; if (speedT <= 0) ui.toast('l\'effet du café retombe'); }
    if (gravT > 0) {
      gravT -= dt;
      if (gravT <= 0 || onPlanet()) { gravT = 0; player.stats.grav = 1; if (!onPlanet()) ui.toast('la gravité revient'); }
    }
    audio.setBeds(Math.max(0, -player.pos.y), player.stats.jetting, state === 'drive' ? 1 : 0);
    if (net) net.update(dt, { pos: player.pos, yaw: player.yaw, w: here, dig: (digging || shovel.busy) && !mg.armed, g: mg.active });
    updateNetList(dt);
  }
  const holding = state !== 'attract' && state !== 'reveal' && state !== 'drive' && state !== 'launch' && state !== 'kart' && !onPlanet();
  const drilling = eco.s.tool === 'drill' && eco.s.lv.drill > 0 && !mg.armed;
  portals.setWorld(here);
  portals.held = gunOut() && holding && !mg.armed;
  if (portals.update(dt, state === 'play' ? (onPlanet() ? planetBody : player) : null, Math.hypot(player.vel.x, player.vel.z) > 0.5) && !onPlanet()) player.unstick();
  const inCave = here === 'home' && cave.inside(player.pos);
  player.stats.away = inCave;
  world.setIndoor(inCave || (here === 'home' && crypt.inside(player.pos)));
  cave.update(dt, inCave, here === 'home' ? player.pos : null);
  crypt.update(dt, here === 'home' ? player : null);
  launcher.held = eco.s.tool === 'disc' && eco.s.discs && holding && !mg.armed;
  launcher.update(dt, Math.hypot(player.vel.x, player.vel.z) > 0.5, solidAt, discHit);
  reliquary.update(dt); organ.update(dt, camera.position);
  if (here === 'home') bats.update(dt, t, world.env.night);
  shovel.root.visible = holding && !drilling && !mg.armed && !portals.held && !launcher.held;
  mg.updateBlaster(dt, holding && mg.armed && state === 'play', Math.hypot(player.vel.x, player.vel.z) > 0.5);
  drill.root.visible = holding && drilling && !portals.held && !launcher.held;
  drillBite = Math.max(0, drillBite - dt);
  const biting = drillBite > 0;
  if (!biting) drillHeat = Math.max(0, drillHeat - dt * (overheated ? .28 : .4));
  if (overheated && drillHeat < .3) { overheated = false; ui.toast('la foreuse a refroidi'); }
  heatEl.classList.toggle('hidden', !(drilling && drillHeat > .08 && state === 'play'));
  heatEl.classList.toggle('over', overheated);
  heatFill.style.width = (drillHeat * 100) + '%';
  drill.update(dt, drilling && digging && state === 'play' && !overheated, biting, drillHeat, eco.s.battery / eco.batteryMax);
  audio.setDrill(drilling && digging && state === 'play', drillBite > 0);
  shovel.update(dt, Math.hypot(player.vel.x, player.vel.z) > 0.5);
  debris.update(dt);
  heart.update(dt);
  for (const c of Object.values(cores)) { c.ball.rotation.y += dt * .3; c.halo.scale.setScalar(1 + Math.sin(t * 2) * .06); }
  house.update(dt);
  // the upper floor is only drawn from inside the house (its windows don't let you see in)
  house.room.group.visible = house.inside(camera.position);
  // the rocket compass, once made, has the card before the key's and the trapdoor's hints
  const compassOn = partCompass.update(dt, player, finds[W()]?.list || [], partsElsewhere(), !!eco.s.perks.compass && !onPlanet() && !mg.active && !race && ['play', 'panel', 'paused', 'read'].includes(state));
  quest.update(dt, player, !compassOn && !eco.s.upKey && here === 'home' && !mg.active && !race && ['play', 'panel', 'drive', 'paused', 'read'].includes(state));
  trapGuide.update(dt, player, !compassOn && !!eco.s.upKey && !eco.s.caveSeen && here === 'home' && !cave.inside(player.pos) && !mg.active && !race && ['play', 'panel', 'drive', 'paused', 'read'].includes(state));
  // each town only animates while you're in it
  if (here === 'home') world.neighbours.update(dt);
  if (state === 'play') updateAlarm(dt);
  if (here === 'china') world.china.update(dt);
  pads.home.update(dt, camera.position); pads.china.update(dt, camera.position); moonPortal.update(dt, camera.position);
  world.grassTime.value = t;
  world.follow(camera.position);
  world.updateFall(dt, camera.position);
  relockEl.classList.toggle('hidden', !((state === 'play' || state === 'drive' || (state === 'kart' && !race?.screen)) && !document.pointerLockElement && !window.__dig.test && !pad.active && !touch.active));
  const showMini = settings.minimap && (state === 'play' || state === 'drive') && !onPlanet();
  document.getElementById('o2-row').classList.toggle('hidden', !onPlanet());
  if (onPlanet()) { const f = eco.s.oxygen / eco.cur('o2').o2; document.getElementById('o2-fill').style.width = (f * 100) + '%'; document.getElementById('o2-row').classList.toggle('low', f < .25); }
  miniEl.classList.toggle('hidden', !showMini);
  if (state !== 'attract') maps.update(dt, showMini, bigMap);
  // (a planet's chunks are kept while the eye is off in a game far away)
  if (!onPlanet() || camera.position.distanceTo(PLANET[here]) < T().radius + 60) T().setFocus(camera.position);
  // the world you're in is rebuilt first; the other plots a little in the background,
  // the planets only when you're there (they're big)
  // a few chunks a frame, never more than ~6 ms of it (empty ones cost nothing and don't count much)
  if (T().hasDirty()) T().flush(onPlanet() ? 12 : 4, 6);
  for (const [k, tr] of Object.entries(terrains)) if (k !== here && !onPlanet(k) && tr.hasDirty()) tr.flush(1);
  terrains.home.tickLava(dt); terrains.china.tickLava(dt);
  // only the world you're in is drawn (its lights too)
  const w = state === 'attract' ? 'home' : viewNow();
  const inChina = w === 'china', atHome = w === 'home', onMoon = w === 'moon';
  world.china.group.visible = inChina; terrains.china.group.visible = inChina; pads.china.group.visible = inChina;
  house.group.visible = atHome; terrains.home.group.visible = atHome; terrains.church.group.visible = atHome; pads.home.group.visible = atHome;
  world.homeDecor.visible = atHome;
  finds.home.group.visible = atHome; finds.china.group.visible = inChina;
  animals.home.group.visible = atHome; animals.china.group.visible = inChina;
  terrains.moon.group.visible = onMoon; moonDecor.visible = onMoon;
  terrains.mars.group.visible = w === 'mars'; marsDecor.visible = w === 'mars';
  space.show(w); orbit.show(w);
  if (onPlanet()) { space.update(dt, here, t); orbit.update(dt, here); }
  // shadows: redrawn when the eye moves, or a few times a second for the sun and the critters
  shadowT += dt;
  if (shadowT > .25 || camera.position.distanceToSquared(shadowAt) > .04) { renderer.shadowMap.needsUpdate = true; shadowT = 0; shadowAt.copy(camera.position); }
  if (!race?.screen || race.onScreen) { portals.render(myId()); world.render(); }
}
renderer.setAnimationLoop(loop);

// a change of mode on the title screen reloads the page: the new mode then starts straight away
// the title screen's profile card, and the menus' feel
{
  const best = Math.max(eco.s.best || 0, eco.s.bestChina || 0);
  document.getElementById('pf-best').textContent = best.toFixed(1);
  document.getElementById('pf-money').textContent = eco.s.money >= 999999 ? '∞' : ui.fmt(eco.s.money);
  document.getElementById('pf-name').textContent = MULTI ? (params.get('name') || 'creuseur') : EXPLORE ? 'explorateur' : 'creuseur';
  const RANKS = [[0, 'jardinier'], [10, 'terrassier'], [30, 'mineur'], [80, 'spéléologue'], [150, 'foreur de fond'], [300, 'presque au centre'], [399, 'a touché le cœur']];
  const rank = RANKS.filter(r => best >= r[0]).length - 1;
  const rk = document.getElementById('pf-rank');
  rk.textContent = RANKS[rank][1]; rk.dataset.t = rank;
}
initMenus({ hover: () => audio.hover(), press: () => { audio.init(); audio.pop(); } });

// ---------- a controller: the same game, with sticks, triggers and a buzz ----------
// a phone: the same controller, drawn on the screen; a drag looks around
const touch = createTouch({ look: (dx, dy) => { if (state === 'play') { if (onPlanet()) moonP.look(dx, dy, settings.sens); else player.look(dx, dy); } } });
const pad = createGamepad({
  virtual: () => touch.active ? touch.pad : null,
  context() {
    if (state === 'reveal') return 'reveal';
    if (['attract', 'paused', 'panel', 'read', 'win', 'gamemenu'].includes(state)) return 'menu';
    if (state === 'kart') return race?.screen ? 'screen' : 'race';
    if (state === 'drive') return 'drive';
    if (state === 'play') return bigMap ? 'menu' : 'play';
    return 'none';
  },
  actions: {
    look(dx, dy) { if (onPlanet()) moonP.look(dx, dy, settings.sens); else player.look(dx, dy); },
    dig(on) { if (state === 'play') digging = on; },
    throw(on) { if (state !== 'play') return; throwing = on; if (on) { throwT = THROW_EVERY; useItem(); } },
    slot(d) {
      const slots = hotSlots();
      if (!slots.length) return;
      const i = Math.max(0, slots.indexOf(eco.s.slot));
      eco.s.slot = slots[(i + d + slots.length) % slots.length]; audio.tick();
    },
    pause() { openPause(); },
    back() {
      if (state === 'gamemenu') gameMenuBack();
      else if (bigMap) toggleMap();
      else if (!superPw.classList.contains('hidden')) document.getElementById('super-cancel').click();
      else if (state === 'panel' || state === 'read') closePanel();
      else if (state === 'paused') document.getElementById('resume-go').click();
    },
    connected() { audio.init(); ui.toast('manette connectée', false, 1800); if (state === 'play') ui.hint('stick gauche marcher · stick droit regarder · RT creuser · A sauter · X interagir · start pause', 5000); },
    disconnected() { ui.toast('manette débranchée', true, 1800); },
  },
});
// the hotbar, tapped on a phone
ui.el.hotbar.addEventListener('click', (e) => {
  const s = e.target.closest('.slot');
  if (!s || state !== 'play') return;
  const slots = hotSlots(), n = [...ui.el.hotbar.children].indexOf(s);
  if (n >= 0 && n < slots.length) { eco.s.slot = slots[n]; audio.tick(); }
});
// felt as well as seen
{
  const hurt = ui.hurt, boom = audio.boom, bonk = audio.bonk;
  ui.hurt = (...a) => { pad.rumble(.55, 170); return hurt(...a); };
  audio.boom = (big = 1, ...a) => { pad.rumble(Math.min(1, .5 + big * .3), 320); return boom(big, ...a); };
  audio.bonk = (...a) => { pad.rumble(.35, 110); return bonk(...a); };
}

if (params.has('go')) {
  params.delete('go');
  history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
  start();
}

// a handle for tests and the curious
window.__dig = {
  world, terrains, player, eco, ui, camera, renderer, scene, heart, shovel, delivery, elevator, moles, finds, bombs, plane, animals, hologram, moonP, rocket, gainPart, launch, get landerPos() { return landerPos; }, MOON, MARS, marsRocket, MARS_PAD,
  get net() { return net; },
  mg, kart, startKart, quitKart, RACES, space, orbit, startWatch, stopWatch, get race() { return race; }, startRace, quitRace, launchGame, offerGame, stepMenu: (dt) => updateGameMenu(dt), openGameMenu, gameMenuPlay, gameMenuBack, pickMode, get gm() { return gm; }, get lobby() { return lobby; }, setReady, stepLobby: (dt) => updateLobby(dt),
  steal, get alarm() { return alarm; }, stepAlarm: (dt) => updateAlarm(dt),
  stepLaunch(dt) { updateLaunch(dt); },
  get state() { return state; },
  get here() { return here; },
  get terrain() { return T(); },
  test: false,
  skipSwoop() { swoop = 1; this.test = true; },
  start, toSurface, travel, win, save, useItem, applyUpgrades, openPanel, closePanel, enterVan, exitVan, useLift, explode,
  quest, takeKey, reveal, startReveal, cave, crypt, portals, shootPortal, trapGuide, launcher, bats, organ, portalCells, gameroom: house.room, updateAim, get pad() { return pad; }, get touch() { return touch; }, get down() { return down; }, screenView: (dt) => race?.screen && screenView(dt),
  interact: (id) => interact(id === 'van' ? VAN : id === 'lift' ? LIFT : world.interactables.find(i => i.id === id) || (onPlanet() && findNear()?.id === id ? findNear() : null)),
  swing: doDig,
};
