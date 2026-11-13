# Architecture & technical notes

Design decisions, Bungie API specifics and measured trade-offs.
Installation lives in [`README.md`](./README.md).

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
not in the server database. The server relays the table files: it downloads
each one once from bungie.net, **strips the fields the app never reads**, and
serves it to every client.

- `GET /api/manifest` (server) reads `/Destiny2/Manifest/` (adding the API key)
  and returns the `version` plus, per language, the relay URL of each table in
  `src/lib/manifest/tables.ts`. Every page load waits on it, even with an
  up-to-date client cache, so the version is kept in memory and served
  **stale while it is re-read** in the background after a minute: the Bungie
  API sometimes takes over 15 s to answer.
- `GET /api/manifest/<version>/<schema>/<language>/<table>` serves one table
  from the server's disk cache (`src/lib/manifest/server-cache.ts`), building it
  on first request. Files are stored **pre-compressed in Brotli** (quality 9;
  quality 11 saves barely 10 % more, for ~25× the CPU). Since version and schema
  are in the URL, responses are `immutable`.
- The cache lives in the `manifest_cache` Docker volume
  (`/var/cache/manifest/<version>/<schema>/<language>/`, overridable with
  `MANIFEST_CACHE_DIR`). The first time the server sees a new version, it
  deletes the other versions and schemas and preloads the
  tables of the app's locales, so the first visitor after a patch does not wait
  on Bungie. Only the **current** version is ever downloaded: a forged URL
  cannot fill the disk. The volume is a plain cache, safe to delete.
- `ensureManifest(lang)` (client) compares the stored version/language and, when
  needed, downloads the tables from the relay, storing them in IndexedDB.
  Measured in Chromium, three choices halve a post-patch reload (12.8–15.3 s →
  6.5–6.9 s; first load 7.2 → 5.9 s, 40 ms latency, 20 Mbit/s):
  - **one `clear()`** of the definitions, not a delete per table: the per-table
    delete alone cost 6 s on an update. It runs in the same transaction that
    forgets the stored version, so an interrupted load never passes for valid;
  - **no secondary `table` index** (Dexie schema version 2): every write
    maintained it, ~20 % of the writing time. Reading a whole small table goes
    through a primary-key range instead — `tableRows()` in `db.ts`;
  - **all downloads start at once**, then are read and written one at a time:
    the eighteen round trips no longer add up.

  The writing (`bulkPut`, ~3 s) remains the bulk of the cost. Storing each
  definition as a JSON string, to skip structured cloning, was measured
  *slower* (4.5 s against 3.0 s). Calls are chained: a second concurrent call
  (React strict mode, a language switch) would otherwise clear what the first
  is writing.
- The download itself (`downloadManifest`, `src/lib/manifest/load.ts`) runs in
  a **Web Worker** (`manifest.worker.ts`), which writes straight into
  IndexedDB: only progress goes through messages. On the main thread, parsing
  and structured cloning froze the page for up to 1.4 s at a time (2 s of long
  tasks in all); in the worker, under 50 ms and none. The version check stays
  on the main thread — most visits find the cache up to date and never start
  the worker. If the worker script fails to load, the download falls back to
  the main thread, which is safe since it always starts by clearing everything.
  Turbopack bundles the worker properly (a `turbopack-worker-*.js` bootstrap),
  but also copies the raw `.ts` source as an unused static asset: harmless,
  and not the file the worker runs.
- The progress bar (`src/lib/manifest/progress.ts`) weighs each table by an
  **estimate of its duration**, not by a table count: counted by tables, it sat
  at 0 % for most of the load, the items table coming first. The relay
  announces each table's decompressed size and row count (`X-Manifest-Size`,
  `X-Manifest-Rows`, kept next to the file in `<file>.stats.json`); the bar
  moves with the bytes received, then with each batch of 5,000 rows written.
  Writing costs mostly **per row** — the icons table, 7 MB but 26,645 rows,
  takes 930 ms to write — so weighting by bytes alone left the last tables
  dragging over the final quarter. Measured in the app, the bar now follows the
  elapsed time, past the ~1.2 s spent before the download starts (hydration,
  `/api/manifest`, worker start). Messages are capped at one per percentage
  point.
- `getDefinition(table, hash)` / `getDefinitions(table, hashes)` read one or many
  definitions.
- `useManifest()` triggers loading and exposes progress.

### Slimmed tables (projection)

`src/lib/manifest/projection.ts` lists, per table, the fields kept
(`MANIFEST_PROJECTION`); everything else is dropped before the table is
compressed. Measured on the French manifest:

| | Bungie JSON | Slimmed JSON | Transferred (Brotli) |
| --- | --- | --- | --- |
| `DestinyInventoryItemDefinition` | 201 MB | 85 MB | 1.8 MB |
| All 18 tables | 230 MB | 99 MB | 2.7 MB |

The JSON size is what matters most: it is what the browser parses and writes
into IndexedDB. For comparison, bungie.net's gzip of the items table alone is
8.5 MB.

**The danger is a field that is read but dropped**: the read returns
`undefined` and the UI shows nothing, with no error. Two guards:

- **At compile time**: `ManifestReads` maps every table to the one type its
  reads cast `data` to. `tsc` fails, naming the path, when a type declares a
  field the projection drops (`MissingFields`), or when the projection keeps a
  field no type declares (`UnreadFields`).
- **`scripts/checks/projection.check.ts`** scans the sources: any definition
  read (`useDefinition<…>`, `getDefinitions<…>`, `.data as …`) must use a type
  of `ManifestReads`, and none may be redeclared locally under the same name —
  otherwise it would slip past the compile-time check.

Projection happens **as a stream**, entry by entry
(`src/lib/manifest/json-entries.ts`): a full `JSON.parse` of the items table
peaks at 1.1 GB of memory, enough to kill a small production server.

`MANIFEST_SCHEMA_VERSION` is **computed**: a hash of the table list and the
projection. It is part of the relay URL and disk path, and clients compare it
with their cache — any change to either refreshes both caches by itself.

To use more game data: add the field to its type in `ManifestReads` (usually
`src/lib/destiny/types.ts`); `tsc` then asks for it in the projection. For a new
table, also add it to `src/lib/manifest/tables.ts`, give it a projection and a
type in `ManifestReads`.

> **Entries are not filtered, and that was tested.** The only sizeable
> candidate was the 10,542 items of bucket 2422292810 that no plug set, socket
> or armour set references — vendor previews by the look of them, none
> equippable, 22 % of the items table's cost (~0.6 s per load). A temporary
> probe logging every read of them was refuted within minutes, on two paths:
> a crafted weapon's sockets read two of them as **plugs** ("Arme façonnée"),
> and a real profile holds several (bounties, "Prime ordinaire"…), read by the
> `ItemDefsProvider` batch. "Not referenced by the manifest" does not mean
> "never read": instance sockets and profiles reach items the manifest links
> to nothing.

## Prisma client

Since Prisma 7 the client is **no longer generated into `node_modules`**. The
`output` of the `prisma-client` generator sends it to `src/generated/prisma`,
which `.gitignore` excludes. A fresh `npm install` is therefore not enough: the
project does not compile until `prisma generate` has run.

The dev container runs it at every start (`CMD` of the `Dockerfile`), so the
gap only shows outside that path — a clone, a wiped `node_modules`, or a tool
run straight from the host:

```bash
docker compose exec app npx --no-install prisma generate
```

Keep `--no-install`: without it, a `prisma` missing from `node_modules` makes
npx silently download `prisma@latest` **and rewrite `package-lock.json`** — how
the lock once ended up committed on Prisma 7 against a `package.json` pinned to
`^5`, a state in which `npm ci` refuses to run.

Two other v7 consequences worth knowing: the connection URL lives in
`prisma.config.ts`, no longer in the schema (it is rejected there, error
P1012); and every query goes through the `@prisma/adapter-pg` driver adapter,
the Rust engine being gone.

## Inspecting the database

| Tool | URL | Scope |
|---|---|---|
| **Prisma Studio** | `make studio` → http://localhost:5555 | Prisma models only, comfortable editing |

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

## Unlocked plugs (plug sets)

What can be slotted into a mod, shader, ornament, aspect, fragment or artifact
socket is **not** on the item. The manifest only gives the game-wide pool (712
shaders, 82 leg mods…); what the player actually owns lives in
`profilePlugSets` / `characterPlugSets`, two components that ship with
`ItemSockets` (305) — already requested, so they cost no extra call. They were
simply thrown away until the socket picker needed them.

`src/lib/bungie/plug-sets.ts` trims them to two lists of hashes per plug set
(see below), which is what makes the payload bearable:

| Plug sets in `/api/profile` | Size |
|---|---|
| Raw components | ~870 KB |
| After trimming (10646 / 12934 plugs kept, 1469 sets — measured before `held` was added) | ~133 KB |

**Which source feeds which socket is declared, not guessed**: the socket
entry's `plugSources` bitmask (`SocketPlugSources`, mirrored as `PLUG_SOURCE` in
`lib/destiny/sockets.ts`) says whether options come from the instance
(`reusablePlugs`, component 310) or from the profile / character plug sets.
Measured values: weapon perks `0`, weapon mods and cosmetics `7`, armor mods
`13`, armor ornaments `15`, artifact perks and subclass aspects / fragments `4`.
Reading plug sets for a weapon perk would show the manifest pool instead of the
weapon's actual roll — hence the flags rather than a uniform rule.

The flags decide **whether** plug sets are read, not **which of the two**: both
levels are merged. The same plug set hash may be served by either component, and
the flags do not always match where the data lands. DIM makes no distinction
either: `gatherUnlockedPlugSetItems` stacks `profilePlugSets` and the
character's `characterPlugSets`.

**`canInsert` is not the ownership signal — `enabled` is.** The two answer
different questions: `canInsert` means “the insert would go through, here and
now”, `enabled` means “the player owns this plug”. DIM reads `enabled`
(`filterUnlockedPlugs`) and keeps `canInsert` only for universal armor ornament
plug sets, where `enabled` is true for the whole pool and therefore says
nothing. So the trim keeps both, per plug set: `ready` (canInsert) and `held`
(enabled without canInsert — absent from most sets, so barely any extra
payload). `buildColumns` offers both, except on an ornament socket where it
falls back to `ready` alone; it recognises one from the family of the socket's
initial plug (`…skins…`, `isOrnamentFamily`) rather than from a list of plug set
hashes to maintain.

### Subclasses read none of this

Their aspects, fragments and abilities come from the **manifest pool**, taken as
is — `usesAccountPlugs()` returns false for them, whatever their flags say, and
`sockets.check.ts` pins that down.

Not a shortcut, a Bungie bug ([api#1572]): subclass plug sets are declared
profile-scoped by mistake and returned **from the perspective of a single
character** — always the same one, and not necessarily the one being looked at.
`canInsert` and `enabled` then describe somebody else, so aspects the player
does own vanish from the picker, and the symptom changes from character to
character — which is what made Stasis and Prismatic look fine while the Light
subclasses looked broken. No reading of those two flags recovers the truth: the
data is wrong at the source. DIM reached the same conclusion for the same reason
(`SubclassPlugDrawer`: “there's no kind of unlock check here”).

The cost is known and accepted: an aspect that is *not* unlocked may be offered,
and Bungie refuses the insert with a message the picker shows. Nothing else is
over-offered — none of the 426 plugs in the 101 plug sets of the eighteen
subclasses is marked `currentlyCanRoll: false`. What the instance itself carries
(`reusablePlugs`, component 310, used by the ability sockets) is unaffected: it
is this item's data, on this character, and the bug does not touch it.

[api#1572]: https://github.com/Bungie-net/api/issues/1572

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

That filter is really one of **three**, picked by the item-category tabs at the
top of the inventory mode (`ItemCategoryTabs`, `itemCategory` in the settings
cookie). The tab drives **both sides of the view at once** — the character's
slots on the left and the vault on the right — because finding a ship in the
vault to slot it means seeing both at the same time:

| Tab | Contents | Columns |
|---|---|---|
| `equipment` | weapons, armor, subclasses, artifacts | the historical two |
| `customization` | emblems, ships, sparrows / ghost shells, finishers, emotes | the six customization buckets |
| `inventory` | modifications, consumables, materials | none — the view splits in two instead |

The last two families are recognised by their **home bucket**
(`inventory.bucketTypeHash`), never by `itemType`: the emote collection carries
`itemType: 0`, like artifacts. Shared storage is account-scoped (`scope: 1`), so
Bungie ships it in `profileInventory` next to the vault even though the game
shows it on every character — hence a tab with no character columns. That tab
splits the view differently instead: what is **in** the shared inventory on the
left, what sits in the vault on the right, two grids of equal width. Both come
from the same component, so it is the item's `bucketHash` — where it is right
now, not its home bucket, which reads “Modifications” on either side — that
tells them apart. Stack size comes from `quantity` and is drawn on the thumbnail
from two upwards.

`useDisplayableItems(items, category)` carries the choice down through
`useSortedItems` and `useGroupedItems`, so the vault's sections and their order
follow (`BUCKET_ORDER` lists the customization and storage buckets after the
equipment ones). The character columns of the loadout and group modes keep the
`equipment` list regardless of the tab: those modes are mounted at the same
time, and an emblem has no business in a loadout.

Ghost shells, ships and sparrows carry plugs of their own — shader, projection,
mods, horn, spawn effects, tier — and the emote collection has four slots
drawing from the same pool of 824 emotes (`EMOTE_ROW`, a plain `PlugRow`).

Their tooltip splits into **three rows, by plug family and not by socket
category** (`lib/destiny/gear.ts`, checked by `gear.check.ts`). The categories
cannot do the job: a sparrow's horn shares “VEHICLE MODS” with its shader while
its engine sits in “VEHICLE PERKS” with its mod, so a split along category lines
would file the horn with the mods and separate the two decorations. Reading the
family of each socket's *initial* plug instead gives the three rows the game
itself draws: perks that cannot be changed (engine, sparrow mod, ship mod, ghost
module), ghost mods and tier which can, then the decorations (shader,
projection, spawn effect, horn). The display name is no help — horns are typed
“Sparrow Mod” like real mods.

## Item icons

`displayProperties.icon` is a JPEG with the rarity background **baked into the
image**. The `DestinyIconDefinition` table exposes the cut-out version:
`foreground` (transparent PNG), `background`, `secondaryBackground`,
`highResForeground`.

That table is **not keyed by the item hash**: it has hashes of its own, and
`displayProperties.iconHash` is what points into it. The two often coincide —
enough for a lookup by item hash to appear to work — but they differ for 24 263
of the manifest's 38 894 items, 22 105 of which do have a cut-out icon. Looking
them up by item hash silently found 62 % of weapons and armor; by `iconHash`,
coverage is 100 % of them (94 % of the whole manifest). This is how DIM reads
the table too (`defs.Icon.get(displayProperties.iconHash)`). `loadIconDefs()` in
`item-defs.tsx` does the two grouped reads and re-keys the result by item hash;
ornament plugs go through the very same helper.

A JPEG fallback stays in place for the few items with no `foreground`
(`bestIconPath()`).

The rarity background is restored in SCSS via `item-thumb--tier-*` classes; the
palette lives once in `layout/theme.scss` and `tierColor()` returns those CSS
variables. "Holofoil" items get an image background instead of a flat colour.
The manifest has two (`holofoilBackgroundPath()`): those released before v900
(BRAVE, Rite of the Nine — traits `releases.v730.season` / `releases.v820.season`)
keep the transparent gold-striped `holofoilBackgroundOverlayPath` over their
rarity colour; every later one takes the purple `holofoil900BackgroundOverlayPath`.

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
when its plug is still the socket's initial one.

**Fragment slots are opened by the aspects in place**, two or three each
(`plug.energyCapacity.capacityValue`, mirrored in `investmentStats` under the
“Aspect Energy Capacity” stat `2223994109` — the two agree on all 75 aspects in
the manifest). `fragmentSlots()` reads it and the plug tooltip states it, which
is the only place the number appears: the manifest puts it in no description.
That helper checks the plug's **family** before anything else, and not out of
tidiness — masterworks (10, 11) and armor energy tiers (2 to 10) carry an
`energyCapacity` too, so without it a masterwork would announce “10 fragment
slots”.

Which slots are locked is computed from the aspects being **shown**, never read
from `ItemDetail.disabledSockets` (the pure `lockedFragmentSockets`, through
`useFragmentLocks` for the tooltip and a snapshot, inline in `useEquippedPlugs`
for the loadout rows, which already hold every equipped plug's definition). The
API field describes the profile as Bungie last rendered it, and two situations
take it at fault: a group **snapshot** is a different configuration than the
current one, and **changing an aspect** opens or closes slots there and then,
while the profile is only refetched once the action queue drains. Every caller
therefore passes what it displays — pending insert included in the tooltip.

Both surfaces show the **free slots**, not just the filled ones: that is where a
fragment is put, and hiding them meant opening the item to fill a slot an aspect
had just unlocked. Locked slots stay out of the rows entirely — so nothing is
left for the picker context to lock on a subclass, and it is handed an empty
set rather than a stale one.

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

## Stat breakdown

Weapon and armour stat bars are split into base (white), perks and mods
(blue), and masterwork (gold). A red segment appears only when the total falls
below the base, and runs from the total up to the base, never beyond it.
Blue and gold then keep their full width and white shrinks. At or above the
base, there is no red, and what perks remove comes out of blue, then gold
(`barSegments`).
`lib/destiny/stat-breakdown.ts` is pure and checked by
`scripts/checks/stat-breakdown.check.ts`.

The API only returns **totals**. Rather than rebuilding everything from
definitions as DIM does, the base is the API total minus what the plugs bring:
whatever cannot be modelled (artifact, adept bonuses, enhanced intrinsics…)
stays correct, folded into the base. The intrinsic frame counts as base.
Conditional-stat rules come from DIM's `stats-conditional.ts`, checked against
the manifest:

- **Tiered masterwork** (+10 on its stat, +0 conditional elsewhere): the game
  adds the weapon's tier to **every** listed stat, the main one included
  (Range +15 at tier 5). The API leaves this out of its totals, so it is
  **added**. The old adept masterworks (+3 conditional) are not affected.
  Entries for the same stat are **merged first**: the Reload masterwork
  declares Reload twice (+10, then +0 conditional), and adding the tier to
  each entry gave +20 instead of +15.
- **Crafted or enhanced weapons** have no masterwork socket: their enhanced
  intrinsic (+10 on one stat, +2 conditional on six others) takes its place
  and goes to the gold segment. Below level 20 only the main stat gets +10.
  From level 20 every listed stat gets `max(2, tier)`, the main one on top of
  its +10 (+12/+2 up to tier 2, then +15/+5 at tier 5). Assumption: the API
  counts what the manifest declares (+10, plus +2 from level 20), and the
  rest is added.
- **Enhanced adept weapons** (`isAdept` on the definition) follow DIM, with no
  weapon-level condition. Secondary stats get +3, or +4 at enhancement level 3,
  plus the enhancement level at tier 5. The main stat gets 10 + tier. The
  enhancement level (1–3) comes from the "Enhancement" plug in place
  (2728416798 / …797 / …796).
- Exotic catalyst (trait `item.exotic_catalyst`): active only once the item
  is masterworked (`ITEM_STATE.Masterwork`).
- Armour 3.0 masterwork and Balanced Tuning: only on stats whose base,
  read from the hidden `armor_stats` plugs, is zero.
- Adept enhancer previews and Elemental Capacitor: never applied.
- "Enhanced Charge Time" (3779301690) and "Adept Charge Time" (744770875)
  declare **no** investment stat: their "+10 Charge Time" exists only in their
  perk text. It is hard-coded and added to the totals, since the API cannot
  count what is not declared (DIM misses it too). The Draw Time mods and
  Tension do declare theirs.

Stats follow the **shown** plugs, so a pending insert or a group snapshot
updates the bars immediately. `ItemDetail.statSockets` records which sockets
the API totals describe, because a successful insert patches `sockets` in the
cache while `stats` only changes on the next refresh. The display curves
(`DestinyStatGroupDefinition`, which is not the identity for Impact) are
applied to weapons. Armour stats are 1:1. Charge time and draw time follow a
**decreasing** curve (1000 → 500 ms): a masterwork lowers them, so its share
is negative. These values have no bar, so the number itself turns gold.

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

The Postmaster shares that scroll area: `VirtualItemGrid` takes a `lead` section
(built by `usePostmasterSection`) rendered **before** the vault, at the same
level, so the storage column has a single scrollbar and the vault gets the whole
height. Its items are neither sorted nor grouped — a handful of items, in
Postmaster order. It disappears when a search retains none of them.

### Grouping

The vault is **always** split into sections by origin slot (kinetic, helmet…) —
`item.bucketHash` is "Vault" for everything there, so the slot is read from
`definition.inventory.bucketTypeHash`. Within a section, one sub-group at a time,
chosen in the settings: ammo type (default), weapon type or damage type for
weapons; class (default), set bonus or armor archetype for armour.

`lib/destiny/grouping.ts` is pure, like `sort.ts`: it receives already-resolved
definitions and labels and returns sections. The two mechanisms compose —
sorting applies to the whole list first, grouping only redistributes it. This is
why "slot" is no longer a sort criterion: sections already carry it.

Headers are **rows of the same virtualiser** as the items — the only way to have
them scroll with the content without mounting the thousand thumbnails
virtualisation exists to avoid. Three levels, all rendered by `GroupHeader`:
`root` (Postmaster, Vault), `section` (origin slot), `group` (sub-group); the
indent grows with the depth. Their heights therefore come from the CSS too
(`--inventory-header-height`, `--group-section-height`,
`--group-header-height`), read by `useGridMetrics()`.
Headers collapse, but that state is deliberately **not** persisted: the
preferences cookie is capped at 4 KB and shared.

Header icons are **described, not mounted**: `grouping.ts` yields a `GroupIcon`
descriptor (`ammo`, `weaponType`, `class`, `vault`, `postmaster`, `image`) and
`GroupHeader` routes it to a component from `components/icons/`. Local icons are
inline SVG, so monochrome symbols drawn in `currentColor` inherit the text colour
directly; only manifest artwork stays an `<img>`, since an image hosted on
bungie.net cannot be inlined. Inline SVG replaced the CSS masks the local files
needed while they were served through `<img>`, which isolates them in their own
document where `currentColor` never sees the page.

> The scroll container does not clip tooltips: they render in a portal, outside
> that DOM tree.
>
> ESLint reports `Compilation Skipped: Use of incompatible library` on this
> component: the React Compiler cannot memoise `useVirtualizer`. Expected
> warning, no functional impact.

## Moving & equipping items

The API exposes **three** writes — `TransferItem`, `EquipItem`,
`PullFromPostMaster` (`src/lib/bungie/actions.ts`) — and they draw a graph with
no shortcuts:

```
Postmaster ──PullFromPostMaster──▶ character inventory
character inventory ◀──TransferItem──▶ vault
character inventory ◀──EquipItem──▶ equipped items
```

Everything follows from what the graph *lacks*:

- **no edge between two characters** — a hand-off goes through the vault;
- **no "unequip"** — an equipped item is freed by equipping another one from the
  same bucket, so moving it costs one extra request and one extra decision
  (which item takes its place);
- **the Postmaster only empties into its own character's inventory.**

`TransferItem` and `PullFromPostMaster` also take a `stackSize` — see **Stacks**
below.

Hence a weapon equipped on character 1, wanted on character 2, costs four
requests: equip a replacement on 1, transfer to the vault, transfer to 2, equip.

`src/lib/destiny/moves.ts` is the planner — pure, React-free, testable with the
compile-and-run recipe in `CLAUDE.md`. It also enforces the constraints the API
would otherwise reject after the fact:

| Constraint | Source |
|---|---|
| Subclasses & artifacts never leave their character | `nonTransferrable` |
| Armor is class-locked | `classType` vs the character's |
| 9 stored items per bucket (6 for the artifact), 1300 in the vault | `DestinyInventoryBucketDefinition.itemCount` |
| Some Postmaster pulls destroy things | `doesPostmasterPullHaveSideEffects` |
| One exotic weapon **and** one exotic armor piece per character | `tierType` + the bucket's family |

Equipping an exotic while another one of the same family occupies a *different*
slot costs an extra step: the one in place is freed first, and its replacement
must be non-exotic — otherwise the conflict would simply move one slot over. An
exotic already sitting in the target slot needs nothing: it is replaced outright.

When a destination bucket is full the planner adds an **eviction** step (its
least valuable item goes to the vault) rather than failing — the same thing the
game does. Exotics are picked last as replacements or evictions: equipping one
can force another one off, which nobody asked for.

When the character has **nothing else stored** in the slot, the replacement is
brought in first (`fetchStandIn`, role `standIn`): from the vault, otherwise from
what another character has *stored* — never an item equipped elsewhere, which
would itself need a replacement, with no end to the cascade. The candidate must
fit the character's class, be transferable, and not be an exotic while another
exotic of the same family is worn. Group equips go through the same planner, so
they benefit from it too.

The **exotic conflict** uses the same fallback. When nothing non-exotic is stored
in the rival exotic's slot — an inventory emptied down to what is worn — the
replacement is brought in from the vault or another character
(`fetchStandIn(characterId, rival.bucketHash, false)`), and it must be
non-exotic. `noExoticSwap` now only means there truly is none anywhere, or that
the rival's stored slot is full of exotics.

### Stacks

Mods, consumables and materials are **not instanced**: the API knows them by
`itemReferenceHash` and takes `itemId: "0"`, so they have no identity to key the
queue, the greyed-out thumbnail or the profile-freshness check on. They get a
synthetic one instead — `stackId()`, the hash plus where the stack currently is,
mirroring `matchKey` in the search. Both halves matter: the same mod can have a
stack in the vault and another in the shared storage, and only the second half
tells them apart. The id is resolved against the cached profile when planning
and never kept beyond that; the API route translates it back to `itemId: "0"`
before the call, and each step carries its `stackSize`.

Dropping a stack of more than one opens an **amount prompt** (`AmountPrompt`), a
slider and a field over the shared modal, opened on the whole stack — the common
case, so confirming without touching anything moves everything. The amount is
kept on the queued action and not only on its steps: the plan is recomputed just
before sending, and without it the stack would go whole. `applyStep` splits
accordingly — the remainder stays where it was.

Their plan is its own branch (`planStackMove`, checked by `moves.check.ts`):
never an equip, never an eviction to make room, and one transfer — two when
pulling from the Postmaster first. Those buckets are account-scoped, so aiming
at one character's inventory or another's moves nothing, and the shared storage
and the vault live in the *same* array (`profileInventory`): a transfer between
them changes a `bucketHash` without moving the item from one list to another.
Two stacks of the same item never coexist in one place — `applyStep` merges
quantities, otherwise the next plan would run against a state the game does not
have.

> An unknown bucket capacity means “no known limit”, never the planner's default
> of ten. That default is a weapon's, and applying it to a 50-slot pouch invented
> refusals: every transfer into shared storage was turned down as “destination
> full”. The real fix is upstream — `useBucketCapacities` must track **every**
> bucket that can receive an item, customization and shared storage included.

### Queue

`src/lib/actions/` holds the queue (Zustand, **not** persisted — a half-sent
action replayed on reload would start from an account state that no longer
matches its plan). It runs **one request at a time**: each step assumes the
previous one succeeded, and Bungie throttles writes per account anyway
(`ThrottleSeconds` is honoured, with two retries).

Two things happen so the UI stays fast:

- the plan is recomputed **just before execution**, not when queued — earlier
  actions have moved items around in the meantime;
- a successful step is replayed on the cached profile (`applyStep`, or a socket
  patch for an insertion) instead of refetching it. The profile weighs ~1.6 MB
  and one action costs up to four steps; the real refetch happens once the queue
  drains.

Three kinds of action share the queue — move an item, equip a perk, act on a
loadout slot — and sharing it is not a display convenience: the throttle Bungie
applies to writes counts **every route together**, so a button that posted
directly would have escaped the serialisation. A loadout action carries no item,
only a numbered slot, so it sits on its own base and its card shows the slot's
tile on both sides of the arrow. Its identifiers are copied when queued, which is
what lets the card survive a `clear` that empties the slot.

`lib/destiny/loadout-effects.ts` replays each of them locally, because Bungie
says nothing about what it changed:

| Action     | Local effect |
| ---------- | ------------ |
| `equip`    | see below — items move |
| `snapshot` | the slot takes what the character wears, each item's **current** sockets copied into `plugItemHashes` (which is indexed by socket, so they transfer as-is) |
| `clear`    | the slot goes back to free |
| `identifiers` | the slot's appearance changes, its contents do not |

`EquipLoadout` deserves its own replay: Bungie
assembles the loadout server-side and says nothing about what it moved, so the
effect is simulated from the rules the game follows — an item in the vault is
transferred then equipped **if the bucket has room**, one already on the
character is just equipped, and one that is missing or held by **another
character** cannot be moved at all. The steps are handed to `applyStep`, the very
same one moves use, so the effect of a transfer or an equip on the profile is
written once and the displaced item is already handled there.

The loadout's item instance ids are copied into the action when queued, so
`useItemBusy` can grey those tiles for the whole wait — Bungie announces nothing
about what it will move, and a request that takes a second showed up nowhere
otherwise. Copying them is what keeps that selector a plain boolean over the
queue: hundreds of mounted tiles subscribe to it, it cannot go and re-read the
slot from the profile. Only an `equip` carries any; changing a slot's appearance
moves nothing.

`ErrorCode` is checked in `bungieFetch`: Bungie reports its refusals with
**HTTP 200**, so a rejected `EquipItem` used to look exactly like a success.

#### Stale snapshots
> **Replaying an action locally is only half the job: the guard has to know
> about it too.** The three slot-rewriting actions were corrected in the cache
> and then reverted a second later — the end-of-queue refetch brought back
> Bungie's earlier snapshot, and `isStaleProfile`, which only ever looked at
> items, had nothing to object. Hence `markLocalLoadouts` and the third table.
> A slot's signature is its three identifiers plus the **sorted set** of its real
> item instance ids: the API returns ten entries in its own order, padding with
> `"0"`, so comparing the list as-is would never have matched what the local
> replay wrote and the guard would never have lifted.



That final refetch is the trap. `GetProfile` sits behind a cache whose
**contents** lag a few seconds behind the writes we just issued: reloading right
after a successful action can hand back the item at its old place, or the perk
we just replaced. Overwriting the local cache with it makes the change *jump
back*.

`responseMintedTimestamp` is no help — it is fresh even when the data is not: it
dates the response, not the snapshot it carries. The only reliable signal is the
content itself, so `src/lib/bungie/profile-freshness.ts` records what our writes
left behind and refuses any response that disagrees:

| Write | Recorded | Compared against |
|---|---|---|
| Move | where the item ended up | `locateItem` in the response |
| Perk insertion | the plug each touched socket carries | `items[id].sockets[i]` |

Both are needed, and neither covers the other: a move changes the item's place
without touching its sockets, an insertion does the opposite. `useProfile`
retries three times (1 s, 2 s, 4 s) then gives up and keeps the local state —
persisting would block every later reload, and the guard also fires when the
player touches the same item in-game at that exact moment.

### Interface

Dragging an item reveals seven drop zones over the view — equip / inventory for
each character, plus the vault. The shared-storage tab is the exception, with
two: “inventory” on the left, the vault on the right, mirroring the split of the
view underneath. Modifications and consumables are account-scoped, so naming a
character would mean nothing — the API demands one for any transfer all the
same, and the displayed character serves as the way in. They overlay rather than
insert themselves: the
layout does not shift at the moment the user is aiming. Each zone asks the
planner whether it is reachable, and a zone that is not stays visible, disabled,
carrying its reason.

They are three layers, all **direct children** of `.inventory__body`: an
absolutely-positioned child of a grid that is given a grid position takes that
**grid area** as its containing block. The vault layer therefore matches the
`.inventory__storage` column exactly, with nothing to measure and no
approximate ratio to keep in sync — which is also why `__body` declares explicit
`grid-template-rows` even for a single row (an implicit line does not exist for
an absolutely-positioned child, which would fall back to the whole block).

> **Both lines of each axis must be given.** Unlike a real grid item, an
> absolutely-positioned child does not stop at the end of its track when the end
> line is left `auto`: that edge falls back to the grid container's padding
> edge. `grid-column: 1` therefore stretched the character zones across the full
> width, underneath the vault one — which happened to look right only because
> its area ends at the container edge anyway. `grid-column: 1 / 2` is the fix.

The layers stay mounted and fade in and out on a `--visible` modifier: it is
what makes the exit animatable at all — there is nothing to unmount — and it
moves the mounting work away from the instant the user grabs an item.

The displayed character's row matches the height of `.equipment__columns`, which
CSS cannot read from a sibling overlay. It is **derived**, not measured:
`--equipment-columns-height` in `layout/main.scss` computes it from
`--slot-rows`, `--item-size` and `--slot-row-gap`, and `.slot-column` uses that
same gap — one source, so the zones follow the icon-size setting on their own.

> A `ResizeObserver` publishing the measured height was tried first and dropped.
> It failed in a way that is worth remembering: nothing in the compiled CSS or
> the client bundle is wrong when a value written at runtime never arrives, so
> there is nothing to grep. A CSS derivation either computes or does not, and
> the compiled stylesheet says which. `--slot-rows` must track the length of
> `WEAPON_COLUMN` / `ARMOR_COLUMN` in `lib/destiny/buckets.ts` — that is the
> price, and it is a game constant.

Double-clicking equips on the displayed character.

> **dnd-kit's droppables are deliberately unused.** `over` lives in the context
> that *every* `useDraggable` reads, so pointing at a zone re-rendered the ~100
> mounted tiles — a visible stutter each time the pointer crossed a zone
> boundary. `collisionDetection` therefore returns nothing, `over` stays `null`
> for the whole gesture, the highlight is plain CSS `:hover`, and the drop
> target is read back from the DOM at pointer-up (`data-drop-target` +
> `elementFromPoint`). The overlay must keep `pointer-events: none` for both to
> work.
>
> A cursor-following tooltip must carry `pointer-events: none`
> (`.floating-layer--passive`). Without it, it sits *under* the cursor and
> receives the `pointerdown` itself: the item never starts moving and the drop
> zones never appear. Once pinned it becomes interactive again — its perks have
> to be hoverable.
>
> During a gesture every tooltip is hidden by `:root[data-dragging]`, an
> attribute written straight to `<html>` by `MoveDnd`. Telling the tiles through
> a context would re-render all hundred of them, twice per gesture. The drop
> target is read from the DOM **before** the attribute is cleared — restoring a
> tooltip under the drop point first would hide the zone from
> `elementFromPoint`.

> For the same reason the dragged item is kept in a **separate context** from
> the actions the tiles consume, and auto-scroll is off (the zones cover the
> view, nothing is left to scroll). What remains is one unavoidable re-render
> per gesture, caused by dnd-kit's own `active`. The seven plans are computed
> once at drag start — 0.13 ms with a thousand-item vault, measured — and never
> recomputed while aiming.

### Equipping a perk

Changing a weapon perk is not a move, but it *does* share the queue. One
request, `InsertSocketPlugFree`, sent to `POST /api/sockets`; the browser side
is `src/lib/actions/use-insert-planner.ts`, the counterpart of the move planner
minus the plan — an insertion costs one request and never more.

Sharing the queue is not a display convenience: the runner sends **one request
at a time**, and Bungie throttles writes per account across all routes. It also
means a perk change reads like any other action in the side panel, with its own
card, progress and refusal — and inherits the throttle retries for free.

`QueuedAction` is therefore a union discriminated by `kind` (`"move"` /
`"insert"`), and so is `ActionStep`; `sendStep` routes on the same discriminant.
The tooltip keeps no state of its own — it is unmounted every time it closes,
while the action outlives it in the queue — so `usePlugActionState` reads the
pending insertion and the last refusal straight from there.

Bungie exposes two socket writes and only one is reachable: `InsertSocketPlug`
requires an *advanced write action* token, issued from the game itself.
`InsertSocketPlugFree` needs nothing more than the `MoveEquipDestinyItems` scope
already in use — but **"free" is a restriction, not a gift**: the API only
accepts changes that cost the player nothing (perks already unlocked on the
weapon, armor mods, subclass fragments). Anything else is refused, with a status
that is passed straight through to the tooltip.

Three things the OpenAPI spec says that are easy to get wrong:

- **`characterId` is the character that acts, not the one that owns the item.**
  Nothing attaches the field to the item, and an item **in the vault can be
  modified** — you just pass a character. Any of them will do for a weapon perk:
  the options come from the weapon instance (`reusablePlugs`), never from
  character unlocks. That would no longer hold for mods.
- **The character must be in a social space, in orbit, or offline** — the same
  precondition as the paid endpoint. Nothing exposes it beforehand; it surfaces
  as a refusal.
- **Rate limit: 2 socket actions per second per user**, tighter than the general
  write budget. The queue sends one request at a time, so it is not reachable
  today, but a batch feature would have to respect it.

In the tooltip, clicking a perk equips it. The perk tooltip announces this with
a left-click symbol, as a hint and not a button: it closes as soon as the cursor
leaves the icon, so it could never be reached with the mouse.

The profile cache is patched on the spot (`items[id].sockets[socketIndex]`) for
the same reason move steps are — reloading 1.6 MB for one plug is out of
proportion, and the tooltip is still open under the user's eyes. The reload the
queue triggers on drain is what brings the stats back in line: those we cannot
recompute locally.

> The weapon's tile is **not** greyed out during an insertion, unlike a move:
> the item does not go anywhere. The wait is shown where the click happened —
> on the perk itself.

## Display modes & in-game loadouts

The equipment page has three modes, switched by the buttons next to the
character tabs or by the **Tab** key, which cycles through them. The mode lives
in the preferences cookie (`viewMode`), so it survives a reload — see
`lib/settings/constants.ts`.

- **Inventory** — the historical view: two columns of slots with their
  per-slot inventory, and the vault on the right. This is where items move.
- **Loadouts** — one row per slot, the equipped item's perks, mods and
  abilities laid out beside it, and the character's saved loadouts on the right.
- **Groups** — the character's loadout groups, one card each, preceded by the
  card of the slots actually saved in game. See "Loadout groups".

**All modes stay mounted**, stacked in the same grid cell: switching is then a
plain cross-fade, and nothing has to be rebuilt — not the virtualised vault, not
the definitions already read. The hidden ones are taken out of the flow
(`position: absolute`, or the cell would keep the height of the tallest) and
marked `inert`, which an opacity alone would not do.

The loadouts mode does not move items — no drop zone, no per-slot inventory,
nothing to drag onto. That is what `DragScopeProvider` carries: a context of its
own rather than a flag on `MoveActionsValue`, since both modes are mounted at
once and what holds for one does not hold for the other.

> **Mounting both modes means each needs its own dnd-kit id prefix.** dnd-kit's
> `draggableNodes` is a Map keyed on the id **alone**, and `useDraggable`
> registers into it even when disabled. Both modes render the same equipped
> items, so their two tiles fought over one entry: the last mounted won, and
> *its* rect became the drag overlay's origin — an equipped item jumped to the
> position it holds in the other mode the moment the gesture started. Hence
> `DragScope.idPrefix`.

### Inventory layouts

The inventory mode itself has two layouts, chosen in the settings and stored in
the same cookie (`inventoryLayout`, `lib/settings/constants.ts`):

- **`single`** — the historical one: the slots of the *displayed* character, in
  two columns facing each other, and the storage on the right. The storage
  shows, between the Postmaster and the vault, an « Other characters » root,
  one section per **other** character inside it (`CharacterSection`,
  `VirtualItemGrid`, class symbol included), then one sub-group per slot, what
  they wear first — without the vault's own sub-groups, which would push the
  equipped item away from the head of its slot. A toggle (`ownClassArmor`, in the
  cookie) hides armour only another class could wear. The character picker sits
  left of the category tabs (`.inventory__toolbar`), no longer in the header;
  the toggle (`.toggle`) is pushed against the right edge.
- **`characters`** — the three characters side by side, one column each
  (`components/CharacterColumns.tsx`), and the vault on the right. Each row is
  `EquipmentSlot side="right"`, the armour column of the other layout reused as
  is: the equipped item on the left, its slot inventory unfolding to the right.

Three things follow from the second one, and none of them is cosmetic:

- **The column order is the profile's, never the selection's.** The drop zones
  line up on that same order (`DropZones`, `columns`): reordering them would
  drop items onto the wrong character, and nothing would say so until the
  transfer went through.
- **The gutter between columns is the unfolding grid's overhang**, derived in
  CSS from `--item-size` and the `--slot-reduced` factor
  (`components/character-columns.scss`). A slot inventory grows by a
  `transform`, so it overlays its neighbour; the gutter is what keeps it from
  covering it.
- **Lost items are split per character.** They come from all three at once, and
  nothing on a tile says whose Postmaster it sleeps in — hence
  `LeadSection.groups` (`VirtualItemGrid`), one sub-header per character, class
  symbol included. The `single` layout does the same, since its storage already
  holds the other two characters; only the shared storage tab keeps the
  displayed character's lost items alone.

The shared storage tab (`itemCategory: "inventory"`) ignores the setting: it
belongs to no character, and already shows two grids without a single slot.

### Where the plug icons come from

`lib/destiny/use-equipped-plugs.ts` builds every row in **one** grouped
IndexedDB query for the whole screen. A plug's nature is only readable from its
definition (`plugCategoryIdentifier`), and one read per icon would restore the
dozens of Dexie subscriptions the project removed elsewhere.

Per item type:

- **weapon** — equipped perks, then mods, then the intrinsic frame;
- **armor** — set-bonus perks (shown even below their piece threshold, as in
  game) or, on an exotic, its intrinsic, drawn **square** like a weapon's frame:
  same role, and the game presents it the same way; then mods;
- **subclass** — super, class ability, movement, grenade, melee and aspects on
  the first line, fragments on the second;
- **artifact** — the perks actually slotted.

Cosmetics (shader, ornament, kill-clip effect) are left out: they change nothing
about how the item behaves. So are **masterworks and catalysts** — they cannot be
changed for free, and their icon only says "this item is upgraded", which the
tile already shows.

> Beware the masterwork test. `isFixedPlug` splits the plug family on dots, and
> that misses most of them: alongside `v400.plugs.weapons.masterworks.stat.range`
> the manifest holds `v300_new_auto_rifle0_masterwork` (underscores),
> `v400.new.bow0.masterwork` and `v620.exotic.weapon.masterwork` (singular), and
> `generic_exotic_masterwork`. `isMasterworkPlug` cuts on **both** separators and
> accepts the singular — 160 families, 822 plugs, checked against the whole
> manifest.

When no loadout is selected the rows show what the character **wears**, and every
socket is then editable: clicking a plug opens its socket picker, the same
`PlugSlot` the tooltip uses, so the rule for "is there anything to choose here"
is written once. A **selected** loadout is a snapshot — nothing is equipped right
now, so its rows are read-only.

### Saved loadouts

They are **Bungie's**, not ours: profile component **206**
(`characterLoadouts`) returns each character's numbered slots, and three write
endpoints act on them (`lib/bungie/actions.ts`, `/api/loadouts`):

| Button                       | Endpoint          |
| ---------------------------- | ----------------- |
| Equip loadout #n             | `EquipLoadout`    |
| Overwrite with equipped items | `SnapshotLoadout` |
| Delete this loadout          | `ClearLoadout`    |

These do **not** go through the action queue: Bungie assembles the loadout
server-side, vault transfers included, in a single request. Nothing to plan, so
a local pending state plus a profile refetch is enough.

Points worth knowing:

- **`2166136261` is Bungie's "no hash" sentinel** — `0x811C9DC5`, the FNV-1a
  offset basis. It is *not* zero, and it is what an unset identifier holds. A
  free slot carries it on all three of `colorHash`, `iconHash` and `nameHash`,
  and ten `items` entries whose `itemInstanceId` is `"0"`. Two bugs came out of
  taking it for a real hash: empty slots were drawn as full ones (no definition
  at that hash, so no tile art, but a slot judged occupied — every action
  offered, and selecting one blanked the ten rows), and `SnapshotLoadout`
  received it as an identifier, which is what answered *"Your request was
  invalid."* on creation. Nothing but a real hash is ever sent now.
- **A slot is free when no item has a real instance, or when none of its three
  identifiers is a real hash** — either signal is enough, and `items.length` is
  not one of them. See `lib/loadouts/loadout.ts`.
  A free slot is still selectable, and its title is reduced to its number plus
  "free slot": that number is the only sign of which slot a snapshot is about to
  fill. The rows then show **empty cells** — there is nothing recorded to show —
  and its one remaining action, *create from the equipped items*, sits at the
  centre of the equipment column rather than in the right-hand panel, where the
  emptiness left the room for it. Hovering that button fades the worn gear in: a
  preview of what the click would record. The fade is pure CSS — a `:has()` on
  the column both share — because routing it through React state would re-render
  the ten rows and all their plugs on every pointer enter and leave, for an
  opacity transition. Same reasoning as the tooltips' `:root[data-dragging]`.
- **`SnapshotLoadout` requires `colorHash` / `iconHash` / `nameHash`** — all
  three, always, whatever their `nullable` in the OpenAPI schema suggests.
  Omitting them answers `DestinyInvalidRequest` (1622), and so does passing the
  sentinel a free slot carries. An existing slot therefore resends its own, so
  as not to lose its colour, glyph and name; a free slot is given the **first
  entry of each list** in `DestinyLoadoutConstantsDefinition` — the only order
  that means anything here — and the title lets them be changed straight after.
  Renaming and recolouring are likewise offered only on a slot that exists.
- **A saved item's `bucketHash` is not usable as-is**: an item sitting in the
  vault carries the vault's. The slot it equips into comes from its definition
  (`inventory.bucketTypeHash`) — see `lib/destiny/use-loadout-items.ts`.
- The tile's background and glyph are two separate manifest images
  (`colorImagePath`, `iconImagePath`); `DestinyLoadoutColorDefinition`,
  `DestinyLoadoutIconDefinition` and `DestinyLoadoutNameDefinition` are the only
  tables used here **without** `displayProperties`.
- The number of slots is not hard-coded: the component returns as many as the
  account owns.
- **`plugItemHashes` is indexed by socket index** — one entry per socket, not a
  flat list, so a saved loadout is drawn with the perks and mods it actually
  recorded. Two values mean "nothing here", and both are the `INVALID_HASH`
  sentinel: a socket that was not recorded, and — the trap — **a socket that
  offers only one option**, which the game deliberately leaves unset. Taking
  those for empty slots would erase perks that are very much in place, so the
  item's current value stands in for them: on a single-option socket it *is* the
  recorded plug. See `savedSockets` in `lib/destiny/use-loadout-items.ts`.
- **Escape** deselects. The gesture is only taken when it serves nothing else: an
  open picker keeps it (that is what one wants to close), and a modal traps the
  keyboard anyway.

### Loadout groups

A **group** is an ordered set of loadout snapshots for one character: one entry
per slot the character owns, each either empty or a full snapshot. Equipping a
group will clear every slot, then for each entry equip its items — perks and
mods included — and snapshot the slot over them. `lib/loadouts/groups/`.

A group entry **is** a `DestinyLoadout`, structurally. That is deliberate:
everything that already reads one serves groups without a line more —
`isEmptyLoadout`, `useLoadoutIdentifiers` for the tile, `useLoadoutItems` for the
contents. An entry left empty carries the `INVALID_HASH` sentinel on its three
identifiers and an empty item list, exactly like a never-saved slot in game.

Groups are **not shared between characters**: a snapshot names items by instance,
and one class's armour does not equip on another.

> **Groups live in localStorage, not in the preferences cookie** — the one
> exception to the rule above. A group carries a full snapshot per slot: about
> twenty slots, ten items each, an `itemInstanceId` and a dozen plug hashes per
> item. A handful of groups already exceeds the cookie's 4 KB, and the cookie
> would be sent back on every request. Nor has the server anything to read at
> render time: unlike the theme, no group appears in the initial HTML.

Their account sync therefore has its own route and its own row
(`/api/loadout-groups`, `UserLoadoutGroups`), keyed off the same `syncEnabled`
preference. Two differences from the settings sync:

- **the state does not come down with the HTML.** `LoadoutGroupsSync` re-reads it
  with a request, after mount, while localStorage already holds the display. The
  `synced` marker carries the last list the server is known to hold — without it
  the downward read would trip the upward subscription, which would push straight
  back what had just come out of the database;
- **the body is validated entry by entry**, not merely capped like the
  preferences. An unknown setting degrades to a default; an unreadable group gets
  equipped. Better to refuse it on the way in — `isLoadoutGroupArray`.

#### What keeps groups from vanishing

Groups did vanish, typically after a page reload, and never through a single
bug: four independent paths each turned a small mishap into a permanent loss.
They are worth listing, because every guard below answers one of them.

**The downward read overwrote instead of reconciling.** `GET` returned an empty
list whenever it had nothing to return — no row, unreadable row — and the client
took that for the account's truth, replacing its list *and* its localStorage with
it. The route now answers `groups: null` for "the account knows nothing", which
is not `groups: []` ("the account knows there is nothing left"), and carries the
row's `updatedAt`. `mergeGroups` (`sync-merge.ts`, a pure module with its own
check) settles the rest per group: newest `updatedAt` wins; a group the server
does not have is kept if it postdates the deposit — created since — and dropped
if it predates it — deleted elsewhere. Order follows whichever side was touched
last.

**A single malformed group discarded every one of them.** Rehydration validated
the persisted array as a whole and fell back to an empty list, which the next
write then committed over the stored one. It now filters entry by entry, and
says on the console how many it dropped. A missing `migrate` had the same effect
on any `version` bump — zustand logs and hands back `undefined` — so one is
provided; sorting the entries does not depend on the version number.

**A rejected push was silent.** A 400, a 413, an expired session: the database
stayed behind while the interface showed nothing, and the next read served that
stale list. The status is now kept (`PushStatus`), retried when the network is
at fault, and shown in the settings.

**The scheduled push died with the page.** The 800 ms idle delay is longer than
a reload — a hot reload in development lands inside it every time, which is why
"I edit the code and my groups are gone" was a reproducible sentence.
`flushGroupsPush` sends what is still pending on `pagehide` and on the tab being
hidden, over `sendBeacon` (hence the route's `POST`, the only method a beacon
speaks).

Two backstops sit under all of it:

- **the upward subscription refuses to push an empty list nobody asked for.**
  The store counts the user's own gestures (`edits`, session-only); `replaceAll`
  is the one action that does not bump it. An emptying that comes from a failed
  rehydration or an unlucky read is therefore recognisable, and stays local
  instead of being committed over the account copy;
- **a safety net, in a second localStorage key** (`rescue.ts`). The persisted
  entry is rewritten by whatever changes the list, accident included, so it is no
  fallback to itself. The net is written only by the user's own gestures, and by
  `replaceAll` for what it is about to drop. `RecoveryRow` offers what is missing
  back — appended, never replacing: the net may be old, and nothing justifies
  losing what came after to recover what came before.

The card's grid is always the size of the **character**, never of the group: an
account that unlocks one more slot must see it appear, empty, on its existing
groups rather than see them truncated.

Each card carries an optional **colour** on its border, to pick it out of a row
at a glance. It is chosen with an `<input type="color">` — the system picker,
eyedropper and history included — so the value is a free `#rrggbb` rather than a
token from a fixed palette. It reaches the border through a CSS variable set as
an inline style, which is precisely the case inline style is for: no rule can
enumerate the values.

The `var()` fallback is what makes the field optional without a second rule, on
the border and on its hover state alike. Two pixels rather than one: a free hue
on a single pixel does not read as different from the grey border, and the width
is the same on every card, so nothing shifts. `isGroupColor` guards the shape at
the API boundary — the value ends up in a stylesheet, where an arbitrary string
has no business.

The first card is **clickable**: it leads to the loadouts mode, where those slots
are actually handled — it is the only card whose contents exist elsewhere in the
app. It carries `role="button"` on a `<section>` rather than being a real
`<button>`: a button's content model admits no flow content, and the card is made
of blocks. The keyboard is therefore rewired by hand.

> **The actions layer must not cover the header.** It is positioned `inset: 0`
> of its containing block, and while that block was the whole card it covered the
> drag handle as soon as hovering armed it — reordering the cards was simply
> impossible. It now covers `__body`, which holds the grid and nothing else, and
> the layer itself never captures the pointer: only its buttons do, the same
> arrangement as the loadout-creation layer. The header, and its handle, stay
> clear.

#### Equipping a group

Nothing is sent directly — everything goes through the action queue, which runs
**one request at a time**. That is not caution: each step assumes the previous
one landed, and Bungie rate-limits writes on an account across all routes. A
group equip asks for dozens.

The sequence is the specified one, and `equip.ts` computes it — a pure module
like `edit.ts`, verified by running it:

1. **clear** the character's loadout slots;
2. for each group slot, **in the order chosen below**: **equip** its items,
   **insert** the perks that differ, then **snapshot** the slot over what is
   then equipped.

There is no "write a loadout" endpoint: `SnapshotLoadout` only records what the
character currently wears. That is the whole reason for the shape above — the
items really have to be equipped first.

Three recorded plug values ask for **nothing**, and confusing them costs
requests: the `INVALID_HASH` sentinel (never recorded, or a single-choice
socket), `0` (an empty socket — there is no "nothing" plug to insert), and one
already in place, which is by far the common case since the snapshot was taken
off those very items. A locked socket is skipped too; the insertion would be
refused.

**Clearing is restricted to the slots the group will not fill.** The end state is
identical — a `SnapshotLoadout` overwrites the slot it targets — and it saves one
request per filled slot. Already-free slots are skipped for the same reason, and
because `ClearLoadout` would refuse them.

**Each group slot is its own batch** (`batchId`). A failed step cancels the rest
of *that* slot — its snapshot included, otherwise the half-equipped set would be
recorded in game — and the following slots carry on. One batch for the whole
group used to fail everything for a single missing item. Slots do not depend on
each other succeeding: the runner re-plans every move against the profile at
send time, and the perks the plan pre-filtered as already in place are exactly
those every slot asks for identically (`volatileSockets`). Clears belong to no
batch: they depend on nothing.

Within a slot, **non-exotics are equipped before exotics** (`isExotic` in the
context). Switching from a kinetic exotic to an energy one in snapshot order
needed a stand-in for the first; equipping the slot's legendary kinetic weapon
first pushes the exotic off for free.

##### Perks a weapon no longer offers

A snapshot records plug **hashes**, and a weapon changes its pool behind the
app's back: shaping it, enhancing it or raising its tier swaps its perks for
their **enhanced** versions, which carry different hashes. None of those three
operations exists in the API — nothing warns, and the group only finds out when
Bungie refuses the insertion. This is the failure users hit: a group saved with
plain "Chill Clip", the weapon enhanced in game since, and a group equip asking
for a perk the weapon no longer has.

Two moves, in opposite directions, in `lib/destiny/perk-upgrades.ts`.

**At equip time, a recorded perk the weapon no longer offers is replaced by its
enhanced version.** The pool the weapon advertises (`reusablePlugs`,
component 310) is already in the profile, so the check is free: a recorded hash
still in it goes through untouched, and only the stale ones cost a manifest
read. Nothing in the manifest links the two versions — of the 700 plugs labelled
"Enhanced", no shared key pairs them, and half the upgradable families (barrels,
magazines, blades…) carry no sandbox perk at all. What does pair them, on 684 of
the 700, is **name + `plugCategoryIdentifier`**; rarity then tells which is
which (see `isEnhancedPlug`). The pairing is searched **only among the options
the weapon offers right now**, which is what makes it safe: the manifest's
homonyms — shaders, ship transmat effects, ghost upgrades — never share a socket
with a weapon perk, and none is of the rarity the match demands. When nothing
fits, the recorded value goes out as it is: a refusal visible in the actions
panel beats a guessed substitution.

The substitution runs **first**, before the volatile-socket survey and the
already-in-place filter: those compare hashes too, and two slots wanting the
same perk under its two versions would have thought themselves in disagreement.

**When recording, a crafted weapon's perk columns are dropped.** A crafted
weapon has a single choice per column — there is nothing to restore — but the
recorded hash goes stale at the next reshape or enhancement. Only the
`WEAPON_PERKS` category is dropped; mods, shader, ornament, masterwork and
intrinsic stay recorded, since those are exactly what a group is for. The
`INVALID_HASH` sentinel is what "forgets": it means "not recorded, take the
current value" (see `savedSockets`), where a zero would mean "empty socket".
`useRecordPlugs` only reads the manifest for the profile's **crafted** items —
a few dozen against a thousand.

##### The order of the slots is chosen, not given

`equip-order.ts` decides in which order the slots are played, and it is **not**
the character's slot order. Equipping an item that is already on is free — the
runner re-plans every move and drops the ones that became pointless — so the
only thing a group really costs is the **differences between consecutive
slots**. Walking the slots in index order ignores that kinship and pays for a
near-complete set every time.

It is a travelling-salesman path problem with asymmetric costs and an imposed
start: what the character already wears. The cost of a step is one request per
item the previous slot did not leave equipped, plus one per socket it did not
leave at the wanted value — items *replace* each other, plugs *accumulate*, an
inserted perk surviving the item being stowed. It is solved by a greedy
construction followed by a local search (relocate a slot, swap two), evaluated
by simulating the whole order rather than through a distance matrix.

Not solved exactly, and deliberately: a character has at most twelve slots, and
the real data is heavily clustered — a character carries several *families* of
loadouts (PvP, PvE, a raid) that share almost everything inside and almost
nothing across. The cheapest path walks them family by family on its own, and
on the check's twelve-slot instance the local search lands on the optimum an
exact Held-Karp confirms.

Nothing about the end state depends on this order: every snapshot targets its
own slot and none reads the others. The only visible difference is what the
character wears once it is over — the last slot *played*, no longer the last
slot of the list.

Each item is enqueued **unconditionally**, and that matters: `useMovePlanner`
drops a pointless move by consulting the profile *at enqueue time*, and the
profile is about to change underneath it. An item equipped now, unequipped by the
next slot, then wanted again by a third would have been dropped — and that
slot's snapshot would have recorded the neighbour's item. The runner re-plans
every move just before sending anyway, and a step that turned out to be
unnecessary costs no request.

Perks are inserted **on the character that just received the item**: at enqueue
time it may still be in the vault, and armour mods unlock per character — hence
the `onCharacterId` override on `useInsertPlanner`.

> **An insertion is re-planned just before it is sent**, like a move, and for
> the same reason: between queueing and here, earlier actions may have changed
> this item's sockets. `planInsert` yields zero requests, one, or two.
>
> **Zero** when the plug is already in place — the API refuses to equip what
> already is, and the case is real: two group slots holding the same weapon ask
> for the same insertion, and the second arrives after the first has satisfied
> it. The runner is the authority here, because only it sees the current state.

> **A locked socket is not dropped either**, and it is the same trap. A subclass
> unlocks its fragment sockets as aspects are equipped (see
> `ItemDetail.disabledSockets`): with no aspect in place, all six fragment
> sockets read as locked *at plan time*, and dropping them lost every fragment of
> the slot. They are kept — the aspects, inserted first, will have unlocked them
> by the time their turn comes. The benign case filters itself out: a socket that
> stays locked holds the empty plug on both sides, and the equality test drops
> it. What remains is a refusal from Bungie, visible in the panel, where the old
> filter lost the plug in silence.
>
> **Insertion order is socket-index order**, and that is what puts aspects before
> fragments. Not an assumption: read off the manifest, all **eighteen** subclasses
> place their two aspect sockets before their six fragment sockets. Not to be
> confused with the *display* order of the abilities, which does not follow the
> indexes — see `subclass.ts`.

> **The plan may only pre-filter a socket the sequence does not move.** The
> runner turns a request that became pointless into zero requests; it cannot do
> the reverse. Dropping a plug at plan time because it matched the profile *of
> before* therefore loses it for good — the later slot inserted nothing and its
> snapshot recorded the earlier slot's value. It showed on a subclass's
> abilities: a character has only one subclass per element, and two group slots
> fought over its sockets. Hence `volatileSockets`, which relieves the filter of
> every socket the plan makes change value.
>
> **Two** when another socket of the same **artifact** holds that plug: an
> artifact does not equip the same perk twice, so it must first be taken off
> where it is. The removal request goes first, the wanted insertion second. The
> test is restricted to artifacts — elsewhere, two sockets that would accept the
> same plug draw from distinct pools and nothing forbids the duplicate.
>
> **Several** when the armour's **energy** does not suffice: every other mod is
> removed first. Free energy is recomputed from the sockets rather than read from
> `energyUsed`, because only the sockets are kept up to date in the local cache —
> trusting `energyUsed` went wrong from the second insertion onwards. The socket
> being written does not count against the total: its occupant frees its share by
> being replaced.
>
> None of this applies to `EquipLoadout`: Bungie assembles the loadout itself and
> handles these constraints on its side.

Three things about armour energy were **read off the manifest**, not assumed, and
two of them run against intuition:

- an armour mod's cost runs **0 to 4**, and some thirty mods carry no
  `plug.energyCost` at all. Absence means zero, not missing data;
- **masterwork and artifice plugs carry no cost**, though they sit in the *same*
  socket category as the mods (`ARMOR_MODS` — checked on Mask of Bakris). That
  is what lets the code spare them on cost alone, with no need to recognise their
  family;
- costs of 5 and 6 do exist, but only on **ghost** mods, which this app never
  shows and which have their own energy.

When it does not fit, **all** the other mods go, not the strict minimum: choosing
which to sacrifice has no defensible criterion. Only sockets whose occupant
actually costs something are emptied — which of itself spares empty sockets, the
masterwork and artifice.

> **The actions of one equip share a `batchId`, and a failure cancels the rest.**
> The sequence is one whose every step assumes the previous landed. Letting it
> carry on after a failed equip would have snapshotted the botched set into the
> game — worse than a visible failure, because silent. `cancelBatch` marks the
> not-yet-started actions of the batch as `batchCancelled`; what already
> succeeded is left alone, since one does not cancel what is done.

The cost is stated before it is incurred: the confirmation names how many slots
will be equipped and cleared, roughly how many requests that is, and how many
slots are skipped — their items gone from the account, or their appearance
incomplete (`SnapshotLoadout` demands all three identifiers).

#### Editing a group

"Edit" **replaces** the card grid with the group's editor rather than opening
over it: the editor reuses the loadouts mode's layout — the ten item rows on one
side, the slot grids on the other — and needs the full width. A modal that size
would only have been a page in disguise.

**Every write goes through `edit.ts`**, a pure module, then through one store
action (`setGroupLoadouts`). Same split as `sort.ts` / `grouping.ts`: the Destiny
semantics — which item displaces which, how a socket-indexed array is filled in,
how a card's rank maps back into the flat stored list — live in a module with no
React and no store, and are verified by running it (see "Verifying your work").
The editor only supplies what the module cannot know: where an item equips, and
the game's default identifiers.

The slot grid is reordered by drag and drop (`@dnd-kit/sortable`), and so is the
card list — the manual order *is* the order, which is why there is no sort
criterion to choose. A slot's identity is its **place**, and that is what dnd-kit
receives as an id: two empty slots are otherwise indistinguishable, and it is
their position that moves. The card, by contrast, is dragged by a **handle**: it
carries a layer of buttons, which no activation threshold would protect from a
click read the wrong way.

A group slot's **appearance** — colour, glyph, name — is edited in place, and
stands in for the editor's title. `GroupSlotIdentifiers` is the counterpart of
`LoadoutTitle` for a snapshot, and deliberately much shorter: the latter carries
the whole apparatus of a send to Bungie (draft, queueing, waiting for the
outcome, retry) because `UpdateLoadoutIdentifiers` writes the three values as one
and can fail. Here nothing is sent — the choice goes to local storage and applies
on click, so there is no draft to gather and no refusal to show. The choice grid
itself is the same: `IdentifierPicker`, lifted out of `LoadoutTitle` to be
shared. Without this, a slot filled by hand kept the game's first choices and all
of them looked alike.

> **Filling a slot means giving it identifiers.** `isEmptyLoadout` reads the
> items **and** the three identifiers: a slot filled by hand while they still
> hold the `INVALID_HASH` sentinel is declared free — and it does not merely go
> without a tile, `useLoadoutItems` refuses to resolve its contents and the item
> just added is plainly invisible. `putItem` therefore lays down the first entry
> of each of the game's lists (the same rule as `useSnapshotLoadout`), and the
> editor **holds the gesture back** until those lists are read.

Three write paths reach one slot, and all three are the same `edit.ts` call:
overwriting the whole group copies the character's slots wholesale, clicking a
character slot copies that one into the selected group slot, and confirming an
equipment selection writes the items chosen for it.

#### Picking the items: the inventory view becomes a mode

"Pick the items" does not open a picker — it switches to the **inventory view in
selection mode**, where one item per equipment slot is chosen straight from the
grids that already show them: the character's slots, their per-slot inventory,
and the vault with its search. A modal picker had come first, and it asked, one
row at a time, for what that view shows at a glance.

`ItemIcon` is where the switch is written, once: it is the single gate every
inventory tile goes through. While a selection runs, a click **holds** the item
instead of opening its tooltip, the drag handle is off (a threshold would have
turned that click into a drop-zone gesture), and double-click no longer equips —
one designates what a group will wear, not what to equip now.

The state is a **store, not a context**, and that is a cost question: `ItemIcon`
is mounted a thousand times for a vault, and a context would redraw every one of
those tiles on each click. With one narrow selector per tile, only the tiles a
choice concerns redraw. Nothing is persisted either — it is a gesture, not a
setting.

The inventory mode is **overridden, not written**: `viewMode` is forced while the
selection runs, so the user's preference is untouched — nothing reaches the
cookie — and ending the selection returns them to the tab they were on. The bar
takes the place of the view-mode tabs, its two buttons being the only way out, so
no half-made selection is left behind a tab change. The **Tab** shortcut stands
down for the same reason.

> **Confirming replaces the slot's items, and keeps the perks already recorded.**
> The selection starts seeded from what the slot holds, so an item missing from
> the result was deliberately taken out. But an item the slot already carried
> keeps its snapshot, hand-edited perks included; only a newcomer gets the plugs
> it wears right now. Re-snapshotting everyone would have wiped, without a word,
> the work done in the perk editor. See `setItems`.

Two refusals bound what can be held, and they are the ones the old modal
filtered on: anything that does not equip (the slot comes from the **definition**,
`inventory.bucketTypeHash`, not from the component — which reads as the vault for
anything stored, and would refuse the whole vault), and anything belonging to
another class. Both are `pickableBucket`; a refused tile is dimmed and inert,
since letting the cursor promise a click that does nothing is a trap.

A third refusal joins them: **anything bound to another character**. An artifact
does not transfer, so another character's would never equip here. Filtering by
class did not cover it — an artifact has no `classType`, and two characters of
the *same* class each have their own. The criterion is the definition's
`nonTransferrable`, which is exact (subclasses and artifacts, see the header of
`moves.ts`), and the set is computed when the selection opens, where the profile
is at hand: `ItemIcon` only knows an item's hash and instance, never who holds
it. See `foreignItems`.

> **A held tile is marked by an `outline`, and by a `drop-shadow` on subclasses.**
> `.item` declares no border width, so `border-color` alone paints nothing — and
> an `outline` displaces nothing, which matters in a virtualised vault whose row
> heights are computed. But a subclass tile is cut to a diamond or a disc by
> `clip-path`, and `clip-path` clips everything the element paints, outline
> included — the same trap already paid for the border. The mark therefore
> follows the cut, through a stack of drop-shadows, and is declared after
> `--pinned` so the state being manipulated wins.

#### Editing a snapshot's perks

The socket picker is the **same** component as the one on a worn item, down to
its search and the order of its grid. Three things separate the two regimes, and
they are the whole of the seam:

- `SocketPickerValue.onPick` diverts the choice. Absent, it falls through to the
  real insertion and the action queue; present, the hash is written into the
  snapshot instead and nothing reaches Bungie. **Every write goes through
  `usePlugWriter`**, which is the whole point of that hook — see the warning
  below.
- `buildColumns` reads the plug in place **on the item** (`detail.sockets`) —
  right for a worn item, exactly wrong for a snapshot. The `options`, though,
  stay the item's: a snapshot holding an unequippable plug would be refused the
  day the group is equipped.
- the action queue is ignored. A real insertion running on the same item has
  nothing to do with the snapshot being edited, and must not come and dress it
  up.

Two surfaces need all three, and that decides how they get them:
`SnapshotEditProvider` is a **context**, not a prop. The perk rows of a row
(`EquipmentPlugs`) could have taken a prop; the item's **tooltip** could not — it
is the only place where **cosmetics** are changed, and it is mounted in a
`FloatingPortal`. A React portal stays in the React tree, so the tooltip reads
the very context the row that opened it sits in. A context is affordable here
precisely because it wraps one group editor — a dozen tiles, not the vault's
thousand, which is why the *selection* next door is a store instead.

> **The editor's locks come from the snapshot, not from the item.**
> `ItemDetail.disabledSockets` describes the item as it stands: a subclass with
> no aspect equipped has all six of its fragment sockets locked — and
> `SubclassSockets` does not merely grey those out, it hides them. A snapshot
> carrying two aspects therefore showed no fragments at all. `useSnapshotLocks`
> recomputes them from the snapshot instead, and the socket-picker context
> carries the result so there is a single source: `PerkColumns` and
> `SubclassSockets` both read `disabled` from it rather than from `detail`.
>
> The manifest says exactly how many slots an aspect opens: its
> `plug.energyCapacity.capacityValue`, 2 or 3, while each fragment costs 1
> (`plug.energyCost.energyCost`) — the same mechanism as armour energy under
> other names. The figures corroborate each other: two aspects at 3 make six,
> precisely the number of fragment sockets all eighteen subclasses carry. The
> **empty** aspect socket has no `energyCapacity` at all, which is what locks the
> fragments. The calculation is `lockedFragmentSockets`, pure and verified.

In the tooltip the override has **one** touch point, and that is what makes the
graft tenable: `buildColumns`, every row and the picker all read the plug in
place from `detail.sockets`. Substituting that one array with the snapshot's
makes the whole tree read the snapshot at once, instead of one exemption per
consumer. The rest of the detail — stats, energy, hidden sockets — stays the
item's: it is the item that carries the snapshot. The substituted array comes
from `savedSockets`, the same merge as display: the `INVALID_HASH` sentinel marks
a socket that was never recorded **and** a single-choice socket, and in both
cases the item's current value stands.

> **The weapon perk columns do not go through the floating picker**, and that is
> where this went wrong twice. A weapon perk offers two or three choices that fit
> side by side, so `PerkColumns` renders them inline — with its own insertion
> call. Each of the three writing surfaces (the picker grid, an artifact's reset
> button, those columns) had to remember to consult `onPick` first, and two
> forgot in turn: editing a group snapshot really did reach Bungie from there,
> while mods, shaders and ornaments — which *do* go through the picker — were
> correctly diverted. The rule now lives in one place, `usePlugWriter`, and
> `useInsertPlanner` has exactly one call site: it can no longer be reached
> without passing the snapshot check. `usePlugQueueState` does the same for the
> pending/refusal state, for descendants of the provider — a component that
> provides the context itself would read its parent's, not its own.

> **A tile inside the editor equips nothing.** `ItemIcon` drops its equipping
> gestures there: no drag (the groups mode has its own `DragScope`, disabled and
> prefixed — mounting the same equipped items in a third place would otherwise
> have them fight over one `draggableNodes` entry), and no double-click equip.
> One designates what a group will wear, not what to equip now. The removal
> button is likewise a **`−` in the corner** and not a full-size layer: a layer
> swallowed the click as soon as it was hovered, and the tile itself has to stay
> clickable.

An item enters the snapshot with its **current** plugs, the way the game does
when it saves a slot. That is what equipping the group will replay, and what the
perk editor then changes.

The tiles are `LoadoutSlotTile`, shared with the character panel — same object,
same coloured background and same glyph, `.loadout-slot`. It renders a fragment
rather than an element: the panel makes a clickable `<button>` of it, the group
card an inert cell. Identifiers are **passed in**, never read there: resolving
them per tile would mean one Dexie query per cell, hundreds for a page of cards.
A single grouped `useLoadoutIdentifiers` covers the whole page.

### Sharing a group or a loadout

A group card and the group editor both offer a **Share** button — the editor
offers two, one for the whole group and one for the selected slot. Either one
deposits a snapshot and hands back a link to a public page:

    /group/<id>/<name>      /loadout/<id>/<name>

The `<id>` is 9 random bytes in base64url. It is the only thing protecting the
link: the page takes no session, and anyone holding the address sees it. The
second segment is the name at the time of sharing, there so the link reads;
nothing reads it back.

**A share cannot be a reference to the group.** A `DestinyLoadout` only names
its items by `itemInstanceId`, and an instance resolves only against the profile
that holds it — a visitor's profile would resolve none of them, and the page
would show ten empty rows. `lib/loadouts/share/snapshot.ts` therefore resolves
every item at deposit time: its `itemHash`, the bucket it **equips** into (from
the definition, not from the component, which says "vault" for a stored item),
its state, and the perks the loadout recorded — run through `savedSockets`, so
the single-choice sockets the game never writes keep their real plug. The
`ItemDetail` of each item travels with it, shared across slots. That is also
what **freezes** the share: the group may change afterwards, or be deleted, the
link keeps showing what was shared.

The public page (`components/share/SharedLoadoutView.tsx`) needs nothing but
that snapshot and the **manifest**, which is public. It reuses the group
editor's layout under the name `.group-preview` — same view, stripped of
everything that writes — and the two blocks are declared together in
`group-edit.scss` rather than copied, which the CSS check would flag anyway.

Snapshots live in their own table (`SharedLoadout`), tied to their author only
so that deleting an account takes its shares with it; the page never reads that
column. `POST /api/shares` validates the body entry by entry, like the groups
route: a public page has no session to paper over a malformed snapshot.

#### Importing a share

A share becomes one of your own groups from the groups view (**Import**, paste
the link) or from the public page, whose button — shown to a signed-in visitor
instead of the sign-in one — leads to `/?import=<kind>/<id>`. The groups view
reads that parameter, opens its import dialog and strips it from the address.
The dialog fetches the snapshot from `GET /api/shares/<id>?kind=…`, public like
the page.

The whole problem is the sharing one, reversed: the author's instances do not
exist in the importing account. `lib/loadouts/share/import.ts` (pure, checked)
maps each shared **instance** — once, not per slot, since one weapon serving
several slots must stay one weapon:

| Shared item | Candidates |
|---|---|
| Its instance is in the account | Kept as is, no choice (the author importing their own share) |
| Legendary armor | Same slot and class, any piece from one of the sets worn in its slots |
| Anything else (weapons, exotics, subclass) | Same `itemHash` |

A subclass never leaves its character, so only the target character's counts.
The group goes to a character of the share's class, read off its subclass or
armor; a single loadout becomes a group whose first slot is filled. Defaults pick
the same hash, then the same set, then the highest power, and two rolls of one
weapon get two distinct copies when the account has them.

The recorded perks describe the author's item, so a copy keeps only those that
make sense on it — otherwise the equip step fails and takes the whole slot with
it. Dropped: masterworks and mementos (they cost materials), perks outside the
copy's own roll unless an enhanced version is there (`upgradedPlug`), sockets
whose `plugSources` open no inventory or plug set (armor archetype and stats),
and sockets laid out differently — measured on the manifest, 6 set armor pieces
out of 168 per slot do not share the others' socket layout.

### Renaming and recolouring a loadout

The title of a selected slot is `3 - Solar`, with the loadout's tile under it.
That tile is composite — Bungie ships the coloured background and the glyph as
two separate images, never assembled. Here they are stacked, and **hovering pulls
them apart**: each then becomes its own target with its own grid of choices. The
name is a `<select>` stripped of its chrome, which only announces itself on
hover.

Editing is **explicit**: one button opens it, the choices pile up in a local
draft, a second one sends them. The preview follows the draft, which means the
draft's hashes have to be resolved against the manifest too — reading only the
saved ones left a freshly picked glyph invisible until Bungie had accepted it.
Nothing leaves before that, and everything
leaves in **one request** — `UpdateLoadoutIdentifiers` writes the three values as
a block, so a request per click would have been both chatty and ambiguous, each
one having to resend the other two anyway. The draft only closes on success; a
refusal leaves the choices on screen. Outside editing the name is plain text and
the tile is just an image — a disabled control in a title would only be a dead
target. The order the choices come in is not a hash sort — it comes from the `loadoutColorHashes` /
`loadoutIconHashes` / `loadoutNameHashes` lists of
`DestinyLoadoutConstantsDefinition` (a single entry, hash 1).

> **A table or field missing from a client's cache is silent**: every read of
> it returns `undefined`, for ever, and the interface just shows nothing. This
> used to hinge on bumping `MANIFEST_SCHEMA_VERSION` by hand; it is now a hash of
> the tables and their projection (see "Slimmed tables"). `ensureManifest` also
> throws when a requested table has no URL or comes back empty.

### Keyboard shortcuts

| Key | Effect |
| --- | ------ |
| `Tab` | switch display mode |
| `Esc` | deselect the current loadout slot |
| `R` | refresh |
| `Shift`+`R` | force a refresh from the API — same as a 1 s press on the button |
| `F1` | open the settings |

`lib/ui/use-global-shortcut.ts` holds what they share, and one point of it is not
obvious: the listener is registered in the **capture** phase. The search bar puts
its own `keydown` on `document` to grab focus as soon as a letter is typed
anywhere (see SearchBar), and between two listeners of the same phase the order
is the mount order — `R` would have landed in the search field. In capture, the
shortcut runs first and its `preventDefault` makes the other give up, since that
one tests `defaultPrevented` before anything else. The usual guards apply on top:
a text field or a modal keeps its keys.

The two refreshes do not do the same thing. A **normal** one goes through the
stale-snapshot guard: a response that does not yet reflect our writes is
discarded and the local state, which is faithful, is kept. A **forced** one
drops that guard first (`clearLocalWrites`), so Bungie's answer becomes
authoritative whatever it holds. That is what is needed when the game moved in
parallel, or when the guard got it wrong — it cannot tell "Bungie is lagging"
from "the player touched the same item in game".

### Character stats

The figures under the equipment come straight from component 200
(`character.stats`): Bungie has already totalled armour, mods and equipped
fragments. Recomputing them client-side would be wrong — conditional bonuses are
not reproducible. Their icons come from `DestinyStatDefinition`.

Only the six armour stats are kept, in the game's order. `character.stats` holds
a seventh — Power — which has no place in this bar: it is already on the
character tab. Filtering on `ARMOR_STAT_ORDER` drops it without naming its hash,
and will drop whatever Bungie adds beside it.

## Game symbol fonts

`public/fonts/destiny_symbols_common.otf` and `destiny_symbols_pc.otf` are the
game's own symbol fonts — weapon types, elements, abilities, controller buttons,
keyboard and mouse. Both declare the same CSS family (their code point ranges
are disjoint), so a symbol is inserted by writing its character.

Bungie never published the name ↔ code point table, but it is in the font, in
the CFF charset. `scripts/extract-destiny-symbols.mjs` reads it and writes
`src/lib/destiny/symbols.generated.ts` (389 glyphs) — run it again if the font
files are ever replaced. It depends on nothing: fontTools cannot be installed in
the container, and a npm package for one run would be disproportionate.

**Some symbols only exist in pieces.** The left click is a mouse body
(`mouse1`) with the lit button (`mouse1_button`) laid over it; a keyboard key is
a backing (`standard_backing`) under a legend. The pieces are recognisable
without any guesswork: their advance width is **zero**, which is how the
extractor flags them (`DESTINY_OVERLAY_GLYPHS`).

`src/lib/destiny/symbols.ts` names the useful compositions (`mouseLeft`,
`wheelUp`, `keySymbol("E")`…) and `<DestinySymbol name="mouseLeft" />` draws
them, one span per layer. The font could stack them on its own — a zero advance
does exactly that — but the whole symbol would then take a single colour; with
one span per layer the accent layer (a pressed button) can be tinted through
`--destiny-symbol-accent`. `destinySymbolText()` makes the other choice, for
plain strings such as an `aria-label`; there the zero-advance layers must be
emitted **first**, since the pen does not move after them.

## Item search

The query language is **Destiny Item Manager's**, minus what is specific to it
(tags, wishlists, notes, loadouts). `src/lib/search/` holds it, and the split
mirrors `sort.ts` / `grouping.ts`: pure modules first, React last.

| File | Role |
|---|---|
| `query.ts` | lexer + parser → syntax tree. Space = implicit AND, plus `and` / `or` / `not`, a leading `-`, parentheses and quotes |
| `keywords.ts` | the vocabulary: stat, damage, rarity, class, ammo, item-subtype, foundry and breaker names → hashes, enum values and trait ids |
| `filters.ts` | tree → predicate. `is:`, `stat:`, `basestat:`, `perkname:`, `power:`, `id:`… |
| `flags.ts` | the per-item flag masks the index computes and `filters.ts` reads. A module of its own so the latter stays pure |
| `index-build.ts` | batched manifest reads: names of equipped plugs, stat deltas of mods, and everything an item only says through its plugs |
| `loadout-index.ts` | where each item sits in the in-game loadouts. No manifest read: a loadout names its items by instance only |
| `suggestions.ts` | autocompletion: the term under the caret → ranked completions |
| `provider.tsx` | the only React part: debounce, evaluation over the whole profile, result set |

A handful of decisions carry the rest.

**A faulty query filters nothing.** An unknown keyword or an incomplete
comparison (`stat:range:>=`) marks the query invalid — the bar turns red and the
view stays as it was. Filtering on the part that parsed would empty the screen
at every keystroke while typing `stat:ran`.

**An apostrophe only quotes when it opens a segment.** Both `"` and `'` delimit
a quoted segment, so `id:'6917…'` works — but `frenzy's` and `l'ordre` must stay
plain words. The rule is positional: a quote character is a delimiter only when
the segment is still empty. Operators are matched case-insensitively, so `OR`
reads like `or`.

**The vocabulary is English, and hard-coded.** DIM's syntax is English, and the
manifest is downloaded in the player's language: mapping `range` to a hash
through a translated table would make queries locale-dependent. The same rule
decides what a filter may be built on — a plug is recognised by its
`plugCategoryIdentifier` (`shader`, `origins`, `armor_archetypes`…) and a
foundry by its `traitIds` (`foundry.hakke`), never by a displayed name. It is
also why `is:adept` is missing: nothing in the manifest tells an Adept weapon
apart other than the `(Adept)` in its translated name.

**What is absent, and why.** `source:`, `season:` and `year:` would need the
season-watermark table DIM keeps by hand; `catalyst:`, `is:craftable` and
`is:patternunlocked` need the account's records; `is:vendor`, `maxstat*` and
`is:maxpower` belong to a loadout optimiser this app does not have. None of that
data is fetched, so the keywords are refused rather than answered wrongly.

**"Base stat" means before the mod sockets.** Checked against the manifest
(version 244213): on Edge of Fate armour, mods, masterwork *and* tuning all sit
in ARMOR MODS sockets, while the base stat rolls are `armor_stats` plugs in
ARMOR PERKS; on weapons, masterwork and mods are in WEAPON MODS while barrels
and magazines are in WEAPON PERKS. One rule covers both, and it needs no
plug-category allowlist to keep up to date.

**Everything an item only says through its plugs goes through the index.** A mod
that was actually fitted, a shader, an ornament, an artifice slot, a tuning mod,
an armour archetype, an origin trait, Deepsight, the anti-champion effect, the
masterworked stat, the kill tracker, the crafted level: none of these are on the
item definition, they are all read from the equipped plugs. `index-build.ts`
resolves them once per item into a `SEARCH_FLAG` mask plus a few values, so that
`filters.ts` stays a set of one-line predicates.

That index costs a few thousand definitions, so it is **not** built by
`ItemDefsProvider`: only a query that reads it (free text, `perkname:`,
`basestat:`, `is:modded`, `breaker:`…) triggers it, and nothing is filtered
until it lands.

Evaluation produces a `Set` of instance ids, once per query, over the entire
profile. The vault and the postmaster then either drop the misses or dim them
(a setting); a character's inventory and equipped items only ever dim — an item
must not vanish from the slot the player is looking at.

The bar itself lives in the header, outside the tree where the manifest and the
profile are loaded. It therefore knows nothing: the query goes down through a
Zustand store, and what is known about the results — how many were found, where
they can be sent — comes back up the same way (`SearchActionsBridge`). The match
count also feeds each character tab, which reports how many of the items found
sit on that character.

**Loadout membership is counted twice, on purpose.** A character's loadout
slots come back from the API with the empty ones in place, and the panel draws
them that way (`Emplacement n°3` may well be free). Two numbers therefore
address the same loadout: its `rank` among the saved ones, which is what one
counts when reading the panel, and its `slot` in the API's list. `loadout:` and
`loadoutall:` compare the first, `loadoutslot:` and `loadoutslotall:` the
second; on a character whose slots read `[free] [Alpha] [free] [Beta]`, Beta is
`loadout:2` and `loadoutslot:4`. The `all` suffix widens the search from the
displayed character to every one of them, and `is:inloadout` drops the numbers
altogether. All four take a full comparison, so `loadout:>=2` works like
`tier:>=2`. Both numbers start at 1, as the panel does.

**Autocompletion completes the term under the caret**, not the end of the bar —
one often comes back to fix a filter in the middle of a query. Its vocabulary is
derived from the same tables the filters use (`IS_VALUES`, `STAT_KEYWORDS`…), so
what is offered and what is understood cannot drift apart. Keys follow DIM:
arrows to move, Tab to insert, Enter to take the highlighted entry or else to
apply the query, Escape to close. A completion still awaiting a value (`stat:`,
`power:>=`) keeps the caret glued to it; a complete one gets the trailing space
that chains a second filter. A leading `-` negates the term, so it is stripped
before matching and put back on insertion — `-exo` offers `-is:exotic`. History
stays out of a negated term: it replaces the whole bar, which would drop the `-`
that was just typed.

The search history goes to **localStorage**, not to the preferences cookie,
which is capped at 4 KB and shared.

> Everything the bar draws from the store is gated behind `useHydrated()`: the
> server can only ever render an empty bar, and the client's first render has to
> match it. Without that gate React reports a hydration mismatch as soon as a
> hot reload re-hydrates a page whose store is already filled. It is a
> `useSyncExternalStore` and not a `setState` in an effect — the latter is what
> guarantees the *server* snapshot during hydration, and the repo's lint refuses
> the other form anyway.

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

> **Scope**: only server-side calls go through this proxy — manifest tables
> included, since the server relays them.

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

### Five icon sizes

Five independent sizes, each carried by its own CSS variable on `<html>`. The
first four are bounded to `ICON_SIZE`, the plug one to `PLUG_SIZE`:

| Variable | Setting | Where it applies |
| --- | --- | --- |
| `--item-size` | *Icon size* | equipped items and inventory of the displayed character, `single` layout |
| `--columns-item-size` | *Column icon size* | the same, in the `characters` layout — `.character-columns` redefines `--item-size` from it, as does the drop-zone layer that covers them |
| `--vault-item-size` | *Vault icon size* | vault and postmaster — `.inventory__storage` redefines `--item-size` from it for its whole subtree |
| `--loadout-item-size` | *Loadout slot size* | loadout slot tiles (`.loadout-slot`, the group grids), i.e. the *loadouts* and *groups* views |
| `--plug-size` | *Perk and mod size* | every `PlugIcon`, round or square, plus what is measured against it: the socket picker grid and the tooltip skeletons |

Plugs have their own bounds because they are not items: they live in the perk
columns and in the socket picker, whose six-column grid is computed from
`--plug-size`. The SCSS keeps `$plug-size` only as the `var()` fallback, for the
first paint of a client with no cookie. `.loadout-identifiers` deliberately
resets `--plug-size` to that fallback: it borrows the picker's chrome but its
choices are manifest images, not plugs, and letting them drift would break the
grid they sit in.

The two inventory layouts are sized apart for the same kind of reason: three
columns live in the width one used to take, so the size that suits one is too
large for the other. Everything else stays shared — vault, loadout slots and
plugs do not change with the layout.

Loadout slots used to follow the vault size, which conflated two different
things: a slot shows a game slot (background + glyph), not an item, and its
legibility has nothing to do with a vault grid's density.

The *Appearance* tab shows a preview row (`SizePreview`) under the sliders, with
items drawn at random from the profile, a real loadout slot, and one round plus
one square plug, so each size is judged on what it actually renders. The two plug
shapes come from the character's equipped gear through `useEquippedPlugs` — it is
the plug definition that decides the shape (`PlugChip.square`), and hard-coded
hashes would have gone stale in silence. The profile is read from the
React Query cache (`getQueryData(["profile"])`), never through `useProfile`: a
preview must not trigger a Bungie call. The draw is frozen on mount — renewing it
on every keystroke in a size field would make the row flicker.

### Account sync

The *Account* settings tab can mirror those preferences onto the server
(`UserSettings`, one row per user, the same shape as the cookie). Once on, the
**database wins**: `readPreferences()` reads the row first and only falls back to
the cookie when there is none, when sync is off, or when the query fails. The
cookie stays written all the same — it is what lets the server paint the right
theme without waiting.

The switch itself is `User.syncEnabled`, **on by default**: a fresh account syncs
without being asked. It sits on `User` and not on `UserSettings` because it has to
mean something before anything has been deposited — a missing row used to be read
as "sync off", which left no way to default it on. It therefore comes down to the
client separately from the state (`serverSync` on `SettingsSync`), and the
database is what settles it: the cookie of a device that has never synced still
says the opposite. For the same reason *Delete sync data* now lowers the flag
explicitly instead of relying on the row's absence.

A brand-new account syncs but has deposited nothing, so `SettingsSync` pushes its
state once on load in that exact case (sync on, no `serverState`) — otherwise the
database would stay empty until the first preference change, and a second device
would find nothing to read.

Turning sync **on** is the one moment the direction reverses: the device the user
just acted on becomes the source, and its state — preferences and loadout groups
alike — is written to the database at once, overwriting whatever was there.
Pulling instead would clobber that device with a backup it may never have
deposited; on a first activation the groups route answers with an empty list,
which would wipe them outright. `LoadoutGroupsSync` therefore skips its pull on
that very transition.

`SettingsSync` bridges the two. Downwards, it forces the server state into the
store *during render* rather than in an effect: the HTML was already produced
with it, and an effect would let `SettingsEffects` apply the cookie's theme first
for one frame. Upwards, it pushes every change back, debounced. The two gestures
that turn sync off — the toggle and *Delete sync data* — write on their own from
`sync-client.ts`, whose timer sits at module level so they can cancel a pending
push: otherwise it would recreate the row just deleted.

### Export & import

The *Account* tab also offers the offline counterpart of sync: settings and
loadout groups go out as a JSON file, and come back from one. Where sync leaves
the state on the server, this hands it back to its owner — in a form they can
read, keep and reload elsewhere. `lib/settings/backup.ts` is the pure module
behind it, and it is verified (`scripts/checks/backup.check.ts`).

Settings travel in their **persisted** shape, the cookie's and the database's:
the same format reads back from all three, and `mergeSettings` already knows how
to drop what it does not recognise — so a file from an older version loads
without a migration. Groups, by contrast, are validated entry by entry, the same
reasoning as `/api/loadout-groups`: an unknown setting degrades to a default, an
unreadable group gets equipped.

> **Each half is read on its own.** A file holding only groups is perfectly
> valid, and so is one holding only settings — refusing the first because the
> second is missing would have made the import useless the moment you export
> from an account with no groups. Only a file holding neither is rejected. The
> version number is written for identification and never gates the read:
> refusing a whole file over a number is the worst service to render to someone
> who has just lost everything.

Importing **replaces**, it does not merge: merging two sets of groups would mean
resolving id conflicts, and nothing says which to keep. Hence the confirmation,
which names what is about to be overwritten.

## Project structure

```
src/
  app/[locale]/      Pages (i18n routing: "/" = FR, "/en" = EN)
  app/api/           Server routes (auth, manifest, profile, item, loadouts,
                     loadout-groups, shares, health)
  proxy.ts           i18n routing middleware (named "proxy" since Next 16)
  i18n/              next-intl configuration (routing + request)
  lib/
    auth/            Session (signed cookie) + valid Bungie token
    bungie/          Bungie API wrapper (OAuth, profile, items)
    db/              Prisma client
    destiny/         Game constants, types, socket logic
    loadouts/        In-game saved loadouts (contract + write actions)
    loadouts/groups/ Loadout groups (pure edit & equip engines, store, sync)
    loadouts/share/  Public shares (self-contained snapshot, contract, reading)
    manifest/        Manifest download & cache (IndexedDB), server relay and projection
    settings/        User preferences (cookie-backed store)
  components/        UI components
  scss/              Styles (see "Styles")
  generated/prisma/  Generated Prisma client — untracked, see "Prisma client"
scripts/checks/     Runnable checks for the pure engines — see "Verifying your work"
prisma/schema.prisma Server data model
prisma.config.ts     Prisma CLI config (connection URL since v7)
messages/            EN / FR translations
```

---

