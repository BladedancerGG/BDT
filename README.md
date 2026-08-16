# Bladedancer's Destiny Tools

## https://destinytools.bladedancer.net/

butter dog the dog with the butter on em
![Butter dog](public/images/butter-dog.gif "Butter dog")


### [English](#english) |  [Français](#français)

Technical notes (architecture, Bungie API specifics, measured trade-offs):
[`ARCHITECTURE.md`](./ARCHITECTURE.md).
Functional scope: [`DLM.md`](./DLM.md).

---

# English

## Local installation

### Prerequisites

#### Register the application with Bungie

Create a new application at https://www.bungie.net/en/Application (while logged in with a bungie.net account):

- Give a name to your application, can be any (it's going to be the name that shows up when logging in for the 1st time through bungie.net)
- Set **Application status** to `private`
- Set **OAuth Client Type** to `Confidential`
- Set **Redirect URL** to : 
```
https://localhost/api/auth/callback
```
- Set **Scope** to the following :
  -  Read your Destiny 2 information (Vault, Inventory, and Vendors), as well as Destiny 1 Vault and Inventory data.
  -  Move or equip Destiny gear and other items.

#### Docker

1. Install **Make** if you didn't already

Ubuntu/Debian based Distros:
```bash
sudo apt-get install make
```

2. Install **Docker** if you didn't already

Docker desktop is recommended as it comes with all the necessary tools used to run containers

Linux based systems: https://docs.docker.com/desktop/setup/install/linux/

3. Create the `.env` file and  edits its content

```bash
cp .env.example .env
```

Fill the following variables in the file: 
- `BUNGIE_API_KEY` (from the bungie.net application page)
- `CLIENT_ID` (from the bungie.net application page)
- `CLIENT_SECRET` (from the bungie.net application page)
- `SESSION_SECRET`
  - Generate it with:
```bash
openssl rand -hex 32
```

4. Start the application

```bash
make build
make start
```

You can now access the application at: https://localhost/

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

## Production deployment

### Server prerequisites

- Docker with the Compose plugin (`docker compose version`)
- A domain name pointing to the production server's IP
- **Ports 80 and 443 reachable from the internet**, make sure you allow trafic through your firewall

#### Register the application with Bungie

Create a new application at https://www.bungie.net/en/Application (while logged in with a bungie.net account):

- Give a name to your application, can be any (it's going to be the name that shows up when logging in for the 1st time through bungie.net)
- Set **Application status** to `private`
- Set **OAuth Client Type** to `Confidential`
- Set **Redirect URL** to :
```
https://[your domain]/api/auth/callback
```
- Set **Scope** to the following :
  -  Read your Destiny 2 information (Vault, Inventory, and Vendors), as well as Destiny 1 Vault and Inventory data.
  -  Move or equip Destiny gear and other items.

### Bring it up

3. Create the `.env` file and  edits its content

```bash
cp .env.production.example .env
```

Fill the following variables in the file, no variables should be left empty:
- `APP_DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_PASSWORD`
  - Generate it with: `openssl rand -hex 32`
- `BUNGIE_API_KEY` (from the bungie.net application page)
- `CLIENT_ID` (from the bungie.net application page)
- `CLIENT_SECRET` (from the bungie.net application page)
- `SESSION_SECRET`
  - Generate it with: `openssl rand -hex 32`

4. Start the application

```bash
make prod-cold-start
```

It will build the required containers and launch the application after it is finished.

### Operating it

```bash
make prod-cold-start # builds and starts the application
make prod-update-all # builds and restart the application if it's running
make prod-logs      # app logs (capped at 3 × 10 MB)
make prod-backup    # compressed database dump
make prod-migrate   # replay migrations only
make prod-down      # stop; data and certificates are kept

# DANGER ZONE DON'T RUN UNLESS NEEDED

make clean # stops the application and deletes all of its data (docker volumes gone bye bye)
make prod-reset # Deletes the data and Restarts the prod application from a clean state (just like a 1st launch)
```

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **React 19**
- **Prisma** + **PostgreSQL** — server-side loadout storage
- **Dexie** / IndexedDB — Destiny manifest cache
- **TanStack Query** + **Zustand** — API cache and client state
- **Sass / SCSS**, **Floating UI**, **next-intl** (EN / FR)
- **Caddy** as reverse proxy (HTTPS)

---

# Français

## Installation locale

### Prérequis

#### Enregistrer l'application auprès de Bungie

Créez une nouvelle application sur https://www.bungie.net/fr/Application (en étant connecté avec un compte bungie.net) :

- Donnez un nom à votre application, n'importe lequel (c'est le nom qui s'affichera lors de la 1ʳᵉ connexion via bungie.net)
- Réglez **Application status** sur `private`
- Réglez **OAuth Client Type** sur `Confidential`
- Réglez **Redirect URL** sur :
```
https://localhost/api/auth/callback
```
- Réglez **Scope** sur les valeurs suivantes :
  -  Read your Destiny 2 information (Vault, Inventory, and Vendors), as well as Destiny 1 Vault and Inventory data.
  -  Move or equip Destiny gear and other items.

#### Docker

1. Installez **Make** si ce n'est pas déjà fait

Distributions basées sur Ubuntu/Debian :
```bash
sudo apt-get install make
```

2. Installez **Docker** si ce n'est pas déjà fait

Docker Desktop est recommandé car il embarque tous les outils nécessaires à l'exécution des conteneurs

Systèmes basés sur Linux : https://docs.docker.com/desktop/setup/install/linux/

3. Créez le fichier `.env` et modifiez son contenu

```bash
cp .env.example .env
```

Renseignez les variables suivantes dans le fichier :
- `BUNGIE_API_KEY` (depuis la page de l'application bungie.net)
- `CLIENT_ID` (depuis la page de l'application bungie.net)
- `CLIENT_SECRET` (depuis la page de l'application bungie.net)
- `SESSION_SECRET`
  - Générez-le avec :
```bash
openssl rand -hex 32
```

4. Démarrez l'application

```bash
make build
make start
```

Vous pouvez maintenant accéder à l'application sur : https://localhost/

#### Commandes du quotidien

```bash
make start      # démarre l'app + la BDD (construit si nécessaire)
make stop       # arrête et supprime les conteneurs (conserve les données)
make logs       # suit les logs du serveur
make shell      # shell dans le conteneur de l'app
make db-shell   # console psql
make migrate    # applique les migrations Prisma
make studio     # Prisma Studio (http://localhost:5555)
make adminer    # affiche l'URL et les identifiants d'Adminer
make clean      # arrête tout et SUPPRIME les données de la base
make reset      # réinitialisation complète
make help       # liste toutes les cibles
```

## Déploiement en production

### Prérequis serveur

- Docker avec le plugin Compose (`docker compose version`)
- Un nom de domaine pointant vers l'IP du serveur de production
- **Les ports 80 et 443 accessibles depuis internet**, assurez-vous d'autoriser le trafic dans votre pare-feu

#### Enregistrer l'application auprès de Bungie

Créez une nouvelle application sur https://www.bungie.net/fr/Application (en étant connecté avec un compte bungie.net) :

- Donnez un nom à votre application, n'importe lequel (c'est le nom qui s'affichera lors de la 1ʳᵉ connexion via bungie.net)
- Réglez **Application status** sur `private`
- Réglez **OAuth Client Type** sur `Confidential`
- Réglez **Redirect URL** sur :
```
https://[votre domaine]/api/auth/callback
```
- Réglez **Scope** sur les valeurs suivantes :
  -  Read your Destiny 2 information (Vault, Inventory, and Vendors), as well as Destiny 1 Vault and Inventory data.
  -  Move or equip Destiny gear and other items.

### Lancement

3. Créez le fichier `.env` et modifiez son contenu

```bash
cp .env.production.example .env
```

Renseignez les variables suivantes dans le fichier, aucune variable ne doit rester vide :
- `APP_DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_PASSWORD`
  - Générez-le avec : `openssl rand -hex 32`
- `BUNGIE_API_KEY` (depuis la page de l'application bungie.net)
- `CLIENT_ID` (depuis la page de l'application bungie.net)
- `CLIENT_SECRET` (depuis la page de l'application bungie.net)
- `SESSION_SECRET`
  - Générez-le avec : `openssl rand -hex 32`

4. Démarrez l'application

```bash
make prod-cold-start
```

Cela construira les conteneurs nécessaires et lancera l'application une fois terminé.

### Exploitation

```bash
make prod-cold-start # construit et démarre l'application
make prod-update-all # construit et redémarre l'application si elle tourne
make prod-logs      # logs de l'app (limités à 3 × 10 Mo)
make prod-backup    # dump compressé de la base de données
make prod-migrate   # rejoue uniquement les migrations
make prod-down      # arrêt ; les données et les certificats sont conservés

# ZONE DANGEREUSE À NE PAS EXÉCUTER SAUF NÉCESSITÉ

make clean # arrête l'application et supprime toutes ses données (les volumes docker disparaissent bye bye)
make prod-reset # Supprime les données et redémarre l'application de prod depuis un état propre (comme un 1er lancement)
```

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **React 19**
- **Prisma** + **PostgreSQL** — stockage des loadouts côté serveur
- **Dexie** / IndexedDB — cache du manifeste Destiny
- **TanStack Query** + **Zustand** — cache d'API et état client
- **Sass / SCSS**, **Floating UI**, **next-intl** (EN / FR)
- **Caddy** en reverse proxy (HTTPS)
