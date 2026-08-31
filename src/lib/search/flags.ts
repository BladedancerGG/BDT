// Drapeaux d'un objet dans l'index de recherche.
//
// Module à part, et sans dépendance : `filters.ts` les lit et doit rester pur
// — il ne peut pas importer `index-build.ts`, qui ouvre le manifeste. Les
// valeurs elles-mêmes sont calculées là-bas, à partir des plugs équipés.

export const SEARCH_FLAG = {
  /** Au moins un mod posé par le joueur (ni pièce maîtresse ni compte-frags) */
  Modded: 1 << 0,
  /** Un revêtement a été appliqué */
  Shaded: 1 << 1,
  /** Un ornement a été appliqué */
  Ornamented: 1 << 2,
  /** Armure d'artifice — voir ARTIFICE_FAMILY */
  Artifice: 1 << 3,
  /** L'arme porte une particularité d'origine */
  OriginTrait: 1 << 4,
  /** Résonance profonde active */
  Deepsight: 1 << 5,
  /** Attribut intrinsèque d'armure (exotiques) */
  ArmorIntrinsic: 1 << 6,
  /** Un mod d'ajustage a été posé */
  Tuned: 1 << 7,
  /** Armure 3.0 : elle porte un archétype */
  Armor3: 1 << 8,
  /** Arme à paliers d'équipement */
  Tiered: 1 << 9,
  /** Arme améliorable (façonnage ou paliers) */
  Enhanceable: 1 << 10,
  /** Un socket de mod est désactivé */
  DisabledMod: 1 << 11,
} as const;

