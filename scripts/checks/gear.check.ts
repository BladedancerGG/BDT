// Vérification de `gearRow` dans `lib/destiny/gear.ts` — la rangée où va
// l'emplacement d'une coque de Spectre, d'un vaisseau ou d'un passereau.
//
// Ce que ces cas protègent : le découpage ne peut pas se lire sur les
// catégories de sockets. Sur un passereau, le klaxon et le revêtement partagent
// « MODS DE VÉHICULES » tandis que le moteur est dans « ATTRIBUTS DE
// VÉHICULES » — un découpage par catégorie mettrait donc le klaxon avec les
// mods et séparerait les deux décors.
//
// Les familles viennent du manifeste (relevées sur les 587 coques, 502
// vaisseaux et 576 passereaux) ; le nom affiché n'est d'aucun secours : les
// klaxons sont typés « Mod pour Passereau », comme les vrais mods.

import { gearRow } from "../../src/lib/destiny/gear";
import type { InventoryItemDefinition } from "../../src/lib/destiny/types";
import { check, report, section } from "./assert";

/** Un plug réduit à ce que `gearRow` en lit. */
const plug = (family?: string) =>
    ({ plug: family ? { plugCategoryIdentifier: family } : undefined }) as
        InventoryItemDefinition;

section("les attributs, qui ne se changent pas");

check("moteur de passereau", gearRow(plug("v300.vehicles.mod.speed")), "perk");
check("mod de passereau et de vaisseau — même famille",
    gearRow(plug("v300.vehicles.mod.function")), "perk");
check("conduite", gearRow(plug("v300.vehicles.mod.controls")), "perk");
check("mod de passereau vide : le plug d'origine du socket",
    gearRow(plug("random.perk")), "perk");
check("module de Spectre", gearRow(plug("v300.ghosts.mods.perks")), "perk");

section("les décors");

check("revêtement", gearRow(plug("shader")), "cosmetic");
check("revêtement d'événement", gearRow(plug("dawning_ship.shader")), "cosmetic");
check("projection de Spectre", gearRow(plug("hologram")), "cosmetic");
check("effet d'apparition", gearRow(plug("ship.spawnfx")), "cosmetic");
// Le piège : typé « Mod pour Passereau » dans le manifeste, et logé dans la
// catégorie des mods — mais il ne fait que du bruit.
check("klaxon", gearRow(plug("v300.vehicles.mod.horn")), "cosmetic");
check("effet de moteur de vaisseau",
    gearRow(plug("v500.ships.events.dawning.exotic.ship0_engines")), "cosmetic");

section("le reste, qui reste sur la rangée des mods");

check("mod d'expérience", gearRow(plug("enhancements.ghosts_experience")), "mod");
check("mod de guidage", gearRow(plug("enhancements.ghosts_tracking")), "mod");
check("mod d'économie", gearRow(plug("enhancements.ghosts_economic")), "mod");
check("mod d'activité", gearRow(plug("enhancements.ghosts_activity")), "mod");
check("palier de Spectre", gearRow(plug("plugs.ghosts.masterworks")), "mod");
check("compteur de Spectre", gearRow(plug("ghost.tracker_left")), "mod");

section("les cas dégénérés");

check("plug sans famille", gearRow(plug()), "mod");
check("aucun plug", gearRow(undefined), "mod");
// « shader » en fin de famille, mais pas un revêtement : le test porte sur le
// séparateur, pas sur une simple présence du mot.
check("famille qui contient « shader » sans en être une",
    gearRow(plug("enhancements.shaderless")), "mod");

process.exit(report());
