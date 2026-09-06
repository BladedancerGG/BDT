"use client";

import {useTranslations} from "next-intl";
import {XMarkIcon} from "@heroicons/react/24/solid";

/**
 * Couleur d'une carte de groupe, choisie librement.
 *
 * Un `<input type="color">` : le sélecteur du système, avec sa pipette et son
 * historique, plutôt qu'une palette imposée. Il n'émet qu'une forme —
 * `#rrggbb` en minuscules — ce que `isGroupColor` vérifie de son côté.
 *
 * Le bouton voisin retire la couleur, ce que le champ ne sait pas faire : il a
 * toujours une valeur. Sans couleur, il en montre une par défaut sans qu'elle
 * soit enregistrée pour autant.
 *
 * Partagé par la création et l'éditeur : le même geste aux deux endroits, écrit
 * une seule fois.
 */
export function GroupColorPicker({
                                     value,
                                     onChange,
                                 }: {
    value: string | undefined;
    onChange: (color: string | undefined) => void;
}) {
    const t = useTranslations("groups");

    const none = value === undefined;

    return (
        <div className="group-colors">
            {/* Sans couleur, le champ en montrerait tout de même une, et rien
                ne distinguerait « aucune » d'un choix délibéré. Il reçoit donc
                une valeur neutre, une marque en diagonale, et le libellé le dit
                en toutes lettres à côté. */}
            <input
                type="color"
                className={`group-colors__input${
                    none ? " group-colors__input--none" : ""
                }`}
                value={value ?? NEUTRAL}
                aria-label={t("colorLabel")}
                onChange={(event) => onChange(event.target.value)}
            />

            {/*<span className="group-colors__value">*/}
            {/*    {none ? t("colorNone") : value}*/}
            {/*</span>*/}

            {!none && (
                <button
                    type="button"
                    className="btn btn--small group-colors__clear"
                    aria-label={t("colorNone")}
                    title={t("colorNone")}
                    onClick={() => onChange(undefined)}
                >
                    <XMarkIcon/>
                </button>
            )}
        </div>
    );
}

/**
 * Ce que montre le champ quand aucune couleur n'est choisie.
 *
 * Un gris neutre, et non l'accent du thème : celui-ci se lisait comme une
 * couleur retenue. La marque en diagonale du CSS achève de le dire.
 */
const NEUTRAL = "#808080";
