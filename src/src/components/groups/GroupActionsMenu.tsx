"use client";

import {useState, type ReactNode} from "react";
import {
    useFloating,
    useClick,
    useDismiss,
    useRole,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
    FloatingFocusManager,
} from "@floating-ui/react";
import {ChevronDownIcon} from "@heroicons/react/24/solid";

/**
 * Une famille de gestes de l'éditeur de groupe, rangée dans une bulle.
 *
 * Une dizaine de boutons côte à côte prenaient la barre d'outils entière, et
 * passaient à la ligne bien avant le téléphone. Une seule bulle « Actions »
 * mêlait en revanche l'équipement, le partage et les gestes destructeurs : il
 * fallait l'ouvrir pour savoir lequel on allait toucher. Les familles ont donc
 * chacune la leur, et le déclencheur porte la teinte de la famille — principale,
 * neutre ou destructrice — pour qu'elle se lise avant l'ouverture.
 *
 * Les boutons sont reçus tels quels — chacun garde son libellé, son état
 * désactivé et sa teinte — et seule leur place change.
 *
 * La bulle se referme dès qu'un bouton y est cliqué : chaque geste ouvre une
 * confirmation, une modale ou un mode de la vue, et la laisser ouverte
 * par-dessus les aurait masqués. Un bouton désactivé n'émet aucun clic, il ne
 * la referme donc pas.
 */
export function GroupActionsMenu({
    label,
    variant,
    children,
}: {
    label: ReactNode;
    /** La teinte du déclencheur, celle de la famille de gestes */
    variant?: "primary" | "danger";
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "bottom-end",
        middleware: [offset(4), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    const {getReferenceProps, getFloatingProps} = useInteractions([
        useClick(context),
        useDismiss(context, {outsidePressEvent: "mousedown"}),
        useRole(context, {role: "dialog"}),
    ]);

    return (
        <>
            <button
                // setReference est un callback ref stable de Floating UI
                ref={refs.setReference}
                type="button"
                className={`btn btn--small${
                    variant ? ` btn--${variant}` : ""
                } group-actions__button`}
                aria-expanded={open}
                {...getReferenceProps()}
            >
                {label}
                <ChevronDownIcon aria-hidden/>
            </button>

            {open && (
                <FloatingPortal>
                    <FloatingFocusManager context={context} modal={false}>
                        <div
                            // eslint-disable-next-line react-hooks/refs
                            ref={refs.setFloating}
                            style={floatingStyles}
                            className="group-actions"
                            {...getFloatingProps({
                                onClick: (event) => {
                                    if ((event.target as Element).closest("button")) {
                                        setOpen(false);
                                    }
                                },
                            })}
                        >
                            {children}
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </>
    );
}
