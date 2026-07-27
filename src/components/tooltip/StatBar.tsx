"use client";

import type { CSSProperties } from "react";
import { useDefinition } from "@/lib/manifest/use-definition";
import type { StatDefinition } from "@/lib/destiny/types";

// Une ligne de statistique : nom + valeur + barre proportionnelle.
export function StatBar({
  statHash,
  value,
  max,
  color,
}: {
  statHash: number;
  value: number;
  max: number;
  color?: string;
}) {
  const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
  const name = def?.displayProperties?.name;
  if (!name) return null;

  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="stat-bar">
      <span className="stat-bar__name">{name}</span>
      <span className="stat-bar__value">{value}</span>
      <div className="stat-bar__track">
        {/* Largeur et couleur transmises au CSS par variables */}
        <div
          className="stat-bar__fill"
          style={
            {
              "--stat-pct": `${pct}%`,
              ...(color ? { "--stat-color": color } : {}),
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}
