import { bungieFetch } from "./client";
import {
  trimInstance,
  trimStats,
  trimSockets,
  trimDisabledSockets,
  trimReusablePlugs,
  type ItemDetail,
} from "./item-components";

// Composants d'un objet instancié :
//  300 = ItemInstances (puissance, élément, énergie, palier)
//  304 = ItemStats (bloc de statistiques)
//  305 = ItemSockets (perks/mods actuellement équipés)
//  310 = ItemReusablePlugs (tous les plugs disponibles par socket)
const COMPONENTS = "300,304,305,310";

interface ItemResponse {
  instance?: { data?: Parameters<typeof trimInstance>[0] };
  stats?: { data?: Parameters<typeof trimStats>[0] };
  sockets?: { data?: Parameters<typeof trimSockets>[0] };
  reusablePlugs?: { data?: Parameters<typeof trimReusablePlugs>[0] };
}

/**
 * Détail d'un objet instancié.
 *
 * Sert de **repli** : en régime normal ces données arrivent déjà par
 * /api/profile, qui les charge pour tous les objets en un seul appel. Cette
 * route reste utile pour un objet absent du profil (coffre non chargé…).
 */
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
    instance: trimInstance(data.instance?.data),
    stats: trimStats(data.stats?.data),
    sockets: trimSockets(data.sockets?.data),
    disabledSockets: trimDisabledSockets(data.sockets?.data),
    reusablePlugs: trimReusablePlugs(data.reusablePlugs?.data),
  };
}

export type { ItemDetail } from "./item-components";
