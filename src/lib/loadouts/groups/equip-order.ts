// Dans quel ordre exécuter les emplacements d'un groupe.
//
// Un module **pur**, comme `equip.ts` dont il est le complément : il ne connaît
// ni React, ni le réseau, et ne rend qu'une permutation d'indices.
//
// Le problème, et pourquoi il vaut un module : écraser un emplacement enregistre
// ce qui est équipé à cet instant, donc il faut d'abord l'équiper. Deux
// emplacements consécutifs qui partagent leurs objets n'en coûtent alors qu'un
// par différence — l'exécuteur n'envoie rien pour un objet déjà en place. Suivre
// l'ordre des emplacements du personnage revient à ignorer cette parenté : on
// paie chaque fois la panoplie entière, ou presque.
//
// C'est un problème de voyageur de commerce (chemin, coûts asymétriques), avec
// un point de départ imposé — la panoplie que le personnage porte déjà. Résolu
// ici par une construction gloutonne suivie d'une recherche locale, et non
// exactement : un personnage a au plus douze emplacements, et sur des données
// aussi groupées que celles décrites plus bas la recherche locale retombe sur
// l'optimum. Le coût, lui, est **simulé exactement** (voir `orderCost`) plutôt
// qu'approché par une matrice de distances — c'est ce qui autorise le glouton à
// juger une étape dans l'état réel où elle arrive.
//
// Les groupes ressemblent rarement à un nuage uniforme : un personnage a
// plusieurs « familles » d'équipements (du JcJ, du JcE, un raid) qui partagent
// beaucoup à l'intérieur et presque rien entre elles. Rien de particulier n'est
// fait pour les détecter — le chemin le moins cher les parcourt famille par
// famille de lui-même, c'est justement ce qui les rend visibles dans le coût.

/** Ce qu'un emplacement demande, réduit à ce qui coûte des requêtes. */
export interface OrderedSlot {
    /** Instances à équiper */
    items: readonly string[];
    /**
     * Valeurs enregistrées et **signifiantes** des sockets, indexées par
     * `itemInstanceId:socketIndex`. Les valeurs qui ne demandent rien
     * (sentinelle, socket vide) n'ont pas leur place ici : elles n'ont pas de
     * requête à faire économiser. Voir `plugsToInsert`.
     */
    sockets: ReadonlyMap<string, number>;
}

/** L'état dont dépend le coût de l'étape suivante. */
export interface EquipState {
    /** Instances équipées */
    items: ReadonlySet<string>;
    /** Valeur de chaque socket connu, même clé que `OrderedSlot.sockets` */
    sockets: ReadonlyMap<string, number>;
}

/**
 * Ce que coûte un emplacement dans un état donné : une requête par différence.
 *
 * > **Les objets que l'emplacement ne mentionne pas sont tenus pour déséquipés**
 * > (voir `advance`), et c'est une approximation assumée. Un instantané du jeu
 * > couvre la panoplie entière — trois armes, cinq pièces d'armure, la doctrine
 * > — si bien qu'elle est exacte dans le cas courant. Un emplacement partiel,
 * > lui, se voit surestimé, jamais sous-estimé : au pire l'ordre choisi n'est
 * > pas le meilleur, aucune requête n'est perdue pour autant.
 */
function stepCost(state: EquipState, slot: OrderedSlot): number {
    let cost = 0;

    for (const itemInstanceId of slot.items) {
        if (!state.items.has(itemInstanceId)) cost += 1;
    }
    for (const [key, plugItemHash] of slot.sockets) {
        if (state.sockets.get(key) !== plugItemHash) cost += 1;
    }

    return cost;
}

/**
 * L'état que laisse un emplacement.
 *
 * Les sockets **s'accumulent** là où les objets se remplacent : un attribut posé
 * reste posé même une fois l'objet rangé, alors qu'une arme équipée en chasse
 * une autre de son emplacement.
 */
function advance(state: EquipState, slot: OrderedSlot): EquipState {
    const sockets = new Map(state.sockets);
    for (const [key, plugItemHash] of slot.sockets) sockets.set(key, plugItemHash);
    return {items: new Set(slot.items), sockets};
}

/** Ce que coûte un ordre complet, du premier emplacement au dernier. */
export function orderCost(
    slots: readonly OrderedSlot[],
    order: readonly number[],
    initial: EquipState,
): number {
    let state = initial;
    let total = 0;

    for (const index of order) {
        total += stepCost(state, slots[index]);
        state = advance(state, slots[index]);
    }

    return total;
}

/**
 * Le point de départ : à chaque tour, l'emplacement le moins cher dans l'état
 * atteint. À égalité, celui qui vient en premier dans le groupe — l'ordre rendu
 * ne doit pas dépendre d'un parcours de `Map`.
 */
function greedyOrder(
    slots: readonly OrderedSlot[],
    initial: EquipState,
): number[] {
    const remaining = new Set(slots.map((_, index) => index));
    const order: number[] = [];
    let state = initial;

    while (remaining.size > 0) {
        let best = -1;
        let bestCost = Number.POSITIVE_INFINITY;

        for (const index of remaining) {
            const cost = stepCost(state, slots[index]);
            if (cost < bestCost) {
                bestCost = cost;
                best = index;
            }
        }

        order.push(best);
        remaining.delete(best);
        state = advance(state, slots[best]);
    }

    return order;
}

/**
 * Nombre de passes de recherche locale.
 *
 * Une borne, pas un réglage : chaque passe ne s'exécute que si la précédente a
 * gagné quelque chose, et le coût étant un entier positif, la boucle se termine
 * d'elle-même. Elle est là pour qu'une erreur de comparaison future ne se
 * transforme pas en boucle infinie dans le navigateur.
 */
const MAX_PASSES = 64;

/**
 * Recherche locale : déplacer un emplacement, ou en échanger deux.
 *
 * Le glouton se piège sur les familles — il finit une famille par son
 * emplacement le plus cher plutôt que par celui qui ouvre la suivante. Les deux
 * voisinages suffisent à le rattraper, et l'évaluation reste une simulation
 * complète : à cette taille (douze emplacements au plus), la recopie coûte moins
 * que le soin qu'il faudrait pour l'éviter.
 */
function improve(
    slots: readonly OrderedSlot[],
    start: readonly number[],
    initial: EquipState,
): number[] {
    let best = [...start];
    let bestCost = orderCost(slots, best, initial);

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        let improved = false;

        for (let i = 0; i < best.length; i += 1) {
            for (let j = 0; j < best.length; j += 1) {
                if (i === j) continue;

                for (const candidate of [relocate(best, i, j), swap(best, i, j)]) {
                    const cost = orderCost(slots, candidate, initial);
                    if (cost < bestCost) {
                        best = candidate;
                        bestCost = cost;
                        improved = true;
                    }
                }
            }
        }

        if (!improved) break;
    }

    return best;
}

/** L'ordre où l'élément en `from` est retiré puis réinséré en `to`. */
function relocate(order: readonly number[], from: number, to: number): number[] {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/** L'ordre où les éléments en `a` et `b` sont échangés. */
function swap(order: readonly number[], a: number, b: number): number[] {
    const next = [...order];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
}

/**
 * L'ordre d'exécution le moins cher trouvé, comme permutation d'indices de
 * `slots`.
 *
 * L'état final en jeu ne dépend pas de cet ordre : chaque écrasement vise son
 * propre emplacement, et aucun ne lit les autres. Seule change la panoplie que
 * le personnage porte à la fin — celle du dernier emplacement exécuté, et non
 * plus celle du dernier de la liste.
 */
export function orderEquipSlots(
    slots: readonly OrderedSlot[],
    initial: EquipState,
): number[] {
    if (slots.length < 2) return slots.map((_, index) => index);
    return improve(slots, greedyOrder(slots, initial), initial);
}
