"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {
    LOADOUT_CONSTANTS_HASH,
    type LoadoutColorDefinition,
    type LoadoutConstantsDefinition,
    type LoadoutIconDefinition,
    type LoadoutNameDefinition,
} from "@/lib/destiny/types";

// Identifiants d'un emplacement d'équipement : le fond coloré, le glyphe et le
// nom.
//
// Ces trois tables sont les seules du manifeste utilisées par l'application à ne
// PAS avoir de `displayProperties` — l'image vit dans `colorImagePath` /
// `iconImagePath`, le libellé dans `name`. Et elles sont indexées par hash :
// l'ordre dans lequel le jeu les propose ne vient que des listes de
// `DestinyLoadoutConstantsDefinition`.

export interface LoadoutIdentifiers {
    colors: Map<number, string>;
    icons: Map<number, string>;
    names: Map<number, string>;
}

const NO_IDENTIFIERS: LoadoutIdentifiers = {
    colors: new Map(),
    icons: new Map(),
    names: new Map(),
};

/** Lit une table d'identifiants pour une liste de hashes, en une requête. */
async function readIdentifiers<T>(
    table: string,
    hashes: readonly number[],
    pick: (def: T) => string | undefined,
): Promise<Map<number, string>> {
    const unique = [...new Set(hashes.filter(Boolean))];
    const values = new Map<number, string>();
    if (unique.length === 0) return values;

    const rows = await manifestDb.definitions.bulkGet(
        unique.map((hash) => [table, hash] as [string, number]),
    );
    rows.forEach((row, i) => {
        const value = row ? pick(row.data as T) : undefined;
        if (value) values.set(unique[i], value);
    });
    return values;
}

/**
 * Fonds, glyphes et noms des emplacements affichés, en trois lectures groupées.
 *
 * Une lecture par vignette en ferait soixante pour vingt emplacements.
 */
export function useLoadoutIdentifiers(
    loadouts: readonly DestinyLoadout[],
): LoadoutIdentifiers {
    return (
        useLiveQuery(
            async () => {
                if (loadouts.length === 0) return NO_IDENTIFIERS;

                const [colors, icons, names] = await Promise.all([
                    readIdentifiers<LoadoutColorDefinition>(
                        "DestinyLoadoutColorDefinition",
                        loadouts.map((l) => l.colorHash),
                        (def) => def.colorImagePath,
                    ),
                    readIdentifiers<LoadoutIconDefinition>(
                        "DestinyLoadoutIconDefinition",
                        loadouts.map((l) => l.iconHash),
                        (def) => def.iconImagePath,
                    ),
                    readIdentifiers<LoadoutNameDefinition>(
                        "DestinyLoadoutNameDefinition",
                        loadouts.map((l) => l.nameHash),
                        (def) => def.name,
                    ),
                ]);

                return {colors, icons, names};
            },
            [
                loadouts
                    .map((l) => `${l.colorHash}/${l.iconHash}/${l.nameHash}`)
                    .join(","),
            ],
            NO_IDENTIFIERS,
        ) ?? NO_IDENTIFIERS
    );
}

/** Un choix proposé : son hash, et l'image ou le libellé qui le représente. */
export interface IdentifierChoice {
    hash: number;
    value: string;
}

export interface IdentifierChoices {
    colors: IdentifierChoice[];
    icons: IdentifierChoice[];
    names: IdentifierChoice[];
}

const NO_CHOICES: IdentifierChoices = {colors: [], icons: [], names: []};

/**
 * Tout ce que le jeu propose, dans SON ordre.
 *
 * Une vingtaine d'entrées par table : la liste entière tient en une lecture, et
 * l'ordre vient des constantes plutôt que d'un tri de hashes — qui n'aurait
 * aucun sens.
 */
export function useLoadoutIdentifierChoices(): IdentifierChoices {
    return (
        useLiveQuery(
            async () => {
                const row = await manifestDb.definitions.get([
                    "DestinyLoadoutConstantsDefinition",
                    LOADOUT_CONSTANTS_HASH,
                ]);
                const constants = row?.data as LoadoutConstantsDefinition | undefined;
                if (!constants) return NO_CHOICES;

                const build = (
                    hashes: readonly number[],
                    values: Map<number, string>,
                ): IdentifierChoice[] =>
                    hashes.flatMap((hash) => {
                        const value = values.get(hash);
                        return value ? [{hash, value}] : [];
                    });

                const [colors, icons, names] = await Promise.all([
                    readIdentifiers<LoadoutColorDefinition>(
                        "DestinyLoadoutColorDefinition",
                        constants.loadoutColorHashes,
                        (def) => def.colorImagePath,
                    ),
                    readIdentifiers<LoadoutIconDefinition>(
                        "DestinyLoadoutIconDefinition",
                        constants.loadoutIconHashes,
                        (def) => def.iconImagePath,
                    ),
                    readIdentifiers<LoadoutNameDefinition>(
                        "DestinyLoadoutNameDefinition",
                        constants.loadoutNameHashes,
                        (def) => def.name,
                    ),
                ]);

                return {
                    colors: build(constants.loadoutColorHashes, colors),
                    icons: build(constants.loadoutIconHashes, icons),
                    names: build(constants.loadoutNameHashes, names),
                };
            },
            [],
            NO_CHOICES,
        ) ?? NO_CHOICES
    );
}
