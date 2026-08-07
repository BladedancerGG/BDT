import type {Metadata} from "next";
import type {CSSProperties} from "react";
import {NextIntlClientProvider, hasLocale} from "next-intl";
import {notFound} from "next/navigation";
import {routing} from "@/i18n/routing";
import {Providers} from "./providers";
import {SettingsEffects} from "@/lib/settings/SettingsEffects";
import {readPreferences} from "@/lib/settings/server";
import "@/scss/style.scss";

export const metadata: Metadata = {
    title: "Bladedancer's Destiny Tools",
    description: "A secret that will reveal itself in time",
};

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
            style={
                prefs.iconSize
                    ? ({"--item-size": `${prefs.iconSize}px`} as CSSProperties)
                    : undefined
            }
        >
            <body>
                <SettingsEffects/>
                {/* NextIntlClientProvider récupère messages/locale depuis le contexte
                    serveur fourni par le plugin next-intl */}
                <NextIntlClientProvider>
                    <Providers>{children}</Providers>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
