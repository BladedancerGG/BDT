import { bungieFetch } from "./client";

// Réponse partielle de GetMembershipsForCurrentUser (voir bungie-api-ts pour
// le type complet UserMembershipData).
interface DestinyMembership {
  membershipType: number;
  membershipId: string;
  displayName: string;
  crossSaveOverride: number;
}

interface MembershipData {
  bungieNetUser: {
    membershipId: string;
    // Nom global Bungie ("Gardien") + code (#1234)
    cachedBungieGlobalDisplayName: string;
    cachedBungieGlobalDisplayNameCode: number;
  };
  destinyMemberships: DestinyMembership[];
  // Id de la membership principale en cas de cross-save
  primaryMembershipId?: string;
}

/** Récupère le nom Bungie affichable (ex: "Gardien#1234"). */
export async function getBungieDisplayName(
  accessToken: string,
): Promise<{ membershipId: string; displayName: string }> {
  const data = await bungieFetch<MembershipData>(
    "/User/GetMembershipsForCurrentUser/",
    { accessToken },
  );
  const { cachedBungieGlobalDisplayName, cachedBungieGlobalDisplayNameCode } =
    data.bungieNetUser;
  const code = String(cachedBungieGlobalDisplayNameCode).padStart(4, "0");
  return {
    membershipId: data.bungieNetUser.membershipId,
    displayName: `${cachedBungieGlobalDisplayName}#${code}`,
  };
}

/**
 * Membership principale déjà résolue, par access token.
 *
 * La plateforme d'un compte ne change pas ; sans ce cache, chaque déplacement
 * d'objet paierait un aller-retour Bungie de plus que l'action elle-même. La
 * clé est le token, qui expire au bout d'une heure : l'entrée devient
 * inatteignable d'elle-même au renouvellement.
 */
const membershipCache = new Map<
  string,
  { membershipType: number; membershipId: string }
>();

/**
 * Récupère la membership Destiny principale (gère le cross-save : si le compte
 * est lié, une seule plateforme fait autorité).
 */
export async function getPrimaryDestinyMembership(
  accessToken: string,
): Promise<{ membershipType: number; membershipId: string }> {
  const cached = membershipCache.get(accessToken);
  if (cached) return cached;

  const data = await bungieFetch<MembershipData>(
    "/User/GetMembershipsForCurrentUser/",
    { accessToken },
  );

  const memberships = data.destinyMemberships;
  if (!memberships?.length) {
    throw new Error("Aucune membership Destiny trouvée");
  }

  // En cross-save, primaryMembershipId désigne la plateforme qui fait autorité
  const primary =
    (data.primaryMembershipId &&
      memberships.find((m) => m.membershipId === data.primaryMembershipId)) ||
    memberships[0];

  const membership = {
    membershipType: primary.membershipType,
    membershipId: primary.membershipId,
  };
  membershipCache.set(accessToken, membership);
  return membership;
}
