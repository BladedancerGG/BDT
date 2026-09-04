#!/bin/sh
# Compile et exécute les vérifications des moteurs purs, dans le conteneur.
#
# Tout s'y passe : `node_modules` vit dans un volume anonyme du conteneur, et
# `npx tsc` lancé depuis l'hôte échouerait (voir CLAUDE.md).
set -e
cd "$(dirname "$0")/../.."

# Une seule compilation pour les trois : les erreurs de type sortent d'un bloc.
docker compose exec -T app npx tsc -p scripts/checks/tsconfig.json

# Les modules compilés cherchent leurs dépendances à côté d'eux.
docker compose exec -T app ln -sfn /app/node_modules /tmp/checks/node_modules

status=0
for check in edit equip insert backup; do
  printf '\n═══ %s ═══\n' "$check"
  docker compose exec -T app node "/tmp/checks/scripts/checks/$check.check.js" || status=1
done

# —— La feuille de styles : règles qui se recouvrent.
#
# Sur le CSS **compilé** et non minifié : le SCSS est imbriqué, ses mixins
# recopient des déclarations, et la minification de Next fusionne déjà une partie
# de ce qu'on cherche à voir.
printf '\n═══ css ═══\n'
docker compose exec -T app npx sass src/scss/style.scss /tmp/style.css \
  --no-source-map --style=expanded >/dev/null
docker compose exec -T app cat /tmp/style.css > /tmp/bdt-style.css
python3 scripts/checks/css-duplicates.py /tmp/bdt-style.css || status=1

printf '\n'
[ "$status" -eq 0 ] && echo "✓ Toutes les vérifications passent." || echo "✗ Au moins une vérification a échoué."
exit "$status"
