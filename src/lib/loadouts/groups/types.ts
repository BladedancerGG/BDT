// Contrat des groupes d'équipements : stockage local, base de données et
// /api/loadout-groups partagent cette forme.
//
// Pas de directive "use client" : la route de l'API valide avec ces fonctions,
// et une constante exportée depuis un module client arrive `undefined` côté
// serveur (voir lib/settings/constants.ts).

import type {DestinyLoadout} from "@/lib/bungie/profile";
import {INVALID_HASH} from "../loadout";

/** Clé du stockage local portant les groupes. */
export const GROUPS_STORAGE_KEY = "bdt-groups";

/**
 * Un emplacement d'un groupe.
 *
 * Structurellement identique à un emplacement du jeu, et ce n'est pas une
 * coïncidence : tout ce qui sait déjà lire un `DestinyLoadout` sert alors les
 * groupes sans une ligne de plus — `isEmptyLoadout`, `useLoadoutIdentifiers`
 * pour la vignette, `useLoadoutItems` pour le contenu. Créer un type parallèle
 * aurait imposé une conversion à chaque frontière.
 */
export type GroupLoadout = DestinyLoadout;

export interface LoadoutGroup {
    id: string;
    name: string;
    /**
     * Les groupes ne sont pas partagés entre les personnages : un instantané
     * désigne des objets par instance, et les armures d'un Titan ne s'équipent
     * pas sur un Chasseur.
     */
    characterId: string;
    /**
     * Couleur de la bordure de la carte, pour la reconnaître d'un coup d'œil.
     * Absente : la carte garde la bordure ordinaire.
     */
    color?: string;
    /** Un par emplacement du personnage, dans l'ordre du jeu */
    loadouts: GroupLoadout[];
    /** Millisecondes epoch */
    createdAt: number;
    updatedAt: number;
}

/** Longueur maximale d'un nom de groupe. */
export const GROUP_NAME_MAX = 40;

/**
 * Une couleur de carte, telle que `<input type="color">` la rend.
 *
 * La vérifier plutôt que d'accepter n'importe quelle chaîne n'est pas un excès
 * de zèle : la valeur part telle quelle dans une variable CSS, et le contrat de
 * l'API vaut pour tout ce que le client relira — y compris ce qu'un autre
 * appareil, ou une version future, aura déposé.
 *
 * La casse est tolérée bien que la spec HTML garantisse du minuscule : ne rien
 * y gagner d'un côté, éviter un rejet inexplicable de l'autre.
 */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isGroupColor(raw: unknown): raw is string {
    return typeof raw === "string" && HEX_COLOR.test(raw);
}

/**
 * Un emplacement de groupe laissé vide.
 *
 * Il porte la sentinelle `INVALID_HASH` sur ses trois identifiants, exactement
 * comme un emplacement jamais enregistré du jeu : `isEmptyLoadout` le reconnaît
 * alors sans traitement particulier. Zéro n'aurait pas convenu — voir
 * `INVALID_HASH`.
 */
export function emptyGroupLoadout(): GroupLoadout {
    return {
        colorHash: INVALID_HASH,
        iconHash: INVALID_HASH,
        nameHash: INVALID_HASH,
        items: [],
    };
}

/**
 * Recopie les emplacements d'un personnage pour en faire ceux d'un groupe.
 *
 * La copie est **profonde** sur les listes : les objets du profil sont
 * remplacés à chaque relecture, et un groupe qui les partagerait verrait son
 * instantané changer sous lui.
 */
export function copyGroupLoadouts(
    loadouts: readonly DestinyLoadout[],
): GroupLoadout[] {
    return loadouts.map((loadout) => ({
        colorHash: loadout.colorHash,
        iconHash: loadout.iconHash,
        nameHash: loadout.nameHash,
        items: loadout.items.map((item) => ({
            itemInstanceId: item.itemInstanceId,
            plugItemHashes: [...(item.plugItemHashes ?? [])],
        })),
    }));
}

/** `count` emplacements vides — ce que crée « groupe vide ». */
export function blankGroupLoadouts(count: number): GroupLoadout[] {
    return Array.from({length: count}, emptyGroupLoadout);
}

// —— Validation du corps reçu par l'API ————————————————————————
//
// Contrairement aux préférences, la forme n'est pas seulement plafonnée : elle
// est vérifiée entrée par entrée. Un groupe illisible ne se dégrade pas en
// valeur par défaut comme un réglage inconnu — il s'équipe, et il vaut mieux le
// refuser au dépôt que découvrir à l'équipement qu'un `itemInstanceId` n'est pas
// une chaîne.

function isHash(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isGroupLoadout(value: unknown): value is GroupLoadout {
    if (typeof value !== "object" || value === null) return false;
    const loadout = value as Record<string, unknown>;
    return (
        isHash(loadout.colorHash) &&
        isHash(loadout.iconHash) &&
        isHash(loadout.nameHash) &&
        Array.isArray(loadout.items) &&
        loadout.items.every((item: unknown) => {
            if (typeof item !== "object" || item === null) return false;
            const entry = item as Record<string, unknown>;
            return (
                typeof entry.itemInstanceId === "string" &&
                Array.isArray(entry.plugItemHashes) &&
                entry.plugItemHashes.every(isHash)
            );
        })
    );
}

export function isLoadoutGroup(value: unknown): value is LoadoutGroup {
    if (typeof value !== "object" || value === null) return false;
    const group = value as Record<string, unknown>;
    return (
        typeof group.id === "string" &&
        group.id.length > 0 &&
        typeof group.name === "string" &&
        typeof group.characterId === "string" &&
        group.characterId.length > 0 &&
        typeof group.createdAt === "number" &&
        typeof group.updatedAt === "number" &&
        // Une couleur mal formée est refusée plutôt qu'ignorée : elle finirait
        // dans une variable CSS, où une valeur arbitraire n'a rien à faire.
        (group.color === undefined || isGroupColor(group.color)) &&
        Array.isArray(group.loadouts) &&
        group.loadouts.every(isGroupLoadout)
    );
}

export function isLoadoutGroupArray(value: unknown): value is LoadoutGroup[] {
    return Array.isArray(value) && value.every(isLoadoutGroup);
}
