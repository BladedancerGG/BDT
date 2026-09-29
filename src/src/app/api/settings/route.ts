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

// PUT /api/settings — dépose l'état courant, et pose le drapeau du compte
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

  // Deux écritures, deux tables depuis que le drapeau vit sur `User` : la
  // ligne de préférences ne dit plus si la synchronisation est active, elle ne
  // porte que ce qui a été déposé. L'état part en base même quand on coupe —
  // c'est exactement ce que « couper sans effacer » veut dire, et il reste là
  // pour un retour.
  await prisma.$transaction([
    prisma.user.update({where: {id: userId}, data: {syncEnabled: enabled}}),
    prisma.userSettings.upsert({
      where: {userId},
      create: {userId, data},
      update: {data},
    }),
  ]);

  return NextResponse.json({ok: true});
}

// DELETE /api/settings — efface la sauvegarde et coupe la synchronisation.
//
// Le drapeau doit être baissé explicitement : l'absence de ligne ne vaut plus
// synchronisation coupée depuis qu'elle est allumée par défaut sur le compte,
// et la laisser allumée ferait redéposer l'état à la modification suivante —
// juste après un geste qui demandait le contraire.
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({error: "unauthenticated"}, {status: 401});

  await prisma.$transaction([
    prisma.user.update({where: {id: userId}, data: {syncEnabled: false}}),
    prisma.userSettings.deleteMany({where: {userId}}),
  ]);
  return NextResponse.json({ok: true});
}
