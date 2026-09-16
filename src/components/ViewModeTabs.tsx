"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {NAV_VIEW_MODES, navViewModeOf, navViewTarget} from "@/lib/settings/constants";
import { useSettings } from "@/lib/settings/store";
import { useGroupSelection } from "@/lib/loadouts/groups/selection";
import {LoadoutsIcon, VaultIcon} from "@/components/icons";
import {DestinySymbol} from "@/components/DestinySymbol";

/**
 * Bascule entre les deux destinations de la navigation : l'inventaire et les
 * équipements.
 *
 * Les groupes n'ont plus d'onglet : le bouton « équipements » ouvre leur vue,
 * qui est devenue la porte d'entrée des équipements, et la vue `loadouts` s'en
 * atteint par la carte des équipements actuels. Les deux vues marquent donc le
 * même onglet actif.
 *
 * Le mode vit dans les préférences, donc dans le cookie : on retrouve la vue
 * quittée au rechargement.
 *
 * La touche Tab passe au suivant, en cycle, comme en jeu. Elle est absorbée — sinon elle
 * déplacerait le focus par-dessus — mais seulement quand elle ne sert à rien
 * d'autre : une saisie ou une modale la gardent pour elle, sans quoi on ne
 * pourrait plus naviguer au clavier dans la barre de recherche ni dans les
 * paramètres.
 */
export function ViewModeTabs() {
    const t = useTranslations();
    const viewMode = useSettings((s) => s.viewMode);
    const setViewMode = useSettings((s) => s.setViewMode);
    const toggleViewMode = useSettings((s) => s.toggleViewMode);
    // Une sélection d'équipement impose son mode : la touche n'a rien à basculer
    // tant qu'elle dure. Les onglets, eux, ne sont même pas montés — mais le
    // raccourci, lui, est posé sur le document.
    const selecting = useGroupSelection((s) => s.active);
    const current = navViewModeOf(viewMode);

    useEffect(() => {
        if (selecting) return;
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
    }, [toggleViewMode, selecting]);

    return (
        <div className="view-mode-tabs" role="tablist" aria-label={t("inventory.viewMode")}>
            {/*<div className="view-mode-tabs__hint"><DestinySymbol name={"tab"}/></div>*/}
            {NAV_VIEW_MODES.map((mode) => (
                <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={mode === current}
                    className={`btn btn--small view-mode-tabs__tab${
                        mode === current ? " view-mode-tabs__tab--active" : ""
                    }`}
                    onClick={() => setViewMode(navViewTarget(mode))}
                >
                    {mode === "inventory" &&  <VaultIcon/> }
                    {mode === "loadouts" &&  <LoadoutsIcon/> }
                    {/*<span>{t(`common.${mode}`)}</span>*/}
                </button>   
            ))}
        </div>
    );
}
