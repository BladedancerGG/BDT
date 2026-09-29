// Type anti-champion d'une arme : bloqueur, surchargé, implacable.
//
// Le manifeste l'expose bel et bien, mais pas là où on l'attend : le champ
// `breakerType` d'une définition d'arme ne vaut autre chose que 0 que pour 17
// exotiques, et pourtant l'information existe pour presque toutes les armes —
// portée par les **perks de sandbox de l'attribut intrinsèque** (l'armature).
// Trois perks jouent ce rôle, et leur nom l'annonce sans ambiguïté :
//
//   3469621377  « [Shield-Piercing] Barrier »    → bloqueur
//   472686235   « [Disruption] Overload »        → surchargé
//   2917776374  « [Stagger] Unstoppable »        → implacable
//
// C'est la piste suivie par Destiny Item Manager (`d2-item-factory.ts`,
// `breakerTypeByPerkHash`), et elle vaut mieux qu'un tableau de correspondances
// tenu à la main : 475 armatures les portent, ce qui couvre 2 054 des 2 059
// armes légendaires et exotiques du manifeste. Aucun nom d'armature à
// reconnaître, donc rien qui dépende de la langue, et les valeurs suivent les
// rééquilibrages de Bungie sans intervention.

import type {InventoryItemDefinition} from "./types";

/** DestinyBreakerType — `enumValue` de DestinyBreakerTypeDefinition. */
export const BREAKER = {
    /** Brise-bouclier : efficace contre les Champions bloqueurs */
    Barrier: 1,
    /** Perturbation : Champions surchargés */
    Overload: 2,
    /** Chancellement : Champions implacables */
    Unstoppable: 3,
} as const;

/**
 * Perks de sandbox qui confèrent un effet anti-champion. Relevés dans
 * DestinySandboxPerkDefinition — voir l'en-tête du fichier pour leurs noms.
 */
const BREAKER_BY_PERK: Record<number, number> = {
    3469621377: BREAKER.Barrier,
    472686235: BREAKER.Overload,
    2917776374: BREAKER.Unstoppable,
};

/**
 * Les cinq exotiques dont l'armature ne porte aucun de ces perks, alors que le
 * jeu leur donne bien un effet. Valeurs prises dans `exotic breakers.md` ; les
 * trois premières concordent avec la liste équivalente de DIM
 * (`data/d2/extended-breaker.json`), elle aussi tenue à la main.
 *
 * Indexées par hash d'arme, donc indépendantes de la langue. Légende d'Acrius en
 * a deux, une par édition.
 */
const EXOTIC_OVERRIDES: Record<number, number> = {
    449318888: BREAKER.Barrier, // Deterministic Chaos
    3049715579: BREAKER.Barrier, // Praxic Blade
    1047932517: BREAKER.Overload, // Slayer's Fang
    1744115122: BREAKER.Overload, // Legend of Acrius
    3580904580: BREAKER.Overload, // Legend of Acrius
    1685137410: BREAKER.Unstoppable, // Heirloom
};

/**
 * Effet anti-champion d'une arme, dans l'ordre : ce que déclare sa définition,
 * les perks de son armature équipée, puis la liste de rattrapage.
 *
 * L'armature doit être celle de l'**instance** et non celle de la définition :
 * Ergo Sum tire la sienne parmi huit, chacune avec son propre effet.
 */
export function weaponBreakerType({
                                      declared,
                                      itemHash,
                                      frame,
                                  }: {
    /** `breakerType` de la définition de l'arme — 0 ou absent le plus souvent */
    declared?: number;
    itemHash: number;
    /** Définition de l'attribut intrinsèque équipé */
    frame?: InventoryItemDefinition;
}): number | undefined {
    if (declared) return declared;

    for (const perk of frame?.perks ?? []) {
        const breaker = BREAKER_BY_PERK[perk.perkHash];
        if (breaker) return breaker;
    }

    return EXOTIC_OVERRIDES[itemHash];
}
