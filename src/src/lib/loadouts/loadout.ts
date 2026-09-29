// Ce qu'est un emplacement d'équipement « libre ».
//
// Pas de directive "use client" : partagé par des composants et par des hooks,
// et sans rien de réactif.

import type {DestinyLoadout} from "@/lib/bungie/profile";

/**
 * Sentinelle « pas de hash » de l'API Bungie : `0x811C9DC5`, la base de
 * l'algorithme de hachage FNV-1a. C'est la valeur que prend un identifiant non
 * renseigné — hacher la chaîne vide revient à ne rien hacher du tout.
 *
 * Elle ne se devine pas et ne vaut surtout pas zéro : relevée sur les
 * emplacements réellement vides d'un personnage, où les trois identifiants la
 * portent tous les trois. La prendre pour un hash valide avait deux
 * conséquences, longtemps confondues : les emplacements vides s'affichaient
 * comme pleins (aucune définition à ce hash, donc aucune vignette, mais un
 * emplacement jugé occupé), et `SnapshotLoadout` la recevait en identifiant —
 * d'où le « Your request was invalid. » à la création.
 */
export const INVALID_HASH = 2166136261;

/** Un hash désigne-t-il réellement une définition ? */
export function isRealHash(hash: number | undefined): boolean {
    return hash !== undefined && hash !== 0 && hash !== INVALID_HASH;
}

/**
 * Un emplacement d'équipement est-il libre ?
 *
 * **La liste d'objets ne suffit pas**, et c'est le piège : un emplacement jamais
 * enregistré renvoie tout de même dix entrées dans `items` — simplement toutes
 * avec `itemInstanceId: "0"`. Un test sur `items.length` le classait donc comme
 * occupé.
 *
 * Deux signaux le désignent, et l'un comme l'autre suffit :
 *
 *  - aucun de ses objets n'a d'instance réelle (`itemInstanceId` à « 0 ») ;
 *  - aucun de ses trois identifiants n'est un vrai hash (voir `INVALID_HASH`).
 *
 * Les deux sont gardés : ils se confirment sur les données observées, et en jeu
 * on ne peut pas enregistrer un équipement sans choisir couleur, glyphe et nom,
 * si bien qu'aucun des deux ne peut classer à tort un équipement existant.
 */
export function isEmptyLoadout(loadout: DestinyLoadout | undefined): boolean {
    if (!loadout) return true;
    if (!loadout.items.some((item) => item.itemInstanceId !== "0")) return true;
    return !(
        isRealHash(loadout.colorHash) ||
        isRealHash(loadout.iconHash) ||
        isRealHash(loadout.nameHash)
    );
}
