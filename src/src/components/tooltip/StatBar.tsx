"use client";

import type {CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {useDefinition} from "@/lib/manifest/use-definition";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import TunedStatIcon from "@/components/icons/armor/TunedStatIcon";
import type {StatDefinition} from "@/lib/destiny/types";

/**
 * Une ligne de statistique : nom, icône, barre proportionnelle, puis valeur.
 *
 * La valeur est **après** la barre, comme dans le jeu : les nombres forment
 * ainsi une colonne alignée à droite, que la barre soit courte ou longue.
 *
 * `withBar={false}` pour les statistiques qui sont des valeurs et non des notes
 * (cadence de tir, taille du chargeur, direction du recul…) : une barre y serait
 * trompeuse, ces valeurs n'ayant pas de maximum commun.
 */
export function StatBar({
                            statHash,
                            value,
                            max,
                            withBar = true,
                            signed = false,
                            bonus: bonusValue = 0,
                            tuned,
                        }: {
    statHash: number;
    value: number;
    max: number;
    withBar?: boolean;
    /** Préfixe les valeurs positives d'un « + » : utile pour des écarts */
    signed?: boolean;
    /**
     * Part de `value` apportée par la pièce maîtresse et l'archétype. Elle est
     * détachée en fin de barre, dans la teinte d'accent : `value` la contient
     * déjà, l'API ne renvoyant que le total.
     */
    bonus?: number;
    /**
     * Repère de statistique ajustée (armures légendaires de palier 5).
     * `undefined` supprime la colonne : ailleurs, elle décalerait les noms pour
     * rien.
     */
    tuned?: boolean;
}) {
    const t = useTranslations("item");
    const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
    const name = def?.displayProperties?.name;
    // Les statistiques d'armure ont une icône, celles des armes non.
    const icon = def?.displayProperties?.icon;
    if (!name) return null;

    const pct = (part: number) =>
        max > 0 ? Math.max(0, Math.min(100, (part / max) * 100)) : 0;

    // Le bonus ne peut pas dépasser la valeur : un mod négatif ailleurs sur
    // l'objet pourrait sinon donner un segment plus large que la barre entière.
    const bonus = Math.max(0, Math.min(bonusValue, value));

    return (
        <div className={`stat-bar${withBar ? "" : " stat-bar--plain"}`}>


            <span className="stat-bar__name">
                {/* Colonne rendue même vide : le repère ne doit pas décaler les
                noms d'une ligne à l'autre. */}
                {tuned !== undefined && (
                    <span
                        className="stat-bar__tuned"
                        title={tuned ? t("tunedStat") : undefined}
                        aria-label={tuned ? t("tunedStat") : undefined}
                    >
                    {tuned && <TunedStatIcon/>}
                </span>
                )}
                {name}
            </span>

            {icon && (
                // Glyphe blanc sur fond transparent : posé en masque, il prend
                // la couleur du texte — comme l'icône d'archétype.
                <span
                    className="stat-bar__icon"
                    style={{"--stat-icon": `url(${BUNGIE_ROOT}${icon})`} as CSSProperties}
                    aria-hidden
                />
            )}

            {withBar && (
                <div className="stat-bar__track">
                    {/* Largeurs transmises au CSS par variables */}
                    <div
                        className="stat-bar__fill"
                        style={{"--stat-pct": `${pct(value - bonus)}%`} as CSSProperties}
                    />
                    {bonus > 0 && (
                        <div
                            className="stat-bar__fill stat-bar__fill--bonus"
                            style={{"--stat-pct": `${pct(bonus)}%`} as CSSProperties}
                        />
                    )}
                </div>
            )}

            <span className="stat-bar__value">
                {signed && value > 0 ? `+${value}` : value}
            </span>
        </div>
    );
}
