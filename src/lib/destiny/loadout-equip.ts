// Effet local d'un `EquipLoadout`.
//
// Bungie assemble l'équipement côté serveur en une requête, et ne dit rien de ce
// qu'il a réellement déplacé. On rejoue donc l'effet sur le cache du profil,
// comme pour une étape de déplacement — sans quoi l'écran garderait l'ancien
// équipement jusqu'au rechargement, et le rechargement lui-même pourrait
// ramener un instantané antérieur (voir profile-freshness).
//
// Les règles du jeu, dans l'ordre où elles s'appliquent :
//
//  - un objet du coffre est **transféré puis équipé**, à condition qu'il reste
//    de la place dans l'emplacement du personnage ; sinon il reste au coffre ;
//  - un objet déjà dans l'inventaire du personnage est simplement équipé ;
//  - un objet **introuvable** (démantelé depuis l'enregistrement) ou détenu par
//    un **autre personnage** ne peut pas être déplacé par l'API : il est laissé
//    où il est.

import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
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
