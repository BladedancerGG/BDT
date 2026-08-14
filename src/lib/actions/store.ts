"use client";

import { create } from "zustand";
import type { MoveFailure, MoveTarget, PlannedStep } from "@/lib/destiny/moves";
import type { InsertFailure, InsertStepRequest } from "./sockets";

/**
 * File des actions demandées par l'utilisateur.
 *
 * Elle n'est **pas** persistée : une action à moitié envoyée qu'on rejouerait
 * au rechargement partirait d'un état de compte qui n'est plus celui du plan.
 *
 * Une « action » est ce que l'utilisateur a demandé (déplacer un objet, équiper
 * un attribut) ; ses « étapes » sont les requêtes Bungie que cela coûte — d'où
 * l'affichage en « n / total » dans le panneau.
 *
 * Deux natures d'action, discriminées par `kind`. Elles partagent la file
 * plutôt que d'avoir chacune la sienne, et ce n'est pas qu'une commodité
 * d'affichage : l'exécuteur n'envoie **qu'une requête à la fois**, or Bungie
 * limite le débit des écritures par compte, toutes routes confondues.
 */

export type ActionStatus = "pending" | "running" | "done" | "error";

interface ActionStepBase {
  id: string;
  status: ActionStatus;
  /** Message renvoyé par Bungie en cas de refus */
  error?: string;
}

/** Une requête d'un plan de déplacement. */
export interface MoveActionStep extends ActionStepBase, PlannedStep {}

/** L'unique requête d'une insertion d'attribut. */
export interface InsertActionStep extends ActionStepBase, InsertStepRequest {}

export type ActionStep = MoveActionStep | InsertActionStep;

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

interface QueuedActionBase extends QueuedItem {
  id: string;
  steps: ActionStep[];
  status: ActionStatus;
  /** Refus renvoyé par Bungie pendant l'exécution */
  error?: string;
  createdAt: number;
}

/** Déplacer un objet : plan à plusieurs requêtes, replanifié avant l'envoi. */
export interface QueuedMoveAction extends QueuedActionBase {
  kind: "move";
  target: MoveTarget;
  steps: MoveActionStep[];
  /** Refus détecté à la planification, avant tout envoi */
  failure?: MoveFailure;
}

/**
 * Équiper un attribut : une requête, jamais plus, et rien à replanifier — un
 * socket ne se remplit pas tout seul entre la mise en file et l'envoi.
 */
export interface QueuedInsertAction extends QueuedActionBase {
  kind: "insert";
  steps: InsertActionStep[];
  /** Refus détecté avant tout envoi */
  failure?: InsertFailure;
}

export type QueuedAction = QueuedMoveAction | QueuedInsertAction;

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

  /** Met un déplacement en file et renvoie son identifiant. */
  enqueueMove: (
    action: QueuedItem & {
      target: MoveTarget;
      steps: PlannedStep[];
      failure?: MoveFailure;
    },
  ) => string;

  /** Met une insertion d'attribut en file et renvoie son identifiant. */
  enqueueInsert: (
    action: QueuedItem & {
      step?: InsertStepRequest;
      failure?: InsertFailure;
    },
  ) => string;

  /** Remplace le plan d'un déplacement, replanifié juste avant son exécution. */
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

const toSteps = (steps: PlannedStep[]): MoveActionStep[] =>
  steps.map((step) => ({ ...step, id: nextId("step"), status: "pending" }));

export const useActionQueue = create<ActionQueueState>()((set) => ({
  actions: [],
  filter: "all",
  panelOpen: false,

  setFilter: (filter) => set({ filter }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),

  enqueueMove: ({
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
          kind: "move",
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

  enqueueInsert: ({
    itemHash,
    itemInstanceId,
    state: itemState,
    versionNumber,
    gearTier,
    step,
    failure,
  }) => {
    const id = nextId("action");
    set((state) => ({
      actions: [
        ...state.actions,
        {
          kind: "insert",
          id,
          itemHash,
          itemInstanceId,
          state: itemState,
          versionNumber,
          gearTier,
          steps: step
            ? [{ ...step, id: nextId("step"), status: "pending" }]
            : [],
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
        // Seul un déplacement se replanifie ; une insertion n'a qu'une requête
        action.id === actionId && action.kind === "move"
          ? { ...action, steps: toSteps(steps) }
          : action,
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
      actions: state.actions.map((action) => {
        if (action.id !== actionId) return action;
        // Le `map` est écrit deux fois : sur une union de tableaux, TypeScript
        // ne sait pas qu'un `MoveActionStep[]` reste un `MoveActionStep[]`.
        return action.kind === "move"
          ? {
              ...action,
              steps: action.steps.map((step) =>
                step.id === stepId ? { ...step, status, error } : step,
              ),
            }
          : {
              ...action,
              steps: action.steps.map((step) =>
                step.id === stepId ? { ...step, status, error } : step,
              ),
            };
      }),
    })),

  clearFinished: () =>
    set((state) => ({
      actions: state.actions.filter(
        (action) => action.status === "pending" || action.status === "running",
      ),
    })),
}));

// —— Objets en cours de déplacement ——————————————————————————

/**
 * `true` tant qu'une action non aboutie porte sur cet objet — le temps que
 * Bungie réponde, sa vignette est grisée et coiffée d'une animation d'attente.
 *
 * On regarde aussi les étapes : un déplacement en coûte souvent plusieurs, et
 * certaines touchent un *autre* objet (déséquiper celui qui occupe la place).
 * Lui aussi bouge, il doit donc l'annoncer — y compris l'objet chassé de son
 * emplacement par un équipement (`displaced`), qui ne figure dans aucune
 * requête mais quitte bel et bien l'équipement.
 *
 * Le sélecteur renvoie un booléen, pas un ensemble : les centaines de vignettes
 * montées y sont abonnées, et seules celles dont la réponse change re-rendent.
 *
 * Les insertions d'attribut sont ignorées : l'objet ne bouge pas, et l'attente
 * se signale là où le clic a eu lieu — sur l'attribut, dans l'infobulle.
 */
export function useItemBusy(itemInstanceId?: string): boolean {
  return useActionQueue((state) =>
    itemInstanceId
      ? state.actions.some(
          (action) =>
            action.kind === "move" &&
            (action.status === "pending" || action.status === "running") &&
            (action.itemInstanceId === itemInstanceId ||
              action.steps.some(
                (step) =>
                  (step.itemInstanceId === itemInstanceId ||
                    step.displaced === itemInstanceId) &&
                  step.status !== "done" &&
                  step.status !== "error",
              )),
        )
      : false,
  );
}

// —— Insertion d'attribut en cours ————————————————————————————

/** L'insertion que l'infobulle doit refléter : attente en cours, ou refus. */
export interface PlugActionState {
  /** Socket en cours d'insertion — sa colonne est figée */
  pendingSocket?: number;
  /** Attribut cliqué : lui seul porte l'animation d'attente */
  pendingPlug?: number;
  /** Motif du dernier refus, à afficher sous les colonnes */
  error?: string;
  failure?: InsertFailure;
}

/**
 * État des insertions portant sur un objet, lu depuis la file.
 *
 * L'infobulle n'a pas d'état à elle : elle se démonte à chaque fermeture, et
 * l'action, elle, survit dans la file. C'est donc la file qui dit ce qu'elle
 * doit montrer — attente comme refus.
 *
 * L'objet retourné est recréé à chaque appel : le sélecteur ne peut pas servir
 * de comparaison d'égalité, d'où la lecture du tableau entier et le tri ici.
 * Une infobulle à la fois est ouverte, le coût est nul.
 */
export function usePlugActionState(
  itemInstanceId: string | undefined,
): PlugActionState {
  const actions = useActionQueue((s) => s.actions);
  if (!itemInstanceId) return {};

  const mine = actions.filter(
    (a): a is QueuedInsertAction =>
      a.kind === "insert" && a.itemInstanceId === itemInstanceId,
  );

  const running = mine.find(
    (a) => a.status === "pending" || a.status === "running",
  );
  if (running) {
    const step = running.steps[0];
    return { pendingSocket: step?.socketIndex, pendingPlug: step?.plugItemHash };
  }

  // Le dernier refus, et lui seul : les précédents ont été remplacés à l'écran
  const failed = mine.filter((a) => a.status === "error").at(-1);
  return failed ? { error: failed.error, failure: failed.failure } : {};
}

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
