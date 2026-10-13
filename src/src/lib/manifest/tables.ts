import {MANIFEST_PROJECTION} from "./projection";

// Tables du manifeste à télécharger.
// On ne prend QUE ce dont l'app a besoin : DestinyInventoryItemDefinition est
// la plus grosse (~plusieurs Mo), les autres sont petites.
export const MANIFEST_TABLES = [
    "DestinyInventoryItemDefinition", // armes, armures, mods, perks, artéfacts…
    "DestinyStatDefinition", // statistiques (impact, portée, mobilité…)
    // Courbes investissement → valeur affichée, par type d'objet (~200 Ko)
    "DestinyStatGroupDefinition",
    "DestinyDamageTypeDefinition", // types de dégâts (solaire, arc…)
    "DestinyInventoryBucketDefinition", // emplacements (cinétique, casque…)
    "DestinyClassDefinition", // classes (Titan, Chasseur, Arcaniste)
    "DestinySandboxPerkDefinition", // perks / descriptions
    "DestinySocketCategoryDefinition", // regroupement des sockets (perks, mods…)
    "DestinyPlugSetDefinition", // pools de perks possibles (rolls aléatoires)
    "DestinyInventoryItemConstantsDefinition", // overlays : palier, façonné, amélioré
    // Icônes détourées (PNG transparent) + fonds. Indexées par leurs PROPRES
    // hashes, où `displayProperties.iconHash` renvoie — surtout pas par le hash
    // de l'objet (voir lib/destiny/icons.ts). ~8,5 Mo, mais c'est la seule
    // source des icônes sans fond de rareté incrusté.
    "DestinyIconDefinition",
    "DestinyEquipableItemSetDefinition", // bonus d'ensemble des armures (2 / 4 pièces)
    // Libellés et icônes des objectifs de plugs : compte-frags (« Ennemis
    // vaincus ») et niveau d'arme façonnée. ~7 Mo, la deuxième plus grosse.
    "DestinyObjectiveDefinition",
    // Types anti-champion (bloqueur, surchargé, implacable) : nom + icône
    "DestinyBreakerTypeDefinition",
    // Identifiants des équipements sauvegardés en jeu : fond, glyphe et nom des
    // vignettes du panneau. Trois tables minuscules (moins de 10 Ko à elles
    // trois, une vingtaine d'entrées chacune) et sans displayProperties : leur
    // image vit dans `colorImagePath` / `iconImagePath`, leur libellé dans
    // `name`.
    "DestinyLoadoutColorDefinition",
    "DestinyLoadoutIconDefinition",
    "DestinyLoadoutNameDefinition",
    // Une seule entrée (hash 1), 1,5 Ko : elle porte les listes **ordonnées**
    // des trois identifiants ci-dessus. C'est la seule source de l'ordre dans
    // lequel le jeu les propose — les tables elles-mêmes sont indexées par hash.
    "DestinyLoadoutConstantsDefinition",
] as const;

export type ManifestTable = (typeof MANIFEST_TABLES)[number];

/**
 * Version du « schéma » téléchargé : empreinte de la liste des tables et de la
 * projection (projection.ts). Elle entre dans l'URL et le chemin disque du
 * relais, et le client la compare à celle de son cache.
 *
 * Calculée, et non plus incrémentée à la main : un oubli rendait une table ou
 * un champ ajouté invisible pour toujours chez les clients ayant déjà un cache,
 * sans la moindre erreur. Seul `PROJECTION_FORMAT` reste manuel — à
 * incrémenter si la **façon** de projeter (`project`) change, pas son contenu.
 */
const PROJECTION_FORMAT = 1;

export const MANIFEST_SCHEMA_VERSION = fnv1a(
    JSON.stringify([PROJECTION_FORMAT, MANIFEST_TABLES, MANIFEST_PROJECTION]),
);

/** FNV-1a 32 bits, en base 36 : court, stable, sans dépendance. */
function fnv1a(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}
