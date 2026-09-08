// Symboles du jeu — accès applicatif à la table générée depuis les polices.
//
// Pas de directive "use client" : ces valeurs sont de simples constantes, et le
// serveur doit pouvoir les lire (voir lib/settings/constants.ts).
//
// Deux niveaux :
//  - `DESTINY_GLYPHS`  : un glyphe, tel que la police le nomme (généré) ;
//  - `DESTINY_SYMBOLS` : les symboles **composés**, que le jeu obtient en
//    superposant plusieurs glyphes.
//
// La superposition n'est pas une facilité d'affichage : certains symboles
// n'existent qu'en morceaux dans la police. Le « clic gauche » est un corps de
// souris (`mouse1`) sur lequel se pose le bouton éclairé (`mouse1_button`), et
// une touche du clavier est un fond (`standard_backing`) sous une lettre. Les
// morceaux à poser ont une chasse nulle — c'est ainsi qu'ils sont repérés à la
// génération, voir `DESTINY_OVERLAY_GLYPHS`.

import {
  DESTINY_GLYPHS,
  DESTINY_OVERLAY_GLYPHS,
  type DestinyGlyphName,
} from "./symbols.generated";

export { DESTINY_GLYPHS, DESTINY_OVERLAY_GLYPHS };
export type { DestinyGlyphName };

/**
 * Un symbole composé : ses couches, de l'arrière vers l'avant.
 *
 * `accent` désigne celle qui porte la couleur d'accent (le bouton pressé d'une
 * souris) ; les autres prennent la couleur du texte.
 *
 * `outline` désigne celle qui n'est dessinée qu'en **contour**, l'intérieur
 * laissé transparent : le fond d'une touche est une forme pleine, qui noierait
 * sinon la légende posée dessus.
 */
export interface DestinySymbolDef {
  layers: readonly DestinyGlyphLayer[];
  accent?: number;
  outline?: number;
}

/**
 * Une couche à dessiner : un glyphe **nommé**, ou le caractère lui-même.
 *
 * Les légendes de touches n'ont pas d'autre désignation : la police redouble
 * l'ASCII imprimable en U+EE21–EE7E, mais ces doublons portent les noms
 * *standard* du format CFF (« R », « ! »…), que l'extraction écarte — ils
 * n'apparaissent donc jamais dans `DESTINY_GLYPHS`.
 */
export type DestinyGlyphLayer = DestinyGlyphName | (string & Record<never, never>);

/**
 * Symboles composés d'usage courant, sous un nom d'application plutôt que sous
 * celui de la police — `mouseLeft` se retient mieux que `mouse1` + `mouse1_button`.
 */
export const DESTINY_SYMBOLS = {
  mouseLeft: { layers: ["mouse1", "mouse1_button"], accent: 1 },
  mouseRight: { layers: ["mouse2", "mouse2_button"], accent: 1 },
  mouseMiddle: { layers: ["mouse3", "mouse3_button"], accent: 1 },
  mouse4: { layers: ["mouse4", "mouse4_button"], accent: 1 },
  mouse5: { layers: ["mouse5", "mouse5_button"], accent: 1 },
  wheelUp: { layers: ["mousewheel_up", "mousewheel_up_button"], accent: 1 },
  wheelDown: {
    layers: ["mousewheel_down", "mousewheel_down_button"],
    accent: 1,
  },
} as const satisfies Record<string, DestinySymbolDef>;

export type DestinySymbolName = keyof typeof DESTINY_SYMBOLS;

/** Nom accepté par `<DestinySymbol>` : un composé, ou un glyphe brut. */
export type DestinySymbolRef = DestinySymbolName | DestinyGlyphName;

/** Décalage de la zone des légendes de touches sur l'ASCII imprimable. */
const KEY_LEGEND_BASE = 0xee00;

/**
 * Touche du clavier : le fond de touche, puis la légende par-dessus.
 *
 * La police redouble tout l'ASCII imprimable dans la zone U+EE21–U+EE7E pour
 * ces légendes — un « E » de touche n'est pas la lettre E, et il faut le
 * désigner par son caractère : ces doublons n'ont dans la police que le nom
 * standard du format CFF, que l'extraction n'exporte pas. Les touches nommées
 * (`return`, `shift_left`, `tab`…) sont des glyphes à part entière, contour
 * compris : les passer ici fonctionne tout autant, sans calque ajouté.
 */
export function keySymbol(legend: string): DestinySymbolDef {
  const layers: DestinyGlyphLayer[] = [];
  if (legend.length === 1) {
    const code = legend.toUpperCase().charCodeAt(0);
    if (code >= 0x21 && code <= 0x7e) {
      // La légende n'est qu'une lettre : le fond de touche vient du calque,
      // posé dessous et réduit à son contour (voir `outline`).
      layers.push("standard_backing", String.fromCharCode(KEY_LEGEND_BASE + code));
      return { layers, outline: 0 };
    }
  } else if (legend in DESTINY_GLYPHS) {
    // Les touches nommées sont d'une seule pièce, fond compris : leur ajouter
    // le calque le doublerait. Ce fond-là est donc le leur, et c'est tout le
    // glyphe qui passe en contour.
    layers.push(legend);
    return { layers, outline: 0 };
  }
  return { layers };
}

/** Résout un nom en couches à dessiner, de l'arrière vers l'avant. */
export function destinySymbol(
  name: DestinySymbolRef | DestinySymbolDef,
): DestinySymbolDef | null {
  if (typeof name !== "string") return name;
  if (name in DESTINY_SYMBOLS) {
    return DESTINY_SYMBOLS[name as DestinySymbolName];
  }
  if (name in DESTINY_GLYPHS) {
    return { layers: [name as DestinyGlyphName] };
  }
  return null;
}

/** Caractère(s) d'une couche. */
export function glyphChar(name: DestinyGlyphLayer): string {
  return DESTINY_GLYPHS[name as DestinyGlyphName] ?? name;
}

/**
 * Rendu en **texte seul** d'un symbole, pour les contextes où l'on ne peut pas
 * poser de balise (`aria-label`, `title`, chaîne concaténée).
 *
 * Les couches de chasse nulle sont émises **avant** la couche pleine : la plume
 * ne bougeant pas après elles, elles se posent sinon sur le glyphe suivant.
 */
export function destinySymbolText(
  name: DestinySymbolRef | DestinySymbolDef,
): string {
  const def = destinySymbol(name);
  if (!def) return "";
  const overlays = def.layers.filter((l) => DESTINY_OVERLAY_GLYPHS.has(l));
  const solid = def.layers.filter((l) => !DESTINY_OVERLAY_GLYPHS.has(l));
  return [...overlays, ...solid].map(glyphChar).join("");
}
