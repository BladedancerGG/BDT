"use client";

import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {cookieStorage} from "./cookie-storage";
import {
    ICON_SIZE,
    PREFS_COOKIE,
    SEARCH_HISTORY_SIZE,
    clampIconSize,
    clampSearchHistorySize,
    DEFAULT_VIEW_MODE,
    parseSearchMissMode,
    parseViewMode,
    VIEW_MODES,
    type SearchMissMode,
    type ThemePreference,
    type ViewMode,
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

export {ICON_SIZE, SEARCH_HISTORY_SIZE, clampIconSize};
export type {SearchMissMode, ThemePreference, ViewMode};

export interface SettingsState {
    theme: ThemePreference;
    /** Taille des icônes d'inventaire et d'équipement en px, bornée à [40, 96] */
    iconSize: number;
    /** Taille des icônes du coffre et des objets perdus en px, bornée à [40, 96] */
    vaultIconSize: number;
    /** Afficher l'ornement équipé plutôt que l'icône de base */
    showOrnaments: boolean;
    /**
     * Révéler l'apparence d'origine d'une armure ornementée au survol.
     * Sans ornement affiché, le réglage n'a pas d'objet — il est alors masqué
     * dans les paramètres, mais conservé tel quel pour le retour en arrière.
     */
    showOriginalOnHover: boolean;
    /** Critères de tri du coffre, du plus important au moins important */
    sortRules: SortRule[];
    /** Sous-groupe des sections d'armes du coffre — un seul critère à la fois */
    weaponGrouping: WeaponGrouping;
    /** Sous-groupe des sections d'armures du coffre */
    armorGrouping: ArmorGrouping;
    /** Nombre de recherches passées proposées sous la barre de recherche */
    searchHistorySize: number;
    /** Sort des objets du coffre qui ne répondent pas à la recherche */
    searchMissMode: SearchMissMode;
    /**
     * Mode d'affichage de la page d'équipement. Persisté comme le reste : on
     * retrouve la vue quittée au rechargement, ce qui est le comportement
     * attendu d'un onglet.
     */
    viewMode: ViewMode;
    /**
     * Synchronisation des préférences avec le compte Bungie.
     *
     * Désactivée, rien ne change : le cookie fait foi, comme toujours. Activée,
     * l'état est aussi déposé en base et c'est *lui* qui prime au chargement —
     * le cookie n'est plus qu'un miroir local, ce qui permet de servir le bon
     * thème sans attendre.
     *
     * Le drapeau qui fait autorité est `User.syncEnabled` en base, allumé par
     * défaut : celui-ci n'en est que la copie locale, imposée au chargement par
     * `SettingsSync`. Le `false` par défaut ci-dessous ne vaut donc que hors
     * session, où il n'y a personne avec qui synchroniser.
     */
    syncEnabled: boolean;

    setTheme: (theme: ThemePreference) => void;
    setIconSize: (size: number) => void;
    setVaultIconSize: (size: number) => void;
    setShowOrnaments: (show: boolean) => void;
    setShowOriginalOnHover: (show: boolean) => void;
    setWeaponGrouping: (grouping: WeaponGrouping) => void;
    setArmorGrouping: (grouping: ArmorGrouping) => void;
    setSearchHistorySize: (size: number) => void;
    setSearchMissMode: (mode: SearchMissMode) => void;
    setViewMode: (mode: ViewMode) => void;
    setSyncEnabled: (enabled: boolean) => void;
    /** Passe au mode suivant, en cycle — c'est ce que fait la touche Tab */
    toggleViewMode: () => void;

    /** Active ou désactive un critère, sans changer sa place */
    toggleSort: (id: SortId) => void;
    /** Inverse le sens d'un critère */
    reverseSort: (id: SortId) => void;
    /** Déplace un critère dans l'ordre d'importance (glisser-déposer) */
    moveSort: (from: number, to: number) => void;
    resetSorts: () => void;
}


/**
 * Forme persistée des préférences — cookie comme base de données.
 *
 * Les règles de tri partent en jetons courts : un cookie est plafonné à 4 Ko et
 * porte déjà tout le reste. Le même format sert des deux côtés, si bien qu'une
 * sauvegarde serveur se relit exactement comme un cookie.
 */
export function persistedSettings(state: SettingsState) {
    return {
        theme: state.theme,
        iconSize: state.iconSize,
        vaultIconSize: state.vaultIconSize,
        showOrnaments: state.showOrnaments,
        showOriginalOnHover: state.showOriginalOnHover,
        sorts: serializeSortRules(state.sortRules),
        weaponGrouping: state.weaponGrouping,
        armorGrouping: state.armorGrouping,
        searchHistorySize: state.searchHistorySize,
        searchMissMode: state.searchMissMode,
        viewMode: state.viewMode,
        syncEnabled: state.syncEnabled,
    };
}

export type PersistedSettings = ReturnType<typeof persistedSettings>;

/**
 * Reconstruit un état complet depuis une forme persistée.
 *
 * Reconstruit les règles depuis les jetons. Un cookie écrit avant l'arrivée du
 * tri n'a pas de clé `sorts` : les valeurs par défaut s'appliquent alors, sans
 * migration ni perte des autres réglages. Même tolérance pour les
 * regroupements, relus par leur analyseur plutôt que recopiés tels quels : une
 * valeur inconnue serait sinon acceptée et donnerait un coffre sans
 * sous-groupes.
 */
export function mergeSettings(
    persisted: unknown,
    current: SettingsState,
): SettingsState {
    const {
        sorts,
        weaponGrouping,
        armorGrouping,
        searchHistorySize,
        searchMissMode,
        viewMode,
        syncEnabled,
        ...rest
    } = (persisted ?? {}) as Partial<SettingsState> & {sorts?: unknown};

    return {
        ...current,
        ...rest,
        sortRules: parseSortRules(sorts) ?? current.sortRules,
        weaponGrouping: parseWeaponGrouping(weaponGrouping) ?? current.weaponGrouping,
        armorGrouping: parseArmorGrouping(armorGrouping) ?? current.armorGrouping,
        searchHistorySize:
            typeof searchHistorySize === "number"
                ? clampSearchHistorySize(searchHistorySize)
                : current.searchHistorySize,
        searchMissMode: parseSearchMissMode(searchMissMode) ?? current.searchMissMode,
        viewMode: parseViewMode(viewMode) ?? current.viewMode,
        syncEnabled: syncEnabled === true,
    };
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            theme: "system",
            iconSize: ICON_SIZE.default,
            vaultIconSize: ICON_SIZE.default,
            showOrnaments: true,
            showOriginalOnHover: true,
            sortRules: [...DEFAULT_SORT_RULES],
            weaponGrouping: DEFAULT_WEAPON_GROUPING,
            armorGrouping: DEFAULT_ARMOR_GROUPING,
            searchHistorySize: SEARCH_HISTORY_SIZE.default,
            searchMissMode: "hide",
            viewMode: DEFAULT_VIEW_MODE,
            syncEnabled: true,

            setTheme: (theme) => set({theme}),
            setIconSize: (size) => set({iconSize: clampIconSize(size)}),
            setVaultIconSize: (size) => set({vaultIconSize: clampIconSize(size)}),
            setShowOrnaments: (showOrnaments) => set({showOrnaments}),
            setShowOriginalOnHover: (showOriginalOnHover) =>
                set({showOriginalOnHover}),
            setWeaponGrouping: (weaponGrouping) => set({weaponGrouping}),
            setArmorGrouping: (armorGrouping) => set({armorGrouping}),
            setSearchHistorySize: (size) =>
                set({searchHistorySize: clampSearchHistorySize(size)}),
            setSearchMissMode: (searchMissMode) => set({searchMissMode}),
            setViewMode: (viewMode) => set({viewMode}),
            setSyncEnabled: (syncEnabled) => set({syncEnabled}),
            // Un cycle et non une bascule : il y a trois modes depuis les
            // groupes d'équipements, et la touche Tab n'en a qu'un à donner.
            toggleViewMode: () =>
                set((state) => ({
                    viewMode:
                        VIEW_MODES[
                            (VIEW_MODES.indexOf(state.viewMode) + 1) % VIEW_MODES.length
                        ],
                })),

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
            partialize: persistedSettings,
            merge: (persisted, current) => mergeSettings(persisted, current),
        },
    ),
);
