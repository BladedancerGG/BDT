"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { VIEW_MODES } from "@/lib/settings/constants";
import { useSettings } from "@/lib/settings/store";

/**
 * Bascule entre les deux modes d'affichage : inventaire et équipements.
 *
 * Le mode vit dans les préférences, donc dans le cookie : on retrouve la vue
 * quittée au rechargement.
 *
 * La touche Tab bascule aussi, comme en jeu. Elle est absorbée — sinon elle
 * déplacerait le focus par-dessus — mais seulement quand elle ne sert à rien
 * d'autre : une saisie ou une modale la gardent pour elle, sans quoi on ne
 * pourrait plus naviguer au clavier dans la barre de recherche ni dans les
 * paramètres.
 */
export function ViewModeTabs() {
    const t = useTranslations("inventory.mode");
    const viewMode = useSettings((s) => s.viewMode);
    const setViewMode = useSettings((s) => s.setViewMode);
    const toggleViewMode = useSettings((s) => s.toggleViewMode);

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Tab" || event.defaultPrevented) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                return;
            }

            const target = event.target as HTMLElement | null;
            if (target?.isContentEditable) return;
            if (target?.closest("input, textarea, select, [role='dialog']")) return;

            event.preventDefault();
            toggleViewMode();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [toggleViewMode]);

    return (
        <div className="view-mode-tabs" role="tablist" aria-label={t("label")}>
            {VIEW_MODES.map((mode) => (
                <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={mode === viewMode}
                    className={`btn btn--small view-mode-tabs__tab${
                        mode === viewMode ? " view-mode-tabs__tab--active" : ""
                    }`}
                    onClick={() => setViewMode(mode)}
                >
                    {t(mode)}
                </button>
            ))}
        </div>
    );
}
