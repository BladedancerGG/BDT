"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type { ItemDetail } from "@/lib/bungie/item";
import type {
  InventoryItemDefinition,
  PlugSetDefinition,
} from "@/lib/destiny/types";

/** Une colonne de perks : le plug équipé + toutes les options possibles. */
export interface SocketColumn {
  socketIndex: number;
  equippedHash?: number;
  /** Tous les plugs équipables sur ce socket (inclut l'équipé) */
  options: number[];
}

/**
 * Calcule les colonnes de perks d'une catégorie de sockets.
 *
 * Trois sources, par ordre de fiabilité :
 *  1. `reusablePlugs` de l'API (composant 310) → ce qui est réellement
 *     disponible sur CETTE instance d'objet ;
 *  2. le plug set du manifeste (`randomizedPlugSetHash` / `reusablePlugSetHash`)
 *     → pool possible, utile quand l'API ne renvoie rien ;
 *  3. `reusablePlugItems` / `singleInitialItemHash` de la définition.
 */
export function useSocketColumns(
  def: InventoryItemDefinition | undefined,
  detail: ItemDetail | undefined,
  categoryHash: number,
): SocketColumn[] {
  return (
    useLiveQuery(
      async () => {
        if (!def?.sockets) return [];

        const category = def.sockets.socketCategories?.find(
          (c) => c.socketCategoryHash === categoryHash,
        );
        if (!category) return [];

        // Pré-charge les plug sets nécessaires en une seule requête
        const plugSetHashes = new Set<number>();
        for (const index of category.socketIndexes) {
          const entry = def.sockets.socketEntries[index];
          const hash = entry?.randomizedPlugSetHash ?? entry?.reusablePlugSetHash;
          if (hash) plugSetHashes.add(hash);
        }
        const plugSets = new Map<number, PlugSetDefinition>();
        if (plugSetHashes.size > 0) {
          const hashes = [...plugSetHashes];
          const rows = await manifestDb.definitions.bulkGet(
            hashes.map((h) => ["DestinyPlugSetDefinition", h] as [string, number]),
          );
          rows.forEach((row, i) => {
            if (row) plugSets.set(hashes[i], row.data as PlugSetDefinition);
          });
        }

        const columns: SocketColumn[] = [];

        for (const socketIndex of category.socketIndexes) {
          const entry = def.sockets.socketEntries[socketIndex];
          if (!entry) continue;

          const socket = detail?.sockets?.[socketIndex];
          // Sockets masqués en jeu (ex: emplacements internes)
          if (socket && !socket.isVisible) continue;

          const equippedHash = socket?.plugHash ?? entry.singleInitialItemHash;

          // 1. Options renvoyées par l'API pour cette instance
          let options = (detail?.reusablePlugs?.[String(socketIndex)] ?? []).map(
            (p) => p.plugItemHash,
          );

          // 2. Fallback : pool du manifeste
          if (options.length === 0) {
            const setHash =
              entry.randomizedPlugSetHash ?? entry.reusablePlugSetHash;
            const plugSet = setHash ? plugSets.get(setHash) : undefined;
            if (plugSet) {
              options = plugSet.reusablePlugItems
                .filter((p) => p.currentlyCanRoll !== false)
                .map((p) => p.plugItemHash);
            }
          }

          // 3. Fallback : plugs listés directement dans la définition
          if (options.length === 0 && entry.reusablePlugItems?.length) {
            options = entry.reusablePlugItems.map((p) => p.plugItemHash);
          }

          // 4. Dernier recours : uniquement le plug équipé
          if (options.length === 0 && equippedHash) {
            options = [equippedHash];
          }

          // Dédoublonne en gardant l'ordre, et garantit la présence de l'équipé
          const seen = new Set<number>();
          const unique = options.filter(
            (h) => h > 0 && !seen.has(h) && seen.add(h),
          );
          if (equippedHash && !unique.includes(equippedHash)) {
            unique.unshift(equippedHash);
          }

          if (unique.length > 0) {
            columns.push({ socketIndex, equippedHash, options: unique });
          }
        }

        return columns;
      },
      [def, detail, categoryHash],
      [] as SocketColumn[],
    ) ?? []
  );
}
