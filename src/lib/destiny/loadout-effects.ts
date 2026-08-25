// Effets locaux des actions sur un emplacement d'équipement.
//
// Bungie fait tout le travail côté serveur en une requête, et ne dit rien de ce
// qu'il a changé. On rejoue donc l'effet sur le cache du profil, comme pour une
// étape de déplacement — sans quoi l'écran garderait l'état d'avant jusqu'au
// rechargement, et le rechargement lui-même pourrait ramener un instantané
// antérieur (voir profile-freshness).
//
// —— Équiper ————————————————————————————————————————————————
//
// Les règles du jeu, dans l'ordre où elles s'appliquent :
//
//  - un objet du coffre est **transféré puis équipé**, à condition qu'il reste
//    de la place dans l'emplacement du personnage ; sinon il reste au coffre ;
//  - un objet déjà dans l'inventaire du personnage est simplement équipé ;
//  - un objet **introuvable** (démantelé depuis l'enregistrement) ou détenu par
//    un **autre personnage** ne peut pas être déplacé par l'API : il est laissé
//    où il est.

import type {
    DestinyItemComponent,
    DestinyLoadout,
    DestinyLoadoutItem,
} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {INVALID_HASH} from "@/lib/loadouts/loadout";
import {EQUIPMENT_BUCKETS} from "./buckets";
import {applyStep, locateItem, type PlannedStep} from "./moves";
import type {InventoryItemDefinition} from "./types";

/** Pourquoi un objet de l'équipement n'a pas pu être mis en place. */
export type LoadoutSkipReason = "missing" | "otherCharacter" | "bucketFull";

export interface LoadoutEquipResult {
    profile: ProfileData;
    /**
     * Instances effectivement déplacées ou équipées. Le rechargement final
     * devra les retrouver à leur nouvelle place — voir `markLocalMoves`.
     */
    moved: string[];
    /** Ce que l'API n'a pas pu placer, et pourquoi */
    skipped: {itemInstanceId: string; reason: LoadoutSkipReason}[];
}

/**
 * Nombre d'objets que le personnage détient dans un emplacement, objet équipé
 * compris — c'est l'unité dans laquelle le manifeste exprime `itemCount`.
 */
function held(
    profile: ProfileData,
    characterId: string,
    bucketHash: number,
): number {
    const count = (items: DestinyItemComponent[] | undefined) =>
        (items ?? []).filter((item) => item.bucketHash === bucketHash).length;
    return (
        count(profile.equipment[characterId]) +
        count(profile.inventory[characterId])
    );
}

/**
 * Rejoue l'équipement d'un ensemble sauvegardé sur le cache du profil.
 *
 * Les étapes sont fabriquées puis passées à `applyStep`, celui des déplacements :
 * l'effet d'un transfert ou d'un équipement sur le profil n'est donc écrit qu'une
 * fois, et le déséquipement de l'objet chassé de l'emplacement est déjà géré là.
 */
export function applyEquippedLoadout(
    profile: ProfileData,
    loadout: DestinyLoadout,
    characterId: string,
    defs: ReadonlyMap<number, InventoryItemDefinition>,
    capacities: ReadonlyMap<number, number>,
): LoadoutEquipResult {
    let next = profile;
    const moved: string[] = [];
    const skipped: LoadoutEquipResult["skipped"] = [];

    for (const entry of loadout.items) {
        // Un emplacement non enregistré porte « 0 » — voir isEmptyLoadout
        if (!entry.itemInstanceId || entry.itemInstanceId === "0") continue;

        const located = locateItem(next, entry.itemInstanceId);
        if (!located) {
            skipped.push({itemInstanceId: entry.itemInstanceId, reason: "missing"});
            continue;
        }

        const {item, place} = located;

        // Déjà équipé sur le bon personnage : rien à faire.
        if (place.kind === "equipped" && place.characterId === characterId) {
            continue;
        }

        // Détenu par un autre personnage : l'API ne sait pas le prendre là-bas.
        // Il faudrait le renvoyer au coffre d'abord, ce que `EquipLoadout` ne
        // fait pas — le jeu laisse simplement l'emplacement en place.
        if (place.kind !== "vault" && place.characterId !== characterId) {
            skipped.push({
                itemInstanceId: entry.itemInstanceId,
                reason: "otherCharacter",
            });
            continue;
        }

        // L'emplacement d'équipement vient de la définition : au coffre, le
        // `bucketHash` de l'instance est celui du coffre.
        const bucketHash =
            defs.get(item.itemHash)?.inventory?.bucketTypeHash ?? item.bucketHash;
        const steps: PlannedStep[] = [];

        if (place.kind === "vault") {
            const capacity = capacities.get(bucketHash);
            // Sans capacité connue on tente le transfert : le rechargement final
            // tranchera, et refuser par défaut effacerait un équipement réussi.
            if (capacity !== undefined && held(next, characterId, bucketHash) >= capacity) {
                skipped.push({
                    itemInstanceId: entry.itemInstanceId,
                    reason: "bucketFull",
                });
                continue;
            }
            steps.push({
                kind: "fromVault",
                itemInstanceId: entry.itemInstanceId,
                itemHash: item.itemHash,
                characterId,
                role: "move",
                bucketHash,
            });
        }

        steps.push({
            kind: "equip",
            itemInstanceId: entry.itemInstanceId,
            itemHash: item.itemHash,
            characterId,
            role: "move",
            bucketHash,
        });

        for (const step of steps) next = applyStep(next, step);
        moved.push(entry.itemInstanceId);
    }

    return {profile: next, moved, skipped};
}

// —— Enregistrer et vider ————————————————————————————————————

/** Remplace un emplacement dans le cache, sans toucher aux autres. */
function withLoadout(
    profile: ProfileData,
    characterId: string,
    loadoutIndex: number,
    loadout: DestinyLoadout,
): ProfileData {
    const list = profile.loadouts?.[characterId];
    // Sans liste connue, il n'y a pas d'emplacement à remplacer : le
    // rechargement final la fournira.
    if (!list || loadoutIndex >= list.length) return profile;

    return {
        ...profile,
        loadouts: {
            ...profile.loadouts,
            [characterId]: list.map((entry, index) =>
                index === loadoutIndex ? loadout : entry,
            ),
        },
    };
}

/**
 * Rejoue un `SnapshotLoadout` : l'emplacement prend ce que le personnage porte.
 *
 * Les attributs enregistrés sont ceux des objets **à cet instant** — c'est
 * exactement ce que le jeu retient. `plugItemHashes` est indexé par index de
 * socket (voir `savedSockets`), donc les sockets courants s'y recopient tels
 * quels.
 *
 * Seuls les emplacements d'équipement comptent : le Courrier et le reste de
 * l'inventaire n'entrent pas dans un équipement sauvegardé.
 */
export function applySnapshotLoadout(
    profile: ProfileData,
    characterId: string,
    loadoutIndex: number,
    identifiers: {colorHash: number; iconHash: number; nameHash: number},
    defs: ReadonlyMap<number, InventoryItemDefinition>,
): ProfileData {
    const items: DestinyLoadoutItem[] = (profile.equipment[characterId] ?? [])
        .filter((item) => {
            const bucketHash =
                defs.get(item.itemHash)?.inventory?.bucketTypeHash ?? item.bucketHash;
            return Boolean(item.itemInstanceId) && EQUIPMENT_BUCKETS.has(bucketHash);
        })
        .map((item) => ({
            itemInstanceId: item.itemInstanceId as string,
            plugItemHashes: [...(profile.items[item.itemInstanceId as string]?.sockets ?? [])],
        }));

    return withLoadout(profile, characterId, loadoutIndex, {
        ...identifiers,
        items,
    });
}

/**
 * Rejoue un `ClearLoadout` : l'emplacement redevient libre.
 *
 * L'API rend alors dix entrées d'`itemInstanceId` « 0 » et la sentinelle sur les
 * trois identifiants. On se contente d'une liste vide : `isEmptyLoadout` la
 * reconnaît tout autant, et rien ne lit ces entrées de remplissage.
 */
export function applyClearedLoadout(
    profile: ProfileData,
    characterId: string,
    loadoutIndex: number,
): ProfileData {
    return withLoadout(profile, characterId, loadoutIndex, {
        colorHash: INVALID_HASH,
        iconHash: INVALID_HASH,
        nameHash: INVALID_HASH,
        items: [],
    });
}
