// Interprétation des termes d'une requête : ce que « is:exotic » ou
// « stat:range:>=80 » demandent réellement aux données du jeu.
//
// Module pur, comme `sort.ts` et `grouping.ts` : il reçoit des définitions déjà
// résolues et renvoie un prédicat. Aucun accès au manifeste ni au DOM, donc
// vérifiable avec la recette « compiler puis exécuter » de CLAUDE.md.
//
// Le vocabulaire est celui de Destiny Item Manager, moins ce qui lui est propre
// (étiquettes, listes de souhaits, notes) et n'a pas d'équivalent ici. En sont
// également absents les filtres dont l'application ne charge pas la donnée :
// `source:`, `season:`, `year:` (il faudrait la table des filigranes de saison,
// tenue à la main chez DIM), `catalyst:`, `is:craftable` et `is:patternunlocked`
// (les enregistrements du compte), `is:vendor`, `maxstat*` et `is:maxpower`
// (l'optimiseur d'équipement). `is:adept` manque pour une autre raison : rien
// dans le manifeste ne distingue une arme adepte autrement que par son nom, qui
// est traduit — le manifeste étant téléchargé dans la langue du joueur, un test
// sur « (Adept) » ne marcherait qu'en anglais.

import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import type { InventoryItemDefinition } from "@/lib/destiny/types";
import type { ItemPlace } from "@/lib/destiny/moves";
import { BUCKET } from "@/lib/destiny/buckets";
import { ITEM_TYPE, BUCKET as DISPLAY_BUCKET } from "@/lib/destiny/display";
import { ITEM_STATE } from "@/lib/destiny/overlays";
import type { QueryNode } from "./query";
import type { SearchIndexEntry } from "./index-build";
import { SEARCH_FLAG } from "./flags";
import {
  AMMO_KEYWORDS,
  ARMOR_STAT_HASHES,
  BREAKER_KEYWORDS,
  CLASS_KEYWORDS,
  DAMAGE_FAMILIES,
  DAMAGE_KEYWORDS,
  FOUNDRY_KEYWORDS,
  FOUNDRY_PREFIX,
  STAT_ANY,
  STAT_KEYWORDS,
  STAT_RANK_KEYWORDS,
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
  /** Sa classe, cible de `is:onwrongclass` */
  currentCharacterClass: number | null;
  /** Exemplaires possédés par hash, pour `is:dupe` et `count:` */
  copies: ReadonlyMap<number, number>;
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

/** L'index porte-t-il ce drapeau pour l'objet ? — voir SEARCH_FLAG. */
function hasFlag(item: SearchItem, flag: number): boolean {
  return ((item.entry?.flags ?? 0) & flag) !== 0;
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

type StatReader = (item: SearchItem, hash: number) => number | undefined;

function sumStats(
  item: SearchItem,
  hashes: readonly number[],
  read: StatReader,
): number | undefined {
  let sum = 0;
  let found = false;
  for (const hash of hashes) {
    const value = read(item, hash);
    if (value === undefined) continue;
    found = true;
    sum += value;
  }
  return found ? sum : undefined;
}

/**
 * Les six statistiques d'armure, de la meilleure à la moins bonne.
 *
 * C'est le classement que lisent `stat:highest`, `primarystat:` et leurs
 * variantes : le jeu présente lui-même l'armure ainsi (statistique principale,
 * secondaire, tertiaire).
 */
function rankedArmorStats(item: SearchItem, read: StatReader): number[] {
  return ARMOR_STAT_HASHES.map((hash) => read(item, hash) ?? 0).sort(
    (a, b) => b - a,
  );
}

/**
 * Rang (1 = la meilleure) d'une statistique parmi les six d'armure.
 *
 * Deux statistiques à égalité partagent le meilleur des deux rangs : sur une
 * armure dont les deux plus hautes valent 25, les deux répondent à
 * `primarystat:`. C'est le seul départage honnête — rien dans les données ne
 * dit laquelle des deux le jeu considère comme principale.
 */
function armorStatRank(
  item: SearchItem,
  statHash: number,
  read: StatReader,
): number | undefined {
  const value = read(item, statHash);
  if (value === undefined) return undefined;
  const ranked = rankedArmorStats(item, read);
  const rank = ranked.indexOf(value);
  return rank === -1 ? undefined : rank + 1;
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

/** Filtre numérique complet : `power:>=2000`, `kills:>1000`… */
function compileNumber(
  comparison: string,
  read: (item: SearchItem) => number | undefined,
): SearchPredicate | null {
  const test = parseComparison(comparison);
  return test ? (item) => testNumber(read(item), test) : null;
}

// —— Filtres `is:` ————————————————————————————————————————————
//
// Ceux qui ne se réduisent pas à une table de valeurs : place de l'objet,
// drapeaux d'état, grandes familles.

/**
 * Types d'objets purement décoratifs — `is:cosmetic`.
 *
 * L'application ne les affiche pas (voir DISPLAYED_ITEM_TYPES), mais le filtre
 * garde son sens : il sert à les exclure d'une requête plus large.
 */
const COSMETIC_ITEM_TYPES: ReadonlySet<number> = new Set([
  ITEM_TYPE.Emblem,
  ITEM_TYPE.Ship,
  ITEM_TYPE.Vehicle,
  ITEM_TYPE.Ghost,
]);

const IS_PREDICATES: Readonly<
  Record<string, (item: SearchItem, ctx: SearchContext) => boolean>
> = {
  // —— Familles ——
  weapon: (i) => i.def?.itemType === ITEM_TYPE.Weapon,
  armor: (i) => i.def?.itemType === ITEM_TYPE.Armor,
  subclass: (i) => i.def?.itemType === ITEM_TYPE.Subclass,
  artifact: (i) => homeBucketOf(i) === DISPLAY_BUCKET.Artifact,
  seasonalartifacts: (i) => homeBucketOf(i) === DISPLAY_BUCKET.Artifact,
  ghost: (i) => i.def?.itemType === ITEM_TYPE.Ghost,
  emblems: (i) => i.def?.itemType === ITEM_TYPE.Emblem,
  ships: (i) => i.def?.itemType === ITEM_TYPE.Ship,
  vehicle: (i) => i.def?.itemType === ITEM_TYPE.Vehicle,
  cosmetic: (i) =>
    i.def !== undefined && COSMETIC_ITEM_TYPES.has(i.def.itemType),

  // —— Emplacement d'arme (à ne pas confondre avec le type de dégâts) ——
  kineticslot: (i) => homeBucketOf(i) === BUCKET.KineticWeapons,
  energyslot: (i) => homeBucketOf(i) === BUCKET.EnergyWeapons,
  powerslot: (i) => homeBucketOf(i) === BUCKET.PowerWeapons,
  // Les formes courtes de DIM. `is:energy` désigne bien l'emplacement, pas
  // l'énergie d'une armure — celle-ci se demande avec `energy:`.
  energy: (i) => homeBucketOf(i) === BUCKET.EnergyWeapons,
  power: (i) => homeBucketOf(i) === BUCKET.PowerWeapons,

  // —— Drapeaux d'état ——
  masterwork: (i) => hasState(i, ITEM_STATE.Masterwork),
  crafted: (i) => hasState(i, ITEM_STATE.Crafted),
  shaped: (i) => hasState(i, ITEM_STATE.Crafted),
  enhanced: (i) => hasState(i, ITEM_STATE.Enhanced),
  locked: (i) => hasState(i, ITEM_STATE.Locked),
  unlocked: (i) => !hasState(i, ITEM_STATE.Locked),
  featured: (i) => i.def?.isFeaturedItem === true,
  holofoil: (i) => i.def?.isHolofoil === true,
  shiny: (i) => i.def?.isHolofoil === true,
  transferable: (i) => i.def?.nonTransferrable !== true,
  movable: (i) => i.def?.nonTransferrable !== true,
  equippable: (i) => i.def?.equippable === true,
  equipment: (i) => i.def?.equippable === true,

  // —— Où se trouve l'objet ——
  equipped: (i) => i.place.kind === "equipped",
  invault: (i) => i.place.kind === "vault",
  postmaster: (i) => i.place.kind === "postmaster",
  inpostmaster: (i) => i.place.kind === "postmaster",
  incurrentchar: (i, ctx) =>
    ctx.currentCharacterId !== null &&
    i.place.kind !== "vault" &&
    i.place.characterId === ctx.currentCharacterId,

  /**
   * Objet réservé à une autre classe que celle affichée.
   *
   * `classType: 3` signifie « aucune restriction » : ces objets ne sont sur la
   * mauvaise classe de personne.
   */
  onwrongclass: (i, ctx) =>
    ctx.currentCharacterClass !== null &&
    i.def?.classType !== undefined &&
    i.def.classType !== 3 &&
    i.def.classType !== ctx.currentCharacterClass,

  // —— Doublons ——
  dupe: (i, ctx) => (ctx.copies.get(i.item.itemHash) ?? 0) > 1,

  // —— Ce qui se lit dans les plugs équipés (voir `index-build.ts`) ——
  modded: (i) => hasFlag(i, SEARCH_FLAG.Modded),
  shaded: (i) => hasFlag(i, SEARCH_FLAG.Shaded),
  hasshader: (i) => hasFlag(i, SEARCH_FLAG.Shaded),
  ornamented: (i) => hasFlag(i, SEARCH_FLAG.Ornamented),
  hasornament: (i) => hasFlag(i, SEARCH_FLAG.Ornamented),
  artifice: (i) => hasFlag(i, SEARCH_FLAG.Artifice),
  origintrait: (i) => hasFlag(i, SEARCH_FLAG.OriginTrait),
  deepsight: (i) => hasFlag(i, SEARCH_FLAG.Deepsight),
  armorintrinsic: (i) => hasFlag(i, SEARCH_FLAG.ArmorIntrinsic),
  tuned: (i) => hasFlag(i, SEARCH_FLAG.Tuned),
  tieredweapon: (i) => hasFlag(i, SEARCH_FLAG.Tiered),
  enhanceable: (i) => hasFlag(i, SEARCH_FLAG.Enhanceable),
  hasdisabledmod: (i) => hasFlag(i, SEARCH_FLAG.DisabledMod),
  enhancedperk: (i) => (i.entry?.enhancedPerks ?? 0) > 0,

  /**
   * Générations d'armure : la 3.0 (Edge of Fate) porte un archétype, les
   * précédentes n'en ont pas.
   */
  "armor3.0": (i) => hasFlag(i, SEARCH_FLAG.Armor3),
  "armor2.0": (i) =>
    i.def?.itemType === ITEM_TYPE.Armor && !hasFlag(i, SEARCH_FLAG.Armor3),
};

/**
 * Toutes les valeurs qu'accepte `is:`.
 *
 * Exportée pour l'autocomplétion (`suggestions.ts`) : la liste proposée et
 * celle qui est réellement comprise sont ainsi la même, et un mot-clé ajouté
 * ci-dessus apparaît dans le menu sans qu'on y pense.
 */
export const IS_VALUES: readonly string[] = [
  ...Object.keys(IS_PREDICATES),
  ...Object.keys(DAMAGE_KEYWORDS),
  ...Object.keys(DAMAGE_FAMILIES),
  ...Object.keys(TIER_KEYWORDS),
  ...Object.keys(CLASS_KEYWORDS),
  ...Object.keys(AMMO_KEYWORDS),
  ...Object.keys(SUBTYPE_KEYWORDS),
  "specialgrenadelauncher",
  "heavygrenadelauncher",
  "tier1",
  "tier2",
  "tier3",
  "tier4",
  "tier5",
];

/** `is:` dont la réponse vient de l'index des plugs — voir `queryNeedsIndex`. */
const INDEXED_IS_KEYWORDS: ReadonlySet<string> = new Set([
  "modded",
  "shaded",
  "hasshader",
  "ornamented",
  "hasornament",
  "artifice",
  "origintrait",
  "deepsight",
  "armorintrinsic",
  "tuned",
  "tieredweapon",
  "enhanceable",
  "hasdisabledmod",
  "enhancedperk",
  "armor3.0",
  "armor2.0",
]);

/** `is:tier1` … `is:tier5` — palier d'équipement de l'instance. */
const GEAR_TIER_PATTERN = /^tier([1-5])$/;

/**
 * Lance-grenades, séparés par leur type de munitions.
 *
 * Le sous-type ne les distingue pas : les deux valent 23. C'est l'emplacement
 * de munitions qui fait la différence, et c'est ainsi que le jeu les présente.
 */
const GRENADE_LAUNCHER_SUBTYPE = 23;
const AMMO_SPECIAL = 2;
const AMMO_HEAVY = 3;

function compileIs(
  value: string,
  ctx: SearchContext,
): SearchPredicate | null {
  const keyword = normalizeKeyword(value);
  if (!keyword) return null;

  const damage = DAMAGE_KEYWORDS[keyword];
  if (damage !== undefined) return (item) => damageTypeOf(item) === damage;

  const family = DAMAGE_FAMILIES[keyword];
  if (family !== undefined) {
    const types = new Set(family);
    return (item) => {
      const type = damageTypeOf(item);
      return type !== undefined && types.has(type);
    };
  }

  const tier = TIER_KEYWORDS[keyword];
  if (tier !== undefined)
    return (item) => item.def?.inventory?.tierType === tier;

  const classType = CLASS_KEYWORDS[keyword];
  if (classType !== undefined)
    return (item) => item.def?.classType === classType;

  const ammo = AMMO_KEYWORDS[keyword];
  if (ammo !== undefined)
    return (item) => item.def?.equippingBlock?.ammoType === ammo;

  if (keyword === "specialgrenadelauncher" || keyword === "heavygrenadelauncher") {
    const wanted = keyword === "specialgrenadelauncher" ? AMMO_SPECIAL : AMMO_HEAVY;
    return (item) =>
      item.def?.itemSubType === GRENADE_LAUNCHER_SUBTYPE &&
      item.def?.equippingBlock?.ammoType === wanted;
  }

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

/** `perk:` / `perkname:` — sous-chaîne dans le nom d'un plug équipé. */
function perkText(raw: string): SearchPredicate {
  const needle = normalizeText(raw);
  return (item) =>
    item.entry?.plugNames.some((name) => name.includes(needle)) ?? false;
}

// —— Statistiques ————————————————————————————————————————————
//
// `stat:` et `basestat:` partagent tout sauf la façon de lire une valeur.

type StatSelector =
  /** Une ou plusieurs statistiques nommées, additionnées : `stat:health+melee` */
  | { kind: "hashes"; hashes: number[] }
  /** Le total des six statistiques d'armure */
  | { kind: "total" }
  /** N'importe laquelle des statistiques de l'objet */
  | { kind: "any" }
  /** La n-ième meilleure statistique d'armure */
  | { kind: "rank"; rank: number };

/**
 * Résout ce qui suit `stat:`.
 *
 * L'addition se découpe **avant** la normalisation : celle-ci retire `+` et `&`
 * comme toute autre ponctuation, et `health+melee` deviendrait un mot-clé
 * inconnu.
 */
function statSelector(name: string): StatSelector | null {
  const segments = name.split(/[+&]/).filter((part) => part.trim() !== "");
  if (segments.length === 0) return null;

  if (segments.length === 1) {
    const keyword = normalizeKeyword(segments[0]);
    if (keyword === STAT_TOTAL) return { kind: "total" };
    if (keyword === STAT_ANY) return { kind: "any" };
    const rank = STAT_RANK_KEYWORDS[keyword];
    if (rank !== undefined) return { kind: "rank", rank };
  }

  const hashes: number[] = [];
  for (const segment of segments) {
    const hash = STAT_KEYWORDS[normalizeKeyword(segment)];
    if (hash === undefined) return null;
    hashes.push(hash);
  }
  return { kind: "hashes", hashes };
}

function compileStat(
  name: string,
  comparison: string,
  read: StatReader,
): SearchPredicate | null {
  const selector = statSelector(name);
  const test = parseComparison(comparison);
  if (!selector || !test) return null;

  switch (selector.kind) {
    case "total":
      return (item) => testNumber(sumStats(item, ARMOR_STAT_HASHES, read), test);
    case "hashes":
      return (item) => testNumber(sumStats(item, selector.hashes, read), test);
    case "rank":
      return (item) => {
        const ranked = rankedArmorStats(item, read);
        return testNumber(ranked[selector.rank - 1], test);
      };
    case "any":
      // Toutes les statistiques de l'objet, armes comprises : `stat:any:>=90`
      // doit répondre sur une arme comme sur une armure.
      return (item) =>
        Object.keys(item.detail?.stats ?? {}).some((hash) =>
          testNumber(read(item, Number(hash)), test),
        );
  }
}

/** `primarystat:melee` — la statistique désignée est la n-ième de l'armure. */
function compileStatRank(name: string, rank: number): SearchPredicate | null {
  const hash = STAT_KEYWORDS[normalizeKeyword(name)];
  if (hash === undefined) return null;
  return (item) => armorStatRank(item, hash, baseStat) === rank;
}

/** `tunedstat:` — mod d'ajustage posé, et sur quelle statistique. */
function compileTunedStat(value: string): SearchPredicate | null {
  const keyword = normalizeKeyword(value);

  // « Ajustage équilibré » ne renforce rien en particulier : c'est le seul
  // ajustage posé sans statistique désignée (voir `index-build.ts`).
  if (keyword === "unfocused") {
    return (item) =>
      hasFlag(item, SEARCH_FLAG.Tuned) && item.entry?.tunedStat === undefined;
  }

  const rank = { primary: 1, secondary: 2, tertiary: 3 }[keyword];
  if (rank !== undefined) {
    return (item) => {
      const tuned = item.entry?.tunedStat;
      return (
        tuned !== undefined && armorStatRank(item, tuned, baseStat) === rank
      );
    };
  }

  const hash = STAT_KEYWORDS[keyword];
  if (hash === undefined) return null;
  return (item) => item.entry?.tunedStat === hash;
}

/** `masterwork:range` / `masterwork:any` — statistique de la pièce maîtresse. */
function compileMasterwork(value: string): SearchPredicate | null {
  const keyword = normalizeKeyword(value);
  if (keyword === STAT_ANY) {
    return (item) => hasState(item, ITEM_STATE.Masterwork);
  }
  const hash = STAT_KEYWORDS[keyword];
  if (hash === undefined) return null;
  return (item) => item.entry?.masterworkStats.includes(hash) ?? false;
}

/** `foundry:hakke` / `foundry:any` — l'étiquette `foundry.*` de l'arme. */
function compileFoundry(value: string): SearchPredicate | null {
  const keyword = normalizeKeyword(value);
  if (keyword === STAT_ANY) {
    return (item) =>
      item.def?.traitIds?.some((trait) => trait.startsWith(FOUNDRY_PREFIX)) ??
      false;
  }
  const trait = FOUNDRY_KEYWORDS[keyword];
  if (trait === undefined) return null;
  return (item) => item.def?.traitIds?.includes(trait) ?? false;
}

/** `breaker:overload` / `breaker:any` — voir `breaker.ts`. */
function compileBreaker(value: string): SearchPredicate | null {
  const keyword = normalizeKeyword(value);
  if (keyword === STAT_ANY) return (item) => item.entry?.breaker !== undefined;
  // `breaker:intrinsic` chez DIM : l'effet déclaré par la définition elle-même,
  // le seul qui ne vienne pas de l'armature équipée.
  if (keyword === "intrinsic") return (item) => Boolean(item.def?.breakerType);
  const breaker = BREAKER_KEYWORDS[keyword];
  if (breaker === undefined) return null;
  return (item) => item.entry?.breaker === breaker;
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
      return value ? textField(value, (item) => item.name) : null;

    case "exactname": {
      // L'égalité, pas la sous-chaîne : c'est tout l'intérêt du mot-clé.
      if (!value) return null;
      const wanted = normalizeText(value).trim();
      return (item) => item.name === wanted;
    }

    case "type":
      return value ? textField(value, (item) => item.typeName) : null;

    case "description":
    case "desc":
      return value ? textField(value, (item) => item.description) : null;

    case "perkname":
    case "perk":
      return value ? perkText(value) : null;

    case "exactperk": {
      if (!value) return null;
      const wanted = normalizeText(value).trim();
      return (item) =>
        item.entry?.plugNames.some((name) => name === wanted) ?? false;
    }

    case "keyword": {
      // Le plus large des filtres textuels : nom, type, description, attributs.
      if (!value) return null;
      const needle = normalizeText(value);
      return (item) =>
        item.name.includes(needle) ||
        item.typeName.includes(needle) ||
        item.description.includes(needle) ||
        (item.entry?.plugNames.some((name) => name.includes(needle)) ?? false);
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
    // `light:` est l'ancien nom de la puissance, encore accepté par DIM.
    case "light":
      return compileNumber(value, (item) => item.detail?.instance?.primaryStat?.value);

    case "energy":
    case "energycapacity":
      return compileNumber(
        value,
        (item) => item.detail?.instance?.energy?.energyCapacity,
      );

    case "tier":
      return compileNumber(value, (item) => item.detail?.instance?.gearTier);

    case "count":
      // Exemplaires possédés, l'objet compris — `count:>=3`
      return compileNumber(value, (item) => ctx.copies.get(item.item.itemHash));

    case "stack":
      return compileNumber(value, (item) => item.item.quantity);

    case "kills":
      return compileNumber(value, (item) => item.entry?.kills);

    case "weaponlevel":
      return compileNumber(value, (item) => item.entry?.weaponLevel);

    case "enhancedperk":
      return compileNumber(value, (item) => item.entry?.enhancedPerks);

    case "stat":
      return compileStat(value, extra, totalStat);

    case "basestat":
      return compileStat(value, extra, baseStat);

    case "primarystat":
      return compileStatRank(value, 1);
    case "secondarystat":
      return compileStatRank(value, 2);
    case "tertiarystat":
      return compileStatRank(value, 3);

    case "tunedstat":
      return compileTunedStat(value);

    case "masterwork":
      return compileMasterwork(value);

    case "foundry":
      return compileFoundry(value);

    case "breaker":
      return compileBreaker(value);

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

/** Mots-clés dont la réponse se lit dans l'index des plugs. */
const INDEXED_KEYWORDS: ReadonlySet<string> = new Set([
  "perkname",
  "perk",
  "exactperk",
  "keyword",
  "basestat",
  "primarystat",
  "secondarystat",
  "tertiarystat",
  "tunedstat",
  "masterwork",
  "breaker",
  "kills",
  "weaponlevel",
  "enhancedperk",
]);

/**
 * La requête a-t-elle besoin de l'index des plugs (noms, écarts de mods,
 * drapeaux) ?
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
      if (INDEXED_KEYWORDS.has(keyword)) return true;
      if (keyword === "is" || keyword === "not") {
        return INDEXED_IS_KEYWORDS.has(normalizeKeyword(node.parts[1] ?? ""));
      }
      return false;
    }
  }
}
