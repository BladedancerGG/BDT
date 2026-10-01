"use client";

import {useCallback} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {useActionQueue} from "@/lib/actions/store";
import {useInsertPlanner} from "@/lib/actions/use-insert-planner";
import {PROFILE_KEY} from "@/lib/actions/use-move-planner";
import {useLoadoutActions} from "@/lib/loadouts/use-loadout-actions";
import {getDefinitions} from "@/lib/manifest/manifest";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {upgradedPlug} from "@/lib/destiny/perk-upgrades";
import {TIER} from "@/lib/destiny/display";
import {INVALID_HASH} from "../loadout";
import {planGroupEquip, type GroupEquipContext, type GroupEquipPlan} from "./equip";
import {emptyGroupLoadout, type GroupLoadout, type LoadoutGroup} from "./types";

/** Référence stable pour les emplacements sans objet à signaler. */
const NO_ITEMS: readonly string[] = [];

/** Rien à rattraper : la valeur enregistrée est celle à poser. */
const VERBATIM: GroupEquipContext["resolvePlug"] = (_, __, plugItemHash) =>
    plugItemHash;

/**
 * Clé d'un attribut enregistré, **hash compris**.
 *
 * Le hash n'est pas de trop : un même socket d'un même objet porte des valeurs
 * différentes d'un emplacement du groupe à l'autre — un personnage n'a qu'une
 * doctrine par élément. Une clé qui s'arrêterait à l'objet et au socket ferait
 * suivre à l'un la substitution calculée pour l'autre.
 */
function staleKey(
    itemInstanceId: string,
    socketIndex: number,
    saved: number,
): string {
    return `${itemInstanceId}:${socketIndex}:${saved}`;
}

/**
 * Par quoi remplacer les attributs enregistrés que les armes n'offrent plus.
 *
 * **Le manifeste n'est lu que pour les sockets réellement périmés**, et c'est
 * ce qui rend l'opération gratuite dans le cas ordinaire : un groupe de dix
 * emplacements porte quelques centaines d'attributs, et leurs pools quelques
 * milliers d'options. Comparer d'abord le hash enregistré au pool que l'arme
 * annonce (`reusablePlugs`, composant 310, déjà dans le profil) ramène presque
 * toujours l'ensemble à vide — auquel cas aucune lecture n'a lieu du tout.
 *
 * Voir `upgradedPlug` pour ce qui apparie les deux versions d'un attribut.
 */
async function buildPlugResolver(
    groupLoadouts: readonly GroupLoadout[],
    items: Record<string, ItemDetail>,
): Promise<GroupEquipContext["resolvePlug"]> {
    const stale: {key: string; saved: number; available: number[]}[] = [];
    const hashes = new Set<number>();

    for (const loadout of groupLoadouts) {
        for (const entry of loadout.items) {
            const detail = items[entry.itemInstanceId];
            entry.plugItemHashes.forEach((saved, socketIndex) => {
                if (!saved || saved === INVALID_HASH) return;
                // Un socket dont l'arme n'annonce aucune option — les mods
                // d'armure viennent des plug sets du compte — n'apprend rien.
                const available = detail?.reusablePlugs?.[String(socketIndex)];
                if (!available?.length || available.includes(saved)) return;

                stale.push({
                    key: staleKey(entry.itemInstanceId, socketIndex, saved),
                    saved,
                    available,
                });
                hashes.add(saved);
                for (const hash of available) hashes.add(hash);
            });
        }
    }

    if (stale.length === 0) return VERBATIM;

    const list = [...hashes];
    const rows = await getDefinitions<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        list,
    );
    const defs = new Map<number, InventoryItemDefinition>();
    rows.forEach((row, index) => {
        if (row) defs.set(list[index], row);
    });

    const upgrades = new Map<string, number>();
    for (const {key, saved, available} of stale) {
        const upgraded = upgradedPlug(saved, available, (hash) => defs.get(hash));
        if (upgraded !== saved) upgrades.set(key, upgraded);
    }

    if (upgrades.size === 0) return VERBATIM;

    return (itemInstanceId, socketIndex, plugItemHash) =>
        upgrades.get(staleKey(itemInstanceId, socketIndex, plugItemHash)) ??
        plugItemHash;
}

/**
 * Les objets exotiques parmi ceux du groupe, par hash — voir
 * `GroupEquipContext.isExotic`.
 *
 * Une seule lecture groupée en IndexedDB pour tout le groupe, comme pour les
 * attributs : quelques dizaines de définitions, déjà en cache dans le
 * manifeste.
 */
async function loadExotics(
    groupLoadouts: readonly GroupLoadout[],
    itemHashOf: (itemInstanceId: string) => number | undefined,
): Promise<Set<number>> {
    const hashes = [
        ...new Set(
            groupLoadouts.flatMap((loadout) =>
                loadout.items.flatMap((entry) => {
                    const hash = itemHashOf(entry.itemInstanceId);
                    return hash === undefined ? [] : [hash];
                }),
            ),
        ),
    ];
    if (hashes.length === 0) return new Set();

    const rows = await getDefinitions<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        hashes,
    );
    return new Set(
        hashes.filter(
            (_, index) => rows[index]?.inventory?.tierType === TIER.Exotic,
        ),
    );
}

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
 * Les emplacements sont mis en file **dans l'ordre que le plan a choisi**, qui
 * n'est pas celui du personnage : deux emplacements qui partagent leurs objets
 * se suivent, et l'exécuteur n'a alors plus qu'à envoyer les différences. Voir
 * `equip-order.ts` — c'est là que se gagnent les requêtes.
 *
 * Chaque emplacement forme **son propre lot**, et c'est indispensable : ses
 * étapes supposent chacune la précédente aboutie. L'échec d'un équipement
 * annule la suite *de cet emplacement*, faute de quoi l'écrasement aurait
 * enregistré en jeu la panoplie ratée — un état faux, et silencieux. Voir
 * `BatchFailure`.
 *
 * Un lot par emplacement et non un pour tout le groupe : un emplacement ne
 * dépend pas de la réussite du précédent. L'exécuteur replanifie chaque
 * déplacement contre le profil du moment, et les attributs que le plan a
 * écartés comme déjà en place sont ceux que *tous* les emplacements demandent
 * à l'identique (voir `volatileSockets`) — un emplacement raté n'a donc rien
 * pu défaire dont le suivant aurait besoin. Un seul lot faisait échouer tout
 * le groupe pour une arme introuvable dans un seul de ses emplacements.
 *
 * Les vidages, eux, ne sont d'aucun lot : ils ne dépendent de rien, et un
 * refus n'y doit rien annuler.
 */
export function useEquipGroup(characterId: string | null) {
    const queryClient = useQueryClient();
    const enqueueMove = useActionQueue((s) => s.enqueueMove);
    const insert = useInsertPlanner();
    const {run: runLoadout} = useLoadoutActions();

    /**
     * Le plan d'une liste d'emplacements, contre l'état du profil. `null` sans
     * profil.
     *
     * **Asynchrone**, et c'est le manifeste qui l'impose : les attributs qu'une
     * arme n'offre plus se remplacent par leur version améliorée, ce qui demande
     * de lire des définitions en IndexedDB. Voir `buildPlugResolver`.
     */
    const planLoadouts = useCallback(
        async (
            groupLoadouts: readonly GroupLoadout[],
            /** Vider les emplacements du jeu que la liste ne réécrit pas */
            clear: boolean,
        ): Promise<GroupEquipPlan | null> => {
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

            const [resolvePlug, exotics] = await Promise.all([
                buildPlugResolver(groupLoadouts, profile.items),
                loadExotics(groupLoadouts, (id) => items.get(id)?.itemHash),
            ]);

            return planGroupEquip(
                groupLoadouts,
                clear ? (profile.loadouts?.[characterId] ?? []) : [],
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
                    resolvePlug,
                    // Ce que le personnage porte déjà : c'est par là que la
                    // séquence commencera si un emplacement s'en approche.
                    equippedNow: (profile.equipment[characterId] ?? []).flatMap(
                        (item) => (item.itemInstanceId ? [item.itemInstanceId] : []),
                    ),
                    isExotic: (itemHash) => exotics.has(itemHash),
                },
            );
        },
        [queryClient, characterId],
    );

    /** Le plan du groupe entier, pour l'annoncer avant de l'engager. */
    const plan = useCallback(
        (group: LoadoutGroup) =>
            planLoadouts(group.loadouts, true),
        [planLoadouts],
    );

    /**
     * Le plan d'un seul emplacement du groupe, recréé dans l'emplacement
     * `target` du jeu.
     *
     * Le même planificateur que pour le groupe, sur une liste où seul `target`
     * est rempli : l'emplacement visé y est écrasé par `SnapshotLoadout`, et
     * les autres, vides, n'y demandent rien. Aucun emplacement du jeu n'est
     * transmis — il n'y a donc rien à vider, et ceux qu'on ne vise pas restent
     * intacts, ce qui est tout l'objet du geste.
     */
    const planSlot = useCallback(
        (loadout: GroupLoadout, target: number) =>
            planLoadouts(
                Array.from({length: target + 1}, (_, index) =>
                    index === target ? loadout : emptyGroupLoadout(),
                ),
                false,
            ),
        [planLoadouts],
    );

    const equip = useCallback(
        /** Le plan est **reçu** : `useConfirmEquipGroup` l'a déjà chiffré. */
        (result: GroupEquipPlan) => {
            const profile = queryClient.getQueryData<ProfileData>(PROFILE_KEY);
            if (!characterId || !profile) return;

            const characterLoadouts = profile.loadouts?.[characterId] ?? [];

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
                    },
                );
            }

            for (const slot of result.slots) {
                // `randomUUID` est disponible sans condition : Bungie refuse
                // les redirections en HTTP, l'application n'est jamais servie
                // hors contexte sécurisé (voir le Caddyfile).
                const batchId = crypto.randomUUID();

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
        [queryClient, characterId, enqueueMove, insert, runLoadout],
    );

    return {plan, planSlot, equip};
}
