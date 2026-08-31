"use client";

import {useEffect, useState} from "react";
import {schedulePush} from "./sync-client";
import {mergeSettings, persistedSettings, useSettings} from "./store";

/**
 * Pont entre les préférences déposées en base et le store client.
 *
 * Deux sens :
 *  - **descendant** — l'état lu par le serveur est imposé au store *pendant le
 *    rendu*, et non dans un effet : le HTML a déjà été rendu avec lui, un effet
 *    laisserait `SettingsEffects` appliquer d'abord le thème du cookie, le
 *    temps d'une image. Aucun abonné n'est encore monté à ce moment — ce
 *    composant est le premier de l'arbre — donc rien n'est rendu à contretemps.
 *  - **montant** — toute modification repart en base tant que la
 *    synchronisation est active. Les deux gestes qui la coupent (l'interrupteur
 *    et l'effacement de la sauvegarde) écrivent eux-mêmes, depuis
 *    `sync-client` : ici, on ne dépose jamais rien pour un compte qui n'a pas
 *    demandé la synchronisation.
 */
export function SettingsSync({serverState}: {serverState?: unknown}) {
    // `useState` et non un `useRef` lu pendant le rendu : c'est la façon
    // sanctionnée de ne faire une chose qu'une fois, au premier rendu.
    useState(() => {
        // `typeof window` : ce composant est aussi rendu côté serveur, où
        // écrire dans le store déclenche l'écriture du cookie miroir — et donc
        // un accès à `document`, qui n'existe pas là-bas. Le rendu serveur n'a
        // de toute façon rien à reprendre : il tient déjà l'état, c'est lui
        // qui le descend.
        if (serverState && typeof window !== "undefined") {
            useSettings.setState(mergeSettings(serverState, useSettings.getState()));
        }
    });

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
