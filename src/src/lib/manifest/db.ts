"use client";

import Dexie, {type Table} from "dexie";

// Une définition du manifeste (une ligne = un objet, une stat, etc.)
export interface DefinitionRow {
    // Clé composite : nom de la table + hash de la définition
    table: string;
    hash: number;
    data: unknown;
}

// Stockage clé/valeur pour les métadonnées (version, langue téléchargée…)
export interface MetaRow {
    key: string;
    value: string;
}

// Le manifeste Destiny est volumineux (surtout DestinyInventoryItemDefinition) :
// on le garde en IndexedDB côté client, pas en base serveur.
class ManifestDatabase extends Dexie {
    definitions!: Table<DefinitionRow, [string, number]>;
    meta!: Table<MetaRow, string>;

    constructor() {
        super("bdt-manifest");
        // Version 2 : plus d'index secondaire sur "table". Chaque écriture le
        // maintenait, pour ~20 % du temps de chargement du manifeste ; et la
        // suppression table par table qu'il servait coûtait 6 s sur une mise à
        // jour (mesuré dans Chromium). Lire une table entière passe désormais
        // par un intervalle de la clé primaire : voir `tableRows`.
        this.version(2).stores({
            definitions: "[table+hash]",
            meta: "key",
        });
    }
}

export const manifestDb = new ManifestDatabase();

/**
 * Toutes les définitions d'une table. Réservé aux petites tables (types de
 * dégâts, classes, emplacements…) : la clé primaire commençant par le nom de
 * la table, ses lignes sont contiguës dans l'index.
 */
export function tableRows(table: string): Promise<DefinitionRow[]> {
    return manifestDb.definitions
        .where("[table+hash]")
        .between([table, Dexie.minKey], [table, Dexie.maxKey])
        .toArray();
}
