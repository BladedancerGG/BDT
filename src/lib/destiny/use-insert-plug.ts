"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProfileData } from "@/lib/bungie/use-profile";
import { PROFILE_KEY } from "@/lib/actions/use-move-planner";
import type { InsertPlugError } from "@/lib/actions/sockets";
import { locateItem } from "./moves";

/** Refus détecté avant tout envoi (clés `item.insert.*`). */
export type InsertPlugFailure = "unknownItem" | "inVault";

export interface InsertPlugState {
  /** Socket en cours d'insertion, s'il y en a un — sa colonne est verrouillée */
  pendingSocket?: number;
  /** Attribut cliqué : lui seul porte l'animation d'attente */
  pendingPlug?: number;
  /** Message renvoyé par Bungie, ou clé de refus local */
  error?: string;
  failure?: InsertPlugFailure;
}

/**
 * Équipe un attribut sur un objet, depuis l'infobulle.
 *
 * Ne passe **pas** par la file d'actions : celle-ci planifie des déplacements
 * (enchaînements, capacités d'emplacements, objets chassés de leur place), et
 * une insertion n'a rien de tout cela — une requête, sur un objet qui ne bouge
 * pas. L'attente se signale donc dans l'infobulle elle-même.
 *
 * Le cache du profil est corrigé sur-le-champ, comme pour un déplacement :
 * recharger 1,6 Mo pour un plug serait disproportionné, et l'infobulle est
 * encore ouverte sous les yeux de l'utilisateur. Le rechargement qui suit
 * remet les statistiques d'accord avec le nouvel attribut — elles, on ne sait
 * pas les recalculer localement.
 */
export function useInsertPlug(itemInstanceId: string | undefined) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<InsertPlugState>({});

  const insert = useCallback(
    async (socketIndex: number, plugItemHash: number) => {
      if (!itemInstanceId) return;

      const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      const located = profile
        ? locateItem(profile, itemInstanceId)
        : null;
      if (!located) {
        setState({ failure: "unknownItem" });
        return;
      }
      // L'API n'agit que sur un objet détenu par un personnage. Le dire ici
      // évite un aller-retour dont le refus serait moins clair.
      if (located.place.kind === "vault") {
        setState({ failure: "inVault" });
        return;
      }
      const { characterId } = located.place;

      setState({ pendingSocket: socketIndex, pendingPlug: plugItemHash });

      let res: Response;
      try {
        res = await fetch("/api/sockets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemInstanceId,
            socketIndex,
            plugItemHash,
            characterId,
          }),
        });
      } catch (err) {
        setState({ error: err instanceof Error ? err.message : String(err) });
        return;
      }

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const error = (body as { error?: InsertPlugError | string } | null)
          ?.error;
        setState({
          error:
            typeof error === "object" && error !== null
              ? error.message
              : typeof error === "string"
                ? error
                : `HTTP ${res.status}`,
        });
        return;
      }

      queryClient.setQueryData<ProfileData>(PROFILE_KEY, (current) => {
        const detail = current?.items?.[itemInstanceId];
        if (!current || !detail) return current;
        const sockets = [...detail.sockets];
        sockets[socketIndex] = plugItemHash;
        return {
          ...current,
          items: {
            ...current.items,
            [itemInstanceId]: { ...detail, sockets },
          },
        };
      });

      setState({});
      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
    [itemInstanceId, queryClient],
  );

  return { ...state, insert };
}
