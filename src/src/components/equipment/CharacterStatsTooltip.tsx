"use client";

import {useTranslations} from "next-intl";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import {CHARACTER_STAT_ENHANCED, CHARACTER_STAT_MAX} from "@/lib/destiny/stat-order";
import {useCharacterStatBreakdown} from "@/lib/destiny/use-character-stat-breakdown";
import {StatBar} from "../tooltip/StatBar";

/**
 * Clé du texte d'effet amélioré de chaque statistique (`inventory.enhancedStat`).
 * Le manifeste ne le porte nulle part : la définition de statistique n'a que
 * l'effet de base, d'où des textes maintenus à la main. Une clé vide n'affiche
 * rien.
 */
const ENHANCED_KEYS: Readonly<Record<number, string>> = {
    392767087: "health",
    4244567218: "melee",
    1735777505: "grenade",
    144602215: "super",
    1943323491: "class",
    2996146975: "weapons",
};

/**
 * Infobulle du résumé de personnage : une barre par statistique, découpée
 * comme celles d'une armure — base en clair, attributs, mods et fragments en
 * bleu, pièces maîtresses en doré, manque jusqu'à la base en rouge. Un repère
 * marque le seuil de 100, où commencent les effets améliorés, que l'infobulle
 * de chaque barre décrit en doré.
 *
 * Composant à part pour que la décomposition, qui lit le manifeste pour chaque
 * pièce, ne tourne qu'une fois l'infobulle ouverte.
 */
export function CharacterStatsTooltip({
                                          stats,
                                          statHashes,
                                          items,
                                          details,
                                      }: {
    stats: Record<string, number>;
    statHashes: readonly number[];
    items: readonly DestinyItemComponent[];
    details: Record<string, ItemDetail>;
}) {
    const t = useTranslations("inventory");
    const breakdown = useCharacterStatBreakdown(stats, items, details, statHashes);

    return (
        <div className="plug-tooltip character-stats-tooltip">
            <div className="plug-tooltip__header">
                <span className="plug-tooltip__name">{t("characterStats")}</span>
            </div>
            <div className="plug-tooltip__body character-stats-tooltip__bars">
                {statHashes.map((statHash) => (
                    <StatBar
                        key={statHash}
                        statHash={statHash}
                        value={Math.max(0, stats[statHash] ?? 0)}
                        max={CHARACTER_STAT_MAX}
                        marker={CHARACTER_STAT_ENHANCED}
                        breakdown={breakdown[statHash]}
                        enhanced={
                            ENHANCED_KEYS[statHash]
                                ? t(`enhancedStat.${ENHANCED_KEYS[statHash]}`) || undefined
                                : undefined
                        }
                    />
                ))}
            </div>
        </div>
    );
}
