"use client";

import {useSyncExternalStore} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {readRescue} from "@/lib/loadouts/groups/rescue";
import {
    getPushStatus,
    subscribeToPushStatus,
} from "@/lib/loadouts/groups/sync-client";
import {SettingRow} from "@/components/ui/SettingRow";
import {ArrowUturnLeftIcon, ExclamationTriangleIcon} from "@heroicons/react/24/solid";

/**
 * Le filet, et l'état du dernier envoi.
 *
 * Deux choses que l'interface taisait, et qu'elle taisait au pire moment : un
 * envoi refusé laissait la base en retard sans le dire, et le dernier état voulu
 * des groupes n'avait aucun chemin de retour une fois écrasé.
 *
 * La ligne de récupération ne s'affiche que si le filet porte autre chose que ce
 * qui est déjà là : proposer de restaurer l'état courant n'apprendrait rien et
 * inquiéterait pour rien.
 */
export function RecoveryRow() {
    const t = useTranslations("settings.account");
    const format = useFormatter();
    const groups = useLoadoutGroups((s) => s.groups);

    // Le filet est relu à chaque changement de la liste — c'est exactement quand
    // il bouge — et jamais pendant le rendu serveur : `localStorage` n'y existe
    // pas, et le lire creuserait un écart d'hydratation. D'où
    // `useSyncExternalStore` plutôt qu'un effet, qui rendrait deux fois.
    const rescue = useSyncExternalStore(
        useLoadoutGroups.subscribe,
        readRescue,
        () => null,
    );

    const status = useSyncExternalStore(
        subscribeToPushStatus,
        getPushStatus,
        // Rendu serveur : rien n'a encore été envoyé, donc rien à signaler.
        () => "ok" as const,
    );

    const known = new Set(groups.map((group) => group.id));
    const missing = rescue?.groups.filter((group) => !known.has(group.id)) ?? [];

    if (status === "ok" && missing.length === 0) return null;

    const restore = () => {
        if (!rescue) return;
        if (!window.confirm(t("restoreConfirm", {groups: missing.length}))) return;
        useLoadoutGroups.getState().restoreGroups(missing);
    };

    return (
        <>
            {status !== "ok" && (
                <SettingRow label={t("syncFailed")} hint={t(`syncFailedHint.${status}`)}>
                    <ExclamationTriangleIcon className="setting-row__warning"/>
                </SettingRow>
            )}

            {missing.length > 0 && rescue && (
                <SettingRow
                    label={t("restore")}
                    hint={t("restoreHint", {
                        groups: missing.length,
                        date: format.dateTime(new Date(rescue.savedAt), {
                            dateStyle: "short",
                            timeStyle: "short",
                        }),
                    })}
                >
                    <button type="button" className="btn btn--small" onClick={restore}>
                        <ArrowUturnLeftIcon/>
                        {t("restoreAction")}
                    </button>
                </SettingRow>
            )}
        </>
    );
}
