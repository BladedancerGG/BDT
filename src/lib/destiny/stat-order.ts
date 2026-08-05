// Ordre d'affichage des statistiques dans les infobulles.
//
// L'API renvoie les stats dans un ordre arbitraire (clés d'objet) : sans tri
// explicite, l'affichage varie d'une arme à l'autre. On reproduit donc l'ordre
// du jeu.
//
// Les hashes ont été relevés dans DestinyStatDefinition. Deux noms existaient en
// double dans le manifeste (« Mêlée » et « Classe ») ; le bon hash a été
// déterminé en regardant lesquels apparaissent réellement sur des armures.

/** Statistiques affichées sans barre : ce sont des valeurs, pas des notes. */
export const NO_BAR_STATS: ReadonlySet<number> = new Set([
    4284893193, // Coups par minute (cadence de tir)
    447667954, // Vitesse de tir
    2961396640, // Vitesse de charge
    2715839340, // Direction du recul
    3871231066, // Chargeur (taille du chargeur)
    925767036, // Munitions (capacité, épées)
    3481294762, // Chaleur générée (fusils traceurs, glaives)
    4006394725, // Refroidissement (idem)
]);

/** Armes à distance. */
export const WEAPON_STAT_ORDER: readonly number[] = [
    4043523819, // Impact
    1240592695, // Portée
    1591432999, // Précision
    3614673599, // Rayon du souffle
    2523465841, // Vélocité
    3085395333, // Persistance
    1842278586, // Durée bouclier
    155624089, // Stabilité
    943549884, // Maniement
    4188031367, // Rechargement
    1345609583, // Aide à la visée (acquisition de cible)
    2714457168, // Efficacité aérienne
    3555269338, // Zoom
    1931675084, // Génération de munitions
    // —— sans barre ——
    4284893193, // Coups par minute
    447667954, // Vitesse de tir
    2961396640, // Vitesse de charge
    3481294762, // Chaleur générée
    4006394725, // Refroidissement
    2715839340, // Direction du recul
    3871231066, // Chargeur
];

/** Épées (itemSubType 18) : jeu de statistiques distinct. */
export const SWORD_STAT_ORDER: readonly number[] = [
    4043523819, // Impact
    2837207746, // Vitesse de coup
    3022301683, // Taux de chargement
    209426660, // Résistance de la garde
    3736848092, // Endurance de la garde
    // —— sans barre ——
    925767036, // Munitions
];

/** Armures. */
export const ARMOR_STAT_ORDER: readonly number[] = [
    392767087, // Santé
    4244567218, // Mêlée
    1735777505, // Grenade
    144602215, // Super
    1943323491, // Classe
    2996146975, // Armes
];

export interface OrderedStat {
    statHash: number;
    value: number;
    /** false pour les valeurs brutes (cadence, chargeur…) */
    withBar: boolean;
}

/**
 * Trie les statistiques d'un objet selon l'ordre donné.
 *
 * Une statistique absente de l'ordre de référence n'est pas perdue : elle est
 * ajoutée à la fin. Ce filet de sécurité couvre l'apparition d'une nouvelle
 * statistique côté Bungie, sans qu'elle disparaisse silencieusement de l'UI.
 */
export function orderStats(
    stats: Record<string, number>,
    order: readonly number[],
): OrderedStat[] {
    const remaining = new Map<number, number>(
        Object.entries(stats).map(([hash, value]) => [Number(hash), value]),
    );

    const ordered: OrderedStat[] = [];

    for (const statHash of order) {
        const value = remaining.get(statHash);
        if (value === undefined) continue; // stat absente sur cette arme
        remaining.delete(statHash);
        ordered.push({statHash, value, withBar: !NO_BAR_STATS.has(statHash)});
    }

    // Reliquat : ordre d'origine, à la suite
    for (const [statHash, value] of remaining) {
        ordered.push({statHash, value, withBar: !NO_BAR_STATS.has(statHash)});
    }

    return ordered;
}
