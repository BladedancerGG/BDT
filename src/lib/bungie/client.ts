// Wrapper autour de l'API Bungie.
// Toutes les requêtes passent par ce helper côté serveur pour :
//  - injecter la clé API (X-API-Key) — jamais exposée au navigateur
//  - contourner les restrictions CORS de bungie.net
//  - encaisser les défaillances passagères de bungie.net (522, 503…) sans
//    faire remonter d'exception à la première tentative
//
// Sortie réseau : si HTTP_PROXY / HTTPS_PROXY sont définis ET que Node tourne
// avec --use-env-proxy (voir NODE_OPTIONS dans docker-compose.yml), le fetch
// global emprunte automatiquement le proxy. Aucun code spécifique ici.
//
// Les types précis des réponses proviennent du package "bungie-api-ts".

const BUNGIE_ROOT = "https://www.bungie.net/Platform";

const API_KEY = process.env.BUNGIE_API_KEY;

/** Statuts qu'il vaut la peine de retenter : passagers, côté Bungie/Cloudflare. */
const RETRYABLE_STATUS = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, 502, 503, 504, // erreurs serveur classiques
  520, 521, 522, 523, 524, // erreurs Cloudflare (522 = timeout vers l'origine)
]);

const DEFAULT_RETRIES = 2; // soit 3 tentatives au total
const DEFAULT_TIMEOUT_MS = 10_000;

/** Erreur d'API Bungie, porteuse du statut HTTP pour décider d'un retry. */
export class BungieApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** PlatformErrorCodes, quand l'échec est applicatif et non HTTP */
    readonly errorCode?: number,
    /** Nom symbolique du code : « DestinyNoRoomInDestination »… */
    readonly errorStatus?: string,
    /** Délai imposé par Bungie avant de réessayer (limitation de débit) */
    readonly throttleSeconds?: number,
  ) {
    super(message);
    this.name = "BungieApiError";
  }
}

/** PlatformErrorCodes.Success — tout le reste est un échec applicatif. */
const SUCCESS = 1;

/** Enveloppe commune à toutes les réponses de la plateforme Bungie. */
interface BungiePlatformResponse<T> {
  Response: T;
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
  /** Attente imposée avant une nouvelle tentative, en secondes */
  ThrottleSeconds?: number;
}

/** Lit l'enveloppe Bungie d'un corps de réponse, ou null si ce n'en est pas une. */
function parseEnvelope(body: string): BungiePlatformResponse<unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as BungiePlatformResponse<unknown>;
  } catch {
    // Page HTML de Cloudflare, corps vide… : ce n'est pas une erreur en soi
    return null;
  }
}

type FetchOptions = RequestInit & {
  accessToken?: string;
  /** Nombre de nouvelles tentatives (requêtes idempotentes uniquement) */
  retries?: number;
  timeoutMs?: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attente exponentielle avec un peu d'aléatoire, pour éviter les rafales. */
function backoffDelay(attempt: number): number {
  const base = 400 * 2 ** (attempt - 1); // 400ms, 800ms, 1600ms…
  return base + Math.random() * 200;
}

export async function bungieFetch<T>(
  path: string,
  {
    accessToken,
    headers,
    retries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ...init
  }: FetchOptions = {},
): Promise<T> {
  if (!API_KEY) throw new BungieApiError("BUNGIE_API_KEY manquante");

  const method = (init.method ?? "GET").toUpperCase();
  // On ne retente que les requêtes sans effet de bord
  const attempts = method === "GET" || method === "HEAD" ? retries + 1 : 1;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${BUNGIE_ROOT}${path}`, {
        ...init,
        // Évite qu'un 522 (Cloudflare attend ~90s) bloque la requête entrante
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "X-API-Key": API_KEY,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...headers,
        },
      });

      if (!res.ok) {
        // Bungie renvoie parfois son enveloppe complète AVEC un statut HTTP
        // d'erreur : on en extrait le message, sinon c'est tout le JSON qui
        // remontait jusqu'à l'interface. À défaut (page HTML de Cloudflare),
        // on tronque pour ne pas noyer les logs.
        const raw = await res.text();
        const envelope = parseEnvelope(raw);
        const error = new BungieApiError(
          envelope?.Message?.trim() ||
            `Bungie API ${res.status}: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
          res.status,
          envelope?.ErrorCode,
          envelope?.ErrorStatus,
          envelope?.ThrottleSeconds,
        );

        if (attempt < attempts && RETRYABLE_STATUS.has(res.status)) {
          lastError = error;
          console.warn(
            `[bungie] ${res.status} sur ${path} — nouvelle tentative ${attempt}/${attempts - 1}`,
          );
          await wait(backoffDelay(attempt));
          continue;
        }
        throw error;
      }

      const json = (await res.json()) as BungiePlatformResponse<T>;

      // L'API Bungie enveloppe tout dans { Response, ErrorCode, ... } et
      // signale ses refus applicatifs en HTTP 200 : un `EquipItem` rejeté
      // (objet verrouillé, joueur en activité…) ressemble sinon à un succès.
      if (json.ErrorCode !== undefined && json.ErrorCode !== SUCCESS) {
        // Le message de Bungie, et lui seul : c'est ce que l'interface affiche.
        // Le code symbolique reste disponible à part, pour les logs.
        throw new BungieApiError(
          json.Message?.trim() ||
            json.ErrorStatus ||
            `ErrorCode ${json.ErrorCode}`,
          res.status,
          json.ErrorCode,
          json.ErrorStatus,
          json.ThrottleSeconds,
        );
      }

      return json.Response;
    } catch (error) {
      // Un refus applicatif est définitif : le retenter ne ferait que répéter
      // l'échec, et pour une écriture il pourrait la rejouer.
      if (error instanceof BungieApiError && error.errorCode !== undefined) {
        throw error;
      }
      // Un statut non retryable a déjà été relancé ci-dessus : on le propage
      if (error instanceof BungieApiError && error.status !== undefined) {
        if (!RETRYABLE_STATUS.has(error.status)) throw error;
      }

      lastError = error;
      if (attempt >= attempts) break;

      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[bungie] échec réseau sur ${path} (${reason}) — nouvelle tentative ${attempt}/${attempts - 1}`,
      );
      await wait(backoffDelay(attempt));
    }
  }

  if (lastError instanceof BungieApiError) throw lastError;
  throw new BungieApiError(
    `Bungie injoignable sur ${path}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
