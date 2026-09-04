// Vérification de `lib/loadouts/groups/equip.ts` — le plan d'un équipement de
// groupe.
//
// Ce que ces cas protègent, et qui s'était cassé ou aurait pu se casser :
//  - les trois valeurs enregistrées qui ne demandent AUCUNE requête, sur une
//    API dont Bungie limite le débit ;
//  - le vidage restreint aux emplacements que le groupe ne remplit pas ;
//  - un emplacement écarté plutôt qu'équipé à moitié, quand ses objets ont
//    disparu ou que son apparence est incomplète — `SnapshotLoadout` exige les
//    trois identifiants.

import {
    planGroupEquip,
    planRequestCount,
    type GroupEquipContext,
} from "../../src/lib/loadouts/groups/equip";
import {
    emptyGroupLoadout,
    type GroupLoadout,
} from "../../src/lib/loadouts/groups/types";
import {INVALID_HASH} from "../../src/lib/loadouts/loadout";
import type {QueuedItem} from "../../src/lib/actions/store";
import {check, report, section} from "./assert";

// —— Profil témoin ————————————————————————————————————————————
//
// `a1` et `a2` existent, `gone` a été démantelé depuis l'enregistrement.
const HASHES: Record<string, number> = {a1: 11, a2: 12};
const SOCKETS: Record<string, number[]> = {a1: [100, 200, 300], a2: [400]};

const ctx: GroupEquipContext = {
    itemOf: (id) =>
        HASHES[id] === undefined
            ? undefined
            : ({itemInstanceId: id, itemHash: HASHES[id]} satisfies QueuedItem),
    socketsOf: (id) => SOCKETS[id] ?? [],
};

/** Un emplacement plein, avec une apparence valide. */
const full = (items: {id: string; plugs: number[]}[]): GroupLoadout => ({
    colorHash: 1,
    iconHash: 2,
    nameHash: 3,
    items: items.map((i) => ({itemInstanceId: i.id, plugItemHashes: i.plugs})),
});

/** Une liste d'emplacements de groupe, les trous étant des emplacements vides. */
const group = (slots: (GroupLoadout | undefined)[]): GroupLoadout[] =>
    slots.map((slot) => slot ?? emptyGroupLoadout());

// —— Les objets à équiper ——————————————————————————————————————
section("objets à équiper");

const one = planGroupEquip(
    [full([{id: "a1", plugs: [100, 555, INVALID_HASH]}])],
    [emptyGroupLoadout()],
    ctx,
);
check("un emplacement plein est planifié", one.slots.length, 1);
check("son objet part en équipement",
    one.slots[0].equip.map((i) => i.itemInstanceId), ["a1"]);
check("l'objet porte son hash, pour la carte du panneau",
    one.slots[0].equip[0].itemHash, HASHES.a1);
check("l'apparence enregistrée est transmise à l'écrasement",
    one.slots[0].identifiers, {colorHash: 1, iconHash: 2, nameHash: 3});
check("aucun emplacement écarté", one.skipped, []);

// —— Les attributs : seuls ceux qui diffèrent ————————————————————
section("attributs à poser");

check("seul l'attribut qui diffère est posé",
    one.slots[0].plugs.map((p) => [p.socketIndex, p.plugItemHash]), [[1, 555]]);
check("attribut déjà en place : ignoré",
    planGroupEquip([full([{id: "a2", plugs: [400]}])], [], ctx).slots[0].plugs, []);
check("sentinelle (socket non enregistré) : ignorée",
    planGroupEquip([full([{id: "a2", plugs: [INVALID_HASH]}])], [], ctx).slots[0].plugs,
    []);
check("socket vide (0) : ignoré",
    planGroupEquip([full([{id: "a2", plugs: [0]}])], [], ctx).slots[0].plugs, []);
// Aucun socket n'est plus écarté pour cause de verrou : voir la section
// « aspects et fragments » plus bas.
check("un attribut qui diffère est posé, socket verrouillé ou non",
    planGroupEquip([full([{id: "a1", plugs: [100, 200, 777]}])], [], ctx)
        .slots[0].plugs.map((p) => [p.socketIndex, p.plugItemHash]), [[2, 777]]);
check("l'attribut porte l'objet qu'il vise",
    planGroupEquip([full([{id: "a2", plugs: [401]}])], [], ctx)
        .slots[0].plugs.map((p) => [p.itemInstanceId, p.itemHash]),
    [["a2", HASHES.a2]]);

// —— Un objet partagé par plusieurs emplacements ————————————————
//
// Le cas qui se voyait sur les compétences d'une doctrine : un personnage n'en a
// qu'une par élément, et deux emplacements du groupe s'en disputent les sockets.
// « Déjà en place » se juge contre le profil d'AVANT la séquence — écarter ici
// un attribut qu'un emplacement antérieur va déplacer le perd pour de bon,
// l'exécuteur ne sachant pas transformer zéro requête en une.
section("un objet partagé par plusieurs emplacements");

/** Doctrine unique, socket 0 = grenade. Le profil la porte à 400. */
const SUBCLASS: GroupEquipContext = {
    itemOf: (id) =>
        id === "sub" ? ({itemInstanceId: "sub", itemHash: 55} satisfies QueuedItem)
                     : undefined,
    socketsOf: () => [400, 500],
};

const grenade = (hash: number): GroupLoadout => ({
    colorHash: 1, iconHash: 2, nameHash: 3,
    items: [{itemInstanceId: "sub", plugItemHashes: [hash, 500]}],
});

// Slot 0 veut 401 (diffère), slot 1 veut 400 (la valeur en place AVANT).
// Sans relevé des sockets volatils, le second était écarté et son écrasement
// enregistrait la grenade du premier.
const shared = planGroupEquip([grenade(401), grenade(400)], [], SUBCLASS);
check("le socket disputé est posé pour les DEUX emplacements",
    shared.slots.map((s) => s.plugs.map((p) => p.plugItemHash)), [[401], [400]]);

// Le socket 1 vaut 500 partout, et 500 est déjà en place : rien à poser.
check("un socket stable et déjà en place reste écarté",
    shared.slots.every((s) => s.plugs.every((p) => p.socketIndex !== 1)), true);

// Trois emplacements, trois valeurs : aucune n'est écartée.
const three = planGroupEquip(
    [grenade(400), grenade(401), grenade(402)], [], SUBCLASS);
check("trois valeurs pour un socket : les trois sont posées",
    three.slots.map((s) => s.plugs.map((p) => p.plugItemHash)),
    [[400], [401], [402]]);

// Deux emplacements qui demandent la MÊME valeur, déjà en place : rien à poser.
check("deux emplacements d'accord sur la valeur en place : rien à poser",
    planGroupEquip([grenade(400), grenade(400)], [], SUBCLASS)
        .slots.map((s) => s.plugs.length), [0, 0]);

// La sentinelle d'un emplacement ne rend pas le socket volatil : elle veut
// justement dire « ne pas y toucher ».
check("un emplacement à la sentinelle ne rend pas le socket volatil",
    planGroupEquip([grenade(400), grenade(INVALID_HASH)], [], SUBCLASS)
        .slots.map((s) => s.plugs.length), [0, 0]);



// —— Aspects et fragments ————————————————————————————————————————
//
// Une doctrine déverrouille ses emplacements de fragments au fil des aspects
// équipés. Sans aucun aspect en place, les six sont verrouillés *au moment du
// plan* — les écarter perdait tous les fragments de l'emplacement.
//
// Fixture calquée sur « Revenant », relevé sur le manifeste : 5 compétences
// (0-4), 2 aspects (5-6), 6 fragments (7-12). Les dix-huit doctrines placent
// leurs aspects AVANT leurs fragments, ce qui donne à l'ordre des index la
// propriété dont l'insertion dépend.
section("aspects et fragments");

const EMPTY_ASPECT = 900, EMPTY_FRAGMENT = 901;

/** Doctrine sans aucun aspect : tout est à son emplacement vide. */
const BARE: GroupEquipContext = {
    itemOf: () => ({itemInstanceId: "sub", itemHash: 55} satisfies QueuedItem),
    socketsOf: () => [
        10, 11, 12, 13, 14,                     // compétences
        EMPTY_ASPECT, EMPTY_ASPECT,             // aspects, vides
        EMPTY_FRAGMENT, EMPTY_FRAGMENT, EMPTY_FRAGMENT,
        EMPTY_FRAGMENT, EMPTY_FRAGMENT, EMPTY_FRAGMENT,
    ],
};

/** Un instantané avec deux aspects et trois fragments. */
const withAspects: GroupLoadout = {
    colorHash: 1, iconHash: 2, nameHash: 3,
    items: [{
        itemInstanceId: "sub",
        plugItemHashes: [
            10, 11, 12, 13, 14,
            801, 802,                            // aspects
            701, 702, 703,                       // fragments
            EMPTY_FRAGMENT, EMPTY_FRAGMENT, EMPTY_FRAGMENT,
        ],
    }],
};

const restored = planGroupEquip([withAspects], [], BARE).slots[0].plugs;
check("les deux aspects sont posés",
    restored.filter((p) => p.socketIndex >= 5 && p.socketIndex <= 6)
        .map((p) => p.plugItemHash), [801, 802]);
check("les trois fragments le sont AUSSI, verrou ou non",
    restored.filter((p) => p.socketIndex >= 7)
        .map((p) => [p.socketIndex, p.plugItemHash]),
    [[7, 701], [8, 702], [9, 703]]);
check("les emplacements de fragments restés vides ne demandent rien",
    restored.some((p) => p.plugItemHash === EMPTY_FRAGMENT), false);
check("les compétences déjà en place ne demandent rien",
    restored.some((p) => p.socketIndex <= 4), false);

// L'ordre est ce qui fait que ça marche : les aspects doivent partir d'abord.
check("les aspects précèdent les fragments dans la file",
    restored.map((p) => p.socketIndex), [5, 6, 7, 8, 9]);

// —— Les emplacements écartés ————————————————————————————————————
section("emplacements écartés");

const orphan = planGroupEquip(
    [full([{id: "gone", plugs: [1]}, {id: "a1", plugs: []}])],
    [],
    ctx,
);
check("objet démantelé écarté, l'emplacement subsiste",
    orphan.slots[0].equip.map((i) => i.itemInstanceId), ["a1"]);
check("… et rien n'est signalé", orphan.skipped, []);

const allGone = planGroupEquip([full([{id: "gone", plugs: []}])], [], ctx);
check("plus aucun objet : emplacement écarté",
    allGone.skipped, [{loadoutIndex: 0, reason: "noItems"}]);
check("… et rien à équiper", allGone.slots, []);

// `SnapshotLoadout` exige les trois identifiants et refuse la sentinelle :
// l'appel partirait pour être refusé.
for (const [label, ids] of [
    ["couleur", {colorHash: INVALID_HASH, iconHash: 2, nameHash: 3}],
    ["glyphe", {colorHash: 1, iconHash: INVALID_HASH, nameHash: 3}],
    ["nom", {colorHash: 1, iconHash: 2, nameHash: INVALID_HASH}],
] as const) {
    check(`apparence incomplète (${label}) : emplacement écarté`,
        planGroupEquip(
            [{...ids, items: [{itemInstanceId: "a1", plugItemHashes: []}]}],
            [],
            ctx,
        ).skipped,
        [{loadoutIndex: 0, reason: "noIdentifiers"}]);
}

// —— Le vidage ————————————————————————————————————————————————
section("vidage des emplacements du personnage");

const occupied = full([{id: "a1", plugs: []}]);
// Le personnage : 0, 1 et 3 occupés, 2 déjà libre.
const character = [occupied, occupied, emptyGroupLoadout(), occupied];

const partial = planGroupEquip(
    group([full([{id: "a1", plugs: []}]), undefined, undefined,
           full([{id: "a2", plugs: []}])]),
    character,
    ctx,
);
check("ni les libres, ni ceux qu'un écrasement réécrit", partial.clear, [1]);
check("les emplacements remplis, dans l'ordre",
    partial.slots.map((s) => s.loadoutIndex), [0, 3]);

const onlyClear = planGroupEquip(group([undefined, undefined, undefined, undefined]),
    character, ctx);
check("groupe entièrement vide : vide tout ce qui est occupé", onlyClear.clear, [0, 1, 3]);
check("… et n'équipe rien", onlyClear.slots, []);

check("personnage sans emplacement : rien à vider",
    planGroupEquip(group([full([{id: "a1", plugs: []}])]), [], ctx).clear, []);
check("personnage aux emplacements tous libres : rien à vider",
    planGroupEquip(group([full([{id: "a1", plugs: []}])]),
        [emptyGroupLoadout(), emptyGroupLoadout()], ctx).clear, []);

// Un emplacement écarté N'EST PAS réécrit : il doit donc être vidé.
check("un emplacement écarté est tout de même vidé",
    planGroupEquip([full([{id: "gone", plugs: []}])], [occupied], ctx).clear, [0]);

// —— Le coût annoncé ————————————————————————————————————————————
section("coût annoncé");

const counted = planGroupEquip(
    group([
        full([{id: "a1", plugs: [100, 555, INVALID_HASH]}, {id: "a2", plugs: [401]}]),
        undefined,
    ]),
    character,
    ctx,
);
check("vidages : 1 et 3 (0 est réécrit, 2 est libre)", counted.clear, [1, 3]);
check("2 équipements et 2 attributs pour l'unique emplacement",
    [counted.slots[0].equip.length, counted.slots[0].plugs.length], [2, 2]);
// 2 vidages + 2 équipements + 2 attributs + 1 écrasement
check("requêtes au plus", planRequestCount(counted), 7);
check("un plan sans rien à faire ne coûte rien",
    planRequestCount(planGroupEquip([], [], ctx)), 0);
check("un groupe qui ne fait que vider coûte un vidage par emplacement",
    planRequestCount(onlyClear), 3);

// —— Le plan n'altère rien ————————————————————————————————————
section("immuabilité");

const source = group([full([{id: "a1", plugs: [100, 555]}])]);
const before = JSON.stringify(source);
planGroupEquip(source, character, ctx);
check("le groupe passé en entrée est intact", JSON.stringify(source), before);

process.exit(report());
