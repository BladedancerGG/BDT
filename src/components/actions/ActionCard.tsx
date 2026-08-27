"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Character } from "@/lib/bungie/use-profile";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { useDefinition } from "@/lib/manifest/use-definition";
import type {
  InventoryItemDefinition,
  LoadoutColorDefinition,
  LoadoutIconDefinition,
  LoadoutNameDefinition,
} from "@/lib/destiny/types";
import { isRealHash } from "@/lib/loadouts/loadout";
import { BUNGIE_ROOT } from "@/lib/destiny/display";
import type { MoveTarget } from "@/lib/destiny/moves";
import type {
  ActionStep,
  QueuedAction,
  QueuedLoadoutAction,
} from "@/lib/actions/store";
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
  const t = useTranslations("actions.label");
  if (target.kind === "vault") return t("toVault");
  const character = names.get(target.characterId) ?? "";
  return target.kind === "equipped"
    ? t("equip", { character })
    : t("toCharacter", { character });
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

/** Nom d'un emplacement d'équipement, ou undefined s'il n'en a pas. */
function useLoadoutName(nameHash: number | undefined): string | undefined {
  const def = useDefinition<LoadoutNameDefinition>(
    "DestinyLoadoutNameDefinition",
    nameHash ?? null,
  );
  return def?.name;
}

/**
 * Vignette d'un emplacement d'équipement : son fond coloré et son glyphe.
 *
 * Les deux images sont lues à l'unité, comme l'icône d'un attribut : le panneau
 * en affiche une poignée, et les identifiants viennent de l'action elle-même —
 * elle survit donc à un `clear` qui vide l'emplacement.
 */
function LoadoutMark({
  loadout,
  label,
}: {
  loadout: QueuedLoadoutAction;
  label: string;
}) {
  const color = useDefinition<LoadoutColorDefinition>(
    "DestinyLoadoutColorDefinition",
    isRealHash(loadout.colorHash) ? loadout.colorHash : null,
  );
  const icon = useDefinition<LoadoutIconDefinition>(
    "DestinyLoadoutIconDefinition",
    isRealHash(loadout.iconHash) ? loadout.iconHash : null,
  );

  return (
    <span className="loadout-mark" title={label}>
      {color?.colorImagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${color.colorImagePath}`}
          alt=""
          className="loadout-mark__color"
        />
      )}
      {icon?.iconImagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${icon.iconImagePath}`}
          alt=""
          className="loadout-mark__icon"
        />
      )}
      <span className="loadout-mark__number">{loadout.loadoutIndex + 1}</span>
    </span>
  );
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
  const t = useTranslations("actions.label");
  // Une action d'emplacement ne porte aucun objet : `0` n'est le hash d'aucune
  // définition, rien n'est lu.
  const def = useSharedDefinition(step.kind === "loadout" ? 0 : step.itemHash);
  const item = def?.displayProperties?.name ?? "";
  const character =
    names.get(
      step.kind === "loadout" ? step.request.characterId : step.characterId,
    ) ?? "";
  const perk = usePlugName(
    step.kind === "insert" ? step.plugItemHash : undefined,
  );

  // Le rôle prime sur le type de requête : un `equip` qui sert à déséquiper
  // n'a rien à voir, pour l'utilisateur, avec l'équipement final.
  const label =
    step.kind === "loadout"
      ? t(`loadoutStep.${step.request.kind}`, {
          number: step.request.loadoutIndex + 1,
          character,
        })
      : step.kind === "insert"
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
                  ? t("toCharacter", { character })
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
 * Les trois natures d'action partagent le gabarit — même flèche, même
 * avancement — et n'en changent que les deux extrémités :
 *
 *  - **déplacement** : la vignette de l'objet, puis le lieu visé ;
 *  - **insertion** : la vignette de l'objet, puis l'attribut qui prend la place ;
 *  - **équipement** : la vignette de l'emplacement, à gauche comme à droite. Il
 *    n'y a pas d'objet ici, et pas de lieu : l'emplacement est les deux à la
 *    fois, et c'est ce qu'on lui fait qui est écrit dans le sous-titre.
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
  const tLoadout = useTranslations("loadouts");
  const [expanded, setExpanded] = useState(false);
  const loadout = action.kind === "loadout" ? action : undefined;
  // `0` n'est le hash d'aucune définition : une action d'emplacement ne lit rien.
  // Le test porte sur `action.kind` et non sur `loadout` : c'est lui qui restreint
  // le type de l'union, une variable intermédiaire ne le fait pas.
  const def = useSharedDefinition(
    action.kind === "loadout" ? 0 : action.itemHash,
  );
  const loadoutName = useLoadoutName(loadout?.nameHash);

  const plugHash =
    action.kind === "insert" ? action.steps[0]?.plugItemHash : undefined;
  const perk = usePlugName(plugHash);
  // Les hooks ne se conditionnent pas : les libellés sont tous calculés, un seul
  // est retenu. Le déplacement fictif ne coûte qu'une lecture de messages.
  const moveLabel = useTargetLabel(
    action.kind === "move" ? action.target : { kind: "vault" },
    names,
  );
  const targetLabel = loadout
    ? t(`label.loadout.${loadout.action}`)
    : action.kind === "insert"
      ? t("label.perk", { perk })
      : moveLabel;

  // Le titre : le nom de l'objet, ou celui de l'emplacement et son numéro.
  const title = loadout
    ? `${loadout.loadoutIndex + 1} - ${loadoutName ?? tLoadout("freeSlot")}`
    : (def?.displayProperties?.name ?? "…");

  const done = action.steps.filter((s) => s.status === "done").length;
  const total = action.steps.length;

  return (
    <li className={`action-card action-card--${action.status}`}>
      <div className="action-card__header">
        <div className="action-card__titles">
          <span className="action-card__name">{title}</span>
          <span className="action-card__target">{targetLabel}</span>
        </div>
        <ActionStatusIcon status={action.status} />
      </div>

      <div className="action-card__flow">
        {/* .item-thumb se dimensionne sur son parent : il lui en faut un */}
        <span className="action-card__thumb">
          {action.kind === "loadout" ? (
            <LoadoutMark loadout={action} label={title} />
          ) : (
            <ItemThumb
              itemHash={action.itemHash}
              itemInstanceId={action.itemInstanceId}
              state={action.state}
              versionNumber={action.versionNumber}
              gearTier={action.gearTier}
            />
          )}
        </span>
        <span className="action-card__arrow" aria-hidden>
          →
        </span>
        {action.kind === "loadout" ? (
          <span className="destination-icon" title={targetLabel}>
            <LoadoutMark loadout={action} label={targetLabel} />
          </span>
        ) : action.kind === "insert" ? (
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
