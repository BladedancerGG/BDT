import type { DisplayProperties } from "@/lib/manifest/use-definition";

/** Un socket tel que décrit par la définition de l'objet. */
export interface SocketEntryDefinition {
  singleInitialItemHash: number;
  /** Pool de plugs fixe (perks curatés) */
  reusablePlugSetHash?: number;
  /** Pool de plugs tiré aléatoirement (rolls aléatoires) */
  randomizedPlugSetHash?: number;
  reusablePlugItems?: { plugItemHash: number }[];
}

// Champs de DestinyInventoryItemDefinition réellement utilisés par l'UI.
export interface InventoryItemDefinition {
  displayProperties: DisplayProperties;
  itemType: number;
  /** DestinyItemSubType — distingue notamment les épées (18) */
  itemSubType?: number;
  itemTypeDisplayName?: string;
  /** Présent sur les plugs (perks, mods, ornements, shaders…) */
  plug?: { plugCategoryIdentifier?: string };
  /** Écarts de statistiques conférés — voir plug-stats.ts */
  investmentStats?: {
    statTypeHash: number;
    value: number;
    isConditionallyActive?: boolean;
  }[];
  /**
   * Perks associés. Aspects, fragments et attributs d'artéfact ont un
   * `displayProperties.description` vide : leur texte est ici.
   * `perkVisibility` : 0 = visible, 1 = désactivé, 2 = masqué.
   */
  perks?: { perkHash: number; perkVisibility?: number }[];
  /** Filigrane de saison par défaut */
  iconWatermark?: string;
  /** Filigrane des objets « mis en avant » */
  iconWatermarkFeatured?: string;
  isFeaturedItem?: boolean;
  /** Objet « holofoil » : fond animé au lieu de la couleur de rareté */
  isHolofoil?: boolean;
  quality?: {
    /** Filigranes par version : indexés par le versionNumber de l'instance */
    displayVersionWatermarkIcons?: string[];
  };
  inventory?: {
    tierType: number;
    tierTypeName?: string;
    /** Emplacement d'origine de l'objet */
    bucketTypeHash?: number;
  };
  defaultDamageType?: number;
  /**
   * Présent sur les doctrines : `hudDamageType` porte leur élément
   * (`defaultDamageType` vaut toujours 0), `buildName` le couple élément/classe.
   */
  talentGrid?: { hudDamageType?: number; buildName?: string };
  equippingBlock?: {
    /** Ensemble d'armures conférant des bonus, s'il y en a un */
    equipableItemSetHash?: number;
    /**
     * Type de munitions (DestinyAmmunitionType) : 1 primaires, 2 spéciales,
     * 3 lourdes. Vaut 0 (None) hors des armes — il ne dépend plus de
     * l'emplacement de l'objet depuis longtemps.
     */
    ammoType?: number;
  };
  sockets?: {
    socketEntries: SocketEntryDefinition[];
    socketCategories: {
      socketCategoryHash: number;
      socketIndexes: number[];
    }[];
  };
}

/** Bonus d'ensemble : perks actifs à partir de N pièces équipées. */
export interface EquipableItemSetDefinition {
  displayProperties: DisplayProperties;
  /** Tous les objets de l'ensemble (5 emplacements × 3 classes) */
  setItems: number[];
  setPerks: { requiredSetCount: number; sandboxPerkHash: number }[];
}

export interface SandboxPerkDefinition {
  displayProperties: DisplayProperties;
  /** false quand le perk ne porte pas d'information destinée au joueur */
  isDisplayable?: boolean;
}

export interface StatDefinition {
  displayProperties: DisplayProperties;
  statCategory?: number;
}

export interface SocketCategoryDefinition {
  displayProperties: DisplayProperties;
}

/** Pool de plugs possibles pour un socket. */
export interface PlugSetDefinition {
  reusablePlugItems: {
    plugItemHash: number;
    currentlyCanRoll?: boolean;
  }[];
}