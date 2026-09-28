// events-play.js, what there is to do at each feast: the hunt (what, how many, what it pays),
// the feast's sweets (its currency), the stall's shelf (sold for sweets or coins, eaten on the
// spot), what `e` does at the tree, the galette, the crêpe pan, a neighbour's door… and the
// feats. events.js runs it; h is its toolbox (h.st: this feast's save, h.gain, h.pay, h.toast…).

export const EV_ACH = [
  ['ev_noel', 'noël · tous les cadeaux'], ['ev_nouvelan', 'bonne année !'], ['ev_roi', 'la fève · roi d\'un jour'],
  ['ev_crepes', 'cinq crêpes sautées'], ['ev_valentin', 'cœur d\'artichaut'], ['ev_paques', 'pâques · tous les œufs'],
  ['ev_gold', 'l\'œuf en or'], ['ev_poisson', 'poisson d\'avril !'], ['ev_hanami', 'hanami · tous les dango'],
  ['ev_musique', 'mélomane'], ['ev_voeu', 'un vœu au bambou'], ['ev_juillet', 'toutes les cocardes'],
  ['ev_feu', 'un feu d\'artifice'], ['ev_halloween', 'toutes les citrouilles'], ['ev_bonbons', 'bonbons ou un sort · 12 portes'],
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TOASTS_AVRIL = [
  'flash info : la tour eiffel a été repeinte en rose. provisoirement.',
  'la lune est en fromage. c\'est confirmé par la nasa.',
  'les taupes ont formé un syndicat. elles réclament des pelles.',
  'nouveau : la pelle sans manche. légère, pratique, inutile.',
  'on a retrouvé le fond du trou. il était derrière le canapé.',
  'le japon a été déplacé de deux mètres. rien de grave.',
  'ton pantalon est à l\'envers. non, je rigole.',
  'la gravité est en grève demain matin. prévoyez des lests.',
];

// sweets: eaten on the spot (h.heal, h.battery, h.speed, h.grav)
const EAT = {
  chocolat: { name: 'chocolat chaud', sub: 'vie et batterie au maximum', eat: (h) => { h.heal(100); h.battery(); } },
  epices: { name: 'pain d\'épices', sub: '60 s à courir plus vite', eat: (h) => h.speed(60) },
  marron: { name: 'marrons chauds', sub: '+40 vie', eat: (h) => h.heal(40) },
  lapin: { name: 'lapin en chocolat', sub: '60 s à courir plus vite', eat: (h) => h.speed(60) },
  praline: { name: 'œuf praliné', sub: 'vie au maximum', eat: (h) => h.heal(100) },
  friture: { name: 'friture de pâques', sub: 'batterie pleine', eat: (h) => h.battery() },
  limonade: { name: 'limonade', sub: '60 s à courir plus vite', eat: (h) => h.speed(60) },
  merguez: { name: 'merguez-frites', sub: '+50 vie', eat: (h) => h.heal(50) },
  plume: { name: 'potion de plume', sub: '30 s de gravité lunaire', eat: (h) => h.grav(30) },
  pique: { name: 'bonbon qui pique', sub: 'batterie pleine', eat: (h) => h.battery() },
  hante: { name: 'chocolat hanté', sub: 'vie au maximum · il chuchote', eat: (h) => h.heal(100) },
};
const shelf = (list) => list.map(([id, cost]) => ({ id, ...EAT[id], cost }));

export const PLAY = {
  noel: {
    cur: ['papillote', 'papillotes'],
    hunt: { title: 'les cadeaux perdus', sub: 'le père noël en a semé partout · le jardin, la rue, la place', one: 'cadeau', many: 'cadeaux', coins: 60, cur: 3, done: 800, ach: 'ev_noel' },
    stall: { title: 'le marché de noël', rate: 40, shelf: shelf([['chocolat', { cur: 4 }], ['epices', { cur: 3 }], ['marron', { coins: 40 }]]) },
    uses: {
      gift: {
        prompt: (h) => h.st.gift === h.day ? 'le sapin · reviens demain pour un autre cadeau' : '<b>e</b> le cadeau du jour, sous le sapin',
        act(h) {
          if (h.st.gift === h.day) { h.deny('un cadeau par jour · reviens demain'); return; }
          h.st.gift = h.day;
          const r = Math.random();
          if (r < .35) { const v = 150 + Math.floor(Math.random() * 350); h.coins(v); h.toast(`un cadeau : ${v} ● !`); }
          else if (r < .7) { h.cur(8); h.toast('un cadeau : 8 papillotes !'); }
          else { const it = pick(['dyn', 'med', 'cell', 'ladder']); h.give(it, 3); h.toast(`un cadeau : 3 × ${h.nameOf(it)}`); }
          h.hint('joyeux noël ! un cadeau par jour sous le sapin de la place');
          h.audio.win();
        },
      },
    },
  },
  nouvelan: {
    card: (h) => ({ title: 'le feu d\'artifice', sub: h.untilMidnight(), n: h.st.seen ? 1 : 0, of: 1, word: h.st.seen ? 'vu !' : 'à minuit' }),
  },
  epiphanie: {
    card: (h) => ({ title: 'la galette des rois', sub: h.st.king ? 'tu as eu la fève · tu es roi !' : 'une part à la boulangerie · qui aura la fève ?', n: h.st.slices || 0, word: `${h.st.slices || 0} part${(h.st.slices || 0) > 1 ? 's' : ''}` }),
    uses: {
      galette: {
        prompt: () => '<b>e</b> une part de galette · 30 ●',
        act(h) {
          if (!h.pay(30)) return;
          h.st.slices = (h.st.slices || 0) + 1;
          h.heal(25);
          // one slice in six hides the bean (and the first four without it make the fifth sure)
          if (Math.random() < 1 / 6 || h.st.slices - (h.st.lastKing || 0) >= 6) {
            h.st.lastKing = h.st.slices; h.st.king = true;
            h.coins(300); h.toast('la fève ! tu es roi · +300 ●', false, 3200); h.unlock('ev_roi'); h.audio.win();
          } else h.toast(pick(['pas de fève… délicieux quand même', 'frangipane. pas de fève.', 'encore une ? la fève est quelque part.']));
        },
      },
    },
  },
  chandeleur: {
    card: (h) => ({ title: 'fais sauter les crêpes', sub: 'au stand de la place · une pièce dans l\'autre main, ça porte chance', n: Math.min(5, h.st.flips || 0), of: 5 }),
    uses: { crepe: crepeUse() },
  },
  mardigras: {
    card: (h) => ({ title: 'fais sauter les crêpes', sub: 'au stand de la place · une pièce dans l\'autre main, ça porte chance', n: Math.min(5, h.st.flips || 0), of: 5 }),
    uses: { crepe: crepeUse() },
  },
  valentin: {
    cur: ['cœur', 'cœurs'],
    hunt: { title: 'attrape les cœurs', sub: 'ils flottent au-dessus du village · il en manque toujours un', one: 'cœur', many: 'cœurs', coins: 40, cur: 1, done: 600, ach: 'ev_valentin' },
  },
  paques: {
    cur: ['œuf en chocolat', 'œufs en chocolat'],
    hunt: { title: 'la chasse aux œufs', sub: 'les cloches en ont semé partout · creuse, il y en a sous le potager', one: 'œuf', many: 'œufs', coins: 50, cur: 2, done: 900, ach: 'ev_paques', gold: { coins: 1000, ach: 'ev_gold', text: 'l\'œuf en or ! +1 000 ●' } },
    stall: { title: 'la chocolaterie', rate: 60, shelf: shelf([['lapin', { cur: 3 }], ['praline', { cur: 4 }], ['friture', { cur: 2 }]]) },
  },
  poisson: {
    card: (h) => ({ title: 'poisson d\'avril !', sub: 'approche-toi d\'un passant, dans son dos, et <b>e</b>', n: Math.min(10, h.st.fish || 0), of: 10 }),
    toasts: TOASTS_AVRIL,
  },
  hanami: {
    hunt: { title: 'les dango du hanami', sub: 'au japon, sous les cerisiers en fleurs · dix brochettes égarées', one: 'dango', many: 'dango', coins: 60, cur: 0, done: 700, ach: 'ev_hanami' },
  },
  musique: {
    card: (h) => ({ title: 'la fête de la musique', sub: 'une pièce à chaque musicien de la place · l\'orgue joue aussi', n: Object.keys(h.st.tips || {}).length, of: 3 }),
    uses: {
      busk: {
        prompt: (h, d) => `<b>e</b> une pièce au ${d.what === 'accordeon' ? 'joueur d\'accordéon' : d.what === 'guitare' ? 'guitariste' : 'trompettiste'} · 10 ●`,
        act(h, d) {
          if (!h.pay(10)) return;
          (h.st.tips ||= {})[d.i] = true;
          h.audio.win();
          h.toast(pick(['merci ! une petite dernière ?', 'on la refait en la mineur ?', 'c\'est pour toi, celle-là.']));
          if (Object.keys(h.st.tips).length >= 3) h.unlock('ev_musique');
        },
      },
    },
  },
  tanabata: { card: natsuCard, uses: { wish: wishUse() } },
  obon: { card: natsuCard, uses: { wish: wishUse() } },
  juillet: {
    hunt: { title: 'les cocardes du bal', sub: 'tombées des drapeaux · feu d\'artifice sur le village à la nuit', one: 'cocarde', many: 'cocardes', coins: 70, cur: 0, done: 700, ach: 'ev_juillet' },
    stall: { title: 'la buvette du bal', shelf: shelf([['limonade', { coins: 30 }], ['merguez', { coins: 25 }]]) },
  },
  halloween: {
    cur: ['bonbon', 'bonbons'],
    hunt: { title: 'les citrouilles perdues', sub: 'treize, cachées dans le jardin et le village · et sonne chez les voisins', one: 'citrouille', many: 'citrouilles', coins: 40, cur: 3, done: 700, ach: 'ev_halloween' },
    stall: { title: 'chez la sorcière', rate: 25, shelf: shelf([['plume', { cur: 4 }], ['pique', { cur: 3 }], ['hante', { cur: 3 }]]) },
    uses: {
      treat: {
        prompt: (h, d) => (h.st.doors || {})[d.name] === h.day ? `chez ${d.name} · déjà sonné aujourd'hui` : `<b>e</b> sonner chez ${d.name} · des bonbons ou un sort !`,
        act(h, d) {
          const doors = (h.st.doors ||= {});
          if (doors[d.name] === h.day) { h.deny('déjà sonné ici aujourd\'hui'); return; }
          doors[d.name] = h.day;
          (h.st.rang ||= {})[d.name] = true;
          if (Math.random() < .75) { const n = 2 + Math.floor(Math.random() * 4); h.cur(n); h.toast(`${d.name} : « tiens, ${n} bonbons ! »`); h.audio.pickup(2); }
          else { h.spook(); h.toast(`${d.name} : « un sort ! » · BOUH`, true, 2400); }
          if (Object.keys(h.st.rang).length >= 12) h.unlock('ev_bonbons');
        },
      },
    },
  },
};

function crepeUse() {
  return {
    prompt: () => '<b>e</b> faire sauter une crêpe · 15 ●',
    act(h) {
      if (!h.pay(15)) return;
      h.flip();
      setTimeout(() => {
        if (Math.random() < .7) {
          h.st.flips = (h.st.flips || 0) + 1;
          h.heal(20); h.coins(30);
          h.toast(pick(['rattrapée ! et la pièce porte chance · +30 ●', 'pile dans la poêle · +30 ●', 'parfaite. +30 ●']));
          h.audio.pickup(2);
          if (h.st.flips >= 5) h.unlock('ev_crepes');
        } else { h.toast(pick(['au plafond ! elle y est encore.', 'sur la tête du voisin…', 'par terre. le chien est content.']), true); h.audio.bonk(); }
      }, 850);
    },
  };
}
function natsuCard(h) { return { title: 'un vœu au bambou', sub: 'au japon, sur la place · un vœu par jour', n: h.st.wish === h.day ? 1 : 0, of: 1 }; }
function wishUse() {
  return {
    prompt: (h) => h.st.wish === h.day ? 'le bambou des vœux · un vœu par jour' : '<b>e</b> accrocher un vœu au bambou',
    act(h) {
      if (h.st.wish === h.day) { h.deny('un vœu par jour · reviens demain'); return; }
      h.st.wish = h.day;
      const v = 100 + Math.floor(Math.random() * 300);
      h.coins(v); h.toast(`« creuser jusqu'au centre de la terre » · exaucé ? +${v} ●`, false, 3200);
      h.unlock('ev_voeu'); h.audio.win();
    },
  };
}
