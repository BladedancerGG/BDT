"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type { DisplayProperties } from "@/lib/manifest/use-definition";
import type { Character } from "@/lib/bungie/use-profile";

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * Nom de classe de chaque personnage, indexé par `characterId`.
 *
 * Les libellés des actions (« Transfert vers Chasseur ») en ont besoin comme
 * *valeur* et non comme composant : impossible de passer par `useDefinition`,
 * qui rend un nœud. Une seule requête groupée pour les trois classes.
 */
export function useCharacterNames(
  characters: readonly Character[],
): ReadonlyMap<string, string> {
  // Clé de dépendance : l'identité du tableau change à chaque rendu du profil,
  // pas son contenu. On inclut le characterId, qui indexe le résultat.
  const key = characters.map((c) => `${c.characterId}:${c.classHash}`).join(",");

  return (
    useLiveQuery(async () => {
      const rows = await manifestDb.definitions.bulkGet(
        characters.map(
          (c) => ["DestinyClassDefinition", c.classHash] as [string, number],
        ),
      );

      const names = new Map<string, string>();
      rows.forEach((row, index) => {
        const def = row?.data as { displayProperties?: DisplayProperties } | undefined;
        names.set(
          characters[index].characterId,
          def?.displayProperties?.name ?? "",
        );
      });
      return names;
    }, [key]) ?? EMPTY
  );
}
