"use client";

import {useRef} from "react";
import {useTranslations} from "next-intl";
import {Bars3Icon} from "@heroicons/react/24/solid";
import {useUi} from "@/lib/ui/store";

/**
 * Bouton d'ouverture du menu latéral, à gauche du titre.
 *
 * Même précaution que `ActionsButton` : le menu se ferme au clic au-dehors, et
 * le bouton en fait partie. La fermeture est déjà survenue (sur `mousedown`)
 * quand le `click` arrive, si bien qu'un `setOpen(!open)` le rouvrirait
 * aussitôt — on décide donc depuis l'état saisi au `pointerdown`.
 */
export function MainMenuButton() {
    const t = useTranslations("menu");
    const open = useUi((s) => s.menuOpen);
    const setOpen = useUi((s) => s.setMenuOpen);

    const openAtPress = useRef(false);

    return (
        <button
            type="button"
            className="btn btn--small main-menu-button"
            onPointerDown={() => {
                openAtPress.current = open;
            }}
            onClick={() => setOpen(!openAtPress.current)}
            aria-expanded={open}
            aria-label={t("open")}
            title={t("open")}
        >
            <Bars3Icon/>
            <h1 className="app-header__title">BDT</h1>
        </button>
    );
}
