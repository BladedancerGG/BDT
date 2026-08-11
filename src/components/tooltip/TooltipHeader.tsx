"use client";

import {useSharedItemConstants} from "@/lib/destiny/item-defs";
import {
    gearTierPath,
    isMasterwork,
    watermarkPath,
} from "@/lib/destiny/overlays";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/** Palier d'équipement à partir duquel l'en-tête reçoit sa trame de fond. */
const PATTERN_MIN_GEAR_TIER = 4;

/**
 * En-tête d'infobulle : nom de l'objet, son type à gauche et sa rareté à droite.
 *
 * Le filigrane de saison et le palier d'équipement remplacent la vignette :
 * l'icône de l'objet est déjà sous les yeux (l'infobulle est ancrée à elle), ces
 * deux marquages sont en revanche illisibles à la taille d'une case de grille.
 *
 * Ils sont posés SANS effet miroir, contrairement à ce que fait la vignette du
 * marquage façonné : plusieurs filigranes de saison sont asymétriques, les
 * retourner les rendrait méconnaissables.
 */
export function TooltipHeader({
                                 def,
                                 state,
                                 versionNumber,
                                 gearTier,
                             }: {
    def: InventoryItemDefinition;
    state?: number;
    versionNumber?: number;
    gearTier?: number;
}) {
    const constants = useSharedItemConstants();

    const watermark = watermarkPath(def, versionNumber);
    const tierOverlay = gearTierPath(constants, gearTier);
    const rarity = def.inventory?.tierTypeName;

    // La trame n'habille que le haut du panier : elle signale un objet de valeur,
    // pas un objet quelconque.
    const patterned = (gearTier ?? 0) >= PATTERN_MIN_GEAR_TIER;

    return (
        <div
            className={[
                "tooltip-header",
                isMasterwork(state) ? "tooltip-header--masterwork" : null,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {/* Trame diagonale : le manifeste n'en fournit aucune (vérifié dans
                DestinyInventoryItemConstantsDefinition et DestinyGlobalConstants-
                Definition), elle est donc refaite en CSS. */}
            {patterned && <span className="tooltip-header__pattern" aria-hidden/>}

            <div className="tooltip-header__identity">
                <h3 className="tooltip-header__name">{def.displayProperties.name}</h3>
                <p className="tooltip-header__meta">
                    <span className="tooltip-header__type">
                        {def.itemTypeDisplayName}
                    </span>
                    {rarity && (
                        <span className="tooltip-header__rarity">{rarity}</span>
                    )}
                </p>
            </div>

            {(watermark || tierOverlay) && (
                <div className="tooltip-header__marks" aria-hidden>
                    {watermark && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={`${BUNGIE_ROOT}${watermark}`}
                            alt=""
                            className="tooltip-header__mark"
                        />
                    )}
                    {tierOverlay && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={`${BUNGIE_ROOT}${tierOverlay}`}
                            alt=""
                            className="tooltip-header__mark"
                        />
                    )}
                </div>
            )}
        </div>
    );
}
