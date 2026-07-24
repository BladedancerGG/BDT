import { bungieFetch } from "./client";

// Réponse partielle de GetMembershipsForCurrentUser (voir bungie-api-ts pour
// le type complet UserMembershipData).
interface MembershipData {
  bungieNetUser: {
    membershipId: string;
    // Nom global Bungie ("Gardien") + code (#1234)
    cachedBungieGlobalDisplayName: string;
    cachedBungieGlobalDisplayNameCode: number;
  };
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
