"use client";

import {useCallback} from "react";
import {useTranslations} from "next-intl";
import {planRequestCount} from "./equip";
import type {LoadoutGroup} from "./types";
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
 */
export function useConfirmEquipGroup(characterId: string | null) {
    const t = useTranslations("groups");
    const {plan, equip} = useEquipGroup(characterId);

    return useCallback(
        (group: LoadoutGroup): boolean => {
            const result = plan(group);
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
            equip(group);
            return true;
        },
        [plan, equip, t],
    );
}
