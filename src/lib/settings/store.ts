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

export {ICON_SIZE, clampIconSize};
export type {ThemePreference};

export interface SettingsState {
    theme: ThemePreference;
    /** Taille des icônes d'objets en px, bornée à [40, 96] */
    iconSize: number;
    /** Afficher l'ornement équipé plutôt que l'icône de base */
    showOrnaments: boolean;

    setTheme: (theme: ThemePreference) => void;
    setIconSize: (size: number) => void;
    setShowOrnaments: (show: boolean) => void;
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "system",
            iconSize: ICON_SIZE.default,
            showOrnaments: false,

            setTheme: (theme) => set({theme}),
            setIconSize: (size) => set({iconSize: clampIconSize(size)}),
            setShowOrnaments: (showOrnaments) => set({showOrnaments}),
        }),
        {
            name: PREFS_COOKIE,
            version: 1,
            // Cookie : le serveur peut lire ces préférences et rendre le bon thème
            storage: createJSONStorage(() => cookieStorage),
            // Ne persiste que les préférences, pas les setters
            partialize: (state) => ({
                theme: state.theme,
                iconSize: state.iconSize,
                showOrnaments: state.showOrnaments,
            }),
        },
    ),
);
