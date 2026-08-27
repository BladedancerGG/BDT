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
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {useSettings} from "@/lib/settings/store";
import {SORT_KIND, type SortRule} from "@/lib/destiny/sort";
import {Toggle} from "@/components/ui/SettingRow";

/**
 * Liste ordonnée des critères de tri du coffre.
 *
 * Le critère du haut départage en premier ; les suivants ne servent qu'en cas
 * d'égalité. L'ordre se règle au glisser-déposer, comme dans Destiny Item
 * Manager, et reste accessible au clavier : la poignée est un bouton, que
 * `dnd-kit` pilote aux flèches une fois saisie par Espace ou Entrée.
 */
export function SortRuleList() {
    const t = useTranslations("settings.inventory");
    const sortRules = useSettings((s) => s.sortRules);
    const moveSort = useSettings((s) => s.moveSort);

    const sensors = useSensors(
        // Un seuil de quelques pixels : sans lui, un simple clic sur la poignée
        // serait interprété comme un début de déplacement.
        useSensor(PointerSensor, {activationConstraint: {distance: 4}}),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = sortRules.findIndex((rule) => rule.id === active.id);
        const to = sortRules.findIndex((rule) => rule.id === over.id);
        moveSort(from, to);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={sortRules.map((rule) => rule.id)}
                strategy={verticalListSortingStrategy}
            >
                <ol className="sort-rules" aria-label={t("sort")}>
                    {sortRules.map((rule, index) => (
                        <SortRuleRow
                            key={rule.id}
                            rule={rule}
                            position={index + 1}
                            total={sortRules.length}
                        />
                    ))}
                </ol>
            </SortableContext>
        </DndContext>
    );
}

function SortRuleRow({
                         rule,
                         position,
                         total,
                     }: {
    rule: SortRule;
    position: number;
    total: number;
}) {
    const t = useTranslations("settings.inventory");
    const tCriteria = useTranslations("criteria");
    const toggleSort = useSettings((s) => s.toggleSort);
    const reverseSort = useSettings((s) => s.reverseSort);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id: rule.id});

    const label = tCriteria(rule.id);
    // Le sens n'a pas le même sens pour un texte, un nombre ou un drapeau :
    // « A → Z » ne veut rien dire pour un niveau de puissance.
    const direction = t(
        `sortDirection.${SORT_KIND[rule.id]}.${rule.desc ? "desc" : "asc"}`,
    );

    return (
        <li
            ref={setNodeRef}
            style={{
                // Liste strictement verticale : seul l'axe Y est utile, ce qui
                // évite d'importer @dnd-kit/utilities pour une matrice complète.
                transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
                transition,
            }}
            className={[
                "sort-rules__item",
                rule.enabled ? null : "sort-rules__item--off",
                isDragging ? "sort-rules__item--dragging" : null,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <button
                type="button"
                className="sort-rules__handle"
                aria-label={t("sortMove", {name: label, position, total})}
                {...attributes}
                {...listeners}
            >
                {/* Poignée décorative : le bouton porte déjà son libellé */}
                <span aria-hidden>⣿</span>
            </button>

            <span className="sort-rules__rank" aria-hidden>
                {position}
            </span>

            <span className="sort-rules__label">{label}</span>

            <button
                type="button"
                className="sort-rules__direction"
                onClick={() => reverseSort(rule.id)}
                aria-label={t("sortReverse", {name: label, direction})}
            >
                <span aria-hidden>{rule.desc ? "↓" : "↑"}</span>
                <span className="sort-rules__direction-text">{direction}</span>
            </button>

            <Toggle
                id={`setting-sort-${rule.id}`}
                checked={rule.enabled}
                onChange={() => toggleSort(rule.id)}
                label={t("sortEnable", {name: label})}
            />
        </li>
    );
}
