// Garde des pages et routes d'administration.
//
// Un non-administrateur reçoit une 404, et non une 403 : rien ne doit lui
// indiquer que la page existe.
import { notFound } from "next/navigation";
import { getCurrentUser } from "./current-user";
import type { User } from "@/generated/prisma/client";

/** L'utilisateur en session s'il est administrateur, sinon null. */
export async function getAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.admin ? user : null;
}

/**
 * À appeler en tête de CHAQUE page d'administration, et pas seulement dans
 * leur layout : un layout ne se réexécute pas à chaque navigation, et ne
 * protège pas ce que la page lit elle-même.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) notFound();
  return user;
}
