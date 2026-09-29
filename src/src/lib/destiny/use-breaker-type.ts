"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {BreakerTypeDefinition} from "@/lib/destiny/types";

/**
 * Définition d'un type anti-champion à partir de son énumération (1 bloqueur,
 * 2 surchargé, 3 implacable) — c'est elle qui porte le nom traduit et l'icône.
 *
 * On balaie la table, qui ne compte que trois lignes : cela évite de coder en
 * dur les hashes, et l'énumération est la seule clé dont on dispose quand
 * l'effet est déduit de l'armature (voir breaker.ts) plutôt que lu sur l'objet.
 */
export function useBreakerTypeDefinition(
    breakerType: number | undefined,
): BreakerTypeDefinition | undefined {
    return useLiveQuery(async () => {
        if (!breakerType) return undefined;
        const rows = await manifestDb.definitions
            .where("table")
            .equals("DestinyBreakerTypeDefinition")
            .toArray();
        return rows
            .map((row) => row.data as BreakerTypeDefinition)
            .find((def) => def.enumValue === breakerType);
    }, [breakerType]);
}
