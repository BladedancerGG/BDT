"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import {
  BUCKET,
  CUSTOMIZATION_BUCKETS,
  EQUIPMENT_BUCKETS,
  STORAGE_BUCKETS,
} from "./buckets";

/**
 * Emplacements dont la capacité intéresse le planificateur : **tout ce qui peut
 * recevoir un objet**, et pas seulement l'équipement.
 *
 * Piège déjà payé : les emplacements de personnalisation et le rangement
 * partagé manquaient à cette liste. Le planificateur retombait alors sur la
 * capacité par défaut — dix, celle d'une arme — et refusait tout transfert vers
 * un rangement qui en contient cinquante, avec « l'emplacement de destination
 * est plein » alors qu'il ne l'était pas.
 */
const TRACKED: readonly number[] = [
  ...EQUIPMENT_BUCKETS,
  ...CUSTOMIZATION_BUCKETS,
  ...STORAGE_BUCKETS,
  BUCKET.Vault,
];

interface BucketDefinition {
  /** Capacité de l'emplacement, objet équipé compris */
  itemCount?: number;
}

const EMPTY: ReadonlyMap<number, number> = new Map();

/**
 * Capacité de chaque emplacement, lue du manifeste.
 *
 * Elle ne se devine pas : 10 pour les armes et armures, 7 pour l'artéfact,
 * 1300 pour le coffre — et Bungie l'a déjà fait évoluer. Une seule requête
 * groupée, comme pour les définitions d'objets.
 */
export function useBucketCapacities(): ReadonlyMap<number, number> {
  return (
    useLiveQuery(async () => {
      const rows = await manifestDb.definitions.bulkGet(
        TRACKED.map((hash) => ["DestinyInventoryBucketDefinition", hash] as [string, number]),
      );

      const capacities = new Map<number, number>();
      rows.forEach((row, index) => {
        const count = (row?.data as BucketDefinition | undefined)?.itemCount;
        if (typeof count === "number") capacities.set(TRACKED[index], count);
      });
      return capacities;
    }, []) ?? EMPTY
  );
}
