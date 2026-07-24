// Récupère l'utilisateur courant et garantit un access token Bungie valide.
// Si l'access token a expiré, il est renouvelé via le refresh token et
// persisté en base — transparent pour l'appelant.
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "./session";
import { refreshTokens } from "@/lib/bungie/oauth";
import type { User } from "@prisma/client";

/** Utilisateur en session, ou null. Ne renouvelle PAS le token. */
export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Retourne un access token valide pour l'utilisateur courant, en le
 * renouvelant si nécessaire. Lève une erreur si non connecté.
 */
export async function getValidAccessToken(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié");

  // Token encore valide
  if (user.tokenExpiresAt > new Date()) return user.accessToken;

  // Sinon on rafraîchit
  const tokens = await refreshTokens(user.refreshToken);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    },
  });
  return tokens.accessToken;
}
