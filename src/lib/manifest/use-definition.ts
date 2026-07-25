"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "./db";

// Type minimal partagé par la plupart des définitions.
export interface DisplayProperties {
  name: string;
  description: string;
  icon?: string;
  hasIcon: boolean;
}

/**
 * Lit une définition du manifeste (IndexedDB) de façon réactive.
 * Renvoie undefined tant que la donnée n'est pas chargée / absente.
 */
export function useDefinition<T = unknown>(
  table: string,
  hash: number | undefined | null,
): T | undefined {
  return useLiveQuery(async () => {
    if (hash == null) return undefined;
    const row = await manifestDb.definitions.get([table, hash]);
    return row?.data as T | undefined;
  }, [table, hash]);
}
