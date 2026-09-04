// Vérification de `lib/destiny/insert-plan.ts` — ce qu'une insertion d'attribut
// demande réellement, au moment de l'envoi.
//
// Ce que ces cas protègent :
//  - aucune requête pour un attribut déjà en place : l'API la refuserait, et le
//    cas se présente dès que deux emplacements d'un groupe portent la même arme ;
//  - un artéfact n'équipe pas deux fois le même attribut : il faut d'abord l'en
//    retirer là où il est ;
//  - l'énergie d'armure. Les fixtures sont calquées sur « Masque de Bakris »,
//    relevé sur le manifeste : la catégorie ARMOR_MODS y héberge aussi la pièce
//    maîtresse et l'artifice, tous deux SANS coût en énergie — c'est ce qui
//    permet de les épargner sur le seul coût.

import {planInsert, type InsertContext} from "../../src/lib/destiny/insert-plan";
import {
    ARTIFACT_SOCKET_CATEGORIES, ARTIFACT_RESET_CATEGORY,
} from "../../src/lib/destiny/sockets";
import {SOCKET_CATEGORY} from "../../src/lib/destiny/display";
import type {InventoryItemDefinition} from "../../src/lib/destiny/types";
import type {InsertStepRequest} from "../../src/lib/actions/sockets";

import {check, report} from "./assert";

const req = (socketIndex: number, plugItemHash: number): InsertStepRequest => ({
    kind: "insert", itemInstanceId: "i1", itemHash: 42,
    characterId: "c1", socketIndex, plugItemHash,
});

// ——————————————————————————————————————————————————————————
// Artéfact
// ——————————————————————————————————————————————————————————
const EMPTY_MOD = 777;
const artifact = {
    sockets: {
        socketEntries: [
            {singleInitialItemHash: EMPTY_MOD}, {singleInitialItemHash: EMPTY_MOD},
            {singleInitialItemHash: EMPTY_MOD}, {singleInitialItemHash: EMPTY_MOD},
            {singleInitialItemHash: 888},
        ],
        socketCategories: [
            {socketCategoryHash: ARTIFACT_SOCKET_CATEGORIES[0], socketIndexes: [0, 1]},
            {socketCategoryHash: ARTIFACT_SOCKET_CATEGORIES[1], socketIndexes: [2, 3]},
            {socketCategoryHash: ARTIFACT_RESET_CATEGORY, socketIndexes: [4]},
        ],
    },
} as unknown as InventoryItemDefinition;

const noCost = () => 0;
const art = (sockets: number[]): InsertContext =>
    ({def: artifact, sockets, costOf: noCost});

check("attribut déjà en place : rien à envoyer",
    planInsert(art([100, EMPTY_MOD, EMPTY_MOD, EMPTY_MOD]), req(0, 100)), []);

const moved = planInsert(art([EMPTY_MOD, EMPTY_MOD, 300, EMPTY_MOD]), req(0, 300));
check("doublon d'artéfact : deux requêtes", moved.length, 2);
check("… la première vide le socket qui le portait",
    [moved[0].socketIndex, moved[0].plugItemHash], [2, EMPTY_MOD]);
check("… la seconde est l'insertion voulue",
    [moved[1].socketIndex, moved[1].plugItemHash], [0, 300]);
check("artéfact sans doublon : une requête",
    planInsert(art([EMPTY_MOD, EMPTY_MOD, EMPTY_MOD, EMPTY_MOD]), req(0, 300)).length, 1);
check("le socket de réinitialisation n'est pas concerné",
    planInsert(art([EMPTY_MOD, EMPTY_MOD, EMPTY_MOD, EMPTY_MOD]), req(4, 888)).length, 1);

// ——————————————————————————————————————————————————————————
// Arme : ni doublon, ni énergie
// ——————————————————————————————————————————————————————————
const weapon = {
    sockets: {
        socketEntries: [{singleInitialItemHash: 1}, {singleInitialItemHash: 2}],
        socketCategories: [
            {socketCategoryHash: SOCKET_CATEGORY.WEAPON_PERKS, socketIndexes: [0, 1]},
        ],
    },
} as unknown as InventoryItemDefinition;
const wpn = (sockets: number[]): InsertContext =>
    ({def: weapon, sockets, costOf: noCost});

check("arme : perk déjà équipée, rien à envoyer", planInsert(wpn([500, 600]), req(0, 500)), []);
check("arme : perk différente, une requête", planInsert(wpn([500, 600]), req(0, 501)).length, 1);
check("arme : même perk dans un autre socket → pas un doublon",
    planInsert(wpn([500, 600]), req(1, 500)).length, 1);

// ——————————————————————————————————————————————————————————
// Énergie d'armure
//
// Fixtures calquées sur « Masque de Bakris », relevé sur le manifeste : la
// catégorie ARMOR_MODS porte quatre emplacements de mods (0-3), la pièce
// maîtresse (5) et deux emplacements d'artifice (12, 14) — ces trois derniers
// SANS coût en énergie, ce qui doit suffire à les épargner.
// ——————————————————————————————————————————————————————————
const EMPTY = 900, MW = 901, ARTIFICE = 902;
const MOD1 = 1, MOD3 = 3, MOD4 = 4; // hashes choisis égaux à leur coût

const armor = {
    sockets: {
        socketEntries: [
            {singleInitialItemHash: EMPTY}, {singleInitialItemHash: EMPTY},
            {singleInitialItemHash: EMPTY}, {singleInitialItemHash: EMPTY},
            {singleInitialItemHash: 950},   // 4 : cosmétique, hors catégorie
            {singleInitialItemHash: MW},    // 5 : pièce maîtresse
            {singleInitialItemHash: EMPTY}, // 6 : artifice
        ],
        socketCategories: [
            {socketCategoryHash: SOCKET_CATEGORY.ARMOR_MODS, socketIndexes: [0, 1, 2, 3, 5, 6]},
            {socketCategoryHash: SOCKET_CATEGORY.ARMOR_COSMETICS, socketIndexes: [4]},
        ],
    },
} as unknown as InventoryItemDefinition;

/** Coût : le hash d'un mod vaut son coût ; le reste ne coûte rien. */
const cost = (h: number) => (h === MOD1 || h === MOD3 || h === MOD4 ? h : 0);
const arm = (sockets: number[], capacity = 10): InsertContext =>
    ({def: armor, sockets, energyCapacity: capacity, costOf: cost});

// Capacité 10, occupé 3+3 = 6, le socket visé est vide → 4 disponibles
const fits = arm([MOD3, MOD3, EMPTY, EMPTY, 950, MW, ARTIFICE]);
check("énergie suffisante : une seule requête", planInsert(fits, req(2, MOD4)).length, 1);

// Capacité 10, occupé 3+3+3 = 9, socket visé vide → 1 disponible, mod à 4
const tight = arm([MOD3, MOD3, MOD3, EMPTY, 950, MW, ARTIFICE]);
const freed = planInsert(tight, req(3, MOD4));
check("énergie insuffisante : retraits puis insertion", freed.length, 4);
check("… les trois mods sont retirés",
    freed.slice(0, 3).map((r) => [r.socketIndex, r.plugItemHash]),
    [[0, EMPTY], [1, EMPTY], [2, EMPTY]]);
check("… l'insertion voulue vient en dernier",
    [freed[3].socketIndex, freed[3].plugItemHash], [3, MOD4]);
check("… la pièce maîtresse et l'artifice sont épargnés",
    freed.some((r) => r.socketIndex === 5 || r.socketIndex === 6), false);
check("… et le cosmétique hors catégorie aussi",
    freed.some((r) => r.socketIndex === 4), false);

// Le remplacement libère la part de l'occupant du socket visé
// Capacité 10, occupé 3+3+3 = 9 ; on remplace le mod à 3 du socket 2 par un 4
// → disponible = 10 - 9 + 3 = 4, donc ça rentre.
check("le mod remplacé libère sa part",
    planInsert(tight, req(2, MOD4)).length, 1);
// La borne est exacte : 10 - (3+3+1) + 1 = 4, un mod à 4 rentre pile.
const tight1 = arm([MOD3, MOD3, MOD1, EMPTY, 950, MW, ARTIFICE]);
check("la borne se franchit à l'unité près (ça rentre pile)",
    planInsert(tight1, req(2, MOD4)).length, 1);
// Un point d'énergie de moins, et il ne rentre plus.
const tight1Small = arm([MOD3, MOD3, MOD1, EMPTY, 950, MW, ARTIFICE], 9);
check("… un point de moins, et il faut retirer",
    planInsert(tight1Small, req(2, MOD4)).map((r) => r.socketIndex), [0, 1, 2]);

// Un mod gratuit passe toujours
check("mod sans coût : jamais de retrait",
    planInsert(tight, req(3, ARTIFICE)).length, 1);

// Armure pleine mais mod identique : rien du tout
check("armure pleine, mod déjà en place : rien",
    planInsert(tight, req(0, MOD3)), []);

// Capacité inconnue : aucune vérification
check("capacité inconnue : aucune vérification d'énergie",
    planInsert({def: armor, sockets: [MOD3, MOD3, MOD3, EMPTY, 950, MW, ARTIFICE], costOf: cost},
        req(3, MOD4)).length, 1);

// Un socket hors catégorie ARMOR_MODS ne déclenche rien
check("socket cosmétique : aucune vérification d'énergie",
    planInsert(tight, req(4, MOD4)).length, 1);

// Rien à retirer : tous les autres sont déjà vides
const emptyArmor = arm([EMPTY, EMPTY, EMPTY, EMPTY, 950, MW, ARTIFICE], 2);
const impossible = planInsert(emptyArmor, req(0, MOD4));
check("aucun mod à retirer : la requête part seule, Bungie tranchera",
    impossible.length, 1);

// —— Définition absente
check("définition absente : la requête part telle quelle",
    planInsert({def: undefined, sockets: [], costOf: noCost}, req(0, 300)).length, 1);
check("définition absente mais plug en place : rien",
    planInsert({def: undefined, sockets: [300], costOf: noCost}, req(0, 300)), []);

process.exit(report());
