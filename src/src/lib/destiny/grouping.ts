// Regroupement des objets du coffre.
//
// Deux niveaux, et un seul possible à chaque fois :
//   1. l'emplacement d'origine (cinétique, casque…), toujours actif ;
//   2. un sous-groupe au choix du joueur, distinct pour les armes et pour les
//      armures — un seul critère à la fois, contrairement au tri qui, lui, en
//      empile plusieurs.
//
// Ce module est pur (aucun accès au DOM ni au manifeste) : il reçoit un contexte
// déjà résolu — définitions préchargées par `ItemDefsProvider`, libellés du
// manifeste chargés par `use-group-defs`, libellés d'interface traduits par
// l'appelant. Le tri, lui, reste appliqué **à l'intérieur** de chaque groupe :
// les deux mécanismes se composent sans se connaître.
//
// Les icônes d'en-tête n'y sont pas montées, ni même désignées par un chemin :
// le module ne décrit **que** celle qu'il faut, sous forme de descripteur
// (`GroupIcon`), et c'est la couche de rendu qui l'aiguille vers le bon
// composant (`components/icons`). Aucune dépendance à React n'entre donc ici.

import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "./types";
import type { ItemSortTraits } from "./sort-traits";
import { ARMOR_BUCKETS, BUCKET_ORDER, WEAPON_BUCKETS } from "./buckets";
import { BUNGIE_ROOT } from "./display";

/** Sous-groupes proposés pour les armes. Le premier libellé est « aucun ». */
export const WEAPON_GROUPINGS = [
  "none",
  "ammoType",
  "weaponType",
  "damageType",
] as const;

/** Sous-groupes proposés pour les armures. */
export const ARMOR_GROUPINGS = [
  "none",
  "class",
  "setBonus",
  // "armorArchetype",
] as const;

export type WeaponGrouping = (typeof WEAPON_GROUPINGS)[number];
export type ArmorGrouping = (typeof ARMOR_GROUPINGS)[number];

export const DEFAULT_WEAPON_GROUPING: WeaponGrouping = "ammoType";
export const DEFAULT_ARMOR_GROUPING: ArmorGrouping = "class";

export interface GroupingPreferences {
  weapon: WeaponGrouping;
  armor: ArmorGrouping;
}

// —— Icônes ————————————————————————————————————————————————————
//
// Les silhouettes locales sont des composants React (`components/icons`), pas
// des fichiers servis par `<img>`. Les types de dégâts font exception : le
// manifeste en porte déjà une, traduite et à jour, inutile d'en dupliquer.

/** Type de munitions (DestinyAmmunitionType) : 1 principales, 2 spéciales, 3 lourdes. */
export const AMMO_TYPE = {
  Primary: 1,
  Special: 2,
  Heavy: 3,
} as const;

/** Clé de traduction du type de munitions, dans l'espace `inventory`. */
export function ammoLabelKey(
  ammoType: number | undefined,
): "ammo.primary" | "ammo.special" | "ammo.heavy" | undefined {
  switch (ammoType) {
    case AMMO_TYPE.Primary:
      return "ammo.primary";
    case AMMO_TYPE.Special:
      return "ammo.special";
    case AMMO_TYPE.Heavy:
      return "ammo.heavy";
    default:
      return undefined;
  }
}

// —— Contexte de lecture ————————————————————————————————————————

export interface GroupingContext {
  defs: Map<number, InventoryItemDefinition>;
  details: Record<string, ItemDetail>;
  traits: Map<string, ItemSortTraits>;
  /** Nom d'un emplacement, par hash (DestinyInventoryBucketDefinition) */
  bucketNames: ReadonlyMap<number, string>;
  /** Nom et icône d'un type de dégâts, par valeur d'énumération */
  damageTypes: ReadonlyMap<number, { name: string; icon?: string }>;
  /** Nom d'une classe, par DestinyClass (0 Titan, 1 Chasseur, 2 Arcaniste) */
  classNames: ReadonlyMap<number, string>;
  /** Libellés des types de munitions — traduits par l'application, pas par le manifeste */
  ammoNames: ReadonlyMap<number, string>;
  /** Libellé du groupe fourre-tout, pour les objets dépourvus du critère */
  otherLabel: string;
}

// —— Structure produite ————————————————————————————————————————

/**
 * Icône d'un en-tête de groupe, décrite et non montée : `GroupHeader` en tire
 * le composant (voir `components/icons`).
 *
 * Les silhouettes locales sont des SVG intégrés, donc teintées par la couleur du
 * texte quand leur dessin est en `currentColor` — ce qu'un `<img>` ne permettait
 * pas. `image` est l'exception : l'illustration vient de bungie.net, elle ne
 * peut être que chargée par son URL.
 *
 * `vault` et `postmaster` ne sortent pas d'ici mais des sections racines
 * (`VirtualItemGrid`, `InventoryView`), qui empruntent le même en-tête.
 */
export type GroupIcon =
  | { kind: "ammo"; ammoType: number }
  | { kind: "weaponType"; subType: number | undefined; ammoType: number | undefined }
  | { kind: "class"; classType: number }
  | { kind: "vault" }
  | { kind: "postmaster" }
  | { kind: "image"; src: string };

export interface ItemGroup {
  /** Identité stable : clé de rendu et cible de l'état de repli */
  key: string;
  label: string;
  icon?: GroupIcon;
  items: DestinyItemComponent[];
}

export interface BucketSection {
  key: string;
  bucketHash: number;
  label: string;
  count: number;
  /**
   * Faux quand le sous-groupe vaut « aucun » : `groups` ne porte alors qu'une
   * seule entrée, dont l'en-tête n'a pas lieu d'être affiché.
   */
  grouped: boolean;
  groups: ItemGroup[];
}

/** Description d'un sous-groupe, avant regroupement effectif. */
interface GroupKey {
  key: string;
  label: string;
  icon?: GroupIcon;
  /** Rang d'affichage ; `undefined` renvoie le groupe en fin de section */
  order?: number | string;
}

const OTHER_KEY = "other";

/**
 * Sous-groupe d'un objet, ou `undefined` s'il ne relève d'aucun — auquel cas il
 * rejoint le groupe fourre-tout, toujours en dernier.
 */
function groupKeyOf(
  item: DestinyItemComponent,
  def: InventoryItemDefinition,
  grouping: WeaponGrouping | ArmorGrouping,
  ctx: GroupingContext,
): GroupKey | undefined {
  const detail = item.itemInstanceId
    ? ctx.details[item.itemInstanceId]
    : undefined;
  const traits = item.itemInstanceId
    ? ctx.traits.get(item.itemInstanceId)
    : undefined;

  switch (grouping) {
    case "none":
      return undefined;

    case "ammoType": {
      // 0 (None) et 4 (Unknown) ne sont pas des groupes : ces objets rejoignent
      // le fourre-tout, et aucune icône ne les représente.
      const ammo = def.equippingBlock?.ammoType;
      if (!ammo || ammo > AMMO_TYPE.Heavy) return undefined;
      return {
        key: `ammo:${ammo}`,
        label: ctx.ammoNames.get(ammo) ?? "",
        icon: { kind: "ammo", ammoType: ammo },
        // L'ordre de l'énumération est déjà le bon : primaires, spéciales, lourdes
        order: ammo,
      };
    }

    case "weaponType": {
      const label = def.itemTypeDisplayName;
      if (!label) return undefined;
      return {
        key: `type:${def.itemSubType ?? label}`,
        label,
        icon: {
          kind: "weaponType",
          subType: def.itemSubType,
          ammoType: def.equippingBlock?.ammoType,
        },
        order: label,
      };
    }

    case "damageType": {
      // Comme pour le tri : l'instance prime, la définition sert de repli.
      const damage = detail?.instance?.damageType || def.defaultDamageType;
      if (!damage) return undefined;
      const entry = ctx.damageTypes.get(damage);
      return {
        key: `damage:${damage}`,
        label: entry?.name ?? "",
        icon: entry?.icon
          ? { kind: "image", src: `${BUNGIE_ROOT}${entry.icon}` }
          : undefined,
        order: damage,
      };
    }

    case "class": {
      // 3 = aucune restriction de classe : ce n'est pas un groupe, c'est son
      // absence — les objets concernés rejoignent le fourre-tout.
      const classType = def.classType;
      if (classType === undefined || classType > 2) return undefined;
      return {
        key: `class:${classType}`,
        label: ctx.classNames.get(classType) ?? "",
        icon: { kind: "class", classType },
        order: classType,
      };
    }

    case "setBonus": {
      const name = traits?.setBonus;
      if (!name) return undefined;
      return { key: `set:${name}`, label: name, order: name };
    }

    // case "armorArchetype": {
    //   const name = traits?.archetype;
    //   if (!name) return undefined;
    //   return {
    //     key: `archetype:${name}`,
    //     label: name,
    //     icon: traits?.archetypeIcon
    //       ? { kind: "image", src: `${BUNGIE_ROOT}${traits.archetypeIcon}` }
    //       : undefined,
    //     order: name,
    //   };
    // }
  }
}

/** Critère applicable à un emplacement, selon ce qu'il contient. */
function groupingForBucket(
  bucketHash: number,
  preferences: GroupingPreferences,
): WeaponGrouping | ArmorGrouping {
  if (WEAPON_BUCKETS.has(bucketHash)) return preferences.weapon;
  if (ARMOR_BUCKETS.has(bucketHash)) return preferences.armor;
  return "none";
}

/**
 * Compare deux rangs de groupe. Les groupes sans rang (le fourre-tout) passent
 * toujours en dernier, et les libellés se comparent en tenant compte des accents.
 */
function compareOrder(a: GroupKey["order"], b: GroupKey["order"]): number {
  if (a === undefined || b === undefined) {
    if (a === undefined && b === undefined) return 0;
    return a === undefined ? 1 : -1;
  }
  return typeof a === "string" && typeof b === "string"
    ? a.localeCompare(b)
    : Number(a) - Number(b);
}

/**
 * Découpe une liste déjà triée en sections d'emplacement, puis en sous-groupes.
 *
 * L'ordre d'origine est conservé au sein de chaque groupe : le tri du joueur a
 * déjà été appliqué en amont, le regroupement ne fait que le redistribuer.
 */
export function groupItems(
  items: readonly DestinyItemComponent[],
  ctx: GroupingContext,
  preferences: GroupingPreferences,
): BucketSection[] {
  interface Draft {
    bucketHash: number;
    count: number;
    keys: Map<string, GroupKey>;
    items: Map<string, DestinyItemComponent[]>;
  }
  const drafts = new Map<number, Draft>();

  for (const item of items) {
    const def = ctx.defs.get(item.itemHash);
    // L'emplacement d'ORIGINE, et non celui où l'objet se trouve : au coffre,
    // `item.bucketHash` vaut « Coffre » pour tout le monde.
    const bucketHash = def?.inventory?.bucketTypeHash ?? 0;

    let draft = drafts.get(bucketHash);
    if (!draft) {
      draft = { bucketHash, count: 0, keys: new Map(), items: new Map() };
      drafts.set(bucketHash, draft);
    }
    draft.count++;

    const grouping = groupingForBucket(bucketHash, preferences);
    const group = def ? groupKeyOf(item, def, grouping, ctx) : undefined;
    const key = group?.key ?? OTHER_KEY;

    if (group && !draft.keys.has(key)) draft.keys.set(key, group);

    const bucketItems = draft.items.get(key);
    if (bucketItems) bucketItems.push(item);
    else draft.items.set(key, [item]);
  }

  const sections: BucketSection[] = [...drafts.values()].map((draft) => {
    const grouping = groupingForBucket(draft.bucketHash, preferences);
    const grouped = grouping !== "none" && draft.items.size > 0;

    const groups: ItemGroup[] = [...draft.items.entries()]
      .map(([key, groupItems]) => ({
        key,
        entry: draft.keys.get(key),
        items: groupItems,
      }))
      .sort((left, right) =>
        compareOrder(left.entry?.order, right.entry?.order),
      )
      .map(({ key, entry, items: groupItems }) => ({
        key,
        label: entry?.label ?? ctx.otherLabel,
        icon: entry?.icon,
        items: groupItems,
      }));

    return {
      key: `bucket:${draft.bucketHash}`,
      bucketHash: draft.bucketHash,
      label: ctx.bucketNames.get(draft.bucketHash) ?? "",
      count: draft.count,
      // Un unique groupe fourre-tout ne mérite pas d'en-tête : il n'apporterait
      // aucune information que la section ne dise déjà.
      grouped: grouped && !(groups.length === 1 && groups[0].key === OTHER_KEY),
      groups,
    };
  });

  // Les emplacements suivent l'ordre des colonnes d'équipement ; ceux que le
  // manifeste ajouterait sans qu'on les connaisse finissent à la suite.
  return sections.sort(
    (left, right) =>
      (BUCKET_ORDER.get(left.bucketHash) ?? Number.MAX_SAFE_INTEGER) -
      (BUCKET_ORDER.get(right.bucketHash) ?? Number.MAX_SAFE_INTEGER),
  );
}

// —— Persistance ————————————————————————————————————————————————
//
// Deux chaînes courtes dans le cookie de préférences, plafonné à 4 Ko et
// partagé. Les valeurs inconnues (cookie écrit par une autre version) retombent
// silencieusement sur les valeurs par défaut.

const WEAPON_SET: ReadonlySet<string> = new Set(WEAPON_GROUPINGS);
const ARMOR_SET: ReadonlySet<string> = new Set(ARMOR_GROUPINGS);

export function parseWeaponGrouping(raw: unknown): WeaponGrouping | undefined {
  return typeof raw === "string" && WEAPON_SET.has(raw)
    ? (raw as WeaponGrouping)
    : undefined;
}

export function parseArmorGrouping(raw: unknown): ArmorGrouping | undefined {
  return typeof raw === "string" && ARMOR_SET.has(raw)
    ? (raw as ArmorGrouping)
    : undefined;
}
