// Constantes partagées entre le client et le serveur.
//
// IMPORTANT : ce fichier ne porte PAS de directive "use client".
// Une constante exportée depuis un module « use client » ne vaut pas sa valeur
// réelle lorsqu'elle est importée par du code serveur (elle arrive `undefined`),
// ce qui rendait la lecture du cookie silencieusement inopérante.

export type ThemePreference = "light" | "dark" | "system";

/** Nom du cookie portant les préférences (lisible par le serveur). */
export const PREFS_COOKIE = "dlm-prefs";

/** Bornes de la taille des icônes d'objets, en pixels. */
export const ICON_SIZE = {min: 40, max: 96, default: 75} as const;

/** Ramène une valeur dans les bornes autorisées (entier). */
export function clampIconSize(size: number): number {
    if (!Number.isFinite(size)) return ICON_SIZE.default;
    return Math.min(ICON_SIZE.max, Math.max(ICON_SIZE.min, Math.round(size)));
}
