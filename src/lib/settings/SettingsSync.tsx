"use client";

import {useEffect, useRef, useState} from "react";
import {pushSettings, schedulePush} from "./sync-client";
import {mergeSettings, persistedSettings, useSettings} from "./store";

/**
 * Repère de portée module, et non d'instance : écrire dans le store pendant le
 * rendu n'est acceptable qu'au tout premier rendu de la page, quand aucun
 * abonné n'est encore monté. Un changement de langue, lui, remonte l'arbre
 * côté client — le coffre est déjà là et déjà abonné, et React refuse alors
 * qu'un composant en mette un autre à jour pendant son rendu. Le store porte
 * de toute façon déjà l'état serveur : il n'y a rien à réappliquer.
 *
 * Le drapeau ne vaut que pour le navigateur ; il n'est jamais posé côté
 * serveur, où le module est partagé entre toutes les requêtes.
 */
let applied = false;

/**
 * Pont entre les préférences déposées en base et le store client.
 *
 * Deux sens :
 *  - **descendant** — l'état lu par le serveur est imposé au store *pendant le
 *    rendu*, et non dans un effet : le HTML a déjà été rendu avec lui, un effet
 *    laisserait `SettingsEffects` appliquer d'abord le thème du cookie, le
 *    temps d'une image. Une fois par chargement de page seulement, cf. `applied`.
 *  - **descendant, le drapeau** — `syncEnabled` vient de `User.syncEnabled` et
 *    non du cookie : il est allumé par défaut pour un compte neuf, qui n'a
 *    encore rien déposé et dont le cookie local dit donc l'inverse. C'est la
 *    base qui tranche, sans quoi la synchronisation ne s'allumerait jamais
 *    d'elle-même.
 *  - **montant** — toute modification repart en base tant que la
 *    synchronisation est active. Les deux gestes qui la coupent (l'interrupteur
 *    et l'effacement de la sauvegarde) écrivent eux-mêmes, depuis
 *    `sync-client` : ici, on ne dépose jamais rien pour un compte qui n'a pas
 *    demandé la synchronisation.
 */
export function SettingsSync(
    {serverState, serverSync}: {serverState?: unknown; serverSync?: boolean},
) {
    // `useState` et non un `useRef` lu pendant le rendu : c'est la façon
    // sanctionnée de ne faire une chose qu'une fois.
    useState(() => {
        // `typeof window` : ce composant est aussi rendu côté serveur, où
        // écrire dans le store déclenche l'écriture du cookie miroir — et donc
        // un accès à `document`, qui n'existe pas là-bas. Le rendu serveur n'a
        // de toute façon rien à reprendre : il tient déjà l'état, c'est lui
        // qui le descend.
        // `serverSync` seul suffit à entrer ici : un compte neuf synchronise
        // sans avoir rien déposé, et c'est précisément ce cas qu'il faut
        // refléter dans le store.
        if (applied || typeof window === "undefined") return;
        if (!serverState && serverSync === undefined) return;
        applied = true;
        const current = useSettings.getState();
        const merged = serverState ? mergeSettings(serverState, current) : current;
        useSettings.setState({
            ...merged,
            syncEnabled: serverSync ?? merged.syncEnabled,
        });
    });

    // Premier dépôt d'un compte neuf : la synchronisation est active (défaut de
    // `User.syncEnabled`) mais rien n'a encore été déposé — pas de
    // `serverState`. Sans ceci, la base resterait vide jusqu'à la première
    // modification de préférence, et un autre appareil ne trouverait rien à
    // relire d'ici là. L'état de cet appareil fait référence, comme à
    // l'activation manuelle.
    //
    // Le repère est un `useRef` figé au premier rendu, et l'effet ne dépend de
    // rien : un changement de langue remonte l'arbre client avec de nouvelles
    // identités de props, et des dépendances rejoueraient le dépôt à chaque
    // fois.
    const owesFirstPush = useRef(serverSync === true && !serverState);
    useEffect(() => {
        if (!owesFirstPush.current) return;
        owesFirstPush.current = false;
        void pushSettings(true, persistedSettings(useSettings.getState()));
    }, []);

    useEffect(() => {
        let lastJson = JSON.stringify(persistedSettings(useSettings.getState()));

        return useSettings.subscribe((state) => {
            const data = persistedSettings(state);
            const json = JSON.stringify(data);
            // Le store notifie tout changement, y compris ceux qui ne sont pas
            // persistés (mode d'affichage mis à part, rien ici ne bouge seul).
            if (json === lastJson) return;
            lastJson = json;
            if (data.syncEnabled) schedulePush(data);
        });
    }, []);

    return null;
}
