"use client";

import {useId, useState} from "react";
import {useTranslations} from "next-intl";
import {
    autoUpdate,
    flip,
    offset,
    shift,
    size,
    useClick,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
    FloatingFocusManager,
    FloatingPortal,
} from "@floating-ui/react";
import {ChevronDownIcon} from "@heroicons/react/24/solid";

export interface Choice {
    value: string;
    label: string;
}

/** Au-delà, la liste gagne un champ pour s'y retrouver (points d'entrée) */
const SEARCH_THRESHOLD = 8;

/**
 * Liste déroulante à cases à cocher, sélection multiple.
 *
 * Aucune case cochée vaut « tous » : c'est l'absence de filtre, pas un filtre
 * qui ne laisse rien passer.
 *
 * En portail Floating UI : le panneau de filtres est dans le flux de la page,
 * mais la liste des points d'entrée est longue et ne doit ni être rognée ni
 * pousser le tableau.
 */
export function MultiSelect({
                                label,
                                options,
                                selected,
                                onChange,
                            }: {
    label: string;
    options: Choice[];
    selected: string[];
    onChange: (next: string[]) => void;
}) {
    const t = useTranslations("admin.filters");
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const labelId = useId();

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "bottom-start",
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(4),
            flip(),
            shift({padding: 8}),
            size({
                padding: 8,
                apply({availableHeight, rects, elements}) {
                    elements.floating.style.setProperty("--multi-select-max-height", `${availableHeight}px`);
                    elements.floating.style.setProperty("--multi-select-min-width", `${rects.reference.width}px`);
                },
            }),
        ],
    });
    const click = useClick(context);
    const dismiss = useDismiss(context);
    const role = useRole(context, {role: "dialog"});
    const {getReferenceProps, getFloatingProps} = useInteractions([click, dismiss, role]);

    const chosen = new Set(selected);
    const visible = search
        ? options.filter((o) => o.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
        : options;

    const toggle = (value: string) => {
        const next = new Set(chosen);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        // Dans l'ordre des options, pour une URL stable quel que soit l'ordre des clics
        onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
    };

    const summary =
        selected.length === 0
            ? t("any")
            : selected.length === 1
                ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
                : t("selected", {count: selected.length});

    return (
        <>
            <button
                type="button"
                ref={refs.setReference}
                className="multi-select__trigger"
                aria-label={`${label} : ${summary}`}
                data-active={selected.length > 0 || undefined}
                {...getReferenceProps()}
            >
                <span className="multi-select__summary">{summary}</span>
                <ChevronDownIcon className="multi-select__chevron"/>
            </button>
            {open && (
                <FloatingPortal>
                    <FloatingFocusManager context={context} modal={false}>
                        <div
                            // eslint-disable-next-line react-hooks/refs
                            ref={refs.setFloating}
                            style={floatingStyles}
                            className="multi-select__panel"
                            aria-labelledby={labelId}
                            {...getFloatingProps()}
                        >
                            <span id={labelId} className="visually-hidden">{label}</span>
                            {options.length > SEARCH_THRESHOLD && (
                                <input
                                    type="search"
                                    className="multi-select__search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t("filterOptions")}
                                    aria-label={t("filterOptions")}
                                />
                            )}
                            {selected.length > 0 && (
                                <button
                                    type="button"
                                    className="multi-select__clear"
                                    onClick={() => onChange([])}
                                >
                                    {t("clearSelection")}
                                </button>
                            )}
                            <ul className="multi-select__list">
                                {visible.length === 0 && (
                                    <li className="multi-select__empty">{t("noOptions")}</li>
                                )}
                                {visible.map((option) => (
                                    <li key={option.value}>
                                        <label className="multi-select__option">
                                            <input
                                                type="checkbox"
                                                checked={chosen.has(option.value)}
                                                onChange={() => toggle(option.value)}
                                            />
                                            <span className="multi-select__label">{option.label}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </>
    );
}
