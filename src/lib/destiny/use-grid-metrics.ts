"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export interface GridMetrics {
  /** Nombre d'objets par ligne, selon la largeur disponible */
  columns: number;
  /** Hauteur d'une ligne, gouttière incluse */
  rowHeight: number;
}

const FALLBACK: GridMetrics = { columns: 1, rowHeight: 83 };

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

      // n objets et (n-1) gouttières doivent tenir dans la largeur :
      // n * size + (n - 1) * gap <= width  →  n <= (width + gap) / (size + gap)
      const width = element.clientWidth;
      const columns = Math.max(1, Math.floor((width + gap) / (size + gap)));

      setMetrics((previous) =>
        previous.columns === columns && previous.rowHeight === size + gap
          ? previous // évite un rendu inutile
          : { columns, rowHeight: size + gap },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, sizeKey]);

  return metrics;
}
