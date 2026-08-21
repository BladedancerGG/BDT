import { bungieFetch } from "./client";
import {
  buildItemDetails,
  type ItemDetail,
  type RawItemComponentSet,
} from "./item-components";
import { trimPlugSets, type ProfilePlugSets } from "./plug-sets";

// Composants GetProfile demandés :
//  102 = ProfileInventory (le coffre, partagé entre tous les personnages)
//  200 = Characters, 201 = CharacterInventories, 205 = CharacterEquipment
//  206 = CharacterLoadouts (les équipements sauvegardés en jeu)
//  300 = ItemInstances, 304 = ItemStats, 305 = ItemSockets,
//  309 = ItemPlugObjectives, 310 = ItemReusablePlugs
//
// Les composants 300–310 sont demandés au niveau du PROFIL : Bungie renvoie
// alors stats / sockets / plugs pour TOUS les objets du compte en une seule
// requête. Cela remplace un appel par objet au survol : la navigation est
// instantanée, au prix d'un chargement initial un peu plus long.
const COMPONENTS = "102,200,201,205,206,300,304,305,309,310";

export interface DestinyItemComponent {
  itemHash: number;
  itemInstanceId?: string;
  quantity: number;
  bucketHash: number;
  location: number;
  /** Masque de bits ItemState : façonné, amélioré, chef-d'œuvre, verrouillé… */
  state: number;
  /** Version de l'objet — sert à choisir le bon filigrane de saison */
  versionNumber?: number;
}

interface DestinyCharacterComponent {
  characterId: string;
  classHash: number;
  /** DestinyClass : 0 Titan, 1 Chasseur, 2 Arcaniste */
  classType: number;
  light: number;
  emblemPath: string;
  emblemBackgroundPath: string;
  titleRecordHash?: number;
  /**
   * Statistiques du personnage, déjà totalisées par Bungie : armures, mods et
   * fragments équipés y sont inclus. Rien à recalculer côté client, et c'est
   * heureux — les bonus conditionnels n'y seraient pas reproductibles.
   */
  stats?: Record<string, number>;
}

/**
 * Un des emplacements d'équipement sauvegardé en jeu.
 *
 * Un emplacement libre a une liste d'objets **vide** : c'est le seul critère
 * fiable, les trois hashes d'identifiants portant alors la valeur par défaut du
 * jeu et non zéro.
 */
export interface DestinyLoadout {
  /** DestinyLoadoutColorDefinition — le fond de la vignette */
  colorHash: number;
  /** DestinyLoadoutIconDefinition — le glyphe */
  iconHash: number;
  /** DestinyLoadoutNameDefinition — « Alpha », « Bêta »… */
  nameHash: number;
  items: DestinyLoadoutItem[];
}

export interface DestinyLoadoutItem {
  itemInstanceId: string;
  /** Attributs et mods tels qu'enregistrés dans l'équipement */
  plugItemHashes: number[];
}

interface ProfileResponse {
  characters: { data: Record<string, DestinyCharacterComponent> };
  characterEquipment: { data: Record<string, { items: DestinyItemComponent[] }> };
  characterInventories: {
    data: Record<string, { items: DestinyItemComponent[] }>;
  };
  /** Équipements sauvegardés, par personnage (composant 206) */
  characterLoadouts?: {
    data?: Record<string, { loadouts: DestinyLoadout[] }>;
  };
  /** Le coffre — non rattaché à un personnage */
  profileInventory?: { data?: { items: DestinyItemComponent[] } };
  itemComponents?: RawItemComponentSet;
  /** Plugs débloqués sur le compte — livrés avec le composant 305 */
  profilePlugSets?: {
    data?: { plugs: Record<string, { plugItemHash: number; canInsert: boolean }[]> };
  };
  /** Idem, par personnage */
  characterPlugSets?: {
    data?: Record<
      string,
      { plugs: Record<string, { plugItemHash: number; canInsert: boolean }[]> }
    >;
  };
}

/** Récupère personnages, inventaires et détail de tous les objets instanciés. */
export async function getProfileInventory(
  accessToken: string,
  membershipType: number,
  destinyMembershipId: string,
) {
  const data = await bungieFetch<ProfileResponse>(
    `/Destiny2/${membershipType}/Profile/${destinyMembershipId}/?components=${COMPONENTS}`,
    { accessToken },
  );

  const characters = Object.values(data.characters.data).map((c) => ({
    characterId: c.characterId,
    classHash: c.classHash,
    classType: c.classType,
    light: c.light,
    emblemPath: c.emblemPath,
    emblemBackgroundPath: c.emblemBackgroundPath,
    titleRecordHash: c.titleRecordHash,
    stats: c.stats ?? {},
  }));

  const equipment: Record<string, DestinyItemComponent[]> = {};
  const inventory: Record<string, DestinyItemComponent[]> = {};
  for (const [characterId, bucket] of Object.entries(
    data.characterEquipment.data,
  )) {
    equipment[characterId] = bucket.items;
  }
  for (const [characterId, bucket] of Object.entries(
    data.characterInventories.data,
  )) {
    inventory[characterId] = bucket.items;
  }

  // Le coffre est commun à tous les personnages
  const vault = data.profileInventory?.data?.items ?? [];

  // Le nombre d'emplacements n'est pas fixé ici : Bungie en renvoie autant que
  // le compte en possède (dix à la sortie de la fonctionnalité, davantage
  // depuis). Le panneau affiche la liste telle quelle.
  const loadouts: Record<string, DestinyLoadout[]> = Object.fromEntries(
    Object.entries(data.characterLoadouts?.data ?? {}).map(
      ([characterId, component]) => [characterId, component.loadouts ?? []],
    ),
  );

  // Stats / sockets / plugs de chaque objet, indexés par itemInstanceId,
  // élagués pour ne transmettre au navigateur que le nécessaire.
  const items: Record<string, ItemDetail> = buildItemDetails(
    data.itemComponents,
  );

  // Mods, revêtements, ornements, aspects, fragments et attributs d'artéfact
  // débloqués : c'est la seule source de ce que le joueur peut réellement
  // équiper — voir lib/bungie/plug-sets.ts.
  const plugSets: ProfilePlugSets = {
    profile: trimPlugSets(data.profilePlugSets?.data),
    characters: Object.fromEntries(
      Object.entries(data.characterPlugSets?.data ?? {}).map(
        ([characterId, component]) => [characterId, trimPlugSets(component)],
      ),
    ),
  };

  return { characters, equipment, inventory, vault, loadouts, items, plugSets };
}
