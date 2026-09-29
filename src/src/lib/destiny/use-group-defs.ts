"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type { DisplayProperties } from "@/lib/manifest/use-definition";

/** Libellés du manifeste dont les en-têtes de groupe ont besoin. */
export interface GroupDefs {
  /** Nom d'un emplacement, par hash */
  bucketNames: ReadonlyMap<number, string>;
  /** Nom et icône d'un type de dégâts, par valeur d'énumération */
  damageTypes: ReadonlyMap<number, { name: string; icon?: string }>;
  /** Nom d'une classe, par DestinyClass */
  classNames: ReadonlyMap<number, string>;
}

const EMPTY: GroupDefs = {
  bucketNames: new Map(),
  damageTypes: new Map(),
  classNames: new Map(),
};

interface DamageTypeDefinition {
  displayProperties?: DisplayProperties;
  /** Valeur de DestinyDamageType — le hash de la définition n'en est pas une */
  enumValue?: number;
}

interface ClassDefinition {
  displayProperties?: DisplayProperties;
  classType?: number;
}

interface BucketDefinition {
  displayProperties?: DisplayProperties;
}

/**
 * Les trois petites tables servant à nommer les groupes du coffre.
 *
 * Elles sont lues **en entier** plutôt qu'objet par objet : une quarantaine
 * d'emplacements, sept types de dégâts et trois classes, indexés une fois pour
 * toute la vue. Les types de dégâts et les classes sont d'ailleurs indexés par
 * leur énumération et non par leur hash — c'est l'énumération que portent les
 * instances et les définitions d'objets.
 */
export function useGroupDefs(): GroupDefs {
  return (
    useLiveQuery(async () => {
      const [bucketRows, damageRows, classRows] = await Promise.all([
        manifestDb.definitions
          .where("table")
          .equals("DestinyInventoryBucketDefinition")
          .toArray(),
        manifestDb.definitions
          .where("table")
          .equals("DestinyDamageTypeDefinition")
          .toArray(),
        manifestDb.definitions
          .where("table")
          .equals("DestinyClassDefinition")
          .toArray(),
      ]);

      const bucketNames = new Map<number, string>();
      for (const row of bucketRows) {
        const name = (row.data as BucketDefinition).displayProperties?.name;
        if (name) bucketNames.set(row.hash, name);
      }

      const damageTypes = new Map<number, { name: string; icon?: string }>();
      for (const row of damageRows) {
        const def = row.data as DamageTypeDefinition;
        if (def.enumValue === undefined || !def.displayProperties?.name) continue;
        damageTypes.set(def.enumValue, {
          name: def.displayProperties.name,
          icon: def.displayProperties.icon,
        });
      }

      const classNames = new Map<number, string>();
      for (const row of classRows) {
        const def = row.data as ClassDefinition;
        if (def.classType === undefined || !def.displayProperties?.name) continue;
        classNames.set(def.classType, def.displayProperties.name);
      }

      return { bucketNames, damageTypes, classNames };
    }, []) ?? EMPTY
  );
}
