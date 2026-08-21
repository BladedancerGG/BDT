# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Application web de gestion d'équipements (« loadouts ») Destiny 2, adossée à l'API Bungie.
Next.js 16 (App Router) + PostgreSQL, le tout en conteneurs Docker.

## Documents de référence

Ne pas dupliquer leur contenu ici — y renvoyer.

| Fichier            | Contenu                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `README.md`        | Installation locale et déploiement en production, uniquement               |
| `ARCHITECTURE.md`  | Notes techniques détaillées : OAuth, manifeste, icônes, ornements, doctrines, préchargement, virtualisation, SCSS, thème |
| `DLM.md`           | Cahier des charges d'origine (fonctionnalités visées)                      |

`ARCHITECTURE.md` est la première chose à lire avant de toucher à la logique Destiny.
Les deux premiers sont bilingues : **anglais d'abord, puis français**. Conserver cette structure.

## Tout tourne dans Docker

C'est la contrainte à connaître avant toute autre : `node_modules` vit dans un **volume anonyme**
du conteneur, pas sur l'hôte. `npm`, `npx` et `tsc` lancés depuis l'hôte échouent.

```bash
docker compose exec app npx tsc --noEmit     # vérification de types
docker compose exec app npm run lint
docker compose exec app npm install <pkg>    # ou : make install pkg=<pkg>
```

Raccourcis (`make help` les liste tous) :

```bash
make start          # démarre app + base — NOTE : au premier plan, malgré le commentaire du Makefile
make stop           # arrête et supprime les conteneurs (données conservées)
make logs           # suit les logs Next.js
make lint
make migrate        # prisma migrate dev
make studio         # Prisma Studio, http://localhost:5555
make db-shell       # console psql
```

**Aucun framework de test n'est installé.** Il n'y a donc pas de commande de test.
Pour valider une logique pure, la voie praticable est de compiler le module ciblé puis de
l'exécuter dans le conteneur :

```bash
docker compose exec app npx tsc src/lib/destiny/sort.ts --outDir /tmp/st \
  --module commonjs --target es2022 --skipLibCheck --moduleResolution node
```

Les alias `@/…` ne se résolvent pas hors du bundler : les imports concernés doivent être des
`import type` (effacés à la compilation), sinon il faut les rediriger vers des doublures.
Si le module compilé requiert `react`, lier les dépendances : `ln -s /app/node_modules /tmp/st/node_modules`.

## HTTPS obligatoire

Bungie refuse les URL de redirection en HTTP. Caddy sert donc l'app en HTTPS même en local, avec
un certificat auto-signé : l'app est sur **https://localhost**, et tout `curl` a besoin de `-k`.
`http://localhost:3000` contourne le proxy et n'est pas le point d'entrée normal.

## Langue et conventions

- **Commentaires de code, messages de commit et échanges : en français.**
- Les commentaires expliquent *pourquoi*, pas *quoi* — souvent le piège écarté ou la mesure qui a
  tranché. C'est la norme du dépôt, la suivre.
- Chaînes d'interface dans `messages/en.json` et `messages/fr.json`, **parité stricte des clés**
  (à vérifier après toute modification). Locales : `fr` par défaut sans préfixe (`/`), `en` sur `/en`.
- Styles en SCSS, **un fichier par composant** sous `src/scss/components/`, en BEM, importé dans
  `src/scss/style.scss`. Pas de style inline hors valeurs dynamiques.

## Architecture : ce qui ne se voit pas dans un seul fichier

**Un seul appel de profil sert tout l'écran.** `GetProfile` renvoie ~1,1 Mo de composants d'objets ;
`lib/bungie/item-components.ts` les élague en `ItemDetail` (~250 Ko) — instance, stats, sockets,
plugs équipables. Toute l'UI lit ce `ItemDetail`, jamais l'API par objet.

**Le manifeste est en IndexedDB** (Dexie), pas en mémoire serveur. `lib/manifest/` le télécharge et
le met en cache ; `lib/destiny/item-defs.tsx` (`ItemDefsProvider`) exécute **une seule requête
groupée** pour tout l'arbre, et les composants lisent via `useSharedDefinition` /
`useSharedIconDefinition`. Ne pas ajouter de requête Dexie par vignette : c'est l'optimisation
majeure du projet (auparavant 2000+ souscriptions pour un coffre).

**Les préférences vivent dans un cookie, pas dans localStorage** (`lib/settings/`). Le serveur les
lit et rend directement le bon thème et la bonne taille d'icônes : ni flash, ni écart d'hydratation,
ni script inline. Le cookie est plafonné à 4 Ko et partagé — sérialiser de façon compacte
(cf. les jetons de tri dans `lib/destiny/sort.ts`).

**Le tri du coffre** est un tri multi-critères ordonné par l'utilisateur : `lib/destiny/sort.ts`
(moteur pur, sérialisation cookie), `lib/destiny/sort-traits.ts` (caractéristiques dont le nom vit
ailleurs que dans la définition de l'objet), `components/settings/SortRuleList.tsx` (glisser-déposer
via `@dnd-kit`).

**Le coffre est virtualisé** (`components/VirtualItemGrid.tsx`, `@tanstack/react-virtual`) : environ
un millier d'objets, virtualisés par lignes. Les infobulles passent par un portail Floating UI pour
ne pas être rognées par le conteneur de défilement.

## Pièges déjà payés

- **Une constante exportée depuis un module `"use client"` arrive `undefined` côté serveur.** Tout
  ce qui est partagé avec le serveur va dans un module sans directive — voir
  `lib/settings/constants.ts`, dont l'en-tête le rappelle.
- **Ajouter une table du manifeste sans incrémenter `MANIFEST_SCHEMA_VERSION` est invisible.**
  Les clients ayant déjà la version précédente en cache ne téléchargent jamais la nouvelle table :
  chaque lecture y renvoie `undefined`, pour toujours, et l'interface affiche simplement du vide,
  sans erreur. `ensureManifest` lève désormais sur une table sans chemin ou vide, mais le bump
  reste à faire à la main.
- **Ne jamais deviner un hash ou une sémantique Destiny** : les vérifier contre le manifeste.
  Exemples relevés ainsi, contre-intuitifs : les artéfacts ont `itemType: 0` et ne sont
  identifiables que par leur emplacement ; l'élément d'une doctrine est dans
  `talentGrid.hudDamageType` (son `defaultDamageType` vaut toujours 0) ; les attributs intrinsèques
  d'armure exotique partagent la famille `intrinsics` des armatures d'armes ; un identifiant non
  renseigné vaut la sentinelle `2166136261` (base FNV-1a) et non zéro, si bien qu'un test de
  vérité le prend pour un vrai hash.
- **`docker compose down -v` détruit le volume de la base.** En production il emporte aussi les
  certificats et le compte ACME de Caddy, soumis à des quotas Let's Encrypt. `make clean` fait
  exactement ça — ne pas le lancer sur un serveur.
- **Le mot de passe Postgres doit être hexadécimal** (`openssl rand -hex 32`), jamais base64 :
  `/`, `+` et `=` cassent l'analyse de `DATABASE_URL` (`P1013`).
- **Changer `SESSION_SECRET` déconnecte tous les utilisateurs.**
- **Le minificateur CSS réduit `blur(0)` et `blur(0px)` à `blur()`.** Se méfier plus largement des
  valeurs nulles dans les fonctions animées ; vérifier le CSS **compilé**, pas la source.
- **Le lint n'est pas propre**, et c'est l'état attendu : une erreur préexistante dans
  `src/app/[locale]/page.tsx` (apostrophe non échappée) et un avertissement connu de
  `@tanstack/react-virtual` dans `VirtualItemGrid.tsx`. Ne pas les confondre avec une régression.

## Vérifier son travail

Sans tests automatisés, la vérification est manuelle et attendue :

```bash
docker compose exec app npx tsc --noEmit                    # types
docker compose exec app npm run lint                        # au-delà des 2 problèmes connus
curl -skL -o /dev/null -w "%{http_code}\n" https://localhost/fr   # et /en
docker compose logs app --since 30s                         # erreurs runtime
```

Pour du CSS, récupérer la feuille compilée (`/_next/static/…/*.css`) et y contrôler les règles :
les greps de chaînes exactes sur la source donnent des faux négatifs, le compilateur normalisant les
valeurs (`125ms` → `.125s`, `top right` → `100% 0`).

`.env` est ignoré par git et contient des secrets en clair. Adminer (commenté dans
`docker-compose.yml`) est un outil de développement seulement, absent de la production.