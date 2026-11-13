import type {Modifier} from "@dnd-kit/core";

/**
 * Modificateur dnd-kit : garde l'élément glissé dans la zone **visible** de son
 * premier ancêtre défilant.
 *
 * Sans lui, l'élément glissé — simplement translaté — compte dans le
 * débordement de ce conteneur : tiré vers un bord, il agrandit la zone
 * défilable, l'auto-défilement suit, l'élément suit le pointeur, et la zone
 * grandit encore. La liste des groupes défilait ainsi sans fin vers le bas, et
 * les deux vues glissaient de côté alors que rien n'y déborde en largeur.
 *
 * Borné au rectangle visible, l'élément ne dépasse jamais le contenu réel :
 * l'auto-défilement, qui suit le pointeur et non l'élément, reste disponible
 * pour atteindre le reste d'une longue liste.
 *
 * Écrit ici plutôt que tiré de `@dnd-kit/modifiers` : c'est le seul dont on a
 * besoin, et il tient en quelques lignes.
 */
export const restrictToScrollArea: Modifier = ({
                                                   transform,
                                                   draggingNodeRect,
                                                   scrollableAncestorRects,
                                               }) => {
    const bound = scrollableAncestorRects[0];
    if (!draggingNodeRect || !bound) return transform;

    const value = {...transform};

    if (draggingNodeRect.top + transform.y <= bound.top) {
        value.y = bound.top - draggingNodeRect.top;
    } else if (draggingNodeRect.bottom + transform.y >= bound.bottom) {
        value.y = bound.bottom - draggingNodeRect.bottom;
    }

    if (draggingNodeRect.left + transform.x <= bound.left) {
        value.x = bound.left - draggingNodeRect.left;
    } else if (draggingNodeRect.right + transform.x >= bound.right) {
        value.x = bound.right - draggingNodeRect.right;
    }

    return value;
};
