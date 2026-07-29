// Forme compacte des composants d'objet, partagée par /api/profile et
// /api/item/[instanceId] : les deux routes produisent le même `ItemDetail`.
//
// Pourquoi élaguer : la réponse brute de Bungie pour tous les objets d'un
// compte pèse ~1,1 Mo, dont l'essentiel est inutilisé par l'UI
// (insertFailIndexes, plugObjectives, socketTypeHash…). En ne gardant que le
// nécessaire on descend à ~250 Ko.

export interface ItemInstanceSummary {
  primaryStat?: { statHash: number; value: number };
  damageType?: number;
  /** Palier d'équipement (1 à 5) */
  gearTier?: number;
  energy?: { energyCapacity: number; energyUsed: number; energyUnused: number };
}

/** Valeur par hash de statistique : { "4043523819": 84 } */
export type StatSnapshot = Record<string, number>;

/**
 * Plug équipé, indexé par numéro de socket.
 * `null` = socket masqué en jeu (à ne pas afficher), `0` = socket vide.
 */
export type SocketSnapshot = (number | null)[];

/** Plugs équipables par numéro de socket : { "3": [hash, hash] } */
export type PlugSnapshot = Record<string, number[]>;

export interface ItemDetail {
  instance?: ItemInstanceSummary;
  stats: StatSnapshot;
  sockets: SocketSnapshot;
  reusablePlugs: PlugSnapshot;
}

// —— Formes brutes renvoyées par l'API ————————————————————————

interface RawInstance {
  primaryStat?: { statHash: number; value: number };
  damageType?: number;
  gearTier?: number;
  energy?: { energyCapacity: number; energyUsed: number; energyUnused: number };
}
interface RawStats {
  stats: Record<string, { statHash: number; value: number }>;
}
interface RawSockets {
  sockets: { plugHash?: number; isEnabled: boolean; isVisible: boolean }[];
}
interface RawReusablePlugs {
  plugs: Record<string, { plugItemHash: number }[]>;
}

// —— Élagage ————————————————————————————————————————————————

export function trimInstance(raw: RawInstance | undefined): ItemInstanceSummary | undefined {
  if (!raw) return undefined;
  return {
    primaryStat: raw.primaryStat,
    damageType: raw.damageType,
    gearTier: raw.gearTier,
    energy: raw.energy,
  };
}

export function trimStats(raw: RawStats | undefined): StatSnapshot {
  const out: StatSnapshot = {};
  for (const [hash, stat] of Object.entries(raw?.stats ?? {})) {
    out[hash] = stat.value;
  }
  return out;
}

export function trimSockets(raw: RawSockets | undefined): SocketSnapshot {
  return (raw?.sockets ?? []).map((socket) =>
    socket.isVisible ? (socket.plugHash ?? 0) : null,
  );
}

export function trimReusablePlugs(
  raw: RawReusablePlugs | undefined,
): PlugSnapshot {
  const out: PlugSnapshot = {};
  for (const [socketIndex, plugs] of Object.entries(raw?.plugs ?? {})) {
    out[socketIndex] = plugs.map((plug) => plug.plugItemHash);
  }
  return out;
}

/** Jeu de composants renvoyé par GetProfile pour l'ensemble des objets. */
export interface RawItemComponentSet {
  instances?: { data?: Record<string, RawInstance> };
  stats?: { data?: Record<string, RawStats> };
  sockets?: { data?: Record<string, RawSockets> };
  reusablePlugs?: { data?: Record<string, RawReusablePlugs> };
}

/**
 * Regroupe les composants par itemInstanceId.
 * Un objet peut n'apparaître que dans certains composants (une armure n'a pas
 * de plugs alternatifs, par exemple) : on part donc de l'union des identifiants.
 */
export function buildItemDetails(
  raw: RawItemComponentSet | undefined,
): Record<string, ItemDetail> {
  const instances = raw?.instances?.data ?? {};
  const stats = raw?.stats?.data ?? {};
  const sockets = raw?.sockets?.data ?? {};
  const plugs = raw?.reusablePlugs?.data ?? {};

  const ids = new Set([
    ...Object.keys(instances),
    ...Object.keys(stats),
    ...Object.keys(sockets),
    ...Object.keys(plugs),
  ]);

  const out: Record<string, ItemDetail> = {};
  for (const id of ids) {
    out[id] = {
      instance: trimInstance(instances[id]),
      stats: trimStats(stats[id]),
      sockets: trimSockets(sockets[id]),
      reusablePlugs: trimReusablePlugs(plugs[id]),
    };
  }
  return out;
}
