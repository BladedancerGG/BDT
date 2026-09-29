import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/auth/current-user";
import { getPrimaryDestinyMembership } from "@/lib/bungie/user";
import { getProfileInventory } from "@/lib/bungie/profile";

// GET /api/profile — personnages + équipements + inventaires de l'utilisateur.
export async function GET() {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const membership = await getPrimaryDestinyMembership(accessToken);
    const data = await getProfileInventory(
      accessToken,
      membership.membershipType,
      membership.membershipId,
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("Erreur profil:", err);
    return NextResponse.json({ error: "profile_fetch_failed" }, { status: 502 });
  }
}
