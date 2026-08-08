"use client";

import {useState} from "react";
import {ICON_SIZE, clampIconSize} from "@/lib/settings/store";

/**
 * Taille des icônes : curseur + saisie clavier, bornés à [40, 96] px.
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
                                }: {
    /** Identifiant du champ, pour le lier au libellé de sa ligne */
    id: string;
    value: number;
    onChange: (size: number) => void;
    unitLabel: string;
}) {
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
        const next = Number.isFinite(parsed) ? clampIconSize(parsed) : value;
        onChange(next);
        setDraft(String(next));
    };

    return (
        <div className="icon-size">
            <input
                type="range"
                className="icon-size__slider"
                min={ICON_SIZE.min}
                max={ICON_SIZE.max}
                step={1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={unitLabel}
            />
            <div className="icon-size__field">
                <input
                    id={id}
                    type="number"
                    className="icon-size__input"
                    min={ICON_SIZE.min}
                    max={ICON_SIZE.max}
                    value={draft}
                    onChange={(e) => onChange(Number(e.target.value))}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                    }}
                />
                <span className="icon-size__unit">px</span>
            </div>
        </div>
    );
}
