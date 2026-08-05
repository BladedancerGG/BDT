// Calcul des habillages d'une vignette d'objet : filigrane de saison, palier
// d'équipement, marquage « façonné » / « amélioré ».
//
// Les chemins d'images ne sont pas codés en dur : ils viennent de la table
// DestinyInventoryItemConstantsDefinition du manifeste (entrée unique, hash 1).

import type {InventoryItemDefinition} from "./types";
import {TIER} from "./display";

/** Masque de bits ItemState renvoyé par l'API pour chaque objet. */
export const ITEM_STATE = {
    Locked: 1,
    Tracked: 2,
    Masterwork: 4,
    Crafted: 8,
    HighlightedObjective: 16,
    Enhanced: 32,
} as const;

/** Hash de l'unique entrée de DestinyInventoryItemConstantsDefinition. */
export const ITEM_CONSTANTS_HASH = 1;

export interface ItemConstantsDefinition {
    /** Overlays de palier, index 0 → palier 1, … index 4 → palier 5 */
    gearTierOverlayImagePaths: string[];
    /** Dégradé posé sous le marquage façonné / amélioré pour le faire ressortir */
    craftedBackgroundPath: string;
    /** Marquage des objets façonnés (marteau) */
    craftedOverlayPath: string;
    /** Marquage des objets améliorés (losange) */
    enhancedItemOverlayPath: string;
    featuredItemFlagPath: string;
    /** Fonds posés DERRIÈRE l'image quand un ornement est appliqué */
    universalOrnamentBackgroundOverlayPath: string;
    universalOrnamentLegendaryBackgroundOverlayPath: string;
    universalOrnamentExoticBackgroundOverlayPath: string;
    /** Fonds des objets « holofoil », en remplacement de la couleur de rareté */
    holofoilBackgroundOverlayPath: string;
    holofoil900BackgroundOverlayPath: string;
    holofoil900AnimatedBackgroundOverlayPath: string;
}

/**
 * Fond à placer derrière l'image d'un objet portant un ornement.
 * Le jeu en utilise trois variantes selon la rareté.
 */
export function ornamentBackgroundPath(
    constants: ItemConstantsDefinition | undefined,
    tierType: number | undefined,
): string | undefined {
    if (!constants) return undefined;
    if (tierType === TIER.Exotic) {
        return constants.universalOrnamentExoticBackgroundOverlayPath;
    }
    if (tierType === TIER.Legendary) {
        return constants.universalOrnamentLegendaryBackgroundOverlayPath;
    }
    return constants.universalOrnamentBackgroundOverlayPath;
}

/**
 * Filigrane à afficher pour un objet.
 * Un objet réédité possède plusieurs filigranes : celui à utiliser dépend du
 * `versionNumber` de l'instance.
 */
export function watermarkPath(
    def: InventoryItemDefinition | undefined,
    versionNumber?: number,
): string | undefined {
    if (!def) return undefined;

    // Objet « mis en avant » : filigrane dédié
    if (def.isFeaturedItem && def.iconWatermarkFeatured) {
        return def.iconWatermarkFeatured;
    }

    const versioned =
        versionNumber != null
            ? def.quality?.displayVersionWatermarkIcons?.[versionNumber]
            : undefined;

    return versioned || def.iconWatermark || undefined;
}

/** Overlay du palier d'équipement (1–5), ou undefined si l'objet n'en a pas. */
export function gearTierPath(
    constants: ItemConstantsDefinition | undefined,
    gearTier?: number,
): string | undefined {
    if (!constants || !gearTier) return undefined;
    // gearTier est 1-indexé, le tableau 0-indexé
    return constants.gearTierOverlayImagePaths?.[gearTier - 1];
}

export function isCrafted(state: number | undefined): boolean {
    return Boolean(state && state & ITEM_STATE.Crafted);
}

export function isEnhanced(state: number | undefined): boolean {
    return Boolean(state && state & ITEM_STATE.Enhanced);
}

export function isMasterwork(state: number | undefined): boolean {
    return Boolean(state && state & ITEM_STATE.Masterwork);
}

/**
 * Calques à superposer à l'icône d'un objet, du fond vers le dessus.
 *
 * Tous les chemins proviennent du manifeste : les filigranes de la définition
 * de l'objet, les overlays de la table DestinyInventoryItemConstantsDefinition.
 * Aucune URL n'est codée en dur.
 */
export function itemOverlays({
                                 def,
                                 constants,
                                 state,
                                 versionNumber,
                                 gearTier,
                             }: {
    def?: InventoryItemDefinition;
    constants?: ItemConstantsDefinition;
    state?: number;
    versionNumber?: number;
    gearTier?: number;
}): string[] {
    const layers: (string | undefined)[] = [
        watermarkPath(def, versionNumber),
        gearTierPath(constants, gearTier),
    ];

    const crafted = isCrafted(state);
    const enhanced = isEnhanced(state);

    if (crafted || enhanced) {
        // Fond commun aux deux marquages, dessiné juste en dessous
        layers.push(constants?.craftedBackgroundPath);
        // Une arme façonnée PUIS améliorée porte le marquage « amélioré » :
        // l'amélioration prime donc sur le façonnage.
        layers.push(
            enhanced
                ? constants?.enhancedItemOverlayPath
                : constants?.craftedOverlayPath,
        );
    }

    return layers.filter((path): path is string => Boolean(path));
}
