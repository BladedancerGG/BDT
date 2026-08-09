// Garde-fou contre les instantanés de profil périmés.
//
// Bungie sert `GetProfile` derrière un cache dont le CONTENU retarde de
// quelques secondes sur les écritures qu'on vient d'émettre. Recharger juste
// après un déplacement réussi peut donc renvoyer l'objet à son ancienne place,
// et l'écraser sur le cache local le fait « sauter » en arrière.
//
// La date de fabrication de la réponse (`responseMintedTimestamp`) ne sert à
// rien ici : elle est fraîche même quand les données ne le sont pas — c'est la
// réponse qui vient d'être fabriquée, pas l'instantané qu'elle transporte.
//
// Le seul signal fiable est donc le contenu : on retient où nos déplacements
// ont laissé les objets touchés, et on refuse une réponse qui les montre encore
// ailleurs. C'est exact — pas d'horloge, pas de fenêtre à régler — au prix d'un
// faux positif si le joueur déplace le même objet en jeu au même moment ; la
// garde se lève alors d'elle-même après quelques tentatives.
//
// Pas de "use client" : ce module n'a pas de dépendance React, mais son état
// mutable n'a de sens que dans l'onglet qui a émis les déplacements.

import { locateItem, type ItemPlace } from "@/lib/destiny/moves";
import type { ProfileData } from "./use-profile";

/** Position attendue de chaque objet déplacé, par itemInstanceId. */
let expected = new Map<string, string>();

/** Position réduite à une chaîne comparable — `null` = objet introuvable. */
function placeKey(place: ItemPlace | null): string {
  if (!place) return "absent";
  return place.kind === "vault" ? "vault" : `${place.kind}:${place.characterId}`;
}

function keyOf(profile: ProfileData, itemInstanceId: string): string {
  return placeKey(locateItem(profile, itemInstanceId)?.place ?? null);
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
    expected.set(itemInstanceId, keyOf(profile, itemInstanceId));
  }
}

/** Vrai quand la réponse ne reflète pas encore nos déplacements. */
export function isStaleProfile(fresh: ProfileData): boolean {
  for (const [itemInstanceId, place] of expected) {
    if (keyOf(fresh, itemInstanceId) !== place) return true;
  }
  return false;
}

/** Plus rien à vérifier : réponse acceptée, ou garde abandonnée. */
export function clearLocalMoves() {
  expected = new Map();
}
