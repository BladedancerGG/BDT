// Tri multi-critères des objets, à la manière de Destiny Item Manager.
//
// Le joueur ordonne les critères par importance : le premier départage, et les
// suivants ne servent qu'en cas d'égalité. Chaque critère peut être activé,
// désactivé, et inversé indépendamment.
//
// Ce module est pur (aucun accès au DOM ni au manifeste) : il reçoit un contexte
// de lecture et se contente de comparer. Les définitions viennent du lot déjà
// préchargé par `ItemDefsProvider`.

import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "./types";
import { isCrafted, isEnhanced, isMasterwork } from "./overlays";
import type { ItemSortTraits } from "./sort-traits";

/**
 * Critères disponibles. L'ordre de cette liste n'est que l'ordre de secours :
 * l'ordre réel est celui choisi par le joueur (voir `SortRule`).
 */
export const SORT_IDS = [
  "rarity",
  "power",
  "type",
  "name",
  "gearTier",
  "damageType",
  "ammoType",
  // "armorArchetype",
  "setBonus",
  "weaponFrame",
  "masterwork",
  "crafted",
] as const;

export type SortId = (typeof SORT_IDS)[number];

const SORT_ID_SET: ReadonlySet<string> = new Set(SORT_IDS);

/** Un critère dans la liste ordonnée du joueur. */
export interface SortRule {
  id: SortId;
  /** Critère pris en compte ou simplement mémorisé à sa place */
  enabled: boolean;
  /** Sens inverse du sens naturel (Z→A, puissance décroissante…) */
  desc: boolean;
}

/**
 * Réglage par défaut : rareté décroissante, puis puissance décroissante. Les
 * autres critères sont présents mais inactifs, pour que le joueur n'ait qu'à les
 * activer.
 *
 * L'emplacement n'y figure pas : le coffre est désormais toujours découpé en
 * sections par emplacement (voir `grouping.ts`), le tri n'opère qu'à l'intérieur
 * de l'une d'elles.
 */
export const DEFAULT_SORT_RULES: readonly SortRule[] = [
  { id: "rarity", enabled: true, desc: true },
  { id: "power", enabled: true, desc: true },
  { id: "type", enabled: false, desc: false },
  { id: "name", enabled: false, desc: false },
  { id: "gearTier", enabled: false, desc: true },
  { id: "damageType", enabled: false, desc: false },
  { id: "ammoType", enabled: false, desc: false },
  // { id: "armorArchetype", enabled: false, desc: false },
  { id: "setBonus", enabled: false, desc: false },
  { id: "weaponFrame", enabled: false, desc: false },
  { id: "masterwork", enabled: false, desc: true },
  { id: "crafted", enabled: false, desc: true },
];

/**
 * Nature de la valeur comparée, pour que l'UI puisse libeller le sens du tri :
 * « A → Z » n'a pas de sens pour un niveau de puissance.
 */
export type SortKind = "text" | "number" | "flag";

export const SORT_KIND: Record<SortId, SortKind> = {
  rarity: "number",
  power: "number",
  type: "text",
  name: "text",
  gearTier: "number",
  damageType: "number",
  ammoType: "number",
  // armorArchetype: "text",
  setBonus: "text",
  weaponFrame: "text",
  masterwork: "flag",
  crafted: "flag",
};

// —— Contexte de lecture ————————————————————————————————————————

export interface SortContext {
  defs: Map<number, InventoryItemDefinition>;
  details: Record<string, ItemDetail>;
  /** Armature, archétype et bonus d'ensemble, résolus par `loadSortTraits` */
  traits: Map<string, ItemSortTraits>;
}

/**
 * Types de munitions (DestinyAmmunitionType) dépourvus de sens pour un tri.
 * `None` couvre tout ce qui n'est pas une arme ; `Unknown` est une valeur de
 * repli de l'API. Les deux sont traités comme absents, et finissent donc en fin
 * de liste quel que soit le sens choisi.
 */
const AMMO_TYPE_NONE = 0;
const AMMO_TYPE_UNKNOWN = 4;

/** Rang « façonnée / améliorée » : ni l'un ni l'autre < façonnée < améliorée. */
function craftedRank(state: number | undefined): number {
  if (isEnhanced(state)) return 2;
  if (isCrafted(state)) return 1;
  return 0;
}

/** Valeur comparable pour un critère, ou `undefined` si l'objet n'en a pas. */
type SortKey = string | number | undefined;

function sortKey(
  id: SortId,
  item: DestinyItemComponent,
  ctx: SortContext,
): SortKey {
  const def = ctx.defs.get(item.itemHash);
  const detail = item.itemInstanceId
    ? ctx.details[item.itemInstanceId]
    : undefined;
  const traits = item.itemInstanceId
    ? ctx.traits.get(item.itemInstanceId)
    : undefined;

  switch (id) {
    case "name":
      return def?.displayProperties?.name || undefined;

    case "type":
      return def?.itemTypeDisplayName || undefined;

    case "rarity":
      return def?.inventory?.tierType;

    case "power":
      return detail?.instance?.primaryStat?.value;

    case "gearTier":
      return detail?.instance?.gearTier;

    case "damageType":
      // Les doctrines portent leur élément dans le talentGrid, leur
      // `defaultDamageType` valant toujours 0.
      return (
        detail?.instance?.damageType ||
        def?.defaultDamageType ||
        def?.talentGrid?.hudDamageType ||
        undefined
      );

    case "ammoType": {
      // L'ordre de l'énumération est déjà le bon : primaires, spéciales, lourdes.
      const ammo = def?.equippingBlock?.ammoType;
      if (ammo === AMMO_TYPE_NONE || ammo === AMMO_TYPE_UNKNOWN) return undefined;
      return ammo;
    }

    // case "armorArchetype":
    //   return traits?.archetype;

    case "setBonus":
      // Les armures hors ensemble n'ont pas de valeur : elles sont regroupées
      // en fin de liste, jamais intercalées entre deux ensembles.
      return traits?.setBonus;

    case "weaponFrame":
      return traits?.frame;

    // Les drapeaux se comparent comme des nombres, jamais « absents » : un
    // objet non chef-d'œuvre est un vrai 0, il ne doit pas être rejeté en fin
    // de liste comme une valeur manquante.
    case "masterwork":
      return isMasterwork(item.state) ? 1 : 0;

    case "crafted":
      return craftedRank(item.state);
  }
}

/**
 * Compare deux valeurs d'un même critère.
 *
 * Les valeurs absentes finissent **toujours** en dernier, quel que soit le sens
 * du tri : une arme sans archétype d'armure n'a pas à remonter en tête de liste
 * simplement parce qu'on a inversé le critère.
 */
function compareKeys(a: SortKey, b: SortKey, desc: boolean): number {
  if (a === undefined || b === undefined) {
    if (a === undefined && b === undefined) return 0;
    return a === undefined ? 1 : -1;
  }

  const order =
    typeof a === "string" && typeof b === "string"
      ? // Comparaison lexicale correcte pour les accents (é, ï…)
        a.localeCompare(b)
      : Number(a) - Number(b);

  return desc ? -order : order;
}

/**
 * Trie une liste selon les règles actives, la plus importante d'abord.
 *
 * Les clés sont extraites une seule fois par objet et par critère (schéma
 * « decorate–sort–undecorate ») : sans ça, un coffre d'un millier d'objets
 * relirait les définitions des dizaines de milliers de fois pendant le tri.
 */
export function sortItems<T extends DestinyItemComponent>(
  items: readonly T[],
  ctx: SortContext,
  rules: readonly SortRule[],
): T[] {
  const active = rules.filter((rule) => rule.enabled);
  if (active.length === 0) return items as T[];

  const decorated = items.map((item) => ({
    item,
    keys: active.map((rule) => sortKey(rule.id, item, ctx)),
  }));

  // `Array.prototype.sort` est stable : à égalité sur tous les critères, l'ordre
  // renvoyé par l'API est conservé.
  decorated.sort((left, right) => {
    for (let i = 0; i < active.length; i++) {
      const order = compareKeys(left.keys[i], right.keys[i], active[i].desc);
      if (order !== 0) return order;
    }
    return 0;
  });

  return decorated.map((entry) => entry.item);
}

// —— Persistance ————————————————————————————————————————————————
//
// Les règles vivent dans un cookie, dont la taille est limitée (4 Ko) et partagée
// avec les autres préférences. On les sérialise donc en jetons courts plutôt
// qu'en objets JSON : `["bucket","-rarity","!name"]` au lieu de onze objets à
// trois champs, ce qui divise la taille encodée par quatre environ.
//
//   préfixe `-` → sens inverse      préfixe `!` → critère désactivé

export function serializeSortRules(rules: readonly SortRule[]): string[] {
  return rules.map(
    (rule) => `${rule.enabled ? "" : "!"}${rule.desc ? "-" : ""}${rule.id}`,
  );
}

/**
 * Relit les jetons du cookie.
 *
 * Tolérante par construction : les critères inconnus sont ignorés et ceux qui
 * manquent sont ajoutés à la fin, désactivés. Un cookie écrit par une version
 * antérieure reste donc valide quand un critère est ajouté ou retiré.
 */
export function parseSortRules(raw: unknown): SortRule[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const rules: SortRule[] = [];
  const seen = new Set<SortId>();

  for (const token of raw) {
    if (typeof token !== "string") continue;

    const match = /^(!?)(-?)([A-Za-z]+)$/.exec(token);
    if (!match) continue;

    const [, off, minus, id] = match;
    if (!SORT_ID_SET.has(id) || seen.has(id as SortId)) continue;

    seen.add(id as SortId);
    rules.push({ id: id as SortId, enabled: off !== "!", desc: minus === "-" });
  }

  if (rules.length === 0) return undefined;

  // Critères apparus depuis l'écriture du cookie : inactifs, avec leur sens
  // naturel par défaut.
  for (const fallback of DEFAULT_SORT_RULES) {
    if (!seen.has(fallback.id)) rules.push({ ...fallback, enabled: false });
  }

  return rules;
}

/** Déplace une règle dans la liste, sans muter l'original. */
export function moveSortRule(
  rules: readonly SortRule[],
  from: number,
  to: number,
): SortRule[] {
  if (from === to || from < 0 || to < 0) return rules as SortRule[];
  if (from >= rules.length || to >= rules.length) return rules as SortRule[];

  const next = [...rules];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
