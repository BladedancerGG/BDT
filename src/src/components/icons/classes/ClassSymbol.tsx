import type { SVGProps } from "react";
import TitanIcon from "./TitanIcon";
import HunterIcon from "./HunterIcon";
import WarlockIcon from "./WarlockIcon";

/**
 * Symbole de classe nu (DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste),
 * dessiné en `currentColor`.
 *
 * `ClassIcon` l'habille de la classe `.class-icon` pour les usages courants ;
 * ce composant-ci sert là où l'habillage vient d'ailleurs, comme les en-têtes de
 * groupes du coffre.
 */
export function ClassSymbol({
  classType,
  ...props
}: { classType: number | undefined } & SVGProps<SVGSVGElement>) {
  switch (classType) {
    case 0:
      return <TitanIcon {...props} />;
    case 1:
      return <HunterIcon {...props} />;
    case 2:
      return <WarlockIcon {...props} />;
    default:
      return null;
  }
}
