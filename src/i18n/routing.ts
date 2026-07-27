import { defineRouting } from "next-intl/routing";

export const locales = ["en", "fr"] as const;
export const defaultLocale = "fr" as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
  // La langue par défaut n'est pas préfixée : "/" = FR, "/en" = EN
  localePrefix: "as-needed",
});