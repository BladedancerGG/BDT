// Autocomplétion de la barre de recherche.
//
// Module pur, comme `query.ts` et `filters.ts` : il reçoit une chaîne, la
// position du curseur et l'historique, et rend une liste de propositions. Aucun
// accès au manifeste — c'est ce qui permet à la barre, qui vit dans l'en-tête
// hors de l'arbre des définitions, d'autocompléter sans rien charger.
//
// Le vocabulaire proposé est **dérivé** des tables de `keywords.ts` et de
// `IS_VALUES` : la liste affichée et celle que `filters.ts` comprend ne peuvent
// donc pas diverger.

import { IS_VALUES } from "./filters";
import {
  BREAKER_KEYWORDS,
  FOUNDRY_KEYWORDS,
  STAT_ANY,
  STAT_KEYWORDS,
  STAT_RANK_KEYWORDS,
  STAT_TOTAL,
  normalizeText,
} from "./keywords";

export interface Suggestion {
  /** Ce qui remplacera le terme en cours de saisie */
  value: string;
  /** Une entrée d'historique se présente autrement qu'un mot-clé */
  kind: "filter" | "history";
}

// —— Vocabulaire proposé ————————————————————————————————————————

/** Mots-clés attendant du texte libre : on s'arrête aux deux-points. */
const TEXT_FILTERS = [
  "name",
  "exactname",
  "type",
  "description",
  "keyword",
  "perk",
  "perkname",
  "exactperk",
  "id",
  "hash",
];

/**
 * Mots-clés attendant une comparaison.
 *
 * Proposés avec `>=` : c'est la forme la plus utile, et la seule qui se tape
 * mal. L'utilisateur reste libre de la remplacer par `<`, `=`…
 */
const NUMBER_FILTERS = [
  "power",
  "light",
  "energy",
  "energycapacity",
  "tier",
  "count",
  "stack",
  "kills",
  "weaponlevel",
  "enhancedperk",
];

/** Ce que `stat:` et `basestat:` acceptent comme sélecteur. */
const STAT_SELECTORS = [
  ...Object.keys(STAT_KEYWORDS),
  STAT_TOTAL,
  STAT_ANY,
  ...Object.keys(STAT_RANK_KEYWORDS),
];

/** Les six statistiques d'armure, seules concernées par le classement. */
const ARMOR_STAT_NAMES = [
  "health",
  "melee",
  "grenade",
  "super",
  "class",
  "weapons",
];

/**
 * Toutes les propositions possibles, calculées une fois pour toutes.
 *
 * Le tableau fait quelques centaines d'entrées : le parcourir à chaque frappe
 * ne coûte rien, et évite d'avoir à maintenir un index.
 */
const VOCABULARY: readonly string[] = [
  ...IS_VALUES.map((value) => `is:${value}`),
  ...IS_VALUES.map((value) => `not:${value}`),
  ...TEXT_FILTERS.map((keyword) => `${keyword}:`),
  ...NUMBER_FILTERS.map((keyword) => `${keyword}:>=`),
  ...STAT_SELECTORS.map((stat) => `stat:${stat}:>=`),
  ...STAT_SELECTORS.map((stat) => `basestat:${stat}:>=`),
  ...ARMOR_STAT_NAMES.flatMap((stat) => [
    `primarystat:${stat}`,
    `secondarystat:${stat}`,
    `tertiarystat:${stat}`,
  ]),
  ...[
    ...ARMOR_STAT_NAMES,
    "primary",
    "secondary",
    "tertiary",
    "unfocused",
  ].map((value) => `tunedstat:${value}`),
  ...[...Object.keys(STAT_KEYWORDS), STAT_ANY].map(
    (stat) => `masterwork:${stat}`,
  ),
  ...[...Object.keys(FOUNDRY_KEYWORDS), STAT_ANY].map(
    (value) => `foundry:${value}`,
  ),
  ...[...Object.keys(BREAKER_KEYWORDS), "intrinsic", STAT_ANY].map(
    (value) => `breaker:${value}`,
  ),
];

// —— Le terme sous le curseur ————————————————————————————————————

export interface QueryTerm {
  /** Texte du terme, tel qu'il est tapé */
  text: string;
  start: number;
  end: number;
}

/**
 * Découpe le terme que le curseur touche.
 *
 * Les bornes sont les espaces et les parenthèses — pas les deux-points : c'est
 * `stat:range` tout entier qu'on veut compléter, pas `range` seul.
 */
export function termAt(query: string, caret: number): QueryTerm {
  const isBoundary = (char: string) => /\s/.test(char) || char === "(" || char === ")";

  let start = Math.max(0, Math.min(caret, query.length));
  while (start > 0 && !isBoundary(query[start - 1])) start -= 1;

  let end = start;
  while (end < query.length && !isBoundary(query[end])) end += 1;

  return { text: query.slice(start, end), start, end };
}

// —— Classement ————————————————————————————————————————————————

/**
 * Rang d'une proposition face au texte tapé, du meilleur au moins bon.
 *
 * Trois cas, et l'ordre compte : le mot-clé complet (`is:ex` → `is:exotic`), sa
 * seule valeur (`exo` → `is:exotic`, la façon dont on cherche quand on ne se
 * souvient plus du préfixe), puis une simple sous-chaîne.
 */
function rank(candidate: string, needle: string): number | null {
  if (candidate.startsWith(needle)) return 0;
  const colon = candidate.indexOf(":");
  if (colon !== -1 && candidate.slice(colon + 1).startsWith(needle)) return 1;
  if (candidate.includes(needle)) return 2;
  return null;
}

/** Nombre de propositions affichées : de quoi choisir sans noyer la barre. */
export const MAX_SUGGESTIONS = 8;

/**
 * Propositions pour la requête en cours.
 *
 * Les mots-clés viennent en premier, l'historique ensuite : le second n'aide
 * qu'une fois qu'on sait ce qu'on cherche, le premier apprend la syntaxe.
 *
 * Une barre vide ne propose que l'historique — dérouler les 400 mots-clés
 * disponibles n'apprendrait rien à personne.
 */
export function suggestionsFor(
  query: string,
  caret: number,
  history: readonly string[],
  limit: number = MAX_SUGGESTIONS,
): Suggestion[] {
  const term = termAt(query, caret);
  const needle = normalizeText(term.text).trim();
  if (!needle) {
    return history
      .slice(0, limit)
      .map((entry) => ({ value: entry, kind: "history" as const }));
  }

  const scored: { value: string; rank: number }[] = [];
  for (const candidate of VOCABULARY) {
    const score = rank(candidate, needle);
    if (score !== null) scored.push({ value: candidate, rank: score });
  }

  // À rang égal, la proposition la plus courte d'abord : c'est la plus proche
  // de ce qui a été tapé, et celle qu'on veut le plus souvent.
  scored.sort(
    (a, b) => a.rank - b.rank || a.value.length - b.value.length ||
      a.value.localeCompare(b.value),
  );

  const suggestions: Suggestion[] = scored
    .slice(0, limit)
    .map(({ value }) => ({ value, kind: "filter" as const }));

  // L'historique complète la liste, sans jamais la remplacer, et seulement
  // pour les recherches qui contiennent ce qui est tapé.
  const seen = new Set(suggestions.map((suggestion) => suggestion.value));
  for (const entry of history) {
    if (suggestions.length >= limit) break;
    if (seen.has(entry)) continue;
    if (!normalizeText(entry).includes(needle)) continue;
    suggestions.push({ value: entry, kind: "history" });
    seen.add(entry);
  }

  return suggestions;
}

// —— Insertion ————————————————————————————————————————————————

export interface AppliedSuggestion {
  query: string;
  /** Où replacer le curseur */
  caret: number;
}

/**
 * Insère une proposition à la place du terme en cours.
 *
 * Une proposition qui se termine par `:`, `>=` ou un autre opérateur attend
 * encore une valeur : le curseur reste collé derrière, sans espace. Les autres
 * sont complètes, et gagnent l'espace qui permet d'enchaîner un second filtre.
 */
export function applySuggestion(
  query: string,
  caret: number,
  suggestion: Suggestion,
): AppliedSuggestion {
  // Une entrée d'historique est une requête entière, pas un terme : elle
  // remplace toute la barre.
  if (suggestion.kind === "history") {
    return { query: suggestion.value, caret: suggestion.value.length };
  }

  const term = termAt(query, caret);
  const partial = /[:<>=&+]$/.test(suggestion.value);
  const inserted = partial ? suggestion.value : `${suggestion.value} `;
  const next = query.slice(0, term.start) + inserted + query.slice(term.end);

  return { query: next, caret: term.start + inserted.length };
}
