// Version du "schéma" de tables téléchargées. À incrémenter dès qu'on ajoute
// ou retire une table ci-dessous : force le re-téléchargement chez les clients
// qui ont déjà un cache (sinon la nouvelle table manquerait).
export const MANIFEST_SCHEMA_VERSION = "9";

// Tables du manifeste à télécharger.
// On ne prend QUE ce dont l'app a besoin : DestinyInventoryItemDefinition est
// la plus grosse (~plusieurs Mo), les autres sont petites.
export const MANIFEST_TABLES = [
    "DestinyInventoryItemDefinition", // armes, armures, mods, perks, artéfacts…
    "DestinyStatDefinition", // statistiques (impact, portée, mobilité…)
    "DestinyDamageTypeDefinition", // types de dégâts (solaire, arc…)
    "DestinyInventoryBucketDefinition", // emplacements (cinétique, casque…)
    "DestinyClassDefinition", // classes (Titan, Chasseur, Arcaniste)
    "DestinySandboxPerkDefinition", // perks / descriptions
    "DestinySocketCategoryDefinition", // regroupement des sockets (perks, mods…)
    "DestinyPlugSetDefinition", // pools de perks possibles (rolls aléatoires)
    "DestinyInventoryItemConstantsDefinition", // overlays : palier, façonné, amélioré
    // Icônes détourées (PNG transparent) + fonds, indexées par hash d'objet.
    // ~8,5 Mo, mais c'est la seule source des icônes sans fond de rareté incrusté.
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