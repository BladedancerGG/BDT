// Index des plugs équipés, construit pour toute la vue en une seule lecture
// groupée du manifeste.
//
// Deux besoins, une seule lecture :
//
//  • le **nom** des attributs et mods équipés, que la recherche textuelle
//    parcourt au même titre que le nom de l'objet (`frenzy` doit trouver les
//    armes portant Frénésie) ;
//  • les **écarts de statistiques** apportés par les mods, indispensables pour
//    remonter à la statistique de base (`basestat:`).
//
// Ce n'est pas fait par `ItemDefsProvider` : cela coûte quelques milliers de
// définitions de plugs, inutiles tant que rien n'est recherché. L'index n'est
// donc construit qu'à la première requête qui en a besoin (voir `provider.tsx`).

import { manifestDb } from "@/lib/manifest/db";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import { SOCKET_CATEGORY } from "@/lib/destiny/display";
import { plugStatModifiers } from "@/lib/destiny/plug-stats";
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

/** Ce que la recherche sait d'un objet au-delà de sa définition. */
export interface SearchIndexEntry {
  /** Noms des plugs équipés, normalisés (minuscules, sans accents) */
  plugNames: string[];
  /** Écarts de statistiques dus aux mods, par hash — voir `basestat:` */
  modStats: Map<number, number>;
}

export type SearchIndex = ReadonlyMap<string, SearchIndexEntry>;

export const EMPTY_INDEX: SearchIndex = new Map();

interface ItemRef {
  itemHash: number;
  itemInstanceId?: string;
}

/** Index des sockets de mods d'un objet, d'après les catégories de sa définition. */
function modSocketIndexes(def: InventoryItemDefinition): ReadonlySet<number> {
  const indexes = new Set<number>();
  for (const category of def.sockets?.socketCategories ?? []) {
    if (!MOD_SOCKET_CATEGORIES.has(category.socketCategoryHash)) continue;
    for (const index of category.socketIndexes) indexes.add(index);
  }
  return indexes;
}

/**
 * Construit l'index de tous les objets instanciés d'une vue.
 *
 * Une seule lecture groupée : les plugs équipés d'un compte entier ne
 * représentent que quelques milliers de définitions distinctes, très largement
 * mutualisées d'un objet à l'autre.
 */
export async function buildSearchIndex(
  items: readonly ItemRef[],
  details: Record<string, ItemDetail>,
  defs: ReadonlyMap<number, InventoryItemDefinition>,
): Promise<SearchIndex> {
  // 1. Repérer les plugs équipés, et lesquels relèvent d'un socket de mod
  interface Candidate {
    plugs: number[];
    modPlugs: number[];
  }
  const candidates = new Map<string, Candidate>();
  const plugHashes = new Set<number>();

  for (const item of items) {
    if (!item.itemInstanceId) continue;
    const sockets = details[item.itemInstanceId]?.sockets;
    const def = defs.get(item.itemHash);
    if (!sockets || !def) continue;

    const modIndexes = modSocketIndexes(def);
    const candidate: Candidate = { plugs: [], modPlugs: [] };

    sockets.forEach((plugHash, index) => {
      // `null` = socket masqué en jeu, `0` = socket vide
      if (!plugHash || plugHash <= 0) return;
      candidate.plugs.push(plugHash);
      if (modIndexes.has(index)) candidate.modPlugs.push(plugHash);
      plugHashes.add(plugHash);
    });

    if (candidate.plugs.length > 0) {
      candidates.set(item.itemInstanceId, candidate);
    }
  }

  if (plugHashes.size === 0) return EMPTY_INDEX;

  // 2. Une lecture groupée pour tout l'inventaire
  const plugList = [...plugHashes];
  const rows = await manifestDb.definitions.bulkGet(
    plugList.map(
      (hash) => ["DestinyInventoryItemDefinition", hash] as [string, number],
    ),
  );

  const plugDefs = new Map<number, InventoryItemDefinition>();
  rows.forEach((row, index) => {
    if (row) plugDefs.set(plugList[index], row.data as InventoryItemDefinition);
  });

  // Les écarts d'un plug ne dépendent pas de l'objet qui le porte : on les
  // calcule une fois par plug, pas une fois par objet.
  const plugNames = new Map<number, string>();
  const plugStats = new Map<number, Map<number, number>>();
  for (const [hash, def] of plugDefs) {
    const name = def.displayProperties?.name;
    if (name) plugNames.set(hash, normalizeText(name));

    const modifiers = plugStatModifiers(def);
    if (modifiers.length > 0) {
      plugStats.set(
        hash,
        new Map(modifiers.map(({ statHash, value }) => [statHash, value])),
      );
    }
  }

  // 3. Rassembler par objet
  const index = new Map<string, SearchIndexEntry>();
  for (const [instanceId, candidate] of candidates) {
    const names: string[] = [];
    for (const hash of candidate.plugs) {
      const name = plugNames.get(hash);
      if (name) names.push(name);
    }

    const modStats = new Map<number, number>();
    for (const hash of candidate.modPlugs) {
      const stats = plugStats.get(hash);
      if (!stats) continue;
      for (const [statHash, value] of stats) {
        modStats.set(statHash, (modStats.get(statHash) ?? 0) + value);
      }
    }

    index.set(instanceId, { plugNames: names, modStats });
  }

  return index;
}
