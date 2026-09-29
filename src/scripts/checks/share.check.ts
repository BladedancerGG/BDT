// Vérification de `lib/loadouts/share/snapshot.ts` et de la validation de
// `lib/loadouts/share/types.ts` — ce qu'un lien de partage emporte.
//
// Ce que ces cas protègent :
//  - un partage est **autonome** : chaque objet y porte son hash et
//    l'emplacement où il s'équipe. C'est toute la raison d'être du format —
//    chez le destinataire, un `itemInstanceId` ne désigne rien ;
//  - l'emplacement retenu est celui de la DÉFINITION et non celui du composant,
//    qui vaut « coffre » pour un objet rangé : la ligne partirait hors de sa
//    rangée ;
//  - les attributs enregistrés passent par `savedSockets`, sentinelle comprise :
//    un socket à choix unique n'écrit pas son vrai hash, et le recopier tel
//    quel viderait l'attribut chez le destinataire, qui n'a plus l'objet pour
//    le retrouver ;
//  - un emplacement vide reste à sa place, sans quoi la grille de la page
//    publique décalerait tous les suivants ;
//  - un objet disparu du compte est absent, il ne fait pas échouer le partage ;
//  - le détail qui voyage avec l'objet porte les attributs ENREGISTRÉS : c'est
//    lui que lit l'infobulle chez le visiteur, qui n'a ni profil ni /api/item ;
//  - `isSharedSnapshot` refuse ce que la page publique ne saurait pas montrer :
//    une autre version du format, un équipement à plusieurs emplacements.

import {buildShare, hasSharedItems, type ShareSource} from "../../src/lib/loadouts/share/snapshot";
import {isSharedSnapshot, shareSlug, sharePath} from "../../src/lib/loadouts/share/types";
import {INVALID_HASH} from "../../src/lib/loadouts/loadout";
import type {DestinyItemComponent, DestinyLoadout} from "../../src/lib/bungie/profile";
import type {ItemDetail} from "../../src/lib/bungie/item-components";

import {check, report, section} from "./assert";

const HELMET = 3448274439, VAULT = 138197802;

const component = (
    itemHash: number,
    itemInstanceId: string,
): DestinyItemComponent => ({
    itemHash,
    itemInstanceId,
    // Au coffre : c'est le cas qui piège, l'emplacement du composant n'y disant
    // pas où l'objet s'équipe.
    bucketHash: VAULT,
    quantity: 1,
    location: 2,
    state: 4,
});

const detail = (sockets: number[]): ItemDetail => ({
    stats: {},
    sockets,
    reusablePlugs: {},
});

const source: ShareSource = {
    items: new Map([
        ["i1", component(1111, "i1")],
        ["i2", component(2222, "i2")],
    ]),
    details: {
        i1: detail([91, 92, 93]),
        i2: detail([81]),
    },
    // Tout s'équipe sur la tête dans ce décor : seul compte le fait que
    // l'emplacement vienne d'ici et non du composant.
    bucketOf: (itemHash) => (itemHash === 1111 || itemHash === 2222 ? HELMET : undefined),
};

const filled: DestinyLoadout = {
    colorHash: 7,
    iconHash: 8,
    nameHash: 9,
    items: [
        // Le second attribut est à la sentinelle : socket non enregistré, ou
        // socket à choix unique. C'est la valeur COURANTE de l'objet qui fait
        // foi — 92.
        {itemInstanceId: "i1", plugItemHashes: [51, INVALID_HASH, 53]},
        {itemInstanceId: "i2", plugItemHashes: [61]},
        // Démantelé depuis l'enregistrement : absent du compte.
        {itemInstanceId: "disparu", plugItemHashes: [1]},
    ],
};

const empty: DestinyLoadout = {
    colorHash: INVALID_HASH,
    iconHash: INVALID_HASH,
    nameHash: INVALID_HASH,
    items: [
        {itemInstanceId: "0", plugItemHashes: []},
        {itemInstanceId: "0", plugItemHashes: []},
    ],
};

section("buildShare");

const group = buildShare("group", "Mon groupe", [filled, empty], source, "#ff0000");

check("les objets portent leur hash", group.loadouts[0].items.map((i) => i.itemHash),
    [1111, 2222]);
check("l'emplacement vient de la définition, pas du composant",
    group.loadouts[0].items.map((i) => i.bucketHash), [HELMET, HELMET]);
check("un objet disparu du compte est absent",
    group.loadouts[0].items.some((i) => i.itemInstanceId === "disparu"), false);
check("la sentinelle est remplacée par l'attribut courant",
    group.loadouts[0].sockets.i1, [51, 92, 53]);
check("les sockets absents de l'enregistrement suivent l'objet",
    group.loadouts[0].sockets.i2, [61]);
check("le détail des objets est mis en commun",
    Object.keys(group.details).sort(), ["i1", "i2"]);
// C'est ce détail que lit l'infobulle du visiteur : y laisser l'état courant de
// l'objet lui aurait fait montrer d'autres attributs que les rangées d'à côté.
check("le détail emporte les attributs ENREGISTRÉS, pas ceux de l'objet",
    group.details.i1.sockets, [51, 92, 53]);
check("l'emplacement vide garde sa place", group.loadouts.length, 2);
check("un emplacement vide ne porte aucun objet", group.loadouts[1].items, []);
check("la couleur suit le groupe", group.color, "#ff0000");
check("le partage est valide", isSharedSnapshot(group), true);
check("le partage porte quelque chose à montrer", hasSharedItems(group), true);

const blank = buildShare("group", "Vide", [empty], source);
check("un groupe sans objet n'a rien à montrer", hasSharedItems(blank), false);
check("aucune couleur : la clé est absente", "color" in blank, false);

const single = buildShare("loadout", "Alpha", [filled], source);
check("un équipement partagé seul est valide", isSharedSnapshot(single), true);

section("isSharedSnapshot");

check("une autre version du format est refusée",
    isSharedSnapshot({...group, version: 2}), false);
check("un équipement à plusieurs emplacements est refusé",
    isSharedSnapshot({...single, loadouts: group.loadouts}), false);
check("un partage sans emplacement est refusé",
    isSharedSnapshot({...group, loadouts: []}), false);
check("une couleur qui n'en est pas est refusée",
    isSharedSnapshot({...group, color: "rouge"}), false);
check("un genre inconnu est refusé",
    isSharedSnapshot({...group, kind: "personnage"}), false);
check("un identifiant d'instance manquant est refusé",
    isSharedSnapshot({
        ...group,
        loadouts: [{...group.loadouts[0], items: [{itemHash: 1, bucketHash: 2, state: 0}]}],
    }), false);

section("le lien");

check("le nom est réduit à un segment lisible",
    shareSlug("Mon Groupe — Été 2026 !", "group"), "mon-groupe-ete-2026");
check("un nom sans une seule lettre retombe sur le genre",
    shareSlug("!!! ???", "loadout"), "loadout");
check("le chemin porte le genre, l'identifiant puis le nom",
    sharePath("group", "aZ09_-", "Mon groupe"), "/group/aZ09_-/mon-groupe");

process.exit(report());
