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
import {isEnhancedPlug} from "@/lib/destiny/sockets";
import {PlugTooltip} from "./PlugTooltip";

/**
 * Icône d'un plug (perk / mod), résolue via son hash dans le manifeste.
 * - `square`    : mods et cosmétiques (forme carrée)
 * - `state`     : met en avant le plug équipé parmi les options disponibles
 * - `table`     : table du manifeste à interroger — les bonus d'ensemble vivent
 *                 dans DestinySandboxPerkDefinition, pas dans les objets
 * - `typeLabel` : remplace le type affiché dans l'infobulle, quand le manifeste
 *                 n'en fournit pas
 * - `markEnhanced` : signale les versions améliorées d'attributs. Réservé aux
 *                 colonnes d'attributs d'arme, seules à en contenir.
 * - `onEquip`   : rend l'icône cliquable — l'infobulle annonce alors le clic
 *                 gauche comme moyen d'équiper l'attribut
 * - `busy`      : requête en cours sur ce socket
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
                             markEnhanced = false,
                             onEquip,
                             busy = false,
                         }: {
    hash: number;
    square?: boolean;
    state?: "equipped" | "available";
    table?: string;
    typeLabel?: string;
    markEnhanced?: boolean;
    onEquip?: () => void;
    busy?: boolean;
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
    // besoin d'aller la survoler. La ligne « Équiper » n'y déroge pas — c'est
    // l'icône qu'on clique, pas l'infobulle, qui n'aurait pas le temps d'être
    // atteinte.
    const hover = useHover(context, {move: false, delay: {open: 0, close: 0}});
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "tooltip"});
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        dismiss,
        role,
    ]);

    const enhanced = markEnhanced && isEnhancedPlug(def);
    const equippable = Boolean(onEquip) && !busy;

    const classes = [
        "plug-icon",
        square ? "plug-icon--square" : "plug-icon--circle",
        state ? `plug-icon--${state}` : null,
        enhanced ? "plug-icon--enhanced" : null,
        equippable ? "plug-icon--equippable" : null,
        busy ? "plug-icon--busy" : null,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <>
            <div
                ref={refs.setReference}
                {...getReferenceProps({
                    onClick: onEquip
                        ? (event) => {
                            // L'infobulle de l'objet se referme au clic extérieur : ce
                            // clic-ci lui appartient, il ne doit pas remonter jusqu'à
                            // la vignette qui la bascule.
                            event.stopPropagation();
                            if (equippable) onEquip();
                        }
                        : undefined,
                })}
                className={classes}
                role={equippable ? "button" : undefined}
                tabIndex={equippable ? 0 : undefined}
                aria-label={equippable ? name : undefined}
                aria-busy={busy || undefined}
            >
                {icon && (
                    <>
                        {/*// eslint-disable-next-line @next/next/no-img-element*/}
                        <img
                            src={`${BUNGIE_ROOT}${icon}`}
                            alt={name}
                            className="plug-icon__img"
                        />
                        {enhanced && (
                            <>
                                {/*// eslint-disable-next-line @next/next/no-img-element*/}
                                <img
                                    src={"/icons/enhanced_perk.svg"}
                                    className="plug-icon__img-enhanced"
                                />
                            </>

                        )}
                    </>
                )}
                {busy && (
                    // Même animation que les vignettes en cours de déplacement :
                    // elle vit dans le SVG, aucune règle d'ici ne l'atteint.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/icons/loading.svg" alt="" className="plug-icon__spinner"/>
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
                        <PlugTooltip
                            hash={hash}
                            table={table}
                            typeLabel={typeLabel}
                            equippable={equippable}
                        />
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
