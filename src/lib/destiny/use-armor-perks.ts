"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {InventoryItemDefinition} from "@/lib/destiny/types";

/** Archétype de la pièce : « Démolisseur », « Parangon »… (12 en tout) */
const ARCHETYPE = "armor_archetypes";
/**
 * Attribut intrinsèque, propre aux armures exotiques. Ces plugs partagent la
 * famille `intrinsics` avec les armatures d'armes, mais sur une armure ils sont
 * les seuls de cette famille.
 *
 * Exporté : le mode « équipements » repère le même plug, et deux littéraux
 * feraient deux vérités.
 */
export const ARMOR_INTRINSIC_PLUG_CATEGORY = "intrinsics";
const INTRINSIC = ARMOR_INTRINSIC_PLUG_CATEGORY;
/** Mods d'ajustement, propres aux armures de palier 5 */
const TUNING = "core.gear_systems.armor_tiering.plugs.tuning.mods";

/**
 * Écart qu'un mod d'ajustement porte sur la statistique ajustée. Les 30 mods
 * « +X / -Y » du manifeste valent tous ±5 ; « Ajustement équilibré » (+1
 * partout) est écarté par la forme même du gabarit : un seul gain, de 5.
 */
const TUNING_STEP = 5;

export interface ArmorPerks {
    archetypeHash?: number;
    intrinsicHash?: number;
    /**
     * Statistique « ajustée » d'une armure de palier 5. Elle est tirée au sort
     * à la fabrication et **n'existe nulle part dans la définition de l'objet**
     * — le manifeste ne fait que la mentionner (« Available mods will be
     * aligned with this armor's Tuned stat, which is randomly selected »).
     *
     * Elle se lit donc à l'envers, par les mods d'ajustement que l'instance
     * accepte : ils gagnent tous ±5 sur la même statistique, celle-là. Rien
     * n'est déduit quand ils ne s'accordent pas — mieux vaut ne pas afficher le
     * repère que d'en afficher un faux.
     */
    tunedStatHash?: number;
}

const EMPTY: ArmorPerks = {};

/**
 * Archétype et attribut intrinsèque d'une armure, tels qu'équipés sur
 * l'instance.
 *
 * Les deux vivent dans la catégorie « Attributs de l'armure », mêlés à trois
 * emplacements de statistiques — dont les 180 plugs sont **tous** sans nom ni
 * icône dans le manifeste, de simples réservations. Seule la catégorie de plug
 * les distingue, d'où la lecture de leurs définitions ; on balaie tous les
 * sockets équipés plutôt que cette seule catégorie, pour ne pas dépendre de
 * l'endroit où Bungie les rangera demain.
 */
export function useArmorPerks(
    detail: ItemDetail | undefined,
): ArmorPerks {
    return (
        useLiveQuery(
            async () => {
                // 0 = socket vide, null = socket masqué en jeu
                const hashes = [
                    ...new Set(
                        (detail?.sockets ?? []).filter(
                            (hash): hash is number => typeof hash === "number" && hash > 0,
                        ),
                    ),
                ];
                if (hashes.length === 0) return EMPTY;

                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (hash) =>
                            ["DestinyInventoryItemDefinition", hash] as [string, number],
                    ),
                );

                const perks: ArmorPerks = {};
                // Le socket d'ajustement se repère à son plug en place — vide ou
                // non, il est de la même famille : son indice donne ensuite les
                // mods que l'instance propose.
                const tuningPlugs = new Set<number>();
                rows.forEach((row, i) => {
                    const category = (row?.data as InventoryItemDefinition | undefined)?.plug
                        ?.plugCategoryIdentifier;
                    if (category === ARCHETYPE) perks.archetypeHash ??= hashes[i];
                    if (category === INTRINSIC) perks.intrinsicHash ??= hashes[i];
                    if (category === TUNING) tuningPlugs.add(hashes[i]);
                });

                const tuningIndex = (detail?.sockets ?? []).findIndex((hash) =>
                    tuningPlugs.has(hash),
                );
                if (tuningIndex >= 0) {
                    perks.tunedStatHash = await tunedStat(
                        detail?.reusablePlugs?.[String(tuningIndex)] ?? [],
                        detail?.sockets?.[tuningIndex],
                    );
                }

                return perks.archetypeHash || perks.intrinsicHash || perks.tunedStatHash
                    ? perks
                    : EMPTY;
            },
            [detail],
            EMPTY,
        ) ?? EMPTY
    );
}

/**
 * Statistique ajustée déduite d'un jeu de mods d'ajustement.
 *
 * Le mod déjà en place suffit quand il y en a un ; sinon on prend les options
 * proposées par l'instance (composant 310), que le jeu a déjà restreintes à la
 * statistique ajustée. Un seul gain de +5 par mod, et le même pour tous : à la
 * moindre divergence on ne conclut rien.
 */
async function tunedStat(
    options: number[],
    equipped: number | undefined,
): Promise<number | undefined> {
    const candidates = [...new Set([...(equipped ? [equipped] : []), ...options])];
    if (candidates.length === 0) return undefined;

    const rows = await manifestDb.definitions.bulkGet(
        candidates.map(
            (hash) => ["DestinyInventoryItemDefinition", hash] as [string, number],
        ),
    );

    let found: number | undefined;
    for (const row of rows) {
        const stats = (row?.data as InventoryItemDefinition | undefined)?.investmentStats;
        const gains = (stats ?? []).filter((stat) => stat.value === TUNING_STEP);
        // « Ajustement équilibré » (+1 partout) et le socket vide n'ont aucun
        // gain de +5 : ils ne disent rien de la statistique ajustée.
        if (gains.length !== 1) continue;
        if (found !== undefined && found !== gains[0].statTypeHash) return undefined;
        found = gains[0].statTypeHash;
    }

    return found;
}
