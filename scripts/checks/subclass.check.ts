// Vérification de `lockedFragmentSockets` dans `lib/destiny/subclass.ts` — les
// emplacements de fragments qu'un instantané laisse verrouillés.
//
// Ce que ces cas protègent : l'éditeur d'un groupe doit déduire ses verrous de
// l'**instantané** et non de l'objet vivant. Sans aucun aspect équipé en jeu,
// tous les emplacements de fragments d'une doctrine sont verrouillés — et les
// fragments d'un instantané qui, lui, porte deux aspects devenaient
// immodifiables.
//
// Les chiffres viennent du manifeste : un aspect accorde 2 ou 3 emplacements
// (`plug.energyCapacity.capacityValue`), l'emplacement d'aspect vide n'en
// accorde aucun, et les dix-huit doctrines ont six emplacements de fragments —
// exactement deux aspects à 3.

import {
    lockedFragmentSockets,
    type SubclassSocketKind,
} from "../../src/lib/destiny/subclass";
import {check, report, section} from "./assert";

// Doctrine calquée sur « Revenant » : 5 compétences, 2 aspects, 6 fragments.
const KINDS: ReadonlyMap<number, SubclassSocketKind> = new Map([
    [0, "class"], [1, "movement"], [2, "super"], [3, "melee"], [4, "grenade"],
    [5, "aspect"], [6, "aspect"],
    [7, "fragment"], [8, "fragment"], [9, "fragment"],
    [10, "fragment"], [11, "fragment"], [12, "fragment"],
]);

const EMPTY_ASPECT = 900;
/** Le hash d'un aspect vaut ici sa capacité, pour la lisibilité. */
const capacityOf = (hash: number) => (hash === 2 || hash === 3 ? hash : 0);

/** Un instantané : cinq compétences, deux aspects, puis les fragments. */
const snapshot = (aspects: number[], fragments: number[] = []) => [
    10, 11, 12, 13, 14,
    ...aspects,
    ...fragments,
];

const locked = (aspects: number[]) =>
    [...lockedFragmentSockets(KINDS, snapshot(aspects), capacityOf)].sort(
        (a, b) => a - b,
    );

section("capacité accordée par les aspects");

check("aucun aspect : les six emplacements sont verrouillés",
    locked([EMPTY_ASPECT, EMPTY_ASPECT]), [7, 8, 9, 10, 11, 12]);
check("un aspect à 2 : quatre restent verrouillés",
    locked([2, EMPTY_ASPECT]), [9, 10, 11, 12]);
check("un aspect à 3 : trois restent verrouillés",
    locked([3, EMPTY_ASPECT]), [10, 11, 12]);
check("deux aspects à 2 : deux restent verrouillés",
    locked([2, 2]), [11, 12]);
check("un 2 et un 3 : un seul reste verrouillé",
    locked([2, 3]), [12]);
check("deux aspects à 3 : aucun verrou — les six sont ouverts",
    locked([3, 3]), []);

section("l'ordre des emplacements");

check("les emplacements ouverts sont les PREMIERS dans l'ordre des index",
    locked([2, EMPTY_ASPECT]), [9, 10, 11, 12]);
// L'ordre de la Map ne doit rien décider : la fonction trie ses index.
const shuffled: ReadonlyMap<number, SubclassSocketKind> = new Map(
    [...KINDS].reverse(),
);
check("l'ordre d'insertion de la Map n'entre pas en jeu",
    [...lockedFragmentSockets(shuffled, snapshot([2, EMPTY_ASPECT]), capacityOf)]
        .sort((a, b) => a - b),
    [9, 10, 11, 12]);

section("cas limites");

check("une doctrine sans aspect ni fragment : rien à verrouiller",
    [...lockedFragmentSockets(new Map([[0, "super"]]), [1], capacityOf)], []);
check("un instantané plus court que la doctrine : aspects comptés pour zéro",
    [...lockedFragmentSockets(KINDS, [10, 11], capacityOf)].sort((a, b) => a - b),
    [7, 8, 9, 10, 11, 12]);
check("une capacité qui dépasse le nombre d'emplacements ne déborde pas",
    [...lockedFragmentSockets(
        new Map([[0, "aspect"], [1, "fragment"]]), [3], capacityOf)],
    []);

process.exit(report());
