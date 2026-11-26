// Vérification de `lib/clarity/format.ts` — l'allègement des descriptions de
// Clarity avant leur relais au client.
//
// Ce que ces cas protègent : une valeur PvE / PvP qui perd sa balise (plus rien
// à colorer), un lien `javascript:` qui atteint un `href`, une explication de
// terme perdue, et une version de Clarity qui sortirait du cache par son nom
// de dossier.

import {
    clarityIndex,
    clarityNotes,
    clarityVersion,
    resolveClarityHash,
    slimClarity,
} from "../../src/lib/clarity/format";
import {check, report, section} from "./assert";

// Extrait réel de clarity.json (Chaotic Exchanger, Nano-Munitions), raccourci.
const RAW = {
    "8507332": {
        hash: 8507332,
        name: "Chaotic Exchanger",
        itemHash: 1906093346,
        lastUpload: 1783935545841,
        type: "Armor Trait Exotic",
        uploadedBy: "Hawkmoona",
        descriptions: {
            en: [
                {linesContent: [{text: "Grants "}, {classNames: ["void"]}, {text: "Void Grenade."}]},
                {classNames: ["spacer"]},
                {
                    linesContent: [
                        {text: "• Axion: "},
                        {text: "5000%", classNames: ["pve"]},
                        {text: " "},
                        {text: "[4000%]", classNames: ["pvp"]},
                    ],
                },
                {classNames: ["spacer"]},
            ],
        },
    },
    "19542588": {
        hash: 19542588,
        name: "Nano-Munitions",
        descriptions: {
            en: [
                {
                    linesContent: [
                        {text: "Consumes a stack to "},
                        {
                            text: "refill",
                            classNames: ["title"],
                            title: [{linesContent: [{text: "Loads bullets.", title: [{linesContent: [{text: "trop profond"}]}]}]}],
                        },
                        {text: " 25%."},
                    ],
                },
            ],
        },
    },
    "3721627275": {hash: 3721627275, name: "Swap Mag", stats: {Ready: []}, descriptions: {}},
    "1": {
        hash: 1,
        descriptions: {
            en: [
                {
                    classNames: ["bold", "bold"],
                    linesContent: [
                        {text: "ok", link: "https://url.d2clarity.com/x", classNames: ["link"]},
                        {text: "piège", link: "javascript:alert(1)", classNames: ["link"]},
                        {},
                    ],
                },
            ],
        },
    },
    "pas-un-hash": {descriptions: {en: [{linesContent: [{text: "x"}]}]}},
};

const slim = slimClarity(RAW);

section("allègement");
check("seules les entrées décrites, par hash", Object.keys(slim).sort(), ["1", "19542588", "8507332"]);
check("métadonnées retirées, séparateurs de bord ôtés, balises PvE / PvP gardées", slim["8507332"], [
    {linesContent: [{text: "Grants "}, {classNames: ["void"]}, {text: "Void Grenade."}]},
    {classNames: ["spacer"]},
    {
        linesContent: [
            {text: "• Axion: "},
            {text: "5000%", classNames: ["pve"]},
            {text: " "},
            {text: "[4000%]", classNames: ["pvp"]},
        ],
    },
]);
check("classes dédoublonnées, lien https gardé, javascript: retiré, segment vide ôté", slim["1"], [
    {
        classNames: ["bold"],
        linesContent: [
            {text: "ok", classNames: ["link"], link: "https://url.d2clarity.com/x"},
            {text: "piège", classNames: ["link"]},
        ],
    },
]);
check("explication gardée, sans explication imbriquée", slim["19542588"][0].linesContent?.[1], {
    text: "refill",
    classNames: ["title"],
    title: [{linesContent: [{text: "Loads bullets."}]}],
});
check("entrée illisible : rien", slimClarity(null), {});

section("notes");
{
    const notes = clarityNotes(slim["19542588"]);
    check("un terme expliqué, numéroté 1", [...notes.values()], [1]);
    check("aucune note sans explication", clarityNotes(slim["8507332"]).size, 0);
}

section("version");
check("nombre", clarityVersion({descriptions: 2.0637}), "2.0637");
check("chaîne", clarityVersion({descriptions: "2.1"}), "2.1");
check("chemin refusé", clarityVersion({descriptions: "../etc"}), null);
check("absente", clarityVersion({}), null);

section("variantes");
{
    // Hashes réels : « Balles de gros calibre » n'est décrit que sous sa forme
    // ordinaire (1561002382), pas sous celle de chargeur amélioré (494745090).
    const texts = {
        "1561002382": [{linesContent: [{text: "Hits inflict increased Flinch."}]}],
        "10": [{linesContent: [{text: "ordinaire"}]}],
        "11": [{linesContent: [{text: "amélioré"}]}],
    };
    const index = clarityIndex([
        {hash: 1561002382, name: "Balles de gros calibre", category: "magazines", tier: 2},
        {hash: 10, name: "Osmose", category: "frames", tier: 2},
        {hash: 11, name: "Osmose", category: "frames", tier: 3},
        {hash: 12, name: "Sans famille"},
    ]);
    check("son propre hash d'abord", resolveClarityHash({hash: 10, name: "Osmose", category: "frames", tier: 3}, texts, index), 10);
    check("chargeur amélioré : la forme ordinaire",
        resolveClarityHash({hash: 494745090, name: "Balles de gros calibre", category: "magazines", tier: 3}, texts, index),
        1561002382);
    check("variante de même rareté préférée", resolveClarityHash({hash: 99, name: "Osmose", category: "frames", tier: 3}, texts, index), 11);
    check("homonyme d'une autre famille : rien",
        resolveClarityHash({hash: 98, name: "Balles de gros calibre", category: "v400.weapon.mod_guns", tier: 3}, texts, index),
        undefined);
    check("sans famille : jamais indexé", index.size, 2);
    check("index pas encore prêt : rien", resolveClarityHash({hash: 494745090, name: "Balles de gros calibre", category: "magazines"}, texts, undefined), undefined);
}

process.exit(report());
