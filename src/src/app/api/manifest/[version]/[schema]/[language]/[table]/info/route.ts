import { NextResponse } from "next/server";
import {
  getTableFile,
  getTableStats,
  isValidKey,
  tableFileUrl,
} from "@/lib/manifest/server-cache";

/** Ce que la route décrit d'une table — cf. `TableInfo` dans lib/manifest/load.ts. */
export interface TableInfoBody {
  /** Le fichier lui-même, servi par Caddy en Brotli (voir TABLE_FILES_PREFIX) */
  url: string;
  /** Taille du JSON décompressé et nombre de lignes, pour la barre de progression */
  bytes: number;
  rows: number;
}

// GET /api/manifest/<version>/<schéma>/<langue>/<table>/info
// Garantit qu'une table du manifeste est dans le cache disque du serveur
// (lib/manifest/server-cache.ts) — le premier appel attend son téléchargement
// chez Bungie — puis la DÉCRIT : où la télécharger, et ce qu'elle pèse.
//
// La route ne sert plus le fichier : Next ≥ 16.4.6 retire le Content-Encoding
// des réponses de route, et le Brotli précompressé arrivait illisible au
// client. C'est Caddy qui le sert, directement depuis le volume.
//
// `/info`, et non plus l'URL qui servait la table elle-même : celle-ci était
// en cache `immutable` pour un an chez chaque navigateur, qui y aurait relu
// l'ancienne réponse — la table entière, ou son Brotli illisible — au lieu de
// cette description.
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      version: string;
      schema: string;
      language: string;
      table: string;
    }>;
  },
) {
  const { version, schema, language, table } = await params;
  if (!isValidKey(version, schema, language, table)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let file: string | null;
  try {
    file = await getTableFile(version, language, table);
  } catch (err) {
    console.error(`Erreur table ${table}:`, err);
    return NextResponse.json(
      { error: "manifest_fetch_failed" },
      { status: 502 },
    );
  }
  // Version périmée (purgée) : le client relira /api/manifest au rechargement
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const stats = await getTableStats(file);
  const body: TableInfoBody = {
    url: tableFileUrl(version, language, table),
    bytes: stats.bytes,
    rows: stats.rows,
  };
  return NextResponse.json(body, {
    headers: {
      // Pas d'`immutable` ici, contrairement au fichier : la réponse est
      // minuscule, et c'est un tel cache qui a figé chez les navigateurs
      // l'ancienne forme de cette URL. Revalider coûte un aller-retour.
      "Cache-Control": "no-cache",
    },
  });
}
