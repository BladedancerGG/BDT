"use client";

import type { CSSProperties } from "react";
import { classIconPath } from "@/lib/destiny/icons";

/**
 * Symbole de classe (Titan, Chasseur, Arcaniste), teinté par la couleur de
 * texte héritée.
 *
 * Rendu en **masque CSS** et non par une balise `<img>` : un SVG chargé par
 * `<img>` est un document isolé, où `currentColor` se résout contre sa propre
 * racine et jamais contre la page. Le `color` du parent ne l'atteint donc pas,
 * quelle que soit la règle écrite en face. Le masque, lui, ne retient que la
 * silhouette du fichier et la remplit avec `currentColor` — la teinte suit
 * alors le thème sans dupliquer la palette dans les SVG.
 *
 * Le chemin passe en variable CSS inline, comme les autres valeurs dynamiques
 * du projet (couleur de rareté, emblème d'onglet).
 */
export function ClassIcon({
  classType,
  className,
}: {
  /** DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste */
  classType: number | undefined;
  className?: string;
}) {
  const path = classIconPath(classType);
  if (!path) return null;

  return (
    <span
      className={["class-icon", className].filter(Boolean).join(" ")}
      style={{ "--class-icon": `url(${path})` } as CSSProperties}
      aria-hidden
    />
  );
}
