"use client";

import { useQuery } from "@tanstack/react-query";
import { useProfile } from "./use-profile";
import { useSharedSnapshotDetails } from "./shared-snapshot";
import type { ItemDetail } from "./item-components";

/**
 * Détail d'un objet, servi depuis le préchargement du profil.
 *
 * /api/profile ramène déjà stats / sockets / plugs de tous les objets du
 * compte : dans le cas normal la donnée est donc immédiatement disponible et
 * l'infobulle s'affiche sans attente.
 *
 * Repli : si l'objet n'est pas dans le profil (coffre non chargé, objet reçu
 * après le dernier rafraîchissement…), on interroge /api/item/[instanceId].
 *
 * Sur la page publique d'un partage, c'est l'instantané qui fait foi et non le
 * profil — il n'y en a pas. Le repli y est **coupé** : la route demande une
 * session, et l'infobulle serait restée sur son squelette en attendant un 401.
 */
export function useItemData(instanceId: string | undefined): {
  detail?: ItemDetail;
  /** true tant qu'on attend la donnée (afficher un squelette) */
  pending: boolean;
} {
  const shared = useSharedSnapshotDetails();
  const { data: profile } = useProfile();
  const preloaded = instanceId
    ? (shared?.[instanceId] ?? profile?.items?.[instanceId])
    : undefined;

  // Requête de repli, désactivée quand la donnée est déjà préchargée — et sur
  // une page partagée, où elle n'aboutirait pas.
  const needsFetch = Boolean(instanceId) && !preloaded && !shared;
  const { data: fetched, isError } = useQuery<ItemDetail>({
    queryKey: ["item", instanceId],
    enabled: needsFetch,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/item/${instanceId}`);
      if (!res.ok) throw new Error("Échec du chargement de l'objet");
      return res.json();
    },
  });

  const detail = preloaded ?? fetched;

  return {
    detail,
    // Un objet non instancié (matériau…) n'a aucune donnée à attendre.
    // En cas d'échec, on laisse l'UI retomber sur les données du manifeste.
    // Sur une page partagée non plus : ce que l'instantané n'a pas, rien ne
    // viendra le chercher, et le squelette ne se serait jamais effacé.
    pending: Boolean(instanceId) && !detail && !isError && !shared,
  };
}
