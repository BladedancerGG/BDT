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
  itemTypeDisplayName?: string;
  iconWatermark?: string;
  inventory?: { tierType: number; tierTypeName?: string };
  defaultDamageType?: number;
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