"use client";

import type { Character } from "@/lib/bungie/use-profile";
import type { MoveTarget } from "@/lib/destiny/moves";
import { ClassIcon } from "../ClassIcon";

/**
 * Où va l'objet : le sigil du coffre, ou celui de la classe du personnage.
 *
 * Les emblèmes de personnage sont des bandeaux larges, illisibles à cette
 * taille ; les icônes de classe (`public/icons/class_*.svg`) tiennent dans un
 * carré et se colorent comme du texte.
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/vault.svg" alt="" />
      ) : (
        // Teinté par la couleur de texte, contrairement au sigil du coffre qui
        // garde la sienne — voir ClassIcon.
        <ClassIcon classType={character?.classType} />
      )}
    </span>
  );
}
