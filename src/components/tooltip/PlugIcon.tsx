"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

// Icône ronde d'un plug (perk / mod), résolue via son hash dans le manifeste.
export function PlugIcon({ hash, size = 40 }: { hash: number; size?: number }) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    hash,
  );
  const icon = def?.displayProperties?.icon;
  const name = def?.displayProperties?.name ?? "";

  return (
    <div
      title={name}
      className="shrink-0 overflow-hidden rounded-full border border-neutral-600 bg-neutral-800"
      style={{ width: size, height: size }}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${BUNGIE_ROOT}${icon}`} alt={name} className="h-full w-full" />
      )}
    </div>
  );
}
