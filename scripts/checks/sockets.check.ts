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

import { usesAccountPlugs } from "../../src/lib/destiny/sockets";
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

process.exit(report());
