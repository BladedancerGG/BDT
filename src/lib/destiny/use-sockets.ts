"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item";
import type {
    InventoryItemDefinition,
    PlugSetDefinition,
    SandboxPerkDefinition,
} from "@/lib/destiny/types";
import {normalizeText} from "@/lib/search/keywords";
import {
    isHiddenSocketPlug,
    isTrackerPlug,
    PLUG_SOURCE,
} from "@/lib/destiny/sockets";
import type {PlugAvailability} from "@/lib/destiny/use-plug-availability";

/** Une colonne de perks : le plug équipé + toutes les options possibles. */
export interface SocketColumn {
    socketIndex: number;
    equippedHash?: number;
    /**
     * Plug d'origine du socket : l'emplacement vide d'un mod, le revêtement
     * livré avec l'objet… C'est lui qui remet le socket à zéro, d'où sa place
     * en tête du sélecteur.
     */
    initialHash?: number;
    /** Tous les plugs équipables sur ce socket (inclut l'équipé) */
    options: number[];
}

/**
 * Repère les compte-frags parmi une liste de plugs.
 *
 * Le tri ne peut pas se faire dans `useSocketColumns` : le type d'un plug n'est
 * connu qu'après lecture de sa définition. Le compteur n'a d'ailleurs pas de
 * catégorie de sockets à lui — il occupe une colonne de la catégorie « attributs
 * d'arme », au milieu des perks.
 *
 * Renvoie un ensemble vide tant que la lecture n'a pas abouti : les appelants
 * n'écartent donc rien avant de savoir, quitte à laisser l'icône une frame.
 */
export function useTrackerPlugs(hashes: number[]): Set<number> {
    return (
        useLiveQuery(
            async () => {
                if (hashes.length === 0) return new Set<number>();
                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (h) => ["DestinyInventoryItemDefinition", h] as [string, number],
                    ),
                );
                return new Set(
                    hashes.filter((_, i) =>
                        isTrackerPlug(rows[i]?.data as InventoryItemDefinition),
                    ),
                );
            },
            // Les hashes viennent d'un tableau recréé à chaque rendu : la clé de
            // dépendance doit porter sur leur contenu, pas sur l'identité.
            [hashes.join(",")],
            new Set<number>(),
        ) ?? new Set<number>()
    );
}

/** Définitions d'une liste de plugs, et de quoi les rechercher. */
export interface PlugCatalog {
    defs: Map<number, InventoryItemDefinition>;
    /** Nom + description, normalisés — voir `usePlugCatalog` */
    search: Map<number, string>;
}

const EMPTY_CATALOG: PlugCatalog = {defs: new Map(), search: new Map()};

/**
 * Définitions d'une liste de plugs, en **deux** requêtes groupées au plus.
 *
 * Le sélecteur d'un socket de revêtement propose plus de 600 options sur un
 * compte fourni : autant d'icônes qui, chacune avec sa propre `useDefinition`,
 * ouvriraient autant de souscriptions Dexie. C'est l'écueil déjà payé sur les
 * vignettes du coffre — voir ItemDefsProvider.
 *
 * La seconde requête sert la recherche : aspects, fragments et attributs
 * d'artéfact ont une `description` vide, la leur vit dans les
 * `DestinySandboxPerkDefinition` de `perks[]` — la même cascade que
 * `usePlugDescription`, mais pour tout le lot d'un coup. Sans elle, chercher
 * « grenade » parmi des fragments ne trouverait rien.
 */
export function usePlugCatalog(hashes: number[]): PlugCatalog {
    return (
        useLiveQuery(
            async () => {
                if (hashes.length === 0) return EMPTY_CATALOG;

                const defs = new Map<number, InventoryItemDefinition>();
                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (h) =>
                            ["DestinyInventoryItemDefinition", h] as [string, number],
                    ),
                );
                rows.forEach((row, i) => {
                    if (row) defs.set(hashes[i], row.data as InventoryItemDefinition);
                });

                // Perks à lire : uniquement ceux des plugs sans description directe
                const perkHashes = new Set<number>();
                for (const def of defs.values()) {
                    if (def.displayProperties?.description?.trim()) continue;
                    for (const perk of def.perks ?? []) perkHashes.add(perk.perkHash);
                }
                const perkTexts = new Map<number, string>();
                if (perkHashes.size > 0) {
                    const list = [...perkHashes];
                    const perkRows = await manifestDb.definitions.bulkGet(
                        list.map(
                            (h) =>
                                ["DestinySandboxPerkDefinition", h] as [string, number],
                        ),
                    );
                    perkRows.forEach((row, i) => {
                        const perk = row?.data as SandboxPerkDefinition | undefined;
                        const text = perk?.displayProperties?.description?.trim();
                        if (text && perk?.isDisplayable !== false) {
                            perkTexts.set(list[i], text);
                        }
                    });
                }

                const search = new Map<number, string>();
                for (const [hash, def] of defs) {
                    const description =
                        def.displayProperties?.description?.trim() ||
                        (def.perks ?? [])
                            .map((perk) => perkTexts.get(perk.perkHash))
                            .filter(Boolean)
                            .join(" ");
                    search.set(
                        hash,
                        normalizeText(
                            `${def.displayProperties?.name ?? ""} ${description}`,
                        ),
                    );
                }

                return {defs, search};
            },
            // Comme dans `useTrackerPlugs` : le tableau est recréé à chaque rendu
            [hashes.join(",")],
            EMPTY_CATALOG,
        ) ?? EMPTY_CATALOG
    );
}

/**
 * Calcule les colonnes de plugs d'une liste de sockets.
 *
 * D'où viennent les options, c'est la définition du socket qui le dit
 * (`plugSources`, masque SocketPlugSources) — pas une intuition :
 *
 *  - `Reusable` (2), ou aucune source déclarée : `reusablePlugs` de l'API
 *    (composant 310), le tirage réel de CETTE instance. C'est le cas des
 *    attributs d'arme.
 *  - `ProfilePlugSet` (4) / `CharacterPlugSet` (8) : les plugs **débloqués**
 *    du compte ou du personnage (voir lib/bungie/plug-sets.ts). C'est le cas
 *    des mods, revêtements, ornements, aspects, fragments et attributs
 *    d'artéfact — rien dans l'objet ne dit ce que le joueur possède.
 *
 * Restent deux replis, quand aucune source ne donne rien : le pool théorique du
 * manifeste, puis les plugs listés dans la définition du socket.
 *
 * `available` est facultatif : sans lui (colonnes d'attributs d'arme, appelants
 * historiques) seules les sources d'instance sont lues.
 */
async function buildColumns(
    def: InventoryItemDefinition | undefined,
    detail: ItemDetail | undefined,
    socketIndexes: number[],
    available: PlugAvailability | undefined,
): Promise<SocketColumn[]> {
    if (!def?.sockets) return [];

    // Pré-charge les plug sets nécessaires en une seule requête. Les deux
    // hashes sont pris : un socket peut porter l'un ou l'autre, et le repli
    // comme le test d'appartenance ci-dessous ont besoin du bon.
    const plugSetHashes = new Set<number>();
    for (const index of socketIndexes) {
        const entry = def.sockets.socketEntries[index];
        if (entry?.reusablePlugSetHash) plugSetHashes.add(entry.reusablePlugSetHash);
        if (entry?.randomizedPlugSetHash) plugSetHashes.add(entry.randomizedPlugSetHash);
    }
    const plugSets = new Map<number, PlugSetDefinition>();
    if (plugSetHashes.size > 0) {
        const hashes = [...plugSetHashes];
        const rows = await manifestDb.definitions.bulkGet(
            hashes.map((h) => ["DestinyPlugSetDefinition", h] as [string, number]),
        );
        rows.forEach((row, i) => {
            if (row) plugSets.set(hashes[i], row.data as PlugSetDefinition);
        });
    }

    // Plugs d'origine des sockets : ils disent quels emplacements l'infobulle
    // n'a pas à montrer (boost de niveau d'arme, palier d'amélioration), une
    // information que le plug équipé, lui, ne porte pas.
    const initials = new Map<number, InventoryItemDefinition>();
    {
        const hashes = [
            ...new Set(
                socketIndexes
                    .map((i) => def.sockets?.socketEntries[i]?.singleInitialItemHash)
                    .filter((h): h is number => Boolean(h)),
            ),
        ];
        if (hashes.length > 0) {
            const rows = await manifestDb.definitions.bulkGet(
                hashes.map(
                    (h) => ["DestinyInventoryItemDefinition", h] as [string, number],
                ),
            );
            rows.forEach((row, i) => {
                if (row) initials.set(hashes[i], row.data as InventoryItemDefinition);
            });
        }
    }

    const columns: SocketColumn[] = [];

    // Sockets que le jeu ne montre pas dans la liste des attributs :
    // l'archétype d'une armure et ses emplacements de statistiques. Ils
    // sont lisibles dans `sockets` — voir ItemDetail.hiddenSockets — mais
    // n'ont pas leur place ici.
    const hidden = new Set(detail?.hiddenSockets ?? []);

    for (const socketIndex of socketIndexes) {
        const entry = def.sockets.socketEntries[socketIndex];
        if (!entry) continue;
        if (hidden.has(socketIndex)) continue;
        if (isHiddenSocketPlug(initials.get(entry.singleInitialItemHash))) continue;

        // number = plug équipé, 0 = socket vide
        const socket = detail?.sockets?.[socketIndex];

        const equippedHash =
            socket && socket > 0 ? socket : entry.singleInitialItemHash;

        const sources = entry.plugSources ?? 0;
        const setHash = entry.reusablePlugSetHash ?? entry.randomizedPlugSetHash;
        const options: number[] = [];

        // 1. Sources déclarées par le socket
        if (sources === 0 || sources & PLUG_SOURCE.Reusable) {
            options.push(...(detail?.reusablePlugs?.[String(socketIndex)] ?? []));
        }
        if (setHash && available) {
            const key = String(setHash);
            if (sources & PLUG_SOURCE.ProfilePlugSet) {
                options.push(...(available.profile[key] ?? []));
            }
            if (sources & PLUG_SOURCE.CharacterPlugSet) {
                options.push(...(available.character[key] ?? []));
            }
        }

        // 2. Repli : pool théorique du manifeste
        if (options.length === 0) {
            const plugSet = setHash ? plugSets.get(setHash) : undefined;
            if (plugSet) {
                options.push(
                    ...plugSet.reusablePlugItems
                        .filter((p) => p.currentlyCanRoll !== false)
                        .map((p) => p.plugItemHash),
                );
            }
        }

        // 3. Repli : plugs listés directement dans la définition
        if (options.length === 0 && entry.reusablePlugItems?.length) {
            options.push(...entry.reusablePlugItems.map((p) => p.plugItemHash));
        }

        // 4. Dernier recours : uniquement le plug équipé
        if (options.length === 0 && equippedHash) {
            options.push(equippedHash);
        }

        // Dédoublonne en gardant l'ordre
        const seen = new Set<number>();
        const unique = options.filter(
            (h) => h > 0 && !seen.has(h) && seen.add(h),
        );

        // L'équipé est toujours proposé — sans quoi le socket s'afficherait vide.
        if (equippedHash && !unique.includes(equippedHash)) {
            unique.unshift(equippedHash);
        }

        // Le plug d'origine l'est aussi, mais à deux conditions.
        //
        // Pourquoi il faut parfois l'ajouter : c'est lui qui remet l'emplacement
        // à zéro, et le « Revêtement d'origine » (4248210736) figure bien dans
        // le plug set du manifeste mais **jamais** dans `profilePlugSets` — ce
        // n'est pas un objet possédé, c'est l'absence de revêtement. Sans cette
        // garantie, on ne peut plus retirer un revêtement une fois posé.
        //
        // 1. le socket doit être alimenté par les plugs débloqués du compte :
        //    un socket d'attribut d'arme (`plugSources` à 0 ou 2) n'offre que le
        //    tirage de l'arme, rien ne s'y ajoute ;
        // 2. le plug d'origine doit **appartenir au plug set du socket**, seule
        //    preuve qu'il en est un contenu légitime. La particularité d'origine
        //    d'une arme façonnée y échoue : son socket déclare pourtant bien
        //    `plugSources: 6`, mais son plug d'origine est la version *de base*
        //    d'un attribut dont l'arme porte la version améliorée — absente du
        //    plug set, refusée à l'insertion, et affichée en double sans ce test.
        const initialHash = entry.singleInitialItemHash || undefined;
        const fromPlugSets =
            sources &
            (PLUG_SOURCE.ProfilePlugSet | PLUG_SOURCE.CharacterPlugSet);
        const inPlugSet =
            initialHash !== undefined &&
            [entry.reusablePlugSetHash, entry.randomizedPlugSetHash].some((hash) =>
                hash
                    ? plugSets
                        .get(hash)
                        ?.reusablePlugItems.some((p) => p.plugItemHash === initialHash)
                    : false,
            );
        if (initialHash && fromPlugSets && inPlugSet && !unique.includes(initialHash)) {
            unique.unshift(initialHash);
        }

        if (unique.length > 0) {
            columns.push({socketIndex, equippedHash, initialHash, options: unique});
        }
    }

    return columns;
}

/** Colonnes de plugs d'une catégorie de sockets — voir `buildColumns`. */
export function useSocketColumns(
    def: InventoryItemDefinition | undefined,
    detail: ItemDetail | undefined,
    categoryHash: number,
    available?: PlugAvailability,
): SocketColumn[] {
    return (
        useLiveQuery(
            async () => {
                const category = def?.sockets?.socketCategories?.find(
                    (c) => c.socketCategoryHash === categoryHash,
                );
                if (!category) return [];
                return buildColumns(def, detail, category.socketIndexes, available);
            },
            [def, detail, categoryHash, available],
            [] as SocketColumn[],
        ) ?? []
    );
}

/**
 * Même chose, pour des sockets désignés un à un.
 *
 * Les doctrines n'ont pas de catégorie exploitable — le hash de « COMPÉTENCES »
 * change avec la classe et l'élément (voir subclass.ts) : leurs aspects et
 * fragments ne se retrouvent que par leurs index.
 */
export function useSocketOptions(
    def: InventoryItemDefinition | undefined,
    detail: ItemDetail | undefined,
    socketIndexes: number[],
    available?: PlugAvailability,
): SocketColumn[] {
    return (
        useLiveQuery(
            () => buildColumns(def, detail, socketIndexes, available),
            // Le tableau d'index est recréé à chaque rendu : la dépendance doit
            // porter sur son contenu, comme dans `useTrackerPlugs`.
            [def, detail, socketIndexes.join(","), available],
            [] as SocketColumn[],
        ) ?? []
    );
}
