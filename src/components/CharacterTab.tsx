"use client";

import type { CSSProperties } from "react";
import {
  useDefinition,
  type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type { Character } from "@/lib/bungie/use-profile";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

interface ClassDefinition {
  displayProperties: DisplayProperties;
}

// Onglet de sélection d'un personnage : emblème + classe + niveau de puissance.
export function CharacterTab({
  character,
  selected,
  onSelect,
}: {
  character: Character;
  selected: boolean;
  onSelect: () => void;
}) {
  const classDef = useDefinition<ClassDefinition>(
    "DestinyClassDefinition",
    character.classHash,
  );
  const className = classDef?.displayProperties?.name ?? "…";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`character-tab${selected ? " character-tab--selected" : ""}`}
    >
      {/* L'URL de l'emblème est passée au CSS via une variable */}
      <span
        className="character-tab__emblem"
        style={
          {
            "--emblem-url": `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`,
          } as CSSProperties
        }
      />
      <span className="character-tab__info">
        <span className="character-tab__class">{className}</span>
        <span className="character-tab__power">✦ {character.light}</span>
      </span>
    </button>
  );
}
