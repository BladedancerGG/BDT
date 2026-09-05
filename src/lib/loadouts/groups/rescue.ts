"use client";

// Le filet : une copie du dernier état **voulu** des groupes, à part.
//
// Pourquoi une seconde clé plutôt que la seule entrée persistée : celle-ci est
// écrite par le store à chaque changement, quel qu'en soit l'auteur. Une
// relecture du compte, une réhydratation qui échoue, un import — tout ce qui
// vide la liste vide aussi le stockage, et il n'y a plus rien à quoi revenir.
//
// Cette copie-ci n'est écrite que par les gestes de l'utilisateur (créer,
// renommer, modifier, supprimer, réordonner). Elle survit donc précisément aux
// accidents qui emportent l'autre, et `RecoveryRow` la rend d'un clic.

import {isLoadoutGroupArray, type LoadoutGroup} from "./types";

/** Clé du filet. Volontairement distincte de `GROUPS_STORAGE_KEY`. */
const RESCUE_KEY = "bdt-groups-rescue";

export interface RescueSnapshot {
    /** Millisecondes epoch */
    savedAt: number;
    groups: LoadoutGroup[];
}

/**
 * Enregistre l'état courant, s'il porte quelque chose.
 *
 * Une liste vide n'est jamais retenue : le filet n'a d'intérêt que tant qu'il
 * garde ce qu'on a perdu. Supprimer son dernier groupe laisse donc la copie
 * précédente en place — c'est voulu, elle ne coûte que quelques Ko et ne
 * revient dans l'interface que si l'utilisateur la demande.
 */
export function saveRescue(groups: readonly LoadoutGroup[]): void {
    if (groups.length === 0) return;
    try {
        const snapshot: RescueSnapshot = {savedAt: Date.now(), groups: [...groups]};
        localStorage.setItem(RESCUE_KEY, JSON.stringify(snapshot));
    } catch {
        // Quota dépassé, stockage refusé (navigation privée stricte) : le filet
        // est un bonus, son absence ne doit rien interrompre.
    }
}

/**
 * La dernière lecture, gardée pour sa **référence**.
 *
 * `useSyncExternalStore` compare les instantanés par identité et rendrait sans
 * fin si `readRescue` fabriquait un objet neuf à chaque appel. Le cache est
 * invalidé sur la chaîne brute, seule chose qui dise vraiment que le filet a
 * bougé — y compris quand c'est un autre onglet qui l'a écrit.
 */
let cache: {raw: string | null; snapshot: RescueSnapshot | null} = {
    raw: null,
    snapshot: null,
};

/** La copie retenue, ou `null` s'il n'y en a pas de lisible. */
export function readRescue(): RescueSnapshot | null {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(RESCUE_KEY);
    } catch {
        return null;
    }
    if (raw === cache.raw) return cache.snapshot;
    cache = {raw, snapshot: parseRescue(raw)};
    return cache.snapshot;
}

function parseRescue(raw: string | null): RescueSnapshot | null {
    try {
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return null;
        const {savedAt, groups} = parsed as Record<string, unknown>;
        if (typeof savedAt !== "number" || !isLoadoutGroupArray(groups)) return null;
        return groups.length > 0 ? {savedAt, groups} : null;
    } catch {
        return null;
    }
}

export function clearRescue(): void {
    try {
        cache = {raw: null, snapshot: null};
        localStorage.removeItem(RESCUE_KEY);
    } catch {
        // Voir `saveRescue`.
    }
}
