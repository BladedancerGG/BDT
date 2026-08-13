"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/** Archétype de la pièce : « Démolisseur », « Parangon »… (12 en tout) */
const ARCHETYPE = "armor_archetypes";
/**
 * Attribut intrinsèque, propre aux armures exotiques. Ces plugs partagent la
 * famille `intrinsics` avec les armatures d'armes, mais sur une armure ils sont
 * les seuls de cette famille.
 */
const INTRINSIC = "intrinsics";

export interface ArmorPerks {
    archetypeHash?: number;
    intrinsicHash?: number;
}

const EMPTY: ArmorPerks = {};

/**
 * Archétype et attribut intrinsèque d'une armure, tels qu'équipés sur
 * l'instance.
 *
 * Les deux vivent dans la catégorie « Attributs de l'armure », mêlés à trois
 * emplacements de statistiques — dont les 180 plugs sont **tous** sans nom ni
 * icône dans le manifeste, de simples réservations. Seule la catégorie de plug
 * les distingue, d'où la lecture de leurs définitions ; on balaie tous les
 * sockets équipés plutôt que cette seule catégorie, pour ne pas dépendre de
 * l'endroit où Bungie les rangera demain.
 */
export function useArmorPerks(
    detail: ItemDetail | undefined,
): ArmorPerks {
    return (
        useLiveQuery(
            async () => {
                // 0 = socket vide, null = socket masqué en jeu
                const hashes = [
                    ...new Set(
                        (detail?.sockets ?? []).filter(
                            (hash): hash is number => typeof hash === "number" && hash > 0,
                        ),
                    ),
                ];
                if (hashes.length === 0) return EMPTY;

                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (hash) =>
                            ["DestinyInventoryItemDefinition", hash] as [string, number],
                    ),
                );

                const perks: ArmorPerks = {};
                rows.forEach((row, i) => {
                    const category = (row?.data as InventoryItemDefinition | undefined)?.plug
                        ?.plugCategoryIdentifier;
                    if (category === ARCHETYPE) perks.archetypeHash ??= hashes[i];
                    if (category === INTRINSIC) perks.intrinsicHash ??= hashes[i];
                });

                return perks.archetypeHash || perks.intrinsicHash ? perks : EMPTY;
            },
            [detail],
            EMPTY,
        ) ?? EMPTY
    );
}
