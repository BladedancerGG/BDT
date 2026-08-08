// Lecture des préférences côté serveur, pour rendre le bon thème et la bonne
// taille d'icônes dès le HTML initial — sans flash ni script inline.
//
// Les constantes viennent de `constants.ts` et non du store : une valeur
// exportée par un module « use client » arrive `undefined` côté serveur.

import {cookies} from "next/headers";
import {ICON_SIZE, PREFS_COOKIE, type ThemePreference} from "./constants";

export interface ServerPreferences {
    /**
     * Thème explicite, ou `undefined` en mode « système » : dans ce cas on ne
     * pose aucun attribut `data-theme` et la règle CSS `prefers-color-scheme`
     * prend le relais — le serveur n'a pas à connaître la préférence de l'OS.
     */
    theme?: "light" | "dark";
    iconSize?: number;
    vaultIconSize?: number;
}

/** Borne une taille lue dans le cookie, ou `undefined` si elle est inexploitable. */
function readIconSize(value: unknown): number | undefined {
    const size = Number(value);
    return Number.isFinite(size) && size >= ICON_SIZE.min && size <= ICON_SIZE.max
        ? size
        : undefined;
}

export async function readPreferences(): Promise<ServerPreferences> {
    const raw = (await cookies()).get(PREFS_COOKIE)?.value;
    if (!raw) return {};

    try {
        // Next décode déjà la valeur du cookie ; le decodeURIComponent reste sans
        // effet sur une chaîne déjà décodée, mais couvre le cas contraire.
        const parsed = JSON.parse(decodeURIComponent(raw)) as {
            state?: {
                theme?: ThemePreference;
                iconSize?: number;
                vaultIconSize?: number;
            };
        };
        const state = parsed.state ?? {};

        const theme =
            state.theme === "light" || state.theme === "dark"
                ? state.theme
                : undefined;

        return {
            theme,
            iconSize: readIconSize(state.iconSize),
            vaultIconSize: readIconSize(state.vaultIconSize),
        };
    } catch {
        // Cookie illisible : on garde les valeurs par défaut du CSS
        return {};
    }
}
