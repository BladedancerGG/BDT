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

/**
 * Bornes de la taille des icônes de plugs (attributs, mods, aspects…), en
 * pixels. Elles ne suivent pas celles des objets : un plug est dessiné dans un
 * disque ou un carré bien plus petit, et le rendre aussi grand qu'une vignette
 * ferait déborder les colonnes d'attributs comme la grille du sélecteur.
 */
export const PLUG_SIZE = {min: 40, max: 70, default: 45} as const;

/** Ramène une taille de plug dans les bornes autorisées (entier). */
export function clampPlugSize(size: number): number {
    if (!Number.isFinite(size)) return PLUG_SIZE.default;
    return Math.min(PLUG_SIZE.max, Math.max(PLUG_SIZE.min, Math.round(size)));
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
 *  - `loadouts`   : une ligne par objet équipé, avec ses attributs et ses mods,
 *                   et le panneau des équipements sauvegardés ;
 *  - `groups`     : les groupes d'équipements du personnage, une carte chacun.
 */
export const VIEW_MODES = ["inventory", "loadouts", "groups"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DEFAULT_VIEW_MODE: ViewMode = "inventory";

export function parseViewMode(raw: unknown): ViewMode | undefined {
    return VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : undefined;
}

/**
 * Familles d'objets affichées par la vue d'inventaire.
 *
 * L'onglet choisi commande **les deux côtés** de la vue : les emplacements du
 * personnage à gauche et le contenu du coffre à droite montrent toujours la
 * même famille.
 *
 *  - `equipment`     : armes, armures, doctrines et artéfacts — la vue
 *                      historique, celle où l'on compose un équipement ;
 *  - `customization` : emblèmes, vaisseaux, passereaux, coques de Spectre,
 *                      coups de grâce et interactions ;
 *  - `inventory`     : le rangement partagé — modificateurs, objets à usage
 *                      unique et matériaux. Il n'appartient à aucun personnage,
 *                      la vue n'y montre donc pas de colonnes d'emplacements.
 */
export const ITEM_CATEGORIES = ["equipment", "customization", "inventory"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const DEFAULT_ITEM_CATEGORY: ItemCategory = "equipment";

export function parseItemCategory(raw: unknown): ItemCategory | undefined {
    return ITEM_CATEGORIES.includes(raw as ItemCategory)
        ? (raw as ItemCategory)
        : undefined;
}
