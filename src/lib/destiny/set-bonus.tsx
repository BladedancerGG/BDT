"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InventoryItemDefinition } from "./types";

// Bonus d'ensemble des armures.
//
// Une armure appartenant à un ensemble porte `equippingBlock.equipableItemSetHash`.
// L'ensemble (DestinyEquipableItemSetDefinition) liste ses perks avec le nombre
// de pièces requis — 2 et 4 en pratique.
//
// Savoir si un perk est actif demande de compter les pièces du même ensemble
// **équipées sur le personnage affiché** : une information que l'infobulle d'un
// objet ne possède pas seule, d'où ce contexte.

/** Hash de l'ensemble auquel appartient une armure, s'il y en a un. */
export function itemSetHash(
  def: InventoryItemDefinition | undefined,
): number | undefined {
  return def?.equippingBlock?.equipableItemSetHash;
}

/** Nombre de pièces équipées, par hash d'ensemble. */
export type EquippedSetCounts = ReadonlyMap<number, number>;

const EMPTY: EquippedSetCounts = new Map();

const EquippedSetsContext = createContext<EquippedSetCounts>(EMPTY);

export function EquippedSetsProvider({
  counts,
  children,
}: {
  counts: EquippedSetCounts;
  children: ReactNode;
}) {
  return (
    <EquippedSetsContext.Provider value={counts}>
      {children}
    </EquippedSetsContext.Provider>
  );
}

/** Compte les pièces équipées d'un ensemble donné. */
export function useEquippedSetCount(setHash: number | undefined): number {
  const counts = useContext(EquippedSetsContext);
  return setHash ? (counts.get(setHash) ?? 0) : 0;
}

/**
 * Compte les pièces équipées par ensemble, à partir de la liste des objets
 * équipés par le personnage et des définitions déjà préchargées.
 */
export function countEquippedSets(
  equipped: { itemHash: number }[],
  defs: Map<number, InventoryItemDefinition>,
): EquippedSetCounts {
  const counts = new Map<number, number>();
  for (const item of equipped) {
    const hash = itemSetHash(defs.get(item.itemHash));
    if (hash) counts.set(hash, (counts.get(hash) ?? 0) + 1);
  }
  return counts;
}
