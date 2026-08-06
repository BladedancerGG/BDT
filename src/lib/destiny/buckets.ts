// Emplacements d'équipement (DestinyInventoryBucketDefinition, catégorie 3).
//
// Les hashes et l'ordre viennent du manifeste : `bucketOrder` y vaut 10, 20, 30…
// et correspond à l'ordre d'affichage du jeu. Les libellés ne sont pas codés ici,
// ils sont lus depuis le manifeste — donc traduits automatiquement.

export const BUCKET = {
  Subclass: 3284755031,
  KineticWeapons: 1498876634,
  EnergyWeapons: 2465295065,
  PowerWeapons: 953998645,
  Artifact: 1506418338,
  Helmet: 3448274439,
  Gauntlets: 3551918588,
  ChestArmor: 14239492,
  LegArmor: 20886954,
  ClassArmor: 1585787867,
  /**
   * Le Courrier. Non équipable, mais présent dans l'inventaire du personnage :
   * sans traitement dédié, ses objets disparaîtraient de l'affichage.
   */
  Postmaster: 215593132,
} as const;

/**
 * Colonne de gauche : doctrine, armes, artéfact.
 * L'inventaire de ces emplacements se déplie **vers la gauche**.
 */
export const WEAPON_COLUMN: readonly number[] = [
  BUCKET.Subclass,
  BUCKET.KineticWeapons,
  BUCKET.EnergyWeapons,
  BUCKET.PowerWeapons,
  BUCKET.Artifact,
];

/**
 * Colonne de droite : pièces d'armure.
 * L'inventaire de ces emplacements se déplie **vers la droite**.
 */
export const ARMOR_COLUMN: readonly number[] = [
  BUCKET.Helmet,
  BUCKET.Gauntlets,
  BUCKET.ChestArmor,
  BUCKET.LegArmor,
  BUCKET.ClassArmor,
];

/** Tous les emplacements couverts par les deux colonnes. */
export const EQUIPMENT_BUCKETS: ReadonlySet<number> = new Set([
  ...WEAPON_COLUMN,
  ...ARMOR_COLUMN,
]);

/** Côté vers lequel le panneau d'inventaire d'un emplacement se déplie. */
export type SlotSide = "left" | "right";

/** Regroupe des objets par emplacement. */
export function groupByBucket<T extends { bucketHash: number }>(
  items: readonly T[],
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const existing = groups.get(item.bucketHash);
    if (existing) existing.push(item);
    else groups.set(item.bucketHash, [item]);
  }
  return groups;
}
