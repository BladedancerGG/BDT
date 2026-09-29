"use client";

import {useMemo} from "react";
import type {ItemCategory} from "@/lib/settings/constants";
import {useItemDefs} from "./item-defs";
import {CUSTOMIZATION_BUCKETS, STORAGE_BUCKETS} from "./buckets";
import {DISPLAYED_ITEM_TYPES, DISPLAYED_BUCKETS} from "./display";

/** Emplacements du rangement partagé, en ensemble pour le test d'appartenance. */
const STORAGE_SET: ReadonlySet<number> = new Set(STORAGE_BUCKETS);

/**
 * Ne garde que les objets de la famille demandée.
 *
 * `equipment` — la valeur par défaut, et la seule que connaissaient les
 * appelants historiques — laisse passer armes, armures, doctrines et artéfacts.
 * Les deux autres familles se reconnaissent à leur **emplacement d'origine** :
 * `inventory.bucketTypeHash`, et non `bucketHash`, qui vaut « Général » pour
 * tout ce qui dort au coffre.
 *
 * Les définitions viennent du lot déjà préchargé par `ItemDefsProvider` : le
 * filtrage est donc purement synchrone, sans requête supplémentaire.
 */
export function useDisplayableItems<T extends { itemHash: number }>(
    items: T[],
    category: ItemCategory = "equipment",
): T[] {
    const {defs, ready} = useItemDefs();

    return useMemo(() => {
        // Tant que les définitions ne sont pas là, ne rien afficher plutôt que
        // d'afficher une liste incomplète
        if (!ready) return [];

        return items.filter((item) => {
            const def = defs.get(item.itemHash);
            if (!def) return false;
            const bucket = def.inventory?.bucketTypeHash ?? 0;

            if (category === "customization") return CUSTOMIZATION_BUCKETS.has(bucket);
            if (category === "inventory") return STORAGE_SET.has(bucket);

            return (
                DISPLAYED_ITEM_TYPES.has(def.itemType) ||
                // Les artéfacts ne sont identifiables que par leur emplacement
                DISPLAYED_BUCKETS.has(bucket)
            );
        });
    }, [items, defs, ready, category]);
}
