"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import {
  ITEM_CONSTANTS_HASH,
  type ItemConstantsDefinition,
} from "./overlays";

/**
 * Constantes d'affichage des objets (chemins des overlays de palier, de
 * façonnage et d'amélioration). Table à entrée unique du manifeste.
 */
export function useItemConstants(): ItemConstantsDefinition | undefined {
  return useDefinition<ItemConstantsDefinition>(
    "DestinyInventoryItemConstantsDefinition",
    ITEM_CONSTANTS_HASH,
  );
}
