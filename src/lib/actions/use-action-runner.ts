"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProfileData } from "@/lib/bungie/use-profile";
import {
  markLocalMoves,
  markLocalPlugs,
  socketKey,
} from "@/lib/bungie/profile-freshness";
import { useItemDefs } from "@/lib/destiny/item-defs";
import { useBucketCapacities } from "@/lib/destiny/use-bucket-capacities";
import { applyStep, planMove } from "@/lib/destiny/moves";
import {
  applyClearedLoadout,
  applyEquippedLoadout,
  applySnapshotLoadout,
} from "@/lib/destiny/loadout-effects";
import { socketsAfterInsert } from "@/lib/destiny/sockets";
import { sendStep } from "./api";
import {
  useActionQueue,
  type ActionStep,
  type QueuedInsertAction,
  type QueuedLoadoutAction,
  type QueuedMoveAction,
} from "./store";
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

    /** Sockets effectivement remplis, à confronter de la même façon. */
    const inserted = new Set<string>();

    /** Envoi d'une étape, avec les reprises imposées par une limitation de débit. */
    const send = async (step: ActionStep) => {
      let error = await sendStep(step);
      for (
        let retry = 0;
        error?.throttleSeconds && retry < THROTTLE_RETRIES;
        retry += 1
      ) {
        await wait(error.throttleSeconds * 1000 + 250);
        error = await sendStep(step);
      }
      return error;
    };

    /**
     * Équiper un attribut : une requête, rien à planifier.
     *
     * Le cache du profil est corrigé sur-le-champ plutôt que rechargé, comme
     * pour une étape de déplacement. Le rechargement final remet en revanche
     * les statistiques d'accord avec le nouvel attribut — celles-là, on ne sait
     * pas les recalculer localement.
     */
    const runInsert = async (action: QueuedInsertAction) => {
      const { setActionStatus, setStepStatus } = queue();
      const step = action.steps[0];
      if (!step) {
        setActionStatus(action.id, "done");
        return;
      }

      setActionStatus(action.id, "running");
      setStepStatus(action.id, step.id, "running");

      const error = await send(step);
      if (error) {
        setStepStatus(action.id, step.id, "error", error.message);
        setActionStatus(action.id, "error", error.message);
        return;
      }

      setStepStatus(action.id, step.id, "done");

      // Socket visé : le rechargement final devra confirmer le nouvel attribut
      inserted.add(socketKey(step.itemInstanceId, step.socketIndex));

      const snapshot = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      const detail = snapshot?.items?.[step.itemInstanceId];
      if (snapshot && detail) {
        // Pas toujours un simple « ce socket porte ce plug » : réinitialiser un
        // artéfact vide tous ses emplacements d'un coup.
        const sockets = socketsAfterInsert(
          defs.get(step.itemHash),
          detail.sockets,
          step.socketIndex,
          step.plugItemHash,
        );

        // **Tous** les sockets touchés sont surveillés, pas seulement celui de
        // la requête. Sans cela, une réinitialisation d'artéfact était perdue au
        // rechargement : son propre socket revient à son plug d'origine des deux
        // côtés — donc rien à signaler —, pendant que la réponse de Bungie,
        // encore en cache, montrait les attributs toujours en place.
        sockets.forEach((plugHash, index) => {
          if (plugHash !== detail.sockets[index]) {
            inserted.add(socketKey(step.itemInstanceId, index));
          }
        });

        queryClient.setQueryData<ProfileData>(PROFILE_KEY, (current) =>
          current
            ? {
                ...current,
                items: {
                  ...current.items,
                  [step.itemInstanceId]: { ...detail, sockets },
                },
              }
            : current,
        );
      }
      setActionStatus(action.id, "done");
    };

    /**
     * Agir sur un emplacement d'équipement : une requête, rien à planifier.
     *
     * L'effet local est rejoué sur le cache du profil : Bungie ne dit rien de
     * ce qu'il a changé, et sans cette simulation l'écran garderait l'état
     * d'avant jusqu'au rechargement — lequel peut de surcroît ramener un
     * instantané antérieur.
     *
     * Un `equip` déplace des objets, d'où le marquage qui protège le
     * rechargement ; enregistrer ou vider ne touche qu'à l'emplacement. Le
     * changement d'identifiants, lui, n'a pas d'effet à rejouer : le titre
     * affiche déjà le brouillon qu'on vient d'envoyer.
     */
    const runLoadout = async (action: QueuedLoadoutAction) => {
      const { setActionStatus, setStepStatus } = queue();
      const step = action.steps[0];
      if (!step) {
        setActionStatus(action.id, "done");
        return;
      }

      setActionStatus(action.id, "running");
      setStepStatus(action.id, step.id, "running");

      const error = await send(step);
      if (error) {
        setStepStatus(action.id, step.id, "error", error.message);
        setActionStatus(action.id, "error", error.message);
        return;
      }

      setStepStatus(action.id, step.id, "done");

      const snapshot = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      if (snapshot) {
        if (action.action === "equip") {
          const loadout =
            snapshot.loadouts?.[action.characterId]?.[action.loadoutIndex];
          if (loadout) {
            const result = applyEquippedLoadout(
              snapshot,
              loadout,
              action.characterId,
              defs,
              capacities,
            );
            for (const id of result.moved) moved.add(id);
            queryClient.setQueryData<ProfileData>(PROFILE_KEY, result.profile);
          }
        } else if (action.action === "snapshot") {
          // Les identifiants réellement envoyés, et non ceux recopiés pour la
          // vignette : sur un emplacement libre, la requête porte les valeurs
          // par défaut du jeu que le panneau lui a données.
          const sent = step.request;
          queryClient.setQueryData<ProfileData>(
            PROFILE_KEY,
            applySnapshotLoadout(
              snapshot,
              action.characterId,
              action.loadoutIndex,
              {
                colorHash: sent.colorHash ?? action.colorHash,
                iconHash: sent.iconHash ?? action.iconHash,
                nameHash: sent.nameHash ?? action.nameHash,
              },
              defs,
            ),
          );
        } else if (action.action === "clear") {
          queryClient.setQueryData<ProfileData>(
            PROFILE_KEY,
            applyClearedLoadout(
              snapshot,
              action.characterId,
              action.loadoutIndex,
            ),
          );
        }
      }

      setActionStatus(action.id, "done");
    };

    const runMove = async (action: QueuedMoveAction) => {
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
            a.id === action.id && a.kind === "move"
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
      const refreshed = queue().actions.find((a) => a.id === action.id);
      const planned = refreshed?.kind === "move" ? refreshed.steps : [];

      for (const step of planned) {
        setStepStatus(action.id, step.id, "running");

        const error = await send(step);

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
        if (next.kind === "insert") await runInsert(next);
        else if (next.kind === "loadout") await runLoadout(next);
        else await runMove(next);
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
      // écritures : on note ce qu'elles ont laissé derrière elles — la place
      // des objets déplacés, l'attribut des sockets remplis — pour que
      // `useProfile` puisse écarter une réponse qui les ignore encore.
      const local = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
      if (local && moved.size > 0) markLocalMoves(local, moved);
      if (local && inserted.size > 0) markLocalPlugs(local, inserted);

      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    })();
  }, [actions, queryClient, defs, capacities]);
}
