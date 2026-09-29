import type { SVGProps } from "react";
import PrimaryAmmoIcon from "./PrimaryAmmoIcon";
import SpecialAmmoIcon from "./SpecialAmmoIcon";
import HeavyAmmoIcon from "./HeavyAmmoIcon";

// DestinyAmmunitionType. Les valeurs sont redites ici plutôt qu'importées de
// `lib/destiny/grouping.ts` : c'est lui qui pointe vers ce module, l'inverse
// fermerait le cycle.
const PRIMARY = 1;
const SPECIAL = 2;
const HEAVY = 3;

/**
 * Vrai si le type de munitions a une icône — faux hors des armes, où `ammoType`
 * vaut 0 (None).
 *
 * Le prédicat existe séparément parce que la mise en page en dépend avant le
 * rendu : la vignette décale son marquage façonné quand le coin est occupé, et
 * l'infobulle d'arme se replie entièrement quand elle n'a rien à montrer.
 */
export function hasAmmoIcon(ammoType: number | undefined): boolean {
  return ammoType === PRIMARY || ammoType === SPECIAL || ammoType === HEAVY;
}

/**
 * Pastille de type de munitions. Aucune n'est dans le manifeste, d'où ces trois
 * icônes locales ; elles portent la couleur du jeu (blanc, vert, violet).
 *
 * Un aiguillage plutôt qu'une table renvoyant le composant : la seconde forme
 * revient à fabriquer un composant pendant le rendu, ce que `react-hooks`
 * refuse — à raison, l'identité du composant n'y est plus garantie stable.
 */
export function AmmoIcon({
  ammoType,
  ...props
}: { ammoType: number | undefined } & SVGProps<SVGSVGElement>) {
  switch (ammoType) {
    case PRIMARY:
      return <PrimaryAmmoIcon {...props} />;
    case SPECIAL:
      return <SpecialAmmoIcon {...props} />;
    case HEAVY:
      return <HeavyAmmoIcon {...props} />;
    default:
      return null;
  }
}
