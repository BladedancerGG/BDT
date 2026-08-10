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
import {GroupHeader} from "./GroupHeader";

/**
 * Une ligne de la grille virtualisée. Les en-têtes en font partie au même titre
 * que les objets : c'est la seule façon de les faire défiler avec le contenu
 * sans sortir de la virtualisation — et donc sans monter les milliers de
 * vignettes qu'elle sert précisément à éviter.
 */
type GridRow =
    | {
    kind: "root";
    key: string;
    label: string;
    icon?: string;
    iconKind?: GroupIconKind;
    count: number;
    collapsed: boolean;
    height: number;
}
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
 * Section posée avant le coffre, dans le même défilement — en pratique les
 * objets perdus. Ses objets ne sont ni triés ni regroupés : ils sont peu
 * nombreux, et leur ordre est celui du Courrier.
 */
export interface LeadSection {
    key: string;
    label: string;
    icon?: string;
    iconKind?: GroupIconKind;
    items: DestinyItemComponent[];
}

// Référence stable : `useSearchFiltered` mémorise sur l'identité de sa liste
const NO_ITEMS: DestinyItemComponent[] = [];

/** Clé de repli de la section du coffre. Aucun emplacement ne peut la heurter. */
const VAULT_KEY = "root:vault";

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
 * Le tout est coiffé d'un niveau supérieur — objets perdus, puis coffre — qui
 * fait partie de la virtualisation lui aussi : le titre du coffre défile avec
 * son contenu, seule façon de faire cohabiter les deux dans un même ascenseur.
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
                                    lead,
                                }: {
    title: string;
    items: DestinyItemComponent[];
    details: Record<string, ItemDetail>;
    lead?: LeadSection;
}) {
    const t = useTranslations("inventory");
    // La recherche s'applique avant le regroupement : les compteurs des
    // sections comptent alors ce qui est réellement affiché.
    const found = useSearchFiltered(items);
    const leadFound = useSearchFiltered(lead?.items ?? NO_ITEMS);
    // Filtrés, triés selon les critères réglés dans les paramètres, puis groupés
    const sections = useGroupedItems(found, details);
    const viewportRef = useRef<HTMLDivElement>(null);
    // La taille réglée dans les paramètres change la grille sans changer sa
    // largeur : on la passe pour forcer une re-mesure. C'est le réglage dédié au
    // coffre, celui dont --item-size hérite ici (voir inventory-view.scss).
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const {columns, rowHeight, rootHeight, sectionHeight, groupHeight} = useGridMetrics(
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

        // Découpe une liste en lignes de `columns` objets
        const pushItems = (prefix: string, list: DestinyItemComponent[]) => {
            for (let start = 0; start < list.length; start += columns) {
                out.push({
                    kind: "items",
                    key: `${prefix}#${start}`,
                    items: list.slice(start, start + columns),
                    height: rowHeight,
                });
            }
        };

        // Les objets perdus, avant le coffre et au même rang que lui. Absents
        // quand la recherche n'en retient aucun : une section vide n'apprend rien.
        if (lead && leadFound.length > 0) {
            const leadCollapsed = collapsed.has(lead.key);
            out.push({
                kind: "root",
                key: lead.key,
                label: lead.label,
                icon: lead.icon,
                iconKind: lead.iconKind,
                count: leadFound.length,
                collapsed: leadCollapsed,
                height: rootHeight,
            });
            if (!leadCollapsed) pushItems(lead.key, leadFound);
        }

        const vaultCollapsed = collapsed.has(VAULT_KEY);
        out.push({
            kind: "root",
            key: VAULT_KEY,
            label: title,
            icon: "/icons/vault.svg",
            iconKind: "mask",
            count: total,
            collapsed: vaultCollapsed,
            height: rootHeight,
        });
        if (vaultCollapsed) return out;

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

                pushItems(groupKey, group.items);
            }
        }

        return out;
    }, [
        sections,
        lead,
        leadFound,
        title,
        total,
        collapsed,
        columns,
        rowHeight,
        rootHeight,
        sectionHeight,
        groupHeight,
    ]);

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
        <section className="item-grid">
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
                                kind={row.kind}
                                label={row.label}
                                count={row.count}
                                icon={row.kind === "section" ? undefined : row.icon}
                                iconKind={row.kind === "section" ? undefined : row.iconKind}
                                collapsed={row.collapsed}
                                onToggle={() => toggle(row.key)}
                                expandLabel={t("expand")}
                                collapseLabel={t("collapse")}
                                style={style}
                                virtual
                            />
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
