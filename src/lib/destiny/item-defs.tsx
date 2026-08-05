"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "./types";
import {
  ITEM_CONSTANTS_HASH,
  type ItemConstantsDefinition,
} from "./overlays";
import { cosmeticSocketIndexes, isOrnamentPlug } from "./ornaments";
import { isPlugApplied } from "./sockets";
import { bestIconPath, type IconDefinition } from "./icons";

/**
 * Définitions du manifeste mutualisées pour tout un inventaire.
 *
 * Sans ça, chaque vignette lançait ses propres requêtes IndexedDB : avec un
 * coffre de ~1000 objets, plus de 2000 souscriptions Dexie. Ici une seule
 * requête sert tout l'arbre.
 */
interface ItemDefsValue {
  defs: Map<number, InventoryItemDefinition>;
  /** Icônes détourées (PNG) par hash d'objet — absentes pour ~18 % des objets */
  iconDefs: Map<number, IconDefinition>;
  constants?: ItemConstantsDefinition;
  /** Icône de l'ornement équipé, par itemInstanceId (si l'option est active) */
  ornamentIcons: Map<string, string>;
  /** false tant que la requête groupée n'a pas abouti */
  ready: boolean;
}

const EMPTY: ItemDefsValue = {
  defs: new Map(),
  iconDefs: new Map(),
  ornamentIcons: new Map(),
  ready: false,
};

const ItemDefsContext = createContext<ItemDefsValue>(EMPTY);

export interface ItemRef {
  itemHash: number;
  itemInstanceId?: string;
}

export function ItemDefsProvider({
  items,
  details,
  withOrnaments,
  children,
}: {
  /** Tous les objets susceptibles d'être affichés dans cet arbre */
  items: ItemRef[];
  /** Sockets de chaque objet, pour retrouver l'ornement équipé */
  details: Record<string, ItemDetail>;
  /** Résoudre les ornements (coûte une lecture supplémentaire) */
  withOrnaments: boolean;
  children: ReactNode;
}) {
  const value = useLiveQuery(
    async () => {
      // 1. Définitions des objets + leurs icônes détourées
      const hashes = [...new Set(items.map((item) => item.itemHash))];
      const [rows, iconRows, constantsRow] = await Promise.all([
        manifestDb.definitions.bulkGet(
          hashes.map(
            (hash) =>
              ["DestinyInventoryItemDefinition", hash] as [string, number],
          ),
        ),
        manifestDb.definitions.bulkGet(
          hashes.map(
            (hash) => ["DestinyIconDefinition", hash] as [string, number],
          ),
        ),
        manifestDb.definitions.get([
          "DestinyInventoryItemConstantsDefinition",
          ITEM_CONSTANTS_HASH,
        ]),
      ]);

      const defs = new Map<number, InventoryItemDefinition>();
      rows.forEach((row, i) => {
        if (row) defs.set(hashes[i], row.data as InventoryItemDefinition);
      });

      const iconDefs = new Map<number, IconDefinition>();
      iconRows.forEach((row, i) => {
        if (row) iconDefs.set(hashes[i], row.data as IconDefinition);
      });

      const constants = constantsRow?.data as
        | ItemConstantsDefinition
        | undefined;

      if (!withOrnaments) {
        return {
          defs,
          iconDefs,
          constants,
          ornamentIcons: new Map(),
          ready: true,
        };
      }

      // 2. Les définitions des objets étant connues, on sait quels sockets sont
      //    cosmétiques : on collecte TOUS les plugs qui y sont équipés.
      //
      //    Une liste par objet, et non une seule valeur : un même objet a
      //    plusieurs sockets cosmétiques (revêtement, ornement, effet de mise à
      //    mort…). Ne garder que le dernier faisait perdre l'ornement dès qu'un
      //    autre socket cosmétique venait après — le cas systématique des armes
      //    holofoil, dont le socket d'effet visuel suit celui de l'ornement.
      //    On ne peut pas trier ici : reconnaître un ornement demande la
      //    définition du plug, chargée à l'étape suivante.
      const candidates = new Map<string, number[]>(); // instanceId → plugHashes
      const plugHashes = new Set<number>();
      for (const item of items) {
        if (!item.itemInstanceId) continue;
        const sockets = details[item.itemInstanceId]?.sockets;
        if (!sockets) continue;

        const itemDef = defs.get(item.itemHash);
        for (const index of cosmeticSocketIndexes(itemDef)) {
          const plugHash = sockets[index];
          if (!plugHash || plugHash <= 0) continue;
          // Écarte le placeholder « Ornement d'origine »
          if (!isPlugApplied(itemDef, index, plugHash)) continue;

          const list = candidates.get(item.itemInstanceId);
          if (list) list.push(plugHash);
          else candidates.set(item.itemInstanceId, [plugHash]);
          plugHashes.add(plugHash);
        }
      }

      // 3. Une seconde lecture groupée : définitions ET icônes de ces plugs
      const plugList = [...plugHashes];
      const [plugRows, plugIconRows] = await Promise.all([
        manifestDb.definitions.bulkGet(
          plugList.map(
            (hash) =>
              ["DestinyInventoryItemDefinition", hash] as [string, number],
          ),
        ),
        manifestDb.definitions.bulkGet(
          plugList.map(
            (hash) => ["DestinyIconDefinition", hash] as [string, number],
          ),
        ),
      ]);
      const plugDefs = new Map<number, InventoryItemDefinition>();
      const plugIcons = new Map<number, IconDefinition>();
      plugList.forEach((hash, i) => {
        if (plugRows[i]) {
          plugDefs.set(hash, plugRows[i]!.data as InventoryItemDefinition);
        }
        if (plugIconRows[i]) {
          plugIcons.set(hash, plugIconRows[i]!.data as IconDefinition);
        }
      });

      const ornamentIcons = new Map<string, string>();
      for (const [instanceId, plugList2] of candidates) {
        // Parmi les plugs cosmétiques modifiés, retenir le seul qui soit un
        // ornement (les revêtements et effets visuels sont ignorés).
        const plugHash = plugList2.find((hash) =>
          isOrnamentPlug(plugDefs.get(hash)),
        );
        if (!plugHash) continue;

        // PNG détouré de l'ornement si disponible, sinon son JPEG
        const icon = bestIconPath(plugDefs.get(plugHash), plugIcons.get(plugHash));
        if (!icon) continue;

        // Certains « ornements d'origine » portent l'icône de base : inutile
        const itemHash = items.find(
          (item) => item.itemInstanceId === instanceId,
        )?.itemHash;
        if (
          itemHash &&
          bestIconPath(defs.get(itemHash), iconDefs.get(itemHash)) === icon
        ) {
          continue;
        }

        ornamentIcons.set(instanceId, icon);
      }

      return { defs, iconDefs, constants, ornamentIcons, ready: true };
    },
    [items, details, withOrnaments],
    EMPTY,
  );

  return (
    <ItemDefsContext.Provider value={value ?? EMPTY}>
      {children}
    </ItemDefsContext.Provider>
  );
}

export function useItemDefs(): ItemDefsValue {
  return useContext(ItemDefsContext);
}

/** Définition d'un objet, servie depuis le lot préchargé. */
export function useSharedDefinition(
  hash: number,
): InventoryItemDefinition | undefined {
  return useItemDefs().defs.get(hash);
}

/** Icône détourée d'un objet (PNG), absente si le manifeste n'en a pas. */
export function useSharedIconDefinition(
  hash: number,
): IconDefinition | undefined {
  return useItemDefs().iconDefs.get(hash);
}

/** Constantes d'overlay (palier, façonné, amélioré), chargées une seule fois. */
export function useSharedItemConstants(): ItemConstantsDefinition | undefined {
  return useItemDefs().constants;
}

/** Icône de l'ornement équipé, si l'option est active et un ornement présent. */
export function useOrnamentIcon(
  instanceId: string | undefined,
): string | undefined {
  const { ornamentIcons } = useItemDefs();
  return instanceId ? ornamentIcons.get(instanceId) : undefined;
}
