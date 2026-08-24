// Constantes partagées entre le client et le serveur.
//
// IMPORTANT : ce fichier ne porte PAS de directive "use client".
// Une constante exportée depuis un module « use client » ne vaut pas sa valeur
// réelle lorsqu'elle est importée par du code serveur (elle arrive `undefined`),
// ce qui rendait la lecture du cookie silencieusement inopérante.

export type ThemePreference = "light" | "dark" | "system";

/** Nom du cookie portant les préférences (lisible par le serveur). */
export const PREFS_COOKIE = "bdt-prefs";

/** Bornes de la taille des icônes d'objets, en pixels. */
export const ICON_SIZE = {min: 40, max: 96, default: 75} as const;

/** Ramène une valeur dans les bornes autorisées (entier). */
export function clampIconSize(size: number): number {
    if (!Number.isFinite(size)) return ICON_SIZE.default;
    return Math.min(ICON_SIZE.max, Math.max(ICON_SIZE.min, Math.round(size)));
}

/** Bornes du nombre de recherches conservées dans l'historique. */
export const SEARCH_HISTORY_SIZE = {min: 0, max: 30, default: 10} as const;

export function clampSearchHistorySize(size: number): number {
    if (!Number.isFinite(size)) return SEARCH_HISTORY_SIZE.default;
    return Math.min(
        SEARCH_HISTORY_SIZE.max,
        Math.max(SEARCH_HISTORY_SIZE.min, Math.round(size)),
    );
}

/**
 * Sort des objets du coffre et des objets perdus qui ne répondent pas à la
 * recherche. L'inventaire des personnages n'est pas concerné : il ne perd
 * jamais d'objets, il les estompe seulement.
 */
export const SEARCH_MISS_MODES = ["hide", "dim"] as const;
export type SearchMissMode = (typeof SEARCH_MISS_MODES)[number];

export function parseSearchMissMode(raw: unknown): SearchMissMode | undefined {
    return raw === "hide" || raw === "dim" ? raw : undefined;
}

/**
 * Modes d'affichage de la page d'équipement.
 *
 *  - `inventory`  : les deux colonnes d'emplacements et le coffre — le mode
 *                   historique, celui où l'on déplace des objets ;
 *  - `equipment`  : une ligne par objet équipé, avec ses attributs et ses mods,
 *                   et le panneau des équipements sauvegardés.
 */
export const VIEW_MODES = ["inventory", "loadouts"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DEFAULT_VIEW_MODE: ViewMode = "inventory";

export function parseViewMode(raw: unknown): ViewMode | undefined {
    return VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : undefined;
}
