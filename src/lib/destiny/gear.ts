// Répartition des emplacements d'une coque de Spectre, d'un vaisseau ou d'un
// passereau entre les rangées de l'infobulle.
//
// Le découpage ne suit PAS les catégories de sockets, et c'est le piège : le
// klaxon d'un passereau loge dans la même catégorie que son revêtement
// (« MODS DE VÉHICULES »), tandis que son moteur est dans « ATTRIBUTS DE
// VÉHICULES » avec son mod. Le jeu, lui, sépare ce qui agit de ce qui décore.
// C'est donc la **famille du plug** qui tranche, relevée sur le manifeste :
//
//   v300.vehicles.mod.speed      « Moteur de Passereau »    (3 plugs)
//   v300.vehicles.mod.function   « Mod pour Passereau » et « Mod de Vaisseau » (16)
//   v300.vehicles.mod.controls   emplacement de conduite    (20 sockets)
//   random.perk                  « Mod aléatoire », le plug d'origine du socket
//                                de mod d'un passereau (533 sockets) — le plug
//                                qui s'y équipe, lui, est un `…mod.function`
//   v300.ghosts.mods.perks       « Module de Spectre »      (80)
//   shader                       « Revêtement »             (717)
//   hologram                     « Projection de Spectre »  (298)
//   ship.spawnfx                 effets d'apparition        (201)
//   v300.vehicles.mod.horn       klaxons (30) — typés « Mod pour Passereau »
//                                dans le manifeste, mais purement sonores :
//                                ils vont avec les décors, pas avec les mods
//   …_engines                    effet de moteur d'un vaisseau exotique
//
// Tout le reste — mods d'expérience, de guidage, d'économie et d'activité de
// Spectre, palier, compteurs — reste sur la rangée des mods, celle qu'on
// clique pour changer ce qui est équipé.

import type { InventoryItemDefinition } from "./types";

/** Rangée de l'infobulle où va un emplacement. */
export type GearRow = "perk" | "cosmetic" | "mod";

/** Ce qui agit sur l'objet et ne se change pas : affiché comme un attribut. */
const PERK_FAMILIES: ReadonlySet<string> = new Set([
  "v300.vehicles.mod.speed",
  "v300.vehicles.mod.function",
  "v300.vehicles.mod.controls",
  "random.perk",
  "v300.ghosts.mods.perks",
]);

/** Ce qui ne fait que décorer : revêtement, projection, apparition, klaxon. */
const COSMETIC_FAMILIES: ReadonlySet<string> = new Set([
  "hologram",
  "ship.spawnfx",
  "v300.vehicles.mod.horn",
]);

/**
 * Rangée d'un emplacement, d'après la famille de son plug **d'origine**.
 *
 * Le plug d'origine et non celui en place : c'est le seul qui ne dépende pas de
 * ce que le joueur y a mis — un socket de mod de passereau porte « Mod
 * aléatoire » tant qu'il est vide, puis un `…mod.function` ensuite, et les deux
 * doivent tomber sur la même rangée.
 */
export function gearRow(def: InventoryItemDefinition | undefined): GearRow {
  const family = def?.plug?.plugCategoryIdentifier;
  if (!family) return "mod";
  if (PERK_FAMILIES.has(family)) return "perk";
  if (COSMETIC_FAMILIES.has(family)) return "cosmetic";
  // Les revêtements ont quelques familles dérivées (« dawning_ship.shader »),
  // et l'effet de moteur d'un vaisseau une famille par événement.
  if (family === "shader" || family.endsWith(".shader")) return "cosmetic";
  if (family.endsWith("_engines")) return "cosmetic";
  return "mod";
}
