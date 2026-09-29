"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MoveTarget } from "@/lib/destiny/moves";

/**
 * État de la barre de recherche.
 *
 * Elle vit dans l'en-tête, hors de l'arbre de l'inventaire : un store partagé
 * est le seul lien entre les deux. La requête descend, et ce qu'on sait des
 * objets trouvés remonte (voir `results`).
 *
 * L'historique va dans **localStorage**, pas dans le cookie de préférences :
 * celui-ci est plafonné à 4 Ko, partagé avec le reste des réglages, et le
 * serveur n'a rien à faire des recherches passées.
 */

/** Ce que l'inventaire sait des objets trouvés, publié par lui. */
export interface SearchResults {
  /**
   * Nombre d'objets trouvés, affiché dans la barre. `null` quand aucune
   * recherche n'est appliquée — la barre n'affiche alors rien.
   */
  total: number | null;
  /** Destinations possibles, dans l'ordre d'affichage */
  characters: { characterId: string; label: string }[];
  /** Objets trouvés susceptibles d'être déplacés (les objets instanciés) */
  movable: number;
  move: (target: MoveTarget) => void;
}

/** Recherches conservées au maximum ; le réglage n'en affiche qu'une partie. */
export const MAX_SEARCH_HISTORY = 30;

interface SearchState {
  /** Ce que l'utilisateur a tapé, appliqué après un court délai */
  query: string;
  history: string[];
  /** Publié par l'inventaire, `null` tant qu'il n'est pas monté */
  results: SearchResults | null;

  setQuery: (query: string) => void;
  /** Retient une requête aboutie (validation ou choix dans l'historique) */
  remember: (query: string) => void;
  clearHistory: () => void;
  setResults: (results: SearchResults | null) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      query: "",
      history: [],
      results: null,

      setQuery: (query) => set({ query }),

      remember: (query) =>
        set((state) => {
          const trimmed = query.trim();
          if (!trimmed) return state;
          // Une recherche répétée remonte en tête plutôt que de s'y ajouter
          const history = [
            trimmed,
            ...state.history.filter((entry) => entry !== trimmed),
          ].slice(0, MAX_SEARCH_HISTORY);
          return { history };
        }),

      clearHistory: () => set({ history: [] }),
      setResults: (results) => set({ results }),
    }),
    {
      name: "bdt-search",
      storage: createJSONStorage(() => localStorage),
      // Ni la requête en cours ni le pont vers l'inventaire n'ont à survivre
      // au rechargement : seul l'historique est une préférence.
      partialize: (state) => ({ history: state.history }),
    },
  ),
);
