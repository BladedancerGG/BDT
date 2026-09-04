// Moteur d'édition d'un groupe : les écritures sur la liste d'emplacements.
//
// Un module **pur**, comme `sort.ts` et `grouping.ts` : il reçoit la liste, rend
// la liste suivante, et ne connaît ni React ni le store. Ce qu'il ne peut pas
// deviner lui est injecté — les attributs d'un objet demandent le profil, ils
// arrivent donc en fonction.
//
// Pas de directive "use client" : rien de réactif ici.

import {INVALID_HASH, isRealHash} from "../loadout";
import type {LoadoutIdentifierHashes} from "../use-loadout-identifiers";
import {emptyGroupLoadout, type GroupLoadout, type LoadoutGroup} from "./types";

/**
 * Déplace une entrée dans une liste.
 *
 * Sémantique de `splice`, celle de `arrayMove` de dnd-kit : l'entrée est retirée
 * puis réinsérée, et les suivantes se décalent. C'est le geste attendu d'un
 * glisser-déposer, et non un échange deux à deux.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    if (from === to || from < 0 || to < 0) return next;
    if (from >= next.length || to >= next.length) return next;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/**
 * Complète la liste jusqu'à `count` emplacements.
 *
 * Un groupe créé quand le compte en possédait moins en a une liste plus courte,
 * et toute écriture au-delà de sa longueur la trouerait — `Array` accepte
 * pourtant l'indice, en laissant des `undefined` derrière lui. La liste est donc
 * normalisée avant toute écriture. Elle n'est jamais **tronquée** : Bungie ne
 * retire pas d'emplacement, et rien ne justifie de perdre un instantané sur une
 * réponse incomplète.
 */
export function padLoadouts(
    loadouts: readonly GroupLoadout[],
    count: number,
): GroupLoadout[] {
    const next = [...loadouts];
    while (next.length < count) next.push(emptyGroupLoadout());
    return next;
}

/** Remplace un emplacement entier — écrasement depuis le personnage, ou vidage. */
export function setLoadout(
    loadouts: readonly GroupLoadout[],
    index: number,
    loadout: GroupLoadout,
): GroupLoadout[] {
    const next = [...loadouts];
    if (index < 0 || index >= next.length) return next;
    next[index] = loadout;
    return next;
}

/**
 * Remplace d'un bloc les objets d'un emplacement — ce que confirme la sélection
 * d'équipement.
 *
 * La liste retenue **remplace** celle en place, elle ne s'y ajoute pas : la
 * sélection part de ce que l'emplacement contient déjà, si bien qu'un objet
 * absent du résultat en a été délibérément retiré.
 *
 * Le point délicat est ailleurs : **les attributs déjà enregistrés sont
 * conservés**. Un objet que l'emplacement portait garde son instantané, y
 * compris les attributs qu'on y a modifiés à la main ; seul un objet nouveau
 * reçoit ceux qu'il porte en ce moment. Resnapshoter tout le monde aurait effacé
 * sans un mot le travail fait dans l'éditeur d'attributs.
 */
export function setItems(
    loadouts: readonly GroupLoadout[],
    index: number,
    /** L'objet retenu par emplacement d'équipement — voir la sélection */
    picked: ReadonlyMap<number, string>,
    /** Sockets actuels d'un objet, pour l'instantané d'un nouveau venu */
    plugsOf: (itemInstanceId: string) => readonly number[],
    defaults: LoadoutIdentifierHashes,
): GroupLoadout[] {
    const current = loadouts[index];
    if (!current) return [...loadouts];

    const kept = new Map(
        current.items.map((entry) => [entry.itemInstanceId, entry]),
    );

    const items = [...picked.values()].map((itemInstanceId) => {
        const previous = kept.get(itemInstanceId);
        return {
            itemInstanceId,
            plugItemHashes: previous
                ? [...previous.plugItemHashes]
                : [...plugsOf(itemInstanceId)],
        };
    });

    return setLoadout(loadouts, index, {
        colorHash: isRealHash(current.colorHash)
            ? current.colorHash
            : defaults.colorHash,
        iconHash: isRealHash(current.iconHash) ? current.iconHash : defaults.iconHash,
        nameHash: isRealHash(current.nameHash) ? current.nameHash : defaults.nameHash,
        items,
    });
}

/**
 * Change l'apparence d'un emplacement — couleur, glyphe, nom.
 *
 * Les trois voyagent ensemble parce que `SnapshotLoadout` les exige toutes les
 * trois à l'équipement du groupe : un emplacement qui n'en porterait que deux
 * serait refusé le jour venu. Elles sont donc écrites d'un bloc, comme
 * `UpdateLoadoutIdentifiers` le fait pour un emplacement du jeu.
 */
export function setIdentifiers(
    loadouts: readonly GroupLoadout[],
    index: number,
    identifiers: LoadoutIdentifierHashes,
): GroupLoadout[] {
    const current = loadouts[index];
    if (!current) return [...loadouts];
    return setLoadout(loadouts, index, {...current, ...identifiers});
}

/** Retire un objet d'un emplacement, sans toucher à son apparence. */
export function removeItem(
    loadouts: readonly GroupLoadout[],
    index: number,
    itemInstanceId: string,
): GroupLoadout[] {
    const current = loadouts[index];
    if (!current) return [...loadouts];
    return setLoadout(loadouts, index, {
        ...current,
        items: current.items.filter(
            (entry) => entry.itemInstanceId !== itemInstanceId,
        ),
    });
}

/**
 * Écrit un attribut dans l'instantané d'un objet.
 *
 * `plugItemHashes` est **indexé par index de socket**, un pour chacun : écrire
 * au-delà de sa longueur exige de combler l'écart, sans quoi le tableau
 * porterait des trous que `JSON.stringify` rendrait en `null` — et la sentinelle
 * `INVALID_HASH` est justement ce qui signifie « non enregistré, prendre la
 * valeur courante » (voir `savedSockets`). C'est donc elle qui comble.
 */
export function putPlug(
    loadouts: readonly GroupLoadout[],
    index: number,
    itemInstanceId: string,
    socketIndex: number,
    plugHash: number,
): GroupLoadout[] {
    const current = loadouts[index];
    if (!current || socketIndex < 0) return [...loadouts];

    return setLoadout(loadouts, index, {
        ...current,
        items: current.items.map((entry) => {
            if (entry.itemInstanceId !== itemInstanceId) return entry;
            const plugs = [...entry.plugItemHashes];
            while (plugs.length <= socketIndex) plugs.push(INVALID_HASH);
            plugs[socketIndex] = plugHash;
            return {...entry, plugItemHashes: plugs};
        }),
    });
}

/**
 * Déplace une carte dans l'ordre d'un personnage.
 *
 * `from` et `to` sont les places dans la liste **affichée**, celle du seul
 * personnage. La liste stockée, elle, porte tous les personnages, et rien ne
 * garantit que ses groupes y soient contigus : ce sont donc les positions qu'ils
 * occupent qui sont permutées entre elles, les autres restant exactement où
 * elles sont. Réordonner la liste entière aurait mélangé les personnages.
 */
export function moveGroup(
    groups: readonly LoadoutGroup[],
    characterId: string,
    from: number,
    to: number,
): LoadoutGroup[] {
    const places = groups.flatMap((group, index) =>
        group.characterId === characterId ? [index] : [],
    );
    const reordered = moveItem(
        places.map((place) => groups[place]),
        from,
        to,
    );

    const next = [...groups];
    places.forEach((place, rank) => {
        next[place] = reordered[rank];
    });
    return next;
}
