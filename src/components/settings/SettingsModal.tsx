"use client";

import {useState, useTransition} from "react";
import {useLocale, useTranslations} from "next-intl";
import {usePathname, useRouter} from "@/i18n/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {Modal} from "@/components/ui/Modal";
import {SettingRow, Toggle, Select} from "@/components/ui/SettingRow";
import {IconSizeControl} from "./IconSizeControl";
import {SortRuleList} from "./SortRuleList";
import {Cog6ToothIcon} from "@heroicons/react/24/solid"
import {
    persistedSettings,
    SEARCH_HISTORY_SIZE,
    useSettings,
    type SearchMissMode,
    type ThemePreference,
} from "@/lib/settings/store";
import {
    ARMOR_GROUPINGS,
    WEAPON_GROUPINGS,
    type ArmorGrouping,
    type WeaponGrouping,
} from "@/lib/destiny/grouping";
import {
    deleteAccount,
    deleteSyncedSettings,
    pushSettings,
} from "@/lib/settings/sync-client";
import {
    deleteSyncedGroups,
    pushGroups,
} from "@/lib/loadouts/groups/sync-client";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {APP_VERSION, SUPPORT_EMAIL, BUNGIE_PROFILE_URL} from "@/lib/app-info";
import {BackupRows} from "./BackupRows";
import {RecoveryRow} from "./RecoveryRow";
import {clearRescue} from "@/lib/loadouts/groups/rescue";

type Category = "account" | "appearance" | "inventory" | "search" | "about";

/**
 * Onglets, dans l'ordre, et la clé de leur libellé — donnée depuis la racine
 * des messages : « Inventaire » est le mot commun à toute l'interface, il ne
 * se redit pas dans ce groupe.
 */
const CATEGORIES: Record<Category, string> = {
    account: "settings.categories.account",
    appearance: "settings.categories.appearance",
    inventory: "common.inventory",
    search: "settings.categories.search",
    about: "settings.categories.about",
};

/** Noms des langues dans leur propre langue. */
const LOCALE_LABELS: Record<Locale, string> = {
    fr: "Français",
    en: "English",
};

const DEV_BUNGIE_PROFILE_URL = "https://www.bungie.net/7/en/User/Profile/2/4611686018443729606";


export function SettingsModal({open, onClose, bungieMembershipId, displayName,}: { open: boolean; onClose: () => void; bungieMembershipId?: string; displayName?: string; }) {
    const t = useTranslations("settings");
    const tCommon = useTranslations("common");
    // Les libellés d'onglets sont des clés complètes : un traducteur sans
    // espace de noms les lit toutes.
    const tRoot = useTranslations();
    const [category, setCategory] = useState<Category>("account");

    return (
        <Modal open={open} onClose={onClose} title={tCommon("settings")}>
            <header className="modal__header">
                <h2 className="modal__title"><Cog6ToothIcon/><span>{tCommon("settings")}</span></h2>
                <button
                    type="button"
                    className="modal__close"
                    onClick={onClose}
                    aria-label={t("close")}
                >
                    ×
                </button>
            </header>

            <div className="settings">
                {/* Colonne de gauche : catégories */}
                <nav className="settings__nav" aria-label={tCommon("settings")}>
                    {(Object.keys(CATEGORIES) as Category[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            aria-current={category === key}
                            className={`settings__nav-item${
                                category === key ? " settings__nav-item--active" : ""
                            }`}
                        >
                            {tRoot(CATEGORIES[key])}
                        </button>
                    ))}
                </nav>

                {/* Colonne de droite : options de la catégorie */}
                <div className="settings__panel">
                    {category === "account" && (
                        <AccountPanel
                            bungieMembershipId={bungieMembershipId}
                            displayName={displayName}
                        />
                    )}
                    {category === "appearance" && <AppearancePanel/>}
                    {category === "inventory" && <InventoryPanel/>}
                    {category === "search" && <SearchPanel/>}
                    {category === "about" && <AboutPanel/>}
                </div>
            </div>
        </Modal>
    );
}

/**
 * Onglet « Compte ».
 *
 * La synchronisation excepté, tout ici est irréversible : les deux effacements
 * passent donc par une confirmation. `window.confirm` suffit — il bloque, ce
 * qu'aucune modale maison ne fait, et l'enjeu ne mérite pas une seconde couche
 * de fenêtres par-dessus celle des paramètres.
 */
function AccountPanel({bungieMembershipId, displayName,}: { bungieMembershipId?: string; displayName?: string; }) {
    const t = useTranslations("settings.account");
    const tCommon = useTranslations("common");
    const syncEnabled = useSettings((s) => s.syncEnabled);
    const setSyncEnabled = useSettings((s) => s.setSyncEnabled);
    const [busy, setBusy] = useState(false);

    const toggleSync = (next: boolean) => {
        setSyncEnabled(next);
        // Les deux sens écrivent tout de suite, sans passer par le délai
        // d'inactivité de l'abonnement.
        //
        // **Activer, c'est désigner cet appareil comme source** : son état part
        // en base et écrase ce qui s'y trouvait. C'est le seul moment où le sens
        // s'inverse — partout ailleurs, la base prime. L'inverse écraserait
        // l'appareil sur lequel l'utilisateur vient d'agir, avec une sauvegarde
        // qu'il n'a peut-être jamais déposée.
        //
        // Couper, c'est baisser le drapeau du compte (`User.syncEnabled`),
        // sans quoi l'autre appareil continuerait de lire une sauvegarde que
        // celui-ci ne tient plus à jour.
        void pushSettings(next, {
            ...persistedSettings(useSettings.getState()),
            syncEnabled: next,
        });

        // Les groupes n'ont pas de drapeau à basculer : à l'activation leur
        // liste est déposée, à la coupure leur ligne est effacée. Le stockage
        // local garde la sienne — couper ne perd rien sur cet appareil.
        if (next) void pushGroups(useLoadoutGroups.getState().groups);
        else void deleteSyncedGroups();
    };

    const clearSync = async () => {
        if (!window.confirm(t("clearSyncConfirm"))) return;
        setBusy(true);
        await Promise.all([deleteSyncedSettings(), deleteSyncedGroups()]);
        setSyncEnabled(false);
        setBusy(false);
    };

    const clearAll = async () => {
        if (!window.confirm(t("deleteAllConfirm"))) return;
        setBusy(true);
        // Le filet part avec le reste : le garder ferait proposer, au
        // rechargement, de « récupérer » les groupes d'un compte effacé.
        clearRescue();
        // Rechargement complet, et non une navigation client : le compte parti,
        // la session ne désigne plus rien, et tout ce que les stores et le cache
        // de requêtes gardent en mémoire doit partir avec lui. La page rendra
        // alors l'écran de connexion.
        if (await deleteAccount()) window.location.reload();
        else setBusy(false);
    };

    return (
        <div className="settings__group">
            <SettingRow label={tCommon("logout")} hint={displayName}>
                <form action="/api/auth/logout" method="post">
                    <button type="submit" className="btn btn--small">
                        {tCommon("logout")}
                    </button>
                </form>
            </SettingRow>

            <SettingRow label={t("profile")}>
                <a
                    className="btn btn--small"
                    href={
                        bungieMembershipId
                            ? BUNGIE_PROFILE_URL(bungieMembershipId)
                            : "https://www.bungie.net/"
                    }
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {tCommon("open")}
                </a>
            </SettingRow>

            <SettingRow label={t("sync")} hint={t("syncHint")} htmlFor="setting-sync">
                <Toggle
                    id="setting-sync"
                    checked={syncEnabled}
                    onChange={toggleSync}
                    label={t("sync")}
                />
            </SettingRow>

            {/* Ce que la synchronisation a raté, et ce qu'un accident a
                emporté. Muettes tant qu'il n'y a rien à dire. */}
            <RecoveryRow/>

            {/* Le pendant hors ligne de la synchronisation : elle dépose l'état
                sur le serveur, ceux-ci le rendent au propriétaire. */}
            <BackupRows/>

            <SettingRow label={t("clearSync")} hint={t("clearSyncHint")}>
                <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={() => void clearSync()}
                    disabled={busy}
                >
                    {tCommon("delete")}
                </button>
            </SettingRow>

            <SettingRow label={t("deleteAll")} hint={t("deleteAllHint")}>
                <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={() => void clearAll()}
                    disabled={busy}
                >
                    {tCommon("delete")}
                </button>
            </SettingRow>
        </div>
    );
}

function AppearancePanel() {
    const t = useTranslations("settings.appearance");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const pathname = usePathname();
    const [pending, startTransition] = useTransition();

    const theme = useSettings((s) => s.theme);
    const setTheme = useSettings((s) => s.setTheme);
    const iconSize = useSettings((s) => s.iconSize);
    const setIconSize = useSettings((s) => s.setIconSize);
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const setVaultIconSize = useSettings((s) => s.setVaultIconSize);
    const showOrnaments = useSettings((s) => s.showOrnaments);
    const setShowOrnaments = useSettings((s) => s.setShowOrnaments);
    const showOriginalOnHover = useSettings((s) => s.showOriginalOnHover);
    const setShowOriginalOnHover = useSettings((s) => s.setShowOriginalOnHover);

    const changeLocale = (next: Locale) => {
        // Conserve le chemin courant en changeant seulement la langue
        startTransition(() => router.replace(pathname, {locale: next}));
    };

    return (
        <div className="settings__group">
            <SettingRow label={t("theme")} htmlFor="setting-theme">
                <Select<ThemePreference>
                    id="setting-theme"
                    value={theme}
                    onChange={setTheme}
                    options={[
                        {value: "light", label: t("themes.light")},
                        {value: "dark", label: t("themes.dark")},
                        {value: "system", label: t("themes.system")},
                    ]}
                />
            </SettingRow>

            <SettingRow label={t("language")} hint={t("languageHint")} htmlFor="setting-language">
                <Select<Locale>
                    id="setting-language"
                    value={locale}
                    onChange={changeLocale}
                    options={routing.locales.map((value) => ({
                        value,
                        label: LOCALE_LABELS[value],
                    }))}
                />
                {pending && <span className="settings__pending" aria-hidden/>}
            </SettingRow>

            <SettingRow
                label={t("ornaments")}
                hint={t("ornamentsHint")}
                htmlFor="setting-ornaments"
            >
                <Toggle
                    id="setting-ornaments"
                    checked={showOrnaments}
                    onChange={setShowOrnaments}
                    label={t("ornaments")}
                />
            </SettingRow>

            {/* Sans ornement affiché, il n'y a pas d'apparence à masquer : la
                ligne n'aurait aucun effet observable, on la retire plutôt que
                de la désactiver. */}
            {showOrnaments && (
                <SettingRow
                    label={t("originalOnHover")}
                    hint={t("originalOnHoverHint")}
                    htmlFor="setting-original-on-hover"
                >
                    <Toggle
                        id="setting-original-on-hover"
                        checked={showOriginalOnHover}
                        onChange={setShowOriginalOnHover}
                        label={t("originalOnHover")}
                    />
                </SettingRow>
            )}

            <SettingRow
                label={t("iconSize")}
                hint={t("iconSizeHint")}
                htmlFor="setting-icon-size"
            >
                <IconSizeControl
                    id="setting-icon-size"
                    value={iconSize}
                    onChange={setIconSize}
                    unitLabel={t("iconSize")}
                />
            </SettingRow>

            <SettingRow
                label={t("vaultIconSize")}
                hint={t("vaultIconSizeHint")}
                htmlFor="setting-vault-icon-size"
            >
                <IconSizeControl
                    id="setting-vault-icon-size"
                    value={vaultIconSize}
                    onChange={setVaultIconSize}
                    unitLabel={t("vaultIconSize")}
                />
            </SettingRow>
        </div>
    );
}

function InventoryPanel() {
    const t = useTranslations("settings.inventory");
    const tCriteria = useTranslations("criteria");
    const resetSorts = useSettings((s) => s.resetSorts);
    const weaponGrouping = useSettings((s) => s.weaponGrouping);
    const setWeaponGrouping = useSettings((s) => s.setWeaponGrouping);
    const armorGrouping = useSettings((s) => s.armorGrouping);
    const setArmorGrouping = useSettings((s) => s.setArmorGrouping);

    return (
        <div className="settings__group">
            {/* Regroupement : le coffre est toujours découpé par emplacement,
                seul le sous-groupe se règle — et un seul à la fois. */}
            <SettingRow
                label={t("weaponGrouping")}
                hint={t("groupingHint")}
                htmlFor="setting-weapon-grouping"
            >
                <Select<WeaponGrouping>
                    id="setting-weapon-grouping"
                    value={weaponGrouping}
                    onChange={setWeaponGrouping}
                    options={WEAPON_GROUPINGS.map((value) => ({
                        value,
                        label: tCriteria(value),
                    }))}
                />
            </SettingRow>

            <SettingRow
                label={t("armorGrouping")}
                htmlFor="setting-armor-grouping"
            >
                <Select<ArmorGrouping>
                    id="setting-armor-grouping"
                    value={armorGrouping}
                    onChange={setArmorGrouping}
                    options={ARMOR_GROUPINGS.map((value) => ({
                        value,
                        label: tCriteria(value),
                    }))}
                />
            </SettingRow>

            {/* Le tri occupe toute la largeur : la liste ordonnée ne tiendrait
                pas dans la colonne de droite d'une SettingRow. */}
            <div className="settings__block">
                <div className="setting-row__text">
                    <span className="setting-row__label">{t("sort")}</span>
                    <p className="setting-row__hint">{t("sortHint")}</p>
                </div>
                <SortRuleList/>
                <button
                    type="button"
                    className="btn btn--small"
                    onClick={resetSorts}
                >
                    {t("sortReset")}
                </button>
            </div>
        </div>
    );
}

/**
 * Onglet « Recherche ».
 *
 * Deux réglages seulement : la longueur de l'historique proposé sous la barre,
 * et ce qu'il advient des objets écartés. Le rappel de syntaxe qui suit évite
 * d'avoir à retenir les mots-clés — ce sont ceux de Destiny Item Manager.
 */
function SearchPanel() {
    const t = useTranslations("settings.search");
    const historySize = useSettings((s) => s.searchHistorySize);
    const setHistorySize = useSettings((s) => s.setSearchHistorySize);
    const missMode = useSettings((s) => s.searchMissMode);
    const setMissMode = useSettings((s) => s.setSearchMissMode);

    const examples = ["frenzy", "is:exotic is:strand", "stat:range:>=80", "basestat:weapons:30 and basestat:grenade:>=20"];

    return (
        <div className="settings__group">
            <SettingRow
                label={t("historySize")}
                hint={t("historySizeHint")}
                htmlFor="setting-search-history"
            >
                <input
                    id="setting-search-history"
                    type="number"
                    className="setting-number"
                    min={SEARCH_HISTORY_SIZE.min}
                    max={SEARCH_HISTORY_SIZE.max}
                    value={historySize}
                    onChange={(e) => setHistorySize(Number(e.target.value))}
                />
            </SettingRow>

            <SettingRow
                label={t("missMode")}
                hint={t("missModeHint")}
                htmlFor="setting-search-miss"
            >
                <Select<SearchMissMode>
                    id="setting-search-miss"
                    value={missMode}
                    onChange={setMissMode}
                    options={[
                        {value: "hide", label: t("missModes.hide")},
                        {value: "dim", label: t("missModes.dim")},
                    ]}
                />
            </SettingRow>

            <div className="settings__block">
                <div className="setting-row__text">
                    <span className="setting-row__label">{t("syntax")}</span>
                    <p className="setting-row__hint">{t("syntaxHint")}</p>
                </div>
                <ul className="settings__examples">
                    {examples.map((example) => (
                        <li key={example}>
                            <code>{example}</code>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function AboutPanel() {
    const t = useTranslations("settings.about");
    const tCommon = useTranslations("common");
    const tMenu = useTranslations("menu");
    const tAccount = useTranslations("settings.account");

    return (
        <div className="settings__group">
            <SettingRow label={t("version")}>
                <span className="settings__value">{APP_VERSION}</span>
            </SettingRow>

            <SettingRow label={t("discord")}>
                <a
                    className="btn btn--small"
                    href="https://discord.gg/Xz2BRVdGqr"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {tCommon("join")}
                </a>
            </SettingRow>

            <SettingRow label={tMenu("sourceCode")}>
                <a
                    className="btn btn--small"
                    href="https://github.com/BladedancerGG/BDT"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {tCommon("open")}
                </a>
            </SettingRow>

            <SettingRow label={t("support")}>
                <a className="btn btn--small" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                </a>
            </SettingRow>

            <SettingRow label={t("madeBy") + "Bladedancer#9791"}>
                <a
                    className="btn btn--small"
                    href="https://www.bungie.net/7/en/User/Profile/2/4611686018443729606"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {tAccount("profile")}
                </a>
            </SettingRow>
        </div>
    );
}
