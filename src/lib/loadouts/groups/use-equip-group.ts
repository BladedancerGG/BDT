"use client";

import {useCallback} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {useActionQueue} from "@/lib/actions/store";
import {useInsertPlanner} from "@/lib/actions/use-insert-planner";
import {PROFILE_KEY} from "@/lib/actions/use-move-planner";
import {useLoadoutActions} from "@/lib/loadouts/use-loadout-actions";
import {planGroupEquip, type GroupEquipPlan} from "./equip";
import type {LoadoutGroup} from "./types";

/** Référence stable pour les emplacements sans objet à signaler. */
const NO_ITEMS: readonly string[] = [];

/**
 * Équiper un groupe : la séquence complète, mise en file.
 *
 * Rien n'est envoyé d'ici. Tout passe par la file d'actions, qui exécute **une
 * requête à la fois** — et ce n'est pas de la prudence : chaque étape suppose la
 * précédente aboutie, et Bungie limite le débit des écritures sur un compte
 * toutes routes confondues. Un équipement de groupe en demande des dizaines.
 *
 * La séquence suit le cahier des charges : vider les emplacements, puis, pour
 * chacun de ceux du groupe, équiper ses objets, poser leurs attributs, et
 * écraser l'emplacement avec ce qui est alors équipé. Le calcul, lui, est dans
 * `equip.ts` — module pur, vérifiable hors React.
 *
 * Toutes ces actions portent un **même identifiant de lot**, et c'est
 * indispensable : chaque étape suppose la précédente aboutie. L'échec d'un
 * équipement annule la suite, faute de quoi l'écrasement aurait enregistré en
 * jeu la panoplie ratée — un état faux, et silencieux. Voir `BatchFailure`.
 */
export function useEquipGroup(characterId: string | null) {
    const queryClient = useQueryClient();
    const enqueueMove = useActionQueue((s) => s.enqueueMove);
    const insert = useInsertPlanner();
    const {run: runLoadout} = useLoadoutActions();

    /** Le plan, pour l'annoncer avant de l'engager. `null` sans profil. */
    const plan = useCallback(
        (group: LoadoutGroup): GroupEquipPlan | null => {
            const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
            if (!profile || !characterId) return null;

            const items = new Map(
                [
                    ...Object.values(profile.equipment),
                    ...Object.values(profile.inventory),
                    profile.vault,
                ]
                    .flat()
                    .flatMap((item) =>
                        item.itemInstanceId ? [[item.itemInstanceId, item] as const] : [],
                    ),
            );

            return planGroupEquip(
                group.loadouts,
                profile.loadouts?.[characterId] ?? [],
                {
                    itemOf: (id) => {
                        const item = items.get(id);
                        if (!item?.itemInstanceId) return undefined;
                        return {
                            itemHash: item.itemHash,
                            itemInstanceId: item.itemInstanceId,
                            state: item.state,
                            versionNumber: item.versionNumber,
                            gearTier: profile.items[id]?.instance?.gearTier,
                        };
                    },
                    socketsOf: (id) => profile.items[id]?.sockets ?? [],
                    disabledOf: (id) =>
                        new Set(profile.items[id]?.disabledSockets ?? []),
                },
            );
        },
        [queryClient, characterId],
    );

    const equip = useCallback(
        (group: LoadoutGroup) => {
            const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
            const result = plan(group);
            if (!result || !characterId || !profile) return;

            const characterLoadouts = profile.loadouts?.[characterId] ?? [];
            // `randomUUID` est disponible sans condition : Bungie refuse les
            // redirections en HTTP, l'application n'est jamais servie hors
            // contexte sécurisé (voir le Caddyfile).
            const batchId = crypto.randomUUID();

            // —— Vider d'abord, comme le veut la séquence.
            for (const loadoutIndex of result.clear) {
                const current = characterLoadouts[loadoutIndex];
                runLoadout(
                    {kind: "clear", characterId, loadoutIndex},
                    {
                        // Recopiés pour la carte du panneau : elle redessine la
                        // vignette, et survit au vidage qui l'efface.
                        colorHash: current?.colorHash ?? 0,
                        iconHash: current?.iconHash ?? 0,
                        nameHash: current?.nameHash ?? 0,
                        itemInstanceIds: NO_ITEMS,
                        batchId,
                    },
                );
            }

            for (const slot of result.slots) {
                // —— Équiper. Mis en file **sans condition**, et c'est
                // essentiel : `useMovePlanner` écarte un déplacement inutile en
                // consultant le profil au moment de la mise en file, or celui-ci
                // va changer sous lui. Un objet équipé maintenant, déséquipé par
                // l'emplacement suivant, puis redemandé par un troisième aurait
                // été écarté à tort — et l'écrasement aurait enregistré l'objet
                // d'à côté. L'exécuteur replanifie de toute façon chaque
                // déplacement juste avant l'envoi, et une étape devenue inutile
                // n'y coûte aucune requête.
                for (const item of slot.equip) {
                    enqueueMove({
                        ...item,
                        target: {kind: "equipped", characterId},
                        steps: [],
                        batchId,
                    });
                }

                // —— Poser les attributs qui diffèrent, sur le personnage qui
                // vient de recevoir l'objet : à la mise en file il est encore au
                // coffre, et les mods d'armure se débloquent par personnage.
                for (const plug of slot.plugs) {
                    insert(
                        {itemHash: plug.itemHash, itemInstanceId: plug.itemInstanceId},
                        plug.socketIndex,
                        plug.plugItemHash,
                        characterId,
                        batchId,
                    );
                }

                // —— Puis écraser l'emplacement avec ce qui est alors équipé.
                runLoadout(
                    {
                        kind: "snapshot",
                        characterId,
                        loadoutIndex: slot.loadoutIndex,
                        ...slot.identifiers,
                    },
                    {
                        ...slot.identifiers,
                        itemInstanceIds: NO_ITEMS,
                        batchId,
                    },
                );
            }
        },
        [plan, queryClient, characterId, enqueueMove, insert, runLoadout],
    );

    return {plan, equip};
}
