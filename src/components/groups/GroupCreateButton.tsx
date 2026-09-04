"use client";

import {useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {
    useFloating,
    useClick,
    useDismiss,
    useRole,
    useListNavigation,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
    FloatingFocusManager,
} from "@floating-ui/react";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {
    GROUP_NAME_MAX,
    blankGroupLoadouts,
    copyGroupLoadouts,
} from "@/lib/loadouts/groups/types";
import {Modal} from "@/components/ui/Modal";
import {GroupColorPicker} from "./GroupColorPicker";
import {PlusIcon} from "@heroicons/react/24/solid";

/** De quoi part le nouveau groupe. */
type Source = "equipped" | "blank";

/**
 * « + Nouveau groupe » : un menu déroulant de deux entrées, puis le nom.
 *
 * Le nom est demandé dans une modale plutôt que renommé après coup : une carte
 * s'identifie par son titre, et en créer une fournée de « Groupe 3 » à renommer
 * ensuite est le contraire de ce que la maquette montre.
 *
 * Le menu passe par Floating UI comme le reste des surfaces flottantes de
 * l'application : il fournit le positionnement, la fermeture par Échap ou clic
 * au-dehors, et la navigation aux flèches dans la liste.
 */
export function GroupCreateButton({
                                      characterId,
                                      loadouts,
                                  }: {
    characterId: string | null;
    /** Les emplacements du personnage — la source de « à partir des équipements » */
    loadouts: readonly DestinyLoadout[];
}) {
    const t = useTranslations("groups");
    const tCommon = useTranslations("common");
    const createGroup = useLoadoutGroups((s) => s.createGroup);
    const count = useLoadoutGroups((s) => s.groups.length);

    const [open, setOpen] = useState(false);
    const [source, setSource] = useState<Source | null>(null);
    const [name, setName] = useState("");
    const [color, setColor] = useState<string | undefined>();
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const items = useRef<(HTMLElement | null)[]>([]);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
        useClick(context),
        useDismiss(context, {outsidePressEvent: "mousedown"}),
        useRole(context, {role: "menu"}),
        useListNavigation(context, {
            listRef: items,
            activeIndex,
            onNavigate: setActiveIndex,
            loop: true,
        }),
    ]);

    /** Ouvre la modale du nom, le menu refermé derrière. */
    const pick = (next: Source) => {
        setOpen(false);
        setSource(next);
        setName(t("defaultName", {number: count + 1}));
    };

    const confirm = () => {
        if (!characterId || !source) return;
        createGroup({
            characterId,
            name,
            color,
            loadouts:
                source === "equipped"
                    ? copyGroupLoadouts(loadouts)
                    // Un groupe vide a autant d'emplacements que le personnage :
                    // c'est la grille de la carte, et la place de chaque
                    // instantané à venir.
                    : blankGroupLoadouts(loadouts.length),
        });
        setSource(null);
    };

    const options: {source: Source; label: string}[] = [
        {source: "equipped", label: t("fromEquipped")},
        {source: "blank", label: t("fromBlank")},
    ];

    return (
        <>
            <button
                // setReference est un callback ref stable de Floating UI
                ref={refs.setReference}
                type="button"
                className="btn group-create__button"
                // Sans emplacement, un groupe n'aurait aucune place où poser
                // un instantané — voir `noSlots`.
                disabled={!characterId || loadouts.length === 0}
                aria-haspopup="menu"
                aria-expanded={open}
                {...getReferenceProps()}
            >
                <PlusIcon/>
                {t("create")}
            </button>

            {open && (
                <FloatingPortal>
                    <FloatingFocusManager context={context} modal={false}>
                        <div
                            // eslint-disable-next-line react-hooks/refs
                            ref={refs.setFloating}
                            style={floatingStyles}
                            className="group-create__menu"
                            {...getFloatingProps()}
                        >
                            {options.map((option, index) => (
                                <button
                                    key={option.source}
                                    ref={(node) => {
                                        items.current[index] = node;
                                    }}
                                    type="button"
                                    role="menuitem"
                                    tabIndex={activeIndex === index ? 0 : -1}
                                    className="group-create__item"
                                    {...getItemProps({
                                        onClick: () => pick(option.source),
                                    })}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}

            <Modal
                open={source !== null}
                onClose={() => setSource(null)}
                title={t("create")}
                compact
            >
                <form
                    className="group-name"
                    onSubmit={(event) => {
                        event.preventDefault();
                        confirm();
                    }}
                >
                    <h2 className="group-name__title">{t("create")}</h2>

                    <label className="group-name__label" htmlFor="group-name">
                        {t("nameLabel")}
                    </label>
                    <input
                        id="group-name"
                        className="group-name__input"
                        value={name}
                        maxLength={GROUP_NAME_MAX}
                        autoFocus
                        onChange={(event) => setName(event.target.value)}
                    />

                    <span className="group-name__label">{t("colorLabel")}</span>
                    <GroupColorPicker value={color} onChange={setColor}/>

                    <div className="group-name__actions">
                        <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => setSource(null)}
                        >
                            {tCommon("cancel")}
                        </button>
                        <button
                            type="submit"
                            className="btn btn--small btn--primary"
                            disabled={name.trim().length === 0}
                        >
                            {tCommon("confirm")}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
