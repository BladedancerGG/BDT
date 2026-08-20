"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Character } from "@/lib/bungie/use-profile";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { useDefinition } from "@/lib/manifest/use-definition";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import { BUNGIE_ROOT } from "@/lib/destiny/display";
import type { MoveTarget } from "@/lib/destiny/moves";
import type { ActionStep, QueuedAction } from "@/lib/actions/store";
import { ItemThumb } from "../ItemThumb";
import { ActionStatusIcon } from "./ActionStatusIcon";
import { DestinationIcon } from "./DestinationIcon";
import {isEnhancedPlug} from "@/lib/destiny/sockets";
import { EnhancedPerkIcon } from "../icons";

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

/**
 * Icône de l'attribut à équiper — la « destination » d'une insertion.
 *
 * Lue à l'unité et non dans les définitions mutualisées : celles-ci portent les
 * objets du compte, pas les milliers de plugs de leurs sockets. Le panneau en
 * affiche une poignée, la requête est sans conséquence.
 */
function PlugDestination({ hash }: { hash: number }) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    hash,
  );
  const icon = def?.displayProperties?.icon;
  const name = def?.displayProperties?.name ?? "";

  const enhanced = isEnhancedPlug(def);

  return (
    <span className="destination-icon destination-icon--plug" title={name}>
      {icon && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element*/}
          <img src={`${BUNGIE_ROOT}${icon}`} alt={name}/>
          {enhanced && <EnhancedPerkIcon className="plug-icon__img-enhanced"/>}
        </>
      )}
    </span>
  );
}

/** Nom de l'attribut visé. `0` n'est le hash d'aucun plug : rien n'est lu. */
function usePlugName(hash: number | undefined): string {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    hash ?? 0,
  );
  return def?.displayProperties?.name ?? "…";
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
  const perk = usePlugName(
    step.kind === "insert" ? step.plugItemHash : undefined,
  );

  // Le rôle prime sur le type de requête : un `equip` qui sert à déséquiper
  // n'a rien à voir, pour l'utilisateur, avec l'équipement final.
  const label =
    step.kind === "insert"
      ? t("insert", { perk })
      : step.role === "unequip"
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
 *
 * Une insertion d'attribut se lit sur le même gabarit qu'un déplacement — même
 * vignette, même flèche, même avancement. Seule la « destination » change de
 * nature : ce n'est plus un lieu mais l'attribut qui va prendre la place, dont
 * on montre l'icône.
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

  const plugHash =
    action.kind === "insert" ? action.steps[0]?.plugItemHash : undefined;
  const perk = usePlugName(plugHash);
  // Les hooks ne se conditionnent pas : les deux libellés sont calculés, un
  // seul est retenu. Le déplacement fictif ne coûte qu'une lecture de messages.
  const moveLabel = useTargetLabel(
    action.kind === "move" ? action.target : { kind: "vault" },
    names,
  );
  const targetLabel =
    action.kind === "insert" ? t("target.perk", { perk }) : moveLabel;

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
        {action.kind === "insert" ? (
          <PlugDestination hash={plugHash ?? 0} />
        ) : (
          <DestinationIcon
            target={action.target}
            characters={characters}
            label={targetLabel}
          />
        )}

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
