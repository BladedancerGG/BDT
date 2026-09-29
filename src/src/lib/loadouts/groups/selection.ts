"use client";

import {create} from "zustand";
import {EQUIPMENT_BUCKETS} from "@/lib/destiny/buckets";
import {CLASS_ANY} from "@/lib/destiny/moves";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/**
 * Sélection d'équipement en cours : remplir un emplacement de groupe en
 * choisissant les objets **dans la vue inventaire**.
 *
 * Un store et non un contexte, et c'est une question de coût : `ItemIcon` est
 * monté un millier de fois pour un coffre, et un contexte re-rendrait toutes ces
 * vignettes à chaque clic. Avec un sélecteur par vignette, seules celles que le
 * choix concerne se redessinent — la bascule d'activité mise à part, qui les
 * concerne toutes de toute façon.
 *
 * L'état est **éphémère** : rien n'est persisté, une sélection abandonnée ne
 * survit pas au rechargement. C'est un geste, pas un réglage.
 */
export interface GroupSelectionState {
    /** Une sélection est en cours */
    active: boolean;
    /** Le groupe et l'emplacement visés, pour l'écriture et pour le libellé */
    groupId: string | null;
    groupName: string;
    slotIndex: number;
    /** Classe du personnage : une armure d'une autre classe ne s'équiperait pas */
    classType: number | undefined;
    /**
     * L'objet retenu par emplacement d'équipement : `bucketHash` →
     * `itemInstanceId`. Un emplacement n'accueille qu'un objet, comme en jeu —
     * c'est une Map et non une liste.
     */
    picked: ReadonlyMap<number, string>;
    /**
     * Objets liés à un **autre** personnage, donc impossibles à retenir.
     *
     * Calculé à l'ouverture de la sélection, où le profil est sous la main :
     * `ItemIcon` n'a que le hash et l'instance d'un objet, il ne peut pas
     * savoir qui le détient. La liste est courte — une doctrine et un artéfact
     * par autre personnage.
     */
    foreign: ReadonlySet<string>;

    start: (input: {
        groupId: string;
        groupName: string;
        slotIndex: number;
        classType: number | undefined;
        picked: ReadonlyMap<number, string>;
        foreign: ReadonlySet<string>;
    }) => void;
    /** Retient l'objet, ou le relâche si c'était déjà lui */
    toggle: (bucketHash: number, itemInstanceId: string) => void;
    stop: () => void;
}

export const useGroupSelection = create<GroupSelectionState>()((set) => ({
    active: false,
    groupId: null,
    groupName: "",
    slotIndex: 0,
    classType: undefined,
    picked: new Map(),
    foreign: new Set(),

    start: ({groupId, groupName, slotIndex, classType, picked, foreign}) =>
        set({
            active: true,
            groupId,
            groupName,
            slotIndex,
            classType,
            picked,
            foreign,
        }),

    toggle: (bucketHash, itemInstanceId) =>
        set((state) => {
            const picked = new Map(state.picked);
            if (picked.get(bucketHash) === itemInstanceId) {
                picked.delete(bucketHash);
            } else {
                picked.set(bucketHash, itemInstanceId);
            }
            return {picked};
        }),

    stop: () =>
        set({active: false, groupId: null, picked: new Map(), foreign: new Set()}),
}));

/**
 * Les objets liés à un autre personnage que celui visé.
 *
 * `nonTransferrable` est le critère, et il est exact : doctrines et artéfacts
 * ne quittent jamais leur personnage (voir l'en-tête de `moves.ts`). Le retenir
 * plutôt qu'énumérer les emplacements concernés couvre du même coup le cas de
 * deux personnages de **même classe** — le filtre par `classType` ne les
 * départage pas, et chacun a pourtant sa doctrine et son artéfact.
 */
export function foreignItems(
    /** Inventaires et équipements par personnage, tels que les rend le profil */
    byCharacter: readonly {
        characterId: string;
        items: readonly {itemHash: number; itemInstanceId?: string}[];
    }[],
    targetCharacterId: string,
    defs: Map<number, InventoryItemDefinition>,
): Set<string> {
    const foreign = new Set<string>();

    for (const {characterId, items} of byCharacter) {
        if (characterId === targetCharacterId) continue;
        for (const item of items) {
            if (!item.itemInstanceId) continue;
            if (defs.get(item.itemHash)?.nonTransferrable) {
                foreign.add(item.itemInstanceId);
            }
        }
    }

    return foreign;
}

/**
 * L'emplacement d'équipement où un objet peut être retenu, ou `undefined`.
 *
 * Trois refus, dont les deux premiers étaient déjà ceux du sélecteur remplacé :
 *
 *  - **ce qui ne s'équipe pas.** L'emplacement vient de la *définition*
 *    (`inventory.bucketTypeHash`) et non du composant : celui-ci vaut celui du
 *    coffre pour un objet rangé, et tout le coffre serait alors refusé.
 *  - **ce qui appartient à une autre classe.** Une armure de Titan dans le
 *    groupe d'un Chasseur ne s'équiperait jamais ; la laisser cliquer serait un
 *    piège. `CLASS_ANY` et l'absence de `classType` passent — les armes.
 *  - **ce qui est lié à un autre personnage.** Un artéfact ne se transfère pas :
 *    celui d'un autre personnage ne s'équiperait jamais ici. Le filtre par
 *    classe ne suffisait pas — un artéfact n'a pas de `classType`, et deux
 *    personnages de même classe ont chacun le leur. Voir `foreignItems`.
 */
export function pickableBucket(
    def: InventoryItemDefinition | undefined,
    classType: number | undefined,
    itemInstanceId: string | undefined,
    foreign: ReadonlySet<string>,
): number | undefined {
    const bucketHash = def?.inventory?.bucketTypeHash;
    if (bucketHash === undefined || !EQUIPMENT_BUCKETS.has(bucketHash)) {
        return undefined;
    }

    const itemClass = def?.classType;
    if (
        itemClass !== undefined &&
        itemClass !== CLASS_ANY &&
        classType !== undefined &&
        itemClass !== classType
    ) {
        return undefined;
    }

    if (itemInstanceId !== undefined && foreign.has(itemInstanceId)) {
        return undefined;
    }

    return bucketHash;
}
