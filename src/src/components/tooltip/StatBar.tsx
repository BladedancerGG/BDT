"use client";

import {useState, type CSSProperties} from "react";
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
import {useTranslations} from "next-intl";
import {useDefinition} from "@/lib/manifest/use-definition";
import {useHoverless} from "@/lib/ui/use-media-query";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {barSegments, type StatBreakdown} from "@/lib/destiny/stat-breakdown";
import TunedStatIcon from "@/components/icons/armor/TunedStatIcon";
import type {StatDefinition} from "@/lib/destiny/types";
import {StatTooltip} from "./StatTooltip";

/**
 * Une ligne de statistique : nom, icône, barre proportionnelle, puis valeur.
 *
 * La valeur est **après** la barre, comme dans le jeu : les nombres forment
 * ainsi une colonne alignée à droite, que la barre soit courte ou longue.
 *
 * `withBar={false}` pour les statistiques qui sont des valeurs et non des notes
 * (cadence de tir, taille du chargeur, direction du recul…) : une barre y serait
 * trompeuse, ces valeurs n'ayant pas de maximum commun.
 *
 * Au survol (à l'appui sans souris), une infobulle donne la description de la
 * statistique et, quand `breakdown` est fourni, le détail de son total.
 */
export function StatBar({
                            statHash,
                            value,
                            max,
                            withBar = true,
                            signed = false,
                            breakdown,
                            tuned,
                        }: {
    statHash: number;
    value: number;
    max: number;
    withBar?: boolean;
    /** Préfixe les valeurs positives d'un « + » : utile pour des écarts */
    signed?: boolean;
    /**
     * Décomposition du total : base en clair, attributs et mods en bleu, pièce
     * maîtresse en doré, puis ce que retirent attributs et mods en rouge.
     * Sans elle, la barre est d'un seul tenant.
     */
    breakdown?: StatBreakdown;
    /**
     * Repère de statistique ajustée (armures légendaires de palier 5).
     * `undefined` supprime la colonne : ailleurs, elle décalerait les noms pour
     * rien.
     */
    tuned?: boolean;
}) {
    const t = useTranslations("item");
    const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
    const name = def?.displayProperties?.name;
    // Les statistiques d'armure ont une icône, celles des armes non.
    const icon = def?.displayProperties?.icon;

    const [open, setOpen] = useState(false);
    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "left",
        middleware: [offset(8), flip({fallbackPlacements: ["top", "bottom"]}), shift({padding: 8})],
        // Même raison que l'infobulle d'attribut : la ligne se déplace avec le
        // défilement de l'infobulle d'objet sans changer de taille.
        whileElementsMounted: (reference, floating, update) =>
            autoUpdate(reference, floating, update, {animationFrame: true}),
    });
    const hoverless = useHoverless();
    const hover = useHover(context, {
        move: false,
        delay: {open: 0, close: 0},
        enabled: !hoverless,
    });
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "tooltip"});
    const {getReferenceProps, getFloatingProps} = useInteractions([hover, dismiss, role]);

    if (!name) return null;

    const pct = (part: number) =>
        max > 0 ? Math.max(0, Math.min(100, (part / max) * 100)) : 0;

    // Sans décomposition, tout est base : une seule teinte.
    const segments = breakdown
        ? barSegments(breakdown)
        : {base: value, bonus: 0, masterwork: 0, malus: 0};

    return (
        <>
            <div
                ref={refs.setReference}
                {...getReferenceProps({
                    // Au doigt, pas de survol : l'appui ouvre et referme. Il ne
                    // doit pas remonter jusqu'à la vignette qui bascule
                    // l'infobulle d'objet.
                    onClick: hoverless
                        ? (event) => {
                            event.stopPropagation();
                            setOpen((current) => !current);
                        }
                        : undefined,
                })}
                className={`stat-bar${withBar ? "" : " stat-bar--plain"}`}
            >
                <span className="stat-bar__name">
                    {/* Colonne rendue même vide : le repère ne doit pas décaler les
                    noms d'une ligne à l'autre. */}
                    {tuned !== undefined && (
                        <span
                            className="stat-bar__tuned"
                            title={tuned ? t("tunedStat") : undefined}
                            aria-label={tuned ? t("tunedStat") : undefined}
                        >
                        {tuned && <TunedStatIcon/>}
                    </span>
                    )}
                    {name}
                </span>

                {icon && (
                    // Glyphe blanc sur fond transparent : posé en masque, il prend
                    // la couleur du texte — comme l'icône d'archétype.
                    <span
                        className="stat-bar__icon"
                        style={{"--stat-icon": `url(${BUNGIE_ROOT}${icon})`} as CSSProperties}
                        aria-hidden
                    />
                )}

                {withBar && (
                    <div className="stat-bar__track">
                        {/* Largeurs transmises au CSS par variables. Un segment
                        nul n'est pas rendu : un bloc de largeur zéro reste
                        un nœud de plus par ligne pour rien. */}
                        {(
                            [
                                ["base", segments.base],
                                ["bonus", segments.bonus],
                                ["masterwork", segments.masterwork],
                                ["malus", segments.malus],
                            ] as const
                        ).map(
                            ([kind, part]) =>
                                part > 0 && (
                                    <div
                                        key={kind}
                                        className={`stat-bar__fill stat-bar__fill--${kind}`}
                                        style={{"--stat-pct": `${pct(part)}%`} as CSSProperties}
                                    />
                                ),
                        )}
                    </div>
                )}

                <span
                    className={`stat-bar__value${
                        // Sans barre, pas de segment doré : c'est la valeur qui
                        // signale l'apport de la pièce maîtresse (vitesse de
                        // charge d'un fusil à fusion, de tir d'un arc).
                        !withBar && breakdown && breakdown.masterwork !== 0
                            ? " stat-bar__value--masterwork"
                            : ""
                    }`}
                >
                    {signed && value > 0 ? `+${value}` : value}
                </span>
            </div>

            {open && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps({
                            onClick: hoverless
                                ? (event) => {
                                    event.stopPropagation();
                                    setOpen(false);
                                }
                                : undefined,
                        })}
                        className="floating-layer floating-layer--nested"
                    >
                        <StatTooltip
                            name={name}
                            description={def?.displayProperties?.description}
                            breakdown={breakdown}
                        />
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
