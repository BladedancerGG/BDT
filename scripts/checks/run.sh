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

printf '\n'
[ "$status" -eq 0 ] && echo "✓ Tous les moteurs passent." || echo "✗ Au moins une vérification a échoué."
exit "$status"
