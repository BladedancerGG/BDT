// Relais du manifeste : le serveur télécharge une fois chaque table chez
// Bungie, l'allège (projection.ts), la garde sur disque (volume Docker) et la
// sert à tous les clients.
//
// Module serveur uniquement (node:fs, node:zlib) — volontairement sans
// directive, et jamais importé depuis un composant client.
//
// Pourquoi précompresser en Brotli plutôt que relayer le gzip de Bungie :
// mesuré sur DestinyInventoryItemDefinition (201 Mo de JSON brut), le gzip de
// bungie.net pèse 8,5 Mo, Brotli niveau 9 3,6 Mo en ~2 s. Le niveau 11 ne
// gagne que 0,3 Mo de plus pour ~55 s de calcul : pas rentable.

import {createReadStream, createWriteStream} from "node:fs";
import {mkdir, readFile, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import zlib from "node:zlib";
import {bungieFetch} from "@/lib/bungie/client";
import {trackBungieCall, type CallTracker} from "@/lib/bungie/call-log";
import {locales} from "@/i18n/routing";
import {JsonEntrySplitter} from "./json-entries";
import {MANIFEST_PROJECTION, project} from "./projection";
import {MANIFEST_SCHEMA_VERSION, MANIFEST_TABLES, type ManifestTable} from "./tables";

const BUNGIE_ROOT = "https://www.bungie.net";

/** Racine du cache — un volume nommé en Docker (voir docker-compose*.yml). */
export const CACHE_DIR = process.env.MANIFEST_CACHE_DIR || "/var/cache/manifest";

/**
 * Sous-dossier du cache où vivent les descriptions de Clarity
 * (lib/clarity/server-cache.ts). Il partage le volume — et donc la route Caddy —
 * des tables, mais pas leur cycle de vie : la purge des anciennes versions du
 * manifeste doit l'épargner. Aucune version de Bungie ne peut porter ce nom,
 * elles commencent toutes par un chiffre (`VERSION_RE`).
 */
export const CLARITY_CACHE_ENTRY = "clarity";

/**
 * Âge au-delà duquel la version lue chez Bungie est relue. Chaque chargement de
 * page appelait l'API Bungie (plusieurs centaines de ms) pour une version qui
 * ne change qu'aux mises à jour du jeu ; une minute de retard sur la détection
 * d'un patch est sans conséquence.
 */
const META_TTL_MS = 60_000;

/** Un téléchargement de la plus grosse table dépasse largement les 15 s de bungieFetch. */
const TABLE_TIMEOUT_MS = 5 * 60_000;

interface DestinyManifest {
    version: string;
    // { fr: { DestinyInventoryItemDefinition: "/common/...json", ... }, ... }
    jsonWorldComponentContentPaths: Record<string, Record<string, string>>;
}

interface Meta {
    version: string;
    paths: Record<string, Record<string, string>>;
}

let metaCache: {meta: Meta; at: number} | null = null;
let metaInFlight: Promise<Meta> | null = null;

/** Téléchargements en cours, par fichier : dix clients arrivant juste après un
 * patch ne doivent déclencher qu'un seul téléchargement de chaque table. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Taille du JSON **décompressé** d'une table et nombre de ses lignes. Le client
 * en tire le poids de chaque table dans sa barre de progression (réponse de la
 * route de la table, voir lib/manifest/progress.ts) :
 * - il compte les octets reçus une fois décompressés, que `Content-Length` —
 *   la taille Brotli — ne permet pas de rapporter à un total ;
 * - l'écriture en IndexedDB coûte surtout par ligne : la table des icônes,
 *   7 Mo seulement mais 26 645 lignes, prend 930 ms à écrire (mesuré).
 */
export interface TableStats {
    bytes: number;
    rows: number;
}

/** Statistiques par fichier, en mémoire ; sur disque, dans `<fichier>.stats.json`. */
const tableStats = new Map<string, Promise<TableStats>>();

/** Version de manifeste dont le préchargement a déjà été lancé. */
let warmedVersion: string | null = null;

/** Sous-dossier du schéma courant : une projection modifiée, c'est un autre
 * dossier, et les fichiers de l'ancienne ne sont jamais resservis. */
const SCHEMA = MANIFEST_SCHEMA_VERSION;

/**
 * Version et chemins bungie.net du manifeste courant.
 *
 * Une version périmée est renvoyée **tout de suite**, la relecture se faisant
 * en arrière-plan : tout chargement de page attend cette réponse, cache client
 * à jour ou non, et l'API Bungie met parfois plus de 15 s à répondre (relevé
 * pendant les mesures, avec nouvelles tentatives). Seul le tout premier appel
 * après un démarrage attend Bungie.
 */
export async function getManifestMeta(): Promise<Meta> {
    if (metaCache) {
        if (Date.now() - metaCache.at >= META_TTL_MS) {
            refreshMeta().catch((err) => {
                // On garde la version connue ; la prochaine requête retentera.
                console.error("[manifest] relecture de la version:", err);
            });
        }
        return metaCache.meta;
    }
    return refreshMeta();
}

function refreshMeta(): Promise<Meta> {
    metaInFlight ??= bungieFetch<DestinyManifest>("/Destiny2/Manifest/")
        .then((m) => {
            const meta = {version: m.version, paths: m.jsonWorldComponentContentPaths};
            metaCache = {meta, at: Date.now()};
            onVersionSeen(meta);
            return meta;
        })
        .finally(() => {
            metaInFlight = null;
        });
    return metaInFlight;
}

// Le numéro de version de Bungie ressemble à « 244213.26.06.29.2000-1-bnet.65864 ».
// Il entre dans un chemin de fichier : on n'accepte que ce jeu de caractères,
// et l'exigence d'un chiffre en tête écarte « . » et « .. ».
const VERSION_RE = /^[0-9][\w.-]*$/;
// Codes de langue Bungie : « fr », « es-mx », « zh-chs »…
const LANGUAGE_RE = /^[a-z]{2}(-[a-z]+)?$/;

export function isValidKey(
    version: string,
    schema: string,
    language: string,
    table: string,
): table is ManifestTable {
    // Un autre schéma vient d'un client d'une version antérieure de l'app : le
    // serveur ne sait produire que le sien.
    return (
        schema === SCHEMA &&
        VERSION_RE.test(version) &&
        LANGUAGE_RE.test(language) &&
        (MANIFEST_TABLES as readonly string[]).includes(table)
    );
}

function tableFile(version: string, language: string, table: string): string {
    return path.join(CACHE_DIR, version, SCHEMA, language, `${table}.json.br`);
}

/**
 * Préfixe sous lequel Caddy sert le cache tel quel (Caddyfile, Caddyfile.prod),
 * volume monté en lecture seule.
 *
 * Les tables ne passent plus par Next : depuis 16.4.6, il retire le
 * `Content-Encoding` de toute réponse de route (`FORBIDDEN_HEADERS`, dans
 * next/dist/server/send-response.js), si bien qu'un fichier précompressé en
 * Brotli arrivait au client comme du JSON illisible. Caddy, avec
 * `file_server { precompressed br }`, sert `<table>.json.br` à qui demande
 * `<table>.json` et pose l'en-tête lui-même.
 */
export const TABLE_FILES_PREFIX = "/manifest-files";

/** URL publique d'une table, servie par Caddy : même arborescence que le cache, sans `.br`. */
export function tableFileUrl(version: string, language: string, table: ManifestTable): string {
    return `${TABLE_FILES_PREFIX}/${encodeURIComponent(version)}/${SCHEMA}/${language}/${table}.json`;
}

async function exists(file: string): Promise<boolean> {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

/**
 * Chemin du fichier Brotli d'une table, téléchargé au besoin.
 *
 * Un fichier déjà présent est servi quelle que soit sa version : il est
 * immuable. En revanche, on ne télécharge que pour la version **courante** —
 * sinon n'importe quelle URL forgée remplirait le disque — et le chemin
 * bungie.net vient toujours du manifeste, jamais de la requête.
 *
 * Renvoie null si la table n'existe pas (version périmée, langue inconnue).
 */
export async function getTableFile(
    version: string,
    language: string,
    table: ManifestTable,
): Promise<string | null> {
    const file = tableFile(version, language, table);
    if (await exists(file)) return file;

    const meta = await getManifestMeta();
    if (meta.version !== version) return null;
    const source = meta.paths[language]?.[table];
    if (!source) return null;

    let pending = inFlight.get(file);
    if (!pending) {
        pending = download(source, table, file).finally(() => inFlight.delete(file));
        inFlight.set(file, pending);
    }
    return pending;
}

async function download(source: string, table: ManifestTable, file: string): Promise<string> {
    await mkdir(path.dirname(file), {recursive: true});

    // Hors de bungieFetch (ce n'est pas l'API mais un fichier statique) :
    // suivi à la main. L'appel est réputé terminé quand le fichier l'est,
    // le corps arrivant en flux pendant toute la conversion.
    const call = trackBungieCall({method: "GET", path: source});
    try {
        await fetchTable(source, table, file, call);
        call.succeed();
    } catch (err) {
        call.fail(err);
        throw err;
    }
    return file;
}

async function fetchTable(
    source: string,
    table: ManifestTable,
    file: string,
    call: CallTracker,
): Promise<void> {
    call.attempt();
    const res = await fetch(`${BUNGIE_ROOT}${source}`, {
        signal: AbortSignal.timeout(TABLE_TIMEOUT_MS),
    });
    call.response(res.status);
    if (!res.ok || !res.body) {
        throw new Error(`Bungie ${res.status} on ${source}`);
    }

    // Écriture dans un fichier temporaire puis renommage (atomique sur un même
    // volume) : un fichier à moitié écrit ne doit jamais être servi, ni pris
    // pour un cache valide après un arrêt brutal.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const stats: TableStats = {bytes: 0, rows: 0};
    async function* counted(source: AsyncIterable<string>): AsyncGenerator<string> {
        for await (const text of source) {
            stats.bytes += Buffer.byteLength(text);
            yield text;
        }
    }
    try {
        await pipeline(
            Readable.from(
                counted(
                    projectTable(
                        Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
                        table,
                        stats,
                    ),
                ),
            ),
            zlib.createBrotliCompress({
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
                    // Fenêtre maximale : les définitions se répètent à grande
                    // distance dans ces fichiers de centaines de Mo.
                    [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
                    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                },
            }),
            createWriteStream(tmp),
        );
        // Les statistiques d'abord : une table présente sans elles serait
        // simplement remesurée, l'inverse ne doit pas arriver.
        await writeStats(file, stats);
        await rename(tmp, file);
        tableStats.set(file, Promise.resolve(stats));
    } catch (err) {
        await rm(tmp, {force: true});
        throw err;
    }
}

/**
 * Projette une table entrée par entrée, sans jamais l'analyser en entier : un
 * `JSON.parse` de DestinyInventoryItemDefinition (201 Mo) monte à 1,1 Go de
 * mémoire au pic. Ici, elle reste à la taille d'une définition.
 *
 * `body` est du JSON brut : fetch a déjà décompressé le gzip de bungie.net.
 */
async function* projectTable(
    body: AsyncIterable<Uint8Array>,
    table: ManifestTable,
    stats: TableStats,
): AsyncGenerator<string> {
    const spec = MANIFEST_PROJECTION[table];
    const splitter = new JsonEntrySplitter();
    // `stream: true` : un caractère multi-octets (« é ») peut être coupé entre
    // deux morceaux du flux.
    const decoder = new TextDecoder();
    let count = 0;

    const serialize = (entries: string[]): string => {
        let out = "";
        for (const entry of entries) {
            // Une entrée isolée : `"<hash>": {...}`
            const parsed = JSON.parse(`{${entry}}`) as Record<string, unknown>;
            for (const [hash, def] of Object.entries(parsed)) {
                out += `${count === 0 ? "{" : ","}${JSON.stringify(hash)}:${JSON.stringify(project(def, spec))}`;
                count += 1;
            }
        }
        return out;
    };

    for await (const chunk of body) {
        const out = serialize(splitter.push(decoder.decode(chunk, {stream: true})));
        if (out) yield out;
    }
    const tail = serialize(splitter.push(decoder.decode()));
    if (tail) yield tail;
    splitter.end();

    // Même règle que côté client : une table vide passerait pour un cache valide.
    if (count === 0) throw new Error(`Empty manifest table: ${table}`);
    stats.rows = count;
    yield "}";
}

/**
 * À la première rencontre d'une version : supprime les autres versions du
 * disque (et, dans la version courante, les autres schémas), puis précharge
 * les tables des langues de l'app, pour que le premier visiteur après un patch
 * n'ait pas à attendre le téléchargement chez Bungie.
 *
 * La purge peut couper un client en train de télécharger l'ancienne version ;
 * il obtient un 404, échoue, et repart sur la nouvelle au rechargement.
 */
function onVersionSeen(meta: Meta) {
    if (warmedVersion === meta.version) return;
    warmedVersion = meta.version;

    void (async () => {
        try {
            await mkdir(CACHE_DIR, {recursive: true});
            for (const entry of await readdir(CACHE_DIR)) {
                if (entry !== meta.version && entry !== CLARITY_CACHE_ENTRY) {
                    await rm(path.join(CACHE_DIR, entry), {recursive: true, force: true});
                }
            }
            const versionDir = path.join(CACHE_DIR, meta.version);
            await mkdir(versionDir, {recursive: true});
            for (const entry of await readdir(versionDir)) {
                if (entry !== SCHEMA) {
                    await rm(path.join(versionDir, entry), {recursive: true, force: true});
                }
            }
            tableStats.clear();
            // Séquentiel : en parallèle, le CPU de la compression et la
            // mémoire des flux se cumuleraient pour un gain nul.
            for (const language of locales) {
                for (const table of MANIFEST_TABLES) {
                    const file = await getTableFile(meta.version, language, table);
                    // Charge en mémoire les statistiques des fichiers déjà là,
                    // plutôt qu'à la première requête d'un client.
                    if (file) await getTableStats(file);
                }
            }
        } catch (err) {
            // Le préchargement n'est qu'une optimisation : la requête d'un
            // client retentera la table manquante.
            console.error("[manifest] préchargement:", err);
        }
    })();
}

/** Statistiques d'un fichier du cache : en mémoire, sur disque, ou mesurées. */
export function getTableStats(file: string): Promise<TableStats> {
    let stats = tableStats.get(file);
    if (!stats) {
        stats = readStats(file);
        tableStats.set(file, stats);
        // Un échec (fichier purgé entre-temps) ne doit pas rester en mémoire
        stats.catch(() => tableStats.delete(file));
    }
    return stats;
}

const statsFile = (file: string) => `${file}.stats.json`;

async function writeStats(file: string, stats: TableStats): Promise<void> {
    const tmp = `${statsFile(file)}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(stats));
    await rename(tmp, statsFile(file));
}

async function readStats(file: string): Promise<TableStats> {
    try {
        const stats = JSON.parse(await readFile(statsFile(file), "utf8")) as TableStats;
        if (stats.bytes > 0 && stats.rows > 0) return stats;
    } catch {
        // Absent : fichier écrit avant que les statistiques existent
    }
    const measured = await measureStats(file);
    await writeStats(file, measured);
    return measured;
}

/** Décompresse et découpe sans rien garder : ~1 s pour la table des objets. */
async function measureStats(file: string): Promise<TableStats> {
    const splitter = new JsonEntrySplitter();
    const decoder = new TextDecoder();
    const stats: TableStats = {bytes: 0, rows: 0};
    for await (const chunk of openTable(file)) {
        stats.bytes += (chunk as Buffer).length;
        stats.rows += splitter.push(decoder.decode(chunk as Buffer, {stream: true})).length;
    }
    stats.rows += splitter.push(decoder.decode()).length;
    splitter.end();
    return stats;
}

/** Contenu décompressé d'un fichier du cache, pour en mesurer les statistiques. */
function openTable(file: string): Readable {
    const stream = createReadStream(file);
    // `pipe` ne propage pas les erreurs de la source : sans ce relais, un
    // fichier purgé en cours de lecture laisserait la réponse pendante.
    const out = zlib.createBrotliDecompress();
    stream.on("error", (err) => out.destroy(err));
    return stream.pipe(out);
}
