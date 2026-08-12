// Helpers génériques sur les sockets, indépendants de leur usage.

import type {InventoryItemDefinition} from "./types";
import {TIER} from "./display";

/**
 * Catégories de sockets des artéfacts. Elles n'ont **aucun nom** dans le
 * manifeste : l'UI fournit donc son propre libellé.
 */
export const ARTIFACT_SOCKET_CATEGORIES: readonly number[] = [
    2631166533, 2631166534, 2631166535, 3072446841,
];

/**
 * Un plug a-t-il réellement été inséré dans ce socket ?
 *
 * Faux quand le plug équipé est encore le plug initial du socket : c'est le
 * placeholder par défaut (« Mod d'artéfact vide », « Ornement d'origine »…),
 * qu'il ne faut pas présenter comme un choix du joueur.
 */
export function isPlugApplied(
    def: InventoryItemDefinition | undefined,
    socketIndex: number,
    equippedPlugHash: number,
): boolean {
    const initial =
        def?.sockets?.socketEntries?.[socketIndex]?.singleInitialItemHash;
    return equippedPlugHash !== initial;
}

/**
 * Ce plug est-il un compte-frags (« kill tracker ») ?
 *
 * Le compte lui-même est déjà repris dans le résumé de l'arme : son icône dans
 * la rangée de mods n'ajoute rien. Les deux familles concernées se distinguent
 * par leur segment `trackers` (`v300.plugs.weapons.masterworks.trackers` pour
 * les compteurs classiques, `crafting.plugs.weapons.mods.trackers` pour les
 * armes façonnées), y compris l'emplacement vide.
 */
export function isTrackerPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    return Boolean(category?.split(".").includes("trackers"));
}

/**
 * Ce plug est-il la version **améliorée** d'un attribut d'arme ?
 *
 * Rien ne le signale explicitement dans le manifeste : les deux versions d'un
 * même attribut partagent leurs `itemCategoryHashes`, leur `plugStyle` et leur
 * `plugCategoryIdentifier`. La seule différence indépendante de la langue est la
 * rareté — relevée sur les 628 plugs de la catégorie `frames` : 357 en Ordinaire
 * (attributs de base) contre 226 en Peu commun (« Attribut amélioré »). Les
 * autres familles améliorables suivent la même règle (canons, chargeurs,
 * particularités d'origine…).
 *
 * Deux plugs échappent à la règle côté Bungie — Déconstruction et Osmose sont en
 * Peu commun sans être des versions améliorées. Ils seront donc signalés à tort ;
 * c'est le prix de l'absence de marqueur, et le comportement de DIM également.
 */
export function isEnhancedPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    if (!category) return false;
    // Les cosmétiques ont eux aussi des variantes en Peu commun (ornements
    // « magnifiques », revêtements, interactions) sans rien d'amélioré.
    if (COSMETIC_PLUG_CATEGORY.test(category)) return false;
    return def?.inventory?.tierType === TIER.Common;
}

/** Familles de plugs purement cosmétiques — voir isEnhancedPlug. */
const COSMETIC_PLUG_CATEGORY =
    /^(?:armor_skins|v\d+_plugs_armor_skins|shader|emote|events\.)/;
