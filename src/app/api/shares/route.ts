import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {prisma} from "@/lib/db/prisma";
import {getSessionUserId} from "@/lib/auth/session";
import type {Prisma} from "@/generated/prisma/client";
import {isSharedSnapshot, sharePath} from "@/lib/loadouts/share/types";

/**
 * Plafond d'un partage.
 *
 * Bien plus haut que celui des groupes : un partage est **autonome** — il porte
 * le détail complet de chaque objet (attributs, plugs équipables, objectifs),
 * là où un groupe ne garde que des identifiants d'instance à relire dans le
 * profil de son propriétaire.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Longueur de l'identifiant d'un partage, en octets tirés au sort.
 *
 * C'est la seule protection du lien : la page est publique et sans session,
 * n'importe qui muni de l'adresse la voit. Neuf octets font douze caractères en
 * base64url, soit 72 bits — hors de portée d'une énumération.
 */
const ID_BYTES = 9;

/**
 * POST /api/shares — dépose un instantané et rend son lien.
 *
 * Réservé aux comptes connectés : le partage porte le nom d'un auteur en base,
 * et un dépôt anonyme ferait de la route un hébergement ouvert.
 */
export async function POST(request: Request) {
    const userId = await getSessionUserId();
    if (!userId) {
        return NextResponse.json({error: "unauthenticated"}, {status: 401});
    }

    const body: unknown = await request.json().catch(() => null);
    const snapshot = (body as {snapshot?: unknown} | null)?.snapshot;
    if (!isSharedSnapshot(snapshot)) {
        return NextResponse.json({error: "invalid_snapshot"}, {status: 400});
    }

    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_BYTES) {
        return NextResponse.json({error: "snapshot_too_large"}, {status: 413});
    }

    // `InputJsonValue` ne reconnaît pas une interface nommée : ses variantes
    // d'objet exigent une signature d'index. La valeur est bien du JSON — elle
    // vient d'être sérialisée ci-dessus.
    const data = snapshot as unknown as Prisma.InputJsonValue;

    const id = randomBytes(ID_BYTES).toString("base64url");
    await prisma.sharedLoadout.create({
        data: {
            id,
            kind: snapshot.kind,
            name: snapshot.name,
            data,
            userId,
        },
    });

    // Le chemin est construit ici et non chez l'appelant : c'est la même
    // fonction qui sert aux pages, et le lien doit rester lisible même si le
    // groupe est renommé ensuite — le nom qu'il porte est celui du partage.
    return NextResponse.json({
        id,
        path: sharePath(snapshot.kind, id, snapshot.name),
    });
}
