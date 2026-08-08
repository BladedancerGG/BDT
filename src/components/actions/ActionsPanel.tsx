"use client";

import { useTranslations } from "next-intl";
import { useProfile } from "@/lib/bungie/use-profile";
import { useCharacterNames } from "@/lib/destiny/use-character-names";
import {
  useActionQueue,
  type ActionFilter,
  type QueuedAction,
} from "@/lib/actions/store";
import { ActionCard } from "./ActionCard";

const FILTERS: readonly ActionFilter[] = ["all", "pending", "running", "done"];

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

  if (!open) return null;

  // La dernière demande en haut : c'est celle qu'on vient de faire
  const visible = actions.filter((a) => matches(a, filter)).reverse();

  return (
    <aside className="actions-panel" aria-label={t("title")}>
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

      <footer className="actions-panel__footer">
        <button
          type="button"
          className="btn btn--small"
          onClick={clearFinished}
          disabled={
            !actions.some((a) => a.status === "done" || a.status === "error")
          }
        >
          {t("clear")}
        </button>
      </footer>
    </aside>
  );
}
