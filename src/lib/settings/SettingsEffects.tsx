"use client";

import {useEffect} from "react";
import {useSettings} from "./store";

/**
 * Applique au document les changements de préférences faits en cours de session.
 *
 * Le rendu initial est déjà correct : le serveur lit le cookie et pose
 * `data-theme` / `--item-size-pref` directement dans le HTML. Ce composant ne
 * sert donc qu'à refléter immédiatement une modification faite dans les
 * paramètres, sans rechargement.
 *
 * Les variables écrites ici sont celles du *réglage*, pas les tailles finales :
 * le SCSS les plafonne à la largeur de la fenêtre (voir scss/layout/main.scss),
 * et un style inline posé sur <html> l'emporterait sur ce plafond.
 */
export function SettingsEffects() {
    const theme = useSettings((s) => s.theme);
    const visualEffects = useSettings((s) => s.visualEffects);
    const iconSize = useSettings((s) => s.iconSize);
    const columnsIconSize = useSettings((s) => s.columnsIconSize);
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const loadoutIconSize = useSettings((s) => s.loadoutIconSize);
    const plugSize = useSettings((s) => s.plugSize);

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

    // Attribut posé seulement quand les effets sont coupés : c'est l'état
    // d'exception. Un cookie muet — ou l'absence de JavaScript — laisse donc
    // le CSS sur son défaut, effets allumés.
    useEffect(() => {
        const root = document.documentElement;
        if (visualEffects) delete root.dataset.effects;
        else root.dataset.effects = "off";
    }, [visualEffects]);

    useEffect(() => {
        document.documentElement.style.setProperty("--item-size-pref", `${iconSize}px`);
    }, [iconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--columns-item-size-pref",
            `${columnsIconSize}px`,
        );
    }, [columnsIconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--vault-item-size-pref",
            `${vaultIconSize}px`,
        );
    }, [vaultIconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty(
            "--loadout-item-size-pref",
            `${loadoutIconSize}px`,
        );
    }, [loadoutIconSize]);

    useEffect(() => {
        document.documentElement.style.setProperty("--plug-size-pref", `${plugSize}px`);
    }, [plugSize]);

    return null;
}
