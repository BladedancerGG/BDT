// Interprétation des termes d'une requête : ce que « is:exotic » ou
// « stat:range:>=80 » demandent réellement aux données du jeu.
//
// Module pur, comme `sort.ts` et `grouping.ts` : il reçoit des définitions déjà
// résolues et renvoie un prédicat. Aucun accès au manifeste ni au DOM, donc
// vérifiable avec la recette « compiler puis exécuter » de CLAUDE.md.
//
// Le vocabulaire est celui de Destiny Item Manager, moins ce qui lui est propre
// (étiquettes, listes de souhaits, notes) et n'a pas d'équivalent ici.

import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import type { ItemPlace } from "@/lib/destiny/moves";
import { BUCKET } from "@/lib/destiny/buckets";
import { ITEM_TYPE, BUCKET as DISPLAY_BUCKET } from "@/lib/destiny/display";
import { ITEM_STATE } from "@/lib/destiny/overlays";
import type { QueryNode } from "./query";
import type { SearchIndexEntry } from "./index-build";
import {
  AMMO_KEYWORDS,
  ARMOR_STAT_HASHES,
  CLASS_KEYWORDS,
  DAMAGE_KEYWORDS,
  STAT_KEYWORDS,
  STAT_TOTAL,
  SUBTYPE_KEYWORDS,
  TIER_KEYWORDS,
  normalizeKeyword,
  normalizeText,
} from "./keywords";

// —— Ce que la recherche voit d'un objet ————————————————————————

export interface SearchItem {
  item: DestinyItemComponent;
  def?: InventoryItemDefinition;
  detail?: ItemDetail;
  /** Noms des plugs équipés et écarts des mods — voir `index-build.ts` */
  entry?: SearchIndexEntry;
  place: ItemPlace;
  /** Nom de l'objet, normalisé une fois pour toutes */
  name: string;
  /** Type affiché (« Revolver »), normalisé */
  typeName: string;
  /** Description, normalisée */
  description: string;
}

export interface SearchContext {
  /** Personnage affiché, cible de `is:incurrentchar` */
  currentCharacterId: string | null;
  /** Hashes présents en plusieurs exemplaires, pour `is:dupe` */
  dupeHashes: ReadonlySet<number>;
}

export type SearchPredicate = (item: SearchItem) => boolean;

// —— Lectures élémentaires ————————————————————————————————————

/**
 * Élément d'un objet.
 *
 * L'instance prime (une arme la porte), la définition sert de repli, et les
 * doctrines terminent sur `talentGrid.hudDamageType` — leur `defaultDamageType`
 * vaut toujours 0.
 */
function damageTypeOf(item: SearchItem): number | undefined {
  return (
    item.detail?.instance?.damageType ||
    item.def?.defaultDamageType ||
    item.def?.talentGrid?.hudDamageType ||
    undefined
  );
}

/** Emplacement d'origine — au coffre, `item.bucketHash` vaut « Coffre » pour tous. */
function homeBucketOf(item: SearchItem): number {
  return item.def?.inventory?.bucketTypeHash ?? 0;
}

function hasState(item: SearchItem, flag: number): boolean {
  return ((item.item.state ?? 0) & flag) !== 0;
}

/**
 * Statistique totale : celle que l'API renvoie pour l'instance, mods et pièce
 * maîtresse déjà appliqués.
 */
function totalStat(item: SearchItem, statHash: number): number | undefined {
  return item.detail?.stats?.[String(statHash)];
}

/**
 * Statistique de base : la valeur **avant les sockets de mods** — mods, pièce
 * maîtresse et ajustage compris (voir `index-build.ts`).
 */
function baseStat(item: SearchItem, statHash: number): number | undefined {
  const total = totalStat(item, statHash);
  if (total === undefined) return undefined;
  return total - (item.entry?.modStats.get(statHash) ?? 0);
}

function sumStats(
  item: SearchItem,
  read: (item: SearchItem, hash: number) => number | undefined,
): number | undefined {
  let sum = 0;
  let found = false;
  for (const hash of ARMOR_STAT_HASHES) {
    const value = read(item, hash);
    if (value === undefined) continue;
    found = true;
    sum += value;
  }
  return found ? sum : undefined;
}

// —— Comparaisons numériques ————————————————————————————————————

type NumberTest = (value: number) => boolean;

/**
 * Analyse `>=80`, `<40`, `=30`, `30`, `!=0`…
 *
 * Renvoie `null` pour une saisie incomplète (`>=`, `abc`) : l'appelant signale
 * alors une requête invalide plutôt que de filtrer sur une valeur inventée.
 */
export function parseComparison(raw: string): NumberTest | null {
  const match = /^(>=|<=|!=|=|>|<)?(\d+(?:\.\d+)?)$/.exec(normalizeKeyword(raw));
  if (!match) return null;

  const [, operator = "=", digits] = match;
  const bound = Number(digits);

  switch (operator) {
    case ">":
      return (value) => value > bound;
    case ">=":
      return (value) => value >= bound;
    case "<":
      return (value) => value < bound;
    case "<=":
      return (value) => value <= bound;
    case "!=":
      return (value) => value !== bound;
    default:
      return (value) => value === bound;
  }
}

/** Applique un test numérique à une valeur qui peut être absente. */
function testNumber(
  value: number | undefined,
  test: NumberTest,
): boolean {
  return value !== undefined && test(value);
}

// —— Filtres `is:` ————————————————————————————————————————————
//
// Ceux qui ne se réduisent pas à une table de valeurs : place de l'objet,
// drapeaux d'état, grandes familles.

const IS_PREDICATES: Readonly<
  Record<string, (item: SearchItem, ctx: SearchContext) => boolean>
> = {
  // —— Familles ——
  weapon: (i) => i.def?.itemType === ITEM_TYPE.Weapon,
  arme: (i) => i.def?.itemType === ITEM_TYPE.Weapon,
  armor: (i) => i.def?.itemType === ITEM_TYPE.Armor,
  armure: (i) => i.def?.itemType === ITEM_TYPE.Armor,
  subclass: (i) => i.def?.itemType === ITEM_TYPE.Subclass,
  doctrine: (i) => i.def?.itemType === ITEM_TYPE.Subclass,
  artifact: (i) => homeBucketOf(i) === DISPLAY_BUCKET.Artifact,
  artefact: (i) => homeBucketOf(i) === DISPLAY_BUCKET.Artifact,

  // —— Emplacement d'arme (à ne pas confondre avec le type de dégâts) ——
  kineticslot: (i) => homeBucketOf(i) === BUCKET.KineticWeapons,
  energyslot: (i) => homeBucketOf(i) === BUCKET.EnergyWeapons,
  powerslot: (i) => homeBucketOf(i) === BUCKET.PowerWeapons,

  // —— Drapeaux d'état ——
  masterwork: (i) => hasState(i, ITEM_STATE.Masterwork),
  crafted: (i) => hasState(i, ITEM_STATE.Crafted),
  faconnee: (i) => hasState(i, ITEM_STATE.Crafted),
  enhanced: (i) => hasState(i, ITEM_STATE.Enhanced),
  amelioree: (i) => hasState(i, ITEM_STATE.Enhanced),
  locked: (i) => hasState(i, ITEM_STATE.Locked),
  verrouille: (i) => hasState(i, ITEM_STATE.Locked),
  featured: (i) => i.def?.isFeaturedItem === true,
  holofoil: (i) => i.def?.isHolofoil === true,
  transferable: (i) => i.def?.nonTransferrable !== true,
  equippable: (i) => i.def?.equippable === true,

  // —— Où se trouve l'objet ——
  equipped: (i) => i.place.kind === "equipped",
  equipe: (i) => i.place.kind === "equipped",
  invault: (i) => i.place.kind === "vault",
  aucoffre: (i) => i.place.kind === "vault",
  postmaster: (i) => i.place.kind === "postmaster",
  objetsperdus: (i) => i.place.kind === "postmaster",
  incurrentchar: (i, ctx) =>
    ctx.currentCharacterId !== null &&
    i.place.kind !== "vault" &&
    i.place.characterId === ctx.currentCharacterId,

  // —— Doublons ——
  dupe: (i, ctx) => ctx.dupeHashes.has(i.item.itemHash),
  doublon: (i, ctx) => ctx.dupeHashes.has(i.item.itemHash),
};

/** `is:tier1` … `is:tier5` — palier d'équipement de l'instance. */
const GEAR_TIER_PATTERN = /^tier([1-5])$/;

function compileIs(
  value: string,
  ctx: SearchContext,
): SearchPredicate | null {
  const keyword = normalizeKeyword(value);
  if (!keyword) return null;

  const damage = DAMAGE_KEYWORDS[keyword];
  if (damage !== undefined) return (item) => damageTypeOf(item) === damage;

  const tier = TIER_KEYWORDS[keyword];
  if (tier !== undefined)
    return (item) => item.def?.inventory?.tierType === tier;

  const classType = CLASS_KEYWORDS[keyword];
  if (classType !== undefined)
    return (item) => item.def?.classType === classType;

  const ammo = AMMO_KEYWORDS[keyword];
  if (ammo !== undefined)
    return (item) => item.def?.equippingBlock?.ammoType === ammo;

  const subType = SUBTYPE_KEYWORDS[keyword];
  if (subType !== undefined) return (item) => item.def?.itemSubType === subType;

  const gearTier = GEAR_TIER_PATTERN.exec(keyword);
  if (gearTier) {
    const wanted = Number(gearTier[1]);
    return (item) => item.detail?.instance?.gearTier === wanted;
  }

  const predicate = IS_PREDICATES[keyword];
  if (predicate) return (item) => predicate(item, ctx);

  return null;
}

// —— Compilation d'un terme ————————————————————————————————————

/** Recherche libre : nom de l'objet, type affiché, noms des plugs équipés. */
function freeText(raw: string): SearchPredicate {
  const needle = normalizeText(raw);
  return (item) =>
    item.name.includes(needle) ||
    item.typeName.includes(needle) ||
    (item.entry?.plugNames.some((name) => name.includes(needle)) ?? false);
}

function textField(
  raw: string,
  read: (item: SearchItem) => string | undefined,
): SearchPredicate {
  const needle = normalizeText(raw);
  return (item) => read(item)?.includes(needle) ?? false;
}

/** Résout `stat:<nom>` : un hash, ou le total des six statistiques d'armure. */
function statSelector(
  name: string,
): { hash: number } | { total: true } | null {
  const keyword = normalizeKeyword(name);
  if (keyword === STAT_TOTAL) return { total: true };
  const hash = STAT_KEYWORDS[keyword];
  return hash === undefined ? null : { hash };
}

function compileStat(
  name: string,
  comparison: string,
  read: (item: SearchItem, hash: number) => number | undefined,
): SearchPredicate | null {
  const selector = statSelector(name);
  const test = parseComparison(comparison);
  if (!selector || !test) return null;

  if ("total" in selector) {
    return (item) => testNumber(sumStats(item, read), test);
  }
  return (item) => testNumber(read(item, selector.hash), test);
}

/**
 * Traduit un terme en prédicat, ou `null` si le mot-clé est inconnu ou son
 * argument invalide — auquel cas la requête entière est déclarée fautive.
 */
function compileTerm(
  parts: string[],
  ctx: SearchContext,
): SearchPredicate | null {
  // Un terme nu : recherche libre
  if (parts.length === 1) {
    return parts[0] ? freeText(parts[0]) : null;
  }

  const keyword = normalizeKeyword(parts[0]);
  const value = parts[1] ?? "";
  const extra = parts[2] ?? "";

  switch (keyword) {
    case "is":
      return compileIs(value, ctx);

    case "not": {
      // `not:exotic` est la négation de `is:exotic` — la forme de DIM
      const inner = compileIs(value, ctx);
      return inner ? (item) => !inner(item) : null;
    }

    case "name":
    case "nom":
      return value ? textField(value, (item) => item.name) : null;

    case "type":
      return value ? textField(value, (item) => item.typeName) : null;

    case "description":
    case "desc":
      return value ? textField(value, (item) => item.description) : null;

    case "perkname":
    case "perk":
    case "attribut": {
      if (!value) return null;
      const needle = normalizeText(value);
      return (item) =>
        item.entry?.plugNames.some((name) => name.includes(needle)) ?? false;
    }

    case "id": {
      // Identifiant d'instance : égalité stricte, jamais une sous-chaîne
      const wanted = value.trim();
      if (!/^\d+$/.test(wanted)) return null;
      return (item) => item.item.itemInstanceId === wanted;
    }

    case "hash": {
      const wanted = Number(value);
      if (!Number.isInteger(wanted) || wanted <= 0) return null;
      return (item) => item.item.itemHash === wanted;
    }

    case "power":
    case "light":
    case "puissance": {
      const test = parseComparison(value);
      return test
        ? (item) =>
            testNumber(item.detail?.instance?.primaryStat?.value, test)
        : null;
    }

    case "energy":
    case "energie": {
      const test = parseComparison(value);
      return test
        ? (item) =>
            testNumber(item.detail?.instance?.energy?.energyCapacity, test)
        : null;
    }

    case "tier":
    case "palier": {
      const test = parseComparison(value);
      return test
        ? (item) => testNumber(item.detail?.instance?.gearTier, test)
        : null;
    }

    case "stat":
      return compileStat(value, extra, totalStat);

    case "basestat":
      return compileStat(value, extra, baseStat);

    default:
      return null;
  }
}

// —— Compilation de l'arbre ————————————————————————————————————

export interface CompiledQuery {
  predicate: SearchPredicate | null;
  /** Clés de traduction (`search.error.*`) ; non vide ⇒ ne pas filtrer */
  errors: string[];
}

/**
 * Transforme l'arbre en prédicat.
 *
 * Un seul terme incompréhensible suffit à invalider la requête : filtrer sur
 * ce qu'on a compris donnerait un résultat faux sans le dire, et l'écran se
 * viderait à chaque lettre tapée.
 */
export function compileQuery(
  node: QueryNode | null,
  context: SearchContext,
): CompiledQuery {
  if (!node) return { predicate: null, errors: [] };

  const errors: string[] = [];

  const walk = (current: QueryNode): SearchPredicate => {
    switch (current.kind) {
      case "and": {
        const children = current.nodes.map(walk);
        return (item) => children.every((test) => test(item));
      }
      case "or": {
        const children = current.nodes.map(walk);
        return (item) => children.some((test) => test(item));
      }
      case "not": {
        const child = walk(current.node);
        return (item) => !child(item);
      }
      case "term": {
        const compiled = compileTerm(current.parts, context);
        if (compiled) return compiled;
        errors.push("unknownFilter");
        return () => false;
      }
    }
  };

  const predicate = walk(node);
  return errors.length > 0
    ? { predicate: null, errors }
    : { predicate, errors };
}

/**
 * La requête a-t-elle besoin de l'index des plugs (noms, écarts de mods) ?
 *
 * Construire cet index coûte quelques milliers de définitions : autant ne le
 * faire que pour les requêtes qui le lisent réellement.
 */
export function queryNeedsIndex(node: QueryNode | null): boolean {
  if (!node) return false;

  switch (node.kind) {
    case "and":
    case "or":
      return node.nodes.some(queryNeedsIndex);
    case "not":
      return queryNeedsIndex(node.node);
    case "term": {
      if (node.parts.length === 1) return true; // recherche libre
      const keyword = normalizeKeyword(node.parts[0]);
      return (
        keyword === "perkname" ||
        keyword === "perk" ||
        keyword === "attribut" ||
        keyword === "basestat"
      );
    }
  }
}
