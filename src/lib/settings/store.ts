"use client";

import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {cookieStorage} from "./cookie-storage";
import {
    ICON_SIZE,
    PREFS_COOKIE,
    clampIconSize,
    type ThemePreference,
} from "./constants";
import {
    DEFAULT_SORT_RULES,
    moveSortRule,
    parseSortRules,
    serializeSortRules,
    type SortId,
    type SortRule,
} from "@/lib/destiny/sort";

export {ICON_SIZE, clampIconSize};
export type {ThemePreference};

export interface SettingsState {
    theme: ThemePreference;
    /** Taille des icônes d'objets en px, bornée à [40, 96] */
    iconSize: number;
    /** Afficher l'ornement équipé plutôt que l'icône de base */
    showOrnaments: boolean;
    /** Critères de tri du coffre, du plus important au moins important */
    sortRules: SortRule[];

    setTheme: (theme: ThemePreference) => void;
    setIconSize: (size: number) => void;
    setShowOrnaments: (show: boolean) => void;

    /** Active ou désactive un critère, sans changer sa place */
    toggleSort: (id: SortId) => void;
    /** Inverse le sens d'un critère */
    reverseSort: (id: SortId) => void;
    /** Déplace un critère dans l'ordre d'importance (glisser-déposer) */
    moveSort: (from: number, to: number) => void;
    resetSorts: () => void;
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "system",
            iconSize: ICON_SIZE.default,
            showOrnaments: false,
            sortRules: [...DEFAULT_SORT_RULES],

            setTheme: (theme) => set({theme}),
            setIconSize: (size) => set({iconSize: clampIconSize(size)}),
            setShowOrnaments: (showOrnaments) => set({showOrnaments}),

            toggleSort: (id) =>
                set((state) => ({
                    sortRules: state.sortRules.map((rule) =>
                        rule.id === id ? {...rule, enabled: !rule.enabled} : rule,
                    ),
                })),

            reverseSort: (id) =>
                set((state) => ({
                    sortRules: state.sortRules.map((rule) =>
                        rule.id === id ? {...rule, desc: !rule.desc} : rule,
                    ),
                })),

            moveSort: (from, to) =>
                set((state) => ({
                    sortRules: moveSortRule(state.sortRules, from, to),
                })),

            resetSorts: () => set({sortRules: [...DEFAULT_SORT_RULES]}),
        }),
        {
            name: PREFS_COOKIE,
            version: 1,
            // Cookie : le serveur peut lire ces préférences et rendre le bon thème
            storage: createJSONStorage(() => cookieStorage),
            // Ne persiste que les préférences, pas les setters.
            // Les règles de tri partent en jetons courts : un cookie est limité
            // à 4 Ko et porte déjà les autres préférences.
            partialize: (state) => ({
                theme: state.theme,
                iconSize: state.iconSize,
                showOrnaments: state.showOrnaments,
                sorts: serializeSortRules(state.sortRules),
            }),
            // Reconstruit les règles depuis les jetons. Un cookie écrit avant
            // l'arrivée du tri n'a pas de clé `sorts` : les valeurs par défaut
            // s'appliquent alors, sans migration ni perte des autres réglages.
            merge: (persisted, current) => {
                const {sorts, ...rest} = (persisted ?? {}) as Partial<SettingsState> & {
                    sorts?: unknown;
                };
                return {
                    ...current,
                    ...rest,
                    sortRules: parseSortRules(sorts) ?? current.sortRules,
                };
            },
        },
    ),
);
