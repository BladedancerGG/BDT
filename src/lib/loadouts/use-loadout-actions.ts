"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  LoadoutActionError,
  LoadoutActionKind,
  LoadoutActionRequest,
} from "./types";

/**
 * Les trois écritures sur un emplacement d'équipement.
 *
 * Elles ne passent PAS par la file d'actions : celle-ci existe pour enchaîner
 * des déplacements planifiés dans le navigateur, alors qu'ici une seule requête
 * suffit et que Bungie ne dit rien de ce qu'il a déplacé. Un état local — en
 * cours / motif de refus — et une relecture du profil au retour couvrent le
 * besoin.
 *
 * La relecture est un `refetchQueries` et non une invalidation : la file
 * d'actions muselle les rechargements automatiques, et l'équipement vient de
 * changer sous nos pieds.
 */
export function useLoadoutActions() {
  const queryClient = useQueryClient();
  /** Action en cours, ou null : le panneau grise ses boutons pendant l'attente */
  const [pending, setPending] = useState<LoadoutActionKind | null>(null);
  const [error, setError] = useState<LoadoutActionError | null>(null);

  const run = useCallback(
    async (request: LoadoutActionRequest) => {
      setPending(request.kind);
      setError(null);
      try {
        const res = await fetch("/api/loadouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: LoadoutActionError | string;
          } | null;
          const refusal = payload?.error;
          setError(
            typeof refusal === "object" && refusal !== null
              ? refusal
              : { message: typeof refusal === "string" ? refusal : undefined },
          );
          return false;
        }
        // Équiper déplace des objets, écraser et vider changent la liste : dans
        // les trois cas le profil affiché est périmé.
        await queryClient.refetchQueries({ queryKey: ["profile"] });
        return true;
      } catch {
        setError({ message: "loadout_failed" });
        return false;
      } finally {
        setPending(null);
      }
    },
    [queryClient],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
