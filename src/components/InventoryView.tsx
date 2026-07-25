"use client";

import { useState } from "react";
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
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        {title} ({items.length})
      </h2>
      <div className="flex flex-wrap gap-2">
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
  const { data, isLoading, isError } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <p className="text-neutral-400">Chargement du profil…</p>;
  if (isError || !data)
    return <p className="text-red-400">Impossible de charger le profil.</p>;

  const current = selectedId ?? data.characters[0]?.characterId ?? null;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      {/* Sélecteur de personnage */}
      <div className="flex flex-wrap gap-3">
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
        <div className="flex flex-col gap-6">
          <ItemGrid title="Équipé" items={data.equipment[current] ?? []} />
          <ItemGrid title="Inventaire" items={data.inventory[current] ?? []} />
        </div>
      )}
    </div>
  );
}
