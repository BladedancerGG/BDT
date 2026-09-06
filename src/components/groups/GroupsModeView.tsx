"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {useCharacterGroups, useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {useConfirmEquipGroup} from "@/lib/loadouts/groups/use-confirm-equip";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {useSettings} from "@/lib/settings/store";
import {SortableGroupCard, StaticGroupCard} from "./GroupCard";
import {GroupCreateButton} from "./GroupCreateButton";
import {GroupEditor} from "./GroupEditor";

/**
 * Mode « groupes » : une carte par groupe du personnage, précédée de celle des
 * équipements réellement enregistrés en jeu.
 *
 * Les groupes ne sont pas partagés entre les personnages — un instantané
 * désigne des objets par instance, et les armures d'une classe ne s'équipent pas
 * sur une autre. Changer d'onglet de personnage change donc de liste.
 *
 * Les identifiants des vignettes sont résolus **une fois pour toute la page**,
 * cartes et emplacements confondus. C'est l'optimisation majeure du projet
 * appliquée ici : une lecture Dexie par vignette ferait plusieurs centaines de
 * requêtes pour une poignée de cartes.
 *
 * « Modifier » remplace la grille par l'éditeur du groupe. Il la **remplace**
 * plutôt que de s'ouvrir par-dessus : l'éditeur reprend la disposition du mode
 * « équipements » et lui faut toute la largeur, et une modale de cette taille
 * n'aurait été qu'une page déguisée.
 */
export function GroupsModeView({
                                   characterId,
                                   classType,
                                   loadouts,
                                   data,
                                   defs,
                               }: {
    characterId: string | null;
    /** Classe du personnage : filtre les objets proposés dans l'éditeur */
    classType: number | undefined;
    /** Les emplacements du personnage, tels que renvoie le composant 206 */
    loadouts: readonly DestinyLoadout[];
    data: ProfileData;
    defs: Map<number, InventoryItemDefinition>;
}) {
    const t = useTranslations("groups");
    const groups = useCharacterGroups(characterId);
    const deleteGroup = useLoadoutGroups((s) => s.deleteGroup);
    const moveGroup = useLoadoutGroups((s) => s.moveGroup);
    const confirmEquip = useConfirmEquipGroup(characterId);
    const setViewMode = useSettings((s) => s.setViewMode);

    const [editingId, setEditingId] = useState<string | null>(null);

    // La grille des cartes suit le personnage et non le groupe : un emplacement
    // nouvellement débloqué apparaît alors vide sur les groupes existants,
    // plutôt que de les laisser amputés.
    const slotCount = loadouts.length;

    const allLoadouts = useMemo(
        () => [...loadouts, ...groups.flatMap((group) => group.loadouts)],
        [loadouts, groups],
    );
    const identifiers = useLoadoutIdentifiers(allLoadouts);

    const sensors = useSensors(
        // Le même seuil que les autres grilles réordonnables : sans lui, le clic
        // qui ouvre le calque d'actions d'une carte passerait pour un
        // déplacement.
        useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    // L'éditeur est monté sur un groupe qui existe encore : supprimé ailleurs —
    // ou changement de personnage — la vue revient d'elle-même à la grille.
    const editing = groups.find((group) => group.id === editingId);
    if (editingId && editing && characterId) {
        return (
            <section className="loadout-groups">
                <GroupEditor
                    group={editing}
                    data={data}
                    defs={defs}
                    loadouts={loadouts}
                    classType={classType}
                    slotCount={slotCount}
                    onClose={() => setEditingId(null)}
                />
            </section>
        );
    }

    return (
        <section className="loadout-groups">
            <div className="loadout-groups__toolbar">
                <GroupCreateButton characterId={characterId} loadouts={loadouts}/>

                {/* L'ordre des cartes est celui que l'utilisateur leur donne en
                    les glissant : il n'y a donc pas de critère à choisir, mais
                    le geste ne se devine pas — d'où ce rappel, à la place que la
                    maquette réservait au bouton de tri. */}
                {groups.length > 1 && (
                    <p className="loadout-groups__hint">
                        <span aria-hidden>↑↓</span>
                        {t("dragHint")}
                    </p>
                )}
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={({active, over}: DragEndEvent) => {
                    if (!over || active.id === over.id || !characterId) return;
                    const from = groups.findIndex((g) => g.id === active.id);
                    const to = groups.findIndex((g) => g.id === over.id);
                    if (from !== -1 && to !== -1) moveGroup(characterId, from, to);
                }}
            >
                <div className="loadout-groups__cards">
                    {/* La première carte montre toujours les emplacements du
                        jeu. Elle n'a pas d'actions et n'est pas déplaçable :
                        c'est l'état courant du personnage, pas un groupe. Un
                        clic mène là où on le manipule. */}
                    <StaticGroupCard
                        name={t("currentLoadouts")}
                        loadouts={loadouts}
                        slotCount={slotCount}
                        identifiers={identifiers}
                        onOpen={() => setViewMode("loadouts")}
                    />

                    <SortableContext
                        items={groups.map((group) => group.id)}
                        strategy={rectSortingStrategy}
                    >
                        {groups.map((group, index) => (
                            <SortableGroupCard
                                key={group.id}
                                id={group.id}
                                position={index + 1}
                                total={groups.length}
                                name={group.name}
                                color={group.color}
                                loadouts={group.loadouts}
                                slotCount={slotCount}
                                identifiers={identifiers}
                                onEquip={() => confirmEquip(group)}
                                onEdit={() => setEditingId(group.id)}
                                onDelete={() => {
                                    if (
                                        window.confirm(
                                            t("deleteConfirm", {name: group.name}),
                                        )
                                    ) {
                                        deleteGroup(group.id);
                                    }
                                }}
                            />
                        ))}
                    </SortableContext>
                </div>
            </DndContext>

            {slotCount === 0 && <p className="loadout-groups__empty">{t("noSlots")}</p>}
        </section>
    );
}
