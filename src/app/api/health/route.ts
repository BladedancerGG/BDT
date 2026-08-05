import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/health — sonde pour le healthcheck Docker et le reverse proxy.
 *
 * Vérifie que le serveur répond ET que la base est joignable : un conteneur qui
 * sert des pages mais ne peut pas lire la session n'est pas réellement sain.
 * N'expose aucune information : juste un statut.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
