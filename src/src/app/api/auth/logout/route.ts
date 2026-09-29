import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { appUrl } from "@/lib/app-url";

// POST /api/auth/logout
export async function POST() {
  await destroySession();
  return NextResponse.redirect(appUrl("/"), { status: 303 });
}
