# AGENTS.md

Guide pour ajouter des choses au jeu sans le casser. Lire aussi `ARCHITECTURE.md` (les règles) et
`README.md` (lancer, déployer, administrer).

## style

- **Interface en français, tout en minuscules**, ton léger et joueur (« pas touche », « merci aliexpresso »).
- **Commentaires en anglais**, courts, qui disent le *pourquoi* ; même densité que le code autour.
- Modules ES, JavaScript sans framework ni TypeScript, pas de dépendance nouvelle sans raison forte.
- Tout est **procédural** (géométries three.js, canvas, WebAudio) : pas d'images, de sons ni de modèles
  à télécharger, pas de contenu sous droits (mélodies, logos, personnages de marques).
- Messages de commit en français, courts : « Orgue : … », « Fusion : … ».

## avant de coder

1. Chercher si ça existe déjà (`src/lib/`, `vehicles.js`, `rig.js`, `tunables.js`, `netlerp.js`).
2. Décider où vit l'état (voir le tableau d'`ARCHITECTURE.md`) : op du monde, `eco.s`, ou `fx` éphémère.
3. Mettre le code dans **un nouveau fichier** ; dans `main.js` (≈3 500 lignes) ne faire que des
   branchements courts et localisés.

## recettes

**Un mini-jeu**
1. `src/monjeu.js` exporte `createMonJeu({ audio, ui, … })` qui renvoie un module du contrat « race module ».
2. `src/games.js` : `monjeu: () => import('./monjeu.js').then(m => m.createMonJeu)`.
3. `main.js` : une entrée `RACES.monjeu = { make: (create) => create({ … }), help, prizes, screen? }`,
   une entrée `GAME_KEYS`, et `SCREEN_GAMES` s'il est en 2D.
4. `src/minigames.js` : `GAMES.monjeu = { name, sub, unit }`.
5. Un point d'accès dans le monde (borne, table, porte : un `interactable` avec `game: 'monjeu'`).
6. Solo avec robots, multijoueur par `send`/`onFx` (l'hôte arbitre), fin par `onEnd`.

**Une op du monde** : l'ajouter dans `applyOp`, la rendre déterministe, l'envoyer avec `net.sendOp`,
vérifier son rejeu depuis un journal (`room.js` la garde telle quelle).

**Un objet / un explosif** : `ITEMS` et `SLOTS` (`economy.js`), `BLAST` + modèle (`bombs.js`),
effet dans `explode`/`useItem` (`main.js`), réglages de taille et dégâts dans `tunables.js`.

**Un réglage admin** : une ligne dans `DEFS` (`tunables.js`, défaut = comportement actuel exactement),
lu par `tun.get(key)` là où la valeur sert. Il apparaît seul dans F2, `serveur.html?admin` et `admin.mjs`.

**Une fête** : `events-calendar.js` (dates), `events-decor.js` (décor construit seulement pendant la fête,
retiré proprement), `events-play.js` (chasse, stand).

**Un vêtement** : `outfits.js` (catalogue et emplacement), vendu par une boutique de `boutiques.js`.

## vérifier

- `npm test` (node) doit rester vert : réseau, salle, fêtes, holy bomba, orgue, sons, chargement des jeux.
- Syntaxe : `node --check src/fichier.js`.
- Navigateur : `node server.mjs --port 8799 --dir .` puis `?go=1` (solo) ; `window.__dig` donne les
  poignées de test (`launchGame`, `startRace`, `quitRace`, `travel`, `interact`, `eco`, `terrains`…).
  Chromium headless sur cette machine : `--headless=new --no-sandbox --disable-dev-shm-usage`
  (sans le dernier, `/dev/shm` de 64 Mo provoque pertes de contexte WebGL et erreurs de shader).
- Deux onglets de jeu à la fois figent le GPU de cette machine : tester le multijoueur par une
  simulation node (deux instances reliées par un faux réseau) ou un pair `ws` en node.
- Mesurer ce qu'on optimise (temps d'image max, `renderer.info.render.calls`), avant et après.

## pièges connus

- Une lumière ajoutée en cours de jeu, un changement d'ombres : recompilation de tout (voir ARCHITECTURE).
- `onEnd` appelé pendant `update` : ne pas toucher à `race` ensuite sans vérifier qu'il existe encore.
- Les objets interactifs sous terre ne répondent que si eux aussi sont sous terre (`findNear`).
- Le dallage de la nef et la pelouse ont des trous au-dessus des zones creusables (`cutDig`, `lawnShape.holes`) :
  un nouveau sol posé sur du terrain creusable doit faire pareil.
- La carte d'indice `#quest` est partagée (clé, trappe, boussole) : la rendre dans l'état où on l'a trouvée.
- `n` (maintenu) est le talkie de la voix de proximité (`voice.js`, `talkie.js`, R3 à la manette) : un jeu qui
  veut `n` l'attrape en capture avec `stopImmediatePropagation` (comme le taiko de `matsuri.js`).
  Un `fx` avec `only: id` ne va qu'à ce joueur (signalisation WebRTC de la voix).
- `deploy.sh` redémarre le serveur de production : prévenir quand des joueurs sont connectés.
- Ne jamais commiter `data/`, `dist*/`, `core`, `node_modules/`.
