import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { followLogs } from "@/lib/admin/server-log";

// GET /api/admin/logs/stream — les nouvelles lignes du journal, en direct
// (Server-Sent Events). Aucun filtre ici : la page filtre elle-même ce qui
// arrive, et changer de recherche ne coupe pas le flux.

/** Commentaire SSE périodique : sans trafic, un proxy finit par couper la connexion. */
const HEARTBEAT_MS = 15_000;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let stop: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    stop?.();
    stop = undefined;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Flux déjà fermé côté client
          cleanup();
        }
      };
      send(": connected\n\n");
      stop = await followLogs((entry) => send(`data: ${JSON.stringify(entry)}\n\n`));
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      // La page fermée, plus personne ne lit : on arrête de scruter le fichier.
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Déjà fermé
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform : sans lui, une compression en chemin retient les
      // événements jusqu'à remplir son tampon.
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
