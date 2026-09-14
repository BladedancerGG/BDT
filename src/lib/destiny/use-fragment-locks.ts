"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {
    lockedFragmentSockets,
    subclassSocketKind,
    type SubclassSocketKind,
} from "@/lib/destiny/subclass";

/** Référence stable : un ensemble neuf relancerait les rendus sans fin. */
const NO_LOCKS: ReadonlySet<number> = new Set();

/**
 * Emplacements de fragments verrouillés d'une doctrine, **déduits des aspects
 * qu'on lui montre** et non de ce que l'API en dit.
 *
 * `ItemDetail.disabledSockets` décrit l'objet tel que Bungie l'a rendu au
 * dernier chargement du profil. Deux situations le prennent en défaut, et ce
 * sont les deux seules qui comptent :
 *
 *  - un **instantané** de groupe est une autre configuration que celle du
 *    moment : une doctrine sans aspect équipé a ses six emplacements
 *    verrouillés côté API, et les fragments d'un instantané qui en porte deux
 *    devenaient immodifiables ;
 *  - **changer un aspect** ouvre ou ferme des emplacements sur-le-champ. Le
 *    profil, lui, ne sera rechargé qu'une fois la file d'actions vidée : les
 *    nouveaux emplacements n'apparaissaient qu'après coup, et ceux d'un aspect
 *    retiré restaient affichés.
 *
 * Les deux appelants passent donc les attributs qu'ils **affichent** — insertion
 * en attente comprise — et le calcul est le même : `lockedFragmentSockets`,
 * module pur et vérifié.
 *
 * Seules les doctrines sont concernées : rien d'autre ne voit ses emplacements
 * s'ouvrir selon ce qu'on y met, et l'ensemble revient vide pour tout le reste.
 *
 * Deux lectures groupées au plus : les plugs d'origine des sockets — qui disent
 * lesquels sont des aspects et lesquels des fragments — et les aspects
 * affichés, dont on somme la capacité.
 */
export function useFragmentLocks(
    def: InventoryItemDefinition | undefined,
    sockets: readonly number[] | undefined,
): ReadonlySet<number> {
    const entries = def?.sockets?.socketEntries;

    return (
        useLiveQuery(
            async () => {
                if (!entries || !sockets) return NO_LOCKS;

                const initials = entries.map(
                    (entry) => entry.singleInitialItemHash ?? 0,
                );
                const read = async (hashes: readonly number[]) => {
                    const unique = [...new Set(hashes.filter((h) => h > 0))];
                    if (unique.length === 0) {
                        return new Map<number, InventoryItemDefinition>();
                    }
                    const rows = await manifestDb.definitions.bulkGet(
                        unique.map(
                            (h) =>
                                ["DestinyInventoryItemDefinition", h] as [string, number],
                        ),
                    );
                    const defs = new Map<number, InventoryItemDefinition>();
                    rows.forEach((row, i) => {
                        if (row) defs.set(unique[i], row.data as InventoryItemDefinition);
                    });
                    return defs;
                };

                // La nature d'un socket vient du plug d'ORIGINE et non de ce qui
                // l'occupe : un emplacement de fragment vide porte
                // « Emplacement de fragment vide », dont la famille est bien
                // celle des fragments.
                const initialDefs = await read(initials);
                const kinds = new Map<number, SubclassSocketKind>();
                initials.forEach((hash, index) => {
                    const kind = subclassSocketKind(
                        initialDefs.get(hash)?.plug?.plugCategoryIdentifier,
                    );
                    if (kind) kinds.set(index, kind);
                });

                // Rien d'une doctrine : rien à verrouiller.
                if (![...kinds.values()].includes("fragment")) return NO_LOCKS;

                const aspects = [...kinds]
                    .filter(([, kind]) => kind === "aspect")
                    .map(([index]) => sockets[index] ?? 0);
                const aspectDefs = await read(aspects);

                return lockedFragmentSockets(
                    kinds,
                    sockets,
                    (hash) =>
                        aspectDefs.get(hash)?.plug?.energyCapacity?.capacityValue ?? 0,
                );
            },
            // Les tableaux sont recréés à chaque rendu : la dépendance doit
            // porter sur leur contenu, comme dans `use-sockets.ts`.
            [
                entries?.map((e) => e.singleInitialItemHash ?? 0).join(",") ?? "",
                sockets?.join(",") ?? "",
            ],
            NO_LOCKS,
        ) ?? NO_LOCKS
    );
}
