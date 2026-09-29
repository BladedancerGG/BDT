// Vérification de `lib/destiny/perk-upgrades.ts` — ce qu'un instantané de
// groupe oublie, et ce qu'il rattrape.
//
// Le symptôme qui a motivé le module : un groupe enregistre « Chargeur glacial »
// sur une arme ordinaire, le joueur l'améliore en jeu (façonnage, amélioration,
// palier 2 ou plus), et l'équipement du groupe demande un attribut que l'arme
// n'offre plus. Bungie refuse net, et l'API n'expose aucune de ces opérations :
// rien ne prévient, seul l'écart se constate.
//
// Les fixtures reprennent le manifeste de l'arme réelle : les deux versions de
// « Chill Clip » partagent leur nom et leur `plugCategoryIdentifier` (`frames`),
// la rareté seule les départage — 2 (Basic) pour la version d'origine, 3
// (Common, « Peu commun » en jeu) pour l'améliorée. Voir `isEnhancedPlug`.

import {
    recordedPlugs,
    upgradedPlug,
    weaponPerkSocketIndexes,
} from "../../src/lib/destiny/perk-upgrades";
import {ITEM_STATE} from "../../src/lib/destiny/overlays";
import {SOCKET_CATEGORY} from "../../src/lib/destiny/display";
import {INVALID_HASH} from "../../src/lib/loadouts/loadout";
import type {InventoryItemDefinition} from "../../src/lib/destiny/types";
import {check, report, section} from "./assert";

// —— Manifeste témoin —————————————————————————————————————————

/** Un plug : nom, famille, rareté. Le reste de la définition ne sert pas ici. */
const plug = (
    name: string,
    plugCategoryIdentifier: string,
    tierType: number,
): InventoryItemDefinition =>
    ({
        displayProperties: {name, description: "", hasIcon: false},
        itemType: 19,
        plug: {plugCategoryIdentifier},
        inventory: {tierType},
    }) as InventoryItemDefinition;

const CHILL_CLIP = 2978966579;
const CHILL_CLIP_ENHANCED = 344235611;
const DEFS: Record<number, InventoryItemDefinition> = {
    [CHILL_CLIP]: plug("Chill Clip", "frames", 2),
    [CHILL_CLIP_ENHANCED]: plug("Chill Clip", "frames", 3),
    // Un homonyme d'une AUTRE famille : le nom seul ne doit pas suffire.
    901: plug("Chill Clip", "barrels", 3),
    // Un attribut sans rapport, de la bonne famille et de la bonne rareté.
    902: plug("Rampage", "frames", 3),
    // Deux revêtements homonymes, tous deux de rareté « Peu commun » : le cas
    // relevé sur le manifeste où l'appariement par nom seul serait ambigu.
    903: plug("Chill Clip", "shader", 3),
    // Homonyme de la bonne famille, mais de la rareté des attributs d'origine.
    904: plug("Chill Clip", "frames", 2),
};

const defOf = (hash: number) => DEFS[hash];

// —— L'appariement ————————————————————————————————————————————
section("la version améliorée d'un attribut");

check("l'attribut encore proposé ne bouge pas",
    upgradedPlug(CHILL_CLIP, [CHILL_CLIP, 902], defOf), CHILL_CLIP);
check("disparu du pool, il part sous sa version améliorée",
    upgradedPlug(CHILL_CLIP, [CHILL_CLIP_ENHANCED, 902], defOf),
    CHILL_CLIP_ENHANCED);
check("un socket sans options connues ne substitue rien",
    upgradedPlug(CHILL_CLIP, undefined, defOf), CHILL_CLIP);
check("un pool vide non plus",
    upgradedPlug(CHILL_CLIP, [], defOf), CHILL_CLIP);
check("la sentinelle « non enregistré » ne se substitue pas",
    upgradedPlug(INVALID_HASH, [CHILL_CLIP_ENHANCED], defOf), INVALID_HASH);
check("un socket vide non plus",
    upgradedPlug(0, [CHILL_CLIP_ENHANCED], defOf), 0);

section("ce que l'appariement refuse");

check("le nom ne suffit pas : la famille doit correspondre",
    upgradedPlug(CHILL_CLIP, [901, 902], defOf), CHILL_CLIP);
check("un homonyme cosmétique n'est pas une amélioration",
    upgradedPlug(CHILL_CLIP, [903], defOf), CHILL_CLIP);
check("le candidat doit être de la rareté des attributs améliorés",
    upgradedPlug(CHILL_CLIP, [904], defOf), CHILL_CLIP);
check("un attribut déjà amélioré ne se réaméliore pas",
    upgradedPlug(CHILL_CLIP_ENHANCED, [CHILL_CLIP], defOf), CHILL_CLIP_ENHANCED);
check("sans définition, rien ne se devine",
    upgradedPlug(CHILL_CLIP, [12345], defOf), CHILL_CLIP);

// —— Ce qu'une arme façonnée n'enregistre pas —————————————————
//
// Sockets calqués sur « Osteo Striga », relevés sur le manifeste : l'armature
// est seule dans la catégorie INTRINSIC (0), les colonnes d'attributs occupent
// 1 à 4 puis 9 et 10, les mods 5, 12 et 13, les cosmétiques 6.
section("les attributs d'une arme façonnée");

const WEAPON = {
    displayProperties: {name: "Osteo Striga", description: "", hasIcon: false},
    itemType: 3,
    sockets: {
        socketEntries: [],
        socketCategories: [
            {socketCategoryHash: SOCKET_CATEGORY.INTRINSIC, socketIndexes: [0]},
            {
                socketCategoryHash: SOCKET_CATEGORY.WEAPON_PERKS,
                socketIndexes: [1, 2, 3, 4, 9, 10],
            },
            {
                socketCategoryHash: SOCKET_CATEGORY.WEAPON_MODS,
                socketIndexes: [5, 12, 13],
            },
            {
                socketCategoryHash: SOCKET_CATEGORY.WEAPON_COSMETICS,
                socketIndexes: [6],
            },
        ],
    },
} as InventoryItemDefinition;

const SNAPSHOT = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const I = INVALID_HASH;

check("les index des colonnes d'attributs",
    weaponPerkSocketIndexes(WEAPON), [1, 2, 3, 4, 9, 10]);
check("une arme ordinaire enregistre tout",
    recordedPlugs(SNAPSHOT, WEAPON, ITEM_STATE.Masterwork), SNAPSHOT);
check("une arme façonnée oublie ses colonnes d'attributs, et elles seules",
    recordedPlugs(SNAPSHOT, WEAPON, ITEM_STATE.Crafted),
    [10, I, I, I, I, 15, 16, 17, 18, I, I]);
check("améliorée par-dessus, c'est toujours une arme façonnée",
    recordedPlugs(SNAPSHOT, WEAPON, ITEM_STATE.Crafted | ITEM_STATE.Enhanced),
    [10, I, I, I, I, 15, 16, 17, 18, I, I]);
check("un instantané plus court ne se voit pas rallongé",
    recordedPlugs([10, 11, 12], WEAPON, ITEM_STATE.Crafted), [10, I, I]);
check("sans définition, rien n'est oublié",
    recordedPlugs(SNAPSHOT, undefined, ITEM_STATE.Crafted), SNAPSHOT);
check("l'entrée n'est pas modifiée",
    SNAPSHOT, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

process.exit(report());
