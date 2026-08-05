"use client";

import {useState, useTransition} from "react";
import {useLocale, useTranslations} from "next-intl";
import {usePathname, useRouter} from "@/i18n/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {Modal} from "@/components/ui/Modal";
import {SettingRow, Toggle, Select} from "@/components/ui/SettingRow";
import {IconSizeControl} from "./IconSizeControl";
import {useSettings, type ThemePreference} from "@/lib/settings/store";
import {APP_VERSION, SUPPORT_EMAIL, BUNGIE_PROFILE_URL} from "@/lib/app-info";

type Category = "account" | "appearance" | "inventory" | "about";

const CATEGORIES: Category[] = [
    "account",
    "appearance",
    "inventory",
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

            <SettingRow label={t("language")} htmlFor="setting-language">
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
        </div>
    );
}

function InventoryPanel() {
    const t = useTranslations("settings.inventory");
    const iconSize = useSettings((s) => s.iconSize);
    const setIconSize = useSettings((s) => s.setIconSize);
    const showOrnaments = useSettings((s) => s.showOrnaments);
    const setShowOrnaments = useSettings((s) => s.setShowOrnaments);

    return (
        <div className="settings__group">
            {/* Prévu, non encore implémenté */}
            <SettingRow label={t("sort")} hint={t("sortHint")}>
                <select className="select" disabled>
                    <option>{t("sortPlaceholder")}</option>
                </select>
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

            <SettingRow label={t("iconSize")} htmlFor="setting-icon-size">
                <IconSizeControl
                    value={iconSize}
                    onChange={setIconSize}
                    unitLabel={t("iconSize")}
                />
            </SettingRow>
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
