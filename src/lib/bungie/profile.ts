import { bungieFetch } from "./client";

// Composants GetProfile demandés :
//  200 = Characters, 201 = CharacterInventories, 205 = CharacterEquipment
// Doc composants : https://bungie-net.github.io/multi/schema_Destiny-DestinyComponentType.html
const COMPONENTS = "200,201,205";

// Types partiels (voir bungie-api-ts pour les types complets).
export interface DestinyItemComponent {
  itemHash: number;
  itemInstanceId?: string;
  quantity: number;
  bucketHash: number;
  location: number;
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

  return { characters, equipment, inventory };
}
