"use client";

import type { Character } from "@/lib/bungie/use-profile";
import type { MoveTarget } from "@/lib/destiny/moves";
import { ClassIcon } from "../ClassIcon";
import { VaultIcon } from "../icons";

/**
 * Où va l'objet : le sigil du coffre, ou celui de la classe du personnage.
 *
 * Les emblèmes de personnage sont des bandeaux larges, illisibles à cette
 * taille ; les symboles de classe tiennent dans un carré et se colorent comme
 * du texte.
 */
export function DestinationIcon({
  target,
  characters,
  label,
}: {
  target: MoveTarget;
  characters: readonly Character[];
  label: string;
}) {
  const character =
    target.kind === "vault"
      ? undefined
      : characters.find((c) => c.characterId === target.characterId);

  return (
    <span
      className={`destination-icon${
        target.kind === "equipped" ? " destination-icon--equip" : ""
      }`}
      title={label}
      role="img"
      aria-label={label}
    >
      {target.kind === "vault" ? (
        <VaultIcon />
      ) : (
        <ClassIcon classType={character?.classType} />
      )}
    </span>
  );
}
