import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

// GET /api/auth/me — infos de l'utilisateur connecté (ou null)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      bungieMembershipId: user.bungieMembershipId,
    },
  });
}
