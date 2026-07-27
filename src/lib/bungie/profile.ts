import { bungieFetch } from "./client";

// Composants GetProfile demandés :
//  200 = Characters, 201 = CharacterInventories, 205 = CharacterEquipment
//  300 = ItemInstances (puissance, élément, palier d'équipement…) pour tous
//        les objets d'un coup, ce qui évite un appel par objet
// Doc : https://bungie-net.github.io/multi/schema_Destiny-DestinyComponentType.html
const COMPONENTS = "200,201,205,300";

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

/** Données d'instance utiles à l'affichage d'une vignette. */
export interface ItemInstanceSummary {
  primaryStat?: { statHash: number; value: number };
  damageType?: number;
  /** Palier d'équipement (1 à 5), absent si l'objet n'en a pas */
  gearTier?: number;
}

interface DestinyCharacterComponent {
  characterId: string;
  classHash: number;
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
  itemComponents?: {
    instances?: { data?: Record<string, ItemInstanceSummary> };
  };
}

/** Récupère personnages + équipements + inventaires d'un compte Destiny. */
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

  // Instances indexées par itemInstanceId
  const instances = data.itemComponents?.instances?.data ?? {};

  return { characters, equipment, inventory, instances };
}
