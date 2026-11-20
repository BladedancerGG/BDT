// Journal serveur : la sortie de `console.*`, recopiée dans un fichier JSONL
// tournant, pour la page d'administration des logs.
//
// Serveur uniquement (Node). L'installation se fait dans `instrumentation.ts`.
//
// Un fichier dans un volume plutôt que la base : un log émis par Prisma ou sur
// une base injoignable doit pouvoir s'écrire quand même, et c'est précisément
// le moment où on en a besoin. La sortie standard reste servie telle quelle
// (`docker compose logs`) : la capture s'ajoute, elle ne remplace rien.

import {appendFileSync, mkdirSync, renameSync, statSync} from "node:fs";
import {open, readFile, stat} from "node:fs/promises";
import path from "node:path";
import {format} from "node:util";
import {
    matchesLogFilter,
    parseLogLine,
    type LogEntry,
    type LogFilter,
    type LogLevel,
} from "./log-types";

/** Monté en volume (docker-compose*.yml) : le journal survit aux redéploiements. */
export const LOG_DIR = process.env.LOG_DIR || "/var/log/bdt";
const LOG_FILE = path.join(LOG_DIR, "server.log");

/**
 * Taille d'un fichier avant rotation, et nombre d'anciens fichiers gardés :
 * 10 × 10 Mo au plus. Une recherche relit tout, ce plafond borne donc aussi son
 * coût — et « tous les logs » veut dire « tout ce qui est encore gardé ».
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROTATED = 9;

/** Un message plus long est tronqué : un objet de profil entier noierait le fichier. */
const MAX_MESSAGE = 20_000;

/** Fichiers du plus récent au plus ancien : server.log, server.log.1, … */
function logFiles(): string[] {
    return [LOG_FILE, ...Array.from({length: MAX_ROTATED}, (_, i) => `${LOG_FILE}.${i + 1}`)];
}

// —— Écriture ————————————————————————————————————————————————

function rotate(): void {
    // Du plus ancien au plus récent : chaque renommage libère la place du suivant.
    for (let i = MAX_ROTATED - 1; i >= 1; i -= 1) {
        try {
            renameSync(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`);
        } catch {
            // Fichier absent : rien à décaler
        }
    }
    try {
        renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {
        // Déjà renommé par un autre processus
    }
}

let size = -1;

function write(entry: LogEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    if (size < 0) {
        try {
            size = statSync(LOG_FILE).size;
        } catch {
            size = 0;
        }
    }
    // Synchrone : l'ordre des lignes est celui des appels, et une erreur
    // fatale qui suit immédiatement son log ne le perd pas.
    appendFileSync(LOG_FILE, line);
    size += Buffer.byteLength(line);
    if (size > MAX_FILE_BYTES) {
        // Un autre processus a pu tourner le fichier entre-temps : on relit.
        try {
            if (statSync(LOG_FILE).size > MAX_FILE_BYTES) rotate();
        } catch {
            // Fichier déjà déplacé
        }
        size = -1;
    }
}

const CAPTURED = ["debug", "info", "log", "warn", "error"] as const satisfies readonly LogLevel[];

/**
 * Recopie `console.*` dans le fichier.
 *
 * Idempotent : le drapeau vit sur globalThis, `register()` pouvant être appelé
 * à nouveau par un rechargement — une double installation doublerait chaque
 * ligne.
 */
export function installConsoleCapture(): void {
    const flags = globalThis as unknown as {__bdtConsoleCapture?: boolean};
    if (flags.__bdtConsoleCapture) return;
    flags.__bdtConsoleCapture = true;

    try {
        mkdirSync(LOG_DIR, {recursive: true});
        appendFileSync(LOG_FILE, "");
    } catch (err) {
        // Volume absent ou non inscriptible : l'application doit démarrer
        // quand même, la page des logs restera simplement vide.
        console.warn(`[logs] journal désactivé, ${LOG_DIR} n'est pas inscriptible :`, err);
        return;
    }

    for (const level of CAPTURED) {
        const original = console[level].bind(console);
        let failing = false;
        console[level] = (...args: unknown[]) => {
            original(...args);
            // Un échec d'écriture ne doit ni casser l'appelant, ni boucler en
            // se signalant lui-même à l'infini.
            if (failing) return;
            try {
                write({t: new Date().toISOString(), l: level, m: format(...args).slice(0, MAX_MESSAGE)});
            } catch (err) {
                failing = true;
                original("[logs] écriture impossible, capture suspendue :", err);
            }
        };
    }
}

// —— Lecture ————————————————————————————————————————————————

/** Plafond de lignes rendues par une recherche */
export const SEARCH_LIMIT = 1000;

export interface LogSearchResult {
    /** Du plus ancien au plus récent, comme à l'écran */
    entries: LogEntry[];
    /** D'autres lignes correspondaient, au-delà du plafond */
    truncated: boolean;
}

/**
 * Les lignes les plus récentes qui correspondent au filtre, tous fichiers
 * confondus.
 *
 * Lecture du plus récent au plus ancien, arrêtée dès le plafond atteint : la
 * recherche courante (les dernières lignes, sans filtre) ne lit qu'un fichier.
 */
export async function searchLogs(filter: LogFilter, limit = SEARCH_LIMIT): Promise<LogSearchResult> {
    const found: LogEntry[] = [];
    for (const file of logFiles()) {
        let text: string;
        try {
            text = await readFile(file, "utf8");
        } catch {
            continue;
        }
        const lines = text.split("\n");
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const entry = parseLogLine(lines[i]);
            if (!entry || !matchesLogFilter(entry, filter)) continue;
            if (found.length === limit) return {entries: found.reverse(), truncated: true};
            found.push(entry);
        }
    }
    return {entries: found.reverse(), truncated: false};
}

/**
 * Suit le fichier courant et rend chaque nouvelle ligne.
 *
 * Par scrutation et non par `fs.watch` : inotify ne traverse pas toujours les
 * volumes Docker (WSL notamment). Et par le fichier plutôt que par un émetteur
 * en mémoire : en développement, la capture et la route qui lit ne sont pas
 * forcément dans le même processus.
 *
 * Rend la fonction d'arrêt.
 */
export async function followLogs(onEntry: (entry: LogEntry) => void, intervalMs = 1000): Promise<() => void> {
    let offset = 0;
    try {
        offset = (await stat(LOG_FILE)).size;
    } catch {
        // Pas encore de fichier : on lira depuis le début
    }
    let remainder = "";
    let busy = false;

    const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
            const {size} = await stat(LOG_FILE);
            // Plus court qu'à la dernière lecture : le fichier a tourné.
            if (size < offset) {
                offset = 0;
                remainder = "";
            }
            if (size === offset) return;

            const handle = await open(LOG_FILE, "r");
            try {
                const buffer = Buffer.alloc(size - offset);
                await handle.read(buffer, 0, buffer.length, offset);
                offset = size;
                const lines = (remainder + buffer.toString("utf8")).split("\n");
                // La dernière ligne peut être incomplète : gardée pour la suite.
                remainder = lines.pop() ?? "";
                for (const line of lines) {
                    const entry = parseLogLine(line);
                    if (entry) onEntry(entry);
                }
            } finally {
                await handle.close();
            }
        } catch {
            // Fichier momentanément absent (rotation) : prochain tour
        } finally {
            busy = false;
        }
    }, intervalMs);

    return () => clearInterval(timer);
}
