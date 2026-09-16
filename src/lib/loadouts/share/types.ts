// Contrat d'un partage : l'API, la page publique et le bouton qui l'émet
// partagent cette forme.
//
// Pas de directive "use client" : la route valide avec ces fonctions, et une
// constante exportée depuis un module client arrive `undefined` côté serveur
// (voir lib/settings/constants.ts).

import type {ItemDetail} from "@/lib/bungie/item-components";

/** Ce qu'un lien montre : un groupe entier, ou un seul de ses emplacements. */
export type ShareKind = "group" | "loadout";

/**
 * Un objet d'un instantané partagé.
 *
 * Il porte son `itemHash` et son emplacement, là où un `DestinyLoadoutItem` ne
 * donne qu'un `itemInstanceId` : le visiteur n'a pas le profil de l'auteur, et
 * une instance ne se résout qu'avec lui. C'est toute la raison d'être de ce
 * format — voir `buildShare`.
 *
 * `bucketHash` est celui de la **définition** (`inventory.bucketTypeHash`), donc
 * l'emplacement où l'objet s'équipe : celui du composant désigne le coffre pour
 * un objet rangé, et la vue l'aurait alors mis hors de sa ligne.
 */
export interface SharedItem {
    itemHash: number;
    /**
     * Conservé bien qu'il ne désigne rien chez le visiteur : c'est la clé des
     * attributs enregistrés et du détail de l'objet, que toute la vue lit ainsi
     * — `EquipmentModeView`, `ItemDefsProvider`, l'infobulle.
     */
    itemInstanceId: string;
    bucketHash: number;
    /** Masque ItemState : façonné, chef-d'œuvre, verrouillé… */
    state: number;
    versionNumber?: number;
}

/** Un emplacement partagé : ses identifiants, ses objets, leurs attributs. */
export interface SharedLoadoutSnapshot {
    colorHash: number;
    iconHash: number;
    nameHash: number;
    items: SharedItem[];
    /**
     * Attributs **enregistrés**, par itemInstanceId et par index de socket,
     * déjà résolus contre l'objet (voir `savedSockets`) : la sentinelle du
     * socket à choix unique n'a plus de sens ici, l'objet n'étant plus là pour
     * la lever.
     */
    sockets: Record<string, number[]>;
}

/**
 * Ce que la page publique reçoit, et tout ce dont elle dispose.
 *
 * Les `details` sont mis en commun et non recopiés dans chaque emplacement : un
 * groupe partage souvent la même arme entre plusieurs de ses emplacements, et
 * `ItemDetail` est la partie lourde de l'instantané.
 */
export interface SharedSnapshot {
    /**
     * Version du format. Elle ne sert pas à migrer mais à **refuser** : un lien
     * déposé par une version future serait relu de travers, et mieux vaut une
     * page absente qu'un équipement faux.
     */
    version: 1;
    kind: ShareKind;
    name: string;
    /** Le liseré de la carte du groupe, s'il en avait un */
    color?: string;
    /** Un seul élément pour un équipement partagé seul */
    loadouts: SharedLoadoutSnapshot[];
    /** Par itemInstanceId, pour tous les objets de tous les emplacements */
    details: Record<string, ItemDetail>;
}

export const SHARE_VERSION = 1;

/** Longueur maximale du nom repris dans le lien et le titre de la page. */
export const SHARE_NAME_MAX = 80;

// —— Le lien ——————————————————————————————————————————————————

/**
 * Le segment lisible d'un lien de partage.
 *
 * Purement décoratif : c'est l'identifiant qui désigne le partage, et le nom
 * peut avoir changé depuis. Les diacritiques sont décomposés puis retirés —
 * une URL les accepte, mais un nom recopié depuis un canal de discussion ne
 * survit pas toujours au voyage.
 */
export function shareSlug(name: string, kind: ShareKind): string {
    const slug = name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        // Une coupure à 60 peut laisser un tiret en fin de chaîne.
        .replace(/-+$/g, "");
    return slug || kind;
}

/** Chemin de la page d'un partage, sans préfixe de langue. */
export function sharePath(
    kind: ShareKind,
    id: string,
    name: string,
): string {
    return `/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(
        shareSlug(name, kind),
    )}`;
}

// —— Validation du corps reçu par l'API ————————————————————————
//
// Vérifiée entrée par entrée, comme les groupes : ce qui est déposé ici est
// relu par une page **publique**, sans session pour en corriger les manques, et
// une forme illisible n'y afficherait que du vide.

function isHash(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isHashArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(isHash);
}

function isSharedItem(value: unknown): value is SharedItem {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        isHash(item.itemHash) &&
        typeof item.itemInstanceId === "string" &&
        item.itemInstanceId.length > 0 &&
        isHash(item.bucketHash) &&
        typeof item.state === "number" &&
        (item.versionNumber === undefined || isHash(item.versionNumber))
    );
}

function isSharedLoadout(value: unknown): value is SharedLoadoutSnapshot {
    if (typeof value !== "object" || value === null) return false;
    const loadout = value as Record<string, unknown>;
    return (
        isHash(loadout.colorHash) &&
        isHash(loadout.iconHash) &&
        isHash(loadout.nameHash) &&
        Array.isArray(loadout.items) &&
        loadout.items.every(isSharedItem) &&
        typeof loadout.sockets === "object" &&
        loadout.sockets !== null &&
        Object.values(loadout.sockets as Record<string, unknown>).every(
            isHashArray,
        )
    );
}

/**
 * Le détail d'un objet n'est vérifié qu'à gros grain.
 *
 * Il ne décide de rien : il alimente des affichages qui savent déjà composer
 * avec l'absence — un attribut manquant laisse une ligne vide, pas un
 * équipement faux. Le vérifier champ par champ aurait surtout figé la forme
 * d'`ItemDetail`, qui suit celle de l'API.
 */
function isItemDetails(value: unknown): value is Record<string, ItemDetail> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every(
        (detail) => typeof detail === "object" && detail !== null,
    );
}

export function isShareKind(value: unknown): value is ShareKind {
    return value === "group" || value === "loadout";
}

export function isSharedSnapshot(value: unknown): value is SharedSnapshot {
    if (typeof value !== "object" || value === null) return false;
    const snapshot = value as Record<string, unknown>;
    return (
        snapshot.version === SHARE_VERSION &&
        isShareKind(snapshot.kind) &&
        typeof snapshot.name === "string" &&
        snapshot.name.length <= SHARE_NAME_MAX &&
        (snapshot.color === undefined ||
            (typeof snapshot.color === "string" &&
                /^#[0-9a-f]{6}$/i.test(snapshot.color))) &&
        Array.isArray(snapshot.loadouts) &&
        snapshot.loadouts.length > 0 &&
        // Un équipement partagé seul n'en a qu'un : le contrat le dit, et la
        // page publique s'y fie pour décider de montrer la grille ou non.
        (snapshot.kind === "group" || snapshot.loadouts.length === 1) &&
        snapshot.loadouts.every(isSharedLoadout) &&
        isItemDetails(snapshot.details)
    );
}
