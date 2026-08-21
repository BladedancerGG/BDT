"use client";

import {useMemo, useState} from "react";
import {
    useFloating,
    useDismiss,
    useInteractions,
    offset,
    flip,
    shift,
    size,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import type {SlotSide} from "@/lib/destiny/buckets";
import type {PlugChipRows} from "@/lib/destiny/use-equipped-plugs";
import {useSocketOptions} from "@/lib/destiny/use-sockets";
import {usePlugAvailability} from "@/lib/destiny/use-plug-availability";
import {usePlugActionState, type QueuedItem} from "@/lib/actions/store";
import {PlugIcon} from "../tooltip/PlugIcon";
import {
    PlugSlot,
    SocketPicker,
    SocketPickerProvider,
    type PickerTarget,
} from "../tooltip/SocketPicker";

/** Référence stable : un tableau vide recréé relancerait la lecture sans fin. */
const NO_INDEXES: number[] = [];

/**
 * Les attributs, mods et compétences d'un objet, alignés sur SA ligne.
 *
 * Deux régimes :
 *
 *  - **modifiable** (`item` fourni) — l'équipement porté. Chaque emplacement
 *    ouvre le sélecteur de son socket, exactement comme dans l'infobulle : on
 *    change un mod ou un attribut sans avoir à ouvrir l'objet.
 *  - **lecture seule** (`item` absent) — un équipement sauvegardé. C'est un
 *    instantané : rien n'y est équipé en ce moment, il n'y a donc rien à
 *    changer. Les infobulles au survol, elles, restent là.
 *
 * Le côté commande l'alignement, pas l'ordre du DOM : les lignes de la colonne
 * de gauche sont poussées contre la vignette, celles de droite s'en éloignent.
 * L'ordre de lecture reste celui du jeu dans les deux cas.
 */
export function EquipmentPlugs({
                                   rows,
                                   side,
                                   item,
                                   def,
                                   detail,
                               }: {
    rows: PlugChipRows;
    side: SlotSide;
    /** L'objet tel qu'il part en file d'actions — absent = lecture seule */
    item?: QueuedItem;
    def: InventoryItemDefinition | undefined;
    detail: ItemDetail | undefined;
}) {
    const [picker, setPicker] = useState<PickerTarget | undefined>();

    // Les sockets réellement présents sur l'objet : les bonus d'ensemble n'en
    // ont pas, ils viennent de la panoplie.
    const indexes = useMemo(() => {
        if (!item) return NO_INDEXES;
        const list = rows
            .flat()
            .map((chip) => chip.socketIndex)
            .filter((index): index is number => index !== undefined);
        return list.length > 0 ? list : NO_INDEXES;
    }, [rows, item]);

    // Ce que le compte a débloqué : sans lui, un emplacement de mod ne
    // proposerait que ce qui y est déjà.
    const available = usePlugAvailability(item?.itemInstanceId);
    const columns = useSocketOptions(def, detail, indexes, available);
    const byIndex = useMemo(
        () => new Map(columns.map((column) => [column.socketIndex, column])),
        [columns],
    );

    const {pending, error, failure} = usePlugActionState(item?.itemInstanceId);

    // Le panneau s'ancre au bloc d'attributs et non à l'icône cliquée : il tient
    // ainsi la même place d'un emplacement à l'autre, au lieu de sauter le long
    // de la ligne.
    const {refs, floatingStyles, context} = useFloating({
        open: Boolean(picker),
        onOpenChange: (open) => !open && setPicker(undefined),
        placement: side === "left" ? "left-start" : "right-start",
        middleware: [
            offset(8),
            flip({fallbackPlacements: ["bottom", "top"]}),
            shift({padding: 8}),
            size({
                padding: 8,
                apply({availableHeight, elements}) {
                    // Une variable CSS, pas un `max-height` sur le calque : c'est
                    // le panneau qu'il contient qui doit être borné, sinon sa
                    // grille ne défile pas (même écueil que l'infobulle d'objet).
                    elements.floating.style.setProperty(
                        "--picker-max-height",
                        `${availableHeight}px`,
                    );
                },
            }),
        ],
        whileElementsMounted: autoUpdate,
    });

    // Clic extérieur et Échap referment le panneau. Sans cela il n'y aurait
    // aucun moyen d'en sortir sans recliquer exactement l'emplacement ouvert —
    // l'infobulle d'objet, elle, tient ce rôle pour le sélecteur qu'elle porte.
    const dismiss = useDismiss(context);
    const {getFloatingProps} = useInteractions([dismiss]);

    if (rows.length === 0) return null;

    // Le sélecteur garde son socket, pas l'état du socket : après une insertion
    // réussie, le plug en place a changé et il doit le refléter.
    const target: PickerTarget | undefined = picker && {
        ...picker,
        equippedHash: detail?.sockets?.[picker.socketIndex] || picker.equippedHash,
    };

    return (
        <SocketPickerProvider
            value={{
                item,
                target,
                toggle: (next) =>
                    setPicker((current) =>
                        current?.socketIndex === next.socketIndex ? undefined : next,
                    ),
                disabled: new Set(detail?.disabledSockets ?? []),
                pending,
            }}
        >
            <div
                // setReference est un callback ref stable de Floating UI
                ref={refs.setReference}
                className={`plug-chips plug-chips--${side}`}
            >
                {rows.map((row, index) => (
                    <div key={index} className="plug-chips__row">
                        {row.map((chip) => {
                            const column =
                                chip.socketIndex !== undefined
                                    ? byIndex.get(chip.socketIndex)
                                    : undefined;

                            // Emplacement modifiable : PlugSlot décide seul s'il y a
                            // quelque chose à choisir (plusieurs options, socket ni
                            // verrouillé ni payant) — la même règle que l'infobulle,
                            // écrite une seule fois.
                            if (column) {
                                return (
                                    <PlugSlot
                                        key={chip.key}
                                        column={column}
                                        square={chip.square}
                                        state={chip.square ? undefined : "equipped"}
                                        markEnhanced={chip.markEnhanced}
                                    />
                                );
                            }

                            return (
                                <PlugIcon
                                    key={chip.key}
                                    hash={chip.hash}
                                    square={chip.square}
                                    table={chip.table}
                                    markEnhanced={chip.markEnhanced}
                                    // Le fond bleu d'« équipé » ne vaut que pour les
                                    // icônes rondes : posé sous un mod, il ressortirait
                                    // par les coins transparents de son PNG. Seuls les
                                    // bonus d'ensemble arrivent ici inactifs, la
                                    // maquette les voulant visibles hors palier.
                                    state={
                                        chip.square
                                            ? undefined
                                            : chip.active
                                                ? "equipped"
                                                : "available"
                                    }
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            {target && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="floating-layer floating-layer--picker"
                    >
                        <SocketPicker target={target} error={error} failure={failure}/>
                    </div>
                </FloatingPortal>
            )}
        </SocketPickerProvider>
    );
}
