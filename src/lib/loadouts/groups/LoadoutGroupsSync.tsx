"use client";

import {useEffect, useRef} from "react";
import {useSettings} from "@/lib/settings/store";
import {useLoadoutGroups} from "./store";
import {mergeGroups} from "./sync-merge";
import {
    flushGroupsPush,
    pullGroups,
    pushGroups,
    scheduleGroupsPush,
} from "./sync-client";

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

    // —— Descendant : la sauvegarde du compte est **fusionnée** avec le local,
    // elle ne le remplace plus.
    //
    // Elle le remplaçait, et c'est ainsi qu'on perdait des groupes : une ligne
    // absente, une sauvegarde en retard d'un envoi refusé ou d'un rechargement
    // arrivé pendant le délai d'inactivité, et le stockage local — seul à porter
    // la version à jour — était écrasé par elle. `mergeGroups` tranche
    // maintenant par date, groupe par groupe (voir `sync-merge.ts`).
    //
    // L'exception de l'activation reste : c'est l'appareil qui vient d'être
    // désigné comme source, et les paramètres ont déposé sa liste dans la
    // foulée. Relire à cet instant ferait fusionner une liste avec elle-même,
    // au mieux inutile.
    const wasEnabled = useRef(syncEnabled);
    useEffect(() => {
        const justEnabled = !wasEnabled.current && syncEnabled;
        wasEnabled.current = syncEnabled;
        if (!syncEnabled || justEnabled) return;
        let cancelled = false;

        void pullGroups().then((remote) => {
            if (cancelled) return;
            const local = useLoadoutGroups.getState().groups;
            const {groups, needsPush} = mergeGroups(local, remote);
            // Le repère est posé **avant** le remplacement : l'abonnement
            // montant se déclenche dans la foulée, et il ne doit pas reprendre à
            // son compte un envoi qu'on s'apprête à faire ici.
            synced.current = JSON.stringify(groups);
            useLoadoutGroups.getState().replaceAll(groups);
            // La fusion a produit autre chose que ce que le compte porte : il
            // faut le lui dire tout de suite et non attendre une modification,
            // sans quoi l'appareil suivant relirait encore la version périmée.
            if (needsPush && useSettings.getState().syncEnabled) {
                void pushGroups(groups);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [syncEnabled]);

    // —— Montant : toute modification repart en base tant que la
    // synchronisation est active.
    useEffect(() => {
        synced.current ??= JSON.stringify(useLoadoutGroups.getState().groups);
        let edits = useLoadoutGroups.getState().edits;

        return useLoadoutGroups.subscribe((state) => {
            const json = JSON.stringify(state.groups);
            const byHand = state.edits > edits;
            edits = state.edits;
            if (json === synced.current) return;

            // La garde qui manquait : une liste vidée **sans geste de
            // l'utilisateur** ne part pas en base. Une réhydratation qui échoue
            // ou une relecture malheureuse laissaient sinon le vide s'écrire
            // par-dessus la sauvegarde, et la perte devenait définitive.
            if (state.groups.length === 0 && !byHand && synced.current !== "[]") {
                console.error(
                    "[groupes] liste vidée sans action de l'utilisateur : envoi refusé",
                );
                return;
            }

            synced.current = json;
            if (useSettings.getState().syncEnabled) {
                scheduleGroupsPush(state.groups);
            }
        });
    }, []);

    // —— Le dernier envoi, avant que la page ne se retire.
    //
    // `pagehide` et non `beforeunload` : c'est celui qui couvre aussi la mise en
    // cache de la page et la navigation arrière, et le seul que les navigateurs
    // mobiles déclenchent de façon fiable. `visibilitychange` complète pour
    // l'onglet simplement masqué, qui peut ne jamais revenir.
    useEffect(() => {
        const flush = () => flushGroupsPush();
        const onHidden = () => {
            if (document.visibilityState === "hidden") flush();
        };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", onHidden);
        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", onHidden);
        };
    }, []);

    return null;
}
