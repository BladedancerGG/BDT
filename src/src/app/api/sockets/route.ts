import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/auth/current-user";
import { getPrimaryDestinyMembership } from "@/lib/bungie/user";
import { insertSocketPlugFree } from "@/lib/bungie/actions";
import { BungieApiError } from "@/lib/bungie/client";
import {
  isInsertPlugRequest,
  type InsertPlugError,
} from "@/lib/actions/sockets";

/**
 * POST /api/sockets — équipe un plug dans un socket d'un objet.
 *
 * Route séparée de /api/actions : une insertion n'est pas un déplacement. Elle
 * ne se planifie pas (une requête, jamais plus), ne passe pas par la file
 * d'actions, et son refus le plus fréquent — Bungie n'accepte que les
 * changements gratuits — n'a pas d'équivalent côté déplacements.
 *
 * Comme pour les déplacements, le jeton ne quitte pas le serveur.
 */
export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isInsertPlugRequest(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const { membershipType } = await getPrimaryDestinyMembership(accessToken);
    await insertSocketPlugFree({
      accessToken,
      membershipType,
      itemId: body.itemInstanceId,
      characterId: body.characterId,
      socketIndex: body.socketIndex,
      plugItemHash: body.plugItemHash,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Le motif du refus est la seule chose utile ici : « attribut non
    // débloqué », « changement payant »… On le transmet plutôt que de le
    // réduire à un 502 anonyme.
    if (err instanceof BungieApiError) {
      const error: InsertPlugError = {
        status: err.errorStatus,
        message: err.message,
        throttleSeconds: err.throttleSeconds,
      };
      console.error("Insertion de plug refusée:", err.message);
      return NextResponse.json(
        { error },
        // 409 : l'état du compte s'oppose à l'action, ce n'est pas une panne
        { status: err.errorCode !== undefined ? 409 : 502 },
      );
    }

    console.error("Erreur insertion de plug:", err);
    return NextResponse.json(
      { error: { message: "insert_failed" } satisfies InsertPlugError },
      { status: 502 },
    );
  }
}
