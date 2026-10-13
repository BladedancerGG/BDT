import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  getTableFile,
  getTableStats,
  isValidKey,
  openTable,
} from "@/lib/manifest/server-cache";

// GET /api/manifest/<version>/<schéma>/<langue>/<table>
// Une table du manifeste, allégée et servie depuis le cache disque du serveur
// (lib/manifest/server-cache.ts). Le premier appel pour une table absente
// attend son téléchargement chez Bungie.
export async function GET(
  request: Request,
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

  const brotli = /\bbr\b/.test(request.headers.get("accept-encoding") ?? "");
  const stats = await getTableStats(file);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // Version et schéma sont dans l'URL : un nouveau manifeste ou une nouvelle
    // projection, c'est une nouvelle URL. Le contenu d'une URL ne change donc jamais.
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept-Encoding",
    // Taille décompressée et nombre de lignes : le poids de la table dans la
    // barre de progression du client (lib/manifest/progress.ts).
    "X-Manifest-Size": String(stats.bytes),
    "X-Manifest-Rows": String(stats.rows),
  };
  if (brotli) {
    // Déjà compressé : Caddy (`encode`) comme Next laissent passer une réponse
    // qui porte son Content-Encoding.
    headers["Content-Encoding"] = "br";
    headers["Content-Length"] = String((await stat(file)).size);
  }

  return new Response(
    Readable.toWeb(openTable(file, brotli)) as ReadableStream,
    { headers },
  );
}
