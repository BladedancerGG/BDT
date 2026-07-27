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
