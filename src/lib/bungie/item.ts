import { bungieFetch } from "./client";

// Composants d'un objet instancié :
//  300 = ItemInstances (puissance, élément, énergie)
//  304 = ItemStats (bloc de statistiques)
//  305 = ItemSockets (perks/mods actuellement équipés)
//  310 = ItemReusablePlugs (tous les plugs disponibles par socket)
const COMPONENTS = "300,304,305,310";

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

/** Un plug proposé pour un socket (perk alternatif). */
export interface ItemPlug {
  plugItemHash: number;
  canInsert: boolean;
  enabled: boolean;
}

export interface ItemDetail {
  instance: ItemInstance | null;
  // { [statHash]: { statHash, value } }
  stats: Record<string, { statHash: number; value: number }>;
  sockets: ItemSocket[];
  /** Plugs disponibles indexés par numéro de socket : { "3": [...], "4": [...] } */
  reusablePlugs: Record<string, ItemPlug[]>;
}

interface ItemResponse {
  instance?: { data?: ItemInstance };
  stats?: { data?: { stats: Record<string, { statHash: number; value: number }> } };
  sockets?: { data?: { sockets: ItemSocket[] } };
  reusablePlugs?: { data?: { plugs: Record<string, ItemPlug[]> } };
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
    reusablePlugs: data.reusablePlugs?.data?.plugs ?? {},
  };
}