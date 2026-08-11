"use client";

import type {CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {ammoIconPath, ammoLabelKey} from "@/lib/destiny/grouping";
import {BUNGIE_ROOT, damageColor} from "@/lib/destiny/display";
import {useDamageTypeDefinition} from "@/lib/destiny/use-damage-type";
import type {ItemProgress} from "@/lib/destiny/use-item-progress";

/**
 * Première section du corps de l'infobulle : puissance et élément, type de
 * munitions, niveau de l'arme façonnée, compte-frags.
 *
 * La couleur du niveau de puissance suit l'élément de l'arme, comme en jeu.
 */
export function WeaponSummary({
                                  damageType,
                                  power,
                                  ammoType,
                                  progress,
                              }: {
    /** Énumération DestinyDamageType : élément de l'arme */
    damageType?: number;
    power?: number;
    ammoType?: number;
    progress: ItemProgress;
}) {
    const t = useTranslations("item");
    // Les noms des types de munitions servent déjà aux en-têtes de groupes du
    // coffre : ils vivent donc dans l'espace `inventory`.
    const tInventory = useTranslations("inventory");
    const damageDef = useDamageTypeDefinition(damageType);

    // Le manifeste fournit deux icônes par élément : `displayProperties.icon` est
    // colorée (solaire orange, abyssal violet, filobscur vert…),
    // `transparentIconPath` est le même glyphe en blanc. On prend la colorée, qui
    // se lit d'un coup d'œil ; le blanc ne sert que de repli.
    const damageIcon =
        damageDef?.displayProperties?.icon ?? damageDef?.transparentIconPath;

    const ammoIcon = ammoIconPath(ammoType);
    const ammoKey = ammoLabelKey(ammoType);

    const {weaponLevel, weaponLevelProgress, tracker} = progress;

    const nothingToShow =
        power == null && !ammoIcon && weaponLevel == null && !tracker;
    if (nothingToShow) return null;

    return (
        <div className="weapon-summary">
            {(power != null || ammoIcon) && (
                <div className="weapon-summary__top">
                    {power != null && (
                        <div className="weapon-summary__power">
                            {damageIcon && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`${BUNGIE_ROOT}${damageIcon}`}
                                    alt={damageDef?.displayProperties?.name ?? ""}
                                    className="weapon-summary__element"
                                />
                            )}
                            <span
                                className="weapon-summary__power-value"
                                style={
                                    {"--damage-color": damageColor(damageType)} as CSSProperties
                                }
                            >
                                {power}
                            </span>
                        </div>
                    )}

                    {ammoIcon && ammoKey && (
                        <div className="weapon-summary__ammo">
                            {/* Glyphe local monochrome (le manifeste n'en a aucun) : posé
                                en masque, il prend la couleur du texte et reste donc
                                lisible dans les deux thèmes — même mécanisme que les
                                en-têtes de groupes du coffre. */}
                            <span
                                className="weapon-summary__ammo-icon"
                                style={{"--ammo-icon": `url(${ammoIcon})`} as CSSProperties}
                                aria-hidden
                            />
                            <span className="weapon-summary__ammo-name">
                                {tInventory(ammoKey)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {weaponLevel != null && (
                <div className="weapon-summary__row weapon-summary__row--level">
                    {/* La barre de progression est le fond de la ligne : elle
                        avance sous le libellé, comme en jeu. */}
                    <span
                        className="weapon-summary__level-fill"
                        style={
                            {
                                "--level-pct": `${(weaponLevelProgress ?? 0) * 100}%`,
                            } as CSSProperties
                        }
                        aria-hidden
                    />
                    <span className="weapon-summary__label">
                        {t("weaponLevel", {level: weaponLevel})}
                    </span>
                    {weaponLevelProgress != null && (
                        <span className="weapon-summary__value">
                            {Math.floor(weaponLevelProgress * 100)}&nbsp;%
                        </span>
                    )}
                </div>
            )}

            {tracker && (
                <div className="weapon-summary__row">
                    {tracker.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={`${BUNGIE_ROOT}${tracker.icon}`}
                            alt=""
                            className="weapon-summary__tracker-icon"
                        />
                    )}
                    <span className="weapon-summary__label">{tracker.label}</span>
                    <span className="weapon-summary__value weapon-summary__value--tracker">
                        {tracker.value.toLocaleString()}
                    </span>
                </div>
            )}
        </div>
    );
}
