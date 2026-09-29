"use client";

import type {CSSProperties} from "react";
import {useDefinition} from "@/lib/manifest/use-definition";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/**
 * Archétype d'une armure — « Démolisseur », « Parangon », « Mitrailleur »… —
 * posé à côté de sa puissance, comme le type de munitions l'est sur une arme.
 *
 * Il y en a douze dans le manifeste, chacun avec sa propre icône. Sa description
 * n'est pas reprise : elle nomme surtout les deux statistiques favorisées, qui
 * sont déjà les plus hautes du bloc de statistiques juste en dessous.
 */
export function ArmorArchetype({hash}: { hash: number }) {
    const def = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        hash,
    );
    const icon = def?.displayProperties?.icon;
    const name = def?.displayProperties?.name;
    if (!name) return null;

    return (
        <div className="armor-archetype">
            {icon && (
                // Dessin blanc sur fond transparent : invisible tel quel sur le
                // thème clair. Posé en masque, il prend la couleur du texte —
                // même mécanisme que le glyphe de munitions des armes.
                <span
                    className="armor-archetype__icon"
                    style={
                        {"--archetype-icon": `url(${BUNGIE_ROOT}${icon})`} as CSSProperties
                    }
                    aria-hidden
                />
            )}
            <span className="armor-archetype__name">{name}</span>
        </div>
    );
}
