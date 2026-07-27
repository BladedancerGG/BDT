import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Redirige "/" vers la langue par défaut, gère le préfixe de langue dans l'URL
export default createMiddleware(routing);

export const config = {
  // Ignore les routes API, les fichiers statiques et internes Next.js
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};