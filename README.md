# D2 API APP (NAME NOT FINAL)

Web app to manage Destiny 2 loadouts — browse characters, inventory and vault,
inspect gear, and save loadout snapshots beyond the game's 20-per-character limit.

- [English](#english)
- [Français](#français)

Technical notes (architecture, Bungie API specifics, measured trade-offs):
[`ARCHITECTURE.md`](./ARCHITECTURE.md).
Functional scope: [`DLM.md`](./DLM.md).

---

# English

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **React 19**
- **Prisma** + **PostgreSQL** — server-side loadout storage
- **Dexie** / IndexedDB — Destiny manifest cache
- **TanStack Query** + **Zustand** — API cache and client state
- **Sass / SCSS**, **Floating UI**, **next-intl** (EN / FR)
- **Caddy** as reverse proxy (HTTPS)

## Local installation

### With Docker (recommended)

No need to install Node or Postgres — only Docker. Common commands live in a
**Makefile** (`make help` lists them all).

```bash
# 1. Configure the environment
cp .env.example .env
#    → fill in BUNGIE_API_KEY / CLIENT_ID / CLIENT_SECRET
#      (create an app at https://www.bungie.net/en/Application)
#    → generate SESSION_SECRET:  openssl rand -hex 32

# 2. Start the app and the database
make start

# 3. Initialise the database (first run only)
make migrate
```

The app is served at **https://localhost** (Caddy proxy, hot-reload enabled).
On first visit the browser warns about the self-signed certificate — expected
locally, click through. PostgreSQL listens on `localhost:5432`.

> **HTTPS is mandatory**: Bungie rejects HTTP redirect URLs. Caddy therefore
> serves the app over HTTPS with a self-signed certificate and proxies to
> Next.js internally.
>
> The *Redirect URL* on your Bungie app must be exactly
> `https://localhost/api/auth/callback`.

#### Everyday commands

```bash
make start      # start app + DB (builds if needed)
make stop       # stop and remove containers (keeps data)
make logs       # follow server logs
make shell      # shell inside the app container
make db-shell   # psql console
make migrate    # apply Prisma migrations
make studio     # Prisma Studio (http://localhost:5555)
make adminer    # print Adminer's URL and credentials
make clean      # stop everything and DELETE database data
make reset      # full reset
make help       # list all targets
```

### Without Docker

Requires Node 22+ and a local PostgreSQL.

```bash
npm install
cp .env.example .env     # adjust DATABASE_URL (host "localhost")
npm run db:migrate
npm run dev
```

## Production deployment

### Server prerequisites

- Docker with the Compose plugin (`docker compose version`)
- The **domain points to the server's IP** (A record, plus AAAA for IPv6)
- **Ports 80 and 443 reachable from the internet** — port 80 is used for ACME
  validation and the HTTPS redirect, it cannot be omitted

### Register the app with Bungie

At https://www.bungie.net/en/Application:

- **OAuth Client Type**: `Confidential`
- **Redirect URL**: `https://<your-domain>/api/auth/callback`

This URL must match `APP_URL` **exactly** (Compose builds it from
`APP_DOMAIN`), otherwise the token exchange fails.

### Bring it up

```bash
git clone <your-repo> bdt && cd bdt

cp .env.production.example .env
# Fill in APP_DOMAIN, ACME_EMAIL, the Bungie credentials, and generate:
#   openssl rand -hex 32   → POSTGRES_PASSWORD
#   openssl rand -hex 32   → SESSION_SECRET

make prod-up      # build, migrate, then start
make prod-ps      # app/db/caddy should report "healthy"
make prod-logs
```

Caddy obtains the Let's Encrypt certificate on first start. No variable may be
left empty: Compose refuses to start if one is missing.

> ⚠️ **Use a database password with no special characters.** It is inserted
> as-is into `DATABASE_URL`, and a `/`, `+`, `@` or `:` breaks URL parsing —
> Prisma then fails with `P1013: invalid port number in database URL`. Prefer
> `openssl rand -hex 32`; avoid `-base64`, which almost always yields one of
> those characters.

### What production changes

| | Development | Production |
|---|---|---|
| App image | mounted source, hot-reload | standalone build (**319 MB**) |
| User | root | `node`, unprivileged |
| Published ports | app 3000, db 5432, Adminer 8080 | **Caddy only** (80/443) |
| TLS | self-signed | Let's Encrypt, automatic |
| Migrations | `prisma migrate dev`, manual | `migrate deploy`, before the app |
| Adminer | present | absent |

The database is **not exposed**: it is reachable only on Docker's internal
network. To inspect it, use `docker compose -f docker-compose.prod.yml exec db
psql …` or an SSH tunnel.

### Operating it

```bash
make prod-logs      # app logs (capped at 3 × 10 MB)
make prod-backup    # compressed database dump
make prod-migrate   # replay migrations only
make prod-down      # stop; data and certificates are kept
```

Updating: `git pull && make prod-up` — rebuilds, replays migrations, restarts.

> ⚠️ The `caddy_data` volume holds the certificates and ACME account. Deleting
> it forces re-issuance, and Let's Encrypt enforces rate limits — **never use
> `down -v` in production**.

> ⚠️ `SESSION_SECRET` signs session cookies: changing it signs everyone out.
> `/api/health` checks both the server and the database, and is used as a probe
> by Docker and Caddy.

---

# Français

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **React 19**
- **Prisma** + **PostgreSQL** — stockage serveur des équipements
- **Dexie** / IndexedDB — cache du manifeste Destiny
- **TanStack Query** + **Zustand** — cache API et état client
- **Sass / SCSS**, **Floating UI**, **next-intl** (FR / EN)
- **Caddy** en reverse proxy (HTTPS)

## Installation en local

### Avec Docker (recommandé)

Aucune installation de Node ou Postgres nécessaire — juste Docker. Les commandes
courantes sont regroupées dans un **Makefile** (`make help` pour la liste).

```bash
# 1. Configurer les variables d'environnement
cp .env.example .env
#    → remplir BUNGIE_API_KEY / CLIENT_ID / CLIENT_SECRET
#      (créer une app sur https://www.bungie.net/en/Application)
#    → générer SESSION_SECRET :  openssl rand -hex 32

# 2. Démarrer l'app et la base de données
make start

# 3. Initialiser la base (première fois seulement)
make migrate
```

L'app est disponible sur **https://localhost** (proxy Caddy, hot-reload actif).
Au premier accès le navigateur affiche un avertissement de certificat
auto-signé — c'est normal en local, clique sur « Continuer ».
PostgreSQL écoute sur `localhost:5432`.

> **HTTPS obligatoire** : Bungie refuse les URL de redirection en HTTP. Caddy
> sert donc l'app en HTTPS avec un certificat auto-signé, et relaie vers Next.js
> en interne.
>
> La *Redirect URL* de ton app Bungie doit être exactement
> `https://localhost/api/auth/callback`.

#### Commandes du quotidien

```bash
make start      # démarre l'app + la DB (build si nécessaire)
make stop       # arrête et supprime les conteneurs (garde les données)
make logs       # suit les logs du serveur
make shell      # shell dans le conteneur de l'app
make db-shell   # console psql
make migrate    # applique les migrations Prisma
make studio     # Prisma Studio (http://localhost:5555)
make adminer    # rappelle l'URL et les identifiants d'Adminer
make clean      # arrête tout et SUPPRIME les données de la DB
make reset      # remise à zéro complète
make help       # liste toutes les cibles
```

### Sans Docker

Nécessite Node 22+ et un PostgreSQL local.

```bash
npm install
cp .env.example .env     # ajuster DATABASE_URL (hôte « localhost »)
npm run db:migrate
npm run dev
```

## Déploiement en production

### Prérequis sur le serveur

- Docker et le plugin Compose (`docker compose version`)
- Le **domaine pointe vers l'IP du serveur** (enregistrement A, et AAAA en IPv6)
- Les **ports 80 et 443 joignables depuis Internet** — le 80 sert à la
  validation ACME et à la redirection vers HTTPS, il ne peut pas être omis

### Déclarer l'application côté Bungie

Sur https://www.bungie.net/en/Application :

- **OAuth Client Type** : `Confidential`
- **Redirect URL** : `https://<ton-domaine>/api/auth/callback`

Cette URL doit correspondre **exactement** à `APP_URL` (que Compose construit
depuis `APP_DOMAIN`), sinon l'échange de token échoue.

### Mise en service

```bash
git clone <ton-dépôt> bdt && cd bdt

cp .env.production.example .env
# Remplir APP_DOMAIN, ACME_EMAIL, les identifiants Bungie, et générer :
#   openssl rand -hex 32   → POSTGRES_PASSWORD
#   openssl rand -hex 32   → SESSION_SECRET

make prod-up      # build, migrations, puis démarrage
make prod-ps      # app/db/caddy doivent être « healthy »
make prod-logs
```

Caddy obtient le certificat Let's Encrypt au premier démarrage. Aucune variable
ne doit rester vide : Compose refuse de démarrer si l'une manque.

> ⚠️ **Utiliser un mot de passe de base sans caractère spécial.** Il est inséré
> tel quel dans `DATABASE_URL`, et un `/`, `+`, `@` ou `:` casse l'analyse de
> l'URL — Prisma échoue alors sur `P1013: invalid port number in database URL`.
> Préférer `openssl rand -hex 32` ; éviter `-base64`, qui produit presque
> toujours l'un de ces caractères.

### Ce que la production change

| | Développement | Production |
|---|---|---|
| Image de l'app | code monté, hot-reload | build autonome (**319 Mo**) |
| Utilisateur | root | `node`, sans privilèges |
| Ports publiés | app 3000, db 5432, Adminer 8080 | **Caddy seul** (80/443) |
| TLS | certificat auto-signé | Let's Encrypt, automatique |
| Migrations | `prisma migrate dev` à la main | `migrate deploy`, avant l'app |
| Adminer | présent | absent |

La base n'est **pas exposée** : elle n'est joignable que par le réseau interne
Docker. Pour l'inspecter, passer par `docker compose -f docker-compose.prod.yml
exec db psql …` ou un tunnel SSH.

### Exploitation

```bash
make prod-logs      # journaux de l'app (plafonnés à 3 × 10 Mo)
make prod-backup    # dump compressé de la base
make prod-migrate   # rejouer les migrations seules
make prod-down      # arrêt ; données et certificats conservés
```

Mise à jour : `git pull && make prod-up` — rebuild, migrations, redémarrage.

> ⚠️ Le volume `caddy_data` contient les certificats et le compte ACME. Le
> supprimer force une réémission, or Let's Encrypt applique des quotas —
> **ne jamais utiliser `down -v` en production**.

> ⚠️ `SESSION_SECRET` signe les cookies de session : le changer déconnecte tout
> le monde. `/api/health` vérifie le serveur **et** la base, et sert de sonde à
> Docker comme à Caddy.
