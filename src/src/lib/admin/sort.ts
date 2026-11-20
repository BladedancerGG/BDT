// Tri des tableaux de la page de statistiques d'administration.
//
// Module PUR, comme `filters.ts` dont il reprend les conventions (pas d'import
// de valeur par alias, voir scripts/checks/README.md). Vérifié par
// scripts/checks/admin-sort.check.ts.
//
// Une seule colonne trie un tableau à la fois, et un clic sur son en-tête la
// fait passer par trois états : aucun tri → croissant → décroissant → aucun.
// « Aucun » rend l'ordre par défaut du tableau, celui de sa requête.
//
// L'état vit dans l'URL : `sort.calls=duration` (croissant) ou
// `sort.calls=-duration` (décroissant). Le préfixe est `sort.` et non
// `calls.` : réécrire les filtres d'un tableau efface tous ses paramètres
// `calls.*` (writeTableFilters), et emporterait le tri avec eux.

import type {AdminTable, CellValue} from "./filters";

export type SortDirection = "asc" | "desc";

export interface SortState {
    key: string;
    dir: SortDirection;
}

/** Colonnes triables : toutes celles du tableau, dans l'ordre des en-têtes. */
export const SORT_COLUMNS = {
    users: ["displayName", "createdAt", "lastSeenAt", "admin"],
    groups: ["name", "user", "loadouts"],
    calls: ["endpoint", "user", "date", "status", "duration"],
    shares: ["link", "kind", "user", "createdAt"],
} as const satisfies Record<AdminTable, readonly string[]>;

export function sortParamName(table: AdminTable): string {
    return `sort.${table}`;
}

/** Le tri d'un tableau, ou null. Une colonne inconnue est ignorée. */
export function parseSort(table: AdminTable, params: URLSearchParams): SortState | null {
    const raw = params.get(sortParamName(table));
    if (!raw) return null;
    const desc = raw.startsWith("-");
    const key = desc ? raw.slice(1) : raw;
    if (!(SORT_COLUMNS[table] as readonly string[]).includes(key)) return null;
    return {key, dir: desc ? "desc" : "asc"};
}

/** L'état que donnerait un clic sur l'en-tête de `key`. */
export function nextSort(current: SortState | null, key: string): SortState | null {
    // Une autre colonne repart du début du cycle : elle remplace l'ancienne.
    if (!current || current.key !== key) return {key, dir: "asc"};
    return current.dir === "asc" ? {key, dir: "desc"} : null;
}

/** Une copie des paramètres avec le tri du tableau remplacé (ou retiré). */
export function writeSort(
    table: AdminTable,
    sort: SortState | null,
    params: URLSearchParams,
): URLSearchParams {
    const next = new URLSearchParams(params);
    if (sort) next.set(sortParamName(table), sort.dir === "desc" ? `-${sort.key}` : sort.key);
    else next.delete(sortParamName(table));
    return next;
}

/** Sens d'une colonne pour son en-tête, ou null si elle ne trie pas. */
export function sortDirectionOf(sort: SortState | null, key: string): SortDirection | null {
    return sort?.key === key ? sort.dir : null;
}

// —— Comparaison ————————————————————————————————————————————

const collator = new Intl.Collator(undefined, {sensitivity: "base", numeric: true});

/** Comparaison croissante de deux valeurs présentes de même nature. */
function compareValues(a: Exclude<CellValue, null | undefined>, b: Exclude<CellValue, null | undefined>): number {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    return collator.compare(String(a), String(b));
}

/**
 * Les lignes triées, dans une copie.
 *
 * Les valeurs absentes (« jamais », « aucun ») vont **à la fin dans les deux
 * sens** : inverser le tri ne doit pas faire remonter en tête des lignes qui
 * n'ont rien à comparer. À égalité, l'ordre d'origine est gardé (tri stable).
 *
 * `cell` est l'accesseur des filtres ; quand il rend plusieurs valeurs, la
 * première — celle qui s'affiche — sert au tri.
 */
export function sortRows<T>(
    rows: readonly T[],
    sort: SortState | null,
    cell: (row: T, key: string) => CellValue | CellValue[],
): T[] {
    if (!sort) return [...rows];
    const sign = sort.dir === "asc" ? 1 : -1;
    const value = (row: T) => {
        const raw = cell(row, sort.key);
        return Array.isArray(raw) ? raw[0] : raw;
    };
    return rows
        .map((row, index) => ({row, index, value: value(row)}))
        .sort((a, b) => {
            const aMissing = a.value == null;
            const bMissing = b.value == null;
            if (aMissing || bMissing) {
                if (aMissing && bMissing) return a.index - b.index;
                return aMissing ? 1 : -1;
            }
            return sign * compareValues(a.value!, b.value!) || a.index - b.index;
        })
        .map((entry) => entry.row);
}
