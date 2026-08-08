"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import { BUCKET, EQUIPMENT_BUCKETS } from "./buckets";

/**
 * Emplacements dont la capacité intéresse le planificateur : les dix
 * emplacements d'équipement, plus le coffre.
 */
const TRACKED: readonly number[] = [...EQUIPMENT_BUCKETS, BUCKET.Vault];

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
