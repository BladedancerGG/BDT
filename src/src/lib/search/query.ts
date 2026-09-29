// Analyse d'une requête de recherche, dans la syntaxe de Destiny Item Manager.
//
// Module pur : il ne connaît ni le manifeste ni les objets, il ne produit qu'un
// arbre. L'interprétation des termes vit dans `filters.ts`.
//
// Grammaire (l'espace vaut ET implicite, comme chez DIM) :
//
//   requête  := ou
//   ou       := et ("or" et)*
//   et       := unaire ("and"? unaire)*
//   unaire   := ("not" | "-") unaire | "(" ou ")" | terme
//   terme    := segment (":" segment)*        ex. stat:range:>=80
//   segment  := mot nu | "chaîne entre guillemets"
//
// Une requête incomplète ou fautive n'est pas « presque juste » : elle est
// signalée (`errors`) et l'appelant s'abstient de filtrer. C'est ce qui rend la
// frappe supportable — sans ça, `stat:ran` viderait l'écran à chaque lettre.

/** Nœud de l'arbre produit par `parseQuery`. */
export type QueryNode =
  | { kind: "and"; nodes: QueryNode[] }
  | { kind: "or"; nodes: QueryNode[] }
  | { kind: "not"; node: QueryNode }
  /** Un filtre : `["is", "exotic"]`, `["stat", "range", ">=80"]`, `["frenzy"]` */
  | { kind: "term"; parts: string[] };

export interface ParsedQuery {
  node: QueryNode | null;
  /** Clés de traduction des problèmes rencontrés (`search.error.*`) */
  errors: string[];
}

// —— Découpage ————————————————————————————————————————————————

// Membres séparés pour les parenthèses : un discriminant `"(" | ")"` ne se
// réduirait pas à un littéral, et TypeScript cesserait alors de restreindre le
// type sur `token.kind === "("`.
type Token =
  | { kind: "(" }
  | { kind: ")" }
  | { kind: "text"; raw: string; parts: string[] };

/** Guillemets acceptés autour d'un segment : les deux, comme chez DIM. */
const QUOTES = new Set(['"', "'"]);

/**
 * Découpe la chaîne en jetons.
 *
 * Les guillemets sont traités pendant le découpage — et non après — parce
 * qu'ils protègent aussi bien les espaces que les deux-points et les
 * parenthèses : `name:"Fusil (héroïque)"` est un seul terme, en deux segments.
 *
 * Une apostrophe n'ouvre un segment que si elle **commence** ce segment. Sans
 * cette condition, `frenzy's` et `l'ordre` partiraient en chaîne non terminée :
 * l'apostrophe est bien plus souvent une lettre qu'un guillemet.
 */
function tokenize(input: string): { tokens: Token[]; unterminated: boolean } {
  const tokens: Token[] = [];
  let unterminated = false;

  let index = 0;
  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: char });
      index += 1;
      continue;
    }

    // Un terme : on accumule segment par segment, les deux-points en dehors
    // des guillemets faisant office de séparateurs.
    const parts: string[] = [];
    let current = "";
    let raw = "";

    while (index < input.length) {
      const c = input[index];
      if (/\s/.test(c) || c === "(" || c === ")") break;

      if (QUOTES.has(c) && current === "") {
        const quote = c;
        index += 1;
        raw += quote;
        while (index < input.length && input[index] !== quote) {
          current += input[index];
          raw += input[index];
          index += 1;
        }
        if (index >= input.length) unterminated = true;
        else {
          raw += quote;
          index += 1; // guillemet fermant
        }
        continue;
      }

      if (c === ":") {
        parts.push(current);
        current = "";
        raw += c;
        index += 1;
        continue;
      }

      current += c;
      raw += c;
      index += 1;
    }

    parts.push(current);
    tokens.push({ kind: "text", raw, parts });
  }

  return { tokens, unterminated };
}

// —— Analyse syntaxique ————————————————————————————————————————

class Parser {
  private position = 0;
  readonly errors: string[] = [];

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private isOperator(token: Token | undefined, name: string): boolean {
    return (
      token?.kind === "text" &&
      token.parts.length === 1 &&
      token.raw.toLowerCase() === name
    );
  }

  parse(): QueryNode | null {
    const node = this.parseOr();
    if (this.position < this.tokens.length) {
      // Reste une parenthèse fermante orpheline
      this.errors.push("unbalanced");
    }
    return node;
  }

  private parseOr(): QueryNode | null {
    const nodes: QueryNode[] = [];
    const first = this.parseAnd();
    if (!first) return null;
    nodes.push(first);

    while (this.isOperator(this.peek(), "or")) {
      this.position += 1;
      const next = this.parseAnd();
      if (!next) {
        this.errors.push("danglingOperator");
        break;
      }
      nodes.push(next);
    }

    return nodes.length === 1 ? nodes[0] : { kind: "or", nodes };
  }

  private parseAnd(): QueryNode | null {
    const nodes: QueryNode[] = [];

    for (;;) {
      const token = this.peek();
      if (!token || token.kind === ")") break;
      if (this.isOperator(token, "or")) break;

      // « and » explicite : simple ponctuation, l'espace suffit déjà
      if (this.isOperator(token, "and")) {
        if (nodes.length === 0) {
          this.errors.push("danglingOperator");
          this.position += 1;
          continue;
        }
        this.position += 1;
        const next = this.parseUnary();
        if (!next) {
          this.errors.push("danglingOperator");
          break;
        }
        nodes.push(next);
        continue;
      }

      const node = this.parseUnary();
      if (!node) break;
      nodes.push(node);
    }

    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0] : { kind: "and", nodes };
  }

  private parseUnary(): QueryNode | null {
    const token = this.peek();
    if (!token) return null;

    if (this.isOperator(token, "not")) {
      this.position += 1;
      const node = this.parseUnary();
      if (!node) {
        this.errors.push("danglingOperator");
        return null;
      }
      return { kind: "not", node };
    }

    if (token.kind === "(") {
      this.position += 1;
      const node = this.parseOr();
      if (this.peek()?.kind === ")") this.position += 1;
      else this.errors.push("unbalanced");
      if (!node) {
        this.errors.push("emptyGroup");
        return null;
      }
      return node;
    }

    if (token.kind === ")") return null;

    this.position += 1;

    // Le `-` de tête nie le terme (`-is:exotic`), sauf s'il est le terme entier
    const parts = [...token.parts];
    let negated = false;
    if (parts[0].startsWith("-") && token.raw.startsWith("-")) {
      parts[0] = parts[0].slice(1);
      negated = true;
    }

    if (parts.every((part) => part === "")) {
      this.errors.push("emptyTerm");
      return null;
    }

    const term: QueryNode = { kind: "term", parts };
    return negated ? { kind: "not", node: term } : term;
  }
}

/**
 * Analyse une requête.
 *
 * `node` vaut `null` pour une requête vide — ce qui n'est pas une erreur : cela
 * signifie simplement « aucun filtre ».
 */
export function parseQuery(input: string): ParsedQuery {
  const { tokens, unterminated } = tokenize(input);
  const parser = new Parser(tokens);
  const node = parser.parse();

  const errors = [...parser.errors];
  if (unterminated) errors.push("unterminatedQuote");

  return { node, errors };
}
