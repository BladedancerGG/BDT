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

/**
 * Ce qu'un plug set contient pour ce compte, en **deux** listes.
 *
 * Bungie renvoie deux drapeaux par plug, et ils ne disent pas la même chose :
 *
 *  - `canInsert` : l'insertion passerait, ici et maintenant ;
 *  - `enabled`   : le plug est débloqué — le joueur le possède.
 *
 * Les confondre coûtait des aspects de doctrine dans le sélecteur : un aspect
 * déjà équipé sur l'autre emplacement de la même doctrine reste `enabled` mais
 * n'est plus `canInsert`, et disparaissait donc de la liste. DIM retient
 * `enabled` comme signal de possession (`filterUnlockedPlugs`) et ne garde
 * `canInsert` que pour les plug sets d'ornements universels d'armure, où
 * `enabled` vaut vrai pour tout le monde et ne dit donc rien.
 *
 * D'où les deux listes plutôt qu'un choix tranché ici : le serveur n'a pas le
 * manifeste et ne sait pas quel socket sera servi, c'est `buildColumns` qui
 * décide — voir `lib/destiny/use-sockets.ts`.
 */
export interface PlugSetAvailability {
  /** `canInsert` : proposables sans réserve */
  ready: number[];
  /**
   * `enabled` sans `canInsert` : possédés, mais pas insérables à l'instant.
   * Absent quand il n'y en a aucun — la grande majorité des plug sets.
   */
  held?: number[];
}

/** Plugs d'un compte, indexés par hash de plug set. */
export type PlugSetSnapshot = Record<string, PlugSetAvailability>;

export interface ProfilePlugSets {
  /** Débloqués au niveau du compte */
  profile: PlugSetSnapshot;
  /** Débloqués par personnage, indexés par characterId */
  characters: Record<string, PlugSetSnapshot>;
}

interface RawPlugSetsComponent {
  plugs: Record<
    string,
    { plugItemHash: number; canInsert: boolean; enabled: boolean }[]
  >;
}

/**
 * Ne garde que les plugs **possédés**, et seulement leur hash.
 *
 * Ce qui est écarté ici — ni `canInsert` ni `enabled` — n'est pas débloqué :
 * Bungie refuserait l'insertion, et la maquette demande de n'afficher que « les
 * objets pouvant être équipés dans l'emplacement ». Filtrer ici plutôt que dans
 * le navigateur divise aussi la taille de la réponse : les pools non débloqués
 * sont les plus gros.
 */
export function trimPlugSets(
  raw: RawPlugSetsComponent | undefined,
): PlugSetSnapshot {
  const out: PlugSetSnapshot = {};
  for (const [setHash, plugs] of Object.entries(raw?.plugs ?? {})) {
    const ready: number[] = [];
    const held: number[] = [];
    for (const plug of plugs) {
      if (plug.canInsert) ready.push(plug.plugItemHash);
      else if (plug.enabled) held.push(plug.plugItemHash);
    }
    if (ready.length === 0 && held.length === 0) continue;
    out[setHash] = held.length > 0 ? { ready, held } : { ready };
  }
  return out;
}
