"use client";

import type {CSSProperties} from "react";
import {useDefinition} from "@/lib/manifest/use-definition";
import type {StatDefinition} from "@/lib/destiny/types";

/**
 * Une ligne de statistique : nom + valeur, et une barre proportionnelle.
 *
 * `withBar={false}` pour les statistiques qui sont des valeurs et non des notes
 * (cadence de tir, taille du chargeur, direction du recul…) : une barre y serait
 * trompeuse, ces valeurs n'ayant pas de maximum commun.
 */
export function StatBar({
                            statHash,
                            value,
                            max,
                            color,
                            withBar = true,
                            signed = false,
                        }: {
    statHash: number;
    value: number;
    max: number;
    color?: string;
    withBar?: boolean;
    /** Préfixe les valeurs positives d'un « + » : utile pour des écarts */
    signed?: boolean;
}) {
    const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
    const name = def?.displayProperties?.name;
    if (!name) return null;

    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

    return (
        <div className={`stat-bar${withBar ? "" : " stat-bar--plain"}`}>
            <span className="stat-bar__name">{name}</span>
            <span className="stat-bar__value">
        {signed && value > 0 ? `+${value}` : value}
            </span>
            {withBar && (
                <div className="stat-bar__track">
                    {/* Largeur et couleur transmises au CSS par variables */}
                    <div
                        className="stat-bar__fill"
                        style={
                            {
                                "--stat-pct": `${pct}%`,
                                ...(color ? {"--stat-color": color} : {}),
                            } as CSSProperties
                        }
                    />
                </div>
            )}
        </div>
    );
}
