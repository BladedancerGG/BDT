"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useDefinition } from "@/lib/manifest/use-definition";
import { useItemData } from "@/lib/bungie/use-item-data";
import { useSocketColumns } from "@/lib/destiny/use-sockets";
import type {
  InventoryItemDefinition,
  SocketCategoryDefinition,
} from "@/lib/destiny/types";
import type { ItemDetail } from "@/lib/bungie/item";
import {
  tierColor,
  damageColor,
  ITEM_TYPE,
  SOCKET_CATEGORY,
  WEAPON_STAT,
} from "@/lib/destiny/display";
import { isCrafted, isEnhanced } from "@/lib/destiny/overlays";
import { ItemThumb } from "../ItemThumb";
import { PlugIcon } from "./PlugIcon";
import { StatBar } from "./StatBar";
import { TooltipSkeleton } from "./TooltipSkeleton";

/** Nom d'une catégorie de sockets ("Perks d'arme", "Mods d'armure"…). */
function useCategoryName(categoryHash: number): string {
  const def = useDefinition<SocketCategoryDefinition>(
    "DestinySocketCategoryDefinition",
    categoryHash,
  );
  return def?.displayProperties?.name ?? "";
}

/**
 * Perks affichés en colonnes : une colonne par socket, avec TOUTES les options
 * équipables ; celle en place est mise en avant.
 */
function PerkColumns({
  def,
  detail,
  categoryHash,
}: {
  def: InventoryItemDefinition;
  detail: ItemDetail | undefined;
  categoryHash: number;
}) {
  const columns = useSocketColumns(def, detail, categoryHash);
  const title = useCategoryName(categoryHash);

  if (columns.length === 0) return null;

  return (
    <div className="socket-section">
      <span className="socket-section__title">{title}</span>
      <div className="socket-section__columns">
        {columns.map((column) => (
          <div key={column.socketIndex} className="socket-column">
            {column.options.map((hash) => (
              <PlugIcon
                key={hash}
                hash={hash}
                state={hash === column.equippedHash ? "equipped" : "available"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sockets affichés en simple ligne (mods, cosmétiques) : plugs équipés. */
function PlugRow({
  def,
  detail,
  categoryHash,
  square = true,
}: {
  def: InventoryItemDefinition;
  detail: ItemDetail | undefined;
  categoryHash: number;
  square?: boolean;
}) {
  const columns = useSocketColumns(def, detail, categoryHash);
  const title = useCategoryName(categoryHash);

  const equipped = columns
    .map((c) => c.equippedHash)
    .filter((h): h is number => Boolean(h));

  if (equipped.length === 0) return null;

  return (
    <div className="socket-section">
      <span className="socket-section__title">{title}</span>
      <div className="socket-section__row">
        {equipped.map((hash, i) => (
          <PlugIcon key={`${hash}-${i}`} hash={hash} square={square} />
        ))}
      </div>
    </div>
  );
}

function ArchetypeName({ hash }: { hash: number }) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    hash,
  );
  return <>{def?.displayProperties?.name ?? ""}</>;
}

export function ItemTooltip({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
  pinned,
}: {
  itemHash: number;
  itemInstanceId?: string;
  state?: number;
  versionNumber?: number;
  gearTier?: number;
  pinned: boolean;
}) {
  const t = useTranslations("item");
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    itemHash,
  );
  console.log(def)
  // Servi depuis le préchargement du profil dans le cas normal — donc sans
  // attente. Le squelette ne s'affiche que pour un objet absent du profil,
  // qu'il faut alors aller chercher à l'unité.
  const { detail, pending: awaitingDetail } = useItemData(itemInstanceId);
  const intrinsic = useSocketColumns(def, detail, SOCKET_CATEGORY.INTRINSIC);

  if (!def) {
    return (
      <div className="item-tooltip">
        <p className="item-tooltip__loading">{t("loading")}</p>
      </div>
    );
  }

  const isWeapon = def.itemType === ITEM_TYPE.Weapon;
  const isArmor = def.itemType === ITEM_TYPE.Armor;

  const power = detail?.instance?.primaryStat?.value;
  const damage = detail?.instance?.damageType ?? def.defaultDamageType;
  const archetypeHash = intrinsic[0]?.equippedHash;

  // Stats : armure = toujours affichées ; arme = uniquement une fois épinglé
  // { [hash]: valeur } → paires [hash, valeur]
  const statEntries = Object.entries(detail?.stats ?? {});
  const showStats = isArmor || (isWeapon && pinned);
  // Les stats d'arme sont sur 100 ; celles d'armure varient → échelle relative
  const statMax = isWeapon
    ? 100
    : statEntries.reduce((m, [, value]) => Math.max(m, value), 1);

  const rpm = detail?.stats?.[WEAPON_STAT.RPM];
  const impact = detail?.stats?.[WEAPON_STAT.IMPACT];
  const energy = detail?.instance?.energy;

  // Marquages doublés en texte sous le type (le calque est discret)
  const crafted = isCrafted(state);
  const enhanced = isEnhanced(state);

  return (
    <div
      className="item-tooltip"
      style={
        {
          "--tier-color": tierColor(def.inventory?.tierType),
          "--damage-color": damageColor(damage),
        } as CSSProperties
      }
    >
      <div className="item-tooltip__tier" />

      <div className="item-tooltip__header">
        {/* Vignette reprenant icône + filigrane + palier + façonné / amélioré */}
        <ItemThumb
          itemHash={itemHash}
          itemInstanceId={itemInstanceId}
          state={state}
          versionNumber={versionNumber}
          gearTier={gearTier}
          className="item-thumb--sm"
        />
        <div className="item-tooltip__identity">
          <h3 className="item-tooltip__name">{def.displayProperties.name}</h3>
          <p className="item-tooltip__type">{def.itemTypeDisplayName}</p>
          {/* Le calque de palier étant très discret, on le double en texte */}
          {(gearTier || crafted || enhanced) && (
            <p className="item-tooltip__tags">
              {gearTier ? `${t("gearTier")} ${gearTier}` : null}
              {gearTier && (crafted || enhanced) ? " · " : null}
              {crafted ? t("crafted") : null}
              {crafted && enhanced ? " · " : null}
              {enhanced ? t("enhanced") : null}
            </p>
          )}
        </div>
        <div className="item-tooltip__meta">
          {awaitingDetail ? (
            <span className="skeleton skeleton--line skeleton--line-sm" />
          ) : (
            power != null && (
              <span className="item-tooltip__power">{power}</span>
            )
          )}
        </div>
      </div>

      <div className="item-tooltip__body">
        {awaitingDetail ? (
          <TooltipSkeleton
            kind={isWeapon ? "weapon" : isArmor ? "armor" : "other"}
          />
        ) : (
          <>
            {/* Archétype (arme) : intrinsèque + cadence / impact */}
            {isWeapon && archetypeHash && (
              <div className="item-tooltip__archetype">
                <PlugIcon hash={archetypeHash} />
                <div>
                  <div className="item-tooltip__archetype-name">
                    <ArchetypeName hash={archetypeHash} />
                  </div>
                  {(rpm != null || impact != null) && (
                    <div className="item-tooltip__archetype-detail">
                      {rpm != null && `${rpm} rpm`}
                      {rpm != null && impact != null && " / "}
                      {impact != null && `${impact} impact`}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Statistiques */}
            {showStats && statEntries.length > 0 && (
              <div className="item-tooltip__stats">
                {statEntries.map(([hash, value]) => (
                  <StatBar
                    key={hash}
                    statHash={Number(hash)}
                    value={value}
                    max={statMax}
                    color={
                      isWeapon ? damageColor(damage) : "var(--color-energy)"
                    }
                  />
                ))}
              </div>
            )}

            {/* Capacité d'énergie (armure) */}
            {isArmor && energy && energy.energyCapacity > 0 && (
              <div className="item-tooltip__energy">
                <span className="item-tooltip__energy-title">
                  {energy.energyCapacity} {t("energy")}
                </span>
                <div className="item-tooltip__energy-pips">
                  {Array.from({ length: energy.energyCapacity }).map((_, i) => (
                    <span
                      key={i}
                      className={`item-tooltip__energy-pip${
                        i < energy.energyUsed
                          ? " item-tooltip__energy-pip--used"
                          : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Perks : toutes les options équipables, en colonnes */}
            {isWeapon && (
              <PerkColumns
                def={def}
                detail={detail}
                categoryHash={SOCKET_CATEGORY.WEAPON_PERKS}
              />
            )}
            {isArmor && (
              <PlugRow
                def={def}
                detail={detail}
                categoryHash={SOCKET_CATEGORY.ARMOR_PERKS}
                square={false}
              />
            )}

            {/* Mods et cosmétiques : plugs équipés */}
            <PlugRow
              def={def}
              detail={detail}
              categoryHash={SOCKET_CATEGORY.WEAPON_MODS}
            />
            <PlugRow
              def={def}
              detail={detail}
              categoryHash={SOCKET_CATEGORY.ARMOR_MODS}
            />
            <PlugRow
              def={def}
              detail={detail}
              categoryHash={SOCKET_CATEGORY.ARMOR_COSMETICS}
            />
          </>
        )}

        {isWeapon && !pinned && (
          <p className="item-tooltip__hint">{t("pinHint")}</p>
        )}
      </div>
    </div>
  );
}
