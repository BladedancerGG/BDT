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
//  300 = ItemInstances, 304 = ItemStats, 305 = ItemSockets,
//  309 = ItemPlugObjectives, 310 = ItemReusablePlugs
//
// Les composants 300–310 sont demandés au niveau du PROFIL : Bungie renvoie
// alors stats / sockets / plugs pour TOUS les objets du compte en une seule
// requête. Cela remplace un appel par objet au survol : la navigation est
// instantanée, au prix d'un chargement initial un peu plus long.
const COMPONENTS = "102,200,201,205,300,304,305,309,310";

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
}

interface ProfileResponse {
  characters: { data: Record<string, DestinyCharacterComponent> };
  characterEquipment: { data: Record<string, { items: DestinyItemComponent[] }> };
  characterInventories: {
    data: Record<string, { items: DestinyItemComponent[] }>;
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

  return { characters, equipment, inventory, vault, items, plugSets };
}
