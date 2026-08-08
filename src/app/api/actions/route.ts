import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/auth/current-user";
import { getPrimaryDestinyMembership } from "@/lib/bungie/user";
import {
  equipItem,
  pullFromPostmaster,
  transferItem,
} from "@/lib/bungie/actions";
import { BungieApiError } from "@/lib/bungie/client";
import { isMoveStepRequest, type MoveStepError } from "@/lib/actions/types";

/**
 * POST /api/actions — exécute **une** étape de déplacement.
 *
 * L'enchaînement (déséquiper, passer par le coffre, réquiper…) est planifié
 * dans le navigateur : c'est lui qui connaît l'état affiché et qui doit rendre
 * compte de chaque requête séparément dans la liste des actions. Le serveur ne
 * fait donc que traduire une étape en un appel Bungie, avec le token — qui, lui,
 * ne quitte jamais le serveur.
 */
export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isMoveStepRequest(body)) {
    return NextResponse.json({ error: "invalid_step" }, { status: 400 });
  }

  try {
    const { membershipType } = await getPrimaryDestinyMembership(accessToken);
    const target = {
      accessToken,
      membershipType,
      itemId: body.itemInstanceId,
      itemReferenceHash: body.itemHash,
      characterId: body.characterId,
    };

    switch (body.kind) {
      case "pull":
        await pullFromPostmaster(target);
        break;
      case "toVault":
        await transferItem({ ...target, toVault: true });
        break;
      case "fromVault":
        await transferItem({ ...target, toVault: false });
        break;
      case "equip":
        await equipItem(target);
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Le refus de Bungie est une information utile à l'utilisateur (« aucune
    // place à destination », « impossible ici ») : on la lui transmet plutôt
    // que de la réduire à un 502 anonyme.
    if (err instanceof BungieApiError) {
      const error: MoveStepError = {
        status: err.errorStatus,
        message: err.message,
        throttleSeconds: err.throttleSeconds,
      };
      console.error(`Action ${body.kind} refusée:`, err.message);
      return NextResponse.json(
        { error },
        // 409 : l'état du compte s'oppose à l'action, ce n'est pas une panne
        { status: err.errorCode !== undefined ? 409 : 502 },
      );
    }

    console.error("Erreur action:", err);
    return NextResponse.json(
      { error: { message: "action_failed" } satisfies MoveStepError },
      { status: 502 },
    );
  }
}
