"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ProfileData } from "@/lib/bungie/use-profile";
import type { ItemPlace } from "@/lib/destiny/moves";
import { BUCKET } from "@/lib/destiny/buckets";
import { useItemDefs } from "@/lib/destiny/item-defs";
import { useSettings, type SearchMissMode } from "@/lib/settings/store";
import { parseQuery } from "./query";
import { normalizeText } from "./keywords";
import {
  compileQuery,
  queryNeedsIndex,
  type SearchItem,
} from "./filters";
import { buildSearchIndex, EMPTY_INDEX, type SearchIndex } from "./index-build";
import { useSearchStore } from "./store";

/**
 * Résultat de la recherche, mis à disposition de toute la vue d'inventaire.
 *
 * `matched` vaut `null` quand il n'y a rien à filtrer : requête vide, requête
 * fautive, ou index de plugs pas encore chargé. Dans ces trois cas l'affichage
 * est celui de d'habitude — mieux vaut ne rien masquer que masquer à tort.
 */
interface SearchValue {
  matched: ReadonlySet<string> | null;
  missMode: SearchMissMode;
  /** Compte des objets trouvés, `null` quand aucune recherche n'est appliquée */
  counts: SearchCounts | null;
}

export interface SearchCounts {
  total: number;
  /**
   * Objets trouvés **sur** un personnage, par `characterId` : équipés,
   * inventaire et objets perdus. C'est ce que l'onglet du personnage annonce.
   */
  byCharacter: ReadonlyMap<string, number>;
}

const INACTIVE: SearchValue = {
  matched: null,
  missMode: "hide",
  counts: null,
};

const SearchContext = createContext<SearchValue>(INACTIVE);

/**
 * Clé d'un objet dans l'ensemble des résultats.
 *
 * L'identifiant d'instance suffit presque toujours ; les rares objets non
 * instanciés (consommables d'un emplacement affiché) n'en ont pas, d'où le
 * repli sur leur hash, préfixé pour ne pas entrer en collision.
 */
export function matchKey(
  itemHash: number,
  itemInstanceId: string | undefined,
): string {
  return itemInstanceId ?? `h${itemHash}`;
}

/** Délai avant qu'une frappe ne devienne une recherche appliquée. */
const DEBOUNCE_MS = 180;

export function SearchProvider({
  data,
  currentCharacterId,
  children,
}: {
  data: ProfileData;
  currentCharacterId: string | null;
  children: ReactNode;
}) {
  const query = useSearchStore((s) => s.query);
  const missMode = useSettings((s) => s.searchMissMode);
  const { defs, ready } = useItemDefs();

  // La requête n'est appliquée qu'une fois la frappe retombée : chaque
  // application relit un millier d'objets et re-rend toutes les vignettes.
  const [applied, setApplied] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setApplied(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const parsed = useMemo(() => parseQuery(applied), [applied]);

  // Tous les objets du profil, avec leur place — la recherche porte aussi bien
  // sur le coffre que sur les personnages.
  const located = useMemo(() => {
    const out: { item: DestinyItemComponent; place: ItemPlace }[] = [];

    for (const [characterId, items] of Object.entries(data.equipment)) {
      for (const item of items) {
        out.push({ item, place: { kind: "equipped", characterId } });
      }
    }
    for (const [characterId, items] of Object.entries(data.inventory)) {
      for (const item of items) {
        out.push({
          item,
          place:
            item.bucketHash === BUCKET.Postmaster
              ? { kind: "postmaster", characterId }
              : { kind: "inventory", characterId },
        });
      }
    }
    for (const item of data.vault) {
      out.push({ item, place: { kind: "vault" } });
    }

    return out;
  }, [data]);

  // L'index des plugs coûte quelques milliers de définitions : il n'est
  // construit que pour les requêtes qui le lisent (texte libre, `perkname:`,
  // `basestat:`). `undefined` signale qu'il est encore en route.
  const needsIndex = queryNeedsIndex(parsed.node);
  const index = useLiveQuery(
    async (): Promise<SearchIndex> => {
      if (!needsIndex || !ready) return EMPTY_INDEX;
      return buildSearchIndex(
        located.map((entry) => entry.item),
        data.items,
        defs,
      );
    },
    [needsIndex, ready, located, data.items, defs],
  );

  const value = useMemo<SearchValue>(() => {
    if (!parsed.node || parsed.errors.length > 0 || !ready) {
      return { matched: null, missMode, counts: null };
    }
    if (needsIndex && index === undefined) {
      return { matched: null, missMode, counts: null };
    }

    // Exemplaires possédés, par hash : `is:dupe` et `count:` s'y lisent tous
    // les deux — le premier n'est que « plus d'un ».
    const copies = new Map<number, number>();
    for (const { item } of located) {
      copies.set(item.itemHash, (copies.get(item.itemHash) ?? 0) + 1);
    }

    const { predicate } = compileQuery(parsed.node, {
      currentCharacterId,
      currentCharacterClass:
        data.characters.find(
          (character) => character.characterId === currentCharacterId,
        )?.classType ?? null,
      copies,
    });
    if (!predicate) return { matched: null, missMode, counts: null };

    const resolved = index ?? EMPTY_INDEX;
    const matched = new Set<string>();
    const byCharacter = new Map<string, number>();

    for (const { item, place } of located) {
      const def = defs.get(item.itemHash);
      const searchItem: SearchItem = {
        item,
        def,
        detail: item.itemInstanceId ? data.items[item.itemInstanceId] : undefined,
        entry: item.itemInstanceId
          ? resolved.get(item.itemInstanceId)
          : undefined,
        place,
        name: normalizeText(def?.displayProperties?.name ?? ""),
        typeName: normalizeText(def?.itemTypeDisplayName ?? ""),
        description: normalizeText(def?.displayProperties?.description ?? ""),
      };

      if (predicate(searchItem)) {
        matched.add(matchKey(item.itemHash, item.itemInstanceId));
        if (place.kind !== "vault") {
          byCharacter.set(
            place.characterId,
            (byCharacter.get(place.characterId) ?? 0) + 1,
          );
        }
      }
    }

    // `matched` dédoublonne par clé ; le total compte les objets, et un objet
    // non instancié partage sa clé avec ses semblables. La taille de l'ensemble
    // est donc la bonne mesure de « ce qui est affiché ».
    return { matched, missMode, counts: { total: matched.size, byCharacter } };
  }, [
    parsed,
    needsIndex,
    index,
    located,
    defs,
    data.items,
    data.characters,
    currentCharacterId,
    missMode,
    ready,
  ]);

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

function useSearch(): SearchValue {
  return useContext(SearchContext);
}

/**
 * L'objet est-il écarté par la recherche en cours ?
 *
 * Sert à l'estompage : une vignette d'inventaire ou d'équipement ne disparaît
 * jamais, elle pâlit.
 */
export function useSearchMiss(
  itemHash: number,
  itemInstanceId: string | undefined,
): boolean {
  const { matched } = useSearch();
  return matched !== null && !matched.has(matchKey(itemHash, itemInstanceId));
}

/**
 * Objets à afficher dans le coffre et les objets perdus.
 *
 * Selon le réglage, les objets écartés disparaissent de la liste ou y restent
 * pour n'être qu'estompés (c'est alors `useSearchMiss` qui s'en charge).
 */
export function useSearchFiltered<T extends DestinyItemComponent>(
  items: T[],
): T[] {
  const { matched, missMode } = useSearch();

  return useMemo(() => {
    if (matched === null || missMode !== "hide") return items;
    return items.filter((item) =>
      matched.has(matchKey(item.itemHash, item.itemInstanceId)),
    );
  }, [items, matched, missMode]);
}

/** Ensemble brut des objets trouvés — pour les actions de masse. */
export function useSearchMatches(): ReadonlySet<string> | null {
  return useSearch().matched;
}

/** Compte des objets trouvés, au total et par personnage. */
export function useSearchCounts(): SearchCounts | null {
  return useSearch().counts;
}
