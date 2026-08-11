"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {plugStatModifiers} from "./plug-stats";

/**
 * Catégories de plugs dont l'apport est mis en avant dans les barres de
 * statistiques.
 *
 * - Pièce maîtresse : toutes ces catégories portent « masterwork » dans leur
 *   identifiant, les génériques (`v400.plugs.weapons.masterworks.stat.range`,
 *   `v460.plugs.armor.masterworks…`) comme les catalyseurs exotiques, dont
 *   l'identifiant est propre à chaque arme (`v400.new.trace_rifle0.masterwork`).
 * - Archétype : c'est l'attribut intrinsèque, famille `intrinsics`. Sur une arme
 *   c'est son armature (« Armature adaptative » : +10 rechargement, +2 portée,
 *   maniement, stabilité…), et les intrinsèques d'armure exotique partagent la
 *   même famille.
 *
 * Les archétypes d'armure (`armor_archetypes`) sont hors sujet : leur définition
 * a un `investmentStats` vide, le bonus est déjà fondu dans les statistiques de
 * la pièce.
 */
const HIGHLIGHTED_PLUG_CATEGORY = /masterwork|^intrinsics$/i;

/** Écart mis en avant, par hash de statistique. */
export type StatBonuses = Record<number, number>;

const EMPTY: StatBonuses = {};

/**
 * Part des statistiques d'un objet due à sa pièce maîtresse et à son archétype.
 *
 * `detail.stats` renvoie déjà le total, bonus compris : ces valeurs servent à en
 * détacher le dernier segment dans les barres, comme le fait le jeu.
 */
export function useStatBonuses(detail: ItemDetail | undefined): StatBonuses {
    return (
        useLiveQuery(
            async () => {
                // Un socket vaut 0 (vide) ou null (masqué en jeu) — ni l'un ni l'autre
                // ne porte de plug.
                const equipped = [
                    ...new Set(
                        (detail?.sockets ?? []).filter(
                            (hash): hash is number => typeof hash === "number" && hash > 0,
                        ),
                    ),
                ];
                if (equipped.length === 0) return EMPTY;

                const rows = await manifestDb.definitions.bulkGet(
                    equipped.map(
                        (hash) =>
                            ["DestinyInventoryItemDefinition", hash] as [string, number],
                    ),
                );

                const bonuses: StatBonuses = {};
                for (const row of rows) {
                    const def = row?.data as InventoryItemDefinition | undefined;
                    const category = def?.plug?.plugCategoryIdentifier;
                    if (!category || !HIGHLIGHTED_PLUG_CATEGORY.test(category)) continue;

                    // Réutilise la liste blanche des statistiques présentables : ces
                    // plugs portent aussi des valeurs internes (Défense, coût
                    // d'énergie…) qui n'ont pas de barre.
                    for (const modifier of plugStatModifiers(def)) {
                        bonuses[modifier.statHash] =
                            (bonuses[modifier.statHash] ?? 0) + modifier.value;
                    }
                }

                return Object.keys(bonuses).length > 0 ? bonuses : EMPTY;
            },
            [detail],
            EMPTY,
        ) ?? EMPTY
    );
}
