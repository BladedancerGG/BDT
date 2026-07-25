import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/auth/current-user";
import { getPrimaryDestinyMembership } from "@/lib/bungie/user";
import { getItemDetail } from "@/lib/bungie/item";

// GET /api/item/[instanceId] — détail d'un objet instancié (stats, sockets…)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  const { instanceId } = await params;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const membership = await getPrimaryDestinyMembership(accessToken);
    const detail = await getItemDetail(
      accessToken,
      membership.membershipType,
      membership.membershipId,
      instanceId,
    );
    return NextResponse.json(detail);
  } catch (err) {
    console.error("Erreur détail objet:", err);
    return NextResponse.json({ error: "item_fetch_failed" }, { status: 502 });
  }
}
