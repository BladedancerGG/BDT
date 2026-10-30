// Décomposition des statistiques d'un objet : base, attributs et mods,
// pièce maîtresse — et le total tel que les attributs **affichés** le donnent.
//
// L'API ne renvoie que des totaux (composant 304). Plutôt que de tout
// reconstruire depuis les définitions comme DIM, on part de ces totaux et on en
// retire ce que les plugs y apportent : tout ce qu'on ne sait pas modéliser
// (artéfact, bonus d'arme d'adepte, intrinsèques améliorés…) reste ainsi juste,
// fondu dans la base. Seules les règles qui touchent un plug **changeable** ou
// un écart que Bungie omet ont besoin d'être exactes — elles sont reprises de
// DIM (`stats-conditional.ts`), vérifiées contre le manifeste.
//
// Module pur : ni React, ni Dexie. Vérifié par `scripts/checks/stat-breakdown.check.ts`.

import type {InventoryItemDefinition} from "./types";
import {isMasterworkPlug} from "./sockets";

/** Une courbe d'affichage (`DestinyStatGroupDefinition.scaledStats[]`). */
export interface StatScale {
    statHash: number;
    maximumValue: number;
    displayInterpolation: { value: number; weight: number }[];
}

export interface StatBreakdown {
    /** Ce que l'objet vaut sans attributs, mods ni pièce maîtresse. Armature comprise. */
    base: number;
    /** Points ajoutés par les attributs et mods (≥ 0) */
    bonus: number;
    /** Points retirés par les attributs et mods (≥ 0) */
    malus: number;
    /** Points ajoutés par la pièce maîtresse ou le catalyseur (≥ 0) */
    masterwork: number;
    /** base + bonus + masterwork − malus */
    total: number;
    /**
     * Courbe décroissante (vitesse de charge, de tir : 1000 → 500 ms) : un
     * gain s'y affiche en négatif. Ne sert qu'à colorer selon le vrai sens.
     */
    lowerIsBetter?: boolean;
}

export interface BreakdownInput {
    /** Totaux renvoyés par l'API, qui décrivent `statPlugs` */
    totals: Record<number, number>;
    /** Plugs en place quand Bungie a calculé `totals` (sockets visibles et actifs) */
    statPlugs: readonly (InventoryItemDefinition | undefined)[];
    /** Plugs montrés : insertion en attente ou instantané de groupe compris */
    shownPlugs: readonly (InventoryItemDefinition | undefined)[];
    /** Statistiques à décomposer */
    statHashes: readonly number[];
    /** Courbes d'affichage du groupe de statistiques de l'objet, par hash */
    scales?: Readonly<Record<number, StatScale | undefined>>;
    /** Plafond d'une statistique sans courbe — 100 pour une note d'arme */
    maximum: (statHash: number) => number;
    /** Palier d'équipement (0 sans palier) */
    gearTier: number;
    /** L'objet est-il en pièce maîtresse (ITEM_STATE.Masterwork) ? Décide des catalyseurs. */
    masterworked: boolean;
    /**
     * Arme façonnée ou améliorée (ITEM_STATE.Crafted / Enhanced) : elle n'a pas
     * de socket de pièce maîtresse, c'est son intrinsèque amélioré qui en tient
     * lieu — voir `isEnhancedIntrinsic`.
     */
    craftedOrEnhanced?: boolean;
    /** Niveau d'une arme façonnée ou améliorée */
    weaponLevel?: number;
    /** Arme d'adepte (`isAdept` de sa définition) */
    adept?: boolean;
    /** Niveau d'amélioration d'une arme améliorée, 0 à 3 — voir `enhancementTier` */
    enhancementTier?: number;
    /**
     * Statistiques de base d'une armure 3.0, lues sur ses plugs `armor_stats`.
     * Décident où s'applique sa pièce maîtresse — voir `armorBaseStats`.
     */
    armorBase?: Readonly<Record<number, number>>;
}

// —— Hashes et familles relevés sur le manifeste ————————————————

/** Aperçu des améliorations d'adepte : ces écarts n'existent pas en jeu. */
const ENHANCER_CATEGORY = "crafting.plugs.weapons.mods.enhancers";
/** Condensateur élémentaire (et sa version améliorée) : bonus selon l'élément de la super, hors de portée. */
const ELEMENTAL_CAPACITOR = new Set([3511092054, 711234314]);
/** Seul trait qui distingue un catalyseur d'exotique. */
const EXOTIC_CATALYST_TRAIT = "item.exotic_catalyst";
/** Pièces maîtresses d'armure 3.0 : +1 par niveau, seulement là où la base est nulle. */
const ARMOR_MASTERWORK_CATEGORY = "v460.plugs.armor.masterworks";
/** Ajustement équilibré : même règle que la pièce maîtresse d'armure. */
const BALANCED_TUNING = 3122197216;
/**
 * Écarts que le jeu applique sans que le manifeste les déclare.
 *
 * « Enhanced Charge Time » (3779301690) et « Adept Charge Time » (744770875)
 * ont un `investmentStats` vide : leur seul « +10 Charge Time » est le texte
 * de leur perk. Leurs équivalents « Draw Time » et « Tension », eux, déclarent
 * leurs écarts. Rien n'étant déclaré, l'API ne peut pas les compter : ils sont
 * ajoutés aux totaux. DIM ne les rattrape pas non plus.
 */
const UNDECLARED_PLUG_STATS: Readonly<Record<number, readonly {statHash: number; value: number}[]>> = {
    3779301690: [{statHash: 2961396640, value: 10}],
    744770875: [{statHash: 2961396640, value: 10}],
};
/** Plugs anonymes qui portent les statistiques de base d'une armure 3.0. */
const ARMOR_STATS_CATEGORY = "armor_stats";

/** Niveau d'arme à partir duquel l'intrinsèque amélioré donne ses bonus secondaires. */
const ENHANCED_INTRINSIC_LEVEL = 20;
/** Bonus secondaire de l'intrinsèque amélioré, tel que le manifeste le déclare. */
const ENHANCED_INTRINSIC_BONUS = 2;

/**
 * Plugs « Amélioration 1/2/3 » : leur présence dit le niveau d'amélioration
 * d'une arme améliorée (relevé par DIM, `crafted.ts`, vérifié sur le manifeste).
 */
const ENHANCEMENT_TIER_PLUGS: Readonly<Record<number, number>> = {
    2728416798: 1,
    2728416797: 2,
    2728416796: 3,
};

/** Niveau d'amélioration d'une arme, d'après les plugs de tous ses sockets. */
export function enhancementTier(sockets: readonly number[]): number {
    for (const hash of sockets) {
        const tier = ENHANCEMENT_TIER_PLUGS[hash];
        if (tier) return tier;
    }
    return 0;
}

/**
 * Intrinsèque amélioré d'une arme d'adepte, d'après DIM (`getPlugStatValue`) :
 * aucune condition de niveau d'arme. Les secondaires valent le +2 déclaré, +1
 * comme toute pièce maîtresse d'adepte, +1 encore au niveau d'amélioration 3,
 * et en palier 5 le niveau d'amélioration en sus. La principale reçoit le
 * palier, comme une arme façonnée.
 */
function adeptIntrinsicBonus(declared: number, enhancement: number, gearTier: number): number {
    return declared + (enhancement >= 3 ? 2 : 1) + (gearTier >= 5 ? enhancement : 0);
}

/**
 * Intrinsèque amélioré : +10 sur une statistique, +2 conditionnel sur six
 * autres (184 plugs `intrinsics` de cette forme au relevé, aucune autre forme
 * n'ayant de +10).
 */
function isEnhancedIntrinsic(def: InventoryItemDefinition): boolean {
    if (def.plug?.plugCategoryIdentifier !== "intrinsics") return false;
    const stats = def.investmentStats ?? [];
    return (
        stats.some((stat) => !stat.isConditionallyActive && stat.value === 10) &&
        stats.some((stat) => stat.isConditionallyActive)
    );
}

type PlugRole = "base" | "perk" | "masterwork";

/**
 * Part de la barre où va l'apport d'un plug.
 *
 * L'armature et les statistiques d'armure font partie de la base — sauf
 * l'intrinsèque amélioré d'une arme façonnée ou améliorée, qui porte le bonus
 * de pièce maîtresse à la place du socket qu'elle n'a pas.
 */
function plugRole(
    def: InventoryItemDefinition,
    input: Pick<BreakdownInput, "craftedOrEnhanced">,
): PlugRole {
    const category = def.plug?.plugCategoryIdentifier;
    if (category === ARMOR_STATS_CATEGORY) return "base";
    if (category === "intrinsics") {
        return input.craftedOrEnhanced && isEnhancedIntrinsic(def) ? "masterwork" : "base";
    }
    return isMasterworkPlug(def) ? "masterwork" : "perk";
}

/**
 * Pièce maîtresse d'arme à palier, nouvelle formule.
 *
 * Elle porte +10 sur sa statistique et +0 conditionnel sur les autres : le jeu
 * y ajoute le palier de l'arme, **partout** — la statistique principale
 * comprise (Portée +15 en palier 5) —, et l'API l'omet de ses totaux. Les
 * anciennes pièces maîtresses d'adepte portent +3 et non 0 : elles ne sont pas
 * concernées (relevé sur les 17 familles `v400.plugs.weapons.masterworks.stat.*`).
 */
function isTieredMasterwork(def: InventoryItemDefinition): boolean {
    if (def.plug?.uiPlugLabel !== "masterwork") return false;
    return (def.investmentStats ?? []).some(
        (stat) => stat.isConditionallyActive && stat.value === 0,
    );
}

/**
 * Statistiques de base d'une armure 3.0 : somme de ses plugs `armor_stats`.
 *
 * À lire sur **tous** les sockets, masqués compris : le jeu les cache, la
 * statistique étant présentée ailleurs.
 */
export function armorBaseStats(
    plugs: readonly (InventoryItemDefinition | undefined)[],
): Record<number, number> {
    const base: Record<number, number> = {};
    for (const def of plugs) {
        if (def?.plug?.plugCategoryIdentifier !== ARMOR_STATS_CATEGORY) continue;
        for (const stat of def.investmentStats ?? []) {
            base[stat.statTypeHash] = (base[stat.statTypeHash] ?? 0) + stat.value;
        }
    }
    return base;
}

interface PlugStat {
    statHash: number;
    /** Écart en points d'investissement */
    value: number;
    /** Part de `value` que l'API omet de ses totaux */
    missing: number;
}

/** Un écart conditionnel s'applique-t-il ? Règles reprises de DIM, vérifiées sur le manifeste. */
function conditionalActive(
    def: InventoryItemDefinition,
    statHash: number,
    input: Pick<BreakdownInput, "armorBase">,
): boolean {
    const category = def.plug?.plugCategoryIdentifier;
    if (category === ENHANCER_CATEGORY) return false;
    if (ELEMENTAL_CAPACITOR.has(def.hash ?? 0)) return false;
    if (category === ARMOR_MASTERWORK_CATEGORY || def.hash === BALANCED_TUNING) {
        return (input.armorBase?.[statHash] ?? 0) === 0;
    }
    // Ailleurs, l'écart conditionnel est tenu pour actif : mods et pièces
    // maîtresses d'adepte ne s'insèrent que sur une arme d'adepte.
    return true;
}

/** Entrées d'une même statistique réunies : part fixe et part conditionnelle. */
interface MergedStat {
    statHash: number;
    fixed: number;
    conditional: number;
    hasConditional: boolean;
    hasFixed: boolean;
}

/**
 * Réunit les entrées d'une même statistique.
 *
 * Indispensable avant d'appliquer une règle **par statistique** : la pièce
 * maîtresse de palier « Rechargement » déclare Rechargement deux fois (+10 fixe,
 * +0 conditionnel), et y ajouter le palier à chaque entrée le comptait deux
 * fois — +20 en palier 5 au lieu de +15. DIM réunit de même
 * (`getPlugInvestmentStats`).
 */
function mergeStats(def: InventoryItemDefinition): MergedStat[] {
    const byHash = new Map<number, MergedStat>();
    for (const stat of def.investmentStats ?? []) {
        let entry = byHash.get(stat.statTypeHash);
        if (!entry) {
            entry = {
                statHash: stat.statTypeHash,
                fixed: 0,
                conditional: 0,
                hasConditional: false,
                hasFixed: false,
            };
            byHash.set(stat.statTypeHash, entry);
        }
        if (stat.isConditionallyActive) {
            entry.conditional += stat.value;
            entry.hasConditional = true;
        } else {
            entry.fixed += stat.value;
            entry.hasFixed = true;
        }
    }
    return [...byHash.values()];
}

/**
 * Les écarts qu'un plug applique réellement à cet objet.
 *
 * Règle commune aux deux sources de pièce maîtresse : l'API compte ce que le
 * manifeste déclare (et qui est actif), le jeu y ajoute un bonus que rien ne
 * déclare — c'est lui, `missing`, qu'il faut rajouter aux totaux.
 */
export function activePlugStats(
    def: InventoryItemDefinition,
    input: Pick<
        BreakdownInput,
        | "gearTier"
        | "masterworked"
        | "armorBase"
        | "craftedOrEnhanced"
        | "weaponLevel"
        | "adept"
        | "enhancementTier"
    >,
): PlugStat[] {
    const catalyst = def.traitIds?.includes(EXOTIC_CATALYST_TRAIT) ?? false;
    // Un catalyseur s'insère avant d'être achevé, sans effet jusque-là.
    if (catalyst && !input.masterworked) return [];

    const tiered = isTieredMasterwork(def) && input.gearTier > 0;
    const enhancedIntrinsic =
        input.craftedOrEnhanced === true && isEnhancedIntrinsic(def);
    // Arme façonnée ou améliorée de niveau 20 : +2 sur les statistiques
    // secondaires, porté au palier au-delà du palier 2 — et la statistique
    // principale en reçoit autant. Avant le niveau 20, la principale seule
    // garde ses +10.
    const leveled = (input.weaponLevel ?? 0) >= ENHANCED_INTRINSIC_LEVEL;
    const intrinsicBonus = leveled
        ? Math.max(ENHANCED_INTRINSIC_BONUS, input.gearTier)
        : 0;

    const result: PlugStat[] = [];
    for (const stat of mergeStats(def)) {
        let value: number;
        let missing = 0;

        if (tiered) {
            // Le palier s'ajoute une fois par statistique, principale comprise.
            value = stat.fixed + stat.conditional + input.gearTier;
            missing = input.gearTier;
        } else if (enhancedIntrinsic && input.adept) {
            if (stat.hasFixed) {
                value = stat.fixed + input.gearTier;
                missing = input.gearTier;
            } else {
                // Seul le +2 déclaré est tenu pour compté par l'API.
                value = adeptIntrinsicBonus(
                    stat.conditional,
                    input.enhancementTier ?? 0,
                    input.gearTier,
                );
                missing = value - stat.conditional;
            }
        } else if (enhancedIntrinsic) {
            if (stat.hasFixed) {
                value = stat.fixed + intrinsicBonus;
                missing = intrinsicBonus;
            } else {
                // Le +2 conditionnel déclaré est compté par l'API une fois
                // le niveau atteint ; le reste du palier ne l'est pas.
                const counted = leveled ? stat.conditional : 0;
                value = intrinsicBonus;
                missing = intrinsicBonus - counted;
            }
        } else {
            value = stat.fixed;
            // Achevé, un catalyseur applique tout ce qu'il déclare.
            if (stat.hasConditional && (catalyst || conditionalActive(def, stat.statHash, input))) {
                value += stat.conditional;
            }
        }
        if (value === 0 && missing === 0) continue;
        result.push({statHash: stat.statHash, value, missing});
    }
    for (const extra of UNDECLARED_PLUG_STATS[def.hash ?? 0] ?? []) {
        result.push({statHash: extra.statHash, value: extra.value, missing: extra.value});
    }
    return result;
}

// —— Courbes d'affichage ——————————————————————————————————————

/** Arrondi bancaire : celui du jeu (Bungie-net/api#1029), sauf pour le chargeur. */
function bankersRound(x: number): number {
    const r = Math.round(x);
    return Math.abs(x) % 1 === 0.5 ? (r % 2 === 0 ? r : r - 1) : r;
}

const MAGAZINE = 3871231066;

/** Investissement → valeur affichée, comme le jeu (et DIM). */
export function interpolate(value: number, scale: StatScale): number {
    const points = scale.displayInterpolation;
    if (points.length === 0) return value;
    value = Math.min(value, scale.maximumValue);

    let end = points.findIndex((p) => p.value > value);
    // Au-delà du dernier point, ou en deçà de zéro (un malus) : le segment
    // extrême est prolongé.
    if (end < 0) end = points.length - 1;
    const start = Math.max(0, end - 1);
    const a = points[start];
    const b = points[end];
    if (b.value === a.value) return a.weight;

    const weight = a.weight + ((value - a.value) / (b.value - a.value)) * (b.weight - a.weight);
    return scale.statHash === MAGAZINE ? Math.round(weight) : bankersRound(weight);
}

/** Valeur affichée → investissement. Approché là où la courbe est plate. */
export function invert(display: number, scale: StatScale): number {
    const points = scale.displayInterpolation;
    if (points.length === 0) return display;
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        const low = Math.min(a.weight, b.weight);
        const high = Math.max(a.weight, b.weight);
        if (display < low || display > high) continue;
        if (a.weight === b.weight) return a.value;
        return a.value + ((display - a.weight) / (b.weight - a.weight)) * (b.value - a.value);
    }
    // Hors courbe : l'extrémité la plus proche.
    const first = points[0];
    const last = points[points.length - 1];
    return Math.abs(display - first.weight) <= Math.abs(display - last.weight)
        ? first.value
        : last.value;
}

// —— Décomposition ————————————————————————————————————————————

interface Sums {
    /** Investissement des plugs non-base déjà compté par l'API */
    counted: number;
    bonus: number;
    malus: number;
    masterwork: number;
}

function sumPlugs(
    plugs: readonly (InventoryItemDefinition | undefined)[],
    input: BreakdownInput,
): Map<number, Sums> {
    const sums = new Map<number, Sums>();
    for (const def of plugs) {
        if (!def) continue;
        const role = plugRole(def, input);
        if (role === "base") continue;
        const masterwork = role === "masterwork";
        for (const stat of activePlugStats(def, input)) {
            let entry = sums.get(stat.statHash);
            if (!entry) {
                entry = {counted: 0, bonus: 0, malus: 0, masterwork: 0};
                sums.set(stat.statHash, entry);
            }
            entry.counted += stat.value - stat.missing;
            if (masterwork) entry.masterwork += stat.value;
            else if (stat.value > 0) entry.bonus += stat.value;
            else entry.malus -= stat.value;
        }
    }
    return sums;
}

/**
 * Décompose chaque statistique, en appliquant les plugs montrés.
 *
 * La base se déduit des totaux de l'API moins l'apport des plugs qu'ils
 * décrivent ; les plugs montrés s'appliquent ensuite à cette base. Le total
 * part de celui de l'API **plus l'écart** : sans changement, c'est exactement
 * lui, quoi que vaille l'arrondi des courbes.
 */
export function breakdownStats(input: BreakdownInput): Record<number, StatBreakdown> {
    const counted = sumPlugs(input.statPlugs, input);
    const shown = sumPlugs(input.shownPlugs, input);
    const result: Record<number, StatBreakdown> = {};

    for (const statHash of input.statHashes) {
        const apiTotal = input.totals[statHash];
        if (apiTotal === undefined) continue;

        const scale = input.scales?.[statHash];
        const maximum = input.maximum(statHash);
        const display = (investment: number) =>
            Math.max(
                0,
                scale ? interpolate(investment, scale) : Math.min(investment, maximum),
            );

        const investment = scale ? invert(apiTotal, scale) : apiTotal;
        const base = investment - (counted.get(statHash)?.counted ?? 0);
        const s = shown.get(statHash) ?? {counted: 0, bonus: 0, malus: 0, masterwork: 0};

        // Ordre du jeu : attributs, pièce maîtresse, puis ce qui est retiré —
        // un plafond atteint rogne donc d'abord la pièce maîtresse.
        const v1 = display(base);
        const v2 = display(base + s.bonus);
        const v3 = display(base + s.bonus + s.masterwork);
        const v4 = display(base + s.bonus + s.masterwork - s.malus);

        const total = Math.max(0, apiTotal + v4 - display(investment));
        const bonus = v2 - v1;
        const masterwork = v3 - v2;
        const malus = v3 - v4;
        const points = scale?.displayInterpolation ?? [];
        const lowerIsBetter =
            points.length > 1 && points[0].weight > points[points.length - 1].weight;
        result[statHash] = {
            ...(lowerIsBetter ? {lowerIsBetter} : {}),
            // Recalée sur le total : l'arrondi des courbes pourrait sinon
            // décaler la somme d'un point.
            base: Math.max(0, total - bonus - masterwork + malus),
            bonus,
            malus,
            masterwork,
            total,
        };
    }
    return result;
}

/**
 * Largeurs des segments d'une barre, en points. La partie pleine vaut toujours
 * le total.
 *
 * - Total au moins égal à la base : pas de rouge. Le blanc vaut la base, et le
 *   malus se prend sur le bleu, puis sur le jaune.
 * - Total sous la base : le bleu et le jaune gardent leur largeur, le blanc
 *   s'arrête où il faut pour que la partie pleine tombe sur le total, et le
 *   rouge va du total jusqu'à la base — jamais au-delà. Si le bleu et le jaune
 *   dépassent à eux seuls le total, ils sont rognés à leur tour, bleu d'abord.
 */
export function barSegments(b: StatBreakdown): {
    base: number;
    bonus: number;
    masterwork: number;
    malus: number;
} {
    if (b.total >= b.base) {
        let deficit = b.malus;
        const take = (part: number) => {
            const cut = Math.min(part, deficit);
            deficit -= cut;
            return part - cut;
        };
        const bonus = take(b.bonus);
        const masterwork = take(b.masterwork);
        return {base: b.base, bonus, masterwork, malus: 0};
    }

    const total = Math.max(0, b.total);
    let overflow = Math.max(0, b.bonus + b.masterwork - total);
    const take = (part: number) => {
        const cut = Math.min(part, overflow);
        overflow -= cut;
        return part - cut;
    };
    const bonus = take(b.bonus);
    const masterwork = take(b.masterwork);
    return {
        base: total - bonus - masterwork,
        bonus,
        masterwork,
        malus: b.base - total,
    };
}

/**
 * Décomposition des statistiques d'un personnage : la somme de celles de ses
 * pièces d'armure, recalée sur le total qui fait foi.
 *
 * Ce que les pièces n'expliquent pas — fragments de la doctrine, artéfact,
 * plafond du personnage — est l'écart entre `totals` et la somme de leurs
 * totaux. Il n'est pas réattribué fragment par fragment : l'API ne le
 * détaille pas, et le reconstruire raterait les bonus conditionnels. Positif,
 * il rejoint le bleu ; négatif, le rouge. La base et la pièce maîtresse, elles,
 * sont exactement celles des pièces.
 */
export function sumBreakdowns(
    pieces: readonly Readonly<Record<number, StatBreakdown>>[],
    totals: Readonly<Record<number, number>>,
    statHashes: readonly number[],
): Record<number, StatBreakdown> {
    const result: Record<number, StatBreakdown> = {};
    for (const statHash of statHashes) {
        const total = totals[statHash];
        if (total === undefined) continue;

        const sum = {base: 0, bonus: 0, malus: 0, masterwork: 0, total: 0};
        for (const piece of pieces) {
            const b = piece[statHash];
            if (!b) continue;
            sum.base += b.base;
            sum.bonus += b.bonus;
            sum.malus += b.malus;
            sum.masterwork += b.masterwork;
            sum.total += b.total;
        }
        const rest = total - sum.total;
        result[statHash] = {
            base: sum.base,
            bonus: sum.bonus + Math.max(0, rest),
            malus: sum.malus + Math.max(0, -rest),
            masterwork: sum.masterwork,
            // Un total négatif s'affiche 0, comme dans le résumé.
            total: Math.max(0, total),
        };
    }
    return result;
}
