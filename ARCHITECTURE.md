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

## Unlocked plugs (plug sets)

What can be slotted into a mod, shader, ornament, aspect, fragment or artifact
socket is **not** on the item. The manifest only gives the game-wide pool (712
shaders, 82 leg mods…); what the player actually owns lives in
`profilePlugSets` / `characterPlugSets`, two components that ship with
`ItemSockets` (305) — already requested, so they cost no extra call. They were
simply thrown away until the socket picker needed them.

`src/lib/bungie/plug-sets.ts` trims them to `{ plugSetHash: [plugItemHash] }`,
keeping only plugs whose `canInsert` is true — which is exactly what the picker
may offer, and what makes the payload bearable:

| Plug sets in `/api/profile` | Size |
|---|---|
| Raw components | ~870 KB |
| After trimming (10646 / 12934 plugs kept, 1469 sets) | ~133 KB |

**Which source feeds which socket is declared, not guessed**: the socket
entry's `plugSources` bitmask (`SocketPlugSources`, mirrored as `PLUG_SOURCE` in
`lib/destiny/sockets.ts`) says whether options come from the instance
(`reusablePlugs`, component 310) or from the profile / character plug sets.
Measured values: weapon perks `0`, weapon mods and cosmetics `7`, armor mods
`13`, armor ornaments `15`, artifact perks and subclass aspects / fragments `4`.
Reading plug sets for a weapon perk would show the manifest pool instead of the
weapon's actual roll — hence the flags rather than a uniform rule.

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
each character, plus the vault. They overlay rather than insert themselves: the
layout does not shift at the moment the user is aiming. Each zone asks the
planner whether it is reachable, and a zone that is not stays visible, disabled,
carrying its reason.

They are three layers, all **direct children** of `.inventory-view__body`: an
absolutely-positioned child of a grid that is given a grid position takes that
**grid area** as its containing block. The vault layer therefore matches the
`.inventory-view__storage` column exactly, with nothing to measure and no
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

The equipment page has two modes, switched by the buttons next to the character
tabs or by the **Tab** key. The mode lives in the preferences cookie
(`viewMode`), so it survives a reload — see `lib/settings/constants.ts`.

- **Inventory** — the historical view: two columns of slots with their
  per-slot inventory, and the vault on the right. This is where items move.
- **Loadouts** — one row per slot, the equipped item's perks, mods and
  abilities laid out beside it, and the character's saved loadouts on the right.

**Both modes stay mounted**, stacked in the same grid cell: switching is then a
plain cross-fade, and nothing has to be rebuilt — not the virtualised vault, not
the definitions already read. The hidden one is taken out of the flow
(`position: absolute`, or the cell would keep the height of the taller of the
two) and marked `inert`, which an opacity alone would not do.

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

> **Adding a manifest table means bumping `MANIFEST_SCHEMA_VERSION`.** Skip it
> and clients that already cached the previous version never fetch the new
> table — every read of it returns `undefined`, for ever, and the interface just
> shows nothing. `ensureManifest` now throws when a requested table has no path
> in the manifest or comes back empty, so the next such mistake is loud instead
> of silent.

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
  app/api/           Server routes (auth, manifest, profile, item, loadouts, health)
  proxy.ts           i18n routing middleware (named "proxy" since Next 16)
  i18n/              next-intl configuration (routing + request)
  lib/
    auth/            Session (signed cookie) + valid Bungie token
    bungie/          Bungie API wrapper (OAuth, profile, items)
    db/              Prisma client
    destiny/         Game constants, types, socket logic
    loadouts/        In-game saved loadouts (contract + write actions)
    manifest/        Manifest download & cache (IndexedDB)
    settings/        User preferences (cookie-backed store)
  components/        UI components
  scss/              Styles (see "Styles")
  generated/prisma/  Generated Prisma client — untracked, see "Prisma client"
prisma/schema.prisma Server data model
prisma.config.ts     Prisma CLI config (connection URL since v7)
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

## Client Prisma

Depuis Prisma 7, le client n'est **plus généré dans `node_modules`**. L'`output`
du générateur `prisma-client` l'envoie dans `src/generated/prisma`, que le
`.gitignore` exclut. Un `npm install` tout neuf ne suffit donc pas : le projet
ne compile pas tant que `prisma generate` n'a pas tourné.

Le conteneur de dev le lance à chaque démarrage (`CMD` du `Dockerfile`), si bien
que le manque ne se voit qu'en dehors de ce chemin — un clone, un `node_modules`
effacé, ou un outil lancé directement depuis l'hôte :

```bash
docker compose exec app npx --no-install prisma generate
```

Conserver le `--no-install` : sans lui, un `prisma` absent de `node_modules`
fait télécharger `prisma@latest` par npx **et réécrire `package-lock.json`** au
passage — c'est ainsi que le lock s'est retrouvé commité en Prisma 7 face à un
`package.json` en `^5`, état dans lequel `npm ci` refuse de tourner.

Deux autres conséquences de la v7 à connaître : l'URL de connexion vit dans
`prisma.config.ts` et non plus dans le schéma (qui la rejette, erreur P1012) ;
et tout accès passe par l'adaptateur de pilote `@prisma/adapter-pg`, le moteur
Rust ayant disparu.

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

## Plugs débloqués (plug sets)

Ce qui peut être inséré dans un emplacement de mod, de revêtement, d'ornement,
d'aspect, de fragment ou d'attribut d'artéfact ne se lit **pas** sur l'objet. Le
manifeste ne donne que le pool du jeu (712 revêtements, 82 mods de jambes…) ; ce
que le joueur possède réellement vit dans `profilePlugSets` /
`characterPlugSets`, deux composants livrés avec `ItemSockets` (305) — déjà
demandé, ils ne coûtent donc aucune requête de plus. Ils étaient simplement
jetés jusqu'à ce que le sélecteur de socket en ait besoin.

`src/lib/bungie/plug-sets.ts` les élague en `{ hashPlugSet: [hashPlug] }`, en ne
gardant que les plugs dont `canInsert` est vrai — exactement ce que le sélecteur
peut proposer, et ce qui rend la réponse supportable :

| Plug sets dans `/api/profile` | Poids |
|---|---|
| Composants bruts | ~870 Ko |
| Après élagage (10646 / 12934 plugs gardés, 1469 sets) | ~133 Ko |

**Quelle source alimente quel socket est déclaré, pas deviné** : le masque
`plugSources` de l'entrée de socket (`SocketPlugSources`, repris dans
`PLUG_SOURCE` de `lib/destiny/sockets.ts`) dit si les options viennent de
l'instance (`reusablePlugs`, composant 310) ou des plug sets du compte / du
personnage. Valeurs relevées : attributs d'arme `0`, mods et cosmétiques d'arme
`7`, mods d'armure `13`, ornements d'armure `15`, attributs d'artéfact et
aspects / fragments de doctrine `4`. Lire les plug sets pour un attribut d'arme
afficherait le pool du manifeste à la place du tirage réel de l'arme — d'où les
drapeaux plutôt qu'une règle uniforme.

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

Les Objets perdus partagent cette zone de défilement : `VirtualItemGrid` reçoit
une section `lead` (construite par `usePostmasterSection`) rendue **avant** le
coffre et au même rang que lui, pour que la colonne de stockage n'ait qu'un seul
ascenseur et que le coffre prenne toute la hauteur. Ses objets ne sont ni triés
ni regroupés — ils sont peu nombreux, et leur ordre est celui du Courrier. La
section disparaît quand une recherche n'en retient aucun.

### Regroupement

Le coffre est **toujours** découpé en sections par emplacement d'origine
(cinétique, casque…) — `item.bucketHash` y vaut « Coffre » pour tout le monde,
l'emplacement se lit donc dans `definition.inventory.bucketTypeHash`. Dans une
section, un seul sous-groupe à la fois, choisi dans les paramètres : type de
munitions (par défaut), type d'arme ou type de dégâts pour les armes ; classe
(par défaut), bonus d'ensemble ou archétype pour les armures.

`lib/destiny/grouping.ts` est pur, comme `sort.ts` : il reçoit des définitions et
des libellés déjà résolus et renvoie des sections. Les deux mécanismes se
composent — le tri s'applique d'abord à toute la liste, le regroupement ne fait
que la redistribuer. C'est pourquoi « Emplacement » n'est plus un critère de
tri : les sections le portent déjà.

Les en-têtes sont des **lignes du même virtualiseur** que les objets : c'est la
seule façon de les faire défiler avec le contenu sans monter les milliers de
vignettes que la virtualisation sert précisément à éviter. Trois niveaux, tous
rendus par `GroupHeader` : `root` (Objets perdus, Coffre), `section`
(emplacement d'origine), `group` (sous-groupe) ; le retrait croît avec la
profondeur. Leur hauteur vient donc du CSS elle aussi
(`--inventory-header-height`, `--group-section-height`,
`--group-header-height`), lue par `useGridMetrics()`. Les en-têtes se replient,
mais cet état n'est délibérément **pas** mémorisé : le cookie de préférences est
plafonné à 4 Ko et partagé.

Les icônes d'en-tête sont **décrites, pas montées** : `grouping.ts` produit un
descripteur `GroupIcon` (`ammo`, `weaponType`, `class`, `vault`, `postmaster`,
`image`) et `GroupHeader` l'aiguille vers un composant de `components/icons/`.
Les icônes locales sont des SVG intégrés : les symboles monochromes, dessinés en
`currentColor`, héritent donc directement de la couleur du texte ; seules les
illustrations du manifeste restent des `<img>`, une image hébergée sur
bungie.net ne pouvant pas être intégrée au document. Le SVG intégré a remplacé
les masques CSS qu'imposaient les fichiers locaux tant qu'ils passaient par
`<img>`, qui les isole dans leur propre document — là où `currentColor` ne voit
jamais la page.

> Le conteneur de défilement ne rogne pas les infobulles : elles sont rendues
> dans un portail, hors de cet arbre DOM.
>
> ESLint signale `Compilation Skipped: Use of incompatible library` sur ce
> composant : le React Compiler ne sait pas mémoïser `useVirtualizer`.
> Avertissement attendu, sans effet sur le fonctionnement.

## Déplacer et équiper des objets

L'API n'expose que **trois** écritures — `TransferItem`, `EquipItem`,
`PullFromPostMaster` (`src/lib/bungie/actions.ts`) — et elles dessinent un
graphe sans raccourci :

```
Objets perdus ──PullFromPostMaster──▶ inventaire du personnage
inventaire du personnage ◀──TransferItem──▶ coffre
inventaire du personnage ◀──EquipItem──▶ objets équipés
```

Tout découle de ce que ce graphe **n'a pas** :

- **aucune arête entre deux personnages** — un passage de l'un à l'autre transite
  par le coffre ;
- **aucun « déséquiper »** — on libère un objet équipé en équipant un autre objet
  du même emplacement, d'où une requête de plus et une décision de plus (lequel
  prend sa place) ;
- **les Objets perdus ne se vident que vers leur propre personnage.**

Une arme équipée sur le personnage 1 et voulue sur le personnage 2 coûte donc
quatre requêtes : équiper un remplaçant sur 1, transférer au coffre, transférer
vers 2, équiper.

`src/lib/destiny/moves.ts` est le planificateur — pur, sans React, vérifiable
avec la recette « compiler puis exécuter » de `CLAUDE.md`. Il fait aussi
respecter les contraintes que l'API ne signalerait qu'après coup :

| Contrainte | Source |
|---|---|
| Doctrines et artéfacts ne quittent pas leur personnage | `nonTransferrable` |
| Les armures sont réservées à une classe | `classType` face à celle du personnage |
| 9 objets rangés par emplacement (6 pour l'artéfact), 1300 au coffre | `DestinyInventoryBucketDefinition.itemCount` |
| Certains retraits des Objets perdus détruisent quelque chose | `doesPostmasterPullHaveSideEffects` |
| Une arme **et** une pièce d'armure exotiques par personnage | `tierType` + la famille de l'emplacement |

Équiper un exotique alors qu'un autre de la même famille occupe un *autre*
emplacement coûte une étape de plus : celui en place est libéré d'abord, et son
remplaçant doit être non exotique — sinon le conflit ne ferait que se déplacer
d'un emplacement à l'autre. Un exotique déjà dans l'emplacement visé, lui, ne
demande rien : il est simplement remplacé.

Quand l'emplacement de destination est plein, le planificateur ajoute une étape
d'**éviction** (son objet le moins précieux part au coffre) plutôt que
d'échouer — c'est ce que fait le jeu. Les exotiques sont choisis en dernier comme
remplaçants ou comme évincés : en équiper un peut en faire sauter un autre, ce
que personne n'a demandé.

### File d'actions

`src/lib/actions/` porte la file (Zustand, **non** persistée : une action à
moitié envoyée qu'on rejouerait au rechargement partirait d'un état de compte
qui n'est plus celui de son plan). Elle envoie **une requête à la fois** : chaque
étape suppose que la précédente a abouti, et Bungie limite de toute façon le
débit des écritures sur un compte (`ThrottleSeconds` est respecté, avec deux
reprises).

Deux choix gardent l'interface vive :

- le plan est recalculé **juste avant l'exécution**, pas à la mise en file — les
  actions précédentes ont déplacé des objets entre-temps ;
- une étape réussie est rejouée sur le profil en cache (`applyStep`, ou une
  correction de socket pour une insertion) au lieu d'être rechargée. Le profil
  pèse ~1,6 Mo et une action coûte jusqu'à quatre étapes ; le vrai rechargement
  n'a lieu qu'une fois la file vidée.

Trois natures d'action partagent la file — déplacer un objet, équiper un
attribut, agir sur un emplacement d'équipement — et ce partage n'est pas une
commodité d'affichage : la limitation de débit que Bungie applique aux écritures
compte **toutes les routes ensemble**, si bien qu'un bouton qui postait
directement échappait à la sérialisation. Une action d'emplacement ne porte aucun
objet, seulement un emplacement numéroté : elle a donc sa propre base, et sa
carte montre la vignette de l'emplacement des deux côtés de la flèche. Ses
identifiants sont recopiés à la mise en file, ce qui lui permet de survivre à un
`clear` qui vide l'emplacement.

`lib/destiny/loadout-effects.ts` rejoue chacune d'elles localement, Bungie ne
disant rien de ce qu'il a changé :

| Action     | Effet local |
| ---------- | ----------- |
| `equip`    | voir ci-dessous — des objets bougent |
| `snapshot` | l'emplacement prend ce que le personnage porte, les sockets **courants** de chaque objet recopiés dans `plugItemHashes` (indexé par socket, ils s'y transfèrent tels quels) |
| `clear`    | l'emplacement redevient libre |
| `identifiers` | l'apparence de l'emplacement change, son contenu non |

`EquipLoadout` mérite son propre rejeu : Bungie
assemble l'équipement côté serveur et ne dit rien de ce qu'il a déplacé, l'effet
est donc simulé d'après les règles du jeu — un objet du coffre est transféré puis
équipé **s'il reste de la place dans l'emplacement**, un objet déjà sur le
personnage est simplement équipé, et un objet introuvable ou détenu par un
**autre personnage** ne peut pas être déplacé du tout. Les étapes sont confiées à
`applyStep`, celui-là même des déplacements : l'effet d'un transfert ou d'un
équipement sur le profil n'est donc écrit qu'une fois, et l'objet chassé de
l'emplacement y est déjà géré.

Les identifiants d'instance de l'ensemble sont recopiés dans l'action à la mise
en file, ce qui permet à `useItemBusy` de griser ces vignettes pendant toute
l'attente — Bungie n'annonce rien de ce qu'il va déplacer, et une requête d'une
seconde ne se voyait sinon nulle part. C'est cette recopie qui garde le sélecteur
booléen : les centaines de vignettes montées y sont abonnées, il ne peut pas
aller relire l'emplacement dans le profil. Seul un `equip` en porte ; changer
l'apparence d'un emplacement ne déplace rien.

`ErrorCode` est contrôlé dans `bungieFetch` : Bungie signale ses refus en
**HTTP 200**, un `EquipItem` rejeté ressemblait donc exactement à un succès.

#### Instantanés périmés
> **Rejouer une action localement n'est que la moitié du travail : la garde doit
> en être avertie aussi.** Les trois actions qui réécrivent un emplacement
> étaient bien corrigées dans le cache, puis revenaient en arrière une seconde
> plus tard — le rechargement de fin de file ramenait l'instantané antérieur de
> Bungie, et `isStaleProfile`, qui ne regardait que les objets, n'avait rien à y
> redire. D'où `markLocalLoadouts` et la troisième table. La signature d'un
> emplacement est ses trois identifiants et l'**ensemble trié** de ses vrais
> identifiants d'instance : l'API rend dix entrées dans son propre ordre, comblées
> par des « 0 », si bien que comparer la liste telle quelle n'aurait jamais
> concordé avec ce que le rejeu local a écrit et que la garde ne se serait jamais
> levée.



Ce rechargement final est le piège. `GetProfile` est servi derrière un cache
dont le **contenu** retarde de quelques secondes sur les écritures qu'on vient
d'émettre : recharger juste après une action réussie peut renvoyer l'objet à son
ancienne place, ou l'attribut qu'on vient de remplacer. L'écraser sur le cache
local fait *sauter le changement en arrière*.

`responseMintedTimestamp` n'y aide pas : il est frais même quand les données ne
le sont pas — il date la réponse, pas l'instantané qu'elle transporte. Le seul
signal fiable est le contenu lui-même, donc `src/lib/bungie/profile-freshness.ts`
retient ce que nos écritures ont laissé derrière elles et refuse toute réponse
qui dit autre chose :

| Écriture | Retenu | Confronté à |
|---|---|---|
| Déplacement | où l'objet a atterri | `locateItem` dans la réponse |
| Insertion d'attribut | le plug de chaque socket touché | `items[id].sockets[i]` |

Les deux sont nécessaires, aucune ne couvre l'autre : un déplacement change la
place de l'objet sans toucher à ses sockets, une insertion fait l'inverse.
`useProfile` réessaie trois fois (1 s, 2 s, 4 s) puis abandonne en conservant
l'état local — s'entêter bloquerait tout rechargement ultérieur, et la garde se
déclenche aussi quand le joueur touche au même objet en jeu à cet instant précis.

### Interface

Saisir un objet fait apparaître sept zones de dépôt par-dessus la vue —
équiper / inventaire pour chaque personnage, plus le coffre. Elles recouvrent au
lieu de s'insérer : la mise en page ne bouge pas au moment où l'utilisateur vise.
Chaque zone demande au planificateur si elle est atteignable ; celle qui ne l'est
pas reste affichée, désactivée, avec son motif.

Ce sont trois calques, tous enfants **directs** de `.inventory-view__body` : un
enfant en position absolue d'une grille, à qui l'on donne une position dans
cette grille, prend pour bloc conteneur la **zone de grille** désignée. Le
calque du coffre épouse donc exactement la colonne de
`.inventory-view__storage`, sans rien à mesurer ni ratio approché à tenir à
jour — c'est aussi pourquoi `__body` déclare des `grid-template-rows` explicites
même pour une seule rangée (une ligne implicite n'existe pas pour un enfant en
position absolue, qui retomberait sur le bloc entier).

> **Les deux lignes de chaque axe doivent être données.** Contrairement à un
> véritable élément de grille, un enfant en position absolue ne s'arrête pas au
> bout de sa piste quand la ligne de fin est laissée à `auto` : ce bord retombe
> sur celui du conteneur. `grid-column: 1` étalait donc les zones des
> personnages sur toute la largeur, par-dessous celle du coffre — qui ne
> paraissait juste que parce que sa zone se termine de toute façon au bord du
> conteneur. La forme correcte est `grid-column: 1 / 2`.

Les calques restent montés et s'estompent sur un modificateur `--visible` :
c'est ce qui rend la sortie animable (il n'y a rien à démonter), et cela retire
au passage le travail de montage de l'instant précis où l'utilisateur saisit un
objet.

La ligne du personnage affiché épouse la hauteur de `.equipment__columns`, que
le CSS ne peut pas lire depuis un calque voisin. Elle est **dérivée**, et non
mesurée : `--equipment-columns-height` dans `layout/main.scss` la calcule depuis
`--slot-rows`, `--item-size` et `--slot-row-gap`, et `.slot-column` utilise ce
même espacement — une seule source, si bien que les zones suivent d'elles-mêmes
le réglage de taille d'icônes.

> Un `ResizeObserver` publiant la hauteur mesurée a d'abord été essayé, puis
> abandonné. Son échec mérite d'être retenu : quand une valeur écrite à
> l'exécution n'arrive jamais, ni le CSS compilé ni le bundle client ne
> comportent la moindre anomalie — il n'y a rien à chercher. Une dérivation CSS,
> elle, se calcule ou ne se calcule pas, et la feuille compilée le dit.
> `--slot-rows` doit suivre la longueur de `WEAPON_COLUMN` / `ARMOR_COLUMN` dans
> `lib/destiny/buckets.ts` — c'est le prix à payer, et c'est une constante du
> jeu.

Le double-clic équipe sur le personnage affiché.

> **Les zones de dépôt de dnd-kit ne sont volontairement pas utilisées.** `over`
> vit dans le contexte que lit **tout** `useDraggable` : désigner une zone
> re-rendait la centaine de vignettes montées, d'où un à-coup à chaque passage
> d'une zone à l'autre. `collisionDetection` ne renvoie donc rien, `over` reste
> `null` pendant tout le geste, la mise en avant est un simple `:hover` CSS, et
> la destination est relue dans le DOM au relâchement (`data-drop-target` +
> `elementFromPoint`). La vignette qui suit le curseur doit garder
> `pointer-events: none` pour que les deux fonctionnent.
>
> Une infobulle qui suit le curseur doit porter `pointer-events: none`
> (`.floating-layer--passive`). Sans ça, elle se trouve *sous* le curseur et
> reçoit elle-même le `pointerdown` : l'objet ne part jamais, et les zones de
> dépôt n'apparaissent pas. Une fois épinglée, elle redevient interactive — on
> doit pouvoir survoler ses attributs.
>
> Pendant un geste, toutes les infobulles sont masquées par
> `:root[data-dragging]`, un attribut écrit directement sur `<html>` par
> `MoveDnd`. Prévenir les vignettes par un contexte les re-rendrait toutes,
> deux fois par geste. La cible du dépôt est lue dans le DOM **avant** que
> l'attribut ne soit retiré : rendre d'abord une infobulle au point de dépôt la
> dissimulerait à `elementFromPoint`.

> Pour la même raison, l'objet saisi vit dans un **contexte séparé** de celui des
> actions que lisent les vignettes, et le défilement automatique est coupé (les
> zones recouvrent la vue, il n'y a plus rien à faire défiler). Reste un rendu
> incompressible par geste, provoqué par le `active` de dnd-kit lui-même. Les
> sept plans sont calculés une fois à la saisie — 0,13 ms sur un coffre de mille
> objets, mesuré — et jamais recalculés pendant qu'on vise.

### Équiper un attribut

Changer l'attribut d'une arme n'est pas un déplacement, mais cela partage bien
la file. Une requête, `InsertSocketPlugFree`, envoyée à `POST /api/sockets` ;
côté navigateur, `src/lib/actions/use-insert-planner.ts` — le pendant du
planificateur de déplacements, moins le plan : une insertion coûte une requête
et jamais plus.

Partager la file n'est pas une commodité d'affichage : l'exécuteur n'envoie
**qu'une requête à la fois**, et Bungie limite le débit des écritures par
compte, toutes routes confondues. Cela veut dire aussi qu'un changement
d'attribut se lit comme n'importe quelle action dans le panneau latéral, avec sa
carte, son avancement et son refus — et qu'il hérite des reprises sur
limitation de débit sans rien coder.

`QueuedAction` est donc une union discriminée par `kind` (`"move"` /
`"insert"`), `ActionStep` aussi, et `sendStep` aiguille sur le même
discriminant. L'infobulle ne garde aucun état à elle — elle se démonte à chaque
fermeture, là où l'action lui survit dans la file — d'où `usePlugActionState`,
qui y lit l'insertion en cours et le dernier refus.

Bungie expose deux écritures sur les sockets, une seule est accessible :
`InsertSocketPlug` exige un jeton d'*advanced write action*, délivré depuis le
jeu lui-même. `InsertSocketPlugFree` ne demande rien de plus que la portée
`MoveEquipDestinyItems` déjà utilisée — mais **« free » est une contrainte, pas
un cadeau** : l'API n'accepte que les changements qui ne coûtent rien au joueur
(attributs déjà débloqués sur l'arme, mods d'armure, fragments de doctrine).
Tout le reste est refusé, avec un statut transmis tel quel jusqu'à l'infobulle.

Trois points du schéma OpenAPI faciles à se figurer de travers :

- **`characterId` désigne le personnage qui agit, pas le détenteur de l'objet.**
  Rien n'attache le champ à l'objet, et **un objet au coffre se modifie** — il
  suffit de passer un personnage. N'importe lequel convient pour un attribut
  d'arme : les options viennent de l'instance de l'arme (`reusablePlugs`),
  jamais des déblocages du personnage. Ce ne serait plus vrai pour des mods.
- **Le personnage doit être en zone sociale, en orbite ou hors ligne** — la même
  condition que pour l'endpoint payant. Rien ne l'expose à l'avance ; elle se
  manifeste par un refus.
- **Débit limité à 2 actions de socket par seconde et par joueur**, plus serré
  que le budget d'écriture général. La file n'envoyant qu'une requête à la fois,
  il n'est pas atteignable aujourd'hui — mais une action groupée devrait en tenir
  compte.

Dans l'infobulle, un clic sur un attribut l'équipe. L'infobulle de l'attribut
l'annonce par un symbole de clic gauche — une indication, pas un bouton : elle
se ferme dès que le curseur quitte l'icône, elle ne pourrait pas être atteinte à
la souris.

Le cache du profil est corrigé sur-le-champ (`items[id].sockets[socketIndex]`),
pour la même raison que les étapes de déplacement : recharger 1,6 Mo pour un
plug serait disproportionné, et l'infobulle est encore ouverte sous les yeux de
l'utilisateur. C'est le rechargement déclenché à la vidange de la file qui remet
les statistiques d'accord — elles, on ne sait pas les recalculer localement.

> La vignette de l'arme n'est **pas** grisée pendant une insertion, à la
> différence d'un déplacement : l'objet ne va nulle part. L'attente se montre là
> où le clic a eu lieu — sur l'attribut.

## Modes d'affichage et équipements du jeu

La page d'équipement a deux modes, que basculent les boutons voisins des onglets
de personnage ou la touche **Tab**. Le mode vit dans le cookie de préférences
(`viewMode`) : il survit donc au rechargement — voir
`lib/settings/constants.ts`.

- **Inventaire** — la vue historique : deux colonnes d'emplacements avec leur
  inventaire, et le coffre à droite. C'est là qu'on déplace des objets.
- **Équipements** — une ligne par emplacement, les attributs, mods et
  compétences de l'objet équipé à côté de lui, et les équipements sauvegardés du
  personnage à droite.

**Les deux modes restent montés**, superposés dans la même case de grille : la
bascule est alors un simple fondu, et rien n'est à reconstruire — ni le coffre
virtualisé, ni les définitions déjà lues. Le mode caché est sorti du flux
(`position: absolute`, sans quoi la case garderait la hauteur du plus grand des
deux) et marqué `inert`, ce qu'une simple opacité ne fait pas.

Le mode équipements ne déplace rien — aucune zone de dépôt, aucun inventaire
d'emplacement, nulle part où déposer. C'est ce que porte `DragScopeProvider` :
un contexte à lui plutôt qu'un drapeau dans `MoveActionsValue`, les deux modes
étant montés en même temps et ce qui vaut pour l'un ne valant pas pour l'autre.

> **Monter les deux modes, c'est donner à chacun son préfixe d'identifiants
> dnd-kit.** `draggableNodes` de dnd-kit est une Map indexée par le **seul**
> identifiant, et `useDraggable` s'y enregistre même désactivé. Les deux modes
> rendant les mêmes objets équipés, leurs deux vignettes se disputaient une
> unique entrée : la dernière montée l'emportait, et c'est SA position qui
> servait d'origine au calque de déplacement — un objet équipé sautait à
> l'emplacement qu'il occupe dans l'autre mode dès le début du geste. D'où
> `DragScope.idPrefix`.

### D'où viennent les icônes d'attributs

`lib/destiny/use-equipped-plugs.ts` construit toutes les lignes en **une seule**
requête groupée dans IndexedDB, pour tout l'écran. La nature d'un plug ne se lit
que dans sa définition (`plugCategoryIdentifier`), et une lecture par icône
remettrait en place les dizaines de souscriptions Dexie que le projet a
supprimées ailleurs.

Par type d'objet :

- **arme** — attributs équipés, puis mods, puis l'armature ;
- **armure** — les bonus d'ensemble (affichés même hors palier, comme en jeu)
  ou, sur une exotique, son attribut intrinsèque, dessiné **carré** comme
  l'armature d'une arme : c'est le même rôle, et le jeu le présente de même ;
  puis les mods ;
- **doctrine** — super, compétence de classe, mouvement, grenade, mêlée et
  aspects sur la première ligne, fragments sur la seconde ;
- **artéfact** — les attributs réellement équipés.

Les cosmétiques (revêtement, ornement, effet de frag) sont écartés : ils ne
changent rien au comportement de l'objet. **Pièces maîtresses et catalyseurs**
aussi — ils ne se changent pas gratuitement, et leur icône dit seulement « cet
objet est amélioré », ce que la vignette signale déjà.

> Attention au test de la pièce maîtresse. `isFixedPlug` découpe la famille du
> plug sur les points, et en rate ainsi la grande majorité : à côté de
> `v400.plugs.weapons.masterworks.stat.range`, le manifeste porte
> `v300_new_auto_rifle0_masterwork` (tirets bas), `v400.new.bow0.masterwork` et
> `v620.exotic.weapon.masterwork` (singulier), ou `generic_exotic_masterwork`.
> `isMasterworkPlug` coupe sur les **deux** séparateurs et accepte le singulier —
> 160 familles, 822 plugs, vérifiés sur tout le manifeste.

Sans emplacement sélectionné, les lignes montrent ce que le personnage **porte**,
et chaque socket est alors modifiable : cliquer un attribut ouvre son sélecteur,
le même `PlugSlot` que l'infobulle — la règle du « y a-t-il quelque chose à
choisir ici » n'est donc écrite qu'une fois. Un équipement **sélectionné** est un
instantané : rien n'y est équipé en ce moment, ses lignes sont en lecture seule.

### Équipements sauvegardés

Ce sont ceux de **Bungie**, pas les nôtres : le composant de profil **206**
(`characterLoadouts`) renvoie les emplacements numérotés de chaque personnage, et
trois endpoints d'écriture agissent dessus (`lib/bungie/actions.ts`,
`/api/loadouts`) :

| Bouton                                      | Endpoint          |
| ------------------------------------------- | ----------------- |
| Équiper l'équipement n°n                    | `EquipLoadout`    |
| Écraser cet équipement avec les objets équipés | `SnapshotLoadout` |
| Supprimer cet équipement                    | `ClearLoadout`    |

Ils ne passent **pas** par la file d'actions : Bungie assemble l'équipement côté
serveur, transferts depuis le coffre compris, en une requête. Rien à planifier,
donc un état d'attente local et une relecture du profil suffisent.

Les points à connaître :

- **`2166136261` est la sentinelle « pas de hash » de Bungie** — `0x811C9DC5`,
  la base de l'algorithme FNV-1a. Elle ne vaut *pas* zéro, et c'est ce que porte
  un identifiant non renseigné. Un emplacement libre l'a sur ses trois
  `colorHash`, `iconHash` et `nameHash`, et dix entrées `items` dont
  l'`itemInstanceId` vaut « 0 ». La prendre pour un vrai hash donnait deux bugs :
  les emplacements vides s'affichaient comme pleins (aucune définition à ce hash,
  donc aucune vignette, mais un emplacement jugé occupé — toutes les actions
  offertes, et une sélection qui vidait les dix lignes), et `SnapshotLoadout` la
  recevait en identifiant, ce qui répondait *« Your request was invalid. »* à la
  création. Seul un vrai hash est désormais transmis.
- **Un emplacement est libre quand aucun de ses objets n'a d'instance réelle, ou
  qu'aucun de ses trois identifiants n'est un vrai hash** — l'un ou l'autre
  signal suffit, et `items.length` n'en est pas un. Voir
  `lib/loadouts/loadout.ts`. Un emplacement libre reste sélectionnable, et
  son titre se réduit à son numéro suivi de « Emplacement libre » : ce numéro est
  la seule indication de l'emplacement que l'écrasement va remplir. Les lignes
  montrent alors des **cases vides** — il n'y a rien d'enregistré à montrer — et
  sa seule action restante, *créer à partir des objets équipés*, est posée au
  centre de la colonne d'équipement plutôt que dans le panneau de droite, là où
  le vide a laissé la place. Survoler ce bouton fait apparaître l'équipement
  porté en fondu : un aperçu de ce que le clic enregistrerait. Le fondu est
  entièrement en CSS — un `:has()` sur la colonne qui les contient tous deux —
  car le passer par un état React re-rendrait les dix lignes et tous leurs
  attributs à chaque entrée et sortie du curseur, pour une transition d'opacité.
  Le même raisonnement que le `:root[data-dragging]` des infobulles.
- **`SnapshotLoadout` exige `colorHash` / `iconHash` / `nameHash`** — les trois,
  toujours, quoi qu'en laisse croire leur `nullable` dans le schéma OpenAPI. Les
  omettre répond `DestinyInvalidRequest` (1622), et transmettre la sentinelle
  d'un emplacement libre tout autant. Un emplacement existant réexpédie donc les
  siens, pour ne pas perdre sa couleur, son glyphe et son nom ; un emplacement
  libre reçoit le **premier de chaque liste** de
  `DestinyLoadoutConstantsDefinition` — le seul ordre qui ait un sens ici — et le
  titre permet de les changer aussitôt. Le
  renommage et le changement de couleur ne sont, de même, proposés que sur un
  emplacement qui existe.
- **Le `bucketHash` d'un objet sauvegardé n'est pas exploitable tel quel** : un
  objet au coffre porte celui du coffre. L'emplacement où il s'équipe vient de sa
  définition (`inventory.bucketTypeHash`) — voir
  `lib/destiny/use-loadout-items.ts`.
- Le fond et le glyphe de la vignette sont deux images distinctes du manifeste
  (`colorImagePath`, `iconImagePath`) ; `DestinyLoadoutColorDefinition`,
  `DestinyLoadoutIconDefinition` et `DestinyLoadoutNameDefinition` sont les
  seules tables utilisées ici **sans** `displayProperties`.
- Le nombre d'emplacements n'est pas codé : le composant en renvoie autant que
  le compte en possède.
- **`plugItemHashes` est indexé par index de socket** — une entrée par socket, et
  non une liste libre : un équipement sauvegardé est donc dessiné avec les
  attributs et les mods qu'il a réellement enregistrés. Deux valeurs n'y
  désignent rien, et toutes deux sont la sentinelle `INVALID_HASH` : un socket
  non enregistré, et — c'est le piège — **un socket qui n'offre qu'un seul
  choix**, que le jeu laisse délibérément vide. Les prendre pour des
  emplacements libres effacerait des attributs bel et bien en place : la valeur
  courante de l'objet y supplée donc, puisque sur un socket à choix unique elle
  *est* le plug enregistré. Voir `savedSockets` dans
  `lib/destiny/use-loadout-items.ts`.
- **Échap** désélectionne. Le geste n'est pris que s'il ne sert à rien d'autre :
  un sélecteur ouvert le garde pour lui (c'est lui qu'on veut refermer), et une
  modale piège de toute façon le clavier.

### Renommer et recolorer un équipement

Le titre d'un emplacement sélectionné est « 3 - Solaire », avec sa vignette en
dessous. Cette vignette est composite — Bungie livre le fond coloré et le glyphe
en deux images distinctes, jamais assemblées. Ici elles sont superposées, et **le
survol les écarte** : chacune devient alors sa propre cible, avec sa grille de
choix. Le nom est un `<select>` dépouillé de son habillage, qui ne se signale
qu'au survol.

La modification est **explicite** : un bouton l'ouvre, les choix s'accumulent
dans un brouillon local, un second les envoie. L'aperçu suit le brouillon, ce
qui oblige à résoudre ses hashes contre le manifeste eux aussi — n'avoir lu que
ceux enregistrés laissait un glyphe fraîchement choisi invisible jusqu'à ce que
Bungie l'accepte. Rien ne part avant, et tout part
en **une seule requête** — `UpdateLoadoutIdentifiers` écrit les trois valeurs
d'un bloc, si bien qu'un envoi par clic aurait été à la fois bavard et ambigu :
chacun devait de toute façon réexpédier les deux autres. Le brouillon ne se
referme qu'en cas de succès ; un refus laisse les choix à l'écran. Hors édition
le nom est du texte et la vignette une simple image — un contrôle désactivé dans
un titre ne serait qu'une cible morte. L'ordre dans lequel les choix sont
proposés n'est pas un tri de hashes — il vient
des listes `loadoutColorHashes` / `loadoutIconHashes` / `loadoutNameHashes` de
`DestinyLoadoutConstantsDefinition` (une seule entrée, hash 1).

> **Ajouter une table du manifeste, c'est incrémenter `MANIFEST_SCHEMA_VERSION`.**
> L'oublier, et les clients qui ont déjà mis la version précédente en cache ne
> téléchargent jamais la nouvelle table : chaque lecture y renvoie `undefined`,
> pour toujours, et l'interface se contente d'afficher du vide. `ensureManifest`
> lève désormais quand une table demandée n'a aucun chemin dans le manifeste ou
> revient vide — la prochaine erreur de ce genre sera bruyante et non muette.

### Raccourcis clavier

| Touche | Effet |
| ------ | ----- |
| `Tab` | basculer de mode d'affichage |
| `Échap` | désélectionner l'emplacement d'équipement |
| `R` | rafraîchir |
| `Maj`+`R` | forcer le rafraîchissement depuis l'API — comme un appui d'une seconde sur le bouton |
| `F1` | ouvrir les paramètres |

`lib/ui/use-global-shortcut.ts` porte ce qu'ils ont en commun, dont un point qui
ne va pas de soi : l'écouteur est posé en phase de **capture**. La barre de
recherche pose le sien sur `document` pour prendre le focus dès qu'une lettre est
tapée n'importe où (voir SearchBar), et entre deux écouteurs de même phase
l'ordre est celui du montage — `R` serait allé se loger dans le champ de
recherche. En capture, le raccourci passe d'abord et son `preventDefault` fait
renoncer l'autre, qui teste `defaultPrevented` avant tout. Les gardes habituelles
s'y ajoutent : une saisie ou une modale garde ses touches.

Les deux rafraîchissements ne font pas la même chose. Le **normal** passe par la
garde anti-instantané-périmé : une réponse qui ne reflète pas encore nos
écritures est écartée, et l'état local — fidèle, lui — est conservé. Le **forcé**
abandonne cette garde d'abord (`clearLocalWrites`), et la réponse de Bungie fait
alors autorité quoi qu'elle contienne. C'est ce qu'il faut quand le jeu a bougé
en parallèle, ou quand la garde s'est trompée : elle ne peut pas distinguer
« Bungie retarde » de « le joueur a touché au même objet en jeu ».

### Statistiques du personnage

Les chiffres sous l'équipement viennent tels quels du composant 200
(`character.stats`) : Bungie a déjà totalisé armures, mods et fragments équipés.
Les recalculer côté client donnerait un résultat faux — les bonus conditionnels
ne sont pas reproductibles. Leurs icônes viennent de `DestinyStatDefinition`.

Seules les six statistiques d'armure sont retenues, dans l'ordre du jeu.
`character.stats` en porte une septième — la Puissance — qui n'a rien à faire
dans cette barre : elle est déjà sur l'onglet du personnage. Un filtre sur
`ARMOR_STAT_ORDER` l'écarte sans nommer son hash, et écartera de même ce que
Bungie ajouterait à côté.

## Polices de symboles du jeu

`public/fonts/destiny_symbols_common.otf` et `destiny_symbols_pc.otf` sont les
polices de symboles du jeu : types d'armes, éléments, capacités, boutons de
manette, clavier et souris. Les deux déclarent la même famille CSS (leurs jeux
de caractères sont disjoints), un symbole s'insère donc en écrivant son caractère.

Bungie n'a jamais publié la table nom ↔ point de code, mais elle est dans la
police, dans le charset CFF. `scripts/extract-destiny-symbols.mjs` la lit et
écrit `src/lib/destiny/symbols.generated.ts` (389 glyphes) — à relancer si les
fichiers de police sont un jour remplacés. Il ne dépend de rien : fontTools ne
s'installe pas dans le conteneur, et un paquet npm pour une exécution ponctuelle
serait disproportionné.

**Certains symboles n'existent qu'en morceaux.** Le clic gauche est un corps de
souris (`mouse1`) sur lequel se pose le bouton éclairé (`mouse1_button`) ; une
touche du clavier est un fond (`standard_backing`) sous une légende. Les
morceaux se reconnaissent sans deviner : leur chasse est **nulle**, et c'est
ainsi que l'extracteur les marque (`DESTINY_OVERLAY_GLYPHS`).

`src/lib/destiny/symbols.ts` nomme les compositions utiles (`mouseLeft`,
`wheelUp`, `keySymbol("E")`…) et `<DestinySymbol name="mouseLeft" />` les dessine,
une balise par couche. La police saurait les superposer seule — une chasse nulle
fait exactement cela — mais tout le symbole prendrait alors une couleur unique ;
avec une balise par couche, celle d'accent (un bouton pressé) se teinte à part
via `--destiny-symbol-accent`. `destinySymbolText()` fait l'autre choix, pour les
chaînes pures comme un `aria-label` ; là, les couches de chasse nulle doivent
être émises **avant**, la plume ne bougeant pas après elles.

## Recherche d'objets

Le langage de requête est celui de **Destiny Item Manager**, moins ce qui lui
est propre (étiquettes, listes de souhaits, notes, équipements enregistrés).
Il vit dans `src/lib/search/`, découpé comme `sort.ts` et `grouping.ts` : les
modules purs d'abord, React en dernier.

| Fichier | Rôle |
|---|---|
| `query.ts` | découpage + analyse syntaxique → arbre. L'espace vaut ET implicite, plus `and` / `or` / `not`, le préfixe `-`, les parenthèses et les guillemets |
| `keywords.ts` | le vocabulaire : noms de statistiques, de types de dégâts, de raretés, de classes, de munitions, de sous-types, de fonderies et d'effets anti-champion → hashes, valeurs d'énumération et étiquettes |
| `filters.ts` | arbre → prédicat. `is:`, `stat:`, `basestat:`, `perkname:`, `power:`, `id:`… |
| `flags.ts` | les masques de drapeaux que l'index calcule et que `filters.ts` lit. Un module à part, pour que ce dernier reste pur |
| `index-build.ts` | des lectures groupées du manifeste : noms des plugs équipés, écarts de statistiques des mods, et tout ce qu'un objet ne dit qu'à travers ses plugs |
| `loadout-index.ts` | la place de chaque objet dans les équipements enregistrés en jeu. Aucune lecture du manifeste : un équipement ne désigne ses objets que par leur instance |
| `suggestions.ts` | l'autocomplétion : le terme sous le curseur → propositions classées |
| `provider.tsx` | la seule partie React : anti-rebond, évaluation sur tout le profil, ensemble des résultats |

Quelques décisions portent le reste.

**Une requête fautive ne filtre rien.** Un mot-clé inconnu ou une comparaison
incomplète (`stat:range:>=`) rend la requête invalide : la barre passe au rouge
et l'affichage reste tel quel. Filtrer sur ce qui a été compris viderait l'écran
à chaque lettre pendant qu'on tape `stat:ran`.

**Une apostrophe n'ouvre une chaîne qu'en début de segment.** `"` et `'`
délimitent tous deux un segment entre guillemets, ce qui fait marcher
`id:'6917…'` — mais `frenzy's` et `l'ordre` doivent rester des mots ordinaires.
La règle est donc positionnelle : un guillemet ne délimite que si le segment est
encore vide. Les opérateurs, eux, sont reconnus sans tenir compte de la casse :
`OR` vaut `or`.

**Le vocabulaire est anglais, et codé en dur.** La syntaxe de DIM est anglaise,
et le manifeste est téléchargé dans la langue du joueur : passer par une table
traduite rendrait les requêtes dépendantes de la locale. La même règle décide de
ce sur quoi un filtre a le droit de s'appuyer — un plug se reconnaît à son
`plugCategoryIdentifier` (`shader`, `origins`, `armor_archetypes`…) et une
fonderie à ses `traitIds` (`foundry.hakke`), jamais à un nom affiché. C'est
aussi pourquoi `is:adept` manque : rien dans le manifeste ne distingue une arme
adepte autrement que par le « (Adept) » de son nom, qui est traduit.

**Ce qui est absent, et pourquoi.** `source:`, `season:` et `year:` demanderaient
la table des filigranes de saison que DIM tient à la main ; `catalyst:`,
`is:craftable` et `is:patternunlocked` les enregistrements du compte ;
`is:vendor`, `maxstat*` et `is:maxpower` un optimiseur d'équipement que
l'application n'a pas. Aucune de ces données n'est récupérée : les mots-clés sont
donc refusés plutôt que mal répondus.

**« Statistique de base » veut dire avant les sockets de mods.** Vérifié sur le
manifeste (version 244213) : sur une armure Edge of Fate, mods, pièce maîtresse
**et** ajustage occupent tous des sockets ARMOR MODS, tandis que les tirages de
base sont des plugs `armor_stats` de la catégorie ARMOR PERKS ; côté armes, la
pièce maîtresse et les mods relèvent de WEAPON MODS quand canons et chargeurs
relèvent de WEAPON PERKS. Une seule règle couvre les deux, sans liste blanche de
familles de plugs à tenir à jour.

**Tout ce qu'un objet ne dit qu'à travers ses plugs passe par l'index.** Un mod
réellement posé, un revêtement, un ornement, un emplacement d'artifice, un mod
d'ajustage, un archétype d'armure, une particularité d'origine, la résonance
profonde, l'effet anti-champion, la statistique de la pièce maîtresse, le
compte-frags, le niveau d'une arme façonnée : rien de tout cela n'est sur la
définition de l'objet, tout se lit sur ses plugs équipés. `index-build.ts` les
résout une fois par objet en un masque `SEARCH_FLAG` et quelques valeurs, ce qui
laisse `filters.ts` à des prédicats d'une ligne.

Cet index coûte quelques milliers de définitions : il n'est donc **pas**
construit par `ItemDefsProvider`. Seule une requête qui le lit (texte libre,
`perkname:`, `basestat:`, `is:modded`, `breaker:`…) le déclenche, et rien n'est
filtré avant qu'il n'arrive.

L'évaluation produit un `Set` d'identifiants d'instance, une fois par requête,
sur tout le profil. Le coffre et les objets perdus en écartent alors les objets
non trouvés ou les estompent (au choix, dans les paramètres) ; l'inventaire du
personnage et les objets équipés se contentent toujours d'estomper — un objet ne
doit pas disparaître de l'emplacement que le joueur est en train de regarder.

La barre, elle, vit dans l'en-tête, hors de l'arbre où le manifeste et le profil
sont chargés. Elle ne connaît donc rien : la requête descend par un store
Zustand, et ce qu'on sait des résultats — combien ils sont, où on peut les
envoyer — remonte par le même chemin (`SearchActionsBridge`). Ce même décompte
alimente l'onglet de chaque personnage, qui annonce combien des objets trouvés
se trouvent chez lui.

**L'appartenance à un équipement se compte de deux façons, à dessein.** L'API
renvoie les emplacements d'un personnage avec les libres à leur place, et le
panneau les dessine ainsi (l'« Emplacement n°3 » peut très bien être vide). Deux
numéros désignent donc le même équipement : son `rank` parmi les seuls
enregistrés — celui qu'on compte en lisant le panneau — et son `slot` dans la
liste de l'API. `loadout:` et `loadoutall:` comparent le premier,
`loadoutslot:` et `loadoutslotall:` le second ; sur un personnage dont les cases
sont `[libre] [Alpha] [libre] [Bêta]`, Bêta est `loadout:2` et `loadoutslot:4`.
Le suffixe `all` étend la recherche du personnage affiché à tous, et
`is:inloadout` se passe des numéros. Les quatre acceptent une comparaison
complète : `loadout:>=2` marche comme `tier:>=2`. Les deux numéros comptent à
partir de 1, comme le panneau.

**L'autocomplétion complète le terme sous le curseur**, et non la fin de la
barre — on revient souvent corriger un filtre au milieu d'une requête. Son
vocabulaire est dérivé des tables mêmes qu'utilisent les filtres (`IS_VALUES`,
`STAT_KEYWORDS`…) : la liste proposée et celle qui est comprise ne peuvent donc
pas diverger. Les touches sont celles de DIM : flèches pour parcourir, Tab pour
insérer, Entrée pour prendre la proposition sélectionnée ou sinon appliquer la
requête, Échap pour refermer. Une proposition qui attend encore une valeur
(`stat:`, `power:>=`) garde le curseur collé derrière ; une proposition complète
gagne l'espace qui enchaîne un second filtre. Le `-` de tête nie le terme : il
est retiré avant la comparaison et remis à l'insertion — `-exo` propose
`-is:exotic`. L'historique reste en dehors d'un terme nié : il remplace toute la
barre, et emporterait le `-` qu'on vient de taper.

L'historique part dans **localStorage** et non dans le cookie de préférences,
plafonné à 4 Ko et partagé.

> Tout ce que la barre tire du store passe par `useHydrated()` : le serveur ne
> peut rendre qu'une barre vierge, et le premier rendu du client doit lui être
> identique. Sans ce garde-fou, React signale un écart d'hydratation dès qu'un
> rechargement à chaud réhydrate une page dont le store est déjà rempli. C'est
> un `useSyncExternalStore` et non un `setState` dans un effet : lui seul
> garantit l'emploi de l'instantané *serveur* pendant l'hydratation, et le lint
> du dépôt refuse de toute façon l'autre forme.

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
  app/api/           Routes serveur (auth, manifest, profile, item, loadouts, health)
  proxy.ts           Middleware de routing i18n (nommé « proxy » depuis Next 16)
  i18n/              Configuration next-intl (routing + request)
  lib/
    auth/            Session (cookie signé) + token Bungie valide
    bungie/          Wrapper API Bungie (OAuth, profil, objets)
    db/              Client Prisma
    destiny/         Constantes de jeu, types, logique des sockets
    loadouts/        Équipements sauvegardés en jeu (contrat + écritures)
    manifest/        Téléchargement & cache du manifeste (IndexedDB)
    settings/        Préférences utilisateur (store adossé au cookie)
  components/        Composants UI
  scss/              Styles (voir « Styles »)
  generated/prisma/  Client Prisma généré — non versionné, voir « Client Prisma »
prisma/schema.prisma Modèle de données serveur
prisma.config.ts     Config du CLI Prisma (URL de connexion depuis la v7)
messages/            Traductions FR / EN
```
