"use client";

import {useMemo} from "react";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "./types";

/**
 * Objets d'un équipement sauvegardé, retrouvés dans le profil.
 *
 * L'API ne donne qu'un `itemInstanceId` par entrée : l'objet lui-même peut être
 * n'importe où — équipé, dans l'inventaire d'un autre personnage, au coffre.
 * D'où l'index sur tout le profil.
 *
 * Le `bucketHash` du composant ne convient pas tel quel : un objet au coffre
 * porte celui du coffre, et l'affichage par emplacement le rangerait hors de sa
 * ligne. C'est celui de sa **définition** (`inventory.bucketTypeHash`) qui dit
 * où il s'équipe, et lui qu'on retient.
 *
 * Une entrée dont l'instance a disparu (objet démantelé depuis l'enregistrement)
 * est simplement absente : la ligne se montre alors vide, comme en jeu.
 */
export function useLoadoutItems(
    loadout: DestinyLoadout | undefined,
    data: ProfileData,
    defs: Map<number, InventoryItemDefinition>,
): DestinyItemComponent[] | undefined {
    const index = useMemo(() => {
        const map = new Map<string, DestinyItemComponent>();
        for (const item of [
            ...Object.values(data.equipment),
            ...Object.values(data.inventory),
            data.vault,
        ].flat()) {
            if (item.itemInstanceId) map.set(item.itemInstanceId, item);
        }
        return map;
    }, [data]);

    return useMemo(() => {
        if (!loadout || loadout.items.length === 0) return undefined;
        return loadout.items.flatMap((entry) => {
            const item = index.get(entry.itemInstanceId);
            if (!item) return [];
            const bucketHash =
                defs.get(item.itemHash)?.inventory?.bucketTypeHash ?? item.bucketHash;
            return [{...item, bucketHash}];
        });
    }, [loadout, index, defs]);
}
