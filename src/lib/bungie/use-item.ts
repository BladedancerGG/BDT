"use client";

import { useQuery } from "@tanstack/react-query";
import type { ItemDetail } from "./item";

/** Détail d'un objet instancié, chargé à la demande et mis en cache. */
export function useItemDetail(instanceId: string | undefined) {
  return useQuery<ItemDetail>({
    queryKey: ["item", instanceId],
    enabled: Boolean(instanceId),
    staleTime: 5 * 60 * 1000, // les stats/perks changent rarement
    queryFn: async () => {
      const res = await fetch(`/api/item/${instanceId}`);
      if (!res.ok) throw new Error("Échec du chargement de l'objet");
      return res.json();
    },
  });
}
