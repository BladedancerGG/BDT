// Constantes d'affichage propres à Destiny (couleurs, catégories, enums).

// Rareté (DestinyItemQualityBlockDefinition.tierType)
export const TIER = {
  Basic: 2,
  Common: 3,
  Rare: 4,
  Legendary: 5,
  Exotic: 6,
} as const;

// Couleur d'accent par rareté (barre supérieure / gauche du tooltip).
// Renvoie une variable CSS : la palette est définie une seule fois dans
// scss/layout/theme.scss et sert aussi de fond aux icônes détourées.
export function tierColor(tierType: number | undefined): string {
  switch (tierType) {
    case TIER.Exotic:
      return "var(--tier-exotic)";
    case TIER.Legendary:
      return "var(--tier-legendary)";
    case TIER.Rare:
      return "var(--tier-rare)";
    case TIER.Common:
      return "var(--tier-common)";
    default:
      return "var(--tier-basic)";
  }
}

// Couleur par type de dégâts (DestinyDamageType enum)
export function damageColor(damageType: number | undefined): string {
  switch (damageType) {
    case 2:
      return "#85c5ec"; // Cryo-électrique
    case 3:
      return "#f2721b"; // Solaire
    case 4:
      return "#b184c5"; // Abyssal
    case 6:
      return "#4d88ff"; // Stase
    case 7:
      return "#35e366"; // Filobscur
    default:
      return "#e6e6e6"; // Cinétique
  }
}

// Hashes des catégories de sockets (stables dans le manifeste)
export const SOCKET_CATEGORY = {
  INTRINSIC: 3956125808,
  WEAPON_PERKS: 4241085061,
  WEAPON_MODS: 2685412949,
  ARMOR_PERKS: 3154740035,
  ARMOR_MODS: 590099826,
  ARMOR_COSMETICS: 1926152773,
} as const;

// Type d'objet (DestinyItemType enum)
export const ITEM_TYPE = {
  Armor: 2,
  Weapon: 3,
  Emblem: 14,
  Subclass: 16,
  Ship: 21,
  Vehicle: 22,
  Ghost: 24,
  SeasonalArtifact: 28,
} as const;

// Emplacements d'inventaire (DestinyInventoryBucketDefinition)
export const BUCKET = {
  /** Artéfacts équipables — leur seul identifiant fiable, voir plus bas */
  Artifact: 1506418338,
} as const;

/**
 * Seuls ces types d'objets sont affichés dans les inventaires : ce sont ceux
 * qui composent un équipement. Tout le reste (coques de spectre, emblèmes,
 * vaisseaux, véhicules, consommables, matériaux…) est masqué.
 *
 * Note : l'emblème affiché sur l'onglet d'un personnage ne vient pas de
 * l'inventaire mais de `emblemBackgroundPath`, il n'est donc pas concerné.
 */
export const DISPLAYED_ITEM_TYPES: ReadonlySet<number> = new Set([
  ITEM_TYPE.Weapon,
  ITEM_TYPE.Armor,
  ITEM_TYPE.Subclass,
  ITEM_TYPE.SeasonalArtifact,
]);

/**
 * Emplacements dont le contenu est affiché quel que soit son `itemType`.
 *
 * Les artéfacts équipables sont un cas particulier : leur définition porte
 * `itemType: 0` (None), aucune `itemCategoryHashes` et aucun `traitId`. Le seul
 * critère stable et indépendant de la langue est donc leur emplacement.
 */
export const DISPLAYED_BUCKETS: ReadonlySet<number> = new Set([BUCKET.Artifact]);

// Sous-types d'objets (DestinyItemSubType) utiles à l'affichage
export const ITEM_SUBTYPE = {
  /** Les épées ont leur propre jeu de statistiques */
  Sword: 18,
} as const;

// Hashes de stats d'arme mis en avant dans la ligne "archétype"
export const WEAPON_STAT = {
  RPM: 4284893193, // cadence de tir
  IMPACT: 4043523819, // impact
} as const;

export const BUNGIE_ROOT = "https://www.bungie.net";
