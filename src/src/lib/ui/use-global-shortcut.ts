"use client";

import {useEffect, useRef} from "react";

/**
 * Un raccourci clavier valable partout dans la page.
 *
 * Trois précautions, communes à tous les raccourcis de l'application et qu'il
 * vaut mieux écrire une fois :
 *
 *  - **une saisie garde ses touches.** La barre de recherche prend le focus dès
 *    qu'on tape une lettre n'importe où (voir SearchBar) : sans cette garde, `R`
 *    déclencherait un rafraîchissement au milieu d'une requête. Une modale piège
 *    de toute façon le clavier.
 *  - **la phase de capture**, et non le bourgeonnement : l'écouteur de la
 *    recherche est posé sur `document` lui aussi, et l'ordre entre deux
 *    écouteurs de même phase dépend de l'ordre de montage. En capture, celui-ci
 *    passe forcément avant, et son `preventDefault` fait renoncer l'autre — qui
 *    teste `defaultPrevented` en premier.
 *  - **le défaut du navigateur est absorbé** : F1 ouvre l'aide, Tab déplace le
 *    focus.
 *
 * Le gestionnaire est gardé dans une ref, tenue à jour par un effet : l'écouteur
 * n'est donc posé qu'une fois, quelles que soient les valeurs qu'il capture, et
 * les appelants n'ont pas à mémoriser la fonction qu'ils passent.
 */
export function useGlobalShortcut(
    /** Valeur de `KeyboardEvent.key`, comparée sans tenir compte de la casse */
    key: string,
    handler: () => void,
    options: {
        /** Exiger Maj (vrai), l'interdire (faux), ou l'ignorer (undefined) */
        shift?: boolean;
        /** Ne rien écouter — un raccourci qui n'a pas lieu d'être */
        enabled?: boolean;
    } = {},
) {
    const {shift, enabled = true} = options;
    // L'affectation vit dans un effet, pas dans le rendu : écrire une ref
    // pendant le rendu est ce que la règle `react-hooks/refs` interdit.
    const latest = useRef(handler);
    useEffect(() => {
        latest.current = handler;
    });

    useEffect(() => {
        if (!enabled) return;

        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.toLowerCase() !== key.toLowerCase()) return;
            if (shift !== undefined && event.shiftKey !== shift) return;

            const target = event.target as HTMLElement | null;
            if (target?.isContentEditable) return;
            if (target?.closest("input, textarea, select, [role='dialog']")) return;

            event.preventDefault();
            latest.current();
        };

        document.addEventListener("keydown", onKeyDown, {capture: true});
        return () =>
            document.removeEventListener("keydown", onKeyDown, {capture: true});
    }, [key, shift, enabled]);
}
