// Vérification de `lib/loadouts/groups/sync-merge.ts` — la réconciliation entre
// le stockage local et la sauvegarde du compte.
//
// Ce que ces cas protègent, et ils protègent des pertes déjà constatées :
//  - un compte **sans ligne** ne vide pas l'appareil. C'était le défaut
//    d'origine : la route renvoyait `[]` faute de mieux, la relecture écrasait
//    le stockage local, et les groupes disparaissaient au rechargement suivant ;
//  - une sauvegarde **en retard** — envoi refusé, rechargement pendant le délai
//    d'inactivité — n'écrase pas des modifications plus récentes ;
//  - une **suppression** faite sur un autre appareil se propage quand même :
//    c'est ce qui distingue la fusion d'un simple « on garde tout » ;
//  - un **réordonnancement** ne se fait pas annuler par un appareil qui n'a rien
//    touché depuis.

import {mergeGroups} from "../../src/lib/loadouts/groups/sync-merge";
import type {LoadoutGroup} from "../../src/lib/loadouts/groups/types";
import {check, report, section} from "./assert";

/** Un groupe minimal mais valide, daté. */
function group(id: string, updatedAt: number, name = id): LoadoutGroup {
    return {
        id,
        name,
        characterId: "c1",
        loadouts: [],
        createdAt: 0,
        updatedAt,
    };
}

const ids = (groups: readonly LoadoutGroup[]) => groups.map((g) => g.id);

section("Aucune sauvegarde sur le compte");

check(
    "liste locale gardée entière",
    mergeGroups([group("a", 10), group("b", 20)], {groups: null, updatedAt: null}),
    {groups: [group("a", 10), group("b", 20)], needsPush: true},
);

check(
    "rien de part et d'autre : rien à déposer",
    mergeGroups([], {groups: null, updatedAt: null}),
    {groups: [], needsPush: false},
);

section("Sauvegarde vide, mais présente");

check(
    "groupe créé après le dépôt : gardé et redéposé",
    ids(mergeGroups([group("a", 500)], {groups: [], updatedAt: 100}).groups),
    ["a"],
);

check(
    "groupe antérieur au dépôt : supprimé ailleurs, écarté",
    mergeGroups([group("a", 50)], {groups: [], updatedAt: 100}),
    {groups: [], needsPush: false},
);

section("Arbitrage par date");

check(
    "le local plus récent l'emporte",
    mergeGroups([group("a", 200, "local")], {
        groups: [group("a", 100, "distant")],
        updatedAt: 100,
    }).groups[0].name,
    "local",
);

check(
    "le distant plus récent l'emporte",
    mergeGroups([group("a", 100, "local")], {
        groups: [group("a", 300, "distant")],
        updatedAt: 300,
    }).groups[0].name,
    "distant",
);

check(
    "à égalité, le distant tranche",
    mergeGroups([group("a", 100, "local")], {
        groups: [group("a", 100, "distant")],
        updatedAt: 100,
    }).groups[0].name,
    "distant",
);

section("Union");

check(
    "groupe connu du seul serveur : récupéré",
    ids(
        mergeGroups([group("a", 100)], {
            groups: [group("a", 100), group("b", 100)],
            updatedAt: 100,
        }).groups,
    ),
    ["a", "b"],
);

check(
    "rien à redéposer quand le résultat est déjà celui du serveur",
    mergeGroups([group("a", 100)], {
        groups: [group("a", 100)],
        updatedAt: 100,
    }).needsPush,
    false,
);

section("Ordre");

check(
    "l'ordre du côté le plus récemment modifié",
    ids(
        mergeGroups([group("b", 900), group("a", 10)], {
            groups: [group("a", 10), group("b", 100)],
            updatedAt: 100,
        }).groups,
    ),
    ["b", "a"],
);

check(
    "sans modification locale, l'ordre du serveur",
    ids(
        mergeGroups([group("b", 10), group("a", 10)], {
            groups: [group("a", 10), group("b", 10)],
            updatedAt: 100,
        }).groups,
    ),
    ["a", "b"],
);

check(
    "les groupes que le côté directeur ignore passent à la fin",
    ids(
        mergeGroups([group("c", 900), group("a", 10)], {
            groups: [group("a", 10), group("b", 10)],
            updatedAt: 100,
        }).groups,
    ),
    ["c", "a", "b"],
);

section("Sauvegarde en retard — le cas de la perte");

// Le scénario constaté : la modification part avec 800 ms de retard, le
// rechargement l'emporte, et la relecture rend une liste que le serveur avait
// déposée *avant*. Sans arbitrage, elle écrasait le local.
check(
    "modification locale non déposée : conservée",
    mergeGroups([group("a", 5_000, "à jour")], {
        groups: [group("a", 1_000, "périmé")],
        updatedAt: 1_000,
    }),
    {groups: [group("a", 5_000, "à jour")], needsPush: true},
);

process.exit(report());
