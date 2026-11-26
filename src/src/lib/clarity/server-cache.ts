// Relais des descriptions de Clarity : le serveur télécharge le fichier publié
// sur GitHub, l'allège (format.ts), le précompresse et le dépose dans le cache
// du manifeste, d'où Caddy le sert tel quel.
//
// Module serveur uniquement (node:fs, node:zlib) — volontairement sans
// directive, et jamais importé depuis un composant client.
//
// Pourquoi relayer plutôt que laisser le navigateur lire GitHub : le fichier
// brut pèse 2 Mo (raw.githubusercontent.com le sert en gzip, sans cache
// au-delà de cinq minutes), et Clarity demande à ceux qui en gardent une copie
// de suivre son `versions.json`. Une seule copie, tenue à jour ici, sert tous
// les clients — avec une URL immuable, gardée un an par les navigateurs.

import {mkdir, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import zlib from "node:zlib";
import {CACHE_DIR, CLARITY_CACHE_ENTRY, TABLE_FILES_PREFIX} from "@/lib/manifest/server-cache";
import {CLARITY_FORMAT, clarityVersion, slimClarity} from "./format";

const brotli = promisify(zlib.brotliCompress);

/** Branche `live` : celle que Clarity désigne à ses partenaires. */
const SOURCE = "https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live";

/**
 * Âge au-delà duquel `versions.json` est relu. Clarity publie quelques fois
 * par semaine ; dix minutes de retard sont sans conséquence, et chaque client
 * qui ouvre l'app demande l'adresse du fichier.
 */
const VERSION_TTL_MS = 10 * 60_000;

const FETCH_TIMEOUT_MS = 60_000;

const ROOT = path.join(CACHE_DIR, CLARITY_CACHE_ENTRY);
const FORMAT = String(CLARITY_FORMAT);
const FILE_NAME = "descriptions.json";

let versionCache: {version: string; at: number} | null = null;
let versionInFlight: Promise<string> | null = null;

/** Téléchargements en cours, par version : un seul pour dix clients pressés. */
const inFlight = new Map<string, Promise<void>>();

function fileOf(version: string): string {
    return path.join(ROOT, version, FORMAT, `${FILE_NAME}.br`);
}

/** Même arborescence que le cache, sous la route Caddy des tables, sans `.br`. */
function urlOf(version: string): string {
    return `${TABLE_FILES_PREFIX}/${CLARITY_CACHE_ENTRY}/${version}/${FORMAT}/${FILE_NAME}`;
}

async function exists(file: string): Promise<boolean> {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Clarity ${res.status} on ${url}`);
    return res.json();
}

/**
 * Version publiée par Clarity. Une version connue est renvoyée tout de suite,
 * relue en arrière-plan une fois périmée — comme celle du manifeste : GitHub
 * n'a pas à retarder l'ouverture d'une infobulle.
 */
async function getVersion(): Promise<string> {
    if (versionCache) {
        if (Date.now() - versionCache.at >= VERSION_TTL_MS) {
            refreshVersion().catch((err) => {
                console.error("[clarity] relecture de la version:", err);
            });
        }
        return versionCache.version;
    }
    return refreshVersion();
}

function refreshVersion(): Promise<string> {
    versionInFlight ??= fetchJson(`${SOURCE}/versions.json`)
        .then((raw) => {
            const version = clarityVersion(raw);
            if (!version) throw new Error("[clarity] versions.json illisible");
            versionCache = {version, at: Date.now()};
            return version;
        })
        .finally(() => {
            versionInFlight = null;
        });
    return versionInFlight;
}

/** Garantit le fichier d'une version, puis purge les autres. */
function ensureFile(version: string): Promise<void> {
    let pending = inFlight.get(version);
    if (!pending) {
        pending = (async () => {
            if (!(await exists(fileOf(version)))) await download(version);
            await purgeExcept(version);
        })().finally(() => inFlight.delete(version));
        inFlight.set(version, pending);
    }
    return pending;
}

async function download(version: string): Promise<void> {
    const descriptions = slimClarity(await fetchJson(`${SOURCE}/descriptions/clarity.json`));
    // Un fichier vide passerait pour une copie valide, et l'URL est immuable :
    // les navigateurs le garderaient un an.
    if (Object.keys(descriptions).length === 0) {
        throw new Error("[clarity] aucune description dans clarity.json");
    }
    const compressed = await brotli(JSON.stringify(descriptions), {
        params: {
            // ~2 Mo de texte : le niveau maximal ne coûte qu'une poignée de
            // secondes, une fois par version.
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
    });

    const file = fileOf(version);
    await mkdir(path.dirname(file), {recursive: true});
    // Fichier temporaire puis renommage : un fichier à moitié écrit ne doit
    // jamais être servi.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(tmp, compressed);
        await rename(tmp, file);
    } catch (err) {
        await rm(tmp, {force: true});
        throw err;
    }
}

/**
 * Supprime les autres versions et formats. Un client en train de lire
 * l'ancien fichier obtient un 404 et se passera de descriptions jusqu'au
 * prochain chargement : rien ne casse.
 */
async function purgeExcept(version: string): Promise<void> {
    for (const entry of await readdir(ROOT)) {
        if (entry !== version) await rm(path.join(ROOT, entry), {recursive: true, force: true});
    }
    const versionDir = path.join(ROOT, version);
    for (const entry of await readdir(versionDir)) {
        if (entry !== FORMAT) await rm(path.join(versionDir, entry), {recursive: true, force: true});
    }
}

/** Version la plus récente déjà sur disque, au format courant. */
async function latestOnDisk(): Promise<string | null> {
    let entries: string[];
    try {
        entries = await readdir(ROOT);
    } catch {
        return null;
    }
    const versions = entries
        .filter((entry) => /^\d[\d.]*$/.test(entry))
        .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
        if (await exists(fileOf(version))) return version;
    }
    return null;
}

/**
 * Adresse du fichier des descriptions, à jour avec Clarity.
 *
 * GitHub injoignable, la dernière copie sur disque fait l'affaire : des
 * descriptions un peu datées valent mieux qu'aucune. Null s'il n'y en a pas.
 */
export async function getClarityUrl(): Promise<string | null> {
    try {
        const version = await getVersion();
        await ensureFile(version);
        return urlOf(version);
    } catch (err) {
        console.error("[clarity] mise à jour:", err);
        const local = await latestOnDisk();
        return local ? urlOf(local) : null;
    }
}
