"use client";

import { useDefinition } from "@/lib/manifest/use-definition";
import { useItemDetail } from "@/lib/bungie/use-item";
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
  BUNGIE_ROOT,
} from "@/lib/destiny/display";
import { PlugIcon } from "./PlugIcon";
import { StatBar } from "./StatBar";

// Récupère les hashes de plugs équipés pour une liste d'index de sockets.
function plugsForIndexes(
  detail: ItemDetail | undefined,
  def: InventoryItemDefinition,
  indexes: number[],
): number[] {
  return indexes
    .map((i) => {
      const socket = detail?.sockets?.[i];
      if (socket) {
        if (!socket.isVisible || !socket.plugHash) return 0;
        return socket.plugHash;
      }
      // Fallback (objet non instancié) : plug initial de la définition
      return def.sockets?.socketEntries?.[i]?.singleInitialItemHash ?? 0;
    })
    .filter((h) => h > 0);
}

// Section "WEAPON PERKS", "ARMOR MODS"… : titre + icônes de plugs.
function SocketSection({
  categoryHash,
  plugHashes,
  round = true,
}: {
  categoryHash: number;
  plugHashes: number[];
  round?: boolean;
}) {
  const catDef = useDefinition<SocketCategoryDefinition>(
    "DestinySocketCategoryDefinition",
    categoryHash,
  );
  if (!plugHashes.length) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {catDef?.displayProperties?.name}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {plugHashes.map((h, i) => (
          <PlugIcon
            key={`${h}-${i}`}
            hash={h}
            size={round ? 34 : 30}
          />
        ))}
      </div>
    </div>
  );
}

export function ItemTooltip({
  itemHash,
  itemInstanceId,
  pinned,
}: {
  itemHash: number;
  itemInstanceId?: string;
  pinned: boolean;
}) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    itemHash,
  );
  const { data: detail } = useItemDetail(itemInstanceId);

  if (!def) {
    return (
      <div className="w-72 rounded bg-neutral-900 p-3 text-sm text-neutral-400">
        Chargement…
      </div>
    );
  }

  const tier = def.inventory?.tierType;
  const accent = tierColor(tier);
  const isWeapon = def.itemType === ITEM_TYPE.Weapon;
  const isArmor = def.itemType === ITEM_TYPE.Armor;

  const power = detail?.instance?.primaryStat?.value;
  const damage = detail?.instance?.damageType ?? def.defaultDamageType;
  const powerColor = damageColor(damage);

  // Regroupement des sockets par catégorie
  const categories = def.sockets?.socketCategories ?? [];
  const groupPlugs = (catHash: number) => {
    const cat = categories.find((c) => c.socketCategoryHash === catHash);
    return cat ? plugsForIndexes(detail, def, cat.socketIndexes) : [];
  };

  const intrinsicPlugs = groupPlugs(SOCKET_CATEGORY.INTRINSIC);
  const archetypeHash = intrinsicPlugs[0];

  // Stats : armure = toujours affichées ; arme = uniquement une fois épinglé
  const statEntries = Object.values(detail?.stats ?? {});
  const showStats = isArmor || (isWeapon && pinned);
  const maxStat = statEntries.reduce((m, s) => Math.max(m, s.value), 1);
  const statMax = isWeapon ? 100 : maxStat;

  const rpm = detail?.stats?.[WEAPON_STAT.RPM]?.value;
  const impact = detail?.stats?.[WEAPON_STAT.IMPACT]?.value;
  const energy = detail?.instance?.energy;

  return (
    <div className="w-80 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-xl">
      {/* Barre de rareté */}
      <div className="h-1" style={{ backgroundColor: accent }} />

      {/* En-tête */}
      <div
        className="flex items-start justify-between gap-2 px-3 py-2"
        style={{ backgroundColor: `${accent}33` }}
      >
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold uppercase tracking-wide">
            {def.displayProperties.name}
          </h3>
          <p className="text-xs text-neutral-300">
            {def.itemTypeDisplayName}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {def.iconWatermark && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${BUNGIE_ROOT}${def.iconWatermark}`}
              alt=""
              className="h-5 w-5"
            />
          )}
          {power != null && (
            <span
              className="text-lg font-bold"
              style={{ color: powerColor }}
            >
              {power}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Archétype (arme) */}
        {isWeapon && archetypeHash && (
          <div className="flex items-center gap-2">
            <PlugIcon hash={archetypeHash} size={32} />
            <div className="text-xs">
              <div className="font-medium">
                <ArchetypeName hash={archetypeHash} />
              </div>
              {(rpm != null || impact != null) && (
                <div className="text-neutral-400">
                  {rpm != null && `${rpm} rpm`}
                  {rpm != null && impact != null && " / "}
                  {impact != null && `${impact} impact`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {showStats && statEntries.length > 0 && (
          <div className="flex flex-col gap-1">
            {statEntries.map((s) => (
              <StatBar
                key={s.statHash}
                statHash={s.statHash}
                value={s.value}
                max={statMax}
                accent={isWeapon ? powerColor : "#5ea9e8"}
              />
            ))}
          </div>
        )}

        {/* Énergie (armure) */}
        {isArmor && energy && energy.energyCapacity > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {energy.energyCapacity} énergie
            </span>
            <div className="flex gap-0.5">
              {Array.from({ length: energy.energyCapacity }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-sm ${
                    i < energy.energyUsed ? "bg-sky-400" : "bg-neutral-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Perks / mods */}
        <SocketSection
          categoryHash={SOCKET_CATEGORY.ARMOR_PERKS}
          plugHashes={groupPlugs(SOCKET_CATEGORY.ARMOR_PERKS)}
        />
        <SocketSection
          categoryHash={SOCKET_CATEGORY.WEAPON_PERKS}
          plugHashes={groupPlugs(SOCKET_CATEGORY.WEAPON_PERKS)}
        />
        <SocketSection
          categoryHash={SOCKET_CATEGORY.WEAPON_MODS}
          plugHashes={groupPlugs(SOCKET_CATEGORY.WEAPON_MODS)}
          round={false}
        />
        <SocketSection
          categoryHash={SOCKET_CATEGORY.ARMOR_MODS}
          plugHashes={groupPlugs(SOCKET_CATEGORY.ARMOR_MODS)}
          round={false}
        />
        <SocketSection
          categoryHash={SOCKET_CATEGORY.ARMOR_COSMETICS}
          plugHashes={groupPlugs(SOCKET_CATEGORY.ARMOR_COSMETICS)}
          round={false}
        />

        {/* Indice d'épinglage */}
        {isWeapon && !pinned && (
          <p className="text-[10px] italic text-neutral-500">
            Clic pour épingler et voir les statistiques
          </p>
        )}
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
