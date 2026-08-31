// Où chaque objet apparaît dans les équipements enregistrés en jeu.
//
// Module pur, comme `query.ts` et `filters.ts` : il reçoit les équipements du
// profil et rend une table par identifiant d'instance. Aucun accès au
// manifeste — un équipement ne désigne ses objets que par leur instance, il n'y
// a donc aucune définition à résoudre.
//
// Rien à voir avec `index-build.ts` : celui-là lit le manifeste et coûte
// quelques milliers de définitions, celui-ci parcourt quelques dizaines
// d'emplacements. Il est donc construit à chaque requête, sans condition.

import type { DestinyLoadout } from "@/lib/bungie/profile";
import { isEmptyLoadout } from "@/lib/loadouts/loadout";

/**
 * Une place occupée par un objet dans un équipement enregistré.
 *
 * Les deux numéros comptent à partir de 1, comme le panneau qui les affiche
 * (« Emplacement n°1 »), et ils diffèrent dès qu'un emplacement libre précède :
 * sur un personnage dont les cases sont `[libre] [Alpha] [libre] [Bêta]`, Bêta
 * est au `rank` 2 et au `slot` 4.
 */
export interface LoadoutPlace {
  characterId: string;
  /** Numéro de la case, emplacements libres compris — `loadoutslot:` */
  slot: number;
  /** Rang parmi les seuls équipements enregistrés — `loadout:` */
  rank: number;
}

/** Places de chaque objet, par identifiant d'instance. */
export type LoadoutIndex = ReadonlyMap<string, LoadoutPlace[]>;

export const EMPTY_LOADOUT_INDEX: LoadoutIndex = new Map();

/**
 * Indexe les équipements enregistrés de tous les personnages.
 *
 * Un objet peut occuper plusieurs places — le même exotique dans trois
 * équipements — d'où la liste plutôt qu'une place unique.
 *
 * Les emplacements libres sont sautés, mais **comptés** : ils occupent une case
 * à l'écran comme dans la réponse de l'API, et `loadoutslot:` les compte. Leurs
 * objets portent de toute façon l'instance « 0 », que rien ne peut retrouver.
 */
export function buildLoadoutIndex(
  loadouts: Record<string, DestinyLoadout[]> | undefined,
): LoadoutIndex {
  if (!loadouts) return EMPTY_LOADOUT_INDEX;

  const index = new Map<string, LoadoutPlace[]>();

  for (const [characterId, slots] of Object.entries(loadouts)) {
    let rank = 0;

    slots.forEach((loadout, position) => {
      if (isEmptyLoadout(loadout)) return;
      rank += 1;
      const place: LoadoutPlace = { characterId, slot: position + 1, rank };

      for (const item of loadout.items) {
        // « 0 » est la place vide d'un équipement — voir `loadout.ts`
        if (item.itemInstanceId === "0") continue;
        const places = index.get(item.itemInstanceId);
        if (places) places.push(place);
        else index.set(item.itemInstanceId, [place]);
      }
    });
  }

  return index;
}
