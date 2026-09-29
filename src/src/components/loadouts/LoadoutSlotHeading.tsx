"use client";

import type {DestinyLoadout} from "@/lib/bungie/profile";
import type {LoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {LoadoutSlotTile} from "./LoadoutSlotTile";

/**
 * Le titre d'un emplacement d'équipement montré en **lecture seule**.
 *
 * Le pendant de `GroupSlotIdentifiers`, dont il reprend la place : ici il n'y a
 * rien à choisir — l'emplacement appartient au jeu, à un autre groupe, ou à un
 * partage qu'on ne fait que consulter. La mention dit d'où vient ce qu'on lit,
 * sans quoi rien ne distinguerait la prévisualisation du contenu qu'on modifie,
 * les deux occupant le même panneau.
 *
 * Les identifiants sont **reçus** et non lus : ils viennent de l'unique requête
 * groupée de l'écran, comme les vignettes des grilles.
 */
export function LoadoutSlotHeading({
                                       loadout,
                                       index,
                                       identifiers,
                                       label,
                                   }: {
    loadout: DestinyLoadout;
    /** Place de l'emplacement chez son propriétaire, à partir de 0 */
    index: number;
    identifiers: LoadoutIdentifiers;
    /** Ce qu'on regarde : « Prévisualisation de », « Partage de »… */
    label?: string;
}) {
    const name = identifiers.names.get(loadout.nameHash);

    return (
        <span className="slot-heading">
            {label && <span className="slot-heading__label">{label}</span>}
            {/* La vignette des grilles, telle quelle : le fond coloré, le
                glyphe par-dessus et le numéro dans l'angle. La recomposer ici
                aurait redit ce que `LoadoutSlotTile` dessine déjà, et laissé les
                deux se désaccorder à la première retouche. Elle n'est pas
                cliquable ici — d'où le `<span>` et non le `<button>` des
                grilles, l'habillage `.loadout-slot` étant commun. */}
            <span className="loadout-slot slot-heading__slot">
                <LoadoutSlotTile
                    loadout={loadout}
                    index={index}
                    identifiers={identifiers}
                />
            </span>
            {name && <span className="slot-heading__name">{name}</span>}
        </span>
    );
}
