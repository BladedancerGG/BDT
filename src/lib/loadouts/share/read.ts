// Lecture d'un partage, côté serveur.
//
// Les pages publiques interrogent la base directement plutôt qu'une route
// d'API : elles sont rendues sur le serveur, où la requête est déjà à portée —
// un aller-retour HTTP vers soi-même n'aurait rien apporté.

import {prisma} from "@/lib/db/prisma";
import {isSharedSnapshot, type ShareKind, type SharedSnapshot} from "./types";

/** Ce que la page publique montre : l'instantané, et qui l'a partagé. */
export interface Share {
    snapshot: SharedSnapshot;
    /**
     * Le nom Bungie de l'auteur, lu sur son compte et non figé dans
     * l'instantané : c'est une page qui dit « untel a partagé », et un nom qui
     * a changé depuis doit suivre.
     */
    author: string;
}

/**
 * L'instantané d'un partage, ou `null` s'il n'y en a pas à montrer.
 *
 * Le genre est vérifié en même temps que l'identifiant : les deux pages ne
 * savent pas dessiner la même chose, et un lien de groupe ouvert sur la page
 * d'un équipement n'aurait montré que son premier emplacement, en silence.
 *
 * Une ligne illisible — déposée par une version au format différent, ou abîmée
 * — est traitée comme absente : mieux vaut une page introuvable qu'un
 * équipement faux.
 */
export async function readShare(
    kind: ShareKind,
    id: string,
): Promise<Share | null> {
    const row = await prisma.sharedLoadout.findUnique({
        where: {id},
        include: {user: {select: {displayName: true}}},
    });
    if (!row || row.kind !== kind) return null;
    if (!isSharedSnapshot(row.data)) return null;
    return {snapshot: row.data, author: row.user.displayName};
}
