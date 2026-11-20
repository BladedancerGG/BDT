"use client";

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {ArrowUpIcon} from "@heroicons/react/24/solid";

/** Défilement en deçà duquel on considère être « en haut », en pixels */
const TOP_THRESHOLD = 16;

/**
 * Bouton flottant de retour en haut de page, présent seulement quand la page
 * a défilé.
 *
 * Démonté plutôt que masqué : invisible, il resterait atteignable au clavier.
 */
export function ScrollTopButton() {
    const t = useTranslations("admin");
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const update = () => setVisible(window.scrollY > TOP_THRESHOLD);
        update();
        window.addEventListener("scroll", update, {passive: true});
        return () => window.removeEventListener("scroll", update);
    }, []);

    if (!visible) return null;

    return (
        <button
            type="button"
            className="scroll-top"
            aria-label={t("backToTop")}
            title={t("backToTop")}
            onClick={() => {
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                window.scrollTo({top: 0, behavior: reduce ? "auto" : "smooth"});
            }}
        >
            <ArrowUpIcon className="scroll-top__icon"/>
        </button>
    );
}
