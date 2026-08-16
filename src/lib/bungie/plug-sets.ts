// Plugs débloqués sur le compte, par « plug set ».
//
// Pourquoi c'est indispensable : la liste des mods, revêtements, ornements,
// aspects, fragments et attributs d'artéfact **équipables** ne se lit pas sur
// l'objet. Le manifeste ne donne que le pool théorique du jeu (712 revêtements,
// 82 mods de jambes…) ; ce que le joueur possède réellement n'existe que dans
// `profilePlugSets` / `characterPlugSets`.
//
// Ces deux composants arrivent avec ItemSockets (305), déjà demandé par
// /api/profile : ils ne coûtent donc aucune requête supplémentaire — ils
// étaient simplement jetés.
//
// Quelle source pour quel socket : ce n'est pas à deviner, `plugSources` le dit
// (masque SocketPlugSources) — voir PLUG_SOURCE dans lib/destiny/sockets.ts.

/** Plugs débloqués, indexés par hash de plug set. */
export type PlugSetSnapshot = Record<string, number[]>;

export interface ProfilePlugSets {
  /** Débloqués au niveau du compte */
  profile: PlugSetSnapshot;
  /** Débloqués par personnage, indexés par characterId */
  characters: Record<string, PlugSetSnapshot>;
}

interface RawPlugSetsComponent {
  plugs: Record<string, { plugItemHash: number; canInsert: boolean }[]>;
}

/**
 * Ne garde que les plugs **insérables**, et seulement leur hash.
 *
 * `canInsert: false` recouvre le non-débloqué comme le déjà-équipé-ailleurs :
 * dans les deux cas Bungie refuserait l'insertion, et la maquette demande de
 * n'afficher que « les objets pouvant être équipés dans l'emplacement ».
 * Filtrer ici plutôt que dans le navigateur divise aussi la taille de la
 * réponse : les pools non débloqués sont les plus gros.
 */
export function trimPlugSets(
  raw: RawPlugSetsComponent | undefined,
): PlugSetSnapshot {
  const out: PlugSetSnapshot = {};
  for (const [setHash, plugs] of Object.entries(raw?.plugs ?? {})) {
    const insertable = plugs
      .filter((plug) => plug.canInsert)
      .map((plug) => plug.plugItemHash);
    if (insertable.length > 0) out[setHash] = insertable;
  }
  return out;
}
