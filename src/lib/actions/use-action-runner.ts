"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProfileData } from "@/lib/bungie/use-profile";
import { markLocalMoves } from "@/lib/bungie/profile-freshness";
import { useItemDefs } from "@/lib/destiny/item-defs";
import { useBucketCapacities } from "@/lib/destiny/use-bucket-capacities";
import { applyStep, planMove } from "@/lib/destiny/moves";
import { sendStep } from "./api";
import { useActionQueue, type QueuedAction } from "./store";
import { PROFILE_KEY } from "./use-move-planner";

/** Nombre de reprises après une limitation de débit imposée par Bungie. */
const THROTTLE_RETRIES = 2;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exécute la file d'actions, **une requête à la fois**.
 *
 * La sérialisation n'est pas de la prudence : chaque étape suppose que la
 * précédente a abouti (on ne transfère pas un objet encore équipé), et Bungie
 * limite de toute façon le débit des écritures sur un même compte.
 *
 * À monter une seule fois dans l'arbre — deux exécuteurs enverraient chacun
 * leur copie des mêmes requêtes.
 */
export function useActionRunner() {
  const queryClient = useQueryClient();
  const { defs } = useItemDefs();
  const capacities = useBucketCapacities();
  const actions = useActionQueue((s) => s.actions);
  const draining = useRef(false);

  useEffect(() => {
    if (draining.current) return;
    if (!actions.some((action) => action.status === "pending")) return;

    // L'état de la file se lit toujours par getState() : la boucle survit à
    // plusieurs rendus, une valeur capturée serait périmée dès la 2ᵉ étape.
    const queue = useActionQueue.getState;

    /** Objets effectivement déplacés, à confronter au rechargement final. */
    const moved = new Set<string>();

    const runAction = async (action: QueuedAction) => {
      const { setSteps, setActionStatus, setStepStatus } = queue();
      const snapshot = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      if (!snapshot) {
        setActionStatus(action.id, "error", "profile_missing");
        return;
      }

      // Replanification juste avant l'envoi : entre la mise en file et ici,
      // les actions précédentes ont déplacé des objets — dont peut-être
      // celui-ci, ou celui qu'on comptait équiper à sa place.
      const result = planMove(action.itemInstanceId, action.target, {
        profile: snapshot,
        defs,
        capacities,
      });

      if (!result.ok) {
        useActionQueue.setState((state) => ({
          actions: state.actions.map((a) =>
            a.id === action.id
              ? { ...a, status: "error", failure: result.failure }
              : a,
          ),
        }));
        return;
      }
      if (result.steps.length === 0) {
        setActionStatus(action.id, "done");
        return;
      }

      setSteps(action.id, result.steps);
      setActionStatus(action.id, "running");

      // setSteps a réattribué les identifiants d'étapes : on repart de l'état
      const planned =
        queue().actions.find((a) => a.id === action.id)?.steps ?? [];

      for (const step of planned) {
        setStepStatus(action.id, step.id, "running");

        let error = await sendStep(step);
        for (
          let retry = 0;
          error?.throttleSeconds && retry < THROTTLE_RETRIES;
          retry += 1
        ) {
          await wait(error.throttleSeconds * 1000 + 250);
          error = await sendStep(step);
        }

        if (error) {
          // Le message de Bungie, pas son code symbolique : c'est lui qui est
          // lisible par l'utilisateur.
          const reason = error.message;
          setStepStatus(action.id, step.id, "error", reason);
          setActionStatus(action.id, "error", reason);
          return;
        }

        setStepStatus(action.id, step.id, "done");
        // Objet dont le rechargement final devra confirmer la nouvelle place
        moved.add(step.itemInstanceId);
        // Le profil complet pèse ~1,6 Mo : on rejoue l'effet sur le cache
        // plutôt que de le recharger entre deux étapes.
        queryClient.setQueryData<ProfileData>(PROFILE_KEY, (current) =>
          current ? applyStep(current, step) : current,
        );
      }

      setActionStatus(action.id, "done");
    };

    const drain = async () => {
      for (;;) {
        const next = queue().actions.find((a) => a.status === "pending");
        if (!next) break;
        await runAction(next);
      }
    };

    void (async () => {
      try {
        // Le drapeau retombe puis la file est relue **sans await entre les
        // deux** : une action arrivée pendant la dernière requête ne peut donc
        // pas rester en plan faute d'un nouveau passage de l'effet.
        do {
          draining.current = true;
          await drain();
          draining.current = false;
        } while (queue().actions.some((a) => a.status === "pending"));
      } finally {
        draining.current = false;
      }

      // File vidée : on resynchronise avec la vérité du serveur. Les mises à
      // jour locales sont fidèles, mais le jeu a pu bouger en parallèle.
      //
      // Le cache de Bungie retarde toutefois de quelques secondes sur nos
      // écritures : on note où nos déplacements ont laissé les objets pour que
      // `useProfile` puisse écarter une réponse qui les ignore encore.
      const local = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      if (local && moved.size > 0) markLocalMoves(local, moved);

      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    })();
  }, [actions, queryClient, defs, capacities]);
}
