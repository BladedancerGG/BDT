// Réconciliation des groupes entre le stockage local et la sauvegarde du
// compte.
//
// Un module **pur**, comme `edit.ts` : il reçoit les deux listes, rend celle
// qu'il faut afficher, et ne connaît ni React, ni le store, ni le réseau. Les
// imports de *valeur* sont relatifs — l'alias `@/…` ne survit pas à la
// compilation hors du bundler (cf. scripts/checks/README.md).
//
// **Pourquoi ne pas simplement écraser le local par le distant.** C'est ce que
// faisait la relecture, et c'est ainsi qu'on perd des groupes : la route ne
// distinguait pas « rien n'a jamais été déposé » d'« il n'y a plus de groupes »,
// si bien qu'un compte sans ligne renvoyait une liste vide qui remplaçait
// l'affichage *et* le stockage local. Même chose pour une sauvegarde en retard
// — un envoi refusé, un rechargement pendant le délai d'inactivité — qui
// écrasait des modifications plus récentes que le serveur n'avait jamais vues.
//
// La fusion tranche donc par horodatage, avec le repère qui manquait : la date
// de la ligne (`remoteUpdatedAt`). Elle dit ce que le serveur a *vu*, et permet
// de lire l'absence d'un groupe pour ce qu'elle est — supprimé ailleurs s'il est
// plus ancien que le dépôt, créé depuis s'il est plus récent.

import type {LoadoutGroup} from "./types";

/** Ce que la relecture a trouvé sur le compte. */
export interface RemoteGroups {
    /**
     * La liste déposée, ou `null` quand il n'y en a **pas** : ligne absente,
     * illisible, ou hors d'atteinte. `null` n'est pas `[]` — c'est toute la
     * différence entre « le compte ne sait rien » et « le compte sait qu'il n'y
     * a plus rien ».
     */
    groups: LoadoutGroup[] | null;
    /** Date de la ligne, en millisecondes epoch, ou `null` sans ligne. */
    updatedAt: number | null;
}

export interface MergeResult {
    /** La liste à afficher et à persister. */
    groups: LoadoutGroup[];
    /** Vrai quand le résultat diffère du distant : il faut le redéposer. */
    needsPush: boolean;
}

/** Date de modification la plus récente d'une liste, ou 0 si elle est vide. */
function newest(groups: readonly LoadoutGroup[]): number {
    return groups.reduce((max, group) => Math.max(max, group.updatedAt), 0);
}

function byId(groups: readonly LoadoutGroup[]): Map<string, LoadoutGroup> {
    return new Map(groups.map((group) => [group.id, group]));
}

/**
 * Fusionne la liste locale et la sauvegarde du compte.
 *
 * Les règles, dans l'ordre où elles s'appliquent :
 *
 *  - **pas de sauvegarde** (`groups: null`) : le local est gardé tel quel, et
 *    redéposé s'il porte quelque chose. Un compte jamais synchronisé ne vide
 *    plus l'appareil qui vient de l'activer ;
 *  - **groupe des deux côtés** : le plus récent gagne, à l'`updatedAt` du
 *    groupe. À égalité, le distant — deux appareils qui ont écrit dans la même
 *    milliseconde doivent au moins converger vers le même état ;
 *  - **groupe local seul** : gardé s'il est plus récent que le dépôt (il a été
 *    créé ou modifié depuis), écarté sinon (il était déposé, il ne l'est plus :
 *    supprimé sur un autre appareil) ;
 *  - **groupe distant seul** : gardé. Un appareil qui n'a jamais vu un groupe
 *    n'a rien à en dire ;
 *  - **l'ordre** est celui du côté dont la modification la plus récente
 *    l'emporte — un glisser-déposer ne bouscule pas les cartes d'un autre
 *    appareil, et ne se fait pas non plus annuler par lui. Les groupes que ce
 *    côté ignore sont ajoutés à la fin, dans leur ordre d'origine.
 */
export function mergeGroups(
    local: readonly LoadoutGroup[],
    remote: RemoteGroups,
): MergeResult {
    if (remote.groups === null) {
        return {groups: [...local], needsPush: local.length > 0};
    }

    const remoteAt = remote.updatedAt ?? newest(remote.groups);
    const locals = byId(local);
    const remotes = byId(remote.groups);

    const kept = new Map<string, LoadoutGroup>();
    for (const group of remote.groups) {
        const mine = locals.get(group.id);
        kept.set(group.id, mine && mine.updatedAt > group.updatedAt ? mine : group);
    }
    for (const group of local) {
        // Absent du dépôt et plus ancien que lui : le serveur l'a bien connu
        // puis perdu de vue — c'est une suppression, pas un retard.
        if (!remotes.has(group.id) && group.updatedAt > remoteAt) {
            kept.set(group.id, group);
        }
    }

    const leading = newest(local) > remoteAt ? local : remote.groups;
    const trailing = leading === local ? remote.groups : local;
    const groups: LoadoutGroup[] = [];
    const placed = new Set<string>();
    for (const source of [leading, trailing]) {
        for (const {id} of source) {
            const group = kept.get(id);
            if (!group || placed.has(id)) continue;
            placed.add(id);
            groups.push(group);
        }
    }

    return {groups, needsPush: !sameGroups(groups, remote.groups)};
}

/** Deux listes portant les mêmes groupes, dans le même ordre, au même état. */
export function sameGroups(
    a: readonly LoadoutGroup[],
    b: readonly LoadoutGroup[],
): boolean {
    return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}
