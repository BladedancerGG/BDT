import { defineRouting } from "next-intl/routing";

export const locales = ["en", "fr"] as const;
export const defaultLocale = "en" as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
  // La langue par défaut n'est pas préfixée : "/" = EN, "/fr" = FR
  localePrefix: "as-needed",
  // L'URL seule décide de la langue. Avec la détection, le cookie NEXT_LOCALE
  // (posé au dernier changement) renvoyait "/" vers "/fr" : impossible alors
  // d'ouvrir l'application en anglais par son adresse.
  localeDetection: false,
});