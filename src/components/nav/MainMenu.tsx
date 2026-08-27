"use client";

import {useTranslations} from "next-intl";
import {
    useFloating,
    useDismiss,
    useRole,
    useInteractions,
    useTransitionStatus,
    FloatingOverlay,
    FloatingFocusManager,
    FloatingPortal,
} from "@floating-ui/react";
import {Link, usePathname} from "@/i18n/navigation";
import {useUi} from "@/lib/ui/store";
import {APP_TITLE} from "@/lib/app-info";

/**
 * Durée du glissement d'entrée et de sortie, en millisecondes.
 *
 * Doit rester égale à `$duration` dans `scss/components/main-menu.scss` : c'est
 * elle qui décide du moment du démontage, et une valeur trop courte couperait
 * l'animation de sortie.
 */
const TRANSITION_MS = 350;

/**
 * Menu principal, en panneau latéral gauche.
 *
 * Montage identique au panneau des actions et à la modale : Floating UI fournit
 * la fermeture par Échap ou clic au-dehors, et `useTransitionStatus` garde le
 * panneau monté le temps de l'animation de sortie. Le statut est exposé au CSS
 * via `data-status`.
 *
 * Les paramètres restent une modale : le menu ne fait que demander son
 * ouverture, via le store, et se referme derrière elle — deux surfaces
 * modales superposées se disputeraient le piégeage du focus.
 */
export function MainMenu({displayName}: { displayName?: string }) {
    const t = useTranslations("menu");
    const tCommon = useTranslations("common");
    const pathname = usePathname();

    const open = useUi((s) => s.menuOpen);
    const setOpen = useUi((s) => s.setMenuOpen);
    const setSettingsOpen = useUi((s) => s.setSettingsOpen);

    const {refs, context} = useFloating({
        open,
        onOpenChange: (next) => {
            if (!next) setOpen(false);
        },
    });

    const dismiss = useDismiss(context, {outsidePressEvent: "mousedown"});
    const role = useRole(context, {role: "dialog"});
    const {getFloatingProps} = useInteractions([dismiss, role]);

    const {isMounted, status} = useTransitionStatus(context, {
        duration: TRANSITION_MS,
    });

    if (!isMounted) return null;

    return (
        <FloatingPortal>
            <FloatingOverlay
                className="main-menu-overlay"
                data-status={status}
                lockScroll
            >
                <FloatingFocusManager context={context} modal>
                    <nav
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        {...getFloatingProps()}
                        aria-label={t("label")}
                        data-status={status}
                        className="main-menu"
                    >
                        <header className="main-menu__header">
                            <h2 className="main-menu__title">{APP_TITLE}</h2>
                        </header>

                        <div className="main-menu__section">
                            <Link
                                href="/"
                                className="main-menu__item"
                                aria-current={pathname === "/" ? "page" : undefined}
                                onClick={() => setOpen(false)}
                            >
                                {tCommon("inventory")}
                            </Link>

                            {/* La page des équipements n'existe pas encore : l'entrée
                                est présente mais inerte, pour dire ce qui vient */}
                            <span
                                className="main-menu__item main-menu__item--soon"
                                aria-disabled="true"
                            >
                                {tCommon("loadouts")}
                                <span className="main-menu__badge">{t("soon")}</span>
                            </span>
                        </div>

                        <div className="main-menu__section">
                            <button
                                type="button"
                                className="main-menu__item"
                                onClick={() => {
                                    setOpen(false);
                                    setSettingsOpen(true);
                                }}
                            >
                                {tCommon("settings")}
                            </button>
                        </div>


                        {/* Ancré en bas : le compte connecté et sa sortie */}
                        <footer className="main-menu__footer">
                            {displayName && (
                                <div className="main-menu__account">
                                    <p className="main-menu__account--text">
                                        {t("signedInAs")}
                                    </p>
                                    <p className="main-menu__account--name">
                                        {displayName}
                                    </p>
                                    <p className="main-menu__account--text">
                                        {/* Custom messages :) */}
                                        {displayName === "Bladedancer#9791" && " (C'est moi !!!)"}
                                        {displayName === "Penguin#3117" && " (antartica man)"}
                                        {displayName === "Fay#8377" && " (:3)"}
                                        {displayName === "Synnefo#1676" && " (nephew)"}
                                        {displayName === "Grayellow#4829" && " (certified unc status)"}
                                        {(displayName === "Lexa#6685" || displayName === "Phrolova#4092") && " (empl*yed)"}  {/* Sorrow */}
                                        {displayName === "Justabee0#6559" && " (omg is that noice???!!!)"}
                                        {displayName === "Alyx#4951" && " (final god of Last Wish farms)"}
                                        {displayName === "Eclipse#4170" && " (sedge farmer 👩‍🌾)"}
                                        {displayName === "Boog Sloogus#6012" && " (goog...)"}
                                        {displayName === "Imbaer#4829" && " (haha, feet)"}
                                        {displayName === "☞〠♡FLANNEL♡〠☜#1570" && " (bane of homeowners)"}

                                        {displayName === "Bog on my dog#7426" && " (Welcome, final god of sleep schedule)"}
                                    </p>
                                </div>
                            )}
                            <form action="/api/auth/logout" method="post">
                                <button
                                    type="submit"
                                    className="main-menu__item main-menu__item--danger"
                                >
                                    {tCommon("logout")}
                                </button>
                            </form>
                        </footer>
                    </nav>
                </FloatingFocusManager>
            </FloatingOverlay>
        </FloatingPortal>
    );
}
