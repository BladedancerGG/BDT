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
    CUSTOMIZATION_LEFT,
    CUSTOMIZATION_RIGHT,
    WEAPON_COLUMN,
    groupByBucket,
    type SlotSide,
} from "@/lib/destiny/buckets";
import {
    useDefinition,
    type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type {ItemCategory} from "@/lib/settings/constants";
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
import {ItemCategoryTabs} from "./ItemCategoryTabs";
import {CharacterSummary} from "./equipment/CharacterSummary";
import {EquipmentModeView} from "./equipment/EquipmentModeView";
import {LoadoutPanel} from "./loadouts/LoadoutPanel";
import {LoadoutCreateButton} from "./loadouts/LoadoutCreateButton";
import {LoadoutTitle} from "./loadouts/LoadoutTitle";
import {GroupsModeView} from "./groups/GroupsModeView";
import {GroupSelectionBar} from "./groups/GroupSelectionBar";
import {useGroupSelection} from "@/lib/loadouts/groups/selection";
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

/**
 * Même chose pour le mode « groupes », et pour la même raison : l'éditeur d'un
 * groupe monte des vignettes des mêmes objets équipés, et `draggableNodes` de
 * dnd-kit est indexé par le **seul** identifiant — sans préfixe, les deux
 * vignettes se disputaient une unique entrée et l'origine du calque de
 * déplacement sautait de l'une à l'autre. Voir DragScope.
 *
 * Le geste y est de toute façon interdit : un instantané ne se déplace pas.
 */
const GROUPS_DRAG_SCOPE: DragScope = {disabled: true, idPrefix: "groups:"};

/**
 * Emplacements montrés de part et d'autre, par onglet.
 *
 * Le rangement partagé n'en a aucun : modificateurs et objets à usage unique
 * sont de portée compte, ils ne sont posés sur personne. La vue laisse alors
 * toute la largeur au coffre.
 */
const COLUMNS: Record<
    ItemCategory,
    {left: readonly number[]; right: readonly number[]}
> = {
    equipment: {left: WEAPON_COLUMN, right: ARMOR_COLUMN},
    customization: {left: CUSTOMIZATION_LEFT, right: CUSTOMIZATION_RIGHT},
    inventory: {left: [], right: []},
};
const NO_LOADOUTS: DestinyLoadout[] = [];

/** Une colonne d'emplacements d'équipement. */
function SlotColumn({
                        buckets,
                        side,
                        equipped,
                        inventory,
                        details,
                        pad = true,
                    }: {
    buckets: readonly number[];
    side: SlotSide;
    equipped: Map<number, DestinyItemComponent[]>;
    inventory: Map<number, DestinyItemComponent[]>;
    details: ProfileData["items"];
    /** Voir `EquipmentSlot.pad` */
    pad?: boolean;
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
                    pad={pad}
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
    const tCommon = useTranslations("common");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const current = selectedId ?? data.characters[0]?.characterId ?? null;

    /**
     * Une sélection d'équipement **impose** le mode inventaire : c'est là qu'on
     * choisit les objets, dans les grilles qui les montrent déjà.
     *
     * Le mode est surchargé, pas écrit : la préférence de l'utilisateur n'est
     * pas touchée — rien ne part dans le cookie — et la fin de la sélection le
     * ramène de lui-même à l'onglet qu'il avait, celui des groupes.
     */
    const selecting = useGroupSelection((s) => s.active);
    const preferredMode = useSettings((s) => s.viewMode);
    const viewMode = selecting ? "inventory" : preferredMode;

    const currentEquipped = current
        ? (data.equipment[current] ?? NO_ITEMS)
        : NO_ITEMS;
    const currentInventory = current
        ? (data.inventory[current] ?? NO_ITEMS)
        : NO_ITEMS;

    /**
     * Famille d'objets montrée par le mode inventaire : équipement,
     * personnalisation ou rangement partagé. Elle commande les deux côtés de la
     * vue — les colonnes du personnage comme le contenu du coffre.
     */
    const category = useSettings((s) => s.itemCategory);

    // Armes, armures, doctrines et artéfacts uniquement. Cette liste-ci ne suit
    // PAS l'onglet : elle sert aussi les modes « équipements » et « groupes »,
    // montés en même temps, où un emblème n'a rien à faire.
    const displayedEquipped = useDisplayableItems(currentEquipped);

    // Les deux listes de l'onglet courant. Pour « équipement » elles répètent
    // celle du dessus, au prix d'un filtrage déjà mémoïsé.
    const shownEquipped = useDisplayableItems(currentEquipped, category);
    const shownInventory = useDisplayableItems(currentInventory, category);

    // Regroupement par emplacement : l'API fournit `bucketHash` aussi bien sur
    // les objets équipés que sur ceux de l'inventaire du personnage.
    const equippedByBucket = useMemo(
        () => groupByBucket(shownEquipped),
        [shownEquipped],
    );
    const inventoryByBucket = useMemo(
        () => groupByBucket(shownInventory),
        [shownInventory],
    );

    // Les colonnes de l'onglet : rien pour le rangement partagé, qui
    // n'appartient à aucun personnage.
    const columns = COLUMNS[category];

    // Le Courrier. Reconnu à son emplacement plutôt que par différence avec les
    // colonnes : sous l'onglet du rangement partagé il n'y a aucune colonne, et
    // tout l'inventaire du personnage se serait retrouvé sous l'en-tête
    // « Objets perdus ».
    const leftovers = useMemo(
        () => shownInventory.filter((i) => i.bucketHash === BUCKET.Postmaster),
        [shownInventory],
    );
    const postmaster = usePostmasterSection(leftovers);

    /**
     * Sous l'onglet du rangement partagé, la vue se coupe en deux : ce qui est
     * **dans** l'inventaire partagé à gauche, ce qui dort au coffre à droite.
     *
     * Les deux arrivent dans le même composant (`profileInventory`) : c'est le
     * `bucketHash` de l'objet qui les sépare — son emplacement du moment, et
     * non son emplacement d'origine, qui vaut « Modificateurs » des deux côtés.
     * L'inventaire du personnage est versé à gauche par précaution : rien ne
     * garantit par quel composant Bungie livre ces objets. Le Courrier en est
     * retiré, il a déjà sa section.
     */
    const shared = category === "inventory";
    const pouchItems = useMemo(
        () =>
            shared
                ? [
                      ...data.vault,
                      ...currentInventory.filter(
                          (i) => i.bucketHash !== BUCKET.Postmaster,
                      ),
                  ].filter((i) => i.bucketHash !== BUCKET.Vault)
                : NO_ITEMS,
        [shared, data.vault, currentInventory],
    );
    const vaultItems = useMemo(
        () =>
            shared
                ? data.vault.filter((i) => i.bucketHash === BUCKET.Vault)
                : data.vault,
        [shared, data.vault],
    );

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

    /**
     * L'emplacement sélectionné est libre.
     *
     * La vue montre alors des cases **vides** — il n'y a rien d'enregistré à
     * montrer — et l'équipement porté ne se dévoile qu'au survol du bouton de
     * création, en aperçu de ce qu'on s'apprête à y mettre.
     */
    const emptySelected =
        selectedLoadoutData !== undefined && isEmptyLoadout(selectedLoadoutData);

    // Les objets restent ceux qui sont portés : c'est l'affichage qui les
    // estompe, pas la donnée qui disparaît.
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
    const groupsMode = viewMode === "groups";

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
                    {/* La sélection prend la place des onglets : elle est un
                        mode, exclusif des autres, et ses deux boutons en sont
                        la seule sortie — de quoi ne pas laisser une sélection à
                        moitié faite derrière un changement d'onglet. */}
                    {selecting ? (
                        <GroupSelectionBar data={data} slotCount={loadouts.length}/>
                    ) : (
                        <ViewModeTabs/>
                    )}
                </div>

                {/* Les TROIS modes sont montés en permanence, superposés dans la
                    même case de grille : la bascule est alors un simple fondu,
                    et rien n'est à reconstruire — ni le coffre virtualisé, ni les
                    définitions déjà lues. `inert` retire le mode caché du clavier
                    et du pointeur, ce qu'une simple opacité ne fait pas. */}
                <div className="inventory-view__modes">
                    <div
                        className={`inventory-view__mode${
                            viewMode === "inventory" ? "" : " inventory-view__mode--hidden"
                        }`}
                        inert={viewMode !== "inventory"}
                    >
                        {/* Onglets de famille d'objets : ils commandent à la
                            fois les colonnes du personnage et le coffre. */}
                        <ItemCategoryTabs/>

                        <div
                            className={`inventory-view__body${
                                shared ? " inventory-view__body--shared" : ""
                            }`}
                        >
                            {/* Colonne de gauche du rangement partagé : ce que
                                le personnage porte sur lui, modificateurs et
                                objets à usage unique séparés par leurs
                                sections. */}
                            {shared && (
                                <div className="inventory-view__storage">
                                    <VirtualItemGrid
                                        title={tCommon("inventory")}
                                        items={pouchItems}
                                        details={data.items}
                                        lead={postmaster}
                                        category={category}
                                    />
                                </div>
                            )}

                            {/* Emplacements du personnage : deux colonnes.
                                Absentes du rangement partagé, qui n'appartient à
                                personne — le coffre prend alors toute la place. */}
                            {!shared && (
                                <section
                                    className={`equipment${
                                        category === "customization"
                                            ? " equipment--customization"
                                            : ""
                                    }`}
                                >
                                    <div className="equipment__columns">
                                        <SlotColumn
                                            buckets={columns.left}
                                            side="left"
                                            equipped={equippedByBucket}
                                            inventory={inventoryByBucket}
                                            details={data.items}
                                            // Les emplacements de personnalisation ont
                                            // eux aussi une capacité de dix, mais on
                                            // n'y range rien : des rangées de cases
                                            // vides n'apprendraient rien.
                                            pad={category === "equipment"}
                                        />
                                        <SlotColumn
                                            buckets={columns.right}
                                            side="right"
                                            equipped={equippedByBucket}
                                            inventory={inventoryByBucket}
                                            details={data.items}
                                            pad={category === "equipment"}
                                        />
                                    </div>
                                    {/* Les statistiques décrivent l'armure portée :
                                        elles n'ont de sens que sous cet onglet. */}
                                    {category === "equipment" && (
                                        <CharacterSummary
                                            stats={character?.stats ?? {}}
                                            setCounts={equippedSetCounts}
                                        />
                                    )}
                                </section>
                            )}

                            {/* Colonne de droite : le Courrier et le coffre, dans un
                                seul défilement virtualisé. Le coffre est commun à tous
                                les personnages et contient environ un millier d'objets. */}
                            <div className="inventory-view__storage">
                                <VirtualItemGrid
                                    title={t("vault")}
                                    items={vaultItems}
                                    details={data.items}
                                    // Le Courrier est passé à gauche quand la
                                    // vue est coupée : il tient au personnage,
                                    // pas au coffre.
                                    lead={shared ? undefined : postmaster}
                                    category={category}
                                />
                            </div>

                            {/* Zones de dépôt : trois calques, enfants DIRECTS de
                                __body. Ils s'accrochent à ses colonnes pour épouser
                                exactement l'équipement et le stockage — les imbriquer
                                romprait ce lien. Leur découpage suit l'onglet :
                                voir DropZones. */}
                            <DropZones
                                characters={data.characters}
                                selectedCharacterId={current}
                                category={category}
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
                                        preview={emptySelected}
                                    />

                                    {/* Le seul geste d'un emplacement libre,
                                        posé là où le vide a laissé la place. */}
                                    {emptySelected && selectedLoadoutData && current && (
                                        <LoadoutCreateButton
                                            loadout={selectedLoadoutData}
                                            characterId={current}
                                            index={selectedLoadout ?? 0}
                                        />
                                    )}
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

                    {/* Les groupes d'équipements du personnage. Aucun objet ne
                        s'y déplace : le mode montre des instantanés, et il a sa
                        propre portée dnd-kit — voir GROUPS_DRAG_SCOPE. */}
                    <DragScopeProvider value={GROUPS_DRAG_SCOPE}>
                        <div
                            className={`inventory-view__mode${
                                groupsMode ? "" : " inventory-view__mode--hidden"
                            }`}
                            inert={!groupsMode}
                        >
                            <div className="inventory-view__body inventory-view__body--groups">
                                <GroupsModeView
                                    characterId={current}
                                    classType={character?.classType}
                                    loadouts={loadouts}
                                    data={data}
                                    defs={defs}
                                />
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
