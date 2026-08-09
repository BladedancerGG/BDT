"use client";

import { useEffect, useMemo } from "react";
import type { ProfileData } from "@/lib/bungie/use-profile";
import type { MoveTarget } from "@/lib/destiny/moves";
import { useCharacterNames } from "@/lib/destiny/use-character-names";
import { useMovePlanner } from "@/lib/actions/use-move-planner";
import { matchKey, useSearchCounts, useSearchMatches } from "@/lib/search/provider";
import { useSearchStore } from "@/lib/search/store";
import type { QueuedItem } from "@/lib/actions/store";

/**
 * Publie vers la barre de recherche ce que l'inventaire sait des objets
 * trouvés : combien ils sont, et où on peut les envoyer.
 *
 * La barre vit dans l'en-tête, hors de l'arbre où le profil, le manifeste et
 * le planificateur sont disponibles : ce composant sans rendu est le pont
 * entre les deux, dans ce sens-là seulement (la requête, elle, descend par le
 * store).
 */
export function SearchActionsBridge({ data }: { data: ProfileData }) {
  const matched = useSearchMatches();
  const counts = useSearchCounts();
  const names = useCharacterNames(data.characters);
  const { enqueue } = useMovePlanner();
  const setResults = useSearchStore((s) => s.setResults);

  // Objets trouvés susceptibles d'être déplacés : un objet non instancié n'a
  // pas d'identité côté API, il ne bouge pas.
  const items = useMemo<QueuedItem[]>(() => {
    if (!matched) return [];

    const all = [
      ...Object.values(data.equipment),
      ...Object.values(data.inventory),
      data.vault,
    ].flat();

    return all
      .filter(
        (item) =>
          item.itemInstanceId !== undefined &&
          matched.has(matchKey(item.itemHash, item.itemInstanceId)),
      )
      .map((item) => ({
        itemHash: item.itemHash,
        itemInstanceId: item.itemInstanceId as string,
        state: item.state,
        versionNumber: item.versionNumber,
        gearTier: data.items[item.itemInstanceId as string]?.instance?.gearTier,
      }));
  }, [matched, data]);

  const characters = useMemo(
    () =>
      data.characters.map((character) => ({
        characterId: character.characterId,
        label: names.get(character.characterId) ?? "",
      })),
    [data.characters, names],
  );

  const total = counts?.total ?? null;

  useEffect(() => {
    const move = (target: MoveTarget) => {
      // Le planificateur écarte de lui-même les objets déjà à destination et
      // ceux qui ne peuvent pas y aller (doctrines, mauvaise classe…).
      for (const item of items) enqueue(item, target);
    };

    setResults({ total, characters, movable: items.length, move });
    return () => setResults(null);
  }, [total, characters, items, enqueue, setResults]);

  return null;
}
