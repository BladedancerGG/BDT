// URL publique de l'app (telle que vue par le navigateur, via le proxy Caddy).
// Nécessaire car l'app tourne en HTTP interne : req.url renverrait "http://..."
// alors que le navigateur est sur "https://localhost".
const APP_URL = process.env.APP_URL ?? "https://localhost";

/** Construit une URL absolue vers l'app à partir d'un chemin. */
export function appUrl(path: string): URL {
  return new URL(path, APP_URL);
}
