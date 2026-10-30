// Vérification de `lib/destiny/stat-breakdown.ts` — décomposition des
// statistiques et recalcul sur les attributs montrés.
//
// Les fixtures reprennent les formes du manifeste (relevé 26.06.29) : la
// pièce maîtresse de palier « Portée » (`v400.plugs.weapons.masterworks.stat.range`)
// porte +10 Portée et +0 conditionnel sur les autres statistiques, l'ancienne
// version d'adepte +3 ; le catalyseur se reconnaît à son trait
// `item.exotic_catalyst` ; la pièce maîtresse d'armure 3.0 porte +1
// conditionnel sur les six statistiques.

import {
    barSegments,
    breakdownStats,
    enhancementTier,
    interpolate,
    invert,
    sumBreakdowns,
    type BreakdownInput,
    type StatScale,
} from "../../src/lib/destiny/stat-breakdown";
import type {InventoryItemDefinition} from "../../src/lib/destiny/types";
import {check, report, section} from "./assert";

const IMPACT = 4043523819;
const RANGE = 1240592695;
const STABILITY = 155624089;
const HANDLING = 943549884;
const RELOAD = 4188031367;
const ACCURACY = 1591432999;
const CHARGE_TIME = 2961396640;

const WEAPONS = 2996146975;
const HEALTH = 392767087;
const GRENADE = 1735777505;

type Stat = [statTypeHash: number, value: number, conditional?: boolean];

const plug = (
    hash: number,
    plugCategoryIdentifier: string,
    stats: Stat[],
    extra: Partial<InventoryItemDefinition> = {},
): InventoryItemDefinition =>
    ({
        hash,
        ...extra,
        displayProperties: {name: String(hash), description: "", hasIcon: false},
        itemType: 19,
        plug: {plugCategoryIdentifier, ...extra.plug},
        investmentStats: stats.map(([statTypeHash, value, conditional]) => ({
            statTypeHash,
            value,
            isConditionallyActive: Boolean(conditional),
        })),
    }) as InventoryItemDefinition;

// —— Arme ————————————————————————————————————————————————————

const FRAME = plug(3355499393, "intrinsics", [[RANGE, 5], [HANDLING, 2, true]]);
const BARREL_RANGE = plug(1, "barrels", [[RANGE, 10]]);
const BARREL_STABILITY = plug(2, "barrels", [[STABILITY, 15]]);
const MAG_HEAVY = plug(3, "magazines", [[HANDLING, -10], [RELOAD, 5]]);
const TIERED_MW_RANGE = plug(
    622249644,
    "v400.plugs.weapons.masterworks.stat.range",
    [[RANGE, 10], [STABILITY, 0, true], [HANDLING, 0, true], [RELOAD, 0, true]],
    {plug: {uiPlugLabel: "masterwork"}},
);
const ADEPT_MW_RANGE = plug(
    2697220197,
    "v400.plugs.weapons.masterworks.stat.range",
    [[RANGE, 10], [STABILITY, 3, true], [HANDLING, 3, true], [RELOAD, 3, true]],
    {plug: {uiPlugLabel: "masterwork"}},
);
// Forme exacte du manifeste : Rechargement y figure deux fois, +10 fixe puis
// +0 conditionnel.
const TIERED_MW_RELOAD = plug(
    882794620,
    "v400.plugs.weapons.masterworks.stat.reload",
    [[RELOAD, 10], [STABILITY, 0, true], [RANGE, 0, true], [HANDLING, 0, true], [RELOAD, 0, true]],
    {plug: {uiPlugLabel: "masterwork"}},
);
// « Armature adaptative » améliorée : +10 Précision, +2 conditionnel ailleurs
const ENHANCED_FRAME = plug(3355499393, "intrinsics", [
    [ACCURACY, 10],
    [RANGE, 2, true],
    [HANDLING, 2, true],
    [RELOAD, 2, true],
    [STABILITY, 2, true],
]);
const ENHANCER = plug(2728416797, "crafting.plugs.weapons.mods.enhancers", [[HANDLING, 10, true]]);
const CATALYST = plug(
    1824496860,
    "v300_new_hand_cannon0_masterwork",
    [[HANDLING, 40, true], [RANGE, 20, true]],
    {traitIds: ["item.exotic_catalyst"], plug: {uiPlugLabel: "masterwork"}},
);

const weapon = (over: Partial<BreakdownInput>): BreakdownInput => ({
    totals: {},
    statPlugs: [],
    shownPlugs: [],
    statHashes: [IMPACT, RANGE, STABILITY, HANDLING, RELOAD],
    maximum: () => 100,
    gearTier: 0,
    masterworked: false,
    ...over,
});

section("Pièce maîtresse de palier : +palier partout, absent des totaux de l'API");
{
    // Totaux de l'API : base + attributs + 10 de pièce maîtresse, sans palier.
    // Base : Impact 80, Portée 45 (armature +5 comprise), Stabilité 50,
    // Maniement 50, Rechargement 40.
    const plugs = [FRAME, BARREL_RANGE, MAG_HEAVY, TIERED_MW_RANGE];
    const totals = {
        [IMPACT]: 80,
        [RANGE]: 45 + 10 + 10,
        [STABILITY]: 50,
        [HANDLING]: 50 - 10,
        [RELOAD]: 40 + 5,
    };
    const got = breakdownStats(
        weapon({totals, statPlugs: plugs, shownPlugs: plugs, gearTier: 5}),
    );
    check("Portée : 10 + 5 de pièce maîtresse en palier 5", got[RANGE], {
        base: 45, bonus: 10, malus: 0, masterwork: 15, total: 70,
    });
    check("Stabilité : +5 de palier seulement", got[STABILITY], {
        base: 50, bonus: 0, malus: 0, masterwork: 5, total: 55,
    });
    check("Maniement : malus et palier", got[HANDLING], {
        base: 50, bonus: 0, malus: 10, masterwork: 5, total: 45,
    });
    check("Impact : hors de la pièce maîtresse, intact", got[IMPACT], {
        base: 80, bonus: 0, malus: 0, masterwork: 0, total: 80,
    });

    const tier3 = breakdownStats(
        weapon({totals, statPlugs: plugs, shownPlugs: plugs, gearTier: 3}),
    );
    check("palier 3 : +3", tier3[RELOAD].masterwork, 3);

    const untiered = breakdownStats(
        weapon({totals, statPlugs: plugs, shownPlugs: plugs, gearTier: 0}),
    );
    check("sans palier : la pièce maîtresse vaut 10, rien ailleurs",
        [untiered[RANGE].masterwork, untiered[STABILITY].masterwork], [10, 0]);
}

section("Statistique déclarée deux fois : le palier n'est ajouté qu'une fois");
{
    const plugs = [TIERED_MW_RELOAD];
    const totals = {[RELOAD]: 50, [STABILITY]: 40};
    const got = breakdownStats(
        weapon({totals, statPlugs: plugs, shownPlugs: plugs, gearTier: 5}),
    );
    check("Rechargement : +15, pas +20", got[RELOAD], {
        base: 40, bonus: 0, malus: 0, masterwork: 15, total: 55,
    });
    check("Stabilité : +5", got[STABILITY].masterwork, 5);
}

section("Arme façonnée ou améliorée : l'intrinsèque amélioré tient lieu de pièce maîtresse");
{
    const plugs = [ENHANCED_FRAME];
    const crafted = (weaponLevel: number, gearTier: number, totals: Record<number, number>) =>
        breakdownStats(
            weapon({
                totals,
                statPlugs: plugs,
                shownPlugs: plugs,
                statHashes: [ACCURACY, RANGE, IMPACT],
                craftedOrEnhanced: true,
                weaponLevel,
                gearTier,
            }),
        );
    // Totaux de l'API : base 50 partout, +10 Précision, +2 conditionnels au
    // niveau 20.
    const low = crafted(12, 5, {[ACCURACY]: 60, [RANGE]: 50, [IMPACT]: 70});
    check("niveau < 20 : +10 sur la principale seule",
        [low[ACCURACY].masterwork, low[ACCURACY].total, low[RANGE].masterwork], [10, 60, 0]);

    const leveled = {[ACCURACY]: 60, [RANGE]: 52, [IMPACT]: 70};
    for (const [tier, main, other] of [[1, 12, 2], [2, 12, 2], [3, 13, 3], [4, 14, 4], [5, 15, 5]]) {
        const got = crafted(20, tier, leveled);
        check(`niveau 20, palier ${tier} : +${main} / +${other}`,
            [got[ACCURACY].masterwork, got[RANGE].masterwork, got[IMPACT].masterwork],
            [main, other, 0]);
        check(`niveau 20, palier ${tier} : base intacte`,
            [got[ACCURACY].base, got[RANGE].base], [50, 50]);
    }

    const legacy = breakdownStats(
        weapon({
            totals: leveled,
            statPlugs: plugs,
            shownPlugs: plugs,
            statHashes: [ACCURACY],
            weaponLevel: 20,
            gearTier: 5,
        }),
    );
    check("arme ordinaire : l'armature reste dans la base", legacy[ACCURACY], {
        base: 60, bonus: 0, malus: 0, masterwork: 0, total: 60,
    });
}

section("Adepte amélioré : formule de DIM, sans condition de niveau");
{
    const plugs = [ENHANCED_FRAME];
    // Totaux de l'API : base 50, +10 Précision, +2 conditionnel compté.
    const totals = {[ACCURACY]: 60, [RANGE]: 52, [IMPACT]: 70};
    const adept = (enhancement: number, gearTier: number, weaponLevel = 1) =>
        breakdownStats(
            weapon({
                totals,
                statPlugs: plugs,
                shownPlugs: plugs,
                statHashes: [ACCURACY, RANGE, IMPACT],
                craftedOrEnhanced: true,
                adept: true,
                enhancementTier: enhancement,
                weaponLevel,
                gearTier,
            }),
        );
    for (const [enhancement, tier, main, other] of [
        [1, 1, 11, 3],
        [2, 3, 13, 3],
        [3, 4, 14, 4],
        [1, 5, 15, 4],
        [2, 5, 15, 5],
        [3, 5, 15, 7],
    ]) {
        const got = adept(enhancement, tier);
        check(`amélioration ${enhancement}, palier ${tier} : +${main} / +${other}`,
            [got[ACCURACY].masterwork, got[RANGE].masterwork, got[IMPACT].masterwork],
            [main, other, 0]);
        check(`amélioration ${enhancement}, palier ${tier} : base intacte`,
            [got[ACCURACY].base, got[RANGE].base], [50, 50]);
    }
    check("niveau d'arme sans effet", adept(3, 5, 20)[RANGE].masterwork, 7);

    check("niveau d'amélioration lu sur les sockets",
        [enhancementTier([1, 2728416797, 3]), enhancementTier([1, 2])], [2, 0]);
}

section("Ancienne pièce maîtresse d'adepte : +3 déjà compté, pas de palier");
{
    const plugs = [FRAME, ADEPT_MW_RANGE];
    const totals = {[RANGE]: 45 + 10, [STABILITY]: 53, [HANDLING]: 53, [RELOAD]: 43};
    const got = breakdownStats(
        weapon({totals, statPlugs: plugs, shownPlugs: plugs, gearTier: 5}),
    );
    check("Stabilité : base 50, +3 de pièce maîtresse, total inchangé", got[STABILITY], {
        base: 50, bonus: 0, malus: 0, masterwork: 3, total: 53,
    });
}

section("Changement d'attribut : recalcul immédiat");
{
    const before = [FRAME, BARREL_RANGE, MAG_HEAVY];
    const after = [FRAME, BARREL_STABILITY, MAG_HEAVY];
    const totals = {[RANGE]: 55, [STABILITY]: 50, [HANDLING]: 40, [RELOAD]: 45};
    const got = breakdownStats(weapon({totals, statPlugs: before, shownPlugs: after}));
    check("Portée perd le canon", got[RANGE], {
        base: 45, bonus: 0, malus: 0, masterwork: 0, total: 45,
    });
    check("Stabilité gagne le nouveau", got[STABILITY], {
        base: 50, bonus: 15, malus: 0, masterwork: 0, total: 65,
    });
    check("Le reste ne bouge pas", got[HANDLING].total, 40);
}

section("Plafond de 100");
{
    const totals = {[RANGE]: 100};
    const got = breakdownStats(
        weapon({totals, statPlugs: [BARREL_RANGE], shownPlugs: [BARREL_RANGE]}),
    );
    check("total au plafond conservé", got[RANGE].total, 100);
    // Retirer le canon d'une arme à 100 : l'investissement réel (au-delà de 100)
    // est perdu dans le plafond de l'API — on retombe à 90, approximation assumée.
    const removed = breakdownStats(weapon({totals, statPlugs: [BARREL_RANGE], shownPlugs: []}));
    check("retrait du canon depuis le plafond", removed[RANGE].total, 90);
}

section("Écarts conditionnels écartés ou soumis à condition");
{
    const totals = {[HANDLING]: 50, [RANGE]: 50};
    const enhancer = breakdownStats(
        weapon({totals, statPlugs: [ENHANCER], shownPlugs: [ENHANCER]}),
    );
    check("aperçu d'amélioration d'adepte ignoré", enhancer[HANDLING], {
        base: 50, bonus: 0, malus: 0, masterwork: 0, total: 50,
    });

    const unfinished = breakdownStats(
        weapon({totals, statPlugs: [CATALYST], shownPlugs: [CATALYST], masterworked: false}),
    );
    check("catalyseur inachevé : sans effet", unfinished[HANDLING].masterwork, 0);

    const done = breakdownStats(
        weapon({
            totals: {[HANDLING]: 90, [RANGE]: 70},
            statPlugs: [CATALYST],
            shownPlugs: [CATALYST],
            masterworked: true,
        }),
    );
    check("catalyseur achevé : en pièce maîtresse", done[HANDLING], {
        base: 50, bonus: 0, malus: 0, masterwork: 40, total: 90,
    });
}

section("Armure 3.0 : la pièce maîtresse ne vise que les statistiques nulles");
{
    const ARMOR_MW = plug(788990506, "v460.plugs.armor.masterworks", [
        [WEAPONS, 1, true],
        [HEALTH, 1, true],
        [GRENADE, 1, true],
    ]);
    const STAT_MOD = plug(10, "enhancements.v2_general", [[GRENADE, 10]]);
    const TUNING = plug(957763733, "core.gear_systems.armor_tiering.plugs.tuning.mods", [
        [HEALTH, 5],
        [WEAPONS, -5],
    ]);
    const plugs = [ARMOR_MW, STAT_MOD, TUNING];
    // Base : Armes 30, Santé 0, Grenade 0
    const got = breakdownStats({
        totals: {[WEAPONS]: 25, [HEALTH]: 6, [GRENADE]: 11},
        statPlugs: plugs,
        shownPlugs: plugs,
        statHashes: [WEAPONS, HEALTH, GRENADE],
        maximum: () => Infinity,
        gearTier: 5,
        masterworked: true,
        armorBase: {[WEAPONS]: 30, [HEALTH]: 0, [GRENADE]: 0},
    });
    check("Armes : base non nulle, pas de pièce maîtresse, malus d'ajustement", got[WEAPONS], {
        base: 30, bonus: 0, malus: 5, masterwork: 0, total: 25,
    });
    check("Santé : ajustement et pièce maîtresse", got[HEALTH], {
        base: 0, bonus: 5, malus: 0, masterwork: 1, total: 6,
    });
    check("Grenade : mod et pièce maîtresse", got[GRENADE], {
        base: 0, bonus: 10, malus: 0, masterwork: 1, total: 11,
    });
}

section("Courbes d'affichage");
{
    // Courbe simplifiée : pente d'un demi-point, comme l'Impact de bien des armes
    const scale: StatScale = {
        statHash: IMPACT,
        maximumValue: 100,
        displayInterpolation: [
            {value: 0, weight: 0},
            {value: 100, weight: 50},
        ],
    };
    check("interpolation", interpolate(60, scale), 30);
    check("arrondi bancaire", [interpolate(61, scale), interpolate(63, scale)], [30, 32]);
    check("plafond d'investissement", interpolate(140, scale), 50);
    check("inversion", invert(30, scale), 60);

    const got = breakdownStats(
        weapon({
            totals: {[IMPACT]: 40},
            statPlugs: [],
            shownPlugs: [plug(20, "barrels", [[IMPACT, 10]])],
            scales: {[IMPACT]: scale},
        }),
    );
    check("+10 d'investissement = +5 affichés", got[IMPACT], {
        base: 40, bonus: 5, malus: 0, masterwork: 0, total: 45,
    });
}

section("Courbe décroissante : vitesse de charge d'un fusil à fusion");
{
    // Courbe relevée sur le manifeste (« Mots creux », 2961396640)
    const scale: StatScale = {
        statHash: CHARGE_TIME,
        maximumValue: 100,
        displayInterpolation: [
            {value: 0, weight: 1000}, {value: 10, weight: 967}, {value: 20, weight: 933},
            {value: 30, weight: 833}, {value: 40, weight: 800}, {value: 50, weight: 767},
            {value: 60, weight: 667}, {value: 70, weight: 633}, {value: 80, weight: 567},
            {value: 90, weight: 533}, {value: 100, weight: 500},
        ],
    };
    const MW = plug(
        1532397225,
        "v400.plugs.weapons.masterworks.stat.charge_time",
        [[CHARGE_TIME, 10], [STABILITY, 0, true]],
        {plug: {uiPlugLabel: "masterwork"}},
    );
    // Investissement 40 (800 ms) + 10 de pièce maîtresse : l'API dit 767 ms.
    const got = breakdownStats(
        weapon({
            totals: {[CHARGE_TIME]: 767},
            statPlugs: [MW],
            shownPlugs: [MW],
            statHashes: [CHARGE_TIME],
            scales: {[CHARGE_TIME]: scale},
            maximum: () => Infinity,
            gearTier: 5,
        }),
    );
    check("+15 d'investissement : 800 → 717 ms, la pièce maîtresse en retire 83", got[CHARGE_TIME], {
        lowerIsBetter: true, base: 800, bonus: 0, malus: 0, masterwork: -83, total: 717,
    });
}

section("Mods de vitesse de charge et de tir");
{
    const DRAW_TIME = 447667954;
    // Formes exactes du manifeste
    const ENHANCED_CHARGE = plug(3779301690, "v400.weapon.mod_damage", []);
    const ADEPT_CHARGE = plug(744770875, "v400.weapon.mod_guns", []);
    const ENHANCED_DRAW = plug(2274738792, "v400.weapon.mod_damage", [[CHARGE_TIME, 10], [DRAW_TIME, 10]]);
    const ADEPT_DRAW = plug(1885045197, "v400.weapon.mod_guns", [[CHARGE_TIME, 10, true], [DRAW_TIME, 10, true]]);
    const TENSION = plug(1882549863, "v400.weapon.mod_guns", [[DRAW_TIME, 6], [CHARGE_TIME, 6], [ACCURACY, 6]]);
    const linear = (statHash: number): StatScale => ({
        statHash,
        maximumValue: 100,
        displayInterpolation: [{value: 0, weight: 1000}, {value: 100, weight: 500}],
    });
    const scales = {[CHARGE_TIME]: linear(CHARGE_TIME), [DRAW_TIME]: linear(DRAW_TIME)};
    const run = (mod: InventoryItemDefinition, statHash: number, apiTotal: number) =>
        breakdownStats(
            weapon({
                totals: {[statHash]: apiTotal},
                statPlugs: [mod],
                shownPlugs: [mod],
                statHashes: [statHash],
                scales,
                maximum: () => Infinity,
            }),
        )[statHash];

    // Base : investissement 40, soit 800 ms.
    check("Enhanced Charge Time : absent de l'API, ajouté (−50 ms)",
        run(ENHANCED_CHARGE, CHARGE_TIME, 800), {lowerIsBetter: true, base: 800, bonus: -50, malus: 0, masterwork: 0, total: 750});
    check("Adept Charge Time : idem",
        run(ADEPT_CHARGE, CHARGE_TIME, 800).total, 750);
    check("Enhanced Draw Time : déjà dans l'API (750 ms)",
        run(ENHANCED_DRAW, DRAW_TIME, 750), {lowerIsBetter: true, base: 800, bonus: -50, malus: 0, masterwork: 0, total: 750});
    check("Adept Draw Time : déjà dans l'API",
        run(ADEPT_DRAW, DRAW_TIME, 750), {lowerIsBetter: true, base: 800, bonus: -50, malus: 0, masterwork: 0, total: 750});
    check("Tension : déjà dans l'API (770 ms)",
        run(TENSION, DRAW_TIME, 770), {lowerIsBetter: true, base: 800, bonus: -30, malus: 0, masterwork: 0, total: 770});

    const swapped = breakdownStats(
        weapon({
            totals: {[CHARGE_TIME]: 800},
            statPlugs: [],
            shownPlugs: [ENHANCED_CHARGE],
            statHashes: [CHARGE_TIME],
            scales,
            maximum: () => Infinity,
        }),
    );
    check("insertion d'Enhanced Charge Time : recalcul immédiat", swapped[CHARGE_TIME].total, 750);
}

section("Segments de barre : rouge seulement sous la base");
{
    check(
        "total au-dessus de la base : pas de rouge, le malus pris sur le bleu",
        barSegments({base: 60, bonus: 10, malus: 8, masterwork: 10, total: 72}),
        {base: 60, bonus: 2, masterwork: 10, malus: 0},
    );
    check(
        "malus plus grand que le bleu : pris ensuite sur le jaune",
        barSegments({base: 60, bonus: 5, malus: 12, masterwork: 10, total: 63}),
        {base: 60, bonus: 0, masterwork: 3, malus: 0},
    );
    check(
        "total égal à la base : pas de rouge",
        barSegments({base: 60, bonus: 0, malus: 10, masterwork: 10, total: 60}),
        {base: 60, bonus: 0, masterwork: 0, malus: 0},
    );
    check(
        "total sous la base : bleu et jaune gardés, rouge jusqu'à la base",
        barSegments({base: 60, bonus: 5, malus: 20, masterwork: 10, total: 55}),
        {base: 40, bonus: 5, masterwork: 10, malus: 5},
    );
    check(
        "bleu et jaune plus grands que le total : rognés, bleu d'abord",
        barSegments({base: 10, bonus: 6, malus: 14, masterwork: 5, total: 7}),
        {base: 0, bonus: 2, masterwork: 5, malus: 3},
    );
    check(
        "rouge jamais au-delà de la base",
        barSegments({base: 10, bonus: 0, malus: 30, masterwork: 0, total: 0}),
        {base: 0, bonus: 0, masterwork: 0, malus: 10},
    );
}

section("sumBreakdowns — statistiques d'un personnage");
{
    const piece = (base: number, bonus: number, malus: number, masterwork: number) => ({
        [HEALTH]: {base, bonus, malus, masterwork, total: base + bonus + masterwork - malus},
    });
    check(
        "somme des pièces, fragment positif versé au bleu",
        sumBreakdowns([piece(20, 10, 0, 0), piece(30, 0, 0, 5)], {[HEALTH]: 75}, [HEALTH]),
        {[HEALTH]: {base: 50, bonus: 20, malus: 0, masterwork: 5, total: 75}},
    );
    check(
        "fragment négatif versé au rouge",
        sumBreakdowns([piece(20, 0, 0, 0), piece(30, 0, 0, 0)], {[HEALTH]: 40}, [HEALTH]),
        {[HEALTH]: {base: 50, bonus: 0, malus: 10, masterwork: 0, total: 40}},
    );
    check(
        "total négatif ramené à 0, statistique absente ignorée",
        sumBreakdowns([piece(5, 0, 0, 0)], {[HEALTH]: -5}, [HEALTH, GRENADE]),
        {[HEALTH]: {base: 5, bonus: 0, malus: 10, masterwork: 0, total: 0}},
    );
}

process.exit(report());
