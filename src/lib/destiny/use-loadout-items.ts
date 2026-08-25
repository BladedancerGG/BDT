"use client";

import {useMemo} from "react";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {INVALID_HASH, isEmptyLoadout} from "@/lib/loadouts/loadout";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "./types";

/**
 * Ce qu'un équipement sauvegardé donne à afficher.
 *
 * Les objets **et** leurs attributs tels qu'enregistrés : les deux ne se lisent
 * pas au même endroit, mais ils décrivent le même instantané et se perdraient
 * l'un sans l'autre.
 */
export interface LoadoutContents {
    items: DestinyItemComponent[];
    /** Sockets enregistrés, par itemInstanceId — voir `savedSockets` */
    sockets: ReadonlyMap<string, number[]>;
}

/**
 * Sockets d'un objet tels que l'équipement les a enregistrés.
 *
 * `plugItemHashes` est **indexé par index de socket**, un pour chacun — ce n'est
 * pas une liste libre. Deux valeurs n'y désignent rien :
 *
 *  - la sentinelle `INVALID_HASH`, qui marque un socket non enregistré ;
 *  - et surtout, elle marque **aussi les sockets qui n'offrent qu'un seul
 *    choix** — le jeu n'y écrit pas le vrai hash. C'est le piège : les prendre
 *    pour des emplacements vides effacerait des attributs bel et bien en place.
 *
 * Dans les deux cas la valeur courante de l'objet fait foi : sur un socket à
 * choix unique, elle *est* le plug enregistré.
 */
function savedSockets(
    plugItemHashes: readonly number[],
    detail: ItemDetail | undefined,
): number[] {
    const current = detail?.sockets ?? [];
    const length = Math.max(plugItemHashes.length, current.length);
    return Array.from({length}, (_, index) => {
        const saved = plugItemHashes[index];
        return saved === undefined || saved === INVALID_HASH
            ? (current[index] ?? 0)
            : saved;
    });
}

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
): LoadoutContents | undefined {
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

        const items: DestinyItemComponent[] = [];
        const sockets = new Map<string, number[]>();

        for (const entry of loadout.items) {
            const item = index.get(entry.itemInstanceId);
            if (!item) continue;
            const bucketHash =
                defs.get(item.itemHash)?.inventory?.bucketTypeHash ?? item.bucketHash;
            items.push({...item, bucketHash});
            sockets.set(
                entry.itemInstanceId,
                savedSockets(
                    entry.plugItemHashes ?? [],
                    data.items[entry.itemInstanceId],
                ),
            );
        }

        return {items, sockets};
    }, [loadout, index, defs, data.items]);
}
