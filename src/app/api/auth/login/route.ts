import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getAuthorizeUrl } from "@/lib/bungie/oauth";

// GET /api/auth/login
// Génère un "state" anti-CSRF, le stocke en cookie, puis redirige vers Bungie.
export async function GET() {
  const state = crypto.randomUUID();

  const store = await cookies();
  store.set("dlm_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 min pour finir l'auth
  });

  return NextResponse.redirect(getAuthorizeUrl(state));
}
