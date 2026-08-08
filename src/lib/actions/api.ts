"use client";

import type { MoveStepError, MoveStepRequest } from "./types";

/**
 * Envoie une étape à /api/actions.
 *
 * Ne lève jamais : un refus de Bungie est une information à afficher dans la
 * liste des actions, pas une exception à faire remonter jusqu'au rendu.
 * Renvoie `null` en cas de succès.
 */
export async function sendStep(
  step: MoveStepRequest,
): Promise<MoveStepError | null> {
  let res: Response;
  try {
    res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(step),
    });
  } catch (err) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) return null;

  const body: unknown = await res.json().catch(() => null);
  const error = (body as { error?: MoveStepError | string } | null)?.error;
  if (typeof error === "object" && error !== null) return error;
  return { message: typeof error === "string" ? error : `HTTP ${res.status}` };
}
