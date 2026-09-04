// Vérification de `lib/settings/backup.ts` — l'export et la relecture d'une
// sauvegarde JSON.
//
// Ce que ces cas protègent :
//  - **chaque partie est relue pour elle-même**. Un fichier n'ayant que des
//    groupes est valide, comme un fichier n'ayant que des préférences : refuser
//    l'un parce que l'autre manque rendait l'import inutilisable dès qu'on
//    exporte depuis un compte sans groupes ;
//  - un groupe mal formé fait **refuser** le fichier, il ne se dégrade pas — un
//    réglage inconnu retombe sur sa valeur par défaut, un groupe illisible
//    s'équipe ;
//  - le nom de fichier ne dépend pas du fuseau de celui qui l'ouvre, et ne
//    porte aucun caractère que les systèmes de fichiers refusent.

import {
    backupFileName,
    buildBackup,
    readBackup,
    BACKUP_VERSION,
} from "../../src/lib/settings/backup";
import type {LoadoutGroup} from "../../src/lib/loadouts/groups/types";
import type {PersistedSettings} from "../../src/lib/settings/store";
import {check, report, section} from "./assert";

const settings = {
    theme: "dark",
    iconSize: 75,
    vaultIconSize: 60,
    showOrnaments: true,
    showOriginalOnHover: false,
    sorts: "p-,n+",
    weaponGrouping: "none",
    armorGrouping: "none",
    searchHistorySize: 10,
    searchMissMode: "hide",
    viewMode: "groups",
    syncEnabled: false,
} as unknown as PersistedSettings;

const group: LoadoutGroup = {
    id: "g1",
    name: "Raid",
    characterId: "c1",
    color: "#3fa9d4",
    loadouts: [
        {
            colorHash: 1,
            iconHash: 2,
            nameHash: 3,
            items: [{itemInstanceId: "123", plugItemHashes: [4, 5]}],
        },
    ],
    createdAt: 1,
    updatedAt: 2,
};

const now = new Date("2026-09-04T14:32:07.123Z");

// —— L'export ——————————————————————————————————————————————————
section("export");

const backup = buildBackup(settings, [group], now);
check("la version est écrite", backup.version, BACKUP_VERSION);
check("la date d'export est en ISO", backup.exportedAt, "2026-09-04T14:32:07.123Z");
check("les préférences partent sous leur forme persistée", backup.settings, settings);
check("les groupes partent tels quels", backup.groups, [group]);

const groups = [group];
buildBackup(settings, groups, now).groups!.push({...group, id: "g2"});
check("l'export copie la liste, il ne la partage pas", groups.length, 1);

check("nom de fichier daté et sans caractère interdit",
    backupFileName(now), "bdt-sauvegarde-2026-09-04-143207.json");
check("… et il ne contient ni deux-points ni espace",
    /[:\s]/.test(backupFileName(now)), false);

// —— L'aller-retour ————————————————————————————————————————————
section("aller-retour");

const round = readBackup(JSON.stringify(backup));
check("une sauvegarde se relit", round.ok, true);
if (round.ok) {
    check("… avec ses préférences", round.contents.settings, settings);
    check("… et ses groupes", round.contents.groups, [group]);
}

// —— Chaque partie pour elle-même ——————————————————————————————
section("parties indépendantes");

const onlyGroups = readBackup(JSON.stringify({version: 1, groups: [group]}));
check("un fichier de groupes seuls est accepté", onlyGroups.ok, true);
if (onlyGroups.ok) {
    check("… sans préférences", onlyGroups.contents.settings, undefined);
    check("… mais avec ses groupes", onlyGroups.contents.groups!.length, 1);
}

const onlySettings = readBackup(JSON.stringify({version: 1, settings}));
check("un fichier de préférences seules est accepté", onlySettings.ok, true);
if (onlySettings.ok) {
    check("… sans groupes", onlySettings.contents.groups, undefined);
}

check("une liste de groupes vide reste une liste de groupes",
    readBackup(JSON.stringify({groups: []})), {ok: true, contents: {groups: []}});

// —— Les refus ——————————————————————————————————————————————————
section("refus");

for (const [label, raw] of [
    ["chaîne vide", ""],
    ["JSON invalide", "{oops"],
    ["un tableau", "[]"],
    ["une chaîne JSON", '"bonjour"'],
    ["null", "null"],
    ["un nombre", "42"],
] as const) {
    check(`illisible : ${label}`, readBackup(raw), {ok: false, failure: "unreadable"});
}

check("objet vide : rien à importer",
    readBackup("{}"), {ok: false, failure: "empty"});
check("version seule : rien à importer",
    readBackup(JSON.stringify({version: 1})), {ok: false, failure: "empty"});
check("préférences non-objet : ignorées, donc rien à importer",
    readBackup(JSON.stringify({settings: "oui"})), {ok: false, failure: "empty"});
check("préférences en tableau : ignorées de même",
    readBackup(JSON.stringify({settings: []})), {ok: false, failure: "empty"});

// Un groupe mal formé fait refuser le fichier ENTIER : il ne se dégrade pas.
for (const [label, groups] of [
    ["pas un tableau", {}],
    ["identifiant manquant", [{...group, id: undefined}]],
    ["personnage vide", [{...group, characterId: ""}]],
    ["couleur hors format", [{...group, color: "rouge"}]],
    ["instance numérique", [{...group, loadouts: [{colorHash: 1, iconHash: 2,
        nameHash: 3, items: [{itemInstanceId: 123, plugItemHashes: []}]}]}]],
    ["hash d'attribut négatif", [{...group, loadouts: [{colorHash: 1, iconHash: 2,
        nameHash: 3, items: [{itemInstanceId: "1", plugItemHashes: [-1]}]}]}]],
] as const) {
    check(`groupes mal formés : ${label}`,
        readBackup(JSON.stringify({groups})), {ok: false, failure: "badGroups"});
}

// Des groupes valides passent, même avec des préférences illisibles à côté :
// les deux parties sont bien indépendantes.
check("groupes valides et préférences illisibles : les groupes passent",
    readBackup(JSON.stringify({settings: 3, groups: [group]})),
    {ok: true, contents: {groups: [group]}});

// —— Tolérance de version ——————————————————————————————————————
section("tolérance");

check("une version future n'est pas un motif de refus",
    readBackup(JSON.stringify({version: 99, groups: [group]})).ok, true);
check("une version absente non plus",
    readBackup(JSON.stringify({groups: [group]})).ok, true);
check("les champs inconnus sont ignorés sans bruit",
    readBackup(JSON.stringify({groups: [group], quoi: "ça"})).ok, true);

process.exit(report());
