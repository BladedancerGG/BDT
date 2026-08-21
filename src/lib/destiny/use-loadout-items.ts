"use client";

import {useMemo} from "react";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
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
 *
 * Renvoie `undefined` pour un emplacement **libre**, et c'est ce qui fait
 * retomber l'affichage sur l'équipement porté. Un emplacement libre porte
 * pourtant des entrées dans `items` (voir `isEmptyLoadout`) : sans ce test, elles
 * ne résolvaient rien et la vue se vidait de ses dix lignes.
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
        // Le `!loadout` est là pour l'analyse de types, que le prédicat ne
        // porte pas jusqu'ici.
        if (!loadout || isEmptyLoadout(loadout)) return undefined;
        return loadout.items.flatMap((entry) => {
            const item = index.get(entry.itemInstanceId);
            if (!item) return [];
            const bucketHash =
                defs.get(item.itemHash)?.inventory?.bucketTypeHash ?? item.bucketHash;
            return [{...item, bucketHash}];
        });
    }, [loadout, index, defs]);
}
