"use client";

import type {CSSProperties} from "react";
import type {GroupIconKind} from "@/lib/destiny/grouping";

/**
 * En-tête repliable d'un ensemble d'objets : bouton pleine largeur, pour que la
 * cible de repli couvre toute la ligne.
 *
 * Partagé par le coffre virtualisé (emplacements et sous-groupes) et par les
 * sections statiques de l'inventaire (objets perdus, coffre) : c'est la même
 * structure et le même style, seul `virtual` change — les en-têtes du coffre
 * sont des lignes de la virtualisation, donc positionnés en absolu.
 */
export function GroupHeader({
                                kind,
                                label,
                                count,
                                icon,
                                iconKind,
                                collapsed,
                                onToggle,
                                expandLabel,
                                collapseLabel,
                                style,
                                virtual = false,
                            }: {
    kind: "section" | "group";
    label: string;
    count: number;
    icon?: string;
    iconKind?: GroupIconKind;
    collapsed: boolean;
    onToggle: () => void;
    expandLabel: string;
    collapseLabel: string;
    style?: CSSProperties;
    virtual?: boolean;
}) {
    return (
        <button
            type="button"
            className={`item-group item-group--${kind}${virtual ? " item-group--virtual" : ""}`}
            style={style}
            onClick={onToggle}
            aria-expanded={!collapsed}
            title={collapsed ? expandLabel : collapseLabel}
        >
            {/* Chevron orienté par CSS selon l'état */}
            <svg className="item-group__chevron" viewBox="0 0 16 16" aria-hidden focusable="false">
                <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            <GroupIcon icon={icon} kind={iconKind}/>

            <span className="item-group__label">{label}</span>
            <span className="item-group__count">{count}</span>
        </button>
    );
}

/**
 * Icône d'un en-tête.
 *
 * Deux rendus, selon la nature du fichier : les symboles monochromes passent en
 * masque CSS pour hériter de la couleur du texte (voir `GroupIconKind`), les
 * illustrations déjà colorées en simple image.
 */
function GroupIcon({icon, kind}: { icon?: string; kind?: GroupIconKind }) {
    if (!icon) return null;

    if (kind === "mask") {
        return (
            <span
                className="item-group__icon item-group__icon--mask"
                style={{"--group-icon": `url(${icon})`} as CSSProperties}
                aria-hidden
            />
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="item-group__icon" src={icon} alt="" aria-hidden/>
    );
}
