"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type { InventoryItemDefinition } from "./types";
import {
  ITEM_CONSTANTS_HASH,
  type ItemConstantsDefinition,
} from "./overlays";

/**
 * Définitions du manifeste mutualisées pour tout un inventaire.
 *
 * Sans ça, chaque vignette lançait sa propre requête IndexedDB (définition de
 * l'objet + constantes d'overlay) : avec un coffre de ~1000 objets, cela faisait
 * plus de 2000 souscriptions Dexie. Ici, une seule requête groupée sert tout
 * l'arbre.
 */
interface ItemDefsValue {
  defs: Map<number, InventoryItemDefinition>;
  constants?: ItemConstantsDefinition;
  /** false tant que la requête groupée n'a pas abouti */
  ready: boolean;
}

const EMPTY: ItemDefsValue = { defs: new Map(), ready: false };

const ItemDefsContext = createContext<ItemDefsValue>(EMPTY);

export function ItemDefsProvider({
  hashes,
  children,
}: {
  /** Tous les itemHash susceptibles d'être affichés dans cet arbre */
  hashes: number[];
  children: ReactNode;
}) {
  const value = useLiveQuery(
    async () => {
      const unique = [...new Set(hashes)];
      const [rows, constantsRow] = await Promise.all([
        manifestDb.definitions.bulkGet(
          unique.map(
            (hash) =>
              ["DestinyInventoryItemDefinition", hash] as [string, number],
          ),
        ),
        manifestDb.definitions.get([
          "DestinyInventoryItemConstantsDefinition",
          ITEM_CONSTANTS_HASH,
        ]),
      ]);

      const defs = new Map<number, InventoryItemDefinition>();
      rows.forEach((row, i) => {
        if (row) defs.set(unique[i], row.data as InventoryItemDefinition);
      });

      return {
        defs,
        constants: constantsRow?.data as ItemConstantsDefinition | undefined,
        ready: true,
      };
    },
    [hashes],
    EMPTY,
  );

  return (
    <ItemDefsContext.Provider value={value ?? EMPTY}>
      {children}
    </ItemDefsContext.Provider>
  );
}

export function useItemDefs(): ItemDefsValue {
  return useContext(ItemDefsContext);
}

/** Définition d'un objet, servie depuis le lot préchargé. */
export function useSharedDefinition(
  hash: number,
): InventoryItemDefinition | undefined {
  return useItemDefs().defs.get(hash);
}

/** Constantes d'overlay (palier, façonné, amélioré), chargées une seule fois. */
export function useSharedItemConstants(): ItemConstantsDefinition | undefined {
  return useItemDefs().constants;
}
