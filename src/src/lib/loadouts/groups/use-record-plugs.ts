"use client";

import {useMemo} from "react";
import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import {useProfile} from "@/lib/bungie/use-profile";
import {ITEM_STATE, isCrafted} from "@/lib/destiny/overlays";
import {recordedPlugs} from "@/lib/destiny/perk-upgrades";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/** Ce qu'un instantané de groupe enregistre réellement des sockets d'un objet. */
export type RecordPlugs = (
    itemInstanceId: string,
    plugItemHashes: readonly number[],
) => number[];

/** Sans objet façonné en vue, il n'y a rien à retenir. */
const VERBATIM: RecordPlugs = (_, plugItemHashes) => [...plugItemHashes];

/**
 * Le filtre à appliquer aux attributs qu'un groupe enregistre.
 *
 * Il n'existe que pour les armes **façonnées**, dont les colonnes d'attributs
 * n'ont qu'un choix et changent de hash à chaque refaçonnage — voir
 * `recordedPlugs`, qui en porte la raison.
 *
 * Seuls les objets façonnés du profil font l'objet d'une lecture du manifeste,
 * et ils se comptent par dizaines quand l'inventaire en compte un millier :
 * charger la définition de chacun pour en lire les catégories de sockets aurait
 * coûté cher pour une question qui ne se pose presque jamais.
 */
export function useRecordPlugs(): RecordPlugs {
    const {data: profile} = useProfile();

    /** Objets façonnés du profil : instance → hash d'objet. */
    const crafted = useMemo(() => {
        const out = new Map<string, number>();
        if (!profile) return out;
        for (const item of [
            ...Object.values(profile.equipment),
            ...Object.values(profile.inventory),
            profile.vault,
        ].flat()) {
            if (item.itemInstanceId && isCrafted(item.state)) {
                out.set(item.itemInstanceId, item.itemHash);
            }
        }
        return out;
    }, [profile]);

    const hashes = useMemo(() => [...new Set(crafted.values())], [crafted]);

    const defs = useLiveQuery(async () => {
        if (hashes.length === 0) return new Map<number, InventoryItemDefinition>();
        const rows = await manifestDb.definitions.bulkGet(
            hashes.map(
                (hash) => ["DestinyInventoryItemDefinition", hash] as [string, number],
            ),
        );
        const out = new Map<number, InventoryItemDefinition>();
        rows.forEach((row, index) => {
            if (row) out.set(hashes[index], row.data as InventoryItemDefinition);
        });
        return out;
    }, [hashes]);

    return useMemo(() => {
        // Tant que le manifeste n'a pas répondu, mieux vaut enregistrer tel
        // quel : l'instantané reste juste, seule la simplification manque.
        if (crafted.size === 0 || !defs) return VERBATIM;
        return (itemInstanceId, plugItemHashes) => {
            const itemHash = crafted.get(itemInstanceId);
            if (itemHash === undefined) return [...plugItemHashes];
            // L'objet est dans la liste : il est façonné par construction.
            return recordedPlugs(
                plugItemHashes,
                defs.get(itemHash),
                ITEM_STATE.Crafted,
            );
        };
    }, [crafted, defs]);
}
