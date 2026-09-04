"use client";

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
    useSortable,
} from "@dnd-kit/sortable";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import type {LoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";

/**
 * Une grille d'emplacements d'équipement, quatre par ligne comme en jeu.
 *
 * Deux usages dans l'éditeur d'un groupe, et un seul composant : celle du
 * groupe, dont on choisit l'emplacement courant et dont on réordonne les
 * vignettes au glisser-déposer, et celle du personnage, dont un clic recopie
 * l'emplacement dans le groupe. La différence tient aux deux rappels reçus.
 *
 * L'identité d'un emplacement est sa **place** — c'est ce que dnd-kit reçoit en
 * identifiant. Un emplacement de groupe n'a rien d'autre : deux emplacements
 * vides sont indiscernables, et c'est bien leur position qu'on déplace.
 */
export function GroupSlotGrid({
                                  title,
                                  loadouts,
                                  slotCount,
                                  identifiers,
                                  selected,
                                  onSelect,
                                  onMove,
                                  emptyHint,
                              }: {
    title: string;
    loadouts: readonly DestinyLoadout[];
    slotCount: number;
    identifiers: LoadoutIdentifiers;
    /** Emplacement mis en avant, ou `null` */
    selected?: number | null;
    onSelect?: (index: number) => void;
    /** Absent : la grille n'est pas réordonnable (celle du personnage) */
    onMove?: (from: number, to: number) => void;
    emptyHint?: string;
}) {
    const t = useTranslations("loadouts");

    const sensors = useSensors(
        // Un seuil de quelques pixels, comme la liste des critères de tri : sans
        // lui, un simple clic sur une vignette passerait pour un déplacement et
        // la sélection deviendrait impossible.
        useSensor(PointerSensor, {activationConstraint: {distance: 4}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    const places = Array.from({length: slotCount}, (_, index) => index);

    const grid = (
        <div className="group-slots__grid">
            {places.map((index) => (
                <GroupSlot
                    key={index}
                    index={index}
                    loadout={loadouts[index]}
                    identifiers={identifiers}
                    selected={selected === index}
                    onSelect={onSelect}
                    sortable={Boolean(onMove)}
                    label={t("slot", {number: index + 1})}
                />
            ))}
        </div>
    );

    return (
        <section className="group-slots">
            <h3 className="group-slots__title">{title}</h3>

            {onMove ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={({active, over}: DragEndEvent) => {
                        if (!over || active.id === over.id) return;
                        onMove(Number(active.id), Number(over.id));
                    }}
                >
                    <SortableContext items={places} strategy={rectSortingStrategy}>
                        {grid}
                    </SortableContext>
                </DndContext>
            ) : (
                grid
            )}

            {emptyHint && slotCount === 0 && (
                <p className="group-slots__empty">{emptyHint}</p>
            )}
        </section>
    );
}

/**
 * Une vignette de la grille.
 *
 * `useSortable` est appelé sans condition — c'est un hook — mais ses écouteurs
 * ne sont posés que sur une grille réordonnable. Hors `SortableContext` il rend
 * simplement une transformation nulle, ce qui est sans effet.
 */
function GroupSlot({
                       index,
                       loadout,
                       identifiers,
                       selected,
                       onSelect,
                       sortable,
                       label,
                   }: {
    index: number;
    loadout: DestinyLoadout | undefined;
    identifiers: LoadoutIdentifiers;
    selected: boolean;
    onSelect?: (index: number) => void;
    sortable: boolean;
    label: string;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: index, disabled: !sortable});

    const free = isEmptyLoadout(loadout);
    const name = loadout && identifiers.names.get(loadout.nameHash);

    return (
        <button
            ref={setNodeRef}
            type="button"
            style={{
                // La grille se déplace dans les deux axes, contrairement à la
                // liste des critères de tri : les deux composantes sont donc
                // reportées.
                transform: transform
                    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
                    : undefined,
                transition,
            }}
            className={[
                "loadout-slot",
                free ? "loadout-slot--empty" : null,
                selected ? "loadout-slot--selected" : null,
                isDragging ? "loadout-slot--dragging" : null,
            ]
                .filter(Boolean)
                .join(" ")}
            // Étalés d'abord : `attributes` de dnd-kit porte son propre
            // `aria-pressed` (l'état de saisie), qui n'est pas celui qu'on veut
            // annoncer ici — c'est la sélection de l'emplacement qui compte.
            {...(sortable ? attributes : {})}
            {...(sortable ? listeners : {})}
            aria-pressed={selected}
            // Un emplacement libre porte les identifiants par défaut du jeu :
            // afficher ce nom-là ferait croire qu'il contient quelque chose.
            title={(free ? undefined : name) ?? label}
            onClick={() => onSelect?.(index)}
        >
            <LoadoutSlotTile
                loadout={loadout}
                index={index}
                identifiers={identifiers}
            />
        </button>
    );
}
