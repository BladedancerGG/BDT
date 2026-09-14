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
import { loadSortTraits, type ItemSortTraits } from "./sort-traits";

/**
 * Définitions du manifeste mutualisées pour tout un inventaire.
 *
 * Sans ça, chaque vignette lançait ses propres requêtes IndexedDB : avec un
 * coffre de ~1000 objets, plus de 2000 souscriptions Dexie. Ici une seule
 * requête sert tout l'arbre.
 */
interface ItemDefsValue {
  defs: Map<number, InventoryItemDefinition>;
  /** Icônes détourées (PNG) par hash d'objet — 94 % du manifeste en a une */
  iconDefs: Map<number, IconDefinition>;
  constants?: ItemConstantsDefinition;
  /** Icône de l'ornement équipé, par itemInstanceId (si l'option est active) */
  ornamentIcons: Map<string, string>;
  /** Armature d'arme et archétype d'armure, par itemInstanceId — pour le tri */
  traits: Map<string, ItemSortTraits>;
  /** false tant que la requête groupée n'a pas abouti */
  ready: boolean;
}

const EMPTY: ItemDefsValue = {
  defs: new Map(),
  iconDefs: new Map(),
  ornamentIcons: new Map(),
  traits: new Map(),
  ready: false,
};

const ItemDefsContext = createContext<ItemDefsValue>(EMPTY);

// Réglage « montrer l'apparence d'origine au survol ». Il vit dans son propre
// contexte plutôt que dans la valeur ci-dessus : rangé là, le basculer ferait
// rejouer toute la requête groupée du manifeste, alors qu'il ne change qu'un
// calque CSS. Il ne passe pas non plus par une lecture du store dans chaque
// vignette — ce serait un millier de souscriptions pour un booléen.
const OriginalOnHoverContext = createContext(false);

/** Vrai si les vignettes ornementées doivent révéler l'icône de base au survol. */
export function useOriginalOnHover(): boolean {
  return useContext(OriginalOnHoverContext);
}

export interface ItemRef {
  itemHash: number;
  itemInstanceId?: string;
}

/**
 * Icônes détourées d'un lot de définitions, **indexées par hash d'objet**.
 *
 * Deux lectures et non une : `DestinyIconDefinition` a ses propres hashes, et
 * c'est `displayProperties.iconHash` qui y renvoie. Chercher au hash de l'objet
 * — ce que faisait cette lecture — trouvait la bonne ligne par coïncidence dans
 * 62 % des cas et rien du tout dans les autres, qui retombaient silencieusement
 * sur le JPEG à fond de rareté incrusté. Voir `lib/destiny/icons.ts`.
 *
 * L'indexation de sortie reste le hash de l'objet : c'est ce que les appelants
 * connaissent (`useSharedIconDefinition`).
 */
async function loadIconDefs(
  defs: ReadonlyMap<number, InventoryItemDefinition>,
): Promise<Map<number, IconDefinition>> {
  const iconHashes = new Map<number, number>(); // hash d'objet → hash d'icône
  for (const [hash, def] of defs) {
    const iconHash = def.displayProperties?.iconHash;
    if (iconHash) iconHashes.set(hash, iconHash);
  }

  const list = [...new Set(iconHashes.values())];
  if (list.length === 0) return new Map();

  const rows = await manifestDb.definitions.bulkGet(
    list.map((hash) => ["DestinyIconDefinition", hash] as [string, number]),
  );
  const byIconHash = new Map<number, IconDefinition>();
  rows.forEach((row, i) => {
    if (row) byIconHash.set(list[i], row.data as IconDefinition);
  });

  const out = new Map<number, IconDefinition>();
  for (const [hash, iconHash] of iconHashes) {
    const iconDef = byIconHash.get(iconHash);
    if (iconDef) out.set(hash, iconDef);
  }
  return out;
}

export function ItemDefsProvider({
  items,
  details,
  withOrnaments,
  withOriginalOnHover = false,
  children,
}: {
  /** Tous les objets susceptibles d'être affichés dans cet arbre */
  items: ItemRef[];
  /** Sockets de chaque objet, pour retrouver l'ornement équipé */
  details: Record<string, ItemDetail>;
  /** Résoudre les ornements (coûte une lecture supplémentaire) */
  withOrnaments: boolean;
  /** Révéler l'apparence d'origine des armures ornementées au survol */
  withOriginalOnHover?: boolean;
  children: ReactNode;
}) {
  const value = useLiveQuery(
    async () => {
      // 1. Définitions des objets, puis leurs icônes détourées — dans cet
      //    ordre : c'est la définition qui porte le renvoi vers la table des
      //    icônes (voir `loadIconDefs`).
      const hashes = [...new Set(items.map((item) => item.itemHash))];
      const [rows, constantsRow] = await Promise.all([
        manifestDb.definitions.bulkGet(
          hashes.map(
            (hash) =>
              ["DestinyInventoryItemDefinition", hash] as [string, number],
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

      const iconDefs = await loadIconDefs(defs);

      const constants = constantsRow?.data as
        | ItemConstantsDefinition
        | undefined;

      // 1 bis. Armature et archétype, servant au tri du coffre. Les définitions
      //        des objets sont nécessaires pour savoir quels sockets lire, d'où
      //        cette seconde étape.
      const traits = await loadSortTraits(items, details, defs);

      if (!withOrnaments) {
        return {
          defs,
          iconDefs,
          constants,
          ornamentIcons: new Map(),
          traits,
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

      // 3. Une seconde lecture groupée : définitions de ces plugs, puis leurs
      //    icônes détourées. Les ornements en profitent autant que les objets :
      //    4 828 d'entre eux ont un PNG détouré, dont 2 385 introuvables au
      //    hash du plug.
      const plugList = [...plugHashes];
      const plugRows = await manifestDb.definitions.bulkGet(
        plugList.map(
          (hash) =>
            ["DestinyInventoryItemDefinition", hash] as [string, number],
        ),
      );
      const plugDefs = new Map<number, InventoryItemDefinition>();
      plugList.forEach((hash, i) => {
        if (plugRows[i]) {
          plugDefs.set(hash, plugRows[i]!.data as InventoryItemDefinition);
        }
      });
      const plugIcons = await loadIconDefs(plugDefs);

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

      return { defs, iconDefs, constants, ornamentIcons, traits, ready: true };
    },
    [items, details, withOrnaments],
    EMPTY,
  );

  return (
    <ItemDefsContext.Provider value={value ?? EMPTY}>
      <OriginalOnHoverContext.Provider
        value={withOrnaments && withOriginalOnHover}
      >
        {children}
      </OriginalOnHoverContext.Provider>
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
