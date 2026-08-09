"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {useVirtualizer} from "@tanstack/react-virtual";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {GroupIconKind} from "@/lib/destiny/grouping";
import {useGroupedItems} from "@/lib/destiny/use-grouped-items";
import {useGridMetrics} from "@/lib/destiny/use-grid-metrics";
import {useSearchFiltered} from "@/lib/search/provider";
import {useSettings} from "@/lib/settings/store";
import {ItemIcon} from "./ItemIcon";

/**
 * Une ligne de la grille virtualisée. Les en-têtes en font partie au même titre
 * que les objets : c'est la seule façon de les faire défiler avec le contenu
 * sans sortir de la virtualisation — et donc sans monter les milliers de
 * vignettes qu'elle sert précisément à éviter.
 */
type GridRow =
    | {
    kind: "section";
    key: string;
    label: string;
    count: number;
    collapsed: boolean;
    height: number;
}
    | {
    kind: "group";
    key: string;
    label: string;
    icon?: string;
    iconKind?: GroupIconKind;
    count: number;
    collapsed: boolean;
    height: number;
}
    | {
    kind: "items";
    key: string;
    items: DestinyItemComponent[];
    height: number;
};

/**
 * Grille d'objets virtualisée, pour les listes longues (le coffre en compte
 * environ un millier).
 *
 * Seules les lignes visibles sont montées : le DOM reste petit et les images
 * hors écran ne sont jamais demandées. Les objets étant de taille fixe, on
 * virtualise par **lignes** — le nombre de colonnes est déduit de la largeur
 * disponible (voir useGridMetrics).
 *
 * Le contenu est découpé en sections d'emplacement, elles-mêmes découpées en
 * sous-groupes selon le réglage du joueur (voir `lib/destiny/grouping.ts`).
 * Chaque en-tête se replie, mais cet état n'est **pas** mémorisé : le cookie de
 * préférences est plafonné à 4 Ko et partagé, une liste de groupes repliés y
 * grandirait sans limite.
 *
 * Les infobulles ne sont pas rognées par le conteneur de défilement : elles
 * sont rendues dans un portail, en dehors de cet arbre DOM.
 */
export function VirtualItemGrid({
                                    title,
                                    items,
                                    details,
                                }: {
    title: string;
    items: DestinyItemComponent[];
    details: Record<string, ItemDetail>;
}) {
    const t = useTranslations("inventory");
    // La recherche s'applique avant le regroupement : les compteurs des
    // sections comptent alors ce qui est réellement affiché.
    const found = useSearchFiltered(items);
    // Filtrés, triés selon les critères réglés dans les paramètres, puis groupés
    const sections = useGroupedItems(found, details);
    const viewportRef = useRef<HTMLDivElement>(null);
    // La taille réglée dans les paramètres change la grille sans changer sa
    // largeur : on la passe pour forcer une re-mesure. C'est le réglage dédié au
    // coffre, celui dont --item-size hérite ici (voir inventory-view.scss).
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const {columns, rowHeight, sectionHeight, groupHeight} = useGridMetrics(
        viewportRef,
        vaultIconSize,
    );

    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const toggle = useCallback((key: string) => {
        setCollapsed((previous) => {
            const next = new Set(previous);
            if (!next.delete(key)) next.add(key);
            return next;
        });
    }, []);

    const total = useMemo(
        () => sections.reduce((sum, section) => sum + section.count, 0),
        [sections],
    );

    const rows = useMemo(() => {
        const out: GridRow[] = [];

        for (const section of sections) {
            const sectionCollapsed = collapsed.has(section.key);
            out.push({
                kind: "section",
                key: section.key,
                label: section.label,
                count: section.count,
                collapsed: sectionCollapsed,
                height: sectionHeight,
            });
            if (sectionCollapsed) continue;

            for (const group of section.groups) {
                // Clé préfixée par la section : un même sous-groupe (« Titans »)
                // apparaît dans plusieurs emplacements, et chacun se replie
                // indépendamment.
                const groupKey = `${section.key}/${group.key}`;
                const groupCollapsed = section.grouped && collapsed.has(groupKey);

                if (section.grouped) {
                    out.push({
                        kind: "group",
                        key: groupKey,
                        label: group.label,
                        icon: group.icon,
                        iconKind: group.iconKind,
                        count: group.items.length,
                        collapsed: groupCollapsed,
                        height: groupHeight,
                    });
                }
                if (groupCollapsed) continue;

                for (let start = 0; start < group.items.length; start += columns) {
                    out.push({
                        kind: "items",
                        key: `${groupKey}#${start}`,
                        items: group.items.slice(start, start + columns),
                        height: rowHeight,
                    });
                }
            }
        }

        return out;
    }, [sections, collapsed, columns, rowHeight, sectionHeight, groupHeight]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: (index) => rows[index].height,
        // Une clé stable plutôt que l'indice : replier un groupe décale toutes
        // les lignes qui suivent, et le cache des tailles suivrait sinon le
        // mauvais contenu.
        getItemKey: (index) => rows[index].key,
        // Quelques lignes de marge pour que le défilement reste fluide
        overscan: 3,
    });

    // Les hauteurs ne sont jamais mesurées dans le DOM, seulement estimées :
    // il faut donc vider le cache dès que la composition des lignes change.
    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer, rows]);

    return (
        // --fill : occupe la hauteur restante, pour être le seul élément à défiler
        <section className="item-grid item-grid--fill">
            <h2 className="item-grid__title">
                {title} ({total})
            </h2>

            <div ref={viewportRef} className="item-grid__viewport">
                <div
                    className="item-grid__canvas"
                    style={{height: virtualizer.getTotalSize()}}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        if (!row) return null;

                        const style: CSSProperties = {
                            height: row.height,
                            transform: `translateY(${virtualRow.start}px)`,
                        };

                        if (row.kind === "items") {
                            return (
                                <div key={virtualRow.key} className="item-grid__row" style={style}>
                                    {row.items.map((item, i) => {
                                        const detail = item.itemInstanceId
                                            ? details[item.itemInstanceId]
                                            : undefined;
                                        return (
                                            <ItemIcon
                                                key={item.itemInstanceId ?? `${item.itemHash}-${i}`}
                                                itemHash={item.itemHash}
                                                itemInstanceId={item.itemInstanceId}
                                                state={item.state}
                                                versionNumber={item.versionNumber}
                                                gearTier={detail?.instance?.gearTier}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        }

                        return (
                            <GroupHeader
                                key={virtualRow.key}
                                row={row}
                                style={style}
                                onToggle={toggle}
                                expandLabel={t("expand")}
                                collapseLabel={t("collapse")}
                            />
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

/**
 * En-tête d'emplacement ou de sous-groupe : bouton pleine largeur, pour que la
 * cible de repli couvre toute la ligne.
 */
function GroupHeader({
                         row,
                         style,
                         onToggle,
                         expandLabel,
                         collapseLabel,
                     }: {
    row: Extract<GridRow, { kind: "section" | "group" }>;
    style: CSSProperties;
    onToggle: (key: string) => void;
    expandLabel: string;
    collapseLabel: string;
}) {
    return (
        <button
            type="button"
            className={`item-group item-group--${row.kind}`}
            style={style}
            onClick={() => onToggle(row.key)}
            aria-expanded={!row.collapsed}
            title={row.collapsed ? expandLabel : collapseLabel}
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

            {row.kind === "group" && <GroupIcon icon={row.icon} kind={row.iconKind}/>}

            <span className="item-group__label">{row.label}</span>
            <span className="item-group__count">{row.count}</span>
        </button>
    );
}

/**
 * Icône d'un sous-groupe.
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
