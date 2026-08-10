"use client";

import {useLayoutEffect, useState, type RefObject} from "react";

export interface GridMetrics {
    /** Nombre d'objets par ligne, selon la largeur disponible */
    columns: number;
    /** Hauteur d'une ligne, gouttière incluse */
    rowHeight: number;
    /** Hauteur d'un en-tête de premier niveau (objets perdus, coffre), gouttière incluse */
    rootHeight: number;
    /** Hauteur d'un en-tête d'emplacement, gouttière incluse */
    sectionHeight: number;
    /** Hauteur d'un en-tête de sous-groupe, gouttière incluse */
    groupHeight: number;
}

const FALLBACK: GridMetrics = {
    columns: 1,
    rowHeight: 83,
    rootHeight: 58,
    sectionHeight: 36,
    groupHeight: 50,
};

/**
 * Mesure une grille d'objets pour la virtualisation.
 *
 * Les dimensions viennent des variables CSS `--item-size` / `--item-gap`
 * (définies dans `scss/layout/main.scss`) : pas de valeur dupliquée en JS, et
 * un changement de taille dans le SCSS est automatiquement pris en compte.
 */
export function useGridMetrics(
    ref: RefObject<HTMLElement | null>,
    /**
     * Valeur à surveiller pour forcer une re-mesure : le ResizeObserver ne se
     * déclenche pas quand seule la taille des icônes change (largeur inchangée).
     */
    sizeKey?: number,
): GridMetrics {
    const [metrics, setMetrics] = useState<GridMetrics>(FALLBACK);

    // Mesure avant peinture : évite une frame affichée avec une seule colonne.
    // Sans risque côté serveur, la grille n'étant rendue qu'une fois le manifeste
    // chargé (donc uniquement côté client).
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;

        const measure = () => {
            const styles = getComputedStyle(element);
            const size = parseFloat(styles.getPropertyValue("--item-size")) || 75;
            const gap = parseFloat(styles.getPropertyValue("--item-gap")) || 8;
            // Les en-têtes de groupe entrent dans la même virtualisation que les
            // objets : leur hauteur vient donc du CSS elle aussi, pour ne pas
            // dupliquer une valeur de mise en page en JavaScript.
            const root =
                parseFloat(styles.getPropertyValue("--inventory-header-height")) || 50;
            const section =
                parseFloat(styles.getPropertyValue("--group-section-height")) || 28;
            const group =
                parseFloat(styles.getPropertyValue("--group-header-height")) || 42;

            // n objets et (n-1) gouttières doivent tenir dans la largeur :
            // n * size + (n - 1) * gap <= width  →  n <= (width + gap) / (size + gap)
            const width = element.clientWidth;
            const columns = Math.max(1, Math.floor((width + gap) / (size + gap)));

            const next: GridMetrics = {
                columns,
                rowHeight: size + gap,
                rootHeight: root + gap,
                sectionHeight: section + gap,
                groupHeight: group + gap,
            };

            setMetrics((previous) =>
                previous.columns === next.columns &&
                previous.rowHeight === next.rowHeight &&
                previous.rootHeight === next.rootHeight &&
                previous.sectionHeight === next.sectionHeight &&
                previous.groupHeight === next.groupHeight
                    ? previous // évite un rendu inutile
                    : next,
            );
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, sizeKey]);

    return metrics;
}
