"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useProfile, type ProfileData } from "@/lib/bungie/use-profile";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import { ItemDefsProvider } from "@/lib/destiny/item-defs";
import { useSettings } from "@/lib/settings/store";
import { useDisplayableItems } from "@/lib/destiny/use-displayable-items";
import { CharacterTab } from "./CharacterTab";
import { ItemIcon } from "./ItemIcon";
import { VirtualItemGrid } from "./VirtualItemGrid";

// Référence stable : évite de relancer le filtrage à chaque rendu
const NO_ITEMS: DestinyItemComponent[] = [];

function ItemGrid({
  title,
  items,
  details,
}: {
  title: string;
  items: DestinyItemComponent[];
  details: Record<string, ItemDetail>;
}) {
  // Armes, armures, doctrines et artéfacts uniquement
  const displayed = useDisplayableItems(items);

  return (
    <section className="item-grid">
      <h2 className="item-grid__title">
        {title} ({displayed.length})
      </h2>
      <div className="item-grid__items">
        {displayed.map((item, i) => {
          const detail = item.itemInstanceId
            ? details[item.itemInstanceId]
            : undefined;
          return (
            <ItemIcon
              key={item.itemInstanceId ?? `${item.itemHash}-${i}`}
              itemHash={item.itemHash}
              itemInstanceId={item.itemInstanceId}
              state={item.state}
              versionNumber={item.versionNumber}
              gearTier={detail?.instance?.gearTier}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Personnages, objets du personnage sélectionné, puis coffre. */
function Inventory({ data }: { data: ProfileData }) {
  const t = useTranslations("inventory");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = selectedId ?? data.characters[0]?.characterId ?? null;

  return (
    <div className="inventory-view">
      {/* Sélecteur de personnage */}
      <div className="inventory-view__characters">
        {data.characters.map((c) => (
          <CharacterTab
            key={c.characterId}
            character={c}
            selected={c.characterId === current}
            onSelect={() => setSelectedId(c.characterId)}
          />
        ))}
      </div>

      <div className="inventory-view__sections">
        {current && (
          <>
            <ItemGrid
              title={t("equipped")}
              items={data.equipment[current] ?? NO_ITEMS}
              details={data.items}
            />
            <ItemGrid
              title={t("stored")}
              items={data.inventory[current] ?? NO_ITEMS}
              details={data.items}
            />
          </>
        )}

        {/* Le coffre est commun à tous les personnages. Virtualisé : il
            contient environ un millier d'objets. */}
        <VirtualItemGrid
          title={t("vault")}
          items={data.vault}
          details={data.items}
        />
      </div>
    </div>
  );
}

// Vue principale : charge le profil puis précharge les définitions associées.
export function InventoryView() {
  const t = useTranslations("inventory");
  const { data, isLoading, isError } = useProfile();

  const showOrnaments = useSettings((s) => s.showOrnaments);

  // Tous les objets de l'arbre, pour une unique requête groupée de définitions
  const allItems = useMemo(() => {
    if (!data) return [];
    return [
      ...Object.values(data.equipment),
      ...Object.values(data.inventory),
      data.vault,
    ].flat();
  }, [data]);

  if (isLoading) {
    return <p className="inventory-view__message">{t("loading")}</p>;
  }
  if (isError || !data) {
    return (
      <p className="inventory-view__message inventory-view__message--error">
        {t("error")}
      </p>
    );
  }

  return (
    <ItemDefsProvider
      items={allItems}
      details={data.items}
      withOrnaments={showOrnaments}
    >
      <Inventory data={data} />
    </ItemDefsProvider>
  );
}
