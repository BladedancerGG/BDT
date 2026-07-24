import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/bungie/oauth";
import { getBungieDisplayName } from "@/lib/bungie/user";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { appUrl } from "@/lib/app-url";

// GET /api/auth/callback?code=...&state=...
// Bungie redirige ici après autorisation de l'utilisateur.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get("dlm_oauth_state")?.value;
  store.delete("dlm_oauth_state");

  // Validation anti-CSRF
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl("/?error=oauth_state"));
  }

  try {
    // 1. Échanger le code contre des tokens
    const tokens = await exchangeCodeForTokens(code);

    // 2. Récupérer le nom Bungie
    const { membershipId, displayName } = await getBungieDisplayName(
      tokens.accessToken,
    );

    // 3. Créer ou mettre à jour l'utilisateur en base
    const user = await prisma.user.upsert({
      where: { bungieMembershipId: membershipId },
      create: {
        bungieMembershipId: membershipId,
        displayName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      },
      update: {
        displayName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      },
    });

    // 4. Ouvrir la session
    await createSession(user.id);

    return NextResponse.redirect(appUrl("/"));
  } catch (err) {
    console.error("Erreur callback OAuth:", err);
    return NextResponse.redirect(appUrl("/?error=oauth_failed"));
  }
}
