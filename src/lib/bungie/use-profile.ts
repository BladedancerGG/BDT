"use client";

import { useQuery } from "@tanstack/react-query";
import type { DestinyItemComponent } from "./profile";
import type { ItemDetail } from "./item-components";

export interface Character {
  characterId: string;
  classHash: number;
  light: number;
  emblemPath: string;
  emblemBackgroundPath: string;
  titleRecordHash?: number;
}

export interface ProfileData {
  characters: Character[];
  equipment: Record<string, DestinyItemComponent[]>;
  inventory: Record<string, DestinyItemComponent[]>;
  /** Le coffre, partagé entre tous les personnages */
  vault: DestinyItemComponent[];
  /** Détail (stats, sockets, plugs) de chaque objet, par itemInstanceId */
  items: Record<string, ItemDetail>;
}

/**
 * Charge le profil via /api/profile : personnages, inventaires ET détail de
 * tous les objets instanciés. Ce préchargement rend les infobulles instantanées.
 */
export function useProfile() {
  return useQuery<ProfileData>({
    queryKey: ["profile"],
    // Le profil ne change qu'en jouant : inutile de le recharger sans cesse
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Échec du chargement du profil");
      return res.json();
    },
  });
}
