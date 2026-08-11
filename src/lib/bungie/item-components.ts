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

/**
 * Avancement d'un objectif porté par un plug équipé.
 *
 * Deux usages : le compte-frags d'une arme (« Ennemis vaincus ») et le niveau
 * d'une arme façonnée. Le libellé et l'icône vivent dans
 * DestinyObjectiveDefinition ; `uiLabel` y distingue le niveau (`crafting_
 * weapon_level`) de sa progression (`crafting_weapon_level_progress`).
 */
export interface PlugObjective {
  objectiveHash: number;
  progress: number;
  /** Palier de complétion — la progression du niveau d'arme est sur 1000 */
  completionValue: number;
  /**
   * Objectif montré en jeu. Les conditions de déblocage des ornements du
   * Solstice arrivent à `false` : on ne les affiche pas. Le drapeau est
   * transmis plutôt que filtré ici, la décision dépendant de l'objectif —
   * niveau d'arme et compte-frags ne se traitent pas de la même façon.
   */
  visible: boolean;
}

export interface ItemDetail {
  instance?: ItemInstanceSummary;
  stats: StatSnapshot;
  sockets: SocketSnapshot;
  /**
   * Index des sockets désactivés (`isEnabled: false`). Sert à distinguer un
   * emplacement **verrouillé** d'un emplacement libre — les doctrines
   * déverrouillent leurs emplacements de fragments au fil des aspects équipés.
   *
   * Absent quand il n'y en a aucun : sur ~1500 objets, sérialiser un tableau
   * vide partout coûtait une trentaine de kilooctets pour rien.
   */
  disabledSockets?: number[];
  reusablePlugs: PlugSnapshot;
  /**
   * Objectifs des plugs **équipés**, indexés par hash de plug. Le plug porteur
   * est conservé : c'est lui qui identifie le compte-frags (sa catégorie de
   * plug), là où le niveau d'arme se reconnaît à l'`uiLabel` de son objectif.
   *
   * Absent quand l'objet n'en a aucun — voir `trimPlugObjectives`.
   */
  plugObjectives?: Record<string, PlugObjective[]>;
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
interface RawPlugObjectives {
  objectivesPerPlug: Record<
    string,
    {
      objectiveHash: number;
      progress?: number;
      completionValue: number;
      visible: boolean;
    }[]
  >;
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

/** Index des sockets verrouillés — voir ItemDetail.disabledSockets. */
export function trimDisabledSockets(raw: RawSockets | undefined): number[] {
  const disabled: number[] = [];
  (raw?.sockets ?? []).forEach((socket, index) => {
    if (!socket.isEnabled) disabled.push(index);
  });
  return disabled;
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

/**
 * Objectifs des plugs — voir ItemDetail.plugObjectives.
 *
 * **Seuls les plugs équipés sont conservés**, et c'est essentiel : l'API renvoie
 * les objectifs de TOUTES les options du socket. Une arme façonnée porte ainsi
 * trois compte-frags (celui en place et ses variantes à 0) et une quinzaine de
 * Mémentos — de quoi afficher le mauvais compteur, et de quoi alourdir la
 * réponse pour rien. Mesuré sur un compte : 923 objets concernés, l'essentiel
 * étant des options jamais équipées.
 */
export function trimPlugObjectives(
  raw: RawPlugObjectives | undefined,
  sockets: RawSockets | undefined,
): Record<string, PlugObjective[]> {
  const equipped = new Set(
    (sockets?.sockets ?? [])
      .map((socket) => socket.plugHash)
      .filter((hash): hash is number => Boolean(hash)),
  );

  const out: Record<string, PlugObjective[]> = {};
  for (const [plugHash, objectives] of Object.entries(
    raw?.objectivesPerPlug ?? {},
  )) {
    if (objectives.length === 0) continue;
    if (!equipped.has(Number(plugHash))) continue;
    out[plugHash] = objectives.map((objective) => ({
      objectiveHash: objective.objectiveHash,
      progress: objective.progress ?? 0,
      completionValue: objective.completionValue,
      visible: objective.visible,
    }));
  }
  return out;
}

/** Jeu de composants renvoyé par GetProfile pour l'ensemble des objets. */
export interface RawItemComponentSet {
  instances?: { data?: Record<string, RawInstance> };
  stats?: { data?: Record<string, RawStats> };
  sockets?: { data?: Record<string, RawSockets> };
  reusablePlugs?: { data?: Record<string, RawReusablePlugs> };
  plugObjectives?: { data?: Record<string, RawPlugObjectives> };
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
  const objectives = raw?.plugObjectives?.data ?? {};

  const ids = new Set([
    ...Object.keys(instances),
    ...Object.keys(stats),
    ...Object.keys(sockets),
    ...Object.keys(plugs),
    ...Object.keys(objectives),
  ]);

  const out: Record<string, ItemDetail> = {};
  for (const id of ids) {
    const disabledSockets = trimDisabledSockets(sockets[id]);
    const plugObjectives = trimPlugObjectives(objectives[id], sockets[id]);
    out[id] = {
      instance: trimInstance(instances[id]),
      stats: trimStats(stats[id]),
      sockets: trimSockets(sockets[id]),
      // Omis quand vide, pour ne pas alourdir la réponse
      ...(disabledSockets.length > 0 ? { disabledSockets } : {}),
      reusablePlugs: trimReusablePlugs(plugs[id]),
      ...(Object.keys(plugObjectives).length > 0 ? { plugObjectives } : {}),
    };
  }
  return out;
}
