"use client";

import {useState} from "react";
import {
    useFloating,
    useHover,
    useDismiss,
    useRole,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";
import {useDefinition} from "@/lib/manifest/use-definition";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {PlugTooltip} from "./PlugTooltip";

/**
 * Icône d'un plug (perk / mod), résolue via son hash dans le manifeste.
 * - `square`    : mods et cosmétiques (forme carrée)
 * - `state`     : met en avant le plug équipé parmi les options disponibles
 * - `table`     : table du manifeste à interroger — les bonus d'ensemble vivent
 *                 dans DestinySandboxPerkDefinition, pas dans les objets
 * - `typeLabel` : remplace le type affiché dans l'infobulle, quand le manifeste
 *                 n'en fournit pas
 *
 * Au survol, une infobulle détaille le plug. Elle est rendue dans un portail :
 * elle n'est donc pas rognée par l'infobulle d'objet qui la contient.
 */
export function PlugIcon({
                             hash,
                             square = false,
                             state,
                             table = "DestinyInventoryItemDefinition",
                             typeLabel,
                         }: {
    hash: number;
    square?: boolean;
    state?: "equipped" | "available";
    table?: string;
    typeLabel?: string;
}) {
    const def = useDefinition<InventoryItemDefinition>(table, hash);
    const icon = def?.displayProperties?.icon;
    const name = def?.displayProperties?.name ?? "";

    const [open, setOpen] = useState(false);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "top",
        middleware: [offset(6), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    // Pas de safePolygon ici : l'infobulle est purement informative, on n'a pas
    // besoin d'aller la survoler.
    const hover = useHover(context, {move: false, delay: {open: 0, close: 0}});
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "tooltip"});
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        dismiss,
        role,
    ]);

    const classes = [
        "plug-icon",
        square ? "plug-icon--square" : null,
        state ? `plug-icon--${state}` : null,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <>
            <div ref={refs.setReference} {...getReferenceProps()} className={classes}>
                {icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`${BUNGIE_ROOT}${icon}`}
                        alt={name}
                        className="plug-icon__img"
                    />
                )}
            </div>

            {open && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="floating-layer floating-layer--nested"
                    >
                        <PlugTooltip hash={hash} table={table} typeLabel={typeLabel}/>
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
