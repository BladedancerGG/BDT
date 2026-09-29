// Informations affichées dans la section « À propos » des paramètres.

/**
 * Titre du site, affiché en tête du menu latéral et dans les métadonnées.
 * Ce module n'a pas de directive : il est lisible du serveur comme du client.
 */
export const APP_TITLE = "Bladedancer's Destiny Tools";

/**
 * Version du site, injectée au build depuis package.json
 * (voir `env` dans next.config.ts).
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * Adresse de contact affichée dans « À propos ».
 * À remplacer par l'adresse que tu veux exposer publiquement.
 */
export const SUPPORT_EMAIL = "contact@bladedancer.net";

/** Profil bungie.net d'un compte (254 = membership BungieNext). */
export function BUNGIE_PROFILE_URL(bungieMembershipId: string): string {
  return `https://www.bungie.net/7/fr/User/Profile/254/${bungieMembershipId}`;
}
