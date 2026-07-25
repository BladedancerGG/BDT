"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import type { StatDefinition } from "@/lib/destiny/types";

// Une ligne de statistique : nom + valeur + barre proportionnelle.
export function StatBar({
  statHash,
  value,
  max,
  accent = "#c8c8c8",
}: {
  statHash: number;
  value: number;
  max: number;
  accent?: string;
}) {
  const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
  const name = def?.displayProperties?.name;
  if (!name) return null;

  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 truncate text-right text-neutral-300">{name}</span>
      <span className="w-8 text-right font-medium tabular-nums">{value}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-neutral-700">
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
