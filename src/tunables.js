// tunables.js, the live values that drive the game: gravity, digging, time, raids, prices…
// Every one defaults to what the game always did (multipliers at 1), so solo and the shared
// garden never notice it. A host's server tab changes them; the room hands the changes out.
//   tun.get(key)      the value now
//   tun.set(key, v)   (the host) one value; tun.load(obj) all overrides at once (the guests)
//   tun.on(fn)        fn(key|null) after any change

export const DEFS = [
  // group, key, label, default, min, max, step, (options)
  { g: 'corps', k: 'gravity', label: 'gravité', def: 1, min: .2, max: 3, step: .05, unit: '×' },
  { g: 'corps', k: 'walk', label: 'vitesse de marche', def: 1, min: .3, max: 4, step: .05, unit: '×' },
  { g: 'corps', k: 'jump', label: 'hauteur de saut', def: 1, min: .3, max: 6, step: .05, unit: '×' },
  { g: 'corps', k: 'moonGravity', label: 'gravité sur les planètes', def: 1, min: .2, max: 4, step: .05, unit: '×' },
  { g: 'corps', k: 'damage', label: 'dégâts subis', def: 1, min: 0, max: 4, step: .05, unit: '×' },
  { g: 'creuser', k: 'digRadius', label: 'taille du coup de pelle', def: 1, min: .5, max: 3, step: .05, unit: '×' },
  { g: 'creuser', k: 'digCost', label: 'batterie par coup', def: 1, min: 0, max: 4, step: .05, unit: '×' },
  { g: 'creuser', k: 'batRegen', label: 'recharge au repos', def: 1, min: 0, max: 6, step: .1, unit: '×' },
  { g: 'creuser', k: 'jetDrain', label: 'batterie du jetpack', def: 1, min: 0, max: 4, step: .05, unit: '×' },
  { g: 'creuser', k: 'o2Drain', label: 'oxygène consommé (planètes)', def: 1, min: 0, max: 6, step: .1, unit: '×' },
  { g: 'temps', k: 'timeSpeed', label: 'vitesse du temps', def: 1, min: 0, max: 30, step: .5, unit: '×', note: '0 : le temps est figé' },
  { g: 'temps', k: 'hour', label: 'heure forcée', def: -1, min: -1, max: 23.5, step: .5, unit: 'h', note: '-1 : l\'horloge tourne' },
  { g: 'temps', k: 'season', label: 'saison forcée', def: -1, options: [[-1, 'auto'], [0, 'printemps'], [1, 'été'], [2, 'automne'], [3, 'hiver']] },
  { g: 'dangers', k: 'raids', label: 'raids du bombardier', def: 1, options: [[1, 'oui'], [0, 'non']] },
  { g: 'dangers', k: 'raidEvery', label: 'temps entre deux raids', def: 1, min: .05, max: 4, step: .05, unit: '×', note: '1 : de 10 à 15 min' },
  { g: 'dangers', k: 'moleRate', label: 'taupes qui surgissent', def: 1, min: 0, max: 6, step: .1, unit: '×' },
  { g: 'boutique', k: 'sellMult', label: 'prix de revente', def: 1, min: 0, max: 5, step: .05, unit: '×' },
  { g: 'boutique', k: 'parcelPrice', label: 'prix des colis', def: 1, min: 0, max: 5, step: .05, unit: '×' },
  { g: 'boutique', k: 'deliveryEta', label: 'délai de livraison', def: 1, min: .05, max: 4, step: .05, unit: '×' },
  { g: 'aliexpresso', k: 'aliDud', label: 'chance : ne marche pas', def: .15, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliBoom', label: 'chance : explose en main', def: .10, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliFast', label: 'chance : mèche trop courte', def: .17, min: 0, max: 1, step: .01, unit: '' },
  { g: 'aliexpresso', k: 'aliStrong', label: 'chance : bien plus fort', def: .15, min: 0, max: 1, step: .01, unit: '' },
  // hidden: [real ms, clock s, speed], so everyone's clock turns alike once the host changes its pace
  { g: null, k: 'clockAnchor', def: null, hidden: true },
];
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
