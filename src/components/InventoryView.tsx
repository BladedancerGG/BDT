"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {useProfile, type ProfileData} from "@/lib/bungie/use-profile";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
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
import {useLoadoutItems} from "@/lib/destiny/use-loadout-items";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {SearchProvider} from "@/lib/search/provider";
import {SearchActionsBridge} from "./search/SearchActionsBridge";
import {useActionRunner} from "@/lib/actions/use-action-runner";
import {CharacterTab} from "./CharacterTab";
import {EquipmentSlot} from "./EquipmentSlot";
import {ViewModeTabs} from "./ViewModeTabs";
import {CharacterSummary} from "./equipment/CharacterSummary";
import {EquipmentModeView} from "./equipment/EquipmentModeView";
import {LoadoutPanel} from "./loadouts/LoadoutPanel";
import {LoadoutTitle} from "./loadouts/LoadoutTitle";
import {VirtualItemGrid, type LeadSection} from "./VirtualItemGrid";
import {ActionsPanel} from "./actions/ActionsPanel";
import {DropZones} from "./dnd/DropZones";
import {DragScopeProvider, MoveDnd, type DragScope} from "./dnd/MoveDnd";

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

/**
 * Portée du glisser-déposer dans le mode « équipements » : interdit, et sous ses
 * propres identifiants dnd-kit — voir DragScope.
 */
const EQUIPMENT_DRAG_SCOPE: DragScope = {disabled: true, idPrefix: "equipment:"};
const NO_LOADOUTS: DestinyLoadout[] = [];

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
    const viewMode = useSettings((s) => s.viewMode);

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

    // —— Équipements sauvegardés ————————————————————————————————
    const loadouts = current ? (data.loadouts?.[current] ?? NO_LOADOUTS) : NO_LOADOUTS;

    // La sélection retient le personnage avec l'index : une place dans la liste
    // d'un personnage ne désigne rien sur un autre. Le porter dans l'état plutôt
    // que remettre la sélection à zéro dans un effet évite un rendu en cascade,
    // et le retour sur le personnage retrouve sa sélection.
    const [selection, setSelection] = useState<{
        characterId: string;
        index: number;
    } | null>(null);
    const selectedLoadout =
        selection && selection.characterId === current ? selection.index : null;
    const selectLoadout = (index: number | null) =>
        setSelection(index === null || !current ? null : {characterId: current, index});

    const {defs} = useItemDefs();
    const selectedLoadoutData =
        selectedLoadout !== null ? loadouts[selectedLoadout] : undefined;
    const loadoutContents = useLoadoutItems(selectedLoadoutData, data, defs);

    // Un emplacement libre laisse l'équipement porté à l'écran : c'est lui qu'on
    // s'apprête à y enregistrer.
    const shownItems = loadoutContents?.items ?? displayedEquipped;
    // Les attributs **enregistrés** dans l'équipement, quand il y en a un : ce
    // sont eux que la vue doit montrer, pas ceux que l'objet porte aujourd'hui.
    const shownSockets = loadoutContents?.sockets;

    // Pièces équipées par ensemble d'armures : sert à savoir quels bonus
    // d'ensemble sont actifs.
    //
    // Deux comptes, et non un : celui du contexte décrit ce que le personnage
    // **porte**, car il sert aussi les infobulles du coffre et du mode
    // inventaire, tous deux montés en même temps. Le mode équipements, lui, doit
    // décrire ce qu'il montre — sinon les bonus d'un équipement sauvegardé
    // seraient ceux d'une autre panoplie.
    const equippedSetCounts = useMemo(
        () => countEquippedSets(displayedEquipped, defs),
        [displayedEquipped, defs],
    );
    const shownSetCounts = useMemo(
        () =>
            loadoutContents
                ? countEquippedSets(loadoutContents.items, defs)
                : equippedSetCounts,
        [loadoutContents, defs, equippedSetCounts],
    );

    const character = data.characters.find((c) => c.characterId === current);
    const equipmentMode = viewMode === "loadouts";

    return (
        <EquippedSetsProvider counts={equippedSetCounts}>
            {/* La recherche englobe toute la vue : les vignettes de
                l'équipement s'estompent elles aussi. */}
            <SearchProvider data={data} currentCharacterId={current}>
            <MoveDnd selectedCharacterId={current}>
            <ActionRunner/>
            <SearchActionsBridge data={data}/>
            <div className="inventory-view">
                {/* Sélecteur de personnage, et bascule des modes d'affichage */}
                <div className="inventory-view__header">
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
                    <ViewModeTabs/>
                </div>

                {/* Les DEUX modes sont montés en permanence, superposés dans la
                    même case de grille : la bascule est alors un simple fondu,
                    et rien n'est à reconstruire — ni le coffre virtualisé, ni les
                    définitions déjà lues. `inert` retire le mode caché du clavier
                    et du pointeur, ce qu'une simple opacité ne fait pas. */}
                <div className="inventory-view__modes">
                    <div
                        className={`inventory-view__mode${
                            equipmentMode ? " inventory-view__mode--hidden" : ""
                        }`}
                        inert={equipmentMode}
                    >
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
                                <CharacterSummary
                                    stats={character?.stats ?? {}}
                                    setCounts={equippedSetCounts}
                                />
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

                    {/* Aucune destination dans ce mode : le geste y est interdit,
                        sans toucher à celui du mode inventaire monté à côté. Le
                        préfixe, lui, empêche les deux modes de se disputer les
                        identifiants dnd-kit des objets équipés. */}
                    <DragScopeProvider value={EQUIPMENT_DRAG_SCOPE}>
                        <div
                            className={`inventory-view__mode${
                                equipmentMode ? "" : " inventory-view__mode--hidden"
                            }`}
                            inert={!equipmentMode}
                        >
                            <div className="inventory-view__body inventory-view__body--equipment">
                                {/* Une ligne par emplacement, ses attributs à côté */}
                                <div className="inventory-view__equipment">
                                    <EquipmentModeView
                                        // Un emplacement sélectionné donne son
                                        // titre, libre ou non : c'est la seule
                                        // indication de celui qu'on s'apprête à
                                        // remplir.
                                        title={
                                            selectedLoadoutData ? (
                                                <LoadoutTitle
                                                    loadout={selectedLoadoutData}
                                                    index={selectedLoadout ?? 0}
                                                    characterId={current}
                                                    empty={isEmptyLoadout(selectedLoadoutData)}
                                                />
                                            ) : (
                                                t("currentEquipment")
                                            )
                                        }
                                        items={shownItems}
                                        details={data.items}
                                        defs={defs}
                                        setCounts={shownSetCounts}
                                        characterStats={
                                            loadoutContents ? undefined : character?.stats
                                        }
                                        sockets={shownSockets}
                                        editable={!loadoutContents}
                                    />
                                </div>

                                {/* Les emplacements du personnage, et leurs actions */}
                                <div className="inventory-view__loadouts">
                                    <LoadoutPanel
                                        loadouts={loadouts}
                                        characterId={current}
                                        selected={selectedLoadout}
                                        onSelect={selectLoadout}
                                    />
                                </div>
                            </div>
                        </div>
                    </DragScopeProvider>
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
