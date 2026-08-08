"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Character } from "@/lib/bungie/use-profile";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import type { MoveTarget } from "@/lib/destiny/moves";
import type { ActionStep, QueuedAction } from "@/lib/actions/store";
import { ItemThumb } from "../ItemThumb";
import { ActionStatusIcon } from "./ActionStatusIcon";
import { DestinationIcon } from "./DestinationIcon";

/** Libellé de la destination demandée — c'est le sous-titre de la carte. */
export function useTargetLabel(
  target: MoveTarget,
  names: ReadonlyMap<string, string>,
) {
  const t = useTranslations("actions.target");
  if (target.kind === "vault") return t("vault");
  const character = names.get(target.characterId) ?? "";
  return target.kind === "equipped"
    ? t("equip", { character })
    : t("inventory", { character });
}

/** Une étape du plan, telle qu'elle se lit dans le détail déplié. */
function StepRow({
  step,
  index,
  names,
}: {
  step: ActionStep;
  index: number;
  names: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("actions.step");
  const def = useSharedDefinition(step.itemHash);
  const item = def?.displayProperties?.name ?? "";
  const character = names.get(step.characterId) ?? "";

  // Le rôle prime sur le type de requête : un `equip` qui sert à déséquiper
  // n'a rien à voir, pour l'utilisateur, avec l'équipement final.
  const label =
    step.role === "unequip"
      ? t("unequip", { item })
      : step.role === "evict"
        ? t("evict", { item })
        : step.kind === "pull"
          ? t("pull", { character })
          : step.kind === "toVault"
            ? t("toVault")
            : step.kind === "fromVault"
              ? t("fromVault", { character })
              : t("equip", { character });

  return (
    <li className="action-card__step">
      <span className="action-card__step-label">
        {index + 1}. {label}
      </span>
      <ActionStatusIcon status={step.status} />
      {step.error && (
        <span className="action-card__step-error">{step.error}</span>
      )}
    </li>
  );
}

/**
 * Une action de la file : l'objet, sa destination, l'avancement en
 * « requêtes envoyées / total », et le détail des étapes au dépliage.
 */
export function ActionCard({
  action,
  characters,
  names,
}: {
  action: QueuedAction;
  characters: readonly Character[];
  names: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("actions");
  const [expanded, setExpanded] = useState(false);
  const def = useSharedDefinition(action.itemHash);
  const targetLabel = useTargetLabel(action.target, names);

  const done = action.steps.filter((s) => s.status === "done").length;
  const total = action.steps.length;

  return (
    <li className={`action-card action-card--${action.status}`}>
      <div className="action-card__header">
        <div className="action-card__titles">
          <span className="action-card__name">
            {def?.displayProperties?.name ?? "…"}
          </span>
          <span className="action-card__target">{targetLabel}</span>
        </div>
        <ActionStatusIcon status={action.status} />
      </div>

      <div className="action-card__flow">
        {/* .item-thumb se dimensionne sur son parent : il lui en faut un */}
        <span className="action-card__thumb">
          <ItemThumb
            itemHash={action.itemHash}
            itemInstanceId={action.itemInstanceId}
            state={action.state}
            versionNumber={action.versionNumber}
            gearTier={action.gearTier}
          />
        </span>
        <span className="action-card__arrow" aria-hidden>
          →
        </span>
        <DestinationIcon
          target={action.target}
          characters={characters}
          label={targetLabel}
        />

        <span className="action-card__progress">
          {done}/{total}
        </span>

        {total > 0 && (
          <button
            type="button"
            className="action-card__toggle"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? t("collapse") : t("expand")}
            title={expanded ? t("collapse") : t("expand")}
          >
            {/* Chevron orienté par CSS selon l'état */}
            <svg viewBox="0 0 16 16" aria-hidden focusable="false">
              <path
                d="M4 6l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Un refus détecté à la planification n'a produit aucune étape : c'est
          la seule chose à dire, et elle explique pourquoi rien n'a été envoyé. */}
      {action.failure && (
        <p className="action-card__failure">
          {t(`failure.${action.failure}`)}
        </p>
      )}
      {!action.failure && action.error && (
        <p className="action-card__failure">{action.error}</p>
      )}

      {expanded && total > 0 && (
        <ol className="action-card__steps">
          {action.steps.map((step, index) => (
            <StepRow key={step.id} step={step} index={index} names={names} />
          ))}
        </ol>
      )}
    </li>
  );
}
