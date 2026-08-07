"use client";

import {useRef} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import {useSortedItems} from "@/lib/destiny/use-sorted-items";
import {useGridMetrics} from "@/lib/destiny/use-grid-metrics";
import {useSettings} from "@/lib/settings/store";
import {ItemIcon} from "./ItemIcon";

/**
 * Grille d'objets virtualisée, pour les listes longues (le coffre en compte
 * environ un millier).
 *
 * Seules les lignes visibles sont montées : le DOM reste petit et les images
 * hors écran ne sont jamais demandées. Les objets étant de taille fixe, on
 * virtualise par **lignes** — le nombre de colonnes est déduit de la largeur
 * disponible (voir useGridMetrics).
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
    // Filtrés puis triés selon les critères réglés dans les paramètres
    const displayed = useSortedItems(items, details);
    const viewportRef = useRef<HTMLDivElement>(null);
    // La taille réglée dans les paramètres change la grille sans changer sa
    // largeur : on la passe pour forcer une re-mesure.
    const iconSize = useSettings((s) => s.iconSize);
    const {columns, rowHeight} = useGridMetrics(viewportRef, iconSize);

    const rowCount = Math.ceil(displayed.length / columns);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => rowHeight,
        // Quelques lignes de marge pour que le défilement reste fluide
        overscan: 3,
    });

    return (
        // --fill : occupe la hauteur restante, pour être le seul élément à défiler
    <section className="item-grid item-grid--fill">
            <h2 className="item-grid__title">
                {title} ({displayed.length})
            </h2>

            <div ref={viewportRef} className="item-grid__viewport">
                <div
                    className="item-grid__canvas"
                    style={{height: virtualizer.getTotalSize()}}
                >
                    {virtualizer.getVirtualItems().map((row) => {
                        const start = row.index * columns;
                        const rowItems = displayed.slice(start, start + columns);

                        return (
                            <div
                                key={row.key}
                                className="item-grid__row"
                                style={{
                                    height: rowHeight,
                                    transform: `translateY(${row.start}px)`,
                                }}
                            >
                                {rowItems.map((item, i) => {
                                    const detail = item.itemInstanceId
                                        ? details[item.itemInstanceId]
                                        : undefined;
                                    return (
                                        <ItemIcon
                                            key={item.itemInstanceId ?? `${item.itemHash}-${start + i}`}
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
                    })}
                </div>
            </div>
        </section>
    );
}
