"use client";

import {useMemo} from "react";
import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {moveGroup} from "./edit";
import {
    GROUPS_STORAGE_KEY,
    GROUP_NAME_MAX,
    isLoadoutGroupArray,
    type GroupLoadout,
    type LoadoutGroup,
} from "./types";

/**
 * Les groupes d'équipements, dans le stockage local.
 *
 * **localStorage et non le cookie de préférences**, contrairement à tout le
 * reste des réglages : un groupe porte un instantané complet par emplacement —
 * une vingtaine d'emplacements, dix objets chacun, un `itemInstanceId` et une
 * douzaine de hashes de plugs par objet. Quelques groupes dépassent déjà les
 * 4 Ko du cookie, qui repartirait de surcroît à chaque requête. Et le serveur
 * n'a rien à y lire au rendu : contrairement au thème, aucun groupe n'apparaît
 * dans le HTML initial.
 *
 * La synchronisation avec le compte, elle, passe par `/api/loadout-groups` —
 * voir `LoadoutGroupsSync`.
 */
export interface LoadoutGroupsState {
    groups: LoadoutGroup[];

    /** Crée un groupe et renvoie son identifiant. */
    createGroup: (input: {
        characterId: string;
        name: string;
        color?: string;
        loadouts: GroupLoadout[];
    }) => string;
    renameGroup: (id: string, name: string) => void;
    /** Change la couleur d'une carte, ou la retire (`undefined`) */
    setGroupColor: (id: string, color: string | undefined) => void;
    deleteGroup: (id: string) => void;
    /**
     * Remplace les emplacements d'un groupe.
     *
     * Une seule écriture pour toutes les modifications d'un groupe, et c'est
     * voulu : la sémantique Destiny — quel objet chasse quel autre, où va un
     * attribut, comment se comble un tableau indexé par socket — vit dans
     * `edit.ts`, module pur. Le store ne fait que ranger le résultat.
     */
    setGroupLoadouts: (id: string, loadouts: GroupLoadout[]) => void;
    /**
     * Déplace une carte dans l'ordre d'un personnage (glisser-déposer).
     *
     * Les indices sont ceux de la liste **affichée**, celle du personnage. La
     * liste stockée, elle, porte tous les personnages : ce sont donc les places
     * qu'y occupent ses groupes qui sont permutées, sans toucher aux autres.
     */
    moveGroup: (characterId: string, from: number, to: number) => void;
    /**
     * Remplace la liste entière — c'est ce que fait la relecture de la
     * sauvegarde du compte, qui prime sur le stockage local comme pour les
     * préférences.
     */
    replaceAll: (groups: LoadoutGroup[]) => void;
}

/** Nom ramené à ce qu'un affichage peut porter, jamais vide. */
function cleanName(name: string, fallback: string): string {
    const trimmed = name.trim().slice(0, GROUP_NAME_MAX);
    return trimmed.length > 0 ? trimmed : fallback;
}

export const useLoadoutGroups = create<LoadoutGroupsState>()(
    persist(
        (set) => ({
            groups: [],

            createGroup: ({characterId, name, color, loadouts}) => {
                const now = Date.now();
                // `randomUUID` est disponible sans condition ici : Bungie refuse
                // les redirections en HTTP, l'application n'est donc jamais
                // servie hors contexte sécurisé (voir le Caddyfile).
                const id = crypto.randomUUID();
                set((state) => ({
                    groups: [
                        ...state.groups,
                        {
                            id,
                            name: cleanName(name, id.slice(0, 8)),
                            characterId,
                            color,
                            loadouts,
                            createdAt: now,
                            updatedAt: now,
                        },
                    ],
                }));
                return id;
            },

            renameGroup: (id, name) =>
                set((state) => ({
                    groups: state.groups.map((group) =>
                        group.id === id
                            ? {
                                ...group,
                                name: cleanName(name, group.name),
                                updatedAt: Date.now(),
                            }
                            : group,
                    ),
                })),

            setGroupColor: (id, color) =>
                set((state) => ({
                    groups: state.groups.map((group) =>
                        group.id === id
                            ? {...group, color, updatedAt: Date.now()}
                            : group,
                    ),
                })),

            deleteGroup: (id) =>
                set((state) => ({
                    groups: state.groups.filter((group) => group.id !== id),
                })),

            setGroupLoadouts: (id, loadouts) =>
                set((state) => ({
                    groups: state.groups.map((group) =>
                        group.id === id
                            ? {...group, loadouts, updatedAt: Date.now()}
                            : group,
                    ),
                })),

            moveGroup: (characterId, from, to) =>
                set((state) => ({
                    groups: moveGroup(state.groups, characterId, from, to),
                })),

            replaceAll: (groups) => set({groups}),
        }),
        {
            name: GROUPS_STORAGE_KEY,
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({groups: state.groups}),
            // Une entrée corrompue — écriture interrompue, format d'une version
            // à venir — repartirait sinon dans l'interface puis en base. On
            // préfère perdre la relecture que propager l'illisible.
            merge: (persisted, current) => {
                const groups = (persisted as {groups?: unknown} | undefined)?.groups;
                return {
                    ...current,
                    groups: isLoadoutGroupArray(groups) ? groups : current.groups,
                };
            },
        },
    ),
);

/**
 * Les groupes d'un personnage, du plus ancien au plus récent.
 *
 * Le filtrage est dans un `useMemo` et non dans le sélecteur : `filter` rend un
 * tableau neuf à chaque passe, que la comparaison par identité de Zustand prend
 * pour un changement d'état — le composant se rendrait alors sans fin.
 */
export function useCharacterGroups(characterId: string | null): LoadoutGroup[] {
    const groups = useLoadoutGroups((s) => s.groups);
    return useMemo(
        () =>
            characterId
                ? groups.filter((group) => group.characterId === characterId)
                : [],
        [groups, characterId],
    );
}
