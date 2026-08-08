"use client";

import { useTranslations } from "next-intl";
import { countActions, useActionQueue } from "@/lib/actions/store";

/**
 * Bouton d'en-tête : avancement de la file, et ouverture du panneau.
 *
 * Deux compteurs, chacun suivi entre parenthèses du nombre de requêtes Bungie
 * correspondant — une action en coûte de une à quatre, et c'est ce nombre-là
 * qui explique le temps d'attente.
 */
export function ActionsButton() {
  const t = useTranslations("actions");
  const actions = useActionQueue((s) => s.actions);
  const open = useActionQueue((s) => s.panelOpen);
  const setOpen = useActionQueue((s) => s.setPanelOpen);

  const counts = countActions(actions);

  return (
    <button
      type="button"
      className="btn btn--small actions-button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      title={t("openHint")}
    >
      <span aria-hidden>⇄</span>
      {t("title")}

      <span className="actions-button__counts">
        <span className="actions-button__pending">
          {counts.pending} ({counts.pendingSteps})
        </span>
        {" / "}
        <span className="actions-button__done">
          {counts.done} ({counts.doneSteps})
        </span>
        {counts.failed > 0 && (
          <span className="actions-button__failed" title={t("failedHint")}>
            {" "}
            ⚠ {counts.failed}
          </span>
        )}
      </span>
    </button>
  );
}
