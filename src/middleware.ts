import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n";

// Redirige "/" vers "/fr", gère le préfixe de langue dans l'URL
export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});

export const config = {
  // Ignore les routes API, les fichiers statiques et internes Next.js
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
