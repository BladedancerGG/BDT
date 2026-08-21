import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/auth/current-user";
import { getPrimaryDestinyMembership } from "@/lib/bungie/user";
import {
  clearLoadout,
  equipLoadout,
  snapshotLoadout,
  updateLoadoutIdentifiers,
} from "@/lib/bungie/actions";
import { BungieApiError } from "@/lib/bungie/client";
import {
  isLoadoutActionRequest,
  type LoadoutActionError,
} from "@/lib/loadouts/types";

/**
 * POST /api/loadouts — équipe, enregistre, vide ou renomme un emplacement
 * d'équipement.
 *
 * Rien à planifier, contrairement à /api/actions : Bungie assemble l'équipement
 * lui-même côté serveur, transferts depuis le coffre compris. Une requête, une
 * action — et le profil est invalidé au retour pour relire le résultat.
 */
export async function POST(request: Request) {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isLoadoutActionRequest(body)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    const { membershipType } = await getPrimaryDestinyMembership(accessToken);
    const target = {
      accessToken,
      membershipType,
      characterId: body.characterId,
      loadoutIndex: body.loadoutIndex,
    };

    switch (body.kind) {
      case "equip":
        await equipLoadout(target);
        break;
      case "snapshot":
        await snapshotLoadout({
          ...target,
          colorHash: body.colorHash,
          iconHash: body.iconHash,
          nameHash: body.nameHash,
        });
        break;
      case "clear":
        await clearLoadout(target);
        break;
      case "identifiers":
        await updateLoadoutIdentifiers({
          ...target,
          // Les trois sont garantis présents par `isLoadoutActionRequest`
          colorHash: body.colorHash!,
          iconHash: body.iconHash!,
          nameHash: body.nameHash!,
        });
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Comme pour les déplacements : le motif de Bungie est déjà localisé et
    // plus utile que n'importe quel message de notre cru.
    if (err instanceof BungieApiError) {
      const error: LoadoutActionError = {
        status: err.errorStatus,
        message: err.message,
      };
      console.error(`Équipement ${body.kind} refusé:`, err.message);
      return NextResponse.json(
        { error },
        { status: err.errorCode !== undefined ? 409 : 502 },
      );
    }

    console.error("Erreur équipement:", err);
    return NextResponse.json(
      { error: { message: "loadout_failed" } satisfies LoadoutActionError },
      { status: 502 },
    );
  }
}
