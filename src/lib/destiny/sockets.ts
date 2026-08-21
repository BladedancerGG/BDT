// Helpers génériques sur les sockets, indépendants de leur usage.

import type {InventoryItemDefinition} from "./types";
import {TIER} from "./display";

/**
 * Catégories de sockets des artéfacts. Elles n'ont **aucun nom** dans le
 * manifeste : l'UI fournit donc son propre libellé.
 */
export const ARTIFACT_SOCKET_CATEGORIES: readonly number[] = [
    2631166533, 2631166534, 2631166535,
];

/**
 * Catégorie du seul socket de « Réinitialisation d'artéfact ».
 *
 * L'API expose la remise à zéro comme un plug ordinaire
 * (`plugCategoryIdentifier: "artifact_reset"`), logé dans un socket à lui, dans
 * sa propre catégorie. C'est ce qui permet de l'afficher sur sa propre ligne
 * plutôt qu'au milieu des attributs.
 */
export const ARTIFACT_RESET_CATEGORY = 3072446841;

/**
 * Sockets d'un objet après l'insertion d'un plug, pour corriger le cache local
 * sans attendre le rechargement du profil.
 *
 * Le cas ordinaire tient en une affectation. La **réinitialisation d'un
 * artéfact** n'en est pas un : une seule requête y vide *tous* les emplacements
 * d'attributs, et le socket de réinitialisation lui-même ne garde rien. Sans ce
 * traitement, l'infobulle continuerait d'afficher les attributs jusqu'au
 * rechargement.
 */
export function socketsAfterInsert(
    def: InventoryItemDefinition | undefined,
    sockets: readonly number[],
    socketIndex: number,
    plugItemHash: number,
): number[] {
    const next = [...sockets];
    const categories = def?.sockets?.socketCategories ?? [];

    const isReset = categories.some(
        (category) =>
            category.socketCategoryHash === ARTIFACT_RESET_CATEGORY &&
            category.socketIndexes.includes(socketIndex),
    );

    if (!isReset) {
        next[socketIndex] = plugItemHash;
        return next;
    }

    // Chaque emplacement revient à son plug d'origine — « Mod d'artéfact vide »
    for (const category of categories) {
        if (
            !ARTIFACT_SOCKET_CATEGORIES.includes(category.socketCategoryHash) &&
            category.socketCategoryHash !== ARTIFACT_RESET_CATEGORY
        ) {
            continue;
        }
        for (const index of category.socketIndexes) {
            const initial = def?.sockets?.socketEntries?.[index]?.singleInitialItemHash;
            if (initial) next[index] = initial;
        }
    }
    return next;
}

/**
 * Masque `SocketPlugSources` : d'où proviennent les plugs équipables.
 *
 * C'est la définition du socket qui le dit, et il ne faut pas en décider
 * autrement : un socket de mod d'armure vaut 13 (inventaire + plug sets), un
 * socket d'attribut d'arme 0 ou 2 (l'instance, et elle seule). Lire les plug
 * sets du compte pour un attribut d'arme afficherait le pool du manifeste à la
 * place du tirage réel de l'arme.
 */
export const PLUG_SOURCE = {
    /** Objets de l'inventaire du joueur (revêtements, ornements « à la carte ») */
    Inventory: 1,
    /** `reusablePlugs` de l'instance — composant 310 */
    Reusable: 2,
    /** `profilePlugSets` : débloqués au niveau du compte */
    ProfilePlugSet: 4,
    /** `characterPlugSets` : débloqués sur un personnage */
    CharacterPlugSet: 8,
} as const;

/**
 * Un plug a-t-il réellement été inséré dans ce socket ?
 *
 * Faux quand le plug équipé est encore le plug initial du socket : c'est le
 * placeholder par défaut (« Mod d'artéfact vide », « Ornement d'origine »…),
 * qu'il ne faut pas présenter comme un choix du joueur.
 */
export function isPlugApplied(
    def: InventoryItemDefinition | undefined,
    socketIndex: number,
    equippedPlugHash: number,
): boolean {
    const initial =
        def?.sockets?.socketEntries?.[socketIndex]?.singleInitialItemHash;
    return equippedPlugHash !== initial;
}

/**
 * Ce plug est-il un compte-frags (« kill tracker ») ?
 *
 * Le compte lui-même est déjà repris dans le résumé de l'arme : son icône dans
 * la rangée de mods n'ajoute rien. Les deux familles concernées se distinguent
 * par leur segment `trackers` (`v300.plugs.weapons.masterworks.trackers` pour
 * les compteurs classiques, `crafting.plugs.weapons.mods.trackers` pour les
 * armes façonnées), y compris l'emplacement vide.
 */
export function isTrackerPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    return Boolean(category?.split(".").includes("trackers"));
}

/**
 * Ce plug occupe-t-il un emplacement que l'application ne sait pas changer ?
 *
 * Deux familles, logées comme les autres dans la catégorie des mods :
 *
 *  - **la pièce maîtresse** (`masterworks`), sur les armes comme sur les
 *    armures — la changer coûte des matériaux ;
 *  - **le mémento** d'une arme façonnée (`mementos`, et
 *    `crafting.recipes.empty_socket` quand l'emplacement est libre) — il faut
 *    posséder l'objet correspondant, qui est consommé.
 *
 * Dans les deux cas `InsertSocketPlugFree` — la seule insertion accessible à
 * une application ordinaire — refuse par construction ce qui n'est pas gratuit.
 * L'icône reste affichée, mais ouvrir son sélecteur ne mènerait qu'à un refus.
 *
 * Les familles relevées dans le manifeste :
 * `v400.plugs.weapons.masterworks.stat.range`,
 * `v460.plugs.armor.masterworks.stat.resistance_2`, `mementos`. Les
 * compte-frags partagent le segment `masterworks` mais sont de toute façon
 * déjà écartés des rangées.
 */
export function isFixedPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    if (!category) return false;
    if (category === EMPTY_MEMENTO_CATEGORY) return true;
    const segments = category.split(".");
    return segments.includes("masterworks") || segments.includes("mementos");
}

/** Emplacement de mémento libre — voir `isFixedPlug`. */
const EMPTY_MEMENTO_CATEGORY = "crafting.recipes.empty_socket";

/**
 * Pièce maîtresse ou catalyseur — l'emplacement que le mode « équipements » ne
 * montre pas.
 *
 * Le test ne peut pas être celui d'`isFixedPlug` : les familles de pièces
 * maîtresses **ne sont pas** toutes découpées par des points. Relevé sur les
 * 40 000 plugs du manifeste, on trouve `v400.plugs.weapons.masterworks.stat.range`
 * mais aussi `v300_new_auto_rifle0_masterwork` (tirets bas), `v400.new.bow0.masterwork`
 * et `v620.exotic.weapon.masterwork` (singulier), ou encore `generic_exotic_masterwork`.
 * Un `split(".")` en rate la grande majorité — d'où la coupe sur les deux
 * séparateurs, et le singulier accepté.
 *
 * Les catalyseurs d'exotiques, eux, tiennent dans une seule famille
 * (`catalysts`, 40 entrées) ; `v400.empty.exotic.masterwork` est leur
 * emplacement vide.
 */
const MASTERWORK_PLUG_CATEGORY =
    /(?:^|[._])(?:masterworks?|catalysts?)(?:[._]|$)/;

export function isMasterworkPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    return category ? MASTERWORK_PLUG_CATEGORY.test(category) : false;
}

/**
 * Emplacements d'arme que le jeu gère ailleurs que dans la liste des mods, et
 * qui n'ont donc rien à faire dans l'infobulle.
 *
 * Ils n'apparaissent que sur les armes **façonnées** et **améliorées**, et
 * aucun ne se change à la main :
 *
 *  - `…transfusers.level` : le « Boost de niveau d'arme », dont l'effet est
 *    déjà lisible dans le niveau affiché en tête d'infobulle ;
 *  - `…enhancers` : le palier d'amélioration, façonné (`crafting.plugs…`) comme
 *    d'équipement (`weapon_tiering.plugs…`), déjà signalé par le marquage de la
 *    vignette.
 *
 * Le test porte sur le plug **d'origine** du socket, pas sur celui qui s'y
 * trouve : c'est le seul qui ne dépende pas de l'état de l'arme.
 */
export function isHiddenSocketPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    if (!category) return false;
    const segments = category.split(".");
    return segments.includes("enhancers") || segments.includes("transfusers");
}

/**
 * Ce plug est-il la version **améliorée** d'un attribut d'arme ?
 *
 * Rien ne le signale explicitement dans le manifeste : les deux versions d'un
 * même attribut partagent leurs `itemCategoryHashes`, leur `plugStyle` et leur
 * `plugCategoryIdentifier`. La seule différence indépendante de la langue est la
 * rareté — relevée sur les 628 plugs de la catégorie `frames` : 357 en Ordinaire
 * (attributs de base) contre 226 en Peu commun (« Attribut amélioré »). Les
 * autres familles améliorables suivent la même règle (canons, chargeurs,
 * particularités d'origine…).
 *
 * Deux plugs échappent à la règle côté Bungie — Déconstruction et Osmose sont en
 * Peu commun sans être des versions améliorées. Ils seront donc signalés à tort ;
 * c'est le prix de l'absence de marqueur, et le comportement de DIM également.
 */
export function isEnhancedPlug(
    def: InventoryItemDefinition | undefined,
): boolean {
    const category = def?.plug?.plugCategoryIdentifier;
    if (!category) return false;
    // Les cosmétiques ont eux aussi des variantes en Peu commun (ornements
    // « magnifiques », revêtements, interactions) sans rien d'amélioré.
    if (COSMETIC_PLUG_CATEGORY.test(category)) return false;
    return def?.inventory?.tierType === TIER.Common;
}

/** Familles de plugs purement cosmétiques — voir isEnhancedPlug. */
const COSMETIC_PLUG_CATEGORY =
    /^(?:armor_skins|v\d+_plugs_armor_skins|shader|emote|events\.)/;
