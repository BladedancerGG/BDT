"use client";

import { ClassSymbol } from "@/components/icons";

/**
 * Symbole de classe (Titan, Chasseur, Arcaniste), teinté par la couleur de
 * texte héritée.
 *
 * Le SVG est rendu **en ligne**, ce qui suffit à faire fonctionner le
 * `currentColor` de son dessin : la teinte suit alors le thème sans dupliquer la
 * palette dans les fichiers. Ce composant posait auparavant le fichier en masque
 * CSS, faute de mieux — une balise `<img>` isole le SVG dans son propre
 * document, où `currentColor` se résout contre sa racine et jamais contre la
 * page, si bien qu'aucun `color` écrit en face ne l'atteignait.
 */
export function ClassIcon({
  classType,
  className,
}: {
  /** DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste */
  classType: number | undefined;
  className?: string;
}) {
  return (
    <ClassSymbol
      classType={classType}
      className={["class-icon", className].filter(Boolean).join(" ")}
    />
  );
}
