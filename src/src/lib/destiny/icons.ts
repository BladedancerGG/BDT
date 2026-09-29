// Icônes détourées des objets.
//
// `displayProperties.icon` est un JPEG avec le fond de rareté **incrusté** dans
// l'image. La table `DestinyIconDefinition` expose la version détourée :
//   foreground          : PNG transparent de l'objet seul
//   background          : fond de rareté, en image (on préfère une couleur CSS)
//   secondaryBackground : filigrane de saison
//   highResForeground   : variante haute résolution
//
// Elle n'est PAS indexée par le hash de l'objet : elle a ses propres hashes, et
// c'est `displayProperties.iconHash` qui y renvoie. Les deux coïncident souvent
// — assez pour que la lecture au hash d'objet paraisse marcher — mais ils
// diffèrent pour 24 263 des 38 894 objets du manifeste, dont 22 105 ont bien
// une icône détourée. La couverture des armes et armures passe ainsi de 62 %
// à 100 %. C'est aussi la lecture que fait DIM (`defs.Icon.get(iconHash)`).
//
// Un repli sur le JPEG reste en place : quelques objets n'ont pas de
// `foreground`.

import type { InventoryItemDefinition } from "./types";
import { ITEM_TYPE } from "./display";

export interface IconDefinition {
  foreground?: string;
  background?: string;
  secondaryBackground?: string;
  specialBackground?: string;
  highResForeground?: string;
}

/**
 * Meilleure icône disponible : le PNG détouré si l'objet en a un, sinon le
 * JPEG de la définition.
 *
 * Exception pour les doctrines : leur `displayProperties.icon` est déjà un PNG
 * complet (losange ou disque avec dégradé et cadre), alors que le `foreground`
 * de DestinyIconDefinition n'est parfois que le glyphe nu — c'est le cas des
 * doctrines prismatiques, qui apparaissaient donc incomplètes.
 */
export function bestIconPath(
  def: InventoryItemDefinition | undefined,
  iconDef: IconDefinition | undefined,
): string | undefined {
  if (def?.itemType === ITEM_TYPE.Subclass) {
    return def.displayProperties?.icon || iconDef?.foreground || undefined;
  }
  return iconDef?.foreground || def?.displayProperties?.icon || undefined;
}

/** Vrai si l'icône retenue est détourée, donc à poser sur un fond. */
export function isTransparentIcon(
  iconDef: IconDefinition | undefined,
): boolean {
  return Boolean(iconDef?.foreground);
}

/** Suffixe de classe SCSS correspondant à la rareté. */
export function tierClassName(tierType: number | undefined): string {
  switch (tierType) {
    case 6:
      return "exotic";
    case 5:
      return "legendary";
    case 4:
      return "rare";
    case 3:
      return "common";
    default:
      return "basic";
  }
}
