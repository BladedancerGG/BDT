"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProfileData } from "@/lib/bungie/use-profile";
import { locateItem } from "@/lib/destiny/moves";
import { useActionQueue, type QueuedItem } from "./store";
import { PROFILE_KEY } from "./use-move-planner";

/**
 * Met en file l'équipement d'un attribut.
 *
 * Pendant du planificateur de déplacements, en beaucoup plus court : il n'y a
 * pas de plan à calculer, une insertion coûte une requête et une seule. Ne
 * reste que la vérification que l'API ferait payer d'un aller-retour : l'objet
 * doit être connu du profil.
 *
 * Le refus « ce changement n'est pas gratuit », lui, ne se devine pas d'ici :
 * il vient de Bungie et s'affiche à la réponse.
 *
 * **Un objet au coffre se modifie aussi.** `characterId` ne désigne pas le
 * détenteur mais le personnage qui agit — rien dans le schéma de l'endpoint
 * n'attache le champ à l'objet, et DIM passe de même le personnage courant pour
 * un objet resté au coffre. N'importe lequel convient ici : les options d'un
 * attribut d'arme viennent de l'arme (`reusablePlugs` de l'instance), jamais
 * des déblocages du personnage — ce qui ne vaudrait plus pour des mods.
 */
export function useInsertPlanner() {
  const queryClient = useQueryClient();
  const enqueueInsert = useActionQueue((s) => s.enqueueInsert);

  return useCallback(
    (item: QueuedItem, socketIndex: number, plugItemHash: number) => {
      const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      const located = profile
        ? locateItem(profile, item.itemInstanceId)
        : null;

      if (!located || !profile) {
        enqueueInsert({ ...item, failure: "notInstanced" });
        return;
      }

      const characterId =
        located.place.kind === "vault"
          ? profile.characters[0]?.characterId
          : located.place.characterId;

      if (!characterId) {
        enqueueInsert({ ...item, failure: "noCharacter" });
        return;
      }

      enqueueInsert({
        ...item,
        step: {
          kind: "insert",
          itemInstanceId: item.itemInstanceId,
          itemHash: item.itemHash,
          characterId,
          socketIndex,
          plugItemHash,
        },
      });
    },
    [queryClient, enqueueInsert],
  );
}
