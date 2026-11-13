"use client";

import {useState} from "react";
import {Toggle} from "@/components/ui/SettingRow";
import {
    ICON_SIZE,
    PLUG_SIZE,
    clampIconSize,
    clampPlugSize,
} from "@/lib/settings/store";

/** Bornes d'un curseur, avec le rabot qui va avec. */
export interface SizeBounds {
    min: number;
    max: number;
    clamp: (size: number) => number;
}

const ICON_BOUNDS: SizeBounds = {
    min: ICON_SIZE.min,
    max: ICON_SIZE.max,
    clamp: clampIconSize,
};

/** Bornes des icônes de plugs, à passer en prop pour ce réglage-là. */
export const PLUG_BOUNDS: SizeBounds = {
    min: PLUG_SIZE.min,
    max: PLUG_SIZE.max,
    clamp: clampPlugSize,
};

/**
 * Une taille en pixels : curseur + saisie clavier, bornés par `bounds`.
 *
 * Les bornes sont une prop et non une constante du module : les plugs ont les
 * leurs, bien plus basses que celles des vignettes d'objets.
 *
 * La saisie garde son propre état le temps de la frappe : borner à chaque
 * caractère empêcherait d'effacer le champ pour taper une nouvelle valeur
 * (« 8 » deviendrait aussitôt 40). La valeur n'est appliquée qu'à la validation
 * (Entrée ou perte de focus).
 */
export function IconSizeControl({
                                    id,
                                    value,
                                    onChange,
                                    unitLabel,
                                    bounds = ICON_BOUNDS,
                                    auto,
                                }: {
    /** Identifiant du champ, pour le lier au libellé de sa ligne */
    id: string;
    value: number;
    onChange: (size: number) => void;
    unitLabel: string;
    bounds?: SizeBounds;
    /**
     * Réglage automatique de la même taille, pour les vues qui savent la
     * calculer. Allumé, le curseur et la saisie sont grisés : la valeur qu'ils
     * portent n'a plus cours que là où l'automatique ne s'applique pas (petit
     * écran), et la garder visible dit ce qu'on y retrouvera.
     */
    auto?: {
        checked: boolean;
        onChange: (checked: boolean) => void;
        label: string;
    };
}) {
    const manualDisabled = auto?.checked ?? false;
    const [draft, setDraft] = useState(String(value));
    const [synced, setSynced] = useState(value);

    // Suit les changements venus d'ailleurs (curseur, réinitialisation…).
    // Ajusté pendant le rendu plutôt que dans un effet, pour éviter un rendu en
    // cascade avec l'ancienne valeur affichée.
    if (synced !== value) {
        setSynced(value);
        setDraft(String(value));
    }

    const commit = () => {
        const parsed = Number(draft);
        const next = Number.isFinite(parsed) ? bounds.clamp(parsed) : value;
        onChange(next);
        setDraft(String(next));
    };

    return (
        <div className="icon-size">
            <div className="icon-size__controls">
                <input
                    type="range"
                    className="icon-size__slider"
                    min={bounds.min}
                    max={bounds.max}
                    step={1}
                    value={value}
                    disabled={manualDisabled}
                    onChange={(e) => onChange(Number(e.target.value))}
                    aria-label={unitLabel}
                />
                <div className="icon-size__field">
                    <input
                        id={id}
                        type="number"
                        className="icon-size__input"
                        min={bounds.min}
                        max={bounds.max}
                        value={draft}
                        disabled={manualDisabled}
                        // Ne borne rien pendant la frappe : le premier chiffre
                        // d'une valeur à deux chiffres est toujours hors bornes
                        // (« 4 » pour 48), et le remonter au minimum sur-le-champ
                        // rendait le champ inutilisable — la valeur ne partait au
                        // store qu'à la validation.
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                        }}
                    />
                    <span className="icon-size__unit">px</span>
                </div>
            </div>
            {auto && (
                <div className="icon-size__auto">
                    <Toggle
                        id={`${id}-auto`}
                        checked={auto.checked}
                        onChange={auto.onChange}
                        label={auto.label}
                    />
                    <span aria-hidden>{auto.label}</span>
                </div>
            )}
        </div>
    );
}
