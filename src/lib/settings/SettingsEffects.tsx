"use client";

import {useEffect} from "react";
import {useSettings} from "./store";

/**
 * Applique au document les changements de préférences faits en cours de session.
 *
 * Le rendu initial est déjà correct : le serveur lit le cookie et pose
 * `data-theme` / `--item-size` directement dans le HTML. Ce composant ne sert
 * donc qu'à refléter immédiatement une modification faite dans les paramètres,
 * sans rechargement.
 */
export function SettingsEffects() {
    const theme = useSettings((s) => s.theme);
    const iconSize = useSettings((s) => s.iconSize);
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const loadoutIconSize = useSettings((s) => s.loadoutIconSize);

    useEffect(() => {
        const root = document.documentElement;
        if (theme === "system") {
            // Aucun attribut : la règle CSS prefers-color-scheme reprend la main,
            // et suit donc l'OS en direct sans écouteur JavaScript.
            delete root.dataset.theme;
        } else {
            root.dataset.theme = theme;
        }
    }, [theme]);

    useEffect(() => {
        document.documentElement.style.setProperty("--item-size", `${iconSize}px`);
    }, [iconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--vault-item-size",
            `${vaultIconSize}px`,
        );
    }, [vaultIconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--loadout-item-size",
            `${loadoutIconSize}px`,
        );
    }, [loadoutIconSize]);

    return null;
}
