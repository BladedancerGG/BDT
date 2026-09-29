// Vérification de `isSearchablePlugFamily` dans `lib/destiny/plug-families.ts` —
// les familles de plugs dont le sélecteur mérite un champ de recherche.
//
// Ce que ces cas protègent : les identifiants ne se devinent pas. Une
// « Projection de Spectre » s'appelle `hologram`, et les familles `ghosts.*` du
// manifeste portent les mods du spectre, pas ses projections — chercher
// « projection » ou « ghost » ne donne rien. De même, un « Effet de
// téléportation » est un `ship.spawnfx`, une « Interaction » un `emote`.
//
// Les valeurs sont relevées sur le manifeste français, par type d'objet
// affiché : shader 717, emote 699, hologram 298, ship.spawnfx 201, et une
// vingtaine de familles `armor_skins_<classe>_<zone>` d'environ 125 chacune.

import { isSearchablePlugFamily } from "../../src/lib/destiny/plug-families";
import { check, report, section } from "./assert";

section("les familles qui se comptent en centaines");

check("revêtement", isSearchablePlugFamily("shader"), true);
check("interaction", isSearchablePlugFamily("emote"), true);
check("projection de Spectre", isSearchablePlugFamily("hologram"), true);
check("effet de téléportation", isSearchablePlugFamily("ship.spawnfx"), true);

section("les ornements d'armure, une famille par classe et par emplacement");

check("casque de Titan", isSearchablePlugFamily("armor_skins_titan_head"), true);
check("torse d'Arcaniste", isSearchablePlugFamily("armor_skins_warlock_chest"), true);
check("marque de Chasseur", isSearchablePlugFamily("armor_skins_hunter_class"), true);

section("ce qui tient en deux rangées, et n'a rien à filtrer");

check("attribut d'arme", isSearchablePlugFamily("frames"), false);
check("attribut intrinsèque", isSearchablePlugFamily("intrinsics"), false);
check("mod d'armure", isSearchablePlugFamily("enhancements.v2_head"), false);
check("fragment de doctrine", isSearchablePlugFamily("shared.prism.fragments"), false);

section("les pièges de nom");

// Les mods d'un spectre ressemblent à ses projections, et n'en sont pas.
check("mod de spectre", isSearchablePlugFamily("v300.ghosts.mods.perks"), false);
check("pièce maîtresse de spectre", isSearchablePlugFamily("plugs.ghosts.masterworks"), false);
// Un ornement d'ARME est une famille par arme (`..._skins`), jamais des
// centaines d'options : le préfixe des armures ne doit pas l'attraper.
check("ornement d'arme", isSearchablePlugFamily("v400_new_hand_cannon0_skins"), false);
check("revêtement de vaisseau", isSearchablePlugFamily("dawning_ship.shader"), false);

section("l'absence");

check("famille absente", isSearchablePlugFamily(undefined), false);
check("chaîne vide", isSearchablePlugFamily(""), false);

report();
