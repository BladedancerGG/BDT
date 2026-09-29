"use client";

import { useMemo } from "react";
import { useProfile } from "@/lib/bungie/use-profile";
import type { PlugSetSnapshot } from "@/lib/bungie/plug-sets";
import { locateItem } from "./moves";

/**
 * Plugs débloqués applicables à un objet donné, par hash de plug set.
 *
 * Deux niveaux à croiser : le compte et le personnage. Le second dépend de qui
 * détient l'objet — les mods d'armure, par exemple, se débloquent par
 * personnage. Un objet resté au coffre n'a pas de détenteur : on retient alors
 * le premier personnage, comme le fait déjà le planificateur d'insertion.
 */
export interface PlugAvailability {
  profile: PlugSetSnapshot;
  character: PlugSetSnapshot;
}

const EMPTY: PlugAvailability = { profile: {}, character: {} };

export function usePlugAvailability(
  itemInstanceId: string | undefined,
): PlugAvailability {
  // Même souscription que `useItemData` : une seule requête pour tout l'écran,
  // et l'infobulle suit le profil rejoué après une insertion.
  const { data: profile } = useProfile();

  return useMemo(() => {
    const plugSets = profile?.plugSets;
    if (!plugSets || !itemInstanceId) return EMPTY;

    const located = locateItem(profile, itemInstanceId);
    const characterId =
      located && located.place.kind !== "vault"
        ? located.place.characterId
        : profile.characters[0]?.characterId;

    return {
      profile: plugSets.profile,
      character: (characterId && plugSets.characters[characterId]) || {},
    };
  }, [profile, itemInstanceId]);
}
