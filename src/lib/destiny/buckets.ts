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
  /**
   * Le coffre — « Général » dans le manifeste, `scope: 1` (compte) : c'est le
   * seul emplacement partagé par tous les personnages, donc le seul point de
   * passage d'un transfert de l'un à l'autre.
   */
  Vault: 138197802,

  // —— Rangement partagé ——————————————————————————————————————
  //
  // Comme le coffre, ces deux emplacements sont de portée compte (`scope: 1`) :
  // leurs objets arrivent donc dans `profileInventory`, à côté de ceux du
  // coffre, et non dans l'inventaire d'un personnage — le jeu les montre
  // pourtant sur chaque personnage, puisqu'ils sont communs.

  /** « Objets à usage unique » : consommables, empilés par `quantity` */
  Consumables: 1469714392,
  /** « Modificateurs » : les mods possédés, hors de tout objet */
  Modifications: 3313201758,
  /**
   * « Matériaux ». Sa capacité est nulle dans le manifeste — le jeu n'y range
   * plus rien depuis longtemps — mais il reste nommé dans l'onglet, et une
   * section vide ne s'affiche pas : le garder ne coûte rien et couvre le cas
   * où un compte en porterait encore.
   */
  Materials: 3865314626,

  // —— Personnalisation ————————————————————————————————————————
  //
  // Emplacements d'équipement du personnage (`category: 3`) au même titre que
  // les armes : un objet équipé, et des remplaçants dans son inventaire.
  // Aucun n'entre dans un équipement au sens de l'app, d'où leur affichage
  // séparé, derrière un bouton.

  Emblems: 4274335291,
  Ships: 284967655,
  /** « Véhicules » dans le manifeste — les passereaux */
  Sparrows: 2025709351,
  GhostShells: 4023194814,
  Finishers: 3683254069,
  /** « Interactions » : la collection d'interactions équipée */
  Emotes: 1107761855,
} as const;

/**
 * Capacité de repli, objet équipé compris, si le manifeste n'a pas encore
 * répondu. Elle vaut 10 pour les armes et armures ; l'artéfact (7) et le coffre
 * (1300) diffèrent, d'où la lecture du manifeste dès qu'elle est disponible.
 */
export const DEFAULT_BUCKET_CAPACITY = 10;

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

/**
 * Emplacements d'armes, au sens de la limite d'un exotique équipé.
 *
 * Ce n'est pas `WEAPON_COLUMN` : celle-ci contient aussi la doctrine et
 * l'artéfact, qui ne sont ni des armes ni soumis à cette limite.
 */
export const WEAPON_BUCKETS: ReadonlySet<number> = new Set([
  BUCKET.KineticWeapons,
  BUCKET.EnergyWeapons,
  BUCKET.PowerWeapons,
]);

/** Emplacements d'armure — l'objet de classe compte dans la limite. */
export const ARMOR_BUCKETS: ReadonlySet<number> = new Set(ARMOR_COLUMN);

/** Tous les emplacements couverts par les deux colonnes. */
export const EQUIPMENT_BUCKETS: ReadonlySet<number> = new Set([
  ...WEAPON_COLUMN,
  ...ARMOR_COLUMN,
]);

/**
 * Rangement partagé, affiché à la suite du coffre : consommables et mods.
 *
 * L'ordre est celui du manifeste (`bucketOrder` : 20 puis 30).
 */
export const STORAGE_BUCKETS: readonly number[] = [
  BUCKET.Modifications,
  BUCKET.Consumables,
  BUCKET.Materials,
];

/** Objets de personnalisation portés — colonne de gauche. */
export const CUSTOMIZATION_LEFT: readonly number[] = [
  BUCKET.Emblems,
  BUCKET.Ships,
  BUCKET.Sparrows,
];

/** Objets de personnalisation portés — colonne de droite. */
export const CUSTOMIZATION_RIGHT: readonly number[] = [
  BUCKET.GhostShells,
  BUCKET.Finishers,
  BUCKET.Emotes,
];

/**
 * Tous les emplacements de personnalisation.
 *
 * Le test porte sur le `bucketHash` **de l'objet** et non sur sa définition :
 * équipés comme rangés sur le personnage, ces objets sont déjà dans leur
 * emplacement d'origine — inutile de passer par le manifeste, contrairement au
 * coffre où tout le monde annonce « Général ».
 */
export const CUSTOMIZATION_BUCKETS: ReadonlySet<number> = new Set([
  ...CUSTOMIZATION_LEFT,
  ...CUSTOMIZATION_RIGHT,
]);

/**
 * Rang d'affichage d'un emplacement, celui des deux colonnes d'équipement —
 * lui-même issu du `bucketOrder` du manifeste. Sert à ordonner les sections du
 * coffre ; un emplacement absent d'ici passe en dernier.
 */
export const BUCKET_ORDER: ReadonlyMap<number, number> = new Map(
  [
    ...WEAPON_COLUMN,
    ...ARMOR_COLUMN,
    // Les deux autres familles à la suite, dans l'ordre de leurs colonnes :
    // elles ne partagent jamais l'écran avec les armes, mais le coffre les
    // découpe en sections de la même façon.
    ...CUSTOMIZATION_LEFT,
    ...CUSTOMIZATION_RIGHT,
    ...STORAGE_BUCKETS,
  ].map((hash, index) => [hash, index]),
);

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
