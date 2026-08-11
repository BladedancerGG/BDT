"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {
    InventoryItemDefinition,
    ObjectiveDefinition,
} from "@/lib/destiny/types";

/**
 * Étiquettes d'objectifs du façonnage, relevées dans
 * DestinyObjectiveDefinition.uiLabel.
 *
 * On passe par l'`uiLabel` et non par le hash : trois hashes distincts portent
 * `crafting_weapon_level_progress`, et rien ne garantit que Bungie n'en ajoute
 * pas un quatrième.
 */
const UI_LABEL = {
    /** Niveau de l'arme : la progression EST le niveau (palier à 1) */
    weaponLevel: "crafting_weapon_level",
    /** Avancement vers le niveau suivant, sur 1000 */
    weaponLevelProgress: "crafting_weapon_level_progress",
} as const;

/**
 * Compte-frags d'une arme. Deux générations coexistent dans le manifeste :
 * les traqueurs modernes (`…masterworks.trackers`) et les pièces maîtresses
 * d'origine (`…masterworks.generic.weapons.kills`, variante `_pvp`). Les deux
 * portent un objectif avec libellé et icône, donc le même rendu.
 *
 * `ItemDetail.plugObjectives` ne contient que les plugs équipés : sans ce
 * filtrage on tomberait sur l'une des variantes non équipées du traqueur, qui
 * sont à zéro.
 */
const TRACKER_PLUG_CATEGORY = /(?:trackers|\.kills(?:_pvp)?)$/;

/** Compteur affiché sous la puissance : « Ennemis vaincus 1145 ». */
export interface ItemTracker {
    /** Libellé de l'objectif — il vit dans `progressDescription`, pas dans `name` */
    label: string;
    icon?: string;
    value: number;
}

export interface ItemProgress {
    /** Niveau d'une arme façonnée ou améliorée */
    weaponLevel?: number;
    /** Avancement vers le niveau suivant, de 0 à 1 */
    weaponLevelProgress?: number;
    tracker?: ItemTracker;
}

const EMPTY: ItemProgress = {};

/**
 * Niveau d'arme et compte-frags d'un objet, depuis les objectifs de ses plugs
 * (composant 309 de l'API).
 *
 * Les définitions manquent tant que le manifeste n'est pas prêt : on renvoie
 * alors un objet vide, ce qui masque simplement les lignes concernées.
 */
export function useItemProgress(detail: ItemDetail | undefined): ItemProgress {
    return (
        useLiveQuery(
            async () => {
                const entries = Object.entries(detail?.plugObjectives ?? {});
                if (entries.length === 0) return EMPTY;

                // Deux requêtes groupées, jamais une par objectif : les plugs pour
                // reconnaître un compte-frags, les objectifs pour les libellés.
                const plugHashes = entries.map(([hash]) => Number(hash));
                const objectiveHashes = [
                    ...new Set(
                        entries.flatMap(([, objectives]) =>
                            objectives.map((objective) => objective.objectiveHash),
                        ),
                    ),
                ];

                const [plugRows, objectiveRows] = await Promise.all([
                    manifestDb.definitions.bulkGet(
                        plugHashes.map(
                            (hash) =>
                                ["DestinyInventoryItemDefinition", hash] as [string, number],
                        ),
                    ),
                    manifestDb.definitions.bulkGet(
                        objectiveHashes.map(
                            (hash) => ["DestinyObjectiveDefinition", hash] as [string, number],
                        ),
                    ),
                ]);

                const plugDefs = new Map<number, InventoryItemDefinition>();
                plugRows.forEach((row, i) => {
                    if (row) plugDefs.set(plugHashes[i], row.data as InventoryItemDefinition);
                });
                const objectiveDefs = new Map<number, ObjectiveDefinition>();
                objectiveRows.forEach((row, i) => {
                    if (row)
                        objectiveDefs.set(objectiveHashes[i], row.data as ObjectiveDefinition);
                });

                const progress: ItemProgress = {};

                for (const [plugHash, objectives] of entries) {
                    const plugDef = plugDefs.get(Number(plugHash));
                    const isTracker = TRACKER_PLUG_CATEGORY.test(
                        plugDef?.plug?.plugCategoryIdentifier ?? "",
                    );

                    for (const objective of objectives) {
                        const objectiveDef = objectiveDefs.get(objective.objectiveHash);

                        // Repli quand la définition manque (table du manifeste pas
                        // encore téléchargée) : le plug porteur suffit à nommer le
                        // compteur, faute de mieux — « Compte-frags » au lieu de
                        // « Ennemis vaincus ». Le niveau d'arme, lui, n'a pas de repli :
                        // seul l'`uiLabel` de l'objectif distingue ses trois valeurs.
                        if (!objectiveDef) {
                            if (isTracker && objective.visible && !progress.tracker) {
                                const label = plugDef?.displayProperties?.name;
                                if (label) {
                                    progress.tracker = {
                                        label,
                                        icon: plugDef?.displayProperties?.icon,
                                        value: objective.progress,
                                    };
                                }
                            }
                            continue;
                        }

                        if (objectiveDef.uiLabel === UI_LABEL.weaponLevel) {
                            progress.weaponLevel = objective.progress;
                            continue;
                        }
                        if (objectiveDef.uiLabel === UI_LABEL.weaponLevelProgress) {
                            // Le palier vient de l'instance : la définition annonce 1000,
                            // mais c'est la valeur renvoyée par l'API qui fait foi.
                            const target =
                                objective.completionValue || objectiveDef.completionValue;
                            if (target > 0) {
                                progress.weaponLevelProgress = Math.min(
                                    1,
                                    objective.progress / target,
                                );
                            }
                            continue;
                        }

                        // Un seul compteur affiché : le premier suffit, une arme n'a
                        // qu'un traqueur équipé à la fois. Le drapeau `visible` n'est
                        // exigé qu'ici — les objectifs de façonnage ci-dessus sont
                        // affichés quel qu'il soit, faute de pouvoir le vérifier sur
                        // une arme façonnée.
                        if (isTracker && objective.visible && !progress.tracker) {
                            const label = objectiveDef.progressDescription?.trim();
                            if (label) {
                                progress.tracker = {
                                    label,
                                    icon: objectiveDef.displayProperties?.icon,
                                    value: objective.progress,
                                };
                            }
                        }
                    }
                }

                return progress;
            },
            [detail],
            EMPTY,
        ) ?? EMPTY
    );
}
