"use client";

import { create } from "zustand";
import type { MoveFailure, MoveTarget, PlannedStep } from "@/lib/destiny/moves";

/**
 * File des déplacements demandés par l'utilisateur.
 *
 * Elle n'est **pas** persistée : une action à moitié envoyée qu'on rejouerait
 * au rechargement partirait d'un état de compte qui n'est plus celui du plan.
 *
 * Une « action » est ce que l'utilisateur a demandé (un objet, une destination) ;
 * ses « étapes » sont les requêtes Bungie que cela coûte — d'où l'affichage en
 * « n / total » dans le panneau.
 */

export type ActionStatus = "pending" | "running" | "done" | "error";

export interface ActionStep extends PlannedStep {
  id: string;
  status: ActionStatus;
  /** Message renvoyé par Bungie en cas de refus */
  error?: string;
}

/**
 * L'objet d'une action : de quoi l'identifier, et de quoi **redessiner** sa
 * vignette.
 *
 * Les trois derniers champs ne servent qu'à l'affichage. La carte du panneau
 * survit à la disparition de l'objet de la grille — et même du profil, une fois
 * le déplacement exécuté : elle ne peut donc pas aller relire l'instance, il
 * faut que ces valeurs aient été copiées à la mise en file. Ce sont les mêmes
 * que celles attendues par `ItemThumb`.
 */
export interface QueuedItem {
  itemHash: number;
  itemInstanceId: string;
  /** Masque ItemState (pièce maîtresse, façonné, amélioré…) */
  state?: number;
  versionNumber?: number;
  gearTier?: number;
}

export interface QueuedAction extends QueuedItem {
  id: string;
  target: MoveTarget;
  steps: ActionStep[];
  status: ActionStatus;
  /** Refus détecté à la planification, avant tout envoi */
  failure?: MoveFailure;
  /** Refus renvoyé par Bungie pendant l'exécution */
  error?: string;
  createdAt: number;
}

/** Filtre du panneau : reprend les trois états visibles par l'utilisateur. */
export type ActionFilter = "all" | "pending" | "running" | "done";

interface ActionQueueState {
  actions: QueuedAction[];
  filter: ActionFilter;
  /**
   * Ouverture du panneau. Elle vit ici parce que le bouton est dans l'en-tête
   * et le panneau dans l'inventaire — seul endroit d'où il accède aux
   * définitions du manifeste déjà chargées.
   */
  panelOpen: boolean;

  setFilter: (filter: ActionFilter) => void;
  setPanelOpen: (open: boolean) => void;

  /** Ajoute une action et renvoie son identifiant. */
  enqueue: (
    action: QueuedItem & {
      target: MoveTarget;
      steps: PlannedStep[];
      failure?: MoveFailure;
    },
  ) => string;

  /** Remplace le plan d'une action, replanifiée juste avant son exécution. */
  setSteps: (actionId: string, steps: PlannedStep[]) => void;
  setActionStatus: (
    actionId: string,
    status: ActionStatus,
    error?: string,
  ) => void;
  setStepStatus: (
    actionId: string,
    stepId: string,
    status: ActionStatus,
    error?: string,
  ) => void;

  /** Vide les actions abouties ou en échec ; les autres sont intouchées. */
  clearFinished: () => void;
}

let counter = 0;
/** Identifiant local, sans prétention d'unicité au-delà de l'onglet. */
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

const toSteps = (steps: PlannedStep[]): ActionStep[] =>
  steps.map((step) => ({ ...step, id: nextId("step"), status: "pending" }));

export const useActionQueue = create<ActionQueueState>()((set) => ({
  actions: [],
  filter: "all",
  panelOpen: false,

  setFilter: (filter) => set({ filter }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),

  enqueue: ({
    itemHash,
    itemInstanceId,
    state: itemState,
    versionNumber,
    gearTier,
    target,
    steps,
    failure,
  }) => {
    const id = nextId("action");
    set((state) => ({
      actions: [
        ...state.actions,
        {
          id,
          itemHash,
          itemInstanceId,
          state: itemState,
          versionNumber,
          gearTier,
          target,
          steps: toSteps(steps),
          // Un refus connu dès la planification n'a pas à occuper la file
          status: failure ? "error" : "pending",
          failure,
          createdAt: Date.now(),
        },
      ],
    }));
    return id;
  },

  setSteps: (actionId, steps) =>
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId ? { ...action, steps: toSteps(steps) } : action,
      ),
    })),

  setActionStatus: (actionId, status, error) =>
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId ? { ...action, status, error } : action,
      ),
    })),

  setStepStatus: (actionId, stepId, status, error) =>
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId
          ? {
              ...action,
              steps: action.steps.map((step) =>
                step.id === stepId ? { ...step, status, error } : step,
              ),
            }
          : action,
      ),
    })),

  clearFinished: () =>
    set((state) => ({
      actions: state.actions.filter(
        (action) => action.status === "pending" || action.status === "running",
      ),
    })),
}));

// —— Compteurs affichés dans l'en-tête ————————————————————————

export interface ActionCounts {
  /** Actions pas encore abouties, et le nombre de requêtes qu'elles coûtent */
  pending: number;
  pendingSteps: number;
  /** Actions abouties, et le nombre de requêtes déjà envoyées */
  done: number;
  doneSteps: number;
  /** Actions en échec — signalées à part, elles appellent une décision */
  failed: number;
}

export function countActions(actions: QueuedAction[]): ActionCounts {
  const counts: ActionCounts = {
    pending: 0,
    pendingSteps: 0,
    done: 0,
    doneSteps: 0,
    failed: 0,
  };

  for (const action of actions) {
    if (action.status === "done") counts.done += 1;
    else if (action.status === "error") counts.failed += 1;
    else counts.pending += 1;

    for (const step of action.steps) {
      if (step.status === "done") counts.doneSteps += 1;
      else if (step.status !== "error") counts.pendingSteps += 1;
    }
  }

  return counts;
}
