"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {DamageTypeDefinition} from "@/lib/destiny/types";

/**
 * Définition d'un type de dégâts à partir de son énumération.
 *
 * L'API renvoie l'élément d'une arme comme un simple entier (`damageType`), et
 * les doctrines le portent dans `talentGrid.hudDamageType` — jamais sous forme de
 * hash. On balaie donc la table, qui ne compte que sept lignes : c'est moins
 * coûteux que de trimballer un second champ depuis le profil.
 */
export function useDamageTypeDefinition(
    damageType: number | undefined,
): DamageTypeDefinition | undefined {
    return useLiveQuery(async () => {
        if (!damageType) return undefined;
        const rows = await manifestDb.definitions
            .where("table")
            .equals("DestinyDamageTypeDefinition")
            .toArray();
        return rows
            .map((row) => row.data as DamageTypeDefinition & { enumValue?: number })
            .find((def) => def.enumValue === damageType);
    }, [damageType]);
}
