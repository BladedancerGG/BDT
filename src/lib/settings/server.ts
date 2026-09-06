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
    loadoutIconSize?: number;
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
    loadoutIconSize?: number;
    /**
     * État déposé en base, quand la synchronisation est active. C'est lui qui
     * a servi à rendre le HTML ci-dessus : le client doit s'y ranger, son
     * cookie pouvant dater d'un autre appareil.
     */
    synced?: unknown;
    /**
     * Drapeau de synchronisation du compte, ou `undefined` hors session.
     *
     * Il descend séparément de `synced` : un compte tout neuf synchronise
     * (défaut de `User.syncEnabled`) sans avoir encore rien déposé, et le
     * cookie de cet appareil dit encore le contraire. C'est la base qui
     * tranche — sans quoi la synchronisation ne s'allumerait jamais d'elle-même
     * pour un nouvel utilisateur.
     */
    syncEnabled?: boolean;
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
        loadoutIconSize: readIconSize(state.loadoutIconSize),
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

/** Drapeau de synchronisation et état déposé, pour l'utilisateur en session. */
interface SyncedAccount {
    enabled: boolean;
    /** État déposé, ou `null` : synchronisation coupée, ou rien encore déposé. */
    state: PersistedShape | null;
}

/**
 * Ce que la base sait du compte en session, ou `null` hors session.
 *
 * Une seule requête pour les deux : le drapeau est sur `User`, l'état sur
 * `UserSettings`, et la page a besoin des deux à chaque rendu.
 */
async function readSyncedAccount(): Promise<SyncedAccount | null> {
    const userId = await getSessionUserId();
    if (!userId) return null;
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {syncEnabled: true, settings: {select: {data: true}}},
    });
    if (!user) return null;
    return {
        enabled: user.syncEnabled,
        state: user.syncEnabled
            ? ((user.settings?.data ?? null) as PersistedShape | null)
            : null,
    };
}

export async function readPreferences(): Promise<ServerPreferences> {
    const cookieState = readCookieState((await cookies()).get(PREFS_COOKIE)?.value);

    // La base prime sur le cookie : c'est tout l'objet de la synchronisation.
    // Une lecture en base ratée ne doit pas emporter la page — on retombe alors
    // sur le cookie, c'est-à-dire sur le comportement d'avant la synchro.
    let account: SyncedAccount | null = null;
    try {
        account = await readSyncedAccount();
    } catch (error) {
        // Journalisé, et non avalé : la page survit, mais l'échec se traduit
        // par une synchronisation qui paraît coupée alors qu'elle est active en
        // base — un symptôme muet, impossible à rattacher à sa cause sans ceci.
        console.error("[préférences] lecture du compte impossible :", error);
        account = null;
    }

    const synced = account?.state ?? null;
    return {
        ...pick(synced ?? cookieState ?? {}),
        synced: synced ?? undefined,
        syncEnabled: account?.enabled,
    };
}
