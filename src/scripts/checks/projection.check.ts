// Vérification de l'allègement du manifeste : `lib/manifest/projection.ts`
// (ce qu'on garde d'une définition) et `lib/manifest/json-entries.ts` (le
// découpage en flux d'une table).
//
// Ce que ces cas protègent : un champ lu mais retiré ne casse rien de visible —
// la lecture renvoie `undefined` et l'interface affiche du vide. La projection
// a son contrôle de couverture à la compilation, mais il ne voit que les
// lectures castées vers un type de `ManifestReads`. La dernière section balaie
// donc les sources : un cast vers un autre type (interface locale, type en
// ligne, générique) échapperait au contrôle, et fait échouer celui-ci.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { project, type FieldSpec } from "../../src/lib/manifest/projection";
import { JsonEntrySplitter } from "../../src/lib/manifest/json-entries";
import { check, report, section } from "./assert";

// —— project ——————————————————————————————————————————————————————
section("project : champs gardés et retirés");

const SPEC: FieldSpec = {
    keep: true,
    nested: { a: true },
    list: [{ x: true }],
};

check(
    "seuls les champs listés restent, à toute profondeur",
    project(
        { keep: { deep: 1 }, drop: 2, nested: { a: 1, b: 2 }, list: [{ x: 1, y: 2 }, { y: 3 }] },
        SPEC,
    ),
    { keep: { deep: 1 }, nested: { a: 1 }, list: [{ x: 1 }, {}] },
);

// Certaines lectures distinguent l'absence d'un champ de sa valeur : l'énergie
// d'un plug, notamment, n'existe que sur les mods d'armure (plug-energy.ts).
check(
    "un champ absent reste absent (pas de clé à undefined)",
    Object.keys(project({ nested: { b: 1 } }, SPEC) as object),
    ["nested"],
);
check("null est gardé tel quel", project({ keep: null, nested: null }, SPEC), {
    keep: null,
    nested: null,
});
check("0, false et chaîne vide sont gardés", project({ keep: 0, nested: { a: false } }, { keep: true, nested: { a: true } }), {
    keep: 0,
    nested: { a: false },
});

section("project : forme inattendue, gardée entière");
check("scalaire là où un objet est attendu", project({ nested: 5 }, SPEC), { nested: 5 });
check("objet là où un tableau est attendu", project({ list: { x: 1, y: 2 } }, SPEC), {
    list: { x: 1, y: 2 },
});
check("tableau là où un objet est attendu", project({ nested: [1, 2] }, SPEC), { nested: [1, 2] });

// —— JsonEntrySplitter ————————————————————————————————————————————
section("JsonEntrySplitter : découpage");

/** Découpe `text` en morceaux de `size` caractères, comme le ferait un flux. */
function split(text: string, size: number): Record<string, unknown> {
    const splitter = new JsonEntrySplitter();
    const out: Record<string, unknown> = {};
    for (let i = 0; i < text.length; i += size) {
        for (const entry of splitter.push(text.slice(i, i + size))) {
            Object.assign(out, JSON.parse(`{${entry}}`));
        }
    }
    splitter.end();
    return out;
}

// Les pièges : accolades, crochets, virgules et guillemets échappés DANS les
// chaînes, antislash final, tableaux au premier niveau, espaces partout.
const TRICKY = {
    "1": { name: 'a "b" {c} [d], e', path: "C:\\dir\\", list: [1, [2, { z: "}" }]] },
    "2": [],
    "3": { description: "Ennemis vaincus : 1 000 ✓ — « ok »" },
    "4": "\\",
};
const TEXT = ` \n${JSON.stringify(TRICKY, null, 2)}\n`;

for (const size of [1, 2, 3, 7, 64, TEXT.length]) {
    check(`morceaux de ${size} caractère(s)`, split(TEXT, size), TRICKY);
}
check("objet vide", split("{}", 1), {});

section("JsonEntrySplitter : un fichier tronqué ne passe pas");
for (const [label, text] of [
    ["coupé au milieu d'une entrée", TEXT.slice(0, TEXT.length / 2)],
    ["coupé avant l'accolade finale", TEXT.trimEnd().slice(0, -1)],
    ["vide", ""],
] as const) {
    let threw = false;
    try {
        split(text, 5);
    } catch {
        threw = true;
    }
    check(label, threw, true);
}

// —— Lectures des définitions dans les sources —————————————————————
section("toute lecture d'une définition passe par un type de ManifestReads");

const SRC = "/app/src";
const projectionSource = readFileSync(join(SRC, "lib/manifest/projection.ts"), "utf8");
const readsBlock = /export interface ManifestReads \{([^}]*)\}/.exec(projectionSource)?.[1] ?? "";
const READ_TYPES = new Set([...readsBlock.matchAll(/:\s*(\w+);/g)].map((m) => m[1]));
check("ManifestReads est lisible ici", READ_TYPES.size >= 18, true);
// `ManifestReads[K]`, indexé par une table : le type du registre par construction.
READ_TYPES.add("ManifestReads");

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === "generated" ? [] : sourceFiles(path);
        return /\.tsx?$/.test(name) ? [path] : [];
    });
}

// Chaque motif capture le type vers lequel la donnée est lue ; `{` ou `T`
// (générique) ne sont pas dans le registre et sont donc refusés.
const READS: { label: string; pattern: RegExp }[] = [
    { label: "useDefinition<…>", pattern: /\buseDefinition\s*<\s*([A-Za-z_{][\w]*)/g },
    { label: "getDefinition(s)<…>", pattern: /\bgetDefinitions?\s*<\s*([A-Za-z_{][\w]*)/g },
    { label: ".data as …", pattern: /\.data\s+as\s*\|?\s*([A-Za-z_{][\w]*)/g },
];
// Sans générique, la lecture renvoie `unknown`, castée plus loin hors de vue.
const UNTYPED = /\b(useDefinition|getDefinitions?)\s*\(/g;
// Les seuls fichiers où les types du registre ont le droit d'être déclarés.
const READ_TYPE_HOMES = new Set(["lib/destiny/types.ts", "lib/destiny/icons.ts", "lib/destiny/overlays.ts"]);

const offenders: string[] = [];
for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    // Seuls les fichiers qui lisent le manifeste : `.data as` sert aussi
    // ailleurs (réglages, partages), sur des données qui n'en viennent pas.
    if (!/@\/lib\/manifest\/|from "\.\/(db|manifest|use-definition)"/.test(text)) continue;
    const where = relative(SRC, file);
    if (where.startsWith("lib/manifest/")) continue; // les accesseurs eux-mêmes

    for (const { label, pattern } of READS) {
        for (const match of text.matchAll(pattern)) {
            if (!READ_TYPES.has(match[1])) {
                const line = text.slice(0, match.index).split("\n").length;
                offenders.push(`${where}:${line}  ${label} → ${match[1]}`);
            }
        }
    }
    // Une interface locale du même nom qu'un type du registre passerait le
    // contrôle par homonymie, sans être celle que la projection couvre.
    if (!READ_TYPE_HOMES.has(where)) {
        // Déclarations seulement : `import { type X }` ne doit pas compter.
        const declarations = /^[ \t]*(?:export\s+)?(?:interface\s+(\w+)|type\s+(\w+)\s*[=<])/gm;
        for (const match of text.matchAll(declarations)) {
            const name = match[1] ?? match[2];
            if (READ_TYPES.has(name)) {
                const line = text.slice(0, match.index).split("\n").length;
                offenders.push(`${where}:${line}  ${name} redéclaré localement`);
            }
        }
    }
    for (const match of text.matchAll(UNTYPED)) {
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${where}:${line}  ${match[1]} sans type`);
    }
}
check("aucun cast hors registre", offenders, []);

process.exit(report());
