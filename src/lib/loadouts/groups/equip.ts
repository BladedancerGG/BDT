// Ce qu'équiper un groupe demande, calculé avant tout envoi.
//
// Un module **pur**, comme `edit.ts` : il reçoit le groupe, l'état des
// emplacements du personnage et de quoi interroger le profil, et rend un plan.
// Rien n'est envoyé ici, rien n'est réactif — d'où l'absence de "use client".
//
// La séquence suit le cahier des charges : vider les emplacements, puis, pour
// chacun de ceux du groupe, équiper ses objets avec leurs attributs et écraser
// l'emplacement avec ce qui est alors équipé.

import type {DestinyLoadout} from "@/lib/bungie/profile";
import type {QueuedItem} from "@/lib/actions/store";
import {INVALID_HASH, isEmptyLoadout, isRealHash} from "../loadout";
import type {LoadoutIdentifierHashes} from "../use-loadout-identifiers";
import type {GroupLoadout} from "./types";

/** Un attribut à poser une fois l'objet équipé. */
export interface PlannedPlug {
    itemInstanceId: string;
    itemHash: number;
    socketIndex: number;
    plugItemHash: number;
}

/** Ce qu'un emplacement du groupe demande, dans l'ordre. */
export interface PlannedGroupSlot {
    /** Place de l'emplacement dans la liste du personnage, à partir de 0 */
    loadoutIndex: number;
    /** Apparence à donner à l'emplacement : `SnapshotLoadout` exige les trois */
    identifiers: LoadoutIdentifierHashes;
    /** Objets à équiper, dans l'ordre où l'instantané les porte */
    equip: QueuedItem[];
    /** Attributs à poser ensuite — seuls ceux qui diffèrent */
    plugs: PlannedPlug[];
}

/** Pourquoi un emplacement du groupe est écarté. */
export type SkipReason =
    /** Aucun de ses objets n'existe encore dans le profil */
    | "noItems"
    /**
     * Apparence incomplète. `SnapshotLoadout` exige les trois identifiants et
     * refuse la sentinelle : l'appel partirait pour être refusé.
     */
    | "noIdentifiers";

export interface SkippedGroupSlot {
    loadoutIndex: number;
    reason: SkipReason;
}

export interface GroupEquipPlan {
    /** Emplacements du personnage à vider, dans l'ordre */
    clear: number[];
    slots: PlannedGroupSlot[];
    skipped: SkippedGroupSlot[];
}

/**
 * Ce que le plan ne peut pas deviner : l'état du profil.
 *
 * Injecté comme dans `edit.ts` — le module reste ainsi exécutable hors React,
 * et vérifiable (voir « Vérifier son travail »).
 */
export interface GroupEquipContext {
    /**
     * L'objet tel qu'il part en file, ou `undefined` s'il a disparu du profil
     * (démantelé depuis l'enregistrement). Ses habillages en font partie : la
     * carte du panneau d'actions redessine sa vignette.
     */
    itemOf: (itemInstanceId: string) => QueuedItem | undefined;
    /** Attributs actuels de l'objet, indexés par index de socket */
    socketsOf: (itemInstanceId: string) => readonly number[];
    /** Index des sockets verrouillés de l'objet — rien à y insérer */
    disabledOf: (itemInstanceId: string) => ReadonlySet<number>;
}

/**
 * Les attributs d'un objet qu'il faut réellement poser.
 *
 * Trois valeurs enregistrées ne demandent **rien**, et les confondre coûterait
 * des requêtes que Bungie limite :
 *
 *  - la sentinelle `INVALID_HASH` — socket non enregistré, ou socket à choix
 *    unique dont le jeu n'écrit pas le vrai hash (voir `savedSockets`) ;
 *  - `0` — socket vide. Il n'y a pas d'attribut « rien » à insérer ; vider un
 *    socket demanderait son plug d'origine, que l'instantané ne porte pas ;
 *  - celle déjà en place. C'est le cas le plus fréquent de loin : l'instantané a
 *    justement été pris sur ces objets-là.
 *
 * Un socket verrouillé est écarté de même : l'insertion serait refusée.
 */
function plugsToInsert(
    item: QueuedItem,
    recorded: readonly number[],
    current: readonly number[],
    disabled: ReadonlySet<number>,
): PlannedPlug[] {
    const plugs: PlannedPlug[] = [];

    recorded.forEach((plugItemHash, socketIndex) => {
        if (plugItemHash === INVALID_HASH || plugItemHash === 0) return;
        if (current[socketIndex] === plugItemHash) return;
        if (disabled.has(socketIndex)) return;

        plugs.push({
            itemInstanceId: item.itemInstanceId,
            itemHash: item.itemHash,
            socketIndex,
            plugItemHash,
        });
    });

    return plugs;
}

/**
 * Le plan complet d'un équipement de groupe.
 *
 * **Le vidage est restreint aux emplacements que le groupe ne remplit pas.**
 * L'état final est identique — un `SnapshotLoadout` écrase l'emplacement qu'il
 * vise — et cela épargne une requête par emplacement rempli, sur une API dont
 * Bungie limite le débit toutes routes confondues. Les emplacements déjà libres
 * sont écartés pour la même raison, et parce que `ClearLoadout` refuserait.
 *
 * Un emplacement que le groupe laisse vide n'apparaît donc que dans `clear` :
 * c'est le vidage qui produit son état final.
 */
export function planGroupEquip(
    groupLoadouts: readonly GroupLoadout[],
    characterLoadouts: readonly DestinyLoadout[],
    ctx: GroupEquipContext,
): GroupEquipPlan {
    const slots: PlannedGroupSlot[] = [];
    const skipped: SkippedGroupSlot[] = [];

    groupLoadouts.forEach((loadout, loadoutIndex) => {
        // Le groupe laisse cet emplacement vide : le vidage suffit à l'y mettre.
        if (isEmptyLoadout(loadout)) return;

        const {colorHash, iconHash, nameHash} = loadout;
        if (
            !isRealHash(colorHash) ||
            !isRealHash(iconHash) ||
            !isRealHash(nameHash)
        ) {
            skipped.push({loadoutIndex, reason: "noIdentifiers"});
            return;
        }

        const equip: QueuedItem[] = [];
        const plugs: PlannedPlug[] = [];

        for (const entry of loadout.items) {
            const item = ctx.itemOf(entry.itemInstanceId);
            // Objet démantelé depuis l'enregistrement : l'emplacement se
            // remplira sans lui, comme le fait le jeu.
            if (!item) continue;

            equip.push(item);
            plugs.push(
                ...plugsToInsert(
                    item,
                    entry.plugItemHashes,
                    ctx.socketsOf(entry.itemInstanceId),
                    ctx.disabledOf(entry.itemInstanceId),
                ),
            );
        }

        // Plus un seul objet : il n'y aurait rien à équiper, et l'écrasement
        // enregistrerait la panoplie du moment — tout sauf ce qu'on demande.
        if (equip.length === 0) {
            skipped.push({loadoutIndex, reason: "noItems"});
            return;
        }

        slots.push({
            loadoutIndex,
            identifiers: {colorHash, iconHash, nameHash},
            equip,
            plugs,
        });
    });

    /** Les emplacements qu'un écrasement va de toute façon réécrire. */
    const overwritten = new Set(slots.map((slot) => slot.loadoutIndex));

    const clear = characterLoadouts.flatMap((loadout, index) =>
        isEmptyLoadout(loadout) || overwritten.has(index) ? [] : [index],
    );

    return {clear, slots, skipped};
}

/** Nombre de requêtes que le plan enverra, au plus — pour le dire à l'avance. */
export function planRequestCount(plan: GroupEquipPlan): number {
    return (
        plan.clear.length +
        plan.slots.reduce(
            // `equip` majore : un objet déjà équipé ne coûte rien, un objet au
            // coffre peut en revanche coûter plusieurs requêtes (déséquipement,
            // rangement, transfert). D'où « au plus ».
            (total, slot) => total + slot.equip.length + slot.plugs.length + 1,
            0,
        )
    );
}
