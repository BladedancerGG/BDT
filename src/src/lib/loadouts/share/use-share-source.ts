"use client";

import {useMemo} from "react";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import type {ShareSource} from "./snapshot";

/**
 * De quoi résoudre un partage depuis le profil affiché.
 *
 * L'index couvre tout le compte — équipé, inventaires, coffre : un équipement
 * enregistré désigne ses objets par instance, et l'objet peut être n'importe
 * où. C'est le même index que `useLoadoutItems`, monté ici une fois pour les
 * deux écrans qui partagent (la liste des groupes et l'éditeur).
 */
export function useShareSource(
    data: ProfileData,
    defs: Map<number, InventoryItemDefinition>,
): ShareSource {
    return useMemo(() => {
        const items = new Map<string, DestinyItemComponent>();
        for (const item of [
            ...Object.values(data.equipment),
            ...Object.values(data.inventory),
            data.vault,
        ].flat()) {
            if (item.itemInstanceId) items.set(item.itemInstanceId, item);
        }

        return {
            items,
            details: data.items,
            bucketOf: (itemHash) => defs.get(itemHash)?.inventory?.bucketTypeHash,
        };
    }, [data, defs]);
}
