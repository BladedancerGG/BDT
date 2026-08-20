"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {useProfile, type ProfileData} from "@/lib/bungie/use-profile";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import {ItemDefsProvider, useItemDefs} from "@/lib/destiny/item-defs";
import {
    countEquippedSets,
    EquippedSetsProvider,
} from "@/lib/destiny/set-bonus";
import {
    ARMOR_COLUMN,
    BUCKET,
    EQUIPMENT_BUCKETS,
    WEAPON_COLUMN,
    groupByBucket,
    type SlotSide,
} from "@/lib/destiny/buckets";
import {
    useDefinition,
    type DisplayProperties,
} from "@/lib/manifest/use-definition";
import {useSettings} from "@/lib/settings/store";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {SearchProvider} from "@/lib/search/provider";
import {SearchActionsBridge} from "./search/SearchActionsBridge";
import {useActionRunner} from "@/lib/actions/use-action-runner";
import {CharacterTab} from "./CharacterTab";
import {EquipmentSlot} from "./EquipmentSlot";
import {VirtualItemGrid, type LeadSection} from "./VirtualItemGrid";
import {ActionsPanel} from "./actions/ActionsPanel";
import {DropZones} from "./dnd/DropZones";
import {MoveDnd} from "./dnd/MoveDnd";

/**
 * Vide l'unique file d'actions.
 *
 * Un composant plutôt qu'un appel dans `Inventory` : le hook doit être monté
 * **une seule fois**, et un composant sans rendu le dit plus clairement qu'une
 * ligne perdue au milieu d'un autre.
 */
function ActionRunner() {
    useActionRunner();
    return null;
}

// Référence stable : évite de relancer le filtrage à chaque rendu
const NO_ITEMS: DestinyItemComponent[] = [];

/** Une colonne d'emplacements d'équipement. */
function SlotColumn({
                        buckets,
                        side,
                        equipped,
                        inventory,
                        details,
                    }: {
    buckets: readonly number[];
    side: SlotSide;
    equipped: Map<number, DestinyItemComponent[]>;
    inventory: Map<number, DestinyItemComponent[]>;
    details: ProfileData["items"];
}) {
    return (
        <div className={`slot-column slot-column--${side}`}>
            {buckets.map((bucketHash) => (
                <EquipmentSlot
                    key={bucketHash}
                    bucketHash={bucketHash}
                    equipped={equipped.get(bucketHash)?.[0]}
                    inventory={inventory.get(bucketHash) ?? NO_ITEMS}
                    details={details}
                    side={side}
                />
            ))}
        </div>
    );
}

/**
 * Objets du Courrier, à passer au coffre virtualisé, qui les affiche en tête de
 * son défilement.
 *
 * Sans cette section ils disparaîtraient : ils vivent dans l'inventaire du
 * personnage, mais dans le bucket « Objets perdus ». Le libellé vient du
 * manifeste, donc traduit.
 */
function usePostmasterSection(items: DestinyItemComponent[]): LeadSection {
    const bucket = useDefinition<{ displayProperties: DisplayProperties }>(
        "DestinyInventoryBucketDefinition",
        BUCKET.Postmaster,
    );
    const label = bucket?.displayProperties?.name ?? "";

    return useMemo(
        () => ({
            key: "root:postmaster",
            label,
            icon: {kind: "postmaster"},
            items,
        }),
        [label, items],
    );
}

/** Personnages, emplacements d'équipement, puis coffre. */
function Inventory({data}: { data: ProfileData }) {
    const t = useTranslations("inventory");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const current = selectedId ?? data.characters[0]?.characterId ?? null;

    const currentEquipped = current
        ? (data.equipment[current] ?? NO_ITEMS)
        : NO_ITEMS;
    const currentInventory = current
        ? (data.inventory[current] ?? NO_ITEMS)
        : NO_ITEMS;

    // Armes, armures, doctrines et artéfacts uniquement
    const displayedEquipped = useDisplayableItems(currentEquipped);
    const displayedInventory = useDisplayableItems(currentInventory);

    // Regroupement par emplacement : l'API fournit `bucketHash` aussi bien sur
    // les objets équipés que sur ceux de l'inventaire du personnage.
    const equippedByBucket = useMemo(
        () => groupByBucket(displayedEquipped),
        [displayedEquipped],
    );
    const inventoryByBucket = useMemo(
        () => groupByBucket(displayedInventory),
        [displayedInventory],
    );

    // Tout ce qui n'entre dans aucun emplacement d'équipement — en pratique le
    // Courrier. Calculé par différence pour ne rien perdre si Bungie ajoute un
    // emplacement.
    const leftovers = useMemo(
        () => displayedInventory.filter((i) => !EQUIPMENT_BUCKETS.has(i.bucketHash)),
        [displayedInventory],
    );
    const postmaster = usePostmasterSection(leftovers);

    // Pièces équipées par ensemble d'armures : sert à savoir quels bonus
    // d'ensemble sont actifs. Dépend du personnage affiché, d'où le calcul ici.
    const {defs} = useItemDefs();
    const setCounts = useMemo(
        () => countEquippedSets(currentEquipped, defs),
        [currentEquipped, defs],
    );

    return (
        <EquippedSetsProvider counts={setCounts}>
            {/* La recherche englobe toute la vue : les vignettes de
                l'équipement s'estompent elles aussi. */}
            <SearchProvider data={data} currentCharacterId={current}>
            <MoveDnd selectedCharacterId={current}>
            <ActionRunner/>
            <SearchActionsBridge data={data}/>
            <div className="inventory-view">
                {/* Sélecteur de personnage */}
                <div className="inventory-view__characters">
                    {data.characters.map((c) => (
                        <CharacterTab
                            key={c.characterId}
                            character={c}
                            selected={c.characterId === current}
                            onSelect={() => setSelectedId(c.characterId)}
                        />
                    ))}
                </div>

                <div className="inventory-view__body">
                    {/* Équipement du personnage : deux colonnes d'emplacements */}
                    <section className="equipment">
                        {/*<h2 className="equipment__title">{t("equipment")}</h2>*/}
                        <div className="equipment__columns">
                            <SlotColumn
                                buckets={WEAPON_COLUMN}
                                side="left"
                                equipped={equippedByBucket}
                                inventory={inventoryByBucket}
                                details={data.items}
                            />
                            <SlotColumn
                                buckets={ARMOR_COLUMN}
                                side="right"
                                equipped={equippedByBucket}
                                inventory={inventoryByBucket}
                                details={data.items}
                            />
                        </div>
                    </section>

                    {/* Colonne de droite : le Courrier et le coffre, dans un
                        seul défilement virtualisé. Le coffre est commun à tous
                        les personnages et contient environ un millier d'objets. */}
                    <div className="inventory-view__storage">
                        <VirtualItemGrid
                            title={t("vault")}
                            items={data.vault}
                            details={data.items}
                            lead={postmaster}
                        />
                    </div>

                    {/* Zones de dépôt : trois calques, enfants DIRECTS de
                        __body. Ils s'accrochent à ses colonnes pour épouser
                        exactement l'équipement et le stockage — les imbriquer
                        romprait ce lien. */}
                    <DropZones
                        characters={data.characters}
                        selectedCharacterId={current}
                    />
                </div>
            </div>

            <ActionsPanel/>
            </MoveDnd>
            </SearchProvider>
        </EquippedSetsProvider>
    );
}

// Vue principale : charge le profil puis précharge les définitions associées.
export function InventoryView() {
    const t = useTranslations("inventory");
    const {data, isLoading, isError} = useProfile();

    const showOrnaments = useSettings((s) => s.showOrnaments);
    const showOriginalOnHover = useSettings((s) => s.showOriginalOnHover);

    // Tous les objets de l'arbre, pour une unique requête groupée de définitions
    const allItems = useMemo(() => {
        if (!data) return [];
        return [
            ...Object.values(data.equipment),
            ...Object.values(data.inventory),
            data.vault,
        ].flat();
    }, [data]);

    if (isLoading) {
        return <p className="inventory-view__message">{t("loading")}</p>;
    }
    if (isError || !data) {
        return (
            <p className="inventory-view__message inventory-view__message--error">
                {t("error")}
            </p>
        );
    }

    return (
        <ItemDefsProvider
            items={allItems}
            details={data.items}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <Inventory data={data}/>
        </ItemDefsProvider>
    );
}
