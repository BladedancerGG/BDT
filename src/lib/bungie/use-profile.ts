"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DestinyItemComponent } from "./profile";
import type { ItemDetail } from "./item-components";
import { clearLocalMoves, isStaleProfile } from "./profile-freshness";

export interface Character {
  characterId: string;
  classHash: number;
  /** DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste */
  classType: number;
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

/** Nouvelles tentatives quand Bungie renvoie un instantané d'avant nos écritures. */
const STALE_RETRIES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Charge le profil via /api/profile : personnages, inventaires ET détail de
 * tous les objets instanciés. Ce préchargement rend les infobulles instantanées.
 */
export function useProfile() {
  const queryClient = useQueryClient();

  return useQuery<ProfileData>({
    queryKey: ["profile"],
    // Le profil ne change qu'en jouant : inutile de le recharger sans cesse
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      for (let attempt = 0; ; attempt += 1) {
        const res = await fetch("/api/profile");
        if (!res.ok) throw new Error("Échec du chargement du profil");
        const fresh = (await res.json()) as ProfileData;

        // Cas courant : la réponse reflète nos déplacements (ou il n'y en a pas
        // eu à surveiller), elle fait autorité.
        if (!isStaleProfile(fresh)) {
          clearLocalMoves();
          return fresh;
        }

        // Sinon le cache de Bungie montre encore les objets à leur ancienne
        // place : reprendre cet instantané effacerait des déplacements réussis.
        const local = queryClient.getQueryData<ProfileData>(["profile"]);
        if (attempt >= STALE_RETRIES || !local) {
          // La garde est levée : soit Bungie ne confirmera pas (l'objet a bougé
          // en jeu entre-temps), soit il n'y a pas d'état local à préserver.
          // Dans les deux cas, s'entêter bloquerait tout rechargement ultérieur.
          console.warn(
            "[profil] Bungie renvoie toujours un instantané périmé : " +
              "l'état local, qui reflète les déplacements réussis, est conservé.",
          );
          clearLocalMoves();
          return local ?? fresh;
        }

        await wait(1000 * 2 ** attempt); // 1s, 2s, 4s
      }
    },
  });
}
