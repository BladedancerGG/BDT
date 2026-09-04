"use client";

import {useEffect, useRef} from "react";
import {useSettings} from "@/lib/settings/store";
import {useLoadoutGroups} from "./store";
import {pullGroups, scheduleGroupsPush} from "./sync-client";

/**
 * Pont entre les groupes déposés en base et le store client.
 *
 * Même principe que `SettingsSync`, à une différence près : l'état n'arrive pas
 * avec le HTML. Le serveur n'a rien à en faire au rendu — aucun groupe
 * n'apparaît dans la page initiale — et les descendre coûterait quelques
 * dizaines de Ko à chaque chargement. Ils sont donc relus par une requête,
 * après le montage, pendant que le stockage local tient déjà l'affichage.
 *
 * Le repère `synced` porte la dernière liste **connue du serveur**. Sans lui, la
 * relecture descendante déclencherait l'abonnement montant, qui renverrait
 * aussitôt en base ce qui vient d'en sortir.
 */
export function LoadoutGroupsSync() {
    const syncEnabled = useSettings((s) => s.syncEnabled);
    const synced = useRef<string | null>(null);

    // —— Descendant : la sauvegarde du compte prime sur le stockage local,
    // comme pour les préférences. Le cookie d'un appareil peut dater.
    //
    // Sauf au moment même de l'activation : c'est l'appareil qui vient d'être
    // désigné comme source, et les paramètres ont déposé sa liste dans la
    // foulée. Relire ici la remplacerait par ce que le compte contenait —
    // c'est-à-dire, la première fois, par rien du tout : la route renvoie une
    // liste vide quand la ligne n'existe pas.
    const wasEnabled = useRef(syncEnabled);
    useEffect(() => {
        const justEnabled = !wasEnabled.current && syncEnabled;
        wasEnabled.current = syncEnabled;
        if (!syncEnabled || justEnabled) return;
        let cancelled = false;

        void pullGroups().then((groups) => {
            if (cancelled || !groups) return;
            synced.current = JSON.stringify(groups);
            useLoadoutGroups.getState().replaceAll(groups);
        });

        return () => {
            cancelled = true;
        };
    }, [syncEnabled]);

    // —— Montant : toute modification repart en base tant que la
    // synchronisation est active.
    useEffect(() => {
        synced.current ??= JSON.stringify(useLoadoutGroups.getState().groups);

        return useLoadoutGroups.subscribe((state) => {
            const json = JSON.stringify(state.groups);
            if (json === synced.current) return;
            synced.current = json;
            if (useSettings.getState().syncEnabled) {
                scheduleGroupsPush(state.groups);
            }
        });
    }, []);

    return null;
}
