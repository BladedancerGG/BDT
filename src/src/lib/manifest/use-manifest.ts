"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import {useSettings} from "@/lib/settings/store";
import {ensureManifest, type ManifestProgress} from "./manifest";

export type ManifestStatus = "loading" | "ready" | "error";

interface State {
    locale: string;
    status: ManifestStatus;
    progress: ManifestProgress | null;
}

/**
 * Charge le manifeste au montage, dans la langue choisie dans les réglages —
 * celle de l'interface par défaut. Renvoie l'état et la progression du
 * téléchargement.
 */
export function useManifest() {
    const uiLocale = useLocale();
    const preference = useSettings((s) => s.manifestLanguage);
    // `locale` désigne ici la langue du *manifeste* : les codes de l'interface
    // (en, fr) sont aussi des codes Bungie, d'où le repli direct.
    const locale = preference === "auto" ? uiLocale : preference;
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
                console.error("[manifest]", err);
                update({status: "error"});
            });

        return () => {
            cancelled = true;
        };
    }, [locale]);

    return {status: state.status, progress: state.progress};
}
