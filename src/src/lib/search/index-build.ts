// Index des plugs équipés, construit pour toute la vue en une seule lecture
// groupée du manifeste.
//
// Plusieurs besoins, une seule lecture :
//
//  • le **nom** des attributs et mods équipés, que la recherche textuelle
//    parcourt au même titre que le nom de l'objet (`frenzy` doit trouver les
//    armes portant Frénésie) ;
//  • les **écarts de statistiques** apportés par les mods, indispensables pour
//    remonter à la statistique de base (`basestat:`) ;
//  • tout ce qu'un objet ne dit qu'à travers ses plugs : mod posé, revêtement,
//    ornement, ajustage, archétype, particularité d'origine, résonance
//    profonde, effet anti-champion, statistique de la pièce maîtresse
//    (`is:modded`, `is:shaded`, `breaker:`, `masterwork:`…).
//
// Ce n'est pas fait par `ItemDefsProvider` : cela coûte quelques milliers de
// définitions de plugs, inutiles tant que rien n'est recherché. L'index n'est
// donc construit qu'à la première requête qui en a besoin (voir `provider.tsx`).

import { manifestDb } from "@/lib/manifest/db";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type {
  InventoryItemDefinition,
  ObjectiveDefinition,
} from "@/lib/destiny/types";
import { ITEM_TYPE, SOCKET_CATEGORY } from "@/lib/destiny/display";
import { plugStatModifiers } from "@/lib/destiny/plug-stats";
import { isOrnamentPlug } from "@/lib/destiny/ornaments";
import { ARMOR_INTRINSIC_PLUG_CATEGORY } from "@/lib/destiny/use-armor-perks";
import { weaponBreakerType } from "@/lib/destiny/breaker";
import {
  isEnhancedPlug,
  isMasterworkPlug,
  isPlugApplied,
  isTrackerPlug,
} from "@/lib/destiny/sockets";
import { SEARCH_FLAG } from "./flags";
import { normalizeText } from "./keywords";

/**
 * Catégories de sockets portant ce que `basestat:` doit retrancher.
 *
 * Relevé sur le manifeste (version 244213) : sur une armure Edge of Fate, les
 * mods, la pièce maîtresse (« Amélioration d'armure ») **et** l'ajustage
 * (« Mod d'ajustage ») occupent tous trois des sockets de la catégorie
 * ARMOR MODS ; les tirages de statistiques de base, eux, sont des plugs
 * `armor_stats` de la catégorie ARMOR PERKS, qui restent donc dans la base.
 * Côté armes, la pièce maîtresse et les mods relèvent de WEAPON MODS, tandis
 * que canons et chargeurs relèvent de WEAPON PERKS.
 *
 * La règle est donc uniforme et se dit en une phrase : la base est la valeur
 * **avant les sockets de mods**.
 */
const MOD_SOCKET_CATEGORIES: ReadonlySet<number> = new Set([
  SOCKET_CATEGORY.ARMOR_MODS,
  SOCKET_CATEGORY.WEAPON_MODS,
]);

/** Catégories portant les attributs — ce que `is:enhancedperk` dénombre. */
const PERK_SOCKET_CATEGORIES: ReadonlySet<number> = new Set([
  SOCKET_CATEGORY.WEAPON_PERKS,
  SOCKET_CATEGORY.ARMOR_PERKS,
]);

// —— Familles de plugs reconnues ————————————————————————————————
//
// Toutes relevées dans `plug.plugCategoryIdentifier` sur le manifeste (version
// 244213). Ce sont des chaînes indépendantes de la langue, contrairement aux
// noms des plugs : c'est la seule façon de reconnaître un revêtement ou un mod
// d'ajustage sans supposer que le manifeste est en anglais.

/** Revêtement. 720 plugs, tous dans cette unique famille. */
const SHADER_FAMILY = "shader";

/** Particularité d'origine d'une arme. 187 plugs. */
const ORIGIN_TRAIT_FAMILY = "origins";

/** Résonance profonde d'une arme façonnable. 4 plugs, tous nommés ainsi. */
const DEEPSIGHT_FAMILY = "crafting.plugs.weapons.mods.memories";

/**
 * Archétype d'une armure Edge of Fate (« Parangon », « Démolisseur »… — 12 en
 * tout). Sa seule présence signe une armure 3.0 : les armures antérieures n'en
 * portent aucun.
 */
const ARCHETYPE_FAMILY = "armor_archetypes";

/** Mod d'ajustage d'une armure 3.0 (« +Classe / -Super »). 32 plugs. */
const TUNING_FAMILY = "core.gear_systems.armor_tiering.plugs.tuning.mods";

/**
 * Emplacement d'armure d'artifice.
 *
 * Deux familles, et elles ne se lisent pas de la même façon : sur une armure
 * légendaire, `enhancements.artifice` porte un « Emplacement de mod vide » qui
 * est déjà le plug initial du socket — sa seule présence fait l'armure
 * d'artifice. Sur un exotique, `enhancements.artifice.exotic` commence par un
 * « Emplacement d'artifice verrouillé » : là, il faut que le plug ait été
 * changé. (Relevé : 138 légendaires et 132 exotiques dans le premier cas,
 * 135 exotiques verrouillés dans le second.)
 */
const ARTIFICE_FAMILY = "enhancements.artifice";
const ARTIFICE_EXOTIC_FAMILY = "enhancements.artifice.exotic";

/**
 * Palier d'équipement d'une arme (`weapon_tiering.*`) et niveau d'une arme
 * façonnée (`crafting.plugs.weapons.mods.enhancers`) : deux mécaniques
 * distinctes, mais toutes deux « l'arme peut monter en puissance ».
 */
const TIERING_PREFIX = "weapon_tiering";
const CRAFTED_ENHANCER_FAMILY = "crafting.plugs.weapons.mods.enhancers";

/**
 * Étiquette de l'objectif portant le niveau d'une arme façonnée ou améliorée.
 *
 * On passe par l'`uiLabel` et non par le hash, comme `use-item-progress.ts` :
 * trois hashes distincts portent la progression du même niveau.
 */
const WEAPON_LEVEL_UI_LABEL = "crafting_weapon_level";

/** Ce que la recherche sait d'un objet au-delà de sa définition. */
export interface SearchIndexEntry {
  /** Noms des plugs équipés, normalisés (minuscules, sans accents) */
  plugNames: string[];
  /** Écarts de statistiques dus aux mods, par hash — voir `basestat:` */
  modStats: Map<number, number>;
  /** Masque SEARCH_FLAG */
  flags: number;
  /** Effet anti-champion, déduit de l'armature équipée — voir `breaker.ts` */
  breaker?: number;
  /** Statistiques renforcées par la pièce maîtresse — `masterwork:range` */
  masterworkStats: number[];
  /** Statistique renforcée par le mod d'ajustage — `tunedstat:melee` */
  tunedStat?: number;
  /** Colonnes d'attributs dont la version améliorée est équipée */
  enhancedPerks: number;
  /** Compte-frags de la pièce maîtresse équipée */
  kills?: number;
  /** Niveau d'une arme façonnée ou améliorée */
  weaponLevel?: number;
}

export type SearchIndex = ReadonlyMap<string, SearchIndexEntry>;

export const EMPTY_INDEX: SearchIndex = new Map();

interface ItemRef {
  itemHash: number;
  itemInstanceId?: string;
}

/** Index des sockets d'un objet appartenant à l'une des catégories données. */
function socketIndexesIn(
  def: InventoryItemDefinition,
  categories: ReadonlySet<number>,
): ReadonlySet<number> {
  const indexes = new Set<number>();
  for (const category of def.sockets?.socketCategories ?? []) {
    if (!categories.has(category.socketCategoryHash)) continue;
    for (const index of category.socketIndexes) indexes.add(index);
  }
  return indexes;
}

/** Ce qu'on retient d'une définition de plug, calculé une fois par plug. */
interface PlugFacts {
  name?: string;
  family?: string;
  stats?: Map<number, number>;
  /** Statistiques renforcées, si le plug est une pièce maîtresse */
  masterworkStats?: number[];
  ornament: boolean;
  tracker: boolean;
  masterwork: boolean;
  enhanced: boolean;
  /** Perks de sandbox de l'armature, pour l'effet anti-champion */
  def: InventoryItemDefinition;
}

/**
 * Construit l'index de tous les objets instanciés d'une vue.
 *
 * Trois lectures groupées, jamais une par objet : les plugs équipés d'un compte
 * entier ne représentent que quelques milliers de définitions distinctes, très
 * largement mutualisées, et les objectifs de leurs compteurs quelques dizaines.
 */
export async function buildSearchIndex(
  items: readonly ItemRef[],
  details: Record<string, ItemDetail>,
  defs: ReadonlyMap<number, InventoryItemDefinition>,
): Promise<SearchIndex> {
  // 1. Repérer les plugs équipés et le rôle de leur socket
  interface Candidate {
    itemHash: number;
    def: InventoryItemDefinition;
    detail: ItemDetail;
    modIndexes: ReadonlySet<number>;
    perkIndexes: ReadonlySet<number>;
  }
  const candidates = new Map<string, Candidate>();
  const plugHashes = new Set<number>();
  const objectiveHashes = new Set<number>();

  for (const item of items) {
    if (!item.itemInstanceId) continue;
    const detail = details[item.itemInstanceId];
    const def = defs.get(item.itemHash);
    if (!detail?.sockets || !def) continue;

    for (const plugHash of detail.sockets) {
      // `0` = socket vide ; les valeurs négatives n'existent pas
      if (plugHash > 0) plugHashes.add(plugHash);
    }
    for (const objectives of Object.values(detail.plugObjectives ?? {})) {
      for (const objective of objectives) objectiveHashes.add(objective.objectiveHash);
    }

    candidates.set(item.itemInstanceId, {
      itemHash: item.itemHash,
      def,
      detail,
      modIndexes: socketIndexesIn(def, MOD_SOCKET_CATEGORIES),
      perkIndexes: socketIndexesIn(def, PERK_SOCKET_CATEGORIES),
    });
  }

  if (plugHashes.size === 0) return EMPTY_INDEX;

  // 2. Une lecture groupée pour tout l'inventaire
  const plugList = [...plugHashes];
  const rows = await manifestDb.definitions.bulkGet(
    plugList.map(
      (hash) => ["DestinyInventoryItemDefinition", hash] as [string, number],
    ),
  );

  // Les faits d'un plug ne dépendent pas de l'objet qui le porte : on les
  // calcule une fois par plug, pas une fois par objet.
  const facts = new Map<number, PlugFacts>();
  rows.forEach((row, index) => {
    if (!row) return;
    const def = row.data as InventoryItemDefinition;
    const modifiers = plugStatModifiers(def);
    const masterwork = isMasterworkPlug(def);

    facts.set(plugList[index], {
      name: def.displayProperties?.name
        ? normalizeText(def.displayProperties.name)
        : undefined,
      family: def.plug?.plugCategoryIdentifier,
      stats:
        modifiers.length > 0
          ? new Map(modifiers.map(({ statHash, value }) => [statHash, value]))
          : undefined,
      masterworkStats:
        masterwork && modifiers.length > 0
          ? modifiers.filter((m) => m.value > 0).map((m) => m.statHash)
          : undefined,
      ornament: isOrnamentPlug(def),
      tracker: isTrackerPlug(def),
      masterwork,
      enhanced: isEnhancedPlug(def),
      def,
    });
  });

  // 3. Les objectifs, pour le compte-frags et le niveau d'arme
  const objectiveList = [...objectiveHashes];
  const objectiveRows =
    objectiveList.length > 0
      ? await manifestDb.definitions.bulkGet(
          objectiveList.map(
            (hash) => ["DestinyObjectiveDefinition", hash] as [string, number],
          ),
        )
      : [];
  const weaponLevelObjectives = new Set<number>();
  objectiveRows.forEach((row, index) => {
    const objective = row?.data as ObjectiveDefinition | undefined;
    if (objective?.uiLabel === WEAPON_LEVEL_UI_LABEL) {
      weaponLevelObjectives.add(objectiveList[index]);
    }
  });

  // 4. Rassembler par objet
  const index = new Map<string, SearchIndexEntry>();
  for (const [instanceId, candidate] of candidates) {
    const { itemHash, def, detail, modIndexes, perkIndexes } = candidate;
    const isArmor = def.itemType === ITEM_TYPE.Armor;
    const disabled = new Set(detail.disabledSockets ?? []);

    const names: string[] = [];
    const modStats = new Map<number, number>();
    const masterworkStats: number[] = [];
    let flags = 0;
    let enhancedPerks = 0;
    let tunedStat: number | undefined;
    let frame: InventoryItemDefinition | undefined;

    detail.sockets.forEach((plugHash, socketIndex) => {
      if (plugHash <= 0) return;
      const plug = facts.get(plugHash);
      if (!plug) return;

      if (plug.name) names.push(plug.name);

      const applied = isPlugApplied(def, socketIndex, plugHash);
      const family = plug.family ?? "";

      // —— Sockets de mods : ce que `basestat:` retranche, et `is:modded` ——
      if (modIndexes.has(socketIndex)) {
        for (const [statHash, value] of plug.stats ?? []) {
          modStats.set(statHash, (modStats.get(statHash) ?? 0) + value);
        }
        // La pièce maîtresse et le compte-frags ne sont pas des mods posés :
        // l'un vient du niveau de l'objet, l'autre est un compteur.
        if (applied && !plug.masterwork && !plug.tracker) {
          flags |= SEARCH_FLAG.Modded;
        }
        if (disabled.has(socketIndex)) flags |= SEARCH_FLAG.DisabledMod;
      }

      if (plug.masterworkStats) masterworkStats.push(...plug.masterworkStats);

      // —— Attributs améliorés ——
      if (perkIndexes.has(socketIndex) && plug.enhanced) enhancedPerks += 1;

      // —— Familles ——
      if (family === SHADER_FAMILY && applied) flags |= SEARCH_FLAG.Shaded;
      if (plug.ornament && applied) flags |= SEARCH_FLAG.Ornamented;
      if (family === ORIGIN_TRAIT_FAMILY) flags |= SEARCH_FLAG.OriginTrait;
      if (family === DEEPSIGHT_FAMILY) flags |= SEARCH_FLAG.Deepsight;
      if (family === ARCHETYPE_FAMILY) flags |= SEARCH_FLAG.Armor3;
      if (
        family === ARTIFICE_FAMILY ||
        (family === ARTIFICE_EXOTIC_FAMILY && applied)
      ) {
        flags |= SEARCH_FLAG.Artifice;
      }
      if (family === TUNING_FAMILY && applied) {
        flags |= SEARCH_FLAG.Tuned;
        // Un ajustage donne d'un côté ce qu'il retire de l'autre : la
        // statistique « ajustée » est celle qu'il renforce. « Ajustage
        // équilibré » fait exception — il donne +1 aux six à la fois, et ne
        // renforce donc rien en particulier : c'est le `tunedstat:unfocused`
        // de DIM, un ajustage posé sans statistique désignée.
        const raised = [...(plug.stats ?? [])].filter(([, value]) => value > 0);
        if (raised.length === 1) tunedStat = raised[0][0];
      }
      if (family.startsWith(TIERING_PREFIX)) flags |= SEARCH_FLAG.Tiered;
      if (family === CRAFTED_ENHANCER_FAMILY || family.startsWith(TIERING_PREFIX)) {
        flags |= SEARCH_FLAG.Enhanceable;
      }
      if (family === ARMOR_INTRINSIC_PLUG_CATEGORY) {
        if (isArmor) flags |= SEARCH_FLAG.ArmorIntrinsic;
        // Côté arme, la même famille porte l'armature — et avec elle l'effet
        // anti-champion, qui ne se lit nulle part ailleurs.
        else frame = plug.def;
      }
    });

    // —— Compteurs portés par les objectifs des plugs équipés ——
    let kills: number | undefined;
    let weaponLevel: number | undefined;
    for (const [plugHash, objectives] of Object.entries(
      detail.plugObjectives ?? {},
    )) {
      const plug = facts.get(Number(plugHash));
      for (const objective of objectives) {
        if (weaponLevelObjectives.has(objective.objectiveHash)) {
          weaponLevel = objective.progress;
        } else if (plug?.tracker) {
          kills = (kills ?? 0) + objective.progress;
        }
      }
    }

    index.set(instanceId, {
      plugNames: names,
      modStats,
      flags,
      breaker:
        def.itemType === ITEM_TYPE.Weapon
          ? weaponBreakerType({ declared: def.breakerType, itemHash, frame })
          : undefined,
      masterworkStats,
      tunedStat,
      enhancedPerks,
      kills,
      weaponLevel,
    });
  }

  return index;
}
