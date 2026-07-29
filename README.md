# Destiny Loadouts Manager

Application web de gestion des loadouts Destiny 2. Voir [`DLM.md`](./DLM.md) pour la description fonctionnelle.

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **React 19**
- **bungie-api-ts** — types de l'API Bungie
- **TanStack Query** (cache API) + **Zustand** (état client)
- **Prisma** + **PostgreSQL** (stockage serveur des loadouts)
- **Dexie** / IndexedDB (manifeste Destiny + stockage local)
- **Sass / SCSS** (styles), **Floating UI** (tooltips), **dnd-kit** (drag & drop)
- **next-intl** (FR / EN)

## Démarrage avec Docker (recommandé)

Aucune installation de Node ou Postgres nécessaire — juste Docker. Les commandes
courantes sont regroupées dans un **Makefile** (`make help` pour la liste).

```bash
# 1. Configurer les variables d'environnement
cp .env.example .env
#    → remplir BUNGIE_API_KEY / CLIENT_ID / CLIENT_SECRET
#      (créer une app sur https://www.bungie.net/en/Application)
#    → générer SESSION_SECRET :  openssl rand -hex 32

# 2. Démarrer l'app + la base de données
make start

# 3. Initialiser la base (première fois seulement)
make migrate
```

L'app est disponible sur **https://localhost** (proxy Caddy, hot-reload actif).
Au premier accès le navigateur affichera un avertissement de certificat
auto-signé — c'est normal en local, clique sur « Continuer ».
PostgreSQL écoute sur `localhost:5432`.

> **HTTPS obligatoire** : Bungie refuse les URL de redirection en HTTP. Le proxy
> Caddy sert donc l'app en HTTPS (`https://localhost`) avec un certificat
> auto-signé, et relaie vers Next.js en interne.

### Commandes (Makefile)

```bash
make start      # démarre l'app + la DB (build si nécessaire)
make stop       # arrête et supprime les conteneurs (garde les données)
make logs       # suit les logs du serveur
make shell      # shell dans le conteneur de l'app
make db-shell   # console psql
make migrate    # applique les migrations Prisma
make studio     # Prisma Studio (http://localhost:5555)
make clean      # arrête tout + SUPPRIME les données de la DB
make reset      # remise à zéro complète
make help       # liste toutes les cibles
```

## Authentification Bungie (OAuth2)

Flow "Authorization Code" pour un client **Confidential** :

1. `GET /api/auth/login` — génère un `state` anti-CSRF (cookie) et redirige vers Bungie.
2. L'utilisateur autorise sur bungie.net.
3. `GET /api/auth/callback` — vérifie le `state`, échange le `code` contre les tokens,
   récupère le nom Bungie, upsert l'utilisateur en base, ouvre la session.
4. `POST /api/auth/logout` — détruit la session.

**Sécurité :** le `client_secret` et les tokens Bungie ne quittent jamais le serveur.
La session est un cookie `httpOnly` signé en HMAC ne contenant que l'id utilisateur.
L'access token (durée ~1h) est renouvelé automatiquement via le refresh token —
voir `getValidAccessToken()` dans `src/lib/auth/current-user.ts`.

> ⚠️ La *Redirect URL* configurée sur ton app Bungie doit être exactement
> `https://localhost/api/auth/callback`.

## Démarrage sans Docker

Nécessite Node 22+ et un PostgreSQL local.

```bash
npm install
cp .env.example .env           # ajuster DATABASE_URL (hôte "localhost")
npm run db:migrate
npm run dev
```

## Manifeste Destiny

Le manifeste contient toutes les définitions du jeu (objets, stats, classes…).
Il est volumineux et rarement modifié → mis en cache côté client dans **IndexedDB**
(via Dexie), pas en base serveur.

- `GET /api/manifest` (serveur) : proxy vers `/Destiny2/Manifest/` (ajoute la clé
  API) → renvoie la `version` + les chemins des tables JSON par langue.
- `ensureManifest(lang)` (client) : compare la version/langue stockée ; si besoin,
  télécharge les tables listées dans `src/lib/manifest/tables.ts` **directement
  depuis bungie.net** et les stocke en IndexedDB.
- `getDefinition(table, hash)` / `getDefinitions(table, hashes)` : lecture d'une
  ou plusieurs définitions.
- Le hook `useManifest()` déclenche le chargement et expose la progression
  (composant `ManifestStatus`).

Pour utiliser plus de données du jeu, ajoute la table voulue dans
`src/lib/manifest/tables.ts`.

## Préchargement des données d'objets

`/api/profile` demande les composants d'objets **au niveau du profil**
(`300,304,305,310`) : Bungie renvoie alors stats, sockets et plugs disponibles
de **tous** les objets du compte en une seule requête, au lieu d'un appel par
objet au survol. Les infobulles s'affichent donc sans attente.

La réponse brute de Bungie est élaguée avant d'être transmise au navigateur
(`src/lib/bungie/item-components.ts`) — on ne garde que ce que l'UI utilise :

| Étape | Poids |
|---|---|
| Composants bruts Bungie | ~1130 Ko |
| Après élagage | ~247 Ko |
| Réponse `/api/profile` complète | ~370 Ko en ~2,6 s |

Formes compactes retenues : `stats` = `{ hash: valeur }`, `sockets` = tableau du
plug équipé par index (`null` = socket masqué en jeu), `reusablePlugs` =
`{ index: [hashes] }`.

`useItemData()` sert la donnée depuis ce préchargement et ne retombe sur
`/api/item/[instanceId]` que pour un objet absent du profil. Les deux chemins
produisent exactement le même `ItemDetail`.

Le coffre (composant `102`) est inclus : partagé entre tous les personnages, il
est renvoyé dans `vault`. Son coût mesuré :

| Contenu de `/api/profile` | Poids | Temps |
|---|---|---|
| Sans le coffre | ~370 Ko | ~2,6 s |
| Avec le coffre | ~1,65 Mo | ~3,1 s |

## Objets affichés

Seuls les types d'objets qui composent un équipement sont affichés : **armes,
armures, doctrines (subclass) et artéfacts** (`DISPLAYED_ITEM_TYPES` dans
`src/lib/destiny/display.ts`). Tout le reste est masqué : coques de spectre,
emblèmes, vaisseaux, véhicules, emotes, consommables, matériaux, quêtes…

Le type n'est connu que du manifeste (l'API ne renvoie qu'un `itemHash`) : le
filtrage est donc fait côté client par `useDisplayableItems()`.

> **Cas particulier des artéfacts** : leur définition porte `itemType: 0` (None),
> aucune `itemCategoryHashes` et aucun `traitId` —
> `DestinyItemType.SeasonalArtifact` (28) ne les désigne pas. Le seul critère
> stable et indépendant de la langue est leur **emplacement**
> (`inventory.bucketTypeHash === 1506418338`), d'où `DISPLAYED_BUCKETS` en
> complément de `DISPLAYED_ITEM_TYPES`.

> L'emblème du sélecteur de personnage n'est pas concerné : il vient de
> `emblemBackgroundPath` et non de l'inventaire.

Effet mesuré sur un compte réel : équipé 17 → 9, inventaire 143 → 76,
coffre 1039 → 981 (671 armes + 310 armures), plus les artéfacts.

## Définitions mutualisées

`ItemDefsProvider` (`src/lib/destiny/item-defs.tsx`) charge en **une seule
requête groupée** toutes les définitions d'objets d'un inventaire, plus les
constantes d'overlay, et les expose par contexte.

Sans lui, chaque vignette lançait deux requêtes IndexedDB (sa définition + les
constantes) : avec un coffre de ~1000 objets, cela représentait plus de 2000
souscriptions Dexie. `ItemThumb` n'en fait plus aucune, et
`useDisplayableItems()` filtre de façon purement synchrone sur ces définitions
déjà chargées.

Les infobulles rendues via `FloatingPortal` conservent l'accès au contexte : un
portail React préserve l'arbre de contextes.

## Virtualisation du coffre

Le coffre approche le millier d'objets affichables : `VirtualItemGrid`
(`@tanstack/react-virtual`) ne monte que les **lignes visibles**, dans une zone
de défilement dédiée. Les images hors écran ne sont donc jamais demandées.

Les objets étant de taille fixe, la virtualisation se fait par lignes ; le nombre
de colonnes est déduit de la largeur disponible par `useGridMetrics()`, qui lit
`--item-size` et `--item-gap` **depuis le CSS** (source unique :
`abstracts/variables.scss`, exposée en variables CSS dans `layout/main.scss`).
La mesure utilise `useLayoutEffect` pour éviter une frame affichée sur une seule
colonne, et un `ResizeObserver` suit les changements de largeur.

Les sections « Équipé » et « Inventaire » restent en grille simple : quelques
dizaines d'objets, la virtualisation n'y apporterait rien.

> Le conteneur de défilement ne rogne pas les infobulles : elles sont rendues
> dans un portail, hors de cet arbre DOM.
>
> ESLint signale `Compilation Skipped: Use of incompatible library` sur ce
> composant : le React Compiler ne sait pas mémoïser `useVirtualizer`. C'est un
> avertissement attendu, sans effet sur le fonctionnement.

## Robustesse des appels Bungie & proxy sortant

bungie.net renvoie régulièrement des erreurs passagères (souvent **522** de
Cloudflare : timeout entre Cloudflare et l'origine Bungie). Deux mécanismes
indépendants :

### Retry automatique (actif par défaut)

`bungieFetch` (`src/lib/bungie/client.ts`) retente les requêtes **idempotentes**
(GET/HEAD) jusqu'à 3 tentatives, avec attente exponentielle et un peu
d'aléatoire, sur les statuts passagers (408, 429, 5xx, 520–524) et les échecs
réseau. Un timeout de 20 s évite qu'un 522 (Cloudflare attend ~90 s) ne bloque
la requête entrante. Les corps d'erreur sont tronqués pour ne pas noyer les logs.

C'est ce mécanisme — et non le proxy — qui empêche une défaillance passagère de
faire échouer une page.

### Proxy HTTP sortant (optionnel)

Utile si la liaison **directe** vers bungie.net est mauvaise depuis ta machine :
un proxy hébergé ailleurs peut offrir un meilleur routage. Aucune dépendance ni
code spécifique — Node sait le faire nativement :

```bash
# dans .env
HTTPS_PROXY=http://mon-proxy.exemple:3128
HTTP_PROXY=http://mon-proxy.exemple:3128
NODE_OPTIONS=--use-env-proxy      # sans ça, Node IGNORE les variables ci-dessus
NO_PROXY=localhost,127.0.0.1,db   # hôtes joints en direct
```

Puis `make restart`. Les variables sont déjà transmises au conteneur par
`docker-compose.yml` ; laissées vides, le proxy est simplement désactivé.

#### Proxy avec authentification

Les identifiants se placent dans l'URL — Node en dérive l'en-tête
`Proxy-Authorization: Basic …` tout seul :

```bash
HTTPS_PROXY=http://utilisateur:motdepasse@mon-proxy.exemple:3128
```

> ⚠️ **Les caractères spéciaux du mot de passe doivent être percent-encodés.**
> Sinon l'URL est invalide et **Node refuse de démarrer** (`ERR_INVALID_URL`,
> levé avant tout code applicatif — l'app ne boote pas du tout).
>
> | Caractère | `@` | `:` | `/` | `#` | `?` | `&` | espace |
> |---|---|---|---|---|---|---|---|
> | Encodage | `%40` | `%3A` | `%2F` | `%23` | `%3F` | `%26` | `%20` |
>
> Pour encoder un mot de passe :
> ```bash
> docker compose exec app node -p "encodeURIComponent('mon:mot@de/passe')"
> ```
>
> Le fichier `.env` n'est pas versionné (voir `.gitignore`), mais garde en tête
> qu'il contient alors un mot de passe en clair.

Si le proxy rejette les identifiants (407), le retry s'applique puis la route
renvoie une erreur 502 propre : l'application ne plante pas.

> **Portée** : seuls les appels faits par le serveur passent par ce proxy. Le
> téléchargement des tables du manifeste part du **navigateur** directement vers
> bungie.net (voir section Manifeste) et ne l'emprunte donc pas.

## Styles (SCSS)

Aucun style n'est écrit dans les composants : le JSX ne porte que des classes
sémantiques (`item-tooltip__header`, `character-tab--selected`…), et toutes les
règles vivent dans `src/scss/`.

```
src/scss/
  style.scss          point d'entrée (importé une fois dans le layout racine)
  abstracts/          variables Sass + mixins (ne produisent aucun CSS)
  layout/             mise en page générale : reset, palette, en-tête
  components/         un fichier par composant React
```

Conventions :

- Nommage **BEM** : `.bloc`, `.bloc__element`, `.bloc--modificateur`.
- La palette est exposée en **variables CSS** dans `layout/main.scss` (`--color-accent`…),
  ce qui permet de la surcharger à l'exécution.
- Les valeurs **dynamiques** (couleur de rareté, d'élément, largeur d'une barre de
  stat) sont transmises depuis React via des variables CSS inline
  (`style={{ "--tier-color": … }}`) plutôt que par des classes générées.
- Ajouter un composant = créer `components/mon-composant.scss` puis l'ajouter
  au `@use` de `style.scss`.

## Structure

```
src/
  app/[locale]/      Pages (routing i18n : "/" = FR, "/en" = EN)
  app/api/           Routes serveur (auth, manifest, profile, item)
  proxy.ts           Middleware de routing i18n (nommé "proxy" depuis Next 16)
  i18n/              Configuration next-intl (routing + request)
  lib/
    auth/            Session (cookie signé) + token Bungie valide
    bungie/          Wrapper API Bungie (OAuth, profil, objets)
    db/              Client Prisma
    destiny/         Constantes de jeu, types, logique des sockets
    manifest/        Téléchargement & cache du manifeste (IndexedDB)
  components/        Composants UI
  scss/              Styles (voir section « Styles »)
  store/             Stores Zustand
prisma/schema.prisma Modèle de données serveur
messages/            Traductions FR / EN
```
