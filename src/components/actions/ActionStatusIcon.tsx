"use client";

import { useTranslations } from "next-intl";
import type { ActionStatus } from "@/lib/actions/store";

/**
 * Pastille d'état : libellé + marque.
 *
 * « En cours » emprunte l'animation de chargement du jeu
 * (`public/icons/loading.svg`) ; « Terminé » une coche. Les deux autres états
 * n'ont qu'un cercle vide, comme dans la maquette.
 */
export function ActionStatusIcon({
  status,
  labelled = true,
}: {
  status: ActionStatus;
  /** false pour ne montrer que la marque (lignes d'étapes compactes) */
  labelled?: boolean;
}) {
  const t = useTranslations("actions.status");
  const label = t(status);

  return (
    <span
      className={`action-status action-status--${status}`}
      title={labelled ? undefined : label}
    >
      {labelled && <span className="action-status__label">{label}</span>}

      {status === "running" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/loading.svg" alt="" className="action-status__spinner" />
      ) : status === "done" ? (
        <svg viewBox="0 0 16 16" className="action-status__mark" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.5 8.2l2.4 2.4 4.6-5"
            fill="none"
            stroke="var(--color-panel)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === "error" ? (
        <svg viewBox="0 0 16 16" className="action-status__mark" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.5 5.5l5 5M10.5 5.5l-5 5"
            fill="none"
            stroke="var(--color-panel)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="action-status__mark" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {!labelled && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
