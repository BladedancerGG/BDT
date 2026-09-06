"use client";

import {useState} from "react";
import {GROUP_NAME_MAX} from "@/lib/loadouts/groups/types";

/**
 * Le nom d'un groupe, modifiable sur place.
 *
 * La saisie est **locale** et n'est confiée au store qu'en la quittant — ou sur
 * Entrée. Écrire à chaque frappe aurait touché deux fois : le store nettoie le
 * nom (`cleanName` retombe sur l'ancien quand il est vide), si bien qu'effacer
 * pour ressaisir aurait fait ressurgir l'ancien nom sous le curseur ; et chaque
 * caractère aurait compté pour une modification, que le filet de secours et la
 * synchronisation prennent au sérieux.
 *
 * Échap rend la saisie au nom courant, comme partout ailleurs.
 *
 * Monté avec une clé sur l'identifiant du groupe par l'éditeur : l'état initial
 * ne suit pas sa source, et changer de groupe doit repartir de son nom à lui.
 */
export function GroupNameField({
                                   name,
                                   label,
                                   onRename,
                               }: {
    name: string;
    label: string;
    onRename: (name: string) => void;
}) {
    const [draft, setDraft] = useState(name);

    /** Le store refuse le vide : l'affichage doit suivre ce qu'il a retenu. */
    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed.length === 0) {
            setDraft(name);
            return;
        }
        if (trimmed !== name) onRename(trimmed);
        setDraft(trimmed);
    };

    return (
        <input
            className="group-name__input group-editor__name-input"
            value={draft}
            maxLength={GROUP_NAME_MAX}
            aria-label={label}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    // Il n'y a pas de formulaire autour : Entrée n'a rien à
                    // envoyer, seulement à valider et à rendre le focus.
                    event.preventDefault();
                    event.currentTarget.blur();
                } else if (event.key === "Escape") {
                    setDraft(name);
                }
            }}
        />
    );
}
