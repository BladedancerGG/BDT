"use client";

import { useTranslations } from "next-intl";
import type { ActionStatus } from "@/lib/actions/store";
import {QueueListIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid"
import { LoadingIcon } from "@/components/icons";

/**
 * Pastille d'état : libellé + marque.
 *
 * « En cours » emprunte l'animation de chargement du jeu (`LoadingIcon`) ;
 * « Terminé » une coche. Les deux autres états n'ont qu'un cercle vide, comme
 * dans la maquette.
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
    <span className={`action-status action-status--${status}`}>
      {labelled && <span className="action-status__label">{label}</span>}

      {status === "running" ? (
        <LoadingIcon className="action-status__spinner" />
      ) : status === "done" ? (
        <CheckCircleIcon className="action-status__check-circle" aria-hidden />
      ) : status === "error" ? (
        <ExclamationTriangleIcon className="action-status__error" aria-hidden />
      ) : (
        <QueueListIcon className="action-status__mark" aria-hidden />
      )}

      {!labelled && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
