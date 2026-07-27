"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import { useItemConstants } from "@/lib/destiny/use-item-constants";
import { itemOverlays } from "@/lib/destiny/overlays";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

export interface ItemThumbProps {
  itemHash: number;
  /** Masque ItemState (façonné, amélioré…) */
  state?: number;
  /** Version de l'objet, pour choisir le bon filigrane de saison */
  versionNumber?: number;
  /** Palier d'équipement (1–5) */
  gearTier?: number;
}

/**
 * Vignette d'un objet : son icône surmontée de ses habillages.
 *
 * Filigrane de saison, palier d'équipement et marquages « façonné » /
 * « amélioré » sont tous des images 96×96 fournies par le manifeste, qui
 * portent déjà leur propre positionnement — on les empile donc simplement.
 */
export function ItemThumb({
  itemHash,
  state,
  versionNumber,
  gearTier,
  className,
}: ItemThumbProps & { className?: string }) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    itemHash,
  );
  const constants = useItemConstants();

  const icon = def?.displayProperties?.icon;
  const name = def?.displayProperties?.name ?? "";

  // Calques ordonnés du fond vers le dessus : filigrane, palier, puis le fond
  // et le marquage façonné/amélioré (voir itemOverlays).
  const overlays = itemOverlays({
    def,
    constants,
    state,
    versionNumber,
    gearTier,
  });

  return (
    <span className={`item-thumb${className ? ` ${className}` : ""}`}>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${icon}`}
          alt={name}
          className="item-thumb__img"
          loading="lazy"
        />
      )}
      {overlays.map((path, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${path}-${i}`}
          src={`${BUNGIE_ROOT}${path}`}
          alt=""
          className="item-thumb__overlay"
        />
      ))}
    </span>
  );
}
