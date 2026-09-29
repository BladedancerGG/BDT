"use client";

// Envois vers `/api/loadout-groups`.
//
// Le minuteur est au niveau du module, comme pour les préférences : couper la
// synchronisation doit pouvoir annuler l'envoi différé qu'une modification
// vient de programmer, sans quoi celui-ci recréerait la ligne juste supprimée.
//
// Un envoi qui échoue n'est plus silencieux. Il l'était, et c'est une des façons
// dont on perdait des groupes : un refus (corps invalide, sauvegarde trop
// grosse, session expirée) laissait la base en retard sans que rien ne le dise,
// et la relecture suivante rendait cette liste périmée. Le retard est désormais
// retenu, réessayé, et lisible depuis l'interface.

import {isLoadoutGroupArray, type LoadoutGroup} from "./types";
import type {RemoteGroups} from "./sync-merge";

/** Délai d'inactivité avant l'envoi. */
const PUSH_DELAY_MS = 800;

/** Délai avant de réessayer un envoi refusé ou perdu. */
const RETRY_DELAY_MS = 5_000;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Ce qui reste à déposer, quand le dernier envoi n'a pas abouti. */
let pending: LoadoutGroup[] | null = null;

/** Résultat du dernier envoi tenté, pour l'interface. */
export type PushStatus = "ok" | "rejected" | "offline";

let lastStatus: PushStatus = "ok";
const listeners = new Set<() => void>();

function setStatus(status: PushStatus): void {
    if (status === lastStatus) return;
    lastStatus = status;
    listeners.forEach((notify) => notify());
}

/** Abonnement pour `useSyncStatus` — signature de `useSyncExternalStore`. */
export function subscribeToPushStatus(notify: () => void): () => void {
    listeners.add(notify);
    return () => listeners.delete(notify);
}

export function getPushStatus(): PushStatus {
    return lastStatus;
}

function cancelPending(): void {
    clearTimeout(timer);
    timer = undefined;
}

/**
 * Relit la sauvegarde du compte.
 *
 * Rend toujours un `RemoteGroups` : `groups: null` quand le compte n'a rien
 * déposé **et** quand la sauvegarde est hors d'atteinte. Les deux se traitent
 * pareil — on garde le local — et c'est précisément ce que l'ancienne signature
 * ne permettait pas de dire.
 */
export async function pullGroups(): Promise<RemoteGroups> {
    const absent: RemoteGroups = {groups: null, updatedAt: null};
    try {
        const response = await fetch("/api/loadout-groups");
        if (!response.ok) return absent;
        const body = (await response.json()) as {
            groups?: unknown;
            updatedAt?: unknown;
        };
        // La route valide déjà, mais elle n'est pas la seule chose entre elle et
        // ici : un proxy ou une page d'erreur en JSON passeraient le `ok`.
        if (!isLoadoutGroupArray(body.groups)) return absent;
        return {
            groups: body.groups,
            updatedAt:
                typeof body.updatedAt === "number" ? body.updatedAt : null,
        };
    } catch {
        return absent;
    }
}

export async function pushGroups(
    groups: readonly LoadoutGroup[],
): Promise<PushStatus> {
    cancelPending();
    try {
        const response = await fetch("/api/loadout-groups", {
            method: "PUT",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({groups}),
        });
        if (!response.ok) {
            // 400, 413, 401 : réessayer à l'identique ne changera rien, mais
            // l'état doit rester visible — la base est en retard, et c'est ce
            // retard qui écrase ensuite le local si on l'ignore.
            pending = [...groups];
            setStatus("rejected");
            return "rejected";
        }
        pending = null;
        setStatus("ok");
        return "ok";
    } catch {
        // Réseau coupé : le stockage local garde l'état et l'envoi est retenté,
        // faute de quoi une modification isolée ne repartirait jamais.
        pending = [...groups];
        setStatus("offline");
        timer = setTimeout(() => void pushGroups(pending ?? groups), RETRY_DELAY_MS);
        return "offline";
    }
}

/** Même chose, différée : appelée à chaque modification d'un groupe. */
export function scheduleGroupsPush(groups: readonly LoadoutGroup[]): void {
    cancelPending();
    pending = [...groups];
    timer = setTimeout(() => void pushGroups(groups), PUSH_DELAY_MS);
}

/**
 * Envoie tout de suite ce qui attendait encore.
 *
 * Appelé quand la page se retire (`pagehide`, onglet masqué) : les 800 ms
 * d'inactivité sont plus longues qu'un rechargement, et l'envoi programmé
 * mourait avec la page. La modification restait alors dans le seul stockage
 * local — jusqu'à ce que la relecture suivante la remplace par la version que le
 * serveur, lui, avait toujours. C'est le scénario du « je change le code, mes
 * groupes disparaissent » : chaque rechargement à chaud arrivait pendant le
 * délai.
 *
 * `sendBeacon` et non `fetch` : c'est le seul envoi que le navigateur promet de
 * mener à bien après le retrait de la page.
 */
export function flushGroupsPush(): void {
    if (!pending) return;
    const body = JSON.stringify({groups: pending});
    cancelPending();
    try {
        const sent = navigator.sendBeacon(
            "/api/loadout-groups",
            new Blob([body], {type: "application/json"}),
        );
        if (sent) pending = null;
    } catch {
        // Rien à faire de plus ici : la liste reste dans `pending`, et la fusion
        // au prochain chargement la rattrapera par sa date.
    }
}

/** Efface la sauvegarde du compte. Le stockage local n'est pas touché. */
export async function deleteSyncedGroups(): Promise<boolean> {
    cancelPending();
    pending = null;
    setStatus("ok");
    try {
        const response = await fetch("/api/loadout-groups", {method: "DELETE"});
        return response.ok;
    } catch {
        return false;
    }
}
