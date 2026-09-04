"use client";

import type {ReactNode} from "react";
import {
    useFloating,
    useDismiss,
    useRole,
    useInteractions,
    useTransitionStatus,
    FloatingOverlay,
    FloatingFocusManager,
    FloatingPortal,
} from "@floating-ui/react";

/**
 * Durée de l'animation d'ouverture et de fermeture, en millisecondes.
 *
 * Doit rester égale à `$duration` dans `scss/components/modal.scss` : c'est
 * elle qui décide du moment où la modale est démontée. Trop courte, l'animation
 * de sortie serait coupée ; trop longue, la modale resterait montée pour rien
 * et le défilement de la page bloqué d'autant.
 */
const TRANSITION_MS = 300;

/**
 * Fenêtre modale accessible et animée.
 *
 * Floating UI fournit le piégeage du focus, la fermeture par Échap ou clic sur
 * l'arrière-plan, et les rôles ARIA. `FloatingOverlay lockScroll` empêche la
 * page de défiler derrière.
 *
 * L'animation passe par `useTransitionStatus` plutôt que par un simple
 * `open && …` : sans lui, la fermeture démonterait l'élément dans l'instant et
 * l'animation de sortie n'aurait jamais lieu. Le statut est exposé au CSS via
 * `data-status`, qui vaut successivement `initial`, `open`, puis `close`.
 */
export function Modal({
                          open,
                          onClose,
                          title,
                          compact = false,
                          children,
                      }: {
    open: boolean;
    onClose: () => void;
    title: string;
    /**
     * La modale se dimensionne sur son contenu au lieu d'occuper la place des
     * paramètres.
     *
     * Le gabarit par défaut est celui d'un panneau à catégories : hauteur
     * imposée, largeur généreuse. Un formulaire de deux champs y flottait au
     * milieu du vide.
     */
    compact?: boolean;
    children: ReactNode;
}) {
    const {refs, context} = useFloating({
        open,
        onOpenChange: (next) => {
            if (!next) onClose();
        },
    });

    const dismiss = useDismiss(context, {outsidePressEvent: "mousedown"});
    const role = useRole(context, {role: "dialog"});
    const {getFloatingProps} = useInteractions([dismiss, role]);

    // Reste monté pendant l'animation de fermeture, puis se démonte
    const {isMounted, status} = useTransitionStatus(context, {
        duration: TRANSITION_MS,
    });

    if (!isMounted) return null;

    return (
        <FloatingPortal>
            <FloatingOverlay className="modal-overlay" data-status={status} lockScroll>
                <FloatingFocusManager context={context} modal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        {...getFloatingProps()}
                        aria-label={title}
                        data-status={status}
                        className={`modal${compact ? " modal--compact" : ""}`}
                    >
                        {children}
                    </div>
                </FloatingFocusManager>
            </FloatingOverlay>
        </FloatingPortal>
    );
}
