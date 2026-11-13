"use client";

// Le profil fictif du catalogue d'interface (/dev/ui).
//
// Un profil **construit**, et non enregistré : seuls les hashes sont écrits ici
// — tous relevés dans le manifeste, aucun deviné —, le reste (sockets, plugs
// proposés, statistiques) est tiré des définitions au moment du rendu. Une
// fixture JSON aurait figé des sockets que le prochain patch rendra faux, et le
// catalogue aurait montré des erreurs qui ne sont pas celles de l'application.
//
// Ce n'est pas un vrai profil pour autant : les statistiques d'arme sont les
// valeurs d'investissement de la définition (sans interpolation), celles
// d'armure une répartition plausible. Assez pour dessiner chaque état, pas pour
// vérifier un calcul — c'est le rôle de scripts/checks/.

import {manifestDb} from "@/lib/manifest/db";
import type {ProfileData, Character} from "@/lib/bungie/use-profile";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition, PlugSetDefinition} from "@/lib/destiny/types";
import {BUCKET} from "@/lib/destiny/buckets";
import {ITEM_STATE} from "@/lib/destiny/overlays";
import {ARMOR_STAT_ORDER} from "@/lib/destiny/stat-order";
import {INVALID_HASH} from "@/lib/loadouts/loadout";
import {
    fragmentSlots,
    lockedFragmentSockets,
    subclassSocketKind,
    type SubclassSocketKind,
} from "@/lib/destiny/subclass";

/** Hashes du manifeste, nommés pour que les sections du catalogue s'y réfèrent. */
export const CATALOG_HASH = {
    // —— Doctrines ——
    prismaticHunter: 4282591831,
    prismaticTitan: 1616346845,
    prismaticWarlock: 3893112950,
    // —— Armes ——
    aceOfSpades: 347366834, // exotique, cinétique
    cloudstrike: 2603483885, // exotique, énergétique
    gjallarhorn: 1363886209, // exotique, puissante
    fatebringerTimelost: 4219826183, // adepte
    terminusHorizonAdept: 4267192886, // adepte holofoil, puissante
    mountaintop: 4043921923, // holofoil
    mirrorImagoAdept: 4116546788,
    noSurvivors: 4193602194,
    ringingNail: 4206550094,
    chatteringBone: 4157371152,
    aloneAsAGod: 4278664152,
    longArmAdept: 4239378215,
    eyesUnveiledAdept: 4173311704,
    militiasBirthrightAdept: 4162642204,
    skyburnersOath: 4255268456,
    hierarchyOfNeeds: 4174431791,
    merciless: 4190156464,
    vexMythoclast: 4289226715,
    riptide: 2715240478,
    fatebringer: 4184168210,
    // —— Armures (Chasseur) — l'ensemble Crystocrene et des exotiques ——
    crystocreneCowl: 492357704,
    crystocreneGrips: 4134659289,
    crystocreneVest: 2893611839,
    crystocreneStrides: 2731877579,
    crystocreneCloak: 4140770382,
    omnioculus: 4255001288,
    celestialNighthawk: 3960926756,
    liarsHandshake: 4165919945,
    khepriSting: 4002939008,
    youngAhamkarasSpine: 4284305242,
    fortunesFavor: 4010324161,
    darkAgeHarness: 4149732324,
    ironPanoplyMask: 4193009504,
    ferropotentGrips: 4199055647,
    // —— Personnalisation ——
    artifact: 4156549634,
    ghost: 4283023982,
    ship: 4269714569,
    sparrow: 4282413899,
    emblem: 4261480750,
    emblemAlt: 4261480751,
    finisher: 4184628733,
    // —— Piles ——
    enhancementCore: 3853748946,
    ascendantShard: 4257549985,
    weaponOrnament: 4292140878,
    encryptedEngram: 4191193255,
    gambitEngram: 4293114780,
} as const;

/** DestinyClassDefinition, relevés dans le manifeste. */
const CLASS_HASH = {0: 3655393761, 1: 671679327, 2: 2271682572} as const;

/**
 * Les illustrations d'emblème du personnage ne sont pas dans la projection du
 * manifeste (`secondarySpecial` n'est lu nulle part ailleurs) : relevées une
 * fois sur bungie.net pour les deux emblèmes ci-dessus.
 */
const EMBLEM_ART = {
    [CATALOG_HASH.emblem]: {
        icon: "/common/destiny2_content/icons/0ac952bfff905b3cb44195a2400e2797.jpg",
        background: "/common/destiny2_content/icons/ad1dad38022ca193cfdaca0e268bd504.jpg",
    },
    [CATALOG_HASH.emblemAlt]: {
        icon: "/common/destiny2_content/icons/2764c187b9825ab92fd04db8d06a41f3.jpg",
        background: "/common/destiny2_content/icons/2b802eea00a7505ac04a7f55482616a8.jpg",
    },
} as const;

/** DestinyLoadout{Color,Icon,Name}Definition : les premières lignes de chaque table. */
const LOADOUT_COLOR = [1677044030, 1677044031, 1693821584, 1693821585, 1693821586];
const LOADOUT_ICON = [797343696, 797343697, 797343698, 797343699, 797343700];
const LOADOUT_NAME = [752612096, 752612097, 752612098, 752612099, 752612100];

export const CATALOG_CHARACTER = {
    hunter: "catalog-hunter",
    titan: "catalog-titan",
    warlock: "catalog-warlock",
} as const;

const ATTACK_STAT = 1480404414;
const DEFENSE_STAT = 3897883278;
const POWER = 550;

/** Ce que le catalogue sait d'un objet avant de le résoudre. */
interface Spec {
    /** Identifiant d'instance — absent pour une pile */
    id?: string;
    hash: number;
    state?: number;
    gearTier?: number;
    quantity?: number;
    /** Emplacement où l'objet se trouve, s'il diffère de celui de sa définition */
    bucketHash?: number;
}

const MW = ITEM_STATE.Masterwork;
const LOCKED = ITEM_STATE.Locked;

const H = CATALOG_HASH;

const HUNTER_EQUIPPED: Spec[] = [
    {id: "c-sub-hunter", hash: H.prismaticHunter},
    {id: "c-fatebringer-t", hash: H.fatebringerTimelost, state: MW | LOCKED, gearTier: 5},
    {id: "c-cloudstrike", hash: H.cloudstrike, state: MW, gearTier: 4},
    {id: "c-terminus", hash: H.terminusHorizonAdept, state: MW | LOCKED, gearTier: 5},
    {id: "c-cowl", hash: H.crystocreneCowl, gearTier: 5, state: MW},
    {id: "c-grips", hash: H.crystocreneGrips, gearTier: 4},
    {id: "c-omnioculus", hash: H.omnioculus, gearTier: 3, state: MW},
    {id: "c-strides", hash: H.crystocreneStrides, gearTier: 5},
    {id: "c-cloak", hash: H.crystocreneCloak, gearTier: 2},
    {id: "c-artifact", hash: H.artifact},
    {id: "c-ghost", hash: H.ghost},
    {id: "c-ship", hash: H.ship},
    {id: "c-sparrow", hash: H.sparrow},
    {id: "c-emblem", hash: H.emblem},
    {id: "c-finisher", hash: H.finisher},
];

const HUNTER_INVENTORY: Spec[] = [
    {id: "c-ace", hash: H.aceOfSpades, state: MW, gearTier: 3},
    {id: "c-mountaintop", hash: H.mountaintop, state: ITEM_STATE.Crafted, gearTier: 2},
    {id: "c-mirror", hash: H.mirrorImagoAdept, gearTier: 1},
    {id: "c-skyburner", hash: H.skyburnersOath},
    {id: "c-gjallarhorn", hash: H.gjallarhorn, state: LOCKED, gearTier: 4},
    {id: "c-vest", hash: H.crystocreneVest, gearTier: 3},
    {id: "c-nighthawk", hash: H.celestialNighthawk, gearTier: 2},
    {id: "c-liars", hash: H.liarsHandshake, gearTier: 1},
    {id: "c-fortune", hash: H.fortunesFavor},
    {id: "c-emblem-alt", hash: H.emblemAlt},
    {hash: H.encryptedEngram, quantity: 1},
    {hash: H.gambitEngram, quantity: 1},
    // Le Courrier : un objet perdu, qui vit dans l'inventaire du personnage
    {id: "c-lost", hash: H.vexMythoclast, bucketHash: BUCKET.Postmaster, gearTier: 2},
    {hash: H.enhancementCore, quantity: 12, bucketHash: BUCKET.Postmaster},
];

const OTHER_EQUIPPED = (classType: 0 | 2): Spec[] => [
    {
        id: `c-sub-${classType}`,
        hash: classType === 0 ? H.prismaticTitan : H.prismaticWarlock,
    },
    {id: `c-riptide-${classType}`, hash: H.riptide, gearTier: 3},
    {id: `c-nail-${classType}`, hash: H.ringingNail, gearTier: 2},
    {id: `c-eyes-${classType}`, hash: H.eyesUnveiledAdept, gearTier: 4},
    {id: `c-emblem-${classType}`, hash: classType === 0 ? H.emblemAlt : H.emblem},
];

const VAULT: Spec[] = [
    {id: "v-fatebringer", hash: H.fatebringer, gearTier: 3},
    {id: "v-chattering", hash: H.chatteringBone, gearTier: 4, state: MW},
    {id: "v-alone", hash: H.aloneAsAGod, gearTier: 5, state: MW | LOCKED},
    {id: "v-militia", hash: H.militiasBirthrightAdept, gearTier: 2},
    {id: "v-nosurvivors", hash: H.noSurvivors, gearTier: 1},
    {id: "v-longarm", hash: H.longArmAdept, gearTier: 3},
    {id: "v-hierarchy", hash: H.hierarchyOfNeeds, state: MW},
    {id: "v-merciless", hash: H.merciless},
    {id: "v-ringing", hash: H.ringingNail, gearTier: 5, state: ITEM_STATE.Enhanced},
    {id: "v-riptide", hash: H.riptide, state: ITEM_STATE.Crafted | MW},
    {id: "v-harness", hash: H.darkAgeHarness, gearTier: 4},
    {id: "v-panoply", hash: H.ironPanoplyMask, gearTier: 2},
    {id: "v-ferro", hash: H.ferropotentGrips, gearTier: 5, state: MW},
    {id: "v-khepri", hash: H.khepriSting, gearTier: 3},
    {id: "v-spine", hash: H.youngAhamkarasSpine},
    // Rangement partagé : les piles arrivent dans `profileInventory`, dans
    // leur propre emplacement et non celui du coffre.
    {hash: H.enhancementCore, quantity: 250},
    {hash: H.ascendantShard, quantity: 12},
    {hash: H.weaponOrnament, quantity: 1},
];

/**
 * Objets montrés dans les sections « vignettes », avec ce qui les distingue.
 * `key` désigne leur légende dans `catalog.showcase` des messages.
 */
export const CATALOG_SHOWCASE = [
    {key: "exotic", id: "c-ace"},
    {key: "exoticMasterwork", id: "c-cloudstrike"},
    {key: "legendary", id: "v-fatebringer"},
    {key: "adeptLocked", id: "c-fatebringer-t"},
    {key: "holofoil", id: "c-mountaintop"},
    {key: "holofoilAdept", id: "c-terminus"},
    {key: "crafted", id: "v-riptide"},
    {key: "enhanced", id: "v-ringing"},
    {key: "setArmor", id: "c-cowl"},
    {key: "exoticArmor", id: "c-omnioculus"},
    {key: "subclass", id: "c-sub-hunter"},
    {key: "artifact", id: "c-artifact"},
    {key: "ghost", id: "c-ghost"},
    {key: "ship", id: "c-ship"},
    {key: "sparrow", id: "c-sparrow"},
    {key: "emblem", id: "c-emblem"},
] as const;

export interface CatalogProfile {
    data: ProfileData;
    /** Chaque objet instancié, par identifiant */
    byId: Map<string, DestinyItemComponent>;
    /** Les piles (sans instance), par hash */
    stacks: DestinyItemComponent[];
}

async function getRows<T>(table: string, hashes: number[]): Promise<Map<number, T>> {
    const unique = [...new Set(hashes)];
    const rows = await manifestDb.definitions.bulkGet(
        unique.map((hash) => [table, hash] as [string, number]),
    );
    const out = new Map<number, T>();
    rows.forEach((row, i) => {
        if (row) out.set(unique[i], row.data as T);
    });
    return out;
}

/**
 * Plugs proposés par un plug set, ceux qui peuvent encore tomber d'abord.
 * `currentlyCanRoll` absent vaut « oui » : seuls les retirés le portent à faux.
 */
function rollable(set: PlugSetDefinition | undefined): number[] {
    return (set?.reusablePlugItems ?? [])
        .filter((plug) => plug.currentlyCanRoll !== false)
        .map((plug) => plug.plugItemHash);
}

const isWeapon = (def: InventoryItemDefinition) => def.itemType === 3;
const isArmor = (def: InventoryItemDefinition) => def.itemType === 2;
const isSubclassDef = (def: InventoryItemDefinition) => def.itemType === 16;

/** Une répartition d'armure plausible, différente d'une pièce à l'autre. */
function armorStats(seed: number): Record<string, number> {
    const spread = [30, 25, 13, 5, 0, 0];
    const out: Record<string, number> = {};
    ARMOR_STAT_ORDER.forEach((hash, i) => {
        out[hash] = spread[(i + seed) % spread.length];
    });
    return out;
}

function buildDetail(
    spec: Spec,
    def: InventoryItemDefinition,
    plugSets: Map<number, PlugSetDefinition>,
    /** Plugs des doctrines (vides, aspects) — de quoi lire leur nature */
    plugDefs: Map<number, InventoryItemDefinition>,
    seed: number,
): ItemDetail {
    const entries = def.sockets?.socketEntries ?? [];
    const sockets: number[] = [];
    const reusablePlugs: Record<string, number[]> = {};
    const disabledSockets: number[] = [];

    // Une doctrine : deux aspects, puis des fragments dans les emplacements
    // qu'ils accordent — les suivants restent verrouillés, ce qui montre aussi
    // cet état-là. La nature d'un socket se lit sur son plug vide, comme
    // partout ailleurs (voir `subclassSocketKind`).
    const kinds = new Map<number, SubclassSocketKind>();
    let aspectsTaken = 0;
    let fragmentsTaken = 0;

    entries.forEach((entry, index) => {
        const random = rollable(plugSets.get(entry.randomizedPlugSetHash ?? 0));
        const reusable = rollable(plugSets.get(entry.reusablePlugSetHash ?? 0));

        if (random.length > 0) {
            // Une colonne d'attributs : quelques choix, dont l'équipé.
            const options = random.slice(seed % 2, (seed % 2) + 3);
            sockets.push(options[0]);
            reusablePlugs[index] = options;
            return;
        }

        const empty = entry.singleInitialItemHash;
        const kind = isSubclassDef(def)
            ? subclassSocketKind(plugDefs.get(empty)?.plug?.plugCategoryIdentifier)
            : undefined;
        if (kind) kinds.set(index, kind);
        const pool = reusable.filter((hash) => hash !== empty);
        if (kind === "aspect" && pool.length > 0) {
            sockets.push(pool[aspectsTaken % pool.length]);
            aspectsTaken += 1;
            return;
        }
        if (kind === "fragment" && pool.length > 0) {
            // Un pas de trois : des fragments d'éléments différents
            sockets.push(pool[(fragmentsTaken * 3) % pool.length]);
            fragmentsTaken += 1;
            return;
        }

        sockets.push(entry.singleInitialItemHash || reusable[0] || 0);
    });

    // Les fragments au-delà de ce qu'accordent les aspects : vidés, et
    // verrouillés — comme le jeu les renvoie.
    for (const index of lockedFragmentSockets(kinds, sockets, (hash) =>
        fragmentSlots(plugDefs.get(hash)),
    )) {
        sockets[index] = entries[index].singleInitialItemHash;
        disabledSockets.push(index);
    }

    const weapon = isWeapon(def);
    const armor = isArmor(def);

    let stats: Record<string, number> = {};
    if (weapon) {
        for (const stat of def.investmentStats ?? []) {
            if (stat.value > 0 && !stat.isConditionallyActive) {
                stats[stat.statTypeHash] = stat.value;
            }
        }
    } else if (armor) {
        stats = armorStats(seed);
    }

    return {
        instance:
            weapon || armor
                ? {
                      primaryStat: {
                          statHash: weapon ? ATTACK_STAT : DEFENSE_STAT,
                          value: POWER + seed * 3,
                      },
                      damageType: weapon ? def.defaultDamageType : undefined,
                      gearTier: spec.gearTier,
                      energy: armor
                          ? {energyCapacity: 11, energyUsed: 7, energyUnused: 4}
                          : undefined,
                  }
                : {},
        stats,
        sockets,
        ...(disabledSockets.length > 0 ? {disabledSockets} : {}),
        reusablePlugs,
    };
}

function component(
    spec: Spec,
    def: InventoryItemDefinition | undefined,
    where: "equipped" | "inventory" | "vault",
): DestinyItemComponent {
    const ownBucket = def?.inventory?.bucketTypeHash ?? BUCKET.Vault;
    // Au coffre, une arme ou une armure est dans l'emplacement « Coffre » ; une
    // pile reste dans le sien — voir BUCKET.Consumables.
    const stackable = !spec.id;
    const bucketHash =
        spec.bucketHash ??
        (where === "vault" && !stackable ? BUCKET.Vault : ownBucket);
    return {
        itemHash: spec.hash,
        itemInstanceId: spec.id,
        quantity: spec.quantity ?? 1,
        bucketHash,
        location: where === "vault" ? 2 : bucketHash === BUCKET.Postmaster ? 4 : 1,
        state: spec.state ?? 0,
    };
}

function character(
    id: string,
    classType: 0 | 1 | 2,
    emblem: keyof typeof EMBLEM_ART,
    stats: number[],
): Character {
    return {
        characterId: id,
        classHash: CLASS_HASH[classType],
        classType,
        light: POWER + 10,
        emblemPath: EMBLEM_ART[emblem].icon,
        emblemBackgroundPath: EMBLEM_ART[emblem].background,
        stats: Object.fromEntries(ARMOR_STAT_ORDER.map((hash, i) => [hash, stats[i]])),
    };
}

/** Un emplacement d'équipement du jeu, rempli des objets donnés. */
function loadout(
    i: number,
    items: DestinyItemComponent[],
    details: Record<string, ItemDetail>,
): DestinyLoadout {
    return {
        colorHash: LOADOUT_COLOR[i % LOADOUT_COLOR.length],
        iconHash: LOADOUT_ICON[i % LOADOUT_ICON.length],
        nameHash: LOADOUT_NAME[i % LOADOUT_NAME.length],
        items: items
            .filter((item) => item.itemInstanceId)
            .map((item) => ({
                itemInstanceId: item.itemInstanceId!,
                // Comme en jeu : un socket que l'équipement ne touche pas porte
                // la sentinelle, et non zéro.
                plugItemHashes: (details[item.itemInstanceId!]?.sockets ?? []).map(
                    (hash) => hash || INVALID_HASH,
                ),
            })),
    };
}

/**
 * Résout le profil du catalogue depuis le manifeste déjà chargé.
 *
 * À n'appeler qu'une fois `ManifestGate` passé : la base est vide avant.
 */
export async function buildCatalogProfile(): Promise<CatalogProfile> {
    const all = [
        ...HUNTER_EQUIPPED,
        ...HUNTER_INVENTORY,
        ...OTHER_EQUIPPED(0),
        ...OTHER_EQUIPPED(2),
        ...VAULT,
    ];
    const defs = await getRows<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        all.map((spec) => spec.hash),
    );
    const setHashes: number[] = [];
    for (const def of defs.values()) {
        for (const entry of def.sockets?.socketEntries ?? []) {
            if (entry.randomizedPlugSetHash) setHashes.push(entry.randomizedPlugSetHash);
            if (entry.reusablePlugSetHash) setHashes.push(entry.reusablePlugSetHash);
        }
    }
    const plugSets = await getRows<PlugSetDefinition>("DestinyPlugSetDefinition", setHashes);

    // Plugs des doctrines : les vides disent la nature du socket, les aspects
    // le nombre de fragments qu'ils accordent. Quelques centaines au plus.
    const subclassPlugs: number[] = [];
    for (const def of defs.values()) {
        if (!isSubclassDef(def)) continue;
        for (const entry of def.sockets?.socketEntries ?? []) {
            subclassPlugs.push(entry.singleInitialItemHash);
            subclassPlugs.push(...rollable(plugSets.get(entry.reusablePlugSetHash ?? 0)));
        }
    }
    const plugDefs = await getRows<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        subclassPlugs,
    );

    const items: Record<string, ItemDetail> = {};
    const byId = new Map<string, DestinyItemComponent>();
    const stacks: DestinyItemComponent[] = [];

    let seed = 0;
    const resolve = (list: Spec[], where: "equipped" | "inventory" | "vault") =>
        list.map((spec) => {
            const def = defs.get(spec.hash);
            const item = component(spec, def, where);
            if (spec.id && def) {
                items[spec.id] = buildDetail(spec, def, plugSets, plugDefs, seed);
                seed += 1;
                byId.set(spec.id, item);
            } else {
                stacks.push(item);
            }
            return item;
        });

    const hunterEquipped = resolve(HUNTER_EQUIPPED, "equipped");
    const hunterInventory = resolve(HUNTER_INVENTORY, "inventory");
    const titanEquipped = resolve(OTHER_EQUIPPED(0), "equipped");
    const warlockEquipped = resolve(OTHER_EQUIPPED(2), "equipped");
    const vault = resolve(VAULT, "vault");

    const C = CATALOG_CHARACTER;

    // Trois emplacements remplis, puis des libres : la grille montre les deux
    // états. Le deuxième n'a que les armes, pour qu'il diffère du premier.
    const hunterLoadouts: DestinyLoadout[] = [
        loadout(0, hunterEquipped, items),
        loadout(1, hunterEquipped.slice(0, 4), items),
        loadout(2, [hunterEquipped[0], ...hunterInventory.slice(0, 3)], items),
        ...Array.from({length: 7}, (_, i) => ({...loadout(i + 3, [], items)})),
    ];

    const data: ProfileData = {
        characters: [
            character(C.hunter, 1, H.emblem, [110, 70, 135, 45, 90, 50]),
            character(C.titan, 0, H.emblemAlt, [150, 100, 30, 80, 60, 40]),
            character(C.warlock, 2, H.emblem, [60, 30, 180, 120, 40, 70]),
        ],
        equipment: {
            [C.hunter]: hunterEquipped,
            [C.titan]: titanEquipped,
            [C.warlock]: warlockEquipped,
        },
        inventory: {[C.hunter]: hunterInventory, [C.titan]: [], [C.warlock]: []},
        vault,
        loadouts: {
            [C.hunter]: hunterLoadouts,
            [C.titan]: [loadout(0, titanEquipped, items), ...Array.from({length: 9}, (_, i) => loadout(i + 1, [], items))],
            [C.warlock]: Array.from({length: 10}, (_, i) => loadout(i, [], items)),
        },
        items,
        plugSets: {profile: {}, characters: {}},
    };

    return {data, byId, stacks};
}
