// Doctrines (subclasses).
//
// Leur élément n'est PAS dans `defaultDamageType` (toujours 0) mais dans
// `talentGrid.hudDamageType`, qui reprend l'enum DamageType. `talentGrid.buildName`
// donne le couple élément/classe (« strand_titan », « prism_hunter »…).
//
// Les doctrines prismatiques déclarent `hudDamageType: 1` (cinétique), qui n'est
// pas un élément de doctrine : c'est leur marqueur, confirmé par le préfixe
// « prism_ » du buildName.

import type {InventoryItemDefinition} from "./types";
import {ITEM_TYPE} from "./display";

/** Éléments de doctrine réellement colorés (arc, solaire, abyssal, stase, filobscur). */
const ELEMENTAL_DAMAGE_TYPES: ReadonlySet<number> = new Set([2, 3, 4, 6, 7]);

export type SubclassKind = "elemental" | "prismatic";

export function isSubclass(def: InventoryItemDefinition | undefined): boolean {
    return def?.itemType === ITEM_TYPE.Subclass;
}

/** Élément de la doctrine, ou undefined si ce n'est pas une doctrine élémentaire. */
export function subclassDamageType(
    def: InventoryItemDefinition | undefined,
): number | undefined {
    if (!isSubclass(def)) return undefined;
    const damageType = def?.talentGrid?.hudDamageType;
    return damageType !== undefined && ELEMENTAL_DAMAGE_TYPES.has(damageType)
        ? damageType
        : undefined;
}

/**
 * Nature de la doctrine, qui détermine la forme de la vignette :
 * losange pour les élémentaires, cercle pour les prismatiques.
 */
export function subclassKind(
    def: InventoryItemDefinition | undefined,
): SubclassKind | undefined {
    if (!isSubclass(def)) return undefined;
    if (subclassDamageType(def) !== undefined) return "elemental";
    // Reste des doctrines : prismatiques (buildName en « prism_ »)
    return def?.talentGrid?.buildName?.startsWith("prism")
        ? "prismatic"
        : undefined;
}

// —— Sockets d'une doctrine ————————————————————————————————————
//
// Les catégories de sockets ne sont PAS exploitables : leur hash change selon
// la classe et l'élément (COMPÉTENCES vaut 309722977 chez l'Arcaniste Arc,
// 3218807805 chez le Chasseur Abyssal…). En revanche le suffixe de
// `plug.plugCategoryIdentifier` est stable :
//   « warlock.arc.class_abilities », « hunter.void.movement »,
//   « shared.arc.grenades », « …aspects », « …fragments ».
//
// Les index de sockets ne suivent pas l'ordre d'affichage voulu (le jeu place
// classe=0, mouvement=1, super=2, mêlée=3, grenade=4) : on trie donc par nature.

export type SubclassSocketKind =
    | "super"
    | "class"
    | "movement"
    | "grenade"
    | "melee"
    | "transcendence"
    | "prismGrenade"
    | "aspect"
    | "fragment";

/** Ordre d'affichage de la première ligne. */
export const ABILITY_ORDER: readonly SubclassSocketKind[] = [
    "super",
    "class",
    "movement",
    "grenade",
    "melee",
];

/**
 * Deuxième ligne, propre aux doctrines prismatiques : la transcendance et sa
 * grenade. Elles vivent dans leur propre catégorie de sockets (TRANSCENDANCE) et
 * n'ont donc pas leur place parmi les cinq compétences.
 */
export const TRANSCENDENCE_ORDER: readonly SubclassSocketKind[] = [
    "transcendence",
    "prismGrenade",
];

/**
 * Nature d'un plug de doctrine, d'après le suffixe de sa famille.
 *
 * Attention aux noms historiques : la stase, première doctrine à avoir reçu
 * aspects et fragments (Beyond Light), les nomme encore `totems` et `trinkets`.
 * Les ignorer laissait les tooltips de stase sans aspects ni fragments.
 */
export function subclassSocketKind(
    plugCategoryIdentifier: string | undefined,
): SubclassSocketKind | undefined {
    if (!plugCategoryIdentifier) return undefined;
    const suffix = plugCategoryIdentifier.split(".").pop();
    switch (suffix) {
        case "supers":
            return "super";
        case "class_abilities":
            return "class";
        case "movement":
            return "movement";
        case "grenades":
            return "grenade";
        case "melee":
            return "melee";
        case "transcendence":
            return "transcendence";
        case "prism_grenade":
            return "prismGrenade";
        case "aspects":
        case "totems": // aspects de stase
            return "aspect";
        case "fragments":
        case "trinkets": // fragments de stase
            return "fragment";
        default:
            return undefined;
    }
}

/**
 * Seuls les emplacements d'aspects et de fragments peuvent être vides.
 *
 * Une compétence est toujours équipée : son plug est fréquemment le plug
 * initial du socket (capacité par défaut jamais changée), ce qui ne veut pas
 * dire que l'emplacement est libre.
 */
export function canSocketBeEmpty(kind: SubclassSocketKind): boolean {
    return kind === "aspect" || kind === "fragment";
}
