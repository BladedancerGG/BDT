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
  sockets?: {
    socketEntries: SocketEntryDefinition[];
    socketCategories: {
      socketCategoryHash: number;
      socketIndexes: number[];
    }[];
  };
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