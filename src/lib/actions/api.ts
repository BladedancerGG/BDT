"use client";

import type { InsertStepRequest } from "./sockets";
import type { MoveStepError, MoveStepRequest } from "./types";

/** Une requête d'écriture, quelle que soit sa nature. */
export type StepRequest = MoveStepRequest | InsertStepRequest;

/**
 * Envoie une étape à la route qui sait l'exécuter.
 *
 * Les deux routes partagent la forme de leur refus : l'exécuteur n'a donc pas à
 * savoir laquelle il vient d'appeler.
 *
 * Ne lève jamais : un refus de Bungie est une information à afficher dans la
 * liste des actions, pas une exception à faire remonter jusqu'au rendu.
 * Renvoie `null` en cas de succès.
 */
export async function sendStep(
  step: StepRequest,
): Promise<MoveStepError | null> {
  const insert = step.kind === "insert";
  const url = insert ? "/api/sockets" : "/api/actions";
  // L'étape porte de quoi s'afficher dans le panneau (`kind`, `itemHash`) ;
  // seul le contrat de la route part sur le réseau.
  const body: unknown = insert
    ? {
        itemInstanceId: step.itemInstanceId,
        socketIndex: step.socketIndex,
        plugItemHash: step.plugItemHash,
        characterId: step.characterId,
      }
    : step;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) return null;

  const parsed: unknown = await res.json().catch(() => null);
  const error = (parsed as { error?: MoveStepError | string } | null)?.error;
  if (typeof error === "object" && error !== null) return error;
  return { message: typeof error === "string" ? error : `HTTP ${res.status}` };
}
