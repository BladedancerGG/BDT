"use client";

import { useQuery } from "@tanstack/react-query";
import type { DestinyItemComponent } from "./profile";

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
}

/** Charge le profil (personnages + inventaires) via /api/profile. */
export function useProfile() {
  return useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Échec du chargement du profil");
      return res.json();
    },
  });
}
