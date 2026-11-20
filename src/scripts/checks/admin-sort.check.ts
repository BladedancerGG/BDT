// Vérification de `lib/admin/sort.ts` — le tri des tableaux de la page de
// statistiques d'administration.
//
// Ce que ces cas protègent : le cycle aucun → croissant → décroissant →
// aucun, une seule colonne à la fois, des valeurs absentes qui remonteraient
// en tête une fois le tri inversé, un tri instable, et des paramètres de tri
// effacés par la réécriture des filtres du même tableau.

import { nextSort, parseSort, sortRows, writeSort, type SortState } from "../../src/lib/admin/sort";
import { writeTableFilters } from "../../src/lib/admin/filters";
import { check, report, section } from "./assert";

section("cycle d'un en-tête");
{
    let s: SortState | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
        s = nextSort(s, "user");
        seen.push(s ? s.dir : null);
    }
    check("aucun → croissant → décroissant → aucun → croissant", seen, ["asc", "desc", null, "asc"]);
    check(
        "une autre colonne remplace la première, en croissant",
        nextSort({ key: "user", dir: "desc" }, "date"),
        { key: "date", dir: "asc" },
    );
}

section("URL");
{
    const p = writeSort("calls", { key: "duration", dir: "desc" }, new URLSearchParams("page=3"));
    check("décroissant préfixé d'un tiret", p.get("sort.calls"), "-duration");
    check("aller-retour", parseSort("calls", p), { key: "duration", dir: "desc" });
    check("retrait", writeSort("calls", null, p).has("sort.calls"), false);
    check("colonne inconnue ignorée", parseSort("calls", new URLSearchParams("sort.calls=password")), null);
    check("chaque tableau a le sien", parseSort("users", p), null);
    const filtered = writeTableFilters("calls", { user: { kind: "text", text: "x" } }, p);
    check("les filtres du tableau n'effacent pas son tri", filtered.get("sort.calls"), "-duration");
}

section("tri des lignes");
{
    const rows = [
        { n: "b", v: 2 as number | null, d: new Date("2026-02-01") },
        { n: "A", v: null, d: new Date("2026-01-01") },
        { n: "c", v: 2, d: new Date("2026-03-01") },
        { n: "a10", v: 10, d: new Date("2025-12-01") },
        { n: "a9", v: 1, d: new Date("2026-04-01") },
    ];
    const cell = (r: (typeof rows)[number], key: string) =>
        key === "n" ? r.n : key === "v" ? r.v : key === "both" ? [r.n, "zzz"] : r.d;
    const names = (sort: SortState | null, k = cell) => sortRows(rows, sort, k).map((r) => r.n);

    check("sans tri : ordre d'origine", names(null), ["b", "A", "c", "a10", "a9"]);
    check("texte : sans casse, nombres dans l'ordre naturel", names({ key: "n", dir: "asc" }), [
        "A",
        "a9",
        "a10",
        "b",
        "c",
    ]);
    check("nombres croissants, absent en dernier, égalité stable", names({ key: "v", dir: "asc" }), [
        "a9",
        "b",
        "c",
        "a10",
        "A",
    ]);
    check("décroissant : l'absent reste en dernier", names({ key: "v", dir: "desc" }), [
        "a10",
        "b",
        "c",
        "a9",
        "A",
    ]);
    check("dates", names({ key: "d", dir: "desc" }), ["a9", "c", "b", "A", "a10"]);
    check("plusieurs valeurs : la première trie", names({ key: "both", dir: "desc" }), [
        "c",
        "b",
        "a10",
        "a9",
        "A",
    ]);
    check("l'original n'est pas modifié", rows.map((r) => r.n), ["b", "A", "c", "a10", "a9"]);
}

process.exit(report());
