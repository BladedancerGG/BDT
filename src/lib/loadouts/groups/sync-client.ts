"use client";

// Envois vers `/api/loadout-groups`.
//
// Le minuteur est au niveau du module, comme pour les préférences : couper la
// synchronisation doit pouvoir annuler l'envoi différé qu'une modification
// vient de programmer, sans quoi celui-ci recréerait la ligne juste supprimée.

import {isLoadoutGroupArray, type LoadoutGroup} from "./types";

/** Délai d'inactivité avant l'envoi. */
const PUSH_DELAY_MS = 800;

let timer: ReturnType<typeof setTimeout> | undefined;

function cancelPending(): void {
    clearTimeout(timer);
    timer = undefined;
}

/** Relit la sauvegarde du compte, ou `null` si elle est hors d'atteinte. */
export async function pullGroups(): Promise<LoadoutGroup[] | null> {
    try {
        const response = await fetch("/api/loadout-groups");
        if (!response.ok) return null;
        const body: unknown = await response.json();
        const groups = (body as {groups?: unknown}).groups;
        // La route valide déjà, mais elle n'est pas la seule chose entre elle et
        // ici : un proxy ou une page d'erreur en JSON passeraient le `ok`.
        return isLoadoutGroupArray(groups) ? groups : null;
    } catch {
        return null;
    }
}

export async function pushGroups(groups: readonly LoadoutGroup[]): Promise<void> {
    cancelPending();
    try {
        await fetch("/api/loadout-groups", {
            method: "PUT",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({groups}),
        });
    } catch {
        // Réseau coupé : le stockage local garde l'état, la prochaine
        // modification renverra l'ensemble. Rien à signaler.
    }
}

/** Même chose, différée : appelée à chaque modification d'un groupe. */
export function scheduleGroupsPush(groups: readonly LoadoutGroup[]): void {
    cancelPending();
    timer = setTimeout(() => void pushGroups(groups), PUSH_DELAY_MS);
}

/** Efface la sauvegarde du compte. Le stockage local n'est pas touché. */
export async function deleteSyncedGroups(): Promise<boolean> {
    cancelPending();
    try {
        const response = await fetch("/api/loadout-groups", {method: "DELETE"});
        return response.ok;
    } catch {
        return false;
    }
}
