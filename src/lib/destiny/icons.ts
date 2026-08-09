// Icônes détourées des objets.
//
// `displayProperties.icon` est un JPEG avec le fond de rareté **incrusté** dans
// l'image. La table `DestinyIconDefinition` — indexée par le hash de l'objet —
// expose la version détourée :
//   foreground          : PNG transparent de l'objet seul
//   background          : fond de rareté, en image (on préfère une couleur CSS)
//   secondaryBackground : filigrane de saison
//   highResForeground   : variante haute résolution
//
// Couverture mesurée : ~62 % des armes et armures du manifeste, ~82 % des
// objets réellement présents dans un inventaire. Un repli sur le JPEG reste
// donc indispensable.

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

/**
 * Fichier d'icône de classe (DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste).
 *
 * Ici plutôt que dans `use-character-names` : ce module-ci n'a pas de directive
 * « use client », la fonction reste donc utilisable depuis un module partagé.
 */
export function classIconPath(classType: number | undefined): string | null {
  switch (classType) {
    case 0:
      return "/icons/classes/titan.svg";
    case 1:
      return "/icons/classes/hunter.svg";
    case 2:
      return "/icons/classes/warlock.svg";
    default:
      return null;
  }
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
