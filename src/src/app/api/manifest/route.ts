import { NextResponse } from "next/server";
import { getManifestMeta } from "@/lib/manifest/server-cache";
import {
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_TABLES,
} from "@/lib/manifest/tables";

// GET /api/manifest
// Version du manifeste + URL, par langue, des tables dont l'app a besoin.
// Ces URL pointent vers le relais
// (/api/manifest/<version>/<schéma>/<langue>/<table>/info), plus vers bungie.net :
// le serveur garde les tables en cache, allégées des champs que l'app ne lit
// pas, et les sert compressées en Brotli. Une table absente du manifeste de
// Bungie est omise, pour que le client lève comme avant sur une table manquante.
export async function GET() {
  try {
    const { version, paths } = await getManifestMeta();
    const tableUrls: Record<string, Record<string, string>> = {};
    for (const [language, tables] of Object.entries(paths)) {
      tableUrls[language] = {};
      for (const table of MANIFEST_TABLES) {
        if (tables[table]) {
          tableUrls[language][table] =
            `/api/manifest/${encodeURIComponent(version)}/${MANIFEST_SCHEMA_VERSION}/${language}/${table}/info`;
        }
      }
    }
    return NextResponse.json({ version, tableUrls });
  } catch (err) {
    console.error("Manifest error:", err);
    return NextResponse.json(
      { error: "manifest_fetch_failed" },
      { status: 502 },
    );
  }
}
