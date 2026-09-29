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
import {useHoverless} from "@/lib/ui/use-media-query";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {BUNGIE_ROOT, TIER} from "@/lib/destiny/display";
import {displayedEnergyCost, isEnhancedPlug} from "@/lib/destiny/sockets";
import {masterworkBorderPath, watermarkPath} from "@/lib/destiny/overlays";
import {useSharedItemConstants} from "@/lib/destiny/item-defs";
import {PlugTooltip} from "./PlugTooltip";
import {EnhancedPerkIcon, LoadingIcon} from "@/components/icons";

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
 * - `masterwork` : catalyseur d'exotique terminé — cadre de pièce maîtresse
 *                 par-dessus l'icône. L'état est calculé par l'appelant : il
 *                 dépend de l'instance de l'arme, pas de la définition du plug.
 *                 Les perks du catalyseur, elles, sont détaillées dans son
 *                 infobulle quel que soit son avancement.
 * - `onEquip`   : rend l'icône cliquable — l'infobulle annonce alors le clic
 *                 gauche comme moyen d'équiper l'attribut
 * - `onBrowse`  : rend l'icône cliquable pour **ouvrir le sélecteur** du socket
 *                 (mods, revêtements, ornements, aspects…), là où les options
 *                 sont trop nombreuses pour tenir en colonne
 * - `browseLabel` : ce que le sélecteur contiendra, annoncé dans l'infobulle
 * - `surface`   : pose un support sous l'icône. Réservé aux plugs dessinés en
 *                 simple tracé clair sans fond (armatures, mods d'artéfact,
 *                 bonus d'ensemble inactifs) : le thème clair seul en pose un.
 * - `selected`  : ce socket est celui dont le sélecteur est ouvert
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
                             def: preloadedDef,
                             markEnhanced = false,
                             masterwork = false,
                             surface = false,
                             onEquip,
                             onBrowse,
                             browseLabel,
                             selected = false,
                             busy = false,
                         }: {
    hash: number;
    square?: boolean;
    state?: "equipped" | "available";
    table?: string;
    typeLabel?: string;
    /** Définition déjà chargée — évite une souscription Dexie par icône */
    def?: InventoryItemDefinition;
    markEnhanced?: boolean;
    masterwork?: boolean;
    surface?: boolean;
    onEquip?: () => void;
    onBrowse?: () => void;
    browseLabel?: string;
    selected?: boolean;
    busy?: boolean;
}) {
    // Une lecture par icône, sauf quand l'appelant a déjà chargé le lot :
    // le sélecteur d'un socket peut en aligner plusieurs centaines.
    const ownDef = useDefinition<InventoryItemDefinition>(
        table,
        preloadedDef ? null : hash,
    );
    const def = preloadedDef ?? ownDef;
    const icon = def?.displayProperties?.icon;
    // Revêtements et ornements portent le filigrane de leur saison — 640 des
    // 720 revêtements du manifeste en ont un. Mods et attributs, aucun : la
    // règle est donc simplement « celui que la définition fournit ».
    const watermark = watermarkPath(def);
    const name = def?.displayProperties?.name ?? "";
    // Coût en énergie d'armure / de coque de spectre, coin haut droit. Écarte de
    // lui-même tout le reste : attributs, ornements et fragments — voir
    // `displayedEnergyCost`.
    const energyCost = displayedEnergyCost(def);
    // Cadre de pièce maîtresse d'un catalyseur terminé. L'image vient du
    // manifeste comme celle des vignettes, dans sa variante exotique : un
    // catalyseur ne se pose que sur une exotique, quelle que soit la rareté du
    // plug lui-même (les « refontes » d'Osteo Striga sont de rareté commune).
    const constants = useSharedItemConstants();
    const masterworkBorder = masterwork
        ? masterworkBorderPath(constants, TIER.Exotic)
        : undefined;

    const [open, setOpen] = useState(false);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "top",
        middleware: [offset(6), flip(), shift({padding: 8})],
        // —— Suivi image par image, et non par observateurs ————
        //
        // L'ancre est une icône posée DANS l'infobulle d'un objet, laquelle
        // grandit à mesure que ses données arrivent et défile pour son propre
        // compte depuis qu'elle est plafonnée. L'icône s'y déplace donc sans
        // changer de taille — un mouvement qu'aucun ResizeObserver ne signale.
        // L'infobulle d'attribut restait alors accrochée à la position que
        // l'icône occupait à l'ouverture, et ne se remettait en place qu'au
        // premier défilement, qui lui déclenchait enfin un recalcul.
        //
        // Le coût est celui d'une boucle d'animation pendant qu'UNE infobulle
        // est ouverte : `autoUpdate` ne tourne que tant que l'élément flottant
        // est monté, et il n'y en a jamais qu'un.
        whileElementsMounted: (reference, floating, update) =>
            autoUpdate(reference, floating, update, {animationFrame: true}),
    });

    // Au doigt, il n'y a pas de survol : le nom et la description d'un attribut
    // n'avaient tout simplement aucune porte. Ils s'ouvrent donc au premier
    // appui — voir plus bas comment le second sert alors à agir.
    const hoverless = useHoverless();

    // Pas de safePolygon ici : l'infobulle est purement informative, on n'a pas
    // besoin d'aller la survoler. La ligne « Équiper » n'y déroge pas — c'est
    // l'icône qu'on clique, pas l'infobulle, qui n'aurait pas le temps d'être
    // atteinte.
    const hover = useHover(context, {
        move: false,
        delay: {open: 0, close: 0},
        enabled: !hoverless,
    });
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "tooltip"});
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        dismiss,
        role,
    ]);

    const enhanced = markEnhanced && isEnhancedPlug(def);
    const equippable = Boolean(onEquip) && !busy;
    // Ouvrir le sélecteur reste possible pendant l'attente : seul le plug déjà
    // demandé n'est pas re-cliquable. C'est ce qui permet d'enchaîner les
    // changements sans attendre la réponse de Bungie.
    const browsable = Boolean(onBrowse);
    // Une seule action possible : équiper l'emporte, un plug proposé dans un
    // sélecteur n'ouvre pas un second sélecteur.
    const activate = onEquip ?? onBrowse;
    const clickable = equippable || browsable;

    const classes = [
        "plug-icon",
        square ? "plug-icon--square" : "plug-icon--circle",
        state ? `plug-icon--${state}` : null,
        enhanced ? "plug-icon--enhanced" : null,
        masterwork ? "plug-icon--masterwork" : null,
        surface ? "plug-icon--surface" : null,
        clickable ? "plug-icon--equippable" : null,
        selected ? "plug-icon--selected" : null,
        busy ? "plug-icon--busy" : null,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <>
            <div
                ref={refs.setReference}
                {...getReferenceProps({
                    onClick: (event) => {
                        // L'infobulle de l'objet se referme au clic extérieur : ce
                        // clic-ci lui appartient, il ne doit pas remonter jusqu'à
                        // la vignette qui la bascule.
                        event.stopPropagation();

                        // Au doigt, ce qui APPLIQUE demande deux appuis : le
                        // premier montre ce que fait l'attribut, le second
                        // l'insère. Sans ce détour on l'insérait au premier
                        // contact sans avoir jamais pu le lire — le survol, qui
                        // le disait, n'existe pas ici.
                        //
                        // Ce qui ne fait qu'OUVRIR un choix n'a rien à protéger
                        // et y va tout droit : le sélecteur montre déjà tout, et
                        // faire passer un revêtement par sa description avant de
                        // l'atteindre donnait un premier appui pour rien.
                        //
                        // Le second appui referme aussi : l'infobulle flotte
                        // au-dessus de tout et recouvrait la feuille — jusqu'au
                        // sélecteur qu'on venait d'y ouvrir.
                        const applies = Boolean(onEquip);
                        if (hoverless && (applies || !clickable)) {
                            if (!open) {
                                setOpen(true);
                                return;
                            }
                            setOpen(false);
                            if (!applies) return;
                        }

                        if (clickable) activate?.();
                    },
                })}
                className={classes}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? name : undefined}
                aria-busy={busy || undefined}
                aria-expanded={onBrowse ? selected : undefined}
            >
                {icon && (
                    <>
                        {/*// eslint-disable-next-line @next/next/no-img-element*/}
                        <img
                            src={`${BUNGIE_ROOT}${icon}`}
                            alt={name}
                            className="plug-icon__img"
                            // Le sélecteur d'un socket de revêtement en aligne
                            // plusieurs centaines : seules celles à l'écran ont
                            // à partir en requête.
                            loading="lazy"
                        />
                        {watermark && (
                            // Filigrane de saison, comme sur les vignettes
                            // d'objets. Il ne concerne en pratique que les
                            // cosmétiques : ni les mods ni les attributs n'en
                            // portent dans le manifeste.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={`${BUNGIE_ROOT}${watermark}`}
                                alt=""
                                className="plug-icon__watermark"
                                loading="lazy"
                            />
                        )}
                        {enhanced && (
                            <EnhancedPerkIcon className="plug-icon__img-enhanced"/>
                        )}
                        {masterworkBorder && (
                            // Le cadre passe par-dessus tous les autres
                            // calques, comme sur une vignette d'objet.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={`${BUNGIE_ROOT}${masterworkBorder}`}
                                alt=""
                                className="plug-icon__masterwork"
                            />
                        )}
                        {energyCost !== undefined && (
                            <span className="plug-icon__energy">{energyCost}</span>
                        )}
                    </>
                )}
                {busy && (
                    // Même animation que les vignettes en cours de déplacement :
                    // elle vit dans le SVG (balises <animate>), pas dans le CSS.
                    <LoadingIcon className="plug-icon__spinner"/>
                )}
            </div>

            {open && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps({
                            // Au doigt, l'infobulle recouvre l'attribut qui l'a
                            // ouverte : la refermer demandait de viser à côté,
                            // alors que c'est elle qu'on a sous le pouce. Elle
                            // ne porte rien de cliquable, l'appui n'a donc rien
                            // d'autre à faire.
                            onClick: hoverless
                                ? (event) => {
                                      event.stopPropagation();
                                      setOpen(false);
                                  }
                                : undefined,
                        })}
                        className="floating-layer floating-layer--nested"
                    >
                        <PlugTooltip
                            hash={hash}
                            table={table}
                            typeLabel={typeLabel}
                            equippable={equippable}
                            browseLabel={browsable ? browseLabel : undefined}
                        />
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
