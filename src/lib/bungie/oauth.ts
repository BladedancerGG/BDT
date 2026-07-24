// Flow OAuth2 Bungie.net (client "Confidential").
// Doc : https://github.com/Bungie-net/api/wiki/OAuth-Documentation
//
// Le client_secret ne quitte JAMAIS le serveur : toutes ces fonctions
// s'exécutent côté serveur (routes /api/auth/*).

const AUTHORIZE_URL = "https://www.bungie.net/en/OAuth/Authorize";
const TOKEN_URL = "https://www.bungie.net/platform/app/oauth/token/";

const CLIENT_ID = process.env.BUNGIE_CLIENT_ID;
const CLIENT_SECRET = process.env.BUNGIE_CLIENT_SECRET;
const API_KEY = process.env.BUNGIE_API_KEY;

export interface BungieTokens {
  accessToken: string;
  refreshToken: string;
  /** Date d'expiration absolue de l'access token */
  expiresAt: Date;
  /** membership_id Bungie renvoyé avec les tokens */
  membershipId: string;
}

/** Construit l'URL vers laquelle rediriger l'utilisateur pour l'autoriser. */
export function getAuthorizeUrl(state: string): string {
  if (!CLIENT_ID) throw new Error("BUNGIE_CLIENT_ID manquante");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** En-tête Basic auth pour un client confidentiel. */
function basicAuthHeader(): string {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  return `Basic ${creds}`;
}

/** Normalise la réponse token de Bungie en objet typé. */
function parseTokenResponse(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  membership_id: string;
}): BungieTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Marge de 60s pour éviter d'utiliser un token quasi expiré
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
    membershipId: data.membership_id,
  };
}

/** Échange le "code" reçu sur le callback contre des tokens. */
export async function exchangeCodeForTokens(
  code: string,
): Promise<BungieTokens> {
  return requestTokens({ grant_type: "authorization_code", code });
}

/** Renouvelle l'access token à partir du refresh token. */
export async function refreshTokens(
  refreshToken: string,
): Promise<BungieTokens> {
  return requestTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function requestTokens(
  body: Record<string, string>,
): Promise<BungieTokens> {
  if (!CLIENT_ID || !CLIENT_SECRET || !API_KEY) {
    throw new Error("Variables OAuth Bungie manquantes");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": API_KEY,
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    throw new Error(`Échec token OAuth (${res.status}): ${await res.text()}`);
  }

  return parseTokenResponse(await res.json());
}
