// Forme d'une ligne du journal serveur, partagée par l'écriture (serveur), la
// route de recherche et la page qui l'affiche.
//
// Pas de directive ni d'import Node : le composant client de la page lit ce
// module, et une constante exportée depuis un module "use client" arriverait
// `undefined` côté serveur (voir lib/settings/constants.ts).

/** Niveaux capturés, du plus bavard au plus grave. Tous sont lus dans `admin.logs.levels` (messages). */
export const LOG_LEVELS = ["debug", "info", "log", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Une ligne du fichier (JSONL). Clés d'une lettre : le fichier est relu
 * entièrement à chaque recherche.
 */
export interface LogEntry {
    /** Date ISO */
    t: string;
    l: LogLevel;
    /** Message formaté comme la console l'aurait imprimé */
    m: string;
}

export function isLogLevel(raw: unknown): raw is LogLevel {
    return typeof raw === "string" && (LOG_LEVELS as readonly string[]).includes(raw);
}

/** Une ligne lue du fichier, ou null si elle est illisible (écriture coupée). */
export function parseLogLine(line: string): LogEntry | null {
    if (!line) return null;
    try {
        const raw = JSON.parse(line) as Partial<LogEntry>;
        if (typeof raw.t !== "string" || typeof raw.m !== "string" || !isLogLevel(raw.l)) {
            return null;
        }
        return {t: raw.t, l: raw.l, m: raw.m};
    } catch {
        return null;
    }
}

/** Le filtre d'une recherche, appliqué aussi aux lignes reçues en direct. */
export interface LogFilter {
    /** Sous-chaîne cherchée dans le message, sans tenir compte de la casse */
    query: string;
    /** Niveau minimal ; absent, tous */
    level?: LogLevel;
}

export function matchesLogFilter(entry: LogEntry, {query, level}: LogFilter): boolean {
    if (level && LOG_LEVELS.indexOf(entry.l) < LOG_LEVELS.indexOf(level)) return false;
    if (!query) return true;
    return entry.m.toLowerCase().includes(query.toLowerCase());
}
