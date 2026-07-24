// Petit wrapper autour de l'API Bungie.
// Toutes les requêtes passent par ce helper côté serveur pour :
//  - injecter la clé API (X-API-Key) — jamais exposée au navigateur
//  - contourner les restrictions CORS de bungie.net
//
// Les types précis des réponses proviennent du package "bungie-api-ts".

const BUNGIE_ROOT = "https://www.bungie.net/Platform";

const API_KEY = process.env.BUNGIE_API_KEY;

type FetchOptions = RequestInit & { accessToken?: string };

export async function bungieFetch<T>(
  path: string,
  { accessToken, headers, ...init }: FetchOptions = {},
): Promise<T> {
  if (!API_KEY) throw new Error("BUNGIE_API_KEY manquante");

  const res = await fetch(`${BUNGIE_ROOT}${path}`, {
    ...init,
    headers: {
      "X-API-Key": API_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Bungie API ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  // L'API Bungie enveloppe tout dans { Response, ErrorCode, ... }
  return json.Response as T;
}
