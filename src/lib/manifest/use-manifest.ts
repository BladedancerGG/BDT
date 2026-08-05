"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import {ensureManifest, type ManifestProgress} from "./manifest";

export type ManifestStatus = "loading" | "ready" | "error";

interface State {
    locale: string;
    status: ManifestStatus;
    progress: ManifestProgress | null;
}

/**
 * Charge le manifeste pour la langue courante au montage.
 * Renvoie l'état et la progression du téléchargement.
 */
export function useManifest() {
    const locale = useLocale();
    const [state, setState] = useState<State>({
        locale,
        status: "loading",
        progress: null,
    });

    // Réinitialise l'état quand la langue change. On ajuste pendant le rendu
    // (pattern React recommandé) plutôt que dans l'effet, pour éviter un rendu
    // en cascade avec l'ancien statut.
    if (state.locale !== locale) {
        setState({locale, status: "loading", progress: null});
    }

    useEffect(() => {
        let cancelled = false;

        // N'applique une mise à jour que si la langue n'a pas changé entre-temps
        const update = (patch: Partial<Omit<State, "locale">>) => {
            if (cancelled) return;
            setState((s) => (s.locale === locale ? {...s, ...patch} : s));
        };

        ensureManifest(locale, (progress) => update({progress}))
            .then(() => update({status: "ready"}))
            .catch((err) => {
                console.error("Manifeste:", err);
                update({status: "error"});
            });

        return () => {
            cancelled = true;
        };
    }, [locale]);

    return {status: state.status, progress: state.progress};
}
