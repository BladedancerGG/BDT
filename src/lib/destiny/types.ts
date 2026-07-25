import type { DisplayProperties } from "@/lib/manifest/use-definition";

// Champs de DestinyInventoryItemDefinition réellement utilisés par l'UI.
export interface InventoryItemDefinition {
  displayProperties: DisplayProperties;
  itemType: number;
  itemTypeDisplayName?: string;
  iconWatermark?: string;
  inventory?: { tierType: number; tierTypeName?: string };
  defaultDamageType?: number;
  sockets?: {
    socketEntries: { singleInitialItemHash: number }[];
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
