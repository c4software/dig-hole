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

## tests

```sh
node test/net.test.mjs
```
