import {NextResponse} from "next/server";
import {prisma} from "@/lib/db/prisma";
import {getSessionUserId} from "@/lib/auth/session";

/**
 * Préférences synchronisées avec le compte Bungie.
 *
 * Le corps `data` n'est pas validé champ par champ : sa forme suit celle du
 * cookie, qui bouge avec l'interface, et la relecture est déjà tolérante
 * (`mergeSettings` écarte toute valeur inconnue). On se contente donc d'exiger
 * un objet, et de le plafonner — la ligne appartient à l'utilisateur, mais rien
 * n'oblige à lui laisser y déposer ce qu'il veut.
 */
const MAX_BYTES = 16 * 1024;

// PUT /api/settings — dépose l'état courant, ou coupe la synchronisation
export async function PUT(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({error: "unauthenticated"}, {status: 401});

  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as {enabled?: unknown}).enabled !== "boolean" ||
    typeof (body as {data?: unknown}).data !== "object" ||
    (body as {data?: unknown}).data === null
  ) {
    return NextResponse.json({error: "invalid_settings"}, {status: 400});
  }

  const {enabled, data} = body as {enabled: boolean; data: object};
  if (JSON.stringify(data).length > MAX_BYTES) {
    return NextResponse.json({error: "settings_too_large"}, {status: 413});
  }

  await prisma.userSettings.upsert({
    where: {userId},
    create: {userId, enabled, data},
    update: {enabled, data},
  });

  return NextResponse.json({ok: true});
}

// DELETE /api/settings — efface la sauvegarde ; l'absence de ligne vaut
// synchronisation coupée, le cookie reprend seul la main.
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({error: "unauthenticated"}, {status: 401});

  await prisma.userSettings.deleteMany({where: {userId}});
  return NextResponse.json({ok: true});
}
