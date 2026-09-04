"use client";

import {useTranslations} from "next-intl";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import type {IdentifierChoice} from "@/lib/loadouts/use-loadout-identifiers";

/** Lequel des deux identifiants visuels est en cours de choix. */
export type IdentifierTarget = "color" | "icon";

/**
 * Grille des choix d'un identifiant, dans un panneau flottant.
 *
 * Elle emprunte l'habillage du sélecteur de sockets (`.socket-picker`) : c'est
 * le même geste — cliquer une vignette, choisir dans une grille — et la
 * maquette le demande explicitement. Le contenu, lui, n'est pas fait de plugs :
 * ce sont de simples images du manifeste, sans définition d'objet derrière.
 */
export function IdentifierPicker({
                                     choices,
                                     current,
                                     kind,
                                     onPick,
                                 }: {
    choices: IdentifierChoice[];
    current: number;
    kind: IdentifierTarget;
    onPick: (hash: number) => void;
}) {
    const t = useTranslations("loadouts");

    return (
        <div className="socket-picker loadout-identifiers">
            <div className="socket-picker__grid">
                {choices.map((choice) => (
                    <button
                        key={choice.hash}
                        type="button"
                        className={[
                            "loadout-identifiers__choice",
                            `loadout-identifiers__choice--${kind}`,
                            choice.hash === current
                                ? "loadout-identifiers__choice--current"
                                : null,
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        aria-pressed={choice.hash === current}
                        aria-label={t(kind === "color" ? "pickColor" : "pickIcon")}
                        onClick={() => onPick(choice.hash)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${BUNGIE_ROOT}${choice.value}`} alt=""/>
                    </button>
                ))}
            </div>
        </div>
    );
}

