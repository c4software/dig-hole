# a hole

Un jeu où l'on creuse un trou (three.js, modules ES, sans étape de build).

## lancer

```sh
npm install
node server.mjs --port 8765 --dir .     # sert le jeu et le jardin commun
./deploy.sh                             # production : copie dans dist/, relance le serveur sur :8765
```

`server.mjs` sert les fichiers, héberge le jardin commun (`/ws`), le livre d'or (`/api/notes`),
la mise en relation des parties hébergées dans un onglet (`/sig`) et la porte d'administration (`/admin`).

## jouer à plusieurs

- **le jardin commun** : « à plusieurs » → « creuser », tout le monde dans le même jardin, sur le serveur.
- **héberger une partie** : ton onglet devient le serveur (WebRTC). Les autres rejoignent avec `@nom-de-la-partie`
  (quand le serveur node est là) ou avec un lien d'invitation. Dans la partie, **f2** ouvre le panneau serveur.
- `serveur.html` : le panneau de l'onglet hôte dans une autre fenêtre, ou un serveur dédié sans le jeu.

## la console du serveur (le jardin commun)

Les mêmes pouvoirs que l'hôte d'une partie : réglages en direct (gravité, vitesse du temps, raids, prix…),
dons (pièces, objets, minerais), renvoyer quelqu'un, lancer un raid, nouvelle carte, un mot pour tout le monde,
ménage dans le livre d'or.

### le jeton

Au premier démarrage, le serveur crée un jeton dans `data/admin-token` (lisible par toi seul, jamais servi).
On peut aussi le fixer : `node server.mjs --admin-token <jeton>` ou `DIG_ADMIN_TOKEN=<jeton>`.

```sh
cat data/admin-token          # sur la machine du serveur, dans le dossier du jeu
```

### dans le navigateur

Ouvre `serveur.html?admin` sur le serveur lui-même :

```
https://ton-domaine/serveur.html?admin&room=jardin
http://localhost:8765/serveur.html?admin
```

ou vise un autre serveur : `serveur.html?admin=wss://ton-domaine&room=jardin`.
Le jeton est demandé une fois et gardé le temps de l'onglet (sessionStorage).
Les réglages changés restent en place après un redémarrage (`data/rooms/jardin.tun.json`).

### en ligne de commande

Depuis le dossier du jeu (le jeton est lu dans `data/admin-token`) :

```sh
node admin.mjs                          # une invite : tab complète, « help » liste tout
node admin.mjs players                  # qui est là
node admin.mjs get                      # les réglages (* : changé)
node admin.mjs set gravity 0.5
node admin.mjs set season hiver
node admin.mjs reset all
node admin.mjs give anne pièces 500
node admin.mjs give all dynamite 3
node admin.mjs give bob fer 10          # un minerai par son nom ou son numéro
node admin.mjs kick bob
node admin.mjs raid
node admin.mjs newmap
node admin.mjs say "goûter à 16 h"
node admin.mjs notes                    # le livre d'or ; delnote 3 efface le 3e
```

Options : `--url ws://localhost:8765` (par défaut), `--room jardin`, `--token …` (ou `DIG_ADMIN_TOKEN`).
Depuis une autre machine : `node admin.mjs --url wss://ton-domaine --token … players`.

## la version sans serveur (Netlify, n'importe quel hébergement statique)

Le jeu tourne aussi sans `server.mjs` : de simples fichiers, et les joueurs se connectent
directement entre eux (WebRTC). Pas de jardin commun ni de console du serveur dans ce mode :
on joue seul, ou l'un **héberge** une partie et les autres la **rejoignent**.

### construire et déployer

```sh
./build-static.sh                 # → dist-static/ (ou ./build-static.sh mon-dossier)
```

- **glisser-déposer** : dépose le dossier `dist-static/` sur https://app.netlify.com/drop
- **depuis le dépôt** : `netlify.toml` lance le même script et publie `dist-static/`
- ailleurs : n'importe quel serveur de fichiers (`python3 -m http.server` dans le dossier suffit pour essayer).

Le script copie le jeu, ajoute une version aux adresses des modules (comme `deploy.sh`),
écrit `src/config.js` (`serverless: true`) et les fichiers Netlify `_headers` (types et cache)
et `_redirects`. `./deploy.sh` ne change pas.
Sans ce drapeau, le jeu le devine tout seul : si `/api/notes` ne répond pas, il n'y a pas de serveur.

### héberger, rejoindre

- l'hôte : « à plusieurs » → « héberger une partie » (ou « creuser »). **f2** ouvre le panneau serveur :
  on y copie **le lien d'invitation** (`…/?join=t:nom:secret`), valable pour autant d'invités qu'on veut.
- l'invité ouvre le lien (ou le colle dans « rejoindre »), choisit son nom, « se connecter », puis « creuser ! ».
- la rencontre passe par des **trackers WebTorrent publics** (wss://tracker.openwebtorrent.com,
  tracker.webtorrent.dev…) : l'invité y annonce quelques offres WebRTC, l'hôte en prend une et répond.
  Ensuite tout passe en direct entre les navigateurs ; les trackers ne servent plus.
- en secours : « nouvelle invitation par code » dans le panneau (un code par invité, la réponse à recoller).
- le monde de l'hôte reste dans son navigateur (IndexedDB), exportable en fichier ; `serveur.html`
  peut faire tourner une partie sans le jeu (serveur dédié dans un onglet).

### ce qu'il faut savoir

- **vie privée** : les offres et réponses sont chiffrées (AES-GCM, clé tirée du nom et du secret du lien) ;
  un tracker voit qui se connecte (adresse IP) et une empreinte de la partie, jamais son nom ni le contenu.
  Qui a le lien peut entrer : le partager comme une clé.
- **fiabilité** : les trackers publics sont des services bénévoles ; on en essaie plusieurs à la fois,
  il en faut un seul. S'ils sont tous injoignables (réseau filtré), il reste l'invitation par code.
- **réseaux** : la connexion directe passe la plupart des box grâce aux serveurs STUN publics, pas tous
  (réseaux d'entreprise, 4G stricte) : un serveur TURN peut être indiqué dans le panneau ou la carte « rejoindre ».
- l'hôte doit garder son onglet ouvert ; s'il part, la partie s'arrête (on la reprend en réhébergeant).
- les fêtes du calendrier suivent la date de l'hôte ; le livre d'or est celui de la partie de l'hôte
  (en solo, sans serveur, il n'y en a pas).

## tests

```sh
node test/net.test.mjs
```
