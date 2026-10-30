"use client";

import type {CSSProperties} from "react";
import {ExclamationTriangleIcon} from "@heroicons/react/24/solid";
import type {GroupIcon as GroupIconSpec} from "@/lib/destiny/grouping";
import {
    AmmoIcon,
    ClassSymbol,
    PostmasterIcon,
    VaultIcon,
    WeaponTypeIcon,
} from "@/components/icons";

/**
 * Compteur d'un en-tête.
 *
 * `total` est l'occupation réelle, tous types confondus ; `found` ne vient
 * qu'avec une recherche active, pour dire ce qu'elle en retient sans masquer
 * ce qui occupe la place ; `max` que là où la limite a un sens.
 */
export interface HeaderCount {
    total: number;
    found?: number;
    max?: number;
    /**
     * Seuil d'alerte, en deçà de la limite : passé ce nombre, le compteur
     * vire au rouge — le temps de faire de la place avant que le jeu ne
     * refuse, ou que le Courrier ne perde des objets.
     */
    alert?: number;
}

/**
 * En-tête repliable d'un ensemble d'objets : bouton pleine largeur, pour que la
 * cible de repli couvre toute la ligne.
 *
 * Trois niveaux, tous rendus par ce composant : `root` (objets perdus, coffre),
 * `section` (emplacement d'origine) et `group` (sous-groupe au choix du joueur).
 * `virtual` distingue les en-têtes qui sont des lignes de la virtualisation,
 * donc positionnés en absolu, de ceux posés dans un flux normal.
 */
export function GroupHeader({
                                kind,
                                label,
                                count,
                                icon,
                                collapsed,
                                onToggle,
                                expandLabel,
                                collapseLabel,
                                style,
                                virtual = false,
                            }: {
    kind: "root" | "section" | "group";
    label: string;
    /** Absent : l'en-tête n'affiche aucun compteur */
    count?: HeaderCount;
    icon?: GroupIconSpec;
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

            <GroupIcon icon={icon}/>

            <span className="item-group__label">{label}</span>
            {count && <Count count={count}/>}
        </button>
    );
}

/** Compteur d'un en-tête — voir `HeaderCount`. */
function Count({count}: { count: HeaderCount }) {
    const alert = count.alert !== undefined && count.total > count.alert;
    return (
        <span
            className={`item-group__count${alert ? " item-group__count--alert" : ""}`}
        >
            {alert && (
                <ExclamationTriangleIcon className="item-group__alert" aria-hidden/>
            )}
            {count.found !== undefined && `${count.found} · `}
            {count.total}
            {count.max !== undefined && ` / ${count.max}`}
        </span>
    );
}

/**
 * Icône d'un en-tête. Les icônes locales sont des SVG intégrés, qui héritent
 * donc de la couleur du texte ; seule l'illustration du manifeste reste un
 * `<img>`, faute de pouvoir intégrer une image de bungie.net (voir `GroupIcon`).
 */
function GroupIcon({icon}: { icon?: GroupIconSpec }) {
    if (!icon) return null;

    switch (icon.kind) {
        case "ammo":
            return <AmmoIcon ammoType={icon.ammoType} className={ICON_CLASS}/>;
        case "weaponType":
            return (
                <WeaponTypeIcon
                    subType={icon.subType}
                    ammoType={icon.ammoType}
                    className={ICON_CLASS}
                />
            );
        case "class":
            return <ClassSymbol classType={icon.classType} className={ICON_CLASS}/>;
        case "vault":
            return <VaultIcon className={ICON_CLASS}/>;
        case "postmaster":
            return <PostmasterIcon className={ICON_CLASS}/>;
        case "image":
            return (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={ICON_CLASS} src={icon.src} alt="" aria-hidden/>
            );
    }
}

const ICON_CLASS = "item-group__icon";
