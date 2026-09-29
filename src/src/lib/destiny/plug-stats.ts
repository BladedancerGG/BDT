// Écarts de statistiques apportés par un plug (attribut, mod, fragment…).
//
// `investmentStats` d'une définition de plug mélange les statistiques visibles
// en jeu et des valeurs internes : Défense, Puissance, coûts d'énergie, « Coût
// du fragment », « Capacité d'énergie d'aspect », plus quelques hashes sans nom.
//
// On filtre donc par liste blanche, en réutilisant les statistiques déjà
// curées pour les infobulles d'objets : ce sont exactement celles qui ont un
// sens pour le joueur, et la liste reste ainsi maintenue en un seul endroit.

import type { InventoryItemDefinition } from "./types";
import {
  WEAPON_STAT_ORDER,
  SWORD_STAT_ORDER,
  ARMOR_STAT_ORDER,
} from "./stat-order";

/** Ordre d'affichage, dédoublonné : armes, puis épées, puis armures. */
const DISPLAY_ORDER: readonly number[] = [
  ...new Set([...WEAPON_STAT_ORDER, ...SWORD_STAT_ORDER, ...ARMOR_STAT_ORDER]),
];

const DISPLAYED_STATS: ReadonlySet<number> = new Set(DISPLAY_ORDER);

export interface StatModifier {
  statHash: number;
  value: number;
}

/**
 * Écarts de statistiques d'un plug, triés comme dans les infobulles d'objets.
 *
 * Les valeurs marquées `isConditionallyActive` sont conservées : c'est le cas
 * des fragments (le « -10 Grenade » d'Étincelle d'électrocution en est un), et
 * le jeu les affiche.
 */
export function plugStatModifiers(
  def: InventoryItemDefinition | undefined,
): StatModifier[] {
  const byHash = new Map<number, number>();
  for (const stat of def?.investmentStats ?? []) {
    if (!DISPLAYED_STATS.has(stat.statTypeHash)) continue;
    if (stat.value === 0) continue;
    byHash.set(
      stat.statTypeHash,
      (byHash.get(stat.statTypeHash) ?? 0) + stat.value,
    );
  }

  return DISPLAY_ORDER.filter((hash) => byHash.has(hash)).map((hash) => ({
    statHash: hash,
    value: byHash.get(hash) as number,
  }));
}
