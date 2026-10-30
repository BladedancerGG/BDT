"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {SocketSnapshot} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition, StatGroupDefinition} from "./types";
import {NO_BAR_STATS} from "./stat-order";
import {isCrafted, isEnhanced, isMasterwork} from "./overlays";
import {
    armorBaseStats,
    breakdownStats,
    enhancementTier,
    type StatBreakdown,
    type StatScale,
} from "./stat-breakdown";

export type StatBreakdowns = Record<number, StatBreakdown>;

const EMPTY: StatBreakdowns = {};

interface BreakdownRequest {
    def: InventoryItemDefinition | undefined;
    detail: ItemDetail | undefined;
    shownSockets: SocketSnapshot | undefined;
    statHashes: readonly number[];
    /** Les notes d'arme plafonnent à 100 ; celles d'armure ne plafonnent pas. */
    weapon: boolean;
    state: number | undefined;
    gearTier: number | undefined;
    /** Niveau d'une arme façonnée ou améliorée — voir `useItemProgress` */
    weaponLevel: number | undefined;
}

/**
 * Lecture et calcul derrière `useStatBreakdown`, à appeler dans une requête
 * Dexie. Exportée pour les statistiques du personnage, qui la rejouent sur
 * chacune de ses pièces d'armure (`useCharacterStatBreakdown`).
 */
export async function loadStatBreakdown({
    def,
    detail,
    shownSockets,
    statHashes,
    weapon,
    state,
    gearTier,
    weaponLevel,
}: BreakdownRequest): Promise<StatBreakdowns> {
    const statSockets = detail?.statSockets ?? detail?.sockets;
    const statGroupHash = def?.stats?.statGroupHash;
    if (!detail || !statSockets || statHashes.length === 0) return EMPTY;

    // Un socket désactivé n'apporte rien en jeu ; un socket masqué
    // n'est lu que pour la base d'une armure (ses `armor_stats`).
    const disabled = new Set(detail.disabledSockets ?? []);
    const hidden = new Set(detail.hiddenSockets ?? []);
    const shown = shownSockets ?? statSockets;

    const hashes = new Set<number>();
    for (const sockets of [statSockets, shown]) {
        sockets.forEach((hash, index) => {
            if (hash > 0 && !disabled.has(index)) hashes.add(hash);
        });
    }
    const list = [...hashes];

    const [rows, group] = await Promise.all([
        manifestDb.definitions.bulkGet(
            list.map(
                (hash) =>
                    ["DestinyInventoryItemDefinition", hash] as [string, number],
            ),
        ),
        statGroupHash
            ? manifestDb.definitions.get([
                "DestinyStatGroupDefinition",
                statGroupHash,
            ])
            : undefined,
    ]);
    const defs = new Map<number, InventoryItemDefinition | undefined>();
    list.forEach((hash, i) =>
        defs.set(hash, rows[i]?.data as InventoryItemDefinition | undefined),
    );

    const plugs = (sockets: SocketSnapshot) =>
        sockets
            .map((hash, index) =>
                hash > 0 && !disabled.has(index) && !hidden.has(index)
                    ? defs.get(hash)
                    : undefined,
            )
            .filter(Boolean);

    const scales: Record<number, StatScale> = {};
    const groupDef = group?.data as StatGroupDefinition | undefined;
    for (const scaled of groupDef?.scaledStats ?? []) {
        scales[scaled.statHash] = scaled;
    }

    const all = statSockets.map((hash) => defs.get(hash));
    return breakdownStats({
        totals: detail.stats,
        statPlugs: plugs(statSockets),
        shownPlugs: plugs(shown),
        statHashes,
        // Pas de courbe pour l'armure : ses statistiques sont 1:1,
        // et le plafond de 200 d'un personnage ne vaut pas pour
        // une pièce.
        scales: weapon ? scales : undefined,
        maximum: (statHash) =>
            weapon && !NO_BAR_STATS.has(statHash) ? 100 : Infinity,
        gearTier: gearTier ?? 0,
        masterworked: isMasterwork(state),
        craftedOrEnhanced: isCrafted(state) || isEnhanced(state),
        weaponLevel,
        adept: def?.isAdept === true,
        // Lu sur tous les sockets, masqués compris, comme DIM.
        enhancementTier: enhancementTier(statSockets),
        armorBase: armorBaseStats(all),
    });
}

/**
 * Décomposition des statistiques d'une arme ou d'une armure, attributs
 * **montrés** appliqués.
 *
 * `shownSockets` est ce que l'infobulle affiche : insertion en attente ou
 * instantané de groupe compris. Les barres suivent donc un changement
 * d'attribut sur-le-champ, sans attendre que Bungie renvoie les totaux.
 *
 * `detail.statSockets` dit à quels sockets correspondent les totaux de l'API —
 * voir `ItemDetail.statSockets`.
 */
export function useStatBreakdown(request: BreakdownRequest): StatBreakdowns {
    const {def, detail, shownSockets, statHashes, weapon, state, gearTier, weaponLevel} =
        request;
    const statSockets = detail?.statSockets ?? detail?.sockets;
    const statGroupHash = def?.stats?.statGroupHash;

    return (
        useLiveQuery(
            () => loadStatBreakdown(request),
            [detail, statSockets, shownSockets, statHashes.join(","), def, statGroupHash, weapon, state, gearTier, weaponLevel],
            EMPTY,
        ) ?? EMPTY
    );
}
