"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {ARMOR_STAT_ORDER} from "@/lib/destiny/stat-order";
import type {
    EquipableItemSetDefinition,
    StatDefinition,
} from "@/lib/destiny/types";
import type {EquippedSetCounts} from "@/lib/destiny/set-bonus";
import {PlugIcon} from "../tooltip/PlugIcon";

interface StatLine {
    statHash: number;
    value: number;
    name: string;
    icon?: string;
}

/**
 * Statistiques du personnage, avec leur icône du manifeste.
 *
 * Les valeurs viennent telles quelles du composant 200 : Bungie a déjà totalisé
 * armures, mods et fragments équipés. Les recalculer côté client donnerait un
 * résultat faux — les bonus conditionnels ne sont pas reproductibles.
 *
 * Une seule lecture groupée pour les six statistiques : leur icône vit dans
 * `DestinyStatDefinition`, et six souscriptions Dexie pour six icônes fixes
 * seraient six de trop.
 *
 * Seules les six statistiques d'armure sont retenues, dans l'ordre du jeu.
 * `character.stats` en porte une septième — la Puissance (1935470627) — qui n'a
 * rien à faire dans cette barre : elle est déjà affichée sur l'onglet du
 * personnage. Un filtre sur `ARMOR_STAT_ORDER` l'écarte sans avoir à nommer son
 * hash, et écartera de même ce que Bungie ajouterait à côté.
 */
function useStatLines(stats: Record<string, number>): StatLine[] {
    return (
        useLiveQuery(
            async () => {
                const hashes = ARMOR_STAT_ORDER.filter(
                    (hash) => stats[hash] !== undefined,
                );
                if (hashes.length === 0) return [];

                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (hash) => ["DestinyStatDefinition", hash] as [string, number],
                    ),
                );

                return hashes.map((statHash, i) => {
                    const def = rows[i]?.data as StatDefinition | undefined;
                    return {
                        statHash,
                        value: stats[statHash] ?? 0,
                        name: def?.displayProperties?.name ?? "",
                        icon: def?.displayProperties?.icon,
                    } satisfies StatLine;
                });
            },
            // Objet recréé à chaque rendu : la dépendance porte sur son contenu.
            [JSON.stringify(stats)],
            [] as StatLine[],
        ) ?? []
    );
}

/** Perks d'ensemble dont le palier est atteint sur le personnage affiché. */
function useActiveSetPerks(setCounts: EquippedSetCounts): number[] {
    return (
        useLiveQuery(
            async () => {
                const hashes = [...setCounts.keys()];
                if (hashes.length === 0) return [];

                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (hash) =>
                            ["DestinyEquipableItemSetDefinition", hash] as [string, number],
                    ),
                );

                const perks: number[] = [];
                rows.forEach((row, i) => {
                    const set = row?.data as EquipableItemSetDefinition | undefined;
                    const equipped = setCounts.get(hashes[i]) ?? 0;
                    for (const perk of [...(set?.setPerks ?? [])].sort(
                        (a, b) => a.requiredSetCount - b.requiredSetCount,
                    )) {
                        if (equipped >= perk.requiredSetCount) {
                            perks.push(perk.sandboxPerkHash);
                        }
                    }
                });
                return perks;
            },
            [[...setCounts].flat().join(",")],
            [] as number[],
        ) ?? []
    );
}

/**
 * Sous l'équipement : les statistiques totales du personnage, puis les bonus
 * d'ensemble effectivement actifs.
 *
 * Affiché dans les deux modes : c'est un état du personnage, pas une
 * particularité d'une vue.
 */
export function CharacterSummary({
                                     stats,
                                     setCounts,
                                 }: {
    stats: Record<string, number>;
    setCounts: EquippedSetCounts;
}) {
    const lines = useStatLines(stats);
    const activePerks = useActiveSetPerks(setCounts);

    if (lines.length === 0 && activePerks.length === 0) return null;

    return (
        <div className="character-summary">
            {lines.length > 0 && (
                <div className="character-summary__stats">
                    {lines.map((line) => (
                        <span
                            key={line.statHash}
                            className="character-summary__stat"
                            title={line.name}
                        >
                            {line.icon && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`${BUNGIE_ROOT}${line.icon}`}
                                    alt={line.name}
                                    className="character-summary__stat-icon"
                                />
                            )}
                            <span className="character-summary__stat-value">
                                {line.value < 0 ? "0" : line.value}
                            </span>
                        </span>
                    ))}
                </div>
            )}

            {activePerks.length > 0 && (
                <div className="character-summary__bonuses">
                    {activePerks.map((hash) => (
                        <PlugIcon
                            key={hash}
                            hash={hash}
                            table="DestinySandboxPerkDefinition"
                            state="equipped"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
