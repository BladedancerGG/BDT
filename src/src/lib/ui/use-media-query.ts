"use client";

import {useSyncExternalStore} from "react";

/**
 * Les seuils que le JavaScript doit connaître.
 *
 * ⚠ Valeurs en double avec `scss/abstracts/variables.scss`. Le CSS et le
 * JavaScript doivent basculer au même pixel — l'un place, l'autre décide de
 * monter — et une media query Sass ne se lit pas depuis React.
 */
const RAIL_QUERY = "(max-width: 767.98px)"; // $bp-md
const SHEET_QUERY = "(max-width: 639.98px)"; // $bp-sm
const HOVERLESS_QUERY = "(hover: none)";

function subscribe(query: string) {
    return (onChange: () => void) => {
        const media = window.matchMedia(query);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    };
}

/**
 * Une media query, lue comme un état.
 *
 * `useSyncExternalStore` plutôt qu'un état posé dans un effet : c'est lui qui
 * garantit qu'un rendu ne peut pas lire une valeur périmée pendant que la
 * fenêtre change. Le repli serveur vaut `false` — il ne sert qu'aux écrans
 * rendus par le serveur, l'inventaire n'étant monté qu'après le manifeste.
 */
function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        subscribe(query),
        () => window.matchMedia(query).matches,
        () => false,
    );
}

/**
 * La fenêtre est-elle assez étroite pour le rail d'inventaire — une page par
 * personnage, le coffre en dernière (voir `InventoryRail`) ?
 */
export function useRailLayout(): boolean {
    return useMediaQuery(RAIL_QUERY);
}

/**
 * L'infobulle d'objet doit-elle s'ouvrir en feuille basse ?
 *
 * Elle fait 365 px de large et s'ancre à la vignette cliquée : sur un téléphone
 * elle recouvre l'écran entier sans jamais tomber au bon endroit. En dessous du
 * seuil elle monte donc du bas, pleine largeur (voir `components/item-sheet`).
 */
export function useSheetLayout(): boolean {
    return useMediaQuery(SHEET_QUERY);
}

/**
 * Le pointeur est-il incapable de survoler ?
 *
 * Ce qui ne s'ouvre qu'au survol n'a alors aucune porte : les infobulles
 * d'attribut et les rappels de raccourcis s'ouvrent au clic à la place.
 */
export function useHoverless(): boolean {
    return useMediaQuery(HOVERLESS_QUERY);
}
