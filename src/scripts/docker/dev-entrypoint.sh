#!/bin/sh
# Démarrage du conteneur de développement.
#
# `node_modules` ne vit plus dans un volume anonyme mais dans le bind mount du
# projet, pour que l'IDE de l'hôte y résolve types, imports et règles ESLint.
# Conséquence : l'image ne le livre plus (le montage le masquerait de toute
# façon), il faut donc l'installer ici, au démarrage.
set -e

# Repère de fraîcheur : npm écrit `node_modules/.package-lock.json` à chaque
# installation. Absent ou plus vieux que le lock du projet, on réinstalle.
# `npm ci` et non `npm install` : il échoue net si package.json et
# package-lock.json divergent, au lieu de choisir une version dans notre dos.
if [ ! -e node_modules/.package-lock.json ] ||
   [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "→ Dépendances absentes ou périmées : npm ci…"
  npm ci
else
  echo "→ node_modules à jour."
fi

# Génère le client Prisma (le schéma est monté en volume, donc absent au moment
# du build de l'image). `--no-install` est indispensable : sans lui, un
# node_modules incomplet fait télécharger prisma@latest à npx, qui réécrit
# package-lock.json au passage. C'est ainsi que le lock s'est retrouvé commité
# avec prisma 7 face à un package.json en ^5 — et npm ci refusait alors de
# tourner. Mieux vaut un échec net qu'une version choisie dans notre dos.
npx --no-install prisma generate

exec npm run dev
