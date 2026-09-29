import type { SVGProps } from "react";
import AutoRifleIcon from "./AutoRifleIcon";
import BowIcon from "./BowIcon";
import FusionRifleIcon from "./FusionRifleIcon";
import GlaiveIcon from "./GlaiveIcon";
import GrenadeLauncherHeavyIcon from "./GrenadeLauncherHeavyIcon";
import GrenadeLauncherSpecialIcon from "./GrenadeLauncherSpecialIcon";
import HandCannonIcon from "./HandCannonIcon";
import LinearFusionRifleIcon from "./LinearFusionRifleIcon";
import MachineGunIcon from "./MachineGunIcon";
import PulseRifleIcon from "./PulseRifleIcon";
import RocketLauncherIcon from "./RocketLauncherIcon";
import ScoutRifleIcon from "./ScoutRifleIcon";
import ShotgunIcon from "./ShotgunIcon";
import SidearmIcon from "./SidearmIcon";
import SniperRifleIcon from "./SniperRifleIcon";
import SubmachineGunIcon from "./SubmachineGunIcon";
import SwordIcon from "./SwordIcon";
import TraceRifleIcon from "./TraceRifleIcon";

/** Type de munitions « lourdes » (DestinyAmmunitionType), seul cas utile ici. */
const HEAVY_AMMO = 3;

/**
 * Silhouette du type d'arme (DestinyItemSubType), dessinée en `currentColor`.
 *
 * Les sous-types sont relevés sur le manifeste (version 244213) en recoupant
 * `itemSubType` et `itemTypeDisplayName` sur les 2000+ armes légendaires et
 * exotiques : la couverture est totale, aucun autre sous-type n'apparaît sur une
 * arme. Un sous-type inconnu ne rend rien plutôt qu'un glyphe faux.
 *
 * Les lance-grenades ont deux icônes, spécial et lourd, que `itemSubType` ne
 * distingue pas — c'est le type de munitions qui tranche. Sans ambiguïté en
 * pratique : les sections du coffre étant déjà séparées par emplacement, un même
 * groupe ne mélange jamais les deux.
 */
export function WeaponTypeIcon({
  subType,
  ammoType,
  ...props
}: {
  subType: number | undefined;
  ammoType: number | undefined;
} & SVGProps<SVGSVGElement>) {
  switch (subType) {
    case 6:
      return <AutoRifleIcon {...props} />;
    case 7:
      return <ShotgunIcon {...props} />;
    case 8:
      return <MachineGunIcon {...props} />;
    case 9:
      return <HandCannonIcon {...props} />;
    case 10:
      return <RocketLauncherIcon {...props} />;
    case 11:
      return <FusionRifleIcon {...props} />;
    case 12:
      return <SniperRifleIcon {...props} />;
    case 13:
      return <PulseRifleIcon {...props} />;
    case 14:
      return <ScoutRifleIcon {...props} />;
    case 17:
      return <SidearmIcon {...props} />;
    case 18:
      return <SwordIcon {...props} />;
    case 22:
      return <LinearFusionRifleIcon {...props} />;
    case 23:
      return ammoType === HEAVY_AMMO ? (
        <GrenadeLauncherHeavyIcon {...props} />
      ) : (
        <GrenadeLauncherSpecialIcon {...props} />
      );
    case 24:
      return <SubmachineGunIcon {...props} />;
    case 25:
      return <TraceRifleIcon {...props} />;
    case 31:
      return <BowIcon {...props} />;
    case 33:
      return <GlaiveIcon {...props} />;
    default:
      return null;
  }
}
