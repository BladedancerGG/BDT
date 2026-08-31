"use client";

// Envois vers `/api/settings` et `/api/account`.
//
// Le minuteur est au niveau du module et non dans un composant : la
// désactivation de la synchronisation et l'effacement de la sauvegarde doivent
// pouvoir annuler l'envoi différé qu'une modification vient de programmer, sans
// quoi celui-ci recréerait la ligne juste supprimée.

import type {PersistedSettings} from "./store";

/** Délai d'inactivité avant l'envoi, pour ne pas écrire à chaque cran de curseur. */
const PUSH_DELAY_MS = 500;

let timer: ReturnType<typeof setTimeout> | undefined;

function cancelPending(): void {
    clearTimeout(timer);
    timer = undefined;
}

/** Dépose l'état en base, ou bascule le drapeau de la ligne existante. */
export async function pushSettings(
    enabled: boolean,
    data: PersistedSettings,
): Promise<void> {
    cancelPending();
    try {
        await fetch("/api/settings", {
            method: "PUT",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({enabled, data}),
        });
    } catch {
        // Réseau coupé : le cookie garde l'état, la prochaine modification
        // renverra l'ensemble. Rien à signaler à l'utilisateur.
    }
}

/** Même chose, différée : appelée à chaque modification de préférence. */
export function schedulePush(data: PersistedSettings): void {
    cancelPending();
    timer = setTimeout(() => void pushSettings(true, data), PUSH_DELAY_MS);
}

/** Efface la sauvegarde. L'absence de ligne vaut synchronisation coupée. */
export async function deleteSyncedSettings(): Promise<boolean> {
    cancelPending();
    try {
        const response = await fetch("/api/settings", {method: "DELETE"});
        return response.ok;
    } catch {
        return false;
    }
}

/** Efface le compte et tout ce qui s'y rattache. */
export async function deleteAccount(): Promise<boolean> {
    cancelPending();
    try {
        const response = await fetch("/api/account", {method: "DELETE"});
        return response.ok;
    } catch {
        return false;
    }
}
