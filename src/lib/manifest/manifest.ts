"use client";

import { manifestDb } from "./db";
import { MANIFEST_TABLES, MANIFEST_SCHEMA_VERSION } from "./tables";

const BUNGIE_ROOT = "https://www.bungie.net";

interface ManifestMeta {
  version: string;
  componentPaths: Record<string, Record<string, string>>;
}

export interface ManifestProgress {
  table: string;
  done: number;
  total: number;
}

/**
 * S'assure que le manifeste est présent et à jour en IndexedDB pour la langue
 * demandée. Ne télécharge que si la version ou la langue a changé.
 */
export async function ensureManifest(
  language: string,
  onProgress?: (p: ManifestProgress) => void,
): Promise<void> {
  // 1. Métadonnées (version + chemins) via notre proxy serveur
  const res = await fetch("/api/manifest");
  if (!res.ok) throw new Error("Impossible de récupérer le manifeste");
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

  // 3. Télécharger chaque table (fallback anglais si la langue manque)
  const paths = meta.componentPaths[language] ?? meta.componentPaths.en;
  if (!paths) throw new Error(`Aucun chemin de manifeste pour "${language}"`);

  let done = 0;
  for (const table of MANIFEST_TABLES) {
    const path = paths[table];
    if (path) {
      // Fichiers statiques publics servis directement par bungie.net (CORS OK)
      const tableRes = await fetch(`${BUNGIE_ROOT}${path}`);
      if (!tableRes.ok) throw new Error(`Échec téléchargement ${table}`);
      const json: Record<string, unknown> = await tableRes.json();

      const rows = Object.entries(json).map(([hash, data]) => ({
        table,
        hash: Number(hash),
        data,
      }));

      // Remplace le contenu précédent de cette table
      await manifestDb.definitions.where("table").equals(table).delete();
      await manifestDb.definitions.bulkPut(rows);
    }
    done += 1;
    onProgress?.({ table, done, total: MANIFEST_TABLES.length });
  }

  // 4. Mémoriser version + langue + schéma
  await manifestDb.meta.bulkPut([
    { key: "version", value: meta.version },
    { key: "language", value: language },
    { key: "schema", value: MANIFEST_SCHEMA_VERSION },
  ]);
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
