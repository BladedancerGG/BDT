"use client";

import {useEffect, useMemo, useState} from "react";
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
import {useCharacterNames} from "@/lib/destiny/use-character-names";
import {useSettings} from "@/lib/settings/store";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {useLoadoutItems} from "@/lib/destiny/use-loadout-items";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {SearchProvider} from "@/lib/search/provider";
import {SearchActionsBridge} from "./search/SearchActionsBridge";
import {useActionRunner} from "@/lib/actions/use-action-runner";
import {CharacterPicker} from "./CharacterPicker";
import {CharacterColumns, CharacterColumn} from "./CharacterColumns";
import {HeaderActions} from "./HeaderActions";
import {SearchBar} from "./search/SearchBar";
import {SearchToggle} from "./search/SearchToggle";
import {InventoryRail} from "./InventoryRail";
import {useRailLayout} from "@/lib/ui/use-media-query";
import {MainMenuButton} from "./nav/MainMenuButton";
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
import {VirtualItemGrid, type LeadGroup, type LeadSection} from "./VirtualItemGrid";
import {ActionsPanel} from "./actions/ActionsPanel";
import {DropZones} from "./dnd/DropZones";
import {DragScopeProvider, MoveDnd, type DragScope} from "./dnd/MoveDnd";
import {LoadingIcon} from "@/components/icons";
import {ArrowLeftIcon} from "@heroicons/react/24/solid";

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
function usePostmasterSection(
    items: DestinyItemComponent[],
    /** Découpage par personnage — voir `LeadSection.groups` */
    groups?: LeadGroup[],
): LeadSection {
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
            groups,
        }),
        [label, items, groups],
    );
}

/** En-tête, personnages, emplacements d'équipement, puis coffre. */
function Inventory({
                       data,
                       bungieMembershipId,
                       displayName,
                   }: {
    data: ProfileData;
    bungieMembershipId?: string;
    displayName?: string;
}) {
    const t = useTranslations("inventory");
    const tCommon = useTranslations("common");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const current = selectedId ?? data.characters[0]?.characterId ?? null;

    // Le rail remplace les deux colonnes de la vue sur téléphone : une page
    // par personnage, le coffre en dernière. C'est une question de largeur de
    // fenêtre, que seul le client connaît — la vue n'est de toute façon montée
    // qu'après le manifeste, donc jamais rendue par le serveur.
    const rail = useRailLayout();

    // Barre de recherche dépliée ? La question ne se pose que sur téléphone,
    // où elle est repliée derrière une loupe faute de place ; au-delà du seuil
    // elle est toujours affichée et cet état ne commande plus rien.
    const [searchOpen, setSearchOpen] = useState(false);

    // Page du rail sous les yeux : les zones de dépôt ne peuvent viser que
    // celle-là, le rail ne défilant pas pendant un geste.
    const [railPage, setRailPage] = useState(0);

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
    const setViewMode = useSettings((s) => s.setViewMode);
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

    /**
     * Disposition : le seul personnage affiché, ou les trois côte à côte.
     *
     * Le rangement partagé s'y soustrait — il n'appartient à personne, et la vue
     * y montre déjà deux colonnes sans aucun emplacement de personnage.
     */
    const layout = useSettings((s) => s.inventoryLayout);

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
    const ownLeftovers = useMemo(
        () => shownInventory.filter((i) => i.bucketHash === BUCKET.Postmaster),
        [shownInventory],
    );

    // Les objets perdus des TROIS personnages, pour la disposition en colonnes :
    // elle les montre tous, découpés par personnage. Toujours calculés — une
    // liste de quelques dizaines d'objets, et un hook ne se monte pas
    // conditionnellement.
    const allLeftovers = useMemo(
        () =>
            data.characters.flatMap((c) =>
                (data.inventory[c.characterId] ?? NO_ITEMS).filter(
                    (i) => i.bucketHash === BUCKET.Postmaster,
                ),
            ),
        [data.characters, data.inventory],
    );
    const shownLeftovers = useDisplayableItems(allLeftovers, category);

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

    /**
     * Les trois colonnes sont-elles montées ?
     *
     * Le rangement partagé s'en exclut : il n'appartient à aucun personnage, et
     * la vue y montre déjà deux grilles sans le moindre emplacement.
     */
    // Le rail impose les colonnes : ses pages SONT les personnages, quel que
    // soit le réglage de disposition — lequel ne décrit qu'un arrangement
    // côte à côte, sans objet quand on n'en voit qu'une à la fois.
    const columnsLayout = rail ? !shared : layout === "characters" && !shared;

    // Les objets perdus montrés : ceux du personnage affiché, ou ceux des trois
    // quand les colonnes sont montées — chacun sous son en-tête.
    const names = useCharacterNames(data.characters);
    const postmasterGroups = useMemo(() => {
        if (!columnsLayout) return undefined;
        // Les sous-groupes se taillent dans les listes d'origine, pas dans la
        // liste filtrée : celle-ci ne dit plus de qui vient chaque objet.
        const kept = new Set(shownLeftovers);
        return data.characters.map((c): LeadGroup => ({
            key: c.characterId,
            label: names.get(c.characterId) ?? "",
            icon: {kind: "class", classType: c.classType},
            items: (data.inventory[c.characterId] ?? NO_ITEMS).filter(
                (i) => i.bucketHash === BUCKET.Postmaster && kept.has(i),
            ),
        }));
    }, [columnsLayout, data.characters, data.inventory, names, shownLeftovers]);
    const postmaster = usePostmasterSection(
        columnsLayout ? shownLeftovers : ownLeftovers,
        postmasterGroups,
    );

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

    // —— La chaîne de hauteurs du rail ————————————————————————
    //
    // Le rail demande la même mise en page « application » que le grand écran :
    // la page ne défile pas, ce sont ses pages qui défilent. La règle vit sur
    // <html> parce qu'elle commande `.app-main`, bien au-dessus d'ici, et elle
    // ne vaut que tant qu'on REGARDE l'inventaire : les autres vues, elles,
    // défilent de haut en bas comme n'importe quelle page.
    useEffect(() => {
        const root = document.documentElement;
        if (!rail || viewMode !== "inventory") {
            delete root.dataset.rail;
            return;
        }
        root.dataset.rail = "";
        return () => {
            delete root.dataset.rail;
        };
    }, [rail, viewMode]);

    // Les deux grilles virtualisées, montées une seule fois : le rail et la
    // disposition historique montrent les mêmes, à des places différentes.
    const pouchGrid = (
        <div className="inventory__storage">
            <VirtualItemGrid
                title={tCommon("inventory")}
                items={pouchItems}
                details={data.items}
                fixedColumns={rail ? 5 : undefined}
                lead={postmaster}
                category={category}
            />
        </div>
    );
    const vaultGrid = (
        <div className="inventory__storage">
            <VirtualItemGrid
                title={t("vault")}
                items={vaultItems}
                details={data.items}
                // Cinq par ligne sur téléphone, la taille s'y ajustant : c'est
                // la grille qui mesure sa largeur, la fenêtre ne disant rien de
                // la barre de défilement.
                fixedColumns={rail ? 5 : undefined}
                // Le Courrier est passé à gauche quand la vue est coupée : il
                // tient au personnage, pas au coffre.
                lead={shared ? undefined : postmaster}
                category={category}
            />
        </div>
    );

    return (
        <EquippedSetsProvider counts={equippedSetCounts}>
            {/* La recherche englobe toute la vue : les vignettes de
                l'équipement s'estompent elles aussi. */}
            <SearchProvider data={data} currentCharacterId={current}>
            <MoveDnd selectedCharacterId={current}>
            <ActionRunner/>
            <SearchActionsBridge data={data}/>
            {/* Un SEUL en-tête : menu, recherche et boutons de compte sur la
                première rangée, personnages et modes d'affichage sur la
                seconde. Les deux barres se sont longtemps succédé dans deux
                éléments distincts, pour rien — elles ne commandent qu'une même
                chose, ce que la page montre. */}
            <header
                className={`header${searchOpen ? " header--search-open" : ""}`}
            >
                <MainMenuButton/>
                <CharacterPicker
                    characters={data.characters}
                    selectedId={current}
                    onSelect={setSelectedId}
                />
                {/* La loupe précède la barre qu'elle commande : c'est l'ordre
                    de lecture, et la grille de l'en-tête la place ailleurs
                    sans toucher au document. */}
                <SearchToggle
                    open={searchOpen}
                    onToggle={() => setSearchOpen((o) => !o)}
                />
                <SearchBar expanded={searchOpen}/>
                {/* La sélection prend la place des onglets : elle est un mode,
                    exclusif des autres, et ses deux boutons en sont la seule
                    sortie — de quoi ne pas laisser une sélection à moitié faite
                    derrière un changement d'onglet. */}
                {selecting ? (
                    <GroupSelectionBar data={data} slotCount={loadouts.length}/>
                ) : (
                    <ViewModeTabs/>
                )}
                <HeaderActions
                    bungieMembershipId={bungieMembershipId}
                    displayName={displayName}
                />


            </header>

            {/* Les TROIS vues sont montées en permanence, superposées dans la
                même case de grille : la bascule est alors un simple fondu, et
                rien n'est à reconstruire — ni le coffre virtualisé, ni les
                définitions déjà lues. `inert` retire la vue cachée du clavier
                et du pointeur, ce qu'une simple opacité ne fait pas.

                Chaque vue EST la case de la pile : aucune enveloppe autour
                d'elle, `.view` porte l'empilement et le fondu, sa classe de
                base tout le reste. */}
            <div className="views">
                <section
                    className={`view inventory${
                        viewMode === "inventory" ? "" : " view--hidden"
                    }`}
                    inert={viewMode !== "inventory"}
                >
                    {/* Onglets de famille d'objets : ils commandent à la
                        fois les colonnes du personnage et le coffre. */}
                    <ItemCategoryTabs/>

                    <div
                        className={`inventory__body${
                            shared ? " inventory__body--shared" : ""
                        }${
                            // Le modificateur « colonnes » décrit trois colonnes
                            // côte à côte : le rail n'en montre qu'une à la
                            // fois, et ses zones de dépôt ont leur propre
                            // géométrie. Les deux classes ensemble, c'étaient
                            // les règles des colonnes qui l'emportaient.
                            columnsLayout && !rail
                                ? " inventory__body--columns"
                                : ""
                        }${rail ? " inventory__body--rail" : ""}`}
                    >
                        {/* —— Le rail du téléphone ————————————————
                            Une page par personnage, le coffre en dernière, et
                            rien d'autre : ni les deux colonnes d'emplacements,
                            qui ne tiennent pas dans cette largeur, ni les zones
                            de dépôt, qui s'accrochent aux colonnes d'une grille
                            que le rail n'a plus. Le déplacement au doigt passe
                            par les actions de l'infobulle. */}
                        {rail ? (
                            <InventoryRail onPageChange={setRailPage}>
                                {shared ? (
                                    pouchGrid
                                ) : (
                                    data.characters.map((c) => (
                                        <CharacterColumn
                                            key={c.characterId}
                                            character={c}
                                            data={data}
                                            category={category}
                                            selected={c.characterId === current}
                                            onSelect={setSelectedId}
                                        />
                                    ))
                                )}
                                {vaultGrid}
                            </InventoryRail>
                        ) : (
                            <>
                                {/* Colonne de gauche du rangement partagé : ce que
                                    le personnage porte sur lui, modificateurs et
                                    objets à usage unique séparés par leurs
                                    sections. */}
                                {shared && pouchGrid}

                                {/* Disposition « trois personnages » : une colonne
                                    chacun, dans l'ordre du profil. */}
                                {columnsLayout && (
                                    <CharacterColumns
                                        characters={data.characters}
                                        data={data}
                                        category={category}
                                        selectedId={current}
                                        onSelect={setSelectedId}
                                    />
                                )}

                                {/* Emplacements du personnage : deux colonnes.
                                    Absentes du rangement partagé, qui n'appartient à
                                    personne — le coffre prend alors toute la place. */}
                                {!shared && !columnsLayout && (
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
                                {vaultGrid}

                            </>
                        )}

                        {/* Zones de dépôt : trois calques, enfants DIRECTS de
                            __body. Hors rail, ils s'accrochent à ses colonnes
                            pour épouser exactement l'équipement et le stockage
                            — les imbriquer romprait ce lien. Sur le rail, ils
                            recouvrent la page regardée : « Équiper » contre la
                            colonne des objets équipés, « Transférer dans
                            l'inventaire » sur sa grille, le coffre en bandeau
                            bas. Leur découpage suit l'onglet : voir DropZones. */}
                        <DropZones
                            characters={data.characters}
                            selectedCharacterId={current}
                            category={category}
                            columns={columnsLayout}
                            rail={rail}
                            railCharacterId={
                                data.characters[railPage]?.characterId ?? null
                            }
                        />
                    </div>
                </section>

                {/* Aucune destination dans ce mode : le geste y est interdit,
                    sans toucher à celui du mode inventaire monté à côté. Le
                    préfixe, lui, empêche les deux modes de se disputer les
                    identifiants dnd-kit des objets équipés. */}
                <DragScopeProvider value={EQUIPMENT_DRAG_SCOPE}>
                    <section
                        className={`view loadout-edit${
                            equipmentMode ? "" : " view--hidden"
                        }`}
                        inert={!equipmentMode}
                    >
                        {/* La seule sortie de ce mode : il n'a plus
                            d'onglet, on y descend depuis la carte des
                            équipements actuels de la vue « groupes ». */}
                        <div className="loadout-edit__toolbar">
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => setViewMode("groups")}
                            >
                                <ArrowLeftIcon/>
                                {t("backToGroups")}
                            </button>
                        </div>

                        <div className="loadout-edit__body">
                            {/* Une ligne par emplacement, ses attributs à côté */}
                            <div className="loadout-edit__contents">
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
                            <div className="loadout-edit__panel">
                                <LoadoutPanel
                                    loadouts={loadouts}
                                    characterId={current}
                                    selected={selectedLoadout}
                                    onSelect={selectLoadout}
                                />
                            </div>
                        </div>
                    </section>
                </DragScopeProvider>

                {/* Les groupes d'équipements du personnage. Aucun objet ne s'y
                    déplace : la vue montre des instantanés, et elle a sa propre
                    portée dnd-kit — voir GROUPS_DRAG_SCOPE.

                    Elle bascule d'elle-même entre la liste et l'éditeur d'un
                    groupe : c'est elle qui pose sa classe de base, donc elle
                    qui reçoit l'état caché de la pile. */}
                <DragScopeProvider value={GROUPS_DRAG_SCOPE}>
                    <GroupsModeView
                        characterId={current}
                        classType={character?.classType}
                        loadouts={loadouts}
                        data={data}
                        defs={defs}
                        hidden={!groupsMode}
                        onSelectCharacter={setSelectedId}
                    />
                </DragScopeProvider>
            </div>

            <ActionsPanel/>
            </MoveDnd>
            </SearchProvider>
        </EquippedSetsProvider>
    );
}

// Vue principale : charge le profil puis précharge les définitions associées.
export function InventoryView({
                                  bungieMembershipId,
                                  displayName,
                              }: {
    bungieMembershipId?: string;
    displayName?: string;
}) {
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
        return (
            <div className="profile-loader">
                <p className="profile-loader__message">{t("loading")}</p>

                <LoadingIcon />
            </div>
        );
    }
    if (isError || !data) {
        return (
            <div className="profile-loader profile-loader--error">
                <p className="profile-loader__message">{t("error")}</p>
            </div>
        );
    }

    return (
        <ItemDefsProvider
            items={allItems}
            details={data.items}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <Inventory
                data={data}
                bungieMembershipId={bungieMembershipId}
                displayName={displayName}
            />
        </ItemDefsProvider>
    );
}
