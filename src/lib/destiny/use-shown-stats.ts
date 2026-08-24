"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "./types";
import {ARMOR_BUCKETS, BUCKET} from "./buckets";
import {ARMOR_STAT_ORDER} from "./stat-order";
import {plugStatModifiers} from "./plug-stats";

const ARMOR_STATS: ReadonlySet<number> = new Set(ARMOR_STAT_ORDER);

const EMPTY: Record<string, number> = {};

/**
 * Statistiques d'armure totalisées à partir d'un ensemble d'objets.
 *
 * À n'employer que lorsque le composant 200 ne répond pas à la question posée —
 * en pratique un équipement **sauvegardé**, qui n'est pas porté : ses totaux
 * n'existent nulle part côté Bungie, il faut donc les reconstituer.
 *
 * Deux sources, et deux seulement :
 *
 * - `detail.stats` de chaque pièce d'armure. Bungie y a déjà fondu les mods
 *   insérés dans la pièce : les additionner une seconde fois les compterait
 *   deux fois.
 * - Les plugs de la doctrine — les fragments, dont l'écart (le « -10 Grenade »
 *   d'Étincelle d'électrocution) vit dans `investmentStats` de leur définition
 *   et nulle part dans les composants d'objet.
 *
 * Le résultat reste une **approximation**, et c'est assumé : l'artéfact
 * saisonnier et les bonus conditionnels ne sont pas reproductibles hors du jeu,
 * et un équipement sauvegardé porte de surcroît ses propres surcharges de plugs
 * (`loadout.items[].plugItemHashes`) que l'objet ne montrera qu'une fois
 * réellement équipé. Là où les vraies valeurs existent — l'équipement porté —
 * c'est `character.stats` qu'il faut afficher.
 */
export function useShownStats(
    items: readonly DestinyItemComponent[],
    details: Record<string, ItemDetail>,
): Record<string, number> {
    return (
        useLiveQuery(
            async () => {
                const totals: Record<string, number> = {};
                const add = (statHash: number, value: number) => {
                    totals[statHash] = (totals[statHash] ?? 0) + value;
                };

                // —— Armures ——
                for (const item of items) {
                    if (!ARMOR_BUCKETS.has(item.bucketHash)) continue;
                    const stats = item.itemInstanceId
                        ? details[item.itemInstanceId]?.stats
                        : undefined;
                    for (const [hash, value] of Object.entries(stats ?? {})) {
                        if (ARMOR_STATS.has(Number(hash))) add(Number(hash), value);
                    }
                }

                // —— Doctrine : fragments et aspects ——
                const subclass = items.find(
                    (item) => item.bucketHash === BUCKET.Subclass,
                );
                const detail = subclass?.itemInstanceId
                    ? details[subclass.itemInstanceId]
                    : undefined;

                // Les emplacements verrouillés sont écartés : une doctrine
                // déverrouille ses emplacements de fragments au fil des aspects
                // équipés, et un fragment resté dans un emplacement désactivé
                // n'apporte rien en jeu.
                const disabled = new Set(detail?.disabledSockets ?? []);
                const plugs = (detail?.sockets ?? []).filter(
                    (hash, index) => hash > 0 && !disabled.has(index),
                );

                if (plugs.length > 0) {
                    const rows = await manifestDb.definitions.bulkGet(
                        plugs.map(
                            (hash) =>
                                ["DestinyInventoryItemDefinition", hash] as [string, number],
                        ),
                    );
                    for (const row of rows) {
                        const def = row?.data as InventoryItemDefinition | undefined;
                        for (const modifier of plugStatModifiers(def)) {
                            if (ARMOR_STATS.has(modifier.statHash)) {
                                add(modifier.statHash, modifier.value);
                            }
                        }
                    }
                }

                return Object.keys(totals).length > 0 ? totals : EMPTY;
            },
            // Les objets sont recréés à chaque rendu : la dépendance porte sur
            // leur identité, pas sur celle du tableau.
            [items.map((item) => item.itemInstanceId ?? item.itemHash).join(",")],
            EMPTY,
        ) ?? EMPTY
    );
}
