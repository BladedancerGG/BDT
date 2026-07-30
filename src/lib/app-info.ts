// Informations affichées dans la section « À propos » des paramètres.

/**
 * Version du site, injectée au build depuis package.json
 * (voir `env` dans next.config.ts).
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * Adresse de contact affichée dans « À propos ».
 * À remplacer par l'adresse que tu veux exposer publiquement.
 */
export const SUPPORT_EMAIL = "support@example.com";

/** Profil bungie.net d'un compte (254 = membership BungieNext). */
export function BUNGIE_PROFILE_URL(bungieMembershipId: string): string {
  return `https://www.bungie.net/7/fr/User/Profile/254/${bungieMembershipId}`;
}
