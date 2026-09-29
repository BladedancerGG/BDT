"use client";

import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import type {LoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {PlusIcon} from "@heroicons/react/24/solid";
import {EmptySlotIcon} from "@/components/icons";

/**
 * Le contenu d'une vignette d'emplacement : le fond coloré, le glyphe et le
 * numéro — ou les marques d'angle du vide.
 *
 * Un fragment et non un élément : le panneau du personnage en fait un `<button>`
 * cliquable, la carte de groupe une case inerte. C'est le seul point qu'ils ne
 * partagent pas, et le laisser au parent évite un composant à rallonge de
 * variantes. L'habillage, lui, est commun — `.loadout-slot` dans
 * `loadout-panel.scss`.
 *
 * Les identifiants sont **reçus**, jamais lus ici : les résoudre par vignette
 * ferait une requête Dexie par case, soit des centaines pour une page de
 * groupes. Ils viennent d'un unique `useLoadoutIdentifiers` groupé.
 */
export function LoadoutSlotTile({
                                    loadout,
                                    index,
                                    identifiers,
                                }: {
    loadout: DestinyLoadout | undefined;
    /** Place dans la liste, à partir de 0 — affichée à partir de 1 */
    index: number;
    identifiers: LoadoutIdentifiers;
}) {
    const free = isEmptyLoadout(loadout);
    const name = loadout && identifiers.names.get(loadout.nameHash);
    const color = loadout && identifiers.colors.get(loadout.colorHash);
    const icon = loadout && identifiers.icons.get(loadout.iconHash);

    return (
        <>
            {!free && color && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`${BUNGIE_ROOT}${color}`}
                    alt=""
                    className="loadout-slot__color"
                />
            )}
            {!free && icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`${BUNGIE_ROOT}${icon}`}
                    alt={name ?? ""}
                    className="loadout-slot__icon"
                />
            )}
            {free && (
                <>
                    <EmptySlotIcon/>
                    <PlusIcon/>
                </>
            )}
            <span className="loadout-slot__number">{index + 1}</span>
        </>
    );
}
