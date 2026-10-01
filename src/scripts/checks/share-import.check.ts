// Vérification de `lib/loadouts/share/import.ts` et de `parseShareLink` — ce
// qu'importer un partage demande.
//
// Ce que ces cas protègent :
//  - l'instance de l'auteur, présente dans le compte, est reprise telle quelle
//    avec ses attributs : c'est l'auteur qui importe son propre partage ;
//  - une doctrine ne quitte pas son personnage : celle d'un autre personnage du
//    compte n'est pas un candidat, même si c'est l'instance de l'auteur ;
//  - une armure légendaire se remplace par une pièce du même emplacement et de
//    l'un des ensembles de ses emplacements, une exotique par le même hash
//    seulement, une armure d'une autre classe jamais ;
//  - deux tirages d'une même arme reçoivent deux exemplaires distincts ;
//  - les attributs qui n'ont pas de sens sur un autre exemplaire sont écartés —
//    pièce maîtresse, autre tirage, socket figé, disposition différente — faute
//    de quoi l'équipement échouait et emportait tout l'emplacement ;
//  - le groupe importé a autant d'emplacements que le personnage.

import {
    defaultPicks,
    importChoices,
    importLoadouts,
    shareClassType,
    transferPlugs,
    type AccountItem,
    type ImportContext,
} from "../../src/lib/loadouts/share/import";
import {parseShareLink, type SharedSnapshot} from "../../src/lib/loadouts/share/types";
import {INVALID_HASH} from "../../src/lib/loadouts/loadout";
import type {ItemDetail} from "../../src/lib/bungie/item-components";
import type {InventoryItemDefinition} from "../../src/lib/destiny/types";
import {BUCKET} from "../../src/lib/destiny/buckets";
import {check, report, section} from "./assert";

const TITAN = 0, HUNTER = 1;
const CHAR = "titan", OTHER = "titan-2";

// —— Manifeste témoin ——————————————————————————————————————————
const GUN = 100, SUB = 200, HELM_A = 300, HELM_B = 301, HELM_C = 302,
    HELM_HUNTER = 303, EXO_HELM = 304, HELM_ODD = 305, ARMS_A = 310;
const SET_A = 7001, SET_B = 7002, SET_C = 7003;
const PERK = 900, PERK_ENH = 901, OTHER_PERK = 902, MOD = 910, MW = 920,
    ARCHETYPE = 930;

/** Un socket : plug initial et sources (masque `SocketPlugSources`). */
const socket = (singleInitialItemHash: number, plugSources: number) =>
    ({singleInitialItemHash, plugSources});
/** Disposition d'une armure : un mod, la pièce maîtresse, l'archétype. */
const ARMOR_SOCKETS = [socket(1, 13), socket(2, 3), socket(3, 0)];

const def = (fields: Record<string, unknown>) => fields as unknown as InventoryItemDefinition;
const armor = (bucket: number, set: number | undefined, extra: Record<string, unknown> = {}) =>
    def({
        inventory: {bucketTypeHash: bucket, tierType: 5},
        classType: TITAN,
        equippingBlock: set ? {equipableItemSetHash: set} : {},
        sockets: {socketEntries: ARMOR_SOCKETS, socketCategories: []},
        ...extra,
    });

const DEFS = new Map<number, InventoryItemDefinition>([
    [GUN, def({inventory: {bucketTypeHash: BUCKET.KineticWeapons, tierType: 5}, classType: 3,
        sockets: {socketEntries: [socket(0, 2)], socketCategories: []}})],
    [SUB, def({inventory: {bucketTypeHash: BUCKET.Subclass, tierType: 0}, classType: TITAN,
        nonTransferrable: true})],
    [HELM_A, armor(BUCKET.Helmet, SET_A)],
    [HELM_B, armor(BUCKET.Helmet, SET_B)],
    [HELM_C, armor(BUCKET.Helmet, SET_C)],
    [HELM_HUNTER, armor(BUCKET.Helmet, SET_A, {classType: HUNTER})],
    [EXO_HELM, armor(BUCKET.Helmet, undefined, {inventory: {bucketTypeHash: BUCKET.Helmet, tierType: 6}})],
    // Même ensemble, mais des sockets rangés autrement — le cas relevé sur le
    // manifeste.
    [HELM_ODD, armor(BUCKET.Helmet, SET_A, {
        sockets: {socketEntries: [socket(5, 13), socket(2, 3), socket(3, 0)], socketCategories: []},
    })],
    [ARMS_A, armor(BUCKET.Gauntlets, SET_B)],
    // Une version améliorée porte le même nom et la même famille, en rareté
    // commune — voir `upgradedPlug`.
    [PERK, def({displayProperties: {name: "Outlaw"}, plug: {plugCategoryIdentifier: "frames"},
        inventory: {tierType: 5}})],
    [PERK_ENH, def({displayProperties: {name: "Outlaw"}, plug: {plugCategoryIdentifier: "frames"},
        inventory: {tierType: 3}})],
    [OTHER_PERK, def({displayProperties: {name: "Rampage"}, plug: {plugCategoryIdentifier: "frames"},
        inventory: {tierType: 5}})],
    [MOD, def({plug: {plugCategoryIdentifier: "enhancements.v2_head"}})],
    [MW, def({plug: {plugCategoryIdentifier: "v460.plugs.armor.masterworks"}})],
    [ARCHETYPE, def({plug: {plugCategoryIdentifier: "armor_archetypes"}})],
]);

// —— Le partage ————————————————————————————————————————————————
const shared = (itemInstanceId: string, itemHash: number, bucketHash: number) =>
    ({itemHash, itemInstanceId, bucketHash, state: 0});

const SNAPSHOT: SharedSnapshot = {
    version: 1,
    kind: "group",
    name: "Raid",
    loadouts: [
        {
            colorHash: 1, iconHash: 2, nameHash: 3,
            items: [
                shared("a-sub", SUB, BUCKET.Subclass),
                shared("a-gun", GUN, BUCKET.KineticWeapons),
                shared("a-helm", HELM_A, BUCKET.Helmet),
                shared("a-arms", ARMS_A, BUCKET.Gauntlets),
            ],
            sockets: {
                "a-sub": [55],
                "a-gun": [PERK],
                "a-helm": [MOD, MW, ARCHETYPE],
                "a-arms": [MOD],
            },
        },
        {
            colorHash: 4, iconHash: 5, nameHash: 6,
            items: [
                shared("a-gun2", GUN, BUCKET.KineticWeapons),
                shared("a-exo", EXO_HELM, BUCKET.Helmet),
            ],
            sockets: {"a-gun2": [OTHER_PERK], "a-exo": [MOD]},
        },
        {colorHash: INVALID_HASH, iconHash: INVALID_HASH, nameHash: INVALID_HASH, items: [], sockets: {}},
    ],
    details: {},
};

// —— Le compte qui importe ——————————————————————————————————————
const own = (itemInstanceId: string, itemHash: number, characterId: string | null = null): AccountItem =>
    ({itemInstanceId, itemHash, characterId});
const detail = (sockets: number[], reusablePlugs: Record<string, number[]> = {}, power = 0): ItemDetail =>
    ({stats: {}, sockets, reusablePlugs, instance: {primaryStat: {statHash: 1, value: power}}});

const ITEMS: AccountItem[] = [
    own("sub-here", SUB, CHAR),
    own("sub-there", SUB, OTHER),
    own("gun-1", GUN),
    own("gun-2", GUN),
    own("helm-a", HELM_A),
    own("helm-b", HELM_B),
    own("helm-c", HELM_C),
    own("helm-hunter", HELM_HUNTER),
    own("helm-odd", HELM_ODD),
    own("exo-1", EXO_HELM),
];
const DETAILS: Record<string, ItemDetail> = {
    "gun-1": detail([OTHER_PERK], {"0": [PERK_ENH, OTHER_PERK]}, 10),
    "gun-2": detail([OTHER_PERK], {"0": [OTHER_PERK]}, 20),
    "helm-a": detail([0, 0, 999], {}, 1),
    "helm-b": detail([0, 0, 999], {}, 50),
};

const ctx: ImportContext = {
    items: ITEMS,
    details: DETAILS,
    defOf: (hash) => DEFS.get(hash),
};

section("la classe du partage");
check("lue sur la doctrine ou les armures", shareClassType(SNAPSHOT, ctx.defOf), TITAN);

section("les candidats");
const choices = importChoices(SNAPSHOT, CHAR, TITAN, ctx);
const of = (id: string) => choices.find((choice) => choice.shared.itemInstanceId === id);

check("une instance par objet partagé", choices.length, 6);
check("la doctrine : celle du personnage visé seulement",
    of("a-sub")?.candidates, ["sub-here"]);
check("une arme : le même hash, la plus puissante d'abord",
    of("a-gun")?.candidates, ["gun-2", "gun-1"]);
// L'emplacement 1 porte les ensembles A (casque) et B (gantelets) : un casque
// de l'un ou de l'autre convient, celui de l'ensemble C non, ni celui d'une
// autre classe.
check("une armure légendaire : même emplacement, ensembles de ses emplacements",
    of("a-helm")?.candidates, ["helm-a", "helm-odd", "helm-b"]);
check("une armure exotique : le même hash seulement",
    of("a-exo")?.candidates, ["exo-1"]);
check("un objet sans exemplaire n'a aucun candidat",
    of("a-arms")?.candidates, []);

{
    const mine = importChoices(SNAPSHOT, CHAR, TITAN, {
        ...ctx,
        items: [...ITEMS, own("a-gun", GUN, OTHER), own("a-sub", SUB, OTHER)],
    });
    const choice = (id: string) => mine.find((c) => c.shared.itemInstanceId === id);
    check("l'instance de l'auteur est reprise, sans choix",
        [choice("a-gun")?.kept, choice("a-gun")?.candidates], [true, ["a-gun"]]);
    check("sauf une doctrine restée sur un autre personnage",
        [choice("a-sub")?.kept, choice("a-sub")?.candidates], [false, ["sub-here"]]);
}

section("le choix proposé d'office");
const picks = defaultPicks(choices);
check("deux tirages d'une arme, deux exemplaires",
    [picks.get("a-gun"), picks.get("a-gun2")], ["gun-2", "gun-1"]);
check("rien à proposer : laissé vide", picks.get("a-arms"), null);

section("les attributs reportés");
const gun1 = ITEMS.find((item) => item.itemInstanceId === "gun-1")!;
const gun2 = ITEMS.find((item) => item.itemInstanceId === "gun-2")!;
check("l'attribut d'un autre tirage est écarté",
    transferPlugs([PERK], GUN, gun2, ctx), [INVALID_HASH]);
check("sa version améliorée, si l'exemplaire la propose, le remplace",
    transferPlugs([PERK], GUN, gun1, ctx), [PERK_ENH]);
check("un attribut déjà en place est gardé",
    transferPlugs([OTHER_PERK], GUN, gun2, ctx), [OTHER_PERK]);

const helmB = ITEMS.find((item) => item.itemInstanceId === "helm-b")!;
const helmOdd = ITEMS.find((item) => item.itemInstanceId === "helm-odd")!;
check("armure d'un autre ensemble : le mod suit, ni la pièce maîtresse ni l'archétype",
    transferPlugs([MOD, MW, ARCHETYPE], HELM_A, helmB, ctx),
    [MOD, INVALID_HASH, INVALID_HASH]);
check("disposition différente : le mod ne suit pas",
    transferPlugs([MOD, MW, ARCHETYPE], HELM_A, helmOdd, ctx),
    [INVALID_HASH, INVALID_HASH, INVALID_HASH]);
check("sentinelle et socket vide restent ce qu'ils sont",
    transferPlugs([INVALID_HASH, 0], HELM_A, helmB, ctx), [INVALID_HASH, 0]);

section("le groupe importé");
const loadouts = importLoadouts(SNAPSHOT, picks, 4, ctx);
check("autant d'emplacements que le personnage", loadouts.length, 4);
check("le premier : les objets retenus, l'objet sans exemplaire absent",
    loadouts[0].items.map((item) => item.itemInstanceId), ["sub-here", "gun-2", "helm-a"]);
check("les identifiants de l'emplacement suivent",
    [loadouts[1].colorHash, loadouts[1].iconHash, loadouts[1].nameHash], [4, 5, 6]);
check("un emplacement vide le reste", loadouts[2].items, []);
check("tronqué à la taille du personnage", importLoadouts(SNAPSHOT, picks, 1, ctx).length, 1);
check("un emplacement dont rien ne reste redevient vide",
    importLoadouts(SNAPSHOT, new Map(), 3, ctx)[0].colorHash, INVALID_HASH);

section("lire un lien collé");
check("lien complet, avec la langue",
    parseShareLink("https://example.org/en/group/AbC-12_xyz/mon-groupe"),
    {kind: "group", id: "AbC-12_xyz"});
check("équipement seul, sans nom", parseShareLink(" /loadout/abc123 "), {kind: "loadout", id: "abc123"});
check("autre chose : rien", parseShareLink("https://example.org/fr"), null);
check("un faux genre : rien", parseShareLink("/groups/abc"), null);

process.exit(report());
