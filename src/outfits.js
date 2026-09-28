// outfits.js, what people wear: the catalogue of the four clothes shops (japan, the
// village square, the moon, mars), the free basics of the wardrobe, and how an outfit
// (a few ids) turns into what the body builder needs (kinds and colours).

export const SLOTS = [
  { id: 'top', name: 'haut' }, { id: 'bottom', name: 'bas' }, { id: 'shoes', name: 'pieds' },
  { id: 'hat', name: 'chapeau' }, { id: 'glasses', name: 'lunettes' },
];
export const SKINS = [0xf6d7c0, 0xeec3a0, 0xdcaa82, 0xb97e55, 0x8c5a38, 0x5e3b25];
export const HAIR_COLORS = [
  ['brun', 0x3a2418], ['noir', 0x1c1512], ['châtain', 0x6a4424], ['roux', 0xb4522a], ['blond', 0xe2c07c],
  ['gris', 0xa6a4a8], ['bleu', 0x3a62c0], ['rose', 0xe87aa8], ['vert', 0x3aa86a],
];
export const HAIR_STYLES = [
  ['court', 'court'], ['long', 'longs'], ['queue', 'queue de cheval'], ['chignon', 'chignon'],
  ['pics', 'en pics'], ['afro', 'afro'], ['carre', 'carré'], ['rase', 'rasé'],
];
export const TEES = [
  ['bleu', 0x3f7fd8], ['rouge', 0xd8403a], ['vert', 0x3aa060], ['jaune', 0xe8b830],
  ['violet', 0x8a52c8], ['orange', 0xee7a2a], ['blanc', 0xf2efe8], ['noir', 0x2a2c32],
];

// the shops: where each one stands, what it's called
export const SHOPS = {
  japon: { name: 'le magasin de kimonos', sign: 'きもの · 桜屋', quip: 'いらっしゃいませ ! essayez, essayez.' },
  europe: { name: 'la boutique du square', sign: 'BOUTIQUE · MODE', quip: 'bonjour ! tout est fait main, ou presque.' },
  lune: { name: 'la boutique lunaire', sign: 'tenues lunaires', quip: 'garanti sans gravité.' },
  mars: { name: 'le tailleur martien', sign: 'tenues martiennes', quip: 'rouge comme la poussière, chaud comme un four.' },
};

// every piece: slot, name, price, the shop that sells it (null: free, in the wardrobe), and its look
export const ITEMS = {
  // ---- free, in the wardrobe at home ----
  tee: { slot: 'top', name: 't-shirt', free: true, sub: 'le classique · sa couleur se choisit dans « moi »', look: { kind: 'tee' } },
  pull: { slot: 'top', name: 'pull', free: true, sub: 'manches longues, même couleur que le t-shirt', look: { kind: 'pull' } },
  jean: { slot: 'bottom', name: 'jean', free: true, sub: 'le bleu de travail des creuseurs', look: { kind: 'jean', c: 0x3a5680 } },
  short: { slot: 'bottom', name: 'short', free: true, sub: 'pour l\'été au fond du trou', look: { kind: 'short', c: 0x6a7a5a } },
  baskets: { slot: 'shoes', name: 'baskets', free: true, sub: 'blanches, ou presque', look: { kind: 'sneaker', c: 0xe8e6e0, c2: 0xd8403a } },
  casquette: { slot: 'hat', name: 'casquette', free: true, sub: 'de la couleur du t-shirt', look: { kind: 'cap' } },
  nohat: { slot: 'hat', name: 'rien sur la tête', free: true, none: true, look: { kind: 'none' } },
  noglasses: { slot: 'glasses', name: 'pas de lunettes', free: true, none: true, look: { kind: 'none' } },

  // ---- japan ----
  kimono: { slot: 'top', shop: 'japon', price: 1400, name: 'kimono fleuri', sub: 'soie indigo, fleurs de cerisier, obi doré', look: { kind: 'kimono', c: 0x2a3a78, c2: 0xe0b040, c3: 0xf4b8cc } },
  yukata: { slot: 'top', shop: 'japon', price: 700, name: 'yukata d\'été', sub: 'coton léger à rayures, pour les fêtes', look: { kind: 'yukata', c: 0xe8eef4, c2: 0x2a4a8a, c3: 0x5a8ad0 } },
  happi: { slot: 'top', shop: 'japon', price: 450, name: 'veste happi', sub: 'la veste du festival, col blanc', look: { kind: 'happi', c: 0xd83a2a, c2: 0xf4f0e6 } },
  hakama: { slot: 'bottom', shop: 'japon', price: 600, name: 'hakama', sub: 'le pantalon plissé des samouraïs', look: { kind: 'hakama', c: 0x3a3a48, c2: 0x2a2a34 } },
  geta: { slot: 'shoes', shop: 'japon', price: 260, name: 'geta', sub: 'sabots en bois · clac, clac', look: { kind: 'geta', c: 0xb88a58, c2: 0xd83a2a } },
  tabi: { slot: 'shoes', shop: 'japon', price: 180, name: 'tabi', sub: 'chaussettes à gros orteil', look: { kind: 'tabi', c: 0xf4f2ec, c2: 0x2a2a30 } },
  kasa: { slot: 'hat', shop: 'japon', price: 380, name: 'kasa', sub: 'chapeau de paille conique', look: { kind: 'kasa', c: 0xd8b870, c2: 0xa88448 } },
  hachimaki: { slot: 'hat', shop: 'japon', price: 120, name: 'hachimaki', sub: 'bandeau de la motivation', look: { kind: 'hachimaki', c: 0xf6f4f0, c2: 0xd82a2a } },
  neko: { slot: 'hat', shop: 'japon', price: 320, name: 'oreilles de chat', sub: 'nyan', look: { kind: 'cat', c: 0x2a2a30, c2: 0xf0a0b8 } },
  kitsune: { slot: 'glasses', shop: 'japon', price: 750, name: 'masque de kitsune', sub: 'le renard du sanctuaire', look: { kind: 'kitsune', c: 0xf8f6f0, c2: 0xd83a2a } },

  // ---- the village square ----
  mariniere: { slot: 'top', shop: 'europe', price: 420, name: 'marinière', sub: 'rayée bleu marine, comme au port', look: { kind: 'mariniere', c: 0xf6f4ee, c2: 0x1e2e5a } },
  tweed: { slot: 'top', shop: 'europe', price: 850, name: 'veste en tweed', sub: 'coudières en option, chemise blanche', look: { kind: 'veste', c: 0x7a6a4e, c2: 0xf4f2ec, c3: 0x5a4a34 } },
  trench: { slot: 'top', shop: 'europe', price: 1200, name: 'trench-coat', sub: 'pour les enquêtes sous la pluie', look: { kind: 'trench', c: 0xc8a878, c2: 0x6a4a2a } },
  chino: { slot: 'bottom', shop: 'europe', price: 300, name: 'chino beige', sub: 'le pantalon du dimanche', look: { kind: 'chino', c: 0xc8b48a } },
  jupe: { slot: 'bottom', shop: 'europe', price: 360, name: 'jupe plissée', sub: 'tourne, tourne', look: { kind: 'jupe', c: 0x9a2a3a } },
  mocassins: { slot: 'shoes', shop: 'europe', price: 340, name: 'mocassins', sub: 'cuir brun, pas pour creuser', look: { kind: 'mocassin', c: 0x6a3a22, c2: 0x2a1a12 } },
  bottines: { slot: 'shoes', shop: 'europe', price: 460, name: 'bottines', sub: 'lacées jusqu\'à la cheville', look: { kind: 'boot', c: 0x3a2a22, c2: 0x1a1210 } },
  beret: { slot: 'hat', shop: 'europe', price: 240, name: 'béret', sub: 'à porter de travers', look: { kind: 'beret', c: 0x1e1e24 } },
  gibus: { slot: 'hat', shop: 'europe', price: 900, name: 'haut-de-forme', sub: 'pour aller creuser à l\'opéra', look: { kind: 'tophat', c: 0x1a1a20, c2: 0x8a2a2a } },
  rondes: { slot: 'glasses', shop: 'europe', price: 300, name: 'lunettes rondes', sub: 'cerclées d\'écaille', look: { kind: 'round', c: 0x4a2e1e } },
  soleil: { slot: 'glasses', shop: 'europe', price: 350, name: 'lunettes de soleil', sub: 'la riviera, depuis le potager', look: { kind: 'sun', c: 0x1a1a1e, c2: 0x22262e } },
  monocle: { slot: 'glasses', shop: 'europe', price: 600, name: 'monocle', sub: 'tout à fait, cher ami', look: { kind: 'monocle', c: 0xd9a125 } },

  // ---- the moon ----
  lunesuit: { slot: 'top', shop: 'lune', price: 1600, name: 'combinaison lunaire', sub: 'blanche, bandes dorées, gants compris', look: { kind: 'suit', c: 0xf0eee8, c2: 0xd9a125, c3: 0x9aa0aa } },
  etoiles: { slot: 'top', shop: 'lune', price: 480, name: 'pull étoilé', sub: 'tricoté en apesanteur', look: { kind: 'star', c: 0x1e2a58, c2: 0xffe89a } },
  lunebottes: { slot: 'shoes', shop: 'lune', price: 700, name: 'bottes lunaires', sub: 'rebondissantes, ou presque', look: { kind: 'moon', c: 0xe8e8ee, c2: 0x3a62c0 } },
  casque: { slot: 'hat', shop: 'lune', price: 1300, name: 'casque spatial', sub: 'visière dorée, anti-soleil', look: { kind: 'helmet', c: 0xf4f2ee, c2: 0xd9a125 } },
  visiere: { slot: 'glasses', shop: 'lune', price: 520, name: 'visière dorée', sub: 'les yeux de l\'astronaute', look: { kind: 'visor', c: 0xe8b83a } },
  lunetoiles: { slot: 'glasses', shop: 'lune', price: 320, name: 'lunettes étoiles', sub: 'pour briller même la nuit', look: { kind: 'star', c: 0xf06aa8 } },

  // ---- mars ----
  marssuit: { slot: 'top', shop: 'mars', price: 1600, name: 'combinaison martienne', sub: 'rouge rouille, gilet de survie', look: { kind: 'suit', c: 0xc84a2a, c2: 0x3a3a40, c3: 0xe8e2d8 } },
  cargo: { slot: 'bottom', shop: 'mars', price: 380, name: 'pantalon cargo', sub: 'huit poches pour les cailloux rouges', look: { kind: 'cargo', c: 0x8a5a3a } },
  marsbottes: { slot: 'shoes', shop: 'mars', price: 700, name: 'bottes martiennes', sub: 'semelles crantées anti-poussière', look: { kind: 'moon', c: 0x6a4a3a, c2: 0xe0602a } },
  dome: { slot: 'hat', shop: 'mars', price: 1300, name: 'casque dôme', sub: 'une bulle de verre, une antenne', look: { kind: 'dome', c: 0xc84a2a, c2: 0x7affc0 } },
  antennes: { slot: 'hat', shop: 'mars', price: 420, name: 'antennes d\'alien', sub: 'ils sont parmi nous', look: { kind: 'antennae', c: 0x5ad84a, c2: 0x2a8a2a } },
  masque: { slot: 'glasses', shop: 'mars', price: 500, name: 'lunettes-masque', sub: 'contre les tempêtes de poussière', look: { kind: 'goggles', c: 0x4a3a30, c2: 0xe0702a } },
};

export const DEFAULT = { top: 'tee', bottom: 'jean', shoes: 'baskets', hat: 'nohat', glasses: 'noglasses', skin: 1, hair: 'court', hairC: 0, tee: 0 };

// a stored outfit, checked piece by piece (ids from an older save or another player)
export function clean(o = {}) {
  const out = { ...DEFAULT };
  if (!o || typeof o !== 'object') return out;
  for (const { id } of SLOTS) if (ITEMS[o[id]]?.slot === id) out[id] = o[id];
  if (Number.isInteger(o.skin) && o.skin >= 0 && o.skin < SKINS.length) out.skin = o.skin;
  if (HAIR_STYLES.some(h => h[0] === o.hair)) out.hair = o.hair;
  if (Number.isInteger(o.hairC) && o.hairC >= 0 && o.hairC < HAIR_COLORS.length) out.hairC = o.hairC;
  if (Number.isInteger(o.tee) && o.tee >= 0 && o.tee < TEES.length) out.tee = o.tee;
  return out;
}
export const shopItems = (shop) => Object.entries(ITEMS).filter(([, it]) => it.shop === shop).map(([id, it]) => ({ id, ...it }));

// what the body builder reads: kinds and colours, nothing else
export function resolve(o, { planet = false, mannequin = false } = {}) {
  const teeHex = o?.teeHex, skinHex = o?.skinHex;   // the town's people wear the town's colours (and a martian is green)
  o = clean(o);
  const tee = teeHex ?? TEES[o.tee][1];
  const piece = (slot) => {
    const l = { ...ITEMS[o[slot]].look };
    if (l.c == null && (l.kind === 'tee' || l.kind === 'pull' || l.kind === 'cap')) l.c = tee;
    return l;
  };
  const r = {
    skin: mannequin ? 0xe8e4dc : skinHex ?? SKINS[o.skin], hair: mannequin ? 'rase' : o.hair, hairC: HAIR_COLORS[o.hairC][1],
    top: piece('top'), bottom: piece('bottom'), shoes: piece('shoes'), hat: piece('hat'), glasses: piece('glasses'), mannequin,
  };
  // on the moon and on mars, nobody goes out bare-headed: a glass bubble if the hat isn't a helmet
  if (planet && r.hat.kind !== 'helmet' && r.hat.kind !== 'dome') r.hat = { kind: 'bubble', c: 0xdadde4, c2: 0x9aa0aa };
  return r;
}

// a quick outfit for the town's people: seeded, so a town keeps its crowd
export function randomOutfit(rnd, { tops = null, style = 'europe' } = {}) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const o = { ...DEFAULT };
  o.skin = style === 'japon' ? pick([0, 0, 1, 1, 2]) : pick([0, 1, 1, 2, 3, 4, 5]);
  o.hair = pick(['court', 'court', 'long', 'queue', 'chignon', 'carre', 'pics', 'rase', 'afro']);
  o.hairC = style === 'japon' ? pick([1, 1, 1, 0, 2]) : pick([0, 1, 2, 3, 4, 5]);
  o.tee = Math.floor(rnd() * TEES.length);
  if (tops) o.teeHex = pick(tops);
  o.top = pick(style === 'japon' ? ['tee', 'pull', 'pull', 'tee', 'yukata', 'happi'] : ['tee', 'pull', 'pull', 'tee', 'mariniere', 'tweed', 'trench']);
  o.bottom = pick(style === 'japon' ? ['jean', 'chino', 'jupe', 'short', 'jean'] : ['jean', 'chino', 'jupe', 'short', 'jean', 'cargo']);
  o.shoes = pick(style === 'japon' ? ['baskets', 'baskets', 'mocassins', 'geta'] : ['baskets', 'baskets', 'mocassins', 'bottines']);
  o.hat = rnd() < .7 ? 'nohat' : pick(style === 'japon' ? ['casquette', 'kasa', 'casquette'] : ['casquette', 'beret', 'casquette']);
  o.glasses = rnd() < .75 ? 'noglasses' : pick(['rondes', 'soleil']);
  return o;
}
