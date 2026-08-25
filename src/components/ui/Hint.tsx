"use client";

import {useState, type ReactNode} from "react";
import {
    useFloating,
    useHover,
    useFocus,
    useDismiss,
    useRole,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";

/** Une action annoncée dans l'infobulle, et la touche qui la déclenche. */
export interface HintAction {
    label: string;
    /** Raccourcis équivalents, affichés en `<kbd>` */
    keys?: readonly string[];
    /** Second moyen de la déclencher, en une ligne (« appui long ») */
    note?: string;
}

/**
 * Infobulle d'un bouton de l'en-tête : ce qu'il fait, et par quelles touches.
 *
 * Un composant enveloppant plutôt qu'un `title` natif : celui-ci n'affiche
 * qu'une ligne de texte brut, sans mise en forme des touches, et met une seconde
 * à apparaître. Elle enveloppe la cible au lieu de lui greffer ses gestionnaires
 * — le bouton garde ainsi les siens intacts, y compris ceux de l'appui long.
 *
 * Ouverte au survol **et au focus** : les raccourcis qu'elle annonce sont faits
 * pour le clavier, il serait singulier de ne pouvoir les découvrir qu'à la
 * souris.
 */
export function Hint({
                         actions,
                         children,
                     }: {
    actions: readonly HintAction[];
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "bottom-end",
        middleware: [offset(6), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    const hover = useHover(context, {move: false, delay: {open: 200, close: 0}});
    const focus = useFocus(context);
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "tooltip"});
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        focus,
        dismiss,
        role,
    ]);

    return (
        <>
            <span
                ref={refs.setReference}
                {...getReferenceProps()}
                className="hint"
            >
                {children}
            </span>

            {open && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="floating-layer"
                    >
                        <div className="hint-tooltip">
                            {actions.map((action) => (
                                <div key={action.label} className="hint-tooltip__action">
                                    <span className="hint-tooltip__label">{action.label}</span>
                                    {action.keys && action.keys.length > 0 && (
                                        <span className="hint-tooltip__keys">
                                            {action.keys.map((key) => (
                                                <kbd key={key}>{key}</kbd>
                                            ))}
                                        </span>
                                    )}
                                    {action.note && (
                                        <span className="hint-tooltip__note">{action.note}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
