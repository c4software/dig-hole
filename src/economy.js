// economy.js, what you carry, what you own, what things cost; and the save file.
import { ORE } from './terrain.js';
import { FIND } from './finds.js';
import { ANIMAL } from './animals.js';

// permanent upgrades. `china: true` levels are only sold at the stall in China.
export const UPGRADES = {
  shovel: {
    kind: 'pelle',
    levels: [
      { name: 'vieille bêche',      tier: 1, r: 0.62, cd: 0.50 },
      { name: 'pelle en fer',       tier: 2, r: 0.72, cd: 0.46, price: 60 },
      { name: 'pelle en acier',     tier: 3, r: 0.85, cd: 0.42, price: 320 },
      { name: 'pelle au tungstène', tier: 4, r: 1.0,  cd: 0.38, price: 1300 },
      { name: 'pelle diamant',      tier: 5, r: 1.15, cd: 0.34, price: 4200 },
      { name: 'la dernière pelle',  tier: 6, r: 1.35, cd: 0.30, price: 12000 },
      { name: 'pelle en jade',      tier: 7, r: 1.55, cd: 0.26, price: 30000, china: true },
    ],
  },
  // drills bite continuously while you hold the button: faster, thirstier
  drill: {
    kind: 'foreuse',
    levels: [
      { name: 'rien' },
      { name: 'foreuse à main',      tier: 3, r: 0.5,  rate: 0.14,  cost: .35, heat: .05,  price: 900 },
      { name: 'foreuse électrique',  tier: 5, r: 0.62, rate: 0.1,   cost: .35, heat: .038, price: 4800 },
      { name: 'foreuse industrielle', tier: 7, r: 0.8, rate: 0.075, cost: .3,  heat: .026, price: 24000, china: true },
    ],
  },
  bag: {
    kind: 'sac',
    levels: [
      { name: 'poches',        cap: 10 },
      { name: 'sac de toile',  cap: 25,  price: 45 },
      { name: 'sac à dos',     cap: 60,  price: 260 },
      { name: 'hotte',         cap: 150, price: 950 },
      { name: 'brouette',      cap: 400, price: 3200 },
    ],
  },
  battery: {
    kind: 'batterie',
    levels: [
      { name: 'pile plate',         cap: 50 },
      { name: 'batterie de vélo',   cap: 110,  price: 90 },
      { name: 'batterie auto',      cap: 240,  price: 420 },
      { name: 'batterie de camion', cap: 500,  price: 1500 },
      { name: 'mini-réacteur',      cap: 1200, price: 5200 },
    ],
  },
  lamp: {
    kind: 'lumière',
    levels: [
      { name: 'rien',             range: 7,  power: 4 },
      { name: 'lampe frontale',   range: 12, power: 6.5, price: 35 },
      { name: 'lanterne',         range: 18, power: 9,   price: 240 },
      { name: 'projecteur',       range: 28, power: 12,  price: 900 },
      { name: 'lanterne céleste', range: 42, power: 15,  price: 6000, china: true },
    ],
  },
  boots: {
    kind: 'bottes',
    levels: [
      { name: 'baskets',          jump: 1.25 },
      { name: 'bottes à ressort', jump: 1.8, price: 150 },
      { name: 'bottes lunaires',  jump: 2.6, price: 750 },
    ],
  },
  jet: {
    kind: 'jetpack',
    levels: [
      { name: 'rien',           fuel: 0 },
      { name: 'jetpack',        fuel: 1.6, price: 1600 },
      { name: 'jetpack deluxe', fuel: 4.5, price: 5500 },
    ],
  },
  lift: {
    kind: 'ascenseur',
    levels: [
      { name: 'rien' },
      { name: 'ascenseur de chantier', price: 800 },
    ],
  },
  // heat: how deep you can stand it (metres); past that the ground cooks you
  suit: {
    kind: 'tenue',
    levels: [
      { name: 'bleu de travail',        heat: 170 },
      { name: 'combinaison ignifugée',   heat: 300, price: 18000 },
      { name: 'scaphandre thermique',    heat: 400, price: 55000, lava: true },
    ],
  },
  o2: {
    kind: 'oxygène',
    levels: [
      { name: 'bouteille',        o2: 90 },
      { name: 'double bouteille', o2: 200, price: 8000 },
      { name: 'recycleur',        o2: 500, price: 30000 },
    ],
  },
  kite: {
    kind: 'planeur',
    levels: [
      { name: 'rien' },
      { name: 'cerf-volant dragon', price: 3500, china: true },
    ],
  },
};
export const ORDER = ['shovel', 'drill', 'bag', 'battery', 'lamp', 'boots', 'jet', 'lift', 'suit', 'o2'];
export const CHINA_ORDER = ['shovel', 'drill', 'lamp', 'kite'];

// things you use up: slots on the hotbar, keys 1..5, used with F or right click
export const ITEMS = {
  dyn:  { name: 'dynamite',        price: 40,  max: 99, sub: 'casse la roche, pulvérise les minerais' },
  sup:  { name: 'super bombe',     price: 220, max: 99,  sub: 'perce tout sauf le socle, ramasse les minerais' },
  fus:  { name: 'fusée-foreuse',   price: 700, max: 99,  sub: 'fore un puits de 14 m sous tes pieds', china: true },
  med:  { name: 'trousse de soin', price: 50,  max: 99,  sub: 'rend 60 points de vie' },
  cell: { name: 'pile de secours', price: 60,  max: 99,  sub: 'recharge la batterie, où que tu sois' },
  ladder: { name: 'échelle',       price: 25,  max: 99, sub: 'se pose contre une paroi, on y grimpe' },
  // made from what the moon gives, never sold
  grav: { name: 'gélule anti-gravité', price: 0, max: 6, sub: '20 secondes de gravité lunaire, sur terre', moon: true },
  met:  { name: 'météore de poche',    price: 0, max: 4, sub: 'un cratère énorme, et les minerais avec', moon: true },
};
export const SLOTS = ['dyn', 'sup', 'fus', 'med', 'cell', 'ladder', 'grav', 'met'];

const valueOf = (id) => (ORE[id] || FIND[id] || ANIMAL[id] || { value: 0 }).value;
const nameOf = (id) => (ORE[id] || FIND[id] || ANIMAL[id] || { name: '?' }).name;

// unlimited: the exploration mode, where nothing runs out
export function createEconomy(key = 'a-hole-save-v2', { unlimited = false } = {}) {
  const fresh = () => ({
    money: 0, earned: 0,
    sack: {}, sackN: 0,
    lv: { shovel: 0, drill: 0, bag: 0, battery: 0, lamp: 0, boots: 0, jet: 0, lift: 0, suit: 0, o2: 0, kite: 0 },
    parts: {}, moon: false, oxygen: 90,
    tool: 'shovel',
    items: { dyn: 0, sup: 1, fus: 0, med: 1, cell: 0, ladder: 3 },
    ali: {},       // how many of each item came from aliexpresso: those are a gamble
    ladders: [],   // a first super bomb: a gift from the house
    slot: 'sup',
    battery: 50, health: 100,
    best: 0, bestChina: 0, layerSeen: 0, layerSeenChina: 0, time: 0,
    won: false, portal: false, china: false, guardians: false,
    ach: {}, found: {}, letters: [1], moles: 0, perks: {},
    finds: { home: [], china: [] },
    delivery: null,
    clock: 8 / 24 * 360, gifted: false, animals: 0,
    where: 'home', pos: null, yaw: Math.PI, pitch: -0.15,
    tycoon: null,   // the mars colony (tycoon.js), running while you're away
    upKey: false, mapSeed: 1337,   // the key to upstairs; the seed of the garden's current map
    wear: { own: [], fit: null },  // the clothes bought (ids), and the outfit worn (see outfits.js)
  });
  let s = fresh();

  const cur = (id) => UPGRADES[id].levels[s.lv[id]];
  const next = (id) => UPGRADES[id].levels[s.lv[id] + 1] || null;

  return {
    get s() { return s; },
    cur, next, nameOf,
    get cap() { return unlimited ? 9999 : cur('bag').cap; },
    get space() { return unlimited ? 9999 : cur('bag').cap - s.sackN; },
    get batteryMax() { return cur('battery').cap; },
    // sack keys are ore ids (numbers) or find ids (strings)
    add(id, force = false) {
      if (!force && !unlimited && s.sackN >= cur('bag').cap) return false;
      s.sack[id] = (s.sack[id] || 0) + 1;
      s.sackN++;
      return true;
    },
    steal() {
      const ids = Object.keys(s.sack).filter(k => s.sack[k] > 0);
      if (!ids.length) return null;
      const id = ids[Math.floor(Math.random() * ids.length)];
      s.sack[id]--; s.sackN--;
      if (!s.sack[id]) delete s.sack[id];
      return isNaN(+id) ? id : +id;
    },
    sackValue() {
      let v = 0;
      for (const id in s.sack) v += valueOf(id) * s.sack[id];
      return v;
    },
    sellAll(mult = 1) {
      const v = Math.round(this.sackValue() * mult), n = s.sackN;
      s.money += v; s.earned += v;
      s.sack = {}; s.sackN = 0;
      return { v, n };
    },
    emptySack() { s.sack = {}; s.sackN = 0; },
    earn(v) { s.money += v; s.earned += v; },
    buy(id, inChina = false) {
      const n = next(id);
      if (!n) return 'max';
      if (n.china && !inChina) return 'china';
      if (s.money < n.price) return 'poor';
      s.money -= n.price;
      s.lv[id]++;
      return 'ok';
    },
    pay(price) { if (unlimited) return true; if (s.money < price) return false; s.money -= price; return true; },
    give(item, n = 1, shoddy = false) {
      s.items[item] = Math.min(ITEMS[item].max, (s.items[item] || 0) + n);
      if (shoddy) s.ali[item] = Math.min(s.items[item], (s.ali[item] || 0) + n);
    },
    use(item) { if (unlimited) return true; if (!s.items[item]) return false; s.items[item]--; s.ali[item] = Math.min(s.ali[item] || 0, s.items[item]); return true; },
    // before using one: is it an aliexpresso one? drawn at random from the stock, and taken off it
    shoddy(item) {
      const a = Math.min(s.ali[item] || 0, s.items[item] || 0);
      if (unlimited || !a || Math.random() * s.items[item] >= a) return false;
      s.ali[item] = a - 1;
      return true;
    },
    save(extra) {
      try { localStorage.setItem(key, JSON.stringify({ s, ...extra })); } catch {}
    },
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const f = fresh();
        s = Object.assign(f, data.s);
        s.lv = Object.assign(fresh().lv, data.s.lv);
        s.items = Object.assign(fresh().items, data.s.items);
        s.finds = Object.assign(fresh().finds, data.s.finds);
        s.perks = Object.assign({}, data.s.perks);
        s.parts = Object.assign({}, data.s.parts);
        s.ali = Object.assign({}, data.s.ali);
        s.wear = Object.assign(fresh().wear, data.s.wear);
        if (!Array.isArray(s.wear.own)) s.wear.own = [];
        return data;
      } catch { return null; }
    },
    hasSave() { try { return !!localStorage.getItem(key); } catch { return false; } },
    wipe() { try { localStorage.removeItem(key); } catch {} s = fresh(); },
  };
}
