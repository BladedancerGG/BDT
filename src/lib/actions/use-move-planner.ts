"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProfileData } from "@/lib/bungie/use-profile";
import { useItemDefs } from "@/lib/destiny/item-defs";
import { useBucketCapacities } from "@/lib/destiny/use-bucket-capacities";
import {
  planMove,
  type MovePlan,
  type MoveTarget,
  type PlanContext,
} from "@/lib/destiny/moves";
import { useActionQueue, type QueuedItem } from "./store";

/** Clé du profil dans le cache TanStack Query — partagée avec `useProfile`. */
export const PROFILE_KEY = ["profile"] as const;

/**
 * Planifie un déplacement et, si on le demande, le met en file.
 *
 * Le plan est calculé sur le profil **en cache** et non sur celui rendu : les
 * actions déjà exécutées l'ont modifié localement, et enchaîner deux
 * déplacements sur le même objet doit partir de sa nouvelle position.
 */
export function useMovePlanner() {
  const queryClient = useQueryClient();
  const { defs } = useItemDefs();
  const capacities = useBucketCapacities();
  const enqueueAction = useActionQueue((s) => s.enqueue);

  const context = useCallback((): PlanContext | null => {
    const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
    if (!profile) return null;
    return { profile, defs, capacities };
  }, [queryClient, defs, capacities]);

  /** Ce que coûterait le déplacement — sert aussi à griser les zones de dépôt. */
  const plan = useCallback(
    (itemInstanceId: string, target: MoveTarget): MovePlan | null => {
      const ctx = context();
      if (!ctx) return null;
      return planMove(itemInstanceId, target, ctx);
    },
    [context],
  );

  // L'objet arrive entier plutôt qu'en `(id, hash)` : la file recopie aussi ses
  // habillages, pour que la carte du panneau puisse redessiner sa vignette.
  const enqueue = useCallback(
    (item: QueuedItem, target: MoveTarget) => {
      const result = plan(item.itemInstanceId, target);
      // Rien à faire : l'objet est déjà là où on le dépose
      if (!result || (result.ok && result.steps.length === 0)) return;

      enqueueAction({
        ...item,
        target,
        steps: result.ok ? result.steps : [],
        failure: result.ok ? undefined : result.failure,
      });
    },
    [plan, enqueueAction],
  );

  return { plan, enqueue };
}
