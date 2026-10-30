"use client";

import {useState, type ReactNode} from "react";
import {useTranslations} from "next-intl";
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
 * « Actions » : les gestes de l'éditeur de groupe, rangés dans une bulle.
 *
 * Huit boutons côte à côte prenaient la barre d'outils entière, et passaient à
 * la ligne bien avant le téléphone. Ils sont reçus tels quels — chacun garde son
 * libellé, son état désactivé et sa teinte — et seule leur place change.
 *
 * La bulle se referme dès qu'un bouton y est cliqué : chaque geste ouvre une
 * confirmation, une modale ou un mode de la vue, et la laisser ouverte
 * par-dessus les aurait masqués. Un bouton désactivé n'émet aucun clic, il ne
 * la referme donc pas.
 */
export function GroupActionsMenu({children}: {children: ReactNode}) {
    const t = useTranslations("groups");
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
                className="btn btn--small group-actions__button"
                aria-expanded={open}
                {...getReferenceProps()}
            >
                {t("actions")}
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
