// Filtres des tableaux de la page de statistiques d'administration.
//
// Module PUR, partagé par la page (serveur), qui filtre, et par le panneau de
// filtres (client), qui écrit l'URL : ni React, ni Prisma, ni import de valeur
// par alias (voir scripts/checks/README.md). Vérifié par
// scripts/checks/admin-filters.check.ts.
//
// L'URL est la seule source de vérité : un filtre se partage, survit au
// rechargement, et le serveur — qui pagine les appels — le lit directement.
// Chaque paramètre est préfixé par son tableau (`calls.status`), les quatre
// tableaux vivant sur la même page.

export const ADMIN_TABLES = ["users", "groups", "calls", "shares"] as const;
export type AdminTable = (typeof ADMIN_TABLES)[number];

/** Comparaisons d'un filtre numérique. Toutes lues dans `admin.filters.ops` (messages). */
export const NUMBER_OPS = ["lt", "lte", "eq", "gte", "gt"] as const;
export type NumberOp = (typeof NUMBER_OPS)[number];

export type FilterKind = "text" | "date" | "number" | "choice";

export interface FilterColumn {
    key: string;
    kind: FilterKind;
    /** Clé du libellé, relative à l'espace `admin` des messages */
    label: string;
}

/**
 * Colonnes filtrables, dans l'ordre du panneau.
 *
 * Toutes les colonnes affichées, sauf la couleur des groupes. La colonne
 * « statut » des appels en affiche trois (statut, code HTTP, tentatives) :
 * chacune a son filtre.
 */
export const FILTER_COLUMNS = {
    users: [
        {key: "displayName", kind: "text", label: "users.displayName"},
        {key: "createdAt", kind: "date", label: "users.createdAt"},
        {key: "lastSeenAt", kind: "date", label: "users.lastSeenAt"},
        {key: "admin", kind: "choice", label: "users.admin"},
    ],
    groups: [
        {key: "name", kind: "text", label: "groups.name"},
        {key: "user", kind: "text", label: "user"},
        {key: "loadouts", kind: "number", label: "groups.loadouts"},
    ],
    calls: [
        {key: "endpoint", kind: "choice", label: "calls.endpoint"},
        {key: "user", kind: "text", label: "user"},
        {key: "date", kind: "date", label: "date"},
        {key: "status", kind: "choice", label: "calls.status"},
        // Liste à cocher et non comparaison : les codes rencontrés sont peu
        // nombreux, et « 500 ou plus » mélangerait des pannes sans rapport.
        {key: "httpStatus", kind: "choice", label: "calls.httpStatus"},
        {key: "attempts", kind: "number", label: "calls.attemptsLabel"},
        {key: "duration", kind: "number", label: "calls.duration"},
    ],
    shares: [
        {key: "link", kind: "text", label: "shares.link"},
        {key: "kind", kind: "choice", label: "shares.kind"},
        {key: "user", kind: "text", label: "user"},
        {key: "createdAt", kind: "date", label: "shares.createdAt"},
    ],
} as const satisfies Record<AdminTable, readonly FilterColumn[]>;

export type FilterValue =
    | { kind: "text"; text: string }
    /** Instants ISO, bornes incluses — le client les tire du jour LOCAL saisi */
    | { kind: "date"; min?: string; max?: string }
    | { kind: "number"; op: NumberOp; value: number }
    | { kind: "choice"; values: string[] };

/** Les seuls filtres actifs d'un tableau, par clé de colonne. */
export type TableFilters = Record<string, FilterValue>;

/** Garde-fous contre une URL forgée : rien ne doit coûter cher à analyser. */
const TEXT_MAX = 200;
const CHOICES_MAX = 500;

/** Nom d'un paramètre d'URL. Les bornes et l'opérateur ont un suffixe. */
export function paramName(table: AdminTable, key: string, suffix?: "min" | "max" | "op"): string {
    return suffix ? `${table}.${key}.${suffix}` : `${table}.${key}`;
}

function isNumberOp(raw: unknown): raw is NumberOp {
    return typeof raw === "string" && (NUMBER_OPS as readonly string[]).includes(raw);
}

function validInstant(raw: string | null): string | undefined {
    if (!raw) return undefined;
    const time = Date.parse(raw);
    return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** Lit les filtres actifs d'un tableau. Ce qui est invalide est ignoré, sans erreur. */
export function parseTableFilters(table: AdminTable, params: URLSearchParams): TableFilters {
    const filters: TableFilters = {};
    for (const column of FILTER_COLUMNS[table]) {
        const name = paramName(table, column.key);
        switch (column.kind) {
            case "text": {
                const text = (params.get(name) ?? "").trim().slice(0, TEXT_MAX);
                if (text) filters[column.key] = {kind: "text", text};
                break;
            }
            case "date": {
                const min = validInstant(params.get(paramName(table, column.key, "min")));
                const max = validInstant(params.get(paramName(table, column.key, "max")));
                if (min || max) filters[column.key] = {kind: "date", min, max};
                break;
            }
            case "number": {
                const raw = (params.get(name) ?? "").trim();
                // `Number("")` vaut 0 : un champ vide ne doit pas filtrer sur zéro.
                const value = raw === "" ? NaN : Number(raw);
                if (!Number.isFinite(value)) break;
                const op = params.get(paramName(table, column.key, "op"));
                filters[column.key] = {kind: "number", op: isNumberOp(op) ? op : "eq", value};
                break;
            }
            case "choice": {
                const values = [...new Set(params.getAll(name).filter(Boolean))].slice(0, CHOICES_MAX);
                if (values.length) filters[column.key] = {kind: "choice", values};
                break;
            }
        }
    }
    return filters;
}

/**
 * Remplace les filtres d'un tableau dans une copie des paramètres, sans
 * toucher à ceux des autres tableaux.
 */
export function writeTableFilters(
    table: AdminTable,
    filters: TableFilters,
    params: URLSearchParams,
): URLSearchParams {
    const next = new URLSearchParams(params);
    const prefix = `${table}.`;
    for (const name of [...next.keys()]) {
        if (name.startsWith(prefix)) next.delete(name);
    }
    for (const column of FILTER_COLUMNS[table]) {
        const filter = filters[column.key];
        if (!filter) continue;
        const name = paramName(table, column.key);
        switch (filter.kind) {
            case "text":
                if (filter.text.trim()) next.set(name, filter.text.trim());
                break;
            case "date":
                if (filter.min) next.set(paramName(table, column.key, "min"), filter.min);
                if (filter.max) next.set(paramName(table, column.key, "max"), filter.max);
                break;
            case "number":
                next.set(name, String(filter.value));
                next.set(paramName(table, column.key, "op"), filter.op);
                break;
            case "choice":
                for (const value of filter.values) next.append(name, value);
                break;
        }
    }
    return next;
}

// —— Comparaisons ————————————————————————————————————————————

/** Contient le texte, sans tenir compte de la casse. Une valeur absente ne contient rien. */
export function matchesText(value: string | null | undefined, text: string): boolean {
    if (value == null) return false;
    return value.toLocaleLowerCase().includes(text.toLocaleLowerCase());
}

/** Bornes incluses. Une date absente (« jamais ») n'est dans aucun intervalle. */
export function matchesDate(value: Date | null | undefined, min?: string, max?: string): boolean {
    if (!min && !max) return true;
    if (!value) return false;
    const time = value.getTime();
    if (min && time < Date.parse(min)) return false;
    return !(max && time > Date.parse(max));
}

export function matchesNumber(value: number | null | undefined, op: NumberOp, target: number): boolean {
    if (value == null) return false;
    switch (op) {
        case "lt":
            return value < target;
        case "lte":
            return value <= target;
        case "eq":
            return value === target;
        case "gte":
            return value >= target;
        case "gt":
            return value > target;
    }
}

export type CellValue = string | number | Date | null | undefined;

/**
 * Les lignes qui passent tous les filtres.
 *
 * `cell` rend la valeur d'une colonne, ou plusieurs quand un même filtre
 * texte porte sur plusieurs champs (le lien d'un partage : nom, identifiant,
 * URL) — il suffit alors que l'une corresponde.
 */
export function filterRows<T>(
    rows: readonly T[],
    filters: TableFilters,
    cell: (row: T, key: string) => CellValue | CellValue[],
): T[] {
    const active = Object.entries(filters);
    if (!active.length) return [...rows];
    return rows.filter((row) =>
        active.every(([key, filter]) => {
            const raw = cell(row, key);
            const values = Array.isArray(raw) ? raw : [raw];
            return values.some((value) => matchesCell(value, filter));
        }),
    );
}

function matchesCell(value: CellValue, filter: FilterValue): boolean {
    switch (filter.kind) {
        case "text":
            return matchesText(value == null ? null : String(value), filter.text);
        case "date":
            return matchesDate(value instanceof Date ? value : null, filter.min, filter.max);
        case "number":
            return matchesNumber(typeof value === "number" ? value : null, filter.op, filter.value);
        case "choice":
            return value != null && filter.values.includes(String(value));
    }
}

// —— Points d'entrée ————————————————————————————————————————
//
// L'option d'un point d'entrée réunit méthode et chemin : `/Destiny2/Actions/…`
// n'est pas le même appel en GET et en POST.

export function endpointChoice(method: string, endpoint: string): string {
    return `${method} ${endpoint}`;
}

export function parseEndpointChoice(choice: string): { method: string; endpoint: string } | null {
    const space = choice.indexOf(" ");
    if (space <= 0) return null;
    return {method: choice.slice(0, space), endpoint: choice.slice(space + 1)};
}
