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
  /**
   * Personnage qui agit — pas forcément le détenteur : un objet au coffre se
   * modifie tout autant, au nom du personnage affiché.
   */
  characterId: string;
}

/** Le refus est de même nature que celui d'un déplacement : même forme. */
export type InsertPlugError = MoveStepError;

/**
 * Refus détecté avant tout envoi (clés `actions.failure.*`, partagées avec les
 * déplacements — `notInstanced` y dit déjà « objet introuvable dans le profil »).
 */
export type InsertFailure = "notInstanced" | "noCharacter";

/**
 * L'insertion telle qu'elle vit dans la file d'actions.
 *
 * `kind` la distingue des quatre déplacements (voir `MoveStepKind`) : c'est ce
 * discriminant qui aiguille l'envoi vers /api/sockets plutôt que /api/actions.
 * `itemHash` ne part dans aucune requête — il sert à redessiner la vignette de
 * l'arme dans le panneau.
 */
export interface InsertStepRequest extends InsertPlugRequest {
  kind: "insert";
  itemHash: number;
}

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
