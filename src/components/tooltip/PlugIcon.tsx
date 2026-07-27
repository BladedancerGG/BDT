"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

/**
 * Icône d'un plug (perk / mod), résolue via son hash dans le manifeste.
 * - `square` : mods et cosmétiques (forme carrée)
 * - `state`  : met en avant le plug équipé parmi les options disponibles
 */
export function PlugIcon({
  hash,
  square = false,
  state,
}: {
  hash: number;
  square?: boolean;
  state?: "equipped" | "available";
}) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    hash,
  );
  const icon = def?.displayProperties?.icon;
  const name = def?.displayProperties?.name ?? "";

  const classes = [
    "plug-icon",
    square ? "plug-icon--square" : null,
    state ? `plug-icon--${state}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div title={name} className={classes}>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${icon}`}
          alt={name}
          className="plug-icon__img"
        />
      )}
    </div>
  );
}
