"use client";

import {useState, useTransition} from "react";
import {useLocale, useTranslations} from "next-intl";
import {usePathname, useRouter} from "@/i18n/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {Modal} from "@/components/ui/Modal";
import {SettingRow, Toggle, Select} from "@/components/ui/SettingRow";
import {IconSizeControl} from "./IconSizeControl";
import {SortRuleList} from "./SortRuleList";
import {
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
import {APP_VERSION, SUPPORT_EMAIL, BUNGIE_PROFILE_URL} from "@/lib/app-info";

type Category = "account" | "appearance" | "inventory" | "search" | "about";

const CATEGORIES: Category[] = [
    "account",
    "appearance",
    "inventory",
    "search",
    "about",
];

/** Noms des langues dans leur propre langue. */
const LOCALE_LABELS: Record<Locale, string> = {
    fr: "Français",
    en: "English",
};

export function SettingsModal({
                                  open,
                                  onClose,
                                  bungieMembershipId,
                              }: {
    open: boolean;
    onClose: () => void;
    bungieMembershipId?: string;
}) {
    const t = useTranslations("settings");
    const tAuth = useTranslations("auth");
    const [category, setCategory] = useState<Category>("account");

    return (
        <Modal open={open} onClose={onClose} title={t("title")}>
            <header className="modal__header">
                <h2 className="modal__title">{t("title")}</h2>
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
                <nav className="settings__nav" aria-label={t("title")}>
                    {CATEGORIES.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            aria-current={category === key}
                            className={`settings__nav-item${
                                category === key ? " settings__nav-item--active" : ""
                            }`}
                        >
                            {t(`categories.${key}`)}
                        </button>
                    ))}
                </nav>

                {/* Colonne de droite : options de la catégorie */}
                <div className="settings__panel">
                    {category === "account" && (
                        <AccountPanel
                            bungieMembershipId={bungieMembershipId}
                            logoutLabel={tAuth("logout")}
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

function AccountPanel({
                          bungieMembershipId,
                          logoutLabel,
                      }: {
    bungieMembershipId?: string;
    logoutLabel: string;
}) {
    const t = useTranslations("settings.account");

    return (
        <div className="settings__group">
            <SettingRow label={t("logout")}>
                <form action="/api/auth/logout" method="post">
                    <button type="submit" className="btn btn--small">
                        {logoutLabel}
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
                    {t("openProfile")}
                </a>
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
                        label: t(`weaponGroupings.${value}`),
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
                        label: t(`armorGroupings.${value}`),
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

    return (
        <div className="settings__group">
            <SettingRow label={t("version")}>
                <span className="settings__value">{APP_VERSION}</span>
            </SettingRow>

            <SettingRow label={t("support")}>
                <a className="btn btn--small" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                </a>
            </SettingRow>

            <SettingRow label={t("bungieApi")}>
                <a
                    className="btn btn--small"
                    href="https://github.com/Bungie-net/api"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {t("openLink")}
                </a>
            </SettingRow>
        </div>
    );
}
