"use client";

import {useMemo} from "react";
import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {moveGroup} from "./edit";
import {saveRescue} from "./rescue";
import {
    GROUPS_STORAGE_KEY,
    isLoadoutGroup,
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
    /**
     * Nombre de gestes de l'utilisateur depuis le chargement.
     *
     * Ce n'est pas une statistique : c'est ce qui permet à la synchronisation de
     * distinguer une liste vidée **par quelqu'un** d'une liste vidée par un
     * accident — réhydratation qui échoue, relecture malheureuse. Sans ce
     * repère, l'abonnement montant déposait le vide en base et la perte devenait
     * définitive. Hors de `partialize` : il n'a de sens que dans la session.
     */
    edits: number;

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
     * Réinsère des groupes récupérés dans le filet (`rescue.ts`).
     *
     * Ils s'**ajoutent** : le filet peut dater, et rien ne justifie de perdre ce
     * qui a été fait depuis pour récupérer ce qui a été perdu avant. Un
     * identifiant déjà présent est donc laissé de côté, la version en place
     * étant la plus récente.
     */
    restoreGroups: (groups: readonly LoadoutGroup[]) => void;
    /**
     * Remplace la liste entière — ce que déposent la fusion avec la sauvegarde
     * du compte (`mergeGroups`) et l'import d'un fichier.
     *
     * Le seul chemin par lequel un groupe disparaît sans que personne ne l'ait
     * demandé : ce qu'il fait tomber part donc dans le filet (`rescue.ts`), et
     * le compteur `edits` ne bouge pas — la synchronisation sait ainsi que le
     * résultat ne vient pas d'une main.
     */
    replaceAll: (groups: LoadoutGroup[]) => void;
}

/**
 * Applique un geste de l'utilisateur : nouvelle liste, compteur incrémenté,
 * filet mis à jour.
 *
 * Toutes les actions passent par là, `replaceAll` excepté — et c'est toute la
 * distinction dont dépendent le filet (`rescue.ts`) et la garde de la
 * synchronisation : ce qui vient d'une main, et ce qui vient d'ailleurs.
 */
function edit(
    set: (fn: (state: LoadoutGroupsState) => Partial<LoadoutGroupsState>) => void,
    next: (groups: LoadoutGroup[]) => LoadoutGroup[],
): void {
    set((state) => {
        const groups = next(state.groups);
        saveRescue(groups);
        return {groups, edits: state.edits + 1};
    });
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
            edits: 0,

            createGroup: ({characterId, name, color, loadouts}) => {
                const now = Date.now();
                // `randomUUID` est disponible sans condition ici : Bungie refuse
                // les redirections en HTTP, l'application n'est donc jamais
                // servie hors contexte sécurisé (voir le Caddyfile).
                const id = crypto.randomUUID();
                edit(set, (groups) => [
                    ...groups,
                    {
                        id,
                        name: cleanName(name, id.slice(0, 8)),
                        characterId,
                        color,
                        loadouts,
                        createdAt: now,
                        updatedAt: now,
                    },
                ]);
                return id;
            },

            renameGroup: (id, name) =>
                edit(set, (groups) =>
                    groups.map((group) =>
                        group.id === id
                            ? {
                                ...group,
                                name: cleanName(name, group.name),
                                updatedAt: Date.now(),
                            }
                            : group,
                    ),
                ),

            setGroupColor: (id, color) =>
                edit(set, (groups) =>
                    groups.map((group) =>
                        group.id === id
                            ? {...group, color, updatedAt: Date.now()}
                            : group,
                    ),
                ),

            deleteGroup: (id) =>
                edit(set, (groups) => groups.filter((group) => group.id !== id)),

            setGroupLoadouts: (id, loadouts) =>
                edit(set, (groups) =>
                    groups.map((group) =>
                        group.id === id
                            ? {...group, loadouts, updatedAt: Date.now()}
                            : group,
                    ),
                ),

            moveGroup: (characterId, from, to) =>
                edit(set, (groups) => moveGroup(groups, characterId, from, to)),

            restoreGroups: (restored) =>
                edit(set, (groups) => {
                    const known = new Set(groups.map((group) => group.id));
                    return [
                        ...groups,
                        ...restored.filter((group) => !known.has(group.id)),
                    ];
                }),

            replaceAll: (groups) =>
                set((state) => {
                    // Ce que le remplacement fait disparaître est mis de côté
                    // avant de l'être : une relecture du compte et un import
                    // passent par ici, et l'un comme l'autre peuvent rendre une
                    // liste amputée sans que personne ne l'ait voulu.
                    const next = new Set(groups.map((group) => group.id));
                    if (state.groups.some((group) => !next.has(group.id))) {
                        saveRescue(state.groups);
                    }
                    return {groups};
                }),
        }),
        {
            name: GROUPS_STORAGE_KEY,
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({groups: state.groups}),
            // Une version inconnue ne doit pas emporter la liste. Sans fonction
            // de migration, zustand journalise une erreur et rend `undefined` —
            // la liste repartait vide dans l'interface, puis le premier
            // changement l'écrivait par-dessus le stockage. Ici, on garde ce
            // qu'on sait lire : le tri des entrées est fait juste après, par
            // `merge`, et il ne dépend pas du numéro de version.
            migrate: (persisted) => persisted as {groups?: unknown},
            // Une entrée corrompue — écriture interrompue, format d'une version
            // à venir — ne doit pas repartir dans l'interface puis en base.
            // Mais elle ne doit pas non plus emporter ses voisines : le tri se
            // fait **entrée par entrée**, et non sur la liste entière comme
            // avant, où un seul groupe illisible faisait tout disparaître.
            merge: (persisted, current) => {
                const groups = (persisted as {groups?: unknown} | undefined)?.groups;
                if (isLoadoutGroupArray(groups)) return {...current, groups};

                const salvaged = Array.isArray(groups)
                    ? groups.filter(isLoadoutGroup)
                    : [];
                if (Array.isArray(groups) && salvaged.length < groups.length) {
                    // Le seul cas où la console vaut mieux que le silence :
                    // l'utilisateur va voir des groupes manquer et n'aura
                    // sinon aucune trace de la raison.
                    console.error(
                        `[groupes] ${groups.length - salvaged.length} entrée(s) illisible(s) écartée(s) à la relecture`,
                    );
                }
                // Une liste partiellement récupérée est déposée dans le filet
                // avant d'être servie : le stockage, lui, va être réécrit.
                if (salvaged.length > 0) saveRescue(salvaged);
                return {...current, groups: salvaged};
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
