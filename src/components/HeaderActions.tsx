"use client";

import {useTranslations} from "next-intl";
import {useIsFetching, useQueryClient} from "@tanstack/react-query";
import {ActionsButton} from "./actions/ActionsButton";
import {SettingsModal} from "./settings/SettingsModal";
import {Cog6ToothIcon, ArrowPathIcon} from "@heroicons/react/24/solid"
import {useUi} from "@/lib/ui/store";

/**
 * Boutons du header : rafraîchir l'état des objets, ouvrir les paramètres.
 */
export function HeaderActions({
                                  bungieMembershipId,
                              }: {
    bungieMembershipId?: string;
}) {
    const t = useTranslations("header");
    const queryClient = useQueryClient();
    // L'ouverture passe par le store : l'entrée « Paramètres » du menu latéral
    // la demande aussi, et n'a pas accès à un état local d'ici.
    const settingsOpen = useUi((s) => s.settingsOpen);
    const setSettingsOpen = useUi((s) => s.setSettingsOpen);

    // Le profil porte l'état équipé de tous les objets : l'invalider suffit
    const refreshing = useIsFetching({queryKey: ["profile"]}) > 0;

    const refresh = () => {
        // `refetchQueries`, pas `invalidateQueries` : le clic est une demande
        // explicite, elle doit aboutir même quand la file d'actions muselle les
        // rechargements automatiques (voir `useProfile`) ou que la donnée est
        // encore considérée fraîche.
        void queryClient.refetchQueries({queryKey: ["profile"]});
        // Les détails chargés à l'unité (repli) deviennent aussi obsolètes
        void queryClient.invalidateQueries({queryKey: ["item"]});
    };

    return (
        <>
            <div className="header-actions">
                <ActionsButton/>

                <button
                    type="button"
                    className="header-actions__refresh btn btn--small btn--refresh"
                    onClick={refresh}
                    disabled={refreshing}
                    title={t("refreshHint")}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element*/}
                    <ArrowPathIcon
                        className={refreshing ? "refreshing" : ""}
                    />
                </button>

                <button
                    type="button"
                    className="btn btn--small btn--settings"
                    onClick={() => setSettingsOpen(true)}
                >
                    <Cog6ToothIcon/>
                </button>
            </div>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                bungieMembershipId={bungieMembershipId}
            />
        </>
    );
}
