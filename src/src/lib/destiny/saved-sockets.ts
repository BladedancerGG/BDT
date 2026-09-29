// Les attributs qu'un équipement a **enregistrés**, résolus contre l'objet.
//
// Un module pur, sans directive : il sert la vue d'un équipement (`useLoadoutItems`),
// l'édition d'un instantané de groupe et la construction d'un partage, qui n'a
// rien de réactif. Ses imports de valeur sont relatifs — voir
// scripts/checks/README.md.

import type {ItemDetail} from "@/lib/bungie/item-components";
import {INVALID_HASH} from "../loadouts/loadout";

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
export function savedSockets(
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
