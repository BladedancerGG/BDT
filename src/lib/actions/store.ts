"use client";

import { create } from "zustand";
import type { MoveFailure, MoveTarget, PlannedStep } from "@/lib/destiny/moves";
import type {
  LoadoutActionKind,
  LoadoutFailure,
  LoadoutStepRequest,
} from "@/lib/loadouts/types";
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
 * Trois natures d'action, discriminées par `kind` : déplacer un objet, équiper
 * un attribut, agir sur un emplacement d'équipement. Elles partagent la file
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

/** L'unique requête d'une action sur un emplacement d'équipement. */
export interface LoadoutActionStep extends ActionStepBase, LoadoutStepRequest {}

export type ActionStep = MoveActionStep | InsertActionStep | LoadoutActionStep;

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

interface ActionBase {
  id: string;
  steps: ActionStep[];
  status: ActionStatus;
  /** Refus renvoyé par Bungie pendant l'exécution */
  error?: string;
  createdAt: number;
  /**
   * Lot auquel l'action appartient, s'il y en a un.
   *
   * Les actions d'un même lot forment une **séquence** dont chaque étape suppose
   * la précédente aboutie : l'échec de l'une annule celles qui restent. Sans
   * cela, l'équipement d'un groupe aurait écrasé l'emplacement en jeu avec ce
   * qui s'y trouvait après un équipement raté — un état faux, et silencieux.
   */
  batchId?: string;
}

/**
 * Les actions qui portent sur un objet. Un équipement, lui, n'en a pas : il
 * désigne un emplacement numéroté, pas une instance.
 */
interface QueuedActionBase extends ActionBase, QueuedItem {}

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

/**
 * Agir sur un emplacement d'équipement : une requête, rien à planifier.
 *
 * Bungie fait tout le travail côté serveur — pour un `equip`, les transferts
 * depuis le coffre compris. Les identifiants sont recopiés à la mise en file :
 * la carte du panneau redessine la vignette de l'emplacement, et celle-ci
 * survit à la disparition de l'emplacement (un `clear` le vide).
 */
export interface QueuedLoadoutAction extends ActionBase {
  kind: "loadout";
  /** Ce que l'action fait : équiper, enregistrer, vider, renommer */
  action: LoadoutActionKind;
  characterId: string;
  /** Place de l'emplacement dans la liste du personnage, à partir de 0 */
  loadoutIndex: number;
  colorHash: number;
  iconHash: number;
  nameHash: number;
  /**
   * Instances que l'équipement va mettre en place, recopiées à la mise en file.
   *
   * Elles ne servent qu'à griser les vignettes pendant l'attente : Bungie
   * n'annonce pas ce qu'il déplacera, et `useItemBusy` doit rester un sélecteur
   * booléen — les centaines de vignettes montées y sont abonnées, il ne peut pas
   * aller relire l'emplacement dans le profil. Vide pour les autres natures, qui
   * ne touchent à aucun objet.
   */
  itemInstanceIds: readonly string[];
  steps: LoadoutActionStep[];
  /** Refus détecté avant tout envoi */
  failure?: LoadoutFailure;
}

export type QueuedAction =
  | QueuedMoveAction
  | QueuedInsertAction
  | QueuedLoadoutAction;

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
      batchId?: string;
    },
  ) => string;

  /** Met une insertion d'attribut en file et renvoie son identifiant. */
  enqueueInsert: (
    action: QueuedItem & {
      step?: InsertStepRequest;
      failure?: InsertFailure;
      batchId?: string;
    },
  ) => string;

  /** Met une action d'emplacement en file et renvoie son identifiant. */
  enqueueLoadout: (
    action: Omit<
      QueuedLoadoutAction,
      "id" | "steps" | "status" | "createdAt" | "kind"
    > & { step?: LoadoutStepRequest },
  ) => string;

  /**
   * Abandonne les actions d'un lot qui n'ont pas encore démarré.
   *
   * Appelée par l'exécuteur dès qu'une action d'un lot échoue. Les actions déjà
   * abouties ne sont pas touchées — on n'annule pas ce qui est fait.
   */
  cancelBatch: (batchId: string) => void;

  /** Remplace les requêtes d'une insertion, replanifiée avant son exécution. */
  setInsertSteps: (actionId: string, steps: InsertStepRequest[]) => void;

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

/**
 * Rend l'action avec le statut d'une de ses étapes mis à jour.
 *
 * Une fonction générique et un `as A` plutôt que le `map` réécrit une fois par
 * nature d'action : sur une **union de tableaux**, TypeScript ne sait pas qu'un
 * `MoveActionStep[]` reste un `MoveActionStep[]` après un `map`, et il y a
 * désormais trois natures. Seuls les champs de `ActionStepBase` sont touchés,
 * communs aux trois — la conversion ne masque donc aucun écart réel.
 */
function withStepStatus<A extends QueuedAction>(
  action: A,
  stepId: string,
  status: ActionStatus,
  error?: string,
): A {
  return {
    ...action,
    steps: (action.steps as ActionStepBase[]).map((step) =>
      step.id === stepId ? { ...step, status, error } : step,
    ),
  } as A;
}

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
    batchId,
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
          batchId,
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
    batchId,
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
          batchId,
        },
      ],
    }));
    return id;
  },

  enqueueLoadout: ({
    action,
    characterId,
    loadoutIndex,
    colorHash,
    iconHash,
    nameHash,
    itemInstanceIds,
    step,
    failure,
    batchId,
  }) => {
    const id = nextId("action");
    set((state) => ({
      actions: [
        ...state.actions,
        {
          kind: "loadout",
          id,
          action,
          characterId,
          loadoutIndex,
          colorHash,
          iconHash,
          nameHash,
          itemInstanceIds,
          steps: step
            ? [{ ...step, id: nextId("step"), status: "pending" }]
            : [],
          status: failure ? "error" : "pending",
          failure,
          createdAt: Date.now(),
          batchId,
        },
      ],
    }));
    return id;
  },

  /**
   * Remplace les requêtes d'une insertion, replanifiées juste avant l'envoi.
   *
   * Le pendant de `setSteps` pour les déplacements, et pour la même raison : une
   * insertion peut en demander zéro (l'attribut est déjà en place) ou deux (un
   * autre socket du même artéfact le portait, il faut d'abord l'en retirer) —
   * et cela ne se sait qu'à l'envoi. Voir `planInsert`.
   */
  setInsertSteps: (actionId, steps) =>
    set((state) => ({
      actions: state.actions.map((action) =>
        action.id === actionId && action.kind === "insert"
          ? {
              ...action,
              steps: steps.map((step) => ({
                ...step,
                id: nextId("step"),
                status: "pending" as const,
              })),
            }
          : action,
      ),
    })),

  cancelBatch: (batchId) =>
    set((state) => ({
      actions: state.actions.map((action) =>
        action.batchId === batchId && action.status === "pending"
          ? {...action, status: "error", failure: "batchCancelled"}
          : action,
      ),
    })),

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
      actions: state.actions.map((action) =>
        action.id === actionId ? withStepStatus(action, stepId, status, error) : action,
      ),
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
 * Un **équipement d'ensemble** grise de même toutes les vignettes qu'il va
 * mettre en place. Elles sont connues d'avance — recopiées à la mise en file —
 * alors que Bungie, lui, n'annonce rien de ce qu'il déplacera : sans cette
 * anticipation, une requête qui dure une seconde ne se voyait nulle part.
 *
 * Les insertions d'attribut sont ignorées : l'objet ne bouge pas, et l'attente
 * se signale là où le clic a eu lieu — sur l'attribut, dans l'infobulle.
 */
export function useItemBusy(itemInstanceId?: string): boolean {
  return useActionQueue((state) =>
    itemInstanceId
      ? state.actions.some((action) => {
          if (action.status !== "pending" && action.status !== "running") {
            return false;
          }
          if (action.kind === "loadout") {
            return action.itemInstanceIds.includes(itemInstanceId);
          }
          return (
            action.kind === "move" &&
            (action.itemInstanceId === itemInstanceId ||
              action.steps.some(
                (step) =>
                  (step.itemInstanceId === itemInstanceId ||
                    step.displaced === itemInstanceId) &&
                  step.status !== "done" &&
                  step.status !== "error",
              ))
          );
        })
      : false,
  );
}

// —— Insertion d'attribut en cours ————————————————————————————

/** Les insertions que l'infobulle doit refléter : attentes en cours, ou refus. */
export interface PlugActionState {
  /**
   * Attribut attendu dans chaque socket, par index — l'aperçu optimiste.
   *
   * L'infobulle l'affiche comme équipé avant même la réponse de Bungie : sans
   * cela, enchaîner deux choix sur la même colonne montrerait encore l'ancien
   * attribut au second clic, et l'utilisateur croirait le premier perdu.
   */
  pending: Map<number, number>;
  /** Motif du dernier refus, à afficher sous les colonnes */
  error?: string;
  failure?: InsertFailure;
}

/** Partagée par tous les appels sans objet : elle n'est jamais écrite. */
const NO_PENDING_PLUGS = new Map<number, number>();

/**
 * État des insertions portant sur un objet, lu depuis la file.
 *
 * L'infobulle n'a pas d'état à elle : elle se démonte à chaque fermeture, et
 * l'action, elle, survit dans la file. C'est donc la file qui dit ce qu'elle
 * doit montrer — attentes comme refus.
 *
 * Plusieurs insertions peuvent attendre à la fois, y compris sur un même
 * socket : la file est parcourue dans l'ordre, la dernière demandée l'emporte
 * — c'est bien elle que Bungie appliquera en dernier.
 *
 * L'objet retourné est recréé à chaque appel : le sélecteur ne peut pas servir
 * de comparaison d'égalité, d'où la lecture du tableau entier et le tri ici.
 * Une infobulle à la fois est ouverte, le coût est nul.
 */
export function usePlugActionState(
  itemInstanceId: string | undefined,
): PlugActionState {
  const actions = useActionQueue((s) => s.actions);
  if (!itemInstanceId) return { pending: NO_PENDING_PLUGS };

  const mine = actions.filter(
    (a): a is QueuedInsertAction =>
      a.kind === "insert" && a.itemInstanceId === itemInstanceId,
  );

  const pending = new Map<number, number>();
  for (const action of mine) {
    if (action.status !== "pending" && action.status !== "running") continue;
    const step = action.steps[0];
    if (step) pending.set(step.socketIndex, step.plugItemHash);
  }
  if (pending.size > 0) return { pending };

  // Le dernier refus, et lui seul : les précédents ont été remplacés à l'écran
  const failed = mine.filter((a) => a.status === "error").at(-1);
  return failed
    ? { pending, error: failed.error, failure: failed.failure }
    : { pending };
}

// —— File encore active ————————————————————————————————————————

/**
 * `true` tant qu'une action attend ou s'exécute.
 *
 * Sert à museler les rechargements *automatiques* du profil : tant que la file
 * n'est pas vidée, le cache local est en avance sur Bungie (chaque étape y est
 * rejouée), et une réponse de l'API ramènerait les objets à leur état d'avant.
 */
export function useActionsBusy(): boolean {
  return useActionQueue((state) =>
    state.actions.some(
      (action) => action.status === "pending" || action.status === "running",
    ),
  );
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
