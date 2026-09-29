"use client";

import type {CSSProperties} from "react";
import type {GroupIcon as GroupIconSpec} from "@/lib/destiny/grouping";
import {
    AmmoIcon,
    ClassSymbol,
    PostmasterIcon,
    VaultIcon,
    WeaponTypeIcon,
} from "@/components/icons";

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
    count: number;
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
            <span className="item-group__count">{count}</span>
        </button>
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
