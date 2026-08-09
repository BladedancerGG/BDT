"use client";

import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {cookieStorage} from "./cookie-storage";
import {
    ICON_SIZE,
    PREFS_COOKIE,
    clampIconSize,
    type ThemePreference,
} from "./constants";
import {
    DEFAULT_SORT_RULES,
    moveSortRule,
    parseSortRules,
    serializeSortRules,
    type SortId,
    type SortRule,
} from "@/lib/destiny/sort";
import {
    DEFAULT_ARMOR_GROUPING,
    DEFAULT_WEAPON_GROUPING,
    parseArmorGrouping,
    parseWeaponGrouping,
    type ArmorGrouping,
    type WeaponGrouping,
} from "@/lib/destiny/grouping";

export {ICON_SIZE, clampIconSize};
export type {ThemePreference};

export interface SettingsState {
    theme: ThemePreference;
    /** Taille des icônes d'inventaire et d'équipement en px, bornée à [40, 96] */
    iconSize: number;
    /** Taille des icônes du coffre et des objets perdus en px, bornée à [40, 96] */
    vaultIconSize: number;
    /** Afficher l'ornement équipé plutôt que l'icône de base */
    showOrnaments: boolean;
    /** Critères de tri du coffre, du plus important au moins important */
    sortRules: SortRule[];
    /** Sous-groupe des sections d'armes du coffre — un seul critère à la fois */
    weaponGrouping: WeaponGrouping;
    /** Sous-groupe des sections d'armures du coffre */
    armorGrouping: ArmorGrouping;

    setTheme: (theme: ThemePreference) => void;
    setIconSize: (size: number) => void;
    setVaultIconSize: (size: number) => void;
    setShowOrnaments: (show: boolean) => void;
    setWeaponGrouping: (grouping: WeaponGrouping) => void;
    setArmorGrouping: (grouping: ArmorGrouping) => void;

    /** Active ou désactive un critère, sans changer sa place */
    toggleSort: (id: SortId) => void;
    /** Inverse le sens d'un critère */
    reverseSort: (id: SortId) => void;
    /** Déplace un critère dans l'ordre d'importance (glisser-déposer) */
    moveSort: (from: number, to: number) => void;
    resetSorts: () => void;
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "system",
            iconSize: ICON_SIZE.default,
            vaultIconSize: ICON_SIZE.default,
            showOrnaments: false,
            sortRules: [...DEFAULT_SORT_RULES],
            weaponGrouping: DEFAULT_WEAPON_GROUPING,
            armorGrouping: DEFAULT_ARMOR_GROUPING,

            setTheme: (theme) => set({theme}),
            setIconSize: (size) => set({iconSize: clampIconSize(size)}),
            setVaultIconSize: (size) => set({vaultIconSize: clampIconSize(size)}),
            setShowOrnaments: (showOrnaments) => set({showOrnaments}),
            setWeaponGrouping: (weaponGrouping) => set({weaponGrouping}),
            setArmorGrouping: (armorGrouping) => set({armorGrouping}),

            toggleSort: (id) =>
                set((state) => ({
                    sortRules: state.sortRules.map((rule) =>
                        rule.id === id ? {...rule, enabled: !rule.enabled} : rule,
                    ),
                })),

            reverseSort: (id) =>
                set((state) => ({
                    sortRules: state.sortRules.map((rule) =>
                        rule.id === id ? {...rule, desc: !rule.desc} : rule,
                    ),
                })),

            moveSort: (from, to) =>
                set((state) => ({
                    sortRules: moveSortRule(state.sortRules, from, to),
                })),

            resetSorts: () => set({sortRules: [...DEFAULT_SORT_RULES]}),
        }),
        {
            name: PREFS_COOKIE,
            version: 1,
            // Cookie : le serveur peut lire ces préférences et rendre le bon thème
            storage: createJSONStorage(() => cookieStorage),
            // Ne persiste que les préférences, pas les setters.
            // Les règles de tri partent en jetons courts : un cookie est limité
            // à 4 Ko et porte déjà les autres préférences.
            partialize: (state) => ({
                theme: state.theme,
                iconSize: state.iconSize,
                vaultIconSize: state.vaultIconSize,
                showOrnaments: state.showOrnaments,
                sorts: serializeSortRules(state.sortRules),
                weaponGrouping: state.weaponGrouping,
                armorGrouping: state.armorGrouping,
            }),
            // Reconstruit les règles depuis les jetons. Un cookie écrit avant
            // l'arrivée du tri n'a pas de clé `sorts` : les valeurs par défaut
            // s'appliquent alors, sans migration ni perte des autres réglages.
            // Même tolérance pour les regroupements, relus par leur analyseur
            // plutôt que recopiés tels quels : une valeur inconnue serait sinon
            // acceptée et donnerait un coffre sans sous-groupes.
            merge: (persisted, current) => {
                const {
                    sorts,
                    weaponGrouping,
                    armorGrouping,
                    ...rest
                } = (persisted ?? {}) as Partial<SettingsState> & {
                    sorts?: unknown;
                };
                return {
                    ...current,
                    ...rest,
                    sortRules: parseSortRules(sorts) ?? current.sortRules,
                    weaponGrouping:
                        parseWeaponGrouping(weaponGrouping) ?? current.weaponGrouping,
                    armorGrouping:
                        parseArmorGrouping(armorGrouping) ?? current.armorGrouping,
                };
            },
        },
    ),
);
