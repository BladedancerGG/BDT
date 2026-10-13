// Téléchargement du manifeste vers IndexedDB : le gros du travail de
// `ensureManifest` (manifest.ts), à part pour tourner dans un Web Worker
// (manifest.worker.ts) — ou, à défaut, sur le fil principal.
//
// Sans directive : le module est importé par le worker, où « use client » n'a
// aucun sens, comme par manifest.ts.
//
// Pourquoi un worker : l'analyse du JSON et le clonage structuré des
// ~90 000 définitions écrites bloquaient le fil principal jusqu'à 1,4 s d'un
// coup (2 s de tâches longues au total, mesuré dans Chromium) — l'animation de
// chargement se figeait.

import {manifestDb} from "./db";
import {WeightedProgress} from "./progress";
import {MANIFEST_TABLES, MANIFEST_SCHEMA_VERSION} from "./tables";

export interface ManifestMeta {
    version: string;
    // URL du relais serveur, par langue puis par table (voir api/manifest)
    tableUrls: Record<string, Record<string, string>>;
}

/**
 * `done / total` est la part du travail accomplie, pondérée par la durée
 * estimée de chaque table (voir progress.ts) — pas un nombre de tables.
 */
export interface ManifestProgress {
    /** Table en cours */
    table: string;
    done: number;
    total: number;
}

/** Message du fil principal au worker. */
export interface WorkerRequest {
    meta: ManifestMeta;
    language: string;
}

/** Messages du worker au fil principal. */
export type WorkerReply =
    | {type: "progress"; progress: ManifestProgress}
    | {type: "done"}
    | {type: "error"; message: string};

/**
 * Remplace le contenu de la base par le manifeste `meta`, dans la langue
 * demandée. L'appelant a déjà constaté que le cache est périmé.
 */
export async function downloadManifest(
    meta: ManifestMeta,
    language: string,
    onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
    // Télécharger chaque table (fallback anglais si la langue manque)
    const urls = meta.tableUrls[language] ?? meta.tableUrls.en;
    if (!urls) throw new Error(`No manifest path for "${language}"`);

    // Une table demandée que le manifeste ne connaît pas est une erreur de
    // programmation — un nom mal orthographié, en pratique. La passer sous
    // silence est le pire des choix : les lectures renverraient `undefined`
    // pour toujours, et l'interface se contenterait d'afficher du vide, sans
    // le moindre indice. Elle doit donc casser bruyamment — et avant de vider
    // le cache.
    for (const table of MANIFEST_TABLES) {
        if (!urls[table]) {
            throw new Error(
                `Missing manifest table: ${table} (language: "${language}")`,
            );
        }
    }

    // Tous les téléchargements partent d'emblée : sinon chaque table attend
    // l'écriture de la précédente, et les dix-huit allers-retours
    // s'additionnent (0,7 s de perdu avec 40 ms de latence, mesuré). Le
    // navigateur garde les corps en tampon, sous contrôle de flux, jusqu'à
    // leur lecture — elle, séquentielle, pour ne pas analyser plusieurs grosses
    // tables à la fois sur le fil principal.
    const abort = new AbortController();
    const responses = MANIFEST_TABLES.map((table) =>
        fetch(urls[table], {signal: abort.signal}),
    );
    // Un rejet survenant avant qu'on attende la réponse serait signalé comme
    // non géré ; il ressort de toute façon au `await` de sa table.
    responses.forEach((r) => r.catch(() => {}));

    // On vide tout d'un coup, et on oublie la version, dans la même
    // transaction : un chargement interrompu ne doit jamais laisser un cache
    // à moitié rempli passer pour valide. Supprimer table par table coûtait
    // 6 s sur une mise à jour, contre ~1 s pour ce `clear` (mesuré).
    await manifestDb.transaction("rw", manifestDb.definitions, manifestDb.meta, async () => {
        await manifestDb.meta.delete("version");
        await manifestDb.definitions.clear();
    });

    try {
        await storeTables(responses, onProgress);
    } finally {
        // Après un échec, les tables restantes ne serviraient à rien : on coupe
        // leurs téléchargements. Sans effet quand tout est déjà lu.
        abort.abort();
    }

    // Mémoriser version + langue + schéma
    await manifestDb.meta.bulkPut([
        {key: "version", value: meta.version},
        {key: "language", value: language},
        {key: "schema", value: MANIFEST_SCHEMA_VERSION},
    ]);
}


/**
 * Lignes écrites par `bulkPut` : la barre de progression avance à chaque lot.
 * Mesuré sur la table des objets : un lot unique, ou des lots de 2 000 à
 * 10 000, se valent à quelques pourcents près — dans le bruit de la mesure.
 */
const WRITE_BATCH = 5000;

/** Lit les tables dans l'ordre de MANIFEST_TABLES et les écrit en IndexedDB. */
async function storeTables(
    responses: Promise<Response>[],
    onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
    // Les en-têtes de toutes les tables d'abord : il faut leurs tailles pour
    // pondérer la progression. Ce n'est pas une attente de plus — celle de la
    // première table, la plus grosse, est de loin la plus longue.
    const heads = await Promise.all(responses);
    heads.forEach((res, i) => {
        if (!res.ok) throw new Error(`Failed downloading ${MANIFEST_TABLES[i]} manifest table`);
    });
    const progress = new WeightedProgress(
        // Annoncées par le relais (server-cache.ts)
        heads.map((res) => ({
            bytes: Number(res.headers.get("X-Manifest-Size")),
            rows: Number(res.headers.get("X-Manifest-Rows")),
        })),
        (done, total, i) => onProgress?.({table: MANIFEST_TABLES[i], done, total}),
    );

    for (const [i, table] of MANIFEST_TABLES.entries()) {
        // Servie par le relais du serveur, qui la garde en cache, allégée et
        // compressée (lib/manifest/server-cache.ts)
        const json = await readJson(heads[i], (bytes) => progress.received(i, bytes));
        progress.parsed(i);

        const rows = Object.entries(json).map(([hash, data]) => ({
            table,
            hash: Number(hash),
            data,
        }));

        // Une table vide passerait pour un cache valide, et l'interface
        // resterait muette. Aucune des tables demandées ici n'a de raison
        // légitime d'être vide.
        if (rows.length === 0) {
            throw new Error(`Empty manifest table: ${table}`);
        }

        for (let start = 0; start < rows.length; start += WRITE_BATCH) {
            const end = Math.min(start + WRITE_BATCH, rows.length);
            await manifestDb.definitions.bulkPut(rows.slice(start, end));
            progress.written(i, end, rows.length);
        }
    }
}

/**
 * `res.json()`, en signalant les octets reçus au fur et à mesure. Le flux est
 * dédoublé : une branche est comptée, l'autre analysée par le `json()` natif —
 * le reconstituer et l'analyser soi-même coûterait une copie de plus.
 */
async function readJson(
    res: Response,
    onBytes: (bytes: number) => void,
): Promise<Record<string, unknown>> {
    if (!res.body) return res.json();
    const [counted, parsed] = res.body.tee();

    const count = async () => {
        const reader = counted.getReader();
        let bytes = 0;
        for (;;) {
            const {done, value} = await reader.read();
            if (done) return;
            bytes += value.byteLength;
            onBytes(bytes);
        }
    };
    // Ensemble : un échec d'un côté ne doit pas laisser l'autre rejeter sans
    // personne pour l'attendre.
    const [, json] = await Promise.all([count(), new Response(parsed).json()]);
    return json as Record<string, unknown>;
}
