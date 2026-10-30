"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "./types";
import {ARMOR_BUCKETS} from "./buckets";
import {sumBreakdowns} from "./stat-breakdown";
import {loadStatBreakdown, type StatBreakdowns} from "./use-stat-breakdown";

const EMPTY: StatBreakdowns = {};

/**
 * Décomposition des statistiques du personnage : base, attributs et mods,
 * pièce maîtresse, sommées sur ses pièces d'armure — voir `sumBreakdowns`.
 *
 * Chaque pièce passe par la même décomposition que son infobulle : les deux
 * vues s'accordent donc, pièce par pièce. Les sockets lus sont ceux qui ont
 * produit `detail.stats` — comme `useShownStats`, qui ne tient pas compte des
 * attributs enregistrés dans un équipement sauvegardé.
 *
 * À n'appeler que dans l'infobulle : cinq lectures du manifeste par
 * personnage, inutiles tant que personne ne la regarde.
 */
export function useCharacterStatBreakdown(
    totals: Record<string, number>,
    items: readonly DestinyItemComponent[],
    details: Record<string, ItemDetail>,
    statHashes: readonly number[],
): StatBreakdowns {
    const armor = items.filter(
        (item) => ARMOR_BUCKETS.has(item.bucketHash) && item.itemInstanceId,
    );

    return (
        useLiveQuery(
            async () => {
                const rows = await manifestDb.definitions.bulkGet(
                    armor.map(
                        (item) =>
                            ["DestinyInventoryItemDefinition", item.itemHash] as [string, number],
                    ),
                );
                const pieces = await Promise.all(
                    armor.map((item, i) => {
                        const detail = details[item.itemInstanceId!];
                        return loadStatBreakdown({
                            def: rows[i]?.data as InventoryItemDefinition | undefined,
                            detail,
                            shownSockets: undefined,
                            statHashes,
                            weapon: false,
                            state: item.state,
                            gearTier: detail?.instance?.gearTier,
                            weaponLevel: undefined,
                        });
                    }),
                );
                return sumBreakdowns(pieces, totals, statHashes);
            },
            // Objets et totaux recréés à chaque rendu : la dépendance porte sur
            // leur contenu. `details` est mémoïsé chez tous les appelants.
            [
                armor.map((item) => item.itemInstanceId).join(","),
                details,
                JSON.stringify(totals),
                statHashes.join(","),
            ],
            EMPTY,
        ) ?? EMPTY
    );
}
