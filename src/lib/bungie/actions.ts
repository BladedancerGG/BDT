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
 * Insère un plug (attribut, mod, ornement) dans un socket d'un objet.
 *
 * `InsertSocketPlugFree` est la seule des deux insertions accessible à une
 * application ordinaire : l'autre, `InsertSocketPlug`, passe par les *advanced
 * write actions* et exige un jeton délivré depuis le jeu lui-même. « Free » ne
 * décrit pas un cadeau mais une contrainte : Bungie n'accepte que les
 * changements qui ne coûtent rien au joueur — attributs déjà débloqués d'une
 * arme, mods d'armure, fragments d'une doctrine. Tout le reste est refusé, avec
 * un statut explicite qui remonte tel quel jusqu'à l'interface.
 *
 * `characterId` doit être celui qui **détient** l'objet : l'API n'agit pas sur
 * un objet resté au coffre.
 */
export function insertSocketPlugFree({
  accessToken,
  membershipType,
  itemId,
  characterId,
  socketIndex,
  plugItemHash,
}: Omit<ActionTarget, "itemReferenceHash"> & {
  socketIndex: number;
  plugItemHash: number;
}) {
  return post("/Destiny2/Actions/Items/InsertSocketPlugFree/", accessToken, {
    // socketArrayType 0 = tableau `sockets` ordinaire (1 désigne les sockets
    // intrinsèques, que cet endpoint ne touche pas). C'est le même index que
    // celui de `ItemDetail.sockets`.
    plug: { socketIndex, socketArrayType: 0, plugItemHash },
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

// —— Équipements sauvegardés (loadouts) ————————————————————————
//
// Une deuxième famille d'écritures, indépendante de celle des objets : le jeu
// garde par personnage une liste d'emplacements numérotés, que ces trois
// endpoints équipent, enregistrent et vident. `loadoutIndex` est la place dans
// cette liste — celle que renvoie le composant 206, dans le même ordre.
//
// Rien à planifier ici, contrairement aux déplacements : Bungie fait tout le
// travail côté serveur (transferts depuis le coffre compris) en une requête.

export interface LoadoutTarget {
  accessToken: string;
  membershipType: number;
  characterId: string;
  /** Place de l'emplacement dans la liste du personnage, à partir de 0 */
  loadoutIndex: number;
}

/** Équipe l'équipement enregistré à cet emplacement. */
export function equipLoadout({
  accessToken,
  membershipType,
  characterId,
  loadoutIndex,
}: LoadoutTarget) {
  return post("/Destiny2/Actions/Loadouts/EquipLoadout/", accessToken, {
    loadoutIndex,
    characterId,
    membershipType,
  });
}

/**
 * Écrase l'emplacement avec ce que le personnage porte à cet instant.
 *
 * Les trois hashes d'identifiants sont facultatifs pour l'API mais souhaitables
 * ici : sans eux, un emplacement neuf recevrait la couleur, l'icône et le nom
 * par défaut, et écraser un emplacement existant lui ferait perdre les siens.
 */
export function snapshotLoadout({
  accessToken,
  membershipType,
  characterId,
  loadoutIndex,
  colorHash,
  iconHash,
  nameHash,
}: LoadoutTarget & {
  colorHash?: number;
  iconHash?: number;
  nameHash?: number;
}) {
  return post("/Destiny2/Actions/Loadouts/SnapshotLoadout/", accessToken, {
    loadoutIndex,
    characterId,
    membershipType,
    colorHash,
    iconHash,
    nameHash,
  });
}

/**
 * Change la couleur, le glyphe et le nom d'un emplacement, sans toucher à son
 * contenu.
 *
 * Les trois valeurs se choisissent dans des listes fermées, dont l'ordre vient
 * de `DestinyLoadoutConstantsDefinition`.
 */
export function updateLoadoutIdentifiers({
  accessToken,
  membershipType,
  characterId,
  loadoutIndex,
  colorHash,
  iconHash,
  nameHash,
}: LoadoutTarget & {
  colorHash: number;
  iconHash: number;
  nameHash: number;
}) {
  return post(
    "/Destiny2/Actions/Loadouts/UpdateLoadoutIdentifiers/",
    accessToken,
    {loadoutIndex, characterId, membershipType, colorHash, iconHash, nameHash},
  );
}

/** Vide l'emplacement — les objets, eux, restent où ils sont. */
export function clearLoadout({
  accessToken,
  membershipType,
  characterId,
  loadoutIndex,
}: LoadoutTarget) {
  return post("/Destiny2/Actions/Loadouts/ClearLoadout/", accessToken, {
    loadoutIndex,
    characterId,
    membershipType,
  });
}
