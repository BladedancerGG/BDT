"use client";

import { useTranslations } from "next-intl";
import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  useTransitionStatus,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import { useProfile } from "@/lib/bungie/use-profile";
import { useCharacterNames } from "@/lib/destiny/use-character-names";
import {
  useActionQueue,
  type ActionFilter,
  type QueuedAction,
} from "@/lib/actions/store";
import { ActionCard } from "./ActionCard";

const FILTERS: readonly ActionFilter[] = ["all", "pending", "running", "done"];

/**
 * Durée du glissement d'entrée et de sortie, en millisecondes.
 *
 * Doit rester égale à `$duration` dans `scss/components/actions-panel.scss` :
 * c'est elle qui décide du moment du démontage, et une valeur trop courte
 * couperait l'animation de sortie.
 */
const TRANSITION_MS = 250;

/** Le filtre parle des trois états visibles ; l'échec se range avec « effectuées ». */
function matches(action: QueuedAction, filter: ActionFilter): boolean {
  switch (filter) {
    case "pending":
      return action.status === "pending";
    case "running":
      return action.status === "running";
    case "done":
      return action.status === "done" || action.status === "error";
    default:
      return true;
  }
}

/**
 * Panneau latéral des actions.
 *
 * Il vit dans l'arbre de l'inventaire, et non dans l'en-tête avec son bouton :
 * il a besoin des définitions déjà chargées par `ItemDefsProvider` pour nommer
 * les objets et afficher leurs vignettes. Son ouverture transite donc par le
 * store, pas par un état local.
 *
 * Même montage que la modale : Floating UI fournit la fermeture par Échap ou
 * clic au-dehors, et `useTransitionStatus` garde le panneau monté le temps de
 * l'animation de sortie — sans lui, la fermeture le démonterait dans l'instant.
 * Le statut est exposé au CSS via `data-status`.
 */
export function ActionsPanel() {
  const t = useTranslations("actions");
  const { data } = useProfile();
  const characters = data?.characters ?? [];
  const names = useCharacterNames(characters);

  const open = useActionQueue((s) => s.panelOpen);
  const setOpen = useActionQueue((s) => s.setPanelOpen);
  const actions = useActionQueue((s) => s.actions);
  const filter = useActionQueue((s) => s.filter);
  const setFilter = useActionQueue((s) => s.setFilter);
  const clearFinished = useActionQueue((s) => s.clearFinished);

  const { refs, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) setOpen(false);
    },
  });

  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const { isMounted, status } = useTransitionStatus(context, {
    duration: TRANSITION_MS,
  });

  if (!isMounted) return null;

  // La dernière demande en haut : c'est celle qu'on vient de faire
  const visible = actions.filter((a) => matches(a, filter)).reverse();

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="actions-panel-overlay"
        data-status={status}
        lockScroll
      >
        <FloatingFocusManager context={context} modal>
          <aside
            // setFloating est un callback ref stable de Floating UI
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            {...getFloatingProps()}
            aria-label={t("title")}
            data-status={status}
            className="actions-panel"
          >
            <header className="actions-panel__header">
              <h2 className="actions-panel__title">{t("title")}</h2>

              <select
                className="actions-panel__filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as ActionFilter)}
                aria-label={t("filterLabel")}
              >
                {FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {t(`filter.${value}`)}
                  </option>
                ))}
              </select>

              {/* Effacer l'historique tient dans l'en-tête : la liste défile, et
                  le bouton devait rester atteignable sans dérouler jusqu'au bas */}
              <button
                type="button"
                className="actions-panel__clear"
                onClick={clearFinished}
                disabled={
                  !actions.some(
                    (a) => a.status === "done" || a.status === "error",
                  )
                }
                aria-label={t("clear")}
                title={t("clear")}
              >
                <svg viewBox="0 0 16 16" aria-hidden focusable="false">
                  <path
                    d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.6 9h5.8l.6-9M6.8 6.5v4M9.2 6.5v4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <button
                type="button"
                className="actions-panel__close"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                title={t("close")}
              >
                ×
              </button>
            </header>

            {visible.length === 0 ? (
              <p className="actions-panel__empty">{t("empty")}</p>
            ) : (
              <ol className="actions-panel__list">
                {visible.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    characters={characters}
                    names={names}
                  />
                ))}
              </ol>
            )}
          </aside>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
