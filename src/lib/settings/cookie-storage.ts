"use client";

import type {StateStorage} from "zustand/middleware";

// Un cookie plutôt que localStorage : il est lisible **par le serveur**, qui
// peut donc rendre directement le bon thème et la bonne taille d'icônes dans le
// HTML. Cela supprime d'un coup le flash au chargement, l'écart d'hydratation
// et le besoin d'un script inline (que React signale à chaque navigation).
// Le nom du cookie vit dans constants.ts, partagé avec le serveur.

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Adaptateur de stockage Zustand basé sur un cookie. */
export const cookieStorage: StateStorage = {
    getItem: (name) => {
        const match = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${name}=`));
        if (!match) return null;
        try {
            return decodeURIComponent(match.slice(name.length + 1));
        } catch {
            return null;
        }
    },

    setItem: (name, value) => {
        // Pas de HttpOnly : cette préférence est écrite par le navigateur.
        // SameSite=Lax suffit, aucune donnée sensible ici.
        document.cookie = [
            `${name}=${encodeURIComponent(value)}`,
            "path=/",
            `max-age=${ONE_YEAR}`,
            "samesite=lax",
        ].join("; ");
    },

    removeItem: (name) => {
        document.cookie = `${name}=; path=/; max-age=0`;
    },
};
