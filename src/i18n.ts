import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export const locales = ["en", "fr"] as const;
export const defaultLocale = "fr" as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale remplace le param "locale" (déprécié). C'est une Promise.
  const requested = await requestLocale;
  const locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : undefined;

  if (!locale) notFound();

  return {
    // Doit être renvoyé explicitement dans les versions récentes de next-intl
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
