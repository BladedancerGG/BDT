// Lectures de la page de statistiques d'administration. Serveur uniquement.

import { prisma } from "@/lib/db/prisma";
import { isEmptyLoadout } from "@/lib/loadouts/loadout";
import type { LoadoutGroup } from "@/lib/loadouts/groups/types";
import { sharePath, type ShareKind } from "@/lib/loadouts/share/types";
import { appUrl } from "@/lib/app-url";
import { BUNGIE_CALL_STATUSES, type BungieCallStatus } from "@/lib/bungie/call-log";
import {
  endpointChoice,
  filterRows,
  parseEndpointChoice,
  type CellValue,
  type NumberOp,
  type TableFilters,
} from "./filters";
import { sortRows, type SortState } from "./sort";
import type { Prisma } from "@/generated/prisma/client";

export interface AdminUserRow {
  /** Clé de ligne uniquement : ni affiché, ni filtrable, ni triable */
  id: string;
  displayName: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  admin: boolean;
}

export function listUsers(): Promise<AdminUserRow[]> {
  // `select` explicite : les jetons OAuth ne doivent pas quitter cette fonction.
  return prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      lastSeenAt: true,
      admin: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Valeur d'une colonne, pour les filtres comme pour le tri : les deux
 * doivent lire la même chose, sans quoi on trierait sur ce qu'on ne filtre pas.
 */
function userCell(row: AdminUserRow, key: string): CellValue {
  switch (key) {
    case "displayName":
      return row.displayName;
    case "createdAt":
      return row.createdAt;
    case "lastSeenAt":
      return row.lastSeenAt;
    case "admin":
      return row.admin ? "yes" : "no";
  }
}

export function filterUsers(rows: AdminUserRow[], filters: TableFilters): AdminUserRow[] {
  return filterRows(rows, filters, userCell);
}

export function sortUsers(rows: AdminUserRow[], sort: SortState | null): AdminUserRow[] {
  return sortRows(rows, sort, userCell);
}

export interface AdminGroupRow {
  key: string;
  name: string;
  color?: string;
  user: string;
  /** Emplacements non vides — un groupe en compte toujours autant que le personnage */
  loadouts: number;
}

/**
 * Les groupes déposés en base.
 *
 * Ceux d'un compte dont la synchronisation est coupée n'y sont pas : ils ne
 * vivent alors que dans le stockage local de son navigateur.
 */
export async function listGroups(): Promise<AdminGroupRow[]> {
  const rows = await prisma.userLoadoutGroups.findMany({
    select: { data: true, user: { select: { displayName: true } } },
  });
  const groups: AdminGroupRow[] = [];
  for (const row of rows) {
    // Le JSON a été validé à l'écriture (/api/loadout-groups) ; on reste
    // prudent quand même, une ligne d'un ancien format ne doit pas casser la page.
    if (!Array.isArray(row.data)) continue;
    for (const group of row.data as unknown as LoadoutGroup[]) {
      if (!group || typeof group.name !== "string") continue;
      groups.push({
        key: `${row.user.displayName}:${group.id}`,
        name: group.name,
        color: group.color,
        user: row.user.displayName,
        loadouts: Array.isArray(group.loadouts)
          ? group.loadouts.filter((l) => !isEmptyLoadout(l)).length
          : 0,
      });
    }
  }
  return groups.sort((a, b) => a.user.localeCompare(b.user) || a.name.localeCompare(b.name));
}

function groupCell(row: AdminGroupRow, key: string): CellValue {
  switch (key) {
    case "name":
      return row.name;
    case "user":
      return row.user;
    case "loadouts":
      return row.loadouts;
  }
}

export function filterGroups(rows: AdminGroupRow[], filters: TableFilters): AdminGroupRow[] {
  return filterRows(rows, filters, groupCell);
}

export function sortGroups(rows: AdminGroupRow[], sort: SortState | null): AdminGroupRow[] {
  return sortRows(rows, sort, groupCell);
}

export interface AdminShareRow {
  id: string;
  url: string;
  kind: ShareKind;
  name: string;
  user: string;
  createdAt: Date;
}

export async function listShares(): Promise<AdminShareRow[]> {
  // Sans `data` : l'instantané pèse des dizaines de Ko par partage.
  const rows = await prisma.sharedLoadout.findMany({
    select: {
      id: true,
      kind: true,
      name: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => {
    const kind: ShareKind = row.kind === "group" ? "group" : "loadout";
    return {
      id: row.id,
      url: appUrl(sharePath(kind, row.id, row.name)).toString(),
      kind,
      name: row.name,
      user: row.user.displayName,
      createdAt: row.createdAt,
    };
  });
}

function shareCell(row: AdminShareRow, key: string): CellValue | CellValue[] {
  switch (key) {
    // Le lien s'affiche sous son nom, suivi de l'identifiant : chercher
    // l'un ou l'autre — ou un morceau d'URL collé — doit le trouver. Le tri,
    // lui, prend la première valeur : le nom, celui qu'on lit.
    case "link":
      return [row.name, row.id, row.url];
    case "kind":
      return row.kind;
    case "user":
      return row.user;
    case "createdAt":
      return row.createdAt;
  }
}

export function filterShares(rows: AdminShareRow[], filters: TableFilters): AdminShareRow[] {
  return filterRows(rows, filters, shareCell);
}

export function sortShares(rows: AdminShareRow[], sort: SortState | null): AdminShareRow[] {
  return sortRows(rows, sort, shareCell);
}

export interface AdminCallRow {
  id: string;
  method: string;
  endpoint: string;
  status: BungieCallStatus;
  httpStatus: number | null;
  error: string | null;
  attempts: number;
  durationMs: number | null;
  user: string | null;
  createdAt: Date;
}

export const CALLS_PAGE_SIZE = 50;

export interface AdminCallsPage {
  rows: AdminCallRow[];
  /** Appels qui passent les filtres */
  total: number;
  /** Tous les appels, filtres ignorés */
  overall: number;
  /** Nombre d'appels par statut, parmi ceux qui passent les filtres */
  byStatus: Record<BungieCallStatus, number>;
  page: number;
  pages: number;
}

function asStatus(raw: string): BungieCallStatus {
  return (BUNGIE_CALL_STATUSES as readonly string[]).includes(raw)
    ? (raw as BungieCallStatus)
    : "failure";
}

/** Clause Prisma d'une comparaison numérique */
function numberWhere(op: NumberOp, value: number): Prisma.IntNullableFilter {
  return op === "eq" ? { equals: value } : { [op]: value };
}

/**
 * Filtres des appels traduits en clause SQL.
 *
 * En base et non en mémoire, contrairement aux trois autres tableaux : la
 * table n'est jamais purgée, et la pagination doit porter sur les lignes
 * filtrées. La sémantique reste celle de `filterRows` (lib/admin/filters.ts) :
 * texte insensible à la casse, bornes incluses, valeur absente jamais retenue.
 */
function callsWhere(filters: TableFilters): Prisma.BungieApiWhereInput {
  const and: Prisma.BungieApiWhereInput[] = [];
  for (const [key, filter] of Object.entries(filters)) {
    switch (filter.kind) {
      case "text":
        if (key === "user") {
          and.push({ user: { displayName: { contains: filter.text, mode: "insensitive" } } });
        }
        break;
      case "date":
        if (key === "date") {
          and.push({
            createdAt: {
              ...(filter.min ? { gte: new Date(filter.min) } : {}),
              ...(filter.max ? { lte: new Date(filter.max) } : {}),
            },
          });
        }
        break;
      case "number": {
        const field = { attempts: "attempts", duration: "durationMs" }[key];
        if (field) and.push({ [field]: numberWhere(filter.op, filter.value) });
        break;
      }
      case "choice":
        if (key === "status") and.push({ status: { in: filter.values } });
        if (key === "httpStatus") {
          const codes = filter.values.map(Number).filter(Number.isInteger);
          // Aucune option valide : aucun appel, plutôt que tous (comme les points d'entrée).
          and.push({ httpStatus: { in: codes } });
        }
        if (key === "endpoint") {
          const pairs = filter.values
            .map(parseEndpointChoice)
            .filter((p): p is { method: string; endpoint: string } => p !== null);
          // Aucune option valide : aucun appel, plutôt que tous.
          and.push(pairs.length ? { OR: pairs } : { id: { in: [] } });
        }
        break;
    }
  }
  return and.length ? { AND: and } : {};
}

/**
 * Ordre SQL des appels.
 *
 * Mêmes règles que `sortRows` : les valeurs absentes en dernier dans les deux
 * sens (`nulls: "last"`), et l'ordre par défaut — du plus récent au plus
 * ancien — départage les égalités, sans quoi une page pourrait répéter ou
 * sauter des lignes d'une requête à l'autre.
 */
function callsOrderBy(sort: SortState | null): Prisma.BungieApiOrderByWithRelationInput[] {
  const fallback: Prisma.BungieApiOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
  if (!sort) return fallback;
  const dir = sort.dir;
  switch (sort.key) {
    case "endpoint":
      return [{ endpoint: dir }, { method: dir }, ...fallback];
    case "user":
      // Prisma ne sait pas placer les nulls d'une relation : les appels sans
      // utilisateur suivent la règle de Postgres (derniers en croissant,
      // premiers en décroissant).
      return [{ user: { displayName: dir } }, ...fallback];
    case "date":
      return [{ createdAt: dir }, { id: dir }];
    case "status":
      return [{ status: dir }, ...fallback];
    case "duration":
      return [{ durationMs: { sort: dir, nulls: "last" } }, ...fallback];
    default:
      return fallback;
  }
}

/**
 * Tous les points d'entrée jamais appelés, pour la liste à cocher — d'après
 * la table entière et non la page affichée, ni les filtres en cours.
 */
export async function listEndpoints(): Promise<string[]> {
  const rows = await prisma.bungieApi.groupBy({
    by: ["method", "endpoint"],
    orderBy: [{ endpoint: "asc" }, { method: "asc" }],
  });
  return rows.map((r) => endpointChoice(r.method, r.endpoint));
}

/**
 * Tous les statuts HTTP reçus, pour la liste à cocher — d'après la table
 * entière, comme les points d'entrée. Les appels sans réponse (panne réseau,
 * délai dépassé) n'en ont pas et n'y figurent donc pas.
 */
export async function listHttpStatuses(): Promise<number[]> {
  const rows = await prisma.bungieApi.groupBy({
    by: ["httpStatus"],
    where: { httpStatus: { not: null } },
    orderBy: { httpStatus: "asc" },
  });
  return rows.map((r) => r.httpStatus).filter((s): s is number => s !== null);
}

/** Une page d'appels, du plus récent au plus ancien. La table n'est jamais purgée. */
export async function listCalls(
  requestedPage: number,
  filters: TableFilters = {},
  sort: SortState | null = null,
): Promise<AdminCallsPage> {
  const where = callsWhere(filters);
  const [total, overall, grouped] = await Promise.all([
    prisma.bungieApi.count({ where }),
    prisma.bungieApi.count(),
    prisma.bungieApi.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / CALLS_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);

  const rows = await prisma.bungieApi.findMany({
    where,
    orderBy: callsOrderBy(sort),
    skip: (page - 1) * CALLS_PAGE_SIZE,
    take: CALLS_PAGE_SIZE,
    include: { user: { select: { displayName: true } } },
  });

  const byStatus = Object.fromEntries(
    BUNGIE_CALL_STATUSES.map((status) => [status, 0]),
  ) as Record<BungieCallStatus, number>;
  for (const g of grouped) byStatus[asStatus(g.status)] += g._count._all;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      method: row.method,
      endpoint: row.endpoint,
      status: asStatus(row.status),
      httpStatus: row.httpStatus,
      error: row.error,
      attempts: row.attempts,
      durationMs: row.durationMs,
      user: row.user?.displayName ?? null,
      createdAt: row.createdAt,
    })),
    total,
    overall,
    byStatus,
    page,
    pages,
  };
}
