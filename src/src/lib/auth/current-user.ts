// Récupère l'utilisateur courant et garantit un access token Bungie valide.
// Si l'access token a expiré, il est renouvelé via le refresh token et
// persisté en base — transparent pour l'appelant.
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "./session";
import { refreshTokens } from "@/lib/bungie/oauth";
import { rememberTokenOwner } from "@/lib/bungie/call-log";
import type { User } from "@/generated/prisma/client";

/**
 * Intervalle minimal entre deux mises à jour de `lastSeenAt`.
 *
 * Chaque chargement de page et chaque appel d'API passent par ici : écrire à
 * chaque fois ferait une écriture par requête pour une information qui ne se
 * lit qu'à l'heure près.
 */
const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

/** Note l'activité du compte, sans attendre ni jamais faire échouer la requête. */
function touchLastSeen(user: User): void {
  const now = Date.now();
  if (user.lastSeenAt && now - user.lastSeenAt.getTime() < LAST_SEEN_INTERVAL_MS) return;
  prisma.user
    .update({ where: { id: user.id }, data: { lastSeenAt: new Date(now) } })
    .catch((err) => console.error("[auth] lastSeenAt :", err));
}

/** Utilisateur en session, ou null. Ne renouvelle PAS le token. */
export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) touchLastSeen(user);
  return user;
}

/**
 * Retourne un access token valide pour l'utilisateur courant, en le
 * renouvelant si nécessaire. Lève une erreur si non connecté.
 */
export async function getValidAccessToken(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié");

  // Token encore valide
  if (user.tokenExpiresAt > new Date()) {
    rememberTokenOwner(user.accessToken, user.id, user.tokenExpiresAt);
    return user.accessToken;
  }

  // Sinon on rafraîchit
  const tokens = await refreshTokens(user.refreshToken, user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    },
  });
  rememberTokenOwner(tokens.accessToken, user.id, tokens.expiresAt);
  return tokens.accessToken;
}
