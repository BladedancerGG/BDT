"use client";

import {useCallback} from "react";
import {useTranslations} from "next-intl";
import {planRequestCount} from "./equip";
import type {GroupLoadout, LoadoutGroup} from "./types";
import {useEquipGroup} from "./use-equip-group";

/**
 * Équiper un groupe, après l'avoir chiffré à l'utilisateur.
 *
 * Un hook et non un geste recopié dans chaque vue : l'engagement se prend
 * depuis la carte du groupe comme depuis son éditeur, et le résumé doit y être
 * le même — la séquence vide, équipe, pose les attributs et écrase, soit des
 * dizaines de requêtes sur une API dont Bungie limite le débit, et qui remplace
 * ce que le personnage porte.
 *
 * Renvoie `false` quand rien n'a été engagé : profil absent, ou refus.
 *
 * **Asynchrone** depuis que le plan l'est : les attributs qu'une arme n'offre
 * plus se remplacent par leur version améliorée, ce que seul le manifeste dit.
 * Voir `buildPlugResolver`.
 */
export function useConfirmEquipGroup(characterId: string | null) {
    const t = useTranslations("groups");
    const {plan, equip} = useEquipGroup(characterId);

    return useCallback(
        async (group: LoadoutGroup): Promise<boolean> => {
            const result = await plan(group);
            if (!result) return false;

            const message = [
                t("equipConfirm", {name: group.name}),
                t("equipSummary", {
                    slots: result.slots.length,
                    cleared: result.clear.length,
                    requests: planRequestCount(result),
                }),
                result.skipped.length > 0
                    ? t("equipSkipped", {count: result.skipped.length})
                    : null,
            ]
                .filter(Boolean)
                .join("\n\n");

            if (!window.confirm(message)) return false;
            equip(result);
            return true;
        },
        [plan, equip, t],
    );
}

/**
 * Recréer en jeu un seul emplacement d'un groupe, après l'avoir chiffré.
 *
 * Même séquence que l'équipement du groupe, restreinte à l'emplacement visé :
 * ses objets sont équipés, leurs attributs posés, puis l'emplacement `target`
 * du jeu est écrasé. Les autres emplacements du jeu ne sont pas touchés.
 *
 * Renvoie `false` quand rien n'a été engagé : profil absent, emplacement
 * inéquipable, ou refus.
 */
export function useConfirmCreateInGame(characterId: string | null) {
    const t = useTranslations("groups");
    const {planSlot, equip} = useEquipGroup(characterId);

    return useCallback(
        async (
            loadout: GroupLoadout,
            target: number,
            /** Nom de l'emplacement du jeu écrasé, s'il est occupé */
            overwritten?: string,
        ): Promise<boolean> => {
            const result = await planSlot(loadout, target);
            if (!result) return false;

            // Objets disparus ou apparence incomplète : la séquence
            // n'enregistrerait que la panoplie du moment, pas l'emplacement.
            if (result.slots.length === 0) {
                window.alert(t("createInGameSkipped"));
                return false;
            }

            const message = [
                t("createInGameConfirm", {number: target + 1}),
                overwritten
                    ? t("createInGameOverwrite", {name: overwritten})
                    : null,
                t("createInGameSummary", {requests: planRequestCount(result)}),
            ]
                .filter(Boolean)
                .join("\n\n");

            if (!window.confirm(message)) return false;
            equip(result);
            return true;
        },
        [planSlot, equip, t],
    );
}
