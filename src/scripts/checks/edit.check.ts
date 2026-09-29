// Vérification de `lib/loadouts/groups/edit.ts` — les écritures sur les
// emplacements d'un groupe.
//
// Ce que ces cas protègent :
//  - `setItems` CONSERVE les attributs déjà enregistrés d'un objet que
//    l'emplacement portait déjà. Resnapshoter tout le monde aurait effacé sans
//    un mot le travail fait dans l'éditeur d'attributs ;
//  - `putPlug` comble avec la sentinelle et ne laisse jamais de trou — un
//    tableau troué se sérialise en `null`, que l'API refuserait ;
//  - remplir un emplacement lui donne une apparence, sans quoi `isEmptyLoadout`
//    le déclarerait libre et son contenu serait invisible ;
//  - `moveGroup` permute les places d'UN personnage sur une liste où ceux de
//    plusieurs sont entrelacés.

import {
    moveItem, padLoadouts, setLoadout, setItems, setIdentifiers,
    removeItem, putPlug, moveGroup,
} from "../../src/lib/loadouts/groups/edit";
import {
    emptyGroupLoadout, type LoadoutGroup,
} from "../../src/lib/loadouts/groups/types";
import {INVALID_HASH, isEmptyLoadout} from "../../src/lib/loadouts/loadout";

import {check, report} from "./assert";

const HELMET = 100, ARMS = 200;
const live: Record<string, number[]> = {a1: [1, 1, 1], a2: [2, 2], b1: [3]};
const plugsOf = (id: string) => live[id] ?? [];
const defaults = {colorHash: 7, iconHash: 8, nameHash: 9};

// —— moveItem / padLoadouts
check("move 0->2", moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
check("move hors bornes", moveItem([1, 2], 0, 5), [1, 2]);
check("pad complète", padLoadouts([], 3).length, 3);
check("pad ne tronque pas", padLoadouts(padLoadouts([], 4), 2).length, 4);
check("emptyGroupLoadout est libre", isEmptyLoadout(emptyGroupLoadout()), true);

// —— setItems : remplace, et CONSERVE les attributs déjà enregistrés
let slots = padLoadouts([], 2);
slots = setItems(slots, 0, new Map([[HELMET, "a2"], [ARMS, "b1"]]), plugsOf, defaults);
check("setItems pose les objets avec leurs attributs du moment",
    slots[0].items.map((i) => i.plugItemHashes), [[2, 2], [3]]);
check("setItems pose les identifiants par défaut",
    [slots[0].colorHash, slots[0].iconHash, slots[0].nameHash], [7, 8, 9]);

slots = putPlug(slots, 0, "a2", 1, 555);
check("attribut modifié à la main", slots[0].items[0].plugItemHashes, [2, 555]);
check("setItems CONSERVE l'instantané modifié",
    setItems(slots, 0, new Map([[HELMET, "a2"], [ARMS, "b1"]]), plugsOf, defaults)[0]
        .items[0].plugItemHashes, [2, 555]);
check("setItems instantane le nouveau venu",
    setItems(slots, 0, new Map([[HELMET, "a2"], [ARMS, "a1"]]), plugsOf, defaults)[0]
        .items.find((i) => i.itemInstanceId === "a1")!.plugItemHashes, [1, 1, 1]);
check("setItems retire ce qui n'est plus retenu",
    setItems(slots, 0, new Map([[ARMS, "b1"]]), plugsOf, defaults)[0]
        .items.map((i) => i.itemInstanceId), ["b1"]);
check("sélection vide : emplacement libre",
    isEmptyLoadout(setItems(slots, 0, new Map(), plugsOf, defaults)[0]), true);

// —— putPlug comble avec la sentinelle, jamais de trou
const p = putPlug(slots, 0, "b1", 4, 999);
check("putPlug comble avec la sentinelle",
    p[0].items[1].plugItemHashes,
    [3, INVALID_HASH, INVALID_HASH, INVALID_HASH, 999]);
check("putPlug ne laisse aucun trou (JSON)",
    JSON.parse(JSON.stringify(p[0].items[1].plugItemHashes)).includes(null), false);
check("putPlug objet inconnu : sans effet",
    putPlug(slots, 0, "nope", 0, 1)[0].items[0].plugItemHashes, [2, 555]);

// —— removeItem
check("removeItem", removeItem(slots, 0, "a2")[0].items.map((i) => i.itemInstanceId), ["b1"]);
check("removeItem inconnu : sans effet", removeItem(slots, 0, "nope")[0].items.length, 2);

// —— setIdentifiers : les trois d'un bloc, sans toucher aux objets
const dressed = setIdentifiers(slots, 0, {colorHash: 11, iconHash: 12, nameHash: 13});
check("setIdentifiers écrit les trois",
    [dressed[0].colorHash, dressed[0].iconHash, dressed[0].nameHash], [11, 12, 13]);
check("setIdentifiers ne touche pas aux objets", dressed[0].items, slots[0].items);
check("setIdentifiers hors bornes : sans effet",
    setIdentifiers(slots, 9, {colorHash: 1, iconHash: 2, nameHash: 3}).length, slots.length);
check("setIdentifiers n'altère pas l'entrée",
    [slots[0].colorHash, slots[0].iconHash, slots[0].nameHash], [7, 8, 9]);

// Un emplacement encore vide peut recevoir une apparence, et reste vide :
// c'est la liste d'objets qui décide, pas les identifiants.
const dressedEmpty = setIdentifiers(padLoadouts([], 1), 0,
    {colorHash: 11, iconHash: 12, nameHash: 13});
check("emplacement vide habillé : toujours libre", isEmptyLoadout(dressedEmpty[0]), true);
// …et setItems respecte alors le choix de l'utilisateur plutôt que les défauts
check("setItems respecte une apparence déjà choisie",
    [setItems(dressedEmpty, 0, new Map([[HELMET, "a1"]]), plugsOf, defaults)[0]]
        .map((l) => [l.colorHash, l.iconHash, l.nameHash])[0], [11, 12, 13]);

// —— moveGroup : permute les places d'UN personnage, laisse les autres
const g = (id: string, character: string): LoadoutGroup =>
    ({id, name: id, characterId: character, loadouts: [], createdAt: 0, updatedAt: 0});
const mixed = [g("a1", "A"), g("b1", "B"), g("a2", "A"), g("b2", "B"), g("a3", "A")];
check("moveGroup A 0->2",
    moveGroup(mixed, "A", 0, 2).map((x) => x.id), ["a2", "b1", "a3", "b2", "a1"]);
check("moveGroup B 0->1",
    moveGroup(mixed, "B", 0, 1).map((x) => x.id), ["a1", "b2", "a2", "b1", "a3"]);
check("moveGroup personnage inconnu : sans effet",
    moveGroup(mixed, "Z", 0, 1).map((x) => x.id), ["a1", "b1", "a2", "b2", "a3"]);
check("moveGroup n'altère pas l'entrée",
    mixed.map((x) => x.id), ["a1", "b1", "a2", "b2", "a3"]);

// —— setLoadout, la brique commune
check("setLoadout hors bornes : sans effet",
    setLoadout(slots, 9, emptyGroupLoadout()).length, slots.length);

process.exit(report());
