import { NextResponse } from "next/server";
import { bungieFetch } from "@/lib/bungie/client";

// Type partiel de DestinyManifest (voir bungie-api-ts pour le type complet).
interface DestinyManifest {
  version: string;
  // Chemins des tables JSON, par langue : { fr: { DestinyInventoryItemDefinition: "/common/...json", ... } }
  jsonWorldComponentContentPaths: Record<string, Record<string, string>>;
}

// GET /api/manifest
// Récupère les métadonnées du manifeste (version + chemins des tables).
// Nécessite la clé API → passe par le serveur. Les fichiers de tables
// eux-mêmes sont ensuite téléchargés directement par le client.
export async function GET() {
  try {
    const manifest = await bungieFetch<DestinyManifest>("/Destiny2/Manifest/");
    return NextResponse.json({
      version: manifest.version,
      componentPaths: manifest.jsonWorldComponentContentPaths,
    });
  } catch (err) {
    console.error("Erreur manifeste:", err);
    return NextResponse.json(
      { error: "manifest_fetch_failed" },
      { status: 502 },
    );
  }
}
