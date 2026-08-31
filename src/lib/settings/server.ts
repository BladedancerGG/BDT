// Lecture des préférences côté serveur, pour rendre le bon thème et la bonne
// taille d'icônes dès le HTML initial — sans flash ni script inline.
//
// Les constantes viennent de `constants.ts` et non du store : une valeur
// exportée par un module « use client » arrive `undefined` côté serveur.

import {cookies} from "next/headers";
import {prisma} from "@/lib/db/prisma";
import {getSessionUserId} from "@/lib/auth/session";
import {ICON_SIZE, PREFS_COOKIE, type ThemePreference} from "./constants";

/** Sous-ensemble des préférences persistées que le serveur sait exploiter. */
interface PersistedShape {
    theme?: ThemePreference;
    iconSize?: number;
    vaultIconSize?: number;
}

export interface ServerPreferences {
    /**
     * Thème explicite, ou `undefined` en mode « système » : dans ce cas on ne
     * pose aucun attribut `data-theme` et la règle CSS `prefers-color-scheme`
     * prend le relais — le serveur n'a pas à connaître la préférence de l'OS.
     */
    theme?: "light" | "dark";
    iconSize?: number;
    vaultIconSize?: number;
    /**
     * État déposé en base, quand la synchronisation est active. C'est lui qui
     * a servi à rendre le HTML ci-dessus : le client doit s'y ranger, son
     * cookie pouvant dater d'un autre appareil.
     */
    synced?: unknown;
}

/** Borne une taille lue dans le cookie, ou `undefined` si elle est inexploitable. */
function readIconSize(value: unknown): number | undefined {
    const size = Number(value);
    return Number.isFinite(size) && size >= ICON_SIZE.min && size <= ICON_SIZE.max
        ? size
        : undefined;
}

/** Ce que le serveur retient d'un état persisté, cookie ou base. */
function pick(state: PersistedShape): Omit<ServerPreferences, "synced"> {
    return {
        theme: state.theme === "light" || state.theme === "dark" ? state.theme : undefined,
        iconSize: readIconSize(state.iconSize),
        vaultIconSize: readIconSize(state.vaultIconSize),
    };
}

/** État persisté dans le cookie, ou `null` s'il est absent ou illisible. */
function readCookieState(raw: string | undefined): PersistedShape | null {
    if (!raw) return null;
    try {
        // Next décode déjà la valeur du cookie ; le decodeURIComponent reste sans
        // effet sur une chaîne déjà décodée, mais couvre le cas contraire.
        const parsed = JSON.parse(decodeURIComponent(raw)) as {state?: PersistedShape};
        return parsed.state ?? null;
    } catch {
        // Cookie illisible : on garde les valeurs par défaut du CSS
        return null;
    }
}

/**
 * Préférences synchronisées de l'utilisateur en session, ou `null` — pas de
 * session, pas de ligne, ou synchronisation coupée.
 */
async function readSyncedState(): Promise<PersistedShape | null> {
    const userId = await getSessionUserId();
    if (!userId) return null;
    const row = await prisma.userSettings.findUnique({where: {userId}});
    if (!row?.enabled) return null;
    return (row.data ?? null) as PersistedShape | null;
}

export async function readPreferences(): Promise<ServerPreferences> {
    const cookieState = readCookieState((await cookies()).get(PREFS_COOKIE)?.value);

    // La base prime sur le cookie : c'est tout l'objet de la synchronisation.
    // Une lecture en base ratée ne doit pas emporter la page — on retombe alors
    // sur le cookie, c'est-à-dire sur le comportement d'avant la synchro.
    let synced: PersistedShape | null = null;
    try {
        synced = await readSyncedState();
    } catch {
        synced = null;
    }

    return {...pick(synced ?? cookieState ?? {}), synced: synced ?? undefined};
}
