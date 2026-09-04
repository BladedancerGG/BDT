"use client";

// Coût en énergie d'armure des attributs, lu dans le manifeste.
//
// Ce que le manifeste dit, et qui ne se devine pas — relevé sur la table des
// définitions plutôt que supposé :
//
//  - **seuls les mods d'armure portent un `plug.energyCost`**, et il va de 0 à 4.
//    Une trentaine de mods n'en ont aucun ; l'absence vaut donc zéro, elle ne
//    signale pas une donnée manquante.
//  - **la pièce maîtresse et les emplacements d'artifice n'en ont aucun**, alors
//    qu'ils logent dans la MÊME catégorie de sockets que les mods
//    (`ARMOR_MODS`). C'est ce qui permet de les écarter sur le seul coût, sans
//    avoir à reconnaître leur famille.
//  - des coûts de 5 et 6 existent, mais sur des mods de **spectre** — que cette
//    application n'affiche pas, et qui ont leur propre énergie.

import {manifestDb} from "@/lib/manifest/db";
import type {InventoryItemDefinition} from "./types";

/**
 * Coût en énergie de plusieurs attributs, en **une** lecture groupée.
 *
 * Une lecture par attribut aurait rouvert autant de souscriptions Dexie que
 * l'application s'emploie à supprimer ailleurs — et il en faut une poignée par
 * insertion : le nouvel attribut, celui qu'il remplace, et ceux des autres
 * emplacements de mods.
 *
 * Les hashes inconnus sont simplement absents de la table renvoyée : `costOf`
 * les compte pour zéro, ce qui est le comportement voulu.
 */
export async function readPlugCosts(
    hashes: readonly number[],
): Promise<Map<number, number>> {
    const unique = [...new Set(hashes.filter((hash) => hash > 0))];
    const costs = new Map<number, number>();
    if (unique.length === 0) return costs;

    const rows = await manifestDb.definitions.bulkGet(
        unique.map((hash) => ["DestinyInventoryItemDefinition", hash] as [string, number]),
    );
    rows.forEach((row, index) => {
        const def = row?.data as InventoryItemDefinition | undefined;
        const cost = def?.plug?.energyCost?.energyCost;
        if (typeof cost === "number") costs.set(unique[index], cost);
    });

    return costs;
}
