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
        this.version(1).stores({
            // clé primaire composite [table+hash] + index secondaire sur "table"
            definitions: "[table+hash], table",
            meta: "key",
        });
    }
}

export const manifestDb = new ManifestDatabase();
