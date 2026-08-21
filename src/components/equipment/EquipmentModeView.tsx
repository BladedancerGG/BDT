"use client";

import {useMemo, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {ARMOR_COLUMN, WEAPON_COLUMN, type SlotSide} from "@/lib/destiny/buckets";
import {useEquippedPlugs} from "@/lib/destiny/use-equipped-plugs";
import type {EquippedSetCounts} from "@/lib/destiny/set-bonus";
import type {QueuedItem} from "@/lib/actions/store";
import {ItemIcon} from "../ItemIcon";
import {EquipmentPlugs} from "./EquipmentPlugs";

/**
 * Mode « équipements » : une ligne par emplacement, ses attributs alignés à
 * côté de la vignette.
 *
 * Les lignes apparient les deux colonnes du mode inventaire — doctrine et
 * casque, arme cinétique et gantelets, etc. — pour que les attributs se
 * déploient vers l'extérieur de chaque côté, comme dans la maquette. La grille
 * a donc quatre colonnes : attributs, vignette, vignette, attributs.
 *
 * Aucun panneau d'inventaire d'emplacement, aucune zone de dépôt : ce mode ne
 * déplace pas d'objets, il montre ce qui est équipé.
 */
export function EquipmentModeView({
                                      title,
                                      items,
                                      details,
                                      defs,
                                      setCounts,
                                      editable,
                                  }: {
    /** Titre de la vue : l'équipement porté, ou l'emplacement sélectionné */
    title: ReactNode;
    /** Les objets à montrer : les équipés, ou ceux d'un équipement sauvegardé */
    items: readonly DestinyItemComponent[];
    details: Record<string, ItemDetail>;
    defs: Map<number, InventoryItemDefinition>;
    setCounts: EquippedSetCounts;
    /**
     * Les attributs s'y changent. Faux pour un équipement sauvegardé : c'est un
     * instantané, rien n'y est équipé en ce moment.
     */
    editable: boolean;
}) {
    const t = useTranslations("inventory");
    const plugs = useEquippedPlugs(items, details, defs, setCounts);

    // Un emplacement ne porte qu'un objet équipé : un simple index suffit.
    const byBucket = useMemo(() => {
        const map = new Map<number, DestinyItemComponent>();
        for (const item of items) {
            if (!map.has(item.bucketHash)) map.set(item.bucketHash, item);
        }
        return map;
    }, [items]);

    // Les deux colonnes ont la même longueur (cinq emplacements chacune) ;
    // `Math.max` évite d'en perdre une ligne si Bungie en ajoutait un.
    const rowCount = Math.max(WEAPON_COLUMN.length, ARMOR_COLUMN.length);

    return (
        <section className="equipment-mode">
            <div className="equipment-mode__title">{title}</div>

            <div className="equipment-mode__rows">
                {Array.from({length: rowCount}).map((_, row) => (
                    <div key={row} className="equipment-mode__row">
                        <EquipmentSide
                            bucketHash={WEAPON_COLUMN[row]}
                            item={byBucket.get(WEAPON_COLUMN[row])}
                            details={details}
                            defs={defs}
                            plugs={plugs}
                            side="left"
                            editable={editable}
                        />
                        <EquipmentSide
                            bucketHash={ARMOR_COLUMN[row]}
                            item={byBucket.get(ARMOR_COLUMN[row])}
                            details={details}
                            defs={defs}
                            plugs={plugs}
                            side="right"
                            editable={editable}
                        />
                    </div>
                ))}
            </div>

            {items.length === 0 && (
                <p className="equipment-mode__message">{t("loading")}</p>
            )}
        </section>
    );
}

/** Une moitié de ligne : la vignette et ses attributs, du bon côté. */
function EquipmentSide({
                           bucketHash,
                           item,
                           details,
                           defs,
                           plugs,
                           side,
                           editable,
                       }: {
    bucketHash: number | undefined;
    item: DestinyItemComponent | undefined;
    details: Record<string, ItemDetail>;
    defs: Map<number, InventoryItemDefinition>;
    plugs: ReturnType<typeof useEquippedPlugs>;
    side: SlotSide;
    editable: boolean;
}) {
    if (bucketHash === undefined) return null;

    const detail = item?.itemInstanceId ? details[item.itemInstanceId] : undefined;
    const rows = plugs.get(bucketHash) ?? [];

    // L'objet tel qu'il part en file d'actions. Les habillages en font partie :
    // la carte du panneau est montée hors de la grille et ne peut pas les
    // retrouver seule.
    const queued: QueuedItem | undefined =
        editable && item?.itemInstanceId
            ? {
                itemHash: item.itemHash,
                itemInstanceId: item.itemInstanceId,
                state: item.state,
                versionNumber: item.versionNumber,
                gearTier: detail?.instance?.gearTier,
            }
            : undefined;

    const plugsNode = (
        <EquipmentPlugs
            rows={rows}
            side={side}
            item={queued}
            def={item ? defs.get(item.itemHash) : undefined}
            detail={detail}
        />
    );

    // La vignette reste au centre dans les deux cas : c'est l'ordre des deux
    // enfants que le côté inverse, pas leur alignement.
    const thumb = (
        <div className="equipment-mode__item">
            {item ? (
                <ItemIcon
                    itemHash={item.itemHash}
                    itemInstanceId={item.itemInstanceId}
                    state={item.state}
                    versionNumber={item.versionNumber}
                    gearTier={detail?.instance?.gearTier}
                    equipped
                />
            ) : (
                <span className="slot-cell slot-cell--empty" aria-hidden/>
            )}
        </div>
    );

    return (
        <div className={`equipment-mode__side equipment-mode__side--${side}`}>
            {side === "left" ? (
                <>
                    {plugsNode}
                    {thumb}
                </>
            ) : (
                <>
                    {thumb}
                    {plugsNode}
                </>
            )}
        </div>
    );
}
