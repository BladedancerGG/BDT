// Garde-fou contre les instantanés de profil périmés.
//
// Bungie sert `GetProfile` derrière un cache dont le CONTENU retarde de
// quelques secondes sur les écritures qu'on vient d'émettre. Recharger juste
// après une action réussie peut donc renvoyer l'objet à son ancienne place — ou
// l'attribut qu'on vient de remplacer —, et l'écraser sur le cache local le
// fait « sauter » en arrière.
//
// La date de fabrication de la réponse (`responseMintedTimestamp`) ne sert à
// rien ici : elle est fraîche même quand les données ne le sont pas — c'est la
// réponse qui vient d'être fabriquée, pas l'instantané qu'elle transporte.
//
// Le seul signal fiable est donc le contenu : on retient ce que nos écritures
// ont laissé derrière elles, et on refuse une réponse qui montre autre chose.
// C'est exact — pas d'horloge, pas de fenêtre à régler — au prix d'un faux
// positif si le joueur touche au même objet en jeu au même moment ; la garde se
// lève alors d'elle-même après quelques tentatives.
//
// Trois natures d'écriture à surveiller, et il en faut bien trois : un
// déplacement change la place de l'objet sans toucher à ses sockets, une
// insertion d'attribut fait l'inverse, et une action sur un emplacement
// d'équipement ne touche à aucun objet — elle réécrit l'emplacement lui-même.
//
// L'oubli de la troisième se voyait ainsi : créer, écraser ou supprimer un
// équipement le corrigeait bien dans le cache local, puis le rechargement de fin
// de file ramenait l'instantané d'avant. Rien ne le retenait, `isStaleProfile`
// ne regardant alors que les objets.
//
// Pas de "use client" : ce module n'a pas de dépendance React, mais son état
// mutable n'a de sens que dans l'onglet qui a émis les écritures.

import { locateItem, type ItemPlace } from "@/lib/destiny/moves";
import type { ProfileData } from "./use-profile";

/** Position attendue de chaque objet déplacé, par itemInstanceId. */
let expectedPlaces = new Map<string, string>();

/** Attribut attendu dans chaque socket touché, par `itemInstanceId:socketIndex`. */
let expectedPlugs = new Map<string, number | undefined>();

/** État attendu de chaque emplacement d'équipement touché, par `loadoutKey`. */
let expectedLoadouts = new Map<string, string>();

/** Position réduite à une chaîne comparable — `null` = objet introuvable. */
function placeKey(place: ItemPlace | null): string {
  return !place
    ? "absent"
    : place.kind === "vault"
      ? "vault"
      : `${place.kind}:${place.characterId}`;
}

function placeOf(profile: ProfileData, itemInstanceId: string): string {
  return placeKey(locateItem(profile, itemInstanceId)?.place ?? null);
}

/** Identifie un socket dans les deux tables. */
export function socketKey(itemInstanceId: string, socketIndex: number): string {
  return `${itemInstanceId}:${socketIndex}`;
}

/** Identifie un emplacement d'équipement. */
export function loadoutKey(
  characterId: string,
  loadoutIndex: number,
): string {
  return `${characterId}#${loadoutIndex}`;
}

/**
 * Réduit un emplacement à une chaîne comparable : ses trois identifiants et
 * l'**ensemble** de ses objets.
 *
 * Trié, et les entrées de remplissage écartées : l'API rend dix entrées dans son
 * propre ordre, dont des `itemInstanceId` à « 0 » sur les emplacements
 * partiellement enregistrés (voir isEmptyLoadout). Comparer la liste telle
 * quelle n'aurait jamais concordé avec ce que le rejeu local a écrit, et la
 * garde ne se serait jamais levée.
 */
function loadoutSignature(profile: ProfileData, key: string): string {
  const separator = key.lastIndexOf("#");
  const characterId = key.slice(0, separator);
  const loadoutIndex = Number(key.slice(separator + 1));
  const loadout = profile.loadouts?.[characterId]?.[loadoutIndex];
  if (!loadout) return "absent";

  const items = loadout.items
    .map((item) => item.itemInstanceId)
    .filter((id) => id && id !== "0")
    .sort()
    .join(",");
  return `${loadout.colorHash}/${loadout.iconHash}/${loadout.nameHash}/${items}`;
}

/**
 * Plug lu dans un instantané. `undefined` quand l'objet n'y est pas encore :
 * c'est une valeur distincte de `0` (socket vide), qui est une réponse.
 */
function plugOf(profile: ProfileData, key: string): number | undefined {
  const separator = key.lastIndexOf(":");
  const itemInstanceId = key.slice(0, separator);
  const socketIndex = Number(key.slice(separator + 1));
  return profile.items?.[itemInstanceId]?.sockets?.[socketIndex];
}

/**
 * Enregistre, depuis le profil local à jour, où les déplacements réussis ont
 * laissé les objets touchés. À appeler une fois la file vidée.
 */
export function markLocalMoves(
  profile: ProfileData,
  itemInstanceIds: Iterable<string>,
) {
  for (const itemInstanceId of itemInstanceIds) {
    expectedPlaces.set(itemInstanceId, placeOf(profile, itemInstanceId));
  }
}

/**
 * Même chose pour les attributs équipés : quel plug chaque socket touché doit
 * porter. Les clés sont celles de `socketKey`.
 */
export function markLocalPlugs(
  profile: ProfileData,
  socketKeys: Iterable<string>,
) {
  for (const key of socketKeys) {
    expectedPlugs.set(key, plugOf(profile, key));
  }
}

/**
 * Même chose pour les emplacements d'équipement : dans quel état chacun doit se
 * retrouver. Les clés sont celles de `loadoutKey`.
 */
export function markLocalLoadouts(
  profile: ProfileData,
  keys: Iterable<string>,
) {
  for (const key of keys) {
    expectedLoadouts.set(key, loadoutSignature(profile, key));
  }
}

/** Vrai quand la réponse ne reflète pas encore nos écritures. */
export function isStaleProfile(fresh: ProfileData): boolean {
  for (const [itemInstanceId, place] of expectedPlaces) {
    if (placeOf(fresh, itemInstanceId) !== place) return true;
  }
  for (const [key, plugHash] of expectedPlugs) {
    if (plugOf(fresh, key) !== plugHash) return true;
  }
  for (const [key, signature] of expectedLoadouts) {
    if (loadoutSignature(fresh, key) !== signature) return true;
  }
  return false;
}

/** Plus rien à vérifier : réponse acceptée, ou garde abandonnée. */
export function clearLocalWrites() {
  expectedPlaces = new Map();
  expectedPlugs = new Map();
  expectedLoadouts = new Map();
}
