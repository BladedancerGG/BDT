// Vérification de `usesAccountPlugs` dans `lib/destiny/sockets.ts` — quels
// sockets lisent les plugs débloqués du compte.
//
// Ce que ces cas protègent : les doctrines n'en lisent AUCUN, et c'est
// contre-intuitif puisque leurs sockets déclarent bel et bien
// `ProfilePlugSet`. Bungie renvoie ces plug sets du point de vue d'un seul
// personnage, toujours le même et pas forcément celui qu'on regarde
// (Bungie-net/api#1572) : des aspects pourtant débloqués manquaient au
// sélecteur, et le symptôme changeait d'un personnage à l'autre — de quoi
// croire trois fois de suite que le bug venait de la lecture des drapeaux.
//
// Les valeurs de `plugSources` sont relevées sur le manifeste : attributs
// d'arme 0 ou 2, mods et cosmétiques d'arme 7, mods d'armure 13, ornements
// d'armure 15, attributs d'artéfact 4, aspects et fragments de doctrine 4
// (élémentaires et prismatiques) ou 12 (stase), compétences 6 ou 14.

import {
    displayedEnergyCost,
    isCompletedCatalystPlug,
    isExoticCatalystPlug,
    usesAccountPlugs,
} from "../../src/lib/destiny/sockets";
import type { InventoryItemDefinition } from "../../src/lib/destiny/types";
import { check, report, section } from "./assert";

/** Le strict nécessaire : seul le type de l'objet compte ici. */
const item = (itemType: number) =>
    ({ itemType }) as unknown as InventoryItemDefinition;

const WEAPON = item(3);
const ARMOR = item(2);
const SUBCLASS = item(16);

section("ce que disent les drapeaux");

check("attribut d'arme : le tirage de l'arme, rien d'autre",
    usesAccountPlugs(WEAPON, 0), false);
check("attribut d'arme, source « réutilisable »",
    usesAccountPlugs(WEAPON, 2), false);
check("mods et cosmétiques d'arme", usesAccountPlugs(WEAPON, 7), true);
check("mods d'armure", usesAccountPlugs(ARMOR, 13), true);
check("ornements d'armure", usesAccountPlugs(ARMOR, 15), true);
check("attributs d'artéfact", usesAccountPlugs(item(0), 4), true);
check("objet inconnu du manifeste : les drapeaux font foi",
    usesAccountPlugs(undefined, 4), true);

section("les doctrines n'en lisent aucun");

check("aspects d'une doctrine élémentaire (4)",
    usesAccountPlugs(SUBCLASS, 4), false);
check("aspects de stase (12)", usesAccountPlugs(SUBCLASS, 12), false);
check("compétences (6)", usesAccountPlugs(SUBCLASS, 6), false);
check("grenades de stase (14)", usesAccountPlugs(SUBCLASS, 14), false);
check("un socket de doctrine sans source déclarée",
    usesAccountPlugs(SUBCLASS, 0), false);

// —— Le coût affiché sur l'icône d'un mod.
//
// Ce que ces cas protègent : `energyCost` ne dit pas à lui seul qu'il y a
// quelque chose à afficher. Les 99 fragments de doctrine en portent un, valant
// 1 — un test sur la seule présence du champ leur collait un « 1 » à tous.
// Valeurs relevées sur le manifeste (DestinyEnergyType) : 0 pour l'armure, 4
// pour les coques de spectre, 5 pour les fragments.

section("coût en énergie affiché");

/** Le strict nécessaire : le bloc `plug.energyCost`. */
const plug = (energyCost: number, energyType?: number) =>
    ({ plug: { energyCost: { energyCost, energyType } } }) as
        unknown as InventoryItemDefinition;

check("mod d'armure (type 0)", displayedEnergyCost(plug(3, 0)), 3);
check("mod de spectre (type 4)", displayedEnergyCost(plug(6, 4)), 6);
check("fragment de doctrine (type 5) : rien à afficher",
    displayedEnergyCost(plug(1, 5)), undefined);
check("mod d'armure gratuit : rien non plus",
    displayedEnergyCost(plug(0, 0)), undefined);
check("attribut sans énergie", displayedEnergyCost(ARMOR), undefined);
check("objet inconnu du manifeste",
    displayedEnergyCost(undefined), undefined);
check("type absent : c'est de l'armure",
    displayedEnergyCost(plug(2)), 2);

// —— Catalyseur d'exotique.
//
// Ce que ces cas protègent : chaque champ pris seul laisse passer une famille
// entière. L'étiquette seule ramasse les pièces maîtresses légendaires, la
// rareté seule oublie les refontes de rareté commune, et le trait seul oublie
// les catalyseurs postérieurs à la v800 (Brise-Glace, Aléthonyme…), que Bungie
// ne marque plus — c'est ce qui les privait de leur cadre doré.
//
// Côté « terminé » : le cadre ne se pose ni sur un catalyseur de l'an 1 inséré
// mais pas encore achevé (l'objectif y vit dans un second plug, l'insertion ne
// prouve rien), ni sur une pièce maîtresse ordinaire.

section("catalyseur d'exotique");

/** Un plug de catalyseur tel que le manifeste le décrivait jusqu'à la v800. */
const CATALYST = {
    plug: { uiPlugLabel: "masterwork" },
    inventory: { tierType: 6 },
    traitIds: ["item.exotic_catalyst"],
} as unknown as InventoryItemDefinition;

/** Un catalyseur récent : même étiquette, rareté exotique, plus aucun trait. */
const RECENT_CATALYST = {
    plug: { uiPlugLabel: "masterwork" },
    inventory: { tierType: 6 },
} as unknown as InventoryItemDefinition;

/** Une « refonte » de Révision Zéro : le trait, mais la rareté commune. */
const REFIT = {
    plug: { uiPlugLabel: "masterwork" },
    inventory: { tierType: 2 },
    traitIds: ["item.exotic_catalyst"],
} as unknown as InventoryItemDefinition;

/** Pièce maîtresse d'une arme légendaire : même étiquette, rien d'exotique. */
const LEGENDARY_MASTERWORK = {
    plug: {
        uiPlugLabel: "masterwork",
        plugCategoryIdentifier: "v400.plugs.weapons.masterworks.stat.range",
    },
    inventory: { tierType: 5 },
} as unknown as InventoryItemDefinition;

/** Le plug « à compléter » d'un catalyseur de l'an 1. */
const CATALYST_OBJECTIVE = {
    plug: { uiPlugLabel: "masterwork_interactable" },
    inventory: { tierType: 2 },
} as unknown as InventoryItemDefinition;

/** Le même socket, catalyseur non inséré : « Emplacement de catalyseur vide ». */
const EMPTY_CATALYST = {
    plug: { plugCategoryIdentifier: "v400.empty.exotic.masterwork" },
    inventory: { tierType: 2 },
} as unknown as InventoryItemDefinition;

check("catalyseur marqué du trait", isExoticCatalystPlug(CATALYST), true);
check("catalyseur récent, sans trait",
    isExoticCatalystPlug(RECENT_CATALYST), true);
check("refonte de rareté commune", isExoticCatalystPlug(REFIT), true);
check("pièce maîtresse légendaire",
    isExoticCatalystPlug(LEGENDARY_MASTERWORK), false);
check("plug d'objectif d'un catalyseur de l'an 1",
    isExoticCatalystPlug(CATALYST_OBJECTIVE), false);
check("emplacement de catalyseur vide",
    isExoticCatalystPlug(EMPTY_CATALYST), false);
check("plug inconnu du manifeste", isExoticCatalystPlug(undefined), false);

section("catalyseur d'exotique terminé");

check("catalyseur sur une arme en pièce maîtresse",
    isCompletedCatalystPlug(CATALYST, true), true);
check("catalyseur récent sur une arme en pièce maîtresse",
    isCompletedCatalystPlug(RECENT_CATALYST, true), true);
check("catalyseur de l'an 1 inséré, objectif en cours",
    isCompletedCatalystPlug(CATALYST, false), false);
check("emplacement vide sur une arme en pièce maîtresse",
    isCompletedCatalystPlug(EMPTY_CATALYST, true), false);
check("pièce maîtresse légendaire sur une arme marquée",
    isCompletedCatalystPlug(LEGENDARY_MASTERWORK, true), false);

process.exit(report());
