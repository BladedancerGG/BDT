"use client";

import { useMemo } from "react";
import { useItemDefs } from "./item-defs";
import { DISPLAYED_ITEM_TYPES, DISPLAYED_BUCKETS } from "./display";

/**
 * Ne garde que les objets affichables : armes, armures, doctrines et artéfacts.
 *
 * Les définitions viennent du lot déjà préchargé par `ItemDefsProvider` : le
 * filtrage est donc purement synchrone, sans requête supplémentaire.
 */
export function useDisplayableItems<T extends { itemHash: number }>(
  items: T[],
): T[] {
  const { defs, ready } = useItemDefs();

  return useMemo(() => {
    // Tant que les définitions ne sont pas là, ne rien afficher plutôt que
    // d'afficher une liste incomplète
    if (!ready) return [];

    return items.filter((item) => {
      const def = defs.get(item.itemHash);
      if (!def) return false;
      return (
        DISPLAYED_ITEM_TYPES.has(def.itemType) ||
        // Les artéfacts ne sont identifiables que par leur emplacement
        DISPLAYED_BUCKETS.has(def.inventory?.bucketTypeHash ?? 0)
      );
    });
  }, [items, defs, ready]);
}
