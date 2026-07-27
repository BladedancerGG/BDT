"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useProfile } from "@/lib/bungie/use-profile";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import { CharacterTab } from "./CharacterTab";
import { ItemIcon } from "./ItemIcon";

function ItemGrid({
  title,
  items,
}: {
  title: string;
  items: DestinyItemComponent[];
}) {
  return (
    <section className="item-grid">
      <h2 className="item-grid__title">
        {title} ({items.length})
      </h2>
      <div className="item-grid__items">
        {items.map((item, i) => (
          <ItemIcon
            key={item.itemInstanceId ?? `${item.itemHash}-${i}`}
            itemHash={item.itemHash}
            itemInstanceId={item.itemInstanceId}
          />
        ))}
      </div>
    </section>
  );
}

// Vue principale : sélecteur de personnage + objets équipés / en inventaire.
export function InventoryView() {
  const t = useTranslations("inventory");
  const { data, isLoading, isError } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

      {/* Objets du personnage sélectionné */}
      {current && (
        <div className="inventory-view__sections">
          <ItemGrid
            title={t("equipped")}
            items={data.equipment[current] ?? []}
          />
          <ItemGrid title={t("stored")} items={data.inventory[current] ?? []} />
        </div>
      )}
    </div>
  );
}
