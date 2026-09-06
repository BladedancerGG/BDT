import type {Metadata} from "next";
import type {CSSProperties} from "react";
import {NextIntlClientProvider, hasLocale} from "next-intl";
import {notFound} from "next/navigation";
import {routing} from "@/i18n/routing";
import {Providers} from "./providers";
import {SettingsEffects} from "@/lib/settings/SettingsEffects";
import {SettingsSync} from "@/lib/settings/SettingsSync";
import {LoadoutGroupsSync} from "@/lib/loadouts/groups/LoadoutGroupsSync";
import {readPreferences, type ServerPreferences} from "@/lib/settings/server";
import "@/scss/style.scss";

export const metadata: Metadata = {
    title: "Bladedancer's Destiny Tools",
    description: "Personal tools used to manage stuff using the bungie.net Destiny 2 API",
};

/**
 * Variables de taille d'icônes à poser sur <html>, ou `undefined` si aucune
 * préférence n'est enregistrée — le SCSS garde alors ses valeurs par défaut.
 */
function rootSizeStyle(prefs: ServerPreferences): CSSProperties | undefined {
    const style: Record<string, string> = {};
    if (prefs.iconSize) style["--item-size"] = `${prefs.iconSize}px`;
    if (prefs.vaultIconSize) {
        style["--vault-item-size"] = `${prefs.vaultIconSize}px`;
    }
    return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

export function generateStaticParams() {
    return routing.locales.map((locale) => ({locale}));
}

export default async function RootLayout(
    {children, params,}:
    { children: React.ReactNode; params: Promise<{ locale: string }>; }
) {
    const {locale} = await params;
    if (!hasLocale(routing.locales, locale)) notFound();

    // Préférences lues dans le cookie et rendues directement dans le HTML :
    // pas de flash au chargement, pas d'écart d'hydratation, et surtout aucun
    // script inline — une balise <script> réapparaissait dans l'arbre client à
    // chaque changement de langue, ce que React signale.
    // En mode « système », `theme` est absent : la règle CSS
    // prefers-color-scheme prend alors le relais.
    const prefs = await readPreferences();

    return (
        <html
            lang={locale}
            data-theme={prefs.theme}
            style={rootSizeStyle(prefs)}
        >
            <body>
                {/* Avant SettingsEffects : c'est lui qui impose au store l'état
                    lu en base, celui-là même qui a servi à rendre ce HTML. */}
                <SettingsSync serverState={prefs.synced} serverSync={prefs.syncEnabled}/>
                <SettingsEffects/>
                {/* Après SettingsSync : c'est lui qui fixe `syncEnabled`, dont
                    dépend la relecture des groupes. Ceux-là ne descendent pas
                    avec le HTML — le serveur n'en a rien à faire au rendu, et
                    ils pèsent des dizaines de Ko. */}
                <LoadoutGroupsSync/>
                {/* NextIntlClientProvider récupère messages/locale depuis le contexte
                    serveur fourni par le plugin next-intl */}
                <NextIntlClientProvider>
                    <Providers>{children}</Providers>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
