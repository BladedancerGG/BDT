// Vérification de `lib/loadouts/groups/equip-order.ts` — l'ordre dans lequel un
// groupe s'équipe.
//
// Ce que ces cas protègent :
//  - l'ordre choisi coûte moins que l'ordre des emplacements du personnage, et
//    jamais davantage — c'est la seule raison d'être du module ;
//  - les « familles » d'équipements d'un personnage (du JcJ, du JcE, un raid,
//    qui partagent beaucoup à l'intérieur et presque rien entre elles) se
//    parcourent d'une traite, sans aller-retour ;
//  - un attribut posé **reste posé** une fois l'objet rangé, là où une arme
//    équipée en chasse une autre : les deux ne se comptent pas pareil ;
//  - la permutation rendue reste une permutation, et ne dépend pas d'un
//    parcours de `Map`.

import {
    orderCost,
    orderEquipSlots,
    type EquipState,
    type OrderedSlot,
} from "../../src/lib/loadouts/groups/equip-order";
import {check, report, section} from "./assert";

/** Un emplacement réduit à ses objets. */
const slot = (items: string[], sockets: [string, number][] = []): OrderedSlot => ({
    items,
    sockets: new Map(sockets),
});

const state = (items: string[], sockets: [string, number][] = []): EquipState => ({
    items: new Set(items),
    sockets: new Map(sockets),
});

const NOTHING = state([]);

/** L'ordre « naïf » : celui des emplacements du personnage. */
const naive = (slots: readonly OrderedSlot[]) => slots.map((_, index) => index);

// —— Les cas dégénérés ————————————————————————————————————————
section("cas dégénérés");

check("aucun emplacement", orderEquipSlots([], NOTHING), []);
check("un seul emplacement", orderEquipSlots([slot(["a"])], NOTHING), [0]);

// —— Deux emplacements, un point de départ ——————————————————————
section("le point de départ");

// Le personnage porte déjà la panoplie du second : commencer par lui ne coûte
// rien, et le premier ne coûte alors que ses différences.
const pair = [slot(["a", "b", "c"]), slot(["a", "b", "d"])];
check("on commence par ce que le personnage porte déjà",
    orderEquipSlots(pair, state(["a", "b", "d"])), [1, 0]);
check("… et l'autre sens quand c'est l'autre qui est porté",
    orderEquipSlots(pair, state(["a", "b", "c"])), [0, 1]);
check("le coût s'en ressent : une seule différence à combler",
    orderCost(pair, orderEquipSlots(pair, state(["a", "b", "d"])), state(["a", "b", "d"])),
    1);

// —— Les familles ————————————————————————————————————————————
//
// Le cas réel : trois familles d'équipements sur un même personnage, qui ne
// partagent rien entre elles. Elles arrivent **entrelacées**, comme l'ordre des
// emplacements du jeu les donne.
section("familles d'équipements");

/** Dix objets, dont quelques-uns remplacés — une variante d'une panoplie. */
const variant = (family: string, swaps: Record<number, string> = {}): string[] =>
    Array.from({length: 10}, (_, i) => swaps[i] ?? `${family}${i}`);

const FAMILIES = [
    ["A", variant("A")],
    ["B", variant("B")],
    ["C", variant("C")],
    ["A", variant("A", {9: "A10"})],
    ["B", variant("B", {9: "B10"})],
    ["C", variant("C", {9: "C10"})],
    ["A", variant("A", {9: "A11"})],
    ["B", variant("B", {8: "B11"})],
    ["A", variant("A", {8: "A12"})],
    ["B", variant("B", {7: "B12"})],
    ["B", variant("B", {7: "B13"})],
    ["C", variant("C", {8: "C11"})],
] as const;

const families = FAMILIES.map(([, items]) => slot([...items]));
const order = orderEquipSlots(families, NOTHING);

check("la permutation reste une permutation",
    [...order].sort((a, b) => a - b), naive(families));

/** Les familles traversées, dans l'ordre, sans répétition consécutive. */
const runs = order
    .map((index) => FAMILIES[index][0])
    .filter((family, i, all) => family !== all[i - 1]);
check("chaque famille est parcourue d'une traite", runs.length, 3);

const chosen = orderCost(families, order, NOTHING);
const plain = orderCost(families, naive(families), NOTHING);
check("l'ordre choisi coûte moins que celui du personnage", chosen < plain, true);
// 40 est l'**optimum** de cette instance, confirmé par un Held-Karp exact tenu
// hors dépôt : la recherche locale le retrouve. C'est ce qui justifie de ne pas
// embarquer la programmation dynamique ici.
check("et il coûte l'optimum de cette instance", chosen, 40);
check("là où l'ordre du personnage paie presque chaque panoplie entière",
    plain, 111);

// —— Les sockets ————————————————————————————————————————————
//
// Un attribut posé reste posé, même une fois l'objet déséquipé : deux
// emplacements qui demandent la même valeur ne la paient qu'une fois, même
// séparés par un troisième qui n'en parle pas.
section("attributs");

const withPlug = (items: string[], hash: number) =>
    slot(items, [["sub:0", hash]]);

const plugged = [
    withPlug(["x"], 700),
    slot(["y"]),
    withPlug(["x"], 700),
];
// 2 (objet x + attribut) + 1 (objet y) + 1 (objet x, l'attribut tenant encore).
check("un attribut déjà posé ne se repaie pas, même l'objet rangé entre-temps",
    orderCost(plugged, [0, 1, 2], NOTHING), 4);
check("… mais une valeur différente, si",
    orderCost([withPlug(["x"], 700), withPlug(["x"], 701)], [0, 1], NOTHING), 3);
check("la valeur déjà au profil ne coûte rien",
    orderCost([withPlug(["x"], 700)], [0], state(["x"], [["sub:0", 700]])), 0);

// Deux valeurs pour un même socket : les regrouper par valeur épargne une
// insertion, exactement comme pour les objets.
const disputed = [
    withPlug(["s"], 700),
    withPlug(["s"], 701),
    withPlug(["s"], 700),
];
check("les emplacements d'accord sur un socket se suivent",
    orderCost(disputed, orderEquipSlots(disputed, state(["s"])), state(["s"])), 2);

// —— Rien à gagner ————————————————————————————————————————————
section("quand il n'y a rien à gagner");

// Des panoplies sans un seul objet commun : tous les ordres se valent, et
// l'ordre du personnage est conservé faute de mieux.
const strangers = [slot(["p"]), slot(["q"]), slot(["r"])];
check("des emplacements étrangers gardent leur ordre",
    orderEquipSlots(strangers, NOTHING), [0, 1, 2]);
check("… pour le même coût", orderCost(strangers, [0, 1, 2], NOTHING), 3);

process.exit(report());
