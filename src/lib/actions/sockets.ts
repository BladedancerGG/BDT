// Vocabulaire de l'insertion de plug, partagé entre le navigateur et la route
// qui exécute la requête.
//
// Pas de directive "use client" : le serveur importe `isInsertPlugRequest` —
// voir lib/settings/constants.ts.

import type { MoveStepError } from "./types";

/** Équiper un attribut / mod dans un socket d'un objet. */
export interface InsertPlugRequest {
  itemInstanceId: string;
  /** Index dans `ItemDetail.sockets` — le même que celui du manifeste */
  socketIndex: number;
  plugItemHash: number;
  /** Personnage détenteur : l'API n'agit pas sur un objet resté au coffre */
  characterId: string;
}

/** Le refus est de même nature que celui d'un déplacement : même forme. */
export type InsertPlugError = MoveStepError;

/** Garde de type : le corps de requête vient du réseau, il n'est pas de confiance. */
export function isInsertPlugRequest(value: unknown): value is InsertPlugRequest {
  if (typeof value !== "object" || value === null) return false;
  const req = value as Partial<InsertPlugRequest>;
  return (
    typeof req.itemInstanceId === "string" &&
    req.itemInstanceId.length > 0 &&
    typeof req.socketIndex === "number" &&
    Number.isInteger(req.socketIndex) &&
    req.socketIndex >= 0 &&
    typeof req.plugItemHash === "number" &&
    req.plugItemHash > 0 &&
    typeof req.characterId === "string" &&
    req.characterId.length > 0
  );
}
