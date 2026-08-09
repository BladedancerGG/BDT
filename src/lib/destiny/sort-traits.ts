// Résolution des caractéristiques d'un objet dont le **nom** vit ailleurs que
// dans sa propre définition : armature d'arme, archétype d'armure, bonus
// d'ensemble. Toutes demandent une lecture supplémentaire du manifeste,
// mutualisée ici pour tout l'inventaire.
//
// Les deux premières sont des plugs équipés dans un socket ; la troisième est
// une table à part (DestinyEquipableItemSetDefinition), la définition de
// l'armure n'en portant que le hash.
//
// Constaté sur le manifeste (version 244213) :
//   • Armature d'arme  → socket de catégorie INTRINSIC, plug `intrinsics`.
//     Couverture 2059/2059 des armes légendaires et exotiques.
//   • Archétype d'armure → socket de catégorie ARMOR_PERKS, plug
//     `armor_archetypes` (12 valeurs : Rempart, Grenadier, Mitrailleur…).
//
// Le bassin complet des plugs pouvant occuper ces sockets ne compte que
// ~500 entrées pour tout le jeu : la lecture groupée reste donc peu coûteuse.

import { manifestDb } from "@/lib/manifest/db";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type {
  EquipableItemSetDefinition,
  InventoryItemDefinition,
} from "./types";
import { ITEM_TYPE, SOCKET_CATEGORY } from "./display";
import { itemSetHash } from "./set-bonus";

/** Caractéristiques d'un objet servant au tri, par itemInstanceId. */
export interface ItemSortTraits {
  /** Nom de l'armature (« Armature de tir rapide ») — armes uniquement */
  frame?: string;
  /** Nom de l'archétype (« Rempart », « Grenadier ») — armures uniquement */
  archetype?: string;
  /** Icône de ce même archétype, pour l'en-tête de son groupe */
  archetypeIcon?: string;
  /** Nom de l'ensemble conférant des bonus — armures uniquement */
  setBonus?: string;
}

/** Familles de plugs identifiant ces caractéristiques. */
const PLUG_CATEGORY = {
  /** Armature d'arme — porte aussi les attributs intrinsèques d'armure exotique */
  Intrinsic: "intrinsics",
  ArmorArchetype: "armor_archetypes",
} as const;

interface ItemRef {
  itemHash: number;
  itemInstanceId?: string;
}

/**
 * Index des sockets susceptibles de porter la caractéristique cherchée.
 *
 * On cible la catégorie plutôt que l'index : celui-ci varie d'un objet à
 * l'autre. Rien n'est codé en dur hormis les hashes de catégorie, stables.
 */
function traitSocketIndexes(def: InventoryItemDefinition): number[] {
  const category =
    def.itemType === ITEM_TYPE.Weapon
      ? SOCKET_CATEGORY.INTRINSIC
      : def.itemType === ITEM_TYPE.Armor
        ? SOCKET_CATEGORY.ARMOR_PERKS
        : undefined;
  if (category === undefined) return [];

  return (
    def.sockets?.socketCategories?.find(
      (entry) => entry.socketCategoryHash === category,
    )?.socketIndexes ?? []
  );
}

/**
 * Lit l'armature et l'archétype de chaque objet instancié.
 *
 * Le plug **équipé** est privilégié sur le plug initial de la définition : une
 * arme améliorée porte une armature améliorée, dont le nom diffère.
 */
export async function loadSortTraits(
  items: readonly ItemRef[],
  details: Record<string, ItemDetail>,
  defs: Map<number, InventoryItemDefinition>,
): Promise<Map<string, ItemSortTraits>> {
  // 1. Repérer ce qu'il y a à résoudre, sans doublon
  interface Candidate {
    itemType: number;
    plugs: number[];
    setHash?: number;
  }
  const candidates = new Map<string, Candidate>();
  const plugHashes = new Set<number>();
  const setHashes = new Set<number>();

  for (const item of items) {
    if (!item.itemInstanceId) continue;

    const def = defs.get(item.itemHash);
    if (!def) continue;

    const plugs: number[] = [];
    for (const index of traitSocketIndexes(def)) {
      const plugHash =
        details[item.itemInstanceId]?.sockets?.[index] ||
        def.sockets?.socketEntries?.[index]?.singleInitialItemHash;
      if (!plugHash || plugHash <= 0) continue;

      plugs.push(plugHash);
      plugHashes.add(plugHash);
    }

    // L'ensemble ne dépend que de la définition, sans passer par les sockets :
    // une armure sans socket d'attribut peut tout de même appartenir à un
    // ensemble, et son bonus doit rester triable.
    const setHash =
      def.itemType === ITEM_TYPE.Armor ? itemSetHash(def) : undefined;
    if (setHash) setHashes.add(setHash);

    if (plugs.length > 0 || setHash) {
      candidates.set(item.itemInstanceId, {
        itemType: def.itemType,
        plugs,
        setHash,
      });
    }
  }

  if (plugHashes.size === 0 && setHashes.size === 0) return new Map();

  // 2. Deux lectures groupées pour tout l'inventaire, menées de front
  const plugList = [...plugHashes];
  const setList = [...setHashes];

  const [plugRows, setRows] = await Promise.all([
    manifestDb.definitions.bulkGet(
      plugList.map(
        (hash) => ["DestinyInventoryItemDefinition", hash] as [string, number],
      ),
    ),
    manifestDb.definitions.bulkGet(
      setList.map(
        (hash) =>
          ["DestinyEquipableItemSetDefinition", hash] as [string, number],
      ),
    ),
  ]);

  const plugDefs = new Map<number, InventoryItemDefinition>();
  plugRows.forEach((row, index) => {
    if (row) plugDefs.set(plugList[index], row.data as InventoryItemDefinition);
  });

  const setNames = new Map<number, string>();
  setRows.forEach((row, index) => {
    const name = (row?.data as EquipableItemSetDefinition | undefined)
      ?.displayProperties?.name;
    if (name) setNames.set(setList[index], name);
  });

  // 3. Classer chaque plug d'après sa famille
  const traits = new Map<string, ItemSortTraits>();

  for (const [instanceId, { itemType, plugs, setHash }] of candidates) {
    const entry: ItemSortTraits = {};

    if (setHash) entry.setBonus = setNames.get(setHash);

    for (const plugHash of plugs) {
      const plugDef = plugDefs.get(plugHash);
      const category = plugDef?.plug?.plugCategoryIdentifier;
      const name = plugDef?.displayProperties?.name;
      if (!name) continue;

      // Le type de l'objet lève l'ambiguïté : les attributs intrinsèques d'une
      // armure exotique relèvent de la même famille `intrinsics` que les
      // armatures d'armes, mais ne sont pas des armatures.
      if (
        category === PLUG_CATEGORY.Intrinsic &&
        itemType === ITEM_TYPE.Weapon &&
        !entry.frame
      ) {
        entry.frame = name;
      } else if (
        category === PLUG_CATEGORY.ArmorArchetype &&
        itemType === ITEM_TYPE.Armor &&
        !entry.archetype
      ) {
        entry.archetype = name;
        entry.archetypeIcon = plugDef?.displayProperties?.icon;
      }
    }

    if (entry.frame || entry.archetype || entry.setBonus) {
      traits.set(instanceId, entry);
    }
  }

  return traits;
}
