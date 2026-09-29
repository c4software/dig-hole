// tunables.js, the live values that drive the game: gravity, digging, time, raids, prices…
// Every one defaults to what the game always did (multipliers at 1), so solo and the shared
// garden never notice it. A host's server tab changes them; the room hands the changes out.
//   tun.get(key)      the value now
//   tun.set(key, v)   (the host) one value; tun.load(obj) all overrides at once (the guests)
//   tun.on(fn)        fn(key|null) after any change
import { EVENT_OPTIONS } from './events-calendar.js';

// a multiplier, 1 by default
const X = (g, k, label, max = 4, min = 0, step = .05, note) => ({ g, k, label, def: 1, min, max, step, unit: '×', ...(note ? { note } : {}) });
const YES = [[1, 'oui'], [0, 'non']];
// the explosives: a size and a damage multiplier each (bombs.js BLAST)
const BOOMS = [['dyn', 'dynamite'], ['sup', 'super bombe'], ['fus', 'fusée-foreuse'], ['met', 'météore de poche'], ['holy', 'holy bomba'], ['air', 'bombes du bombardier'], ['shell', 'obus enterrés']];

export const DEFS = [
  // group, key, label, default, min, max, step, (options)
  X('corps', 'gravity', 'gravité', 3, .2),
  X('corps', 'walk', 'vitesse de marche', 4, .3),
  X('corps', 'jump', 'hauteur de saut', 6, .3),
  X('corps', 'damage', 'dégâts subis (tout)', 4),
  X('corps', 'fallDamage', 'dégâts de chute', 4),
  X('corps', 'hpRegen', 'vie qui revient', 10, 0, .1),
  { g: 'corps', k: 'scream', label: 'cri de chute', def: 1, options: YES },
  X('creuser', 'digRadius', 'taille du coup de pelle', 3, .5),
  X('creuser', 'shovelSpeed', 'vitesse de la pelle', 4, .25),
  X('creuser', 'drillSpeed', 'vitesse de la foreuse', 4, .25),
  X('creuser', 'digCost', 'batterie par coup', 4),
  X('creuser', 'batteryCap', 'taille de la batterie', 5, .2),
  X('creuser', 'batRegen', 'recharge au repos', 6, 0, .1),
  X('creuser', 'jetDrain', 'batterie du jetpack', 4),
  X('creuser', 'oreValue', 'valeur des minerais', 10, 0, .1),
  X('creuser', 'findValue', 'valeur des trésors', 10, 0, .1),
  ...BOOMS.flatMap(([id, n]) => [X('explosifs', id + 'Radius', `${n} : taille`, 4, .1), X('explosifs', id + 'Damage', `${n} : dégâts`, 4)]),
  { g: 'explosifs', k: 'holyShaft', label: 'holy bomba : puits (étages de 2,4 m)', def: 8, min: 0, max: 30, step: 1, unit: '' },
  X('explosifs', 'fuseTime', 'durée des mèches', 4, .1),
  X('explosifs', 'blastPush', 'souffle (projection)', 4),
  { g: 'explosifs', k: 'selfHurt', label: 'ses propres explosifs blessent', def: 1, options: YES },
  { g: 'temps', k: 'timeSpeed', label: 'vitesse du temps', def: 1, min: 0, max: 30, step: .5, unit: '×', note: '0 : le temps est figé' },
  { g: 'temps', k: 'hour', label: 'heure forcée', def: -1, min: -1, max: 23.5, step: .5, unit: 'h', note: '-1 : l\'horloge tourne' },
  { g: 'temps', k: 'season', label: 'saison forcée (météo : neige en hiver)', def: -1, options: [[-1, 'auto'], [0, 'printemps'], [1, 'été'], [2, 'automne'], [3, 'hiver']] },
  { g: 'dangers', k: 'raids', label: 'raids du bombardier', def: 1, options: YES },
  X('dangers', 'raidEvery', 'temps entre deux raids', 4, .05, .05, '1 : de 10 à 15 min'),
  { g: 'dangers', k: 'raidBombs', label: 'bombes par raid', def: 10, min: 0, max: 40, step: 1, unit: '' },
  X('dangers', 'moleRate', 'taupes qui surgissent', 6, 0, .1),
  X('dangers', 'moleDamage', 'morsure des taupes', 5, 0, .1),
  { g: 'dangers', k: 'blocus', label: 'blocus du lycée', def: -1, options: [[-1, 'auto (jours de classe, en journée)'], [1, 'en cours'], [0, 'levé']] },
  X('boutique', 'shopPrice', 'prix des boutiques (outils, konbini, vêtements)', 5, 0),
  X('boutique', 'parcelPrice', 'prix des colis', 5),
  X('boutique', 'sellMult', 'prix de revente', 5),
  X('boutique', 'deliveryEta', 'délai de livraison', 4, .05),
  { g: 'boutique', k: 'stackCap', label: 'objets portés au plus (par sorte)', def: 99, min: 5, max: 999, step: 1, unit: '' },
  { g: 'aliexpresso', k: 'aliDud', label: 'chance : ne marche pas', def: .15, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliBoom', label: 'chance : explose en main', def: .10, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliFast', label: 'chance : mèche trop courte', def: .17, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliStrong', label: 'chance : bien plus fort', def: .15, min: 0, max: 1, step: .01, unit: '' },
  { g: 'fêtes', k: 'event', label: 'fête du calendrier', def: -1, options: EVENT_OPTIONS, note: 'auto : selon la date du serveur' },
  X('fêtes', 'huntReward', 'récompenses des chasses', 10, 0, .1),
  X('fêtes', 'candyValue', 'valeur des friandises échangées', 10, 0, .1),
  X('mini-jeux', 'gameReward', 'gains des jeux et des courses', 10, 0, .1),
  { g: 'mini-jeux', k: 'kartLaps', label: 'tours du grand prix (au départ)', def: 4, min: 1, max: 10, step: 1, unit: '' },
  X('planètes', 'moonGravity', 'gravité sur la lune', 4, .2),
  X('planètes', 'marsGravity', 'gravité sur mars', 4, .2),
  X('planètes', 'planetWalk', 'vitesse de marche', 4, .3),
  X('planètes', 'planetJump', 'hauteur de saut', 6, .3),
  X('planètes', 'o2Drain', 'oxygène consommé', 6, 0, .1),
  // hidden: [real ms, clock s, speed], so everyone's clock turns alike once the host changes its pace
  { g: null, k: 'clockAnchor', def: null, hidden: true },
];
export const GROUPS = [...new Set(DEFS.filter(d => !d.hidden).map(d => d.g))];
const BY = new Map(DEFS.map(d => [d.k, d]));

function create() {
  let over = {};        // key → value, only what differs from the default
  const subs = new Set();
  const emit = (k) => { for (const f of subs) { try { f(k); } catch (e) { console.error(e); } } };
  const valid = (d, v) => {
    if (d.hidden) return v;
    v = +v;
    if (!Number.isFinite(v)) return d.def;
    if (d.options) return d.options.some(o => o[0] === v) ? v : d.def;
    return Math.min(d.max, Math.max(d.min, v));
  };
  return {
    DEFS,
    get(k) { return k in over ? over[k] : BY.get(k)?.def; },
    set(k, v) {
      const d = BY.get(k);
      if (!d) return;
      v = valid(d, v);
      if (v === d.def || v == null) delete over[k]; else over[k] = v;
      emit(k);
    },
    reset(k) { if (k) delete over[k]; else over = {}; emit(k || null); },
    // the whole set of overrides, as the room keeps and sends it
    snapshot() { return { ...over }; },
    load(obj) {
      const next = {};
      for (const [k, v] of Object.entries(obj || {})) { const d = BY.get(k); if (d) { const x = valid(d, v); if (x !== d.def && x != null) next[k] = x; } }
      if (JSON.stringify(next) === JSON.stringify(over)) return;
      over = next;
      emit(null);
    },
    get changed() { return Object.keys(over).length > 0; },
    on(f) { subs.add(f); return () => subs.delete(f); },
  };
}

export const tun = create();
export const createTunables = create;   // for tests
