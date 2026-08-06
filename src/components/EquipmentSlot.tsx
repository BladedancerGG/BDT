"use client";

import {
    useDefinition,
    type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { SlotSide } from "@/lib/destiny/buckets";
import { ItemIcon } from "./ItemIcon";

interface BucketDefinition {
    displayProperties: DisplayProperties;
    /** Capacité de l'emplacement, objet équipé inclus */
    itemCount?: number;
}

/** Repli si le manifeste n'a pas encore répondu (10 = armes et armures). */
const DEFAULT_CAPACITY = 10;

/** Vignette d'un objet, avec les données d'instance associées. */
function SlotItem({
                      item,
                      details,
                  }: {
    item: DestinyItemComponent;
    details: Record<string, ItemDetail>;
}) {
    const detail = item.itemInstanceId ? details[item.itemInstanceId] : undefined;
    return (
        <ItemIcon
            itemHash={item.itemHash}
            itemInstanceId={item.itemInstanceId}
            state={item.state}
            versionNumber={item.versionNumber}
            gearTier={detail?.instance?.gearTier}
        />
    );
}

/**
 * Un emplacement d'équipement : l'objet équipé, et l'inventaire du même
 * emplacement affiché à côté.
 *
 * L'inventaire est **toujours visible**, en réduit, et s'agrandit au survol
 * (125 ms). L'agrandissement passe par un `transform` : il ne modifie donc pas
 * la mise en page, la grille agrandie recouvre simplement ses voisines au lieu
 * de les déplacer.
 *
 * La grille comporte autant de cases que la capacité de l'emplacement moins
 * l'objet équipé (9 pour les armes et armures, 6 pour les artéfacts) ; les
 * cases inoccupées sont marquées comme vides.
 */
export function EquipmentSlot({
                                  bucketHash,
                                  equipped,
                                  inventory,
                                  details,
                                  side,
                              }: {
    bucketHash: number;
    equipped?: DestinyItemComponent;
    inventory: DestinyItemComponent[];
    details: Record<string, ItemDetail>;
    side: SlotSide;
}) {
    // Libellé et capacité de l'emplacement, fournis par le manifeste
    const bucket = useDefinition<BucketDefinition>(
        "DestinyInventoryBucketDefinition",
        bucketHash,
    );
    const label = bucket?.displayProperties?.name ?? "";

    // Capacité hors objet équipé
    const capacity = Math.max(
        inventory.length,
        (bucket?.itemCount ?? DEFAULT_CAPACITY) - 1,
    );

    return (
        <div className={`equipment-slot equipment-slot--${side}`}>
        {/*<span className="equipment-slot__label">{label}</span>*/}

            <div className="slot-inventory">
                <div className="slot-inventory__grid" aria-label={label}>
                    {Array.from({ length: capacity }).map((_, index) => {
                        const item = inventory[index];
                        if (!item) {
                            return (
                                <span
                                    key={`empty-${index}`}
                                    className="slot-cell slot-cell--empty"
                                    aria-hidden
                                />
                            );
                        }
                        return (
                            <SlotItem
                                key={item.itemInstanceId ?? `${item.itemHash}-${index}`}
                                item={item}
                                details={details}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="equipment-slot__equipped">
                {equipped ? (
                    <SlotItem item={equipped} details={details} />
                ) : (
                    <span className="slot-cell slot-cell--empty" aria-hidden />
                )}
            </div>
        </div>
    );
}
