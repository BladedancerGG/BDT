"use client";

import {useLayoutEffect, useRef, type RefObject} from "react";
import {ICON_SIZE} from "@/lib/settings/constants";

/**
 * Seuil au-delà duquel la page ne défile plus et chaque zone défile pour son
 * propre compte. ⚠ Doublon de `$bp-lg` (scss/abstracts/variables.scss), comme
 * les seuils de `use-media-query.ts` : en dessous, c'est la page entière qui
 * défile, et « ne pas défiler » n'y a plus de sens.
 */
const WIDE_QUERY = "(min-width: 1024px)";

export interface AutoItemSizeOptions {
    /** Le réglage « automatique » de la vue : coupé, rien n'est touché. */
    enabled: boolean;
    /**
     * La variable CSS écrite en style inline sur l'élément mesuré. Ce doit être
     * celle que la règle de l'élément lit pour poser `--item-size` (ou dont ses
     * vignettes lisent la taille) : posée sur l'élément lui-même, elle
     * l'emporte sur la valeur héritée de `:root` pour tout le sous-arbre.
     */
    variable: string;
    /**
     * Taille plafond imposée par la largeur, en px, ou `undefined` sans plafond.
     * Elle sert aussi de repli quand même la taille minimale déborde : il n'y a
     * alors plus de taille qui évite le défilement, et c'est la largeur qui
     * décide. Sans plafond, le repli est la taille minimale — celle qui défile
     * le moins.
     */
    widthCap?: () => number;
    /**
     * Garder la taille déjà trouvée au lieu de la réévaluer. Pour un état
     * passager où le contenu change sans que la vue change de nature — les
     * vignettes qui grandiraient le temps d'un geste puis rétréciraient au
     * retour ne feraient que sauter sous le pointeur.
     */
    frozen?: boolean;
}

/** Ramène une taille à des pixels entiers dans les bornes du réglage. */
function bound(size: number): number {
    return Math.min(ICON_SIZE.max, Math.max(ICON_SIZE.min, Math.floor(size)));
}

/**
 * La plus grande taille de vignette pour laquelle `el` ne défile pas
 * verticalement — à écrire dans `variable`.
 *
 * Mesurée et non calculée : la hauteur d'une colonne mêle des vignettes, des
 * gouttières, des bandeaux et des textes dont la taille ne suit pas toujours
 * celle des icônes, et la refaire ici en arithmétique doublerait le SCSS sans
 * jamais tomber juste. Une dichotomie sur les entiers de [40, 96] coûte au plus
 * sept mises en page forcées.
 *
 * Le test vaut parce que la hauteur de `el` ne dépend pas de son contenu : sur
 * grand écran, les deux vues l'étirent sur la hauteur de leur rangée de grille.
 */
function fitSize(el: HTMLElement, variable: string, widthCap?: () => number): number {
    const overflows = (size: number) => {
        el.style.setProperty(variable, `${size}px`);
        // Un pixel de tolérance : les tailles en rem tombent sur des fractions
        // que scrollHeight arrondit, et une colonne pile à la bonne hauteur
        // passerait sinon pour débordante.
        return el.scrollHeight > el.clientHeight + 1;
    };

    const cap = widthCap ? bound(widthCap()) : ICON_SIZE.max;
    if (!overflows(cap)) return cap;
    if (overflows(ICON_SIZE.min)) return widthCap ? cap : ICON_SIZE.min;

    // Invariant : `fits` ne déborde pas, `over` déborde.
    let fits: number = ICON_SIZE.min;
    let over = cap;
    while (over - fits > 1) {
        const mid = Math.floor((fits + over) / 2);
        if (overflows(mid)) over = mid;
        else fits = mid;
    }
    return fits;
}

/**
 * Règle automatiquement la taille des vignettes d'une zone pour qu'elle n'ait
 * pas à défiler, sur grand écran seulement (voir `fitSize`).
 *
 * La taille est réévaluée quand la zone ou l'un de ses enfants change de
 * taille : fenêtre redimensionnée, onglet changé, bloc qui apparaît. Elle l'est
 * à l'image suivante et non dans le rappel du `ResizeObserver` : y changer la
 * taille des éléments observés déclencherait l'erreur « ResizeObserver loop »,
 * que l'overlay de Next.js remonte comme un plantage. La réévaluation que
 * provoque notre propre réglage retombe sur la même taille, et les tailles
 * observées ne bougeant plus, la boucle s'éteint d'elle-même.
 */
export function useAutoItemSize(
    ref: RefObject<HTMLElement | null>,
    {enabled, variable, widthCap, frozen = false}: AutoItemSizeOptions,
): void {
    // Lu à chaque réévaluation plutôt que placé dans les dépendances : une
    // fonction fraîche à chaque rendu relancerait l'abonnement en boucle.
    const capRef = useRef(widthCap);
    // Même raison pour le gel : le passer en dépendance démonterait
    // l'abonnement, dont le nettoyage efface la taille qu'on veut garder.
    const frozenRef = useRef(frozen);
    // La réévaluation de l'abonnement en cours, pour la relancer au dégel.
    const scheduleRef = useRef<(() => void) | null>(null);
    useLayoutEffect(() => {
        capRef.current = widthCap;
        frozenRef.current = frozen;
    });
    // Au dégel, le contenu a pu changer pendant le gel sans que rien ne le
    // signale plus : on réévalue d'office.
    useLayoutEffect(() => {
        if (!frozen) scheduleRef.current?.();
    }, [frozen]);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;

        const media = window.matchMedia(WIDE_QUERY);
        let frame = 0;

        const apply = () => {
            frame = 0;
            // Gelé : la taille en place reste. Sans taille encore posée (gel dès
            // le montage), on la calcule tout de même une fois.
            if (frozenRef.current && el.style.getPropertyValue(variable)) return;
            if (!media.matches || el.clientHeight === 0) {
                // Petit écran, ou zone masquée : le réglage manuel reprend la
                // main, par la variable héritée de `:root`.
                el.style.removeProperty(variable);
                return;
            }
            // La dichotomie fait défiler le contenu de haut en bas : on rend
            // la position d'origine une fois la taille trouvée.
            const scrollTop = el.scrollTop;
            el.style.setProperty(variable, `${fitSize(el, variable, capRef.current)}px`);
            el.scrollTop = scrollTop;
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(apply);
        };
        scheduleRef.current = schedule;

        // Première taille avant la peinture : sans elle, la zone serait
        // d'abord montrée à la taille du curseur.
        apply();

        const resize = new ResizeObserver(schedule);
        const observeChildren = () => {
            resize.disconnect();
            resize.observe(el);
            for (const child of el.children) resize.observe(child);
        };
        observeChildren();
        // Un enfant qui apparaît (la consigne de l'éditeur de groupes, par
        // exemple) n'est pas observé : on reprend la liste à chaque mutation.
        const mutations = new MutationObserver(() => {
            observeChildren();
            schedule();
        });
        mutations.observe(el, {childList: true});
        media.addEventListener("change", schedule);

        return () => {
            scheduleRef.current = null;
            if (frame) cancelAnimationFrame(frame);
            resize.disconnect();
            mutations.disconnect();
            media.removeEventListener("change", schedule);
            el.style.removeProperty(variable);
        };
    }, [ref, enabled, variable, capRef, frozenRef]);
}
