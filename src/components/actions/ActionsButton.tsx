"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { countActions, useActionQueue } from "@/lib/actions/store";

/**
 * Bouton d'en-tête : avancement de la file, et ouverture du panneau.
 *
 * Deux compteurs, chacun suivi entre parenthèses du nombre de requêtes Bungie
 * correspondant — une action en coûte de une à quatre, et c'est ce nombre-là
 * qui explique le temps d'attente. Celui des actions en attente s'efface quand
 * la file est vide : seul un chiffre non nul dit quelque chose.
 */
export function ActionsButton() {
  const t = useTranslations("actions");
  const actions = useActionQueue((s) => s.actions);
  const open = useActionQueue((s) => s.panelOpen);
  const setOpen = useActionQueue((s) => s.setPanelOpen);

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
    <button
      type="button"
      className="btn btn--small actions-button"
      onPointerDown={() => {
        openAtPress.current = open;
      }}
      onClick={() => setOpen(!openAtPress.current)}
      aria-expanded={open}
      title={t("openHint")}
    >
      <span aria-hidden>⇄</span>
      {t("title")}

      <span className="actions-button__counts">
        {(counts.pending > 0 || (counts.done === 0 && counts.failed === 0)) && (
          <>
            <span className="actions-button__pending">
              {counts.pending} {/*({counts.pendingSteps})*/}
            </span>
            {counts.done > 0 && " / "}
          </>
        )}
        {counts.done > 0 && (
            <span className="actions-button__done">
          {counts.done} {/*({counts.doneSteps})*/}
        </span>
        )}
        {counts.failed > 0 && (
          <>
            &nbsp;/&nbsp;&nbsp;
            <span className="actions-button__failed" title={t("failedHint")}>
              ⚠ {counts.failed}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
