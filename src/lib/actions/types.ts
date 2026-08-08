// Vocabulaire partagé entre le planificateur (navigateur) et la route qui
// exécute les requêtes (serveur).
//
// Pas de directive "use client" ici : le serveur importe ces types et
// `isMoveStepRequest`. Une constante exportée depuis un module client arrive
// `undefined` côté serveur — voir lib/settings/constants.ts.

/** Les quatre arêtes du graphe des déplacements (voir bungie/actions.ts). */
export type MoveStepKind =
  /** Objets perdus → inventaire du personnage */
  | "pull"
  /** Inventaire du personnage → coffre */
  | "toVault"
  /** Coffre → inventaire du personnage */
  | "fromVault"
  /** Inventaire du personnage → objets équipés du même personnage */
  | "equip";

/** Une requête Bungie, et une seule. */
export interface MoveStepRequest {
  kind: MoveStepKind;
  itemInstanceId: string;
  itemHash: number;
  /**
   * Personnage concerné. Toujours renseigné, y compris pour `toVault` : le
   * coffre n'étant rattaché à aucun personnage, l'API demande celui qui dépose.
   */
  characterId: string;
}

/** Réponse d'échec de /api/actions, telle que l'interface l'affiche. */
export interface MoveStepError {
  /** Nom symbolique Bungie (« DestinyNoRoomInDestination »), si disponible */
  status?: string;
  message: string;
  /** Attente imposée avant de réessayer, en secondes */
  throttleSeconds?: number;
}

/** Garde de type : le corps de requête vient du réseau, il n'est pas de confiance. */
export function isMoveStepRequest(value: unknown): value is MoveStepRequest {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Partial<MoveStepRequest>;
  return (
    (step.kind === "pull" ||
      step.kind === "toVault" ||
      step.kind === "fromVault" ||
      step.kind === "equip") &&
    typeof step.itemInstanceId === "string" &&
    step.itemInstanceId.length > 0 &&
    typeof step.itemHash === "number" &&
    typeof step.characterId === "string" &&
    step.characterId.length > 0
  );
}
