"use client";

import type { CSSProperties } from "react";
import {
  useSharedDefinition,
  useSharedIconDefinition,
  useSharedItemConstants,
  useOrnamentIcon,
} from "@/lib/destiny/item-defs";
import { itemOverlays, ornamentBackgroundPath } from "@/lib/destiny/overlays";
import { bestIconPath, tierClassName } from "@/lib/destiny/icons";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

export interface ItemThumbProps {
  itemHash: number;
  /** Nécessaire pour retrouver l'ornement équipé sur cette instance */
  itemInstanceId?: string;
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
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
  className,
}: ItemThumbProps & { className?: string }) {
  // Servies par ItemDefsProvider : une seule requête groupée pour tout
  // l'inventaire, au lieu de deux par vignette.
  const def = useSharedDefinition(itemHash);
  const iconDef = useSharedIconDefinition(itemHash);
  const constants = useSharedItemConstants();
  // Vide si l'option « afficher les ornements » est désactivée
  const ornamentIcon = useOrnamentIcon(itemInstanceId);

  // PNG détouré quand le manifeste en fournit un, sinon repli sur le JPEG
  // (qui, lui, a le fond de rareté incrusté dans l'image).
  const icon = ornamentIcon ?? bestIconPath(def, iconDef);
  const name = def?.displayProperties?.name ?? "";

  // Le fond de rareté n'est utile que pour les icônes détourées : le JPEG le
  // porte déjà. Il est fourni par le SCSS via une classe de rareté, sauf pour
  // les objets « holofoil » qui reçoivent une image animée à la place.
  const tierType = def?.inventory?.tierType;
  const holofoil = def?.isHolofoil
    ? constants?.holofoil900BackgroundOverlayPath
    : undefined;

  // Les icônes d'ornement sont détourées : le jeu leur ajoute un fond, choisi
  // selon la rareté. Il se place DERRIÈRE l'image.
  const background = ornamentIcon
    ? ornamentBackgroundPath(constants, tierType)
    : undefined;

  // Calques ordonnés du fond vers le dessus : filigrane, palier, puis le fond
  // et le marquage façonné/amélioré (voir itemOverlays).
  const overlays = itemOverlays({
    def,
    constants,
    state,
    versionNumber,
    gearTier,
  });

  const classes = [
    "item-thumb",
    `item-thumb--tier-${tierClassName(tierType)}`,
    holofoil ? "item-thumb--holofoil" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      // L'URL du fond holofoil vient du manifeste, pas du SCSS
      style={
        holofoil
          ? ({
              "--holofoil-bg": `url(${BUNGIE_ROOT}${holofoil})`,
            } as CSSProperties)
          : undefined
      }
    >
      {background && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${background}`}
          alt=""
          className="item-thumb__background"
        />
      )}
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
