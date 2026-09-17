"use client";

import {useMemo} from "react";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {Character, ProfileData} from "@/lib/bungie/use-profile";
import {
    CUSTOMIZATION_STACK,
    EQUIPMENT_STACK,
    groupByBucket,
} from "@/lib/destiny/buckets";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {useItemDefs} from "@/lib/destiny/item-defs";
import {countEquippedSets} from "@/lib/destiny/set-bonus";
import type {ItemCategory} from "@/lib/settings/constants";
import {CharacterSummary} from "./equipment/CharacterSummary";
import {CharacterTab} from "./CharacterTab";
import {EquipmentSlot} from "./EquipmentSlot";

// Référence stable : évite de relancer le filtrage à chaque rendu
const NO_ITEMS: DestinyItemComponent[] = [];

/**
 * Emplacements montrés par une colonne, dans l'ordre du jeu. Le rangement
 * partagé n'y figure pas : il n'appartient à aucun personnage, et cette
 * disposition n'est alors pas montée (voir `InventoryView`).
 */
const STACKS: Partial<Record<ItemCategory, readonly number[]>> = {
    equipment: EQUIPMENT_STACK,
    customization: CUSTOMIZATION_STACK,
};

/**
 * La colonne d'un personnage : son emblème en tête, puis ses emplacements
 * empilés — l'objet équipé à gauche, l'inventaire du même emplacement à droite.
 *
 * Un composant par personnage, et non une boucle dans le parent : le filtrage
 * par famille d'objets est un hook, et il lui faut sa propre mémoïsation par
 * personnage — sans quoi changer d'onglet referait le travail des trois.
 */
function CharacterColumn({
                             character,
                             data,
                             category,
                             selected,
                             onSelect,
                         }: {
    character: Character;
    data: ProfileData;
    category: ItemCategory;
    selected: boolean;
    onSelect: (characterId: string) => void;
}) {
    const equipped = data.equipment[character.characterId] ?? NO_ITEMS;
    const inventory = data.inventory[character.characterId] ?? NO_ITEMS;

    const shownEquipped = useDisplayableItems(equipped, category);
    const shownInventory = useDisplayableItems(inventory, category);

    // Ce que le personnage PORTE — armes, armures, doctrine, artéfact — quel que
    // soit l'onglet : les statistiques et les bonus d'ensemble décrivent le
    // personnage, pas ce que la vue montre de lui. Sous l'onglet
    // « personnalisation », `shownEquipped` ne contient que des emblèmes et des
    // vaisseaux, dont aucun bonus ne sort.
    const {defs} = useItemDefs();
    const worn = useDisplayableItems(equipped);
    const setCounts = useMemo(
        () => countEquippedSets(worn, defs),
        [worn, defs],
    );

    const equippedByBucket = useMemo(
        () => groupByBucket(shownEquipped),
        [shownEquipped],
    );
    const inventoryByBucket = useMemo(
        () => groupByBucket(shownInventory),
        [shownInventory],
    );

    const buckets = STACKS[category] ?? EQUIPMENT_STACK;

    return (
        <div
            className={`character-column${
                selected ? " character-column--selected" : ""
            }`}
        >
            {/* Le même bandeau que le sélecteur de l'en-tête : classe,
                puissance et résultats de recherche y sont déjà. Le cliquer
                désigne le personnage courant — celui que prendront les vues
                « équipements » et « groupes ». */}
            <CharacterTab
                character={character}
                selected={selected}
                onClick={() => onSelect(character.characterId)}
            />

            {/* Entre l'emblème et les emplacements : statistiques totales et
                bonus d'ensemble actifs. Les valeurs viennent du composant 200,
                déjà totalisées par Bungie — voir `CharacterSummary`. */}
            <CharacterSummary stats={character.stats} setCounts={setCounts}/>

            <div className="character-column__slots">
                {buckets.map((bucketHash) => (
                    <EquipmentSlot
                        key={bucketHash}
                        bucketHash={bucketHash}
                        equipped={equippedByBucket.get(bucketHash)?.[0]}
                        inventory={inventoryByBucket.get(bucketHash) ?? NO_ITEMS}
                        details={data.items}
                        // Toujours « right » : l'objet équipé se tient à gauche
                        // de la colonne et son inventaire se déplie vers la
                        // droite, dans la largeur que la colonne lui réserve
                        // (voir character-columns.scss).
                        side="right"
                        // Même raison que la disposition historique : les
                        // emplacements de personnalisation ont eux aussi une
                        // capacité de dix, mais on n'y range rien.
                        pad={category === "equipment"}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Les trois personnages côte à côte — la disposition « trois personnages » de
 * la vue d'inventaire.
 *
 * L'ordre est celui du profil, jamais celui de la sélection : les colonnes ne
 * doivent pas se réarranger quand on change de personnage courant, et les zones
 * de dépôt se calent sur ce même ordre pour tomber sous leur colonne (voir
 * `DropZones`).
 */
export function CharacterColumns({
                                     characters,
                                     data,
                                     category,
                                     selectedId,
                                     onSelect,
                                 }: {
    characters: readonly Character[];
    data: ProfileData;
    category: ItemCategory;
    selectedId: string | null;
    onSelect: (characterId: string) => void;
}) {
    return (
        <div className="character-columns">
            {characters.map((character) => (
                <CharacterColumn
                    key={character.characterId}
                    character={character}
                    data={data}
                    category={category}
                    selected={character.characterId === selectedId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}
