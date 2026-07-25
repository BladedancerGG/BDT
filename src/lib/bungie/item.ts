import { bungieFetch } from "./client";

// Composants d'un objet instancié :
//  300 = ItemInstances (puissance, élément, énergie)
//  304 = ItemStats (bloc de statistiques)
//  305 = ItemSockets (perks/mods équipés)
const COMPONENTS = "300,304,305";

export interface ItemInstance {
  damageType?: number;
  damageTypeHash?: number;
  primaryStat?: { statHash: number; value: number };
  energy?: { energyCapacity: number; energyUsed: number; energyUnused: number };
  itemLevel?: number;
}

export interface ItemSocket {
  plugHash?: number;
  isEnabled: boolean;
  isVisible: boolean;
}

export interface ItemDetail {
  instance: ItemInstance | null;
  // { [statHash]: { statHash, value } }
  stats: Record<string, { statHash: number; value: number }>;
  sockets: ItemSocket[];
}

interface ItemResponse {
  instance?: { data?: ItemInstance };
  stats?: { data?: { stats: Record<string, { statHash: number; value: number }> } };
  sockets?: { data?: { sockets: ItemSocket[] } };
}

/** Détail d'un objet instancié (arme/armure équipée ou en inventaire). */
export async function getItemDetail(
  accessToken: string,
  membershipType: number,
  destinyMembershipId: string,
  itemInstanceId: string,
): Promise<ItemDetail> {
  const data = await bungieFetch<ItemResponse>(
    `/Destiny2/${membershipType}/Profile/${destinyMembershipId}/Item/${itemInstanceId}/?components=${COMPONENTS}`,
    { accessToken },
  );

  return {
    instance: data.instance?.data ?? null,
    stats: data.stats?.data?.stats ?? {},
    sockets: data.sockets?.data?.sockets ?? [],
  };
}
