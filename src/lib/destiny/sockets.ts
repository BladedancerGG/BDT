// Helpers génériques sur les sockets, indépendants de leur usage.

import type {InventoryItemDefinition} from "./types";

/**
 * Catégories de sockets des artéfacts. Elles n'ont **aucun nom** dans le
 * manifeste : l'UI fournit donc son propre libellé.
 */
export const ARTIFACT_SOCKET_CATEGORIES: readonly number[] = [
    2631166533, 2631166534, 2631166535, 3072446841,
];

/**
 * Un plug a-t-il réellement été inséré dans ce socket ?
 *
 * Faux quand le plug équipé est encore le plug initial du socket : c'est le
 * placeholder par défaut (« Mod d'artéfact vide », « Ornement d'origine »…),
 * qu'il ne faut pas présenter comme un choix du joueur.
 */
export function isPlugApplied(
    def: InventoryItemDefinition | undefined,
    socketIndex: number,
    equippedPlugHash: number,
): boolean {
    const initial =
        def?.sockets?.socketEntries?.[socketIndex]?.singleInitialItemHash;
    return equippedPlugHash !== initial;
}
