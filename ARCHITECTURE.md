# architecture

Ce document décrit comment le jeu est construit **et les règles à ne pas casser**. Quand un ajout
semble exiger d'en contourner une, c'est le signe qu'il faut discuter du design d'abord.

## vue d'ensemble

```
index.html ── src/main.js ── src/world.js (scène, lumières, rendu, qualité)
                   │         ├─ src/terrain.js (voxels creusables, un par monde)
                   │         ├─ src/europe.js, china.js, house.js, church.js… (décors)
                   │         └─ src/player.js / moonplayer.js (déplacement)
                   ├─ src/games.js ── import() à la demande ── kart.js, nes.js, worms3d.js… (mini-jeux)
                   ├─ src/net.js ── WebSocket ou WebRTC (src/p2p.js, rtc.js, rendezvous.js)
                   ├─ src/economy.js (sauvegarde eco.s), src/tunables.js (réglages en direct)
                   └─ src/lib/ (math, textures canvas, synthé WebAudio, formats)

server.mjs ── src/room.js (la salle : log d'ops, relais) ── src/roomadmin.js (console /admin)
           └─ src/signal.js (/sig : mise en relation WebRTC)
```

- **Pas d'étape de build pour développer** : modules ES servis tels quels (`node server.mjs --dir .`).
  Les scripts de livraison (`deploy.sh`, `build-static.sh`, `docker/Dockerfile`) ne font que versionner
  les URL (`?v=`) et minifier avec esbuild **fichier par fichier, à chemins identiques**.
- **three.js** est vendu dans `vendor/three.module.min.js` (0.186), via l'importmap de `index.html`.
  Pas d'autre dépendance côté client. Côté serveur : `ws` seulement.

## les mondes

`here` vaut `home` (jardin, village, église), `china` (le japon), `moon`, `mars`. Chaque monde creusable a
son `terrains[w]` ; l'église a le sien (`church`, sous la nef). `W(pos)` donne le terrain sous un point.

- La maison, le village, la cave, la crypte sont du **décor dans `homeRoot`** ; les planètes sont des
  sphères de voxels (`T.sphere`) où l'on marche avec `moonplayer.js`.
- Le sol creusable est rendu par morceaux (`flush(max, budgetMs)`) : **jamais de `flush()` complet**
  pour un gros changement dans la boucle de jeu, la boucle refait le maillage quelques morceaux par image.

## l'état et sa synchronisation

Trois sortes d'état, trois chemins — ne pas les mélanger :

| quoi | où | comment ça se partage |
|---|---|---|
| **le monde modifié** (trous, échelles, trouvailles, colis au sol…) | ops `applyOp({ k, w, … })` dans `main.js` | journal de la salle (`room.js`), rejoué aux retardataires, sauvegardé (`data/rooms/*.json` ou IndexedDB de l'hôte) |
| **le joueur** (argent, objets, sac, tenue, progression) | `eco.s` (`economy.js`), sauvegarde locale | à lui seul ; la tenue et les mains sont envoyées en `fx` |
| **l'éphémère** (positions, tirs, émotes, courses) | `net.sendFx`, état à ~10 Hz | relayé, jamais gardé |

- Ops existantes : `carve box reset ladder unladder find refinds drop take holy ev moonportal`.
  Une op doit être **déterministe** (même résultat chez tous) et **idempotente au rejeu**.
- Ce qui ne doit arriver qu'une fois (ramasser un sac, un œuf) est **arbitré par la salle** :
  le premier `take` valide gagne, le client ne se donne le contenu qu'à la confirmation (`drops.js`).
- La **date** (fêtes) et les **réglages en direct** viennent de la salle (`welcome`), jamais de l'horloge
  ou des valeurs locales du client.

## multijoueur

- **Trois modes** : solo (pas de réseau), jardin commun (`server.mjs`), partie hébergée (un onglet est la
  salle, WebRTC en étoile ; mise en relation par `/sig` ou par trackers WebTorrent publics en statique).
  `net.js` cache le transport : le code de jeu ne doit pas savoir lequel tourne.
- **Autorité** : chaque client est seul maître de **son** personnage/véhicule ; l'hôte (ou le client
  désigné `hostId`) fait tourner les robots, les ennemis et tranche les coups. Les véhicules des autres
  sont rejoués ~100 ms en arrière et lissés (`src/netlerp.js`) — **ne jamais écraser l'état local avec un
  paquet réseau**, sauf remise en piste explicite.
- Le serveur node et une salle hébergée partagent **le même `room.js`** : toute règle de salle s'écrit là.

## les mini-jeux (le contrat « race module »)

Registre dans `main.js` (`RACES`) + code chargé à la demande (`src/games.js`) + fiche (`GAMES` dans
`src/minigames.js`). Un module expose :

```
start({ seed, opts, humans, hostId, meId, send })   update(dt, keys)   stop()   respawn()
hud()   onFx(peerId, fx)   peerLeft(id)   modes?   setRect(rect)?  (jeux 2D : screen: true)
onEnd({ place, time, of, value?, text? })  ← posé par main.js, appelé à la fin
```

- Tout part du **même seed** chez tous les joueurs ; le lobby lance le jeu pendant le compte à rebours.
- `onEnd` peut être appelé pendant `update` : le code appelant vérifie `race` après chaque `update`.
- Un jeu 2D dessine sur **son propre canvas** (`screen: true`) ; un jeu 3D a son décor loin du monde
  (ex. `(700, 0, 700)`) ou dans un diorama (`slotAt` de la cave), et remet la caméra en partant.

## rendu et performances (leçons apprises)

- **Ne jamais ajouter/retirer une lumière pendant le jeu** : le nombre de lumières fait partie de la clé
  des shaders, tous les matériaux se recompilent (gel de 1 à 5 s). Garder une lumière permanente à
  intensité 0 et la réutiliser (`bombs.js`, `holy.js`).
- **Changer ombres/bloom recompile tout** : la qualité prépare les deux variantes au chargement
  (`world.warmQuality`). Ne pas ajouter de réglage qui change des defines de shader en cours de partie.
- `renderer.debug.checkShaderErrors` est coupé hors `?debug` (sinon attente synchrone du driver).
- **Pas de NaN dans les normales** : un pixel NaN est étalé par le bloom et noircit l'écran
  (le bloom est protégé, mais corriger la source).
- Nouveau matériau ou objet rare = compilation au premier affichage : le préparer derrière un écran
  (chargement, verres noirs du casque) si c'est gros.
- Budget : `flush` par morceaux, pas d'allocation par image dans les boucles chaudes, géométries
  fusionnées (`mergeStatic`), matériaux partagés (`vehicles.js`, `rig.js`).
- La qualité auto (`watchFrames`) ignore les à-coups connus : appeler `quietFrames(s)` avant une grosse
  opération volontaire (explosion géante, voyage).

## ce qui est partagé — à réutiliser, pas à recopier

- `src/lib/` : `clamp`, `lerp`, aléatoires seedés, textures canvas (`canvasTex`, `tagTex`), synthé WebAudio
  (`createSynth`, `createTune`), formats (`esc`, `fmtTime`, `ord`, `hexOf`).
- `src/vehicles.js` : roues, carrosseries arrondies, matériaux, bouffées de fumée.
- `src/rig.js` : **le** personnage (joueurs, passants, vendeurs, astronaute). Pas d'autre modèle humain.
- `src/tunables.js` : toute valeur de gameplay qu'un admin pourrait vouloir changer.
- `src/netlerp.js` : rejouer l'état des autres.

## livraison

| cible | commande | contenu |
|---|---|---|
| production (cette machine) | `./deploy.sh` | `dist/` + `server.mjs` sur :8765 (redémarre le serveur) |
| statique (Pages, Netlify, CDN) | `./build-static.sh` | `dist-static/`, sans serveur (WebRTC seulement) |
| image docker | tag `v*` → CI | `ghcr.io/c4software/dig-hole:latest`, serveur + client, `/app/data` en volume |

`data/` (salles, livre d'or, jeton admin) n'est **jamais** servi ni commité.
