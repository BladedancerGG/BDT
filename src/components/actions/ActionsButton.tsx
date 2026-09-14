"use client";

import {useRef} from "react";
import {useTranslations} from "next-intl";
import {countActions, useActionQueue} from "@/lib/actions/store";
import {QueueListIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid"
import {Hint} from "@/components/ui/Hint";

/**
 * Bouton d'en-tête : avancement de la file, et ouverture du panneau.
 *
 * Deux compteurs, chacun suivi entre parenthèses du nombre de requêtes Bungie
 * correspondant — une action en coûte de une à quatre, et c'est ce nombre-là
 * qui explique le temps d'attente. Celui des actions en attente s'efface quand
 * la file est vide : seul un chiffre non nul dit quelque chose.
 *
 * Maj + clic vide la file de ce qui est terminé ou en échec, sans l'ouvrir :
 * l'infobulle l'annonce, faute de quoi le geste resterait introuvable.
 */
export function ActionsButton() {
    const t = useTranslations("actions");
    const actions = useActionQueue((s) => s.actions);
    const open = useActionQueue((s) => s.panelOpen);
    const setOpen = useActionQueue((s) => s.setPanelOpen);
    const clearFinished = useActionQueue((s) => s.clearFinished);

    const counts = countActions(actions);

    /**
     * État du panneau tel qu'il était au tout début du clic.
     *
     * Le panneau se ferme désormais au clic au-dehors, et le bouton en fait
     * partie : la fermeture est déjà survenue (sur `mousedown`) quand le `click`
     * arrive, si bien qu'un simple `setOpen(!open)` le rouvrirait aussitôt. On
     * décide donc à partir de l'état saisi au `pointerdown`, qui précède tout.
     */
    const openAtPress = useRef(false);

    return (
        <Hint
            actions={[
                {label: t("openHint"), keys: ["mouseLeft"]},
                {label: t("clear"), keys: ["shift_left", "mouseLeft"]},
            ]}
        >
            <button
                type="button"
                className="btn btn--small actions-button"
                onPointerDown={() => {
                    openAtPress.current = open;
                }}
                onClick={(event) => {
                    // Maj + clic : purger la file de ce qu'elle a fini de traiter,
                    // sans toucher au panneau — l'ouvrir pour cliquer sur sa
                    // corbeille est le geste qu'on évite ici.
                    if (event.shiftKey) {
                        clearFinished();
                        return;
                    }
                    setOpen(!openAtPress.current);
                }}
                aria-expanded={open}
                aria-label={t("openHint")}
            >
                <span className="actions-button__counts">
                    {(counts.pending > 0 || (counts.done === 0 && counts.failed === 0)) && (
                        <span className="actions-button__pending">
                            <QueueListIcon/>
                            <span>{counts.pending}</span>
                        </span>
                    )}
                    {counts.done > 0 && (
                        <span className="actions-button__done">
                            <CheckCircleIcon/>
                            <span>{counts.done}</span>
                        </span>
                    )}
                    {counts.failed > 0 && (
                        <span className="actions-button__failed" title={t("failedHint")}>
                            <ExclamationTriangleIcon/>
                            <span>{counts.failed}</span>
                        </span>
                    )}
                </span>
            </button>
        </Hint>
    );
}
