"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActionsBusy } from "@/lib/actions/store";
import type { DestinyItemComponent, DestinyLoadout } from "./profile";
import type { ItemDetail } from "./item-components";
import type { ProfilePlugSets } from "./plug-sets";
import { clearLocalWrites, isStaleProfile } from "./profile-freshness";

export interface Character {
  characterId: string;
  classHash: number;
  /** DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste */
  classType: number;
  light: number;
  emblemPath: string;
  emblemBackgroundPath: string;
  titleRecordHash?: number;
  /**
   * Statistiques totalisées par Bungie (santé, mêlée, grenade, super, classe,
   * armes) : le cumul des armures, mods et fragments équipés.
   */
  stats: Record<string, number>;
}

export interface ProfileData {
  characters: Character[];
  equipment: Record<string, DestinyItemComponent[]>;
  inventory: Record<string, DestinyItemComponent[]>;
  /** Le coffre, partagé entre tous les personnages */
  vault: DestinyItemComponent[];
  /**
   * Équipements sauvegardés en jeu, par personnage. Absent des profils servis
   * par un cache antérieur à son ajout, d'où l'optionnel.
   */
  loadouts?: Record<string, DestinyLoadout[]>;
  /** Détail (stats, sockets, plugs) de chaque objet, par itemInstanceId */
  items: Record<string, ItemDetail>;
  /**
   * Plugs débloqués sur le compte et par personnage — ce que l'on peut
   * réellement équiper dans un socket de mod, de cosmétique, de doctrine ou
   * d'artéfact. Absent des profils servis par un cache antérieur à son ajout.
   */
  plugSets?: ProfilePlugSets;
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
  const busy = useActionsBusy();

  return useQuery<ProfileData>({
    queryKey: ["profile"],
    // Le profil ne change qu'en jouant : inutile de le recharger sans cesse
    staleTime: 5 * 60 * 1000,
    // Tant que des actions attendent ou s'exécutent, le cache local est en
    // avance sur Bungie : un rechargement déclenché tout seul (retour sur
    // l'onglet, remontage, reconnexion) ramènerait les objets à leur état
    // d'avant, et rien ne le corrigerait avant la fin de la file.
    //
    // Ce n'est pas une désactivation de la requête : une invalidation explicite
    // — le bouton « Rafraîchir », ou la resynchronisation de fin de file —
    // passe toujours.
    refetchOnWindowFocus: !busy,
    refetchOnReconnect: !busy,
    refetchOnMount: !busy,
    queryFn: async () => {
      for (let attempt = 0; ; attempt += 1) {
        const res = await fetch("/api/profile");
        if (!res.ok) throw new Error("Échec du chargement du profil");
        const fresh = (await res.json()) as ProfileData;

        // Cas courant : la réponse reflète nos écritures (ou il n'y en a pas eu
        // à surveiller), elle fait autorité.
        if (!isStaleProfile(fresh)) {
          clearLocalWrites();
          return fresh;
        }

        // Sinon le cache de Bungie montre encore les objets dans leur état
        // d'avant : reprendre cet instantané effacerait des écritures réussies.
        const local = queryClient.getQueryData<ProfileData>(["profile"]);
        if (attempt >= STALE_RETRIES || !local) {
          // La garde est levée : soit Bungie ne confirmera pas (le joueur a
          // touché au même objet en jeu entre-temps), soit il n'y a pas d'état
          // local à préserver. Dans les deux cas, s'entêter bloquerait tout
          // rechargement ultérieur.
          console.warn(
            "[profil] Bungie renvoie toujours un instantané périmé : " +
              "l'état local, qui reflète les écritures réussies, est conservé.",
          );
          clearLocalWrites();
          return local ?? fresh;
        }

        await wait(1000 * 2 ** attempt); // 1s, 2s, 4s
      }
    },
  });
}
