"use client";

import { useCallback } from "react";
import {
  useActionQueue,
  type QueuedAction,
  type QueuedLoadoutAction,
} from "@/lib/actions/store";
import type { LoadoutActionRequest, LoadoutFailure } from "./types";

/** Ce que l'action porte en plus de sa requête. */
export interface LoadoutActionExtra {
  /** Apparence de l'emplacement, pour la vignette de la carte du panneau */
  colorHash: number;
  iconHash: number;
  nameHash: number;
  /**
   * Instances que l'action va mettre en place — les vignettes à griser pendant
   * l'attente. Seul un `equip` en a.
   */
  itemInstanceIds?: readonly string[];
  /** Refus connu avant tout envoi : l'action entre en file en le disant */
  failure?: LoadoutFailure;
}

/**
 * Les quatre écritures sur un emplacement d'équipement, mises en file.
 *
 * Elles passent par la file d'actions comme les déplacements et les insertions,
 * et ce n'est pas qu'une question d'affichage : l'exécuteur n'envoie qu'une
 * requête à la fois, or Bungie limite le débit des écritures sur un compte
 * **toutes routes confondues**. Un envoi direct depuis le bouton court-circuitait
 * cette sérialisation.
 *
 * Rien à planifier en revanche : Bungie assemble l'équipement côté serveur,
 * transferts depuis le coffre compris — une action, une requête.
 */
export function useLoadoutActions() {
  const enqueueLoadout = useActionQueue((s) => s.enqueueLoadout);

  /** Met l'action en file et renvoie son identifiant, pour la suivre. */
  const run = useCallback(
    (request: LoadoutActionRequest, extra: LoadoutActionExtra) =>
      enqueueLoadout({
        action: request.kind,
        characterId: request.characterId,
        loadoutIndex: request.loadoutIndex,
        colorHash: extra.colorHash,
        iconHash: extra.iconHash,
        nameHash: extra.nameHash,
        itemInstanceIds: extra.itemInstanceIds ?? [],
        step: extra.failure ? undefined : { kind: "loadout", request },
        failure: extra.failure,
      }),
    [enqueueLoadout],
  );

  return { run };
}

/** La dernière action de la file portant sur cet emplacement, s'il y en a une. */
function findLoadoutAction(
  actions: readonly QueuedAction[],
  characterId: string | null,
  loadoutIndex: number | null,
): QueuedLoadoutAction | undefined {
  if (!characterId || loadoutIndex === null) return undefined;
  return actions.findLast(
    (action): action is QueuedLoadoutAction =>
      action.kind === "loadout" &&
      action.characterId === characterId &&
      action.loadoutIndex === loadoutIndex,
  );
}

export interface LoadoutActionState {
  /** Une action attend ou s'exécute sur cet emplacement */
  busy: boolean;
  /** Motif du dernier refus, à afficher près du bouton qui l'a demandé */
  error?: string;
  failure?: LoadoutFailure;
}

/**
 * État des actions portant sur un emplacement, lu depuis la file.
 *
 * Le panneau n'a pas d'état à lui : il se remonte au changement de personnage,
 * et l'action, elle, survit dans la file. C'est donc la file qui dit ce qu'il
 * doit montrer — attente comme refus. Le même raisonnement que
 * `usePlugActionState` pour les infobulles.
 */
export function useLoadoutActionState(
  characterId: string | null,
  loadoutIndex: number | null,
): LoadoutActionState {
  const actions = useActionQueue((s) => s.actions);
  const last = findLoadoutAction(actions, characterId, loadoutIndex);

  if (!last) return { busy: false };
  if (last.status === "pending" || last.status === "running") {
    return { busy: true };
  }
  return last.status === "error"
    ? { busy: false, error: last.error, failure: last.failure }
    : { busy: false };
}

/** Statut d'une action précise, pour savoir si elle a abouti. */
export function useActionOutcome(
  actionId: string | null,
): "pending" | "done" | "error" | null {
  return useActionQueue((s) => {
    if (!actionId) return null;
    const action = s.actions.find((a) => a.id === actionId);
    if (!action) return null;
    if (action.status === "done") return "done";
    if (action.status === "error") return "error";
    return "pending";
  });
}
