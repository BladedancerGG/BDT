// Les trois seules écritures que l'API Bungie expose sur un inventaire.
//
// Elles dessinent le graphe des déplacements possibles (voir moves.ts) :
//
//   Objets perdus ──PullFromPostMaster──▶ inventaire du personnage
//   inventaire du personnage ◀──TransferItem──▶ coffre
//   inventaire du personnage ◀──EquipItem──▶ objets équipés
//
// Aucune arête ne relie deux personnages : un transfert de l'un à l'autre passe
// forcément par le coffre. Et aucune n'entre dans les objets équipés depuis
// ailleurs que l'inventaire du MÊME personnage : déplacer un objet équipé exige
// donc de le déséquiper d'abord, ce que l'API ne sait faire qu'en équipant un
// autre objet à sa place.

import { bungieFetch } from "./client";

export interface ActionTarget {
  accessToken: string;
  membershipType: number;
  /** Objet visé — instancié, donc porteur d'un itemInstanceId */
  itemId: string;
  /** Hash de définition, exigé par les deux endpoints de transfert */
  itemReferenceHash: number;
  /** Personnage concerné : source du transfert, ou destinataire */
  characterId: string;
}

/** POST commun : ces endpoints ne renvoient qu'un `Response: 0`. */
function post(path: string, accessToken: string, body: unknown) {
  return bungieFetch<number>(path, {
    method: "POST",
    accessToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Déplace un objet entre l'inventaire d'un personnage et le coffre.
 *
 * `characterId` désigne le personnage **dans les deux sens** : celui qui dépose
 * quand `transferToVault` est vrai, celui qui retire sinon.
 */
export function transferItem({
  accessToken,
  membershipType,
  itemId,
  itemReferenceHash,
  characterId,
  toVault,
  stackSize = 1,
}: ActionTarget & { toVault: boolean; stackSize?: number }) {
  return post("/Destiny2/Actions/Items/TransferItem/", accessToken, {
    itemReferenceHash,
    stackSize,
    transferToVault: toVault,
    itemId,
    characterId,
    membershipType,
  });
}

/** Équipe un objet déjà présent dans l'inventaire du personnage visé. */
export function equipItem({
  accessToken,
  membershipType,
  itemId,
  characterId,
}: Omit<ActionTarget, "itemReferenceHash">) {
  return post("/Destiny2/Actions/Items/EquipItem/", accessToken, {
    itemId,
    characterId,
    membershipType,
  });
}

/**
 * Sort un objet des Objets perdus vers l'inventaire du personnage qui les
 * détient — la seule destination que l'endpoint accepte.
 */
export function pullFromPostmaster({
  accessToken,
  membershipType,
  itemId,
  itemReferenceHash,
  characterId,
  stackSize = 1,
}: ActionTarget & { stackSize?: number }) {
  return post("/Destiny2/Actions/Items/PullFromPostmaster/", accessToken, {
    itemReferenceHash,
    stackSize,
    itemId,
    characterId,
    membershipType,
  });
}
