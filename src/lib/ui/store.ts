"use client";

import {create} from "zustand";

/**
 * État d'ouverture des surfaces de navigation globales.
 *
 * Le menu latéral et le bouton d'engrenage de l'en-tête ouvrent tous deux les
 * paramètres : l'état ne peut donc plus être local à `HeaderActions`, sans quoi
 * l'entrée du menu n'aurait aucun moyen de l'atteindre. Le store joue le même
 * rôle ici que pour le panneau des actions.
 */
interface UiState {
    menuOpen: boolean;
    setMenuOpen: (open: boolean) => void;
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
    menuOpen: false,
    setMenuOpen: (menuOpen) => set({menuOpen}),
    settingsOpen: false,
    setSettingsOpen: (settingsOpen) => set({settingsOpen}),
}));
