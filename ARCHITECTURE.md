# Architecture & technical notes

Design decisions, Bungie API specifics and measured trade-offs.
Installation lives in [`README.md`](./README.md).

- [English](#english)
- [Français](#français)

---

# English

## Bungie authentication (OAuth2)

"Authorization Code" flow for a **Confidential** client:

1. `GET /api/auth/login` — generates an anti-CSRF `state` (cookie) and redirects
   to Bungie.
2. The user authorises on bungie.net.
3. `GET /api/auth/callback` — verifies `state`, exchanges the `code` for tokens,
   fetches the Bungie name, upserts the user, opens the session.
4. `POST /api/auth/logout` — destroys the session.

**Security**: the `client_secret` and the Bungie tokens never leave the server.
The session is an HMAC-signed `httpOnly` cookie containing only the user id. The
access token (~1 h) is refreshed automatically — see `getValidAccessToken()` in
`src/lib/auth/current-user.ts`.

## Destiny manifest

The manifest holds every game definition (items, stats, classes…). It is large
and rarely changes, so it is cached client-side in **IndexedDB** (via Dexie),
not in the server database.

- `GET /api/manifest` (server) proxies `/Destiny2/Manifest/` (adding the API key)
  and returns the `version` plus the per-language JSON table paths.
- `ensureManifest(lang)` (client) compares the stored version/language and, when
  needed, downloads the tables listed in `src/lib/manifest/tables.ts` **straight
  from bungie.net**, storing them in IndexedDB.
- `getDefinition(table, hash)` / `getDefinitions(table, hashes)` read one or many
  definitions.
- `useManifest()` triggers loading and exposes progress.

To use more game data, add the table to `src/lib/manifest/tables.ts` and bump
`MANIFEST_SCHEMA_VERSION` — otherwise clients with an existing cache would be
missing the new table.

## Inspecting the database

| Tool | URL | Scope |
|---|---|---|
| **Adminer** | http://localhost:8080 | whole database: free-form SQL, schema, indexes, migrations table |
| **Prisma Studio** | `make studio` → http://localhost:5555 | Prisma models only, comfortable editing |

Adminer's "server" field is pre-filled with `db`; pick **PostgreSQL** as the
system and use the `.env` credentials (`make adminer` prints them). Adminer 5
follows `prefers-color-scheme`, so its dark theme applies on its own.

> ⚠️ **Development tool.** This container exposes a database login form on port
> 8080 — it is absent from the production stack.

## Item data preloading

`/api/profile` requests item components **at profile level** (`300,304,305,310`):
Bungie then returns stats, sockets and available plugs for **every** item on the
account in a single request, instead of one call per hovered item. Tooltips
therefore render with no wait.

The raw response is trimmed before reaching the browser
(`src/lib/bungie/item-components.ts`):

| Stage | Size |
|---|---|
| Raw Bungie components | ~1130 KB |
| After trimming | ~247 KB |
| Full `/api/profile` response | ~370 KB in ~2.6 s |

Compact shapes: `stats` = `{ hash: value }`, `sockets` = equipped plug by index
(`null` = socket hidden in game), `reusablePlugs` = `{ index: [hashes] }`,
`disabledSockets` = indexes of locked sockets (omitted when empty).

`useItemData()` serves from this preload and only falls back to
`/api/item/[instanceId]` for an item missing from the profile. Both paths produce
exactly the same `ItemDetail`.

The vault (component `102`) is included, shared across characters, returned in
`vault`:

| `/api/profile` contents | Size | Time |
|---|---|---|
| Without the vault | ~370 KB | ~2.6 s |
| With the vault | ~1.65 MB | ~3.1 s |

## Displayed items

Only item types that make up a loadout are shown: **weapons, armor, subclasses
and artifacts** (`DISPLAYED_ITEM_TYPES` in `src/lib/destiny/display.ts`).
Everything else is hidden: ghost shells, emblems, ships, sparrows, emotes,
consumables, materials, quests…

The type is only known to the manifest (the API returns just an `itemHash`), so
filtering happens client-side in `useDisplayableItems()`.

> **Artifacts are a special case**: their definition carries `itemType: 0` (None),
> no `itemCategoryHashes` and no `traitId` — `DestinyItemType.SeasonalArtifact`
> (28) does not designate them. The only stable, language-independent criterion
> is their **bucket** (`inventory.bucketTypeHash === 1506418338`), hence
> `DISPLAYED_BUCKETS` alongside `DISPLAYED_ITEM_TYPES`.

> The character selector's emblem is unaffected: it comes from
> `emblemBackgroundPath`, not from the inventory.

Measured on a real account: equipped 17 → 9, character inventory 143 → 76,
vault 1039 → 981 (671 weapons + 310 armor), plus artifacts.

## Item icons

`displayProperties.icon` is a JPEG with the rarity background **baked into the
image**. The `DestinyIconDefinition` table — keyed by the item hash — exposes the
cut-out version: `foreground` (transparent PNG), `background`,
`secondaryBackground`, `highResForeground`.

Coverage: ~62 % of manifest weapons and armor, ~82 % of items actually present in
an inventory. A JPEG fallback is therefore mandatory (`bestIconPath()`).

The rarity background is restored in SCSS via `item-thumb--tier-*` classes; the
palette lives once in `layout/theme.scss` and `tierColor()` returns those CSS
variables. "Holofoil" items get an image background instead of a flat colour.

> Subclasses are an exception: their `displayProperties.icon` is already a
> complete PNG, whereas `DestinyIconDefinition.foreground` is sometimes just the
> bare glyph — prismatic subclasses looked incomplete because of it.

## Ornaments

Cosmetic sockets mix shaders, visual effects and ornaments. The only reliable
discriminator is `plug.plugCategoryIdentifier`:

| Family | Handling |
|---|---|
| `armor_skins_*`, `exotic_all_skins`, `weapon_tiering_tier5_skins` | ornament |
| `*_empty` | empty slot, ignored |
| `shader`, `*_kill_vfx` | ignored |

An "original ornament" placeholder must also be excluded. The semantic test,
with no magic numbers: the equipped plug is still the socket's
`singleInitialItemHash`, meaning nothing was applied.

An item can have several modified cosmetic sockets (shader **and** ornament
**and** kill VFX). All of them must be collected before picking the ornament —
keeping only the last one lost the ornament on every holofoil weapon, whose VFX
socket comes after it.

## Subclasses

Their element is **not** in `defaultDamageType` (always 0) but in
`talentGrid.hudDamageType`, which reuses the DamageType enum. `buildName` gives
the element/class pair (`strand_titan`, `prism_hunter`). Prismatic subclasses
report `hudDamageType: 1` (kinetic) and a `prism_` prefix.

Socket **categories are unusable**: their hash changes per class and element
(ABILITIES is `309722977` on an Arc Warlock, `3218807805` on a Void Hunter). The
`plugCategoryIdentifier` suffix is stable instead.

> **Beware of legacy names**: Stasis, the first subclass to get aspects and
> fragments, still calls them `totems` and `trinkets`. Ignoring those left Stasis
> tooltips with no aspects and no fragments.

Socket indexes do not follow the display order either (the game puts class=0,
movement=1, super=2, melee=3, grenade=4), so rows are sorted by kind.

Only aspect and fragment slots can be empty — an ability is always equipped even
when its plug is still the socket's initial one. Locked fragment slots are
identified by `isEnabled: false`.

## Plug descriptions

Most plugs carry their description in `displayProperties.description`. **Aspects,
fragments and artifact perks leave it empty**: their text lives in the
`DestinySandboxPerkDefinition` entries referenced by `perks[]`.

A cascade is needed (`usePlugDescription`):

1. the direct description;
2. `Visible` perks — the common case. Stat lines ("Class +10 ▲") carry the
   `Disabled` visibility and are excluded, as they would duplicate the stat
   modifiers already shown;
3. as a last resort, `Disabled` perks. About ten aspects only have their text
   there. `Hidden` stays excluded: it holds unlock conditions, not the effect.

`isDisplayable === false` filters out technical perks throughout.

Coverage after the cascade: fragments 99/99, aspects 75/75, artifact perks
230/231, weapon barrels and mods 177/178.

## Stat modifiers

`investmentStats` mixes player-facing stats with internal values (Defense, Power,
energy costs, "Fragment cost"…). `plug-stats.ts` filters through an **allowlist**
reusing the stats already curated for item tooltips, so the list is maintained in
one place. `isConditionallyActive` values are **kept** — a fragment's "-10
Grenade" is one, and the game shows it.

## Shared definitions

`ItemDefsProvider` (`src/lib/destiny/item-defs.tsx`) loads every item definition
of an inventory in a **single batched query**, plus the overlay constants, and
exposes them through context.

Without it each tile fired two IndexedDB queries (its definition + the
constants): with a ~1000-item vault that meant over 2000 Dexie subscriptions.
`ItemThumb` now fires none, and `useDisplayableItems()` filters purely
synchronously.

Tooltips rendered through `FloatingPortal` keep context access: a React portal
preserves the context tree.

## Vault virtualisation

The vault approaches a thousand displayable items: `VirtualItemGrid`
(`@tanstack/react-virtual`) mounts only the **visible rows**, inside a dedicated
scroll area. Off-screen images are never requested.

Items being fixed-size, virtualisation works by row; the column count is derived
from the available width by `useGridMetrics()`, which reads `--item-size` and
`--item-gap` **from the CSS** (single source: `abstracts/variables.scss`, exposed
as CSS variables in `layout/main.scss`). Measurement uses `useLayoutEffect` to
avoid a frame rendered on a single column, and a `ResizeObserver` tracks width
changes.

The "Equipped" and "Inventory" sections stay on a plain grid — a few dozen items,
virtualisation would buy nothing.

> The scroll container does not clip tooltips: they render in a portal, outside
> that DOM tree.
>
> ESLint reports `Compilation Skipped: Use of incompatible library` on this
> component: the React Compiler cannot memoise `useVirtualizer`. Expected
> warning, no functional impact.

## Bungie call resilience & outbound proxy

bungie.net regularly returns transient errors (often Cloudflare **522**: timeout
between Cloudflare and Bungie's origin). Two independent mechanisms:

### Automatic retry (on by default)

`bungieFetch` (`src/lib/bungie/client.ts`) retries **idempotent** requests
(GET/HEAD) up to 3 attempts, with exponential backoff plus jitter, on transient
statuses (408, 429, 5xx, 520–524) and network failures. A timeout prevents a 522
(Cloudflare waits ~90 s) from blocking the inbound request. Error bodies are
truncated so logs stay readable.

This — not the proxy — is what keeps a transient failure from breaking a page.

### Outbound HTTP proxy (optional)

Useful when the **direct** link to bungie.net is poor from your machine: a proxy
hosted elsewhere may route better. No dependency, no specific code — Node does it
natively:

```bash
# in .env
HTTPS_PROXY=http://my-proxy.example:3128
HTTP_PROXY=http://my-proxy.example:3128
NODE_OPTIONS=--use-env-proxy      # without this, Node IGNORES the variables above
NO_PROXY=localhost,127.0.0.1,db   # hosts reached directly
```

Then `make restart`. The variables are already passed to the container; left
empty, the proxy is simply disabled.

#### Proxy with authentication

Credentials go in the URL — Node derives the `Proxy-Authorization: Basic …`
header on its own:

```bash
HTTPS_PROXY=http://user:password@my-proxy.example:3128
```

> ⚠️ **Special characters in the password must be percent-encoded.** Otherwise
> the URL is invalid and **Node refuses to start** (`ERR_INVALID_URL`, raised
> before any application code — the app does not boot at all).
>
> | Character | `@` | `:` | `/` | `#` | `?` | `&` | space |
> |---|---|---|---|---|---|---|---|
> | Encoding | `%40` | `%3A` | `%2F` | `%23` | `%3F` | `%26` | `%20` |
>
> To encode a password:
> ```bash
> docker compose exec app node -p "encodeURIComponent('my:pass@word')"
> ```

If the proxy rejects the credentials (407), the retry applies and the route
returns a clean 502 — the app does not crash.

> **Scope**: only server-side calls go through this proxy. Manifest table
> downloads happen from the **browser**, straight to bungie.net.

## Styles (SCSS)

No styles live in components: JSX carries only semantic classes
(`item-tooltip__header`, `character-tab--selected`…), and every rule lives in
`src/scss/`.

```
src/scss/
  style.scss          entry point (imported once in the root layout)
  abstracts/          Sass variables + mixins (emit no CSS)
  layout/             general layout: reset, palette, header
  components/         one file per React component
```

Conventions:

- **BEM** naming: `.block`, `.block__element`, `.block--modifier`.
- The palette is exposed as **CSS variables** in `layout/theme.scss`, so it can
  be overridden at runtime — that is how light/dark theming works.
- **Dynamic** values (rarity colour, element colour, stat bar width) are passed
  from React as inline CSS variables (`style={{ "--tier-color": … }}`) rather
  than generated classes.
- Adding a component = create `components/my-component.scss` and add it to the
  `@use` list in `style.scss`.

Icon surfaces (`--color-icon-surface`) stay dark in **both** themes: Bungie's
icons are light line art on transparency and vanish on a white background.

## Theme & settings

Preferences (theme, icon size, ornament display) are stored in a **cookie**, not
localStorage, so the server can read them and render `data-theme` and
`--item-size` directly in the HTML. That removes the load flash, the hydration
mismatch and the need for an inline script.

In "system" mode no `data-theme` attribute is set, and the CSS
`prefers-color-scheme` rule takes over — no JavaScript listener needed.

> ⚠️ Constants shared with the server (cookie name, bounds) live in
> `src/lib/settings/constants.ts`, **without** a `"use client"` directive. A
> constant exported from a `"use client"` module arrives `undefined` on the
> server, which silently broke the cookie read.

## Project structure

```
src/
  app/[locale]/      Pages (i18n routing: "/" = FR, "/en" = EN)
  app/api/           Server routes (auth, manifest, profile, item, health)
  proxy.ts           i18n routing middleware (named "proxy" since Next 16)
  i18n/              next-intl configuration (routing + request)
  lib/
    auth/            Session (signed cookie) + valid Bungie token
    bungie/          Bungie API wrapper (OAuth, profile, items)
    db/              Prisma client
    destiny/         Game constants, types, socket logic
    manifest/        Manifest download & cache (IndexedDB)
    settings/        User preferences (cookie-backed store)
  components/        UI components
  scss/              Styles (see "Styles")
prisma/schema.prisma Server data model
messages/            EN / FR translations
```

---

# Français

## Authentification Bungie (OAuth2)

Flow « Authorization Code » pour un client **Confidential** :

1. `GET /api/auth/login` — génère un `state` anti-CSRF (cookie) et redirige vers
   Bungie.
2. L'utilisateur autorise sur bungie.net.
3. `GET /api/auth/callback` — vérifie le `state`, échange le `code` contre les
   tokens, récupère le nom Bungie, upsert l'utilisateur, ouvre la session.
4. `POST /api/auth/logout` — détruit la session.

**Sécurité** : le `client_secret` et les tokens Bungie ne quittent jamais le
serveur. La session est un cookie `httpOnly` signé en HMAC ne contenant que l'id
utilisateur. L'access token (~1 h) est renouvelé automatiquement — voir
`getValidAccessToken()` dans `src/lib/auth/current-user.ts`.

## Manifeste Destiny

Le manifeste contient toutes les définitions du jeu (objets, stats, classes…).
Volumineux et rarement modifié, il est mis en cache côté client dans
**IndexedDB** (via Dexie), et non en base serveur.

- `GET /api/manifest` (serveur) proxifie `/Destiny2/Manifest/` (en ajoutant la
  clé API) et renvoie la `version` plus les chemins des tables JSON par langue.
- `ensureManifest(lang)` (client) compare la version/langue stockée et, si
  besoin, télécharge les tables listées dans `src/lib/manifest/tables.ts`
  **directement depuis bungie.net**, puis les stocke en IndexedDB.
- `getDefinition(table, hash)` / `getDefinitions(table, hashes)` lisent une ou
  plusieurs définitions.
- `useManifest()` déclenche le chargement et expose la progression.

Pour exploiter plus de données du jeu, ajoute la table dans
`src/lib/manifest/tables.ts` et incrémente `MANIFEST_SCHEMA_VERSION` — sinon les
clients ayant déjà un cache n'auraient pas la nouvelle table.

## Consulter la base

| Outil | URL | Portée |
|---|---|---|
| **Adminer** | http://localhost:8080 | toute la base : SQL libre, schéma, index, table des migrations |
| **Prisma Studio** | `make studio` → http://localhost:5555 | uniquement les modèles Prisma, édition confortable |

Le champ « serveur » d'Adminer est pré-rempli à `db` ; choisir **PostgreSQL**
comme système et saisir les identifiants du `.env` (`make adminer` les rappelle).
Adminer 5 suit `prefers-color-scheme`, son thème sombre s'applique tout seul.

> ⚠️ **Outil de développement.** Ce conteneur expose un formulaire de connexion à
> la base sur le port 8080 — il est absent de la stack de production.

## Préchargement des données d'objets

`/api/profile` demande les composants d'objets **au niveau du profil**
(`300,304,305,310`) : Bungie renvoie alors stats, sockets et plugs disponibles de
**tous** les objets du compte en une seule requête, au lieu d'un appel par objet
survolé. Les infobulles s'affichent donc sans attente.

La réponse brute est élaguée avant d'atteindre le navigateur
(`src/lib/bungie/item-components.ts`) :

| Étape | Poids |
|---|---|
| Composants bruts Bungie | ~1130 Ko |
| Après élagage | ~247 Ko |
| Réponse `/api/profile` complète | ~370 Ko en ~2,6 s |

Formes compactes : `stats` = `{ hash: valeur }`, `sockets` = plug équipé par
index (`null` = socket masqué en jeu), `reusablePlugs` = `{ index: [hashes] }`,
`disabledSockets` = index des sockets verrouillés (omis quand vide).

`useItemData()` sert depuis ce préchargement et ne retombe sur
`/api/item/[instanceId]` que pour un objet absent du profil. Les deux chemins
produisent exactement le même `ItemDetail`.

Le coffre (composant `102`) est inclus, partagé entre personnages, renvoyé dans
`vault` :

| Contenu de `/api/profile` | Poids | Temps |
|---|---|---|
| Sans le coffre | ~370 Ko | ~2,6 s |
| Avec le coffre | ~1,65 Mo | ~3,1 s |

## Objets affichés

Seuls les types d'objets qui composent un équipement sont affichés : **armes,
armures, doctrines et artéfacts** (`DISPLAYED_ITEM_TYPES` dans
`src/lib/destiny/display.ts`). Tout le reste est masqué : coques de spectre,
emblèmes, vaisseaux, véhicules, emotes, consommables, matériaux, quêtes…

Le type n'est connu que du manifeste (l'API ne renvoie qu'un `itemHash`), d'où un
filtrage côté client dans `useDisplayableItems()`.

> **Cas particulier des artéfacts** : leur définition porte `itemType: 0` (None),
> aucune `itemCategoryHashes` et aucun `traitId` —
> `DestinyItemType.SeasonalArtifact` (28) ne les désigne pas. Le seul critère
> stable et indépendant de la langue est leur **emplacement**
> (`inventory.bucketTypeHash === 1506418338`), d'où `DISPLAYED_BUCKETS` en
> complément de `DISPLAYED_ITEM_TYPES`.

> L'emblème du sélecteur de personnage n'est pas concerné : il vient de
> `emblemBackgroundPath` et non de l'inventaire.

Effet mesuré sur un compte réel : équipé 17 → 9, inventaire 143 → 76, coffre
1039 → 981 (671 armes + 310 armures), plus les artéfacts.

## Icônes des objets

`displayProperties.icon` est un JPEG avec le fond de rareté **incrusté dans
l'image**. La table `DestinyIconDefinition` — indexée par le hash de l'objet —
expose la version détourée : `foreground` (PNG transparent), `background`,
`secondaryBackground`, `highResForeground`.

Couverture : ~62 % des armes et armures du manifeste, ~82 % des objets réellement
présents dans un inventaire. Un repli sur le JPEG est donc indispensable
(`bestIconPath()`).

Le fond de rareté est rétabli en SCSS via les classes `item-thumb--tier-*` ; la
palette vit une seule fois dans `layout/theme.scss` et `tierColor()` renvoie ces
variables CSS. Les objets « holofoil » reçoivent une image de fond au lieu d'une
couleur unie.

> Les doctrines font exception : leur `displayProperties.icon` est déjà un PNG
> complet, alors que `DestinyIconDefinition.foreground` n'est parfois que le
> glyphe nu — c'est ce qui rendait les doctrines prismatiques incomplètes.

## Ornements

Les sockets cosmétiques mélangent shaders, effets visuels et ornements. Le seul
discriminant fiable est `plug.plugCategoryIdentifier` :

| Famille | Traitement |
|---|---|
| `armor_skins_*`, `exotic_all_skins`, `weapon_tiering_tier5_skins` | ornement |
| `*_empty` | emplacement vide, ignoré |
| `shader`, `*_kill_vfx` | ignorés |

Il faut aussi écarter le placeholder « Ornement d'origine ». Le test sémantique,
sans nombre magique : le plug équipé est encore le `singleInitialItemHash` du
socket, donc rien n'a été appliqué.

Un objet peut avoir plusieurs sockets cosmétiques modifiés (shader **et**
ornement **et** effet de mise à mort). Il faut les collecter tous avant de
choisir l'ornement — n'en garder que le dernier faisait perdre l'ornement de
toutes les armes holofoil, dont le socket de VFX vient après.

## Doctrines

Leur élément n'est **pas** dans `defaultDamageType` (toujours 0) mais dans
`talentGrid.hudDamageType`, qui reprend l'enum DamageType. `buildName` donne le
couple élément/classe (`strand_titan`, `prism_hunter`). Les doctrines
prismatiques déclarent `hudDamageType: 1` (cinétique) et un préfixe `prism_`.

Les **catégories de sockets sont inexploitables** : leur hash change selon la
classe et l'élément (COMPÉTENCES vaut `309722977` chez l'Arcaniste Arc,
`3218807805` chez le Chasseur Abyssal). C'est le suffixe de
`plugCategoryIdentifier` qui est stable.

> **Attention aux noms historiques** : la stase, première doctrine à avoir reçu
> aspects et fragments, les nomme encore `totems` et `trinkets`. Les ignorer
> laissait les infobulles de stase sans aspects ni fragments.

Les index de sockets ne suivent pas non plus l'ordre d'affichage (le jeu place
classe=0, mouvement=1, super=2, mêlée=3, grenade=4) : les lignes sont donc
triées par nature.

Seuls les emplacements d'aspects et de fragments peuvent être vides — une
compétence est toujours équipée, même quand son plug est resté celui d'origine.
Les emplacements de fragments verrouillés se reconnaissent à `isEnabled: false`.

## Descriptions des plugs

La plupart des plugs portent leur description dans
`displayProperties.description`. Mais les **aspects, fragments et attributs
d'artéfact l'ont vide** : leur texte vit dans les `DestinySandboxPerkDefinition`
référencées par `perks[]`.

D'où une cascade (`usePlugDescription`) :

1. la description directe ;
2. les perks `Visible` — le cas courant. Les lignes de statistiques
   (« Classe +10 ▲ ») portent la visibilité `Disabled` et sont écartées : elles
   feraient doublon avec les écarts déjà affichés ;
3. en dernier recours, les perks `Disabled`. Une dizaine d'aspects n'ont leur
   texte que là. `Hidden` reste exclu : il contient les conditions de
   déverrouillage, pas l'effet.

`isDisplayable === false` écarte partout les perks techniques.

Couverture après la cascade : fragments 99/99, aspects 75/75, attributs
d'artéfact 230/231, canons et mods d'arme 177/178.

## Écarts de statistiques

`investmentStats` mélange les statistiques visibles en jeu et des valeurs
internes (Défense, Puissance, coûts d'énergie, « Coût du fragment »…).
`plug-stats.ts` filtre par **liste blanche**, en réutilisant les statistiques
déjà curées pour les infobulles d'objets : la liste reste maintenue en un seul
endroit. Les valeurs `isConditionallyActive` sont **conservées** — le « -10
Grenade » d'un fragment en est une, et le jeu l'affiche.

## Définitions mutualisées

`ItemDefsProvider` (`src/lib/destiny/item-defs.tsx`) charge en **une seule
requête groupée** toutes les définitions d'objets d'un inventaire, plus les
constantes d'overlay, et les expose par contexte.

Sans lui, chaque vignette lançait deux requêtes IndexedDB (sa définition + les
constantes) : avec un coffre de ~1000 objets, plus de 2000 souscriptions Dexie.
`ItemThumb` n'en fait plus aucune, et `useDisplayableItems()` filtre de façon
purement synchrone.

Les infobulles rendues via `FloatingPortal` conservent l'accès au contexte : un
portail React préserve l'arbre de contextes.

## Virtualisation du coffre

Le coffre approche le millier d'objets affichables : `VirtualItemGrid`
(`@tanstack/react-virtual`) ne monte que les **lignes visibles**, dans une zone
de défilement dédiée. Les images hors écran ne sont jamais demandées.

Les objets étant de taille fixe, la virtualisation se fait par lignes ; le nombre
de colonnes est déduit de la largeur disponible par `useGridMetrics()`, qui lit
`--item-size` et `--item-gap` **depuis le CSS** (source unique :
`abstracts/variables.scss`, exposée en variables CSS dans `layout/main.scss`). La
mesure utilise `useLayoutEffect` pour éviter une frame affichée sur une seule
colonne, et un `ResizeObserver` suit les changements de largeur.

Les sections « Équipé » et « Inventaire » restent en grille simple : quelques
dizaines d'objets, la virtualisation n'y apporterait rien.

> Le conteneur de défilement ne rogne pas les infobulles : elles sont rendues
> dans un portail, hors de cet arbre DOM.
>
> ESLint signale `Compilation Skipped: Use of incompatible library` sur ce
> composant : le React Compiler ne sait pas mémoïser `useVirtualizer`.
> Avertissement attendu, sans effet sur le fonctionnement.

## Robustesse des appels Bungie & proxy sortant

bungie.net renvoie régulièrement des erreurs passagères (souvent **522** de
Cloudflare : timeout entre Cloudflare et l'origine Bungie). Deux mécanismes
indépendants :

### Retry automatique (actif par défaut)

`bungieFetch` (`src/lib/bungie/client.ts`) retente les requêtes **idempotentes**
(GET/HEAD) jusqu'à 3 tentatives, avec attente exponentielle et un peu
d'aléatoire, sur les statuts passagers (408, 429, 5xx, 520–524) et les échecs
réseau. Un timeout évite qu'un 522 (Cloudflare attend ~90 s) ne bloque la requête
entrante. Les corps d'erreur sont tronqués pour garder des logs lisibles.

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

Puis `make restart`. Les variables sont déjà transmises au conteneur ; laissées
vides, le proxy est simplement désactivé.

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

Si le proxy rejette les identifiants (407), le retry s'applique puis la route
renvoie une erreur 502 propre : l'application ne plante pas.

> **Portée** : seuls les appels faits par le serveur passent par ce proxy. Le
> téléchargement des tables du manifeste part du **navigateur**, directement vers
> bungie.net.

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
- La palette est exposée en **variables CSS** dans `layout/theme.scss`, ce qui
  permet de la surcharger à l'exécution — c'est ainsi que fonctionne le thème
  clair/sombre.
- Les valeurs **dynamiques** (couleur de rareté, d'élément, largeur d'une barre
  de stat) sont transmises depuis React via des variables CSS inline
  (`style={{ "--tier-color": … }}`) plutôt que par des classes générées.
- Ajouter un composant = créer `components/mon-composant.scss` puis l'ajouter au
  `@use` de `style.scss`.

Les surfaces d'icônes (`--color-icon-surface`) restent sombres dans les **deux**
thèmes : les icônes de Bungie sont des dessins clairs sur fond transparent et
disparaissent sur un fond blanc.

## Thème & paramètres

Les préférences (thème, taille des icônes, affichage des ornements) sont stockées
dans un **cookie** et non dans localStorage, afin que le serveur puisse les lire
et rendre `data-theme` et `--item-size` directement dans le HTML. Cela supprime le
flash au chargement, l'écart d'hydratation et le besoin d'un script inline.

En mode « système », aucun attribut `data-theme` n'est posé et la règle CSS
`prefers-color-scheme` prend le relais — aucun écouteur JavaScript nécessaire.

> ⚠️ Les constantes partagées avec le serveur (nom du cookie, bornes) vivent dans
> `src/lib/settings/constants.ts`, **sans** directive `"use client"`. Une
> constante exportée depuis un module `"use client"` arrive `undefined` côté
> serveur, ce qui rendait la lecture du cookie silencieusement inopérante.

## Structure du projet

```
src/
  app/[locale]/      Pages (routing i18n : « / » = FR, « /en » = EN)
  app/api/           Routes serveur (auth, manifest, profile, item, health)
  proxy.ts           Middleware de routing i18n (nommé « proxy » depuis Next 16)
  i18n/              Configuration next-intl (routing + request)
  lib/
    auth/            Session (cookie signé) + token Bungie valide
    bungie/          Wrapper API Bungie (OAuth, profil, objets)
    db/              Client Prisma
    destiny/         Constantes de jeu, types, logique des sockets
    manifest/        Téléchargement & cache du manifeste (IndexedDB)
    settings/        Préférences utilisateur (store adossé au cookie)
  components/        Composants UI
  scss/              Styles (voir « Styles »)
prisma/schema.prisma Modèle de données serveur
messages/            Traductions FR / EN
```
