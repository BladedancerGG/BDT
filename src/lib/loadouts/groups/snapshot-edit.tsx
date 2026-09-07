"use client";

import {createContext, useContext, useMemo} from "react";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {savedSockets} from "@/lib/destiny/use-loadout-items";
import {useFragmentLocks} from "@/lib/destiny/use-fragment-locks";

/**
 * Édition des attributs d'un **instantané** de groupe.
 *
 * Un contexte, contrairement à la sélection d'équipement qui est un store : il
 * n'enveloppe que l'éditeur d'un groupe, soit une dizaine de vignettes, et non
 * le coffre et ses mille. Le coût d'un contexte s'y paie sans y penser, et il a
 * un avantage décisif ici — il traverse le portail de l'infobulle. Un portail
 * React reste dans l'arbre React : l'infobulle, montée ailleurs dans le DOM,
 * lit donc le même contexte que la ligne qui l'a ouverte.
 *
 * Deux consommateurs, et c'est tout l'intérêt de n'avoir qu'une source :
 * les rangées d'attributs de la vue (`EquipmentPlugs`) et l'infobulle
 * (`ItemTooltip`), qui est le seul endroit où les **cosmétiques** se changent.
 */
export interface SnapshotEditValue {
    /** Attributs enregistrés, par identifiant d'instance — voir `savedSockets` */
    sockets: ReadonlyMap<string, number[]>;
    /** Écrit le choix dans l'instantané, jamais vers Bungie */
    onPick: (
        itemInstanceId: string,
        socketIndex: number,
        plugHash: number,
    ) => void;
}

const SnapshotEditContext = createContext<SnapshotEditValue | undefined>(
    undefined,
);

export const SnapshotEditProvider = SnapshotEditContext.Provider;

/**
 * Sommes-nous dans l'éditeur d'un instantané ?
 *
 * Sans l'objet : `ItemIcon` s'en sert pour retirer à la vignette ses gestes
 * d'équipement, et la question ne dépend pas de l'objet qu'elle montre.
 */
export function useSnapshotEditing(): boolean {
    return useContext(SnapshotEditContext) !== undefined;
}

/** Ce qu'un objet précis a à éditer, ou `undefined` hors édition. */
export interface SnapshotEdit {
    /**
     * Attributs de CET objet dans l'instantané, indexés par index de socket, et
     * déjà complétés par ceux de l'objet là où l'instantané n'a rien enregistré
     * — c'est `savedSockets` qui le fait, la même règle qu'à l'affichage d'un
     * équipement sauvegardé.
     */
    sockets: number[];
    /**
     * Sockets que l'instantané laisse verrouillés — voir `useSnapshotLocks`.
     * Ils prennent la place de `ItemDetail.disabledSockets`, qui décrit l'objet
     * du moment et non la configuration qu'on modifie.
     */
    locked: ReadonlySet<number>;
    onPick: (socketIndex: number, plugHash: number) => void;
}

/**
 * L'édition d'instantané applicable à un objet.
 *
 * Le détail de l'objet est demandé parce que `savedSockets` en a besoin : la
 * sentinelle `INVALID_HASH` marque aussi bien un socket non enregistré qu'un
 * socket à choix unique, et dans les deux cas c'est la valeur courante de
 * l'objet qui fait foi. La retirer aurait effacé des attributs bel et bien en
 * place.
 */
export function useSnapshotEdit(
    itemInstanceId: string | undefined,
    detail: ItemDetail | undefined,
    /**
     * Définition de l'objet. Sert aux verrous d'une doctrine : sans elle, on ne
     * sait pas quels sockets sont des aspects et lesquels des fragments.
     */
    def?: InventoryItemDefinition,
): SnapshotEdit | undefined {
    const context = useContext(SnapshotEditContext);
    const saved = itemInstanceId
        ? context?.sockets.get(itemInstanceId)
        : undefined;

    const sockets = useMemo(
        () => (saved ? savedSockets(saved, detail) : undefined),
        [saved, detail],
    );

    // Les verrous viennent de l'INSTANTANÉ et non de l'objet : c'est tout son
    // objet que d'être une autre configuration que celle du moment. Le calcul,
    // lui, est le même que pour l'objet porté — voir `useFragmentLocks`.
    const locked = useFragmentLocks(def, sockets);

    return useMemo(() => {
        if (!context || !itemInstanceId || !sockets) return undefined;
        return {
            sockets,
            locked,
            onPick: (socketIndex: number, plugHash: number) =>
                context.onPick(itemInstanceId, socketIndex, plugHash),
        };
    }, [context, itemInstanceId, sockets, locked]);
}

