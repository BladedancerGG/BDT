import {NextResponse} from "next/server";
import {prisma} from "@/lib/db/prisma";
import {destroySession, getSessionUserId} from "@/lib/auth/session";

/**
 * DELETE /api/account — efface tout ce que le site conserve du compte Bungie.
 *
 * Les équipements et les préférences partent avec l'utilisateur : leur relation
 * est en `onDelete: Cascade`. Rien n'est révoqué côté Bungie — l'autorisation
 * OAuth se retire depuis bungie.net, ce n'est pas à nous de le faire. La
 * session est détruite dans la foulée, faute de quoi le cookie désignerait un
 * utilisateur disparu.
 */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({error: "unauthenticated"}, {status: 401});

  await prisma.user.deleteMany({where: {id: userId}});
  await destroySession();
  return NextResponse.json({ok: true});
}
