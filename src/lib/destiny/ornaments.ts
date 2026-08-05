// Résolution de l'ornement équipé sur un objet.
//
// Constats issus de l'inspection du manifeste et d'un profil réel :
//  - les sockets cosmétiques sont regroupés dans deux catégories,
//    OBJETS COSMÉTIQUES D'ARME et D'ARMURE ;
//  - ces sockets contiennent aussi bien des shaders que des effets visuels et
//    les ornements, tous mélangés ;
//  - `plug.plugCategoryIdentifier` sépare les ornements du reste :
//      « armor_skins_hunter_arms », « v500_repackage_hand_cannon0_skins » → ornements
//      « armor_skins_empty »                    → emplacement vide
//      « shader », « weapon_tiering_kill_vfx »  → à ignorer
//  - MAIS certains sockets portent un plug « Ornement d'origine » : un
//    placeholder à l'icône générique partagée par tous les objets. Il faut
//    l'écarter, sinon Hawkmoon, Ergo Sum et ~230 autres objets affichent cette
//    image générique au lieu de leur icône.
//    Le discriminant est sémantique et sans nombre magique : ce placeholder est
//    précisément le `singleInitialItemHash` du socket, c'est-à-dire le plug
//    présent quand aucun ornement n'a été appliqué.
//    (Ni `tierType` ni `uiPlugLabel` ne fonctionnent : 66 vrais ornements sont
//    aussi en rareté « Basique », et `uiPlugLabel` est vide partout.)

import type { InventoryItemDefinition } from "./types";

/** Catégories de sockets contenant les ornements (arme et armure). */
export const COSMETIC_SOCKET_CATEGORIES: ReadonlySet<number> = new Set([
  1926152773, // OBJETS COSMÉTIQUES D'ARMURE
  2048875504, // OBJETS COSMÉTIQUES D'ARME
]);

/**
 * Un plug est un ornement si sa famille mentionne « skins », en excluant les
 * emplacements vides (« …_empty »).
 */
export function isOrnamentPlug(def: InventoryItemDefinition | undefined): boolean {
  const family = def?.plug?.plugCategoryIdentifier;
  if (!family) return false;
  return family.includes("skins") && !family.includes("empty");
}

/** Index des sockets cosmétiques d'un objet, d'après sa définition. */
export function cosmeticSocketIndexes(
  def: InventoryItemDefinition | undefined,
): number[] {
  const categories = def?.sockets?.socketCategories ?? [];
  return categories
    .filter((category) =>
      COSMETIC_SOCKET_CATEGORIES.has(category.socketCategoryHash),
    )
    .flatMap((category) => category.socketIndexes);
}

// Le test « un ornement a-t-il été appliqué ? » est le cas général d'un plug
// inséré : voir isPlugApplied dans sockets.ts.
