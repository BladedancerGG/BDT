import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { searchLogs } from "@/lib/admin/server-log";
import { isLogLevel } from "@/lib/admin/log-types";

// GET /api/admin/logs?q=…&level=… — les lignes les plus récentes qui
// correspondent, tous fichiers de rotation confondus.
export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const query = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const rawLevel = req.nextUrl.searchParams.get("level");
  const level = isLogLevel(rawLevel) ? rawLevel : undefined;

  return NextResponse.json(await searchLogs({ query, level }), {
    headers: { "Cache-Control": "no-store" },
  });
}
