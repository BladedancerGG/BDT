// Sauvegarde lisible : préférences et groupes d'équipements dans un fichier
// JSON, à exporter et à réimporter.
//
// Un module **pur**, comme `sort.ts` : il fabrique la sauvegarde et relit celle
// qu'on lui donne, sans rien connaître de React, du store ni du réseau. Pas de
// directive "use client" — c'est ce qui le rend vérifiable
// (`scripts/checks/backup.check.ts`).

// Chemin relatif et non `@/…` : c'est un import de **valeur**, et l'alias ne
// survit pas à la compilation hors du bundler — `node` chercherait alors un
// module nommé « @/lib/… ». Les alias ne conviennent ici qu'aux `import type`,
// que la compilation efface. Même convention que `edit.ts`.
import {isLoadoutGroupArray, type LoadoutGroup} from "../loadouts/groups/types";
import type {PersistedSettings} from "./store";

/**
 * Version du format.
 *
 * Écrite dans le fichier pour qu'une sauvegarde d'aujourd'hui reste
 * identifiable demain. La relecture ne l'exige pas : elle accepte tout ce
 * qu'elle sait lire, champ par champ — refuser un fichier entier sur un numéro
 * serait le pire service à rendre à qui vient de tout perdre.
 */
export const BACKUP_VERSION = 1;

/** Ce que porte le fichier. Les deux parties sont indépendantes. */
export interface Backup {
    version: number;
    /** Date de l'export, en ISO — informative, jamais relue */
    exportedAt: string;
    settings?: PersistedSettings;
    groups?: LoadoutGroup[];
}

/** Ce qu'une relecture a effectivement trouvé. */
export interface BackupContents {
    settings?: PersistedSettings;
    groups?: LoadoutGroup[];
}

/** Pourquoi un fichier est refusé. */
export type BackupFailure =
    /** Pas du JSON, ou pas un objet */
    | "unreadable"
    /** Lisible, mais ne contient ni préférences ni groupes */
    | "empty"
    /** Des groupes sont là, mais mal formés — voir `isLoadoutGroupArray` */
    | "badGroups";

export type BackupResult =
    | {ok: true; contents: BackupContents}
    | {ok: false; failure: BackupFailure};

/**
 * La sauvegarde à écrire dans le fichier.
 *
 * Les préférences partent sous leur forme **persistée**, celle du cookie et de
 * la base : le même format se relit des trois côtés, et `mergeSettings` sait
 * déjà en écarter ce qu'il ne connaît pas.
 */
export function buildBackup(
    settings: PersistedSettings,
    groups: readonly LoadoutGroup[],
    now: Date,
): Backup {
    return {
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        settings,
        groups: [...groups],
    };
}

/** Nom du fichier proposé au téléchargement : daté, donc triable. */
export function backupFileName(now: Date): string {
    // `toISOString` puis découpe plutôt qu'un formatage local : un nom de
    // fichier n'a pas à dépendre du fuseau de celui qui l'ouvre, et les deux
    // points de l'heure ISO ne passent pas sur tous les systèmes.
    const [date, time] = now.toISOString().split("T");
    return `bdt-sauvegarde-${date}-${time.slice(0, 8).replace(/:/g, "")}.json`;
}

/**
 * Relit un fichier de sauvegarde.
 *
 * **Chaque partie est relue pour elle-même**, et c'est le point important : un
 * fichier n'ayant que des groupes est parfaitement valide, comme un fichier
 * n'ayant que des préférences. Refuser l'un parce que l'autre manque aurait
 * rendu l'import inutilisable dès qu'on exporte depuis un compte sans groupes.
 *
 * Les préférences ne sont pas validées champ par champ — `mergeSettings` est
 * déjà tolérant, il relit ce qu'il reconnaît et laisse le reste aux valeurs par
 * défaut. Les groupes, eux, le sont : un groupe illisible ne se dégrade pas, il
 * s'équipe (même raisonnement que `/api/loadout-groups`).
 */
export function readBackup(raw: string): BackupResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {ok: false, failure: "unreadable"};
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {ok: false, failure: "unreadable"};
    }

    const body = parsed as Record<string, unknown>;
    const contents: BackupContents = {};

    if (
        typeof body.settings === "object" &&
        body.settings !== null &&
        !Array.isArray(body.settings)
    ) {
        contents.settings = body.settings as PersistedSettings;
    }

    if (body.groups !== undefined) {
        if (!isLoadoutGroupArray(body.groups)) {
            return {ok: false, failure: "badGroups"};
        }
        contents.groups = body.groups;
    }

    if (contents.settings === undefined && contents.groups === undefined) {
        return {ok: false, failure: "empty"};
    }

    return {ok: true, contents};
}
