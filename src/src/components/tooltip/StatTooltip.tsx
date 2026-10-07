"use client";

import {useTranslations} from "next-intl";
import type {StatBreakdown} from "@/lib/destiny/stat-breakdown";

/** Valeur signée : « +12 », « −4 », « 0 ». */
function signed(value: number): string {
    if (value > 0) return `+${value}`;
    // Vrai signe moins : le trait d'union est trop court face au « + ».
    if (value < 0) return `−${-value}`;
    return "0";
}

/**
 * Infobulle d'une statistique : nom, description, puis le détail de son total.
 *
 * Reprend l'habillage de l'infobulle d'attribut (`plug-tooltip`) : elles
 * s'ouvrent au même geste, dans la même infobulle d'objet.
 *
 * La ligne des attributs et mods est **nette** — gains moins pertes : c'est ce
 * qui s'ajoute à la base, la barre montrant déjà les deux séparément.
 */
export function StatTooltip({
                                name,
                                description,
                                breakdown,
                            }: {
    name: string;
    description?: string;
    breakdown?: StatBreakdown;
}) {
    const t = useTranslations("item.statBreakdown");
    const tCriteria = useTranslations("criteria");

    const perks = breakdown ? breakdown.bonus - breakdown.malus : 0;
    // Sur une courbe décroissante, −50 ms est un gain : le bleu et le rouge
    // suivent l'effet, pas le signe.
    const gain = breakdown?.lowerIsBetter ? -perks : perks;

    return (
        <div className="plug-tooltip stat-tooltip">
            <div className="plug-tooltip__header">
                <span className="plug-tooltip__name">{name}</span>
            </div>

            {(description || breakdown) && (
                <div className="plug-tooltip__body">
                    {description && (
                        <p className="plug-tooltip__description">{description}</p>
                    )}
                    {breakdown && (
                        <dl className="stat-tooltip__breakdown">
                            <dt>{t("base")}</dt>
                            <dd>{breakdown.base}</dd>

                            <dt>{t("perks")}</dt>
                            <dd
                                className={
                                    gain > 0
                                        ? "stat-tooltip__value--bonus"
                                        : gain < 0
                                            ? "stat-tooltip__value--malus"
                                            : undefined
                                }
                            >
                                {signed(perks)}
                            </dd>

                            <dt>{tCriteria("masterwork")}</dt>
                            <dd
                                className={
                                    // Négatif sur une courbe décroissante :
                                    // la vitesse de charge baisse en ms.
                                    breakdown.masterwork !== 0
                                        ? "stat-tooltip__value--masterwork"
                                        : undefined
                                }
                            >
                                {signed(breakdown.masterwork)}
                            </dd>

                            <dt className="stat-tooltip__total">{t("total")}</dt>
                            <dd className="stat-tooltip__total">{breakdown.total}</dd>
                        </dl>
                    )}
                </div>
            )}
        </div>
    );
}
