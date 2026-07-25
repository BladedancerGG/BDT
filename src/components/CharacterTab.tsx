"use client";

import {
  useDefinition,
  type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type { Character } from "@/lib/bungie/use-profile";

const BUNGIE_ROOT = "https://www.bungie.net";

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
      onClick={onSelect}
      className={`relative flex min-w-48 items-center gap-3 overflow-hidden rounded border px-3 py-2 text-left transition ${
        selected
          ? "border-amber-500 ring-1 ring-amber-500"
          : "border-neutral-700 hover:border-neutral-500"
      }`}
    >
      {/* Emblème en fond */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`,
          backgroundSize: "cover",
        }}
      />
      <div className="relative flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BUNGIE_ROOT}${character.emblemPath}`}
          alt=""
          className="h-9 w-9"
        />
        <div>
          <div className="font-medium">{className}</div>
          <div className="text-sm text-amber-400">✦ {character.light}</div>
        </div>
      </div>
    </button>
  );
}
