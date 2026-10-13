"use client";

import {manifestDb} from "./db";
import {
    downloadManifest,
    type ManifestMeta,
    type ManifestProgress,
    type WorkerReply,
    type WorkerRequest,
} from "./load";
import {MANIFEST_SCHEMA_VERSION} from "./tables";

export type {ManifestProgress};

/** Un chargement en cours, que d'autres appels pour la même langue rejoignent. */
interface Load {
    language: string;
    listeners: Set<(p: ManifestProgress) => void>;
    last: ManifestProgress | null;
    promise: Promise<void>;
}

let current: Load | null = null;
/** Dernier chargement lancé : les suivants attendent qu'il se termine. */
let running: Promise<void> = Promise.resolve();

/**
 * S'assure que le manifeste est présent et à jour en IndexedDB pour la langue
 * demandée. Ne télécharge que si la version ou la langue a changé.
 *
 * Les appels ne sont jamais simultanés : le chargement commence par vider la
 * base, et un second appel concurrent viderait ce que le premier est en train
 * d'écrire.
 * - Pour la **même langue**, l'appel rejoint le chargement en cours et
 *   s'abonne à sa progression. C'est le cas du double effet du mode strict de
 *   React : enchaîné derrière le premier, le second trouvait le cache à jour et
 *   ne recevait aucune progression — or c'est lui que la page écoute, l'effet
 *   du premier étant déjà nettoyé. La barre restait à 0 % jusqu'au bout.
 * - Pour une **autre langue**, il attend la fin du chargement en cours.
 */
export function ensureManifest(
    language: string,
    onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
    if (current?.language === language) {
        if (onProgress) {
            current.listeners.add(onProgress);
            if (current.last) onProgress(current.last);
        }
        return current.promise;
    }

    const load: Load = {
        language,
        listeners: new Set(onProgress ? [onProgress] : []),
        last: null,
        promise: Promise.resolve(),
    };
    const notify = (progress: ManifestProgress) => {
        load.last = progress;
        load.listeners.forEach((listener) => listener(progress));
    };
    load.promise = running
        .then(() => loadManifest(language, notify))
        .finally(() => {
            if (current === load) current = null;
        });
    running = load.promise.catch(() => {});
    current = load;
    return load.promise;
}

async function loadManifest(
    language: string,
    onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
    // 1. Métadonnées (version + URL des tables) via le serveur
    const res = await fetch("/api/manifest");
    if (!res.ok) throw new Error("Failed to fetch manifest");
    const meta: ManifestMeta = await res.json();

    // 2. Déjà à jour ? (même version, même langue ET même schéma de tables)
    const [storedVersion, storedLanguage, storedSchema] = await Promise.all([
        manifestDb.meta.get("version"),
        manifestDb.meta.get("language"),
        manifestDb.meta.get("schema"),
    ]);

    if (
        storedVersion?.value === meta.version &&
        storedLanguage?.value === language &&
        storedSchema?.value === MANIFEST_SCHEMA_VERSION
    ) {
        return;
    }

    // 3. Télécharger : dans un worker, pour ne pas figer l'interface
    await runDownload(meta, language, onProgress);
}

/**
 * Télécharge dans un Web Worker, pour que l'analyse du JSON et l'écriture en
 * IndexedDB ne figent pas l'interface. À défaut — navigateur sans worker,
 * script du worker introuvable —, sur le fil principal. Refaire le travail ici
 * est sans risque : le téléchargement commence toujours par tout vider.
 */
function runDownload(
    meta: ManifestMeta,
    language: string,
    onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
    let worker: Worker;
    try {
        worker = new Worker(new URL("./manifest.worker.ts", import.meta.url), {
            type: "module",
        });
    } catch (err) {
        console.warn("[manifest] worker indisponible, chargement sur le fil principal:", err);
        return downloadManifest(meta, language, onProgress);
    }

    return new Promise((resolve, reject) => {
        worker.onmessage = ({data}: MessageEvent<WorkerReply>) => {
            if (data.type === "progress") {
                onProgress?.(data.progress);
                return;
            }
            worker.terminate();
            if (data.type === "done") resolve();
            else reject(new Error(data.message));
        };
        // Le worker capture toutes ses erreurs et les renvoie en message : cet
        // événement-ci signale un script qui n'a pas pu se charger ou s'évaluer.
        worker.onerror = (event) => {
            worker.terminate();
            console.warn("[manifest] échec du worker, chargement sur le fil principal:", event.message);
            downloadManifest(meta, language, onProgress).then(resolve, reject);
        };
        worker.postMessage({meta, language} satisfies WorkerRequest);
    });
}

/** Lit une définition par table + hash (undefined si absente). */
export async function getDefinition<T = unknown>(
    table: string,
    hash: number,
): Promise<T | undefined> {
    const row = await manifestDb.definitions.get([table, hash]);
    return row?.data as T | undefined;
}

/** Lit plusieurs définitions d'un coup (ordre conservé). */
export async function getDefinitions<T = unknown>(
    table: string,
    hashes: number[],
): Promise<(T | undefined)[]> {
    const rows = await manifestDb.definitions.bulkGet(
        hashes.map((h) => [table, h] as [string, number]),
    );
    return rows.map((r) => r?.data as T | undefined);
}
