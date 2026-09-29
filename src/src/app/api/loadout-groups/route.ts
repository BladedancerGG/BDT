import {NextResponse} from "next/server";
import {prisma} from "@/lib/db/prisma";
import {getSessionUserId} from "@/lib/auth/session";
import type {Prisma} from "@/generated/prisma/client";
import {isLoadoutGroupArray} from "@/lib/loadouts/groups/types";

/**
 * Groupes d'équipements synchronisés avec le compte Bungie.
 *
 * Le contenu est vérifié entrée par entrée, et non seulement plafonné comme
 * `/api/settings` : un réglage inconnu se dégrade en valeur par défaut, un
 * groupe illisible s'équipe. Autant le refuser au dépôt.
 *
 * Le plafond, lui, est bien plus haut que celui des préférences : un groupe
 * porte un instantané complet par emplacement, soit quelques dizaines de Ko à
 * lui seul.
 */
const MAX_BYTES = 512 * 1024;

/**
 * GET /api/loadout-groups — la sauvegarde du compte.
 *
 * `groups: null` n'est **pas** `groups: []`, et la distinction n'est pas
 * cosmétique : c'est elle qui manquait. La route rendait une liste vide faute de
 * ligne, le client la prenait pour la vérité du compte et remplaçait son
 * stockage local par elle — les groupes disparaissaient au rechargement suivant.
 * `null` dit « le compte ne sait rien », et `mergeGroups` garde alors le local.
 *
 * `updatedAt` est le second repère qui manquait : il date ce que le serveur a
 * vu, et permet de lire l'absence d'un groupe — supprimé ailleurs s'il est plus
 * ancien que le dépôt, créé depuis s'il est plus récent.
 */
export async function GET() {
    const userId = await getSessionUserId();
    if (!userId) {
        return NextResponse.json({error: "unauthenticated"}, {status: 401});
    }

    const row = await prisma.userLoadoutGroups.findUnique({where: {userId}});
    const groups = row?.data;

    // Une sauvegarde illisible est traitée comme absente, elle aussi : le client
    // garde son local et le redéposera, ce qui répare la ligne au passage.
    return NextResponse.json({
        groups: isLoadoutGroupArray(groups) ? groups : null,
        updatedAt: row?.updatedAt.getTime() ?? null,
    });
}

// PUT /api/loadout-groups — dépose la liste entière
export async function PUT(request: Request) {
    const userId = await getSessionUserId();
    if (!userId) {
        return NextResponse.json({error: "unauthenticated"}, {status: 401});
    }

    const body: unknown = await request.json().catch(() => null);
    const groups = (body as {groups?: unknown} | null)?.groups;
    if (!isLoadoutGroupArray(groups)) {
        return NextResponse.json({error: "invalid_groups"}, {status: 400});
    }

    const serialized = JSON.stringify(groups);
    if (serialized.length > MAX_BYTES) {
        return NextResponse.json({error: "groups_too_large"}, {status: 413});
    }

    // `InputJsonValue` ne reconnaît pas un tableau d'interfaces : ses variantes
    // d'objet exigent une signature d'index, qu'une interface nommée n'a pas.
    // La valeur est bien du JSON — elle vient d'être sérialisée ci-dessus.
    const data = groups as unknown as Prisma.InputJsonValue;

    const row = await prisma.userLoadoutGroups.upsert({
        where: {userId},
        create: {userId, data},
        update: {data},
    });

    // La date de la ligne repart avec la réponse : sans elle, le client
    // devrait deviner ce que le serveur vient d'enregistrer, et une relecture
    // ultérieure prendrait sa propre horloge pour référence.
    return NextResponse.json({ok: true, updatedAt: row.updatedAt.getTime()});
}

// POST — même chose que PUT. `navigator.sendBeacon` n'envoie qu'en POST, et
// c'est lui qui porte le dernier envoi quand la page se retire (voir
// `flushGroupsPush`) : sans cette entrée, la modification faite juste avant un
// rechargement n'arriverait jamais en base.
export const POST = PUT;

// DELETE /api/loadout-groups — efface la sauvegarde. Le stockage local garde la
// sienne : couper la synchronisation ne perd pas les groupes de cet appareil.
export async function DELETE() {
    const userId = await getSessionUserId();
    if (!userId) {
        return NextResponse.json({error: "unauthenticated"}, {status: 401});
    }

    await prisma.userLoadoutGroups.deleteMany({where: {userId}});
    return NextResponse.json({ok: true});
}
