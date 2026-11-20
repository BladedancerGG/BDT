"use client";

import {useEffect, useId, useRef, useState, useTransition} from "react";
import {useSearchParams} from "next/navigation";
import {useTranslations} from "next-intl";
import {FunnelIcon} from "@heroicons/react/24/solid";
import {usePathname, useRouter} from "@/i18n/navigation";
import {
    FILTER_COLUMNS,
    NUMBER_OPS,
    parseTableFilters,
    writeTableFilters,
    type AdminTable,
    type FilterColumn,
    type NumberOp,
    type TableFilters as Filters,
} from "@/lib/admin/filters";
import {MultiSelect, type Choice} from "./MultiSelect";

/** Attente après la dernière modification avant de recharger le tableau */
const DEBOUNCE_MS = 300;

/**
 * Ce que montrent les champs, avant traduction en filtres.
 *
 * Les dates y sont des jours LOCAUX (`<input type="date">`), l'URL porte des
 * instants : « jusqu'au 20 » doit inclure toute la journée du 20 à Nouméa, pas
 * s'arrêter à minuit UTC.
 */
type Draft =
    | { kind: "text"; text: string }
    | { kind: "date"; min: string; max: string }
    | { kind: "number"; op: NumberOp; value: string }
    | { kind: "choice"; values: string[] };

type Drafts = Record<string, Draft>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant ISO → jour local `AAAA-MM-JJ` */
function localDay(iso: string | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Jour local → instant ISO de son début, ou de sa fin (borne incluse) */
function dayBound(day: string, end: boolean): string | undefined {
    if (!day) return undefined;
    const d = new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function emptyDraft(column: FilterColumn): Draft {
    switch (column.kind) {
        case "text":
            return {kind: "text", text: ""};
        case "date":
            return {kind: "date", min: "", max: ""};
        case "number":
            return {kind: "number", op: "eq", value: ""};
        case "choice":
            return {kind: "choice", values: []};
    }
}

function toDrafts(table: AdminTable, filters: Filters): Drafts {
    const drafts: Drafts = {};
    for (const column of FILTER_COLUMNS[table]) {
        const f = filters[column.key];
        if (!f) drafts[column.key] = emptyDraft(column);
        else if (f.kind === "text") drafts[column.key] = {kind: "text", text: f.text};
        else if (f.kind === "date") drafts[column.key] = {kind: "date", min: localDay(f.min), max: localDay(f.max)};
        else if (f.kind === "number") drafts[column.key] = {kind: "number", op: f.op, value: String(f.value)};
        else drafts[column.key] = {kind: "choice", values: f.values};
    }
    return drafts;
}

function toFilters(drafts: Drafts): Filters {
    const filters: Filters = {};
    for (const [key, d] of Object.entries(drafts)) {
        if (d.kind === "text" && d.text.trim()) filters[key] = {kind: "text", text: d.text.trim()};
        if (d.kind === "date") {
            const min = dayBound(d.min, false);
            const max = dayBound(d.max, true);
            if (min || max) filters[key] = {kind: "date", min, max};
        }
        if (d.kind === "number" && d.value.trim() !== "" && Number.isFinite(Number(d.value))) {
            filters[key] = {kind: "number", op: d.op, value: Number(d.value)};
        }
        if (d.kind === "choice" && d.values.length) filters[key] = {kind: "choice", values: d.values};
    }
    return filters;
}

/**
 * Bouton « Filtres » d'un tableau et son panneau.
 *
 * L'état fait foi dans l'URL, que le serveur relit pour filtrer (les appels
 * sont paginés en base). Les champs gardent leur propre état le temps de la
 * saisie, et l'URL suit après un court délai — la remplacer à chaque frappe
 * relancerait une requête serveur par caractère.
 */
export function TableFilters({
                                 table,
                                 choices,
                             }: {
    table: AdminTable;
    /** Options des colonnes à cocher, déjà traduites */
    choices: Record<string, Choice[]>;
}) {
    const t = useTranslations("admin");
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();
    const panelId = useId();

    const [drafts, setDrafts] = useState<Drafts>(() =>
        toDrafts(table, parseTableFilters(table, new URLSearchParams(searchParams.toString()))),
    );
    const active = Object.keys(toFilters(drafts)).length;
    // Ouvert d'emblée quand l'URL arrive déjà filtrée : sinon on ne voit pas
    // pourquoi le tableau a moins de lignes.
    const [open, setOpen] = useState(active > 0);

    // Lus au moment d'écrire l'URL : un autre tableau a pu changer les siens
    // pendant le délai.
    const paramsRef = useRef(searchParams);
    useEffect(() => {
        paramsRef.current = searchParams;
    }, [searchParams]);

    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    const commit = (next: Drafts, delay: number) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const current = new URLSearchParams(paramsRef.current.toString());
            const params = writeTableFilters(table, toFilters(next), current);
            // Les filtres changent le nombre de pages : on repart de la première.
            if (table === "calls") params.delete("page");
            if (params.toString() === current.toString()) return;
            const query = params.toString();
            startTransition(() => {
                router.replace(query ? `${pathname}?${query}` : pathname, {scroll: false});
            });
        }, delay);
    };

    const update = (key: string, draft: Draft) => {
        const next = {...drafts, [key]: draft};
        setDrafts(next);
        commit(next, DEBOUNCE_MS);
    };

    const clear = () => {
        const next = Object.fromEntries(
            FILTER_COLUMNS[table].map((c) => [c.key, emptyDraft(c)]),
        ) as Drafts;
        setDrafts(next);
        commit(next, 0);
    };

    return (
        <div className="table-filters" data-pending={pending || undefined}>
            <div className="table-filters__bar">
                <button
                    type="button"
                    className="btn btn--small"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen((o) => !o)}
                >
                    <FunnelIcon className="table-filters__icon"/>
                    {t("filters.toggle")}
                    {active > 0 && <span className="table-filters__badge">{active}</span>}
                </button>
                {active > 0 && (
                    <button type="button" className="btn btn--small" onClick={clear}>
                        {t("filters.clear")}
                    </button>
                )}
            </div>

            {open && (
                <div id={panelId} className="table-filters__panel">
                    {FILTER_COLUMNS[table].map((column: FilterColumn) => {
                        const draft = drafts[column.key];
                        const label = t(column.label);
                        return (
                            <div key={column.key} className="table-filters__field">
                                <span className="table-filters__label">{label}</span>
                                {draft.kind === "text" && (
                                    <input
                                        type="search"
                                        className="table-filters__input"
                                        value={draft.text}
                                        maxLength={200}
                                        aria-label={label}
                                        onChange={(e) => update(column.key, {kind: "text", text: e.target.value})}
                                    />
                                )}
                                {draft.kind === "date" && (
                                    <div className="table-filters__range">
                                        <input
                                            type="date"
                                            className="table-filters__input"
                                            value={draft.min}
                                            max={draft.max || undefined}
                                            aria-label={`${label} — ${t("filters.min")}`}
                                            title={t("filters.min")}
                                            onChange={(e) => update(column.key, {...draft, min: e.target.value})}
                                        />
                                        <input
                                            type="date"
                                            className="table-filters__input"
                                            value={draft.max}
                                            min={draft.min || undefined}
                                            aria-label={`${label} — ${t("filters.max")}`}
                                            title={t("filters.max")}
                                            onChange={(e) => update(column.key, {...draft, max: e.target.value})}
                                        />
                                    </div>
                                )}
                                {draft.kind === "number" && (
                                    <div className="table-filters__range">
                                        <select
                                            className="table-filters__input table-filters__op"
                                            value={draft.op}
                                            aria-label={`${label} — ${t("filters.op")}`}
                                            onChange={(e) => update(column.key, {
                                                ...draft,
                                                op: e.target.value as NumberOp,
                                            })}
                                        >
                                            {NUMBER_OPS.map((op) => (
                                                <option key={op} value={op}>{t(`filters.ops.${op}`)}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className="table-filters__input"
                                            value={draft.value}
                                            aria-label={`${label} — ${t("filters.value")}`}
                                            aria-invalid={
                                                draft.value.trim() !== "" && !Number.isFinite(Number(draft.value))
                                                || undefined
                                            }
                                            onChange={(e) => update(column.key, {...draft, value: e.target.value})}
                                        />
                                    </div>
                                )}
                                {draft.kind === "choice" && (
                                    <MultiSelect
                                        label={label}
                                        options={choices[column.key] ?? []}
                                        selected={draft.values}
                                        onChange={(values) => update(column.key, {kind: "choice", values})}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
