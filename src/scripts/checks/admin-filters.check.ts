// Vérification de `lib/admin/filters.ts` — les filtres de la page de
// statistiques d'administration.
//
// Ce que ces cas protègent : un champ numérique vide qui filtrerait sur zéro
// (`Number("")`), une borne de date exclue, un « jamais » qui passerait un
// intervalle, les filtres d'un tableau qui effaceraient ceux d'un autre en
// réécrivant l'URL, et une URL forgée qui ferait autre chose que d'être ignorée.

import {
    endpointChoice,
    filterRows,
    matchesDate,
    matchesNumber,
    parseEndpointChoice,
    parseTableFilters,
    writeTableFilters,
} from "../../src/lib/admin/filters";
import { check, report, section } from "./assert";

section("lecture de l'URL");
{
    const p = new URLSearchParams(
        "calls.user=%20Blade%20&calls.duration=&calls.attempts=2&calls.attempts.op=gte" +
            "&calls.status=success&calls.status=failure&calls.status=success&calls.httpStatus=503" +
            "&calls.date.min=2026-11-01T00:00:00.000Z&calls.date.max=n'importe&users.displayName=x",
    );
    const f = parseTableFilters("calls", p);
    check("texte rogné", f.user, { kind: "text", text: "Blade" });
    check("nombre vide : pas de filtre sur zéro", f.duration, undefined);
    check("nombre et opérateur", f.attempts, { kind: "number", op: "gte", value: 2 });
    check(
        "nombre invalide ignoré",
        parseTableFilters("calls", new URLSearchParams("calls.duration=abc")).duration,
        undefined,
    );
    check("statut HTTP : liste à cocher", f.httpStatus, { kind: "choice", values: ["503"] });
    check("choix dédoublonnés", f.status, { kind: "choice", values: ["success", "failure"] });
    check("borne invalide ignorée, l'autre gardée", f.date, {
        kind: "date",
        min: "2026-11-01T00:00:00.000Z",
        max: undefined,
    });
    check("filtres d'un autre tableau ignorés", Object.keys(f).sort(), [
        "attempts",
        "date",
        "httpStatus",
        "status",
        "user",
    ]);
    check(
        "opérateur inconnu : égalité",
        parseTableFilters("groups", new URLSearchParams("groups.loadouts=3&groups.loadouts.op=zz")).loadouts,
        { kind: "number", op: "eq", value: 3 },
    );
}

section("écriture de l'URL");
{
    const start = new URLSearchParams("users.displayName=abc&calls.user=old&calls.status=running&page=4");
    const next = writeTableFilters(
        "calls",
        { status: { kind: "choice", values: ["success", "failure"] }, duration: { kind: "number", op: "lt", value: 100 } },
        start,
    );
    check("les autres tableaux et paramètres sont gardés", [next.get("users.displayName"), next.get("page")], ["abc", "4"]);
    check("les anciens filtres du tableau disparaissent", next.get("calls.user"), null);
    check("choix multiples", next.getAll("calls.status"), ["success", "failure"]);
    check("aller-retour", parseTableFilters("calls", next), {
        status: { kind: "choice", values: ["success", "failure"] },
        duration: { kind: "number", op: "lt", value: 100 },
    });
    check("l'original n'est pas modifié", start.get("calls.user"), "old");
}

section("comparaisons");
{
    const d = new Date("2026-11-20T12:00:00.000Z");
    check("borne min incluse", matchesDate(d, "2026-11-20T12:00:00.000Z"), true);
    check("borne max incluse", matchesDate(d, undefined, "2026-11-20T12:00:00.000Z"), true);
    check("hors intervalle", matchesDate(d, "2026-11-21T00:00:00.000Z"), false);
    check("« jamais » n'est dans aucun intervalle", matchesDate(null, "2026-01-01T00:00:00.000Z"), false);
    check("sans borne, tout passe, même « jamais »", matchesDate(null), true);
    check(
        "les cinq opérateurs",
        (["lt", "lte", "eq", "gte", "gt"] as const).map((op) => matchesNumber(5, op, 5)),
        [false, true, true, true, false],
    );
    check("nombre absent jamais retenu", matchesNumber(null, "lte", 10), false);
}

section("filtrage des lignes");
{
    const rows = [
        { name: "Raid", user: "Bladedancer#9791", n: 3, at: new Date("2026-11-01") },
        { name: "PvP", user: "Fay#8377", n: 0, at: new Date("2026-10-01") },
        { name: "Donjon", user: "blade#1", n: 7, at: new Date("2026-11-15") },
    ];
    const cell = (r: (typeof rows)[number], key: string) =>
        key === "name" ? r.name : key === "user" ? r.user : key === "n" ? r.n : key === "both" ? [r.name, r.user] : r.at;
    check("sans filtre : tout", filterRows(rows, {}, cell).length, 3);
    check(
        "texte insensible à la casse",
        filterRows(rows, { user: { kind: "text", text: "BLADE" } }, cell).map((r) => r.name),
        ["Raid", "Donjon"],
    );
    check(
        "filtres cumulés (ET)",
        filterRows(
            rows,
            { user: { kind: "text", text: "blade" }, n: { kind: "number", op: "gt", value: 5 } },
            cell,
        ).map((r) => r.name),
        ["Donjon"],
    );
    check(
        "plusieurs valeurs pour un champ : l'une suffit",
        filterRows(rows, { both: { kind: "text", text: "pvp" } }, cell).map((r) => r.name),
        ["PvP"],
    );
    check(
        "zéro reste un nombre",
        filterRows(rows, { n: { kind: "number", op: "eq", value: 0 } }, cell).map((r) => r.name),
        ["PvP"],
    );
}

section("points d'entrée");
{
    const choice = endpointChoice("POST", "/Destiny2/Actions/Items/TransferItem/");
    check("aller-retour", parseEndpointChoice(choice), {
        method: "POST",
        endpoint: "/Destiny2/Actions/Items/TransferItem/",
    });
    check("option forgée sans méthode", parseEndpointChoice("/Destiny2/"), null);
}

process.exit(report());
