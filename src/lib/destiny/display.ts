// Constantes d'affichage propres à Destiny (couleurs, catégories, enums).

// Rareté (DestinyItemQualityBlockDefinition.tierType)
export const TIER = {
  Basic: 2,
  Common: 3,
  Rare: 4,
  Legendary: 5,
  Exotic: 6,
} as const;

// Couleur d'accent par rareté (barre supérieure / gauche du tooltip)
export function tierColor(tierType: number | undefined): string {
  switch (tierType) {
    case TIER.Exotic:
      return "#ceae33"; // or
    case TIER.Legendary:
      return "#522f65"; // violet
    case TIER.Rare:
      return "#5076a3"; // bleu
    case TIER.Common:
      return "#366f42"; // vert
    default:
      return "#c3bcb4"; // blanc/gris
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

// Type d'objet (DestinyItemType enum) — utile pour distinguer arme/armure
export const ITEM_TYPE = {
  Armor: 2,
  Weapon: 3,
} as const;

// Hashes de stats d'arme mis en avant dans la ligne "archétype"
export const WEAPON_STAT = {
  RPM: 4284893193, // cadence de tir
  IMPACT: 4043523819, // impact
} as const;

export const BUNGIE_ROOT = "https://www.bungie.net";
