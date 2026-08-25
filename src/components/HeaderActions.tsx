"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {useIsFetching, useQueryClient} from "@tanstack/react-query";
import {ActionsButton} from "./actions/ActionsButton";
import {SettingsModal} from "./settings/SettingsModal";
import {Cog6ToothIcon, ArrowPathIcon} from "@heroicons/react/24/solid"
import {clearLocalWrites} from "@/lib/bungie/profile-freshness";
import {useGlobalShortcut} from "@/lib/ui/use-global-shortcut";
import {useUi} from "@/lib/ui/store";
import {Hint} from "./ui/Hint";

/**
 * Durée de l'appui long qui force le rafraîchissement, en millisecondes.
 *
 * Doit rester égale à `$hold-duration` dans `scss/components/button.scss` :
 * c'est elle que la jauge de progression du bouton met à se remplir.
 */
const HOLD_MS = 1000;

/**
 * Boutons du header : rafraîchir l'état des objets, ouvrir les paramètres.
 *
 * Deux rafraîchissements, et la différence n'est pas cosmétique :
 *
 *  - **normal** — le rechargement passe par la garde anti-instantané-périmé.
 *    Bungie sert `GetProfile` derrière un cache qui retarde de quelques secondes
 *    sur nos écritures : une réponse qui les ignore encore est écartée, et
 *    l'état local — fidèle, lui — est conservé (voir profile-freshness).
 *  - **forcé** — cette garde est abandonnée avant de recharger. La réponse de
 *    Bungie fait alors autorité quoi qu'elle contienne. C'est ce qu'il faut
 *    quand le jeu a bougé en parallèle, ou quand la garde s'est trompée : elle
 *    ne peut pas distinguer « Bungie retarde » de « le joueur a touché au même
 *    objet en jeu ».
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

    const refresh = useCallback(
        (force: boolean) => {
            // Forcer, c'est renoncer à la garde : sans écriture attendue,
            // `isStaleProfile` ne retient plus rien et la réponse est reprise
            // telle quelle.
            if (force) clearLocalWrites();
            // `refetchQueries`, pas `invalidateQueries` : le geste est une demande
            // explicite, elle doit aboutir même quand la file d'actions muselle les
            // rechargements automatiques (voir `useProfile`) ou que la donnée est
            // encore considérée fraîche.
            void queryClient.refetchQueries({queryKey: ["profile"]});
            // Les détails chargés à l'unité (repli) deviennent aussi obsolètes
            void queryClient.invalidateQueries({queryKey: ["item"]});
        },
        [queryClient],
    );

    useGlobalShortcut("r", () => refresh(false), {shift: false});
    useGlobalShortcut("r", () => refresh(true), {shift: true});
    useGlobalShortcut("F1", () => setSettingsOpen(true));

    // —— Appui long sur le bouton ————————————————————————————
    //
    // Le même effet que Maj + R, à la souris. L'appui est signalé par une jauge
    // (voir `--holding`) : une seconde sans retour passerait pour un bouton mort.
    const [holding, setHolding] = useState(false);
    const hold = useRef<{timer?: ReturnType<typeof setTimeout>; fired: boolean}>({
        fired: false,
    });

    const stopHold = useCallback(() => {
        clearTimeout(hold.current.timer);
        hold.current.timer = undefined;
        setHolding(false);
    }, []);

    // Filet : un démontage en plein appui laisserait la minuterie courir.
    useEffect(() => stopHold, [stopHold]);

    const startHold = () => {
        hold.current.fired = false;
        setHolding(true);
        hold.current.timer = setTimeout(() => {
            hold.current.fired = true;
            setHolding(false);
            refresh(true);
        }, HOLD_MS);
    };

    const onClick = (event: React.MouseEvent) => {
        // L'appui long a déjà agi : le clic qui suit le relâchement n'est pas une
        // seconde demande.
        if (hold.current.fired) {
            hold.current.fired = false;
            return;
        }
        refresh(event.shiftKey);
    };

    return (
        <>
            <div className="header-actions">
                <ActionsButton/>

                <Hint
                    actions={[
                        {label: t("refresh"), keys: ["R"]},
                        {
                            label: t("refreshForce"),
                            keys: [t("shiftKey"), "R"],
                            note: t("holdHint"),
                        },
                    ]}
                >
                    <button
                        type="button"
                        className={`header-actions__refresh btn btn--small btn--refresh${
                            holding ? " btn--holding" : ""
                        }`}
                        onClick={onClick}
                        onPointerDown={startHold}
                        onPointerUp={stopHold}
                        onPointerLeave={stopHold}
                        onPointerCancel={stopHold}
                        disabled={refreshing}
                        aria-label={t("refresh")}
                    >
                        <ArrowPathIcon
                            className={refreshing ? "refreshing" : ""}
                        />
                    </button>
                </Hint>

                <Hint actions={[{label: t("settings"), keys: ["F1"]}]}>
                    <button
                        type="button"
                        className="btn btn--small btn--settings"
                        onClick={() => setSettingsOpen(true)}
                        aria-label={t("settings")}
                    >
                        <Cog6ToothIcon/>
                    </button>
                </Hint>
            </div>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                bungieMembershipId={bungieMembershipId}
            />
        </>
    );
}
