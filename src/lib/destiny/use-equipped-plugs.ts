"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {
    EquipableItemSetDefinition,
    InventoryItemDefinition,
} from "./types";
import {ITEM_TYPE, SOCKET_CATEGORY} from "./display";
import {
    ARTIFACT_SOCKET_CATEGORIES,
    isHiddenSocketPlug,
    isMasterworkPlug,
    isPlugApplied,
    isTrackerPlug,
} from "./sockets";
import {ABILITY_ORDER, isSubclass, subclassSocketKind} from "./subclass";
import {itemSetHash, type EquippedSetCounts} from "./set-bonus";
import {ARMOR_INTRINSIC_PLUG_CATEGORY} from "./use-armor-perks";

/**
 * Une icône de la ligne d'un objet, en mode « équipements ».
 *
 * `active` ne concerne que les bonus d'ensemble : ce sont les seuls à s'afficher
 * alors qu'ils ne sont pas acquis — la maquette les veut visibles « actif ou
 * non », comme en jeu. Partout ailleurs l'icône n'est là que parce que le plug
 * est équipé.
 */
export interface PlugChip {
    /** Unique dans sa ligne : un même plug peut occuper deux sockets */
    key: string;
    hash: number;
    /**
     * Socket d'origine, quand il y en a un : c'est lui qui rend l'icône
     * modifiable. Absent des bonus d'ensemble, qui ne sont pas équipés sur
     * l'objet mais conférés par la panoplie.
     */
    socketIndex?: number;
    /** Carrée pour les mods et les compétences, ronde pour les attributs */
    square: boolean;
    /** Table du manifeste — les bonus d'ensemble vivent dans les perks */
    table?: string;
    /**
     * Signaler les versions améliorées d'attributs. Réservé aux colonnes
     * d'attributs d'arme, seules à en contenir — voir `isEnhancedPlug`.
     */
    markEnhanced?: boolean;
    active: boolean;
}

/**
 * Les attributs d'un objet, en une ou deux lignes.
 *
 * Deux lignes pour les seules doctrines : compétences et aspects d'abord, les
 * fragments ensuite — ils sont jusqu'à six et ne tiendraient pas à côté.
 */
export type PlugChipRows = PlugChip[][];

const EMPTY: ReadonlyMap<number, PlugChipRows> = new Map();

/** Index de sockets d'une catégorie, dans l'ordre de la définition. */
function categoryIndexes(
    def: InventoryItemDefinition | undefined,
    categoryHashes: readonly number[],
): number[] {
    return categoryHashes.flatMap(
        (hash) =>
            def?.sockets?.socketCategories?.find(
                (category) => category.socketCategoryHash === hash,
            )?.socketIndexes ?? [],
    );
}

/**
 * Attributs et mods équipés de chaque objet, prêts à l'affichage.
 *
 * **Une seule requête groupée** pour tout l'équipement affiché, comme
 * `ItemDefsProvider` : la nature d'un plug ne se lit que dans sa définition
 * (`plugCategoryIdentifier`), et une lecture par icône remettrait en place les
 * dizaines de souscriptions Dexie que le projet a passé du temps à supprimer.
 *
 * Le résultat est indexé par `bucketHash` : c'est la clé dont les lignes
 * disposent, un emplacement ne portant qu'un objet équipé.
 */
export function useEquippedPlugs(
    items: readonly DestinyItemComponent[],
    details: Record<string, ItemDetail>,
    defs: Map<number, InventoryItemDefinition>,
    setCounts: EquippedSetCounts,
    /**
     * Sockets **enregistrés** dans un équipement sauvegardé, par
     * itemInstanceId. Absent : c'est l'état courant des objets qui fait foi.
     * Voir `savedSockets` — un équipement enregistre ses attributs, et montrer
     * ceux que l'objet porte aujourd'hui décrirait un autre instantané.
     */
    savedSockets?: ReadonlyMap<string, number[]>,
): ReadonlyMap<number, PlugChipRows> {
    return (
        useLiveQuery(
            async () => {
                if (items.length === 0) return EMPTY;

                // Tous les plugs équipés de tous les objets, en une lecture. On y
                // ajoute les plugs **d'origine** des sockets : ce sont eux qui
                // disent quels emplacements le jeu n'affiche pas (boost de niveau
                // d'arme, palier d'amélioration) — voir isHiddenSocketPlug.
                const plugHashes = new Set<number>();
                const setHashes = new Set<number>();
                for (const item of items) {
                    const def = defs.get(item.itemHash);
                    const detail = item.itemInstanceId
                        ? details[item.itemInstanceId]
                        : undefined;
                    const saved = item.itemInstanceId
                        ? savedSockets?.get(item.itemInstanceId)
                        : undefined;
                    for (const hash of saved ?? detail?.sockets ?? []) {
                        if (hash > 0) plugHashes.add(hash);
                    }
                    for (const entry of def?.sockets?.socketEntries ?? []) {
                        if (entry.singleInitialItemHash) {
                            plugHashes.add(entry.singleInitialItemHash);
                        }
                    }
                    const set = itemSetHash(def);
                    if (set) setHashes.add(set);
                }

                const plugList = [...plugHashes];
                const plugRows = await manifestDb.definitions.bulkGet(
                    plugList.map(
                        (hash) =>
                            ["DestinyInventoryItemDefinition", hash] as [string, number],
                    ),
                );
                const plugDefs = new Map<number, InventoryItemDefinition>();
                plugRows.forEach((row, i) => {
                    if (row) plugDefs.set(plugList[i], row.data as InventoryItemDefinition);
                });

                const setList = [...setHashes];
                const setRows = await manifestDb.definitions.bulkGet(
                    setList.map(
                        (hash) =>
                            ["DestinyEquipableItemSetDefinition", hash] as [string, number],
                    ),
                );
                const setDefs = new Map<number, EquipableItemSetDefinition>();
                setRows.forEach((row, i) => {
                    if (row) setDefs.set(setList[i], row.data as EquipableItemSetDefinition);
                });

                const result = new Map<number, PlugChipRows>();

                for (const item of items) {
                    const def = defs.get(item.itemHash);
                    if (!def) continue;
                    const detail = item.itemInstanceId
                        ? details[item.itemInstanceId]
                        : undefined;
                    // L'équipement sauvegardé fait foi quand il y en a un.
                    const sockets =
                        (item.itemInstanceId
                            ? savedSockets?.get(item.itemInstanceId)
                            : undefined) ??
                        detail?.sockets ??
                        [];
                    const hidden = new Set(detail?.hiddenSockets ?? []);
                    const disabled = new Set(detail?.disabledSockets ?? []);

                    /** Plug équipé d'un socket, une fois les exclusions appliquées. */
                    const plugAt = (index: number): number | undefined => {
                        if (hidden.has(index)) return undefined;
                        const hash = sockets[index];
                        if (!hash || hash <= 0) return undefined;
                        // Le compte-frags est déjà repris dans le résumé de l'arme,
                        // et les emplacements techniques n'ont jamais d'icône en jeu.
                        if (isTrackerPlug(plugDefs.get(hash))) return undefined;
                        // Pièces maîtresses et catalyseurs sont écartés de cette
                        // vue : ils ne se changent pas gratuitement, et leur
                        // icône dit seulement « cet objet est amélioré » — ce
                        // que la vignette signale déjà.
                        if (isMasterworkPlug(plugDefs.get(hash))) return undefined;
                        const initial =
                            def.sockets?.socketEntries?.[index]?.singleInitialItemHash;
                        if (isHiddenSocketPlug(plugDefs.get(initial ?? 0))) return undefined;
                        return hash;
                    };

                    /** Chips d'une liste de catégories de sockets. */
                    const fromCategories = (
                        categoryHashes: readonly number[],
                        square: boolean,
                        prefix: string,
                        options: {
                            /** Ne garder que les emplacements réellement remplis */
                            appliedOnly?: boolean;
                            markEnhanced?: boolean;
                        } = {},
                    ): PlugChip[] =>
                        categoryIndexes(def, categoryHashes).flatMap((index) => {
                            const hash = plugAt(index);
                            if (!hash) return [];
                            if (options.appliedOnly && !isPlugApplied(def, index, hash)) {
                                return [];
                            }
                            return [
                                {
                                    key: `${prefix}-${index}`,
                                    hash,
                                    socketIndex: index,
                                    square,
                                    markEnhanced: options.markEnhanced,
                                    active: true,
                                } satisfies PlugChip,
                            ];
                        });

                    const rows: PlugChipRows = [];

                    if (isSubclass(def)) {
                        // Les catégories de sockets d'une doctrine changent avec la
                        // classe et l'élément : c'est la famille du plug équipé qui
                        // donne sa nature (voir subclass.ts).
                        const classified = sockets
                            .map((hash, index) => ({hash, index}))
                            .filter((s) => s.hash > 0)
                            .map((s) => ({
                                ...s,
                                kind: subclassSocketKind(
                                    plugDefs.get(s.hash)?.plug?.plugCategoryIdentifier,
                                ),
                            }));

                        const chip = (
                            s: (typeof classified)[number],
                        ): PlugChip => ({
                            key: `subclass-${s.index}`,
                            hash: s.hash,
                            socketIndex: s.index,
                            square: true,
                            active: true,
                        });

                        // Ligne 1 : les cinq compétences dans l'ordre du jeu, puis les
                        // aspects. L'index de socket ne suit pas cet ordre.
                        const first = [...ABILITY_ORDER, "aspect" as const].flatMap(
                            (kind) => classified.filter((s) => s.kind === kind).map(chip),
                        );
                        // Ligne 2 : les fragments. Un emplacement verrouillé (aspects
                        // insuffisants) ou resté sur son placeholder n'a rien à montrer.
                        const fragments = classified
                            .filter(
                                (s) =>
                                    s.kind === "fragment" &&
                                    !disabled.has(s.index) &&
                                    isPlugApplied(def, s.index, s.hash),
                            )
                            .map(chip);

                        if (first.length > 0) rows.push(first);
                        if (fragments.length > 0) rows.push(fragments);
                    } else if (def.itemType === ITEM_TYPE.Weapon) {
                        // Ordre de lecture, du plus loin de la vignette au plus
                        // près : attributs, mods, puis l'armature. Les
                        // cosmétiques (revêtement, ornement, effet de frag) sont
                        // écartés : ils ne changent rien au comportement de
                        // l'arme, et la maquette ne les demande pas.
                        const line = [
                            ...fromCategories([SOCKET_CATEGORY.WEAPON_PERKS], false, "perk", {
                                markEnhanced: true,
                            }),
                            ...fromCategories([SOCKET_CATEGORY.WEAPON_MODS], true, "mod"),
                            ...fromCategories([SOCKET_CATEGORY.INTRINSIC], true, "intrinsic"),
                        ];
                        if (line.length > 0) rows.push(line);
                    } else if (def.itemType === ITEM_TYPE.Armor) {
                        const line: PlugChip[] = [];

                        // Bonus d'ensemble en tête, côté vignette : ils valent pour
                        // toute la panoplie et sont affichés même hors palier.
                        const setDef = setDefs.get(itemSetHash(def) ?? 0);
                        if (setDef?.setPerks?.length) {
                            const equippedCount = setCounts.get(itemSetHash(def) ?? 0) ?? 0;
                            for (const perk of [...setDef.setPerks].sort(
                                (a, b) => a.requiredSetCount - b.requiredSetCount,
                            )) {
                                line.push({
                                    key: `set-${perk.sandboxPerkHash}`,
                                    hash: perk.sandboxPerkHash,
                                    square: false,
                                    table: "DestinySandboxPerkDefinition",
                                    active: equippedCount >= perk.requiredSetCount,
                                });
                            }
                        } else {
                            // Une exotique n'appartient à aucun ensemble : c'est son
                            // attribut intrinsèque qui prend la place. Il partage la
                            // famille `intrinsics` des armatures d'armes, et sur une
                            // armure il est le seul de cette famille.
                            for (const index of sockets.keys()) {
                                const hash = plugAt(index);
                                if (!hash) continue;
                                if (
                                    plugDefs.get(hash)?.plug?.plugCategoryIdentifier !==
                                    ARMOR_INTRINSIC_PLUG_CATEGORY
                                ) {
                                    continue;
                                }
                                line.push({
                                    key: `intrinsic-${index}`,
                                    hash,
                                    socketIndex: index,
                                    // Carré, comme l'armature d'une arme : c'est
                                    // le même rôle — l'attribut qui définit
                                    // l'objet — et le jeu le présente de même.
                                    square: true,
                                    active: true,
                                });
                                break;
                            }
                        }

                        // Comme pour les armes, les cosmétiques restent dehors.
                        line.push(
                            ...fromCategories([SOCKET_CATEGORY.ARMOR_MODS], true, "mod"),
                        );
                        if (line.length > 0) rows.push(line);
                    } else {
                        // Reste l'artéfact : ses quatre catégories de sockets forment
                        // une seule ligne, et seuls les emplacements remplis comptent.
                        const line = fromCategories(
                            ARTIFACT_SOCKET_CATEGORIES,
                            true,
                            "artifact",
                            {appliedOnly: true},
                        );
                        if (line.length > 0) rows.push(line);
                    }

                    if (rows.length > 0) result.set(item.bucketHash, rows);
                }

                return result;
            },
            // `items` et `setCounts` sont recréés à chaque rendu : la dépendance
            // doit porter sur leur contenu, comme dans use-sockets.ts.
            [
                items.map((i) => i.itemInstanceId ?? i.itemHash).join(","),
                defs,
                details,
                [...setCounts].flat().join(","),
                // Map recréée à chaque rendu : la dépendance porte sur le contenu
                savedSockets
                    ? [...savedSockets].map(([id, s]) => `${id}:${s.join("/")}`).join(",")
                    : "",
            ],
            EMPTY,
        ) ?? EMPTY
    );
}
