// Gestion de session par cookie signé.
// Le cookie ne contient que l'id utilisateur (en base), signé en HMAC pour
// empêcher toute falsification. Les tokens Bungie restent en base, jamais
// dans le cookie.
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "dlm_session";
const SECRET = process.env.SESSION_SECRET;
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

function sign(value: string): string {
  if (!SECRET) throw new Error("SESSION_SECRET manquante");
  const hmac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  // Comparaison à temps constant contre les attaques par timing
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

/** Crée la session (après un login réussi). */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Retourne l'id utilisateur courant, ou null si non connecté. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie) return null;
  return verify(cookie.value);
}

/** Détruit la session (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
